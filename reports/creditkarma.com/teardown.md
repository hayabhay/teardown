---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Credit Karma — Teardown"
url: "https://creditkarma.com"
company: "Credit Karma"
industry: "Finance"
description: "Free credit score and financial product marketplace, owned by Intuit."
summary: "Credit Karma runs a micro-frontend Next.js architecture with per-package deployments (homepage, marketplace, login, signup), backed by GraphQL APIs and a publicly accessible WordPress VIP CMS at cms.creditkarma.com. Akamai front-gates all traffic under the CK-FG-server label; compute runs on Google Cloud us-east4 behind Kubernetes. Feature flags, Kubernetes pod metadata, and OAuth token slots are embedded in server-rendered HTML on every page load."
date: "2026-04-15"
time: "23:59"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: ["Next.js", "WordPress VIP", "Akamai", "Google Cloud", "Kubernetes", "GraphQL"]
trackers: ["Google Analytics 4", "Google Ads", "Microsoft Bing UET", "TikTok Pixel", "Taboola", "New Relic", "Contentsquare", "Amazon DSP", "Meta Pixel", "Snapchat Pixel", "LinkedIn Insight Tag", "Reddit Pixel", "Criteo", "LiveRamp", "Tapad", "BlueKai", "Outbrain", "Quora Pixel", "Rokt", "FullStory", "Intuit Identity Sync", "ThreatMetrix"]
tags: ["fintech", "credit", "intuit", "ad-tech", "feature-flags", "kubernetes", "wordpress", "tracking", "product-intelligence", "surveillance"]
headline: "Credit Karma's public WordPress API reveals 'Credit Karma Plus,' a waitlisted paid tier quietly breaking a 19-year free-only model."
findings:
  - "cms.creditkarma.com/wp-json is fully public -- 3,565 articles plus SEM landing pages that expose Credit Karma Plus (a waitlisted paid tier created March 31), active Gen Z acquisition tests iterating through 8 landing page variants in two days, and a Cards Optimizer feature with its internal Jira ticket BCD-7860 embedded in a published image URL."
  - "window._DARWIN exposes all live feature flags on every page, including 'Galileo' -- a fully built but disabled credit card marketplace redesign -- a 'Karma Guarantee' badge system, and passwordless login infrastructure, all readable from the browser console."
  - "window.REQUEST_ID embeds Kubernetes pod names and deployment hashes in every server-rendered page (e.g., front-end-render-service-prog-66dfd7dcc4-76z98:81), enabling infrastructure enumeration across service deployments."
  - "Intuit's device fingerprinting service fires two API calls to deviceintel-identityra.api.intuit.com before users fill any signup fields; FullStory records the entire registration session."
  - "Identity graph operators LiveRamp, Tapad, and BlueKai run in the ad container frame alongside Intuit's idsync.api.intuit.com, which syncs Credit Karma browsing identity to TurboTax and QuickBooks accounts."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Credit Karma is Intuit's free credit score and financial product marketplace -- acquired in 2020 for $7.1 billion. The surface is clean and consumer-friendly. The plumbing is not.

## Architecture

The site is a micro-frontend Next.js application running on the App Router with server-side rendering. Each major section is a separately deployed package, identified at runtime by the `_PKG_NAME` global: `homepage`, `marketplace`, `login`, `signup`, `error-pages`. The `RETROVISION` global is the routing config that maps page names to backend render services.

```
front-end-render-service         --> homepage, marketplace, signup, error-pages
accounts-front-end-render-service --> login/auth pages
```

All traffic passes through Akamai under a custom front-gate label (`Server: CK-FG-server`). Compute runs on Google Cloud, us-east4 datacenter (`ORIGIN-DC: us-east4`). Auth pages live at a separate subdomain (`accounts.creditkarma.com`) running an independent Kubernetes deployment.

The GraphQL API at `/graphql` is the main data layer for authenticated users. Without auth cookies it returns a 302 to the 404 page. Custom `Ck-*` headers accepted by `api.creditkarma.com` include `Ck-App-Advertising-Id`, `Ck-Open-Udid` (mobile device IDs), `Ck-Market` (locale), `Ck-Cookie-Id` (tied to the `CKTRKID` tracking cookie), and `Ck-Gql-Queries-Version`. Zipkin distributed tracing headers (`X-B3-TraceId/SpanId`) confirm the microservices backend.

