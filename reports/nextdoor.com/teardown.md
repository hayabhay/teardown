---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Nextdoor — Teardown"
url: "https://nextdoor.com"
company: "Nextdoor"
industry: "Information"
description: "Neighborhood social network for local community discussion and classifieds."
summary: "Two rendering stacks on a single domain: a Django/React SPA for authenticated users and a Next.js SSR app for public SEO pages. Backend sits behind CloudFront and Envoy service mesh (istio), with a Go-based tracking server at flask.us.nextdoor.com, an OAuth microservice at auth.nextdoor.com, and a standalone React SPA for the ads platform. GraphQL via Apollo v3.12.5 throughout, state via Recoil, deploys via numbered train builds."
date: "2026-04-14"
time: "05:42"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Django, Next.js, Apollo GraphQL, CloudFront, Envoy, Mapbox, Recoil]
trackers: [Google Analytics, Google Ads, Google Tag Manager, Facebook Pixel, HubSpot, Branch.io, Microsoft UET, FingerprintJS Pro, Datadog, Didomi, Iterate, Nextdoor Pixel]
tags: [social-network, neighborhood, advertising, consent, graphql, feature-flags, surveillance, pre-consent, apollo-cache, django]
headline: "The Didomi consent manager ships with an empty organization ID and is wired to never auto-show -- California users get a consent token assigned on first visit with no prompt."
findings:
  - "The server-side GA4 proxy at measure.nextdoor.com returns 502 on every request -- Nextdoor's first-party analytics infrastructure is broken, and the primary GA4 property silently fails on every page load."
  - "147 feature flags are delivered unauthenticated on the login page, including a date-of-birth collection flag enabled in the backend while the corresponding UI field remains disabled."
  - "Public city pages populate an Apollo cache with more metadata than the UI renders -- author UUIDs, specific neighborhoods, identity verification timestamps, and sequential post IDs in the 470-million range."
  - "GA4 events include a custom parameter called x-fb-ck-fbp that carries Facebook's persistent browser ID, linking both ad platforms to each visitor."
  - "Test pixel initialization code with hardcoded fake user data (nextdoor-test@nextdoor.com, john/Doe, external_id: 123) ships in the production ads.nextdoor.com JavaScript bundle."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Nextdoor is a neighborhood social network operating in 11 countries with a two-stack architecture on a single domain. Authenticated flows run on a Django/React SPA. Public-facing SEO pages -- city hubs, neighborhood directories, individual posts -- run on a Next.js SSR app. Both live at `nextdoor.com` and share the same CDN layer: CloudFront front, Envoy proxy (server header: `istio-envoy`) in the middle, Django backend behind it. Deployment uses a numbered train system -- the production build at time of investigation was `train-28349-adb458e898288c30`.

The ads platform runs as a separate SPA at `ads.nextdoor.com`, served from a different CloudFront distribution (`d3vi5vrrv1t5af.cloudfront.net`). A third subdomain, `flask.us.nextdoor.com`, handles the internal analytics tracking pipeline -- its name is a legacy artifact, the actual server stack appears to be Go/gin based on its response format.

---

## Architecture

**Stack**

The main site is Django (confirmed via `csrftoken` cookie) with React on the frontend. GraphQL via Apollo Client v3.12.5. State management via Recoil (`uses_recoil: true` in globals). The public SEO pages use Next.js -- recognizable from `_next/static/chunks/` script paths and React hydration errors (418, 423) on city pages indicating SSR/CSR mismatches.

Window globals on every page expose the full infrastructure map without authentication:

```
STATIC_CONTENT_HOST: https://d19rpgkrjeba2z.cloudfront.net
SOCKET_URL_HOST: https://sockets.nextdoor.com
RELEASE_TOKEN: train-28349-adb458e898288c30
APP_ENVIRONMENT: production
```

Three separate Mapbox public keys serve different use cases: dynamic maps, static maps, and registration flow (`MAPBOX_PUBLIC_KEY_DYNAMIC_MAPS`, `MAPBOX_PUBLIC_KEY_STATIC_MAPS`, `MAPBOX_PUBLIC_KEY_REGISTRATION`). The keys are functionally scoped -- different tokens for read-only static renders versus interactive map sessions during onboarding.

**Auth microservice**

The `/api/login/` endpoint returns the full auth infrastructure map without credentials:

