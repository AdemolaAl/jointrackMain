# Joinvoo knowledge for Joe

Joe reads this file (plus anything an admin adds in /admin → Settings → Joe) before every AI answer. Without an AI key, Joe answers
questions about Joinvoo by finding the best-matching `##` section below, so keep each section self-contained, short and practical.
Joinvoo is made by Zedapex.

## What Joinvoo does
Joinvoo tracks which ad brought every Telegram join. It works for channels, groups and bot subscribers (people who press Start).
Each tracked join is sent back to Meta, TikTok or Snapchat through their server-side APIs, so the ad platform can optimise for people who actually join, not just clicks.
Later deposits, registrations and sales reported by your affiliate program (postbacks) are matched to the same person and sent to the ad platforms too.

## How to set up tracking
1. Create a bot in @BotFather and paste its token in Channels.
2. Tap “Add to channel” and make the bot an admin with the “Invite users” right. The channel appears by itself.
3. Paste your Meta Pixel (dataset) ID and Conversions API access token, then press “Save and send a test”.
4. Use your Joinvoo tracking link as the ad’s website URL.
For bots: choose “Bot subscribers”, connect the bot, and use its tracking link. If your bot already runs on its own server, use “My bot already runs on its own server” so it keeps working.

## Tracking link and UTM tags
Add tags to the tracking link so every join carries its campaign, ad set and ad. For Meta use:
`?utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}`
utm_campaign fills the Campaign report, utm_term (or utm_adset / adset) the Ad set report, utm_content the Ad report. Without tags, joins still count but show as “no campaign tag”.

## Invite links and heavy traffic
Joinvoo makes single-use invite links ahead of time, so a click never waits. The Channels page shows how many are ready.
If the ready links run out, visitors get a backup link: they still join, only that join goes untracked.
Telegram limits how fast one bot can make links. For big campaigns, add a second or third bot as admin to the same channel: links are then made by all of them.

## Request-to-join mode
In request-to-join mode each click gets an invite link that asks to join. Joinvoo’s bot approves the request instantly and sends the person a welcome message with your offer link, where {tg_id} is replaced by their Telegram ID.
Your affiliate program receives the Telegram ID as sub1 and reports deposits back with it, so deposits match for channels, not just bots. Turn it on in Channels → Join mode.

## Postbacks and deposits (FTD)
Copy your postback URL from Conversions and paste it into your affiliate program or tracker: `…/pb/<key>?sub1={telegram_id}&status=ftd&payout={amount}&currency=USD&txid={id}`.
Statuses: reg (sign-up), lead, ftd (first deposit), dep (repeat deposit), sale, qualified (CPA), rejected (chargeback: removes the revenue and sends nothing).
The first deposit of a person is always the FTD; the same txid is never counted twice. Ready-made templates for popular programs are in Integrations.
You can also mark a person as deposited by hand in People.

## What gets sent to the ad platforms
Joins: Subscribe (Meta, by default), Subscribe or CompleteRegistration (TikTok), SUBSCRIBE (Snapchat), with the click ID, browser ID, IP and user agent and a hashed Telegram ID.
First deposits and sales: Purchase / CompletePayment / PURCHASE with the value. Repeat deposits: a Meta custom “Deposit” event. Registrations: CompleteRegistration / SIGN_UP.
Only people who came from an ad are sent. Organic joins are recorded but not sent.

## Fake clicks and fake joins
Clicks from bots, data centres, repeat clicks and scripts are marked as suspect (never blocked).
Joins are filtered when they look fake: a burst of joins far above the channel’s normal pace, a deleted Telegram account, the same person joining your channels again within 7 days, or a join that came from a bot or data-centre click.
Filtered joins are recorded (People → Filtered) but never sent to Meta, TikTok or Snapchat and never charged, so your pixels learn from real people.

## Backup channel (smart link)
Channel banned or full? Open the channel in Channels → Backup channel and pick another of your channels. Your existing ad link keeps working and new visitors join the backup channel, using its invite links and pixel settings, with joins counted there. No need to edit or re-review your ads. Send the traffic back any time.

## Ad spend, ROAS and cost per FTD
Enter what you spent per day and campaign on the Compare page, or import a CSV (date, platform, campaign, amount, currency).
With spend in, Joinvoo shows cost per join, cost per FTD and ROAS (revenue ÷ spend) for every campaign and platform. Without spend, those numbers stay empty: Joinvoo never estimates them.

