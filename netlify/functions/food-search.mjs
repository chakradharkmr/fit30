// Proxy for USDA FoodData Central search. The API key stays on the server.
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const CACHE = new Map();
const TTL_MS = 10 * 60 * 1000;
const MAX_CACHE = 200;

const reply = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
const clean = (s, max) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (v, max) => (Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 10) / 10 : null);

function nutrient(food, ids, numbers, unit) {
  const list = Array.isArray(food.foodNutrients) ? food.foodNutrients : [];
  for (const n of list) {
    const id = n.nutrientId ?? n.nutrient?.id;
    const nr = String(n.nutrientNumber ?? n.nutrient?.number ?? '');
    const u = String(n.unitName ?? n.nutrient?.unitName ?? '').toUpperCase();
    if ((ids.includes(id) || numbers.includes(nr)) && (!unit || u === unit)) {
      const v = Number(n.value ?? n.amount);
      if (Number.isFinite(v)) return v;
    }
  }
  return null;
}

export function normaliseFood(food) {
  const kcal = num(nutrient(food, [1008, 2047, 2048], ['208', '957', '958'], 'KCAL'), 900);
  if (kcal === null) return null;
  const name = clean(food.description, 120);
  if (!name) return null;
  return {
    id: `usda-${Number(food.fdcId) || 0}`,
    name,
    brand: clean(food.brandName || food.brandOwner || '', 80),
    kcal,
    protein: num(nutrient(food, [1003], ['203']), 100) ?? 0,
    carbs: num(nutrient(food, [1005], ['205']), 100) ?? 0,
    fat: num(nutrient(food, [1004], ['204']), 100) ?? 0,
    per: '100 g'
  };
}

export default async (request) => {
  if (request.method !== 'GET') return reply(405, { error: 'method_not_allowed', message: 'Use GET.' }, { Allow: 'GET' });
  const url = new URL(request.url);
  const q = clean(url.searchParams.get('q') || '', 80);
  if (q.length < 2) return reply(400, { error: 'invalid_query', message: 'Enter at least two characters.', results: [] });
  const key = process.env.USDA_API_KEY;
  if (!key) {
    return reply(200, { error: 'not_configured', message: 'Online food search is not configured on this site (USDA_API_KEY is not set). The offline food library still works.', results: [] });
  }
  const cacheKey = q.toLowerCase();
  const hit = CACHE.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) return reply(200, { results: hit.results, cached: true });
  const types = ['Foundation', 'SR Legacy', 'Branded'].map((t) => `dataType=${encodeURIComponent(t)}`).join('&');
  const upstream = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(q)}&pageSize=25&${types}`;
  try {
    const res = await fetch(upstream, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (res.status === 429) return reply(503, { error: 'rate_limited', message: 'The USDA service is busy. Please try again shortly.', results: [] });
    if (!res.ok) return reply(502, { error: 'upstream_error', message: 'The USDA service did not respond as expected.', results: [] });
    const data = await res.json();
    const results = (Array.isArray(data.foods) ? data.foods : []).map(normaliseFood).filter(Boolean).slice(0, 14);
    if (CACHE.size >= MAX_CACHE) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(cacheKey, { at: Date.now(), results });
    return reply(200, { results });
  } catch {
    return reply(504, { error: 'upstream_timeout', message: 'The USDA service took too long to respond.', results: [] });
  }
};
