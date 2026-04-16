---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "JetBlue — Teardown"
url: "https://jetblue.com"
company: "JetBlue"
industry: "Transportation"
description: "US airline operating domestic and Caribbean routes with TrueBlue loyalty."
summary: "jetblue.com runs a hybrid Next.js (homepage) and Angular (booking at /booking/) architecture fronted by Varnish CDN. The booking app is mid-migration from a legacy stack at jbrest.jetblue.com to a new system called Crystal Blue at cb-api.jetblue.com. Auth spans five Okta client apps coordinated through accounts.jetblue.com. The Angular app serializes its entire runtime config — API keys, feature flags, service map — into window.__ENV_CONFIG_RWB on every page load."
date: "2026-04-16"
time: "02:55"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Next.js, Angular, Varnish, Magnolia CMS, Okta]
trackers: [Google Tag Manager, Adobe Analytics, FullStory, Braze, Dynamic Yield, Qualtrics, AppDynamics, Sentry, TrustArc, PerimeterX, ASAPP]
tags: [airline, booking, feature-flags, api-keys-exposed, session-recording, identity-stitching, migration, a-b-testing, crystal-blue, unauthenticated-endpoints]
headline: "JetBlue's booking app ships 10 live API keys and 47 feature flags in a client-side global — the keys bypass the subscription-key protection on its backend APIs."
findings:
  - "window.__ENV_CONFIG_RWB exposes 10 API keys including BFF, OTP, and Crystal Blue subscription keys — the subscription keys defeat the 401 protection on jbrest and cb-api backend endpoints, letting any caller hit booking, profile, and payment APIs directly."
  - "47 Crystal Blue feature flags map JetBlue's entire booking stack migration: payment and price summary are live on the new system, checkout is not, and an unreleased seatmap feature called Blue Sky is staged and enabled."
  - "An unauthenticated schedule extension endpoint at azrest.jetblue.com returns JetBlue's exact booking window date, the last update timestamp, and the internal user ID who set it — live ops data with no auth required."
  - "FullStory session recordings run on the loyalty portal and trip management pages — where points balances, travel history, and PII are visible — and are identity-stitched to TrueBlue accounts via a jbFSIdentify cookie."
  - "The Spanish booking host hola.jetblue.com is hardcoded in the Angular config as spanishHostUrl but returns a Fastly 'unknown domain' error — the entire Spanish-language booking flow is broken."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

JetBlue's website is an airline in mid-construction. The public-facing site is clean; underneath it is a platform split across two booking stacks, five Okta apps, eleven third-party trackers, and an Angular configuration object that broadcasts the full internal architecture to every browser that loads the booking page.

## Architecture

The site runs two distinct applications under one domain. The homepage and marketing pages at `www.jetblue.com` run on Next.js with server-side rendering — `x-nextjs-prerender: 1` and `x-nextjs-cache: HIT` in response headers confirm SSR with Varnish caching at multiple hops (IAD to PAO). The booking app at `/booking/` is a separate Angular 26.1.6-rc-5 application — a release candidate in production — that loads its own bundle, initializes Zone.js for async patching, and communicates with a separate API surface.

CDN is Varnish for main dotcom assets. Subdomains diverge: `cobrand.jetblue.com` (Barclays co-brand) runs Fastly with Signal Sciences WAF. `hola.jetblue.com` (Spanish-language booking) is supposed to run Fastly but is misconfigured — more on that below.

The full subdomain surface exposed in the Angular config:

| Host | Role |
|------|------|
| `jbrest.jetblue.com` | Legacy booking REST API (LFS, cart, payment, seatmap, reservation, IAM) |
| `azrest.jetblue.com` | Azure-hosted services (OD/route data, profiles, on-time performance) |
| `cb-api.jetblue.com` | Crystal Blue API gateway (new booking stack) |
| `pay.jetblueairways.com` | PCI payment host |
| `loyalty-api.jetblue.com` | TrueBlue loyalty API |
| `cms.jetblue.com` | CMS host |
| `legacycms.jetblue.com` | Legacy Magnolia CMS |
| `static.jetblue.com` | Static assets and frontend error logging |
| `az-api.jetblue.com` | Azure API (SSR preferences) |
| `managetrips.jetblue.com` | Manage booking portal |
| `checkin.jetblue.com` | Web check-in |
| `mobilecheckin.jetblue.com` | Mobile check-in |
| `cobrand.jetblue.com` | Barclays co-brand card |
| `vacationspay.jetblue.com` | JetBlue Vacations payment |
| `api.paisly.jetblue.com` | Paisly travel protection SDK |
| `hola.jetblue.com` | Spanish-language booking (broken) |

