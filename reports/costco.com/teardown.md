---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Costco — Teardown"
url: "https://costco.com"
company: "Costco Wholesale"
industry: "Retail"
description: "Members-only warehouse retailer selling groceries, electronics, and bulk goods."
summary: "Costco runs two parallel stacks under the same domain: a legacy IBM WebSphere Commerce system handling checkout and accounts, and a Next.js app (codenamed USBC) for browse pages, routed by Akamai at the edge. The API layer splits between gdx-api.costco.com and ecom-api.costco.com, both behind Apigee X, with the browse stack on Kubernetes behind an Istio/Envoy service mesh. Costco operates its own first-party retail media network via SAS Viya alongside Criteo-powered sponsored listings."
date: "2026-04-12"
time: "17:14"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Next.js, IBM WebSphere Commerce, Apigee X, Akamai, Istio]
trackers: [OneTrust, Transcend, Criteo, Adobe Analytics, Adobe Target, Adobe Audience Manager, LogRocket, Akamai mPulse, Queue-it, Pixlee, Bazaarvoice, Syndigo]
tags: [membership, retail-media, cors, price-gating, two-stack, adobe, criteo, ibm-commerce, akamai, consent]
headline: "Costco's 'Members Only' prices are a UI illusion — the price API returns them to any website that asks, no login or membership required."
findings:
  - "The display-price-lite API returns full prices for 'Sign In for Price' items without authentication. CORS reflects any origin, so any third-party site can fetch Costco's gated prices through a visitor's browser."
  - "Costco runs its own retail media ad network on SAS Viya. The ad serving API is publicly callable by placement ID and returns live campaign details: brand, creative assets, promotion terms, and schedule dates for every active sponsorship."
  - "An unauthenticated inventory API enumerates Costco's full fulfillment topology: 33 distribution centers named with internal suffixes revealing type (-3pl for third-party logistics, -pharmacy, -membership) plus 2 grocery centers."
  - "LogRocket session recording initializes on every page load with no observed consent gate. Criteo identity sync and the full Adobe identity stack also fire before any user interaction with the dual OneTrust/Transcend consent banners."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Costco's website is two sites stitched together. The homepage and product browse pages run on a Next.js application Costco calls "USBC" (US Browse Commerce), version 1.24.10, deployed via blue/green on Kubernetes behind an Istio/Envoy service mesh. Checkout, cart, account management, pharmacy, and error pages still run on IBM WebSphere Commerce — a platform from a different era of the web entirely. Akamai handles routing between them at the edge, and both stacks serve from `www.costco.com`. The seams show in the headers: browse pages return `server: istio-envoy` and `x-nextjs-cache: HIT`; error pages return `currentBuildNumber: 3.0.101270.0` in meta tags.

---

## Architecture: Two Stacks, One Domain

The WCS stack is identified by build number `3.0.101270.0` (leaked from 404 page meta tags) and a matching Solr build at `3.0.33624.0`. The 404 page also exposes the last octet of the internal server IP in a `LocalAddress` meta tag, and the internal server pool name in `LocalName` — a series of TP-prefixed identifiers (TP209, TP307, TP319 and others). These appear to be load balancer identifiers for the WCS backend pool. The same 404 pages still serve IE8 polyfills (`html5shiv`, `respond.min.js`, `ie8polyfills.js`) from ~2012-era code — delivered to every visitor that hits a missing page.

The USBC stack identifies itself through response headers:
- `x-build-reference: 1.24.10-24040971154`
- `x-build-tag: prd-usbc-release-v1.24.10`
- `x-costco-gdx-deployment: blue`
- `x-costco-gdx-backend: external-web-backend`

"GDX" appears to be Costco's internal codename for the new platform. The deployment is currently on blue in the blue/green rotation. Next.js chunks are served from `/consumer-web/browse/prd/homepage-usbc/_next/static/chunks/` — the full USBC path prefix is visible in every JavaScript URL.

The API layer is split across two Apigee X gateways:
- `gdx-api.costco.com` — product catalog, pricing, search
- `ecom-api.costco.com` — inventory, orders, warehouse locator

A first-party analytics edge at `smetrics.costco.com` handles Adobe Experience Platform Edge Network traffic (configId `998fca04-5ec4-40f4-b8b3-904e5ae8c3dd`). A separate internal ad server runs at `media-cdn.costco.com` on SAS Viya (discussed in the retail media section below).

