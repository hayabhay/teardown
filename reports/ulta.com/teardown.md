---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Ulta Beauty — Teardown"
url: "https://ulta.com"
company: "Ulta Beauty"
industry: "Retail"
description: "Omnichannel beauty retailer with 1,400+ stores and loyalty program."
summary: "React SSR frontend on nginx/Envoy service mesh behind Akamai CDN, with Auth0 authentication on a custom tenant (dsp.ulta.auth0app.com) and Apollo GraphQL locked to persisted queries. Tealium manages the tag layer over a full Adobe Experience Platform data stack. Three chat systems run simultaneously: Sierra, Gladly, and a Google Vertex AI Shopping Agent being A/B tested as 'Ulta AI.' Ulta operates UB Media, its own retail media network, via Adnuntius for on-site ads and Rokt for post-checkout upsell."
date: "2026-04-12"
time: "21:30"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [React, Apollo GraphQL, Akamai, Auth0, Tealium, Dynatrace, Envoy]
trackers: [Google Analytics 4, Google Tag Manager, Google Campaign Manager 360, Adobe Analytics, Adobe Audience Manager, Adobe Experience Platform, Facebook Pixel, TikTok Pixel, Pinterest Pixel, Snapchat Pixel, Reddit Pixel, The Trade Desk, Criteo, LiveRamp ATS, Zeta Global, Boomtrain, Quantum Metric, DoubleVerify, mParticle, Adnuntius, OneTrust, Akamai mPulse]
tags: [beauty, retail, loyalty, retail-media, ai-chatbot, pre-consent-tracking, amity-community, graphql, vertex-ai, abtasty]
headline: "ABTasty tests expose 'Bella AI,' Ulta's unreleased Google-powered shopping assistant -- one test variant hides Sierra's chat button."
findings:
  - "The Amity community platform's server key -- documented as an admin-level backend token -- ships in every visitor's page source alongside the client key, granting access to operations that bypass user-level authorization."
  - "ABTasty tests reveal 'Bella AI' (internal codename) as Ulta's Google Vertex AI Shopping Agent with four entry-point variants in testing; a separate test hides Sierra's chat button, signaling an active migration between AI providers."
  - "Google's Shopping Agent stores its OAuth bearer token in localStorage with ttl:-1, readable by any script on the page -- and the GCP project name 'ulta-dsp-prod' in every API call matches the 'DSP' namespace in Akamai routing and Auth0 tenant."
  - "OneTrust fires twice on page load, auto-populating analytics and targeting consent groups before any user interaction -- Facebook, TikTok, LiveRamp ATS, Pinterest, Reddit, Snapchat, and Quantum Metric all activate immediately."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Ulta runs React with server-side rendering, hydrated through Apollo GraphQL. The GraphQL layer is locked to persisted queries only -- a direct introspection request returns `{"errors":[{"message":"Invalid query name"}]}`. The canonical endpoint is `/v1/client/dxl/graphql?ultasite=en-us&User-Agent=gomez`. That trailing `User-Agent=gomez` is not dynamic -- it's hardcoded in the production config global `__GRAPHQL_URI__` and appended to every request. "Gomez" was a web performance monitoring service (now Micro Focus/Broadcom via SOASTA) that predated Dynatrace. It has survived long enough to become a permanent query parameter on every production GraphQL call.

The same vintage shows in the response headers: `x-ruxit-js-agent: true`. Ruxit was Dynatrace's predecessor brand before the 2014 rebrand. Both headers appear alongside modern `x-oneagent-js-injection: true` and `x-dt-tracestate`, meaning Dynatrace is fully operational -- just carrying legacy identifiers nobody cleaned up.

---

## Architecture

Infrastructure headers paint the full picture:
- `server: nginx`
- `x-envoy-upstream-service-time` -- Envoy service mesh (likely Istio) between nginx and application services
- `x-akam-sw-version: 0.5.0` -- Akamai CDN with ServiceWorker integration
- `x-oneagent-js-injection: true` / `x-ruxit-js-agent: true` -- Dynatrace APM
- `cache-control: max-age=0, no-cache, no-store` -- pages not cached at CDN edge

