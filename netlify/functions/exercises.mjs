// Proxy for the public wger exercise database (CC BY-SA 4.0).
const HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const CACHE = new Map();
const TTL_MS = 60 * 60 * 1000;
const MAX_CACHE = 200;
const ENGLISH = 2;

const reply = (status, body, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...HEADERS, ...extra } });
const clean = (s, max) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

function safeImage(url) {
  if (typeof url !== 'string') return '';
  try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === 'wger.de' ? u.href : ''; } catch { return ''; }
}

export function normaliseExercise(x) {
  const tr = (Array.isArray(x.translations) ? x.translations : []).find((t) => t.language === ENGLISH);
  if (!tr || !clean(tr.name, 100)) return null;
  const img = (Array.isArray(x.images) ? x.images : []).find((i) => i.is_main) || (x.images || [])[0];
  return {
    id: Number(x.id) || 0,
    name: clean(tr.name, 100),
    category: clean(x.category && x.category.name, 60),
    description: clean(tr.description, 300),
    image: img ? safeImage(img.image) : '',
    url: `https://wger.de/en/exercise/${Number(x.id) || 0}/view/`
  };
}

export default async (request) => {
  if (request.method !== 'GET') return reply(405, { error: 'method_not_allowed', message: 'Use GET.' }, { Allow: 'GET' });
  const q = clean(new URL(request.url).searchParams.get('q') || '', 60);
  if (q.length < 2) return reply(400, { error: 'invalid_query', message: 'Enter at least two characters.', results: [] });
  const key = q.toLowerCase();
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return reply(200, hit.body);
  try {
    const upstream = `https://wger.de/api/v2/exerciseinfo/?language=${ENGLISH}&limit=20&name__search=${encodeURIComponent(q)}`;
    const res = await fetch(upstream, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return reply(502, { error: 'upstream_error', message: 'wger did not respond as expected.', results: [] });
    const data = await res.json();
    const results = (Array.isArray(data.results) ? data.results : []).map(normaliseExercise).filter(Boolean).slice(0, 12);
    const body = { results, attribution: 'Exercise data from wger.de, CC BY-SA 4.0.' };
    if (CACHE.size >= MAX_CACHE) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(key, { at: Date.now(), body });
    return reply(200, body);
  } catch {
    return reply(504, { error: 'upstream_timeout', message: 'wger took too long to respond.', results: [] });
  }
};
