---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Newegg -- Teardown"
url: "https://www.newegg.com"
company: "Newegg"
industry: "Retail"
description: "Consumer electronics and PC parts retailer with third-party marketplace."
summary: "Newegg runs a hybrid stack -- legacy ASP.NET .aspx endpoints coexisting with a modern React SPA and Kubernetes deployment, all fronted by Akamai. Two parallel tag managers (Tealium and Adobe Launch) feed a 14-tracker surveillance layer. Server-rendered state injection exposes detailed pricing, inventory, and seller performance data on every page load, much of it queryable without authentication."
date: 2026-04-13
time: "20:37"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack: [ASP.NET, React, Akamai, Kubernetes, Tealium, Adobe Launch, Sentry]
trackers: [Google Analytics, Google Ads, Microsoft Clarity, Microsoft UET, Attentive, Affirm, PayPal, Narrativ, PointAndPlace, Tealium, Adobe Launch, Akamai mPulse, Osano, sts.eccmp.com, scirtem.onewegg.com]
tags: [retail, marketplace, electronics, api, dark-patterns, gaming, surveillance, consent-bypass, fingerprinting, gpu-lottery]
headline: "Newegg's MoreBuyingOptions API returns every marketplace seller's price, stock level, ship-from country, and internal algorithmic ranking scores — no authentication required."
findings:
  - "The GPU lottery system requires winners to purchase 5-6 additional components (cases, memory, coolers, PSUs) alongside the graphics card -- the bundle mechanic is encoded in the data model, not a UI suggestion, and the full lottery manifest is queryable without authentication."
  - "The MoreBuyingOptions API requires no authentication and returns every marketplace seller's listing price, stock level, ship-from country, and Newegg's internal algorithmic scores (WarehouseProcessScore, MerchantMetricsScore) for any product."
  - "Three cross-session identity anchors -- a 64-char fingerprint hash (hgfp) in localStorage, a cookie-mirrored ID in NV_NeweggLocalStorage.ID2, and a UUID in lscache-distinctId -- operate independently of consent decisions."
  - "Osano's consent manager explicitly whitelists Narrativ and PointAndPlace in its tattles config -- both scripts load regardless of the user's privacy choice, while Attentive fires 7 cookies before consent resolves."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Newegg has been selling electronics and PC parts since 2001. The site presents as a modern React SPA. Underneath, it's a layered retrofit: a webpack frontend over a partially modernized ASP.NET backend, all proxied through Akamai, with a product API surface that returns significantly more data than the page UI actually uses.

## Architecture

The homepage comes off Akamai -- identified by `AkamaiGHost` in the Server header and `server-timing: ak_p` in the response. Every HTTP response carries `x-ver: 04142020`, a version stamp frozen at April 14, 2020. The frontend is a React SPA identified by the webpack chunk name `webpackChunkb2c_site_www`. Server-side rendered state ships in `window.__initialState__`, `window.__neweggState__` (country, user, domains, currency), and `window.__pageInfo__` (routeName, isWWWDomain, hostname, theme).

The Kubernetes deployment leaks its pod name into client-side JavaScript: `window.__SITE__.serverName: "e4k8s"`. `window.__SITE__.environment: "production"`. These ship on every page load to every browser.

The legacy ASP.NET layer is still active. `window.__SITE__.JsonpList` includes three JSONP endpoints:
- `loadpopupinfo2016.aspx` -- specification popup, 2016-era endpoint
- `OverviewContent4Moblie.aspx` -- typo ("Mobile" misspelled), still in the active endpoint list
- `mycountry` -- current geolocation lookup

The `Link` preconnect header on every homepage response enumerates internal infrastructure:

```
assets.adobedtm.com, c1.neweggimages.com, promotions.newegg.com,
www2.newegg.com, pf.newegg.com, ec-apis.newegg.com,
sealserver.trustwave.com, help.newegg.com, states.newegg.com,
secure.newegg.com, tags.tiqcdn.com, images10.newegg.com
```

`ec-apis.newegg.com` is an API gateway that requires an API key -- requests without one return `{"errorCode":"403","errorMessage":"We were unable to locate your API Key."}`. The other internal subdomains (`states.newegg.com`, `www2.newegg.com`) don't respond to direct requests.

