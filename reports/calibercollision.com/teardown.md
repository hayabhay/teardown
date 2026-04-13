---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Caliber — Teardown"
url: "https://www.caliber.com"
company: "Caliber"
industry: "Transportation"
description: "National auto body, collision, and glass repair chain."
summary: "Next.js 14 headless frontend over dotCMS cloud (caliber-prod.dotcms.cloud) with Apollo GraphQL. BunnyCDN and CloudFront dual-stack CDN. Fleet management runs on separate subdomains with Okta SSO. GTM orchestrates a large tracker fleet with no consent management layer."
date: 2026-04-12
time: "20:31"
contributor: hayabhay
model: "sonnet-4.6"
effort: medium
stack:
  - Next.js
  - dotCMS
  - BunnyCDN
  - CloudFront
  - Apollo GraphQL
trackers:
  - Google Analytics
  - Google Ads
  - Microsoft Clarity
  - Facebook Pixel
  - AdRoll
  - Mouseflow
  - GTM
  - Sentry
  - NiceInContact
  - Chatmeter
  - Surfly
  - TrackedWeb
tags:
  - auto-repair
  - cms
  - elasticsearch
  - no-consent
  - session-recording
  - fleet
  - okta
  - azure
  - open-api
  - expansion-data
headline: "Caliber's unauthenticated Elasticsearch API returns 9 unannounced shop openings through 2027 -- full addresses and target dates included."
findings:
  - "The /api/es/search endpoint requires no authentication and accepts arbitrary Elasticsearch queries -- the full location database including 103 closed shops and 9 future openings through January 2027 is openly readable."
  - "Three fleet management environments (dev, qa, uat) are publicly accessible, each exposing config.js files with Okta client IDs and Azure Application Insights instrumentation keys."
  - "NiceInContact's public tenant configuration API returns Caliber's full chat routing ruleset by URL, including references to a staging domain not linked anywhere on the production site."
  - "No cookie consent banner exists -- Google Analytics, Microsoft Clarity, Google Ads, and AdRoll all fire on first page load under implied consent via terms of use."
  - "Every page embeds 107 internal CMS content type names in __NEXT_DATA__, mapping the full product surface including test artifacts and unreleased form workflows."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

`calibercollision.com` 301-redirects to `www.caliber.com` (served from Microsoft IIS/10.0 on the redirect hop). The main site is a Next.js 14 application -- buildId `oN2kdvYugL5ps_Pc8_6UV` -- running as a headless frontend over dotCMS cloud (`caliber-prod.dotcms.cloud`). The CMS connection runs both a REST API (`/api/content/`) and an Apollo GraphQL client pointed at `https://caliber-prod.dotcms.cloud/api/v1/graphql`. Svelte appears in minor usage alongside React.

The CDN stack is BunnyCDN in front of CloudFront -- `Server: BunnyCDN-WA1-1431`, `Via: 1.1 ... cloudfront.net`. BunnyCDN absorbs origin traffic; CloudFront sits further upstream. The edge setup strips most origin headers, but API responses still carry `x-dot-server: dotcms-caliber-prod-1-0|4bf40c1187`, leaking the internal dotCMS server identifier.

HSTS is configured as `strict-transport-security: max-age=3600;includeSubDomains` -- one hour. Most production deployments set this to 31,536,000 seconds (one year). Caliber's one-hour window means the HTTPS enforcement lapses for any visitor who hasn't loaded the site within the past hour.

The `robots.txt` disallows several internal path prefixes that confirm CMS topology: `/Webtop` and `/webtop` are dotCMS admin paths; `/cwif` and `/cwig` are internal CMS identifiers; `/application` is the dotCMS application context. Two `thought-leadership` paths were previously disallowed but are now commented out -- `2024-overview` and `caliber-advantage` -- suggesting content that moved from hidden to public.

Every page embeds a `__NEXT_DATA__` JSON payload server-rendered at request time. The `props.pageProps.pageData.viewAs.visitor.geo` object contains the CDN edge node's geolocation data -- latitude, longitude, city, state, country, timezone, and `ipAddress`. The IP (`3.233.217.67`) belongs to an AWS address in Fairfield, Connecticut -- the edge server, not the visitor -- but the full geo structure ships in every HTML response regardless. The same `pageData` structure exposes 107 registered CMS content type names, providing a complete map of the internal content model: `OnlineAuthProgressBar`, `FleetForm`, `SelfSchedulingWDKYForm`, `ChatBotWKYScript`, `TestSocialImages`, `FrontDoorSchedulingForm`, `calendarEvent`, and 100 others.

