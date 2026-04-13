---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "The Home Depot — Teardown"
url: "https://homedepot.com"
company: "The Home Depot"
industry: "Retail"
description: "US home improvement retailer operating approximately 2,300 stores."
summary: "React 16 SPA on a custom AMD module loader ('nucleus'), served through Varnish ESI at the Akamai edge with nginx origin. Apollo GraphQL federation gateway powers all product, pricing, and inventory data. A first-party MetaRouter instance at mr.homedepot.com proxies analytics server-side to Google Ads, Floodlight, and Xandr. A/B testing runs through Amigo (getamigo.io) with all experiment state stored client-side. Four overlapping bot/fraud layers (Akamai Bot Manager, PerimeterX, ThreatMetrix, Forter) defend the front end."
date: "2026-04-12"
time: "21:44"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [React, Apollo GraphQL, Varnish, Akamai, Nginx]
trackers: [Quantum Metric, PerimeterX, Akamai Bot Manager, ThreatMetrix, Forter, Adobe Experience Cloud, Adobe Audience Manager, Google Analytics, Google Ads, DoubleClick Floodlight, MetaRouter, Qualtrics, Sprinklr, Amigo, New Relic, Akamai mPulse, Tapad, Acxiom, Amobee, RevJet, Pinterest, Yahoo]
tags: [retail, surveillance, a-b-testing, bot-protection, retail-media, graphql, identity-graph, no-consent, gpc, inventory]
headline: "Home Depot's GraphQL fulfillment API returns exact inventory counts per store for any product, unauthenticated, across all 2,300 locations."
findings:
  - "The RevJet/Aprimo banner tracker stores a base64-encoded JSON payload in localStorage containing the visitor's plaintext IP address, Adobe MCID, AWS instance ID, and campaign data -- readable by any script on the page and persistent across sessions."
  - "The GPC handler's opt-out cookie sets consent group C0004 (Targeting/Advertising) to ON and all others including C0001 (Strictly Necessary) to OFF -- inverting the user's do-not-sell request."
  - "The GraphQL fulfillment API returns exact inventory quantities per store for any product -- querying across stores maps real-time stock levels across the entire 2,300-store network."
  - "The Segment anonymous ID is passed as user_id to Google Ads and match_id to Floodlight simultaneously, stitching anonymous browsing into ad attribution before any login."
  - "No consent banner or CMP was detected -- 22 third-party domains including identity graphs (Acxiom, Tapad, Amobee) fire on first page load."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Home Depot's site is a large-scale React SPA wrapped in substantial institutional infrastructure -- multiple CDN layers, a custom module loader, a GraphQL federation gateway, and an unusually heavy analytics and fraud-prevention stack. The interesting parts are in the margins: what leaks out of the ad platform's tracking payloads, how the privacy controls malfunction, how much inventory data the API returns, and how many identity systems are running simultaneously before you've touched a single button.

---

## Architecture

The stack is React 16.13.1 (released March 2020, four major versions behind current), self-hosted from `assets.thdstatic.com`. Scripts load through a custom AMD module loader under THD's own "nucleus/hfapp/shell" framework. Apollo GraphQL federation is the data layer. Pages are assembled at the CDN edge using Varnish ESI (Edge Side Includes), with Akamai providing edge delivery on top.

The response header `x-application-context: render-nonbuyable:undefined:my-homepage:default` is present on every homepage response. Format: `{process-name}:{context-param}:{template}:{variant}`. The `undefined` slot is a missing parameter -- likely the store ID or locale context that should be injected server-side. `render-nonbuyable` indicates a separate server process handles non-purchasable page types (homepage, category landing) from transactional pages.

Varnish cache status confirms ESI is active: `x-varnish-cache: HIT(46)@vdir`, `x-varnish-esi: true`. Page components are assembled at the CDN layer, not at the origin.

The multi-experience bundle structure in asset paths reveals B2B segmentation: `consumer-homepage~eprocurement-homepage~exchange-homepage~guest-homepage~pro-homepage` are bundled separately and loaded based on customer segment. Pro and eProcurement are distinct code paths, not UI variants.

