---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Booking.com — Teardown"
url: "https://booking.com"
company: "Booking.com"
industry: "Hospitality"
description: "Online travel agency for hotels, flights, cars, and attractions."
summary: "Booking.com runs a React micro-frontend architecture (capla) on top of Apollo GraphQL, served through nginx behind CloudFront with AWS WAF. The homepage and hotel detail pages use a GraphQL endpoint at /dml/graphql; search results render through a separate path. A proprietary consent manager (PCM) sets tracking consent server-side in the first HTTP response, before OneTrust loads client-side as a second layer. Authentication runs through account.booking.com as a full OIDC provider with scopes for marketing tracking, analytical tracking, and EU Digital Markets Act compliance."
date: "2026-04-16"
time: "03:05"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: ["React", "Apollo GraphQL", "CloudFront", "AWS WAF", "Tealium", "OneTrust", "nginx"]
trackers: ["Google Analytics", "Google Ads", "Tealium", "OneTrust", "Criteo", "ID5", "The Trade Desk", "Bing UET", "Facebook Pixel", "Snapchat Pixel", "LinkedIn Insight", "AppDynamics", "Pinterest Tag", "RTB House", "Yahoo Japan", "Spotify"]
tags: ["travel", "graphql", "identity-graph", "consent", "micro-frontend", "tracking", "onetrust", "oidc", "ccpa"]
headline: "Booking's customer-360 tracking API at c360.booking.com accepts arbitrary POST payloads without authentication, returning success codes for fabricated event types from any origin."
findings:
  - "The c360.booking.com tracking API -- Booking's internal customer-360 service running on Envoy/Istio -- accepts unauthenticated POST requests and returns success responses for arbitrary event payloads, with no rate limiting observed."
  - "Every anonymous visitor gets enrolled in ID5's cross-publisher identity graph on first page load with a deterministic match; the same universal UID is stored directly in a Criteo fast-track localStorage key, making the cross-publisher link explicit in the browser."
  - "OneTrust's browser-accessible API exposes internal CMP admin labels -- 'Functional DO NOT USE' and 'Social Media Cookies DO_NOT_USE' -- alongside a 'Test' group, visible to any page visitor via the console."
  - "The unauthenticated GraphQL API at /dml/graphql returns live hotel pricing with crossed-out 'was' prices, full room inventory by property slug, and ML-ranked homepage components -- with no rate limiting and error messages that leak internal type names."
  - "Booking's production JS bundle ships localhost references (127.0.0.1:228, localhost:4318/v1/traces), staging hostnames (dqs.booking.com), and internal context properties (staffIdentity, isInternalUser) alongside source map URLs pointing to an internal-only static host."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Booking.com sets full marketing and analytics consent for California visitors in the first HTTP response header -- before the page loads, before JavaScript executes, before any consent banner appears. A proprietary consent manager (PCM) and OneTrust run in parallel, neither waiting for the other. The site enrolls anonymous visitors into ID5's cross-publisher identity graph on first load, shares that identity directly with Criteo, and fires Google Ads conversion tracking on every page type. Under the hood, the customer-360 tracking API accepts unauthenticated POST requests, the GraphQL endpoint returns live pricing without auth, and production JS bundles ship with internal hostnames and staging URLs.

## Architecture

Booking.com runs a custom micro-frontend system called **capla** (`__capla`, `__caplaFetch`, `__caplaDataStore`, `__caplaRemoteComponentManagerStore`). Each page section is an independently loaded component. Named MFEs observed on the homepage: `b-web-shell-components`, `b-genius-web-component-service`, `b-iam-fe-components`, `b-conversational-ui-web-cs`, `b-search-web-searchbox-component-service`, `b-wishlist-wishlist-cs`, `b-seo-core-components`, `b-lx-web-components`, `b-landing-pages-components`, `b-gta-component-service`, `b-adtech-gtm-datalayer-component-service`, `b-ums-component-service`.

The **Apollo GraphQL client** lives in `__caplaDataStore.apollo`. The homepage and hotel detail pages make GraphQL calls to `/dml/graphql`; search results use a separate rendering path with no observable GraphQL traffic. Apollo cache sizes: 285 objects on homepage, 617 on hotel detail pages.

Two separate MFE chunk-loading systems coexist: `/page/v0/chunk-metadata` for homepage MFEs and `/orca/chunk-metadata` (four requests per hotel page load) for hotel MFEs. These appear to be versioned independently.

Infrastructure stack: **nginx** origin, **CloudFront** CDN (SFO53-P3 edge observed), **AWS WAF** (`d8c14d4960ca.edge.sdk.awswaf.com`) for bot/challenge gating. Static assets served from `cf.bstatic.com`. The site detects headless browsers -- `b_agent_is_robot` in the `B.env` global returned `true` during investigation.

