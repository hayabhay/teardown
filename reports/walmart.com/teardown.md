---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Walmart — Teardown"
url: "https://www.walmart.com"
company: Walmart
industry: Retail
description: "US retail and e-commerce marketplace operator."
summary: "Walmart.com is a Next.js 14 SSR application (build usweb-1.253.0) served via Akamai with Torbit CDN and Azure Blob Storage for static assets. Data flows through Orchestra, an internal GraphQL gateway with named microservice endpoints. Page content is delivered via Tempo CMS with module data embedded in __NEXT_DATA__. Bot protection runs PerimeterX/HUMAN Security in first-party mode backed by ThreatMetrix, Signifyd, and iovation. First-party analytics use a Pulse beacon that actively calls the Privacy Sandbox Topics API."
date: 2026-04-08
time: "18:09"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack:
  - Next.js
  - React
  - Akamai
  - Torbit CDN
  - Azure Blob Storage
  - Orchestra GraphQL
  - Webpack
  - PerimeterX
trackers:
  - Pulse Beacon
  - Quantum Metric
  - FullStory
  - Criteo
  - DoubleClick
  - AppNexus
  - LiveRamp
  - MediaMath
  - DoubleVerify
  - Braze
  - Moat
  - GroupM
  - Bing
  - HUMAN Security
  - ThreatMetrix
  - Signifyd
  - iovation
tags:
  - retail
  - e-commerce
  - marketplace
  - next-js
  - graphql
  - recommendation-engine
  - consent
  - fraud-detection
  - privacy-sandbox
  - ccpa
headline: "Walmart's homepage carousels embed live Athena recommendation scores in page source — the optimization target reveals rankings prioritize Marketplace seller add-to-cart rate over first-party sales."
findings:
  - "Each homepage carousel ships a base64-encoded Athena token with live CTR, add-to-cart rates by fulfillment type, and the active optimization weight — currently set to MP_ATCR (Marketplace seller add-to-cart), meaning Walmart's own recommendation engine ranks third-party seller products above its own inventory."
  - "Walmart's CCPA 'Do Not Sell' opt-out portal at cpa-ui.walmart.com fires Criteo, DoubleClick, LiveRamp, Bing, and Trade Desk pixels — the same ad-tech vendors users are navigating there to opt out of."
  - "The Pulse beacon calls document.browsingTopics() and HUMAN Security holds Privacy Sandbox attestation — one of the more explicit large-scale Topics API deployments observed in production."
  - "Every production page response ships a mock:true flag and an internal HTTP dev URL (mock-backend.dev.walmart.com) in runtimeConfig, though the mock layer is disabled."
  - "Four One Finance OAuth client IDs for credit, debit, Pay Later, and Pay Wallet enumerate Walmart's full financial product surface from a single page load."
---

## Architecture

Walmart.com is a Next.js 14 application identified as `US-JOURNEY` with build version `usweb-1.253.0-686123a3c92a1dac6068df4cbe917d8347931a79`. The app uses SSR exclusively — `window.renderScope` is hardcoded to `"SSR"` in the inline bootstrap script. HTML is served from Akamai (CDN cache); static assets (JS chunks, fonts, images) come from `i5.walmartimages.com` backed by Azure Blob Storage with Torbit, Walmart's proprietary CDN optimization layer (`x-torbot-lua`, `x-tb-*` response headers).

The frontend fetches data via Orchestra, an internal GraphQL gateway with per-route endpoint mappings. Named services include: `cegateway` (general), `cecxo` (cart/checkout), `cecph` (purchase history), `adsgateway` (Walmart Connect ads via `/swag/graphql`), `cereturns` (returns), `cepdp` (product detail), `cegatewayIdp` (identity/auth). Requests to these endpoints from non-browser agents are blocked with a 412 and a PerimeterX redirect.

Page content is managed through Tempo, an internal CMS that delivers modules as JSON embedded in `__NEXT_DATA__`. The homepage embeds 263KB of Tempo data inline — module names include campaign dates and exact go-live windows (e.g., "4/6 7AM PST - 4/10 12PM PST").

## Athena Recommendation Engine

Every product carousel on Walmart.com embeds an `athModule` field on each `ItemCarousel` module in `__NEXT_DATA__`. The value is base64-encoded JSON. Decoded:

```json
{
  "athmtid": "AthenaItemCarousel",
  "athpgid": "AthenaGlassHomePageDesktopV1",
  "athpn": "2",
  "athae": [{
    "aers": {
      "CTR": 0.00717,
      "GM_ATCR": 0.00257,
      "MP_ATCR": 0.00330,
      "FC_ATCR": 0.000872,
      "GM_CTR": 0.00858,
      "MP_CTR": 0.00900
    },
    "ae": 0.0783,
    "aewr": "MP_ATCR"
  }]
}
```

Fields: `CTR` is click-through rate (0.717%). `GM_ATCR`, `MP_ATCR`, `FC_ATCR` are add-to-cart rates by fulfillment type — General Merchandise (0.257%), Marketplace (0.330%), and Fulfillment Center (0.087%). `ae` is an aggregate engagement score. `aewr` is the active optimization weight.

`aewr: "MP_ATCR"` means Athena is currently ranking homepage carousel items to maximize Marketplace seller add-to-cart rate — not total revenue, not relevance, not first-party GM sales. The ranking objective is visible in plain page source to anyone who decodes the token. The values regenerate per page load and reflect live Athena model outputs. Individual product links also carry an `athAsset` parameter (base64 JSON) with placement metadata.

Walmart Connect (the advertising platform) serves through `adsgateway` at `/swag/graphql`. The Athena system and Walmart Connect are structurally adjacent — both route through Orchestra and both influence carousel placement.

## Consent and the CCPA Portal

No consent banner appears for US visitors. There is no OneTrust, TrustArc, or Osano instance. Tracking begins immediately on page load.

The Pulse beacon system reads a `sod` cookie ("Set/Opt-out of Data sale"). `window.privPrefData.sod` is set to `1` when the cookie is present — when `sod=1`, the ad beacon handler is skipped with `continue`. No GPC (Global Privacy Control) signal handling was observed.

The CCPA opt-out flow directs users to `cpa-ui.walmart.com`. Its own Content Security Policy explicitly permits the following domains in `img-src` and `script-src`:
- Criteo: `gum.criteo.com`
- Bing: `bat.bing.com`
- DoubleClick: `stats.g.doubleclick.net`
- LiveRamp: `idsync.rlcdn.com`, `*.liadm.com`
- Trade Desk: `*.adsrvr.org`

These are the same vendors users are attempting to opt out of. The pixels load on the page where users exercise "Do Not Sell" rights.

## Client-Side Configuration

The production `__NEXT_DATA__` response includes a `runtimeConfig` block shipped to every client. Notable contents:

**Mock infrastructure:**
```json
{
  "mock": true,
  "mockURL": "http://mock-backend.dev.walmart.com/"
}
```
Both `isMocksEnabled` and `isNextPublicMocksEnabled` in `pageProps` are `false`, so the mock layer does not activate. The flag and the internal dev URL (HTTP, not HTTPS) are present in every production page response.

**Google Maps API keys** — five keys in plaintext, covering check-address, address validation, geocoding, store pages/RISE map (dev and production variants), and the Spark Good nonprofit product. Client-side, domain-scoped — standard practice for Maps embeds, but five distinct keys enumerated in every response.

**One Finance OAuth client IDs** — four distinct UUIDs for Walmart's financial product suite:
- Credit card: `8a26b3c4-f3cd-4d09-8724-71948070bb0d`
- Debit card: `7317549a-c0d2-4e80-a565-02df2577dd8b`
- Pay Later: `e9c7cf28-15e8-4d6d-88fc-b6bbb454349d`
- Pay Wallet: `9d7dc281-c287-4d34-ac45-a52cf9c36f0a`

OIDC client ID: `5f3fb121-076a-45f6-9587-249f0bc160ff`. OIDC tenant: `elh9ie`. Identity domain: `identity.walmart.com`. These are public OAuth clients (expected to be client-side), but they fully enumerate Walmart's financial product surface from a single page load.

## Analytics, Surveillance, and Fraud Detection

The Pulse beacon system (`b.wal.co/rum.js`, served first-party from `b.www.walmart.com/rum.js`) handles all first-party analytics. It calls `document.browsingTopics()` (Privacy Sandbox Topics API) and includes the result in beacon payloads. HUMAN Security is enrolled in Privacy Sandbox attestation (`crcldu.com`). Together these represent one of the more explicit large-scale commitments to the Topics API in production.