Two tag managers run simultaneously: Tealium (`tags.tiqcdn.com`) and Adobe Launch (`assets.adobedtm.com`). Running both is unusual -- they serve overlapping functions and the combination typically reflects an incomplete migration or split ownership. The Content Security Policy covers only `upgrade-insecure-requests` -- no script-src restrictions, no connect-src restrictions.

`window.AMBER`, `window.amber_condload`, and `window.adtagclaz` are Newegg's internal ad targeting system. `amber-tag.js` loads from `imk.neweggimages.com/WebResource/Scripts/amber-tag.js`. The `/amber3/match` endpoint fires on homepage and search page loads. This is separate from the third-party ad stack and handles Newegg's internal sponsored placement logic.

`window.__SITE__.batchConfig: {enableAdSyStem: true}` -- the typo ("SyStem") is in production.

## The Open Marketplace API

The most functionally significant unauthenticated endpoint is `MoreBuyingOptions`. It returns the complete seller roster for any product with no auth, no session, no rate limiting observed.

The Akamai WAF blocks bare curl requests (returns 400). Adding a browser User-Agent string passes through freely -- no cookies, no session required:

```bash
curl -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  -H "Referer: https://www.newegg.com/" \
  "https://www.newegg.com/product/api/MoreBuyingOptions?ParentItem=14-137-778&TabType=0&SortBy=0&FilterBy=&MappingId=14-137-778&FirstCall=true&PageNum=1&PageSize=5&NewItemLowestPrice=1059.99"
```

For the RTX 4070 Ti (ParentItem 14-137-778), the response contains 6 seller listings (3 New, 3 Used). Per seller, the response includes:

- `Item` -- seller's specific SKU
- `UnitCost` -- seller's listing price
- `ShipFromCountryCode` / `ShipFromCountryName` -- ship origin
- `Instock` / `Active` -- live availability flags
- `Seller.SellerId`, `Seller.SellerName`, `Seller.SellerRating`, `Seller.SellerReviewCount`
- `Seller.TopRated`, `Seller.IsHotSeller`
- `RankInfo.WarehouseProcessScore` -- fulfillment performance score (0--1)
- `RankInfo.MerchantMetricsScore` -- seller quality score (0--1)
- `RankInfo.FastestDays`, `RankInfo.SlowestDays` -- delivery range
- `Review.ItemAsDescribedRate`, `Review.DeliverdOnTimeRate`, `Review.SatisfiedServiiceRate` -- seller satisfaction rates (note: "Delivered" and "Service" are misspelled in the field names)

The `TabInfo` block at the response root gives condition-level aggregates: New count (3 sellers), Used count (3 sellers), lowest price per condition ($1,059.99 New, $838 Used).

Observed pricing for the RTX 4070 Ti: Used listings at $838--$1,042 (ship from China), New listings at $1,059.99--$1,295.99. `WarehouseProcessScore: 0.95`, `MerchantMetricsScore: 1.0` for the first listed seller.

Newegg's internal algorithmic seller scores are queryable by anyone, for any seller, across any product. A seller can monitor their own scores and those of all competitors without logging in.

## HighDemandItems and the Lottery

Two companion APIs complete the marketplace intelligence surface.

`/api/Common/HighDemandItems` returns a flat array of exactly 100 ParentItem IDs currently flagged as restricted or high-demand. No pricing, no metadata -- just IDs. Unauthenticated.

`/api/common/Lottery` returns historical GPU lottery records. Two are in evidence: September 30, 2025 and October 17, 2025. Each lottery entry contains:

- `LotteryID` -- UUID
- `LotteryStartDate`, `LotteryEndDate`, `LotteryDrawDate`, `SellingStartDate`, `SellingEndDate`
- `DrawInterval: 2` -- draw fires 2 hours after the entry window closes; selling starts 1 hour after draw (6-hour total cycle)
- `LotteryType` -- "1" or "3" (different bundle configurations)
- `IsSandBox: 0` -- production, not test
- `LotteryItems` -- full bundle manifest: item tags and ParentItem IDs

The lottery mechanic works as follows: entry window opens, users register, draw happens after 2 hours, winners get a 5-hour selling window to complete purchase. The purchase requirement is not a single GPU -- it's a full PC component bundle. Winners must buy the GPU alongside the other items in `LotteryItems`.

