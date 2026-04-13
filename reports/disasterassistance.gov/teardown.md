---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "DisasterAssistance.gov — Teardown"
url: "https://disasterassistance.gov"
company: "FEMA"
industry: Government
description: "Federal portal for disaster survivors to apply for FEMA assistance."
summary: "Drupal 10 frontend proxied through Akamai CDN/WAF, backed by a legacy Java 'DAC' application on Apache 2.4.37 and OpenSSL 1.1.1k (EOL September 2023). Two separate GTM containers serve the Drupal frontend and DAC app independently. Address lookup uses client-side ArcGIS and Census Bureau geocoding APIs. Login.gov federation is in progress."
date: 2026-04-12
time: "17:00"
contributor: hayabhay
model: "sonnet-4.6"
effort: medium
stack:
  - Drupal 10
  - Akamai
  - Apache
  - AWS
  - Login.gov
  - ArcGIS
trackers:
  - Google Analytics 4
  - Universal Analytics
  - Google Tag Manager
  - Google Ads
  - DoubleClick
  - SiteImprove
  - Akamai mPulse
tags:
  - government
  - fema
  - disaster-relief
  - drupal
  - ad-tracking
  - legacy-tech
  - analytics-sprawl
  - privacy-mismatch
  - api-exposure
  - login-gov
headline: "FEMA's disaster assistance site fires Google Ads tracking on every page load -- the privacy policy says it doesn't track visitors beyond the site."
findings:
  - "Google Ads (DoubleClick) fires twice on every page load with no consent mechanism, and the ad tracking extends into the DAC application layer where survivors file disaster claims -- the site's own privacy policy explicitly denies any cross-site tracking."
  - "FEMA's ArcGIS API key is exposed in page source and confirmed functional from an external origin -- any third party can make geocoding requests on FEMA's account, and the address widget auto-fires a geocoding call on every homepage visit without user input."
  - "The DAC legacy app's GTM container contains 11 DoubleClick references, meaning Google's ad identity endpoint follows users from the informational frontend into the actual application handling disaster claims, login, and document uploads."
  - "Six GA4 properties plus a legacy Universal Analytics property run simultaneously -- UA was officially sunset July 2024 but its /j/collect endpoint is still receiving POST requests and setting cookies."
  - "The DAC application serves disaster claims through jQuery 2.1.4 (2015) and OpenSSL 1.1.1k (EOL September 2023), with its build version and AWS production server name exposed in the visible page DOM."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

DisasterAssistance.gov is the federal portal where disaster survivors apply for FEMA Individual Assistance -- housing grants, personal property replacement, and emergency funds after presidentially-declared disasters. Every page load fires Google's ad identity endpoint with no consent notice, in direct contradiction of the site's privacy policy. The rest is a picture of tracking sprawl, a legacy application frozen in 2015-era dependencies, and exposed API keys on infrastructure serving some of the most vulnerable people seeking government help.

---

## Architecture

The site runs as two distinct applications sharing a domain.

The **Drupal 10 frontend** serves all public content -- the homepage, eligibility questionnaire, assistance program pages, and informational content. Response headers confirm `x-generator: Drupal 10`. Akamai sits in front as CDN and WAF; curl requests get a 403 from `AkamaiGHost` (including for `robots.txt`), while browser-fingerprinted connections pass through normally. The Drupal layer is load-balanced, leaking infrastructure routing in the `ROUTEID=.pub1` cookie.

The **DAC (Disaster Assistance Center)** application lives at `/DAC/` and handles the actual work: login, application submission, status checks, document management. It's a separate Java application with its own server stack -- `Apache/2.4.37 (Red Hat Enterprise Linux) OpenSSL/1.1.1k` in response headers -- its own GTM container, and its own character encoding (`windows-1252` / `ISO-8859-1` at the base path). URL patterns follow the Java Struts convention with `.do` actions. AWS hosting is confirmed: the application's version banner reads `Version: 25.06.03.00.1419 | Server: DAC-AWS-PROD-PUBLIC`, exposed in the visible page DOM -- not in a meta tag, in a `<generic>` element.

