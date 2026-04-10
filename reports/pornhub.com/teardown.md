---
# agents: machine-friendly instructions in "## Machine Briefing"
title: Pornhub — Teardown
url: "https://www.pornhub.com"
company: Pornhub
industry: Adult
description: "Adult video streaming platform with integrated ad network and creator marketplace."
summary: "Pornhub runs on OpenResty (Nginx + LuaJIT) with a jQuery/Vue.js frontend and a proprietary CDN (phncdn.com) for assets and HLS video delivery. The site exposes a public unauthenticated Webmasters API for video search and performer metadata. Ad delivery is handled by TrafficJunky, Pornhub's in-house ad network, operating through internal /_xa/ endpoints and syncing visitor IDs via Atlas and FingerprintJS. Payment accepts only ACH and 26 cryptocurrencies following the 2020 Visa/Mastercard withdrawal, processed via ProBiller."
date: 2026-04-06
time: "16:52"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack: [OpenResty, jQuery, Vue.js, Workbox, phncdn CDN, ProBiller]
trackers: [Google Analytics 4, Google Tag Manager, TrafficJunky, Atlas, AdTNG, EroHub, Etahub, Bongacams, Chaturbate, Stripchat, SinParty, FingerprintJS]
tags: [adult, video-streaming, ad-network, consent, cryptocurrency, webmasters-api, fingerprinting, hls, payment, ab-testing]
headline: "Every ad impression sends your IP address, ISP, and zip code to the ad network in a protobuf payload — on every page view, not just login."
findings:
  - "Every ad impression fires a tracking call to AdTNG (a.adtng.com) with a base64 protobuf in the infos= parameter that encodes the visitor's IP address, city, state, ISP, connection type, and zip code — meaning the ad network gets precise location data on every single page view, not just at session start."
  - "Credit cards are completely absent from the payment flow — only ACH bank transfers and 26 cryptocurrencies (including privacy coin XMR) are accepted, a direct artifact of the 2020 Visa/Mastercard withdrawal still visible in the live API six years later."
  - "A fully unauthenticated public Webmasters API serves complete video metadata, paginated search, and 448,286 user-created tags with no rate limiting or API key — the tags endpoint even includes a warning in its own response about the volume."
  - "Google Consent Mode defaults to ad_storage and analytics_storage granted before the consent banner renders for non-EU visitors, confirmed by a cookie-banner-impression-noneu event — full ad and analytics tracking fires without any user action."
  - "Video player flashvars expose a 37-value per-segment audience engagement heatmap (hotspots array) to every unauthenticated visitor, revealing exactly which moments in a video are most watched."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

Pornhub serves from **OpenResty** (Nginx + LuaJIT) — confirmed via `server: openresty` response header. There is no Node.js or Python backend visible at the edge. The frontend is a hybrid: **jQuery 3.6.0** + **jQuery UI 1.13.2** handle the bulk of DOM interaction, while **Vue.js 2.x** (`vue.min.js`) is loaded for modular components. There is no full SPA framework. Pages are server-rendered HTML with progressive JS enhancement.

Static assets and JavaScript ship from **`ei.phncdn.com`**. HLS video segments stream from **`hv-h.phncdn.com`**. Thumbnail and preview images come from `kw.phncdn.com` and `pix-cdn77.phncdn.com`. All `phncdn.com` subdomains are Pornhub's own CDN infrastructure. One exception: the `/_xd/` fingerprinting subdomain is served via Google Cloud CDN (`via: 1.1 google`), isolated from the main OpenResty stack.

A **Workbox 6.4.1** service worker is registered at `/service-worker.js`. Its only active caching rule targets `android-app/android-img-01.jpg`. Three broader caching rules (for CDN JS, all images, stylesheets, and scripts) are present but commented out — suggesting a rollback from a previous broader caching strategy.

The deploy timestamp embedded in all asset cache-bust URLs is `2026040204` — April 2, 2026.

**Scale indicators from sitemaps and APIs:**
- 33 video sitemaps (`sitemap_g_vids1-33`) — approximately 495,000+ indexed videos
- 5 shorts sitemaps (`sitemap_g_shorties1-5`) — short-form video catalog
- 11 performer/model sitemaps — 13,814 indexed performers per the sitemap index
- 448,286 user-created tags indexed in the Webmasters API
- 13 language subdomains: en, de, fr, it, pt, es, ru (rt.pornhub.com), pl, ja (jp.pornhub.com), nl, fil, cz, cn

