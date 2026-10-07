---
title: "How to track Telegram DMs from your ads (and why it matters)"
slug: track-telegram-dms-and-mini-apps-from-ads
description: Sending ads straight to a manager's chat? Here's how to match every first message to the exact ad, send it to Meta, TikTok or Snapchat as a Lead, and why a Telegram mini app makes the match exact.
author: Dchessking
date: 2026-10-07
tags: [Funnels, Tracking]
cover: track-telegram-dms-and-mini-apps-from-ads.webp
reading_time: 6
---

> [!TAKEAWAYS]
> - Many of the best Telegram funnels skip the channel and send people straight to a manager. Until now, those messages were invisible to your ad platforms.
> - With Telegram Business, your tracking bot can see who writes to your manager first. Joinvoo matches that first message to the ad and sends a Lead to Meta, TikTok or Snapchat.
> - A mini app makes the match exact: Telegram itself tells Joinvoo who tapped your ad, with no code to copy and nothing to guess.
> - Optimise for messages, not taps. Your ads then find people who actually start a conversation.

Some of the strongest funnels I've run never touch a channel. The ad opens a chat with a real person, a manager who answers questions, sends the offer, and walks people to their first deposit. One-to-one conversations convert. But they've always had one big problem: **your ad platform had no idea who actually wrote to you.**

Meta saw a tap on a link. That was it. So it optimised for taps, found cheap tappers, and your manager sat in an empty inbox while your cost per lead looked fine on paper.

## Why DM funnels were a black box

Telegram doesn't tell anyone who opened a link to a personal account. There's no invite link to count, no Start button to press. Someone taps `t.me/yourmanager`, and from your ad platform's point of view they disappear.

So buyers did what they could: optimised for landing page clicks, counted chats by hand, or asked managers to tag where people came from. None of that reaches the ad platform, and none of it scales.

## How DM tracking works now

Telegram Business lets a manager connect a **chatbot** to their personal account. The bot can see new chats, which is exactly what tracking needs. Joinvoo uses this, read-only:

1. Your manager adds your Joinvoo bot under **Telegram → Settings → Telegram Business → Chatbots**. This needs Telegram Premium on their account.
2. A **DM tracking** card appears in Joinvoo by itself, with its own ad link.
3. Someone taps your ad, lands in the manager's chat and sends their **first message**.
4. Joinvoo matches that message to the exact ad click and sends a **Lead** to your ad platforms, with the click details they need to learn from it.

Only the first message counts. Joinvoo never replies in those chats and never saves what people write. The manager talks to customers exactly as before.

| Platform | Event sent for a first message |
|---|---|
| Meta | `Lead` |
| TikTok | `Contact` |
| Snapchat | `SIGN_UP` |

You can change the event per link if you prefer another one.

## Ref code or mini app: two ways to match

There are two ways your ad link can open the chat.

### Straight to the chat

The link opens your manager's chat with a ready message, like "Hi! I'm interested", followed by a short code. When the person taps Send, the code tells Joinvoo which ad they came from. It works with no extra setup. The weakness: if someone deletes the code before sending, that message can't be matched and counts as organic.

### Through a mini app (recommended)

The link opens a tiny Telegram mini app first. Telegram signs who opened it, so Joinvoo knows exactly which person tapped which ad, then sends them straight into the manager's chat with the ready message typed in. Every message from your ads is matched, and nothing can be deleted or mistyped.

Setting it up takes about two minutes in BotFather: send `/newapp`, pick your bot, paste the address Joinvoo shows you, and paste the link BotFather gives you back into Joinvoo.

> [!TIP]
> Already have your own mini app, like a trading or shopping app? Your ad can open it directly. Joinvoo notes who opened it, then shows your app, and each open counts as a lead. Telegram login inside your app keeps working.

## Optimise for messages, not taps

Once Leads start arriving, change what your ad sets optimise for. On Meta, pick **Lead** as the conversion event for your DM campaigns. Give it a few days of volume before you judge it.

What usually happens is that cost per tap goes up and cost per message goes down. You stop paying for people who tap and leave, and start paying for people who write. If your manager closes deposits, add your postback as in {{POST:postbacks-101-for-media-buyers}}, and those deposits go back to the ad that started the conversation.

A few things I've learned running DM funnels:

- **Keep the ready message short and human.** "Hi! I saw your ad" gets sent more often than a paragraph.
- **Answer fast.** The Lead is sent on the first message, but deposits come from replies. A slow manager wastes good leads.
- **Watch the gap between taps and messages.** If many people open the chat but few write, your ad promises something the chat doesn't deliver.
- **Split managers by link.** Each manager gets their own DM tracking link, so you can compare managers like you compare ad sets.

## Recap

DM funnels convert well but used to be invisible. Telegram Business lets your bot see each new conversation, Joinvoo matches the first message to the ad, and a mini app makes that match exact. Feed those messages to your ad platforms and let them find people who really want to talk.

DM tracking works with any Joinvoo account. [Create your account]({{SIGNUP}}), then follow step 9 in the {{GUIDE}}.
