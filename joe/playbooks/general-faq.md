# General FAQ
> Use when: a customer asks a common, short question about Joinvoo setup, billing and credits, the Pro trial, postbacks, numbers not matching Meta, attribution, expired links, bot admin rights, request-to-join, privacy, refunds, languages, team access, the link domain or VooSquare.

Short answers Joe can quote or adapt. For details, open the matching playbook or knowledge section. Prices and limits can be changed by the Joinvoo team: when in doubt, point to the pricing page or Wallet for the current numbers.

---

## Setup

**1. How do I start tracking a Telegram channel?**
Create a new bot in @BotFather and paste its token in Channels. Tap "Add to channel" and make the bot an admin with the "Invite users" right; the channel appears by itself. Then add your Meta Pixel (dataset) ID and Conversions API token, press "Save and send a test", and use your Joinvoo tracking link as the ad's website URL.

**2. Can I use a bot I already use for something else?**
Use a new bot just for Joinvoo. A bot can only send its updates to one place, so connecting a bot that already runs a shop, support or another tracker can break it. The exception is tracking your own bot's subscribers: choose "My bot already runs on its own server".

**3. Does Joinvoo work with groups and bots, not just channels?**
Yes. It tracks channel joins, group joins and bot subscribers (people who press Start).

**4. Which ad platforms are supported?**
Meta (Facebook and Instagram), TikTok and Snapchat. Joins and deposits are sent back through their server-side APIs.

**5. What link do I put in my ad?**
The Joinvoo tracking link shown on the channel card. Don't use the channel's own t.me link, or joins won't be tracked or sent.

**6. How do I see which campaign, ad set and ad brought each join?**
Add UTM tags to the tracking link. For Meta: `?utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}`. Without tags joins still count, but show as "no campaign tag".

**7. How do I check that events reach Meta?**
Press "Send a test" on the channel and look in Meta's Test Events. Clear the test code when you go live, or real events will keep showing as tests.

**8. How long does setup take?**
Usually around ten minutes for a channel with Meta. The setup guide at /guide walks through each step.

**9. Can I track several channels?**
Yes. Add each channel with its bot; each has its own tracking link, invite links and pixel settings.

**10. What happens at very high traffic?**
Joinvoo prepares single-use invite links ahead of time. If ready links run out, visitors get a backup link and still join, but untracked. For big campaigns, add a second or third bot as admin to the same channel so all of them make links.

---

## Billing and credits

**11. How does Joinvoo charge?**
Joinvoo is prepaid with Joinvoo Credits (1 credit = $0.01). Your monthly plan is paid from credits on the first tracked ad click of the month, and tracked joins beyond the plan's allowance cost a small number of credits each.

**12. What do the plans cost?**
At the time of writing, Basic is 3,000 credits ($30) a month with 2,000 tracked joins and Pro is 9,900 credits ($99) a month with 5,000, with extra joins at 2 credits each. Check the pricing page or Wallet for current prices.

**13. Are there free joins?**
Yes. New accounts get their first tracked joins free after confirming their email (500 at the time of writing). After that, the monthly plan applies.

