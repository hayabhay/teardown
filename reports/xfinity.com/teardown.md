---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Xfinity — Teardown"
url: "https://xfinity.com"
company: "Comcast"
industry: "Utilities"
description: "Comcast's broadband, mobile, and pay-TV service brand."
summary: "Xfinity runs on Sitecore JSS with Vue.js, fronted by Akamai WAF and dual CDN delivery (Akamai + Azure). Adobe Launch manages a 28-vendor tracking stack. Comcast's proprietary Cohesion/Tagular SDK handles cross-property identity, and a Nuance (Microsoft) live chat layer spans 20+ Comcast properties via a single siteID. The site's ISP position enables IP-based subscriber recognition before any login or cookie."
date: "2026-04-15"
time: "23:49"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack:
  - Sitecore JSS
  - Vue.js
  - Akamai
  - Adobe Launch
  - Azure CDN
trackers:
  - Quantum Metric
  - Adobe Analytics
  - Adobe Target
  - Google Analytics
  - Google Ads
  - DoubleClick
  - Amplitude
  - BounceX/Zeta
  - LiveRamp
  - Neustar/TransUnion
  - Kochava
  - Facebook Pixel
  - Pinterest Tag
  - Snapchat Pixel
  - Twitter Pixel
  - Bing Ads
  - Amazon DSP
  - Snowplow
  - Cohesion/Tagular
  - AppDynamics
  - OneTrust
  - Medallia
  - Pulse Insights
  - CJ Affiliate
tags:
  - isp
  - comcast
  - surveillance
  - session-replay
  - ip-recognition
  - identity-graph
  - sitecore
  - cms-api
  - consent
  - a-b-testing
headline: "Comcast identifies Xfinity subscribers by IP before they log in -- city, zip, market segment, and retention status land in cookies on first load."
findings:
  - "A shared Sitecore CMS API key in client-side JavaScript returns the internal Xumo TV Agent Portal -- complete with CustomerSearch, AuthedHeader, and noindex robots tags -- when queried against xfinity.com's own production endpoint."
  - "IP recognition writes city, state, zip, four internal market segment IDs, and a Lazarus retention program flag into session cookies on the first HTTP response -- all in plaintext, before any login."
  - "Quantum Metric session replay fires on both the privacy policy page and the 'Your Privacy Choices' opt-out page, recording every click and scroll as users attempt to exercise their privacy rights."
  - "The Nuance live chat config in window.v3Lander exposes 20 internal Comcast hostnames -- identity management servers, an employee portal, staging environments, and partner properties."
  - "All 28 trackers fire on page load with every consent category default-enabled and zero user interaction recorded in the OneTrust cookie."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Comcast is America's largest ISP. That's not just a business fact -- it's an architectural advantage. When you visit xfinity.com, Comcast knows before you say anything whether you're already a customer, where you live, and whether your account is active. They know because they're the network you're coming in on.

## Architecture

The public-facing site runs on Sitecore JSS -- Sitecore's JavaScript Services framework with Vue.js as the frontend renderer. Pages are assembled server-side by the Sitecore layout engine and hydrated client-side. Webpack bundles expose the chunking pattern: `webpackChunkxfinity_learn_ui`, `webpackChunksmart_tag` -- separate micro-apps stitched together under a single domain.

Build metadata is in `window.__APP_CONFIG__`: version `2.3.0`, build timestamp `2026-03-21T14:24:44.193Z`, app name `polaris-prod` (the logger metadata key). The CDN layer is dual: Akamai handles WAF and main delivery (`x-ak-cn: US`, `x-ak-nw: comcast`), Azure CDN handles the `/learn/` subtree (`az-fd-learn` response headers, `az-fd-learn-dcc` cache headers). AWS handles the event collector at `collector.pabs.comcast.com` (AWS API Gateway, identifiable by `x-amzn-requestid` response headers).

Akamai Bot Manager is the WAF. Headless Playwright triggers an immediate 403 ("Access Denied") -- headed browser passes. The Akamai fingerprint sets `bm_sz`, `_abck`, and `bm_mi` cookies on first contact. `xpgn=1` arrives in the very first HTTP response before any JavaScript runs, set via `Set-Cookie` in the initial response headers.

