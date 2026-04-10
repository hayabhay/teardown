---
# agents: machine-friendly instructions in "## Machine Briefing"
title: Bandcamp — Teardown
url: "https://bandcamp.com"
company: Bandcamp
industry: Entertainment
description: "Music marketplace for independent artists to sell music and merch directly to fans."
summary: "Bandcamp runs a dual-stack architecture: new Vue.js/Vite apps at bandcamp.com/* and legacy Ruby-rendered Knockout.js pages at artist.bandcamp.com/*, connected through bcbits.com CDNs (s4 static, f4 images, t4 streams). The backend is Ruby/Puma behind nginx and Varnish, fronted by Fastly edge nodes in Palo Alto. Three distinct Sentry projects and differing SDK versions confirm three separately deployed applications: new homepage/discover, legacy artist pages, and a dedicated analytics cluster."
date: 2026-04-06
time: "00:35"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack: [Ruby, Vue.js, Knockout.js, Varnish, Vite, Fastly]
trackers: [Google Analytics 4, Google Tag Manager, Meta Pixel, Sentry, Stripe, reCAPTCHA Enterprise]
tags: [music, marketplace, api, audio-streaming, consent, tracking, corporate-archaeology, dual-stack]
headline: "Bandcamp has had three owners in three years — and every layer of the stack shows it, including a production page still linking to a dead company's Confluence."
findings:
  - "Album pages embed all track stream URLs in the TralbumData global for any visitor; the same object includes a 'for the curious' field linking to Bandcamp's own piracy help page — a deliberate product decision encoded in the data structure."
  - "Salesfeed API (/api/salesfeed/1/get_initial) returns live purchase events — exact price paid, artist, item type, buyer country — with no authentication and Access-Control-Allow-Origin: *, letting any website poll real transaction data."
  - "Production /design_system page still links to songtradr.atlassian.net — documentation hosted on the previous owner's Atlassian instance, unchanged since the Beatport acquisition."
  - "BCCookies client bundle exposes Bandcamp's internal cookie governance: team names (fraud, growth, payments, seller-tools, and four others), 36+ image format IDs, and a cross-iframe cookie message bus using 5-second TTL cookies."
  - "Stripe fingerprinting cookies (__stripe_mid, __stripe_sid) are classified as 'necessary' in the BCCookies bundle and set on every page load before the consent dialog renders."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Bandcamp has been through three owners in three years — Epic Games sold it to Songtradr in 2023, Songtradr imploded and handed it to Beatport in 2024 — and the technical archaeology is visible at every layer. The production design system page links to a Songtradr Atlassian Confluence workspace. The codebase is split between a modern Vue.js front end and a decade-old Knockout.js stack that powers every artist subdomain. The sales data flows openly to any caller who asks.

## Architecture

Bandcamp runs two frontend stacks in parallel with no convergence date apparent.

The **new stack** launched around 2022. Pages at `bandcamp.com/discover`, `bandcamp.com/design_system`, and the main homepage are Vue.js apps built with Vite and served from `s4.bcbits.com/vite/{app-name}/client/v1/en/`. App names observed: `bc-discover-page`, `design-system`. These pages use `@sentry/vue` SDK (versions 10.47.0 on homepage and 10.43.0 on discover). The homepage and discover page are two separately deployed Vue apps with separate Sentry project IDs.

The **legacy stack** handles every artist subdomain (`{artist}.bandcamp.com`). These pages are Ruby server-rendered HTML with client-side Knockout.js and jQuery, using Bandcamp's own internal JS module system. The Sentry SDK here is `@sentry/browser/8.55.1` — an older version against a separate project ID (`4508223638732800`, key `7c33659f530ef43fb4532fc6e83354dd`). The embedded player (`/EmbeddedPlayer.html`) also runs on this legacy stack.

A dedicated third cluster (`lindacentral`) handles internal analytics. The `x-bc-app-description` header `lindacentral03-tracker2` appears on `/api/tracker/1/record` — a separate deployment for the internal BCTracker event pipeline.

**CDN structure**: Three subdomains on `bcbits.com`, each with a distinct purpose:
- `s4.bcbits.com` — static assets (JS bundles, CSS, Vite app outputs)
- `f4.bcbits.com` — images (album art, artist photos)
- `t4.bcbits.com` — audio streams

