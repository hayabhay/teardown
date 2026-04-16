---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "American Airlines — Teardown"
url: "https://www.aa.com"
company: "American Airlines"
industry: "Transportation"
description: "US major airline operating 6,700+ daily flights across 50 countries."
summary: "Dual-architecture site -- legacy JSP pages coexist with React micro-apps for booking and reservation management. Akamai handles CDN, WAF, and bot detection. Tealium iQ manages a 728KB analytics container with manual tag firing. PingFederate provides customer auth at login.aa.com and employee auth at pfloginapp.cloud.aa.com. Dallas datacenter with blue/green deployment visible in cookies."
date: "2026-04-16"
time: "03:05"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [jQuery, React, Java JSP, Akamai, Tealium, Apollo GraphQL]
trackers: [Quantum Metric, Adobe Analytics, Adobe Target, Adobe Audience Manager, Celebrus, LiveRamp, Dynatrace, Facebook Pixel, Google Ads, DoubleClick, LinkedIn Ads, Amazon Ads, Qualtrics, Mezmo, OneTrust]
tags: [airline, travel, booking, aadvantage, loyalty, session-replay, cms-leak, emergency-system, consent, tag-manager]
headline: "AA's public crisis kill switch still holds drill-exercise placeholder text -- one boolean flip from broadcasting it to every visitor."
findings:
  - "The publicly readable go-dark.json crisis config contains '***Drill Drill Drill*** Information about Flight XXXXX' as its active template across all locales -- one boolean flip from appearing on the homepage during a real incident."
  - "A deprecated v1 content API returns the full marketing CMS database without authentication, including internal employee email addresses and a QA test artifact from 2015 still marked online."
  - "The Tealium container monkeypatches XMLHttpRequest.prototype.open on flight-search pages so Celebrus captures every XHR response during booking -- and the QA suppression logic is inverted, so it runs everywhere."
  - "Booking confirmation codes pass through the client-side analytics data layer as plaintext before SHA256 is applied in a later tag; AAdvantage loyalty numbers are hashed with MD5."
  - "OneTrust defaults 154 countries to the US opt-out consent model -- only 92 countries see a GDPR banner and only four US states get Global Privacy Control handling."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

American Airlines runs one of the heavier surveillance and analytics stacks in commercial aviation, but the most notable things on aa.com aren't the trackers -- they're the operational artifacts: a public crisis management endpoint with unfinished placeholder text, a forgotten API version serving the full content database to anyone who asks, and a Tealium analytics container that monkeypatches browser APIs during the booking flow.

---

## Architecture

aa.com is a dual-stack site. The public-facing pages (`homePage.do`, AAdvantage content, customer service) are legacy Java Server Pages rendered server-side. The booking flow (`/booking/search`, `/booking/flights`, `/booking/choose-flights`) and reservation management (`/manage-reservation/viewres/`) are React single-page applications. These co-exist without a unified frontend framework.

The CDN and WAF layer is Akamai -- specifically Akamai GHost, with full Bot Manager Professional deployment. Direct `curl` to `aa.com` or `www.aa.com` returns a 403. Headless Playwright also gets blocked. The site is effectively only accessible via browsers that pass Akamai's sensor data collection. Akamai sets four cookies on every visitor: `_abck` (sensor data), `bm_sz`, `bm_so`, `bm_lso` (fingerprint state), plus geographic state cookies `aka_state_code`, `aka_cr_code`, `aka_lc_code`.

A layer of Akamai-encrypted cookies protect user-specific data: `COUNTRY_CODE`, `homeAirport`, and `saleCity` all arrive with an `ETM...` prefix (Akamai Token Management encrypted values) -- their values are opaque to the browser and only readable server-side.

Tag management is Tealium iQ (account: `aa`, profile: `main`, environment: `prod`). The configuration is non-standard: `utag_cfg_ovrd: {noload: true}` tells Tealium not to auto-fire tags. AA controls tag execution manually. The Tealium container itself (`tags.tiqcdn.com/utag/aa/main/prod/utag.js`) is 728KB and runs ~1,600 lines of business logic.

Web components for the header and footer come from `cdn.aa.com/aileron-web` -- AA's internal design system ("Aileron"). Specific versions observed: `header@1.16.12`, `footer@1.10.12`. The cookie banner is served from the same system.

Two GraphQL endpoints are present. `POST /api/content/graphql` uses Apollo Server with introspection disabled (returns the Apollo Server default message when introspection is attempted). `POST /services/graphql` requires client identification headers and returns "Missing required client identification headers" without them -- this second endpoint is used by the booking SPA.

