---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "TMZ — Teardown"
url: "https://tmz.com"
company: "TMZ"
industry: "Entertainment"
description: "Celebrity gossip and entertainment news site owned by Fox Corporation."
summary: "TMZ runs React + Redux on the client with server-side rendering via a PHP/gdbots/pbjx stack and Triniti CMS, delivered through Apache + CloudFront on ARM Graviton pods in us-east-1. Despite operating as an independent brand, the site's auth, identity graph, analytics, and ad infrastructure all route through six Fox Corp internal domains — auth.fox.com, id.fox.com, prod.pyxis.atp.fox, prod.idgraph.dt.fox, api.strike.fox, and prod-foxkit.kts.fox."
date: "2026-04-09"
time: "00:53"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack:
  - React
  - Redux
  - PHP
  - Triniti CMS
  - CloudFront
  - Apache
  - JWPlayer
  - Prebid.js
trackers:
  - Google Tag Manager
  - Google Analytics 4
  - Google Ad Manager
  - Adobe Analytics
  - Adobe Audience Manager
  - Amazon Publisher Services
  - Braze
  - Chartbeat
  - Disqus
  - Fox IDGraph
  - Fox Pyxis
  - Fox Strike
  - GumGum
  - Instagram
  - Mobian
  - Prebid.js
  - Taboola
  - Browsi
  - Ketch
tags:
  - fox-corp
  - celebrity-news
  - identity-graph
  - infrastructure-exposure
  - consent
  - prebid
  - advertising
  - commerce
  - production-error
  - cms
headline: "A sponsored content slot on TMZ's homepage still has the placeholder 'YOUR 3rd PARTY IMPRESSION TRACKER GOES HERE' as its pixel URL -- it fires as a GET on every load and 404s on TMZ's own server."
findings:
  - "Every API call to TMZ's /_/ namespace returns the serving pod's AWS ENI ID, instance type, and availability zone in a ctx_cloud block -- infrastructure topology leaking in plaintext on every unauthenticated request."
  - "Fox's cross-property identity graph at prod.idgraph.dt.fox requires no authentication -- POST any visitor ID and get back LiveRamp, TradeDesk UID2, and Amazon ARID resolution fields."
  - "TMZ's inline feature flags still carry a CHANNEL_COMMERCE UUID and a prime_day schedule from November 2025 in every page response -- a Black Friday commerce activation baked into production months after it ended."
  - "Ketch consent lists zero vendors despite 22 active trackers, and auto-grants targeted advertising on first load via legalBasisDefault with no banner shown -- the consent framework is configured but functionally inert."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

TMZ operates as a celebrity gossip and entertainment news brand -- but under the hood, it runs on Fox Corporation's shared infrastructure from end to end. Auth, identity, analytics, ad delivery, and CDN all route through Fox internal domains. The independent brand sits on top of fully shared corporate plumbing.

## Architecture

TMZ's stack is two separate systems stitched together: a PHP backend running the gdbots/pbjx event-sourcing framework with Triniti CMS, and a React + Redux frontend with Turbolinks for SPA-style navigation. JWPlayer handles video. jQuery is still present alongside React.

Server responses come from Apache origin servers, cached and distributed via CloudFront. The POP observed was SFO53-P5 (us-east-1). The serving infrastructure runs on ARM Graviton (`arm64-c1024-m2048` -- 1 vCPU, 2GB RAM per instance) across three availability zones: us-east-1b, us-east-1c, and us-east-1d. CloudFront geo-routes on the `CloudFront-Viewer-Country` header.

Static assets are separated by subdomain:

- `imagez.tmz.com` -- Digital Asset Management image delivery (CloudFront-fronted)
- `ovp.tmz.com` -- Online Video Platform (CloudFront, 404 on direct access)
- `dam.tmz.com` -- Digital asset management origin (S3, 403 on direct access)
- `share.tmz.com` -- Short link redirector (forwards to www.tmz.com)
- `polls.tmz.com` -- SquareOffs polling platform (Heroku, `Access-Control-Allow-Origin: *`)
- `amp.tmz.com` -- AMP subdomain exists; `amp_enabled: false` in feature flags
- `smetrics.tmz.com` -- Adobe Analytics metrics collection