**`THD_GLOBAL`** -- a configuration object on every page:

| Key | Value | Significance |
|-----|-------|-------------|
| `apiKey` | `8Qg7Ztll8bnnEtlORRt7ReviHGrrnvo4` | Hardcoded API key in page source |
| `apiHost` | `//origin.api.homedepot.com` | Origin API hostname |
| `secureHostNameStaging` | `www.hd-pr71stg.homedepot.com` | Staging hostname (does not resolve) |
| `isGcp` | `true` | Confirms Google Cloud Platform |
| `ORIGIN_OR_APIGEE` | `origin` | Traffic routing decision flag |
| `certonaOn` | `true` | Certona recommendations active |
| `throttle.dataCapture` | `100` | Clickstream sampled at 100% |

The `endpoint.dataCapture` field points to `clickstream-producer.hd-personalization-prod.gcp.homedepot.com/clickstream-producer/v1/publish`, leaking the GCP project name `hd-personalization-prod`. In-store detection is configured with GPS distance thresholds: `instoredist: 0.125` (miles), `instoreexpire: 1200000` (20 minutes).

**`__EXPERIENCE_CONTEXT__`** -- a global JavaScript object with all service hostnames:

```json
{
  "apionline": "https://apionline.homedepot.com",
  "bazaarVoice": "https://api.bazaarvoice.com",
  "trackif": "https://homedepot.trackif.com",
  "orderGroove": "https://static.ordergroove.com",
  "customBlinds": "https://custom.homedepot.com",
  "thdApiBaseUrl": "https://api.homedepot.com",
  "configApiUrl": "https://thdapi.blinds.ca",
  "apiInternal": "https://federation-gateway-h2s.service.homedepot.com"
}
```

The `apiInternal` entry is a Kubernetes service mesh hostname for the GraphQL federation gateway -- an internal address that resolves inside the cluster, not externally. `configApiUrl` points to a Canadian domain (`blinds.ca`) for the blinds configurator, present in the US page context. `orderGroove` points to OrderGroove's subscription commerce platform.

**Legacy artifacts**: The robots.txt preserves ATG WebCommerce URL patterns from the previous platform: `/*THDLogon*`, `/*OrderItemAdd*`, `/*SiteMapView*`, `/*OrderItemUpdate*`, `/*OrderItemDisplayViewShiptoAssoc*`, `/*DeliveryCalendar*`, `/*ShippingMethod*`, `/*AjaxNavigation*`. ATG was decommissioned years ago but these disallow rules remain.

---

## The Banner Tracker IP Leak

The RevJet/Aprimo ad platform stores a conversion tracking beacon URL in `localStorage["viewConversionBeacon"]`. The URL contains a parameter `e=` followed by a base64-encoded JSON payload. Decoded:

```json
{
  "v": "1.14",
  "av": 2967764,
  "ip": "73.223.27.123",
  "uk": "86391423816623247263091171371453916480",
  "sb": "i-02b8b5c41bb9ef329",
  "cm": 658756748,
  "cr": 876378143,
  "zn": 335221,
  "sp": 66566,
  "ts": 1776029125494,
  "dm": 3,
  "tr": true,
  "gc": true,
  "bf": true
}
```

The `ip` field is the visitor's IP address in plaintext. The `uk` field is the Adobe MCID (Marketing Cloud ID). The `sb` field is an AWS EC2 instance ID (`i-02b8b5c41bb9ef329`). Campaign (`cm`), creative (`cr`), zone (`zn`), and spot (`sp`) IDs identify the specific ad impression.

This payload is stored in localStorage with an expiry approximately 14 days out. Any JavaScript running on the page -- first-party or third-party -- can read `localStorage.viewConversionBeacon`, base64-decode the `e` parameter, and extract the visitor's IP address, Adobe identity, and ad campaign data. The 22 third-party scripts loaded on every page (Quantum Metric, Qualtrics, Amigo, Sprinklr, etc.) all have read access to this data.

