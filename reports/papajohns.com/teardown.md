---
# agents: machine-friendly instructions in "## Machine Briefing"
title: Papa John's — Teardown
url: "https://www.papajohns.com"
company: Papa John's
industry: Hospitality
description: "National pizza delivery and carryout chain with online ordering."
summary: "Next.js 15 App Router SPA on Akamai CDN with an Istio/Envoy service mesh backend. The API layer is tRPC via Next.js API routes, with every catalog read endpoint unauthenticated. Feature flagging runs dual-track through LaunchDarkly and Firebase Remote Config, though Firebase is not yet fully activated per its own LaunchDarkly kill flag. The SSL certificate SAN list maps a microservices subdomain matrix for seven or more third-party delivery integrations — DoorDash, Grubhub, Uber Eats, EZCater, and at least two unidentified partners — each with dedicated cart, menu, and orders endpoints."
date: 2026-04-06
time: "16:57"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack: [Next.js, React, tRPC, Akamai, Istio, Firebase, LaunchDarkly, Braze]
trackers: [Google Tag Manager, Google Analytics, Google Ads, Facebook Pixel, TikTok Pixel, Snapchat Pixel, FullStory, ABTasty, Yahoo Analytics, AppDynamics, Akamai mPulse]
tags: [pizza, food-delivery, next-js, trpc, feature-flags, pre-consent-tracking, oracle-erp, tableau, delivery-integrations, akamai]
headline: "A staged A/B test hardcodes the URL for a 'cheesy-burger-pizza' builder page that doesn't exist yet, leaking an unreleased menu item."
findings:
  - "Papa John's finance ERP login page (Oracle PeopleSoft) sits on the public internet at finprodib.papajohns.com with no WAF, no IP restriction, and no authentication layer in front of it."
  - "The Tableau Cloud analytics portal at store-analytics.papajohns.com leaks an internal server IP (10.77.31.168:8080) in a base64-encoded HTTP response header visible to any visitor."
  - "All tRPC read endpoints return the full product catalog — including internal profitCode, v6Code POS identifiers, and offer pricing codes — without authentication, accepting storeId 0 as a universal parameter."
  - "ABTasty runs with runWithoutConsent:true, fingerprinting visitors and assigning A/B test buckets before the OneTrust consent banner even renders — despite the consent system being present on every page."
  - "LaunchDarkly flag prevent-orders-with-expired-cards-release is false, indicating the payment card expiry guard has not yet shipped to production."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

The public-facing site is a Next.js 15.3.6 App Router application. The App Router build is confirmed by the absence of `__NEXT_DATA__` in the page globals and the presence of `appDir: true` on `window.next`. Response headers show `server: istio-envoy` and `x-envoy-upstream-service-time: 172`, placing the backend behind an Istio service mesh — Kubernetes is the inferred runtime. Akamai sits at the edge, contributing CDN caching (`mpulse_cdn_cache: HIT`), mPulse RUM (`BOOMR_API_key: "ZHLKT-3LNJX-LH32V-JEJES-LDF3X"`), and Bot Manager (`_abck`, `bm_sz` cookies; an obfuscated endpoint at `/UGhMSh/uZ/hh/xAIP/carDiOs5Bf/O51iSrm0SfpcD2S1/UVReGQE/VH/QyFAxWYwwB` receives POST requests and returns 201).

The API layer is tRPC, served via Next.js API routes at `/api/trpc/`. The tRPC batch endpoint was probed and returned 404, so each procedure is called individually. HTTP/2 is enabled site-wide. HSTS is set with `max-age=31536000; includeSubDomains; preload`.

Feature management runs on two parallel systems: LaunchDarkly handles the primary feature flag evaluation, while Firebase Remote Config (`project: pji-prod-crm-firebase`) is being integrated — the LaunchDarkly flag `gip-firebase-sdk-integration-enabled` is currently `false`, meaning Firebase Remote Config is loaded and polling but not fully operationalized. The Firebase project number is `327285252698`.

Braze (`sdk.iad-05.braze.com`, SDK key `965d92e4-5d37-4446-8388-36c4eaf8f150`) handles push notifications and CRM messaging, posting to `/api/v3/data/` and `/api/v3/content_cards/sync` on page load.

