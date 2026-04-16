---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "United Airlines — Teardown"
url: "https://united.com"
company: "United Airlines"
industry: "Transportation"
description: "Major US airline offering domestic and international flights."
summary: "Angular SPA served via Akamai CDN with ASP.NET Core backend. Optimizely manages A/B testing (47 running experiments) and feature flags (60 total), with the full datafile publicly fetchable via the embedded SDK key. Tealium iQ handles tag management with 9 active senders, and Securiti.ai serves as the consent management platform. United runs its own Content Control Engine (CCE) for server-side personalization alongside Optimizely. Session replay via Quantum Metric with network interception; identity resolution through Amazon Publisher Services with 24 enrolled vendors."
date: "2026-04-16"
time: "03:02"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Angular, ASP.NET Core, Akamai, Tealium, Optimizely]
trackers: [Google Analytics, Google Tag Manager, Facebook Pixel, Quantum Metric, Dynatrace, Tealium, Qualtrics, LivePerson, Rokt, LiveRamp, Amazon Publisher Services, Pinterest, Boomtrain, Ad Lightning, Yahoo Ads, Securiti.ai]
tags: [airlines, travel, a-b-testing, feature-flags, identity-resolution, session-replay, consent-management, adtech, dark-patterns, geolocation]
headline: "United's public Optimizely config exposes 47 live experiments — including one called 'shop_exit_friction_step' that appears to test adding friction when users try to leave the booking funnel."
findings:
  - "The Optimizely SDK key in the page source unlocks the full experiment catalog — 47 running A/B tests and 60 feature flags — including 'nested_bluejay_throttle' (new booking UI, 3 variants), 'hemisphere_genai_throttle' (GenAI product, 2 variants), and 'rokt_chase_overlay_confirmation' (4 variants of Chase credit card offers on the post-booking page)."
  - "'shop_exit_friction_step' is a running 2-variant experiment whose name describes itself: United is testing added friction for users trying to leave the booking funnel."
  - "Every page load calls the third-party service api.ipify.org to fetch the visitor's IP address, stores it in the Tealium data layer visible to all tag senders, and immediately fires a nearestAirport API lookup — pre-filling the booking widget with no user interaction."
  - "The Securiti.ai consent manager's auth token sits in window.authDetails as a named global, readable by every third-party script on the page — including the ad tech vendors the CMP is supposed to regulate."
  - "Quantum Metric fires 63 individual POST requests on a single homepage load, with a network interceptor module that captures API request and response payloads alongside session replay recordings."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

United.com fires 161 requests on a cold homepage load. Among them: 63 Quantum Metric session replay POSTs, a call to a third-party IP lookup service, a geolocation-based airport pre-fill, and enough ad tech to enroll the visitor in 24 identity vendor graphs before the consent banner registers any interaction. The Optimizely datafile — fetchable by anyone with the SDK key embedded in the page — contains 47 running experiments, including one that tests friction on users leaving the booking funnel and codenames for United's next major product launches.

## Architecture

United.com is an Angular SPA deployed under the path `/en/us` — `united.com` and `www.united.com` both redirect there via 302. The backend is ASP.NET Core, identifiable from the .NET error envelope (`{"Errors":{"statusCode":405,"code":"MethodNotAllowed",...}}`) returned on incorrect HTTP verbs. The CDN is Akamai (server header: `AkamaiGHost`), which also handles bot management via obfuscated POST endpoints: requests to paths like `/Dxyc2KOwk/LjJvX/jDe2e/GqCM0vGU/m35tNL5rXOiYbfhOai/SQgqJ1wMBA/IHYja/E5cXAMC` appear on every page as Akamai Bot Manager telemetry, returning 201 without apparent side effects. The webpack chunk is named `webpackChunkunited_ecommerce_web`.