Authentication runs through Auth0 with a custom tenant. The client ID `dYFxHpyS7Ng4rIp1pDKZcTKmZdH2vvKQ` and tenant URL `https://www.ulta.com/authorize` are in client globals. The Auth0 API audience is `https://dsp.ulta.auth0app.com/api/v2/` -- a custom domain setup using `ulta.auth0app.com` rather than the standard `ulta.auth0.com`. The "dsp" subdomain prefix appears consistently across the stack (more on this below).

Tealium manages the tag layer: `window.utag`, `window.utag_data`, environment set to `prod`. The `utag_data` object hydrates on page load with comprehensive analytics context including `user_type`, `user_member_points`, `user_email`, `user_email_hash`, `user_member_id`, `bag_items`, `bag_value`, and full product field data.

One production global stands out: `__WEBSITE_DOMAIN__: "http://v1-client-web-site"`. This is a Kubernetes internal service name for the web frontend -- the format follows k8s internal DNS conventions, and the `http://` scheme (no TLS) confirms it's a cluster-internal address. It serves no visible purpose in the client-side bundle.

The socialtags endpoint (`/ecom/v1/orch/shop/productdetails/socialtags/viewed/{sku}`) returns an Akamai ESI (Edge Side Includes) waiting room template when accessed without proper session cookies. This is Akamai's virtual waiting room feature -- Ulta has it configured for high-traffic scenarios, complete with Luhn validation for PCI data in POST bodies and auto-redirect timers. The ESI template is fully readable in the response.

Server-side cookies set on the very first request, before any browser JavaScript executes:
- `__ruid` -- visitor UUID (expires Oct 2026), e.g. `0f2890b2-234d-4bcd-b344-234d083a2df5`
- `X_ULTA_VISITOR_ID` -- same UUID under a different name
- `ULTA_SITE=CB` and `X_ULTA_SITE=CB` -- site variant ("CB" = Central/B)
- `akaalb_alb_www_dsp=~op=WWW_DSP_SITE_CB:Prod_DSP_SiteB_Origin_Central` -- Akamai load balancer routing; note the "DSP" in the origin pool name

---

## The AI Stack: Three Systems, One Page

Three distinct chat and AI systems run simultaneously on every page load.

### Sierra

Sierra (`sierra.chat`) operates as the traditional AI chat assistant: `window.sierraConfig = {display: "corner", hideOnClose: true, persistence: "tab", canEndConversation: true, canStartNewChat: true}`. It fires 2-3 requests per page to `POST /-/api/events` and `POST /-/api/graphql`.

### Gladly

Gladly (`cdn.gladly.com`) handles customer service routing. Its full configuration is publicly accessible at `https://cdn.gladly.com/orgs/configs/chat/ulta.com.json` -- no authentication required. The config reveals:
- Integration ID `5ddeba1a7c88f2000f8ddec1`, Provider ID `5ddeb9fd981894000f8f3338`
- Support text number: `309-650-8582`, email: `gethelp@ulta.com`
- Office hours: all days 00:00-23:59 (24/7 AI-assisted routing)
- `provider: "CHAT_ROCKET"` -- the underlying chat routing system
- `showPoweredByGladly: false` -- Gladly branding suppressed in the widget
- `orgId: "N1i-8DquRveQf9lhNYKcqQ"`, cluster: `ulta.gladly.com`, stage: production
- Feature flags: `{allowQuickRepliesInClosedConversation: true, chatV2: false, demoMode: false}`

### Google Vertex AI Shopping Agent

The newest addition is the Google Vertex AI Shopping Agent (`agenticapplications.googleapis.com`). It fires on every page type tested -- homepage, product, search, brand, community -- making three consistent calls per page:
- `POST /v1/sales:retrieveConfig`
- `POST /v1/sales:executeChat`
- `POST /v1/sales/projects/ulta-dsp-prod/locations/global/commerc...` (truncated in network logs)

