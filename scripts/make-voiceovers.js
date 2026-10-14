#!/usr/bin/env node
/* Joinvoo tutorial voice-overs in every language (round 23b).
 *
 * Reads the translated scripts in public/i18n/tut.<lang>.json and makes one MP3 per tutorial with ElevenLabs:
 *   public/media/tutorials/<lang>/<id>.mp3
 * It also writes the exact time each sentence starts ("marks") back into tut.<lang>.json, so the animation
 * changes screen exactly when the voice starts the next sentence.
 *
 * Usage (from the project folder, Node 18+):
 *   ELEVENLABS_API_KEY=sk_... node scripts/make-voiceovers.js            # shows what it will make and the credit cost, makes nothing
 *   ELEVENLABS_API_KEY=sk_... node scripts/make-voiceovers.js --yes      # makes every missing file (all languages)
 *   ELEVENLABS_API_KEY=sk_... node scripts/make-voiceovers.js --yes es pt ru      # only these languages
 *   ... --yes --only t1 es        # one tutorial (good for a first listen)
 *   ... --force                   # remake files that already exist (e.g. after a script change)
 * Then: sh src/dashboard/make.sh   (copies the files into dist/ too) and deploy.
 *
 * Cost: about 1 ElevenLabs credit per character (~7,500 per language, ~75,000 for all 10). Files that already exist are skipped.
 * Voices: scripts/voiceovers.voices.json (male voice for t1–t10, female for t11–t14, like the English ones).
 * A voice from the ElevenLabs Voice Library is added to your account automatically the first time.
 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), I18N = path.join(ROOT, 'public/i18n'), OUT = path.join(ROOT, 'public/media/tutorials');
const KEY = process.env.ELEVENLABS_API_KEY || '';
const args = process.argv.slice(2), YES = args.includes('--yes'), FORCE = args.includes('--force');
const onlyIx = args.indexOf('--only'), ONLY = onlyIx >= 0 ? args[onlyIx + 1] : null;
const LANGS = ['es', 'pt', 'ru', 'fr', 'ar', 'hi', 'id', 'tr', 'vi', 'sw'];
const want = args.filter((a, i) => LANGS.includes(a) && args[i - 1] !== '--only');
const langs = want.length ? want : LANGS;
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'voiceovers.voices.json'), 'utf8'));
const FEMALE = new Set(['t11', 't12', 't13', 't14']);
const API = process.env.ELEVENLABS_BASE || 'https://api.elevenlabs.io'; // ELEVENLABS_BASE: tests only
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, p, body) {
  for (let tryN = 0; ; tryN++) {
    const r = await fetch(API + p, { method, headers: { 'xi-api-key': KEY, 'content-type': 'application/json', accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if ((r.status === 429 || r.status >= 500) && tryN < 4) { await sleep(3000 * (tryN + 1)); continue; }
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
    if (!r.ok) { const e = new Error(`${r.status} ${(j && j.detail && (j.detail.message || j.detail.status || JSON.stringify(j.detail))) || t.slice(0, 200)}`); e.status = r.status; e.body = j; throw e; }
    return j;
  }
}

/* make sure a voice can be used by this account: own voices work; a Voice Library voice is added once */
const ready = new Map();
async function useVoice(voiceId, lang, gender) {
  if (ready.has(voiceId)) return ready.get(voiceId);
  let id = voiceId;
  try { await api('GET', `/v1/voices/${voiceId}`); }
  catch {
    try {
      const q = new URLSearchParams({ page_size: '100', language: lang });
      const lib = await api('GET', `/v1/shared-voices?${q}`);
      let v = (lib.voices || []).find((x) => x.voice_id === voiceId);
      if (!v) { const lib2 = await api('GET', `/v1/shared-voices?${new URLSearchParams({ page_size: '100', search: voiceId })}`); v = (lib2.voices || []).find((x) => x.voice_id === voiceId); }
      if (!v) throw new Error('not in the Voice Library');
      const added = await api('POST', `/v1/voices/add/${v.public_owner_id}/${voiceId}`, { new_name: `Joinvoo ${lang} ${gender}` });
      id = added.voice_id || voiceId; console.log(`  added "${v.name}" (${lang}, ${gender}) to your ElevenLabs voices`);
    } catch (e) {
      id = CFG._fallback[gender]; console.log(`  ! voice ${voiceId} (${lang} ${gender}) not usable (${e.message}); using the default multilingual ${gender} voice`);
    }
  }
  ready.set(voiceId, id); return id;
}