HTTP/3 is available (`alt-svc: h3=":443"; ma=3600`). HSTS is preloaded (`max-age=63072000; includeSubDomains; preload`). The `rating: RTA-5042-1996-1400-1577-RTA` header signals ICRA/RTA adult content classification, used by parental control tools for content filtering. The server requests 7 Client Hints on every response: `Sec-CH-UA`, `Sec-CH-UA-Arch`, `Sec-CH-UA-Full-Version`, `Sec-CH-UA-Full-Version-List`, `Sec-CH-UA-Model`, `Sec-CH-UA-Platform`, `Sec-CH-UA-Platform-Version`. `Vary: User-Agent` indicates separate rendering paths for mobile and desktop.

**Key window globals on the homepage:**
- `COOKIE_DOMAIN: "pornhub.com"`
- `phCountryCode: "US"` — geo-detected at the server
- `isLoggedInUser: 0` / `premiumFlag: "0"` — auth state
- `phOrientationSegment: "straight"` — content orientation segment
- `gRecaptchaPublicKey: "6LfyQRoUAAAAAApqS-inJxUwCOtvOHwKxJuZCsuv"` — reCAPTCHA v2
- `token: "MTc3NTQ..."` — CSRF token, rotates per session
- `currentContentTastePreference: "a0f1490a20d0211c997b44bc357e1972deab8ae3"` — SHA1 hash for "straight" orientation preference
- `cacheVersion: "2026040204"` — deploy timestamp used as cache-bust parameter across all asset URLs

---

## Consent Architecture

The consent implementation is geo-aware and structured so that non-EU visitors receive full tracking without explicit action.

The very first push to `window.dataLayer` on every page load:

```json
{"0": "consent", "1": "default", "2": {"ad_storage": "granted", "analytics_storage": "granted"}}
```

This fires before the consent banner renders, before any user interaction. Immediately after, the `cookie-banner-impression-noneu` event is pushed to the dataLayer and sent via `POST /_i`, confirming that the site has detected a non-EU visitor and is applying the geo-based default. The variable `isCookieConsent` is already set to `"granted"` at this point, and `cbConsent` is set to `"3"` — which maps to `cookieConsentValues.all = 3` in the banner's internal value map.

The banner does render (it is a "global cookie banner" per `isGlobalCookieBanner: 1`), but for non-EU visitors it functions as a notification rather than a gate. The `logCookieConsentUrl` endpoint (`/user/log_user_cookie_consent`) only fires on explicit user acceptance — for non-EU visitors that log call never happens because consent is implied.

EU visitors see a full consent banner that gates the tracking initialization. The site is GDPR-compliant for EU visitors by design; the non-EU default is deliberate product behavior.

---

## Cookie Architecture

18 cookies are set on a fresh session load. 10 arrive via HTTP `Set-Cookie` headers before any JavaScript executes — on the raw HTML response:

| Cookie | Expiry | HttpOnly | SameSite | Purpose |
|--------|--------|----------|----------|---------|
| `ua` | 1 day | No | — | User-agent fingerprint hash |
| `platform` | 7 days | No | — | Device type (`pc`) |
| `bs` | 1 year | No | None | Browser session ID |
| `bsdd` | 1 year | No | None | Identical to `bs` (dedup sentinel) |
| `ss` | 1 year | No | — | Session state |
| `sessid` | 1 year | No | — | Session ID |
| `comp_detect-cookies` | 30 days | No | — | A/B component detection (`80001.100000`) |
| `fg_afaf12e314c5419a855ddc0bf120670f` | 30 days | No | — | Feature gate assignment |
| `fg_55e3b6f0afd46366d6fa797544b15af2` | 30 days | No | — | Feature gate assignment |
| `fg_7d31324eedb583147b6dcbea0051c868` | 30 days | No | — | Feature gate assignment |
| `__s` | Session | No | None | Short-lived session token |
| `__l` | 1 year | No | None | Long-lived session token |
| `rp` | Session | Yes | — | Anti-bot / rate-limit token |
| `tj_UUID` | — | No | — | TrafficJunky ad targeting UUID |
| `tj_UUID_v2` | — | No | — | TrafficJunky UUID v2 (base64 protobuf with timestamps) |
| `cookieConsent` | — | No | — | Consent value, set by JS (`1` = all) |
| `_ga` | 2 years | No | — | Google Analytics client ID |
| `_ga_B39RFFWGYY` | 2 years | No | — | GA4 session ID |

Three cookies warrant detail:

**`bs` / `bsdd` (SameSite=None, 1-year expiry):** Both carry `SameSite=None; Secure`, transmittable in cross-origin requests. `bs` and `bsdd` hold identical values — `bsdd` appears to be a deduplication sentinel. Format: `0000000000000000763d792f6d439535` (32-character hex). This pair is the primary cross-site tracking identifier, sent with all ad requests.

**`__s` / `__l` (SameSite=None):** Short-lived and long-lived session pair. Both hold identical values in an observed session: `69D3E040-42FE722901BB3EED67-B7185A`. The `__l` variant has `Max-Age=31556926` (~1 year). Neither is HttpOnly — both readable by JavaScript.

**`rp` (HttpOnly):** Set on the raw HTTP response and re-set by the `/_xd/api/d/jsfp/{hash}` fingerprinting endpoint. Format: `{integer}:{base64}` (e.g., `806706475:45gAz8z74e4=`). This is the anti-bot/rate-limit token — the fingerprinting endpoint submits a client-computed hash and receives this token in return.

**Feature gate cookies (`fg_*`):** Three cookies with UUID-formatted names. Values follow `{integer}.100000`, where the integer is a random assignment within 0–100000, functioning as percentage-based experiment bucketing.

---

## TrafficJunky — The In-House Ad Network

TrafficJunky is Pornhub's own ad network, not a third-party. The internal delivery endpoint is the `/_xa/` subdirectory — disallowed in `robots.txt` as an SEO measure, but fully accessible and handling all ad serving traffic.

**`/_xa/ads?zone_id={id}&site_id=2&preroll_type=json`** — Returns VAST 3.0 XML with `AdSystem: TjDelivery`. No authentication required. The VAST payload includes impression tracking URLs and quartile event tracking (start, firstQuartile, midpoint, thirdQuartile, complete), all routed through `/_xa/deep_preroll`.

**`/_xa/ads_batch`** — Batch ad request endpoint, firing 5–6 times per page load. Context parameters include `context_page_type`, `actor_id`, `video_id`, `timestamp`, `hash`, `session_id`.

**`/_xa/deep_preroll`** — Impression tracking pixel (1x1 GIF). Accepts ad IDs without authentication.

**`/_xa/deep_click`** and **`/_xa/deep_pixel`** — Click-through and impression pixel tracking. Both accept the same base64 protobuf `info=` payload.

**`/_xa/tabinfo`** — Ad click redirect to `trafficjunky.com/report-ad`.

**Anti-adblock detection:** `media.trafficjunky.net/delivery/js/abp/js1.js` contains the entire detection mechanism in one line: `var abp1 = 1;`. If an ad blocker prevents this script from loading, `window.abp1` remains `undefined` and the anti-adblock prompt triggers.

**FingerprintJS:** The TrafficJunky `idsync.min.js` (55KB) bundles open-source FingerprintJS. The source contains the comment `// $ if upgrade to Pro: https://fpjs.dev/pro` confirming the free tier is in use, not FingerprintJS Pro.

**DMP Product ID:** `window.idsync.setProduct(576).send_event()` — product `576` is Pornhub's identifier in the TrafficJunky Data Management Platform. ID sync events go to `sync.atsptp.com` and `sync_events.atsptp.com` (Atlas).

**AdTNG payload encoding:** AdTNG (`a.adtng.com`) receives a base64-encoded protobuf blob in the `infos=` parameter on every ad view call. Decoded content from an observed impression includes: visitor UUID, impression ID, zone ID, campaign ID, country code (`US`), city (`San Francisco`), state (`CA`), ISP (`comcast cable`), connection type (`wifi`), IP address (`73.223.27.123`), zip code (`94123`), browser fingerprint hash, device type (`desktop`). This PII travels to AdTNG on every impression — not just at session initialization.

---

## Tracking Stack

13 distinct tracking systems observed across a standard browsing session:

1. **Google Analytics 4** (`G-B39RFFWGYY`) — pageview and engagement events via `GTM-5M97TMJ`. Also receives events mirrored from the UserClogTracker internal system.

2. **Google Tag Manager** (`GTM-5M97TMJ`) — tag container (422KB full container JS).

3. **TrafficJunky** (`trafficjunky.com`, `trafficjunky.net`) — proprietary ad network with impression, click, and video event tracking. Preconnects to `pix-ht.trafficjunky.net` and `pix-cdn77.trafficjunky.net`.

