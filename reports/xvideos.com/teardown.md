---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "xvideos — Teardown"
url: "https://www.xvideos.com"
company: "xvideos"
industry: Adult
description: "Free adult video platform operated by WGCZ Holding alongside xnxx.com."
summary: "Server-rendered PHP stack with jQuery and a custom xv JS namespace on nginx and CDN77. Video delivery via HLS.js and time-signed CDN URLs. All advertising through ExoClick. Premium tier at xvideos.red; session state shared across xvideos.com, xnxx.com, and xvideos.red via a cross-site cookie endpoint."
date: "2026-04-08"
time: "01:08"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack: [nginx, jQuery, HLS.js, CDN77, RequireJS]
trackers: [ExoClick, New Relic, Cloudflare Insights, FriendlyCaptcha]
tags: [adult, video-streaming, age-verification, gdpr, exoclick, cross-site-tracking, cdn, obfuscation, feature-flags, gambling-ads]
headline: "The session token is set as an HttpOnly cookie, then inlined in a JS config object on every page -- any third-party ad script can read it."
findings:
  - "The 180-day session_token cookie is marked HttpOnly and Secure, but the same token value appears in window.xv.conf.dyn on every page -- ExoClick, New Relic, and any other script on the page can read it directly from the config object."
  - "Every video page embeds a signed direct-download MP4 URL in schema.org VideoObject markup -- indexed by Google, valid for roughly six hours, and playable with no auth or cookies."
  - "The visitor's IP address and country are inlined in window.xv.conf.dyn on every page, readable by every third-party script including the ad network and analytics agents."
  - "The embed frame endpoint serves a full video player with signed CDN URLs and no age gate -- the server explicitly sets show_disclaimer to false for embed requests."
  - "CSP img-src allowlists 17 sports betting and gambling affiliate domains including Melbet and 1xBet variants, confirming gambling ads run alongside adult content through ExoClick."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

xvideos.com is one of the largest adult video platforms on the internet, operated by WGCZ Holding, a Czech company that also runs xnxx.com, xvideos.red (premium tier), xvlivecams.com (live cams), and pornbiz.com (industry blog). The two flagship properties -- xvideos and xnxx -- are the same platform running the same code, not just affiliated sites.

## Architecture

The stack is a server-rendered PHP application, not a single-page app. No React, Vue, Angular, Next.js, or Webpack fingerprint is detectable. The frontend is jQuery plus a custom `xv` JavaScript namespace, with RequireJS handling module loading. HLS.js v1.2.5 handles adaptive bitrate video streaming in the browser.

Web server is nginx. The CDN backbone is CDN77, exposed through the `xvideos-cdn.com` domain family: static assets from `assets-cdn77.xvideos-cdn.com`, MP4 video from `mp4-cdn77.xvideos-cdn.com`, HLS manifests from `hls-cdn77.xvideos-cdn.com`. Asset paths embed version hashes (`/v-b2ca66e434b/v3/js/...`) for cache busting.

The CSP is permissive and serves as a vendor map. It names 40+ third-party domains across ad networks (ExoClick), live cam CDNs (mmcdn.com for MyFreeCams, vscdns.com, vsmvideo.com), age verification (yoti.com, frcapi.com), fraud detection (online-metrix.net, a TransUnion/iovation product), payment (segpay.com), and live chat (1ka.com, including WebSocket `wss://*.1ka.com`). CSP violations report to `https://www.xvideos.com/csp-reports`.

Security headers: `x-frame-options: SAMEORIGIN`, `cross-origin-opener-policy: same-origin-allow-popups`, `referrer-policy: no-referrer-when-downgrade`. No HSTS header observed. The legacy P3P header (`policyref="/p3p.xml", CP="NOI CURa ADMa DEVa TAIa OUR BUS IND UNI COM NAV INT"`) is sent on every response; the referenced `/p3p.xml` returns 404. The CP="NOI" claim -- "no personally identifiable information collected" -- is a boilerplate legacy policy with no practical effect.