Authentication is PingFederate in two configurations: customer auth at `login.aa.com` (with flows at `/loyalty/pf-ws/authn/flows/{flowId}`, requiring an `X-XSRF-Header`), and employee auth at `pfloginapp.cloud.aa.com`. The employee portal at `developer.aa.com` is titled "Runway" -- a B2E developer portal that redirects to the PingFederate employee auth flow.

The reservation management SPA exposes a health endpoint: `GET /manage-reservation/viewres/api/health` returns the plaintext string `Hello from bff`. This confirms a Backend-for-Frontend (BFF) architecture pattern without version or status information.

Infrastructure signals visible from the browser:
- `app_region: "US:DAL"` in the Tealium data layer -- Dallas datacenter
- `ROUTEID=IKSS.blue` cookie -- load balancer routing cookie identifying the "blue" cluster in a blue/green deployment
- `app_build_version: "2790"` -- internal build number in the Tealium data layer
- Dynatrace agent: `ruxitagentjs_ICA7NQVfghqrux_10327251022105625.js` -- the `ICA7NQVfghqrux` string encodes the enabled Dynatrace feature set
- `metrics.aa.com` -- internal Adobe Analytics tracking server (`s.trackingServer`)
- `ddc.aa.com` -- CDN for Quantum Metric scripts

SSL certificate SAN list is extensive: `www.aa.com`, `aa.com`, `aadvantage.com`, `americanairlines.com`, `americanair.com`, `american.com`, subdomains `analytics.aa.com`, `cdn.aa.com`, `efreight.cargo.aa.com`, `mobile.aa.com`, `tts.aa.com`, and international variants across 20+ countries including `americanairlines.{be,ch,cl,cn,co.cr,co.uk,de,es,fi,fr,hu,ie,in,it,jp}` and regional TLDs `aa.com.br`, `aa.com.do`, `aa.com.pe`, `aa.com.ve`.

---

## The Emergency Kill Switch

AA operates a public JSON endpoint that controls a homepage "go-dark" mode for crisis communications:

```
GET /pubcontent/en_US/fragments/home-page/emergency-response/go-dark.json
```

The endpoint is accessible to any browser session without authentication. The response:

```json
{
  "goDark": false,
  "incidentHeroTitle": "***Drill Drill Drill*** Information about Flight XXXXX",
  "callToAction": "Learn more",
  "incidentHeroURL": "http://news.aa.com",
  "external": false,
  "newWin": false
}
```

`goDark: false` is the only thing preventing this content from appearing to every visitor. The `incidentHeroTitle` is the copy that would display on the homepage if AA activated the kill switch for a real incident -- a flight crash, a ground stop, a mass disruption. The active value is unfilled drill exercise text, including the literal "Drill Drill Drill" prefix that military and aviation emergency exercises use to distinguish simulations from real incidents.

The endpoint exists in all locales: `en_US`, `es_US`, and `pt_BR` were confirmed, all returning the same drill placeholder. This is not a test endpoint or a staging artifact -- it is the production crisis management configuration for every locale of aa.com. If AA's operations center activates go-dark during a real incident, every homepage visitor would see "***Drill Drill Drill*** Information about Flight XXXXX."

The URL is publicly enumerable (it appears in the homepage network traffic) and the response is not access-controlled beyond Akamai's general browser gating.

---

## The Forgotten v1 API

AA's targeted content service runs on versioned endpoints. The homepage uses:

```
GET /targeted-content-service/v2/content/MarketingMessages
```

The v2 endpoint requires parameters and returns an error without them:

```json
{
  "message": ["locale should not be empty","isHomePage should not be empty","loginStatus should not be empty"],
  "error": "Bad Request",
  "statusCode": 400
}
```

This error response leaks the field names `locale`, `isHomePage`, and `loginStatus`.

The v1 endpoint has no such requirement:

```
GET /targeted-content-service/v1/content/MarketingMessages
```

This returns the full marketing content database across all locales without authentication or parameters. Any browser session (including unauthenticated visitors) can call this endpoint. Akamai passes through browser requests; the v1 endpoint itself has no auth gate.

The response includes records with `notificationEmail` fields containing internal AA employee addresses: `rosangela.velarde@aa.com` and `blanca.rocca@aa.com` are confirmed in the evidence. Additional addresses cited from the investigator's full session include `julie.kramer@aa.com`, `eva.alonsoverdugo@aa.com`, `luis.block@aa.com`, `pedro.noda@aa.com`, and `alessandra.decastro@aa.com`.