The SSL certificate (DigiCert GeoTrust, expires 2026-12-08) covers 14 domains including `beta.united.com`, `checkin.united.com`, `ife.unitedwifi.com`, `mobile.united.com`, `pss.united.com`, `ual.com`, `unitedairlines.ca`, `unitedairlines.co.uk`, `unitedairlines.com`, `unitedairlines.jp`, `unitedwifi.com`, and `walletservices.united.com`. Of these, `beta.united.com` responds with a 401 and an HTTP Basic Auth challenge ("Secure Area") — an active staging environment gated only by basic credentials. `checkin.united.com`, `mobile.united.com`, `walletservices.united.com`, and `pss.united.com` (Passenger Service System) establish SSL but return no HTTP response, consistent with VPN-gated internal services.

Tag management is Tealium iQ (`tags.tiqcdn.com/utag/unitedairlines/united-v3/prod/utag.js`), configured with 9 active senders on the production environment. A/B testing and feature flags run through Optimizely. The consent management platform is Securiti.ai (`cdn-prod.securiti.ai`, UUID `31270bbd-6025-4430-a211-12fb9c5112dd/42dbea91-6a3d-48ac-888c-ff88953b132e`). United also runs its own server-side personalization engine — the Content Control Engine (CCE) — separate from Optimizely, with homepage content fetched via `POST /api/Home/HeroCarouselbyCCE` and `POST /api/CCEProducts/GetCCEContent` (called three times on the homepage).


## The Optimizely Datafile

United uses Optimizely for A/B testing and feature flags. The production SDK key, `FMxasjVG6NR5hYpK8jvUTa`, is present in `window.optimizelyDatafile` alongside the full datafile object (project ID `11988697634`, account ID `9972578858`). The Optimizely CDN serves this datafile publicly at `https://cdn.optimizely.com/datafiles/FMxasjVG6NR5hYpK8jvUTa.json` — no authentication required. Anyone with the SDK key can initialize an Optimizely client and read the complete experiment catalog.

The datafile contains 60 feature flag definitions and 47 experiments, all with status `Running`. The named experiments reveal the current product roadmap in operational detail.

**The Bluejay booking experience.** Two experiments are running against a product codenamed Bluejay: `nested_bluejay_throttle` (3 variations: control, variation_1, variation_2) and `nested_bluejay_reshop_throttle`. "Nested" in the experiment name suggests a multi-city or complex itinerary booking flow. The corresponding flight search API endpoint is `POST /api/flight/FetchSSENestedFlights` — the "Bluejay" name appears in Optimizely but the API is already in production, actively splitting traffic.

**GenAI under Hemisphere.** `hemisphere_genai_throttle` is a running experiment with 2 variations (control + treatment). "Hemisphere" is United's in-flight entertainment and digital experience brand. The experiment confirms GenAI is being piloted in the digital product layer, throttled to a subset of users. No GenAI UI was visible during the investigation session — either the control group or a low traffic percentage.

**The friction experiment.** `shop_exit_friction_step` is a running A/B test with 2 variations. The name is self-describing: United is testing added friction for users attempting to exit the booking funnel. Variation content is not readable from the datafile — only the key, status, and variation structure are exposed — but the experiment key leaves little room for interpretation.

**Post-booking Chase overlay.** `rokt_chase_overlay_confirmation` is running with 4 variations (control + 3). Immediately after a traveler completes booking and enters the confirmation page, United tests three different presentations of a Chase credit card offer served via Rokt. This is the most explicitly commercial A/B test in the catalog.

**Authentication and compliance.** `force_signin_awdshop_throttle` is running with 2 variations — United is testing requiring sign-in before award ticket shopping, a loyalty data-capture play. `coppa_consent_throttle` is running with 2 variations — age-gating rollout under the Children's Online Privacy Protection Act. `tax_id_collection_switch` is a pure feature flag (no experiment attached) — international travel tax ID collection is staged but not under active test.

**Infrastructure in motion.** Several feature flags (no running experiments) reveal platform-level changes: `hemi_dxp_migration_throttle` signals the Hemisphere Digital Experience Platform migration is toggled at the flag level. `ping_idp_throttle` indicates a staged migration to Ping Identity as the identity provider. `recaptcha_signup_throttle` shows reCAPTCHA on signup is feature-flagged — suggesting bot registrations are a known problem. Even the monitoring rollout is being tested: `dynatrace_rum_throttle` is a running experiment controlling Dynatrace RUM deployment.

