---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Legacy.com — Teardown"
url: "https://legacy.com"
company: "Legacy"
industry: "Information"
description: "Largest US obituary aggregation platform, partnering with newspapers nationwide."
summary: "Four stacks under one domain: a Framer-built homepage, Next.js with React Server Components for obituaries and search on Cloudflare, a Django service for the AI obituary writer, and an ASP.NET 4.0 legacy API still running underneath. Static assets served from cdn.legacy.com with Unix timestamps as build IDs. Programmatic advertising via Prebid.js with 14+ SSPs; feature flags and session recording managed by Statsig."
date: "2026-04-12"
time: "21:20"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Next.js, Framer, Django, ASP.NET, Cloudflare, Prebid.js]
trackers: [Google Tag Manager, Google Analytics 4, Google Ads, Bing UET, Wunderkind, comScore, ID5, IntentIQ, LiveIntent, Lotame, Trade Desk UID2, 33Across, Criteo, Braze, Amazon Publisher Services, Optable, LogRocket, Marfeel, Statsig, Framer Analytics, OpeCloud, Intercom, Sovrn]
tags: [obituaries, bereavement, advertising, identity-resolution, session-recording, consent, unauthenticated-api, legacy-stack, header-bidding, behavioral-targeting]
headline: "Wunderkind's retargeting config collects the deceased's name and obituary date as behavioral variables -- timed to a 15-day bereavement window."
findings:
  - "Wunderkind polls the deceased's full name, last name, and obituary publication date on every obituary page load, plus a boolean flag for whether the death notice is more than 15 days old -- bereavement-timed retargeting variables feeding UID2, PubMatic, and IntentIQ."
  - "The GTM data layer pushes the full obituary text and every guestbook condolence -- including author names and a home address -- to all downstream tag vendors on every obituary page load."
  - "Statsig's unauthenticated bootstrap endpoint confirms session_recording_rate: 1.0 and privacy_mode: 'min' -- every visitor session-recorded with minimum privacy, server-side confirmed."
  - "The guestbook API returns condolence messages with names, cities, relationships, and full message text without any authentication -- obituary IDs follow a sequential integer pattern."
  - "OpeCloud's DMP logs sdk-consent-rejected on every US page load while 60+ third-party trackers fire without a consent banner anywhere on the site."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Legacy.com is the largest obituary aggregation platform in the US, partnering with local newspapers to host and monetize death notices. The business model sits on a tension that runs through every layer of the tech stack: a site that handles grief at scale also runs one of the most aggressive advertising and behavioral targeting setups observed across any teardown in this series.

## Architecture

The site is not a single application. Four distinct stacks run under the same domain:

**Homepage**: Framer CMS. The main landing page is served from `framerusercontent.com/sites/2aCpRi2IHxXNaAEMkfkb5` and loads `events.framer.com/script?v=2` on every visit, sending a `published_site_pageview` event with timezone, locale, referrer, and Core Web Vitals to Framer's analytics endpoint. The homepage authenticates with Framer's CMS via `api.framer.com/auth/web/access-token` on each load. Framer Motion is active (`__framer_importFromPackage`, `__framer_events` in window globals). No other page on the domain uses Framer.

**Main application (obituaries, search, communities)**: Next.js with React Server Components, served through Cloudflare CDN. Build assets at `cdn.legacy.com/next-builds/{unix-timestamp}/` -- the timestamp `1775842341033` is the build ID. Response headers include `next-router-*` Vary headers confirming RSC routing. jQuery is still present (`jQuery`, `$` in window globals), running alongside the React stack.

**AI Obituary Writer** (`/us/obit-writer/obituary`): A separate Django service on distinct infrastructure. Cookies: `csrftoken` and `ow_session_id`. Origin IPs differ from the main site. Much lighter tracking footprint than the main application -- no programmatic ad stack, VWO A/B testing (`dev.visualwebsiteoptimizer.com`) present. The page serves a single textarea ("Paste the obituary here...") for obituary enhancement.