The response also includes records that should not be in production. `Testing_Repo_inQA.xml`, created January 1, 2015, is still active (`showTo: ["nonmembers"]`) with no `offlineDate`. A `citi-test.xml` file from 2018 is also present. These are QA test artifacts that were never removed from the production CMS. The `fileName` field maps directly to internal CMS storage paths.

Each record includes scheduling metadata: `onlineDate`, `offlineDate`, `homePageEligibility`, `priority`, `messageType`, and `showTo` (membership tier targeting -- `nonmembers`, `secure-members`, `unsecure-members`). The full content schedule, targeting rules, and editorial calendar are readable without authentication.

The supported content types are limited. Attempting other content types (e.g., `HeroContent`, `Offers`) returns: "Content type 'X' is not supported currently, please reach out to system admins for any new additions" -- an internal-facing error message surfaced publicly.

---

## The Analytics Pipeline

### Tealium Container

The 728KB Tealium container (`utag/aa/main/prod/utag.js`) runs on every page and encodes significant business logic beyond tag-firing.

**Booking confirmation codes (PNR) in the data layer**

During and after booking, the data layer carries a `PNR` field (Passenger Name Record -- the 6-character booking reference). The Tealium container processes this in a two-step sequence across separate tag functions:

Step 1 (one tag function):
```javascript
if (typeof b['PNR'] != 'undefined' && b['PNR'] != '') {
  b['pnr_encrypt'] = b['PNR']
}
```

Step 2 (a later tag function):
```javascript
b['pnr_encrypt'] = utag.ut.sha256.SHA256(b['pnr_encrypt']).toString();
```

The field name `pnr_encrypt` suggests intent to hash, but the first function stores the plaintext PNR in `pnr_encrypt` and SHA256 is only applied in a subsequent function. On the boarding pass page, the same pattern: the PNR is read from the DOM (`jQuery('.recordLoc')`) into `utag_data.pnr_encrypt` as plaintext before `SHA256` is applied on the next line. Between those two steps, the plaintext PNR exists in the analytics data object and is accessible to any tag running in that window.

The `PNR` field also appears in other contexts in the container: `document.cookie="gfsid="+gfsidval` where `gfsidval = b.PNR || utag_data.PNR` -- the PNR is written directly into a browser cookie named `gfsid`.

**Loyalty ID (AAdvantage number) hashed with MD5**

On the boarding pass page, the AAdvantage number is extracted from the DOM (`document.getElementsByClassName('tierStatus')`) and hashed:

```javascript
utag_data['loyalty_id_encrypt'] = utag.ut.md5.MD5(bp_aadv).toString();
```

MD5 is not cryptographically suitable for hashing sensitive identifiers -- it is fast-brute-forceable and collision-prone. The same pipeline uses SHA256 elsewhere (PNR, email addresses via a generic `hashdata` function), but AAdvantage loyalty IDs get MD5.

**Celebrus XHR monkeypatching**

On pages matching `booking/choose-flights` or `booking/search`, the Tealium container patches the browser's XHR API:

```javascript
let originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function() {
  if (!this._celebrusCollection) {
    this._celebrusCollection = "true";
    this.addEventListener("load", () => {
      setTimeout(aacsaHandler, 500, this.responseURL, this.responseText);
    });
  }
  return originalOpen.apply(this, arguments);
};
```

Every XHR request made during the flight selection and booking search flow is intercepted, and both the response URL and the full response body (`this.responseText`) are passed to the Celebrus analytics handler (`aacsaHandler`). This is AA's custom Customer Data Platform (CDP) -- `aacsa` stands for AA Customer Session Analytics. Celebrus session data is compressed and stored in `sessionStorage` under `aacsassl*` keys before being transmitted.

The XHR patching is gated on a hostname check:

```javascript
if (window.location.hostname != 'digital-wo-celebrus.qa.aa.com' || 
    window.location.hostname != 'celebrus-throttle.qa.aa.com')
```

This condition uses `||` instead of `&&`. It is always true (any hostname is not equal to at least one of those two QA hostnames). The suppression mechanism for QA environments does not work.

**AADA vendor attribution framework**

AA maintains a custom attribution system called AADA (`window.AADA.utils.attributes.vndr_attributes`). The Tealium container reads attributes from named vendor slots and surfaces them into the data layer:

- `vndr1.custom4`, `vndr1.custom16`, `vndr1.custom17`, `vndr1.custom18`
- `vndr5.custom1`, `vndr5.custom2`, `vndr5.custom3`, `vndr5.custom4`

Custom field indices run from 1 through 19 across vendors. The framework has at least 5 named vendor slots (`vndr1` through `vndr5`) visible in the container, each with up to 19 custom attribution dimensions.

**DCF (Data Collection Framework)**

AA runs an internal Data Collection Framework alongside Tealium. `POST /dcf/v3/sendData` receives page events. The Tealium container reads from `dcfData` to populate the analytics layer, including `dcfData.transaction.payment` for payment context: `paymentcountry`, `paymentstate`, `paymentzipcode`. Payment location data flows through DCF before being picked up by the Tealium tag pipeline.

**Booking.com hotel partner events**

AA embeds a Booking.com hotel widget (`sp.booking.com`). The Tealium container listens for cross-origin messages:

```javascript
window.addEventListener('message', function(e) {
  if (e.origin === 'https://sp.booking.com') {
    if (e.data.aa_ana_msg) {
      try { s.tl(true, 'e', pagedetail, null, null); } catch(e) { utag.DB(e) }
    }
  }
}, false);
```

Hotel booking analytics events from the embedded Booking.com widget are passed via `postMessage` and forwarded into Adobe Analytics (`s.tl()`).

**Data layer fields of interest**

The full booking search and post-booking data layer includes: `sjn_departure_date`, `sjn_return_date`, `sjn_search_origin_city`, `sjn_search_destination_city`, `sjn_search_pax_count`, `sjn_cabin_type`, `sjn_revenue`, `sjn_bp_loyaltyid`, `sjn_ffl`, `PNR`, `pnr_encrypt`, `pnr_booked_date`, `pnr_create_date`, `channel`, `booked_cabin_type`, `trip_contact_info`, `adr_pbflight_number`, and assorted `adr_*` and `js_page.AADA.*` fields.

---

## The Surveillance Stack

**155 requests on the homepage.** 76 first-party, 79 third-party. 21 third-party domains.

### Identity and Data Brokerage

Four systems run identity resolution simultaneously:

- **Celebrus** -- AA's internal CDP. `aacsa` (AA Customer Session Analytics) sets `aacsapersisted` and `aacsasession` cookies, stores compressed session data in `sessionStorage` under `aacsassl*` keys. Session data is transmitted to a Celebrus endpoint.
- **LiveRamp** -- `di.rlcdn.com` receives requests for cross-publisher identity graph linkage.
- **Adobe Audience Manager** -- `dpm.demdex.net` for DMP/data onboarding. The `demdex.net` domain is Adobe's cross-site identity network.
- **Adobe Marketing Cloud ID** -- `AMCV_025C69945392449B0A490D4C%40AdobeOrg` cookie stores the MCID (`52910676182451112134417462271317831480`). Adobe MID provides a persistent cross-session identifier tied to the AdobeOrg.

LinkedIn Ads ID is stored in `localStorage` under the key `li_adsId` -- this persists cross-session and cross-tab, separate from the cookie layer.

### Advertising Pixels

Active on the homepage (unauthenticated, first load):

| Pixel | Domain | Details |
|-------|---------|---------|
| Google Ads | `www.google.com`, `googleads.g.doubleclick.net` | src=13196098, CCM collect, conversion + remarketing |
| DoubleClick | `ad.doubleclick.net` | Retargeting |
| LinkedIn | `px.ads.linkedin.com` | Partner conversion; `li_adsId` in localStorage |
| Facebook | `_fbp` cookie (ID: `1707646546144746`) | Includes `hme` parameter for hashed email matching in authenticated sessions |
| Amazon Ads | `s.amazon-adsystem.com`, `c.amazon-adsystem.com`, `ara.paa-reporting-advertising.amazon` | Attribution |

### Session Replay and Monitoring

- **Quantum Metric** -- `ingest.quantummetric.com` for full session replay. Sets `QuantumMetricSessionID` and `QuantumMetricUserID` cookies. The Quantum Metric script is served from `ddc.aa.com` with a date in the filename: `QMSessionMini2025-04-15.js`.
- **Dynatrace** -- RUM at `/4991/` endpoints. Sets `rxVisitor`, `dtCookie`, `dtPC`, `dtSa`, `dtsrVID`, `rxvt` cookies. Session recording config in `localStorage` keys `dtsrE` and `dtsrNOSR`.
- **Akamai mPulse** -- `c.go-mpulse.net`. Performance RUM via the Boomerang library (`RT` cookie).
- **LogDNA / Mezmo** -- `logs.mezmo.com/logs/ingest` receives browser-side log data. `logdna::browser::sessionscore` in `sessionStorage`. Browser logs are shipped to Mezmo in real time.