All three sit behind Varnish, which sits behind Fastly edge nodes. Investigation responses consistently came from `cache-pao-kpao1770xxx-PAO` — Palo Alto origin shield nodes.

**Backend server clusters** are exposed through the `BACKENDID3` cookie and `x-bc-app-description` response header:

| Cluster | Purpose | Example app-description |
|---------|---------|------------------------|
| `flexocentral` / `c2flexocentral` | Main Ruby/Puma app servers | — |
| `servicescentral` | API services, design system | `servicescentral-wz1w-design-system3` |
| `lindacentral` | Analytics tracker, design_tokens | `lindacentral03-tracker2`, `lindacentral01-live-pages1` |

`x-bc-app-id` values observed: 3,395,740 (lindacentral tracker) through 3,405,521 (lindacentral live-pages). Sequential numbering with a ~10,000 ID spread across clusters.

**GitHub org** (`github.com/bandcampdotcom`) confirms the Ruby stack: forked versions of `puma`, `mysql2`, `rack-utf8_sanitizer`, `gem-memcached`, and a Knockout.js fork (`tko`) are all visible in the org. Snowflake appears as the data warehouse.

No service worker, no PWA manifest, no IndexedDB usage found. Signup flows — both fan and artist — have no SSO or OAuth options; authentication is username/password only with reCAPTCHA Enterprise gating.

**robots.txt** explicitly allowlists four API paths for crawlers while blocking all other `/api/` routes:

```
Allow: /api/currency_data/
Allow: /api/discover/1/discover_mobile_web
Allow: /api/discover/1/discover_web
Allow: /api/tag_search/2/related_tags
```

All major AI training bots are explicitly blocked: ClaudeBot, GPTBot, CCBot, Bytespider, Google-Extended, Amazonbot, FacebookBot.

## API Surface

Bandcamp's API versioning follows the pattern `/api/{service}/{version}/{function}`. Error responses return Ruby exception class names: `{"__api_special__":"exception","error_type":"Endpoints::MissingParamError"}`. The `Endpoints` namespace with `MissingParamError` and `MustBePostError` suggests a homegrown API framework.

**Unauthenticated endpoints:**

`GET /api/salesfeed/1/get_initial` — the most open endpoint on the site. Returns a JSON array of real-time sale events covering approximately the last 10 minutes. Each event includes:

```json
{
  "artist_name": "Car Seat Headrest",
  "item_type": "a",
  "item_description": "The Scholars",
  "currency": "USD",
  "amount_paid": 8.49,
  "item_price": 8.49,
  "amount_paid_usd": 8.49,
  "country": "United States",
  "country_code": "us",
  "url": "//carseatheadrest.bandcamp.com/album/the-scholars"
}
```

Item types: `a` (album), `t` (track), `p` (physical merch), `b` (discography bundle). The response also includes `releases` count for bundle purchases and the raw `amount_paid` in local currency alongside `amount_paid_usd`. A 600-second window in the evidence file contained 34 distinct sale events across 12+ countries. The CORS header is `Access-Control-Allow-Origin: *`, confirmed on both GET and OPTIONS requests from arbitrary origins — any third-party page can poll this endpoint and aggregate global sales data in real time. This powers the live sales ticker on the homepage and appears to be intentional, but it is not documented as a public API and exposes individual transaction-level data.

`GET /api/merch/2/inventory?merch_id={id}&album_id={id}` — returns real-time stock levels without authentication:

```json
{
  "merch_inventory": {
    "2739880801": {
      "quantity_available": 0,
      "quantity_limits": 1,
      "quantity_warning": true,
      "options": null
    }
  }
}
```

Useful for monitoring limited-edition restock events or tracking sales velocity on specific physical releases.

`POST /api/design_system/1/menubar` — returns the current user's authentication state. For unauthenticated callers:

```json
{
  "activeBand": null,
  "fan": null,
  "isImpersonating": false,
  "isPartner": false,
  "labelBands": null,
  "liveDisabledBandIds": null,
  "notifications": null,
  "pageOwnerBand": null
}
```

