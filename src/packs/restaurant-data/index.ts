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

You have access to real meal and recipe data via TheMealDB. Use these tools to give concrete, real recommendations.

TOOLS (called during inference):
- search_meals: Search meals by name.
  Use when the user mentions a specific dish or keyword.
  Example: search_meals({ query: "chicken curry" })
  Returns: list of matching meals with name, category, area (cuisine), image, and ID.

- browse_by_area: List meals from a specific cuisine/area.
  Use when the user wants food from a specific region or country.
  Example: browse_by_area({ area: "Japanese" })
  Returns: list of meals from that cuisine.

- browse_by_category: List meals in a category.
  Use when the user wants a type of food (beef, seafood, vegetarian, dessert, etc.).
  Example: browse_by_category({ category: "Seafood" })
  Returns: list of meals in that category.

- get_meal_details: Get full recipe details by meal ID.
  Use after finding a meal via search or browse — to show ingredients, instructions, and image.
  Example: get_meal_details({ id: "52772" })
  Returns: full recipe with ingredients list, quantities, cooking instructions, and image URL.

- list_categories: List all available meal categories.
  Use when you need to show the user what types of food are available.
  Returns: list of categories with descriptions.

- list_areas: List all available cuisine areas.
  Use when you need to show what cuisines are available.
  Returns: list of area names (e.g., "Italian", "Japanese", "Mexican").

WHEN TO USE TOOLS:
- ALWAYS search or browse when recommending dishes — use real meal data, don't make up menu items
- Use get_meal_details to show full recipes when the user picks a dish
- Use list_categories or list_areas when the user says "what's available?" or "surprise me"
- Combine results: browse_by_area for cuisine, then get_meal_details for the specific dish

PRESENTING DATA:
- Show meal images using the thumbnail URLs from the API
- Present ingredients as a clear list with quantities
- Mention the cuisine origin: "This is a classic Japanese dish..."
- When showing multiple options, include the category and area tags
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