The tracking URL also includes `deliveredCategory`, `experienceName`, and `requestId` parameters in the clear (not encoded).

---

## GPC Handler: Targeting Enabled on Opt-Out

Home Depot ships a Global Privacy Control handler at `assets.thdstatic.com/core/global-privacy-control/v1.8.1/gpc.js`. When a browser sends the GPC signal (`navigator.globalPrivacyControl === true`), the script creates a cookie named `OptOutOnRequest` with this value:

```
groups=C0001%3A0%2CC0002%3A0%2CC0003%3A0%2CC0004%3A1%2CC0005%3A0
```

Decoded: `groups=C0001:0,C0002:0,C0003:0,C0004:1,C0005:0`

In the OneTrust consent taxonomy that THD uses:
- **C0001 (Strictly Necessary)**: 0 (OFF)
- **C0002 (Performance)**: 0 (OFF)
- **C0003 (Functional)**: 0 (OFF)
- **C0004 (Targeting/Advertising)**: 1 (ON)
- **C0005 (Social Media)**: 0 (OFF)

C0004 -- Targeting and Advertising -- is the only category set to ON. Every other category including Strictly Necessary is set to OFF. The GPC signal means "do not sell or share my personal information." Setting the Targeting category to ON is the opposite of the user's request.

The script also POSTs to `/customer/gpc/v1/preference` with the visitor's `mcvisId`, `svocId`, and `userId`. For logged-in users, it calls `/cdg/epc/v3/customer/{svocId}/user/{userId}/privacy-opt-out` with a PUT request. The opt-out status is cached in localStorage with a 100-year TTL when opted out and a 1-day TTL when not opted out.

No consent management platform (CMP) was observed during the investigation -- no OneTrust, Cookiebot, TrustArc, or cookie banner appeared. The GPC handler activates only when the browser sends the GPC signal. Without GPC, all trackers fire unrestricted.

---

## GraphQL: Inventory Enumeration

The GraphQL federation gateway at `apionline.homedepot.com/federation-gateway/graphql` powers all product data. It requires browser cookies (Akamai bot protection blocks direct curl), and introspection is disabled (returns 401). But validation errors in malformed queries reveal the exact type system, and the API responds to well-formed queries from any browser session.

The fulfillment query returns exact inventory quantities per store:

```graphql
query {
  product(itemId: "306283873") {
    fulfillment(storeId: "1017", zipCode: "94541") {
      fulfillmentOptions {
        type
        services {
          type
          locations {
            inventory { quantity isInStock isOutOfStock isLimitedQuantity }
            locationId
            type
          }
        }
      }
    }
  }
}
```

For a Milwaukee framing hammer (item 306283873), queried across four stores:

| Store | Type | Location | Quantity |
|-------|------|----------|----------|
| 1017 (Hayward) | bopis | 1017 | 18 |
| 0651 | bopis | 0651 | 9 |
| 1012 | bopis | 1012 | 13 |
| 0629 | bopis | 0629 | 17 |
| (all) | ship-to-home | 8119 (fulfillment center) | 80 |

The `quantity` field returns the exact unit count. Express delivery routes through the nearest anchor store (1017 in all cases), and ship-to-home routes through fulfillment center 8119. Combined with the StoreSearchServices API (which returns all stores within a radius), this allows enumerating real-time inventory for any product across the entire network. No rate limiting was observed.

Additional product fields available without authentication:

```
product.identifiers: itemId, productLabel, canonicalUrl, brandName, productType,
                     modelNumber, storeSkuNumber, parentId, upc
product.pricing(storeId): value, original, specialBuy, mapAboveOriginalPrice,
                          promotion { type }
product.info: totalNumberOfOptions, returnable
product.taxonomy.breadCrumbs: label, url
product.specificationGroup: specTitle, specifications { specName, specValue }
```

Every product page fires 12 GraphQL operations: `productClientOnlyProduct`, `reviews`, `aislebay` (in-store aisle/bay location), `shipping`, `metadata`, `promotionProducts`, `uds`, `mediaPriceInventory`, `promotionProductsItems`, `getCart`, and `recs` (x2).

