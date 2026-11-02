/* Fit30 Reset — optional Google sign-in and one-record cloud sync via Supabase.
   Dependency-free. The service-role key never reaches the browser: only the
   public anon key and project URL are fetched from /.netlify/functions/account-config. */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  var AUTH_KEY = 'fit30.auth.v1';
  var SYNC_KEY = 'fit30.sync.v1';
  var VERIFIER_KEY = 'fit30.pkce.verifier';
  var DEBOUNCE_MS = 1800;
  var REFRESH_MARGIN_S = 90;
  var FN = '/.netlify/functions/';

  var config = null;
  var status = 'loading';
  var message = '';
  var lastError = '';
  var busy = false;
  var auth = read(AUTH_KEY, window.localStorage);
  var sync = read(SYNC_KEY, window.localStorage) || { enabled: false, lastUpload: null, lastHash: null };
  var hooks = { getState: function () { return null; } };
  var listeners = [];
  var timer = null;
  var pending = false;
  var justSignedIn = false;
  var refreshing = null;

  function read(key, store) {
    try { var v = store.getItem(key); var o = v ? JSON.parse(v) : null; return o && typeof o === 'object' ? o : null; } catch (e) { return null; }
  }
  function write(key, value, store) {
    try { if (value === null) store.removeItem(key); else store.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
  }
  function saveAuth() { write(AUTH_KEY, auth, window.localStorage); }
  function saveSync() { write(SYNC_KEY, sync, window.localStorage); }

  function snapshot() {
    return {
      status: status,
      configured: !!(config && config.enabled),
      message: message,
      user: auth && auth.user ? { name: auth.user.name || '', email: auth.user.email || '' } : null,
      syncEnabled: !!(auth && sync.enabled),
      lastUpload: sync.lastUpload || null,
      busy: busy,
      error: lastError
    };
  }
  function emit() {
    var s = snapshot();
    listeners.forEach(function (fn) { try { fn(s); } catch (e) { /* listener error */ } });
  }
  function setError(msg) { lastError = msg || ''; emit(); }

  function b64url(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function makeVerifier() { var a = new Uint8Array(32); crypto.getRandomValues(a); return b64url(a); }
  function challengeFor(verifier) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)).then(function (d) { return b64url(new Uint8Array(d)); });
  }

  function hashState(state) {
    var copy;
    try { copy = JSON.parse(JSON.stringify(state)); } catch (e) { return null; }
    if (copy && copy.meta) delete copy.meta.lastSaved;
    var str = JSON.stringify(copy);
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16) + ':' + str.length;
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('The request timed out.')); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }
  function readJSON(res) { return res.text().then(function (t) { try { return t ? JSON.parse(t) : {}; } catch (e) { return {}; } }); }

  function userFrom(u) {
    if (!u || typeof u !== 'object') return null;
    var meta = u.user_metadata || {};
    return { id: String(u.id || ''), email: String(u.email || '').slice(0, 200), name: String(meta.full_name || meta.name || '').slice(0, 120) };
  }

  function storeSession(data) {
    var now = Math.floor(Date.now() / 1000);
    var expiresAt = Number(data.expires_at) || (now + (Number(data.expires_in) || 3600));
    auth = {
      accessToken: String(data.access_token || ''),
      refreshToken: String(data.refresh_token || (auth && auth.refreshToken) || ''),
      expiresAt: expiresAt,
      user: userFrom(data.user) || (auth && auth.user) || null
    };
    saveAuth();
  }

  function authFetch(path, opts) {
    var o = opts || {};
    o.headers = Object.assign({ apikey: config.supabaseAnonKey, 'Content-Type': 'application/json' }, o.headers || {});
    return withTimeout(fetch(config.supabaseUrl + path, o), 12000);
  }

  function refreshSession() {
    if (!auth || !auth.refreshToken) return Promise.reject(new Error('Not signed in.'));
    if (refreshing) return refreshing;
    refreshing = authFetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: auth.refreshToken }) })
      .then(function (res) {
        return readJSON(res).then(function (data) {
          if (!res.ok || !data.access_token) { var err = new Error('Your session has expired. Please sign in again.'); err.authFailed = res.status >= 400 && res.status < 500; throw err; }
          storeSession(data);
          return auth.accessToken;
        });
      })
      .then(function (t) { refreshing = null; return t; }, function (e) { refreshing = null; throw e; });
    return refreshing;
  }

  function validToken(force) {
    if (!auth || !auth.accessToken) return Promise.reject(new Error('Not signed in.'));
    var now = Math.floor(Date.now() / 1000);
    if (!force && auth.expiresAt - REFRESH_MARGIN_S > now) return Promise.resolve(auth.accessToken);
    return refreshSession().catch(function (err) {
      if (err && err.authFailed) clearSession();
      throw err;
    });
  }

  function api(method, name, body, opts) {
    var retried = false;
    function attempt(force) {
      return validToken(force).then(function (token) {
        var init = { method: method, headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } };
        if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = body; }
        if (opts && opts.keepalive) init.keepalive = true;
        return withTimeout(fetch(FN + name, init), 20000);
      }).then(function (res) {
        if (res.status === 401 && !retried) { retried = true; return attempt(true); }
        if (res.status === 401) {
          clearSession();
          throw new Error('Your session has expired. Please sign in again.');
        }
        return res;
      });
    }
    return attempt(false);
  }

  function clearSession() {
    auth = null;
    write(AUTH_KEY, null, window.localStorage);
    sync.enabled = false;
    saveSync();
    if (timer) { clearTimeout(timer); timer = null; }
    pending = false;
    if (config && config.enabled) status = 'signed-out';
    emit();
  }

  function cleanUrl() {
    try { window.history.replaceState(null, '', window.location.pathname); } catch (e) { /* ignore */ }
  }

  function handleRedirect() {
    var params = new URLSearchParams(window.location.search);
    var hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    var errorText = params.get('error_description') || params.get('error') || hash.get('error_description') || hash.get('error');
    var code = params.get('code');
    if (errorText) { cleanUrl(); lastError = 'Sign-in did not complete: ' + String(errorText).slice(0, 200); return Promise.resolve(); }
    if (code) {
      var verifier = null;
      try { verifier = window.sessionStorage.getItem(VERIFIER_KEY); window.sessionStorage.removeItem(VERIFIER_KEY); } catch (e) { verifier = null; }
      cleanUrl();
      if (!verifier) { lastError = 'Sign-in could not be completed in this tab. Please try again.'; return Promise.resolve(); }
      return authFetch('/auth/v1/token?grant_type=pkce', { method: 'POST', body: JSON.stringify({ auth_code: code, code_verifier: verifier }) }).then(function (res) {
        return readJSON(res).then(function (data) {
          if (!res.ok || !data.access_token) throw new Error('Sign-in could not be completed. Please try again.');
          storeSession(data);
          justSignedIn = true;
        });
      }).catch(function (err) { lastError = err.message; });
    }
    if (hash.get('access_token')) {
      var data = { access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token'), expires_in: hash.get('expires_in'), expires_at: hash.get('expires_at') };
      cleanUrl();
      storeSession(data);
      return authFetch('/auth/v1/user', { headers: { Authorization: 'Bearer ' + auth.accessToken } }).then(function (res) {
        return readJSON(res).then(function (u) {
          if (!res.ok) throw new Error('Sign-in could not be verified.');
          auth.user = userFrom(u); saveAuth(); justSignedIn = true;
        });
      }).catch(function (err) { clearSession(); lastError = err.message; });
    }
    return Promise.resolve();
  }

  function init(opts) {
    if (opts && typeof opts.getState === 'function') hooks.getState = opts.getState;
    status = 'loading'; emit();
    return withTimeout(fetch(FN + 'account-config', { headers: { Accept: 'application/json' } }), 8000)
      .then(function (res) { return readJSON(res).then(function (d) { return { ok: res.ok, data: d }; }); })
      .catch(function () { return { ok: false, data: null }; })
      .then(function (r) {
        var d = r.data || {};
        if (!r.ok || !d.enabled || typeof d.supabaseUrl !== 'string' || !/^https:\/\//.test(d.supabaseUrl) || typeof d.supabaseAnonKey !== 'string') {
          config = { enabled: false };
          status = 'disabled';
          message = r.ok && d.message ? String(d.message).slice(0, 400) : 'The account service is not available on this host (for example, a local preview without Netlify Functions). Everything stays on this device.';
          emit();
          return snapshot();
        }
        config = { enabled: true, supabaseUrl: d.supabaseUrl.replace(/\/+$/, ''), supabaseAnonKey: d.supabaseAnonKey };
        return handleRedirect().then(function () {
          status = auth && auth.accessToken ? 'signed-in' : 'signed-out';
          emit();
          if (auth) return validToken(false).then(function () { emit(); }).catch(function (e) { setError(e.message); });
        }).then(function () {
          window.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
          window.addEventListener('beforeunload', function () { flush(); });
          return snapshot();
        });
      });
  }

  function signIn() {
    if (!config || !config.enabled) return Promise.reject(new Error('Accounts are not configured on this site.'));
    var verifier = makeVerifier();
    try { window.sessionStorage.setItem(VERIFIER_KEY, verifier); } catch (e) { return Promise.reject(new Error('This browser is blocking session storage, which sign-in needs.')); }
    return challengeFor(verifier).then(function (challenge) {
      var redirect = window.location.origin + window.location.pathname;
      window.location.assign(config.supabaseUrl + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(redirect) +
        '&code_challenge=' + encodeURIComponent(challenge) + '&code_challenge_method=s256');
    });
  }

  function signOut() {
    var token = auth && auth.accessToken;
    var p = token && config && config.enabled ? authFetch('/auth/v1/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } }).catch(function () { return null; }) : Promise.resolve();
    return p.then(function () { clearSession(); lastError = ''; emit(); });
  }

  function pull() {
    if (!auth) return Promise.reject(new Error('Sign in first.'));
    busy = true; emit();
    return api('GET', 'account-state').then(function (res) {
      return readJSON(res).then(function (d) {
        if (res.status === 404) return null;
        if (!res.ok || !d.state || typeof d.state !== 'object') throw new Error('Could not download the cloud copy (status ' + res.status + ').');
        return { state: d.state, updatedAt: d.updatedAt || null };
      });
    }).then(function (v) { busy = false; lastError = ''; emit(); return v; }, function (e) { busy = false; setError(e.message); throw e; });
  }

  function push(opts) {
    if (!auth) return Promise.reject(new Error('Sign in first.'));
    var state = hooks.getState();
    if (!state || typeof state !== 'object') return Promise.resolve(false);
    var h = hashState(state);
    if (!(opts && opts.force) && h && h === sync.lastHash) { pending = false; return Promise.resolve(false); }
    var body = JSON.stringify({ state: state });
    pending = false;
    busy = true; emit();
    return api('PUT', 'account-state', body, opts).then(function (res) {
      return readJSON(res).then(function (d) {
        if (!res.ok) throw new Error(res.status === 413 ? 'Your data is too large to sync (limit about 1.8 MB). Export a backup instead.' : (d && d.message) || 'Upload failed (status ' + res.status + ').');
        sync.lastUpload = d.updatedAt || new Date().toISOString();
        sync.lastHash = h;
        saveSync();
        return true;
      });
    }).then(function (v) { busy = false; lastError = ''; emit(); return v; }, function (e) { busy = false; setError(e.message); throw e; });
  }

  function deleteCloud() {
    return api('DELETE', 'account-state').then(function (res) {
      if (!res.ok && res.status !== 404) throw new Error('Could not delete the cloud copy (status ' + res.status + ').');
      sync.enabled = false; sync.lastHash = null; sync.lastUpload = null; saveSync(); emit();
      return true;
    });
  }

  function deleteAccount() {
    return api('DELETE', 'account-delete').then(function (res) {
      return readJSON(res).then(function (d) {
        if (res.ok) { sync.lastHash = null; sync.lastUpload = null; clearSession(); return true; }
        if (d && d.error === 'account_delete_partial') {
          clearSession();
          throw new Error('Your sign-in was deleted, but the cloud copy could not be removed. It is no longer linked to a login; contact the site operator to have it removed.');
        }
        throw new Error('The account could not be deleted, and nothing was removed. Please try again later.');
      });
    });
  }

  function setSyncEnabled(on) {
    sync.enabled = !!on && !!auth;
    if (!sync.enabled && timer) { clearTimeout(timer); timer = null; pending = false; }
    saveSync(); emit();
  }

  function queuePush() {
    if (!auth || !sync.enabled) return;
    pending = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; push().catch(function () { /* surfaced via snapshot error */ }); }, DEBOUNCE_MS);
  }

  function flush() {
    if (!pending || !auth || !sync.enabled) return Promise.resolve(false);
    if (timer) { clearTimeout(timer); timer = null; }
    return push({ keepalive: true }).catch(function () { return false; });
  }

  function markSynced() {
    var state = hooks.getState();
    sync.lastHash = state ? hashState(state) : null;
    saveSync();
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
  }

  function consumeJustSignedIn() { var v = justSignedIn; justSignedIn = false; return v; }

  window.Fit30Account = {
    init: init, signIn: signIn, signOut: signOut, pull: pull, push: push, deleteCloud: deleteCloud, deleteAccount: deleteAccount,
    setSyncEnabled: setSyncEnabled, queuePush: queuePush, flush: flush, getState: snapshot, onChange: onChange,
    consumeJustSignedIn: consumeJustSignedIn, markSynced: markSynced
  };
})();
