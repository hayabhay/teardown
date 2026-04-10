---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Express — Teardown"
url: "https://www.express.com"
company: "Express"
industry: Retail
description: "American fashion retailer for men's and women's clothing."
summary: "Express runs a hybrid React/AEM/JSP stack internally called 'Raven,' served through nginx behind Akamai's WAF and Bot Manager with assets on Google Cloud Storage. Apollo GraphQL handles most API traffic, with Firebase anonymous auth issuing JWT guest tokens to every visitor. Unbxd powers search with credentials and inventory data exposed in page globals. A Shopify-backed marketplace layer sits under the main storefront, live since the post-bankruptcy acquisition."
date: "2026-04-12"
time: "06:56"
contributor: hayabhay
model: sonnet
effort: high
stack:
  - React
  - Apollo GraphQL
  - Adobe Experience Manager
  - Firebase
  - nginx
  - Akamai
trackers:
  - Google Tag Manager
  - Google Analytics 4
  - DoubleClick
  - Facebook Pixel
  - Pinterest
  - Snapchat Pixel
  - TikTok Pixel
  - OneTrust
  - Elevar
  - Granify/Wandz
  - Quantum Metric
  - TrackJS
  - Curalate
  - Klarna
  - Attentive
  - Trade Desk
  - Teads
  - Namogoo
  - mPulse
  - FASTR Optimize
  - BazaarVoice
  - Zendesk
  - Angler.ai
  - TruRating
  - RevTrax
tags:
  - retail
  - fashion
  - graphql
  - inventory-exposure
  - consent
  - behavioral-targeting
  - unbxd
  - wandz
  - firebase
  - shopify
headline: "Express's search API needs no auth and allows wildcard CORS — exposing real-time inventory counts, store-level stock, and promo flags for all 4,006 products."
findings:
  - "The Unbxd search API requires no auth and sets CORS to * — it returns exact online and in-store inventory counts, store-level availability, promo messages, and search-rank boost flags for the entire 4,006-product catalog, with 816 items currently showing fewer than 10 units in stock."
  - "Wandz/Granify runs with cookie_consent_required explicitly set to false and fingerprints every visitor for 12+ named shopping browser extensions (Honey, Rakuten, Capital One, Klarna), detects incognito mode and VPN use, reads battery level, and infers gender and category affinity — all before any consent interaction."
  - "A _shopify_y cookie is set on express.com from first load — Shopify backs the marketplace seller infrastructure, confirmed by FLAGS.Marketplace and FLAGS.SellerPages both set to true, with the Unbxd API returning a marketPlaceFlag per product to distinguish third-party items."
  - "OneTrust is configured in implied-consent mode (intType=1) for California: the session starts with only strictly necessary cookies, then fires a GTM consent update granting ad_storage, ad_user_data, and ad_personalization — scoped specifically to region US-CA — without any banner shown or clicked."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

Express runs a layered stack that tells a story of interrupted modernization. The frontend is a React SPA called "Raven" internally — confirmed by the `webpackChunkraven_header` bundle name and `window.APP_RAVEN` global. Raven handles modern routes under `/g/` and `/rvn/`, while legacy paths from an earlier Java ATG era persist in `robots.txt` (`/browse/page.jsp`, `/browse/actions/twitter-share-submit.jsp`) and sitemaps alongside a WordPress blog at `/blog/`. Adobe Experience Manager (AEM) provides CMS at `api.express.com`, where a 404 response reveals Apache Sling in the error page and the GCS content bucket path: `x-docroot: /mnt/gcs/ecomm-prod-cms-static-content`. Main static assets come from a separate GCS bucket: `ecomm-prod-static-assets`.

The Raven header is a separate micro-frontend: `webpackChunkraven_header` loads independently from the main `webpackChunkexpress_com` bundle. The Klarna Web SDK adds a third webpack chunk (`webpackChunk_klarna_web_sdk_lib`). Version info appears as an HTML comment: `R.v6.359.19:N.v1.312.0`.

React 17.0.2 runs on production — released October 2020, now over five years old. jQuery 1.12.3, a January 2016 release, is still loaded as a dependency. The combination of legacy JSP paths, AEM CMS, React SPA, and jQuery suggests a replatforming effort that proceeded in phases and never fully completed. Express filed for bankruptcy in November 2023 and was acquired by a consortium of mall operators. The tech stack carries the visible marks of a company that paused modernization mid-execution.

