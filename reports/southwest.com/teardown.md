---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Southwest Airlines — Teardown"
url: "https://southwest.com"
company: "Southwest Airlines"
industry: "Transportation"
description: "US domestic airline and loyalty program."
summary: "Micro-SPA architecture with each major function (booking, check-in, loyalty) running as a separate React app sharing a 35+ package @swa-ui/* monorepo, served through Akamai CDN/WAF. Each SPA loads a public bootstrap JS file containing the full app configuration -- production API keys, environment topology, promo codes, and experiment defaults -- in a single unauthenticated request. Adobe Launch manages a 25+ tracker surveillance stack where every consent category is hardcoded always-active for US visitors."
date: "2026-04-16"
time: "03:00"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack:
  - React
  - Akamai
  - Adobe Launch
  - Salesforce
  - Apigee
trackers:
  - Quantum Metric
  - Adobe Analytics
  - Adobe Target
  - Adobe Audience Manager
  - Google Ads
  - Google DoubleClick
  - LiveRamp
  - Tapad
  - Branch.io
  - Airship
  - OneTrust
  - Facebook Pixel
  - TikTok Pixel
  - Snapchat Pixel
  - Twitter Pixel
  - LinkedIn Insight
  - Pinterest Tag
  - Amazon Ads
  - Nielsen
  - Neustar
  - Qualtrics
  - Innovid
  - Flashtalking
  - Pardot
tags:
  - airline
  - loyalty
  - api-keys
  - consent
  - akamai
  - adobe
  - a-b-testing
  - session-replay
  - identity-graph
  - geolocation
headline: "Two Southwest employee promo codes — BOARD and SWAEMP20 — are hardcoded in a publicly served JavaScript file alongside six production API keys."
findings:
  - "A 540KB bootstrap JS file served without authentication contains six Apigee API gateway keys across standard, corporate, and employee tiers -- plus the full dev/QA/staging environment topology with internal 'hangar' group assignments."
  - "Two hard-coded employee promo codes -- BOARD and SWAEMP20 -- sit in a named module inside the same publicly-served booking bootstrap, alongside urgency countdown thresholds and a named 'ECM-CHIEFS' promotional campaign trigger."
  - "Akamai injects the visitor's latitude/longitude, DMA market code, FIPS county, zip range, ISP AS number, and estimated bandwidth into every HTML response body as an inline variable -- before any JavaScript or consent framework loads."
  - "All five OneTrust cookie categories including Targeting and Social Media are hardcoded 'always active' for US visitors -- the consent banner offers no functional opt-out, and GPC signals are disabled despite the feature being licensed."
  - "An eight-month-old Adobe Target experiment named '250819_California_featpkgcarousel' is still assigning visitors in April 2026, alongside an active A/B test toggling a combined cash-plus-points payment option."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Southwest Airlines has been flying passengers since 1971 and running a website since the mid-1990s. The result is a layered architecture with the scars of multiple technology generations still visible: a check-in app at version 98.0.0 sitting next to a booking app at version 9.0.1, a 540KB public JavaScript file containing production API keys, and a consent management setup that shows a banner but hardcodes every tracking category as permanently active. The infrastructure works -- planes land, points post, bags get checked. But the seams show.

## Architecture

Southwest's frontend is a micro-SPA architecture. Each major function -- booking, check-in, manage reservation, enrollment, loyalty account -- is a separate React SPA with independent version control and deployment. These share a monorepo of 35+ packages under the `@swa-ui/*` namespace (plus older `swa-*` prefixed packages), managed with webpack builds and a custom requirejs-based bootstrap system.

The sections run at very different version cadences:

| SPA | Artifact | Version | Built |
|-----|----------|---------|-------|
| Home page | `spa-landing-home-page-v2` | 25.0.1 | March 10, 2026 |
| Air booking | `spa-air-booking-v2` | 9.0.1 | March 16, 2026 |
| Check-in | `spa-air-check-in` | **98.0.0** | February 10, 2026 |
| Manage reservation | `spa-air-manage-reservation-v2` | 25.0.0 | March 10, 2026 |
| Loyalty enrollment | `spa-loyalty-enroll` | 15.0.2 | April 2, 2026 |
| Loyalty account | `spa-loyalty-myaccount-v2` | 43.0.1 | March 17, 2026 |
| Corporate/mobile pages | `fm-dotcom-landing-page` | 1.37.0 | March 5, 2026 |

The check-in app's v98 version number is the tell: every other SPA reset to low version numbers as part of a v2 migration, but check-in was never rewritten. It still uses the older `swa-*` package naming convention rather than `@swa-ui/*`. Its dependencies include `swa-chase-prequal` (Chase credit card pre-qualification inserted into the check-in flow), `swa-fit` (Families in Tow special boarding program), and `swa-corporate-login`.

The `fm-dotcom-landing-page` uses an "fm" prefix standing for fragment manager -- it serves corporate, mobile, espanol, and the Southwest WiFi portal (southwestwifi.com).

Akamai sits in front of everything as CDN and WAF. Bot detection runs via Akamai BotManager (`ak_bmsc`, `_abck` cookies with sensor data). The backend sits behind Akamai EdgeSuite; direct calls to `/api/air-pricing/v2/` without a valid session return 403 via Akamai before reaching the origin.

**Subdomains observed:**
- `www.southwest.com` -- main site
- `mobile.southwest.com` -- mobile web
- `mobile-offline.southwest.com` -- offline mobile (in CSP frame-ancestors)
- `espanol.southwest.com` -- Spanish language site
- `swabiz.com` -- corporate booking
- `investors.southwest.com` -- investor relations
- `rapidrewardsshopping.southwest.com` -- shopping portal
- `support.southwest.com` -- Salesforce Service Cloud help center
- `vacations.southwest.com`, `southwesthotels.com`, `southwestcruises.com` -- vacation verticals
- `payment.southwest.com` -- checkout
- `southwestdebit.com`, `app.southwestdebit.com` -- Southwest's branded debit card product

## The Build Manifest Problem

Every SPA exposes a public `/version.json` endpoint. These are unauthenticated, unblocked by the WAF, and follow a consistent pattern:

```
GET https://www.southwest.com/landing/home-page/version.json
GET https://www.southwest.com/air/booking/version.json
GET https://www.southwest.com/air/check-in/version.json
GET https://www.southwest.com/air/manage-reservation/version.json
GET https://www.southwest.com/loyalty/enroll/version.json
```

Each returns a full build manifest including git commit SHA, build timestamp, major version, and which sites the artifact serves:

```json
{
  "git": "b2ea5c1dbb17a670db5d58c28ee454a5c905bfb0 Tuesday, 10 March 2026 at 13:44",
  "artifact": "spa-landing-home-page-v2",
  "version": "25.0.1",
  "majorVersion": "25",
  "sites": ["southwest", "mobile"]
}
```

The booking SPA version endpoint also exposes its full dependency tree, listing every `@swa-ui/*` package version. The git SHAs allow correlation against vulnerability disclosures. The build timestamps narrow the window for patch timing.

## The Bootstrap Files: A Public Architecture Manual

Each SPA section loads a bootstrap JS file at `/swa-ui/bootstrap/{app}/1/data.js`. These are served publicly without authentication and are not blocked by the WAF. The air-booking bootstrap alone is 540KB. Its contents go well beyond configuration -- they form a complete reference manual for Southwest's backend infrastructure.

### Production API Keys

The bootstrap contains Apigee gateway keys for every environment, organized by user class. Six unique keys appear in the main booking bootstrap:

**Standard site (api-keys module):**
```
prod: l7xx944d175ea25f4b9c903a583ea82a1c4c
qa:   l7xxe08bd81cb1034468be902b6ef4dd2c05
dev:  l7xx72f4d7a942b94b648fddadedcc7fe4f3
```