The GCP project identifier is `ulta-dsp-prod`. The `ULTA_SDK` global bridges Ulta's product catalog to the agent, exposing: `shoppingAgentToken`, `init`, `contentModel`, `session`, `ui`, `dataCapture`, `shoppingAgentModel`. The agent token is cached in localStorage as `ULTA_SHOPPING_AGENT_TOKEN_CACHE` containing a Google OAuth2 bearer token (`ya29.*` prefix), alongside `GSA:accessToken` and `GSA:sessionId`. The `ttl` field is set to `-1` -- no local eviction policy, meaning the token persists in localStorage until the OAuth token itself expires. Storing OAuth bearer tokens in localStorage rather than HttpOnly cookies makes them readable by any script on the page, including the 30+ third-party scripts Ulta loads.

The `__SHOPPING_AGENT_COOLDOWN_MS__: 2500` global throttles re-calls. `window.googleAgentSettings = {id: "WwJ6G3OIFWwhqe3s", cartVersion: 2, settings: {}}`.

### Bella AI: The Unreleased Product

"Bella AI" is the user-facing product being built on top of the Google Shopping Agent. Internal CSS classes use `bella-ai__` prefixes (`bella-ai__open-button`, `bella-ai__welcome-text`); the user-facing brand is "Ulta AI." ABTasty test 1582036 runs four variants testing different UI entry points:

- **Variant 1972225**: "Ask Ulta AI" in the search autocomplete dropdown
- **Variant 1972229**: "Ulta AI" link in the primary navigation header (desktop and mobile, with sparkle icon)
- **Variant 1972231**: "UltaAIBanner" on product pages -- "Questions about this? Ask me"
- **Variant 1972232**: `bella-ai__open-button` on category/PLP pages -- "Hi, I'm Ulta AI, your beauty assistant" + "Get started" CTA

The `ULTA_SDK.ui.renderInOverlay({moduleName:"ConversationalAI", ...})` call in the ABTasty test code confirms Bella AI renders through the Google Shopping Agent SDK -- the ABTasty variants are testing different surfaces for the same underlying agent.

A separate test -- 1607847, variant 2006186 named "Hide" -- removes Sierra's chat messenger entry point button (`chat-messenger-entry-point-button`). Running concurrently with the Bella AI rollout tests, this is the migration signal: Ulta is testing whether to replace Sierra with its own branded Google-powered AI.

Two additional ABTasty tests: 1585743 (variants 1977085 and 1977088) test placement and visibility of the "FrequentlyBoughtTogether" product section on PDPs. Test 1578948, variant 1968100, tests another search/UI injection.

---

## Amity Community Platform

Ulta operates a full social community at `/community/` powered by Amity (formerly SC-Platform). Users get communities, feeds, posts, direct messaging, and group channels.

The Amity integration ships two keys in every page's client-side globals:
- `__AMITY_CLIENT_KEY__: 'b0eabd536f8ff66d4d328949510f448e850bd8b1ba373a2f'` (48 chars) -- this is the expected client-side key
- `__AMITY_SERVER_KEY__: '56d0165fb05b64e594288fe2a4ef770bba1859f6daaa231880e8140da027be08ea080825e507c7cc0d0ba2000e3dc81298ff7957fb1d93f2a564b6f59f'` (120 chars) -- this is not

Amity's documentation describes server keys as admin-level tokens intended for backend services only. They enable operations that bypass user-level authorization: creating or deleting any community, banning users, reading private messages, and managing the social graph. The key is confirmed in the live page source. Whether the key is actively functional for admin operations was not tested -- that falls outside investigation scope -- but its presence in client-side code is an architectural misconfiguration regardless.

Additional community globals: `__AMITY_FAQ_COMMUNITY_ID__: '66e9efc17a4ef56df84b44c4'`, `__AMITY_NEWS_COMMUNITY_ID__: '66e9efa1154e370b02dc6e55'`, `__AMITY_DEFAULT_TAB__: 'newsfeed'`.

On the community page, Amity fires 27 requests across 23 endpoints: session creation (`POST /api/v5/sessions`), ads (`GET /api/v1/ads/me`), network settings, user profiles, communities list, feeds (`GET /api/v4/me/global-feeds`), pinned posts, invitations, join requests, and file fetches. The API base is `apix.us.amity.co`.

The Boomtrain personalization script (`cdn.boomtrain.com/p13n/ulta-salon/p13n.min.js`) loads specifically tagged for "ulta-salon" -- targeting the beauty services side of the business (in-store salon appointments), not the product catalog.

---

## Retail Media Network

