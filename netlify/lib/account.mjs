// Shared helpers for the optional account functions.
// The service-role key is read here, on the server, and never returned to a client.

export const MAX_STATE_BYTES = Math.floor(1.8 * 1024 * 1024);
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TABLE = 'fit30_accounts';

const BASE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

export function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...extraHeaders } });
}

export function methodNotAllowed(allowed) {
  return json(405, { error: 'method_not_allowed', message: `Use ${allowed.join(' or ')}.` }, { Allow: allowed.join(', ') });
}

export function readConfig(env = process.env) {
  const url = typeof env.SUPABASE_URL === 'string' ? env.SUPABASE_URL.trim().replace(/\/+$/, '') : '';
  const anonKey = typeof env.SUPABASE_ANON_KEY === 'string' ? env.SUPABASE_ANON_KEY.trim() : '';
  const serviceKey = typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string' ? env.SUPABASE_SERVICE_ROLE_KEY.trim() : '';
  const enabled = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url) && anonKey.length > 0 && serviceKey.length > 0;
  return { enabled, url, anonKey, serviceKey };
}

export const SETUP_MESSAGE =
  'Accounts are not configured on this site. The operator needs to set SUPABASE_URL, SUPABASE_ANON_KEY and ' +
  'SUPABASE_SERVICE_ROLE_KEY in Netlify and redeploy. Everything keeps working locally without an account.';

export function publicConfig(env = process.env) {
  const cfg = readConfig(env);
  if (!cfg.enabled) return { enabled: false, provider: 'google', message: SETUP_MESSAGE };
  return { enabled: true, supabaseUrl: cfg.url, supabaseAnonKey: cfg.anonKey, provider: 'google' };
}

export function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/.exec(header.trim());
  return m ? m[1] : null;
}

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function validateStatePayload(body) {
  if (!isPlainObject(body)) return { ok: false, message: 'The request body must be a JSON object.' };
  const state = body.state;
  if (!isPlainObject(state)) return { ok: false, message: 'The state must be a JSON object, not an array or a value.' };
  const size = Buffer.byteLength(JSON.stringify(state), 'utf8');
  if (size > MAX_STATE_BYTES) return { ok: false, message: `The state is ${size} bytes; the limit is ${MAX_STATE_BYTES} bytes.` };
  return { ok: true, state, size };
}

function serviceHeaders(cfg, extra = {}) {
  return { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, Accept: 'application/json', ...extra };
}

async function timedFetch(fetchImpl, url, init = {}, ms = 10000) {
  return fetchImpl(url, { ...init, signal: AbortSignal.timeout(ms) });
}