The robots.txt is a partial archaeological record of the migration. Most WCS URL patterns — `ProductDisplayView`, `CategoryDisplayView`, `CatalogSearchResultView` — are commented out rather than active Disallow rules, relics of a previous configuration. Active disallows cover the new URL patterns. Two internal story ticket IDs survive as comments: `# Added for story stry0143138` and `# Added for story stry0143140` — these appear to be Jira-style story IDs from the internal issue tracker, with a `stry` prefix.

---

## The "Sign In for Price" Gate Is UI-Only

Some Costco products display "Sign In for Price" or a "Members Only" button instead of a price. In the product catalog API, these items carry `dispPriceInCartOnly: 1` in their product summary response. The intent is clear: prices for certain items are meant to be visible only to authenticated members, presumably to drive membership sign-ups.

The gate doesn't hold at the API layer.

Every product page loads product data via `GET /catalog/product/product-api/v1/products/summary`. For `dispPriceInCartOnly: 1` products, this response includes a `childCatalogData` array containing the child SKU IDs — the actual purchasable item numbers — along with embedded price data in the `displayPrice` field. Separately, the `display-price-lite` v2 endpoint at `gdx-api.costco.com` serves these prices on demand:

```
GET https://gdx-api.costco.com/catalog/product/product-api/v2/display-price-lite
    ?whsNumber=847
    &clientId=4900eb1f-0c10-4bd9-99c3-c59e6c1ecebf
    &item={childSkuId}
    &locale=en-us
```

Three items confirmed:
- Item `9575007` (parent `4000357413`, `dispPriceInCartOnly: 1`): **$569.99**
- Item `9565007` (parent `4000359633`, `dispPriceInCartOnly: 1`): **$429.99**
- Item `9555095` (parent `4000360770`, `dispPriceInCartOnly: 1`): **$1,599.99**

The `clientId` parameter (`4900eb1f-0c10-4bd9-99c3-c59e6c1ecebf`) appears in every product API request and is hardcoded in the JavaScript bundle — it's visible in every browser's network tab on any product page. Querying the parent product ID directly via this endpoint returns 401 Unauthorized from the Apigee gateway. Querying the child SKU — obtained from the product summary response that's already open — returns the full price.

The CORS configuration compounds this. The API responds with `Access-Control-Allow-Origin` that reflects the caller's `Origin` header, and `Vary: Origin`. Tested with `Origin: https://example.com`: the response comes back with `Access-Control-Allow-Origin: https://example.com`. This means any page loaded in a browser can call the Costco price API directly via `fetch()` and retrieve member-gated prices without any Costco session. The API does require browser-standard `Sec-Fetch-Site` and `Sec-Fetch-Mode` headers, which a browser sends automatically but curl does not — this adds one layer of friction but isn't a meaningful gate.

The parent product ID returns 401 at the Apigee gateway; the child SKU returns the price openly. The child SKU is in the product summary response. The product summary response is unauthenticated. The price wall is a template condition in the UI, not an API-level control.

---

## Retail Media: Costco's Own Ad Network, Plus Criteo

Costco operates a first-party retail media network. Brands pay to serve banner and carousel placements within costco.com. The ad serving infrastructure runs on SAS Viya (formerly Spark) at `media-cdn.costco.com`. Costco's merchant ID in the SAS platform appears to be `MID=178157`, embedded in every redirect and tracking URL the system generates.

The ad serving API is callable without authentication:

```
GET https://media-cdn.costco.com/adserve/;ID=178157;setID={setID};type=jsonr;output_json_template_params=1
```

The `setID` is a placement identifier visible in every ad request on the page. Calling it directly returns the full ad response: campaign IDs, banner IDs, schedule IDs, placement IDs, redirect URLs, viewable impression URLs, creative template parameters, and active promotion copy. At the time of investigation, campaigns were live from Michelin ($80 off tires, valid 4/5/26-5/10/26), AT&T ($450 switch offer, valid 4/6/26-5/3/26), Samsung (TVs starting at $229.99), Olay, Apple (AirPods Max 2), and Costco Travel — all returned from a single homepage placement (setID 432991).

The `impressions_remaining: 0` and `has_quota: false` fields on all ads suggest impression quota tracking is either disabled or handled upstream from the ad server. The `accupixel_url` and `viewable_url` fields in the response are viewability and impression tracking endpoints — also fully constructed and callable.

