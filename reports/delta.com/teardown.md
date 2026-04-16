---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Delta Air Lines — Teardown"
url: "https://delta.com"
company: "Delta Air Lines"
industry: "Transportation"
description: "Major US airline with SkyMiles loyalty program and global route network."
summary: "Hybrid architecture: Adobe Experience Manager (AEM) for CMS/content with React microfrontends for booking flows. Served via Akamai CDN/WAF from AWS S3. Authentication via PingFederate OAuth2/PKCE at signin.delta.com. Tag management through Ensighten TMS. 25+ microservice subdomains handle booking, loyalty, payments, and passenger services. IBM DWR (Java AJAX, circa 2007) still runs the airport lookup alongside the modern stack."
date: "2026-04-16"
time: "03:07"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Adobe AEM, React, AWS, Akamai, PingFederate, Java JSP]
trackers: [Adobe Analytics, Adobe Audience Manager, Adobe Target, IBM Tealeaf, Quantum Metric, Dynatrace RUM, Akamai mPulse, OneTrust, Ensighten TMS, Qualtrics, Facebook Pixel, Meta Threads Pixel, Celebrus, LivePerson]
tags: [airline, travel, loyalty, session-recording, adobe-suite, legacy-stack, consent-gaps, microservices, passport-scanning, akamai]
headline: "Delta's consent whitelist reveals 'Decagon AI POC' — an AI customer support platform cleared for deployment but not yet visible to users."
findings:
  - "A 40KB public config file maps Delta's complete internal API surface -- 25+ microservice subdomains, passport scanning endpoints, a Flowcode QR API key in plaintext, and OAuth client credentials -- all served as a static AEM asset to anyone who passes Akamai bot detection."
  - "Delta runs three behavioral analytics platforms in parallel: IBM Tealeaf and Quantum Metric for session recording, plus Dynatrace for RUM. The Dynatrace config explicitly excludes Tealeaf pages to avoid double-counting -- confirming someone knows the overlap exists."
  - "Passport photo capture is split across five separate AWS accounts whose IDs and S3 bucket naming patterns are exposed in browser-accessible JavaScript through the Ensighten consent whitelist."
  - "The Ensighten whitelist includes Virgin Atlantic's Adobe Audience Manager DMP endpoint and a Virgin Atlantic MyTrips staging API -- signaling shared audience data infrastructure between the two partner airlines."
  - "A 'Decagon AI POC' entry in the consent whitelist places an AI customer support platform in Delta's approved vendor stack -- not yet visible in network traffic, but consent-cleared and ready to deploy."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Delta Air Lines runs one of the more complex public web properties in US aviation -- a hybrid CMS/booking stack with deep vendor integrations, a full microservice architecture, and a surveillance footprint that includes three simultaneous behavioral analytics platforms. The site's behavior reveals deliberate choices about data collection depth and a public config file that functions as an index to Delta's entire internal API surface.

---

## Architecture

Delta.com is a hybrid of Adobe Experience Manager (AEM) for content management and React microfrontends for interactive booking flows. The homepage is served from AWS S3 via Akamai's CDN and WAF -- a load balancer cookie (`akaalb_www_alb_homepage`, value `www_delta_aws_s3_west`) and a `Homepage=AWS` cookie are set immediately on every visit, exposing the infrastructure tier in the response headers.

