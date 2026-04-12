---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "REI — Teardown"
url: "https://rei.com"
company: "REI"
industry: "Retail"
description: "Outdoor gear and apparel cooperative with 181 retail stores."
summary: "Vue.js SSR frontend served via Akamai CDN with aggressive bot protection that blocks curl and headless browsers on sight. Tealium orchestrates 30+ trackers across two tag managers; the full Adobe suite (Analytics, Audience Manager, Target) forms the personalization spine. Constructor.io powers search on a custom zone. Java backend serves a mix of REST and internal microservices including an unauthenticated purchase velocity API."
date: "2026-04-12"
time: "21:33"
contributor: "hayabhay"
model: "opus-4.6"
effort: "high"
stack: [Vue.js, Akamai, Tealium, Constructor.io, Adobe Experience Cloud, Java]
trackers: [OneTrust, Tealium, Google Tag Manager, Adobe Analytics, Adobe Audience Manager, Adobe Target, Google Analytics, Google Ads, DoubleClick, Facebook Pixel, Pinterest Tag, Microsoft UET, Twitter Pixel, AppsFlyer, Bluecore, Qualtrics, Datadog RUM, RichRelevance, AlgoRecs, Gladly, Impact Radius, Curalate, Movable Ink, Mixpanel, Channel Advisor, Invoca, Bazaarvoice]
tags: [outdoor-retail, cooperative, purchase-velocity, api-exposure, akamai, adobe-suite, pre-consent-tracking, sales-intelligence, store-database, vue]
headline: "REI's Sitka API exposes weekly purchase counts per product, and Constructor.io returns the prices — together they reveal live per-product revenue."
findings:
  - "The /product/rs/sitka/{styleId} API returns weekly purchase counts without authentication -- 119 units/week for their top tent at $199 each. Cross-reference with Constructor.io prices and the full store database to reconstruct per-product weekly revenue."
  - "The /stores/async endpoint dumps all 240 locations including distribution centers named with 3PL partners (FS3PL Javelin, NS3PL GXO), a TESTING STORE with TEST ADDRESS1, and internal employee usernames in the lastChangedBy field."
  - "Tealium's tag 154 condition explicitly fires advertising tags when no OptanonConsent cookie exists -- first-time California visitors get Google, Pinterest, DoubleClick, Bing, and Adobe Audience Manager before any interaction."
  - "Six REI boathouses closed January 2025 and the HQ store record closed August 2023 -- the store API doubles as a timestamped operational changelog of REI's experiential retail contraction."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

REI Co-op runs one of the more layered retail stacks in the outdoor category -- Vue.js SSR on Akamai, 30+ trackers orchestrated through Tealium, a full Adobe suite for personalization, and a pair of internal APIs that hand back operational intelligence without authentication. The bot protection is aggressive enough to block curl and headless browsers on sight. The tracking architecture, on the other hand, loads unconditionally.

---

## Stack & Architecture

REI's frontend is Vue.js with server-side rendering (`__VUE_SSR_SETTERS__` present in globals), bundled via webpack (`webpackChunkweb`). The site ships a hashed main bundle (`/assets/b52ed8f943f69170b105f04be9940062f44e2a4878a`) alongside a separate search bundle under `/search-ui/`. jQuery coexists with Vue -- a common pattern in large retail rewrites where legacy components haven't been migrated.

Akamai handles CDN and bot management. The bot protection is unusually aggressive: direct `curl` requests to any endpoint return 403, the `robots.txt` path itself returns 403, and headless Playwright fails with `ERR_HTTP2_PROTOCOL_ERROR`. Headed Playwright works. Akamai sets multiple session tracking cookies (`bm_so`, `bm_sz`, `bm_sv`, `bm_lso`, `_abck`, `akamai_session`) and exposes an obfuscated pixel endpoint (`POST /akam/13/pixel_361dd281`) and a bot management endpoint at a randomized path (`POST /JBhu/ok3O/mQcT/_6/NJwg/...`).

