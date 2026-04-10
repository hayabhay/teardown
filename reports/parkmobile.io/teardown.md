---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "ParkMobile — Teardown"
url: "https://parkmobile.io"
company: ParkMobile
industry: Transportation
description: "Mobile parking payment app for US municipalities and consumers."
summary: "ParkMobile runs two Next.js sites -- a Vercel-hosted marketing site (parkmobile.io) and an Envoy-proxied web app (app.parkmobile.io) -- alongside a CloudFront-hosted B2B portal. Acquired by EasyPark Group in 2023, the codebase is mid-integration: parallel Phonixx and EasyPark EPIC API paths coexist, and European infrastructure (ezprk.net, easyparksystem.net) is already wired into the US app. Feature flags are managed via LaunchDarkly but evaluated server-side and embedded in every page's __NEXT_DATA__ HTML, making the full flag set readable without authentication."
date: 2026-04-12
time: "07:20"
contributor: hayabhay
model: sonnet
effort: high
stack:
  - Next.js
  - Vercel
  - Envoy
  - CloudFront
  - LaunchDarkly
  - Braze
trackers:
  - Google Tag Manager
  - Google Analytics 4
  - Google Ads
  - Facebook Pixel
  - Mixpanel
  - Braze
  - OneTrust
  - Pardot
  - Ahrefs Analytics
  - Microsoft UET
  - Sentry
  - Decagon AI
tags:
  - parking
  - mobile-payments
  - municipal-infrastructure
  - easypark-acquisition
  - feature-flags
  - white-label
  - pre-consent-tracking
  - cpra
  - microservices
  - launchdarkly
headline: "A feature flag embedded in every app page's HTML contains garage pedestrian door codes for two live parking locations -- operational access credentials served to every anonymous visitor."
findings:
  - "The dwt-350-garage-pedestrian-whitelist feature flag ships door codes (0427*) for a Washington DC garage and a PM360 location in unminified JSON on every app page load, alongside zone IDs, signage codes, and operating hours."
  - "The api-services feature flag maps all 27 backend microservices with full hostnames -- including securedAccount, paymentProfiles, and shoppingCarts -- with 8 services documented using http:// protocol in client-side HTML."
  - "Email verification is disabled site-wide (registration-email-verification: false) with a skip button even when the verification screen appears, and password complexity requirements are also turned off."
  - "The production magic link redirect whitelist includes localhost, and a LaunchDarkly click-tracking goal is registered against app-localhost.parkmobile.io -- developer artifacts persisting in production auth and analytics config."
  - "13 tracking services fire on first page load with interactionCount=0 before any consent interaction, under a CPRA-type OneTrust rule that pre-enables all tracking categories."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

ParkMobile is a mobile parking payment platform used by ~40 million registered users across hundreds of US municipalities. Acquired by EasyPark Group (Norway) in 2023, it now operates as the North American arm of the world's largest parking technology company. The site handles real parking transactions for meter payments, reservations, and permits -- the app processes payments on behalf of cities and private operators, taking a transaction fee on each.

This report covers `parkmobile.io` (marketing), `app.parkmobile.io` (consumer web app), and `customer.parkmobile.io` (B2B self-service portal), plus the EasyPark infrastructure already wired into the US stack.

---

## Architecture

ParkMobile runs two distinct Next.js deployments with different hosting and infrastructure.

**parkmobile.io** is the marketing and SEO surface. It runs Next.js with React Server Components on Vercel, with `x-powered-by: Next.js` and `x-nextjs-prerender: 1` headers confirming prerendered pages. HSTS is set at `max-age=63072000` (two years). There is no Content Security Policy header. Content is managed via Prismic CMS (confirmed by `prismic-previews` feature flag) with evidence of Storyblok also in use. The site's SEO footprint is substantial: the sitemap index contains 116 sub-sitemaps covering ~75 US cities, organized by state, city, and location type (`parking-lots`, `neighborhoods`, `destinations`) at URLs following the pattern `/parking/locations/{state}/{city}-parking/{type}/{slug}`.

**app.parkmobile.io** is the consumer-facing web app. It runs Next.js behind an Envoy proxy (EasyPark infrastructure) rather than Vercel. The app sets a `device-fingerprint` cookie on first visit -- a UUID with expiration in 2038, persisting device identity across sessions regardless of login state. Cache headers use a custom `pm-cache` / `pm-cache-lookup` scheme rather than standard CDN headers. CSRF protection uses dual tokens: `_csrfV2` and `XSRF-TOKEN`.