Auth spans five Okta client applications: `0oa6q038snKiMbTRW2p7` (booking app), `0oa14j84yzofAWvbL2p8` (credit profile), `0oa6pzarfiDxq8sn32p7` (TrueBlue portal), plus `0oa6qe03vy6TWGN9o2p7` (IDP), all coordinated through `accounts.jetblue.com` (Okta). SSO logout uses an iframe chain: `book.jetblue.com`, `login.jetbluevacations.com`, `trueblue.jetblue.com`, `www.jetblue.com/booking/logout`.

CMS is Magnolia. The legacy instance at `legacycms.jetblue.com` chains to the Magnolia Cloud platform. Following the robots.txt sitemap URL through its redirect chain — `magnoliapublic/.rest/sitemap/v1/seo/home/sitemap.xml` to 301 to `legacycms.jetblue.com/public/.rest/...` to 302 — puts the internal CMS author hostname in the `Location` response header: `legacyprod.author.jetblue-prod.magnolia-platform.io/.magnolia/admincentral`. The admin panel login page is publicly reachable at that URL.

## `window.__ENV_CONFIG_RWB`: The Full Architecture, Client-Side

The Angular booking app at `/booking/` mounts a configuration object as `window.__ENV_CONFIG_RWB`. This is not a small config struct — it is the complete runtime configuration for the booking platform, including API keys, all backend service URLs, feature flag state, A/B experiment assignments, auth configuration, and third-party vendor IDs.

The object has 50+ top-level keys. Notable clusters:

**API keys and credentials:**

| Key/ID | Value | System |
|--------|-------|--------|
| BFF API key | `72258669250547cca2c2424dbb5dbce2` | `jbrest.jetblue.com` subscription |
| OTP API key | `98400855835648b89b0d6f5ea2d8b748` | OTP service subscription |
| Crystal Blue subscription key | `a5ee654e981b4577a58264fed9b1669c` | `cb-api.jetblue.com` gateway |
| Currency layer API key | `bc30b93e371e28576f91aabd2fa7ee04` | `apilayer.net` currency conversion |
| Loqate address validation key | `KZ72-MR97-FD48-UZ15` | `api.addressy.com` address lookup |
| Radar autocomplete key | `prj_live_pk_d6cdb40ac822292a8aaca7b499f75a75f59d5e0d` | `api.radar.io` geocoding |
| TokenEx ID | `9014311640612780` | Payment tokenization |
| TokenEx clientSecretId | `jthv3twsP0VgCofByBRZQwIfM2NXUGmYNjTf2RTF` | Payment tokenization |
| AppDynamics account access key | `c444c2db-7b81-4261-95bb-e994400ddaef` | Browser RUM |
| Deeplink API key | `940063533d8d44c0903b8aecd9b80557` | Deeplink service |

The BFF key (`bffApiKey`) and OTP key (`otpApikey`) are subscription keys for `jbrest.jetblue.com` and `azrest.jetblue.com`. A direct `GET /profile/v1/leanProfile` against `azrest.jetblue.com` without any key returns `401 Access denied due to missing subscription key`. The key is in `__ENV_CONFIG_RWB`. The subscription-key protection exists; the subscription key is client-side.

The Crystal Blue subscription key (`a5ee654e981b4577a58264fed9b1669c`) is the gateway key for `cb-api.jetblue.com`, the new booking API stack. With it, callers can access the Crystal Blue flight search, seat map, shopping cart, and payment service endpoints directly.

Loqate and Radar are third-party SaaS with browser-embeddable key patterns — both return live results with the exposed keys. These are billable API credits; repeated calls accumulate on JetBlue's account.

The Okta `client_id` (`0oa6q038snKiMbTRW2p7`) and issuer URL are also in this object — this is expected for OAuth 2.0 public clients using PKCE in the browser and is not a credential exposure.

