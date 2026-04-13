---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "CNN — Teardown"
url: "https://cnn.com"
company: CNN
industry: Information
description: "US cable news network and digital news publisher owned by Warner Bros. Discovery."
summary: "CNN.com runs on Fastly/Varnish serving 3.7-4.5MB HTML pages from Stellar CMS (v8.0.0). The entire video stack -- live streaming, DRM, ad stitching -- runs on Warner Bros. Discovery's MAX platform via FAVE 4.32.0 and the Bolt API. Subscriptions are managed through Piano but only gate live TV; all article content ships unprotected. OneTrust handles consent with GPP support across 19 US states."
date: 2026-04-13
time: "07:02"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack: [Fastly, Varnish, Stellar CMS, FAVE, Bolt API, Adobe Launch, OneTrust, Piano, Prebid.js]
trackers: [Adobe Analytics, Google Ad Manager, FreeWheel, MUX, Conviva, LiveRamp, Zeta Global, Comscore, Nielsen DCR, Kantar, Gemius, Brightline, Chartbeat, Research Now, Google One Tap, Nativo]
tags: [news, media, subscription, video, consent, identity-resolution, a-b-testing, cors, adtech, wbd]
headline: "Every article ships its full text in the HTML -- the paywall flag is enabled site-wide but the content gate is never armed."
findings:
  - "The Bolt video API reflects any Origin header with Access-Control-Allow-Credentials: true -- any third-party page can make credentialed cross-origin requests to CNN's streaming platform on behalf of logged-in subscribers."
  - "CNN's video infrastructure is WBD's MAX streaming platform -- live TV flows through gcp.live.cnn.us.prd.media.max.com, the same stack serving HBO Max and Discovery+, with every environment's analytics keys and project IDs shipped in client JavaScript."
  - "The FastAB experiment registry is embedded in every page: 14 active tests including AI article summaries in 4-variant testing since January 2026 and an unexplained World-section proof-of-concept."
  - "The geoData cookie encodes city, zip code, lat/lon coordinates, and ISP type in plain text on every first request -- not HttpOnly, readable by any script on cnn.com subdomains."
  - "The server sets SecGpc=0 on every first visit before JavaScript executes; CNN's WBD consent module reads that cookie as the GPC source of truth, so browsers with Do Not Sell enabled arrive with the preference already overridden."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

CNN.com is a 4.5MB homepage backed by Warner Bros. Discovery's streaming infrastructure. The live TV player alone generates 165+ network requests through MAX platform domains on every page load. Underneath the news site is a dense layer of adtech, identity resolution, and experiment infrastructure -- all of it readable in the client JavaScript that ships with every response.

## Architecture

The site runs Stellar CMS behind Fastly/Varnish. Every response carries an `x-content-hub` header advertising the deployment: `build-env=prod; unique-deployment-key=rn032568; build-version=v8.0.0; build-commit-hash=103aa0eab44a576fa66ac568e0b423d1d7421078`. Content IDs follow the Stellar format: `cms.cnn.com/_pages/clg34ol9u000047nodabud1o2@published`. Cache-control is `max-age=60`.

Page sizes are substantial -- 4.5MB on the homepage, 3.7MB on article pages -- driven by two massive inline configuration objects. `window.CNN` holds ad config, A/B state, content metadata, targeting parameters, and Omniture config. `window.env` holds the complete FAVE video player configuration for all environments. Between them, the CNN client JavaScript has full visibility into the site's adtech, experimentation, and video platform without any API calls.

Subscription management runs through Piano (`id.piano.io`), but Piano's global `window.tp` is undefined on article pages -- it only handles subscription checkout flows, not content gating.

## Video: The WBD MAX Stack

CNN's video infrastructure is not CNN's. It is Warner Bros. Discovery's MAX streaming platform, operated under CNN's brand.