**customer.parkmobile.io** is the B2B self-service portal -- a React SPA hosted on AWS CloudFront with a separate GTM container (`GTM-NVK47DK`). This is where parking operators manage their ParkMobile 360 deployments.

**Subdomains discovered:**
- `app.parkmobile.io` -- consumer app (Envoy proxy)
- `customer.parkmobile.io` -- B2B portal (CloudFront)
- `go.parkmobile.io` -- Pardot marketing automation, redirects to parkmobile.io
- `auth.parkmobile.io` -- authentication service (401)
- `gp.parkmobile.io` -- guest pass service (403)
- `api.parkmobile.io` -- API gateway (401)
- `app-qa.parkmobile.io` -- QA environment (found in app config state)
- `app-staging.parkmobile.io` -- staging environment (found in app config state)
- `app-localhost.parkmobile.io` -- developer local environment (referenced in production LaunchDarkly goals)

The marketing site defaults the user's location context to Atlanta, GA (`33.786, -84.391`) -- ParkMobile's HQ -- when no browser location is available.

---

## Feature Flags as a Config Layer

ParkMobile uses LaunchDarkly for feature flag management with secure mode enabled -- the LaunchDarkly SDK is configured to require a server-computed user hash for direct flag access. This restriction is bypassed by design: `app.parkmobile.io` evaluates all flags server-side and embeds the complete evaluated result set in `window.__NEXT_DATA__.props.initialState.featureFlags.bootstrap` on every page load.

The embedded object includes the full flag values, a `$flagsState` metadata block with variation indices and version numbers for every flag, and the LaunchDarkly user hash for the anonymous session. Any visitor can read the complete production flag set from the page HTML without authentication.

**90+ flags are exposed**, including:

**Internal project tracking**: Flags are named after Jira tickets -- `DWT-323`, `DWT-746`, `DWT-965`, `WEBEU-201`, `WEBEU-89`, `RPK-2258`. Each name exposes that a specific ticket drove a feature decision. `DWT-746-use-new-auth-flow: false` (on version 7) means the auth migration ticket has been toggled 7 times but still hasn't shipped the new flow to production.

**Auth and security settings**:
- `DWT-746-use-new-auth-flow: false` -- old auth flow still active
- `complex-password-requirements-enabled: false` -- minimal password requirements
- `registration-email-verification: false` -- new registrations don't verify email
- `email-verification-skip-button: true` -- skip button present even on verification screens
- `reset-password-flow: false` -- custom reset password flow disabled

**Business rules**:
- `convenience-fee-whitelist` -- array of 44 operator/zone IDs where convenience fees are charged. Zone IDs `975010`-`975099` are in a contiguous block suggesting a single large operator.
- `guest-checkout-blacklist` -- currently empty (`supplierIds: []`), meaning guest checkout is allowed for all operators
- `b2c-country-specific-configurations` -- per-country config for SE, CZ, FR, IT: email requirement, mobile deep-link behavior, and complete lists of `cost-neutral-operator-ids` (operators where the transaction fee is absorbed rather than passed to the user)
- `easy-park-whitelist` -- per-country operator ID lists for EasyPark markets (SE, CZ, FR, IT, NL)
- `DWT-323-Restrict-Supported-Country-List` -- array of ~130 country codes from which ParkMobile does not accept registrations (includes CN, RU, KP, UA, IR, SY)

**Parking infrastructure**:
- `dwt-422-global-auto-select-area-distance-threshold: 15` -- distance in meters for auto-selecting a parking area globally
- `dwt-426-parkmobile-auto-select-area-distance-threshold: 10` -- tighter threshold for ParkMobile US
- `checkout-v2-venues` -- new checkout flow only enabled for `dolby-live` (Dolby Live venue at Allegiant Stadium, Las Vegas)
- `new-transient-parking-search: true` / `new-transient-parking-search-view-all: false` -- new search UI ships but the "view all" variant is off

**The garage door code flag**: The `dwt-350-garage-pedestrian-whitelist` flag contains operational data embedded in client-side HTML:

```json
{
  "parkingZones": [
    {
      "zoneId": "195614",
      "locationName": "Washington DC",
      "signageCode": "22213",
      "doorCode": "0427*",
      "openHour": "9AM",
      "closeHour": "6PM"
    },
    {
      "zoneId": "147917",
      "locationName": "PM360",
      "signageCode": "9823",
      "doorCode": "0427*",
      "openHour": "9AM",
      "closeHour": "6PM"
    }
  ],
  "environment": "production"
}
```

