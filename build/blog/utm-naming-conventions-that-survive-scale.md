---
title: UTM naming conventions that survive scale
slug: utm-naming-conventions-that-survive-scale
description: A naming system for campaigns, ad sets and ads that stays readable at hundreds of ads, works across Meta, TikTok and Snapchat, and makes your Telegram join and deposit reports actually useful.
author: Joinvoo Team
date: 2026-07-15
tags: [Analytics, Scaling]
cover: utm-naming-conventions-that-survive-scale.webp
reading_time: 5
---

> [!TAKEAWAYS]
> - Your reports can only group what your names make groupable. Naming is a reporting decision, not a tidiness habit.
> - Use a fixed order of short, lowercase tokens separated by one delimiter, the same on every platform.
> - Let the ad platform fill names in with dynamic macros, so a join always carries the campaign, ad set and ad it came from.
> - Write the convention down, and keep a lookup for anything you'd otherwise cram into a name.

When you have five ads, names don't matter. You remember what everything is. When you have three platforms, a dozen campaigns and a few hundred ads across creative tests, names are the only thing standing between you and a spreadsheet nobody can read.

In a Telegram funnel this matters even more, because every join and deposit your tracker records carries the names that were on the ad at the moment of the click. If those names are a mess, every report built on them is a mess.

## How names flow into your reports

When you put dynamic parameters in your ad's URL, the platform swaps in the real names at click time:

```
utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}
```

That's Meta's syntax. TikTok and Snapchat have their own macros for the same idea; see {{POST:tiktok-ads-to-telegram-full-setup}} and {{POST:snapchat-ads-for-telegram-channels}}. Your tracker stores those values with the click, and later with the join and any deposit. So the name of your ad at click time becomes a permanent label on that person.

Which means: if you want to compare all your video hooks, or all your lookalike audiences, or all your campaigns in one geo, the names have to make that possible.

## The rules that matter

### 1. Fixed order

Every name follows the same sequence of tokens. If the geo is first in one campaign and third in another, you can't sort or filter reliably.

### 2. One delimiter

Pick one separator and never use it inside a token. Underscore is a safe choice, since it survives URLs without encoding and reads cleanly. Avoid spaces, which become `%20` or `+` in URLs and break splitting.

### 3. Lowercase, short, no special characters

`broad` not `Broad Audience (new!)`. Short tokens keep names readable in narrow report columns and avoid encoding surprises.

### 4. A fixed vocabulary

Decide the allowed values for each token and write them down. `lal`, `lookalike`, `LAL1` and `lla` should not all exist in the same account.

### 5. Version, don't rename

When you change a creative meaningfully, give it a new version (`v2`). Don't rename the old ad. Renaming rewrites history for every click that happens *after* the rename and splits your data in two.

## A convention you can steal

Here's a structure that works for most Telegram funnels. Adapt the tokens, keep the discipline.

**Campaign:** `platform_geo_objective_offer_v`

```
meta_geo1_subs_dealsch_v1
tt_geo2_ftd_appoffer_v3
```

**Ad set:** `audience_placement_bid_v`

```
broad_auto_lowcost_v1
lal2_reels_costcap_v2
int-fitness_feeds_lowcost_v1
```

**Ad:** `format_concept_hook_v`

```
vid_preview_hookA_v1
vid_preview_hookB_v1
img_listicle_hookA_v2
```

Notice what that makes possible. Want every `hookB` across all campaigns? Filter ads containing `_hookB_`. Want every `geo2` campaign? Filter campaigns on the second token. Want to know whether `preview` videos beat `listicle` images? Group ads by the second token.

> [!NOTE]
> Use placeholder geo codes (`geo1`, `geo2`) or standard country codes, whatever your team prefers. The point is a short, consistent code, not a full country name that someone will eventually spell differently.

## Keep a lookup table for the rest

Names should identify things, not describe them. When you're tempted to cram the full hook text, the audience definition and the launch date into a name, stop. Put those in a simple sheet keyed by the name instead:

| Ad name | Hook text | Creator | Launched |
|---|---|---|---|
| `vid_preview_hookA_v1` | "This channel posts deals before anyone else" | in-house | week 1 |
| `vid_preview_hookB_v1` | "Stop paying full price for…" | in-house | week 1 |

Your reports stay readable. Your notes stay complete.

## Names vs IDs

Every platform also offers ID macros (campaign ID, ad set ID, ad ID). IDs never change, even if someone renames an ad, which makes them the most reliable join key. Names are what humans read.

The best of both: send names in your UTMs for readable reports, and keep a way to map IDs to names (most ad platforms' exports include both). If a report ever looks odd after someone renamed something mid-flight, IDs are how you untangle it.

## Matching spend to results

Here's where naming pays for itself. To calculate cost per join, cost per FTD and ROAS by campaign, your tracker needs to line up **spend** (from the ad platform) with **results** (joins and deposits from your tracker). The easiest key is the campaign name.

In Joinvoo's ad spend view, you add spend per campaign, or import it as a CSV export from your ads manager, using the same campaign names as your UTMs. If the names match exactly, breakdowns light up. If someone wrote `Meta_Geo1_Subs` in one place and `meta_geo1_subs` in the other, they won't. Consistency is the whole game. We cover the metrics themselves in {{POST:reading-your-numbers-roas-cpl-ftd-rate}}.

## Rolling it out to a team

A naming convention fails the first time someone is in a hurry. A few habits help:

- **Write it down in one place** with examples, and link it in your team chat.
- **Use templates.** Duplicate a correctly named campaign instead of starting fresh.
- **Review names during launch checks**, the same way you check budgets and links.
- **Fix mistakes fast.** If a wrong name went live, duplicate with the right name and pause the wrong one, rather than renaming it.

## Recap

Fixed order, one delimiter, lowercase, fixed vocabulary, versions instead of renames. Dynamic macros in the URL so every join and deposit carries its campaign, ad set and ad. A lookup sheet for everything else.

Set up your tracking link with the right URL parameters using the {{GUIDE}}, or [start free]({{SIGNUP}}) and see every join labelled with the ad that drove it.
