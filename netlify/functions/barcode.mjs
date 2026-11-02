// Proxy for Open Food Facts product lookups by barcode.
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const CACHE = new Map();
const TTL_MS = 30 * 60 * 1000;
const MAX_CACHE = 300;
const FIELDS = 'code,product_name,product_name_en,brands,image_front_small_url,serving_size,nutriments,nutrition_data_per';

const reply = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
const clean = (s, max) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 10) / 10 : null; };

export function validateBarcode(input) {
  const code = typeof input === 'string' ? input.replace(/[\s-]/g, '') : '';
  if (!/^\d+$/.test(code)) return { ok: false, message: 'A barcode contains digits only.' };
  if (![8, 12, 13, 14].includes(code.length)) return { ok: false, message: 'Barcodes have 8, 12, 13 or 14 digits.' };
  const digits = code.split('').map(Number);
  const check = digits.pop();
  let total = 0;
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) total += digits[i] * w;
  if ((10 - (total % 10)) % 10 !== check) return { ok: false, message: 'The check digit does not match.' };
  return { ok: true, code };
}

function safeImage(url) {
  if (typeof url !== 'string') return '';
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'openfoodfacts.org' || u.hostname.endsWith('.openfoodfacts.org')) ? u.href : '';
  } catch {
    return '';
  }
}

export function normaliseProduct(p, code) {
  const n = p.nutriments || {};
  let kcal = num(n['energy-kcal_100g'], 900);
  if (kcal === null && Number.isFinite(Number(n.energy_100g))) kcal = num(Number(n.energy_100g) / 4.184, 900);
  return {
    code,
    name: clean(p.product_name || p.product_name_en || '', 120),
    brand: clean(String(p.brands || '').split(',')[0] || '', 80),
    image: safeImage(p.image_front_small_url),
    serving: clean(p.serving_size || '', 60),
    unit: p.nutrition_data_per === '100ml' ? 'ml' : 'g',
    kcal,
    protein: num(n.proteins_100g, 100) ?? 0,
    carbs: num(n.carbohydrates_100g, 100) ?? 0,
    fat: num(n.fat_100g, 100) ?? 0,
    source: 'Open Food Facts',
    licence: 'ODbL'
  };
}

export default async (request) => {
  if (request.method !== 'GET') return reply(405, { error: 'method_not_allowed', message: 'Use GET.' }, { Allow: 'GET' });
  const raw = (new URL(request.url).searchParams.get('code') || '').slice(0, 32);
  const v = validateBarcode(raw);
  if (!v.ok) return reply(400, { error: 'invalid_barcode', message: v.message });
  const hit = CACHE.get(v.code);
  if (hit && Date.now() - hit.at < TTL_MS) return reply(hit.status, hit.body);
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${v.code}.json?fields=${FIELDS}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'Fit30Reset/1.1 (Netlify Function; educational nutrition app)' },
      signal: AbortSignal.timeout(8000)
    });
    if (res.status === 404) {
      const body = { error: 'not_found', message: 'No product with this barcode was found.' };
      CACHE.set(v.code, { at: Date.now(), status: 404, body });
      return reply(404, body);
    }
    if (!res.ok) return reply(502, { error: 'upstream_error', message: 'Open Food Facts did not respond as expected.' });
    const data = await res.json();
    if (!data || data.status === 0 || !data.product) {
      const body = { error: 'not_found', message: 'No product with this barcode was found.' };
      CACHE.set(v.code, { at: Date.now(), status: 404, body });
      return reply(404, body);
    }
    const body = { product: normaliseProduct(data.product, v.code), attribution: 'Data from Open Food Facts (ODbL). Crowd-sourced: check the label.' };
    if (CACHE.size >= MAX_CACHE) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(v.code, { at: Date.now(), status: 200, body });
    return reply(200, body);
  } catch {
    return reply(504, { error: 'upstream_timeout', message: 'Open Food Facts took too long to respond.' });
  }
};