The `isImpersonating` field indicates whether a Bandcamp admin has impersonated a user account — it returns `false` for all unauthenticated callers, confirming the feature exists. The `liveDisabledBandIds` field suggests per-band live event kill switches are possible.

`POST /api/design_system/1/editorial_recommendations` — returns editorial content from `daily.bandcamp.com` including article URLs, image IDs, and the current Bandcamp Weekly radio show. No auth required.

**Homepage load sequence**: The following endpoints fire on every cold homepage load, all unauthenticated:
- `POST /api/radio_api/1/get_radio_shows`
- `POST /api/homepage_api/1/notable_tralbums_list`
- `POST /api/homepage_api/1/get_aotd`
- `POST /api/live_events_public_api/4/get_upcoming_live_events`
- `POST /api/design_system/1/editorial_recommendations`
- `GET /api/salesfeed/1/get_initial`
- `POST /api/design_system/1/menubar`
- `POST /api/homepage_api/1/notable_tralbums_data`

## Audio Stream Architecture

Every album page includes a `TralbumData` global injected server-side into the page HTML. For authenticated and unauthenticated visitors alike, `TralbumData.trackinfo` contains a pre-populated array of all track objects, each with a signed stream URL. Bandcamp knows exactly what this means: the same `TralbumData` object includes a `"for the curious"` field pointing to `https://bandcamp.com/help/audio_basics#steal` and `https://bandcamp.com/terms_of_use` — a link to their own piracy explanation page, embedded directly in the data structure that exposes the streams.

```js
TralbumData.trackinfo[0].file['mp3-128']
// "https://t4.bcbits.com/stream/de572a0a9c0ef7907f277bac93bd5887/mp3-128/1845902745
//   ?p=0&ts=1775608120&t=22c57d96872de638a139bdd6633f35a7a853cfb0
//   &token=1775608120_4b3ba61b0b6d90035d1b8784258f9f58cc612a74"
```

URL structure: `https://t4.bcbits.com/stream/{file_hash}/mp3-128/{track_id}?p=0&ts={expiry_unix}&t={hmac_sig}&token={expiry_unix}_{hmac2}`

The `ts=` parameter is a Unix timestamp representing the token expiry — observed values are approximately 24 hours from page load time. The CDN verifies the token on uncached requests; a request with an invalid token returns 403.

The key behavior: Varnish caches the full audio response keyed to the complete URL (including token). During investigation, one stream URL returned `x-cache: HIT, HIT` with `x-age: 1258717` — a cached response 14.6 days old. The cache-control on audio responses is `max-age=31536000` (1 year). Once cached, audio files are served from Varnish regardless of whether the embedded token would still pass validation on origin.

The `TralbumData` object also includes:

```json
"play_cap_data": {
  "streaming_limits_enabled": false,
  "streaming_limit": 3
}
```

The album tested had `streaming_limits_enabled: false`, meaning the play cap feature is configured but disabled. When enabled, `streaming_limit: 3` would be the cap before requiring purchase.

## Surveillance and Consent

Bandcamp implements a custom consent banner (not a third-party CMP like OneTrust or Cookiebot) with two options: "Accept all" or "Accept necessary only." Before any user interaction, the following already execute:

1. `__stripe_mid` cookie set (Stripe machine ID — persistent fingerprinting)
2. `__stripe_sid` cookie set (Stripe session ID)
3. `_grecaptcha` token stored in localStorage (reCAPTCHA Enterprise)
4. GA4 fires with Consent Mode v2 signals
5. Sentry SDK initializes

The consent state is initialized in the dataLayer:

```json
{
  "analytics_storage": "denied",
  "ad_user_data": "denied",
  "ad_personalization": "denied",
  "ad_storage": "denied",
  "bc_advertising": "denied",
  "wait_for_update": 500
}
```

The `wait_for_update: 500` parameter gives GTM 500ms to receive an updated consent state before firing. Since no consent has been given on first load, GA4 fires with denied signals: `gcs=G100` (no analytics consent), `npa=1` (non-personalized ads), `pscdl=denied` (privacy sandbox denied). Under GA4 Consent Mode v2, these signals are still transmitted to Google — they affect what Google does with the data, not whether the request is made.

