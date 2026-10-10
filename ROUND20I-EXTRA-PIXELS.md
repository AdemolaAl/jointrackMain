# Round 20i: more Meta pixels per channel

**Why:** a customer runs ads from more than one Meta ad account. Each ad account uses its own pixel, so the joins must
reach every one of those pixels, not just one.

**What changed (additive, nothing removed):**
- Channel settings → Ad platforms → Meta now has **More pixels (optional)**: up to **4 extra pixels**, each with its own
  Conversions API access token. Every join and every conversion (FTD, deposit…) is sent to the main pixel *and* to each
  extra pixel, as the same event (same event ID, name and user data).
- **Send a test event** now tests the main pixel and every extra pixel, and says which one failed.
- An extra pixel that refuses events is retried on its own and never changes the join's Meta status, the counters or the
  main pixel. After 6 tries the owner gets the usual "Meta is refusing your events" alert, naming the pixel.
- Tokens are never sent back to the browser. Removing the main pixel removes the extra ones too.
- Database: two new columns, added by themselves on start: `channels.meta_extra` (JSON) and `capi_queue.target`.
  Extra-pixel queue rows use `platform='meta_x'`.

**Files:** `server.js`, `src/dashboard/p4.shell.html` (form), `src/dashboard/p9.demo.html` (demo), `public/app.html` + `dist/`
(rebuilt with `sh src/dashboard/make.sh`), `tests/e2e-round20i.js` (22 checks), `tests/mock.js` (records events per pixel),
`tests/runall.sh`.

**Tests:** `bash tests/runall.sh` → 1855 ok, 1 FAIL. The one FAIL is in `e2e-audit.js` ("referrer earns on the $50…") and
fails on the round 20h code too: it assumes the Pro charge is more than $50, but on the 10th of the month the charge is
prorated to $48.97. Not related to this change; it passes again later in the month.

**Tip for customers (no code needed):** if both ad accounts are in the same Business portfolio, they can also share one
pixel: Meta Business settings → Data sources → Datasets/Pixels → the pixel → **Connected assets → Add assets** → pick the
other ad account. Then one pixel is enough.
