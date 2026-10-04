# Compliance and Account Health
> Use when: someone asks about ad policies for regulated verticals, authorisations, disclaimers, landing page or channel content rules, Account Quality, rejected ads, restricted accounts, appeals, cloaking or ban evasion, or data and privacy (hashing, consent).

Account health is a business asset. Losing a Business Manager, ad account, page or channel costs more than any single campaign earns. This playbook explains how to stay compliant and how to recover properly. Platform rules change: always tell users to check the current policy pages and their Account Quality / account status screens.

---

## 1. Regulated verticals at a glance (check current policies)

| Vertical | Meta (general) | TikTok (general) | Snapchat (general) |
|---|---|---|---|
| Online gambling, betting, casino, real-money lottery | Prior written permission; only in permitted countries; licensed advertisers; legal-age targeting | Generally prohibited; limited market-specific exceptions for approved licensed advertisers | Pre-approval, licence, approved countries, legal-age targeting |
| Crypto products/services | Prior written permission; eligibility usually via recognised licences or approval | Mostly prohibited; limited exceptions | Licensing and approval required |
| Financial services (trading, CFDs, investments) | Must not mislead; some products prohibited (e.g. binary options historically); advertiser verification required in a growing list of countries | Restricted by country; many products prohibited | Licensing and approval for many products |
| Credit, loans, financial products | Special ad category where applicable; some products prohibited (e.g. payday loans) | Restricted; some products prohibited | Restricted |
| Dating | Prior written permission; no sexual content | Restricted by market | Restricted; no sexual content |
| Adult content | Prohibited | Prohibited | Prohibited |
| Health, weight loss, supplements | No before/after, no personal attributes, no misleading claims; age restrictions; prescription drugs need certification | Similar or stricter | Similar or stricter |
| Housing, employment | Special ad categories in applicable countries | Market rules | Market rules |
| Social issues, elections, politics | Authorisation and "paid for by" disclaimers | Political ads prohibited | Political ads with rules and disclosures |

---

## 2. Authorisations

- **Where to apply**: each platform has an application or eligibility process for regulated verticals (for example Meta's forms for gambling, crypto and dating; financial services advertiser verification in specific countries; Snap's pre-approval for gambling and financial products).
- **What you usually need**: legal business details, licences from the relevant regulator or gaming authority, the countries you will target, the website/destination, and sometimes proof of your relationship with the licensed operator (for affiliates).
- **Affiliates**: ask the operator or program whether they can support an authorisation (licence copies, authorisation letters) for your business and ad account. Do not alter, borrow or fake documents.
- **Scope**: an authorisation covers specific accounts, countries and products. Running outside that scope is a violation.

---

## 3. Disclaimers and required messaging

| Vertical | Typical messaging (adapt to local rules) |
|---|---|
| Trading/investing | "Trading involves significant risk of loss. Only invest money you can afford to lose. Past performance is not a guarantee of future results." Licensed brokers often require specific regulator wording. |
| Crypto | "Crypto assets are volatile and you can lose all your money. Not financial advice." Safety notice about seed phrases and impersonators. |
| Gambling | "18+ (or legal age). Gamble responsibly. Set limits." Local helpline where required. |
| Health/supplements | "This product is not intended to diagnose, treat, cure or prevent any disease" style wording where local rules require it; "consult a healthcare professional". |
| Income/education | "Results vary. These results are not typical." where you show any outcome. |
| Affiliate/sponsored | Disclose affiliate links and paid partnerships. |

Put disclaimers where people see them: the ad (where space and rules require), the landing page, the Telegram channel description and pinned post, the welcome message, and regularly in posts.

---

## 4. Landing page and channel content rules

Platforms review the destination and the experience after the click, and users report what they see. Your Telegram channel or bot is part of the destination.

- The destination must match the ad: same product, same offer, same claims.
- No misleading claims, guaranteed profit or winnings, fake scarcity, fake reviews, fake endorsements or fake news formats.
- No impersonation of brands, public figures, media or government bodies.
- Working contact information and privacy policy where you collect data.
- No auto-redirects to unrelated or prohibited content.
- Clear pricing and terms for paid products; clear renewal terms for subscriptions.
- Respect age restrictions; do not use content that appeals mainly to minors.

---

## 5. Account Quality and prevention

### What platforms look at (general)
- History of rejected ads and policy violations.
- Payment history (failed payments, chargebacks, disputes).
- Business verification status and real identity of admins.
- Login security (unusual logins, compromised accounts).
- Links to previously restricted assets (people, pages, payment methods, domains).
- User feedback (hides, reports, negative comments, post-purchase complaints).

