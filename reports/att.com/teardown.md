---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "AT&T — Teardown"
url: "https://att.com"
company: "AT&T"
industry: "Information"
description: "US wireless, broadband, and streaming service provider."
summary: "att.com is a Next.js SSR microfrontend routed through Akamai, which assigns A/B variants at the CDN edge before rendering. An internal experiment platform (IXP) bakes full feature flag sets into server-rendered HTML. The surveillance stack runs 14 trackers, a real-time CDP via Adobe Experience Platform, Dynatrace RUM with enumerated custom dimensions, and Neustar/Fabrick anonymous identity resolution on every visitor."
date: "2026-04-15"
time: "23:56"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack:
  - Next.js
  - Akamai
  - Adobe Experience Platform
  - Google Tag Manager
  - Dynatrace
trackers:
  - Google Tag Manager
  - Google Ads
  - DoubleClick
  - Adobe Analytics
  - Adobe Target
  - QuantumMetric
  - Microsoft Clarity
  - Dynatrace
  - Invoca
  - Neustar Fabrick
  - Adobe Audience Manager
  - Oracle Infinity
  - Verint ForeSee
  - Flashtalking
tags:
  - telecom
  - ai-chatbot
  - experiment-flags
  - identity-graph
  - cross-domain-tracking
  - session-replay
  - openai
  - agentic-ai
  - microfrontend
  - surveillance
headline: "A public endpoint returns AT&T's full AI search config -- OpenAI model assignments per query type, 26 feature flags, and the complete agentic roadmap."
findings:
  - "A public, unauthenticated endpoint at /search/msapi/genAIConfig returns the complete AI search backend: GPT-4o as the default model, GPT-4-turbo for billing and device upgrade queries, and 26 IXP feature flags -- all enabled -- mapping out the full AI product roadmap including Spectra agentic answers."
  - "44 ANDI chatbot experiment flags in sessionStorage expose the full AI assistant architecture -- Spectra agentic end-to-end flows are fully built and silently disabled, while Apple Pay in chat is already active."
  - "Every att.com homepage response sets a 6-year session cookie on directv.com at the Akamai edge -- visitors are enrolled in AT&T's experiment system on DirecTV's domain without ever visiting it."
  - "ANDI logs every page the visitor navigates to in sessionStorage and ships the full browsing history to the chat backend on first interaction, giving the AI personalization context before the user types a word."
  - "Verint runs two invisible struggle-detection surveys that fire based on real-time behavioral scoring with no visible prompt -- styled as ghost surveys that auto-close."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

AT&T's main site runs on a Next.js SSR microfrontend shell called `marketing-nx-ui`, routed through Akamai's CDN. The architecture exposes more internal detail than most sites of this scale: build version, release branch, and build timestamp are all available in `window.appinfo` on every page load (`2026.4.131943 | release/26.04.15.REL.UFUI | April 13, 2026 at 12:43:29 PM PDT`). The environment name (`window.environment = "prod"`) and possible authentication states (`window.USER_TYPE = ["VISITOR", "CUSTOMER"]`) are also globals. An internal CMS API error surfaces the service name: `cms-services-feedgenerate-nodems`.

The homepage delivers 120 requests -- 24 first-party, 96 third-party across 20 domains. The wireless plans page adds Google Ad Manager (`securepubads.g.doubleclick.net/gampad/ads`) on top of the baseline, running programmatic ads on AT&T's own purchase funnel. The `robots.txt` is 601 lines and a useful map of internal systems: FCC redress portals (`/redressG/`, `/redressH/`, `/redressT/`, `/redressC/`) are blocked from crawlers, legacy account management paths under `/olam/` are explicitly disallowed, and `/buy/login` issues a 301 to `attfraud.custhelp.com/app/mobility/blocked_call_claim` -- a fraud reporting portal.

## The IXP Experiment Platform

AT&T runs an internal experiment platform called IXP. Variant assignment happens at the Akamai edge, before Next.js renders -- the assigned variant appears in the `ixp-exp-flags` response header on every request:

```
ixp-exp-flags: exp-w6694752-ol-ab-test-sales-marketing-homepage=control-homepage
```