The backend is Java. Error responses from `/fulfillment/delivery-date/pdp` use Spring Boot-style field validation messages (`[PARAMETER] [must not be null]`). The `/rest/product/catalog/{sku}` endpoint returns XML error responses -- a legacy REST service running alongside newer JSON microservices. The internal Adobe Target subdomain is `recreationalequipmen.tt.omtrdc.net` -- a truncated version of "Recreational Equipment" -- revealing the org name used during the Adobe contract.

Tag management runs through Tealium (`utag`, `tags.tiqcdn.com/utag/rei/main/prod/utag.js`) as the primary orchestrator, with Google Tag Manager (`google_tag_manager`) as a secondary layer. The `utag_data` object serves as the data layer, carrying current session state (login status, member tier, consent state, cookie values, GPC flag) to all downstream tags.

Search is handled by Constructor.io on a custom zone (`ezeubuswo-zone.cnstrc.com`), with the standard autocomplete endpoint at `ac.cnstrc.com`. The client-side API key `key_9Mi6wJ14xYHiFlPx` is in the page globals (`window.ConstructorioTracker.options.queryParams.autocomplete_key`). The CMS is an internal "CaaS" (Content-as-a-Service) system serving content at `/caas/edge`.

Additional stack signals from the CSP:
- **Payments**: Very Good Vault (`*.verygoodvault.com`) for PCI-compliant tokenization; Klarna (`*.klarna.com`, `*.klarnacdn.net`, `*.klarnaservices.com`) for BNPL; Chase (`www.chasepaymentechhostedpay.com`); PayPal; Apple Pay
- **Reviews**: Bazaarvoice (`apps.bazaarvoice.com`, client ID `rei-inc`)
- **Chat**: Gladly (`cdn.gladly.com`, `ws.us-1.gladly.chat`)
- **Shipping**: Narvar (`js.narvar.com`)
- **Affiliate**: Impact Radius (`rei.pxf.io`) and AvantLink (`*.avantlink.com`)
- **Call tracking**: Invoca (`pnapi.invoca.net`)
- **Visual UGC**: Curalate (`edge.curalate.com`, `r.curalate.com`)
- **Email personalization**: Movable Ink (`window.MovableInkTrack`)

An HTML source comment on every page reads: `<!-- If you are passionate about the outdoors and technology, visit https://rei.jobs! -->`

---

## The Sitka API: Unauthenticated Sales Intelligence

REI's internal social proof system is called "Sitka" -- likely a reference to Sitka, Alaska, continuing an internal geography-based naming convention. The API backs the "X people bought this in the past week" badges shown on product pages.

The endpoint is fully unauthenticated:

```
GET https://www.rei.com/product/rs/sitka/{styleId}
```

Response:
```json
{"SitkaData": {"actionType": "PURCHASE", "adjustmentType": "NONE", "amount": 119, "rangeType": "WEEK", "styleId": "243611"}}
```

The `actionType` field is either `PURCHASE` or `PAGE` (view count). Non-existent style IDs return `{}`.

Sample purchase velocity at time of investigation:
| styleId | Product | Purchases/Week |
|---------|---------|----------------|
| 243611 | Trailmade 2 Tent | 119 |
| 227863 | Campwell 4 Tent | 32 |
| 243613 | Campwell 6 Tent | 12 |
| 240506 | AeroPress Go Plus | 5 |

Style IDs are embedded in REI's product page URLs (e.g., `/product/243611/...`), so they require no additional discovery step.

**The three-API combination**: The Sitka endpoint exposes purchase counts. Constructor.io search results (`ezeubuswo-zone.cnstrc.com/search/{query}`) return `attrs_min_price`, `attrs_max_price`, `compare_at_price`, `attrs_percentage_off`, and a `stores` field listing which store numbers carry each product. The `/stores/async` endpoint provides the full store database. Together, these three unauthenticated APIs let you reconstruct per-product weekly revenue estimates and store-level inventory positioning for any product in REI's catalog.

Constructor.io search results also expose `casemark` -- REI's internal merchandise planning/buying identifier (e.g., `"25513"`) -- and `outlet` / `sale_products` boolean flags, useful for identifying outlet merchandise programmatically.

---

## The Store Database