Type 1 bundle (Sept 30, 2025): CASE + MEMORY + MEMORY + SPEAKER + SSD + VGA

Type 3 bundle (Oct 17, 2025): AIR COOLER + CPU + GNB + PSU + SSD + VGA

The bundle requirement is encoded in the data model, not the UI. Slow-moving inventory (cases, memory, speakers, coolers) is embedded into the lottery as required line items alongside the high-demand GPU. The API returns the full item manifest -- the component-level item numbers per bundle -- without authentication.

No lotteries are currently active. The RTX 5090 (ParentItem 14-137-867) shows `qty: 0`, `AddToCartType: 6` (notify/waitlist mode), `MoreBuyingOptions` returns no sellers.

The three endpoints together -- HighDemandItems, Lottery, and MoreBuyingOptions -- form a complete unauthenticated surface for monitoring restricted GPU inventory.

## Server-Rendered Product State

The `__initialState__.ItemDetail` block ships on every product page with approximately 150 fields. Notable exposed fields:

**Pricing:**
- `FinalPrice`, `UnitCost`, `MapPrice`, `OriginalUnitPrice`, `InstantRebateAmount`
- `LowestPrice30Days` -- 30-day price floor (relevant for EU pricing regulations, shipped to all users)
- `IsLowestPrice`, `InflatedPriceAlert` -- internal price quality flags

**Inventory:**
- `Stock` -- 1 = in stock, 0 = out of stock
- `Qty` -- exact inventory count (1000 = in-stock sentinel, 0 = out)
- `vfAvail` -- vendor-fulfilled availability (1000 = available)
- `localAvail` -- warehouse availability (0 = no warehouse stock)
- `StockForCombo`, `ComboReservedQ4S` -- combo bundle inventory
- `LimitQty_Item`, `LimitQty_Batch` -- per-item and per-batch purchase limits

**Promotion:**
- `PromotionScheduleStatus`, `PromotionScheduleActiveDate`, `PromotionScheduleExpiration`
- `BlackFridaySavePercent` -- scheduled deal parameters

**Seller flags:**
- `IsBlockSeller`, `IsVacationSeller`, `IsHotItem`

`PageConfigRecommendation` -- called on every product page with `conversation_Id={uuid}&page_type=Product&item_number={sku}&SubcategoryId={id}`. The UUID is assigned per browsing session and persists across product page views, building a session-scoped browsing graph for the recommendation system.

`getAIReviewSummary` returns structured AI-generated advantage categories with `ReviewCount` and a `ReviewIDs[]` array -- the source review IDs used to generate each summary point. No external LLM API calls were observed in network traffic; the summaries appear to be generated offline and cached.

## Tracking and Surveillance

### Cookie Inventory

On a cold first load (no prior cookies, no user interaction), 27 cookies are set before any consent event. Categorized by origin:

**Newegg tracking (server-set):**
- `NVTC` -- visitor tracking token, 3-year expiry, `domain=newegg.com`, `SameSite=None`
- `NID` -- Newegg session ID, 3-year expiry
- `NV_NVTCTIMESTAMP` -- HttpOnly
- `NE_STC_V1` -- session token, HttpOnly

**Newegg client-side:**
- `NV%5FW57` (= `NV_W57`), `NV%5FW62` (= `NV_W62`), `NV%5FCONFIGURATION`, `NV%5FGAPREVIOUSPAGENAME`

**Google:**
- `_gcl_au` -- Google Ads conversion linker
- `_gid`, `_ga`, `_ga_TR46GG8HLR` -- Google Analytics

**Microsoft Clarity:**
- `_clck`, `_clsk` -- session recording

**Microsoft UET/Bing Ads:**
- `_uetsid`, `_uetvid` -- set client-side

**Attentive (SMS marketing):**
- `__attentive_id`, `__attentive_session_id`, `_attn_`, `__attentive_cco`, `__attentive_dv`, `__attentive_ss_referrer`, `__attentive_pv` -- 7 cookies, all before consent

**Campaign:**
- `xyz_cr_100393_et_137` -- sts.eccmp.com campaign cookie, account ID 100393

**Checkout:**
- `checkout_continuity_service`

