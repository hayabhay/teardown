---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Alaska Airlines — Teardown"
url: "https://alaskaair.com"
company: "Alaska Airlines"
industry: "Transportation"
description: "US airline operating flights across the Americas and Pacific."
summary: "Next.js Pages Router content layer ('retrostack') overlays a still-live .NET/ASPX booking stack on the same origin. Contentstack headless CMS feeds the Next.js layer. A separate App Router microservice handles Atmos Rewards enrollment. SvelteKit micro-frontends power the booking engine via Azure Front Door CDN. Three Optimizely projects gate features across these contexts independently. Tealium iQ orchestrates 13 tracker scripts with consent enforcement explicitly disabled."
date: "2026-04-16"
time: "03:01"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Next.js, .NET ASPX, Contentstack, SvelteKit, Tealium, Azure, Varnish, BigIP]
trackers: [Google Analytics 4, Adobe Analytics, Tealium iQ, Quantum Metric, FullStory, Facebook Pixel, Bing UET, The Trade Desk, Google Ads, AppDynamics, Adobe Audience Manager, Optimizely, Qualtrics]
tags: [airline, loyalty, personalization, a-b-testing, feature-flags, surveillance, hybrid-stack, acquisition, consent, session-recording]
headline: "298 feature flags expose Alaska Airlines' unreleased products — a Cresta AI contact center, a Flight Pass subscription, and the Hawaiian Airlines merger migration state."
findings:
  - "Optimizely feature flags define audience segments for 10 individual credit card products -- Alaska Visa Ascent, Summit, Platinum Plus, Gold, Classic, Bank of Hawaii World Elite, Bank of Hawaii Choice, Bank of Hawaii Visa Debit, World Elite Mastercard, and Barclays -- each getting a different site experience."
  - "Every page embeds the visitor's IP address, city, postal code, lat/lng, and nearest Alaska destination into server-rendered HTML via window.__NEXT_DATA__ -- readable by all 12 third-party scripts without any network request."
  - "298 feature flags across three public Optimizely CDN datafiles expose unreleased products (Cresta AI contact center, Flight Pass subscription, surprise upgrades), named-employee test experiments (alex_and_marnel, jbrom, daniellea, billy, steven), and the Hawaiian Airlines merger migration state."
  - "The production CMS API returns a test advisory -- 'This is a test' for PNR -- published to the live Contentstack environment and targeting a QA hostname that redirects to production."
  - "Tealium declares consent_model='opt-in' but enforcement is disabled -- absent OneTrust cookie evaluates to true, firing all 13 tracker scripts including session recorders before any user interaction, even from California IP addresses."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Alaska Airlines operates one of the larger domestic US airline websites -- a booking surface with loyalty integration, partner upsells, and a multi-brand acquisition in progress. Two frontend generations coexist on the same origin, three separate feature flag projects gate different parts of the site independently, and the personalization infrastructure distinguishes between individual credit card products by name.

---

## Architecture

The site runs on what internal config calls **"retrostack"** -- a Next.js Pages Router application that serves content pages via `/retaincontent/retrostack/` path prefixes. The build ID at time of investigation was `oo8Js26mK3qpI1qUGI_ZO`. The name appears in `window.utag_data.server` and throughout the internal URL structure, suggesting it was chosen to distinguish the new layer from the legacy system it overlays.

That legacy system -- a .NET/ASPX stack -- is still live on the same origin. Response headers tell the story: `x-powered-by: Airlines` (a custom .NET header), `content-type: text/html; charset=iso-8859-1` (old encoding), and pages like `/Shopping/CurrencyConverter`, `/UserReset/ForgotUserName`, and `/betaaccount/deposit` still appearing in the sitemap. The robots.txt disallows `*.asp`, `*.aspx`, and `*.asmx` -- they're there, just not for crawlers. The `/health` endpoint (also disallowed in robots.txt) returns `200 OK. All health checks passed.` with `server: Alaska Airlines` headers, confirming the legacy stack is operational.

A third frontend context handles the Atmos Rewards loyalty enrollment at `/atmosrewards/enroll/`. It's a separate Next.js App Router application with its own Optimizely project. The `atmosrewards.com` domain redirects to `www.alaskaair.com/atmosrewards/`. A `disable_new_enrollments` feature flag provides a circuit breaker for the enrollment pipeline.

The booking and search engine is a fourth layer. `window.__svelte` appears on the homepage alongside `data-sveltekit-preload-data="hover"` attributes, indicating SvelteKit. Upsell components (`aa-elite-pc-message-banner`, `premium-class-upsell-banner-seats`) are served as standalone Svelte micro-frontends from `p2pcontent-fd-prod.azurefd.net` (Azure Front Door CDN).

