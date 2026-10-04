# Vertical: Education, Courses, Coaching and Info Products
> Use when: someone sells courses, coaching, paid communities, webinars or high-ticket programs and uses Telegram in the funnel: offer structures, webinar and call funnels, metrics, and compliance on income and results claims.

Info products include online courses, cohort programs, coaching, mentorships, paid Telegram communities and digital guides. Margins are high, so you can afford higher acquisition costs, but trust is the product. The biggest risk is misleading claims, especially about income. Rules of thumb only.

---

## 1. Offer structures

| Offer | Price level | Typical funnel |
|---|---|---|
| Lead magnet (free guide, mini course, checklist) | Free | Ad → bot → deliver → nurture |
| Low-ticket (ebook, template, starter course) | Low | Ad → channel/bot → checkout |
| Mid-ticket course | Medium | Ad → webinar or free training → checkout |
| Paid community / subscription | Recurring | Ad → free channel → paid private channel/group |
| High-ticket coaching / mentorship | High | Ad → content → application → call → close |
| Affiliate (selling others' courses) | Commission | Same funnels, with disclosure |

Telegram is useful at every level: delivery of lead magnets, reminders, community, private paid channels (access managed by a bot after payment), and fast answers to questions.

Joinvoo tracking: join/Start tracked from the ad; `lead` for lead magnet or application, `reg` for webinar registration, `sale` for purchases with value, `dep` for renewals. Telegram ID in sub1.

---

## 2. Funnels

### Lead magnet → nurture → offer
1. Ad promises a specific, useful free resource.
2. Bot delivers it instantly (track the Start).
3. Bot or channel nurtures with 3–7 messages over days: quick wins, a story, objections answered, then the offer. Tools like Castvoo can automate drips.
4. Offer with a clear deadline if one is real (cohort start, early-bird price).

### Webinar / live training funnel
1. Ad → registration (bot or page) → reminders in Telegram (day before, hour before, starting now).
2. Live or recorded session with real teaching and an offer at the end.
3. Replay for a limited time (if true), follow-up messages, Q&A.
4. Metrics: registration rate, show-up rate, purchase rate of attendees.

### High-ticket call funnel via Telegram
1. Ad → channel with strong educational content and case studies (real, consented, representative).
2. Application form or bot questionnaire: goals, current situation, budget, timeline. Filters out poor fits.
3. Book a call. Reminders in Telegram reduce no-shows.
4. Call with a trained closer; honest assessment of fit.
5. Payment link; onboarding into a private group.
6. Fast replies matter: an AI assistant such as Replyvoo can answer questions and book calls quickly, then hand off to a human.

### Paid community
- Free channel shows the value (sample lessons, community wins).
- Paid access via bot (subscription, auto-removal on non-payment).
- Retention: live sessions, fresh content, active admins.

---

## 3. Metrics

| Metric | Formula |
|---|---|
| Cost per lead (CPL) | spend ÷ leads |
| Lead→sale rate | sales ÷ leads |
| Webinar show-up rate | attendees ÷ registrants |
| Attendee→sale rate | sales ÷ attendees |
| Application→call booked | calls ÷ applications |
| Show rate (calls) | calls held ÷ calls booked |
| Close rate | sales ÷ calls held |
| Cost per call | spend ÷ calls held |
| Refund rate | refunds ÷ sales |
| Churn (subscriptions) | cancellations ÷ active members per period |

### Targets
- **Break-even CPA** = price (or first-payment value) − delivery cost − payment fees − expected refunds − commissions (closers, affiliates).
- **Target CPL** = target CPA × lead→sale rate.
- **High-ticket**: target cost per call held = target CPA × close rate.
- **Subscriptions**: use LTV = monthly price × average months retained (from your data) × margin.

### Diagnosis
- **Cheap leads, low sales**: lead magnet attracts freebie seekers; make it more specific to the paid offer.
- **Good registrations, low show-up**: weak reminders, wrong time slots; add Telegram reminders and calendar links.
- **Many calls, low close**: applications not filtering; poor fit; closer skill; offer price vs audience.
- **High refunds**: over-promising in ads or sales calls; product not delivering.

---

## 4. Compliance: income and results claims

Courses about making money (trading, affiliate marketing, e-commerce, freelancing) attract the strictest scrutiny.

- **No unrealistic income claims**: no "Make $10k a month", "Quit your job in 30 days", "Passive income on autopilot".
- **No typical-results implication**: if you show a student result, it must be real, consented, and you should state that results vary and that it is not typical when it is not.
- **No fake screenshots** of payments, dashboards or bank accounts.
- **No lifestyle bait**: luxury cars and cash imagery implying the course makes people rich.
- **No fake scarcity**: "Only 3 seats left" must be true.
- **Refund policy**: clear and honoured.
- **Disclosures**: affiliate relationships, paid testimonials, sponsored content.
- Platforms (Meta in particular) restrict "get rich quick" and deceptive business opportunity ads and can restrict accounts that run them. Some countries have specific consumer protection or business-opportunity rules. Check current policies.
- Trading or investing courses also fall under financial content rules: see vertical-trading.md.
- Health, fitness or nutrition courses: see vertical-nutra-health.md for claim rules.

### Compliant angles
- Skill-focused: "Learn to edit short-form videos in 7 days".
- Process: "The 5-step framework we use to plan a content calendar".
- Outcome without promise: "Build your first online store this weekend".
- Transparency: "What I wish I knew in my first year of freelancing".

---

## 5. Creative tips
- Teach something in the ad. Value-first creatives filter for learners and build trust.
- Founder or instructor talking to camera, in the audience's language.
- Show the course inside (real lessons, real community).
- Testimonials: real students, specific about the skill gained, not income bragging.

---

## 6. Common mistakes
1. Income claims and lifestyle imagery.
2. Lead magnets unrelated to the paid offer.
3. No reminders for webinars or calls.
4. Slow replies to inquiries.
5. Ignoring refund and churn rates when calculating profit.
6. No Telegram ID passed to the checkout, so sales cannot be attributed to ads.

---

## 7. Launch plan by offer type

### Low-ticket or lead magnet
1. Bot delivers the resource on Start (track Start in Joinvoo).
2. 3–7 day nurture sequence; offer on day 2–4.
3. `sale` postback with value and sub1 = Telegram ID from the checkout.
4. Judge ads on cost per sale after the nurture window, not on cost per Start.

### Webinar
1. Registration via bot (track Start and send `reg` postback on registration).
2. Reminders: day before, 1 hour before, at start (with link).
3. Offer at the end with a real deadline; replay for a limited time.
4. Measure show-up and attendee→sale by campaign; some ads bring registrants who never attend.

### High-ticket
1. Application questions that reflect your real fit criteria (budget, goal, timeline).
2. `lead` postback on application, `qualified` on booked call, `sale` on payment.
3. Judge campaigns on cost per qualified call and cost per sale. A campaign with expensive leads but a high close rate can be the best one.

### Paid community
1. Free channel → bot → subscription payment → bot adds to private channel.
2. `sale` on first payment, `dep` on renewals.
3. Optimise toward campaigns whose members renew.

## 8. Joe's quick answers
- "Can I show my students' results?" → Yes if they are real, consented, specific to the skill learned and not presented as typical. Add "results vary". Avoid income screenshots.
- "My leads are cheap but nobody buys." → Make the lead magnet a first step of the paid program, not a generic freebie; add proof of teaching quality; check the nurture sequence actually sends.
- "Should I run ads straight to the sales call?" → Usually only for warm audiences. Cold traffic converts better after content or a training that builds trust.
- "How do I lower refunds?" → Promise less, deliver more: align ads with the real curriculum, onboard students in a Telegram group, and check in during the first week.
