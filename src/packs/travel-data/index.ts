import type { ComponentPack } from '../../framework/registry';
import { trackedFetch } from '../../framework/request-tracker';

// ─── Travel Data Pack ───
// Provides real-time travel data via free, no-API-key-needed services:
// - Weather forecasts (wttr.in)
// - Currency exchange rates (open.er-api.com)
// - Country information (restcountries.com)
// All are tools — the LLM needs to see the data to give informed advice.

const TRAVEL_DATA_PROMPT = `
TRAVEL DATA PACK:

You have access to real-time travel data tools. Use them to give accurate, data-backed advice.

TOOLS (called during inference):
- get_weather: Get current weather and 3-day forecast for any city.
  Use when discussing packing, activities, or best time to visit.
  Example: get_weather({ city: "Paris" })
  Returns: temperature, conditions, humidity, wind, and 3-day forecast.

- get_exchange_rate: Get live currency exchange rates.
  Use when discussing budget, prices, or cost comparisons.
  Example: get_exchange_rate({ from: "USD", to: "EUR" })
  Returns: exchange rate and conversion info.

- get_country_info: Get practical travel info about a country.
  Use when discussing destinations — languages, currency, timezone, population, region.
  Example: get_country_info({ country: "Japan" })
  Returns: capital, languages, currency, timezone, calling code, driving side, etc.

WHEN TO USE TOOLS:
- ALWAYS check weather when recommending activities or packing lists
- ALWAYS check exchange rates when discussing budget or prices
- ALWAYS check country info when the user picks a destination (for currency, language, timezone)
- Do NOT guess weather, exchange rates, or country facts — use the tools

PRESENTING DATA:
- Weave tool results naturally into your advice: "The forecast for Day 2 shows rain (14°C), so I'd swap the hike for the covered market tour"
- Include exchange rate context in budget tables: "Your $150/day budget = ~€138 at today's rate"
- Mention practical country info: "Japan drives on the left, and tipping is actually considered rude"
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
    components: {},
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
    ],
  };
}