`accept-ch` requests an extensive Client Hints list on every response: Viewport-Width, Width, Device-Memory, Sec-CH-UA, Sec-CH-UA-Full-Version-List, Sec-CH-UA-Arch, Sec-CH-UA-Full-Version, Sec-CH-UA-Mobile, Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version, Sec-CH-UA-Model, Sec-CH-UA-Bitness. These feed device targeting in the ad system.

HackerOne bug bounty: `https://hackerone.com/xvideos`, security.txt expires 2026-12-31.

---

## The Configuration Object

Every page -- homepage, video page, category page, registration -- inlines a `window.xv.conf` object server-side before any external scripts load. It is the single source of truth for session state, feature flags, ad configuration, and domain routing.

The top-level `domains` map:

```json
{
  "slave": "https://www.xvideos.com",
  "static": "https://assets-cdn77.xvideos-cdn.com",
  "premium": "https://www.xvideos.red",
  "info": "https://info.xvideos.net",
  "blog": "https://pornbiz.com",
  "stats": "https://www.tjk-njk.com"
}
```

The `stats` domain `www.tjk-njk.com` is deliberately obfuscated. The name has no lexical connection to xvideos or analytics. This is an anti-adblocker technique: filter lists key on domain names, and a domain that doesn't contain "xvideos", "stats", or "analytics" will pass most block lists. The domain is referenced only in `xv.conf.domains.stats`.

The `dyn` sub-object contains session-specific data assembled server-side per request:

- `ip` -- the visitor's IP address, verbatim (e.g., `"73.223.27.123"`)
- `country` -- GeoIP country code (`"US"`)
- `session_token` -- the session token value
- `agv` -- age verification flag, `false`
- `gdpra` -- GDPR applicable, `true` (set for all visitors including US)
- `isPixAllowed` -- tracking pixel permission, `false` pre-consent
- `enafeats` -- enabled feature flags (array of 2-4 letter codes)
- `disfeats` / `frcfeats` -- disabled and forced features (empty arrays for unauthenticated sessions)
- `ads` -- ExoClick ad config
- `ts` -- tracking source abbreviation map
- `login_info` -- authentication state object

The client IP and country in `dyn` are accessible to every script on the page -- including ExoClick's VAST request handler, New Relic's browser agent, and the live cams widget. There is no sandbox preventing third-party scripts from reading `window.xv.conf.dyn.ip`.

The `session_token` value appears in `dyn` on every page, even though the same token is also set as an HttpOnly cookie (`session_token` cookie, 180-day TTL, `domain=.xvideos.com; secure; HttpOnly`). The HttpOnly flag is meant to prevent JavaScript from reading the cookie -- but the token is also in the JS config, so the protection is moot. Any script that can read `window.xv.conf.dyn.session_token` has the session token. This includes ExoClick, New Relic, and any other third-party script running on the page.

---

## Age Verification

The age gate on xvideos.com is a single page with an "I am 18 or older -- Enter" button. Clicking it sets one cookie: `dscld=true` (presumably "disclaimed"). That is the extent of the verification.

The server configuration confirms this. `window.xv.conf.dyn.agv` is `false` -- age verification disabled. `login_info.isAgeVerified` is `false` -- the server has not verified the session's age. These are not missing keys; they are explicit false values present for every unauthenticated session.

Yoti (`*.yoti.com`) is listed in the CSP's `default-src` -- Yoti is a digital identity and age estimation provider. The infrastructure is deployed but not active for standard sessions. The `agv` flag suggests it may be enabled for specific markets or user classes, but it does not run for a default US visitor.

The embed frame endpoint (`/embedframe/{encoded_id}`) requires neither the `dscld` cookie nor any session. A direct GET to the embed URL returns a full video player page. The config object in the embed frame response contains `"show_disclaimer": false` and `"action": "embed"` -- the server explicitly sets the disclaimer flag to false for embed requests. The embed page includes signed CDN URLs for direct MP4 playback.

