# Tutorial voices — how to make and update them (for Ademola)

The 14 dashboard tutorials can speak in all 10 non-English languages. Customers hear the voice in their language; if a voice isn't made yet they hear the English one with captions in their language (nothing breaks).

## Make them (2 minutes of your time)
1. Admin → Settings → **Integrations & API keys** → **ElevenLabs**: paste the ElevenLabs API key (elevenlabs.io → profile → API keys) → **Save keys**. Done once.
2. Same page, card **Tutorial voices**: tick the languages (missing ones are ticked for you) → **Make voices** → confirm the credit estimate.
3. Leave it. It makes about one voice every 5–10 seconds (all 140 ≈ 15–20 minutes). You can close the page and come back; the card shows progress and a log.
Voices go live for customers immediately. **No deploy needed.** They are stored on the data volume (`/data/voiceovers/<lang>/`), so redeploys keep them.

## Update them
- **A tutorial's text changed** (in `public/i18n/tut.<lang>.json`, after a deploy): the card shows "1 needs a new voice" for that language. Press **Make voices**: only the changed ones are remade.
- **Want a different voice**: change the voice id in `scripts/voiceovers.voices.json` (male = tutorials 1–10, female = 11–14), deploy, then tick **Remake all (new voice)** for that language and press **Make voices**.
- **A new language later**: add `public/i18n/tut.<lang>.json` (same sentences as the English, one per line in `sents`), add the language to `voiceovers.voices.json`, deploy, press **Make voices**.

## Good to know
- Cost: about 1 ElevenLabs credit per character, ~7,500 per language, ~75,000 for all 10. The card shows the exact estimate before anything is charged. Voices already made are never paid for twice.
- Who can use it: owner and staff with the "API keys and link domains" permission.
- A wrong key stops the run after the first try. **Stop** stops after the current file.
- Also possible from a terminal (same result, files go into `public/media/tutorials/`): `ELEVENLABS_API_KEY=sk_... node scripts/make-voiceovers.js --yes`.
- Tests: `bash tests/runall.sh e2e-round23c.js` (fake ElevenLabs, nothing is charged).