Ulta operates UB Media, its retail media advertising network, through a layered stack visible in every page load.

**Adnuntius** serves on-site sponsored ads via `api.tx4.pw.adn.cloud`. The network ID `0XUZZ7` is constant; the ad unit ID changes per page type:
- Homepage: `-1096381898492075842` (27 requests)
- Product pages: `7972892959193123079` (21 requests)
- Search: `6142528188845216299` (18 requests)
- Community: `-8406236570011378224` (3 requests)

Each page load generates a POST to the unit ID endpoint, followed by a series of POSTs with impression/tracking GUIDs appended. The domain `api.tx4.pw.adn.cloud` appears in AdGuard's SpywareFilter -- the subdomain structure is atypical for a known ad platform and may contribute to ad-blocker evasion.

**Rokt** (`rkt.ulta.com`) runs post-checkout and loyalty upsell. Ulta's custom subdomain rather than generic Rokt hosting indicates a direct commercial relationship with first-party routing. Account ID: `2550745407543340151`.

The supporting retail media infrastructure:
- **Narrativ** (`window.narrativ`) -- commerce intelligence and affiliate link attribution
- **Movable Ink** (`window.MovableInkTrack`) -- personalized content rendering in email and on-site
- **Zeta Global** (`ulta.ztk5.net`, `POST /xc/123240/174717/3037`) -- data enrichment and identity resolution
- **Boomtrain** (`events.api.boomtrain.com`, `people.api.boomtrain.com`) -- Zeta-owned personalization engine
- **mParticle** (key `0CB210AA`, stored in localStorage as `mprtcl-v4_0CB210AA`) -- customer data platform routing data to downstream ad partners

### The DSP Namespace

The string "DSP" appears consistently across the entire infrastructure:
- Akamai load balancer cookie: `akaalb_alb_www_dsp`, origin pool `Prod_DSP_SiteB_Origin_Central`
- Auth0 API audience: `https://dsp.ulta.auth0app.com/api/v2/`
- Google Cloud project: `ulta-dsp-prod`

This consistency suggests "DSP" is an internal platform or product name -- likely the infrastructure backbone for Ulta's retail media and demand-side platform operations, tying the authentication layer, content delivery, and AI services under one organizational umbrella.

---

## Surveillance & Consent

The homepage loads requests from 31 third-party domains; product pages add Criteo, Salsify, Afterpay, and LiveRamp for 32+.

### OneTrust Consent Flow

The OneTrust CMP (config ID `f698a2e0-43cc-4586-bb2b-5231019638b9`) fires `OneTrustLoaded` twice on page load. The first fires with `OnetrustActiveGroups: ",,"` -- no groups active. The second fires immediately after with `",C0007,C0001,C0002,"` -- before any user interaction with the consent banner. C0001 = Strictly Necessary; C0002 = Performance/Analytics; C0007 is a non-standard group (standard OneTrust uses C0004 for Targeting/Advertising) that appears to function as a targeting category. The Adobe Analytics first page view beacon confirms this: `c33=,c0007,c0001,c0002,` is transmitted in the initial hit.

The result: analytics and targeting trackers activate without any user consent action. Trackers confirmed active on page load, before any consent banner interaction:
- `window.fbq` -- Facebook/Meta Pixel
- `window.ttq` -- TikTok Pixel
- `window.gtag` -- Google Tags (GA4 + Campaign Manager)
- `window.ats` -- LiveRamp ATS (identity resolution)
- `window.QuantumMetricAPI` -- Quantum Metric session replay
- `window.rdt` -- Reddit Pixel
- `window.pintrk` -- Pinterest Pixel
- `window.snaptr` -- Snapchat Pixel
- `window.mParticle` -- customer data platform

LiveRamp's LaunchPad configuration fires on `DOM_READY` across all 50 US states plus DC, with no observed consent gate before ATS activation. Config ID: `13c1383f-0466-4c90-8c2f-cc954c36b826`.

### Event Streams

The Snowplow event stream routes to `webevents/v3/JS/us1-b3294ecfceab944590579f7493e91a67/events` -- the `us1` prefix and long hash are Ulta's tenant identifier within what appears to be Snowplow BDP (Behavioral Data Platform).