**CMS:** Contentstack headless CMS. Page props contain Contentstack entry UIDs (`blt*`), ACL objects, and locale metadata for `en-us`, `en-au`, `en-nz`, `en-gb`, `es-us`, and at least three more. The production environment UID is `blt69192ee0d877992f`. The homepage entry was at `_version: 224`.

**Infrastructure:** Azure hosting behind a BigIP load balancer with Varnish CDN on edge hops. `x-azure-ref` header present on responses. `x-aag-brand: alaska` identifies this as an Alaska Airlines Group property. The static asset CDN (`resource.alaskaair.net`) sets `Access-Control-Allow-Origin: *` and is covered by the main SSL certificate. `news.alaskaair.com` runs on WordPress VIP. `careers.alaskaair.com` runs on CloudFront with S3 backing.

**Contact center:** Five9 Social Widget loaded via a script hosted on Azure Blob Storage (`contentcdnprodacct.blob.core.windows.net`, CORS wildcard). The Optimizely flag `cresta_ai_test` suggests Cresta AI -- an AI coaching layer for contact center agents -- is being evaluated on top of Five9.

---

## Geo Profile and IP Address in Server-Rendered HTML

On every page load, the Next.js server embeds the visitor's full geo resolution into `window.__NEXT_DATA__.props.geo`. The object contains city, state, country, postal code, latitude, longitude, metro code, accuracy radius, timezone, and a `NearestAlaskaDestination` object with airport code, name, coordinates, and distance in miles. It also includes the visitor's `IpAddress` as a plain string.

Evidence from a California visit:

```json
{
  "MetroCode": 807,
  "TimeZone": "America/Los_Angeles",
  "PostalCode": "94123",
  "StateName": "California",
  "StateCode": "CA",
  "NearestAlaskaDestination": {
    "Code": "SFO",
    "Name": "San Francisco, CA",
    "Latitude": 37.61611111111111,
    "Longitude": -122.38583333333334,
    "DistanceFromLocation": 13.1
  },
  "IpAddress": "73.223.27.123"
}
```

This data is in the page's HTML source -- not fetched via a subsequent API call. Every script on the page, including all 12 third-party domains loaded on homepage, can read `window.__NEXT_DATA__` without any network request. The server already resolved the IP; surfacing it in the HTML makes it a free data point for every tracker that wants it.

The adjacent `guestAttributes` object carries the same geo-derived data plus loyalty attributes: `nearest_airport`, `nearest_city`, `customerinfo_is_cardholder`, `customerinfo_is_barclays_cardholder`, `customerinfo_card_designator`, `customerinfo_mileage_plan_tier`, and `logged_in`. These feed Optimizely's audience evaluation -- anonymous visitors get geographic targeting, authenticated visitors get card- and tier-level targeting.

`window.utag_data` also surfaces `utm_tier`, `utm_creditcard`, and `utm_milesbalance` as custom UTM parameters that carry cardholder status into downstream campaign tracking.

---

## 298 Public Feature Flags Across Three Optimizely Projects

Three separate Optimizely projects serve three separate deployments. All three datafiles are public CDN resources requiring no authentication.

**Project 1 -- Main site** (`PybAvdA8xTPDsbkN6EAsw.json`, revision 845): 217 feature flags, 6 live experiments.

**Project 2 -- Auth/account** (`Kwo6ZWG3ZcYgG9JbmWe1q.json`): 44 flags.

**Project 3 -- Enrollment** (`W2wVbQpS5Nic72bsd3FXY.json`, revision 361): 37 flags.

### Credit Card Audience Matrix

The main site datafile contains audience definitions for each specific Alaska Airlines and partner card product:

- `has_ascent_card_only` -- Alaska Airlines Visa Signature (Ascent tier)
- `has_summit_card_only` -- Alaska Airlines Visa Infinite (Summit tier)
- `has_platinum_plus_card_only`, `has_gold_card_only`, `has_classic_card_only`
- `has_boh_world_elite_mastercard_only` -- Bank of Hawaii World Elite Mastercard
- `has_boh_choice_world_elite_mastercard_only`
- `has_bankoh_visa_debit_card_only`
- `has_world_elite_mastercard_only`
- `barclays_customers` -- Barclays card holders