**Corporate/SWABiz (api-keys.corporate module):**
```
prod: l7xxf22053e739864cd0ab0715b5439c24e3
qa:   l7xx87879edbf8f041ef98d14ad8da8b1421
dev:  l7xx70f8fbbcb7004d92b03c2179c1e143b8
```

**Nonrev/employee travel (from the separate nonrev bootstrap):**
```
prod: l7xx09a175cec242473a9fe5553b4dca055a
qa:   l7xxa3596fafa30b4584b0b7555cb0fb95ff
```

These are Apigee API gateway keys -- the credentials the browser-side SPA uses to authenticate API calls to Southwest's backend. They're a necessary component of API access, though not sufficient alone: most booking endpoints also require a valid session cookie and a JWKS-issued JWT. The significance is that they expose the separation between user classes (standard, corporate, employee) and reduce the friction for automated access to unprotected endpoints. The `offline` key for the standard tier matches the `prod` key -- the same key serves both production and the offline environment.

### Hard-Coded Employee Promo Codes

The `swa-bootstrap-air-booking/air/employee-promo-codes` module contains:

```javascript
module.exports = ["BOARD", "SWAEMP20"];
```

These codes are embedded in a 540KB file served to every visitor. `BOARD` and `SWAEMP20` are Southwest employee discount or boarding codes. Their exact current redemption behavior is not verified, but their presence in a publicly-served file is notable.

### Dev Environment Topology

The `swa-bootstrap-air-booking/hangar-info` module exposes Southwest's complete dev/QA/staging environment topology:

```json
[
  {"environments": ["dev2","dev5","dev8","dev10","qa3","qa5"], "hangarId": "UAT"},
  {"environments": ["dev9","qa4"], "hangarId": "UAT2"},
  {"environments": ["dev1","dev4","qa1","qa2","qa6","ptest1","ptest2"], "hangarId": "PDT"},
  {"environments": ["cstg1","efix1"], "hangarId": "MIG"}
]
```

"Hangar" is Southwest's name for environment groupings. The topology includes: dev1-dev10, qa1-qa6, ptest1-ptest2, cstg1, efix1, and an offline environment. The QA API gateway is `search.qa.southwest.com`; staging search is `search.staging.southwest.com`.

### Internal Endpoints and Integrations

The bootstrap contains the internal JWKS production endpoint:

```
https://jwksapi.prod0.tok.jwks-prod.prod.southwest.com/jwks
```

The Ezrez integration for Southwest Vacations booking:
```
prod: https://res.southwestvacations.com/search/ExternalFormPost.aspx
```

And the Points.com storefront URL for Rapid Rewards points purchase:
```
prod: https://storefront.points.com/rapid-rewards/assets/scripts/inline.js
```

### Urgency Display Logic

The `urgency-trigger` module maps promotional campaign IDs to countdown copy with exact time thresholds:

| Threshold | Copy |
|-----------|------|
| 60 minutes | "Final Hour. ${minutesLeft} minutes remaining" |
| 120 minutes | "Last few hours. ${minutesLeft} minutes remaining" |
| 24 hours | "Final day. ${hoursLeft} hours remaining" |
| 3 days | "Offer ends in ${daysLeft} days" |

A named campaign entry called `ECM-CHIEFS` shows "Ending Soon!" at 8 days remaining -- the name suggests an NFL Chiefs partnership promotion with its own urgency config. A `NEW-PROMOTION-greenBG` entry triggers "New Promotion" copy at 7 days. A `DEFAULT` entry shows "Promotion Ended" for past-expiry promotions.

### App Settings and Feature Flags

The `app-settings` module contains the full feature configuration for the booking flow. Notable flags:

- `enableCashPlusPoints: true` -- combined cash+points payment is enabled in the corporate booking path
- `seatSelectionEligibleDate: "2026-01-27"` -- the hardcoded date when assigned seating became available
- `nonBinaryGenderEnabled: true` -- non-binary gender option in passenger forms
- `ninePaxEnabled: true` -- supports bookings up to 9 passengers
- `enablePaymentCardEncryption: true` -- card encryption via JWKS
- `useRocketHotelWidget: true` -- RocketMiles hotel cross-sell on confirmation pages
- `enableOJTVacations: true` -- "OJT" (presumably on-the-job/original) vacations integration
- `frequentTravelersThreshold: 13` -- threshold for frequent traveler designation

The corporate variant has its own settings block with references to `chaseCustomerSegmentId` data stores -- Chase co-brand card status feeds directly into the booking UX for targeted offers.

## Geolocation in Every Response

Akamai's edge layer injects visitor geolocation directly into every HTML response body as an inline JavaScript variable. The injection happens at the Akamai edge before the response is served -- before any JavaScript, before any consent framework loads.

The value observed on homepage load:

```
swa.geolocation="georegion=246,country_code=US,region_code=CA,city=HAYWARD,
dma=807,pmsa=5775,msa=7362,areacode=510,county=ALAMEDA,fips=06001,
lat=37.6687,long=-122.0799,timezone=PST,zip=94540-94545+94557,
continent=NA,asnum=7922,throughput=vhigh,bw=5000"
```

Fields present:
- **georegion** -- Akamai geographic region ID (246 = US)
- **country_code, region_code, city** -- ISO country, state/region, city name
- **dma** -- Nielsen DMA (Designated Market Area) code (807 = San Francisco/Oakland/San Jose)
- **pmsa, msa** -- Primary Metropolitan Statistical Area and Metropolitan Statistical Area codes
- **areacode** -- NANP area code
- **county** -- county name
- **fips** -- FIPS county code (06001 = Alameda County, CA)
- **lat, long** -- latitude and longitude to 4 decimal places (~11m precision)
- **timezone** -- timezone abbreviation
- **zip** -- zip code range (not a single zip)
- **continent** -- continent code
- **asnum** -- Autonomous System number (7922 = Comcast)
- **throughput** -- Akamai-estimated connection tier ("vhigh")
- **bw** -- Akamai-estimated bandwidth in Kbps

This data is parsed and stored in `sessionStorage.geolocation` as a JSON object, extended with `nearestStation` (computed from lat/long: "OAK") and `GDPR: false` (derived from country_code). Southwest uses it for nearest-airport pre-population and content targeting by DMA market.

The `bw=5000` and `throughput=vhigh` fields are Akamai's estimated connection bandwidth -- used to serve different asset qualities or enable/disable features based on connection speed. Because the injection occurs at the Akamai edge for every HTML response, it also appears on error pages and any request that returns an HTML body.

## Surveillance and Consent Architecture

### OneTrust: Banner Without Teeth

Southwest uses OneTrust (UUID `0190c692-914e-7f10-b87d-6a42384a3a4d`) for consent management. Three rule sets are configured: GDPR (EU and select countries), US, and global default.

The US rule has all five cookie categories hardcoded as `Status: always active`:

| Category | Group ID | Always Active |
|----------|----------|---------------|
| Strictly Necessary | C0001 | Yes |
| Functional | C0003 | Yes |
| Performance | C0002 | Yes |
| Targeting | C0004 | Yes |
| Social Media Cookies | C0005 | Yes |

"Always active" in OneTrust means the category cannot be toggled off regardless of user action. The consent banner displays on first visit and offers "Accept all cookies," "Manage preferences," and a close button. All three result in the same outcome: every tracker fires.

The `OptanonConsent` cookie confirms this: `isGpcEnabled=0`, `interactionCount=0`, all groups `,C0001,C0003,C0002,C0004,C0005,` active. The `interactionCount=0` is notable -- the consent record reflects zero user interactions, yet all categories are already active. The default state in the US rule is unconditional activation.

### GPC Signal Handling