The edge layer is nginx behind Akamai, confirmed by the `akamai-grn` response header and the `_abck` / `bm_sz` cookies from Akamai's Bot Manager. The HTTP response cluster header `x-www-cluster: prodblue` and the asset path `x-docroot-subdir: /prodblue/www-site` confirm blue/green deployment. Geographic context is visible in response headers: `dma: 807` (San Francisco DMA), `x-location: US,CA`. The server sets `isMobile=false` and `isTablet=false` cookies on the initial GET before any JavaScript runs — device detection at the edge.

### Firebase Anonymous Auth

Every visitor receives a Firebase JWT. On first load, Express calls Firebase to create an anonymous session under the `ecomm-resources-prod` GCP project, issuing a token stored in the `accessToken` cookie. The JWT's claims set the email to `guest@express.com` with `emailVerified: false` and `signInProvider: password`. This token is sent as a Bearer header on authenticated GraphQL calls — Express's GraphQL layer treats every visitor as an authenticated (guest) user from the first request.

### GraphQL

Apollo Client (`window.__APOLLO_CLIENT__`) drives most API traffic. The homepage fires 15 GraphQL calls; a product detail page fires 27. The `/graphql` endpoint is protected by Akamai and returns 403 to direct curl requests. Introspection is blocked even from a browser context. The Apollo cache ROOT_QUERY, extracted from `window.__APOLLO_CLIENT__.cache`, reveals the active operation set: `getCreditCardDiscount` (returns `"20%"` for the Express credit card), `getUniversalNav`, `getContent`, `getTrendingSearches`, `getTenderTypePreferredCardHeaderModal`, `orderSummary`, `freeShippingAndReturnsLegalText`, `paymentMethods`, and `affiliate`.

### Infrastructure SANs

The SSL certificate lists twelve SANs beyond the main domain: `api.express.com`, `auth.express.com`, `becomeaneditor.express.com`, `cintas.express.com`, `ecomsso.express.com`, `editor.express.com`, `editoradmin.express.com`, `hrconnect.express.com`, `images-fallback.express.com`, `m.express.com`, `my.express.com`, `preview.express.com`, `sso.express.com`. `hrconnect.express.com` times out from external access — internal HR portal. `editor.express.com` and `editoradmin.express.com` also time out — Express runs a style/content editor tool. `preview.express.com` returns 403. `api.express.com` 404s with an AEM Sling error page, confirming the content management backend.

---

## Unbxd Search API — Inventory and Pricing Exposure

The Unbxd search service is integrated with credentials exposed in page globals: `window.UnbxdApiKey = "d21gpk1vhmjuf5"` and `window.UnbxdSiteName = "express_com-u1456154309768"`. These populate a public search API endpoint with `access-control-allow-origin: *` (wildcard CORS).

**Base endpoint:**
```
https://search.unbxd.io/d21gpk1vhmjuf5/express_com-u1456154309768/search
```

The API accepts a `fl` (field list) parameter that determines what fields are returned. Express's own product pages request inventory fields; the same fields can be requested externally:

```
GET https://search.unbxd.io/d21gpk1vhmjuf5/express_com-u1456154309768/search
  ?q=*
  &rows=100
  &fl=title,price,salePrice,onlineInventoryCount,inStoreInventoryCount,storeIds,promoMessage,promote_metric,limitedQuantity,factoryOutletFlag,marketPlaceFlag
```

Available fields per product include:
- `onlineInventoryCount` — exact online inventory (e.g., 7,523 units for a bestselling bodysuit)
- `inStoreInventoryCount` — aggregate in-store count
- `storeIds` — array of store IDs carrying the item (sample product had 63 store IDs)
- `promoMessage` — active promo text ("Buy 1, Get 1 50% Off + $40 Off $120 In Cart")
- `promote_metric` — search rank boost flag (`"true"` / `"false"`)
- `limitedQuantity` — low-stock flag
- `factoryOutletFlag` — factory outlet item indicator
- `marketPlaceFlag` — marketplace seller vs. Express owned

**Catalog scope:** The wildcard query `q=*` returns `numberOfProducts: 4006` — the full active catalog is queryable. The filter `onlineInventoryCount:[1 TO 10]` matches 816 products currently.

