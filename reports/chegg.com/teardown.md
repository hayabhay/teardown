---
# agents: machine-friendly instructions in "## Machine Briefing"
title: Chegg — Teardown
url: "https://chegg.com"
company: Chegg
industry: Education
description: "Online education platform offering homework help, textbook rentals, and study tools."
summary: "Chegg runs a Next.js + Contentful homepage reverse-proxied from lpc-ui.prod.cheggcdn.com, with a federated GraphQL gateway (one-graph) fronting 7+ BFF microservices behind PerimeterX and AWS WAF. The writing product is a separate CRA SPA on writing.chegg.com with its own Apollo GraphQL BFF, consolidating four acquired citation brands (EasyBib, Citation Machine, BibMe, Cite This For Me) on legacy infrastructure. Auth uses Auth0 Universal Login; billing uses Recurly. CDN is CloudFront over S3 throughout, with cheggcdn.com as the primary distribution domain."
date: 2026-04-05
time: "06:49"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack: [Next.js, Contentful, GraphQL, Auth0, Recurly, CloudFront, PerimeterX]
trackers: [Google Analytics, Google Ads, Meta Pixel, LinkedIn Insight Tag, Snapchat Pixel, TikTok Pixel, Reddit Pixel, Bing UET, HubSpot, Amplitude, Adobe Launch, Adobe DTM, New Relic, OneTrust, Optimizely, Studybreak Media]
tags: [edtech, graphql, microservices, subscription, acquisition, bot-protection, pre-consent, apollo-tracing, test-env-exposed, multi-brand]
headline: "Chegg's production GraphQL API hands back your city, postal code, and GPS coordinates to any browser — no account, no login, no consent required."
findings:
  - "The writing tools' GraphQL server returns resolver-level execution traces on every response with no login required — exposing which internal services handle each request and how long they take, accessible via plain curl."
  - "A complete copy of Chegg's writing tools runs on the public internet at writing.test.cheggnet.com with no access controls — it sets 10-year tracking cookies on a separate domain."
  - "Chegg pre-enables all tracking consent categories before you interact with the cookie banner — seven ad networks including Meta, TikTok, and Snapchat start collecting data the moment the page loads."
  - "Production JavaScript embeds hostnames for six internal environments including dev, staging, trunk, and release candidate servers, plus Kubernetes service discovery names — a map of Chegg's internal infrastructure."
  - "The userData cookie exposes your login state as readable JSON with no HttpOnly flag — every ad pixel and third-party script on the page can check whether you're signed in."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

Chegg is a multi-product education platform with distinct technical stacks for different product lines, assembled through years of acquisitions. The main site at `www.chegg.com` is a Next.js application, but the HTML does not originate from chegg.com's servers directly. It is served from `lpc-ui.prod.cheggcdn.com` — a CloudFront distribution backed by S3 in us-west-2 — and reverse-proxied through the main domain. The page HTML carries `data-app="contentful"` and `data-app-name="landing-pages-contentful-ui"`, identifying the entire homepage as a Contentful-CMS-driven landing page system. Current build ID observed in live session: `4cOUc6q-CLPqoPaHGh3p3`.

The writing tools product (`writing.chegg.com`) runs on an entirely separate stack: a Create React App (CRA) SPA with a distinct backend GraphQL server at `bff.writing.chegg.com`. The writing frontend is served from S3 via CloudFront; auth and session management behind it run on `nginx/1.14.0 (Ubuntu)` — a server build dating to 2018. The main chegg.com and gateway.chegg.com sit behind PerimeterX bot protection. The writing subdomain does not.

CDN topology: `cheggcdn.com` is the primary CDN domain. Key distributions — `c.cheggcdn.com`, `components.cheggcdn.com`, `lpc-ui.prod.cheggcdn.com` — are all S3-backed. Direct S3 access returns 403. `static.chegg.com` returns 403 from S3; `assets.chegg.com` returns 401 from CloudFront.

**Auth and billing:** Auth0 Universal Login at `auth-gate.chegg.com/universal/login?brand=chegg`. Mexico has a parallel auth instance at `auth-gate.chegg.com.mx/auth-gate/graphql`. AWS WAF (not PerimeterX) protects the auth subdomain directly. Billing uses Recurly (`js.recurly.com/v4/recurly.js`). Customer service runs on Gladly at `chegg.gladly.com` (Cloudflare-hosted), with SAML SSO at `/api/v1/saml_login`. Gladly is configured with 12 supported locales (English, German, Spanish, French, Hindi, Italian, Japanese, Polish, Portuguese, Russian, Turkish, Simplified Chinese), indicating active international support operations. Marketing pages suppress the chat widget via `window.blockGladlyChat = true`.

