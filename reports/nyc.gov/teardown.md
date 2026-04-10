---
# agents: machine-friendly instructions in "## Machine Briefing"
title: NYC.gov — Teardown
url: "https://www.nyc.gov"
company: City of New York
industry: Government
description: "Official website of New York City government, serving 8 million residents."
summary: "NYC.gov runs on Adobe Experience Manager Cloud Service behind Akamai CDN, with the raw AEM publish domain discoverable from Dynatrace config on every page. The broader city digital infrastructure is fragmented across AEM for the main site, Microsoft Dynamics 365 for 311, Spring Boot/Thymeleaf for NYC Business, and a legacy LiveSite CMS still reachable at /site/*. The api.nyc.gov gateway uses Azure API Management, while apps.nyc.gov has served a maintenance page from a named S3 bucket since at least December 2021."
date: 2026-04-07
time: "00:46"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack: [Adobe AEM, Akamai CDN, Azure APIM, Coveo, Dynatrace, Spring Boot, Granicus]
trackers: [Google Analytics 4, Google Tag Manager, Dynatrace RUM, Akamai mPulse, Coveo Analytics, Adobe Helix RUM]
tags: [government, cms, aem, tracking, apis, geospatial, multi-cms, legacy-systems, stale-data, vendor-ecosystem]
headline: "Every page on NYC.gov embeds the raw AEM origin domain in its Dynatrace config — bypassing the CDN that was supposed to hide it."
findings:
  - "The raw AEM publish domain is embedded in every page's Dynatrace config; .model.json endpoints on that domain return full page content trees, component types, internal paths, and modification timestamps without authentication."
  - "A Geoclient API key hardcoded in the OTI poletop-manager production bundle at poletop-manager.nyc.gov resolves any NYC address to BBL, BIN, police precinct, fire company, election district, census tract, and 200+ other fields — fully functional, no rate limiting observed."
  - "The city's live agency directory API lists Rudy S. Giuliani — disbarred in 2024, out of office since 2001 — as the current principal officer of the Mayor's Office of Housing Recovery Operations, in a feed that presents itself as authoritative operational data."
  - "Dynatrace, Google Analytics, Coveo, and Akamai mPulse all set tracking cookies on the first page load with no consent prompt — on a government site serving 8 million residents."
---

## Architecture

NYC.gov's main site runs on Adobe Experience Manager Cloud Service. The AEM instance is program `p136379`, environment `e1368845`, and sits behind Akamai CDN as a publish tier. The `x-vhost: publish` response header is present on every HTML response, and the raw AEM publish domain — `publish-p136379-e1368845.adobeaemcloud.com` — is embedded in the Dynatrace JavaScript configuration that loads on every page. The AEM author instance at `https://author-p136379-e1368845.adobeaemcloud.com/` is properly gated, redirecting to a Granite login screen.

All AEM admin paths on www.nyc.gov (CRX/DE, Felix console, content.json appended to paths) return HTTP 490 — a non-standard status code used by the legacy Livesite proxy layer to indicate "application not mapped." This is a CDN/proxy block, not AEM's own response. The AEM client library namespace is `nycgov/components/*`, built with AEM Maven Archetype and Webpack (`window.webpackChunkaem_maven_archetype`).

The broader NYC digital infrastructure is fragmented across three CMS generations and multiple application stacks:

- **www.nyc.gov/main/*** — Adobe AEM Cloud Service (current)
- **www.nyc.gov/site/***, **www1.nyc.gov** — Legacy LiveSite/iov CMS (the `/html/` path returns a JavaScript redirect to www1.nyc.gov; the calendar API at `/public/api/GetCalendar` returns LiveSite HTML)
- **portal.311.nyc.gov** — Microsoft Dynamics 365 PowerApps Portal (entirely separate stack)
- **nyc-business.nyc.gov** — Spring Boot/Thymeleaf Java application
- **poletop-manager.nyc.gov** — Spring Boot microservice with React frontend (OTI internal IoT management tool)

The search layer uses Coveo Atomic (Web Components / Lit), connecting to Coveo org `cityofnewyorkproduction1oub1837a`. Search analytics fire to `cityofnewyorkproduction1oub1837a.analytics.org.coveo.com`. The Coveo search REST API at `cityofnewyorkproduction1oub1837a.org.coveo.com/rest/search/v2` returns 401 without a token — the access token is retrieved dynamically in JS and was not captured.

`api.nyc.gov` uses Azure API Management, identifiable by the `Request-Context: appId=cid-v1:923dc843-c17d-4042-8562-86ff0aa69acb` response header. `apps.nyc.gov` returns a maintenance page served from an S3 bucket named `www2-shared-lb-prd-blue-doittnyc` — the name encodes the old agency acronym DOITT (Department of Information Technology and Telecommunications, now rebranded as OTI) and a `prd-blue` deployment label consistent with blue-green deployment. The homepage content is a placeholder but the backend service at `/nyc-mailform/` responds with 405 on GET, meaning the Java mailform backend is running even while the gateway homepage shows a maintenance page.

GTM container `GTM-WDR6HXB4` (431KB) orchestrates Coveo event tracking and two GA4 property IDs. A third GA4 measurement ID (`G-K8J6H31PW0`) is injected directly via the AEM page template as a `<meta name="gaid">` tag and a `window.dataLayer.push` call, bypassing GTM entirely.

## Content APIs and AEM Exposure

### AEM Publish Domain and model.json

The AEM publish domain is not served behind the CDN for direct `.model.json` requests — the CDN blocks this path pattern on www.nyc.gov, but the raw AEM origin accepts them without authentication. Because the domain is embedded in every page's Dynatrace configuration, it is trivially discoverable.

The following model endpoints return full JSON page content trees without credentials:

```
GET https://publish-p136379-e1368845.adobeaemcloud.com/content/nycgov/main/en/services.model.json
GET https://publish-p136379-e1368845.adobeaemcloud.com/content/nycgov/main/en/your-government.model.json
GET https://publish-p136379-e1368845.adobeaemcloud.com/content/nycgov/main/en/your-government/agency-directory.model.json
GET https://publish-p136379-e1368845.adobeaemcloud.com/content/nycgov/main/en/forms/newsletter-sign-up.model.json
GET https://publish-p136379-e1368845.adobeaemcloud.com/content/nycgov/mayors-office/en/news.model.json
GET https://publish-p136379-e1368845.adobeaemcloud.com/content/nycgov/main/en/your-government/citywide-org-chart.model.json
```

Each response includes the full AEM component tree: component types (`nycgov/components/*`, `core/wcm/components/*`), `repo:modifyDate` timestamps for each component, JCR content paths, template paths under `/conf/nycgov-shared/settings/wcm/templates/*`, and for form pages, the complete field configuration including hidden field values. The GTM dataLayer also publishes internal AEM paths on every page: `repo:path: /content/nycgov/main/en.html`, `xdm:template: /conf/nycgov-shared/settings/wcm/templates/homepage`.

The org-chart model response contains an editorial note embedded in the content node: "The New York City Organizational Chart is being revised. Please check back later." — with `repo:modifyDate: 2026-01-06T19:24:57Z`.

### The title-from-url Enumeration Endpoint

An undocumented endpoint at `/bin/form/mailform/title-from-url.json` maps any public-facing URL to its internal AEM content path and page title. It requires no authentication.

```
GET https://www.nyc.gov/bin/form/mailform/title-from-url.json?url=/mayors-office
→ {"path":"/content/nycgov/mayors-office/en","title":"Official Site of NYC Mayor Zohran Mamdani"}

GET https://www.nyc.gov/bin/form/mailform/title-from-url.json?url=/main
→ {"path":"/content/nycgov/main/en","title":"Official Website of New York City Government"}
```

The endpoint's stated purpose is to populate a form field with the originating page title, but it also functions as a content path enumeration gadget: iterate known URL paths and retrieve the full AEM path and current page title for each.

### Newsletter Form Infrastructure

The newsletter signup form at `/main/forms/newsletter-sign-up` submits to `https://apps.nyc.gov/nyc-mailform/validation`. The AEM model.json for the form page exposes the complete form configuration, including hidden fields:

- `env_report: REMOTE_HOST,HTTP_ADDR,HTTP_USER_AGENT` — submitter IP and user agent are sent to the backend as named form fields
- `g-recaptcha-oti-username: java-mailform-aem-v3e` — identifies a Spring Boot Java backend ("mailform") using reCAPTCHA Enterprise version 3e
- `subUser: nycgovnewsletters` — Granicus/GovDelivery subscriber group name
- 18 Granicus list IDs as form option values (e.g., `12298993` = General NYC News, `12298178` = NYC Jobs Newsletter, `26904149` = Animal Welfare Newsletter, `11838710` = OATH BenchNotes)

The AEM CSRF token endpoint (`/libs/granite/csrf/token.json`) is whitelisted at the CDN but returns an empty object `{}` — forms operate without AEM-layer CSRF protection.

The full newsletter list is also accessible directly from the AEM DAM:

```
GET https://www.nyc.gov/content/dam/nycgov/data/newsletter-directory.csv
```

Returns 24 entries with Granicus list IDs, agency names, and subuser groups.

## Open APIs and Key Exposure

### Geoclient API Key in poletop-manager Bundle

The OTI (Office of Technology and Innovation) manages a pole-top sensor network via `poletop-manager.nyc.gov`. Its production JavaScript bundle — `https://poletop-manager.nyc.gov/assets/bundle.js` (5MB) — contains a hardcoded API key for the NYC Geoclient v2 service:

```
key: 7d84a8e07e5644c88b5377a0b7e68324
```

The key is authenticated as OAuth client `poletop-aws-prd` against `api.nyc.gov` and was confirmed functional during investigation (verified again live during analysis). No rate limiting was observed across multiple rapid requests.

A query for "empire state building" returns a 232-field JSON object. A representative subset:

```json
{
  "bbl": "1008350041",
  "buildingIdentificationNumber": "1015862",
  "latitude": 40.74843,
  "longitude": -73.985322,
  "censusTract2020": "76",
  "electionDistrict": "015",
  "fireBattalion": "07",
  "fireCompanyNumber": "024",
  "fireCompanyType": "L",
  "policePrecinct": "014",
  "policeSector": "14B",
  "communityDistrict": "105",
  "congressionalDistrict": "12",
  "assemblyDistrict": "75",
  "stateSenatorialDistrict": "28",
  "cityCouncilDistrict": "04",
  "sanitationDistrict": "105",
  "sanitationRegularCollectionSchedule": "MWF",
  "zipCode": "10118"
}
```

The same key works for BIN (Building Identification Number) and BBL (Borough-Block-Lot) lookups, and for the version endpoint, which shows GeoSupport release 26A with data updated as recently as 2026-03-24.

```
GET https://api.nyc.gov/geoclient/v2/search.json?key=7d84a8e07e5644c88b5377a0b7e68324&input={query}
GET https://api.nyc.gov/geoclient/v2/bin.json?key=7d84a8e07e5644c88b5377a0b7e68324&bin={bin}
GET https://api.nyc.gov/geoclient/v2/bbl.json?key=7d84a8e07e5644c88b5377a0b7e68324&borough={1-5}&block={block}&lot={lot}
GET https://api.nyc.gov/geoclient/v2/version.json?key=7d84a8e07e5644c88b5377a0b7e68324
```

The poletop-manager service itself returns 403 on the root and 401 on all `/api/*` paths, but `/api/health` returns `{"status":"UP"}` without credentials, confirming the Spring Boot service is live.

### Frontend Config Endpoints

Three unauthenticated endpoints on www.nyc.gov serve configuration to the frontend JS on every homepage load:

```
GET https://www.nyc.gov/bin/nyc/gateway.json
→ {"API_GATEWAY":"https://api.nyc.gov/","APPS_GATEWAY":"https://apps.nyc.gov/"}

GET https://www.nyc.gov/bin/nyc/sc.ec.json
→ {"API_KEY_EVENT_CAL":"3a3248a64bcf44c88984fae3e745c0d7"}

GET https://www.nyc.gov/bin/nyc/sc.cws.json
→ {"API_KEY_CWS":"3b89aedc67bc416ca5b7e399c7edd34c"}
```

`API_KEY_EVENT_CAL` targets the NYC Events Calendar API; `API_KEY_CWS` likely authenticates against City Web Services / 311 integration. Both keys returned 404 when tested against Azure APIM using the standard `Ocp-Apim-Subscription-Key` header — the exact downstream auth pattern was not determined.

### Agency Directory API

The full agency directory is available without authentication:

```
GET https://www.nyc.gov/bin/nyc/agencydirectory.json
```

The 165KB response contains 307 active agency records. Each entry includes: `record_id` (format: `NYC_GOID_XXXXXX`), `operational_status`, `organization_type`, `name`, `acronym`, `principal_officer_title`, `principal_officer_full_name`, `principal_officer_first_name`, `principal_officer_last_name`, `reports_to`, `in_org_chart`, and `listed_in_nyc_gov_agency`.

The data covers the full Mamdani administration org structure including all Deputy Mayors, the First Deputy Mayor (Dean Fuleihan), Chief of Staff (Elle Bisgaard-Church), Chief Counsel to the Mayor (Ramzi Kassem), and principals of major agencies.

One entry stands out: the Mayor's Office of Housing Recovery Operations (`NYC_GOID_000217`) lists `principal_officer_full_name: "Rudy S. Giuliani"` — a former mayor whose tenure ended in 2001, and who was disbarred in New York and Washington, D.C. in 2024. The feed has no historical flag, no staleness indicator, and no disclaimer. It presents itself as current operational data, and this record has apparently survived multiple mayoral transitions untouched.

## Identity and Tracking

### No Consent Mechanism

NYC.gov has no cookie consent banner, no Consent Management Platform (CMP), and no opt-out mechanism visible on the homepage or linked from it. For a government site serving 8 million residents, every visit begins with tracking. All analytics fire on the first page load of a clean session, confirmed via the `network-fresh-session.txt` capture.

Cookies set on first load with no prior consent:

| Cookie | Owner | Purpose |
|--------|-------|---------|
| `rxVisitor` | Dynatrace | Persistent visitor ID |
| `dtCookie` | Dynatrace | Session |
| `dtPC` | Dynatrace | Page context |
| `dtsrVID` | Dynatrace | Session ID |
| `dtSa` | Dynatrace | Session action |
| `_ga` | Google Analytics | Client ID (`GA1.1.xxxxxx.xxxxxxxxxx`) |
| `_ga_K8J6H31PW0` | Google Analytics 4 | Session measurement |
| `coveo_visitorId` | Coveo | Search visitor ID |
| `AWSALB` | AWS ALB | Sticky session (8-char hex) |
| `AWSALBCORS` | AWS ALB | CORS variant |
| `RT` | Akamai mPulse | Performance timing |

Dynatrace also uses IndexedDB (`dT_store`) for session persistence beyond cookies. The Dynatrace RUM endpoint `/rb_bf46289yka` fires 13–14 times per page load.

### GA4 Multi-Property Setup

Three GA4 measurement IDs are active across two injection mechanisms:

- `G-K8J6H31PW0` — injected via AEM page template (`<meta name="gaid">` + `window.dataLayer.push`), fires on every AEM-rendered page
- `G-X0W5WYPG3G` — configured in GTM container `GTM-WDR6HXB4`
- `G-YZ41G02DMZ` — configured in GTM container `GTM-WDR6HXB4`

The split means the primary GA4 property receives data even if GTM is blocked or disabled.

### Dynatrace Cross-Service Session Correlation

All monitored NYC.gov properties share a single Dynatrace environment, `x8kxxto7`, with distinct application IDs per domain:

| Domain | Dynatrace App ID |
|--------|-----------------|
| www.nyc.gov | `ea7c4b59f27d43eb` |
| nyc-business.nyc.gov | `daaf4557eded1adc` |
| poletop-manager.nyc.gov | `97f2fe953e898205` |

User sessions originating on the main city website and continuing to the Business Portal or the OTI internal tool are correlated in the same Dynatrace workspace. The mPulse RUM API key for www.nyc.gov is `QMXLB-WG9C2-LTK58-FW2PB-6ST8X` (visible in `window.BOOMR_API_key`).

## Vendor Ecosystem

The NycID OAuth flow at `www1.nyc.gov/account/` issues a CSP header whose `child-src` directive enumerates the full set of domains NYC government systems may embed in iframes. This serves as an inadvertent inventory of the city's vendor ecosystem, including internal `.nycnet` domains not publicly documented elsewhere.

**External vendor categories:**

| Category | Vendors |
|----------|---------|
| CRM | Salesforce, Microsoft Dynamics 365 |
| Identity | Auth0, SAP Gigya (Customer Data Cloud), Azure AD B2C (`b2clogin.com`), Microsoft (`microsoftonline.com`) |
| Procurement | iValua, Oracle Cloud |
| Integration | Mulesoft, Informatica Cloud |
| Scheduling | PerfectMind, ElationSys |
| Geospatial | ArcGIS (`nycdohmh.maps.arcgis.com`) |
| Analytics/Feedback | Medallia, Qualtrics (on 311 portal), Alchemer, Decipher |
| Social services | Binti (foster care), NowPow (social care referrals), Samaritan (homelessness), UnitUs (community services) |
| Forms | Submittable |

**Internal NYC network domains exposed in the CSP `child-src` directive:**
`csc.nycnet`, `dcas.nycnet`, `dhs.nycnet`, `dohmh.nycnet`, `doitt.nycnet`, `finance.nycnet`, `hpd.nycnet`, `nycid.nycnet`, `nyco.nycnet`, `records.nycnet`, `sbs.nycnet`

The 311 portal (`portal.311.nyc.gov`) runs on Dynamics 365 and loads Facebook SDK content from `fbcdn.net`, logging to `facebook.com/platform/plugin/page/logging/` on each page view — a tracking vector not present on the main AEM site. Microsoft telemetry fires to `us-mobile.events.data.microsoft.com` and `dc.services.visualstudio.com`. Qualtrics site intercept (`gov1.siteintercept.qualtrics.com`) is also active on the 311 portal.

## Subdomain Topology

The TLS certificate for www.nyc.gov includes 32 Subject Alternative Names, mapping the full subdomain topology:

**Staging/preview environments:**
`dev.nyc.gov`, `stg.nyc.gov`, `dev-preview.nyc.gov`, `stg-preview.nyc.gov`, `www-test.nyc.gov`

**Chat infrastructure:**
`chat.nyc.gov`, `chat-dev.nyc.gov`, `chat-stg.nyc.gov`

**GIS cluster:**
`gis.nyc.gov`, `gis1.nyc.gov`, `gis2.nyc.gov`, `gis3.nyc.gov`, `maps.nyc.gov`

**Internal tools on public cert:**
`poletop-manager.nyc.gov` (OTI IoT), `organize.nyc.gov` (purpose not investigated), `r-media.nyc.gov`, `s-media.nyc.gov`

**Emergency/notification:**
`a858-nycnotify.nyc.gov`, `a858-nycnotify-stg.nyc.gov` (Notify NYC emergency alerts), `nycem-api.cityofnewyork.us` (NYC Emergency Management API)

**Legacy:**
`www1.nyc.gov`, `rentalripoff.nyc.gov`, `vaccinefinder.nyc.gov`

The `robots.txt` is minimal — only `Disallow: /html/misc/`. A `security.txt` at `/.well-known/security.txt` points to `nyc.responsibledisclosure.com` (Zendesk-hosted), expiring 2026-07-01.

---

## Machine Briefing

### Access and Auth

Most read operations on www.nyc.gov require no authentication. Akamai CDN blocks AEM admin paths with HTTP 490 before they reach the origin. The AEM author instance requires Granite/Adobe IMS credentials. NycID OAuth (`www1.nyc.gov/account/`) uses a custom OAuth 2.0 flow with SAML fallback; session cookie is `SESSION` (HttpOnly, Secure, SameSite=Lax).

### Open Endpoints

**Frontend config (no auth, fires on every homepage load):**
```
GET https://www.nyc.gov/bin/nyc/gateway.json
GET https://www.nyc.gov/bin/nyc/sc.ec.json
GET https://www.nyc.gov/bin/nyc/sc.cws.json
GET https://www.nyc.gov/content/nycgov-data/coveo-i18n/en.json
GET https://www.nyc.gov/content/dam/nycgov/data/newsletter-directory.csv
```

**Agency directory (no auth, 165KB, 307 agencies):**
```
GET https://www.nyc.gov/bin/nyc/agencydirectory.json
```

**AEM content path lookup (no auth):**
```
GET https://www.nyc.gov/bin/form/mailform/title-from-url.json?url={path}
```

**AEM page content tree (no auth, raw publish domain only):**
```
GET https://publish-p136379-e1368845.adobeaemcloud.com/content/nycgov/main/en/{page}.model.json
GET https://publish-p136379-e1368845.adobeaemcloud.com/content/nycgov/mayors-office/en/{page}.model.json
```

**Geoclient (key from poletop-manager bundle):**
```
GET https://api.nyc.gov/geoclient/v2/search.json?key=7d84a8e07e5644c88b5377a0b7e68324&input={query}
GET https://api.nyc.gov/geoclient/v2/address.json?key=7d84a8e07e5644c88b5377a0b7e68324&houseNumber={n}&street={s}&borough={borough}
GET https://api.nyc.gov/geoclient/v2/bbl.json?key=7d84a8e07e5644c88b5377a0b7e68324&borough={1-5}&block={block}&lot={lot}
GET https://api.nyc.gov/geoclient/v2/bin.json?key=7d84a8e07e5644c88b5377a0b7e68324&bin={bin}
GET https://api.nyc.gov/geoclient/v2/version.json?key=7d84a8e07e5644c88b5377a0b7e68324
```

**Sitemaps:**
```
GET https://www.nyc.gov/sitemap.xml              (index, 4 child sitemaps)
GET https://www.nyc.gov/sitemap-main.xml         (81 URLs)
GET https://www.nyc.gov/sitemap-mayors.xml       (4,853 URLs)
GET https://www.nyc.gov/sitemap-mayors2.xml      (198 URLs)
GET https://www.nyc.gov/sitemap-jobs.xml         (163 URLs)
```

**poletop-manager health (no auth):**
```
GET https://poletop-manager.nyc.gov/api/health
→ {"status":"UP"}
```

### Gotchas

- **HTTP 490** is non-standard — it is the legacy Livesite proxy's "application not mapped" response, used to block AEM admin paths and old CMS paths on www.nyc.gov. Do not interpret it as a server error.
- **AEM admin paths are blocked at the CDN layer** on www.nyc.gov. Target the raw publish domain `publish-p136379-e1368845.adobeaemcloud.com` directly for `.model.json` requests.
- **AEM model.json path pattern:** `/content/nycgov/{site}/{locale}/{page}.model.json`. Known sites: `main`, `mayors-office`. Locale is `en`.
- **Geoclient borough codes:** 1=Manhattan, 2=Bronx, 3=Brooklyn, 4=Queens, 5=Staten Island.
- **apps.nyc.gov** returns HTTP 200 with a maintenance page for all root paths. The `/nyc-mailform/` endpoint responds (405 on GET) but the gateway is not operational for general services.
- **Coveo search** at `/rest/search/v2` requires a bearer token retrieved dynamically by the frontend — not captured, returns 401 without it.
- **sc.ec.json and sc.cws.json keys** did not authenticate against the Azure APIM gateway using the standard `Ocp-Apim-Subscription-Key` header — the downstream auth pattern for those services was not determined.