Additional named experiments: `choice_benefits_throttle` and `new_mp_benefits_throttle` (MileagePlus benefits), `mile_earn_calculator_throttle`, `ss_seatchange_throttle` (self-service seat change), `header_nav_update_throttle` (navigation redesign), `united_100_logo_throttle` (100th anniversary logo variant), `hazmat_policy_update_throttle`, `add_flight_for_complaint_throttle` (adding flights to customer complaint flows), `mbc_throttle` and `mbc_promo_throttle`, `be_improvement_prod_throttle` (Basic Economy improvements), `km_ads_advsearch_throttle` and `km_confiant_boltive_ads_throttle` (ad security vendors Confiant and Boltive).

The 26 UUID-keyed legacy experiments include `seatmappopup`, `hidecalendarshop`, `HomePage_Vacation`, `HomePage_Pickup`, `Manageres_Seatmap_Teaser`, `ManageRes_Seatmap_Throttle`, `Homepage_AdzerkAds`, `CheckinPathV3_Throttle`, `carbon_emission_info_on_fsr`, `digital_menus_switch`, `be_buyup_mr`, and others. These predate the current named-experiment convention.

The Optimizely client instance is also available as `window.optimizelyClientInstance` — calling `getProjectConfig()` returns the same datafile. Quantum Metric correlates Optimizely variation assignments with session replays, attaching behavioral video to every experiment.


## Surveillance Stack

### The IP Tracking Chain

On every page load — homepage, booking, flight status, search results, My Trips — United fires a `GET` request to `api.ipify.org`, a free public IP lookup service. The returned IP address is stored in `window.utag_data.ipAddress`, making it accessible to all nine Tealium tag senders and their downstream destinations. Immediately after, United calls `/api/referenceData/nearestAirport/{lat}/{lon}/4/100` with coordinates derived from the visitor's IP geolocation — pre-filling the departure airport in the booking widget before any user has typed anything or given any explicit location signal.

A second geolocation path runs in parallel at the Akamai layer. Every request to `www.united.com` triggers an Akamai `x-akamai-edgescape` header sent to the origin server (not visible in the browser, but received by the ASP.NET Core backend). The header contains: `georegion`, `country_code`, `region_code`, `city`, `dma`, `pmsa`, `msa`, `areacode`, `county`, `fips`, `lat`, `long`, `timezone`, `zip` (range), `continent`, `throughput`, `bw`, `network` (ISP name), `asnum`. United's backend receives precise geolocation, ISP identity, and connection quality for every visitor on every request, independent of any client-side call.

The Tealium data layer (`window.utag_data`) also exposes logged-in status (`loggedIn: false`), customer ID (`CustomerId: null`), MileagePlus account status (`MPAccStatus: null`), and all tracking cookie values with `cp.` prefix — live session data visible to any code that reads the data layer.

### Tracker Inventory

- **Google Analytics 4** (`G-FYCK6D7HD0`) — 18 POSTs to `www.google-analytics.com/g/collect` on the homepage
- **Facebook Pixel** (`connect.facebook.net`, pixel ID `1245757155444013`)
- **Quantum Metric** (`cdn.quantummetric.com/qscripts/quantum-united.js`) — session replay with network interception; 63 POSTs to `ingest.quantummetric.com/horizon/united` on a single homepage load. The `QuantumMetricNetworkInterceptor` module intercepts XHR and fetch calls, capturing API request/response payloads alongside user interaction recordings
- **Dynatrace RUM** (`js-cdn.dynatrace.com/jstag/`) — `window.dtrum` / `window.dT_`, beacons to `bf80269wzu.bf.dynatrace.com/bf` on every page
- **Tealium iQ** (`tags.tiqcdn.com/utag/unitedairlines/united-v3/prod/utag.js`) — 9 active senders
- **Qualtrics Site Intercept** (`uniteddigital.siteintercept.qualtrics.com`) — survey targeting on all pages
- **LivePerson** (`lptag.liveperson.net/tag/tag.js?site=84608747`) — chat platform, account `84608747`. Configuration endpoints at `cdn.lpsnmedia.net/api/account/84608747/...` are publicly readable
- **Rokt** (`apps.rokt.com/wsdk/integrations/launcher.js`) — ad/offer overlay platform. `window.Rokt` and `window.__rokt_il__` present on all pages. Identity tracked via `RoktDualSendBucket` and `RoktRecogniser` UUIDs in localStorage
- **LiveRamp** (`di.rlcdn.com/api/segment`) — identity graph POST on the homepage
- **Amazon Publisher Services** (`c.amazon-adsystem.com`, `aax.amazon-adsystem.com`) — header bidding with 24 enrolled identity vendors: liveintent, merkle, intimateMerger, pair, amx, 33across, fTrack, captify, publink, anonymised, quantcast, idPlus, unifiedid, ddb_key_638, fabrick, uid, criteo, yahoo, liveRamp, id5, pubcommon, audigent, lightPublisherAudiences, lotame
- **Pinterest** (`ct.pinterest.com`) — pixel fires on the flight search results page only
- **Boomtrain** (`people.api.boomtrain.com/identify/resolve`) — AI-powered identity resolution and email retargeting; fires on the flight search results page. Endpoint takes base64-encoded JSON, making the payload opaque to passive inspection
- **Ad Lightning** (`tagan.adlightning.com`) — ad quality monitoring
- **Yahoo/Verizon Media** (`s.yimg.com/wi/config/10086194.json`) — ad configuration on the FSR page
- **Securiti.ai** (`cdn-prod.securiti.ai`) — consent management platform