// Verify the caller's access token with Supabase Auth and return the user it belongs to.
export async function verifyUser(token, cfg, fetchImpl = fetch) {
  try {
    const res = await timedFetch(fetchImpl, `${cfg.url}/auth/v1/user`, {
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${token}`, Accept: 'application/json' }
    });
    if (!res.ok) return null;
    const user = await res.json();
    if (!user || typeof user.id !== 'string' || !UUID_RE.test(user.id)) return null;
    return { id: user.id.toLowerCase(), email: typeof user.email === 'string' ? user.email.slice(0, 320) : null };
  } catch {
    return null;
  }
}

async function guard(request, deps, allowed) {
  if (!allowed.includes(request.method)) return { response: methodNotAllowed(allowed) };
  const cfg = readConfig(deps.env);
  if (!cfg.enabled) return { response: json(503, { error: 'not_configured', message: SETUP_MESSAGE }) };
  const token = bearerToken(request);
  if (!token) return { response: json(401, { error: 'unauthorized', message: 'Sign in again.' }) };
  const user = await verifyUser(token, cfg, deps.fetch);
  if (!user) return { response: json(401, { error: 'unauthorized', message: 'Sign in again.' }) };
  return { cfg, user };
}

export async function handleAccountConfig(request, deps = {}) {
  if (request.method !== 'GET') return methodNotAllowed(['GET']);
  return json(200, publicConfig(deps.env || process.env));
}

export async function handleAccountState(request, deps = {}) {
  const d = { env: deps.env || process.env, fetch: deps.fetch || fetch };
  const g = await guard(request, d, ['GET', 'PUT', 'DELETE']);
  if (g.response) return g.response;
  const { cfg, user } = g;
  const rowUrl = `${cfg.url}/rest/v1/${TABLE}?user_id=eq.${encodeURIComponent(user.id)}`;

  if (request.method === 'GET') {
    try {
      const res = await timedFetch(d.fetch, `${rowUrl}&select=state,updated_at`, { headers: serviceHeaders(cfg) });
      if (!res.ok) return json(502, { error: 'cloud_read_failed', message: 'The cloud copy could not be read.' });
      const rows = await res.json();
      if (!Array.isArray(rows) || !rows.length) return json(404, { error: 'no_state', message: 'There is no cloud copy yet.' });
      return json(200, { state: rows[0].state, updatedAt: rows[0].updated_at });
    } catch {
      return json(502, { error: 'cloud_read_failed', message: 'The cloud copy could not be read.' });
    }
  }

  if (request.method === 'PUT') {
    const declared = Number(request.headers.get('content-length') || 0);
    if (declared > MAX_STATE_BYTES + 1024) return json(413, { error: 'invalid_state', message: 'The state is too large.' });
    let text;
    try { text = await request.text(); } catch { text = ''; }
    if (Buffer.byteLength(text, 'utf8') > MAX_STATE_BYTES + 1024) return json(413, { error: 'invalid_state', message: 'The state is too large.' });
    let body;
    try { body = JSON.parse(text); } catch { body = null; }
    const v = validateStatePayload(body);
    if (!v.ok) return json(413, { error: 'invalid_state', message: v.message });
    const now = new Date().toISOString();
    try {
      const res = await timedFetch(d.fetch, `${cfg.url}/rest/v1/${TABLE}?on_conflict=user_id`, {
        method: 'POST',
        headers: serviceHeaders(cfg, { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }),
        body: JSON.stringify([{ user_id: user.id, email: user.email, state: v.state, updated_at: now }])
      }, 15000);
      if (!res.ok) return json(502, { error: 'cloud_write_failed', message: 'The cloud copy could not be saved.' });
      const rows = await res.json().catch(() => []);
      const updatedAt = Array.isArray(rows) && rows[0] && rows[0].updated_at ? rows[0].updated_at : now;
      return json(200, { ok: true, updatedAt });
    } catch {
      return json(502, { error: 'cloud_write_failed', message: 'The cloud copy could not be saved.' });
    }
  }

  // DELETE
  try {
    const res = await timedFetch(d.fetch, rowUrl, { method: 'DELETE', headers: serviceHeaders(cfg, { Prefer: 'return=minimal' }) });
    if (!res.ok) return json(502, { error: 'cloud_delete_failed', message: 'The cloud copy could not be deleted.' });
    return json(200, { ok: true, deleted: true });
  } catch {
    return json(502, { error: 'cloud_delete_failed', message: 'The cloud copy could not be deleted.' });
  }
}

export async function handleAccountDelete(request, deps = {}) {
  const d = { env: deps.env || process.env, fetch: deps.fetch || fetch };
  const g = await guard(request, d, ['DELETE']);
  if (g.response) return g.response;
  const { cfg, user } = g;
  try {
    const res = await timedFetch(d.fetch, `${cfg.url}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: 'DELETE', headers: serviceHeaders(cfg) });
    if (!res.ok && res.status !== 404) {
      return json(502, { error: 'account_delete_failed', message: 'The account could not be deleted. Nothing was removed.' });
    }
  } catch {
    return json(502, { error: 'account_delete_failed', message: 'The account could not be deleted. Nothing was removed.' });
  }
  try {
    const res = await timedFetch(d.fetch, `${cfg.url}/rest/v1/${TABLE}?user_id=eq.${encodeURIComponent(user.id)}`, {
      method: 'DELETE', headers: serviceHeaders(cfg, { Prefer: 'return=minimal' })
    });
    if (!res.ok) throw new Error('row');
  } catch {
    return json(502, { error: 'account_delete_partial', message: 'The sign-in was deleted but the cloud copy could not be removed.' });
  }
  return json(200, { ok: true, deleted: true });
}
