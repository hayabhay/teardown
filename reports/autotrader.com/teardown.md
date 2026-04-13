---
# agents: machine-friendly instructions in "## Machine Briefing"
title: Autotrader — Teardown
url: "https://www.autotrader.com"
company: Autotrader
industry: Retail
description: "Online automotive marketplace for buying and selling new and used vehicles."
summary: "Autotrader runs two independently-deployed Next.js applications under a single domain — a main site and a /cars-for-sale sub-app with separate build IDs and release cycles. The stack sits behind Akamai WAF and CDN (NetStorage for the homepage), with Adobe Experience Manager for content, Solr for search, and AWS infrastructure for internal services under the .awsacs. subdomain namespace. Cox Automotive's proprietary Pixall identity graph links Autotrader and KBB users under a shared cross-brand ID, with device fingerprinting sync via BlueCava. A private seller exchange (PSX) at /marketplace/ provides a full P2P vehicle transaction workflow including title transfer and power of attorney."
date: 2026-04-05
time: "22:23"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack: ["Next.js", "Akamai", "Adobe Experience Manager", "Solr", "AWS", "New Relic", "OneTrust", "Prebid.js"]
trackers: ["Google Analytics 4", "Google Tag Manager", "Google Ads", "Meta Pixel", "Reddit Pixel", "Pinterest Pixel", "Snapchat Pixel", "RTB House", "Criteo", "Microsoft UET", "TreasureData", "New Relic APM", "Pendo", "Verint ForeSee", "AudioEye", "Optimizely", "AppsFlyer", "BlueCava", "Cox Auto Pixall", "PubMatic", "AppNexus Xandr", "Index Exchange", "TripleLift", "OpenX", "Yahoo", "Prebid.js"]
tags: ["automotive", "marketplace", "identity-graph", "cross-brand-tracking", "prebid", "open-cors", "public-s3", "behavioral-targeting", "source-maps"]
headline: "Every ad partner on AutoTrader can silently read your car browsing history and trade-in valuations — the user ID needed to query it sits unprotected in a readable cookie."
findings:
  - "Browsing history endpoint returns cars viewed and trade-in valuations to any origin — wildcard CORS with POST/PUT allowed, and the pxa_id identity cookie is readable via document.cookie"
  - "Ad targeting guesses which truck you want before you search — SSR HTML ships inferred make/model preferences from IP geolocation alone, tagged internally as a rule-based fallback, but still sent to every ad partner"
  - "Cox Auto's Pixall identity graph links Autotrader and KBB visitors under one ID and syncs it to BlueCava for device fingerprinting — three cookies carry the same value, none HttpOnly"
  - "Two public S3 buckets serve the payment calculator's interest rate table and internal API URL map including ICO and valuation endpoints — no authentication required"
  - "Source maps are publicly accessible and reveal @atc, Cox Auto's internal npm package namespace — the private registry scope is visible in every chunk"
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

Autotrader is a Cox Automotive subsidiary — the same parent company as Kelley Blue Book, Manheim, and Dealertrack. That relationship is not just corporate; it's load-bearing infrastructure.

The site runs two distinct Next.js applications. The main site (homepage, research, legacy routes) has build ID `051XA__wk6WaamlGaR4e-`. The `/cars-for-sale/` sub-application — covering search, SRP, VDP, and the retailing stack — runs build ID `jfr83v3fc0fB-kY8wgl8k` and deploys independently. The two apps share a domain but have different release cycles, separate `__NEXT_DATA__` runtimeConfig objects, and different feature flag states. This split is visible in the network logs: `/cars-for-sale/_next/data/{buildId}/vehicle/{listingId}.json` uses the cars-for-sale build ID across SRP and VDP pages.

The edge layer is Akamai. The homepage HTML is served from Akamai NetStorage (CDN object storage, not a live app server) — confirmed by `server: AkamaiNetStorage` and an ETag timestamp corresponding to April 2016. Akamai runs bot detection that blocks headless browsers; the site requires a real browser session to produce valid cookies for downstream API access. First-party API endpoints at `/collections/`, `/rest/lsc/`, and `/cars-for-sale/` return Akamai block pages to raw curl requests without a valid session cookie. Internal service traffic routes through `cs.awsacs.autotrader.com` — the `.awsacs.` subdomain pattern (`cs.`, `se-replica.`, `atc-interest-rates.`) identifies Cox Auto's internal AWS service namespace.