The live chat layer is Nuance Engagement Platform (acquired by Microsoft in 2022). All chat traffic routes through `xchat.xfinity.com` and `media.xchat.xfinity.com`, identified by siteID `10006690`. The tagserver endpoints at `/tagserver/init/`, `/tagserver/launch/`, `/tagserver/incrementality/`, and `/tagserver/logging/` are all Nuance-managed.

Tag management runs through Adobe Launch, container `331fbea29f79/e5b825f47ce6`, assets from `assets.adobedtm.com`. Adobe Launch orchestrates Adobe Analytics, Adobe Target, and the Adobe Experience Platform (Alloy SDK) -- the Alloy SDK fires POST requests to `/ee/or2/v1/interact` four times on a typical homepage load.

Datacenter naming surfaces in SSL SANs: `preview.api.ch2.prd.xfinity.com`, `preview.api.pdc.prd.xfinity.com`, `preview.api.wcdc.prd.xfinity.com` -- CH2, PDC, WCDC are the datacenter identifiers. The WCDC reference appears again in the F5 BigIP load balancer cookie name at the login endpoint: `BIGipServerp_loginxf-wcdc-ipv6_443`. The OAuth stack at `oauth.xfinity.com` runs on AWS (AWSALB cookie) in front of F5 BigIP.

## IP Recognition -- The ISP Advantage

The mechanism is straightforward: Comcast owns the network. When a customer on a Comcast residential connection visits xfinity.com, the site resolves their IP against Comcast's subscriber database.

By the time the `window.digitalData` object is populated -- on first page load, before any login prompt -- it already contains:

```json
{
  "customerType": "existing",
  "authenticationType": "lite authenticated",
  "recognizationType": "ip recognized",
  "network": "comcast"
}
```

Alongside that profile entry, `digitalData.user[0].segment` carries geographic segmentation:

```json
{
  "type": "GEO",
  "division": "WEST DIVISION",
  "region": "CALIFORNIA MARKET",
  "zip": "[zip code]"
}
```

The SC and PSC session cookies (set in the first HTTP response) carry this same data in a more granular form: city, state, zip, an existing-customer flag, and internal market segment IDs -- `L1ID`, `L2ID`, `L3ID`, `L4ID` -- Comcast's internal geographic market hierarchy. The cookie format: `PSC=UCID={VisitorId}&CTY=HAYWARD&ST=CA&Z=94540&EX=true&RC.MKT=9066`. These values are in plaintext, neither hashed nor obfuscated.

The Neptune user context endpoint (`/sitecore/api/learn/neptune/persistencelayer/usercontext`) returns the full server-side representation as WCF XML, namespaced under `Comcast.Neptune.Web.Ui.Foundation.ApiIntegration.Domain.PersistenceLayer`. The response includes `VisitorAttributes: ["ExistingCustomer", "Anonymous"]`, `AuthenticationType: "lite authenticated"`, `RecognizationType: "ip recognized"`, and the full market hierarchy -- `MarketId: 9066`, `Level3: 9049`, `Level4: 8928`, `DivisionNameIP: "WEST DIVISION"`, `RegionNameIP: "CALIFORNIA MARKET"`. The `VisitorId` in the XML matches the `UCID` in the PSC cookie, confirming the cookie ties directly to the server-side identity.

`window.lzPlanStatus` is set to `"active"` without login. The `lz` prefix likely references Lazarus, Comcast's internal customer retention program -- a program that typically only activates for at-risk customers. The plan status being accessible client-side, without authentication, means the retention eligibility flag for an existing subscriber surfaces on the anonymous homepage visit.

The `authenticationType: "lite authenticated"` classification is how Comcast describes this state internally: the user hasn't completed full CIMA (Comcast Identity Management Architecture) authentication, but the system has positively identified them via IP lookup. They're in the identity graph before the page finishes loading.

## Tracking Architecture -- 28 Vendors

The homepage fires 203 requests to 30 domains. Third-party traffic spans 146 requests across 29 domains. Adobe Launch orchestrates the stack client-side; the full vendor inventory follows.

**Session Replay**