```json
{
  "auth_data": {
    "auth_service_url": "https://auth.nextdoor.com/v2/token",
    "reset_password_url": "https://auth.nextdoor.com/v2/reset_password",
    "otp_resend_url": "https://auth.nextdoor.com/v2/otp",
    "authorize_url": "https://auth.nextdoor.com/v2/authorize",
    "connect_url": "https://auth.nextdoor.com/v2/connect/configuration/",
    "facebook_app_id": "114611681929998",
    "google_client_id": "1098272140566-11hapqc3ctvrp3e5k2am1a08ph93kc8h.apps.googleusercontent.com"
  },
  "show_phone_number_sign_in": true,
  "tags": {"app_group": "us1", "env": "production", "os": "Other"},
  "country_codes": ["US", "NL", "GB", "DE", "FR", "IT", "ES", "AU", "DK", "SE", "CA"]
}
```

`app_group: us1` implies at least one other regional cluster. Phone number sign-in is enabled globally. Microsoft SSO (`microsoft_sign_in`) is staged in the feature flag system but not yet live.

**Flask tracking server**

`flask.us.nextdoor.com` resolves to a cluster of AWS IPs (`54.71.19.26` and seven others). CORS headers on the server expose the tracking header contract: `device-id`, `device-fp` (device fingerprint), `session-daid`, `token-email-click`, `x-nd-activity-id`, `x-nd-activity-source`. The full internal analytics taxonomy -- 521 named events -- is visible in `window.nd.flaskTrack.idManifest` on every page without authentication. A selection of event names that reveal product internals:

- `LOCAL_GPT_VOTE` -- voting on LLM-generated content (AI feature confirmed live)
- `SNOOZE_PAID_ITEMS` -- users can hide sponsored content
- `GAM_SOCIAL_POST_FAILURE` -- Google Ad Manager social post error tracking
- `AD_PRIVACY_CONSENT_CHANGE_2P` / `AD_PRIVACY_CONSENT_CHANGE_3P` -- separate consent events for first-party vs third-party ad targeting
- `AD_CUSTACT_YES` / `AD_CUSTACT_NO` / `AD_CUSTACT_NOTAPPLICABLE` -- custom action tracking on ad interactions

**Subdomains**

| Subdomain | Purpose | Notes |
|-----------|---------|-------|
| `auth.nextdoor.com` | OAuth2 service | CORS restricted to `nextdoor.com` |
| `flask.us.nextdoor.com` | Tracking ping server | Go/gin backend, not Flask |
| `ads.nextdoor.com` | Ad platform SPA | Separate CloudFront bucket, GTM-KQ8G9ZK |
| `measure.nextdoor.com` | sGTM proxy (GA4) | **502 on all requests** |
| `sockets.nextdoor.com` | WebSocket server | 404 on HTTP root, referenced in globals |
| `us1-photo.nextdoor.com` | Photo CDN | S3-backed, `s3BucketKey: "us1"` |

SSL certificate covers `nextdoor.com`, `*.nextdoor.com`, and `*.us.nextdoor.com`.

**Security headers**

`strict-transport-security: max-age=0` appears on all responses -- HSTS is effectively disabled. Browsers that previously cached an HSTS header will not renew it. Standard security headers are present: `x-frame-options: SAMEORIGIN`, `x-content-type-options: nosniff`, `x-xss-protection: 1; mode=block`, `referrer-policy: strict-origin-when-cross-origin`. No CSP on the main domain (only `frame-ancestors 'self'`).

---

## Surveillance Stack

**Cookies set on first request, before any user interaction**

| Cookie | Purpose | Expiry |
|--------|---------|--------|
| `WE` | Web Experience ID (tracking) | 2 years |
| `DAID` | Device Ad ID | 2 years |
| `csrftoken` | Django CSRF | 1 year |
| `ADID=""` | Clears a prior ad ID cookie | Expired immediately |

`WE` and `DAID` are server-set on the first HTTP response, before the page renders, before JavaScript runs, before any user interaction. Both are scoped to `.nextdoor.com` with `SameSite=Lax; Secure`.

**Full tracker inventory**

After normal browsing without any consent interaction, the following cookies accumulate:

| Cookie | Vendor |
|--------|--------|
| `_ga`, `_ga_HND6C6XLY7`, `_ga_L2ES4MTTT0`, `_ga_10NRJRGGGZ` | Google Analytics (3 GA4 properties) |
| `_gcl_au` | Google Conversion Linker |
| `_fbp` | Facebook Pixel |
| `__hstc`, `hubspotutk`, `__hssrc`, `__hssc` | HubSpot |
| `_uetsid`, `_uetvid` | Microsoft UET (Bing Ads) |
| `_dd_s` | Datadog Browser SDK |
| `ndp_session_id`, `ndp_last_fired_date` | Nextdoor Pixel (NDP) |
| `flaskTrackReferrer` | Nextdoor Flask tracking |
| `didomi_token_cpra` | Didomi CMP |
| `g_state` | Google One Tap |

Three GA4 properties run simultaneously: `G-HND6C6XLY7`, `G-L2ES4MTTT0`, `G-10NRJRGGGZ`. `G-HND6C6XLY7` is the primary property, routed through the sGTM proxy at `measure.nextdoor.com`. `G-L2ES4MTTT0` fires direct to `analytics.google.com` and appears to be a secondary or debug property (`ep.debug_mode=true` observed in payloads).

**Facebook's browser ID in Google Analytics**

Every GA4 event to `measure.nextdoor.com/g/collect` carries the custom event parameter `ep.x-fb-ck-fbp`, populated with the value of the `_fbp` Facebook Pixel cookie -- the persistent browser identifier Facebook sets for cross-site tracking. Directly observed in live request payloads:

```
ep.x-fb-ck-fbp=fb.1.1776144017527.579551663343816931
ep.event_id=1776144335454_177614585284221
```

The same `event_id` value links GA4 events to Facebook Pixel events for cross-platform attribution. Nextdoor's analytics pipeline explicitly passes Facebook's persistent browser identifier to Google as a custom parameter and shares a common event ID between the two platforms to match records. Both platforms see the same `_fbp` value associated with each event -- a deliberate architectural choice that creates a cross-vendor identity link at the analytics layer.

**The broken sGTM proxy**

`measure.nextdoor.com` is a server-side Google Tag Manager (sGTM) CNAME -- a first-party proxy intended to collect analytics server-side, appearing as a same-origin request to avoid ad blockers and improve data accuracy. It resolves to Google's infrastructure (`216.239.x.x`), but every request returns either 502 or `ERR_FAILED`:

```
GET measure.nextdoor.com/g/collect → ERR_FAILED (network error)
GET measure.nextdoor.com/_/service_worker/63b0/sw_iframe.html → 502
```

The primary GA4 property (`G-HND6C6XLY7`) is configured to use this proxy. With the proxy broken, all events from that property fail silently. `G-L2ES4MTTT0` falls back to direct `analytics.google.com` calls and succeeds (204). The service worker iframe that supports GTM offline mode also originates from `measure.nextdoor.com` and fails with the same 502.

**FingerprintJS Pro**

API key `PzDPUUu2jCdbUIQuATfe` fires on page load before any consent interaction. Feature flag `nn_record_recaptcha_user_bot_assessment_on_registration_frontend: treatment` confirms it is active for bot assessment during signup. Combined with two separate reCAPTCHA keys (`RECAPTCHA_SITE_KEY` and `RECAPTCHA_SITE_KEY_BOT_ASSESSMENT`), the bot detection stack runs three separate signal sources at registration.

**HubSpot**

Four HubSpot cookies appear after browsing: `__hstc` (main cross-session tracking), `hubspotutk` (user identity for form submissions), `__hssrc` (new session detection), `__hssc` (session data). HubSpot presence on a consumer social app is unusual -- it likely serves Nextdoor's SMB-facing marketing and ad sales funnel rather than consumer user tracking.

**Branch.io**

`BRANCH_KEY: key_live_club3XDUGY8auziJWkvcWkmgwAeD662U` exposed in window globals. Branch fires on every page load (`/v1/open`, `/v1/pageview`) for mobile deep link attribution.

**Iterate**

`ITERATE_API_KEY` is a JWT issued `2018-05-17`, decoding to `company_id: '5afdff4364a4e0000105e7b8'`. The key has not been rotated in over 8 years of production use. Client-side survey platform tokens are intended to be public, but the age is a data point on how non-sensitive credentials age in production.

---

## Consent Architecture

Nextdoor's consent system uses Didomi, configured so the UI never automatically presents a consent banner.

```json
{
  "on_load_placement": {"consent_action": "", "consent_format": ""},
  "footer_placement": {"consent_action": "on_click", "consent_format": "preferences"},
  "consent_action": "on_click"
}
```

