import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  validateStatePayload, publicConfig, readConfig, MAX_STATE_BYTES,
  handleAccountConfig, handleAccountState, handleAccountDelete
} from '../netlify/lib/account.mjs';
import accountConfigFn from '../netlify/functions/account-config.mjs';
import accountStateFn from '../netlify/functions/account-state.mjs';
import accountDeleteFn from '../netlify/functions/account-delete.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const core = require(join(root, 'app.js')).Fit30Core;

const SERVICE = 'service-role-secret-value-that-must-never-leak';
const ENV = { SUPABASE_URL: 'https://abcd1234.supabase.co', SUPABASE_ANON_KEY: 'public-anon-key', SUPABASE_SERVICE_ROLE_KEY: SERVICE };
const USER_ID = '6f1c2b0e-8d4a-4c3e-9b7a-1f2e3d4c5b6a';
const TOKEN = 'header.payload.signature-long-enough-token';
const VARS = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];

const req = (method, path = 'account-state', opts = {}) => new Request(`https://site.example/.netlify/functions/${path}`, { method, ...opts });
const noNetwork = async () => { throw new Error('network access is not allowed in tests'); };

function withEnv(values, fn) {
  const saved = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
  for (const k of VARS) { if (values[k] === undefined) delete process.env[k]; else process.env[k] = values[k]; }
  return Promise.resolve(fn()).finally(() => {
    for (const k of VARS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  });
}

function fakeSupabase(calls, { authStatus = 200, rows = [] } = {}) {
  return async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/auth/v1/user')) {
      return new Response(JSON.stringify(authStatus === 200 ? { id: USER_ID, email: 'person@example.org' } : { msg: 'bad' }), { status: authStatus });
    }
    if (init.method === 'POST') return new Response(JSON.stringify([{ updated_at: '2026-03-01T10:00:00Z' }]), { status: 201 });
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    return new Response(JSON.stringify(rows), { status: 200 });
  };
}

test('payload validation requires an object with an object state', () => {
  assert.equal(validateStatePayload(null).ok, false);
  assert.equal(validateStatePayload('text').ok, false);
  assert.equal(validateStatePayload({}).ok, false);
  assert.equal(validateStatePayload({ state: 'x' }).ok, false);
  const ok = validateStatePayload({ state: { version: 1, diary: {} } });
  assert.equal(ok.ok, true);
  assert.ok(ok.size > 0);
});

test('payload validation rejects arrays', () => {
  assert.equal(validateStatePayload([]).ok, false);
  assert.equal(validateStatePayload({ state: [] }).ok, false);
  assert.equal(validateStatePayload({ state: [{ version: 1 }] }).ok, false);
});

test('payload validation rejects oversize state', () => {
  const big = { version: 1, blob: 'x'.repeat(MAX_STATE_BYTES) };
  const r = validateStatePayload({ state: big });
  assert.equal(r.ok, false);
  assert.match(r.message, /limit/);
  assert.equal(MAX_STATE_BYTES, Math.floor(1.8 * 1024 * 1024));
});

test('publicConfig never exposes the service key', () => {
  const on = publicConfig(ENV);
  assert.deepEqual(on, { enabled: true, supabaseUrl: ENV.SUPABASE_URL, supabaseAnonKey: ENV.SUPABASE_ANON_KEY, provider: 'google' });
  assert.ok(!JSON.stringify(on).includes(SERVICE));
  const off = publicConfig({ SUPABASE_SERVICE_ROLE_KEY: SERVICE });
  assert.equal(off.enabled, false);
  assert.ok(!JSON.stringify(off).includes(SERVICE));
  assert.equal(readConfig({ ...ENV, SUPABASE_URL: 'http://insecure.example' }).enabled, false);
  assert.equal(readConfig({ ...ENV, SUPABASE_URL: 'https://abcd1234.supabase.co/rest/v1/' }).url, ENV.SUPABASE_URL);
  const aliases = readConfig({ SUPABASE_DATABASE_URL: ENV.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x', SUPABASE_SECRET_KEY: 'sb_secret_y' });
  assert.equal(aliases.enabled, true);
  const serviceJwt = 'h.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.s';
  const leaked = publicConfig({ ...ENV, SUPABASE_ANON_KEY: serviceJwt });
  assert.equal(leaked.enabled, false);
  assert.ok(!JSON.stringify(leaked).includes(serviceJwt) && !JSON.stringify(leaked).includes(SERVICE));
  assert.match(leaked.message, /secret\/service-role key/);
  assert.match(publicConfig({ ...ENV, SUPABASE_URL: undefined }).message, /SUPABASE_URL is not set/);
});

test('account-config returns a setup message when disabled', async () => {
  await withEnv({}, async () => {
    const res = await accountConfigFn(req('GET', 'account-config'));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    const body = await res.json();
    assert.equal(body.enabled, false);
    for (const v of VARS) assert.match(body.message, new RegExp(v));
  });
});

test('account-config returns public settings when enabled', async () => {
  await withEnv(ENV, async () => {
    const res = await accountConfigFn(req('GET', 'account-config'));
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes(SERVICE));
    const body = JSON.parse(text);
    assert.equal(body.enabled, true);
    assert.equal(body.supabaseUrl, ENV.SUPABASE_URL);
    assert.equal(body.provider, 'google');
  });
});

test('account-config rejects other methods with 405 and Allow', async () => {
  const res = await handleAccountConfig(req('POST', 'account-config'), { env: ENV });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('allow'), 'GET');
});

