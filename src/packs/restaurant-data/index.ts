import type { ComponentPack } from '../../framework/registry';
import { trackedFetch } from '../../framework/request-tracker';

// ─── Restaurant Data Pack ───
// Provides meal and recipe data via TheMealDB (free, no API key needed):
// - Search meals by name
// - Browse meals by cuisine/area
// - Browse meals by category (Beef, Chicken, Seafood, Vegetarian, etc.)
// - Get full recipe details (ingredients, instructions, image)
// All are tools — the LLM needs to see the data to make recommendations.

const BASE_URL = 'https://www.themealdb.com/api/json/v1/1';

const RESTAURANT_DATA_PROMPT = `
RESTAURANT DATA PACK:

Real meal/recipe data via TheMealDB. Use for concrete recommendations.

TOOLS:
- search_meals: Search by name ("chicken curry", "pasta"). Returns meals with name, category, area, image, ID.
- browse_by_area: Meals from a cuisine ("Japanese", "Mexican").
- browse_by_category: Meals by type ("Seafood", "Vegetarian", "Dessert").
- get_meal_details: Full recipe by meal ID — ingredients, instructions, image. Use after search/browse.
- list_categories: All available categories with descriptions.
- list_areas: All available cuisine areas.

RULES:
- ALWAYS search/browse when recommending — use real data, don't invent dishes.
- Use get_meal_details for full recipes when user picks a dish.
- Use list_categories/list_areas for "what's available?" or "surprise me".
- Show meal images from thumbnail URLs. Present ingredients with quantities.
- Mention cuisine origin. Include category/area tags when showing multiple options.
`;


/** Slim a meal search/browse result to essential fields */
function slimMealList(meals: any[] | null): any[] {
  if (!meals) return [];
  return meals.slice(0, 10).map((m: any) => ({
    id: m.idMeal,
    name: m.strMeal,
    category: m.strCategory || undefined,
    area: m.strArea || undefined,
    image: m.strMealThumb || undefined,
  }));
}

/** Extract ingredients + measures from a full meal object */
function extractIngredients(meal: any): Array<{ ingredient: string; measure: string }> {
  const ingredients: Array<{ ingredient: string; measure: string }> = [];
  for (let i = 1; i <= 20; i++) {
    const ing = meal[`strIngredient${i}`];
    const measure = meal[`strMeasure${i}`];
    if (ing && ing.trim()) {
      ingredients.push({ ingredient: ing.trim(), measure: (measure || '').trim() });
    }
  }
  return ingredients;
}

/** Slim a full meal detail response */
function slimMealDetail(meal: any): any {
  return {
    id: meal.idMeal,
    name: meal.strMeal,
    category: meal.strCategory,
    area: meal.strArea,
    instructions: meal.strInstructions,
    image: meal.strMealThumb,
    tags: meal.strTags || null,
    youtube: meal.strYoutube || null,
    ingredients: extractIngredients(meal),
  };
}