The dotCMS admin panel is at `caliber-prod.dotcms.cloud/dotAdmin/` -- credential-gated, separately hosted from the main domain. CORS on dotCMS API responses is set to `access-control-allow-origin: *`, meaning any origin can query the content APIs cross-domain.

---

## The Open Search API

`POST /api/es/search` on `www.caliber.com` accepts arbitrary Elasticsearch query DSL with no authentication. This is a dotCMS feature -- the platform exposes a proxied ES search endpoint for front-end location finding -- but the endpoint is unrestricted: any query body returns results.

The ES response includes the full `esresponse` object from Elasticsearch internals, including the index name: `cluster_caliber-prod-1.live_20250304164522`. The index was last snapshotted 2025-03-04.

A targeted query filtering for `contentType:Center` returns 2,995 total records per the ES `total` field (the first 1,000 are paginated in a single request). Center records include:

- Location title, street address, city, state, zip
- GPS coordinates (`latitude`, `longitude`, `latlong`)
- Operating hours for all seven days
- Email address (field: `emailAddress`)
- Center ID, region name and region ID
- Chatmeter reputation management ID
- Service type tags (`collision`, `glass`, `fleetCare`, `autoCare`)
- `status` field (active / inactive)
- `openDate` -- planned opening date for future locations

Of the 1,000 records in the first page: 897 are `active`, 103 are `inactive` (closed or not yet open). Within the inactive set, 9 have open dates after April 12, 2026:

| Location | Address | Opens |
|----------|---------|-------|
| Stephenville | 920 N Wolfe Nursery Rd, Stephenville, TX | 2026-05-04 |
| Humble | 19753 Deerbrook Park Blvd, Humble, TX | 2026-05-04 |
| Myrtle Beach - Southeast | 1117 Hanover St, Myrtle Beach, SC | 2026-06-08 |
| Buffalo - Northeast | 4959 Genesse St, Buffalo, NY | 2026-07-13 |
| Lakeville MN | 9875 217th Street West, Lakeville, MN | 2026-07-16 |
| Lancaster PA | 820 Plaza Blvd, Lancaster, PA | 2026-11-01 |
| Benbrook | 485 Winscott Rd, Benbrook, TX | 2026-11-02 |
| Locust Grove | 620 Stanley K Tanger Boulevard, Locust Grove, GA | 2026-11-09 |
| Aberdeen | 1015 Whitney Dr, Aberdeen, NC | 2027-01-04 |

These are staging entries for planned shop openings -- full addresses, service types, and target open dates, but not visible through the public location finder.

The search API is not limited to Center records. An unconstrained query returns `"total":{"value":10000,"relation":"gte"}` -- 10,000+ total records across all content types. Queryable types observed include `forms`, `MediaImage`, `BioCard`, `CollisionService`, `MediaLibraryPage`, and widget types.

One notable record: `JLTestForm` -- a dotCMS `forms` contentlet with `formId: d5b31997edb7b0355967459e46c8c346`, owned by non-system user `user-dbbae0e7-f3c8-485b-a76b-ebac03582dc2`, marked live in production. A developer test form that was published and never removed.

The GraphQL endpoint at `/api/v1/graphql` is accessible (returns 400 on malformed queries) but introspection is disabled.

---

## Fleet Environments

Caliber runs a separate web application for fleet management customers at `fleet.caliber.com`. Three pre-production environments are publicly reachable, all serving HTTP 200 with their configuration exposed:

**fleet-dev.caliber.com** (`config.js`):
```js
window.__APP_CONFIG__ = {
  OKTA_ISSUER: "https://calibercollision-customerdev-oci.okta.com/oauth2/default",
  OKTA_CLIENT_ID: "0oa21qayo1tm3mTAE1d8",
  SUPPORT_EMAIL: "",
  ENABLE_DEVELOPER_TOOLS: "true",
  APPLICATIONINSIGHTS_CONNECTION_STRING: "InstrumentationKey=463f8aa7-...;IngestionEndpoint=https://southcentralus-3.in.applicationinsights.azure.com/;LiveEndpoint=https://southcentralus.livediagnostics.monitor.azure.com/;ApplicationId=f98014b9-..."
};
```

