---
# agents: machine-friendly instructions in "## Machine Briefing"
title: Gap — Teardown
url: "https://www.gap.com"
company: Gap
industry: Retail
description: "American apparel and accessories retailer operating Gap, Old Navy, Banana Republic, and Athleta brands."
summary: "gap.com runs on a Next.js micro-frontend platform internally named Chartis, deployed on Azure East US behind Akamai CDN and an Envoy service mesh. Six brands share a single multi-tenant platform with a 619-flag client-side feature registry. The API gateway at api.gap.com is OAuth-protected for most endpoints, but the personalization endpoint is open and returns full Akamai IP geolocation without authentication. Tealium serves as the TMS and automatically grants all 15 consent categories on first visit for non-GPC browsers before any interaction with the OneTrust banner."
date: 2026-04-06
time: "00:37"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack: ["Next.js", "Akamai", "Tealium", "Azure", "Envoy", "Bloomreach"]
trackers: ["Adobe Analytics", "Google DoubleClick", "Google Ads", "FullStory", "Quantum Metric", "TikTok Pixel", "Facebook Pixel", "Twitter Pixel", "Snapchat Pixel", "Amazon DSP", "Yahoo DSP", "Pinterest Pixel", "Adobe Audience Manager", "Attentive", "Rokt", "Granify", "Persado", "New Relic", "mPulse", "Optimizely", "Constructor.io", "FindMine", "PowerReviews", "OneTrust"]
tags: ["retail", "multi-brand", "ecommerce", "feature-flags", "ai-features", "consent-bypass", "tracking-heavy", "micro-frontend", "ghost-brands"]
headline: "Rokt's identity matching fires on every Gap page — not just checkout — building cross-publisher ad profiles for visitors who never see an offer."
findings:
  - "Rokt's cross-publisher identity endpoint fires on every page — homepage, category, PDP, and search — profiling visitors across its advertiser network even though its offer injection only appears at checkout."
  - "An unauthenticated personalization API returns your ISP name, city, county, DMA market, zip range, and lat/long coordinates on every page load — Akamai IP enrichment data served to any caller with a valid session UUID."
  - "619 feature flags are exposed client-side with zero disabled, including AI review summaries across five brands, a CAPI v3 platform rollout, new loyalty signals, and 11 active flags for Hill City — a brand Gap shut down in 2020."
  - "Gap's Tealium container calls setConsentValue(1) when no consent cookie exists, granting all 15 tracking categories before the OneTrust banner renders — every non-GPC visitor is tracked from the first millisecond as if they clicked 'accept all'."
---

## Platform Architecture

Gap operates its four consumer brands — Gap, Old Navy, Banana Republic, and Athleta — plus their factory store variants on a single multi-tenant Next.js platform internally named **Chartis**. The platform name surfaces in the `chartis-canary-ui=canary` cookie set on every response, and the `window.gap` global identifies the brand context: `{brand: "gap", market: "us", locale: "en_US", appName: "sitewide-next-prod"}`.

The build version is stamped into every JavaScript chunk path: `025909199c-2026-04-03` (commit hash + date, April 3, 2026). Static assets serve from `/static_content/onesitecategory/components/mfe/_next/static/`, where `onesitecategory` is the micro-frontend namespace. Response headers confirm the infrastructure: `x-e-dc: azeus` (Azure East US datacenter), `x-envoy-upstream-service-time: 266` (Envoy proxy sidecar, indicating a Kubernetes service mesh), and `x-akam-sw-version: 0.5.0` (Akamai Site Manager service worker active).

The Akamai service worker at `https://www.gap.com/akam-sw.js` (version 1.3.6) intercepts all requests for performance optimization and bot signal collection. Akamai Bot Manager is active via two cookies: `_abck` (1-year, bot detection state machine) and `bm_sz` (4-hour window). Bot signal collection routes to an obfuscated path: `POST /WySii7jTSDMNbIQsTC0vbUQ3/...`, returning 201/202.

`window.gap` also carries `fabricThemeVersion: {active: "1.5.0"}` — Fabric is Gap's internal design system, versioned separately from the application.

**Response headers of note:**
- `mybrand: gap` and `abseg_brand: gap` — multi-brand platform routing headers
- `abseg_different: false` — audience segmentation routing signal
- `content-security-policy: frame-ancestors 'self'` — minimal CSP, only restricts iframing
- `strict-transport-security: max-age=2628000; includeSubDomains` — HSTS at ~30 days

