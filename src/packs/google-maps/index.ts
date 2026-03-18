import type { ComponentPack } from '../../framework/registry';
import { GoogleMapsEmbed, GooglePlacesSearch, GoogleNearby, GooglePhotoCard } from './components';
import { GoogleMapsSettings, getStoredApiKey } from './GoogleMapsSettings';

const GOOGLE_MAPS_SYSTEM_PROMPT = `
GOOGLE MAPS PACK:

TOOLS (inference-time, LLM sees results):
- google_places_search: Search for places by text query. Returns name, address, rating, price level, coordinates. Use when you need real data to reason about. Do NOT use for selection lists — use googleNearby or googlePlacesSearch component instead.
- google_place_details: Get detailed info about a specific place by place ID. Returns hours, phone, website, reviews.
- google_geocode: Convert address/place name to lat,lng coordinates. Use when you need coordinates for mode:"view" or mode:"streetview".

COMPONENTS (use in "ask" or "show"):

googleMaps — {mode?, query?, origin?, destination?, center?, zoom?, mapType?, height?, waypoints?, travelMode?}
  Embeds an interactive Google Map. Modes:
  - place: Show a place pin. Example: {type:"googleMaps", mode:"place", query:"Eiffel Tower, Paris"}
  - search: Search results on a map. Example: {type:"googleMaps", mode:"search", query:"restaurants near {{state.location}}"}
  - directions: Route with waypoints. Example: {type:"googleMaps", mode:"directions", origin:"hotel", destination:"last stop", waypoints:"stop1|stop2", travelMode:"driving"}
  - view: Map area. Example: {type:"googleMaps", mode:"view", center:"48.858,2.294", zoom:15, mapType:"satellite"}
  - streetview: Street view. Example: {type:"googleMaps", mode:"streetview", center:"48.858,2.294"}

googlePlacesSearch — {query, bind, label?}
  Searchable list from Places API. User clicks to select.
  Example: {type:"googlePlacesSearch", query:"hotels in {{state.destination}}", bind:"hotel", label:"Choose a hotel"}

googleNearby — {location, bind, placeType?, label?, maxResults?}
  Visual grid of nearby places with PHOTOS, ratings, and price levels. Much richer than googlePlacesSearch.
  placeType: restaurant, hotel, museum, cafe, bar, tourist_attraction, shopping_mall, spa
  Example: {type:"googleNearby", location:"{{state.hotel}}", placeType:"restaurant", bind:"dinner", label:"Restaurants near your hotel", maxResults:6}

googlePhotoCard — {query, caption?, height?}
  Beautiful photo card with place name, rating, and address overlay. Hero image for destinations.
  Example: {type:"googlePhotoCard", query:"Grand Bazaar, Istanbul", caption:"One of the world's oldest covered markets"}

WHEN TO USE:
- google_places_search TOOL: LLM needs real data to reason about (ratings, prices for recommendations)
- googleNearby COMPONENT: visual browsing with photo cards (best for "what's nearby?" or "find restaurants")
- googlePlacesSearch COMPONENT: simple text-based selection list
- googlePhotoCard COMPONENT: hero images for destinations, hotels, landmarks
- googleMaps COMPONENT: maps for locations, routes, areas

BEST PRACTICES:
- Start destination introductions with googlePhotoCard for visual impact
- Use googleNearby with placeType for browsing restaurants/attractions near the hotel
- Show day-by-day routes with mode:"directions" and waypoints
- Use mode:"streetview" for hotel entrance or scenic viewpoint previews
- Pair googlePhotoCard + googleMaps for a visual destination overview`;