For content creators, a separate verification path exists. JavaScript bundles reference upload endpoints for performer verification documents:
- `/account/models/model-file/consent-form/`
- `/account/models/model-file/id-document/`
- `/account/models/upload-model-file/consent-form/`
- `/account/models/upload-model-file/id-document/`

These require authentication. The visitor age verification path (`agv`) and the creator verification path are architecturally separate.

---

## Video Architecture and Telemetry

### URL Structure and Identifiers

Video URLs follow the pattern `/video.{encoded_id}/{numeric_id}/{uploader_id}/{slug}`. The `encoded_id` is a short hash (e.g., `ootmoid0e61`); the `numeric_id` is sequential (e.g., `89158957`). Both appear in API calls -- the encoded ID in player state, the numeric ID in telemetry payloads and structured data.

### Signed CDN URLs in Structured Data

Every video page emits a schema.org `VideoObject` in its `<head>` with a `contentUrl` pointing to a signed MP4:

```
https://mp4-cdn77.xvideos-cdn.com/{uuid}/3/mp4_sd.mp4?secure={token},{unix_timestamp}
```

The `secure` parameter is a time-limited HMAC token. Based on the embedded Unix timestamp, the token is valid for approximately 6 hours. This URL is present in the page's structured data markup, meaning it is crawled and indexed by Google (among others) via `<script type="application/ld+json">`. A fresh search engine crawl of a video page yields a valid, directly playable MP4 URL.

The `window.html5player` object contains the full set of signed URLs for the active session:
- `sUrlLow` / `sUrlHigh` -- SD and HD MP4 signed URLs
- `sUrlHls` -- signed HLS manifest URL
- `encoded_id_video`, `id_video`, `id_cdn`, `id_cdn_hls` -- identifiers for each CDN node serving the content

### Server Diagnostic Comment

Video page HTML includes an embedded diagnostic comment:

```html
<!-- dispo - Wed, 08 Apr 26 20:55:24 +0000 Loaded ! Video exists and loaded. Video exists and OK. -->
```

"dispo" is shorthand for content disposition or availability check. The comment includes a UTC timestamp and a two-stage availability confirmation. This is server-side debug output left in production -- it reveals that the platform runs a content availability check on page render and logs the result in the HTML output.

---

## Ad Infrastructure

ExoClick is the sole ad network. All ad requests route through ExoClick domains. The ad configuration is present in `xv.conf.dyn.ads`:

```json
{
  "site": "xvideos",
  "categories": "",
  "keywords": "levi solen,levi,solen,...,cumshot,cum,interracial,...",
  "tracker": "xvideos89158957",
  "exo_tracker": 456362007,
  "is_channel": 1,
  "banners": [
    {"type": "footer", "div_id": "ad-footer"},
    {"type": "playersiderectangle", "div_id": "video-right"},
    {"type": "interstitialfull"},
    {"type": "native"}
  ]
}
```

The `keywords` field contains all video tags and channel metadata -- the same keywords passed to ExoClick VAST requests for content targeting. The `tracker` field is `"xvideos" + video_id`, creating a per-video tracker ID. `exo_tracker` (456362007) is the ExoClick zone ID; `exo_tracker_sub2` in VAST requests is set to the video's numeric ID.

VAST ads are fetched from `s.orbsrv.com/v1/vast.php`. The request includes the GDPR consent string as a query parameter (`gdpr_consent=BQiZa1yQiZa1yABABBENDgwAAAA-WABAfKA`). ExoClick VAST requests fire on video page load without waiting for user consent interaction -- the consent string is passed with the request, but the ad request itself is not gated on consent.

An ad capping manager runs at `/capping-manager/i/c`, returning `{"result":true,"code":0,"data":{"allow_display":true}}` -- controls how frequently a given user sees ads.