**SSL certificate** covers the full brand portfolio on a single cert: `www.gap.com`, `api.gap.com`, `gap.com`, `gapfactory.com`, `api.gapfactory.com`, `athleta.com`, `athleta.gap.com`, `www.athleta.com`, `athletawell.com`, `bananarepublic.com`, `bananarepublic.gap.com`, `www.bananarepublic.com`, `bananarepublicfactory.com`, `www.bananarepublicfactory.com`, `oldnavy.com`, `oldnavy.gap.com`, `www.oldnavy.com`, `ios-oldnavy.gap.com`. Internal subdomains on the same cert: `tax-service.gap.com` (returns 403 externally), `securemetrics.gapfactory.com` (returns 200 with empty body), `fonts.assets-gap.com`, `www1-4.assets-gap.com`.

## API Surface

The main API gateway is `api.gap.com`. Most endpoints require Bearer OAuth tokens. Two are accessible without full authentication.

**`GET /resources/personalization/v1/{customerUUID}`** — no authentication required. This endpoint returns the customer context used to drive personalization across the site. For a valid session UUID, the response includes:

```json
{
  "personalizationInfoV1": {
    "customerUUID": "4044599B41874B629E3845DE74696D33",
    "userContext": {
      "isAnonymousUser": "true",
      "isRecognizedUser": "false",
      "isLoggedInUser": "false"
    },
    "customerAttributes": {
      "loyaltyAttributes": null,
      "totalRewardValue": "0",
      "hasOffers": "false",
      "activePoints": 0
    },
    "featureSelections": {
      "Evergreens": [{"AttributeName": "CARDSTATUS", "AttributeValue": "BRNONE|GPNONE|ONNONE|ATNONE"}]
    },
    "marketingMessageInfo": {
      "geoLocation": "georegion=246,country_code=US,region_code=CA,city=HAYWARD,dma=807,pmsa=5775,msa=7362,areacode=510,county=ALAMEDA,fips=06001,lat=37.6687,long=-122.0799,timezone=PST,zip=94540-94545+94557,continent=NA,throughput=vhigh,bw=5000,network=comcast,asnum=7922,network_type=cable,location_id=0"
    }
  }
}
```

The `geoLocation` string is Akamai edge IP enrichment for the requester's connection — it reflects the caller's actual IP, not the UUID holder's historical location. Submitting a random non-session UUID returns a minimal response with no geolocation data. The UUID functions as a session token; the endpoint accepts it but geolocation always reflects the current requester's IP. The full field set: city, county, DMA market code (807 = San Francisco DMA), PMSA/MSA codes, area code, FIPS county code, lat/long, timezone, zip range, ISP name (e.g., `comcast`), ASN (e.g., `7922`), network type (`cable`/`fiber`/`mobile`), and throughput tier. The `CARDSTATUS` featureSelection signals which Gap Inc. branded cards the user holds (`BRNONE|GPNONE|ONNONE|ATNONE` = no cards).

This endpoint is called on every page load for every visitor. The `resourceUrl` field echoes the full request URL including `channel`, `pageType`, `locale`, `correlationId`, and `referrer` query parameters, making individual page views attributable in server logs.

**`GET api.gap.com/commerce/locations/stores/geo`** — accessible without an OAuth token using one header. Without `X-Client-Application-Name: gap-web`, the API returns `{"errors":[{"name":"BadRequest","message":"The request is missing the client application name header 'X-Client-Application-Name header'"}]}`. With it, the response returns a full store directory: store name, address, phone number, GPS coordinates, time zone, regular weekly hours, and `specialHours` entries for holiday schedules (Black Friday hours, Christmas Eve closures observed in the response).

**OAuth-required endpoints:**
- `GET api.gap.com/product_recommendations/v1` → `{"fault":{"faultstring":"Invalid access token","detail":{"errorcode":"oauth.v2.InvalidAccessToken"}}}`
- `GET api.gap.com/commerce/catalog/inventory/v1/style/store/status` → `{"errors":[{"name":"Unauthorized","message":"ApiKey/Token was missing or was invalid"}]}`

**robots.txt** disallows: `/buy/`, `/checkout/`, `/profile/`, `/shopping-bag`, `/my-account/`, `/resources/`, `/*productData.do`, `/*BadRequest.do`, `/*SystemError.do`. The sitemap index at `/native-sitemap.xml` includes division, category, subcategory, product, color, sleeve-length, special, quarantine, and stores sitemaps. All named AI crawlers (OAI-SearchBot, ChatGPT-User, GPTBot, PerplexityBot, Amazonbot, Meta-ExternalAgent, ClaudeBot, YouBot, CCBot) are explicitly allowed with `Allow: /`.

