# Tutorial voice-overs

Drop the ElevenLabs MP3 files here, named exactly as below. The dashboard's tutorial player (More › Help & tutorials, every "Watch how" button, and `/app?tutorial=t1` … `t10`) plays `/media/tutorials/<id>.mp3` when it exists and syncs the animation and captions to the audio's length. When a file is missing it plays on a timer (about 150 words a minute) with captions only and a small "Captions" badge, never an error.

- Format: MP3, mono or stereo, 44.1 kHz, about 30–40 seconds each. Keep a short pause between sentences; the scenes change on each sentence.
- Read the text exactly as written (the scenes are timed by the words of each sentence). If you change a sentence, change it in `docs/tutorials.json` and in `TUT` in `src/dashboard/p8f.tutorials.html` too.
- After adding files, rebuild the demo (`bash src/dashboard/make.sh`) so `dist/media/tutorials/` gets them as well.
- **Server:** `server.js` serves `/media/tutorials/*.mp3` (audio/mpeg, with range support), so files dropped here play on the live site after a deploy. **All 11 files are included** (American male narrator, made with the open Kokoro voice model, Apache-2.0). To swap any of them for an ElevenLabs take later, just save the new MP3 here under the same name. Note: `home.mp3` is timed to the 30-second homepage animation, and its lines are slightly shortened to fit each scene.

| File | Tutorial | Where it opens | Words |
|---|---|---|---|
| `t1.mp3` | Create your tracking bot | Setup step 1 | 73 |
| `t2.mp3` | Add your bot to your channel | Setup step 2 | 74 |
| `t3.mp3` | Connect Meta | Setup step 3 / channel Settings > Ad platforms | 72 |
| `t4.mp3` | Track deposits with request-to-join | channel Settings > Join method | 78 |
| `t5.mp3` | Send people from your own website | channel Settings > Your own website | 66 |
| `t6.mp3` | Use your own domain | Channels > Your link domain | 73 |
| `t7.mp3` | Connect your own bot's Start | bot channel Settings > Connect your bot's Start | 67 |
| `t8.mp3` | Add your team | More > Team | 59 |
| `t9.mp3` | Read your results | Results | 76 |
| `t10.mp3` | Invite a setup helper | More > Team | 78 |
| `t11.mp3` | Why track messages to your manager | Setup step 2 · DM tracking / DM tracking Settings > How it opens | 104 |
| `t12.mp3` | Set up your mini app | DM tracking Settings > How it opens / bot Settings > Mini app | 84 |
| `t13.mp3` | Send events to your own server | Conversions > Integrations > Send events to your own server | 55 |
| `t14.mp3` | Pass your ad’s details to your offer | Channel settings > Offer link · bot Settings > Button link · mini app address | 47 |
| `home.mp3` | Website explainer | Joinvoo homepage (website, not the dashboard) | — |

## Scripts

### t1.mp3 — Create your tracking bot

> Welcome to Joinvoo. First, let's make your tracking bot. It takes about one minute. Open Telegram and search for BotFather, the one with the blue tick. Tap Start, then send slash new bot. Give your bot any name, then a username that ends with the word bot. BotFather sends you a long token. Copy it, come back to Joinvoo, paste it in the box, and tap Connect. That's it. Your bot is ready.

### t2.mp3 — Add your bot to your channel

> Now add your bot to your channel. In Telegram, open your channel and tap its name. Tap Administrators, then Add Admin. Search for your bot and add it. Make sure "Invite users via link" is switched on, then tap Save. Come back to Joinvoo. It finds your channel by itself in a few seconds. If you want to track a bot instead of a channel, choose "My bot" and follow the same simple steps.

### t3.mp3 — Connect Meta

> Next, connect Meta, so every join is sent back to your ads. In Meta Events Manager, copy your Pixel ID. Then open Settings, find Conversions API, and generate an access token. Paste both into Joinvoo and tap Send test. When you see "Test received", you're done. Now copy your ad link from your channel card, and put it in your ad. Every join shows up in Meta, matched to the exact click.

### t4.mp3 — Track deposits with request-to-join

> Want to see who deposits, not just who joins? Turn on request-to-join. Open your channel's Settings, then Join method. Pick who lets people in. Joinvoo can let them in instantly, and send your welcome message with your offer link. Or, if you already have your own welcome bot, choose "My own bot", and Joinvoo simply tracks. Keep the Telegram ID tag in your offer link, and every deposit is matched to the right person and the right ad.

### t5.mp3 — Send people from your own website

> Already have your own landing page? Keep it. Open your channel's Settings, then "Your own website". Choose when people go to Telegram: instantly, when they tap your button, or after a few seconds. Copy the one line of code, and paste it into your page. Visitors land on your page, then go straight into Telegram. And every join is still matched to the exact ad click.

### t6.mp3 — Use your own domain