**fleet-qa.caliber.com** (`config.js`):
```js
window.__APP_CONFIG__ = {
  OKTA_ISSUER: "https://caliberbrands.oktapreview.com/oauth2/default",
  OKTA_CLIENT_ID: "0oawmej79vUZa5gq81d7",
  SUPPORT_EMAIL: "",
  ENABLE_DEVELOPER_TOOLS: "true",
  APPLICATIONINSIGHTS_CONNECTION_STRING: "InstrumentationKey=687aba0f-...;IngestionEndpoint=https://southcentralus-3.in.applicationinsights.azure.com/;LiveEndpoint=https://southcentralus.livediagnostics.monitor.azure.com/;ApplicationId=c8850ada-..."
};
```

**fleet-uat.caliber.com** (`config.js`):
```js
window.__APP_CONFIG__ = {
  OKTA_ISSUER: "https://caliberbrands.oktapreview.com/oauth2/default",
  OKTA_CLIENT_ID: "0oawmej79vUZa5gq81d7",
  SUPPORT_EMAIL: "",
  ENABLE_DEVELOPER_TOOLS: "true"
};
```

Two separate Okta organizations are in use: `calibercollision-customerdev-oci.okta.com` for dev, and `caliberbrands.oktapreview.com` for QA and UAT. All three environments have `ENABLE_DEVELOPER_TOOLS: "true"`. Dev and QA both include full Azure Application Insights connection strings -- instrumentation keys, ingestion endpoints, live diagnostics endpoints, and application IDs.

Azure Application Insights instrumentation keys are designed to be sent from client code, but exposing them in a public config.js means any external system can submit telemetry to Caliber's internal monitoring workspace, polluting error and performance data.

Separately, `adas-calibration-dev.caliber.com` serves an Angular application titled "File Upload" running on GCP infrastructure. It presents a Microsoft SSO login but the app shell is internet-accessible. The ADAS name (Advanced Driver Assistance Systems) suggests an internal tool for handling vehicle sensor calibration data files.

---

## Surveillance Without Consent

`www.caliber.com` has no cookie consent management platform. No OneTrust, Cookiebot, TrustArc, or equivalent CMP. The privacy policy uses implied consent: "By using this Site, you agree with our Website Terms & Conditions." No opt-out mechanism is linked from the homepage.

The following trackers fire or are confirmed active on first page load, before any user interaction:

**Directly observed in network logs:**

| Tracker | Detail |
|---------|--------|
| Google Analytics 4 | Two properties: `K0FS2K41D2` and `BP8LWQ9DQB` -- `POST analytics.google.com/g/collect` |
| Google Ads / DoubleClick | Source ID `16643032` -- `POST ad.doubleclick.net/activity` |
| Microsoft Clarity | `POST b.clarity.ms/collect` (x3 per page load) |
| AdRoll | ADV ID `2IMFKGA3MVARXIPZEFH72A`, PIX ID `4QRJ5CNZJFCQFEY5HHSYKY` -- `GET d.adroll.com/segment` |
| Sentry.io | Error monitoring, project `1545691` -- `POST sentry.io/api/1545691/envelope/` |
| TrackedWeb / Salesforce DMP | DM ID `DM-6599628409-02`, loads via GTM -- `POST r2.trackedweb.net/pagevisit` returns **404** on every call. Broken. |
| StickAdsTV | `GET ads.stickyadstv.com/user-registering` returns **410** (Gone). Deprecated tag still firing. |

**Configured via GTM (from CSP and page globals, not directly observed in network):**

| Tracker | Detail |
|---------|--------|
| Facebook Pixel | ID `26251172381184272` -- `window.fbq` initialized, `connect.facebook.net` in CSP |
| Mouseflow | Session recording -- `window.mouseflow` loaded, `cdn.mouseflow.com` in CSP, `mouseflowDisableKeyLogging: true` |
| Hotjar | `static.hotjar.com` and `script.hotjar.com` in CSP -- authorized but not observed firing |

The GTM container is `GTM-T7FJXP27`. Facebook Pixel and Mouseflow are GTM-loaded and may fire on page interaction rather than document load, which is why they don't appear in the initial network capture.

Two trackers actively make requests on every page load despite being broken: the Salesforce DMP tag returns 404 from `trackedweb.net`, and the StickAdsTV user registration call returns 410. Both are dead requests with no apparent effect.

AdRoll has `adroll_sendrolling_cross_device: false` -- cross-device tracking is disabled, but AdRoll retargeting remains active.

---

## Embedded Tooling and Vendor Exposure

