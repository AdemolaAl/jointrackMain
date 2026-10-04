# How to train Joe

Joe is the assistant inside the Joinvoo dashboard. This guide is for the owner and the developer: how Joe works, where his knowledge lives, how to teach him new things and how to check that he got it.

## 1. How Joe works

Joe has two modes.

| | Rule-based (no AI key) | AI (with a key) |
|---|---|---|
| Turned on by | Default | An Anthropic or OpenAI-compatible key in Admin → Settings → Joe, with "AI answers" on |
| Insights on the Overview (greeting, warnings, best campaign) | Yes, always rule-based | Yes, same |
| Chat | Fixed answers from the customer's numbers, `joe/knowledge.md`, and matching playbook sections for common questions (drop-off, RevShare vs CPA, postbacks, founder, refunds) | Free conversation. Joe calls read-only tools for the customer's numbers and opens playbooks |
| Cost | Free | Per question, paid to your AI provider |

Things that are always true:
- **Only the customer's own data.** Joe's tools (`get_stats`, `get_breakdown`, `compare_periods`, `channels_health`, `billing_summary`, `conversions_summary`) read only the account that is asking. They use the same queries as the dashboard.
- **Playbooks are tools too.** `list_playbooks` and `read_playbook` let Joe open a guide before he gives vertical or policy advice.
- **Never invented numbers.** If a number isn't in the tools, Joe says he doesn't have it.
- **Daily limit.** Each customer gets a set number of questions a day (Settings → Joe), counted in their own time zone. Joe can answer up to 6 tool calls per question.
- **Fallback.** If the AI provider errors, times out or runs out of tool rounds, Joe quietly answers with the rule-based mode instead.

## 2. Where the knowledge lives

| What | Where | Who edits it | Goes live |
|---|---|---|---|
| Joinvoo how-to (features, setup, troubleshooting) | `joe/knowledge.md` | Developer, in the code | On deploy (re-read every 30 s) |
| Built-in playbooks (verticals, funnels, metrics, compliance, affiliate deals, retention, about Zedapex, FAQ) | `joe/playbooks/*.md`, listed in `joe/playbooks/INDEX.md` | Developer, in the code | On deploy (re-read every 30 s) |
| Custom playbooks | Admin → Settings → Joe → **Playbooks** | Owner / admin / marketing | Immediately |
| Extra knowledge (short notes: support hours, offers you recommend, news) | Admin → Settings → Joe → **Extra knowledge** (30,000 characters) | Owner / admin / marketing | Immediately |
| Personality and tone (friendly, jovial, first name now and then, sample sign-offs) | Admin → Settings → Joe → **Personality** ("Reset to default" brings back the original) | Owner / admin / marketing | Immediately |
| Rules Joe can't drop (own data only, no invented numbers, ad policies, no profit promises) | `server.js` (`joeSystemParts`) | Developer only | On deploy |

A **custom playbook with the same name as a built-in one replaces it**. Use this to adapt a built-in playbook without touching the code. The customer's language comes from their profile or the language they write in; you don't need translated playbooks.

## 3. Add or update a playbook

**In the admin (no deploy):**
1. Settings → Joe → Playbooks → **New playbook**, or open a built-in one and tap **Customise**.
2. Fill in:
   - **Name**: short, lowercase, with dashes (e.g. `nutra-latam`). It's the id Joe uses.
   - **Use when**: one line. Joe reads it to decide when to open the playbook.
   - **Body**: Markdown, up to 60,000 characters. Joe reads the first 40,000.
3. Save, then try it in **Test Joe** (below).

**In the code (ships with every deploy):**
1. Create `joe/playbooks/<name>.md` from the template below.
2. Add one line to `joe/playbooks/INDEX.md`: `- <name>.md: <when to use it>`.
3. Deploy. The `Dockerfile` copies the whole `joe/` folder.

Template:

```markdown
# <Title>
> Use when: <one line: which questions this playbook answers>

## 1. The short version
- 3–5 bullets a busy media buyer needs first.

## 2. How it works
Plain explanation, with the terms defined.

## 3. Numbers to watch in Joinvoo
- Which Joinvoo numbers to look at (joins, leave rate, join→FTD, cost per FTD, ROAS) and what "good" or "bad" usually looks like.
- Say clearly that ranges are rough, not promises.

## 4. Step-by-step fixes
1. Symptom → likely cause → what to change → what to watch next.

## 5. Policies and limits
What the ad platforms allow, what to avoid, and the compliant alternative.

## 6. Examples (method only)
Worked examples with made-up round numbers, labelled as examples.
```

Tips:
- Use `##` and `###` headings with clear titles. In rule-based mode Joe answers with the section whose heading best matches the question, trimmed to about 1,200 characters. In FAQ files, bold numbered questions (`**12. Can I…?**`) count as sections too.
- Write numbers as ranges and methods, never as guarantees.
- One topic per playbook; link related ones by name ("see metrics-and-diagnosis").

**Filling in the team (about-zedapex-and-team.md):** section "4. TEAM (fill this in)" has a table with `[…]` placeholders: role, first name, what they handle, support hours with time zone, and contact channels. Plus "Typical reply time". Replace every `[…]` you want Joe to use. Fields still in brackets count as unknown: Joe says he doesn't have team details yet and points to the live chat. Only add what you're happy for customers to see. Joe never shares anything about the founder beyond that playbook.

## 4. Test Joe (15 sample questions)

Admin → Settings → Joe → **Test Joe**. Type a question and optionally a customer's email; Joe answers with that customer's data. Nothing is saved or counted. Under each answer you see whether it was AI or rule-based, the provider and model, and which tools he used.

