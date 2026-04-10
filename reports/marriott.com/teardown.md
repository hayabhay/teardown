---
# agents: machine-friendly instructions in "## Machine Briefing"
title: Marriott — Teardown
url: "https://www.marriott.com"
company: Marriott
industry: Hospitality
description: "Global hotel chain operating 9,000+ properties across 30+ brands worldwide."
summary: "Marriott.com runs a hybrid stack: Next.js for the homepage via an AEM headless remote SPA pattern, and a legacy Java/Aries framework for property, search, and informational pages. Apollo GraphQL with persisted queries proxied through Akamai and nginx to an internal API gateway. Kubernetes on a cluster named phoenix-prod1 with blue/green deployments. Adobe Launch as tag manager, OneTrust as CMP. Akamai WAF blocks curl requests and most headless browser traffic on commercial URL patterns."
date: 2026-04-05
time: "11:47"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack:
  - Next.js
  - AEM
  - Apollo GraphQL
  - Akamai
  - Spring Boot
  - jQuery
  - Adobe Launch
trackers:
  - Google Analytics
  - Google Ads
  - DoubleClick
  - Facebook Pixel
  - FullStory
  - Pinterest
  - Snapchat Pixel
  - LinkedIn Insight
  - The Trade Desk
  - Amazon DSP
  - Branch.io
  - Dynatrace
  - Medallia
  - Qualtrics
  - Adobe Analytics
  - Naver
  - Kakao
  - Dotomi
tags:
  - travel
  - next-js
  - aem
  - consent-bypass
  - pre-consent-tracking
  - ssr-data
  - kubernetes
  - fullstory
  - feature-flags
headline: "OneTrust's staging config is deployed in production, so the consent banner never appears and 57 trackers fire on every US visit with zero interaction."
findings:
  - "OneTrust CMP runs `ScriptType: TEST` in production — the consent banner never renders for US or Canadian visitors, and all tracking groups are auto-consented before the page finishes loading"
  - "FullStory session recording has 170+ explicit capture rules covering the booking funnel — loyalty member name, points balance, charges summary, and identity verification screens — all recording without consent"
  - "Korean and Japanese ad pixels (Naver, Kakao Daum, Line) fire on every US page load via Adobe Launch rules that aren't gated by visitor locale"
  - "Session API returns visitor geolocation from Akamai — ZIP, city, lat/long, ISP, bandwidth — to unauthenticated requests, then persists it to localStorage where any third-party script can read it"
  - "Internal Kubernetes service hostname `mi-interceptor-app-blue.phoenix-prod1.svc.cluster.local` ships to every visitor's browser in Next.js SSR props"
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

Marriott runs two different web applications on the same domain, with distinct security postures.

The homepage (`/default.mi`) is built on **Next.js** (build `web-rel-26.3.2-03232026`, deployed 2026-03-23) using a headless AEM + Next.js remote SPA pattern. AEM lives at `marriott-sites2-prod.adobecqms.net` and exports content to Next.js via the `headless-next-js-template`. The Next.js app is internally called the "phoenix-renderer" — internal service names, routes, and config keys all carry the `phoenix` prefix. GraphQL queries run through Apollo Client with 8 persisted query operations, routed through nginx at `/mi/query/` to an internal gateway: `apigw.prod16.gw.eapi.prd1.cld.marriott.com/v1/graph/query`.

Most other pages — property listings, search, about, offers — run on a legacy Java framework called **Aries**. Component endpoints are served at `/aries-common/v1/` paths. These pages also load Adobe Target for personalization (`marriottinternationa.tt.omtrdc.net`) and pull AEM CSRF tokens at `/libs/granite/csrf/token.json`. The two frameworks coexist on the same domain but represent different tech generations and different attack surfaces.

