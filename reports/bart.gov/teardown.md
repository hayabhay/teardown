---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "BART — Teardown"
url: "https://bart.gov"
company: "BART"
industry: Transportation
description: "San Francisco Bay Area public transit rail network."
summary: "bart.gov runs Drupal 10 on Acquia behind Cloudflare and Varnish, with a separate legacy ASP.NET 4.0 API at api.bart.gov serving real-time transit data via a hardcoded public key. Trip planning is licensed HAFAS software from Deutsche Bahn subsidiary HACON at planner.bart.gov. Authentication routes through Auth0. A live development server at dev-chatai.bart.gov exposes BART's in-progress voice-enabled AI chatbot built on FastAPI, DynamoDB, and Amazon Polly with no access controls."
date: 2026-04-08
time: "05:42"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack: [Drupal 10, Acquia, Cloudflare, Varnish, ASP.NET, HAFAS, FastAPI, Auth0]
trackers: [Google Analytics, Google Analytics 4, Google Ads, Google Tag Manager, Facebook Pixel, Twitter Pixel, Trade Desk, Cloudflare Web Analytics]
tags: [government, transit, public-sector, no-consent, legacy-api, ai-development, surveillance, hafas, ad-tech]
headline: "BART's unfinished AI chatbot is live on a public subdomain with full Swagger docs, unauthenticated session endpoints, and a broken DynamoDB connection visible to anyone."
findings:
  - "dev-chatai.bart.gov serves BART's in-development 'MAAS LLM App' with Swagger UI, a public OpenAPI spec, and an unauthenticated endpoint that returns session context for any arbitrary user and session ID -- anyone can read the chatbot's internal state."
  - "BART's HAFAS trip planner ships with a built-in cookie consent framework that BART explicitly disabled in the config -- then the Trade Desk ad pixel is embedded as an iframe on the planner page, linking rider trip-planning behavior directly to an ad exchange."
  - "The privacy policy discloses Google Analytics and Facebook but omits Twitter/X and Trade Desk, both of which fire on every page -- including the breach notification page at /MyDataReview where affected individuals check their exposure from a 2023 Dark Web leak."
  - "Certificate transparency logs expose BART's full operational subdomain map: Automated Fare Collection systems, a Master Control System GUI, train status infrastructure, VPN endpoints, Fortinet appliances, and a USGS ShakeCast earthquake notification system."
  - "Facebook Pixel, Twitter/X, Trade Desk, and Google Ads fire on every page of this government transit site with no consent banner and Google Consent Mode explicitly set to false in the Drupal configuration."
---

BART is a 50-station rail network serving the San Francisco Bay Area, running roughly 27 trains at any given hour. Its web presence reflects three decades of accumulated technical decisions -- a modern Drupal CMS layered over a 15-year-old transit API, a trip planner licensed from a Deutsche Bahn subsidiary, and a new AI chatbot under construction on AWS. Those layers don't share the same security posture.

## Architecture

bart.gov splits across six distinct server environments:

| Domain | Stack | Hosting |
|--------|-------|---------|
| www.bart.gov | Drupal 10 | Acquia, Cloudflare + Varnish |
| api.bart.gov | ASP.NET 4.0 | Cloudflare only |
| planner.bart.gov | HAFAS (Apache/Debian) | Separate host |
| bartable.bart.gov | Drupal 10 | Separate tracking profile |
| dev-chatai.bart.gov | FastAPI/nginx | AWS (DynamoDB + Polly) |
| auth.bart.gov | Auth0 | SSO provider |

Response headers tell the story: `x-generator: Drupal 10`, `x-ah-environment: prod`, `via: varnish`, and Cloudflare's `CF-Ray` all appear on www.bart.gov responses. The Varnish cache is active -- `x-cache-hits: 317` was observed in a single session header. Drupal's login endpoint (`/user/login`) returns 404 rather than 403, indicating it's entirely disabled; all authentication routes through auth.bart.gov, which proxies to Auth0 (`x-auth0-l` and `x-auth0-requestid` headers confirmed). A staging environment at stg-auth.bart.gov runs parallel.

The Drupal settings block (`drupal-settings-json`) confirms the CMS configuration:

```json
{
  "gtag": {
    "tagId": "UA-12028058-1",
    "consentMode": false,
    "otherIds": ["G-384238832"]
  },
  "gtm": {
    "tagIds": ["GTM-NMRPD69"]
  },
  "user": {"uid": 0}
}
```

