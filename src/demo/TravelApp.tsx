import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AdaptiveApp } from '../framework';
import type { AdaptiveUISpec } from '../framework/schema';
import { registerApp } from '../framework/app-registry';
import { registerPackWithSkills, clearAllPacks, getActivePackScope, setActivePackScope } from '../framework/registry';
import { createTravelDataPack } from '../packs/travel-data';
import { createGoogleMapsPack } from '../packs/google-maps';
import { createGoogleFlightsPack } from '../packs/google-flights';
import { SessionsSidebar } from '../framework/components/SessionsSidebar';
import { ResizeHandle } from '../framework/components/ResizeHandle';
import { TripNotebook } from './TripNotebook';
import { generateSessionId, saveSession, deleteSession, setSessionScope } from '../framework/session-manager';
import { upsertArtifact, getArtifacts, subscribeArtifacts, loadArtifactsForSession, saveArtifactsForSession, deleteArtifactsForSession, setArtifactsScope } from '../framework/artifacts';
import './css/travel-theme.css';

// Lazy pack registration — called when this app mounts, clears other app's packs
function ensureTravelPacks() {
  if (getActivePackScope() === 'travel') return;
  clearAllPacks();
  registerPackWithSkills(createTravelDataPack());
  registerPackWithSkills(createGoogleMapsPack());
  registerPackWithSkills(createGoogleFlightsPack());
  setActivePackScope('travel');
}

// ─── Travel Planning Agent ───
// A non-technical demo that showcases Adaptive UI for consumer scenarios.
// The LLM acts as a travel concierge: discovers preferences, suggests destinations,
// builds day-by-day itineraries, and helps with booking decisions.

const TRAVEL_SYSTEM_PROMPT = `You are a Travel Notebook assistant — friendly, knowledgeable travel advisor helping plan memorable trips.
The user has a Trip Notebook panel on the right that auto-collects destinations, budget breakdowns, and itinerary files as you generate them.

═══ DISCOVERY ═══
Ask over 2-3 warm, conversational turns (don't dump all at once):

BASICS: destination (specific/region/"surprise me"), dates/flexibility, duration, travelers (solo/couple/family/group)
PREFERENCES: style (adventure/relaxation/cultural/foodie/romantic/backpacking), budget (budget/mid/luxury), must-see/must-do, avoid list, dietary/accessibility
LOGISTICS: departing from, flight suggestions needed?, hotel type (boutique/resort/Airbnb/hostel), rental car?

═══ PLANNING ═══
When ready, build detailed itinerary:
- Per day: morning/afternoon/evening activities, restaurant recs (cuisine + price), travel times, insider tips
- Overall: daily budget breakdown, packing list (weather-based), cultural etiquette, photo spots

═══ VISUAL EXPERIENCE ═══
Make every step visual and data-driven using the available components:

DESTINATION INTRO (when a destination is chosen):
- Use columns to pair related cards side by side — NEVER stack them vertically one after another
- Column 1: countryInfoCard + weatherCard in a columns layout
- Column 2: currencyConverter + googlePhotoCard hero image in a columns layout
- Example: {type:"columns", children:[{type:"countryInfoCard", country:"Egypt"}, {type:"weatherCard", city:"Cairo"}]}
- Then below: {type:"columns", children:[{type:"currencyConverter", from:"USD", to:"EGP"}, {type:"googlePhotoCard", query:"Cairo Egypt skyline"}]}

PLACE DISCOVERY:
- Use google_places_search tool to find real hotels/restaurants/attractions with ratings — never invent names
- Use googleNearby component to let users browse restaurants/attractions near their hotel with photos
- Use googlePlacesSearch for hotel/landmark selection pickers

ITINERARY BUILDING:
- For each itinerary day, use columns(sizes:["2","1"]) with googleMaps on the left and activity details on the right
- Use googlePhotoCard for key landmarks and restaurants in the itinerary
- Use google_place_details tool for opening hours and reviews of key recommendations

FLIGHTS:
- When departure city and dates are confirmed, show a flightSearch component for the user to see options
- Use flightCard in final itinerary summaries for quick booking reference
- Use 3-letter IATA airport codes (JFK, LAX, NRT, CDG, LHR, etc.)

BUDGET:
- Use budgetTracker component for cost breakdowns — it auto-saves to the Trip Notebook
- Include categories: flights, hotel, food, activities, transport, shopping
- Show budgetTracker whenever presenting cost estimates or after finalizing plans
- Example: {type:"budgetTracker", currency:"EUR", items:[{category:"flights", amount:800, note:"Round trip"},{category:"hotel", amount:1200, note:"4 nights"},{category:"food", amount:400},{category:"activities", amount:300}]}

FINALIZE:
- Use columns to pair travelChecklist + currencyConverter side by side
- Generate a travelChecklist with weather-appropriate packing items + travel documents
- Generate a codeBlock(language:"markdown") summary with a filename label — this saves as a downloadable itinerary file
- Show a final budgetTracker with all costs

═══ PRESENTATION ═══
- Use columns to pair related content side by side — e.g. {type:"columns", children:[weatherCard, currencyConverter]}
- When suggesting destinations, show 2 or 3 options in columns with a googlePhotoCard in each
- Pair a countryInfoCard next to a weatherCard, or a googleMaps next to a googleNearby
- columns(sizes:["2","1"]) for a main + sidebar layout (e.g. map on left, details on right)
- radioGroup/select for preferences, table for budgets, accordion for day-by-day
- alert(info) for pro tips, alert(warning) for notices, badge for "Must See"/"Hidden Gem"
- codeBlock(language:"markdown") with filename label for downloadable summaries — they auto-save to the notebook
- Be specific: real restaurant names (verified via Places), real ratings, "local secret" tips

═══ WORKFLOW ═══
1. GREET — ask where they're dreaming of going
2. DISCOVER — preferences over 2-3 turns
3. SUGGEST — if "surprise me", propose 2-3 options, each in columns: {type:"columns", children:[googlePhotoCard, countryInfoCard]} per option
4. PLAN — day-by-day itinerary with route maps, googleNearby for restaurants, weatherCard
5. BUDGET — show budgetTracker with estimated costs
6. REFINE — adjust on feedback
7. FINALIZE — downloadable itinerary summary + travelChecklist + currencyConverter + final budgetTracker

Enthusiastic but not overwhelming. Emojis sparingly.`;

