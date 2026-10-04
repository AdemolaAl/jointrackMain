---
title: "Reading your numbers: ROAS, CPL and FTD rate without fooling yourself"
slug: reading-your-numbers-roas-cpl-ftd-rate
description: The handful of metrics that matter in a Telegram funnel, how they connect, and the traps that make good campaigns look bad and bad campaigns look good.
author: Dchessking
date: 2026-07-08
tags: [Analytics, Deposits]
cover: reading-your-numbers-roas-cpl-ftd-rate.webp
reading_time: 5
---

> [!TAKEAWAYS]
> - A Telegram funnel runs on a short chain: spend → clicks → joins → leads → first deposits → revenue. Every metric is a ratio between two links.
> - CPL tells you the cost of entry, FTD rate tells you the quality, and ROAS tells you whether it all pays.
> - The common traps: attribution windows, small samples, counting organic joins as paid, and comparing numbers from different sources.
> - Read numbers by cohort and over enough time. A campaign's revenue often arrives days after its spend.

Every buyer has a dashboard. Fewer have a way of reading it that survives a bad week. I've made decisions on numbers that looked obvious and turned out to be noise, and I've nearly killed campaigns that were quietly my best. This is how I read numbers now.

## The chain

Picture your funnel as a chain of counts:

**Spend → Clicks → Joins (or bot starts) → Leads / sign-ups → First deposits (FTDs) → Revenue**

Every useful metric is just one link divided by another. Once you see it that way, most confusion goes away.

| Metric | Formula | What it tells you |
|---|---|---|
| CPC | spend ÷ clicks | How expensive attention is |
| Click-to-join rate | joins ÷ clicks | How well your ad and landing flow convert intent |
| Cost per join | spend ÷ joins | The cost of getting someone into the funnel |
| CPL | spend ÷ leads | The cost of a sign-up or qualified lead |
| FTD rate | FTDs ÷ joins (or ÷ leads) | The quality of what you bought |
| Cost per FTD | spend ÷ FTDs | The cost of a paying customer |
| ROAS | revenue ÷ spend | Whether the whole thing pays |

A note on "lead": people use it loosely. In some funnels the join *is* the lead. In others, a lead is a sign-up on the offer side. Define it once for your team and stick to it, or every conversation about CPL turns into an argument about words.

## The three I watch most

### CPL (or cost per join): the cost of entry

This is the number that moves fastest and responds most to creative and targeting. It's where I compare creatives early in a test. But it says nothing about whether those people are worth anything. I treat it as a filter, not a verdict. I've written about why cheap entry costs can be misleading in {{POST:why-your-cost-per-subscriber-lies}}.

### FTD rate: the quality signal

FTD rate tells me what I'm actually buying. Two campaigns with the same CPL and very different FTD rates are completely different businesses. When FTD rate drops while CPL holds, that's usually the first warning that a campaign is reaching lower-quality people. It's often the first thing to slip during scaling.

Pick one denominator and stay consistent. I use FTDs per paid join for comparing ad sets, because it isolates the quality of the traffic from what happens in the offer's sign-up flow.

### ROAS: the verdict

Revenue divided by spend. Above 1, you're making back more than you spend (before your other costs). Below 1, you're paying to acquire. ROAS is the number that decides budgets.

But ROAS is also the number most likely to lie to you in the short term. Which brings me to the traps.

## The traps

### Trap 1: revenue arrives late

Spend happens today. Joins happen today. Deposits might happen today, tomorrow or next week, and repeat deposits happen for months. If you calculate yesterday's ROAS from yesterday's revenue, you're mixing yesterday's spend with revenue from people you bought last week.

The fix is **cohorts**: group people by the day (or week) they were acquired, and attach all their later revenue back to that day. A cohort's ROAS grows over time. Comparing two campaigns at the same cohort age is fair; comparing a two-day-old cohort to a two-week-old one isn't.

> [!EXAMPLE]
> Hypothetical: a campaign looks like it loses money on day one. A week later, as late first deposits and some repeat deposits come in for that same cohort, it's comfortably profitable. Judging it on day one would have killed a winner.

### Trap 2: small numbers

A handful of FTDs can swing cost per FTD enormously. One extra deposit can halve it. Before acting on a difference, ask how many events it's based on. If it's single digits, you're probably looking at noise. Wait for more data or pool similar ad sets.

### Trap 3: counting organic as paid

If your join count includes people who found your channel by search or a shared link, your cost per join looks better than it is and your FTD rate gets muddied. Every join should be labelled as from an ad or organic, based on whether it came through your tracking link. The Joinvoo team explains the setup in {{POST:how-to-track-telegram-channel-joins-from-meta-ads}}.

### Trap 4: comparing different sources

Ads Manager, your tracker and your offer's dashboard will never agree exactly. Ad platforms count events they can match to their users, within their attribution window, and deduplicate in their own way. Your tracker counts what it saw. Your network counts what it paid.

Pick one **source of truth per metric**, and know why the others differ. I use the ad platform for spend, my tracker for joins and attribution, and the network's postbacks for revenue. A *stable* gap between sources is normal. A *sudden change* in the gap means something broke, usually a token, a link or a postback.

### Trap 5: averages hide everything

An account-level ROAS can look fine while one campaign carries three losers. Always break down by campaign, then ad set, then creative. Good names make this possible; see {{POST:utm-naming-conventions-that-survive-scale}}.

## A simple weekly routine

This is roughly what I do once a week, with coffee and no distractions:

1. **Check tracking health first.** Are joins being sent to the platforms? Any token errors? Any postbacks failing? Bad data makes every other step pointless.
2. **Look at cohorts, not days.** How are last week's and the week before's cohorts doing on ROAS now?
3. **Break down by campaign and creative.** Which ones carry the account? Which ones drag it?
4. **Check FTD rate trends** on anything I scaled recently.
5. **Decide**: scale, hold, fix or kill. Write down why, so next week's me can check whether I was right.

## Getting the numbers in one place

All of this needs spend, joins and revenue lined up by campaign. In Joinvoo, you add spend per campaign (by hand or by importing a CSV from your ads manager), joins are tracked automatically, and revenue comes in through postbacks. The breakdowns then show cost per join, cost per FTD and ROAS side by side by campaign and platform. The {{GUIDE}} covers ad spend and postbacks.

Numbers don't lie, but they're very good at answering a different question from the one you asked. Read them in context. [Start free]({{SIGNUP}}) and see your full funnel, from click to first deposit, in one view.
