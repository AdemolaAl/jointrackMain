'use strict';
/*
 * Joinvoo — Telegram join tracking for Meta and TikTok ads.
 * Zero dependencies. Node 22.5+ (uses the built-in node:sqlite).
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// ---------- config ----------
const env = process.env;
const PORT = +env.PORT || 3000;
const BASE_URL = (env.BASE_URL || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : `http://localhost:${PORT}`)).replace(/\/$/, '');
const DATA_DIR = env.DATA_DIR || env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const TG_API = (env.TG_API || 'https://api.telegram.org').replace(/\/$/, '');
const GRAPH_API = (env.GRAPH_API || 'https://graph.facebook.com').replace(/\/$/, '');
const GRAPH_VERSION = env.GRAPH_VERSION || 'v24.0';
const TIKTOK_API = (env.TIKTOK_API || 'https://business-api.tiktok.com').replace(/\/$/, '');
const SNAP_API = (env.SNAP_API || 'https://tr.snapchat.com').replace(/\/$/, '');
const SUPPORT_TG_BOT_TOKEN = env.SUPPORT_TG_BOT_TOKEN || '', SUPPORT_TG_CHAT_ID = env.SUPPORT_TG_CHAT_ID || ''; // optional: get pinged on Telegram for new support messages
const POOL_SIZE = +env.POOL_SIZE || 200;              // ready links kept per channel
const LINK_INTERVAL_MS = +env.LINK_INTERVAL_MS || 1500; // min gap between link creations per bot
const RECYCLE_MIN = +env.RECYCLE_MIN || 120;          // unused links go back to the pool after this
const CLICK_RETENTION_DAYS = +env.CLICK_RETENTION_DAYS || 90; // raw clicks that never joined
const SECURE = BASE_URL.startsWith('https');
// Most business settings (pricing, feature switches, payment methods, support team, brand) are edited in /admin → Settings
// and stored in the `settings` table. The environment variables below are only their starting defaults. See SETTING_DEFS.
const PAYSTACK_API = (env.PAYSTACK_API_BASE || env.PAYSTACK_API || 'https://api.paystack.co').replace(/\/$/, ''), FLW_API = (env.FLW_API || 'https://api.flutterwave.com').replace(/\/$/, ''); // overridable for testing
const STRIPE_API = (env.STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/$/, '');
const BILLING = env.BILLING !== 'off';                     // set BILLING=off to run free (e.g. only for yourself)
const ADMIN_EMAILS = String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
const RESEND_ENV_KEY = env.RESEND_API_KEY || ''; // the admin can override it (Settings → Integrations & API keys); read via resendKey()
const MAIL_FROM_ENV = env.MAIL_FROM || 'Joinvoo <hello@joinvoo.com>';
const MAIL_FROM_ADDR = (/<([^>]+)>/.exec(MAIL_FROM_ENV) || [, MAIL_FROM_ENV])[1].trim();
const envNum = (k, d) => (env[k] !== undefined && env[k] !== '' && Number.isFinite(+env[k]) ? +env[k] : d);
const envBool = (k, d) => (env[k] === undefined || env[k] === '' ? d : !/^(false|0|off|no)$/i.test(env[k]));
const TRUST_CLOUDFLARE = env.TRUST_CLOUDFLARE === '1' || env.TRUST_CLOUDFLARE === 'true'; // only when traffic really comes through Cloudflare's proxy // e.g. https://t.me/yoursupport — shown in the dashboard and guide

fs.mkdirSync(DATA_DIR, { recursive: true });
const secretFile = path.join(DATA_DIR, '.secret');
const APP_SECRET = env.APP_SECRET || (fs.existsSync(secretFile)
  ? fs.readFileSync(secretFile, 'utf8')
  : (() => { const s = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(secretFile, s); return s; })());

// ---------- database ----------
const db = new DatabaseSync(path.join(DATA_DIR, 'joinvoo.db'));
db.exec(`
PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, pass TEXT NOT NULL, created_at INTEGER);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER);
CREATE TABLE IF NOT EXISTS bots(id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, tg_id INTEGER NOT NULL, username TEXT,
  token TEXT, secret TEXT, status TEXT DEFAULT 'active', cooldown_until INTEGER DEFAULT 0, created_at INTEGER);
CREATE INDEX IF NOT EXISTS bots_tg ON bots(tg_id);
CREATE TABLE IF NOT EXISTS channels(id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL, bot_id INTEGER, chat_id INTEGER NOT NULL,
  title TEXT, type TEXT, username TEXT, slug TEXT UNIQUE, fallback_link TEXT, pixel_id TEXT, capi_token TEXT, test_code TEXT,
  event_name TEXT DEFAULT 'Subscribe', status TEXT DEFAULT 'active', created_at INTEGER, UNIQUE(owner_id, chat_id));
CREATE TABLE IF NOT EXISTS channel_bots(channel_id INTEGER, bot_id INTEGER, can_invite INTEGER, PRIMARY KEY(channel_id, bot_id));
CREATE TABLE IF NOT EXISTS links(id INTEGER PRIMARY KEY, channel_id INTEGER, bot_id INTEGER, url TEXT UNIQUE, status TEXT,
  click_id INTEGER, assigned_at INTEGER, created_at INTEGER);
CREATE INDEX IF NOT EXISTS links_pool ON links(channel_id, status);
CREATE INDEX IF NOT EXISTS links_assigned ON links(status, assigned_at);
CREATE TABLE IF NOT EXISTS clicks(id INTEGER PRIMARY KEY, owner_id INTEGER, channel_id INTEGER, ts INTEGER, ip TEXT, ua TEXT,
  country TEXT, fbclid TEXT, fbc TEXT, fbp TEXT, page_url TEXT, params TEXT, link_id INTEGER, joined INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS clicks_ts ON clicks(ts);
CREATE TABLE IF NOT EXISTS joins(id INTEGER PRIMARY KEY, owner_id INTEGER, channel_id INTEGER, click_id INTEGER,
  tg_user_id INTEGER, first_name TEXT, last_name TEXT, username TEXT, lang TEXT, is_premium INTEGER,
  joined_at INTEGER, left_at INTEGER, capi_status TEXT, capi_error TEXT);
CREATE INDEX IF NOT EXISTS joins_owner ON joins(owner_id, joined_at);
CREATE INDEX IF NOT EXISTS joins_user ON joins(channel_id, tg_user_id);
CREATE TABLE IF NOT EXISTS hourly(channel_id INTEGER, hour INTEGER, owner_id INTEGER, clicks INTEGER DEFAULT 0,
  joins INTEGER DEFAULT 0, organic INTEGER DEFAULT 0, leaves INTEGER DEFAULT 0, capi_ok INTEGER DEFAULT 0,
  capi_fail INTEGER DEFAULT 0, PRIMARY KEY(channel_id, hour));
CREATE INDEX IF NOT EXISTS hourly_owner ON hourly(owner_id, hour);
CREATE TABLE IF NOT EXISTS capi_queue(id INTEGER PRIMARY KEY, channel_id INTEGER, join_id INTEGER, payload TEXT,
  attempts INTEGER DEFAULT 0, next_at INTEGER, status TEXT DEFAULT 'pending', created_at INTEGER);
CREATE INDEX IF NOT EXISTS capi_due ON capi_queue(status, next_at);
`);
// Columns added after the first version (safe to run every start).
for (const sql of [
  `ALTER TABLE channels ADD COLUMN tt_pixel TEXT`, `ALTER TABLE channels ADD COLUMN tt_token TEXT`,
  `ALTER TABLE channels ADD COLUMN tt_test_code TEXT`, `ALTER TABLE channels ADD COLUMN tt_event TEXT DEFAULT 'Subscribe'`,
  `ALTER TABLE clicks ADD COLUMN ttclid TEXT`, `ALTER TABLE clicks ADD COLUMN ttp TEXT`,
  `ALTER TABLE joins ADD COLUMN tt_status TEXT`, `ALTER TABLE joins ADD COLUMN tt_error TEXT`,
  `ALTER TABLE capi_queue ADD COLUMN platform TEXT DEFAULT 'meta'`, `ALTER TABLE channels ADD COLUMN welcome TEXT`, `ALTER TABLE channels ADD COLUMN btn_text TEXT`, `ALTER TABLE channels ADD COLUMN btn_url TEXT`, `ALTER TABLE channels ADD COLUMN forward_url TEXT`,
  `ALTER TABLE hourly ADD COLUMN tt_ok INTEGER DEFAULT 0`, `ALTER TABLE users ADD COLUMN ref_code TEXT`, `ALTER TABLE users ADD COLUMN referred_by INTEGER`, `ALTER TABLE users ADD COLUMN credit_cents INTEGER DEFAULT 0`, `ALTER TABLE users ADD COLUMN name TEXT`, `ALTER TABLE users ADD COLUMN profile TEXT`,
  `CREATE TABLE IF NOT EXISTS deposits(id INTEGER PRIMARY KEY, user_id INTEGER, provider TEXT, reference TEXT UNIQUE, amount_cents INTEGER, local_amount INTEGER, currency TEXT, status TEXT DEFAULT 'pending', tx TEXT, created_at INTEGER, paid_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS payouts(id INTEGER PRIMARY KEY, user_id INTEGER, amount_cents INTEGER, method TEXT, details TEXT, status TEXT DEFAULT 'pending', created_at INTEGER)`, `ALTER TABLE hourly ADD COLUMN tt_fail INTEGER DEFAULT 0`,
  // money: every change to a balance is one ledger row; users.balance_cents is the running total
  `CREATE TABLE IF NOT EXISTS ledger(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT, amount_cents INTEGER NOT NULL, ref TEXT UNIQUE, note TEXT, created_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, id)`,
  `CREATE TABLE IF NOT EXISTS usage(user_id INTEGER, month TEXT, joins INTEGER DEFAULT 0, PRIMARY KEY(user_id, month))`,
  `CREATE TABLE IF NOT EXISTS ref_earnings(id INTEGER PRIMARY KEY, referrer_id INTEGER, from_user INTEGER, deposit_id INTEGER UNIQUE, amount_cents INTEGER, rate REAL, created_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS ref_earn_user ON ref_earnings(referrer_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS deposits_tx ON deposits(tx) WHERE tx IS NOT NULL AND provider='crypto'`,
  `CREATE TABLE IF NOT EXISTS resets(token_hash TEXT PRIMARY KEY, user_id INTEGER, expires_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS hits(k TEXT PRIMARY KEY, n INTEGER, reset_at INTEGER)`,
  `ALTER TABLE users ADD COLUMN balance_cents INTEGER DEFAULT 0`, `ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'`,
  `ALTER TABLE users ADD COLUMN paused_at INTEGER`, `ALTER TABLE users ADD COLUMN last_seen INTEGER`, `ALTER TABLE users ADD COLUMN verified_at INTEGER`, `ALTER TABLE users ADD COLUMN free_joins INTEGER DEFAULT 0`, `ALTER TABLE channels ADD COLUMN forward_secret TEXT`, `ALTER TABLE channels ADD COLUMN ext INTEGER DEFAULT 0`, `ALTER TABLE users ADD COLUMN canon TEXT`,
  `ALTER TABLE payouts ADD COLUMN tx TEXT`, `ALTER TABLE payouts ADD COLUMN paid_at INTEGER`, `ALTER TABLE deposits ADD COLUMN note TEXT`,
  `ALTER TABLE ref_earnings ADD COLUMN ref TEXT`, `ALTER TABLE ref_earnings ADD COLUMN base_cents INTEGER DEFAULT 0`, `CREATE UNIQUE INDEX IF NOT EXISTS ref_earn_ref ON ref_earnings(ref)`,
  `ALTER TABLE channels ADD COLUMN sc_pixel TEXT`, `ALTER TABLE channels ADD COLUMN sc_token TEXT`, `ALTER TABLE channels ADD COLUMN sc_test INTEGER DEFAULT 0`, `ALTER TABLE channels ADD COLUMN sc_event TEXT DEFAULT 'SUBSCRIBE'`,
  `ALTER TABLE clicks ADD COLUMN sccid TEXT`, `ALTER TABLE clicks ADD COLUMN scid TEXT`, `ALTER TABLE joins ADD COLUMN sc_status TEXT`, `ALTER TABLE joins ADD COLUMN sc_error TEXT`,
  `ALTER TABLE hourly ADD COLUMN sc_ok INTEGER DEFAULT 0`, `ALTER TABLE hourly ADD COLUMN sc_fail INTEGER DEFAULT 0`, `ALTER TABLE capi_queue ADD COLUMN conv_id INTEGER`,
  `ALTER TABLE users ADD COLUMN pb_key TEXT`,
  `CREATE TABLE IF NOT EXISTS conversions(id INTEGER PRIMARY KEY, owner_id INTEGER, channel_id INTEGER, join_id INTEGER, tg_user_id INTEGER, event TEXT, value_cents INTEGER DEFAULT 0,
    currency TEXT, txid TEXT, source TEXT, matched INTEGER DEFAULT 1, raw TEXT, created_at INTEGER, meta_status TEXT, tt_status TEXT, sc_status TEXT, error TEXT)`,
  `CREATE INDEX IF NOT EXISTS conv_owner ON conversions(owner_id, created_at)`, `CREATE INDEX IF NOT EXISTS conv_join ON conversions(join_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS conv_tx ON conversions(owner_id, event, txid) WHERE txid IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS joins_click ON joins(click_id)`,
  `CREATE TABLE IF NOT EXISTS tickets(id INTEGER PRIMARY KEY, user_id INTEGER, visitor TEXT, email TEXT, name TEXT, status TEXT DEFAULT 'open', last_at INTEGER, unread_admin INTEGER DEFAULT 0, unread_user INTEGER DEFAULT 0, created_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS tickets_user ON tickets(user_id)`, `CREATE INDEX IF NOT EXISTS tickets_vis ON tickets(visitor)`,
  `CREATE TABLE IF NOT EXISTS ticket_msgs(id INTEGER PRIMARY KEY, ticket_id INTEGER, from_admin INTEGER, body TEXT, created_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS ticket_msgs_t ON ticket_msgs(ticket_id, id)`,
  `ALTER TABLE bots ADD COLUMN prev_webhook TEXT`, `ALTER TABLE bots ADD COLUMN health TEXT`, `ALTER TABLE channels ADD COLUMN landing TEXT DEFAULT 'auto'`,
  // admin-managed settings, payment methods, email log
  `CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS pay_methods(id TEXT PRIMARY KEY, type TEXT NOT NULL, label TEXT, note TEXT, currency TEXT, address TEXT, instructions TEXT, explorer TEXT, enabled INTEGER DEFAULT 1, sort INTEGER DEFAULT 0, created_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS email_log(id INTEGER PRIMARY KEY, user_id INTEGER, kind TEXT, ref TEXT, to_addr TEXT, subject TEXT, ok INTEGER, sent_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS email_log_u ON email_log(user_id, kind, sent_at)`,
  `ALTER TABLE deposits ADD COLUMN method_id TEXT`, `ALTER TABLE deposits ADD COLUMN label TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS deposits_mtx ON deposits(method_id, tx) WHERE tx IS NOT NULL AND provider='manual'`,
  `ALTER TABLE ticket_msgs ADD COLUMN agent_email TEXT`,
  // phase A: richer conversions, affiliate integrations, join requests, fake clicks, spend, credits/loyalty, sales leads, alerts
  `ALTER TABLE conversions ADD COLUMN rejected INTEGER DEFAULT 0`, `ALTER TABLE conversions ADD COLUMN network TEXT`,
  `CREATE TABLE IF NOT EXISTS integrations(id TEXT PRIMARY KEY, name TEXT, logo TEXT, category TEXT, postback_template TEXT, macros_note TEXT, verified INTEGER DEFAULT 0,
    docs_url TEXT, events TEXT, setup_steps TEXT, sort INTEGER DEFAULT 0, created_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS user_integrations(user_id INTEGER, integration_id TEXT, connected_at INTEGER, last_event_at INTEGER, PRIMARY KEY(user_id, integration_id))`,
  `ALTER TABLE channels ADD COLUMN join_mode TEXT DEFAULT 'link'`, `ALTER TABLE channels ADD COLUMN offer_text TEXT`, `ALTER TABLE channels ADD COLUMN offer_btn TEXT`, `ALTER TABLE channels ADD COLUMN offer_url TEXT`,
  `ALTER TABLE links ADD COLUMN req INTEGER DEFAULT 0`,
  `ALTER TABLE clicks ADD COLUMN suspect INTEGER DEFAULT 0`, `ALTER TABLE clicks ADD COLUMN suspect_reason TEXT`, `ALTER TABLE hourly ADD COLUMN suspect INTEGER DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS spend(id INTEGER PRIMARY KEY, owner_id INTEGER, date TEXT, platform TEXT, campaign TEXT, amount_cents INTEGER, currency TEXT, created_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS spend_owner ON spend(owner_id, date)`,
  `CREATE TABLE IF NOT EXISTS promos(code TEXT PRIMARY KEY, bonus_pct REAL DEFAULT 0, extra_cents INTEGER DEFAULT 0, max_uses INTEGER, used INTEGER DEFAULT 0, ends_at INTEGER, min_cents INTEGER DEFAULT 0,
    featured INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at INTEGER)`,
  `ALTER TABLE deposits ADD COLUMN promo TEXT`,
  `ALTER TABLE users ADD COLUMN custom_pricing TEXT`, `ALTER TABLE users ADD COLUMN alert_chat_id INTEGER`, `ALTER TABLE users ADD COLUMN alert_prefs TEXT`, `ALTER TABLE users ADD COLUMN alert_code TEXT`,
  `ALTER TABLE usage ADD COLUMN carry REAL DEFAULT 0`,
  `ALTER TABLE tickets ADD COLUMN tag TEXT`, `ALTER TABLE tickets ADD COLUMN meta TEXT`,
  // round 6: profile, plans + trial, levels, fraud joins, smart links, Joe
  `ALTER TABLE users ADD COLUMN nickname TEXT`, `ALTER TABLE users ADD COLUMN gender TEXT`, `ALTER TABLE users ADD COLUMN avatar TEXT`, `ALTER TABLE users ADD COLUMN lang TEXT`,
  `ALTER TABLE users ADD COLUMN tz TEXT`, `ALTER TABLE users ADD COLUMN ad_account_id TEXT`,
  `ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'basic'`, `ALTER TABLE users ADD COLUMN plan_pending TEXT`, `ALTER TABLE users ADD COLUMN plan_pending_from TEXT`,
  `ALTER TABLE users ADD COLUMN trial_started_at INTEGER`, `ALTER TABLE users ADD COLUMN trial_reset_at INTEGER`, `ALTER TABLE users ADD COLUMN trial_blocked INTEGER DEFAULT 0`, `ALTER TABLE users ADD COLUMN trial_ended_at INTEGER`,
  `ALTER TABLE users ADD COLUMN show_level INTEGER DEFAULT 1`, `ALTER TABLE users ADD COLUMN level_id TEXT`, `ALTER TABLE users ADD COLUMN level_since INTEGER`,
  `ALTER TABLE users ADD COLUMN level_peak INTEGER`, `ALTER TABLE users ADD COLUMN level_cycle INTEGER`, `ALTER TABLE users ADD COLUMN leads_30d INTEGER DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS trial_keys(k TEXT PRIMARY KEY, user_id INTEGER, created_at INTEGER)`,
  `ALTER TABLE joins ADD COLUMN suspect INTEGER DEFAULT 0`, `ALTER TABLE joins ADD COLUMN suspect_reason TEXT`, `ALTER TABLE hourly ADD COLUMN filtered INTEGER DEFAULT 0`,
  `CREATE INDEX IF NOT EXISTS joins_tg ON joins(owner_id, tg_user_id)`,
  `ALTER TABLE channels ADD COLUMN redirect_to INTEGER`,
  `CREATE TABLE IF NOT EXISTS joe_msgs(id INTEGER PRIMARY KEY, user_id INTEGER, role TEXT, text TEXT, at INTEGER)`, `CREATE INDEX IF NOT EXISTS joe_msgs_u ON joe_msgs(user_id, id)`,
  `CREATE TABLE IF NOT EXISTS joe_usage(user_id INTEGER, day TEXT, n INTEGER DEFAULT 0, PRIMARY KEY(user_id, day))`,
  `CREATE TABLE IF NOT EXISTS inbox(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT, title TEXT, body TEXT, image TEXT, cta_label TEXT, cta_url TEXT, important INTEGER DEFAULT 0,
    created_at INTEGER, read_at INTEGER, broadcast_id INTEGER, tag TEXT)`, `CREATE INDEX IF NOT EXISTS inbox_u ON inbox(user_id, id)`, `CREATE INDEX IF NOT EXISTS inbox_b ON inbox(broadcast_id)`,
  `CREATE INDEX IF NOT EXISTS inbox_tag ON inbox(user_id, tag)`,
  `CREATE TABLE IF NOT EXISTS broadcasts(id INTEGER PRIMARY KEY, title TEXT, body TEXT, image TEXT, cta_label TEXT, cta_url TEXT, important INTEGER DEFAULT 0, audience TEXT, also_email INTEGER DEFAULT 0,
    created_by TEXT, created_at INTEGER, sent_count INTEGER DEFAULT 0, read_count INTEGER DEFAULT 0)`,
  `ALTER TABLE users ADD COLUMN notify_prefs TEXT`,
  `ALTER TABLE users ADD COLUMN country TEXT`, `ALTER TABLE users ADD COLUMN country_changed_at INTEGER`, `ALTER TABLE users ADD COLUMN country_history TEXT`,
  `ALTER TABLE pay_methods ADD COLUMN countries TEXT`, `ALTER TABLE pay_methods ADD COLUMN logo TEXT`, `ALTER TABLE pay_methods ADD COLUMN fx_rate REAL`,
  `ALTER TABLE pay_methods ADD COLUMN min_usd REAL`, `ALTER TABLE pay_methods ADD COLUMN max_usd REAL`, `ALTER TABLE pay_methods ADD COLUMN fee_pct REAL`, `ALTER TABLE pay_methods ADD COLUMN config TEXT`, `ALTER TABLE deposits ADD COLUMN gateway_ref TEXT`,
  // round 10: staff accounts, roles, audit log, ticket assignment
  `CREATE TABLE IF NOT EXISTS roles(id TEXT PRIMARY KEY, name TEXT, perms TEXT, builtin INTEGER DEFAULT 0, sort INTEGER DEFAULT 0, created_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS staff(user_id INTEGER PRIMARY KEY, role TEXT NOT NULL, grants TEXT, revokes TEXT, status TEXT DEFAULT 'active', invited_by TEXT, created_at INTEGER, last_active INTEGER)`,
  `CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at INTEGER, actor_id INTEGER, actor_email TEXT, action TEXT, area TEXT, target TEXT, summary TEXT, ip TEXT)`,
  `CREATE INDEX IF NOT EXISTS audit_at ON audit(at)`, `CREATE INDEX IF NOT EXISTS audit_actor ON audit(actor_id, at)`,
  `ALTER TABLE tickets ADD COLUMN assigned_to TEXT`,
  // round 11: VooSquare (all additive)
  `ALTER TABLE users ADD COLUMN voo_id TEXT`, `CREATE UNIQUE INDEX IF NOT EXISTS users_voo ON users(voo_id) WHERE voo_id IS NOT NULL`, `ALTER TABLE users ADD COLUMN referred_by_voo TEXT`,
  `ALTER TABLE sessions ADD COLUMN via TEXT`, `ALTER TABLE sessions ADD COLUMN id_token TEXT`,
  `CREATE TABLE IF NOT EXISTS voo_outbox(id INTEGER PRIMARY KEY, event_id TEXT UNIQUE, body TEXT, attempts INTEGER DEFAULT 0, next_at INTEGER, sent_at INTEGER, last_error TEXT, created_at INTEGER, failed INTEGER DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS voo_outbox_due ON voo_outbox(sent_at, next_at)`,
  // round 13: Joe pay-as-you-go (additive)
  `ALTER TABLE users ADD COLUMN joe_autopay INTEGER DEFAULT 0`, `ALTER TABLE users ADD COLUMN joe_monthly_cap INTEGER`, `ALTER TABLE users ADD COLUMN joe_bonus INTEGER DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS joe_answers(id INTEGER PRIMARY KEY, user_id INTEGER, at INTEGER, day TEXT, provider TEXT, model TEXT, rounds INTEGER, in_tokens INTEGER DEFAULT 0, cache_write_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0, out_tokens INTEGER DEFAULT 0, cost_micros INTEGER DEFAULT 0, credits INTEGER DEFAULT 0, kind TEXT, deep INTEGER DEFAULT 0, guard INTEGER DEFAULT 0, error TEXT)`,
  `CREATE INDEX IF NOT EXISTS joe_answers_u ON joe_answers(user_id, day)`, `CREATE INDEX IF NOT EXISTS joe_answers_at ON joe_answers(at)`,
  `CREATE TABLE IF NOT EXISTS user_notes(id INTEGER PRIMARY KEY, user_id INTEGER, kind TEXT, level TEXT, title TEXT, body TEXT, created_at INTEGER)`, `CREATE INDEX IF NOT EXISTS user_notes_u ON user_notes(user_id, created_at)`,
  // round 11: plan limits, named invite links, VooSquare affiliates + support bridge
  `ALTER TABLE channels ADD COLUMN locked INTEGER DEFAULT 0`, `ALTER TABLE channels ADD COLUMN removed_by_user INTEGER DEFAULT 0`, `ALTER TABLE links ADD COLUMN name TEXT`,
  `ALTER TABLE users ADD COLUMN aff_code TEXT`, `ALTER TABLE users ADD COLUMN aff_sub TEXT`, `ALTER TABLE users ADD COLUMN aff_at INTEGER`,
  `ALTER TABLE tickets ADD COLUMN source TEXT`, `ALTER TABLE tickets ADD COLUMN voo_ticket TEXT`,
  `ALTER TABLE ticket_msgs ADD COLUMN source TEXT`, `ALTER TABLE ticket_msgs ADD COLUMN ext_id TEXT`, `ALTER TABLE ticket_msgs ADD COLUMN agent_name TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ticket_msgs_ext ON ticket_msgs(ext_id) WHERE ext_id IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS voo_support_out(id INTEGER PRIMARY KEY, msg_id INTEGER UNIQUE, ticket_id INTEGER, attempts INTEGER DEFAULT 0, next_at INTEGER, sent_at INTEGER, last_error TEXT, created_at INTEGER, failed INTEGER DEFAULT 0)`,
  // round 14: Voo Connect kit (outbox in the database, money reported to VooSquare, refunds and chargebacks of top-ups)
  `CREATE TABLE IF NOT EXISTS voo_kit_outbox(event_id TEXT PRIMARY KEY, body TEXT, seq INTEGER)`,
  `ALTER TABLE users ADD COLUMN voo_linked_at INTEGER`, `ALTER TABLE users ADD COLUMN voo_spent_cents INTEGER DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS voo_spends(event_id TEXT PRIMARY KEY, user_id INTEGER, cents INTEGER, reversed_cents INTEGER DEFAULT 0, kind TEXT, at INTEGER, created_at INTEGER)`, `CREATE INDEX IF NOT EXISTS voo_spends_u ON voo_spends(user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS voo_use(user_id INTEGER, day TEXT, cents INTEGER, event_id TEXT, created_at INTEGER, PRIMARY KEY(user_id, day))`,
  `ALTER TABLE deposits ADD COLUMN refunded_cents INTEGER DEFAULT 0`, `ALTER TABLE deposits ADD COLUMN charged_back_at INTEGER`,
]) { try { db.exec(sql); } catch { /* already there */ } }
const Q = (sql) => { const s = db.prepare(sql); return { get: (...a) => s.get(...a), all: (...a) => s.all(...a), run: (...a) => s.run(...a) }; };

// ---------- settings (admin-editable; env vars are the defaults) ----------
const ALERT_BOT_TOKEN = env.ALERT_BOT_TOKEN || '';
const DEFAULT_BONUS = [{ min_cents: 10000, bonus_pct: 5 }, { min_cents: 50000, bonus_pct: 10 }, { min_cents: 100000, bonus_pct: 15 }, { min_cents: 500000, bonus_pct: 20 }];
const DEFAULT_RANKS = [
  { name: 'Bronze', min_cents: 0, join_discount_pct: 0, perks: ['Live chat support'] },
  { name: 'Silver', min_cents: 25000, join_discount_pct: 0, perks: ['Priority replies in chat'] },
  { name: 'Gold', min_cents: 100000, join_discount_pct: 5, perks: ['5% off every tracked join', 'Priority replies in chat'] },
  { name: 'Platinum', min_cents: 500000, join_discount_pct: 10, perks: ['10% off every tracked join', 'Setup help on a call'] },
  { name: 'Diamond', min_cents: 2000000, join_discount_pct: 15, perks: ['15% off every tracked join', 'Dedicated account manager'] },
];
const DEFAULT_TIERS = [{ name: 'Starter', min: 0, rate: 0.10 }, { name: 'Pro', min: 3, rate: 0.20 }, { name: 'Elite', min: 10, rate: 0.30 }];
/** Levels: how big a media buyer is, by leads (ad-attributed joins + bot starts) in the rolling last 30 days. */
const DEFAULT_LEVELS = [{ id: 'rookie', name: 'Rookie', from: 0 }, { id: 'hustler', name: 'Hustler', from: 1000 }, { id: 'operator', name: 'Operator', from: 5000 },
  { id: 'shark', name: 'Shark', from: 25000 }, { id: 'whale', name: 'Whale', from: 100000 }, { id: 'kraken', name: 'Kraken', from: 300000 }, { id: 'legend', name: 'Legend', from: 1000000 }];
const LEVEL_EMOJI = { rookie: '🌱', hustler: '⚡', operator: '🎯', shark: '🦈', whale: '🐋', kraken: '🐙', legend: '👑' };
const int = (lo, hi) => (v) => { const n = Math.round(Number(v)); if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`Enter a whole number between ${lo} and ${hi}.`); return n; };
const bool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const str = (max, re, msg) => (v) => { v = String(v ?? '').trim().slice(0, max); if (v && re && !re.test(v)) throw new Error(msg); return v; };
/** Every admin-editable setting: its default (from env) and how to validate a new value. */
const SETTING_DEFS = {
  'feature.signup': { def: () => envBool('ALLOW_SIGNUP', true), v: bool },
  'feature.referrals': { def: () => envBool('FEATURE_REFERRALS', true), v: bool },
  'feature.tiktok': { def: () => envBool('FEATURE_TIKTOK', true), v: bool },
  'feature.snapchat': { def: () => envBool('FEATURE_SNAPCHAT', true), v: bool },
  'feature.support_chat': { def: () => envBool('FEATURE_SUPPORT_CHAT', true), v: bool },
  'feature.ftd': { def: () => envBool('FEATURE_FTD', true), v: bool },
  'feature.bot_no_token': { def: () => envBool('FEATURE_BOT_NO_TOKEN', true), v: bool },
  'feature.withdrawals': { def: () => envBool('FEATURE_WITHDRAWALS', true), v: bool },
  'feature.integrations': { def: () => envBool('FEATURE_INTEGRATIONS', true), v: bool },
  'feature.join_requests': { def: () => envBool('FEATURE_JOIN_REQUESTS', true), v: bool },
  'feature.spend': { def: () => envBool('FEATURE_SPEND', true), v: bool },
  'feature.fake_filter': { def: () => envBool('FEATURE_FAKE_FILTER', true), v: bool },
  'feature.alerts': { def: () => !!ALERT_BOT_TOKEN, v: bool },
  'feature.credits_bonus': { def: () => envBool('FEATURE_CREDITS_BONUS', true), v: bool },
  'feature.ranks': { def: () => envBool('FEATURE_RANKS', true), v: bool },
  'feature.enterprise': { def: () => envBool('FEATURE_ENTERPRISE', true), v: bool },
  'feature.link_names': { def: () => envBool('FEATURE_LINK_NAMES', true), v: bool },
  'limits': { def: () => ({ basic: { channels: envNum('BASIC_MAX_CHANNELS', 3), bots: envNum('BASIC_MAX_BOTS', 3) }, pro: { channels: envNum('PRO_MAX_CHANNELS', 0), bots: envNum('PRO_MAX_BOTS', 0) } }),
    v: (x) => { if (!x || typeof x !== 'object') throw new Error('Send the Basic and Pro limits.'); const n = int(0, 100000);
      const g = (o, name) => { if (!o || typeof o !== 'object') throw new Error(`Add the ${name} limits.`); return { channels: n(o.channels), bots: n(o.bots) }; };
      return { basic: g(x.basic, 'Basic'), pro: g(x.pro, 'Pro') }; } },
  'credit.bonus_tiers': { def: () => DEFAULT_BONUS, v: (a) => {
    if (!Array.isArray(a) || a.length > 10) throw new Error('Up to 10 bonus tiers.');
    return a.map((t) => ({ min_cents: int(100, 1e9)(t.min_cents), bonus_pct: Math.round(Number(t.bonus_pct) * 10) / 10 })).map((t) => { if (!(t.bonus_pct >= 0 && t.bonus_pct <= 100)) throw new Error('Bonus must be between 0% and 100%.'); return t; })
      .sort((x, y) => x.min_cents - y.min_cents); } },
  'credit.ranks': { def: () => DEFAULT_RANKS, v: (a) => {
    if (!Array.isArray(a) || !a.length || a.length > 10) throw new Error('Add between 1 and 10 ranks.');
    const r = a.map((x) => ({ name: str(30)(x.name) || 'Rank', min_cents: int(0, 1e10)(x.min_cents), join_discount_pct: Math.round(Number(x.join_discount_pct || 0) * 10) / 10,
      perks: (Array.isArray(x.perks) ? x.perks : String(x.perks || '').split('\n')).map((p) => str(120)(p)).filter(Boolean).slice(0, 8) }));
    if (r.some((x) => !(x.join_discount_pct >= 0 && x.join_discount_pct <= 90))) throw new Error('Join discounts must be between 0% and 90%.');
    r.sort((x, y) => x.min_cents - y.min_cents); r[0].min_cents = 0; return r; } },
  'price.base_cents': { def: () => envNum('PRICE_BASE_CENTS', 3000), v: int(0, 1e7) },
  'price.included': { def: () => envNum('PRICE_INCLUDED', 2000), v: int(0, 1e9) },
  'price.per_cents': { def: () => envNum('PRICE_PER_CENTS', 2), v: int(0, 1e5) },
  'price.free_joins': { def: () => envNum('FREE_JOINS', 500), v: int(0, 1e7) },
  'price.welcome_credit_cents': { def: () => envNum('WELCOME_CREDIT_CENTS', 0), v: int(0, 1e6) },
  'price.min_deposit_cents': { def: () => envNum('MIN_DEPOSIT_CENTS', 1000), v: int(100, 1e6) },
  'price.withdraw_min_cents': { def: () => envNum('WITHDRAW_MIN_CENTS', 30000), v: int(100, 1e8) },
  'price.ngn_per_usd': { def: () => envNum('NGN_PER_USD', 1600), v: int(1, 1e6) },
  'ref.hold_days': { def: () => envNum('REF_HOLD_DAYS', 14), v: int(0, 365) },
  'ref.tiers': { def: () => DEFAULT_TIERS, v: (a) => {
    if (!Array.isArray(a) || !a.length || a.length > 6) throw new Error('Add between 1 and 6 referral tiers.');
    const t = a.map((x) => ({ name: str(30)(x.name) || 'Tier', min: int(0, 100000)(x.min), rate: Math.round(Number(x.rate) * 1000) / 1000 }));
    if (t.some((x) => !(x.rate >= 0 && x.rate <= 0.9))) throw new Error('Referral rates must be between 0% and 90%.');
    t.sort((x, y) => x.min - y.min); t[0].min = 0; return t; } },
  'support.team': { def: () => [], v: (a) => {
    if (!Array.isArray(a) || a.length > 12) throw new Error('Up to 12 team members.');
    return a.map((m) => ({ id: /^[a-z0-9]{4,16}$/.test(m.id || '') ? m.id : rid(6).toLowerCase().replace(/[^a-z0-9]/g, 'x'), name: str(40)(m.name) || 'Support',
      role: str(60)(m.role), photo: /^\/media\/team\/[\w-]+\.(png|jpg|webp)(\?v=\d+)?$/.test(m.photo || '') ? m.photo : '', email: str(120)(m.email).toLowerCase() })); } },
  'support.reply_time': { def: () => env.SUPPORT_REPLY_TIME || 'Usually replies in a few minutes', v: str(80) },
  'support.hours': { def: () => env.SUPPORT_HOURS || 'Mon–Sat, 8am–10pm', v: str(80) },
  'support.contact': { def: () => env.SUPPORT_CONTACT || '', v: str(300, /^(https:\/\/|mailto:)/, 'The contact link must start with https:// or mailto:') },
  'support.canned': { def: () => [], v: (a) => {
    if (!Array.isArray(a) || a.length > 60) throw new Error('Up to 60 saved replies.');
    return a.map((c) => ({ id: /^[\w-]{3,16}$/.test(c.id || '') ? c.id : rid(5), title: str(60)(c.title) || 'Reply', body: str(2000)(c.body) })).filter((c) => c.body); } },
  'brand.company': { def: () => env.COMPANY_NAME || 'Zedapex', v: (x) => str(60)(x) || 'Zedapex' },
  'brand.support_email': { def: () => env.SUPPORT_EMAIL || '', v: str(120, /^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Enter a valid support email.') },
  'brand.mail_from_name': { def: () => (/^\s*"?([^"<]+?)"?\s*</.exec(MAIL_FROM_ENV) || [, 'Joinvoo'])[1], v: (x) => str(60)(x).replace(/[<>"]/g, '') || 'Joinvoo' },
  'email.weekly_summary': { def: () => envBool('EMAIL_WEEKLY_SUMMARY', false), v: bool },
  'pay.paystack_secret': { def: () => env.PAYSTACK_SECRET || '', v: str(200), secret: true },
  'pay.paystack_currency': { def: () => env.PAYSTACK_CURRENCY || 'NGN', v: (x) => (['NGN', 'USD', 'GHS', 'ZAR', 'KES'].includes(String(x).toUpperCase()) ? String(x).toUpperCase() : 'NGN') },
  'pay.flw_secret': { def: () => env.FLW_SECRET || '', v: str(200), secret: true },
  'pay.flw_webhook_hash': { def: () => env.FLW_WEBHOOK_HASH || '', v: str(200), secret: true },
  'pay.flw_currency': { def: () => env.FLW_CURRENCY || 'USD', v: (x) => (['USD', 'NGN', 'GHS', 'KES', 'ZAR', 'UGX', 'XAF', 'XOF'].includes(String(x).toUpperCase()) ? String(x).toUpperCase() : 'USD') },
  // ----- round 6 -----
  'feature.joe': { def: () => envBool('FEATURE_JOE', true), v: bool },
  // Basic's numbers live in price.* (the Pricing page); this holds the plan names, Basic's per-FTD fee and all of Pro.
  'plans': { def: () => ({ basic: { name: 'Basic', per_ftd_cents: 0 }, pro: { name: 'Pro', base_cents: envNum('PRO_BASE_CENTS', 9900), included: envNum('PRO_INCLUDED', 5000), per_join_cents: envNum('PRO_PER_CENTS', 2), per_ftd_cents: 0 } }),
    v: (o) => {
      if (!o || typeof o !== 'object') throw new Error('Send the plans.');
      const b = o.basic || {}, p = o.pro || {};
      return { basic: { name: str(30)(b.name) || 'Basic', per_ftd_cents: int(0, 1e6)(b.per_ftd_cents || 0) },
        pro: { name: str(30)(p.name) || 'Pro', base_cents: int(0, 1e8)(p.base_cents), included: int(0, 1e9)(p.included), per_join_cents: int(0, 1e5)(p.per_join_cents), per_ftd_cents: int(0, 1e6)(p.per_ftd_cents || 0) } };
    } },
  'trial.days': { def: () => envNum('TRIAL_DAYS', 7), v: int(1, 90) },
  'trial.ftd_limit': { def: () => envNum('TRIAL_FTDS', 20), v: int(1, 100000) },
  'trial.starts': { def: () => (env.TRIAL_STARTS === 'signup' ? 'signup' : 'first_ftd'), v: (x) => (x === 'signup' ? 'signup' : 'first_ftd') },
  'levels': { def: () => DEFAULT_LEVELS, v: (a) => {
    if (!Array.isArray(a) || a.length < 2 || a.length > 12) throw new Error('Add between 2 and 12 levels.');
    const l = a.map((x, i) => ({ id: /^[a-z0-9_]{2,20}$/.test(x.id || '') ? x.id : (str(30)(x.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'level' + (i + 1)),
      name: str(30)(x.name) || 'Level ' + (i + 1), from: int(0, 1e10)(x.from) }));
    l.sort((x, y) => x.from - y.from); l[0].from = 0;
    if (new Set(l.map((x) => x.id)).size !== l.length) throw new Error('Two levels have the same name.');
    return l; } },
  'joe.ai': { def: () => true, v: bool },
  'joe.model': { def: () => env.JOE_MODEL || 'claude-haiku-4-5-20251001', v: (x) => str(120, /^[\w.:/@-]+$/, 'Model names are letters, numbers, dots, dashes and slashes.')(x) || 'claude-haiku-4-5-20251001' },
  'joe.daily_limit': { def: () => envNum('JOE_DAILY_LIMIT', 30), v: int(0, 10000) },
  'joe.api_key': { def: () => env.ANTHROPIC_API_KEY || '', v: str(300), secret: true },
  'email.resend_key': { def: () => RESEND_ENV_KEY, v: str(200), secret: true },
  'joe.persona': { def: () => JOE_PERSONA_DEFAULT, v: str(3000) },
  // ----- round 12: AI provider choice (Anthropic or any OpenAI-compatible Chat Completions API) + custom playbooks -----
  'joe.provider': { def: () => (env.JOE_PROVIDER === 'openai' ? 'openai' : 'anthropic'), v: (x) => (x === 'openai' ? 'openai' : 'anthropic') },
  'joe.openai_base': { def: () => (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''), v: (x) => { x = str(300)(x).replace(/\/$/, ''); if (x && !/^https?:\/\/\S+$/.test(x)) throw new Error('The API base must start with https://, e.g. https://openrouter.ai/api/v1'); return x || 'https://api.openai.com/v1'; } },
  'joe.openai_key': { def: () => env.OPENAI_API_KEY || '', v: str(300), secret: true },
  'joe.openai_model': { def: () => env.JOE_OPENAI_MODEL || 'gpt-4o-mini', v: (x) => str(120, /^[\w.:/@-]+$/, 'Model ids are letters, numbers, dots, dashes and slashes.')(x) || 'gpt-4o-mini' },
  'joe.playbooks': { def: () => [], v: (a) => playbooksValidate(a) },
  // ----- round 13: Joe pay-as-you-go -----
  'joe.billing': { def: () => ({ ...JOE_BILLING_DEFAULT, free_daily: { ...JOE_BILLING_DEFAULT.free_daily } }), v: (o) => joeBillingValidate(o) },
  'joe.prices': { def: () => JSON.parse(JSON.stringify(JOE_PRICES_DEFAULT)), v: (o) => joePricesValidate(o) },
  'joe.knowledge': { def: () => '', v: str(30000) },
  // ----- round 9: cross-promotion for a sister product (shown as a card in the dashboard) -----
  'feature.sister_promo': { def: () => envBool('FEATURE_SISTER_PROMO', true), v: bool },
  'sister': { def: () => ({ enabled: true, name: 'Replyvoo', url: 'https://replyvoo.com', tagline: 'AI Closers that reply to your Telegram leads in seconds and close the sale.', promo_code: '', utm: true }),
    v: (o) => {
      if (!o || typeof o !== 'object') throw new Error('Send the sister product details.');
      const url = str(300)(o.url);
      if (!/^https?:\/\/[^\s/$.?#][^\s]*$/i.test(url)) throw new Error('The link must start with https://');
      return { enabled: !!o.enabled, name: str(40)(o.name) || 'Replyvoo', url, tagline: str(160)(o.tagline), promo_code: str(40, /^[\w-]*$/, 'Promo codes are letters, numbers, - or _.')(o.promo_code), utm: o.utm !== false };
    } },
  'sister.clicks': { def: () => 0, v: int(0, 1e12) },
  // ----- round 11: VooSquare (one login for all Zedapex tools) — everything off until configured -----
  'voo.login_mode': { def: () => (['both', 'only'].includes(env.VOO_LOGIN_MODE) ? env.VOO_LOGIN_MODE : 'off'), v: (x) => (['off', 'both', 'only'].includes(x) ? x : (() => { throw new Error('Login mode is off, both or only.'); })()) },
  'voo.issuer': { def: () => (env.VOO_BASE || env.VOO_ISSUER || '').replace(/\/+$/, ''), v: (x) => { x = str(200)(x).replace(/\/$/, ''); if (x && !/^https?:\/\/[^\s/]+/.test(x)) throw new Error('The VooSquare address is a URL like https://voosquare.com'); return x; } },
  'voo.client_id': { def: () => env.VOO_CLIENT_ID || '', v: str(200) },
  'voo.client_secret': { def: () => env.VOO_CLIENT_SECRET || '', v: str(300), secret: true },
  'voo.redirect_uri': { def: () => env.VOO_REDIRECT_URI || '', v: (x) => { x = str(300)(x); if (x && !/^https?:\/\//.test(x)) throw new Error('The callback URL must start with https://'); return x; } },
  'voo.service_key': { def: () => env.VOO_SERVICE_KEY || '', v: str(300), secret: true },
  'voo.webhook_secret': { def: () => env.VOO_WEBHOOK_SECRET || '', v: str(300), secret: true },
  'voo.events_url': { def: () => env.VOO_EVENTS_URL || '', v: (x) => { x = str(300)(x); if (x && !/^https?:\/\//.test(x)) throw new Error('The events URL must start with https://'); return x; } },
  'voo.home': { def: () => (env.VOO_HOME || 'https://voosquare.com').replace(/\/$/, ''), v: (x) => { x = str(200)(x).replace(/\/$/, ''); if (x && !/^https?:\/\//.test(x)) throw new Error('VooSquare home must start with https://'); return x || 'https://voosquare.com'; } },
  'voo.api_key': { def: () => env.VOO_API_KEY || '', v: str(300), secret: true },
  'voo.support_bridge': { def: () => envBool('VOO_SUPPORT_BRIDGE', false), v: bool },
  'voo.affiliate_url': { def: () => env.VOO_AFFILIATE_URL || 'https://affiliate.voosquare.com', v: (x) => { x = str(300)(x); if (x && !/^https:\/\/[^\s]+$/.test(x)) throw new Error('The affiliate link must start with https://'); return x || 'https://affiliate.voosquare.com'; } },
  'voo.widget': { def: () => envBool('VOO_WIDGET', false), v: bool },
  'voo.referrals': { def: () => (env.VOO_REFERRALS === 'voosquare' ? 'voosquare' : 'local'), v: (x) => (x === 'voosquare' ? 'voosquare' : 'local') },
  // ----- round 11: Zedapex apps catalog (cross-promotion); `sister` above stays for older dashboards -----
  'apps': { def: () => DEFAULT_APPS.map((a) => ({ ...a })), v: (a) => appsValidate(a) },
  'apps.clicks': { def: () => ({}), v: (o) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).filter(([k, n]) => /^[a-z0-9_-]{2,30}$/.test(k) && Number.isFinite(+n)).map(([k, n]) => [k, Math.max(0, Math.round(+n))])) : {}) },
  // ----- tracking-link domain: ad links use a separate domain so a block on it never touches the main site -----
  'link.domain': { def: () => (env.LINK_BASE_URL || '').replace(/\/$/, ''), v: (x) => normLinkBase(x) },
  'link.backups': { def: () => [], v: (a) => { if (!Array.isArray(a)) throw new Error('Send a list of backup domains.'); return a.map(normLinkBase).filter(Boolean).slice(0, 10); } },
};
function normLinkBase(x) {
  let v = String(x || '').trim().toLowerCase(); if (!v) return '';
  if (!/^https?:\/\//.test(v)) v = 'https://' + v;
  let u; try { u = new URL(v); } catch { throw new Error('That isn\'t a valid domain.'); }
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(u.hostname)) throw new Error('Enter a domain like gojoinly.com');
  return `${u.protocol}//${u.host}`;
}
/** Base URL for ad tracking links (/c/…). Falls back to the main site when no link domain is set. */
function linkBase() { return setting('link.domain') || BASE_URL; }
function linkHosts() { return [setting('link.domain'), ...(setting('link.backups') || [])].filter(Boolean).map((u) => { try { return new URL(u).host; } catch { return ''; } }).filter(Boolean); }
let settingsCache = null;
function setting(key, def) {
  if (!settingsCache) {
    settingsCache = new Map();
    for (const r of Q(`SELECT key, value FROM settings`).all()) { try { settingsCache.set(r.key, JSON.parse(r.value)); } catch { /* ignore a broken row */ } }
  }
  if (settingsCache.has(key)) return settingsCache.get(key);
  if (def !== undefined) return def;
  return SETTING_DEFS[key] ? SETTING_DEFS[key].def() : undefined;
}
/** Validate + store one setting. value null → back to the default. Throws with a friendly message on bad input. */
function setSetting(key, value) {
  const d = SETTING_DEFS[key]; if (!d) throw new Error('Unknown setting ' + key);
  if (value === null) Q(`DELETE FROM settings WHERE key=?`).run(key);
  else Q(`INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).run(key, JSON.stringify(d.v(value)), Date.now());
  settingsCache = null; pageCache.clear();
}
const feature = (k) => (k === 'alerts' && !ALERT_BOT_TOKEN ? false : !!setting('feature.' + k));
const FEATURE_KEYS = ['signup', 'referrals', 'tiktok', 'snapchat', 'support_chat', 'ftd', 'bot_no_token', 'withdrawals',
  'integrations', 'join_requests', 'spend', 'fake_filter', 'alerts', 'credits_bonus', 'ranks', 'enterprise', 'joe', 'sister_promo', 'link_names'];
const features = () => Object.fromEntries(FEATURE_KEYS.map((k) => [k, feature(k)]));
/** Live values. Read these at the moment of use; they change when an admin saves Settings. */
const C = {
  get PRICE_BASE_CENTS() { return setting('price.base_cents'); }, get PRICE_INCLUDED() { return setting('price.included'); }, get PRICE_PER_CENTS() { return setting('price.per_cents'); },
  get FREE_JOINS() { return setting('price.free_joins'); }, get WELCOME_CREDIT_CENTS() { return setting('price.welcome_credit_cents'); },
  get MIN_DEPOSIT_CENTS() { return setting('price.min_deposit_cents'); }, get WITHDRAW_MIN_CENTS() { return setting('price.withdraw_min_cents'); },
  get NGN_PER_USD() { return setting('price.ngn_per_usd'); }, get REF_HOLD_DAYS() { return setting('ref.hold_days'); }, get REF_TIERS() { return setting('ref.tiers'); },
  get PAYSTACK_SECRET() { return setting('pay.paystack_secret'); }, get PAYSTACK_CURRENCY() { return setting('pay.paystack_currency'); },
  get FLW_SECRET() { return setting('pay.flw_secret'); }, get FLW_WEBHOOK_HASH() { return setting('pay.flw_webhook_hash'); }, get FLW_CURRENCY() { return setting('pay.flw_currency'); },
  get SUPPORT_CONTACT() { return setting('support.contact'); }, get COMPANY() { return setting('brand.company'); },
  get MAIL_FROM() { return `${setting('brand.mail_from_name')} <${MAIL_FROM_ADDR}>`; },
};
const pageCache = new Map();
/** Public support info: who answers, how fast, when. */
function supportInfo() {
  return { team: setting('support.team').map((m) => ({ name: m.name, role: m.role, photo: m.photo || '' })), reply_time: setting('support.reply_time'), hours: setting('support.hours'), contact: C.SUPPORT_CONTACT };
}
/** The sister-product card for the dashboard. Off (feature switch or its own toggle) → {enabled:false} and nothing else. */
function sisterUrl(x) {
  if (!x.utm || /[?&]utm_source=/.test(x.url)) return x.url;
  const [base, hash] = x.url.split('#');
  return base + (base.includes('?') ? '&' : '?') + 'utm_source=joinvoo&utm_medium=dashboard&utm_campaign=sister' + (hash !== undefined ? '#' + hash : '');
}
function sisterPublic() {
  const x = setting('sister');
  if (!feature('sister_promo') || !x.enabled) return { enabled: false };
  return { enabled: true, name: x.name, url: sisterUrl(x), tagline: x.tagline, promo_code: x.promo_code || '' };
}
/* ---------- Zedapex apps catalog ---------- */
const APP_LOGOS = ['replyvoo', 'castvoo', 'advoo', 'affleego', 'landvoo', 'voosquare', 'joinvoo', 'spyvoo', 'gatevoo'];
const DEFAULT_APPS = [
  { id: 'replyvoo', name: 'Replyvoo', headline: 'Sky-rocket your sales. On autopilot.', tagline: 'AI Closers answer every chat in seconds, qualify every lead and send the payment link while you sleep.', url: 'https://replyvoo.com', color: '#FFC21A', color2: '#FFD65C', ink: 'dark', logo: 'replyvoo', badge: '', offer: '30 free chats a month', status: 'live', enabled: true, utm: true },
  { id: 'castvoo', name: 'Castvoo', headline: 'Turn your Telegram into a sales machine.', tagline: 'Welcomes every new subscriber, follows up on time and sends each group the message written for them. Broadcasts, drips and AI in one place.', url: 'https://castvoo.com', color: '#3b6cf6', color2: '#2f55e4', ink: 'light', logo: 'castvoo', badge: '', offer: '7 days free', status: 'live', enabled: true, utm: true },
  { id: 'spyvoo', name: 'Spyvoo', headline: 'Spy the winners. Scale your own.', tagline: 'Search live Facebook and Instagram ads from every country, see which ones have run for months and why they work.', url: 'https://spyvoo.com', color: '#2f5bff', color2: '#5b7cff', ink: 'light', logo: 'spyvoo', badge: '', offer: 'Start free', status: 'live', enabled: true, utm: true },
  { id: 'advoo', name: 'Vooads', headline: 'Make ads that print.', tagline: 'Turns one sentence into scroll-stopping videos, images and hooks in every size, in your buyer’s language, checked against Meta’s rules before you spend.', url: 'https://vooads.com', color: '#ef5a2c', color2: '#1d1714', ink: 'light', logo: 'advoo', badge: '', offer: 'First ads free', status: 'live', enabled: true, utm: true },
  { id: 'affleego', name: 'Affleego', headline: 'Top affiliate deals in one place.', tagline: 'Find and join high-paying offers.', url: 'https://affleego.com', color: '#0f9d8a', color2: '#12b886', ink: 'light', logo: 'affleego', badge: '', offer: '', status: 'live', enabled: true, utm: true },
  { id: 'landvoo', name: 'Landvoo', headline: 'Landing pages that convert.', tagline: 'Fast pages for your ads, built in minutes.', url: '', color: '#7c5cff', color2: '#5b3df5', ink: 'light', logo: 'landvoo', badge: 'Coming soon', offer: '', status: 'soon', enabled: true, utm: true },
  { id: 'gatevoo', name: 'Gatevoo', headline: 'Crypto checkout for your offers.', tagline: 'Take USDT and Bitcoin straight to your own wallet. Confirmed automatically.', url: 'https://gatevoo.com', color: '#111111', color2: '#3ddc84', ink: 'light', logo: 'gatevoo', badge: 'Coming soon', offer: '', status: 'soon', enabled: true, utm: true },
  { id: 'voosquare', name: 'VooSquare', headline: 'One login for all Zedapex tools.', tagline: 'Your account, billing and referrals for every Zedapex app in one place.', url: 'https://voosquare.com', color: '#0fae6b', color2: '#c6f45a', ink: 'light', logo: 'voosquare', badge: '', offer: '', status: 'live', enabled: true, utm: true },
];
const HUB_ID = 'voosquare', SELF_ID = 'joinvoo';
function appsValidate(a) {
  if (!Array.isArray(a)) throw new Error('Send the list of apps.');
  if (a.length > 30) throw new Error('Up to 30 apps.');
  const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : d);
  const seen = new Set();
  return a.map((x, i) => {
    if (!x || typeof x !== 'object') throw new Error('Each app needs a name.');
    const name = str(40)(x.name); if (!name) throw new Error(`App ${i + 1} needs a name.`);
    let id = String(x.id || name).toLowerCase().replace(/[^a-z0-9_-]+/g, '').slice(0, 30) || 'app' + (i + 1);
    if (seen.has(id)) throw new Error(`Two apps have the id “${id}”.`); seen.add(id);
    const url = str(300)(x.url);
    if (url && !/^https?:\/\/[^\s]+$/i.test(url)) throw new Error(`${name}: the link must start with https://`);
    const logo = str(200)(x.logo);
    if (logo && !APP_LOGOS.includes(logo) && !/^\/media\/applogos\/[\w.-]+(\?v=\d+)?$/.test(logo)) throw new Error(`${name}: pick a built-in logo or upload one.`);
    const status = x.status === 'soon' ? 'soon' : 'live';
    if (status === 'live' && !url && id !== SELF_ID) throw new Error(`${name}: add a link, or mark it “soon”.`);
    return { id, name, headline: str(90)(x.headline), tagline: str(240)(x.tagline), url, color: hex(x.color, '#5b3df5'), color2: hex(x.color2, hex(x.color, '#7c5cff')), ink: x.ink === 'dark' ? 'dark' : 'light',
      logo, badge: str(24)(x.badge), offer: str(60)(x.offer), status, enabled: x.enabled !== false, utm: x.utm !== false };
  });
}
const appLogoUrl = (a) => (!a.logo ? '' : APP_LOGOS.includes(a.logo) ? `/media/applogos/${a.logo}.svg` : a.logo);
function appUrl(a, where = 'dashboard') {
  if (!a.url) return setting('voo.home'); // coming soon without its own site → the waitlist on VooSquare
  if (a.status === 'soon') return a.url;     // coming soon with its own waitlist page (Gatevoo)
  if (!a.utm || /[?&]utm_source=/.test(a.url)) return a.url;
  const [base, hash] = a.url.split('#');
  return base + (base.includes('?') ? '&' : '?') + `utm_source=joinvoo&utm_medium=dashboard&utm_campaign=apps&utm_content=${encodeURIComponent(String(where || 'dashboard').replace(/[^\w-]/g, '').slice(0, 30) || 'dashboard')}` + (hash !== undefined ? '#' + hash : '');
}
const appPublic = (a, where) => ({ id: a.id, name: a.name, headline: a.headline, tagline: a.tagline, url: appUrl(a, where), color: String(a.color).toLowerCase(), color2: String(a.color2).toLowerCase(), ink: a.ink, logo_url: appLogoUrl(a), badge: a.badge, offer: a.offer, status: a.status });
/** Customer-facing list: enabled, without Joinvoo itself and without the VooSquare hub (that one is shown separately). */
function appsPublic() {
  if (!feature('sister_promo')) return [];
  return (setting('apps') || []).filter((a) => a.enabled && a.id !== SELF_ID && a.id !== HUB_ID).map((a) => appPublic(a));
}
/** Bottom-of-dashboard showcase: the VooSquare affiliate program first, then the other Zedapex tools. */
function showcasePublic() {
  if (!feature('sister_promo')) return { enabled: false, affiliate: null, cards: [] };
  const aff = { url: setting('voo.affiliate_url'), headline: 'Earn up to 50% for life', tagline: 'Promote Joinvoo and every Zedapex tool on VooSquare. Get paid every month your customers stay.', cta: 'Become an affiliate' };
  const apps = (setting('apps') || []).filter((a) => a.enabled && a.id !== SELF_ID && a.id !== HUB_ID);
  const order = ['spyvoo', 'replyvoo', 'castvoo', 'advoo', 'gatevoo'];
  const list = [...order.map((id) => apps.find((a) => a.id === id)).filter(Boolean), ...apps.filter((a) => !order.includes(a.id))];
  const hub = (setting('apps') || []).find((a) => a.id === HUB_ID) || DEFAULT_APPS.find((a) => a.id === HUB_ID);
  return { enabled: true, affiliate: aff,
    cards: [{ id: 'affiliate', name: 'VooSquare Affiliates', headline: aff.headline, tagline: aff.tagline, url: aff.url, color: hub.color, color2: hub.color2, ink: 'light', logo_url: appLogoUrl(hub), status: 'live', cta: aff.cta, badge: 'Up to 50%' },
      ...list.map((a) => ({ ...appPublic(a, 'showcase'), cta: a.status === 'soon' ? 'Join the waitlist' : `Try ${a.name}` }))] };
}
function vooPublic() {
  const hub = (setting('apps') || []).find((a) => a.id === HUB_ID) || DEFAULT_APPS.find((a) => a.id === HUB_ID);
  return { login: vooLoginOn() ? setting('voo.login_mode') : 'off', home: setting('voo.home'), referrals: setting('voo.referrals'),
    hub: { name: hub.name, tagline: 'One login for all Zedapex tools', url: setting('voo.home'), logo_url: appLogoUrl(hub), color: hub.color, color2: hub.color2 } };
}
// One-time: the round-9 sister card becomes the Replyvoo entry of the catalog (the old `sister` key is kept).
(function migrateSister() {
  try {
    const has = (k) => !!Q(`SELECT 1 FROM settings WHERE key=?`).get(k);
    if (has('apps') || !has('sister')) return;
    const x = setting('sister'), apps = DEFAULT_APPS.map((a) => ({ ...a }));
    const r = apps.find((a) => a.id === 'replyvoo');
    Object.assign(r, { name: x.name || r.name, url: x.url || r.url, enabled: !!x.enabled, utm: x.utm !== false }, x.tagline ? { tagline: x.tagline } : {}, x.promo_code ? { offer: `Code ${x.promo_code}` } : {});
    Q(`INSERT INTO settings(key,value,updated_at) VALUES('apps',?,?)`).run(JSON.stringify(appsValidate(apps)), Date.now());
    settingsCache = null; log('settings: sister card moved into the Zedapex apps catalog');
  } catch (e) { log('apps migration skipped:', e.message); }
})();
function publicConfig() {
  return { signup: feature('signup'), base_url: BASE_URL, support_contact: C.SUPPORT_CONTACT, features: features(), support: supportInfo(),
    brand: { company: C.COMPANY, support_email: setting('brand.support_email') },
    pricing: { base_cents: C.PRICE_BASE_CENTS, included: C.PRICE_INCLUDED, per_join_cents: C.PRICE_PER_CENTS, free_joins: C.FREE_JOINS },
    plans: plansDef(), trial: { days: setting('trial.days'), ftd_limit: setting('trial.ftd_limit'), starts: setting('trial.starts') },
    levels: setting('levels').map((l) => ({ id: l.id, name: l.name, from: l.from })), langs: LANGS, sister: sisterPublic(), apps: appsPublic(), voo: vooPublic(), showcase: showcasePublic(), limits: setting('limits') };
}
/** Who answered: the team member whose email matches the admin who replied; otherwise that admin's first name. */
function agentFor(email) {
  if (!email) return null;
  const m = setting('support.team').find((x) => x.email && x.email === email);
  if (m) return { name: m.name, photo: m.photo || '', role: m.role || '' };
  const u = Q(`SELECT name FROM users WHERE email=?`).get(email);
  return { name: (u && u.name ? u.name.split(' ')[0] : '') || 'Joinvoo team', photo: '', role: 'Support' };
}
const withAgents = (msgs) => msgs.map((x) => { const { agent_email, agent_name, source, ...rest } = x;
  if (!x.from_admin) return rest;
  if (source === 'voosquare') return { ...rest, source, agent: { name: agent_name || 'Zedapex support', photo: '', role: 'VooSquare', source: 'voosquare', voosquare: true } };
  return { ...rest, agent: agentFor(agent_email) || { name: 'Joinvoo team', photo: '', role: '' } }; });

// ---------- affiliate integrations (postback presets per program) ----------
// Templates use {postback} for the account's own postback URL. Tags in {braces} are the program's macros, filled in by the program.
// Most partner panels are behind a login, so `verified` stays false until the macro names are confirmed from public docs.
const ASK = 'Tag names differ between panels: ask your affiliate manager for the exact tags for sub ID, amount and transaction ID.';
const progSteps = (n) => [
  `Turn on join-request mode for your channel (Channels → Join mode) and set the offer link to your ${n} link with {tg_id} as sub1, e.g. …?sub1={tg_id}. Every person then carries their Telegram ID into ${n}.`,
  `In ${n}, open Postbacks (S2S). Paste the URL below once per event: status=reg for registrations, status=ftd for first deposits, status=dep for repeat deposits.`,
  `Replace the tags in {braces} with ${n}’s own tags for sub1, amount and transaction ID.`,
  'Press Connect, then send a test from the program (or open the URL with a real Telegram ID). It shows up in Conversions within seconds.',
];
const trackerSteps = (n) => [
  `In ${n}, make sure each click stores the person’s Telegram ID (pass {tg_id} from the offer link into a sub ID).`,
  `In ${n}, add an S2S postback to Joinvoo with the URL below. ${n} sends every conversion status (lead, sale, rejected) through it.`,
  'Map the statuses: sale or ftd = first deposit, dep = repeat deposit, rejected = chargeback.',
  'Press Connect and send a test conversion.',
];
const INTEGRATION_SEED = [
  ['1win', '1win Partners', 'iGaming', '{postback}?sub1={sub1}&status=ftd&payout={amount}&currency=USD&txid={transaction_id}&net=1win', 'https://1win.partners'],
  ['kingfin', 'Kingfin', 'Trading', '{postback}?sub1={sub1}&status=ftd&payout={amount}&currency=USD&txid={transaction_id}&net=kingfin', ''],
  ['affstore', 'Affstore (IQ Option)', 'Trading', '{postback}?sub1={aff_sub}&status=ftd&payout={amount}&currency=USD&txid={transaction_id}&net=affstore', ''],
  ['pocketoption', 'Pocket Partners (Pocket Option)', 'Trading', '{postback}?sub1={sub_id1}&status=ftd&payout={amount}&currency=USD&txid={transaction_id}&net=pocketoption', 'https://pocketpartners.com'],
  ['olymptrade', 'Olymp Trade Affiliates', 'Trading', '{postback}?sub1={sub1}&status=ftd&payout={amount}&currency=USD&txid={transaction_id}&net=olymptrade', ''],
  ['binomo', 'Binomo Partners', 'Trading', '{postback}?sub1={sub1}&status=ftd&payout={amount}&currency=USD&txid={transaction_id}&net=binomo', ''],
  ['quotex', 'Quotex Affiliate', 'Trading', '{postback}?sub1={sub1}&status=ftd&payout={amount}&currency=USD&txid={transaction_id}&net=quotex', ''],
  ['exness', 'Exness Partners', 'Trading', '{postback}?sub1={sub1}&status=ftd&payout={amount}&currency=USD&txid={transaction_id}&net=exness', ''],
  ['1xbet', '1xBet Partners', 'iGaming', '{postback}?sub1={sub1}&status=ftd&payout={amount}&currency=USD&txid={transaction_id}&net=1xbet', ''],
  ['melbet', 'Melbet Affiliates', 'iGaming', '{postback}?sub1={sub1}&status=ftd&payout={amount}&currency=USD&txid={transaction_id}&net=melbet', ''],
  ['keitaro', 'Keitaro', 'Tracker', '{postback}?sub1={sub_id_1}&status={status}&payout={revenue}&txid={tid}&net=keitaro', 'https://keitaro.io'],
  ['binom', 'Binom', 'Tracker', '{postback}?sub1={t1}&status={cnv_status}&payout={payout}&net=binom', 'https://binom.org'],
  ['mostbet', 'Mostbet Partners', 'iGaming', '{postback}?sub1={sub1}&status=ftd&payout={amount}&currency=USD&txid={transaction_id}&net=mostbet', ''],
  ['affiliatetop', 'Affiliate Top', 'Affiliate network', '{postback}?sub1={sub1}&status=ftd&payout={amount}&currency=USD&txid={transaction_id}&net=affiliatetop', ''],
  ['custom', 'Custom postback', 'Other', '{postback}?sub1={YOUR_SUB_ID_TAG}&status=ftd&payout={YOUR_AMOUNT_TAG}&currency=USD&txid={YOUR_TRANSACTION_TAG}&net=custom', ''],
];
if (!setting('integrations.seeded', false)) {
  const ins = Q(`INSERT OR IGNORE INTO integrations(id,name,logo,category,postback_template,macros_note,verified,docs_url,events,setup_steps,sort,created_at) VALUES(?,?,?,?,?,?,0,?,?,?,?,?)`);
  INTEGRATION_SEED.forEach(([id, name, cat, tpl, docs], i) => ins.run(id, name, '', cat, tpl,
    cat === 'Tracker' ? `${ASK} In ${name}, use its conversion status and payout tags.` : id === 'custom' ? 'Use this for any program or CRM that can call a URL: replace the CAPITAL tags with that system’s own tags.' : ASK,
    docs, JSON.stringify(cat === 'Tracker' || id === 'custom' ? ['lead', 'reg', 'ftd', 'dep', 'sale', 'qualified', 'rejected'] : ['reg', 'ftd', 'dep', 'rejected']),
    JSON.stringify(cat === 'Tracker' ? trackerSteps(name) : progSteps(id === 'custom' ? 'your program' : name)), i + 1, Date.now()));
  Q(`INSERT OR REPLACE INTO settings(key,value,updated_at) VALUES('integrations.seeded','true',?)`).run(Date.now()); settingsCache = null;
}
if (!setting('integrations.seeded.v2', false)) {
  const ins2 = Q(`INSERT OR IGNORE INTO integrations(id,name,logo,category,postback_template,macros_note,verified,docs_url,events,setup_steps,sort,created_at) VALUES(?,?,?,?,?,?,0,?,?,?,?,?)`);
  INTEGRATION_SEED.filter(([id]) => ['mostbet', 'affiliatetop'].includes(id)).forEach(([id, name, cat, tpl, docs], i) =>
    ins2.run(id, name, '', cat, tpl, ASK, docs, JSON.stringify(['reg', 'ftd', 'dep', 'rejected']), JSON.stringify(progSteps(name)), 50 + i, Date.now()));
  Q(`INSERT OR REPLACE INTO settings(key,value,updated_at) VALUES('integrations.seeded.v2','true',?)`).run(Date.now()); settingsCache = null;
}
/** Logo shipped with Joinvoo (public/media/logos/<id>.png) when the admin hasn't uploaded one. */
const bundledLogo = (id) => { for (const e of ['png', 'jpg', 'webp']) if (fs.existsSync(path.join(PUBLIC, 'media', 'logos', `${id}.${e}`))) return `/media/logos/${id}.${e}`; return ''; };
function integrationRow(r) {
  return { id: r.id, name: r.name, logo: r.logo || bundledLogo(r.id), category: r.category || 'Other', postback_template: r.postback_template || '', macros_note: r.macros_note || '', verified: !!r.verified,
    docs_url: r.docs_url || '', events: (() => { try { return JSON.parse(r.events || '[]'); } catch { return []; } })(), setup_steps: (() => { try { return JSON.parse(r.setup_steps || '[]'); } catch { return []; } })(), sort: r.sort };
}
function integrationsFor(user) {
  const base = `${BASE_URL}/pb/${pbKey(user.id)}`;
  const mine = new Map(Q(`SELECT * FROM user_integrations WHERE user_id=?`).all(user.id).map((x) => [x.integration_id, x]));
  const counts = new Map(Q(`SELECT network, COUNT(*) n FROM conversions WHERE owner_id=? AND network IS NOT NULL AND created_at>? GROUP BY network`).all(user.id, now() - 30 * 864e5).map((x) => [x.network, x.n]));
  return { postback_base: base, items: Q(`SELECT * FROM integrations ORDER BY sort, name`).all().map((r) => { const it = integrationRow(r), u = mine.get(r.id);
    return { ...it, postback_template: it.postback_template.replace('{postback}', base), connected: !!(u && u.connected_at), connected_at: u ? u.connected_at : null, last_event_at: u ? u.last_event_at || null : null, events_30d: counts.get(r.id) || 0 }; }) };
}
/** Save an uploaded image (data URL) as <dir>/<id>.<png|jpg|webp>; checks real file type and size. */
function saveImage(dir, id, data, maxBytes = 1.5 * 1024 * 1024) {
  const mt = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
  if (!mt) return { error: 'Upload a PNG, JPG or WebP image.' };
  const buf = Buffer.from(mt[2], 'base64');
  if (buf.length > maxBytes) return { error: `That image is too big. Use one under ${maxBytes >= 1024 * 1024 ? (maxBytes / 1048576).toFixed(1).replace(/\.0$/, '') + ' MB' : Math.round(maxBytes / 1024) + ' KB'}.` };
  const kind = buf[0] === 0x89 && buf[1] === 0x50 ? 'png' : buf[0] === 0xff && buf[1] === 0xd8 ? 'jpg' : buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP' ? 'webp' : '';
  if (!kind) return { error: 'That file isn’t a real PNG, JPG or WebP image.' };
  fs.mkdirSync(dir, { recursive: true });
  for (const e of ['png', 'jpg', 'webp']) { try { fs.unlinkSync(path.join(dir, `${id}.${e}`)); } catch { /* none */ } }
  fs.writeFileSync(path.join(dir, `${id}.${kind}`), buf);
  return { kind };
}
const LOGO_DIR = path.join(DATA_DIR, 'media', 'logos');
const PAYLOGO_DIR = path.join(DATA_DIR, 'media', 'paylogos'); // uploaded payment-method logos
const APPLOGO_DIR = path.join(DATA_DIR, 'media', 'applogos'); // uploaded Zedapex app logos

// ---------- loyalty: ranks, custom pricing (1 credit = 1 cent; the ledger is in credits) ----------
const lifetimePaid = (uid) => Q(`SELECT COALESCE(SUM(amount_cents),0) n FROM deposits WHERE user_id=? AND status='paid'`).get(uid).n;
/** Rank from lifetime paid top-ups (bonus/welcome credit doesn't count). */
function rankFor(uid, life = lifetimePaid(uid)) {
  const ranks = setting('credit.ranks'); let i = 0;
  ranks.forEach((r, j) => { if (life >= r.min_cents) i = j; });
  const r = ranks[i], nx = ranks[i + 1];
  return { name: r.name, lifetime_cents: life, join_discount_pct: feature('ranks') ? r.join_discount_pct || 0 : 0, perks: r.perks || [],
    next: nx ? { name: nx.name, need_cents: Math.max(0, nx.min_cents - life), min_cents: nx.min_cents } : null };
}
function customPricing(uid) { const u = Q(`SELECT custom_pricing FROM users WHERE id=?`).get(uid); try { return u && u.custom_pricing ? JSON.parse(u.custom_pricing) : null; } catch { return null; } }
/** What this customer pays: their custom deal if they have one, otherwise list price with their rank's join discount. per may be fractional (carried in usage.carry). */
function priceFor(uid, planOverride) {
  const cp = customPricing(uid);
  const P = plansDef()[planOverride || userPlan(uid)] || plansDef().basic;
  const base = cp && cp.base_cents != null ? cp.base_cents : P.base_cents;
  const included = cp && cp.included != null ? cp.included : P.included;
  let per = P.per_join_cents, discount = 0;
  if (cp && cp.per_join_cents != null) per = cp.per_join_cents;
  else { discount = rankFor(uid).join_discount_pct; per = Math.round(per * (1 - discount / 100) * 1000) / 1000; }
  return { base, included, per, custom: !!cp, discount_pct: discount, per_ftd: P.per_ftd_cents || 0 };
}

// ---------- plans (Basic + Pro) and the Pro trial ----------
/** Both plans with live numbers. Basic's price is the Pricing page (price.*), so the two never disagree. */
function plansDef() {
  const s = setting('plans');
  return { basic: { name: s.basic.name || 'Basic', base_cents: C.PRICE_BASE_CENTS, included: C.PRICE_INCLUDED, per_join_cents: C.PRICE_PER_CENTS, per_ftd_cents: s.basic.per_ftd_cents || 0 },
    pro: { name: s.pro.name || 'Pro', base_cents: s.pro.base_cents, included: s.pro.included, per_join_cents: s.pro.per_join_cents, per_ftd_cents: s.pro.per_ftd_cents || 0 } };
}
const nextMonthStart = (ts = Date.now()) => { const d = new Date(ts); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10); };
/** The user's plan right now. A downgrade booked for a month that has started is applied here. */
function userPlan(uid) {
  const u = Q(`SELECT plan, plan_pending, plan_pending_from FROM users WHERE id=?`).get(uid);
  if (!u) return 'basic';
  if (u.plan_pending && u.plan_pending_from && monthKey() >= u.plan_pending_from) {
    Q(`UPDATE users SET plan=?, plan_pending=NULL, plan_pending_from=NULL WHERE id=?`).run(u.plan_pending, uid);
    setImmediate(() => notifyUser(uid, 'plan_changed', { to: plansDef()[u.plan_pending].name, from: plansDef()[u.plan || 'basic'].name, applied: true }, { ref: 'plan:' + monthKey() }));
    return u.plan_pending === 'pro' ? 'pro' : 'basic';
  }
  return u.plan === 'pro' ? 'pro' : 'basic';
}
/** Admins and BILLING=off accounts see everything, like Pro. */
function seesPro(uid) {
  if (!BILLING) return true;
  const u = Q(`SELECT id, email, verified_at FROM users WHERE id=?`).get(uid);
  return !!u && (isAdmin(u) || userPlan(uid) === 'pro');
}
/** Attributed first deposits (from an ad click) since a moment. */
const attributedFtds = (uid, since) => Q(`SELECT COUNT(*) n FROM conversions v JOIN joins j ON j.id=v.join_id WHERE v.owner_id=? AND v.event='ftd' AND j.click_id IS NOT NULL AND v.created_at>=?`).get(uid, since || 0).n;
/** Trial state for the dashboard: not_started | active | ended | pro. */
function trialInfo(uid) {
  const days = setting('trial.days'), limit = setting('trial.ftd_limit'), starts = setting('trial.starts');
  const u = Q(`SELECT trial_started_at, trial_blocked, trial_ended_at FROM users WHERE id=?`).get(uid) || {};
  const base = { ftd_used: 0, ftd_limit: limit, days, starts, started_at: u.trial_started_at || null, ends_at: u.trial_started_at ? u.trial_started_at + days * 864e5 : null };
  if (seesPro(uid)) return { status: 'pro', ...base, ftd_used: u.trial_started_at ? Math.min(limit, attributedFtds(uid, u.trial_started_at)) : 0 };
  if (u.trial_blocked) return { status: 'ended', ...base, blocked: true };
  if (!u.trial_started_at) return { status: 'not_started', ...base };
  const used = attributedFtds(uid, u.trial_started_at);
  const ended = u.trial_ended_at || used >= limit || now() >= base.ends_at;
  return { status: ended ? 'ended' : 'active', ...base, ftd_used: Math.min(used, limit) };
}
/** Basic after the trial: deposits are still matched and sent to the ad platforms, but which ads drove them is hidden. */
const isLocked = (uid) => trialInfo(uid).status === 'ended';
/** Pixel IDs and ad account IDs that already had a trial (one trial per ad account, whoever signs up). */
function trialKeys(uid) {
  const keys = Q(`SELECT DISTINCT pixel_id FROM channels WHERE owner_id=? AND pixel_id IS NOT NULL AND pixel_id<>''`).all(uid).map((r) => 'px:' + r.pixel_id);
  const u = Q(`SELECT ad_account_id FROM users WHERE id=?`).get(uid);
  if (u && u.ad_account_id) keys.push('aa:' + u.ad_account_id);
  return keys;
}
/** Start the trial if this account can have one (called on signup or at the first attributed FTD). */
function startTrial(uid) {
  const u = Q(`SELECT trial_started_at, trial_blocked FROM users WHERE id=?`).get(uid);
  if (!u || u.trial_started_at || u.trial_blocked || seesPro(uid)) return false;
  const keys = trialKeys(uid);
  const used = keys.find((k) => { const r = Q(`SELECT user_id FROM trial_keys WHERE k=?`).get(k); return r && r.user_id !== uid; });
  if (used) { Q(`UPDATE users SET trial_blocked=1 WHERE id=?`).run(uid); log('trial blocked for user', uid, 'already used by', used); return false; }
  // Clock starts at the first attributed FTD (default) or now (trial.starts = signup, or an admin reset with no FTD yet).
  const since = (Q(`SELECT trial_reset_at FROM users WHERE id=?`).get(uid) || {}).trial_reset_at || 0;
  const first = setting('trial.starts') === 'first_ftd' ? Q(`SELECT MIN(v.created_at) t FROM conversions v JOIN joins j ON j.id=v.join_id WHERE v.owner_id=? AND v.event='ftd' AND j.click_id IS NOT NULL AND v.created_at>=?`).get(uid, since).t : null;
  const t = first || now();
  Q(`UPDATE users SET trial_started_at=?, trial_ended_at=NULL WHERE id=?`).run(t, uid);
  for (const k of keys) Q(`INSERT OR IGNORE INTO trial_keys(k,user_id,created_at) VALUES(?,?,?)`).run(k, uid, t);
  setImmediate(() => notifyUser(uid, 'trial_started', { days: setting('trial.days'), limit: setting('trial.ftd_limit'), ends_at: t + setting('trial.days') * 864e5, signup: setting('trial.starts') === 'signup' }, { ref: 'trial:' + t }));
  log('trial started for user', uid);
  return true;
}
/** After every attributed FTD, and every few minutes: start the trial, warn near the end, close it. Emails go once per trial. */
function checkTrial(uid) {
  try {
    if (seesPro(uid)) return;
    let u = Q(`SELECT trial_started_at, trial_ended_at, trial_blocked FROM users WHERE id=?`).get(uid);
    if (!u || u.trial_blocked) return;
    if (!u.trial_started_at) { if (setting('trial.starts') === 'signup' || attributedFtds(uid, (Q(`SELECT trial_reset_at FROM users WHERE id=?`).get(uid) || {}).trial_reset_at || 0) > 0) startTrial(uid); return; }
    const ti = trialInfo(uid), ref = 'trial:' + u.trial_started_at;
    const sentFor = (kind) => !!Q(`SELECT 1 FROM email_log WHERE user_id=? AND kind=? AND ref=? LIMIT 1`).get(uid, kind, ref);
    if (ti.status === 'ended') {
      if (!u.trial_ended_at) Q(`UPDATE users SET trial_ended_at=? WHERE id=?`).run(now(), uid);
      if (!sentFor('trial_ended')) notifyUser(uid, 'trial_ended', { used: ti.ftd_used, limit: ti.ftd_limit }, { ref });
    } else if (ti.status === 'active' && (ti.ends_at - now() <= 864e5 || ti.ftd_used >= Math.max(1, ti.ftd_limit - 2)) && !sentFor('trial_ending')) {
      notifyUser(uid, 'trial_ending', { used: ti.ftd_used, limit: ti.ftd_limit, ends_at: ti.ends_at }, { ref });
    }
  } catch (e) { log('trial check failed', uid, e.message); }
}
/** Proration: the share of this month that is left, counting today. */
function monthLeft(ts = Date.now()) { const d = new Date(ts), dim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); return { left: dim - d.getUTCDate() + 1, dim }; }
/** POST /api/billing/plan: upgrade now (prorated difference in credits), downgrade at month end. */
function changePlan(user, want) {
  if (!['basic', 'pro'].includes(want)) return { error: 'Pick Basic or Pro.' };
  const cur = userPlan(user.id), P = plansDef(), m = monthKey();
  const u = Q(`SELECT plan_pending, balance_cents FROM users WHERE id=?`).get(user.id);
  if (want === 'pro') {
    if (cur === 'pro') {
      if (u.plan_pending) { Q(`UPDATE users SET plan_pending=NULL, plan_pending_from=NULL WHERE id=?`).run(user.id); return { ok: true, plan: 'pro', change_pending: null, message: `You’re staying on ${P.pro.name}.` }; }
      return { ok: true, plan: 'pro', change_pending: null, message: `You’re already on ${P.pro.name}.` };
    }
    const { left, dim } = monthLeft();
    const free = !BILLING || isAdmin(user);
    const cost = free ? 0 : Math.max(0, Math.round((priceFor(user.id, 'pro').base - priceFor(user.id, 'basic').base) * left / dim));
    if (cost > 0 && (u.balance_cents || 0) < cost) return { error: `You need ${(cost - (u.balance_cents || 0)).toLocaleString('en-US')} more credits to upgrade today.`, need_cents: cost - (u.balance_cents || 0), cost_cents: cost };
    tx(() => {
      if (cost > 0 && addLedger(user.id, 'plan', -cost, `planup:${user.id}:${m}`, `${P.pro.name} upgrade, ${left} of ${dim} days (prorated)`)) payCommission(user.id, cost);
      Q(`UPDATE users SET plan='pro', plan_pending=NULL, plan_pending_from=NULL WHERE id=?`).run(user.id);
    });
    log('plan upgrade', user.email, 'pro', cost);
    notifyUser(user.id, 'pro_welcome', { name: user.name || '', plan: P.pro.name, base_cents: priceFor(user.id, 'pro').base, included: priceFor(user.id, 'pro').included, charged_cents: cost }, { ref: 'pro:' + m });
    return { ok: true, plan: 'pro', charged_cents: cost, change_pending: null, message: cost ? `You’re on ${P.pro.name}. ${cost.toLocaleString('en-US')} credits charged for the rest of this month.` : `You’re on ${P.pro.name}.` };
  }
  if (cur === 'basic') {
    if (u.plan_pending) Q(`UPDATE users SET plan_pending=NULL, plan_pending_from=NULL WHERE id=?`).run(user.id);
    return { ok: true, plan: 'basic', change_pending: null, message: `You’re on ${P.basic.name}.` };
  }
  const from = nextMonthStart().slice(0, 7);
  Q(`UPDATE users SET plan_pending='basic', plan_pending_from=? WHERE id=?`).run(from, user.id);
  vooEvent(user.id, 'plan_cancelled', `jv_cancel_${user.id}_${m}`, `${P.pro.name} plan cancelled (ends this month)`, { plan: P.pro.name });
  notifyUser(user.id, 'plan_changed', { to: P.basic.name, from: P.pro.name, date: nextMonthStart(), applied: false }, { ref: 'down:' + m });
  return { ok: true, plan: 'pro', change_pending: 'basic', renews: nextMonthStart(), message: `You’ll move to ${P.basic.name} on ${nextMonthStart()}. ${P.pro.name} stays on until then.` };
}

// ---------- countries (public/countries.json: ISO 3166-1 alpha-2 + Kosovo, shared with the website and dashboard) ----------
const COUNTRIES = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'countries.json'), 'utf8')); } catch { return []; } })();
const COUNTRY = new Map(COUNTRIES.map((c) => [c.code, c]));
const normCountry = (c) => { c = String(c || '').trim().toUpperCase(); return COUNTRY.has(c) ? c : null; };
const flagOf = (c) => (COUNTRY.get(c) || {}).flag || '';
/** Best guess of a visitor's country: Cloudflare's header (when trusted), else the region in Accept-Language (en-NG → NG), else null. */
function geoCountry(req) {
  if (TRUST_CLOUDFLARE) { const c = normCountry(req.headers['cf-ipcountry']); if (c) return c; }
  for (const part of String(req.headers['accept-language'] || '').split(',')) { const m = /^[a-z]{2,3}-([a-z]{2})\b/i.exec(part.trim()); if (m && normCountry(m[1])) return normCountry(m[1]); }
  return null;
}

// ---------- payment methods ----------
// Types: paystack + stripe (hosted checkout, credited by a signed webhook or on return), flutterwave (legacy), manual + crypto_manual
// (customer pays, submits the reference, an admin approves). Each method can be global, only for some countries, or for all but some.
const COUNTRY_LOCK_MS = 30 * 864e5;
/** Change a user's country and keep the history. by: 'user' | 'admin:<email>' | 'signup'. User changes count toward the 30-day lock; the first one after signup doesn't. */
function setUserCountry(uid, code, by) {
  const u = Q(`SELECT country, country_history FROM users WHERE id=?`).get(uid); if (!u || u.country === code) return false;
  let h = []; try { h = JSON.parse(u.country_history || '[]'); } catch { /* reset */ }
  h.push({ from: u.country || null, to: code, at: now(), by }); h = h.slice(-20);
  Q(`UPDATE users SET country=?, country_history=?, country_changed_at=${by === 'user' && u.country ? '?' : 'country_changed_at'} WHERE id=?`).run(...(by === 'user' && u.country ? [code, JSON.stringify(h), now(), uid] : [code, JSON.stringify(h), uid]));
  return true;
}
const countryLockedUntil = (u) => (u.country_changed_at && u.country_changed_at + COUNTRY_LOCK_MS > now() ? u.country_changed_at + COUNTRY_LOCK_MS : null);
const PM_TYPES = ['paystack', 'stripe', 'flutterwave', 'manual', 'crypto_manual', 'gatevoo', 'custom'];
const HOSTED_TYPES = new Set(['paystack', 'stripe', 'gatevoo', 'custom']); // redirect the customer to a checkout page
const MANUAL_TYPES = new Set(['manual', 'crypto_manual']);
const PM_SECRET_KEYS = ['secret_key', 'webhook_secret'];
const BUILTIN_PAYLOGOS = ['paystack', 'stripe', 'card', 'bank', 'usdt', 'btc', 'crypto', 'mobile', 'flutterwave', 'gatevoo'];
const pmJson = (v, d) => { try { return v ? (typeof v === 'string' ? JSON.parse(v) : v) : d; } catch { return d; } };
function pmCountries(m) {
  const c = pmJson(m.countries, null);
  return c && ['global', 'only', 'except'].includes(c.mode) ? { mode: c.mode, list: [...new Set((c.list || []).map(normCountry).filter(Boolean))] } : { mode: 'global', list: [] };
}
const pmConfig = (m) => pmJson(m.config, {}) || {};
/** Gateway secret: the method's own key, or (for the original "paystack" method) the key saved in Settings / env. */
function pmSecret(m) { const c = pmConfig(m); if (m.type === 'paystack') return c.secret_key || (m.id === 'paystack' ? C.PAYSTACK_SECRET : ''); if (m.type === 'stripe' || m.type === 'gatevoo' || m.type === 'custom') return c.secret_key || ''; return ''; }
const gatevooBase = (m) => String(pmConfig(m).base_url || env.GATEVOO_URL || 'https://gatevoo.com').replace(/\/+$/, '');
const pmCurrency = (m) => (m.type === 'gatevoo' ? 'USD' : m.currency ? String(m.currency).toUpperCase() : m.type === 'paystack' ? C.PAYSTACK_CURRENCY : m.type === 'flutterwave' ? C.FLW_CURRENCY : 'USD');
/** Units of the method's currency per $1 (admin-set; NGN falls back to the Pricing page rate). */
const pmFx = (m) => (m.type === 'gatevoo' ? 1 : m.fx_rate > 0 ? m.fx_rate : pmCurrency(m) === 'NGN' ? C.NGN_PER_USD : 1);
const pmConfigured = (m) => (m.type === 'paystack' || m.type === 'stripe' ? !!pmSecret(m) : m.type === 'flutterwave' ? !!C.FLW_SECRET
  : m.type === 'gatevoo' ? !!pmSecret(m) && !!pmConfig(m).webhook_secret
  : m.type === 'custom' ? !!(pmConfig(m).checkout_url || pmConfig(m).create_url) && !!pmConfig(m).webhook_secret : true);
const pmAllowed = (m, country) => { const c = pmCountries(m); if (c.mode === 'global') return true; if (!country) return false; return c.mode === 'only' ? c.list.includes(country) : !c.list.includes(country); };
/** all=true: every method (admin). Otherwise enabled + configured ones; with a country argument (even null), only those allowed there. */
function payMethods(all, country) {
  const rows = Q(`SELECT * FROM pay_methods ORDER BY sort, created_at`).all();
  if (all) return rows;
  return rows.filter((m) => m.enabled && pmConfigured(m) && (country === undefined || pmAllowed(m, country)));
}
function pmLogoUrl(m) {
  if (m.logo && /^\/media\/paylogos\/[\w.-]+(\?v=\d+)?$/.test(m.logo)) return m.logo;
  const id = BUILTIN_PAYLOGOS.includes(m.logo) ? m.logo : m.type === 'gatevoo' ? 'gatevoo' : m.type === 'custom' ? 'card' : m.type === 'crypto_manual' ? (/btc/i.test(m.currency || '') ? 'btc' : 'usdt') : m.type === 'manual' ? (/usdt/i.test(m.currency || '') ? 'usdt' : /btc/i.test(m.currency || '') ? 'btc' : 'bank') : m.type;
  return BUILTIN_PAYLOGOS.includes(id) ? `/media/paylogos/${id}.svg` : '/media/paylogos/card.svg';
}
/** What a customer sees (no secrets). */
const pmPublic = (m) => {
  const cfg = pmConfig(m);
  const o = { id: m.id, type: m.type, label: m.label, name: m.label, note: m.note || '', description: m.note || '', enabled: !!m.enabled, logo_url: pmLogoUrl(m),
    currency: pmCurrency(m), fx_rate: pmFx(m), min_usd: m.min_usd || Math.max(1, C.MIN_DEPOSIT_CENTS / 100), max_usd: m.max_usd || 10000, fee_pct: m.fee_pct || 0,
    hosted: HOSTED_TYPES.has(m.type), brand: m.type === 'gatevoo' ? 'gatevoo' : undefined };
  if (MANUAL_TYPES.has(m.type)) Object.assign(o, { currency: m.currency || '', address: m.address || cfg.address || '', instructions: m.instructions || '', explorer: m.explorer || '',
    fields: Array.isArray(cfg.fields) ? cfg.fields : [], network: cfg.network || '' });
  return o;
};
/** The manual method used by the old {provider:'crypto'} flow: m_usdt, else the first enabled USDT method. */
function usdtMethod(country) {
  const list = payMethods(false, country).filter((m) => MANUAL_TYPES.has(m.type));
  return list.find((m) => m.id === 'm_usdt') || list.find((m) => /usdt/i.test(m.currency || '')) || null;
}
// First start: create methods from the env vars you already had, once. After that /admin → Settings owns them.
if (!setting('pay.seeded', false)) {
  const ins = Q(`INSERT OR IGNORE INTO pay_methods(id,type,label,note,currency,address,instructions,explorer,enabled,sort,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
  if (env.PAYSTACK_SECRET) ins.run('paystack', 'paystack', 'Paystack', 'Card, bank transfer, USSD', null, null, null, null, 1, 1, Date.now());
  if (env.FLW_SECRET) ins.run('flutterwave', 'flutterwave', 'Flutterwave', 'Card, mobile money, bank', null, null, null, null, 1, 2, Date.now());
  if (env.USDT_TRC20_ADDRESS) ins.run('m_usdt', 'manual', 'USDT (TRC20)', 'Send USDT on the TRC20 network', 'USDT', env.USDT_TRC20_ADDRESS,
    'Send only USDT on the TRC20 (Tron) network to this address. Other tokens or networks are lost.', 'https://tronscan.org/#/transaction/{tx}', 1, 3, Date.now());
  Q(`INSERT OR REPLACE INTO settings(key,value,updated_at) VALUES('pay.seeded','true',?)`).run(Date.now()); settingsCache = null;
}
const mask = (s) => (s ? (s.length > 10 ? s.slice(0, 7) + '••••' + s.slice(-4) : '••••') : '');
// Round 8: example gateway methods, switched off until an admin adds keys. Existing methods stay global.
if (!setting('pay.seeded.v8', false)) {
  const ins = Q(`INSERT OR IGNORE INTO pay_methods(id,type,label,note,currency,address,instructions,explorer,enabled,sort,created_at,countries,logo,fx_rate,config) VALUES(?,?,?,?,?,?,?,?,0,?,?,?,?,?,?)`);
  const has = (t) => !!Q(`SELECT 1 FROM pay_methods WHERE type=? LIMIT 1`).get(t);
  ins.run('stripe', 'stripe', 'Bank card (Stripe)', 'Visa, Mastercard, Apple Pay, Google Pay', 'USD', null, null, null, 10, Date.now(), JSON.stringify({ mode: 'global', list: [] }), 'stripe', 1, '{}');
  if (!has('paystack')) ins.run('m_paystack', 'paystack', 'Paystack', 'Card, bank transfer, USSD, mobile money', 'NGN', null, null, null, 11, Date.now(), JSON.stringify({ mode: 'only', list: ['NG', 'GH', 'KE', 'ZA'] }), 'paystack', C.NGN_PER_USD, '{}');
  if (!Q(`SELECT 1 FROM pay_methods WHERE type IN ('manual','crypto_manual') AND upper(COALESCE(currency,''))='USDT' LIMIT 1`).get())
    ins.run('crypto_usdt', 'crypto_manual', 'USDT (TRC20)', 'Send USDT on the Tron network', 'USDT', null, 'Send only USDT on the TRC20 (Tron) network. Other tokens or networks are lost.', 'https://tronscan.org/#/transaction/{tx}', 12, Date.now(), JSON.stringify({ mode: 'global', list: [] }), 'usdt', 1, JSON.stringify({ network: 'TRC20', address: '' }));
  Q(`UPDATE pay_methods SET countries=? WHERE countries IS NULL`).run(JSON.stringify({ mode: 'global', list: [] }));
  Q(`INSERT OR REPLACE INTO settings(key,value,updated_at) VALUES('pay.seeded.v8','true',?)`).run(Date.now()); settingsCache = null;
}

// Round 11: Gatevoo (USDT + Bitcoin, confirmed automatically). Added switched off unless GATEVOO_API_KEY + GATEVOO_WEBHOOK_SECRET are set.
if (!setting('pay.seeded.v11', false)) {
  if (!Q(`SELECT 1 FROM pay_methods WHERE type='gatevoo' LIMIT 1`).get()) {
    const cfg = { base_url: (env.GATEVOO_URL || 'https://gatevoo.com').replace(/\/+$/, '') };
    if (env.GATEVOO_API_KEY) cfg.secret_key = env.GATEVOO_API_KEY; if (env.GATEVOO_WEBHOOK_SECRET) cfg.webhook_secret = env.GATEVOO_WEBHOOK_SECRET;
    Q(`INSERT OR IGNORE INTO pay_methods(id,type,label,note,currency,enabled,sort,created_at,countries,logo,fx_rate,config) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run('gatevoo', 'gatevoo', 'USDT or Bitcoin', 'Secure crypto checkout by Gatevoo', 'USD', cfg.secret_key && cfg.webhook_secret ? 1 : 0, 4, Date.now(), JSON.stringify({ mode: 'global', list: [] }), 'gatevoo', 1, JSON.stringify(cfg));
  }
  Q(`INSERT OR REPLACE INTO settings(key,value,updated_at) VALUES('pay.seeded.v11','true',?)`).run(Date.now()); settingsCache = null;
}
// Round 11: add Spyvoo + Gatevoo to a saved apps list and rename Advoo → Vooads (only if it still has the old name/link). Nothing else is touched.
if (!setting('apps.seeded.v11', false)) {
  const saved = Q(`SELECT value FROM settings WHERE key='apps'`).get();
  if (saved) {
    try {
      let list = JSON.parse(saved.value) || [];
      list = list.map((a) => (a && a.id === 'advoo' && a.name === 'Advoo' ? { ...a, name: 'Vooads', url: /^https?:\/\/(www\.)?advoo\.com\/?$/.test(a.url || '') ? 'https://vooads.com' : a.url } : a));
      for (const id of ['spyvoo', 'gatevoo']) if (!list.some((a) => a && a.id === id)) { const d = DEFAULT_APPS.find((a) => a.id === id); const at = list.findIndex((a) => a && a.id === 'voosquare'); list.splice(at < 0 ? list.length : at, 0, { ...d }); }
      Q(`UPDATE settings SET value=?, updated_at=? WHERE key='apps'`).run(JSON.stringify(appsValidate(list)), Date.now());
    } catch (e) { console.log('apps upgrade skipped:', e.message); }
  }
  Q(`INSERT OR REPLACE INTO settings(key,value,updated_at) VALUES('apps.seeded.v11','true',?)`).run(Date.now()); settingsCache = null;
}

// ---------- helpers ----------
const now = () => Date.now();
const rid = (n = 9) => crypto.randomBytes(n).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(String(s).trim().toLowerCase()).digest('hex');
const hmac = (s) => crypto.createHmac('sha256', APP_SECRET).update(String(s)).digest('base64url').slice(0, 16);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const log = (...a) => console.log(new Date().toISOString(), ...a);

const BUMP_FIELDS = new Set(['clicks', 'joins', 'organic', 'leaves', 'capi_ok', 'capi_fail', 'tt_ok', 'tt_fail', 'sc_ok', 'sc_fail', 'suspect', 'filtered']);
const bumpIns = Q(`INSERT INTO hourly(channel_id,hour,owner_id) VALUES(?,?,?) ON CONFLICT DO NOTHING`);
const bumpStmts = {};
for (const f of BUMP_FIELDS) bumpStmts[f] = Q(`UPDATE hourly SET ${f}=${f}+? WHERE channel_id=? AND hour=?`);
function bump(channelId, ownerId, ts, field, n = 1) {
  if (!BUMP_FIELDS.has(field)) return;
  const hour = Math.floor(ts / 3600000);
  bumpIns.run(channelId, hour, ownerId);
  bumpStmts[field].run(n, channelId, hour);
}

// ---------- money ----------
let txDepth = 0;
function tx(fn) {
  if (txDepth) return fn();
  txDepth++; db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } finally { txDepth--; }
}
const monthKey = (ts = Date.now()) => new Date(ts).toISOString().slice(0, 7);
/** Add one ledger row (idempotent by ref) and move the user's balance with it. Returns false if ref was already used. */
function addLedger(userId, kind, cents, ref, note) {
  return tx(() => {
    const r = Q(`INSERT INTO ledger(user_id,kind,amount_cents,ref,note,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(ref) DO NOTHING`)
      .run(userId, kind, Math.round(cents), ref || 'x:' + rid(10), note || null, Date.now());
    if (!r.changes) return false;
    Q(`UPDATE users SET balance_cents=COALESCE(balance_cents,0)+? WHERE id=?`).run(Math.round(cents), userId);
    // VooSquare: a plan charge is money used (spend + plan sync). Top-ups are reported by markDepositPaid, other use by vooUseJob.
    if (kind === 'plan' && cents < 0) vooPlanCharged(userId, Number(r.lastInsertRowid), -Math.round(cents), ref);
    return true;
  });
}
const safeEq = (a, b) => { a = Buffer.from(String(a || '')); b = Buffer.from(String(b || '')); return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b); };
function publicHttpsUrl(u) {
  try { const x = new URL(u); if (x.protocol !== 'https:') return false;
    const h = x.hostname.toLowerCase().replace(/\.$/, '');
    return !(h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || privateIp(h) || /^\[/.test(h) || /^\d+$/.test(h)); } catch { return false; }
}
/** Private, loopback, link-local, CGNAT and other non-public IPv4 / IPv6 addresses. */
function privateIp(ip) {
  ip = String(ip || '').toLowerCase().replace(/^\[|\]$/g, '');
  const m4 = /^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(ip);
  if (m4) { const [a, b] = [+m4[1], +m4[2]]; return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224; }
  if (!ip.includes(':')) return false;
  return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^::ffff:/.test(ip) || /^64:ff9b:/.test(ip);
}
/** Customer-supplied addresses we POST to (bot forwarding): https, a public host name, and every address it resolves to is public
 * (no DNS tricks like a name that points at 127.0.0.1 or the cloud metadata address). */
async function publicHttpsTarget(u) {
  if (!publicHttpsUrl(u)) return false;
  const h = new URL(u).hostname;
  try { const addrs = await require('dns').promises.lookup(h, { all: true, verbatim: true }); return addrs.length > 0 && !addrs.some((a) => privateIp(a.address)); } catch { return false; }
}
const isAdminEmail = (email) => ADMIN_EMAILS.includes(String(email || '').toLowerCase());
const isVerified = (u) => !!(u.verified_at ?? (Q(`SELECT verified_at FROM users WHERE id=?`).get(u.id) || {}).verified_at);

// ---------- staff: roles + permissions ----------
// Every /api/admin/* call checks a permission server-side (adminPerm below). Owners have everything. ADMIN_EMAILS are always owners.
// Staff rights need a confirmed inbox, so nobody can grab a staff address by signing up first.
// TODO(2FA): staff accounts may later require a second factor (TOTP) before /api/admin/* — add a `staff.totp` column and a check in staffOf().
const PERMS = {
  'overview.view': 'See the overview and totals', 'users.view': 'See users and their details', 'users.edit': 'Suspend, log out, change country',
  'users.credits': 'Add or remove credits (single and bulk)', 'users.plan': 'Change plans, trials and custom pricing', 'users.reset': 'Send a password reset email',
  'support.view': 'Read support chats', 'support.reply': 'Reply, assign, close chats and edit saved replies',
  'deposits.view': 'See deposits', 'deposits.approve': 'Approve or reject manual top-ups', 'payouts.view': 'See withdrawals', 'payouts.send': 'Mark withdrawals paid or reject them',
  'payments.manage': 'Payment methods and their keys', 'promos.manage': 'Promo codes', 'broadcasts.view': 'See inbox broadcasts', 'broadcasts.send': 'Send and delete broadcasts',
  'marketing.manage': 'Sister products, Joe’s persona and knowledge', 'emails.view': 'Preview emails and send tests to themselves',
  'settings.view': 'See settings', 'settings.edit': 'Change settings (features, pricing, plans, brand…)', 'keys.manage': 'API keys and link domains',
  'health.view': 'See system health', 'jobs.run': 'Run jobs and retry failed sends', 'backup.download': 'Download a database backup',
  'staff.manage': 'Invite staff and change their roles', 'audit.view': 'See the audit log',
};
const PERM_KEYS = Object.keys(PERMS);
const BUILTIN_ROLES = [
  ['owner', 'Owner', PERM_KEYS],
  ['admin', 'Admin', PERM_KEYS],
  ['finance', 'Finance', ['overview.view', 'users.view', 'users.credits', 'deposits.view', 'deposits.approve', 'payouts.view', 'payouts.send', 'payments.manage', 'promos.manage', 'settings.view']],
  ['support', 'Support', ['users.view', 'users.reset', 'support.view', 'support.reply', 'broadcasts.view']],
  ['marketing', 'Marketing', ['overview.view', 'broadcasts.view', 'broadcasts.send', 'marketing.manage', 'emails.view', 'settings.view']],
  ['viewer', 'Viewer', ['overview.view', 'users.view', 'health.view']],
];
const pj = (v, d) => { try { return v ? JSON.parse(v) : d; } catch { return d; } };
function rolesMap() { return new Map(Q(`SELECT * FROM roles ORDER BY sort, name`).all().map((r) => [r.id, { id: r.id, name: r.name, builtin: !!r.builtin, perms: r.id === 'owner' ? PERM_KEYS : pj(r.perms, []).filter((x) => PERMS[x]) }])); }
/** {user_id, email, role, role_name, perms:Set, status, env} for an active, verified staff member — else null. */
const staffCache = new Map(); const staffBust = () => staffCache.clear();
function staffOf(u) {
  if (!u) return null;
  const hit = staffCache.get(u.id);
  if (hit && Date.now() - hit.at < 30000 && hit.email === u.email) return hit.v;
  const v = staffLoad(u); staffCache.set(u.id, { at: Date.now(), email: u.email, v }); return v;
}
function staffLoad(u) {
  if (!isVerified(u)) return null;
  if (isAdminEmail(u.email)) {
    const r = Q(`SELECT * FROM staff WHERE user_id=?`).get(u.id);
    if (!r) Q(`INSERT INTO staff(user_id,role,status,invited_by,created_at) VALUES(?,?,?,?,?)`).run(u.id, 'owner', 'active', 'ADMIN_EMAILS', now());
    else if (r.role !== 'owner' || r.status !== 'active') Q(`UPDATE staff SET role='owner', status='active' WHERE user_id=?`).run(u.id);
  }
  const r = Q(`SELECT * FROM staff WHERE user_id=?`).get(u.id);
  if (!r || r.status === 'suspended') return null;
  if (r.status === 'invited') Q(`UPDATE staff SET status='active' WHERE user_id=?`).run(u.id);
  const role = rolesMap().get(r.role) || { id: r.role, name: r.role, perms: [] };
  const perms = new Set(r.role === 'owner' ? PERM_KEYS : [...role.perms, ...pj(r.grants, [])].filter((x) => PERMS[x] && !pj(r.revokes, []).includes(x)));
  return { user_id: u.id, email: u.email, role: r.role, role_name: role.name, perms, env: isAdminEmail(u.email), status: 'active' };
}
// "Admin" for billing (tracks for free, no balance emails): owners and admins only.
const isAdmin = (u) => { const st = staffOf(u); return !!st && (st.role === 'owner' || st.role === 'admin'); };
const activeOwners = () => Q(`SELECT s.user_id, u.email FROM staff s JOIN users u ON u.id=s.user_id WHERE s.role='owner' AND s.status<>'suspended' AND u.verified_at IS NOT NULL`).all();
// built-in roles are created once; admins can change their permissions later (owner always has everything)
for (const [i, [id, name, perms]] of BUILTIN_ROLES.entries()) Q(`INSERT OR IGNORE INTO roles(id,name,perms,builtin,sort,created_at) VALUES(?,?,?,1,?,?)`).run(id, name, JSON.stringify(perms), i, Date.now());
/** Same inbox, different spelling (Gmail dots, +tags) → same canonical address. Used so one person gets one welcome credit. */
function canonicalEmail(e) {
  let [local, domain] = String(e).toLowerCase().split('@');
  local = local.split('+')[0];
  if (domain === 'gmail.com' || domain === 'googlemail.com') { local = local.replace(/\./g, ''); domain = 'gmail.com'; }
  return local + '@' + domain;
}
const verifyToken = (uid, exp = Date.now() + 7 * 864e5) => `${uid}.${exp}.${hmac('verify:' + uid + ':' + exp)}`;
/** Welcome gift, once per inbox: C.FREE_JOINS free tracked joins (no plan fee while they last), plus optional wallet credit. */
function grantWelcome(uid) {
  const u = Q(`SELECT canon, email FROM users WHERE id=?`).get(uid);
  const canon = u.canon || canonicalEmail(u.email);
  let given = false;
  if (C.FREE_JOINS > 0 && addLedger(uid, 'welcome', 0, 'welcome:' + canon, `Welcome gift: first ${C.FREE_JOINS.toLocaleString('en-US')} tracked joins free`)) {
    Q(`UPDATE users SET free_joins=? WHERE id=?`).run(C.FREE_JOINS, uid); given = true;
  }
  if (C.WELCOME_CREDIT_CENTS > 0 && addLedger(uid, 'welcome', C.WELCOME_CREDIT_CENTS, 'welcomecash:' + canon, 'Welcome credit')) given = true;
  return given;
}
/** Can this account track right now? Doesn't charge anything. */
function trackingState(userId) {
  const u = Q(`SELECT id, email, balance_cents, status, verified_at, free_joins FROM users WHERE id=?`).get(userId);
  if (!u) return { ok: false, reason: 'missing' };
  if (u.status === 'suspended') return { ok: false, reason: 'suspended' };
  if (!BILLING || isAdmin(u)) return { ok: true, reason: 'free' };
  if (u.free_joins > 0) return { ok: true, reason: 'trial' }; // still on the free joins: no plan fee yet
  const m = monthKey();
  const planPaid = !!Q(`SELECT 1 FROM ledger WHERE ref=?`).get(`plan:${userId}:${m}`);
  const pr = priceFor(userId);
  if (!planPaid) return u.balance_cents >= pr.base ? { ok: true, reason: 'plan_due' } : { ok: false, reason: 'need_plan' };
  const used = (Q(`SELECT joins FROM usage WHERE user_id=? AND month=?`).get(userId, m) || { joins: 0 }).joins;
  if (used < pr.included || u.balance_cents >= Math.ceil(pr.per)) return { ok: true, reason: 'active' };
  return { ok: false, reason: 'empty' };
}
/** Called on every ad click. Charges the monthly plan on the first click of the month. */
function allowTracking(userId) {
  const st = trackingState(userId);
  if (st.reason === 'plan_due') {
    const m = monthKey(), plan = userPlan(userId);
    // Upgraded to Pro earlier this month: the prorated difference is already paid, so this month's fee is the Basic one.
    const upgraded = plan === 'pro' && !!Q(`SELECT 1 FROM ledger WHERE ref=?`).get(`planup:${userId}:${m}`);
    const base = priceFor(userId, upgraded ? 'basic' : plan).base, pname = plansDef()[plan].name;
    tx(() => { if (addLedger(userId, 'plan', -base, `plan:${userId}:${m}`, `${plan === 'pro' ? pname + ' plan' : 'Monthly plan'} · ${new Date().toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`)) payCommission(userId, base); });
  }
  if (!st.ok) {
    const u = Q(`SELECT paused_at FROM users WHERE id=?`).get(userId);
    if (!u.paused_at || u.paused_at < Date.now() - 3600000) { Q(`UPDATE users SET paused_at=? WHERE id=?`).run(Date.now(), userId); log('tracking paused for user', userId, st.reason); }
    if (st.reason === 'need_plan' || st.reason === 'empty') setImmediate(() => { notifyUser(userId, 'tracking_paused', { reason: st.reason }, { every: 864e5 });
      alertUser(userId, 'paused', tr(userLang(userId), 'alert.paused'), { every: 864e5 }); });
  } else if (st.reason === 'plan_due') setImmediate(() => checkLowBalance(userId));
  return st.ok;
}
/** Called once per tracked (ad) join. Joins past the monthly allowance cost C.PRICE_PER_CENTS each, grouped per day in the ledger. */
function chargeJoin(userId) {
  tx(() => {
    const m = monthKey();
    // Free welcome joins are used first and don't count toward the month's paid allowance.
    if (BILLING && Q(`UPDATE users SET free_joins=free_joins-1 WHERE id=? AND free_joins>0`).run(userId).changes) {
      const left = Q(`SELECT free_joins FROM users WHERE id=?`).get(userId).free_joins, gift = Math.max(C.FREE_JOINS, left);
      if (left === 0) setImmediate(() => notifyUser(userId, 'free_joins_used', { gift }, { once: true }));
      else if (gift >= 10 && left <= Math.floor(gift * 0.2)) setImmediate(() => notifyUser(userId, 'free_joins_80', { gift, left }, { once: true }));
      return;
    }
    Q(`INSERT INTO usage(user_id,month,joins) VALUES(?,?,1) ON CONFLICT(user_id,month) DO UPDATE SET joins=joins+1`).run(userId, m);
    if (!BILLING) return;
    const u = Q(`SELECT id, email, verified_at FROM users WHERE id=?`).get(userId);
    if (!u || isAdmin(u)) return;
    const n = Q(`SELECT joins FROM usage WHERE user_id=? AND month=?`).get(userId, m).joins;
    const pr = priceFor(userId);
    if (n <= pr.included) return;
    // A discounted or custom price can be a fraction of a credit: keep the remainder and charge whole credits.
    const carry = (Q(`SELECT carry FROM usage WHERE user_id=? AND month=?`).get(userId, m).carry || 0) + pr.per;
    const cents = Math.floor(carry + 1e-9);
    Q(`UPDATE usage SET carry=? WHERE user_id=? AND month=?`).run(carry - cents, userId, m);
    if (cents <= 0) return;
    const day = new Date().toISOString().slice(0, 10);
    Q(`INSERT INTO ledger(user_id,kind,amount_cents,ref,note,created_at) VALUES(?,'joins',?,?,?,?)
      ON CONFLICT(ref) DO UPDATE SET amount_cents=amount_cents+excluded.amount_cents, created_at=excluded.created_at`)
      .run(userId, -cents, `joins:${userId}:${day}`, `Extra joins · ${day.slice(5)}`, Date.now());
    Q(`UPDATE users SET balance_cents=COALESCE(balance_cents,0)-? WHERE id=?`).run(cents, userId);
    payCommission(userId, cents);
    setImmediate(() => checkLowBalance(userId));
  });
}
/** Optional per-FTD fee of the plan (0 by default): one ledger row per day, like extra joins. */
function chargeFtd(userId) {
  if (!BILLING) return;
  const u = Q(`SELECT id, email, verified_at FROM users WHERE id=?`).get(userId);
  if (!u || isAdmin(u)) return;
  const cents = priceFor(userId).per_ftd; if (!(cents > 0)) return;
  const day = new Date().toISOString().slice(0, 10);
  tx(() => {
    Q(`INSERT INTO ledger(user_id,kind,amount_cents,ref,note,created_at) VALUES(?,'ftds',?,?,?,?) ON CONFLICT(ref) DO UPDATE SET amount_cents=amount_cents+excluded.amount_cents, created_at=excluded.created_at`)
      .run(userId, -cents, `ftds:${userId}:${day}`, `Tracked first deposits · ${day.slice(5)}`, Date.now());
    Q(`UPDATE users SET balance_cents=COALESCE(balance_cents,0)-? WHERE id=?`).run(cents, userId);
    payCommission(userId, cents);
  });
}
/**
 * Referral commission: the referrer earns their tier's share of what the referred user SPENDS (plan + joins),
 * but only the part of that spend paid for with real money (deposits), never welcome or admin credit.
 * Call right after a spend row was written to the ledger.
 */
function payCommission(userId, cents) {
  if (cents <= 0 || !feature('referrals') || setting('voo.referrals') === 'voosquare') return; // referrals live in VooSquare: no new local commissions
  const u = Q(`SELECT referred_by FROM users WHERE id=?`).get(userId);
  if (!u || !u.referred_by) return;
  // Real money paid in: top-ups minus refunds and chargebacks of them (a charged-back top-up never earns a referrer anything more).
  const paid = Q(`SELECT COALESCE(SUM(amount_cents),0) n FROM ledger WHERE user_id=? AND kind IN ('deposit','refund','chargeback')`).get(userId).n;
  // Everything paid from the wallet counts as using it up, Joe answers included (they earn no commission themselves, but money
  // already used on them cannot pay for a plan a second time).
  const spent = -Q(`SELECT COALESCE(SUM(amount_cents),0) n FROM ledger WHERE user_id=? AND kind IN ('plan','joins','ftds','joe')`).get(userId).n;
  const base = Math.max(0, Math.min(spent, paid) - Math.min(spent - cents, paid));
  if (!base) return;
  const { tier } = refTier(u.referred_by);
  const ref = `ref:${u.referred_by}:${userId}:${new Date().toISOString().slice(0, 10)}:${tier.rate}`;
  Q(`INSERT INTO ref_earnings(referrer_id,from_user,ref,base_cents,amount_cents,rate,created_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(ref) DO UPDATE SET base_cents=base_cents+excluded.base_cents, amount_cents=CAST((base_cents+excluded.base_cents)*rate AS INTEGER)`)
    .run(u.referred_by, userId, ref, base, Math.floor(base * tier.rate), tier.rate, Date.now());
}
// One-time moves from the old computed billing, then make every cached balance match the ledger.
for (const d of Q(`SELECT id, user_id, amount_cents, provider FROM deposits WHERE status='paid'`).all()) addLedger(d.user_id, 'deposit', d.amount_cents, `dep:${d.id}`, `Top-up via ${d.provider}`);
for (const u of Q(`SELECT id, credit_cents FROM users WHERE credit_cents>0`).all()) { addLedger(u.id, 'refcredit', u.credit_cents, `legacy-credit:${u.id}`, 'Referral earnings moved to balance'); Q(`UPDATE users SET credit_cents=0 WHERE id=?`).run(u.id); }
Q(`UPDATE users SET balance_cents=(SELECT COALESCE(SUM(amount_cents),0) FROM ledger WHERE ledger.user_id=users.id)`).run();

function hashPass(p) { const salt = rid(12); return salt + '$' + crypto.scryptSync(p, salt, 32).toString('hex'); }
function checkPass(p, stored) {
  const [salt, h] = String(stored).split('$');
  const got = crypto.scryptSync(p, salt, 32);
  return h && crypto.timingSafeEqual(got, Buffer.from(h, 'hex'));
}

async function tg(token, method, params = {}) {
  try {
    const r = await fetch(`${TG_API}/bot${token}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params), signal: AbortSignal.timeout(15000),
    });
    return await r.json();
  } catch (e) { return { ok: false, error_code: 0, description: 'Network error: ' + e.message }; }
}

// ---------- http plumbing ----------
function send(res, code, body, headers = {}) {
  if (typeof body === 'object' && body !== null && !Buffer.isBuffer(body)) {
    body = JSON.stringify(body); headers['content-type'] = 'application/json; charset=utf-8';
  }
  // Keep cookies set earlier on this response (the Voo Connect kit's attribution and login cookies) next to ours.
  const pre = res.getHeader('set-cookie'); if (pre && headers['set-cookie']) headers['set-cookie'] = [].concat(pre, headers['set-cookie']);
  if (res._noStore) headers['cache-control'] = 'no-store'; // a response that sets a visitor's cookie is never cached by a CDN
  res.writeHead(code, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'SAMEORIGIN', ...headers });
  res.end(body);
}
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function readJson(req, limit) {
  try { const v = JSON.parse((await readBody(req, limit)) || '{}'); const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; req._body = o; return o; } catch { return {}; }
}
function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i > 0) { try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* bad cookie */ } }
  }
  return out;
}
function cookie(name, value, maxAgeSec) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${SECURE ? '; Secure' : ''}`;
}
/** Proxies in front of Joinvoo whose X-Forwarded-For we believe. TRUST_PROXY=<n>: n hops (the visitor is the n-th address from the
 * right), 0 = never read the header. Unset: one hop, but only when the connection itself comes from a private or loopback address
 * (Caddy on the same machine, Railway's edge); a visitor connecting straight from the internet cannot pick their own address. */
const TRUST_PROXY = env.TRUST_PROXY == null || String(env.TRUST_PROXY).trim() === '' ? null : Math.max(0, Math.min(10, Math.floor(Number(env.TRUST_PROXY)) || 0));
function clientIp(req) {
  // Cloudflare's header if the operator says traffic comes through Cloudflare; otherwise the address our own proxy appended last.
  if (TRUST_CLOUDFLARE && req.headers['cf-connecting-ip']) return String(req.headers['cf-connecting-ip']);
  const peer = String(req.socket.remoteAddress || '');
  const hops = TRUST_PROXY != null ? TRUST_PROXY : privateIp(peer) ? 1 : 0;
  if (!hops) return peer;
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff.length ? xff[Math.max(0, xff.length - hops)] : peer;
}
function currentUser(req) {
  const t = cookies(req).jp_session; if (!t) return null;
  const s = Q(`SELECT u.id, u.email, u.name, u.status, u.last_seen, u.verified_at, s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?`).get(t);
  if (!s || s.expires_at < now() || s.status === 'suspended') return null;
  if (!s.last_seen || s.last_seen < now() - 600000) Q(`UPDATE users SET last_seen=? WHERE id=?`).run(now(), s.id);
  return s;
}
/** Simple fixed-window limiter stored in SQLite. Returns true when the caller is over the limit. */
function limited(key, max, windowSec) {
  const t = now();
  const row = Q(`SELECT n, reset_at FROM hits WHERE k=?`).get(key);
  if (!row || row.reset_at < t) { Q(`INSERT INTO hits(k,n,reset_at) VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET n=1, reset_at=excluded.reset_at`).run(key, t + windowSec * 1000); return false; }
  Q(`UPDATE hits SET n=n+1 WHERE k=?`).run(key);
  return row.n + 1 > max;
}

// ---------- email (Resend). Without RESEND_API_KEY, emails are written to the log instead. ----------
async function sendMail(to, subject, html, text) {
  if (!resendKey()) { log('[email not sent: RESEND_API_KEY missing] to', to, '|', subject, '| links:', [...html.matchAll(/href="([^"]+)"/g)].map((x) => x[1].replace(/&amp;/g, '&')).filter((h) => !h.startsWith('mailto:')).join(' ')); return false; }
  try {
    const payload = { from: C.MAIL_FROM, to: [to], subject, html };
    if (text) payload.text = text;
    const se = setting('brand.support_email'); if (se) payload.reply_to = se;
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + resendKey(), 'content-type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
    if (!r.ok) log('email failed', r.status, await r.text().catch(() => ''));
    return r.ok;
  } catch (e) { log('email failed', e.message); return false; }
}

const EM = { brand: '#5b3df5', brandDark: '#4a2fe0', ink: '#16132b', body: '#3b3758', muted: '#7a7694', line: '#ebe9f4', soft: '#f6f5fb', bg: '#f1effa',
  font: "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  tone: { violet: ['#efebff', '#4a2fe0'], mint: ['#e6f6ee', '#1f7a4f'], amber: ['#fdf3df', '#8a5a0b'], coral: ['#fdeceb', '#b4322b'], sky: ['#eaf0fd', '#3651c9'] } };
const $usd = (c) => '$' + (Math.abs(c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $num = (n) => Number(n || 0).toLocaleString('en-US');
const strip = (h) => String(h).replace(/<br\s*\/?>/g, '\n').replace(/<li[^>]*>/g, '• ').replace(/<\/(p|li|div|tr)>/g, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+\n/g, '\n').trim();
function mailButton(text, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px"><tr><td align="center" bgcolor="${EM.brand}" style="border-radius:14px;background:${EM.brand};background-image:linear-gradient(135deg,#6a4bff,${EM.brandDark})">
<a href="${esc(url)}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:${EM.font};font-size:16px;font-weight:700;line-height:20px;color:#ffffff;text-decoration:none;border-radius:14px;white-space:nowrap">${esc(text)} &rarr;</a></td></tr></table>`;
}
function mailAvatar(agent, size = 44) {
  const photo = agent && agent.photo ? (agent.photo.startsWith('http') ? agent.photo : BASE_URL + agent.photo) : '';
  if (photo) return `<img src="${esc(photo)}" width="${size}" height="${size}" alt="${esc(agent.name)}" style="display:block;width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:0">`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="${size}" height="${size}" align="center" valign="middle" bgcolor="#efebff" style="width:${size}px;height:${size}px;border-radius:50%;background:#efebff;color:${EM.brand};font-family:${EM.font};font-size:${Math.round(size * 0.42)}px;font-weight:800">${esc(((agent && agent.name) || 'J').trim().charAt(0).toUpperCase())}</td></tr></table>`;
}
/**
 * Blocks: { subject, preheader, icon, tone, title, lead, paras[], rows[[label,value]], callout:{html,tone}, progress:{pct,label}, stats[[value,label]],
 *           quote:{agent,body}, cta:{text,url}, link (show the raw URL under the button), after[], ps }
 */
// ---------- server i18n: emails + Telegram bot messages (public/i18n/server.<lang>.json, English is the source) ----------
const LANGS = ['en', 'ru', 'fr', 'pt', 'es'];
const I18N_DIR = path.join(__dirname, 'public', 'i18n');
const normLang = (l) => { l = String(l || '').toLowerCase().slice(0, 2); return LANGS.includes(l) ? l : 'en'; };
let srvDict = null, srvDictChecked = 0;
/** All server strings, re-read when a file changes (checked at most every 30 s). A missing or broken file only loses that language. */
function srvStrings() {
  if (srvDict && Date.now() - srvDictChecked < 30000) return srvDict;
  srvDictChecked = Date.now();
  const next = {}, stamp = [];
  for (const l of LANGS) {
    const f = path.join(I18N_DIR, `server.${l}.json`);
    try { const st = fs.statSync(f); stamp.push(l + st.mtimeMs); } catch { stamp.push(l + '0'); }
  }
  if (srvDict && srvDict.__stamp === stamp.join('|')) return srvDict;
  for (const l of LANGS) { try { next[l] = JSON.parse(fs.readFileSync(path.join(I18N_DIR, `server.${l}.json`), 'utf8')); } catch { next[l] = {}; } }
  next.__stamp = stamp.join('|');
  srvDict = next; return srvDict;
}
/** Translate one key: the user's language → English → the key itself. {vars} are filled in as given (escape HTML before passing). */
function tr(lang, key, vars) {
  const D = srvStrings();
  let s = (D[lang] && D[lang][key]) ?? (D.en && D.en[key]) ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : m));
  return s;
}
const userLang = (uid) => normLang(uid ? (Q(`SELECT lang FROM users WHERE id=?`).get(uid) || {}).lang : 'en');

// Header illustrations (public/media/email/<art>.gif|png, 600×260). Only used when the file exists, so a missing one never leaves a broken image.
const EMAIL_ART = { welcome: 'welcome', password_reset: 'reset', password_changed: 'password_changed', payment_received: 'payment', topup_review: 'review', topup_rejected: 'rejected',
  low_balance: 'low_balance', tracking_paused: 'paused', free_joins_80: 'free_80', free_joins_used: 'free_done', payout_requested: 'payout_requested', payout_sent: 'payout_sent',
  payout_rejected: 'payout_rejected', support_reply: 'support_reply', weekly_summary: 'weekly', trial_started: 'trial_started', trial_ending: 'trial_ending', trial_ended: 'trial_ended',
  pro_welcome: 'pro_welcome', plan_changed: 'plan_changed', meet_joe: 'meet_joe', rank_up: 'rank_up', level_up: ['level_up', 'rank_up'], credits_added: ['credits_added', 'payment'], staff_invite: ['staff_invite', 'welcome'] };
const artCache = new Map();
function emailArt(name) {
  const hit = artCache.get(name); if (hit && Date.now() - hit.at < 60000) return hit.url;
  let url = '';
  for (const a of [].concat(EMAIL_ART[name] || [])) {
    for (const ext of ['gif', 'png']) if (!url && fs.existsSync(path.join(__dirname, 'public', 'media', 'email', `${a}.${ext}`))) url = `${BASE_URL}/media/email/${a}.${ext}`;
    if (url) break;
  }
  artCache.set(name, { url, at: Date.now() }); return url;
}

/*
 * Email design: one table-based layout (600px, inline styles, works in Gmail/Outlook/Apple Mail), a violet header with the
 * wordmark, an optional header illustration, a white card, one big button, and a footer. Every template returns blocks; renderMail() turns them into HTML + plain text.
 */
function renderMail(b, lang = 'en') {
  const T = (k, v) => tr(lang, k, v);
  const company = C.COMPANY, se = setting('brand.support_email'), contact = C.SUPPORT_CONTACT;
  const helpUrl = se ? 'mailto:' + se : contact || BASE_URL + '/#support';
  const P = (h) => `<p style="margin:0 0 14px;font-family:${EM.font};font-size:15.5px;line-height:1.65;color:${EM.body}">${h}</p>`;
  const tone = EM.tone[b.tone || 'violet'] || EM.tone.violet;
  let inner = '';
  if (b.icon && !b.art) inner += `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px"><tr><td width="52" height="52" align="center" valign="middle" bgcolor="${tone[0]}" style="width:52px;height:52px;border-radius:16px;background:${tone[0]};font-size:26px;line-height:52px">${b.icon}</td></tr></table>`;
  inner += `<h1 style="margin:0 0 12px;font-family:${EM.font};font-size:26px;line-height:1.25;font-weight:800;letter-spacing:-0.5px;color:${EM.ink}">${esc(b.title)}</h1>`;
  if (b.lead) inner += `<p style="margin:0 0 16px;font-family:${EM.font};font-size:17px;line-height:1.6;color:${EM.ink}">${b.lead}</p>`;
  for (const p of b.paras || []) inner += P(p);
  if (b.quote) {
    const a = b.quote.agent || {};
    inner += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 8px"><tr><td valign="top" width="56" style="width:56px;padding:2px 12px 0 0">${mailAvatar(a)}</td>
<td valign="top"><p style="margin:0 0 6px;font-family:${EM.font};font-size:14px;color:${EM.ink}"><b>${esc(a.name || T('mail.support'))}</b>${a.role ? ` <span style="color:${EM.muted}">· ${esc(a.role)}</span>` : ''}</p>
<div style="background:${EM.soft};border:1px solid ${EM.line};border-radius:4px 18px 18px 18px;padding:14px 16px;font-family:${EM.font};font-size:15px;line-height:1.6;color:${EM.ink};white-space:pre-wrap">${esc(b.quote.body)}</div></td></tr></table>`;
  }
  if (b.stats) {
    inner += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 14px"><tr>${b.stats.map(([v, l], i) => `<td class="jst" width="${Math.floor(100 / b.stats.length)}%" valign="top" style="padding:${i ? '0 0 0 8px' : '0'}"><div style="background:${[EM.tone.violet, EM.tone.sky, EM.tone.amber, EM.tone.mint][i % 4][0]};border-radius:16px;padding:14px 12px"><div style="font-family:${EM.font};font-size:22px;font-weight:800;letter-spacing:-0.5px;color:${[EM.tone.violet, EM.tone.sky, EM.tone.amber, EM.tone.mint][i % 4][1]}">${esc(v)}</div><div style="font-family:${EM.font};font-size:12.5px;font-weight:600;color:${EM.body};margin-top:2px">${esc(l)}</div></div></td>`).join('')}</tr></table>`;
  }
  if (b.progress) {
    const pct = Math.max(2, Math.min(100, Math.round(b.progress.pct)));
    inner += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 6px"><tr><td bgcolor="${EM.line}" style="background:${EM.line};border-radius:99px;height:12px;line-height:12px;font-size:0">
<table role="presentation" width="${pct}%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${EM.brand}" style="background:${EM.brand};border-radius:99px;height:12px;line-height:12px;font-size:0">&nbsp;</td></tr></table></td></tr></table>
<p style="margin:0 0 16px;font-family:${EM.font};font-size:13px;color:${EM.muted}">${esc(b.progress.label)}</p>`;
  }
  if (b.rows && b.rows.length) {
    inner += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 16px;background:${EM.soft};border:1px solid ${EM.line};border-radius:16px">
${b.rows.map(([k, v], i) => `<tr><td class="jk" style="padding:12px 16px;${i ? `border-top:1px solid ${EM.line};` : ''}font-family:${EM.font};font-size:14px;color:${EM.muted};vertical-align:top">${esc(k)}</td><td class="jv" align="right" style="padding:12px 16px;${i ? `border-top:1px solid ${EM.line};` : ''}font-family:${EM.font};font-size:14px;font-weight:700;color:${EM.ink};overflow-wrap:anywhere;vertical-align:top">${v}</td></tr>`).join('')}</table>`;
  }
  if (b.callout) { const t = EM.tone[b.callout.tone || 'violet']; inner += `<div style="margin:6px 0 16px;background:${t[0]};border-radius:14px;padding:14px 16px;font-family:${EM.font};font-size:14.5px;line-height:1.6;color:${t[1]}">${b.callout.html}</div>`; }
  if (b.cta) inner += mailButton(b.cta.text, b.cta.url);
  if (b.cta && b.link) inner += `<p style="margin:10px 0 0;font-family:${EM.font};font-size:12.5px;line-height:1.5;color:${EM.muted}">${T('mail.button_broken')}<br><a href="${esc(b.cta.url)}" style="color:${EM.brand};word-break:break-all">${esc(b.cta.url)}</a></p>`;
  if ((b.after || []).length) inner += `<div style="height:14px;line-height:14px;font-size:0">&nbsp;</div>` + b.after.map(P).join('');
  const lnk = (href, text) => `<a href="${esc(href)}" style="color:${EM.brand};text-decoration:none;font-weight:600">${esc(text)}</a>`;
  const questions = se ? T('mail.q_email', { email: lnk('mailto:' + se, se) }) : T('mail.q_chat', { chat: lnk(helpUrl, T('mail.chat_team')) });
  // The illustration sits under the header in a tinted cell with fixed proportions, so blocked or missing images still leave a tidy card.
  const art = b.art ? `<tr><td bgcolor="#efebff" style="background:#efebff;line-height:0;font-size:0;padding:0"><img src="${esc(b.art)}" width="600" height="260" alt="${esc(b.artAlt || b.title)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;background:#efebff;color:${EM.brand};font-family:${EM.font};font-size:16px;font-weight:700;line-height:1.4;text-align:center"></td></tr>` : '';
  const html = `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(b.subject)}</title>
<style>@media only screen and (max-width:520px){.jcard{padding:28px 20px 24px!important}.jhead{padding:20px!important}.jk,.jv{display:block!important;width:auto!important;text-align:left!important}.jk{padding-bottom:0!important}.jv{border-top:0!important;padding-top:2px!important}.jst{display:block!important;width:auto!important;padding:0 0 8px!important}h1{font-size:23px!important}}</style></head>
<body style="margin:0;padding:0;background:${EM.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all">${esc(b.preheader || '')}${'&nbsp;&zwnj;'.repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${EM.bg}" style="background:${EM.bg}"><tr><td align="center" style="padding:28px 12px 36px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
<tr><td class="jhead" bgcolor="${EM.brand}" style="background:${EM.brand};background-image:linear-gradient(135deg,#7356ff 0%,${EM.brand} 55%,${EM.brandDark} 100%);border-radius:24px 24px 0 0;padding:24px 32px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="34" height="34" align="center" valign="middle" bgcolor="#ffffff" style="width:34px;height:34px;border-radius:10px;background:#ffffff;font-family:${EM.font};font-size:0;line-height:0"><span style="display:inline-block;width:11px;height:11px;border:2.5px solid ${EM.brand};border-radius:50%"></span><span style="display:inline-block;width:11px;height:11px;border:2.5px solid #a998ff;border-radius:50%;margin-left:-5px"></span></td>
<td style="padding-left:11px;font-family:${EM.font};font-size:22px;font-weight:800;letter-spacing:-0.8px;color:#ffffff">Joinvoo</td></tr></table></td></tr>
${art}<tr><td class="jcard" bgcolor="#ffffff" style="background:#ffffff;padding:36px 32px 30px;border-radius:0 0 24px 24px">${inner}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px"><tr><td style="border-top:1px solid ${EM.line};padding-top:18px;font-family:${EM.font};font-size:13.5px;line-height:1.6;color:${EM.muted}">
${questions}${b.ps ? '<br>' + b.ps : ''}</td></tr></table></td></tr>
<tr><td align="center" style="padding:22px 20px 0;font-family:${EM.font};font-size:12.5px;line-height:1.7;color:${EM.muted}">
<b style="color:${EM.body}">Joinvoo</b> &middot; ${esc(T('mail.by_company', { company }))}<br>
<a href="${BASE_URL}/app" style="color:${EM.muted};text-decoration:underline">${esc(T('mail.dashboard'))}</a> &nbsp;&middot;&nbsp; <a href="${BASE_URL}/guide" style="color:${EM.muted};text-decoration:underline">${esc(T('mail.guide'))}</a> &nbsp;&middot;&nbsp; <a href="${esc(helpUrl)}" style="color:${EM.muted};text-decoration:underline">${esc(T('mail.support'))}</a><br>
<span style="color:#a19db8">${esc(T('mail.why'))}</span></td></tr>
</table></td></tr></table></body></html>`;
  const text = [b.title, '', b.lead ? strip(b.lead) : '', ...(b.paras || []).map(strip), b.quote ? `${(b.quote.agent || {}).name || T('mail.support')}:\n${b.quote.body}` : '',
    b.stats ? b.stats.map(([v, l]) => `${l}: ${v}`).join('\n') : '', b.progress ? b.progress.label : '', (b.rows || []).map(([k, v]) => `${k}: ${strip(v)}`).join('\n'),
    b.callout ? strip(b.callout.html) : '', b.cta ? `${b.cta.text}: ${b.cta.url}` : '', ...(b.after || []).map(strip), '—',
    T('mail.q_text', { contact: se || helpUrl }), `Joinvoo · ${T('mail.by_company', { company })}`].filter((x) => x !== '').join('\n\n').replace(/\n{3,}/g, '\n\n');
  return { subject: b.subject, html, text };
}
const methodName = (m) => (m === 'btc' ? 'Bitcoin (BTC)' : 'USDT (TRC20)');
const mono = (s, small) => `<span style="font-family:monospace${small ? ';font-size:12.5px' : ''}">${esc(s)}</span>`;
const brandLink = (href, text) => `<a href="${esc(href)}" style="color:${EM.brand};font-weight:600">${text}</a>`;
const mailDate = (ts, lang) => { try { return new Date(ts).toLocaleDateString(lang === 'en' ? 'en-GB' : lang, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); } catch { return new Date(ts).toISOString().slice(0, 10); } };
/** Every email Joinvoo sends. build(d, t, lang) gets the data and a translator; `sample` is used for the admin preview and "Send test". */
const EMAILS = {
  welcome: { title: 'Welcome + confirm email', when: 'Right after sign-up (and when they ask for the link again)',
    sample: () => ({ name: 'Alex', url: BASE_URL + '/verify?t=sample', free: C.FREE_JOINS }),
    build: (d, t) => ({ subject: d.resend ? t('welcome.subject_resend') : t('welcome.subject'), preheader: t('welcome.preheader'),
      icon: '👋', title: d.name ? t('welcome.title_named', { name: d.name }) : t('welcome.title'),
      lead: d.free > 0 ? t('welcome.lead_free', { n: $num(d.free) }) : t('welcome.lead'),
      cta: { text: t('welcome.cta'), url: d.url }, link: true,
      rows: [[t('welcome.step1'), t('welcome.step1_v')], [t('welcome.step2'), t('welcome.step2_v')], [t('welcome.step3'), t('welcome.step3_v')], [t('welcome.step4'), t('welcome.step4_v')]].map(([a, b]) => [a, esc(b)]),
      after: [t('welcome.after', { guide: brandLink(BASE_URL + '/guide', esc(t('welcome.guide_link'))) })] }) },
  password_reset: { title: 'Password reset', when: 'When someone taps “Forgot your password?”',
    sample: () => ({ url: BASE_URL + '/app?reset=sample-token' }),
    build: (d, t) => ({ subject: t('reset.subject'), preheader: t('reset.preheader'), icon: '🔐', title: t('reset.title'),
      lead: t('reset.lead'), cta: { text: t('reset.cta'), url: d.url }, link: true,
      callout: { tone: 'amber', html: t('reset.callout') } }) },
  staff_invite: { title: 'Staff invite', when: 'When an owner or admin adds someone to the team (Admin → Team & roles)',
    sample: () => ({ role: 'Support', by: 'Noah', url: BASE_URL + '/app?reset=sample-token', existing: false }),
    build: (d, t) => ({ subject: t('staff.subject', { role: d.role }), preheader: t('staff.preheader'), icon: '🛡️', title: t('staff.title', { role: esc(d.role) }),
      lead: t('staff.lead', { by: esc(d.by || ''), role: esc(d.role) }), cta: { text: d.existing ? t('staff.cta_existing') : t('staff.cta'), url: d.url }, link: true,
      paras: [t(d.existing ? 'staff.p_existing' : 'staff.p_new', { admin: brandLink(BASE_URL + '/admin', BASE_URL.replace(/^https?:\/\//, '') + '/admin') })],
      callout: { tone: 'amber', html: t('staff.callout') } }) },
  password_changed: { title: 'Password changed', when: 'After a password change or reset',
    sample: () => ({ when: Date.now() }),
    build: (d, t) => ({ subject: t('pwchanged.subject'), preheader: t('pwchanged.preheader'), icon: '🛡️', tone: 'mint', title: t('pwchanged.title'),
      lead: t('pwchanged.lead', { when: esc(new Date(d.when || Date.now()).toUTCString().replace(' GMT', ' UTC')) }),
      paras: [t('pwchanged.p1')],
      callout: { tone: 'coral', html: t('pwchanged.callout') }, cta: { text: t('pwchanged.cta'), url: BASE_URL + '/login?forgot=1' } }) },
  payment_received: { title: 'Payment received (receipt)', when: 'When a top-up is paid or approved',
    sample: () => ({ amount_cents: 50000, bonus_cents: 5000, label: 'Paystack', reference: 'pz_8KfW2aLq', balance_cents: 61240, at: Date.now() }),
    build: (d, t) => ({ subject: t('payment.subject', { credits: $num(d.amount_cents + (d.bonus_cents || 0)) }), preheader: t('payment.preheader', { balance: $num(d.balance_cents) }), icon: '🧾', tone: 'mint',
      title: t('payment.title'), lead: d.bonus_cents ? t('payment.lead_bonus', { amount: $num(d.amount_cents), usd: $usd(d.amount_cents), bonus: $num(d.bonus_cents) }) : t('payment.lead', { amount: $num(d.amount_cents), usd: $usd(d.amount_cents) }),
      rows: [[t('payment.paid'), $usd(d.amount_cents)], [t('payment.bought'), $num(d.amount_cents)], ...(d.bonus_cents ? [[t('payment.bonus'), '+' + $num(d.bonus_cents)]] : []), [t('payment.with'), esc(d.label)],
        [t('mail.reference'), mono(d.reference)], [t('mail.date'), esc(new Date(d.at || Date.now()).toUTCString().slice(5, 16))], [t('mail.new_balance'), esc(t('mail.n_credits', { n: $num(d.balance_cents) }))]],
      after: [t('payment.after')],
      cta: { text: t('mail.cta_wallet'), url: BASE_URL + '/app#billing' } }) },
  topup_review: { title: 'Top-up under review', when: 'When a customer submits a crypto or bank transfer',
    sample: () => ({ pay_amount: '50.37', currency: 'USDT', label: 'USDT (TRC20)', tx: 'b7e1c09a4f2d8e6a1c3b5d7f9e0a2c4b6d8f0e1a3c5b7d9f1e3a5c7b9d1f3e5a' }),
    build: (d, t) => ({ subject: t('review.subject'), preheader: t('review.preheader'), icon: '⏳', tone: 'amber', title: t('review.title'),
      lead: t('review.lead'),
      rows: [[t('mail.amount'), `${esc(d.pay_amount)} ${esc(d.currency || '')}`], [t('mail.method'), esc(d.label)], [t('mail.reference'), mono(String(d.tx).length > 24 ? d.tx.slice(0, 12) + '…' + d.tx.slice(-8) : d.tx)]],
      paras: [t('review.p1')], cta: { text: t('review.cta'), url: BASE_URL + '/app#billing' } }) },
  topup_rejected: { title: 'Top-up rejected', when: 'When an admin rejects a manual top-up',
    sample: () => ({ amount_cents: 5037, label: 'USDT (TRC20)', reason: 'We couldn’t find this transaction on the TRC20 network.' }),
    build: (d, t) => ({ subject: t('rejected.subject'), preheader: t('rejected.preheader'), icon: '⚠️', tone: 'coral', title: t('rejected.title'),
      lead: t('rejected.lead', { label: esc(d.label), amount: $usd(d.amount_cents) }),
      callout: d.reason ? { tone: 'coral', html: t('mail.reason', { reason: esc(d.reason) }) } : null,
      paras: [t('rejected.p1')], cta: { text: t('mail.cta_wallet'), url: BASE_URL + '/app#billing' } }) },
  low_balance: { title: 'Low balance', when: 'Balance drops under $5 while the plan is active (max once every 3 days)',
    sample: () => ({ balance_cents: 340 }),
    build: (d, t) => ({ subject: t('low.subject', { n: $num(d.balance_cents) }), preheader: t('low.preheader'), icon: '🔋', tone: 'amber', title: t('low.title'),
      lead: t('low.lead', { n: $num(d.balance_cents), usd: $usd(d.balance_cents), per: C.PRICE_PER_CENTS }),
      paras: [t('low.p1')],
      cta: { text: t('low.cta'), url: BASE_URL + '/app#billing' } }) },
  tracking_paused: { title: 'Tracking paused', when: 'An ad click arrives but the wallet can’t cover it (max once a day)',
    sample: () => ({ reason: 'empty' }),
    build: (d, t) => ({ subject: t('paused.subject'), preheader: t('paused.preheader'), icon: '⏸️', tone: 'coral', title: t('paused.title'),
      lead: d.reason === 'need_plan' ? t('paused.lead_plan', { usd: $usd(C.PRICE_BASE_CENTS) }) : t('paused.lead_empty'),
      callout: { tone: 'mint', html: t('paused.callout') },
      paras: [t('paused.p1')], cta: { text: t('paused.cta'), url: BASE_URL + '/app#billing' } }) },
  free_joins_80: { title: 'Free joins 80% used', when: 'When 80% of the welcome free joins are used',
    sample: () => ({ gift: 500, left: 100 }),
    build: (d, t) => ({ subject: t('free80.subject', { used: $num(d.gift - d.left), gift: $num(d.gift) }), preheader: t('free80.preheader', { left: $num(d.left) }), icon: '📈', title: t('free80.title'),
      lead: t('free80.lead', { used: $num(d.gift - d.left) }), progress: { pct: (d.gift - d.left) / d.gift * 100, label: t('free80.progress', { used: $num(d.gift - d.left), gift: $num(d.gift), left: $num(d.left) }) },
      paras: [t('free80.p1', { base: $usd(C.PRICE_BASE_CENTS), included: $num(C.PRICE_INCLUDED), per: C.PRICE_PER_CENTS })],
      cta: { text: t('mail.cta_topup'), url: BASE_URL + '/app#billing' } }) },
  free_joins_used: { title: 'Free joins used up', when: 'When the last welcome free join is used',
    sample: () => ({ gift: 500 }),
    build: (d, t) => ({ subject: t('freedone.subject'), preheader: t('freedone.preheader'), icon: '🎯', title: t('freedone.title', { gift: $num(d.gift) }),
      lead: t('freedone.lead'),
      rows: [[t('freedone.plan'), `${$usd(C.PRICE_BASE_CENTS)}`], [t('freedone.included'), $num(C.PRICE_INCLUDED)], [t('freedone.extra'), `${C.PRICE_PER_CENTS}¢`], [t('freedone.organic'), esc(t('freedone.free'))]],
      paras: [t('freedone.p1')], cta: { text: t('mail.cta_topup'), url: BASE_URL + '/app#billing' } }) },
  payout_requested: { title: 'Payout requested', when: 'When a referrer asks to withdraw',
    sample: () => ({ amount_cents: 33150, method: 'usdt', details: 'TQ8yW2kVnS4rG7hJ1mB3cX5zA9dF6pL2eN' }),
    build: (d, t) => ({ subject: t('payreq.subject', { amount: $usd(d.amount_cents) }), preheader: t('payreq.preheader'), icon: '💸', title: t('payreq.title'),
      lead: t('payreq.lead'),
      rows: [[t('mail.amount'), $usd(d.amount_cents)], [t('payreq.paid_in'), methodName(d.method)], [t('payreq.to'), mono(d.details, true)]],
      paras: [t('payreq.p1')], cta: { text: t('mail.cta_earnings'), url: BASE_URL + '/app#invite' } }) },
  payout_sent: { title: 'Payout sent', when: 'When an admin marks a withdrawal as sent',
    sample: () => ({ amount_cents: 33150, method: 'usdt', details: 'TQ8yW2kVnS4rG7hJ1mB3cX5zA9dF6pL2eN', tx: '9f3c2b1a0e8d7c6b5a49382716f5e4d3c2b1a0f9e8d7c6b5a4938271605f4e3d' }),
    build: (d, t) => ({ subject: t('paysent.subject', { amount: $usd(d.amount_cents) }), preheader: t('paysent.preheader'), icon: '🎉', tone: 'mint', title: t('paysent.title'),
      lead: t('paysent.lead', { amount: $usd(d.amount_cents), method: methodName(d.method) }),
      rows: [[t('mail.amount'), $usd(d.amount_cents)], [t('paysent.to'), mono(d.details, true)], [t('paysent.tx'), mono(d.tx, true)]],
      cta: { text: t('mail.cta_dashboard'), url: BASE_URL + '/app#invite' } }) },
  payout_rejected: { title: 'Payout rejected', when: 'When an admin rejects a withdrawal',
    sample: () => ({ amount_cents: 33150, reason: 'The address isn’t a valid TRC20 address.' }),
    build: (d, t) => ({ subject: t('payrej.subject'), preheader: t('payrej.preheader'), icon: '↩️', tone: 'amber', title: t('payrej.title'),
      lead: t('payrej.lead', { amount: $usd(d.amount_cents) }),
      callout: d.reason ? { tone: 'amber', html: t('mail.reason', { reason: esc(d.reason) }) } : null,
      paras: [t('payrej.p1')], cta: { text: t('mail.cta_earnings'), url: BASE_URL + '/app#invite' } }) },
  support_reply: { title: 'Support reply', when: 'When the team replies and the customer isn’t online',
    sample: () => ({ body: 'Hi! Yes, Binom postbacks work. Copy your postback URL from Conversions and paste it in Binom as the S2S postback. Want me to check it after?', agent: (setting('support.team')[0]) || { name: 'Support team', role: 'Customer success' }, user: true }),
    build: (d, t) => ({ subject: t('reply.subject', { agent: (d.agent && d.agent.name) || t('reply.default_agent') }), preheader: String(d.body).slice(0, 120), icon: '💬', title: t('reply.title'),
      quote: { agent: d.agent, body: d.body }, cta: { text: t('reply.cta'), url: d.user ? BASE_URL + '/app#support' : BASE_URL + '/#support' } }) },
  weekly_summary: { title: 'Weekly summary (optional)', when: 'Mondays, to accounts with clicks last week. Off by default.', optional: true,
    sample: () => ({ clicks: 4120, joins: 1312, ftd: 87, revenue_cents: 1243000, balance_cents: 8460, from: Date.now() - 7 * 864e5, to: Date.now() }),
    build: (d, t) => ({ subject: t('weekly.subject', { joins: $num(d.joins) }), preheader: t('weekly.preheader', { clicks: $num(d.clicks), joins: $num(d.joins), ftd: $num(d.ftd) }), icon: '📊', title: t('weekly.title'),
      lead: t('weekly.lead', { from: new Date(d.from).toUTCString().slice(5, 11), to: new Date(d.to).toUTCString().slice(5, 11) }),
      stats: [[$num(d.clicks), t('weekly.clicks')], [$num(d.joins), t('weekly.joins')], [d.clicks ? Math.round(d.joins / d.clicks * 100) + '%' : '0%', t('weekly.rate')], [$num(d.ftd), t('weekly.ftd')]],
      rows: d.revenue_cents ? [[t('weekly.revenue'), $usd(d.revenue_cents)], [t('weekly.balance'), $usd(d.balance_cents)]] : [[t('weekly.balance'), $usd(d.balance_cents)]],
      cta: { text: t('mail.cta_dashboard'), url: BASE_URL + '/app' } }) },
  // ----- round 6 -----
  trial_started: { title: 'Pro trial started', when: 'At the first tracked deposit (or at sign-up, if the trial starts then)',
    sample: () => ({ days: setting('trial.days'), limit: setting('trial.ftd_limit'), ends_at: Date.now() + setting('trial.days') * 864e5 }),
    build: (d, t, L) => ({ subject: t('trial_started.subject'), preheader: t('trial_started.preheader', { days: d.days, limit: d.limit }), icon: '✨', title: t('trial_started.title'),
      lead: t(d.signup ? 'trial_started.lead_signup' : 'trial_started.lead', { days: d.days, limit: d.limit }),
      rows: [[t('trial.ends'), esc(t('trial.ends_v', { date: mailDate(d.ends_at, L), limit: d.limit }))]],
      paras: [t('trial_started.p1')], cta: { text: t('trial_started.cta'), url: BASE_URL + '/app#conversions' } }) },
  trial_ending: { title: 'Pro trial ending soon', when: 'On the last day of the trial, or at 18 of 20 deposits',
    sample: () => ({ used: 18, limit: setting('trial.ftd_limit'), ends_at: Date.now() + 864e5 }),
    build: (d, t, L) => ({ subject: t('trial_ending.subject'), preheader: t('trial_ending.preheader', { used: d.used, limit: d.limit }), icon: '⏳', tone: 'amber', title: t('trial_ending.title'),
      lead: t('trial_ending.lead', { used: d.used, limit: d.limit, date: esc(mailDate(d.ends_at, L)) }),
      progress: { pct: d.used / d.limit * 100, label: t('trial_ending.progress', { used: d.used, limit: d.limit }) },
      paras: [t('trial_ending.p1')], cta: { text: t('trial_ending.cta'), url: BASE_URL + '/app#billing' } }) },
  trial_ended: { title: 'Pro trial ended', when: 'When the trial’s days or deposits run out',
    sample: () => ({ used: 20, limit: setting('trial.ftd_limit') }),
    build: (d, t) => ({ subject: t('trial_ended.subject'), preheader: t('trial_ended.preheader'), icon: '🔒', title: t('trial_ended.title'),
      lead: t('trial_ended.lead', { used: $num(d.used) }),
      callout: { tone: 'mint', html: t('trial_ended.callout') },
      paras: [t('trial_ended.p1')], cta: { text: t('trial_ended.cta'), url: BASE_URL + '/app#billing' } }) },
  pro_welcome: { title: 'Welcome to Pro', when: 'Right after upgrading to Pro',
    sample: () => ({ plan: 'Pro', base_cents: plansDef().pro.base_cents, included: plansDef().pro.included, charged_cents: 4620 }),
    build: (d, t) => ({ subject: t('pro_welcome.subject', { plan: d.plan || 'Pro' }), preheader: t('pro_welcome.preheader'), icon: '🚀', tone: 'violet', title: t('pro_welcome.title', { plan: d.plan || 'Pro' }),
      lead: t('pro_welcome.lead'),
      rows: [[t('pro_welcome.each_month'), esc(t('mail.n_credits', { n: $num(d.base_cents) }))], [t('pro_welcome.included'), $num(d.included)], ...(d.charged_cents ? [[t('pro_welcome.today'), esc(t('mail.n_credits', { n: $num(d.charged_cents) }))]] : [])],
      cta: { text: t('pro_welcome.cta'), url: BASE_URL + '/app#campaigns' } }) },
  plan_changed: { title: 'Plan changed', when: 'When a switch to Basic is booked, and when it happens',
    sample: () => ({ to: 'Basic', from: 'Pro', date: nextMonthStart(), applied: false }),
    build: (d, t) => ({ subject: d.applied ? t('plan_changed.subject_applied') : t('plan_changed.subject'), preheader: t('plan_changed.preheader'), icon: '🔁', title: t('plan_changed.title'),
      lead: d.applied ? t('plan_changed.lead_applied', { to: esc(d.to) }) : t('plan_changed.lead', { to: esc(d.to), from: esc(d.from), date: esc(d.date || '') }),
      paras: [t('plan_changed.p1')], cta: { text: t('plan_changed.cta'), url: BASE_URL + '/app#billing' } }) },
  meet_joe: { title: 'Meet Joe', when: 'About an hour after sign-up (or at the first login when email is off)',
    sample: () => ({ name: 'Alex' }),
    build: (d, t) => ({ subject: t('meet_joe.subject'), preheader: t('meet_joe.preheader'), icon: '🤖', title: t('meet_joe.title'),
      lead: t('meet_joe.lead'),
      rows: [[t('meet_joe.ask'), esc(t('meet_joe.ask_v'))], [t('meet_joe.spots'), esc(t('meet_joe.spots_v'))], [t('meet_joe.never'), esc(t('meet_joe.never_v'))]],
      cta: { text: t('meet_joe.cta'), url: BASE_URL + '/app#joe' } }) },
  rank_up: { title: 'Rank up (loyalty)', when: 'When lifetime top-ups move a customer to a new rank',
    sample: () => ({ rank: 'Gold', discount: 5, perks: ['5% off every tracked join', 'Priority replies in chat'] }),
    build: (d, t) => ({ subject: t('rank_up.subject', { rank: d.rank }), preheader: t('rank_up.preheader'), icon: '🏆', tone: 'amber', title: t('rank_up.title', { rank: d.rank }),
      lead: t('rank_up.lead', { rank: esc(d.rank) }),
      rows: [...(d.discount ? [[t('rank_up.discount'), `${esc(d.discount)}%`]] : []), ...(d.perks || []).map((p) => [t('rank_up.perk'), esc(p)])],
      cta: { text: t('rank_up.cta'), url: BASE_URL + '/app#billing' } }) },
  level_up: { title: 'Level up', when: 'When leads in the last 30 days reach a new level (checked every hour)',
    sample: () => ({ level: 'Shark', id: 'shark', leads: 26480, next: { name: 'Whale', from: 100000, need: 73520 } }),
    build: (d, t) => ({ subject: t('level_up.subject', { level: d.level, emoji: LEVEL_EMOJI[d.id] || '🏅' }), preheader: t('level_up.preheader', { leads: $num(d.leads) }), icon: LEVEL_EMOJI[d.id] || '🏅', title: t('level_up.title', { level: d.level, emoji: LEVEL_EMOJI[d.id] || '🏅' }),
      lead: t('level_up.lead', { leads: $num(d.leads), level: esc(d.level) }),
      callout: { tone: 'violet', html: d.next ? t('level_up.next', { next: esc(d.next.name), from: $num(d.next.from), need: $num(d.next.need) }) : t('level_up.top') },
      paras: [t('level_up.p1')], cta: { text: t('level_up.cta'), url: BASE_URL + '/app#levels' } }) },
  credits_added: { title: 'Credits added by the team', when: 'When an admin adds (or removes) credits and ticks “email the user”',
    sample: () => ({ credits: 5000, reason: 'Thanks for helping us test the new reports.', balance_cents: 17480 }),
    build: (d, t) => { const add = d.credits >= 0, n = $num(Math.abs(d.credits));
      return { subject: t(add ? 'credits.subject_add' : 'credits.subject_remove', { n }), preheader: t('credits.preheader', { balance: $num(d.balance_cents) }), icon: add ? '🎁' : '🧾', tone: add ? 'mint' : 'amber',
        title: t(add ? 'credits.title_add' : 'credits.title_remove'), lead: t(add ? 'credits.lead_add' : 'credits.lead_remove', { n, usd: $usd(Math.abs(d.credits)) }),
        callout: d.reason ? { tone: 'violet', html: t('credits.reason', { reason: esc(d.reason) }) } : null,
        rows: [[t('mail.new_balance'), esc(t('mail.n_credits', { n: $num(d.balance_cents) }))]],
        after: add ? [t('credits.after')] : [], cta: { text: t('mail.cta_wallet'), url: BASE_URL + '/app#billing' } }; } },
};
EMAILS.broadcast = { title: 'Broadcast', when: 'When an admin sends a broadcast with “also email” on (customers who turned off update emails are skipped)',
  sample: () => ({ title: 'Snapchat reports are here', body: 'You can now see **cost per FTD** for Snapchat campaigns. [Read how it works](https://joinvoo.com/guide).', cta_label: 'Open campaigns', cta_url: '#tab:campaigns', image: '' }),
  build: (d, t) => ({ subject: d.title, preheader: String(d.body || '').replace(/\*\*|\[|\]\([^)]*\)/g, '').slice(0, 120), icon: '📣', title: d.title,
    paras: String(d.body || '').split(/\n{2,}/).map(mdHtml).filter(Boolean),
    cta: d.cta_label && d.cta_url ? { text: d.cta_label, url: absUrl(d.cta_url) } : { text: t('broadcast.cta'), url: BASE_URL + '/app' } }) };
/** **bold**, [text](https://…) links and line breaks → email HTML (everything else escaped). */
function mdHtml(s) {
  return esc(String(s || '').trim()).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]{1,120})\]\((https:\/\/[^\s)]{1,500}|\/[^\s)]{0,300})\)/g, (m, txt, u) => `<a href="${u.startsWith('/') ? BASE_URL + u : u}" style="color:${EM.brand};font-weight:600">${txt}</a>`).replace(/\n/g, '<br>');
}
/** '#tab:wallet' and '/path' → full URLs for emails. */
const absUrl = (u) => (/^#tab:/.test(u) ? `${BASE_URL}/app#${u.slice(5)}` : u.startsWith('/') ? BASE_URL + u : u);
function templateBlocks(name, data, L) {
  const b = EMAILS[name].build(data, (k, v) => tr(L, k, v), L);
  for (const k of Object.keys(b)) if (b[k] == null) delete b[k];
  const art = name === 'broadcast' ? (data.image ? absUrl(data.image) : '') : emailArt(name); if (art) { b.art = art; b.artAlt = b.title; }
  return b;
}
function renderTemplate(name, data, lang = 'en') { const L = normLang(lang); return renderMail(templateBlocks(name, data, L), L); }
// ---------- in-app inbox: every user-facing event also lands here, in the user's language ----------
/** Which inbox tab each email belongs to. Security emails (welcome, password) never go to the inbox and always go out by email. */
const EMAIL_KIND = { payment_received: 'account', topup_review: 'account', topup_rejected: 'account', credits_added: 'account', free_joins_80: 'account', free_joins_used: 'account',
  trial_started: 'account', trial_ending: 'account', trial_ended: 'account', pro_welcome: 'account', plan_changed: 'account', rank_up: 'account', level_up: 'account',
  payout_requested: 'account', payout_sent: 'account', payout_rejected: 'account', support_reply: 'account', low_balance: 'alert', tracking_paused: 'alert', meet_joe: 'joe', weekly_summary: 'update', broadcast: 'update' };
const SECURITY_EMAILS = new Set(['welcome', 'password_reset', 'password_changed', 'staff_invite']);
const INBOX_KINDS = ['update', 'account', 'alert', 'joe'];
const DEFAULT_PREFS = { update: { email: true }, account: { email: true }, alert: { email: true }, joe: { email: true } };
function notifyPrefs(uid) {
  let p = {}; try { p = JSON.parse((Q(`SELECT notify_prefs FROM users WHERE id=?`).get(uid) || {}).notify_prefs || '{}') || {}; } catch { p = {}; }
  return Object.fromEntries(INBOX_KINDS.map((k) => [k, { email: p[k] && p[k].email === false ? false : true }]));
}
/** Dashboard links: email URLs like /app#billing become in-app '#tab:wallet'. */
function tabUrl(u) {
  if (!u) return null;
  const m = /\/app(?:#([\w-]+))?$/.exec(String(u).replace(/\?.*$/, ''));
  if (!m) return u;
  return '#tab:' + ({ billing: 'wallet', invite: 'earn', support: 'help' }[m[1]] || m[1] || 'overview');
}
const htmlToMd = (h) => strip(String(h || '').replace(/<b>(.*?)<\/b>/g, '**$1**').replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g, '[$2]($1)'));
/** Add one inbox row. tag (optional) makes it once-only: a row with the same tag for this user is not added again. */
function inboxAdd(uid, { kind = 'account', title, body = '', image = null, cta_label = null, cta_url = null, important = 0, broadcast_id = null, tag = null }) {
  try {
    if (!uid || !title) return null;
    if (tag && Q(`SELECT 1 FROM inbox WHERE user_id=? AND tag=? LIMIT 1`).get(uid, tag)) return null;
    const r = Q(`INSERT INTO inbox(user_id,kind,title,body,image,cta_label,cta_url,important,created_at,broadcast_id,tag) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run(uid, INBOX_KINDS.includes(kind) ? kind : 'account', String(title).slice(0, 200), String(body || '').slice(0, 4000), image || null, cta_label ? String(cta_label).slice(0, 40) : null, cta_url || null, important ? 1 : 0, now(), broadcast_id, tag);
    return Number(r.lastInsertRowid);
  } catch (e) { log('inbox failed', e.message); return null; }
}
/** The inbox copy of an email: same title, the lead (+ the reason box), the same button, the header art as thumbnail. */
function inboxFromMail(uid, name, kind, b) {
  const body = [b.lead ? htmlToMd(b.lead) : '', b.callout ? htmlToMd(b.callout.html) : ''].filter(Boolean).join('\n\n');
  const art = b.art ? b.art.replace(BASE_URL, '').replace(/\.gif$/, (x) => (fs.existsSync(path.join(__dirname, 'public', b.art.replace(BASE_URL, '').replace(/\.gif$/, '.png'))) ? '.png' : x)) : null;
  return inboxAdd(uid, { kind, title: b.title, body, image: art, cta_label: b.cta ? b.cta.text : null, cta_url: b.cta ? tabUrl(b.cta.url) : null, important: name === 'trial_ended' ? 1 : 0 });
}
/** Render + send one template in the user's language, write it to email_log, and put a copy in the user's inbox.
 *  The email copy follows the user's notify_prefs (security emails always go out); the inbox always gets it. */
function sendTemplate(to, name, data, { userId = null, ref = null, lang = null, noInbox = false } = {}) {
  if (!to) return false;
  const L = normLang(lang || userLang(userId)), b = templateBlocks(name, data, L), m = renderMail(b, L), kind = EMAIL_KIND[name];
  const real = userId && kind && ref !== 'test';
  if (real && !noInbox) inboxFromMail(userId, name, kind, b);
  const off = real && !SECURITY_EMAILS.has(name) && notifyPrefs(userId)[kind].email === false;
  // Throttles (once / every N hours) read email_log, so an inbox-only notice is logged too, with ok=2.
  const id = Number(Q(`INSERT INTO email_log(user_id,kind,ref,to_addr,subject,ok,sent_at) VALUES(?,?,?,?,?,?,?)`).run(userId, name, ref, to, m.subject, off ? 2 : null, Date.now()).lastInsertRowid);
  if (!off) sendMail(to, m.subject, m.html, m.text).then((ok) => Q(`UPDATE email_log SET ok=? WHERE id=?`).run(ok ? 1 : 0, id)).catch(() => {});
  return true;
}
/** Email a user once (once:true), or at most once per `every` ms for this kind. Returns true if sent. */
function notifyUser(userId, name, data = {}, { once = false, every = 0, ref = null } = {}) {
  try {
    const u = Q(`SELECT id, email, name, status, lang FROM users WHERE id=?`).get(userId);
    if (!u || u.status === 'suspended') return false;
    if (once && Q(`SELECT 1 FROM email_log WHERE user_id=? AND kind=? LIMIT 1`).get(userId, name)) return false;
    if (every && Q(`SELECT 1 FROM email_log WHERE user_id=? AND kind=? AND sent_at>? LIMIT 1`).get(userId, name, Date.now() - every)) return false;
    return sendTemplate(u.email, name, { name: u.name || '', ...data }, { userId, ref, lang: normLang(u.lang) });
  } catch (e) { log('notify failed', name, e.message); return false; }
}
/** Balance under $5 while the plan is active → one heads-up every 3 days at most. */
function checkLowBalance(userId) {
  if (!BILLING) return;
  const u = Q(`SELECT id, email, verified_at, balance_cents, free_joins FROM users WHERE id=?`).get(userId);
  if (!u || isAdmin(u) || u.free_joins > 0 || u.balance_cents >= 500) return;
  if (!Q(`SELECT 1 FROM ledger WHERE ref=?`).get(`plan:${userId}:${monthKey()}`)) return;
  notifyUser(userId, 'low_balance', { balance_cents: Math.max(0, u.balance_cents) }, { every: 3 * 864e5 });
}
const welcomeData = (name, uid, resend) => ({ name, url: `${BASE_URL}/verify?t=${verifyToken(uid)}`, free: resendKey() ? C.FREE_JOINS : 0, resend });

// Pages are written as fragments; the server wraps them in a document.
const PUBLIC = path.join(__dirname, 'public');
function page(file, extraHead = '') {
  if (file !== 'app.html' && file !== 'admin.html') extraHead += vooHead();
  const key = file + extraHead;
  if (pageCache.has(key) && env.NODE_ENV === 'production') return pageCache.get(key);
  let html = fs.readFileSync(path.join(PUBLIC, file), 'utf8')
    .replaceAll('{{APP_URL}}', '/app').replaceAll('{{DEMO_URL}}', '/demo').replaceAll('{{HOME_URL}}', '/').replaceAll('{{SIGNUP_URL}}', '/signup')
    .replaceAll('{{GUIDE_URL}}', '/guide').replaceAll('{{CONTACT}}', esc(C.SUPPORT_CONTACT || BASE_URL));
  html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${extraHead}</head><body>${html}</body></html>`;
  pageCache.set(key, html);
  return html;
}

// ---------- channel / bot wiring ----------
function recomputeChannel(chId) {
  const bt = Q(`SELECT c.type, c.ext, b.status FROM channels c LEFT JOIN bots b ON b.id=c.bot_id WHERE c.id=?`).get(chId);
  if (bt && bt.type === 'bot' && bt.ext) return; // tracked through the customer's own bot; no token here
  if (bt && bt.type === 'bot') { Q(`UPDATE channels SET status=? WHERE id=?`).run(bt.status === 'active' ? 'active' : 'removed', chId); return; }
  const rows = Q(`SELECT cb.bot_id, cb.can_invite FROM channel_bots cb JOIN bots b ON b.id=cb.bot_id WHERE cb.channel_id=? AND b.status='active'`).all(chId);
  const ch = Q(`SELECT * FROM channels WHERE id=?`).get(chId);
  if (!ch) return;
  let status = 'removed', primary = ch.bot_id;
  if (rows.length) {
    status = rows.some((r) => r.can_invite) ? 'active' : 'no_rights';
    const good = rows.find((r) => r.can_invite) || rows[0];
    if (!rows.find((r) => r.bot_id === ch.bot_id && (r.can_invite || !rows.some((x) => x.can_invite)))) primary = good.bot_id;
  }
  Q(`UPDATE channels SET status=?, bot_id=? WHERE id=?`).run(status, primary, chId);
}

// Called when we learn a bot's membership in a chat (my_chat_member update or manual add).
function attachBot(bot, chat, member) {
  if (!['channel', 'supergroup', 'group'].includes(chat.type)) return null;
  let ch = Q(`SELECT * FROM channels WHERE owner_id=? AND chat_id=?`).get(bot.owner_id, chat.id);
  const isAdmin = member.status === 'administrator' || member.status === 'creator';
  if (isAdmin) {
    const canInvite = member.status === 'creator' || member.can_invite_users !== false ? 1 : 0;
    if (!ch) {
      const over = !!limitHit(bot.owner_id, 'channels');
      Q(`INSERT INTO channels(owner_id,bot_id,chat_id,title,type,username,slug,status,created_at,locked) VALUES(?,?,?,?,?,?,?,?,?,?)`)
        .run(bot.owner_id, bot.id, chat.id, chat.title || '', chat.type, chat.username || null, rid(5), 'active', now(), over ? 1 : 0);
      if (over) { const L = limitsFor(bot.owner_id); inboxAdd(bot.owner_id, { kind: 'account', title: 'Channel added, not tracking yet', body: `“${String(chat.title || 'Your channel').slice(0, 60)}” is over your ${L.plan_name} limit of ${L.channels.max} channels. Upgrade to Pro or remove a channel and it starts tracking by itself.`, tag: 'limit' }); }
      ch = Q(`SELECT * FROM channels WHERE owner_id=? AND chat_id=?`).get(bot.owner_id, chat.id);
      log('channel connected', ch.id, chat.title);
    } else {
      // Only a channel the customer removed themselves counts as "new" again; a bot that left and came back (fixing admin rights) keeps its slot.
      if (ch.status === 'removed' && ch.removed_by_user && !ch.locked && limitHit(bot.owner_id, 'channels')) Q(`UPDATE channels SET locked=1 WHERE id=?`).run(ch.id);
      if (ch.removed_by_user) Q(`UPDATE channels SET removed_by_user=0 WHERE id=?`).run(ch.id);
      Q(`UPDATE channels SET title=?, username=? WHERE id=?`).run(chat.title || ch.title, chat.username || null, ch.id);
    }
    Q(`INSERT INTO channel_bots(channel_id,bot_id,can_invite) VALUES(?,?,?) ON CONFLICT(channel_id,bot_id) DO UPDATE SET can_invite=excluded.can_invite`)
      .run(ch.id, bot.id, canInvite);
  } else if (ch) {
    Q(`DELETE FROM channel_bots WHERE channel_id=? AND bot_id=?`).run(ch.id, bot.id);
    Q(`UPDATE links SET status='dead' WHERE channel_id=? AND bot_id=? AND status IN ('pool','assigned')`).run(ch.id, bot.id);
    log('bot left channel', bot.username, ch.title);
  }
  if (ch) recomputeChannel(ch.id);
  return ch && Q(`SELECT * FROM channels WHERE id=?`).get(ch.id);
}

function handleTgError(botId, channelId, res) {
  const d = String(res.description || '');
  if (res.error_code === 429) {
    const wait = ((res.parameters && res.parameters.retry_after) || 30) * 1000;
    Q(`UPDATE bots SET cooldown_until=? WHERE id=?`).run(now() + wait, botId);
    log('rate limited, bot', botId, 'for', wait / 1000, 's');
  } else if (res.error_code === 401) {
    Q(`UPDATE bots SET status='invalid' WHERE id=?`).run(botId);
    { const b = Q(`SELECT owner_id, username FROM bots WHERE id=?`).get(botId); if (b) alertUser(b.owner_id, 'token_errors', tr(userLang(b.owner_id), 'alert.token_bot', { bot: b.username }), { every: 6 * 3600000 }); }
    for (const r of Q(`SELECT channel_id FROM channel_bots WHERE bot_id=?`).all(botId)) recomputeChannel(r.channel_id);
  } else if (res.error_code === 400 || res.error_code === 403) {
    if (/rights|admin|not found|kicked|not a member|CHAT_ADMIN_REQUIRED/i.test(d) && channelId) {
      Q(`UPDATE channel_bots SET can_invite=0 WHERE channel_id=? AND bot_id=?`).run(channelId, botId);
      recomputeChannel(channelId);
    }
  }
  log('telegram error', botId, res.error_code, d);
}

// ---------- link pool ----------
const lastCreate = new Map();
let poolBusy = false;
// Join-request mode: each link asks to join (creates_join_request) instead of being single-use (member_limit 1) — Telegram
// doesn't allow both. Our bot approves the request at once, which tells us exactly who it was and lets us DM them within 5 minutes.
const isReq = (row) => row.join_mode === 'request' && feature('join_requests');
async function createLink(row, fallback) {
  const req = isReq(row);
  const res = await tg(row.token, 'createChatInviteLink', fallback
    ? { chat_id: row.chat_id, name: 'Joinvoo backup link' }
    : req ? { chat_id: row.chat_id, creates_join_request: true, name: 'jv-' + rid(6) } : { chat_id: row.chat_id, member_limit: 1, name: 'joinvoo' });
  if (!res.ok) { handleTgError(row.bot_id, row.channel_id, res); return null; }
  if (fallback) { Q(`UPDATE channels SET fallback_link=? WHERE id=?`).run(res.result.invite_link, row.channel_id); return null; }
  const r = Q(`INSERT INTO links(channel_id,bot_id,url,status,created_at,req) VALUES(?,?,?,'pool',?,?)`).run(row.channel_id, row.bot_id, res.result.invite_link, now(), req ? 1 : 0);
  return { id: Number(r.lastInsertRowid), url: res.result.invite_link };
}
async function fillPools() {
  if (poolBusy) return; poolBusy = true;
  try {
    const reqOn = feature('join_requests') ? 1 : 0;
    const rows = Q(`SELECT cb.channel_id, cb.bot_id, ch.chat_id, ch.fallback_link, ch.join_mode, b.token, b.cooldown_until,
        (SELECT COUNT(*) FROM links l WHERE l.channel_id=ch.id AND l.status='pool' AND l.req=(CASE WHEN ch.join_mode='request' AND ${reqOn} THEN 1 ELSE 0 END)) AS pool
      FROM channel_bots cb JOIN channels ch ON ch.id=cb.channel_id JOIN bots b ON b.id=cb.bot_id
      WHERE ch.status='active' AND COALESCE(ch.locked,0)=0 AND cb.can_invite=1 AND b.status='active'`).all();
    rows.sort((a, b) => a.pool - b.pool);
    const busy = new Set(); const jobs = []; const t = now();
    for (const r of rows) {
      if (busy.has(r.bot_id)) continue;
      const needFallback = !r.fallback_link;
      if (!needFallback && r.pool >= POOL_SIZE) continue;
      if (r.cooldown_until > t || t - (lastCreate.get(r.bot_id) || 0) < LINK_INTERVAL_MS) continue;
      busy.add(r.bot_id); lastCreate.set(r.bot_id, t);
      jobs.push(createLink(r, needFallback));
    }
    await Promise.all(jobs);
  } catch (e) { log('pool error', e.message); } finally { poolBusy = false; }
}

// ---------- ad platform queue (Meta + TikTok) ----------
async function postMeta(c, events) {
  if (!c.pixel_id || !c.capi_token) return { ok: false, err: 'Meta pixel ID or access token missing' };
  const body = { data: events, access_token: c.capi_token };
  if (c.test_code) body.test_event_code = c.test_code;
  const r = await fetch(`${GRAPH_API}/${GRAPH_VERSION}/${c.pixel_id}/events`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && !j.error, err: j.error ? (j.error.error_user_msg || j.error.message) : (r.ok ? '' : 'HTTP ' + r.status) };
}
async function postTikTok(c, events) {
  if (!c.tt_pixel || !c.tt_token) return { ok: false, err: 'TikTok pixel code or access token missing' };
  const body = { event_source: 'web', event_source_id: c.tt_pixel, data: events };
  if (c.tt_test_code) body.test_event_code = c.tt_test_code;
  const r = await fetch(`${TIKTOK_API}/open_api/v1.3/event/track/`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'Access-Token': c.tt_token }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j.code === 0, err: j.code === 0 ? '' : (j.message || 'HTTP ' + r.status) };
}
async function postSnap(c, events) {
  if (!c.sc_pixel || !c.sc_token) return { ok: false, err: 'Snapchat pixel ID or access token missing' };
  const r = await fetch(`${SNAP_API}/v3/${encodeURIComponent(c.sc_pixel)}/events${c.sc_test ? '/validate' : ''}?access_token=${encodeURIComponent(c.sc_token)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: events }), signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  const ok = r.ok && !j.error && (!j.status || j.status === 'VALID' || j.status === 'SUCCESS');
  return { ok, err: ok ? '' : (j.reason || j.message || (j.error && (j.error.message || j.error)) || 'HTTP ' + r.status) };
}
const PLATFORMS = {
  meta: { post: postMeta, has: (c) => c.pixel_id && c.capi_token, col: 'capi_status', ecol: 'capi_error', conv: 'meta_status', ok: 'capi_ok', fail: 'capi_fail', label: 'Meta' },
  tiktok: { post: postTikTok, has: (c) => c.tt_pixel && c.tt_token, col: 'tt_status', ecol: 'tt_error', conv: 'tt_status', ok: 'tt_ok', fail: 'tt_fail', label: 'TikTok' },
  snap: { post: postSnap, has: (c) => c.sc_pixel && c.sc_token, col: 'sc_status', ecol: 'sc_error', conv: 'sc_status', ok: 'sc_ok', fail: 'sc_fail', label: 'Snapchat' },
};
let capiBusy = false;
async function sendCapi() {
  if (capiBusy) return; capiBusy = true;
  try {
    const rows = Q(`SELECT q.*, c.pixel_id, c.capi_token, c.test_code, c.tt_pixel, c.tt_token, c.tt_test_code, c.sc_pixel, c.sc_token, c.sc_test, c.owner_id FROM capi_queue q
      JOIN channels c ON c.id=q.channel_id WHERE q.status='pending' AND q.next_at<=? ORDER BY q.id LIMIT 1000`).all(now());
    const groups = new Map();
    for (const r of rows) { const k = r.channel_id + ':' + (r.platform || 'meta'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    const settle = (P, b, res) => {
      const ts = (JSON.parse(b.payload).event_time || 0) * (b.platform === 'snap' ? 1 : 1000);
      if (res.ok) {
        Q(`UPDATE capi_queue SET status='sent' WHERE id=?`).run(b.id);
        if (b.conv_id) Q(`UPDATE conversions SET ${P.conv}='sent' WHERE id=?`).run(b.conv_id);
        else { Q(`UPDATE joins SET ${P.col}='sent', ${P.ecol}=NULL WHERE id=?`).run(b.join_id); bump(b.channel_id, b.owner_id, ts, P.ok); }
        return;
      }
      const attempts = b.attempts + 1, err = String(res.err).slice(0, 300);
      if (attempts >= 6) {
        Q(`UPDATE capi_queue SET status='failed', attempts=? WHERE id=?`).run(attempts, b.id);
        alertUser(b.owner_id, 'token_errors', tr(userLang(b.owner_id), 'alert.platform_refused', { platform: P.label, err }), { every: 6 * 3600000 });
        if (b.conv_id) Q(`UPDATE conversions SET ${P.conv}='failed', error=? WHERE id=?`).run(P.label + ': ' + err, b.conv_id);
        else { Q(`UPDATE joins SET ${P.col}='failed', ${P.ecol}=? WHERE id=?`).run(err, b.join_id); bump(b.channel_id, b.owner_id, ts, P.fail); }
      } else {
        Q(`UPDATE capi_queue SET attempts=?, next_at=? WHERE id=?`).run(attempts, now() + 15000 * 2 ** attempts, b.id);
        if (b.conv_id) Q(`UPDATE conversions SET error=? WHERE id=?`).run(P.label + ': ' + err, b.conv_id);
        else Q(`UPDATE joins SET ${P.ecol}=? WHERE id=?`).run(err, b.join_id);
      }
    };
    const post = async (P, c, list) => { try { return await P.post(c, list.map((b) => JSON.parse(b.payload))); } catch (e) { return { ok: false, err: 'Network error: ' + e.message, net: true }; } };
    for (const [, list] of groups) {
      const P = PLATFORMS[list[0].platform || 'meta'] || PLATFORMS.meta;
      for (let i = 0; i < list.length; i += 500) {
        const batch = list.slice(i, i + 500);
        const res = await post(P, batch[0], batch);
        if (!res.ok && batch.length > 1 && !res.net && !/HTTP 5\d\d/.test(res.err)) {
          // One bad event can make the platform refuse the whole batch. Send them one by one so the good ones get through.
          for (const b of batch) settle(P, b, await post(P, b, [b]));
        } else for (const b of batch) settle(P, b, res);
        if (!res.ok) log(P.label + ' error', res.err);
      }
    }
  } catch (e) { log('sender error', e.message); } finally { capiBusy = false; }
}

// Build one event for each platform. `o` overrides the event for conversions (FTD, registration…).
function buildTikTokEvent(ch, click, user, ts, o = {}) {
  const u = { external_id: sha256(user.id) };
  if (click.ttclid) u.ttclid = click.ttclid;
  if (click.ttp) u.ttp = click.ttp;
  if (click.ip) u.ip = click.ip;
  if (click.ua) u.user_agent = click.ua;
  const ev = { event: o.tiktok || ch.tt_event || 'Subscribe', event_time: Math.floor(ts / 1000), event_id: o.id || `tgjoin_${ch.chat_id}_${user.id}`,
    user: u, page: { url: click.page_url || `${linkBase()}/c/${ch.slug}` } };
  if (o.value) ev.properties = { value: o.value / 100, currency: o.currency || 'USD' };
  return ev;
}
function buildEvent(ch, click, user, ts, o = {}) {
  const ud = { external_id: [sha256(user.id)] };
  if (click.ip) ud.client_ip_address = click.ip;
  if (click.ua) ud.client_user_agent = click.ua;
  if (click.fbc) ud.fbc = click.fbc;
  if (click.fbp) ud.fbp = click.fbp;
  if (click.country) ud.country = [sha256(click.country)];
  const ev = { event_name: o.meta || ch.event_name || 'Subscribe', event_time: Math.floor(ts / 1000), event_id: o.id || `tgjoin_${ch.chat_id}_${user.id}`,
    action_source: 'website', event_source_url: click.page_url || `${linkBase()}/c/${ch.slug}`, user_data: ud, custom_data: { content_name: ch.title } };
  if (o.value) Object.assign(ev.custom_data, { value: o.value / 100, currency: o.currency || 'USD' });
  return ev;
}
function buildSnapEvent(ch, click, user, ts, o = {}) {
  const ud = { external_id: [sha256(user.id)] };
  if (click.ip) ud.client_ip_address = click.ip;
  if (click.ua) ud.client_user_agent = click.ua;
  if (click.sccid) ud.sc_click_id = click.sccid;
  if (click.scid) ud.sc_cookie1 = click.scid;
  if (click.country) ud.country = [sha256(click.country.toLowerCase())];
  const ev = { event_name: o.snap || ch.sc_event || 'SUBSCRIBE', event_time: ts, event_id: o.id || `tgjoin_${ch.chat_id}_${user.id}`,
    action_source: 'WEB', event_source_url: click.page_url || `${linkBase()}/c/${ch.slug}`, user_data: ud };
  if (o.value) ev.custom_data = { value: o.value / 100, currency: o.currency || 'USD' };
  return ev;
}
const BUILDERS = { meta: buildEvent, tiktok: buildTikTokEvent, snap: buildSnapEvent };
/** Queue the event for every platform this channel is connected to. Returns {meta,tiktok,snap} → 'pending' | 'none' | 'no_pixel'. */
function enqueueEvents(ch, click, user, ts, joinId, convId, o = {}) {
  const st = {};
  const off = { tiktok: !feature('tiktok'), snap: !feature('snapchat') };
  for (const [k, P] of Object.entries(PLATFORMS)) {
    if (!click || off[k]) { st[k] = 'none'; continue; }
    if (!P.has(ch) || (o.skip && o.skip.includes(k))) { st[k] = k === 'meta' && !convId ? 'no_pixel' : 'none'; continue; }
    Q(`INSERT INTO capi_queue(channel_id,join_id,conv_id,payload,next_at,created_at,platform) VALUES(?,?,?,?,?,?,?)`)
      .run(ch.id, joinId, convId || null, JSON.stringify(BUILDERS[k](ch, click, user, ts, o)), now(), now(), k);
    st[k] = 'pending';
  }
  return st;
}

// ---------- telegram webhook ----------
const TG_UPDATES = ['my_chat_member', 'chat_member', 'message', 'chat_join_request'];
const MEMBER = (m) => ['member', 'administrator', 'creator'].includes(m.status) || (m.status === 'restricted' && m.is_member);
const startCode = (clickId) => clickId.toString(36) + '_' + hmac('s' + clickId).slice(0, 6).replace(/[^A-Za-z0-9]/g, 'x');
function parseStart(code) {
  const m = /^([0-9a-z]+)_([A-Za-z0-9]{6})$/.exec(code || ''); if (!m) return null;
  const id = parseInt(m[1], 36); return startCode(id) === code ? id : null;
}
async function onBotUpdate(bot, target, u) {
  // Private-chat events for "bot subscriber" tracking.
  if (u.my_chat_member && u.my_chat_member.chat.type === 'private') {
    const st = u.my_chat_member.new_chat_member.status, uid = u.my_chat_member.from.id;
    if (st === 'kicked') {
      const j = Q(`SELECT id FROM joins WHERE channel_id=? AND tg_user_id=? AND left_at IS NULL ORDER BY id DESC LIMIT 1`).get(target.id, uid);
      if (j) { Q(`UPDATE joins SET left_at=? WHERE id=?`).run(now(), j.id); bump(target.id, target.owner_id, now(), 'leaves'); }
    }
    return true;
  }
  const msg = u.message; if (!msg || msg.chat.type !== 'private' || !msg.from || msg.from.is_bot) return false;
  const m = /^\/start(?:@\w+)?(?:\s+(\S+))?/.exec(msg.text || ''); if (!m) return false;
  const user = msg.from;
  recordBotStart(target, user, m[1], true);
  if (target.welcome && !target.forward_url) {
    const p = { chat_id: msg.chat.id, text: String(target.welcome).replace(/\{name\}/g, user.first_name || 'there') };
    if (target.btn_text && /^https?:\/\//.test(target.btn_url || '')) p.reply_markup = { inline_keyboard: [[{ text: target.btn_text, url: target.btn_url }]] };
    tg(bot.token, 'sendMessage', p);
  }
  return true;
}
// ---------- fraud filtering for joins ----------
// A suspect join is recorded (People → Filtered) but never sent to Meta/TikTok/Snapchat and never charged, so pixels only learn from real people.
const burstWin = new Map(); // channel id -> recent ad-join timestamps
/** Why an ad join looks fake, or ''. `telegram` = the data came straight from Telegram (not from a customer's own bot report). */
function joinSuspect(ch, click, user, ts, telegram) {
  if (!click || !feature('fake_filter')) return '';
  if (click.suspect && ['bot_ua', 'datacenter'].includes(click.suspect_reason)) return 'fake_click';
  const fn = String(user.first_name || '').trim();
  if (/^deleted account$/i.test(fn) || (telegram && !fn && !user.username && !user.last_name)) return 'deleted_account';
  if (Q(`SELECT 1 FROM joins WHERE owner_id=? AND tg_user_id=? AND joined_at>? LIMIT 1`).get(ch.owner_id, user.id, ts - 7 * 864e5)) return 'repeat_user';
  // Burst: far more ad joins on this channel in 10 seconds than its normal pace (at least 15, and 10× the last day's average).
  const w = (burstWin.get(ch.id) || []).filter((t) => t > ts - 10000); w.push(ts); burstWin.set(ch.id, w);
  if (w.length >= 15) {
    const day = Q(`SELECT COALESCE(SUM(joins),0) n FROM hourly WHERE channel_id=? AND hour>=?`).get(ch.id, Math.floor(ts / 3600000) - 24).n;
    if (w.length > Math.max(15, 10 * day / 8640)) return 'burst';
  }
  return '';
}
/** Save one join (channel, group or bot Start), send it to the ad platforms, count and charge it — or mark it filtered. */
function recordJoin(ch, click, user, ts, { telegram = false } = {}) {
  const reason = click ? joinSuspect(ch, click, user, ts, telegram) : '';
  let jid;
  tx(() => {
    const r = Q(`INSERT INTO joins(owner_id,channel_id,click_id,tg_user_id,first_name,last_name,username,lang,is_premium,joined_at,suspect,suspect_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(ch.owner_id, ch.id, click ? click.id : null, user.id, user.first_name || '', user.last_name || '', user.username || '', String(user.language_code || '').slice(0, 10), user.is_premium ? 1 : 0, ts, reason ? 1 : 0, reason || null);
    jid = Number(r.lastInsertRowid);
    if (reason) {
      const has = { meta: PLATFORMS.meta.has(ch), tiktok: feature('tiktok') && PLATFORMS.tiktok.has(ch), snap: feature('snapchat') && PLATFORMS.snap.has(ch) };
      Q(`UPDATE joins SET capi_status=?, tt_status=?, sc_status=? WHERE id=?`).run(has.meta ? 'filtered' : 'no_pixel', has.tiktok ? 'filtered' : 'none', has.snap ? 'filtered' : 'none', jid);
      bump(ch.id, ch.owner_id, ts, 'filtered');
      return;
    }
    const st = enqueueEvents(ch, click, user, ts, jid);
    Q(`UPDATE joins SET capi_status=?, tt_status=?, sc_status=? WHERE id=?`).run(st.meta, st.tiktok, st.snap, jid);
    bump(ch.id, ch.owner_id, ts, click ? 'joins' : 'organic');
    if (click) chargeJoin(ch.owner_id);
  });
  if (reason) log('join filtered', ch.id, user.id, reason);
  if (reason) vooEvent(ch.owner_id, 'bot_blocked', 'jv_blocked_' + jid, `Fake join blocked on ${srcLabel(ch)}`);
  else vooEvent(ch.owner_id, ch.type === 'bot' ? 'lead' : 'join', (ch.type === 'bot' ? 'jv_lead_' : 'jv_join_') + jid, `${ch.type === 'bot' ? 'New lead' : 'New subscriber'} via ${srcLabel(ch)}`, { source: click ? 'ad' : 'organic' });
  return { id: jid, suspect: !!reason, reason };
}
/** Someone pressed Start on a tracked bot (seen by our webhook, or reported by the customer's own bot). */
function recordBotStart(target, user, payload, telegram = false) {
  const ts = now();
  const existing = Q(`SELECT id FROM joins WHERE channel_id=? AND tg_user_id=? AND left_at IS NULL LIMIT 1`).get(target.id, user.id);
  if (existing) return { duplicate: true, join: existing.id };
  {
    const clickId = parseStart(payload);
    const click = clickId ? Q(`SELECT * FROM clicks WHERE id=? AND channel_id=? AND joined=0 AND ts>?`).get(clickId, target.id, now() - 7 * 864e5) : null;
    if (click) Q(`UPDATE clicks SET joined=1 WHERE id=?`).run(click.id);
    const r = recordJoin(target, click, user, ts, { telegram });
    return { ok: true, tracked: !!click && !r.suspect, filtered: r.suspect ? r.reason : undefined };
  }
}
function recordBotBlocked(target, uid) {
  const j = Q(`SELECT id FROM joins WHERE channel_id=? AND tg_user_id=? AND left_at IS NULL ORDER BY id DESC LIMIT 1`).get(target.id, uid);
  if (j) { Q(`UPDATE joins SET left_at=? WHERE id=?`).run(now(), j.id); bump(target.id, target.owner_id, now(), 'leaves'); }
  return !!j;
}
/**
 * "Keep my bot as it is" mode: the customer's own bot (any server or bot builder) tells us about each /start.
 * GET or POST /hook/<key>/start?bot=<username>&start=<payload>&tg_id=<user id>&first_name=&last_name=&username=&lang=
 * GET or POST /hook/<key>/blocked?bot=<username>&tg_id=<user id>
 */
async function onBotHook(req, res, key, kind) {
  if (!feature('bot_no_token')) return send(res, 403, { ok: false, error: 'Tracking a bot without its token is switched off on this server.' });
  const owner = Q(`SELECT id, status FROM users WHERE pb_key=?`).get(key);
  if (!owner || owner.status === 'suspended') return send(res, 404, { ok: false, error: 'Unknown key' });
  if (limited('hook:' + key, 3000, 60)) return send(res, 429, { ok: false, error: 'Too many requests per minute' });
  const url = new URL(req.url, BASE_URL), P = Object.fromEntries(url.searchParams);
  if (req.method === 'POST') {
    const raw = await readBody(req, 32 * 1024).catch(() => '');
    try { const j = JSON.parse(raw); Object.assign(P, j, j.user || j.from || {}); if (j.user && j.user.id) P.tg_id = j.user.id; if (j.from && j.from.id) P.tg_id = j.from.id; } catch { for (const [k, v] of new URLSearchParams(raw)) P[k] = v; }
  }
  const botName = String(P.bot || P.bot_username || '').replace(/^@/, '').toLowerCase();
  const tgId = parseInt(P.tg_id || P.user_id || P.id || '', 10);
  if (!/^\w{5,64}$/.test(botName)) return send(res, 400, { ok: false, error: 'Add bot=<your bot username>' });
  if (!(tgId > 0)) return send(res, 400, { ok: false, error: 'Add tg_id=<the Telegram user id>' });
  const target = Q(`SELECT * FROM channels WHERE owner_id=? AND type='bot' AND lower(username)=? AND status='active'`).get(owner.id, botName);
  if (!target) return send(res, 404, { ok: false, error: `@${botName} is not set up in Joinvoo. Add it under Channels → Bot subscribers first.` });
  if (tgId === 1000000001) return send(res, 200, { ok: true, test: true, message: 'Test received. Your bot is connected.' }); // dashboard's "Send a test"
  if (kind === 'blocked') return send(res, 200, { ok: true, left: recordBotBlocked(target, tgId) });
  let payload = String(P.start || P.payload || P.start_param || P.text || '').trim();
  const mm = /^\/start(?:@\w+)?\s+(\S+)/.exec(payload); if (mm) payload = mm[1]; else if (/^\/start/.test(payload)) payload = '';
  const r = recordBotStart(target, { id: tgId, first_name: String(P.first_name || '').slice(0, 80), last_name: String(P.last_name || '').slice(0, 80),
    username: String(P.username || '').replace(/^@/, '').slice(0, 64), language_code: String(P.lang || P.language_code || '').slice(0, 10), is_premium: P.is_premium === true || P.is_premium === 'true' }, payload);
  return send(res, 200, { ok: true, duplicate: !!r.duplicate, from_ad: !!r.tracked });
}
async function onUpdate(bot, u) {
  const target = Q(`SELECT * FROM channels WHERE owner_id=? AND bot_id=? AND type='bot' AND status<>'removed'`).get(bot.owner_id, bot.id);
  if (target && target.forward_url) {   // keep the user's own bot working: pass every update on to their server
    const fh = { 'content-type': 'application/json' }; if (target.forward_secret) fh['x-telegram-bot-api-secret-token'] = target.forward_secret; // so their server still trusts it
    // Never follow redirects (a public URL could bounce the update to an internal address) and re-check where the name points now.
    publicHttpsTarget(target.forward_url).then((ok) => (ok ? fetch(target.forward_url, { method: 'POST', headers: fh, body: JSON.stringify(u), redirect: 'manual', signal: AbortSignal.timeout(10000) }) : log('bot forward skipped: not a public address', target.id))).catch(() => {});
  }
  if (target && await onBotUpdate(bot, target, u)) return;
  if (u.my_chat_member) {
    const ch = attachBot(bot, u.my_chat_member.chat, u.my_chat_member.new_chat_member);
    if (ch && ch.status === 'active' && !ch.fallback_link) fillPools();
    return;
  }
  if (u.chat_join_request) return onJoinRequest(bot, u.chat_join_request);
  const cm = u.chat_member; if (!cm) return;
  const ch = Q(`SELECT * FROM channels WHERE owner_id=? AND chat_id=?`).get(bot.owner_id, cm.chat.id);
  if (!ch) return;
  // Several of your bots may sit in one channel. The bot that created the invite link reports the join;
  // the primary bot reports everything else (organic joins, leaves).
  const creatorId = cm.invite_link && cm.invite_link.creator && cm.invite_link.creator.id;
  const creatorIsOurs = creatorId && Q(`SELECT 1 FROM bots WHERE tg_id=? AND owner_id=? AND status='active'`).get(creatorId, bot.owner_id);
  if (creatorIsOurs ? creatorId !== bot.tg_id : ch.bot_id !== bot.id) return;

  const user = cm.new_chat_member.user; if (user.is_bot) return;
  const wasIn = MEMBER(cm.old_chat_member), isIn = MEMBER(cm.new_chat_member);
  const sent = (cm.date || 0) * 1000;
  const ts = sent && sent < now() - 60000 ? sent : now(); // use Telegram's time only if the update arrived late

  if (!wasIn && isIn) {
    // Already recorded (e.g. we approved their join request a moment ago): don't count them twice.
    if (Q(`SELECT 1 FROM joins WHERE channel_id=? AND tg_user_id=? AND left_at IS NULL LIMIT 1`).get(ch.id, user.id)) return;
    let click = null;
    const url = cm.invite_link && cm.invite_link.invite_link;
    if (url) {
      const link = Q(`SELECT * FROM links WHERE url=? AND channel_id=?`).get(url, ch.id);
      if (link && link.status !== 'used') {
        Q(`UPDATE links SET status='used' WHERE id=?`).run(link.id);
        if (link.click_id) click = Q(`SELECT * FROM clicks WHERE id=?`).get(link.click_id);
      }
    }
    if (click) Q(`UPDATE clicks SET joined=1 WHERE id=?`).run(click.id);
    recordJoin(ch, click, user, ts, { telegram: true });
  } else if (wasIn && !isIn) {
    const j = Q(`SELECT id FROM joins WHERE channel_id=? AND tg_user_id=? AND left_at IS NULL ORDER BY id DESC LIMIT 1`).get(ch.id, user.id);
    if (j) Q(`UPDATE joins SET left_at=? WHERE id=?`).run(ts, j.id);
    bump(ch.id, ch.owner_id, ts, 'leaves');
  }
}

/** chat_join_request: approve at once, record the join against the click that got this link, and DM the offer. */
async function onJoinRequest(bot, jr) {
  const ch = Q(`SELECT * FROM channels WHERE owner_id=? AND chat_id=?`).get(bot.owner_id, jr.chat.id);
  if (!ch || !isReq(ch) || !jr.from || jr.from.is_bot) return;
  const url = jr.invite_link && jr.invite_link.invite_link;
  const link = url ? Q(`SELECT * FROM links WHERE url=? AND channel_id=?`).get(url, ch.id) : null;
  if (link && link.bot_id && link.bot_id !== bot.id) return; // the bot that made the link handles it
  if (!link && ch.bot_id !== bot.id) return;
  const user = jr.from, ts = now();
  const ap = await tg(bot.token, 'approveChatJoinRequest', { chat_id: ch.chat_id, user_id: user.id });
  if (!ap.ok && !/USER_ALREADY_PARTICIPANT/i.test(ap.description || '')) { handleTgError(bot.id, ch.id, ap); return; }
  let click = null;
  if (link && link.status !== 'used') { Q(`UPDATE links SET status='used' WHERE id=?`).run(link.id); if (link.click_id) click = Q(`SELECT * FROM clicks WHERE id=?`).get(link.click_id); }
  if (!Q(`SELECT 1 FROM joins WHERE channel_id=? AND tg_user_id=? AND left_at IS NULL LIMIT 1`).get(ch.id, user.id)) {
    if (click) Q(`UPDATE clicks SET joined=1 WHERE id=?`).run(click.id);
    recordJoin(ch, click, user, ts, { telegram: true });
  }
  // Welcome DM with the offer link carrying their Telegram ID, so the affiliate program reports deposits back with sub1 = this person.
  if (ch.offer_text || ch.offer_url) {
    const fill = (x) => String(x || '').replace(/\{tg_id\}/g, String(user.id)).replace(/\{click_id\}/g, click ? String(click.id) : '').replace(/\{name\}/g, user.first_name || 'there');
    const p = { chat_id: jr.user_chat_id || user.id, text: fill(ch.offer_text) || tr(normLang(user.language_code), 'bot.welcome', { title: ch.title || tr(normLang(user.language_code), 'bot.welcome_default') }), disable_web_page_preview: true };
    if (/^https:\/\//.test(ch.offer_url || '')) p.reply_markup = { inline_keyboard: [[{ text: (ch.offer_btn || 'Open').slice(0, 40), url: fill(ch.offer_url) }]] };
    tg(bot.token, 'sendMessage', p);
  }
}

// ---------- conversions: registrations, deposits (FTD), sales, CPA, chargebacks — reported after the join ----------
const CONV_EVENTS = {
  lead: { meta: 'Lead', tiktok: 'SubmitForm', snap: 'SIGN_UP', label: 'Lead' },
  reg: { meta: 'CompleteRegistration', tiktok: 'CompleteRegistration', snap: 'SIGN_UP', label: 'Registration' },
  ftd: { meta: 'Purchase', tiktok: 'CompletePayment', snap: 'PURCHASE', label: 'First deposit' },
  dep: { meta: 'Deposit', tiktok: null, snap: null, label: 'Deposit' }, // repeat deposits: Meta custom event only, so FTD optimisation stays clean
  sale: { meta: 'Purchase', tiktok: 'CompletePayment', snap: 'PURCHASE', label: 'Sale' }, // a course, VIP access, a subscription…
  qualified: { meta: 'Qualified', tiktok: null, snap: null, label: 'Qualified (CPA)' },
  rejected: { meta: null, tiktok: null, snap: null, label: 'Rejected' }, // chargeback / reversal: never sent to ad platforms
};
const REVENUE_SQL = "CASE WHEN event IN ('ftd','dep','sale') AND COALESCE(rejected,0)=0 THEN value_cents ELSE 0 END";
function normEvent(v) {
  v = String(v || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (['ftd', 'first_deposit', 'firstdeposit', 'first_dep', 'fd'].includes(v)) return 'ftd';
  if (['dep', 'deposit', 'redeposit', 'rd', 're_deposit', 'repeat_deposit'].includes(v)) return 'dep';
  if (['sale', 'purchase', 'order', 'paid', 'subscription'].includes(v)) return 'sale';
  if (['qualified', 'cpa', 'baseline', 'qualification'].includes(v)) return 'qualified';
  if (['rejected', 'reject', 'chargeback', 'reversed', 'reversal', 'refund', 'refunded', 'fraud', 'declined', 'trash'].includes(v)) return 'rejected';
  if (['reg', 'registration', 'signup', 'sign_up', 'register', 'complete_registration'].includes(v)) return 'reg';
  if (['lead', 'contact', 'form'].includes(v)) return 'lead';
  return null;
}
/**
 * Record a conversion for one of the owner's people and send it to their ad platforms.
 * Find the person by Telegram user id (most recent ad join wins) or by a specific join id.
 * `rejected` marks the matching deposit/sale as rejected (revenue no longer counts) and sends nothing.
 */
function recordConversion(ownerId, { tgUserId, joinId, event, valueCents = 0, currency = 'USD', txid = null, source = 'postback', raw = null, network = null }) {
  let ev = normEvent(event);
  if (!ev) return { error: 'Unknown event. Use reg, ftd, dep, sale, qualified, rejected or lead.' };
  const j = joinId
    ? Q(`SELECT * FROM joins WHERE id=? AND owner_id=?`).get(joinId, ownerId)
    : tgUserId ? Q(`SELECT * FROM joins WHERE owner_id=? AND tg_user_id=? ORDER BY (click_id IS NOT NULL) DESC, COALESCE(suspect,0) ASC, joined_at DESC LIMIT 1`).get(ownerId, tgUserId) : null;
  if (network && !Q(`SELECT 1 FROM integrations WHERE id=?`).get(network)) network = null;
  if (network) Q(`INSERT INTO user_integrations(user_id,integration_id,connected_at,last_event_at) VALUES(?,?,?,?) ON CONFLICT DO UPDATE SET last_event_at=excluded.last_event_at`).run(ownerId, network, now(), now());
  if (txid) {
    const dupe = Q(`SELECT id FROM conversions WHERE owner_id=? AND txid=? AND event IN ('ftd','dep') AND ? IN ('ftd','dep')`).get(ownerId, txid, ev)
      || Q(`SELECT id FROM conversions WHERE owner_id=? AND txid=? AND event=?`).get(ownerId, txid, ev);
    if (dupe) return { ok: true, duplicate: true, id: dupe.id, matched: !!j, event: ev };
  }
  const cur = /^[A-Z]{3}$/.test(String(currency || '').toUpperCase()) ? String(currency).toUpperCase() : 'USD';
  if (ev === 'rejected') {
    const target = (txid && Q(`SELECT * FROM conversions WHERE owner_id=? AND txid=? AND event IN ('ftd','dep','sale') AND COALESCE(rejected,0)=0 ORDER BY id DESC LIMIT 1`).get(ownerId, txid))
      || (j && Q(`SELECT * FROM conversions WHERE owner_id=? AND join_id=? AND event IN ('ftd','dep','sale') AND COALESCE(rejected,0)=0 ORDER BY id DESC LIMIT 1`).get(ownerId, j.id));
    return tx(() => {
      if (target) Q(`UPDATE conversions SET rejected=1 WHERE id=?`).run(target.id);
      const r = Q(`INSERT INTO conversions(owner_id,channel_id,join_id,tg_user_id,event,value_cents,currency,txid,source,matched,raw,created_at,meta_status,tt_status,sc_status,network) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'none','none','none',?)`)
        .run(ownerId, target ? target.channel_id : j ? j.channel_id : null, target ? target.join_id : j ? j.id : null, target ? target.tg_user_id : j ? j.tg_user_id : (tgUserId || null), 'rejected',
          target ? target.value_cents : Math.max(0, Math.round(valueCents || 0)), target ? target.currency : cur, txid || null, source, target || j ? 1 : 0, raw, now(), network);
      return { ok: true, id: Number(r.lastInsertRowid), matched: !!(target || j), event: 'rejected', reversed: target ? target.id : null };
    });
  }
  if (j) {
    // The first deposit is the FTD. Any later deposit is a repeat deposit, whatever the sender called it.
    const hadDep = Q(`SELECT 1 FROM conversions WHERE join_id=? AND event IN ('ftd','dep') LIMIT 1`).get(j.id);
    if (ev === 'dep' && !hadDep) ev = 'ftd'; else if (ev === 'ftd' && hadDep) ev = 'dep';
    if ((ev === 'reg' || ev === 'qualified') && Q(`SELECT 1 FROM conversions WHERE join_id=? AND event=? LIMIT 1`).get(j.id, ev)) return { ok: true, duplicate: true, matched: true, event: ev };
  }
  return tx(() => {
    const r = Q(`INSERT INTO conversions(owner_id,channel_id,join_id,tg_user_id,event,value_cents,currency,txid,source,matched,raw,created_at,network) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(ownerId, j ? j.channel_id : null, j ? j.id : null, j ? j.tg_user_id : (tgUserId || null), ev, Math.max(0, Math.round(valueCents || 0)), cur, txid || null, source, j ? 1 : 0, raw, now(), network);
    const id = Number(r.lastInsertRowid);
    let st = { meta: 'none', tiktok: 'none', snap: 'none' };
    if (j && j.click_id) {
      const ch = Q(`SELECT * FROM channels WHERE id=?`).get(j.channel_id), click = Q(`SELECT * FROM clicks WHERE id=?`).get(j.click_id);
      if (ch && click) {
        const E = CONV_EVENTS[ev];
        st = enqueueEvents(ch, click, { id: j.tg_user_id }, now(), j.id, id, { meta: E.meta, tiktok: E.tiktok, snap: E.snap, value: ['ftd', 'dep', 'sale'].includes(ev) ? valueCents : 0, currency: cur, id: `jvconv_${id}`,
          skip: Object.keys(PLATFORMS).filter((k) => !E[k]) });
      }
    }
    Q(`UPDATE conversions SET meta_status=?, tt_status=?, sc_status=? WHERE id=?`).run(st.meta, st.tiktok, st.snap, id);
    { const vt = { reg: 'registration', ftd: 'ftd', dep: 'deposit', lead: 'lead' }[ev];
      // VooSquare's type for a funnel sign-up is `signup` (the event_id keeps its old stable form). value_usd only when the postback was in USD.
      if (vt) { const vch = j ? Q(`SELECT title, username FROM channels WHERE id=?`).get(j.channel_id) : null;
        vooEvent(ownerId, vt === 'registration' ? 'signup' : vt, `jv_${vt}_${id}`, `${{ registration: 'Registration', ftd: 'First deposit', deposit: 'Deposit', lead: 'New lead' }[vt]}${vch ? ' via ' + srcLabel(vch) : ''}`, ['ftd', 'deposit'].includes(vt) && valueCents && String(cur || 'USD').toUpperCase() === 'USD' ? { value: Math.round(valueCents) / 100 } : {}); } }
    if (ev === 'ftd' && j && j.click_id) setImmediate(() => { chargeFtd(ownerId); checkTrial(ownerId); });
    if (ev === 'ftd' && j && j.click_id) setImmediate(() => { const L = userLang(ownerId); alertUser(ownerId, 'ftd_live', tr(L, 'alert.ftd_live', { value: valueCents ? ` · ${(valueCents / 100).toFixed(2)} ${cur}` : '', who: j.first_name ? tr(L, 'alert.ftd_from', { name: j.first_name }) : '' })); });
    return { ok: true, id, matched: !!j, event: ev, attributed: !!(j && j.click_id) };
  });
}
function pbKey(userId) {
  let u = Q(`SELECT pb_key FROM users WHERE id=?`).get(userId);
  if (!u.pb_key) { Q(`UPDATE users SET pb_key=? WHERE id=?`).run(rid(12).replace(/[^A-Za-z0-9]/g, 'x'), userId); u = Q(`SELECT pb_key FROM users WHERE id=?`).get(userId); }
  return u.pb_key;
}
async function onPostback(req, res, key) {
  if (!feature('ftd')) return send(res, 403, { ok: false, error: 'Deposit tracking is switched off on this server.' });
  const owner = Q(`SELECT id, status FROM users WHERE pb_key=?`).get(key);
  if (!owner || owner.status === 'suspended') return send(res, 404, { ok: false, error: 'Unknown postback key' });
  if (limited('pb:' + key, 600, 60)) return send(res, 429, { ok: false, error: 'Too many postbacks per minute' });
  const url = new URL(req.url, BASE_URL), P = Object.fromEntries(url.searchParams);
  if (req.method === 'POST') {
    const raw = await readBody(req, 32 * 1024).catch(() => '');
    try { Object.assign(P, JSON.parse(raw)); } catch { for (const [k, v] of new URLSearchParams(raw)) P[k] = v; }
  }
  const pick = (...ks) => { for (const k of ks) if (P[k] !== undefined && P[k] !== '' && !/^\{.*\}$/.test(String(P[k]))) return String(P[k]); return ''; };
  const tgId = pick('tg_id', 'tg_user_id', 'telegram_id', 'user_id', 'subid', 'sub_id', 'sub1', 'aff_sub', 'clickid', 'click_id', 'cid', 'external_id');
  const event = pick('event', 'status', 'goal', 'type', 'et', 'cnv_status') || 'ftd';
  const value = parseFloat(pick('value', 'payout', 'amount', 'sum', 'revenue', 'p')) || 0;
  const network = pick('net', 'network', 'jv_net').toLowerCase().slice(0, 40) || null;
  const r = recordConversion(owner.id, { tgUserId: /^\d{3,15}$/.test(tgId) ? +tgId : null, event, valueCents: Math.round(value * 100),
    currency: pick('currency', 'cur') || 'USD', txid: pick('txid', 'transaction_id', 'tid', 'order_id', 'deposit_id').slice(0, 120) || null, source: 'postback',
    raw: JSON.stringify(P).slice(0, 2000), network });
  if (r.error) return send(res, 400, { ok: false, error: r.error });
  return send(res, 200, { ok: true, matched: r.matched, duplicate: !!r.duplicate, event: r.event || null });
}

// ---------- click page ----------
function clickPage(ch) {
  const fallback = ch.fallback_link || (ch.username ? `https://t.me/${ch.username}` : '');
  const pixel = /^\d{5,20}$/.test(ch.pixel_id || '') ? ch.pixel_id : '';
  const pixelCode = pixel ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixel}');fbq('track','PageView');</script>` : '';
  const tt = feature('tiktok') && /^[A-Z0-9]{8,30}$/i.test(ch.tt_pixel || '') ? ch.tt_pixel : '';
  const ttCode = tt ? `<script>!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${tt}');ttq.page();}(window,document,'ttq');</script>` : '';
  const sc = feature('snapchat') && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ch.sc_pixel || '') ? ch.sc_pixel : '';
  const scCode = sc ? `<script>(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script';var r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u)})(window,document,'https://sc-static.net/scevent.min.js');snaptr('init','${sc}',{});snaptr('track','PAGE_VIEW');</script>` : '';
  const auto = ch.landing !== 'button';
  const title = esc(ch.title || 'Telegram');
  const kind = ch.type === 'bot' ? 'Start the bot on Telegram' : ch.type === 'channel' ? 'Join the channel on Telegram' : 'Join the group on Telegram';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><meta name="robots" content="noindex">${pixelCode}${ttCode}${scCode}
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,sans-serif;background:#eef4f9;color:#10202f}
.b{text-align:center;padding:24px;max-width:420px}.s{width:40px;height:40px;border:3px solid #cfe2f1;border-top-color:#2aabee;border-radius:50%;margin:0 auto 18px;animation:r .8s linear infinite}
.av{width:84px;height:84px;border-radius:50%;margin:0 auto 18px;background:linear-gradient(135deg,#2aabee,#229ed9);display:grid;place-items:center;color:#fff;font-size:36px;font-weight:700}
@keyframes r{to{transform:rotate(360deg)}}h1{font-size:${auto ? 18 : 24}px;margin:0 0 6px}p{margin:0;color:#4b5d6e;font-size:15px;line-height:1.5}
a{display:inline-block;margin-top:22px;background:#2aabee;color:#fff;text-decoration:none;padding:15px 28px;border-radius:14px;font-weight:600;font-size:16px}
small{display:block;margin-top:16px;color:#7b8a98;font-size:12.5px}</style></head>
<body><div class="b">${auto ? '<div class="s"></div>' : `<div class="av">${esc((ch.title || 'T').trim().charAt(0).toUpperCase())}</div>`}<h1>${title}</h1>
<p>${auto ? 'Opening Telegram…' : esc(kind) + '. Tap the button and Telegram opens.'}</p><a id="btn" href="${esc(fallback || '#')}">${auto ? 'Open in Telegram' : ch.type === 'bot' ? 'Start bot' : 'Join'}</a>
${auto ? '' : '<small>You need the Telegram app. It’s free.</small>'}</div>
<script>(function(){var FB=${JSON.stringify(fallback)},AUTO=${auto ? 1 : 0},done=false,sent=false,tries=0,max=${pixel || tt || sc ? 8 : 0};
function ck(n){var m=document.cookie.match('(?:^|; )'+n+'=([^;]*)');return m?decodeURIComponent(m[1]):''}
function go(u){if(done||!u)return;done=true;document.getElementById('btn').href=u;AUTO?location.replace(u):location.assign(u)}
function send(){if(sent)return;sent=true;fetch('/c/${ch.slug}/go',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',
body:JSON.stringify({fbp:ck('_fbp'),fbc:ck('_fbc'),ttp:ck('_ttp'),scid:ck('_scid'),url:location.href})}).then(function(r){return r.json()}).then(function(j){go(j.url||FB)}).catch(function(){go(FB)});setTimeout(function(){go(FB)},6000)}
function w(){if((ck('_fbp')||!${pixel ? 1 : 0})&&(ck('_ttp')||!${tt ? 1 : 0})&&(ck('_scid')||!${sc ? 1 : 0})||tries>=max)return send();tries++;setTimeout(w,100)}
if(AUTO)w();else document.getElementById('btn').addEventListener('click',function(e){e.preventDefault();if(done)return void(location.href=this.href);tries=max;send()});})();</script></body></html>`;
}

// ---------- fake-click filter ----------
// Clicks are only FLAGGED (suspect=1 + reason); they are still tracked, so a false alarm never loses a real person.
const BOT_UA = /bot\b|crawl|spider|slurp|headless|phantomjs|selenium|puppeteer|playwright|webdriver|curl\/|wget\/|python-requests|python-urllib|aiohttp|httpclient|okhttp|go-http-client|java\/|libwww|scrapy|facebookexternalhit|facebookcatalog|bytespider|petalbot|ahrefs|semrush/i;
// A short, deliberately incomplete list of big cloud/datacenter IPv4 ranges (AWS, Google Cloud, Azure, DigitalOcean, OVH, Hetzner).
// Real phones on mobile data or home Wi-Fi are never in these. Extend it if you see abuse from another host.
const DATACENTER_CIDRS = ['3.0.0.0/9', '18.128.0.0/9', '52.0.0.0/10', '54.64.0.0/11', '34.64.0.0/10', '35.184.0.0/13', '20.0.0.0/11', '40.64.0.0/10', '52.224.0.0/11',
  '104.131.0.0/16', '138.68.0.0/16', '159.65.0.0/16', '167.99.0.0/16', '188.166.0.0/16', '206.189.0.0/16', '51.68.0.0/16', '51.75.0.0/16', '54.36.0.0/16', '145.239.0.0/16',
  '5.9.0.0/16', '78.46.0.0/15', '88.198.0.0/16', '95.216.0.0/16', '116.202.0.0/16', '135.181.0.0/16'].map((c) => { const [ip, bits] = c.split('/'); return [ip4(ip), bits ? (~0 << (32 - +bits)) >>> 0 : 0]; });
function ip4(ip) { const m = /^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(String(ip || '')); return m ? ((+m[1] << 24) | (+m[2] << 16) | (+m[3] << 8) | +m[4]) >>> 0 : null; }
const isDatacenter = (ip) => { const n = ip4(ip); return n != null && DATACENTER_CIDRS.some(([net, mask]) => ((n & mask) >>> 0) === ((net & mask) >>> 0)); };
/** Why a click looks fake, or '' if it looks like a person. hits = clicks from this IP on this link in the last 10 minutes. */
function suspectReason(req, hits) {
  if (!feature('fake_filter')) return '';
  const ua = String(req.headers['user-agent'] || '');
  if (!ua || BOT_UA.test(ua)) return 'bot_ua';
  if (isDatacenter(clientIp(req))) return 'datacenter';
  if (hits > 3) return 'repeat';
  if (!cookies(req).jv_h) return 'no_js'; // the landing page sets this cookie; scripts that POST straight to /go don't have it
  return '';
}

/** Save one ad click with everything the ad platforms need to match it later. Returns the click id. */
function recordClick(req, ch, body, t, hits = 1) {
  let pageUrl = String(body.url || '').slice(0, 1500), fbclid = '', ttclid = '', sccid = '', params = {};
  try {
    const u = new URL(pageUrl);
    fbclid = u.searchParams.get('fbclid') || ''; ttclid = u.searchParams.get('ttclid') || ''; sccid = u.searchParams.get('ScCid') || u.searchParams.get('sccid') || '';
    let n = 0;
    for (const [k, v] of u.searchParams) { if (!['fbclid', 'ttclid', 'ScCid', 'sccid'].includes(k) && n++ < 20) params[k.slice(0, 40)] = v.slice(0, 200); }
  } catch { pageUrl = ''; }
  const fbc = /^fb\.\d\.\d+\./.test(body.fbc || '') ? body.fbc : (fbclid ? `fb.1.${t}.${fbclid}` : '');
  const fbp = /^fb\.\d\.\d+\./.test(body.fbp || '') ? body.fbp : '';
  const country = String((TRUST_CLOUDFLARE && req.headers['cf-ipcountry']) || '').slice(0, 2).toUpperCase().replace(/[^A-Z]/g, '');
  const clean = (v, n) => String(v || '').slice(0, n).replace(/[^\w.:-]/g, '');
  const ins = Q(`INSERT INTO clicks(owner_id,channel_id,ts,ip,ua,country,fbclid,fbc,fbp,page_url,params,ttclid,ttp,sccid,scid) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(ch.owner_id, ch.id, t, clientIp(req), String(req.headers['user-agent'] || '').slice(0, 400), country || null,
      fbclid.slice(0, 500), String(fbc).slice(0, 600), String(fbp).slice(0, 200), pageUrl, JSON.stringify(params), ttclid.slice(0, 500), clean(body.ttp, 200), clean(sccid, 200), clean(body.scid, 200));
  bump(ch.id, ch.owner_id, t, 'clicks');
  const sr = suspectReason(req, hits);
  if (sr) { Q(`UPDATE clicks SET suspect=1, suspect_reason=? WHERE id=?`).run(sr, ins.lastInsertRowid); bump(ch.id, ch.owner_id, t, 'suspect'); }
  return Number(ins.lastInsertRowid);
}
const goHits = new Map(); // ip|slug -> [count, windowStart]
setInterval(() => { const t = Date.now(); for (const [k, v] of goHits) if (t - v[1] > 600000) goHits.delete(k); }, 60000).unref();
async function onClick(req, res, ch) {
  const body = await readJson(req, 8 * 1024);
  const fallback = ch.fallback_link || (ch.username ? `https://t.me/${ch.username}` : '');
  if (ch.status !== 'active' || ch.locked) return send(res, 200, { url: fallback });
  // One visitor hammering the link (or a script) shouldn't drain the invite-link pool.
  let hits = 1;
  { const k = clientIp(req) + '|' + ch.slug, t = now(), h = goHits.get(k);
    if (h && t - h[1] < 600000) { hits = ++h[0]; if (h[0] > 8) return send(res, 200, { url: fallback }); } else goHits.set(k, [1, t]); }
  // Out of balance (or suspended): the visitor still gets into Telegram, we just don't track or report it.
  if (!allowTracking(ch.owner_id)) return send(res, 200, { url: fallback });
  if (ch.type === 'bot') {
    const t0 = now();
    const id0 = recordClick(req, ch, body, t0, hits);
    return send(res, 200, { url: `https://t.me/${ch.username}?start=${startCode(id0)}` });
  }
  const t = now();
  // Same visitor reloading: hand back the link they already have.
  const ck = cookies(req)['jp_' + ch.slug];
  if (ck) {
    const [cid, sig] = ck.split('.');
    if (sig === hmac(cid)) {
      const prev = Q(`SELECT l.url FROM clicks c JOIN links l ON l.id=c.link_id WHERE c.id=? AND c.channel_id=? AND c.joined=0
        AND l.status='assigned' AND l.click_id=c.id`).get(+cid, ch.id);
      if (prev) return send(res, 200, { url: prev.url });
    }
  }
  const clickId = recordClick(req, ch, body, t, hits);

  let link = Q(`UPDATE links SET status='assigned', click_id=?, assigned_at=? WHERE id=(SELECT id FROM links WHERE channel_id=? AND status='pool' AND req=? LIMIT 1) RETURNING id, url`)
    .get(clickId, t, ch.id, isReq(ch) ? 1 : 0);
  if (!link) {
    // Pool ran dry: try to make one right now, otherwise send them in untracked.
    const row = Q(`SELECT cb.bot_id, b.token, b.cooldown_until FROM channel_bots cb JOIN bots b ON b.id=cb.bot_id
      WHERE cb.channel_id=? AND cb.can_invite=1 AND b.status='active' ORDER BY b.cooldown_until LIMIT 1`).get(ch.id);
    if (row && row.cooldown_until < t) {
      const made = await createLink({ ...row, channel_id: ch.id, chat_id: ch.chat_id, join_mode: ch.join_mode }, false);
      if (made) { Q(`UPDATE links SET status='assigned', click_id=?, assigned_at=? WHERE id=?`).run(clickId, t, made.id); link = made; }
    }
  }
  if (!link) return send(res, 200, { url: fallback });
  Q(`UPDATE clicks SET link_id=? WHERE id=?`).run(link.id, clickId);
  queueLinkName(link.id, clickId);
  send(res, 200, { url: link.url }, { 'set-cookie': cookie('jp_' + ch.slug, `${clickId}.${hmac(clickId)}`, RECYCLE_MIN * 60) });
}

// ---------- invite link names: "Meta · c-0a3f9 · NG", visible in Telegram → channel → Invite links ----------
const clickCode = (id) => (id ? 'c-' + Number(id).toString(36).padStart(5, '0') : null);
const clickFromCode = (s) => { const m = /^c-?([0-9a-z]{1,12})$/i.exec(String(s || '').trim()); return m ? parseInt(m[1], 36) || null : null; };
const platName = (c) => (c.fbclid ? 'Meta' : c.ttclid ? 'TikTok' : c.sccid ? 'Snap' : 'Direct');
function linkNameFor(c) { return `${platName(c)} · ${clickCode(c.id)}${c.country ? ' · ' + c.country : ''}`.slice(0, 32); }
const nameQueue = []; const renameAt = new Map(), renameCool = new Map();
function queueLinkName(linkId, clickId) {
  if (!feature('link_names')) return;
  if (nameQueue.length > 5000) nameQueue.shift();
  nameQueue.push({ linkId, clickId, at: now() });
}
let renameBusy = false;
/** Gentle and best-effort: a label only, so it never competes with making new links (separate pacing, its own back-off, never marks the bot as cooling down). */
async function renameTick() {
  if (renameBusy || !nameQueue.length) return; renameBusy = true;
  try {
    const t = now(), keep = [], jobs = [];
    let scanned = 0;
    while (nameQueue.length && scanned++ < 300) {
      const it = nameQueue.shift();
      if (t - it.at > 15 * 60000) continue; // stale: they have joined (or not) long ago
      const r = Q(`SELECT l.id, l.url, l.req, l.name, l.status, l.bot_id, b.token, b.status AS bst, b.cooldown_until, ch.chat_id FROM links l JOIN bots b ON b.id=l.bot_id JOIN channels ch ON ch.id=l.channel_id WHERE l.id=?`).get(it.linkId);
      if (!r || r.name || r.bst !== 'active' || !r.token) continue;
      if (r.cooldown_until > t || (renameCool.get(r.bot_id) || 0) > t || t - (renameAt.get(r.bot_id) || 0) < Math.max(1000, LINK_INTERVAL_MS) || jobs.some((j) => j.bot === r.bot_id)) { keep.push(it); continue; }
      const c = Q(`SELECT id, fbclid, ttclid, sccid, country FROM clicks WHERE id=?`).get(it.clickId); if (!c) continue;
      const name = linkNameFor(c); renameAt.set(r.bot_id, t);
      jobs.push({ bot: r.bot_id, p: tg(r.token, 'editChatInviteLink', { chat_id: r.chat_id, invite_link: r.url, name, ...(r.req ? { creates_join_request: true } : { member_limit: 1 }) }).then((res) => {
        if (res.ok) Q(`UPDATE links SET name=? WHERE id=?`).run(name, r.id);
        else if (res.error_code === 429) { renameCool.set(r.bot_id, now() + (((res.parameters && res.parameters.retry_after) || 30) + 30) * 1000); keep.push(it); }
      }) });
      if (jobs.length >= 20) break;
    }
    await Promise.all(jobs.map((j) => j.p));
    nameQueue.unshift(...keep);
  } catch (e) { log('link names', e.message); } finally { renameBusy = false; }
}
setInterval(renameTick, +env.RENAME_TICK_MS || 1000).unref();

// ---------- API ----------
function parseRange(qs) {
  const tz = Math.max(-840, Math.min(840, parseInt(qs.get('tz') || '0', 10) || 0)); // minutes, like JS getTimezoneOffset()
  const day = (s, d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : d; };
  const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const from = day(qs.get('from'), today - 6 * 864e5) + tz * 60000;
  const to = day(qs.get('to'), today) + 864e5 + tz * 60000;
  const channel = parseInt(qs.get('channel') || '', 10) || null;
  return { tz, from, to, channel };
}

const HOURLY_SUMS = `SUM(clicks) clicks, SUM(joins) joins, SUM(organic) organic, SUM(leaves) leaves, SUM(capi_ok) capi_ok, SUM(capi_fail) capi_fail, SUM(tt_ok) tt_ok, SUM(tt_fail) tt_fail, SUM(sc_ok) sc_ok, SUM(sc_fail) sc_fail, SUM(suspect) suspect, SUM(filtered) filtered`;
/** Ad spend (credits = cents) between two YYYY-MM-DD dates, optionally per campaign/platform. */
const spendSum = (uid, d0, d1) => Q(`SELECT COALESCE(SUM(amount_cents),0) n FROM spend WHERE owner_id=? AND date>=? AND date<=?`).get(uid, d0, d1).n;
function rangeDays(qs) {
  const today = new Date().toISOString().slice(0, 10);
  const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  return [ok(qs.get('from')) ? qs.get('from') : new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10), ok(qs.get('to')) ? qs.get('to') : today];
}
function convTotals(uid, from, to, channel) {
  const a = [uid, from, to]; if (channel) a.push(channel);
  return Q(`SELECT COALESCE(SUM(event='ftd'),0) ftd, COALESCE(SUM(event='reg'),0) reg, COALESCE(SUM(event='dep'),0) dep, COALESCE(SUM(event='sale'),0) sales,
    COALESCE(SUM(event='qualified'),0) qualified, COALESCE(SUM(event='rejected'),0) rejected, COALESCE(SUM(event='lead'),0) leads, COALESCE(SUM(${REVENUE_SQL}),0) revenue_cents
    FROM conversions WHERE owner_id=? AND matched=1 AND created_at>=? AND created_at<?${channel ? ' AND channel_id=?' : ''}`).get(...a);
}
function stats(user, qs) {
  const { tz, from, to, channel } = parseRange(qs);
  const args = [tz, user.id, Math.floor(from / 3600000), Math.ceil(to / 3600000)];
  let where = '';
  if (channel) { where = ' AND channel_id=?'; args.push(channel); }
  const rows = Q(`SELECT channel_id, (hour*3600 - ?*60)/86400 AS dayn, ${HOURLY_SUMS}
    FROM hourly WHERE owner_id=? AND hour>=? AND hour<?${where} GROUP BY channel_id, dayn`).all(...args);
  const totals = { clicks: 0, joins: 0, organic: 0, leaves: 0, capi_ok: 0, capi_fail: 0, tt_ok: 0, tt_fail: 0, sc_ok: 0, sc_fail: 0, suspect: 0, filtered: 0 };
  const days = new Map(); const per = new Map();
  for (const r of rows) {
    for (const k in totals) totals[k] += r[k] || 0;
    const d = new Date(r.dayn * 864e5).toISOString().slice(0, 10);
    const dd = days.get(d) || { day: d, clicks: 0, joins: 0 }; dd.clicks += r.clicks; dd.joins += r.joins; days.set(d, dd);
    const p = per.get(r.channel_id) || { id: r.channel_id, clicks: 0, joins: 0, organic: 0, leaves: 0 };
    p.clicks += r.clicks; p.joins += r.joins; p.organic += r.organic; p.leaves += r.leaves; per.set(r.channel_id, p);
  }
  totals.suspect_clicks = totals.suspect; delete totals.suspect; totals.filtered_joins = totals.filtered; delete totals.filtered;
  const cargs = [tz, user.id, from, to]; if (channel) cargs.push(channel);
  for (const c of Q(`SELECT (created_at/1000 - ?*60)/86400 AS dayn, COALESCE(SUM(event='ftd'),0) ftd, COALESCE(SUM(event='sale'),0) sales, COALESCE(SUM(${REVENUE_SQL}),0) rev FROM conversions
      WHERE owner_id=? AND matched=1 AND created_at>=? AND created_at<?${channel ? ' AND channel_id=?' : ''} GROUP BY dayn`).all(...cargs)) {
    const d = new Date(c.dayn * 864e5).toISOString().slice(0, 10);
    const dd = days.get(d) || { day: d, clicks: 0, joins: 0 }; days.set(d, dd);
    if (c.ftd) dd.ftd = c.ftd; if (c.sales) dd.sales = c.sales; if (c.rev) dd.revenue_cents = c.rev;
  }
  { const la = [user.id, from, to]; if (channel) la.push(channel);
    totals.leaves_new = cnt(`SELECT COUNT(*) FROM joins WHERE owner_id=? AND joined_at>=? AND joined_at<? AND left_at IS NOT NULL AND left_at<?${channel ? ' AND channel_id=?' : ''}`, la[0], la[1], la[2], la[2], ...la.slice(3));
    totals.leaves_old = Math.max(0, totals.leaves - totals.leaves_new); }
  const ct = convTotals(user.id, from, to, channel);
  Object.assign(totals, { ftd: ct.ftd, reg: ct.reg, dep: ct.dep, sales: ct.sales, qualified: ct.qualified, rejected: ct.rejected, revenue_cents: ct.revenue_cents });
  const [d0, d1] = rangeDays(qs);
  totals.spend_cents = channel ? 0 : spendSum(user.id, d0, d1);
  const chans = Q(`SELECT id, title, status FROM channels WHERE owner_id=?`).all(user.id);
  const titles = new Map(chans.map((c) => [c.id, c.title]));
  const locked = isLocked(user.id), series = [...days.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  // Basic after the trial: the deposit COUNT stays, the money it made is a Pro detail.
  if (locked) { totals.ftd_locked = true; totals.revenue_cents = null; for (const d of series) delete d.revenue_cents; }
  return {
    totals, locked,
    series,
    channels: [...per.values()].map((p) => ({ ...p, title: titles.get(p.id) || 'Channel' })).sort((a, b) => b.clicks - a.clicks),
    counts: {
      channels: chans.filter((c) => c.status === 'active').length,
      channels_all: chans.length,
      bots: Q(`SELECT COUNT(*) n FROM bots WHERE owner_id=? AND status='active'`).get(user.id).n,
      pixels: Q(`SELECT COUNT(*) n FROM channels WHERE owner_id=? AND pixel_id IS NOT NULL AND pixel_id<>'' AND capi_token IS NOT NULL AND capi_token<>''`).get(user.id).n,
      tiktoks: Q(`SELECT COUNT(*) n FROM channels WHERE owner_id=? AND tt_pixel IS NOT NULL AND tt_pixel<>'' AND tt_token IS NOT NULL AND tt_token<>''`).get(user.id).n,
      snaps: Q(`SELECT COUNT(*) n FROM channels WHERE owner_id=? AND sc_pixel IS NOT NULL AND sc_pixel<>'' AND sc_token IS NOT NULL AND sc_token<>''`).get(user.id).n,
      has_conversions: !!Q(`SELECT 1 FROM conversions WHERE owner_id=? LIMIT 1`).get(user.id),
      has_clicks: !!Q(`SELECT 1 FROM hourly WHERE owner_id=? AND clicks>0 LIMIT 1`).get(user.id),
      has_spend: !!Q(`SELECT 1 FROM spend WHERE owner_id=? LIMIT 1`).get(user.id),
    },
  };
}

function joinsQuery(user, qs, limit, offset) {
  const { from, to, channel } = parseRange(qs);
  const args = [user.id, from, to]; let where = '';
  if (channel) { where += ' AND j.channel_id=?'; args.push(channel); }
  const type = qs.get('type');
  if (type === 'tracked') where += ' AND j.click_id IS NOT NULL';
  if (type === 'organic') where += ' AND j.click_id IS NULL';
  if (type === 'left') where += ' AND j.left_at IS NOT NULL';
  if (type === 'ftd') where += " AND EXISTS(SELECT 1 FROM conversions v WHERE v.join_id=j.id AND v.event='ftd')";
  if (type === 'filtered') where += ' AND j.suspect=1';
  const q = (qs.get('q') || '').trim().replace(/^@/, '');
  if (q) {
    const cc = /^c-[0-9a-z]+$/i.test(q) ? clickFromCode(q) : null;
    where += ` AND (j.username LIKE ? OR j.first_name LIKE ? OR j.last_name LIKE ? OR CAST(j.tg_user_id AS TEXT)=?${cc ? ' OR j.click_id=?' : ''})`;
    args.push(`%${q}%`, `%${q}%`, `%${q}%`, q, ...(cc ? [cc] : []));
  }
  const total = Q(`SELECT COUNT(*) n FROM joins j WHERE j.owner_id=? AND j.joined_at>=? AND j.joined_at<?${where}`).get(...args).n;
  const rows = Q(`SELECT j.*, ch.title AS channel_title, c.ts AS click_ts, c.country, c.fbclid, c.fbc, c.fbp, c.ttclid, c.sccid, c.ip, c.ua, c.params, c.page_url, lk.name AS link_name, lk.url AS link_url,
      (SELECT json_group_array(json_object('event',v.event,'value_cents',v.value_cents,'currency',v.currency,'at',v.created_at,'source',v.source)) FROM conversions v WHERE v.join_id=j.id) AS convs
    FROM joins j JOIN channels ch ON ch.id=j.channel_id LEFT JOIN clicks c ON c.id=j.click_id LEFT JOIN links lk ON lk.id=c.link_id
    WHERE j.owner_id=? AND j.joined_at>=? AND j.joined_at<?${where} ORDER BY j.joined_at DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  const locked = isLocked(user.id);
  return { total, locked, rows: rows.map((r) => { const convs = r.convs ? JSON.parse(r.convs) : [];
    return { ...r, suspect: r.suspect || 0, suspect_reason: r.suspect_reason || null, params: r.params ? JSON.parse(r.params) : {}, convs: locked ? convs.map((c) => ({ ...c, value_cents: null, locked: true })) : convs,
      click_code: clickCode(r.click_id), link_name: r.link_name || (r.click_id && r.link_url ? 'joinvoo' : null), match: r.click_id ? { fbc: !!r.fbc, fbp: !!r.fbp, ip: !!r.ip, ua: !!r.ua } : null }; }) };
}

/** Local calendar keys in the viewer's time zone (tz = minutes, like getTimezoneOffset). */
function periodKey(ts, tz, group) {
  const d = new Date(ts - tz * 60000);
  if (group === 'month') return d.toISOString().slice(0, 7);
  if (group === 'week') { // ISO week, e.g. 2026-W38
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dn = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - dn + 3);
    const y = t.getUTCFullYear(), w1 = new Date(Date.UTC(y, 0, 4));
    return `${y}-W${String(1 + Math.round(((t - w1) / 864e5 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`;
  }
  return d.toISOString().slice(0, 10);
}
const METRICS = ['clicks', 'joins', 'organic', 'leaves', 'reg', 'ftd', 'dep', 'sales', 'qualified', 'rejected', 'revenue_cents', 'suspect_clicks', 'spend_cents'];
/** Rates and costs from raw counts. Costs are null when there is no spend (or nothing to divide by): never a made-up number. */
const derivedMetrics = (x) => ({ join_rate: x.clicks ? x.joins / x.clicks : 0, ftd_rate: x.joins ? x.ftd / x.joins : 0,
  cost_per_join_cents: x.spend_cents && x.joins ? Math.round(x.spend_cents / x.joins) : null, cost_per_ftd_cents: x.spend_cents && x.ftd ? Math.round(x.spend_cents / x.ftd) : null,
  roas: x.spend_cents ? Math.round(x.revenue_cents / x.spend_cents * 100) / 100 : null });
/** Totals + series for one time range [from, to) grouped by day/week/month. */
function periodData(uid, from, to, tz, channel, group) {
  const series = new Map(); const get = (k) => { if (!series.has(k)) series.set(k, Object.fromEntries([['key', k], ...METRICS.map((m) => [m, 0])])); return series.get(k); };
  const ha = [uid, Math.floor(from / 3600000), Math.ceil(to / 3600000)]; if (channel) ha.push(channel);
  for (const r of Q(`SELECT hour, SUM(clicks) clicks, SUM(joins) joins, SUM(organic) organic, SUM(leaves) leaves, SUM(suspect) suspect FROM hourly WHERE owner_id=? AND hour>=? AND hour<?${channel ? ' AND channel_id=?' : ''} GROUP BY hour`).all(...ha)) {
    const s = get(periodKey(r.hour * 3600000, tz, group));
    s.clicks += r.clicks || 0; s.joins += r.joins || 0; s.organic += r.organic || 0; s.leaves += r.leaves || 0; s.suspect_clicks += r.suspect || 0;
  }
  const ca = [uid, from, to]; if (channel) ca.push(channel);
  for (const c of Q(`SELECT created_at, event, value_cents, COALESCE(rejected,0) rejected FROM conversions WHERE owner_id=? AND matched=1 AND created_at>=? AND created_at<?${channel ? ' AND channel_id=?' : ''}`).all(...ca)) {
    const s = get(periodKey(c.created_at, tz, group));
    const k = c.event === 'sale' ? 'sales' : c.event; if (k in s && k !== 'key') s[k]++;
    if (['ftd', 'dep', 'sale'].includes(c.event) && !c.rejected) s.revenue_cents += c.value_cents || 0;
  }
  if (!channel) for (const sp of Q(`SELECT date, SUM(amount_cents) n FROM spend WHERE owner_id=? AND date>=? AND date<? GROUP BY date`).all(uid, new Date(from - tz * 60000).toISOString().slice(0, 10), new Date(to - tz * 60000).toISOString().slice(0, 10))) {
    get(periodKey(Date.parse(sp.date + 'T12:00:00Z') + tz * 60000, tz, group)).spend_cents += sp.n;
  }
  const list = [...series.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  const totals = Object.fromEntries(METRICS.map((m) => [m, list.reduce((x, s) => x + s[m], 0)]));
  for (const x of [...list, totals]) Object.assign(x, derivedMetrics(x));
  return { from, to, totals, series: list };
}
/** A vs B: two date ranges side by side, with % change of A relative to B. */
function comparePeriods(user, qs) {
  const tz = Math.max(-840, Math.min(840, parseInt(qs.get('tz') || '0', 10) || 0));
  const day = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) + tz * 60000 : null; };
  const a0 = day(qs.get('a_from')), a1 = day(qs.get('a_to')), b0 = day(qs.get('b_from')), b1 = day(qs.get('b_to'));
  if ([a0, a1, b0, b1].some((x) => x == null)) return { error: 'Send a_from, a_to, b_from and b_to as YYYY-MM-DD.' };
  const group = ['day', 'week', 'month'].includes(qs.get('group')) ? qs.get('group') : 'day';
  const channel = parseInt(qs.get('channel') || '', 10) || null;
  const a = periodData(user.id, a0, a1 + 864e5, tz, channel, group), b = periodData(user.id, b0, b1 + 864e5, tz, channel, group);
  const delta = {};
  for (const m of [...METRICS, 'join_rate', 'ftd_rate', 'cost_per_join_cents', 'cost_per_ftd_cents', 'roas']) delta[m] = b.totals[m] ? Math.round((a.totals[m] - b.totals[m]) / b.totals[m] * 1000) / 10 : (a.totals[m] ? null : 0);
  if (isLocked(user.id)) { // the count of deposits stays; their money is a Pro detail
    for (const x of [a.totals, b.totals, ...a.series, ...b.series]) Object.assign(x, { revenue_cents: null, roas: null, cost_per_ftd_cents: null });
    Object.assign(delta, { revenue_cents: null, roas: null, cost_per_ftd_cents: null });
    return { group, a, b, delta, locked: true };
  }
  return { group, a, b, delta };
}
const usdShort = (c) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: Math.abs(c) >= 10000 ? 0 : 2, maximumFractionDigits: Math.abs(c) >= 10000 ? 0 : 2 });
/** How period B relates to period A, in words: "the week before", "yesterday", or the dates. */
function compareLabel(qs) {
  const d = (k) => Date.parse(qs.get(k) + 'T00:00:00Z');
  const la = (d('a_to') - d('a_from')) / 864e5 + 1, lb = (d('b_to') - d('b_from')) / 864e5 + 1, gap = (d('a_from') - d('b_to')) / 864e5;
  if (la === lb && gap === 1) {
    if (la === 1) return 'the day before';
    if (la === 7) return 'the week before';
    const a0 = new Date(d('a_from')), b0 = new Date(d('b_from'));
    if (a0.getUTCDate() === 1 && b0.getUTCDate() === 1) return 'the month before';
    return `the ${la} days before`;
  }
  return `${qs.get('b_from')} – ${qs.get('b_to')}`;
}
/** GET /api/compare/insights: A vs B in plain sentences plus the key numbers. Built only from the user's own data. */
function compareInsights(user, qs) {
  const q = new URLSearchParams(qs); q.set('group', 'day');
  const r = comparePeriods(user, q); if (r.error) return r;
  const A = r.a.totals, B = r.b.totals, locked = !!r.locked, vs = compareLabel(qs);
  const pct = (a, b) => (b ? Math.round((a - b) / b * 1000) / 10 : null);
  const highlights = [], sentences = [];
  const add = (metric, a, b, goodUp = true) => {
    if (a == null || b == null) return null;
    const d = pct(a, b); highlights.push({ metric, a, b, delta_pct: d, good: d == null ? (goodUp ? a >= b : a <= b) : (goodUp ? d >= 0 : d <= 0) }); return d;
  };
  const fd = add('ftd', A.ftd, B.ftd), jd = add('joins', A.joins, B.joins);
  add('ftd_rate', A.ftd_rate, B.ftd_rate);
  if (!locked) { add('revenue_cents', A.revenue_cents, B.revenue_cents); add('roas', A.roas, B.roas); }
  if (!locked) add('cost_per_ftd_cents', A.cost_per_ftd_cents, B.cost_per_ftd_cents, false);
  add('cost_per_join_cents', A.cost_per_join_cents, B.cost_per_join_cents, false);
  add('spend_cents', A.spend_cents, B.spend_cents, false);
  const word = (d) => (d >= 0 ? 'up' : 'down');
  if (!A.joins && !B.joins && !A.ftd && !B.ftd) return { sentences: ['No tracked joins in either period yet, so there is nothing to compare.'], highlights, locked };
  if (fd != null && Math.abs(fd) >= 0.5) sentences.push(`FTDs ${word(fd)} ${Math.abs(Math.round(fd))}% vs ${vs} (${$num(A.ftd)} vs ${$num(B.ftd)}).`);
  else if (fd == null && A.ftd) sentences.push(`${$num(A.ftd)} FTDs, up from none in ${vs}.`);
  else if (A.ftd || B.ftd) sentences.push(`FTDs level with ${vs} (${$num(A.ftd)}).`);
  if (jd != null && Math.abs(jd) >= 0.5) sentences.push(`Joins ${word(jd)} ${Math.abs(Math.round(jd))}% (${$num(A.joins)} vs ${$num(B.joins)}).`);
  else if (jd == null && A.joins) sentences.push(`${$num(A.joins)} joins, up from none.`);
  // Which campaign moved the most (by FTDs when there are any, else by joins). Hidden on Basic after the trial.
  if (!locked) {
    const by = (from, to) => { const x = new URLSearchParams({ from, to, tz: qs.get('tz') || '0', dim: 'campaign' }); if (qs.get('channel')) x.set('channel', qs.get('channel')); return new Map(breakdown(user, x).rows.map((row) => [row.key, row])); };
    const ra = by(qs.get('a_from'), qs.get('a_to')), rb = by(qs.get('b_from'), qs.get('b_to'));
    const metric = A.ftd || B.ftd ? 'ftd' : 'joins', total = A[metric] - B[metric];
    if (total) {
      let best = null;
      for (const k of new Set([...ra.keys(), ...rb.keys()])) { const dl = ((ra.get(k) || {})[metric] || 0) - ((rb.get(k) || {})[metric] || 0); if (Math.sign(dl) === Math.sign(total) && (!best || Math.abs(dl) > Math.abs(best.d))) best = { k, d: dl }; }
      if (best && Math.abs(best.d) >= Math.abs(total) / 2 && !/^\(no /.test(best.k)) sentences.push(`${best.k} drove most of it (${best.d > 0 ? '+' : ''}${$num(best.d)} ${metric === 'ftd' ? 'FTDs' : 'joins'}).`);
    }
    if (A.cost_per_ftd_cents != null && B.cost_per_ftd_cents != null && A.cost_per_ftd_cents !== B.cost_per_ftd_cents) sentences.push(`Cost per FTD ${A.cost_per_ftd_cents < B.cost_per_ftd_cents ? 'down' : 'up'} from ${usdShort(B.cost_per_ftd_cents)} to ${usdShort(A.cost_per_ftd_cents)}.`);
    if (A.roas != null && B.roas != null && A.roas !== B.roas) sentences.push(`ROAS ${A.roas.toFixed(2)}× vs ${B.roas.toFixed(2)}×.`);
  } else if (A.ftd) sentences.push('Upgrade to Pro to see which campaigns drove these deposits.');
  if (!A.spend_cents && !B.spend_cents) sentences.push('Add your ad spend to see cost per FTD and ROAS here.');
  return { sentences, highlights, locked };
}
/** Monday of the week (YYYY-MM-DD) or the day itself, in the viewer's clock. */
const seriesKey = (ts, tz, group) => { const d = new Date(ts - tz * 60000); if (group === 'week') d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
/** GET /api/compare/campaigns?names=a,b,c&from&to&group=day|week → joins, FTDs and spend per campaign over time. */
function compareCampaigns(user, qs) {
  const names = [...new Set(String(qs.get('names') || '').split(',').map((x) => x.trim().slice(0, 120)).filter(Boolean))].slice(0, 5);
  const group = qs.get('group') === 'week' ? 'week' : 'day';
  const { tz, from, to, channel } = parseRange(qs);
  if (!names.length) return { group, series: {} };
  const out = {}; const keys = [];
  for (let t = from; t < to; t += 864e5) { const k = seriesKey(t + 1, tz, group); if (!keys.includes(k)) keys.push(k); }
  for (const n of names) out[n] = new Map(keys.map((k) => [k, { key: k, joins: 0, ftd: 0, spend_cents: 0 }]));
  const ph = names.map(() => '?').join(','), camp = "COALESCE(json_extract(c.params,'$.utm_campaign'),'(no campaign tag)')";
  const cargs = [user.id, from, to, ...names]; if (channel) cargs.push(channel);
  for (const r of Q(`SELECT c.ts, ${camp} k FROM clicks c LEFT JOIN joins j ON j.id=(SELECT id FROM joins WHERE click_id=c.id ORDER BY id LIMIT 1)
      WHERE c.owner_id=? AND c.ts>=? AND c.ts<? AND c.joined=1 AND COALESCE(j.suspect,0)=0 AND ${camp} IN (${ph})${channel ? ' AND c.channel_id=?' : ''}`).all(...cargs)) {
    const row = out[r.k] && out[r.k].get(seriesKey(r.ts, tz, group)); if (row) row.joins++;
  }
  for (const r of Q(`SELECT v.created_at, ${camp} k FROM conversions v JOIN joins j ON j.id=v.join_id JOIN clicks c ON c.id=j.click_id
      WHERE v.owner_id=? AND v.created_at>=? AND v.created_at<? AND v.event='ftd' AND COALESCE(v.rejected,0)=0 AND ${camp} IN (${ph})${channel ? ' AND v.channel_id=?' : ''}`).all(...cargs)) {
    const row = out[r.k] && out[r.k].get(seriesKey(r.created_at, tz, group)); if (row) row.ftd++;
  }
  if (!channel) {
    const d0 = new Date(from - tz * 60000).toISOString().slice(0, 10), d1 = new Date(to - tz * 60000 - 1).toISOString().slice(0, 10);
    for (const r of Q(`SELECT date, campaign k, SUM(amount_cents) n FROM spend WHERE owner_id=? AND date>=? AND date<=? AND campaign IN (${ph}) GROUP BY date, campaign`).all(user.id, d0, d1, ...names)) {
      const row = out[r.k] && out[r.k].get(seriesKey(Date.parse(r.date + 'T12:00:00Z') + tz * 60000, tz, group)); if (row) row.spend_cents += r.n;
    }
  }
  const locked = isLocked(user.id), series = {};
  for (const n of names) series[n] = [...out[n].values()].map((x) => (locked ? { ...x, ftd: null, locked: true } : x));
  return { group, series, locked };
}
/** Month-by-month (or week/day) results for the comparison chart, in the viewer's time zone. */
function compare(user, qs) {
  const tz = Math.max(-840, Math.min(840, parseInt(qs.get('tz') || '0', 10) || 0));
  const group = ['day', 'week'].includes(qs.get('group')) ? qs.get('group') : 'month';
  const n = Math.max(2, Math.min(group === 'day' ? 90 : group === 'week' ? 52 : 24, parseInt(qs.get(group === 'month' ? 'months' : 'periods') || qs.get('periods') || '6', 10) || 6));
  const channel = parseInt(qs.get('channel') || '', 10) || null;
  const d = new Date(Date.now() - tz * 60000); // "now" in the viewer's clock
  const buckets = [];
  for (let i = n - 1; i >= 0; i--) {
    let start, end, key, daysIn;
    if (group === 'month') { const y = d.getUTCFullYear(), m = d.getUTCMonth() - i; start = Date.UTC(y, m, 1); end = Date.UTC(y, m + 1, 1); key = new Date(start).toISOString().slice(0, 7); daysIn = i === 0 ? d.getUTCDate() : new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
    else if (group === 'week') { const t0 = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * 864e5; start = t0 - i * 7 * 864e5; end = start + 7 * 864e5; key = periodKey(start + tz * 60000, tz, 'week'); daysIn = i === 0 ? ((d.getUTCDay() + 6) % 7) + 1 : 7; }
    else { start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - i * 864e5; end = start + 864e5; key = new Date(start).toISOString().slice(0, 10); daysIn = 1; }
    const p = periodData(user.id, start + tz * 60000, end + tz * 60000, tz, channel, group).totals;
    buckets.push({ key, month: group === 'month' ? key : undefined, partial: i === 0, days_in: daysIn, clicks: p.clicks, joins: p.joins, organic: p.organic, leaves: p.leaves,
      sent: sentIn(user.id, start + tz * 60000, end + tz * 60000, channel), ftd: p.ftd, reg: p.reg, sales: p.sales, qualified: p.qualified, rejected: p.rejected, revenue_cents: p.revenue_cents,
      spend_cents: p.spend_cents, suspect_clicks: p.suspect_clicks, join_rate: p.join_rate, ftd_rate: p.ftd_rate });
  }
  return group === 'month' ? { group, months: buckets } : { group, periods: buckets };
}
const sentIn = (uid, from, to, channel) => { const a = [uid, Math.floor(from / 3600000), Math.floor(to / 3600000)]; if (channel) a.push(channel);
  return Q(`SELECT COALESCE(SUM(capi_ok),0)+COALESCE(SUM(tt_ok),0)+COALESCE(SUM(sc_ok),0) n FROM hourly WHERE owner_id=? AND hour>=? AND hour<?${channel ? ' AND channel_id=?' : ''}`).get(...a).n; };
const DIMS = {
  campaign: "COALESCE(json_extract(c.params,'$.utm_campaign'),'(no campaign tag)')",
  adset: "COALESCE(json_extract(c.params,'$.adset'),json_extract(c.params,'$.utm_term'),json_extract(c.params,'$.utm_adset'),'(no ad set tag)')",
  ad: "COALESCE(json_extract(c.params,'$.utm_content'),'(no ad tag)')",
  lang: "COALESCE(NULLIF(lower(substr(j.lang,1,2)),''),'unknown')",
  source: "COALESCE(json_extract(c.params,'$.utm_source'),'(no source tag)')",
  country: "COALESCE(c.country,'Unknown')",
  platform: "CASE WHEN c.fbclid<>'' THEN 'Meta' WHEN c.ttclid<>'' THEN 'TikTok' WHEN c.sccid<>'' THEN 'Snapchat' ELSE 'Other / direct' END",
  channel: 'ch.title',
};
const SPEND_PLATFORM = { meta: 'Meta', tiktok: 'TikTok', snap: 'Snapchat', other: 'Other / direct' };
/** Basic after the trial: rows keep joins and spend, but which ad drove deposits (and their money) is a Pro detail. */
function lockRows(rows) { for (const r of rows) Object.assign(r, { ftd: null, reg: null, sales: null, revenue_cents: null, roas: null, cost_per_ftd_cents: null, locked: true }); return rows; }
/** Which campaigns, ads, sources and countries bring joins, depositors and sales — and, with ad spend entered, what each costs. */
function breakdown(user, qs) {
  const { from, to, channel } = parseRange(qs);
  const dim = DIMS[qs.get('dim')] ? qs.get('dim') : 'campaign';
  const args = [user.id, from, to]; if (channel) args.push(channel);
  const rows = Q(`SELECT ${DIMS[dim]} AS k, COUNT(*) clicks, SUM(CASE WHEN c.joined=1 AND COALESCE(j.suspect,0)=0 THEN 1 ELSE 0 END) joins, COALESCE(SUM(c.suspect),0) suspect_clicks, COALESCE(SUM(j.suspect),0) filtered_joins, COALESCE(SUM(v.ftd),0) ftd, COALESCE(SUM(v.reg),0) reg, COALESCE(SUM(v.sales),0) sales,
      COALESCE(SUM(v.rev),0) revenue_cents, SUM(CASE WHEN j.left_at IS NOT NULL THEN 1 ELSE 0 END) leaves
    FROM clicks c JOIN channels ch ON ch.id=c.channel_id
    LEFT JOIN joins j ON j.id=(SELECT id FROM joins WHERE click_id=c.id ORDER BY id LIMIT 1)
    LEFT JOIN (SELECT join_id, SUM(event='ftd') ftd, SUM(event='reg') reg, SUM(event='sale') sales, SUM(${REVENUE_SQL}) rev
      FROM conversions WHERE owner_id=? AND join_id IS NOT NULL GROUP BY join_id) v ON v.join_id=j.id
    WHERE c.owner_id=? AND c.ts>=? AND c.ts<?${channel ? ' AND c.channel_id=?' : ''}${dim === 'lang' ? ' AND c.joined=1' : ''} GROUP BY k ORDER BY joins DESC, clicks DESC LIMIT 100`).all(user.id, ...args)
    .map((r) => ({ ...r, key: String(r.k), join_rate: r.clicks ? r.joins / r.clicks : 0 }));
  if ((dim === 'campaign' || dim === 'platform') && !channel) {
    const [d0, d1] = rangeDays(qs);
    const sp = Q(`SELECT ${dim === 'campaign' ? 'campaign' : 'platform'} AS k, SUM(amount_cents) n FROM spend WHERE owner_id=? AND date>=? AND date<=? GROUP BY k`).all(user.id, d0, d1);
    const byKey = new Map(); for (const s of sp) { const k = dim === 'platform' ? SPEND_PLATFORM[s.k] || 'Other / direct' : s.k || '(no campaign tag)'; byKey.set(k, (byKey.get(k) || 0) + s.n); }
    for (const [k] of byKey) if (!rows.some((r) => r.key === k)) rows.push({ k, key: k, clicks: 0, joins: 0, suspect_clicks: 0, ftd: 0, reg: 0, sales: 0, revenue_cents: 0, leaves: 0, join_rate: 0 });
    for (const r of rows) { const s = byKey.get(r.key) || 0; r.spend_cents = s; r.cost_per_join_cents = s && r.joins ? Math.round(s / r.joins) : null; r.cost_per_ftd_cents = s && r.ftd ? Math.round(s / r.ftd) : null; r.roas = s ? Math.round(r.revenue_cents / s * 100) / 100 : null; }
  }
  const locked = isLocked(user.id);
  if (locked) lockRows(rows);
  return { dim, rows, locked };
}
/** Funnel: clicks → joins → sign-ups → first deposits → repeat deposits, optionally for one value of a dimension (A) vs another (B). */
function funnel(user, qs) {
  const { from, to, channel } = parseRange(qs);
  const dim = DIMS[qs.get('dim')] ? qs.get('dim') : null;
  const one = (val) => {
    const a = [user.id, user.id, from, to]; let w = '';
    if (channel) { w += ' AND c.channel_id=?'; a.push(channel); }
    if (dim && val != null && val !== '') { w += ` AND ${DIMS[dim]}=?`; a.push(val); }
    const r = Q(`SELECT COUNT(*) clicks, COALESCE(SUM(CASE WHEN c.joined=1 AND COALESCE(j.suspect,0)=0 THEN 1 ELSE 0 END),0) joins, COALESCE(SUM(c.suspect),0) suspect_clicks, COALESCE(SUM(v.reg>0),0) reg, COALESCE(SUM(v.ftd>0),0) ftd, COALESCE(SUM(v.dep>0),0) dep, COALESCE(SUM(v.sales>0),0) sales, COALESCE(SUM(v.rev),0) revenue_cents
      FROM clicks c JOIN channels ch ON ch.id=c.channel_id LEFT JOIN joins j ON j.id=(SELECT id FROM joins WHERE click_id=c.id ORDER BY id LIMIT 1)
      LEFT JOIN (SELECT join_id, SUM(event='reg') reg, SUM(event='ftd' AND COALESCE(rejected,0)=0) ftd, SUM(event='dep' AND COALESCE(rejected,0)=0) dep, SUM(event='sale' AND COALESCE(rejected,0)=0) sales, SUM(${REVENUE_SQL}) rev
        FROM conversions WHERE owner_id=? AND join_id IS NOT NULL GROUP BY join_id) v ON v.join_id=j.id
      WHERE c.owner_id=? AND c.ts>=? AND c.ts<?${w}`).get(...a);
    const { revenue_cents, suspect_clicks, ...counts } = r;
    const rates = { join_rate: counts.clicks ? counts.joins / counts.clicks : 0, reg_rate: counts.joins ? counts.reg / counts.joins : 0, ftd_rate: counts.joins ? counts.ftd / counts.joins : 0, dep_rate: counts.ftd ? counts.dep / counts.ftd : 0 };
    return { label: dim && val ? String(val) : 'All', counts, rates, revenue_cents, suspect_clicks };
  };
  const out = { steps: ['clicks', 'joins', 'reg', 'ftd', 'dep'], dim: dim || 'none', a: one(qs.get('a')) };
  if (qs.get('b') != null && dim) out.b = one(qs.get('b'));
  return out;
}
/** Weekly cohorts: of the people who joined in a week, how many made a first deposit within 1, 7 and 30 days. */
function cohorts(user, qs) {
  const tz = Math.max(-840, Math.min(840, parseInt(qs.get('tz') || '0', 10) || 0));
  const weeks = Math.max(1, Math.min(26, parseInt(qs.get('weeks') || '8', 10) || 8));
  const channel = parseInt(qs.get('channel') || '', 10) || null;
  const since = Date.now() - weeks * 7 * 864e5 - 7 * 864e5;
  const a = [user.id, since]; if (channel) a.push(channel);
  const map = new Map();
  for (const r of Q(`SELECT j.joined_at, (SELECT MIN(created_at) FROM conversions v WHERE v.join_id=j.id AND v.event='ftd' AND COALESCE(v.rejected,0)=0) ftd_at
      FROM joins j WHERE j.owner_id=? AND j.joined_at>=?${channel ? ' AND j.channel_id=?' : ''}`).all(...a)) {
    const k = periodKey(r.joined_at, tz, 'week');
    const c = map.get(k) || { cohort: k, joins: 0, ftd_d1: 0, ftd_d7: 0, ftd_d30: 0 }; map.set(k, c);
    c.joins++;
    if (r.ftd_at != null) { const dt = r.ftd_at - r.joined_at; if (dt <= 864e5) c.ftd_d1++; if (dt <= 7 * 864e5) c.ftd_d7++; if (dt <= 30 * 864e5) c.ftd_d30++; }
  }
  const rows = [...map.values()].sort((x, y) => (x.cohort < y.cohort ? 1 : -1)).slice(0, weeks)
    .map((c) => ({ ...c, rate_d1: c.joins ? c.ftd_d1 / c.joins : 0, rate_d7: c.joins ? c.ftd_d7 / c.joins : 0, rate_d30: c.joins ? c.ftd_d30 / c.joins : 0 }));
  return { rows };
}
function conversionsView(user, qs) {
  const limit = Math.min(200, +qs.get('limit') || 50);
  // Basic after the trial: deposits are still matched and sent to the ad platforms; only the list of who/which ad is hidden.
  if (isLocked(user.id)) return { postback_url: `${BASE_URL}/pb/${pbKey(user.id)}`, locked: true, rows: [],
    locked_count: Q(`SELECT COUNT(*) n FROM conversions WHERE owner_id=? AND matched=1 AND event IN ('ftd','dep','sale')`).get(user.id).n };
  return {
    postback_url: `${BASE_URL}/pb/${pbKey(user.id)}`,
    rows: Q(`SELECT v.id, v.event, v.value_cents, v.currency, v.txid, v.source, v.matched, v.created_at, v.meta_status, v.tt_status, v.sc_status, v.error, v.tg_user_id,
        COALESCE(v.rejected,0) AS rejected, v.network, j.first_name, j.last_name, j.username, j.click_id, ch.title AS channel_title FROM conversions v LEFT JOIN joins j ON j.id=v.join_id LEFT JOIN channels ch ON ch.id=v.channel_id
      WHERE v.owner_id=? ORDER BY v.id DESC LIMIT ?`).all(user.id, limit),
  };
}

// ---------- plan limits (channels + bots) ----------
const cnt = (sql, ...a) => Object.values(Q(sql).get(...a) || { n: 0 })[0] || 0;
/** Limits for one user. max null = unlimited. Limits only apply when ADDING: nothing a customer already has is ever taken away. */
function limitsFor(uid) {
  const u = Q(`SELECT id, email, verified_at FROM users WHERE id=?`).get(uid);
  const plan = userPlan(uid), L = setting('limits') || {};
  const proish = !BILLING || (u && isAdmin(u)) || plan === 'pro' || trialInfo(uid).status === 'active';
  const lim = (proish ? L.pro : L.basic) || {}, mx = (v) => (Number(v) > 0 ? Number(v) : null);
  const used = { channels: cnt(`SELECT COUNT(*) FROM channels WHERE owner_id=? AND status<>'removed' AND COALESCE(locked,0)=0`, uid), bots: cnt(`SELECT COUNT(*) FROM bots WHERE owner_id=? AND status='active'`, uid) };
  const P = plansDef();
  return { plan: proish ? 'pro' : 'basic', plan_name: proish ? P.pro.name : P.basic.name, unlimited: !mx(lim.channels) && !mx(lim.bots),
    channels: { used: used.channels, max: mx(lim.channels) }, bots: { used: used.bots, max: mx(lim.bots) },
    pro_price_usd: Math.round((P.pro.base_cents || 0) / 100), basic_price_usd: Math.round((P.basic.base_cents || 0) / 100) };
}
/** null when there is room; otherwise the 402 body. */
function limitHit(uid, kind) {
  const L = limitsFor(uid), x = L[kind];
  if (!x.max || x.used < x.max) return null;
  const what = kind === 'bots' ? (x.max === 1 ? 'bot' : 'bots') : (x.max === 1 ? 'channel' : 'channels');
  return { error: `You’ve used ${x.used} of ${x.max} ${what} on ${L.plan_name}. Upgrade to Pro for unlimited channels and bots, or remove one to make room.`,
    limit: { kind, used: x.used, max: x.max, plan: L.plan } };
}
/** Locked channels (added over the limit) start tracking by themselves once there is room again. */
function unlockChannels(uid) {
  const locked = Q(`SELECT id FROM channels WHERE owner_id=? AND COALESCE(locked,0)=1 AND status<>'removed' ORDER BY id`).all(uid);
  if (!locked.length) return;
  let moved = 0;
  for (const c of locked) { if (limitHit(uid, 'channels')) break; Q(`UPDATE channels SET locked=0 WHERE id=?`).run(c.id); moved++; }
  if (moved) { log('channels unlocked', uid, moved); setImmediate(() => fillPools()); }
}

function channelsView(user) {
  unlockChannels(user.id);
  const bots = Q(`SELECT b.id, b.tg_id, b.username, b.status, b.created_at, b.prev_webhook, b.health,
      (SELECT COUNT(DISTINCT c.id) FROM channels c LEFT JOIN channel_bots cb ON cb.channel_id=c.id WHERE c.owner_id=b.owner_id AND c.status<>'removed' AND (cb.bot_id=b.id OR c.bot_id=b.id)) AS channels
    FROM bots b WHERE b.owner_id=? AND b.status<>'deleted' ORDER BY b.id`).all(user.id);
  const channels = Q(`SELECT c.*, (SELECT COUNT(*) FROM links l WHERE l.channel_id=c.id AND l.status='pool') AS pool,
      (SELECT group_concat(b.username) FROM channel_bots cb JOIN bots b ON b.id=cb.bot_id WHERE cb.channel_id=c.id AND b.status='active') AS bot_names
    FROM channels c WHERE c.owner_id=? AND NOT (c.status='removed' AND COALESCE(c.removed_by_user,0)=1) ORDER BY c.id`).all(user.id);
  return {
    bots, limits: limitsFor(user.id),
    channels: channels.map((c) => ({
      id: c.id, title: c.title, type: c.type, username: c.username, status: c.status, locked: !!c.locked && c.status !== 'removed', pool: c.pool, pool_target: POOL_SIZE,
      bots: c.bot_names ? c.bot_names.split(',') : (c.type === 'bot' && c.username ? [c.username] : []), tracking_url: `${linkBase()}/c/${c.slug}`,
      welcome: c.welcome || '', btn_text: c.btn_text || '', btn_url: c.btn_url || '', forward_url: c.forward_url || '', has_forward_secret: !!c.forward_secret,
      external: !!c.ext, hook_start: c.ext ? `${BASE_URL}/hook/${pbKey(user.id)}/start` : '', hook_blocked: c.ext ? `${BASE_URL}/hook/${pbKey(user.id)}/blocked` : '',
      pixel_id: c.pixel_id || '', has_token: !!c.capi_token, test_code: c.test_code || '', event_name: c.event_name || 'Subscribe',
      tt_pixel: c.tt_pixel || '', tt_has_token: !!c.tt_token, tt_test_code: c.tt_test_code || '', tt_event: c.tt_event || 'Subscribe',
      sc_pixel: c.sc_pixel || '', sc_has_token: !!c.sc_token, sc_test: !!c.sc_test, sc_event: c.sc_event || 'SUBSCRIBE',
      has_fallback: !!c.fallback_link, landing: c.landing || 'auto',
      join_mode: c.join_mode || 'link', offer_text: c.offer_text || '', offer_btn: c.offer_btn || '', offer_url: c.offer_url || '',
      redirect_to: c.redirect_to || null, redirect_title: c.redirect_to ? (channels.find((x) => x.id === c.redirect_to) || {}).title || null : null,
    })),
  };
}

async function connectBot(user, token) {
  token = String(token || '').trim();
  if (!/^\d{5,15}:[A-Za-z0-9_-]{30,}$/.test(token)) return { error: 'That doesn’t look like a bot token. Copy the full token BotFather sent you, like 123456789:AAH…' };
  const me = await tg(token, 'getMe');
  if (!me.ok) return { error: me.error_code === 401 ? 'Telegram rejected this token. Check you copied all of it, or ask BotFather for a new one with /token.' : 'Could not reach Telegram: ' + (me.description || 'unknown error') };
  const other = Q(`SELECT owner_id FROM bots WHERE tg_id=? AND status<>'deleted' AND owner_id<>?`).get(me.result.id, user.id);
  if (other) return { error: 'This bot is already connected to another Joinvoo account.' };
  let bot = Q(`SELECT * FROM bots WHERE tg_id=? AND owner_id=?`).get(me.result.id, user.id);
  if (!bot || bot.status === 'deleted') { const lh = limitHit(user.id, 'bots'); if (lh) return lh; } // a bot they still have (even with a revoked token) is never blocked
  const secret = rid(24);
  if (bot) Q(`UPDATE bots SET token=?, secret=?, username=?, status='active', cooldown_until=0 WHERE id=?`).run(token, secret, me.result.username, bot.id);
  else Q(`INSERT INTO bots(owner_id,tg_id,username,token,secret,created_at) VALUES(?,?,?,?,?,?)`).run(user.id, me.result.id, me.result.username, token, secret, now());
  bot = Q(`SELECT * FROM bots WHERE tg_id=? AND owner_id=?`).get(me.result.id, user.id);
  // Is this bot already in use somewhere else? A bot can only send its updates to one place.
  const info = await tg(token, 'getWebhookInfo');
  const prev = info.ok && info.result.url && !info.result.url.startsWith(BASE_URL) ? info.result.url : '';
  if (prev) Q(`UPDATE bots SET prev_webhook=? WHERE id=?`).run(prev, bot.id);
  const wh = await tg(token, 'setWebhook', {
    url: `${BASE_URL}/tg/${bot.id}`, secret_token: secret, max_connections: 40, drop_pending_updates: !prev,
    allowed_updates: TG_UPDATES,
  });
  if (!wh.ok) {
    Q(`UPDATE bots SET status='deleted' WHERE id=?`).run(bot.id);
    return { error: 'Telegram would not accept our webhook: ' + (wh.description || '') + (SECURE ? '' : ' (BASE_URL must be a public https address)') };
  }
  for (const r of Q(`SELECT channel_id FROM channel_bots WHERE bot_id=?`).all(bot.id)) recomputeChannel(r.channel_id);
  { // channels that came back because the customer reconnected a bot they had disconnected: they count as new, so the plan limit applies again
    const back = Q(`SELECT id FROM channels WHERE owner_id=? AND COALESCE(removed_by_user,0)=1 AND status<>'removed' ORDER BY id`).all(user.id);
    if (back.length) { Q(`UPDATE channels SET locked=1, removed_by_user=0 WHERE id IN (${back.map(() => '?').join(',')})`).run(...back.map((x) => x.id)); unlockChannels(user.id); }
  }
  log('bot connected', me.result.username, 'owner', user.id, prev ? 'replaced webhook ' + prev : '');
  return { ok: true, bot: { id: bot.id, username: bot.username || me.result.username }, previous_webhook: prev,
    warning: prev ? `This bot was already connected to another server (${prev}). A bot can only talk to one server. To track its subscribers, keep that address in “My bot already runs on its own server” so it keeps working. For a channel or group, use a new bot made just for Joinvoo.` : '' };
}

async function addChannelManually(user, body) {
  const bot = Q(`SELECT * FROM bots WHERE id=? AND owner_id=? AND status='active'`).get(+body.bot_id, user.id);
  if (!bot) return { error: 'Pick one of your connected bots first.' };
  let chat = String(body.chat || '').trim().replace(/^https?:\/\/t\.me\//, '');
  if (!chat) return { error: 'Enter the channel @username or ID.' };
  if (/^[A-Za-z]\w{3,}$/.test(chat)) chat = '@' + chat;
  const c = await tg(bot.token, 'getChat', { chat_id: chat });
  if (!c.ok) return { error: 'Telegram can’t find that channel for @' + bot.username + '. Make sure the bot is an admin there.' };
  { const ex = Q(`SELECT status FROM channels WHERE owner_id=? AND chat_id=?`).get(user.id, c.result.id); if (!ex || ex.status === 'removed') { const lh = limitHit(user.id, 'channels'); if (lh) return lh; } }
  const m = await tg(bot.token, 'getChatMember', { chat_id: c.result.id, user_id: bot.tg_id });
  if (!m.ok || !['administrator', 'creator'].includes(m.result.status)) return { error: '@' + bot.username + ' is not an admin in that channel yet.' };
  const ch = attachBot(bot, c.result, m.result);
  fillPools();
  return { ok: true, channel: ch && ch.id };
}

async function testTikTok(ch) {
  if (!ch.tt_pixel || !ch.tt_token) return { error: 'Add your TikTok pixel code and access token first.' };
  try {
    const res = await postTikTok(ch, [{ event: ch.tt_event || 'Subscribe', event_time: Math.floor(now() / 1000), event_id: 'joinvoo_test_' + rid(6),
      user: { external_id: sha256('joinvoo-test'), ip: '102.89.0.1', user_agent: 'Joinvoo test' }, page: { url: `${linkBase()}/c/${ch.slug}` } }]);
    if (!res.ok) return { error: 'TikTok said: ' + res.err };
    return { ok: true, message: ch.tt_test_code ? 'TikTok received it. Check Test Events in TikTok Events Manager.' : 'TikTok received it.' };
  } catch (e) { return { error: 'Could not reach TikTok: ' + e.message }; }
}

async function testSnap(ch) {
  if (!ch.sc_pixel || !ch.sc_token) return { error: 'Add your Snap Pixel ID and Conversions API token first.' };
  try {
    const res = await postSnap({ ...ch, sc_test: 1 }, [{ event_name: ch.sc_event || 'SUBSCRIBE', event_time: now(), event_id: 'joinvoo_test_' + rid(6), action_source: 'WEB',
      event_source_url: `${linkBase()}/c/${ch.slug}`, user_data: { external_id: [sha256('joinvoo-test')], client_ip_address: '102.89.0.1', client_user_agent: 'Joinvoo test' } }]);
    if (!res.ok) return { error: 'Snapchat said: ' + res.err };
    return { ok: true, message: 'Snapchat accepted the test event (validation mode). Check Events Manager → Test events.' };
  } catch (e) { return { error: 'Could not reach Snapchat: ' + e.message }; }
}
async function testCapi(ch) {
  if (!ch.pixel_id || !ch.capi_token) return { error: 'Add your Pixel ID and access token first.' };
  const body = {
    data: [{ event_name: ch.event_name || 'Subscribe', event_time: Math.floor(now() / 1000), event_id: 'jp_test_' + rid(6),
      action_source: 'website', event_source_url: `${linkBase()}/c/${ch.slug}`,
      user_data: { external_id: [sha256('joinvoo-test')], client_ip_address: '102.89.0.1', client_user_agent: 'Joinvoo test' } }],
    access_token: ch.capi_token,
  };
  if (ch.test_code) body.test_event_code = ch.test_code;
  try {
    const r = await fetch(`${GRAPH_API}/${GRAPH_VERSION}/${ch.pixel_id}/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    if (j.error) return { error: 'Meta said: ' + (j.error.error_user_msg || j.error.message) };
    return { ok: true, message: ch.test_code ? 'Meta received it. Check the Test Events tab in Events Manager.' : 'Meta received it. Add a test code to see it in Test Events.' };
  } catch (e) { return { error: 'Could not reach Meta: ' + e.message }; }
}

// ---------- profile (Joomoji, nickname, language, time zone) ----------
const AVATAR_PARTS = { skin: 5, hair: 9, hairColor: 6, eyes: 3, brows: 2, mouth: 3, outfit: 5, outfitColor: 6, acc: 5, bg: 7 };
/** Validate a Joomoji avatar: known keys only, small whole numbers, ≤ 400 bytes. strict=false (sign-up) repairs instead of refusing. */
function cleanAvatar(a, strict = true) {
  if (a == null || a === '') return { value: null };
  if (typeof a === 'string') { if (a.length > 400) return { error: 'That avatar is too big.' }; try { a = JSON.parse(a); } catch { return { error: 'That avatar isn’t valid.' }; } }
  if (typeof a !== 'object' || Array.isArray(a)) return { error: 'That avatar isn’t valid.' };
  if (JSON.stringify(a).length > 400) return { error: 'That avatar is too big.' };
  const out = { v: 1, g: ['f', 'm', 'o'].includes(a.g) ? a.g : 'o' };
  for (const k of Object.keys(a)) if (!['v', 'g', ...Object.keys(AVATAR_PARTS)].includes(k) && strict) return { error: `Unknown avatar part “${String(k).slice(0, 20)}”.` };
  if (strict && a.g !== undefined && !['f', 'm', 'o'].includes(a.g)) return { error: 'Avatar style must be f, m or o.' };
  for (const [k, max] of Object.entries(AVATAR_PARTS)) {
    const n = a[k] === undefined ? 0 : Number(a[k]);
    if (!Number.isInteger(n) || n < 0 || n > max) { if (strict) return { error: `Avatar ${k} must be a whole number from 0 to ${max}.` }; out[k] = 0; } else out[k] = n;
  }
  return { value: JSON.stringify(out) };
}
const NICK_RE = /^[\p{L}\p{N} _.\-]{2,24}$/u;
/** Validate the editable profile fields of PATCH /api/me (and sign-up). Returns {set:{col:value}} or {error}. */
function profileChanges(b, strict = true) {
  const set = {};
  if (b.nickname !== undefined) { const n = String(b.nickname ?? '').trim().replace(/\s+/g, ' '); if (n && !NICK_RE.test(n)) return { error: 'Nicknames are 2–24 letters, numbers, spaces, _ - or .' }; set.nickname = n || null; }
  if (b.gender !== undefined) { if (b.gender !== null && !['female', 'male', 'other'].includes(b.gender)) { if (strict) return { error: 'Gender is female, male or other.' }; } else set.gender = b.gender; }
  if (b.avatar !== undefined) { const a = cleanAvatar(b.avatar, strict); if (a.error) { if (strict) return a; } else set.avatar = a.value; }
  if (b.lang !== undefined) { if (!LANGS.includes(b.lang)) { if (strict) return { error: 'Language is en, ru, fr, pt or es.' }; } else set.lang = b.lang; }
  if (b.tz !== undefined) { const z = String(b.tz ?? '').trim().slice(0, 64); if (z && !validTz(z)) { if (strict) return { error: 'Unknown time zone.' }; } else set.tz = z || null; }
  if (b.ad_account_id !== undefined) { const id = String(b.ad_account_id ?? '').trim().replace(/^act_/i, ''); if (id && !/^\d{5,20}$/.test(id)) return { error: 'The ad account ID is numbers only, like act_1234567890.' }; set.ad_account_id = id || null; }
  if (b.show_level !== undefined) set.show_level = bool(b.show_level) || b.show_level === true ? 1 : 0;
  return { set };
}
/** A real first name (nickname or the first word of the name), or '' — never the email. */
const firstName = (u) => String((u && (u.nickname || String(u.name || '').trim().split(/\s+/)[0])) || '').trim().slice(0, 30);
const displayName = (u) => (u.nickname || String(u.name || '').trim().split(/\s+/)[0] || String(u.email || '').split('@')[0] || 'there');

// ---------- levels: leads (ad-attributed joins + bot Starts, fake joins excluded) in the rolling last 30 days ----------
const leads30 = (uid) => Q(`SELECT COALESCE(SUM(joins),0) n FROM hourly WHERE owner_id=? AND hour>=?`).get(uid, Math.floor(now() / 3600000) - 30 * 24).n;
function levelAt(leads) { const L = setting('levels'); let i = 0; L.forEach((l, j) => { if (leads >= l.from) i = j; }); return { i, L }; }
/** The level block of GET /api/me. */
function levelView(uid, leads = leads30(uid)) {
  const { i, L } = levelAt(leads), cur = L[i], nx = L[i + 1];
  const u = Q(`SELECT level_id, level_since, show_level FROM users WHERE id=?`).get(uid) || {};
  return { id: cur.id, name: cur.name, index: i + 1, leads_30d: leads, from: cur.from, next: nx ? { id: nx.id, name: nx.name, from: nx.from, need: Math.max(0, nx.from - leads) } : null,
    show_badge: u.show_level !== 0, since: u.level_id === cur.id ? u.level_since || null : null, emoji: LEVEL_EMOJI[cur.id] || null };
}
/**
 * Hourly: store each user's level. Going above the highest level reached in the current 30-day cycle sends the level_up email
 * and leaves Joe a note. Going down is silent. The very first time, the level is recorded without a celebration.
 */
function updateLevel(uid) {
  const leads = leads30(uid), { i, L } = levelAt(leads), t = now();
  const u = Q(`SELECT level_id, level_peak, level_cycle FROM users WHERE id=?`).get(uid); if (!u) return null;
  let peak = u.level_peak, cycle = u.level_cycle;
  if (peak == null) { Q(`UPDATE users SET level_id=?, level_since=?, level_peak=?, level_cycle=?, leads_30d=? WHERE id=?`).run(L[i].id, t, i, t, leads, uid); return { first: true, level: L[i].id }; }
  if (!cycle || t - cycle >= 30 * 864e5) { cycle = t; peak = i; }
  const up = i > peak;
  if (up) peak = i;
  Q(`UPDATE users SET level_id=?, level_since=CASE WHEN level_id IS ? THEN level_since ELSE ? END, level_peak=?, level_cycle=?, leads_30d=? WHERE id=?`).run(L[i].id, L[i].id, t, peak, cycle, leads, uid);
  if (up) {
    const lv = levelView(uid, leads), emoji = LEVEL_EMOJI[lv.id] || '🏅';
    notifyUser(uid, 'level_up', { level: lv.name, id: lv.id, leads, next: lv.next }, { ref: `level:${lv.id}:${cycle}` });
    Q(`INSERT INTO user_notes(user_id,kind,level,title,body,created_at) VALUES(?,?,?,?,?,?)`).run(uid, 'level_up', 'good', `You just hit ${lv.name} ${emoji}`,
      `${$num(leads)} leads in the last 30 days.${lv.next ? ` Next up: ${lv.next.name} at ${$num(lv.next.from)}.` : ' That’s the top of the ladder.'}`, t);
    log('level up', uid, lv.id);
  }
  return { up, level: L[i].id };
}
function levelJobs() { for (const u of Q(`SELECT id FROM users WHERE status='active'`).all()) { try { updateLevel(u.id); } catch (e) { log('level job', u.id, e.message); } } }

// ---------- admin: add or remove credits (1 credit = $0.01) ----------
/** Positive amounts are `gift` rows (spendable, never withdrawable, no referral commission); negative ones are `adjust`. */
function giveCredits(uid, credits, reason, notify, by) {
  const u = Q(`SELECT id, email FROM users WHERE id=?`).get(uid); if (!u) return { error: 'No such user.' };
  const note = String(reason || '').trim().slice(0, 200) || (credits > 0 ? 'Gift from the Joinvoo team' : 'Correction by the Joinvoo team');
  addLedger(uid, credits > 0 ? 'gift' : 'adjust', credits, null, note);
  const bal = Q(`SELECT balance_cents FROM users WHERE id=?`).get(uid).balance_cents || 0;
  if (notify) notifyUser(uid, 'credits_added', { credits, reason: String(reason || '').trim().slice(0, 200), balance_cents: bal });
  log('admin credits', by || '', u.email, credits);
  return { ok: true, user_id: uid, balance_credits: bal };
}
const creditAmount = (v) => { const n = Math.round(Number(String(v ?? '').replace(/[,\s]/g, ''))); return Number.isFinite(n) && n !== 0 && Math.abs(n) <= 10000000 ? n : null; };

// ---------- Joe: the Joinvoo assistant ----------
const JOE_PERSONA_DEFAULT = `Personality: friendly, warm and jovial, like a sharp media-buyer friend who is also a serious expert. Light humour is welcome; at most 1–2 emoji in a reply, often none.
Use the user's first name naturally now and then (about one reply in three, never in every line, and only if you know it).
Now and then (at most once every few replies, never twice in a row) end with a short encouraging sign-off. Vary it; these are style samples, not a script:
- "Wishing you aggressive traffic buying soon, {name} 😄 I know you're here to make money."
- "Go get those deposits, {name}."
- "May your CPMs be low and your FTDs plenty 🚀"
- "Ping me after the next 48 hours of data and we'll tune it."
- "You're closer than you think. Test, measure, scale."
- "Clean data, calm head, bigger budgets."
- "Rooting for your next winning ad set, {name} 💪"
- "Small tweaks, big weeks. Let's go."
- "Your future self will thank you for that tracking setup."
- "Keep the creatives fresh and the numbers honest.`;
const ANTHROPIC_API_BASE = (env.ANTHROPIC_API_BASE || 'https://api.anthropic.com').replace(/\/$/, '');
const JOE_FILE = path.join(__dirname, 'joe', 'knowledge.md');
let joeKb = { at: 0, mtime: -1, text: '' };
/** joe/knowledge.md (re-read when it changes) + the extra knowledge an admin typed in Settings → Joe. */
function joeKnowledge() {
  if (Date.now() - joeKb.at > 30000) {
    joeKb.at = Date.now();
    try { const st = fs.statSync(JOE_FILE); if (st.mtimeMs !== joeKb.mtime) joeKb = { at: Date.now(), mtime: st.mtimeMs, text: fs.readFileSync(JOE_FILE, 'utf8') }; } catch { joeKb.text = joeKb.text || ''; }
  }
  const extra = setting('joe.knowledge');
  return joeKb.text + (extra ? '\n\n## Extra notes from the Joinvoo team\n' + extra : '');
}
const joeKey = () => setting('joe.api_key') || '';
const resendKey = () => setting('email.resend_key') || '';
const joeProvider = () => setting('joe.provider');
const joeProvKey = () => (joeProvider() === 'openai' ? setting('joe.openai_key') || '' : joeKey());
const joeModel = () => (joeProvider() === 'openai' ? setting('joe.openai_model') : setting('joe.model'));
const joeAiOn = () => !!joeProvKey() && !!setting('joe.ai');
const joeDay = (u) => localClock(u.tz).date;
function joeRemaining(u) {
  const limit = setting('joe.daily_limit'), used = (Q(`SELECT n FROM joe_usage WHERE user_id=? AND day=?`).get(u.id, joeDay(u)) || { n: 0 }).n;
  return Math.max(0, limit - used);
}
const joeUser = (uid) => Q(`SELECT id, email, name, nickname, tz, lang, status, verified_at, balance_cents, free_joins FROM users WHERE id=?`).get(uid);
const ymdLocal = (ts, off) => new Date(ts - off * 60000).toISOString().slice(0, 10);
/** Numbers Joe looks at: today, yesterday, last 7 days and the 7 before, in the user's own clock. */
function joeData(u) {
  const lc = localClock(u.tz), off = lc.off, t = now(), D = 864e5;
  const P = (a, b) => periodData(u.id, a, b, off, null, 'day').totals;
  const d = { lc, today: P(lc.dayStart, t), yday: P(lc.dayStart - D, lc.dayStart), w: P(lc.dayStart - 6 * D, t), pw: P(lc.dayStart - 13 * D, lc.dayStart - 6 * D) };
  const sameTime = periodData(u.id, lc.dayStart - D, t - D, off, null, 'day').totals; d.yday_same = sameTime;
  const q = new URLSearchParams({ from: ymdLocal(lc.dayStart - 6 * D, off), to: lc.date, tz: String(off), dim: 'campaign' });
  d.camps = breakdownRaw(u, q).filter((r) => r.joins > 0 && !/^\(no /.test(r.key));
  d.locked = isLocked(u.id);
  return d;
}
/** Breakdown rows without the Pro lock (Joe decides himself what he may say). */
function breakdownRaw(u, q) { const r = breakdown({ id: u.id }, q); return r.rows; }
const pctOf = (a, b) => (b ? Math.round((a - b) / b * 100) : null);
/** Best and weakest campaign of the last 7 days: by ROAS when spend is in, else by FTD rate, else by join rate. */
function joeBestWorst(d) {
  const rows = d.camps.filter((r) => r.joins >= 10);
  if (rows.length < 2) return null;
  let by = 'join_rate', val = (r) => r.join_rate;
  if (!d.locked && rows.filter((r) => r.spend_cents > 0 && r.roas != null).length >= 2) { by = 'roas'; val = (r) => r.roas; }
  else if (!d.locked && rows.some((r) => r.ftd > 0)) { by = 'ftd_rate'; val = (r) => (r.joins ? r.ftd / r.joins : 0); }
  const list = (by === 'roas' ? rows.filter((r) => r.spend_cents > 0 && r.roas != null) : rows).slice().sort((a, b) => val(b) - val(a));
  return { by, best: list[0], worst: list[list.length - 1], val };
}
const fmtBy = (bw, r) => (bw.by === 'roas' ? `ROAS ${(r.roas || 0).toFixed(2)}×` : bw.by === 'ftd_rate' ? `${(r.joins ? r.ftd / r.joins * 100 : 0).toFixed(1)}% of joins deposit` : `${(r.join_rate * 100).toFixed(1)}% join rate`);
/** GET /api/joe/insights — rule-based, always available, built only from this user's data. */
function joeInsights(uid) {
  const u = joeUser(uid), lc = localClock(u.tz), items = [];
  const name = firstName(u), hr = lc.hour, pick = (a) => a[(+lc.date.replace(/-/g, '') + hr) % a.length];
  const nm = (t) => (name ? t.replace('{n}', name) : t.replace(/,? ?\{n\}/, ''));
  const greeting = nm(pick(hr < 5 ? ['Up late, {n}? 🦉 Here’s where things stand', 'Night shift, {n} 🌙 here’s the latest']
    : hr < 12 ? ['Morning, {n} ☕ here’s what moved overnight', 'Good morning, {n} 👋 fresh numbers are in', 'Rise and shine, {n} ☀️ let’s see the scoreboard']
    : hr < 18 ? ['Good afternoon, {n} 👋 here’s how today is going', 'Hey {n}, quick afternoon check-in', 'Afternoon, {n} 🚀 here’s the pulse']
    : ['Good evening, {n} 👋 here’s how the day went', 'Evening, {n} 🌆 today’s wrap-up', 'Hey {n}, winding down? Here’s the day']));
  for (const n of Q(`SELECT id, kind, level, title, body FROM user_notes WHERE user_id=? AND created_at>? ORDER BY id DESC LIMIT 2`).all(uid, now() - 3 * 864e5))
    items.push({ id: 'note_' + n.id, level: n.level || 'good', title: n.title, body: n.body, action: { label: 'See my level', tab: 'credits' } });
  const chans = Q(`SELECT c.id, c.title, c.type, c.status, c.redirect_to, (SELECT COUNT(*) FROM links l WHERE l.channel_id=c.id AND l.status='pool') pool FROM channels c WHERE c.owner_id=? AND c.status<>'removed'`).all(uid);
  if (!chans.length) {
    items.push({ id: 'setup', level: 'info', title: name ? `Let’s get your first join, ${name}` : 'Let’s get your first join', body: 'Connect a channel, group or bot and put your Joinvoo link in an ad. I start watching your numbers the moment people join.', action: { label: 'Connect a channel', tab: 'channels' } });
    return { greeting, mood: 'calm', items };
  }
  const st = trackingState(uid);
  if (!st.ok && ['need_plan', 'empty'].includes(st.reason)) items.push({ id: 'paused', level: 'bad', title: 'Tracking is paused', body: 'Your credits ran out. Visitors still reach Telegram, but joins aren’t tracked or sent to your ads until you top up.', action: { label: 'Buy credits', tab: 'credits' } });
  const fails = Q(`SELECT q.platform, COUNT(*) n FROM capi_queue q JOIN channels c ON c.id=q.channel_id WHERE c.owner_id=? AND q.status='failed' AND q.created_at>? GROUP BY q.platform`).all(uid, now() - 864e5);
  for (const f of fails) items.push({ id: 'fail_' + f.platform, level: 'bad', title: `${(PLATFORMS[f.platform] || PLATFORMS.meta).label} is refusing your events`, body: `${$num(f.n)} events failed in the last 24 hours. Check the pixel ID and access token on the channel.`, action: { label: 'Open channels', tab: 'channels' } });
  for (const b of Q(`SELECT username FROM bots WHERE owner_id=? AND status='invalid'`).all(uid)) items.push({ id: 'bot_' + b.username, level: 'bad', title: `@${b.username} stopped working`, body: 'Telegram no longer accepts its token. Reconnect the bot so tracking continues.', action: { label: 'Open channels', tab: 'channels' } });
  for (const c of chans.filter((x) => x.status === 'no_rights')) items.push({ id: 'rights_' + c.id, level: 'bad', title: `${c.title} needs admin rights`, body: 'Your bot lost the “Invite users” right, so it can’t make invite links. Make it an admin again.', action: { label: 'Open channels', tab: 'channels' } });
  const hNow = Math.floor(now() / 3600000);
  for (const c of chans.filter((x) => x.status === 'active' && !x.redirect_to)) {
    if (Q(`SELECT COALESCE(SUM(joins),0) n FROM hourly WHERE channel_id=? AND hour>=?`).get(c.id, hNow - 2).n) continue;
    let usual = 0; for (let k = 1; k <= 7; k++) usual += Q(`SELECT COALESCE(SUM(joins),0) n FROM hourly WHERE channel_id=? AND hour>=? AND hour<=?`).get(c.id, hNow - 2 - 24 * k, hNow - 24 * k).n;
    if (usual / 7 >= 3) { items.push({ id: 'quiet_' + c.id, level: 'warn', title: `No joins on ${c.title} for 2 hours`, body: `These hours usually bring about ${Math.round(usual / 7)}. Check that your ads are running and the bot is still an admin.`, action: { label: 'Open channels', tab: 'channels' } }); break; }
  }
  const low = chans.find((c) => c.status === 'active' && c.type !== 'bot' && c.pool < POOL_SIZE * 0.25);
  if (low) items.push({ id: 'links_' + low.id, level: 'warn', title: `Invite links running low on ${low.title}`, body: `${$num(low.pool)} of ${$num(POOL_SIZE)} ready. New ones are being made and nobody is blocked; add a second bot if you plan to scale.`, action: { label: 'Open channels', tab: 'channels' } });
  if (BILLING && !isAdmin(u) && !(u.free_joins > 0) && st.ok && (u.balance_cents || 0) < 500) items.push({ id: 'credits', level: 'warn', title: 'Credits are running low', body: `${$num(u.balance_cents || 0)} credits left. Top up so tracking never pauses.`, metric: { name: 'Credits', value: u.balance_cents || 0, delta_pct: null }, action: { label: 'Buy credits', tab: 'credits' } });
  const d = joeData(u);
  if (d.today.joins > 0) {
    const dp = pctOf(d.today.joins, d.yday_same.joins);
    items.push({ id: 'track', level: 'good', title: name && lc.hour % 3 === 0 ? `Nice, ${name}: your leads are tracking 🎯` : 'Your leads are tracking 🎯', body: `${$num(d.today.joins)} tracked joins so far today${d.yday_same.joins ? `, vs ${$num(d.yday_same.joins)} by this time yesterday` : ''}. Each one is matched to its ad and sent to your ad platforms.`, metric: { name: 'Joins today', value: d.today.joins, delta_pct: dp } });
  }
  if (!d.locked) {
    const cpf = (x) => (x.spend_cents && x.ftd ? Math.round(x.spend_cents / x.ftd) : null);
    let a = cpf(d.today), b = cpf(d.yday), lbl = 'today', vs = 'yesterday';
    if (a == null) { a = cpf(d.yday); b = cpf(periodData(u.id, d.lc.dayStart - 2 * 864e5, d.lc.dayStart - 864e5, d.lc.off, null, 'day').totals); lbl = 'yesterday'; vs = 'the day before'; }
    if (a != null && b != null && a !== b) {
      const c = pctOf(a, b);
      items.push({ id: 'cpf', level: c > 10 ? 'warn' : 'good', title: `Cost per FTD is ${c > 0 ? 'up' : 'down'} ${Math.abs(c)}%`, body: `${usdShort(a)} ${lbl} vs ${usdShort(b)} ${vs}.`, metric: { name: 'Cost per FTD', value: a, delta_pct: c }, action: { label: 'Compare', tab: 'compare' } });
    }
  }
  const bw = joeBestWorst(d);
  if (bw) {
    items.push({ id: 'best', level: 'good', title: `${bw.best.key} is your star campaign ⭐`, body: `${fmtBy(bw, bw.best)} over the last 7 days, from ${$num(bw.best.joins)} joins.${bw.by === 'roas' ? ' It can take more budget: raise it 20–30% a day.' : ''}`, action: { label: 'See campaigns', tab: 'campaigns' } });
    if (bw.worst.key !== bw.best.key) items.push({ id: 'worst', level: bw.by === 'roas' && bw.worst.roas < 1 ? 'warn' : 'info', title: `${bw.worst.key} is your weakest campaign`, body: `${fmtBy(bw, bw.worst)}. Refresh the creative or move part of its budget to ${bw.best.key}.`, action: { label: 'Open campaigns', tab: 'campaigns' } });
  }
  const ti = trialInfo(uid);
  if (ti.status === 'active') items.push({ id: 'trial', level: 'info', title: `Pro trial: ${ti.ftd_used} of ${ti.ftd_limit} deposits`, body: `${Math.max(0, Math.ceil((ti.ends_at - now()) / 864e5))} days left to see which ads drive your deposits.`, action: { label: 'See plans', tab: 'credits' } });
  if (ti.status === 'ended') { const n = Q(`SELECT COUNT(*) n FROM conversions WHERE owner_id=? AND matched=1 AND event IN ('ftd','dep','sale')`).get(uid).n;
    if (n) items.push({ id: 'locked', level: 'info', title: `${$num(n)} deposits tracked`, body: 'They’re still sent to your ad platforms, so your ads keep learning. Upgrade to Pro to see which ads drove them.', action: { label: 'Upgrade to Pro', tab: 'credits' } }); }
  if (d.w.filtered_joins === undefined) d.w.filtered_joins = Q(`SELECT COALESCE(SUM(filtered),0) n FROM hourly WHERE owner_id=? AND hour>=?`).get(uid, Math.floor(d.lc.dayStart / 3600000) - 6 * 24).n;
  if (d.w.filtered_joins > 0) items.push({ id: 'fraud', level: 'info', title: `${$num(d.w.filtered_joins)} fake joins filtered`, body: 'Join bursts, deleted accounts, repeat users and bot clicks were kept away from your ad platforms this week, so your pixels learn from real people.', action: { label: 'See who', tab: 'conversions' } });
  else if (d.w.clicks >= 50 && d.w.suspect_clicks / d.w.clicks > 0.1) items.push({ id: 'fakeclicks', level: 'info', title: `${Math.round(d.w.suspect_clicks / d.w.clicks * 100)}% of clicks look fake`, body: `${$num(d.w.suspect_clicks)} of ${$num(d.w.clicks)} clicks this week came from bots, data centres or repeats. They’re only marked, never blocked.` });
  if (d.w.joins > 0 && !d.w.spend_cents && feature('spend')) items.push({ id: 'spend', level: 'info', title: 'Add your ad spend', body: 'With spend in, I can tell you cost per FTD and ROAS for every campaign.', action: { label: 'Add spend', tab: 'compare' } });
  const lv = levelView(uid);
  if (lv.next && lv.leads_30d >= lv.next.from * 0.8) items.push({ id: 'level_next', level: 'info', title: `${$num(lv.next.need)} leads to ${lv.next.name}`, body: `You have ${$num(lv.leads_30d)} leads in the last 30 days. ${lv.next.name} starts at ${$num(lv.next.from)}.` });
  if (!items.length) items.push({ id: 'quiet', level: 'info', title: name ? `All quiet for now, ${name}` : 'All quiet for now', body: 'No joins yet today. I’ll tell you the moment something changes.' });
  const rank = { bad: 0, warn: 1, good: 2, info: 3 };
  const notes = items.filter((i) => i.id.startsWith('note_')), rest = items.filter((i) => !i.id.startsWith('note_')).sort((a, b) => rank[a.level] - rank[b.level]);
  const list = [...notes, ...rest].slice(0, 8);
  const mood = list.some((i) => i.level === 'bad') ? 'bad' : list.some((i) => i.level === 'warn') ? 'warn' : list.some((i) => i.level === 'good') ? 'good' : 'calm';
  return { greeting, mood, items: list };
}
/** joe/knowledge.md split into sections, for the rule-based FAQ. */
function joeSections() {
  return joeKnowledge().split(/\n(?=##\s)/).map((s) => { const m = /^##\s+(.+)\n([\s\S]*)$/.exec(s.trim()); return m ? { title: m[1].trim(), body: m[2].trim() } : null; }).filter((x) => x && x.body);
}
const STOP = new Set('the a an and or of to in on for is are my i me how what why do does can with it this that be your you at by from as which when where should get'.split(' '));
function joeFaq(q) {
  const words = String(q).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [], terms = words.filter((w) => !STOP.has(w));
  if (!terms.length) return null;
  let best = null;
  for (const s of joeSections()) {
    const hay = (s.title + ' ' + s.title + ' ' + s.body).toLowerCase();
    const score = terms.reduce((a, w) => a + (hay.includes(w) ? (s.title.toLowerCase().includes(w) ? 3 : 1) : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { ...s, score };
  }
  return best && best.score >= 2 ? best : null;
}
const SUGGEST = ['How are my ads doing?', 'Which campaign should I scale?', 'Why is my cost per FTD up?', 'What should I fix today?'];
/** Rule-based answers (no AI key): the user's own numbers for the common questions, the guide for the rest. Never makes a number up. */
/* Rule-based answers from the playbooks for common questions (no AI key): the best-matching section, trimmed. */
const JOE_ROUTES = [
  { re: /drop.?offs?|dropoff|\bleav(e|es|ing)\b|\bleft (my|the)\b|unsubscrib|retention|churn|people (go|quit)/, pb: ['telegram-retention-dropoff'], boost: ['drop', 'leave', 'stay'] },
  { re: /rev.?share|\bcpa\b.{0,30}(vs|or|deal|model|better|differ|mean|work)|(vs|or|deal|model|what is|what's|explain).{0,30}\bcpa\b|hybrid deal|affiliate (program|deal|manager)|shav(e|ing)\b/, pb: ['affiliate-programs-revshare'], boost: ['revshare', 'cpa', 'compar'] },
  { re: /postback/, pb: ['general-faq', 'affiliate-programs-revshare'], boost: ['postback'], prefer: [[/set ?up|setup|how|where|find/, 'postback url'], [/what|mean/, 'what is a postback'], [/match/, 'aren\'t my deposits matching']] },
  { re: /founder|who (built|made|created|owns|runs|is behind)|zedapex|traffic bank|dchessking|your team|about you/, pb: ['about-zedapex-and-team'], boost: ['founder', 'zedapex', 'team'] },
  { re: /refund|money back|chargeback/, pb: ['general-faq'], boost: ['refund'] },
];
const JOE_STOP = new Set(['what', 'when', 'where', 'which', 'with', 'that', 'this', 'there', 'their', 'have', 'does', 'from', 'your', 'about', 'should', 'would', 'could', 'them', 'they', 'into', 'than', 'then', 'just', 'like', 'more', 'some', 'very', 'want', 'need', 'help', 'please', 'joinvoo']);
/** Split a playbook into sections: ##/### headings and the FAQ's bold “**12. Question?**” lines. A section includes its sub-sections. */
function pbSections(text) {
  const lines = String(text).split('\n'), heads = [];
  lines.forEach((l, i) => { let m = /^(#{2,4})\s+(.+)$/.exec(l); if (m) return heads.push({ i, level: m[1].length, title: m[2].trim() }); m = /^\*\*(\d+\.\s+.+?)\*\*\s*$/.exec(l); if (m) heads.push({ i, level: 5, title: m[1].replace(/^\d+\.\s+/, '').trim() }); });
  return heads.map((h, k) => { const end = (heads.slice(k + 1).find((x) => x.level <= h.level) || { i: lines.length }).i; return { title: h.title.replace(/^\d+\.\s+/, ''), level: h.level, body: lines.slice(h.i + 1, end).join('\n').trim() }; }).filter((x) => x.body);
}
const trimAt = (t, n) => { t = t.replace(/\n{3,}/g, '\n\n').trim(); if (t.length <= n) return t; const cut = t.slice(0, n); const at = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('. ')); return (at > n * 0.6 ? cut.slice(0, at + 1) : cut).trim() + ' …'; };
function joeRoute(q) {
  const r = JOE_ROUTES.find((x) => x.re.test(q)); if (!r) return null;
  const words = [...new Set(q.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter((w) => w.length > 3 && !JOE_STOP.has(w)).map((w) => w.replace(/(ing|es|s)$/, '')))];
  let best = null;
  for (const name of r.pb) {
    const pb = readPlaybook(name); if (pb.error) continue;
    for (const sec of pbSections(pb.text)) {
      const t = sec.title.toLowerCase(), b = sec.body.toLowerCase();
      let sc = 0;
      for (const w of words) sc += t.includes(w) ? 3 : b.includes(w) ? 1 : 0;
      for (const w of r.boost) if (t.includes(w)) sc += 4;
      for (const [when, phrase] of r.prefer || []) if (when.test(q) && t.includes(phrase)) sc += 8;
      sc -= sec.level === 2 && sec.body.length > 2000 ? 1 : 0; // prefer a focused section to a whole chapter
      if (sc > 0 && (!best || sc > best.sc || (sc === best.sc && sec.body.length < best.sec.body.length))) best = { sc, sec, name };
    }
  }
  return best ? { title: best.sec.title, body: trimAt(best.sec.body, 1200), playbook: best.name } : null;
}
function joeRules(uid, msg) {
  const u = joeUser(uid), q = String(msg || '').toLowerCase();
  const rt = joeRoute(q);
  if (rt) return { reply: `**${rt.title}**\n\n${rt.body}\n\nWant me to go deeper? Add an AI key in admin for full chat.`, suggestions: SUGGEST.slice(0, 3), playbook: rt.playbook };
  const sugg = (...x) => x.length ? x : SUGGEST.slice(0, 3);
  const hasChans = Q(`SELECT 1 FROM channels WHERE owner_id=? AND status<>'removed' LIMIT 1`).get(uid);
  const statsAsk = /how.*(doing|going|ads|perform)|overview|summary|stats|numbers|results|week|today|yesterday|resumen|résumé|resumo|итог|как дела|desempenh|rendimiento/.test(q);
  const scaleAsk = /scale|best|budget|grow|winner|escal|meilleur|melhor|mejor|масштаб|лучш/.test(q);
  const costAsk = /cost|cpa|cpf|expensive|price per|coût|custo|costo|стоим|дорог/.test(q);
  const fixAsk = /fix|problem|wrong|issue|broken|error|attention|corrig|problème|problema|исправ|ошиб/.test(q);
  const fakeAsk = /fake|fraud|filter|bot click|suspicious|faux|falso|фейк|фрод/.test(q);
  if ((statsAsk || scaleAsk || costAsk || fixAsk || fakeAsk) && !hasChans) return { reply: 'I don’t have any traffic to look at yet. Connect a channel and put your Joinvoo link in an ad; once people start joining, ask me again and I’ll break it down.', suggestions: ['How do I set up tracking?', 'What is request-to-join mode?'] };
  if (fixAsk) {
    const ins = joeInsights(uid).items.filter((i) => i.level === 'bad' || i.level === 'warn');
    if (!ins.length) return { reply: 'Nothing looks broken right now: tokens are accepted, channels have their rights and invite links are stocked. I’ll flag it the moment that changes.', suggestions: sugg('How are my ads doing?', 'Which campaign should I scale?') };
    return { reply: `Here’s what I’d fix today:\n\n${ins.slice(0, 5).map((i, n) => `${n + 1}. **${i.title}.** ${i.body}`).join('\n')}`, suggestions: sugg('How are my ads doing?', 'Which campaign should I scale?') };
  }
  const d = (statsAsk || scaleAsk || costAsk || fakeAsk) ? joeData(u) : null;
  if (fakeAsk) {
    const f = Q(`SELECT COALESCE(SUM(filtered),0) n FROM hourly WHERE owner_id=? AND hour>=?`).get(uid, Math.floor(d.lc.dayStart / 3600000) - 6 * 24).n;
    return { reply: `In the last 7 days I filtered **${$num(f)} suspicious joins** (bursts, deleted accounts, repeat users, bot clicks) and marked **${$num(d.w.suspect_clicks)} of ${$num(d.w.clicks)} clicks** as suspect. Filtered joins are never sent to your ad platforms, so your pixels learn from real people. You’ll find them in People → Filtered.`, suggestions: sugg('How are my ads doing?') };
  }
  if (scaleAsk) {
    const bw = joeBestWorst(d);
    if (!bw) return { reply: `I need at least two campaigns with 10+ joins in the last 7 days to compare, and I only see ${d.camps.length ? $num(d.camps.length) + ' with joins' : 'none tagged'}. Add utm_campaign={{campaign.name}} to your tracking link so every join carries its campaign.`, suggestions: sugg('How are my ads doing?') };
    return { reply: `Scale **${bw.best.key}**: ${fmtBy(bw, bw.best)} over the last 7 days from ${$num(bw.best.joins)} joins.${bw.by === 'roas' && bw.best.cost_per_ftd_cents ? ` Each FTD costs ${usdShort(bw.best.cost_per_ftd_cents)}.` : ''}\n\nRaise its budget 20–30% a day, not all at once, so the algorithm keeps learning.${bw.worst.key !== bw.best.key ? `\n\nYou can fund it by trimming **${bw.worst.key}** (${fmtBy(bw, bw.worst)}).` : ''}${bw.by === 'join_rate' ? '\n\nThis is by join rate; add spend and deposits to compare by ROAS.' : ''}`, suggestions: sugg('Why is my cost per FTD up?', 'What should I fix today?') };
  }
  if (costAsk) {
    if (d.locked) return { reply: 'Cost per FTD by campaign is part of Pro. Your deposits are still counted and sent to your ad platforms; upgrade to see what each one costs.', suggestions: sugg('How are my ads doing?') };
    const a = d.w.spend_cents && d.w.ftd ? Math.round(d.w.spend_cents / d.w.ftd) : null, b = d.pw.spend_cents && d.pw.ftd ? Math.round(d.pw.spend_cents / d.pw.ftd) : null;
    if (a == null) return { reply: d.w.spend_cents ? 'You have spend this week but no first deposits yet, so there is no cost per FTD to show.' : 'I can’t work out cost per FTD without your ad spend. Add it on the Compare page (or import a CSV), and I’ll track it for every campaign.', suggestions: sugg('How are my ads doing?') };
    const worst = d.camps.filter((r) => r.spend_cents && r.ftd).sort((x, y) => y.cost_per_ftd_cents - x.cost_per_ftd_cents)[0];
    return { reply: `Cost per first deposit is **${usdShort(a)}** over the last 7 days${b != null ? ` vs ${usdShort(b)} the week before (${pctOf(a, b) >= 0 ? '+' : ''}${pctOf(a, b)}%)` : ''}.${worst ? `\n\nThe most expensive campaign is **${worst.key}** at ${usdShort(worst.cost_per_ftd_cents)} per FTD (${$num(worst.ftd)} FTDs from ${$num(worst.joins)} joins).` : ''}\n\nTry a new hook in the first 3 seconds, switch the channel to request-to-join with a welcome offer, or move budget to your cheapest campaign.`, suggestions: sugg('Which campaign should I scale?', 'What should I fix today?') };
  }
  if (statsAsk) {
    const jd = pctOf(d.w.joins, d.pw.joins), fd = pctOf(d.w.ftd, d.pw.ftd);
    const lines = [`• **${$num(d.w.joins)} tracked joins**${jd != null ? ` (${jd >= 0 ? '+' : ''}${jd}% vs the week before)` : ''} from ${$num(d.w.clicks)} clicks`,
      `• **${$num(d.w.ftd)} first deposits**${fd != null ? ` (${fd >= 0 ? '+' : ''}${fd}%)` : ''}`];
    if (!d.locked && d.w.spend_cents) lines.push(`• **${usdShort(d.w.spend_cents)} spend**, ROAS ${d.w.roas != null ? d.w.roas.toFixed(2) + '×' : '—'}${d.w.ftd ? `, ${usdShort(Math.round(d.w.spend_cents / d.w.ftd))} per FTD` : ''}`);
    else if (!d.locked && d.w.revenue_cents) lines.push(`• **${usdShort(d.w.revenue_cents)} deposit revenue** reported`);
    const bw = joeBestWorst(d);
    return { reply: `Here’s your last 7 days:\n\n${lines.join('\n')}\n\n${d.w.joins ? (jd == null || jd >= 0 ? 'Things look healthy.' : 'Joins are down on the week before.') : 'No tracked joins this week yet.'}${bw ? ` Your best campaign is **${bw.best.key}**${bw.worst.key !== bw.best.key ? `, and **${bw.worst.key}** is the one to watch` : ''}.` : ''}${d.locked ? '\n\nRevenue and ROAS by ad are part of Pro.' : ''}`, suggestions: sugg('Which campaign should I scale?', 'Why is my cost per FTD up?', 'What should I fix today?') };
  }
  const f = joeFaq(q);
  if (f) return { reply: `**${f.title}**\n\n${f.body.replace(/\n{3,}/g, '\n\n').slice(0, 900)}`, suggestions: sugg() };
  if (/^(hi|hey|hello|yo|hola|olá|ola|salut|bonjour|привет)\b/.test(q)) return { reply: `Hi${firstName(u) ? ' ' + firstName(u) : ''}! 👋 I watch your joins, deposits, spend and channels. Ask me how your ads are doing, which campaign to scale, or what to fix today.`, suggestions: sugg() };
  return { reply: 'I’m not sure about that one. I can tell you how your ads are doing, which campaign to scale, why costs moved, what to fix today, or how any part of Joinvoo works.', suggestions: sugg() };
}

// Joe's tools: each one reads ONLY the asking user's data, through the same functions as the dashboard.
const JOE_TOOLS = [
  { name: 'get_stats', description: 'Totals for a date range: clicks, tracked joins, organic joins, leaves, filtered fake joins, suspect clicks, registrations, FTDs, sales, revenue (cents), spend (cents). Dates are YYYY-MM-DD in the user’s time zone; defaults to the last 7 days.',
    input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, channel_id: { type: 'integer' } } } },
  { name: 'get_breakdown', description: 'Rows by one dimension for a date range: clicks, joins, join rate, FTDs, revenue, spend, cost per join, cost per FTD and ROAS (when spend was entered). Top rows by joins.',
    input_schema: { type: 'object', properties: { dim: { type: 'string', enum: ['campaign', 'adset', 'ad', 'source', 'country', 'platform', 'channel', 'lang'] }, from: { type: 'string' }, to: { type: 'string' }, limit: { type: 'integer' } }, required: ['dim'] } },
  { name: 'compare_periods', description: 'Period A vs period B totals with % change (joins, FTDs, revenue, spend, cost per FTD, ROAS, rates).',
    input_schema: { type: 'object', properties: { a_from: { type: 'string' }, a_to: { type: 'string' }, b_from: { type: 'string' }, b_to: { type: 'string' } }, required: ['a_from', 'a_to', 'b_from', 'b_to'] } },
  { name: 'channels_health', description: 'The user’s channels, groups and bots: status, ready invite links, connected ad platforms, backup redirects, broken bots and failed sends in the last 24 hours.', input_schema: { type: 'object', properties: {} } },
  { name: 'billing_summary', description: 'Credits balance (1 credit = $0.01), plan (Basic/Pro), Pro trial, whether tracking is running, this month’s usage, free joins left and level.', input_schema: { type: 'object', properties: {} } },
  { name: 'conversions_summary', description: 'Deposits and other conversions reported by postbacks for a date range: counts per event, revenue, unmatched postbacks, and the latest few.',
    input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } } },
];
// ----- Joe playbooks: built-in files in joe/playbooks/ (INDEX.md lists them) + custom ones from the admin (same name wins) -----
const PLAYBOOK_DIR = env.JOE_PLAYBOOKS_DIR || path.join(__dirname, 'joe', 'playbooks');
const PLAYBOOK_MAX = 40000;
const pbName = (n) => String(n || '').trim().toLowerCase().replace(/\.md$/, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
function playbooksValidate(a) {
  if (!Array.isArray(a)) throw new Error('Send a list of playbooks.');
  if (a.length > 50) throw new Error('Up to 50 custom playbooks.');
  const seen = new Set();
  return a.map((x) => {
    const name = pbName(x && x.name); if (name.length < 2) throw new Error('Give each playbook a short name, like “nutra-latam”.');
    if (seen.has(name)) throw new Error(`Two playbooks are called “${name}”.`); seen.add(name);
    const body = String((x && x.body) || '').slice(0, 60000).trim(); if (!body) throw new Error(`Playbook “${name}” is empty.`);
    return { name, use_when: str(300)(x.use_when), body, updated_at: +x.updated_at || Date.now() };
  });
}
let pbCache = { at: 0, list: [] };
/** Built-in playbooks: INDEX.md lines “- file.md: use when …”, plus any other .md in the folder. Re-read every 30 s. */
function builtinPlaybooks() {
  if (Date.now() - pbCache.at < 30000) return pbCache.list;
  const list = [];
  try {
    const files = new Set(fs.readdirSync(PLAYBOOK_DIR).filter((f) => /\.md$/i.test(f) && f.toUpperCase() !== 'INDEX.MD'));
    let idx = ''; try { idx = fs.readFileSync(path.join(PLAYBOOK_DIR, 'INDEX.md'), 'utf8'); } catch { /* no index */ }
    for (const m of idx.matchAll(/^\s*[-*]\s*`?([\w.-]+\.md)`?\s*[:—–-]\s*(.+)$/gm)) {
      if (!files.has(m[1])) continue; files.delete(m[1]);
      list.push({ name: pbName(m[1]), file: m[1], use_when: m[2].trim().slice(0, 400), source: 'built-in' });
    }
    for (const f of [...files].sort()) list.push({ name: pbName(f), file: f, use_when: '', source: 'built-in' });
  } catch { /* folder missing: no built-in playbooks */ }
  pbCache = { at: Date.now(), list }; return list;
}
/** Everything Joe can open: custom playbooks override built-in ones with the same name. */
function allPlaybooks() {
  const custom = setting('joe.playbooks') || [], names = new Set(custom.map((c) => c.name));
  return [...custom.map((c) => ({ name: c.name, use_when: c.use_when, source: 'custom', overrides: builtinPlaybooks().some((b) => b.name === c.name) })),
    ...builtinPlaybooks().filter((b) => !names.has(b.name)).map(({ name, use_when, source }) => ({ name, use_when, source }))];
}
function readPlaybook(name) {
  const n = pbName(name), c = (setting('joe.playbooks') || []).find((x) => x.name === n);
  let text = c ? c.body : null;
  if (text == null) { const b = builtinPlaybooks().find((x) => x.name === n); if (b) { try { text = fs.readFileSync(path.join(PLAYBOOK_DIR, b.file), 'utf8'); } catch { text = null; } } }
  if (text == null) return { error: `No playbook called “${n}”. Call list_playbooks to see the names.`, available: allPlaybooks().map((x) => x.name) };
  return { name: n, source: c ? 'custom' : 'built-in', text: text.length > PLAYBOOK_MAX ? text.slice(0, PLAYBOOK_MAX) + '\n\n[… cut at 40,000 characters]' : text, truncated: text.length > PLAYBOOK_MAX };
}
const PLAYBOOK_TOOLS = [
  { name: 'list_playbooks', description: 'List the media-buying playbooks you can open (name + when to use it): campaign fundamentals, Telegram funnels, metrics & diagnosis, compliance, and one per vertical (trading, gambling, crypto, nutra, dating, e-commerce, apps, finance, education, others).', input_schema: { type: 'object', properties: {} } },
  { name: 'read_playbook', description: 'Open one playbook by name (from list_playbooks) and get its full text. Do this before giving vertical-specific or policy advice.', input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
];
const joeToolsList = () => (allPlaybooks().length ? [...JOE_TOOLS, ...PLAYBOOK_TOOLS] : JOE_TOOLS);
function joeTool(u, name, inp = {}) {
  const off = tzOffset(u.tz), lc = localClock(u.tz), ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
  const from = ok(inp.from) ? inp.from : ymdLocal(lc.dayStart - 6 * 864e5, off), to = ok(inp.to) ? inp.to : lc.date;
  const locked = isLocked(u.id), lockNote = locked ? 'Basic plan after the Pro trial: deposit counts are visible, but revenue/ROAS and which ads drove deposits are locked. Do not guess them; suggest upgrading to Pro.' : undefined;
  const q = (o) => new URLSearchParams({ tz: String(off), ...o });
  if (name === 'list_playbooks') return { playbooks: allPlaybooks().map(({ name, use_when, source }) => ({ name, use_when, source })) };
  if (name === 'read_playbook') return readPlaybook(inp.name);
  if (name === 'get_stats') { const r = stats(u, q({ from, to, ...(inp.channel_id ? { channel: String(inp.channel_id) } : {}) })); return { from, to, totals: r.totals, per_day: r.series.slice(-31), locked, note: lockNote }; }
  if (name === 'get_breakdown') {
    const dim = DIMS[inp.dim] ? inp.dim : 'campaign', r = breakdown(u, q({ from, to, dim }));
    return { dim, from, to, rows: r.rows.slice(0, Math.min(25, Math.max(1, +inp.limit || 10))).map((x) => { const { k, ...rest } = x; return rest; }), locked, note: lockNote };
  }
  if (name === 'compare_periods') {
    if (![inp.a_from, inp.a_to, inp.b_from, inp.b_to].every(ok)) return { error: 'Send a_from, a_to, b_from and b_to as YYYY-MM-DD.' };
    const r = comparePeriods(u, q({ a_from: inp.a_from, a_to: inp.a_to, b_from: inp.b_from, b_to: inp.b_to, group: 'day' }));
    return r.error ? r : { a: r.a.totals, b: r.b.totals, delta_pct: r.delta, locked, note: lockNote };
  }
  if (name === 'channels_health') {
    const cv = channelsView(u);
    return { channels: cv.channels.map((c) => ({ id: c.id, title: c.title, type: c.type, status: c.status, ready_invite_links: c.type === 'bot' ? null : c.pool, pool_target: c.pool_target, meta: !!(c.pixel_id && c.has_token), tiktok: !!(c.tt_pixel && c.tt_has_token), snapchat: !!(c.sc_pixel && c.sc_has_token), join_mode: c.join_mode, redirect_to: c.redirect_title || null })),
      bots: cv.bots.map((b) => ({ username: b.username, status: b.status })),
      failed_sends_24h: Q(`SELECT q.platform, COUNT(*) n FROM capi_queue q JOIN channels c ON c.id=q.channel_id WHERE c.owner_id=? AND q.status='failed' AND q.created_at>? GROUP BY q.platform`).all(u.id, now() - 864e5) };
  }
  if (name === 'billing_summary') {
    const b = billing(u);
    return { credits_balance: b.balance_cents, plan: b.plan, trial: b.trial, tracking: b.tracking, state: b.state, this_month: b.month, free_joins_left: b.free_joins_left, level: levelView(u.id) };
  }
  if (name === 'conversions_summary') {
    const r = parseRange(q({ from, to }));
    const c = convTotals(u.id, r.from, r.to, null);
    const unmatched = Q(`SELECT COUNT(*) n FROM conversions WHERE owner_id=? AND matched=0 AND created_at>=? AND created_at<?`).get(u.id, r.from, r.to).n;
    const latest = locked ? [] : Q(`SELECT v.event, v.value_cents, v.currency, v.created_at, ch.title channel, json_extract(c.params,'$.utm_campaign') campaign FROM conversions v LEFT JOIN joins j ON j.id=v.join_id LEFT JOIN clicks c ON c.id=j.click_id LEFT JOIN channels ch ON ch.id=v.channel_id WHERE v.owner_id=? AND v.created_at>=? AND v.created_at<? ORDER BY v.id DESC LIMIT 5`).all(u.id, r.from, r.to);
    return { from, to, counts: { ...c, revenue_cents: locked ? null : c.revenue_cents }, unmatched_postbacks: unmatched, latest, locked, note: lockNote };
  }
  return { error: 'Unknown tool' };
}
/** Joe's instructions. `stat` is the big unchanging part (cached by Anthropic between questions); `ctx` is about this user and today. */
function joeSystemParts(u) {
  const lc = localClock(u.tz), ti = trialInfo(u.id);
  const persona = `You are Joe, the assistant inside Joinvoo. Joinvoo tracks which Meta, TikTok and Snapchat ads bring Telegram channel joins, bot Starts and deposits (FTDs), and sends them back to the ad platforms. You are a friendly, sharp media-buying assistant: a round violet mascot with a headset, not a real person.
How you work:
- For anything about this user's performance, call the tools first and answer from what they return. You only ever see this user's own data.
- Never invent or estimate numbers. If a tool returns nothing or a value is null or locked, say plainly that you don't have it (and what would unlock it, e.g. adding ad spend or upgrading to Pro).
- Money from tools is in cents (credits: 1 credit = $0.01). Show dollars, e.g. 1240 → $12.40.
- Be practical, like a senior media buyer: lead with the answer, then 1–3 concrete next steps. Keep everyday answers under about 160 words. When the user asks why or how (for example why people drop off in Telegram), explain properly with numbered steps, and ask one short clarifying question if you need it. Use **bold** sparingly and simple numbered or • lists. No tables, no headings.
- Answer in the user's language (their language setting, or the language they write in).
- Joinvoo, tracking and media buying are your home turf, but you also answer general marketing, business and tech questions helpfully and briefly.
- About Zedapex, its founder and the team: only say what the about-zedapex-and-team playbook says. Never invent people, roles, names or history.
- Never promise profits or results. No financial or investment advice.`;
  const expert = allPlaybooks().length ? `Media-buying expertise:
- You are a senior media buyer for Meta, TikTok and Snapchat across verticals: trading, gambling, crypto, nutra, dating, e-commerce, apps, finance, education and others.
- Before vertical-specific advice (offers, angles, funnels, baselines, policies), call list_playbooks if needed and read_playbook for the relevant playbook (metrics-and-diagnosis for “why is X up/down”, compliance-and-account-health for rejected ads or bans, affiliate-programs-revshare for CPA/RevShare deals, telegram-retention-dropoff for drop-off and leaves, about-zedapex-and-team for who makes Joinvoo, general-faq for account, billing and how-to questions). Then combine it with the user's real numbers from the data tools.
- Give specific, practical next steps (what to change, by how much, what to watch), not generic theory.
- Follow the ad platforms' policies. Never help with cloaking, ban evasion, account farming, fake proof or testimonials, fake scarcity or misleading income/health claims; explain the compliant way instead.
- Benchmarks from playbooks are rough ranges, not this user's numbers. Never present them as the user's data and never invent numbers.` : '';
  const tweak = setting('joe.persona');
  const stat = [persona, expert, tweak ? 'Personality and extra instructions from the Joinvoo team (tone only; the rules above always apply):\n' + tweak : '', '# Joinvoo knowledge\n' + joeKnowledge().slice(0, 40000)].filter(Boolean).join('\n\n');
  const fn = firstName(u);
  const ctx = `Context: ${fn ? `the user's first name is ${fn} (use it naturally in about one reply in three, never in every line)` : 'you don’t know the user’s first name, so don’t use or invent one'}; their language is ${({ en: 'English', ru: 'Russian', fr: 'French', pt: 'Portuguese', es: 'Spanish' })[normLang(u.lang)]}. Today is ${lc.date} (their time zone ${u.tz || 'UTC'}). Plan: ${userPlan(u.id) === 'pro' || seesPro(u.id) ? 'Pro' : 'Basic'}; Pro trial: ${ti.status}${ti.status === 'active' ? ` (${ti.ftd_used}/${ti.ftd_limit} deposits)` : ''}.`;
  return { stat, ctx };
}
function joeSystem(u) { const p = joeSystemParts(u); return p.stat + '\n\n' + p.ctx; }
async function anthropicCall(body) {
  const r = await fetch(`${ANTHROPIC_API_BASE}/v1/messages`, { method: 'POST', headers: { 'x-api-key': joeKey(), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
  return j;
}
// ----- Joe pay-as-you-go: free answers per plan per day, then priced from the real token cost × markup (1 credit = $0.01) -----
const JOE_BILLING_DEFAULT = { enabled: true, free_daily: { basic: 5, pro: 30, trial: 30 }, markup: 4, min_credits: 3, max_credits: 40, deep_model: 'claude-sonnet-5-5', deep_markup: 3, deep_min_credits: 10,
  deep_for: 'pro', show_cost: true, default_monthly_cap_credits: 1000 };
/** API list prices in US$ per million tokens. "check" = a placeholder the admin should confirm with their provider. */
const JOE_PRICES_DEFAULT = {
  'claude-haiku-4-5-20251001': { in: 1.00, cache_write: 1.25, cache_read: 0.10, out: 5.00 },
  'claude-sonnet-4-5': { in: 3.00, cache_write: 3.75, cache_read: 0.30, out: 15.00 },
  'claude-sonnet-5': { in: 2.00, cache_write: 2.50, cache_read: 0.20, out: 10.00 },
  'claude-sonnet-5-5': { in: 2.00, cache_write: 2.50, cache_read: 0.20, out: 10.00 },
  'openai-default': { in: 0.15, cache_write: 0.15, cache_read: 0.075, out: 0.60, check: true },
};
function joeBillingValidate(o) {
  if (!o || typeof o !== 'object') throw new Error('Send the Joe pricing.');
  const d = JOE_BILLING_DEFAULT, n = (v, lo, hi, def, dec = false) => { if (v === undefined || v === null || v === '') return def; const x = Number(v); if (!Number.isFinite(x) || x < lo || x > hi) throw new Error(`Enter a number between ${lo} and ${hi}.`); return dec ? Math.round(x * 100) / 100 : Math.round(x); };
  const f = o.free_daily || {};
  const out = { enabled: o.enabled !== false, free_daily: { basic: n(f.basic, 0, 10000, d.free_daily.basic), pro: n(f.pro, 0, 10000, d.free_daily.pro), trial: n(f.trial, 0, 10000, d.free_daily.trial) },
    markup: n(o.markup, 1, 50, d.markup, true), min_credits: n(o.min_credits, 1, 10000, d.min_credits), max_credits: n(o.max_credits, 1, 100000, d.max_credits),
    deep_model: str(120, /^[\w.:/@-]+$/, 'Model ids are letters, numbers, dots, dashes and slashes.')(o.deep_model) || d.deep_model, deep_markup: n(o.deep_markup, 1, 50, d.deep_markup, true),
    deep_min_credits: n(o.deep_min_credits, 1, 100000, d.deep_min_credits), deep_for: o.deep_for === 'all' ? 'all' : 'pro', show_cost: o.show_cost !== false,
    default_monthly_cap_credits: n(o.default_monthly_cap_credits, 0, 10000000, d.default_monthly_cap_credits) };
  if (out.min_credits > out.max_credits) throw new Error('The smallest price is above the largest.');
  if (out.deep_min_credits > out.max_credits) throw new Error('The Deep minimum is above the largest price.');
  if (out.markup < 1.2 || out.deep_markup < 1.2) throw new Error('Keep the markup at 1.2× or more so every answer makes money.');
  return out;
}
function joePricesValidate(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('Send prices as {model: {in, out, …}}.');
  const out = {};
  for (const [k, v] of Object.entries(o).slice(0, 40)) {
    if (!/^[\w.:/@-]{2,120}$/.test(k) || !v || typeof v !== 'object') continue;
    const num = (x, def) => { const y = Number(x); return Number.isFinite(y) && y >= 0 && y <= 1000 ? Math.round(y * 10000) / 10000 : def; };
    const inp = num(v.in, null), outp = num(v.out, null); if (inp == null || outp == null) throw new Error(`${k}: enter input and output prices.`);
    out[k] = { in: inp, cache_write: num(v.cache_write, inp), cache_read: num(v.cache_read, inp), out: outp, ...(v.check ? { check: true } : {}) };
  }
  if (!out['openai-default']) out['openai-default'] = { ...JOE_PRICES_DEFAULT['openai-default'] };
  return out;
}
const joeBill = () => setting('joe.billing');
/** Price per million tokens for a model: exact id, then the longest known prefix, else (OpenAI) openai-default, else the dearest Claude price (never under-charge). */
function joePrice(model, provider) {
  const t = setting('joe.prices') || JOE_PRICES_DEFAULT;
  if (t[model]) return t[model];
  const pre = Object.keys(t).filter((k) => k !== 'openai-default' && String(model).startsWith(k.replace(/-\d{8}$/, ''))).sort((a, b) => b.length - a.length)[0];
  if (pre) return t[pre];
  if (provider === 'openai') return t['openai-default'] || JOE_PRICES_DEFAULT['openai-default'];
  return Object.values(t).reduce((a, b) => (b.out > a.out ? b : a));
}
/** Usage of one API response, normalised: Anthropic (input, cache write/read, output) or OpenAI (prompt incl. cached, completion). */
function normUsage(u, provider) {
  u = u || {};
  if (provider === 'openai') { const cached = (u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens) || 0; return { in: Math.max(0, (u.prompt_tokens || 0) - cached), cw: 0, cr: cached, out: u.completion_tokens || 0 }; }
  return { in: u.input_tokens || 0, cw: u.cache_creation_input_tokens || 0, cr: u.cache_read_input_tokens || 0, out: u.output_tokens || 0 };
}
/** Cost in US$ of a usage total for a model. */
const joeCostUsd = (t, model, provider) => { const p = joePrice(model, provider); return (t.in * p.in + t.cw * p.cache_write + t.cr * p.cache_read + t.out * p.out) / 1e6; };
/** Credits the user pays for an answer that cost `usd`: clamp(ceil(usd × markup × 100), min, max). */
function joeCredits(usd, deep) { const b = joeBill(); return Math.min(b.max_credits, Math.max(deep ? b.deep_min_credits : b.min_credits, Math.ceil(usd * (deep ? b.deep_markup : b.markup) * 100 - 1e-9))); }
function joePlanKey(uid) { const ti = trialInfo(uid); return userPlan(uid) === 'pro' ? 'pro' : ti && ti.status === 'active' ? 'trial' : 'basic'; }
function joeFree(u) {
  const b = joeBill(), daily = b.free_daily[joePlanKey(u.id)] || 0;
  const used = Q(`SELECT COUNT(*) n FROM joe_answers WHERE user_id=? AND day=? AND kind='free'`).get(u.id, joeDay(u)).n;
  const bonus = (Q(`SELECT joe_bonus FROM users WHERE id=?`).get(u.id) || {}).joe_bonus || 0;
  return { daily, used, left: Math.max(0, daily - used), bonus };
}
const joeMonth = (u) => joeDay(u).slice(0, 7);
const joeSpentMonth = (u) => Q(`SELECT COALESCE(SUM(credits),0) n FROM joe_answers WHERE user_id=? AND kind='paid' AND day LIKE ?`).get(u.id, joeMonth(u) + '%').n;
function joeCap(u) { const r = Q(`SELECT joe_monthly_cap c FROM users WHERE id=?`).get(u.id) || {}; return r.c == null ? joeBill().default_monthly_cap_credits : r.c; }
const joeDeepAllowed = (u) => { const b = joeBill(); return b.deep_for === 'all' || joePlanKey(u.id) !== 'basic'; };
/** Typical price range from the last 30 days of paid answers (10th–90th percentile), or [min, min+5] until there is data. */
function joeEstimate(deep) {
  const b = joeBill(), lo = deep ? b.deep_min_credits : b.min_credits;
  const xs = Q(`SELECT credits FROM joe_answers WHERE kind='paid' AND deep=? AND at>? ORDER BY credits`).all(deep ? 1 : 0, now() - 30 * 864e5).map((r) => r.credits);
  if (xs.length < 20) return [lo, Math.min(b.max_credits, deep ? Math.max(lo, Math.round(b.max_credits * 0.6)) : lo + 5)];
  return [xs[Math.floor(xs.length * 0.1)], xs[Math.min(xs.length - 1, Math.floor(xs.length * 0.9))]];
}
function joeBillingView(u) {
  const b = joeBill(), f = joeFree(u), r = Q(`SELECT joe_autopay FROM users WHERE id=?`).get(u.id) || {};
  return { enabled: b.enabled && joeAiOn(), free_left: f.left, free_daily: f.daily, bonus_left: f.bonus, autopay: !!r.joe_autopay, monthly_cap: joeCap(u), spent_month_credits: joeSpentMonth(u),
    est_range: joeEstimate(false), deep_allowed: joeDeepAllowed(u), deep_est: joeEstimate(true), show_cost: b.show_cost, min_credits: b.min_credits, max_credits: b.max_credits };
}
async function openaiCall(body) {
  const r = await fetch(`${setting('joe.openai_base')}/chat/completions`, { method: 'POST', headers: { authorization: 'Bearer ' + (setting('joe.openai_key') || ''), 'content-type': 'application/json', 'x-title': 'Joinvoo Joe' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || 'HTTP ' + r.status);
  return j;
}
const JOE_ROUNDS = 4, JOE_MAX_TOKENS = 900, JOE_DEEP_ROUNDS = 6, JOE_DEEP_TOKENS = 1600, JOE_PLAYBOOK_CHARS = 12000, JOE_PLAYBOOK_READS = 2;
/** read_playbook for one answer: at most 2 reads, ~12k characters, the sections that best match the question when the playbook is longer. */
function playbookForAnswer(ctx, name) {
  if ((ctx.pbReads = (ctx.pbReads || 0) + 1) > JOE_PLAYBOOK_READS) return { error: `You already opened ${JOE_PLAYBOOK_READS} playbooks for this answer. Answer with what you have.` };
  const r = readPlaybook(name); if (r.error) return r;
  if (r.text.length <= JOE_PLAYBOOK_CHARS) return r;
  const words = String(ctx.q || '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter((w) => w.length > 3 && !JOE_STOP.has(w)).map((w) => w.replace(/(ing|es|s)$/, ''));
  const secs = pbSections(r.text).filter((x) => x.level <= 3).map((x, i) => ({ ...x, i, sc: words.reduce((a, w) => a + (x.title.toLowerCase().includes(w) ? 3 : x.body.toLowerCase().includes(w) ? 1 : 0), 0) }));
  const head = r.text.slice(0, 1200), picked = [];
  let len = head.length;
  for (const x of secs.slice().sort((a, b) => b.sc - a.sc || a.i - b.i)) { const t = `\n\n${'#'.repeat(x.level)} ${x.title}\n${x.body}`; if (len + t.length > JOE_PLAYBOOK_CHARS) continue; if (picked.some((p) => p.i <= x.i && x.body && p.body.includes(x.body))) continue; picked.push({ ...x, t }); len += t.length; }
  const toc = secs.filter((x) => x.level === 2).map((x) => x.title).join(' · ');
  return { name: r.name, source: r.source, text: head + picked.sort((a, b) => a.i - b.i).map((p) => p.t).join('') + `\n\n[Excerpt: the sections that best match the question. Other sections: ${toc}. Ask for one by name if you need it.]`, excerpt: true };
}
/** One AI answer with tool use, with Anthropic or an OpenAI-compatible API. Returns the reply, the tools used and the real token usage.
 *  opts: {model, maxRounds, maxTokens, budgetUsd} — when the running cost (× 1.2 margin) would pass budgetUsd, the next round answers without tools and shorter. */
async function joeAi(u, history, message, opts = {}) {
  const turns = [];
  for (const m of history.slice(-12)) { const role = m.role === 'joe' ? 'assistant' : 'user'; if (!turns.length && role !== 'user') continue; if (turns.length && turns[turns.length - 1].role === role) turns[turns.length - 1].content += '\n\n' + m.text; else turns.push({ role, content: m.text }); }
  if (turns.length && turns[turns.length - 1].role === 'user') turns.pop();
  turns.push({ role: 'user', content: message });
  const provider = joeProvider(), model = opts.model || joeModel(), maxRounds = opts.maxRounds || JOE_ROUNDS, maxTokens = opts.maxTokens || JOE_MAX_TOKENS;
  const tools = [], sp = joeSystemParts(u), defs = joeToolsList(), ctx = { q: message }, usage = { in: 0, cw: 0, cr: 0, out: 0 };
  const res0 = { tools, usage, model, provider, rounds: 0, guard: false };
  const add = (x) => { const n = normUsage(x, provider); for (const k of Object.keys(usage)) usage[k] += n[k]; return joeCostUsd(n, model, provider); };
  let last = 0;
  // stop using tools when one more tool round plus the final answer (each ≈ the last round) would push cost × 1.2 past the most we can charge
  const overBudget = () => opts.budgetUsd && (joeCostUsd(usage, model, provider) + 2 * last) * 1.2 > opts.budgetUsd;
  const exec = (name, args) => { tools.push(name); let out; try { out = name === 'read_playbook' ? playbookForAnswer(ctx, (args || {}).name) : joeTool(u, name, args || {}); } catch (e) { out = { error: e.message }; } return JSON.stringify(out).slice(0, 14000); };
  const fail = (m) => { const e = new Error(m); e.usage = usage; e.rounds = res0.rounds; throw e; };
  if (provider === 'openai') {
    const msgs = [{ role: 'system', content: sp.stat + '\n\n' + sp.ctx }, ...turns];
    const fns = defs.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
    for (let round = 0; round < maxRounds; round++) {
      const final = round === maxRounds - 1 || (round > 0 && overBudget());
      if (final && round < maxRounds - 1) { res0.guard = true; log('joe margin guard: answering without more tools', u.id); }
      let res; try { res = await openaiCall({ model, max_tokens: final && res0.guard ? Math.min(maxTokens, 450) : maxTokens, messages: msgs, ...(final ? {} : { tools: fns, tool_choice: 'auto' }) }); } catch (e) { fail(e.message); }
      res0.rounds++; last = add(res.usage);
      const msg = ((res.choices || [])[0] || {}).message || {};
      const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls.filter((c) => c && c.function) : [];
      if (calls.length && !final) {
        msgs.push({ role: 'assistant', content: msg.content || null, tool_calls: calls });
        for (const c of calls) { let args = {}; try { args = c.function.arguments ? JSON.parse(c.function.arguments) : {}; } catch { args = {}; } msgs.push({ role: 'tool', tool_call_id: c.id, content: exec(c.function.name, args) }); }
        continue;
      }
      const text = String(msg.content || '').trim(); if (!text) fail(calls.length ? 'Too many tool calls' : 'Empty answer');
      return { ...res0, reply: text };
    }
    fail('Too many tool calls');
  }
  // Anthropic: the static system block is cached, and so is the latest tool_result, so later rounds read the conversation from cache
  const system = [{ type: 'text', text: sp.stat, cache_control: { type: 'ephemeral' } }, { type: 'text', text: sp.ctx }];
  const msgs = turns;
  for (let round = 0; round < maxRounds; round++) {
    const final = round === maxRounds - 1 || (round > 0 && overBudget());
    if (final && round < maxRounds - 1) { res0.guard = true; log('joe margin guard: answering without more tools', u.id); }
    let res; try { res = await anthropicCall({ model, max_tokens: final && res0.guard ? Math.min(maxTokens, 450) : maxTokens, system, tools: defs, ...(final ? { tool_choice: { type: 'none' } } : {}), messages: msgs }); } catch (e) { fail(e.message); }
    res0.rounds++; last = add(res.usage);
    const content = Array.isArray(res.content) ? res.content : [];
    const uses = content.filter((c) => c.type === 'tool_use');
    if (res.stop_reason === 'tool_use' && uses.length && !final) {
      for (const m of msgs) if (Array.isArray(m.content)) for (const c of m.content) if (c.type === 'tool_result') delete c.cache_control; // one moving breakpoint
      msgs.push({ role: 'assistant', content });
      const results = uses.map((tu) => ({ type: 'tool_result', tool_use_id: tu.id, content: exec(tu.name, tu.input) }));
      results[results.length - 1].cache_control = { type: 'ephemeral' };
      msgs.push({ role: 'user', content: results });
      continue;
    }
    const text = content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
    if (!text) fail(uses.length ? 'Too many tool calls' : 'Empty answer');
    return { ...res0, reply: text };
  }
  fail('Too many tool calls');
}
const followUps = (q) => { const x = String(q).toLowerCase(); return /scale|best|budget/.test(x) ? ['Why is my cost per FTD up?', 'What should I fix today?'] : /cost|cpa/.test(x) ? ['Which campaign should I scale?', 'How are my ads doing?'] : /fix|problem/.test(x) ? ['How are my ads doing?', 'Which campaign should I scale?'] : SUGGEST.slice(0, 3); };
/** Rule-based answers use the first name now and then (about one in three), never a made-up one. */
function withName(u, r) {
  const fn = firstName(u), n = (Q(`SELECT COUNT(*) n FROM joe_msgs WHERE user_id=?`).get(u.id) || { n: 0 }).n;
  if (!fn || n % 6 !== 4 || !r.reply || r.reply.includes(fn)) return r;
  if (r.reply.startsWith('**')) return { ...r, reply: `Good question, ${fn} 👇\n\n${r.reply}` };
  if (!/^[A-Z]/.test(r.reply)) return r;
  return { ...r, reply: `${fn}, ${/^I\b|^I’|^I'/.test(r.reply) ? r.reply : r.reply[0].toLowerCase() + r.reply.slice(1)}` };
}
/** Answer as Joe: AI with tools when a key is set (falls back to the rules on any error), else the rules. opts go to joeAi (model, rounds, tokens, budget). */
async function joeAnswer(u, message, history = [], opts = {}) {
  if (joeAiOn()) {
    try { const r = await joeAi(u, history, message, opts); return { reply: r.reply, suggestions: followUps(message), ai: true, tools: r.tools, usage: r.usage, model: r.model, provider: r.provider, rounds: r.rounds, guard: r.guard }; }
    catch (e) { log('joe ai failed, using rules:', e.message); const r = withName(u, joeRules(u.id, message)); return { ...r, ai: false, error: e.message, usage: e.usage, rounds: e.rounds || 0, model: opts.model || joeModel(), provider: joeProvider() }; }
  }
  return { ...withName(u, joeRules(u.id, message)), ai: false };
}
/** Record one AI attempt (free, paid, error or an admin test) with its real usage and cost. Returns the row id. */
function joeRecord(u, r, kind, credits = 0, deep = false) {
  const t = r.usage || { in: 0, cw: 0, cr: 0, out: 0 }, cost = joeCostUsd(t, r.model || joeModel(), r.provider || joeProvider());
  return Number(Q(`INSERT INTO joe_answers(user_id,at,day,provider,model,rounds,in_tokens,cache_write_tokens,cache_read_tokens,out_tokens,cost_micros,credits,kind,deep,guard,error) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(u.id, now(), joeDay(u), r.provider || joeProvider(), r.model || joeModel(), r.rounds || 0, t.in, t.cw, t.cr, t.out, Math.round(cost * 1e6), credits, kind, deep ? 1 : 0, r.guard ? 1 : 0, r.error ? String(r.error).slice(0, 200) : null).lastInsertRowid);
}
/** Free, rule-written notes for the pay-as-you-go moments (they never call the AI and never cost anything). */
function joeBillNote(u, why, x = {}) { return { ...joeBillNote0(u, why, x), reason: why }; }
function joeBillNote0(u, why, x = {}) {
  const fn = firstName(u), n = fn ? `, ${fn}` : '', [lo, hi] = joeEstimate(!!x.deep), usd = (c) => '$' + (c / 100).toFixed(2);
  const range = `most answers cost ${lo}–${hi} credits (≈ ${usd(lo)}–${usd(hi)})`;
  const top = { label: 'Top up', tab: 'credits' };
  if (why === 'confirm') return { reply: `You’ve used today’s free chats${n} 😄 Want to keep going with paid answers? ${range[0].toUpperCase() + range.slice(1)}, taken from your credits only when I answer. You can set a monthly limit in Joe’s settings.`, actions: [{ label: 'Continue with credits', confirm_paid: true }, top] };
  if (why === 'balance') return { reply: `You’ve used today’s free chats${n} 😄 Top up credits to keep chatting — ${range}. Your free chats come back at midnight.`, actions: [top] };
  if (why === 'cap') return { reply: `You’ve reached your monthly Joe budget of ${$num(x.cap)} credits${n}. Raise it in Joe’s settings, or wait for next month. Free chats still come back every midnight.`, actions: [{ label: 'Joe settings', joe_settings: true }] };
  if (why === 'off') return { reply: `Paid answers are switched off for your account${n}, and today’s free chats are used up. Turn them on in Joe’s settings, or come back after midnight for new free chats.`, actions: [{ label: 'Joe settings', joe_settings: true }] };
  if (why === 'deep') return { reply: `Deep answers are part of Pro${n}. Regular answers work as usual, and upgrading unlocks the deeper model.`, actions: [{ label: 'See Pro', tab: 'credits' }] };
  return { reply: '' };
}
async function joeApi(req, res, user, m) {
  if (!feature('joe')) return send(res, 403, { error: 'Joe is switched off right now.', off: true });
  const u = joeUser(user.id);
  const bal = () => (Q(`SELECT balance_cents FROM users WHERE id=?`).get(u.id) || {}).balance_cents || 0;
  if (m === 'GET') return send(res, 200, { enabled: true, ai: joeAiOn(), remaining_today: joeRemaining(u), daily_limit: setting('joe.daily_limit'), billing: joeBillingView(u), balance_credits: bal(),
    messages: Q(`SELECT id, role, text, at FROM (SELECT * FROM joe_msgs WHERE user_id=? ORDER BY id DESC LIMIT 60) ORDER BY id`).all(u.id) });
  if (m === 'DELETE') { Q(`DELETE FROM joe_msgs WHERE user_id=?`).run(u.id); return send(res, 200, { ok: true, remaining_today: joeRemaining(u) }); }
  if (m !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  const b = await readJson(req, 16 * 1024);
  const msg = String(b.message || '').trim().slice(0, 500);
  if (!msg) return send(res, 400, { error: 'Ask me something first.' });
  const B = joeBill(), billOn = B.enabled && joeAiOn(), deep = !!b.deep && billOn;
  // what kind of answer this will be: rules (no AI), a free AI answer, or a paid one
  let kind = billOn ? 'paid' : 'free', note = null;
  const fr = billOn ? joeFree(u) : null;
  if (billOn && !deep && (fr.left > 0 || fr.bonus > 0)) kind = 'free';
  if (billOn && isAdmin(user)) kind = 'free'; // owners and admins use Joe for free, like tracking
  if (kind !== 'paid' && joeRemaining(u) <= 0) return send(res, 429, { error: 'You’ve used today’s questions. I’ll be back tomorrow.', remaining_today: 0 });
  if (limited('joe:' + u.id, 12, 60)) return send(res, 429, { error: 'Easy, one question at a time. Try again in a minute.', remaining_today: joeRemaining(u) });
  let maxPrice = 0;
  if (kind === 'paid') {
    if (deep && !joeDeepAllowed(u)) note = joeBillNote(u, 'deep');
    const cap = joeCap(u), capLeft = cap - joeSpentMonth(u);
    if (!note && cap === 0) note = joeBillNote(u, 'off');
    if (!note && capLeft < (deep ? B.deep_min_credits : B.min_credits)) note = joeBillNote(u, 'cap', { cap });
    if (!note && b.confirm_paid) Q(`UPDATE users SET joe_autopay=1 WHERE id=?`).run(u.id);
    if (!note && !b.confirm_paid && !(Q(`SELECT joe_autopay FROM users WHERE id=?`).get(u.id) || {}).joe_autopay) note = { ...joeBillNote(u, 'confirm', { deep }), needs_confirm: true };
    maxPrice = Math.min(B.max_credits, capLeft);
    if (!note && bal() < maxPrice) note = joeBillNote(u, 'balance', { deep });
  }
  const history = Q(`SELECT role, text FROM (SELECT * FROM joe_msgs WHERE user_id=? ORDER BY id DESC LIMIT 12) ORDER BY id`).all(u.id);
  let r, cost = 0, aid = null;
  if (note) r = { reply: note.reply, suggestions: [], ai: false, actions: note.actions, needs_confirm: !!note.needs_confirm, billing_note: true, reason: note.reason || null };
  else {
    const opts = deep ? { model: B.deep_model, maxRounds: JOE_DEEP_ROUNDS, maxTokens: JOE_DEEP_TOKENS } : {};
    if (kind === 'paid') opts.budgetUsd = maxPrice / 100; // margin guard: real cost × 1.2 must stay under the most the user can be charged
    r = await joeAnswer(u, msg, history, opts);
    if (r.ai) {
      if (kind === 'paid') {
        const usd = joeCostUsd(r.usage, r.model, r.provider);
        cost = Math.min(maxPrice, joeCredits(usd, deep));
        if (usd * 1.2 > cost / 100) log('joe margin below 20% on an answer:', u.id, usd.toFixed(5), cost);
      }
    } else if (billOn && r.usage && r.model) joeRecord(u, r, 'error');
  }
  const day = joeDay(u);
  tx(() => {
    if (r.ai && billOn) {
      aid = joeRecord(u, r, kind, cost, deep);
      if (kind === 'free' && fr.left <= 0 && fr.bonus > 0) Q(`UPDATE users SET joe_bonus=MAX(0, joe_bonus-1) WHERE id=?`).run(u.id);
      if (cost > 0) addLedger(u.id, 'joe', -cost, 'joe:' + aid, 'Joe answer');
    } else if (r.ai) joeRecord(u, r, 'free');
    Q(`INSERT INTO joe_msgs(user_id,role,text,at) VALUES(?,?,?,?)`).run(u.id, 'user', msg, now());
    Q(`INSERT INTO joe_msgs(user_id,role,text,at) VALUES(?,?,?,?)`).run(u.id, 'joe', r.reply, now());
    if (!(r.ai && kind === 'paid') && !r.billing_note) Q(`INSERT INTO joe_usage(user_id,day,n) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET n=n+1`).run(u.id, day);
    Q(`DELETE FROM joe_msgs WHERE user_id=? AND id NOT IN (SELECT id FROM joe_msgs WHERE user_id=? ORDER BY id DESC LIMIT 200)`).run(u.id, u.id);
  });
  const bv = billOn ? joeBillingView(u) : null;
  return send(res, 200, { reply: r.reply, suggestions: r.suggestions || [], remaining_today: joeRemaining(u), ai: !!r.ai, cost_credits: cost, deep: !!(deep && r.ai),
    free_left: bv ? bv.free_left + bv.bonus_left : null, needs_confirm: !!r.needs_confirm, reason: r.reason || null, actions: r.actions || [], balance_credits: bal(), billing: bv });
}

/** GET /api/me */
function meView(user) {
  const st = trackingState(user.id);
  const u = Q(`SELECT id, email, name, nickname, gender, avatar, lang, tz, ad_account_id, show_level, free_joins, country, country_changed_at FROM users WHERE id=?`).get(user.id);
  let avatar = null; try { avatar = u.avatar ? JSON.parse(u.avatar) : null; } catch { /* broken avatar */ }
  const stf = staffOf(user);
  return { email: user.email, name: user.name || '', admin: !!stf, staff_role: stf ? stf.role_name : null, verified: !!user.verified_at, email_on: !!resendKey(), welcome_cents: C.WELCOME_CREDIT_CENTS,
    free_joins_gift: C.FREE_JOINS, free_joins_left: u.free_joins || 0, tracking: st.ok, state: st.reason, support: C.SUPPORT_CONTACT, features: features(),
    nickname: u.nickname || '', gender: u.gender || null, avatar, lang: u.lang || null, tz: u.tz || null, ad_account_id: u.ad_account_id ? 'act_' + u.ad_account_id : null,
    display_name: displayName(u), show_level: u.show_level !== 0, plan: userPlan(user.id),
    level: levelView(user.id), levels: setting('levels').map((l) => ({ id: l.id, name: l.name, from: l.from })),
    inbox_unread: inboxUnread(user.id).total, notify_prefs: notifyPrefs(user.id),
    joe: { autopay: !!(Q(`SELECT joe_autopay FROM users WHERE id=?`).get(user.id) || {}).joe_autopay, monthly_cap: joeCap(user) },
    country: u.country || null, country_name: u.country ? COUNTRY.get(u.country).name : null, country_flag: u.country ? flagOf(u.country) : null, country_locked_until: countryLockedUntil(u), sister: sisterPublic(),
    voo: { linked: !!(Q(`SELECT voo_id FROM users WHERE id=?`).get(user.id) || {}).voo_id, login: vooPublic().login, referrals: setting('voo.referrals'), home: setting('voo.home') } };
}

// ---------- inbox API, broadcasts, daily inbox notes, blog API ----------
const inboxItem = (r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body || '', image: r.image || null, cta_label: r.cta_label || null, cta_url: r.cta_url || null,
  important: !!r.important, created_at: r.created_at, read: !!r.read_at });
function inboxUnread(uid) {
  const out = { total: 0, update: 0, account: 0, alert: 0, joe: 0 };
  for (const r of Q(`SELECT kind, COUNT(*) n FROM inbox WHERE user_id=? AND read_at IS NULL GROUP BY kind`).all(uid)) { if (r.kind in out) out[r.kind] = r.n; out.total += r.n; }
  return out;
}
async function inboxApi(req, res, user, p, m, qs) {
  let mm;
  if (p === '/api/inbox' && m === 'GET') {
    const kind = INBOX_KINDS.includes(qs.get('kind')) ? qs.get('kind') : null, before = parseInt(qs.get('before') || '', 10) || null;
    const a = [user.id]; let w = '';
    if (kind) { w += ' AND kind=?'; a.push(kind); }
    if (before) { w += ' AND id<?'; a.push(before); }
    const rows = Q(`SELECT * FROM inbox WHERE user_id=?${w} ORDER BY id DESC LIMIT 31`).all(...a);
    return send(res, 200, { unread: inboxUnread(user.id), items: rows.slice(0, 30).map(inboxItem), more: rows.length > 30 });
  }
  if (p === '/api/inbox/popup' && m === 'GET') {
    const r = Q(`SELECT * FROM inbox WHERE user_id=? AND important=1 AND read_at IS NULL ORDER BY id LIMIT 1`).get(user.id);
    return r ? send(res, 200, inboxItem(r)) : send(res, 200, 'null', { 'content-type': 'application/json; charset=utf-8' });
  }
  if (p === '/api/inbox/read' && m === 'POST') {
    const b = await readJson(req, 64 * 1024);
    if (b.all) { const kind = INBOX_KINDS.includes(b.kind) ? b.kind : null; Q(`UPDATE inbox SET read_at=? WHERE user_id=? AND read_at IS NULL${kind ? ' AND kind=?' : ''}`).run(now(), user.id, ...(kind ? [kind] : [])); }
    else {
      const ids = (Array.isArray(b.ids) ? b.ids : []).map((x) => +x).filter((x) => x > 0).slice(0, 500);
      if (!ids.length) return send(res, 400, { error: 'Send ids:[…] or all:true.' });
      Q(`UPDATE inbox SET read_at=? WHERE user_id=? AND read_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`).run(now(), user.id, ...ids);
    }
    return send(res, 200, { ok: true, unread: inboxUnread(user.id) });
  }
  if ((mm = /^\/api\/inbox\/(\d+)$/.exec(p)) && m === 'DELETE') {
    const r = Q(`DELETE FROM inbox WHERE id=? AND user_id=?`).run(+mm[1], user.id);
    return r.changes ? send(res, 200, { ok: true, unread: inboxUnread(user.id) }) : send(res, 404, { error: 'Not found.' });
  }
  return send(res, 404, { error: 'Not found' });
}
/** PATCH /api/me {notify_prefs:{update:{email:false}, …}} → the stored prefs (unknown kinds ignored). */
function savePrefs(uid, np) {
  if (!np || typeof np !== 'object' || Array.isArray(np)) return { error: 'notify_prefs must look like {update:{email:true}, …}.' };
  const cur = notifyPrefs(uid);
  for (const k of INBOX_KINDS) if (np[k] && typeof np[k] === 'object' && np[k].email !== undefined) cur[k] = { email: !!np[k].email };
  Q(`UPDATE users SET notify_prefs=? WHERE id=?`).run(JSON.stringify(cur), uid);
  return { prefs: cur };
}

/** Broadcasts: one admin message fanned out as an inbox row per matching user (and optionally an email). */
const BC_DIR = path.join(DATA_DIR, 'media', 'broadcast');
function audienceOf(a) {
  a = a && typeof a === 'object' ? a : {};
  const lv = setting('levels');
  return { plan: ['basic', 'pro', 'trial'].includes(a.plan) ? a.plan : 'all', lang: LANGS.includes(a.lang) ? a.lang : 'all', level: lv.some((l) => l.id === a.level) ? a.level : 'all',
    active_days: a.active_days == null || a.active_days === '' || !(+a.active_days > 0) ? null : Math.min(3650, Math.round(+a.active_days)),
    user_ids: (Array.isArray(a.user_ids) ? a.user_ids : []).map((x) => +x).filter((x) => x > 0).slice(0, 5000),
    countries: [...new Set((Array.isArray(a.countries) ? a.countries : []).map(normCountry).filter(Boolean))].slice(0, 260) };
}
function audienceUsers(a) {
  const first = setting('levels')[0].id, w = [`status='active'`], args = [];
  if (a.plan === 'pro') w.push(`plan='pro'`); if (a.plan === 'basic' || a.plan === 'trial') w.push(`COALESCE(plan,'basic')<>'pro'`);
  if (a.lang !== 'all') { w.push(a.lang === 'en' ? `(lang IS NULL OR lang='en')` : `lang=?`); if (a.lang !== 'en') args.push(a.lang); }
  if (a.level !== 'all') { w.push(a.level === first ? `(level_id IS NULL OR level_id=?)` : `level_id=?`); args.push(a.level); }
  if (a.active_days) { w.push(`last_seen>?`); args.push(now() - a.active_days * 864e5); }
  if (a.user_ids.length) { w.push(`id IN (${a.user_ids.map(() => '?').join(',')})`); args.push(...a.user_ids); }
  if (a.countries && a.countries.length) { w.push(`country IN (${a.countries.map(() => '?').join(',')})`); args.push(...a.countries); }
  let rows = Q(`SELECT id, email FROM users WHERE ${w.join(' AND ')} ORDER BY id`).all(...args);
  if (a.plan === 'trial') rows = rows.filter((r) => trialInfo(r.id).status === 'active');
  return rows;
}
function broadcastValidate(b) {
  const t = (v, n) => String(v ?? '').trim().slice(0, n);
  const title = t(b.title, 120); if (!title) return { error: 'Give the message a title.' };
  const body = t(b.body, 4000);
  const image = t(b.image, 500); if (image && !/^(https:\/\/\S+|\/media\/[\w./-]+)$/.test(image)) return { error: 'The image must be an https:// link or an uploaded image.' };
  const cta_label = t(b.cta_label, 40), cta_url = t(b.cta_url, 500);
  if (cta_url && !/^(https:\/\/\S+|#tab:[\w-]{2,30}|\/[\w./#?=&-]*)$/.test(cta_url)) return { error: 'The button link must start with https://, / or #tab: (e.g. #tab:wallet).' };
  if (cta_label && !cta_url) return { error: 'Add a link for the button.' };
  return { title, body, image: image || null, cta_label: cta_label || null, cta_url: cta_url || null, important: b.important ? 1 : 0, also_email: b.also_email ? 1 : 0, audience: audienceOf(b.audience) };
}
function broadcastView(r) {
  let audience = {}; try { audience = JSON.parse(r.audience || '{}'); } catch { /* ignore */ }
  const read = Q(`SELECT COUNT(*) n FROM inbox WHERE broadcast_id=? AND read_at IS NOT NULL`).get(r.id).n;
  return { id: r.id, title: r.title, body: r.body, image: r.image, cta_label: r.cta_label, cta_url: r.cta_url, important: !!r.important, also_email: !!r.also_email, audience,
    created_by: r.created_by, created_at: r.created_at, sent_count: r.sent_count, read_count: Math.max(read, r.read_count || 0),
    emailed: Q(`SELECT COUNT(*) n FROM email_log WHERE kind='broadcast' AND ref=? AND ok IS NOT 2`).get('bc:' + r.id).n };
}
function sendBroadcast(v, by) {
  const users = audienceUsers(v.audience);
  const r = Q(`INSERT INTO broadcasts(title,body,image,cta_label,cta_url,important,audience,also_email,created_by,created_at,sent_count) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(v.title, v.body, v.image, v.cta_label, v.cta_url, v.important, JSON.stringify(v.audience), v.also_email, by, now(), users.length);
  const id = Number(r.lastInsertRowid);
  tx(() => { for (const u of users) inboxAdd(u.id, { kind: 'update', title: v.title, body: v.body, image: v.image, cta_label: v.cta_label, cta_url: v.cta_url, important: v.important, broadcast_id: id }); });
  if (v.also_email) { // emails go out a few at a time, and only to people who keep update emails on
    const list = users.slice(), step = () => { for (const u of list.splice(0, 40)) sendTemplate(u.email, 'broadcast', v, { userId: u.id, ref: 'bc:' + id, noInbox: true }); if (list.length) setTimeout(step, 250).unref(); };
    step();
  }
  log('broadcast', id, by, users.length, 'users');
  return { id, sent_count: users.length };
}

/** Once a day per user (local time): Joe’s tip (top insight) and yesterday’s filtered fake joins. */
function inboxDailyJobs() {
  for (const u of Q(`SELECT id, tz FROM users WHERE status='active'`).all()) {
    try {
      const lc = localClock(u.tz), L = userLang(u.id);
      if (lc.hour < 9) continue;
      const hasCh = Q(`SELECT 1 FROM channels WHERE owner_id=? AND status<>'removed' LIMIT 1`).get(u.id);
      if (feature('joe') && !Q(`SELECT 1 FROM inbox WHERE user_id=? AND tag=?`).get(u.id, 'joetip:' + lc.date)) {
        const items = joeInsights(u.id).items.filter((i) => !i.id.startsWith('note_'));
        const it = items.find((i) => i.level === 'bad' || i.level === 'warn') || items[0];
        if (it) inboxAdd(u.id, { kind: 'joe', title: tr(L, 'inbox.joe_tip', { title: it.title }), body: it.body, cta_label: it.action ? it.action.label : null,
          cta_url: it.action ? '#tab:' + ({ credits: 'wallet' }[it.action.tab] || it.action.tab) : '#tab:joe', tag: 'joetip:' + lc.date });
      }
      if (hasCh) {
        const n = Q(`SELECT COALESCE(SUM(filtered),0) n FROM hourly WHERE owner_id=? AND hour>=? AND hour<?`).get(u.id, Math.floor((lc.dayStart - 864e5) / 3600000), Math.floor(lc.dayStart / 3600000)).n;
        if (n > 0) inboxAdd(u.id, { kind: 'alert', title: tr(L, 'inbox.fake_title', { n: $num(n) }), body: tr(L, 'inbox.fake_body'), cta_label: tr(L, 'inbox.cta_people'), cta_url: '#tab:people', tag: 'fake:' + lc.date });
      }
    } catch (e) { log('inbox daily', u.id, e.message); }
  }
}

// Blog inside the dashboard: posts.json + _body/<slug>.html written by build/build.py. Missing files simply mean no posts yet.
const BLOG_DIR = env.BLOG_DIR || path.join(__dirname, 'public', 'blog');
let blogCache = { key: '', posts: [] };
function blogPosts() {
  const f = path.join(BLOG_DIR, 'posts.json');
  let st; try { st = fs.statSync(f); } catch { blogCache = { key: '', posts: [] }; return []; }
  const key = st.mtimeMs + ':' + st.size;
  if (blogCache.key !== key) {
    let list = []; try { list = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { log('blog posts.json unreadable', e.message); list = []; }
    const posts = (Array.isArray(list) ? list : []).filter((x) => x && /^[a-z0-9][a-z0-9-]{0,119}$/.test(x.slug || '') && x.title).map((x) => ({
      slug: x.slug, title: String(x.title), description: String(x.description || ''), author: String(x.author || 'Joinvoo Team'), date: String(x.date || '').slice(0, 10),
      tags: Array.isArray(x.tags) ? x.tags.map(String).slice(0, 12) : [], cover: x.cover || `/media/blog/${x.slug}.webp`, reading_time: +x.reading_time || null, url: x.url || `/blog/${x.slug}` }));
    posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    blogCache = { key, posts };
  }
  return blogCache.posts;
}
function blogPost(slug) {
  const meta = blogPosts().find((x) => x.slug === slug); if (!meta) return null;
  let html = ''; try { html = fs.readFileSync(path.join(BLOG_DIR, '_body', slug + '.html'), 'utf8').replace(/^\s*<!--[\s\S]*?-->\s*/, '').replaceAll('{{BASE_URL}}', BASE_URL); } catch { html = ''; }
  const related = blogPosts().filter((x) => x.slug !== slug).map((x) => ({ x, n: x.tags.filter((t) => meta.tags.includes(t)).length })).sort((a, b) => b.n - a.n).slice(0, 3).map((r) => r.x);
  return { ...meta, html, related };
}
/** Startup + hourly: a post we haven't seen before, dated within the last 7 days, becomes an inbox note for everyone (no email). */
function blogJobs() {
  const posts = blogPosts(); if (!posts.length) return 0;
  let seen = []; try { seen = JSON.parse((Q(`SELECT value FROM settings WHERE key='blog.seen'`).get() || {}).value || '[]'); } catch { seen = []; }
  const fresh = posts.filter((p) => !seen.includes(p.slug) && p.date && Date.parse(p.date + 'T00:00:00Z') >= Date.now() - 7 * 864e5);
  let n = 0;
  if (fresh.length) {
    const users = Q(`SELECT id FROM users WHERE status='active'`).all();
    tx(() => { for (const p of fresh.slice().reverse()) for (const u of users) { const L = userLang(u.id);
      if (inboxAdd(u.id, { kind: 'update', title: tr(L, 'inbox.blog_title', { title: p.title }), body: p.description, image: p.cover, cta_label: tr(L, 'inbox.blog_cta'), cta_url: '#tab:learn', tag: 'blog:' + p.slug })) n++; } });
  }
  Q(`INSERT INTO settings(key,value,updated_at) VALUES('blog.seen',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`).run(JSON.stringify([...new Set([...seen, ...posts.map((p) => p.slug)])]), now());
  settingsCache = null;
  if (n) log('blog: new posts announced in', n, 'inbox rows');
  return n;
}
function csvCell(v) { v = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }

async function api(req, res, url, user) {
  const p = url.pathname, m = req.method, qs = url.searchParams; let mm0b;

  if (p === '/api/signup' && m === 'POST') {
    if (!feature('signup')) return send(res, 403, { error: 'Sign-ups are closed right now.', closed: true });
    if (vooLoginOn() && setting('voo.login_mode') === 'only') return send(res, 403, { error: 'Create your account with VooSquare.', voo_only: true, url: '/auth/voosquare' });
    if (limited('signup:' + clientIp(req), 8, 3600)) return send(res, 429, { error: 'Too many sign-ups from your network. Try again in an hour.' });
    const b = await readJson(req);
    const email = String(b.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'Enter a valid email.' });
    if (String(b.password || '').length < 8) return send(res, 400, { error: 'Use at least 8 characters for your password.' });
    if (Q(`SELECT 1 FROM users WHERE email=?`).get(email)) return send(res, 400, { error: 'That email already has an account. Log in instead.' });
    const country = normCountry(b.country);
    if (!country) return send(res, 400, { error: 'Choose the country you’re based in.', field: 'country' });
    const refCode = feature('referrals') ? String(b.ref || cookies(req).joinvoo_ref || '').trim().toLowerCase() : '';
    const referrer = refCode ? Q(`SELECT id FROM users WHERE ref_code=?`).get(refCode) : null;
    if (b.ref && refCode && !referrer) return send(res, 400, { error: 'That referral code doesn’t exist. Check it, or leave it empty.' });
    const pc = profileChanges({ nickname: b.nickname, gender: b.gender, avatar: b.avatar, lang: b.lang, tz: b.tz }, false);
    if (pc.error) return send(res, 400, { error: pc.error });
    const prof = b.profile && typeof b.profile === 'object' ? JSON.stringify({ track: [].concat(b.profile.track || []).slice(0, 5), ads: [].concat(b.profile.ads || []).slice(0, 5), spend: String(b.profile.spend || '').slice(0, 20) }) : null;
    const r = Q(`INSERT INTO users(email,pass,created_at,ref_code,referred_by,name,profile,canon) VALUES(?,?,?,?,?,?,?,?)`)
      .run(email, hashPass(String(b.password)), now(), newRefCode(), referrer ? referrer.id : null, String(b.name || '').trim().slice(0, 80) || null, prof, canonicalEmail(email));
    const uid = Number(r.lastInsertRowid);
    const ps = Object.entries(pc.set || {}).filter(([k]) => ['nickname', 'gender', 'avatar', 'lang', 'tz'].includes(k));
    if (ps.length) Q(`UPDATE users SET ${ps.map(([k]) => k + '=?').join(', ')} WHERE id=?`).run(...ps.map(([, v]) => v), uid);
    setUserCountry(uid, country, 'signup');
    affAttach(req, uid, b.aff || null);
    // With email set up, the welcome credit arrives when they confirm their inbox. Without it, straight away.
    if (!resendKey()) grantWelcome(uid);
    sendTemplate(email, 'welcome', welcomeData(String(b.name || '').trim(), uid), { userId: uid });
    if (setting('trial.starts') === 'signup') checkTrial(uid);
    log('signup', email, referrer ? 'ref ' + referrer.id : '');
    return startSession(res, uid, email);
  }
  if (p === '/api/login' && m === 'POST') {
    const b = await readJson(req);
    const email = String(b.email || '').trim().toLowerCase();
    if (limited('login:' + clientIp(req), 30, 900) || limited('login:' + email, 10, 900)) return send(res, 429, { error: 'Too many tries. Wait 15 minutes, or reset your password.' });
    const u = Q(`SELECT * FROM users WHERE email=?`).get(email);
    if (!u || !checkPass(String(b.password || ''), u.pass)) return send(res, 400, { error: 'Email or password is wrong.' });
    if (u.status === 'suspended') return send(res, 403, { error: 'This account is suspended. Contact support.' });
    // VooSquare-only mode: password login stays open for staff only (break-glass at /login?local=1)
    if (vooLoginOn() && setting('voo.login_mode') === 'only' && !staffOf(u)) return send(res, 403, { error: 'Log in with VooSquare.', voo_only: true, url: '/auth/voosquare' });
    if (!resendKey() && feature('joe')) notifyUser(u.id, 'meet_joe', {}, { once: true }); // without email, Joe says hi at the first login (it goes to the log)
    return startSession(res, u.id, u.email);
  }
  if (p === '/api/logout' && m === 'POST') {
    const t = cookies(req).jp_session, sess = t ? Q(`SELECT via, id_token FROM sessions WHERE token=?`).get(t) : null;
    if (t) Q(`DELETE FROM sessions WHERE token=?`).run(t);
    const out = vooLogoutUrl(sess);
    return send(res, 200, { ok: true, logout_url: out }, { 'set-cookie': cookie('jp_session', '', 0) });
  }
  if (p === '/api/forgot' && m === 'POST') {
    const b = await readJson(req);
    const email = String(b.email || '').trim().toLowerCase();
    if (limited('forgot:' + clientIp(req), 10, 3600) || limited('forgot:' + email, 3, 3600)) return send(res, 429, { error: 'Too many reset emails. Try again in an hour.' });
    const u = Q(`SELECT id, email, name FROM users WHERE email=? AND status<>'suspended'`).get(email);
    if (u) {
      const token = rid(24);
      Q(`DELETE FROM resets WHERE user_id=?`).run(u.id);
      Q(`INSERT INTO resets(token_hash,user_id,expires_at) VALUES(?,?,?)`).run(sha256(token), u.id, now() + 3600000);
      sendTemplate(u.email, 'password_reset', { url: `${BASE_URL}/app?reset=${token}` }, { userId: u.id });
    }
    if (!resendKey()) { log('forgot password: no email provider set (RESEND_API_KEY), reset email not sent for', email);
      return send(res, 200, { ok: true, no_email: true, message: 'We can’t email reset links right now. Tap the chat button on this page and our team will reset your password for you.' }); }
    return send(res, 200, { ok: true, message: 'If that email has an account, a reset link is on its way. Check spam too.' });
  }
  if (p === '/api/reset' && m === 'POST') {
    const b = await readJson(req);
    if (limited('reset:' + clientIp(req), 20, 3600)) return send(res, 429, { error: 'Too many tries. Try again later.' });
    if (String(b.password || '').length < 8) return send(res, 400, { error: 'Use at least 8 characters for your password.' });
    const r = Q(`SELECT * FROM resets WHERE token_hash=?`).get(sha256(String(b.token || '')));
    if (!r || r.expires_at < now()) return send(res, 400, { error: 'This reset link has expired or was already used. Ask for a new one.' });
    Q(`UPDATE users SET pass=?, verified_at=COALESCE(verified_at, ?) WHERE id=?`).run(hashPass(String(b.password)), now(), r.user_id); // the link proves they own the inbox
    staffBust();
    if (resendKey()) grantWelcome(r.user_id);
    Q(`DELETE FROM resets WHERE user_id=?`).run(r.user_id);
    Q(`DELETE FROM sessions WHERE user_id=?`).run(r.user_id);
    const u = Q(`SELECT email FROM users WHERE id=?`).get(r.user_id);
    sendTemplate(u.email, 'password_changed', { when: now() }, { userId: r.user_id });
    return startSession(res, r.user_id, u.email);
  }
  if (p === '/api/support') return feature('support_chat') ? supportApi(req, res, url, user) : send(res, 403, { error: 'Live chat is switched off right now.', off: true });
  if (p === '/api/config') return send(res, 200, publicConfig());
  if (p === '/api/voosquare/summary') {
    const k = vooEventsOn() ? voo.kit() : null; // the kit checks the Bearer API key and answers {"linked": false} for an unknown Voo ID
    if (k) return k.summaryHandler((vooId, period) => { const r = vooSummary(vooId, period); return r.linked ? r : null; })(req, res);
    if (!vooAuthOk(req)) return send(res, 401, { error: 'unauthorized' });
    const r = vooSummary(qs.get('voo_id'), qs.get('period') || '7d');
    return send(res, 200, r);
  }
  if (p.startsWith('/api/voosquare/support/')) {
    if (!vooAuthOk(req)) return send(res, 401, { error: 'unauthorized' });
    if (p === '/api/voosquare/support/webhook' && m === 'POST') {
      const b = await readJson(req, 64 * 1024);
      if (b.type && b.type !== 'support.reply') return send(res, 200, { ok: true, ignored: true });
      const r = vooSupportReply(b); return send(res, r.status || 200, r);
    }
    const tview = (t) => ({ ref: 'jv-' + t.id, subject: 'Joinvoo support chat', status: t.status === 'closed' ? 'solved' : 'open', priority: 'normal', box_id: 'general', source: 'joinvoo',
      customer: { name: t.uname || t.name || null, email: t.uemail || t.email || null, voo_id: t.voo_id || null }, last_message: t.last_body ? String(t.last_body).slice(0, 200) : '', unread: t.unread_admin || 0,
      updated_at: new Date(t.last_at || t.created_at).toISOString(), created_at: new Date(t.created_at).toISOString(), url: `${BASE_URL}/admin#support` });
    const TSEL = `SELECT t.*, u.email AS uemail, u.name AS uname, u.voo_id, (SELECT body FROM ticket_msgs WHERE ticket_id=t.id ORDER BY id DESC LIMIT 1) AS last_body FROM tickets t LEFT JOIN users u ON u.id=t.user_id`;
    if (p === '/api/voosquare/support/boxes' && m === 'GET') return send(res, 200, { boxes: [{ id: 'general', name: 'General', open: cnt(`SELECT COUNT(*) FROM tickets WHERE status='open'`) }] });
    if (p === '/api/voosquare/support/tickets' && m === 'GET') {
      const st = qs.get('status'), q = String(qs.get('q') || '').trim().slice(0, 80), a = []; let w = ' WHERE 1=1';
      if (st === 'solved' || st === 'closed') w += " AND t.status='closed'"; else if (st !== 'all') w += " AND t.status='open'";
      if (qs.get('view') === 'unassigned') w += ' AND t.assigned_to IS NULL';
      if (q) { w += ' AND (COALESCE(u.email,t.email) LIKE ? OR COALESCE(u.name,t.name) LIKE ?)'; a.push(`%${q}%`, `%${q}%`); }
      return send(res, 200, { tickets: Q(`${TSEL}${w} ORDER BY t.last_at DESC LIMIT 200`).all(...a).map(tview) });
    }
    let tm;
    if ((tm = /^\/api\/voosquare\/support\/tickets\/jv-(\d+)(\/reply|\/update)?$/.exec(p))) {
      const t = Q(`${TSEL} WHERE t.id=?`).get(+tm[1]); if (!t) return send(res, 404, { error: 'not found' });
      if (!tm[2] && m === 'GET') {
        const msgs = Q(`SELECT id, from_admin, body, created_at, agent_email, agent_name, source FROM ticket_msgs WHERE ticket_id=? ORDER BY id LIMIT 500`).all(t.id);
        return send(res, 200, { ticket: tview(t), messages: msgs.map((x) => ({ id: x.id, from: x.from_admin ? 'agent' : 'customer', body: x.body, created_at: new Date(x.created_at).toISOString(),
          agent: x.from_admin ? (x.source === 'voosquare' ? x.agent_name || 'Zedapex support' : (agentFor(x.agent_email) || { name: 'Joinvoo team' }).name) : null, source: x.source || 'joinvoo' })) });
      }
      const b = await readJson(req, 32 * 1024);
      if (tm[2] === '/reply' && m === 'POST') {
        if (b.note) return send(res, 200, { ok: true, note: true }); // internal notes stay in VooSquare
        const staff = b.voo_id ? Q(`SELECT name, email FROM users WHERE voo_id=?`).get(String(b.voo_id)) : null;
        const r = vooSupportReply({ external_ref: 'joinvoo-' + t.id, body: b.text || b.body, agent: b.agent || (staff && (staff.name || staff.email)) || 'Zedapex support', message_id: b.message_id || rid(10) });
        return send(res, r.status || 200, r);
      }
      if (tm[2] === '/update' && m === 'POST') {
        if (b.status) Q(`UPDATE tickets SET status=? WHERE id=?`).run(['solved', 'closed'].includes(String(b.status)) ? 'closed' : 'open', t.id);
        return send(res, 200, { ok: true });
      }
    }
    return send(res, 404, { error: 'not found' });
  }
  if (p === '/api/apps/click' && m === 'POST') {
    const b = await readJson(req), id = String(b.id || ''), a = (setting('apps') || []).find((x) => x.id === id && x.enabled);
    if (!a || !feature('sister_promo')) return send(res, 404, { error: 'Not available.' });
    if (!limited('apps:' + clientIp(req) + ':' + id, 30, 3600)) { const c = { ...(setting('apps.clicks') || {}) }; c[id] = (c[id] || 0) + 1; setSetting('apps.clicks', c); }
    return send(res, 200, { ok: true, url: appUrl(a, b.where) });
  }
  if (p === '/api/sister/click' && m === 'POST') {
    const sp = sisterPublic();
    if (!sp.enabled) return send(res, 404, { error: 'Not available.' });
    if (!limited('sister:' + clientIp(req), 20, 3600)) { Q(`INSERT INTO settings(key,value,updated_at) VALUES('sister.clicks','1',?) ON CONFLICT(key) DO UPDATE SET value=CAST(value AS INTEGER)+1, updated_at=excluded.updated_at`).run(now()); settingsCache = null; }
    return send(res, 200, { ok: true, url: sp.url });
  }
  if (p === '/api/geo') return send(res, 200, { country: geoCountry(req) }, { 'cache-control': 'private, no-store', vary: 'accept-language, cf-ipcountry' });
  if (p === '/api/countries') return sendStatic(req, res, path.join(__dirname, 'public', 'countries.json'), 'application/json; charset=utf-8', { maxAge: 86400 });
  if (p === '/api/sales' && m === 'POST') return salesLead(req, res, user);
  if (p === '/api/blog') return send(res, 200, { posts: blogPosts() }, { 'cache-control': 'public, max-age=300' });
  if ((mm0b = /^\/api\/blog\/([a-z0-9][a-z0-9-]{0,119})$/.exec(p))) { const bp = blogPost(mm0b[1]); return bp ? send(res, 200, bp, { 'cache-control': 'public, max-age=300' }) : send(res, 404, { error: 'Post not found.' }); }
  if (!user) return send(res, 401, { error: 'Please log in.' });

  let mm0;
  if (p === '/api/me' && m === 'PATCH') {
    const b = await readJson(req, 16 * 1024);
    const pc = profileChanges(b, true); if (pc.error) return send(res, 400, { error: pc.error });
    if (b.country !== undefined) {
      const c = normCountry(b.country); if (!c) return send(res, 400, { error: 'Choose a country from the list.', field: 'country' });
      const cur = Q(`SELECT country, country_changed_at FROM users WHERE id=?`).get(user.id);
      if (cur.country !== c) {
        const until = countryLockedUntil(cur);
        if (until) return send(res, 400, { error: 'country_locked', until, message: tr(userLang(user.id), 'country.locked', { date: new Date(until).toISOString().slice(0, 10) }) });
        setUserCountry(user.id, c, 'user');
      }
    }
    if (b.notify_prefs !== undefined) { const r = savePrefs(user.id, b.notify_prefs); if (r.error) return send(res, 400, r); }
    if (b.joe_autopay !== undefined) Q(`UPDATE users SET joe_autopay=? WHERE id=?`).run(b.joe_autopay ? 1 : 0, user.id);
    if (b.joe_monthly_cap !== undefined) {
      const c = b.joe_monthly_cap === null ? null : Math.round(Number(b.joe_monthly_cap));
      if (c !== null && !(Number.isFinite(c) && c >= 0 && c <= 10000000)) return send(res, 400, { error: 'Monthly Joe budget: a whole number of credits from 0 (no paid answers) up.' });
      Q(`UPDATE users SET joe_monthly_cap=? WHERE id=?`).run(c, user.id);
    }
    const e = Object.entries(pc.set);
    if (e.length) Q(`UPDATE users SET ${e.map(([k]) => k + '=?').join(', ')} WHERE id=?`).run(...e.map(([, v]) => v), user.id);
    return send(res, 200, { ok: true, ...meView(user) });
  }
  if (p === '/api/me') return send(res, 200, meView(user));
  if (p === '/api/verify/resend' && m === 'POST') {
    if (limited('verify:' + user.id, 3, 3600)) return send(res, 429, { error: 'We just sent one. Check your inbox and spam, or try again in an hour.' });
    if (!user.verified_at) sendTemplate(user.email, 'welcome', welcomeData(user.name || '', user.id, true), { userId: user.id });
    return send(res, 200, { ok: true });
  }
  if (p === '/api/password' && m === 'POST') {
    const b = await readJson(req);
    const u = Q(`SELECT pass FROM users WHERE id=?`).get(user.id);
    if (!checkPass(String(b.current || ''), u.pass)) return send(res, 400, { error: 'Your current password is wrong.' });
    if (String(b.password || '').length < 8) return send(res, 400, { error: 'Use at least 8 characters for your new password.' });
    Q(`UPDATE users SET pass=? WHERE id=?`).run(hashPass(String(b.password)), user.id);
    Q(`DELETE FROM sessions WHERE user_id=? AND token<>?`).run(user.id, cookies(req).jp_session);
    sendTemplate(user.email, 'password_changed', { when: now() }, { userId: user.id });
    return send(res, 200, { ok: true });
  }
  if (p.startsWith('/api/admin/')) {
    const st = staffOf(user);
    if (!st) return send(res, 403, { error: isAdminEmail(user.email) || Q(`SELECT 1 FROM staff WHERE user_id=? AND status<>'suspended'`).get(user.id) ? 'Confirm your email first. Check your inbox (or the server log) for the link.' : 'Staff only. Ask an owner to invite you.' });
    const need = adminPerm(p, req.method);
    const ok = need === null || [].concat(need).some((x) => st.perms.has(x));
    if (!ok) return send(res, 403, { error: `Your role (${st.role_name}) can’t do this. It needs the “${[].concat(need).map((x) => PERMS[x] || x).join('” or “')}” permission. Ask an owner.`, need: [].concat(need) });
    if (!st.last || now() - st.last > 60000) { Q(`UPDATE staff SET last_active=? WHERE user_id=?`).run(now(), user.id); st.last = now(); }
    req._staff = st;
    await adminApi(req, res, url, user, st);
    if (req.method !== 'GET' && res.statusCode < 400 && !req._noAudit && !/\/(preview|test)$/.test(p)) auditAuto(req, p, st);
    return;
  }
  if (p.startsWith('/api/referrals') && !feature('referrals')) return send(res, 403, { error: 'The referral program is switched off right now.', off: true });
  if (p === '/api/referrals') return send(res, 200, referrals(user));
  if (p === '/api/billing') return send(res, 200, billing(user));
  if (p === '/api/billing/plan' && m === 'POST') { const r = changePlan(user, String((await readJson(req)).plan || '')); return send(res, r.error ? 400 : 200, r); }
  if (p === '/api/billing/methods') { const uc = userCountry(user.id); return send(res, 200, { country: uc, country_name: uc ? COUNTRY.get(uc).name : null, methods: payMethods(false, uc).map(pmPublic) }); }
  if (p === '/api/billing/topup' && m === 'POST') { const r = await topup(user, await readJson(req)); return send(res, r.error ? 400 : 200, r); }
  if (p === '/api/billing/deposit' && m === 'POST') { const r = await startDeposit(user, await readJson(req)); return send(res, r.error ? 400 : 200, r); }
  if (p === '/api/billing/promo') { const cents = qs.get('amount') ? Math.round(Number(qs.get('amount')) * 100) : null; return send(res, 200, promoCheck(qs.get('code'), user.id, cents)); }
  if (p === '/api/billing/verify') { const r = await verifyDeposit(user, qs.get('ref')); return send(res, r.error ? 404 : 200, r); }
  if (p === '/api/referrals/credit' && m === 'POST') {
    const rb = refBalance(user.id);
    if (rb.balance <= 0) return send(res, 400, { error: 'You have no balance to move yet.' });
    addLedger(user.id, 'refcredit', rb.balance, 'refc:' + rid(10), 'From referral earnings');
    return send(res, 200, { ok: true, moved_cents: rb.balance });
  }
  if (p === '/api/referrals/withdraw' && m === 'POST') {
    if (!feature('withdrawals')) return send(res, 403, { error: 'Withdrawals are paused right now. You can still move your earnings to your wallet.', off: true });
    const b = await readJson(req); const rbw = refBalance(user.id); const r = { balance_cents: rbw.withdrawable };
    if (rbw.withdrawable < C.WITHDRAW_MIN_CENTS && rbw.balance >= C.WITHDRAW_MIN_CENTS) return send(res, 400, { error: `Some of your earnings are still settling. Earnings can be withdrawn ${C.REF_HOLD_DAYS} days after they’re made; right now $${(rbw.withdrawable / 100).toFixed(2)} is ready.` });
    if (Q(`SELECT 1 FROM payouts WHERE user_id=? AND status='pending'`).get(user.id)) return send(res, 400, { error: 'You already have a withdrawal being processed. It usually lands within 24 hours.' });
    if (r.balance_cents < C.WITHDRAW_MIN_CENTS) return send(res, 400, { error: `You can withdraw once your balance reaches $${(C.WITHDRAW_MIN_CENTS / 100).toFixed(0)}.` });
    const method = ['usdt', 'btc'].includes(b.method) ? b.method : null;
    const details = String(b.details || '').trim();
    if (!method) return send(res, 400, { error: 'Choose USDT (TRC20) or BTC.' });
    if (method === 'usdt' && !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(details)) return send(res, 400, { error: 'That doesn’t look like a USDT TRC20 address. It starts with T and is 34 characters.' });
    if (method === 'btc' && !/^(bc1[02-9ac-hj-np-z]{11,71}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/.test(details)) return send(res, 400, { error: 'That doesn’t look like a Bitcoin address. It starts with bc1, 1 or 3.' });
    Q(`INSERT INTO payouts(user_id,amount_cents,method,details,created_at) VALUES(?,?,?,?,?)`).run(user.id, r.balance_cents, method, details, now());
    log('payout requested', user.email, r.balance_cents / 100, method);
    sendTemplate(user.email, 'payout_requested', { amount_cents: r.balance_cents, method, details }, { userId: user.id });
    return send(res, 200, { ok: true, amount_cents: r.balance_cents });
  }
  if (p === '/api/stats') return send(res, 200, stats(user, qs));
  if (p === '/api/compare/periods') { const r = comparePeriods(user, qs); return send(res, r.error ? 400 : 200, r); }
  if (p === '/api/compare/insights') { const r = compareInsights(user, qs); return send(res, r.error ? 400 : 200, r); }
  if (p === '/api/compare/campaigns') return send(res, 200, compareCampaigns(user, qs));
  if (p === '/api/joe/insights') return feature('joe') ? send(res, 200, joeInsights(user.id)) : send(res, 403, { error: 'Joe is switched off right now.', off: true });
  if (p === '/api/joe/chat') return joeApi(req, res, user, m);
  if (p === '/api/inbox' || p.startsWith('/api/inbox/')) return inboxApi(req, res, user, p, m, qs);
  if (p === '/api/funnel') return send(res, 200, funnel(user, qs));
  if (p === '/api/cohorts') return send(res, 200, cohorts(user, qs));
  if (p === '/api/integrations' || p.startsWith('/api/integrations/')) {
    if (!feature('integrations')) return send(res, 403, { error: 'Integrations are switched off right now.', off: true });
    if (p === '/api/integrations' && m === 'GET') return send(res, 200, integrationsFor(user));
    const im = /^\/api\/integrations\/([\w-]{1,40})\/connect$/.exec(p);
    if (im && (m === 'POST' || m === 'DELETE')) {
      if (!Q(`SELECT 1 FROM integrations WHERE id=?`).get(im[1])) return send(res, 404, { error: 'Integration not found.' });
      if (m === 'POST') Q(`INSERT INTO user_integrations(user_id,integration_id,connected_at) VALUES(?,?,?) ON CONFLICT DO UPDATE SET connected_at=excluded.connected_at`).run(user.id, im[1], now());
      else Q(`UPDATE user_integrations SET connected_at=NULL WHERE user_id=? AND integration_id=?`).run(user.id, im[1]);
      return send(res, 200, { ok: true, ...integrationsFor(user) });
    }
  }
  if (p === '/api/spend' || p.startsWith('/api/spend/')) {
    if (!feature('spend')) return send(res, 403, { error: 'Ad spend is switched off right now.', off: true });
    const r = await spendApi(req, user, p, m, qs); return send(res, r.error ? (r.status || 400) : 200, r);
  }
  if (p === '/api/alerts') {
    if (m === 'GET') return send(res, 200, alertsView(user));
    if (!feature('alerts')) return send(res, 403, { error: 'Telegram alerts are coming soon.', off: true });
    const b = await readJson(req);
    const cur = alertPrefs(user.id), next = {};
    for (const k of Object.keys(ALERT_DEFAULTS)) next[k] = b.prefs && b.prefs[k] !== undefined ? !!b.prefs[k] : cur[k];
    Q(`UPDATE users SET alert_prefs=? WHERE id=?`).run(JSON.stringify(next), user.id);
    if (b.disconnect) Q(`UPDATE users SET alert_chat_id=NULL WHERE id=?`).run(user.id);
    return send(res, 200, alertsView(user));
  }
  if (p === '/api/compare') return send(res, 200, compare(user, qs));
  if (p === '/api/breakdown') return send(res, 200, breakdown(user, qs));
  if (p === '/api/conversions' && m === 'GET') return send(res, 200, conversionsView(user, qs));
  if (p === '/api/conversions/rotate' && m === 'POST') { Q(`UPDATE users SET pb_key=NULL WHERE id=?`).run(user.id); return send(res, 200, { ok: true, postback_url: `${BASE_URL}/pb/${pbKey(user.id)}` }); }
  if ((mm0 = /^\/api\/joins\/(\d+)\/convert$/.exec(p)) && m === 'POST') {
    if (!feature('ftd')) return send(res, 403, { error: 'Deposit tracking is switched off right now.', off: true });
    const b = await readJson(req);
    const value = Math.round((parseFloat(b.value) || 0) * 100);
    if (value < 0 || value > 1e9) return send(res, 400, { error: 'Enter the amount in your currency, like 50.' });
    const r = recordConversion(user.id, { joinId: +mm0[1], event: b.event || 'ftd', valueCents: value, currency: b.currency || 'USD', txid: b.txid ? String(b.txid).slice(0, 120) : null, source: 'manual' });
    if (r.error) return send(res, 400, r);
    if (!r.matched) return send(res, 404, { error: 'Person not found.' });
    return send(res, 200, r);
  }
  if (p === '/api/joins') {
    const limit = Math.min(100, +qs.get('limit') || 50), offset = Math.max(0, +qs.get('offset') || 0);
    return send(res, 200, joinsQuery(user, qs, limit, offset));
  }
  if (p === '/api/joins.csv') {
    const { rows } = joinsQuery(user, qs, 100000, 0);
    const cols = ['joined_at', 'channel', 'tg_user_id', 'username', 'first_name', 'last_name', 'language', 'premium', 'source', 'seconds_to_join', 'country', 'utm_campaign', 'utm_source', 'utm_content', 'fbclid', 'ttclid', 'sccid', 'meta_status', 'tiktok_status', 'snap_status', 'registered', 'first_deposit', 'deposit_total', 'left_at'];
    const lines = [cols.join(',')];
    for (const r of rows) lines.push([new Date(r.joined_at).toISOString(), r.channel_title, r.tg_user_id, r.username, r.first_name, r.last_name, r.lang,
      r.is_premium ? 'yes' : 'no', r.click_id ? 'ad' : 'organic', r.click_ts ? Math.max(0, Math.round((r.joined_at - r.click_ts) / 1000)) : '', r.country,
      r.params.utm_campaign, r.params.utm_source, r.params.utm_content, r.fbclid, r.ttclid, r.sccid, r.capi_status, r.tt_status, r.sc_status,
      r.convs.some((v) => v.event === 'reg') ? 'yes' : '', (r.convs.find((v) => v.event === 'ftd') || {}).value_cents / 100 || (r.convs.some((v) => v.event === 'ftd') ? 0 : ''),
      r.convs.filter((v) => v.event === 'ftd' || v.event === 'dep').reduce((a, v) => a + v.value_cents, 0) / 100 || '', r.left_at ? new Date(r.left_at).toISOString() : ''].map(csvCell).join(','));
    return send(res, 200, lines.join('\n'), { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="joinvoo-joins.csv"' });
  }
  if (p === '/api/channels' && m === 'GET') return send(res, 200, channelsView(user));
  if (p === '/api/bots' && m === 'POST') { const r = await connectBot(user, (await readJson(req)).token); return send(res, r.limit ? 402 : r.error ? 400 : 200, r); }
  let mm;
  if ((mm = /^\/api\/bots\/(\d+)$/.exec(p)) && m === 'DELETE') {
    const bot = Q(`SELECT * FROM bots WHERE id=? AND owner_id=?`).get(+mm[1], user.id);
    if (!bot) return send(res, 404, { error: 'Bot not found.' });
    await tg(bot.token, 'deleteWebhook');
    Q(`UPDATE bots SET status='deleted', token=NULL WHERE id=?`).run(bot.id);
    Q(`UPDATE links SET status='dead' WHERE bot_id=? AND status IN ('pool','assigned')`).run(bot.id);
    for (const r of Q(`SELECT channel_id FROM channel_bots WHERE bot_id=?`).all(bot.id)) { recomputeChannel(r.channel_id); Q(`UPDATE channels SET removed_by_user=1, locked=0 WHERE id=? AND status='removed'`).run(r.channel_id); }
    Q(`UPDATE channels SET removed_by_user=1, locked=0 WHERE owner_id=? AND bot_id=? AND type='bot' AND status='removed'`).run(user.id, bot.id);
    unlockChannels(user.id);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/bot-targets' && m === 'POST') {
    const b = await readJson(req);
    const bot = Q(`SELECT * FROM bots WHERE id=? AND owner_id=? AND status='active'`).get(+b.bot_id, user.id);
    if (!bot) return send(res, 400, { error: 'Connect the bot first.' });
    { const ex = Q(`SELECT status, locked FROM channels WHERE owner_id=? AND chat_id=?`).get(user.id, bot.tg_id); if (!ex || ex.status === 'removed') { const lh = limitHit(user.id, 'channels'); if (lh) return send(res, 402, lh); } }
    const fw = String(b.forward_url || '').trim();
    if (fw && !publicHttpsUrl(fw)) return send(res, 400, { error: 'The forwarding address must be a public https:// address.' });
    const fsec = String(b.forward_secret ?? '').trim();
    if (fsec && !/^[A-Za-z0-9_-]{1,256}$/.test(fsec)) return send(res, 400, { error: 'The secret token can only have letters, numbers, _ and -.' });
    let ch = Q(`SELECT * FROM channels WHERE owner_id=? AND chat_id=?`).get(user.id, bot.tg_id);
    const welcome = String(b.welcome ?? (ch && ch.welcome) ?? '').slice(0, 1000) || null;
    const bt = String(b.btn_text ?? '').slice(0, 40) || null, bu = String(b.btn_url ?? '').slice(0, 300) || null;
    if (!ch) {
      Q(`INSERT INTO channels(owner_id,bot_id,chat_id,title,type,username,slug,status,created_at,welcome,btn_text,btn_url,forward_url) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(user.id, bot.id, bot.tg_id, '@' + bot.username, 'bot', bot.username, rid(5), 'active', now(), welcome, bt, bu, fw || null);
    } else {
      Q(`UPDATE channels SET status='active', removed_by_user=0, welcome=?, btn_text=?, btn_url=?, forward_url=? WHERE id=?`).run(welcome, bt, bu, fw || null, ch.id);
    }
    ch = Q(`SELECT id FROM channels WHERE owner_id=? AND chat_id=?`).get(user.id, bot.tg_id);
    if (b.forward_secret !== undefined) Q(`UPDATE channels SET forward_secret=? WHERE id=?`).run(fsec || null, ch.id);
    return send(res, 200, { ok: true, channel: ch.id });
  }
  if (p === '/api/bot-targets/external' && m === 'POST') {
    // Track a bot WITHOUT giving us its token: the bot keeps running where it is and reports each Start to our hook.
    if (!feature('bot_no_token')) return send(res, 403, { error: 'Tracking a bot without its token is switched off right now.', off: true });
    const b = await readJson(req);
    const un = String(b.username || '').trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//, '');
    if (!/^[A-Za-z]\w{3,30}bot$/i.test(un)) return send(res, 400, { error: 'Enter your bot’s username. It ends in “bot”, like @mystore_bot.' });
    const taken = Q(`SELECT 1 FROM channels WHERE type='bot' AND lower(username)=? AND owner_id<>? AND status='active'`).get(un.toLowerCase(), user.id);
    if (taken) return send(res, 400, { error: 'This bot is already tracked by another Joinvoo account.' });
    let ch = Q(`SELECT * FROM channels WHERE owner_id=? AND type='bot' AND lower(username)=?`).get(user.id, un.toLowerCase());
    if (!ch || ch.status === 'removed') { const lh = limitHit(user.id, 'channels'); if (lh) return send(res, 402, lh); }
    if (!ch) {
      Q(`INSERT INTO channels(owner_id,bot_id,chat_id,title,type,username,slug,status,created_at,ext) VALUES(?,?,?,?,?,?,?,?,?,1)`)
        .run(user.id, null, -(1e15 + crypto.randomInt(1e9)), '@' + un, 'bot', un, rid(5), 'active', now());
      ch = Q(`SELECT * FROM channels WHERE owner_id=? AND type='bot' AND lower(username)=?`).get(user.id, un.toLowerCase());
    } else Q(`UPDATE channels SET status='active', removed_by_user=0 WHERE id=?`).run(ch.id);
    const k = pbKey(user.id);
    return send(res, 200, { ok: true, channel: ch.id, hook_start: `${BASE_URL}/hook/${k}/start`, hook_blocked: `${BASE_URL}/hook/${k}/blocked` });
  }
  if (p === '/api/channels' && m === 'POST') { const r = await addChannelManually(user, await readJson(req)); return send(res, r.limit ? 402 : r.error ? 400 : 200, r); }
  if ((mm = /^\/api\/channels\/(\d+)(\/test)?$/.exec(p))) {
    const ch = Q(`SELECT * FROM channels WHERE id=? AND owner_id=?`).get(+mm[1], user.id);
    if (!ch) return send(res, 404, { error: 'Channel not found.' });
    const plat = qs.get('platform');
    if (mm[2] && m === 'POST' && ((plat === 'tiktok' && !feature('tiktok')) || (plat === 'snap' && !feature('snapchat')))) return send(res, 403, { error: `${plat === 'tiktok' ? 'TikTok' : 'Snapchat'} is switched off right now.`, off: true });
    if (mm[2] && m === 'POST') { const r = await ({ tiktok: testTikTok, snap: testSnap }[qs.get('platform')] || testCapi)(ch); return send(res, r.error ? 400 : 200, r); }
    if (m === 'PATCH') {
      const b = await readJson(req);
      if (b.redirect_to !== undefined) { // smart link: send this link's visitors into a backup channel without touching the ads
        if (b.redirect_to === null || b.redirect_to === '' || +b.redirect_to === 0) { Q(`UPDATE channels SET redirect_to=NULL WHERE id=?`).run(ch.id); return send(res, 200, { ok: true, redirect_to: null }); }
        const tgt = Q(`SELECT * FROM channels WHERE id=? AND owner_id=? AND status<>'removed'`).get(+b.redirect_to, user.id);
        if (!tgt || tgt.id === ch.id) return send(res, 400, { error: 'Pick one of your other channels.' });
        if (tgt.type === 'bot' || ch.type === 'bot') return send(res, 400, { error: 'Backup channels work between channels and groups, not bots.' });
        if (tgt.redirect_to) return send(res, 400, { error: `${tgt.title || 'That channel'} already sends its traffic somewhere else. Pick a channel that receives its own traffic.` });
        Q(`UPDATE channels SET redirect_to=? WHERE id=?`).run(tgt.id, ch.id);
        Q(`UPDATE channels SET redirect_to=NULL WHERE redirect_to=? AND id=?`).run(ch.id, tgt.id);
        log('smart link', ch.id, '->', tgt.id);
        return send(res, 200, { ok: true, redirect_to: tgt.id, redirect_title: tgt.title });
      }
      if ((b.platform === 'tiktok' && !feature('tiktok')) || (b.platform === 'snap' && !feature('snapchat'))) return send(res, 403, { error: `${b.platform === 'tiktok' ? 'TikTok' : 'Snapchat'} is switched off right now.`, off: true });
      const pixel = String(b.pixel_id ?? ch.pixel_id ?? '').trim();
      if (pixel && !/^\d{5,20}$/.test(pixel)) return send(res, 400, { error: 'Pixel ID is numbers only, like 1234567890123456.' });
      const token = b.capi_token === undefined || b.capi_token === '' ? ch.capi_token : String(b.capi_token).trim();
      const ev = String(b.event_name || ch.event_name || 'Subscribe').replace(/[^\w ]/g, '').slice(0, 40) || 'Subscribe';
      if (b.platform === 'snap') {
        const sp = String(b.sc_pixel ?? ch.sc_pixel ?? '').trim();
        if (sp && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sp)) return send(res, 400, { error: 'Snap Pixel ID looks like 1a2b3c4d-1234-5678-9abc-def012345678.' });
        const sk = b.sc_token === undefined || b.sc_token === '' ? ch.sc_token : String(b.sc_token).trim();
        const sev = ['SUBSCRIBE', 'SIGN_UP', 'PURCHASE', 'START_TRIAL', 'CUSTOM_EVENT_1'].includes(b.sc_event) ? b.sc_event : (ch.sc_event || 'SUBSCRIBE');
        Q(`UPDATE channels SET sc_pixel=?, sc_token=?, sc_test=?, sc_event=? WHERE id=?`).run(sp || null, sk || null, b.sc_test === undefined ? (ch.sc_test || 0) : (b.sc_test ? 1 : 0), sev, ch.id);
        return send(res, 200, { ok: true });
      }
      if (b.platform === 'tiktok') {
        const tp = String(b.tt_pixel ?? ch.tt_pixel ?? '').trim();
        if (tp && !/^[A-Z0-9]{8,30}$/i.test(tp)) return send(res, 400, { error: 'TikTok pixel code is letters and numbers, like CABC123DEF456GHI.' });
        const tk = b.tt_token === undefined || b.tt_token === '' ? ch.tt_token : String(b.tt_token).trim();
        const tev = String(b.tt_event || ch.tt_event || 'Subscribe').replace(/[^\w ]/g, '').slice(0, 40) || 'Subscribe';
        Q(`UPDATE channels SET tt_pixel=?, tt_token=?, tt_test_code=?, tt_event=? WHERE id=?`)
          .run(tp || null, tk || null, String(b.tt_test_code ?? ch.tt_test_code ?? '').trim() || null, tev, ch.id);
        return send(res, 200, { ok: true });
      }
      if (['join_mode', 'offer_text', 'offer_btn', 'offer_url'].some((k) => b[k] !== undefined)) {
        const jm = b.join_mode === undefined ? (ch.join_mode || 'link') : b.join_mode === 'request' ? 'request' : 'link';
        if (jm === 'request' && !feature('join_requests')) return send(res, 403, { error: 'Join-request mode is switched off right now.', off: true });
        if (jm === 'request' && ch.type === 'bot') return send(res, 400, { error: 'Join requests are for channels and groups. Bots already know who pressed Start.' });
        const ou = String(b.offer_url ?? ch.offer_url ?? '').trim().slice(0, 500);
        if (ou && !/^https:\/\/[^\s]+$/.test(ou)) return send(res, 400, { error: 'The offer link must start with https://. Put {tg_id} where the program expects your sub ID, e.g. ?sub1={tg_id}' });
        Q(`UPDATE channels SET join_mode=?, offer_text=?, offer_btn=?, offer_url=? WHERE id=?`).run(jm, String(b.offer_text ?? ch.offer_text ?? '').slice(0, 1000) || null,
          String(b.offer_btn ?? ch.offer_btn ?? '').slice(0, 40) || null, ou || null, ch.id);
        if (jm !== (ch.join_mode || 'link')) { Q(`UPDATE links SET status='dead' WHERE channel_id=? AND status='pool'`).run(ch.id); fillPools(); }
        if (b.pixel_id === undefined && b.capi_token === undefined && b.landing === undefined) return send(res, 200, { ok: true, join_mode: jm });
      }
      if (b.landing !== undefined) { Q(`UPDATE channels SET landing=? WHERE id=?`).run(b.landing === 'button' ? 'button' : 'auto', ch.id); if (b.pixel_id === undefined && b.capi_token === undefined) return send(res, 200, { ok: true }); }
      Q(`UPDATE channels SET pixel_id=?, capi_token=?, test_code=?, event_name=? WHERE id=?`)
        .run(pixel || null, token || null, String(b.test_code ?? ch.test_code ?? '').trim() || null, ev, ch.id);
      return send(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      Q(`UPDATE channels SET status='removed', locked=0, removed_by_user=1 WHERE id=?`).run(ch.id);
      Q(`DELETE FROM channel_bots WHERE channel_id=?`).run(ch.id);
      Q(`UPDATE links SET status='dead' WHERE channel_id=? AND status IN ('pool','assigned')`).run(ch.id);
      return send(res, 200, { ok: true });
    }
  }
  send(res, 404, { error: 'Not found' });
}

function newRefCode() {
  for (;;) { const c = crypto.randomBytes(4).toString('hex').slice(0, 6); if (!Q(`SELECT 1 FROM users WHERE ref_code=?`).get(c)) return c; }
}
function refTier(userId) {
  const active = Q(`SELECT COUNT(*) n FROM users u WHERE u.referred_by=? AND EXISTS(SELECT 1 FROM deposits d WHERE d.user_id=u.id AND d.status='paid')`).get(userId).n;
  return { active, tier: [...C.REF_TIERS].reverse().find((t) => active >= t.min), next: C.REF_TIERS.find((t) => t.min > active) || null };
}
/** Referral balance = commission earned on referrals' real payments − payouts − amounts moved to the wallet. */
function refBalance(userId) {
  const earned = Q(`SELECT COALESCE(SUM(amount_cents),0) n FROM ref_earnings WHERE referrer_id=?`).get(userId).n;
  const settled = Q(`SELECT COALESCE(SUM(amount_cents),0) n FROM ref_earnings WHERE referrer_id=? AND created_at<?`).get(userId, Date.now() - C.REF_HOLD_DAYS * 864e5).n;
  const paid = Q(`SELECT COALESCE(SUM(amount_cents),0) n FROM payouts WHERE user_id=? AND status<>'rejected'`).get(userId).n;
  const moved = Q(`SELECT COALESCE(SUM(amount_cents),0) n FROM ledger WHERE user_id=? AND kind='refcredit'`).get(userId).n;
  const balance = Math.max(0, earned - paid - moved);
  return { earned, paid, moved, balance, withdrawable: Math.max(0, Math.min(balance, settled - paid - moved)) };
}
function referrals(user) {
  let me = Q(`SELECT ref_code FROM users WHERE id=?`).get(user.id);
  if (!me.ref_code) { Q(`UPDATE users SET ref_code=? WHERE id=?`).run(newRefCode(), user.id); me = Q(`SELECT ref_code FROM users WHERE id=?`).get(user.id); }
  const list = Q(`SELECT u.id, u.email, u.created_at, EXISTS(SELECT 1 FROM deposits d WHERE d.user_id=u.id AND d.status='paid') AS act,
      (SELECT COALESCE(SUM(amount_cents),0) FROM deposits d WHERE d.user_id=u.id AND d.status='paid') AS spent,
      (SELECT COALESCE(SUM(amount_cents),0) FROM ref_earnings e WHERE e.referrer_id=? AND e.from_user=u.id) AS mine
    FROM users u WHERE u.referred_by=? ORDER BY u.id DESC LIMIT 500`).all(user.id, user.id);
  const { active, tier, next } = refTier(user.id);
  const monthStart = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);
  const month = Q(`SELECT COALESCE(SUM(amount_cents),0) earned, COALESCE(SUM(base_cents),0) spent FROM ref_earnings WHERE referrer_id=? AND created_at>=?`).get(user.id, monthStart);
  const mask = (e) => { const [a, d] = e.split('@'); return a.slice(0, 2) + '•••@' + d; };
  const rb = refBalance(user.id);
  return {
    mode: setting('voo.referrals'), voo_home: setting('voo.home'),
    link: `${BASE_URL}/r/${me.ref_code}`, code: me.ref_code, invited: list.length, active,
    tier: tier.name, rate: tier.rate, next_tier: next && { name: next.name, rate: next.rate, need: next.min - active },
    tiers: C.REF_TIERS, earned_cents: rb.earned, balance_cents: rb.balance, withdrawable_cents: rb.withdrawable, hold_days: C.REF_HOLD_DAYS, credit_cents: rb.moved, withdraw_min_cents: C.WITHDRAW_MIN_CENTS,
    month_spend_cents: month.spent, month_earned_cents: month.earned,
    people: list.map((x) => ({ email: mask(x.email), joined_at: x.created_at, active: !!x.act, spend_cents: x.spent, earned_cents: x.mine })),
    payouts: Q(`SELECT amount_cents, method, status, created_at, tx FROM payouts WHERE user_id=? ORDER BY id DESC LIMIT 20`).all(user.id),
  };
}

// ---------- billing: prepaid wallet ----------
function billing(user) {
  const u = Q(`SELECT balance_cents FROM users WHERE id=?`).get(user.id);
  const sum = (kind) => Q(`SELECT COALESCE(SUM(amount_cents),0) n FROM ledger WHERE user_id=? AND kind=?`).get(user.id, kind).n;
  const m = monthKey();
  const joins = (Q(`SELECT joins FROM usage WHERE user_id=? AND month=?`).get(user.id, m) || { joins: 0 }).joins;
  const planPaid = !!Q(`SELECT 1 FROM ledger WHERE ref=?`).get(`plan:${user.id}:${m}`);
  const pr = priceFor(user.id), cp = customPricing(user.id);
  const extra = Math.max(0, joins - pr.included);
  const st = trackingState(user.id);
  const uc = userCountry(user.id), pms = payMethods(false, uc), usdt = usdtMethod(uc);
  const fp = Q(`SELECT code, bonus_pct, extra_cents, ends_at, min_cents FROM promos WHERE featured=1 AND active=1 AND (ends_at IS NULL OR ends_at>?) AND (max_uses IS NULL OR used<max_uses) ORDER BY created_at DESC LIMIT 1`).get(now());
  return {
    balance_cents: u.balance_cents || 0,
    free_joins_left: (Q(`SELECT free_joins FROM users WHERE id=?`).get(user.id) || {}).free_joins || 0, free_joins_gift: C.FREE_JOINS,
    deposited_cents: sum('deposit'), credit_cents: sum('refcredit') + sum('welcome') + sum('adjust') + sum('bonus') + sum('gift'), welcome_cents: sum('welcome'),
    used_cents: -(sum('plan') + sum('joins') + sum('ftds') + sum('joe')),
    credits: { balance: u.balance_cents || 0, bought: sum('deposit'), bonus: sum('bonus'), gift: sum('gift'), used: -(sum('plan') + sum('joins') + sum('ftds') + sum('joe')), joe: -sum('joe') },
    plan: planView(user.id), plans: plansDef(), trial: trialInfo(user.id),
    rank: rankFor(user.id), bonus_tiers: feature('credits_bonus') ? setting('credit.bonus_tiers') : [], ranks: setting('credit.ranks'),
    custom_pricing: cp, promo: fp ? { code: fp.code, bonus_pct: fp.bonus_pct, extra_cents: fp.extra_cents, min_cents: fp.min_cents, ends_at: fp.ends_at } : null,
    tracking: st.ok, state: st.reason, billing_on: BILLING,
    month: { month: m, joins, cents: (planPaid ? pr.base : 0) + Math.round(extra * pr.per), plan_paid: planPaid, extra_joins: extra,
      included: pr.included, base_cents: pr.base, per_join_cents: pr.per, list_per_join_cents: C.PRICE_PER_CENTS, discount_pct: pr.discount_pct },
    methods: { paystack: pms.some((x) => x.type === 'paystack'), flutterwave: pms.some((x) => x.type === 'flutterwave'), crypto: !!usdt },
    pay_methods: pms.map(pmPublic), country: uc,
    usdt_address: usdt ? usdt.address || '' : '', min_deposit_cents: C.MIN_DEPOSIT_CENTS, ngn_per_usd: C.NGN_PER_USD,
    deposits: Q(`SELECT provider, method_id, COALESCE(label, CASE provider WHEN 'crypto' THEN 'USDT (TRC20)' WHEN 'paystack' THEN 'Paystack' WHEN 'flutterwave' THEN 'Flutterwave' ELSE provider END) AS label, amount_cents, status, note, created_at FROM deposits WHERE user_id=? AND status<>'awaiting' ORDER BY id DESC LIMIT 30`).all(user.id),
    history: Q(`SELECT kind, amount_cents, note, created_at FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 40`).all(user.id),
  };
}
/** The plan block of GET /api/billing. Numbers are what THIS customer pays (custom deal and rank discount included). */
function planView(uid) {
  const id = userPlan(uid), P = plansDef()[id], pr = priceFor(uid), u = Q(`SELECT plan_pending FROM users WHERE id=?`).get(uid) || {};
  return { id, name: P.name, base_cents: pr.base, included: pr.included, per_join_cents: pr.per, per_ftd_cents: pr.per_ftd, renews: nextMonthStart(), change_pending: u.plan_pending || null };
}
/** Mark a deposit paid exactly once: credit the wallet and pay the referrer their share. */
function markDepositPaid(ref, txid) {
  return tx(() => {
    const d = Q(`SELECT * FROM deposits WHERE reference=?`).get(ref);
    if (!d || d.status === 'paid') return false;
    const rankBefore = rankFor(d.user_id);
    const r = Q(`UPDATE deposits SET status='paid', paid_at=?, tx=COALESCE(?,tx) WHERE id=? AND status<>'paid'`).run(now(), txid || null, d.id);
    if (!r.changes) return false;
    const label = depLabel(d);
    if (addLedger(d.user_id, 'deposit', d.amount_cents, `dep:${d.id}`, `Top-up via ${label}`)) vooTopup({ ...d, paid_at: now(), tx: txid || d.tx });
    // Loyalty bonus for bigger top-ups, plus any promo code. Bonus credits are spendable, never withdrawable, and earn no referral commission.
    let bonus = 0;
    const bt = feature('credits_bonus') ? setting('credit.bonus_tiers').filter((t) => d.amount_cents >= t.min_cents).pop() : null;
    if (bt && bt.bonus_pct > 0) { const c = Math.floor(d.amount_cents * bt.bonus_pct / 100); if (c > 0 && addLedger(d.user_id, 'bonus', c, `bonus:dep:${d.id}`, `Bonus +${bt.bonus_pct}% for a $${(d.amount_cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })} top-up`)) bonus += c; }
    if (d.promo) {
      const pm = Q(`SELECT * FROM promos WHERE code=?`).get(d.promo);
      if (pm && (pm.max_uses == null || pm.used < pm.max_uses)) {
        const c = Math.floor(d.amount_cents * (pm.bonus_pct || 0) / 100) + (pm.extra_cents || 0);
        if (c > 0 && addLedger(d.user_id, 'bonus', c, `promo:dep:${d.id}`, `Promo ${pm.code}: +${pm.bonus_pct ? pm.bonus_pct + '%' : ''}${pm.bonus_pct && pm.extra_cents ? ' and ' : ''}${pm.extra_cents ? pm.extra_cents.toLocaleString('en-US') + ' credits' : ''}`)) {
          bonus += c; Q(`UPDATE promos SET used=used+1 WHERE code=?`).run(pm.code);
        }
      }
    }
    log('deposit paid', d.provider, d.amount_cents / 100, 'user', d.user_id, bonus ? 'bonus ' + bonus : '');
    setImmediate(() => { const u = Q(`SELECT balance_cents FROM users WHERE id=?`).get(d.user_id);
      notifyUser(d.user_id, 'payment_received', { amount_cents: d.amount_cents, bonus_cents: bonus, label, reference: d.reference, balance_cents: u ? u.balance_cents : 0, at: now() }, { ref: 'dep:' + d.id });
      const rk = rankFor(d.user_id); // loyalty rank went up with this top-up
      if (rk.name !== rankBefore.name && rk.lifetime_cents > rankBefore.lifetime_cents && (!rankBefore.next || rk.lifetime_cents >= rankBefore.next.min_cents))
        notifyUser(d.user_id, 'rank_up', { rank: rk.name, discount: rk.join_discount_pct, perks: rk.perks }, { ref: 'rank:' + rk.name }); });
    return true;
  });
}
const depLabel = (d) => d.label || (d.provider === 'crypto' ? 'USDT (TRC20)' : d.provider === 'manual' ? 'Manual transfer' : d.provider[0].toUpperCase() + d.provider.slice(1));
/** Explorer link for a manual deposit, if its method has one (e.g. https://tronscan.org/#/transaction/{tx}). */
function depExplorer(d) {
  if (!d.tx) return '';
  const m = d.method_id ? Q(`SELECT explorer FROM pay_methods WHERE id=?`).get(d.method_id) : null;
  const tpl = m ? m.explorer : d.provider === 'crypto' ? 'https://tronscan.org/#/transaction/{tx}' : '';
  return tpl && /^https:\/\//.test(tpl) ? tpl.replace('{tx}', encodeURIComponent(d.tx)) : '';
}
/** Manual methods, step 2: the customer pastes the transaction hash (crypto) or bank reference. An admin then approves it. */
async function submitManualTx(user, b) {
  const d = Q(`SELECT * FROM deposits WHERE reference=? AND user_id=? AND provider IN ('crypto','manual')`).get(String(b.reference || ''), user.id);
  if (!d || !['awaiting', 'pending'].includes(d.status)) return { error: 'Start a new top-up first.' };
  const m = d.method_id ? Q(`SELECT * FROM pay_methods WHERE id=?`).get(d.method_id) : null;
  const isChain = d.provider === 'crypto' || !!(m && m.explorer);
  let txh = String(b.tx || '').trim();
  if (isChain) {
    txh = txh.toLowerCase().replace(/^0x(?=[0-9a-f]{64}$)/, '');
    if (!/^[0-9a-f]{64}$/.test(txh)) return { error: 'Paste the transaction hash (TXID) from your wallet, 64 characters long.' };
  } else if (txh.length < 3 || txh.length > 120) return { error: 'Paste the transfer reference from your bank or payment app.' };
  const dupe = Q(`SELECT user_id FROM deposits WHERE lower(tx)=lower(?) AND id<>? AND (method_id IS ? OR provider='crypto' OR ?)`).get(txh, d.id, d.method_id, isChain ? 1 : 0);
  if (dupe) { log('deposit tx reused', txh, 'by user', user.id, 'first by', dupe.user_id); return { error: 'That transaction was already submitted. If it’s yours, contact support.' }; }
  Q(`UPDATE deposits SET tx=?, status='pending' WHERE id=?`).run(txh, d.id);
  log('manual deposit submitted for review', user.email, d.amount_cents / 100, depLabel(d), txh);
  sendTemplate(user.email, 'topup_review', { pay_amount: (d.amount_cents / 100).toFixed(2), currency: d.currency, label: depLabel(d), tx: txh }, { userId: user.id, ref: 'dep:' + d.id });
  return { ok: true, pending: true, message: 'Got it. Your balance updates once we confirm the transfer, usually within 30 minutes.' };
}
/** Can this user use this promo code on a top-up of `cents`? */
function promoCheck(code, userId, cents) {
  code = String(code || '').trim().toUpperCase();
  if (!code) return { valid: false, message: 'Enter a code.' };
  const p = Q(`SELECT * FROM promos WHERE code=?`).get(code);
  if (!p || !p.active) return { valid: false, message: 'That code doesn’t exist.' };
  if (p.ends_at && p.ends_at < now()) return { valid: false, message: 'That code has expired.' };
  if (p.max_uses != null && p.used >= p.max_uses) return { valid: false, message: 'That code has been used up.' };
  if (userId && Q(`SELECT 1 FROM deposits WHERE user_id=? AND promo=? AND (status='paid' OR (status='pending' AND provider IN ('crypto','manual')))`).get(userId, code)) return { valid: false, message: 'You already used this code.' };
  if (cents != null && p.min_cents && cents < p.min_cents) return { valid: false, message: `This code needs a top-up of at least $${(p.min_cents / 100).toLocaleString('en-US')}.`, bonus_pct: p.bonus_pct, min_cents: p.min_cents };
  const bits = [p.bonus_pct ? `+${p.bonus_pct}% bonus credits` : '', p.extra_cents ? `+${p.extra_cents.toLocaleString('en-US')} credits` : ''].filter(Boolean).join(' and ');
  return { valid: true, code, bonus_pct: p.bonus_pct || 0, extra_cents: p.extra_cents || 0, min_cents: p.min_cents || 0, ends_at: p.ends_at || null, message: `Code applied: ${bits || 'no bonus'}${p.min_cents ? ` on top-ups from $${(p.min_cents / 100).toLocaleString('en-US')}` : ''}.` };
}
const userCountry = (uid) => (Q(`SELECT country FROM users WHERE id=?`).get(uid) || {}).country || null;
const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);
/** What the customer is charged for `cents` of credit through a gateway method: local amount in the lowest unit, plus the fee. */
function gatewayAmount(meth, cents) {
  const cur = pmCurrency(meth), fx = pmFx(meth), fee = meth.fee_pct > 0 ? meth.fee_pct : 0;
  const major = cents / 100 * (1 + fee / 100) * fx;
  return { currency: cur, unit: ZERO_DECIMAL.has(cur) ? Math.round(major) : Math.round(major * 100), fee_pct: fee };
}
/** Start a hosted checkout (Paystack or Stripe) for `cents` of credit. Returns {ok, url, reference} or {error}. */
async function gatewayStart(user, meth, cents, callback) {
  const ref = 'pz_' + rid(10), key = pmSecret(meth), amt = gatewayAmount(meth, cents);
  if (!key && meth.type !== 'custom') return { error: 'This payment method isn’t ready yet. Pick another way to pay.' };
  const back = (callback || `${BASE_URL}/app#credits?paid=`) + ref;
  if (meth.type === 'paystack') {
    const r = await fetch(PAYSTACK_API + '/transaction/initialize', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, amount: amt.unit, currency: amt.currency, reference: ref, callback_url: back, metadata: { user_id: user.id, method_id: meth.id, credit_cents: cents } }) }).then((x) => x.json()).catch(() => ({}));
    if (!r.status || !r.data || !r.data.authorization_url) return { error: 'Paystack: ' + (r.message || 'could not start payment') };
    Q(`INSERT INTO deposits(user_id,provider,reference,amount_cents,local_amount,currency,created_at,method_id,label,gateway_ref) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(user.id, 'paystack', ref, cents, amt.unit, amt.currency, now(), meth.id, meth.label || 'Paystack', r.data.access_code || null);
    return { ok: true, url: r.data.authorization_url, redirect_url: r.data.authorization_url, reference: ref };
  }
  if (meth.type === 'stripe') {
    const f = new URLSearchParams({ mode: 'payment', 'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': amt.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(amt.unit), 'line_items[0][price_data][product_data][name]': `${cents.toLocaleString('en-US')} Joinvoo credits`,
      success_url: back, cancel_url: `${BASE_URL}/app#credits?cancelled=${ref}`, client_reference_id: ref, customer_email: user.email,
      'metadata[reference]': ref, 'metadata[user_id]': String(user.id), 'metadata[method_id]': meth.id, 'payment_intent_data[metadata][reference]': ref });
    const r = await fetch(STRIPE_API + '/v1/checkout/sessions', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { authorization: 'Bearer ' + key, 'content-type': 'application/x-www-form-urlencoded' }, body: f.toString() })
      .then((x) => x.json()).catch(() => ({}));
    if (!r.id || !r.url) return { error: 'Stripe: ' + ((r.error && r.error.message) || 'could not start payment') };
    Q(`INSERT INTO deposits(user_id,provider,reference,amount_cents,local_amount,currency,created_at,method_id,label,gateway_ref) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(user.id, 'stripe', ref, cents, amt.unit, amt.currency, now(), meth.id, meth.label || 'Card', r.id);
    return { ok: true, url: r.url, redirect_url: r.url, reference: ref };
  }
  if (meth.type === 'gatevoo') {
    const usd = Math.round(cents * (1 + amt.fee_pct / 100)) / 100;
    let r, st = 0;
    try {
      const x = await fetch(gatevooBase(meth) + '/api/v1/invoices', { method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json', 'idempotency-key': ref },
        body: JSON.stringify({ amount_usd: usd, order_id: ref, reference: ref, amount: { value: usd.toFixed(2), currency: 'USD' }, customer_name: user.name || user.email, customer: { email: user.email, name: user.name || '' },
          description: `${cents.toLocaleString('en-US')} Joinvoo credits`, redirect_url: back, success_url: back, cancel_url: `${BASE_URL}/app#credits?cancelled=${ref}`, webhook_url: pmWebhook(meth), metadata: { user_id: user.id, reference: ref, method_id: meth.id } }) });
      st = x.status; r = await x.json().catch(() => ({}));
    } catch (e) { r = { error: { message: e.message } }; }
    const url = r && (r.checkout_url || r.url || (r.data && r.data.checkout_url));
    const id = r && (r.id || (r.data && r.data.id));
    if (!url || !id || !/^https?:\/\//.test(url)) return { error: 'Gatevoo: ' + ((r && r.error && (r.error.message || r.error)) || (st ? 'HTTP ' + st : 'could not start the checkout')) };
    Q(`INSERT INTO deposits(user_id,provider,reference,amount_cents,local_amount,currency,created_at,method_id,label,gateway_ref) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(user.id, 'gatevoo', ref, cents, Math.round(usd * 100), 'USD', now(), meth.id, meth.label || 'USDT or Bitcoin', String(id));
    return { ok: true, url, redirect_url: url, reference: ref };
  }
  if (meth.type === 'custom') {
    const c = pmConfig(meth), major = ZERO_DECIMAL.has(amt.currency) ? String(amt.unit) : (amt.unit / 100).toFixed(2);
    let url = '';
    if (c.create_url) {
      let r = {};
      try {
        r = await fetch(c.create_url, { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'content-type': 'application/json', ...(key ? { authorization: 'Bearer ' + key } : {}) },
          body: JSON.stringify({ reference: ref, amount: major, currency: amt.currency, email: user.email, description: `${cents.toLocaleString('en-US')} Joinvoo credits`, return_url: back, cancel_url: `${BASE_URL}/app#credits?cancelled=${ref}`, webhook_url: pmWebhook(meth) }) }).then((x) => x.json());
      } catch (e) { r = { error: e.message }; }
      url = (r && (r.url || r.checkout_url || r.payment_url || r.link || (r.data && (r.data.url || r.data.checkout_url || r.data.link)))) || '';
      if (!/^https:\/\//.test(url)) return { error: `${meth.label}: ${(r && (r.message || (r.error && (r.error.message || r.error)))) || 'could not start payment'}` };
    } else if (c.checkout_url) {
      const enc = encodeURIComponent;
      url = c.checkout_url.replaceAll('{amount}', enc(major)).replaceAll('{currency}', enc(amt.currency)).replaceAll('{reference}', enc(ref)).replaceAll('{email}', enc(user.email)).replaceAll('{return_url}', enc(back));
    } else return { error: 'This payment method isn’t ready yet. Pick another way to pay.' };
    Q(`INSERT INTO deposits(user_id,provider,reference,amount_cents,local_amount,currency,created_at,method_id,label) VALUES(?,?,?,?,?,?,?,?,?)`).run(user.id, 'custom', ref, cents, amt.unit, amt.currency, now(), meth.id, meth.label || 'Payment');
    return { ok: true, url, redirect_url: url, reference: ref };
  }
  return { error: 'Pick a way to pay.' };
}
/** Gatevoo invoice (read back from Gatevoo, never trusted from the webhook body alone). */
async function gatevooInvoice(meth, id) {
  const r = await fetch(gatevooBase(meth) + '/api/v1/invoices/' + encodeURIComponent(id), { headers: { authorization: 'Bearer ' + pmSecret(meth) }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('Gatevoo HTTP ' + r.status);
  const j = await r.json(); return j && j.data && !j.id ? j.data : j;
}
/** Credit a Gatevoo deposit if the invoice is paid, for this order, for at least the amount we asked. */
async function gatevooConfirm(meth, d, invId) {
  const inv = await gatevooInvoice(meth, invId || d.gateway_ref);
  const order = inv.order_id || inv.reference || (inv.metadata && inv.metadata.reference);
  const paidUsd = Number(inv.amount_usd ?? inv.paid_usd ?? (inv.amount && inv.amount.value) ?? 0);
  if (inv.status !== 'paid' || order !== d.reference) return false;
  if (!(Math.round(paidUsd * 100) >= d.local_amount)) { log('gatevoo amount mismatch', d.reference, paidUsd); return false; }
  const txid = inv.txid || (inv.payment && inv.payment.tx_hash) || String(inv.id || invId);
  return markDepositPaid(d.reference, String(txid).slice(0, 200));
}
/** Gatevoo signature: X-Gatevoo-Timestamp + X-Gatevoo-Signature (hex), or one header "t=<unix>,v1=<hex>". HMAC-SHA256(secret, "<t>.<raw>"), max 5 minutes old. */
function gatevooSigOk(req, raw, secret) {
  if (!secret) return false;
  const h = String(req.headers['x-gatevoo-signature'] || '');
  let t = req.headers['x-gatevoo-timestamp'], sigs = [h];
  if (/t=\d+/.test(h)) { const parts = h.split(',').map((x) => x.trim().split('=')); t = (parts.find((x) => x[0] === 't') || [])[1]; sigs = parts.filter((x) => x[0] === 'v1').map((x) => x[1]); }
  if (!/^\d+$/.test(String(t || '')) || Math.abs(Date.now() / 1000 - +t) > 300) return false;
  const want = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return sigs.some((s) => safeEq(String(s || '').replace(/^sha256=/, ''), want));
}
/** Custom gateway: X-Signature (or X-Webhook-Signature) = hex HMAC-SHA256(secret, raw body), optional "sha256=" prefix. */
function customSigOk(req, raw, secret) {
  if (!secret) return false;
  const h = String(req.headers['x-signature'] || req.headers['x-webhook-signature'] || '').replace(/^sha256=/, '').trim();
  return !!h && safeEq(h.toLowerCase(), crypto.createHmac('sha256', secret).update(raw).digest('hex'));
}
/** Top-up limits of a method in cents: its own min/max when set, else the global minimum and $10,000. */
function pmLimits(meth) {
  const min = meth && meth.min_usd > 0 ? Math.round(meth.min_usd * 100) : C.MIN_DEPOSIT_CENTS, max = Math.min(1000000, Math.round((meth && meth.max_usd || 10000) * 100));
  return { min, max };
}
async function startDeposit(user, b) {
  if ((b.provider === 'crypto' || b.provider === 'manual' || b.provider === 'crypto_manual') && b.reference) return submitManualTx(user, b);
  if (b.promo) {
    const pc = promoCheck(b.promo, user.id, Math.round(Number(b.amount) * 100));
    if (!pc.valid) return { error: pc.message };
    const r = await startDeposit({ ...user }, { ...b, promo: undefined });
    if (r.reference && !r.error) { Q(`UPDATE deposits SET promo=? WHERE reference=?`).run(pc.code, r.reference); r.promo = { code: pc.code, bonus_pct: pc.bonus_pct, extra_cents: pc.extra_cents }; }
    return r;
  }
  const uc = userCountry(user.id), avail = payMethods(false, uc);
  const byId = b.method_id ? avail.find((x) => x.id === String(b.method_id)) : null;
  const cents = Math.round(Number(b.amount) * 100);
  const lim = pmLimits(byId);
  if (!Number.isFinite(cents) || cents < lim.min) return { error: `The smallest top-up is $${(lim.min / 100).toLocaleString('en-US')}.` };
  if (cents > lim.max) return { error: lim.max >= 1000000 ? 'For top-ups above $10,000, contact us.' : `The largest top-up with this method is $${(lim.max / 100).toLocaleString('en-US')}.` };
  const ref = 'pz_' + rid(10);
  const callback = `${BASE_URL}/app#billing`;
  const pm = (type) => (byId && byId.type === type ? byId : b.method_id ? null : avail.find((x) => x.type === type));
  if (b.provider === 'gatevoo' || b.provider === 'custom') {
    const meth = pm(b.provider);
    if (!meth) return { error: 'That payment method isn’t available right now. Pick another way to pay.' };
    return gatewayStart(user, meth, cents, b.topup ? null : callback + '?ref=');
  }
  if (b.provider === 'paystack' || b.provider === 'stripe') {
    const meth = pm(b.provider);
    if (!meth) return { error: `${b.provider === 'stripe' ? 'Card payments are' : 'Paystack is'} not available right now. Pick another way to pay.` };
    return gatewayStart(user, meth, cents, b.topup ? null : callback + '?ref=');
  }
  if (b.provider === 'flutterwave') {
    const meth = pm('flutterwave');
    if (!meth) return { error: 'Flutterwave is not available right now. Pick another way to pay.' };
    const cur = C.FLW_CURRENCY, amount = cur === 'USD' ? cents / 100 : Math.round(cents / 100 * C.NGN_PER_USD);
    const r = await fetch(FLW_API + '/v3/payments', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { authorization: 'Bearer ' + C.FLW_SECRET, 'content-type': 'application/json' },
      body: JSON.stringify({ tx_ref: ref, amount, currency: cur, redirect_url: callback + '?ref=' + ref, customer: { email: user.email }, customizations: { title: 'Joinvoo top-up' } }) }).then((x) => x.json()).catch(() => ({}));
    if (r.status !== 'success') return { error: 'Flutterwave: ' + (r.message || 'could not start payment') };
    Q(`INSERT INTO deposits(user_id,provider,reference,amount_cents,local_amount,currency,created_at,method_id,label) VALUES(?,?,?,?,?,?,?,?,?)`).run(user.id, 'flutterwave', ref, cents, Math.round(amount * 100), cur, now(), meth.id, meth.label || 'Flutterwave');
    return { ok: true, url: r.data.link, redirect_url: r.data.link, reference: ref };
  }
  if (b.provider === 'crypto' || b.provider === 'manual' || b.provider === 'crypto_manual') {
    // {provider:'crypto'} is the old USDT flow; it maps to the USDT manual method.
    const meth = b.provider === 'crypto' && !b.method_id ? usdtMethod(uc) : byId && MANUAL_TYPES.has(byId.type) ? byId : null;
    if (!meth) return { error: b.provider === 'crypto' ? 'Crypto deposits are not set up on this server yet.' : 'That payment method isn’t available. Pick another one.' };
    // Step 1: reserve an exact amount with odd cents (e.g. 50.37) so each transfer can be told apart.
    let amt = cents;
    for (let i = 0; i < 50; i++) {
      amt = cents + 1 + crypto.randomInt(98);
      if (!Q(`SELECT 1 FROM deposits WHERE provider IN ('crypto','manual') AND COALESCE(method_id,'m_usdt')=? AND amount_cents=? AND status IN ('awaiting','pending') AND created_at>?`).get(meth.id, amt, now() - 2 * 864e5)) break;
    }
    const pub = pmPublic(meth);
    Q(`INSERT INTO deposits(user_id,provider,reference,amount_cents,currency,status,created_at,method_id,label) VALUES(?,?,?,?,?,?,?,?,?)`).run(user.id, 'manual', ref, amt, pub.currency || 'USD', 'awaiting', now(), meth.id, meth.label);
    return { ok: true, manual: true, crypto: b.provider === 'crypto' || meth.type === 'crypto_manual' || undefined, reference: ref, pay_amount: (amt / 100).toFixed(2), currency: pub.currency || 'USD',
      address: pub.address || '', instructions: pub.instructions || '', fields: pub.fields || [], network: pub.network || undefined, label: meth.label, method_id: meth.id, explorer: !!meth.explorer };
  }
  return { error: 'Pick a way to pay.' };
}
/** POST /api/billing/topup {method_id, usd, promo?}: one entry point for every method type. */
async function topup(user, b) {
  const uc = userCountry(user.id), meth = payMethods(false, uc).find((x) => x.id === String(b.method_id || ''));
  if (!meth) return { error: 'That payment method isn’t available. Pick another one.' };
  if (meth.type === 'flutterwave') return startDeposit(user, { provider: 'flutterwave', method_id: meth.id, amount: b.usd, promo: b.promo });
  const provider = MANUAL_TYPES.has(meth.type) ? 'manual' : meth.type;
  return startDeposit(user, { provider, method_id: meth.id, amount: b.usd ?? b.amount, promo: b.promo, topup: true });
}
/** Credit a gateway deposit once the provider confirms it: amount and currency must match what we asked for. */
function gatewayPaid(ref, { amount, currency, txid, provider, methodId }) {
  const d = Q(`SELECT * FROM deposits WHERE reference=?`).get(String(ref || ''));
  if (!d || d.provider !== provider || (methodId && d.method_id && d.method_id !== methodId)) return false;
  if (!(Number(amount) >= d.local_amount) || (currency && d.currency && String(currency).toUpperCase() !== d.currency.toUpperCase())) { log(provider, 'amount/currency mismatch', ref, amount, currency); return false; }
  return markDepositPaid(d.reference, txid);
}
async function verifyDeposit(user, ref) {
  const d = Q(`SELECT * FROM deposits WHERE reference=? AND user_id=?`).get(String(ref || ''), user.id);
  if (!d) return { error: 'Payment not found.' };
  if (d.status === 'paid') return { ok: true, status: 'paid' };
  const meth = d.method_id ? Q(`SELECT * FROM pay_methods WHERE id=?`).get(d.method_id) : null;
  try {
    if (d.provider === 'paystack') {
      const key = (meth && pmSecret(meth)) || C.PAYSTACK_SECRET;
      const r = await fetch(PAYSTACK_API + '/transaction/verify/' + encodeURIComponent(d.reference), { headers: { authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(20000) }).then((x) => x.json());
      if (r.data && r.data.status === 'success') gatewayPaid(d.reference, { amount: r.data.amount, currency: r.data.currency, txid: String(r.data.id), provider: 'paystack' });
    } else if (d.provider === 'stripe' && meth && d.gateway_ref) {
      const r = await fetch(STRIPE_API + '/v1/checkout/sessions/' + encodeURIComponent(d.gateway_ref), { headers: { authorization: 'Bearer ' + pmSecret(meth) }, signal: AbortSignal.timeout(20000) }).then((x) => x.json());
      if (r.payment_status === 'paid' && (r.client_reference_id || (r.metadata || {}).reference) === d.reference) gatewayPaid(d.reference, { amount: r.amount_total, currency: r.currency, txid: String(r.payment_intent || r.id), provider: 'stripe' });
    } else if (d.provider === 'gatevoo' && meth && d.gateway_ref) {
      await gatevooConfirm(meth, d);
    } else if (d.provider === 'flutterwave') {
      const r = await fetch(FLW_API + '/v3/transactions/verify_by_reference?tx_ref=' + encodeURIComponent(d.reference), { headers: { authorization: 'Bearer ' + C.FLW_SECRET }, signal: AbortSignal.timeout(20000) }).then((x) => x.json());
      if (r.data && r.data.status === 'successful' && Math.round(r.data.amount * 100) >= d.local_amount && r.data.currency === d.currency) markDepositPaid(d.reference, String(r.data.id));
    }
  } catch (e) { log('verify error', e.message); }
  return { ok: true, status: Q(`SELECT status FROM deposits WHERE id=?`).get(d.id).status };
}
/** Stripe-Signature: "t=169...,v1=<hex>[,v1=...]" — HMAC-SHA256 of `${t}.${raw}`, at most 5 minutes old. */
function stripeSigOk(header, raw, secret, toleranceSec = 300) {
  if (!secret || !header) return false;
  const parts = String(header).split(',').map((x) => x.trim().split('=')), t = (parts.find((x) => x[0] === 't') || [])[1];
  if (!/^\d+$/.test(t || '') || Math.abs(Date.now() / 1000 - +t) > toleranceSec) return false;
  const want = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return parts.some((x) => x[0] === 'v1' && safeEq(x[1], want));
}

// ---------- live support chat ----------
let adminSeenAt = 0;
function ticketFor(user, visitor, create) {
  let t = user ? Q(`SELECT * FROM tickets WHERE user_id=? ORDER BY id DESC LIMIT 1`).get(user.id)
    : visitor ? Q(`SELECT * FROM tickets WHERE visitor=? AND user_id IS NULL ORDER BY id DESC LIMIT 1`).get(visitor) : null;
  if (!t && create) {
    const r = Q(`INSERT INTO tickets(user_id,visitor,email,name,status,last_at,created_at) VALUES(?,?,?,?,?,?,?)`)
      .run(user ? user.id : null, user ? null : visitor, user ? user.email : (create.email || null), user ? (user.name || null) : (create.name || null), 'open', now(), now());
    t = Q(`SELECT * FROM tickets WHERE id=?`).get(Number(r.lastInsertRowid));
  }
  return t;
}
async function supportApi(req, res, url, user) {
  const m = req.method;
  let visitor = cookies(req).jv_vis; const headers = {};
  if (!user && !/^[\w-]{16,40}$/.test(visitor || '')) { visitor = rid(18); headers['set-cookie'] = cookie('jv_vis', visitor, 180 * 86400); }
  const online = now() - adminSeenAt < 5 * 60000;
  if (m === 'GET') {
    const t = ticketFor(user, visitor, false);
    const si = supportInfo(), extra = { team: si.team, reply_time: si.reply_time, hours: si.hours, support: C.SUPPORT_CONTACT };
    if (!t) return send(res, 200, { ticket: null, messages: [], online, ...extra }, headers);
    const after = +url.searchParams.get('after') || 0;
    if (t.unread_user) Q(`UPDATE tickets SET unread_user=0 WHERE id=?`).run(t.id);
    return send(res, 200, { ticket: { id: t.id, status: t.status, email: t.email }, online, ...extra,
      messages: withAgents(Q(`SELECT id, from_admin, body, created_at, agent_email, agent_name, source FROM ticket_msgs WHERE ticket_id=? AND id>? ORDER BY id LIMIT 200`).all(t.id, after)) }, headers);
  }
  if (m === 'POST') {
    const b = await readJson(req, 16 * 1024);
    const body = String(b.body || '').trim().slice(0, 4000);
    if (!body) return send(res, 400, { error: 'Type a message first.' }, headers);
    if (limited('chat:' + (user ? 'u' + user.id : visitor + clientIp(req)), 30, 600)) return send(res, 429, { error: 'Slow down a little. Try again in a few minutes.' }, headers);
    let t = ticketFor(user, visitor, false);
    if (!t) {
      const email = String(b.email || '').trim().toLowerCase();
      if (!user && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'Add your email so we can reply if you leave.', need_email: true }, headers);
      t = ticketFor(user, visitor, { email, name: String(b.name || '').slice(0, 80) });
    }
    const r = Q(`INSERT INTO ticket_msgs(ticket_id,from_admin,body,created_at) VALUES(?,0,?,?)`).run(t.id, body, now());
    Q(`UPDATE tickets SET status='open', last_at=?, unread_admin=unread_admin+1 WHERE id=?`).run(now(), t.id);
    vooSupportQueue(t.id, Number(r.lastInsertRowid));
    if (SUPPORT_TG_BOT_TOKEN && SUPPORT_TG_CHAT_ID) {
      tg(SUPPORT_TG_BOT_TOKEN, 'sendMessage', { chat_id: SUPPORT_TG_CHAT_ID, text: `💬 Joinvoo support · ${t.email || 'visitor'}\n\n${body.slice(0, 1500)}\n\nReply: ${BASE_URL}/admin#support`, disable_web_page_preview: true });
    }
    return send(res, 200, { ok: true, id: Number(r.lastInsertRowid), online }, headers);
  }
  send(res, 405, { error: 'Method not allowed' });
}

// ---------- ad spend (entered by hand or imported as CSV) → cost per join / FTD and ROAS ----------
const SPEND_PLATFORMS = ['meta', 'tiktok', 'snap', 'other'];
/** One CSV line → cells. Handles quotes; separator is comma, semicolon or tab (whichever the line uses). */
function csvSplit(line) {
  const sep = line.includes('\t') ? '\t' : !line.includes(',') && line.includes(';') ? ';' : ',';
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim()); return out;
}
function spendRow(uid, x) {
  const date = String(x.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) return { error: 'Date must look like 2026-10-01.' };
  let platform = String(x.platform || 'other').trim().toLowerCase(); if (platform === 'snapchat') platform = 'snap'; if (platform === 'facebook' || platform === 'instagram') platform = 'meta';
  if (!SPEND_PLATFORMS.includes(platform)) platform = 'other';
  const cur = String(x.currency || 'USD').trim().toUpperCase();
  let amt = parseFloat(String(x.amount ?? '').replace(/[, $₦]/g, ''));
  if (!Number.isFinite(amt) || amt < 0 || amt > 1e8) return { error: 'Enter the amount spent, like 123.45.' };
  if (cur === 'NGN') amt = amt / C.NGN_PER_USD; else if (cur !== 'USD') return { error: 'Use USD or NGN for spend.' };
  const r = Q(`INSERT INTO spend(owner_id,date,platform,campaign,amount_cents,currency,created_at) VALUES(?,?,?,?,?,?,?)`).run(uid, date, platform, String(x.campaign || '').trim().slice(0, 120) || '(no campaign tag)', Math.round(amt * 100), cur, now());
  return { ok: true, id: Number(r.lastInsertRowid) };
}
async function spendApi(req, user, p, m, qs) {
  if (p === '/api/spend' && m === 'GET') {
    const [d0, d1] = rangeDays(qs);
    const rows = Q(`SELECT id, date, platform, campaign, amount_cents, currency, created_at FROM spend WHERE owner_id=? AND date>=? AND date<=? ORDER BY date DESC, id DESC LIMIT 2000`).all(user.id, d0, d1);
    return { from: d0, to: d1, rows, total_cents: rows.reduce((a, r) => a + r.amount_cents, 0) };
  }
  if (p === '/api/spend' && m === 'POST') return spendRow(user.id, await readJson(req));
  if (p === '/api/spend/import' && m === 'POST') {
    let text = await readBody(req, 2 * 1024 * 1024).catch(() => '');
    try { const j = JSON.parse(text); if (j && typeof j.csv === 'string') text = j.csv; } catch { /* plain CSV */ }
    let imported = 0; const errors = [];
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 5000) return { error: 'Import up to 5,000 rows at a time.' };
    tx(() => lines.forEach((line, i) => {
      const cells = csvSplit(line);
      if (i === 0 && /date/i.test(cells[0] || '')) return;
      const r = spendRow(user.id, { date: cells[0], platform: cells[1], campaign: cells[2], amount: cells[3], currency: cells[4] || 'USD' });
      if (r.error) errors.push({ line: i + 1, error: r.error }); else imported++;
    }));
    return { ok: true, imported, skipped: errors.length, errors: errors.slice(0, 20) };
  }
  const dm = /^\/api\/spend\/(\d+)$/.exec(p);
  if (dm && m === 'DELETE') { const r = Q(`DELETE FROM spend WHERE id=? AND owner_id=?`).run(+dm[1], user.id); return r.changes ? { ok: true } : { error: 'Not found.', status: 404 }; }
  return { error: 'Not found', status: 404 };
}

// ---------- enterprise / "Talk to us" ----------
async function salesLead(req, res, user) {
  if (!feature('enterprise')) return send(res, 403, { error: 'Please use the live chat instead.', off: true });
  if (limited('sales:' + clientIp(req), 5, 3600)) return send(res, 429, { error: 'We got your message. We’ll be in touch soon.' });
  const b = await readJson(req, 16 * 1024);
  const t = (v, n) => String(v ?? '').trim().slice(0, n);
  const email = t(b.email, 120).toLowerCase(), name = t(b.name, 80);
  if (!name) return send(res, 400, { error: 'Add your name.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'Enter a valid email so we can reply.' });
  const meta = { company: t(b.company, 120), telegram: t(b.telegram, 80), monthly_volume: t(b.monthly_volume, 60), platforms: [].concat(b.platforms || []).map((x) => t(x, 30)).slice(0, 8), user_id: user ? user.id : null };
  const body = [`Sales enquiry from ${name}${meta.company ? ' · ' + meta.company : ''}`, meta.monthly_volume ? `Monthly volume: ${meta.monthly_volume}` : '', meta.platforms.length ? `Platforms: ${meta.platforms.join(', ')}` : '',
    meta.telegram ? `Telegram: ${meta.telegram}` : '', '', t(b.message, 3000)].filter((x, i) => x || i === 4).join('\n').trim();
  const r = Q(`INSERT INTO tickets(user_id,visitor,email,name,status,last_at,created_at,unread_admin,tag,meta) VALUES(NULL,?,?,?,'open',?,?,1,'sales',?)`).run('sales_' + rid(10), email, name, now(), now(), JSON.stringify(meta));
  Q(`INSERT INTO ticket_msgs(ticket_id,from_admin,body,created_at) VALUES(?,0,?,?)`).run(Number(r.lastInsertRowid), body, now());
  if (SUPPORT_TG_BOT_TOKEN && SUPPORT_TG_CHAT_ID) tg(SUPPORT_TG_BOT_TOKEN, 'sendMessage', { chat_id: SUPPORT_TG_CHAT_ID, text: `🤝 New sales lead · ${name} <${email}>\n\n${body.slice(0, 1500)}\n\n${BASE_URL}/admin#support`, disable_web_page_preview: true });
  log('sales lead', email, meta.company);
  return send(res, 200, { ok: true, message: 'Thanks! Our team will get back to you within one business day.' });
}

// ---------- Telegram alerts (Joinvoo's own bot, ALERT_BOT_TOKEN) ----------
const ALERT_DEFAULTS = { daily_report: true, token_errors: true, links_low: true, cpa_spike: false, paused: true, ftd_live: false, no_joins_2h: true, no_ftd_campaign: false };
const alertBot = { username: '' };
function alertPrefs(uid) { const u = Q(`SELECT alert_prefs FROM users WHERE id=?`).get(uid); try { return { ...ALERT_DEFAULTS, ...(u && u.alert_prefs ? JSON.parse(u.alert_prefs) : {}) }; } catch { return { ...ALERT_DEFAULTS }; } }
function alertsView(user) {
  const u = Q(`SELECT alert_chat_id, alert_code FROM users WHERE id=?`).get(user.id);
  const on = feature('alerts');
  let code = u.alert_code;
  if (on && !code) { code = rid(9).replace(/[^A-Za-z0-9]/g, 'x'); Q(`UPDATE users SET alert_code=? WHERE id=?`).run(code, user.id); }
  return { available: on, connected: on && !!u.alert_chat_id, bot_username: on ? alertBot.username : '', link: on && alertBot.username ? `https://t.me/${alertBot.username}?start=${code}` : '', prefs: alertPrefs(user.id) };
}
/** Send one alert if the customer linked Telegram and wants this kind. `every` throttles per kind. */
const INBOX_ALERTS = { token_errors: 'inbox.alert_token', no_joins_2h: 'inbox.alert_no_joins', no_ftd_campaign: 'inbox.alert_no_ftd' };
function alertUser(uid, kind, text, { every = 0 } = {}) {
  try {
    // The inbox gets these alerts whether or not Telegram is connected (throttled the same way).
    if (INBOX_ALERTS[kind] && !Q(`SELECT 1 FROM inbox WHERE user_id=? AND tag LIKE ? AND created_at>? LIMIT 1`).get(uid, 'alert:' + kind + ':%', now() - (every || 3600000)))
      inboxAdd(uid, { kind: 'alert', title: tr(userLang(uid), INBOX_ALERTS[kind]), body: text.replace(/^\S+\s/, ''), cta_label: tr(userLang(uid), kind === 'no_ftd_campaign' ? 'inbox.cta_campaigns' : 'inbox.cta_channels'),
        cta_url: kind === 'no_ftd_campaign' ? '#tab:campaigns' : '#tab:channels', tag: 'alert:' + kind + ':' + now() });
    if (!feature('alerts')) return false;
    const u = Q(`SELECT alert_chat_id FROM users WHERE id=?`).get(uid);
    if (!u || !u.alert_chat_id || !alertPrefs(uid)[kind]) return false;
    if (every && Q(`SELECT 1 FROM email_log WHERE user_id=? AND kind=? AND sent_at>? LIMIT 1`).get(uid, 'tg:' + kind, now() - every)) return false;
    Q(`INSERT INTO email_log(user_id,kind,ref,to_addr,subject,ok,sent_at) VALUES(?,?,NULL,'telegram',?,1,?)`).run(uid, 'tg:' + kind, text.slice(0, 120), now());
    tg(ALERT_BOT_TOKEN, 'sendMessage', { chat_id: u.alert_chat_id, text, disable_web_page_preview: true });
    return true;
  } catch (e) { log('alert failed', e.message); return false; }
}
async function setupAlertBot() {
  const me = await tg(ALERT_BOT_TOKEN, 'getMe');
  if (!me.ok) { log('alert bot: token rejected', me.description || ''); return; }
  alertBot.username = me.result.username;
  const r = await tg(ALERT_BOT_TOKEN, 'setWebhook', { url: `${BASE_URL}/tg-alert`, secret_token: hmac('alertbot'), allowed_updates: ['message'] });
  log('alert bot @' + alertBot.username, r.ok ? 'ready' : 'webhook failed: ' + (r.description || ''));
}
function onAlertUpdate(u) {
  const msg = u.message; if (!msg || !msg.text || msg.chat.type !== 'private') return;
  const m = /^\/start(?:\s+([A-Za-z0-9_-]{6,20}))?/.exec(msg.text);
  const say = (text) => tg(ALERT_BOT_TOKEN, 'sendMessage', { chat_id: msg.chat.id, text });
  let L = normLang(msg.from && msg.from.language_code);
  if (m && m[1]) {
    const usr = Q(`SELECT id, lang FROM users WHERE alert_code=?`).get(m[1]);
    if (!usr) return say(tr(L, 'alertbot.expired'));
    if (usr.lang) L = normLang(usr.lang);
    Q(`UPDATE users SET alert_chat_id=? WHERE id=?`).run(msg.chat.id, usr.id);
    return say(tr(L, 'alertbot.connected'));
  }
  if (/^\/stop/.test(msg.text)) { Q(`UPDATE users SET alert_chat_id=NULL WHERE alert_chat_id=?`).run(msg.chat.id); return say(tr(L, 'alertbot.stopped')); }
  return say(tr(L, 'alertbot.help'));
}
/** Minutes to add to local time to get UTC (like JS getTimezoneOffset) for an IANA zone ("Europe/Lisbon") or a number of minutes. */
function tzOffset(tz, ts = Date.now()) {
  if (tz == null || tz === '') return 0;
  if (/^-?\d{1,4}$/.test(String(tz))) return Math.max(-840, Math.min(840, +tz));
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: String(tz), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
    return Math.round((Math.floor(ts / 60000) * 60000 - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute)) / 60000);
  } catch { return 0; }
}
const validTz = (tz) => { if (/^-?\d{1,4}$/.test(String(tz))) return Math.abs(+tz) <= 840; try { new Intl.DateTimeFormat('en-US', { timeZone: String(tz) }); return true; } catch { return false; } };
/** The user's local clock: hour, date and the UTC moment their day started. */
function localClock(tz, ts = Date.now()) {
  const off = tzOffset(tz, ts), d = new Date(ts - off * 60000);
  return { off, hour: d.getUTCHours(), date: d.toISOString().slice(0, 10), dayStart: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) + off * 60000 };
}
/**
 * Every hour: invite links running low, no joins for 2 hours on a channel that usually has them, a campaign with FTDs yesterday
 * and none by 18:00 local today, and the morning summary at 08:00 in the user's time zone (+ optional cost-per-FTD spike).
 */
function alertJobs() {
  const t = now(), hNow = Math.floor(t / 3600000), usd = (c) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  for (const c of Q(`SELECT c.id, c.owner_id, c.title, (SELECT COUNT(*) FROM links l WHERE l.channel_id=c.id AND l.status='pool') pool FROM channels c JOIN users u ON u.id=c.owner_id
      WHERE c.status='active' AND c.type<>'bot' AND u.alert_chat_id IS NOT NULL`).all()) {
    if (c.pool < Math.max(5, Math.floor(POOL_SIZE / 10))) alertUser(c.owner_id, 'links_low', tr(userLang(c.owner_id), 'alert.links_low', { title: c.title, n: c.pool }), { every: 6 * 3600000 });
  }
  // No joins for 2 hours where the same hours usually bring some (average of the last 7 days, at least 3).
  for (const c of Q(`SELECT c.id, c.owner_id, c.title FROM channels c JOIN users u ON u.id=c.owner_id WHERE c.status='active' AND u.status='active' AND c.redirect_to IS NULL`).all()) {
    const last = Q(`SELECT COALESCE(SUM(joins),0) n FROM hourly WHERE channel_id=? AND hour>=? AND hour<=?`).get(c.id, hNow - 2, hNow).n;
    if (last) continue;
    let usual = 0; for (let k = 1; k <= 7; k++) usual += Q(`SELECT COALESCE(SUM(joins),0) n FROM hourly WHERE channel_id=? AND hour>=? AND hour<=?`).get(c.id, hNow - 2 - 24 * k, hNow - 24 * k).n;
    usual = Math.round(usual / 7);
    if (usual >= 3) alertUser(c.owner_id, 'no_joins_2h', tr(userLang(c.owner_id), 'alert.no_joins_2h', { title: c.title, usual }), { every: 6 * 3600000 });
  }
  const camp = "COALESCE(json_extract(c.params,'$.utm_campaign'),'(no campaign tag)')";
  for (const u of Q(`SELECT id, tz, alert_chat_id FROM users WHERE status='active' AND EXISTS(SELECT 1 FROM channels c WHERE c.owner_id=users.id)`).all()) {
    const lc = localClock(u.tz, t), L = userLang(u.id), locked = isLocked(u.id);
    const y0 = lc.dayStart - 864e5;
    // A campaign with first deposits yesterday has none by 18:00 local today (Pro detail: which campaign).
    if (lc.hour >= 18 && !locked) {
      const q = (a, b) => new Map(Q(`SELECT ${camp} k, COUNT(*) n FROM conversions v JOIN joins j ON j.id=v.join_id JOIN clicks c ON c.id=j.click_id
        WHERE v.owner_id=? AND v.event='ftd' AND COALESCE(v.rejected,0)=0 AND v.created_at>=? AND v.created_at<? GROUP BY k`).all(u.id, a, b).map((r) => [r.k, r.n]));
      const yd = q(y0, lc.dayStart), td = q(lc.dayStart, t);
      const quiet = [...yd].filter(([k, n]) => n > 0 && !td.get(k) && !/^\(no /.test(k)).sort((x, y) => y[1] - x[1])[0];
      if (quiet) alertUser(u.id, 'no_ftd_campaign', tr(L, 'alert.no_ftd_campaign', { campaign: quiet[0], n: quiet[1] }), { every: 20 * 3600000 });
    }
    // Morning summary at 08:00 local: yesterday's joins, FTDs, revenue, spend, ROAS and cost per FTD (Telegram only).
    if (!u.alert_chat_id || !feature('alerts') || lc.hour < 8 || Q(`SELECT 1 FROM email_log WHERE user_id=? AND kind='tg:daily_report' AND sent_at>=?`).get(u.id, lc.dayStart)) continue;
    const x = periodData(u.id, y0, lc.dayStart, lc.off, null, 'day').totals;
    alertUser(u.id, 'daily_report', [tr(L, 'alert.daily_title', { date: new Date(y0 - lc.off * 60000).toISOString().slice(0, 10) }),
      tr(L, 'alert.daily_joins', { joins: $num(x.joins) }) + ` · ` + tr(L, 'alert.daily_clicks', { clicks: $num(x.clicks) }) + (x.suspect_clicks ? tr(L, 'alert.daily_fake', { n: x.suspect_clicks }) : ''),
      tr(L, 'alert.daily_ftd', { ftd: $num(x.ftd) }),
      locked ? tr(L, 'alert.daily_locked') : tr(L, 'alert.daily_revenue', { revenue: usd(x.revenue_cents) }),
      x.spend_cents && !locked ? tr(L, 'alert.daily_spend', { spend: usd(x.spend_cents), roas: x.roas != null ? x.roas.toFixed(2) + '×' : '—' }) : '',
      x.spend_cents && !locked ? tr(L, 'alert.daily_cpf', { cpf: x.ftd ? usd(Math.round(x.spend_cents / x.ftd)) : '—' }) : ''].filter(Boolean).join('\n'));
    if (x.spend_cents && x.ftd && !locked) {
      const w = periodData(u.id, y0 - 7 * 864e5, y0, lc.off, null, 'day').totals;
      if (w.ftd && w.spend_cents && x.spend_cents / x.ftd > 1.5 * (w.spend_cents / w.ftd)) alertUser(u.id, 'cpa_spike', tr(L, 'alert.cpa_spike', { now: usd(Math.round(x.spend_cents / x.ftd)), avg: usd(Math.round(w.spend_cents / w.ftd)) }), { every: 20 * 3600000 });
    }
  }
}
setInterval(alertJobs, 3600000).unref();

// ---------- admin helpers ----------
const TEAM_DIR = path.join(DATA_DIR, 'media', 'team'); // uploaded support-team photos live with the database, so they survive redeploys
const PRICING_KEYS = { base_cents: 'price.base_cents', included: 'price.included', per_join_cents: 'price.per_cents', free_joins: 'price.free_joins',
  welcome_credit_cents: 'price.welcome_credit_cents', min_deposit_cents: 'price.min_deposit_cents', withdraw_min_cents: 'price.withdraw_min_cents',
  ngn_per_usd: 'price.ngn_per_usd', ref_hold_days: 'ref.hold_days', ref_tiers: 'ref.tiers' };
function adminSettings() {
  const changed = new Set(Q(`SELECT key FROM settings`).all().map((r) => r.key));
  return {
    features: features(),
    pricing: Object.fromEntries(Object.entries(PRICING_KEYS).map(([k, key]) => [k, setting(key)])),
    support: { team: setting('support.team'), reply_time: setting('support.reply_time'), hours: setting('support.hours'), contact: setting('support.contact'), canned: setting('support.canned') },
    brand: { company: setting('brand.company'), support_email: setting('brand.support_email'), mail_from_name: setting('brand.mail_from_name'), mail_from_address: MAIL_FROM_ADDR },
    emails: { weekly_summary: !!setting('email.weekly_summary'), email_on: !!resendKey() },
    credits: { bonus_tiers: setting('credit.bonus_tiers'), ranks: setting('credit.ranks') }, alerts_bot: !!ALERT_BOT_TOKEN,
    payments: { paystack_secret: mask(C.PAYSTACK_SECRET), paystack_currency: C.PAYSTACK_CURRENCY, flw_secret: mask(C.FLW_SECRET), flw_webhook_hash: mask(C.FLW_WEBHOOK_HASH), flw_currency: C.FLW_CURRENCY },
    changed: [...changed].filter((k) => SETTING_DEFS[k]), billing_on: BILLING,
    plans: plansDef(), trial: { days: setting('trial.days'), ftd_limit: setting('trial.ftd_limit'), starts: setting('trial.starts') },
    levels: setting('levels'), level_emoji: LEVEL_EMOJI,
    joe: { enabled: feature('joe'), ai: !!setting('joe.ai'), model: setting('joe.model'), daily_limit: setting('joe.daily_limit'), api_key: mask(joeKey()), has_key: !!joeKey(),
      key_from_env: !!env.ANTHROPIC_API_KEY && !changed.has('joe.api_key'), persona: setting('joe.persona'), knowledge: setting('joe.knowledge'), base_knowledge_chars: joeKnowledge().length - (setting('joe.knowledge') ? setting('joe.knowledge').length + 40 : 0),
      api_base: ANTHROPIC_API_BASE, ai_live: joeAiOn(), provider: joeProvider(), openai_base: setting('joe.openai_base'), openai_model: setting('joe.openai_model'),
      openai_key: mask(setting('joe.openai_key')), has_openai_key: !!setting('joe.openai_key'), openai_key_from_env: !!env.OPENAI_API_KEY && !changed.has('joe.openai_key'), active_model: joeModel(),
      billing: joeBill(), prices: setting('joe.prices'), price_used: joePrice(joeModel(), joeProvider()), deep_price: joePrice(joeBill().deep_model, joeProvider()),
      playbooks: allPlaybooks(), custom_playbooks: (setting('joe.playbooks') || []).map((x) => ({ name: x.name, use_when: x.use_when, chars: x.body.length, updated_at: x.updated_at })) },
    links: { domain: setting('link.domain'), backups: setting('link.backups') || [], main: BASE_URL, from_env: !!env.LINK_BASE_URL && !changed.has('link.domain'), active: linkBase() },
    sister: { ...setting('sister'), live: sisterPublic().enabled, url_out: sisterUrl(setting('sister')), clicks: setting('sister.clicks') || 0 },
    apps: (setting('apps') || []).map((a) => ({ ...a, logo_url: appLogoUrl(a), url_out: appUrl(a), clicks: (setting('apps.clicks') || {})[a.id] || 0 })), builtin_app_logos: APP_LOGOS,
    voo: { login_mode: setting('voo.login_mode'), active: vooLoginOn(), issuer: setting('voo.issuer'), client_id: setting('voo.client_id'), client_secret: mask(setting('voo.client_secret')), redirect_uri: setting('voo.redirect_uri'),
      callback_url: vooRedirect(), service_key: mask(setting('voo.service_key')), webhook_secret: mask(setting('voo.webhook_secret')), events_url: setting('voo.events_url'), home: setting('voo.home'), referrals: setting('voo.referrals'),
      summary_url: `${BASE_URL}/api/voosquare/summary`, outbox: vooOutboxStats(), api_key: mask(setting('voo.api_key')), support_bridge: !!setting('voo.support_bridge'),
      support_webhook_url: `${BASE_URL}/hooks/voosquare/support`, logout_return_url: BASE_URL + '/', affiliate_url: setting('voo.affiliate_url'), support_out: vooSupportStats(), widget: !!setting('voo.widget') },
    limits: setting('limits'),
    keys: { anthropic_key: mask(joeKey()), anthropic_set: !!joeKey(), anthropic_from_env: !!env.ANTHROPIC_API_KEY && !changed.has('joe.api_key'),
      openai_key: mask(setting('joe.openai_key')), openai_set: !!setting('joe.openai_key'), openai_from_env: !!env.OPENAI_API_KEY && !changed.has('joe.openai_key'), openai_base: setting('joe.openai_base'),
      resend_key: mask(resendKey()), resend_set: !!resendKey(), resend_from_env: !!RESEND_ENV_KEY && !changed.has('email.resend_key') },
  };
}
function promoView(p) { return { code: p.code, bonus_pct: p.bonus_pct || 0, extra_cents: p.extra_cents || 0, max_uses: p.max_uses, used: p.used || 0, ends_at: p.ends_at, min_cents: p.min_cents || 0,
  featured: !!p.featured, active: !!p.active && (!p.ends_at || p.ends_at > now()) && (p.max_uses == null || p.used < p.max_uses), created_at: p.created_at }; }
function promoValidate(b, isNew) {
  const code = String(b.code || '').trim().toUpperCase();
  if (isNew && !/^[A-Z0-9_-]{3,30}$/.test(code)) return { error: 'Codes are 3–30 letters, numbers, - or _.' };
  const bonus = Number(b.bonus_pct || 0), extra = Math.round(Number(b.extra_cents || 0)), min = Math.round(Number(b.min_cents || 0));
  if (!(bonus >= 0 && bonus <= 200)) return { error: 'Bonus must be between 0% and 200%.' };
  if (!(extra >= 0 && extra <= 1e8)) return { error: 'Extra credits must be 0 or more.' };
  if (!bonus && !extra) return { error: 'Give the code a bonus % or extra credits.' };
  const maxUses = b.max_uses === '' || b.max_uses == null ? null : Math.round(Number(b.max_uses));
  if (maxUses !== null && !(maxUses >= 1)) return { error: 'Max uses must be 1 or more (or empty for unlimited).' };
  let ends = b.ends_at === '' || b.ends_at == null ? null : typeof b.ends_at === 'number' ? b.ends_at : Date.parse(b.ends_at);
  if (ends !== null && !Number.isFinite(ends)) return { error: 'Pick a valid end date.' };
  return { code, bonus_pct: Math.round(bonus * 10) / 10, extra_cents: extra, max_uses: maxUses, ends_at: ends, min_cents: Math.max(0, min), featured: b.featured ? 1 : 0 };
}
function adminIntegrations() {
  const users = new Map(Q(`SELECT integration_id, COUNT(*) n FROM user_integrations WHERE connected_at IS NOT NULL GROUP BY integration_id`).all().map((x) => [x.integration_id, x.n]));
  const ev = new Map(Q(`SELECT network, COUNT(*) n FROM conversions WHERE network IS NOT NULL AND created_at>? GROUP BY network`).all(now() - 30 * 864e5).map((x) => [x.network, x.n]));
  return { items: Q(`SELECT * FROM integrations ORDER BY sort, name`).all().map((r) => ({ ...integrationRow(r), users: users.get(r.id) || 0, events_30d: ev.get(r.id) || 0 })), postback_example: `${BASE_URL}/pb/<key>` };
}
function integrationValidate(b) {
  const t = (v, n) => String(v ?? '').trim().slice(0, n);
  const name = t(b.name, 60); if (!name) return { error: 'Give the program a name.' };
  const category = ['iGaming', 'Trading', 'Tracker', 'E-commerce', 'Other'].includes(b.category) ? b.category : 'Other';
  const tpl = t(b.postback_template, 600);
  if (tpl && !tpl.startsWith('{postback}')) return { error: 'The template must start with {postback}, which becomes each customer’s own postback URL.' };
  const docs = t(b.docs_url, 300); if (docs && !/^https:\/\//.test(docs)) return { error: 'The docs link must start with https://' };
  const evs = (Array.isArray(b.events) ? b.events : String(b.events || '').split(',')).map((x) => normEvent(x)).filter(Boolean);
  const steps = (Array.isArray(b.setup_steps) ? b.setup_steps : String(b.setup_steps || '').split('\n')).map((x) => t(x, 400)).filter(Boolean).slice(0, 8);
  return { name, category, postback_template: tpl, macros_note: t(b.macros_note, 600), verified: b.verified ? 1 : 0, docs_url: docs, events: [...new Set(evs)], setup_steps: steps };
}
/** Paid top-ups this month grouped by the payer's current rank. */
function topupsByRank(since) {
  const out = new Map(setting('credit.ranks').map((r) => [r.name, { rank: r.name, users: 0, cents: 0, count: 0 }]));
  for (const r of Q(`SELECT user_id, COUNT(*) n, SUM(amount_cents) c FROM deposits WHERE status='paid' AND paid_at>=? GROUP BY user_id`).all(since)) {
    const k = rankFor(r.user_id).name, o = out.get(k) || { rank: k, users: 0, cents: 0, count: 0 }; o.users++; o.cents += r.c; o.count += r.n; out.set(k, o);
  }
  return [...out.values()];
}
/** Masked copy of a method's config: secrets show as ••••last4 (sending that back keeps the saved value). */
function pmConfigMasked(m) { const c = { ...pmConfig(m) }; for (const k of PM_SECRET_KEYS) if (c[k]) c[k] = '••••' + String(c[k]).slice(-4); return c; }
const pmWebhook = (m) => (['paystack', 'stripe', 'gatevoo', 'custom'].includes(m.type) ? `${BASE_URL}/webhooks/${m.type}/${m.id}` : m.type === 'flutterwave' ? `${BASE_URL}/webhooks/flutterwave` : null);
function adminPm(m) {
  return { ...pmPublic(m), sort: m.sort, configured: pmConfigured(m), live: !!m.enabled && pmConfigured(m), countries: pmCountries(m), logo: m.logo || '', config: pmConfigMasked(m),
    fx_rate: pmFx(m), min_usd: m.min_usd || null, max_usd: m.max_usd || null, fee_pct: m.fee_pct || 0, webhook_url: pmWebhook(m),
    secret: m.type === 'paystack' ? mask(pmSecret(m)) : m.type === 'flutterwave' ? mask(C.FLW_SECRET) : undefined,
    webhook_hash: m.type === 'flutterwave' ? mask(C.FLW_WEBHOOK_HASH) : undefined,
    local_currency: m.type === 'paystack' ? pmCurrency(m) : m.type === 'flutterwave' ? C.FLW_CURRENCY : undefined,
    pending: Q(`SELECT COUNT(*) n FROM deposits WHERE method_id=? AND status='pending'`).get(m.id).n,
    paid_cents: Q(`SELECT COALESCE(SUM(amount_cents),0) n FROM deposits WHERE method_id=? AND status='paid'`).get(m.id).n };
}
function adminPayMethods() {
  return { methods: payMethods(true).map(adminPm), types: PM_TYPES, builtin_logos: BUILTIN_PAYLOGOS,
    webhooks: { paystack: `${BASE_URL}/webhooks/paystack`, flutterwave: `${BASE_URL}/webhooks/flutterwave` } };
}
/** Validate a method (new: prev=null; edit: prev = the saved row). Returns the columns to store, or {error}. */
function pmValidate(type, b, prev = null) {
  const t = (v, n) => String(v ?? '').trim().slice(0, n);
  const num = (v, lo, hi) => (v === undefined || v === null || v === '' ? null : Number.isFinite(+v) && +v >= lo && +v <= hi ? +v : NaN);
  const label = t(b.name ?? b.label, 40) || (type === 'paystack' ? 'Paystack' : type === 'flutterwave' ? 'Flutterwave' : type === 'stripe' ? 'Bank card (Stripe)' : '');
  if (!label) return { error: 'Give the method a name customers will see, like “Bitcoin (BTC)” or “Bank transfer”.' };
  const out = { label, note: t(b.description ?? b.note, 120) || null, currency: null, address: null, instructions: null, explorer: null };
  // countries
  const cc = pmJson(b.countries, null) || (prev ? pmCountries(prev) : { mode: 'global', list: [] });
  if (!['global', 'only', 'except'].includes(cc.mode)) return { error: 'Countries: choose Global, Only these or All except.' };
  const list = [...new Set((Array.isArray(cc.list) ? cc.list : []).map((x) => String(x).toUpperCase()))];
  const bad = list.filter((x) => !COUNTRY.has(x)); if (bad.length) return { error: `Unknown country code: ${bad.slice(0, 3).join(', ')}.` };
  if (cc.mode !== 'global' && !list.length) return { error: 'Pick at least one country, or choose Global.' };
  out.countries = JSON.stringify({ mode: cc.mode, list: cc.mode === 'global' ? [] : list.slice(0, 260) });
  // logo: a built-in id or an uploaded file
  const logo = t(b.logo ?? (prev && prev.logo), 200);
  if (logo && !BUILTIN_PAYLOGOS.includes(logo) && !/^\/media\/paylogos\/[\w.-]+(\?v=\d+)?$/.test(logo)) return { error: 'Pick a built-in logo or upload one.' };
  out.logo = logo || null;
  // money
  out.fx_rate = num(b.fx_rate, 0.000001, 1e7); out.min_usd = num(b.min_usd, 1, 1e6); out.max_usd = num(b.max_usd, 1, 1e7); out.fee_pct = num(b.fee_pct, 0, 50);
  if ([out.fx_rate, out.min_usd, out.max_usd, out.fee_pct].some(Number.isNaN)) return { error: 'Check the numbers: rate above 0, min/max from $1, fee from 0% to 50%.' };
  if (out.min_usd && out.max_usd && out.min_usd > out.max_usd) return { error: 'The smallest top-up is bigger than the largest.' };
  // config (secrets: '' / masked / missing keep the saved value, null clears it)
  const old = prev ? pmConfig(prev) : {}, inc = b.config && typeof b.config === 'object' ? b.config : {}, cfg = {};
  const keep = (k, v) => (v === undefined || v === '' || (typeof v === 'string' && v.includes('•')) ? old[k] : v === null ? undefined : String(v).trim().slice(0, 300));
  if (type === 'paystack') { cfg.secret_key = keep('secret_key', inc.secret_key ?? (typeof b.secret === 'string' ? b.secret : undefined)); cfg.public_key = keep('public_key', inc.public_key); }
  if (type === 'stripe') { cfg.secret_key = keep('secret_key', inc.secret_key); cfg.webhook_secret = keep('webhook_secret', inc.webhook_secret); }
  if (type === 'paystack' && cfg.secret_key && !/^sk_(test|live)_\w{8,}$/.test(cfg.secret_key)) return { error: 'A Paystack secret key starts with sk_live_ or sk_test_.' };
  if (type === 'stripe' && cfg.secret_key && !/^(sk|rk)_(test|live)_\w{8,}$/.test(cfg.secret_key)) return { error: 'A Stripe secret key starts with sk_live_ or sk_test_ (or a restricted rk_ key).' };
  if (type === 'stripe' && cfg.webhook_secret && !/^whsec_\w{8,}$/.test(cfg.webhook_secret)) return { error: 'The Stripe webhook signing secret starts with whsec_.' };
  if (type === 'gatevoo') {
    cfg.base_url = t(inc.base_url ?? old.base_url ?? 'https://gatevoo.com', 200).replace(/\/+$/, '') || 'https://gatevoo.com';
    if (!/^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(cfg.base_url)) return { error: 'The Gatevoo address looks like https://gatevoo.com' };
    cfg.secret_key = keep('secret_key', inc.secret_key); cfg.webhook_secret = keep('webhook_secret', inc.webhook_secret);
    out.currency = 'USD'; out.fx_rate = 1;
  }
  if (type === 'custom') {
    const u = (v) => t(v, 500);
    cfg.create_url = u(inc.create_url ?? old.create_url); cfg.checkout_url = u(inc.checkout_url ?? old.checkout_url);
    cfg.secret_key = keep('secret_key', inc.secret_key); cfg.webhook_secret = keep('webhook_secret', inc.webhook_secret);
    if (cfg.create_url && !/^https:\/\/[^\s]+$/.test(cfg.create_url)) return { error: 'The API create URL must start with https://' };
    if (cfg.checkout_url && !/^https:\/\/[^\s]+$/.test(cfg.checkout_url)) return { error: 'The checkout link must start with https://' };
    const on = b.enabled === undefined ? (prev ? !!prev.enabled : false) : !!b.enabled;
    if (on && !cfg.create_url && !cfg.checkout_url) return { error: 'Add a checkout link (or an API create URL) so customers have somewhere to pay.' };
    if (on && !cfg.webhook_secret) return { error: 'Add a webhook secret so payments can be confirmed safely.' };
  }
  if (type === 'paystack' || type === 'stripe' || type === 'custom') {
    out.currency = t(b.currency ?? (prev && prev.currency) ?? (type === 'stripe' || type === 'custom' ? 'USD' : ''), 3).toUpperCase() || null;
    if (out.currency && !/^[A-Z]{3}$/.test(out.currency)) return { error: 'Currency is a 3-letter code like USD or NGN.' };
  }
  if (MANUAL_TYPES.has(type)) {
    out.currency = t(b.currency, 12).toUpperCase() || (type === 'crypto_manual' ? 'USDT' : 'USD');
    if (!/^[A-Z0-9]{2,12}$/.test(out.currency)) return { error: 'Currency is a short code like USDT, BTC or USD.' };
    out.instructions = t(b.instructions, 1500) || null; out.explorer = t(b.explorer, 300) || null;
    if (out.explorer && (!/^https:\/\//.test(out.explorer) || !out.explorer.includes('{tx}'))) return { error: 'The explorer link must start with https:// and contain {tx}, e.g. https://mempool.space/tx/{tx}' };
    if (type === 'manual') {
      const f = inc.fields !== undefined ? inc.fields : old.fields;
      cfg.fields = (Array.isArray(f) ? f : []).map((x) => ({ label: t(x && x.label, 40), value: t(x && x.value, 200) })).filter((x) => x.label && x.value).slice(0, 10);
      out.address = t(b.address, 200) || null;
      if (!out.address && !out.instructions && !cfg.fields.length) return { error: 'Add payment instructions, account details or an address so customers know where to pay.' };
    } else {
      cfg.network = t(inc.network ?? old.network ?? 'TRC20', 30); cfg.address = t(inc.address ?? b.address ?? old.address, 200);
      out.address = cfg.address || null;
      const on = b.enabled === undefined ? (prev ? !!prev.enabled : true) : !!b.enabled;
      if (on && !out.address) return { error: 'Add the wallet address customers send to.' };
    }
  }
  for (const k of Object.keys(cfg)) if (cfg[k] === undefined || cfg[k] === '') delete cfg[k];
  out.config = JSON.stringify(cfg);
  return out;
}
/** Paystack/Flutterwave keys can be saved from the admin (stored in settings, never shown again in full). */
function pmSecrets(type, b, id) {
  const has = (v) => typeof v === 'string' && v.trim() && !v.includes('•');
  if (type === 'paystack' && id === 'paystack') { if (has(b.secret)) setSetting('pay.paystack_secret', b.secret.trim()); if (b.local_currency) setSetting('pay.paystack_currency', b.local_currency); }
  if (type === 'flutterwave') { if (has(b.secret)) setSetting('pay.flw_secret', b.secret.trim()); if (has(b.webhook_hash)) setSetting('pay.flw_webhook_hash', b.webhook_hash.trim()); if (b.local_currency) setSetting('pay.flw_currency', b.local_currency); }
}
/** What support needs to know about a customer at a glance. */
function customerContext(u) {
  const m = monthKey(), st = trackingState(u.id);
  return {
    state: st.reason, tracking: st.ok, balance_cents: u.balance_cents || 0, free_joins_left: u.free_joins || 0,
    plan_paid: !!Q(`SELECT 1 FROM ledger WHERE ref=?`).get(`plan:${u.id}:${m}`),
    joins_month: (Q(`SELECT joins FROM usage WHERE user_id=? AND month=?`).get(u.id, m) || { joins: 0 }).joins,
    paid_cents: Q(`SELECT COALESCE(SUM(amount_cents),0) n FROM deposits WHERE user_id=? AND status='paid'`).get(u.id).n,
    channels: Q(`SELECT id, title, type, status, (pixel_id IS NOT NULL AND capi_token IS NOT NULL) AS meta, (tt_pixel IS NOT NULL AND tt_token IS NOT NULL) AS tiktok,
      (sc_pixel IS NOT NULL AND sc_token IS NOT NULL) AS snap FROM channels WHERE owner_id=? AND status<>'removed' ORDER BY id LIMIT 20`).all(u.id),
    last_joins: Q(`SELECT j.first_name, j.username, j.joined_at, j.click_id IS NOT NULL AS from_ad, j.left_at IS NOT NULL AS left_ch, ch.title AS channel FROM joins j JOIN channels ch ON ch.id=j.channel_id
      WHERE j.owner_id=? ORDER BY j.id DESC LIMIT 6`).all(u.id),
    last_deposit: Q(`SELECT amount_cents, status, created_at, COALESCE(label, provider) AS label FROM deposits WHERE user_id=? AND status<>'awaiting' ORDER BY id DESC LIMIT 1`).get(u.id) || null,
  };
}

// ---------- admin ----------
/** Team & roles page data. Emails of chat profiles (Settings → Support team) link a staff account to its public face in the chat. */
function staffView(st) {
  const roles = rolesMap(), team = setting('support.team') || [];
  const rows = Q(`SELECT s.*, u.email, u.name, u.verified_at, u.last_seen FROM staff s JOIN users u ON u.id=s.user_id ORDER BY CASE s.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.email`).all();
  return {
    staff: rows.map((r) => { const role = roles.get(r.role) || { name: r.role, perms: [] }, g = pj(r.grants, []), rv = pj(r.revokes, []), face = team.find((x) => x.email && x.email.toLowerCase() === r.email.toLowerCase());
      return { user_id: r.user_id, email: r.email, name: r.name || '', role: r.role, role_name: role.name, status: r.status, grants: g, revokes: rv,
        perms: r.role === 'owner' ? PERM_KEYS : [...new Set([...role.perms, ...g])].filter((x) => !rv.includes(x)), last_active: r.last_active || null, created_at: r.created_at, invited_by: r.invited_by,
        env: isAdminEmail(r.email), verified: !!r.verified_at, me: r.user_id === st.user_id, chat: face ? { name: face.name, photo: face.photo || '', role: face.role || '' } : null }; }),
    roles: [...roles.values()].map((r) => ({ ...r, count: rows.filter((x) => x.role === r.id).length })),
    perms: Object.entries(PERMS).map(([k, label]) => ({ key: k, label, group: k.split('.')[0] })),
    me: { role: st.role, owner: st.role === 'owner', perms: [...st.perms] },
  };
}
/** Who may change whom: only owners touch owners or hand out the owner role; nobody grants what they don't have. Returns an error message or ''. */
function staffGuard(st, { target, newRole, grants } = {}) {
  if (st.role === 'owner') return '';
  if (target && target.role === 'owner') return 'Only an owner can change or remove another owner.';
  if (newRole && newRole.id === 'owner') return 'Only an owner can make someone an owner.';
  const extra = [...(newRole ? newRole.perms : []), ...(grants || [])].filter((x) => !st.perms.has(x));
  if (extra.length) return `You can’t give permissions you don’t have yourself: ${extra.map((x) => PERMS[x]).join(', ')}.`;
  return '';
}
function sendStaffInvite(u, role, by, existing) {
  let url = `${BASE_URL}/admin`;
  if (!existing) {
    const token = rid(24);
    Q(`DELETE FROM resets WHERE user_id=?`).run(u.id);
    Q(`INSERT INTO resets(token_hash,user_id,expires_at) VALUES(?,?,?)`).run(sha256(token), u.id, now() + 7 * 864e5); // invites stay valid for a week
    url = `${BASE_URL}/app?reset=${token}&next=admin`;
  }
  sendTemplate(u.email, 'staff_invite', { role: role.name, by: by.name || by.email, url, existing: !!existing }, { userId: u.id });
}
/** Which permission an /api/admin/* call needs (a list = any of them; null = any staff member). Unknown routes need settings.edit. */
const ADMIN_ROUTES = [
  [/^\/api\/admin\/whoami$/, '*', null],
  [/^\/api\/admin\/overview$/, '*', 'overview.view'],
  [/^\/api\/admin\/users$/, 'GET', ['users.view', 'support.view']], [/^\/api\/admin\/users\/\d+$/, 'GET', ['users.view', 'support.view']],
  [/^\/api\/admin\/users\/\d+\/(credits|adjust)$/, '*', 'users.credits'], [/^\/api\/admin\/credits\/bulk$/, '*', 'users.credits'],
  [/^\/api\/admin\/users\/\d+\/(plan|trial|pricing)$/, '*', 'users.plan'], [/^\/api\/admin\/users\/\d+\/(status|logout|country)$/, '*', 'users.edit'],
  [/^\/api\/admin\/users\/\d+\/reset-password$/, '*', 'users.reset'],
  [/^\/api\/admin\/deposits$/, 'GET', 'deposits.view'], [/^\/api\/admin\/deposits\//, '*', 'deposits.approve'],
  [/^\/api\/admin\/payouts$/, 'GET', 'payouts.view'], [/^\/api\/admin\/payouts\//, '*', 'payouts.send'],
  [/^\/api\/admin\/health$/, '*', 'health.view'], [/^\/api\/admin\/backup$/, '*', 'backup.download'], [/^\/api\/admin\/(jobs\/run|retry-failed)$/, '*', 'jobs.run'],
  [/^\/api\/admin\/support(\/\d+)?$/, 'GET', 'support.view'], [/^\/api\/admin\/support\//, '*', 'support.reply'],
  [/^\/api\/admin\/canned$/, 'GET', 'support.view'], [/^\/api\/admin\/canned$/, '*', 'support.reply'],
  [/^\/api\/admin\/promos/, 'GET', ['promos.manage', 'settings.view']], [/^\/api\/admin\/promos/, '*', 'promos.manage'],
  [/^\/api\/admin\/pay-methods/, 'GET', ['payments.manage', 'settings.view']], [/^\/api\/admin\/pay-methods/, '*', 'payments.manage'],
  [/^\/api\/admin\/integrations/, 'GET', 'settings.view'], [/^\/api\/admin\/integrations/, '*', 'settings.edit'],
  [/^\/api\/admin\/settings$/, 'GET', ['settings.view', 'settings.edit', 'payments.manage', 'promos.manage', 'marketing.manage', 'keys.manage']],
  [/^\/api\/admin\/settings$/, '*', ['settings.edit', 'payments.manage', 'marketing.manage', 'keys.manage']], // each group is checked again inside
  [/^\/api\/admin\/team\/photo$/, '*', ['settings.edit', 'staff.manage']],
  [/^\/api\/admin\/emails$/, 'GET', 'emails.view'], [/^\/api\/admin\/emails\//, '*', 'emails.view'],
  [/^\/api\/admin\/joe\/test$/, '*', ['marketing.manage', 'settings.edit']],
  [/^\/api\/admin\/joe\/usage$/, '*', ['overview.view', 'audit.view']], [/^\/api\/admin\/users\/\d+\/joe-bonus$/, '*', 'users.credits'],
  [/^\/api\/admin\/joe\/playbooks/, 'GET', ['settings.view', 'settings.edit', 'marketing.manage']], [/^\/api\/admin\/joe\/playbooks/, '*', ['marketing.manage', 'settings.edit']],
  [/^\/api\/admin\/broadcasts$/, 'GET', 'broadcasts.view'], [/^\/api\/admin\/broadcasts\/preview$/, '*', ['broadcasts.view', 'broadcasts.send']], [/^\/api\/admin\/broadcasts/, '*', 'broadcasts.send'],
  [/^\/api\/admin\/voo\/test$/, '*', 'keys.manage'], [/^\/api\/admin\/apps\/logo$/, '*', 'marketing.manage'],
  [/^\/api\/admin\/(staff|roles)/, '*', 'staff.manage'], [/^\/api\/admin\/audit$/, '*', 'audit.view'],
];
function adminPerm(p, m) {
  for (const [re, meth, perm] of ADMIN_ROUTES) if (re.test(p) && (meth === '*' || meth === m)) return perm;
  return 'settings.edit';
}
/** Settings groups → the permission each needs (PUT /api/admin/settings). */
function settingsPerm(group, key) {
  if (group === 'keys' || group === 'links' || group === 'voo' || (group === 'joe' && (key === 'api_key' || key === 'openai_key'))) return 'keys.manage';
  if (group === 'payments') return 'payments.manage';
  if (group === 'sister' || group === 'apps' || (group === 'joe' && (key === 'persona' || key === 'knowledge'))) return 'marketing.manage';
  return 'settings.edit';
}
const SECRETY = /secret|_key$|^api_?key$|password|^pass$|token|hash/i; // field names whose values never go into the audit log in full
function auditClean(v, depth = 0) {
  if (v == null || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return /^data:/.test(v) ? '[file]' : v.length > 120 ? v.slice(0, 117) + '…' : v;
  if (Array.isArray(v)) return depth > 2 ? `[${v.length} items]` : v.slice(0, 8).map((x) => auditClean(x, depth + 1));
  if (typeof v === 'object') { if (depth > 2) return '{…}'; const o = {}; for (const [k, x] of Object.entries(v).slice(0, 20)) o[k] = SECRETY.test(k) && typeof x === 'string' && x ? (x.includes('•') ? '(kept)' : '••••' + x.slice(-4)) : auditClean(x, depth + 1); return o; }
  return String(v);
}
/** Write one audit row. summary = short text or an object (stored as JSON, secrets masked). */
function audit(req, st, action, target, summary) {
  const sm = typeof summary === 'string' ? summary : JSON.stringify(auditClean(summary || {}));
  Q(`INSERT INTO audit(at,actor_id,actor_email,action,area,target,summary,ip) VALUES(?,?,?,?,?,?,?,?)`).run(now(), st ? st.user_id : null, st ? st.email : null, action, action.split('.')[0], target || null, String(sm).slice(0, 2000), req ? clientIp(req) : null);
  req && (req._audited = true);
}
/** Every successful admin change is audited. Handlers can add detail with audit(); otherwise the request body (masked) is the summary. */
function auditAuto(req, p, st) {
  if (req._audited) return;
  const parts = p.replace('/api/admin/', '').split('/'), ids = parts.filter((x) => /^\d+$/.test(x) || /^[a-z]_|^m_|^[A-Z0-9_-]{3,}$/.test(x));
  const words = parts.filter((x) => !/^\d+$/.test(x));
  const action = (words[0] || 'admin') + '.' + (words.slice(1).filter((x) => !ids.includes(x)).join('.') || { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' }[req.method] || 'change');
  const tid = parts.find((x) => /^\d+$/.test(x));
  const target = parts[0] === 'users' && tid ? 'user:' + tid : tid ? `${parts[0]}:${tid}` : parts[1] && parts[0] !== 'settings' ? `${parts[0]}:${parts[1]}` : null;
  audit(req, st, action, target, req._body || {});
}

async function adminApi(req, res, url, admin, st) {
  const p = url.pathname, m = req.method, qs = url.searchParams;
  adminSeenAt = now();
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1);
  const hourNow = Math.floor(now() / 3600000);
  let mm;
  const one = (sql, ...a) => Object.values(Q(sql).get(...a))[0] || 0;
  // ----- staff: who am I, team & roles, audit log -----
  if (p === '/api/admin/whoami') {
    const has = (k) => st.perms.has(k), ov = (sql) => one(sql);
    return send(res, 200, { email: admin.email, name: admin.name || '', role: st.role, role_name: st.role_name, perms: [...st.perms], owner: st.role === 'owner', env_owner: st.env, agent: agentFor(admin.email),
      badges: { support: has('support.view') ? ov(`SELECT COUNT(*) FROM tickets WHERE status='open' AND unread_admin>0`) : 0, deposits: has('deposits.view') ? ov(`SELECT COUNT(*) FROM deposits WHERE provider IN ('crypto','manual') AND status='pending'`) : 0,
        payouts: has('payouts.view') ? ov(`SELECT COUNT(*) FROM payouts WHERE status='pending'`) : 0, health: has('health.view') ? ov(`SELECT COUNT(*) FROM channels WHERE status='no_rights'`) : 0 } });
  }
  if (p === '/api/admin/staff' && m === 'GET') return send(res, 200, staffView(st));
  if (p === '/api/admin/staff' && m === 'POST') {
    const b = await readJson(req);
    const email = String(b.email || '').trim().toLowerCase(), roles = rolesMap(), role = roles.get(String(b.role || ''));
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: 'Enter a valid email.' });
    if (!role) return send(res, 400, { error: 'Pick a role.' });
    const deny = staffGuard(st, { newRole: role }); if (deny) return send(res, 403, { error: deny });
    let u = Q(`SELECT id, email, name, verified_at, pass FROM users WHERE email=?`).get(email);
    if (u && Q(`SELECT 1 FROM staff WHERE user_id=?`).get(u.id)) return send(res, 400, { error: 'That person is already on the team. Change their role instead.' });
    const existing = !!u;
    if (!u) {
      const r = Q(`INSERT INTO users(email,pass,created_at,ref_code,name,canon) VALUES(?,?,?,?,?,?)`).run(email, hashPass(rid(24)), now(), newRefCode(), String(b.name || '').trim().slice(0, 80) || null, canonicalEmail(email));
      u = { id: Number(r.lastInsertRowid), email, name: b.name || null, verified_at: null };
    }
    Q(`INSERT INTO staff(user_id,role,grants,revokes,status,invited_by,created_at) VALUES(?,?,?,?,?,?,?)`).run(u.id, role.id, '[]', '[]', existing && u.verified_at ? 'active' : 'invited', admin.email, now());
    staffBust();
    sendStaffInvite(u, role, admin, existing && u.verified_at);
    audit(req, st, 'staff.invite', email, { role: role.name, existing_account: existing });
    log('staff invited', email, role.id, 'by', admin.email);
    return send(res, 200, { ok: true, user_id: u.id, existing, ...staffView(st) });
  }
  if ((mm = /^\/api\/admin\/staff\/(\d+)(\/resend)?$/.exec(p))) {
    const r = Q(`SELECT s.*, u.email, u.name, u.verified_at FROM staff s JOIN users u ON u.id=s.user_id WHERE s.user_id=?`).get(+mm[1]);
    if (!r) return send(res, 404, { error: 'Not on the team.' });
    const roles = rolesMap();
    if (mm[2] && m === 'POST') {
      if (r.role === 'owner' && st.role !== 'owner') return send(res, 403, { error: 'Only an owner can do this for an owner.' });
      sendStaffInvite({ id: r.user_id, email: r.email }, roles.get(r.role) || { name: r.role }, admin, !!r.verified_at && r.status !== 'invited');
      audit(req, st, 'staff.resend_invite', r.email, { role: r.role });
      return send(res, 200, { ok: true, ...staffView(st) });
    }
    if (r.user_id === st.user_id) return send(res, 403, { error: 'You can’t change your own access. Ask another owner.' });
    if (isAdminEmail(r.email)) return send(res, 403, { error: 'This owner is set in the server’s ADMIN_EMAILS. Remove the email there to change it.' });
    const ownerLeft = () => activeOwners().filter((o) => o.user_id !== r.user_id).length;
    if (m === 'DELETE') {
      const deny = staffGuard(st, { target: r }); if (deny) return send(res, 403, { error: deny });
      if (r.role === 'owner' && !ownerLeft()) return send(res, 400, { error: 'There must always be at least one owner.' });
      Q(`DELETE FROM staff WHERE user_id=?`).run(r.user_id); Q(`DELETE FROM sessions WHERE user_id=?`).run(r.user_id); staffBust();
      audit(req, st, 'staff.remove', r.email, { before: { role: r.role, status: r.status }, after: 'removed (their customer account stays)' });
      return send(res, 200, { ok: true, ...staffView(st) });
    }
    if (m === 'PATCH' || m === 'PUT') {
      const b = await readJson(req);
      const role = b.role !== undefined ? roles.get(String(b.role)) : roles.get(r.role);
      if (!role) return send(res, 400, { error: 'Pick a role.' });
      const clean = (a) => (Array.isArray(a) ? [...new Set(a.map(String).filter((x) => PERMS[x]))] : null);
      const grants = b.grants !== undefined ? clean(b.grants) : pj(r.grants, []), revokes = b.revokes !== undefined ? clean(b.revokes) : pj(r.revokes, []);
      if (!grants || !revokes) return send(res, 400, { error: 'Send permissions as a list.' });
      const status = b.status === undefined ? r.status : b.status === 'suspended' ? 'suspended' : 'active';
      const deny = staffGuard(st, { target: r, newRole: role, grants }); if (deny) return send(res, 403, { error: deny });
      if (r.role === 'owner' && (role.id !== 'owner' || status === 'suspended') && !ownerLeft()) return send(res, 400, { error: 'There must always be at least one owner.' });
      Q(`UPDATE staff SET role=?, grants=?, revokes=?, status=? WHERE user_id=?`).run(role.id, JSON.stringify(grants.filter((x) => !role.perms.includes(x))), JSON.stringify(revokes.filter((x) => role.perms.includes(x))), status === 'active' && r.status === 'invited' ? 'invited' : status, r.user_id);
      if (status === 'suspended') Q(`DELETE FROM sessions WHERE user_id=?`).run(r.user_id);
      staffBust();
      audit(req, st, status !== r.status ? (status === 'suspended' ? 'staff.suspend' : 'staff.unsuspend') : 'staff.update', r.email,
        { before: { role: r.role, status: r.status, extra: pj(r.grants, []), removed: pj(r.revokes, []) }, after: { role: role.id, status, extra: grants, removed: revokes } });
      return send(res, 200, { ok: true, ...staffView(st) });
    }
  }
  if (p === '/api/admin/roles' && m === 'POST' || (mm = /^\/api\/admin\/roles\/([\w-]{2,30})$/.exec(p))) {
    if (st.role !== 'owner') return send(res, 403, { error: 'Only owners can create or change roles.' });
    const b = m === 'DELETE' ? {} : await readJson(req);
    const perms = Array.isArray(b.perms) ? [...new Set(b.perms.map(String).filter((x) => PERMS[x]))] : null;
    if (p === '/api/admin/roles') {
      const name = String(b.name || '').trim().slice(0, 30); if (!name) return send(res, 400, { error: 'Give the role a name.' });
      if (!perms || !perms.length) return send(res, 400, { error: 'Tick at least one permission.' });
      let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'role';
      if (rolesMap().has(id)) id = id + '_' + crypto.randomInt(10, 99);
      Q(`INSERT INTO roles(id,name,perms,builtin,sort,created_at) VALUES(?,?,?,0,100,?)`).run(id, name, JSON.stringify(perms), now());
      audit(req, st, 'roles.create', id, { name, perms });
      return send(res, 200, { ok: true, id, ...staffView(st) });
    }
    const role = rolesMap().get(mm[1]); if (!role) return send(res, 404, { error: 'No such role.' });
    if (role.id === 'owner') return send(res, 400, { error: 'Owners always have every permission.' });
    if (m === 'DELETE') {
      if (role.builtin) return send(res, 400, { error: 'Built-in roles can’t be deleted. Change their permissions instead.' });
      const n = Q(`SELECT COUNT(*) n FROM staff WHERE role=?`).get(role.id).n; if (n) return send(res, 400, { error: `${n} ${n === 1 ? 'person has' : 'people have'} this role. Move them to another role first.` });
      Q(`DELETE FROM roles WHERE id=?`).run(role.id); staffBust(); audit(req, st, 'roles.delete', role.id, { name: role.name });
      return send(res, 200, { ok: true, ...staffView(st) });
    }
    if (m === 'PATCH' || m === 'PUT') {
      const name = b.name !== undefined ? String(b.name).trim().slice(0, 30) : role.name; if (!name) return send(res, 400, { error: 'Give the role a name.' });
      const np = perms || role.perms; if (!np.length) return send(res, 400, { error: 'Tick at least one permission.' });
      Q(`UPDATE roles SET name=?, perms=? WHERE id=?`).run(name, JSON.stringify(np), role.id); staffBust();
      audit(req, st, 'roles.update', role.id, { before: { name: role.name, perms: role.perms }, after: { name, perms: np } });
      return send(res, 200, { ok: true, ...staffView(st) });
    }
  }
  if (p === '/api/admin/audit') {
    const w = ['1=1'], a = [];
    if (qs.get('actor')) { w.push('actor_email=?'); a.push(qs.get('actor')); }
    if (qs.get('area')) { w.push('area=?'); a.push(qs.get('area')); }
    if (qs.get('from')) { const t = Date.parse(qs.get('from')); if (t) { w.push('at>=?'); a.push(t); } }
    if (qs.get('to')) { const t = Date.parse(qs.get('to')); if (t) { w.push('at<?'); a.push(t + 864e5); } }
    if (qs.get('q')) { w.push('(action LIKE ? OR target LIKE ? OR summary LIKE ?)'); const q = '%' + qs.get('q').slice(0, 60) + '%'; a.push(q, q, q); }
    if (+qs.get('before')) { w.push('id<?'); a.push(+qs.get('before')); }
    const items = Q(`SELECT * FROM audit WHERE ${w.join(' AND ')} ORDER BY id DESC LIMIT 100`).all(...a).map((x) => ({ ...x, summary: pj(x.summary, x.summary) }));
    return send(res, 200, { items, actors: Q(`SELECT DISTINCT actor_email e FROM audit WHERE actor_email IS NOT NULL ORDER BY e`).all().map((x) => x.e),
      areas: Q(`SELECT DISTINCT area FROM audit ORDER BY area`).all().map((x) => x.area), more: items.length === 100 });
  }
  if ((mm = /^\/api\/admin\/users\/(\d+)\/reset-password$/.exec(p)) && m === 'POST') {
    const u = Q(`SELECT id, email FROM users WHERE id=?`).get(+mm[1]); if (!u) return send(res, 404, { error: 'No such user.' });
    const token = rid(24);
    Q(`DELETE FROM resets WHERE user_id=?`).run(u.id);
    Q(`INSERT INTO resets(token_hash,user_id,expires_at) VALUES(?,?,?)`).run(sha256(token), u.id, now() + 3600000);
    const link = `${BASE_URL}/app?reset=${token}`;
    sendTemplate(u.email, 'password_reset', { url: link }, { userId: u.id });
    audit(req, st, 'users.reset_password', 'user:' + u.id, { email: u.email });
    if (!resendKey()) return send(res, 200, { ok: true, link, no_email: true, message: `Email isn’t set up, so nothing was sent. Send this link to ${u.email} yourself (it works for 1 hour).` });
    return send(res, 200, { ok: true, message: `Reset link sent to ${u.email}. It works for 1 hour.` });
  }
  if ((mm = /^\/api\/admin\/support\/(\d+)\/assign$/.exec(p)) && m === 'POST') {
    const t = Q(`SELECT id, assigned_to FROM tickets WHERE id=?`).get(+mm[1]); if (!t) return send(res, 404, { error: 'Conversation not found.' });
    const b = await readJson(req), to = b.email === null || b.email === '' ? null : String(b.email || admin.email).toLowerCase();
    if (to && !Q(`SELECT 1 FROM staff s JOIN users u ON u.id=s.user_id WHERE u.email=? AND s.status<>'suspended'`).get(to)) return send(res, 400, { error: 'Assign it to someone on the team.' });
    Q(`UPDATE tickets SET assigned_to=? WHERE id=?`).run(to, t.id);
    audit(req, st, 'support.assign', 'ticket:' + t.id, { before: t.assigned_to, after: to });
    return send(res, 200, { ok: true, assigned_to: to, agent: to ? agentFor(to) : null });
  }
  if (p === '/api/admin/voo/test' && m === 'POST') { req._noAudit = true; return send(res, 200, await vooTest()); }
  if (p === '/api/admin/apps/logo' && m === 'POST') {
    let b; try { b = JSON.parse(await readBody(req, 1.2 * 1024 * 1024)); } catch { return send(res, 413, { error: 'That logo is too big. Use one under 600 KB.' }); }
    const id = String(b.id || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30); if (!id) return send(res, 400, { error: 'Save the app first.' });
    const r = saveImage(APPLOGO_DIR, id, b.data, 600 * 1024); if (r.error) return send(res, 400, r);
    audit(req, st, 'apps.logo', id, { uploaded: true });
    return send(res, 200, { ok: true, logo: `/media/applogos/${id}.${r.kind}?v=${now()}` });
  }
  if (p === '/api/admin/overview') {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d0 = dayStart.getTime() - i * 864e5;
      days.push({ day: new Date(d0).toISOString().slice(0, 10),
        signups: one(`SELECT COUNT(*) FROM users WHERE created_at>=? AND created_at<?`, d0, d0 + 864e5),
        revenue_cents: one(`SELECT COALESCE(SUM(amount_cents),0) FROM deposits WHERE status='paid' AND paid_at>=? AND paid_at<?`, d0, d0 + 864e5),
        joins: one(`SELECT COALESCE(SUM(joins),0) FROM hourly WHERE hour>=? AND hour<?`, d0 / 3600000, (d0 + 864e5) / 3600000) });
    }
    return send(res, 200, {
      users: one(`SELECT COUNT(*) FROM users`), users_7d: one(`SELECT COUNT(*) FROM users WHERE created_at>?`, now() - 7 * 864e5),
      active_users_7d: one(`SELECT COUNT(DISTINCT owner_id) FROM hourly WHERE hour>? AND clicks>0`, hourNow - 168),
      channels_active: one(`SELECT COUNT(*) FROM channels WHERE status='active'`), channels_broken: one(`SELECT COUNT(*) FROM channels WHERE status='no_rights'`),
      bots: one(`SELECT COUNT(*) FROM bots WHERE status='active'`),
      clicks_today: one(`SELECT COALESCE(SUM(clicks),0) FROM hourly WHERE hour>=?`, dayStart.getTime() / 3600000),
      joins_today: one(`SELECT COALESCE(SUM(joins),0) FROM hourly WHERE hour>=?`, dayStart.getTime() / 3600000),
      revenue_month_cents: one(`SELECT COALESCE(SUM(amount_cents),0) FROM deposits WHERE status='paid' AND paid_at>=?`, monthStart),
      revenue_all_cents: one(`SELECT COALESCE(SUM(amount_cents),0) FROM deposits WHERE status='paid'`),
      wallets_cents: one(`SELECT COALESCE(SUM(balance_cents),0) FROM users`),
      ref_owed_cents: one(`SELECT COALESCE(SUM(amount_cents),0) FROM ref_earnings`) - one(`SELECT COALESCE(SUM(amount_cents),0) FROM payouts WHERE status<>'rejected'`) - one(`SELECT COALESCE(SUM(amount_cents),0) FROM ledger WHERE kind='refcredit'`),
      pending_deposits: one(`SELECT COUNT(*) FROM deposits WHERE provider IN ('crypto','manual') AND status='pending'`),
      pending_payouts: one(`SELECT COUNT(*) FROM payouts WHERE status='pending'`),
      support_unread: one(`SELECT COUNT(*) FROM tickets WHERE status='open' AND unread_admin>0`),
      ftd_month: one(`SELECT COUNT(*) FROM conversions WHERE event='ftd' AND created_at>=?`, monthStart),
      sales_month: one(`SELECT COUNT(*) FROM conversions WHERE event='sale' AND created_at>=?`, monthStart),
      qualified_month: one(`SELECT COUNT(*) FROM conversions WHERE event='qualified' AND created_at>=?`, monthStart),
      rejected_month: one(`SELECT COUNT(*) FROM conversions WHERE event='rejected' AND created_at>=?`, monthStart),
      tracked_revenue_month_cents: one(`SELECT COALESCE(SUM(${REVENUE_SQL}),0) FROM conversions WHERE created_at>=?`, monthStart),
      suspect_clicks_today: one(`SELECT COALESCE(SUM(suspect),0) FROM hourly WHERE hour>=?`, dayStart.getTime() / 3600000),
      bonus_month_cents: one(`SELECT COALESCE(SUM(amount_cents),0) FROM ledger WHERE kind='bonus' AND created_at>=?`, monthStart),
      sales_leads_open: one(`SELECT COUNT(*) FROM tickets WHERE tag='sales' AND status='open'`),
      topups_by_rank: topupsByRank(monthStart),
      paused_users: one(`SELECT COUNT(*) FROM users WHERE paused_at>?`, now() - 864e5),
      send_fail_24h: one(`SELECT COUNT(*) FROM capi_queue WHERE status='failed' AND created_at>?`, now() - 864e5),
      queue_pending: one(`SELECT COUNT(*) FROM capi_queue WHERE status='pending'`),
      days, billing_on: BILLING, email_on: !!resendKey(),
      payments: { paystack: payMethods(false).some((x) => x.type === 'paystack'), flutterwave: payMethods(false).some((x) => x.type === 'flutterwave'), crypto: !!usdtMethod(),
        manual: payMethods(false).filter((x) => x.type === 'manual').length },
      pay_methods: payMethods(true).map((x) => ({ id: x.id, label: x.label, type: x.type, on: !!x.enabled && pmConfigured(x) })),
      users_by_country: Q(`SELECT country, COUNT(*) n FROM users WHERE country IS NOT NULL GROUP BY country ORDER BY n DESC, country LIMIT 8`).all()
        .map((r) => ({ code: r.country, name: (COUNTRY.get(r.country) || {}).name || r.country, flag: flagOf(r.country), users: r.n })),
      users_no_country: one(`SELECT COUNT(*) FROM users WHERE country IS NULL`),
      paid_by_method: Q(`SELECT COALESCE(d.method_id, d.provider) id, MAX(COALESCE(d.label, d.provider)) label, MAX(m.type) type, COUNT(*) n, SUM(d.amount_cents) cents,
          SUM(CASE WHEN d.paid_at>=? THEN d.amount_cents ELSE 0 END) month_cents FROM deposits d LEFT JOIN pay_methods m ON m.id=d.method_id WHERE d.status='paid' GROUP BY 1 ORDER BY cents DESC LIMIT 10`).all(monthStart)
        .map((r) => ({ id: r.id, label: r.label, type: r.type || r.id, payments: r.n, cents: r.cents, month_cents: r.month_cents })),
      features: features(), me: { email: admin.email, agent: agentFor(admin.email) },
    });
  }
  if (p === '/api/admin/users' && m === 'GET') {
    const q = '%' + String(qs.get('q') || '').trim().toLowerCase() + '%';
    const cf = qs.get('country') === 'none' ? 'none' : normCountry(qs.get('country'));
    const rows = Q(`SELECT u.id, u.email, u.name, u.status, u.balance_cents, u.created_at, u.last_seen, u.paused_at, u.ref_code, u.country,
        (SELECT email FROM users r WHERE r.id=u.referred_by) AS referred_by,
        (SELECT COUNT(*) FROM channels c WHERE c.owner_id=u.id AND c.status<>'removed') AS channels,
        (SELECT COALESCE(SUM(joins),0) FROM usage g WHERE g.user_id=u.id AND g.month=?) AS joins_month,
        (SELECT COALESCE(SUM(amount_cents),0) FROM deposits d WHERE d.user_id=u.id AND d.status='paid') AS paid_cents
      FROM users u WHERE (lower(u.email) LIKE ? OR lower(COALESCE(u.name,'')) LIKE ?)${cf === 'none' ? ' AND u.country IS NULL' : cf ? ' AND u.country=?' : ''} ORDER BY u.id DESC LIMIT 200`).all(monthKey(), q, q, ...(cf && cf !== 'none' ? [cf] : []));
    return send(res, 200, { countries: Q(`SELECT country code, COUNT(*) n FROM users WHERE country IS NOT NULL GROUP BY country ORDER BY n DESC`).all().map((r) => ({ ...r, flag: flagOf(r.code), name: COUNTRY.get(r.code).name })),
      users: rows.map((r) => { const lv = levelView(r.id), ti = trialInfo(r.id);
      return { ...r, country_flag: r.country ? flagOf(r.country) : null, country_name: r.country ? COUNTRY.get(r.country).name : null, tracking: trackingState(r.id), rank: rankFor(r.id).name, custom_pricing: !!customPricing(r.id), plan: userPlan(r.id), plan_pending: (Q(`SELECT plan_pending FROM users WHERE id=?`).get(r.id) || {}).plan_pending || null,
        trial: ti.status, level: { id: lv.id, name: lv.name, index: lv.index, leads_30d: lv.leads_30d, emoji: lv.emoji } }; }), levels: setting('levels') });
  }
  if ((mm = /^\/api\/admin\/users\/(\d+)$/.exec(p)) && m === 'GET') {
    const u = Q(`SELECT id, email, name, status, balance_cents, created_at, last_seen, ref_code, profile FROM users WHERE id=?`).get(+mm[1]);
    if (!u) return send(res, 404, { error: 'No such user.' });
    const pf = Q(`SELECT nickname, gender, lang, tz, ad_account_id, plan_pending, plan_pending_from, trial_blocked, country, country_changed_at, country_history, voo_id, referred_by_voo, joe_bonus, joe_autopay, joe_monthly_cap FROM users WHERE id=?`).get(u.id);
    let ch = []; try { ch = JSON.parse(pf.country_history || '[]'); } catch { /* none */ }
    delete pf.country_history;
    return send(res, 200, { user: { ...u, ...pf, country_name: pf.country ? COUNTRY.get(pf.country).name : null, country_flag: pf.country ? flagOf(pf.country) : null, country_locked_until: countryLockedUntil(pf) },
      country_history: ch.reverse(), tracking: trackingState(u.id), ref: refBalance(u.id), rank: rankFor(u.id), custom_pricing: customPricing(u.id), price: priceFor(u.id),
      plan: planView(u.id), trial: trialInfo(u.id), level: levelView(u.id), plans: plansDef(),
      ledger: Q(`SELECT kind, amount_cents, note, created_at FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 100`).all(u.id),
      bots: Q(`SELECT id, username, status, health, created_at FROM bots WHERE owner_id=? AND status<>'deleted'`).all(u.id),
      channels: Q(`SELECT id, title, type, username, status, slug, (pixel_id IS NOT NULL AND capi_token IS NOT NULL) AS meta, (tt_pixel IS NOT NULL AND tt_token IS NOT NULL) AS tiktok, (sc_pixel IS NOT NULL AND sc_token IS NOT NULL) AS snap,
        (SELECT COUNT(*) FROM links l WHERE l.channel_id=channels.id AND l.status='pool') AS pool FROM channels WHERE owner_id=?`).all(u.id),
      deposits: Q(`SELECT id, provider, amount_cents, status, tx, created_at FROM deposits WHERE user_id=? ORDER BY id DESC LIMIT 30`).all(u.id) });
  }
  if ((mm = /^\/api\/admin\/users\/(\d+)\/pricing$/.exec(p)) && (m === 'POST' || m === 'PUT' || m === 'DELETE')) {
    if (!Q(`SELECT 1 FROM users WHERE id=?`).get(+mm[1])) return send(res, 404, { error: 'No such user.' });
    const b = m === 'DELETE' ? { clear: true } : await readJson(req);
    if (b.clear || b === null) { Q(`UPDATE users SET custom_pricing=NULL WHERE id=?`).run(+mm[1]); return send(res, 200, { ok: true, custom_pricing: null, price: priceFor(+mm[1]) }); }
    const cp = {}; const num = (v, lo, hi, dec) => { if (v === undefined || v === null || v === '') return undefined; const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`Enter a number between ${lo} and ${hi}.`); return dec ? Math.round(n * 100) / 100 : Math.round(n); };
    try { const pj = num(b.per_join_cents, 0, 1000, true), bc = num(b.base_cents, 0, 1e8), inc = num(b.included, 0, 1e9);
      if (pj !== undefined) cp.per_join_cents = pj; if (bc !== undefined) cp.base_cents = bc; if (inc !== undefined) cp.included = inc; } catch (e) { return send(res, 400, { error: e.message }); }
    cp.note = String(b.note || '').slice(0, 200);
    if (cp.per_join_cents === undefined && cp.base_cents === undefined && cp.included === undefined) return send(res, 400, { error: 'Set at least one price, or clear the custom deal.' });
    Q(`UPDATE users SET custom_pricing=? WHERE id=?`).run(JSON.stringify(cp), +mm[1]);
    log('admin custom pricing', admin.email, mm[1], JSON.stringify(cp));
    return send(res, 200, { ok: true, custom_pricing: cp, price: priceFor(+mm[1]) });
  }
  if ((mm = /^\/api\/admin\/users\/(\d+)\/country$/.exec(p)) && (m === 'POST' || m === 'PUT')) {
    if (!Q(`SELECT 1 FROM users WHERE id=?`).get(+mm[1])) return send(res, 404, { error: 'No such user.' });
    const b = await readJson(req), c = normCountry(b.country);
    if (!c) return send(res, 400, { error: 'Choose a country from the list.' });
    setUserCountry(+mm[1], c, 'admin:' + admin.email);
    if (b.reset_lock) Q(`UPDATE users SET country_changed_at=NULL WHERE id=?`).run(+mm[1]);
    log('admin set country', admin.email, mm[1], c);
    const u = Q(`SELECT country, country_changed_at, country_history FROM users WHERE id=?`).get(+mm[1]);
    return send(res, 200, { ok: true, country: u.country, country_name: COUNTRY.get(u.country).name, country_flag: flagOf(u.country), country_locked_until: countryLockedUntil(u), country_history: JSON.parse(u.country_history || '[]').reverse() });
  }
  if ((mm = /^\/api\/admin\/users\/(\d+)\/credits$/.exec(p)) && m === 'POST') {
    const b = await readJson(req); const c = creditAmount(b.credits);
    if (c == null) return send(res, 400, { error: 'Enter a whole number of credits, like 5000 or -1000 (1 credit = $0.01).' });
    const r = giveCredits(+mm[1], c, b.reason, b.notify !== false && !!b.notify, admin.email);
    return send(res, r.error ? 404 : 200, r);
  }
  if (p === '/api/admin/credits/bulk' && m === 'POST') {
    const b = await readJson(req, 64 * 1024); const c = creditAmount(b.credits);
    if (c == null) return send(res, 400, { error: 'Enter a whole number of credits, like 5000 or -1000 (1 credit = $0.01).' });
    const ids = [...new Set((Array.isArray(b.user_ids) ? b.user_ids : []).map((x) => +x).filter((x) => x > 0))];
    if (!ids.length) return send(res, 400, { error: 'Select at least one user.' });
    if (ids.length > 500) return send(res, 400, { error: 'Up to 500 users at a time.' });
    const results = ids.map((id) => giveCredits(id, c, b.reason, !!b.notify, admin.email)).map((r, i) => ({ user_id: ids[i], ok: !!r.ok, balance_credits: r.balance_credits, error: r.error }));
    return send(res, 200, { ok: true, count: results.filter((r) => r.ok).length, credits: c, results });
  }
  if ((mm = /^\/api\/admin\/users\/(\d+)\/(plan|trial)$/.exec(p)) && m === 'POST') {
    const uid = +mm[1]; if (!Q(`SELECT 1 FROM users WHERE id=?`).get(uid)) return send(res, 404, { error: 'No such user.' });
    const b = await readJson(req);
    if (mm[2] === 'plan') { // set the plan without charging (a deal, a refund, a test)
      if (!['basic', 'pro'].includes(b.plan)) return send(res, 400, { error: 'Pick basic or pro.' });
      Q(`UPDATE users SET plan=?, plan_pending=NULL, plan_pending_from=NULL WHERE id=?`).run(b.plan, uid);
      log('admin plan', admin.email, uid, b.plan);
    } else { // reset: a fresh trial starts again (at the next attributed FTD, or now if trials start at sign-up)
      if (b.action === 'end') Q(`UPDATE users SET trial_ended_at=? WHERE id=? AND trial_started_at IS NOT NULL`).run(now(), uid);
      else { Q(`UPDATE users SET trial_started_at=NULL, trial_ended_at=NULL, trial_blocked=0, trial_reset_at=? WHERE id=?`).run(now(), uid); Q(`DELETE FROM trial_keys WHERE user_id=?`).run(uid); checkTrial(uid); }
      log('admin trial', admin.email, uid, b.action || 'reset');
    }
    return send(res, 200, { ok: true, plan: planView(uid), trial: trialInfo(uid) });
  }
  if ((mm = /^\/api\/admin\/users\/(\d+)\/(adjust|status|logout)$/.exec(p)) && m === 'POST') {
    const u = Q(`SELECT id, email FROM users WHERE id=?`).get(+mm[1]);
    if (!u) return send(res, 404, { error: 'No such user.' });
    const b = await readJson(req);
    if (mm[2] === 'adjust') {
      const cents = Math.round(Number(b.amount) * 100);
      if (!Number.isFinite(cents) || !cents || Math.abs(cents) > 10000000) return send(res, 400, { error: 'Enter an amount in dollars, like 25 or -10.' });
      addLedger(u.id, 'adjust', cents, null, String(b.note || (cents > 0 ? 'Credit from Joinvoo' : 'Correction')).slice(0, 200));
      log('admin adjust', admin.email, u.email, cents / 100);
      return send(res, 200, { ok: true });
    }
    if (mm[2] === 'status') {
      const st = b.status === 'suspended' ? 'suspended' : 'active';
      Q(`UPDATE users SET status=? WHERE id=?`).run(st, u.id);
      if (st === 'suspended') Q(`DELETE FROM sessions WHERE user_id=?`).run(u.id);
      log('admin status', admin.email, u.email, st);
      return send(res, 200, { ok: true });
    }
    Q(`DELETE FROM sessions WHERE user_id=?`).run(u.id);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/admin/deposits') {
    const st = ['pending', 'paid', 'rejected'].includes(qs.get('status')) ? qs.get('status') : 'pending';
    return send(res, 200, { deposits: Q(`SELECT d.*, u.email FROM deposits d JOIN users u ON u.id=d.user_id WHERE d.status=? ${st === 'pending' ? "AND d.provider IN ('crypto','manual')" : ''} ORDER BY d.id DESC LIMIT 200`).all(st)
      .map((d) => ({ ...d, label: depLabel(d), explorer_url: depExplorer(d), manual: d.provider === 'crypto' || d.provider === 'manual' })) });
  }
  if ((mm = /^\/api\/admin\/deposits\/(\d+)\/(refund|chargeback)$/.exec(p)) && m === 'POST') { // money going back: reported to VooSquare (refund keeps commission, chargeback reverses it)
    const d = Q(`SELECT * FROM deposits WHERE id=?`).get(+mm[1]);
    if (!d) return send(res, 404, { error: 'Deposit not found.' });
    const b = await readJson(req);
    const r = mm[2] === 'refund' ? refundDeposit(d, Math.round(Number(b.amount) * 100), req) : chargebackDeposit(d, req);
    if (r.error) return send(res, r.status || 400, r);
    log('admin', mm[2], admin.email, 'deposit', d.id);
    return send(res, 200, r);
  }
  if ((mm = /^\/api\/admin\/deposits\/(\d+)\/(approve|reject)$/.exec(p)) && m === 'POST') {
    const d = Q(`SELECT * FROM deposits WHERE id=?`).get(+mm[1]);
    if (!d || d.status !== 'pending') return send(res, 400, { error: 'That deposit isn’t waiting for review.' });
    const b = await readJson(req);
    if (mm[2] === 'approve') {
      // The amount actually received can differ from what the user typed; the admin confirms the real figure.
      if (b.amount !== undefined && b.amount !== '') {
        const cents = Math.round(Number(b.amount) * 100);
        if (!Number.isFinite(cents) || cents <= 0) return send(res, 400, { error: 'Enter the amount you actually received, in dollars.' });
        Q(`UPDATE deposits SET amount_cents=? WHERE id=?`).run(cents, d.id);
      }
      markDepositPaid(d.reference, d.tx);
      log('admin approved deposit', admin.email, d.id);
    } else {
      const reason = String(b.reason || '').slice(0, 200);
      Q(`UPDATE deposits SET status='rejected', note=? WHERE id=?`).run(reason || null, d.id);
      notifyUser(d.user_id, 'topup_rejected', { amount_cents: d.amount_cents, label: depLabel(d), reason }, { ref: 'dep:' + d.id });
      log('admin rejected deposit', admin.email, d.id);
    }
    return send(res, 200, { ok: true });
  }
  if (p === '/api/admin/payouts') {
    const st = ['pending', 'paid', 'rejected'].includes(qs.get('status')) ? qs.get('status') : 'pending';
    return send(res, 200, { payouts: Q(`SELECT p.*, u.email FROM payouts p JOIN users u ON u.id=p.user_id WHERE p.status=? ORDER BY p.id DESC LIMIT 200`).all(st) });
  }
  if ((mm = /^\/api\/admin\/payouts\/(\d+)\/(paid|reject)$/.exec(p)) && m === 'POST') {
    const po = Q(`SELECT * FROM payouts WHERE id=?`).get(+mm[1]);
    if (!po || po.status !== 'pending') return send(res, 400, { error: 'That payout isn’t pending.' });
    const b = await readJson(req);
    if (mm[2] === 'paid') {
      const txh = String(b.tx || '').trim();
      if (!txh) return send(res, 400, { error: 'Paste the transaction hash of the payment you sent.' });
      Q(`UPDATE payouts SET status='paid', tx=?, paid_at=? WHERE id=?`).run(txh.slice(0, 120), now(), po.id);
      notifyUser(po.user_id, 'payout_sent', { amount_cents: po.amount_cents, method: po.method, details: po.details, tx: txh.slice(0, 120) }, { ref: 'po:' + po.id });
    } else {
      Q(`UPDATE payouts SET status='rejected' WHERE id=?`).run(po.id); // the amount goes back to their referral balance
      notifyUser(po.user_id, 'payout_rejected', { amount_cents: po.amount_cents, reason: String(b.reason || '').slice(0, 200) }, { ref: 'po:' + po.id });
    }
    log('admin payout', mm[2], admin.email, po.id);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/admin/health') {
    return send(res, 200, {
      bots: Q(`SELECT b.id, b.username, b.status, b.health, b.cooldown_until, u.email FROM bots b JOIN users u ON u.id=b.owner_id WHERE b.status IN ('active','invalid') ORDER BY b.id DESC LIMIT 300`).all()
        .map((b) => ({ ...b, health: b.health ? JSON.parse(b.health) : null })),
      broken_channels: Q(`SELECT c.id, c.title, c.status, u.email FROM channels c JOIN users u ON u.id=c.owner_id WHERE c.status='no_rights' ORDER BY c.id DESC LIMIT 100`).all(),
      low_pools: Q(`SELECT c.id, c.title, u.email, (SELECT COUNT(*) FROM links l WHERE l.channel_id=c.id AND l.status='pool') AS pool FROM channels c JOIN users u ON u.id=c.owner_id
        WHERE c.status='active' AND c.type<>'bot' AND (SELECT COUNT(*) FROM links l WHERE l.channel_id=c.id AND l.status='pool') < ? ORDER BY pool LIMIT 100`).all(Math.ceil(POOL_SIZE / 4)),
      failures: Q(`SELECT q.id, q.platform, q.attempts, q.created_at, c.title, u.email, j.capi_error, j.tt_error FROM capi_queue q JOIN channels c ON c.id=q.channel_id JOIN users u ON u.id=c.owner_id
        LEFT JOIN joins j ON j.id=q.join_id WHERE q.status='failed' ORDER BY q.id DESC LIMIT 100`).all(),
      voo_outbox: vooOutboxStats(),
    });
  }
  if (p === '/api/admin/backup') {
    const file = backupNow();
    if (!file) return send(res, 500, { error: 'Backup failed. See the server log.' });
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': `attachment; filename="${path.basename(file)}"`, 'cache-control': 'no-store' });
    return fs.createReadStream(file).pipe(res);
  }
  if (p === '/api/admin/support' && m === 'GET') {
    const st = qs.get('status') === 'closed' ? 'closed' : 'open';
    return send(res, 200, { tickets: Q(`SELECT t.*, u.name AS user_name, (SELECT body FROM ticket_msgs WHERE ticket_id=t.id ORDER BY id DESC LIMIT 1) AS last_body,
      (SELECT from_admin FROM ticket_msgs WHERE ticket_id=t.id ORDER BY id DESC LIMIT 1) AS last_from_admin,
      (SELECT agent_email FROM ticket_msgs WHERE ticket_id=t.id AND from_admin=1 ORDER BY id DESC LIMIT 1) AS last_agent
      FROM tickets t LEFT JOIN users u ON u.id=t.user_id WHERE t.status=? ${qs.get('tag') === 'sales' ? "AND t.tag='sales'" : ''} ORDER BY t.last_at DESC LIMIT 200`).all(st)
        .map((t) => { const { last_agent, meta, ...r } = t; let mt = null; try { mt = meta ? JSON.parse(meta) : null; } catch { /* bad json */ } return { ...r, meta: mt, agent: agentFor(last_agent), assignee: r.assigned_to ? agentFor(r.assigned_to) : null }; }),
      counts: { open: one(`SELECT COUNT(*) FROM tickets WHERE status='open'`), closed: one(`SELECT COUNT(*) FROM tickets WHERE status='closed'`),
        unread: one(`SELECT COUNT(*) FROM tickets WHERE status='open' AND unread_admin>0`), sales: one(`SELECT COUNT(*) FROM tickets WHERE status='open' AND tag='sales'`) }, me: agentFor(admin.email) });
  }
  if ((mm = /^\/api\/admin\/support\/(\d+)(\/close|\/reopen)?$/.exec(p))) {
    const t = Q(`SELECT * FROM tickets WHERE id=?`).get(+mm[1]);
    if (!t) return send(res, 404, { error: 'Conversation not found.' });
    if (m === 'GET') {
      Q(`UPDATE tickets SET unread_admin=0 WHERE id=?`).run(t.id);
      const u = t.user_id ? Q(`SELECT id, email, name, balance_cents, created_at, last_seen, status, free_joins FROM users WHERE id=?`).get(t.user_id) : null;
      return send(res, 200, { ticket: { ...t, assignee: t.assigned_to ? agentFor(t.assigned_to) : null, meta: (() => { try { return t.meta ? JSON.parse(t.meta) : null; } catch { return null; } })() }, user: u, context: u ? customerContext(u) : null,
        messages: withAgents(Q(`SELECT id, from_admin, body, created_at, agent_email, agent_name, source FROM ticket_msgs WHERE ticket_id=? AND id>? ORDER BY id`).all(t.id, +qs.get('after') || 0)) });
    }
    if (m === 'POST' && mm[2] === '/close') { Q(`UPDATE tickets SET status='closed', unread_admin=0 WHERE id=?`).run(t.id); return send(res, 200, { ok: true }); }
    if (m === 'POST' && mm[2] === '/reopen') { Q(`UPDATE tickets SET status='open' WHERE id=?`).run(t.id); return send(res, 200, { ok: true }); }
    if (m === 'POST') {
      const b = await readJson(req, 16 * 1024); const body = String(b.body || '').trim().slice(0, 4000);
      if (!body) return send(res, 400, { error: 'Type a reply first.' });
      Q(`INSERT INTO ticket_msgs(ticket_id,from_admin,body,created_at,agent_email) VALUES(?,1,?,?,?)`).run(t.id, body, now(), admin.email);
      Q(`UPDATE tickets SET last_at=?, unread_user=unread_user+1, unread_admin=0, status='open' WHERE id=?`).run(now(), t.id);
      const u = t.user_id ? Q(`SELECT email, last_seen FROM users WHERE id=?`).get(t.user_id) : null;
      const to = u ? u.email : t.email;
      if (to && (!u || !u.last_seen || u.last_seen < now() - 5 * 60000)) {
        sendTemplate(to, 'support_reply', { body, agent: agentFor(admin.email), user: !!u }, { userId: t.user_id || null, ref: 'ticket:' + t.id });
      }
      return send(res, 200, { ok: true, agent: agentFor(admin.email) });
    }
  }
  // ----- promo codes -----
  if (p === '/api/admin/promos' && m === 'GET') return send(res, 200, { promos: Q(`SELECT * FROM promos ORDER BY created_at DESC`).all().map(promoView) });
  if (p === '/api/admin/promos' && m === 'POST') {
    const b = await readJson(req); const v = promoValidate(b, true); if (v.error) return send(res, 400, v);
    if (Q(`SELECT 1 FROM promos WHERE code=?`).get(v.code)) return send(res, 400, { error: 'That code already exists.' });
    Q(`INSERT INTO promos(code,bonus_pct,extra_cents,max_uses,ends_at,min_cents,featured,active,created_at) VALUES(?,?,?,?,?,?,?,1,?)`).run(v.code, v.bonus_pct, v.extra_cents, v.max_uses, v.ends_at, v.min_cents, v.featured, now());
    if (v.featured) Q(`UPDATE promos SET featured=0 WHERE code<>?`).run(v.code);
    return send(res, 200, { ok: true, promos: Q(`SELECT * FROM promos ORDER BY created_at DESC`).all().map(promoView) });
  }
  if ((mm = /^\/api\/admin\/promos\/([A-Z0-9_-]{2,30})$/i.exec(p))) {
    const pr = Q(`SELECT * FROM promos WHERE code=?`).get(mm[1].toUpperCase()); if (!pr) return send(res, 404, { error: 'No such code.' });
    if (m === 'DELETE') { if (pr.used) Q(`UPDATE promos SET active=0, featured=0 WHERE code=?`).run(pr.code); else Q(`DELETE FROM promos WHERE code=?`).run(pr.code); }
    else if (m === 'PATCH' || m === 'PUT') {
      const b = await readJson(req);
      if (b.expire) Q(`UPDATE promos SET ends_at=?, featured=0 WHERE code=?`).run(now(), pr.code);
      else { const v = promoValidate({ ...promoView(pr), ...b }, false); if (v.error) return send(res, 400, v);
        Q(`UPDATE promos SET bonus_pct=?, extra_cents=?, max_uses=?, ends_at=?, min_cents=?, featured=?, active=? WHERE code=?`).run(v.bonus_pct, v.extra_cents, v.max_uses, v.ends_at, v.min_cents, v.featured, b.active === false ? 0 : 1, pr.code);
        if (v.featured) Q(`UPDATE promos SET featured=0 WHERE code<>?`).run(pr.code); }
    }
    return send(res, 200, { ok: true, promos: Q(`SELECT * FROM promos ORDER BY created_at DESC`).all().map(promoView) });
  }
  // ----- affiliate integrations -----
  if (p === '/api/admin/integrations' && m === 'GET') return send(res, 200, adminIntegrations());
  if (p === '/api/admin/integrations' && m === 'POST') {
    const b = await readJson(req, 32 * 1024); const v = integrationValidate(b); if (v.error) return send(res, 400, v);
    let id = String(b.id || v.name).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'program';
    while (Q(`SELECT 1 FROM integrations WHERE id=?`).get(id)) id = id.replace(/\d+$/, '') + crypto.randomInt(2, 99);
    if (!b.postback_template) v.postback_template = `{postback}?sub1={sub1}&status=ftd&payout={amount}&currency=USD&txid={transaction_id}&net=${id}`;
    Q(`INSERT INTO integrations(id,name,logo,category,postback_template,macros_note,verified,docs_url,events,setup_steps,sort,created_at) VALUES(?,?,'',?,?,?,?,?,?,?,?,?)`)
      .run(id, v.name, v.category, v.postback_template, v.macros_note, v.verified, v.docs_url, JSON.stringify(v.events), JSON.stringify(v.setup_steps.length ? v.setup_steps : progSteps(v.name)), one(`SELECT COALESCE(MAX(sort),0) FROM integrations`) + 1, now());
    return send(res, 200, { ok: true, id, ...adminIntegrations() });
  }
  if ((mm = /^\/api\/admin\/integrations\/([\w-]{1,40})(\/logo)?$/.exec(p))) {
    const it = Q(`SELECT * FROM integrations WHERE id=?`).get(mm[1]); if (!it) return send(res, 404, { error: 'Integration not found.' });
    if (mm[2] && m === 'POST') {
      let b; try { b = JSON.parse(await readBody(req, 2.2 * 1024 * 1024)); } catch { return send(res, 413, { error: 'That image is too big. Use one under 1.5 MB.' }); }
      const r = saveImage(LOGO_DIR, it.id, b.data); if (r.error) return send(res, 400, r);
      const logo = `/media/logos/${it.id}.${r.kind}?v=${now()}`; Q(`UPDATE integrations SET logo=? WHERE id=?`).run(logo, it.id);
      return send(res, 200, { ok: true, logo });
    }
    if (mm[2] && m === 'DELETE') { Q(`UPDATE integrations SET logo='' WHERE id=?`).run(it.id); return send(res, 200, { ok: true }); }
    if (m === 'DELETE') { Q(`DELETE FROM integrations WHERE id=?`).run(it.id); Q(`DELETE FROM user_integrations WHERE integration_id=?`).run(it.id); return send(res, 200, { ok: true, ...adminIntegrations() }); }
    if (m === 'PATCH' || m === 'PUT') {
      const b = await readJson(req, 32 * 1024); const v = integrationValidate({ ...integrationRow(it), ...b }); if (v.error) return send(res, 400, v);
      Q(`UPDATE integrations SET name=?, category=?, postback_template=?, macros_note=?, verified=?, docs_url=?, events=?, setup_steps=?, sort=COALESCE(?,sort) WHERE id=?`)
        .run(v.name, v.category, v.postback_template, v.macros_note, v.verified, v.docs_url, JSON.stringify(v.events), JSON.stringify(v.setup_steps), b.sort != null ? +b.sort : null, it.id);
      return send(res, 200, { ok: true, ...adminIntegrations() });
    }
  }
  // ----- settings -----
  if (p === '/api/admin/settings' && m === 'GET') return send(res, 200, adminSettings());
  if (p === '/api/admin/settings' && (m === 'PUT' || m === 'POST')) {
    const b = await readJson(req, 64 * 1024);
    const changes = [];
    const map = { features: (k) => 'feature.' + k, pricing: (k) => PRICING_KEYS[k], support: (k) => ({ team: 'support.team', reply_time: 'support.reply_time', hours: 'support.hours', contact: 'support.contact', canned: 'support.canned' }[k]),
      brand: (k) => ({ company: 'brand.company', support_email: 'brand.support_email', mail_from_name: 'brand.mail_from_name' }[k]), emails: (k) => ({ weekly_summary: 'email.weekly_summary' }[k]),
      credits: (k) => ({ bonus_tiers: 'credit.bonus_tiers', ranks: 'credit.ranks' }[k]),
      trial: (k) => ({ days: 'trial.days', ftd_limit: 'trial.ftd_limit', starts: 'trial.starts' }[k]), levels: (k) => ({ levels: 'levels' }[k]),
      joe: (k) => ({ ai: 'joe.ai', model: 'joe.model', daily_limit: 'joe.daily_limit', api_key: 'joe.api_key', persona: 'joe.persona', knowledge: 'joe.knowledge', provider: 'joe.provider', openai_base: 'joe.openai_base', openai_key: 'joe.openai_key', openai_model: 'joe.openai_model', billing: 'joe.billing', prices: 'joe.prices' }[k]),
      keys: (k) => ({ anthropic_key: 'joe.api_key', resend_key: 'email.resend_key', openai_key: 'joe.openai_key', openai_base: 'joe.openai_base' }[k]),
      links: (k) => ({ domain: 'link.domain', backups: 'link.backups' }[k]),
      voo: (k) => ({ login_mode: 'voo.login_mode', issuer: 'voo.issuer', client_id: 'voo.client_id', client_secret: 'voo.client_secret', redirect_uri: 'voo.redirect_uri', service_key: 'voo.service_key',
        webhook_secret: 'voo.webhook_secret', events_url: 'voo.events_url', home: 'voo.home', referrals: 'voo.referrals', api_key: 'voo.api_key', support_bridge: 'voo.support_bridge', affiliate_url: 'voo.affiliate_url', widget: 'voo.widget' }[k]),
      payments: (k) => ({ paystack_secret: 'pay.paystack_secret', paystack_currency: 'pay.paystack_currency', flw_secret: 'pay.flw_secret', flw_webhook_hash: 'pay.flw_webhook_hash', flw_currency: 'pay.flw_currency' }[k]) };
    // each group needs its own permission (Finance can save payment keys, Marketing the sister card and Joe's knowledge…)
    const needs = new Set();
    for (const [g, vals] of Object.entries(b)) {
      if (g === 'sister' || g === 'plans' || g === 'apps' || g === 'limits') { needs.add(settingsPerm(g)); continue; }
      if (!map[g]) continue;
      for (const k of Object.keys(vals && typeof vals === 'object' ? vals : {})) needs.add(settingsPerm(g, k));
    }
    const missing = [...needs].filter((x) => !st.perms.has(x));
    if (missing.length) return send(res, 403, { error: `Your role (${st.role_name}) can’t change this. It needs “${missing.map((x) => PERMS[x]).join('” and “')}”.`, need: missing });
    // Plans: Basic's numbers are the Pricing page values (price.*); names, per-FTD fees and Pro live in `plans`.
    // Zedapex apps: the list replaces the old single sister card; Replyvoo is copied back into `sister` for older dashboards.
    if (b.apps === null) changes.push(['apps', null]);
    else if (Array.isArray(b.apps)) {
      changes.push(['apps', b.apps.map((a) => { const { logo_url, url_out, clicks, ...x } = a || {}; return x; })]);
      if (b.reset_app_clicks) changes.push(['apps.clicks', {}]);
      try { const r = appsValidate(changes[changes.length - (b.reset_app_clicks ? 2 : 1)][1]).find((a) => a.id === 'replyvoo');
        if (r) changes.push(['sister', { ...setting('sister'), name: r.name, url: r.url || setting('sister').url, enabled: r.enabled, utm: r.utm }]); } catch { /* validation reports it below */ }
    }
    if (b.sister === null) changes.push(['sister', null]);
    else if (b.sister && typeof b.sister === 'object') { const { live, url_out, clicks, reset_clicks, ...rest } = b.sister; changes.push(['sister', { ...setting('sister'), ...rest }]); if (reset_clicks) changes.push(['sister.clicks', 0]); }
    if (b.limits === null) changes.push(['limits', null]);
    else if (b.limits && typeof b.limits === 'object') { const cur = setting('limits'); changes.push(['limits', { basic: { ...cur.basic, ...(b.limits.basic || {}) }, pro: { ...cur.pro, ...(b.limits.pro || {}) } }]); }
    if (b.plans === null) changes.push(['plans', null]);
    else if (b.plans && typeof b.plans === 'object') {
      const cur = plansDef(), nb = { ...cur.basic, ...(b.plans.basic || {}) }, np = { ...cur.pro, ...(b.plans.pro || {}) };
      changes.push(['plans', { basic: { name: nb.name, per_ftd_cents: nb.per_ftd_cents }, pro: np }]);
      if (b.plans.basic) changes.push(['price.base_cents', nb.base_cents], ['price.included', nb.included], ['price.per_cents', nb.per_join_cents]);
    }
    for (const [g, vals] of Object.entries(b)) {
      if (!map[g] || !vals || typeof vals !== 'object') continue;
      for (const [k, v] of Object.entries(vals)) {
        const key = map[g](k); if (!key || !SETTING_DEFS[key]) continue;
        if (SETTING_DEFS[key].secret && typeof v === 'string' && (v.includes('•') || v === '')) continue; // masked value sent back unchanged
        if (g === 'features' && !FEATURE_KEYS.includes(k)) continue;
        if (key === 'joe.billing' && v && typeof v === 'object') { const cur = setting('joe.billing'); changes.push([key, { ...cur, ...v, free_daily: { ...cur.free_daily, ...(v.free_daily || {}) } }]); continue; }
        changes.push([key, v]);
      }
    }
    try { for (const [k, v] of changes) SETTING_DEFS[k].v(v === null ? SETTING_DEFS[k].def() : v); } catch (e) { return send(res, 400, { error: e.message }); }
    const shown = (k, v) => (SETTING_DEFS[k].secret ? (v ? '••••' + String(v).slice(-4) : '(none)') : v);
    const diff = changes.map(([k, v]) => ({ key: k, before: auditClean(shown(k, setting(k))), after: auditClean(shown(k, v === null ? SETTING_DEFS[k].def() : v)) }));
    for (const [k, v] of changes) setSetting(k, v);
    if (changes.length) audit(req, st, 'settings.update', [...new Set(changes.map((c) => c[0].split('.')[0]))].join(', ').slice(0, 120), { changes: diff.slice(0, 20) });
    log('admin settings', admin.email, changes.map((c) => c[0]).join(', '));
    return send(res, 200, { ok: true, changed: changes.length, settings: adminSettings() });
  }
  // ----- payment methods -----
  if (p === '/api/admin/pay-methods' && m === 'GET') return send(res, 200, adminPayMethods());
  if (p === '/api/admin/pay-methods/order' && m === 'POST') {
    const ids = (await readJson(req)).ids;
    if (!Array.isArray(ids)) return send(res, 400, { error: 'Send ids in the new order.' });
    tx(() => ids.forEach((id, i) => Q(`UPDATE pay_methods SET sort=? WHERE id=?`).run(i + 1, String(id))));
    return send(res, 200, adminPayMethods());
  }
  if (p === '/api/admin/pay-methods' && m === 'POST') {
    const b = await readJson(req, 32 * 1024);
    const type = String(b.type || '');
    if (!PM_TYPES.includes(type)) return send(res, 400, { error: 'Pick a type: Paystack, Stripe, Gatevoo, custom gateway, manual or crypto.' });
    const slug = String(b.name || b.label || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 10) || 'pay';
    let id = MANUAL_TYPES.has(type) ? 'm_' + slug : Q(`SELECT 1 FROM pay_methods WHERE id=?`).get(type) ? type + '_' + slug : type;
    if (type === 'flutterwave' && Q(`SELECT 1 FROM pay_methods WHERE type='flutterwave'`).get()) return send(res, 400, { error: 'Flutterwave is already in your list. Edit it instead.' });
    while (Q(`SELECT 1 FROM pay_methods WHERE id=?`).get(id)) id = id.replace(/_\d+$/, '') + '_' + crypto.randomInt(10, 99);
    const v = pmValidate(type, b); if (v.error) return send(res, 400, v);
    const sort = one(`SELECT COALESCE(MAX(sort),0) FROM pay_methods`) + 1;
    Q(`INSERT INTO pay_methods(id,type,label,note,currency,address,instructions,explorer,enabled,sort,created_at,countries,logo,fx_rate,min_usd,max_usd,fee_pct,config) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, type, v.label, v.note, v.currency, v.address, v.instructions, v.explorer, b.enabled === false ? 0 : 1, sort, now(), v.countries, v.logo, v.fx_rate, v.min_usd, v.max_usd, v.fee_pct, v.config);
    try { pmSecrets(type, b, id); } catch (e) { return send(res, 400, { error: e.message }); }
    log('admin added payment method', admin.email, id);
    return send(res, 200, { ok: true, id, ...adminPayMethods() });
  }
  if ((mm = /^\/api\/admin\/pay-methods\/([\w-]{2,40})\/(logo|test)$/.exec(p)) && m === 'POST') {
    const pmr = Q(`SELECT * FROM pay_methods WHERE id=?`).get(mm[1]);
    if (!pmr) return send(res, 404, { error: 'Payment method not found.' });
    if (mm[2] === 'logo') {
      let b; try { b = JSON.parse(await readBody(req, 1.2 * 1024 * 1024)); } catch { return send(res, 413, { error: 'That logo is too big. Use one under 600 KB.' }); }
      if (b.builtin !== undefined) {
        if (b.builtin && !BUILTIN_PAYLOGOS.includes(b.builtin)) return send(res, 400, { error: 'Unknown built-in logo.' });
        Q(`UPDATE pay_methods SET logo=? WHERE id=?`).run(b.builtin || null, pmr.id);
        return send(res, 200, { ok: true, ...adminPayMethods() });
      }
      const r = saveImage(PAYLOGO_DIR, pmr.id, b.data, 600 * 1024);
      if (r.error) return send(res, 400, r);
      const url = `/media/paylogos/${pmr.id}.${r.kind}?v=${now()}`;
      Q(`UPDATE pay_methods SET logo=? WHERE id=?`).run(url, pmr.id);
      return send(res, 200, { ok: true, logo: url, ...adminPayMethods() });
    }
    // test connection: the saved key, or a key typed in the editor but not saved yet
    const b = await readJson(req, 8 * 1024);
    const typed = typeof b.secret_key === 'string' && b.secret_key.trim() && !b.secret_key.includes('•') ? b.secret_key.trim() : '';
    const key = typed || pmSecret(pmr);
    if (!['paystack', 'stripe'].includes(pmr.type)) return send(res, 400, { error: 'Only Paystack and Stripe methods can be tested.' });
    if (!key) return send(res, 400, { ok: false, error: 'Add the secret key first.' });
    try {
      const url = pmr.type === 'paystack' ? `${PAYSTACK_API}/transaction?perPage=1` : `${STRIPE_API}/v1/balance`;
      const r = await fetch(url, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && (pmr.type === 'stripe' || j.status !== false)) return send(res, 200, { ok: true, message: `Connected. ${pmr.type === 'paystack' ? 'Paystack' : 'Stripe'} accepted the key${/_test_/.test(key) ? ' (test mode)' : ''}.` });
      return send(res, 200, { ok: false, error: `${pmr.type === 'paystack' ? 'Paystack' : 'Stripe'} said: ${String((j.error && j.error.message) || j.message || 'HTTP ' + r.status).slice(0, 160)}` });
    } catch (e) { return send(res, 200, { ok: false, error: 'Could not reach the payment provider. Try again in a minute.' }); }
  }
  if ((mm = /^\/api\/admin\/pay-methods\/([\w-]{2,40})$/.exec(p))) {
    const pmr = Q(`SELECT * FROM pay_methods WHERE id=?`).get(mm[1]);
    if (!pmr) return send(res, 404, { error: 'Payment method not found.' });
    if (m === 'DELETE') { Q(`DELETE FROM pay_methods WHERE id=?`).run(pmr.id); log('admin deleted payment method', admin.email, pmr.id); return send(res, 200, { ok: true, ...adminPayMethods() }); }
    if (m === 'PATCH' || m === 'PUT') {
      const b = await readJson(req, 32 * 1024);
      const keys = Object.keys(b);
      if (keys.length && keys.every((k) => k === 'enabled' || k === 'sort')) {
        if (b.enabled !== undefined) {
          if (b.enabled && pmr.type === 'crypto_manual' && !pmConfig(pmr).address && !pmr.address) return send(res, 400, { error: 'Add the wallet address before turning this on.' });
          Q(`UPDATE pay_methods SET enabled=? WHERE id=?`).run(b.enabled ? 1 : 0, pmr.id);
        }
        if (Number.isInteger(b.sort)) Q(`UPDATE pay_methods SET sort=? WHERE id=?`).run(b.sort, pmr.id);
        return send(res, 200, { ok: true, ...adminPayMethods() });
      }
      const merged = { label: pmr.label, note: pmr.note, currency: pmr.currency, address: pmr.address, instructions: pmr.instructions, explorer: pmr.explorer,
        fx_rate: pmr.fx_rate, min_usd: pmr.min_usd, max_usd: pmr.max_usd, fee_pct: pmr.fee_pct, enabled: pmr.enabled, ...b };
      if (b.name !== undefined) merged.label = b.name; if (b.description !== undefined) merged.note = b.description;
      delete merged.name; delete merged.description;
      const v = pmValidate(pmr.type, merged, pmr); if (v.error) return send(res, 400, v);
      Q(`UPDATE pay_methods SET label=?, note=?, currency=?, address=?, instructions=?, explorer=?, enabled=?, countries=?, logo=?, fx_rate=?, min_usd=?, max_usd=?, fee_pct=?, config=?, sort=COALESCE(?,sort) WHERE id=?`)
        .run(v.label, v.note, v.currency, v.address, v.instructions, v.explorer, b.enabled === undefined ? pmr.enabled : (b.enabled ? 1 : 0),
          v.countries, v.logo, v.fx_rate, v.min_usd, v.max_usd, v.fee_pct, v.config, Number.isInteger(b.sort) ? b.sort : null, pmr.id);
      try { pmSecrets(pmr.type, b, pmr.id); } catch (e) { return send(res, 400, { error: e.message }); }
      log('admin edited payment method', admin.email, pmr.id);
      return send(res, 200, { ok: true, ...adminPayMethods() });
    }
  }
  // ----- support team photos + saved replies -----
  if (p === '/api/admin/team/photo' && m === 'POST') {
    let b; try { b = JSON.parse(await readBody(req, 2.2 * 1024 * 1024)); } catch { return send(res, 413, { error: 'That photo is too big. Use one under 1.5 MB.' }); }
    const mt = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.data || ''));
    if (!mt) return send(res, 400, { error: 'Upload a PNG, JPG or WebP image.' });
    const buf = Buffer.from(mt[2], 'base64');
    if (buf.length > 1.5 * 1024 * 1024) return send(res, 400, { error: 'That photo is too big. Use one under 1.5 MB.' });
    const kind = buf[0] === 0x89 && buf[1] === 0x50 ? 'png' : buf[0] === 0xff && buf[1] === 0xd8 ? 'jpg' : buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP' ? 'webp' : '';
    if (!kind) return send(res, 400, { error: 'That file isn’t a real PNG, JPG or WebP image.' });
    const id = /^[a-z0-9]{4,16}$/.test(b.id || '') ? b.id : rid(6).toLowerCase().replace(/[^a-z0-9]/g, 'x');
    fs.mkdirSync(TEAM_DIR, { recursive: true });
    for (const e of ['png', 'jpg', 'webp']) { try { fs.unlinkSync(path.join(TEAM_DIR, `${id}.${e}`)); } catch { /* none */ } }
    fs.writeFileSync(path.join(TEAM_DIR, `${id}.${kind}`), buf);
    return send(res, 200, { ok: true, id, photo: `/media/team/${id}.${kind}?v=${now()}` });
  }
  if (p === '/api/admin/canned' && m === 'GET') return send(res, 200, { items: setting('support.canned') });
  if (p === '/api/admin/canned' && (m === 'PUT' || m === 'POST')) {
    const b = await readJson(req, 128 * 1024);
    try { setSetting('support.canned', b.items); } catch (e) { return send(res, 400, { error: e.message }); }
    return send(res, 200, { ok: true, items: setting('support.canned') });
  }
  // ----- emails -----
  if (p === '/api/admin/emails' && m === 'GET') {
    return send(res, 200, { email_on: !!resendKey(), from: C.MAIL_FROM, weekly_summary: !!setting('email.weekly_summary'),
      templates: Object.entries(EMAILS).map(([name, t]) => ({ name, title: t.title, when: t.when, optional: !!t.optional, subject: renderTemplate(name, t.sample()).subject })),
      log: Q(`SELECT l.id, l.kind, l.to_addr, l.subject, l.ok, l.sent_at FROM email_log l ORDER BY l.id DESC LIMIT 60`).all() });
  }
  if ((mm = /^\/api\/admin\/emails\/(\w+)\/(preview|test)$/.exec(p))) {
    const t = EMAILS[mm[1]]; if (!t) return send(res, 404, { error: 'No such email.' });
    const r = renderTemplate(mm[1], t.sample(), normLang(qs.get('lang')));
    if (mm[2] === 'preview') return qs.get('format') === 'text' ? send(res, 200, r.text, { 'content-type': 'text/plain; charset=utf-8' })
      : send(res, 200, r.html, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; img-src * data:; style-src 'unsafe-inline'" });
    if (m !== 'POST') return send(res, 405, { error: 'Use POST.' });
    if (limited('mailtest:' + admin.id, 20, 3600)) return send(res, 429, { error: 'That’s a lot of test emails. Try again in an hour.' });
    sendTemplate(admin.email, mm[1], t.sample(), { userId: admin.id, ref: 'test', lang: qs.get('lang') ? normLang(qs.get('lang')) : null });
    return send(res, 200, { ok: true, sent_to: admin.email, email_on: !!resendKey() });
  }
  // ----- Joe: "Test Joe" console (answers as the admin, or as a chosen user; nothing is saved or counted) -----
  if (p === '/api/admin/joe/usage') {
    const ok = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x || '');
    const to = ok(qs.get('to')) ? qs.get('to') : new Date().toISOString().slice(0, 10), from = ok(qs.get('from')) ? qs.get('from') : new Date(Date.parse(to) - 29 * 864e5).toISOString().slice(0, 10);
    const W = `day>=? AND day<=?`, A = [from, to];
    const tot = Q(`SELECT COUNT(*) messages, COALESCE(SUM(kind='paid'),0) paid, COALESCE(SUM(kind='free'),0) free, COALESCE(SUM(kind='error'),0) errors, COALESCE(SUM(kind='test'),0) tests,
      COALESCE(SUM(cost_micros),0) cost, COALESCE(SUM(credits),0) credits, COALESCE(SUM(guard),0) guarded FROM joe_answers WHERE ${W}`).get(...A);
    const fmt = (x) => { const cost = x.cost / 1e6, rev = x.credits / 100; return { ai_cost_usd: Math.round(cost * 10000) / 10000, revenue_usd: Math.round(rev * 100) / 100, margin_usd: Math.round((rev - cost) * 10000) / 10000, margin_pct: rev > 0 ? Math.round((rev - cost) / rev * 1000) / 10 : null }; };
    return send(res, 200, { from, to,
      totals: { messages: tot.messages, paid_messages: tot.paid, free_messages: tot.free, errors: tot.errors, admin_tests: tot.tests, margin_guarded: tot.guarded, credits: tot.credits, ...fmt(tot) },
      by_day: Q(`SELECT day, COUNT(*) messages, COALESCE(SUM(kind='paid'),0) paid, COALESCE(SUM(cost_micros),0) cost, COALESCE(SUM(credits),0) credits FROM joe_answers WHERE ${W} GROUP BY day ORDER BY day`).all(...A).map((x) => ({ day: x.day, messages: x.messages, paid_messages: x.paid, ...fmt(x) })),
      top_users: Q(`SELECT a.user_id, u.email, COUNT(*) messages, COALESCE(SUM(a.kind='paid'),0) paid, COALESCE(SUM(a.cost_micros),0) cost, COALESCE(SUM(a.credits),0) credits FROM joe_answers a LEFT JOIN users u ON u.id=a.user_id WHERE ${W.replace(/day/g, 'a.day')} GROUP BY a.user_id ORDER BY credits DESC, messages DESC LIMIT 10`).all(...A)
        .map((x) => ({ user_id: x.user_id, email: x.email, messages: x.messages, paid_messages: x.paid, ...fmt(x) })),
      by_model: Q(`SELECT provider, model, COUNT(*) messages, COALESCE(SUM(in_tokens),0) in_tokens, COALESCE(SUM(cache_read_tokens),0) cache_read_tokens, COALESCE(SUM(cache_write_tokens),0) cache_write_tokens, COALESCE(SUM(out_tokens),0) out_tokens, COALESCE(SUM(cost_micros),0) cost, COALESCE(SUM(credits),0) credits FROM joe_answers WHERE ${W} GROUP BY provider, model ORDER BY cost DESC`).all(...A)
        .map((x) => ({ provider: x.provider, model: x.model, messages: x.messages, in_tokens: x.in_tokens, cache_read_tokens: x.cache_read_tokens, cache_write_tokens: x.cache_write_tokens, out_tokens: x.out_tokens, ...fmt(x) })) });
  }
  if ((mm = /^\/api\/admin\/users\/(\d+)\/joe-bonus$/.exec(p)) && m === 'POST') {
    const b = await readJson(req), n = Math.round(Number(b.chats));
    if (!Number.isFinite(n) || n < 0 || n > 100000) return send(res, 400, { error: 'Bonus chats: a whole number from 0.' });
    if (!Q(`SELECT 1 FROM users WHERE id=?`).get(+mm[1])) return send(res, 404, { error: 'No such user.' });
    Q(`UPDATE users SET joe_bonus=? WHERE id=?`).run(n, +mm[1]);
    return send(res, 200, { ok: true, joe_bonus: n });
  }
  // ----- Joe playbooks: read built-in ones, add/edit/delete custom ones (a custom one with the same name overrides the built-in) -----
  if (p === '/api/admin/joe/playbooks' && m === 'GET') return send(res, 200, { playbooks: allPlaybooks(), builtin: builtinPlaybooks().map(({ name, use_when }) => ({ name, use_when })), custom: setting('joe.playbooks') || [] });
  if ((mm = /^\/api\/admin\/joe\/playbooks\/([\w.-]{1,70})$/.exec(p)) && m === 'GET') { const r = readPlaybook(mm[1]); return send(res, r.error ? 404 : 200, { ...r, text: r.text, full: true }); }
  if (p === '/api/admin/joe/playbooks' && m === 'POST' || ((mm = /^\/api\/admin\/joe\/playbooks\/([\w.-]{1,70})$/.exec(p)) && (m === 'PUT' || m === 'PATCH' || m === 'DELETE'))) {
    const cur = (setting('joe.playbooks') || []).slice(), key = mm && mm[1] ? pbName(mm[1]) : null;
    if (m === 'DELETE') {
      const i = cur.findIndex((x) => x.name === key); if (i < 0) return send(res, 404, { error: 'Only custom playbooks can be deleted.' });
      cur.splice(i, 1); setSetting('joe.playbooks', cur); audit(req, st, 'joe.playbook_delete', key, {});
      return send(res, 200, { ok: true, playbooks: allPlaybooks(), custom: setting('joe.playbooks') });
    }
    const b = await readJson(req, 90 * 1024);
    if (String(b.body || '').length > 60000) return send(res, 400, { error: 'A playbook can be up to 60,000 characters.' });
    const item = { name: b.name || key, use_when: b.use_when || '', body: b.body || '', updated_at: now() };
    const i = cur.findIndex((x) => x.name === (key || pbName(item.name)));
    if (m === 'POST' && i >= 0) return send(res, 400, { error: 'A custom playbook with that name exists. Edit it instead.' });
    if (i >= 0) cur[i] = item; else cur.push(item);
    try { setSetting('joe.playbooks', cur); } catch (e) { return send(res, 400, { error: e.message }); }
    const n = pbName(item.name);
    audit(req, st, i >= 0 ? 'joe.playbook_update' : 'joe.playbook_create', n, { use_when: item.use_when, chars: String(item.body).length, overrides_builtin: builtinPlaybooks().some((x) => x.name === n) });
    return send(res, 200, { ok: true, name: n, playbooks: allPlaybooks(), custom: setting('joe.playbooks') });
  }
  if (p === '/api/admin/joe/test' && m === 'POST') {
    const b = await readJson(req, 16 * 1024); const msg = String(b.message || '').trim().slice(0, 500);
    if (!msg) return send(res, 400, { error: 'Type a question for Joe.' });
    const u = joeUser(b.user_id ? +b.user_id : admin.id); if (!u) return send(res, 404, { error: 'No such user.' });
    if (limited('joetest:' + admin.id, 40, 3600)) return send(res, 429, { error: 'That’s a lot of tests. Try again in an hour.' });
    const t0 = now(), r = await joeAnswer(u, msg, []);
    if (r.usage && r.model) joeRecord(u, r, r.ai ? 'test' : 'error');
    return send(res, 200, { reply: r.reply, ai: !!r.ai, provider: joeProvider(), model: r.ai ? joeModel() : null, cost_usd: r.usage ? Math.round(joeCostUsd(r.usage, r.model, r.provider) * 1e6) / 1e6 : 0, would_charge: r.ai ? joeCredits(joeCostUsd(r.usage, r.model, r.provider), false) : 0, tools: r.tools || [], error: r.error || null, ms: now() - t0, as: u.email, insights: joeInsights(u.id) });
  }
  // ----- broadcasts -----
  if (p === '/api/admin/broadcasts' && m === 'GET') return send(res, 200, { broadcasts: Q(`SELECT * FROM broadcasts ORDER BY id DESC LIMIT 100`).all().map(broadcastView), levels: setting('levels'), langs: LANGS });
  if (p === '/api/admin/broadcasts/preview' && m === 'POST') {
    const b = await readJson(req, 64 * 1024), u = audienceUsers(audienceOf(b.audience || b));
    return send(res, 200, { count: u.length, sample: u.slice(0, 5).map((x) => x.email), email_off: b.also_email ? u.filter((x) => notifyPrefs(x.id).update.email === false).length : 0 });
  }
  if (p === '/api/admin/broadcasts/image' && m === 'POST') {
    let b; try { b = JSON.parse(await readBody(req, 2.2 * 1024 * 1024)); } catch { return send(res, 413, { error: 'That image is too big. Use one under 1.5 MB.' }); }
    const id = 'b' + rid(8).toLowerCase().replace(/[^a-z0-9]/g, 'x'), r = saveImage(BC_DIR, id, b.data); if (r.error) return send(res, 400, r);
    return send(res, 200, { ok: true, url: `/media/broadcast/${id}.${r.kind}` });
  }
  if (p === '/api/admin/broadcasts' && m === 'POST') {
    const b = await readJson(req, 64 * 1024), v = broadcastValidate(b); if (v.error) return send(res, 400, v);
    if (limited('bcast:' + admin.id, 30, 3600)) return send(res, 429, { error: 'That’s a lot of broadcasts. Try again in an hour.' });
    const r = sendBroadcast(v, admin.email);
    return send(res, 200, { ok: true, ...r, broadcast: broadcastView(Q(`SELECT * FROM broadcasts WHERE id=?`).get(r.id)) });
  }
  if ((mm = /^\/api\/admin\/broadcasts\/(\d+)$/.exec(p)) && m === 'DELETE') {
    const bc = Q(`SELECT id FROM broadcasts WHERE id=?`).get(+mm[1]); if (!bc) return send(res, 404, { error: 'Broadcast not found.' });
    const r = Q(`DELETE FROM inbox WHERE broadcast_id=? AND read_at IS NULL`).run(bc.id); Q(`DELETE FROM broadcasts WHERE id=?`).run(bc.id);
    log('broadcast deleted', bc.id, admin.email, r.changes);
    return send(res, 200, { ok: true, removed: Number(r.changes) });
  }
  // ----- run a background job now (handy after changing settings, and for tests) -----
  if (p === '/api/admin/jobs/run' && m === 'POST') {
    const job = (await readJson(req)).job;
    const jobs = { levels: levelJobs, alerts: alertJobs, trials: trialJobs, meet_joe: meetJoeJobs, inbox_daily: inboxDailyJobs, blog: blogJobs, voo_use: vooUseJob, voo_flush: vooFlush };
    if (!jobs[job]) return send(res, 400, { error: 'Jobs: ' + Object.keys(jobs).join(', ') });
    jobs[job](); return send(res, 200, { ok: true, job });
  }
  if (p === '/api/admin/retry-failed' && m === 'POST') {
    const r = Q(`UPDATE capi_queue SET status='pending', attempts=0, next_at=? WHERE status='failed' AND created_at>?`).run(now(), now() - 7 * 864e5);
    return send(res, 200, { ok: true, retried: Number(r.changes) });
  }
  send(res, 404, { error: 'Not found' });
}

// Every 10 minutes: ask Telegram how each bot's webhook is doing, and repair it if it was changed or removed.
let healthBusy = false;
async function checkBots() {
  if (healthBusy) return; healthBusy = true;
  try {
    for (const b of Q(`SELECT * FROM bots WHERE status='active'`).all()) {
      const r = await tg(b.token, 'getWebhookInfo');
      if (!r.ok) { if (r.error_code === 401) handleTgError(b.id, null, r); continue; }
      const info = r.result, want = `${BASE_URL}/tg/${b.id}`;
      let fixed = false;
      if (info.url !== want || (Array.isArray(info.allowed_updates) && !info.allowed_updates.includes('chat_join_request'))) {
        // Someone (often another tool, or the customer's own code) replaced our webhook. Take it back, keep their URL for forwarding.
        if (info.url && !info.url.startsWith(BASE_URL)) Q(`UPDATE bots SET prev_webhook=? WHERE id=?`).run(info.url, b.id);
        const s = await tg(b.token, 'setWebhook', { url: want, secret_token: b.secret, max_connections: 40, allowed_updates: TG_UPDATES });
        fixed = !!s.ok; log('webhook repaired for bot', b.username, 'was', info.url || '(none)', s.ok ? 'ok' : s.description);
      }
      Q(`UPDATE bots SET health=? WHERE id=?`).run(JSON.stringify({ at: now(), pending: info.pending_update_count || 0,
        last_error: info.last_error_message || '', last_error_at: info.last_error_date ? info.last_error_date * 1000 : 0, url_ok: info.url === want || fixed, repaired: fixed }), b.id);
    }
  } catch (e) { log('bot check error', e.message); } finally { healthBusy = false; }
}

// ---------- static files with ETag (joomoji.js, translations, email art, blog) ----------
const MEDIA_TYPES = { png: 'image/png', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml' };
const staticCache = new Map();
const fillPage = (txt) => txt.replaceAll('{{BASE_URL}}', BASE_URL).replaceAll('{{APP_URL}}', '/app').replaceAll('{{DEMO_URL}}', '/demo').replaceAll('{{HOME_URL}}', '/')
  .replaceAll('{{SIGNUP_URL}}', '/signup').replaceAll('{{GUIDE_URL}}', '/guide').replaceAll('{{CONTACT}}', esc(C.SUPPORT_CONTACT || BASE_URL));
/** Serve one file with an ETag and 304s. long: 1 day + revalidate (1 year when versioned). fill: replace {{BASE_URL}} and friends. wrap: page fragment → document. */
function sendStatic(req, res, file, type, { long = false, versioned = false, maxAge = 300, fill = false, wrap = false, notFound } = {}) {
  let st; try { st = fs.statSync(file); } catch { st = null; }
  if (!st || !st.isFile()) return notFound ? notFound() : send(res, 404, 'Not found', { 'content-type': 'text/plain' });
  const vh = fill && wrap ? vooHead() : ''; // blog pages: the Voo Connect snippet (and the VooSquare widget when switched on)
  const key = file + (fill ? '|f' : '') + (wrap ? '|w' : '') + vh;
  let c = staticCache.get(key);
  if (!c || c.mtime !== st.mtimeMs || c.size !== st.size) {
    let body = fs.readFileSync(file);
    if (fill || wrap) { let t = body.toString('utf8'); if (fill) t = fillPage(t); if (vh) t = /<\/head>/i.test(t) ? t.replace(/<\/head>/i, vh + '</head>') : vh + t; if (wrap && !/^\s*(<!doctype|<html)/i.test(t)) t = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${t}</body></html>`; body = Buffer.from(t); }
    c = { mtime: st.mtimeMs, size: st.size, body, etag: '"' + crypto.createHash('sha1').update(body).digest('base64url').slice(0, 22) + '"' };
    if (staticCache.size > 600) staticCache.clear();
    staticCache.set(key, c);
  }
  const cc = res._noStore ? 'no-store' : versioned ? 'public, max-age=31536000, immutable' : long ? 'public, max-age=86400, stale-while-revalidate=2592000' : `public, max-age=${maxAge}`;
  const h = { etag: c.etag, 'cache-control': cc, 'x-content-type-options': 'nosniff' };
  if (type.startsWith('image/svg')) h['content-security-policy'] = "default-src 'none'; style-src 'unsafe-inline'";
  if (String(req.headers['if-none-match'] || '').split(/\s*,\s*/).includes(c.etag)) { res.writeHead(304, h); return res.end(); }
  res.writeHead(200, { ...h, 'content-type': type, 'content-length': c.body.length });
  return res.end(req.method === 'HEAD' ? undefined : c.body);
}
function blogPage(req, res, file) {
  return sendStatic(req, res, path.join(PUBLIC, 'blog', file), 'text/html; charset=utf-8', { maxAge: 300, fill: true, wrap: true,
    notFound: () => send(res, 404, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not found · Joinvoo</title><meta name="robots" content="noindex"></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,sans-serif;background:#f6f5fb;color:#16132b"><main style="text-align:center;padding:24px"><h1 style="margin:0 0 8px">Page not found</h1><p style="color:#5f5a7a;margin:0 0 20px">This article isn’t here (yet).</p><a href="/blog" style="color:#5b3df5;font-weight:700">Back to the blog</a> · <a href="/" style="color:#5b3df5;font-weight:700">Joinvoo home</a></main></body></html>`, { 'content-type': 'text/html; charset=utf-8' }) });
}
function startSession(res, userId, email) {
  const token = rid(24);
  Q(`INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)`).run(token, userId, now() + 30 * 864e5);
  send(res, 200, { ok: true, email }, { 'set-cookie': cookie('jp_session', token, 30 * 86400) });
}

// ---------- VooSquare: Voo ID login, affiliate hand-off, money events, support (the Voo Connect kit, see VOOSQUARE-CONNECT.md) ----------
// The kit is in ./voo-connect (copied unchanged from VooSquare's sdk/voo-connect); lib/voo.js builds it from the settings below.
// Everything is off until a VooSquare address is set (VOO_BASE or Admin → Settings → Integrations → VooSquare).
const VC = require('./voo-connect');
const VOO_SIGNAL_SECRET = env.VOO_SIGNAL_SECRET || crypto.createHmac('sha256', APP_SECRET).update('voo-signals').digest('hex');
const vooRedirect = () => setting('voo.redirect_uri') || `${BASE_URL}/auth/voosquare/callback`;
/** The key VooSquare gave Joinvoo (Admin → Products → Joinvoo → API key). Older setups only had the service key. */
const vooApiKey = () => setting('voo.api_key') || setting('voo.service_key');
const vooBase = () => setting('voo.issuer') || '';
const vooStore = (() => { // the kit's event outbox, kept in the database so events survive restarts and deploys
  let last = new Map();
  return {
    load() { const rows = Q(`SELECT event_id, body FROM voo_kit_outbox ORDER BY seq`).all(); last = new Map(rows.map((r) => [r.event_id, r.body])); return rows.map((r) => { try { return JSON.parse(r.body); } catch { return null; } }).filter(Boolean); },
    save(list) {
      tx(() => {
        const next = new Map(); let seq = 0;
        for (const x of list) { const b = JSON.stringify(x); next.set(x.event.event_id, b); if (last.get(x.event.event_id) !== b) Q(`INSERT INTO voo_kit_outbox(event_id,body,seq) VALUES(?,?,?) ON CONFLICT(event_id) DO UPDATE SET body=excluded.body`).run(x.event.event_id, b, Date.now() * 1000 + (seq++ % 1000)); }
        for (const id of last.keys()) if (!next.has(id)) Q(`DELETE FROM voo_kit_outbox WHERE event_id=?`).run(id);
        last = next;
      });
    },
  };
})();
const voo = require('./lib/voo')({ store: vooStore, log: (...a) => log(...a),
  config: () => ({ base: vooBase(), serverBase: (env.VOO_SERVER_BASE || '').replace(/\/+$/, ''), clientId: setting('voo.client_id'), clientSecret: setting('voo.client_secret'), apiKey: vooApiKey(),
    redirectUri: vooRedirect(), signalSecret: VOO_SIGNAL_SECRET, secureCookies: SECURE, backoffMs: Math.max(50, +env.VOO_BACKOFF_MS || 1000) }) });
const vooLoginOn = () => setting('voo.login_mode') !== 'off' && !!vooBase() && !!setting('voo.client_id') && !!setting('voo.client_secret');
const vooEventsOn = () => !!vooBase() && !!vooApiKey();
/** Public pages: the Voo Connect browser snippet (keeps ref / vclick / coupon for "Continue with VooSquare"), and VooSquare's chat widget when switched on. */
const vooHead = () => (vooBase() ? '<script src="/voo-connect-browser.js" defer></script>' + (setting('voo.widget') ? `<script src="${esc(vooBase())}/widget.js" data-product="joinvoo" defer></script>` : '') : '');
/** Joinvoo's own paths for the addresses VooSquare uses for every tool (its launcher opens /auth/voosquare?return_to=/dashboard). */
const vooLocalPath = (r) => (r === '/dashboard' || r.startsWith('/dashboard?') ? '/app' : r === '/settings' ? '/app#help' : r);
/** Adds Set-Cookie headers to what the kit already set on this response. */
const addCookies = (res, list) => { for (const c of list) VC.appendCookie(res, c); };

async function vooStart(req, res, url) {
  const k = vooLoginOn() ? voo.kit() : null;
  if (!k) return send(res, 302, '', { location: '/login?voo_error=off' });
  // Joinvoo's older affiliate links (?aff=CODE, /a/CODE) are VooSquare affiliate codes: hand the code on as ref when the kit has no click.
  const a = k.readAttribution(req), old = affRead(req);
  if (!a.ref && !a.vclick && old && !url.searchParams.has('ref')) req.url += (req.url.includes('?') ? '&' : '?') + 'ref=' + encodeURIComponent(old.code);
  k.startLogin(req, res);
}
const VOO_ERR = { state_missing: 'expired', state_expired: 'expired', state_mismatch: 'state', access_denied: 'denied', invalid_grant: 'token', invalid_client: 'token', invalid_id_token: 'token', invalid_request: 'token' };
async function vooCallback(req, res) {
  const fail = (code, why) => { if (why) log('voosquare login refused:', code, why); res.writeHead(302, { location: '/login?voo_error=' + code, 'cache-control': 'no-store' }); return res.end(); };
  const k = vooLoginOn() ? voo.kit() : null;
  if (!k) return fail('off');
  let r;
  try { r = await k.handleCallback(req, res); } catch (e) { return fail(VOO_ERR[e.code] || 'unavailable', `${e.code || ''} ${e.message}`); }
  const vu = r.user, vooId = String(vu.voo_id || '').slice(0, 200), email = String(vu.email || '').trim().toLowerCase();
  if (!vooId) return fail('token', 'no voo_id');
  let u = Q(`SELECT id, email, status FROM users WHERE voo_id=?`).get(vooId);
  const me = currentUser(req), mine = me ? Q(`SELECT id, email, status, voo_id FROM users WHERE id=?`).get(me.id) : null;
  if (!u && mine) {
    // "Connect your VooSquare account": the member is logged in to Joinvoo, so this Voo ID belongs to THIS account.
    if (mine.voo_id) return fail('link', `account ${mine.id} is already linked to another Voo ID`);
    vooLink(req, mine, vooId, 'session'); u = mine;
  } else if (!u) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('no_email', 'no email in the VooSquare user');
    const local = Q(`SELECT id, email, status, verified_at, voo_id FROM users WHERE email=?`).get(email);
    if (local) {
      // One-time link by email: confirmed on both sides (an unconfirmed local account could have been opened by someone else
      // with this address: pre-account takeover), and not linked to another Voo ID yet.
      if (!local.verified_at || vu.email_verified !== true || local.voo_id) return fail('link', `cannot link ${email}: local verified=${!!local.verified_at} voosquare verified=${vu.email_verified} already=${!!local.voo_id}`);
      vooLink(req, local, vooId, 'email'); u = local;
    } else {
      const country = normCountry(vu.country);
      const name = String(vu.name || '').trim().slice(0, 80) || null, ref = vu.voo_ref ? String(vu.voo_ref).slice(0, 80) : null;
      const ins = Q(`INSERT INTO users(email,pass,created_at,ref_code,name,canon,verified_at,voo_id,referred_by_voo,country,voo_linked_at,voo_spent_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?,0)`)
        .run(email, hashPass(rid(24)), now(), newRefCode(), name, canonicalEmail(email), now(), vooId, ref, country, now());
      const uid = Number(ins.lastInsertRowid);
      affAttach(req, uid, null);
      if (country) Q(`UPDATE users SET country_history=? WHERE id=?`).run(JSON.stringify([{ from: null, to: country, at: now(), by: 'voosquare' }]), uid);
      grantWelcome(uid);
      if (setting('trial.starts') === 'signup') checkTrial(uid);
      u = { id: uid, email, status: 'active' }; log('voosquare: new user', email);
    }
  }
  if (u.status === 'suspended') return fail('suspended');
  const token = rid(24);
  Q(`INSERT INTO sessions(token,user_id,expires_at,via,id_token) VALUES(?,?,?,?,?)`).run(token, u.id, now() + 30 * 864e5, 'voosquare', null);
  if (me) { const old = cookies(req).jp_session; if (old) Q(`DELETE FROM sessions WHERE token=?`).run(old); }
  addCookies(res, [cookie('jp_session', token, 30 * 86400)]);
  res.writeHead(302, { location: vooLocalPath(r.returnTo || '/app'), 'cache-control': 'no-store' });
  return res.end();
}
/** Save a Voo ID on an existing Joinvoo account (once). Money already spent before the link is never reported to VooSquare. */
function vooLink(req, local, vooId, how) {
  Q(`UPDATE users SET voo_id=?, voo_linked_at=?, voo_spent_cents=? WHERE id=? AND voo_id IS NULL`).run(vooId, now(), vooFunded(local.id), local.id);
  audit(req, null, 'users.voo_link', 'user:' + local.id, { email: local.email, voo_id: vooId, how });
  inboxAdd(local.id, { kind: 'account', title: tr(userLang(local.id), 'voo.linked_title'), body: tr(userLang(local.id), 'voo.linked_body'), tag: 'voo_link' });
  log('voosquare: linked', local.email, how);
}
/** Where to send someone after logging out: VooSquare's /oauth/logout ("log out everywhere", back to our home page) for a session
 * that started with VooSquare; a password session just logs out here. */
function vooLogoutUrl(sess) {
  const k = vooLoginOn() ? voo.kit() : null;
  return k && sess && sess.via === 'voosquare' ? k.logoutUrl(BASE_URL + '/') : null;
}
/** Admin "Test connection": the kit's own self-test (check.js) against the saved settings. Changes nothing in VooSquare. */
async function vooTest() {
  if (!vooBase()) return { ok: false, error: 'Fill in the VooSquare address first.' };
  try {
    const out = await voo.runChecks({ base: vooBase(), clientId: setting('voo.client_id'), clientSecret: setting('voo.client_secret'), apiKey: vooApiKey(),
      redirectUris: [vooRedirect()], logoutUri: BASE_URL + '/', summaryUrl: vooApiKey() ? `${BASE_URL}/api/voosquare/summary` : '', timeoutMs: 8000 });
    const bad = out.results.filter((x) => x.status === 'fail');
    return { ok: out.ok, message: out.ok ? `VooSquare connection OK: ${out.results.filter((x) => x.status === 'pass').length} checks passed.` : undefined,
      error: out.ok ? undefined : bad.map((x) => x.name + (x.detail ? ': ' + x.detail : '')).join(' · ').slice(0, 900), results: out.results };
  } catch (e) { return { ok: false, error: e.message || 'Could not reach VooSquare.' }; }
}

// ----- summary API for the VooSquare home screen -----
const PERIOD_MS = { '1d': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5 };
function vooSummary(vooId, period) {
  const u = Q(`SELECT id, status, plan FROM users WHERE voo_id=?`).get(String(vooId || ''));
  if (!u) return { tool: 'joinvoo', linked: false };
  const ms = PERIOD_MS[period] || PERIOD_MS['7d'], t1 = now(), t0 = t1 - ms, tp = t0 - ms;
  const h = (a, b) => Q(`SELECT COALESCE(SUM(joins),0) j, COALESCE(SUM(filtered),0) f FROM hourly WHERE owner_id=? AND hour>=? AND hour<?`).get(u.id, Math.floor(a / 3600000), Math.floor(b / 3600000));
  const cv = (a, b) => Q(`SELECT COALESCE(SUM(event='ftd' AND COALESCE(rejected,0)=0),0) ftd, COALESCE(SUM(${REVENUE_SQL}),0) rev FROM conversions WHERE owner_id=? AND created_at>=? AND created_at<?`).get(u.id, a, b);
  const sp = (a, b) => Q(`SELECT COALESCE(SUM(amount_cents),0) n FROM spend WHERE owner_id=? AND date>=? AND date<?`).get(u.id, new Date(a).toISOString().slice(0, 10), new Date(b).toISOString().slice(0, 10)).n;
  const H = h(t0, t1 + 3600000), Hp = h(tp, t0), V = cv(t0, t1 + 1), Vp = cv(tp, t0), S = sp(t0, t1 + 864e5), Sp = sp(tp, t0);
  const chg = (a, b) => (a == null || b == null || !b ? null : Math.round((a - b) / b * 1000) / 10);
  const cpf = (s, f) => (s > 0 && f > 0 ? Math.round(s / f) / 100 : null);
  const m = (key, label, value, prev, unit) => ({ key, label, value, unit, change_pct: chg(value, prev) });
  const st = trackingState(u.id), ti = trialInfo(u.id);
  const hasCh = !!Q(`SELECT 1 FROM channels WHERE owner_id=? AND status<>'removed' LIMIT 1`).get(u.id);
  const status = !hasCh ? 'none' : !st.ok ? 'paused' : ti && ti.status === 'active' ? 'trial' : 'active';
  return { tool: 'joinvoo', linked: true, status, period: PERIOD_MS[period] ? period : '7d',
    metrics: [m('joins', 'Real joins', H.j, Hp.j, 'count'), m('ftds', 'First deposits', V.ftd, Vp.ftd, 'count'), m('revenue_usd', 'Revenue', V.rev / 100, Vp.rev / 100, 'usd'),
      m('cost_per_ftd_usd', 'Cost per FTD', cpf(S, V.ftd), cpf(Sp, Vp.ftd), 'usd'), m('bots_blocked', 'Bots blocked', H.f, Hp.f, 'count')],
    open_url: `${BASE_URL}/app` };
}

// ----- VooSquare affiliates: ?aff=CODE (also ?voo_aff=, ?via=, /a/CODE) is remembered for 90 days and tied to the account at sign-up, for life -----
const AFF_RE = /^[A-Za-z0-9_-]{2,40}$/;
function affCapture(req, url) {
  const code = url.searchParams.get('aff') || url.searchParams.get('voo_aff') || '';
  if (!AFF_RE.test(code)) return null;
  const have = cookies(req).jv_aff; if (have && have.split('|')[0] === code) return null; // first affiliate keeps the visitor while the cookie lives
  if (have) return null;
  const sub = String(url.searchParams.get('sub1') || url.searchParams.get('sub') || '').replace(/[^\w.:-]/g, '').slice(0, 60);
  return `jv_aff=${encodeURIComponent(code + (sub ? '|' + sub : ''))}; Path=/; Max-Age=${90 * 86400}; SameSite=Lax${SECURE ? '; Secure' : ''}`;
}
function affRead(req) {
  const v = cookies(req).jv_aff; if (!v) return null;
  const [code, sub] = decodeURIComponent(v).split('|');
  return AFF_RE.test(code || '') ? { code, sub: sub || null } : null;
}
/** Save the affiliate on a NEW account only (never moves an existing customer to another affiliate). */
function affAttach(req, uid, fromClaims) {
  const a = fromClaims && AFF_RE.test(String(fromClaims)) ? { code: String(fromClaims), sub: null } : affRead(req);
  if (!a) return;
  Q(`UPDATE users SET aff_code=?, aff_sub=?, aff_at=? WHERE id=? AND aff_code IS NULL`).run(a.code, a.sub, now(), uid);
  log('affiliate signup', uid, a.code);
}
/** Server-to-server calls from VooSquare: Authorization: Bearer <VOO_API_KEY> (or the older service key). */
function vooAuthOk(req) {
  const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return !!got && [setting('voo.api_key'), setting('voo.service_key')].some((k) => k && safeEq(got, k));
}
// ----- support bridge: customer messages are copied to the VooSquare HQ inbox; replies made there come back into the same chat -----
function vooSupportQueue(ticketId, msgId) {
  try { if (!setting('voo.support_bridge') || !vooApiKey() || !vooBase()) return;
    Q(`INSERT OR IGNORE INTO voo_support_out(msg_id,ticket_id,attempts,next_at,created_at) VALUES(?,?,0,?,?)`).run(msgId, ticketId, now(), now()); } catch (e) { log('voo support queue', e.message); }
}
let vsBusy = false, vsLast = { at: null, error: null, sent: 0 };
async function vooSupportFlush() {
  if (vsBusy) return; vsBusy = true;
  try {
    if (!setting('voo.support_bridge') || !vooApiKey() || !vooBase()) return;
    Q(`UPDATE voo_support_out SET failed=1 WHERE sent_at IS NULL AND COALESCE(failed,0)=0 AND created_at<?`).run(now() - 24 * 3600e3);
    const rows = Q(`SELECT o.id, o.attempts, m.body, m.created_at, t.id AS tid, t.email, t.name, t.user_id, t.voo_ticket, u.email AS uemail, u.name AS uname, u.voo_id
      FROM voo_support_out o JOIN ticket_msgs m ON m.id=o.msg_id JOIN tickets t ON t.id=o.ticket_id LEFT JOIN users u ON u.id=t.user_id
      WHERE o.sent_at IS NULL AND COALESCE(o.failed,0)=0 AND o.next_at<=? ORDER BY o.id LIMIT 20`).all(now());
    for (const r of rows) {
      let err = null;
      try {
        const j = await voo.kit().support.send({ email: r.uemail || r.email || '', name: r.uname || r.name || '', subject: 'Joinvoo support chat', body: r.body, externalRef: 'joinvoo-' + r.tid, vooId: r.voo_id || undefined });
        if (j && (j.ticket_id || j.id)) Q(`UPDATE tickets SET voo_ticket=? WHERE id=? AND voo_ticket IS NULL`).run(String(j.ticket_id || j.id), r.tid);
      } catch (e) { err = e.status ? 'HTTP ' + e.status : e.message || 'network error'; }
      if (!err) { Q(`UPDATE voo_support_out SET sent_at=?, last_error=NULL WHERE id=?`).run(now(), r.id); vsLast = { at: now(), error: null, sent: vsLast.sent + 1 }; }
      else { Q(`UPDATE voo_support_out SET attempts=attempts+1, next_at=?, last_error=? WHERE id=?`).run(now() + Math.min(6 * 3600e3, Math.max(100, +env.VOO_BACKOFF_MS || 15000) * 2 ** Math.min(r.attempts, 12)), err, r.id); vsLast = { ...vsLast, error: err, error_at: now() }; log('voo support: send failed', err); break; }
    }
  } catch (e) { log('voo support flush', e.message); } finally { vsBusy = false; }
}
setInterval(vooSupportFlush, +env.VOO_OUTBOX_MS || 15000).unref();
function vooSupportStats() {
  const n = (sql, ...a) => cnt(sql, ...a);
  return { enabled: !!setting('voo.support_bridge') && !!vooApiKey() && !!vooBase(), pending: n(`SELECT COUNT(*) FROM voo_support_out WHERE sent_at IS NULL AND COALESCE(failed,0)=0`),
    failed: n(`SELECT COUNT(*) FROM voo_support_out WHERE COALESCE(failed,0)=1`), sent: n(`SELECT COUNT(*) FROM voo_support_out WHERE sent_at IS NOT NULL`), last_error: vsLast.error, last_sent_at: vsLast.at };
}
/** A reply typed in VooSquare HQ lands in the customer's Joinvoo chat (and their email when they're away). */
function vooSupportReply(b) {
  const ref = String(b.external_ref || ''), m = /^joinvoo-(\d+)$/.exec(ref);
  const t = m ? Q(`SELECT * FROM tickets WHERE id=?`).get(+m[1]) : b.ticket_id != null ? Q(`SELECT * FROM tickets WHERE voo_ticket=?`).get(String(b.ticket_id)) : null;
  if (!t) return { error: 'Unknown conversation.', status: 404 };
  const body = String(b.body || b.text || '').trim().slice(0, 4000); if (!body) return { error: 'Empty reply.', status: 400 };
  const ext = 'voo:' + (b.message_id || b.id || crypto.createHash('sha256').update(String(b.ticket_id || '') + '|' + (b.created_at || '') + '|' + body).digest('hex').slice(0, 24));
  const agent = String(b.agent || b.agent_name || 'Zedapex support').slice(0, 60);
  const ins = Q(`INSERT OR IGNORE INTO ticket_msgs(ticket_id,from_admin,body,created_at,source,ext_id,agent_name) VALUES(?,1,?,?,'voosquare',?,?)`).run(t.id, body, now(), ext, agent);
  if (!ins.changes) return { ok: true, duplicate: true };
  Q(`UPDATE tickets SET last_at=?, unread_user=unread_user+1, unread_admin=0, status='open', source=COALESCE(source,'voosquare'), voo_ticket=COALESCE(voo_ticket,?) WHERE id=?`).run(now(), b.ticket_id != null ? String(b.ticket_id) : null, t.id);
  const u = t.user_id ? Q(`SELECT email, last_seen FROM users WHERE id=?`).get(t.user_id) : null, to = u ? u.email : t.email;
  if (to && (!u || !u.last_seen || u.last_seen < now() - 5 * 60000)) sendTemplate(to, 'support_reply', { body, agent: { name: agent, photo: '', role: '' }, user: !!u }, { userId: t.user_id || null, ref: 'ticket:' + t.id });
  return { ok: true };
}
// ----- events → VooSquare (the kit queues, batches, retries; never end-customer personal data) -----
// Money (VOOSQUARE-CONNECT.md): a top-up is `wallet_topup` (no commission); credits as they are USED are `spend` (commission):
// a plan charge at once (+ plan_started / plan_renewed), extra joins / FTD fees / Joe answers as one `spend` per customer per day;
// a refund of unused top-up money is `refund`; a card dispute is `chargeback` against the spends it funded.
// Only money that came from real payments counts: welcome, bonus and promo credits never earn an affiliate anything.
const VOO_USE_KINDS = `'joins','ftds','joe'`, VOO_CONSUME_KINDS = `'plan','joins','ftds','joe'`, VOO_PAID_KINDS = `'deposit','refund','chargeback'`;
/** Real money this customer has used up to `until` (ms): what they consumed, but never more than they paid in (net of refunds and chargebacks). */
function vooFunded(uid, until) {
  const t = until || 9e15;
  const used = -Q(`SELECT COALESCE(SUM(amount_cents),0) n FROM ledger WHERE user_id=? AND kind IN (${VOO_CONSUME_KINDS}) AND created_at<?`).get(uid, t).n;
  const paid = Q(`SELECT COALESCE(SUM(amount_cents),0) n FROM ledger WHERE user_id=? AND kind IN (${VOO_PAID_KINDS}) AND created_at<?`).get(uid, t).n;
  return Math.max(0, Math.min(used, paid));
}
const vooUser = (uid) => Q(`SELECT id, voo_id, country, voo_spent_cents, voo_linked_at FROM users WHERE id=?`).get(uid);
/** Activity in the customer's funnels (join, lead, signup, ftd, deposit, bot_blocked) and plan_cancelled. Linked members only. */
function vooEvent(uid, type, eventId, label, extra = {}) {
  if (!vooEventsOn()) return;
  const u = vooUser(uid); if (!u || !u.voo_id) return;
  voo.track((k) => k.events.activity(type, { eventId, vooId: u.voo_id, label: String(label || '').slice(0, 120), ...(extra.value > 0 ? { valueUsd: extra.value } : {}), ...(extra.plan ? { plan: extra.plan } : {}) }));
}
/** Records a reported spend and queues it. cents: real money in this spend (≥ 1). */
function vooSpend(u, eventId, cents, label, extra = {}) {
  Q(`UPDATE users SET voo_spent_cents=COALESCE(voo_spent_cents,0)+? WHERE id=?`).run(cents, u.id);
  Q(`INSERT OR IGNORE INTO voo_spends(event_id,user_id,cents,reversed_cents,kind,at,created_at) VALUES(?,?,?,0,?,?,?)`).run(eventId, u.id, cents, extra.kind || 'spend', extra.at || now(), now());
  voo.track((k) => k.events.spend({ eventId, vooId: u.voo_id, valueUsd: cents / 100, label, plan: extra.plan, occurredAt: extra.at, country: u.country || undefined }));
}
/** A plan charge was written to the ledger (inside its transaction): spend for the real money in it, plus the plan sync event. */
function vooPlanCharged(uid, ledgerId, cost, ref) {
  if (!vooEventsOn()) return;
  const u = vooUser(uid); if (!u || !u.voo_id) return;
  const plan = String(ref).startsWith('planup:') ? 'pro' : userPlan(uid), P = plansDef()[plan] || { name: plan }, k = voo.kit(); // an upgrade is written before users.plan changes
  const cents = Math.max(0, Math.min(cost, vooFunded(uid) - (u.voo_spent_cents || 0)));
  const label = `Joinvoo ${P.name}${String(ref).startsWith('planup:') ? ' upgrade' : ''}, monthly`;
  const payId = k.events.id('pay', ledgerId);
  if (cents >= 1) vooSpend(u, payId, cents, label, { plan: P.name, kind: 'plan' });
  const first = String(ref).startsWith('planup:') || !Q(`SELECT 1 FROM ledger WHERE user_id=? AND kind='plan' AND id<? AND created_at>=? LIMIT 1`).get(uid, ledgerId, u.voo_linked_at || 0);
  // VooSquare keeps this as the plan's catalogue price (affiliate Offers page): always the list price, never a customer's custom deal.
  const price = (plansDef()[plan] || {}).base_cents || 0;
  if (price >= 1) voo.track((kk) => (first ? kk.events.planStarted : kk.events.planRenewed).call(kk.events, { eventId: kk.events.id(first ? 'plan' : 'renew', ledgerId), vooId: u.voo_id, plan: P.name, valueUsd: price / 100, label: `Joinvoo ${P.name}` }));
}
/** A top-up was paid: money into the wallet, not commissionable. */
function vooTopup(d) {
  if (!vooEventsOn()) return;
  const u = vooUser(d.user_id); if (!u || !u.voo_id || !(d.amount_cents >= 1)) return;
  voo.track((k) => k.events.walletTopup({ eventId: k.events.id('topup', d.id), vooId: u.voo_id, valueUsd: d.amount_cents / 100, label: `Wallet top-up (${depLabel(d)})`.slice(0, 120), occurredAt: d.paid_at || now(),
    ...(d.tx ? { signals: { payment_fingerprint: voo.kit().hashSignal(d.tx) } } : {}) }));
}
/** Daily job: one `spend` per customer per finished UTC day for the extra joins, FTD fees and Joe answers paid with real money. */
function vooUseJob() {
  if (!vooEventsOn()) return 0;
  const today0 = Date.parse(new Date().toISOString().slice(0, 10) + 'T00:00:00Z'); let n = 0;
  for (const u0 of Q(`SELECT id FROM users WHERE voo_id IS NOT NULL`).all()) {
    const u = vooUser(u0.id);
    const days = Q(`SELECT strftime('%Y-%m-%d', created_at/1000, 'unixepoch') day, -SUM(amount_cents) c FROM ledger WHERE user_id=? AND kind IN (${VOO_USE_KINDS}) AND created_at>=? AND created_at<? GROUP BY day ORDER BY day`).all(u.id, u.voo_linked_at || 0, today0);
    for (const d of days) {
      if (Q(`SELECT 1 FROM voo_use WHERE user_id=? AND day=?`).get(u.id, d.day)) continue;
      tx(() => {
        const cur = vooUser(u.id), end = Date.parse(d.day + 'T00:00:00Z') + 864e5;
        // Real money used by the end of that day, minus what was already reported for money used before then; and never more
        // than everything paid in minus everything reported so far (a plan charged since then may already have counted it).
        const before = Q(`SELECT COALESCE(SUM(cents-reversed_cents),0) n FROM voo_spends WHERE user_id=? AND at<?`).get(u.id, end).n;
        const cents = Math.max(0, Math.min(d.c, vooFunded(u.id, end) - before, vooFunded(u.id) - (cur.voo_spent_cents || 0)));
        const id = voo.kit().events.id('use', d.day, u.voo_id);
        Q(`INSERT INTO voo_use(user_id,day,cents,event_id,created_at) VALUES(?,?,?,?,?)`).run(u.id, d.day, cents, cents >= 1 ? id : null, now());
        if (cents >= 1) { vooSpend(cur, id, cents, 'Credits used (tracked joins, FTD fees, Joe)', { kind: 'use', at: end - 1000 }); n++; }
      });
    }
  }
  return n;
}
/** After a chargeback: take back commission on the most recent reported spends until reported ≤ real money kept. */
function vooClawback(uid, depId) {
  const u = vooUser(uid); if (!u || !u.voo_id) return 0;
  let excess = (u.voo_spent_cents || 0) - vooFunded(uid), i = 0, done = 0;
  if (excess <= 0) return 0;
  for (const s of Q(`SELECT * FROM voo_spends WHERE user_id=? AND cents>reversed_cents ORDER BY at DESC, rowid DESC`).all(uid)) {
    if (excess <= 0) break;
    const take = Math.min(excess, s.cents - s.reversed_cents);
    Q(`UPDATE voo_spends SET reversed_cents=reversed_cents+? WHERE event_id=?`).run(take, s.event_id);
    voo.track((k) => k.events.chargeback({ eventId: k.events.id('cb', depId, ++i), vooId: u.voo_id, valueUsd: take / 100, originalEventId: s.event_id, label: 'Card payment charged back' }));
    excess -= take; done += take;
  }
  Q(`UPDATE users SET voo_spent_cents=voo_spent_cents-? WHERE id=?`).run(done, uid);
  return done;
}
/** Real money still in the wallet (what can be refunded in cash): paid in minus what was used. */
const vooCashLeft = (uid) => { const paid = Q(`SELECT COALESCE(SUM(amount_cents),0) n FROM ledger WHERE user_id=? AND kind IN (${VOO_PAID_KINDS})`).get(uid).n; return Math.max(0, paid - vooFunded(uid)); };
/** Admin: refund (part of) a paid top-up that was not used. The money itself is sent back in the payment provider. */
function refundDeposit(d, cents, req) {
  return tx(() => {
    d = Q(`SELECT * FROM deposits WHERE id=?`).get(d.id) || d; // the row as it is now: two clicks in parallel must not both pass the checks
    const u = Q(`SELECT balance_cents FROM users WHERE id=?`).get(d.user_id);
    const max = Math.min(d.amount_cents - (d.refunded_cents || 0), vooCashLeft(d.user_id), Math.max(0, u.balance_cents || 0));
    if (d.status !== 'paid' || d.charged_back_at) return { error: 'Only a paid top-up can be refunded.', status: 400 };
    if (!(cents >= 1) || cents > max) return { error: `You can refund up to ${(max / 100).toFixed(2)} USD of this top-up (unused money paid in).`, status: 400, max_cents: max };
    const n = Q(`SELECT COUNT(*) n FROM ledger WHERE ref LIKE ?`).get(`refund:dep:${d.id}:%`).n + 1;
    addLedger(d.user_id, 'refund', -cents, `refund:dep:${d.id}:${n}`, `Refund of top-up #${d.id}`);
    Q(`UPDATE deposits SET refunded_cents=COALESCE(refunded_cents,0)+? WHERE id=?`).run(cents, d.id);
    const vu = vooUser(d.user_id);
    if (vooEventsOn() && vu && vu.voo_id) voo.track((k) => k.events.refund({ eventId: k.events.id('rf', d.id, n), vooId: vu.voo_id, valueUsd: cents / 100, originalEventId: k.events.id('topup', d.id), label: 'Unused wallet money returned' }));
    audit(req, null, 'deposits.refund', 'deposit:' + d.id, { cents });
    return { ok: true, refunded_cents: cents };
  });
}
/** Admin: a card dispute charged this top-up back. The wallet loses it (it can go below zero) and commission on what it paid for is reversed. */
function chargebackDeposit(d, req) {
  return tx(() => {
    d = Q(`SELECT * FROM deposits WHERE id=?`).get(d.id) || d; // the row as it is now (a refund or a chargeback may have just been recorded)
    if (d.status !== 'paid' || d.charged_back_at) return { error: 'Only a paid top-up can be charged back, once.', status: 400 };
    const cents = d.amount_cents - (d.refunded_cents || 0);
    const paidBefore = refPaidIn(d.user_id);
    if (cents > 0) addLedger(d.user_id, 'chargeback', -cents, `cb:dep:${d.id}`, `Chargeback of top-up #${d.id}`);
    Q(`UPDATE deposits SET charged_back_at=? WHERE id=?`).run(now(), d.id);
    const reversed = vooEventsOn() ? vooClawback(d.user_id, d.id) : 0;
    const refReversed = refClawback(d.user_id, d.id, paidBefore);
    audit(req, null, 'deposits.chargeback', 'deposit:' + d.id, { cents, reversed, ref_reversed: refReversed });
    return { ok: true, charged_back_cents: cents, commission_base_reversed_cents: reversed, referral_commission_reversed_cents: refReversed };
  });
}
/** Real money a customer paid in (top-ups minus refunds and chargebacks) and what they used from the wallet (plan, joins, FTD fees, Joe), as payCommission counts it. */
const refPaidIn = (uid) => Q(`SELECT COALESCE(SUM(amount_cents),0) n FROM ledger WHERE user_id=? AND kind IN ('deposit','refund','chargeback')`).get(uid).n;
const refSpent = (uid) => -Q(`SELECT COALESCE(SUM(amount_cents),0) n FROM ledger WHERE user_id=? AND kind IN ('plan','joins','ftds','joe')`).get(uid).n;
/** Joinvoo's own referral program after a chargeback (referral terms §6): the referrer loses the commission earned on the spending that
 * the charged-back money paid for. Written as one negative ref_earnings row (never more than they earned from this customer). */
function refClawback(uid, depId, paidBefore) {
  const u = Q(`SELECT referred_by FROM users WHERE id=?`).get(uid); if (!u || !u.referred_by) return 0;
  const spent = refSpent(uid), lost = Math.max(0, Math.min(spent, Math.max(0, paidBefore)) - Math.min(spent, Math.max(0, refPaidIn(uid))));
  if (!lost) return 0;
  const e = Q(`SELECT COALESCE(SUM(CASE WHEN amount_cents>0 THEN base_cents END),0) base, COALESCE(SUM(CASE WHEN amount_cents>0 THEN amount_cents END),0) pos, COALESCE(SUM(amount_cents),0) net FROM ref_earnings WHERE referrer_id=? AND from_user=?`).get(u.referred_by, uid);
  if (!(e.base > 0) || !(e.net > 0)) return 0;
  const take = Math.min(e.net, Math.round(lost * e.pos / e.base));
  if (take <= 0) return 0;
  Q(`INSERT INTO ref_earnings(referrer_id,from_user,ref,base_cents,amount_cents,rate,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(ref) DO NOTHING`)
    .run(u.referred_by, uid, `refcb:dep:${depId}`, -lost, -take, e.pos / e.base, Date.now());
  log('referral commission reversed', u.referred_by, 'from user', uid, take);
  return take;
}
const srcLabel = (ch) => (ch ? (ch.title || (ch.username ? '@' + ch.username : 'your link')).slice(0, 60) : 'your link');
async function vooFlush() { try { await voo.flush(); } catch (e) { log('voo flush', e.message); } }
function vooOutboxStats() {
  const s = voo.stats(), legacy = cnt(`SELECT COUNT(*) FROM voo_outbox WHERE sent_at IS NULL AND COALESCE(failed,0)=0`);
  return { ...s, legacy_pending: legacy };
}
/** One-time: events queued by the pre-kit outbox go into the kit's queue (those the kit refuses, e.g. without a Voo ID, are dropped). */
(function vooMigrateOutbox() {
  try {
    const rows = Q(`SELECT id, body FROM voo_outbox WHERE sent_at IS NULL AND COALESCE(failed,0)=0`).all();
    if (!rows.length) return;
    let moved = 0;
    for (const r of rows) {
      let b; try { b = JSON.parse(r.body); } catch { b = null; }
      if (b && b.voo_id && voo.kit()) { const ev = { event_id: b.event_id, voo_id: b.voo_id, type: b.type === 'spend' && b.kind === 'topup' ? 'wallet_topup' : b.type, label: b.label, occurred_at: b.occurred_at, ...(b.value_usd ? { value_usd: b.value_usd } : {}) };
        if (voo.track((k) => k.events.track(ev))) moved++; }
      Q(`UPDATE voo_outbox SET failed=1, last_error=? WHERE id=?`).run('moved to the Voo Connect outbox', r.id);
    }
    log('voo: moved', moved, 'of', rows.length, 'queued events to the Voo Connect outbox');
  } catch (e) { log('voo outbox migration', e.message); }
})();
/** One-time for members linked before this version: only money spent from now on is reported. */
for (const u of Q(`SELECT id FROM users WHERE voo_id IS NOT NULL AND voo_linked_at IS NULL`).all()) Q(`UPDATE users SET voo_linked_at=?, voo_spent_cents=? WHERE id=?`).run(now(), vooFunded(u.id), u.id);

const seenUpdates = new Map();
// ---------- router ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, BASE_URL);
    const p = url.pathname;
    let mm;
    if (p === '/health') return send(res, 200, { ok: true });
    if ((p === '/auth/voosquare' || p === '/auth/voosquare/callback') && req.method === 'GET' && limited('voo:' + clientIp(req), 120, 600)) // each callback costs a call to VooSquare
      return send(res, 302, '', { location: '/login?voo_error=unavailable', 'cache-control': 'no-store' });
    if (p === '/auth/voosquare' && req.method === 'GET') return await vooStart(req, res, url);
    if (p === '/auth/voosquare/callback' && req.method === 'GET') return await vooCallback(req, res);
    if (p === '/logout' && req.method === 'GET') { // plain-link logout; VooSquare members are logged out of VooSquare too ("log out everywhere")
      const t = cookies(req).jp_session, sess = t ? Q(`SELECT via FROM sessions WHERE token=?`).get(t) : null;
      if (t) Q(`DELETE FROM sessions WHERE token=?`).run(t);
      return send(res, 302, '', { location: vooLogoutUrl(sess) || '/login', 'set-cookie': cookie('jp_session', '', 0) });
    }
    if (p === '/hooks/voosquare/support' && req.method === 'POST') { // VooSquare's support-reply webhook (Bearer API key, checked by the kit)
      const k = vooEventsOn() ? voo.kit() : null;
      if (!k) return send(res, 404, { error: 'VooSquare is not connected.' });
      return k.supportWebhook(async (b) => { const r = vooSupportReply(b); if (r.error && r.status !== 404) throw new Error(r.error); })(req, res);
    }
    if (p === '/voo-connect-browser.js' && (req.method === 'GET' || req.method === 'HEAD')) return sendStatic(req, res, path.join(__dirname, 'voo-connect', 'voo-connect-browser.js'), 'application/javascript; charset=utf-8', { maxAge: 3600 });
    if ((p === '/dashboard' || p === '/settings') && req.method === 'GET') return send(res, 302, '', { location: p === '/dashboard' ? '/app' : '/app#help' });
    if (p === '/webhooks/paystack' && req.method === 'POST') {
      const raw = await readBody(req, 512 * 1024).catch(() => '');
      const sig = crypto.createHmac('sha512', C.PAYSTACK_SECRET).update(raw).digest('hex');
      if (!C.PAYSTACK_SECRET || !safeEq(sig, req.headers['x-paystack-signature'])) return send(res, 401, 'bad signature');
      // Same checks as every other gateway: a Paystack deposit, paid in full, in its own currency (a cheap charge in another
      // currency, or a Paystack charge carrying the reference of a Stripe or crypto top-up, must never credit it).
      try { const ev = JSON.parse(raw); if (ev.event === 'charge.success' && ev.data && ev.data.status !== 'failed')
        gatewayPaid(ev.data.reference, { amount: ev.data.amount, currency: ev.data.currency, txid: String(ev.data.id), provider: 'paystack' }); } catch (e) { log('paystack webhook', e.message); }
      return send(res, 200, 'ok');
    }
    if ((mm = /^\/webhooks\/(paystack|stripe)\/([\w-]{2,40})$/.exec(p)) && req.method === 'POST') {
      const raw = await readBody(req, 512 * 1024).catch(() => '');
      const meth = Q(`SELECT * FROM pay_methods WHERE id=? AND type=?`).get(mm[2], mm[1]);
      if (!meth) return send(res, 404, 'unknown method');
      if (mm[1] === 'paystack') {
        const key = pmSecret(meth), sig = key ? crypto.createHmac('sha512', key).update(raw).digest('hex') : '';
        if (!key || !safeEq(sig, req.headers['x-paystack-signature'])) return send(res, 401, 'bad signature');
        try { const ev = JSON.parse(raw); if (ev.event === 'charge.success' && ev.data && ev.data.status !== 'failed')
          gatewayPaid(ev.data.reference, { amount: ev.data.amount, currency: ev.data.currency, txid: String(ev.data.id), provider: 'paystack', methodId: meth.id }); } catch (e) { log('paystack webhook', e.message); }
      } else {
        if (!stripeSigOk(req.headers['stripe-signature'], raw, pmConfig(meth).webhook_secret)) return send(res, 400, 'bad signature');
        try { const ev = JSON.parse(raw), o = (ev.data || {}).object || {};
          if ((ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') && o.payment_status === 'paid')
            gatewayPaid(o.client_reference_id || (o.metadata || {}).reference, { amount: o.amount_total, currency: o.currency, txid: String(o.payment_intent || o.id), provider: 'stripe', methodId: meth.id });
        } catch (e) { log('stripe webhook', e.message); }
      }
      return send(res, 200, 'ok');
    }
    if ((mm = /^\/webhooks\/(gatevoo|custom)\/([\w-]{2,40})$/.exec(p)) && req.method === 'POST') {
      const raw = await readBody(req, 512 * 1024).catch(() => '');
      const meth = Q(`SELECT * FROM pay_methods WHERE id=? AND type=?`).get(mm[2], mm[1]);
      if (!meth) return send(res, 404, 'unknown method');
      const secret = pmConfig(meth).webhook_secret;
      let ev; try { ev = JSON.parse(raw); } catch { return send(res, 400, 'bad json'); }
      if (!ev || typeof ev !== 'object') return send(res, 400, 'bad json');
      if (mm[1] === 'gatevoo') {
        if (!gatevooSigOk(req, raw, secret)) return send(res, 401, 'bad signature');
        const data = (ev && ev.data) || {}, type = String((ev && ev.type) || req.headers['x-gatevoo-event'] || '');
        if (type === 'ping' || type === 'test' || /test/.test(type)) return send(res, 200, { ok: true });
        if (type !== 'invoice.paid' && data.status !== 'paid') return send(res, 200, { ok: true, ignored: true });
        const ref = data.order_id || data.reference || (data.metadata && data.metadata.reference);
        const d = ref && Q(`SELECT * FROM deposits WHERE reference=? AND provider='gatevoo'`).get(String(ref));
        if (!d) return send(res, 200, { ok: true, unknown: true });
        try { await gatevooConfirm(meth, d, data.id || d.gateway_ref); } catch (e) { log('gatevoo confirm', e.message); return send(res, 502, 'try again'); }
        return send(res, 200, { ok: true });
      }
      if (!customSigOk(req, raw, secret)) return send(res, 401, 'bad signature');
      const st = String(ev.status || ev.event || '').toLowerCase();
      if (!['paid', 'success', 'successful', 'completed', 'succeeded', 'payment.paid'].includes(st)) return send(res, 200, { ok: true, ignored: true });
      const d = Q(`SELECT * FROM deposits WHERE reference=? AND provider='custom'`).get(String(ev.reference || ''));
      if (!d) return send(res, 200, { ok: true, unknown: true });
      const major = Number(String(ev.amount ?? '').replace(',', '.')), unit = ZERO_DECIMAL.has(String(ev.currency || d.currency).toUpperCase()) ? Math.round(major) : Math.round(major * 100);
      gatewayPaid(d.reference, { amount: unit, currency: ev.currency || d.currency, txid: String(ev.txid || ev.transaction_id || ev.id || '').slice(0, 200) || null, provider: 'custom', methodId: meth.id });
      return send(res, 200, { ok: true });
    }
    if (p === '/webhooks/flutterwave' && req.method === 'POST') {
      const raw = await readBody(req, 512 * 1024).catch(() => '');
      if (!C.FLW_WEBHOOK_HASH || !safeEq(req.headers['verif-hash'], C.FLW_WEBHOOK_HASH)) return send(res, 401, 'bad signature');
      try { const ev = JSON.parse(raw); const ref = ev.data && ev.data.tx_ref; const d = ref && Q(`SELECT * FROM deposits WHERE reference=?`).get(ref);
        if (d) await verifyDeposit({ id: d.user_id }, ref); } catch (e) { log('flutterwave webhook', e.message); }
      return send(res, 200, 'ok');
    }
    if (p === '/verify') {
      const [uid, exp, sig] = String(url.searchParams.get('t') || '').split('.');
      if (!uid || !exp || sig !== hmac('verify:' + uid + ':' + exp) || +exp < now()) return send(res, 302, '', { location: '/app?verified=expired' });
      const u = Q(`SELECT id, verified_at FROM users WHERE id=?`).get(+uid);
      if (u && !u.verified_at) { Q(`UPDATE users SET verified_at=? WHERE id=?`).run(now(), u.id); grantWelcome(u.id); staffBust(); log('email verified', u.id); }
      return send(res, 302, '', { location: '/app?verified=1' });
    }
    if ((mm = /^\/pb\/([A-Za-z0-9_-]{8,40})$/.exec(p))) return await onPostback(req, res, mm[1]);
    if (p === '/tg-alert' && req.method === 'POST') {
      const raw = await readBody(req, 64 * 1024).catch(() => '');
      if (!ALERT_BOT_TOKEN || !safeEq(req.headers['x-telegram-bot-api-secret-token'], hmac('alertbot'))) return send(res, 401, 'no');
      try { onAlertUpdate(JSON.parse(raw)); } catch (e) { log('alert update error', e.message); }
      return send(res, 200, 'ok');
    }
    if ((mm = /^\/hook\/([A-Za-z0-9_-]{8,40})\/(start|blocked)$/.exec(p))) return await onBotHook(req, res, mm[1], mm[2]);
    if ((mm = /^\/r\/([a-z0-9]{4,12})$/i.exec(p))) {
      if (!feature('referrals')) return send(res, 302, '', { location: '/' });
      return send(res, 302, '', { location: '/', 'set-cookie': cookie('joinvoo_ref', mm[1].toLowerCase(), 30 * 86400) });
    }
    if ((mm = /^\/tg\/(\d+)$/.exec(p)) && req.method === 'POST') {
      const bot = Q(`SELECT * FROM bots WHERE id=? AND status='active'`).get(+mm[1]);
      const body = await readBody(req, 256 * 1024).catch(() => '');
      if (!bot || !safeEq(req.headers['x-telegram-bot-api-secret-token'], bot.secret)) return send(res, 401, 'no');
      try {
        const u = JSON.parse(body); const key = bot.id + ':' + u.update_id;
        if (seenUpdates.has(key)) return send(res, 200, 'ok'); // Telegram re-sent it; we already handled it
        seenUpdates.set(key, now()); if (seenUpdates.size > 50000) for (const k of [...seenUpdates.keys()].slice(0, 10000)) seenUpdates.delete(k);
        await onUpdate(bot, u);
      } catch (e) { log('update error', e.message); }
      return send(res, 200, 'ok');
    }
    { const host = String(req.headers.host || '').toLowerCase();
      if (host && host !== new URL(BASE_URL).host && linkHosts().includes(host)) {
        if (p === '/robots.txt') return send(res, 200, 'User-agent: *\nDisallow: /\n', { 'content-type': 'text/plain' });
        if (p !== '/health' && !/^\/c\/[\w-]+(\/go)?$/.test(p)) return send(res, 302, '', { location: BASE_URL + (p === '/' ? '/' : p) + (url.search || '') });
      } }
    if ((mm = /^\/c\/([\w-]+)(\/go)?$/.exec(p))) {
      let ch = Q(`SELECT * FROM channels WHERE slug=?`).get(mm[1]);
      if (!ch) return send(res, 404, 'Link not found', { 'content-type': 'text/plain' });
      // Smart link: this link's visitors go into the backup channel (its invite links, its pixel settings, joins counted there).
      if (ch.redirect_to) { const tgt = Q(`SELECT * FROM channels WHERE id=? AND owner_id=? AND status<>'removed'`).get(ch.redirect_to, ch.owner_id); if (tgt) ch = tgt; }
      if (mm[2] && req.method === 'POST') return await onClick(req, res, ch);
      return send(res, 200, clickPage(ch), { 'content-type': 'text/html; charset=utf-8', 'set-cookie': `jv_h=1; Path=/c/; Max-Age=3600; SameSite=Lax${SECURE ? '; Secure' : ''}` });
    }
    if (p.startsWith('/api/')) {
      // Block cross-site form posts to the API (login CSRF and friends).
      if (req.method !== 'GET' && req.headers.origin) { try { if (new URL(req.headers.origin).host !== req.headers.host) return send(res, 403, { error: 'Cross-site request blocked.' }); } catch { return send(res, 403, { error: 'Bad origin.' }); } }
      return await api(req, res, url, currentUser(req));
    }
    if (req.method === 'GET' && /[?&](ref|vclick|coupon)=/.test(url.search)) { // VooSquare affiliate click (ref, vclick, coupon): kept in the voo_attr cookie for the login hand-off
      const k = voo.kit(); if (k && k.affiliate) { k.captureAttribution()(req, res); if (res.getHeader('set-cookie')) res._noStore = true; }
    }
    if ((mm = /^\/a\/([A-Za-z0-9_-]{2,40})$/.exec(p))) { // short affiliate link: joinvoo.com/a/CODE
      const ac = affCapture(req, new URL(BASE_URL + '/?aff=' + encodeURIComponent(mm[1]) + (url.searchParams.get('sub1') ? '&sub1=' + encodeURIComponent(url.searchParams.get('sub1')) : '')));
      return send(res, 302, '', { location: '/', ...(ac ? { 'set-cookie': ac } : {}) });
    }
    if (req.method === 'GET' && url.search && /[?&](aff|voo_aff)=/.test(url.search)) { // remember the affiliate, then show the clean address (never cached with a cookie)
      const ac = affCapture(req, url), clean = new URL(url.href); for (const k of ['aff', 'voo_aff', 'sub1', 'sub']) clean.searchParams.delete(k);
      return send(res, 302, '', { location: '/' + clean.pathname.replace(/^[\/\\]+/, '') + (clean.search || '') + (clean.hash || ''), 'cache-control': 'no-store', ...(ac ? { 'set-cookie': ac } : {}) });
    }
    if (p === '/') return send(res, 200, page('home.html'), { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' });
    if (p === '/login') return send(res, 200, page('login.html'), { 'content-type': 'text/html; charset=utf-8' });
    if (p === '/signup') return send(res, 200, page('signup.html'), { 'content-type': 'text/html; charset=utf-8' });
    if (p === '/app') return send(res, 200, page('app.html'), { 'content-type': 'text/html; charset=utf-8' });
    if (p === '/admin') return send(res, 200, page('admin.html'), { 'content-type': 'text/html; charset=utf-8' });
    if ((mm = /^\/(guide|terms|privacy|refunds|acceptable-use|cookies|referral-terms|affiliates)$/.exec(p))) return send(res, 200, page(mm[1] + '.html'), { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' });
    if ((mm = /^\/media\/logos\/([\w-]+\.(png|jpg|webp))$/.exec(p))) { // affiliate program logos uploaded in /admin
      const f = [path.join(LOGO_DIR, mm[1]), path.join(PUBLIC, 'media', 'logos', mm[1])].find((x) => fs.existsSync(x));
      if (!f) return send(res, 404, 'Not found', { 'content-type': 'text/plain' });
      res.writeHead(200, { 'content-type': { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[mm[2]], 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' });
      return fs.createReadStream(f).pipe(res);
    }
    if ((mm = /^\/media\/team\/([\w-]+\.(png|jpg|webp))$/.exec(p))) { // support team photos: uploaded ones in DATA_DIR, bundled defaults in public/media/team
      const f = [path.join(TEAM_DIR, mm[1]), path.join(PUBLIC, 'media', 'team', mm[1])].find((x) => fs.existsSync(x));
      if (!f) return send(res, 404, 'Not found', { 'content-type': 'text/plain' });
      res.writeHead(200, { 'content-type': { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }[mm[2]], 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' });
      return fs.createReadStream(f).pipe(res);
    }
    // Shared avatar renderer + translations: cached for a day, then revalidated with the ETag (a ?v= URL is cached for a year).
    if (p === '/joomoji.js') return sendStatic(req, res, path.join(PUBLIC, 'joomoji.js'), 'application/javascript; charset=utf-8', { long: true, versioned: url.searchParams.has('v') });
    if ((mm = /^\/i18n\/([\w-]+\.(?:en|ru|fr|pt|es)\.json)$/.exec(p))) return sendStatic(req, res, path.join(PUBLIC, 'i18n', mm[1]), 'application/json; charset=utf-8', { long: true, versioned: url.searchParams.has('v') });
    if ((mm = /^\/media\/broadcast\/([\w-]+\.(png|jpg|jpeg|webp|gif))$/.exec(p))) { // broadcast images: uploads live with the database, bundled ones in public/
      const f = [path.join(BC_DIR, mm[1]), path.join(PUBLIC, 'media', 'broadcast', mm[1])].find((x) => fs.existsSync(x)) || path.join(BC_DIR, mm[1]);
      return sendStatic(req, res, f, MEDIA_TYPES[mm[2]], { maxAge: 30 * 86400 });
    }
    if ((mm = /^\/media\/applogos\/([\w-]+\.(png|jpg|webp|svg))$/.exec(p))) { // Zedapex app logos: uploads in DATA_DIR, built-in marks in public/
      const f = (mm[2] !== 'svg' && [path.join(APPLOGO_DIR, mm[1])].find((x) => fs.existsSync(x))) || path.join(PUBLIC, 'media', 'applogos', mm[1]);
      return sendStatic(req, res, f, MEDIA_TYPES[mm[2]], { maxAge: 7 * 86400 });
    }
    if ((mm = /^\/media\/paylogos\/([\w-]+\.(png|jpg|webp|svg))$/.exec(p))) { // payment-method logos: uploads in DATA_DIR (png/jpg/webp), built-in badges in public/
      const f = (mm[2] !== 'svg' && [path.join(PAYLOGO_DIR, mm[1])].find((x) => fs.existsSync(x))) || path.join(PUBLIC, 'media', 'paylogos', mm[1]);
      return sendStatic(req, res, f, MEDIA_TYPES[mm[2]], { maxAge: 7 * 86400 });
    }
    if ((mm = /^\/media\/(email|blog)\/([\w-]+\.(png|gif|jpg|jpeg|webp|avif|svg))$/.exec(p))) { // email header art and blog covers
      return sendStatic(req, res, path.join(PUBLIC, 'media', mm[1], mm[2]), MEDIA_TYPES[mm[3]], { maxAge: 30 * 86400 });
    }
    // Blog (static pages generated by build/build.py). {{BASE_URL}} is filled in here so the files work on any domain.
    if (p === '/blog' || p === '/blog/') return blogPage(req, res, 'index.html');
    if ((mm = /^\/blog\/tag\/([\w-]{1,60})\/?$/.exec(p))) return blogPage(req, res, `tag-${mm[1].toLowerCase()}.html`);
    if ((mm = /^\/blog\/([a-z0-9][a-z0-9-]{0,119})\/?$/i.exec(p))) return blogPage(req, res, `${mm[1].toLowerCase()}.html`);
    if (p === '/sitemap.xml' || p === '/rss.xml') return sendStatic(req, res, path.join(PUBLIC, p.slice(1)), p === '/rss.xml' ? 'application/rss+xml; charset=utf-8' : 'application/xml; charset=utf-8', { maxAge: 3600, fill: true });
    if ((mm = /^\/media\/([\w.-]+\.(mp4|webm|jpg|jpeg|png|webp|vtt))$/.exec(p))) {
      const f = path.join(PUBLIC, 'media', mm[1]);
      if (!fs.existsSync(f)) return send(res, 404, 'Not found', { 'content-type': 'text/plain' });
      const type = { mp4: 'video/mp4', webm: 'video/webm', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', vtt: 'text/vtt' }[mm[2]];
      const size = fs.statSync(f).size, range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (range) { // videos need range requests to seek on phones
        const start = range[1] ? +range[1] : 0, end = range[2] ? Math.min(+range[2], size - 1) : size - 1;
        if (start >= size || start > end) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
        res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1, 'cache-control': 'public, max-age=86400' });
        return fs.createReadStream(f, { start, end }).pipe(res);
      }
      res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=86400' });
      return fs.createReadStream(f).pipe(res);
    }
    if (p === '/robots.txt') return send(res, 200, `User-agent: *\nAllow: /blog\nDisallow: /c/\nDisallow: /app\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${BASE_URL}/sitemap.xml\n`, { 'content-type': 'text/plain' });
    if (p === '/demo') return send(res, 200, page('app.html', '<script>window.JP_DEMO=true</script>'), { 'content-type': 'text/html; charset=utf-8' });
    send(res, 404, 'Not found', { 'content-type': 'text/plain' });
  } catch (e) {
    log('server error', e.stack || e.message);
    if (!res.headersSent) send(res, 500, { error: 'Something went wrong on our side.' });
  }
});

// ---------- background jobs ----------
setInterval(fillPools, 400);
setInterval(sendCapi, 2000);
setInterval(vooFlush, Math.max(200, +env.VOO_OUTBOX_MS || 5000)).unref(); // VooSquare events (no-op until VooSquare is connected)
setInterval(() => { try { vooUseJob(); } catch (e) { log('voo use job', e.message); } }, Math.max(1000, +env.VOO_USE_JOB_MS || 3600000)).unref(); setTimeout(() => { try { vooUseJob(); } catch (e) { log('voo use job', e.message); } }, 20000).unref();
setInterval(() => { // links handed out but not used are retired, never re-used, so a late joiner is still credited to the right click
  Q(`UPDATE links SET status='expired' WHERE status='assigned' AND assigned_at<?`).run(now() - RECYCLE_MIN * 60000);
  Q(`DELETE FROM links WHERE status IN ('expired','dead') AND created_at<?`).run(now() - 30 * 864e5);
}, 60000);
setInterval(() => { // housekeeping
  Q(`DELETE FROM clicks WHERE joined=0 AND ts<?`).run(now() - CLICK_RETENTION_DAYS * 864e5);
  Q(`DELETE FROM sessions WHERE expires_at<?`).run(now());
  Q(`DELETE FROM capi_queue WHERE status='sent' AND created_at<?`).run(now() - 7 * 864e5);
  Q(`DELETE FROM hits WHERE reset_at<?`).run(now());
  Q(`DELETE FROM resets WHERE expires_at<?`).run(now());
  Q(`DELETE FROM deposits WHERE status='awaiting' AND created_at<?`).run(now() - 3 * 864e5);
  Q(`DELETE FROM email_log WHERE sent_at<?`).run(now() - 365 * 864e5);
}, 6 * 3600000);
// Optional weekly summary (Settings → Emails). Mondays from 09:00 UTC, to accounts that had ad clicks in the last 7 days.
function weeklySummaries() {
  const d = new Date();
  if (!setting('email.weekly_summary') || d.getUTCDay() !== 1 || d.getUTCHours() < 9) return;
  const to = now(), from = to - 7 * 864e5, h0 = Math.floor(from / 3600000);
  for (const r of Q(`SELECT owner_id, SUM(clicks) clicks, SUM(joins) joins FROM hourly WHERE hour>=? GROUP BY owner_id HAVING SUM(clicks)>0`).all(h0)) {
    const c = Q(`SELECT COALESCE(SUM(event='ftd'),0) ftd, COALESCE(SUM(CASE WHEN event IN ('ftd','dep') THEN value_cents END),0) rev FROM conversions WHERE owner_id=? AND matched=1 AND created_at>=?`).get(r.owner_id, from);
    const u = Q(`SELECT balance_cents FROM users WHERE id=?`).get(r.owner_id) || {};
    notifyUser(r.owner_id, 'weekly_summary', { clicks: r.clicks, joins: r.joins, ftd: c.ftd, revenue_cents: c.rev, balance_cents: u.balance_cents || 0, from, to }, { every: 6 * 864e5 });
  }
}
setInterval(weeklySummaries, 3600000).unref();
/** Every 10 minutes: start/close Pro trials and send their emails once. */
function trialJobs() {
  for (const u of Q(`SELECT id FROM users WHERE status='active' AND trial_blocked=0 AND ((trial_started_at IS NOT NULL AND trial_ended_at IS NULL) OR (trial_started_at IS NULL AND ?))`).all(setting('trial.starts') === 'signup' ? 1 : 0)) checkTrial(u.id);
}
/** Every 10 minutes: "Meet Joe" about an hour after sign-up (with email off, it goes out at the first login instead). */
function meetJoeJobs() {
  if (!feature('joe') || !resendKey()) return;
  for (const u of Q(`SELECT id FROM users WHERE status='active' AND created_at<? AND created_at>?`).all(now() - 3600000, now() - 3 * 864e5)) notifyUser(u.id, 'meet_joe', {}, { once: true });
}
setInterval(trialJobs, 10 * 60000).unref(); setInterval(meetJoeJobs, 10 * 60000).unref();
setInterval(levelJobs, 3600000).unref(); setTimeout(levelJobs, 60000).unref();
setInterval(inboxDailyJobs, 3600000).unref(); setInterval(blogJobs, 3600000).unref(); setTimeout(() => { try { blogJobs(); } catch (e) { log('blog job', e.message); } }, 5000).unref();
setInterval(checkBots, 10 * 60000); setTimeout(checkBots, 30000);
// Daily safety copy of the database into DATA_DIR/backups (keeps 7). Download one any time from /admin → Health.
function backupNow() {
  try {
    const dir = path.join(DATA_DIR, 'backups'); fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, `joinvoo-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`);
    db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
    const files = fs.readdirSync(dir).filter((f) => /^joinvoo-.*\.db$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 7))) fs.unlinkSync(path.join(dir, f));
    log('backup written', path.basename(out));
    return out;
  } catch (e) { log('backup failed', e.message); return null; }
}
setInterval(backupNow, 24 * 3600000);
function shutdown() { log('shutting down'); server.close(); const k = vooEventsOn() ? voo.kit() : null; // send queued VooSquare events first (they also survive in the database)
  Promise.resolve(k ? k.events.drain({ timeoutMs: 1200 }).catch(() => {}) : null).finally(() => setTimeout(() => { try { db.close(); } catch {} process.exit(0); }, 300)); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
process.on('unhandledRejection', (e) => log('unhandled', e && (e.stack || e.message || e)));
process.on('uncaughtException', (e) => log('uncaught', e && (e.stack || e.message || e)));
// `node server.js --export-emails out.json` renders every email with sample data (used by build/build.py for the static demo).
if (process.argv[2] === '--export-emails') {
  if (!setting('support.team').length) setSetting('support.team', [{ name: 'Maya', role: 'Customer success' }]);
  const out = {}; for (const [n, t] of Object.entries(EMAILS)) out[n] = renderTemplate(n, t.sample());
  fs.writeFileSync(process.argv[3] || 'emails.json', JSON.stringify(out)); process.exit(0);
}
if (!BASE_URL.startsWith('https://')) log('WARNING: BASE_URL is not https. Telegram will refuse to send updates until it is.');
if (!ADMIN_EMAILS.length) log('NOTE: set ADMIN_EMAILS=you@example.com to use the admin panel at /admin');

server.listen(PORT, () => {
  log(`Joinvoo running on ${BASE_URL} (port ${PORT})`);
  // Once after upgrading: re-register every bot's webhook so Telegram also sends chat_join_request updates.
  if (+setting('tg.updates_v', 0) < 2) setTimeout(async () => {
    for (const b of Q(`SELECT * FROM bots WHERE status='active'`).all()) await tg(b.token, 'setWebhook', { url: `${BASE_URL}/tg/${b.id}`, secret_token: b.secret, max_connections: 40, allowed_updates: TG_UPDATES });
    Q(`INSERT OR REPLACE INTO settings(key,value,updated_at) VALUES('tg.updates_v','2',?)`).run(now()); settingsCache = null; log('webhooks updated for join requests');
  }, 2000);
  if (ALERT_BOT_TOKEN) setupAlertBot();
});