### Good habits
- Verify your business and use real identities with 2FA for every admin.
- Use one consistent, legitimate payment method per account in the business's name.
- Grow spend steadily.
- Review creatives against policy before submitting; when unsure, choose the safer wording.
- Fix rejected ads by changing them, not by resubmitting the same content repeatedly.
- Keep landing pages and channels honest and consistent with the ads.
- Monitor comments; reply to legitimate complaints; remove scam comments.
- Keep a backup Telegram channel (Joinvoo Backup channel) for continuity, not for evading Telegram enforcement.

---

## 6. Rejected ads and restricted accounts: what to do

### Rejected ad
1. Read the exact policy cited.
2. Identify the element: image, text, video, landing page, channel content, targeting.
3. Edit to remove the problem (see the compliant alternatives in each vertical playbook).
4. If you honestly believe it was a mistake, request a review once with a short explanation.
5. Do not resubmit unchanged copies; repeated rejections hurt account health.

### Restricted ad account, page or Business Manager
1. Check Account Quality (Meta) or the account status page (TikTok, Snap) for the reason.
2. Secure the account (change passwords, check admins, enable 2FA) if a hack is possible.
3. Complete any requested verification honestly.
4. Fix the underlying cause (remove violating ads, fix destination, obtain missing authorisations).
5. Submit one clear, honest appeal: what happened, what you changed, how you will prevent it.
6. Wait for the decision. If the restriction stands, accept it; you may contact platform support channels available to your account.

### What Joe will not help with
- **Cloaking**: showing reviewers a different page than users see. It is a serious policy violation, often leads to permanent bans for the people and businesses involved, and in some cases to legal action.
- **Ban evasion**: creating, buying or renting new accounts, pages or Business Managers to keep advertising after a restriction; using other people's identities; "farming" accounts.
- **Fake documents**: altered licences, IDs or business papers. This can be fraud.
- **Circumvention tricks**: misspelling banned words, hiding text in images, bait-and-switch destinations, using links that change after approval.
- **Fake reviews, fake earnings proof, deepfake endorsements.**
- **Targeting minors** with age-restricted offers.

When users ask for these, Joe explains the risk plainly (permanent bans across connected assets, loss of money, legal exposure, harm to users) and offers the compliant route: get authorisation, change the angle, choose an offer that can be advertised in that country, or use the vertical playbook's compliant alternatives.

Note on Joinvoo's own tracking link domain: Joinvoo uses a separate link domain to protect its main site's reputation. It does not hide or change what users see, and it is not a cloaking tool.

---

## 7. Data and privacy basics

### What Joinvoo sends
- Server events (joins, registrations, deposits, sales) with click IDs (fbc/ttclid/Snap click ID), browser ID (fbp) where available, IP address, user agent and a hashed Telegram ID as external_id. Only people who came from an ad are sent; organic joins are not.

### Hashing
- Personal identifiers such as email, phone and external IDs are normalised (trimmed, lower-cased) and hashed with SHA-256 before sending, as the platforms require. Hashing protects raw values in transit and storage while allowing matching.
- Never send sensitive data (health conditions, financial details, form answers) to ad platforms as event parameters or custom data.

### Consent
- Follow the privacy laws that apply to your users (for example rules on consent for tracking and marketing messages in many regions).
- Have a privacy policy that explains what you collect, why, and who you share it with (including ad platforms for measurement).
- Get consent where required before tracking or messaging; honour opt-outs and deletion requests.
- Bots and channels: tell users how their Telegram data is used; let them stop messages (/stop or block) and respect it.
- Do not collect more personal data than you need, and do not sell or share leads without consent.

### Security
- Protect access tokens (CAPI tokens, bot tokens, postback keys). Do not post them in chats or screenshots. Rotate them if exposed.
- Limit who has admin rights on channels, bots and ad accounts.

---

## 8. Quick compliance checklist before launch
1. Is the product legal in the target country and advertisable on this platform?
2. Do you have the required authorisation/permission/verification?
3. Age targeting correct (18+ or higher where required)?
4. Ad copy free of guarantees, personal attributes, fake proof, impersonation?
5. Destination (page, channel, bot) matches the ad and includes disclaimers?
6. Special ad category declared where required?
7. Privacy policy and consent in place for data collection and messaging?
8. Backup channel prepared; admins on 2FA; tokens secured?