Alongside Costco's own network, Criteo runs a sponsored products layer via `d.us.criteo.com/delivery/retailmedia` (Costco partner ID `48266`). This fires on the TVs page and homepage. Criteo also runs identity synchronization calls: `gum.criteo.com/sid/json` (redirects) and `mug.criteo.com/sid`. Both Criteo and the `CriteoSessionUserId` cookie initialize before any consent interaction on first load.

---

## Surveillance Stack

The homepage loads 69 requests (40 first-party, 29 third-party across 14 domains). Fourteen tracker vendors are active in various capacities.

**Consent management (dual layer):**
- OneTrust (`cdn.cookielaw.org`): CMP tenant `2653cf4b-5c84-40d7-a99b-fa6e1592503b`. Handles the visible cookie banner and consent record (`OptanonConsent` cookie).
- Transcend airgap (`transcend-cdn.com`): tenant `448b3320-9d7c-499a-bc56-f0dae33c8f5c`. A data governance layer that intercepts network requests to enforce consent. Both its main script (`airgap.js`) and translation files load on every page. `transcendConsentOverride` in sessionStorage indicates runtime state tracking.

Both CMP scripts are preloaded in the page `<head>` as `rel="preload"` — they initialize before first render. The US consent rule is typed as `CCPA` (California Consumer Privacy Act). GPP (Global Privacy Platform) is not enabled (`IsGPPEnabled: false`). Google Consent Mode is not enabled (`GCEnable: false`).

**Pre-consent fires confirmed on first load:**

Despite the dual CMP setup, the following trackers initialize before any user interaction with the consent banner:
- `CriteoSessionUserId` cookie (advertising identifier) set via Criteo's `sslwidget.criteo.com` script tag
- `kndctr_97B21CFE5329614E0A490D45_AdobeOrg_identity` — Adobe ECID identity cookie
- `kndctr_97B21CFE5329614E0A490D45_AdobeOrg_cluster` — Adobe Edge cluster routing cookie
- `AMCV_97B21CFE5329614E0A490D45%40AdobeOrg` — Adobe Marketing Cloud Visitor identifier
- `mboxEdgeCluster` — Adobe Target cluster assignment
- `adobeopt_exp` — Adobe Target A/B test assignment
- `r.intake-lr.com/i` POST — LogRocket session recording initialization

**Adobe suite:**
Costco runs the full Adobe Experience Cloud stack. Analytics data flows via a first-party proxy at `smetrics.costco.com` to the Adobe Experience Platform Edge Network (identity acquisition at `POST /ee/or2/v1/identity/acquire`, interaction/behavior data at `POST /ee/or2/v1/interact`). Adobe Target handles A/B testing and personalization at `costco.tt.omtrdc.net`. Adobe Audience Manager runs via `costco.demdex.net` (first-party domain for Demdex). The Adobe DTM Launch container is served from `assets.adobedtm.com` and was built at `2026-04-09T22:11:41Z` — four days before this investigation. The Launch config includes a `Syndigo Src` data element pointing to Syndigo's content delivery tag.

**LogRocket:**
Session recording active in workspace `costco/production-vrwno` (extracted from cookie names `_lr_tabs_-costco%2Fproduction-vrwno` and `_lr_hb_-costco%2Fproduction-vrwno`). The `POST /i` beacon fires on every page captured. `__lr_navigation_history_v1` in sessionStorage stores the full navigation trail for the current session.

**Additional trackers confirmed:**
- Akamai mPulse (`17de4c14.akstat.io`) — real user monitoring; config loaded from `c.go-mpulse.net/boomerang/3C8QM-XUE3B-96T5C-HYEN8-AAN34`
- Akamai Bot Manager — behavioral fingerprinting via `_abck`, `bm_sz`, `bm_sv`, `bm_so`, `bm_lso` cookies plus obfuscated sensor data POST at `/o0DYnu/ENDiE/...`
- Queue-it — virtual waiting room via `static.queue-it.net` scripts; `akavpau_zezxapz5yf` cookie (Akamai WAP integration)
- Pixlee/EMPLIFI — UGC photo gallery at `distillery.pixlee.co/getJSON`
- Bazaarvoice — product reviews at `apps.bazaarvoice.com`
- Bing Maps (Virtual Earth SDK) — store locator

**Full cookie inventory (post-load, no login):**