## Feature Flag Registry

`window.featureFlags` on every page contains 619 enabled flags and zero disabled flags. The flags carry brand suffixes encoding the Chartis multi-brand architecture: `gap`, `br` (Banana Republic), `on` (Old Navy), `at` (Athleta), `hc` (Hill City), `gapfs` (Gap Factory Store), `brfs` (Banana Republic Factory Store), with `ca` and `us` geo prefixes.

**AI and machine learning (all active):**
- `pdp-ai-reviews-us-gap`, `pdp-ai-reviews-us-br`, `pdp-ai-reviews-us-on`, `pdp-ai-reviews-us-brfs`, `pdp-ai-reviews-us-gapfs`, `pdp-ai-reviews-ca-br` — AI-generated review summaries on PDPs for five brands (Athleta absent from US)
- `pdp-ai-recommendations-us-gap/br/on/at/brfs/gapfs` + `pdp-ai-recommendations-ca-gap/br/on/at/brfs/gapfs` — AI product recommendations across all brands, US and Canada
- `swf-home-page-ai-recs` — AI recommendations on homepage
- `buy-ui-ai-recs` — AI recommendations in cart
- `division-ai-recs`, `ai-recommendation`, `pdp-ai-recs-atb`, `pdp-ai-recs-cc-refresh` — additional recommendation placements
- `bloomreach-rank-by-customer-segment` — Bloomreach search ranked by inferred customer segment

**CAPI v3 platform rollout (all brands, both geos):**
`pdp-capi-v3-us-gap`, `pdp-capi-v3-us-on`, `pdp-capi-v3-us-br`, `pdp-capi-v3-us-at`, `pdp-capi-v3-us-brfs`, `pdp-capi-v3-us-gapfs`, `pdp-capi-v3-ca-gap`, `pdp-capi-v3-ca-on`, `pdp-capi-v3-ca-br`, `pdp-capi-v3-ca-at`, `pdp-capi-v3-ca-brfs`, `pdp-capi-v3-ca-gapfs` — uniform rollout pattern across all twelve brand-geo combinations. Related flags: `pdp-use-capi-reviews`, `pdp-pmcs-capi-call`, `division-capi-seo-meta-data`, `plp-capi-seo-meta-data`, `seo-use-capis`.

**Loyalty program signals:**
- `swf-loyalty-encore` — new loyalty program feature (inferred from flag name; no supporting evidence beyond the flag)
- `swf-cash-based-rewards-info` — cash-based rewards display component
- `bag-ui-points-reward`, `swf-use-points-and-rewards-absolute-paths`, `pdp-loyalty-gated`, `pdp-loyalty-enroll-link`
- Brand-specific enrollment links: `gap-sw-loyalty-enroll-link`, `on-sw-loyalty-enroll-link`, `br-sw-loyalty-enroll-link`, `at-sw-loyalty-enroll-link`, `gapfs-sw-loyalty-enroll-link`, `brfs-sw-loyalty-enroll-link`

**Payment integrations (all active):**
`bag-ui-paypal`, `bag-ui-applepay`, `bag-ui-afterpay`, `bag-ui-leapfrog-paypal`, `bag-ui-applepay-leapfrog`, `buy-ui-klarna`, `pdp-klarna`, `pdp-paypal`, `pdp-afterpay`, `checkout-ui-afterpay`, `checkout-ui-paypal-button`, `checkout-ui-barclays-us` (Barclays Gap card), `checkout-ui-rokt`, `buy-ui-rokt-banner`.

**Other notable flags:**
- `checkout-ui-hubbox` — HubBox click-and-collect delivery locker integration
- `checkout-ui-google-autocomplete` — Google Places autocomplete in checkout
- `checkout-ui-bopis-sms` — SMS notifications for Buy Online Pick Up In Store
- `true-fit-us-gap/br/on/at/gapfs/brfs` — True Fit size recommendation widget across all brands
- `search-bloomreach`, `autosuggest-bloomreach`, `enable_sku_size_bloomreach` — Bloomreach search and autocomplete
- `pdp-power-reviews`, `pdp-mfe-load-power-reviews` — PowerReviews review platform (account: 1443032450)
- `pdp-scarcity` — scarcity messaging on PDP ("Only X left!")
- `react-personalization-polling` — real-time personalization polling on page

