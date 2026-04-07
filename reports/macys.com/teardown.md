---
# agents: machine-friendly instructions in "## Machine Briefing"
title: Macy's — Teardown
url: "https://www.macys.com"
company: Macy's
industry: Retail
description: "US department store chain operating macys.com and bloomingdales.com"
summary: "Macy's runs a Nuxt 3 / Vue 3 SSR frontend behind Akamai WAF and CDN, with IBM WebSphere Commerce still handling legacy error routes during an active migration. The product and browsing stack integrates a Google Cloud backend — Vertex AI Search for Commerce and Conversational Commerce — under project mtech-ecom-prod. Tealium iQ orchestrates 33 confirmed third-party trackers including FullStory session replay, five social pixels, Criteo retail media, BounceX/Wunderkind, and Bluecore CDP. Adobe Experience Platform and Adobe Audience Manager handle identity stitching alongside a custom HMAC-signed xapi layer for first-party product and navigation calls."
date: 2026-04-06
time: "22:11"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack:
  - Nuxt
  - Vue
  - Akamai
  - Tealium iQ
  - Adobe Experience Platform
  - Google Cloud Retail AI
  - IBM WebSphere Commerce
trackers:
  - Tealium iQ
  - Adobe Analytics
  - Adobe Audience Manager
  - FullStory
  - Google Analytics 4
  - Google Ads
  - Google Tag Manager
  - Facebook Pixel
  - Pinterest Pixel
  - Snapchat Pixel
  - TikTok Pixel
  - Twitter Pixel
  - Criteo
  - AdRoll
  - BounceX / Wunderkind
  - Bluecore CDP
  - Medallia
  - Dynatrace
  - New Relic
  - Taboola
  - Commission Junction
  - Signal / Coherent Path
  - Kenshoo / Skai
  - VideoAmp
  - Magnet AI
  - LoopMe
  - Riskified
  - Flashtalking
  - Yahoo DSP
  - OneTrust
  - Movable Ink
  - TriggerMail
  - mPulse / Akamai RUM
  - Taggstar
tags:
  - retail
  - ecommerce
  - department-store
  - google-cloud
  - consent-bypass
  - api-tokens
  - session-replay
  - retail-media
  - identity-resolution
  - platform-migration
headline: "Macy's SEED cookie exposes every shopper's A/B experiment assignments in plaintext — readable by all 33 third-party trackers on the page."
findings:
  - "The SEED cookie broadcasts every visitor's A/B experiment assignments in plaintext, readable by JavaScript — all 33 third-party trackers on the page can see which experiments Macy's is running and which variant each shopper is in."
  - "The signin page serves a base64-encoded OAuth2 client_id:client_secret pair for auth.macys.com to every unauthenticated visitor — the credentials that Macy's backend uses to talk to its own authentication service, readable by anyone who visits the page."
  - "A public token endpoint issues live Google Cloud bearer tokens scoped to cloud-platform with no authentication and no rate limiting — five rapid requests return five distinct tokens, each valid for an hour, under the service account that powers their AI shopping assistant."
  - "65 cookies are already set and 33 trackers are already recording before a visitor sees the consent banner — OneTrust is configured to pre-enable all tracking categories including advertising and social media targeting."
  - "Macy's production Tealium container still references internal dev hostnames on fds.com (Federated Department Stores) — a POC environment and a performance testing server that were never scrubbed before deployment."
---

## Architecture

Macy's frontend is Nuxt 3 (Vue 3), confirmed via `window.isNuxtApp`, `window.__VUE__`, `window.__unctx__`, and `useNuxtApp` globals. Server-side rendering is active — pages arrive pre-rendered with product data embedded, then hydrate client-side. The Tealium iQ data layer includes `isNuxtPage: true` and `release_date: "2018-02-21"` (the latter is a data layer artifact, likely a CMS template date rather than a deploy timestamp).

Akamai WAF sits in front of all traffic. All direct `curl` requests return 403 with `AkamaiNetStorage` / `AkamaiGHost` identifiers in response headers. The `_abck` cookie (Akamai Bot Manager Advanced) and `bm_sz` (bot score) are issued on every response. An obfuscated Akamai sensor script loads at a path like `/T-oweIqbKDDKcFWxJLxgPIzTgE4/aLYQVVai9ONErzVOuE/UmhvDi0VAQM/d1x9G/WUEej0B` — POSTed to five times on homepage load. Akamai also runs mPulse RUM (API key `WVZ92-598Q4-C592Z-HWSHG-PBBKW`).

