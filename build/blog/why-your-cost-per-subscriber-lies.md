---
title: Why your cost per subscriber lies to you
slug: why-your-cost-per-subscriber-lies
description: A cheap cost per subscriber can be the most expensive number in your account. How fake and junk joins get in, why they poison optimisation, and how to read subscriber cost honestly.
author: Dchessking
date: 2026-09-29
featured: true
tags: [Fake joins, Analytics]
cover: why-your-cost-per-subscriber-lies.webp
reading_time: 6
---

> [!TAKEAWAYS]
> - Cost per subscriber only means something if every subscriber in the count is a real person who could become a customer.
> - Junk joins come from more places than bot farms: accidental taps, re-joiners, throwaway accounts and organic noise all get counted.
> - The real damage isn't the wasted money. It's that the ad platform learns from junk and goes looking for more of it.
> - Judge a channel by what happens *after* the join, and stop sending anything suspicious back to the platforms.

I've lost count of the times someone has sent me a screenshot of a gorgeous cost per subscriber and asked why the channel isn't making money. The number looks like a win. The bank account says otherwise.

Here's what I've learned from years of buying traffic into Telegram: cost per subscriber is the easiest number in this business to make look good, and the easiest one to be fooled by. Not because anyone is lying on purpose. Because the number counts things that aren't what you think they are.

## The number is a fraction, and both halves can be wrong

Cost per subscriber is spend divided by subscribers. Spend is usually accurate. Subscribers is where the trouble lives.

When your channel goes up by some amount during a campaign, that growth includes:

- **Real people from your ads** who chose to join and might read, click and buy.
- **Organic joins** from search, shares and old links, which have nothing to do with today's ads.
- **Accidental joins** from people who tapped through without meaning to and leave the same day.
- **Re-joiners**, the same person joining, leaving and joining again, counted every time.
- **Throwaway and fake accounts**, created in bulk, often joining in bursts, sometimes deleted within days.

Only the first group belongs in the number. If your "subscribers" count includes the rest, your cost per subscriber is flattering you.

> [!EXAMPLE]
> Hypothetical, to show the shape of it: two ad sets both report the same cost per subscriber. In ad set A, almost everyone is still in the channel a week later and some of them click the offer. In ad set B, a big share of the joins arrived in tight bursts from brand-new accounts and half of them are gone by the weekend. Same headline number. Completely different businesses.

## Where junk joins really come from

When people hear "fake joins" they imagine a bot farm. That's real, and it exists, but in my experience it's not even the biggest leak. The quieter ones add up.

### Placements that reward accidental taps

Some placements and formats produce clicks that aren't really intent. Someone scrolls, taps, Telegram opens, they hit Join out of reflex, and they're gone tomorrow. The platform counts a click, your channel counts a member, and neither is a customer.

### Incentivised and low-quality traffic sources

If you're buying from sources outside the big platforms, some of that traffic is junk by design. Once it hits your channel, it looks the same as everything else in a member count.

### Your own tracking

This one stings. If your tracker counts the same person twice, or counts organic joins as ad joins because they happened in the same hour, you're producing fake subscribers yourself. No bad actor required.

### Bots and account farms

And yes, the obvious one: automated accounts. They tend to have tells, such as joining in bursts, freshly created accounts, no profile, the same patterns over and over. A decent filter catches most of it. A member count catches none of it.

## The part nobody talks about: you're training the algorithm on it

Wasted spend is bad. What's worse is what happens when you send those joins back to Meta, TikTok or Snapchat as conversions.

The whole point of server-side tracking is to tell the platform "this is what a good result looks like, find me more". When a chunk of your "good results" are throwaway accounts and accidental taps, you're giving the algorithm a blurry, wrong picture. It does exactly what you asked: it finds more people who look like that. Cheap, fast, and worthless.

I've seen this loop make a campaign look *better* every day while the channel gets *worse*. Cost per subscriber goes down, engagement goes down, sales go down. The algorithm is winning the game you set up. You set up the wrong game.

That's why I'm strict about one rule: **a join that looks suspicious never gets sent to the ad platform.** Record it, so you can see it. Don't teach from it. If you want the mechanics of how server events shape optimisation, the Joinvoo team wrote a good explainer: {{POST:conversions-api-for-telegram-funnels-explained}}.

## How I read subscriber cost now

I still look at cost per subscriber. It's a useful early signal. I just never look at it alone. These are the questions I ask instead.

### What happened after the join?

Did they stay a day? A week? Did they click anything you posted? If you run a bot funnel, did they finish the onboarding? If you track sign-ups or deposits, did any of them convert? The further down you can measure, the less the top number can fool you. I wrote about this trade-off in {{POST:cost-per-ftd-vs-cost-per-join}}.

### How much of it came from the ads?

Separate ad joins from organic joins. If you can't, you don't know your cost per subscriber. You know your cost per "the channel got bigger while I was spending".

### What does the junk look like by ad?

Look at suspicious joins per ad set and per creative. When one creative pulls a lot more junk than the others, that tells you something about who it attracts. Sometimes the creative with the best cost per subscriber is the one I kill first.

### Is the pattern natural?

Real people trickle in. They join at different times, from different devices, and their accounts have history. Joins that arrive in perfect bursts, or all from fresh accounts, deserve a second look before you celebrate.

## What to do this week

You don't need to rebuild everything. Start here:

1. **Make every ad use a tracking link** that ties each join to a click. Without that, ad joins and organic joins blur together. The Joinvoo team's walkthrough is here: {{POST:how-to-track-telegram-channel-joins-from-meta-ads}}.
2. **Turn on fake-join filtering** and make sure filtered joins are *not* sent to the platforms.
3. **Add one quality metric** next to cost per subscriber: retention after a few days, or clicks to your offer, or sign-ups. Anything that happens after the join.
4. **Review by creative**, not just by ad set. The junk usually has a favourite creative.

Joinvoo does the first two out of the box: per-click invite links, a filter for bursts, deleted accounts and re-joiners, and only clean joins sent back to Meta, TikTok and Snapchat. The [setup guide]({{GUIDE}}) takes about ten minutes, and you can [start free]({{SIGNUP}}) with 500 joins included.

A cheap subscriber you can't sell to isn't cheap. Stop letting that number flatter you.
