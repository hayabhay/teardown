---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Zillow — Teardown"
url: "https://zillow.com"
company: "Zillow"
industry: "Real Estate"
description: "Residential real estate marketplace with listings, rentals, and mortgage services."
summary: "Next.js SSR frontend on CloudFront with Lambda@Edge bot challenges, Apollo GraphQL (blocked at 403), and Tealium tag management. Split.io manages 800 feature flags cached client-side. Hybrid infrastructure spans Google Cloud GKE clusters and an on-premises Delaware datacenter, with internal hostnames from both environments visible in client JavaScript."
date: "2026-04-12"
time: "21:22"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Next.js, Apollo GraphQL, CloudFront, Split.io, Tealium, PerimeterX]
trackers: [Google Analytics, Google Ads, DoubleClick, Facebook Pixel, TikTok Pixel, Reddit Pixel, Snapchat Pixel, Pinterest Tag, Microsoft Clarity, Microsoft UET, The Trade Desk, Teads, Datadog RUM, DataGrail, Sentry]
tags: [real-estate, ai-assistant, feature-flags, call-recording, mortgage, consent, infrastructure-exposure, split-io, voice-ai, surveillance]
headline: "Zillow caches 800 feature flags in every browser — exposing rollout plans for AI voice agents, call recording, mortgage funnels, and a consent-banner kill switch."
findings:
  - "800 Split.io feature flag definitions cache in every visitor's localStorage with full rollout percentages, traffic types, and condition logic -- exposing Zillow's product roadmap across 14 named systems including AI agents, mortgage funnels, and call recording."
  - "SIPREC enterprise call recording is at 100% rollout through the BOBA conversation platform -- both automatic and manual recording modes are fully deployed for agent-buyer phone calls."
  - "Six internal Kubernetes and datacenter hostnames leak into every page via __NEXT_DATA__, mapping two GKE clusters and a Delaware on-premises facility, alongside the visitor's real IP address in Apollo header state."
  - "ZILLOW_PRIVACY_COOKIE_BANNER is a Split.io flag set to 'off' server-side -- 33 tracking cookies from 9 ad networks fire before any user interaction, and only Zillow's own GA property has a consent gate."
  - "PEARL, Zillow's AI voice system, runs at 100% on their own zgvoice infrastructure (Twilio receives 0% traffic) for after-hours phone leads, with branded caller ID for outbound calls."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Zillow blocks curl from the first request -- `x-px-blocked: 1` in the response, `LambdaGeneratedResponse` from CloudFront, PerimeterX challenge before any content loads. The WAF requires a full headed browser session. What loads once you get through is a detailed picture of a company mid-transformation: a legacy Java backend still answering requests at `.htm` endpoints, a Next.js/Apollo frontend deployed on GKE, and an AI communications stack that's further along than anything in their public messaging.

---

## Stack

The homepage is a Next.js SSR application served via CloudFront and Lambda@Edge. The sub-app is named `hops-homepage` (build ID: `7bSNirKXOaSlaNKPaUMdE`, version: `hops-homepage.master.13586888.033d3ebd`), part of a micro-frontend architecture where different page types run as independent named sub-apps. The routing pattern `page: "/render/[...urlPath]"` is a catch-all that centralizes page rendering.

Apollo Client manages GraphQL on the client side (`__APOLLO_CLIENT__` global). The GraphQL endpoint (`POST /graphql`) returns 403 universally and is disallowed in robots.txt, but the URL and client configuration are visible in the page source.

Tag management runs through Tealium (`utag_data` data layer). Split.io handles feature flags, maintaining a persistent SSE connection to `streaming.split.io` for real-time flag updates. DataGrail is the consent management platform. Error tracking via Sentry (project `o168728.ingest.sentry.io`), real-time user monitoring via Datadog (`_dd_s` cookie, `__ddRumInitChecked` global). Zillow's own first-party analytics system (`ZillowAnalyticsObject`, `zanalytics`, `ZillowAnalyticsDataLayerObject`, `zga_data`) runs alongside GTM.

PubNub (`cdn.pubnub.com/sdk/javascript/pubnub.7.5.0.min.js`) powers real-time buyer-agent messaging in ZIM (Zillow Instant Messages). Keystone Events Service at `cs.zg-api.com/event` tracks discrete user actions: `hdp_contact`, `favorite`, `hdp`, `dwell`, `search`, `start_video`, `tour_start`, `tour_dwell`, `tour_pano_view`, `poi_typeahead`, `experiment_viewed`. The service returns `IllegalArgumentException` on invalid probes -- a Java backend.