**Identity**: Login.gov handles authentication. The DAC app shows a notice that "our online accounts are moving to Login.gov," indicating the federated identity migration is in progress rather than complete. The login flow at `/DAC/govBenefitReceiver.do?action=LOGIN` redirects to Login.gov.

**Address lookup pipeline**: The site's "check if your area is declared" widget on the homepage drives two geocoding integrations, both configured client-side in `window.drupalSettings.daip_admin_settings.settings`:
- **ArcGIS**: `geocode-api.arcgis.com` (findAddressCandidates), using FEMA's API key
- **Census Bureau**: `tigerweb.geo.census.gov/ArcGIS/rest/services/Census2020/State_County/MapServer/1/query` (address-to-county mapping), unauthenticated

The ArcGIS endpoint fires automatically on every homepage visit -- the widget pre-warms the geocoding call without user address input. The Census Bureau endpoint fires when a user submits an address query.

**Certificate**: disasterassistance.gov shares a DHS enterprise certificate with a wide set of DHS agency domains, including `fema.gov`, `cisa.gov`, `ice.gov`, `tsa.gov`, `uscis.gov`, `cbp.gov`, and `secretservice.gov`.

---

## Tracking & Surveillance

### Google Ads on a disaster relief site

`googleads.g.doubleclick.net/pagead/id` fires **twice on every homepage load**, with no user interaction, no consent banner, and no opt-out mechanism. This is Google's ad identity endpoint -- it sets and retrieves Google's DSID cross-site advertising cookie, enabling behavioral targeting across the Google Display Network. It fires from the main GTM container (`GTM-PRF2M5J`), which also contains conversion tracking tags, remarketing code, and references to `pagead/regclk` and `pagead2.googlesyndication.com`.

The site's privacy policy states: *"We don't use cookies to collect any personal information from you or track your actions beyond our site."*

DoubleClick directly contradicts this. The `/pagead/id` endpoint is specifically designed for cross-site tracking. GA cookies are configured with `cookie_expires: 63072000` (2 years) and `transport_type: beacon` -- they persist well past the session.

The ad tracking is not limited to the Drupal frontend. The DAC legacy application's own GTM container (`GTM-MW6H4WT`) contains 11 DoubleClick references. People filing actual disaster assistance applications are also subject to Google's cross-site ad tracking.

No consent management framework is present anywhere on the site. No OneTrust, no Cookiebot, no IAB TCF signals, no US Privacy string (`__uspapi`). All trackers fire on first load.

### Analytics sprawl

The site runs six Google Analytics property IDs simultaneously across two GTM containers:

**In `dataLayer` (configured directly, DHS Digital Analytics Program):**
- `G-CSLL4ZEK4L` -- the federal DAP property, standard for government sites. Configured in `window.dataLayer` with `agency: "DHS"`, `subagency: "FEMA"`, `cookie_expires: 63072000`.

**In GTM container `GTM-PRF2M5J` (injected dynamically):**
- `G-F33CXC5SN6`
- `G-F162WSPTTV`
- `G-7SY9MNF3B0`
- `G-DKKY78VLDY`
- `G-D95WLT8BCP`

Plus legacy Universal Analytics: **`UA-29788218-1`**. Universal Analytics was officially sunset by Google in July 2024 -- data collection was supposed to stop. This property is still firing POST requests to `www.google-analytics.com/j/collect` (the UA-era endpoint). The `_gat_UA-29788218-1` cookie is still being set. The network evidence shows 10 requests to `/g/collect` (GA4) and 1 request to `/j/collect` (UA) on every page load.

Two GTM containers on the same domain (`GTM-PRF2M5J` on Drupal, `GTM-MW6H4WT` on DAC) suggests separate teams managing analytics for the two applications without coordination. The Drupal container is approximately 500KB.

### Other trackers

**SiteImprove** (`siteimproveanalytics.com/js/siteanalyze_6191615.js`) is loaded for accessibility monitoring and analytics. The script tag appears twice in page source -- a probable Drupal module configuration error.

**Akamai mPulse** (`c.go-mpulse.net`) fires on every page load for real user monitoring -- timing, performance metrics. Standard CDN instrumentation.