| Cookie | Purpose |
|--------|---------|
| `client-zip-short` | Geo from IP (ZIP short form) |
| `C_LOC` | Geo from IP (state code) |
| `BCO` | Value `pm2` — unclear, present pre-consent |
| `CriteoSessionUserId` | Criteo advertising identifier |
| `kndctr_97B21CFE5329614E0A490D45_AdobeOrg_identity` | Adobe ECID |
| `kndctr_97B21CFE5329614E0A490D45_AdobeOrg_cluster` | Adobe Edge cluster |
| `AMCV_97B21CFE5329614E0A490D45%40AdobeOrg` | Adobe Marketing Cloud Visitor ID |
| `mboxEdgeCluster` | Adobe Target cluster |
| `adobeopt_exp` | Adobe Target experiment assignment |
| `invCheckCity`, `invCheckStateCode`, `invCheckPostalCode` | Inventory check geo |
| `WAREHOUSEDELIVERY_WHS` | Warehouse delivery assignment |
| `STORELOCATION` | Store location preference |
| `C_WHLOC` | Warehouse location |
| `WC_SESSION_ESTABLISHED` | IBM WCS session flag |
| `WC_ACTIVEPOINTER` | IBM WCS active session pointer |
| `OptanonConsent` | OneTrust consent record |
| `mbox` | Adobe Target A/B test |
| `_lr_tabs_-costco%2Fproduction-vrwno` | LogRocket session tabs |
| `_lr_hb_-costco%2Fproduction-vrwno` | LogRocket heartbeat |
| `_abck`, `bm_sz`, `bm_sv` | Akamai Bot Manager |
| `akavpau_zezxapz5yf` | Akamai/Queue-it virtual waiting room |
| `RT` | Akamai mPulse RUM timing |
| `cto_bundle` | Criteo identity bundle |
| `akaas_AS01` | Akamai A/B or split testing |

**Client-side state:**

localStorage keys of note: `aoptShowNewMyAccount` contains a list of new My Account modules being rolled out — observed value `"myaccounthome,dmc,prefs,addressbook,lists"`. The `dmc` module name is unexplained (possibly "digital membership card" — inferred).

sessionStorage: `subCatScores-overall` stores per-category interest scores client-side (observed: `{"televisions": 35}` after approximately 14 pages on the TVs category). This appears to feed server-side personalization and recommendation systems.

---

## CSP Archaeology

The production Content Security Policy (`connect-src` specifically) includes several non-production hosts alongside the expected production ones:

- `gdx-npd.np.api.cc-costco.com` — a non-production GDX API (`npd` likely = non-prod domain). Resolves to GCP IP `34.19.42.118`. TLS handshake succeeds but returns `Unknown Error` on any request.
- `api-tst.np.gdx.cc-costco.com` — a test API environment.
- `stg.api.bazaarvoice.com` — staging Bazaarvoice review API, listed alongside production `api.bazaarvoice.com`.

The Costco Home Services vendor portal runs at `*.ct-costco.com`. Its `frame-ancestors` policy whitelists: `closetfactory.com`, `financeit.app`, `centah.com`, `shawfloors.com`, `ecowater.com`, `graberblinds.com`, `lennox.ca`. These are Costco's Home Services installation partners — they embed Costco checkout/quoting flows within their own sites.

---

## Fulfillment Topology

The distribution center list API at `ecom-api.costco.com/ebusiness/inventory/v1/location/distributioncenters` is open with no authentication. It returned 33 distribution centers and 2 grocery centers:

```json
{
  "distributionCenters": [
    "1251-3pl", "1321-wm", "1461-3pl", "283-wm", "561-wm", "725-wm",
    "731-wm", "758-wm", "759-wm",
    "847_0-cor", "847_0-cwt", "847_0-edi", "847_0-ehs", "847_0-membership",
    "847_0-mpt", "847_0-spc", "847_0-wm",
    "847_1-cwt", "847_1-edi",
    "847_aa_00-spc", "847_aa_u610-edi",
    "847_d-fis",
    "847_ge_sac-edi", "847_lg_n1f-edi", "847_lux_us51-edi",
    "847_NA-cor", "847_NA-pharmacy", "847_NA-wm",
    "847_ss_u357-edi", "847_wp_r460-edi",
    "951-wm", "952-wm",
    "9847-wcs"
  ],
  "groceryCenters": ["653-bd", "848-bd"],
  "pickUpCenters": []
}
```