---

## Store API: Manager Names and Operational Data

The `StoreSearchServices/v2/storesearch` API returns detailed operational data for every store:

```
GET /StoreSearchServices/v2/storesearch?address=94541&radius=30&pagesize=3&langId=-1
```

The response includes `storeContacts` with full names: `{"name":"Nguyen, Tom T","role":"Manager"}`. This is employee PII returned from a store locator endpoint. Also returned: store phone numbers (main, tool rental, pro desk, home services), full address with coordinates, market number, store opening date, operating hours for four service areas (main, curbside, tool rental, pro desk), and service/capability flags (loadNGo, propane, toolRental, penske, keyCutting, wiFi, kitchenShowroom, etc.).

---

## MetaRouter: First-Party Analytics Proxy

Home Depot operates a first-party MetaRouter instance at `mr.homedepot.com`. MetaRouter is a server-side analytics proxy that replaces third-party tracking SDKs with a first-party endpoint that forwards events server-side to destinations.

The endpoint accepts `/v1/p` (page events) and `/v1/t` (track events). The writeKey is `thd1` (visible in `window._T.metarouter.settings.writeKey`). Sending a malformed request returns:

```json
{"Error":"Bad Request","Message":"Error parsing request body","Details":"validation error: writekey may not be empty"}
```

The MetaRouter integration syncs with Google Ads via `MetaRouterSync` events in the dataLayer, Xandr/AppNexus via `ib.adnxs.com/getuidp?callback=__metaPixelCB_xandr`, and DoubleClick/Campaign Manager. The `ajs_anonymous_id` cookie (Segment format) carries the MetaRouter anonymous ID, which is simultaneously used as:

- `user_id` in Google Ads config (`AW-985322823`)
- `match_id` in Floodlight conversion events (`DC-3518820/thd/homed00b+standard`)

This is a cross-platform identity stitch on anonymous (pre-login) users. The same UUID links the anonymous browsing session to Google's ad attribution network and THD's Floodlight reporting -- all via a first-party domain that bypasses third-party cookie restrictions and most ad blockers.

---

## A/B Testing: Client-Side Experiment State

THD runs application-level A/B testing through Amigo (getamigo.io). All experiment variant assignments are stored client-side in `localStorage["ggt-experience-dicerolls"]` as a JSON object mapping experiment names to `{variant, rollout}` values:

```json
{
  "visual_nav_removal_6_0":  {"variant": 91, "rollout": 80},
  "simplified_cart_12_0":    {"variant": 22, "rollout": 45},
  "homepage_buy_again_14_0": {"variant": 70, "rollout": 64},
  "express_shipping_tile_10_0": {"variant": 54, "rollout": 23},
  "animated_search_8_0":     {"variant": 67, "rollout": 71},
  "sticky_filters_7_0":      {"variant": 16, "rollout": 38},
  "cart_list_view":          {"variant": 50, "rollout": 79},
  "aa_test":                 {"variant": 56, "rollout": 17},
  "swimlane":                {"variant": 31, "rollout": 93},
  "fulfilment_1_0":          {"variant": 54, "rollout": 90}
}
```

Twenty experiments total. The naming reveals active product decisions: `visual_nav_removal_6_0` and `reduced_height_visnav_6_1` test removing visual navigation from category pages. `simplified_cart_12_0` and `cart_list_view` are cart layout experiments. `express_shipping_tile_10_0` and `express_delivery_tagging_11_0` test fulfillment UI. `homepage_buy_again_14_0` tests a "buy again" module. `aa_test` is a control experiment (A/A test to validate measurement).

Since variant assignment is entirely client-side, any user can modify `ggt-experience-dicerolls` and refresh to see any variant. There is no server-side validation. Amigo's anti-flicker mechanism sets the page to `opacity: 0` during experiment application, with specific instances configured for `/cart`, the search bar input, and browse/search pages.