Global Privacy Control (GPC) is a licensed feature in the OneTrust tenant configuration (`CookieV2GPC: true` in `TenantFeatures`). However, `IsGPPEnabled: false` is set in the US rule. Browsers sending a GPC signal -- indicating "do not sell or share my personal information" -- receive no change in tracking behavior on southwest.com. The feature is purchased but not enforced.

### Tracker Inventory

The Targeting category (C0004) lists 30+ vendors, all always active:

**Ad platforms:** Snapchat Pixel, Facebook Pixel, TikTok Pixel, Twitter/X Pixel, LinkedIn Insight, Pinterest Tag, Amazon Ads, Google DoubleClick, Google Ads (10 conversion IDs observed on the homepage alone)

**Identity resolution:** LiveRamp RampID (`di.rlcdn.com`), Tapad cross-device tracking

**Analytics and session replay:** Quantum Metric (21 requests per homepage load -- the highest-traffic third-party domain), Adobe Analytics, Nielsen (`nmstat` cookie)

**Marketing automation:** Pardot (Salesforce B2B marketing), Adobe DTM/Launch, Qualtrics Site Intercept

**Ad serving and measurement:** Innovid (connected TV advertising), Flashtalking (`ff.d41.co`)

**Fraud and attribution:** Neustar/TransUnion (`ponos.zeronaught.com`), Branch.io

**Other:** CHOOOSE (`chooose-tagmanager-taggingserver-prod.azurewebsites.net`) -- a carbon offset platform listed in the targeting category but not observed in live homepage or booking network traffic. May fire only at checkout or on specific flight routes.

The data layer shows two `OneTrustLoaded` events: the first fires with empty consent groups, the second immediately after with all groups active. Since all groups are hardcoded active, no tracker waits for the second event -- Google Ads remarketing POSTs fire on the initial page load.

## Advertising Stack and Identity Graph

Southwest runs one of the more complete identity resolution stacks observed among consumer travel sites.

**Anchor identity:**
- `swa_FPID` -- Southwest first-party ID, 20-year expiration (expires 2038). Issued on first visit, Secure-only.
- `AMCV_{OrgID}@AdobeOrg` -- Adobe Marketing Cloud Visitor ID (ECID/MCMID). Adobe org ID: `65D316D751E563EC0A490D4C@AdobeOrg`. Audience Manager subdomain: `swa`, region 9 (US East).

**Session layer:**
- `PIM-SESSION-ID` -- Southwest session tracking
- `QuantumMetricSessionID`, `QuantumMetricUserID` (`QM_S`, `QM_U` in localStorage) -- Quantum Metric replay identifiers
- `mbox` (Adobe Target) -- 2-year persistent PC ID and session ID

**Cross-device and cross-site:**
- LiveRamp RampID (`di.rlcdn.com`, POST `/api/segment`) -- resolves the visitor into a persistent cross-site identity
- Tapad -- cross-device identity graph
- Adobe Audience Manager (`dpm.demdex.net`) -- ID sync across Adobe partner network

**Attribution:**
- `_bcnctkn` -- Branch.io first-party token with 20-year TTL
- `_gcl_au` -- Google conversion linker

**Cross-domain session sharing:**
GTM is configured with a cross-domain linker (`accept_incoming: true`) passing the GA client/session ID to:
- `southwesthotels.com`
- `hotels.redeemrapidrewards.com`
- `southwestcruises.com`
- `business.southwest.com`
- `swabiz.com`
- `vacations.southwest.com`
- `payment.southwest.com`
- `app.southwestdebit.com`
- `southwestdebit.com`

The same GA session follows a user from search through booking, checkout, and into the debit card application -- the entire funnel stitched into a single analytics session.

## A/B Testing and Pricing Experiments

Adobe Target manages experiments through two mechanisms: cookie-level assignments (`tgt_experience` cookie, persisted across sessions) and mbox-level assignments (stored in `sessionStorage.mboxProvider-mboxes`, scoped to the current page context).

The `tgt_experience` cookie on the homepage: `3304004:0,3040212:0,2896351:1,2617163:2` -- four experiment IDs with variant assignments. Each SPA has its own mbox context with different experiment IDs.