## Consent Architecture and Surveillance

The consent stack involves two layers that interact in a specific sequence: the Tealium container (`tealium-utag.js`, 432KB, account `gapinc`, profile `usgap`) and OneTrust (domain GUID `7ef24dc0-37da-4bab-8b07-e0958c5b096f`).

**The auto-consent mechanism.** On first page load, the Tealium container runs extension 1214, which checks whether the `CONSENTMGR` cookie is absent or empty. If so, it calls `utag.gdpr.setConsentValue(1)`, granting all 15 consent categories (`c1:1|c2:1|...|c15:1|consent:true`) before any user interaction. The OneTrust banner loads at approximately 3842ms — by the time it renders, Tealium has already granted consent and tracking scripts are firing.

The code at line 152 of `tealium-utag.js`:
```js
if (typeof utag.runonce.ext[1214] == 'undefined') {
  utag.runonce.ext[1214] = 1;
  if (typeof b['cp.CONSENTMGR'] == 'undefined' ||
      typeof b['cp.CONSENTMGR'] != 'undefined' && b['cp.CONSENTMGR'] == '') {
    utag.gdpr.setConsentValue(1);
  }
}
```

**GPC exception.** Earlier in the container (lines 7-8), before extension 1214 runs: if `OptanonConsent` is null AND `navigator.globalPrivacyControl` is true, the container writes `CONSENTMGR=ts:{timestamp}|consent:false` to the cookie first. Extension 1214 then finds CONSENTMGR non-empty and skips the auto-grant. Gap does honor the GPC signal in the Tealium layer — this is a correctly implemented carve-out. For non-GPC visitors, auto-grant proceeds.

**OneTrust configuration.** 50 rulesets: all 50 US states plus a Global catch-all, all using type "CCPA" with the `*GPC TRUE - CCPA Custom Template - Web` template. No GDPR rulesets, no IAB TCF v2 vendor list. EU visitors receive the same CCPA-style treatment as US visitors. `RootDomainConsentEnabled: false`, language detection disabled.

**Pre-consent tracking timeline (first visit, no GPC):**
- ~3842ms: OneTrust consent bundle begins loading
- ~4004ms: TikTok pixel JS (`analytics.tiktok.com`) loads — before banner is visible
- ~4339ms: FullStory (`edge.fullstory.com`) loads
- ~4880ms: DoubleClick conversion tracking fires

**Cookies set before any consent interaction:**
- `_fbp` — Facebook Pixel
- `_tt_enable_cookie`, `_ttp` — TikTok Pixel (pixel ID: C5499P800UN7QUNF9PSG)
- `_twpid` — Twitter/X Pixel
- `_scid`, `_sctr` — Snapchat Pixel
- `__attentive_id` — Attentive SMS marketing
- `RoktRecogniser` — Rokt cross-publisher identity
- `QuantumMetricSessionID`, `QuantumMetricUserID` — Quantum Metric session recording
- `AMCV_93BE1C8B532956910A490D4D@AdobeOrg` — Adobe Marketing Cloud visitor ID (MCMID)
- `_gcl_au` — Google Ads Conversion Linker
- `_abck`, `bm_sz` — Akamai Bot Manager

**Full tracker inventory from network logs:**

*Session recording and analytics:*
- `ingest.quantummetric.com` — Quantum Metric; 44 requests on homepage (43× `POST /horizon/gap`, 1× `/resource-loader/hash-check/gap`)
- `edge.fullstory.com` / `rs.fullstory.com` — FullStory session recording (org: 12A5TM)
- `bam.nr-data.net` — New Relic RUM (browser agent: NRBR-4c469572768eeedb787)
- `c.go-mpulse.net` — mPulse Akamai RUM
- `logx.optimizely.com` — Optimizely experiment event logging

*Advertising:*
- `ad.doubleclick.net` — 32 requests on homepage alone; campaign source IDs: 6900831, 8030980, 1956281, 10709046
- `www.google.com/ccm/`, `googleads.g.doubleclick.net` — Google Ads conversion (IDs: 1069567947, 16940355677)
- `s.amazon-adsystem.com`, `ara.paa-reporting-advertising.amazon`, `c.amazon-adsystem.com` — Amazon DSP (~25 requests on PDP)
- `s.yimg.com/wi/config/10137735.json` — Yahoo DSP config (ID: 10137735)
- `ct.pinterest.com` — Pinterest Pixel
- `analytics.tiktok.com` — TikTok Pixel
- `www.googleadservices.com` — Google Ads
- `bttrack.com` — BrightTag/Signal legacy tag manager artifact