These are garage pedestrian access codes for two locations -- a Washington DC parking garage (zone 195614, signage code 22213) and a PM360 location (zone 147917, signage code 9823). The `doorCode: "0427*"` value appears as an access PIN (the asterisk may be a keypad confirmation character or a wildcard indicator). This data is served in unminified JSON to every visitor who loads the app, without authentication.

**Leftover flags**: `weather-hackathon-idea: false` and `feature_test: false` are both in production with version numbers (2 and 3 respectively), indicating they were toggled at some point.

---

## Microservice Architecture Map

The `api-services` feature flag (embedded in `__NEXT_DATA__`) is a complete map of ParkMobile's backend microservice architecture. All 27 service entries include `host`, `protocol`, and `basePath`.

**Full service inventory:**

| Service | Host | Protocol |
|---------|------|----------|
| shoppingCarts | services.parkmobile.io/res-shopping-cart | http |
| emailVerification | services.parkmobile.io/emailverification | http |
| sessions | services.parkmobile.io/sessions | http |
| phonixx | services.parkmobile.io/parkmobileapi | http |
| securedAccount | services.parkmobile.io/securedaccount | http |
| locations | services.parkmobile.io/api/locations | http |
| phonixxEasyPark | services-ezprk.parkmobile.io/parkmobileapi | http |
| connectedDrive | services.parkmobile.us/parkmobilewebapi | http |
| authentication | auth.parkmobile.io | https |
| guestPass | gp.parkmobile.io | https |
| smartProxy | res-smart-proxy.usa.ezprk.net/v1/api | https |
| smartProxyInternal | res-smart-proxy.usa.ezprk.net/v1/api | https |
| easyParkEpic | epic-api.easyparksystem.net/rest/resources | https |
| easyParkEpicV2 | epic-internal.europe.ezprk.net/rest/resources | https |
| easyParkEpicUsa | epic-internal.usa.ezprk.net/rest/resources | https |
| easyParkBillingInternal | billing-internal.easyparksystem.net | https |
| easyParkBillingExternal | billing.easyparksystem.net | https |
| easyParkWebAuthBff | customer-internal.europe.ezprk.net/api/web-auth/ | https |
| easyParkAppBff | app-bff.easyparksystem.net | https |
| easyParkAppBffV2 | app-bff-internal.europe.ezprk.net | https |
| easyParkSSOV2 | sso-internal.europe.ezprk.net/api | https |
| paymentProfiles | payment-profile-internal.usa.ezprk.net | https |
| easyParkTariffCache | tariff-cache-internal.europe.ezprk.net | https |
| easyParkAreaCache | area-cache.easyparksystem.net | https |
| easyParkNotificationCenter | notification-center.easyparksystem.net | https |
| easyParkAccountDeletion | account-deletion-ep.easyparksystem.net/account | https |
| carVerHosts | car-verification.easyparksystem.net | https |

Eight services use `http://` protocol: the core legacy ParkMobile services (`shoppingCarts`, `emailVerification`, `sessions`, `phonixx`, `securedAccount`, `locations`), the EasyPark-ported Phonixx variant (`phonixxEasyPark`), and `connectedDrive`. These are presumed to be internal network addresses -- `services.parkmobile.io` is likely an internal DNS name not reachable from the public internet. But the protocol configuration is documented in client-side HTML served to every browser.

The `connectedDrive` service at `services.parkmobile.us` (note `.us` rather than `.io`) uses a distinct domain and path (`/parkmobilewebapi`). This is likely BMW ConnectedDrive integration -- BMW has had a partnership with ParkMobile for in-car parking payment. The `securedAccount` service name suggests it handles PII directly. `paymentProfiles` at `payment-profile-internal.usa.ezprk.net` is the payment tokenization service.

The proxy routing layer: `app.parkmobile.io/api/proxy/ressmartproxy/resproxy/` routes to the `smartProxy` service at `res-smart-proxy.usa.ezprk.net`. Error responses from unauthenticated probe calls return the internal service name: `{"error":"Error on get VenuesPOIS - Bad Request"}`, confirming the proxy passes error messages from downstream services verbatim.

---

## EasyPark Acquisition State

ParkMobile's 2023 acquisition by EasyPark Group is visibly mid-integration in the codebase. The app runs two parallel parking API paths simultaneously:

- **Phonixx**: ParkMobile's legacy backend (`http://services.parkmobile.io/parkmobileapi`). Feature flags named `DWT-*` (ParkMobile's internal Jira prefix) still govern Phonixx behavior.
- **EasyPark EPIC**: EasyPark's European platform (`epic-api.easyparksystem.net`, `epic-internal.usa.ezprk.net`, `epic-internal.europe.ezprk.net`). Flags named `WEBEU-*` and `easyPark*` govern this path.

The `enable-easypark-sso-login: true` flag confirms EasyPark's SSO is already active. Migration flags `update-app-bff-endpoint: true` and `update-easy-park-sso-endpoint: true` indicate recent or in-progress endpoint migrations.

The `customer.parkmobile.io` B2B portal references both `customer.parkmobile.io` and `customer.easypark.net` -- a dual-branding transition that hasn't fully resolved. The staging environment for the B2B portal (`customer-staging.easypark.net`) was accessible without authentication at time of investigation, serving the full portal shell and JS bundle. The staging bundle includes endpoint config for `customer.australia.ezprk.net`, confirming EasyPark's global platform reach.

**White-label city app ecosystem**: The `magic-login-redirect-whitelist` feature flag (embedded in production HTML) reveals ParkMobile's white-label municipal parking app infrastructure. The whitelist contains URL schemes for ~13 branded city apps:

```
"localhost", "parkmobile.io", "easypark.net",
"parkmobile://", "sevenOneSeven://", "parking717://", "meterUP://",
"goMobilePGH://", "pittsburg://", "parkLouie://", "MKEPark://",
"FWPark://", "parkHouston://", "houston://", "parkLancaster://",
"parkColumbus://", "park915://", "parkDSM://", "parkBoston://"
```

These are deep-link schemes for municipality-branded apps (Pittsburgh, Milwaukee, Fort Worth, Houston, Lancaster, Columbus, El Paso area, Des Moines, Boston) running on ParkMobile's backend. ParkMobile is not just a consumer app -- it's the infrastructure layer for city-branded parking apps across the US.

---

## Surveillance and Tracking

**Complete tracker inventory (13 services):**

1. **OneTrust** -- consent management, policy UUID `5d3c213f-5d08-46f7-851d-ca626539538b`, US rule type `CPRA`. Version `202602.1.0`.
2. **Facebook Pixel** -- App ID `131506314174868`, sets `_fbp=fb.1.*` cookie on first load.
3. **Mixpanel** -- two simultaneous instances: `0b41820446c7de74b0f08d57f5c6fc49` (parkmobile.io marketing) and `77ce05349b19c4a174c1cb75bca51b49` (app.parkmobile.io). Sets `mp_user_id` and `mp_{token}_mixpanel` cookies with `distinct_id` and device ID values.
4. **Braze** -- SDK 5.9.1, key `149105e5-1d15-4f7d-8d05-4e285c6426b5`. Sets 15+ localStorage keys (`ab.storage.*`) including `serverConfig`, `triggers`, `rateLimitState`, and `sessionId`. Also sets `ab.storage.userId.*`, `ab.storage.deviceId.*`, and `ab.storage.sessionId.*` cookies. Custom user attributes tracked include `application-name`, `b2c2b_corporateemail_exit`, `device-language`, `device-locale`, `product-package`, `product-package-id`, `session-id`, `tracking-sdk`, and `user_active_billing_types`. The `b2c2b_corporateemail_exit` attribute captures the moment a consumer user enters a corporate email address -- a B2B sales pipeline signal.
5. **Google Tag Manager** -- `GTM-K74JCWD` (parkmobile.io), `GTM-NVK47DK` (customer.parkmobile.io B2B portal).
6. **Google Analytics 4** -- three measurement IDs: `G-22C1XHM9HN` and `G-R326MM1HX6` (loaded explicitly on the marketing site), `G-B1QM4VF4T2` (found in cookies, likely from the app).
7. **Google Ads** -- remarketing tag `AW-866273082`.
8. **Pardot / Salesforce Marketing Cloud** -- `piAId=1068053`, tracking subdomain `go.parkmobile.io`. B2B audience segmentation and CRM enrichment.
9. **Ahrefs Analytics** -- fires `analytics.ahrefs.com/api/event` on every page. Used for SEO ranking tracking.
10. **Microsoft UET / Bing Ads** -- `uetq` global present, Bing remarketing pixel active.
11. **Decagon AI chatbot** -- config at `metadata.decagon.ai/team_hash/2cdadd0c.json` (returns `{"teamId": 663}` without auth) and widget config at `metadata.decagon.ai/widget_preferences/parkmobile_base.json` (full widget preferences, colors, feature settings -- public). Chat interactions are routed through GTM dataLayer (`decagon_gtm_listeners_ready` event) with fields `decagon_profile_market`, `decagon_device_language`, `chat_duration_minutes`, `chat_duration_seconds`, and `decagon_detail`. This routes chat session data into Google Analytics and Braze.
12. **Sentry** -- error tracking, org `o4505745533763584`, project `4507506803802112`.
13. **Google Maps JavaScript API** -- map rendering on location pages and the zone search interface.

