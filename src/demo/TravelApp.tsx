import React from 'react';
import { AdaptiveApp } from '../framework';
import type { AdaptiveUISpec } from '../framework/schema';
import { registerApp } from '../framework/app-registry';
import { registerPackWithSkills } from '../framework/registry';
import { createTravelDataPack } from '../packs/travel-data';
import { createGoogleMapsPack } from '../packs/google-maps';
import { createGoogleFlightsPack } from '../packs/google-flights';

// Register travel data pack (weather, currency, country info)
registerPackWithSkills(createTravelDataPack());
registerPackWithSkills(createGoogleMapsPack());
registerPackWithSkills(createGoogleFlightsPack());

// ─── Travel Planning Agent ───
// A non-technical demo that showcases Adaptive UI for consumer scenarios.
// The LLM acts as a travel concierge: discovers preferences, suggests destinations,
// builds day-by-day itineraries, and helps with booking decisions.

const TRAVEL_SYSTEM_PROMPT = `You are a Travel Concierge — friendly, knowledgeable travel advisor helping plan memorable trips.

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
- Show a googlePhotoCard hero image of the destination
- Show a countryInfoCard with the destination country info
- Show a weatherCard with current forecast
- Show a currencyConverter for the traveler's currency → local currency

PLACE DISCOVERY:
- Use google_places_search tool to find real hotels/restaurants/attractions with ratings — never invent names
- Use googleNearby component to let users browse restaurants/attractions near their hotel with photos
- Use googlePlacesSearch for hotel/landmark selection pickers

ITINERARY BUILDING:
- For each itinerary day, show a googleMaps with mode:"directions" and the day's stops as waypoints
- Use googlePhotoCard for key landmarks and restaurants in the itinerary
- Use google_place_details tool for opening hours and reviews of key recommendations

FLIGHTS:
- When departure city and dates are confirmed, show a flightSearch component for the user to see options
- Use flightCard in final itinerary summaries for quick booking reference
- Use 3-letter IATA airport codes (JFK, LAX, NRT, CDG, LHR, etc.)

FINALIZE:
- Generate a travelChecklist with weather-appropriate packing items + travel documents
- Show a currencyConverter for quick budget reference

═══ PRESENTATION ═══
- radioGroup/select for preferences, table for budgets, accordion for day-by-day
- alert(info) for pro tips, alert(warning) for notices, badge for "Must See"/"Hidden Gem"
- codeBlock(language:"markdown") with filename label for downloadable summaries
- Be specific: real restaurant names (verified via Places), real ratings, "local secret" tips

═══ WORKFLOW ═══
1. GREET — ask where they're dreaming of going
2. DISCOVER — preferences over 2-3 turns
3. SUGGEST — if "surprise me", propose 3 options with googlePhotoCard + countryInfoCard for each
4. PLAN — day-by-day itinerary with route maps, googleNearby for restaurants, weatherCard
5. REFINE — adjust on feedback
6. FINALIZE — downloadable summary + travelChecklist + currencyConverter

Enthusiastic but not overwhelming. Emojis sparingly.`;

const initialSpec: AdaptiveUISpec = {
  version: '1',
  title: 'Travel Concierge',
  agentMessage: "Hey there! ✈️ I'm your personal Travel Concierge. I help plan unforgettable trips — from hidden local gems to the perfect restaurant for sunset dinner.\n\nWhere are you dreaming of going? Or if you're open to ideas, tell me what kind of experience you're after and I'll surprise you!",
  state: {},
  layout: {
    type: 'chatInput',
    placeholder: 'Tell me about your dream trip...',
  },
};

function TravelPlannerApp() {
  return React.createElement('div', {
    style: { height: '100%', width: '100%' } as React.CSSProperties,
  },
    React.createElement(AdaptiveApp, {
      initialSpec,
      persistKey: 'travel',
      systemPromptSuffix: TRAVEL_SYSTEM_PROMPT,
      visiblePacks: ['travel-data', 'google-maps', 'google-flights'],
      theme: {
        primaryColor: '#059669',
        backgroundColor: '#f0fdf4',
        surfaceColor: '#ffffff',
      },
    })
  );
}

registerApp({
  id: 'travel',
  name: 'Travel Concierge',
  description: 'AI travel advisor — plan trips, discover destinations, build itineraries',
  component: TravelPlannerApp,
});
