---
# agents: machine-friendly instructions in "## Machine Briefing"
title: JCPenney — Teardown
url: "https://www.jcpenney.com"
company: JCPenney
industry: Retail
description: "US department store chain selling apparel, home goods, and accessories"
summary: "JCPenney runs a custom React SSR platform called Yoda on Spring Boot 2 / Zuul gateway, served behind Akamai and deployed on AWS in a Docker Enterprise cluster (prod5). Static assets live at www.static-jcpenney.com with explicit release versioning (release-yoda-home-2602.1.14). Despite the modern frontend, checkout runs on Oracle ATG Commerce — confirmed by a debugSource flag in the Adobe Analytics data layer — with JSP-era URLs still present in robots.txt. Product data, real-time inventory, and active promotional coupon codes are accessible without authentication via browse-api.jcpenney.com."
date: 2026-04-06
time: "22:18"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack:
  - React SSR
  - Spring Boot
  - Zuul Gateway
  - Oracle ATG Commerce
  - Akamai CDN
  - Adobe Scene7
  - Solr
  - Docker Enterprise
trackers:
  - Adobe Analytics
  - Adobe Target
  - Adobe Audience Manager
  - Dynatrace
  - mPulse
  - OneTrust
  - Google Ads
  - DoubleClick
  - Facebook Pixel
  - TikTok Pixel
  - Pinterest Tag
  - Reddit Pixel
  - Spotify Pixel
  - Criteo
  - Attentive
  - LiveRamp ATS
  - ID5
  - 33Across
  - Audigent
  - Optable
  - Yahoo ConnectID
  - Prebid.js
  - Freestar
  - CJ Affiliate
  - AdRoll
  - Curalate
  - Medallia
  - NICE inContact
  - BrightEdge
  - Iovation
tags:
  - retail
  - ecommerce
  - legacy-platform
  - oracle-atg
  - open-api
  - pre-consent-tracking
  - source-maps
  - identity-graphs
  - header-bidding
  - ad-tech
headline: "JCPenney's product API exposes live inventory counts and active coupon codes to anyone with curl, no authentication or session required."
findings:
  - "browse-api.jcpenney.com returns per-SKU inventory levels and the active promo code ('ORCHIDS' = 20% off) for any product without authentication — meaning bots and competitors can monitor stock and pricing in real time"
  - "OneTrust consent banner is suppressed (IsSuppressBanner: true) and all tracking categories auto-accepted before the page renders, so 40+ trackers — including Facebook, TikTok, Spotify, and Reddit pixels — fire without the visitor ever being asked"
  - "Production source maps on static-jcpenney.com serve the full unminified checkout source (PaymentService.js, NewCheckoutSaga.js, NewPaymentSaga.js), exposing internal API paths for billing and order processing to anyone who downloads them"
  - "Every HTTP response includes an x-application-context header disclosing the gateway framework, container orchestrator, cluster name, internal port, and active Spring profiles — a one-header infrastructure map"
  - "Checkout still runs on Oracle ATG Commerce, a platform Oracle discontinued, confirmed by the debugSource flag 'checkout platform=legacy atg' — the replacement (checkoutRedesign) remains toggled off"
---

JCPenney's website runs deeper than its polished storefront suggests. The platform is entirely custom-built — an internal React SSR stack called "Yoda" — but underneath it: a legacy Oracle commerce engine still processing every checkout, production infrastructure details in every HTTP header, a product API with no authentication gate, and one of the more thorough ad-tech surveillance buildouts in US retail.

## The Yoda Platform

JCP's frontend is a React application called "Yoda" — their internal brand for the SSR platform. The name surfaces everywhere: in asset CDN paths (`www.static-jcpenney.com/prod5/yoda-home/`, `/prod5/yoda-site-components/`), in cookies (`__yoda` in localStorage), in internal npm package names exposed by source maps (`yoda-interfaces`, `yoda-checkout-components`, `yoda-site-components`, `yoda-core-components`, `yoda-account-components`), and in response headers (`x-yoda-ua` — Akamai's header that rewrites the inbound User-Agent to a modern Chrome string before forwarding to origin).

The stack is React with React Router, Redux, redux-saga, and loadable-components for code splitting. Server-side rendering is handled by a Spring Boot 2 application behind a Netflix Zuul gateway. Static assets are versioned by release sprint: `release-yoda-home-2602.1.14` means February 2026, sprint 1, patch 14. The site-components bundle is on `2602.1.52`.

