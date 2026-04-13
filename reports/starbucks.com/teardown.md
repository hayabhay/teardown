---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Starbucks — Teardown"
url: "https://starbucks.com"
company: "Starbucks"
industry: Hospitality
description: "Global coffeehouse chain with loyalty rewards and mobile ordering."
summary: "Next.js SSR app served via Azure CDN (Front Door) with a custom cwa01 server layer. Menu and product data proxied through /apiproxy/v1/ordering/ to a backend ordering service, unauthenticated for reads. mParticle is the CDP backbone, TrustArc manages consent under US implied/opt-out rules, and two Optimizely projects run in parallel — a legacy snippet plus a full SDK whose datafile exposes the complete feature flag configuration."
date: 2026-04-12
time: "07:02"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack: [Next.js, Azure CDN, Scene7]
trackers: [Google Analytics, Google Tag Manager, Google Ads, mParticle, Optimizely, New Relic, Kenshoo/Skai, TrustArc, F5 Shape Security]
tags: [feature-flags, optimizely, ordering-api, mparticle, agentic, loyalty, consent, bot-defense, rewards]
headline: "Starbucks' public Optimizely datafile exposes 39 feature flags — including an AI agent ordering hook, an unreleased 'dream drink' generator, and MOP kill switches."
findings:
  - "The Optimizely SDK datafile is served from a public CDN URL without authentication, listing 39 feature flags: agentic_ordering_deep_linking is live for all users, ai_dream_drink and open_loop_tipping are staged, and emergency_mop_outage is a kill switch that can disable the entire Mobile Order & Pay system."
  - "Beta event names in the datafile describe an unlaunched group ordering feature — invite-others, contributor cart, cart locking — none of which appear anywhere on the public site."
  - "The unauthenticated ordering API returns full product data for every menu item — nutrition facts, caffeine ranges, complete modifier trees, and Rewards star redemption costs — but deliberately withholds dollar prices."
  - "The /cwa-version/ endpoint returns the current git commit SHA, internal Jira ticket IDs, and environment name in plain JSON, and aea.starbucks.com redirects to a SharePoint beta tester portal discoverable via the production SSL certificate."
  - "A fingerprintjs2-based behavioral biometrics script from prod.accdab.net collects keystroke timing, mouse paths, and form interaction patterns on every page, running alongside a separate F5 Shape Security beacon."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Starbucks.com is a Next.js app on Azure CDN with a publicly accessible ordering API, a feature flag datafile that reads like an internal product roadmap, and a two-layer bot defense system that watches how you type. The Optimizely configuration alone reveals an active AI agent integration, unreleased features, and infrastructure kill switches — all served from a public CDN URL.

## Architecture

Starbucks.com is a Next.js SSR application served through Azure CDN (Azure Front Door), identifiable by the `x-azure-ref` and `x-nextjs-cache` response headers. The server reports itself as `cwa01` via `x-powered-by` — Starbucks' internal designation for their custom web application framework layer.

The site's routing structure is minimal: a catch-all `[[...page]]` Next.js dynamic route handles the entire marketing surface, with a sparse 23-URL sitemap covering menu categories, rewards, stores, gift cards, and about pages. Individual product pages are not in the sitemap. Build metadata is available at `/cwa-version/`:

```
{"buildId":"57393","commit":"Revert 🔄 Revert WG-2007: Survey flag removal #1925","sha":"13e81f3437f6324005ecec41241fc1300d934a96","env":"production"}
```

This JSON endpoint returns the current git commit SHA and the internal Jira ticket reference (`WG-2007`) included in the commit message, without authentication.

The marketing site (`www.starbucks.com`) and the ordering experience (`app.starbucks.com`) are architecturally separate — confirmed by TrustArc's consent configuration, which is scoped to `app.starbucks.com` despite consent management logic running on `www.starbucks.com`. Product images are served from `cloudassets.starbucks.com/is/image/sbuxcorp/{name}`, the standard Scene7 (Adobe Dynamic Media) path format.

Cache strategy is aggressive: `s-maxage=600, stale-while-revalidate=31535400` — 10-minute CDN TTL with a ~1-year stale-while-revalidate window.

CSP is present but permissive: `script-src` allows `'unsafe-eval'` and `'unsafe-inline'` alongside all `*.starbucks.com` origins. Third-party script domains in the CSP include `*.mparticle.com`, `*.optimizely.com`, `*.trustarc.com`, `*.xg4ken.com`, `*.nr-data.net`, `*.doubleclick.net`, `*.adsrvr.org`, `*.agkn.com`, `*.videoamp.com`, `*.pinterest.com`, and `*.snapchat.com`.