`GET https://www.rei.com/stores/async` returns a JSON object keyed by store number, containing all 240 REI locations. The response is unauthenticated and not paginated. The endpoint serves the store locator but the response goes well beyond what a customer needs.

Store breakdown by type:
- `SATELLITE`: 215 (standard retail)
- `DISTRIBUTION_CENTER`: 6
- `POINT_OF_PRESENCE`: 11 (boathouses, rentals)
- `FLAGSHIP`: 5
- `CONTACT_CENTER`: 2
- `HEADQUARTERS`: 1

Distribution centers by name:
| Store # | Name | Location |
|---------|------|----------|
| 1 | SUMNER DC | Sumner, WA |
| 2 | BEDFORD DC | Bedford, PA |
| 3 | GOODYEAR DC | Goodyear, AZ |
| 4 | LEBANON DC | Lebanon, TN |
| 702 | FS3PL Javelin Newark CA DC | Newark, CA |
| 704 | NS3PL GXO GOODYEAR AZ 704 DC | Goodyear, AZ |

Stores 702 and 704 expose third-party logistics partner names directly in the `storeName` field: "FS3PL Javelin" and "NS3PL GXO" (GXO Logistics). These appear to be fulfillment partners REI hasn't scrubbed from the store locator API.

The `CONTACT_CENTER` entry for store #456 is a test record:
```json
{
  "storeNumber": 456,
  "storeName": "TESTING STORE",
  "address1": "TEST ADDRESS1",
  "city": "TEST CITY",
  "state": "WA",
  "storeType": "CONTACT_CENTER"
}
```

Every store record includes a `lastChangedBy` field containing the internal username of the last employee to modify it (e.g., `tguffee`, `jbray`, `abusche`, `kmurray`, `ewang`). This is an internal audit field that propagated to the public response.

Each record also includes operational capability flags: `isSivOn` (ship-to-inventory verification), `enabledForRSPU` (reserve-ship-pick-up), `enabledForBOPUS` (buy-online-pick-up-in-store), `enabledForCurbside`, `hasRentals`, `hasBikeShop`, `hasSkiShop`, `hasPersonalOutfitting`, `hasUsedGear`, `hasTradeIn`. These double as an operational capability map for every store.

**Retail footprint changes visible in the data:**