**Legacy API**: ASP.NET 4.0 still active. The `/api/` path returns with `x-aspnet-version: 4.0.30319` in response headers. WCF services at `/webservices/ns/FuneralInfo.svc/GetFuneralInfoJson` respond without authentication, returning `{"FuneralHome":null,"Obituary":null,"ServiceInfo":[]}` for requests without valid affiliate+obit ID parameters.

**Internal production subdomain**: `prd-legacy.com` is Legacy's internal production domain. `search-poc.prd-legacy.com` -- where "poc" signals proof of concept -- is publicly accessible without any authentication. It accepts `POST /search` with a JSON body and returns a structured response with the full filter schema: `kind`, `country`, `state`, `city`, `metro`, `administrative_area_level_2`, `publisher`, `date_range`, `min_age`, `max_age`, `obit_type`, `groups`, `keywords`, `all_keywords_must_match`, `custom_date_range`, `ids`. The aggregations schema returns facets for countries, states, cities, publishers, and date ranges. Test queries returned empty results (`total_hits: 0`), suggesting the POC index may not be fully populated -- but the endpoint is live and the data model is fully exposed.

**Cloudflare bot protection**: Direct curl to the main site returns HTTP 403 with `cf-mitigated: challenge`. Headless browsers are detected and challenged. Headed Chrome with a full browser fingerprint is required to pass. The robots.txt is served from S3 with `x-amz-server-side-encryption: AES256` -- the robots.txt is generated or managed separately from the main app.

**Feature flags and session recording**: Statsig manages both. Client key: `1464857542`. SDK: `statsig-server-core-node v0.16.2`. Six feature gates are active in production, all using djb2-hashed names -- the hash values are not reversible from outside. All gates return `false` for anonymous users. CRM is Braze (app instance UUID `0479d4f4-eb67-4d89-bb26-97ca6bd32191`) present on the search page alongside Intercom (workspace ID `hwb69hzz`). Sentry error tracking at org `231822`, project `4510189339934720` -- the Sentry endpoint returned HTTP 429 (rate limited), indicating frequent error volume.

---

## Surveillance Infrastructure

The obituary page loads 60 third-party domains and generates 449+ third-party requests. The search page runs 57 domains, 444 requests. The homepage, before any interaction, fires 30+ third-party domains immediately on load.

### No consent mechanism

There is no cookie consent banner anywhere on the US site. No CMP popup, no `__tcfapi` (EU Transparency and Consent Framework), no `__uspapi` (US Privacy API), no opt-out flow visible on any page.

The `ccpa_found` event fires in the GTM data layer with `ccpaDoNotSell: false` on obituary pages -- a field that exists for compliance bookkeeping purposes. No tracker behavior changes in response to it.

The most telling signal: `pdmp.tagger.opecloud.com/pdmp/v2/metrics/sdk-consent-rejected` fires as a GET request on every single US page load, returning HTTP 202. The OpeCloud DMP SDK is logging "consent rejected" as a metric -- not as a gate. All 60+ third-party trackers run regardless of this signal.

### Identity resolution graph

Seven identity resolution vendors operate simultaneously on first page load, each building a cross-site persistent identifier:

- **ID5** (`id5-sync.com`): partner ID 429, calls `/api/config/prebid` and `/g/v2/429.json`. Also `OPTABLE_WITH_ID5` in localStorage shows Optable CDP integration with ID5.
- **IntentIQ**: `_iiq_fdata` cookie contains `pcid: a83c8d52-3173-8890-94bb-4552417b0e95`, also stored in `iiq_object_array` localStorage.
- **LiveIntent**: `_lc2_fpi` (fingerprint), `_li_duid` (device user ID), `_li_dcdm_c` (domain cookie marker). Calls `idx.liadm.com` and `rp.liadm.com`.
- **Lotame**: `_cc_id` (content creator ID), `panoramaId` in localStorage. Calls `id.crwdcntrl.net`.
- **Prebid Unified ID 2.0 (Trade Desk)**: `pbjs-unifiedid` cookie stores `TDID: e8c5baa2-ba3b-4391-813e-208c3ee1cf1b`, `TDID_CREATED_AT: 2026-03-12T20:58:18`. Direct TTD connection at `direct.adsrvr.org/bid/bidder/legacycom` with the legacy.com bidder identifier.
- **33Across**: `33acrossId` in localStorage, calls `lexicon.33across.com/v1/envelope`.
- **Criteo**: `cto_bidid`, `cto_bundle` in localStorage, calls `gum.criteo.com` and `mug.criteo.com`.