The homepage currently has five active variants: `control-homepage`, `variant1-homepage-c`, `variant2-homepage-d`, `variant3-homepage-e`, and `variant4-homepage-f`. Every fresh request returns one.

The full global navigation feature flag set is baked into the SSR HTML and written to `sessionStorage.meganav-featureflags` -- readable from page source without any authentication. The IXP REST endpoint (`/msapi/ixp-allocation-manager-service/v1/allocations`) returns `{"allocations":{}}` for fresh sessions; the actual flag state is in the HTML, not the API.

One flag in the baked set references an undisclosed product name: `cfg-cart-instant-checkout-title: "AT&T OneConnect in your cart"`. The cart checkout flow routes to `/buy/purchaseorder/instantcheckout`.

## ANDI: AT&T's AI Chatbot

ANDI (AT&T Natural Digital Intelligence) is AT&T's AI assistant. The full experiment flag set for the chat system -- 44 flags -- is available in sessionStorage under `expFlags`. Together they provide a complete picture of the current chat architecture and what's staged but not yet launched.

**What's active:**
- FusionUI interface: `exp-chat-fusionui-enabled=variant1-enable-fusionui-exp`
- Google Dialogflow NLU backend: `exp-chat-fusionui-dialogflow=variant1-enable-fusionui-df`
- LLM intent classifier: `exp-fusion-classifier-type=variant1-llmclassifier`
- Personalization, citations, disambiguation, organic results, agent escalation -- all enabled
- Genesys voice routing for live agent transfer: `exp-disable-voice-to-genesys-auth-flow=variant1-enable-voice-to-genesys-auth-flow`
- Co-browse session capability: `exp-disable-cobrowse-session=variant1-enable-cobrowse-session`
- Apple Pay button in chat: `exp-display-andi-app-applepay-button=variant1-display-applepay-button`
- Mobile web enabled; desktop web disabled: `exp-chat-fusionui-web=control-disable-fusionui-web`
- App version: `exp-chat-flagship-appversion=variant1-version-2026-3-0`
- "Halo" context handler (conversation context management): `exp-haloc-handler=variant1-newhalo`

**What's staged but disabled:**
Two flags both read `control-aam`, meaning the "disable" flags are in their control (default-off) state -- the features are currently inactive:

```
exp-disable-andi-spectra-agentic-e2e-flow=control-aam
exp-disable-andi-spectra-agentic-e2e-flow-fusion=control-aam
```

"Spectra" is AT&T's agentic AI framework -- end-to-end automated flows. Both the base and FusionUI variants are fully staged and waiting. A separate search flag, `svc-search-ixp-answer-spectra: true`, shows Spectra-powered answers are already active in the search experience.

Also staged but inactive: `exp-enable-smb-nuance-flagship=control-disable-nuance-exp` -- a Nuance-branded SMB chat experience, separate from ANDI.

**Session browsing history in chat:**

ANDI accumulates a log of every page visited in the current session in `sessionStorage` under `chatStorageDataObj.pageChatUrlListImpression`. When a user opens the chat, this full URL history ships with the first interaction along with the user's Adobe MCID, giving the backend personalization context before the user types anything. An observed session history: `["https://www.att.com/","https://www.att.com/internet/fiber/","https://www.att.com/wireless/","https://www.att.com/plans/wireless/","https://www.att.com/support/","https://www.att.com/support/search/"]`.

## GenAI Search: Powered by OpenAI

AT&T's support search is AI-powered, and the full configuration is available at a public unauthenticated endpoint:

```
GET https://www.att.com/search/msapi/genAIConfig
```

The response includes:
- `"gptVersion": "gpt-4o"` -- default search AI model
- `"customGPTVersion": {"addOn": "gpt-4o", "billing": "gpt-4-turbo", "deviceUpgrade": "gpt-4-turbo"}` -- billing and device upgrade queries route to GPT-4-turbo

The disclaimer on the search page reads: *"This answer was generated using Artificial Intelligence."* The underlying provider is not named.

The config also returns 26 IXP feature flags, all with `"value": "true"`, along with their expiry dates -- a readable feature roadmap:

| Flag | What it enables |
|------|-----------------|
| `svc-search-ixp-answer-spectra` | Spectra agentic answers in search |
| `svc-search-ixp-intent-classifier` | LLM intent classification |
| `svc-search-ixp-enable-orderstatus-unauth` | Unauthenticated order status lookup |
| `svc-search-ixp-bill-payment` | Bill payment from search |
| `svc-search-ixp-trade-in` | Trade-in from search |
| `svc-search-ixp-product-offer-tray` | Product upsells in search results |
| `svc-search-ixp-speedtest` | Speed test from search |
| `svc-search-ixp-payment-arrangements-related-questions` | Payment arrangements AI |
| `svc-search-ixp-google-personalization-va` | Google personalization voice assistant |
| `svc-search-ixp-google-va` | Google virtual assistant |

Loading messages baked into the config: *"Creating an answer for you..."*, *"I'm digging around to find the best answer for you..."*, *"You know what they say -- slow and steady wins the game..."*

## Cross-Domain Session Bridging

Every `www.att.com` homepage response sets cookies for two domains:

```
set-cookie: ixp=<uuid>; Domain=att.com; Expires=Thu, 01 Jan 2032 00:00:00 GMT; HttpOnly; Secure
set-cookie: ixp=<uuid>; Domain=directv.com; Expires=Thu, 01 Jan 2032 00:00:00 GMT; HttpOnly; Secure
```

This happens at the Akamai edge layer, before any JavaScript executes. A visitor who loads att.com's homepage -- and never visits directv.com -- gets enrolled in AT&T's experiment and identity system on DirecTV's domain, with a session UUID that expires January 1, 2032. The `ixp-bundle` cookie is cleared on the same response (zeroed out for both domains), suggesting active management of this cross-domain pairing.

AT&T and DirecTV are distinct brands operating on separate domains. This bridge means a user's behavioral and experiment history on att.com is immediately available to the DirecTV session system on any subsequent directv.com visit, using the same session UUID.

## Audience Segmentation in Client Storage

Every visitor gets a behavioral profile in sessionStorage on first load, assembled from AT&T's internal segmentation and an external identity graph:

- `bSegment`: 20 numerical audience segment IDs (e.g., `"45101643,45364438,..."`) -- behavioral segments from AT&T's CDP, inferred from device, referrer, and context
- `L3Segment`: hashed segment ID from Adobe P13 personalization: `"b8ea6cbe8fc0c71e3bf8878a658339f53c3e1dc3"`
- `e1Segment`: short segment code (`"014"`)
- `fabrickId`: full Neustar Fabrick cross-publisher identity token -- the complete token (`E1:Aawb6JxzrxVdZbNqHlLLaMLtysA7...`) stored in sessionStorage
- `neustarUnauth = "1"`: confirms anonymous Neustar identity resolution is active
- `P13State_ab = "NEW_VISITOR"`: personalization state

These values are readable by every first-party script on the page -- and are explicitly captured by Dynatrace RUM as custom dimensions. The Dynatrace `data-dtconfig` attribute in the HTML documents `mdcc44=bsessionStorage.P13State_ab`, cross-referencing the personalization state in every beacon.

## Surveillance Stack

**QuantumMetric** is the most active tracker: 36 POST beacons to `ingestusipv4.quantummetric.com/horizon/att` on a single homepage load. Dynatrace runs 15 beacons per pageload from `bf03987fss.bf.dynatrace.com`.

**Dynatrace RUM** configuration is documented publicly in the page HTML via the `data-dtconfig` attribute. The config enumerates every custom dimension captured in RUM beacons:
- `mdcc1=crxVisitor` -- rxVisitor session replay ID
- `mdcc3=babVariants` -- localStorage AB test assignments
- `mdcc12=cQuantumMetricSessionID` -- QuantumMetric session cross-reference (sessions linked across both tools)
- `mdcc14=bdocument.referrer` -- full referrer URL
- `mdcc23=catt-appshell-path` -- which app section the user is in
- `mdcc43=ccAuthNState` -- authentication state
- `mdcc44=bsessionStorage.P13State_ab` -- personalization state
- `mdcc45=cAB_AKA-9224` -- Akamai AB test variant

