# Vertical: Sweepstakes, Local Services, Real Estate, B2B and Other
> Use when: someone asks about sweepstakes/CC submit offers, local service businesses, real estate, B2B lead gen or another vertical not covered by a dedicated playbook. A shorter overview with pointers to the core playbooks.

---

## 1. Sweepstakes and CC submits

### What they are
- **Sweepstakes / giveaways (SOI/DOI)**: the user enters an email or phone to "win" a prize (phone, gift card). Paid per entry.
- **CC submit**: the user enters card details, usually for a "trial" or small shipping fee, which often leads to recurring charges.

### Be clear about the risk
- These offers have a long history of misleading practices: fake prize claims ("You've won!"), impersonation of brands (phones, retailers, delivery companies), and hidden subscriptions.
- Meta, TikTok and Snapchat prohibit deceptive, misleading or "too good to be true" offers, impersonation of brands, and negative-option billing that is not clearly disclosed. Running classic CC submit flows usually leads to ad rejections, account restrictions and chargeback complaints.
- Consumer protection laws in many countries regulate sweepstakes (no purchase necessary, official rules, odds, eligibility) and recurring billing (clear disclosure, consent, easy cancellation).
- Joe does not help with fake "you've won" messages, brand impersonation, hidden billing or cloaking these offers.

### Compliant alternatives
- Real giveaways run by you or a brand with permission: official rules, real prizes, real winners announced, eligibility (18+, countries), no purchase necessary where required. Telegram channels can run these as community engagement (check Telegram and platform rules on contests).
- Lead gen offers with honest value exchange (a guide, a discount code, a real trial with clear terms).
- Trials only with prominent pricing, renewal terms and easy cancellation.

Metrics if you run a legitimate giveaway: cost per entry, entry→confirmation (DOI) rate, later engagement and conversion of entrants. Expect giveaway audiences to have lower intent; segment them.

---

## 2. Local services (clinics, salons, repair, cleaning, education centres, restaurants)

### Funnel
Ad (local radius) → Telegram channel or bot for booking/questions → booking or call → visit/sale.
- Bot: show services, prices, location, opening hours; take bookings; send reminders.
- Channel: offers, new services, before/after for non-health services (e.g. a car detail, a room renovation) are fine; for medical and cosmetic procedures, see the health rules in vertical-nutra-health.md.
- Fast replies drive bookings; an AI assistant such as Replyvoo can answer common questions and book.

### Targeting and creative
- Radius or city targeting (note: special ad categories restrict location targeting for housing, employment and credit/financial ads in some countries).
- Local language, real staff and premises, real prices.

### Metrics
- Cost per booking, show rate, booking→sale, average ticket, repeat visit rate.
- Break-even cost per booking = average profit per customer (first visit or LTV) × show rate × booking→sale rate.

---

## 3. Real estate

- **Policy**: in some countries (including the US), housing ads must use Meta's housing special ad category, which restricts targeting by age, gender and location radius, to prevent discrimination. Check the current rules for your country.
- **Funnel**: ad (property video, area guide) → Telegram channel with listings and updates → bot qualification (budget, area, timeline, buy/rent) → viewing booked → agent.
- **Content**: real listings, accurate prices and availability, video walk-throughs, area guides, financing explainers (credit rules apply if promoting loans/mortgages).
- **Metrics**: cost per qualified lead, viewing rate, viewing→offer, deal value, time to close (long; judge campaigns on qualified leads and viewings, not just closed deals).
- **Avoid**: discriminatory language (who "should" live somewhere), fake listings to collect leads, misleading investment return claims for off-plan property.

---

## 4. B2B

- **Funnel**: ad with a useful resource (template, report, tool, case study) → Telegram bot delivery or channel for industry updates → demo request or consultation → sale.
- Telegram is strong for B2B in industries and regions where professionals already use it (crypto, marketing, trading, tech communities). Elsewhere, Telegram may be one channel among several.
- **Targeting**: broad with a strong event, or interest/job-related targeting where available; lookalikes of customers.
- **Metrics**: cost per lead, lead→meeting, meeting→opportunity, win rate, deal value, sales cycle length. Long cycles mean you judge campaigns on qualified leads and meetings.
- **Joinvoo**: track joins/Starts; send `lead` and `qualified` postbacks from your CRM using the Telegram ID, `sale` with value when closed.

---

## 5. Other verticals: how to approach anything new

1. **Is it legal and advertisable?** Check the platform's policy for the product and country, and local law. If it needs authorisation (financial, gambling, crypto, dating, health), get it first.
2. **What is the paid event?** Map it to Joinvoo statuses (reg, lead, ftd, dep, sale, qualified, rejected) and pass sub1 = Telegram ID.
3. **What is the break-even?** Payout or margin per conversion × acceptance rate.
4. **Where does Telegram help?** Trust content, fast answers, reminders, retention.
5. **Which angles are honest?** Drop any claim you cannot prove.
6. Then follow campaign-fundamentals.md for structure, testing and scaling, and metrics-and-diagnosis.md for problems.