To enumerate all products with inventory data, paginate with `rows=100&start=N`:
```
GET .../search?q=*&rows=100&start=0&fl=title,onlineInventoryCount,inStoreInventoryCount,storeIds,promoMessage,promote_metric&filter=onlineInventoryCount:[1+TO+10]
```

Any external site can call this endpoint via a browser fetch. The CORS wildcard means cross-origin requests from competitor domains are allowed without restriction.

---

## Consent and Tracking

### The California Implied-Consent Pattern

OneTrust is configured in implied-consent mode (`intType=1` in the `OptanonConsent` cookie). From a clean California session:

**First page load:** `OptanonConsent` is set with `interactionCount=0` and `groups=C0001:1,C0002:0,C0003:0,C0004:0` — only strictly necessary cookies (C0001) active. No consent banner appears.

**Within the same session**, the GTM dataLayer receives a consent update event:

```json
{
  "0": "consent",
  "1": "update",
  "2": {
    "ad_storage": "granted",
    "analytics_storage": "granted",
    "functionality_storage": "granted",
    "personalization_storage": "granted",
    "ad_user_data": "granted",
    "ad_personalization": "granted",
    "region": ["US-CA"]
  }
}
```

This is immediately followed by `OneTrustLoaded` and `OneTrustGroupsUpdated` events showing `OnetrustActiveGroups: ,C0001,C0002,C0003,C0004,` — all groups active. The `intType=1` mode treats continued browsing as consent. No banner was shown, no button was clicked, no explicit signal was given.

The `region: ["US-CA"]` targeting is the notable detail. Express knows this is a California user via the `x-location: US,CA` edge header and OneTrust's geolocation call (`GET geolocation.onetrust.com/cookieconsentpub/v1/geo/location`). The consent grant is scoped specifically to California — the region with the strongest data privacy protections in the US under CPRA.

Elevar's `consent_v2` field in the same dataLayer push records `"default": false` alongside `"update": true` for all ad storage categories — `ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage`, and `functionality_storage`. The default-false values confirm Express is aware these categories require explicit consent; the update-true values record the grant that happened without any user interaction.

### Granify/Wandz: No Consent Gate

The Granify/Wandz behavioral targeting system has `cookie_consent_required: false` explicitly set in its config object (`window.GRANIFY_CONFIG.cookie_consent_required: false`, SHOP_ID: 1447). This is a deliberate configuration — it tells Wandz to run regardless of the user's consent state. Granify fires 8 times on the homepage and 12 times on a product page, hitting `matching.granify.com/match`, `/metric`, `/log`, and `/offer_events`.

The Wandz data layer (`window.WDL`) computes a behavioral profile per session. The `aiFeatures` object includes:

- **Device fingerprint**: battery charge level, screen resolution, CPU benchmark score, network speed
- **Extension detection**: identifies Honey, Rakuten, Klarna, Capital One Shopping, RetailMeNot, Karma, and at least 8 other shopping extensions by name
- **Privacy indicators**: incognito mode detection (`isIncognitoSession`), VPN detection
- **Bot detection**: `isBot` and `isBotEnhanced` flags (the investigation session was correctly flagged)
- **Affinity inference**: `affinityToWomen`, `affinityToMen`, `affinityToUnderwear`, `affinityToDresses`, `affinityToJeans` — inferred from browse behavior
- **Custom audience**: `"first_time_visitors_with_affinity_to_jeans"`

The Wandz config also groups visitors into A/B buckets for popup placement experiments: "Per-Placement - Granify D" (51) and "Per-Placement - Baseline D" (52).

### Cookies Set on First Load

From a clean session on express.com, before any user interaction:

| Cookie | Source | Purpose |
|--------|--------|---------|
| `isMobile` | Express (server-set) | Edge device detection |
| `isTablet` | Express (server-set) | Edge device detection |
| `_abck` | Akamai Bot Manager | 1-year bot fingerprint |
| `bm_sz` | Akamai Bot Manager | 4-hour session sizing |
| `accessToken` | Express/Firebase | JWT guest auth token |
| `_shopify_y` | Shopify | Shopify visitor ID |
| `OptanonConsent` | OneTrust | Consent state (starts restricted) |
| `unbxd.userId` | Unbxd | Search tracking user ID |
| `unbxd.visit` | Unbxd | Visit type (`first_time`) |
| `unbxd.visitId` | Unbxd | Per-visit tracking ID |
| `crl8.fpcuid` | Curalate | First-party UGC content ID |
| `granify.uuid` | Granify/Wandz | Persistent behavioral ID |
| `granify.session.1447` | Granify/Wandz | Session ID (SHOP_ID 1447) |
| `granify.new_user.1447` | Granify/Wandz | New user flag |
| `exp_hbeat` | Express | Heartbeat ping |
| `ATTRIBUTION_LANDING` | Express | Landing page URL tracking |
| `_fbp` | Facebook Pixel | FB browser ID |
| `_scid` | Snapchat Pixel | Snap Click ID |
| `_ttp` | TikTok Pixel | TikTok user token |
| `_ga`, `_ga_RFQTHME9SL` | Google Analytics | GA4 client and session IDs |

