---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Best Buy — Teardown"
url: "https://www.bestbuy.com"
company: "Best Buy"
industry: "Retail"
description: "Consumer electronics retailer selling hardware, appliances, and services."
summary: "Next.js frontend with micro-frontends delivered via a custom Module Federation system called canopy. GraphQL gateway for product data (introspection disabled) plus a legacy Falcor.js API layer. Multi-stack backend (Java, Python, Node.js) evidenced by DEO experiment SDK placebo tests. Akamai WAF blocks all non-browser traffic."
date: 2026-04-13
time: "20:06"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack: [Next.js, Module Federation, GraphQL, Falcor.js, Akamai]
trackers: [Adobe ECID, Contentsquare, Dynatrace, Criteo, Yahoo ConnectID, ID5, Google Ads, DoubleClick, SpeedCurve, OpenX, RTBHouse, SeenThis, NC0, Ensighten]
tags: [retail, electronics, ab-testing, micro-frontends, graphql, surveillance, identity-graph, akamai, ensighten, chat]
headline: "Best Buy's unauthenticated chat config names 20 competitors agents can link to and ships a plaintext profanity filter."
findings:
  - "The unauthenticated chat config (171KB) exposes internal Twilio queue names, a 20-domain competitor link whitelist, a plaintext profanity filter, and a Nintendo Switch OLED inventory message from 2021 still sitting in production."
  - "Best Buy's in-house A/B platform serves all 22 production experiments from a public endpoint -- including a search ranking test with variants named '304_control' and '304_ranker', and SDK placebo experiments that reveal the backend is Java, Python, and Node.js."
  - "The Interruptions Manager stores its full modal priority queue in localStorage with human-readable suppression rules -- TotalTech upsell toast (priority 1575) outranks price change notifications (1500) and sign-in prompts (1050)."
  - "ID5 cross-publisher identity graph consent is set to true programmatically on first load for California users -- no consent banner appears, and Ensighten's CMP execution cycle never completes."
  - "The streams API returns per-SKU commerce policy fields (priceMatch, quantityLimit) via cookie auth alongside browsing history -- internal inventory rules surfaced in personalization responses."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Best Buy runs one of the more complex retail frontends in production -- Next.js on top, micro-frontends underneath, a legacy Java/JSP layer that hasn't been fully retired, a GraphQL gateway, and a Falcor.js API that's still serving requests. The investigation found three unauthenticated endpoints that expose internal operational state at a level most engineering orgs would consider sensitive: the full A/B experiment configuration, the complete chat support configuration, and real-time personalization streams tied to visitor cookies. There's also a surveillance stack that fires trackers before any consent interaction for California users, and a substantial amount of internal state shipped to the browser on every page load.

## Architecture

The main site runs Next.js under the path prefix `mc-view` (version `26.14.42`, reported in `window.clientInfo`). The underlying build version is `cba=25.73.0`, visible in HTML source. Webpack Module Federation (Webpack 5) handles micro-frontend composition -- a custom system called "canopy" delivers server-side-rendered HTML+script fragments via the endpoint `/site/canopy/component/{namespace}/{name}/v{version}`. Each component has its own independent version: `shop-account-menu` at `v2.13.46`, for example. The `platformMetrics` global records when each micro-app loaded and at what timestamp, with the `shareScopeApps` array tracking component initialization order.

Two micro-frontend namespaces were visible on the homepage: `shop/` (account, toast components) and `evoc/` (chat widget -- `evoc-talk_to_us-v1-0_25_70`). The naming convention uses semver in the component handle, so version changes are visible in the URL.

Legacy JSP endpoints remain active: `/site/olspage.jsp` and `/site/olstemplatemapper.jsp` are unblocked in robots.txt. The Geek Squad scheduling sub-app at `/dossier/service/appointment/` still uses the deprecated `document.domain = 'bestbuy.com'` API for cross-iframe communication -- a technique browsers have been phasing out since 2022.

The GraphQL gateway lives at `/gateway/graphql` (POST only, introspection disabled). Custom validation rejects introspection queries with `{"message":"Error - GraphQL Validation Failed","extensions":{"code":"GRAPHQL_VALIDATION_FAILED"}}`. A separate GET endpoint, `/gateway/graphql/fulfillment?skuId=...`, handles fulfillment availability data -- 6 calls per product detail page.

