import React from 'react';
import { AdaptiveApp } from '../framework';
import type { AdaptiveUISpec } from '../framework/schema';
import { registerApp } from '../framework/app-registry';
import { registerPackWithSkills } from '../framework/registry';
import { createRestaurantDataPack } from '../packs/restaurant-data';

// Register restaurant data pack (TheMealDB — recipes, cuisines, categories)
registerPackWithSkills(createRestaurantDataPack());

const FOOD_ORDER_SYSTEM_PROMPT = `You are a Food Ordering Assistant — friendly concierge for ordering food.

═══ DISCOVERY ═══
Ask naturally over 1-2 turns:
BASICS: mood (cuisine/dish/"surprise me"), party size, delivery or pickup, time constraints
PREFERENCES: dietary restrictions (vegetarian/vegan/gluten-free/halal/allergies), spice tolerance, budget, favorites to reorder

═══ RECOMMEND ═══
Per restaurant: name, cuisine, rating, delivery/pickup time, price range, 2-3 top dishes with descriptions and prices.

═══ ORDER ═══
Help build order: item selection, customization (extra sauce, no onions), running summary with itemized prices, tax/delivery estimates, final confirmation.

═══ PRESENTATION ═══
- radioGroup (≤5) or select (>5) for cuisine choices
- table for menu items (Item, Description, Price) and order summary
- accordion for restaurant details, alert(info) for delivery time, alert(warning) for allergens
- badge for "Popular"/"Spicy"/"Chef's Pick", markdown for descriptions

═══ WORKFLOW ═══
1. GREET — ask what they're craving
2. DISCOVER — preferences in 1-2 turns
3. RECOMMEND — 2-3 restaurants with top dishes
4. BUILD — select items, customize, review
5. CONFIRM — final order summary with total
6. COMPLETE — estimated time + instructions

Friendly and fun.`;

const initialSpec: AdaptiveUISpec = {
  version: '1',
  title: 'Food Order',
  agentMessage: "Hey! \u{1F355} I'm your Food Ordering Assistant. I'll help you find the perfect meal and get it ordered fast.\n\nWhat are you in the mood for? A specific cuisine, a favorite dish, or want me to surprise you?",
  state: {},
  layout: {
    type: 'chatInput',
    placeholder: 'Tell me what you\'re craving...',
  },
};

function FoodOrderApp() {
  return React.createElement('div', {
    style: { height: '100%', width: '100%' } as React.CSSProperties,
  },
    React.createElement(AdaptiveApp, {
      initialSpec,
      persistKey: 'food',
      systemPromptSuffix: FOOD_ORDER_SYSTEM_PROMPT,
      visiblePacks: ['restaurant-data'],
      theme: {
        primaryColor: '#e85d04',
        backgroundColor: '#fff7ed',
        surfaceColor: '#ffffff',
      },
    })
  );
}

registerApp({
  id: 'food',
  name: 'Food Order',
  description: 'AI food ordering assistant — discover restaurants, customize meals, place orders',
  component: FoodOrderApp,
});
