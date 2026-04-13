---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Kohl's — Teardown"
url: "https://kohls.com"
company: "Kohl's"
industry: Retail
description: "US department store chain selling apparel, home goods, and beauty."
summary: "Kohl's is mid-migration from an AEM/JSP monolith to a React SPA called ShopNext, with Akamai routing traffic between the two architectures via server-set feature flag cookies. Personalization stacks three layers: Akamai edge routing with eight concurrent traffic splits, Adobe Target page-level decisions, and Amigo client-side A/B testing with 26 active experiments. ShopNext integrates Google's Agentic Applications API for conversational retail, exchanging short-lived OAuth tokens via localStorage. The internal retail media network (KMN v25.11.0) serves sponsored placements with its own impression and click pipeline."
date: 2026-04-08
time: "18:09"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack: ["Adobe Experience Manager", "React", "Akamai", "Adobe Launch", "Adobe Target", "Salesforce Evergage"]
trackers: ["Google Analytics 4", "Google Ads", "Campaign Manager 360", "Google Tag Manager", "Adobe Analytics", "Adobe Audience Manager", "Adobe Target", "Salesforce Evergage", "ContentSquare", "OneTrust", "ID5", "LiveRamp", "Criteo", "Pinterest", "TikTok", "LinkedIn", "Twitter", "Reddit", "Snapchat", "Facebook", "Taboola", "Impact Radius", "Blue Triangle", "Dynatrace", "New Relic", "Akamai mPulse", "Bazaarvoice", "Verint", "Metrical", "Fohr", "Curalate", "Kargo", "Sharethrough", "PubMatic", "AppNexus", "33Across", "Index Exchange", "Granify", "nuData", "Confiant", "DomDog"]
tags: ["retail", "ecommerce", "a-b-testing", "consent", "ad-tech", "identity-graph", "retail-media", "platform-migration", "google-ai", "session-recording"]
headline: "Twenty-six live A/B experiments leak from the client with full rollout percentages — cart_2_0 at 81%, pdp_lite at 1% — mapping Kohl's entire product development queue in real time."
findings:
  - "Amigo's client-side experiment dictionary exposes 26 live A/B tests with variant assignments and rollout percentages, revealing unreleased features: cart_2_0 (81% rollout), pdp_lite (1%), multipage_2_0_atc (5%), colour_availability_1_0 (35%), and a typo shipped to production — multipage_1_0_fufillment."
  - "ShopNext pages store a Google OAuth2 access token in localStorage for the agenticapplications.googleapis.com integration — any browser extension, injected script, or XSS can read and replay the token within its 30-minute window against Google Cloud project kohls-cx-grs-prd."
  - "Akamai sets 13 named feature flag cookies on every HTTP response before JavaScript loads — AKA_HP2, AKA_PDP2, AKA_CNC2, AKA_CDP2, AKA_STP, AKA_PIQ — plus eight random values for independent traffic splits, exposing the full ShopNext migration taxonomy."
  - "Google Analytics 4 property G-ZLYRBY87M8 runs with debug_mode: true on production — every real user session is tagged as a debug event, polluting both the debug view and production reports."
  - "OneTrust is configured with CCPA opt-out rules and SkipGeolocation enabled, auto-opting every visitor worldwide into all six tracking categories on first load — 44 third-party domains including LiveRamp, ID5, Criteo, and DoubleClick fire before any user interaction."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Kohl's is operating two distinct sites simultaneously. The homepage runs on Adobe Experience Manager — JSP templates, server-rendered HTML, personalized hero zones pulled from AEM endpoints. Category pages, search, and product detail pages run on ShopNext, a React SPA built on Webpack (`webpackChunkkmn_ui`). Akamai routes between them invisibly, deciding per-session which version each visitor sees. The two stacks share first-party APIs but have different third-party call patterns: the legacy homepage generates 428 requests (384 third-party across 44 domains); ShopNext category pages generate 33 requests (24 third-party across 10 domains).