*Identity and data syndication:*
- `dpm.demdex.net` — Adobe Audience Manager ID sync
- `apps.rokt-api.com/identity/v1/identify` — Rokt cross-publisher identity, fires on homepage / category / PDP / search (not only checkout); `RoktRecogniser` cookie set without consent
- `gap-us.attn.tv` — Attentive SMS marketing; fires `impression` and `creative-interactions` events
- `collect-us-west-2.tealiumiq.com`, `collect.tealiumiq.com` — Tealium event collection

*Commerce and UX:*
- `matching.granify.com` — Granify AI conversion optimization; `window.GRANIFY_OPTLY_USER = "granify_control"` (this session in control group)
- `pwcdauseo-zone.cnstrc.com` — Constructor.io behavioral tracking (item_detail_load, autocomplete actions)
- `sierra.chat` — Sierra AI customer service
- `geolocation.onetrust.com` — OneTrust geo detection
- `js.findmine.com`, `lit.findmine.com` — FindMine outfit recommendations (PDP only; app ID: DFB2D7D5410A5FFF47EE)
- `display.powerreviews.com`, `ui.powerreviews.com` — PowerReviews (account: 1443032450)
- `www.paypal.com/credit-presentment/experiments/hash` — PayPal A/B experiments API (PDP only)

**Adobe Analytics** hits 3 report suites simultaneously on every page: `gapproduction`, `gapgidproduction`, `gapgrsproduction`. Beacon path: `/b/ss/gapproduction,gapgidproduction,gapgrsproduction/10/JS-2.22.4/`.

**Tealium container internals:**
- Account `gapinc`, profile `usgap`; additional profiles in container: `usfactory`, `cagap`, `cafactory`, `jpgap`
- Datasource keys: `usgap: bo81hf`, `jpgap: rcb9ld`; mobile datasources: iOS `kpvkhr`, Android `jkkwxl`
- SHA-256 hashing of `customer_uuid` for cross-device identity matching
- Certona (Kibo): 6 references — recommendation engine loaded locally per `swf-load-certona-locally` flag
- FindMine: 23 references in container; A/B segment names `gap180-a`, `br180-a`, `on180-a`, `at180-a`, `gapfs180-a`, `brfs180-a` (inferred: 180-day purchase recency segments used to route outfit recommendations)

## AI Vendor Stack

Gap runs multiple AI systems simultaneously across the customer journey:

**Persado** — `window.PersadoCode` present on every page. Persado generates AI-optimized marketing copy. The global's presence confirms active production use; copy substitution is invisible to the visitor.

**Sierra Chat** — AI customer service chatbot at `sierra.chat/agent/XnpkUBYBlETLZkYBlETUeChIigruzNzADv7DIwep23E/embed`. The agent ID is embedded in the script URL. On every page load, the Sierra embed fires two requests regardless of user interaction:
1. `POST https://sierra.chat/-/api/events` — config initialization telemetry (logs token, URL, SDK version, embed config keys)
2. `POST https://sierra.chat/-/api/chat/error` — error/monitoring endpoint (204 response; fires on page init)

The chat supports modal and full-screen modes, voice input, contact center handoff, conversation persistence (cookie-based), custom memory variables for personalization, and multi-message custom greetings.

**Granify** — AI conversion optimization. `window.GRANIFY_OPTLY_USER = "granify_control"` places this session in the A/B control group (the Optimizely experiment is named `insitu_reorder_certona`). Granify fires match, events, and metric requests on every page from `matching.granify.com`.

**Bloomreach** — powers site search (`search-bloomreach`), autocomplete (`autosuggest-bloomreach`), and customer segment ranking (`bloomreach-rank-by-customer-segment`). Constructor.io runs alongside for behavioral action event collection (`pwcdauseo-zone.cnstrc.com`).

**AI review summaries and recommendations** — active via feature flags for reviews on five brands (Gap, Old Navy, Banana Republic, Gap Factory, BR Factory) and for recommendations on all six brands in both US and Canada.

## Ghost Brands