These map to `customerinfo_card_designator` from the `guestAttributes` object. The site serves different content experiences based on which specific card the authenticated user holds. Bank of Hawaii and Barclays partnerships each have their own dedicated audience flags, meaning the bank partnership deals have feature-level surface area in the site's personalization layer. The granularity -- not just "cardholder vs. non-cardholder" but per-product -- reveals how tightly the site experience is coupled to specific bank relationships.

### Revenue and Pricing Flags

- `display_price_drop` -- price drop notifications
- `cabin_rec_pc`, `cabin_rec_exitrow`, `cabin_rec_firstclass` -- cabin upsell recommendation toggles
- `pricing_slideshow` -- pricing UI experiment
- `my_account_pricedrop_suppress` -- suppresses price drop notifications for a subset of users

Tealium tag 343 sets Optimizely revenue tracking cookies after purchase events: `optimizely_main_revenue`, `optimizely_firstClass_revenue`, `optimizely_main_upsellRevenue`, `optimizely_firstClass_upsellRevenue`, `optimizely_saver_revenue`. These attribute revenue to A/B test variants.

### Unreleased and Staged Features

- `cresta_ai_test` -- Cresta AI contact center assistant under evaluation
- `faq-bot-chat` -- FAQ chatbot interface
- `surprise_upgrades` -- upgrade surprise feature
- `next_destination_flag` -- next destination recommendations
- `flightpass_default` / `hphero_flightpass` -- Flight Pass subscription product staging
- `real_id` -- REAL ID compliance feature (TSA REAL ID went into effect May 2025)

### Geographic Audience Flags

- `hphero_hawaiiairports`, `ak_geo_sale`, `hawaii_bogo_hero`
- `pnw`, `sw_states`, `states_wa_or`, `seattle`
- `everyone_not_in_san`, `guests_in_san_diego_`, `everyone_not_in_alaska`
- `guest_located_in_hawaii`, `guests_not_in_hawaii`
- `non_members_in_ca_or_hi`, `non_members_except_ak_ca_hi`

These geo audiences are populated from the `nearest_*` fields in `guestAttributes`, which trace back to the IP-resolved geo object in `__NEXT_DATA__`.

### Named Employee Test Flags

Seven flags in the production main-site datafile carry individual first names or handles:

- `alex_and_marnel_experiment_only`
- `jbrom_test_3000`, `jbrom_test_4000`
- `daniellea_btest`
- `billy_test`, `billy_test_2`
- `alaska_steven_test`

Standard Optimizely usage for scoped employee testing, but the names are in a public CDN resource alongside revenue experiments and geo audience flags.

### Auth Flags (Project 2)

The auth project datafile shows the authentication migration state:

- `new_login_ui` -- login redesign rollout
- `auth0_session_logout`, `auth0_account_linking`, `auth0_forgot_password_flow` -- Auth0 integration
- `enable_ha_migration_login` -- Hawaiian Airlines account migration
- `accountservice_emailfraudcheck` -- email fraud check
- `mfa_optin`, `mfa_fraud_prevention_emails`, `mfa_revoke_active_user_sessions`
- `use_entra_id_authentication_for_session_redis_cache` -- Microsoft Entra ID for session Redis
- `guest_session_cookie_http_only` -- a flag to toggle `HttpOnly` on the guest session cookie

### Enrollment Flags (Project 3)

- `disable_new_enrollments` -- global kill switch
- `enrollment_ui_rollout` -- with a variable pointing to the old Mileage Plan URL
- `enable_huakai_by_hawaiian_member`, `enable_huakai_enrollment` -- Hawaiian legacy program paths
- `single_loyalty_enabled` -- combined Alaska/Hawaiian loyalty toggle
- `genders_x_and_u_enabled` -- non-binary gender options in enrollment
- `recaptcha_enforced` -- reCAPTCHA on enrollment

---

## Hawaiian Airlines Integration

The 2023 Alaska-Hawaiian merger is mid-execution in the codebase. The unified loyalty program -- "Atmos Rewards" -- replaces both Mileage Plan and HawaiianMiles. The enrollment microservice (`/atmosrewards/enroll/`) carries `enable_huakai_enrollment` and `enable_huakai_by_hawaiian_member` flags. "Huakai" appears to be the internal name for the legacy HawaiianMiles integration layer.

`single_loyalty_enabled` in the enrollment project controls whether new signups enter the combined program. The auth project has `enable_ha_migration_login` for Hawaiian accounts being migrated. The main site carries geo flags targeting Hawaii-based visitors (`guest_located_in_hawaii`, `hawaii_bogo_hero`, `hphero_hawaiiairports`).