**YouTube** (`www.youtube.com/youtubei/v1/log_event`) fires telemetry on every page load -- a YouTube embed on the page sends telemetry events back to YouTube regardless of whether the video is interacted with.

**AddThis** (`s7.addthis.com/js/300/addthis_widget.js#pubid=ra-59cd0e4aa7a9ded3`) is still referenced in the site's JavaScript. Oracle acquired AddThis and used it to build cross-site tracking profiles. Oracle retired the AddThis service in May 2023. The script tag remains in the codebase but did not fire in network captures -- the AddThis CDN no longer serves the file. A dead reference, not an active tracker, but it reflects the same pattern of trackers being added without corresponding removal.

---

## API Surface

### window.drupalSettings as a config map

Every visitor to the homepage receives the full contents of `window.drupalSettings` in the page source. This is standard Drupal behavior -- the settings object passes server-side configuration to client-side JavaScript. The keys relevant to external investigation:

**`drupalSettings.daip_admin_settings.settings`** -- the core configuration block:
```json
{
  "census_endpoint_url": "https://tigerweb.geo.census.gov/ArcGIS/rest/services/Census2020/State_County/MapServer/1/query?text=",
  "esri_api_key": "AAPK37fa162d016a41a8be7c931d2a6cb7c27Q2D9DPhmQk3JahEPu9z5_KyKTJfFP83GSJwu5JPYCvzn_c8HcUmNZ59GItlSnfj",
  "esri_endpoint_url": "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?...",
  "esri_endpoint_url_for_geocoding": "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?...",
  "usa_search_base_url": "https://search.usa.gov/api/v2/search/i14y?affiliate=disasterassistance.gov_d8&access_key=zLWcHdTwIOxBs66R7nRTNymGfVtSlC2wL0K0aPW8tGI=&query=",
  "es_usa_search_base_url": "https://search.usa.gov/api/v2/search/i14y?affiliate=disasterassistance.gov_spanish_d8&access_key=96nPBxljF5ZUPAuopUH3hQG_NH51fNbwmzNN9KLmYzc=&query="
}
```

**`drupalSettings.preview_url`**: `https://sso.fema.net/RgsnPreview` -- an internal SSO preview endpoint on `sso.fema.net`. Not externally reachable, but its URL is visible in the page source of every anonymous visitor.

**`drupalSettings.questionnaire`** contains the full structure for the eligibility questionnaire flow, including DAC redirect endpoint and session timeout values.

### ArcGIS API key

The `esri_api_key` is a client-side key -- ESRI/ArcGIS supports browser-facing keys for exactly this use case. The key is not a secret that accidentally leaked; it's intentionally placed in the page source to power the address lookup widget. The exposure is operational: any third party can copy this key and make geocoding requests against FEMA's ArcGIS account, consuming quota FEMA pays for.

The investigator confirmed the key is functional by testing it against `geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates` from an external origin. Additionally, the address lookup widget fires a geocoding request automatically on every homepage load -- without user input. Every page visitor burns a geocoding API call on FEMA's account.

ArcGIS API keys can be scoped to specific referrer domains or IP ranges. Whether this key is scoped is not determinable from the client side; the fact that the investigator's test succeeded from an external origin suggests it may not be restricted.

### USA Search API keys

The two USA Search keys (English and Spanish) are client-side by design. USA Search is the GSA's public government search infrastructure; affiliate keys are expected to be in the browser. Both keys are functional read-only search index credentials. The affiliate IDs are `disasterassistance.gov_d8` (English) and `disasterassistance.gov_spanish_d8` (Spanish).

### First-party APIs (no auth)

Three Drupal endpoints are exposed without authentication:

**`/drupal_api/rgsn_deadlines`** -- returns active disaster registration deadlines as JSON. Includes disaster codes and deadline timestamps.

**`/drupal_api/declaredStates`** -- returns a JSON array of two-letter state codes with active federal disaster declarations.

**`/drupal_api/localResources/femaDRCs`** -- GeoJSON of FEMA Disaster Recovery Center locations. Currently returns empty results (no active DRCs at investigation time).

**`/drupal_api/localResources/femaServices`** -- referenced in `window.FEMA_SERVICES_URL`, returns FEMA service locations.