Consent is a preferences modal, not a banner. It appears only when a user explicitly clicks a footer link or privacy settings link. No automatic prompt on page load, on sign-up, or after login (`after_login_placement` is also empty).

For California users: `STATE_FROM_IP: 'CA'`, `didomiGeoRegulations: ['cpra']`. CPRA requires that Nextdoor provide an accessible mechanism to opt out of selling/sharing personal information -- it does not mandate an auto-shown banner. Nextdoor's interpretation satisfies the letter of that requirement (settings accessible via footer) while ensuring most users never encounter the consent interface.

Two misconfiguration issues exist in the production config. First, `nd_organization_user_id: ''` -- an empty string where Nextdoor's Didomi account identifier should be -- causes a console error on every page load: `Didomi - Authorization Parameters configuration: Invalid Organization User Id "undefined"`. The CMP SDK loads but the account linkage is broken. Second, the `didomi_token_cpra` cookie is assigned on first visit with `version: null` -- a Didomi user UUID is created and stored before any consent action has occurred.

Didomi's `user_hash_digest` config is present:
```json
{
  "didomi_secret_id": "proddidom-QGjhdNpP",
  "hash_algorithm": "hash-sha256",
  "hash_digest": "c63a9c20c29ffa1e55d80bed8b1d22300ec6c131d5e15b5068f4b3b6fc2e817f"
}
```
This is a server-side user hash for identity resolution -- Didomi can receive a hashed user identifier from authenticated sessions to persist consent state across devices.

Global Privacy Platform (`use_gpp: true`) is enabled, meaning Nextdoor participates in the IAB's GPP signal framework for programmatic ad consent signaling.

**Ad consent taxonomy**

The internal event taxonomy (via `window.nd.flaskTrack.idManifest`) reveals a two-tier consent system for advertising:
- `AD_PRIVACY_CONSENT_CHANGE_2P` -- first-party ad targeting consent (Nextdoor-internal)
- `AD_PRIVACY_CONSENT_CHANGE_3P` -- third-party advertiser data sharing consent
- `AD_PRIVACY_SETTINGS_CHANGE_2P` / `AD_PRIVACY_SETTINGS_CHANGE_3P` -- corresponding settings events

Users in CPRA states can independently opt out of Nextdoor's own targeting and separately opt out of sharing data with third-party advertisers.

---

## Feature Flags -- 147 Unauthenticated

The GraphQL endpoint `POST /api/gql/LaunchControlExperiments` delivers 147 feature flags to the browser on the login page and public city pages -- no authentication required. The full object lands in `window.unstable__preload_launch_controls`. The variable name itself (`unstable__`) signals these are not considered a stable public API.

**Enabled flags (selected)**

| Flag | State | Signal |
|------|-------|--------|
| `ne_perspectives_v1_5_ui` | treatment | AI "Perspectives" feature, v1.5 UI, live |
| `perspective_attribution_web` | treatment | Attribution tracking for Perspectives live |
| `nn_reg_dob_be` | treatment | **DOB collection enabled in backend** |
| `ng_real_time_events_web_killswitch` | treatment | Real-time notifications killed on web |
| `session_replay_killswitch` | treatment | Session replay is OFF |
| `main_page_rebrand_2025_new_content` | no_video | 2025 rebrand A/B test concluded, video variant lost |
| `seo_city_hood_cta_aggressiveness` | show-on-scroll-up | CTA appears on scroll direction change |
| `lbiz_facebook_webview_modal` | treatment | Facebook WebView login flow active |
| `lp_new_map_style_q425` | v2_1 | New Mapbox style (payload contains style URIs) |
| `nn_replace_invite_code_cta` | treatment | Testing alternative to invite code flow |
| `nn_lof_use_old_login_modal` | treatment | Escape hatch: reverts to old login modal |

**Disabled flags (selected, roadmap signals)**

| Flag | State | Signal |
|------|-------|--------|
| `nn_registration_dob_web` | untreated | **DOB UI field not shown** (backend flag ON) |
| `ads_web_rhr_redesign_2026` | untreated | Right-hand rail ads redesign, 2026, not shipped |
| `feed_ux_vertical_video_optimizations` | untreated | TikTok-style vertical video in feed, staged |
| `2026_locos_templated_posts_web` | untreated | "locos" templated posts, 2026, not live |
| `microsoft_sign_in` | untreated | Microsoft SSO staged but not live |
| `seo_city_photos_and_videos_section` | untreated | Photos/videos section on city pages, not live |
| `web_devtools` | untreated | Internal devtools panel, off in production |
| `ng_real_time_events` | untreated | Real-time events (underlying feature off too) |