---

## The Ordering API

Menu and product data are proxied through `www.starbucks.com/apiproxy/v1/ordering/` and require no authentication for read operations.

**`GET /apiproxy/v1/ordering/menu`** returns a four-category menu tree: The Latest, Drinks, Food, and At Home Coffee. The response is sparse — 15 featured products appear as full objects (with product number, name, image URL, availability status, sizes, and URI), while most subcategories return empty product arrays. The full catalog is accessible via individual product calls.

**`GET /apiproxy/v1/ordering/{productId}/{formCode}`** returns the complete product record:

- `productNumber`, `name`, `productType`, `formCode`, `imageURL`, `inCatalog`
- `starCost` — the Rewards star count to redeem the item for free (Pike Place Roast: 100 stars; shaken espresso, energy drinks: 200 stars)
- `sizes[]` — per-size nutrition facts including `calories`, `caloriesFromFat`, `servingSize`, and `additionalFacts[]` containing `totalFat`, `cholesterol`, `sodium`, `totalCarbs`, `protein`, and `caffeine`
- Caffeine is returned with both a base value and a range maximum: Pike Place Roast Short returns `value: 155, maximum.value: 195` (mg)
- `productOptions[]` — full modifier tree with 7 top-level categories (Flavors, Toppings, Cold Foams, Add-ins, Sweeteners, Cup Options, Espresso & Shot Options), each with nested subcategories and individual modifier products with their own SKUs and form codes

No dollar pricing appears anywhere in the API response. Prices are only accessible through the app's store-selection flow — the API deliberately withholds the one field customers actually want to compare.

Some products in the menu catalog return 404 from the ordering API even when listed as available — product ID 1044 (Caramel Ribbon Crunch Frappuccino) is one confirmed example. The menu catalog and ordering database are not in sync.

The external API gateway at `eapi.starbucks.com` — used for CMS content and referenced in the dataLayer (`https://eapi.starbucks.com/content/v3/content/{id}`) — gates all responses with `AGW002 Forbidden` without authentication.

---

## Optimizely Feature Flag Exposure

Two separate Optimizely projects run in parallel on starbucks.com. The first (project ID `13849340212`) loads as a traditional snippet on the homepage and fires events to `logx.optimizely.com/v1/events`. The second (project ID `13858570517`) is a full SDK integration that loads its configuration datafile on the menu and subsequent pages.

The SDK datafile is publicly accessible via Optimizely's CDN with no authentication:

```
GET https://cdn.optimizely.com/datafiles/28Mn9riXNWZ7tLED1Mjbpf.json
```

SDK key: `28Mn9riXNWZ7tLED1Mjbpf`, account `6558036`, project `13858570517`, revision 1816.

The datafile contains the complete feature flag configuration — 39 flags with their rollout rules, audience targeting, and traffic allocation.

**Enabled in production (15 flags):**

| Flag | Notes |
|------|-------|
| `agentic_ordering_deep_linking` | 100% traffic — AI-agent ordering deep linking live |
| `next_gen_loyalty` | Two rollout rules: `ngl_prod_testing` (audience-filtered) and default (100% traffic) |
| `rewards_marriott` | Starbucks+Marriott rewards integration |
| `rewards_together_marriott` | Marriott integration variant |
| `web_mop_gco` | Mobile Order & Pay guest checkout flow |
| `web_gco_cc_dc` | Guest checkout with credit/debit card |
| `web_gco_marketing` | Marketing opt-in during checkout |
| `bts_scheduled_ordering` | Scheduled ordering variant |
| `scheduled_ordering_gco` | Scheduled ordering in checkout flow |
| `mdg_post_order` | Modern Digital Gifting — post-order flow |
| `mdg_gift_history` | Gift history feature (variable `giftHistoryEnabled: false`) |
| `account_delete` | Account deletion feature |
| `ca_tax_label` | California-specific tax labeling |
| `protein_pdp_nutrition` | Protein product detail nutrition display |
| `demystify_previous_favorites_review` | Previous favorites review UI |

**Staged / disabled (24 flags):**