The site runs a two-stack architecture in transition. Modern pages (homepage, PDP, search, category) are handled by the Nuxt layer. Legacy routes — error pages, and inferred checkout/order management — are still served by IBM WebSphere Commerce (HCL Commerce). The 404 page carries `<meta http-equiv="generator" content="JACPKMALPHTCSJDTCR">`, a WebSphere Commerce version identifier. The feature flag `csPagesOnIBMEnabled: false` confirms this is a live migration, not a completed one.

The Google Cloud integration is split across two services:
- **Vertex AI Search for Commerce** — handles catalog search and browse. `window.cloud_retail` exposes `collect` and `logEvent` methods. `window.RETAIL_SEARCH_TOKEN` is a 231-character base64 Retail API session token encoding the serving config name `default_browse` and catalog `default_catalog` under project `mtech-ecom-prod`.
- **Google Cloud Conversational Commerce** (Agentix) — backs the "Ask Macy's" AI chat widget. Network traffic goes to `agenticapplications.googleapis.com`, project `mtech-ecom-prod`, with agent ID `Ush2mu9quohL0oe7`. Session pattern: POST to `/v1/sales:retrieveConfig`, then POST shopping events to `/v1/sales/projects/mtech-ecom-prod/locations/global/commerceSessions/{id}/shoppingEvents`.

Adobe Experience Platform runs via the Alloy SDK (`window.alloyConfigured = true`), org ID `8D0867C25245AE650A490D4C`, fires to `edge.adobedc.net`. Adobe Audience Manager identity acquisition fires on every page to `adobedc.demdex.net`. Tealium iQ (account `macys`, profile `main`, version `ut4.0.202604011317`, container ~757KB) is the central tag orchestration layer.

**Subdomains observed:**
- `api.macys.com` — 503 (exists, Akamai-blocked from outside)
- `m.macys.com` — 403 (mobile site)
- `auth.macys.com` — 503 (OAuth2 service, internal-only)
- `expcore.macys.com` — 503 (experimentation service, confirmed in `window` globals as `experimentationHost`)
- `api.store-macys.com` — separate origin, fires on category pages for in-store chat queue and event logging

---

## API Surface

The Nuxt frontend calls a set of first-party endpoints under `/xapi/` and other paths. A homepage load generates 52 first-party requests to 47 unique endpoints; a PDP generates 45 unique first-party endpoints. None of the core product endpoints require authentication.

**Feature flags endpoint**

`GET /xapi/navigate/v1/header-footer/switches` returns ~90 feature flags as flat JSON with no authentication. Also returns two keys used by the frontend for request signing:
- `xMacysApiKey`: `OYjiwlwH9hT0ELLSBNV7QLisNpbsB2bexn49nAAJG8XnoS8E`
- `hmacKey`: `uxDMkWnfaBComNyJsQTfDjyFqZvPi5qr4Kz92GwsxInJpIV2bpPENYoG368k387p`

These are client-side operational keys for HMAC request signing between the Nuxt frontend and the xapi backend. The feature flag inventory is the more useful output. Flags active (`true`): `convoCommerceEnabled`, `login365Enabled`, `persistentLoginEnabled`, `bronzeSilverLoyaltyFST`, `dbedHeaderRedesignEnabledDesktop`, `priceSimplificationEnabled`, `rviInSearchEnabled`, `bestSellerExperimentEnabled`, `curbsidePickupEnabled`, `enhancedMobileNavEnabled`, `rnChatEnabled`, `inStoreCurbsidePickupEnabled`. Flags inactive (`false`): `isOutletEnabled`, `headerAsAServiceEnabledHomePage`, `headerAsAServiceEnabledPDP`, `headerAsAServiceEnabledBag`, `headerAsAServiceEnabledLoyalty`, `csPagesOnIBMEnabled`, `dbedHeaderRedesignEnabledMobile`, `globalPreciseDeliveryDateEnabled`.

**Product API**