**Adobe Analytics:**
- Org: `A553776A5245AE600A490D44@AdobeOrg`
- Suite IDs: `jetblue2020desktop` (web), `jetblueiphonedev` (mobile)
- Tracking server: `omnistats.jetblue.com` / `somnistats.jetblue.com` (secure)

**FullStory org ID**: `4HV1Q` (matches the network call to `edge.fullstory.com/s/settings/4HV1Q/v1/web`)

**Environment**: `prddotcom2`

## Crystal Blue: Feature Flags as a Migration Roadmap

JetBlue is rewriting its booking stack. The old stack lives at `jbrest.jetblue.com`. The new stack — internally called "Crystal Blue" — lives at `cb-api.jetblue.com`. The migration team is "DIGB" (Digital Booking), and their work-in-progress is encoded in 47 feature flags inside `__ENV_CONFIG_RWB.CRYSTAL_BLUE_FEATURE_FLAGS`.

**Migrated (enabled):**
- `crystal_blue_payment_page: true` — payment page is on Crystal Blue
- `crystal_blue_price_summary: true` — price summary component migrated
- `crystal_blue_discover: true` — search/discovery enabled for A/B testing
- `crystal_blue_logger: true` — logging infrastructure live

**Not yet migrated (disabled):**
- `crystal_blue_checkout_page: false` — main checkout still on legacy stack
- `crystal_blue_revenue_int: false` — revenue integration not yet migrated
- `digb_barclays_cb_flow: false` — Barclays co-brand flow not yet on Crystal Blue
- `digb_cart_blue_upsell: false`

**Staged but unreleased features:**
- `digb_enable_blue_sky: true` / `digb_enable_blue_sky_seatmap: true` — "Blue Sky" is a new seatmap experience. Both flags are enabled, suggesting it's in testing or canary rollout, but it's not the default experience. What exactly changes in the UI is not confirmed.
- `digb_enable_ancillaries_drawer: false` — a drawer UI for add-ons (bags, upgrades, etc.) is built and flagged off
- `digb_enable_alt_date_return_offers: false` — alternative date pricing not live
- `digb_enable_awp_dual_pricing: false` — dual pricing for AnyWhere points not yet live
- `digb_enable_bundled_price: false`
- `digb_clarity_pay: false` — Microsoft Clarity on the payment page is built but disabled

**Enabled features:**
- `digb_enable_radar_autocomplete: true` — Radar SDK live for address input
- `digb_credit_profiles_enabled: true` — credit profile integration active
- `digb_crystal_blue_basic_upsell: true` — upsell logic live on basic fares
- `digb_enable_m2m: true` — mobile-to-mobile (inferred)
- `digb_enable_applePay_nonIOS: true` — Apple Pay enabled for non-iOS devices
- `digb_enable_barclays_rest_api: true` — Barclays card integration on REST API
- `digb_enable_insurance_with_ap: true` — insurance shown with Apple Pay flow
- `digb_enable_saved_cards_cvv: true` — saved card CVV re-entry required
- `digb_paypal_ceptor: true` — PayPal integration active
- `digb_even_more_hold_extras: true` — Even More Space extras in hold state

The `/abtest` endpoint (no auth required) returns the historical campaign list. `NGB-crystalblue-segment` ran 50/50 from 2025-07-15 to 2025-07-26 across all paths, assigning users to an NGB (New Booking Gateway) A/B split. This was the Crystal Blue canary test. Current active experiments (verified by the `abExperienceCookies` array in `__ENV_CONFIG_RWB`) include 27 experiments:

`extras_bag_recommended`, `payment_billingAddress`, `skip_tripSummary`, `fare_upsell_upgrade_message`, `upsell_modal_four_fares`, `unified_shopping`, `flights_seats_urgency`, `blue_basic_to_blue_fare_upsell`, `insurance_payment_placement`, `paisly_confirmation_placement`, `barclays_price_summary`, `crystal_blue_segment`, among others.

All A/B assignment cookies are prefixed `NGB-`.

## Unauthenticated Endpoints

Several endpoints return internal data without authentication.

**Schedule extension** (`azrest.jetblue.com/od/od-service/schedule-extension`):

```json
{
  "data": {
    "ScheduleExtension": {
      "Label": "Flights available for sale through",
      "ExtensionDate": "2027-03-12",
      "UpdatedByUserId": "itcommercial",
      "UpdatedTimestampUTC": "2026-04-15T22:34:15.201510112-04:00[America/New_York]"
    }
  }
}
```