The deployment is AWS, cluster identifier `prod5`, running on Docker Enterprise Edition. Every HTTP response advertises this via the `x-application-context` header (detailed below).

**Content and search infrastructure:**
- CMS: IRIS — an in-house system. Navigation data (`irishambergurMenu`, `IrisGlobalNavigation`, `IrisFooterGlobalNavigation`), zone content, and category trees all flow through it. The `window.__PRELOADED_STATE__` object contains `irisData` and `irisS1Targter` (the typo "Targter" instead of "Targeter" is embedded in production code). A migration to CoreMedia CMS is stalled — `enableCoreMediaContent: false` and `enableCmPage: false` in feature flags.
- Search: Solr, confirmed by `channelName: "SOLR-API"` in search API responses. Constructor.io also has localStorage state (`_constructorio_requests`, `_constructorio_search_client_id`, `_constructorio_search_session_id`) — either an ongoing A/B test or partially deployed instrumentation alongside Solr.
- Recommendations: Certona, with named slots `home1_rr` and `home2_rr` configured in the Redux preloaded state.
- Product imagery: Adobe Scene7 image CDN (`s7d1.scene7.com`, `s7d2.scene7.com`, `s7d9.scene7.com`).
- Fit recommendations: TrueFit (`cdn.truefitcorp.com`) per product (`/profile/public/v4/jcp/products/{ppId}`).
- Enhanced product content: Syndigo (`content.syndigo.com`) for enriched product pages.
- Styling/outfitting: Stylitics.
- Weekly ad: Flipp (`api.flipp.com/flyerkit/v4.0/publications/jcpenney`).
- Reviews: Bazaarvoice (client identifier: `JCPenney`).
- Payments: Synchrony Financial for JCP credit card applications (`apply.syf.com`).

## browse-api.jcpenney.com — Unauthenticated Product API

`browse-api.jcpenney.com` is the product data backend, and it requires no authentication. No session cookie, no API key, no header — a plain curl request returns structured JSON.

Three endpoints confirmed working without credentials:

**Inventory per product:**
```
GET https://browse-api.jcpenney.com/v2/product-aggregator/{ppId}/inventory
```
Returns per-SKU availability as an array of objects. Each entry has a SKU ID, an `atp` boolean (available to purchase), and a `quality` field: `"AH"` (available high) or `"AL"` (available low). Example from evidence:
```json
[
  {"id":"81601200034","atp":true,"quality":"AH"},
  {"id":"81601200067","atp":true,"quality":"AH"},
  {"id":"81601200075","atp":true,"quality":"AH"},
  {"id":"81601200083","atp":true,"quality":"AH"}
]
```

**Product details with pricing and coupon codes:**
```
GET https://browse-api.jcpenney.com/v2/product-aggregator/{ppId}/additional-details
```
Returns inventory, lot pricing (original, sale, and FPAC post-coupon prices), and — most notably — active coupon alpha codes. From evidence:
```json
{
  "couponInfo": [{
    "alphaId": "ORCHIDS",
    "amount": {"max": 30.4, "min": 30.4},
    "adjustments": [
      {"max": 20.0, "min": 20.0, "type": "PERCENTAGEOFF"},
      {"max": 7.6, "min": 7.6, "type": "DOLLAROFF"}
    ]
  }]
}
```
"ORCHIDS" is the current site-wide promotional coupon — 20% off. It appeared in both product detail responses tested (different ppIds, different price points) and in 16 of 24 jeans search results. The `fpacPriceMax` and `fpacPriceMin` fields in search results already show the post-coupon price, making the discount calculable without visiting the site.

**Product search:**
```
GET https://browse-api.jcpenney.com/v1/search-service/s?searchTerm={query}&pageSize={n}
```
Returns product records with name, ppId, ratings, current and original price range, price type (SALE/REGULAR), brand, SKU swatches, availability, and the `fpacCoupon` field. The response metadata includes `channelName: "SOLR-API"`, a `requestUrl` that echoes internal API paths with undocumented `mode` parameters, and `requestDateTime` in CDT timezone (Plano, TX).

**CORS and access:** `access-control-allow-origin: https://www.jcpenney.com` with `access-control-allow-credentials: true` — browser-side cross-origin fetches from other domains are blocked. But CORS doesn't apply to curl, bots, or server-side requests.

**Swagger UI:** `https://browse-api.jcpenney.com/swagger-ui.html` returns HTTP 200 with Springfox Swagger UI 2.9.0. The API spec endpoint returns 500 (likely a host-detection mismatch behind Akamai), but the UI shell loads and prompts for a manual spec URL. This is consistent with the "swagger" Spring Boot profile active in the `x-application-context` header.