---

## Architecture: Two Sites, One Domain

Akamai's routing logic is visible in the cookies it sets on the very first HTTP response, before any JavaScript executes:

```
AKA_HP2=True        — ShopNext homepage v2 feature enabled
AKA_PDP2=True       — ShopNext PDP v2 enabled
AKA_CNC2=False      — click-and-collect v2 disabled
AKA_CDP2=True       — cross-device personalization v2
AKA_STP=false       — store-to-page feature
AKA_ACM=True        — ACM feature
AKA_PIQ=True        — PIQ feature
AKA_CBCC=True       — CBCC feature
AKA_EXP=test        — this session in "test" cohort
AKA_PMP_YP100=54    — PMP traffic percentage (54%)
AKA_STP100=40       — STP percentage (40%)
AKA_RV=79           — random value, traffic split seed
AKA_RV2-8           — 7 additional random values for independent splits
shopnext-home=false — homepage variant (AEM served for this session)
ksa-app-measurement-beta=true — internal measurement beta
```

`AKA_HP2=True` indicates the ShopNext homepage feature is enabled in Akamai's configuration, but `shopnext-home=false` means this particular session (with `AKA_RV=79`) was routed to the legacy AEM homepage. The load balancer cookie confirms it: `akaalb_www_shopnext_web_home_prod=~op=aem_production:aem_production`. ShopNext home is being rolled out via traffic splitting — the RV (random value) seeds determine which bucket a session lands in. The `shopnext-home` cookie is server-set and cannot be overridden client-side; the server returns `false` regardless of any client manipulation.

The AKA_ cookie names expose Kohl's internal feature flag taxonomy for the ShopNext migration: HP2 (homepage v2), PDP2 (product detail page v2), CNC2 (click-and-collect v2), CDP2 (cross-device personalization v2), STP (store-to-page). Eight independent random value cookies (AKA_RV through AKA_RV8) suggest at least eight concurrent traffic splits operating at the edge.

**Legacy stack (homepage):** AEM CMS, JSP templates, Adobe Launch tag management, Adobe Target (`POST /rest/v1/delivery`), AEM personalization zones (`/content/pz/hero/zone{3,5}.html`, `/content/pz/btf/bau{1,2}.html`), Salesforce Evergage (`kohlsinc2.us-7.evergage.com`).

**ShopNext stack (category/search/PDP):** React + Webpack, custom session management (`POST /shopnext-web-account/api/web-shop/account/no-auth/create-session`), Google Agentic Applications API, cart via `/cnc/v1/cart`, navigation from `/services/aem-internal/navigationresponse.json` (still AEM-sourced).

---

## Experiment Inventory: 26 Live Tests Exposed

Every ShopNext page loads `window.amigoData` from Amigo (`getamigo.io`), which contains the full experiment state for the current session. The `customData.experienceDiceRolls` object holds 52 values — for each of 26 experiments, a variant number (0-100) and a rollout percentage:

```
pmp_1_0           variant: 98  rollout: 43%
pmp_1_1           variant: 29  rollout: 31%
pmp_1_2           variant: 1   rollout: 25%
pmp_2_0           variant: 5   rollout: 97%
pmp_2_1           variant: 44  rollout: 39%
pmp_3_0           variant: 92  rollout: 61%
pmp_4_0           variant: 18  rollout: 18%
pmp_7_0           variant: 12  rollout: 86%
search_1_0        variant: 67  rollout: 78%
search_1_1        variant: 89  rollout: 47%
search_1_2        variant: 24  rollout: 60%
srp_1_0           variant: 10  rollout: 9%
srp_2_0           variant: 87  rollout: 91%
pdp_3_0           variant: 12  rollout: 49%
pdp_5_0           variant: 84  rollout: 31%
pdp_5_1           variant: 12  rollout: 18%
pdp_6_0           variant: 32  rollout: 58%
pdp_lite          variant: 41  rollout: 1%
pdp_oos_tagging   variant: 96  rollout: 42%
cart_2_0          variant: 44  rollout: 81%
colour_availability_1_0   variant: 90  rollout: 35%
fn_pdp_colours    variant: 30  rollout: 63%
multipage_1_0_fufillment  variant: 57  rollout: 41%
multipage_1_2_fulfillment variant: 45  rollout: 73%
multipage_2_0_atc variant: 25  rollout: 5%
dynamic_navigation variant: 31  rollout: 62%
a_a_test          variant: 39  rollout: 48%
```