**The DOB discrepancy**

Two flags with contradictory states:
- `nn_reg_dob_be: treatment` (enabled) -- the backend is configured to accept and store date of birth during registration
- `nn_registration_dob_web: untreated` (disabled) -- the UI form field does not appear

One plausible reading: DOB is collected via SSO token claims from Google, Apple, or Facebook -- OAuth providers that can include date of birth in their identity tokens when granted permission. The backend flag would enable processing that data when it arrives, while the native UI field remains hidden. This could not be confirmed without completing a registration via SSO.

---

## Public Data Surface

**City and neighborhood pages**

Public city pages (e.g., `/city/san-francisco--ca/`) load without authentication and populate an Apollo client cache containing more data than the UI renders. The Apollo cache object at `window.__APOLLO_CLIENT__.cache.data.data` includes:

- `SeoCity:city_15267` -- San Francisco's sequential city ID is 15267
- Neighborhood IDs in the range `~619757-621076` for the SF area
- City aggregate statistics: `affordabilityScore: 74`, `averageAge: 39`, `averageIncome: $137K`, `friendlinessScore: 85`, `percentageHomeowners: 39%`, `residentsCount: 851,036`
- Section refs for classifieds, local groups, events, neighborhood favorites, safety posts, trending posts, photo/video posts -- all populated in cache even if not all sections render

**Safety and trending posts**

The `safetyPosts` and `trendingPosts` fields in the Apollo cache expose per-post metadata for public posts:

- `authorId` -- UUID (e.g., `a0566f99-13f1-42d1-89e5-89332a719a8c`)
- `authorName` -- truncated: first initial + last name (e.g., `"R. W."`)
- `authorNeighborhood` -- specific neighborhood name (e.g., `"Chinatown"`, `"Hunter's Point"`)
- `verificationDate` -- epoch timestamp of the author's identity verification
- Full post body text
- Reaction counts: LIKE, SAD, WOW, AGREE, THANK

These posts are intentionally public for SEO purposes. What the Apollo cache adds beyond what the UI renders: the `authorId` UUID (enabling consistent cross-post tracking of a user), the `verificationDate` (revealing when an account was verified, likely correlated to SSO join date), and granular reaction counts by type.

**Individual post pages**

On `/p/{post_id}` pages, the Apollo `Post` type cache includes:

- `legacyPostId` -- sequential integer. Values in the `470,000,000+` range suggest approximately 470 million total posts ever created
- `s3BucketKey: "us1"` -- storage region designator
- `s3Path: "post_photos/..."` -- S3 path structure for photo assets
- Photo CDN: `us1-photo.nextdoor.com`
- `AnonymizedAuthor.neighborhood.__ref` -- resolves to the specific neighborhood ID

**Bot access by robots.txt**

The default `*` rule allows only `/link_preview_image/` and `/for_sale_and_free/`. GPTBot gets `Disallow: /` (AI crawlers fully blocked). Twitterbot gets access to `/events/`, `/city/feed/`, `/city/post/`, `/agency/`, `/pages/`, `/link_preview_image/`. Facebook bot can access `/rewind`, `/for_sale_and_free/`, `/p/`, `/g/`, `/faves/`. The robots.txt also disallows `/businesses/`, `/join/`, `/invitation/`, and all unsubscribe paths from all bots.

---

## Infrastructure Details

**ads.nextdoor.com**

A publicly accessible React SPA with its own GTM container (`GTM-KQ8G9ZK`) and a legacy Universal Analytics property `UA-164866260-1` still active. Two observations stand out.

First, the Content Security Policy lists `nextdoor-test.com` as an allowed frame ancestor in production -- a test or staging domain leaking into the production security policy.

Second, the path `/test-nam-pixel` in the production JavaScript bundle contains hardcoded test initialization:

```js
ndp('init','87429417-4f47-4a99-8d32-2080ae007119', {'user_email': 'nextdoor-test@nextdoor.com'});
ndp('track','PAGE_VIEW', {nickname:'test'}, {
  first_name: 'john',
  last_name: 'Doe',
  external_id: 123,
  email: 'test'
});
```