4. **Atlas / atsptp.com** — conversion tracking and ID sync. `window.atlas` exposes 54+ methods including `joinHit`, `gatewayHit`, `signUp`, `denial`, `conversion`, `exportAtlasData`, `importAtlasData`. Handles affiliate attribution for premium subscription conversions.

5. **AdTNG** (`a.adtng.com`) — ad viewability and impression tracking. Receives full PII protobuf payload per impression.

6. **EroHub** (`adserv.erohub.com`) — adult-specialized ad server.

7. **Etahub** (`etahub.com`) — proprietary video player analytics. Receives: `app_id=10896`, `video_id`, `session_id`, player version, orientation, OS per playback event.

8. **Bongacams** (`bongacams11.com`) — live cam affiliate tracking. Blocked by ORB in modern browsers.

9. **Chaturbate** (`chaturbate.com`) — live cam affiliate. Blocked by ORB.

10. **Stripchat** (`stripchat.com`) — live cam affiliate. Blocked by ORB.

11. **SinParty** (`sinparty.com`) — subscription content affiliate. Blocked by ORB.

12. **FingerprintJS** (open source, bundled in `tj-idsync.js`) — device fingerprinting submitted to `/_xd/api/d/jsfp/{hash}`.

13. **UserClogTracker 2.0.0** — internal event logging (`/_i` endpoint). Tracks event type, origin, `origin_url`, `item_id`, and geo-localization. Includes offline queue support (up to 100 events queued, flushed on reconnect). Mirrors events to GA4 via `dataLayer.push`.

**Content taste tracking:** Three SHA1 hashes are hardcoded as orientation identifiers in the JS bundle. The `currentContentTastePreference` window global holds the active hash (`a0f1490a20d0211c997b44bc357e1972deab8ae3` = straight). Preferences are persisted server-side via `POST /user/setContentPreferenceTastes`.

---

## Public Webmasters API

An unauthenticated public REST API is documented at `https://www.pornhub.com/webmasters/`. All endpoints return JSON. No API key required. No `Access-Control-Allow-Origin` header — accessible via curl from any origin, not callable cross-origin from a browser without a server-side proxy.

**`GET /webmasters/categories`**
Full category taxonomy. Observed 200+ categories with stable numeric IDs. Examples: `{"id":37,"category":"18-25"}`, `{"id":104,"category":"vr"}`, `{"id":83,"category":"transgender"}`. IDs are the cross-reference key used in video metadata and search filtering.

**`GET /webmasters/tags?list={letter}`**
All user-created tags beginning with that letter. Total across the full alphabet: 448,286 tags. The API response includes a literal warning: `"warning":"We had to change the response structure due to high amount of tags"`.

**`GET /webmasters/video_by_id?id={viewkey}&thumbsize=medium`**
Full video metadata by viewkey (the alphanumeric ID from video URLs). Returns: `duration`, `views`, `video_id`, `rating`, `ratings`, `title`, `url`, `publish_date`, `thumbs` (array of 16 stills at specified size), `tags`, `pornstars`, `categories`, `segment`. Example for viewkey `c3dbc9a5d726288d8a4b`: 2.37M views, 87.97 rating, published 2007-12-10, 7 user tags, 1 performer, 7 categories.

**`GET /webmasters/search?search={query}&ordering={order}&period={period}&page={page}&thumbsize=medium`**
Paginated video search, 30 results per page with full metadata including view counts. Ordering options include `mostviewed`, `rating`, `date`. Period filters: `weekly`, `monthly`, `alltime`.

---

## Video Delivery

Video streams are served from `hv-h.phncdn.com` via HLS (MPEG-2 TS segments, AAC audio). MP4 download URLs redirect through `/video/get_media?s={jwt}&v={viewkey}`.

HLS manifest URLs are token-signed with two parameters:
- `h=` — HMAC signature (URL-encoded base64)
- `e=` — Unix timestamp expiry (~1 hour from page load)

Example 480p HLS URL:
```
https://hv-h.phncdn.com/hls/videos/200712/10/65404/200208_2014_480P_2000K_65404.mp4/master.m3u8?h=uC5KnAmkzd%2BIhfCUEFBZ7I24HWY%3D&e=1775496979&f=1
```

No session cookie is checked against video streams — the signed URL is the only access gate. URLs expire after approximately one hour.