const initialSpec: AdaptiveUISpec = {
  version: '1',
  title: 'Travel Notebook',
  agentMessage: "Hey there! ✈️ I'm your Travel Notebook assistant. I help plan unforgettable trips — from hidden local gems to the perfect restaurant for sunset dinner.\n\nWhere are you dreaming of going? Or if you're open to ideas, tell me what kind of experience you're after and I'll surprise you!",
  state: {},
  layout: {
    type: 'chatInput',
    placeholder: 'Tell me about your dream trip...',
  },
};

// ─── Code block extraction (reused from SolutionArchitectApp pattern) ───
interface CodeBlock { code: string; language: string; label?: string; }

function extractCodeBlocksFromLayout(node: any): CodeBlock[] {
  if (!node) return [];
  const blocks: CodeBlock[] = [];
  if ((node.type === 'codeBlock' || node.type === 'cb') && typeof node.code === 'string') {
    blocks.push({ code: node.code, language: node.language || '', label: node.label });
  }
  const kids: any[] = node.children || node.ch || [];
  for (const child of kids) blocks.push(...extractCodeBlocksFromLayout(child));
  if (Array.isArray(node.items)) {
    for (const item of node.items) blocks.push(...extractCodeBlocksFromLayout(item));
  }
  if (Array.isArray(node.tabs)) {
    for (const tab of node.tabs) {
      if (tab.children) for (const child of tab.children) blocks.push(...extractCodeBlocksFromLayout(child));
    }
  }
  return blocks;
}

// ─── Place extraction from layout ───
// Extract destination/place mentions from googlePhotoCard, googleMaps place nodes, countryInfoCard

interface PlaceRef { name: string; type: 'destination' | 'hotel' | 'restaurant' | 'attraction'; query: string; }

function extractPlacesFromLayout(node: any): PlaceRef[] {
  if (!node) return [];
  const places: PlaceRef[] = [];
  const nodeType = node.type || node.t;

  if (nodeType === 'countryInfoCard' && node.country) {
    places.push({ name: node.country, type: 'destination', query: node.country });
  }
  if (nodeType === 'googleMaps' && node.mode === 'place' && node.query) {
    places.push({ name: node.query, type: 'attraction', query: node.query });
  }

  const kids: any[] = node.children || node.ch || [];
  for (const child of kids) places.push(...extractPlacesFromLayout(child));
  if (Array.isArray(node.items)) {
    for (const item of node.items) places.push(...extractPlacesFromLayout(item));
  }
  if (Array.isArray(node.tabs)) {
    for (const tab of node.tabs) {
      if (tab.children) for (const child of tab.children) places.push(...extractPlacesFromLayout(child));
    }
  }
  return places;
}