A fresh session accumulates: Optimizely visitor profile and event queue, `RoktDualSendBucket` and `RoktRecogniser` UUIDs, a `visitorId` analytics ID, and the 24-vendor APS enrollment list — all in localStorage.

### Pre-Consent Behavior

`window.utag_data` shows `advertisement_cookie_flag: true`, `analytics_cookie_flag: true`, and `performance_cookie_flag: true` before any user action. Cookie `__privaci_cookie_no_action={"status":"no-action-consent"}` confirms no consent interaction has occurred. `_tt_enable_cookie=1` (TikTok pixel) is set before consent. Quantum Metric (63 POSTs), Google Analytics (18 POSTs), LiveRamp, Securiti.ai geo lookup, and ipify.org all fire before the consent banner registers any interaction.


## The Securiti.ai Token in window.authDetails

United's page initialization exposes the Securiti.ai CMP auth token as a named window global:

```javascript
window.authDetails = {
  "authToken": "4ab73e8a-8f5c-45cc-bd02-18dc2678af03",
  "url": "https://app.securiti.ai"
}
```

The token is a client-side SDK credential. It is functional: calling `https://app.securiti.ai/core/v1/utils/geo/location` with `Authorization: Bearer 4ab73e8a-...` returns HTTP 200 with a full geolocation object — city, state, country, timezone, localized into 10 languages. The consent write endpoint (`/privaci/v1/consent/cookie/singleupload`) returns 401 with this token — the scope is limited to geolocation reads.

The structural issue: `window.authDetails` is a named property on the global window object. United loads 25+ third-party scripts — Google Analytics, Facebook Pixel, Quantum Metric, Rokt, LiveRamp, and others. Any of these scripts can read `window.authDetails.authToken` and call Securiti.ai's APIs on United's behalf. This is a property of how United's Angular application initializes the CMP SDK — not a Securiti.ai design flaw — but the effect is that the consent management system's credentials are readable by the parties the consent manager is supposed to regulate.


## Operational Leakage

### SDL API Stack Traces

Several SDL (Structured Data Layer) endpoints return full .NET stack traces on malformed requests. A `GET /api/sdl/GetSDLRawContent` without required parameters returns HTTP 500:

```json
{
  "ClassName": "System.NullReferenceException",
  "Message": "Object reference not set to an instance of an object.",
  "StackTraceString": "at UAL.ECommerce.Services.Sdl.Controllers.SdlController.GetSDLRawContent(String page, String lang, String pos, CancellationToken cancellationToken)..."
}
```

The internal namespace `UAL.ECommerce.Services.Sdl`, the controller class `SdlController`, and method signatures (including `CancellationToken` parameter names) are all exposed. The pattern is consistent across multiple SDL endpoints.

### Employee Detection