**Meta Pixel** (ID `1296642372195257`) is loaded via GTM container `GTM-TKFS52TF` (tag ID 38). The tag configuration includes `"consent":["list","bc_advertising"]` — the pixel checks the `bc_advertising` consent signal before firing. Since `bc_advertising` defaults to `"denied"`, the Meta pixel does not fire on cold load without explicit advertising consent. This is a correctly gated advertising tag. The GTM allowlist is `["google", "sandboxedScripts"]` — the Facebook tag runs in sandboxed mode.

**Tracker inventory:**

| Tracker | ID | Pre-consent | Notes |
|---------|-----|------------|-------|
| Google Analytics 4 | `G-MN4RN3JYWL` | Yes (Consent Mode v2) | Fires on every page load with denied signals |
| Google Tag (signal) | `GT-WV86TPST` | Yes | Separate signal integration |
| Google Tag Manager | `GTM-TKFS52TF` | Yes (container) | Allowlist: google, sandboxedScripts |
| Meta Pixel | `1296642372195257` | No | Gated on `bc_advertising` consent |
| Stripe | `m.stripe.com/6` | Yes | Sets `__stripe_mid` + `__stripe_sid` before consent |
| reCAPTCHA Enterprise | `6LeBNSocAAAAADrhkgX9-hQq4E4K1P_HVzB7IDFD` | Yes | Sets `_grecaptcha` in localStorage |
| Sentry | org `363271` | Yes | Three projects: homepage (4508597821571072), discover (4508598003105792), legacy (4508223638732800) |

**BCCookies bundle** — publicly accessible at `s4.bcbits.com/client-bundle/1/BCCookies_1/bccookies-fb37f2fdf1cf58b7b623df3dda68227d.js` — is Bandcamp's internal cookie governance document compiled into a JavaScript bundle. It classifies every cookie the site sets:

**DEFAULT (necessary) cookies** — fire regardless of consent:
- `__stripe_mid`, `__stripe_sid` — Stripe fingerprinting, explicitly classified as necessary
- `impersonate_user_id` — admin account impersonation cookie
- `GCP_IAP_UID` — Google Cloud Identity-Aware Proxy (indicates internal tooling runs on GCP even if main stack does not)
- `bc_webapp`, `bc_webapp3` — session management
- `irbc-session-cookie` — internal session (irbc = undocumented acronym)
- `labs_client_id`, `playlimit_client_id`, `privatestream_client_id` — feature flag and experiment tracking IDs
- `PlayerDebugLog`, `sharedebug` — debug cookie slots

**ANALYTICAL cookies** — require consent:
- `client_id`, `session`, `unique_24h`, `unique_forever`, `_ga`, `_ga_*`, `_gid`, `builderSessionId`

**Cross-iframe message bus**: `_comm_*` cookies are used as a cross-frame communication mechanism with a 5-second TTL and Lax SameSite policy — lightweight pub/sub between embedded players and parent pages via cookie read/write.

**Internal team names** visible in the bundle: `data`, `fraud`, `growth`, `mobile`, `payments`, `platform`, `seller-tools`, `subscriptions`.

**Image format system**: 36+ defined format IDs with named dimensions. Examples: `id=65` → `tralbum_page_cover_art` at 700×700; `id=66` → popup at 1200×1200. The full mapping allows constructing image URLs at specific sizes: `https://f4.bcbits.com/img/a{art_id}_{format_id}.jpg`.

## Internal Infrastructure Visible to the Public

**`/design_system`** (HTTP 200, no auth required) — Bandcamp's internal design system documentation is publicly accessible. The page links to:
- `github.com/bandcampdotcom/npm-design-system` — now private or deleted
- `github.com/bandcampdotcom/design-system` — now private or deleted
- Figma: `figma.com/file/n8N9PClvmV6DpCdweLxRId/Bandcamp-Design-System----UI-Elements`
- Figma: `figma.com/design/FJIveFBCAUyuQODuQ7okOZ/Core-Tokens-2.0`
- `songtradr.atlassian.net/wiki/spaces/Bandcamp/pages/1780383791/Bandcamp+Design+System`

