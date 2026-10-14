# Deploy round 23 — step by step (for Ademola)

About 30 minutes, most of it waiting. Existing customers are not affected: nobody is logged out, balances/links/tracking stay the same. The database only gets new columns/tables (added automatically on start).

## 1. Back up (2 min)
- Railway → the Joinvoo service → Volume (`/data`) → make a backup / download `joinvoo.db`. Keep it until you've checked step 4.

## 2. Deploy (5 min)
- Replace the project files with this zip's `jointrack/` folder (keep your `.env` / Railway variables as they are), commit, push → Railway redeploys.
- No new variables are required. Optional: `ELEVENLABS_API_KEY` (you can paste it in Admin instead, step 3).
- Wait until the deploy is green and `/health` answers.

## 3. In Admin (5 min + waiting)
Admin → Settings → **Integrations & API keys**:
1. **Resend** — paste the email API key if it isn't set (needed for new-device alerts and emails). Save keys.
2. **ElevenLabs** — paste Ejiro's ElevenLabs API key (elevenlabs.io → profile → API keys). Save keys.
3. Scroll to **Tutorial voices** → all 10 languages are ticked → **Make voices** → confirm (≈ 75,000 ElevenLabs credits, about $14; Ejiro has 600k).
   - It makes 140 voices, about 15–20 minutes. You can close the page; come back to see the progress bar and log.
   - Each voice is live for customers as soon as it's made. No redeploy. They're saved on the volume, so future deploys keep them.
   - If something fails, press **Make voices** again: it only makes what's missing.

Admin → Settings → **Features**: check `Login alerts` and `Support translation` are On (they are by default).

## 4. Check (5 min)
- Open the dashboard in a private window with the browser/phone language set to Spanish (or add `?lang=es` to the URL): everything is in Spanish.
- More → Tutorials → play "Create your tracking bot": Spanish voice, Spanish captions, screens move with the voice.
- My profile → **Where you're logged in** shows your devices.
- Admin → Overview / Analytics / Countries load.
- Log in from a new browser: you get the "New login" email (needs the Resend key).

## Later: updating the tutorial voices
See `docs/TUTORIAL-VOICES.md`. Short version: if a tutorial's text changes, Admin → Tutorial voices shows "needs a new voice" → press **Make voices** (only changed ones are remade). To change a voice: edit `scripts/voiceovers.voices.json`, deploy, tick **Remake all**, press **Make voices**.

## If something goes wrong
- Roll back = redeploy round 22. The new columns are simply ignored by it. Restore the backup only if data looks wrong.
- Tests (optional, on your Mac): `bash tests/runall.sh` → 2,136 ok; the one known fail (`e2e-audit`, "referrer earns on the $50…") is a date check that fails mid-month and is not a bug.
- Full change list: `UPGRADE.md` → Round 23.