From the booking page `mboxProvider-mboxes` sessionStorage:

```json
{
  "appId": "landing-home-page-v2",
  "target": {
    "segment": ["RotatingBannerACQ", "SpOfferChaseAcq", "CB1285532", "250819_California_featpkgcarousel"]
  },
  "test": {
    "CashPlusPointsOptionDisplay": "show"
  }
}
```

**`CashPlusPointsOptionDisplay: "show"`** -- Southwest is A/B testing whether to display a combined cash+points payment option during booking. The "show" arm exposes this option; the other arm hides it. The bootstrap app-settings confirm `enableCashPlusPoints: true` in the corporate booking path, suggesting this feature is already live for SWABiz users while being tested on the consumer site.

**`SpOfferChaseAcq` and `CB1285532`** -- Chase co-brand credit card acquisition segments. These appear in the booking flow through Adobe Target, with the `chaseCustomerSegmentId` data store feeding into mbox parameters at the purchase and price review steps.

**`250819_California_featpkgcarousel`** -- The naming convention suggests this experiment launched on 2025-08-19 (August 19, 2025), targeting California visitors, featuring a vacation package carousel. It was still active and assigning visitors in April 2026 -- eight months after its apparent launch date. Either the experiment became a permanent fixture or the cleanup cycle missed it.

The booking bootstrap's `mboxDefaults` section also contains default test assignments for multiple experiments:

- `airSelectFlightResultsLayout: "multiFareEngage"` -- the default flight results layout
- `airBookingPointsUpgrade: "show"` -- points upgrade prompt shown by default
- `airBookingSelectFlightSortBy: "stops"` -- default sort is by number of stops
- `airBookingSelectFlightsFareOrder: "reverse"` -- fare classes displayed in reverse order by default

These defaults represent the "control" arm of each experiment. When Adobe Target assigns a visitor to a different variant, the default is overridden.

## Additional Infrastructure Details

**In-band ToS warning:** The response header `terms-of-service: Unauthorized access, display, or use of Southwest's Company Information, including fare data, is prohibited by the Terms & Conditions on Southwest.com and Swabiz.com.` appears on every HTML response. An unusual choice -- embedding a legal warning in an HTTP header rather than in the page body, aimed at automated scrapers reading headers.

**Load balancer fingerprint:** The `akaalb_alb_prd_southwest_spa` cookie (20-year TTL, HttpOnly, Secure, SameSite=None) encodes the backend pool assignment: `~op=PrdSouthwestSpaV2_lb:PrdSouthwestSpaV2`. This names the internal load balancer pool.