A legacy `.htm` endpoint still answers: `GET /ajax/nav/UserNavAsync.htm` returns 200 with nav data. The JSP extension and a separate build identifier on legacy pages (`5.0.71488-master.779586c~qa,spring_4_pre.e9c88abe`) confirm a Java Spring backend running in parallel with the Next.js frontend.

PerimeterX sensor ID is `PXHYx10rg3`. The sensor loads from `collector-pxhyx10rg3.px-cloud.net` and `px-client.net`, with session tokens in cookies `_pxvid`, `pxcts`, `_px3`, `pxsid`, and `PXHYx10rg3_px_*`.

The robots.txt is notably AI-aware. AI crawlers (AI2Bot, Amazonbot, meta-externalagent, Applebot-Extended) get restricted access to blog, research, and engineering content only, with `Crawl-delay: 1`. CriteoBot, GumGumBot, ActiveComplyBot, and TaraGroup Intelligent Bot are fully blocked. The file also exposes internal endpoint patterns: `/ofr/api/v3/questionnaire` (Offers API), `/imf-fetch-message/api/v1/request/fetch-message/MOBILE_APP_UPSELL` (mobile upsell messages), `/jmp/questionnaire-eligibility-check`, `/jmp/lead-eligibility`, `/shopper-platform/`, `/personalization/`, and `/discovery/`.

---

## Internal Infrastructure Exposed in Client JavaScript

Every Zillow page serves internal infrastructure hostnames directly to browsers via `__NEXT_DATA__`. The `pageProps` object contains:

```
pfsHost: "http://page-frame-prod.int.zgcp-consumer-prod-k8s.zg-int.net"
s3sHost: "http://s3s.del.zillow.local"
```

Additional internal addresses appear in `appData.onsiteMessages.renderingProps` and `pageFrameData.bodyScripts`:

```
https://cms-bedrock-prod.int.zgcp-consumer-prod-k8s.zg-int.net/krang/
http://community-data.del.zillow.local:80
http://keystone-int-api.del.zillow.local/messages
http://web-platform-router.int.zillow-prod-k8s.zg-int.net
```

Two infrastructure environments are visible. The `zgcp-consumer-prod-k8s.zg-int.net` and `zillow-prod-k8s.zg-int.net` hostnames are GKE production clusters on Google Cloud. The `*.del.zillow.local` addresses are on-premises -- `del` almost certainly refers to a Delaware datacenter. Services mapped:

| Hostname | Service |
|----------|---------|
| `page-frame-prod` | Global nav/footer ("page frame service") |
| `s3s` | Internal S3 proxy (HTTP, port 80) |
| `cms-bedrock-prod` | CMS backend with `/krang/` path (Krang is a WordPress plugin) |
| `community-data` | Neighborhood and community data |
| `keystone-int-api` | Internal messaging API |
| `web-platform-router` | Platform routing layer |

These are not externally reachable -- `.local` domains don't resolve outside the internal network, and the GKE internal hostnames require cluster-internal routing. But their presence in every page response maps Zillow's internal network topology to any observer: two parallel production Kubernetes clusters, at least one on-prem facility, and the names of six internal services.

Also in `__NEXT_DATA__`: the visitor's real IP address. The Apollo header state stored in `pageProps` includes `x-client-ip` with the actual public IP of the requesting browser. This is a server-side SSR artifact -- the Node.js rendering layer captures the incoming IP for server-side GraphQL requests and serializes it into the page state object, making it accessible to any client-side JavaScript.

One additional exposure: `/.well-known/security.txt` returns an S3 `NoSuchKey` error rather than a 404, confirming the `.well-known/` path maps directly to an S3 bucket with no application-layer override.

---

## Surveillance and the Consent Architecture

Zillow runs DataGrail as a Consent Management Platform with US Privacy/GPP support (`__gpp` global). No consent banner loads for US users. This is not an oversight -- it is a feature flag.

The server-side GTM initialization script evaluates a specific Split.io flag and writes it to `window.GTM_EXPERIMENTATION`:

```javascript
const CLIENT_ACCESSIBLE_FLAGS = ["ZILLOW_PRIVACY_COOKIE_BANNER"];
// Evaluated server-side, written to client:
{ "ZILLOW_PRIVACY_COOKIE_BANNER": "off" }
```