test('account-state guards: 405, 503 and 401', async () => {
  const r405 = await handleAccountState(req('POST'), { env: ENV, fetch: noNetwork });
  assert.equal(r405.status, 405);
  assert.equal(r405.headers.get('allow'), 'GET, PUT, DELETE');
  await withEnv({}, async () => {
    const r503 = await accountStateFn(req('GET', 'account-state', { headers: { Authorization: `Bearer ${TOKEN}` } }));
    assert.equal(r503.status, 503);
    assert.equal((await r503.json()).error, 'not_configured');
  });
  const r401 = await handleAccountState(req('GET'), { env: ENV, fetch: noNetwork });
  assert.equal(r401.status, 401);
  assert.equal((await r401.json()).error, 'unauthorized');
});

test('account-state rejects a token Supabase does not accept', async () => {
  const calls = [];
  const res = await handleAccountState(req('GET', 'account-state', { headers: { Authorization: `Bearer ${TOKEN}` } }), { env: ENV, fetch: fakeSupabase(calls, { authStatus: 401 }) });
  assert.equal(res.status, 401);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.apikey, ENV.SUPABASE_ANON_KEY);
});

test('account-delete guards: 405, 503 and 401', async () => {
  const r405 = await handleAccountDelete(req('GET', 'account-delete'), { env: ENV, fetch: noNetwork });
  assert.equal(r405.status, 405);
  assert.equal(r405.headers.get('allow'), 'DELETE');
  await withEnv({}, async () => {
    const r503 = await accountDeleteFn(req('DELETE', 'account-delete', { headers: { Authorization: `Bearer ${TOKEN}` } }));
    assert.equal(r503.status, 503);
  });
  const r401 = await handleAccountDelete(req('DELETE', 'account-delete', { headers: { Authorization: 'Bearer short' } }), { env: ENV, fetch: noNetwork });
  assert.equal(r401.status, 401);
});

test('account-state scopes reads and writes to the verified user', async () => {
  const calls = [];
  const fetchImpl = fakeSupabase(calls, { rows: [{ state: { version: 1 }, updated_at: '2026-03-01T09:00:00Z' }] });
  const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
  const get = await handleAccountState(req('GET', 'account-state?user_id=someone-else', { headers }), { env: ENV, fetch: fetchImpl });
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), { state: { version: 1 }, updatedAt: '2026-03-01T09:00:00Z' });
  const put = await handleAccountState(req('PUT', 'account-state', { headers, body: JSON.stringify({ user_id: 'attacker', state: { version: 1 } }) }), { env: ENV, fetch: fetchImpl });
  assert.equal(put.status, 200);
  const rest = calls.filter((c) => c.url.includes('/rest/v1/'));
  assert.ok(rest[0].url.includes(`user_id=eq.${USER_ID}`));
  assert.ok(rest[1].url.endsWith('fit30_accounts?on_conflict=user_id'));
  assert.equal(rest[1].init.headers.Prefer, 'resolution=merge-duplicates,return=representation');
  assert.equal(JSON.parse(rest[1].init.body)[0].user_id, USER_ID);
  assert.equal(rest[1].init.headers.apikey, SERVICE);
  const bad = await handleAccountState(req('PUT', 'account-state', { headers, body: JSON.stringify({ state: [1, 2] }) }), { env: ENV, fetch: fetchImpl });
  assert.equal(bad.status, 413);
  assert.equal((await bad.json()).error, 'invalid_state');
  const empty = await handleAccountState(req('GET', 'account-state', { headers }), { env: ENV, fetch: fakeSupabase([], { rows: [] }) });
  assert.equal(empty.status, 404);
  assert.equal((await empty.json()).error, 'no_state');
});

test('account dialog renders the not-configured state', () => {
  const html = core.renderAccountDialog({ status: 'disabled', message: 'Accounts are not configured on this site.' });
  assert.match(html, /data-state="disabled"/);
  assert.match(html, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(html, /stays in this browser/);
  assert.doesNotMatch(html, /account-sign-in/);
});

test('account dialog renders the signed-out state', () => {
  const html = core.renderAccountDialog({ status: 'signed-out' });
  assert.match(html, /data-state="signed-out"/);
  assert.match(html, /Continue with Google/);
  assert.match(html, /No account required/);
  assert.match(html, /privacy\.html/);
});

test('account dialog renders the signed-in state and escapes a hostile name', () => {
  const evil = '<script>alert("x")</script>';
  const snap = { status: 'signed-in', user: { name: evil, email: 'a@example.org' }, syncEnabled: true, lastUpload: '2026-03-01T10:00:00Z' };
  const html = core.renderAccountDialog(snap);
  assert.match(html, /data-state="signed-in"/);
  for (const a of ['account-sync-toggle', 'account-sync-now', 'account-sign-out', 'account-restore', 'account-replace-cloud', 'account-delete-cloud', 'account-delete-account']) {
    assert.match(html, new RegExp(`data-action="${a}"`));
  }
  assert.match(html, /Turn sync off/);
  assert.match(html, /<details class="danger-zone">/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  const button = core.renderAccountButton(snap);
  assert.match(button, /&lt;/);
  assert.doesNotMatch(button, /<script>/);
  assert.match(core.renderAccountButton({ status: 'signed-out' }), /Sign in/);
  for (const kind of ['both', 'restore', 'upload']) assert.doesNotMatch(core.renderMergePrompt(kind), /undefined/);
  assert.match(core.renderMergePrompt('both'), /Keep this device[\s\S]*Use cloud copy[\s\S]*Keep both/);
});