**Player flashvars** are embedded as a JavaScript object in the watch page under `flashvars_{video_id}`. Notable fields:
- `isp: "comcast cable"` — visitor's ISP name, server-injected per request
- `geo: "united states"` — visitor country, server-injected
- `hotspots` — array of 37 integers representing per-segment audience retention counts. For video 65404: peak segment has 457,604 views; baseline segments range 4,000–5,400. This engagement heatmap data is in the unauthenticated client-side page object.
- `playbackTracking` — object with `app_id: 10948`, `munged_session_id`, `video_id`, `watch_session`, `sample_size: 100`
- `mediaPriority: "hls"` — HLS preferred over MP4
- `defaultQuality: [720, 480, 240, 1080]` — quality selection order

VAST preroll ads are configured per the `adRollGlobalConfig` array in flashvars. Two slots per video: `startPoint: 0` (preroll) and `startPoint: 100` (postroll). Skip delay: 4 seconds (`skipDelay: 4`), initial render delay: 900–3000ms.

---

## Payment Infrastructure

`GET /pornhubx/init-purchase-flow-data` (no authentication required) returns full subscription configuration:

- **Monthly:** $9.99 USD, single charge, no rebilling
- **Annual:** $99.99 USD, single charge, no rebilling
- **Payment types available:** `ach` (ACH bank transfer) and `cryptocurrency` only
- **Credit card:** absent from `paymentMethods` — zero credit card support
- **Processor:** ProBiller via `mgpg2.probiller.com/api/`
- **Fraud detection:** NuData Security (Mastercard) behavioral analysis

**Accepted cryptocurrencies (26 total):** BTC, ETH, TRX, LTC, DOGE, XRP, BCH, USDC, ETC, ZEC, XMR (Monero), XVG (Verge), DASH, USDTTRC20, SOL, USDTERC20, SHIBBSC (Shiba Inu BEP-20), SHIB (Shiba Inu ERC-20), LINK, HBAR, VET, MANA, CRO, MATIC, NEAR, PEPE.

The absence of credit card payment is a direct consequence of the December 2020 Visa and Mastercard withdrawal. ACH billing descriptor: `WTSeTicket.com 800-975-5616`; crypto charges appear as `Processed By MGPG`.

Promotional state flags are hardcoded into the API response: `eventIsBlackFriday: false`, `eventIsCyberMonday: false`, `valentines: false`. These boolean fields are baked into the server response per deploy rather than configured at runtime, suggesting promotional pricing is code-deployed.

One detail: `showCreditCardModal: true` appears in the response despite no credit card payment type in `paymentMethods` — a ghost UI field or a modal repurposed for a different flow.

---

## Active Experiments & Product Signals

Seven experiment values pushed to the GTM dataLayer on every homepage load:

| Experiment | Value | Signal |
|-----------|-------|--------|
| `signup_experiment_value` | `"all"` | Signup flow experiment |
| `shorties_experiment_version` | `"phase_1"` | Short video feature, phase 1 |
| `shorties_exp_2` | `"B"` | Second shorts experiment, group B |
| `seo_tags_translation` | `"0"` | SEO tag translation disabled |
| `watch_page_exp_value` | `"B"` | Watch page redesign, group B |
| `dd_homepage_restructure` | `"eligible"` | Homepage restructure test |
| `fake_fullscreen_gate` | `"ineligible"` | Fake fullscreen feature, gated |

`shorties_experiment_version: "phase_1"` combined with 5 dedicated sitemaps (`sitemap_g_shorties1-5`) confirms a TikTok-style short-form video format is in active development with an existing content catalog. The service worker previously cached CDN JS and images broadly — those rules are commented out, suggesting a rollback.

The `fake_fullscreen_gate` name indicates a fake-fullscreen UX pattern exists in the codebase but is gated for tested sessions. `holiday_promo_prem: true` and `holiday_promo: true` in `page_params` indicate promotional pricing is currently active.

---

## Security Notes

**robots.txt disallows vs. accessible:** Several endpoints disallowed in `robots.txt` are fully accessible without authentication: `/_xa/*` (ad serving), `/video/ajax_search_related*`, `/video/player_related_datas*`. The disallow is SEO-oriented, not access control.

**`/_xd/api/d/jsfp/{hash}`:** Fingerprinting submission endpoint served via Google CDN. The hash is computed client-side from browser characteristics. Submitting it sets the `rp` HttpOnly cookie (the anti-bot gate token). Returns empty body with 200.

**Signup:** `POST /signup` with email, password, reCAPTCHA v2 (`6LfyQRoUAAAAAApqS-inJxUwCOtvOHwKxJuZCsuv`). Google SSO available. No username required at registration. CSRF token required.