Content management is Adobe Experience Manager at `content.autotrader.com`. Editorial and research content comes from KBB's WordPress installation (`wpBaseUrl: "https://www.kbb.com"` in runtimeConfig) — homepage hero banners reference images from `kbb.com/cs-camp/wp-content/uploads/`. The KBB buyer connect integration at `fdpq.syndication.kbb.com` uses API key `5a343eb4-6397-421a-9edf-3adabf43e5f5` — a client-side syndication key for the cross-brand financing widget.

Search is Solr, with the replica host `se-replica.awsacs.autotrader.com` referenced in runtimeConfig. This is an internal backend-to-backend connection — the hostname is visible in the client-side page data, but traffic to it originates from backend servers, not browsers.

Firebase Cloud Messaging keys are embedded in `__NEXT_DATA__` runtimeConfig across the entire `/cars-for-sale/` sub-app — visible on every SRP and VDP page load:

```json
{
  "FCM_CONFIG_KEY": "AIzaSyBOMMjTZdsOZwkYMVYd0mShwNxQx5qmP8I",
  "FCM_KEY": "BGdU87HtRACVoH20F1rKJHIfpOxV9Aeeh8DTq1QPUcmWzoinutxNLWe3FnlHcl7VybJFHoiYAHTLAHAi3TQT0rs"
}
```

`FCM_CONFIG_KEY` is the Firebase project API key; `FCM_KEY` is the VAPID public key for web push subscriptions. Both are intentionally client-side for FCM to function, but their presence in SSR HTML means they are delivered before any JavaScript executes.

JavaScript source maps are publicly accessible at `/cars-for-sale/_next/static/chunks/*.js.map`, returning HTTP 200. They reveal Cox Auto's internal npm namespace: `webpack://_N_E/./node_modules/@atc/keyword-search/dist/esm/` — the `@atc` scope is Cox Auto's private package registry.

The CBH (car browsing history) endpoint backend is an Express server proxied through AWS API Gateway — confirmed by `x-powered-by: Express` and `x-amz-apigw-id: bXgF6EXhPHcErwA=` response headers.

**Internal hostname map from client-side config:**

| Host | Purpose |
|---|---|
| `cs.awsacs.autotrader.com` | Internal Cox Auto API service |
| `se-replica.awsacs.autotrader.com` | Solr search replica |
| `researchable.awscsrescat.kbb.com` | KBB internal research catalog API |
| `atc-interest-rates.awsacs.autotrader.com` | S3 bucket (interest rates) |
| `awsacs-my-wallet-configuration.s3.amazonaws.com` | S3 bucket (payment config) |
| `content.autotrader.com` | Adobe Experience Manager CMS |
| `cai-media-management.com` | Vehicle photo CDN |
| `dam.coxautoinc.com` | Cox Auto digital asset manager |
| `fdpq.syndication.kbb.com` | KBB buyer connect widget host |

## Cox Auto Pixall — The Cross-Brand Identity Layer

Pixall is Cox Automotive's proprietary cross-brand identity and attribution system, active across Autotrader, KBB, and other Cox properties. Its configuration is written directly to `window.PixallConfig` on every page load:

```json
{
  "thirdPartySync": true,
  "bcSync": true,
  "attributionSync": true,
  "trtSync": false,
  "sendToParent": false,
  "iframeDetectionTimeout": 100,
  "consentMode": {
    "targetOptOut": false,
    "saleOptOut": false
  }
}
```

`thirdPartySync: true` — Pixall syncs the visitor ID to third-party DSPs. `bcSync: true` — it syncs to BlueCava for device fingerprinting. `attributionSync: true` — cross-brand conversion attribution is active. Both opt-out flags default to `false`.

The identity is stored across three cookies, all readable via `document.cookie` (no HttpOnly flag) — confirmed by direct evaluation:

| Cookie | Observed Value | Purpose |
|---|---|---|
| `pxa_id` | `y7PAE2YLKmIitZbEeGt2n2Yu` | Primary Pixall visitor ID |
| `abc` | same as `pxa_id` | Cross-brand attribution cookie |
| `abc_3rd_party` | same as `pxa_id` | Third-party attribution variant |

The `window.properties` global confirms the cross-property scope: `autotrader.com` and `kbb.com` share property ID `419` with identical feature flag arrays `[7, 1]`. The RV sub-site `rvs.autotrader.com` has its own property ID `49618`. Notably, `rvs.specdemo.xyz` — an external demo domain — also maps to property ID `49618`, suggesting a staging environment reachable externally.