Quantum Metric is conditional: it loads only when a `qme` cookie is present. It is not default-on. RUM beacons route to `beacon.lightest.walmart.com` (without QM) or `beacon.lightestwithqm.walmart.com` (with QM). FullStory org ID `o-24B841-na1` is in the `runtimeConfig`; its loading behavior was not confirmed in this session.

Bot protection runs in layers:
- PerimeterX / HUMAN Security: app ID `PXu6b0qd2S`, first-party mode (`/px/PXu6b0qd2S/init.js`, `/px/PXu6b0qd2S/xhr` served from `walmart.com` itself)
- HUMAN Security auditor: `crcldu.com/bd/auditor.js`
- ThreatMetrix: org `hgy2n0ks`
- Signifyd: `cdn-scripts.signifyd.com/api/script-tag.js`
- iovation: `mpsnare.iesnare.com/snare.js`

Non-browser sessions receive a 412 at any Orchestra GraphQL endpoint, redirected to PerimeterX challenge.

Tracker footprint observed: Criteo, DoubleClick, AppNexus, LiveRamp, MediaMath, DoubleVerify, Braze, Moat, GroupM, Bing.

## Special Routes

The runtimeConfig and network captures reveal additional product surfaces:
- `/fittingroom` — Zeekit AR virtual try-on (acquired 2021)
- `/live`, `/live-next` — shoppable livestreaming
- `/reels`, `/i/reels` — short-form video commerce
- `/assistant`, `/sparky` — IoT/voice converse adapter (`/api-proxy/service/iot/converse-adapter`)
- `/in-store-wifi/verify-code` — in-store WiFi onboarding
- `/waiting-hallway` — high-demand item queue management

## Ghost Infrastructure

The production Content Security Policy `frame-src` directive includes `cyborg-wm-auth-service-v2.jet.com`. Walmart shut down Jet.com in May 2020. The domain has been in the CSP for six years and remains there as of this investigation.

## Machine Briefing

**Main site:** `https://www.walmart.com` — SSR via Akamai, frequently cached (`server-timing: cdn-cache; desc=HIT`). HTML includes full `__NEXT_DATA__` JSON; parse it with `jq .props.pageProps` for config and module data.

**GraphQL endpoints** — all require active browser session + valid PerimeterX cookies. Non-browser requests receive 412.

```
POST /orchestra/home/graphql         # cegateway — general
POST /orchestra/cartxo/graphql       # cecxo — cart/checkout
POST /orchestra/cph/graphql          # cecph — purchase history
POST /orchestra/orders/graphql       # orders + returns
POST /swag/graphql                   # adsgateway — Walmart Connect ads
POST /orchestra/idp/graphql          # identity/auth
POST /orchestra/hw/graphql           # health/wellness
POST /orchestra/pdp/graphql          # product detail
```

**REST endpoints** — also require browser session + PX cookies:
```
GET /typeahead/v3/complete?query={q}&limit={n}   # search suggestions
GET /suggestions/                                 # unified typeahead
GET /orchestra/api/ccm/v3/bootstrap              # config bootstrap
GET /meta/ccm                                    # CCM bootstrap (protobuf)
GET /orchestra/api/tempo                         # Tempo CMS API
```

**Identity:**
```
OIDC client ID: 5f3fb121-076a-45f6-9587-249f0bc160ff
OIDC tenant:    elh9ie
Identity:       identity.walmart.com
Auth frame:     /account/login
Wallet:         wallet.www.walmart.com
```

**Bot detection layers — expect challenges without a valid browser profile:**
```
PerimeterX app ID:       PXu6b0qd2S
PX first-party paths:    /px/PXu6b0qd2S/init.js, /px/PXu6b0qd2S/xhr
HUMAN auditor:           crcldu.com/bd/auditor.js
ThreatMetrix org:        hgy2n0ks
Signifyd:                cdn-scripts.signifyd.com/api/script-tag.js
iovation:                mpsnare.iesnare.com/snare.js
```

**Athena tokens:**
- Homepage carousels: decode `__NEXT_DATA__.props.pageProps.initialData` -> find ItemCarousel modules -> `moduleData.configs.athModule` (base64 JSON)
- Product links: `?athAsset={base64}` query parameter carries placement metadata
- Page ID (homepage desktop): `AthenaGlassHomePageDesktopV1`

**CCPA opt-out portal:**
```
https://cpa-ui.walmart.com/dc/privacy/en-US/affirmation?brandCode=WMT&languageCode=en-US&market=US
```
Note: this page fires Criteo, Bing, DoubleClick, and LiveRamp pixels.