**Surfly co-browsing.** `window.Surfly._userSettings.widget_key = "489e455074ed46f8bca33b41b5777829"` is in every page's JavaScript. Surfly lets support agents share and interact with a customer's browser session in real time. The widget key is public by design (client-side initialization), but the co-browsing infrastructure loads for every visitor.

**Chatmeter reputation management.** `window.chatmeter` is initialized with widget ID `69b993a9f3738a721d192806` and account ID `5a861d1cf2301ebbb7ade33c`. Chatmeter handles review aggregation and reputation monitoring for multi-location businesses.

**NiceInContact / NICE CXone chat.** The chat widget (tenant ID `5430`, brand ID `5430`) loads from `home-c32.nice-incontact.com`. A public configuration endpoint at `https://web-modules-de-na1.niceincontact.com/guide/1.0/tenants/5430/configuration` returns the full chat routing ruleset without authentication. The rules are URL-based conditions (which page triggers which chat flow) and include references to a staging URL: `caliber-staging.dotcdn.io/services/collision` and `caliber-staging.dotcdn.io/services/auto-glass`. The staging domain returns HTTP 200.

The configuration exposes Caliber's full chat logic: languages supported, hours of operation, day-of-week routing rules, and the specific page URLs that trigger each chat flow.

**Google Maps API key.** `AIzaSyAbgI2fPio9L55xpbtLIfFIwPpbm-UPaDM` is hardcoded in the JS bundle. Client-side Maps API keys are standard practice and domain-restricted, but trivially extractable.

---

## Machine Briefing

### Access & auth

The main site (`www.caliber.com`) is public. No session required for the ES search API or the NiceInContact configuration endpoint. The dotCMS admin panel at `caliber-prod.dotcms.cloud/dotAdmin/` requires credentials. The GraphQL endpoint at `/api/v1/graphql` is accessible but introspection is disabled. Fleet app environments are public HTTP but login-gated (Okta SSO).

### Endpoints

**Open -- no auth required:**

```bash
# Location search -- arbitrary Elasticsearch DSL
curl -X POST https://www.caliber.com/api/es/search \
  -H 'Content-Type: application/json' \
  -d '{"query":{"term":{"contentType":"Center"}},"size":1000,"from":0}'

# Filter by status
curl -X POST https://www.caliber.com/api/es/search \
  -H 'Content-Type: application/json' \
  -d '{"query":{"bool":{"must":[{"term":{"contentType":"Center"}},{"term":{"status":"inactive"}}]}},"size":1000}'

# Unconstrained -- returns 10,000+ total records across all content types
curl -X POST https://www.caliber.com/api/es/search \
  -H 'Content-Type: application/json' \
  -d '{"query":{"match_all":{}},"size":10}'

# NiceInContact public tenant configuration (chat routing rules)
curl https://web-modules-de-na1.niceincontact.com/guide/1.0/tenants/5430/configuration

# Fleet environment configs (public)
curl https://fleet-dev.caliber.com/config.js
curl https://fleet-qa.caliber.com/config.js
curl https://fleet-uat.caliber.com/config.js

# GraphQL endpoint (introspection disabled)
curl -X POST https://www.caliber.com/api/v1/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"{ page(url:\"/\") { title } }"}'
```

**Server-rendered page data:**

```bash
# __NEXT_DATA__ in every page -- includes viewAs.visitor.geo, 107 content types
curl -s https://www.caliber.com/ | grep -o '__NEXT_DATA__.*' | head -c 5000
```

**dotCMS REST (requires auth):**
```
GET https://caliber-prod.dotcms.cloud/api/v1/contenttype/  -> 401
GET https://caliber-prod.dotcms.cloud/dotAdmin/            -> login page
```

### Gotchas

- The ES search endpoint returns up to 1,000 records per page. Use `from` to paginate through the full 2,995 Center records.
- The `esresponse` field in every ES response contains raw Elasticsearch metadata including the index name (`cluster_caliber-prod-1.live_20250304164522`).
- The `openDate` field uses Microsoft JSON date format: `/Date(timestamp-ms)/`. Parse accordingly.
- Hours fields (`mondayHoursOpen`, etc.) are stored as epoch datetimes with a 1970-01-01 date prefix -- only the time component is meaningful.
- The GraphQL endpoint returns a 400 with a descriptive error on bad queries but blocks `__schema` introspection.
- `r2.trackedweb.net/pagevisit` returns 404 and `ads.stickyadstv.com/user-registering` returns 410 -- broken tags that fire on every page load.