---

## Surveillance Stack

Express runs 28 third-party services. A product detail page generates 133 requests across 29 third-party domains.

### Identity and Analytics
- **Google Tag Manager** (GTM-WF4SR975) — container for most tag firing
- **Google Analytics 4** (G-RFQTHME9SL, DC-15772160) — standard GA4 property
- **Elevar** (`aa-hits.getelevar.com`) — tag orchestration layer sitting between GTM and GA4/Facebook, handles the consent_v2 structure and fires user-level events separately from GA4

### Advertising and Remarketing
- **DoubleClick/DV360** — conversion tracking, view-through pixels
- **Google Remarketing** — three IDs: 1004750636, 1048592936, 1038761671
- **Facebook Pixel** (`_fbp` cookie, Elevar-managed)
- **Pinterest** (`ct.pinterest.com` — `/user/` and `/v3/` endpoints on PDP)
- **Snapchat Pixel** (`_scid` cookie)
- **TikTok Pixel** (`_ttp` cookie)
- **Trade Desk** (`insight.adsrvr.org/track/realtimeconversion`)
- **Teads** (`cm.teads.tv`, `t.teads.tv`)

### Behavioral and Session
- **Granify/Wandz** (`matching.granify.com`, `cfs.wandzapi.com`, `gs.wandzcdn.com`) — behavioral AI, 12 calls on PDP
- **Quantum Metric** (`ingest.quantummetric.com`) — session replay, two endpoints: `/horizon/d` (HEAD) and `/horizon/express` (POST, 7 calls per PDP)
- **Angler.ai** (`data.getangler.ai`) — workspace `ws-express-ow4ewj590`, fires on PDP and category pages
- **sitelabweb.com** — two domains: `geows.sitelabweb.com/jdldata/` (6 calls per homepage) and `colrep.sitelabweb.com/chpdata/` (5 calls per homepage). Vendor identity unconfirmed

### Commerce and Conversion
- **Klarna** (`js.klarna.com`) — SDK loaded sitewide despite `FLAGS.Klarna: false`. `KlarnaMessaging: true` — promotional banners are the active use case
- **Attentive** (`exp-us.attn.tv`) — SMS/push notification capture, `/unrenderedCreative` endpoint on PDP
- **TruRating** (`ecommapi.trurating.com`) — post-purchase ratings system, `/flex/questions` on PDP
- **BazaarVoice** (`apps.bazaarvoice.com`) — ratings and reviews, three endpoints on PDP including split tests config
- **Curalate** (`edge.curalate.com`) — shoppable UGC content, first-party cookie `crl8.fpcuid`
- **RevTrax** (`irxcm.com/RevTrax/`) — coupon and offer attribution tracking

### Infrastructure and Operations
- **Namogoo** (`gs.nmgassets.com`) — coupon injection and competitor extension detection. Three assets load: `EXCTAP997.snp`, `nmgCommonDictionary.json`, `L3EXCTAP997.json`. The `.snp` file is a gzip+base64-encoded msgpack binary containing detection rules
- **mPulse/BOOMR** (`c.go-mpulse.net`) — Akamai real user monitoring
- **TrackJS** (`capture.trackjs.com`) — JavaScript error monitoring
- **Zendesk** (`express-support.zendesk.com`) — support widget, 4 calls on homepage, 6 on PDP
- **IGLOO** (`window.IGLOO`) — fraud detection
- **iovation/ThreatMetrix** (`window.io_global_object_name`) — device reputation

---

## Feature Flags and Product Signals

`window.FLAGS` contains 170 feature flags. Selected observations:

**Payment infrastructure** — Aurus is the payment gateway for all payment types: `AurusPaymentGateway: true`, `AurusApplePay: true`, `AurusKlarna: true`, `AurusPayPal: true`, `AurusGiftCard: true`. The older `PayPal: false`, `Payeezy: false`, and `ApplePay: false` flags coexist, suggesting migration from multiple prior payment providers. The node-forge crypto library (`window.forge`) handles client-side payment encryption. `FLAGS.AurusIframe: true` confirms iframe-based payment form.

**Klarna split** — `Klarna: false` (buy-now disabled) but `KlarnaMessaging: true` (promotional messaging active) and `AurusKlarna: true` (processing path configured). Klarna's SDK loads regardless.

**Marketplace and seller infrastructure** — `Marketplace: true` and `SellerPages: true` are both active, corresponding to the Shopify cookie and third-party seller experience.

**Search migration** — `GoogleRetailSearch: true` and `GoogleRetailAutoComplete: true` confirm Express is on Google Cloud Retail Search. `searchServingConfig: "desktop-mobile"` (combined serving config). But `gcpConfig` shows every recommendation placement set to `false` across all page types (bag, PDP, cart, orderConfirmation, searchNotFound, category). `GcpRecommendations: true` in FLAGS contradicts this — the feature flag says enabled, the config says all placements off. Likely a deliberate rollback or a staged deployment not yet connected to the serving config.

**Disabled features** — `ReferAFriend: false`, `MentionMe: false` (referral program entirely off), `ShopRunner: false` (premium shipping program), `BoldMetrics: false` (AI size recommendation), `StylistAppointments: false`, `Stylitics: false` (outfit recommendation carousels — three separate Stylitics flags, all false), `GoogleMaps: false`, `SentryIo: false`, `NewRelic: false`.

**Compliance** — `ColoradoDeliveryFee: true` implements Colorado's retail delivery fee.

**Content migration** — `ContentStackMigration: true` indicates an ongoing or completed migration to Contentstack CMS, separate from AEM. `AemLegacyScripts: false` confirms legacy AEM scripts are being turned off.

**Abandoned experiments** — `Maxymiser: false` (Oracle Maxymiser A/B platform), `BrightTag: false` (old Relay42 tag manager, though `window.btPageData` still populates), `Gigya: false` (SAP Customer Data Cloud social login — `SocialLogin: false` also set).

---

## A/B Testing

FASTR Optimize (`window.FASTR_OPTIMIZE`) manages five active experiments. The naming convention — v11 and v3 suffixes — indicates iterative testing culture. Each experiment has a FASTR workspace ID `549826d2-6571-8098-8006-7f12245929ac`.

| Experiment | Variants | Allocation | Status |
|------------|----------|------------|--------|
| PDP Whitespace Reduction v11 | Compact / Control | 0% / 100% | Running control (v11 means 11+ iterations) |
| PLP Pagination v3 | Control / Pagination | 0% / 100% | Pagination variant shipped |
| Quickview Mobile Hide | Control / Hidden | 50% / 50% | Active 50/50 split |
| Reduced H1s v2 | Compact / Control | 0% / 100% | Concluded, control won |
| Smart Face Crop | Control / Grey BG Filter / Alt Styling | 100% / 0% / 0% | Concluded, control won |

URL patterns confirm scope: PLP experiments apply to `/womens-clothing/*` and `/mens-clothing/*`; Quickview Mobile Hide runs sitewide (`/*`).

**PDP Whitespace Reduction v11**: Eleven iterations of PDP layout testing without a clear winner suggests either a contested result or incremental gains too small to declare significance. Currently at 0% Compact / 100% Control.

**Smart Face Crop**: Tested AI-based face detection for image framing (Grey BG Filter, Alt Styling), but control won. The feature — automated product image cropping to center faces — didn't improve metrics enough to ship.

---

## Shopify Marketplace Layer

The `_shopify_y` cookie is set on `express.com` from the first page load. This is Shopify's visitor identifier, set when a Shopify-powered storefront is embedded in or connected to the page context. `FLAGS.Marketplace: true` and `FLAGS.SellerPages: true` are both active, confirming the marketplace is live. The Granify config includes `"marketPlaceFlag"` as a product property in its cart item tracking schema. The Unbxd API returns `marketPlaceFlag: "true"/"false"` per product to distinguish marketplace items from Express-owned inventory.