**CMP:**
- `osano_consentmanager_uuid`, `osano_consentmanager`

**RUM:**
- `RT` -- Akamai mPulse

Microsoft Clarity fires 13 POST requests to `b.clarity.ms` on a single homepage load -- 13 session recording beacons before the user has scrolled or clicked anything.

### Consent Bypass -- Narrativ and PointAndPlace

The `osano_consentmanager_tattles` localStorage entry contains the scripts Osano is configured to ignore for consent enforcement. The `ignore.script` array explicitly lists:

- `https://static.narrativ.com/tags/narrativ-brand.1.0.0.js` -- Narrativ affiliate link tracking
- `https://media.pointandplace.com/js/pointandplace.js` -- PointAndPlace retail media

Both scripts bypass the consent framework entirely -- they load regardless of the user's consent choice. Attentive fires 7 cookies before consent resolves; Osano's tattles entry does not list Attentive as exempt, suggesting it fires before Osano can intercept it rather than being explicitly whitelisted.

The Osano configuration lookup itself (`lookups.api.osano.com/customer/AzydZ7TEEX0GW2hin/config/3c115a66-ecfb-4dbf-929...`) returned `{"error": "Resource not found"}` during the investigation -- the CMP's own config fetch failed.

### Tracker Summary

14+ vendor integrations observed across homepage and PDP loads:

| Vendor | Domain | Role |
|--------|--------|------|
| Google Analytics (UA legacy) | www.google-analytics.com | Analytics |
| Google Analytics (GA4) | analytics.google.com | Analytics |
| Google Ads / Remarketing | www.google.com, ccm endpoint | Ad conversion |
| Microsoft Clarity | b.clarity.ms | Session recording |
| Microsoft UET | cookie-only | Bing Ads |
| Attentive | newegg-us.attn.tv | SMS marketing |
| Affirm | www.affirm.com, features.affirm.com | BNPL widget |
| PayPal | www.paypal.com | Pay Later widget (PDP) |
| Narrativ | static.narrativ.com | Affiliate links |
| PointAndPlace | media.pointandplace.com | Retail media (consent-exempt) |
| Akamai mPulse | c.go-mpulse.net | RUM |
| scirtem.onewegg.com | scirtem.onewegg.com | Internal analytics proxy |
| sts.eccmp.com | sts.eccmp.com | Email CRM tracking |
| Osano | *.api.osano.com | Consent management |

Adobe Launch (`assets.adobedtm.com`) is present via preconnect and the Tealium config but was not observed firing directly in network captures.

Tealium's `utag_data` layer passes NVTC, attentive_id, attentive_session_id, checkout_continuity_service, _gcl_au, _ga, and osano_consentmanager_uuid to all connected Tealium vendors.

### scirtem.onewegg.com

"scirtem" is "metrics" spelled backward. The domain is on `onewegg.com` -- Newegg's parent holding company domain. It uses the Google Analytics wire protocol: `GET /g/collect`. This is a first-party analytics proxy that routes telemetry through a Newegg-controlled subdomain, bypassing ad blockers that filter `analytics.google.com` by hostname. The service worker variant (`/g/collect/63a0/sw_iframe.html`) returns 400 -- partial implementation.

## Storage and Cross-Session Identity

### localStorage

**`hgfp`**: A 64-character hex string persisting across browser sessions. The naming ("hgfp" -- likely "hash global fingerprint") and persistence behavior are consistent with a browser fingerprint. Generation method is not confirmed from observed network traffic.

**`NV_NeweggLocalStorage`**: A Newegg-managed localStorage object containing several sub-keys. The `w30` entry includes `ID2`, which mirrors the NVTC cookie value. If a user clears their cookies, the localStorage copy of NVTC survives as a re-identification anchor. `AIAssistant: true` is stored here -- the AI shopping assistant enabled flag.

**`lscache-distinctId`**: A UUID-format distinct identity token with its own expiry mechanism.

**`__rmco`** (Retail Media consent object):
```json
{
  "channelIds": {"attr_sid": "118799", "aff_mid": "44583"},
  "productConsents": {
    "ranTrkInt": true, "ranTrkExt": true, "ranAut": true,
    "ranCGE": true, "rtbRet": true, "rtbPro": true,
    "cadTrk": true, "dspTrk": true
  }
}
```
All 8 retail media tracking categories are set to true. The affiliate channel IDs (`attr_sid`, `aff_mid`) are stored alongside the consent object.