### Adobe Stack

- **Adobe Analytics** -- tracking server at `metrics.aa.com`
- **Adobe Target** -- A/B testing delivery from `americanairlines.tt.omtrdc.net`, edge cluster 35 (`mboxEdgeCluster=35`). `mbox` cookie manages target sessions.
- **Adobe Audience Manager** -- `dpm.demdex.net`
- **Adobe Marketing Cloud ID** -- MCID in `AMCV_*` cookie

The Adobe opt-in framework objects (`adobe.OptInCategories`) are present in the page but the `adobe.optIn` object is empty -- opt-in enforcement appears not to be implemented, meaning all Adobe services fire without per-category consent gates.

### Survey and Feedback

Qualtrics Site Intercept (`siteintercept.qualtrics.com`) with project ID `ZN_1JWUTsd7EO1ycUm`. Survey intercepts can appear based on session signals.

### Aileron Logger (Phased Rollout)

From `/pubcontent/en_US/fragments/aileron-web/aileron-logger-config.json`:

```json
{
  "qa": { "enabled": true, "logLevel": 2, "rolloutPercentage": 100 },
  "stage": { "enabled": true, "logLevel": 2, "rolloutPercentage": 100 },
  "prod": { "enabled": true, "logLevel": 2, "rolloutPercentage": 25 }
}
```

Browser-side logging via the Aileron Web component library is on a 25% production rollout.

---

## Consent Architecture

OneTrust version `202504.1.0`, consent configuration ID `ff886b63-9269-45e9-a7e8-b84df31535ba`.

The configuration defines three rules:

**Rule 1 -- Global (default):** 154 countries. Template: "US AA Template." `Default: true`. This is the fallback for any country not covered by the other two rules. The US AA Template is an opt-out consent model.

**Rule 2 -- Show Banner Rule:** 92 countries. Template: "GDPR AA Template." Countries in this set see an interactive consent banner with opt-in controls. This covers the EU/EEA, UK, Brazil, Japan, Australia, Canada, and other regulated markets.

**Rule 3 -- GPC States:** No countries -- only four US states: California, Nevada, Connecticut, Colorado. These states receive Global Privacy Control handling.

The practical effect: any country not in the 92-country banner list and not in the 4 GPC states gets the US opt-out model regardless of local privacy law. The `browserGpcFlag` and `isGpcEnabled` data layer fields are populated from `navigator.globalPrivacyControl`, but handling is jurisdictionally limited.

On first page load for a new visitor, `OptanonConsent` arrives with all four groups enabled: `C0001:1,C0002:1,C0003:1,C0004:1` with `interactionCount=0`. All consent categories -- Strictly Necessary, Performance, Functional, and Targeting -- are active before any user interaction. The advertising pixels and analytics trackers documented above fire in this state.

Cookies set on an unauthenticated first-page-load (partial list):

| Cookie | Purpose |
|--------|---------|
| `XSRF-TOKEN` | CSRF protection |
| `UAC` | User auth session |
| `ROUTEID=IKSS.blue` | Load balancer routing / cluster identification |
| `AMCV_*@AdobeOrg` | Adobe Marketing Cloud ID |
| `OPTOUTMULTI=0:0\|c1:0\|c3:0` | Adobe Analytics opt-out state (all 0 = opted in) |
| `mbox`, `mboxEdgeCluster=35` | Adobe Target session + cluster |
| `one_trust_id` | OneTrust consent ID |
| `OptanonConsent` | OneTrust groups state |
| `utag_main_*` | Tealium session/visitor tracking |
| `_fbp` | Facebook Pixel browser ID |
| `QuantumMetricSessionID`, `QuantumMetricUserID` | Quantum Metric session replay |
| `_gcl_au` | Google Ads conversion linker |
| `rxVisitor`, `dtCookie`, `dtPC`, `dtSa`, `dtsrVID`, `rxvt` | Dynatrace RUM |
| `RT` | Boomerang RUM timing |
| `aacsapersisted`, `aacsasession` | Celebrus (AA Customer Session Analytics) |
| `_lr_geo_location_state=CA`, `_lr_geo_location=US` | Geolocation in cookie |

---

## Infrastructure and Operational Signals