**Hill City (discontinued November 2020)** — Gap shut down Hill City after less than two years of operation. Eleven production feature flags remain active under the `hc` brand code: `productstyle-service-us-hc`, `navigation-service-us-hc`, `HC`, `breadcrumbs-hc`, `department-facet-hide-us-hc`, `left-rail-facet-hc-us`, `scroll-to-top-category-us-hc`, `scroll-to-top-search-us-hc`, `left-rail-mobile-facet-hc-us`, `cross-link-categories-hc`, `cat-breadcrumb-hc`. These are navigation and catalog service flags — not dead configuration. Their continued presence suggests Hill City's catalog taxonomy remains in the platform database.

**Gap Japan (closed March 2023)** — `gap.co.jp` redirects to a store closure page. The Tealium container retains the `jpgap` profile with datasource key `rcb9ld`, and mobile app datasource entries remain. The platform feature flag registry contains zero `jp` entries — the brand was removed from the flag system while the Tealium tracking configuration was not decommissioned.

## Machine Briefing

### Access & Auth

Most `api.gap.com` endpoints require a Bearer OAuth token. The personalization and stores geo endpoints are accessible without one. Akamai Bot Manager (`_abck`, `bm_sz`) is active; standard curl receives normal responses for open endpoints. Headless browser traffic is detected but not blocked in observed testing.

### Endpoints

**Open — no auth required:**

```bash
# Personalization + IP geolocation
# Get customerUUID from window.unknownShopperId on any page load
curl "https://www.gap.com/resources/personalization/v1/{customerUUID}?channel=WEB&pageType=home&locale=en_US"

# Full production URL pattern (from observed network traffic):
# https://www.gap.com/resources/personalization/v1/{UUID}?originPath=/browse/product.do&channel=WEB&screensize=large&referrer=&correlationId={uuid4}&pageType=product&locale=en_US

# Store directory by lat/long
curl "https://api.gap.com/commerce/locations/stores/geo?latitude=37.7749&longitude=-122.4194&radius=50" \
  -H "X-Client-Application-Name: gap-web"

# FindMine outfit recommendations (PDP only; requires application + product_id)
curl "https://lit.findmine.com/complete" \
  -d '{"application":"DFB2D7D5410A5FFF47EE","product_id":"{productId}"}' \
  -H "Content-Type: application/json"
```

**Feature flags (client-side, no auth):**
```
All 619 flags in window.featureFlags on any page load.
Structure: { enabledFeatures: [...], featureVariables: {...} }
```

**OAuth-required (returns 401 without token):**
```
GET  api.gap.com/product_recommendations/v1
GET  api.gap.com/commerce/catalog/inventory/v1/style/store/status
```

**PowerReviews (requires API key):**
```
GET  https://display.powerreviews.com/m/1443032450/l/en_US/product/{productId}/reviews
→ {"message":"api key is required for authentication","status_code":401}
```

**Sierra Chat (fires on every page load without user interaction):**
```
POST https://sierra.chat/-/api/events        # config telemetry
POST https://sierra.chat/-/api/chat/error    # monitoring init (204)
```

### Gotchas

- **CONSENTMGR cookie controls auto-grant.** Tealium reads this on every load. If absent, auto-consent fires for non-GPC visitors. Preload `CONSENTMGR=ts:{epoch}|consent:false` to prevent auto-grant without triggering GPC path.
- **Personalization endpoint UUID.** The session UUID is in `window.unknownShopperId` for anonymous visitors. Submit a random UUID and you get a stripped response — no geolocation. Only server-issued session UUIDs get the full response.
- **Build ID in JS chunk paths.** The `025909199c-2026-04-03` prefix appears on all chunk URLs and changes with each deployment. Don't hardcode chunk paths.
- **Stores geo pagination.** Results appear capped at ~10 nearby stores per request. No pagination token observed.
- **Adobe Analytics sends to 3 report suites in one request.** The beacon hits `/b/ss/gapproduction,gapgidproduction,gapgrsproduction/10/JS-2.22.4/` — all three comma-separated in the path.
- **Sierra Chat fires 2 HTTP requests on every page init** regardless of whether the chat is opened. Expect these in any full-page network capture.
- **GPC handling.** Setting `navigator.globalPrivacyControl = true` in a browser context before Tealium loads will trigger the GPC path and set `consent:false`, bypassing the auto-grant and also setting `CONSENTMGR_GPC=true` cookie.
- **Akamai service worker.** `akam-sw.js` intercepts all browser-layer requests. curl and server-side fetch bypass it; Playwright will execute it and add latency.
