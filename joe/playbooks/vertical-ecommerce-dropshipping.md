# Vertical: E-commerce and Dropshipping
> Use when: someone sells physical or digital products and uses Telegram as a store, community or retention channel: offers, AOV, break-even and target ROAS from margin, creative testing, retention and how to track sales in Joinvoo.

E-commerce is less regulated than finance or gambling, so success depends mostly on product, creative and unit economics. Telegram works well as a community and retention channel (drops, restocks, VIP offers) and, in many markets, as a direct sales channel through chat. Rules of thumb only; calculate with your own costs.

---

## 1. Business models

| Model | How it works | Notes |
|---|---|---|
| Own brand / stock | You buy inventory and ship | Best margins and control; cash tied in stock |
| Dropshipping | Supplier ships directly | Low upfront cost; slower delivery, quality control risk, thin margins |
| Print on demand | Products made per order | Good for niches and designs |
| Digital products | Templates, presets, ebooks | Near-zero delivery cost; refund policy matters |
| Telegram-native shop | Catalogue in channel, orders via bot or DM, payment link or cash on delivery | Strong in markets where people buy via chat |

---

## 2. Unit economics: AOV, margin and ROAS targets

### Core definitions
- **AOV (average order value)** = revenue ÷ orders.
- **Contribution margin (before ads)** = AOV − product cost − shipping − payment fees − packaging − expected returns/refunds − platform/app fees.
- **Margin %** = contribution margin ÷ AOV.

### Break-even and target ROAS
- **Break-even ROAS** = 1 ÷ margin %. Example method: if margin before ads is 40% of AOV, break-even ROAS = 1 ÷ 0.40 = 2.5.
- **Break-even CPA (cost per order)** = contribution margin per order.
- **Target CPA** = break-even CPA × (1 − desired profit share), or set a target ROAS above break-even.
- **First-order vs LTV**: if customers reorder, you can accept a lower first-order ROAS. Only do this when you have real repeat-purchase data, and set a payback window you can afford.

### Raising AOV
- Bundles ("buy 2 get 10% off"), quantity breaks.
- Free shipping threshold above current AOV.
- Post-purchase upsells in the bot or thank-you page.
- Complementary products in the same order.

---

## 3. Telegram as a store or community

### Channel as a store
- Pinned post: what you sell, prices, delivery areas and times, payment methods, returns policy, how to order.
- Product posts: real photos/videos, price, sizes/variants, stock status, order button (bot deep link with product code, e.g. `start=sku123`).
- Order handling via bot (collect variant, address, phone, payment) or human/AI chat (Replyvoo can answer product questions and send payment links quickly).

### Channel as a community
- Behind the scenes, new arrivals, styling tips, user photos (with permission), polls on next products.
- VIP / early access drops for channel members.
- Restock alerts.

### Tracking sales in Joinvoo
- Use the Joinvoo tracking link in ads so joins/Starts are attributed.
- When an order is paid, send a `sale` postback with sub1 = Telegram ID and the value (from your store, bot or tracker). Joinvoo sends it to Meta/TikTok/Snap as Purchase with value, so you can optimise for purchases and see ROAS per campaign/ad.
- If orders happen in a web store, pass the Telegram ID into the store link (bot or request-to-join welcome message) so the store can report it back.

---

## 4. Creative testing for products

### What works
- **Demonstration**: show the product solving a problem in the first seconds.
- **UGC**: real customers or creators unboxing and using it (with consent and disclosure).
- **Comparison**: before using vs after using the product for non-health items (a cleaning tool, an organiser) is fine; for health/beauty, see vertical-nutra-health.md for rules.
- **Offer clarity**: price, discount, delivery time on screen.
- **Social proof**: real reviews only.

### Testing approach
- Test products first with a few creatives each (product-market fit), then test creatives on winning products.
- 3–5 concepts per product, each with 2–3 hooks.
- Kill rule of thumb: spent about 1.5–2× break-even CPA with no purchase → kill or rework; at 2–3× with weak CTR → kill.
- Iterate winners: new hooks, new creators, new first frames.

### Platform fit
- TikTok: trend-driven, impulse products, creator-led video; creative fatigue is fast.
- Meta: broad reach, catalogue/Advantage+ sales campaigns, retargeting.
- Snapchat: younger audience; fun, fast, vertical content.

---

## 5. Retention