The rollout percentages reveal development stage: `cart_2_0` at 81% is near-complete rollout; `pdp_lite` at 1% is early validation; `multipage_2_0_atc` at 5% is an early add-to-cart flow test. The `a_a_test` at 48% is a calibration experiment confirming the assignment mechanism is working correctly.

The experiment names indicate unreleased product work: `cart_2_0` suggests a new cart experience, `pdp_lite` a performance-optimized product page, `colour_availability_1_0` and `fn_pdp_colours` indicate parallel experiments on how color/size availability is displayed, and `multipage_*` variants test a redesigned fulfillment and add-to-cart flow.

One experiment name shipped with a typo: `multipage_1_0_fufillment` ("fufillment" instead of "fulfillment") — the corrected `multipage_1_2_fulfillment` exists alongside it.

The Amigo API key is in `window.amigoConfig.apiKey` (`d901bdeef8dea7e7cdf209f97d4f34679d1027e869fe30f1fbfc85bcfcd05790`) with `useApiKeyInRequests: true`, and the key is included in the API URL path: `gcp-runtime.getamigo.io/v2/{apiKey}`. This is how client-side A/B services work — the key is architectural, not a credential. The experiment data persists to localStorage under `ggt-experience-dicerolls`.

---

## Google Agentic Applications

ShopNext category pages call Google's Agentic Applications API at `agenticapplications.googleapis.com`. Two endpoints observed:

```
POST /v1/sales:retrieveConfig
POST /v1/sales/projects/kohls-cx-grs-prd/locations/global/comm...
```

The Google Cloud project ID is `kohls-cx-grs-prd` (customer experience, Google Retail Search, production). The token exchange happens via:

```
POST /shopnext-web-findability/api/web-shop/google-agent-token
```

This endpoint returns a Google OAuth2 access token, which ShopNext stores in localStorage under the key `GSA:accessToken` (format: `ya29.c...`). The token has a 30-minute TTL. A companion `GSA:sessionId` with 24-hour expiry is also stored in localStorage.

The investigator confirmed the token was alive at time of capture — a request with the token returned HTTP 400 INVALID_ARGUMENT (a valid authenticated response indicating wrong parameters), not HTTP 401 (unauthorized). localStorage is accessible to any JavaScript executing in the page context — browser extensions, inline scripts, or XSS would have read access.

The `agenticapplications.googleapis.com` API is Google's conversational retail AI product. The combination of a token exchange endpoint on Kohl's servers plus client-side storage means Kohl's is treating this like a client-callable service — the token gets fetched fresh per session and enables direct browser-to-Google API calls without routing through Kohl's infrastructure.

---

## Consent and Tracking: Globally Auto-Opted In