Session replay masking rules (`mb=` field) list exact CSS selectors for masked elements: chat buttons, cookie banner, opt-out tabs, modal wrappers. `mel=100000` sets the masking error list size.

**Invoca** call intelligence (tag ID `1593/2673476745`) dynamically swaps every visible phone number on att.com with a tracking number. `pnapi.invoca.net/1593/na.json` is called on every page load; `invoca_id` is stored in localStorage.

**Verint** configuration (`ucm-us.verint-cdn.com/files/sites/att/live/config.json` -- publicly accessible) defines 40 survey trigger stories across sales, support, account management, B2B, and Spanish-language journeys. The config includes Verint's customer ID: `analyticsEngine.customerId = "JxTg9PsUYKor4P5i9ne0Ug=="`.

Two triggers are silent surveys -- they detect user struggle passively and fire an invisible modal:
- `Silent_Survey_AcctMgmt_Strug`: fires on `/acctmgmt/` URLs when the live behavioral struggle score reaches `minLevel: "high"`. Survey ID `25F95DF803E6204F`, styled with `customClass: "ghostSurvey"`, `autoClose: true`.
- `Silent_Survey_JoinAsNew_Strug`: fires when `flowCode` is `"DSNEW"` (new customer acquisition flow) and struggle score is high. Survey ID `25F95DF823D28C1`.

Both are enabled, `persistent: false`, `repeatAfter: "page"` -- they can trigger on every page navigation.

**Identity resolution** runs on every anonymous visit:
- Neustar/Fabrick: `fid.agkn.com/f` fires to TransUnion's (formerly Neustar) identity network
- Adobe Audience Manager: `dpm.demdex.net/id` for third-party cookie sync
- Adobe Experience Platform: `/ee/or2/v1/interact` fires twice per pageload -- real-time CDP edge event stream. An obfuscated path (`/fDCaDmwrI_Uume4M_ZhOweyk/u3Libba3h7maX0ab/Lg88Mg/akwON/jlgEgQC`) returning 201 routes to AEP's edge collect endpoint.
- Oracle Infinity: `dc.oracleinfinity.io/v4/account/uiiyot1djz/client/id`

Adobe Target runs two active personalization campaigns visible in the page source:
- Campaign 634008: "XT-P13 API call- TData Edgesegments Web SDK-Prod" -- 1:1 personalization using AT&T's internal identity edge segments
- Campaign 547356: "WF-999000-XT-RWD-UF monitoring test for defer in DETM" -- monitoring test

GTM container `GTM-PQ6DMZSB` configures a cross-domain linker for: `atttvnow.com`, `attwatchtv.com`, `attonlineoffers.com`, `paygonline.com`, `firstnet.com`, `atttv.com`, `turnupthelove.com`, `attdreaminblack.com`. Google Ads conversion ID: `AW-1049001539`. DoubleClick Campaign Manager: `DC-6100125`.

The GPC check fires on every page load (`POST /msapi/recognizedstatems/v1/privacy/gpccheck`), returning the current opt-out overlay CMS content and user state. Trackers including Invoca, QuantumMetric, Dynatrace, and Oracle begin firing before the GPC resolution completes.

The `POST /ssaf/ssafc/v1/controllerdata` endpoint (SSAF -- Session Attribution Framework) fires twice per page load, collecting session context. This path is explicitly blocked in robots.txt.

## Other Observations

**Shopping cart creates anonymous profiles**: `GET /msapi/sales/shopping-cart-api/v1/micro-carts` returns a persistent `profileId` UUID for any unauthenticated request. This UUID becomes a tracking vector if items are added or the user signs in later.

**Adobe datastream ID in client globals**: `window.dataStreamId = "cb390eb0-2059-4fa2-b8d8-7fe1d33db94a"` -- the AEP datastream identifier used for all edge events.

**Ookla speed test integration**: `window.__NEXT_DATA__.runtimeConfig` includes `ooklaBaseUrl: "https://attprod.speedtestcustom.com"` and `ooklaApiKey: "vjc37u2cocf0e01t"` -- a client-side embed key for AT&T's custom Ookla speed test widget.