The `cdlPrivacy` cookie stores the visitor's opt-out state as JSON: `{targetOptOut: false, saleOptOut: false}`.

Pixall fires on every page via `POST /pixall/v2/pageload` and `POST /pixall/v2/event` (7 events per SRP load). The `pxa_id` value is also written to `window.dataLayer` as `pixAllPXAId` on every page, making it available to all GTM-managed tags.

## Surveillance Architecture

27 trackers are active across the site. The surveillance starts before any user interaction — `consumerAdTargets` with inferred vehicle preferences is embedded in the SSR HTML, and all four OneTrust consent groups are enabled by default without requiring any user action.

**OneTrust consent state at page load:**
```
groups=1xOT:1,3xOT:1,2xOT:1,4xOT:1  (all enabled)
interactionCount=0  (no user interaction)
```

The dataLayer fires `OneTrustLoaded` → `OptanonLoaded` → `OneTrustGroupsUpdated` in sequence — all four groups already active. Google Analytics (`_ga_NPRVVBXJQV`), Meta Pixel (`_fbp`), Reddit (`_rdt_uuid`), and RTB House (`__rtbh.lid`) cookies are set before any consent banner interaction.

**The behavioral profile pipeline:**

The `consumerInsights` object — pushed to dataLayer on every page — contains 22+ ML-inferred fields about the visitor's vehicle preferences:

```
preferredMake, preferredMakeConfidence
preferredModel, preferredModelConfidence
preferredBodystyle, preferredBodystyleConfidence
preferredMileage, preferredMileageConfidence
preferredPrice, preferredPriceConfidence
preferredVehicleType, preferredVehicleTypeConfidence
secondPreferredMake, secondPreferredModel
recentActivityPreferredMake, recentActivityPreferredModel
priceSensitivity
marketLevel, marketLevelConfidence
makeBodystyleLoyalty
secondPreferredFuelCategory
fixedOps
```

For a fresh anonymous session, all fields return `"INCONCLUSIVE"`. For a returning Pixall-recognized visitor, these fields populate from the cross-brand behavioral graph. The complete object is available to every tag in GTM the moment the page fires `page_data`.

Alongside `consumerInsights`, the dataLayer carries `consumerAdTargets` — a separate object used for ad campaign targeting. On the homepage, this was populated with `consumerAdTargetMakes: "Ram,Jeep"` and `consumerAdTargetModels: "1500,Grand Cherokee"` despite zero user history. The key field: `consumerCampaignPreferencesAddedByRule: "PopularModelsNotInCampRule"` — the system is explicit that this is rule-based fallback targeting, not behavioral data. A separate `consumerAdTargetsWithoutCAMPBias` object provides the non-adjusted variant for comparison, both pushed to dataLayer.

**Tracker inventory** (verified across homepage, SRP, VDP):

| Tracker | Type | Cookie / ID |
|---|---|---|
| Google Analytics 4 | Analytics | `_ga_NPRVVBXJQV` |
| Google Tag Manager | Tag manager | container via `gtm.js` |
| Google Ads / DV360 | Ad conversion | `ad.doubleclick.net` activity pixels |
| Meta Pixel | Ad pixel | `_fbp` |
| Reddit Pixel | Ad pixel | `_rdt_uuid` (pixel `t2_f7jrx0pq`) |
| Pinterest Pixel | Ad pixel | `ct.pinterest.com` |
| Snapchat Pixel | Ad pixel | `tr.snapchat.com/p` |
| RTB House | Retargeting | `__rtbh.lid`, `us.creativecdn.com` |
| Criteo | Identity + retargeting | `gum.criteo.com/sid/json`, `mug.criteo.com/sid` |
| Microsoft UET | Bing Ads | `match.adsrvr.org` |
| TreasureData | CDP | `us01.records.in.treasuredata.com` |
| New Relic APM | Performance | `NREUM`, account `NRBR-7e3aea6206a0addc8e3` |
| OneTrust | Consent | ID `7c1d0518-7b76-4e57-bcef-65a6a7575b4d` |
| Pendo | Session recording | agent `125e14c6-efdb-45a7-7cc2-3bd0112916b1` |
| Verint/ForeSee | Behavioral analytics | customer `l8t1EAItkshJhYMkcBE9Ng4C` |
| AudioEye | Accessibility | active all pages |
| Optimizely | A/B testing | `logx.optimizely.com/v1/events` |
| AppsFlyer Smart Script | Mobile attribution | `impressions.onelink.me/tK9W` |
| BlueCava | Device fingerprinting | `sync.graph.bluecava.com` |
| Cox Auto Pixall | Cross-brand identity | `pxa_id`, `abc`, `abc_3rd_party` |
| PubMatic | Header bidding | `ut.pubmatic.com/geo`, floor prices at `ads.pubmatic.com` |
| AppNexus/Xandr | Header bidding | `ib.adnxs.com/ut/v3/prebid` |
| Index Exchange | Header bidding | `htlb.casalemedia.com/openrtb/pbjs` |
| TripleLift | Header bidding | `tlx.3lift.com/header/auction` |
| OpenX | Header bidding | `rtb.openx.net/openrtbb/prebidjs` |
| Yahoo/Oath | Header bidding | `c2shb.pubgw.yahoo.com/bidRequest` |
| Prebid.js | Header bidding orchestrator | `window.pbjs` |