Test pixel code with hardcoded fake user data shipped in the production bundle. The pixel UUID (`87429417-4f47-4a99-8d32-2080ae007119`) and test email exist in production JS.

**Datadog**

Browser SDK key `pube639cf4a2c12a16dcdd67fff636add08` in window globals. Backend responses carry `dd-trace-id` headers on all requests, confirming both browser-side and backend APM are active. The key uses the deprecated `pub` prefix -- the console warning `"Public API Key is deprecated. Please use Client Token instead"` confirms an older integration path.

**HackerOne bug bounty**

`/.well-known/security.txt` references a private HackerOne program at `https://hackerone.com/nextdoor_bbp`. Contact: `security@nextdoor.com`. The program is invite-only.

---

## Machine Briefing

### Access & Auth

Most first-party endpoints require a live browser session (CSRF token + session cookies). `curl` alone is insufficient for authenticated endpoints -- the CSRF token changes per session and must accompany POST requests as both a cookie and header.

Unauthenticated endpoints that work with `curl`:
- `GET /api/login/` -- returns auth infrastructure map, OAuth client IDs
- `GET /api/settings/country_code_urls` -- returns country-to-domain routing table
- `GET /api/settings/countries` and `/api/settings/locales`
- `GET /city/{city}--{state}/` -- public city page (HTML, SSR)
- `GET /p/{post_id}` -- public post page

GraphQL endpoints require a browser session to get past CSRF. Load the page in a headless browser, then use the established session cookies + the `csrftoken` cookie value as the `X-CSRFToken` header for POST requests.

### Endpoints

**Open (no auth)**

```bash
# Auth infrastructure
curl https://nextdoor.com/api/login/

# Country routing
curl https://nextdoor.com/api/settings/country_code_urls

# Public city page (triggers Apollo cache population)
curl https://nextdoor.com/city/san-francisco--ca/

# Individual post
curl https://nextdoor.com/p/{post_id}

# Confirm sGTM is still broken
curl -I https://measure.nextdoor.com/g/collect
```

**Requires browser session (CSRF)**

```bash
# 147 feature flags
POST /api/gql/LaunchControlExperiments
Body: {"operationName":"LaunchControlExperiments","variables":{},"query":"..."}
Headers: X-CSRFToken: {csrftoken}, Cookie: csrftoken={csrftoken}; WE={we}; DAID={daid}

# SEO city data
POST /api/gql/seoNeighborhoodV2
POST /api/gql/seoRankNeighborhoodInCity
POST /api/gql/seoProviderContext

# Exposure logging
POST /api/gql/LogLaunchControlExposures

# Tracking ping
GET /ajax/ping_ndas/

# Pixel (fires 8-18 times per page)
GET /pixel

# Conversion settings
GET /v2/api/conversions/settings
```

**Apollo cache (in-browser)**

After page load, `window.__APOLLO_CLIENT__.cache.data.data` contains the full city/neighborhood/post data for the current page. City IDs use format `SeoCity:city_{id}`. Access via browser console or Playwright `page.evaluate()`.

### Gotchas

- `measure.nextdoor.com` returns 502/ERR_FAILED on all requests. Don't treat this as rate limiting -- the proxy is genuinely broken.
- The service worker iframe at `/_/service_worker/63b0/sw_iframe.html` also returns 502 -- same root cause.
- GraphQL endpoint names match operation names exactly -- `/api/gql/LaunchControlExperiments` accepts `{"operationName":"LaunchControlExperiments",...}`.
- The `WE` and `DAID` cookies are set on the first 200 response, before any JavaScript -- they're server-set, not JS-initialized. Include them in subsequent requests.
- `/join/` requires an invite code -- not a self-serve flow. `nn_replace_invite_code_cta: treatment` suggests they're testing alternatives but the invite requirement persists.
- `window.nd.flaskTrack.idManifest` contains 521 named events -- the full internal analytics taxonomy. Available unauthenticated on every page.
- `window.unstable__preload_launch_controls` is populated unauthenticated on login and city pages. The variable name (`unstable__`) hints it is not considered a stable public API.
- The `_fbp` cookie value appears in GA4 payloads as `ep.x-fb-ck-fbp` even when no explicit Facebook Pixel network request is captured in the session -- the pixel likely initializes via GTM and the cookie persists across sessions.
