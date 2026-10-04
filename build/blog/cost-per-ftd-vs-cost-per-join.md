---
title: "Cost per FTD vs cost per join: what you should actually optimise"
slug: cost-per-ftd-vs-cost-per-join
description: Optimise for joins and you get volume. Optimise for first deposits and you get buyers, if you have enough data. How to choose, when to switch, and how to run both without starving the algorithm.
author: Dchessking
date: 2026-08-19
tags: [Deposits, Analytics]
cover: cost-per-ftd-vs-cost-per-join.webp
reading_time: 5
---

> [!TAKEAWAYS]
> - Cost per join tells you how cheaply you fill the top of the funnel. Cost per FTD tells you whether the funnel makes money.
> - Optimising for the deeper event is usually better, but only once the ad set gets enough of those events to learn from.
> - The practical answer is a ladder: start on joins, prove the funnel converts, then move the winners to the deeper event.
> - Whatever you optimise for, judge performance on the deepest number you can measure.

Every media buyer running Telegram funnels hits the same fork in the road. Do you tell the ad platform to find you joins, or do you tell it to find you people who make a first deposit or purchase?

I've gone back and forth on this more than I'd like to admit. Here's where I've landed, and why the honest answer is "both, in the right order".

## Two numbers, two different questions

**Cost per join** answers: *how cheaply can I get people into my channel or bot?* It's fast feedback. You get lots of events, the algorithm learns quickly, and you can compare creatives within a day or two.

**Cost per FTD** (first-time deposit, or first purchase, depending on your offer) answers: *how much does it cost me to get a paying customer?* It's the number that decides whether you're in business. It's also slower and noisier, because far fewer people make it that far.

The trap is treating them as competing metrics. They measure different parts of the same funnel. A cheap join that never converts is worthless. An FTD you can't afford to buy at volume is also worthless. You need to see both.

## Why the deeper event is usually better

Ad platforms find more of whatever you reward. If you reward joins, the algorithm hunts for people who are likely to join. Joining a channel is cheap. It costs the user one tap. Lots of people will do it with no intention of ever buying anything.

If you reward first deposits, the algorithm hunts for people who are likely to pay. That's a much smaller, more valuable group, and the platform is surprisingly good at finding it once it has enough examples.

So in a world with unlimited data, I'd optimise for the deepest event every time.

## Why you can't always do it

We don't live in that world. Delivery systems need a steady flow of conversions per ad set to get out of the learning phase and stay stable. Meta's own guidance talks about roughly 50 optimisation events in a week for an ad set to exit learning, and the other platforms work on the same principle.

Joins happen often. First deposits happen far less often. If your ad set only sees a handful of FTDs a week, the algorithm is trying to find a pattern in almost nothing. It wanders, delivery gets erratic, costs swing, and you'll be tempted to kill something that might have worked with more data.

> [!EXAMPLE]
> Hypothetical: an ad set produces plenty of joins per day but only a few deposits per week. Optimising that ad set for `Purchase` gives the algorithm a few examples a week to learn from. Optimising it for `Subscribe` gives it many per day. Unless the budget can rise enough to produce a solid weekly volume of deposits, the join-optimised version will likely be more stable.

## The ladder I use

Rather than pick one forever, I move campaigns down the funnel as they earn it.

### Rung 1: Optimise for joins, measure everything

New offer, new creative, new platform: I optimise for real joins. Fake and suspicious joins are filtered and never sent to the platform, so it learns from real people only.

But I don't *judge* on cost per join. I track sign-ups and first deposits through postbacks from day one, so I can see which ads produce buyers even while optimising for joins. If you haven't set up postbacks yet, start with {{POST:postbacks-101-for-media-buyers}}.

### Rung 2: Prove the funnel converts

Once I can see that a campaign's joiners do convert, at a cost per FTD I can live with, I know two things: the offer works with this audience, and my channel or bot isn't the bottleneck.

If joins are cheap but FTDs never come, optimising deeper won't save it. The problem is the offer, the funnel or the audience. Fix that first.

### Rung 3: Move winners to the deeper event

When a campaign has enough FTD volume to feed the algorithm, I duplicate the winning setup into a new ad set optimised for `Purchase` (or the platform's equivalent), with the value attached. I leave the join-optimised version running while the new one learns, then shift budget towards whichever wins on cost per FTD.

I don't switch the optimisation event on a running ad set. That throws away what it has learned.

### Rung 4: Middle steps when the jump is too big

If FTD volume is too thin but join quality varies a lot, a middle event can help: a registration, a completed bot onboarding, a qualified lead. It happens more often than a deposit and says more than a join. It's a useful bridge.

## What to watch on each rung

| Rung | Optimise for | Judge on | Warning sign |
|---|---|---|---|
| 1 | Real joins | Cost per FTD, FTD rate | Cheap joins, zero FTDs after a fair test |
| 2 | Real joins | Cost per FTD vs your payout or margin | FTD rate falling as you scale |
| 3 | First deposit + value | Cost per FTD, ROAS | Erratic delivery: too few events |
| 4 | Middle event | Cost per FTD | Middle event that doesn't correlate with deposits |

The theme across every row: **optimise for what the platform can learn from, judge on what pays you.**

## The part people skip: the value

When you send a first deposit or sale, send the value with it. Platforms can use value to favour higher-value buyers, and you'll be able to read return on ad spend directly, not just cost per FTD. Two FTDs at the same cost can be very different businesses. I go into how I read ROAS, CPL and FTD rate together in {{POST:reading-your-numbers-roas-cpl-ftd-rate}}.

## Where this leaves you

If you're only looking at cost per join today, you're flying with half the instruments. Add deposit tracking, keep optimising for joins while you learn, and move your proven winners down the ladder.

Joinvoo tracks joins, bot starts, sign-ups, first deposits and sales, and sends each one to Meta, TikTok and Snapchat as the right event, with value. The {{GUIDE}} shows how to connect your postback. You can [start free]({{SIGNUP}}) with 500 joins, and every account gets a deposit-tracking trial.