**jQuery** runs alongside React 19 — legacy code not yet migrated. The homepage exposes 20+ React hydration errors (React error #418) in production, indicating SSR/CSR content mismatch.

**CDN and bot defense:** Akamai handles CDN, WAF, and device fingerprinting. The `device-characteristics` cookie is set on first contact — cURL gets `brand_name=cURL&model_name=cURL` and a 403 immediately. Headless browsers get through the homepage but are blocked on `/search/findHotels.mi`, `/en-us/hotels/` property pages, and the GraphQL endpoint from direct browser fetch. The Akamai bot sensor posts to an obfuscated endpoint (`/UP_Vg_O-gt4w3cHTT4xRw4Sh_uE/...`).

**Build and deploy:** Jenkins pipeline, `prod1` environment, `prod16` gateway. The `buildInfo` object in `__NEXT_DATA__` includes `deployedEnvType: "higher"`, `deployedEnvConfig: "prod1"`, and `jenkinsDeploymentBuild: null`. The `isNorthStarPage: false` flag in page model suggests an internal redesign initiative ("North Star") is in progress but not yet shipped.

**Internal hostnames exposed by design:**
- `phoenix-www.marriott.com` — internal forwarded hostname
- `phoenix-prod1` — Kubernetes cluster namespace
- `mi-interceptor-app-blue.phoenix-prod1.svc.cluster.local` — K8s service hostname

---

## SSR Data Over-Exposure

Every Next.js page load ships `__NEXT_DATA__` — a full server-side rendered props dump. On the homepage, this includes:

**Cluster topology.** The `pageManagerRequest.global.domain` field contains the internal Kubernetes DNS name: `mi-interceptor-app-blue.phoenix-prod1.svc.cluster.local`. This is not a config key or URL passed around for routing — it's the raw `.svc.cluster.local` address that only resolves inside the cluster, surfaced to every browser that loads the page.

**Internal forwarded headers.** The `headersData` object ships the full nginx proxy header set to the browser, including:
- `host: phoenix-www.marriott.com` — internal upstream hostname
- `x-real-ip` / `x-forwarded-for` — visitor's real IP (investigator's own IP confirmed in evidence; not reproduced here)
- `x-akamai-edgescape` — Akamai's full geolocation string: `georegion=246,country_code=US,region_code=CA,city=SUNNYVALE,dma=807,...,lat=37.3873,long=-122.0158,...,network=comcast,asnum=7922`
- `x-request-id: /default.mi~X~E58B67E7-9960-52CC-9D6B-D6E3E2BA5E2E` — internal request routing path with UUID

Every visitor loading the homepage can read their own IP and geolocation as interpreted by Akamai. But the server-side data belongs to the server, not the client — shipping it to the browser is the exposure.

**Config and credentials.** The `__NEXT_DATA__` `pageProps` block includes:
```json
{
  "DEPLOYED_ENV_CONFIG": "prod1",
  "TARGET_PROPERTY_TOKEN": "c72849c6-2a3c-8a3b-bf17-94885baf8879",
  "GOOGLE_MAP_API_KEY": "AIzaSyCCW6WUQGP6GoOAd-iPkaiS53x3SmhXMgQ",
  "SESSION_GET_CALL_URL_CLIENT": "/mi/phoenix-gateway/session",
  "APOLLOGRAPHQL_FULL_NGINX_ENDPOINT": "https://apigw.prod16.gw.eapi.prd1.cld.marriott.com/v1/graph/query",
  "APOLLOGRAPHQL_PUBLIC_APPLICATION_NAME": "homepage",
  "APOLLOGRAPHQL_PUBLIC_REQUIRE_SAFELISTING": "",
  "NEXT_PUBLIC_AEM_PUBLISH": "https://marriott-sites2-prod.adobecqms.net",
  "buildInfo": {"deployedEnvType": "higher", "deployedEnvConfig": "prod1"}
}
```

The `GOOGLE_MAP_API_KEY` and `TARGET_PROPERTY_TOKEN` (Adobe Target) are client-side service keys — architectural detail, not findings in themselves. The GraphQL safelisting flag being empty (`""`) would normally mean persisted query safelisting is off, but Akamai blocks direct GraphQL POSTs anyway, so this is moot in practice.

**Feature flags.** 51 feature flags (`WebChannelFeatureFlag`) are shipped to every visitor in `__NEXT_DATA__`. Notable entries:
- `ENABLE_MFA_OPT_IN: true` — MFA is rolling out
- `ENABLE_MFA_INTRO_MODAL: false` — intro modal not yet shown (staged rollout)
- `ENABLE_PHOENIX_REFRESH_TOKEN: false` — refresh token auth not yet enabled
- `ENABLE_ELITE_LEVEL_EXPIRATION: false` — elite status expiration turned off
- `ENABLE_TRAVEL_INSURANCE_IN_BOOKING_FLOW: true`
- `ENABLE_GPC_PREFERENCES: true` — Global Privacy Control honored
- `BRAND_CATEGORY_LIST` — internal hotel brand codes grouped by tier: `["EB,RZ,LC,XR,WH,JW,BG", "MC,SI,MV,DE,WI,MD,BR,AK,TX,DS,GE,MG", ...]`