**`/rulesApi/sendAnswers/{param_string}`** -- the benefits eligibility engine. No authentication, no observed rate limiting. Encodes questionnaire answers as a parameter string in the format `{questionID},{answer},{subAnswers}:...` and returns a list of matching program IDs. With param `0` (empty):

```json
{"resultList":[4480,5937,4627,4499,4502,4506,4699,4703],"runEngine":null,"questionDeleted":false}
```

The returned program IDs map to `/get-assistance/forms-of-assistance/{id}`. Program 4480, for example, is the International Terrorism Victim Expense Reimbursement Program. The rulesApi does not return PII or application data -- only program IDs.

**Drupal REST and JSON:API disabled**: `/jsonapi/` returns 404, `/node?_format=json` returns 403. Good hygiene.

---

## The Legacy Application (DAC)

The DAC is the functional core of the site -- where survivors actually file applications, check status, and manage their cases.

**Server stack**: `Apache/2.4.37 (Red Hat Enterprise Linux) OpenSSL/1.1.1k`. Apache 2.4.37 was released October 2018; the current release is 2.4.62+. OpenSSL 1.1.1k reached end-of-life September 11, 2023. The server headers are verbose -- both the Apache version and OS are disclosed.

**Frontend dependencies**:
- jQuery `2.1.4` -- released April 2015. This version predates multiple documented XSS and prototype pollution vulnerabilities fixed in later releases.
- Bootstrap `3.3.7` -- released November 2016.
- DataTables `1.10.13` -- released 2016.

**Version exposure**: The DAC application renders its build version directly in the visible page DOM:
```html
<meta name="version" content="25.06.03.00.1419">
<generic>Version: 25.06.03.00.1419 | Server: DAC-AWS-PROD-PUBLIC</generic>
```
The version string appears to encode a build date: year 25 (2025), month 06, day 03. The last rebuild was June 2025 by this reading. `DAC-AWS-PROD-PUBLIC` confirms the AWS deployment target.

**Character encoding**: The DAC base path is served with `windows-1252` / `ISO-8859-1` encoding -- a legacy signal that the application predates universal UTF-8 adoption.

**URL pattern**: Java Struts `.do` action routing. Main entry controller:
- `/DAC/govBenefitReceiver.do?action=LOGIN&langcode=EN`
- `/DAC/govBenefitReceiver.do?action=REGISTER`
- `/DAC/govBenefitReceiver.do?action=STATUS`
- `/DAC/govBenefitReceiver.do?gbsessionid=0&action=RI&langcode=EN`

Write operations (login, register, status) are CAPTCHA-protected.

**Tracking in the application layer**: The DAC has its own GTM container (`GTM-MW6H4WT`, 351KB) separate from the Drupal frontend's container. This container also contains DoubleClick ad tracking -- 11 occurrences of DoubleClick references. Users navigating the application to file disaster claims are subject to the same Google Ads cross-site tracking as homepage visitors.

---

## Security Posture

**No Content Security Policy** on the main Drupal site. If an XSS vulnerability exists anywhere in the Drupal layer, there is no browser-enforced restriction on script execution or data exfiltration.

**EOL OpenSSL** on the DAC backend. OpenSSL 1.1.1k has been unsupported since September 2023. Whether RHEL's extended support contracts cover this is not determinable from the outside -- the version string is what it is.

**CORS**: No `Access-Control-Allow-Origin` header on the Drupal API endpoints. No open CORS exposure was found.

**DHS shared certificate**: The TLS certificate covers `disasterassistance.gov` alongside a wide set of DHS agency domains including `fema.gov`, `cisa.gov`, `ice.gov`, `tsa.gov`, `uscis.gov`, `cbp.gov`, and `secretservice.gov`. Standard practice for enterprise certificate management.

**Akamai WAF**: The primary active defense. Blocks all non-browser requests (curl, standard HTTP clients) with 403 responses.

**HSTS**: `strict-transport-security: max-age=31536000; includeSubDomains` -- present on Akamai-served responses.

---

## Machine Briefing

### Access & Auth