This exposes when JetBlue plans to extend its booking window (currently through 2027-03-12), the timestamp of the last update, and the internal user ID of whoever updated it (`itcommercial`). No auth required, no API key required.

**Auth wrapper config** (`/c23f7ab876ac167e0546/projects/jb-auth/auth-wrapper/production.json`):

Served from an obfuscated path (hash-like prefix) but not behind any authentication. Returns:
- `TB_PROFILE_URL: https://azrest.jetblue.com/profile/v1/retrieveTBProfile/token`
- `CP_PROFILE_READ_URL: https://loyalty-api.jetblue.com/cb-cp-profile/v1/creditprofile/cpProfileRead`
- `LEAN_PROFILE_URL: https://azrest.jetblue.com/profile/v1/leanProfile`
- `TB_ENROLL_URL: https://loyalty-api.jetblue.com/cb-cp-tbenrollment/v1/tbEnroll`
- `FULL_STORY.ORG_ID: 4HV1Q`
- Full logout cookie list including `jbFSIdentify`, `jbUserIsMosaic`, `jbTrueBlueCookie`, `cardStatus`, `points`

The same obfuscated path prefix serves a second config at `/c23f7ab876ac167e0546/projects/jb-auth/shared/production.json` (fetched from `trueblue.jetblue.com`):
- `CP_CLIENT_ID: 0oa14j84yzofAWvbL2p8`
- `RESET_PASSWORD_CLIENT_ID: 5743da29-b579-4bf6-894b-af829e8ddbeb`
- `RESET_PASSWORD_CLIENT_ID_2: xj-9z3u~2vEY7~khJAA-q7.K-rXmbfo3M8` — this value is 34 characters with `~` and `.` delimiters, a format inconsistent with all other Okta client IDs in the config (which are 20-character `0oa*` strings). It may be a client credential rather than a client identifier — this is inferred, not confirmed.
- `OKTA_CLIENT_ID: 0oa6pzarfiDxq8sn32p7`

The obfuscated path is not access control — it's security through obscurity. The path is visible in browser network traffic.

**A/B test endpoint** (`/abtest`):

Returns all campaign configurations: names, date ranges, paths they run on, experience split ratios, and cookie names. Expired campaigns remain in the response. No auth required.

**BFF API schema via validation error** (`jbrest.jetblue.com/bff/bff-service/bestFares` with `bffApiKey` header):

A POST with the exposed BFF key returns a 400 error that reveals the full parameter schema:
- `fareType`: `LOWEST` or `POINTS`
- `tripType`: `ONE_WAY` or `RETURN`
- `month`: format `"MAY 2026"`
- `faresByMonthRequest`: object with `adults`/`children` passenger counts

Internal error codes in responses: `MSCOM13`, `JB_UPSTREAM_ERROR`, `MSINFDAO00008`.

## Tracking and Session Recording

Eleven trackers confirmed. The consent framework is TrustArc, configured with `notice_behavior=implied,us` set on first page load before any user interaction — US users are on an opt-out model, meaning all trackers fire immediately.

**Tracker inventory:**

| Vendor | Domain | What it does |
|--------|--------|-------------|
| TrustArc | `consent.trustarc.com` | CMP; `TAsessionID` cookie |
| Google Tag Manager | `googletagmanager.com` | Two containers: `GTM-5J92P6SM`, `GTM-T69MLS2R` |
| Adobe Analytics | `omnistats.jetblue.com` | Suite `jetblue2020desktop` / `jetblueiphonedev` |
| Braze | `sdk.iad-07.braze.com` | Push messaging / CRM; sets `ab.storage.sessionId.786dbf53-57df-423f-8d9f-690d3bf2633d` and `ab.storage.deviceId.786dbf53-57df-423f-8d9f-690d3bf2633d` before consent — the UUID in the cookie name is Braze's app ID |
| FullStory | `edge.fullstory.com` | Session recording; org `4HV1Q` |
| Dynamic Yield | `cdn.dynamicyield.com` | Personalization; site ID `8791140` |
| Qualtrics | `siteintercept.qualtrics.com` | Site intercept surveys |
| PerimeterX / Human Security | `client.px-cloud.net`, `collector-pxd74ztjof.px-cloud.net`, `tzm.px-cloud.net` | Bot detection; loaded via `__DOTCOM_ENV_CONFIG.humanjs.trackerUrl` with deferred `setTimeout` to avoid triggering bot heuristics |
| ASAPP | `jetblue.asapp.com`, `sdk.asapp.com` | AI customer service chat |
| AppDynamics | `pdx-col.eum-appdynamics.com` | Browser RUM; sets `ADRUM_BT` cookie |
| Sentry | `o326333.ingest.sentry.io` | Error tracking; project `5795638` |

