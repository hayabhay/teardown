---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Netspend -- Teardown"
url: "https://netspend.com"
company: "Netspend"
industry: "Finance"
description: "Prepaid debit card and account provider for unbanked consumers."
summary: "Two-layer architecture: a Faust.js/Next.js headless WordPress marketing site on WPEngine, fronted by Cloudflare CDN and F5 Volterra ADC over an Envoy proxy backend. The account application is a separate Next.js app served via AWS API Gateway. Three GTM containers manage tracking across marketing, app platform, and account center page contexts."
date: 2026-04-13
time: "01:49"
contributor: hayabhay
model: sonnet
effort: high
stack:
  - Next.js
  - Faust.js
  - WordPress
  - Cloudflare
  - F5 Volterra
  - AWS API Gateway
trackers:
  - Google Analytics
  - Google Ads
  - Facebook Pixel
  - AppsFlyer
  - Adobe Target
  - Adobe Audience Manager
  - mParticle
  - Rokt
  - Quantum Metric
  - Dynatrace
  - Talkdesk
  - Socure
  - Iovation
  - Effectiv
  - Bing Ads
  - TV Scientific
  - Yahoo Analytics
  - Oracle Maxymiser
  - GTM
tags:
  - fintech
  - prepaid-card
  - unbanked
  - cdp
  - ad-network
  - identity-resolution
  - a-b-testing
  - surveillance
  - multi-tenant
  - fraud-detection
headline: "Netspend's entire customer data platform routes through Rokt, an ad network -- every identity call and event batch for unbanked users hits advertising infrastructure."
findings:
  - "The mParticle CDP SDK is hosted at apps.rokt-api.com with all service endpoints hardcoded to Rokt's domain -- identity resolution, event batching, audience data, and SDK config all flow through Rokt's advertising infrastructure instead of mParticle's servers."
  - "Adobe Target's delivery API returns live A/B test configs with any arbitrary session ID -- three active experiments expose variant names, injected JavaScript, and the full attribution chain linking A/B arms to card order tracking."
  - "An unauthenticated config endpoint returns internal transfer limit tiers in cents, a fraud SDK key, Iovation fingerprinting URL, FIS CashEdge ACH URL, and partner service URLs with auth token template strings."
  - "Socure Digital Velocity fires three data collection endpoints when the signup page loads -- before the user has typed anything -- while the privacy notice at collection declares biometric information collection as 'No.'"
  - "None of Rokt, mParticle, Quantum Metric, AppsFlyer, Socure, or Effectiv are named in the privacy policy or notice at collection, despite all being active in the tracking stack."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

Netspend.com runs as two distinct applications sharing a domain. The marketing site is a headless WordPress installation on WPEngine's Faust.js framework, rendered by Next.js. Response headers identify the stack explicitly: `x-using: faust` and `x-nextjs-cache: HIT`. The WPEngine backend domain leaks in Set-Cookie headers -- `hty5mlngmpveak86818umbw7c.js.wpenginepowered.com` -- confirming WPEngine's hosting. GraphQL is available at `/graphql` but returns HTTP 400 ("Request Rejected") from a WAF rule.

In front of Next.js sits a two-layer CDN/proxy stack: Cloudflare handles CDN and WAF, while F5 Volterra ADC sits upstream -- `x-volterra-location: sv10-sjc` identifies the edge node in San Jose. The backend speaks through Envoy (`x-envoy-upstream-service-time` present on API responses).

The account application -- Account Center -- is a separate Next.js app served from `/account/login` and `app.netspend.com`, backed by AWS API Gateway with Lambda integration. It has a different stack, tracking configuration, and API surface from the marketing site.

Sitemaps are organized WordPress-style: `sitemap.xml?sitemap=pages.xml`, `posts.xml`, `categories.xml`, `faqs.xml`. SSL cert covers only `www.netspend.com` and `netspend.com`.

**Live subdomains:**
- `app.netspend.com` -- redirects to `/app/login`; AWS API Gateway backend
- `business.netspend.com` -- B2B portal
- `api.netspend.com` -- 403, exists but blocked
- `staging.netspend.com` -- 403, exists but blocked
- `dev.netspend.com` -- 403, exists but blocked
- `tax.netspend.com` -- AWS API Gateway, Next.js app, 403 unauthenticated
- `static.netspend.com` -- 403