The GTM container (version 479) is present, along with jQuery and a full suite of Preline UI (HSComponents) alongside React — likely carried from the previous site generation. `postscribe` handles async script injection. On the initial response, `x-middleware-rewrite` contains active Snapchat ad campaign UTM parameters (`utm_source=Snapchat_80fb949c-576c-4477-9f0c-5448c6366b69`), meaning the middleware rewrites the URL for UTM tracking before the page renders.

---

## tRPC API — Public Catalog

The tRPC API at `/api/trpc/` is the site's primary data layer. All query (read) procedures are accessible without authentication cookies. The endpoint format is:

```
GET /api/trpc/{router}.{procedure}?input={"json":{...}}
```

A `storeId` of `0` functions as a wildcard, returning the default product catalog with `.00` placeholder prices. A real store ID (e.g., `56`) returns actual store pricing — 204 products at storeId 56 vs. 197 at storeId 0, with 193 of 197 products showing different prices between the two.

### Procedure inventory

| Procedure | Auth required | Notes |
|-----------|--------------|-------|
| `appConfig.get` | No | Returns all client-side SDK keys |
| `home.getMenuCategoryListCold` | No | 12 menu categories |
| `home.getByStoreCold` | No | Homepage heroes and deals (placeholder state) |
| `home.getByStore` | No (storeId required) | Deals and heroes for a specific store |
| `menuCategory.getByStore` | No (storeId) | Full menu with product groups and nutrition |
| `menuCategory.getAvailableOptionBySku` | No (storeId) | 180+ SKU availability map |
| `product.getByStore` | No (storeId) | 197–204 products with internal codes |
| `product.getBySkus` | No (skus + storeId) | Detailed product by SKU with nutrition |
| `productModification.getCrusts` | No (storeId) | Crust types with prices |
| `toppings.getToppings` | No (storeId) | Topping IDs and availability |
| `createYourOwn.getCreateYourOwn` | No (storeId) | Pizza builder configuration |
| `countries.getCountries` | No | USA + Canada territory IDs |
| `deals.getDealById` | No (dealId + storeId, mutation) | Full deal with internal pricing fields |
| `favorite.getCustomerFavorites` | Yes (customerId + storeId) | Requires authenticated customerId |

### appConfig.get

The `appConfig.get` procedure returns the full client configuration bundle:

```json
{
  "brazeApiKey": "965d92e4-5d37-4446-8388-36c4eaf8f150",
  "deploymentEnvironment": "prod",
  "googleMapsApiKey": "AIzaSyC15D_OIdg5CqJ-sI0_0YZxPmuD_yQQYXQ",
  "googlePayMerchantId": "14564505187650338668",
  "googlePayPublicKey": "BBODhQpXuYVqacd5ucqljtzCPSpiiTRxrdcMn1nxuqp0riAqnpxmVCgIbo0Q5Z8uhN5EKdXWgd7nha0cIMwsUIo=",
  "ldClientId": "68c07f479293dc09bbf0ed45",
  "rwdUrl": "https://www.papajohns.com"
}
```

These are client-side keys appropriate for frontend use (Braze client SDK key, Google Maps browser key, LaunchDarkly client-side SDK key), not server-side secrets.

### Internal product codes

`product.getByStore` returns every product with multiple internal classification fields:

- `profitCode`: POS profit center category (`BOWL`, `GFRE`, `NY12`, `NY14`, `NY16`, `PN12`, `SWCH`, `TH`, `10`, `12`, `14`)
- `v6Code`: V6 POS system identifier (e.g., `SWCHPSTK`, `BOWL`, `10MEAT`, `12BFLO`)
- `code`: Internal product code (e.g., `PBWLCYBB`, `PSWCPCS`)
- `codeStandardId`: Internal standard code integer
- `eamFlag`: Boolean, all currently `false`
- `numDupTops`: Duplicate topping logic parameter
- `maxToppings`, `maxSameTopping`: Ordering constraints

### deals.getDealById

A mutation (POST required). A sample deal (id: 51497) returns:

```json
{
  "dealId": 51497,
  "offerId": 1188752,
  "dealCode": "ED1188752",
  "offerCode": "EDYCZT2",
  "pricingMethodCode": "STANDARD_PRICE_EDEAL",
  "sortOrder": 5,
  "offerStartDate": "2025-07-17",
  "offerEndDate": "2027-01-01",
  "displayPrice": "7.99"
}
```