Pendo is active with full session recording (`POST /data/rec/125e14c6-efdb-45a7-7cc2-3bd0112916b1` fires 5-7 times per SRP page load). Verint has recording disabled (`"recordingEngine": {"enabled": false}`) but the analytics engine is active — ForeSee behavioral events post to `analytics.foresee.com/ingest/events`.

Header bidding via Prebid.js runs 6 concurrent auctions on the SRP — AppNexus/Xandr, OpenX, TripleLift, Yahoo, Index Exchange, PubMatic — alongside Google Ad Manager unit `/18353239/atc/home`. The SRP loads 254 total requests (149 first-party, 105 third-party across 36 domains), up from 113 on the homepage.

## The CBH History Endpoint

`GET /cars-for-sale/cbh/history/{pxa_id}` returns a visitor's Autotrader car browsing history and trade-in evaluations. The endpoint has full wildcard CORS:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: *
Access-Control-Allow-Methods: OPTIONS,POST,PUT,GET
x-powered-by: Express
x-amz-apigw-id: bXgF6EXhPHcErwA=
x-amzn-remapped-server: nginx
```

POST and PUT are permitted under the wildcard — not just reads. The backend is Express proxied through AWS API Gateway behind nginx.

The key enabling cross-origin access: `pxa_id` is not HttpOnly. It is readable directly from `document.cookie` — confirmed by evaluation on the VDP:

```
pxa_id=y7PAE2YLKmIitZbEeGt2n2Yu
abc=y7PAE2YLKmIitZbEeGt2n2Yu
abc_3rd_party=y7PAE2YLKmIitZbEeGt2n2Yu
```

Any script running on autotrader.com — including every third-party tag loaded via GTM — can read `pxa_id` from `document.cookie`. The value is also written to `window.dataLayer` as `pixAllPXAId` on every page, where any tag manager payload can capture it. Once a third party has the ID, the wildcard CORS means they can call the CBH endpoint from their own origin and read the response. The response contains `kbbTradeIns` — trade-in evaluations the user has run — visible to the external caller.

The CBH endpoint appears in the SRP network log as `GET /cars-for-sale/cbh/history/y7PAE2YLKmIitZbEeGt2n2Yu` — Autotrader itself fetches it on SRP page load, presumably to personalize search results based on previous browsing.

## Public APIs and Data

**S3 buckets (no authentication required):**

`awsacs-my-wallet-configuration.s3.amazonaws.com/default.json` — loaded on every SRP and VDP page load. Contains default payment parameters and the full internal API URL map:

```json
{
  "budget": "https://www.autotrader.com/rest/retailing/budget",
  "incentives": "https://www.autotrader.com/rest/retailing/incentives",
  "paymentCalculation": "https://www.autotrader.com/rest/retailing/payments",
  "valuation": "https://www.autotrader.com/cars-for-sale/vrs/data",
  "ico": "https://www.autotrader.com/cars-for-sale/ico/offers/v1/offers",
  "interestRate": "https://s3.amazonaws.com/atc-interest-rates.awsacs.autotrader.com/rates.json"
}
```

`s3.amazonaws.com/atc-interest-rates.awsacs.autotrader.com/rates.json` — the complete interest rate table used to populate payment calculators:

| Credit Tier | Score Range | New 60-mo | Used 60-mo |
|---|---|---|---|
| Excellent | 740-900 | 6.44% | 11.49% |
| Very Good | 700-739 | 7.19% | 11.49% |
| Good | 670-699 | 15.89% | 11.49% |
| Fair | 630-669 | 15.89% | 11.49% |
| Rebuilding | 580-629 | 16.54% | 11.49% |

All 5 tiers across 5 term lengths (36, 48, 60, 72, 84 months).

**Listing API (`/rest/lsc/listing`):**

Requires Akamai session cookie. Returns per-vehicle data including:

- Full VIN (e.g., `4T1BF1FKXHU722727`)
- KBB Fair Purchase Price with delta: `{kbbFppAmount: 18060, kbbFppDelta: 2060, dealIndicator: "Great"}`
- Encrypted VIN for Experian AutoCheck lookup
- Dealer financial settings: `{leaseEnabled, negotiation, taxesFeesEnabled, uiEnabled}`
- Days on site: `daysOnSite: 49`
- Service feature flags per listing: `online-paperwork|nds|credit-app|vi360`
- KBB vehicle ID for cross-reference
- Home services availability: test drive, delivery, virtual tour, buy online
- Insurance partner flag: `insurifyEnabled: true`

**Inventory count (no auth):**

`GET /rest/lsc/listing/count` returns a raw integer. Observed value at investigation time: **3,444,911** total vehicles.

**KBB research proxied through Autotrader:**

The `/cars-for-sale/kbbresearch/` path proxies KBB's internal catalog API at `researchable.awscsrescat.kbb.com`. Endpoints active during SRP and VDP page loads (all return 200 without additional auth):

- `reference/vehicles` — 151KB vehicle catalog per request with KBB internal IDs and CADS vehicle IDs
- `reference/vehiclespecs/vehicleId/{id}` — full vehicle specs
- `reference/vehicleoptions/vehicleId/{id}` — option packages
- `consumer-reviews/vehicleId/{id}` — owner reviews
- `content/expert-review/vehicleId/{id}` — editorial reviews

The SRP fires 9 separate `vehiclespecs` requests per page load — one per trim in the comparison panel.

**Search configuration blob:**

`GET /cars-for-sale/bonnet-reference/searchoptions?zip={zip}` returns a 412KB JSON blob with all search facet definitions, filter options, and SRP configuration. Fires 13 times per SRP session at different zip codes.

**Error responses:**

`/rest/retailing/payments` and `/rest/retailing/budget` return validation errors that include a `traceId` (e.g., `C96E6EC2-5A4A-4713-9677-D521F525702D`) and full field names: `MONTHLYPAYMENT`, `TRADEINVALUE`, `AMOUNTOWED`, `INTERESTRATE`, `LOANTERM`, `CERTIFIEDUSED`, `DEALERID`, `PARTNERID`, `ZIP`.

## The Marketplace (Private Seller Exchange)

robots.txt — 511 lines, 468 disallow rules — reveals a full P2P vehicle transaction platform at `/marketplace/`. The product is Autotrader's Private Seller Exchange (PSX), confirmed by `digitalRetailingType: "psx"` in listing data and `owner.privateSeller: true` on PSX listings.

Workflow paths visible in robots.txt:

```
/marketplace/buy-online
/marketplace/sell-my-car/step
/marketplace/trade-my-car/step
/marketplace/instant-offer
/marketplace/power-of-attorney
/marketplace/transfer-confirmation
/marketplace/pickup-checklist
/marketplace/disclaimer-of-warranty
/marketplace/pre-qualified
/marketplace/purchase-vsc
/marketplace/conversations
/marketplace/chat
/marketplace/admin
```

`/marketplace/admin` returns HTTP 200 then redirects to `/marketplace/signin` — auth-gated, no data exposure. The product scope is notable: this is not a listings-only platform. It covers the full transaction stack — qualification, negotiation, title transfer documentation (power of attorney, transfer confirmation), vehicle inspection, service contract purchase, and buyer/seller messaging.

robots.txt also disallows `/pep` and `*/pep` — the personalized experience platform — and path patterns containing `*US_CENSUS_NAME*`, `*US_FEMALE_NAME*`, `*US_MALE_NAME*`, which are demographic query parameters used internally. Legacy paths from the pre-Next.js era (`.xhtml`, `.jsp`, `.dwr`) remain in disallow rules. Internal beacon paths (`/eumcollector/beacons/browser/v1`, `/beacon/`, `/btl/`) and the SRP aggregation endpoint (`/rest/frontline/srp/single/aggregate`) are also disallowed.

## Machine Briefing

**Access and auth:** Akamai bot detection blocks direct curl requests to most endpoints. Browser navigation sets the required session cookies (`_abck`, `ak_bmsc`, `bm_sv`). Use Playwright or a real browser session and replay the cookies. The listing count endpoint and both S3 buckets are accessible without any auth.

**Open endpoints (no auth):**

```bash
# Total inventory count — returns raw integer
curl "https://www.autotrader.com/rest/lsc/listing/count"