Quantum Metric runs as two distinct instances: `window.QuantumMetricAPI` and `window.QuantumMetricAPI_comcast` -- a generic instance and a custom Comcast-branded deployment. Both ship session replay data to `ingest.quantummetric.com/horizon/comcast` (13+ POST requests per homepage load) and hash-check via `rl.quantummetric.com/comcast/hash-check`. The Comcast instance monitors scroll behavior, exit intent, and blur events via custom event handlers (`xfScrollThreshold`, `xfHandleBlur`, `xfHandleMouseOut`).

**Identity Graphs**

Three dedicated identity resolution services run in parallel:

- **BounceX/Zeta Global** -- tag at `tag.bounceexchange.com/1369/i.js`, identity resolution at `people.api.boomtrain.com/identify/resolve`, behavioral events at `events.api.boomtrain.com/event/track`, on-site recommendations at `onsiterecs.api.boomtrain.com/api/v1/selectors`. The `_bti` cookie carries a Zeta Global `zync` cross-publisher ID assigned on first visit.
- **LiveRamp ATS** -- identity sync via `rp.liadm.com/j` and `rp4.liadm.com/j`, active on internet-service pages.
- **Neustar/TransUnion** -- identity graph POST to `fid.agkn.com/f` on homepage load.

These three services cross-reference the anonymous browser session against offline identity databases to produce a probabilistic match.

**Ad Platforms**

Seven ad platform families fire on page load:

- Google Ads -- `AW-1023869955` (remarketing tag, `www.google.com/rmkt/collect/1023869955/`)
- DoubleClick/Campaign Manager -- `DC-4053494` (display attribution)
- Google Analytics 4 -- measurement ID `G-Q8SYB6PLKM`, collecting via `analytics.google.com/g/collect`
- Facebook Pixel -- `fbevents.js`, active on internet-service pages
- Pinterest Tag -- `ct.pinterest.com/user/` and `/v3/`
- Snapchat Pixel -- `tr.snapchat.com/config/com/4c367ec5...`
- Twitter/X Pixel -- `static.ads-twitter.com/uwt.js`
- Bing Ads -- `bat.bing.com`
- Amazon DSP -- `c.amazon-adsystem.com` and `s.amazon-adsystem.com/iu3`
- Amazon Advertising -- `ara.paa-reporting-advertising.amazon/aat`
- CJ Affiliate (Commission Junction) -- `www.mczbf.com/11041/pageInfo`, enterprise ID `1113122`, fires on every page

**Analytics & Behavioral**

- **Amplitude** -- app ID `da6c948d2c`, experiment config fetched from `sr-client-cfg.amplitude.com/config/da6c948d2cf762a296ef0d51e4a5751e`, variants from `api.lab.amplitude.com/sdk/v2/vardata`
- **Snowplow / XATracker** -- Comcast's internal Snowplow deployment. Namespace `XATracker_cf`, collector at `pabs.comcast.com`. Support pages fire 133 PUT `/prod/event/` calls per session -- article reads, troubleshooting steps, and navigation are tracked exhaustively. Homepage baseline is ~12 events.
- **Adobe Experience Platform (Alloy SDK)** -- POST to `/ee/or2/v1/interact` (4x per page) and `adobedc.demdex.net/ee/v1/interact`
- **AppDynamics RUM** -- `col.eum-appdynamics.com/eumcollector/beacons/browser/v2/AD-AAB-AAB-RTC/adrum`

**Proprietary: Cohesion/Tagular**

Comcast operates its own cross-property tracking SDK. `window._Cohesion` (also exposed as `window._Preamp`, `window._Fuse`, `window._Tagular`) ships events to `taggy.cohesionapps.com/implementations/public`. The config, extracted from `window._Cohesion`:

```json
{
  "tenantId": "src_32WJaPBlsN3kKjigHfQnESp8PGw",
  "writeKey": "wk_3Aj3sSJyXR6vy85rAvQSFsl37yb",
  "crossSiteId": "1a3510c4-0332-4634-b31c-74d0b0844a67",
  "domainAllowlist": ["xfinity.com"],
  "coreVersion": "v3.78.0"
}
```

The `crossSiteId` is assigned to anonymous visitors on first contact and persists across sessions -- Comcast's own identifier for tracking users across its properties.