Retention is where Telegram shines: you own the channel and bot audience.
- **Post-purchase**: order confirmation, shipping updates, delivery confirmation, usage tips.
- **Reviews**: ask for honest feedback; never fake reviews.
- **Repeat purchase**: replenishment reminders for consumables; new arrivals; member-only offers.
- **Win-back**: inactive customers get a reason to return (new product, real discount).
- **Broadcasts and drips**: tools like Castvoo can send segmented messages to bot users. Respect opt-out and Telegram's anti-spam rules.

Metrics:
- Repeat purchase rate = customers with 2+ orders ÷ customers.
- LTV (over a window, e.g. 90 days) = total contribution margin from a cohort ÷ customers in cohort.
- Use LTV to set how much you can pay for the first order.

---

## 6. Policies and trust
- No counterfeit or replica goods, no restricted products (weapons, drugs, some supplements, adult products per platform rules).
- Accurate claims, real prices, real discounts (no fake "was" prices), honest delivery times.
- Clear returns and refund policy; platforms track customer feedback (Meta's customer feedback score can limit delivery if complaints are high).
- Real reviews and real photos only.
- Dropshipping with long delivery times needs clear communication; late or missing orders cause complaints and chargebacks.

---

## 7. Metrics and diagnosis

| Metric | Formula | Read |
|---|---|---|
| CTR | clicks ÷ impressions | Creative interest |
| Click→join/Start | joins or Starts ÷ clicks | Channel/bot match with ad |
| Conversion rate | orders ÷ joins (or sessions) | Offer, price, trust |
| CPA | spend ÷ orders | Compare with break-even CPA |
| ROAS | revenue ÷ spend | Compare with break-even ROAS |
| Refund/return rate | refunds ÷ orders | Product quality, expectation match |

Diagnosis:
- **High CTR, low conversion**: price shock, missing info (delivery, sizes), no trust signals, slow replies.
- **Good conversion, low ROAS**: low AOV; add bundles and upsells.
- **Good ROAS on platform, poor real profit**: refunds, returns, shipping costs not included; recalculate margin.
- **Strong start, sudden drop**: creative fatigue or saturation of a niche product; new creatives and audiences.

---

## 8. Common mistakes
1. Not knowing the break-even ROAS before launching.
2. Ignoring refunds, shipping and fees in margin.
3. Testing too many products with too little budget each.
4. Slow order handling in chat.
5. Fake reviews and fake discounts.
6. No retention plan for the Telegram audience you paid to acquire.
7. Not sending sale events with values, so the platform cannot optimise for purchases.

---

## 9. Launch plan for a Telegram-assisted store

1. **Before spend**: calculate margin, break-even ROAS and break-even CPA per product. Set up the channel (pinned post with prices, delivery, returns), the order bot or chat, and `sale` postbacks with value and sub1 = Telegram ID.
2. **Days 1–3**: 2–3 products × 3 creatives each, broad targeting in the delivery area, optimise for join/Start. Watch CTR and click→join.
3. **Days 4–7**: kill products whose best creative cannot get under about 1.5–2× break-even CPA; iterate hooks on the winners.
4. **Week 2**: when purchases reach a steady flow per ad set, test Purchase optimisation; build lookalikes from buyers; start retargeting channel members who have not bought.
5. **Ongoing**: weekly creative refresh, monthly margin review (supplier prices, shipping, refunds).

### Offer ideas that lift conversion honestly
- Bundle pricing and free shipping thresholds.
- Channel-member-only discount codes (real, time-bound).
- Cash on delivery where it is common and the courier supports it (watch refusal rates, like buyout in nutra).
- Clear guarantee or returns policy you actually honour.

### Joe's quick answers
- "My ROAS on the platform looks fine but I'm losing money." → Recalculate margin with shipping, fees, refunds and returns; use Joinvoo revenue from `sale` postbacks with real values; compare with break-even ROAS.
- "Which platform first?" → Where your buyers are and where the creative style fits: impulse, trend products often start well on TikTok; broad products and retargeting on Meta; younger audiences on Snapchat.
- "How many creatives do I need?" → Enough to replace fatigued ones before results drop; rule of thumb, have new variations ready every week for any product you are scaling.

### Inventory and operations
- Scaling ads faster than stock or courier capacity causes delays, complaints and refunds, which hurt account feedback scores. Check stock and delivery capacity before raising budgets.
- Track order-to-delivery time; long delays drive chargebacks.