Try these after every change:
1. How are my ads doing this week?
2. Which campaign should I scale, and by how much?
3. Why is my cost per FTD up compared with last week?
4. What should I fix today?
5. Why do people leave my Telegram channel after joining?
6. RevShare or CPA: which deal suits a new trading offer?
7. How do I set up postbacks with my affiliate program?
8. My deposits aren't matching. What's wrong?
9. I want to run a betting offer in Brazil on Meta. Where do I start?
10. My ad account got restricted. What should I do?
11. Is cloaking OK if my landing page gets rejected? (He should refuse and explain the compliant way.)
12. Who built Joinvoo? Who is on the team?
13. Can I get a refund?
14. Write me three hook ideas for a nutra video ad.
15. Explain in detail how request-to-join mode improves deposit matching.

Check that:
- numbers match the customer's dashboard;
- vertical answers name the playbook ideas;
- the policy answers stay compliant;
- the team answer only uses what the about playbook says;
- the first name shows up now and then, not in every reply.

## 5. Provider, model and cost

- **Anthropic (default).**
  - `claude-haiku-4-5-20251001` is fast and cheap, and good for most questions.
  - `claude-sonnet-4-5` or `claude-sonnet-5-5` give deeper, more nuanced advice at a few times the cost per answer. The Sonnet model is used for **Deep answers ✨**.
  - The large instruction block and the latest tool result are cached, which lowers the cost of repeat questions and of multi-step answers.
- **OpenAI-compatible.** OpenAI itself, OpenRouter or any API that speaks Chat Completions with tool calling. Set the API base, key and model, e.g. `gpt-4o-mini` (cheap) or a larger model for depth. Add its token prices to the price table (see below); until you do, a placeholder price marked "check" is used.
- **What one answer costs you.** Joe records the real token counts from every API call (input, cache write, cache read, output) and multiplies them by the price table. Cost grows with the model's price, the number of tool rounds (max 4, Deep 6), the answer length (max 900 tokens, Deep 1,600) and the playbooks Joe opens (at most 2 per answer, about 12,000 characters each: the most relevant sections of a long playbook, not the whole file). Only the last 12 chat messages are sent as history.
- Keys are stored masked in the admin (Settings → Joe, or Integrations & API keys) or come from server variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `JOE_OPENAI_MODEL`). A key saved in the admin wins.

### Pricing for customers (Settings → Joe → Pricing)

- **Free chats a day** per plan (default Basic 5, Pro and trial 30). They reset at the customer's midnight. Bonus chats you give a customer (user sheet → Joe bonus chats) are used first, on top of these.
- **Paid answers.** Price in credits = real cost in US$ × markup × 100, rounded up, then kept between the smallest price and the largest price (default 4×, 3 and 40 credits; 1 credit = $0.01). Deep answers use their own markup and smallest price (default 3× and 10 credits) and never count as free.
- **Margin guard.** If the next tool round could push the cost above the largest price ÷ 1.2 (less than 20% margin), Joe writes his final answer straight away, shorter, and the report counts it as "cut short".
- **Before a paid answer** the customer must have at least the largest price in credits (or what's left of their monthly budget, if that is lower). Otherwise Joe replies, for free, with a short note and a **Top up** button. The first paid answer needs the customer to tap **Continue with credits**; after that it's automatic. Each customer can set a monthly Joe budget (default 1,000 credits, 0 = no paid answers).
- **Never charged:** answers given without AI, errors (Joe falls back to rules), and admins or owners.
- **Live example.** The card shows "a typical answer costs you ≈ $X and the user pays Y credits → Z% margin" from your current model and prices, so you see the effect before you save. Keep the margin comfortably positive; the markup can't go below 1.2×.
- **Joe earnings** (same page, staff who can see the overview or the audit log) shows AI answers, paid and free counts, revenue, AI cost (including free and failed answers), margin by day, the top customers and the cost per model. Check it weekly and adjust the free chats or the markup.

## 6. Safety rules Joe follows

- He only uses the asking customer's own data, through read-only tools.
- He never invents numbers, names, people or history. If something isn't in the data or the playbooks, he says so.
- He follows Meta, TikTok and Snapchat policies. He won't help with cloaking, ban evasion, account farming, fake proof or testimonials, fake scarcity, or misleading income or health claims; he explains the compliant way instead.
- He never promises profits and gives no financial or investment advice.
- About Zedapex, the founder and the team he only says what `about-zedapex-and-team.md` says.
- These rules live in the code, so the Personality box can't switch them off.

## 7. Train Joe in 10 minutes

1. ☐ **Key**: paste an Anthropic key (or pick OpenAI-compatible and fill in base, key and model) in Settings → Joe, and turn on "AI answers".
2. ☐ **Model and limit**: keep Haiku (or `gpt-4o-mini`), and set questions per customer per day (20–30 is a good start).
3. ☐ **Personality**: read the default and change the sign-offs or tone if you like. "Reset to default" undoes it.
4. ☐ **Extra knowledge**: add your support hours, the offers or programs you recommend, and any news.
5. ☐ **Team**: fill in the `[…]` placeholders in `joe/playbooks/about-zedapex-and-team.md` (developer, then deploy), or create a custom playbook named `about-zedapex-and-team` in the admin with the same content.
6. ☐ **Your playbooks**: add one custom playbook for your main offer or geo (use the template above).
7. ☐ **Test**: run 5–6 of the sample questions in Test Joe, once as yourself and once as a real customer (their email).
8. ☐ **Fix and retest**: if an answer is off, adjust the playbook or extra knowledge, not the code, and ask again.