The Drupal frontend is browser-fingerprint-protected by Akamai. All requests must use a browser user-agent and pass Akamai's challenge. Use Playwright (`npx @playwright/cli`) -- curl will get 403 from AkamaiGHost on all endpoints including robots.txt.

The read-only Drupal APIs (`/drupal_api/*`, `/rulesApi/*`) work without any session once you're through Akamai. The DAC application at `/DAC/` requires Login.gov authentication for any write operations; read operations (CAPTCHA page, status lookup) require CAPTCHA.

Session naming for Playwright: `-s=disasterassistance.gov`

### Endpoints (open, no auth beyond browser fingerprint)

**Active disaster data:**
```
GET https://www.disasterassistance.gov/drupal_api/rgsn_deadlines
GET https://www.disasterassistance.gov/drupal_api/declaredStates
GET https://www.disasterassistance.gov/drupal_api/localResources/femaDRCs
GET https://www.disasterassistance.gov/drupal_api/localResources/femaServices
```

**Eligibility engine:**
```
GET https://www.disasterassistance.gov/rulesApi/sendAnswers/0
# Returns: {"resultList":[4480,5937,4627,4499,4502,4506,4699,4703],"runEngine":null,"questionDeleted":false}

# Encode questionnaire answers as: {questionID},{answer},{subAnswers}:...
GET https://www.disasterassistance.gov/rulesApi/sendAnswers/2211,1,-1:-1:-1:-1:-1:-1,2212,1,-1:-1:-1,...
```

**USA Search (client-side keys, read-only):**
```
GET https://search.usa.gov/api/v2/search/i14y?affiliate=disasterassistance.gov_d8&access_key=zLWcHdTwIOxBs66R7nRTNymGfVtSlC2wL0K0aPW8tGI=&query={q}
GET https://search.usa.gov/api/v2/search/i14y?affiliate=disasterassistance.gov_spanish_d8&access_key=96nPBxljF5ZUPAuopUH3hQG_NH51fNbwmzNN9KLmYzc=&query={q}
```

**ArcGIS geocoding (FEMA's key, client-side):**
```
GET https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=pjson&singleLine={address}&token=AAPK37fa162d016a41a8be7c931d2a6cb7c27Q2D9DPhmQk3JahEPu9z5_KyKTJfFP83GSJwu5JPYCvzn_c8HcUmNZ59GItlSnfj
```

**Census Bureau ArcGIS (no auth):**
```
GET https://tigerweb.geo.census.gov/ArcGIS/rest/services/Census2020/State_County/MapServer/1/query?text={address}&geometry=...
```

**DAC application endpoints (CAPTCHA protected):**
```
GET https://www.disasterassistance.gov/DAC/govBenefitReceiver.do?action=LOGIN&langcode=EN
GET https://www.disasterassistance.gov/DAC/govBenefitReceiver.do?action=STATUS
GET https://www.disasterassistance.gov/DAC/govBenefitReceiver.do?action=REGISTER
GET https://www.disasterassistance.gov/DAC/govBenefitReceiver.do?gbsessionid=0&action=RI&langcode=EN
```

**Sitemap:**
```
GET https://www.disasterassistance.gov/sitemap.xml
```

**Assistance programs** (enumerate by ID, ~50 programs, IDs 1507-5937 non-contiguous):
```
GET https://www.disasterassistance.gov/get-assistance/forms-of-assistance/{id}
```

### Gotchas

- All endpoints require a browser-like request through Akamai. curl returns 403 on everything, including static assets.
- The Drupal API endpoints also returned 403 in curl-based evidence captures, but return data normally in browser context. Use Playwright.
- The `rulesApi` parameter encoding is undocumented. With `0` as the parameter, it returns the default 8 programs. Full questionnaire answer strings are available by inspecting network requests during the eligibility wizard flow on `/get-assistance/find-assistance`.
- The ArcGIS key may have referrer restrictions -- the investigator's external test succeeded, but ESRI keys can be scoped to specific origins.
- The DAC app uses `windows-1252` encoding on some paths. Non-ASCII input may behave unexpectedly.
- Program IDs from `rulesApi` are not contiguous -- enumerate against the sitemap, not sequentially.