`pricingMethodCode` reveals the internal offer pricing system identifier. `offerStartDate` and `offerEndDate` are internal scheduling fields not displayed to users. The full step/product group structure with instruction IDs is included in the response.

### Zod error schema leakage

Malformed requests to cart mutations return Zod validation errors that enumerate all required field names and types. The error message from the tRPC batch probe returned:

```json
{"message":"No procedure found on path \"appConfig.get,home.getMenuCategoryListCold\"","code":-32004}
```

Confirming batch mode is disabled. Sending partial cart mutation inputs returns the full required schema via Zod error output.

---

## Surveillance

A full page load on the homepage makes 60 HTTP requests: 12 first-party (11 unique endpoints) and 48 third-party (18 domains). The `/order/menu` page adds 62 Firebase Remote Config calls on top of that baseline. Every tracking system activates before any consent interaction with the OneTrust banner.

### Tracker inventory

| System | Identifier | Purpose |
|--------|-----------|---------|
| Google Tag Manager | Container v479, UA-750512-1 | Tag orchestration |
| Google Analytics (Universal) | `ga`, `gaGlobal`, UA-750512-1 | Session analytics |
| Google Analytics 4 | `_ga_J9WX5FVB6C` | Event analytics |
| Google Ads | `_gcl_au`, DoubleClick (`stats.g.doubleclick.net`) | Conversion attribution |
| Facebook Pixel | `fbq`, `_fbq`, `_fbp` | Ad retargeting |
| TikTok Pixel | `ttq`, `_ttp`, `ttcsid`, `ttcsid_CN1P7L3C77UCVPFVE4T0` | Ad retargeting |
| Snapchat Pixel | `snaptr`, `_scid` | Ad retargeting |
| Yahoo Analytics | `YAHOO`, config ID `10202642` | Analytics/advertising |
| FullStory | `FS`, org `14KT0W`, `fs_support_id` | Session recording |
| ABTasty | Account `2714e039bbb037780d4e81d4fd048ad4` | A/B testing |
| AppDynamics RUM | `ADRUM`, app key `AD-AAB-ADZ-CEE`, beacon `pdx-col.eum-appdynamics.com` | Performance monitoring |
| Akamai mPulse | `BOOMR`, key `ZHLKT-3LNJX-LH32V-JEJES-LDF3X` | CDN RUM |
| Braze | SDK key `965d92e4-5d37-4446-8388-36c4eaf8f150` | CRM / push notifications |

Four globals — `sv_DNT`, `_svq`, `_svt`, `dotq` — are present but unidentified. `dotq` is consistent with a DoubleClick event queue naming pattern; the `sv_*` variables are unknown. Data Layer Observer (`_dlo_*`) is loaded with rules for Adobe Analytics (`_dlo_rules_adobe_am`), Google Enhanced Commerce (`_dlo_rules_google_ec`, `_dlo_rules_google_ec_ga4`), and Tealium Retail (`_dlo_rules_tealium_retail`). The presence of Adobe and Tealium rules alongside a GTM stack suggests either a recent platform migration or those systems remain active in some contexts.

### Cookie inventory (pre-consent)

All of the following cookies are set before any consent banner interaction:

| Cookie | Source | Expiry |
|--------|--------|--------|
| `prcookie=omni` | First-party session | 1 day |
| `akacd_www_papajohns_pr` | Akamai CDN | 2038 |
| `_abck` | Akamai Bot Manager | 1 year |
| `bm_sz` | Akamai Bot Manager | 4 hours |
| `PIM-SESSION-ID` | Akamai Page Intelligence Module | Session |
| `pj-session-id` | First-party session UUID | Session |
| `auth-store` | Zustand state store (`{"state":{},"version":0}`) | Session |
| `_gcl_au` | Google Ads conversion | 90 days |
| `fs_support_id` | FullStory | Persistent |
| `ABTastySession` | ABTasty | Session |
| `ABTasty` | ABTasty | Persistent |
| `ab.storage.deviceId.*` | ABTasty device fingerprint | Persistent |
| `_scid` | Snapchat Pixel | Persistent |
| `_tt_enable_cookie`, `_ttp` | TikTok Pixel | Persistent |
| `_fbp` | Facebook Pixel | 90 days |
| `NEXT_LOCALE=en` | Next.js locale | Persistent |
| `OptanonConsent` | OneTrust consent record | 1 year |
| `_ga`, `_gid` | Google Analytics | 2yr / 24hr |
| `_ga_J9WX5FVB6C` | GA4 | 2 years |
| `RT` | Akamai mPulse / Boomerang | Session |
| `ADRUM_BT` | AppDynamics RUM | Session |
| `ttcsid`, `ttcsid_CN1P7L3C77UCVPFVE4T0` | TikTok session | Session |