# Interest rate table (all credit tiers x all terms)
curl "https://s3.amazonaws.com/atc-interest-rates.awsacs.autotrader.com/rates.json"

# Payment defaults + internal API URL map
curl "https://awsacs-my-wallet-configuration.s3.amazonaws.com/default.json"

# Car browsing history — CORS wildcard, pxa_id readable from document.cookie
curl "https://www.autotrader.com/cars-for-sale/cbh/history/{PXA_ID}"
```

**Endpoints requiring Akamai session cookie:**

```bash
# Vehicle listings
curl -b "SESSION_COOKIES" \
  "https://www.autotrader.com/rest/lsc/listing?zip=94102&makeCode=TOYOTA&modelCode=CAMRY&maxRecords=25"

# Listing count by filter
curl -b "SESSION_COOKIES" \
  "https://www.autotrader.com/rest/lsc/listing/count?zip=94102&makeCode=TOYOTA"

# Mileage distribution facets
curl -b "SESSION_COOKIES" \
  "https://www.autotrader.com/rest/lsc/crawl/stats/mileage?makeCode=TOYOTA&modelCode=CAMRY"

# Model year price data
curl -b "SESSION_COOKIES" \
  "https://www.autotrader.com/rest/lsc/crawl/modelyears?makeCode=TOYOTA&modelCode=CAMRY"