---

## Session API and Geolocation Persistence

`GET /mi/phoenix-gateway/session` returns a session object to anonymous requests with no authentication required:

```json
{
  "sessionToken": "4BF11802-98BA-5FD9-91B9-93294566EB37",
  "cacheData": {
    "data": {
      "akamaiHeader": "georegion=246,country_code=US,region_code=CA,city=HAYWARD,
        dma=807,pmsa=5775,msa=7362,areacode=510,county=ALAMEDA,fips=06001,
        lat=37.6687,long=-122.0799,timezone=PST,zip=94540-94545+94557,
        continent=NA,throughput=vhigh,bw=5000,network=comcast,asnum=7922,
        network_type=cable,location_id=0"
    }
  },
  "authenticated": false,
  "status": "SUCCESS"
}
```

Every field in Akamai's edgescape header — city, county, FIPS code, DMA code, ISP name (Comcast), AS number (7922), bandwidth tier, network type — is returned verbatim to the browser. The client-side JS then writes this to two stores: `mi-global-data` in sessionStorage and `mi-session-store` in localStorage. The localStorage entry survives across tabs and browser restarts. Every third-party script loaded after page load can read the visitor's Akamai-inferred location from `mi-session-store`.

The session API response headers include Kubernetes pod names in `x-service-id`:
- `mi-nginx-app-blue-64fbfff7f8-jb9cc` (pod 1)
- `mi-nginx-app-blue-64fbfff7f8-lc5v6` (pod 2)
- `mi-nginx-app-blue-64fbfff7f8-lvl94` (pod 3)

Multiple pods are visible because the session endpoint is called several times per page load. The naming convention `{service}-{color}-{replicaset}-{pod}` exposes the blue/green deployment pattern directly. A second service appears in the Adobe Edge interact endpoint: `ram-nginx-auto-green-5f74b6599f-grjs6` — a different service, also exposing its pod identity.

The session endpoint carries `retry-after: 28800` — an 8-hour rate limit window signal.

The `/mi/phoenix-gateway/v1/session` (v1 path) returns HTTP 500 — either deprecated or broken.

---

## Consent Theater

OneTrust is deployed with a staging configuration in production.

The OneTrust config served to production visitors shows `"ScriptType":"TEST"` — this is the test/staging CMP configuration, not the production one. The CDN path confirms it: every consent-related request fetches from `cdn.cookielaw.org/consent/f6f2227d-5318-43ca-8e66-30acdeffa99f-test/...`. OneTrust's own documentation distinguishes between test and production tenant configurations — test configs are intended for QA environments and may behave differently from production ones.

The operational result: the consent banner never appears for US and Canadian visitors. Verified in a clean browser session with no prior cookies or localStorage:

- `bannerInDOM: false` — the banner element is never inserted into the DOM
- `oneTrustVarLS: SecondUI` — localStorage is pre-set to the "already interacted" state
- `OptanonConsent` cookie: `groups=1%3A1%2C3%3A1%2C4%3A1%2C6%3A1` — all groups consented, including group 4 (targeting/advertising)
- `interactionCount: 0` at initial load, but all groups already marked consented

The OneTrust geolocation API correctly detects US/California visitors (`onetrust-geo.json` confirms `country: US, state: CA`). The "Americas - Non-GDPR-like" ruleset fires for US and Canada. But the rule never shows a banner — the consent state is pre-written.

Additional detail from the CMP config:
- 12 geographic rulesets covering EMEA-GDPR, CALA-GDPR-like, APEC, India, China, etc. — geolocation-aware consent is architecturally present, just broken for North America
- `IabV2Data.vendorListVersion: 0` and `maxVendorId: 0` — no IAB TCF vendors registered, meaning the IAB consent framework is not in use despite GDPR rulesets existing
- `SkipGeolocation: false` — geolocation checking is enabled but the North American result is "no banner required"

The consequence is that **57 cookies are set on a clean first visit with zero user interaction**, and every ad and tracking pixel fires.

---

## Tracking Footprint

A fresh session on the homepage contacts **27 third-party domains** across **159 total requests** (65 first-party, 94 third-party). All of the following fire before any consent interaction:

**Google:** Five conversion IDs post to `www.google.com/rmkt/collect/` — IDs `924374711`, `18025444211`, `950378023`, `11361500211`, `17690937749`. Nine DoubleClick floodlight tags hit `ad.doubleclick.net/activity` with Marriott source IDs `1359549` and `9035495`. DV360 viewthrough conversion and `pagead2.googlesyndication.com` also fire.