## Compare and reports
Compare any two periods (today vs yesterday, this week vs last, this month vs last, or custom dates): joins, FTDs, revenue, spend, cost per FTD, ROAS and rates, with a plain-language summary.
Campaigns shows rows by campaign, ad set, ad, language, source, country, platform or channel. You can chart up to three campaigns side by side.

## Plans: Basic and Pro
Both plans are paid monthly from Joinvoo Credits (1 credit = $0.01), on the first tracked ad click of the month.
Basic: joins tracked and sent to your ads, deposits matched and sent to your ads, counts of deposits.
Pro: everything in Basic plus which campaigns, ad sets and ads drove each deposit, with revenue, ROAS and cost per FTD.
Upgrade any time: you pay only the difference for the rest of the month. Switching back to Basic happens at the end of the month.

## Pro trial
Every new account gets a free Pro trial: 7 days or 20 tracked deposits, whichever comes first. The clock starts at your first tracked deposit.
After the trial, deposits are still matched and sent to Meta, TikTok and Snapchat, so your ads keep learning; on Basic you see how many there were, and Pro shows which ads drove them.
One trial per account and per ad account or pixel.

## Credits, free joins and billing
New accounts get their first tracked joins free after confirming their email. After that, the monthly plan applies, and each tracked join beyond the plan’s included joins costs a small number of credits. Organic joins are free.
If the wallet runs out, tracking pauses: visitors still reach Telegram, but joins aren’t tracked or sent until you top up.
Buy credits in Wallet. Bigger top-ups get bonus credits. Credits pay for tracking; they can’t be withdrawn, and refunds only happen in the cases on the Refunds page.

## Levels
Your level shows how big you are as a media buyer, by leads in the rolling last 30 days (tracked ad joins plus bot Starts; filtered fake joins don’t count):
Rookie from 0, Hustler from 1,000, Operator from 5,000, Shark from 25,000, Whale from 100,000, Kraken from 300,000, Legend from 1,000,000.
Levels are checked every hour. Reaching a new level sends you a congratulations email; if your traffic drops, the level follows quietly. You can hide the badge in your profile.

## Ranks and loyalty
Ranks (Bronze, Silver, Gold, Platinum, Diamond) follow your lifetime paid top-ups and can give a discount on every tracked join, plus perks. Bonus and gift credits don’t count towards ranks.

## Referral program
Share your link from Earn. You earn a share of what the people you invite spend with real money (not bonus or gift credits). Earnings settle for a holding period first (14 days by default), then you can move them to your wallet or withdraw them in USDT or BTC.

## Telegram alerts
Connect the Joinvoo alerts bot in Settings → Telegram alerts to get: broken tokens or platforms refusing events, invite links running low, tracking paused, no joins for 2 hours on a channel that usually has them, a campaign with deposits yesterday but none by 18:00 today, live FTD pings, and a morning summary at 08:00 in your time zone (joins, FTDs, revenue, spend, ROAS, cost per FTD).

## Profile, Joomoji and language
Make your Joomoji (your Joinvoo avatar), set a nickname and pick your language (English, Русский, Français, Português, Español) in your profile. Emails and Telegram messages from Joinvoo use your language. Your time zone sets when your morning summary arrives.

## Troubleshooting: joins not showing
- Is the bot still an admin with “Invite users”? Channels shows “needs admin rights” if not.
- Are visitors using your Joinvoo tracking link (not the channel’s own t.me link)?
- Do you have credits? When tracking is paused, joins still happen but aren’t tracked.
- Ready invite links at zero? Add a second bot to the channel.
- Joins that look fake are filtered: check People → Filtered.

## Troubleshooting: events not reaching Meta, TikTok or Snapchat
Check the pixel ID and access token on the channel and press “Send a test”. A test code shows events in Test Events; clear it when you go live.
If the platform refuses events, the error shows on the channel and Joe flags it. Only ad joins are sent; organic joins never are.

## Troubleshooting: deposits not matching
The postback must carry the person’s Telegram ID as sub1. For channels, use request-to-join mode so the offer link includes {tg_id}. For bots, pass the Telegram ID from your bot into the affiliate link.
Open Conversions to see every postback, including unmatched ones, and what was sent to each ad platform.

## Media buying tips
- Scale a winning ad set slowly: raise the budget 20–30% a day so the algorithm keeps learning.
- Judge campaigns on cost per FTD and ROAS, not only cost per join: cheap joins that never deposit are expensive.
- When cost per FTD rises, check join rate first (creative and landing), then deposit rate (offer and welcome message).
- Optimise Meta for Subscribe (joins) until you have enough deposits, then test Purchase optimisation.
- Keep a backup channel ready before you scale.