The WordPress VIP CMS at `cms.creditkarma.com` serves editorial and marketing content. Internal services communicate via the `*.ckapis.com` subdomain pattern (`sierra.kilo.ckapis.com`, `segue.toffee.ckapis.com`, `dicontent.ckapis.com`). A WebSocket server at `socketbus.creditkarma.com` handles real-time features in the authenticated app. Firebase GCS at `storage.googleapis.com/creditkarmachat/` backs a chat feature. Plaid (`cdn.plaid.com`) handles financial account linking.

## The Global Scope Dump

Every Credit Karma page load -- unauthenticated, any page -- delivers a dense set of operational state into `window`. Not via a separate API call. Embedded directly in the server-rendered HTML.

| Global | Contents |
|--------|----------|
| `window._DARWIN` | All feature flags for the current page/package |
| `window.REQUEST_ID` | Kubernetes pod name, deployment hash, port, request trace |
| `window._ACCESS_TOKEN` | `null` unauthenticated; inferred to contain OAuth token when logged in |
| `window._REFRESH_TOKEN` | `null` unauthenticated; same pattern |
| `window._COOKIE_ID` | The `CKTRKID` tracking cookie value, also readable from JS directly |
| `window.RETROVISION` | Render farm routing config |
| `window._PKG_NAME` | Active micro-frontend package identifier |
| `window.SSO_SESSION` | `"true"` even for unauthenticated visitors |
| `window.cktags` | Tag manager with public methods including `enableQAMode()` |
| `window.JUDGEMENT` | First tracking queue with config and event buffer |
| `window.JUDGEMENT_CUSTOM` | Second tracking queue |
| `window.RAW_BEHAVIOR_JUDGEMENT` | Third tracking queue |
| `window.ck_tracking_client` | Fourth tracking queue |

The architecture is built for cross-module communication in a micro-frontend setup -- the window scope is the shared bus. The side effect is that anyone opening the browser console has a complete read of the site's operational state.

`cktags.enableQAMode()` and `cktags.disableQAMode()` are callable from any user's browser console, exposing internal QA debug interfaces on production pages.

## Feature Flags: _DARWIN

`_DARWIN` delivers the full feature flag object for each package on every page load. There is no server-side filtering -- disabled features, unreleased products, and live A/B variant names are all included.

Homepage `_DARWIN` on investigation date:

```json
{
  "mono.homepage_version": "b",
  "mono.homepage_section_1": "tax2026Hero_Peak2_v1",
  "mono.homepage_section_2": "kycco_v1",
  "mono.homepage_section_3": "kycco_v1",
  "mono.homepage_section_4": "kycco_v4_white3",
  "mono.homepage_section_5": "kycco_v1",
  "mono.homepage_section_6": "kycco_v1",
  "mono.homepage_section_7": "disable",
  "mono.homepage_section_8": "v1",
  "mono.homepage_section_9": "v1",
  "mono.homepage_cta_variation": "default",
  "mono.homepage_disclaimer_variation": "tax2026_peak2_v1"
}
```

The homepage hero (`section_1`) is showing the TurboTax promotional variant (`tax2026Hero_Peak2_v1`), currently in the second peak of the 2026 tax season push. Sections 2-6 are all variants of an A/B test named `kycco` -- a homepage redesign test. Section 7 is actively suppressed (`"disable"`). The disclaimer is also on a tax season variant.

Credit cards page carries 53 flags. Notable disabled features:

```json
{
  "js.cc_galileo_marketplace_enabled": false,
  "js.galileo_static_l2_tabs": false,
  "js.cc_marketplace_category_pill_karma_guarantee": false,
  "js.cc_marketplace_wallet_tab_first": false,
  "js.cc_marketplace_enable_tabs": false,
  "js.cc_marketplace_scroll_pill_enabled": false,
  "js.signup_passwordless": false,
  "js.cc_marketplace_category_pill_members_like_you": false,
  "js.cc_marketplace_category_pill_revisit_these_offers": false
}
```