**Rate limiting:** Five rapid consecutive requests to the inventory endpoint all returned 200 with no throttling signal.

## Infrastructure Fingerprinting

Every response from `www.jcpenney.com` includes this header:

```
x-application-context: edge-server:swagger, boot2, dockerEE_zuul, platform, devops, logging-v1, logging-v2, aws_prod5:9002
```

This is a Spring Boot auto-populated header that lists the active configuration profiles. Breaking it down:

- `edge-server` — the Spring Boot application name for the edge/gateway server
- `swagger` — a Spring Boot profile named "swagger" is active, which is why Swagger UI is reachable at browse-api.jcpenney.com
- `boot2` — Spring Boot 2
- `dockerEE_zuul` — Netflix Zuul API gateway running on Docker Enterprise Edition
- `platform`, `devops`, `logging-v1`, `logging-v2` — custom internal Spring profiles
- `aws_prod5` — AWS deployment, cluster prod5
- `9002` — Zuul is bound to internal port 9002

Additional infrastructure signals in response headers:
- `x-yoda-ua: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36... Chrome/146.0.0.0` — Akamai rewrites the inbound User-Agent to a Chrome 146 string before the request reaches origin. The header name "yoda-ua" names the internal platform directly.
- `x-trace-id: ce878a6797a0e1c9` and `x-request-id: 5ff78890-3201-11f1-90e7-23d42a2f35f5` — distributed tracing IDs exposed in every response
- `server-timing: dtTrId;desc="270e653ae7aa068b110f829f74dc4e20"` — Dynatrace trace ID in server-timing
- `x-akamai-transformed: 9l - 0 pmb=mRUM,1` — confirms Akamai's mPulse RUM beacon is being injected
- `DP-Cloud-Origin: cloud5` cookie — JCP's internal CDN/cluster routing cookie, confirms prod5/cloud5 cluster designation

## The ATG Checkout

The most consequential architectural divide: JCPenney's checkout runs on Oracle ATG Commerce. This is confirmed directly in the Adobe Analytics data layer. The `digitalData.page.attributes.debugSource` array on every page contains:

```
"checkout platform=legacy atg"
"checkoutRedesign=false"
"feDesign=Apollo"
```

Oracle ATG Commerce is a Java EE-era platform that Oracle acquired and eventually sunsetted. JCP's robots.txt still disallows `/dotcom/jsp/cart` and `/dotcom/jsp/checkout` — ATG's characteristic JSP URL structure. The internal partition is clear: the Yoda React frontend handles browse and discovery, then hands off to ATG for the transaction.

The `checkoutRedesign=false` flag indicates an ATG replacement is in development but not deployed. This is corroborated by `passAtgDevId: false` in the feature flags object — the ATG device ID passthrough is explicitly disabled. The internal design system for the frontend is named "Apollo" (`feDesign=Apollo`).

Additional checkout signals from `window.__PRELOADED_STATE__.featureFlags`:
- `enableMarketPlace: false`
- `enableRewardsPilotProgram: false`
- `enablePLCCBlackCardUpdate: false` (JCP credit card black card redesign pending)
- `enableServiceWorker: false` (no PWA/offline capability)
- `enablePhoneLogin: false`
- `enableBloomReachV3PLP: false`, `enableBloomReachNative: false` (BloomReach NLP search not in production)
- `enableCoreMediaContent: false`, `enableCmPage: false` (CoreMedia CMS migration stalled)

One other checkout detail: the checkout page loads jQuery 3.4.1 directly from `https://code.jquery.com/jquery-3.4.1.min.js` — an external CDN dependency in the payment flow, separate from JCP's own static-jcpenney.com CDN.

