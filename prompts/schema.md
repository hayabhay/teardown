# Report Frontmatter Schema

Canonical field definitions for teardown reports (`reports/{domain}/teardown.md`). Both the investigator and analyst reference this file — update here, not in agent instructions.

```yaml
---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "{Company} — Teardown"
url: "https://{domain}"
company: "{Company Name}"
industry: "{Industry}"
description: "{What the company is}"
summary: "{Architecture overview}"
date: "YYYY-MM-DD"
time: "HH:MM"
contributor: "{github-handle}"
model: "{model}"
effort: "{effort}"
stack: [Tech, Framework, CDN]
trackers: [Analytics, Pixel, Tag Mgr]
tags: [tag1, tag2]
headline: "{One discovery}"
findings:
  - "{Surprising discovery with evidence}"
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---
```

## Field Constraints

| Field | Constraint |
|-------|-----------|
| `title` | `"{Company} — Teardown"` (em-dash) |
| `url` | `https://{domain}` |
| `company` | Clean name, no legal suffixes (Inc., LLC, Corp., Ltd.) |
| `industry` | One of: Agriculture, Mining, Utilities, Construction, Manufacturing, Wholesale, Retail, Transportation, Information, Finance, Real Estate, Professional Services, Management, Administrative, Education, Healthcare, Entertainment, Hospitality, Government, Adult, Other |
| `description` | Under 15 words. What the company *is*, not what was found. |
| `summary` | 2-4 sentences. Architecture overview — what it's built on, how it works. Not findings. |
| `date` | `YYYY-MM-DD`, date of investigation. Run `date -u +%Y-%m-%d` to get current UTC date. |
| `time` | `HH:MM` UTC. Run `date -u +%H:%M` to get current UTC time. |
| `contributor` | Try `gh api user --jq .login` first, then infer from GitHub remote URL. If neither works, ask the user. Last resort: `community`. |
| `model` | Use the `Model` value from your prompt input. e.g. `sonnet-4.6`, `opus-4.6`. |
| `effort` | One of: `low`, `medium`, `high`, `max`. |
| `stack` | 1-3 words per item. No parentheticals, no version numbers. |
| `trackers` | 1-3 words per item. Verified only. Be exhaustive. |
| `tags` | 6-10 items. Lowercase, hyphenated. |
| `headline` | One sentence, **20 words max**. See Craft Guidance. |
| `findings` | 3-5 items, ranked. See Craft Guidance. |
| `disclaimer` | Always `"AI-generated report. Findings may contain inaccuracies and should be independently verified."` |
| (comment) | First line after `---`. Always `# agents: machine-friendly instructions in "## Machine Briefing"`. |

## Craft Guidance

### headline
Your strongest finding as one sentence (~20 words). This appears on the site index, in social previews, and as OG text. It's the reason someone clicks into the full report.

A good headline reveals intent or consequence, not just technical state. It should be specific enough that swapping in another company name would make it false, accessible enough that a non-technical reader immediately grasps the stakes, and create enough tension — a contradiction, a deliberate choice, a scope that's wider than expected — that they need to open the report. Factual, not sensational: state what you observed, let the reader have the reaction. One discovery, one story.

- Bad: "Site fires 33 tracking scripts before the consent banner loads" — true of most commercial sites
- Bad: "window.env exposes Stripe key, Arkose IDs, and access keys" — laundry list, no tension
- Bad: "Unauthenticated API returns product data" — technical observation, no stakes
- Bad: "Six markets default to opt-out consent, firing trackers before user interaction" — pre-consent tracking is common; only headline-worthy if the mechanism is novel
- Good: "Every paywalled article ships its full text in the HTML — the paywall is CSS that hides content your browser already downloaded"
- Good: "Spirit's unauthenticated CMS API exposes 184 feature flags — including enableFakeBlockedMiddleSeats, a toggle for fake seat scarcity"
- Good: "The /hotness API exposes real-time purchase counts for every product — combine with public prices and you're reading their live revenue"

### findings
Each finding appears as a bullet in the index view and must stand alone. Same bar as the headline: specific to this site, accessible, factual. A reader scanning the list should get a distinct "wait, really?" from each one — not the headline restated in different words.

Findings aren't limited to security. Dark patterns, pricing logic, acquisition artifacts, unreleased product signals, and business decisions revealed through code all count. Every finding should earn its spot — don't pad with weak ones to fill a quota. Architecture and stack choices belong in `summary`. Client-side tokens doing their job, publicly available data in public APIs, and industry-standard practices aren't findings unless the implementation is genuinely unusual. Rank site-unique discoveries first.

- Bad: "Site uses React with server-side rendering" — architecture, not a discovery
- Bad: "Search API accepts queries with public key" — that's how search-as-a-service works
- Bad: "API returns player contract details" — publicly available information
- Good: "Consent manager's GPC handler is inverted — browsers requesting 'do not sell' have the flag silently disabled"
- Good: "An unreleased menu item is fully staged in the catalog API with pricing, nutrition, and a promo tag — queued for upsell but absent from the live menu"
- Good: "A concluded A/B test grays out a payment option on every product page — the button works fine, but only after you add the item to cart"

### summary vs description
`description` is what the company *is* — factual, neutral, never a finding. `summary` is the architecture overview — what it's built on, how it works. They serve different audiences (humans vs LLMs) and should never overlap.