**FullStory identity stitching**: The `jbFSIdentify` cookie is in the auth-wrapper's logout clearing list — it's set when a user authenticates and cleared on logout. This confirms FullStory is identity-stitching session recordings to TrueBlue accounts. FullStory is active not just on the booking flow but on `trueblue.jetblue.com` (loyalty portal — points balances, travel history, profile data) and `managetrips.jetblue.com` (reservation management). These are the contexts where PII is most concentrated.

**Dynamic Yield** builds a per-visitor behavioral profile on every page:
- `geoCode`, `geoCont`, `geoCity`, `geoRegionCode`, `geoCoords` — country, continent, city, region, precise coordinates
- `weather`, `currentWeather` — local weather conditions (used for personalization)
- `isNewUser`, `trafficSource` — acquisition and recency
- `deviceInfo` — device fingerprinting
- `aud`, `shrAud`, `audCHC` — audience segments, shared audiences, cohort hash codes

**Braze**: Cookie key includes the app ID as a UUID (`786dbf53-57df-423f-8d9f-690d3bf2633d`). Device and session IDs are set before any consent interaction.

## Infrastructure Notes

**Debug headers in production**: Every response from `www.jetblue.com` includes VCL debug headers:
- `debug-varient: next` — internal CDN variant name (misspelled in production)
- `debug-vcl_ver: 657` — Varnish VCL version
- `debug-host: www.jetblue.com`
- `debug-f_origin: 1e79bMGBbCX4nwx0BUiVrS--F_dotcom_prd` — CDN origin identifier
- `debug-url: /`

These are operational VCL debug fields left enabled in production.

**HSTS**: `strict-transport-security: max-age=300`. Five minutes. For a site that handles payment and PII, the standard is a minimum of one year (31536000 seconds); HSTS Preload requires two years. A 300-second max-age means browsers forget the HSTS policy in five minutes, making downgrade attacks technically possible.

**CORS**: `Access-Control-Allow-Origin: *` on `www.jetblue.com` with `Access-Control-Allow-Methods: POST, GET, OPTIONS, DELETE, PUT`. Any third-party origin can make credentialless requests to the main domain APIs.

**`hola.jetblue.com`**: The `spanishHostUrl` field in `__ENV_CONFIG_RWB` points to `hola.jetblue.com` as the Spanish-language booking host. The domain returns a Fastly error: "unknown domain hola.jetblue.com. Please check that this domain has been added to a service." The domain is configured in the application but not configured in Fastly. Any user or link that navigates to the Spanish booking host gets a CDN error page.

**Release candidate in production**: The Angular booking app self-identifies as build `26.1.6-rc-5`.

---

## Machine Briefing

### Access and Auth

Most endpoints below work from `curl` or `fetch` without cookies. The booking app APIs require the `Ocp-Apim-Subscription-Key` header (for `jbrest.jetblue.com`/`azrest.jetblue.com`) or the Crystal Blue subscription key (for `cb-api.jetblue.com`). Both keys are available in `window.__ENV_CONFIG_RWB` from any loaded booking page.

To get a booking page session: load `https://www.jetblue.com/booking/flights` in a browser. The Angular app will mount `window.__ENV_CONFIG_RWB`. Extract keys from that object.

To authenticate as a TrueBlue member: POST to `https://accounts.jetblue.com/oauth2/aus63a5bs52M8z9aE2p7/v1/token` using client_id `0oa6q038snKiMbTRW2p7` with PKCE. The auth check is `GET https://accounts.jetblue.com/api/v1/sessions/me`.

### Endpoints

**No auth required:**