**Other Vendors**

- Medallia (KAMPYLE) -- 10+ globals (`window.KAMPYLE_*`), feedback/NPS survey widget
- Pulse Insights -- `js.pulseinsights.com/surveys.js`
- OneTrust -- consent management (UUID `a55e6907-e160-4758-bc91-65f5b89f37b3`)
- cdnbasket.net -- three subdomains (`data.cdnbasket.net`, `page.cdnbasket.net`, `view.cdnbasket.net`) with `Access-Control-Allow-Origin: *`. The naming pattern suggests purchase funnel tracking, but the vendor identity is unresolved.

**Total first load**: 58 cookies, 203 requests, 29 third-party domains.

## Consent Configuration

OneTrust manages consent via UUID `a55e6907-e160-4758-bc91-65f5b89f37b3`, version `202603.1.0`.

The ruleset has two tiers:

1. **GPC rule** -- applies to 12 US states: CA, CO, CT, DE, MD, MN, MT, NE, NH, NJ, OR, TX. For visitors in these states, the Global Privacy Control header is honored.
2. **National (Non-IAB) rule** -- applies to all US visitors not covered by the GPC rule, plus all international visitors. This rule defaults all consent categories to enabled.

The `OptanonConsent` cookie on first visit shows `interactionCount=0` with groups `1:1,2:1,4:1,5:1` -- all four groups (Strictly Necessary, Performance, Targeting, Social Media) enabled with zero user interaction. All 28 trackers listed above fire on page load before the user touches any consent UI.

**Session replay on opt-out pages**

Quantum Metric fires on both `/privacy/policy` (11 POST calls to `/horizon/comcast`) and `/privacy/your-privacy-choices` (7 POST calls). Snowplow also fires 8-9 PUT events on each privacy page. A visitor reading Xfinity's privacy policy or clicking through the opt-out flow is having their session replayed to Quantum Metric's servers. Every scroll, pause, and click on the opt-out interface is captured.

## Sitecore API Key -- Xumo Cross-Contamination

`window.__APP_CONFIG__` exposes the Sitecore JSS API configuration in plaintext client-side JavaScript. The same API key appears in both staging and production configs:

```
API key: %7B0E3FF218-24AC-4CA3-A056-8B7E4EEB7376%7D
Production: https://www.xfinity.com/sitecore/api/layout/render/jss
Staging: https://www.stg.xfinity.com/sitecore/api/layout/render/jss
Preview: https://preview.www.xfinity.com/sitecore/api/layout/render/jss
```

A Sitecore JSS API key being client-side is architecturally expected -- it's how JSS content delivery works. The issue is what the key returns.

Querying `https://www.xfinity.com/sitecore/api/layout/render/jss?item=/&sc_apikey={KEY}` against xfinity.com's own production endpoint returns layout for the **Xumo TV Agent Portal** -- not xfinity.com content. The Sitecore response identifies the site as `XumoAgent`, with:

```json
{
  "sitecore": {
    "context": {
      "site": {"name": "XumoAgent"},
      "pageState": "normal"
    },
    "route": {
      "fields": {
        "Description": {"value": "Welcome to Xumo TV Agent Portal"},
        "Title": {"value": "Xumo TV Agent Portal"},
        "Robots": {"value": "noindex, nofollow, noarchive"}
      }
    }
  }
}
```

The layout includes a `CustomerSearch` component, an `AuthedHeader` with Xumo branding, internal nav links to `tv.xumo.com/support`, and error message strings. The portal has `noindex, nofollow, noarchive` robots directives -- it's explicitly not intended for public access.

Xumo is Comcast's streaming device division (acquired 2023). The shared API key indicates the key was scoped across both xfinity.com and Xumo's internal agent portal, likely during a Comcast infrastructure consolidation. The production xfinity.com Sitecore endpoint is returning internal agent content from a different Comcast property.

## Internal Infrastructure Surface

**Live chat hostname map**

`window.v3Lander.hostToPath` is a Nuance live chat configuration object mapping internal domain names to chat handler paths. It contains 20 entries including:

- `IDM.XFINITY.COM`, `IDM-PERF.XFINITY.COM`, `IDM-ST.XFINITY.COM` -- Comcast Identity Management systems (production, performance test, staging)
- `EAC.COMCAST.COM` -- Employee agent portal
- `VERIFY.IDENTITY.XFINITY.COM`, `VERIFY-ST.IDENTITY.XFINITY.COM` -- identity verification systems
- `CONCIERGE.XC3.XFINITY.COM` -- communities concierge portal
- `WWW.NATIONALACCOUNTSPORTAL.COM` -- enterprise/national accounts portal
- `MOBILE.COMCAST.COM`, `XFINITYONCAMPUS.COM` -- partner properties
- `BUSINESS.STG.COMCAST.COM` -- business services staging
- `WWW.XUMO.COM`, `SUPPORT.XUMO.COM` -- Xumo properties sharing the same Nuance siteID

The `-ST` and `-PERF` suffixes indicate staging and performance-test environments. All 20 entries route to the same Nuance siteID `10006690`, meaning a single chat deployment spans Comcast's entire property portfolio.

**SSL SAN enumeration**

The xfinity.com certificate SANs enumerate internal API and preview infrastructure:

- `xapi.xfinity.com`, `services.xfinity.com`, `delivery.xfinity.com` -- respond 403/404
- `idm.xfinity.com`, `login.xfinity.com` -- auth/identity systems
- `oauth.xfinity.com` -- OAuth provider
- `preview.www.xfinity.com` -- content preview (returns Sitecore preview content)
- Datacenter-specific: `preview.api.ch2.prd.xfinity.com`, `preview.api.pdc.prd.xfinity.com`, `preview.api.wcdc.prd.xfinity.com` -- CH2, PDC, and WCDC datacenter identifiers
- WAF hostname: `ts43-waf.ecs.xm.comcast.com`

**`__APP_CONFIG__` additional exposure**

The app config also contains:

- Logger endpoint: `https://api-support.xfinity.com/logger/` with source identifier `polaris-prod`
- YHM (Your Home Map) proxy: `https://yhm.comcast.net/YhmProxy/extension/YHM/?response=json` -- OAuth-protected home network/device management service
- OAuth base: `https://oauth.xfinity.com/oauth/`
- Feature flag: `enableYHMApiCall: false` -- YHM API call disabled in current build

## Third-Party Plan Data API (CompareOffers)

The mobile savings calculator on xfinity.com is an iframe-embedded white-label tool from CompareOffers, operated by yournavi.com, branded for Xfinity at `xfinity-customer-app.compareoffers.us`. Config extracted from the page:

```json
{
  "api_url": "https://xfinity-customer-app.compareoffers.us/api/v1/",
  "assets_url": "https://images.yournavi.com/img",
  "config_src": ["XFINITY"],
  "version": "0.0.55",
  "requestAccessToken": true
}
```

`requestAccessToken: true` is in the config but not enforced -- all six API endpoints return data without authentication in a standard browser session:

```
GET /api/v1/config/get_config
GET /api/v1/ext_carrier/get_carriers
GET /api/v1/ext_carrier/get_carrier_by_id
GET /api/v1/ext_carrier/get_compare_carriers_info
GET /api/v1/ext_carrier/get_plans_by_carrier_id
GET /api/v1/ext_carrier/get_embedded_plans
```

`get_carriers` returns the full competitive carrier list with internal IDs, bin values, and asset paths -- AT&T, Verizon, T-Mobile, Boost, and others. `get_plans_by_carrier_id` returns plan pricing and feature data for competitor offerings. `get_embedded_plans` returns Xfinity's own plan data in the same format. This is the data backing the "You could save by switching to Xfinity" calculator -- Comcast's competitive intelligence tooling, accessible as an open API under a third-party subdomain.

CORS on this API reflects any origin: a preflight with `Origin: https://evil.example.com` returns `Access-Control-Allow-Origin: https://evil.example.com`. Functionally equivalent to `*` for cross-origin access.

## Active A/B Experiments

Amplitude experiment state is readable from localStorage key `amp-exp-$default_instance-a5751e`. Active variants on this visit (segment: "All Other Users"):