// ─── Flight extraction ───
interface FlightRef { from: string; to: string; date: string; returnDate?: string; trip?: string; seat?: string; adults?: number; }

function extractFlightsFromLayout(node: any): FlightRef[] {
  if (!node) return [];
  const flights: FlightRef[] = [];
  const t = node.type || node.t;
  if ((t === 'flightSearch' || t === 'flightCard') && node.from && node.to && node.date) {
    flights.push({ from: node.from, to: node.to, date: node.date, returnDate: node.returnDate, trip: node.trip, seat: node.seat, adults: node.adults });
  }
  const kids: any[] = node.children || node.ch || [];
  for (const child of kids) flights.push(...extractFlightsFromLayout(child));
  if (Array.isArray(node.items)) for (const item of node.items) flights.push(...extractFlightsFromLayout(item));
  if (Array.isArray(node.tabs)) for (const tab of node.tabs) { if (tab.children) for (const child of tab.children) flights.push(...extractFlightsFromLayout(child)); }
  return flights;
}

// ─── Weather extraction ───
interface WeatherRef { city: string; }

function extractWeatherFromLayout(node: any): WeatherRef[] {
  if (!node) return [];
  const items: WeatherRef[] = [];
  const t = node.type || node.t;
  if (t === 'weatherCard' && node.city) {
    items.push({ city: node.city });
  }
  const kids: any[] = node.children || node.ch || [];
  for (const child of kids) items.push(...extractWeatherFromLayout(child));
  if (Array.isArray(node.items)) for (const item of node.items) items.push(...extractWeatherFromLayout(item));
  if (Array.isArray(node.tabs)) for (const tab of node.tabs) { if (tab.children) for (const child of tab.children) items.push(...extractWeatherFromLayout(child)); }
  return items;
}

// ─── Checklist extraction ───
interface ChecklistRef { title: string; items: string[]; bind: string; }