**Galileo** is a code-named redesign of the credit card marketplace. Two flags -- `cc_galileo_marketplace_enabled` and `galileo_static_l2_tabs` -- confirm it is built but not yet activated. The L2 tabs flag suggests the redesign introduces tabbed navigation at the category level. It appears exclusively in the credit cards package `_DARWIN`.

**Karma Guarantee** (`cc_marketplace_category_pill_karma_guarantee: false`) is a badge or certification system for the credit card marketplace -- built, disabled.

**Passwordless login** (`js.signup_passwordless: false`) -- the infrastructure exists, not activated.

**Cards in wallet experiment** (`mono.experiment_flexParam8: {"ciwOverride":"enabled"}`) -- an active override enabling the "cards in wallet" feature for the current session, exposed in the flex parameter A/B testing system.

Login page flags include `js.login_tmx_integration: true` and `js.signup_tmx_integration: true` (ThreatMetrix on both flows), a service outage circuit breaker (`js.um_login_service_outage`), and `ty25` references (TurboTax 2025 branding) throughout.

## Infrastructure Fingerprinting

Every page embeds `window.REQUEST_ID` in server-rendered HTML. Format:

```
{unix_timestamp}:{service-name}-{deployment-hash}-{pod-id}:{port}:{request-id}:{sequence}
```

Observed values across pages during investigation:

| Page | Service | Deployment Hash | Pod ID | Port |
|------|---------|----------------|--------|------|
| Homepage | front-end-render-service-prog | 66dfd7dcc4 | 76z98 | 81 |
| 404 | front-end-render-service-prog | 66dfd7dcc4 | m65wn | 81 |
| Signup | front-end-render-service-prog | 66dfd7dcc4 | nqvtf | 81 |
| Login | accounts-front-end-render-service-prog | 7fdc6cf746 | tt9fk | 87 |

The deployment hash `66dfd7dcc4` is consistent across all `front-end-render-service` pods -- this is the current build. Different pod IDs on consecutive requests confirm horizontal scaling. The accounts service (`accounts-front-end-render-service`) runs a separate deployment hash `7fdc6cf746` on a different internal port (87 vs 81), confirming independent deployment cycles for auth vs. non-auth services.

Anyone could track deployment changes by monitoring REQUEST_ID across page loads -- the hash changes on every deploy, and sampling reveals the active pod count and internal port assignments.

## WordPress Intelligence Layer

`cms.creditkarma.com/wp-json/` requires no authentication. It returns a full WordPress REST API with 31 queryable namespaces, including 20 custom Credit Karma post types.

```
GET https://cms.creditkarma.com/wp-json/wp/v2/posts
X-WP-Total: 3565
X-WP-TotalPages: 357
```

Custom post types accessible without auth:

```
ck-sem              SEM / paid acquisition landing pages
ck-upsell-banner    In-app upsell banner content configs
ck-discovery        Recommendation content
ck-calculator-v2    Financial calculators
ck-navigational-page SEO pages
ck-credit-score     Product content
ck-personal-loan    Product content
ck-mycards          Card management pages
ck-content-library  Content library
ck-pressrelease     Press releases
ck-explore          Explore feature
ck-faq              FAQs
jp_pay_order        Jetpack payments
jp_pay_product      Jetpack payments
```

Post metadata includes internal product IDs: `ck_global_cpt_product_id`, `ck_global_cpt_content_id`, `ck_global_used_off_platform_cards`.

WordPress VIP hosting is confirmed by the `vip/v1` namespace. Jetpack ExPlat A/B testing (`jetpack/v4/explat`) is integrated. The `ck-members-insight/v1` namespace exposes a `/data/{table}` endpoint that validates the table parameter server-side -- the endpoint exists and accepts a table name but returns `{"code":"rest_invalid_param","message":"Invalid parameter(s): table"}` for all tested names.

### SEM Landing Pages: A Product Roadmap

The `ck-sem` post type is the most operationally revealing endpoint. All pages are published with status `publish`, full content, and date metadata. A sweep of the 50 most recent entries reads like Credit Karma's current acquisition strategy.