The FAVE framework (v4.32.0) handles the player layer, calling the Bolt API (`default.any-any.prd.api.bolt.cnn.com`) for session management, feature flags, and playback configuration. Zion (v3.5.0) handles analytics. The actual video bytes flow through `gcp.live.cnn.us.prd.media.max.com` and `gcp.amer-free.prd.media.max.com`. DRM (Widevine) licenses come from `busy.any-any.prd.api.bolt.cnn.com`. Ad stitching for video goes through `gmss.usw2.prd.api.discomax.com` (the Discovery Max manifest stitcher). The domain structure mirrors WBD's broader infrastructure pattern -- CNN is one tenant on a platform serving Max, Discovery+, and HBO Max.

The homepage streams live CNN TV directly. That stream generates the majority of page requests: 257 total on homepage load, with 83 going to `gcp.live.cnn.us.prd.media.max.com` and 82 to `gcp.amer-free.prd.media.max.com`.

The Bolt API exposes a public feature flags endpoint at `/labs/api/v1/sessions/feature-flags/decisions?projectId=6580c3f5-7ade-4af6-acf1-8d53d6b08c03`. This returns 31 flags covering every active video adtech vendor: Brightline CTV ads (V2, configId 1024), Comscore video measurement (V1), Gemius audience measurement (V1), Google Programmatic Access Library (V2), IAB Open Measurement SDK (V2), Kantar panel measurement (V1), Nielsen Digital Content Ratings (V1), paused-state ad display, ticket stub ad format, and contextual ad disclosure. The Gluon playback engine is enabled but its CMCD reporting is off.

The `fave.api.cnn.io/v1/runtime-configs` endpoint is public and unauthenticated. It returns player configuration including library redirect rules. Currently it includes a hard redirect: any request from `/specials/y2k` loads FAVE 3.11.0-pre.2 instead of the current 4.32.0. A second rule for a forced upgrade to latest-4.x is permanently disabled (empty array, always false).

MUX video quality monitoring (Litix) sends 24+ beacon posts per page load. FreeWheel (network ID 48804) handles video ad tracking through 22+ requests per session.

## Client Config: All Environments, All Keys

The `window.env` FAVE configuration object, inlined in every page, contains credentials and keys for every environment:

**Zion analytics access keys:**
- dev: `KpBwC22cgTOQ5OFcXlXpBCcQ4T8dO1i6`
- stage: `6SJTYyRg7GWdXGtZb5Hf6vv0pWAIyPvG`
- prod: `mXFw59FFEpUNOu3aeVJChKAsqAlZ4NEf`

**MUX environment keys:**
- prod: `p8dn7fp1liosd47cq1r3sb455`
- stage: `lkurrgueme6j22ns33na56jlb`
- dev: `out053a3bejgh7t0phqa0csou`

**Bolt LABS_PROJECT_ID by environment:**
- prod: `6580c3f5-7ade-4af6-acf1-8d53d6b08c03`
- stage: `250d255a-8c19-4c8c-9943-fdce43220cc0`
- dev: `27e987a9-6cc3-4722-a89a-b5387d284baf`
- int: `ecb21d68-4fae-4386-b587-9792a215ee58`

**Other keys:**
- Conviva customer key: `a6709203f34992a5095d2bc7ceaf2ec504f651a8`
- Bitmovin license key: `21101B44-DB43-4381-AEFF-E1A72BB2658E`
- FreeWheel network ID: `48804`
- SSAI profile IDs: prod clips `5lycn5OPFj`, live-auth `33hkbvnyaO`, live-unauth `ENHa1vBbDp`

Also present: base64-encoded JWT app tokens for CNN sub-brands -- CNN Arabic, CNN Espanol, CNN VAN, CNN Venezuela, and DTC/Horizon. These are static client tokens identifying sub-brand contexts to the WBD platform, not bearer auth.

## A/B Testing: Experiments in Plain Sight