**Micro-frontends:** Chegg uses the OpenComponents (OC) framework for shared micro-frontend components. The registry at `registry.chegg.com` currently returns a maintenance page ("The page you are looking for is currently unavailable") with a 30-second meta refresh to chegg.com. The main site's 404 error page contains `<oc-component href="//registry.chegg.com/chegg-header/*?noSearch=1&nonSticky=1&math=1&writing=1&mathSubjects=1">` and loads the OC client runtime via `<script src="https://registry.chegg.com/oc-client/client.js">`. With the registry offline, pages relying on OC-delivered components fail to render the shared header.

**Marketing and partnerships:** `collegemarketing.chegg.com` runs on HubSpot CMS, identifiable by edge cache tag format in response headers — the B2B/institution-facing property. The runtimeConfig also contains a `cspSalesPageConfig` block with named routes for a Sallie Mae student loan co-brand: `smcheggstudypack` and `smcheggstudypack-error` indicate an active product pairing with Sallie Mae.

**Digital asset management:** `marketing-assets.chegg.com` is powered by Bynder DAM, not Cloudinary despite the Cloudinary-compatible URL format. Response headers `x-bf-cdn-key: ZYPTD8JS` and `x-goog-generation` confirm Bynder Files running on Google Cloud Storage. Chegg uses Bynder's Cloudinary-compatible URL scheme for image transformations.

**Acquisition artifacts:** `cdn.money.chegg.com` serves math static content (`mathStaticContentCdnBaseUrl` in runtimeConfig). The `money` subdomain is an artifact of internal product naming, carrying through into the production CDN hostname. The writing subdomain consolidates four acquired citation brands — EasyBib, Citation Machine, BibMe, Cite This For Me — under a single platform.

## GraphQL Architecture

The primary API surface is a federated GraphQL gateway at `gateway.chegg.com/one-graph/graphql`, protected by PerimeterX. Behind it, distinct BFF (Backend for Frontend) services handle specific product domains:

| Service | Path |
|---|---|
| User profile | `gateway.chegg.com/me-web-bff/graphql` |
| Checkout | `gateway.chegg.com/checkout-bff/graphql` |
| Pricing | `gateway.chegg.com/digital-pricing-bff/graphql` |
| Personalization | `gateway.chegg.com/personalization-bff-service/graphql` |
| Device fingerprinting | `gateway.chegg.com/fingerprint-bff/graphql` |
| Auth gate | `gateway.chegg.com/auth-gate/` |
| Landing page CMS | `gateway.chegg.com/landing-pages-contentful-bff/graphql` |

The landing-pages-contentful-bff currently returns a 502 from openresty — the nginx+Lua reverse proxy layer between the gateway and BFF services. The error page confirms openresty as the internal proxy technology.

The dedicated `fingerprint-bff` service is notable: a BFF exclusively for device fingerprinting, running alongside PerimeterX on the main site. This layered fingerprinting approach suggests concerns beyond bot protection — likely account sharing detection, a known issue for subscription-based education platforms.

**one-graph introspection — enabled in production.** With a real browser session cleared by PerimeterX (no Chegg account login required), the one-graph endpoint accepts introspection queries. Schema size measured in a live browser session:

- Total types: **1,436** (793 OBJECT, 355 INPUT_OBJECT, 244 ENUM, 27 SCALAR, 12 UNION, 5 INTERFACE)
- Root query fields: **348**
- Root mutation fields: **197**

The gateway enforces client identification via the `apollographql-client-name` header; missing it returns `code: MISSING_CLIENT_NAME_HEADER`. With the header set to `landing-pages-contentful-ui`, introspection and unauthenticated queries succeed.

**Confirmed unauthenticated queries (browser session, no Chegg account):**

- `geolocation { countryCode city postalCode latitude longitude countryName isInEuropeanUnion }` — returns caller's precise location including coordinates and postal code
- `rioHostNames { session event gateway }` — returns analytics endpoint configuration
- `__type` / `__schema` — full schema introspection