`GET /xapi/digital/v1/product/{id}` returns a full product object without authentication. On a single PDP load, 45 product IDs are fetched (the viewed product plus related/recommended items). The response includes:
- Pricing with tier breakdown (`tieredPrice`) and promo badges (`badgesMap`)
- Availability: `available`, `lowAvailability`, `bopsAvailability`, `storeAvailability`
- Full color swatch map (57 swatches observed on a cosmetics product)
- Product flags: `chanel`, `hermes`, `coach` (brand exclusivity indicators), `gwpIndicator` (gift with purchase), `truefitEligible`, `bigTicketItem`, `phoneOnly`
- Internal taxonomy: `departmentId`, `divisionName` (e.g., `"PRESTIGE COSMETICS"`)
- `ccfp` — internal field, purpose not resolved
- Review data via `productReviews`

Product IDs observed in a homepage load: `25459392`, `24259000`, `24677067`, `24340573`, `25355478`, `24174222`, `24366353`, `24629055`, `24527575`, `24469209`, `25585279`, `24483936`, `25460788`, `24784611`, `24469173`, `25939914`, `18764819`, `18516466`, `24796636`, `21513645`, `18747193`, `23635461`, `20593878`, `25263493`, `19879599`, `25233761`, `24523809`, `16708566`, `4589776`, `24523781`, `15323085`, `25631856`.

**Event badging config**

`GET /eventBadging/eventContentMCOM.json` — public, no auth. Contains the internal order method taxonomy used for shipping message copy:
- Order methods: `STR1`, `POOL`, `DROP`, `EXT`, `FACS`
- Order types: `STH` (ship-to-home), `SDD` (same-day delivery), `NDD` (next-day delivery)
- Cut-off times, buffer days, and promotional message strings

**Additional endpoints observed:**
- `GET /xapi/preferences/v1/stores/preferred` — user's preferred store (200 on homepage, 400 on signin page)
- `GET /api/store/v2/stores/shipTo/{zip}` — store lookup by ZIP; ZIP `94545` observed
- `POST /sdp/rto/request/recommendations` — recommendations engine; fires on homepage and PDP
- `POST /userEventsConsumer/api/userevents/log` — user event stream logging
- `POST /EventsWar/events/record/customeraction` — customer action event recorder
- `POST /api/track/customer_patch` — customer data patching
- `POST /api/track/search` — search event tracking
- `POST /api/track/viewed_product` — product view tracking
- `GET /filteredExperiments` — experiment assignments (200 with session context, 404 without)
- `GET /sm/v1/carousel-items/sm-product-desktop` — sponsored media carousel (PDP only)
- `GET /xapi/digital/v1/product/{id}/store/bopsavailable` — BOPS availability (PDP)
- `POST /xapi/digital/v1/product/gwp/promoBasedOnBag` — gift-with-purchase eligibility
- `GET /suggester` — search autocomplete (search pages)
- `GET /api/store-macys.com/chat/queue/pics/{store-slug}` — store chat queue (via `api.store-macys.com`, category pages)
- `POST /api/store-macys.com/event-queue` — store event queue

---

## The Token Endpoint

`POST /search/v1/conversation/get-token/public` is a public token vending machine for Google Cloud OAuth2 bearer tokens. It accepts any POST body (including empty `{}`), requires no authentication, and returns:

```json
{
  "sessionId": "ICURFNWSWEymsjxgQJSArPYet5dDHfdvh5kSeBrEa3M",
  "expiry": "2026-04-06T23:02:28Z",
  "userId": "8436211832",
  "token": "ya29.c.c0AZ4bNpbd..."
}
```

The token is a standard Google Cloud `ya29.*` OAuth2 bearer token. Verified via `tokeninfo` endpoint:
- Service account: `api-caller@mtech-ecom-prod.iam.gserviceaccount.com`
- Declared scope: `https://www.googleapis.com/auth/cloud-platform`
- TTL: ~1 hour

Five rapid calls to the endpoint returned five distinct tokens with five distinct `userId` values — no rate limiting was observed during testing.

The `cloud-platform` scope is the broadest GCP scope, theoretically granting access to all Google Cloud APIs the service account has permissions for. In practice, IAM bindings narrow the effective reach: the token grants access to `agenticapplications.googleapis.com` (the "Ask Macy's" AI chat backend) and the conversational shopping event stream, but `retail.googleapis.com` catalog listing and `storage.googleapis.com` bucket listing both return 403 (PERMISSION_DENIED) — the service account is constrained by IAM even with the broad scope declaration.