| Flag | Notes |
|------|-------|
| `open_loop_tipping` | Tip with non-Starbucks-card payment methods — staged |
| `ai_dream_drink` | AI-generated drink customization — staged |
| `ciam_v2_passwordless` | Passwordless login — in development |
| `scheduled_ordering` | Base scheduled ordering flag (checkout variants above are enabled) |
| `modern_digital_gifting` | Digital gifting base feature |
| `customer_creations` | User-generated drink customizations |
| `pdp_quick_build` | Quick drink builder on product detail pages |
| `ciam_v2_combined_sign_in_up` | Combined sign-in/create-account page |
| `demystify_menu_pdp` | Simplified product detail pages |
| `demystify_previous_favorites` | Previous favorites simplification |
| `service_wait_time` | Estimated wait time display |
| `featured_collections` | Featured drink collections |
| `gift_card_landing_page_new_v1` | Redesigned gift card landing |
| `marriott_hide_seo` | SEO suppression for Marriott pages |
| `rewards_delta` | Rewards variant (Delta partnership inferred) |
| `emergency_mop_outage` | Kill switch for Mobile Order & Pay (disabled = no outage) |
| `emergency_spf_outage` | Kill switch for SPF (disabled = no outage) |
| `post_order_survey` | Post-order survey |
| `persistent_survey` | Persistent survey prompt |
| `quick_add_experiment` | Quick-add to cart experiment |
| `pdh_v1` | Unknown |
| `test_beta_experiment` | Test/debug flag |
| `blah` | Test/debug flag |
| `jqBY5ap3Kn6N3aNcBikLon` | Obfuscated flag — purpose unknown |

The `agentic_ordering_deep_linking` flag is the most notable. "Agentic" is AI-agent terminology — this flag enables deep linking into the ordering flow for AI agents, live for 100% of production traffic. Whether it connects to the native Starbucks app, a voice interface, or a third-party AI integration is not exposed in the datafile.

The Optimizely events list includes `transparent_pricing` as a tracked event, and the rollout rule for `demystify_previous_favorites_review` is named `transparent_pricing_pfr_prod_deploytd1`. Starbucks shows no prices anywhere on the marketing site — pricing only appears after store selection in the app. This event suggests a pricing transparency initiative in phased deployment.

The event list also reveals beta features by name: a set of `beta go -` events describe group ordering functionality — go cart, contributor flow, invite-others, cart locking. These describe a complete group ordering feature that is not publicly launched.

---

## Consent & Surveillance

TrustArc manages consent configuration. The cookie set on first page load is `notice_behavior=implied,us` — US users are placed into an implied/opt-out consent model by default. No active consent interaction is required for tracking to begin. The TrustArc consent domain is configured as `app.starbucks.com`, not `www.starbucks.com` — a configuration mismatch where the marketing site's consent is governed by the ordering app's domain.

Trackers confirmed firing on first page load, before any user interaction with the cookie banner:

| Tracker | Type | Identifier |
|---------|------|-----------|
| Google Analytics (GA4) | Analytics | G-Q8JXK1T67J, G-VMTHZW7WSM (page load); G-GM7SDSPVJX (GTM, event-triggered) |
| Google Tag Manager | Tag Manager | GTM-P37KWTP (Google-only tags) |
| mParticle | CDP | workspace us1-b96c10bf8d450e45a5f108932f193fc4, plan customer_activity_events |
| Optimizely | A/B Testing | Projects 13849340212 + 13858570517 |
| New Relic | RUM | nr-spa-1173.min.js, bam.nr-data.net |
| TrustArc | CMP | consent.trustarc.com/analytics |
| Kenshoo/Skai | Paid search | xg4ken.com, tag KT-N4353-3EA |

mParticle fires a `POST /v1/identify` to `identity.mparticle.com` on the first homepage load — before any user action — establishing an identity record. On subsequent pages, event forwarding continues via `POST /v1/JS/{workspace}/Forwarding`. mParticle integrates the GA4 client_id (integration ID 160) into its identity graph on first visit, linking the browser's Analytics fingerprint to mParticle's own user profile.

Google Ads pixels become more active deeper in the funnel. The rewards page fires Google remarketing (`/rmkt/collect/973690779/` and `/rmkt/collect/873079248/`) and a DoubleClick conversion pixel (`src=4487060`, `cat=sbuxrwrd`). The account creation page fires `cat=srcreata`. These pixels identify which funnel stage the user reached.

The CSP `img-src` directive allows `*.adsrvr.org`, `*.agkn.com`, `*.appcast.io`, `*.bing.com`, `*.videoamp.com`, and `*.snapchat.com` — additional ad targeting vendors not observed in the network traces, likely firing on specific events or for particular audience segments.

---

## Bot Defense

Two independent bot defense systems run in parallel.

**F5 Shape Security** (`ponos.zeronaught.com`) fires a `GET /2` beacon on every non-homepage page. The domain resolves to F5 Distributed Cloud / Shape Security infrastructure (certificate issued to F5, Inc., response routed through `bit23018.sjc1.defense.net`). This is a session fidelity and bot classification signal at the network level.

