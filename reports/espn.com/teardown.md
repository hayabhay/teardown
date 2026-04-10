---
# agents: machine-friendly instructions in "## Machine Briefing"
title: ESPN — Teardown
url: "https://www.espn.com"
company: ESPN
industry: Entertainment
description: "Sports media network serving live scores, news, streaming, and fantasy sports."
summary: "ESPN serves server-rendered HTML through a CloudFront + Varnish CDN stack, with an internal FITT SPA framework handling client-side navigation. Disney's infrastructure runs through every layer: OneID v4 for identity, Adobe Pass for TV Everywhere authentication, BAMGrid for streaming entitlement, and Fastcast for real-time sports data over WebSocket. The sports.core.api.espn.com subdomain is a fully open, CORS-wildcard data API covering athletes, contracts, betting odds, and live game data without authentication."
date: 2026-04-07
time: "00:34"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack:
  - Varnish
  - CloudFront
  - Webpack
  - Disney OneID
  - Adobe Pass
  - Prebid.js
  - Google Ad Manager
  - Fastcast
trackers:
  - Google Ad Manager
  - Adobe Analytics
  - Adobe Audience Manager
  - Adobe Target
  - OneTrust
  - Datadog RUM
  - Nielsen
  - Comscore
  - Chartbeat
  - New Relic
  - Rubicon/Magnite
  - AppNexus/Xandr
  - Yahoo DSP
  - Kargo
  - Index Exchange
  - TrustX
  - Taboola
  - Impact Radius
  - mParticle
  - Disney BAM
  - Conviva
tags:
  - sports
  - streaming
  - disney
  - real-time
  - betting-data
  - open-api
  - pre-consent-tracking
  - programmatic-ads
  - feature-flags
  - websocket
headline: "ESPN's own server sets your CCPA cookie to 'opted out of sale' — then seven ad exchanges bid on you anyway, before the consent banner appears."
findings:
  - "Seven ad exchanges (Google, Yahoo, Rubicon, AppNexus, Kargo, Index Exchange, TrustX) bid on every visitor before any consent interaction, even though ESPN's own server sets the CCPA cookie to 'opted out of sale' based on IP geolocation."
  - "200+ feature flags shipped to every browser include enableVenu: false — the flag for the now-blocked Disney/Fox/WBD joint streaming venture — alongside disableUSBettingAds: true, revealing product and regulatory decisions in real time."
  - "ESPN's Fastcast real-time data service hands out live WebSocket connection tokens from a public endpoint with no auth, letting any third party subscribe to the same live score streams that power ESPN's own scoreboard."
  - "A 20-year tracking cookie (SWID) is set in the HTTP response headers on first visit, assigning a persistent cross-session identity before the page even renders."
  - "sports.core.api.espn.com returns full athlete, contract, and betting odds data without authentication — the same open API that powers ESPN's own pages is available to any caller with no rate limiting observed."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

ESPN.com is server-rendered HTML cached behind a CloudFront + Varnish dual-layer CDN. The `via` header confirms the path: `1.1 c902d30cffcc (Varnish/7.5), 1.1 cb0f9f6369baeebf7c66aebe4cb453ac.cloudfront.net (CloudFront)`. HTML is served with `cache-control: max-age=0, must-revalidate` — no edge caching for the document itself, though the Varnish layer handles short-lived caching upstream.

Client-side navigation runs on ESPN's internal **FITT** framework, loaded from `cdn1.espn.net/fitt/`. The current release is `release-03-31-2026.2.0.4380` — a full Webpack bundle with event-based architecture handling playback, DRM, auth, personalization, and video player events. Two build versions are exposed in the page: `espn.build = "0.767.2"` (the SPA framework version) and `window.BUILDVERSION = "6.0.0.5"` (the overall site build). jQuery is still present.

The Disney parent company's infrastructure is visible in every subsystem:

| Layer | Disney Component |
|-------|-----------------|
| Identity | OneID v4.4.279 (`cdn.registerdisney.go.com/v4/OneID.js`) — `window.OneID`, `window.DisneyID`, `window.did` |
| Streaming | BAMGrid Hive Playback v26.2.1-bagheera (`espn.api.edge.bamgrid.com`) |
| Video | Hudson Player (internal name) — `hudsonPlayer: true`, `hudsonPAL: true` in feature flags |
| TV Auth | Adobe Pass (`sp.auth.adobe.com`) — TV Everywhere MVPD authentication |
| Analytics | Adobe Analytics (AppMeasurement via `s_omni`), Adobe Target (`espndotcom.tt.omtrdc.net`), Adobe Audience Manager (`disney.demdex.net`) |
| Consent | Disney Content Framework (`_dcf=1` cookie, `TWDC-DTCI/prod/serverComponent.php`) layered on OneTrust |
| Real-time | Fastcast WebSocket service on `go.com` infrastructure |
| Logging | `log.go.com` (Disney-wide analytics) |

The Nielsen measurement config loaded on every ESPN page contains IDs for 25+ Disney media brands: ESPN, WatchESPN, ESPN Deportes, Fantasy, ABC, FX, FiveThirtyEight, Andscape, GMA, SEC Network, Cricinfo, seven ABC local stations (KTRK, KFSN, WLS, WABC, KGO, KABC, WTVD, WPVI), and an internal codename "matterhorn." A single ESPN page load reveals the measurement taxonomy for the entire Disney media portfolio.

**SSL certificate SANs** enumerate ESPN's internal API surface — domains that resolve but return 403 to external callers:

```
watch.admin.api.espn.com / watch.admin.api.preview.espn.com
watch.p13n.product.api.espn.com
watch.graph.api.espn.com
watch.video.api.espn.com (+ staging/qa variants)
pcc.api.dev.espn.com / pcc.api.qa.espn.com
site.managed.api.espn.com
sportscenter.api.preview.espn.com / sportscenter.fan.api.preview.espn.com
restrictions.api.preview.espn.com
events.api.preview.espn.com
*.fan.api.espn.com / *.fan.api.espnqa.com
*.partnerpub.espn.com / *.shortstop.espn.com
```

The `espn.pvt` internal domain also surfaces in public API responses — `sports.core.api.espn.pvt` appears in pickcenter data returned by the public sports core API.

**Content Security Policy** is `frame-ancestors` only — a long whitelist of ESPN, ABC, Disney, and SEC Sports domains. No `script-src`, no `connect-src`. All inline scripts are unrestricted. Combined with `access-control-allow-origin: *` on all API responses, the security posture is permissive by design.

No `security.txt`, no `llms.txt`, no `humans.txt`.

---

## The Open Sports Data API

`sports.core.api.espn.com` is ESPN's most significant infrastructure exposure. It serves structured sports data — athletes, contracts, odds, game stats, win probability — over plain HTTP with no authentication, no API key, and `Access-Control-Allow-Origin: *`. Any website, script, or application can call it directly from a browser.

### Contract data

The athlete contracts endpoint returns financial details that are typically locked behind paywalled sports data services:

```
GET /v2/sports/basketball/leagues/nba/athletes/3136195/contracts/2026

{
  "salary": 54126450,
  "incomingTradeValue": 54126450,
  "outgoingTradeValue": 54126450,
  "birdStatus": 0,
  "optionType": 0,
  "yearsRemaining": 3,
  "poisonPillProvision": { "active": false },
  "tradeKicker": { "active": false, "percentage": 0, "value": 0, "tradeValue": 0 },
  "baseYearCompensation": { "active": false },
  "tradeRestriction": false,
  "minimumSalaryException": false
}
```

That is Karl-Anthony Towns' 2026 contract: $54,126,450 salary, with incoming and outgoing trade values, bird rights status, option type, poison pill provision state, trade kicker details, and base year compensation — all fields that matter for NBA trade mechanics. The contracts list endpoint shows 12 seasons of history available per player. The athletes index reports 843 athletes in the NBA alone.

This data is available on sites like Spotrac and Basketball Reference, but those require human browsing. ESPN serves it as clean, structured JSON from a CORS-open endpoint — a ready-made API for any programmatic consumer.

### Betting odds

72 betting odds providers are registered in the API (`/v2/sports/basketball/leagues/nba/providers` returns `count: 72`). DraftKings is provider 100 (priority 1); DraftKings Live Odds is provider 200.