# KBB vehicle catalog (151KB per request)
curl -b "SESSION_COOKIES" \
  "https://www.autotrader.com/cars-for-sale/kbbresearch/reference/vehicles?makeId=toyota&modelId=camry&year=2026"

# Vehicle specs by KBB vehicle ID
curl -b "SESSION_COOKIES" \
  "https://www.autotrader.com/cars-for-sale/kbbresearch/reference/vehiclespecs/vehicleId/479489"

# Vehicle options by KBB vehicle ID
curl -b "SESSION_COOKIES" \
  "https://www.autotrader.com/cars-for-sale/kbbresearch/reference/vehicleoptions/vehicleId/479489"

# SRP search options config (412KB blob)
curl -b "SESSION_COOKIES" \
  "https://www.autotrader.com/cars-for-sale/bonnet-reference/searchoptions?zip=94102"

# Payment calculation (returns field validation errors + traceId)
curl -b "SESSION_COOKIES" \
  "https://www.autotrader.com/rest/retailing/payments?listingId={ID}&zip=94102"

# Next.js page data (tied to current buildId)
curl -b "SESSION_COOKIES" \
  "https://www.autotrader.com/cars-for-sale/_next/data/jfr83v3fc0fB-kY8wgl8k/vehicle/{listingId}.json"
```

**Gotchas:**

- Akamai cookies expire and re-key on bot detection triggers. Capture a fresh session per run.
- The `/rest/lsc/listing` endpoint uses `maxRecords` for page sizing and returns `totalResultCount`. Max page size is not documented.
- The `/cars-for-sale/_next/data/{buildId}/` path is tied to the current build ID `jfr83v3fc0fB-kY8wgl8k` — this rotates on deployment.
- KBB vehicleId values (e.g., `479489`) are Cox Automotive internal IDs, not VINs. They appear as `kbbVehicleId` in listing data and are required for vehiclespecs, vehicleoptions, and consumer-reviews endpoints.
- `bonnet-reference/searchoptions` accepts a `zip` parameter and may return regionally varied configs — production fires it 13 times per SRP session.
- `consumerAdTargets` in the dataLayer is populated with IP-geolocation inference on first load even for new sessions — do not interpret populated make/model fields as evidence of a recognized user.
- The `pxa_id` cookie is set on first page load, before any login or interaction, and persists across the Cox Auto property network.