**14. Do organic joins cost credits?**
No. Organic joins (people who didn't come from your ads) are recorded for free and are not sent to the ad platforms.

**15. Are fake joins charged?**
No. Joins filtered as fake are recorded under People → Filtered, never sent to the ad platforms and never charged.

**16. What happens if my credits run out?**
Tracking pauses: visitors still reach Telegram, but joins aren't tracked or sent until you top up. You get a low-balance warning and a "tracking paused" notice.

**17. How can I pay?**
In Wallet. The methods shown depend on the country in your profile. Card payments and Paystack confirm within a minute; bank transfer and crypto (USDT) are checked by the team, usually within a few hours.

**18. A payment method I expected is missing.**
Check that the country in My profile is correct; the Credits page only shows methods available in that country. You can change the country once every 30 days.

**19. Do bigger top-ups get a bonus?**
Yes, bigger top-ups get bonus credits. Bonus credits can be spent on tracking but are never withdrawn or refunded.

**20. My crypto or bank top-up hasn't arrived.**
Those are checked by the team, usually within a few hours. If it takes longer, contact live support with the payment reference.

**21. What are ranks?**
Ranks (Bronze to Diamond) follow your lifetime paid top-ups and can give a discount on every tracked join, plus perks. Bonus and gift credits don't count.

**22. What are levels?**
Levels (Rookie to Legend) show your size as a media buyer by leads in the last 30 days: tracked ad joins plus bot Starts. Filtered fake joins don't count.

---

## Plans and Pro trial

**23. What's the difference between Basic and Pro?**
Basic tracks joins, sends them to your ads, matches deposits, sends them to your ads and shows deposit counts. Pro adds which campaigns, ad sets and ads drove each deposit, with revenue, ROAS and cost per FTD.

**24. How does the Pro trial work?**
Every new account gets a free Pro trial of 7 days or 20 tracked deposits, whichever comes first. The clock starts at your first tracked deposit.

**25. What happens when the trial ends?**
Deposits are still matched and sent to Meta, TikTok and Snapchat, so your ads keep learning. On Basic you see how many deposits there were; Pro shows which ads drove them.

**26. Can I get a second trial?**
No. There is one trial per account and per ad account or pixel.

**27. How do upgrades and downgrades work?**
Upgrade any time and pay only the difference for the rest of the month. Switching back to Basic happens at the end of the month.

---

## Postbacks and deposits

**28. What is a postback?**
A server-to-server message from your affiliate program telling Joinvoo that someone registered, deposited or bought. Joinvoo matches it to the person and sends it to your ad platform.

**29. Where do I find my postback URL?**
In Conversions. It looks like `…/pb/<key>?sub1={telegram_id}&status=ftd&payout={amount}&currency=USD&txid={id}`. Replace the `{…}` parts with your program's own macros.

**30. Are there templates for my affiliate program?**
Integrations has ready-made templates for popular programs such as 1win, Pocket Option, Affstore, Kingfin and Keitaro. Keep the `&net=<program>` part so conversions are credited to that program.

**31. What statuses can I send?**
`reg` (sign-up), `lead`, `ftd` (first deposit), `dep` (repeat deposit), `sale`, `qualified` (CPA qualified) and `rejected` (chargeback or refund: removes the revenue and sends nothing).

**32. Why aren't my deposits matching?**
The postback must carry the person's Telegram ID as sub1. For channels, turn on request-to-join so the offer link includes `{tg_id}`; for bots, put the user's Telegram ID into the affiliate link. Conversions shows unmatched postbacks so you can check.

**33. My program calls it subid or aff_sub, not sub1.**
That's fine: Joinvoo also reads `subid`, `aff_sub` or `tg_id` for the person, and `event`, `goal` or `type` instead of `status`.

**34. Will a repeated postback count the deposit twice?**
No, as long as you pass `txid`. The same txid is never counted twice, and a person's first deposit is always their FTD.

**35. Can I mark a deposit by hand?**
Yes, in People you can mark a person as deposited.

**36. What does Joinvoo send for deposits?**
First deposits and sales go as Purchase / CompletePayment / PURCHASE with the value; repeat deposits as a Meta custom "Deposit" event; registrations as CompleteRegistration / SIGN_UP.

**37. Why are cost per FTD and ROAS empty?**
They need your ad spend. Enter spend per day and campaign on the Compare page or import a CSV (date, platform, campaign, amount, currency). Joinvoo never estimates them.

---

## Numbers and attribution

**38. Why don't my numbers match Meta's?**
They measure different things. Meta reports conversions using its attribution windows and modelled data; Joinvoo counts real joins in Telegram and real deposits from postbacks. Also, filtered fake joins and organic joins are never sent to Meta.

**39. Meta shows more results than Joinvoo. Why?**
Meta may count view-through conversions and modelled conversions, or another pixel or integration may be sending the same event. Check your attribution settings and make sure only one source sends each event.

**40. Meta shows fewer results than Joinvoo. Why?**
Some events can't be matched to a Meta user (for example people on iOS who opted out of tracking), and Meta only credits conversions inside its attribution window. Check the channel card for events the platform refused, too.

**41. What is an attribution window?**
The time after a click (or view) in which a platform credits a conversion to an ad, for example 7 days after a click. Deposits that happen after the window still show in Joinvoo but may not be credited by the platform.

**42. Which numbers should I trust?**
Use Joinvoo for what really happened (joins, deposits, revenue) and the platform's numbers for what its algorithm sees. Compare trends rather than expecting exact matches.

**43. Why are yesterday's FTDs low?**
Deposits often arrive days after the join, so recent days fill in later. Judge campaigns over several days.

**44. What is a "suspect" click?**
A click from a bot, data centre, script or repeat clicker. It's marked as suspect, never blocked, so you can see traffic quality.

**45. Why was a join filtered?**
It looked fake: a burst far above the channel's normal pace, a deleted account, the same person rejoining your channels within 7 days, or a join from a bot or data-centre click. Filtered joins are in People → Filtered.

---

## Links, bots and request-to-join

**46. Telegram says "the link expired" or "invite link is invalid".**
Each click gets a fresh single-use invite link. If someone forwards or reopens an invite link that was already used, Telegram says it has expired. Always share the Joinvoo tracking link, not the t.me invite link, so every click gets a new one.

**47. The Telegram alerts connect link expired.**
Open Joinvoo → Settings → Telegram alerts and tap Connect again to get a new link.

**48. The bot says "needs admin rights".**
The bot must be an admin of the channel with the "Invite users" right. Open the channel's admin settings in Telegram, add the right back, and the Channels page updates.

**49. What is request-to-join mode?**
Each click gets an invite link that asks to join. Joinvoo's bot approves the request instantly and sends a welcome message with your offer link, where `{tg_id}` becomes the person's Telegram ID. Turn it on in Channels → Join mode.

**50. Does request-to-join make people wait?**
No, Joinvoo's bot approves the request instantly. People tap "Request to join" and are in.

**51. Why should I use request-to-join?**
It lets you welcome every new member personally and pass their Telegram ID to your affiliate program, so deposits match for channels, not just bots.

**52. My channel was banned or is full. What do I do?**
Open the channel in Channels → Backup channel and pick another of your channels. Your existing ad link keeps working and new visitors join the backup, with no need to edit or re-review your ads.

**53. Why does my tracking link use a different domain?**
Tracking links may use a separate link domain (for example gojoinly.com/c/…) instead of joinvoo.com. This protects the main site if an ad platform blocks a link domain. Old links keep working; always copy the link from the channel card.

**54. I get no joins at all suddenly.**
Check that the bot is still an admin with "Invite users", that you have credits, that ready invite links aren't at zero, and that your ads use the Joinvoo link. Telegram alerts warn you about each of these.

---

## Privacy and data

**55. What data does Joinvoo send to the ad platforms?**
For people who came from an ad: the event, click ID, browser ID, IP address, user agent and a hashed Telegram ID, plus the value for deposits and sales. Organic joins are never sent.

**56. Is the Telegram ID sent in plain text?**
No, it's sent hashed, as the platforms require for identifiers.

**57. Does Joinvoo read my channel's messages?**
Joinvoo's bot needs admin rights to create invite links and see joins; the purpose is tracking joins and sending welcome messages if you turn that on. See /privacy for the full details of what is processed.

**58. Where is the privacy policy?**
At /privacy. The cookie policy is at /cookies.

**59. How do I keep my tokens safe?**
Never post your Conversions API token, bot token or postback key in chats or screenshots. If one leaks, create a new one and paste it in Joinvoo.

---

## Refunds and policies

**60. Can I get a refund?**
Buying credits is generally final, and credits used on tracking aren't refundable. There are exceptions, for example a payment taken by mistake such as a duplicate charge, or rights under consumer law that apply to you. The full rules are at /refunds; contact support with the payment reference.

**61. Can I withdraw my credits?**
No. Credits pay for tracking and can't be withdrawn. Only settled referral earnings can be withdrawn.

**62. Where are the terms?**
Terms of Service at /terms, Refund Policy at /refunds, Acceptable Use at /acceptable-use and Referral Program Terms at /referral-terms.

---

## Referrals

**63. How does the referral program work?**
Share your link from Earn. You earn a share of what the people you invite spend with real money (not bonus or gift credits). Earnings settle for a few days, then you can move them to your wallet or withdraw them in USDT or BTC.

**64. If I move referral earnings to my wallet, can I withdraw them later?**
No. Once moved into your wallet they become credits and can no longer be withdrawn.

---

## Languages, notifications and profile

**65. Which languages does Joinvoo support?**
English, Русский, Français, Português and Español. Pick yours in My profile; emails and Telegram messages from Joinvoo use it too.

**66. Can Joe answer in my language?**
You can write to Joe in your own language and Joe will try to answer in it. Your profile language sets the language of the dashboard, emails and alerts.

**67. What Telegram alerts can I get?**
Broken tokens or refused events, invite links running low, tracking paused, no joins for 2 hours on a usually active channel, a campaign with deposits yesterday but none by 18:00 today, live FTD pings and a morning summary at 08:00 in your time zone. Connect them in Settings → Telegram alerts.

**68. Where are my notifications?**
In the bell at the top of the dashboard: Updates, Account, Alerts and Joe. In My profile → Notifications you choose which also arrive by email; security emails are always sent.

**69. How do I change the time of my morning summary?**
It arrives at 08:00 in your time zone, so set the right time zone in your profile.

---

## Team and staff

**70. Can my media buyers have their own logins on my account?**
Joinvoo accounts don't currently have built-in teammate logins for customers. Don't share your password; ask live support about options for teams and agencies.

**71. Who are the Joinvoo staff I talk to in support?**
Support replies come from the Joinvoo support team through the live chat in Help. Joe only shares team details that are listed in about-zedapex-and-team.md.

**72. How do I contact support?**
Open Help in the dashboard menu and start a live support chat. Replies also arrive in your inbox and by email.

---

## VooSquare and Zedapex

**73. What is VooSquare?**
VooSquare is the shared Zedapex account: one login for all Zedapex tools. If it's switched on, the login page shows "Continue with VooSquare".

**74. Will I lose my data if I log in with VooSquare?**
No. An existing account with the same verified email is linked automatically, keeping all data and balances.

**75. My referrals moved to VooSquare. What about my balance?**
If referrals have moved to VooSquare, the Earn page links there, and existing Joinvoo referral balances stay withdrawable.

**76. Who makes Joinvoo?**
Zedapex. Its other tools include Replyvoo (AI Closers for chats), Castvoo (Telegram broadcasts and drips), Vooads (AI ad creatives), Affleego (affiliate deals), and Landvoo and Gatevoo, which are coming.