Falcor.js is still in the stack via `/api/tcfb/model.json` (the `env_falcor` key in `window._metaLayer`). Requests to this endpoint return 404 HTML from the browser context, suggesting Falcor is used for specific internal paths rather than the primary data layer.

The backend is multi-stack. DEO placebo experiments confirm the runtimes in use: `nodePlacebo1810` (Node.js), `javaPlacebo1816` + `deoJavaPlacebo2114` (Java), `deoPythonPlacebo2119` + `python_sdk_placebo` (Python), `clientPlacebo1786` (browser JS). Each is a real experiment slot used to validate SDK behavior, which makes the stack legible from the public config.

Akamai WAF + Bot Manager (`_abck` cookie, `bmak` global) blocks all non-browser traffic. curl returns HTTP/2 stream errors or HTTP/1.1 timeouts. The `akacd_PR_www_bestbuy_com` cookie is Akamai's canary routing cookie, visible client-side.

Static assets are served from `pisces.bbystatic.com` (images), `assets.bbystatic.com` (JS/CSS), and `files.bbystatic.com` (audio -- chat notification sounds). The internal content service `scds-api-west.prod.browse.bestbuy.com` is CORS-blocked from browser context but its full URL surfaces in the error page's `env_scdsUrl` key (tenant: `bbypres`).

The error page has stale build metadata: `app_sysDate: "11/6/2025"`, `app_sysTime: "2025-11-06T22:26:33.155Z"` -- approximately 5 months stale as of investigation date. This suggests the error page is rendered from a static or long-cached template rather than live build artifacts.

Console error counts are notable: 12 on the homepage, 37 on search, 45-48 on a product detail page. These are JavaScript runtime errors, not fatal -- the site functions -- but the volume suggests accumulated technical debt across the micro-frontend boundary surface.

## DEO: Best Buy's In-House A/B Platform

The Digital Experience Optimization system is Best Buy's custom-built A/B testing platform. It spans every backend runtime in their stack, uses a configfile-based delivery model, and exposes its entire production configuration via an unauthenticated GET endpoint.

```
GET https://www.bestbuy.com/deo-configfile/v1/configfiles?configfileKey=dotcom_Prod_bby_dotcom_53F42C3
```

The configfileKey (`dotcom_Prod_bby_dotcom_53F42C3`) is embedded in the page source via `window.deoMetaData`, visible to any user on any page. The response is the complete experiment configuration at revision `1166`.

The response structure:

```json
{
  "env": "dotcom Prod",
  "ck": "dotcom_Prod_bby_dotcom_53F42C3",
  "rev": 1166,
  "sch": "V1",
  "exp": { ... },
  "aud": { ... },
  "eg": { ... }
}
```

**22 active experiments** in the `exp` object. Each entry includes: experiment ID (`id`), version (`ver`), experiment key (`ek`), audience conditions (`a`), exclusion group (`eg`), variant definitions with traffic split ranges (`sor`/`eor` on a 0-10000 scale), and a feature flag map (`f`).

Selected experiments:

- **`exp0304`** (id: 222): Search ranking A/B test. Variants explicitly named `304_control` and `304_ranker`. Traffic split: control gets range 1-0 (inactive/0%), ranker gets 5001-5000 (also a zero-width range). The pattern of `sor > eor` appears on several experiments and indicates paused traffic allocation with the experiment still registered in the system.

- **`exp0373`** (id: 310, ver: 6): Running at version 6 -- the most iterated experiment in the set. Standard A/B split, no audience restriction.

- **`exp0387`** (id: 322, ver: 3): 5-way split (A/B/C/D/E). Traffic: A gets 1-6500 (65%), B 6501-7375 (8.75%), C 7376-8250 (8.75%), D 8251-9125 (8.75%), E 9126-10000 (8.75%). Version 3 with an uneven primary-arm weighting suggests a converging experiment.