**Pre-consent tracking**: The `OptanonConsent` cookie is set on first page load with `interactionCount=0` (no user interaction with the consent banner) and `groups=C0001:1,C0002:1,C0003:1,C0004:1,SSPD_BG:1` -- all tracking categories pre-enabled. The US OneTrust rule is type `CPRA` (California Consumer Privacy Rights Act), which uses an opt-out model. The `OneTrustGroupsUpdated` and `OptanonLoaded` dataLayer events fire with all groups active before any user interaction with the consent UI. Facebook Pixel (`_fbp`), Braze (`ab.storage.*`), and both Mixpanel instances are active on the first request.

The OneTrust tenant config has `CookieV2GPC: true` in its feature flags, indicating GPC support is available at the platform level. However, the `OptanonConsent` cookie observed during investigation showed `isGpcEnabled=0` and `browserGpcFlag=0`, and `IsGPPEnabled: false` is set at both the global and US rule levels. Under CPRA, GPC is a recognized opt-out signal for California users. The gap between the platform capability and the observed cookie behavior suggests GPC is either misconfigured or not enabled for this specific deployment.

**Attribution tracking**: Custom `sourceCookie=Direct`, `lastExternalReferrer`, `lastExternalReferrerTime`, and `_nav_path` in localStorage form a parallel attribution chain alongside the Google/Mixpanel attribution data.

---

## Account Security Posture

Several feature flags in client-side HTML together describe the account security model:

**Registration**: `registration-email-verification: false` means new accounts are created without email verification. `email-verification-skip-button: true` means even when the verification screen is presented, a labeled skip button allows bypassing it. `complex-password-requirements-enabled: false` means no complexity rules are enforced beyond minimum length. `DWT-965-use-v3-registration: true` indicates the v3 registration flow is live -- these flag states apply to the current active flow.

**reCAPTCHA**: Registration is protected by reCAPTCHA Enterprise (`recaptcha-enterprise: true`, key `6LfIj2MpAAAAAN-6KMEGj14NxQRPYb9LsetWPmzt` from customer portal HTML). The risk threshold is `recaptcha-fraud-prevention-threshold-risk: 7` (out of 10 -- scores at or above 7 trigger action). The EasyPark flow uses a separate lower threshold: `ep-recaptcha-v3-threshold-score: 4`. Registration from automated tools returns `{"message":"Failed ReCAPTCHA Check."}` with HTTP 401.

**Email in URL parameters**: When the registration form fails reCAPTCHA validation, the page navigates to `app.parkmobile.io/register?email={email}&terms=`, putting the user's email address in the URL. This causes the email to appear in server access logs, CDN logs, browser history, and any analytics sessions that capture page URLs -- including the three GA4 properties tracking this site.

**Magic link whitelist in production HTML**: The `magic-login-redirect-whitelist` flag (embedded in every app page) lists the allowed redirect destinations after magic link authentication. `localhost` is in this list alongside `parkmobile.io`, `easypark.net`, and 13 municipal app URL schemes. This means the production authentication system accepts redirect targets to localhost -- a developer configuration artifact persisting in production.

**LaunchDarkly goals targeting developer URLs**: The production LaunchDarkly goals config (accessible at `app.launchdarkly.com/sdk/goals/{sdk-key}`) contains a click-tracking goal with selector `[data-pmtest-id='verify-code']` registered against the canonical URL `https://app-localhost.parkmobile.io/verify-email`. A developer's local machine URL is registered as a conversion goal in the production LaunchDarkly project alongside real production pages.

**2021 data breach context**: ParkMobile experienced a breach in March 2021 exposing ~21 million records including license plates, email addresses, and hashed passwords. The site currently displays a fraud warning banner: "Be aware of fraudulent text messages impersonating ParkMobile." Ongoing phishing attempts against the user base are an active concern years after the incident.

---

## Machine Briefing