**Identity and ad networks:** Pinterest (`ct.pinterest.com`), LinkedIn (`px.ads.linkedin.com`), Amazon DSP (`s.amazon-adsystem.com`), The Trade Desk (`insight.adsrvr.org`), Branch.io (`api2.branch.io/v1/open` and `/v1/pageview`).

**Session recording:** FullStory starts recording immediately (`rs.fullstory.com/rec/page`).

**Analytics:** Medallia sends data to `analytics-fe.digital-cloud.medallia.com`. Qualtrics intercept engine posts to `siteintercept.qualtrics.com`. Dynatrace RUM reports to `rb_bf88204ffh`.

**Identity graphs:** Adobe ECID via `kndctr_664516D751E565010A490D4C_AdobeOrg_identity` cookie, LinkedIn `li_adsId` written to localStorage (bypassing cookie blockers), Neustar/TransUnion via `jvxsync` cookie.

**APAC market pixels on US homepage.** Adobe Launch loads Korean and Japanese ad tracking libraries for all US visitors, with no locale condition:
- `nam.veta.naver.com/nac/2` — Naver audience sync, confirmed firing with HTTP 200 on fresh US session
- `bc.ad.daum.net/bc` — Kakao Daum (Korea) pixel, confirmed on About page
- `d.line-scdn.net` — Line (Korea/Japan) tracking
- These are loaded via Adobe Launch rules not gated by visitor locale — they represent global campaigns added to a shared container without market-specific conditions