- **`exp0431`** (id: 353, ver: 2): 4-way split. Variant B is keyed by UUID (`ecb25db1-97c1-11f0-ab2e-0a3c2c334a3b`) rather than a human-readable name -- the only experiment with a UUID feature flag key.

- **`exp0487`** (id: 410, ver: 5): Standard A/B, version 5. The high version number suggests a core experience experiment that's been iterated heavily, likely on a high-traffic path.

- **`web_integration_test`** (id: 41): The lowest experiment ID in the set by far -- others cluster in the 300-465 range. A/B with zero-width ranges (inactive). Likely a permanent integration test fixture created when DEO launched.

**Audience conditions** (`aud`): Two defined -- `hasUT` (id: 22, checks `hasUT == "true"` -- TotalTech subscription status) and `largeView_l` (id: 9, checks `deviceClass != "s"` -- desktop/tablet users). Experiments with audience conditions only activate for matching users.

**Exclusion groups** (`eg`): 6 defined. A naming discrepancy: the exclusion group `deo_1836_client` has its two exclusion slots keyed as `deo_1838_client_1` and `deo_1838_client_2` -- the group name references 1836, but the slot keys reference 1838. Either a configuration error or migration artifact.

**SDK placebo experiments**: Each runtime has one or two dedicated placebo experiments that validate SDK behavior without affecting users. Their presence makes the backend polyglot stack directly readable from the public config:

| Experiment | Runtime |
|------------|---------|
| `clientPlacebo1786` | Browser JS |
| `nodePlacebo1810` | Node.js |
| `javaPlacebo1816` | Java |
| `deoJavaPlacebo2114` | Java (second) |
| `deoPythonPlacebo2119` | Python |
| `python_sdk_placebo` | Python (second, with audience: `largeView_l AND hasUT`) |

**Session-level experiment assignments** are stored in `sessionStorage.deoClientSdkUPS`. During the investigation session: `exp0510_v2: "B"`, `exp0541_v1: "B"`, `exp0507_v2: "A"`. A fourth assignment -- `exp0435_v2: "B"` -- appeared in session storage but has no corresponding entry in the public configfile. Either a second configfileKey serves additional experiments, or this experiment was recently rotated out of the config.

The nav redesign finding bridges DEO and the canopy micro-frontend system: the account menu component source exposes `enableGlobalNavRedesign: false` alongside `enableRedesignABTest: true`. A rebuild of the navigation is running in A/B, allocated to a slice of live traffic, while the global launch flag remains off. The redesign is also conditional on `isNewHeaderLayout: false` -- the current layout -- meaning the experiment variant triggers the new header.

## The Chat Config Endpoint

```
GET https://www.bestbuy.com/services/conversation/web/api/v2/unified-chat/configuration
```

No authentication. 171KB response. Cached in `localStorage.uccConfig` for 4 hours (`uccConfig_ExpireTime`). This is the complete configuration for Best Buy's live chat and Geek Squad remote support system.

**Routing infrastructure**: All live agent routing uses Twilio. Queue names directly exposed:

- `care.totaltech.en.chat.all` -- TotalTech member care
- `care.postpurchasesupport.en.chat.all` -- general post-purchase support
- `sales.totaltech.en.chat.all` -- TotalTech sales
- `virtualstore_mobilesales` -- virtual store mobile sales
- `virtualstore_hometheatersales_premium` -- virtual store home theater premium

TotalTech pre-chat routing quick links map directly to queue assignments with `provider: "twilio"` for each. The TTS queue list (`ttsQueues`) includes additional queue names: `BBYPlus`, `totaltech`, `Membership-HomeTheater-Sales`, `Membership-Computing-Sales`, `Membership-Appliances-Sales`, `Membership-Primary-Sales`.

**Competitor link masking**: `linkMasking.enabled: true`. Agent links to any URL not on the whitelist are replaced with `[VERIFY URL]`. The 20-domain whitelist:

```
bestbuy.com, abt.com, amazon.com, apple.com, bhphotovideo.com, bjs.com,
brandsmartusa.com, costco.com, crutchfield.com, dickssportinggoods.com,
homedepot.com, lowes.com, menards.com, microcenter.com, nfm.com,
pcrichard.com, rcwilley.com, samsclub.com, target.com, walmart.com, bby.me
```