## Inbox and notifications
The bell at the top of the dashboard opens the inbox. It has tabs: Updates (announcements from the Joinvoo team), Account (top-ups, payouts, plan, trial, level-ups, support replies), Alerts (no joins, platform errors, fake joins filtered) and Joe (daily tips). Unread items show a red count. In My profile → Notifications you choose which kinds also arrive by email. Security emails, like password resets, are always sent.

## Learn (the blog inside the dashboard)
The Learn page in the menu has articles about tracking Telegram joins, Conversions API, postbacks, UTM naming, scaling ad sets, backup channels and reading your numbers. Point people to Learn when they ask "how do I" questions about media buying.

## Country and payment methods
Each account has a country, chosen at sign-up and changeable in My profile once every 30 days. The Credits page only shows the payment methods available in that country. Card payments (Stripe) and Paystack confirm themselves within a minute. Bank transfer and crypto (USDT) are checked by the team, usually within a few hours. If a method someone expects is missing, check that their country is right in My profile.

## Tracking link domain
Tracking links may use a separate link domain (for example gojoinly.com/c/…) instead of joinvoo.com. This protects the main site if an ad platform blocks a link domain. Old links keep working. Always copy the link shown on the channel card, because it already uses the right domain.

## My profile
"My profile" in the menu (or tapping your face at the top) opens the Joomoji face editor, nickname, gender, country, language and notification settings. The level badge can be shown or hidden from the Levels page.

## Zedapex apps
Joinvoo is made by Zedapex. Sister tools: Replyvoo (AI Closers that reply to Telegram leads in seconds and send the payment link), Castvoo (broadcasts, drips and follow-ups for Telegram), Vooads/Advoo (AI ad creatives: videos, images and hooks in any language), Affleego (affiliate deals) and Landvoo (landing pages, coming soon). Suggest one only when it clearly helps: for example Replyvoo when someone gets many joins but replies slowly, or Castvoo when they want to follow up with new subscribers. Never push them.

## VooSquare
VooSquare is the shared Zedapex account: one login for all Zedapex tools. If it is switched on, the login page shows "Continue with VooSquare", and an existing account with the same verified email is linked automatically, keeping all data and balances. If referrals have moved to VooSquare, the Earn page links there and existing Joinvoo referral balances stay withdrawable.

## Channel and bot limits
Basic tracks up to 3 channels (bot-subscriber trackers count as channels) and 3 bots. Pro, and the Pro trial, are unlimited. The admin can change these numbers.
When you are at the limit, adding another one shows "You've used 3 of 3" with two choices: upgrade to Pro, or remove a channel (Channels → ⋯ → Remove channel) or disconnect a bot (Channels → Your bots → Disconnect).
A channel you add in Telegram while over the limit shows "not tracking yet" and starts tracking by itself as soon as there is room. Removing a channel keeps its past stats; its tracking link stops working, so don't leave it in live ads.
Accounts that already had more than 3 before the limits started keep all of them.

## Adding another bot
Channels → Add channel asks "Which bot?": pick one you already connected or tap "+ Add a new bot" and paste a new BotFather token. Each channel can use any of your bots, and one channel can use several bots for heavy traffic.

## Click IDs and invite link names
Every ad click gets a click ID like c-0a3f9. Joinvoo names the person's single-use invite link in Telegram after the click, for example "Meta · c-0a3f9 · NG", so in Telegram → your channel → Invite links you can see which platform and click each link belongs to. Open a person in People (or Just joined) to see their click ID, the invite link name, the campaign, country, device and which match keys were sent to Meta (click ID fbc, browser ID fbp, IP, device). Search People by click ID too.
To check Meta is receiving joins: Meta Events Manager → your dataset → Subscribe events from "Server", and look at Event Match Quality.

## Left (people who left)
"Left" shows people who joined in the chosen period and have since left, as a share of new joins. "+N older members" counts people who left but joined before that period or before Joinvoo tracked them.

## Paying with crypto (Gatevoo)
Credits → Top up → "USDT or Bitcoin" opens a secure Gatevoo checkout. Pay the exact amount shown in USDT (TRC20) or Bitcoin; the credits arrive automatically once the network confirms (usually a few minutes for USDT, longer for Bitcoin). No transaction ID to paste.

## Affiliates vs referrals
Referrals: customers invite friends from the Earn page inside Joinvoo. Affiliates: marketers and creators promote Joinvoo through the VooSquare affiliate program and can earn up to 50% for life (with conditions, see affiliate.voosquare.com). Joinvoo's page about it is /affiliates.