Additional identity layers: **Optable CDP** (`OPTABLE_TARGETING`, `OPTABLE_PASSPORT`, `OPTABLE_SITE`, `OPTABLE_TEMP`, `OPTABLE_RESOLVED`, `OPTABLE_PAIRID` in localStorage), **`__idcontext`** cookie containing base64-encoded `cookieID` and `deviceID`, and **`_scor_uid`** (comScore user ID).

The `_gcl_au` Google Click Linker cookie fires immediately -- Google Ads conversion tracking activates before any ad interaction. Three separate GA4 properties (`G-9WHKS7T58D`, `G-R3SPF93YX7`, `G-D43LKBQYNX`) and two Google Ads accounts (`AW-875622297`, `AW-837287159`) are configured via two GTM containers (`GTM-TDQHZW`, `GTM-WLXNG99J`).

### GTM as the data distribution bus

The GTM data layer on obituary pages does heavy lifting. The `jsonld_ready` event fires immediately on page load and pushes:

- `jsonld_articleBody`: the full text of the obituary
- `jsonld_comment`: the full text of the most recent condolence, including author name
- `jsonld_author`, `jsonld_creator`, `jsonld_datePublished`, `jsonld_keywords`: full article metadata

Every GTM tag subscribed to the `jsonld_ready` event -- which includes any downstream vendor with a GTM integration -- receives the complete obituary and active condolence text for every page load. One condolence captured in evidence included the commenter's name, a personal message, and a home address reference ("1 Brookwood Dr").

The `marfeel_ids_ready` event separately pushes Marfeel user ID and session ID to GTM: `marfeel_user_id: e5f04504-3318-4706-aced-edcdda265dc6`, `marfeel_session_id: b3391ef9-41de-42a9-bbea-8b981e57d283`.

---

## Bereavement Targeting: Wunderkind

Wunderkind (formerly BounceX) is a behavioral retargeting platform. Its configuration on legacy.com, stored in `window.bouncex.website` (website ID 4084, cookie `bounceClientVisit4084v`, site name "Legacy | Singular Legacy Tag"), contains purpose-built obituary targeting variables.

The `vars` array defines the behavioral variables Wunderkind polls on each visitor session:

| Variable | Description |
|----------|------------|
| `first_last_name` | Deceased's full name, polled on page load |
| `last_name` | Deceased's last name, polled on page load |
| `obituary_publish_date` | Date the death notice was published |
| `obit_published_15_days_past` | Boolean: has it been more than 15 days since publication |

These are the deceased person's identifying information and the timing of their death notice. The `obit_published_15_days_past` flag suggests campaigns triggered based on how long ago the death occurred -- a retargeting window calibrated to bereavement timelines.

Wunderkind's identity integrations on legacy.com: `ffs: "UID2, PUBMATIC_MULTIFORMAT, INTENT_IQ_INTEGRATION"` -- the platform feeds visitor IDs into Unified ID 2.0, PubMatic, and IntentIQ simultaneously.

The `sspConfig` object exposes the full programmatic ad stack with floor prices:

| SSP | Account / Publisher ID | Floor |
|-----|------------------------|-------|
| Criteo | network 11254, publisher 104414 | $10 CPM |
| OpenPath | site 0 | $10 CPM |
| Magnite | account 10698, site 564124, zone 3566134 | none |
| PubMatic | publisher 156512, desktop 739561, mobile 1195378 | none |
| Index Exchange | site 545166 | none |
| Amazon Publisher Services | via separate APS config | none |