The endpoint name (`/public`) suggests this is intentional public access for the browser-side "Ask Macy's" widget, which requires a token to call `agenticapplications.googleapis.com`. The design is deliberate; the absence of any rate limiting is not.

---

## Ask Macy's — Conversational Commerce Stack

The "Ask Macy's" AI chat widget on the homepage is backed by Google Cloud's `agenticapplications.googleapis.com`, running `google.cloud.agenticapplications.v1.SalesService`. GCP project `mtech-ecom-prod`, agent ID `Ush2mu9quohL0oe7`.

The widget's network pattern:
1. Page load fires `POST /v1/sales:retrieveConfig` to `agenticapplications.googleapis.com`
2. User interaction creates a commerce session
3. Shopping events POST to `/v1/sales/projects/mtech-ecom-prod/locations/global/commerceSessions/{sessionId}/shoppingEvents`

Both calls authenticate with tokens from `/search/v1/conversation/get-token/public`.

The underlying catalog layer is Vertex AI Search for Commerce. `window.cloud_retail` exposes `collect` and `logEvent` methods for user event streaming to that service. `window.RETAIL_SEARCH_TOKEN` is a separate 231-character base64 Retail API session token, distinct from the conversation token — it encodes the serving config `default_browse` against catalog `default_catalog`.

Google Cloud Event Streaming (`ces.googleapis.com`) also fires on chat interactions: `POST /cclog/log`.

---

## Consent and Surveillance

### The Consent Setup

OneTrust version `202510.2.0` (October 2025 build) manages consent, UUID `01ccd164-62fb-406d-a827-692c34dd9eda`. The implementation is opt-out-by-default: all six consent groups arrive pre-enabled in a fresh session before any user interaction.

Cookie group state at first load (`interactionCount=0`):
```
C0001:1  — Essential
C0002:1  — Performance
C0003:1  — Functional
C0004:1  — Targeting / advertising
C0005:1  — Social media targeting
SPD_BG:1 — Special purposes / background (inferred label)
```

The consent banner renders and is visible but is non-blocking — all six groups are pre-activated. A fresh browser session has 65 cookies set by the time a user sees the banner. Declining optional cookies requires a multi-step opt-out flow.

### Tracker Inventory

33 trackers confirmed across page loads, plus OneTrust as consent manager:

**Tag Management**
1. Tealium iQ — account `macys`, profile `main`, version `ut4.0.202604011317`

**Analytics and APM**
2. Adobe Experience Platform (Alloy SDK) — org `8D0867C25245AE650A490D4C`, fires to `edge.adobedc.net`
3. Adobe Audience Manager (Demdex) — identity acquisition on every page to `adobedc.demdex.net`
4. Google Analytics 4 — measurement ID `HXF6P409HF`
5. Google Tag Manager
6. Dynatrace — RUM + APM, host `bf56263bee.bf.dynatrace.com`; session ID exposed as `window.DTM_config.dtm_user_id` (value `33491761834`)
7. New Relic — browser APM, fires only on search/category pages to `bam.nr-data.net` (account endpoint `b75a833ed4`)
8. mPulse / Akamai RUM — BOOMR, API key `WVZ92-598Q4-C592Z-HWSHG-PBBKW`, fires to `c.go-mpulse.net`

**Session Replay**
9. FullStory — org `104H4B`, fires from first page load to `rs.fullstory.com`; 17 bundle POSTs observed on homepage alone

**Advertising and Retargeting**
10. Google Ads / DoubleClick Floodlight — src `3856256` and `10289658`, fires to `ad.doubleclick.net` and `securepubads.g.doubleclick.net`
11. Facebook Pixel — `window.fbq`
12. Pinterest Pixel — `window.pintrk`, fires to `ct.pinterest.com`
13. Snapchat Pixel — `window.snaptr`
14. TikTok Pixel — `window.ttq`
15. Twitter/X Pixel — `window.twq`
16. AdRoll — advertiser ID `4ZLPZQACRNFOLJWBPC5HW4`
17. Criteo — ID resolution via `gum.criteo.com` + `mug.criteo.com`; retail media via `b.us5.us.criteo.com` (13 calls on a single PDP load); `window.criteo_q` and `window.RMJS`
18. Taboola — `pips.taboola.com`, `cds.taboola.com`, `trc.taboola.com`; account `1424784`
19. Yahoo DSP — `s.yimg.com`, config `427149.json`
20. Flashtalking — programmatic display measurement, `d9.flashtalking.com`
21. Magnet AI — retail media network, `mgln.ai`, token `984355593a054a0ba32411d4aadc87ea`
22. LoopMe — mobile advertising, `window.loopMe` global present; no network request observed in any page capture (may be conditionally loaded or mobile-only)