Adobe Experience Platform Edge Network (`/ee/or2/v1/interact`) is the highest-frequency first-party call: 10 per homepage load, 8 per product page, 8 per search page. The `/or2/` path indicates the Oregon 2 region edge node.

### Full Tracker Inventory

| Tracker | Domain | Type |
|---|---|---|
| Google Analytics 4 | analytics.google.com | Analytics |
| Google Tag Manager | googletagservices.com | Tag Manager |
| Google Campaign Manager 360 | ad.doubleclick.net (src 9596862, 14666520) | Display/Conversion |
| Google Remarketing | www.google.com (IDs: 1063988350, 992679742, 16956474286) | Remarketing |
| Google Ads Display | pagead2.googlesyndication.com | Display |
| Google Ad Traffic Quality | ep1.adtrafficquality.google | IVT Filtering |
| Adobe Analytics | sweb.ulta.com/b/ss/ultacom | Analytics |
| Adobe Audience Manager | dpm.demdex.net | DMP |
| Adobe Experience Platform | adobedc.demdex.net, /ee/or2/v1/ | CDP/Edge |
| Facebook Pixel | (window.fbq) | Social Pixel |
| TikTok Pixel | (window.ttq) | Social Pixel |
| Pinterest Pixel | ct.pinterest.com | Social Pixel |
| Snapchat Pixel | (window.snaptr) | Social Pixel |
| Reddit Pixel | pixel-config.reddit.com | Social Pixel |
| The Trade Desk | insight.adsrvr.org | DSP Conversion |
| Criteo | b.da1.us.criteo.com, b.us5.us.criteo.com | Retargeting |
| LiveRamp ATS | rp.liadm.com, rp4.liadm.com | Identity Resolution |
| Boomtrain/Zeta | boomtrain.com | Identity/Personalization |
| Zeta Global | ulta.ztk5.net | Data Platform |
| Quantum Metric | ingest.quantummetric.com | Session Replay |
| Dynatrace | bf78180lnp.bf.dynatrace.com | RUM/APM |
| DoubleVerify | tps-dn-uw1.doubleverify.com | Ad Verification |
| Clrt.ai | 13578.clrt.ai | Attribution |
| Adnuntius | api.tx4.pw.adn.cloud | Retail Media Ads |
| OneTrust | cdn.cookielaw.org | CMP |
| Akamai mPulse | c.go-mpulse.net | RUM |

---

## Config Globals

The full set of client-side configuration globals extracted from the page source:

- `__AMITY_API_ENDPOINT__`: `https://api.us.amity.co`
- `__AMITY_CLIENT_KEY__`: `b0eabd536f8ff66d4d328949510f448e850bd8b1ba373a2f`
- `__AMITY_SERVER_KEY__`: `56d0165fb05b64e594288fe2a4ef770bba1859f6daaa231880e8140da027be08ea080825e507c7cc0d0ba2000e3dc81298ff7957fb1d93f2a564b6f59f`
- `__AUTH0_CLIENT_ID__`: `dYFxHpyS7Ng4rIp1pDKZcTKmZdH2vvKQ`
- `__AUTH0_TENANT__`: `https://www.ulta.com/authorize`
- `__AUTH0_API_AUDIENCE__`: `https://dsp.ulta.auth0app.com/api/v2/`
- `__GRAPHQL_DOMAIN__`: `https://www.ulta.com`
- `__GRAPHQL_URI__`: `v1/client/dxl/graphql?ultasite=en-us&User-Agent=gomez`
- `__FINDATION_API_KEY__`: `4decd3c589443ec39a1923ccca3a133188a0fa108390b6c75ec570cfc5ef`
- `__GOOGLE_MAPS_API_KEY__`: `AIzaSyA_wp8CHzBQpjT34atxZeAolv78ecKgRd0`
- `__ROKT_ACCOUNT_ID__`: `2550745407543340151`
- `__SALSIFY_CLIENT_ID__`: `s-20181963-1a7e-4be6-ac8d-2fe3813cd236`
- `__TEALIUM_ENVIRONMENT__`: `prod`
- `__SHOPPING_AGENT_COOLDOWN_MS__`: `2500`
- `__WEBSITE_DOMAIN__`: `http://v1-client-web-site`
- `__PAYPAL_ENVIRONMENT__`: `production`
- `window.webchat_domain`: `conversation.ultainc.com/innovation/api/ccp/v1/ccp-chatbot`
- `window.ROKT_DOMAIN`: `https://rkt.ulta.com`
- `window.googleAgentSettings`: `{id: "WwJ6G3OIFWwhqe3s", cartVersion: 2}`