### OneTrust and consent bypass

OneTrust is configured with domain ID `3fae77a8-5002-4f3e-920e-9b9c4e5ae475`, tenant GUID `24528fbe-3e9a-4ba1-b316-39ca27517543`, under "U.S. Privacy Law" rules (CPRA / opt-out model). The banner uses `UseV2: true`, script version `202601.2.0`. The OneTrust geolocation service (`geolocation.onetrust.com`) is called on load for consent routing.

ABTasty is explicitly configured to bypass consent: the test-level config for test 1247880 shows `"runWithoutConsent":true`. The investigator also observed `waitForConsent.mode: "disabled"` in the account-level ABTasty settings. ABTasty calls `dcinfos-cache.abtasty.com` for GeoIP and UA parsing on every page load before the consent banner resolves, and sets `ABTastySession`, `ABTasty`, and `ab.storage.deviceId.*` cookies immediately.

The `OptanonConsent` cookie is set on first page load with all groups accepted as default — tracking initializes before the user has any opportunity to interact with the banner.

The `/biometric_policy` path appears in robots.txt as `Disallow`, indicating a page exists for biometric data disclosure — consistent with Illinois BIPA compliance requirements.

---

## Feature Flags & Product Signals

### LaunchDarkly

LaunchDarkly client ID `68c07f479293dc09bbf0ed45` is readable without auth. The full flag evaluation is accessible via the client-side SDK eval endpoint. All 15 flags evaluated for an anonymous context:

| Flag | Value |
|------|-------|
| `add-to-cart-recommendations` | `false` |
| `cart-quick-adds-config` | `{}` (empty) |
| `cart-quick-adds-kill-switch` | `false` |
| `customer-account-verification` | `false` |
| `delivery-auto-suggest-approximate-location` | `false` |
| `gip-firebase-sdk-integration-enabled` | `false` |
| `is-order-it-again-enabled` | `false` |
| `order-trackable-endpoint-release` | `false` |
| `papa-rewards-quick-signup-toggle` | `true` |
| `papa-track-load-store-from-local-session-release` | `false` |
| `papa-track-order-map-max-polling-attempts-config` | `0` |
| `papa-track-order-map-polling-delay-in-seconds-config` | `0` |
| `par-store-kill-switch` | `false` |
| `plan-ahead-enabled-for-papa-track-release` | `false` |
| `prevent-orders-with-expired-cards-release` | `false` |

`prevent-orders-with-expired-cards-release: false` means the enforcement of payment card expiry validation is not yet active in production. The flag name and structure indicate it's a staged release, not a deliberate product decision.

The papa-track flags cluster tells a story: `papa-track-order-map-max-polling-attempts-config` and `papa-track-order-map-polling-delay-in-seconds-config` are both `0`, `order-trackable-endpoint-release: false`, and the `papaTrack.getPapaTrackOrderConfirmation` tRPC procedure returned 404. The real-time order tracking system appears to be under active reconstruction. `plan-ahead-enabled-for-papa-track-release: false` confirms scheduled orders are not yet tied into the tracking system.

### Firebase Remote Config

Firebase Remote Config polls `POST /v1/projects/pji-prod-crm-firebase/namespaces/firebase:fetch` continuously. On the homepage it makes 14 calls per session; on `/order/menu` it makes 62 calls in a single session. The Firebase project is named `pji-prod-crm-firebase` (Papa Johns Inc. Production CRM Firebase), project number `327285252698`. Firebase API key: `AIzaSyB76oDH6qYCEWy30eI6q1uD-BLIElSAbqw`.