## Rokt Routes the Customer Data Platform

Netspend uses mParticle as its Customer Data Platform -- a standard choice for financial services companies needing centralized event routing and identity resolution. The unusual part: the entire mParticle SDK stack is hosted and operated by Rokt.

Rokt is an advertising monetization network whose primary product is post-purchase upsell offers -- the subscription popups and "special offer" screens that appear after checkout on e-commerce sites. Routing a financial services CDP through an advertising company's infrastructure is atypical.

The mechanism is documented in GTM container GTM-53VGTT. Tag K4Z86 initializes mParticle with:

```
vtp_apiKey: "us2-a951f29a838c68498cc3fc2f3a1e7a43"
vtp_workspaceToken: "EB6FE0BF"
vtp_appName: "Ouro Global - NetSpend"
```

The initialization script loads from `apps.rokt-api.com/js/v2/us2-a951f29a838c68498cc3fc2f3a1e7a43/app.js` -- a full mParticle SDK build with all service endpoints hardcoded to `apps.rokt-api.com` instead of the standard `jssdkv2.mparticle.com`. Every call that would normally reach mParticle's servers reaches Rokt's:

- Identity resolution: `POST apps.rokt-api.com/identity/v1/identify`
- Event batching: `POST apps.rokt-api.com/webevents/v3/JS/...`
- Audience data: `POST apps.rokt-api.com/nativeevents/v1/`
- SDK configuration: `GET apps.rokt-api.com/tags/JS/v2/...`

The GTM container also loads a Rokt wrapper script (`apps.rokt.com/store/js/gtm_wrapper_init.min.js`) that fires `roktInitComplete` into the dataLayer, confirming bidirectional integration -- Rokt initializes mParticle, and mParticle events feed back into Rokt's system.

Tag T5MTV sends conversion events to Rokt with `vtp_hashRawEmail: true` and `vtp_identityTypeKey: "email"` -- when a user converts (orders a card), their hashed email is transmitted to Rokt.