The pattern — a first-party retailer running a third-party marketplace on Shopify infrastructure, under their own domain — is common among department store operators post-2020. Express entered this model following the acquisition by a consortium that included WHP Global and Simon Property Group.

---

## Machine Briefing

### Access and Auth

The main site is publicly accessible. Akamai Bot Manager gates most interactions — direct curl to `/graphql` returns 403. Browser context (or a session with valid `_abck` / `bm_sz` cookies) is required for GraphQL.

Firebase anonymous auth issues a JWT automatically on first load: `accessToken` cookie, bearer token format. The `ecomm-resources-prod` Firebase project. The token is used on GraphQL calls but not needed for Unbxd.

The Unbxd search API requires no authentication and has no CORS restrictions:

```
# Full catalog, paginated
GET https://search.unbxd.io/d21gpk1vhmjuf5/express_com-u1456154309768/search?q=*&rows=100&start=0

# Specific query with inventory fields
GET https://search.unbxd.io/d21gpk1vhmjuf5/express_com-u1456154309768/search?q=dress&rows=50&fl=title,price,onlineInventoryCount,inStoreInventoryCount,storeIds,promoMessage,promote_metric,marketPlaceFlag

# Low stock products (1-10 online units)
GET https://search.unbxd.io/d21gpk1vhmjuf5/express_com-u1456154309768/search?q=*&rows=100&start=0&fl=title,price,onlineInventoryCount,storeIds&filter=onlineInventoryCount%3A%5B1+TO+10%5D

# Marketplace-only products
GET https://search.unbxd.io/d21gpk1vhmjuf5/express_com-u1456154309768/search?q=*&rows=100&filter=marketPlaceFlag%3Atrue
```

### Endpoints

**Open (no auth):**
```
# Sitemaps
GET https://www.express.com/siteindex.xml
GET https://www.express.com/productSitemap.xml
GET https://www.express.com/categorySitemap.xml
GET https://www.express.com/filterSiteMap.xml

# Robots
GET https://www.express.com/robots.txt

# Wandz config
GET https://gs.wandzcdn.com/wandz/EXPSD9C4BW-express_com-config.json

# Klarna runtime config
GET https://js.klarna.com/web-sdk/config/runtime-config.json

# FASTR workspace (experiment configs)
# ID: 549826d2-6571-8098-8006-7f12245929ac
```

**GraphQL (requires Akamai session cookies or browser context):**
```
POST https://www.express.com/graphql
Authorization: Bearer {accessToken}
Content-Type: application/json

{"query": "{ getCreditCardDiscount { creditCardDiscount } }"}
```

Introspection is blocked. Known operations from Apollo cache: `getCreditCardDiscount`, `getUniversalNav`, `getContent`, `getTrendingSearches`, `getTenderTypePreferredCardHeaderModal`, `orderSummary`, `freeShippingAndReturnsLegalText`, `paymentMethods`, `affiliate`.

**AEM CMS:**
```
# AEM content base (Apache Sling)
GET https://api.express.com/content/express/en/{path}

# CMS static content on GCS
x-docroot: /mnt/gcs/ecomm-prod-cms-static-content
```

### Gotchas

- **Akamai blocks direct curl to `/graphql`**: The `_abck` token requires Akamai's bot challenge solution. Use a browser session or Playwright; do not expect curl to work.
- **Firebase token expiry**: The `accessToken` JWT is short-lived. Refresh by loading the site in a clean session — Firebase guest auth fires automatically.
- **Unbxd `filter` syntax**: URL-encode brackets — `[` → `%5B`, `]` → `%5D`, `:` → `%3A`. Space in range → `+`. Unencoded filters return a 400.
- **Unbxd `fl` parameter**: If you omit `fl`, the response returns a limited default field set (no inventory). Always specify the fields you need.
- **GraphQL introspection blocked**: The endpoint exists and accepts authenticated requests, but schema introspection returns an empty response. Operation names must be known in advance.
- **Obfuscated Akamai endpoint**: `POST /cev91m/U/F/eUd8pxQvjezR/iYYSVQzSQhczSr7mEu/CWFtAQ/M1Ake/j4QD18B` — Akamai Bot Manager sensor, returns 201. Fires 3-4x per page automatically.
- **`api.express.com`**: Serves AEM/Apache Sling 404s on unknown paths. The error response reveals internal path structures (`/content/express/en/error-pages/`). Not a REST API entry point.