The Firebase authorized domains list contains only `["localhost", "pji-prod-crm-firebase.firebaseapp.com"]` — `papajohns.com` is not listed. This applies to Firebase Auth flows, not Remote Config fetches, which explains why the config calls succeed (200) despite the domain mismatch. A direct probe of the Remote Config API with an external request returned `403 AUTHORIZATION_ERROR: AppId '1:327285252698:web:xxx' does not match specified project`.

The 62-call count on a single menu page session is consistent with a React `useEffect` missing a dependency array or a re-render cycle in production. The LaunchDarkly flag `gip-firebase-sdk-integration-enabled: false` confirms Firebase Remote Config integration is still being staged and not yet fully operationalized.

### ABTasty A/B tests

12 tests active at investigation time, from `window.ABTasty.accountData.tests`:

| ID | Name | Type | Traffic |
|----|------|------|---------|
| 1080393 | DCXD-2413 Omni Bar - Quick SignIn | ab | 7% |
| 1131575 | DCXD-4923 Free delivery promo allows papaUpsizing issue | ab | 100% |
| 1247880 | DCXD-7702 [AB Test][CheesyBurger] Topping Upsell In Menu and Builder | ab | 100% |
| 1327904 | DCXD-11085 [Patch] Warm/Hot V2 homepage hero and deals | ab | 100% |
| 1331935 | Test Widgit | mastersegment | — |
| 1331936 | Test Widgit | subsegment | 100% |
| 1342176 | DCXD-11249 [AB Test] Web + CTA vs Order Now | ab | 66% |
| 1361623 | DCXD-11316 [AB Test] 9.99 Buy Another Cross-sell Test (Jan 2, 2025) | ab | 100% |
| 1393819 | DCXD-12348 [Patch] Add /each to price for Papa Pairings on Deals Page (2/26) | ab | 100% |
| 1450129 | Akamai Store Search (User Testing) | ab | 100% |
| 1469173 | Papa Foundation Menu Copy - Papa Johns V1 (personalization) | subsegment | 100% |
| 1469174 | Foundation Specialty Offer Test | mastersegment | — |
| 1564372 | Homepage Cold State Test | ab | 50% |

Test names expose internal Jira ticket IDs (`DCXD-*`). Several tests at 100% traffic are patches deployed through the ABTasty layer — `DCXD-4923` addresses a bug where a free delivery promo allowed "papaUpsizing," and `DCXD-12348` adds `/each` to price display on the Papa Pairings deals page. Deploying production fixes via ABTasty rather than a full deployment is a pattern visible in the test names.

---

## The Cheesy Burger Signal

ABTasty test 1247880 — `DCXD-7702 [AB Test][CheesyBurger] Topping Upsell In Menu and Builder` — encodes a product URL in its targeting scope that does not currently exist on the site:

```
/order/builder/productBuilderInfo?productGroupId=cheesy-burger-pizza&productSKU.sku=1-1-4-334&quantity=1&modification=
```

The `productGroupId=cheesy-burger-pizza` is an internal menu category slug. SKU `1-1-4-334` (decoded structure: sizeId=1, productTypeId=1, baseIngredientTypeId=4, customizationId=334) does not appear anywhere in `product.getByStore` for storeId 0 or storeId 56. All 197 default-catalog products have been checked — customizationId 334 is absent.

The test status is `"status":"target_pages_rejected"` — the builder URL does not currently exist, so the targeting conditions are never satisfied and the test never fires. The test is staged with a "Warm/Hot States" audience trigger (`userStatus.storeSet: true`), targeting users who have set a store location. Its single variation (ID: 1546167) has 100% traffic allocation, indicating this is a full rollout waiting for the product page to become available.

The click-tracking selectors defined in the test — `#bacon-topping`, `#garlic-crust-topping`, `#abt-add-to-order`, `#abt-customize` — map to specific element IDs in the product builder. The `#garlic-crust-topping` selector appearing on both the menu card and the builder form suggests garlic crust is a featured upsell for this product. Despite the name "CheesyBurger," the product is built on the pizza infrastructure (same product type and base ingredient type as existing pizzas in the catalog).

---

## Infrastructure Exposure

### Oracle PeopleSoft ERP — finprodib.papajohns.com

`finprodib.papajohns.com` serves a publicly accessible Oracle PeopleSoft Finance ERP login page. The root path returns a meta-refresh redirect (1-second delay) to `/psp/ps/?cmd=login&languageCd=ENG`. The HTML carries Oracle copyright (`© 1988, 2009 Oracle and/or its affiliates`) and a standard PeopleSoft login form (User ID, Password, Language selector). No WAF, no IP restriction, no basic auth layer is in front of it.