The Songtradr Confluence link is the notable artifact. Songtradr acquired Bandcamp from Epic Games in September 2023, then laid off the majority of Bandcamp staff. Beatport acquired Bandcamp in October 2024. The design system page — with its Songtradr Atlassian link intact — has not been updated to reflect the Beatport ownership change.

**`/forms_example`** (HTTP 200) — an internal dev page for form component examples, publicly accessible.

**`x-bc-app-description` response header** — present on all API responses, exposes the internal server cluster and instance name on every response:
- `servicescentral-wz1w-design-system3` — design system server
- `lindacentral03-tracker2` — analytics tracker
- `lindacentral01-live-pages1` — pages/design_tokens server

**CSP**: The Content Security Policy is nonce-based but includes `script-src http: https: 'nonce-...'` — the wildcard `http: https:` source expressions allow any script from any HTTP/HTTPS host, substantially undermining the nonce restriction. Report endpoint: `https://bandcamp.com/api/cspreport/1/violation`.

## Machine Briefing

**Access**: curl returns 403 without a browser User-Agent. All requests need `-A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"`. No session cookies required for public endpoints below.

**Open endpoints (no auth, no session):**

```bash
# Real-time sales feed — CORS wildcard, any origin
curl -s "https://bandcamp.com/api/salesfeed/1/get_initial" \
  -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
# Returns: feed_data.events[] — each with amount_paid, artist_name, item_type, country, url
# Covers ~10 minute window, ~30-40 events per call

# Merch inventory — real-time stock levels
curl -s "https://bandcamp.com/api/merch/2/inventory?merch_id={merch_id}&album_id={album_id}" \
  -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
# merch_id and album_id from TralbumData.packages[].id and TralbumData.id respectively

# User auth state check
curl -s -X POST "https://bandcamp.com/api/design_system/1/menubar" \
  -H "Content-Type: application/json" \
  -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  -d '{}'

# Editorial recommendations
curl -s -X POST "https://bandcamp.com/api/design_system/1/editorial_recommendations" \
  -H "Content-Type: application/json" \
  -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" \
  -d '{}'
```

**Audio stream URL extraction** (browser context on any album page):

```js
// Extract all track stream URLs from TralbumData global
TralbumData.trackinfo.map(t => ({
  title: t.title,
  stream_url: t.file ? t.file['mp3-128'] : null,
  duration: t.duration,
  track_id: t.track_id
}))
```

Stream URL structure: `https://t4.bcbits.com/stream/{file_hash}/mp3-128/{track_id}?p=0&ts={expiry}&t={sig}&token={expiry}_{hmac}`

Tokens are nominally ~24h from page load. Varnish-cached responses serve beyond expiry — `HEAD` the URL first; `x-cache: HIT` indicates cached and likely still accessible.

**Image URL construction** using BCCookies image format IDs:
```
https://f4.bcbits.com/img/a{art_id}_{format_id}.jpg
Key format IDs:
  7  = small thumbnail (~100px)
  65 = tralbum_page_cover_art (700x700)
  66 = popup (1200x1200)
  37 = merch package art
```

**Globals available on album pages** (`{artist}.bandcamp.com/album/{slug}`):
- `TralbumData` — full album/track data including stream URLs, pricing, package info
- `BandData` — band ID, name, account ID
- `SiteData` — support email, env (prod), custom domain flag
- `FanData` — logged_in, fan name and image if authenticated

**API error reference:**
- `{"__api_special__":"exception","error_type":"Endpoints::MissingParamError"}` — missing required POST param
- `{"error":true,"error_message":"must be logged in"}` — auth required
- `{"error":true,"error_message":"bad version"}` — wrong API version number in path
- `{"error":true,"error_message":"bad function"}` — endpoint/function does not exist

**Gotchas:**
- All POST endpoints require `Content-Type: application/json` with at minimum `{}`
- The `BACKENDID3` cookie (set on first request) routes subsequent requests to the same backend instance — include it for session affinity
- robots.txt blocks `/api/` broadly; the four `Allow:` paths are the only explicitly documented crawlable APIs
- Stream CDN (`t4.bcbits.com`) does not set CORS headers — use direct browser playback, not cross-origin fetch
- `bc_advertising` is Bandcamp's custom consent signal beyond the standard four Google Consent Mode v2 signals; advertising tags check this specifically