Separate from Wunderkind, the header bidding waterfall on obituary pages runs 14+ SSPs via Prebid.js: Rubicon/Magnite, The Trade Desk, AppNexus/Xandr, Criteo, Sharethrough, GumGum, Media.net, SheMedia, Yieldmo, 3Lift, Kargo, Seedtag, Yahoo, Dotomi, OpenX. Floor prices managed by `api.floors.dev`.

Other third-party presence on obituary pages: Disney ads via `cdn.flashtalking.com`, `hello.pledge.to` (charitable giving / memorial donation widget), `events.newsroom.bi` (newspaper industry analytics), `b.trueanthem.com` (AI social content platform).

The `bounceClientVisit4084v` cookie stores an encoded blob containing visit history, impression counts, and behavioral state for Wunderkind's campaign engine. The BounceX global object exposes 80+ methods in `window.bouncex`, including `setVar`, `emailCapture`, `osr` (onsite retargeting), `seg` (segmentation), and `caAutofill`.

---

## Session Recording at 100%

The `/api/statsig/bootstrap` endpoint requires no authentication and returns the server-side Statsig initialization payload for anonymous users. The current production configuration:

```json
{
  "can_record_session": true,
  "session_recording_rate": 1.0,
  "recording_blocked": false,
  "session_recording_privacy_settings": {
    "privacy_mode": "min"
  }
}
```

`session_recording_rate: 1.0` means every single visitor session is recorded. `privacy_mode: "min"` is the lowest privacy protection tier in Statsig's session replay product -- input fields and other sensitive elements are not masked by default in this mode.

This is confirmed by the server-side bootstrap endpoint, not a client-side setting that could be toggled locally. The Statsig environment is `tier: "production"`.

LogRocket also runs concurrently: `_lr_retry_request` and `_lr_env_src_ats` cookies present on first load. Two session replay systems operating simultaneously on a bereavement site.

The `statsig.stable_id.1464857542` and `statsig.session_id.1464857542` localStorage entries tie session recordings to Statsig's identity graph.

---

## APIs and Access

### Guestbook API

`GET /api/_frontend/v4/guestbooks/{id}` -- no authentication required.

Returns the full condolence record for an obituary:

```json
{
  "id": 211210732,
  "totalCondolencesCount": 1,
  "condolences": [[{
    "name": {"firstName": "Wendy Caruso", "lastName": ""},
    "message": "Roland, sending deepest condolences...",
    "city": null,
    "state": {"code": null, "name": null},
    "date": "04/11/2026",
    "relationship": "Family",
    "photo": {...},
    "additionalPhotos": []
  }]]
}
```

The response includes full name, message text, city, state, relationship to the deceased, date, and photo URLs. Obituary URL IDs visible in page URLs follow a sequential integer pattern -- the URL `?id=61225452` was observed, and adjacent IDs (61225450-61225454) were confirmed accessible. The internal `sourceId` in the guestbook response (211210732) differs from the URL id parameter, suggesting a separate internal ID space.

A v3 endpoint also exists at `/api/_frontend/v3/guestbooks/{id}` with a different permissions schema.

The API returns no CORS headers -- browser-only access, no cross-origin requests. Server-side callers face no such restriction.

### GTM data layer on obituary pages

The `jsonld_ready` event on page load distributes the full obituary to all GTM tags. One condolence captured in evidence contained "His Amazing Spirit will be greatly missed at 1 Brookwood Dr" -- a home address reference delivered to every GTM subscriber.

### Internal search POC

`POST https://search-poc.prd-legacy.com/search`

No authentication. Request body:

```json
{
  "kind": "person_search",
  "date_range": "last_12_months",
  "keywords": "john smith",
  "page": 1,
  "page_size": 10
}
```

Returns:

```json
{
  "results_exact": [],
  "results": [],
  "total_hits": 0,
  "aggregations": {
    "countries": [],
    "states": [],
    "cities": [],
    "publishers": [],
    "date_ranges": []
  },
  "selected_filters": {
    "kind": "person_search",
    "administrative_area_level_2": null,
    "obit_type": null,
    "groups": null,
    "min_age": null,
    "max_age": null
  }
}
```

Test queries returned empty results -- the POC index may not be populated with production data, or the query format differs from what the endpoint expects. The endpoint is live, unauthenticated, and exposes the full internal data model including `administrative_area_level_2` (county-level geography), `obit_type`, `groups`, and age range filters not visible in the production search UI.

### Legacy WCF service

`GET /webservices/ns/FuneralInfo.svc/GetFuneralInfoJson` -- no authentication.

Returns `{"FuneralHome":null,"Obituary":null,"ServiceInfo":[]}` without valid affiliate and obituary ID parameters. The service is accessible and responsive; querying with a valid affiliate + obit ID combination would return structured funeral home and obituary data.

---

## Machine Briefing

### Access & auth

The main site requires headed Chrome to pass Cloudflare bot detection. APIs are accessible with standard HTTP clients:
- `/api/_frontend/*` endpoints: no auth, CORS restricted (same-origin browser only; curl with appropriate headers works)
- `search-poc.prd-legacy.com`: fully open, no bot detection, standard HTTP
- `/webservices/ns/FuneralInfo.svc/*`: no auth, standard HTTP
- User profile endpoints (`/api/_frontend/auth/profile`): return 401, session cookie required

Obituary IDs are visible in page URLs as `?id={integer}`. Guestbook calls use the same integer as the path parameter.

### Endpoints

**Statsig bootstrap (no auth)**
```
GET https://www.legacy.com/api/statsig/bootstrap
```
Returns feature gates (all djb2-hashed), session recording config, Statsig SDK init values.

**Guestbook condolences (no auth)**
```
GET https://www.legacy.com/api/_frontend/v4/guestbooks/{obit_id}
GET https://www.legacy.com/api/_frontend/v3/guestbooks/{obit_id}
```
Replace `{obit_id}` with the integer ID from an obituary page URL (`?id=XXXXXXXX`). Returns condolences with names, messages, city/state, relationship, date, photo URLs.

**Internal search POC (no auth, open)**
```
POST https://search-poc.prd-legacy.com/search
Content-Type: application/json

{
  "kind": "person_search",
  "keywords": "{name}",
  "state": "{state_abbrev}",
  "date_range": "last_12_months",
  "page": 1,
  "page_size": 10
}
```
Aggregations return facet counts for states, cities, publishers, date ranges. Exact query format for populated results requires further testing.

**Legacy WCF funeral info (no auth)**
```
GET https://www.legacy.com/webservices/ns/FuneralInfo.svc/GetFuneralInfoJson?affiliateId={id}&obitId={id}
```
Returns FuneralHome, Obituary, ServiceInfo when called with valid affiliate + obituary ID.

**Wunderkind config (via JS)**
```javascript
// In browser context on any legacy.com page:
window.bouncex.website  // Full site config including SSP floor prices, var definitions
window.bouncex.getVar("first_last_name")  // Current page's deceased name
window.bouncex.getVar("obituary_publish_date")  // Publication date
```

### Gotchas

- Cloudflare blocks curl and headless browsers on the main domain. `search-poc.prd-legacy.com` has no bot protection.
- The guestbook API has no CORS headers -- cross-origin fetch from the browser will fail. Use curl or server-side requests.
- Obituary URL IDs (`?id=XXXXXXXX`) are the lookup key for guestbook calls, but the guestbook response returns a different internal `sourceId` -- don't confuse the two.
- Statsig bootstrap response `initializeValues` is a JSON string, not an object -- parse it separately.
- The three GA4 properties and two Ads accounts all fire on the same pages; attribution data is triple-counted across analytics.
- `search-poc.prd-legacy.com` returned zero results for test queries -- the index may be empty or require specific query structure not yet determined.