The odds endpoint for any game returns open, close, and current prices for spread, moneyline, and over/under — from both pre-game and live odds providers:

```
GET /v2/sports/basketball/leagues/nba/events/{id}/competitions/{id}/odds

Provider 100 (DraftKings): ATL -1.5, O/U 226.5, moneyline -122/+102
Provider 200 (DraftKings Live): ATL -2.5, O/U 225.5, moneyline -135/+105
```

Each odds object includes open/close/current prices in decimal, fractional, and American formats, plus deep links to DraftKings bet slip URLs with ESPN tracking parameters (`wpsrc=413&wpcn=ESPN`). The `disableUSBettingAds: true` feature flag blocks US betting ad creatives in the UI, but does nothing to restrict the betting data API.

A companion endpoint returns play-by-play win probability data — 228 entries per game tracking real-time win probability shifts.

### API structure

The API uses a hypermedia `$ref` pattern throughout — responses contain URLs to related resources rather than embedding them. The base URL template is consistent:

```
http://sports.core.api.espn.com/v2/sports/{sport}/leagues/{league}/{resource}
```

Confirmed working for NBA, NFL, MLB, soccer, and tennis. The game summary endpoint at `site.api.espn.com` aggregates multiple data types into a single response: boxscore, win probability, pickcenter, odds, injuries, plays, standings, news, and videos.

Both `site.web.api.espn.com` and `site.mobile.api.espn.com` return identical scoreboard data publicly — the mobile and web APIs are the same data behind different subdomains.

---

## Fastcast — Real-Time Data Infrastructure

Fastcast is ESPN's real-time sports data service. It runs on Disney's `go.com` infrastructure at `fastcast.semfs.engsvc.go.com`, separate from the main `espn.com` domain.

The token endpoint is public:

```
GET https://fastcast.semfs.engsvc.go.com/public/websockethost

{
  "ip": "pw8dacb108-102a-4f47-a068-5c1286d65fc0-34-219-116-161.fastcast.semfs.engsvc.go.com",
  "token": "MTc3NTUyMTE0MzU2OA==:pdJ3bleRKYEWNtEOUNRfbcUsbIg=",
  "port": 9571,
  "securePort": 9573
}
```

The token decodes to a timestamp + HMAC signature: `MTc3NTUyMTE0MzU2OA==` is base64 for the Unix timestamp `1775521143568` (milliseconds), and the second part is a 20-byte HMAC. A fresh token is issued on every call — no auth, no rate limiting observed on the token endpoint itself.

Two access modes are visible in the network logs:
- **WebSocket**: direct connection to `fastcast.semfs.engsvc.go.com` on port 9573 (TLS)
- **HTTP SSE**: `fcast.espncdn.com/FastcastService/pubsub/profiles/12000/topic/{topic}` — Server-Sent Events fallback

The homepage subscribes to topic `event-topevents` for the live scoreboard ticker. Game pages subscribe to sport-specific topics like `gp-basketball-*` for play-by-play updates.

This is the same real-time data feed that powers ESPN's live scoreboards. Any third party that calls the public token endpoint gets a valid connection credential.

---

## Feature Flags — Product Direction in the Open

`window.espn.featureGating` contains 200+ feature flags shipped to every browser. These are not behind authentication — they're in the page source on every load.

**Strategic flags:**

| Flag | Value | Signal |
|------|-------|--------|
| `enableVenu` | `false` | Venu Sports — the Disney/Fox/WBD streaming joint venture blocked by DOJ in 2025. The flag persists in production code. |
| `disableUSBettingAds` | `true` | US betting ad creatives are suppressed. The betting data API operates normally. |
| `disableBet365` | `false` | Bet365 is specifically not disabled — a different posture from the general US betting ad block. |
| `articlesUseContentCore` | `false` | Article system has not yet migrated to "ContentCore" — a CMS migration is in progress but not shipped. |
| `mlb_v4` | `false` | MLB v4 not yet enabled. |
| `enableWebPlayer` | `false` | Web player is disabled; Hudson Player handles video. |
| `disableAmp` | `true` | AMP is dead. |
| `enablePWA` | `true` | PWA is enabled — though the service worker is a non-functional stub (see below). |
| `showTaboolaArticle` | `false` | Taboola recommendations disabled on articles. |
| `showTaboolaSportIndex` | `true` | Taboola enabled on sport index pages. |
| `enableSubscriberCohorts` | `true` | Subscriber segmentation is live. |
| `gateFavorites` | `true` | Favorites feature is gated behind login. |
| `oneIDV4` | `true` | Disney OneID v4 migration is complete. |
| `enableMagnite` | `true` | Magnite/Rubicon ad server active. |
| `enableDmp` | `true` | Data Management Platform active. |