This tells agents they can share links to these 20 competitors -- Best Buy has institutionalized competitor price comparison in chat agent workflows.

**Profanity filter**: Stored as a plaintext comma-separated string in the public response:

```
shit,piss,fuck,cunt,cocksucker,motherfucker,tits,[phone number regex],niggar,nigger,nigga
```

The phone number regex pattern is embedded in the same string, between `tits` and the slurs.

**Feature flags**:
- `enableVideoChat: false` -- video chat not enabled
- `enableEmailTranscript: false` -- email transcripts off
- `enableRemoteSupport: 1` -- Geek Squad remote support active
- `enableEcc: 1` -- Extended Care Contract integration active
- `enableBlueAssistRedesign: true` -- Blue Assist (Geek Squad agent AI assist tool) redesign live
- `enableMyBestBuyTotalBranding: true` -- TotalTech rebrand complete
- `enableDrawerProductSelector: true` -- agents can pull up product details in a chat drawer
- `enableOngoingChatModal: true` -- warns users who try to open a second chat session

**Survey bypass**: `shunSurveyForQueuesList: ["Help1"]` -- customers routed through the "Help1" queue skip the post-chat survey.

**Remote support infrastructure**:
- WebSocket: `wss://www.bestbuy.com/services/conversation/web/connect`
- `remoteSupportUrl: ""` (empty -- not actively set)
- `remoteSupportPaymentClientId: "UNIFIED_CHAT"` -- payment processing client ID for remote support sessions
- `switchboardReconnectAttempts: 10`, `switchboardTimeoutMillis: 60000` -- connection reliability config

**Stale announcements**: The announcement message field contains a Nintendo Switch OLED inventory notice from the product's 2021 launch period ("our team-member will not be able to process the order... unable to provide inventory counts"). `enableAnnouncement: false` -- it's not displayed. Other disabled announcements in the config: a "PlayStation Portal Inventory" message for the `cart` queue ECC context, and multiple "Flash Sale Event" extended wait time messages for virtual store queues. None are currently active, but all remain in the production config.

Chatbot AI disclosure is configured: `chatbotGenerativeAILegalEnabled: true`, `chatbotGenerativeAILegalText: "Answer generated by AI"`. Bot errors route to `care.totaltech.en.chat.all` for TotalTech members and `care.postpurchasesupport.en.chat.all` for others.

## Surveillance Stack

184 requests on the homepage, 206 on a product detail page. 119 of the homepage requests are third-party, across 18 domains. On the PDP, Criteo retail media is embedded directly -- `d.us.criteo.com/delivery/retailmedia` -- manufacturer-paid promotions served within Best Buy's own product pages.

**Identity resolution active before any consent interaction** (for a California session, CCPA jurisdiction):

| Signal | Cookie/Storage | Vendor |
|--------|---------------|--------|
| `AMCV_F6301253512D2BDB0A490D45@AdobeOrg` | Cookie | Adobe ECID |
| `connectId` | Cookie + localStorage | Yahoo ConnectID |
| `id5id_v2_3856268834750531` | localStorage | ID5 identity graph |
| `cto_bundle` | Cookie + localStorage | Criteo ID |
| `_cs_id`, `_cs_c`, `_cs_s` | Cookie | Contentsquare session recording |
| `__gads`, `__gpi`, `__gsas`, `__eoi` | Cookie | Google advertising IDs |
| `_GESPSK-esp.criteo.com` | localStorage | Criteo partner key sync |
| `_GESPSK-yahoo.com` | localStorage | Yahoo partner key sync |
| `_GESPSK-openx` | localStorage | OpenX partner key sync |
| `_GESPSK-rtbhouse` | localStorage | RTBHouse partner key sync |

**ID5 consent flag**: `localStorage.id5id_privacy = {"jurisdiction":"other","id5_consent":true}`. Jurisdiction is set to "other" (not "ccpa"), and consent is `true`. This is set programmatically on page load, not by user action. For a California user, CCPA's "do not sell" provisions would require the user to explicitly opt into data sharing with third-party identity graphs.

