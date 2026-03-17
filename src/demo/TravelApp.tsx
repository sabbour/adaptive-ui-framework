import React from 'react';
import { AdaptiveApp } from '../framework';
import type { AdaptiveUISpec } from '../framework/schema';
import { registerApp } from '../framework/app-registry';
import { registerPackWithSkills } from '../framework/registry';
import { createTravelDataPack } from '../packs/travel-data';

// Register travel data pack (weather, currency, country info)
registerPackWithSkills(createTravelDataPack());

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

═══ PRESENTATION ═══
- radioGroup/select for preferences, table for budgets, accordion for day-by-day
- alert(info) for pro tips, alert(warning) for notices, badge for "Must See"/"Hidden Gem"
- codeBlock(language:"markdown") with filename label for downloadable summaries
- Be specific: real restaurant names, dish recommendations, "local secret" tips

═══ WORKFLOW ═══
1. GREET — ask where they're dreaming of going
2. DISCOVER — preferences over 2-3 turns
3. SUGGEST — if "surprise me", propose 3 options with pros/cons
4. PLAN — day-by-day itinerary
5. REFINE — adjust on feedback
6. FINALIZE — downloadable summary + packing list

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
      visiblePacks: ['travel-data'],
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
