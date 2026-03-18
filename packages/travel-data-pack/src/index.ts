import type { ComponentPack } from '@sabbour/adaptive-ui-core';
import { trackedFetch } from '@sabbour/adaptive-ui-core';
import { WeatherCard, CountryInfoCard, CurrencyConverter, TravelChecklist, BudgetTracker } from './components';

// ─── Travel Data Pack ───
// Provides real-time travel data via free, no-API-key-needed services:
// - Weather forecasts (wttr.in)
// - Currency exchange rates (open.er-api.com)
// - Country information (restcountries.com)
// - Timezone data (worldtimeapi.org)
// Mix of tools (LLM needs data) and components (visual, client-side)

const TRAVEL_DATA_PROMPT = `
TRAVEL DATA PACK:

TOOLS (inference-time, LLM sees results):
- get_weather: Current weather + 3-day forecast. Use to advise on packing/activities.
- get_exchange_rate: Live currency rates. Use for budget calculations.
- get_country_info: Country facts (capital, languages, currency, timezone, driving side). Use when destination is picked.
- get_time_zone: Current local time at a destination. Use for jet lag advice and scheduling.

COMPONENTS (visual, client-side — LLM never sees the data):

weatherCard — {city}
  Visual weather card with current conditions + 3-day forecast strip. Fetches data client-side.
  Use INSTEAD of describing weather in text — saves tokens and looks better.
  Example: {type:"weatherCard", city:"{{state.destination}}"}
  Example: {type:"weatherCard", city:"Paris"}

countryInfoCard — {country}
  Country fact card with flag, capital, languages, currency, timezone, driving side, population.
  Use when a destination country is chosen — visual anchor for the trip.
  Example: {type:"countryInfoCard", country:"{{state.country}}"}
  Example: {type:"countryInfoCard", country:"Japan"}

currencyConverter — {from?, to?}
  Interactive currency converter widget. User enters amount, picks currencies, sees live conversion.
  Use when discussing budget — more interactive than quoting a rate.
  Example: {type:"currencyConverter", from:"USD", to:"JPY"}
  Example: {type:"currencyConverter"} (defaults to USD → EUR)

travelChecklist — {items, bind, title?}
  Interactive packing/prep checklist with progress bar. User checks items off.
  Items can be a string array or comma-separated string.
  Example: {type:"travelChecklist", title:"Packing List", items:["Passport","Adapter plug","Sunscreen","Rain jacket","Comfortable shoes","Travel insurance docs","Local currency","Phone charger"], bind:"packingChecklist"}

WHEN TO USE:
- weatherCard: whenever showing weather for a destination — always prefer over text description
- countryInfoCard: when a destination country is first chosen or discussed
- currencyConverter: when discussing budget, prices, or financial planning
- travelChecklist: at the FINALIZE step for packing lists, prep tasks, or document checklists
- get_weather tool: when LLM needs weather data to make decisions (swap activities, suggest indoor alternatives)
- get_exchange_rate tool: when LLM needs exact rates for budget calculations in text
- get_country_info tool: when LLM needs country facts to reason about (visa requirements, cultural advice)
- get_time_zone tool: for jet lag advice, scheduling, "what time is it there?"

RULES:
- ALWAYS use weatherCard component to display weather visually. Only use get_weather tool when you need the data to reason about.
- ALWAYS use countryInfoCard when introducing a new destination country.
- Offer currencyConverter when budget is discussed — users love playing with amounts.
- Generate travelChecklist at the finalize step with weather-appropriate items.
- Use budgetTracker whenever presenting cost breakdowns — it auto-saves to the Trip Notebook.

budgetTracker — {items, currency?, title?, bind?}
  Visual budget breakdown with category bars and per-line percentages. Auto-saves items to the Trip Notebook panel.
  items: array of {category, amount, note?}. Categories: flights, hotel, food, activities, transport, shopping, insurance, visa, other.
  currency: 3-letter code (default: USD). Supports {{state.key}} interpolation.
  bind: optional state key to store the total amount.
  If the user mentioned number of travelers, shows per-person cost automatically.
  Example: {type:"budgetTracker", currency:"EUR", items:[{category:"flights", amount:800, note:"Round trip JFK→CDG"},{category:"hotel", amount:1200, note:"4 nights boutique hotel"},{category:"food", amount:400, note:"Restaurants & cafes"},{category:"activities", amount:300, note:"Museums & tours"},{category:"transport", amount:150, note:"Metro & taxis"}]}
  Example with binding: {type:"budgetTracker", currency:"{{state.currency}}", bind:"totalBudget", items:[...]}
`;

/** Slim down weather response to essential fields */
function slimWeather(data: any): any {
  try {
    const current = data.current_condition?.[0];
    const forecast = data.weather?.slice(0, 3);
    return {
      current: current ? {
        temp_C: current.temp_C,
        temp_F: current.temp_F,
        condition: current.weatherDesc?.[0]?.value,
        humidity: current.humidity,
        windspeedKmph: current.windspeedKmph,
        feelsLike_C: current.FeelsLikeC,
      } : null,
      forecast: forecast?.map((d: any) => ({
        date: d.date,
        maxTemp_C: d.maxtempC,
        minTemp_C: d.mintempC,
        condition: d.hourly?.[4]?.weatherDesc?.[0]?.value || 'Unknown',
        chanceOfRain: d.hourly?.[4]?.chanceofrain || '0',
      })),
    };
  } catch { return data; }
}