Every HTML response carries an inline comment fingerprint:

```
<!--
app_version=3.50.0
benchmark=57ms
etag=79a802553ed69b7392d76e85de572c30
timestamp=1775695697
timestamp_iso=2026-04-09T00:48:17.607291Z
screen=desktop-default
-->
```

This includes server-side render benchmark time, cache etag, ISO timestamp, and screen template -- consistent across all page types including 404s, sitemaps, and API responses.

The news sitemap (sitemap-news.xml) leaks the same fields in XML comments: benchmark timing, etag, deployment ID, and timestamp. The deployment ID (`82c1fcf79f7a4b49a5816aee4958c744`) appears as `APP_DEPLOYMENT_ID` in the window globals.

URL patterns follow a date-based structure: `/YYYY/MM/DD/slug/`. The robots.txt disallows `/_/` (API namespace), `*/print`, `/search`, and `/xid`. The `/_/` prefix is confirmed as the backend API namespace via the promotion API (`/_/promotion/{slot}/{slot}.json`) and article API.

## Fox Corp Infrastructure

TMZ's brand independence is surface-level. Every page load touches six Fox internal domains in addition to CloudFront:

| Domain | Role |
|--------|------|
| `prod-foxkit.kts.fox` | Fox's internal CDN for shared SDK scripts (.kts.fox is a Fox-internal TLD) |
| `auth.fox.com` | Fox OAuth2 / Hydra auth server (TMZ tenant: `/tmz/`) |
| `id.fox.com` | Fox centralized identity platform |
| `api.strike.fox` | Fox Strike ad context API |
| `prod.pyxis.atp.fox` | Fox Pyxis analytics ingestion |
| `prod.idgraph.dt.fox` | Fox cross-property identity graph |

The Fox Profile SDK is loaded from `https://prod-foxkit.kts.fox/js/sdk/profile/v6.6.1/profile.js` (version pinned in flags). The Fox common SDK loads from `https://prod-foxkit.kts.fox/js/sdk/common/v2.15.1/common.js`.

Every HTML page embeds a `PROFILE_SDK_BASE_CONFIG` block inline:

```json
{
  "apiKey": "MxwSGZEGSaCHsTePJEMBSCzkELRVdOr1",
  "appName": "tmz-web",
  "appVersion": "3.50.0",
  "authBaseUrl": "https://auth.fox.com/tmz/",
  "baseUrl": "https://id.fox.com",
  "clientId": "90a6dd91-ccad-46ac-859e-8abd30cb7647",
  "environment": "prod",
  "redirectUri": "https://www.tmz.com/_/oauth2-redirect",
  "useHydraForRefresh": true,
  "useEksEndPoints": true
}
```

The OAuth2 redirect endpoint is `/_/oauth2-redirect`.

**Promotion API and ctx_cloud leak**

The `/_/promotion/{slot}/{slot}.json` endpoints use the gdbots/pbjx "envelope" schema (`pbj:gdbots:pbjx::envelope:1-1-0`). Every response includes a `ctx_cloud` block:

```json
{
  "_schema": "pbj:gdbots:contexts::cloud:1-0-0",
  "provider": "aws",
  "region": "us-east-1",
  "zone": "us-east-1c",
  "instance_id": "eni-027da0938c9e3cc88",
  "instance_type": "arm64-c1024-m2048"
}
```

The `instance_id` field is populated with the AWS ENI (Elastic Network Interface) ID of the serving pod. Across multiple requests, distinct ENI IDs appeared rotating across us-east-1b, us-east-1c, and us-east-1d. The field name is a misnomer in the framework schema -- it receives whatever the deployment sets as the instance identifier, and the TMZ deployment uses the ENI ID. This reveals load balancer topology and instance sizing to anyone making unauthenticated API calls.