The seat map endpoint at `/seatsui2/HawaiianSeatMap/seatmap` exists on the main domain. Without valid parameters, it returns a validation error exposing the expected field schema: `origin`, `destination`, `flightNumber`, `departureDate`, `DepartureDateTime`, `MarketingCarrier`, `OperatingCarrier`, `fareClass`. The separate path prefix (`HawaiianSeatMap`) indicates the Hawaiian seat inventory system was integrated rather than replaced.

---

## Surveillance Stack

**Tag manager:** Tealium iQ, account `alaska/main/prod`, orchestrating 13 tracker scripts.

**Consent behavior:** The declared consent model is `opt-in`. The enforcement infrastructure exists in code: a `getEnforcementMode()` function, `consent_prompt.isEnabled` flag, `tealiumCmpIntegration.loadRules` object. The actual state: `isEnabled = false`, enforcement mode returns `'none'`, and no CMP banner is triggered. The consent logic for advertising:

```js
consent_tracking_advertising = !b['cp.OptanonConsent'] || !!b['cp.OptanonConsent'].match(/,4:1,/)
```

`OptanonConsent` cookie is absent on a first visit. `!undefined` evaluates to `true`. All advertising tracking fires. The only way tracking stops is if a user explicitly opts out -- that flow is not presented on first visit, including from California addresses where CCPA applies.

**Confirmed trackers, all firing on first page load:**

| Tracker | Type | Signal |
|---|---|---|
| Google Analytics 4 | Analytics | Measurement ID `G-S6FNN1RWRJ`, Tealium tag 486 |
| Adobe Analytics | Analytics | Org `1056337B54E6D6820A4C98A1@AdobeOrg`, via Tealium tag 343 |
| Tealium iQ | Tag manager | `alaska/main/prod` |
| Adobe Audience Manager | DMP | `dpm.demdex.net`, `/id` endpoint with 302 redirect |
| Quantum Metric | Session recording | 15 POSTs per homepage load to `ingest.quantummetric.com/horizon/alaskaair` |
| FullStory | Session recording | Custom path `/_fs-ch-1T1wmsGaOgGaSxcX/` to evade blockers |
| Optimizely | A/B testing | 3 projects, visitor ID via `optimizelyEndUserId` cookie |
| Google Ads | Advertising | 3 conversion IDs: `AW-1050520812`, `AW-1054000976`, `AW-1071914075` |
| Facebook Pixel | Advertising | `_fbp` cookie, Tealium-managed |
| Microsoft Bing UET | Advertising | `_uetsid` / `_uetvid` cookies, Tealium-managed |
| The Trade Desk | Advertising | `insight.adsrvr.org`, advertiser ID `zgr45fi` |
| Qualtrics | Survey | `siteintercept.qualtrics.com` |
| AppDynamics RUM | Performance | AppKey `AD-AAB-AAD-EKV` |

**Two session recorders running simultaneously:** Quantum Metric fires 15 POSTs per page load. FullStory uses a custom path prefix (`/_fs-ch-1T1wmsGaOgGaSxcX/`) to evade content blockers -- including a bot detection endpoint (`check-detection`). Running both concurrently is unusual; most sites pick one.

**GA4 enhanced conversions:** Tealium tag 486 maps `prospect_email` and `purchaser_email` to `user_data.email` for Google Ads enhanced conversions, and maps `mp_number` (Mileage Plan number) as `user_id`.

**Kayak attribution:** A Tealium rule writes `kayakclickid` cookies from query parameters when advertising consent is true. Kayak-originated sessions are distinguishable in the analytics stream.

**AirTRFX/Everymundo:** `em-frontend-assets.airtrfx.com` -- an airline-specific SEO and ad optimization platform. Scans for `[data-container-id^="mm2-"]` containers and injects ad copy via `window.__ADNETIFY_SCRIPT`.

---

## Public APIs

No authentication required for any of the following:

**`GET /services/v1/myaccount/getloginstatus`**
Returns auth state and role flags:
```json
{
  "IsLoggedIn": false,
  "IsEasyBiz": false,
  "IsSuperUser": false,
  "IsTravelAgent": false,
  "BusinessInfo": null
}
```
The role structure -- EasyBiz (corporate accounts), SuperUser, TravelAgent -- describes the access control model without logging in.

**`GET /search/api/etinfo`**
1472 airports, each with `code`, `country`, `region`, `name`, and `isAlaska` boolean. 185 airports marked `isAlaska: true` -- Alaska's served route network.

**`GET /retaincontent/retrostack/api/cars`**
5065 car rental locations globally (1.8MB). Used to populate the car rental search widget.