A second A/B layer runs at the CDN level: `akacd_usbeta` (`akacd_usbeta=3953481377~rv=42~id=...`) routes users between origin configurations independently of application experiments.

---

## Surveillance Infrastructure

On first page load, before any user interaction, requests fire across 22 third-party domains. No consent management platform was detected.

| Domain | Purpose | Requests |
|--------|---------|----------|
| ingest.quantummetric.com | Session recording | 19 |
| siteintercept.qualtrics.com | Survey intercept | 11 |
| prod2-live-chat.sprinklr.com | Live chat | 10 |
| collector-pxj770cp7y.px-cloud.net | PerimeterX bot detection | 6 |
| cdn0.forter.com | Fraud detection | 4 |
| siteperformancetest.net | Akamai mPulse RUM | 3 |
| bam.nr-data.net | New Relic APM | 2 |
| gcp-runtime.getamigo.io | Amigo A/B backend | 1 |
| tzm.px-cloud.net | PerimeterX telemetry | 1 |
| pix.revjet.com | RevJet/Aprimo identity sync | 1 |
| homedepot.demdex.net | Adobe Audience Manager DMP | 1 |
| fid.agkn.com | Acxiom/AGKN identity graph | 1 |
| pixel.tapad.com | Tapad cross-device ID sync | 1 |
| d.turn.com | Amobee/Singtel DSP | 1 |
| ct.pinterest.com | Pinterest pixel | 1 |
| ups.analytics.yahoo.com | Yahoo pixel | 1 |
| ib.adnxs.com | Xandr/AppNexus ID sync | 1 |

**Quantum Metric** (`QuantumMetricSessionID`, `QuantumMetricUserID` cookies) -- 19 requests to `/horizon/homedepot` on the homepage alone. The `QM_S` localStorage state captures event data between flushes. Observed values:

- `i:78` = store number (`1017`)
- `i:84` = page type (`homepage`)
- `i:173` = Adobe MCID (full 38-digit value)
- `i:175` = authentication status (`guest`)
- `i:177` = site variant (`beta`)
- `i:331` = page tagline text verbatim (`#1 Home Improvement Retailer`)
- `i:550` = internal version string (`homepage|my-homepage|6.3.0|nucleus_beta_b`)
- `i:2141` = ThreatMetrix session ID

Quantum Metric captures the Adobe MCID into its own session state, enabling cross-system identity linkage between QM visitor records and Adobe Audience Manager records.

**Identity cookie inventory** (set pre-consent):

| Cookie | System | Expiry |
|--------|--------|--------|
| `AMCV_F6421253512D2C100A490D45%40AdobeOrg` | Adobe ECID | 2 years |
| `kndctr_*_AdobeOrg_identity` | Adobe Edge identity | Session |
| `ajs_anonymous_id` | MetaRouter (Segment format) | 1 year |
| `QuantumMetricUserID` | Quantum Metric | Persistent |
| `QuantumMetricSessionID` | Quantum Metric | Session |
| `_pxvid` | PerimeterX visitor ID | 1 year |
| `_px_f394gi7Fvmc43dfg_user_id` | PerimeterX user ID | Persistent |
| `forterToken` | Forter fraud detection | Session |
| `thda.u` | THD analytics user | Persistent |
| `thda.s` | THD analytics session | Session |
| `_ga`, `_gid`, `_gcl_au` | Google Analytics/Ads | Varies |
| `_abck` | Akamai Bot Manager | 1 year |
| `trx` | Unknown tracking | Session |
| `HD_DC` | Data center routing | Session |
| `DELIVERY_ZIP` | IP-inferred delivery zip | Session |
| `THD_LOCALIZER` | Store localization JSON | Session |

Thirty-seven cookies total on first page load.

---

## Clickstream Killswitch: Public GCP Config

The clickstream configuration endpoint at `clickstream-killswitch.hd-personalization-prod.gcp.homedepot.com/clickstream-killswitch/v1/detail` is publicly accessible without authentication. It returns the complete behavioral event collection taxonomy:

**Enabled**: `PAGE_LOAD`, `BEACON_LOADED`, `PRODUCT_VIEWED`