`consentMode: false` is the most consequential line here -- it explicitly disables Google's consent mode framework, meaning Google's own anonymization signals are ignored regardless of any user action.

No CSP header is present on www.bart.gov responses. `x-frame-options: SAMEORIGIN` and `x-content-type-options: nosniff` are set.

## The Unprotected AI Chatbot

The most operationally notable finding is `dev-chatai.bart.gov`, a live FastAPI server running BART's in-development AI chatbot -- referred to in the OpenAPI spec as the "MAAS LLM App" (Mobility as a Service). The server is publicly accessible with no authentication on any endpoint.

The full OpenAPI spec is readable at `/openapi.json`. Swagger UI is live at `/docs`. Documented endpoints:

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /` | None | Root health (ALB probe) |
| `GET /health` | None | Minimal health check |
| `GET /health/detailed` | None | Full health with DB + memory |
| `GET /api/context/{user_id}/{session_id}` | None | Session context lookup |
| `GET /api/polly/stats` | None | Amazon Polly queue stats |
| `GET /{path}` | None | Catch-all |

`/api/context/{user_id}/{session_id}` accepts any user ID and session ID and returns the current session state for that combination. A request to `/api/context/test123/sess456` returns:

```json
{
  "user_id": "test123",
  "session_id": "sess456",
  "last_intent": null,
  "last_category": null,
  "last_api_endpoint": null,
  "cached_parameters": {},
  "conversation_count": 0,
  "last_activity": "2026-04-08T05:38:55.381600",
  "recent_contexts_count": 0
}
```

`/health/detailed` reveals the server's internal state:

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "checks": {
    "application": {"status": "healthy"},
    "memory": {"status": "healthy", "memory_percent": 5.4},
    "database": {
      "status": "unknown",
      "error": "'dynamodb.ServiceResource' object has no attribute 'describe_table'"
    }
  }
}
```

The DynamoDB backend is currently failing -- the SDK call for `describe_table` is misconfigured. Memory sits at 5.4%. The Amazon Polly integration (text-to-speech) is configured with rate limits: `max_rps: 500`, `max_rpm: 30000`, `max_concurrent: 400`, `num_workers: 20` -- all confirmed via `/api/polly/stats`.

The architecture is FastAPI (Python) + AWS DynamoDB + Amazon Polly. The "MAAS LLM App" name and the Polly integration indicate BART is building a voice-accessible AI trip assistant. The development deployment has no auth controls on any endpoint and no indication it's isolated from production data paths once DynamoDB is operational.

## The Tracking Stack

bart.gov carries eight distinct tracking systems that fire on first page load with no user interaction. There is no cookie consent banner and no consent management platform anywhere on the site.

**Scripts loaded on every page:**

| Tracker | ID/Key | Fires On |
|---------|--------|----------|
| Google Analytics (Universal) | UA-12028058-1 | Sitewide |
| Google Analytics 4 | G-384238832 | Sitewide |
| Google Analytics 4 (second property) | G-5K3MLK005K | Sitewide |
| Google Ads (conversion + remarketing) | AW-810977897 | Sitewide |
| Google Tag Manager | GTM-NMRPD69 | Sitewide |
| Facebook Pixel | 989478211221268 | Sitewide |
| Twitter/X Universal Website Tag | nzk31 | Sitewide |
| Trade Desk Universal Pixel | advertiser_id: e4quxkk, pixel_id: onwy113 | Sitewide |
| Cloudflare Web Analytics | beacon.min.js | Sitewide |

**Cookies set before any user interaction:**

- `_ga`, `_gid`, `_gat_gtag_UA_12028058_1` -- Google Analytics (UA)
- `_ga_384238832`, `_ga_5K3MLK005K` -- two GA4 properties
- `_gcl_au` -- Google Ads
- `_fbp` -- Facebook pixel browser ID
- `_twpid` -- Twitter pixel ID

The GTM container (GTM-NMRPD69) injects the Facebook Pixel and Trade Desk pixel via custom HTML tags. The container's tag list: Twitter website tag (`__twitter_website_tag`), Google Ads smart pricing (`__sp`), Google Click ID Writer (`__gclidw`), Google Ads User Data (`__awud`), Firestore Listener (`__fsl`), and the two custom HTML tags for Facebook and Trade Desk.

