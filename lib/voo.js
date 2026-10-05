'use strict';
/*
 * Joinvoo's one Voo Connect setup (VooSquare: Voo ID login, affiliate hand-off, money events, support).
 * The kit itself lives in ../voo-connect (copied unchanged from the VooSquare repo, sdk/voo-connect; never edit it).
 *
 * Joinvoo's VooSquare settings can be changed in Admin → Settings → Integrations → VooSquare while the server runs, so
 * the kit is built lazily from the current settings and rebuilt when they change. Everything is off (kit() returns null)
 * until a VooSquare address is set (VOO_BASE, or the admin field).
 *
 *   const voo = require('./lib/voo')({ config: () => ({ base, clientId, ... }), store, log });
 *   const k = voo.kit();            // null when not configured
 *   voo.stats()                     // { enabled, pending, failed, last_error, last_sent_at, sent }
 */
const VC = require('../voo-connect');

module.exports = function makeVoo({ config, store, log = () => {} }) {
  let cur = null; let curKey = '';
  const st = { last_error: null, error_at: null, last_sent_at: null, sent: 0, rejected: [], log: [] }; // log: [time, events stored] of the last 24 h

  function kit() {
    const c = config();
    if (!c || !c.base || !/^https?:\/\//.test(c.base)) { if (cur) { cur.events.stop(); cur = null; curKey = ''; } return null; }
    const key = JSON.stringify([c.base, c.serverBase, c.clientId, c.clientSecret, c.apiKey, c.redirectUri, c.signalSecret, c.secureCookies, c.backoffMs]);
    if (cur && key === curKey) return cur;
    if (cur) cur.events.stop(); // settings changed: the new kit loads the same outbox from the database
    cur = VC.createVooConnect({
      base: c.base, serverBase: c.serverBase || undefined, clientId: c.clientId, clientSecret: c.clientSecret, apiKey: c.apiKey,
      redirectUri: c.redirectUri, eventPrefix: 'jv', store, signalSecret: c.signalSecret, secureCookies: c.secureCookies,
      backoffMs: c.backoffMs || 1000, toolName: 'Joinvoo', defaultReturnTo: '/app',
      onError: (e) => { st.last_error = String(e && e.message || e).slice(0, 300); st.error_at = Date.now(); log('voo events:', st.last_error); },
      onRejected: (ev, error) => { st.rejected.push({ event_id: ev.event_id, type: ev.type, error: String(error).slice(0, 200), at: Date.now() }); if (st.rejected.length > 50) st.rejected.shift(); log('voo events: VooSquare refused', ev.event_id, error); },
    });
    curKey = key;
    return cur;
  }
  /** Sends what is due now (also called by the timer the kit runs). Records the last success for Admin → Health. */
  async function flush() {
    const k = kit(); if (!k || !config().apiKey) return null;
    const t0 = Date.now();
    const r = await k.events.flush();
    if (r && r.calls && !(st.error_at >= t0)) { st.sent += r.stored; st.last_sent_at = Date.now(); st.last_error = null; if (r.stored) st.log.push([Date.now(), r.stored]); }
    while (st.log.length && st.log[0][0] < Date.now() - 864e5) st.log.shift();
    return r;
  }
  function stats() {
    const k = cur; const c = config() || {};
    const pending = k ? k.events.pending() : (store.load() || []).map((x) => x.event);
    return { enabled: !!(c.base && c.apiKey), url: c.base ? (c.serverBase || c.base) + '/api/v1/events' : '', pending: pending.length,
      oldest_pending_at: (store.load() || []).reduce((m, x) => (x.queued_at && (!m || x.queued_at < m) ? x.queued_at : m), null),
      failed: k ? k.events.failures().length : 0, last_error: st.last_error, error_at: st.error_at, last_sent_at: st.last_sent_at, sent: st.sent,
      sent_24h: st.log.filter((x) => x[0] >= Date.now() - 864e5).reduce((a, x) => a + x[1], 0), rejected: st.rejected.slice(-10) };
  }
  /** Queue an event; never throws (a bad event is a bug: it is logged, the money flow goes on). */
  function track(fn) {
    const k = kit(); if (!k) return null;
    try { return fn(k); } catch (e) { log('voo event refused by the kit:', e.message); st.last_error = 'kit: ' + e.message; st.error_at = Date.now(); return null; }
  }
  return { kit, flush, stats, track, VooError: VC.VooError, runChecks: require('../voo-connect/check.js').runChecks };
};
