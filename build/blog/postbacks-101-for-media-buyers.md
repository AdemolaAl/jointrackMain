---
title: Postbacks 101 for media buyers
slug: postbacks-101-for-media-buyers
description: What a postback is, how the sub ID makes it work, which macros to use, and how to connect sign-ups, first deposits and sales from your offer back to your Telegram tracking and ad platforms.
author: Joinvoo Team
date: 2026-07-22
tags: [Deposits, Tracking]
cover: postbacks-101-for-media-buyers.webp
reading_time: 5
---

> [!TAKEAWAYS]
> - A postback is a server-to-server call from the place where a conversion happens (your offer, network or CRM) to your tracker.
> - It only works if you pass an ID *out* with the click and the network sends that same ID *back* with the conversion.
> - For Telegram funnels, the natural ID is the person's Telegram user ID, passed as the sub ID in your offer link.
> - Once your tracker receives the postback, it can credit the right ad and forward the conversion to Meta, TikTok and Snapchat.

If join tracking tells you *who arrived*, postbacks tell you *who paid*. They're the bridge between your Telegram funnel and the revenue at the end of it, and they're less complicated than they look.

This is the primer we wish every new media buyer had.

## What a postback actually is

A postback is just a URL that gets called when something happens.

When a person signs up, makes a first deposit or buys something on the offer side, the platform that sees it (an affiliate network, a tracker such as Keitaro or Binom, a CRM or the merchant's own backend) calls a URL you gave it. That URL points at your tracker and contains details about the event in its parameters.

```
https://tracker.example.com/pb/YOUR-KEY?sub1=7012345678&status=ftd&payout=40&currency=USD&txid=abc123
```

Your tracker reads the parameters, finds the person, and records the conversion. No browser, no pixel, no cookies. That's why it's called server-to-server, or S2S.

## The sub ID is the whole trick

A postback is only useful if your tracker can tell **who** converted. That's what the sub ID is for.

1. When you send someone to the offer, you add an ID to the offer link, usually in a parameter called `sub1`, `subid`, `aff_sub` or `click_id`, depending on the network.
2. The network stores it alongside that visitor.
3. When the visitor converts, the network puts the same ID into the postback.
4. Your tracker looks it up and knows exactly who it was.

If step 1 is missing, the network has nothing to send back, and the postback is useless.

### Which ID to use in a Telegram funnel

In a web funnel, the sub ID is usually a click ID. In a Telegram funnel, the best ID is the person's **Telegram user ID**, because:

- Your bot knows it the moment someone presses Start or joins through a join request.
- It's stable. The same person always has the same ID.
- It links everything: the ad click, the join, the bot conversation and the eventual deposit.

So the offer link your bot sends looks like this, with the person's ID filled in:

```
https://offer.example.com/?sub1=7012345678
```

> [!NOTE]
> In a normal channel, people join and read. There's no private moment where you can hand each person their own link. That's why Joinvoo has a **join-request mode**: the bot approves each request instantly and sends the person a welcome message with their personal offer link. The {{GUIDE}} explains how to switch it on.

## Macros: the network's fill-in-the-blanks

When you paste a postback URL into a network, you don't type real values. You use the network's **macros**, placeholders it replaces with real data when it fires the postback.

Every network names them differently. The idea is always the same:

| You want | You put in the postback | Example macros (vary by network) |
|---|---|---|
| The ID you passed out | `sub1=` | `{sub1}`, `{sub_id_1}`, `{aff_sub}` |
| What happened | `status=` | `{status}`, `{goal}`, or a fixed value per postback |
| How much it was worth | `payout=` | `{payout}`, `{revenue}`, `{amount}` |
| A unique transaction ID | `txid=` | `{transaction_id}`, `{tid}` |

The most common mistake is using *your* placeholder name instead of the *network's* macro. If you paste `sub1={telegram_id}` and the network doesn't know `{telegram_id}`, it sends the literal text, and nothing matches. Always check the network's postback help page for its exact macro names.

> [!TIP]
> In Joinvoo's Integrations tab, many programs and trackers have ready-made postback URLs with the right macros already filled in. For anything else, use the custom postback and swap in the network's macros.

## Event types: sign-up, FTD, repeat, sale

Most networks let you fire different postbacks for different events, or send one postback with a status parameter. The useful set for media buyers:

- **Lead / registration:** someone signed up. Early signal, more volume.
- **FTD (first-time deposit) or first purchase:** the event that usually earns the payout.
- **Repeat deposit / rebill:** later revenue from the same person.
- **Sale:** a one-off purchase, a course, a subscription.
- **Rejected / chargeback:** something was reversed. Your tracker should remove the revenue, and should *not* tell the ad platforms anything.

Send value with every revenue event. It's what turns cost per FTD into ROAS.

## Where the postback goes next

Receiving a postback is half the job. The other half is **forwarding it to your ad platforms**, so they can optimise for buyers instead of joiners.

When Joinvoo receives a postback, it finds the person by Telegram ID, finds the ad click that brought them, and sends the conversion to every connected platform through their server APIs:

| Event | Meta | TikTok | Snapchat |
|---|---|---|---|
| Registration | `CompleteRegistration` | `CompleteRegistration` | `SIGN_UP` |
| First deposit / sale | `Purchase` + value | `CompletePayment` + value | `PURCHASE` + value |

Then you can choose those events as your optimisation target once you have enough volume. When to make that switch is a judgement call; {{POST:cost-per-ftd-vs-cost-per-join}} lays out how to make it.

## Testing a postback

Never trust a postback you haven't seen fire.

1. Most networks have a **test postback** button. Use it with a real Telegram ID from your own test account.
2. Check that your tracker shows the event, matched to the right person.
3. Check that the status and payout came through as numbers, not as literal macro text like `{payout}`.
4. If it doesn't match, the sub ID is almost always the reason: either the bot isn't adding it to the offer link, or the network isn't sending it back.

## Common failure modes

**The sub ID never left.** The offer link in your bot or welcome message has no `sub1`. Fix the link.

**The wrong macro.** The postback contains `{sub1}` literally. The network uses a different macro name.

**Duplicate events.** The network fires the same FTD twice. A unique transaction ID lets your tracker ignore the duplicate.

**Timezones and delays.** Some networks batch postbacks. If FTDs arrive hours late, ad platforms still accept them within their window, but your daily reports will shift. Know your network's behaviour.

## Recap

Pass an ID out. Get the same ID back. Use the network's macros, not your own placeholder names. Send value with revenue events. Forward everything to your ad platforms so they learn from buyers.

Postbacks are part of Joinvoo Pro, and every account gets a free deposit-tracking trial. [Create your account]({{SIGNUP}}) and follow the postback steps in the {{GUIDE}}.