**Identity Resolution**
23. BounceX / Wunderkind — `window.bouncex`, `window.bxgraph`; network calls to `data.cdnbasket.net`, `page.cdnbasket.net`, `view.cdnbasket.net`, `pd.cdnwidget.com`, `ids.cdnwidget.com`
24. Bluecore CDP — `window.bluecoreSitePublic`, `window.bluecoreNV`; writes to localStorage: `bluecoreSessionData`, `bluecoreSiteVisit`, `bluecoreSiteAudience`, `bc_persist_props`, `recentlyViewedItems`
25. Signal / Coherent Path — `window.signal`, `track.coherentpath.com` in Tealium container
26. Commission Junction — affiliate tracking via `www.mczbf.com` (endpoint `/605216638554/pageInfo`)

**Attribution**
27. Kenshoo / Skai (Ktag) — tag ID `KT-N3EE6-3EB`, loads from `resources.xg4ken.com`; `window.Ktag_Constants` includes GBRAID/WBRAID handling, AMP linker, Floodlight integration; `window.Ktag_Toggles` includes `isSupportFloodlightTag`, `isDummyEnabled`
28. VideoAmp — TV/streaming attribution, `b.videoamp.com`; fires on purchase and site visit events (inferred from `window` globals — no purchase made during investigation, no network call observed)

**Personalization**
29. Movable Ink — `window.MovableInkTrack`, `window.mitr`
30. TriggerMail — email retargeting, `window.triggermail`, `window._pp`

**Surveys and NPS**
31. Medallia — `window.KAMPYLE_*`, `window.MDIGITAL_*`; fires to `resources.digital-cloud.medallia.com` and `analytics-fe.digital-cloud.medallia.com`; loads additional form data on the signin page

**Fraud Detection**
32. Riskified — `c.riskified.com/client_infos.json`; fires only on auth/signin pages

**Social Proof**
33. Taggstar — `api.us-east-2.taggstar.com/api/v2/key/macyscom/category/visit`; social proof nudges on category pages; customer key `macyscom`

### The Data Layer

`window.utag_data` has ~130 keys. PII hashes present (populated when signed in):
- `customer_email_sha256`
- `customer_first_name_sha256`, `customer_last_name_sha256`
- `phone_number_sha256`, `order_phone_number_sha256`
- `order_email_sha256`
- `tealium_vid_hash256`

Attribution IDs in the data layer:
- `skai_uuid` — Kenshoo/Skai paid search session
- `capi_dedupe_id` — Facebook CAPI deduplication ID (correlates browser pixel with server-side events)
- `macys_bagguid` — persistent bag/cart GUID
- `adobe_visitor_id`, `tealium_visitor_id`, `tealium_session_id`
- `target_activities`, `target_activity_ids`, `target_activity_names`, `target_experience_names` — Adobe Target slots

Data layer observer rules map the same data layer to five downstream schemas simultaneously:
- `_dlo_rules_adobe_am` — Adobe Analytics
- `_dlo_rules_ceddl` — CEDDL standard
- `_dlo_rules_google_ec` / `_dlo_rules_google_ec_ga4` — Google Enhanced Commerce
- `_dlo_rules_google_em` / `_dlo_rules_google_em_ga4` — Google Enhanced Measurement
- `_dlo_rules_tealium_retail` — Tealium Retail

### The SEED Cookie

The `SEED` cookie carries the complete A/B experiment assignment state in plaintext:

```
SEED=-2901650527506512156|2594-21,2614-21,2726-21|2461-22,2542-21,2547-21,...
```

Format: `{hash}|{cohort_ids}|{experiment_id}-{variant_id},...`