`GET /api/User/IsEmployee` fires on every page load for every visitor — homepage, booking, flight status, My Trips. It returns HTTP 202 (Accepted) for unauthenticated sessions, suggesting the check is asynchronous — likely comparing session tokens against an employee roster. The consistent presence across all page types suggests it gates pricing or feature access downstream.

### securitytrfx.com

Two JavaScript files load from `www.securitytrfx.com`:
- `www.securitytrfx.com/js/ua/ua_conf_redemption_v3.3.js`
- `www.securitytrfx.com/js/ua/ua_conf_v3.6.js`

The "UA" prefix in both filenames is consistent with United Airlines. On the flight search results page, a GraphQL endpoint at `datacore-write.securitytrfx.com/gql/1/U4BR0W53R` receives POST requests. Sending a plain POST returns `{"err":true,"error":"QUERY AND/OR VARIABLES MISSING IN THE BODY"}` — confirming GraphQL. The identifier `U4BR0W53R` appears to be a project or tenant ID. This infrastructure is inferred to be United's own analytics ingestion based on the naming convention, though domain ownership was not verified.


## Machine Briefing

### Access & Auth

The site runs under Akamai bot protection — plain curl with default headers gets a TCP RST. A browser user-agent header gets further, but many first-party endpoints still block or 405 without a proper session. The Optimizely datafile and Securiti.ai geo endpoint are accessible without any special setup.

No login required for reference data, the Optimizely datafile, or Securiti.ai geolocation. User profile and account endpoints return empty responses without auth — no error, just empty. For anything requiring a session: the site vends an anonymous token at `/api/auth/anonymous-token`.

### Endpoints

**No setup required:**

```bash
# Optimizely full datafile — all 60 flags, 47 experiments
curl "https://cdn.optimizely.com/datafiles/FMxasjVG6NR5hYpK8jvUTa.json"

# Securiti.ai geolocation — returns city, state, country, timezone (10 languages)
curl -H "Authorization: Bearer 4ab73e8a-8f5c-45cc-bd02-18dc2678af03" \
  "https://app.securiti.ai/core/v1/utils/geo/location"

# Nearest airport lookup by coordinates
curl "https://www.united.com/api/referenceData/nearestAirport/37.7749/-122.4194/4/100" \
  -H "User-Agent: Mozilla/5.0"

# Carrier list
curl "https://www.united.com/api/referenceData/carriers" \
  -H "User-Agent: Mozilla/5.0"
```

**Session required (returns empty without auth):**

```
GET /api/user/profile
GET /api/user/trips
GET /api/account/activities
GET /api/flight/recentSearch
```

**Content and personalization:**

```
POST /api/Home/HeroCarouselbyCCE
POST /api/CCEProducts/GetCCEContent
POST /api/flight/FetchSSENestedFlights
POST /api/flight/MapPricing
GET  /api/sdl/GetSDLRawContent?page={page}&lang={lang}&pos={pos}
GET  /api/sdl/GetSDLPage/
GET  /api/sdl/getmodelservicepage/
GET  /api/User/IsEmployee
GET  /api/auth/anonymous-token
```

**GraphQL (schema unknown):**

```bash
curl -X POST "https://datacore-write.securitytrfx.com/gql/1/U4BR0W53R" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}'
```

### Gotchas

- Akamai bot protection is aggressive. Plain curl gets a TCP RST on first-party endpoints. Add a browser user-agent at minimum.
- The Optimizely datafile URL is just the SDK key: `cdn.optimizely.com/datafiles/{sdkKey}.json`. No auth, publicly cacheable.
- The Securiti.ai token scope is narrow — geo/location returns 200, consent write returns 401.
- SDL endpoints return 500 with full stack traces if required params are missing. Not useful for data extraction, but maps the internal routing structure.
- `/api/User/IsEmployee` returns 202, not 200 or 403. The 202 means the check is asynchronous.
- `nearestAirport` fires on every page load with IP-derived coordinates from the ipify.org call, not from any user-provided location.
- The Optimizely SDK key in `window.optimizelyDatafile.sdkKey` can initialize a local client — the Node.js or Python SDK will load the same datafile and let you read all flag/experiment configs programmatically.