export function createGoogleMapsPack(): ComponentPack {
  return {
    name: 'google-maps',
    displayName: 'Google Maps',
    components: {
      googleMaps: GoogleMapsEmbed,
      googlePlacesSearch: GooglePlacesSearch,
      googleNearby: GoogleNearby,
      googlePhotoCard: GooglePhotoCard,
    },
    systemPrompt: GOOGLE_MAPS_SYSTEM_PROMPT,
    settingsComponent: GoogleMapsSettings,
    tools: [
      {
        definition: {
          type: 'function' as const,
          function: {
            name: 'google_places_search',
            description: 'Search for places using Google Places API. Returns real place names, addresses, ratings, price levels, and coordinates. Use when you need data to reason about and make recommendations (e.g., top restaurants, hotels near a landmark). Do NOT use for selection lists — use the googlePlacesSearch component instead.',
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Natural language search query. Example: "best sushi restaurants in Shibuya, Tokyo"',
                },
                maxResults: {
                  type: 'number',
                  description: 'Max results to return (default: 5, max: 10)',
                },
              },
              required: ['query'],
            },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          const apiKey = getStoredApiKey();
          if (!apiKey) return 'Error: Google Maps API key not configured. Ask the user to add it in Settings → Google Maps.';
          const query = String(args.query);
          const maxResults = Math.min(Number(args.maxResults) || 5, 10);
          try {
            const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.id,places.rating,places.userRatingCount,places.priceLevel,places.location,places.types,places.businessStatus',
              },
              body: JSON.stringify({ textQuery: query, maxResultCount: maxResults }),
            });
            if (!res.ok) {
              const err = await res.text();
              return `Google Places API error (${res.status}): ${err}`;
            }
            const data = await res.json();
            const places = (data.places ?? []).map((p: any) => ({
              name: p.displayName?.text,
              address: p.formattedAddress,
              placeId: p.id,
              rating: p.rating,
              totalRatings: p.userRatingCount,
              priceLevel: p.priceLevel,
              lat: p.location?.latitude,
              lng: p.location?.longitude,
              types: p.types?.slice(0, 3),
              open: p.businessStatus === 'OPERATIONAL',
            }));
            return JSON.stringify(places, null, 2);
          } catch (err) {
            return `Failed to search places: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },
      {
        definition: {
          type: 'function' as const,
          function: {
            name: 'google_place_details',
            description: 'Get detailed information about a specific place by its Google place ID. Returns opening hours, phone number, website, editorial summary, and recent reviews. Use after google_places_search to get deeper info on a recommendation.',
            parameters: {
              type: 'object',
              properties: {
                placeId: {
                  type: 'string',
                  description: 'Google place ID (from google_places_search results)',
                },
              },
              required: ['placeId'],
            },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          const apiKey = getStoredApiKey();
          if (!apiKey) return 'Error: Google Maps API key not configured. Ask the user to add it in Settings → Google Maps.';
          const placeId = String(args.placeId);
          try {
            const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
              headers: {
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'displayName,formattedAddress,rating,userRatingCount,currentOpeningHours,nationalPhoneNumber,websiteUri,editorialSummary,reviews,priceLevel',
              },
            });
            if (!res.ok) {
              const err = await res.text();
              return `Google Places API error (${res.status}): ${err}`;
            }
            const p = await res.json();
            const result: Record<string, unknown> = {
              name: p.displayName?.text,
              address: p.formattedAddress,
              rating: p.rating,
              totalRatings: p.userRatingCount,
              priceLevel: p.priceLevel,
              phone: p.nationalPhoneNumber,
              website: p.websiteUri,
              summary: p.editorialSummary?.text,
            };
            if (p.currentOpeningHours?.weekdayDescriptions) {
              result.hours = p.currentOpeningHours.weekdayDescriptions;
            }
            if (p.reviews) {
              result.topReviews = p.reviews.slice(0, 3).map((r: any) => ({
                rating: r.rating,
                text: r.text?.text?.slice(0, 200),
                time: r.relativePublishTimeDescription,
              }));
            }
            return JSON.stringify(result, null, 2);
          } catch (err) {
            return `Failed to get place details: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },

      // ─── Geocode Tool ───
      {
        definition: {
          type: 'function' as const,
          function: {
            name: 'google_geocode',
            description: 'Convert an address or place name to lat,lng coordinates. Use when you need coordinates for googleMaps mode:"view" or mode:"streetview". Returns lat, lng, and formatted address.',
            parameters: {
              type: 'object',
              properties: {
                address: {
                  type: 'string',
                  description: 'Address or place name to geocode (e.g., "Shibuya Crossing, Tokyo")',
                },
              },
              required: ['address'],
            },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          const apiKey = getStoredApiKey();
          if (!apiKey) return 'Error: Google Maps API key not configured.';
          const address = String(args.address);
          try {
            const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'places.location,places.formattedAddress,places.displayName',
              },
              body: JSON.stringify({ textQuery: address, maxResultCount: 1 }),
            });
            if (!res.ok) return `Geocode error: ${res.status}`;
            const data = await res.json();
            const place = data.places?.[0];
            if (!place) return `Could not geocode "${address}"`;
            return JSON.stringify({
              address: place.formattedAddress,
              name: place.displayName?.text,
              lat: place.location?.latitude,
              lng: place.location?.longitude,
              center: `${place.location?.latitude},${place.location?.longitude}`,
            }, null, 2);
          } catch (err) {
            return `Failed to geocode: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },
    ],
  };
}
