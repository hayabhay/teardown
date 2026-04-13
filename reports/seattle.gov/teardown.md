---
# agents: machine-friendly instructions in "## Machine Briefing"
title: City of Seattle — Teardown
url: "https://www.seattle.gov"
company: City of Seattle
industry: Government
description: "Official website of the City of Seattle, Washington state government portal."
summary: "Seattle.gov runs on Microsoft IIS 10.0 with ASP.NET 4.0 and a custom CMS called IGX, fronted by CloudFront, with Vue.js components on every page. Nine active subdomains span seven distinct stacks: IIS/ASP.NET for the main domain, five WordPress instances on WP Engine for department blogs, Angular for the utilities portal, Node/React for SSO, KUBRA SaaS for billing, Socrata for open data, and a Motorola Solutions CWI deployment for citizen 311 intake."
date: 2026-04-06
time: "22:04"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack:
  - ASP.NET
  - IIS
  - Vue.js
  - CloudFront
  - Angular
  - WordPress
  - Node.js
  - IGX CMS
  - KUBRA
  - Socrata
  - Oracle Identity Cloud
trackers:
  - Google Analytics
  - Google Tag Manager
  - SiteImprove
  - Pingdom RUM
  - Twitter Syndication
  - Google Translate
  - Trumba
  - GovDelivery
tags:
  - government
  - surveillance
  - api-exposure
  - wordpress
  - no-consent
  - internal-artifacts
  - vendor-cms
  - fragmented-infrastructure
headline: "Anyone can burn real Seattle 311 service request numbers by hitting a single unauthenticated Motorola API endpoint."
findings:
  - "Motorola CWI /api/sr/nextnum/{type} requires no authentication and burns real production 311 service request numbers on each call — a script could exhaust the city's numbering sequence or create gaps that complicate real complaint tracking"
  - "The same Motorola CWI API exposes 26 internal GIS layers unauthenticated, including police beat boundaries, encampment emphasis areas, and a dev layer from 2014 — mapping the city's enforcement and social-services geography for anyone who asks"
  - "Every visitor's search terms (\"find my ticket,\" \"report abandoned vehicle\") are sent verbatim to three separate Google Analytics properties, SiteImprove, and Pingdom with no consent prompt — residents searching for city services are tracked before they click anything"
  - "login.seattle.gov hardcodes an internal dev server hostname (itdlsso100:3000) in every CORS response, leaking city IT network topology from the production single sign-on portal"
  - "council.seattle.gov WordPress REST API returns 10 staff records unauthenticated, including user IDs, profile URLs, and Gravatar hashes — default WordPress exposure on a government domain"
---

## Architecture

Seattle.gov is not a single site — it's a loose confederation of government technology decisions made at different times by different departments. The main domain runs on **Microsoft IIS 10.0** with **ASP.NET 4.0.30319** and **ASP.NET MVC 5.3**, served through CloudFront (CDN edge: SFO53-P7). The SSL certificate covers `seattle.gov`, `www.seattle.gov`, `adc.seattle.gov`, and `www.adc.seattle.gov` under an Amazon RSA 2048 cert.

The CMS is **IGX** — a custom or enterprise product whose name surfaces in `robots.txt` (`# robots.txt for igx now at http://www.seattle.gov/`). Content is organized around numeric XIDs (`pageXID`, `topNavXID`) exposed as JavaScript variables on every page. The homepage is `x33`; the top navigation component is `x61449`. That 61k+ gap in sequential IDs suggests the system has allocated roughly 60,000+ content objects over its lifetime.

Vue.js components load from a `cms_resources/pe/` path — the `sea-global.js` bundle (200KB minified) contains the site's Vue infrastructure including a reference to `https://data.seattle.gov/resource/${e.dsgid}.json` (Socrata SODA API pattern for dynamic widgets). The `pe/` module loads on every page regardless of the `PE_FF` flag state (see Feature Flags section).

### Subdomain Stack Map

| Subdomain | Stack | Function |
|-----------|-------|----------|
| `www.seattle.gov` | IIS / ASP.NET / IGX CMS | Main city portal |
| `data.seattle.gov` | Socrata (nginx + Rails) | Open data — 301 public datasets |
| `council.seattle.gov` | WordPress + WP Engine + Cloudflare | City Council blog |
| `parkways.seattle.gov` | WordPress + WP Engine + Cloudflare | Parks dept |
| `fireline.seattle.gov` | WordPress + WP Engine + Cloudflare | Fire dept |
| `consultants.seattle.gov` | WordPress + WP Engine + Cloudflare | Procurement/consulting |
| `atyourservice.seattle.gov` | WordPress + WP Engine + Cloudflare | Employee HR portal |
| `myutilities.seattle.gov` | Angular + CloudFront | Utility account portal |
| `login.seattle.gov` | Node.js / Express + React | City SSO |
| `utilities-self-service.ebill.seattle.gov` | KUBRA SaaS + Imperva WAF | Bill payment |