**`GET /atmosrewards/account/token`**
Returns `{loggedIn: false, token: "", type: "Bearer", lifetime: 300}`. Token lifetime is 300 seconds.

**`GET /retaincontent/retrostack/api/getHeaderFooterLinks`**
Navigation structure, footer links, and advisory alerts -- including test CMS content (see below).

---

## Test Content in Production

The `/retaincontent/retrostack/api/getHeaderFooterLinks` production API returns all active CMS advisories. One advisory at the time of investigation:

```json
{
  "title": "Test advisory for PNR",
  "description": "This is a test ",
  "type": "default",
  "created_at": "2026-04-06T17:28:07.369Z",
  "updated_at": "2026-04-07T21:16:35.286Z",
  "publish_details": {
    "time": "2026-04-08T19:41:09.784Z",
    "environment": "blt69192ee0d877992f"
  }
}
```

Published to the production Contentstack environment (`blt69192ee0d877992f`) -- the same environment UID used for all live site content. Its `page_visibility` rule targets `specific_hostnames: ["reservations.qa.alaskaair.com/Reservation"]`. The QA hostname resolves and redirects to `www.alaskaair.com`. The advisory is live in production CMS and returned in production API responses to anyone who calls the unauthenticated endpoint.

---

## Machine Briefing

### Access and Auth

Most endpoints work without a session. Unauthenticated `curl` or `fetch` returns full data for etinfo, cars, login status, token, header/footer, and Optimizely decisions. The Optimizely CDN datafiles are standard HTTP GETs requiring no headers.

Session cookies (`ADRUM_BT`, `optimizelyEndUserId`, `geo_location_code`) are set by the server on first request -- a tracking session begins immediately on any page load.

Authenticated endpoints (`/betaaccount/`, `/reservations/`, loyalty account APIs) require an active Atmos Rewards / Mileage Plan session. Auth uses Auth0 with `auth0_account_linking` and `auth0_forgot_password_flow` flags active.

### Endpoints

**Open, no auth:**

```
GET https://www.alaskaair.com/services/v1/myaccount/getloginstatus
# Returns: {"IsLoggedIn":false,"IsEasyBiz":false,"IsSuperUser":false,"IsTravelAgent":false,"BusinessInfo":null}

GET https://www.alaskaair.com/search/api/etinfo
# Returns: 1472 airports with isAlaska flag, 185 Alaska-served

GET https://www.alaskaair.com/retaincontent/retrostack/api/cars
# Returns: 5065 car rental locations (1.8MB)

GET https://www.alaskaair.com/search/api/citySearch/getAllAirports
# Returns: 49KB airport dataset

GET https://www.alaskaair.com/atmosrewards/account/token
# Returns: {"loggedIn":false,"token":"","type":"Bearer","lifetime":300}

GET https://www.alaskaair.com/retaincontent/retrostack/api/getHeaderFooterLinks
# Returns: nav structure, footer links, CMS advisory alerts

POST https://www.alaskaair.com/search/api/getFeatures/false
# Returns: {"result":{"success":true,"features":[]}} for anonymous

GET https://www.alaskaair.com/health
# Returns: "OK. All health checks passed." (disallowed in robots.txt)
```

**Optimizely datafiles (CDN, no auth):**

```
GET https://cdn.optimizely.com/datafiles/PybAvdA8xTPDsbkN6EAsw.json
# Main site: 217 flags, revision 845

GET https://cdn.optimizely.com/datafiles/Kwo6ZWG3ZcYgG9JbmWe1q.json
# Auth/account: 44 flags

GET https://cdn.optimizely.com/datafiles/W2wVbQpS5Nic72bsd3FXY.json
# Enrollment: 37 flags, revision 361
```

**Hawaiian seat map (validation error reveals schema):**

```
GET https://www.alaskaair.com/seatsui2/HawaiianSeatMap/seatmap
# No params: returns error exposing field schema:
# origin, destination, flightNumber, departureDate, DepartureDateTime,
# MarketingCarrier, OperatingCarrier, fareClass
```

### Gotchas

- `__NEXT_DATA__` in page source contains full geo profile including IP address
- `window.utag_data` on any page gives the Tealium data layer state including `server: "retrostack"` and consent flag values
- The `/retaincontent/retrostack/` path prefix is required for Next.js asset/API routes; legacy `.asp`/`.aspx` routes are on the root path
- `/id` on the main domain is a 200 that immediately 302s to `dpm.demdex.net/id` -- Adobe DMP ID sync, not a local endpoint
- FullStory uses a custom path prefix (`/_fs-ch-1T1wmsGaOgGaSxcX/`) that may rotate per deployment