### Live Cams Integration

The live cams system layers multiple domains. `www.xvlivecams.com` handles the widget and impression tracking:
- `POST /whitelabels/record_raw_hit/` -- raw visit tracking
- `POST /fossil/i/` -- impression pixel
- Cloudflare challenge platform active on its CDN (`/cdn-cgi/challenge-platform/h/b/jsd/...`)

`go.xlivrdr.com` serves live cam model ads via VAST (`GET /api/models/vast/`). The request includes a `userId` parameter -- a 64-character hex hash -- and `affiliateClickId`, tying ad interactions to a persistent user identity across sessions. The `sourceId=3761585` is an ExoClick zone identifier.

### Gambling and Betting in the Ad Allowlist

The CSP `img-src` directive explicitly allows redirect chains to sports betting and gambling sites. Named domains include:

- `melbet-ma.com`, `melbetegypt.com`, `1xlite-815256.bar` -- sports betting affiliates
- `betoholictrack.net`, `refpa2518.com`, `refpa3665.com` -- affiliate tracker domains
- `xenoly7.com`, `miraco7.com`, `clariva5.com`, `miraex6.com`, `go2fridayroll.com`, `solvix8.com`, `linktoliraspin.com`, `clyoro7.com`, `volexa5.com`, `dynara3.com`, `veltor2.com` -- obfuscated ad redirect intermediaries

These are allowlisted in `img-src`, indicating they appear as tracking pixels or redirect destinations in ad creative. ExoClick's network includes gambling advertisers; the allowlist confirms these ad categories run on xvideos.

---

## Surveillance and Tracking Stack

### Cookies

Set on homepage load (before age gate):
- `cit` -- 7-day tracking ID, `domain=.xvideos.com`, no HttpOnly flag (readable by JS), no Secure flag on initial 301 redirect
- `session_token` -- 180-day session token, `domain=.xvideos.com; secure; HttpOnly`

Set after age gate click:
- `dscld=true` -- age gate confirmation
- `session_ath=light` -- authentication state: unauthenticated

Set after video page visit:
- `__suvt` -- analytics tracking token
- `__nuvt` -- second analytics tracking token appearing post-video-page
- `last_views` -- array of viewed video IDs with view timestamps: `["89158957-1775695805"]`. No HttpOnly flag -- readable by JS.

The `last_views` cookie is a browsing history log stored client-side with no access control beyond same-origin policy. Since `domain=.xvideos.com`, it is sent to all xvideos.com subdomains.

### TCF and Consent

`window.__tcfapi` is present (TCF v2). `gdpra: true` is set for all visitors regardless of geography -- a US visitor with a US IP gets the same GDPR consent logic as a European visitor. `isPixAllowed: false` before consent interaction. ExoClick ad requests fire regardless (see Ad Infrastructure).

### Feature Flags

The `enafeats` array contains 20 feature codes for an unauthenticated US session:

```
["vv","vvi","cf","ca","pp","op","s","scr","vil","w","mcv","ch","cca","cn","g","fc","ui","at","pv","ga"]
```

The `ts` (tracking source) object maps abbreviated codes to their full names, providing a partial decoder ring:

| Code | Expansion |
|------|-----------|
| pofsp | premium_on_free_search_ppv |
| pofsm | premium_on_free_search_membership |
| pofss | premium_on_free_search_premium |
| fvt1/2/3 | full_video_on_trailer1/2/3 |
| fvtm1/2/3 | full_video_on_trailer_mobile1/2/3 |
| fvtp | full_video_on_trailer_player |
| fvtecp | full_video_on_trailer_player_end_cta |
| gfps | global_feed_premium_sub |
| pfps | profile_feed_premium_sub |
| pt | profile_tab |
| ct | channels_tab |
| hmct | head_mob_chans_tab |
| lmct | left_menu_chans_tab |
| mct | menu_chans_tab |
| qp | quickies_profile |
| qs | quickies_search |
| pofs | premium_on_free_search |