**Fox Strike**

Fox Strike (`api.strike.fox`) is Fox Corporation's shared ad platform serving all Fox properties. For TMZ, it provides real-time contextual classification per page via the `/ctx/v1/tags` endpoint (requires `x-api-key`). The Strike loader script (`https://strike.fox.com/static/tmz/display/loader.js`, 199KB) embeds the complete Prebid.js bidder configuration for all TMZ page types. Strike version v237.

Strike pulls Mobian brand safety and DoubleVerify classifications and injects them into the Prebid auction. For the homepage, the contextAPIData includes IAB content categories: `IAB1, IAB1-5, IAB1-6, IAB1-7, IAB11, IAB11-2, IAB14, IAB14-4, IAB16-4, IAB19, IAB2, IAB20, IAB3, IAB5-8, IAB6, IAB7, IAB9, IAB9-26, IAB9-5`. IAB9-26 is "Nudity" in the IAB content taxonomy -- the brand safety system classifies celebrity gossip as nudity-adjacent content, which shapes which ad buyers can bid on TMZ inventory.

**Fox Pyxis and IDGraph**

`POST https://prod.pyxis.atp.fox/pyxis/submit` accepts unauthenticated analytics events, returning `{"status":"Event Routed","uuid":"..."}`. This is Fox's analytics ingestion endpoint across all Fox properties.

`POST https://prod.idgraph.dt.fox/api/v2/item` is Fox's identity resolution API. It accepts a request with an `id` field and returns identity resolution fields: `arid` (Amazon ARID), `arid_exp`, `_lr_env`, `lr_exp` (LiveRamp), `_td_token`, `td_exp` (TradeDesk UID2). No authentication required. The XID cookie (`xid=515b386c-18f6-4acb-bcaa-f317c1f7c5cb`) is TMZ's persistent pseudonymous visitor ID, passed to multiple Fox services and as a GPT custom parameter for ad targeting.

## Surveillance Architecture

A TMZ homepage load generates 62 HTTP requests -- 4 to TMZ's own domains, 58 to 21 third-party domains. An article page adds Taboola (2 endpoints) and Browsi (2 endpoints).

**Tracker inventory (verified)**

| Tracker | Domain(s) | Purpose |
|---------|-----------|---------|
| Google Tag Manager | (container) | Tag management -- GTM-KTN543J |
| Google Analytics 4 | `analytics.google.com` | Site analytics -- G-NCN9V8PMQF |
| Google Universal Analytics | `www.google-analytics.com` | Legacy UA collect |
| Google Remarketing | `www.google.com/rmkt/collect/621195757/` | Remarketing pixel |
| Google Funding Choices | `fundingchoicesmessages.google.com` | Consent management |
| Google Ad Manager (GPT) | `googletagservices.com`, `securepubads.g.doubleclick.net` | Display ads |
| Adobe Analytics | `smetrics.tmz.com` | Analytics (AppMeasurement / `s` global) |
| Adobe Audience Manager | `dpm.demdex.net` | ID sync (2 hops: /id then /id/rd) |
| Amazon Publisher Services | `c.amazon-adsystem.com` | Header bidding -- aaxPubId: AAX111JFD (aaxEnabled: false in config, script loads regardless) |
| Braze | `sdk.iad-07.braze.com` | Push engagement -- POST /api/v3/data/ |
| Chartbeat MAB | `mab.chartbeat.com` | Headline A/B testing |
| Comscore | referenced in config (`sb.scorecardresearch.com` URL in flags) | Audience measurement |
| Disqus | `disqus.com` | Comments -- unauthenticated thread API |
| Fox IDGraph | `prod.idgraph.dt.fox` | Cross-property identity resolution |
| Fox Pyxis | `prod.pyxis.atp.fox` | Fox analytics ingestion |
| Fox Strike | `api.strike.fox`, `strike.fox.com` | Ad context + bidding platform |
| GumGum | `zipthelake.com` -- id: ae071174 | In-image contextual advertising |
| Instagram / Meta | `graph.instagram.com`, `www.instagram.com` | Logging events (no Instagram embeds visible on homepage) |
| Megaphone | `player.megaphone.fm` | Fox podcast network (11 playlists on homepage) |
| Mobian | via Fox Strike | Contextual brand safety scoring |
| Prebid.js | multiple -- AppNexus, Rubicon/Magnite, Index Exchange, TradeDesk | Header bidding |
| Taboola | `trc.taboola.com`, `beacon.taboola.com` | Content recommendations (article pages) |
| Browsi | `events.browsiprod.com`, `yield-manager.browsiprod.com` | AI viewability (article pages) |
| Playgent | `ae.playgent.com`, `publications.playgent.com`, `static.playgent.com` | Game widget events |
| Outbrain | inferred (OBR global present, not confirmed in network logs) | Content recommendations |
| Admiral | inferred (admiral global present, not confirmed in network logs) | Adblock detection |