The cookie is `httpOnly: false` and `sameSite: lax` — readable by JavaScript and transmitted via same-origin and form POST cross-origin. Every third-party JavaScript tag executing in the first-party context has read access to the full experiment assignment. 17 experiment IDs in `window.experimentation_ids`: `2550-21`, `2810-21`, `2723-21`, `2728-20`, `2729-21`, `2706-21`, `2461-22`, `2812-21`, `2542-21`, `2547-21`, `2678-21`, `2585-21`, `2712-21`, `2711-21`, `2754-21`, `2718-21`, `2601-21`.

---

## Credential Exposure

### Signin Config Endpoint

`GET /account-xapi/api/account/signin` requires no authentication and returns:

```json
{
  "user": {
    "killswitches": {
      "oauth2LoginOTPEnabled": "false",
      "oauth2DeviceFingerPrintEnabled": "true",
      "signInCaptchaEnabled": "true",
      "newAuthWebDomainEnabled": "true",
      "authWebEnabled": "false",
      "isPreRenderCheckoutEnabled": true
    },
    "hosts": {
      "authwebBaseUrl": "https://auth.macys.com",
      "experimentationHost": "//expcore.macys.com",
      "secureHost": "https://www.macys.com",
      "authwebKey": "cGpqNjhwY2FtYmJ1cWIyODh5NmFuN3Y1Om1lVVlGRlJDYWhyOUtXRkRHdDZoUjR3Mg=="
    },
    "googleRecaptchaLoginSiteKey": "6LeBmfQbAAAAAP4QMXwFhljA4MZme6xEJJh3rGxT"
  }
}
```

The `authwebKey` base64-decodes to `pjj68pcambbuqb288y6an7v5:meUYFFRCahr9KWFDGt6hR4w2` — canonical OAuth2 `client_id:client_secret` format. These are credentials for `auth.macys.com`. That service returns 503 from external requests — it is accessible only from within Macy's internal network. The credentials are exposed to every unauthenticated visitor who loads the signin page but cannot be used to authenticate against the OAuth endpoint from outside.

The `SNSGCs` cookie set on the signin response carries what appear to be session filter bypass flags:
```
bypass_session_filter1_92_false3_87_last_access_token1_92_1775512666501
```
The semantics of the numeric suffixes and the session filter being bypassed are not resolved.

### Internal Infrastructure in Production Tealium Container

Two internal hostname references found in the production Tealium container:
- `user-events-consumer-poc.devops.fds.com` — a POC development environment URL for a user events consumer service. `fds.com` is Federated Department Stores, Macy's corporate parent's legacy domain.
- `www.perf18k.tbe.zeus.fds.com` — an internal FDS performance testing server; redirects to `macys.com` when accessed externally.

Neither is directly exploitable, but both confirm internal FDS network naming conventions and were not scrubbed before production deployment of the Tealium container.

---

## Product Direction Signals

**Active IBM WebSphere migration** — `csPagesOnIBMEnabled: false` with the IBM generator tag still present on error pages. Homepage, search, PDP, and category pages are Nuxt. Checkout and order management are inferred to still be on the IBM stack (not directly observed).

**Outlet disabled** — `isOutletEnabled: false`. No outlet store accessible.

**Header-as-a-Service** — The entire `headerAsAServiceEnabled*` flag family is false across every page type (`HomePage`, `PDP`, `Bag`, `Loyalty`, `CMP`, `ImpWeb`, `DiscoveryPages`). The composable header infrastructure is built; delivery is disabled everywhere.

**Loyalty tier testing** — `bronzeSilverLoyaltyFST: true`. Bronze and silver tier experiences are in active A/B testing.

**Price simplification** — `priceSimplificationEnabled: true`. Actively deployed.

**Desktop header redesign** — `dbedHeaderRedesignEnabledDesktop: true` (active), `dbedHeaderRedesignEnabledMobile: false` (not yet).

**Retail media two-track** — Criteo retail media (`window.RMJS`, `window.retailMediaAdRequest`) and Magnet AI (`mgln.ai`) run in parallel. Criteo fires 13 calls on a single PDP load (`b.us5.us.criteo.com`). These appear to be separate demand channels, not A/B alternatives.