**Ensighten CMP state**: `window.bby_privacy.executionState` shows `dataDefinitionComplete: false`, `conditionalRules: false`, `readyForServerComponent: false`. The `AF` (activated functions) array is empty -- no tags have been activated through the consent flow. The CMP loaded its bootstrap script from `nexus.ensighten.com/bestbuy/privacy_init/Bootstrap.js` (generated `Thu Apr 09 13:43:55 GMT 2026`) but never completed its execution cycle. The consent record in localStorage -- `BESTBUY_ENSIGHTEN_PRIVACY_TLD-www.bestbuy.com: "bestbuy.com"` -- contains only the domain string, not a consent payload.

**Pre-consent tracker fires confirmed in network log**:
- Google DoubleClick: `/pagead/1p-user-list/4448269/?activity;src=4448269;type=bbycom;cat=BBY-S0` (homepage), `cat=bby-p0` (PDP)
- Adobe Audience Manager: `dpm.demdex.net/id`
- Criteo ID sync: `gum.criteo.com`, `mug.criteo.com`
- OpenX: `oajs.openx.net/esp`
- Yahoo: `ups.analytics.yahoo.com/ups/58813/fed`
- NC0: `t.nc0.co/pc/bestbuy/privacy` -- fires on first load; NC0 is a privacy compliance vendor

No consent banner appeared during the session. `privacy_geo = {"gdpr":"0","country":"unitedstates","subdivision":"california"}` -- California user correctly identified, GDPR not applicable, but CCPA should be.

**Geolocation inference**: Several cookies are set automatically without user input:
- `physical_dma: "807"` -- Nielsen DMA 807 = San Francisco metro
- `locStoreId: "144"` -- nearest store (auto-detected)
- `locDestZip: "94540"` -- inferred zip code (Hayward, CA)
- `customerZipCode: "94540|N"` -- the `|N` suffix means "not confirmed by user" -- Best Buy tracks whether the zip was user-provided or inferred

**Customer Journey Cloud (CJC)**: Internal system for cross-session journey tracking. Two endpoints: `POST /customer/web-streams/v1/events/cj-page-visits` and `POST /customer/web-streams/v1/events/cjc-page-requests`. State stored client-side: `cjcDataLayers` (data layers) and `cjc_route_determination` (routing decisions). The CJC data layer includes `isEmployeeMode: false` -- Best Buy distinguishes employee browsing sessions from customer sessions in their analytics pipeline.

**AWACS telemetry**: `window.awacs` is present on every page with fields: `variables.sessionId`, `variables.visitorId`, `variables.pageTransactionId` (per-page UUID), `variables.breadcrumb` (full internal category hierarchy with numeric IDs, e.g., `/6011/BestBuyDesktopWeb/computers_x_tablets/laptops/all_laptops/macbooks`), `variables.keywords`, `variables.pageType`, `variables.deviceAndBrowser`. Posts to two endpoints: `/awacs-ingestor/api/cload` and `/awacs-ingestor/api/airport`.

The DAI (Data & Analytics Infrastructure) event bus is referenced via a custom URI scheme: `dar://dar.edp.bestbuy.com/entries/engagement/digital-experience-event/v1` -- an internal schema registry (edp = Enterprise Data Platform). All behavioral events are validated against this schema before sending to `/customer/web-streams/v1/events/digital-experience-event`.

**IAS (Integral Ad Science)**: Appears in the network log (`jsconfig.adsafeprotected.com`, `pixel.adsafeprotected.com`) but returns 404 on both endpoints -- ad safety integration appears broken or deprecated.

## Client-Side State Exposure

`window._BBY_DATA_` is the primary client-side state object, with 26 top-level keys: `global`, `appState`, `account`, `application`, `basket`, `browser`, `cart`, `content`, `contract`, `csi`, `decisions`, `device`, `event`, `identities`, `interaction`, `listResult`, `location`, `purchases`, `search`, `skus`, `source`, `task`, and others.

On a product detail page, `_BBY_DATA_.skus` pre-loads the complete variant tree -- 29 SKU objects for a single MacBook Air M3 listing. Each includes clearance/price type, availability state, and internal identifiers. The MacBook Air M3 observed: `priceType: "clearance"`, `unitPrice: $509.99`, `primaryButtonState: "NOT_AVAILABLE"`. A `rankingId` is exposed per SKU: `0001bHjh9poOq6qpL36R:ZTMtVw2mmgS` -- internal ranking identifier format.