**Akamai Bot Manager** is fully deployed. The `_abck` cookie contains the sensor data payload. `bm_sz`, `bm_so`, and `bm_lso` maintain fingerprint state. All non-browser clients are blocked at the CDN edge.

**CORS** is not enabled on public endpoints. `Access-Control-Allow-Origin` headers are absent from tested endpoints. Cross-origin fetch from third-party domains is blocked at the Akamai layer.

**robots.txt** disallows crawlers from `/i18n/` content pages, `/pubcontent/` fragments, `/fingerprint/` legacy JS assets, and several utility paths. The sitemap (`www.aa.com/sitemap_index.xml`) is gated by Akamai. No `llms.txt`, `security.txt`, or `humans.txt` is present.

**Session partitioning**: `PIM-SESSION-ID` in `sessionStorage` indicates PingFederate session tracking. `TAB_ID` tracks individual browser tabs.

**Loyalty tier in cookies**: `utag_main_loytir=Guest` and `utag_main_lid=Guest` store the AAdvantage tier directly in Tealium cookies, readable client-side.

**No rate limiting observed** on the public content endpoints (`/pubcontent/`, `/airport/countries`, `/loyalty/access-level`) during investigation.

---

## Machine Briefing

**Access and auth**

aa.com is behind Akamai Bot Manager. curl (any UA) is blocked. Headless browsers are blocked. A real-browser session is required -- Playwright in headed mode works. The session establishes bot-challenge cookies (`_abck`, `bm_sz`, `bm_so`, `bm_lso`) that must be present on subsequent requests.

Public endpoints (no auth beyond Akamai browser gating):
```
GET https://www.aa.com/pubcontent/en_US/fragments/home-page/emergency-response/go-dark.json
GET https://www.aa.com/pubcontent/en_US/fragments/navigation/header/header-en_US.json
GET https://www.aa.com/pubcontent/en_US/fragments/navigation/footer/footer-en_US.json
GET https://www.aa.com/airport/countries
GET https://www.aa.com/loyalty/access-level
GET https://www.aa.com/targeted-content-service/v1/content/MarketingMessages
```

v2 content API (requires params):
```
GET https://www.aa.com/targeted-content-service/v2/content/MarketingMessages?locale=en_US&isHomePage=true&loginStatus=Logged_out
```

GraphQL (introspection disabled, requires session):
```
POST https://www.aa.com/api/content/graphql
POST https://www.aa.com/services/graphql  (requires X-Client-Id or similar header)
```

Auth flows (PingFederate, requires X-XSRF-Header from XSRF-TOKEN cookie):
```
GET https://www.aa.com/loyalty/pf-ws/authn/flows/{flowId}
```

DCF (booking pages, requires session):
```
GET https://www.aa.com/dcf/health
POST https://www.aa.com/dcf/v3/sendData
```

Tealium container (public, no session required):
```
GET https://tags.tiqcdn.com/utag/aa/main/prod/utag.js
```

OneTrust config (public):
```
GET https://cdn.cookielaw.org/consent/ff886b63-9269-45e9-a7e8-b84df31535ba/ff886b63-9269-45e9-a7e8-b84df31535ba.json
```

**Endpoints**

go-dark config (all locales follow same pattern):
```
GET /pubcontent/{locale}/fragments/home-page/emergency-response/go-dark.json
```
Returns: `{"goDark":bool,"incidentHeroTitle":"...","callToAction":"...","incidentHeroURL":"...","external":bool,"newWin":bool}`

Country reference:
```
GET /pubcontent/{locale}/fragments/navigation/header/header-{locale}.json
GET /airport/countries
```

Loyalty access level (guest = `{"status":"0"}`):
```
GET /loyalty/access-level
```

BFF health:
```
GET /manage-reservation/viewres/api/health  -> "Hello from bff"
```

**Gotchas**

- Akamai blocks all non-browser clients at the CDN edge. Session cookies from a real browser pass-through are required for every endpoint.
- The `X-XSRF-Header` value must match the `XSRF-TOKEN` cookie for PingFederate auth flow requests.
- `/services/graphql` requires client identification headers that are not publicly documented -- the exact header names are not confirmed.
- The v1 content API (`/targeted-content-service/v1/`) has no param requirements; v2 requires `locale`, `isHomePage`, and `loginStatus`.
- Public endpoints return 403 from Akamai when accessed without bot-challenge cookies. Establish a browser session first.
- LogDNA/Mezmo browser log ingest is active (`logs.mezmo.com/logs/ingest`) -- browser errors generate outbound requests.