**`osano_consentmanager_tattles`**: Contains the consent bypass config (Narrativ + PointAndPlace exemptions).

**`UINewFeature`**: `{}` -- the dead config object, now empty in localStorage. The 6 expired tooltip configurations still ship in `window.__SITE__.UINewFeature.Configs` on every page load -- configs with `expirationDate: 2022/4/6 00:00:00 PST` that specify CSS selectors, positioning, and template HTML for feature introduction tooltips that expired 4 years ago. The live API endpoint (`/api/common/NewFeature`) returns `{"CommonConfig": {...}, "Configs": []}`.

**Affirm's Statsig state**: `statsig.cached.evaluations.*`, `statsig.stable_id.*`, `statsig.session_id.*` -- Affirm's embedded BNPL widget runs its own Statsig feature flag evaluation. The Statsig SDK key (`client-BLeunOm46BdfZXjMSze5uyovKdEpzUhn7N21W2D4jiC`) is visible in `window.__STATSIG__`. Newegg does not use Statsig natively.

### sessionStorage

**`__EK__WOTW__SESSION__ID__`**: A session-scoped UUID with 1-hour expiry. "EK" is likely Newegg's internal brand namespace.

**`syf-session`**: `00001411776110934958291296` -- Synchrony Financial session token. SYF = Synchrony Financial, which issues the Newegg credit card. This session is created passively on PDP loads without any user interaction with the credit card widget.

**`s_mycounrty`** (typo original): Stores visitor geolocation classification (`cyc`, `EU`, `CA`, `QB` flags). The typo appears in both the sessionStorage key and a JSONP endpoint called `OverviewContent4Moblie.aspx`.

Three cross-session identity anchors operate independently of consent decisions: the `hgfp` fingerprint hash, the NVTC mirror in `NV_NeweggLocalStorage.ID2`, and `lscache-distinctId`.

## Infrastructure Artifacts

**robots.txt sitemap filenames**: Two sitemaps with "Confidential" in their filenames have been listed in Newegg's public robots.txt since 2019:

```
Sitemap: https://www.newegg.com/xmlsitemap/2019_Updated_Confidential_siteindex_USA.xml
Sitemap: https://www.newegg.com/xmlsitemap/2019_Updated_Confidential_siteindex_USA_Seller.xml
```

The word "Confidential" is publicly visible to every web crawler -- a filename artifact from an internal process that never got cleaned up. Also present in robots.txt: `Disallow: /areyouahuman` -- the bot detection endpoint name is visible in the crawl control file.

**Response header version stamp**: `x-ver: 04142020` in every HTTP response from www.newegg.com. April 14, 2020. Six years old, unchanged.

**x-page-alias**: `x-page-alias: Home` -- internal page routing identifier in response headers. Every page type returns a different alias, making the routing table enumerable.

**Dead UINewFeature configs**: 6 feature tooltip configs with `expirationDate: 2022/4/6 00:00:00 PST` ship in `window.__SITE__.UINewFeature.Configs` on every page load in 2026. The live API endpoint (`/api/common/NewFeature`) returns `Configs: []`.

**NEL/CSP reporting**: Network Error Logging reports to `pf.newegg.com/csp`. Report-To group includes subdomains.

**TrustWave seal**: `sealserver.trustwave.com` in preconnect hints -- TrustWave security compliance seal.

## Open Threads

**AMBER ad system**: The `amber3/match` endpoint fires on every page load. The request/response payload content wasn't captured -- what targeting signals are sent and what the match response contains is unknown.

**PointAndPlace firing scope**: PointAndPlace is in Osano's consent bypass list but wasn't observed in any network capture. It may only fire on specific page types or ad slots.

**scirtem SW iframe 400**: The service worker at `scirtem.onewegg.com/g/collect/63a0/sw_iframe.html` returns 400. Incomplete service worker implementation or a broken registration.

## Machine Briefing

### Access & Auth

No authentication required for product data, marketplace, lottery, and catalog endpoints. Akamai's WAF blocks the default `curl` User-Agent (returns 400). Add a browser User-Agent and a Referer header -- requests pass through without cookies or sessions.