`disfeats` and `frcfeats` are both empty for this session -- nothing disabled, nothing forced.

### New Relic Browser Agent

New Relic runs on video pages via `nwr.mmcdn.com` -- MyFreeCams CDN is the host, not New Relic's own domain, another layer of obfuscation. License key: `6f524845d1`. Posts to:
- `POST /1/6f524845d1` -- metrics
- `POST /events/1/6f524845d1` -- events (3+ per page load)
- `POST /jserrors/1/6f524845d1` -- JavaScript errors (2+ per page load)
- `POST /ins/1/6f524845d1` -- insights

### localStorage

`thumbloadstats_vthumbs` tracks thumbnail loading performance: CDN server IDs and load durations in milliseconds, used internally for CDN health monitoring.

---

## Cross-Platform Architecture

xnxx.com is not merely affiliated with xvideos -- it runs identical infrastructure. Same nginx response headers, same P3P policy header, same `cit`/`session_token` cookie structure, same CSP pointing to `tjk-njk.com`, same ExoClick ad stack. WGCZ Holding operates both as a single platform.

`GET /cross_site_cookies` -- without session cookies returns `{"result":true,"code":0}`. With session cookies, this endpoint returns the user's `session_token` and `last_views` in JSON. The endpoint is designed to share session state across xvideos.com, xnxx.com, and xvideos.red, allowing a user logged into one property to be recognized on another.

The full WGCZ property map:
- `www.xvideos.com` -- primary free platform
- `www.xnxx.com` -- second free platform, same codebase
- `www.xvideos.red` -- premium subscription tier
- `www.xvlivecams.com` -- live cams property
- `pornbiz.com` -- industry blog
- `info.xvideos.net` -- legal, ToS, parents page
- `www.tjk-njk.com` -- obfuscated analytics endpoint

All subdomains of xvideos.com (api, admin, staging, dev, beta, m, img, stats, data, search, accounts, billing) return 301 redirects to www. Wildcard certificate on `*.xvideos.com`. No exposed services on non-www subdomains.

---

## Registration and Authentication

Registration requires email, profile_name, password, ToS acceptance, and a FriendlyCaptcha solution. Optional: profile photo, newsletter opt-in. SSO available via Google OAuth and X/Twitter OAuth.

FriendlyCaptcha widget uses `data-start:none` -- the puzzle does not auto-start on page load, reducing friction but also meaning a captcha solution may not be computed until form submission. The captcha pings `global.frcapi.com/api/v2/captcha/ping` 6 times during a registration page session.

Form posts to `POST /account/create` with `signup-form[email]`, `signup-form[profile_name]`, `signup-form[password]` field naming. No email verification step was confirmed in the registration flow.

`GET /account` and `GET /account/create` are the only paths disallowed in robots.txt alongside `/video-vote/`. Everything else -- including category pages, channel indexes, pornstar profiles, and API endpoints -- is open to crawling.

The AI-generated content category `/c/AI-239` is indexed in `sitemap_main.xml` and has a dedicated sitemap entry. The ad keywords associated with this category: `ai, artificial, intelligence, generated, artificielle, midjourney, chatgpt, aiporn, aigenerated, stablediffusion, artificialintelligence`.

---

## Machine Briefing

### Access and Auth

No cookies or session required for most read operations. The homepage and video pages render fully server-side with curl or any HTTP client. The age gate is a `dscld=true` cookie -- add it to bypass the disclaimer page:

```bash
curl -b "dscld=true" "https://www.xvideos.com/"
```

Search (`/search?k=...`) returns no content for non-browser user agents -- requires JavaScript execution to render results. Use a headless browser or browse category/tag pages instead.

The embed frame endpoint serves full video players with signed CDN URLs, requiring no cookies:

```bash
curl "https://www.xvideos.com/embedframe/{encoded_id}"
```

### Endpoints

**Open (no auth, no cookies):**

```bash
# Robots and sitemap
GET https://www.xvideos.com/robots.txt
GET https://www.xvideos.com/sitemap_index.xml
GET https://www.xvideos.com/sitemap_main.xml

# Category browsing
GET https://www.xvideos.com/c/{Category-Name}-{id}
# Example: /c/AI-239 for AI-generated content

# Video page (age gate bypass with cookie)
GET https://www.xvideos.com/video.{encoded_id}/{numeric_id}/{uploader_id}/{slug}
-b "dscld=true"

# Embed player (no age gate, no cookies needed)
GET https://www.xvideos.com/embedframe/{encoded_id}

# Cross-site session state (returns session token and view history if cookies present)
GET https://www.xvideos.com/cross_site_cookies

# Ad capping manager
GET https://www.xvideos.com/capping-manager/i/c

# Currency list (100+ currencies)
GET https://www.xvideos.com/change-currency/{CODE}

# i18n strings
GET https://assets-cdn77.xvideos-cdn.com/v-{version_hash}/v3/js/i18n/front/english.json
```

**Telemetry endpoints (accept unauthenticated writes):**

```bash
# HLS loaded confirmation
GET https://www.xvideos.com/html5player/hls_loaded/{encoded_id}/{cdn_id}/

# Buffer stats
GET https://www.xvideos.com/html5player/hls_buffer_duration/{encoded_id}/{cdn_id}/{bytes}

# Playback duration (base64-encoded JSON payload)
GET https://www.xvideos.com/html5player/play_duration/{base64_payload}
# Payload structure (before base64 encoding):
# {"video_id":"89158957","cdn_id":"21","duration":0,"referer":"","type":"hls","quality":2,"transfer":8544412,"buffer_sec":30,"ap_sound":1}

# Thumbnail CDN performance telemetry
POST https://www.xvideos.com/picserror/{cdn_id}-{load_ms}-{err_flag}_{cdn_id2}-{load_ms2}-{err_flag2}/-/{2}

# Age gate disclaimer tracking
POST https://www.xvideos.com/metrics/disclaimer/show
```

**Signed CDN URLs (extracted from video page or embed frame):**

```bash
# From schema.org VideoObject (structured data) or window.html5player:
GET https://mp4-cdn77.xvideos-cdn.com/{uuid}/3/mp4_sd.mp4?secure={token},{unix_timestamp}
GET https://hls-cdn77.xvideos-cdn.com/{path}/hls.m3u8?secure={token},{unix_timestamp}
```

### Gotchas

- **Signed URL TTL**: MP4 and HLS URLs expire in approximately 6 hours based on the embedded Unix timestamp. Extract a fresh URL from a video page or embed frame for each session.
- **Encoded IDs vs numeric IDs**: Telemetry endpoints use encoded IDs; structured data and `xv.conf.dyn.id` use numeric IDs. Both refer to the same video but are not interchangeable across endpoints.
- **Search requires JS**: `GET /search?k=...` returns no useful content without JavaScript execution. Use category pages or the sitemap for structured discovery.
- **CORS lockdown**: No `Access-Control-Allow-Origin` on any first-party endpoint. Cross-origin fetch from a browser will fail.
- **`window.xv.conf` is the config source of truth**: All session parameters (feature flags, ad config, token, IP) are in this object on every server-rendered page. Parse it from the HTML response to understand a session's state without additional API calls.
- **CDN version hashes**: Static asset URLs include version hashes in the path (e.g., `/v-b2ca66e434b/`). These change on deploys. Scrape the current hash from a live page response rather than hardcoding.
- **xnxx.com shares session state**: `/cross_site_cookies` works across xvideos.com and xnxx.com. A `session_token` cookie set by one domain is honored by the other.