During live session observation, the `mprtcl-v4_EB6FE0BF` localStorage key (using Rokt's workspace token as the key name) stored a persistent user identity object containing a client GUID, device application stamp, session MPIDs (base64-encoded mParticle user IDs), and current user MPID. This identity persists across sessions and links browsing behavior to a single profile in Rokt's advertising infrastructure.

Netspend's target customer base -- unbanked and underbanked consumers -- is the population least equipped to understand or contest how their financial product usage data flows through an advertising network's servers.


## Three GTM Containers, Three Tracking Stacks

Netspend deploys three GTM containers across different page contexts:

| Container | ID | Version | Tags | Paused |
|-----------|-----|---------|------|--------|
| Marketing site | GTM-WJCC9FP | v86 | -- | -- |
| App platform | GTM-53VGTT | v564 | 188 | 71 |
| Account Center | GTM-NQXKPD | v172 | 66 | 3 |

GTM-53VGTT at version 564 with 188 tags is a heavily iterated container. The 71 paused tags represent a graveyard of deactivated campaigns and vendors: Twitter Website Tags (two, B2B campaigns), Crazy Egg heatmaps, and Bizible (B2B attribution) are all present but paused.

Active trackers confirmed in GTM-53VGTT beyond what's visible at the network layer:
- **TV Scientific** (`tvspix.com`) -- connected TV attribution pixel, fires on page view and on `lead_generated` event with `orderId` and `lastTouchChannel`
- **Yahoo Analytics** (`sp.analytics.yahoo.com/spp.pl`) -- Yahoo DSP conversion tracking
- **Oracle Maxymiser** (`nsMaxymiser`) -- A/B testing and content optimization, separate from Adobe Target

GTM-NQXKPD (Account Center) adds Bing Universal Event Tracking (`bat.bing.com/bat.js`) and DoubleClick conversion tracking on the account/login pages -- meaning Microsoft's ad pixel fires for existing customers returning to log in.

The AID (Affiliate ID) system runs through GTM-WJCC9FP: it reads `?AID=` from URL parameters, stores it in `sessionStorage['aid']`, and propagates it to all signup form links on the page. On `/signup/` pages, AID is restored from session storage back into the URL. Adobe Target A/B tests use this chain to attribute card orders -- variant suffixes get appended to the `siteid` parameter within AID (e.g., `d_corp` becomes `d_corp_505_dda` for the DDA variant of experiment MRT505).


## Unauthenticated API Surface

The Account Center exposes a webapi layer, several endpoints of which return meaningful data without authentication:

| Endpoint | Auth Required | Returns |
|----------|--------------|---------|
| `GET /webapi/v2/configuration` | No | Transfer limits, SDK keys, internal service URLs |
| `GET /webapi/v1/branding` | No | Company name ("Ouro Global, Inc."), contact address, app URLs, support email |
| `GET /webapi/v1/authentication` | No | Auth method configuration |
| `GET /webapi/v1/status` | No | `{"success":true}` |
| `POST /webapi/v2/features` | No | Feature flag values (all false for unauthenticated) |
| `POST /webapi/v2/configuration` | No | Validation error (requires items array) |

`GET /webapi/v2/configuration` returns a flat JSON object that includes:

```
debitCardTransfer.limits: {
  pull.max.single.load: 100000,          // $1,000
  push.max.single.withdrawal: 100000,    // $1,000
  pull.max.24hour.load.amount.by.govt.id: 100000,
  push.max.24hour.withdrawal.amount.by.govt.id: 100000,
  pull.max.30day.load.amount.by.govt.id: 200000,   // $2,000
  push.max.30day.withdrawal.amount.by.govt.id: 200000,
  pull.max.7day.load.amount.by.govt.id: 200000
}

digital.intelligence.sdk.key: "db00d966-91d0-44df-8469-f39bf1c408d4"
iovation.url: "https://mpsnare.iesnare.com/snare.js"
cashedge.url: "https://transfers.fta.cashedge.com/popmmp/faces/base/"
adobe.launch.url: "//assets.adobedtm.com/c13e02fa3d3c/789c16738320/launch-bfb055b47b7c.min.js"
disability.insurance: "https://insurance.ouro.com/init"
tax.season2024: "https://tax.netspend.com/init"
tiles.directautoinsuranceenrollment.url: "https://insurance.ouro.com/init?authToken={{replaceAuthToken}}&product=auto"
tiles.rentersinsuranceenrollment.url: "https://insurance.ouro.com/init?authToken={{replaceAuthToken}}&product=renters"
tiles.clickToPay.url: "https://src.mastercard.com/profile/enroll?cmp=..."
static.web.assets.url: "https://static.netspend.com"
```

The `{{replaceAuthToken}}` template strings in the tile URLs confirm that the account dashboard injects auth tokens client-side for partner service redirects. The `digital.intelligence.sdk.key` is a client-side token for a fraud/behavioral intelligence SDK -- not a private API credential, but its exposure reveals which fraud vendor is in use and the specific account identifier. FIS CashEdge handles ACH transfers. Iovation (TransUnion) handles device fingerprinting. Both vendors are identified by their service URLs in this unauthenticated response.


## Adobe Target: Live A/B Tests Without Authentication

Adobe Target's delivery API accepts requests with any arbitrary session ID and returns full A/B test configurations:

```
POST https://netspendcorp.tt.omtrdc.net/rest/v1/delivery?client=netspendcorp&sessionId=any-value-here
```

Three live experiments were active at the time of investigation (April 2026):

**MRT505: GPR vs DDA on 5DF slide** (Activity ID: 310272)
Tests "GPR" (Get Paid Ready) vs "DDA" (Direct Deposit Account) product framing on the homepage carousel. The response includes two distinct CloudFront pixel endpoints for attribution (`d2wj6dt9lp7s3n.cloudfront.net/nts/net` and `d17l2501ex6l1t.cloudfront.net/nts/net`), with each variant firing to a separate endpoint using `type=GPR` or `type=DDA`.

**MRT496: AB test for blue mailer** (Activity ID: 309058, Experience: "Var A - Mailer")
A physical direct mail campaign A/B test. The variant modifies the signup form action URL to append `_496_mail` to the siteid parameter and routes to a `/mail/` path suffix. The injected JavaScript polls for `.slide2 .ns_leadgen-form` via `waitForElement()` with 500ms retry.

**MRT521: Delayed card order - test** (Activity ID: 314063)
Tests a delayed card order flow, appending `_delayed` to the siteid parameter when the user doesn't already have `_delayedCtrl` in their URL. Fires on `/signup/debitaccount`.

The response format reveals the backend: malformed requests return validation errors with full Spring MVC class paths -- `com.adobe.tnt.boxserver.rest.delivery.v1.DeliveryController` -- identifying Adobe Target's Java backend.

Each experiment delivers JavaScript injected into HEAD via `type: "customCode"` actions. The injection code is fully readable in the API response, including form mutation logic and attribution parameters.


## Surveillance Stack

**On homepage load (before any interaction):**

| Cookie | Vendor | Purpose |
|--------|--------|---------|
| `dtCookievf961nxf` / `dtPCvf961nxf` | Dynatrace | RUM session |
| `rxVisitorvf961nxf` / `rxvtvf961nxf` | Dynatrace | Visitor tracking |
| `at_check=true` / `mbox` / `mboxEdgeCluster` | Adobe Target | A/B test session |
| `_gcl_au` | Google | Click linker |
| `_ga` / `_ga_5LWJPM652E` | Google Analytics | GA4 session |
| `_fbp` | Facebook | Browser fingerprint |
| `afUserId` / `AF_SYNC` | AppsFlyer | Web attribution |
| `QuantumMetricSessionID` / `QuantumMetricUserID` | Quantum Metric | Session replay |

Quantum Metric is a full-session-replay platform -- every mouse movement, click, scroll, and keystroke on the page is captured and sent to `ingest.quantummetric.com` and `rl.quantummetric.com`. This fires on the marketing homepage without a consent prompt.

**Signup page -- Socure Digital Velocity:**

Three Socure DV endpoints fire when the signup page loads, before the user has typed anything:
- `ingestion.dv.socure.io` -- session window initialization
- `network.dv.socure.io` -- network capture
- `analytics.dv.socure.io` -- session data collection

Socure Digital Velocity is a fraud detection product that collects device signals, network behavior, and behavioral biometrics (keystroke dynamics, typing patterns, mouse movements) to build risk scores. All three endpoints activate on page load.

**Login page -- pre-authentication identity systems:**

Adobe Audience Manager fires `dpm.demdex.net` on the login page for returning customers -- the DMP call that syncs the browser's Adobe Audience Manager ID with third-party data segments.

`AMCV_55ED04E05FD126970A495FC2%40AdobeOrg` -- the Adobe Experience Cloud ID (ECID) cookie -- is set on the login page. This 2-year persistent cookie links the pre-login browser session to the full Adobe Experience Cloud stack (Analytics, Target, Audience Manager) before the user authenticates.

During investigation, `sessionStorage['effectiv_session_token']` was set by a script loaded from CloudFront (`d6oks8f65socs.cloudfront.net`) before any user authentication. The token is a JWT (`kid: f34b7f, alg: HS512`). Effectiv is a fraud prevention SDK that performs pre-authentication device and behavioral analysis.

**Network baseline (homepage):** 54 total requests, 2 first-party (Dynatrace beacons), 52 third-party across 11 domains.

`permissions-policy: browsing-topics=()` is set in response headers -- explicitly disabling the Topics API (Google's FLoC replacement). This doesn't affect the existing pixel and event tracking infrastructure.


## Privacy Disclosure Gap

The privacy notice at collection (`/help/notice-at-collection`) states: **"Biometric information: No"**

Socure Digital Velocity captures keystroke dynamics, typing patterns, and mouse movement as part of its behavioral risk scoring. Whether this constitutes "biometric information" under CCPA's definition (physiological, biological, or behavioral characteristics used to establish individual identity) is a legal classification question -- Netspend has answered "no." Socure's DV product documentation describes behavioral biometric capture as a core feature.

The privacy policy and notice at collection were searched for named disclosure of: Rokt, mParticle, Quantum Metric, AppsFlyer, Socure, and Effectiv. None of these vendors are named in either document.

Vendors confirmed active in the tracking stack that are absent from named disclosure:
- **Rokt** -- operates the CDP infrastructure, receives hashed email on conversion
- **mParticle** -- CDP layer (identity resolution and event routing), operated through Rokt
- **Quantum Metric** -- full session replay of all page interactions
- **AppsFlyer** -- web SDK and people-based attribution across sessions
- **Socure DV** -- device and behavioral data collection on signup
- **Effectiv** -- pre-authentication fraud/risk assessment
- **TV Scientific** -- CTV attribution pixel


## Multi-Tenant Architecture

Netspend's platform operates in multi-tenant mode, serving branded partner cards on shared infrastructure. GTM-53VGTT tag 126 inserts a `<meta name="x-tenant-id" content="app-playstationdebitcard-com">` tag, confirming that the PlayStation debit card runs on the same account platform with tenant routing.

The Murphy Oil card (`tiles.murphysoil.url` in the configuration endpoint) and potentially other partner cards are served through the same infrastructure. Transfer limits, fraud detection, and tracking configuration appear shared at the platform level.


## Machine Briefing

**Access:** Most of the site is publicly accessible. The marketing site is standard HTTP. The webapi layer is accessible without authentication for several endpoints. Adobe Target's delivery API accepts arbitrary session IDs.

### Endpoints

**Unauthenticated (open)**

```bash
# Platform configuration -- transfer limits, SDK keys, service URLs
curl https://www.netspend.com/webapi/v2/configuration

# Branding -- company info, contact details
curl https://www.netspend.com/webapi/v1/branding

# Auth method config
curl https://www.netspend.com/webapi/v1/authentication

# Health check
curl https://www.netspend.com/webapi/v1/status

# Feature flags (all false for unauthenticated)
curl -X POST https://www.netspend.com/webapi/v2/features \
  -H "Content-Type: application/json" \
  -d '{"items":["feature.name.here"]}'
```

**Adobe Target -- A/B test delivery (no auth)**

```bash
# Get live A/B test configurations for signup page
curl -X POST "https://netspendcorp.tt.omtrdc.net/rest/v1/delivery?client=netspendcorp&sessionId=recon-$(date +%s)" \
  -H "Content-Type: application/json" \
  -d '{
    "context": {"channel":"web","address":{"url":"https://www.netspend.com/signup/debitaccount/"}},
    "prefetch": {
      "views": [{"address":{"url":"https://www.netspend.com/signup/debitaccount/"}}]
    }
  }'

# Homepage experiments
curl -X POST "https://netspendcorp.tt.omtrdc.net/rest/v1/delivery?client=netspendcorp&sessionId=recon-$(date +%s)" \
  -H "Content-Type: application/json" \
  -d '{
    "context": {"channel":"web","address":{"url":"https://www.netspend.com/"}},
    "prefetch": {
      "views": [{"address":{"url":"https://www.netspend.com/"}}]
    }
  }'
```

Response includes `responseTokens` per variant with `activity.id`, `activity.name`, `experience.id`, `experience.name`. The JavaScript injection content for active variants is in `options[].content[].content`.

**GTM containers (public)**

```
https://www.googletagmanager.com/gtm.js?id=GTM-WJCC9FP  # Marketing site
https://www.googletagmanager.com/gtm.js?id=GTM-53VGTT   # App platform
https://www.googletagmanager.com/gtm.js?id=GTM-NQXKPD   # Account Center
```

**Rokt/mParticle SDK (public)**

```
https://apps.rokt-api.com/js/v2/us2-a951f29a838c68498cc3fc2f3a1e7a43/app.js
```

mParticle identity calls go to `apps.rokt-api.com/identity/v1/identify` with workspace token `EB6FE0BF`.

### Gotchas

- `POST /webapi/v2/features` requires a valid `items` array -- posting an empty body returns a validation error, not feature flags.
- Adobe Target's delivery API requires the `prefetch.views` structure with a `url` matching a configured view -- arbitrary mbox names return `NoGlobalMbox` validation errors (with full Spring MVC class path in the error message).
- The GraphQL endpoint at `/graphql` is WAF-blocked (HTTP 400 "Request Rejected").
- `api.netspend.com`, `staging.netspend.com`, and `dev.netspend.com` all return 403.
- The Rokt/mParticle identity endpoint requires the full mParticle identity payload format -- arbitrary requests will fail silently or return errors.