The `disableUSBettingAds` / `disableBet365` split is notable. ESPN blocks betting ad creatives broadly in the US but exempts Bet365 specifically — suggesting an active partnership or contractual arrangement that predates the general betting ad suppression.

**A/B experiments:** The `userab_1` cookie assigns every visitor to 20 concurrent experiments on first page load, server-side, before any interaction:

| Experiment | Description |
|-----------|-------------|
| `eweb_bncp_follow` | Follow feature variant |
| `eweb_nav` | Navigation variant |
| `eweb_oly` | Olympics coverage variant |
| `eweb_bncp_search` | Search variant |
| `espn_web_pl` | Web playlist variant |
| `player_next_live` | Video player variant |
| `web_index1_hlstack` | Highlight stack variant |
| `ad_espn-403` | Ad test |
| `eweb_bncp_react` | React component variant |
| `eweb_bncp_pref` | Preferences variant |

All 20 experiments are assigned in a single cookie, keyed by experiment name and variant. The cookie has a 4-hour expiry (`Expires: Tue, 07 Apr 2026 04:15:17 GMT`), meaning experiment assignments are refreshed several times per day.

---

## Surveillance and Consent Architecture

### Pre-consent tracking

The full programmatic ad stack fires on every page load — including fresh sessions where the user has never interacted with any consent UI.

The HTTP response headers set two things simultaneously:

```
set-cookie: region=ccpa; path=/; ...
set-cookie: SWID=964FF763-F652-4E61-CED4-72CAA2138C8D; ... Expires=Sat, 07 Apr 2046 00:15:17 GMT; domain=espn.com;
```

The server detects the visitor is in a CCPA jurisdiction by IP and sets `region=ccpa`. It also sets `usprivacy=1YNY` — the IAB US Privacy string meaning "notice given, user opted out of sale." But on this same page load, all of the following third-party ad exchanges fire and return 200:

- **Google** — `pagead2.googlesyndication.com` (26 requests), `securepubads.g.doubleclick.net` (10 requests), `googleadservices.com` (12 requests), `google.com/rmkt/collect` (remarketing)
- **Yahoo DSP** — `c2shb.pubgw.yahoo.com` (3 bid requests)
- **Rubicon/Magnite** — `ads.rubiconproject.com`, `fastlane.rubiconproject.com`, `prebid-a.rubiconproject.com`
- **AppNexus/Xandr** — `ib.adnxs.com` (prebid)
- **Kargo** — `krk2.kargo.com` (prebid)
- **Index Exchange** — `htlb.casalemedia.com` (prebid)
- **TrustX** — `ads.trustx.org`, `sync.trustx.org`

Total: 97 requests on first page load — 10 first-party, 87 third-party across 27 domains. The `usprivacy=1YNY` signal tells these exchanges the user has opted out of data sale, but the bid requests fire anyway. Whether the exchanges honor the signal in their server-side processing is between ESPN and each exchange — from the browser's perspective, the data leaves.

### Consent infrastructure

ESPN runs a two-layer consent system:

1. **OneTrust** — standard CMP at `cdn.cookielaw.org` (GUID: `e962d8c8-d4a3-459a-a6f4-d9c01dbac777`). The `OptanonConsent` cookie on a fresh session shows `interactionCount=0` — the user has never been shown or interacted with a consent prompt.