**DataLayer and referrer leakage**

Every GTM event push -- `page_loaded`, `page_rendered`, `ads_rendered` -- carries the AWS cloud context: `cloudProvider: aws`, `cloudRegion: us-east-1`, `cloudZone: us-east-1d`. TMZ's serving infrastructure details are sent to Google's analytics pipeline on every page.

The response header `referrer-policy: unsafe-url` sends the full URL (including query string) as the `Referer` header to all 21 third-party domains. Article URLs encode celebrity names in slugs -- e.g., `/2026/04/09/celebrity-name-story-detail/` -- leaked via Referer to every tracker on the page.

**localStorage inventory**

Notable keys written without explicit consent interaction:

- `taboola global:user-id` -- persistent Taboola user ID
- `tbl_rtus_id` -- Taboola return visit tracking
- `foxgroup1-tmz:session-data` -- Taboola session keyed under `foxgroup1` (Fox Group)
- `_swb_consent_` -- Ketch SWB consent record (`source: legalBasisDefault`)
- `tmz.xid` -- TMZ persistent visitor ID (same value as xid cookie)
- `tmz.FOXKITAUTHN` -- Fox authentication state
- `__broesiUc`, `__brw_ua`, `__binsUID` -- Browsi AI viewability identifiers

**Client Hints collection**

The `permissions-policy` response header grants all User-Agent Client Hints: `ch-ua-arch`, `ch-ua-bitness`, `ch-ua-full-version`, `ch-ua-full-version-list`, `ch-ua-mobile`, `ch-ua-model`, `ch-ua-platform-version`, `ch-ua-platform`, and `ch-ua`. The matching `accept-ch` header requests all nine. Combined with `referrer-policy: unsafe-url`, TMZ collects a detailed device fingerprint alongside full URL referrers on every request.

## Consent Theater

TMZ uses Ketch for consent management, but the configuration makes consent largely nominal.

The Ketch config defines a single purpose: `targeted_advertising` (canonical: `behavioral_advertising`). Legal basis is `consent_optout` -- described as "data subject has received adequate disclosure... and can subsequently opt-out." Zero vendors are registered in the Ketch config despite 22+ active trackers.

The consent cookie set on first load:

```
_ketch_consent_v1_ = {"targeted_advertising":{"status":"granted","canonicalPurposes":["behavioral_advertising"]}}
```

The `_swb_consent_` localStorage record shows `source: legalBasisDefault` -- consent was set by the system's default rule, not by user action. No consent banner appeared during the investigation session. The USPrivacy string is `1YNN`: version 1, notice provided (`Y`), not opted out of data sale (`N`), LSPA not signed (`N`).