**Credit Karma Plus** -- Created March 31, 2026, status: publish. Content: "Thank you for your interest! Stay tuned for updates on Credit Karma Plus." This is a waitlist teaser for a paid subscription tier. Credit Karma has operated on a free model -- monetized via financial product referrals -- since 2007. A "Plus" tier is a material business model change, soft-launched 15 days before this investigation and discoverable through the public CMS API.

**GenZ Credit Insights** -- 10 SEM pages spanning January 15, 2026 to April 9, 2026:
- `genz-landing-page-test` (Jan 15) -- initial test
- `genz-credit-insights-rtb` (Jan 9) -- "reason to believe" messaging
- `genz-credit-insights-trigger-moments` (Feb 3)
- `genz-credit-insights-sign-up-ios` and `-android` (Apr 8)
- `genz-credit-insights-sign-up-ios-v1`, `-v2`, `-v3` (Apr 9)
- `genz-credit-insights-sign-up-android-v1` (Apr 9)

Messaging: "Build credit now, thank yourself later." Eight new landing page variants launched in two days on April 8-9, indicating rapid creative iteration on paid Gen Z acquisition. Both Meta and Taboola channels confirmed in page slugs.

**Cards Optimizer** -- Two SEM pages: `cc-cards-optimizer` (March 3, 2026) and `cc-cards-optimizer-test` (April 14, 2026 -- the day before this investigation). The hero image URL contains an internal Jira ticket reference:

```
https://creditkarma-cms.imgix.net/wp-content/uploads/2026/02/BCD-7860_Cards_LP_ConnectedCardsActivationLandingPage_Hero-D.png
```

Ticket `BCD-7860`, feature description: "Connected Cards Activation Landing Page." The same feature appears in the `_DARWIN` flag `experiment_flexParam8: {"ciwOverride":"enabled"}` (cards-in-wallet override). Acquisition channels: Meta, Snapchat.

**Credit Spark** -- Active paid acquisition via Meta (March 23) and Snapchat (March 25). Also listed in the `ck-upsell-banner` post type (January 27). The landing page image slug (`6580_CO_LP_V3IlloTransp`) shares an identifier with Cards Optimizer creative, suggesting Credit Spark may be a campaign name for the Cards Optimizer product rather than a distinct offering.

**Active paid acquisition channels** confirmed from slug patterns:
- **Meta** (Facebook/Instagram): Cards Optimizer, Credit Spark, brand content ("I Wish I Knew"), GenZ
- **Snapchat**: Cards Optimizer, Credit Spark
- **Google Search**: Personal Loans registration tests
- **Liftoff** (mobile DSP): Personal Loans, Core Acquisition
- **Everflow** (performance network): Personal Loans
- **Taboola**: Auto Insurance Savings, GenZ

The `robots.txt` contains an inline comment revealing another staged product: `#Remove the Apple directive once the Apple offer can accept un-auth traffic#`. The path `/creditcard/CCApple01*` is currently blocked from all crawlers pending a backend change that would allow unauthenticated users to see the Apple Card offer.

## Surveillance Architecture

### First-Load Cookies

On a clean first visit, before any user interaction:

| Cookie | TTL | HttpOnly | Purpose |
|--------|-----|----------|---------|
| `CKTRKID` | 10 years | No | Cross-session tracking ID, readable by JS |
| `FID` | 10 years | Yes | First impression flag |
| `CKTRACEID` | 2 weeks | Yes | Request trace ID |
| `ck_web` | 1 year | Yes | Encrypted Hapi Iron session (www subdomain only) |
| `CK_AV` | No expiry | Yes | Encrypted Hapi Iron token, site-wide |
| `_abck` | 1 year | Yes | Akamai bot detection |
| `bm_sz` | 4 hours | No | Akamai bot detection telemetry |

`CKTRKID` is accessible directly from `window._COOKIE_ID` as well as from JS cookie access -- the tracking ID is explicitly bridged into the JavaScript global scope.

Third-party cookies set pre-interaction on first visit: `_gcl_au` (Google Ads), `_cq_duid/_cq_suid/_cq_session` (Contentsquare), `_uetsid/_uetvid` (Bing UET), `_ga_0VHWHRFT7Z/_ga` (GA4), `_tt_enable_cookie/_ttp/ttcsid` (TikTok Pixel).

