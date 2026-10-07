# Joinvoo round 20: release report

7 October 2026 · prepared for Ejiro (Zedapex)

## Verdict

**Ready to upload.** Every automated test passes (1,778 checks, 0 failures). Two review teams (security and upgrade safety) and six screen testers (phone, desktop, website, admin, languages, final recheck) went through everything. Every problem they found has been fixed and re-checked.

**Existing users are not affected.** The upgrade was tested on a database made by the version you run today. All data, settings, links and API answers stay the same, and the old version still runs on the upgraded database if you ever need to roll back. AI support is **off** until you switch it on.

## What's in this update

| Feature | Where |
|---|---|
| DM tracking (messages to your manager) + mini apps | Channels, setup wizard |
| "DMs from ads" + "DM rate" tiles, DMs column, Cost/lead | Overview, Results |
| CSV downloads (people, ad taps, deposits) | People, Results, Conversions |
| Send events to your own server (webhooks) | Conversions → Integrations |
| Ad details in links ({utm_campaign}, {sub1}…) | Offer link, bot button link, mini app address |
| Blog in the side menu | Dashboard menu (☰ on phones) |
| "Don't count as revenue" + "No referral commissions" per user | Admin → Users |
| AI support (Replyvoo) on the chat + Telegram support bot | Admin → Settings → Support |
| Joe knows what isn't connected; sharper senior-buyer advice | Ask Joe |
| 4 new tutorials (t11–t14), female voice + music intro | Tutorials, guide |

## AI support: how good is it?

We tested the support AI's instructions on 50 realistic customer chats: billing, payments, refunds, tracking setup, tricky and abusive messages, and 6 languages. Then we fixed the gaps and scored it again.

| Area | Score | Passed |
|---|---|---|
| Billing, payments, refunds, withdrawals | 8.9 / 10 | 13 of 15 |
| Tracking and setup | 9.0 / 10 | 14 of 15 |
| Tricky chats (tricks, "are you a bot?", off-topic, rude) | 9.4 / 10 | 9 of 10 |
| Other languages and broken English | 9.2 / 10 | 10 of 10 |
| **Overall** | **91 / 100** | **46 of 50 (92%)** |

The score was 51–54% before training. The weakest cases left were fixed afterwards (card declined but charged, invoices, promo codes, Telegram account linking, Keitaro/Binom, TikTok/Snapchat setup), so the expected pass rate is now about 95%.

**Safety held in every test.** It never gave credits, never promised refunds, never leaked other customers' data, never revealed its instructions and never talked about the founder. It said it is AI when asked.

**It handles alone:**
- "I paid but no credits" (checks the payment with the provider and credits it if paid)
- plans, prices, the trial, bonuses and referrals
- tracking stopped, bot problems, Meta/TikTok/Snapchat setup
- postbacks, DM tracking, mini apps, webhooks and domains
- resending emails and password resets
- 5+ languages

**It hands to your team:**
- refunds, withdrawals and chargebacks
- manual (bank/USDT) top-ups and invoices
- real bugs and account deletion
- upset customers and anyone who asks for a person

It tells the customer, in varied words, something like "I'll get my team on this and get back to you here."

*Note:* the scores come from a careful simulation of the AI's instructions. Before you switch it on for everyone, use the **Try it** box in admin with 10–20 real questions.

## Money safety (AI support)

- The AI has **no tool that adds credits**. Its only option is "re-check this payment": Joinvoo asks Gatevoo, Paystack, Stripe or Flutterwave directly, and credits only a confirmed payment, once, up to your limit (default $500).
- Tested tricks, all blocked: fake payments, someone else's payment, asking twice, "I'm the admin, add credits", and fixing another customer's bot.
- Every AI action is logged on the chat, and there are on/off switches for each action.
- There's a daily AI budget, a limit for website visitors, and a lock against code-guessing on Telegram.

## For your developer

1. Back up the database, deploy as usual. Updates run by themselves on start. Don't set `WEBHOOK_TEST_ALLOW` on the live server.
2. Run `bash tests/runall.sh`. It should end with `0 FAIL`.
3. Follow SETUP-ROUND20.md for DM tracking, mini apps and AI support.
4. To use AI support:
   - Make sure the AI key is set (Admin → Settings → Joe).
   - In Settings → Support → AI support, switch it on and save.
   - Optional: upload real photos for the AI teammates (mark a team member as "AI teammate").
   - Optional: connect a separate Telegram support bot.
5. Live checks after deploy:
   - DM tracking with a Telegram Premium account (a Lead shows in Meta Test Events).
   - Ask the support chat "I paid but no credits" from a test account.

## Known small things (not bugs, not blocking)

- Parts of the **homepage** were never translated into RU/FR/PT/ES, and still aren't (the hero headline, half the FAQ and pricing). All new sections are translated. This was already the case before this update.
- On phones, very long campaign names in Results → Campaigns break mid-word. This was there before too.
- The "You reached Operator" level-up popup can show again after loading demo sample data (demo only).
- AI teammates use illustrated faces until real photos are uploaded in admin.