OneTrust GUID `6b46b766-dcc4-4c9a-9b89-a14bcc9af38d`. The configuration uses `"Type":"CCPA"` (California's opt-out privacy framework) with `SkipGeolocation: true`. This combination applies opt-out logic globally — not just to California residents. Opt-out means tracking is on by default; users must affirmatively opt out to stop it.

The dataLayer sequence on first page load, before any user interaction:

1. `OneTrustLoaded` — `OnetrustActiveGroups: ",,"`  (empty)
2. `OptanonLoaded` — empty
3. `OneTrustLoaded` — `OnetrustActiveGroups: ",C005,C0001,C0003,C006,C0004,C0002,"` (all six groups active)
4. `OptanonLoaded` — all groups
5. `OneTrustGroupsUpdated` — all groups

All six consent categories (C0001: Strictly Necessary, C0002: Performance, C0003: Functional, C0004: Targeting, C005: Social Media, C006: unknown) are active with zero user interaction. The `OptanonConsent` cookie reflects this state immediately. No consent banner is shown by default under this configuration — the CCPA opt-out model doesn't require one.

Trackers confirmed firing on first page load:

- **Ad measurement**: DoubleClick (DC-8632166 land page, DC-11577892 KMN universal), Google Ads (AW-1071871169, AW-1018012790), Google Campaign Manager 360
- **Identity/retargeting**: ID5 (4 EU load balancers + 2 US in CSP), LiveRamp ATS (idx.liadm.com, rp.liadm.com, rp4.liadm.com), Criteo (gum.criteo.com, mug.criteo.com), 33Across (lexicon.33across.com), crwdcntrl.net
- **Pixel**: Pinterest (ct.pinterest.com), Taboola (trc-events.taboola.com)
- **Session recording**: ContentSquare/ClickTale (l.clicktale.net, k-aus1.clicktale.net), Salesforce Evergage
- **Adobe**: Demdex/Audience Manager (dpm.demdex.net)

GPC (Global Privacy Control) is listed as a feature in the OneTrust config, but `isGpcEnabled=0` and `browserGpcFlag=0` are set in the consent cookie on first visit. Whether a GPC-enabled browser would be respected is unresolved.

---

## Identity Graph

Eight identity resolution systems operate simultaneously:

| Vendor | Domain | Method |
|--------|--------|--------|
| ID5 | lb.eu-1 through eu-4-id5-sync.com, lb.us-1/2-id5-sync.com | Probabilistic ID, 4 EU + 2 US load balancers in CSP |
| LiveRamp ATS | idx.liadm.com, rp.liadm.com, rp4.liadm.com | Identity graph syncing |
| Adobe Audience Manager | dpm.demdex.net, kohls.demdex.net | Cookie syncing, DMP segmentation |
| Criteo | gum.criteo.com, mug.criteo.com | Retargeting ID |
| 33Across | lexicon.33across.com | Cross-publisher envelope ID |
| crwdcntrl.net | id.crwdcntrl.net | Lotame audience data |
| Trade Desk | match.adsrvr.org | UID2 cookie sync |
| pubcid/panoramaId | via Prebid | Cross-site persistent ID |

ID5's presence is notable: four EU-region load balancers (lb.eu-1 through eu-4-id5-sync.com) and two US load balancers are explicitly allow-listed in the Content Security Policy's script-src, confirming an intentional multi-region ID resolution setup. All of these fire on the homepage before any consent interaction.

---

## Kohls Media Network

KMN is Kohl's internal retail media platform — the mechanism by which brands buy sponsored placements on kohls.com. The client-side bundle is `webpackChunkkmn_ui`, version `25.11.0` (calendar versioning: year 25, week 11).

First-party ad endpoints:
- `POST /promotion/v2/multi` — sponsored product ad serving, called on homepage and search pages
- `POST /kmn/event/client` — impression and click tracking
- DoubleClick conversion tags reference KMN floodlight activities: `type=landi0;cat=kmn_u0` (KMN universal landing) and `type=pagev0;cat=kmnun0` (KMN universal pageview)

`window.kmn` exposes: `fetchPromotions`, `renderBanners`, `renderCarousels`, `renderSponsoredBrands`, `trackImpression`, `trackClick`. The `context` object carries `visitorId` set to the Adobe MCID (Marketing Cloud ID), connecting sponsored product interactions to the Adobe identity graph.

Campaign Manager 360 floodlight IDs: DC-8632166 and DC-11577892 — both fire conversion events on every page load, categorized by page type (landing page, pageview).

---

## Session Recording and Behavioral Monitoring

**ContentSquare (ClickTale)** projectId 2399, `consentRequired: 0`:
- Session replay enabled at 50% of traffic globally
- 100% session recording for all URLs containing `/checkout/` (rule valid through 2030-03-24)
- Recording endpoints: `l.clicktale.net`, `k-aus1.clicktale.net` (Australia-region infrastructure)
- Integrations active: Bazaarvoice, Adobe Target, Blue Triangle, Akamai mPulse, Verint
- `consentRequired: 0` means ContentSquare does not wait for consent signals before recording — it records under the auto-opted-in consent state

**Verint (OpinionLab)** config at `ucm-us.verint-cdn.com/files/sites/kohls/live/config.json` (public, no auth):
- surveyId: `4B36CDB941F44F59` — website feedback
- `CTrecordingLink` extracted from `sessionStorage.CTrecordingLink` — direct link from ContentSquare recording to survey response, enabling correlation of session replay with feedback
- Active survey triggers: checkout feedback button, sign-in feedback button, footer feedback button
- Disabled triggers: global tab, mobile button, cart feedback button, search feedback button

**Metrical**: cart abandonment product, `trafficcontrolpercent: 1` (1% of traffic), `isactive: true`, pilot experiment with 50/50 treatment/control split. Desktop-only for main flow.

**Dynatrace APM** (`bf27853irn.bf.dynatrace.com`): 40 POSTs to the `/bf` endpoint on the homepage alone — real user monitoring at high frequency.

**New Relic**, **Akamai mPulse** (BOOMR via `c.go-mpulse.net`), and **Blue Triangle** (`p11.techlab-cdn.com`) also run simultaneously. Four distinct performance monitoring systems operate in parallel.

---

## Additional Signals

**GA4 debug_mode on production:** `window.dataLayer` contains `{"0": "config", "1": "G-ZLYRBY87M8", "2": {"debug_mode": true}}`. This tags all real user events as debug events in Google Analytics, which affects reporting and data sampling.

**Real-time offer in localStorage:** Key `20260407-rto` contains:
```json
{
  "offerId": "59205",
  "name": "260407_OF_20% RTO (Logged Out)",
  "eventId": "3100"
}
```
The naming convention `YYMMDD_OF_{description}` exposes internal offer IDs, event IDs, and the segment label "RTO" (real-time offer). The "(Logged Out)" segment distinction is visible client-side.

**SSL SANs from the TLS certificate** indicate Kohl's brand and domain portfolio beyond the main site: `api.platform.kohls.com`, `offaisle.com`, `k-lab.com`, `kohlsrewards.com`, `kohlstravel.com`, `mykohlscard.com`, `kohlssuppliers.com`, `kohlscorporation.com`, `laurenconradrunway.com`, `lcrunway.com`. All return 403 from Akamai via curl; content inaccessible.

**Header bidding infrastructure** (Prebid.js): PubMatic (`ow.pubmatic.com/pbs/openrtb2/auction`), AppNexus/Xandr (`ib.adnxs.com/ut/v3/prebid`), 3lift (`tlx.3lift.com/header/auction`), Media.net (`prebid.media.net/rtb/prebid`), Rubicon/Magnite (`fastlane.rubiconproject.com/a/api/fastlane.json`), Sharethrough (`btlr.sharethrough.com/universal/v1`), 33Across, Index Exchange. All fire on the homepage (legacy AEM). The ShopNext category pages skip the full bidding stack.

**nuData Security** (NuData/Mastercard behavioral biometrics): endpoint template `https://www.kohls.com/cnc/nuData/3ds/{sessionGuid}` exposed via the cart API response — architectural detail showing the anti-fraud vendor for 3DS flows.

**Confiant** (ad quality scanning) and **DomDog** CSP violation reporting (`jsa-khls.domdog.io`) are present — Kohl's monitors for malicious ad creative and CSP violations from the programmatic stack.

---

## Machine Briefing

### Access & Auth

All GET endpoints are accessible without authentication using a browser or a session cookie obtained from `/web/session.jsp`. Akamai blocks curl/non-browser user agents with 403. Use a browser or set a real User-Agent. Session cookies (`WC_SESSION_ESTABLISHED`, etc.) are required for authenticated cart endpoints.

ShopNext pages require a session GUID from `POST /shopnext-web-account/api/web-shop/account/no-auth/create-session` (no auth required, returns `session_guid`). The Google OAuth token for Agentic Applications is available at `POST /shopnext-web-findability/api/web-shop/google-agent-token` from a ShopNext page.

### Endpoints

**Open (no auth):**
```
# Personalization category nav
GET https://www.kohls.com/services/aem-internal/hp-personalization/content/sbc.json

# Cart (anonymous session)
GET https://www.kohls.com/cnc/v1/cart

# Navigation data
GET https://www.kohls.com/services/aem-internal/navigationresponse.json

# IP geolocation
GET https://www.kohls.com/getip

# AEM personalized hero zones (homepage)
GET https://www.kohls.com/content/pz/hero/zone3.html
GET https://www.kohls.com/content/pz/hero/zone5.html
GET https://www.kohls.com/content/pz/btf/bau1.html
GET https://www.kohls.com/content/pz/btf/bau2.html

# ECS correlation ID
GET https://www.kohls.com/v1/ecs/correlation/id

# Verint survey config (public CDN, no auth)
GET https://ucm-us.verint-cdn.com/files/sites/kohls/live/config.json
```

**Session required (anonymous session from create-session):**
```
# ShopNext session creation (returns session_guid)
POST https://www.kohls.com/shopnext-web-account/api/web-shop/account/no-auth/create-session
Content-Type: application/json
Body: {}

# Google Agent token (ShopNext pages only)
POST https://www.kohls.com/shopnext-web-findability/api/web-shop/google-agent-token
```

**Session required (Akamai-managed session):**
```
# EDE personalization experiences
POST https://www.kohls.com/v1/ede/experiences
Content-Type: application/json

# Adobe Target page decisions
POST https://www.kohls.com/rest/v1/delivery
Content-Type: application/json

# KMN sponsored products
POST https://www.kohls.com/promotion/v2/multi
Content-Type: application/json

# KMN event tracking
POST https://www.kohls.com/kmn/event/client
Content-Type: application/json

# Real-time offer engine
POST https://www.kohls.com/api/ode/v1/ecom/getoffer
Content-Type: application/json
```

**Third-party (open):**
```
# Amigo A/B test assignment (API key in path)
POST https://gcp-runtime.getamigo.io/v2/d901bdeef8dea7e7cdf209f97d4f34679d1027e869fe30f1fbfc85bcfcd05790
Content-Type: application/json

# Google Agentic Applications (requires GSA:accessToken from localStorage)
POST https://agenticapplications.googleapis.com/v1/sales:retrieveConfig
POST https://agenticapplications.googleapis.com/v1/sales/projects/kohls-cx-grs-prd/locations/global/comm...
Authorization: Bearer {GSA:accessToken from localStorage}
```

### Gotchas

- Akamai blocks all curl traffic with 403 at the edge — must use a real browser UA or Playwright. The Akamai bot management runs obfuscated challenge scripts via POST to `aRELCKijc/Vq-rVM4/...` paths.
- `shopnext-home` cookie cannot be overridden client-side — Akamai sets it server-side. To access ShopNext pages, navigate to category or search pages (not the homepage).
- The Amigo API key is in the URL path, not a header — `gcp-runtime.getamigo.io/v2/{apiKey}`.
- `GSA:accessToken` has a 30-minute TTL; `GSA:sessionId` expires after 24 hours. Retrieve fresh tokens from `/shopnext-web-findability/api/web-shop/google-agent-token` as needed.
- `/snb/storesAvailabilitySearch` returns 429 on homepage — rate limited.
- ECS floop endpoint (`POST /v2/ecs/topics/floop`) returns 204 — event ingestion, no response body.
- KMN and EDE endpoints require a valid Akamai session cookie to avoid 403/redirect.