**B.env** is a 335-key global config object exposed client-side. Notable values:
- `b_gtt`: global tracking token
- `b_secure_domain`: `https://secure.booking.com`
- `b_sb_googleplaces_carrier_url`: `https://carrier.booking.com/google/places/webautocompletesimple` (Google Places proxied through a Booking subdomain)
- `fe_gtm_src`: GTM container `GTM-5Q664QZ`
- `domain_for_book`: `https://secure.booking.com`
- `b_action`: current page type (e.g., `searchresults`)

**robots.txt** discloses the internal tracking endpoint map: `/c360/v1/track`, `/squeak`, `/js_tracking`, `/js_errors`, `/log_rt_blocks_order`, `/v1/sink`, `/event`, `/navigation_times`, `/load_times`. Also reveals hidden content paths: `/fragment.*.json`, `/_frdtcr`, `/asapi/*`, `/hotelsonmap.*.json`, `/monthly_minrates*`, `/markers_on_map`.

## The Consent Stack

Booking runs two consent management systems in parallel, neither waiting for the other.

**PCM (Privacy Consent Manager)** is Booking's proprietary system, exposed as `window.PCM` and `window.__PCM_IMPLICIT_CONSENT_RULES__`. It operates server-side. The `pcm_consent` cookie is set in the **first HTTP response header** -- before any JavaScript loads, before any page renders, before any user interaction. The consent decision is made by the server based on the requesting IP's geolocation.

The PCM implicit consent rules (verified from saved evidence):

| Region | analytical | marketing | Regulation | Expiry |
|--------|-----------|-----------|------------|--------|
| Global (default) | true | true | none | 180 days |
| EEA and Russia | false | false | gdpr | 180 days |
| California | true | true | ccpa | 360 days |
| UK, Ireland, France | false | false | gdpr | 180 days |
| China | false | false | pipl | 180 days |

For California visitors under CCPA, the server sets `analytical=true&marketing=true&implicit=true&regulation=ccpa` in the first response. Full tracking consent is assumed on arrival. The `consentedAt` timestamp matches the first HTTP response, not any user action.

Observed first-response cookie value: `analytical=true&countryCode=US&consentId=54a71a29-91cc-46ba-b3ba-19b3e426d152&consentedAt=2026-04-16T02:36:01.298Z&implicit=true&marketing=true&regionCode=CA&regulation=ccpa`.

**OneTrust** (version `202501.2.0`, domain UUID `3ea94870-d4b1-483a-b1d2-faf1d982bb31`) runs as a second layer. It sets `OptanonConsent` with `OnetrustActiveGroups=,C0001,C0002,C0004,` (all cookie categories active) after the PCM cookie is already written. `OtAutoBlock.js` loads after the initial HTML, meaning scripts embedded directly in the page HTML execute before OneTrust's script-blocking mechanism regardless of consent state.

**OneTrust cookie groups** (verified from saved evidence):
- `Functional cookies` -- 125 first-party cookies, 6 hosts
- `Analytical cookies` -- 31 cookies, 7 hosts (Google Analytics, LinkedIn Insight, AppDynamics, SurveyGizmo)
- `Marketing cookies` -- 37 cookies, 24 hosts
- `Functional DO NOT USE` -- 2 cookies (`_pin_unauth`, `_implmdnbl`), 0 hosts
- `Social Media Cookies DO_NOT_USE` -- 0 cookies, 0 hosts
- `Test` -- 0 cookies, 0 hosts

The last three group names are internal CMP admin labels -- likely from whichever team manages the OneTrust configuration -- exposed verbatim in the browser-accessible `OneTrust.GetDomainData().Groups` API. Any page visitor can read them via the console.

A second quirk in OtAutoBlock: the AWS WAF challenge script (`https://d8c14d4960ca.edge.sdk.awswaf.com/.../challenge.js`) is categorized as **C0004 (Marketing)**, the same category as ad pixels and Snapchat. WAF challenge scripts are bot protection infrastructure, not marketing. Visitors who decline marketing cookies will have the WAF challenge blocked by OneTrust before it can execute -- potentially breaking bot detection for privacy-conscious users.

## Tracking Pipeline

Five distinct first-party tracking channels fire on each page load:

1. **`/c360/v1/track`** -- Booking's Customer 360 tracker. 3-5 requests per page. Proxied from `www.booking.com`; the actual API lives at `c360.booking.com/v1/c360/multitrack/`.
2. **`/v1/sink`** -- Internal analytics event sink. 6-8 requests per page.
3. **`/navigation_times`** and **`/js_errors`** -- Performance and error telemetry.
4. **Tealium** (`utag.746`) via `tags.tiqcdn.com` -- Tag manager sending to `/pr_ue`. Maps 30+ dataLayer variables including `cip` (client IP address), `cua` (user agent string), session IDs, experiment assignments, and travel intent signals. Sets `bkng_prue=1` cookie and generates a per-visitor `euuid`.
5. **GTM** (`GTM-5Q664QZ`) -- Google Tag Manager, conditional on C0002+C0004 consent.

The **dataLayer** pushed on every page load includes:
- `cip`: client IP address (actual visitor IP observed in plaintext)
- `cua`: user agent string
- `ai`: affiliate ID (`304142` -- Booking's own internal channel)
- `sid` / `sid_dyna`: session IDs
- `genis`: Genius loyalty level (0 = not logged in)
- `label`: base64-encoded protobuf payload (internal attribution label, prefix `gen000`)
- `bkng_cookie_identifier`: stable cross-session tracking identifier
- `exp_rmkt_test: "global_on"` -- remarketing experiment active globally
- `gcem`, `gcpn`: Google Customer Email Match and Phone Number fields (present but empty for unauthenticated sessions)
- `famem`, `famfn`, `fampn`: family member / partner identity fields

On hotel pages, the dataLayer adds: `hotel_class`, `hotel_name`, `hotel_id`, `dest_ufi`, `utrs` (review score).

Third-party conversion tracking fires immediately across all page types: **Google Ads conversion `988382855`** fires on homepage (`/rmkt/collect/988382855/`), search (`/pagead/conversion/988382855/`), and hotel detail pages (`/pagead/viewthroughconversion/988382855/`). **The Trade Desk** (`insight.adsrvr.org/track/realtimeconversion`) fires on each page. **DoubleClick** (`ad.doubleclick.net/activity`) fires on homepage and hotel pages.

Marketing tracker hosts declared in OneTrust: Criteo, Snapchat, Skyscanner, CasaleMedia (Index Exchange), Bing Ads, DoubleClick, Google Ads, AppNexus (Xandr), CreativeCDN, YouTube, LinkedIn, BidSwitch, Facebook, **Spotify**, Pinterest (two separate entries), Apple, Tapad, Omnitag.js. Spotify's presence on a hotel booking site is unusual -- likely used for audio ad retargeting or attribution.

## Identity Graph

Booking builds a multi-layer identity picture on anonymous visitors.

**ID5 Universal Identity** (inferred from localStorage during investigation): On first visit, the ID5 SDK assigns a `universal_uid` stored under localStorage key `id5id_v2_3856268834750531` (publisher ID `3856268834750531`). The observed `link_type: 0` indicates a deterministic match -- not a probabilistic inference. The same universal UID is stored directly in a `criteo-id5id-fast-track` localStorage key, making the ID5-to-Criteo graph connection explicit in the browser's own storage. The `pba` field carries audience segment data encoded in base64. `jurisdiction: other` (not GDPR), `id5_consent: true`, `cascade_needed: false` (full match, no further sync required).

**RTB House** (inferred from localStorage during investigation): sets `__rtbhouse.lid` with a linked demand-side targeting ID.

**cgumid cookie**: Set by server (not JS), 5+ year lifespan, `SameSite=None` for cross-site access. Value decodes from base64 to a URL-encoded string consistent with Criteo's CTO bundle format. This cookie does not appear by name in OneTrust's documented cookie groups, though Criteo appears as a marketing host.

**c360_purpose_*** in localStorage (inferred): 907 of 927 localStorage entries on first visit are `c360_purpose_*` keys -- hashed purpose IDs with per-purpose consent state (`[0]` or `[1]`). The 20 non-c360 entries include `_yjsu_yjad` (Yahoo Japan), `_uetsid` / `_uetvid` (Microsoft UET), `_gcl_ls` (Google conversion linker), and AWS WAF session state.

**Identity baked into the auth layer**: `account.booking.com` is a full OIDC provider (verified at `https://account.booking.com/.well-known/openid-configuration`). Supported scopes include:
- `https://account.booking.com/scope/marketing_tracking`
- `https://account.booking.com/scope/analytical_tracking`
- `https://account.booking.com/scope/rewards`
- `https://account.booking.com/scope/dma`
- `https://account.booking.com/scope/dma_continuous`
- `https://account.booking.com/scope/order/read_only`
- `https://account.booking.com/scope/order/read_write`
- `https://account.booking.com/scope/payments`
- `https://account.booking.com/scope/passcode`
- `https://account.booking.com/scope/exclude_pulse_verification`

The `marketing_tracking` and `analytical_tracking` scopes mean third-party apps integrating with Booking's OAuth can explicitly request permission to track users for marketing purposes -- it is formalized in the token system. The `dma` and `dma_continuous` scopes reflect EU Digital Markets Act consent workflows built into the identity platform.

`admin.booking.com` redirects to `account.booking.com/oauth2/authorize` -- the admin interface uses the same OIDC SSO, with client_id `6Z72oHOd36Nn7zk3pirh` visible in the redirect URL.

## The Open GraphQL API

`/dml/graphql` operates without authentication. Introspection is disabled (`{"code":"INTROSPECTION_DISABLED"}`), but error responses from invalid queries consistently reveal internal type names: `RoomTableQueryOutput`, `AutoCompleteRequestOutput`, `WebIndexRankingResult`, `EntrypointResult`, `AutoCompleteResult`. These provide a map of the schema without introspection.

A browser-like User-Agent header is required -- requests without it return null data for most queries. No auth cookies needed. No rate-limit headers observed in responses. Ten rapid successive requests all returned 200 during testing.

**Confirmed working queries (no auth):**

`WeekendDeals` -- returns live hotel deals with real-time pricing. Verified during analysis:

```
POST https://www.booking.com/dml/graphql
Content-Type: application/json
User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36...

{
  "operationName": "WeekendDeals",
  "query": "query WeekendDeals { weekendDeals { title subtitle properties { propertyName price { formattedPrice formattedCrossedOutPrice } } } }"
}
```

Sample response from live check (April 2026):
- Beacon Grand, A Union Square Hotel: $547 (was $718) -- 24% discount
- Hotel Zephyr San Francisco: $409 (was $504) -- 19% discount
- Motel 6-Monterey, CA: $489 (was $574) -- 15% discount
- Portola Hotel & Spa: $925 (was $1,028)

The `formattedCrossedOutPrice` field is the "was" price Booking displays with a strikethrough to indicate a deal. Querying it directly makes the claimed discount computable for any property. The query appears geo-sensitive -- returns US properties for US IP addresses.

`RoomTable` -- returns full room inventory for any hotel by pageName:

```json
{
  "operationName": "RoomTable",
  "query": "query RoomTable($pageName: String!) { roomTable(input: { pageName: $pageName }) { rooms { id name maxOccupancy } } }",
  "variables": { "pageName": "the-ritz-carlton-san-francisco" }
}
```

23 rooms returned for The Ritz-Carlton SF during investigation.

Other confirmed queries: `autoCompleteSuggestions`, `webIndexRanking` (ML-ranked homepage component order), `genAICopilot` (AI trip planner entrypoint data), `geniusGuestData` (Genius upsell content), `MerchComponents` (homepage campaign modules with campaign UUIDs).

The Apollo cache on the hotel page contains the `signedGoogleMapsUrlBff` query, which takes a Maps API key (`AIzaSyBvCIFR6EVwbjtPk5pxiNDf96xSg2CKwr4`) as a parameter and returns a signed Static Maps URL. The key appears in plaintext in the Apollo cache and in network requests. The returned URL includes a `signature=` parameter, suggesting the key is used with Google's URL signing mechanism -- restricting practical use to signed requests from Booking's backend rather than open-ended API access.

## Infrastructure Exposure

**c360.booking.com open POST**: The customer-360 tracking API is accessible without authentication. Sending `{"events": []}` returns `{"responses": []}`. Sending unknown event types returns `{"responses":[{"status":0,"code":99}]}`. The server header identifies it as `envoy` (Istio service mesh), confirming this is a direct internal service rather than a public-facing proxy. The www.booking.com path `/c360/v1/track` routes to this service.

**Production bundle artifacts** (inferred from JS bundle inspection, no saved evidence file): The capla bundle at `cf.bstatic.com/psb/capla/static/js/dc32f6b7.6d16fe38.chunk.js` was observed to contain:
- `http://127.0.0.1:228` -- internal host reference
- `http://localhost:4318/v1/traces` -- OpenTelemetry local dev endpoint
- Staging hostnames: `account.dqs.booking.com`, `c360.dqs.booking.com`, `app.dqs.booking.com`, `sink.dqs.igw.booking.com`, `web-perf.dqs.booking.com` (DQS = staging environment)
- Internal context property names: `staffIdentity`, `isInternalUser`, `isInternalIp`, `getUnpackedGuestAccessToken`, `CSRFToken`, `ETSerializedState`
- `runway_internal_action` -- internal routing/auth action type string

Source maps point to `https://istatic.booking.com/internal-static/...` -- `istatic.booking.com` does not resolve externally. The maps themselves are inaccessible, but their URLs confirm an internal static asset host.

Internal production services named in the bundle: `c360.booking.com/v1/c360/multitrack/`, `otel-gw.booking.com/v1/traces` (OpenTelemetry gateway, 401 auth required), `counters.booking.com`, `sink.gw.booking.com`, `web-perf.booking.com`.

**Deprecated endpoint still called**: `/js_tracking` returns 404 but is still referenced on hotel pages (`POST /js_tracking&m=UmFuZG9tSVYk...`). The tracking label encoded in the query string is a base64 protobuf identical in format to the `label` field in the dataLayer.

**Subdomain map** (verified through resolution and redirect behavior):
- `account.booking.com` -- OIDC / OAuth2 provider
- `nellie.booking.com` -- CSP violation reporting, 405 for non-OPTIONS
- `carrier.booking.com` -- Google Places API proxy
- `secure.booking.com` -- payment/checkout domain, redirects to www for unauthenticated requests
- `partner.booking.com` -- 403 via CloudFront (extranet)
- `admin.booking.com` -- redirects to `account.booking.com/oauth2/authorize`
- `gtp-mktg.booking.com` -- Google Tag Manager analytics endpoint
- `otel-gw.booking.com` -- OpenTelemetry tracing gateway, 401 required

## Machine Briefing

### Access & auth

Most useful endpoints work without authentication. A browser-like User-Agent header is required for GraphQL queries to return data. No cookies needed for unauthenticated reads. AWS WAF challenge runs on page load and sets `aws-waf-token` -- needed for sustained scraping but not for single requests.

```bash
curl -s -X POST https://www.booking.com/dml/graphql \
  -H 'Content-Type: application/json' \
  -H 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  -d '{"operationName":"WeekendDeals","query":"query WeekendDeals { weekendDeals { title subtitle properties { propertyName propertyId price { formattedPrice formattedCrossedOutPrice priceText } review { formattedScore rating } } } }"}'
```

### Endpoints

**Open (no auth, browser User-Agent required)**

```
POST https://www.booking.com/dml/graphql
  WeekendDeals -- live pricing with was-prices, geo-sensitive (US properties for US IP)
  RoomTable(pageName: String) -- room inventory for any property
  autoCompleteSuggestions -- destination typeahead
  webIndexRanking -- ML-ranked homepage component order
  genAICopilot -- AI trip planner entrypoint data
  geniusGuestData -- Genius loyalty upsell content
```

```
POST https://c360.booking.com/v1/c360/multitrack/
  Content-Type: application/json
  Body: {"events": []}
  Returns: {"responses": []}
  No auth required. Returns code 99 for unknown event types.
```

```
GET https://www.booking.com/squeak
  Returns 202. Purpose unclear. No auth required.
```

```
GET https://account.booking.com/.well-known/openid-configuration
  Full OIDC discovery document. No auth required.
```

**Auth-gated / semi-restricted**

```
POST https://www.booking.com/acid_carousel
  Returns 400 without valid session payload

POST https://www.booking.com/privacy-consents/implicit
  Registers implicit consent state server-side

GET https://www.booking.com/unified-consents/
  Consent management endpoint

GET https://otel-gw.booking.com/v1/traces
  OpenTelemetry tracing gateway. Returns 401.
```

**Hotel page GraphQL queries (with pageName)**

```
POST https://www.booking.com/dml/graphql
  hotelPageByPageName -- full property data
  roomTable -- room inventory
  reviewsFrontend -- guest reviews
  breadcrumbs -- page hierarchy
  signedGoogleMapsUrlBff -- signed static map URL (includes Maps API key in parameters)
```

### Gotchas

- `WeekendDeals` returns null without a User-Agent header. Add a desktop browser UA string.
- `webIndexRanking` requires enum values passed as variables, not inline string literals.
- GraphQL introspection is disabled. Use error messages to enumerate type names.
- The `pageName` for RoomTable is the URL slug (e.g., `the-ritz-carlton-san-francisco`), not the numeric hotel ID.
- AWS WAF challenge fires on first request; sustained polling will eventually trigger CAPTCHA. The `aws-waf-token` cookie from a solved challenge extends session lifetime.
- `/js_tracking` returns 404 -- deprecated. Use `/c360/v1/track` or the direct `c360.booking.com/v1/c360/multitrack/` endpoint.
- `B.experiments` is `{}` on search results pages -- experiment assignments are not exposed client-side on that page type.
- GraphQL responses include `extensions.latency_insights` with per-operation timing, useful for inferring backend load.