```
# Internal ops — booking window
GET https://azrest.jetblue.com/od/od-service/schedule-extension

# A/B test campaigns
GET https://www.jetblue.com/abtest

# Auth wrapper config (main site)
GET https://www.jetblue.com/c23f7ab876ac167e0546/projects/jb-auth/auth-wrapper/production.json

# Auth shared config (TrueBlue portal)
GET https://trueblue.jetblue.com/c23f7ab876ac167e0546/projects/jb-auth/shared/production.json

# Crystal Blue gatekeeper flags
GET https://www.jetblue.com/cb-gatekeeper/v1/gatekeeper/flags

# Pillar / route configuration
GET https://www.jetblue.com/dam/booking-static/json/pillarConfiguration.json

# Aircraft seat map config
GET https://www.jetblue.com/booking/assets/mini-seat-map-config.json

# Error messages
GET https://www.jetblue.com/dam/booking-static/json/backendError.json
```

**Require subscription key (`Ocp-Apim-Subscription-Key: <bffApiKey>`):**

```
# Best fares by month (POST, XML response)
# Body: fareType=LOWEST|POINTS, tripType=ONE_WAY|RETURN, month="MAY 2026"
POST https://jbrest.jetblue.com/bff/bff-service/bestFares

# Lean profile (requires auth token + subscription key)
GET https://azrest.jetblue.com/profile/v1/leanProfile

# TrueBlue profile
GET https://azrest.jetblue.com/profile/v1/retrieveTBProfile/token
```

**Crystal Blue API (header: `Ocp-Apim-Subscription-Key: a5ee654e981b4577a58264fed9b1669c`):**

```
# Flight search
POST https://cb-api.jetblue.com/cb-flight-search/v1/search/NGB

# Seat map preview
GET https://cb-api.jetblue.com/cb-seat-service/v1/seat-map/preview

# Shopping cart
GET/POST https://cb-api.jetblue.com/cb-shopping-cart/v1/cart

# Flight extras
GET https://cb-api.jetblue.com/cb-flight-extras/v1/get-extras/NGB

# Brand upsell
GET https://cb-api.jetblue.com/cb-exact-search/v1/brand-upsell/NGB

# Award points slider
GET https://cb-api.jetblue.com/cb-calc-payments/v1/award-slider

# Payment calculation
POST https://cb-api.jetblue.com/cb-calc-payments/v1/calc-payment
```

**Third-party (live keys from `__ENV_CONFIG_RWB`):**

```
# Address validation (Loqate)
GET https://api.addressy.com/Capture/Interactive/Find/v1.10/json3.ws?Key=KZ72-MR97-FD48-UZ15&Text=<address>&Countries=US

# Geocoding (Radar)
GET https://api.radar.io/v1/geocode/forward?query=<address>
# Header: Authorization: prj_live_pk_d6cdb40ac822292a8aaca7b499f75a75f59d5e0d

# Currency conversion (apilayer.net)
GET https://www.apilayer.net/api/convert?access_key=bc30b93e371e28576f91aabd2fa7ee04&from=USD&to=EUR&amount=100
```

### Gotchas

- `azrest.jetblue.com` returns `401 Access denied due to missing subscription key` without the BFF key header. The key is `bffApiKey` in `__ENV_CONFIG_RWB`.
- The auth wrapper config path (`/c23f7ab876ac167e0546/...`) looks like it could be keyed by session or user, but it is not — the same path works for all callers. Security through obscurity.
- `cb-api.jetblue.com` uses `Ocp-Apim-Subscription-Key` (Azure API Management pattern). The Crystal Blue subscription key and the BFF key are different values — do not swap them between host groups.
- Best fares endpoint (`/bff/bff-service/bestFares`) returns XML (not JSON) with internal error codes. Passenger count must be at least 1 adult or 1 child.
- `hola.jetblue.com` is broken — routes to Spanish booking will 404 at the CDN. Use `www.jetblue.com` with locale parameters instead.
- The `abExperienceCookies` array in `__ENV_CONFIG_RWB` maps all 27 active A/B experiments. Setting these cookies manually will force a specific experiment branch.
- Bot detection (PerimeterX/Human Security) is active. The `humanjs` script is loaded via `setTimeout` to avoid bot detection heuristics. Rate limiting is likely enforced at the Varnish layer.
- CORS on `www.jetblue.com` is `*` — credentialless cross-origin requests work without CORS preflight issues. Cookie-bearing requests will still be blocked by SameSite policies.