Every page embeds `CNN.fastAB` -- the complete experiment registry with experiment IDs, variant names, and the user's bucket assignment. The `FastAB` cookie (HttpOnly, 1-year expiry) is set on every first visit with pre-assigned bucket numbers for all active experiments.

Current active experiments (14 total):

| Experiment | ID | Variants | Notes |
|---|---|---|---|
| `MW-anchor-ad-2025-11` | 1 | c, t1-t7 | Mobile anchor ad format |
| `MW-eager-loading-2026-03` | 2 | 3 | Image lazy load |
| `MW-anchor-ad-hp-2025-11` | 3 | control, collapsible, noncollapsible-nolabel | Homepage anchor |
| `mw-ads-redesign-2026-2` | 4 | -- | Mobile ad layout |
| `MW-event-tray-live-story-2025-12` | 8 | 5 | Live story tray |
| `DT-event-tray-live-story-2025-12` | 9 | 5 | Desktop live story tray |
| `mw-ai-article-summary-2026-01` | 10 | c, t1, t2, t3 | AI summaries, mobile |
| `dt-ai-article-summary-2026-01` | 11 | c, t1, t2, t3 | AI summaries, desktop |
| `mw-nav-nonsub-2026-03` | 12 | 4 | Navigation for non-subscribers |
| `dt-ads-redesign-2026-2` | 14 | -- | Desktop ad layout |
| `MW-homepage-module-recs-2025-11` | 15 | -- | Mobile homepage recs |
| `DT-homepage-module-recs-2025-11` | 16 | -- | Desktop homepage recs |
| `mw-hp-lead-package-styling-2026-03` | 17 | -- | Homepage lead styling |
| `DT-world-poc-test-2026-02` | 29 | c, t1, t2 | Unknown World section POC |

The AI summary experiments launched in January 2026 and run 4 variants on both mobile and desktop simultaneously. Three months in with 4 variants suggests CNN is testing UI approaches -- likely comparing summary placement, length, or attribution formats -- not just an on/off toggle.

`DT-world-poc-test-2026-02` (experiment 29) runs on the desktop World section with three unnamed variants. The "poc" naming suggests a proof-of-concept for an unreleased product feature.

The navigation experiment `mw-nav-nonsub-2026-03` targets non-subscribers specifically -- likely testing prompts or friction to drive subscriptions.

## The Paywall That Isn't

`enablePaywall: true` is set in CNN's site-wide metadata. Subscription plans exist at $3.99/month (annual: $29.99/yr) and $6.99/month ($69.99/yr). `/watch` redirects to `/subscription` for unauthenticated users.

But `enableSubscriptionContent: false` appears on every article page. No article content is gated. The complete article text is present in every HTML response -- in the JSON-LD `articleBody` block and in the HTML body. A user who never executes JavaScript receives the full article.

Piano (`id.piano.io`) is referenced in article HTML but `window.tp` is undefined on article pages. Piano is wired to subscription checkout flows only. `free_preview: "1:nvs"` in page metadata suggests the paywall infrastructure can gate content -- but the content gate is not armed on any articles. CNN's subscription product is, so far, about live TV access only.

## Surveillance and Identity

The tracker inventory on CNN is broad. Confirmed vendors active across page load and video:

**CMP and Consent:** OneTrust (CMP ID: 28, GPP + IAB TCF v2)
**Tag Management:** Adobe Launch (`_satellite`)
**Analytics:** Adobe Analytics / AppMeasurement (Omniture)
**Ad Stack:** Google Ad Manager/DFP, Prebid.js (header bidding, Amazon A9 adapter), FreeWheel (video, network 48804)
**Video Measurement:** MUX/Litix, Conviva (disabled in runtime config but present), Comscore, Nielsen DCR, Kantar, Gemius
**Identity Resolution:** LiveRamp/RLCdn (`idsync.rlcdn.com`), LiveRamp Pippio (`pippio.com/api/sync?pid=5324`, 1-year cookie)
**DMP:** Zeta Global (`window.zeta`, tag `cnn-pixel-8786`)
**CTV Ads:** Brightline (`events.brightline.tv`, `services.brightline.tv`)
**Audience Research:** Research Now/Dynata (`tag.researchnow.com`)
**Authentication:** Google One Tap
**Bot Detection:** Arkose Labs
**Sponsored Content:** Nativo (`ntvConfig`)
**Engagement:** Chartbeat (enabled in FAVE settings)