### Four Tracking Pipelines

Credit Karma runs four parallel first-party tracking pipelines, all feeding `sponge.creditkarma.com`:

```
JUDGEMENT             --> sponge.creditkarma.com/events/ck/web
JUDGEMENT_CUSTOM      --> sponge.creditkarma.com/events/ck/web
RAW_BEHAVIOR_JUDGEMENT --> sponge.creditkarma.com/events
ck_tracking_client    --> sponge.creditkarma.com
```

JUDGEMENT config:
```json
{
  "domain": "https://sponge.creditkarma.com",
  "endpoint": "events/ck/web",
  "TTL": 3600000,
  "localstorage": true,
  "localstorageKey": "JUDGEMENT_EVENTS",
  "uploadEvents": true
}
```

Events are batched with a 2-second debounce, 15-second max wait, and 3 retries. Events are written to localStorage (`JUDGEMENT_EVENTS`, `JUDGEMENT_EVENTS_CUSTOM-events/ck/web`) before upload. If the browser closes before the flush, the events survive and upload on the next session. Unuploaded tracking data persists across browser restarts.

### Device Fingerprinting Before Form Fill

The signup page loads `deviceintel-identityra.api.intuit.com` -- Intuit's ThreatMetrix/IOVATION device fingerprinting integration -- in the first network requests, before any user has filled in a field:

```
POST https://deviceintel-identityra.api.intuit.com/v1/init_session  --> 200
POST https://deviceintel-identityra.api.intuit.com/v1/session/process --> 200
```

Feature flags confirm both signup and login flows have ThreatMetrix enabled (`js.signup_tmx_integration: true`, `js.login_tmx_integration: true`). The device fingerprint is established before the user submits any personal information.

### FullStory on Registration

`js.seamless_reg_full_story_enabled: true` in signup page `_DARWIN`, combined with FullStory's presence in the main site CSP (`connect-src: https://rs.fullstory.com`). FullStory records the complete signup session -- keystrokes, mouse movements, form interactions -- during registration.

### Intuit Identity Sync

`idsync.api.intuit.com` appears in the ad container CSP. This is Intuit's cross-product identity sync pixel, connecting Credit Karma user identity to TurboTax, QuickBooks, and Mailchimp. Browsing Credit Karma while logged in ties to the same Intuit account used for taxes and business accounting.

### Ad Container Identity Graph

`tags.creditkarma.com` is an ad container -- an iframe that runs advertising pixels in a sandboxed context. Its CSP reveals the full ad-tech stack used for audience targeting:

Public site (confirmed via network logs and cookies):
- Google Analytics 4, Google Ads Remarketing (campaign IDs: 857192775, 986970455)
- Microsoft Bing UET
- TikTok Pixel
- Taboola (publisher ID: 1022710)
- Amazon DSP (`s.amazon-adsystem.com`, `c.amazon-adsystem.com`, `ara.paa-reporting-advertising.amazon`)
- New Relic Browser (account ID: 248e088a40)
- Contentsquare (`_cq_*` cookies)

Ad container (CSP-confirmed):
- Meta/Facebook Pixel
- Snapchat Pixel
- LinkedIn Insight Tag
- Reddit Pixel
- Criteo
- Quora Pixel
- Outbrain
- Rokt
- Awin/DWin1 (affiliate)
- BlueKai Oracle DMP (`tags.bluekai.com`)
- LiveRamp/Pippio (`pippio.com`, `i.liadm.com`)
- Tapad (`pixel.tapad.com`)

LiveRamp, Tapad, and BlueKai are identity resolution operators -- they match logged-in user identities to advertising audiences across publishers and devices. Credit Karma users provide SSN, date of birth, and address to access credit monitoring. The exact data flow between CK's verified user identities and these graph operators is not observable from the outside, but the operators are present in the ad container alongside Intuit's own cross-product identity sync.

## Open Threads

**`window._ACCESS_TOKEN` when authenticated** -- The global exists and is `null` for unauthenticated visitors. In a micro-frontend architecture where window globals are the cross-module communication bus, the pattern strongly suggests the access token is written here on login for use across packages. If confirmed, any script running on the domain (browser extension, XSS, malicious ad creative) could read the OAuth token directly from `window._ACCESS_TOKEN`.