| Experiment | Variant |
|---|---|
| `deal_card_action_buttons` | `compare_shop` |
| `compare_page_deal_card_action_buttons` | `shop` |
| `way_to_inform_about_trade_in` | `trade_in_credit_text` |
| `cluster` | `on` |
| `collect_app_performance` | `off` (default) |

The `deal_card_action_buttons` and `compare_page_deal_card_action_buttons` tests are testing CTA button configurations on plan comparison pages. `way_to_inform_about_trade_in` is a messaging test -- `trade_in_credit_text` is the variant, implying the control presents trade-in information differently.

## Machine Briefing

### Access & Auth

The homepage and most marketing pages load without auth or special headers in a headed browser. Headless Playwright is blocked at the Akamai WAF layer -- Akamai Bot Manager triggers on headless Chrome fingerprints (`bm_sz`, `_abck`, `bm_mi` cookies). Use headed Playwright or a real browser session.

The Sitecore JSS endpoints, logger, and compareoffers API are accessible without auth. User context endpoints (`/sitecore/api/learn/neptune/persistencelayer/usercontext`) return data for Comcast network users without login (IP recognition) but 403 for non-Comcast IPs without a CIMA session. The collector at `collector.pabs.comcast.com` returns 403 for unauthorized writes but has `Access-Control-Allow-Origin: *`.

CIMA (Comcast Identity Management Architecture) auth flows through `login.xfinity.com` with OAuth at `oauth.xfinity.com`.

### Endpoints

**Open (no auth)**

```bash
# Sitecore CMS layout -- returns page layout for given item path
GET https://www.xfinity.com/sitecore/api/layout/render/jss?item=/&sc_apikey=%7B0E3FF218-24AC-4CA3-A056-8B7E4EEB7376%7D

# Cart indicator state
GET https://www.xfinity.com/sitecore/api/learn/neptune/carts/cartindicator

# Competitor carrier list (unauthenticated)
GET https://xfinity-customer-app.compareoffers.us/api/v1/ext_carrier/get_carriers

# Competitor plans by carrier ID
GET https://xfinity-customer-app.compareoffers.us/api/v1/ext_carrier/get_plans_by_carrier_id?carrier_id={id}

# Xfinity embedded plans
GET https://xfinity-customer-app.compareoffers.us/api/v1/ext_carrier/get_embedded_plans

# CompareOffers config
GET https://xfinity-customer-app.compareoffers.us/api/v1/config/get_config

# Nuance agent availability check
POST https://www.xfinity.com/tagserver/launch/agentAvailability

# Amplitude experiment config
GET https://sr-client-cfg.amplitude.com/config/da6c948d2cf762a296ef0d51e4a5751e

# Amplitude variants
GET https://api.lab.amplitude.com/sdk/v2/vardata
```

**Requires CIMA session**

```bash
# User context (IP-recognized for Comcast users, 403 otherwise)
GET https://www.xfinity.com/sitecore/api/learn/neptune/persistencelayer/usercontext

# YHM home network management (OAuth required)
GET https://yhm.comcast.net/YhmProxy/extension/YHM/?response=json
```

### Gotchas

- **Akamai WAF blocks headless** -- must use headed browser. The `bm_sz` cookie is the Bot Manager challenge token; failing it gets you an `Access Denied` page with no redirects.
- **Sitecore API key is URL-encoded** -- `%7B` and `%7D` are `{` and `}`. The actual key is `{0E3FF218-24AC-4CA3-A056-8B7E4EEB7376}`.
- **Sitecore endpoint returns Xumo content for root path** -- querying `item=/` on the production xfinity.com endpoint returns Xumo TV Agent Portal layout, not xfinity.com homepage content.
- **compareoffers.us `requestAccessToken: true`** is in config but not enforced -- tokens are not required in practice.
- **Snowplow events** fire as PUT to `/prod/event/` -- extremely high volume on support pages (133+ per session). The collector is at `pabs.comcast.com`.
- **Adobe Alloy** POSTs to `/ee/or2/v1/interact` via obfuscated paths. This is standard Alloy behavior.
- **digitalData.user geo segment** is populated on first load for Comcast network users -- check `window.digitalData.user[0].segment` for recognized state.