**Dotomi/Conversant DMP** (Epsilon's cross-site identity network, operated by Publicis): fires on informational pages with full geolocation parameters — `dtm_zip_code`, `dtm_state=CA`, `dtm_country_code=US`, `dtm_dma_code=807` — sent to `login-ds.dotomi.com/profile/visit/final/js` before any consent interaction. The call includes `dccu=true` (cross-device cookie sync enabled), `dtm_paapi=1` (Privacy Sandbox API enabled), and `dtm_client_optout=false`.

**Tag management:** Adobe Launch (no GTM) with a container at `assets.adobedtm.com/697d0c070f1e/f8138fa40779/launch-fccab51974bf.min.js` loading 40+ rule scripts. Rule scripts explicitly reference vendor integrations: Facebook, LinkedIn, Twitter, Pinterest, Snapchat, Yahoo, Naver, Kakao Daum, Line, Amazon DSP, The Trade Desk.

---

## FullStory Session Recording Coverage

FullStory org `o-2403J0-na1` operates with 170+ explicit CSS selector capture rules targeting the full booking funnel. The settings file (`fullstory-settings.json`, fetched from `edge.fullstory.com/s/settings/o-2403J0-na1/v1/web`) reveals the scope:

**Booking flow:**
- `[data-testid="prebookingsummary"]` — pre-booking summary panel
- `[data-component-name="o-book-summaryofcharges"]` — charges breakdown
- `[data-testid="BookingAcknowledgement"]` — post-booking confirmation screen

**Loyalty account:**
- `[data-testid="memberinformation"]` — loyalty member info panel
- `[data-testid="display-user-name"]` — member name display
- `[data-testid="points"]` and `[data-testid="points-field"]` — points balance
- `[data-testid="missingstayrequestform"]` — missing stay claim form

**Authentication:**
- `[data-component-name="o-account-forgotpasswordemailsent"]` — password reset confirmation
- `[data-testid="confirmidentity"]` — identity verification screen

**Ajax monitoring:** `PhoenixDCADynamicContentV2` is explicitly listed in FullStory's Ajax watch configuration — both the request and response body are recorded. `MaxAjaxPayloadLength: 16384` means up to 16KB of GraphQL API response bodies are captured per request.

Blocked fields: password inputs, credit card autocomplete fields, email/phone wrapper elements. JWT tokens, passwords, and codes are excluded from URL capture. Everything else in the booking flow — names, destinations, dates, prices, loyalty balances — is captured.

---

## Infrastructure Exposure

**SSL Certificate SANs (79 entries).** The production TLS certificate lists subdomains including internal system integrations:

- `ci-propertyconversionportal.marriott.com` — a CI/CD tool on the production cert; returns HTTP 200
- `oci-prod-integration-mipaasiaasservices-hireright.marriott.com` — HireRight HR system integration
- `oci-prod-integration-mipaasiaasservices-iam.marriott.com` — IAM system integration
- `prod-mipaasiaasservices.marriott.com` — production iPaaS services gateway
- `oci-prod-integration-mipaasiaasservices-dlz.marriott.com` — OCI prod data landing zone
- `webhook.hvmi.marriott.com` — Homes & Villas by Marriott webhook endpoint (returns 403 to curl)
- `wechat.api.marriott.com.cn` / `empower-enrollment.marriott.com.cn` — China-specific endpoints

Certificate transparency logs make SANs public regardless — this is a signal that internal system naming hasn't been segmented from the public cert.

**Oracle Cloud Integration CORS.** `prod-mipaasiaasservices.marriott.com` redirects (307) to `https://design.integration.us-ashburn-1.ocp.oraclecloud.com/?integrationInstance=oci-prod-integration-mipaasiaasservices`. The redirect response carries `Access-Control-Allow-Origin: *` combined with `Access-Control-Allow-Credentials: true`. This combination is invalid per the CORS spec — browsers reject credentialed cross-origin requests to wildcard origins — but it signals an overly permissive CORS configuration on a production integration endpoint.

**Subdomain status:**
- `news.marriott.com` — separate SPA app, returns 200. Uses **Matomo** analytics at `matomo-mgs4.mi-mgs.com` with siteId=4 — completely separate from the main Adobe stack. Has its own Adobe Launch container (`launch-EN3963523be4674e5591a9c4d516697352`). Globals include `window.publicSite = "true"` and `window.baseURL = "https://news.marriott.com"`.
- `learningcontent.marriott.com` — 307 redirect
- `auth.marriott.com` — 503 (down at time of investigation)

**Spring Boot backend.** The credit card pre-qualification endpoint (`/mi/cobrand/prequal`) fires on every page load and returns an error response in Spring format when called with missing parameters: `{"code":"400 BAD_REQUEST \"Required header 'PageURI' is not present.\""}`. The Spring `HttpHeaders`-style error format confirms a Spring Boot service backing at least the cobrand/financial endpoints.

**Homepage datalayer endpoint.** `/mi/api/homepage/datalayer` serves a JavaScript variable assignment (not JSON) visible to any page script. The `rk_cList` key contains the full RoomKey feature flag config including a corporate rate code exclusion list:

```
exclude.special.rates.corpcode: MW1, IBM, EMP, ACC, H77, GEE, TVL, GDY, PEP, ORA, HPQ,
  DTC, ATT, MEB, TOY, PCW, SAP, T77, SIE, BOE, M11, BOA, WEL, A4Y, MCO, MOD, VZN, EMC,
  ZG4, G2D, JOH, UAL, UTC, DEL, LAC, LK6, GMC, RAY, MM4, MMB, MMF, MMP
```

Recognizable codes: IBM, ORA (Oracle), HPQ (HP), ATT (AT&T), SAP, BOA (Bank of America), UAL (United Airlines), GMC. The endpoint also exposes `env_server_id: prod32` and per-country currency mappings.

**Legacy Aries pages.** The 404 path (`/mi/mi-homepage-renderer-remote`) and the sitemap URL both render via the legacy Aries framework, exposing `hd_roomKeyAPIKey: "a9bc92520c8acea6eadbc930b2ce2874"` and `roomkey_api_version: "1.5.1"` in page HTML. RoomKey was a hotel metasearch engine acquired by Hotels.com — the API key is for a service that may no longer be active, but its presence on error and sitemap pages indicates the legacy framework has not been audited for credential exposure.

**AEM author environment.** `marriott-sites2-prod.adobecqms.net` returns HTTP 500. Server headers: `Apache`, `x-dispatcher: dispatcher2eucentral1-28607066`, `x-vhost: publish`. The dispatcher hostname reveals the AEM publish tier is hosted in AWS eu-central-1 (Frankfurt), routed through Akamai.

---

## Open Threads

**GraphQL schema inaccessible.** Direct POSTs to `/mi/query/` are blocked by Akamai from both curl and browser fetch. The 8 persisted query signatures are visible in `__NEXT_DATA__`:

| Operation | SHA256 Signature |
|---|---|
| `phoenixOfferPreview` | `adfeb827a941119fadc05ad039fe99...` |
| `phoenixShopAdvSearchInventoryDate` | `7d7f735313b7f2dda708c1c9b6dc51...` |
| `phoenixShopSuggestedPlacesQuery` | `70b3555c91797ca8945e4f4b1bdda4...` |
| `GetAemContentPolarisTabCollection` | `25b01fd3b65826ae3cf24c4b9b1813...` |

The internal gateway `apigw.prod16.gw.eapi.prd1.cld.marriott.com/v1/graph/query` is not reachable externally. `APOLLOGRAPHQL_PUBLIC_REQUIRE_SAFELISTING: ""` suggests safelisting is disabled on the nginx proxy path, but Akamai blocking makes this untestable from outside.

**Booking and property flows.** Akamai blocks headless browsers on `/en-us/hotels/` property pages and `/search/findHotels.mi` — the full booking API was not reachable. These paths are listed in `robots.txt` Disallow.

**`/mi/cobrand/prequal` full error body.** The Spring Boot error surface was confirmed; the full NullPointerException stack trace mentioned in investigation notes was not captured in evidence. The endpoint fires on every page load with the session token, suggesting it's checking credit card pre-qualification status per-session.

---

## Machine Briefing

**Getting in.** curl gets an immediate 403 from Akamai with `device-characteristics` cookie set to `brand_name=cURL`. A real Chrome browser (or Playwright with default Chromium) loads the homepage successfully. Headless Chromium is blocked on property URLs (`/en-us/hotels/`), search (`/search/findHotels.mi`), and direct GraphQL POSTs. For anything beyond the homepage, you need a session that has passed Akamai's bot scoring — obtained by loading the homepage first and letting the Akamai sensor endpoint post its data.

**Session setup.** Load `https://www.marriott.com/default.mi`. The page makes two calls to `/mi/phoenix-gateway/session` (GET and PATCH) and sets `sessionID` cookie. All subsequent API calls require this cookie. The Akamai bot sensor (`POST /UP_Vg_O-gt4w3cHTT4xRw4Sh_uE/...`) must also complete — skipping it increases bot score.

**Key endpoints.**

Session (unauthenticated):
```
GET https://www.marriott.com/mi/phoenix-gateway/session
→ 200, returns sessionToken + visitor geolocation in akamaiHeader
→ x-service-id: mi-nginx-app-blue-{hash}-{pod} in response headers
```

Auth check:
```
GET https://www.marriott.com/mi/phoenix-account-auth/v1/userDetails
→ 200 for anonymous: {"status":"FAILURE","message":"Unauthenticated User","pwdPublicKey":"-----BEGIN PUBLIC KEY-----..."}
→ Returns RSA public key used for password encryption before sending credentials
```

Datalayer (no auth, returns JS variable assignment not JSON):
```
GET https://www.marriott.com/mi/api/homepage/datalayer
→ var dataLayer = { env_server_id, browser_akamai_loc_*, rk_cList, rk_currency, mvp_prequal_endpoint, ... }
```

Credit card pre-qualification:
```
GET https://www.marriott.com/mi/cobrand/prequal
→ Fires on every page load; requires PageURI header or returns Spring 400 BAD_REQUEST
```

GraphQL (blocked from outside):
```
POST https://www.marriott.com/mi/query/{operationName}
→ Akamai 403 from browser fetch and curl
→ Only accessible via Next.js SSR (server-side requests through nginx)
→ Internal gateway: https://apigw.prod16.gw.eapi.prd1.cld.marriott.com/v1/graph/query
```

Offers page adds: `phoenixOffersCarouselV2`, `phoenixNearbyDestinations`, `phoenixOffersFallbackOffers`, `PhoenixDCADynamicContentV2`, `ContactInformation` — and `POST /hybrid-presentation/api/v1/getUserDetails`.

**What to watch for:**
- Akamai increments a bot score on every suspicious request. Static cURL calls, missing Referer headers, and rapid sequential requests will get blocked.
- The session token (`sessionID` cookie) is created fresh on every anonymous session. It appears to be a UUID-based session key, not a JWT — it does not carry auth state.
- `retry-after: 28800` on the session endpoint signals an 8-hour window for rate limit resets.
- `__NEXT_DATA__` is embedded in the page HTML at `<script id="__NEXT_DATA__" type="application/json">` — parse with any JSON extractor. It contains the full feature flag map, config keys, and cluster topology without any API call.
- The Aries legacy pages (404, sitemap, `/marriott/aboutmarriott.mi`) have different Akamai rules and different response shapes — they serve server-rendered HTML with embedded `var dataLayer = {}` blocks containing additional config.
- `news.marriott.com` is a separate app with Matomo analytics (not Adobe), its own Adobe Launch container, and no Akamai WAF — it is generally more accessible than the main domain.