The internal category hierarchy is visible in `window.awacs.variables.breadcrumb` on every page. Format: `/{category_id}/{site_name}/{category_path}`. Example: `/6011/BestBuyDesktopWeb/computers_x_tablets/laptops/all_laptops/macbooks`. Category ID 6011 is the root numeric ID for the computers/tablets tree.

`window.clientInfo.mcViewReqId` contains the Akamai edge request trace: `xrequest::{unix_ms_timestamp}::{akamai_edge_ip}::{hex_request_id}::{sequence_number}`. Observed values: `xrequest::1776109178::23.62.45.151::7eaaf381::1843078` and `xrequest::1776110174::23.62.45.142::d048cd7e::1843078`. The IP segments (`23.62.45.151`, `23.62.45.142`) are Akamai edge server IPs, not user IPs. This field is client-readable and exposes edge topology and request sequencing metadata.

**Interruptions Manager** (localStorage key `Interruptions-Manager-Business-Rules`): A priority queue governing which modals, toasts, and notifications can show on which pages. Full business logic is stored client-side:

```json
{
  "priorities": {
    "paid-member-failed-auth-critical": 1650,
    "visitor-optimization-modal": 1626,
    "member-onboarding-modal": 1625,
    "add-account-recovery-phone": 1600,
    "total-tech-sale-toast-notification": 1575,
    "custom-card-message-notification": 1525,
    "price-change-notification": 1500,
    "open-order-toast-notification": 1100,
    "sign-in-toast-notification": 1050,
    "last-item-viewed-toast-notification": 1000
  }
}
```

Each notification also has denylist rules -- page URLs and device classes where it's suppressed, with human-readable reason strings: "The failed auth notification is not allowed on the cart page." TotalTech upsell toast (priority 1575) ranks above price change notifications (1500) and sign-in prompts (1050).

**Search internals**: `window._BBY_DATA_.search` on the search page exposes: `requestHandler: "bbselect"` (internal search handler name), `recallStrategy: "dvsTextMatchHybrid"` (Dense Vector Search + keyword hybrid retrieval), `isMLQueryTag: true` (ML query understanding active), `isAutoFacet: true`. Search for "television" returns 1,274 results with `sortType: "Best-Match"`.

**Account menu feature flags** (from canopy component source):
- `enableGlobalNavRedesign: false` -- nav redesign off globally
- `enableRedesignABTest: true` -- redesign running in A/B
- `isNewHeaderLayout: false` -- on old layout
- `enableCreditCardDashboard: true`
- `enableMemberOnboarding: true`, `enableMemberOnboardingLV: true`
- `enableSmbPersonalization: true` -- small/medium business personalization active
- `enableLifeTimeSavings: true`, `enableMemberTermSavings: true`
- `enableCDNFromAccountMenu: true`
- TotalTech `membershipType: "NULL"` -- field present and set to string "NULL" for anonymous users, revealing the data model for membership tier

**Dossier (Geek Squad Scheduling)**: The `/dossier/service/appointment/` sub-app returns a full HTML page for `?test=1`. Its source uses `document.domain = 'bestbuy.com'` -- a deprecated cross-origin communication technique removed from most modern browser environments. The page exposes `window._metaLayer.user_rzTier = "undefined"` (reward zone tier as a literal string "undefined", not null/empty) and reloads the Ensighten CMP bootstrap separately.

**Streams API**: The personalization streams at `/streams/v1/SEARCH_TERM` and `/streams/v3/RECENTLY_VIEWED` are authenticated by visitor cookie. For the RECENTLY_VIEWED endpoint, the response includes full product objects enriched with `commerce.v1` policy fields per SKU:

```json
"commerce.v1": {
  "isHidden": false,
  "quantityLimit": 3,
  "priceMatch": true,
  "isDisplayable": true
}
```