> You can run your ad links on your own domain, like go dot your brand dot com. Open Channels, then "Your link domain", and type your subdomain. Joinvoo shows you two records. Add them where you bought your domain, in your DNS settings. Then tap Check now. When it says Live, your new links use your own domain, and your old links keep working. Basic includes one domain. Pro gives you unlimited domains.

### t7.mp3 — Connect your own bot's Start

> Sending your ads to your own bot, and you don't want to share its token? No problem. Open the bot's Settings, then "Connect your bot's Start". Copy the ready-made code for your bot, or the web address for no-code builders like ManyChat or SendPulse. Tap Send a test. Now, every time someone presses Start, your bot tells Joinvoo, and the join is matched to the exact ad.

### t8.mp3 — Add your team

> Working with a team? Open More, then Team, and tap Invite. Enter your buyer's email and pick a role. Managers see every channel. Buyers see only the channels you give them. Pro includes three team members, and you can add more any time. On Results, compare your buyers side by side, and see who brings you the cheapest deposits.

### t9.mp3 — Read your results

> Here's how to read your numbers. Open Results. At the top, you see joins, deposits, and cost per deposit. Add your ad spend, or connect your ad account, and Joinvoo works out your cost per join and your return on ad spend. Tap any person to see the exact ad, campaign and click they came from. And every morning, Joinvoo can send this summary straight to your Telegram. Turn it on in More, then Daily report.

### t10.mp3 — Invite a setup helper

> Need someone to set up Joinvoo for you, without sharing your password? Open More, then Team, and tap Invite. Choose Setup helper. It's free on every plan. Enter their email, or copy the invite link and send it on WhatsApp. Your helper can set up your bots, channels and ads, but they can't see your billing or your money. If they help many clients, they see all their accounts in one place. You can remove them any time.

Not recorded yet (round 18): record it with the same voice (“Jacob L.”, American) in the same ElevenLabs flow, save one take as `t10.mp3`. Until then the tutorial plays with captions only.

### t11.mp3 — Why track messages to your manager

> Do your ads send people straight to a manager’s chat on Telegram? Then this one matters. Right now, Meta only sees a tap on your link. It can’t see who actually sent your manager a message, so it learns to find people who tap and leave. You pay for clicks, while your manager sits waiting for real conversations. Joinvoo fixes that by tracking every first message. First, in BotFather, open your bot’s settings and turn on Business Mode. Then, on the manager’s Telegram, open Settings, then Telegram Business, then Chatbots, and add your bot. Back in Joinvoo, tap Yes, that’s my manager, and you get a new ad link. Connect Meta, and put that link in your ad. When someone taps your ad and sends their first message, Joinvoo matches it to the exact ad, and sends a Lead to Meta. Now Meta learns from people who really start a conversation, so your cost per message drops and your manager gets better leads. And Joinvoo never replies, and never saves what people write.

### t12.mp3 — Set up your mini app

> For the most exact tracking, send people to your manager through a mini app. Open the chat’s Settings, then How it opens, and pick Through your mini app. Copy the web address Joinvoo shows you. In BotFather, send slash new app, pick your bot, and paste the address. BotFather sends you a link. Paste it back into Joinvoo, and tap Save. Open the mini app once, and it turns green. Now Telegram tells Joinvoo exactly who tapped your ad, so every message is matched.

### t13.mp3 — Send events to your own server

> Want every join, message and deposit sent to your own server the moment it happens? Open Conversions, then Integrations, and scroll down to Send events to your own server. Tap Add webhook, and paste your server’s address, like your CRM, your own bot, or a Zapier or Make link. Tick the events you want, like joins, first messages and first deposits, then tap Add webhook. Copy the signing secret, so your server can check that each event really comes from Joinvoo. Now tap Send test, and when your server answers, the card says Working. From now on, each event arrives with the person, their Telegram ID, and the campaign and ad they came from. And if your server is ever down, Joinvoo tries again for you, so nothing gets lost.

### t14.mp3 — Pass your ad’s details to your offer

> Want your offer or tracker to know which campaign and ad each person came from? Open your channel’s settings, and find your offer link, or your bot’s button link. Under the link, tap a tag, like campaign, ad, or sub one, and Joinvoo adds it to the link for you. In your ad, keep your usual URL parameters on your Joinvoo link, like the campaign name and the ad name. When someone taps your ad, Joinvoo fills in each tag with that person’s details. Your offer now sees the campaign, the ad and the Telegram ID behind every visit, so each deposit is matched back to the ad. Tags work in your welcome message too.

Round 19: t11, t12, t13 and t14 are a **female** narrator (Kokoro voice `af_heart`, American, same open model as the others) over a short original music bed: 4 seconds of music fading in, then the voice, with the music kept low underneath and fading out at the end. Each sentence's start time is stored as `marks` on the tutorial in `src/dashboard/p8h.round19.html`, so the scenes follow the voice exactly. If you re-record them, update `marks` (or delete them and the player falls back to word-count timing).

### home.mp3 — Website explainer

The homepage explainer voice-over for the website (its script lives with the website build, not in `docs/tutorials.json`).