**Disabled (configured but paused)**: `PAGE_LEAVE`, `SCROLL`, `SCROLL_END`, `JAVASCRIPT_ERROR`, `ORIENTATION_CHANGE`, `MUTATION`, `MUTATION_GROUP`, `GEOLOCATION`, `GEOLOCATION_ERROR`, `DIGITAL_DATA_LOADED`, `ANALYTICS_PUBLISH`, `EVENT`, `click`, `focus`, `blur`, `submit`, `mousedown`, `mouseup`, `touchend`, `touchmove`, `touchstart`, `keyup`

The disabled events represent either paused collection or available capabilities. The system is built to capture scroll depth, DOM mutations, geolocation, individual click/touch/keystroke events, and form submissions. `pollTimeout: 15` indicates 15-second polling intervals.

---

## Bot Protection Stack

Four overlapping systems run simultaneously on every page load.

**Akamai Bot Manager**: Cookies `_abck` (1-year expiry, device fingerprint), `bm_sz` (4-hour expiry, behavior payload), `bm_sv`, `bm_mi`, `bm_so`, `bm_lso`, `akavpau_prod`. Collection at obfuscated paths (`/f5ebo6kFz9Qz/pt/...`). A first-party script at `customer.homedepot.com/zowiknw6262xsexu.js` (103KB, heavily obfuscated with `td_` prefix variables) performs browser fingerprinting.

**PerimeterX** (app ID `PXJ770cP7Y`): Loads from `client.px-cloud.net/PXJ770cP7Y/main.min.js`. Collects to `collector-pxj770cp7y.px-cloud.net/api/v2/collector`. The fingerprint in `localStorage["PXJ770cP7Y_px_fp"]` includes GPU identification (SwiftShader virtual GPU is flagged immediately), WebGL extension list, canvas hashes, screen resolution, and an enumeration of JavaScript globals on the page.

**ThreatMetrix / LexisNexis**: Loaded from `customer.homedepot.com` with an obfuscated filename and a session-specific query parameter. The ThreatMetrix session ID appears in Quantum Metric's captured events (`i:2141`), meaning QM records the ThreatMetrix identifier.

**Forter**: Fraud detection from `cdn0.forter.com/1ad356638475/...` (account ID `1ad356638475`). Token stored in both cookie and localStorage. Polls `prop.json` (3 requests) and posts to `wpt.json`.

Detection effectiveness: headless Playwright gets 404 errors on product and search pages. The homepage loads in either mode. Direct API calls to `apionline.homedepot.com` return Akamai "Access Denied."

---

## Retail Media Infrastructure

THD operates its own retail media network. `rmat.homedepot.com/pla-tracker/impression/...` tracks product listing ad impressions with signed JWT-style payloads. The `/sponsoredbanner/v1` endpoint serves sponsored banner data. In the Apollo GraphQL product schema, three sponsored commerce fields exist on all product objects: `info.isSponsored`, `info.sponsoredBeacon` (impression tracking URL), and `info.sponsoredMetadata`.

The pricing query argument `isBrandPricingPolicyCompliant: false` is a client-visible flag in Apollo state -- the frontend explicitly requests pricing data irrespective of MAP (Minimum Advertised Price) compliance. A separate `info.hidePrice` flag controls price display suppression, likely for Pro/B2B pricing tiers.

Google advertising integration: Floodlight pixel `DC-3518820` (campaign `thd/homed00b`), Google Ads `AW-985322823`, view-through conversion `10893376479`. Conversion events fire on every page load with `match_id` set to the MetaRouter anonymous ID.

---

## MagicApron AI Assistant

THD's AI home improvement assistant is tracked with the same digital data layer used for product impressions:

```json
{
  "eventName": "viewport impression",
  "clickID": "ip-_-MagicApronLoader-_-DEF_MagicApronLoader-_-MagicApronAssistant-_-1-_-00DEFVALMA00",
  "container": {"id": "DEF_MagicApronLoader", "component": "MagicApronAssistant"},
  "impression": {"id": "00DEFVALMA00", "position": "1"}
}
```