`adc.seattle.gov` is included in the SSL certificate SAN list but returns a connection error — DNS resolves, nothing responds.

### Feature Flags

Every page of the main site bakes feature flags into the `<html>` element's `class` attribute and as JavaScript variables in the page source:

```html
<html class="GlobalMegaMenu_FF LeftNavVue_FF TopNavVueJS_FF Tabs2021_FF RssCard_FF
  OfficialBanner_FF GlobalFooterSocialMedia_FF PhotoGallery_FF JWPlayerUrlSigning_FF
  PE_Prod_FF DisableCoreER_FF useSiteImprove_FF enableFaStylePackage_FF
  boardCommissionHomeColorBlockAndBanner_FF">
```

JavaScript variables for the same flags:

```js
var GlobalMegaMenu_FF = true;
var JWPlayerUrlSigning_FF = true;
var PE_FF = false;
var PE_QA_FF = false;
var PE_Prod_FF = true;
var DisableCoreER_FF = true;
var useBugHerd_FF = false;
var useSiteImprove_FF = true;
var QaBannerOn_FF = false;
var enableFaStylePackage_FF = true;
```

The `PE_FF = false` / `PE_Prod_FF = true` combination is notable. The `pe/` path in `cms_resources/pe/sea-global.js` loads unconditionally — the Vue bundle ships to every visitor — but whatever behavior `PE_FF` gates remains dark. `PE_Prod_FF = true` indicates production infrastructure for this module is active. The exact meaning of "PE" (likely a CMS authoring or publishing module given the path) is not confirmed in evidence, but the structural observation is clear: prod infrastructure ready, feature gated.

`useBugHerd_FF = false` means BugHerd (a client feedback/annotation tool) is configured but disabled. `JWPlayerUrlSigning_FF = true` enables signed JWPlayer URLs with HMAC signatures regenerated per page load using library key `Ctujouh4`.

---

## Motorola CWI — Unauthenticated API Surface

Seattle's 311 citizen service request intake runs through **Motorola Solutions CWI (Citizen Web Intake)** at `https://seattle-cwiprod.motorolasolutions.com/cwi/`. It's linked directly from the main seattle.gov homepage for services like abandoned vehicle reports (`/cwi/direct/ABANDVEH`). The application is an Angular + ESRI ArcGIS app protected at the UI layer by Imperva WAF (cookies: `visid_incap_2183769`, `nlbi_2183769`, `incap_ses_`). The backing API has no authentication.

### `/api/sr/nextnum/{type}` — Allocates Real 311 Numbers

The endpoint allocates the next sequential service request number in Seattle's 311 system without any authentication:

```
GET https://seattle-cwiprod.motorolasolutions.com/cwi/api/sr/nextnum/ABANDVEH
```

Returns:
```json
{"srNumber":"26-XXXXXXXX","version":"{hash}","referenceNumber":"{timestamp}"}
```