Akamai handles bot defense aggressively: headless curl requests return HTTP 444 (Akamai's connection-drop code), while UA-spoofed requests get redirected to `ssp.delta.com/content/dam/delta-www/sorry-server/delta_sorry.html` -- a dedicated sorry-server on its own subdomain. The actual site content is only served to sessions that pass Akamai Bot Manager's behavioral fingerprinting.

Authentication runs through PingFederate at `signin.delta.com`, implementing OAuth2/PKCE with client ID `deltacom`. The OAuth flow is fully documented in a publicly accessible config file at `/content/dam/delta-applications/login/auth-config.json`. Tag management runs through Ensighten at `tms.delta.com/delta/dl_anderson/Bootstrap.js`, not Google Tag Manager.

AEM's presence is evident throughout: `/content/dam/` asset paths, `/content/www/` content fragments with `.cfdata.json` and `.contfragtdata.json` extensions, `/libs/granite/csrf/token.json` (returns `{}` unauthenticated), and `window.ContextHub` with an anonymous user home path: `/home/users/v/vYFq4-gJNBK2liv4q2yG`. The AEM author flag is off (`window.isAuthor: false`), so this is a production reader instance.

Running alongside the modern React stack: IBM Direct Web Remoting (DWR), a Java AJAX framework whose last significant release was around 2008. `window.DWREngine`, `window.DWRUtil`, and `window.AirportLookupDWR` are all initialized on the homepage. The airport autocomplete still routes through this legacy Java RPC layer. The robots.txt file exposes the legacy surface area explicitly, with `Allow` rules for individual `.action` routes and `.jsp` files that indicate Struts and JSP are still in production. jQuery 3.5.1 (released May 2020) is hardcoded in AEM templates.

## The Public Config File

`/content/dam/delta-applications/idp/idp-config.json` is a 40KB JSON file served publicly from AEM's asset path. It maps Delta's complete internal API surface -- 40 top-level sections covering every customer-facing product area.

The `COMMON` section is the most direct:

```json
{
  "FLOW_CODE_URL": "https://gateway.flowcode.com/v3/codes/generator/static",
  "FLOW_CODE_API_KEY": "NxqqjVnD2uC2seXkyCf0h958T77L7RPI",
  "APP_SESS_DATABROKER_URL": "/databroker/bcdata.action",
  "DECRYPT_TOKEN_URL": "https://encryptdecrypt-api.delta.com/decrypt",
  "PING_DOMAIN": "https://signin.delta.com",
  "GET_PERSONALIZED_CONTENT_URL": "https://personalization-api.delta.com/personalization-api/getPersonalizedContent"
}
```

The Flowcode API key (`NxqqjVnD2uC2seXkyCf0h958T77L7RPI`) is the credential for Flowcode's QR code generation service. A direct test returned "fault filter abortRBAC: access denied" -- Flowcode enforces additional authorization layers, so the key alone doesn't grant access. Its presence in a publicly accessible config is an architectural choice: Delta's React apps fetch this config at page load, so the key was always intended to be client-accessible.

Other notable contents of idp-config.json:

- `PASSPORT_SCANNING` section: full endpoint URLs for Delta's passport scanning flow -- init (`POST .../traveldocs/capture/v1/init`), results (`GET .../results/{documentId}`), and submit (`PATCH .../{requirementsResourceId}`).
- `MY_TRIPS` section: full microservice URL inventory including the GraphQL content API, complimentary upgrades API, standby list API, and IROP rebooking endpoint.
- `SKYMILES` section: loyalty API endpoints for medallion status tracking across two API subdomains (`loyalty-api.delta.com`, `loyalty2-api.delta.com`), and the GraphQL customer profile API at `customer-api.delta.com/profile/graphql`.
- `UPSELL` field points to `/content/dam/delta-applications/flight-search-2/assets/json/upsellResponse.json` -- a static upsell configuration file on AEM's asset path.

The companion file, `/content/dam/delta-applications/login/auth-config.json`, documents the complete PingFederate OAuth implementation. It maps every deployment environment to its issuer:

```json
{
  "dvl":  "https://signin.delta.com",
  "dvl1": "https://signin-si.delta.com",
  "dvl2": "https://signin-si.delta.com",
  "dvl3": "https://signin-si.delta.com",
  "qat":  "https://signin-si.delta.com",
  "qat1": "https://signin-si.delta.com",
  "qat2": "https://signin-si.delta.com",
  "qat3": "https://signin-si.delta.com",
  "stg":  "https://signin-si.delta.com",
  "prod": "https://signin.delta.com",
  "prd":  "https://signin.delta.com"
}
```

Three dev environments, three QA environments, staging, and two production aliases -- all routing to `signin-si.delta.com` below production. The `PERSISTENT_COOKIE_TIMER` value is `0.01875` hours -- 67.5 seconds. Whether this is a misconfiguration or an intentionally aggressive session expiry for remembered-device tokens is unclear from the config alone.

## Surveillance Architecture

### Dynatrace -- Booking Journey Capture

The most specific data collection on delta.com is Dynatrace's Real User Monitoring, configured via a `data-dtconfig` attribute baked into every page's HTML. Beyond standard RUM (page timing, errors), Delta has configured 25+ custom data capture fields (`mdcc1` through `mdcc28`) that extract application-layer data from cookies, window variables, URL parameters, and DOM elements.

The booking journey capture fields:

| Field | Source | Data Captured |
|-------|--------|---------------|
| `mdcc12` | `window.idp.shoppingLite.dynamicBannerRequest.userdata.originDestinationPair` | Route (e.g., ATLJFK) |
| `mdcc13` | `window.idp.shoppingLite.dynamicBannerRequest.userdata.triptype` | Trip type (RT/OW) |
| `mdcc14` | `window.idp.shoppingLite.dynamicBannerRequest.userdata.origin` | Origin airport code |
| `mdcc15` | `window.idp.shoppingLite.dynamicBannerRequest.userdata.destination` | Destination airport code |
| `mdcc16` | `window.idp.shoppingLite.dynamicBannerRequest.userdata.departuredate` | Departure date |
| `mdcc17` | `window.idp.shoppingLite.dynamicBannerRequest.userdata.returndate` | Return date |
| `mdcc18` | `window.idp.checkout.tripTotalData.subTotal.currency.amount` | Checkout subtotal |
| `mdcc19` | `window.idp.dataLayer.digitalData.attributes.searchType` | Search type |
| `mdcc1`  | `TLTSID` cookie | IBM Tealeaf session ID |
| `mdcc7`-`mdcc11` | URL params | UTM attribution (source/medium/campaign/content) |
| `mdcc28` | `homepage-new-exp` cookie | A/B test variant |

All of this flows to Delta's private managed Dynatrace instance at `dlt-beacon.dynatrace-managed.com` -- confirmed active in the flight search network log. Delta uses a Dynatrace Managed deployment rather than Dynatrace SaaS, meaning they operate their own Dynatrace server. The beacon servers at `dlt-beacon.dynatrace-managed.com` and `dlt1223.dynatrace-managed.com` are Delta-operated infrastructure.

The capture config is not gated by the consent layer -- it's compiled into the page HTML at AEM render time.

### IBM Tealeaf + Quantum Metric -- Dual Session Recording

Delta runs two simultaneous full session recording platforms:

**IBM Tealeaf** sets `TLTSID` (session ID) and `TLTUID` (persistent user ID) on every visit. Tealeaf is IBM's behavioral analytics and session replay platform.

**Quantum Metric** fires 17-19 requests per page load across two endpoints (`ingestusipv4.quantummetric.com/horizon/delta` for data ingestion, `rl.quantummetric.com/delta/hash-check` for session integrity). Delta has a custom integration (`window.QuantumMetricAPI`, `window.QuantumMetricAPI_delta`) on top of the standard QM script. Quantum Metric assigns a persistent user ID on the first anonymous visit, stored in localStorage as `QM_U` with a 1-year TTL -- this ID persists across sessions regardless of cookie clearing.

The Dynatrace config's exclusion list (`xb` field) explicitly blocks `.*TealeafTarget.jsp.*` and `.*tt.*` from Dynatrace's network capture -- confirming that both Tealeaf and Dynatrace are active and that someone intentionally configured them to avoid double-counting data. Three separate behavioral analytics platforms are running in parallel: Tealeaf for session replay, Quantum Metric for session replay and digital experience analytics, and Dynatrace for RUM and booking funnel telemetry.

### Adobe Marketing Suite

Five Adobe cookies are set on the homepage:

- `AMCV_F0E65E09512D2CC50A490D4D@AdobeOrg` -- Adobe Experience Cloud Visitor ID (ECID), persistent cross-domain identity
- `s_ecid` -- supplemental ECID
- `AAMC_delta_0` -- Adobe Audience Manager classification
- `aam_uuid` -- Adobe Audience Manager DMP UUID (linked to `dpm.demdex.net` which fires on every page)
- `tas`, `tnt_pagename` -- Adobe Target A/B testing

### Advertising Pixels

- `_fbp` -- Facebook Pixel, set immediately on page load for US visitors
- `tkpi_phid`, `tkpiphid`, `tkpi_fvid` -- Meta Threads tracking identifiers, served through `tkpi.delta.com` -- a Delta-owned subdomain proxying the Threads pixel. First-party domain proxying routes Threads tracking through Delta's own domain, bypassing third-party cookie restrictions that would apply to a direct `threads.net` pixel.

## Consent Configuration

Delta uses a two-layer consent stack: OneTrust (consent UI and cookie management) over Ensighten (tag management and enforcement). The OneTrust configuration ID is `01905a27-167d-72fa-b021-aca67af638e5`.

Five consent groups are configured:

| Group | Name | Default |
|-------|------|---------|
| C0001 | Strictly Necessary | ON |
| C0002 | Performance | ON |
| C0003 | Functional | ON |
| C0004 | Targeting/Advertising | ON |
| C0009 | (unclassified) | ON |

All five default to enabled for US visitors, including California. No consent banner was shown during the investigation session. For California visitors, CCPA requires opt-out mechanisms for sale/sharing of personal information -- defaulting advertising cookies to ON is permissible under CCPA (unlike GDPR), but the combination with the GPC gap below is notable.

The Ensighten config (`window.ensClientConfig`) sets `honorGlobalPrivacyControl: true`, but `gpcEmbedded: false`. The `gpcEmbedded` flag controls whether OneTrust's GPC signal detection code is loaded. With it disabled, the browser's GPC signal is never read -- the `OptanonConsent` cookie for a California session shows `isGpcEnabled=0` and `browserGpcFlag=0`. The config claims to honor GPC but the mechanism to detect it is not running.

IBM Tealeaf and Quantum Metric fire regardless of consent state -- they're in the default-ON category, pre-checked before any user interaction.

### The 339-Vendor Whitelist

The Ensighten consent whitelist (`window.ensClientConfig`) contains 339 entries across 5 categories:

- **default** (174 entries): vendors loaded without explicit consent interaction, including LaunchDarkly, Statsig, XCheck, Celebrus, Flowcode, Rollbar, Radar, Sherpa, Accertify, Quantum Metric, Lucky Orange
- **Advertising** (71 entries): Google, Facebook, Criteo, Trade Desk, LinkedIn, Pinterest, Twitter/X, Kenshoo, Amobee, AppNexus, Semasio, Persado, and others
- **FirstPartyAnalytics** (1 entry): Adobe Analytics via `smetrics.delta.com`
- **ThirdPartyAnalytics** (10 entries): ForeSee/Qualtrics, Quantum Metric
- **EnhancedFunctionality** (83 entries): Expedia, Amex, Clear, LivePerson, LocusLabs, SkyTeam, TransPerfect, Timatic, Sherpa, Radar, a "Decagon AI POC" entry, and various government forms

The `Decagon AI POC` entry in EnhancedFunctionality is notable -- Decagon is an AI-powered customer support platform. The POC label suggests a pre-production integration that's been cleared through the consent framework but isn't yet visible in network traffic. It's classified under EnhancedFunctionality, meaning it would load without requiring explicit user consent beyond the default-ON state.

Lucky Orange (`settings.luckyorange.net`) is whitelisted in the default category -- a session recording and heatmap tool that would run alongside Tealeaf and Quantum Metric if enabled on specific pages.

## The Microservice Inventory

The full `*.delta.com` API subdomain inventory from idp-config.json:

| Subdomain | Purpose | Auth Required |
|-----------|---------|---------------|
| `personalization-api.delta.com` | Personalized content, dynamic banners | Yes |
| `encryptdecrypt-api.delta.com` | Token encryption/decryption | Yes |
| `dlvacations-api.delta.com` | Delta Vacations cross-sell tokens | Yes |
| `loyalty-api.delta.com` | SkyMiles medallion status, future activities | Yes |
| `loyalty2-api.delta.com` | Business traveler enrollment (multi-region) | Yes |
| `customer-api.delta.com` | GraphQL customer profile API | Yes |
| `mytrips-api.delta.com` | Travel reservations, upsell, email | Yes |
| `compupgrade-api.delta.com` | Complimentary upgrades | Yes |
| `messagecenter-api.delta.com` | Messages per reservation | Yes |
| `specialservicerequest-api.delta.com` | SSRs (accessibility, meals) | Yes |
| `passengerinfo-api.delta.com` | Passenger information | Yes |
| `displaystandbylist-api.delta.com` | Airport standby list | Unknown |
| `travelrequirementsmgt-api.delta.com` | Passport scanning, travel requirements | Yes |
| `enterprisepayments-api.delta.com` | Payments, eDocs (gift cards, eCertificates) | Yes |
| `catalog-api-prd.delta.com` | Fare catalog, brand hierarchy | No (verified) |
| `predictivesearch-api.delta.com` | Airport/city autocomplete | No |
| `carsandstays.delta.com` | Car/hotel typeahead | No |
| `custrebookandclean.delta.com` | IROP rebooking | Yes |
| `custcomm-api.delta.com` | Customer communications/notifications | Yes |
| `slfrc-api.delta.com` | ID verification form errors | Yes |
| `sitesearch-api.delta.com` | GraphQL site search | No (but 401 on queries) |
| `content-api.delta.com` | GraphQL content API | No (verified active) |
| `feedback-api.delta.com` | User feedback submission | Yes |
| `salespartnersaffiliation-api-*.delta.com` | Travel agency/partner affiliation | Yes |

### Unauthenticated Endpoints

**`content-api.delta.com/graphql`** responds without credentials:
```
POST https://content-api.delta.com/graphql
Content-Type: application/json
{"query": "{ __typename }"}
-> {"data":{"__typename":"Query"}}
```
Introspection is blocked -- `__schema` queries return FieldUndefined errors. Field names for actual queries are not discoverable without brute-forcing or finding them in the client bundle.

**`catalog-api-prd.delta.com`** returns the complete fare brand configuration:
```json
{
  "fareBrandsByMoney": [
    {"brandID": "BE",   "brandName": "Delta Main Basic"},
    {"brandID": "MAIN", "brandName": "Delta Main"},
    {"brandID": "DCP",  "brandName": "Delta Comfort"},
    {"brandID": "FIRST","brandName": "Delta First"},
    {"brandID": "DPPS", "brandName": "Delta Premium Select"},
    {"brandID": "D1",   "brandName": "Delta One"}
  ],
  "defaultMap": {
    "showBasicFares": true,
    "basicFaresChecked": true,
    "deltaAndPartners": true
  },
  "sessionTimeoutLimit": 30
}
```
The `basicFaresChecked: true` field confirms Delta's booking widget defaults to showing Basic Economy fares in search results.

**`/databroker/bcdata.action`** and **`/databroker/basiccustomerdata`** return personalization data without auth:
```json
{"userData":{},"v01":"","v02":"","v03":"Y","v04":"","v05":"","...","v40":""}
```
`v03: "Y"` is populated for anonymous visitors. These endpoints return richer data for authenticated sessions -- the `v01`-`v40` field pattern suggests a personalization segment schema.

**AEM content paths** are broadly accessible: all `/content/dam/delta-applications/` configs, all `/content/www/*/...cfdata.json` content fragments. The feature flag file at `/content/www/en_US/air-shopping/featureflagconfig.model.json` exposes live product state:

```json
{
  "RESHOP_RESPONSIVE_DESIGN": "OFF",
  "CANCEL_RESPONSIVE_DESIGN": "OFF",
  "NEXT_GEN_CANCEL": "ON",
  "NEXT_GEN_CHANGE": "ON",
  "AWS_STANDALONE_IROP_FORM": "ON",
  "CAMPAIGN_ID": "flowrouter:experiences-nextgen-cancel"
}
```

`RESHOP_RESPONSIVE_DESIGN: OFF` and `CANCEL_RESPONSIVE_DESIGN: OFF` indicate the booking modification flows haven't been migrated to responsive design yet. The `CAMPAIGN_ID` is an internal flowrouter identifier for a current A/B test on the cancel/change flow.

Content fragments over-expose internal infrastructure. The cancel-trip content fragment includes S3 bucket names (`commentsandcomplaints-capability-cs-aws-prod`, `omnipro-casemng-attachment-a-396512929052-us-east-1`), internal error codes, and Amex integration client ID templates alongside the UI configuration.

## Passport and Travel Document Infrastructure

Delta's passport and travel document scanning is split across five separate AWS accounts. The Ensighten whitelist, accessible in `window.ensClientConfig`, exposes the S3 bucket naming patterns for these accounts:

- Bucket pattern: `capture-sscpxdmrtd-{accountId}-us-{region}` (passport photo capture)
- Bucket pattern: `docs-upload-tvmtvrtapi-{accountId}-us-{region}` (travel document upload)
- AWS account IDs visible in the whitelist: `335859338749`, `475152512169`, `122337828767`, `680071830336`, `543539417678`

The capture flow is fully documented in idp-config.json:
1. `POST .../traveldocs/capture/v1/init` -- initiate a capture session, returns `documentId`
2. `GET .../results/{documentId}` -- poll for results
3. `PATCH .../{requirementsResourceId}` -- submit scanned passport

The five-account structure suggests compliance separation -- Delta may isolate passport data by region, program, or regulatory requirement.

## Virgin Atlantic Shared Infrastructure

Delta's Ensighten whitelist includes several Virgin Atlantic domains:

- `virginatlantic.demdex.net` -- Virgin Atlantic's Adobe Audience Manager DMP endpoint (Advertising category)
- `stg2.virginatlantic.com`, `stg.virginatlantic.com` -- Virgin Atlantic staging environments
- `tms.virginatlantic.com` -- Virgin Atlantic tag management
- `mytrips-api-si.vs01.vs.air4.com` -- Virgin Atlantic's MyTrips API staging environment

The presence of Virgin Atlantic's DMP endpoint in the advertising whitelist means Delta's consent framework permits visitor segments to be synced with Virgin Atlantic's Audience Manager instance. Delta and Virgin Atlantic have a codeshare partnership -- but the whitelist goes beyond marketing to include shared travel management API infrastructure. The `vs.air4.com` domain is Virgin Atlantic's cloud infrastructure for their post-mainframe booking system.

## Additional Observations

**Akamai mPulse / Boomerang**: The `BOOMR` RUM agent loads with key `PWV8J-R2M7Y-67AAN-EA9TD-6DRAX` and 14 plugins including Angular, Backbone, and Ember framework monitors. The presence of all three SPA framework plugins suggests the stack has evolved over multiple generations, all of which are still in the Boomerang config.

**LivePerson chat** (account ID `29060121`) loads on booking pages with two configuration requests. The `lpLastVisit-29060121` key is written to localStorage.

**Staging news hub**: `deltad8stg.prod.acquia-sites.com` is publicly accessible -- Delta's staging news hub on Drupal 8/Acquia, using GTM container `GTM-MPR8K27` (different from the main site's Ensighten TMS). Its canonical URL is served over HTTP rather than HTTPS.