async function autoPick(lang, gender) {
  try {
    const q = new URLSearchParams({ page_size: '5', language: lang, gender, use_cases: 'informative_educational', sort: 'usage_character_count_1y' });
    const lib = await api('GET', `/v1/shared-voices?${q}`); const v = (lib.voices || [])[0];
    if (v) { console.log(`  picked "${v.name}" for ${lang} ${gender} (change it in scripts/voiceovers.voices.json)`); return v.voice_id; }
  } catch {}
  return CFG._fallback[gender];
}

async function speak(voice, text, model) {
  const body = { text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true } };
  try {
    const j = await api('POST', `/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, body);
    return { audio: Buffer.from(j.audio_base64, 'base64'), al: j.alignment || j.normalized_alignment || null };
  } catch (e) {
    if (e.status !== 400 && e.status !== 422) throw e;
    const r = await fetch(`${API}/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': KEY, 'content-type': 'application/json', accept: 'audio/mpeg' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    return { audio: Buffer.from(await r.arrayBuffer()), al: null };
  }
}

/* sentence start times from the character timings */
function marksOf(sents, al) {
  if (!al || !al.characters || !al.character_start_times_seconds) return null;
  const chars = al.characters.join(''), st = al.character_start_times_seconds; const out = []; let from = 0;
  for (const s of sents) { const head = s.slice(0, Math.min(12, s.length)); let i = chars.indexOf(head, from); if (i < 0) i = chars.indexOf(s.slice(0, 4), from); if (i < 0) return null; out.push(+st[i].toFixed(2)); from = i + 1; }
  out[0] = 0; for (let i = 1; i < out.length; i++) if (!(out[i] > out[i - 1])) return null; return out;
}
const durOf = (al) => al && al.character_end_times_seconds ? +al.character_end_times_seconds[al.character_end_times_seconds.length - 1].toFixed(2) : null;

(async () => {
  const jobs = []; let chars = 0;
  for (const lang of langs) {
    const f = path.join(I18N, `tut.${lang}.json`); if (!fs.existsSync(f)) { console.log(`skip ${lang}: no ${f}`); continue; }
    const T = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const [id, t] of Object.entries(T)) {
      if (ONLY && id !== ONLY) continue;
      const mp3 = path.join(OUT, lang, `${id}.mp3`); if (!FORCE && fs.existsSync(mp3)) continue;
      const text = t.sents.join(' '); chars += text.length; jobs.push({ lang, id, t, text, mp3, f });
    }
  }
  console.log(`${jobs.length} voice-over(s) to make, about ${chars.toLocaleString('en-US')} characters ≈ ${chars.toLocaleString('en-US')} ElevenLabs credits.`);
  if (!jobs.length) return;
  if (!YES) { console.log('Nothing made yet. Run again with --yes to make them.'); return; }
  if (!KEY) { console.error('Set ELEVENLABS_API_KEY first (ElevenLabs → Profile → API keys).'); process.exit(1); }
  let ok = 0, bad = 0;
  for (const j of jobs) {
    const gender = FEMALE.has(j.id) ? 'female' : 'male', L = CFG[j.lang] || {};
    try {
      let vid = L[gender] || null; if (!vid) { vid = await autoPick(j.lang, gender); L[gender] = vid; CFG[j.lang] = L; }
      const voice = await useVoice(vid, j.lang, gender);
      const { audio, al } = await speak(voice, j.text, L.model || 'eleven_multilingual_v2');
      fs.mkdirSync(path.dirname(j.mp3), { recursive: true }); fs.writeFileSync(j.mp3, audio);
      const T = JSON.parse(fs.readFileSync(j.f, 'utf8')); const mk = marksOf(j.t.sents, al);
      if (mk) T[j.id].marks = mk; else delete T[j.id].marks; const d = durOf(al); if (d) T[j.id].dur = d;
      fs.writeFileSync(j.f, JSON.stringify(T, null, 1));
      ok++; console.log(`✓ ${j.lang}/${j.id}.mp3  ${(audio.length / 1024).toFixed(0)} KB${mk ? '' : '  (no sentence timings: screens follow the text length instead)'}`);
    } catch (e) { bad++; console.log(`✗ ${j.lang}/${j.id}: ${e.message}`); }
  }
  console.log(`\nDone: ${ok} made, ${bad} failed. Next: sh src/dashboard/make.sh, then deploy.`);
  if (bad) process.exitCode = 1;
})();