Three calls during investigation returned sequential production numbers: `26-00091515`, `26-00091516`, `26-00091520`. The gap between 516 and 520 indicates concurrent usage from other sources. The `/api/cache/config` endpoint corroborates — it returns the current sync state including `status_state_prc_num_index: "26-00091503"` (the 311 counter at that call's timestamp), along with a MongoDB internal `_id` (`601767b5e333c700129abe22`) and real-time sync timestamps:

```json
{
  "cacheSettings": {
    "_id": "601767b5e333c700129abe22",
    "status_retention_days": 60,
    "status_batch_size": 500,
    "status_state_last_sync": "2026-04-06T21:59:00.849Z",
    "status_state_prc_num_index": "26-00091503",
    "status_state_last_updated_date": "2026-04-06T14:58:55.000Z"
  }
}
```

### `/api/esrilayers` — Internal GIS Layer Registry

Returns all 26 ArcGIS SDE (Spatial Database Engine) layers registered in the system, unauthenticated. The MongoDB document's `loadDate` is `2026-03-19T04:22:03.763Z`. Notable layers:

| ID | Layer Name | Type | What it is |
|----|------------|------|------------|
| 0 | `SDE.Unified_Care_Teams_Regions` | Polygon | Social services region boundaries |
| 1 | `SDE.ParkingEnforcementZones` | Polygon | Parking enforcement zone map |
| 4, 18 | `SDE.SPD_Precinct` | Polygon | Police precinct boundaries (listed twice) |
| 5 | `SDE.CARTO_Encamp_Emphasis_Areas` | Polygon | Encampment emphasis area map |
| 10 | `SDE.CTYPROP_RPAMIS_PMA_JOIN` | Polygon | City property database join |
| 16 | `SDE.CPNDAP_fix_frm_DEV_20140703` | Point | Dev layer created 2014-07-03, still in production |
| 17 | `SDE.SPD_spdbeat` | Polygon | SPD police beat boundaries |
| 22 | `SDE.SFD_sfdinsp` | Polygon | Fire department inspection zones |
| 23 | `SDE.SCL_CRM_SCL_Boundary` | Polygon | Seattle City Light territory boundary |
| 24 | `SDE.SCL_CRM_POLESNN` | Point | City Light electric pole locations |
| 25 | `SDE.SFD_firecode` | Polygon | Fire code zones |

`SDE.CPNDAP_fix_frm_DEV_20140703` has `DEV` in its name and a July 2014 date stamp embedded in the layer name — a development-phase layer that was never removed from production configuration.

### `/api/search` — Error Response Leaks Internal Server

`POST https://seattle-cwiprod.motorolasolutions.com/cwi/api/search` with no body returns HTTP 500 with an error payload containing the internal knowledge base server URL and full request parameters:

```json
{
  "success": false,
  "message": "...'search.controller (error)', Request failed with status code 500\n
    - url: http://311-hubapp3.motorolasolutions.com/kbsearch/kbs/searchWithPaging/seat-prod?output=json&beta=true\n
    - payload: {\"kb_search\": {\"jurisdiction_codes\": [\"CITYSEAT\"], \"category_codes\": [\"EXTRNSRC\", \"FAQ\"], \"user_id\": 2, \"sort_by\": \"relevance\", \"anonymous\": \"true\"}}"
}
```

This reveals: internal hostname `311-hubapp3.motorolasolutions.com` on HTTP (unencrypted, internal network); production jurisdiction identifiers `seat-prod` and `CITYSEAT`; anonymous requests use hardcoded `user_id: 2`.

### `/api/srdef/{type}` — Full Service Request Schema

`GET /api/srdef/ABANDVEH/ABANDVEH` returns the complete service request definition including internal department codes, workflow IDs, and geo area SDE layer references:

- Department code: `SEAPOLDE` (Seattle Police Department)
- Group code: `SPDPAREN` (SPD Parking Enforcement)
- SLA: 14 days
- Default intake channel: `PHONE` (phone is the assumed primary channel, not web)
- Geo areas cross-referencing SDE layers: `SDE.CENSUS_GEO2000_TRACT00`, `SDE.CRA`, `SDE.CITYPLAN_COUNCIL_DISTRICTS`, `SDE.PARKINGENFORCEMENTZONES`, `SDE.SPD_PRECINCT`, `SDE.CADASTRAL_LEGAL`

The Motorola CWI Angular bundle also contains 69 internal `/api/` path references and HTML developer comments left in production: `<!-- TODO: why did I add this dot -->` and `<!-- testing, jma-->`.

---

## IGX Content API

The IGX CMS exposes a content API on the main domain that requires no authentication:

```
GET https://www.seattle.gov/api/content/{xid}/elements/{element-names}
```

`{element-names}` is a comma-separated list of element types to return. Observed calls:

```
GET /api/content/x121473/elements/LanguagesList,Page,DisclaimerLanguageExcerpts
GET /api/content/x61449/elements/navigation/
GET /api/content/x121475/elements/SitewideMegaMenuItems/
GET /api/content/x68110/elements/DeptGoogleSearchCode
```

The `SitewideMegaMenuItems` response from `x121475` returns the full mega-menu navigation tree as structured XML-in-JSON, including all category names, subcategory links, and display metadata. The response includes `IGX_Categories` and `LingualMaps` child elements alongside category content.

XIDs are sequential integers prefixed with `x`. The gap between `x33` (homepage) and `x61449` (top nav component) suggests the system has allocated 61,000+ content identifiers. The API does not enumerate — bare `/elements/` without element names returns 404. Confirmed working element names: `navigation`, `Page`, `SitewideMegaMenuItems`, `LanguagesList`, `DisclaimerLanguageExcerpts`, `DeptGoogleSearchCode`.

---

## Infrastructure Artifacts

### login.seattle.gov CORS

Every response from `login.seattle.gov` includes a static CORS header:

```
Access-Control-Allow-Origin: http://itdlsso100:3000
Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, PATCH, DELETE
Access-Control-Allow-Headers: X-Requested-With,content-type
X-Powered-By: Express
```

`itdlsso100` is an internal hostname consistent with Seattle IT Department lab naming (`ITDL`). Port 3000 is Node.js/Express default. This is a static configuration value — set during development and not updated for production deployment. The header does not grant arbitrary cross-origin access (it only matches requests from that specific internal host), but it confirms an internal dev server was pointed directly at production SSO and the config was never cleaned up. The SSO server's HTML `Last-Modified` is `Mon, 23 Feb 2026 18:31:29 GMT`.

The city SSO routes exposed: `/login`, `/authenticate`, `/registration`, `/forgot-username`, `/logout`, `/password-reset`, `/activation`, `/reactivation`, `/profile`.

### Non-Prod URLs in Production Bundle

The `myutilities.seattle.gov` Angular bundle (`main.b968b286f415e34b1ed4.js`, 8MB) contains hardcoded URLs for non-production environments:
- `https://uatutilities-self-service.seattle.gov/` (UAT environment) — `/rest/auth/ssologin`
- `https://trgutilities-self-service.seattle.gov/` (training environment) — `/rest/auth/ssologin`

Both subdomains resolve via DNS but return blocked responses. A KUBRA test page URL also appears in the login bundle: `https://utilities-self-service.ebill.seattle.gov/SeattleUtilities/testpages/ssologin.aspx`.

### robots.txt — Staff Names and Legacy Paths

The `robots.txt` file includes personal names of city staff in inline comments:

```
Disallow: /light/accounts/assistance/ # exclude per Nate... infinite loops spiders
Disallow: /light/includes/ # exclude per Dana
Disallow: /light/news/doc/ # exclude per Dana
Disallow: /mayor/special_docs/ # old per Nate
Disallow: /personnel/includes/ # exclude test directory for printing files
```

Retired and legacy system paths surfaced: `/dpd/` (Department of Planning and Development, merged into SDCI), multiple `/light/` paths (old Seattle City Light portal), `/vision2000/` (retired), `/personnel/includes/` (HR system), `/util/warp/` (SPU internal). The opening comment names the CMS: `# robots.txt for igx now at http://www.seattle.gov/`.

### GIS Dev Layer from 2014

`SDE.CPNDAP_fix_frm_DEV_20140703` (layer ID 16 in the esrilayers response) is a point geometry layer with `DEV` in its name and a July 3, 2014 creation date embedded in the layer name itself. It appears in the production Motorola CWI GIS layer registry as of the March 2026 cache refresh date in the evidence.

---

## Surveillance Without Consent

Seattle's main site has no Consent Management Platform. No OneTrust, Cookiebot, Didomi, or equivalent consent gate was observed. The city has a published Privacy Program page but no technical enforcement on the main domain. On first load, before any user interaction:

**Cookies set immediately:**
- `_gcl_au` — Google Consent/Ads Linking token
- `_ga` — Google Analytics base cookie (`GA1.1.1432502559.1775512288`)
- `_ga_PX2J5D97BX` — GA4 property 1 (measurement ID `G-PX2J5D97BX`)
- `_ga_SP4LY710EY` — GA4 property 2 (measurement ID `G-SP4LY710EY`)
- `_ga_CGFRM1LP6G` — GA4 property 3 (measurement ID `G-CGFRM1LP6G`)
- `nmstat` — SiteImprove persistent visitor ID (example: `67ba2389-942d-6516-9837-26348d5e53f9`)

**`localStorage` written immediately:**
- `_gcl_ls` — Google Click Linker state with creation timestamp and timeout tracking

All three GA4 properties fire in parallel via `GTM-PXQBQ2`. The three-property configuration sends identical events to all three measurement IDs with the same client ID — data triplicated across three properties. Google Consent Mode is active (`gcd=13l3l3l3l1l1`) but configured with `npa=0`, meaning no personalization restrictions are applied.

**Search terms in GA4 payloads:** GA4 `collect` calls include the full URL in the `dl=` parameter. On search result pages: `dl=https://www.seattle.gov/searchresults?searchTerm=police+department` — the search query is transmitted verbatim to all three GA4 properties and both Google CCM endpoints.

**Additional trackers on main pages:**

- **SiteImprove** (account `15203573`): loads via `cms_resources/js/siteimprove_analytics.js`, fetching `siteanalyze_15203573.js` from `siteimproveanalytics.com`. Sets persistent `nmstat` ID.
- **Pingdom RUM**: beacon ID `54d39fd1abe53d404a5d1d56`, fires on every page via `rum-collector-2.pingdom.net/img/beacon.gif`. Captures page load timing and browser metrics.
- **Twitter/X syndication**: `syndication.twitter.com/settings` fires on pages with no visible Twitter content — observed on search results, police department page, and finance pages.
- **Google Translate**: `translate.googleapis.com/element/log` fires on page load on search results without any language selection action by user.
- **Trumba**: `www.trumba.com/s.aspx` fires on event calendar pages (8 requests per page load in network trace).
- **GovDelivery/Granicus**: newsletter subscribe links at `public.govdelivery.com/accounts/WASEATTLE/subscriber/new`; bulletin links at `content.govdelivery.com/accounts/WASEATTLE/bulletins/{id}`.

**Public search query log:** `https://www.seattle.gov/assets/prebuilt/js/search/topQueries.json` is publicly accessible and contains 9,999 logged search queries with hit counts. Top terms:

| Query | Hits |
|-------|------|
| search for records | 3,134 |
| citation search | 2,278 |
| seattle police | 812 |
| find my ticket | 452 |
| jobs | 448 |
| employee directory | 185 |
| staff directory | 172 |
| report abandoned vehicle | 152 |

"Employee directory" and "staff directory" appear in the top 20 despite the directory being excluded from the site (`Disallow: /directory/` in robots.txt).

**Utilities portal (myutilities.seattle.gov):** Still runs **Universal Analytics UA-33712689-6** — the legacy Google Analytics property deprecated by Google in July 2023. No GA4 property observed on the utilities portal. Acquire.io (account `a-f4416`) with co-browse capability is integrated — support agents can view a customer's screen during utility account sessions via `custom_cobrowse_code`.

**SeattleChannel.org:** Shares the main site's GTM container (`GTM-PXQBQ2`) and JWPlayer library key (`Ctujouh4`), plus adds its own GTM container `GTM-MDVB333`. Still runs Universal Analytics `UA-22358727-1`.

---

## WordPress Subdomain Footprint

Five `seattle.gov` subdomains run WordPress on WP Engine with Cloudflare: `council`, `parkways`, `fireline`, `consultants`, and `atyourservice`. All share the same hosting stack.

The WordPress REST API (`/wp-json/wp/v2/users`) is enabled on two:

**council.seattle.gov** returns 10 user records unauthenticated. Sample record:
```json
{
  "id": 53,
  "name": "Adam Ziemkowski",
  "url": "http://sawant.seattle.gov",
  "slug": "adam-ziemkowski",
  "link": "https://council.seattle.gov/author/adam-ziemkowski/",
  "avatar_urls": {
    "96": "https://secure.gravatar.com/avatar/acb466e96250796df3ada89d53498c901fe7e7868a305a667e80428e467ee69a?s=96&d=mm&r=g"
  }
}
```

The `url` field contains `http://sawant.seattle.gov` — a subdomain pointing to a former council member's office site. Staff returned include elected council members (Bob Kettle, Alex Pedersen, Cathy Moore) and administrative staff (City Clerk, Central Staff, Brad Harwood). The slug `cathy-more` for Cathy Moore appears to be a data entry error.

**consultants.seattle.gov** returns 8 user records unauthenticated.

`parkways.seattle.gov` and `fireline.seattle.gov` have the REST API user endpoint disabled.

Yoast SEO v20.13 is active on council.seattle.gov, generating full JSON-LD schema markup for every author profile page. Profile pages include full OG tags, canonical URLs, and BreadcrumbList schema.

---

## Utilities Stack

`myutilities.seattle.gov` is an Angular SPA delivered via CloudFront that proxies to an `eportal` backend. The 8MB main bundle (`main.b968b286f415e34b1ed4.js`) reveals the full dependency tree:

- **Authentication**: Oracle Identity Cloud Service — `idcs-3359adb31e35415e8c1729c5c8098c6d.identity.oraclecloud.com`
- **Bill payment**: KUBRA SaaS at `utilities-self-service.ebill.seattle.gov`
- **Payment processing**: Stripe (found in bundle)
- **Energy usage widget**: Oracle OPower at `scl.opower.com`
- **Data visualization**: FusionCharts
- **Customer support**: Acquire.io co-browse (account `a-f4416`)
- **Analytics**: Universal Analytics `UA-33712689-6` (legacy, no GA4 observed)
- **Non-prod environments hardcoded**: UAT (`uatutilities-self-service.seattle.gov`) and training (`trgutilities-self-service.seattle.gov`)

KUBRA (`utilities-self-service.ebill.seattle.gov`) sets `BNI_KUBRA_Secure8` as a load balancer affinity cookie and includes `P3P: CP="ALL DSP COR CUR OUR STP UNI STA"` — a vestigial IE6-era privacy header ignored by modern browsers.

---

## Machine Briefing

### Access and Auth

The main site (www.seattle.gov), the IGX content API, and the Motorola CWI API are all fully open — no session, no headers, no auth tokens required. Motorola CWI is behind Imperva WAF at the UI layer, but API endpoints carry no auth checks. Socrata open data uses a standard SODA API with optional app tokens for higher rate limits; unauthenticated access works.

WordPress REST API endpoints on council.seattle.gov and consultants.seattle.gov are open, no tokens required.

### Endpoints

**IGX Content API (no auth)**
```
GET https://www.seattle.gov/api/content/{xid}/elements/{element-names}

# Confirmed working:
GET https://www.seattle.gov/api/content/x121475/elements/SitewideMegaMenuItems
GET https://www.seattle.gov/api/content/x61449/elements/navigation
GET https://www.seattle.gov/api/content/x121473/elements/LanguagesList,Page,DisclaimerLanguageExcerpts
GET https://www.seattle.gov/api/content/x33/elements/Page
GET https://www.seattle.gov/api/content/x68110/elements/DeptGoogleSearchCode
```

**Motorola CWI API (no auth)**
```
GET  https://seattle-cwiprod.motorolasolutions.com/cwi/api/cache/config
GET  https://seattle-cwiprod.motorolasolutions.com/cwi/api/esrilayers
GET  https://seattle-cwiprod.motorolasolutions.com/cwi/api/street/types
GET  https://seattle-cwiprod.motorolasolutions.com/cwi/api/street/suffixes
GET  https://seattle-cwiprod.motorolasolutions.com/cwi/api/srdef/ABANDVEH/ABANDVEH
GET  https://seattle-cwiprod.motorolasolutions.com/cwi/api/sr/nextnum/ABANDVEH
POST https://seattle-cwiprod.motorolasolutions.com/cwi/api/search
POST https://seattle-cwiprod.motorolasolutions.com/cwi/api/sr/save
```

**Socrata Open Data (unauthenticated, rate-limited)**
```
GET https://data.seattle.gov/resource/{dataset-id}.json
GET https://data.seattle.gov/resource/{dataset-id}.json?$limit=100&$offset=0
GET https://data.seattle.gov/api/catalog/v1?q={search}
```

**WordPress REST API (no auth)**
```
GET https://council.seattle.gov/wp-json/wp/v2/users
GET https://consultants.seattle.gov/wp-json/wp/v2/users
GET https://council.seattle.gov/wp-json/wp/v2/posts
```

**Public search query log**
```
GET https://www.seattle.gov/assets/prebuilt/js/search/topQueries.json
```

### Gotchas

- **`/api/sr/nextnum/`** — each call allocates a real sequential 311 production service request number. Do not call in a loop. Documented: three investigation calls consumed numbers 26-00091515 through 26-00091520.
- **IGX element names required** — bare `GET /api/content/{xid}/elements/` returns 404. Must specify at least one element name. Confirmed names: `navigation`, `Page`, `SitewideMegaMenuItems`, `LanguagesList`, `DisclaimerLanguageExcerpts`, `DeptGoogleSearchCode`.
- **XID discovery** — XIDs are sequential integers (`x33` through `x121475+` observed). No enumeration endpoint exists; valid XIDs must be discovered from page source or API responses.
- **Motorola POST /api/search** — currently returns HTTP 500 (knowledge base server `311-hubapp3.motorolasolutions.com` is unreachable), but the error body contains the internal URL and request schema, making it useful for topology mapping.
- **Socrata catalog** — use `https://data.seattle.gov/api/catalog/v1` to discover dataset IDs before querying resources. Dataset IDs are 9-character alphanumeric strings.
- **login.seattle.gov** — city SSO portal. Routes (`/login`, `/authenticate`, `/registration`, `/forgot-username`, `/logout`, `/password-reset`, `/activation`, `/reactivation`, `/profile`) require authenticated city accounts.