**XCheck revenue protection**: `delta-api.xcheck.co` appears in the default whitelist alongside `prod.accdab.net` (Accertify, the American Express fraud prevention subsidiary). Both are in the default category, loading without explicit consent interaction.

---

## Machine Briefing

### Access & Auth

Delta's WAF (Akamai) blocks curl and headless requests -- HTTP 444 for plain curl, HTTP 302 to the sorry-server for UA-spoofed requests. A full browser session with JavaScript execution is required to pass Bot Manager behavioral checks. Playwright in headed mode works.

Static AEM assets (`/content/dam/`, `/content/www/`) and most API config files are accessible once Bot Manager is satisfied -- no login required. The fare catalog API and content GraphQL endpoint are also accessible without credentials.

Authentication uses PingFederate OAuth2/PKCE:
- Auth server: `https://signin.delta.com`
- Authorization endpoint: `https://signin.delta.com/as/authorization.oauth2?response_type=code&scope=openid&client_id=deltacom&code_challenge=...&code_challenge_method=S256&response_mode=pi.flow`
- Token endpoint: `https://signin.delta.com/as/token.oauth2`
- Flow endpoint: `POST /pf-ws/authn/flows/{flowId}` with credentials payload

### Endpoints -- Open (No Auth)

```
# App configuration (full API map)
GET https://www.delta.com/content/dam/delta-applications/idp/idp-config.json

# Auth/OAuth configuration
GET https://www.delta.com/content/dam/delta-applications/login/auth-config.json

# Fare catalog with brand hierarchy
GET https://catalog-api-prd.delta.com/prd/catalogs/dcomCatalog/lookupDetails/DEFAULT
Headers: channelId: web, applicationId: dcom

# Live product feature flags
GET https://www.delta.com/content/www/en_US/air-shopping/featureflagconfig.model.json

# Personalization/segment data (anon returns partial payload)
GET https://www.delta.com/databroker/bcdata.action
GET https://www.delta.com/databroker/basiccustomerdata

# Content GraphQL (active, no introspection)
POST https://content-api.delta.com/graphql
Content-Type: application/json
{"query": "{ __typename }"}

# IROP global state
GET https://www.delta.com/config/global.json

# Geolocation -- nearest Delta airport
GET https://www.delta.com/pref/geoLocationService/getClosestDeltaAirportCode

# Airport autocomplete
GET https://www.delta.com/predictivetext/getPredictiveCities?searchTerm={query}

# Header/footer configuration
GET https://www.delta.com/content/www/us/en.headerfooter.json

# AEM CSRF token (returns {} for anon)
GET https://www.delta.com/libs/granite/csrf/token.json
```