The 36 closed locations with `dateClosed` timestamps document REI's operational history:
- **HEADQUARTERS** (store #6, Sumner WA, `dateClosed: 2023-08-18`) -- REI relocated its headquarters in August 2023.
- **Six boathouses** closed January 2025 (`dateClosed: 1736294400000`): Ping Tom (Chicago), Enatai (Bellevue WA), Meydenbauer (Bellevue WA), National Harbor (MD), Lake James (NC), Boston Seaport. These were REI's experiential waterway rental locations, part of an outdoor experiences expansion that was reversed.
- **Seasonal rental closures**: Snoqualmie Snowshoe Rentals, Rentals at Richmond Marina -- also January 2025.

The boathouse closures align with public reporting about REI pulling back from experiential retail. The API doubles as a timestamped record of every closure decision.

---

## The Consent Picture

REI uses OneTrust (config UUID: `c634d417-db41-431a-b57f-c5bacef2da4d`) for consent management and does query the geolocation service (`GET geolocation.onetrust.com/cookieconsentpub/v1/geo/location`). It also receives a jurisdiction signal from Akamai before the page loads: the `cookie_policy=CA` cookie is set server-side, identifying the visitor as California-based.

Despite this, on first page load from a California IP, all five OneTrust consent groups activate immediately with no banner shown and no user interaction:

```
OptanonConsent=...interactionCount=0...groups=C0004%3A1%2CC0001%3A1%2CC0005%3A1%2CC0002%3A1%2CC0003%3A1
```

Decoded: `C0001=1` (Strictly Necessary), `C0002=1` (Performance/Analytics), `C0003=1` (Functional), `C0004=1` (Targeting/Advertising), `C0005=1` (Social Media). The `dtm_consent=UNSPECIFIED` cookie (Dynamic Tag Manager consent token) corroborates that consent was not captured through the expected flow.

The mechanism is hardcoded in the Tealium tag configuration. Tag 154 (the advertising tag activation condition) fires when:

```js
c[154] |= (typeof d['cp.OptanonConsent'] == 'undefined' && d['hasGPC'] != 'true') ||
           (typeof d['cp.OptanonConsent'] != 'undefined' && 
            d['cp.OptanonConsent'].toString().indexOf('C0004:1') > -1 && 
            d['hasGPC'] != 'true')
```

The first clause -- `typeof d['cp.OptanonConsent'] == 'undefined'` -- means the tag fires on any first visit before a consent cookie exists. The GPC flag (`d['hasGPC']`) is the only gate, and it defaults to `false`. A first-time visitor to rei.com who doesn't have a GPC-enabled browser will have advertising tags fire before OneTrust has done anything.

Trackers confirmed firing in network captures on a fresh California session with no prior cookies:
- **Google Ads** (`www.google.com/ccm/collect`, `www.google.com/rmkt/collect/1069764188/` -- remarketing)
- **DoubleClick** (`ad.doubleclick.net/activity` -- retargeting)
- **Pinterest** (`ct.pinterest.com/user/`, `ct.pinterest.com/v3/`)
- **Bing Ads** (`bat.bing.com/p/conversions/c/e`)
- **AppsFlyer** (`wa.appsflyersdk.com/events`)
- **Bluecore** (`onsitestats.bluecore.com/events`, `api.bluecore.com/api/track/merge`)
- **Impact Radius** (`rei.pxf.io/xc/3771926/1448522/17195`)
- **Adobe Audience Manager / Demdex** (`dpm.demdex.net/id` -- cross-publisher identity graph)

Facebook Pixel (`window.fbq`, `connect.facebook.net/en_US/fbevents.js`) loads in the page but did not produce a network request in the fresh-load capture.

---

## Tracker Stack

REI runs 30+ distinct tracking integrations. Organized by function:

**Tag Managers**
- Tealium IQ (`utag`, `tags.tiqcdn.com`) -- primary orchestration layer
- Google Tag Manager (`google_tag_manager`) -- secondary

**Analytics**
- Adobe Analytics AppMeasurement v2.20.0 (`window.AppMeasurement`, `window.s`, `somni.rei.com/b/ss/reiprod/`)
- Google Analytics (`window.gtag`, `window.dataLayer`)
- Datadog RUM (`window.DD_RUM`, `browser-intake-datadoghq.com`) -- 20-21 requests per page load
- Mixpanel (`mp_rei_us_mixpanel` cookie with `distinct_id`)
- Snowplow (`window.gladly_snowplow`, loaded via Gladly)

**Identity & Audience**
- Adobe Experience Cloud (`window.Visitor`, `AMCV_*` and `AMCVS_*` cookies, `s_ecid`)
- Adobe Audience Manager / Demdex (`window.DIL`, `dpm.demdex.net`) -- cross-publisher identity graph
- Adobe Target (`window.mboxCreate`, `recreationalequipmen.tt.omtrdc.net`, `mboxedge35.tt.omtrdc.net`, `mbox` + `at_check` cookies)

**Advertising Pixels**
- Google Ads / DoubleClick (`window.gtag`, `window.google_tag_manager`, DC account `4362844`)
- Facebook Pixel (`window.fbq`, `window._fbq`, `_fbp` cookie)
- Pinterest Tag (`window.pintrk`, `ct.pinterest.com`, `_pin_unauth` cookie)
- Microsoft UET / Bing Ads (`window.uetq`, `bat.bing.com`, `_uetsid` + `_uetvid` cookies)
- Twitter/X Pixel (`window.twq`, `static.ads-twitter.com`)
- Snapchat (`tr.snapchat.com` in CSP)
- TikTok (`analytics.tiktok.com` in CSP)
- Channel Advisor (`tracking2.channeladvisor.com`, `t.channeladvisor.com`)

**Mobile Attribution**
- AppsFlyer (`window.AF`, `window.AppsFlyerSdkObject`, `wa.appsflyersdk.com`, `wa.onelink.me`, `afUserId` cookie)

**Email & Retargeting**
- Bluecore (`window.triggermail`, `window.bluecoreSitePublic`, `api.bluecore.com`, `onsitestats.bluecore.com`)
- Movable Ink (`window.MovableInkTrack`)

**Recommendations**
- RichRelevance (`window.RR`, `recs.richrelevance.com`, `rr_rcs` cookie, page-type functions: `r3_home`, `r3_item`, `r3_category`, `r3_cart`, `r3_purchased`, `r3_search`, `r3_wishlist`, `r3_addtocart`, `r3_addtoregistry`)
- AlgoRecs (`recs.algorecs.com`) -- second recommendation engine, loads as asset
- Constructor.io (`window.ConstructorioClient`, `window.ConstructorioTracker`, `ConstructorioID_*` cookies)

**Affiliate**
- Impact Radius (`window.ire`, `rei.pxf.io`, `IR_gbd`, `IR_17195`, `IR_PI` cookies)
- AvantLink (`*.avantlink.com` in CSP)

**Support & Surveys**
- Gladly chat (`window.Gladly`, `cdn.gladly.com`) -- three configs: `rei.com.json`, `rei.com-dynamic.json`, `rei.com-sales.json`
- Qualtrics Site Intercept (`window.QSI`, zone `ZN_9YKZvxooAxGhiL3`, `siteintercept.qualtrics.com`)

**Fraud & Trust**
- ThreatMetrix / LexisNexis (`prod.accdab.net/beacon/gt`) -- device fingerprinting, fires on cart page
- Norton Shopping Guarantee (`www.cdn-net.com/s3`) -- trust seal, fires on cart page

**Monitoring**
- Datadog RUM (`window.DD_RUM`, `_dd_s` cookie, `browser-intake-datadoghq.com`)

**Unidentified**
- `odeaiqfw.micpn.com/p/js/1.js` -- obfuscated domain, loads JavaScript. Not publicly documented.
- `p11.techlab-cdn.com` -- loads 4 JS files (`65319_1825142941.js`, `65257_1825202430.js`, `64885_1825202492.js`, `65226_747628124.js`). Vendor unknown.
- `hm.baidu.com` in CSP `connect-src` -- Baidu web analytics. Presence on a US domestic outdoor retailer is unexplained; could be a legacy integration or vendor bundling. Not observed as an active network request in captured sessions.

The Gladly chat widget uses different configs per page context: general pages load `rei.com.json`, product pages load `rei.com-sales.json`. The dynamic config (`rei.com-dynamic.json`) shows current availability, office hours (Mon-Fri 6am-8pm PT, Sat-Sun 8am-5pm PT), and feature flags: `chatV2: false` (REI has not migrated to Gladly's v2 chat engine), `demoMode: false`.

The Bluecore config (`siteassets.bluecore.com/site_targeting/rei_us.json`) shows A/B testing, audience targeting, and location targeting all disabled (`abEnable: false`, `audienceEnabled: false`, `locationEnabled: false`) -- REI is using Bluecore in a basic email retargeting mode only, not the full platform.

---

## Internal Signals

**Tealium page taxonomy** -- The `utag.js` tag fire conditions use an internal page naming system that reveals REI's full product surface:
- `rei:home`, `rei:product details:{name}_{id}`, `rei:nav_search:{query}` -- main commerce
- `checkout:cart`, `checkout:order confirmation` -- checkout
- `membership:mastercard_apply`, `membership:mastercard_landing`, `membership:mastercard/instant-credit` -- REI Mastercard flow
- `opo:cart_confirmation`, `opo:day_confirmation` -- Outdoor Planning & Outfitting (OPO) service
- `adventures:trip details_choose dates_modal` -- REI Adventures guided trips
- `used:...` -- REI Used Gear
- `cedar:documentation` -- "Cedar" is the internal codename for the help center (`cedar.rei.com` redirects to `/help`)
- `community:...` -- Community forums
- `blog:...`, `expert_advice:...` -- Content sections

One tag condition checks for a specific product ID: `d['products'].toString().indexOf('648592')>-1` -- suggesting product 648592 triggers special tag behavior, possibly a membership or gift card SKU.

**Active A/B test** -- `REI-Test-Segment=95 percent passthrough` is set by Akamai at the edge on every session. 5% of traffic goes to an alternate experience. The test is infrastructure-level (edge rendering or CDN config) rather than a product feature flag.

**Subdomains**:
- `wpvip.rei.com` -- WordPress VIP instance, publicly accessible (no auth). WordPress 6.8.5, title "Root." WP REST API is open (no posts or pages visible publicly). Installed plugins visible via REST API routes: Popup Maker, Jetpack, Yoast SEO, Gravity Forms, ElasticPress, WP Parsely -- 16+ plugins. This appears to be a staging or quiz content instance; a `quizSiteUrl` config is present. Set to `noindex`.
- `help.rei.com` -- Static HTML site hosted on S3 with AES256 server-side encryption.
- `conversations.rei.com` -- AWS CloudFront + API Gateway. Returns 403 `MissingAuthenticationToken` on unauthenticated requests -- this is the community forums backend.
- `cedar.rei.com` -- Akamai-hosted, redirects to `/help`. The Cedar codename for the help center.
- `satchel.rei.com` -- Referenced as a `preconnect` link hint in response headers but unresponsive to direct requests. Likely an internal microservice endpoint.

**Backend architecture signals** -- Error messages reveal internals:
- `/fulfillment/delivery-date/pdp`: Spring Boot-style validation (`[PARAMETER] [must not be null]`)
- `/rest/product/catalog/{sku}`: XML response with `size must be between 10 and 10` -- expects a 10-digit SKU, returns XML not JSON
- `/customer-analytics-attributes/rs/customer/visitors/{visitorId}`: Returns 404 for anonymous users, but the path includes the visitor's full Adobe MCMID visitor ID -- confirms this endpoint returns personalization attributes for authenticated users

**Meta tags** -- Two non-standard `<meta>` tags appear in the HTML: `x-rei-original-title` and `x-rei-original-description`, each containing base64-encoded versions of the page title and description. Possibly an SSR artifact or a legacy internationalization hook.

**REI_DEVICE_ID cookie**: `0fc4eee3e606e635e68a011a0516e0eb|45f12eb707ea542128ac6c8d5b253e77dc8dd2f4d0df536a129f5200d5357e0b` -- a composite device fingerprint (likely a hash + salted hash pair) set first-party. Persists independently of other tracking cookies.

---

## Cart & Fraud Stack

Two vendors that aren't present on the homepage appear on the cart page:

**ThreatMetrix / LexisNexis** (`prod.accdab.net/beacon/gt`) -- real-time device fingerprinting for fraud risk scoring. Fires when the cart page loads. ThreatMetrix (now owned by LexisNexis Risk Solutions) aggregates device signals against a global identity graph to produce a real-time fraud risk score for each session.

**Norton Shopping Guarantee** (`www.cdn-net.com/s3`) -- a trust badge / purchase protection seal. `cdn-net.com` is the CDN for Norton Shopping Guarantee (owned by Wunderman Thompson Commerce).

The CSP also lists Very Good Vault (`*.verygoodvault.com`) for payment tokenization -- a PCI-compliant vault service that handles card data before it reaches REI's own servers.

---

## Machine Briefing

### Access & Auth

Most of REI.com is behind Akamai's bot protection. `curl` and headless automation return 403. Headed browser sessions work. The site sets ~30 cookies on first load; most tracking endpoints don't require any specific auth cookie.

The internal APIs documented here -- Sitka, stores, Constructor.io -- all work without authentication from a regular browser context. Constructor.io's search API can be called directly with the public API key.

### Endpoints

**Purchase velocity (no auth)**
```
GET https://www.rei.com/product/rs/sitka/{styleId}
# styleId from product URL, e.g. 243611
# Returns: {"SitkaData": {"actionType": "PURCHASE", "amount": 119, "rangeType": "WEEK", "styleId": "243611"}}
# Empty {} for invalid IDs
```

**Full store database (no auth)**
```
GET https://www.rei.com/stores/async
# Returns JSON object keyed by store number, all 240 locations
# Fields: storeType, storeNumber, storeName, address, city, state, phone, 
#         dateClosed, lastChangedBy, isSivOn, enabledForBOPUS, hasRentals, etc.
```

**Individual store (no auth)**
```
GET https://www.rei.com/retail-stores/stores/{storeNumber}
# e.g. /retail-stores/stores/143
```

**Inventory levels (no auth, requires valid SKU format)**
```
GET https://www.rei.com/rest/inventory/skuInventoryLevels?storeNumber={n}&skuIds={skuId}
# SKU format: 10-digit string
# Returns empty array if SKU not found
```

**User-generated content (no auth)**
```
GET https://www.rei.com/product/rs/ugc/{styleId}
# Returns: {"UgcData": {"images": [...], "size": N}}
```

**UGC placement (no auth)**
```
GET https://www.rei.com/rs/ugc-placement
# Returns Curalate image items with spatial tags and multi-size URLs
```

**Delivery date estimate (no auth, POST)**
```
POST https://www.rei.com/fulfillment/delivery-date/pdp
Content-Type: application/json
# Body requires: {"orderLines": [...]}
# Spring Boot validator -- expects non-null orderLines
```

**Product catalog (no auth)**
```
GET https://www.rei.com/rest/product/catalog/{10-digit-sku}
# XML response format
# Error if SKU is not exactly 10 characters
```

**CMS content (no auth)**
```
GET https://www.rei.com/caas/edge
# Returns CMS content for the current page context
```

**Constructor.io search (public API key)**
```
# API key: key_9Mi6wJ14xYHiFlPx
# Zone: ezeubuswo-zone.cnstrc.com

GET https://ezeubuswo-zone.cnstrc.com/search/{query}?key=key_9Mi6wJ14xYHiFlPx&fmt_options[groups_start]=1

GET https://ac.cnstrc.com/autocomplete/{query}?key=key_9Mi6wJ14xYHiFlPx

# Search results include: price, compareAtPrice, percentage_off, stores (array of store numbers),
#   casemark (internal buying identifier), outlet flag, sale_products flag, price_group
```

**Customer analytics attributes (auth required)**
```
GET https://www.rei.com/customer-analytics-attributes/rs/customer/visitors/{visitorId}
# Returns 404 for anonymous users
# visitorId is the Adobe MCMID (available as s_ecid cookie or AMCV cookie)
```

**Account (auth required)**
```
GET https://www.rei.com/rest/user/account
# Returns 400 for unauthenticated requests
```

**Gladly chat configs (no auth)**
```
GET https://cdn.gladly.com/orgs/configs/chat/rei.com.json
GET https://cdn.gladly.com/orgs/configs/chat/rei.com-dynamic.json
GET https://cdn.gladly.com/orgs/configs/chat/rei.com-sales.json
GET https://cdn.gladly.com/orgs/configs/chat/rei.com-sales-dynamic.json
```

**WordPress VIP (no auth)**
```
GET https://wpvip.rei.com/wp-json/wp/v2/posts
GET https://wpvip.rei.com/wp-json/wp/v2/pages
# Both return empty arrays -- no public content
# REST API routes expose plugin list (popup-maker, gravity-forms, jetpack, elasticpress, etc.)
```

### Gotchas

- **Akamai blocks all automation by default.** Headed browser required. The `_abck` cookie is the Akamai bot challenge token; it changes per session and cannot be replicated.
- **Constructor.io zone URL is custom.** Standard Constructor.io SDK endpoints don't work -- use `ezeubuswo-zone.cnstrc.com` for REI-specific search.
- **Sitka returns `{}` for non-existent style IDs**, not an error. Poll a range of IDs and filter by non-empty response.
- **Store numbers are not sequential.** The store database has gaps (e.g., store #702 is a 3PL DC, #704 another). Iterate by fetching `/stores/async` in full rather than guessing IDs.
- **Product SKUs vs. style IDs**: The Sitka API uses `styleId` (the number in the product URL). The catalog API at `/rest/product/catalog/{sku}` expects a 10-digit SKU -- different identifier, different namespace.
- **`/stores/async` is a single call for all 240 stores**, not paginated. The full response is ~2MB.
- **wpvip.rei.com is set to noindex** and does not appear in search results. Content is not publicly visible via the REST API even though the API itself is open.