**Auth-required queries** return an `UNAUTHENTICATED` error. The error response for `me { uuid email firstName lastName }` includes the internal service name: `gdg-identity-dgs`.

**Sensitive mutations visible in schema** (require authentication to execute): `createPurchase`, `completePurchase`, `createMethodOfPayment`, `updateMethodOfPayment`, `deleteMethodOfPayment`, `cancelUserSubscription`, `pauseUserSubscription`, `resumeUserSubscription`, `updateEmail`, `updatePassword`, `forgotPassword`, `revokeDetention`, `swapDevicesActivationState`, `redeemB2ICoupon`.

Notable query fields beyond standard subscription/profile: `aiSolution`, `gptSolution`, `mathSolution` (AI tutor surface), `isIpManipulated` (proxy/VPN detection), `balance` (credit balance), `myPLAProjects`, `plaMyUserDocuments` (PLA = Practice Learning Assessment, a distinct product track), `devices` (device management for account sharing controls).

**bff.writing.chegg.com:** Separate Apollo Server instance for the writing product, not PerimeterX-protected. Accepts POST; returns 405 on GET. Introspection is disabled — a POST with `__schema` returns `{"errors":[{"message":"Internal Server Error","extensions":{"code":"GRAPHQL_VALIDATION_FAILED"}}]}`. The full API surface is reconstructable from operation names in the production bundle. The CORS allowlist includes a custom header: `wtEnableCLSandbox` — a feature flag activatable via HTTP request header rather than server-side assignment.

**Reconstructed operation surface from writing-main.js:**

- Paper management: `GetPaper`, `GetPapers`, `CreatePaper`, `UpdatePaper`
- Subscription lifecycle: `MySubscriptionsV1`, `ResumeUserSubscription`, `UndoCancelUserSubscription`, `UndoPauseUserSubscription`, `PreviewPurchase`
- Coupon automation: `SubscriptionAutoApplyCouponCache`, `CacheSubscriptionAutoApplyCoupon`, `autoApplyCouponByItemId`
- Auth: `SsoLogin`, `SsoSignup`, `Signup`, `GetEmailCode`, `PerformMfa`, `MfaStatus`, `RefreshToken`, `Logout`
- Billing: `TokenizeCreditCard`, `myMethodsOfPayment`, `UpdateMethodOfPayment`
- Analytics config: `RioHostNames` (dynamic endpoint discovery)
- Personalization: `productRecommendation`
- Cross-product: `hasActiveCheggStudy`

`hasActiveCheggStudy` reveals the writing BFF queries the core Chegg Study subscription state across service boundaries — for cross-sell or feature entitlement via a federated query to the subscription graph.

## Apollo Tracing in Production

Every GraphQL response from `bff.writing.chegg.com/graphql` includes a full `extensions.tracing` block. This is Apollo Server's legacy tracing feature (not the newer Apollo Studio telemetry), running in production with no auth gate.

Verified live:

```
POST https://bff.writing.chegg.com/graphql
Content-Type: application/json

{"query":"{ __typename }"}
```

Response:
```json
{
  "data": {"__typename": "Query"},
  "extensions": {
    "tracing": {
      "version": 1,
      "startTime": "2026-04-06T04:57:21.665Z",
      "endTime": "2026-04-06T04:57:21.666Z",
      "duration": 879569,
      "execution": {
        "resolvers": []
      }
    }
  }
}
```

For queries that hit actual resolvers, the `resolvers` array lists each by `path`, `parentType`, `fieldName`, `returnType`, `startOffset`, and `duration` in nanoseconds. A live test of the geolocation query returned resolver-level timing: `getLocationByIp` resolved in 9.39ms, scalar field resolution under 16µs each. This exposes the server's internal execution graph — which downstream services were called, in what order, and how long each took — to any unauthenticated caller.

Apollo tracing ships with Apollo Server 2.x and was deprecated in later versions. Its presence in production indicates the writing BFF has not been upgraded to a modern Apollo Server release, consistent with the nginx/1.14.0 (Ubuntu) backend and the legacy Adobe DTM tag manager also running on this subdomain. Three separate signals — old nginx, deprecated tag manager, legacy Apollo tracing — all point to a writing product stack that has not received significant infrastructure maintenance.

## Environment Sprawl

The production writing-main.js bundle (version `tag/v1.173.1`, commit `9c927adb9fc6186f15ae3d5dd3ba73e47c5a5fd4`) enumerates six distinct deployment environments:

| Environment | Pattern |
|---|---|
| Production | `chegg.com`, `cheggcdn.com` |
| Staging | `gateway.stage.chegg.com` |
| Test | `gateway.test.cheggnet.com`, `analytics.test.cheggnet.com`, `writing.test.cheggnet.com`, `auth-gate.test.cheggnet.com` |
| Dev | `gateway.dev.cheggnet.com` |
| Trunk | `trunk.live.test.cheggnet.com` |
| Release candidate | `rc.live.auth.test.cheggnet.com` |

Non-production environments use `cheggnet.com` as their external domain (distinct from production's `chegg.com`). The trunk environment (`trunk.live.test.cheggnet.com`) suggests trunk-based development with a continuous integration environment that mirrors production topology.

`writing.test.cheggnet.com` is publicly accessible with no authentication and no access controls beyond an `x-robots-tag: noindex` header. It returns the full writing product SPA (200 OK). On load it sets:

- `al_cell_writing=2020-04-01--main` (A/B cell, 10-year expiry, on `.cheggnet.com` domain)
- `al_ff={"allocationMap":{"al_cell_writing":"2020-04-01--main"},"bffEcs":true}` (10-year expiry)
- `BIBSESSIDPLAY` (test session cookie — note the `PLAY` suffix vs production `BIBSESSID`)
- OneTrust ID: `562d20a1-3c9d-4656-aa1f-300bf8baa4fc-test` (separate consent config, `-test` suffix)
- New Relic account 501278 (production uses 501356)

The server header on the test environment is `nginx/1.14.0 (Ubuntu)` — identical to production. The same nginx version runs both.

**Internal service discovery — `.chegg.services`:** The bundle exposes four internal Kubernetes or ECS service discovery hostnames:

- `http://digital-pricing-bff.prod.commerce.chegg.services/graphql`
- `http://digital-pricing-bff.test.commerce.chegg.services/graphql`
- `mfa.prod.identity.chegg.services/graphql`
- `mfa.test.identity.chegg.services/graphql`

The pricing BFF uses HTTP for intra-cluster communication — standard practice for service-to-service traffic within a Kubernetes cluster where TLS termination happens at the ingress. The naming conventions reveal the internal team/domain structure: `commerce` handles pricing, `identity` handles MFA. These hostnames are not externally routable, but their presence in the production JS bundle documents the cluster namespace structure and internal team organization.

## Bundle Intelligence

The writing bundle header embeds version and commit directly:

```
/*! Chegg Writing-Tools writing-frontend version tag/v1.173.1 commit 9c927adb9fc6186f15ae3d5dd3ba73e47c5a5fd4 */
```

This gives the semantic version tag, the full 40-character git commit SHA, and the internal project name (`writing-frontend`). The app-chunk.js also contains a GitLab repository path referenced in SSO authentication flow redirects — `gitlab.com/chegginc/learning-services/identity-access-management/est-identity/one-auth` — surfacing the internal org structure (inferred from JS bundle analysis, not independently verified via direct network request):

- GitLab org: `chegginc`
- Group: `learning-services`
- Subgroup: `identity-access-management`
- Project: `est-identity`
- Repo: `one-auth`

## Surveillance and Consent

**Pre-consent auto-accept.** On first load of www.chegg.com, the `OptanonConsent` cookie is set with all consent groups enabled and `interactionCount=0`:

```
OptanonConsent=...&groups=snc%3A1%2Cfnc%3A1%2Cprf%3A1%2CSSPD_BG%3A1%2Ctrg%3A1&interactionCount=0
```

All five consent categories — strictly necessary (`snc`), functional (`fnc`), performance (`prf`), Studybreak Media (`SSPD_BG`), and targeting (`trg`) — are pre-enabled before any user interaction with the consent banner. The banner is displayed, but all categories are already consented. Seven advertising networks and 17 third-party domains begin firing on the initial page load.

**Consent management:** OneTrust with domain script ID `562d20a1-3c9d-4656-aa1f-300bf8baa4fc`. OneTrust loads the IAB TCF stub (`tcf.stub.js`) and the Global Privacy Platform stub (`gpp.stub.js`) before the SDK itself, satisfying the IAB requirement to have consent framework stubs available before any CMP initializes.

**Full ad pixel inventory — confirmed active (network traffic observed):**

| Pixel | Cookie(s) | Network endpoint |
|---|---|---|
| Google Analytics 4 | `_ga_LP72BCS1B1` | `www.google-analytics.com/g/collect` |
| Google Ads / DoubleClick | `_gcl_au` | `ad.doubleclick.net`, `googleads.g.doubleclick.net`, `www.googleadservices.com` |
| Meta Pixel | `_fbp` | (cookie confirmed, `fbq` global present) |
| LinkedIn Insight Tag | — | `px.ads.linkedin.com/wa/` |
| Snapchat Pixel | `_scid`, `_scid_r` | (cookies confirmed, `snaptr` global present) |
| TikTok Pixel | `_tt_enable_cookie`, `_ttp` | (cookies confirmed, `ttq` global present) |
| Reddit Pixel | `_rdt_uuid` | `pixel-config.reddit.com` |
| Bing UET | `_uetsid`, `_uetvid` | (cookies confirmed) |

Additional trackers with confirmed network activity on the main site:

| Tracker | Network endpoint |
|---|---|
| HubSpot (4 cookies) | `api.hubapi.com`, `cta-service-cms2.hubspot.com` |
| Amplitude | `sr-client-cfg.amplitude.com`, `api2.amplitude.com/batch` |
| Adobe Launch | `assets.adobedtm.com` |
| PerimeterX | `collector-pxaotqiwnf.px-cloud.net` (4-5 req/page), `tzm.px-cloud.net` |
| AWS WAF SDK | `8e160f8e2012.edge.sdk.awswaf.com` (6+ telemetry req/page) |
| New Relic | `bam.nr-data.net`, `log-api.newrelic.com` |
| OneTrust | `cdn.cookielaw.org`, `geolocation.onetrust.com` |

Homepage: 60 total requests, 52 third-party, 17 third-party domains. /study page: 64 requests, 56 third-party, 17 domains (Google adds a second conversion event).

**PerimeterX and AWS WAF simultaneously.** Both run on the main site, generating telemetry to separate endpoints on every page load. Despite `_pxFirstPartyEnabled: true`, network capture confirms PX telemetry goes directly to `collector-pxaotqiwnf.px-cloud.net` — the first-party mode affects script delivery (`gateway.chegg.com/aOtQIWNf/init.js`) but not the telemetry collection endpoint. The fallback captcha references `captcha.px-cloud.net`.

**Cookie inventory — main site (first load, unauthenticated):**

| Cookie | HttpOnly | Description |
|---|---|---|
| `V` | No | Chegg visitor ID |
| `userData` | No | JSON auth state: `{"authStatus":"Logged Out","attributes":{"uvn":"..."}}` |
| `CVID` | No | Cross-Visit ID (RIO analytics) |
| `CSID` | No | Cross-Session ID (RIO analytics) |
| `_sdsat_authState` | No | Adobe satellite auth state |
| `_pxvid`, `pxcts` | No | PerimeterX session |
| `OTGPPConsent`, `OptanonConsent` | No | OneTrust consent state |
| `AMP_b187e8b991` | No | Amplitude session |
| `local_fallback_mcid`, `s_ecid`, `mcid` | No | Adobe Marketing Cloud IDs |
| `_rdt_uuid` | No | Reddit Pixel |
| `_gcl_au` | No | Google conversion linker |
| `_scid`, `_scid_r` | No | Snapchat Pixel |
| `__hstc`, `hubspotutk`, `__hssrc`, `__hssc` | No | HubSpot (4 cookies) |
| `_fbp` | No | Meta Pixel |
| `_uetsid`, `_uetvid` | No | Bing UET |
| `_tt_enable_cookie`, `_ttp` | No | TikTok Pixel |
| `_ga_LP72BCS1B1` | No | Google Analytics 4 |

Every cookie above is JavaScript-readable. None carry HttpOnly.

**Feature flag cookies (writing subdomain):**

- `al_cell=2023-11-13-wt-main-1-control` — A/B experiment cell. Format: `{YYYY-MM-DD}--{experiment}-{variant}`. Shows "wt-main-1" experiment started 2023-11-13; session is in control group. Set before consent. No HttpOnly. Expiry: 10 years (`Max-Age: 315360000`).
- `al_ff={"allocationMap":{"al_cell_writing":"2020-04-01--main"},"bffEcs":true}` — Feature flag map. `bffEcs:true` confirms the writing BFF runs on AWS ECS. Set before consent. No HttpOnly. Expiry: 10 years.
- `userRole=not_logged_in` — Auth state. Secure but no HttpOnly. Domain-wide (`.chegg.com`) — readable by JavaScript on any chegg.com subdomain.
- `BIBSESSID` — EasyBib session token. Correctly protected: Secure + HttpOnly.

**A/B testing:** Optimizely handles experiments. The SDK datafile is self-hosted on Chegg's own domain. The datafile SDK key `293KxffvUkJMLzB21vpMzE.json` appears in robots.txt as `Disallow: /*/293KxffvUkJMLzB21vpMzE.json` — blocking search crawlers from discovering the experiment configuration file, which contains all experiment definitions, feature flag assignments, and traffic allocations.

**Studybreak Media:** `gdpr.studybreakmedia.com/short-circuit-viewer-location.js` loads on the writing subdomain. Studybreak Media is a student-focused programmatic advertising network. The script name implies geo-detection to determine whether GDPR consent flows apply before any ad tech initializes. It also has its own consent category slot (`SSPD_BG`) in OneTrust — pre-enabled along with all others.

**Adobe Analytics — two generations:** The writing subdomain uses Adobe DTM (`assets.adobedtm.com`), deprecated by Adobe in 2020. The main site uses Adobe Experience Platform Launch (`_satellite.pageBottom()`), property "Chegg - New (DTM - 2020-04-27 16:59:00)", ID `PRf3f88a4c66524238b898fa6a5ee5e89b`, build date 2026-01-29, Turbine v29.0.0. Adobe migrated the main site to Launch in April 2020; the writing product was never updated.

**Custom analytics pipeline — RIO.** A proprietary event pipeline at `analytics.chegg.com`:

- `analytics.chegg.com/rio-service-web/rest/rio-events` — single event
- `analytics.chegg.com/rio-service-web/rest/rio-events/batch` — batch
- `analytics.chegg.com/visitor-session-id-service/web/csid` — cross-session identifier
- `analytics.chegg.com/visitor-session-id-service/web/cvid` — cross-visit identifier

The `RioHostNames` GraphQL operation in the writing BFF suggests analytics endpoints are configured dynamically per environment from a GraphQL query, not hardcoded. This means RIO ingestion endpoints can be swapped without a code deploy.

**New Relic:** Main site: application ID 578370295, license key `1fabaefecb`, reporting to `bam.nr-data.net` and `log-api.newrelic.com`. Writing subdomain: SPA agent (`nr-spa-1184.min.js`), account 501356, trust key 65366, reporting to `bam-cell.nr-data.net`. Two separate New Relic accounts for the two product lines.

## Writing Product — Acquisition Consolidation

`writing.chegg.com` consolidates four acquired citation tool brands under a single platform and auth system:

- **EasyBib** — primary brand; `BIBSESSID` session cookie carries the brand name
- **Citation Machine** — support path `/contactus/citationmachinesupport`
- **BibMe** — support path `/contactus/bibmesupport`
- **Cite This For Me** — support path `/contactus/citethisformesupport`

All four brands share the same session, auth flow, and subscription system. `BIBSESSID` is set on `.chegg.com` (not `.writing.chegg.com`), making the EasyBib session accessible across all Chegg subdomains.

The writing product routes file uploads through Zoho Creator: `/zoho/upload/v1/upload` and `/zoho/creator/upload/v1/upload`. Zoho Creator is a low-code platform — Chegg uses it for an internal workflow (likely plagiarism checker document submission or support ticket handling) rather than a native file storage service.

The auth API routes (`/api/auth/token`, `/api/auth/refresh`) run on `nginx/1.14.0 (Ubuntu)`. This is the application server handling session tokens for the writing product, not the CDN layer. The plagiarism API at `/plagiarism/api/v1.1/analyze-free` returns 403 without a valid `BIBSESSID` session cookie.

**Contentful markets.** Two Contentful OAuth app client IDs for distinct geographic markets:
- US: `rPj3JkDQuLhJSIjtD_IdXLR-NOInTbt2iT5exwBReQE`
- Mexico: `CPSpKTb1mmKtMKmo8M_f4QX0S6Ndb3dakH1RgimE-UI`

These are OAuth client IDs (public by OAuth design) but confirm Chegg operates separate Contentful spaces per market. The i18n config in runtimeConfig confirms `uniquePageCountries: ["US", "IN"]` — US and India are the two markets with distinct page variants.

## Machine Briefing

**Access tiers:**

| Tier | What's available |
|---|---|
| Open, no auth, no session | `bff.writing.chegg.com/graphql` (POST only) |
| Open, no auth | `writing.chegg.com/api/auth/token?client=wbe` (sets session cookies) |
| Open test environment | `writing.test.cheggnet.com` (full SPA, no auth gate) |
| Session required | `writing.chegg.com/plagiarism/api/v1.1/analyze-free` (needs `BIBSESSID`) |
| Browser + PX-cleared | `gateway.chegg.com/one-graph/graphql` (real browser, no Chegg account needed) |
| AWS WAF gated | `auth.chegg.com` |

**Acquire a writing session (no credentials):**

```
GET https://writing.chegg.com/api/auth/token?client=wbe
```

Returns cookies: `BIBSESSID` (HttpOnly, session token), `userRole=not_logged_in` (JS-readable), `al_cell` (A/B assignment, 10-year expiry), `al_ff` (feature flags, `bffEcs:true`). No request body or credentials needed.

**GraphQL — bff.writing.chegg.com (no auth, plain curl):**

```
POST https://bff.writing.chegg.com/graphql
Content-Type: application/json

{"query":"{ __typename }"}
```

Every response includes `extensions.tracing` with resolver timing. Introspection is disabled — construct queries from the operation names extracted from writing-main.js.

**Operation examples (writing BFF):**

```json
{"query":"query hasActiveCheggStudy { hasActiveCheggStudy }"}
{"query":"query RioHostNames { rioHostNames { session event gateway } }"}
{"query":"query productRecommendation { productRecommendation { id name } }"}
{"query":"query MySubscriptionsV1 { mySubscriptionsV1 { subscriptionId status } }"}
```

**GraphQL — one-graph (requires browser with PX-cleared session):**

```
POST https://gateway.chegg.com/one-graph/graphql
Content-Type: application/json
apollographql-client-name: landing-pages-contentful-ui
apollographql-client-version: 1.0.0
Cookie: [active chegg.com session cookies from browser]

{"query":"{ geolocation { countryCode city postalCode latitude longitude countryName isInEuropeanUnion } }"}
```

Returns caller IP geolocation without Chegg account. Introspection enabled — `{"query":"{ __schema { queryType { name } } }"}` returns full 1,436-type schema.

**Analytics events:**

```
POST https://analytics.chegg.com/rio-service-web/rest/rio-events
POST https://analytics.chegg.com/rio-service-web/rest/rio-events/batch
GET  https://analytics.chegg.com/visitor-session-id-service/web/csid
GET  https://analytics.chegg.com/visitor-session-id-service/web/cvid
```

**Test environment:**

```
GET https://writing.test.cheggnet.com/
```

Sets `BIBSESSIDPLAY` (note `PLAY` suffix, not `BIBSESSID`) on `.cheggnet.com` domain. New Relic account 501278. OneTrust ID `562d20a1-3c9d-4656-aa1f-300bf8baa4fc-test`.

**Enable writing tool content lab sandbox:**

```
POST https://bff.writing.chegg.com/graphql
Content-Type: application/json
wtEnableCLSandbox: true

{"query":"{ __typename }"}
```

**Gotchas:**

- `bff.writing.chegg.com/graphql` returns 405 on GET — POST only
- `gateway.chegg.com/one-graph/graphql` returns PerimeterX challenge HTML (not JSON) for non-browser callers — check `Content-Type` of response before JSON parsing
- `gateway.chegg.com/one-graph/graphql` requires `apollographql-client-name` header — missing it returns `code: MISSING_CLIENT_NAME_HEADER`
- `landing-pages-contentful-bff` currently returns 502 — do not rely on it
- `registry.chegg.com` and `oc-client/client.js` are offline — registry in maintenance mode
- `.chegg.services` hostnames are internal service discovery — not externally routable
- `al_cell` cookie format: `{YYYY-MM-DD}--{experiment_name}-{variant}` (double dash before experiment name, single dashes within)
- `BIBSESSID` is HttpOnly; `userRole`, `al_cell`, `al_ff`, `userData`, and all ad/analytics cookies are not — only the actual session token is JS-inaccessible
- Sitemap returns 403 from S3; Internet Archive is blocked entirely via robots.txt (`User-agent: ia_archiver / Disallow: /`)