`ZILLOW_PRIVACY_COOKIE_BANNER: "off"` is the server-assigned value for US users. The consent banner's absence is a product decision, controllable per-session via Split.io's traffic allocation -- a flag that could be turned on for specific geographies, user segments, or traffic percentages at any time.

Before any user interaction, 33 cookies are set across 9 ad networks and tracking platforms:

**Zillow first-party:** `zguid` (persistent user GUID), `zjs_anonymous_id`, `zg_anonymous_id`, `zjs_user_id_type: "encoded-zuid"`

**PerimeterX:** `_pxvid`, `pxcts`, `_px3`, `pxsid`

**Google:** `_ga`, `_gid` (Analytics), `_gcl_au` (Ads conversion linking), `DoubleClickSession`

**Facebook:** `_fbp` (observed value: `fb.1.1776027474112.61692584612057054`)

**TikTok:** `_tt_enable_cookie`, `_ttp`, `ttcsid`, `ttcsid_CN5P33RC77UF9CBTPH9G`

**Reddit:** `_rdt_uuid`

**Snapchat:** `_scid`, `_scid_r`, `_sctr`

**Pinterest:** `_pin_unauth`

**Microsoft:** `_uetsid`, `_uetvid` (Bing UET), `_clck`, `_clsk` (Clarity)

**DataGrail:** `datagrail_consent_id`, `datagrail_consent_id_s` -- the CMP's own consent IDs, set before any consent is given

**Datadog:** `_dd_s`

On the network side, the homepage fires 8 Google Floodlight/GMP conversion events, 6 DoubleClick activity tags (categories: `visit`, `homepage`, `universal`), PerimeterX telemetry to `px-cloud.net`, Pinterest pixel, Microsoft Clarity, Reddit pixel, The Trade Desk (`insight.adsrvr.org`), and Teads video ad network (`cm.teads.tv`, `t.teads.tv`). All fire on page load.

DataGrail does gate one thing: `scripts.zganalytics.init` checks the `datagrail_consent_preferences_s` cookie for `dg-category-functional:1` before firing `UA-21174015-56` -- Zillow's own GA property. This conditional applies only to Zillow's property. Facebook, TikTok, Reddit, Snapchat, Pinterest, Microsoft, Trade Desk, Teads, and DoubleClick have no equivalent check. They fire unconditionally.

Cross-domain tracking between zillow.com and trulia.com is configured: `allowLinker: true` is set in the UA initialization (`ga("create","UA-21174015-56","auto",{allowLinker:true})`). Zillow acquired Trulia in 2015 and both properties remain active.

The auth configuration embedded in the registration form (`pageFrameData.reg`):

```json
{
  "facebookAppId": "172285552816089",
  "googleClientId": "238648973530.apps.googleusercontent.com",
  "signInWithAppleEnabled": true,
  "is2faOn": false,
  "emailValidationEnabled": true,
  "verifyOnRegisterTreatment": "CONTROL"
}
```

`is2faOn: false` -- two-factor authentication is disabled by default for a platform that handles mortgage applications, saved payment methods, and sensitive financial data.

---

## 800 Feature Flags in Every Browser

Split.io's JavaScript SDK caches all flag definitions client-side in `localStorage`. For Zillow, that means 800 complete flag objects -- not just treatment assignments, but the full SDK configuration: rollout percentages, traffic types (generic/guid/ZUID), condition logic, WHITELIST segments, and partition sizes. Any browser that loads any page has the full flag set.

Traffic type breakdown: 509 `generic` (keyed by anonymous ID), 142 `guid` (persistent user GUID), 127 `Zuid` (Zillow User ID -- logged-in users), 22 `fixedid`.

The 14 major product namespaces:

| Prefix | Count | Description |
|--------|-------|-------------|
| OMP | 56 | On-Market Placement -- ad placement testing |
| ZHL | 50 | Zillow Home Loans |
| ZIM | 42 | Zillow Instant Messages |
| TAS | 35 | Touring & agent scheduling |
| SELLER | 33 | Seller platform |
| ZILLOW | 20 | Cross-cutting platform flags |
| CIAM | 19 | Customer Identity & Access Management |
| ELE | 18 | Advertising (`ELE_ADS_WEB_*`) |
| PEARL | 18 | AI voice/communications |
| SXP | 15 | Search experience |
| METRO | 14 | Market/metro agent management |
| ARCS | 13 | Unknown |
| BOBA | 12 | Conversation processing |
| MISO | 11 | Marketplace intelligence/seller orchestration |

### Placement Testing (OMP)