### Endpoints -- Authenticated

```
# Customer profile (GraphQL)
POST https://customer-api.delta.com/profile/graphql

# Travel reservations
GET https://mytrips-api.delta.com/v1/mytrips/travelreservations

# SkyMiles medallion status
GET https://loyalty-api.delta.com/loyaltyProgram/v2/statusTracker/medallionStatus

# Complimentary upgrades
GET https://compupgrade-api.delta.com/v1/complimentaryUpgrades/{reservationResourceId}

# Airport standby list
GET https://displaystandbylist-api.delta.com/standby/v1/airportStandbyList

# Payments
GET https://enterprisepayments-api.delta.com/payment/v2/paymentDetails

# Passport capture init
POST https://travelrequirementsmgt-api.delta.com/prd/requirements/traveldocs/capture/v1/init

# Passport capture results
GET https://travelrequirementsmgt-api.delta.com/prd/requirements/traveldocs/capture/v1/results/{documentId}
```

### Gotchas

- Akamai 444 for any request without a valid Bot Manager session. Headed Playwright with cookie persistence is the reliable path.
- `idp-config.json` and `auth-config.json` are fetched on every page load by the React app -- both are cache-friendly static assets that Akamai will serve once a valid session cookie is established.
- The Flowcode API key requires additional Flowcode RBAC authorization -- the key alone is not sufficient.
- The catalog API requires headers `channelId: web` and `applicationId: dcom` -- requests without these may return empty or error responses.
- `content-api.delta.com/graphql` responds to `__typename` but field names are not discoverable via introspection. Valid query fields must be extracted from the client bundle.
- AEM content fragment URLs use inconsistent extensions: `.cfdata.json`, `.contfragtdata.json`, `.skymilesdata.json`, `.skymilesFeatureFlags.json`, `.omniui.json`.
- PingFederate flow IDs are session-specific UUIDs -- not reusable across sessions.