Three separate identity resolution layers operate in parallel: LiveRamp's cookie sync during video playback (`idsync.rlcdn.com`, syncing FreeWheel's `partner_uid=w9bce_*` for cross-device audience targeting), LiveRamp Pippio's first-party data layer (`pippio.com`), and Zeta Global's DMP. All three fire before any user interaction.

The `usprivacy=1YYN` cookie is set on every visit. Decoded: version 1, Yes (sale notice given), Yes (not opted out of sale), No (LSPA inapplicable). The default state is "not opted out" -- trackers fire in the permissive mode on first load.

The `dataLayer` sequence on first load: `OneTrustLoaded` (empty groups), `OptanonLoaded` (empty groups), `OneTrustLoaded` (all groups active). All consent categories activate in rapid succession without user interaction.

## The GPC Intercept

CNN's consent system includes a custom mechanism for handling Global Privacy Control -- and it contains a problem.

`WBD.UserConsentConfig` (exposed in every page's client JavaScript) contains:
```json
{"gpcFixCookie": "SecGpc", "cookieDomain": ".cnn.com", "domId": "3d9a6f21-8e47-43f8-8d58-d86150f3e92b"}
```

The `gpcFixCookie: "SecGpc"` field instructs the WBD consent module to read the `SecGpc` cookie as its GPC state source. The code path in the minified consent JS: if `navigator.globalPrivacyControl` is undefined in the browser but the `SecGpc` cookie is `"1"` (or starts with `"t"`), the consent module polyfills `navigator.globalPrivacyControl` to return `true`.

The problem: CNN's server sets `SecGpc=0` on every first request via `Set-Cookie` before any JavaScript executes.

Sequence for a GPC-enabled browser (Brave with GPC enabled, Firefox with GlobalPrivacyControl extension):

1. Browser sends `GET cnn.com` with `Sec-GPC: 1` header
2. Server responds: `Set-Cookie: SecGpc=0`
3. OneTrust initializes, calls `gpcFixCookie` mechanism, reads `SecGpc` cookie: value is `0`
4. Polyfill condition not met -- `navigator.globalPrivacyControl` is not patched to return `true`
5. `OptanonConsent` records `isGpcEnabled=0&browserGpcFlag=0`
6. All tracking consent groups activate

Whether this is intentional or a misconfigured polyfill is unclear. The code is designed to respect GPC -- it patches `navigator.globalPrivacyControl` when the cookie is set. But the server consistently sets the cookie to `0`, defeating that mechanism for any GPC-enabled browser. The effect is that CNN's OneTrust instance never registers a positive GPC signal.

OneTrust's own config declares `IsGPPEnabled: true` and covers 19 US states (CA, CO, CT, DE, IA, IN, KY, MD, MN, MT, NE, NH, NJ, OR, RI, TN, TX, UT, VA). Google Consent Mode (`GCEnable`) is `false`. CMP ID 28.

## CORS: The Bolt API Opens Up

`default.any-any.prd.api.bolt.cnn.com` -- CNN's Bolt video platform API -- reflects any `Origin` header and pairs it with `Access-Control-Allow-Credentials: true`. Verified live:

```
$ curl -I -H "Origin: https://evil.example.com" \
  "https://default.any-any.prd.api.bolt.cnn.com/labs/api/v1/sessions/feature-flags/decisions?projectId=6580c3f5-7ade-4af6-acf1-8d53d6b08c03"

access-control-allow-origin: https://evil.example.com
access-control-allow-credentials: true
access-control-expose-headers: date,x-wbd-ace,x-wbd-refresh,x-wbd-session-state,x-wbd-transport
```

The `access-control-allow-credentials: true` pairing with a reflected wildcard origin means that any page, on any domain, can make credentialed cross-origin requests to the Bolt API. If a logged-in CNN subscriber visits a third-party page that makes a fetch to `bolt.cnn.com`, the browser will attach the subscriber's session cookies.

The exposed headers -- `x-wbd-ace`, `x-wbd-refresh`, `x-wbd-session-state`, `x-wbd-transport` -- are internal WBD session management headers, readable by the calling origin via `access-control-expose-headers`.

The feature flags endpoint itself requires no auth and returns non-sensitive data. The risk surface is any authenticated endpoint on the same domain -- video playback, subscription status, or anything that uses the session token. `POST /any/playback/v1/playbackInfo` and `POST /markers/any/markers/v1/markers` both exist on this domain.

By comparison, `www.cnn.com` correctly uses `Access-Control-Allow-Origin: *` (no credentials) for its public content API.

## IP Geolocation Cookie

On every first request, CNN's server sets four cookies encoding the visitor's IP geolocation:

```
set-cookie: SecGpc=0; Domain=.cnn.com; Path=/; SameSite=None; Secure
set-cookie: countryCode=US; Domain=.cnn.com; Path=/; SameSite=None; Secure
set-cookie: stateCode=CA; Domain=.cnn.com; Path=/; SameSite=None; Secure
set-cookie: geoData=san francisco|CA|94123|US|NA|-700|cable|37.800|-122.430|807; Domain=.cnn.com; Path=/; SameSite=None; Secure
```

`geoData` encodes: city, state, zip code, country, continent, UTC offset, ISP type (cable/fiber/mobile), latitude, longitude, and a DMA code. None of these cookies are `HttpOnly` -- they are readable by any JavaScript running under `*.cnn.com`. The data persists on the domain until overwritten, not just for the session.

The latitude/longitude precision (37.800, -122.430) is approximate (city-level) but combined with the zip code and ISP type, it is a reasonably specific location profile encoded in a first-party cookie that every CNN subdomain can read.

## Public APIs

Three endpoints are open and require no authentication:

**Breaking news alerts:**
```
GET https://www.cnn.com/public/api/alerts
```
CORS `*`. Returns live breaking news alerts.

**Election data:**
```
GET https://politics.api.cnn.io/available-races/all/index.json
```
Returns race data for 2020-2026 elections. 2026 coverage includes 8 states with primary races: Arkansas (governor, senate, house, AG, lt. governor), Georgia (house), Illinois (governor, senate, house, AG), Mississippi (house, senate), New Jersey (house), North Carolina (house, senate), Texas (governor, senate, house, AG, lt. governor), Wisconsin (supreme court).

**Video player config:**
```
GET https://fave.api.cnn.io/v1/runtime-configs
```
Returns FAVE player configuration, library redirect rules, and per-feature player settings.

## Infrastructure Fingerprint

Subdomains observed across the investigation:

| Domain | Purpose |
|---|---|
| `default.any-any.prd.api.bolt.cnn.com` | Bolt video platform API |
| `busy.any-any.prd.api.bolt.cnn.com` | DRM (Widevine license proxy) |
| `fave.api.cnn.io` | FAVE player config |
| `registry.api.cnn.io` | FAVE library registry |
| `stage-registry.api.cnn.io` | FAVE staging registry |
| `data.api.cnn.io` | Data API |
| `gmss.usw2.prd.api.discomax.com` | WBD manifest stitcher and ad tech |
| `gcp.live.cnn.us.prd.media.max.com` | CNN live video delivery |
| `gcp.amer-free.prd.media.max.com` | Free-tier MAX video delivery |
| `busy.any-any.prd.api.discomax.com` | WBD DRM proxy |
| `medium.ngtv.io` | Next-Gen TV video delivery |
| `token.ngtv.io` | NGTV token service |
| `token.vgtf.net` | Token fallback (Turner heritage) |
| `pmd.cdn.turner.com` | Turner CDN (legacy) |
| `amd.cdn.turner.com` | Turner CDN (legacy) |

The Turner heritage domains (`turner.com`, `vgtf.net`) remain in the video delivery chain alongside the newer WBD/MAX infrastructure -- evidence of the 2022 Warner Bros. Discovery merger still unresolved at the infrastructure level three years later.

AI crawler access is blocked at robots.txt: ClaudeBot, anthropic-ai, GPTBot, PerplexityBot, Amazonbot, Bytespider, FacebookBot, Google-Extended, OAI-SearchBot, and 40+ others are explicitly disallowed.

---

## Machine Briefing

### Access and Auth

Most CNN content is unauthenticated. The main site, all article pages, and several API endpoints work with a plain `curl` or `fetch`. Live CNN TV (`/watch`) requires a paid subscription -- unauthenticated requests redirect to `/subscription`.

The video platform (Bolt API) requires a session token for playback. The token is obtained via `POST /session-context/headwaiter/v1/bootstrap` on `default.any-any.prd.api.bolt.cnn.com`. Without a token, data endpoints return `{"errors":[{"code":"invalid.token"}]}`.

CORS on `www.cnn.com` is `*` (no credentials). CORS on `default.any-any.prd.api.bolt.cnn.com` reflects any origin with credentials -- browser-based cross-origin requests with cookies will work.

### Endpoints (Open, No Auth)

**Breaking news alerts:**
```
GET https://www.cnn.com/public/api/alerts
```

**Election race data (2020-2026):**
```
GET https://politics.api.cnn.io/available-races/all/index.json
```

**Video player runtime config:**
```
GET https://fave.api.cnn.io/v1/runtime-configs
```

**OneTrust consent config:**
```
GET https://www.cnn.com/wbdotp/consent/3d9a6f21-8e47-43f8-8d58-d86150f3e92b/cnn.com.json
```

**Bolt feature flags (no auth, returns 31 flags):**
```
GET https://default.any-any.prd.api.bolt.cnn.com/labs/api/v1/sessions/feature-flags/decisions?projectId=6580c3f5-7ade-4af6-acf1-8d53d6b08c03
```

### Endpoints (Auth Required)

**Session bootstrap (returns Bolt session token):**
```
POST https://default.any-any.prd.api.bolt.cnn.com/session-context/headwaiter/v1/bootstrap
```

**Video playback info:**
```
POST https://default.any-any.prd.api.bolt.cnn.com/any/playback/v1/playbackInfo
```

**Video progress markers:**
```
POST https://default.any-any.prd.api.bolt.cnn.com/markers/any/markers/v1/markers
```

### Gotchas

- Article HTML is large (3.7MB). `articleBody` is in the JSON-LD `<script type="application/ld+json">` block -- parse that rather than the full DOM.
- `geoData`, `countryCode`, `stateCode`, `SecGpc`, and `FastAB` cookies are set on the first response. If you want consistent A/B bucket assignments across requests, preserve the `FastAB` cookie.
- The Bolt API's 404 response is not JSON -- it returns an XML Varnish error page. Check status codes before parsing.
- `/v2_token` returns a full HTML page, not a token -- unauthenticated hits are redirected to a sign-in flow.
- The `projectId` for the Bolt feature flags endpoint is environment-specific: `6580c3f5-7ade-4af6-acf1-8d53d6b08c03` (prod), `250d255a-8c19-4c8c-9943-fdce43220cc0` (stage).
- `politics.api.cnn.io` returns JSON directly. 2026 data is structured as `{year: {state: {office: [{race details}]}}}`.
- The robots.txt disallow list includes `/api/`, `/search`, `/subscriptions/`, and a long tail of legacy paths. These are honored by crawlers but not access-controlled for direct requests.