**Session and CSRF tokens in response headers**: Session UUID (`sid`) and CSRF token (`x-csrf-token`) both appear in the initial page response headers. The `idpmgw` cookie is a JWT containing `cs: "UnAuth"`, `sid`, and `csT` (CSRF token) -- the identity management gateway, 30-minute expiry.

**Dynatrace RUM injected at CDN level**: `x-oneagent-js-injection: true` in response headers -- Dynatrace's JavaScript is injected by Akamai before the page reaches the client.

**Internal team attribution in headers**: `att-application-group: uf-marketing` -- upper-funnel marketing team ownership visible in every response.

## Machine Briefing

### Access & Auth

Most first-party APIs accept unauthenticated requests with a standard browser User-Agent. Some endpoints require cookies from an initial homepage load. Set cookies from a homepage request, then reuse them for API calls.

```bash
# Get homepage cookies
curl -c /tmp/att.cookies -b /tmp/att.cookies -s -o /dev/null "https://www.att.com/"

# Reuse for subsequent requests
curl -b /tmp/att.cookies "https://www.att.com/msapi/..."
```

### Endpoints

**Open (no auth, no cookies required):**

```bash
# Shopping cart profile -- creates a new anonymous profileId each call
GET https://www.att.com/msapi/sales/shopping-cart-api/v1/micro-carts
# Response: {"profileId":"<uuid>","carts":[]}

# IXP allocations (always empty for fresh sessions)
GET https://www.att.com/msapi/ixp-allocation-manager-service/v1/allocations
# Response: {"allocations":{}}

# GenAI search config -- full AI config, model assignments, 26 IXP flags
GET https://www.att.com/search/msapi/genAIConfig

# GPC check -- returns consent overlay CMS content and user state
POST https://www.att.com/msapi/recognizedstatems/v1/privacy/gpccheck
Content-Type: application/json
Body: {}

# Cart metadata
GET https://www.att.com/msapi/sales/shopping-cart-meta/v1/metadata

# Popular support answers
GET https://www.att.com/search/v3/sitesearchapi/popularAnswers

# Verint survey config -- publicly accessible CDN file
GET https://ucm-us.verint-cdn.com/files/sites/att/live/config.json
```

**Requires homepage cookies (session context):**

```bash
# ANDI chat state
GET https://www.att.com/msapi/chatlogicprocessor/v1/ui-state

# ANDI user profile
GET https://www.att.com/msapi/chatlogicprocessor/v1/user/aggregateinfo

# ANDI feature flag
GET https://www.att.com/msapi/chatlogicprocessor/v1/config/ENABLE_PROD_QUANTUM_METRIC

# SSAF session attribution (robots.txt blocked, but accessible)
POST https://www.att.com/ssaf/ssafc/v1/controllerdata

# AEP edge event stream
POST https://www.att.com/ee/or2/v1/interact
```

**Authenticated (requires login):**

Account management under `/acctmgmt/`, order management under `/myorders/`, OLAM paths under `/olam/`.

### Experiment Flags

Variant assignment for the current session is in the `ixp-exp-flags` response header on every request. Full chatbot and navigation flags are in the SSR HTML -- look for `sessionStorage.setItem('meganav-featureflags', ...)` and `sessionStorage.setItem('expFlags', ...)` in the page source.

### Gotchas

- `/msapi/ixp-allocation-manager-service/v1/allocations` always returns empty -- the actual flag state is in the page HTML, not this endpoint.
- The obfuscated AEP collect path (`/fDCaDmwrI_Uume4M_ZhOweyk/...`) is a CDN-aliased Adobe edge collect endpoint. It accepts standard AEP Web SDK payloads.
- `chatlogicprocessor` endpoints return `{}` without a valid session cookie stack.
- Phone numbers on the site are dynamically swapped by Invoca's JS -- the numbers in the HTML source are not the ones displayed to users.
- The `genAIConfig` endpoint is at `/search/msapi/genAIConfig` (under the support search app path), not at root.