export function createRestaurantDataPack(): ComponentPack {
  return {
    name: 'restaurant-data',
    displayName: 'Restaurant Data',
    components: {},
    systemPrompt: RESTAURANT_DATA_PROMPT,
    tools: [
      // ─── Search Meals Tool ───
      {
        definition: {
          type: 'function' as const,
          function: {
            name: 'search_meals',
            description: 'Search meals by name. Returns matching meals with name, category, cuisine area, and image. Use when the user mentions a specific dish or keyword.',
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Meal name or keyword to search (e.g., "pasta", "chicken curry", "pad thai")',
                },
              },
              required: ['query'],
            },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          const query = encodeURIComponent(String(args.query));
          try {
            const res = await trackedFetch(`${BASE_URL}/search.php?s=${query}`);
            if (!res.ok) return `MealDB API error: ${res.status}`;
            const data = await res.json();
            const meals = slimMealList(data.meals);
            if (meals.length === 0) return `No meals found matching "${args.query}". Try a different search term.`;
            return JSON.stringify({ results: meals, count: meals.length }, null, 2);
          } catch (err) {
            return `Failed to search meals: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },

      // ─── Browse by Area Tool ───
      {
        definition: {
          type: 'function' as const,
          function: {
            name: 'browse_by_area',
            description: 'List meals from a specific cuisine area (e.g., Italian, Japanese, Mexican). Returns meals with name, image, and ID.',
            parameters: {
              type: 'object',
              properties: {
                area: {
                  type: 'string',
                  description: 'Cuisine area name (e.g., "Italian", "Japanese", "Mexican", "Indian", "Chinese")',
                },
              },
              required: ['area'],
            },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          const area = encodeURIComponent(String(args.area));
          try {
            const res = await trackedFetch(`${BASE_URL}/filter.php?a=${area}`);
            if (!res.ok) return `MealDB API error: ${res.status}`;
            const data = await res.json();
            const meals = slimMealList(data.meals);
            if (meals.length === 0) return `No meals found for area "${args.area}". Use list_areas to see available cuisines.`;
            return JSON.stringify({ area: args.area, results: meals, count: meals.length }, null, 2);
          } catch (err) {
            return `Failed to browse by area: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },

      // ─── Browse by Category Tool ───
      {
        definition: {
          type: 'function' as const,
          function: {
            name: 'browse_by_category',
            description: 'List meals in a food category (e.g., Beef, Chicken, Seafood, Vegetarian, Dessert). Returns meals with name, image, and ID.',
            parameters: {
              type: 'object',
              properties: {
                category: {
                  type: 'string',
                  description: 'Meal category (e.g., "Beef", "Chicken", "Seafood", "Vegetarian", "Dessert", "Pasta", "Pork", "Lamb")',
                },
              },
              required: ['category'],
            },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          const category = encodeURIComponent(String(args.category));
          try {
            const res = await trackedFetch(`${BASE_URL}/filter.php?c=${category}`);
            if (!res.ok) return `MealDB API error: ${res.status}`;
            const data = await res.json();
            const meals = slimMealList(data.meals);
            if (meals.length === 0) return `No meals found for category "${args.category}". Use list_categories to see available categories.`;
            return JSON.stringify({ category: args.category, results: meals, count: meals.length }, null, 2);
          } catch (err) {
            return `Failed to browse by category: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },

      // ─── Get Meal Details Tool ───
      {
        definition: {
          type: 'function' as const,
          function: {
            name: 'get_meal_details',
            description: 'Get full recipe details for a specific meal by ID. Returns ingredients with quantities, cooking instructions, image URL, and tags. Use after finding a meal via search or browse.',
            parameters: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'Meal ID from a previous search or browse result (e.g., "52772")',
                },
              },
              required: ['id'],
            },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          const id = encodeURIComponent(String(args.id));
          try {
            const res = await trackedFetch(`${BASE_URL}/lookup.php?i=${id}`);
            if (!res.ok) return `MealDB API error: ${res.status}`;
            const data = await res.json();
            if (!data.meals || data.meals.length === 0) return `Meal with ID "${args.id}" not found.`;
            return JSON.stringify(slimMealDetail(data.meals[0]), null, 2);
          } catch (err) {
            return `Failed to get meal details: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },

      // ─── List Categories Tool ───
      {
        definition: {
          type: 'function' as const,
          function: {
            name: 'list_categories',
            description: 'List all available meal categories with descriptions. Use when the user wants to know what types of food are available.',
            parameters: {
              type: 'object',
              properties: {},
            },
          },
        },
        handler: async () => {
          try {
            const res = await trackedFetch(`${BASE_URL}/categories.php`);
            if (!res.ok) return `MealDB API error: ${res.status}`;
            const data = await res.json();
            const categories = (data.categories || []).map((c: any) => ({
              name: c.strCategory,
              description: c.strCategoryDescription ? c.strCategoryDescription.slice(0, 120) : null,
            }));
            return JSON.stringify({ categories, count: categories.length }, null, 2);
          } catch (err) {
            return `Failed to list categories: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },

      // ─── List Areas Tool ───
      {
        definition: {
          type: 'function' as const,
          function: {
            name: 'list_areas',
            description: 'List all available cuisine areas (e.g., Italian, Japanese, Mexican). Use when the user wants to know what cuisines are available.',
            parameters: {
              type: 'object',
              properties: {},
            },
          },
        },
        handler: async () => {
          try {
            const res = await trackedFetch(`${BASE_URL}/list.php?a=list`);
            if (!res.ok) return `MealDB API error: ${res.status}`;
            const data = await res.json();
            const areas = (data.meals || []).map((a: any) => a.strArea);
            return JSON.stringify({ areas, count: areas.length }, null, 2);
          } catch (err) {
            return `Failed to list areas: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },
    ],
  };
}