Ketch's GPC plugin maps the GPC signal to the `targeted_advertising` purpose across California, Colorado, Connecticut, Utah, and Virginia. The investigation session (no GPC signal sent) received auto-granted consent. GPC handling is claimed but was not tested under investigation conditions.

The Ketch postmessage plugin lists three allowed origins: `https://polls.tmz.com`, `https://squareoffs.com`, and `https://sostaging.com`. The last is a staging domain for the SquareOffs polling platform -- a development URL in production consent configuration.

## Feature Flags as Config

The full TMZ feature flag set is embedded as inline JavaScript in every HTML response via `window.CLIENT_PRELOADED_STATE`. The flag object (`pbj:tmz:sys:node:flagset:1-0-0`, etag: `b8603b56d3688665229bb45314bb1cf9`) contains three typed namespaces:

**Booleans:**
- `hotjar_enabled: false`
- `facebook_enabled: false`
- `amp_enabled: false`
- `strike_destroy_slots_disabled: true` -- ad slot cleanup is disabled; Prebid slots are not destroyed on navigation, a potential memory accumulation on Turbolinks-navigated sessions
- `gallery_list_connatix_enabled: true` -- Connatix video player active on gallery list pages
- `omit_video_xid_ad_parameter: true` -- XID not passed to video ads

**Integers:**
- `display_updated_date_buffer_minutes: 30` -- articles updated within 30 minutes don't show "updated" label
- `semi_adhesion_hide_timeout: 4000` -- sticky ad autohides after 4 seconds
- `video_preroll_threshold_seconds: 10`
- `fpc_edge_writer_percent: 2` -- Fox Page Cache edge write sampling at 2%

**Selected strings:**
- `fcm_web_api_key: AIzaSyAcs5PrK3p2gzA4_L04XlwBsfBHpUqg5r4` -- Firebase Cloud Messaging
- `fcm_sender_id: 672506631666`
- `fcm_app_id: 1:672506631666:web:78989ecf095b90bbaec76b`
- `fcm_project_id: tmz-prod`
- `google_maps_api_key: AIzaSyBuYHrN4CD8GCWPuV3NF5r9wRhvVjFdBi8`
- `gtm_container_id: GTM-KTN543J`
- `ga4_measurement_id: G-NCN9V8PMQF`
- JWPlayer IDs: `jwplayer_floating_player_id: OVUHMYdS`, `jwplayer_site_id: NcrzjsjL`, `jwplayer_recommendations_playlist_id: QMALoHTp`
- `foxkit_profile_sdk_src: https://prod-foxkit.kts.fox/js/sdk/profile/v6.6.1/profile.js`
- `foxkit_common_sdk_src: https://prod-foxkit.kts.fox/js/sdk/common/v2.15.1/common.js`
- `prime_day_enabled_at: 2025-11-20T08:00:00.000Z`
- `prime_day_disabled_at: 2025-12-19T07:59:59.000Z`

**Commerce channel signal**

The `staticRefs` block in `CLIENT_PRELOADED_STATE` contains a single entry:

```json
{
  "Tmz\\Taxonomy\\StaticRef::CHANNEL_COMMERCE": "tmz:channel:9af7bd56-b698-48f9-9087-8b825eff6875"
}
```

Combined with the `prime_day` schedule -- November 20 through December 19, 2025, covering Black Friday through Cyber Monday -- this reveals TMZ ran a dedicated commerce channel during the 2025 holiday shopping period. The channel UUID and the schedule window are still embedded in every page response months after the promotion ended.

## Production Mistakes

**Unfilled impression tracker**

Every TMZ homepage load makes a GET request to:

```
GET /YOUR%203rd%20PARTY%20IMPRESSION%20TRACKER%20GOES%20HERE HTTP/1.1
Host: www.tmz.com
-> 404
```