/** Slim down country response */
function slimCountry(data: any): any {
  try {
    const c = Array.isArray(data) ? data[0] : data;
    return {
      name: c.name?.common,
      officialName: c.name?.official,
      capital: c.capital,
      region: c.region,
      subregion: c.subregion,
      population: c.population,
      languages: c.languages,
      currencies: c.currencies ? Object.entries(c.currencies).map(([code, v]: [string, any]) => ({ code, name: v.name, symbol: v.symbol })) : [],
      timezones: c.timezones,
      callingCode: c.idd?.root ? c.idd.root + (c.idd.suffixes?.[0] || '') : null,
      drivingSide: c.car?.side,
      flag: c.flag,
    };
  } catch { return data; }
}

export function createTravelDataPack(): ComponentPack {
  return {
    name: 'travel-data',
    displayName: 'Travel Data',
    components: {
      weatherCard: WeatherCard,
      countryInfoCard: CountryInfoCard,
      currencyConverter: CurrencyConverter,
      travelChecklist: TravelChecklist,
      budgetTracker: BudgetTracker,
    },
    systemPrompt: TRAVEL_DATA_PROMPT,
    tools: [
      // ─── Weather Tool ───
      {
        definition: {
          type: 'function' as const,
          function: {
            name: 'get_weather',
            description: 'Get current weather and 3-day forecast for a city. Use to advise on packing, activities, and best times. Returns temperature, conditions, humidity, wind, and daily forecast.',
            parameters: {
              type: 'object',
              properties: {
                city: {
                  type: 'string',
                  description: 'City name (e.g., "Paris", "Tokyo", "New York")',
                },
              },
              required: ['city'],
            },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          const city = encodeURIComponent(String(args.city));
          try {
            const res = await trackedFetch(`https://wttr.in/${city}?format=j1`);
            if (!res.ok) return `Weather API error: ${res.status}`;
            const data = await res.json();
            return JSON.stringify(slimWeather(data), null, 2);
          } catch (err) {
            return `Failed to fetch weather: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },

      // ─── Exchange Rate Tool ───
      {
        definition: {
          type: 'function' as const,
          function: {
            name: 'get_exchange_rate',
            description: 'Get live currency exchange rate between two currencies. Use for budget calculations and price conversions. Returns the rate and last update time.',
            parameters: {
              type: 'object',
              properties: {
                from: {
                  type: 'string',
                  description: 'Source currency code (e.g., "USD", "EUR", "GBP")',
                },
                to: {
                  type: 'string',
                  description: 'Target currency code (e.g., "JPY", "THB", "MAD")',
                },
              },
              required: ['from', 'to'],
            },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          const from = String(args.from).toUpperCase();
          const to = String(args.to).toUpperCase();
          try {
            const res = await trackedFetch(`https://open.er-api.com/v6/latest/${from}`);
            if (!res.ok) return `Exchange rate API error: ${res.status}`;
            const data = await res.json();
            if (data.result !== 'success') return `Exchange rate error: ${data['error-type'] || 'unknown'}`;
            const rate = data.rates?.[to];
            if (!rate) return `Currency "${to}" not found. Available: ${Object.keys(data.rates).slice(0, 20).join(', ')}...`;
            return JSON.stringify({
              from,
              to,
              rate,
              example: `1 ${from} = ${rate} ${to}`,
              inverse: `1 ${to} = ${(1 / rate).toFixed(4)} ${from}`,
              lastUpdated: data.time_last_update_utc,
            }, null, 2);
          } catch (err) {
            return `Failed to fetch exchange rate: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },

      // ─── Country Info Tool ───
      {
        definition: {
          type: 'function' as const,
          function: {
            name: 'get_country_info',
            description: 'Get practical travel information about a country: capital, languages, currency, timezone, driving side, calling code. Use when the user picks a destination.',
            parameters: {
              type: 'object',
              properties: {
                country: {
                  type: 'string',
                  description: 'Country name (e.g., "Japan", "Morocco", "Italy")',
                },
              },
              required: ['country'],
            },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          const country = encodeURIComponent(String(args.country));
          try {
            const res = await trackedFetch(`https://restcountries.com/v3.1/name/${country}?fields=name,capital,region,subregion,population,languages,currencies,timezones,idd,car,flag`);
            if (!res.ok) return `Country API error: ${res.status}. Check the country name.`;
            const data = await res.json();
            return JSON.stringify(slimCountry(data), null, 2);
          } catch (err) {
            return `Failed to fetch country info: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },

      // ─── Timezone Tool ───
      {
        definition: {
          type: 'function' as const,
          function: {
            name: 'get_time_zone',
            description: 'Get the current local time at a destination city. Use for jet lag advice, scheduling, and "what time is it there?" questions.',
            parameters: {
              type: 'object',
              properties: {
                city: {
                  type: 'string',
                  description: 'City name (e.g., "Tokyo", "London", "New York")',
                },
              },
              required: ['city'],
            },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          const city = String(args.city);
          try {
            // Try worldtimeapi with area/city lookup
            const searchCity = city.split(',')[0].trim().split(' ').join('_');
            const res = await trackedFetch(`https://worldtimeapi.org/api/timezone`);
            if (!res.ok) return `Timezone API error: ${res.status}`;
            const zones: string[] = await res.json();
            // Find best match
            const lowerCity = searchCity.toLowerCase();
            const match = zones.find((z) => z.toLowerCase().includes(lowerCity));
            if (!match) return `Could not find timezone for "${city}". Try a major city name.`;
            const tzRes = await trackedFetch(`https://worldtimeapi.org/api/timezone/${match}`);
            if (!tzRes.ok) return `Timezone API error: ${tzRes.status}`;
            const tzData = await tzRes.json();
            return JSON.stringify({
              city,
              timezone: tzData.timezone,
              localTime: tzData.datetime,
              utcOffset: tzData.utc_offset,
              abbreviation: tzData.abbreviation,
              dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][tzData.day_of_week] || 'Unknown',
            }, null, 2);
          } catch (err) {
            return `Failed to fetch timezone: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },
    ],
  };
}