function extractChecklistsFromLayout(node: any): ChecklistRef[] {
  if (!node) return [];
  const lists: ChecklistRef[] = [];
  const t = node.type || node.t;
  if (t === 'travelChecklist' && node.items) {
    const items = Array.isArray(node.items) ? node.items : (typeof node.items === 'string' ? node.items.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
    lists.push({ title: node.title || 'Checklist', items, bind: node.bind || '' });
  }
  const kids: any[] = node.children || node.ch || [];
  for (const child of kids) lists.push(...extractChecklistsFromLayout(child));
  if (Array.isArray(node.items)) for (const item of node.items) lists.push(...extractChecklistsFromLayout(item));
  if (Array.isArray(node.tabs)) for (const tab of node.tabs) { if (tab.children) for (const child of tab.children) lists.push(...extractChecklistsFromLayout(child)); }
  return lists;
}

// ─── Photo extraction ───
interface PhotoRef { query: string; caption?: string; }

function extractPhotosFromLayout(node: any): PhotoRef[] {
  if (!node) return [];
  const photos: PhotoRef[] = [];
  const t = node.type || node.t;
  if (t === 'googlePhotoCard' && node.query) {
    photos.push({ query: node.query, caption: node.caption });
  }
  const kids: any[] = node.children || node.ch || [];
  for (const child of kids) photos.push(...extractPhotosFromLayout(child));
  if (Array.isArray(node.items)) for (const item of node.items) photos.push(...extractPhotosFromLayout(item));
  if (Array.isArray(node.tabs)) for (const tab of node.tabs) { if (tab.children) for (const child of tab.children) photos.push(...extractPhotosFromLayout(child)); }
  return photos;
}

function TravelPlannerApp() {
  // Scope sessions, artifacts, and packs to this app
  setSessionScope('travel');
  setArtifactsScope('travel');
  ensureTravelPacks();

  // ─── Session management ───
  const [sessionId, setSessionId] = useState(() => {
    try {
      return localStorage.getItem('adaptive-ui-travel-session') || generateSessionId();
    } catch { return generateSessionId(); }
  });

  const sendPromptRef = useRef<((prompt: string) => void) | null>(null);

  // Load artifacts for initial session on mount
  const initialLoadRef = useRef(false);
  if (!initialLoadRef.current) {
    initialLoadRef.current = true;
    loadArtifactsForSession(sessionId);
  }

  // ─── Panel widths ───
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [notebookWidth, setNotebookWidth] = useState(580);
  const [notebookCollapsed, setNotebookCollapsed] = useState(false);

  const handleSidebarResize = useCallback((delta: number) => {
    setSidebarWidth((w) => Math.max(160, Math.min(360, w + delta)));
  }, []);
  const handleNotebookResize = useCallback((delta: number) => {
    setNotebookWidth((w) => Math.max(250, Math.min(600, w - delta)));
  }, []);

  // ─── Spec change handler: extract data → artifacts ───
  const handleSpecChange = useCallback((spec: AdaptiveUISpec) => {
    // Extract places
    const places = extractPlacesFromLayout(spec.layout);
    for (const place of places) {
      const slug = place.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
      upsertArtifact(`place-${slug}`, JSON.stringify(place), 'json', place.name);
    }

    // Extract flights
    const flights = extractFlightsFromLayout(spec.layout);
    for (const flight of flights) {
      const slug = `${flight.from}-${flight.to}-${flight.date}`.toLowerCase();
      upsertArtifact(`flight-${slug}`, JSON.stringify(flight), 'json', `${flight.from} \u2192 ${flight.to}`);
    }

    // Extract weather
    const weather = extractWeatherFromLayout(spec.layout);
    for (const w of weather) {
      const slug = w.city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
      upsertArtifact(`weather-${slug}`, JSON.stringify(w), 'json', w.city);
    }

    // Extract checklists
    const checklists = extractChecklistsFromLayout(spec.layout);
    for (const cl of checklists) {
      const slug = cl.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
      upsertArtifact(`checklist-${slug}`, JSON.stringify(cl), 'json', cl.title);
    }

    // Extract photos
    const photos = extractPhotosFromLayout(spec.layout);
    for (const photo of photos) {
      const slug = photo.query.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
      upsertArtifact(`photo-${slug}`, JSON.stringify(photo), 'json', photo.caption || photo.query);
    }

    // Extract code blocks (itinerary summaries, etc.)
    const codeBlocks = extractCodeBlocksFromLayout(spec.layout);
    for (const block of codeBlocks) {
      if (block.label) {
        const filename = block.label.includes('.') ? block.label : `${block.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${block.language || 'md'}`;
        upsertArtifact(filename, block.code, block.language, block.label);
      }
    }
  }, []);

  // ─── Session management handlers ───
  const handleNewSession = useCallback(() => {
    saveArtifactsForSession(sessionId);
    try {
      const raw = localStorage.getItem(`adaptive-ui-turns-${sessionId}`);
      if (raw) {
        const { turns } = JSON.parse(raw);
        if (turns && turns.length > 1) {
          const name = turns[turns.length - 1]?.agentSpec?.title || 'Trip';
          saveSession(sessionId, name, turns);
        }
      }
    } catch {}

    const newId = generateSessionId();
    setSessionId(newId);
    try { localStorage.setItem('adaptive-ui-travel-session', newId); } catch {}
    saveSession(newId, 'New trip', []);
    loadArtifactsForSession(newId);
  }, [sessionId]);

  const handleSelectSession = useCallback((id: string) => {
    saveArtifactsForSession(sessionId);
    setSessionId(id);
    loadArtifactsForSession(id);
    try { localStorage.setItem('adaptive-ui-travel-session', id); } catch {}
  }, [sessionId]);

  const handleDeleteSession = useCallback((id: string) => {
    deleteSession(id);
    deleteArtifactsForSession(id);
    if (id === sessionId) {
      const newId = generateSessionId();
      setSessionId(newId);
      saveSession(newId, 'New trip', []);
      loadArtifactsForSession(newId);
      try { localStorage.setItem('adaptive-ui-travel-session', newId); } catch {}
    }
  }, [sessionId]);

  const handleSpecChangeWithSave = useCallback((spec: AdaptiveUISpec) => {
    handleSpecChange(spec);
    const name = spec.title || spec.agentMessage?.slice(0, 40) || 'Trip';
    try {
      const raw = localStorage.getItem(`adaptive-ui-turns-${sessionId}`);
      if (raw) {
        const { turns } = JSON.parse(raw);
        saveSession(sessionId, name, turns);
      }
    } catch {}
  }, [sessionId, handleSpecChange]);

  // Randomize the greeting tagline on mount
  const [tagline] = useState(() => {
    const lines = [
      'Where shall we wander next?',
      'Your next adventure starts here',
      'Dream it. Plan it. Live it.',
      'The world is waiting for you',
      'Let\u2019s plan something unforgettable',
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  });

  // Clock showing current local time
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return React.createElement('div', {
    className: 'travel-shell',
    style: {
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    } as React.CSSProperties,
  },

    // ── Branded header strip ──
    React.createElement('div', {
      className: 'travel-header',
      style: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 20px',
        flexShrink: 0,
      } as React.CSSProperties,
    },
      // Left: logo + title
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', gap: '10px' },
      },
        React.createElement('span', { className: 'travel-header-icon' }, '\u2708\uFE0F'),
        React.createElement('div', null,
          React.createElement('div', { className: 'travel-header-title' }, 'Travel Notebook'),
          React.createElement('div', { className: 'travel-header-subtitle' }, tagline)
        )
      ),
      // Right: time
      React.createElement('div', {
        style: {
          fontSize: '13px',
          color: 'rgba(255,255,255,0.6)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.02em',
        },
      }, timeStr)
    ),

    // ── Main 3-panel layout ──
    React.createElement('div', {
      style: {
        flex: 1,
        minHeight: 0,
        display: 'flex',
        overflow: 'hidden',
        padding: '0 0 0 0',
      } as React.CSSProperties,
    },

      // ─ Left: Sessions sidebar ─
      React.createElement('div', {
        className: 'travel-app',
        style: {
          width: sidebarCollapsed ? '36px' : `${sidebarWidth}px`,
          flexShrink: 0, overflow: 'hidden',
          transition: 'width 0.15s ease',
          margin: '8px 0 8px 8px',
          borderRadius: '16px 0 0 16px',
        } as React.CSSProperties,
      },
        React.createElement(SessionsSidebar, {
          activeSessionId: sessionId,
          onSelectSession: handleSelectSession,
          onNewSession: handleNewSession,
          onDeleteSession: handleDeleteSession,
          selectedFileId: null,
          onSelectFile: () => {},
          collapsed: sidebarCollapsed,
          onToggleCollapse: setSidebarCollapsed,
          sessionsLabel: 'Trips',
          hideFiles: true,
        })
      ),

      // Resize handle: sidebar ↔ chat
      !sidebarCollapsed && React.createElement(ResizeHandle, { direction: 'vertical', onResize: handleSidebarResize }),

      // ─ Center: Chat ─
      React.createElement('div', {
        className: 'travel-chat-container travel-app',
        style: {
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          margin: '8px 0',
          borderRadius: '0',
        } as React.CSSProperties,
      },
        React.createElement(AdaptiveApp, {
          key: sessionId,
          initialSpec,
          persistKey: sessionId,
          sendPromptRef,
          systemPromptSuffix: TRAVEL_SYSTEM_PROMPT,
          visiblePacks: ['travel-data', 'google-maps', 'google-flights'],
          theme: {
            primaryColor: '#0891b2',
            backgroundColor: 'transparent',
            surfaceColor: 'rgba(255, 255, 255, 0.95)',
          },
          onSpecChange: handleSpecChangeWithSave,
        })
      ),

      // Resize handle: chat ↔ notebook
      !notebookCollapsed && React.createElement(ResizeHandle, { direction: 'vertical', onResize: handleNotebookResize }),

      // ─ Right: Trip Notebook ─
      React.createElement('div', {
        className: 'travel-app',
        style: {
          width: notebookCollapsed ? '36px' : `${notebookWidth}px`,
          flexShrink: 0, overflow: 'hidden',
          transition: 'width 0.15s ease',
          margin: '8px 8px 8px 0',
          borderRadius: '0 16px 16px 0',
        } as React.CSSProperties,
      },
        React.createElement(TripNotebook, {
          collapsed: notebookCollapsed,
          onToggleCollapse: setNotebookCollapsed,
        })
      )
    )
  );
}

registerApp({
  id: 'travel',
  name: 'Travel Notebook',
  description: 'AI travel planner — plan trips, discover destinations, build itineraries',
  component: TravelPlannerApp,
});