## DM tracking and mini apps
- DM tracking (shown as “DM tracking” in Channels) tracks people who message a manager's personal Telegram account from an ad. Setup: in @BotFather turn on Business Mode for the Joinvoo bot (/mybots → bot → Bot Settings → Business Mode). Then on the manager's Telegram: Settings → Telegram Business → Chatbots → add the bot and pick "New chats" or "All non-contacts". Telegram Business needs Telegram Premium on the manager's account.
- A DM tracking card appears in Channels by itself with its own ad link. Only each person's first message counts. Joinvoo never replies in those chats and never stores message text.
- Default events for a first message: Meta Lead, TikTok Contact, Snapchat SIGN_UP (changeable in Settings → Ad platforms). Optimise DM campaigns for Lead.
- Two ways the link opens (Settings → How it opens): "Straight to the chat" (ready message plus a short ref code; if the person deletes the code the message counts as organic) or "Through your mini app" (recommended: Telegram tells Joinvoo exactly who tapped, so every message is matched).
- Mini app setup: copy the address Joinvoo shows, in BotFather send /newapp, pick the bot, paste it as the Web App URL, then paste the t.me/bot/app link BotFather gives back into Joinvoo. Open it once; the status turns green.
- Bots with their own mini app (trading or shopping apps): bot Settings → Mini app → "Open my mini app instead of the chat" and enter the app's address; point the BotFather mini app at Joinvoo's address. Each open counts as a lead; Telegram login in their app keeps working.
- If the manager removes the bot or turns Business off, the DM tracking card shows "Bot turned off"; adding the bot again in Chatbots restarts tracking. The manager needs a Telegram username so the link can open the chat.
- A message from an ad counts as one tracked join for billing.

## DMs on Overview and Results
- When an account has DM tracking, Overview shows two extra tiles: "DMs from ads" (first messages matched to an ad, plus organic DMs underneath) and "DM rate" (ad taps that turned into a message). Joins and Join rate then count channel and group joins only.
- Results gets a DMs column per campaign, ad set or ad, and Cost/join becomes Cost/lead (spend divided by joins plus DMs).

## Downloads (CSV)
- People → Download CSV: everyone who joined, started the bot or wrote, with the kind of row, the ad, what was sent to the ad platforms and deposits.
- Results → Download: every ad tap in the chosen dates with platform, country, UTM tags, sub1–sub5, and whether it joined, started or messaged.
- Conversions → Download CSV: every registration and deposit with value, currency, txid and the campaign behind it. All downloads follow the date range picked at the top.

## Webhooks (send events to your own server)
- Conversions → Integrations → "Send events to your own server" → Add webhook. Paste an https address (CRM, own bot, Zapier or Make "catch hook" link), tick events: channel or group join, bot Start, first DM, registration, first deposit, repeat deposit, sale. Up to 5 per account; only the account owner can manage them.
- Each event is a JSON POST sent the moment it happens: event, person (tg_user_id, username, first_name), from_ad, ad (platform, utm_source, utm_campaign, utm_term, utm_content, subs), channel, and for deposits value, currency and txid.
- Security: header X-Joinvoo-Signature = "sha256=" + HMAC-SHA256 of (X-Joinvoo-Timestamp + "." + raw body) with the signing secret shown once when the webhook is created (a new secret can be made in Edit). If the server fails, Joinvoo retries up to 6 times over about 15 minutes. "Send test" sends a sample event.
- Tutorial: t13 "Send events to your own server".

## Link tags (pass the ad's details to an offer)
- Offer links (join-request mode), bot button links, bot welcome messages and a bot's mini app address accept tags: {tg_id}, {click_id}, {name}, {utm_source}, {utm_medium}, {utm_campaign}, {utm_term}, {utm_content}, {sub1}…{sub9}. Tap a chip under the link field to add one.
- Values come from the Joinvoo ad link the person tapped, so keep URL parameters on the Joinvoo link in the ad (e.g. Meta: utm_campaign={{campaign.name}}&utm_content={{ad.name}}). In links values are URL-encoded; with no ad they are empty. Unknown tags are left as typed.
- Tutorial: t14 "Pass your ad's details to your offer".

## Who built Joinvoo
- Joinvoo is built by Zedapex, the brand of its founder Ejiro Segbuyota, known as Dchessking (also "The Traffic Banker"). He had the idea and built it.
- Dchessking is a very skilled, award-winning media buyer who has won several awards and media buying contests. He was once an economics teacher at a secondary school.
- His brother Graceboy is also a media buyer, and his wife Olamide is a digital marketer. Traffic is in their blood.
- For more, open the about-zedapex-and-team playbook. Never invent details about them that aren't written there.