The subdomain name decodes as Finance Production Integration Broker — PeopleSoft's Integration Broker (IB) is the middleware component used for HR, Finance, and Supply Chain workflow automation between internal systems. The `finprodib` naming distinguishes it from test environments.

Akamai mPulse is present on this subdomain with a different RUM key (`5F7DY-PMAP6-UTQNQ-458MK-C7EYR`) from the main site, confirming it is an actively instrumented production system.

### Tableau Cloud Portal — store-analytics.papajohns.com

`store-analytics.papajohns.com` resolves to a Tableau vizportal (`data-buildid: "2026_1_20_asg3wt51lh"`, built January 20, 2026). The portal redirects to `sso.online.tableau.com` for authentication, indicating Tableau Cloud with SSO.

The HTTP response includes a `global-session-header` whose base64-encoded value decodes to an internal IP address:

```
global-session-header: MTAuNzcuMzEuMTY4OjgwODA=
                       → 10.77.31.168:8080
```

This internal Kubernetes or load-balancer IP is visible to any external user who loads the portal page. The same Akamai mPulse key (`5F7DY-PMAP6-UTQNQ-458MK-C7EYR`) appears in the Tableau page, placing it on the same Akamai account as `finprodib`.

The Tableau REST API at `/api/2.8/auth/signin` is reachable but returns a proper 401. Access requires valid SSO credentials.

### posttip.papajohns.com — Kong API Gateway

During investigation, `posttip.papajohns.com` returned HTTP 401 with `{"message":"Unauthorized"}`, `x-kong-response-latency: 1`, and `access-control-allow-origin: *`. Kong API Gateway was confirmed as the backend. "posttip" is consistent with a post-delivery tip collection endpoint. The CORS wildcard on the error response indicates the Kong CORS plugin is configured permissively. A verification check at report time returned 403 from Akamai WAF, suggesting WAF filtering is inconsistent or agent-dependent. The investigator's 401/Kong observation stands as a real signal of the underlying backend configuration.

### Delivery integration subdomain matrix

The SSL certificate SAN inventory maps a microservices architecture for third-party delivery integrations. Each partner has dedicated cart, menu, and orders subdomains:

| Prefix | Partner | HTTP status |
|--------|---------|-------------|
| `dd{cart/menu/orders}` | DoorDash | 403 (Akamai WAF) |
| `gh{cart/menu/orders}` | Grubhub | 403 (Akamai WAF) |
| `ue{cart/menu/orders}` | Uber Eats | 404 (possibly inactive) |
| `ez{cart/menu/orders}` | EZCater | No HTTP response (DNS only) |
| `tc{cart/menu/orders}` | Unknown partner | 403/404 mix |
| `ts{cart/customer/menu/orders}` | Unknown partner | 403/404 mix |
| `ppcll{cart/customer/menu/orders}` | Papa Johns LLC internal | 403/404 mix |

Additional subdomains from the cert: `analytics.papajohns.com` (403), `api.papajohns.com` (403), `carts.papajohns.com` (403), `loyalty.papajohns.com` (404), `mapping.papajohns.com` (404), `menus.papajohns.com` (403), `orders.papajohns.com` (404, Kong gateway), `papatrack-prod.papajohns.com` (403), `payments.papajohns.com` (no response), `promos.papajohns.com` (403), `papadrive.papajohns.com` (503 — inferred driver app backend), `hrprodss.papalink.net` (HR production system, separate domain).

---

## Machine Briefing

**Access and auth:** All tRPC read queries work with a plain GET request — no cookies, no auth headers. Pass `input` as URL-encoded JSON. Cart mutations need the full request body; send a partial request to get the Zod field schema back as an error. The Akamai Bot Manager fingerprints clients via the obfuscated POST endpoint on every page load — automated clients skipping this will likely face downstream bot challenges.

### Open endpoints