The suffix convention maps to fulfillment type:
- `-wm`: warehouse main
- `-edi`: EDI/electronic data interchange (partner fulfillment)
- `-3pl`: third-party logistics
- `-cor`: corporate
- `-cwt`: Costco Wholesale Transport (inferred)
- `-membership`: membership fulfillment
- `-pharmacy`: pharmacy fulfillment
- `-wcs`: WCS-specific node
- `-fis`: financial/fiscal (inferred)
- `-spc`, `-mpt`, `-ehs`, `-bd`: specialty categories (not decoded)

Warehouse `847` corresponds to the Bay Area — consistent with geo-detection from the investigation IP. The `847_*` cluster shows 13 sub-nodes under the same warehouse code, suggesting a complex multi-modal fulfillment hub for that region. `9847-wcs` is likely a WCS-specific virtual DC overlapping with warehouse 847.

---

## Machine Briefing

### Access & auth

The browse stack has light bot protection (Akamai Bot Manager), but product data APIs accept calls with standard browser headers. curl requires UA spoofing and Sec-Fetch headers. A browser or Playwright session makes this straightforward. Most catalog APIs require `sec-fetch-site: cross-site` and `sec-fetch-mode: cors` headers to work from non-Costco origins. The `clientId` `4900eb1f-0c10-4bd9-99c3-c59e6c1ecebf` is required for all product API calls — hardcoded in the JS bundle, static across sessions. Use warehouse `847` for Bay Area (auto-detected from IP; other warehouse IDs are in the DC list).

### Endpoints

**Open (no auth, browser headers required for price endpoints):**

```
# Product summary (browse page load, ~64x on TVs page)
GET https://gdx-api.costco.com/catalog/product/product-api/v1/products/summary
    ?clientId=4900eb1f-0c10-4bd9-99c3-c59e6c1ecebf
    &whsNumber=847
    &productIds={parentProductId}
    &locale=en-us

# Member-gated price — returns price for dispPriceInCartOnly items
# Requires Origin + Sec-Fetch-Site: cross-site + Sec-Fetch-Mode: cors
GET https://gdx-api.costco.com/catalog/product/product-api/v2/display-price-lite
    ?whsNumber=847
    &clientId=4900eb1f-0c10-4bd9-99c3-c59e6c1ecebf
    &item={childSkuId}
    &locale=en-us

# Distribution center list — open, no headers needed
GET https://ecom-api.costco.com/ebusiness/inventory/v1/location/distributioncenters

# Ad server — live campaign data by placement
GET https://media-cdn.costco.com/adserve/;ID=178157;setID={setID};type=jsonr;output_json_template_params=1
# Known setIDs: 432991 (homepage), 507130 (TVs), 785292 (TVs secondary)
```

**Auth-gated (Apigee X, returns 401 without session):**

```
POST https://gdx-api.costco.com/catalog/search/api/v1/search
POST https://ecom-api.costco.com/ebusiness/inventory/v1/inventorylevels/availability/batch
GET  https://ecom-api.costco.com/ebusiness/inventory/v1/location/warehouses.json
GET  https://ecom-api.costco.com/ebusiness/inventory/v1/inventorylevels/availability/v2/{item}
```

### Gotchas

- **Parent vs child ID**: Product summary API returns parent IDs. Price API 401s on parent IDs. Child SKU IDs are in `childCatalogData[].id` in the product summary response. Use child IDs for price queries.
- **sec-fetch headers**: Price API (`display-price-lite`) blocks requests without browser-standard `Sec-Fetch-Site` and `Sec-Fetch-Mode` headers. curl won't work without spoofing. In a browser context (Playwright, fetch from a page), these headers are sent automatically.
- **clientId is not a secret**: It's static, the same for all callers, and visible in every network request. It's an API routing/tenant identifier, not a per-session credential.
- **Warehouse number matters**: Prices and inventory vary by warehouse. 847 = Bay Area. Other warehouse IDs available from the DC list endpoint, but inventory API is auth-gated so per-warehouse inventory data requires a session.
- **Ad server setIDs**: Visible in network traffic on any product category or homepage load. No auth required. Responses include full campaign schedules and creative URLs.
- **WCS endpoints**: The checkout/account stack at `/wcsstore/` and WCS view paths are not part of the new API layer. They have separate session management (`WC_SESSION_ESTABLISHED`, `WC_ACTIVEPOINTER` cookies). These are legacy and not recommended for programmatic access.