2. **Disney Content Framework (DCF)** — ESPN's parent company consent layer (`_dcf=1` cookie, `TWDC-DTCI/prod/serverComponent.php`). The `ensClientConfig` global shows `clientId: 2750` for ESPN within the broader TWDC consent system. The DCF consent whitelist includes mParticle, Kantar (2cnt.net), and Datadog alongside the standard tracker stack.

The GPP consent string `OTGPPConsent=DBABLA~BVQqAAAAAAJY.QA` is set server-side on first visit.

### Tracking inventory

28 tracking and analytics vendors fire on ESPN pages. The confirmed list:

**Analytics:** Adobe Analytics (AppMeasurement/SiteCatalyst), Adobe Target, Adobe Audience Manager (`disney.demdex.net`), Datadog RUM v6.25.4, Chartbeat (`pSUPERFLY`), Comscore, Nielsen, New Relic, Conviva (video quality)

**Advertising:** Google Ad Manager, Google Remarketing, Prebid.js v10.23.0, Rubicon/Magnite, AppNexus/Xandr, Yahoo DSP, Kargo, Index Exchange, TrustX, Taboola

**Identity:** Disney OneID/DisneyID, Adobe Pass (TV Everywhere), Disney BAM (streaming entitlement), ESPN Vision (`vision.fn-pz.com` — ESPN's personalization engine)

**Other:** OneTrust, Impact Radius (affiliate), mParticle (in consent whitelist), Kantar (in consent whitelist)

### The SWID cookie

The `SWID` cookie is ESPN's cross-session visitor identity. It is set in the HTTP response headers — before any JavaScript executes, before any consent banner could possibly render:

```
set-cookie: SWID=964FF763-F652-4E61-CED4-72CAA2138C8D; path=/; Expires=Sat, 07 Apr 2046 00:15:17 GMT; domain=espn.com;
```

A 20-year expiry. Scoped to `espn.com`. Set on the very first visit. This is a persistent cross-session identifier that will survive browser restarts, cookie clearing (unless specifically targeted), and outlast most user hardware. It is not gated on consent.

---

## The PWA That Isn't

The `enablePWA: true` feature flag and registered service worker at `https://www.espn.com/service-worker.js` suggest ESPN is a Progressive Web App. The service worker is 11 lines:

```js
const CACHE = 'pwabuilder-offline';

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('activate', function (event) {
    caches.delete(CACHE);
});
```

It is a PWABuilder.com template that does exactly one thing: delete its own cache on activation. No offline capability, no push notifications, no pre-caching, no fetch interception. The service worker is registered (scope: `https://www.espn.com/`) but provides zero functionality. This is a PWA checkbox — likely installed to meet some internal criteria for "PWA support" without implementing any PWA features.

---

## AI Crawlers and the AMP Exit

ESPN's `robots.txt` blocks every major AI crawler individually:

```
User-agent: GPTBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: FacebookBot
Disallow: /

User-agent: Bytespider
Disallow: /
```

Plus `claritybot`, `Omgilibot`, and `Omgili` — 10 bot-specific blocks total. The general `User-agent: *` section then disallows `/personalization/`, `/espn/now`, `/video/search`, `/community/`, and legacy paths.

At the same time, the robots.txt still explicitly allows AMP: `Allow: */platform/amp*`, `Allow: /*&platform=amp`, `Allow: /*?platform=amp`. But `disableAmp: true` in the feature flags means AMP is turned off at the application layer. ESPN has abandoned AMP while its robots.txt still welcomes AMP crawlers — a strategic pivot that ditches Google's page format while also blocking Google's AI crawler.

The `*/undefined` and `*/undefined/*` disallow rules in robots.txt are defensive — they prevent search engines from indexing URLs generated by JavaScript bugs where a variable was `undefined`. The network logs confirm this is a real problem: `GET /nba/game/_/gameId/undefined` returned a 403 on the game page.

---

## Game Page — Live Experience

NBA game pages (tested with game ID 401810998) layer additional infrastructure on top of the base page:

**Rive WebGL animations:** `@rive-app/webgl2@2.35.0/rive.wasm` plus `gamecast_v21.riv` — ESPN uses Rive for real-time game animations in the browser, rendered via WebGL2.

**Fastcast subscriptions:** Game pages subscribe to sport-specific topics (`/FastcastService/pubsub/profiles/12000/topic/gp-basketball-*`) for play-by-play updates streamed in real time.

**BAMGrid entitlement checks:** `pcs.bamgrid.com/v1/espn` fires 3 times per game page — checking streaming entitlements for the logged-in user.

**Taboola density:** 9 Taboola beacons per game page load, despite `showTaboolaArticle: false` — the sport index flag (`showTaboolaSportIndex: true`) keeps Taboola active on game pages.

**Hive Player:** Disney's streaming player (`v26.2.1-bagheera`) handles video playback. The version codename "bagheera" continues Disney's tradition of naming internal releases after Jungle Book characters.

---

## Machine Briefing

**Access method:** Standard HTTP GET. No bot detection on the homepage — Varnish/CloudFront serves cached HTML to curl with a basic UA. Some first-party API endpoints require the `SWID` session cookie (set automatically on first visit). The sports data APIs require nothing.

**Key endpoints:**

```
# Fully open — no auth, no cookies, CORS *
GET http://sports.core.api.espn.com/v2/sports/{sport}/leagues/{league}/athletes
GET http://sports.core.api.espn.com/v2/sports/{sport}/leagues/{league}/athletes/{id}
GET http://sports.core.api.espn.com/v2/sports/{sport}/leagues/{league}/athletes/{id}/contracts/{year}
GET http://sports.core.api.espn.com/v2/sports/{sport}/leagues/{league}/events/{id}/competitions/{id}/odds
GET http://sports.core.api.espn.com/v2/sports/{sport}/leagues/{league}/events/{id}/competitions/{id}/winprobability
GET http://sports.core.api.espn.com/v2/sports/{sport}/leagues/{league}/providers
GET http://sports.core.api.espn.com/v2/sports/{sport}/leagues/{league}/seasons/{year}/teams
GET https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard
GET https://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/summary?event={id}
GET https://fastcast.semfs.engsvc.go.com/public/websockethost

# Open — no auth required
GET https://www.espn.com/core/api/v0/nav/index

# Session cookie required (SWID — set automatically)
GET https://www.espn.com/geo
GET https://www.espn.com/apis/site/v2/scoreboard/activeSports
GET https://www.espn.com/apis/personalized/v2/scoreboard/header
GET https://www.espn.com/apis/v2/fans
GET https://www.espn.com/apis/v2/recommendations/postalCode/{zip}

# Auth required — 403
GET https://watch.graph.api.espn.com
GET https://watch.auth.api.espn.com
GET https://watch.admin.api.espn.com
```

**Sports confirmed working:** basketball/nba, football/nfl, baseball/mlb, soccer, tennis. The URL pattern is consistent: substitute sport and league in the template.

**Fastcast connection:** Call `/public/websockethost` for a fresh token, then connect via WebSocket to the returned `ip` on `securePort` (9573/TLS). Subscribe to topics like `event-topevents` (global scoreboard) or `gp-basketball-{eventId}` (specific game). HTTP SSE fallback at `fcast.espncdn.com/FastcastService/pubsub/profiles/12000/topic/{topic}`.

**Sitemaps:** `https://www.espn.com/sitemap.xml` is the index, linking to googlenewssitemap, watch-espn-videos, videos, where-to-watch, and google-news-posts sitemaps.

**Gotchas:**
- The sports core API uses `http://` in its `$ref` URLs, not `https://`. Both protocols work, but the API's self-referential links use HTTP.
- Some first-party ESPN endpoints (`/geo`, `/apis/v2/fans`, scoreboard) require the `SWID` cookie. The cookie is set automatically on first visit — just make one page request first to get it.
- The recommendations endpoint leaks the visitor's postal code in the URL path (`/postalCode/94123`).
- The BAMGrid streaming API (`espn.api.edge.bamgrid.com/graph/v1/device/graphql`) requires an API key and returns `auth.missing` without one.
- Vision personalization (`vision.fn-pz.com/v3/config/espn-web`) requires an API key for config but accepts unauthenticated event POSTs to `/v3/event`.
- `client_version=4.7.1` is set as a cookie — useful for identifying which client build is running.