**prod.accdab.net** operates separately and more invasively. On pages like `/menu` and `/rewards`, the site loads a 26KB JavaScript payload that runs a fingerprinting and behavioral biometrics collection system. The script's code comments identify it as using `stringencoders` and `fingerprintjs2`. It collects:

- Mouse movements: coordinates, velocity, bounding box, acceleration
- Keystroke events: character category (digit/alpha/space/other), modifier keys, timing between keystrokes
- Form interaction: autofill detection, paste events, field labels
- Click events: x/y position, button type
- Scroll behavior
- Device fingerprint: screen dimensions, hardware concurrency, browser plugins, platform, touch support

A session token is stored in localStorage as `_bcnctkn`. The vendor behind `prod.accdab.net` has not been publicly identified; based on behavior, it is consistent with an anti-fraud or user behavior analytics (UBA) system. The two-layer approach — network-level bot classification from F5, behavioral biometrics from an unidentified vendor — is unusually thorough for a coffee chain's marketing site.

---

## Exposed Internals

**`/cwa-version/` JSON endpoint:** Returns build metadata in plain JSON without authentication — buildId, current git commit SHA (`13e81f3437f6324005ecec41241fc1300d934a96`), the commit message (including internal Jira ticket reference `WG-2007`), and `env: production`.

**`aea.starbucks.com`:** Not in robots.txt, not in sitemap, not reachable from any public navigation. The domain appears in the production SSL certificate's SAN list. A request to `https://aea.starbucks.com/` returns HTTP 302 to `https://retailstarbucks1com.sharepoint.com/sites/apptesters` — Starbucks' internal app beta tester portal. The SharePoint site returns 403 to unauthenticated users, but the redirect destination is exposed.

**Internal staging domains** referenced in the Next.js build manifest: `www.dev.starbucks.ca`, `www.cert.starbucks.ca`, `www.test.starbucks.ca`, `fr.dev.starbucks.ca`, `fr.test.starbucks.ca` — Canadian market staging environments. Locales supported: `en-US`, `en-CA`, `fr-CA`.

---

## Machine Briefing

**Access & auth:** Most read operations work without a session — `curl` or `fetch` with standard headers. The ordering API (`/apiproxy/v1/ordering/`) is fully open for reads. The rewards endpoint (`/apiproxy/v1/orchestra/reward-programs`) requires an authenticated session (browser cookies from app.starbucks.com). The external API gateway (`eapi.starbucks.com`) returns AGW002 Forbidden for all unauthenticated requests.

**Endpoints — open (no auth):**

```bash
# Menu structure (4 categories, 15 featured products)
curl "https://www.starbucks.com/apiproxy/v1/ordering/menu"

# Product detail — productId is numeric, formCode is "hot", "cold", "iced", etc.
curl "https://www.starbucks.com/apiproxy/v1/ordering/480/hot"
# Returns: name, starCost, sizes[], nutrition, productOptions (modifier tree)

# Build info
curl "https://www.starbucks.com/cwa-version/"
# Returns: {"buildId":"...","commit":"...","sha":"...","env":"production"}

# Optimizely feature flag datafile (full 39-flag configuration)
curl "https://cdn.optimizely.com/datafiles/28Mn9riXNWZ7tLED1Mjbpf.json"
```

**Endpoints — session-gated:**

```bash
# Rewards program data (requires authenticated session cookies from app.starbucks.com)
POST https://www.starbucks.com/apiproxy/v1/orchestra/reward-programs

# CMS content (requires Starbucks auth — returns AGW002 without it)
GET https://eapi.starbucks.com/content/v3/content/{contentId}
```

**Gotchas:**

- The menu API returns a sparse product list — only 15 products across 4 top-level categories have full product objects. Most subcategory product arrays are empty. To enumerate the full catalog, you need product IDs from individual product page HTML.
- Some product IDs in the menu catalog return 404 from the ordering API (e.g., product 1044). The menu and ordering databases are not in sync.
- The `formCode` in the product detail endpoint matters — `hot`, `cold`, `iced`, and other variants return different product records. The correct formCode for a given product is in the menu URI field.
- The rewards endpoint POST returns 400 without proper session cookies, not 401 — error handling doesn't distinguish unauthenticated from malformed requests.
- Scene7 image URLs at `cloudassets.starbucks.com/is/image/sbuxcorp/{name}` accept standard Scene7 image transformation parameters (`?wid=800&hei=800&fmt=png-alpha` etc.).