```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
REF="https://www.newegg.com/"
```

Authenticated endpoints (cart, account, order) require `NVTC` + `NID` cookie pair from a logged-in session.

### Endpoints

**Marketplace data (open):**

```bash
# All marketplace sellers for a product: prices, stock, ship-from, performance scores
curl -H "User-Agent: $UA" -H "Referer: $REF" \
  "https://www.newegg.com/product/api/MoreBuyingOptions?ParentItem=14-137-778&TabType=0&SortBy=0&FilterBy=&MappingId=14-137-778&FirstCall=true&PageNum=1&PageSize=20&NewItemLowestPrice=0"

# Add-to-cart eligibility
curl -H "User-Agent: $UA" -H "Referer: $REF" \
  "https://www.newegg.com/product/api/ProductAATC?itemNumbers=14-137-778"

# AI review summary with source review IDs
curl -H "User-Agent: $UA" -H "Referer: $REF" \
  "https://www.newegg.com/product/api/getAIReviewSummary?ItemNumber=14-137-778"

# Related products
curl -H "User-Agent: $UA" -H "Referer: $REF" \
  "https://www.newegg.com/product/api/ProductRelationInfoV3?itemNumber=14-137-778&AdditionalCost=0"
```

**Catalog and discovery (open):**

```bash
# 100 current high-demand restricted item IDs
curl -H "User-Agent: $UA" "https://www.newegg.com/api/Common/HighDemandItems"

# Full lottery history: bundle manifests, timing, item lists
curl -H "User-Agent: $UA" "https://www.newegg.com/api/common/Lottery"

# Live trending search terms
curl -H "User-Agent: $UA" "https://www.newegg.com/api/TrendingNow"

# Full navigation menu hierarchy
curl -H "User-Agent: $UA" "https://www.newegg.com/api/RolloverMenu"

# All country storefronts with currency codes
curl -H "User-Agent: $UA" "https://www.newegg.com/api/CountryApi"

# Popular DIY builds ranking
curl -H "User-Agent: $UA" "https://www.newegg.com/api/Common/PopularRankOfDIY"
```

**Session-scoped (requires Referer, partial data without cookies):**

```bash
# Session-tracked recommendations -- conversation_Id UUID per session
curl -H "User-Agent: $UA" -H "Referer: $REF" \
  "https://www.newegg.com/api/PageConfigRecommendation?conversation_Id={uuid}&page_type=Product&item_number=14-137-778&SubcategoryId=48"

# Estimated delivery dates
curl -H "User-Agent: $UA" -H "Referer: $REF" -X POST \
  "https://www.newegg.com/api/common/GetEstimateDeliveryDateByItems"
```

**B2B gateway (auth required):**

```bash
# Returns 403 without API key
curl "https://ec-apis.newegg.com/"
# Response: {"errorCode":"403","errorMessage":"We were unable to locate your API Key."}
```

### Gotchas

- `MoreBuyingOptions`: `ParentItem` and `PageNum`/`PageSize` are required. Missing any returns `Bad Request: PageIndex&PageSize&ParentItem can't be zero or null` with HTTP 200.
- Item numbers use `XX-XXX-XXX` format (e.g., `14-137-778`). The first segment is the category code. ParentItem and child ItemNumber often differ -- use ParentItem for `MoreBuyingOptions`, ItemNumber for `getAIReviewSummary`.
- The `Qty` field in `__initialState__` uses 1000 as the "in-stock" sentinel, not an actual count of 1000 units. `vfAvail: 1000` = vendor-fulfilled available; `localAvail: 0` = no warehouse stock.
- `scirtem.onewegg.com/g/collect` accepts standard GA Measurement Protocol events. The service worker iframe variant (`/g/collect/63a0/sw_iframe.html`) returns 400.
- Hot-demand items in the Lottery API use `LotteryType` values "1" and "3" with different bundle schemas -- Type 1 uses CASE/MEMORY/SPEAKER configurations, Type 3 uses CPU/COOLER/PSU configurations.
- The JSONP endpoints in `JsonpList` (`loadpopupinfo2016.aspx`, `OverviewContent4Moblie.aspx`) respond only to JSONP callback patterns, not direct JSON requests.