The source is a CMS-managed sponsored content widget for the `sponsor-tmz-in-dc` slot (TMZ's DC/politics news sponsorship placement). The widget renders a JavaScript impression pixel loader:

```javascript
wbq.push(function renderSponsorTrackers() {
  var trackers = [
    'YOUR 3rd PARTY IMPRESSION TRACKER GOES HERE',
  ];
  function accept() {
    var ts = new Date().getTime();
    for (var i = 0; i < trackers.length; i++) {
      var tracker = new Image();
      tracker.src = trackers[i].replace('[timestamp]', ts);
    }
  }
  function reject() {}
  watchConsent(function (canUse) {
    canUse('dfp') ? accept() : reject();
  });
});
```

The consent gate (`canUse('dfp')`) fires correctly. The `[timestamp]` replacement executes. The tracker URL itself was never filled in -- the CMS template placeholder shipped to production. The advertiser's sponsored content is rendering on TMZ's homepage, but their impression pixel is 404ing on TMZ's own server. The advertiser has no record of impressions being served.

**Staging URL in production consent config**

`sostaging.com` -- a SquareOffs staging domain -- is listed as an allowed postmessage origin in TMZ's production Ketch consent configuration alongside `polls.tmz.com` and `squareoffs.com`.

**AMP infrastructure without AMP**

`amp.tmz.com` exists and returns responses. `amp_enabled: false` is set in feature flags. The AMP base URL (`https://amp.tmz.com/`) is included in app globals. The infrastructure is running but the feature is disabled.

## Notable Integrations

**Braze and the single-line service worker**

TMZ's PWA service worker is one line of JavaScript:

```javascript
self.importScripts('https://js.appboycdn.com/web-sdk/5.4/service-worker.js');
```

The entire service worker is delegated to Braze (formerly Appboy). No offline caching, no background sync for content -- the PWA manifest exists solely to support Braze web push notification delivery via Firebase Cloud Messaging (sender ID: 672506631666).

**Playgent game widget**

The homepage embeds a Playgent Wordle-variant ("Worday") game. The content configuration for the current widget:

- Publication: "The Kardashians TV Show"
- Game type: worday
- Word: DRAMA
- Account ID: `org_35F2HJCNLA0J9CVL033XG3xkF4s`

Game events POST to `ae.playgent.com`. Dictionary data loads from `static.playgent.com/worday/dict/en.json`. Publication data from `publications.playgent.com/GUHHoUiVda/data.json`.

**Chartbeat headline testing**

`mab.chartbeat.com/mab_strategy/headline_testing/get_strategy/` fires on every page load. For the homepage at investigation time: `{"status":"success","data":{"experiments":{}}}` -- no active headline test running. The integration is live; tests run per article when configured. The system uses a multi-armed bandit algorithm to select winning headlines by engagement metrics.

**Megaphone podcast network**

The homepage makes 11 separate requests to `player.megaphone.fm` for Fox podcast playlist data -- IDs prefixed with `FOXM`. These are Fox Corp's podcast properties embedded in the TMZ sidebar.

**Browsi AI viewability**

Article pages load Browsi (`events.browsiprod.com`, `yield-manager.browsiprod.com`), which provides AI-powered ad viewability prediction and yield optimization. Browsi sets three localStorage keys for its own identity: `__broesiUc`, `__brw_ua`, `__binsUID`.

## Machine Briefing

### Access and auth

No authentication required for most endpoints. The first-party API namespace is `/_/`. `curl` or `fetch` with standard headers works. A browser-like User-Agent is recommended (CloudFront and some endpoints may block bot UAs).

Geo-routing is active (`Vary: CloudFront-Viewer-Country`). From the US, GDPR does not apply and consent auto-grants.

To get an XID (TMZ's persistent visitor ID), POST to `/xid`:

```bash
curl -s -X POST https://www.tmz.com/xid \
  -H "Content-Type: application/json" \
  -b "xid=your-uuid-here"
# Returns 200 -- XID is set/confirmed in response cookie
```

### Endpoints

**Open -- no auth**

```bash
# Promotion/sidebar API -- returns pbj envelope with content widgets
curl -s "https://www.tmz.com/_/promotion/home-sidebar/sidebar.json" | python3 -m json.tool

# Article sidebar
curl -s "https://www.tmz.com/_/promotion/article-sidebar/sidebar.json" | python3 -m json.tool

# Disqus thread data (replace URL param)
curl -s "https://disqus.com/api/3.0/threads/set.json?forum=tmz&thread=link:https://www.tmz.com/2026/04/09/example/" | python3 -m json.tool

# Chartbeat headline experiments for a page
curl -s "https://mab.chartbeat.com/mab_strategy/headline_testing/get_strategy/?host=www.tmz.com&path=/&domain=www.tmz.com"

# Playgent game data
curl -s "https://publications.playgent.com/GUHHoUiVda/data.json"

# Fox Pyxis -- analytics ingestion (unauthenticated, any payload)
curl -s -X POST "https://prod.pyxis.atp.fox/pyxis/submit" \
  -H "Content-Type: application/json" \
  -d '{"event": "test"}' | python3 -m json.tool
# Returns: {"status":"Event Routed","uuid":"..."}

# Fox IDGraph -- identity resolution (unauthenticated)
curl -s -X POST "https://prod.idgraph.dt.fox/api/v2/item" \
  -H "Content-Type: application/json" \
  -d '{"id": "your-xid-here"}' | python3 -m json.tool
# Returns id resolution fields: arid, lr_env, td_token

# Ketch consent config (California/English)
curl -s "https://global.ketchcdn.com/web/v3/config/tmz/tmz_web/production/california/en/config.json" | python3 -m json.tool

# Ketch IP lookup
curl -s "https://global.ketchcdn.com/web/v3/ip"
```

**Promotion API URL pattern:**
```
https://www.tmz.com/_/promotion/{slot-name}/{slot-name}.json
```
The sidebar slot name matches in both path segments.

**Article API:**
```
https://www.tmz.com/_/article/{article-uuid}/
```

**Image CDN:**
```
https://imagez.tmz.com/{path}
```

**Sitemap endpoints:**
```
https://www.tmz.com/sitemap-news.xml   # 134 articles, XML comments with benchmark/etag/timestamp
https://www.tmz.com/sitemap.xml        # Index sitemap
```

**Megaphone podcast playlists:**
```
https://player.megaphone.fm/playlist/{FOXM-ID}
```
IDs observed: FOXM4985735396, FOXM4693090661, FOXM6270035501, FOXM2176370002, FOXM5344109408, FOXM8246091795, FOXM9051784054, FOXM5910554689, FOXM8375291015, FOXM3106419189, FOXM2426486648

**Polls:**
```
https://polls.tmz.com/   # SquareOffs -- Access-Control-Allow-Origin: *
```

### Gotchas

- `/_/` API responses always include a `ctx_cloud` block with ENI ID, instance type, and AZ -- these vary per request as load balancers route to different pods.
- `/xid` is disallowed in robots.txt and returns 403 from S3 on direct GET. POST works from a browser context; behavior from curl/server-side may differ.
- `/search` is disallowed in robots.txt. Search is handled client-side.
- Fox Strike's `/ctx/v1/tags` requires an `x-api-key` header -- not publicly documented, embedded in the Strike loader.
- `aaxEnabled: false` in the foxstrike config but APS script still loads -- Amazon Publisher Services is partially integrated but toggled off at the config level.
- The Ketch consent update endpoint (`POST /web/v3/consent/tmz/update`) fires on first load to record the auto-granted consent state -- not a user action trigger.
- CloudFront POP routing: us-east-1 is the origin region; edge cache TTL is 60 seconds (`s-maxage=60`), browser cache is 30 seconds (`max-age=30`).
- 404 pages return HTTP 200 from CloudFront with a 404 page body -- standard behavior but worth noting if scraping by status code.