```bash
# Full product catalog (storeId 0 = .00 placeholder prices)
curl "https://www.papajohns.com/api/trpc/product.getByStore?input=%7B%22json%22%3A%7B%22storeId%22%3A0%7D%7D"

# Real store pricing (storeId 56 confirmed working)
curl "https://www.papajohns.com/api/trpc/product.getByStore?input=%7B%22json%22%3A%7B%22storeId%22%3A56%7D%7D"

# Menu categories
curl "https://www.papajohns.com/api/trpc/menuCategory.getByStore?input=%7B%22json%22%3A%7B%22storeId%22%3A0%7D%7D"

# SKU availability map
curl "https://www.papajohns.com/api/trpc/menuCategory.getAvailableOptionBySku?input=%7B%22json%22%3A%7B%22storeId%22%3A0%7D%7D"

# App config (SDK keys, deploy environment)
curl "https://www.papajohns.com/api/trpc/appConfig.get"

# Homepage cold state
curl "https://www.papajohns.com/api/trpc/home.getMenuCategoryListCold"

# Country/territory IDs
curl "https://www.papajohns.com/api/trpc/countries.getCountries"

# Crust types with prices
curl "https://www.papajohns.com/api/trpc/productModification.getCrusts?input=%7B%22json%22%3A%7B%22storeId%22%3A56%7D%7D"

# Toppings
curl "https://www.papajohns.com/api/trpc/toppings.getToppings?input=%7B%22json%22%3A%7B%22storeId%22%3A56%7D%7D"

# Pizza builder config
curl "https://www.papajohns.com/api/trpc/createYourOwn.getCreateYourOwn?input=%7B%22json%22%3A%7B%22storeId%22%3A0%7D%7D"
```

```bash
# Deal details — mutation (POST required)
curl -X POST "https://www.papajohns.com/api/trpc/deals.getDealById" \
  -H "Content-Type: application/json" \
  -d '{"json":{"dealId":51497,"storeId":56}}'
```

### LaunchDarkly

```bash
# All flags for anonymous context
curl "https://app.launchdarkly.com/sdk/evalx/68c07f479293dc09bbf0ed45/contexts/{base64-context-jwt}"

# SDK goals
curl "https://app.launchdarkly.com/sdk/goals/68c07f479293dc09bbf0ed45"
```

Context JWT format: base64-encode `{"kind":"user","key":"{uuid}","anonymous":true}`.

### Firebase Remote Config

```bash
# Remote config fetch
curl -X POST \
  "https://firebaseremoteconfig.googleapis.com/v1/projects/pji-prod-crm-firebase/namespaces/firebase:fetch" \
  -H "Content-Type: application/json" \
  -d '{"appId":"1:327285252698:web:xxx","appInstanceId":"xxx"}'
# API key: AIzaSyB76oDH6qYCEWy30eI6q1uD-BLIElSAbqw
```

### Infrastructure

```bash
# PeopleSoft ERP (public, no auth required to load login page)
curl -L "https://finprodib.papajohns.com/"
# → redirects to /psp/ps/?cmd=login&languageCd=ENG

# Tableau portal (global-session-header leaks internal IP)
curl -I "https://store-analytics.papajohns.com/"
# → global-session-header: MTAuNzcuMzEuMTY4OjgwODA= (= 10.77.31.168:8080)

# Kong API gateway
curl -I "https://posttip.papajohns.com/"
```

### Gotchas

- tRPC batch mode is disabled. `/api/trpc/proc1,proc2` returns 404. Each procedure is a separate request.
- `storeId: 0` returns placeholder `.00` prices across all 197 products. Use a real store ID (e.g., `56`) for actual pricing.
- `deals.getDealById` is a tRPC mutation — POST only. GET returns method not allowed.
- The Akamai Bot Manager fingerprinting endpoint changes path (obfuscated). Automated clients that bypass it will likely encounter challenges on subsequent API calls.
- Firebase Auth authorized domains do not include `papajohns.com` — only `localhost` and `pji-prod-crm-firebase.firebaseapp.com`. Firebase Auth-dependent features will fail from external origins; Remote Config fetches succeed regardless.
- LaunchDarkly context JWTs use base64-encoded JSON: `{"kind":"user","key":"{uuid}"}` for anonymous or `{"kind":"user","key":"{userId}","email":"{email}"}` for identified users.
- `posttip.papajohns.com` returned 403 from Akamai WAF at report time but 401/Kong during investigation — Akamai filtering behavior is inconsistent; the underlying Kong endpoint is real.