`quantityLimit: 3` and `priceMatch: true` are internal commerce policy flags surfaced in the personalization response. `quantityLimit` is the per-customer purchase cap for that SKU; `priceMatch` indicates whether the product is eligible for Best Buy's price match guarantee. These are internal inventory/commerce policy fields not typically presented in consumer-facing product APIs.

## Open Threads

**`exp0435_v2` in session but absent from configfile**: `sessionStorage.deoClientSdkUPS` showed `exp0435_v2: "B"` during the investigation, but `exp0435` has no entry in the public DEO configfile (rev 1166). Possible explanations: a second configfileKey serving a separate experiment set, recent experiment rotation, or a server-side-only experiment that assigns variants without client-side config.

**NC0 (`t.nc0.co`) role**: The endpoint `t.nc0.co/pc/bestbuy/privacy` fires on first page load. NC0 is a privacy compliance vendor, but whether this request signals that tracking should be suppressed or is itself a tracking request is not determinable from the network log alone.

**Streams API behavior without history**: The RECENTLY_VIEWED endpoint response was captured during an active investigation session with prior browsing. Behavior for a completely fresh visitor session (no cookies, no history) is untested.

## Machine Briefing

### Access & Auth

Akamai WAF blocks all non-browser HTTP clients. curl and raw fetch requests return HTTP/2 stream errors or timeouts. All direct endpoint testing requires a browser-context request (Playwright headed or Chrome DevTools). The exceptions are the two fully public endpoints below, which return data from any client with browser-like headers.

For stream endpoints (`/streams/`), you need a valid `visitorId` cookie from a prior browser session. Fresh sessions return empty stream data.

### Endpoints

**Open -- no auth, no browser required**

```
GET https://www.bestbuy.com/deo-configfile/v1/configfiles?configfileKey=dotcom_Prod_bby_dotcom_53F42C3
```
Returns full A/B experiment config (rev 1166). Configfile key is in page source -- search `window.deoMetaData` or the HTML for `dotcom_Prod_bby_dotcom_53F42C3`.

```
GET https://www.bestbuy.com/services/conversation/web/api/v2/unified-chat/configuration
```
171KB chat/support configuration. Queue names, feature flags, competitor whitelist, profanity filter, remote support config. No auth required.

**Cookie-authenticated (visitor session)**

```
GET https://www.bestbuy.com/streams/v1/SEARCH_TERM
GET https://www.bestbuy.com/streams/v3/RECENTLY_VIEWED
POST https://www.bestbuy.com/streams/v1/consume
```
Requires `visitorId` cookie from an established browser session. Returns recent searches and viewed products with commerce policy metadata.

**Browser context required**

```
POST https://www.bestbuy.com/gateway/graphql
Content-Type: application/json

{"query": "..."}
```
GraphQL endpoint. Introspection disabled. Requires browser session cookies for Akamai bypass. Custom validation rejects malformed queries with `GRAPHQL_VALIDATION_FAILED`.

```
GET https://www.bestbuy.com/gateway/graphql/fulfillment?skuId={sku_id}
```
Fulfillment availability. Separate from POST GraphQL. Returns `BAD_USER_INPUT` without a valid query body.

```
GET https://www.bestbuy.com/dossier/service/appointment/search?test=1
```
Geek Squad scheduling sub-app. Returns full HTML. Requires browser context.

### Gotchas

- DEO configfileKey is in HTML source on any page -- search for `dotcom_Prod_bby_dotcom_53F42C3` to confirm it hasn't rotated.
- Stream endpoints return an empty `streamData: []` for fresh sessions with no browsing history. The `userIdentifier` in responses is the `visitorId` cookie value.
- GraphQL validation is strict -- bad queries fail before hitting resolvers. Persisted queries may be required for non-introspectable access.
- The `/api/tcfb/model.json` Falcor endpoint returns 404 HTML from browser context despite `env_falcor` being set -- Falcor paths are likely prefixed differently.
- The Akamai sensor endpoint paths (`/n6G6fP/RberNG/...`) are obfuscated and change per session -- don't rely on them for fingerprinting.
- `exp0304` and several other experiments show `sor > eor` (e.g., sor:1, eor:0) -- these are paused experiments with zero traffic allocation, not misconfiguration.