ParkMobile runs two Next.js apps. The marketing site (`parkmobile.io`) is mostly readable without session state. The app (`app.parkmobile.io`) requires CSRF tokens for most write operations and uses an Envoy proxy layer between the browser and backend services.

### Access and auth

**No auth required:**
- All `parkmobile.io` marketing pages -- curl or fetch with standard headers
- `app.parkmobile.io` page HTML, including `__NEXT_DATA__` with feature flags -- any GET
- Decagon config endpoints (no auth): `metadata.decagon.ai/team_hash/2cdadd0c.json`, `metadata.decagon.ai/widget_preferences/parkmobile_base.json`
- LaunchDarkly goals: `https://app.launchdarkly.com/sdk/goals/{sdk-key}` (SDK key is embedded in app HTML)
- EasyPark public file: `https://files.easyparksystem.net/registration-plates.xlsx`

**Session required for app APIs:**
The app validates session state on all `/api/` routes. You need a browser session with `_csrfV2`, `XSRF-TOKEN`, and `device-fingerprint` cookies. Guest checkout flows may work with lighter auth -- `on-demand-guest-checkout: true` is enabled.

**Getting a session:**
```
# Load the app and extract session cookies
npx @playwright/cli fetch https://app.parkmobile.io/zone/start --save-storage session.json
# Subsequent requests include: Cookie: device-fingerprint=...; _csrfV2=...; XSRF-TOKEN=...
```

### Endpoints

**Feature flags (open -- no auth):**
```
GET https://app.parkmobile.io/zone/start
# __NEXT_DATA__ in response HTML contains:
# .props.initialState.featureFlags.bootstrap -> all 90+ flags
# .props.initialState.featureFlags.bootstrap["api-services"] -> service map
```

**Marketing location pages (open):**
```
GET https://parkmobile.io/parking/locations/{state}/{city}-parking
# e.g. /parking/locations/ca/san-francisco-parking
# Returns Next.js prerendered HTML with parking location data

GET https://parkmobile.io/parking/locations/{state}/{city}-parking/parking-lot/{slug}
# Individual lot page, links to app.parkmobile.io/reservation/{zone-id}
```

**Sitemap (open):**
```
GET https://parkmobile.io/sitemap.xml
# Returns sitemap index with 116 sub-sitemaps
# Pattern: /sitemap/{type}/{city-slug}-sitemap.xml
```

**Zone reservation pages (open -- app):**
```
GET https://app.parkmobile.io/reservation/{zone-id}
# e.g. /reservation/62401 (zone IDs visible in marketing site links)
# Loads zone data; fires multiple /api/zones/{id} requests
```

**Zone search (session required):**
```
GET https://app.parkmobile.io/api/zones/search?lat={lat}&lng={lng}&radius={r}
# Returns 400 without valid session + params
# Defaults to Atlanta (33.786, -84.391) when no location provided
```

**App proxy to reservation smart proxy (session required):**
```
GET https://app.parkmobile.io/api/proxy/ressmartproxy/resproxy/api/venues/pois
# Without session: {"error":"Error on get VenuesPOIS - Bad Request"}
# Routes to res-smart-proxy.usa.ezprk.net/v1/api
```

**Registration (reCAPTCHA protected):**
```
POST https://app.parkmobile.io/api/register
# Body: { email, password, recaptchaToken }
# Returns 401 {"message":"Failed ReCAPTCHA Check."} from headless browsers
# reCAPTCHA Enterprise key (from customer portal): 6LfIj2MpAAAAAN-6KMEGj14NxQRPYb9LsetWPmzt
```

### Gotchas

- All `/api/` routes on `app.parkmobile.io` require a real browser session -- curl calls return 400 or session errors even for read endpoints. The Envoy proxy validates session state.
- Zone IDs are integers visible in reservation URLs (e.g., `62401`). The range observed in network captures was ~4012736-401866 but zones on marketing pages are in lower ranges.
- The `device-fingerprint` cookie expires in 2038 -- once set, it persists across sessions and is used for device-level tracking even without login.
- LaunchDarkly SDK key is embedded in app HTML. The goals endpoint is: `https://app.launchdarkly.com/sdk/goals/{sdk-key}` -- accessible without auth, returns conversion goals.
- `api.parkmobile.io` returns 401 for all requests -- this is the public API gateway requiring separate API credentials, not session cookies.
- The `recaptcha-fraud-prevention-threshold-risk: 7` threshold means automated tools with scores 7-10 will be blocked; the EasyPark path uses `ep-recaptcha-v3-threshold-score: 4` which is more permissive.