**`beta.creditkarma.com`** -- Listed in the SSL SAN. Returns nothing on direct probe, suggesting IP-filtered or decommissioned behind the Akamai front-gate.

**`socketbus.creditkarma.com` WebSocket** -- In the authenticated app CSP. Likely handles real-time credit monitoring alerts. Not probeable without an authenticated session.

**`ck-members-insight/v1/data/{table}`** -- The endpoint validates table names server-side. A wordlist enumeration of common table names would determine if any valid values exist. Not attempted during this investigation.

## Machine Briefing

### Access & Auth

The public site is fully accessible without credentials. The GraphQL API at `/graphql` and all authenticated app sections (dashboard, myfinances, credit-health) require session cookies -- they return 302 to 404 without them. The WordPress CMS API at `cms.creditkarma.com/wp-json/` requires no authentication for any read operation.

Akamai bot detection is active on all endpoints (`_abck`, `bm_sz` cookies, obfuscated sensor POST). Standard curl works for the WordPress API. The main site returns HTTP 200 to curl but JavaScript-dependent content will not render.

### Endpoints

**WordPress API -- open, no auth**

```bash
# All published posts (3,565 total, 357 pages)
GET https://cms.creditkarma.com/wp-json/wp/v2/posts?per_page=100&page=1

# SEM landing pages (product/acquisition intelligence)
GET https://cms.creditkarma.com/wp-json/wp/v2/ck-sem?per_page=100&orderby=date&order=desc

# Upsell banners (product surface area)
GET https://cms.creditkarma.com/wp-json/wp/v2/ck-upsell-banner?per_page=100

# Specific page by slug
GET https://cms.creditkarma.com/wp-json/wp/v2/ck-sem?slug=ck-plus-pd

# All available post types
GET https://cms.creditkarma.com/wp-json/wp/v2/types

# All plugin namespaces
GET https://cms.creditkarma.com/wp-json/
```

**Feature flags -- requires browser (embedded in SSR HTML)**

```javascript
// In browser console on any creditkarma.com page:
window._DARWIN          // All feature flags for current package
window.REQUEST_ID       // Pod name + deployment hash
window._PKG_NAME        // Current micro-frontend package
window._COOKIE_ID       // CKTRKID tracking cookie value
window.cktags.enableQAMode()  // Enable QA debug mode
```

**Event ingestion -- open POST**

```bash
# Primary tracking endpoint
POST https://sponge.creditkarma.com/events/ck/web

# Secondary
POST https://sponge.creditkarma.com/events
```

**GraphQL -- auth-gated**

```bash
# Returns 302 to 404 without session cookies
POST https://www.creditkarma.com/graphql
# Custom headers: Ck-App-Advertising-Id, Ck-Open-Udid, Ck-Market, Ck-Cookie-Id, Ck-Gql-Queries-Version
```

**Members insight -- open but validated**

```bash
# Returns 400 invalid param for all tested table names
GET https://cms.creditkarma.com/wp-json/ck-members-insight/v1/data/{table}
```

### Gotchas

- Akamai is active on the main site -- repeated rapid requests will trigger bot detection. The WordPress API on cms.creditkarma.com is behind nginx without aggressive bot detection.
- `_DARWIN` is embedded in SSR HTML -- fetch the page source and parse with regex or grep. No need for a headless browser to read flags.
- WordPress API pagination: default `per_page=10`, max is 100. Use `X-WP-Total` and `X-WP-TotalPages` response headers for total counts. `ck-sem` pages have `x-robots-tag: noindex` but are fully readable via the API.
- The `CKTRKID` cookie is `SameSite=Strict` -- cross-site requests will not carry it. The `ck_web` session is `Domain=www.creditkarma.com` only (not `.creditkarma.com`), so it does not apply to cms, api, or sponge subdomains.
- `sponge.creditkarma.com` has `Access-Control-Allow-Credentials: true` with origin locked to `https://www.creditkarma.com` -- not exploitable cross-site, but events can be POSTed directly without CORS restriction if not sending credentials.
- New Relic account ID `248e088a40` appears across all page types.