56 flags cover every page surface on the site -- homepage hero and banner, for-sale HDP main CTA buttons, media wall, photo gallery, end of gallery, merchandising, mobile web footer, off-market HDP top/bottom/right rail, owner dashboard top/bottom, search results variants. Specific tests visible:

- `OMP_WEB-OMDHP-RR_SHOWCASE-NO-ZILLOW-TEST` -- testing Showcase listings without Zillow branding
- `OMP_WEB-OMDHP-RR_SHOWCASE-EASE-SPEED-3-MINUTE-TEST` -- testing "3-minute" speed messaging on Showcase CTAs
- `OMP_WEB-OMDHP-RR_CASH-OFFER-LISTING-SOON-VISUAL-PROMINENCE-*` -- cash offer visual prominence variants
- `OMP_FSHDP-TOP_ZHL-PRE-QUAL-SINGLE-CTA-PRE-APPROVAL-TEST` -- mortgage pre-approval CTA consolidation

### Mortgage Funnel (ZHL)

50 flags instrument the full Zillow Home Loans acquisition path. `ZHL_BUYABILITY_*` is a flag family with sub-variants: chip, price_search, preapproval, on-chip, phase-II. "Buyability" -- purchasing power integrated directly into search -- is a platform-level concept being tested across many entry points. `ZHL_PRE_APPROVAL_PLAID` ties Plaid bank verification into the pre-approval flow. `ZHL_LOP_LOAN_COMPARISON` instruments a Loan Options Page with comparison features.

### Touring False Door Tests

`zrm-touring-false-door-test` is at `ROLLOUT [('off', 90), ('on', 10)]` -- 10% of users see a touring feature that may not yet exist. False door tests measure demand before building; the feature behind this button may be nothing more than a signup form. `zrm-touring-false-door-test-v2` is `ROLLOUT [('off', 100), ('on', 0)]` -- fully off, suggesting the first round collected enough signal.

### Post-NAR Settlement

`MISO_NAR_FEE_RANGES_FF` is ACTIVE. Following the 2024 NAR settlement requiring commission transparency, this flag controls commission range display in the seller/marketplace platform. What exactly is displayed -- and whether buyer agent commissions appear in search results -- could not be determined from static flag analysis.

### Other Signals

- `SELLER_COPILOT_ACCESS_FF` -- WHITELIST-only (restricted). `AB_COPILOT` has a broader rollout. A copilot product exists for sellers.
- `SXP_AZEROTH_SEARCH_BOX` -- "Azeroth" (a World of Warcraft reference, likely an internal codename) is active in SSR flags for a search UI variant.
- `SXP_MULTIPLAYER` and `web_multiplayer_collections` are active -- collaborative/shared home search sessions.
- `ZIM_DEEP_RESEARCH_EXPERIMENT` -- WHITELIST-only, no rollout percentage. Early-stage experiment in the messaging platform.
- `zrm-ai-listing-description` -- ACTIVE with WHITELIST condition, limited to specific listings or agents. AI-generated listing descriptions.

---

## AI Architecture: VOYAGER, ALAN, and PEARL

Three distinct AI systems operate across Zillow, connected through a shared conversation processing layer called BOBA.

### VOYAGER -- Consumer AI Search

`AI_VOYAGER_ALL` is at `ROLLOUT [('off', 60), ('on', 40)]`, with additional WHITELIST conditions for internal users. Separate surface flags control each touchpoint: `AI_VOYAGER_WEB`, `AI_VOYAGER_WEB_SEARCH_BOX`, `AI_VOYAGER_WEB_SRP`, `AI_VOYAGER_WEB_HDP_CONTEXTUAL_INGRESS`, and `AI_VOYAGER_WEB_NFS_HDP_CONTEXTUAL_INGRESS` (NFS = Not For Sale). iOS mirrors: `AI_VOYAGER_IOS`, `AI_VOYAGER_IOS_AUTOCOMPLETE`, `ai_voyager_ios_hdp`. Android: `AI_VOYAGER_ANDROID`, `AI_VOYAGER_ANDROID_SRP`, `AI_VOYAGER_ANDROID_AUTOCOMPLETE`.

The capability flags reveal the system's architecture:

- `VOYAGER_AGENT_QUEUE_WORKER` and `VOYAGER_AGENT_QUEUE_WORKER_ZUID` -- async agent queue keyed by Zillow User ID, suggesting agentic task execution against user sessions
- `VOYAGER_PREF_RELAXER` -- automatically relaxes search constraints when strict criteria return no results
- `VOYAGER_QU_RULE_BASED_PATH` -- toggles between rule-based and ML query understanding
- `VOYAGER_SKILL_PREDICTION` -- ML routing to predict which search capability to invoke
- `VOYAGER_SMART_RECALL` -- persistent memory of prior search context across sessions
- `VOYAGER_AGENT_CONTEXT_UPDATE_TRIGGER` -- triggers context updates for the agent

This is a skill-based agentic system with query understanding, preference relaxation, and persistent memory, running live for roughly 40% of Zillow's user base. This session was assigned the "off" treatment, so the actual interface could not be observed.

### ALAN -- Communications AI Agent

ALAN handles buyer-facing communications after initial search:

- `AlanCommunicationsRelayMessageProcessor` -- processes relay messages between parties
- `AlanPreferences_AutoAccept_Trial` -- auto-accepts tour requests (ACTIVE, appears to be a trial)
- `ENABLE_NUDGE_ALAN_SMS` -- sends SMS nudges to users
- `GTI_ELEVATING_ALAN_INLINE_TOUR` / `GTA_ELEVATING_ALAN_INLINE_TOUR` -- handles tour scheduling inline on listing pages
- `ZIM_BACKEND_ALAN_ENABLEMENT_VIA_OPEN_FGA` -- authorization model uses Open FGA (Okta's Fine-Grained Authorization, CNCF project)
- `HOPS_ELEVATING_ALAN_AA` -- active on the homepage sub-app

`Bundled_ElevatingAlan_HDP-ProdComms-Homepage` is at `ROLLOUT [('off', 0), ('on', 100)]` -- ALAN is fully deployed across Home Detail Pages, production communications, and the homepage.

BETH is a related entity handling buyer/renter tour management: `ANDROID_BETH_RSVP_IN_TMP_AND_ZIM`, `BE_BETH_RSVP`, `ZIM_BETH_MYAGENT_TOUR_RO`. Data flows from BETH into ALAN via `PEARL_ENABLE_BETH_INFO_TO_ALAN` and `BOBA_BETH_ALAN_CONNECTION_SBA`.

### PEARL -- AI Voice Infrastructure

PEARL handles phone-based lead response:

- `PEARL_AI_VOICE_OBH_PHONE_LEADS_2` -- Out of Business Hours AI voice at `ROLLOUT [('off', 0), ('twilio', 0), ('zgvoice', 100)]`. Zillow built or acquired its own voice infrastructure; the Twilio treatment exists as a flag value but receives 0% traffic.
- `PEARL_BRANDED_CALLER_ID` -- outbound calls display Zillow or partner branding
- `PEARL_ENABLE_AI_AGENT_VALIDATION` -- AI agents validated before handling calls
- `PEARL_ENABLE_RTT_HOLIDAY_OPERATION` -- real-time tour scheduling operates on holidays
- `PEARL_PEARL_AGENT_ZGGRAPH_INTEGRATION` -- PEARL agents connect to ZGGraph (Zillow's internal knowledge graph)
- `pearl_sms_to_persona` -- SMS messages routed to user personas
- `pearl_sms_zuid_to_zim` -- SMS from logged-in users routed to ZIM messaging
- `pearl-unification-states` -- states being progressively migrated into Pearl

### BOBA -- Conversation Processing Layer

BOBA orchestrates conversations across all channels:

- `BOBA_LANDLORD_RENTER_CONVERSATION_SBA` -- landlord-renter conversation handling
- `BOBA_RENTALS_CONVERSATION_PROCESSING` -- rentals-side processing
- `BOBA_ASYNC_RTT_MISSED_OPPORTUNITY_SMS` -- SMS outreach for missed real-time tour opportunities
- `BOBA_LOCALIZED_PHONE_NUMBER` -- per-market phone number assignment
- `BOBA_FIND_LO_BY_FIND_PRO_ORCHESTRATOR` -- loan officer discovery via the Pro platform
- `BOBA_VOICE_RECORDING_IMPORT` -- voice recording ingestion

### SIPREC -- Call Recording at Scale

Two flags control call recording: `BOBA_PA_SIPREC_EXPERIMENT` and `BOBA_PA_MANUAL_SIPREC_EXPERIMENT`. Both at `ROLLOUT [('off', 0), ('on', 100)]`. SIPREC (RFC 7866) is the IETF standard protocol for recording SIP-based VoIP calls -- it forks call media to a recording server in real-time. The "PA" prefix likely refers to Personal Agent. Both automatic and manual recording modes are fully deployed.

`BOBA_VOICE_RECORDING_IMPORT` handles ingestion of recordings, suggesting they are processed downstream -- likely for AI training, quality assurance, or improving ALAN and PEARL. Whether call recording disclosure is provided to both parties in all applicable jurisdictions cannot be determined from flags alone.

### Elise AI Partnership

A GA payload on a legacy endpoint contains `RC_ELISE_AI_PARTNERSHIP.TEST`. Elise AI is a real company -- an AI leasing assistant for multifamily properties. The flag suggests Zillow is testing an Elise AI integration on rental listings. This could not be verified from saved evidence files; treat as inferred.

---

## Open Threads

- **VOYAGER interface**: This session landed in the 60% "off" cohort. The actual VOYAGER AI search interface is running for 40% of users but could not be observed.
- **MISO NAR fee ranges**: The post-NAR settlement commission display flag is ACTIVE. Whether it surfaces buyer agent commissions in search results requires an SRP investigation with the flag in the "on" treatment.
- **SIPREC disclosure**: Whether buyers and sellers are notified that calls are recorded via SIPREC could not be determined from static flag analysis -- it would require an actual agent-connected call flow.
- **Trulia cross-domain tracking**: `allowLinker: true` is confirmed in UA initialization. The specific `ga("linker:autoLink",["trulia.com"])` command was observed on a legacy endpoint but no saved evidence file covers it directly.

---

## Machine Briefing

### Access & Auth

Zillow uses PerimeterX (sensor `PXHYx10rg3`) blocking all non-browser clients from the first request. `curl` returns HTTP 403 with `x-px-blocked: 1`. Headed Playwright passes the initial challenge. Session maintained via `_px3`, `pxsid`, and related cookies. Even with a valid session, GraphQL requests return 403.

Anonymous session endpoints (valid PerimeterX cookies required):
- Homepage, SRP, and HDP pages via standard browser navigation
- `GET /ajax/nav/UserNavAsync.htm` -- legacy nav, returns user state JSON
- `mortgageapi.zillow.com` -- no PerimeterX protection, sitemap accessible
- Feature flags readable from `localStorage` after any page load

### Endpoints

```
# Robots.txt (open, no auth)
GET https://www.zillow.com/robots.txt

# Mortgage subdomain sitemap (no PerimeterX)
GET https://mortgageapi.zillow.com/sitemap.xml

# Legacy nav (requires browser session)
GET https://www.zillow.com/ajax/nav/UserNavAsync.htm

# Keystone Events (Java backend, returns 400 on invalid input)
POST https://cs.zg-api.com/event

# Zillow RUM (first-party telemetry)
POST https://e.zg-api.com/

# Split.io SSE (real-time flag updates, visible on SRP)
GET https://streaming.split.io/sse?channels=...&v=1.1&heartbeats=true
```

Feature flags from `localStorage` (after any page load):

```javascript
// All 800 flags under SPLITIO.split.{FLAG_NAME} keys
// Double-encoded: parse twice
JSON.parse(JSON.parse(localStorage.getItem("SPLITIO.split.AI_VOYAGER_ALL")))
```

Internal service addresses (not externally reachable):

```
http://page-frame-prod.int.zgcp-consumer-prod-k8s.zg-int.net
http://s3s.del.zillow.local
https://cms-bedrock-prod.int.zgcp-consumer-prod-k8s.zg-int.net/krang/
http://community-data.del.zillow.local:80
http://keystone-int-api.del.zillow.local/messages
http://web-platform-router.int.zillow-prod-k8s.zg-int.net
```

### Gotchas

- **Double-encoded flags**: Split.io flag values in `localStorage` are strings containing escaped JSON. `JSON.parse` once gives a string; `JSON.parse` again gives the object.
- **Flag treatment vs. rollout**: The `treatment` value is this session's assignment -- not the rollout percentage. Rollout percentages are in `conditions[].partitions[].size`.
- **GraphQL fully blocked**: `POST /graphql` returns 403 regardless of session or headers.
- **PX rechallenges**: PerimeterX issues new challenges mid-session on certain navigation patterns. Sessions degrade without warning.
- **Disallowed paths enforced**: `/api/`, `/graphql/`, `/personalization/`, `/shopper-platform/`, `/discovery/` are blocked by application logic, not just robots.txt.
- **mortgageapi.zillow.com**: Root returns 404 but sitemap is accessible -- only the sitemap path works.