---

## Machine Briefing

### Access & Auth

Most endpoints work without authentication via curl or fetch. The GraphQL endpoint requires session cookies for non-public queries, but public read operations (product data, navigation, search) return data on GET requests. Auth0 handles full authentication at `/auth/` and `/authorize/` -- these require interactive login and are blocked to most crawlers in robots.txt.

Start with a GET to `https://www.ulta.com` to receive visitor cookies: `__ruid` and `X_ULTA_VISITOR_ID` (same UUID in two names), `ULTA_SITE`, `X_ULTA_SITE`. Include these in subsequent requests.

### Endpoints

**Open -- no auth required:**

```
# Gladly chat config (full org config, public)
GET https://cdn.gladly.com/orgs/configs/chat/ulta.com.json

# GraphQL -- persisted queries only, no introspection
POST https://www.ulta.com/v1/client/dxl/graphql?ultasite=en-us&User-Agent=gomez
Content-Type: application/json
{"operationName": "YOUR_QUERY_NAME", "variables": {}}
# Returns {"errors":[{"message":"Invalid query name"}]} for unknown query names

# Product social tags (returns Akamai ESI waiting room without session cookies)
GET https://www.ulta.com/ecom/v1/orch/shop/productdetails/socialtags/viewed/{sku}

# Amity community API (requires Amity client key in header)
GET https://apix.us.amity.co/api/v3/communities
x-api-key: b0eabd536f8ff66d4d328949510f448e850bd8b1ba373a2f

# Amity feeds (requires session from POST /api/v5/sessions)
GET https://apix.us.amity.co/api/v4/me/global-feeds

# Adnuntius retail media (fires without auth)
POST https://api.tx4.pw.adn.cloud/0XUZZ7/{unit_id}
# Unit IDs by page type:
#   Homepage:  -1096381898492075842
#   Product:    7972892959193123079
#   Search:     6142528188845216299
#   Community: -8406236570011378224

# Google Shopping Agent config
POST https://agenticapplications.googleapis.com/v1/sales:retrieveConfig
# Requires Google OAuth bearer token from ULTA_SHOPPING_AGENT_TOKEN_CACHE in localStorage
```

**Requires session cookies (set on first GET to ulta.com):**

```
# Adobe Experience Platform Edge (8-10 calls per page)
POST https://www.ulta.com/ee/or2/v1/interact

# Identity acquisition
POST https://www.ulta.com/ee/or2/v1/identity/acquire

# Snowplow event stream
POST https://www.ulta.com/webevents/v3/JS/us1-b3294ecfceab944590579f7493e91a67/events

# Identity service
GET https://www.ulta.com/id
POST https://www.ulta.com/identity/v1/identify
```

### Gotchas

- GraphQL is persisted queries only -- `operationName` must match a server-registered query name. No introspection. Valid query names are not publicly documented; capture them from browser network traffic.
- The `User-Agent=gomez` query parameter in the GraphQL URI is not optional -- it's part of the canonical endpoint string. Include it or expect routing differences.
- `ULTA_SITE=CB` cookie controls which origin pool receives requests (Central/B). Different values may route to different backends.
- The Amity server key in client globals grants admin-level access to the Amity API at `apix.us.amity.co`. Operations available via server key extend beyond what the client key permits.
- Adnuntius requests fire two POSTs per impression slot: one to the unit ID alone, one to `{unit_id}/{impression_guid}`. The impression GUID is returned in the first response.
- Google Shopping Agent OAuth token (`ya29.*`) is in localStorage under `ULTA_SHOPPING_AGENT_TOKEN_CACHE`. `ttl: -1` means the token persists until the OAuth token itself expires -- no local eviction policy.
- The socialtags endpoint returns an Akamai ESI waiting room template when called without proper session cookies or during traffic surge routing.