The Trade Desk Universal Pixel fires as both a script (`js.adsrvr.org/up_loader.1.1.0.js`) and as a tracking iframe embedded directly on the trip planner page (`insight.adsrvr.org/track/cei?advertiser_id=e4quxkk&cookie_sync=1`). This iframe placement on the trip planner means Trade Desk receives a sync signal when riders are actively planning trips -- connecting trip planning behavior to Trade Desk's cross-site ad graph.

**Pages where Facebook Pixel fires (verified):**

- `/guide/safety/police` -- BART Police page
- `/hotcar` -- report a hot or cold train car
- `/MyDataReview` -- the breach notification page
- `/biohazard` -- report a biohazard on a train

The `/biohazard` and `/MyDataReview` pages are notable: both are public safety and incident-response tools. Facebook Pixel and Trade Desk both fire on these pages.

Google Consent Mode is explicitly disabled via `consentMode: false` in Drupal settings, meaning Google processes all available signals without consent mode's anonymization layer.

### The Privacy Policy Gap

BART's privacy policy (last updated December 15, 2023) discloses Google Analytics, Google AdWords, and Facebook Conversion Tracking. It does not mention Twitter/X Universal Tag or Trade Desk -- both of which are actively firing. The policy states explicitly: "we do not disable tracking technology in response to any 'do not track' requests."

### Multi-Property Analytics Architecture

BART operates three separate GA4 properties across its subdomain ecosystem:

- `www.bart.gov`: G-384238832, G-5K3MLK005K (two properties on the same domain), plus UA-12028058-1 (Universal Analytics)
- `bartable.bart.gov` (BART's lifestyle magazine): GTM-WT78NCC, UA-59325206-1, G-X9300HC26B, Facebook Pixel 174004295272345 -- completely separate tracking profile
- `api.bart.gov` (developer docs): G-XC628Y2N9B -- its own GA4 property tracking developer API usage

Two GA4 properties running simultaneously on www.bart.gov suggests a migration or A/B measurement experiment that was never cleaned up.

## The Trip Planner: Licensed HAFAS Software

The trip planner at `planner.bart.gov` is licensed HAFAS software from HACON, a Deutsche Bahn subsidiary. The JS bundle identifies it as:

- Client name: "Bay Area Rapid Transit" (id: "bart")
- Software version: 2.10.10, GUI version: 1.0.5
- HAFAS API version: 1.53
- Build timestamp: Mon, 23 Jan 2023 18:56:51 GMT
- Active schedule: 2026-03-28 to 2026-07-06
- Languages: English (default) and Spanish

The backend API URL is `https://planner.bart.gov/gate/` (POST, JSON-RPC). The HAFAS client auth token is exposed in both the JS bundle and `config/webapp.config.json`:

```json
{
  "urlMgate": "https://planner.bart.gov/gate/",
  "hciAuth": { "aid": "kEwHkFUCIL500dym" }
}
```

A secondary virtual client configuration (`vs_ccta`) exposes a CCTA (Contra Costa Transportation Authority) endpoint with its own token:

```json
{
  "urlMgate": "https://planner.bart.gov/bin/ccta/mgate.exe",
  "hciAuth": { "aid": "web347c3bn47nnh" }
}
```

This indicates BART has a joint trip planning integration with CCTA running through a separate HAFAS backend.

HAFAS ships with a built-in cookie consent framework covering default, performance, functional, and marketing cookie categories. BART explicitly disabled it: `showCookieHint: false` and `PrivacyPolicy: false` are set in the config. This is a deliberate override of the vendor's built-in consent mechanism.

A developer contact address in the static JS bundle (`Gopi.purohit@transsight.com`) indicates TransSight as the HAFAS implementation vendor. The production config overrides this with `webcustomerservices@bart.gov`.

The HAFAS trip planner runs on a separate server (Apache/2.4.62 on Debian). Because the planner is embedded in an iframe under the `.bart.gov` domain scope, the `_ga`, `_fbp`, `_twpid`, and `_gcl_au` cookies set by the main site are shared with the planner's cookie context. Rider trip planning behavior is linked to the same tracking identities as general browsing.

## The Legacy Transit API

`api.bart.gov` has served real-time BART data since the early 2010s. It runs ASP.NET 4.0 -- a framework from 2010 -- and shows no signs of retirement. All endpoints accept a single hardcoded public key (`MW9S-E7SL-26DU-VV8V`) that BART publishes on its developer documentation page. All responses include `Access-Control-Allow-Origin: *`.

Active endpoints (all unauthenticated, all return JSON with `&json=y`):

```
GET https://api.bart.gov/api/stn.aspx?cmd=stns&key=MW9S-E7SL-26DU-VV8V&json=y
  -> All 50 stations with name, abbreviation, lat/lng, address, city, county

GET https://api.bart.gov/api/etd.aspx?cmd=etd&orig=ALL&key=MW9S-E7SL-26DU-VV8V&json=y
  -> Real-time departures for all 49 active stations
  -> Each estimate includes: minutes, platform, direction, train length, line color, bikeflag, delay, cancelflag, dynamicflag

GET https://api.bart.gov/api/etd.aspx?cmd=etd&orig=12TH&key=MW9S-E7SL-26DU-VV8V&json=y
  -> Real-time departures for a single station (12th St. Oakland)

GET https://api.bart.gov/api/bsa.aspx?cmd=bsa&key=MW9S-E7SL-26DU-VV8V&json=y
  -> Current service advisories with type, description, SMS text, posted/expiry dates

GET https://api.bart.gov/api/bsa.aspx?cmd=count&key=MW9S-E7SL-26DU-VV8V&json=y
  -> Live train count on the network (27 trains as of 2026-04-07 22:28 PDT)
```

The `cancelflag` and `dynamicflag` fields in ETD responses suggest real-time cancellation and dynamic scheduling data is in the feed. `bikeflag` indicates whether bikes are allowed on that specific train.

`api2.bart.gov` and `api3.bart.gov` both 301-redirect to the same `/docs` endpoint as `api.bart.gov`, consistent with load balancing across three hosts.

Separately, www.bart.gov exposes unauthenticated Drupal-served endpoints for real-time data:
- `GET /schedules/advisories/heading` -- JSON alert banner content
- `GET /schedules/eta_schedule/{STATION}/platform/long` -- HTML fragment for real-time departure board

These appear to be the same API data proxied through Drupal's backend calls to api.bart.gov.

## Subdomain Infrastructure Footprint

Certificate transparency logs expose BART's operational subdomain naming scheme. The pattern is systematic -- primary/backup pairs for critical infrastructure, environment prefixes (stg-, dev-) for non-production systems:

**Network access:**
- `BART-VPN-ASA.bart.gov`, `sslvpn.bart.gov`, `sslvpn2.bart.gov`, `vpn.bart.gov` -- VPN endpoints

**Operational systems:**
- `afceweb-pri.bart.gov`, `afcweb.bart.gov`, `afcweb-bak.bart.gov` -- Automated Fare Collection (primary/backup pair)
- `mcs-gui-pri.bart.gov`, `mcs-gui.bart.gov` -- Master Control System GUI (primary pair)
- `tsiweb.bart.gov` -- Train Status Information
- `cctv.bart.gov`, `www.cctv.bart.gov` -- CCTV system (not publicly accessible)

**Security and monitoring:**
- `rapid7.bart.gov` -- Rapid7 security scanning infrastructure
- `fortiems.bart.gov`, `fortinet.bart.gov` -- Fortinet security appliances
- `shakecast.bart.gov` -- USGS ShakeCast earthquake notification integration

**Other:**
- `parkingapi.bart.gov` -- Parking API (returns 403)
- `parkingadmin.bart.gov` -- Parking admin (no response)
- `analytics.bart.gov` -- Internal redirect
- `jobs.bart.gov` -- Job listings

The naming convention for `afcweb` (Automated Fare Collection), `mcs-gui` (Master Control System GUI), and `tsiweb` (Train Status Information) is derived from the certificate subjects directly. The primary/backup pairs (`-pri` suffix, `-bak` suffix) suggest high-availability configurations. None of these subdomains responded to public HTTP requests in testing, but their existence and naming are publicly logged.

## The 2023 Data Breach

A publicly accessible page at `/MyDataReview` acknowledges a January 6, 2023 security incident in which BART records were posted on the Dark Web. Per the disclosure:
- The breach did not include ridership databases or core financial information
- BART provided identity protection services to affected individuals

The page remains live and is indexed in BART's sitemap. During the investigation, both Facebook Pixel (`fbq.loaded=true`) and Trade Desk's pixel fired on `/MyDataReview` -- the breach notification page itself.

The robots.txt file disallows several schedule-related paths: `/quickplanner/schedule`, `/quickplanner/extended`, `/schedules/bylineresults`, `/schedules/bystationresults`. No sitemap URL is referenced in robots.txt, but a sitemapindex exists at `/sitemap.xml` with three pages. Page 1 alone contains 2,000 URLs. Notable sitemap entries beyond content: `/MyDataReview`, `/hotcar`, `/biohazard`, `/quieter`, and `/test-4mdYhU4J` -- the last of which appears to be a test content node that was published.

## Machine Briefing

**Access and auth:** The legacy API at api.bart.gov requires no session. Use the hardcoded public key `MW9S-E7SL-26DU-VV8V` for all requests. All endpoints return JSON with `&json=y`. CORS is wildcard -- fetch works from any origin. The dev chatbot at dev-chatai.bart.gov requires no authentication on any endpoint. The main site (www.bart.gov) has no auth-gated content from what was tested. Drupal login is disabled; auth routes through auth.bart.gov (Auth0).

**Open endpoints:**

```bash
# All 50 BART stations (name, abbr, lat/lng, address, county)
curl "https://api.bart.gov/api/stn.aspx?cmd=stns&key=MW9S-E7SL-26DU-VV8V&json=y"

# Real-time departures -- all stations
curl "https://api.bart.gov/api/etd.aspx?cmd=etd&orig=ALL&key=MW9S-E7SL-26DU-VV8V&json=y"

# Real-time departures -- single station (replace 12TH with any station abbreviation)
curl "https://api.bart.gov/api/etd.aspx?cmd=etd&orig=12TH&key=MW9S-E7SL-26DU-VV8V&json=y"

# Service advisories
curl "https://api.bart.gov/api/bsa.aspx?cmd=bsa&key=MW9S-E7SL-26DU-VV8V&json=y"

# Live train count
curl "https://api.bart.gov/api/bsa.aspx?cmd=count&key=MW9S-E7SL-26DU-VV8V&json=y"

# Elevator advisories
curl "https://api.bart.gov/api/bsa.aspx?cmd=elev&key=MW9S-E7SL-26DU-VV8V&json=y"

# Alert banner (Drupal endpoint, HTML fragment in JSON)
curl "https://www.bart.gov/schedules/advisories/heading"

# Real-time departure board for a station (HTML fragment)
curl "https://www.bart.gov/schedules/eta_schedule/12TH/platform/long"
```

```bash
# dev-chatai.bart.gov -- no auth required
# OpenAPI spec
curl "https://dev-chatai.bart.gov/openapi.json"

# Server health (detailed -- reveals DB status, memory)
curl "https://dev-chatai.bart.gov/health/detailed"

# Session context for any user/session ID
curl "https://dev-chatai.bart.gov/api/context/{user_id}/{session_id}"

# Amazon Polly queue stats
curl "https://dev-chatai.bart.gov/api/polly/stats"
```

**HAFAS trip planner (JSON-RPC POST):**
```
POST https://planner.bart.gov/gate/
Content-Type: application/json
Body: HAFAS JSON-RPC format with auth token kEwHkFUCIL500dym
HAFAS API version: 1.53, active schedule: 2026-03-28 to 2026-07-06
```

**Gotchas:**
- api.bart.gov station abbreviations are 4 characters (e.g., `12TH`, `EMBR`, `SFIA`). The full list is in the `/api/stn.aspx?cmd=stns` response.
- `orig=ALL` on the ETD endpoint returns all active stations in a single response -- large payload.
- The HAFAS gate endpoint requires correct JSON-RPC envelope format; malformed requests return a PARSE error.
- dev-chatai.bart.gov DynamoDB is currently misconfigured -- context data persists in memory only.
- www.bart.gov Varnish cache is aggressive (cache-control max-age 3600 observed); dynamic content like ETAs is served from Drupal's own backend, not Varnish-cached.
- No rate limits were observed on api.bart.gov during testing. The dev-chatai.bart.gov config sets `max_rps: 500` and `max_concurrent: 400` but these appear unenforced.