Tracker count drops sharply at checkout. The homepage fires requests to 106 third-party domains. The `/checkout` path shows only 8: OneTrust, Dynatrace, Adobe ECID (via `adobedc.demdex.net`), `jcpclick.com` (JCP's own affiliate tracker), Medallia, Google Ads (`pagead2.googlesyndication.com`), mPulse, and Akamai bot management. Google Ads and Medallia still fire on the payment page.

## NICE inContact Chat Config

The live chat platform (NICE inContact, now CXone) exposes its full configuration without authentication:

```
GET https://web-modules-de-na1.niceincontact.com/guide/1.0/tenants/1604/configuration
GET https://web-modules-de-na1.niceincontact.com/guide/1.0/tenants/1604/environment
```

Both return HTTP 200 to unauthenticated requests. The configuration response includes 30 routing rules — 15 for PROD, 15 for DEV — with full conditions. PROD rules include:

- `Thanksgiving Day - Closed - PROD`
- `Christmas Day - Closed - PROD`
- `New Year's Day - Closed - PROD`
- `Christmas Eve - Closing Early - PROD`
- `New Year's Eve - Closing Early - PROD`
- `DigitalChat_Reactive_Rule_PROD - Black Friday`
- `DigitalChat_FCC_Rule_PROD - Black Friday`
- `DigitalChat_Proactive_90s_Rule_PROD`
- `DigitalChat_Proactive_120s_Rule_PROD`
- `DigitalChat_ClosedHours_Rule_PROD`

Each rule contains full conditions (day of week, time ranges, URL patterns), entry point IDs, and action chains. The DEV rules mirror the PROD set and include URL conditions referencing `dt-test3.jcpenney.com` — a development environment hostname embedded in the production chat configuration file.

Named entry points:
- `DigitalChat_Proactive_90s_EntryPoint_PROD` — proactive chat offer fires after 90 seconds on page
- `DigitalChat_FCC_EntryPoint_PROD` — FCC compliance chat channel
- Channel ID: `chat_c89e0611-e743-45d6-85d2-767d8d7e0c6c`
- Tenant UUID: `11ec5491-73c1-baf0-b0e1-0242ac110003`

A feature flag in the response: `"hide-secret-field-in-knowledgebase-api": false` — the setting to hide a secret field in the knowledgebase API is explicitly disabled.

The `skill/users-available` endpoint polls on every page load (7 hits observed on homepage) to determine whether to show the chat widget.

## JS Source Maps

Production webpack bundles on `www.static-jcpenney.com` include `sourceMappingURL` comments pointing to `.js.map` files, and those map files respond HTTP 200.

The checkout bundle (`app.6e9cc95adc491d9608a5.js`) has an 834KB source map with `sourcesContent: true` — the map file contains the full unminified source code for every module, not just filename references. The checkout bundle covers 220 modules (106 app files + DLL delegates), including:

- `PaymentService.js`
- `NewCheckoutSaga.js`
- `NewPaymentSaga.js` — imports from `yoda-interfaces/lib/Order/OrderApi` and `yoda-interfaces/lib/Order/BillingApi`
- `ShippingAddressSaga.js` — imports from `yoda-interfaces/lib/Account/AccountApi`
- `config.js` — contains `micrositeName: 'yoda-microsite-checkout'`

Internal npm package names exposed: `yoda-interfaces`, `yoda-checkout-components`, `yoda-site-components`, `yoda-core-components`, `yoda-account-components`. These are JCP's internal monorepo package names and API contract paths.

The homepage bundle (`app.2a205b151bc0e731fb97.js`) also has a public source map. Both are served from `www.static-jcpenney.com/prod5/yoda-home/app/dll/scripts/`.

## Surveillance Stack

### Consent Architecture

OneTrust (consent ID `91d8c270-393d-46ef-ba23-205584531f9c`, version `202601.2.0`) is deployed with `IsSuppressBanner: true` in its configuration file. The banner is never shown to US visitors. The `OptanonConsent` cookie is set with all category groups enabled (`C0001:1,C0002:1,C0003:1,C0004:1`) and `interactionCount=0` — no user action recorded. JCP has configured OneTrust to auto-accept on behalf of users.

JCP also maintains a parallel consent cookie: `DPCPT`, set server-side by Akamai on the very first HTTP response. Format as observed: `|CP1N|CP2N|CP3N|CP4Y|CP5Y|CP6N|CP7N`. The meanings of CP1-CP4 are exposed in the homepage JavaScript:

- `CP1Y/CP1N`: `promise=v2` / `promise=v1` (order promise version)
- `CP2Y/CP2N`: `v2ItemReservation` / `v1ItemReservation`
- `CP3Y/CP3N`: `checkoutRedesign=true` / `checkoutRedesign=false`
- `CP4Y/CP4N`: `enableSSRForPLP=true` / `enableSSRForPLP=false`

CP5-CP7 mappings are not documented in client-side code. The initial DPCPT value — `|CP1N|CP2N|CP3N|CP4Y|CP5Y|CP6N|CP7N` — reflects the server's current feature routing state for new sessions.

Akamai sets additional cookies server-side before any page JavaScript runs:
- `ak_zip=94540` — ZIP code from geo-IP (HttpOnly)
- `ak_geo=37.6687,-122.0799` — latitude/longitude from geo-IP (HttpOnly)
- `ak_nb=bd-5000|tp-vhigh|nw-cable` — bot/network classification: bot-detection score 5000, traffic priority very-high, network type cable (HttpOnly)
- `Aurora=microservice` — internal routing flag
- `gc_captcha=0` — captcha bypass status

A "cookie governor" — a JCP-side script — logs "cookie removed by cookie governor" to the browser console at approximately 3.6 seconds post-load. This executes after page rendering and after tracking pixels have already fired and set cookies.

### Cookie and Identity Inventory

**Akamai:** `ak_zip`, `ak_geo`, `ak_nb`, `_abck`, `_bman`, `bm_sz`, `bm_sv`, `DP-Cloud-Origin`, `gc_captcha`, `Aurora`, `UID`

**JCP-custom:** `DPCPT` (feature routing — not consent, see above), `UID` (visitor UID, not HttpOnly — JS-readable), `DP-Cloud-Origin`

**Adobe:** `AMCVS_CEEB350F5746CDE97F000101%40AdobeOrg`, `AMCV_CEEB350F5746CDE97F000101%40AdobeOrg`, `uniqueUJId`, `mbox`, `at_check`

**Dynatrace:** `dtPCw1b9tzvy`, `rxVisitorw1b9tzvy` (tenant `w1b9tzvy`, host `bf83350awn.bf.dynatrace.com`)

**Ad/tracking:** `_fbp` (Facebook), `_gcl_au` (Google), `_tt_enable_cookie`, `_ttp`, `ttcsid` (TikTok), `_pinterest_cm` (Pinterest), `__ar_v4` (AdRoll), `_cc_id` (Conversant), `cjConsent`, `cjUser` (CJ Affiliate), `OptanonConsent` (OneTrust)

**Attentive:** `__attentive_id`, `__attentive_session_id`, `_attn_` — SMS/push platform at `jcp-us.attn.tv`. The `_attn_` cookie value references `dspil.jcp.com` — an internal deep link/redirect domain.

### localStorage Identity Graph

Eight identity systems maintain state in localStorage:

| Key(s) | System |
|---|---|
| `id5id`, `id5id_v2_*`, `id5id_extensions`, `id5id_privacy`, `id5id_cached_consent_data` | ID5 cross-site identity |
| `panoramaId`, `panoramaIdType` | LiveRamp ATS |
| `33acrossId`, `33acrossId_exp` | 33Across |
| `pbjs-unifiedid`, `pbjs_fabrickId` | Prebid.js identity modules |
| `hadronId`, `auHadronId` | AdTheorent Hadron |
| `amxId` | Amobee/TVSquared |
| `OPTABLE_*` | Optable data clean room |
| `connectId` | Yahoo ConnectID |

Audigent maintains `au/1d`, `au/seg`, `auHaloId`, `auHadronId`, and `auEids` in localStorage. The `auEids` key contains extended identity data aggregated from multiple providers.

### Ad Tech Stack

Header bidding is managed by Freestar, wrapping Prebid.js. SSPs active (confirmed from InGage bid sync traffic at `cs.ingage.tech`): Rubicon/Magnite, OpenX, ShareThrough, Index Exchange, Xandr, 3Lift, YieldMo, GumGum, Sovrn, PubMatic, AdForm, Adkernel, Advolve, Equative. Yahoo runs separately via `c2shb.pubgw.yahoo.com`.

Criteo operates across three touchpoints: retail media (`d.us.criteo.com/delivery/retailmedia`), identity sync (`gum.criteo.com`, `mug.criteo.com`), and header bidding.

Social advertising pixels: Facebook (`_fbp` cookie; Attribution Reporting API attempted and failed with a console error), TikTok, Pinterest (`ct.pinterest.com`), Reddit (`pixel-config.reddit.com`, advertiser `t2_3xv0mtue`), and Spotify (`pixels.spotify.com`, config `1a38b59b1daf4592840a7706d0267522`).

### Other Tracking Services

- **Adobe Analytics:** report suite `jcpenneyprod`, JS version 2.16.0, org ID `CEEB350F5746CDE97F000101`
- **Adobe Target:** proxied via `/rest/v1/delivery` and `/m2/jcpenney/ubox/raw` (mbox)
- **Adobe Audience Manager:** `dpm.demdex.net`, `adobedc.demdex.net`
- **mPulse (Akamai RUM):** API key `FSMSW-FSN27-22W2V-5N9KY-MWCH4`
- **Google Ads:** DoubleClick (src `6360663`), conversion IDs 974303325 and 984976096
- **Medallia (Kampyle):** tenant `563072`, feedback widget at `nebula-cdn.kampyle.com`, analytics at `analytics-fe.digital-cloud-us-main.medallia.com`
- **BrightEdge:** SEO link injection
- **Iovation:** device fingerprinting, loaded from `/prod5/yoda-assets/vendor/DeviceFingerPrint/iovation.js`
- **Curalate:** visual commerce/UGC at `edge.curalate.com`, account `uaZHTldVjQSvdMMQ`
- **Optable:** data clean room, endpoint `na.edge.optable.co`
- **JCP Affiliate:** `api.jcpclick.com/p/collector` — JCP's own affiliate/click tracking on a custom domain

## Robots.txt

```
Disallow: /expcom-api/j/        # internal API prefix exposed
Disallow: /content-aggregator/shared-components/zones/SiteWidePromo/
Disallow: /content-aggregator/shared-components/zones/SiteWideTimer/
Disallow: /dotcom/jsp/cart       # ATG JSP cart URL
Disallow: /dotcom/jsp/checkout   # ATG JSP checkout URL
Disallow: /dotcom/jsp/profile/
Disallow: /jsp/browse/pp/print/
Disallow: /jsp/profile/
Disallow: /s/                    # old search path
Disallow: /gallery/search        # legacy search
Allow: /signin
```

`/expcom-api/j/` is an internal API prefix in robots.txt — the "j/" suffix is consistent with Jersey (Java JAX-RS) REST endpoints, another signal of JCP's Java backend heritage.

## Machine Briefing

All `browse-api.jcpenney.com` endpoints are accessible without authentication. CORS restricts browser cross-origin requests to `https://www.jcpenney.com`, but curl and server-side access are unrestricted.

**Open endpoints — no auth required:**

```bash
# Per-SKU inventory (atp boolean + quality: AH/AL)
curl "https://browse-api.jcpenney.com/v2/product-aggregator/{ppId}/inventory"

# Inventory + pricing + active coupon alpha codes
curl "https://browse-api.jcpenney.com/v2/product-aggregator/{ppId}/additional-details"

# Product search — returns fpacCoupon with active promo code
curl "https://browse-api.jcpenney.com/v1/search-service/s?searchTerm=jeans&pageSize=24"

# NICE inContact chat config (30 rules, holiday schedules, DEV URL)
curl "https://web-modules-de-na1.niceincontact.com/guide/1.0/tenants/1604/configuration"
curl "https://web-modules-de-na1.niceincontact.com/guide/1.0/tenants/1604/environment"

# Swagger UI shell for browse-api
curl "https://browse-api.jcpenney.com/swagger-ui.html"
```

**First-party content endpoints:**

```bash
# Site-wide promo zone content
curl "https://www.jcpenney.com/content-aggregator/shared-components/zones/SiteWidePromo/home"

# Global navigation (L2 category tree)
curl "https://www.jcpenney.com/content-aggregator/globalnav/L2"

# Store locator
curl "https://www.jcpenney.com/v1/stores"
```

**Product ID structure:** `ppId` values follow the pattern `pp{digits}` (e.g., `pp5007821429`, `pp5008684211`). Lot IDs are the numeric portion without the `pp` prefix. SKU IDs are longer numeric strings (`81601200034`).

**Gotchas:**
- CORS on browse-api has `access-control-allow-credentials: true` but ACAO is restricted to `https://www.jcpenney.com` — browser fetch from any other origin fails. curl works.
- The search endpoint internal path includes an `/api/` prefix: `https://browse-api.jcpenney.com/api/v1/search-service/s` — this differs from the proxied path seen client-side. Both appear to resolve.
- Akamai bot management (`_abck`, `bm_sz` cookies) monitors request patterns on `www.jcpenney.com`. browse-api.jcpenney.com has less aggressive bot detection.
- The `x-application-context` header is present on all `www.jcpenney.com` responses — no special request needed to see it.
- Source map URL pattern: `https://www.static-jcpenney.com/prod5/yoda-{app}/app/dll/scripts/{filename}.js.map`
- The NiceInContact `skill/users-available` endpoint (`/guide/1.0/tenants/1604/skill/users-available`) reflects real-time agent availability.