**Notable `robots.txt` bot blocks:** Anthropic-ai, Cohere-ai, Bytespider, Amazonbot, CCBot, DataForSeoBot are explicitly blocked. Twitterbot is explicitly allowed. `/insights/` and `/blog/` are excepted from bot blocks.

---

## Machine Briefing

### Access & Auth

All endpoints below work without authentication. For internal endpoints (`/_xa/`, `/_i`), the `rp` HttpOnly cookie is set on first HTTP response — include it in subsequent requests via a cookie jar. The Webmasters API is the cleanest machine-accessible surface: no cookies, no tokens, curl-ready.

Browser-side `fetch` to these URLs from a different origin is blocked by CORS (no `Access-Control-Allow-Origin` header). Use curl or a server-side proxy.

HLS stream URLs expire approximately 1 hour after the watch page loads. Retrieve fresh tokens from the watch page HTML and extract the `flashvars_{id}` JavaScript object.

### Endpoints

**Webmasters API — open, no auth, no CORS**

```bash
# Category taxonomy with IDs
curl "https://www.pornhub.com/webmasters/categories"

# Full video metadata by viewkey
curl "https://www.pornhub.com/webmasters/video_by_id?id=c3dbc9a5d726288d8a4b&thumbsize=medium"

# Paginated search — 30 results per page
curl "https://www.pornhub.com/webmasters/search?search=blonde&ordering=mostviewed&period=weekly&page=1&thumbsize=medium"

# All tags starting with a letter (responses are large for common letters)
curl "https://www.pornhub.com/webmasters/tags?list=a"
```

**Internal API — no auth, rp cookie recommended**

```bash
# Related videos by internal numeric video ID
curl "https://www.pornhub.com/api/v1/video/player_related_datas?id=65404"

# Subscription pricing + payment methods
curl "https://www.pornhub.com/pornhubx/init-purchase-flow-data"

# Menu HTML (token param optional — ignored on cache hits)
curl "https://www.pornhub.com/front/menu_all_cached?segment=straight"

# VAST 3.0 ad XML — zone_id varies by page context
curl "https://www.pornhub.com/_xa/ads?zone_id=1845481&site_id=2&preroll_type=json"

# Internal event logging (POST, no auth, empty 200 response)
curl -X POST "https://www.pornhub.com/_i?type=event&event=page_view&origin=homepage&origin_url=/"
```

**HLS video streams — token required, ~1 hour expiry**

```bash
# URL pattern — extract h= and e= from watch page flashvars object
curl "https://hv-h.phncdn.com/hls/videos/{YYYYMM}/{DD}/{id}/filename.mp4/master.m3u8?h={hmac_urlencoded}&e={unix_timestamp}&f=1" \
  -H "Referer: https://www.pornhub.com/"
```

### Gotchas

- **HLS token expiry:** The `e=` Unix timestamp expires ~1 hour from page load. Tokens are non-refreshable without re-fetching the watch page. The `h=` value is URL-encoded base64 — URL-decode before using in non-browser contexts.
- **`rp` cookie is HttpOnly:** Cannot be read from JavaScript. Set by the server on initial HTML response and re-set by the `/_xd/` fingerprinting endpoint. Use a cookie jar (`curl -c/-b cookie.jar`) to maintain it across requests.
- **`bs`/`bsdd` are identical:** Both cookies carry the same 32-hex value. Include both in ad endpoint requests for session continuity.
- **Webmasters tags responses:** The `tags?list=` endpoint wraps the array differently from other Webmasters endpoints after a response structure change. Check the `warning` field in the response for current format documentation.
- **`/_i` event logging:** Accepts arbitrary event data via POST with URL-encoded params. Always returns 200 with empty body. The client retries failed sends up to 3 times with exponential backoff (1s, 2s, 3s).
- **VAST zone IDs are context-specific:** The zone IDs in `/_xa/ads` requests encode ad slot type and content context. Observed zone IDs (`1845481`, `2307251`) are tied to specific video pages. Request with arbitrary zone IDs to probe the ad network's zone taxonomy.
- **ProBiller API (`mgpg2.probiller.com/api/`):** Has `Access-Control-Allow-Origin: *` — CORS-open and callable from browser. Requires session-specific tokens from the purchase flow initiation response, not from the init endpoint above.
- **`/front/menu_all_cached` token:** The `token` parameter in the URL appears to be ignored on cache hits — the endpoint returns the same HTML with or without a valid CSRF token.