**Taggstar scarcity nudges** — social proof signals on category pages via `api.us-east-2.taggstar.com/api/v2/key/macyscom/category/visit`. Not observed on PDP.

---

## Machine Briefing

### Access and Auth

The Akamai WAF blocks all direct `curl` requests — headed browser automation (Playwright or similar) required for any page load. Most endpoints documented here were called via `fetch` inside `page.evaluate` to inherit the browser's `_abck` and `bm_sz` cookies. Direct HTTP calls will return 403.

The `/search/v1/conversation/get-token/public` endpoint returns GCP OAuth2 tokens usable against `agenticapplications.googleapis.com`. For most other API calls, the existing browser session cookies are sufficient.

### Endpoints

**Open — no auth, call from browser context:**

```
GET https://www.macys.com/xapi/navigate/v1/header-footer/switches
# Returns ~90 feature flags + xMacysApiKey + hmacKey

GET https://www.macys.com/xapi/digital/v1/product/{product_id}
# Full product: pricing tiers, availability, swatches, flags, internal taxonomy
# Sample IDs: 25459392, 24259000, 24677067, 24340573, 25355478, 4589776

GET https://www.macys.com/xapi/digital/v1/product/{product_id}/store/bopsavailable
# BOPS (buy online pick up in store) availability by product

GET https://www.macys.com/api/store/v2/stores/shipTo/{zip}
# Store lookup by ZIP code

GET https://www.macys.com/eventBadging/eventContentMCOM.json
# Shipping event messaging config; internal order method taxonomy

GET https://www.macys.com/account-xapi/api/account/signin
# Auth config, killswitches, OAuth host config, reCAPTCHA key — no auth required

GET https://www.macys.com/xapi/preferences/v1/stores/preferred
# User's preferred store

GET https://www.macys.com/site_targeting/macys.json
# Site-level event targeting config

GET https://www.macys.com/suggester?{query_params}
# Search autocomplete (search pages)
```

**Token endpoint — POST, no auth:**

```
POST https://www.macys.com/search/v1/conversation/get-token/public
Content-Type: application/json

{}

# Response: { sessionId, expiry, userId, token }
# token = ya29.* GCP bearer token
# service account: api-caller@mtech-ecom-prod.iam.gserviceaccount.com
# scope: cloud-platform, TTL ~1 hour
# Note: GET returns 405 (error code 23004)
```

**Ask Macy's AI — requires GCP token:**

```
POST https://agenticapplications.googleapis.com/v1/sales:retrieveConfig
Authorization: Bearer {token_from_above}

POST https://agenticapplications.googleapis.com/v1/sales/projects/mtech-ecom-prod/locations/global/commerceSessions/{sessionId}/shoppingEvents
Authorization: Bearer {token_from_above}
```

**In-store services — separate origin:**

```
GET https://api.store-macys.com/chat/queue/pics/{store-slug}
# Store chat queue; example slug: macys-sun-valley-shopping-center

POST https://api.store-macys.com/event-queue
```

**Event logging — session-bound:**

```
POST https://www.macys.com/userEventsConsumer/api/userevents/log
POST https://www.macys.com/EventsWar/events/record/customeraction
POST https://www.macys.com/api/track/search
POST https://www.macys.com/api/track/viewed_product
POST https://www.macys.com/api/track/customer_patch
```

### Gotchas

- **Akamai WAF** — all requests need a browser session with valid `_abck` and `bm_sz` cookies. Direct HTTP returns 403.
- **`/filteredExperiments`** — returns 200 in page context, 404 without a valid session. Cannot be called cold.
- **`/xapi/preferences/v1/stores/preferred`** — returns 400 on the signin page, 200 on all others.
- **Token endpoint method** — must be POST. GET returns 405 with error code `23004`.
- **Product IDs** — numeric. IDs as low as `74843` appear in recommendation carousels; likely no upper bound enumeration protection.
- **Criteo volume** — 13 calls to `b.us5.us.criteo.com/rm` fire on a single PDP load. Network captures from PDP will be noisy.
- **New Relic** — present only on search/category pages. Absent from homepage and PDP.
- **Riskified** — present only on signin/auth pages.
- **`/sdp/rto/request/recommendations`** — fires on homepage and PDP; returns 200 but response structure not captured. Purpose inferred as real-time personalized offer recommendations.