**Security disclosure:** `/.well-known/security.txt` exists, PGP-signed, routes to `securityreport@wnco.com` (WN Co = Southwest's holding company, ticker WN).

**Payment infrastructure:** Stripe (`m.stripe.com`) and Uplift (buy-now-pay-later for travel, `uplift-platform.com`) are both in the strictly necessary category -- always loaded. `payment.southwest.com` handles checkout and is included in the GA cross-domain linker.

**Salesforce footprint:** The support subdomain (`support.southwest.com`) runs on Salesforce Service Cloud. Live Agent chat is in the Functional category. Pardot handles B2B marketing in the Targeting category. A separate Salesforce Customer 360 sitemap (`/sitemap-c360.xml`) is disallowed in robots.txt but publicly accessible -- it maps high-value content pages for CRM content indexing (assigned seating, Rapid Rewards tiers, airfare types, citizenship requirements, route map).

**Vacation packages API (unauthenticated):** `GET /vacations/packages/tripProfiles/{id}/searchProfiles/{id}` returns full package pricing without authentication. Responses include CASH and POINTS price breakdowns, room options, flight options, taxes, and Rapid Rewards earning quantities. Example: a Cabo San Lucas package at $1,738.46 USD with prepay base $1,262.34, earning 6,311 RR points. Profile IDs observed on the homepage: LP-TP-450 through LP-TP-454.

**Robots.txt oddities:** The robots.txt explicitly allows AhrefsBot and Screaming Frog with no restrictions -- unusual for a site that otherwise takes an aggressive anti-scraping posture (Akamai BotManager, custom ToS header, WAF-protected APIs). The file also references sitemaps on six subdomains including `espanol.southwest.com`, `mobile.southwest.com`, and `investors.southwest.com`.

## Machine Briefing

### Access and Auth

Most read endpoints work without authentication. `curl` is sufficient for static assets and version manifests. The Akamai WAF returns 403 on authenticated API paths without a valid session cookie. Getting a real session requires a browser-based login flow (sets `PIM-SESSION-ID`, `swa_FPID`, and Adobe ECID cookies). For the vacation packages API and version manifests, no session is needed.

### Open Endpoints

**Version manifests -- no auth:**
```
GET https://www.southwest.com/landing/home-page/version.json
GET https://www.southwest.com/air/booking/version.json
GET https://www.southwest.com/air/check-in/version.json
GET https://www.southwest.com/air/manage-reservation/version.json
GET https://www.southwest.com/loyalty/enroll/version.json
```

**Bootstrap files -- no auth (540KB+):**
```
GET https://www.southwest.com/swa-ui/bootstrap/air-booking/1/data.js
GET https://www.southwest.com/swa-ui/bootstrap/nonrev-home-page/1/data.js
```

**Vacation packages search -- no auth:**
```
GET https://www.southwest.com/vacations/packages/tripProfiles/LP-TP-450/searchProfiles/LP-SP-435
GET https://www.southwest.com/vacations/packages/tripProfiles/LP-TP-451/searchProfiles/LP-SP-435
# Profile IDs observed: LP-TP-450 through LP-TP-454
```

**Salesforce C360 sitemap -- no auth (disallowed in robots.txt):**
```
GET https://www.southwest.com/sitemap-c360.xml
```

**Security contact:**
```
GET https://www.southwest.com/.well-known/security.txt
```

### Session-Required Endpoints

**Booking search (requires session + Apigee key):**
```
POST https://www.southwest.com/api/air-booking/v1/air-booking/page/air/booking/shopping
```

**Content delivery (requires session context):**
```
POST https://www.southwest.com/api/content-delivery/v1/content-delivery/query/placements
```

**Client logging (no meaningful auth, 204 response):**
```
POST https://www.southwest.com/api/logging/v1/logging/desktop/log
```

**Adobe Target delivery (session-based):**
```
POST https://www.southwest.com/rest/v1/delivery
```

### Apigee Key Format

Keys follow the `l7xx{32-char-hex}` format. Send as `apikey` header or query parameter depending on the endpoint. Standard prod key: `l7xx944d175ea25f4b9c903a583ea82a1c4c`. These alone do not bypass WAF protection on authenticated routes -- a valid browser session cookie (`PIM-SESSION-ID`, `swa_FPID`) is also required for most booking APIs.

### Geolocation

Every HTML response includes `swa.geolocation="{Akamai-string}"` in the response body. No credentials needed. Useful for confirming Akamai's geolocation attribution from any IP.

### Gotchas

- Akamai BotManager monitors request patterns. The `_abck` cookie contains sensor data for bot scoring; unusual patterns (no JS execution, missing cookies) will escalate to challenge responses.
- The `terms-of-service` header appears on every response -- Southwest has made its scraping policy explicit in-band.
- Vacation package profile IDs are not sequential across all trip profiles. The homepage-featured IDs (LP-TP-450 through LP-TP-454) are a subset of a broader range.
- The JWKS endpoint `/api/security/v4/security/digital/jwks` returns 400120102 BAD_REQUEST without proper session context -- it expects a specific request format, not a plain GET.
- Adobe Target `mboxProvider` sessionStorage populates after `POST /rest/v1/delivery` completes. The data reflects server-side experiment assignments for the current session.