The `maa-session` localStorage key manages the assistant's state. In this session: `fallback-sessionId` prefix (primary session resolver failed), `shouldAutoOpen: false`, pages shown on: `["HOME"]`.

---

## Search Infrastructure

Search queries include a `semanticSearchTokens` field in the analytics data layer with internal search pipeline metadata:

```
j17f05r30f240000101214_202604122122340239556423101_us-central1-wfkb
st:{power drill}:st ml:{24}:ml oos:{24} ct:{power drill}:ct
nr:{power drill}:nr nf:{7934}:nf qu:{power drill}:qu ie:{21}:ie qr:{power drill}:qr
```

Fields: `st` = search term, `ml` = max results, `oos` = out-of-stock count, `nf` = total results found (7,934), `ie` = intent engine ID, `qr` = query result term. The GCP region `us-central1` and engine type suffix are visible. Search for "hammer" performed intent-based navigation, redirecting to the Hammers category page rather than displaying search results.

---

## Machine Briefing

### Access & Auth

Homepage and static content load in headed browsers without setup. Product pages and search require a bot-passing session -- headless Playwright gets 404s. Direct API calls to `apionline.homedepot.com` are blocked by Akamai. Use headed Chrome with a real GPU.

Key cookies for API access: `_abck` (Akamai, 1yr), `bm_sz` (Akamai, 4hr), `AMCV_*` (Adobe), `thda.s`, `thda.u`.

### Endpoints

**GraphQL (requires browser session):**

```
POST https://www.homedepot.com/federation-gateway/graphql?opname={operationName}
Headers: Content-Type: application/json, x-experience-name: general-merchandise

# Product data
{"operationName":"test","query":"{ product(itemId: \"306283873\") { identifiers { itemId productLabel canonicalUrl brandName productType modelNumber storeSkuNumber parentId upc } pricing(storeId: \"1017\") { value original specialBuy mapAboveOriginalPrice promotion { type } } info { totalNumberOfOptions returnable } taxonomy { breadCrumbs { label url } } specificationGroup { specTitle specifications { specName specValue } } } }"}

# Inventory per store
{"operationName":"inv","query":"{ product(itemId: \"306283873\") { fulfillment(storeId: \"1017\", zipCode: \"94541\") { fulfillmentOptions { type services { type locations { inventory { quantity isInStock isOutOfStock isLimitedQuantity } locationId type } } } } } }"}
```

**Store search (requires browser session):**

```
GET /StoreSearchServices/v2/storesearch?address=94541&radius=30&pagesize=50&langId=-1
Accept: application/json
```

**Open (no auth):**

```
GET https://clickstream-killswitch.hd-personalization-prod.gcp.homedepot.com/clickstream-killswitch/v1/detail
# Returns full event type taxonomy, publicly accessible

GET https://images.thdstatic.com/productImages/{uuid}/svn/{name}-64_{size}.jpg
# Product images, sizes: 65, 100, 145, 300, 400, 600, 1000

POST https://mr.homedepot.com/v1/p
POST https://mr.homedepot.com/v1/t
# MetaRouter endpoints (writeKey: thd1)
```

### Gotchas

- **Headless detection is immediate**: PerimeterX reads WebGL GPU string. SwiftShader is flagged. Use headed Chrome.
- **Bot Manager cookies are time-sensitive**: `bm_sz` expires in 4 hours. Don't reuse stale sessions.
- **GraphQL introspection is disabled**: Returns 401. Use validation errors to discover fields.
- **Localization is automatic**: `THD_LOCALIZER` and `DELIVERY_ZIP` are set from IP. Inventory reflects inferred location.
- **`akacd_usbeta` routes to beta variants**: Check `x-application-context` header for current template/variant.
- **A/B experiments are mutable**: Edit `localStorage["ggt-experience-dicerolls"]` before load to get any variant.
- **CORS is strict**: `apionline.homedepot.com` blocks preflight from non-origin. Clickstream producer rejects non-allowed origins.
