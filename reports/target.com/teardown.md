---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Target — Teardown"
url: "https://www.target.com"
company: "Target"
industry: "Retail"
description: "US mass-market retailer selling groceries, apparel, electronics, and home goods."
summary: "Next.js 13+ on Fastly CDN with haproxy and Varnish. Adobe Launch manages tags. A full internal service registry of 21 named backends is embedded in every page's HTML via window.__CONFIG__, with 20 of 21 sharing a single API key. PerimeterX and Shape Security run parallel bot protection. FullStory and IBM Tealeaf session recording activate on first load with no consent gate."
date: "2026-04-12"
time: "21:24"
contributor: "hayabhay"
model: "sonnet"
effort: "high"
stack: [Next.js, React, Fastly, Adobe Launch, PerimeterX]
trackers: [FullStory, Adobe Analytics, Adobe Audience Manager, Google Ads, DoubleVerify, Medallia, IBM Tealeaf, Google Private Aggregation]
tags: [retail, ecommerce, feature-flags, session-recording, jwt, retail-media, ai-features, agentic, privacy, api-exposure]
headline: "Every visitor gets an unsigned JWT readable by any page script, while Roundel's billion-dollar ad network routes through /demo_radeus_ads/."
findings:
  - "Every page embeds a complete service map in window.__CONFIG__: 21 internal backends, all endpoint paths, and a single API key shared across 20 of them — auth, carts, profile, and the new agentic AI service included."
  - "The identity token issued to every visitor uses alg:none — an unsigned JWT, not HttpOnly, readable by any script, encoding loyalty status, home state, and session type. The issuer field reads MI6."
  - "Roundel, Target's retail media network generating billions annually, serves production ad requests through /demo_radeus_ads/v2/ — a demo prefix baked into live traffic."
  - "The store location API returns future-dated brand partnership capabilities with effective dates, making upcoming collaborations readable before public announcement."
  - "Virginia triggers a non-dismissible health data consent modal via a queryable API; California returns empty — no CPRA consent flow fires despite FullStory, Google Ads, and Adobe tracking all active from first load."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Target is one of the largest retailers in the US — over 1,900 stores, a top-ten e-commerce site by traffic, and the operator of Roundel, a retail media network that sells ad placements to brands wanting to reach Target shoppers. The site runs a modern stack on top of a layered service infrastructure that has been accumulating since the early 2000s. All of it is substantially visible from the outside.

## Architecture

Target.com is a Next.js 13+ application served through a Fastly CDN with haproxy and Varnish behind it. Adobe Launch (formerly Adobe DTM) handles tag management — the container (`launch-270dfdaa71b7.min.js`, built 2026-03-24) is loaded on every page. PerimeterX handles primary bot detection; Shape Security (F5) runs as a second layer. IBM Tealeaf handles session replay at the network edge — its session ID (`TealeafAkaSid`) is set server-side before the first byte of HTML reaches the browser.

The site uses a service worker registered at the root scope. IndexedDB contains a `tgt` database with a `webStore` object holding cached preferred store data: store ID, name, format type (general merchandise vs small format), and alcohol availability. This enables offline-capable store context without a network call.

Target published an `llms.txt` at `https://www.target.com/llms.txt` — a structured guide for LLMs describing URL patterns for product pages (`/p/{slug}/-/A-{TCIN}`), categories (`/c/{name}/-/N-{node}`), owned brands with direct category links, and seasonal sections. This is deliberate AI-readability investment.

The `robots.txt` doubles as an archaeological record. Disallowed paths include `AjaxSearchNavigationView`, `ProductComparisonCmd`, `ESPModal`, `FetchProdRefreshContent`, `WriteReviews`, `WriteComments` — the residue of at least three distinct commerce platform generations, each leaving its path signatures in the disallow list.

## The Client-Side Service Map

Every Target.com page embeds three significant JavaScript globals in the HTML before any scripts execute:

**`window.__CONFIG__`** — a full internal service registry. 21 named services, each with base URL, API namespace, and complete endpoint path maps. This isn't configuration for a handful of frontend calls — it's a machine-readable map of the entire backend.

**`window.__FLAGS__`** — 159 feature flags, all evaluated server-side for this visitor profile (unauthenticated, CA-located) and all set to `true`.

**`window.__TGT_DATA__`** — store location variables: zip, store_id, lat/lon.

The services enumerated in `__CONFIG__`:

| Codename | Base URL | What |
|----------|----------|------|
| auth | `gsp.target.com` | OAuth/identity (internal name: MI6) |
| apiPlatform | `api.target.com` | Main platform API |
| carts | `carts.target.com` | Cart operations |
| redsky | `redsky.target.com` | Product catalog |
| redskyAggregations | `redsky.target.com` | Aggregated product queries |
| profile | `profile.target.com` | Guest profile |
| nova | `r2d2.target.com` | Reviews/ratings and AI chat |
| redoak | `redoak.target.com` | CMS |
| sapphire | `sapphire-api.target.com` | A/B experimentation |
| neptune | `prod.tgtneptune.com` | Store data |
| agentic | `agentic.target.com` | Agentic AI backend |
| cduiOrchestrations | `cdui-orchestrations.target.com` | Content-driven UI |
| qaChatOrchestrator | `r2d2.target.com` | Shopping assistant chat |
| typeahead | `typeahead.target.com` | Search suggestions |
| appStorage | `appstorage.target.com` | App state |
| digitalContent | `digitalcontent.target.com` | Digital content |
| pageLayouts | `redoak.target.com` | Page layout CMS |
| salsify | (external) | Product content syndication |
| syndigo | (external) | Product content network |
| bazaarvoice | (external) | Ratings/reviews aggregation |
| affirm | `api.affirm.com` | BNPL |

Twenty of these 21 services share a single API key: `9f36aeafbe60771e321a7cc95a78140772ab3e96`. That key is embedded in the `__CONFIG__` object and accessible to any script running on the page. The one exception is the nova/r2d2 service (reviews and chat), which uses a separate key: `c6b68aaef0eac4df4931aae70500b7056531cb37`.

Additional credentials in `__CONFIG__` and the page HTML:
- `keys.loyaltyClientKey`: `NX1a8HGstVgSEONL1pMdNw==`
- `keys.loyaltyApiKey`: `a5ae7fb188e78581614e4909f407462d8392b977`
- PerimeterX appId: `PXGWPp4wUS`
- FullStory org: `o-221JN4-na1`
- Adobe DTM build: `92025c83a551/2653a632bdc7/launch-270dfdaa71b7.min.js`

The `__DYNAMIC_CONFIG__` object carries three keys: `ADOBE_TAG_MANAGER`, `MEDALLIA`, and `PLQ`. The `blossomId` value `ci13278081` is an unidentified internal identifier present in config.

## JWT Architecture and First-Load Tokens

Three cookies are set server-side before the first JavaScript executes:

**`idToken`** — Uses `alg: none` (no signature). Not HttpOnly — readable by any script on the page. Payload:

```json
{
  "sub": "172661e0-ae3c-48e5-bbb0-677e617485fa",
  "iss": "MI6",
  "exp": 1776113850,
  "iat": 1776027450,
  "ass": "L",
  "sut": "G",
  "cli": "ecom-web-1.0.0",
  "pro": {
    "fn": null, "fnu": null, "em": null,
    "ph": false, "led": null, "lty": false,
    "st": "CA", "sn": null
  }
}
```

Fields: `sut` = session user type (`G` = guest), `ass` = assurance level (`L` = low), `lty` = loyalty member (false), `st` = inferred state. The issuer field is `MI6` — Target's internal name for its auth service (`gsp.target.com`).

**`accessToken`** — RS256 signed (key `eas2`), HttpOnly (not readable from JS). Payload includes a 64-character device fingerprint in `did: "37934cfdfb009f14b4f1ea02e1a5b4a7c0dff9b75fd83862d3444e8f708e5189"`, plus `sco: "ecom.none,openid"`.

**`refreshToken`** — HttpOnly, Secure, SameSite=none, 6-month expiry (`Max-Age=15552000`).

An `egsSessionId` (separate HttpOnly session ID, 1-hour TTL) is also set on first load.

The issuing pattern: Target uses the readable idToken to expose guest session state to client-side code without needing a signed token. The device fingerprint travels in the HttpOnly accessToken, invisible to page scripts but sent on every authenticated request. Whether the server accepts crafted idTokens with modified payloads (e.g., altered loyalty status) cannot be determined from client-side observation.

The login URL exposes OAuth configuration parameters: `client_id=ecom-web-1.0.0`, `ui_namespace=ui-default`, `signin_amr=true`, `kmsi_default=false` (Keep Me Signed In off by default).

## First-Load Cookie Inventory

Twelve cookies set before any user interaction, including:

- `GuestLocation=94123|37.800|-122.430|CA|US` — zip, lat, lon, state, country derived from IP. Not HttpOnly. Available to all page scripts.
- `fiatsCookie=DSI_2768|DSN_San Francisco West|DSZ_94118|server` — pre-assigned store ID, name, and zip. Domain-scoped to `.target.com`.
- `adScriptData=CA` — state code for ad targeting. Set server-side, not HttpOnly.
- `TealeafAkaSid=K0MvCsjm4C9uQShBeCZTRf0iUfysQIEO` — IBM Tealeaf session replay ID.
- `sapphire=1` — A/B experiment bucket assignment.
- `visitorId=019D837C3D940200AE77D1A4744C6F79` — persistent visitor identifier, 2-year expiry.
- `refreshToken`, `idToken`, `accessToken` — JWT session tokens.
- `egsSessionId` — server session ID.

The `GuestLocation`, `adScriptData`, and `fiatsCookie` together give every on-page script a visitor's approximate location and assigned nearest store before any consent signal has been collected.

Security headers are mostly standard: `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN`, `strict-transport-security: max-age=31536000`. The `content-security-policy` is limited to `frame-ancestors 'self' https://*.target.com` — no `script-src` directive. No `permissions-policy` header. `referrer-policy: no-referrer-when-downgrade` sends the full referrer URL to any HTTPS destination.

## The API Surface

**Open (no auth required):**

```
GET https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?key=9f36aeafbe60771e321a7cc95a78140772ab3e96&channel=WEB&count=24&default_purchasability_filter=true&include_sponsored=true&keyword={query}&offset=0&platform=desktop&pricing_store_id={store_id}&scheduled_delivery_store_id={store_id}&store_ids={store_id}&useragent=Mozilla%2F5.0&visitor_id={visitorId}&zip={zip}
```

Returns product search results including: TCIN, DPCI, pricing (current and regular retail), promotions, `desirability_cues` array (e.g., `{"code": "highly_rated", "display": "Highly rated"}`), `ornaments` (badge display logic), fulfillment options, and ratings statistics.

```
GET https://redsky.target.com/redsky_aggregations/v1/web/pdp_client_v1?key=9f36aeafbe60771e321a7cc95a78140772ab3e96&channel=WEB&tcin={tcin}&store_id={store_id}&zip={zip}&state={state}&latitude={lat}&longitude={lon}&visitor_id={visitorId}&pricing_store_id={store_id}
```

Returns full product detail including ratings/reviews summary, 8 most-recent reviews with `author.external_id` (internal numeric user ID, e.g., `"10079179404"`) and submission timestamps, video assets, fulfillment rules, and promotions.

```
GET https://redsky.target.com/redsky_aggregations/v1/web/store_location_v1?key=9f36aeafbe60771e321a7cc95a78140772ab3e96&store_id={store_id}
```

Returns store capabilities with `effective_date` and optional `expiration_date`. Example response for store 2768 (SF West):

```json
[
  { "capability_code": "KBB by Kahlana", "capability_name": "KBB by Kahlana", "effective_date": "2025-09-21" },
  { "capability_code": "RR Mystery", "capability_name": "Roller Rabbit x Target Mystery Box", "effective_date": "2026-02-26", "expiration_date": "2026-03-31" },
  { "capability_code": "Roller Rabbit", "capability_name": "Roller Rabbit x Target", "effective_date": "2026-02-26", "expiration_date": "2026-03-31" }
]
```

This endpoint returns future-dated capabilities as they are staged. Brand partnerships are visible before public announcement.

```
GET https://api.target.com/privacy_rule_engine/v1/applicable_laws?stateCode=VA
```

Returns the applicable consent template for a given state code. Virginia returns:

```json
{
  "id": "va-health-law",
  "templateId": "HEALTH_LAW",
  "title": "Health Data Consent",
  "description": "Some information collected, used, and shared by Target may be health data under certain state laws such as Virginia...",
  "isDismissible": false,
  "displayType": "ALERT_DIALOG"
}
```

California, and all other states tested, return `[]`. The consent system is driven entirely by this API, queried on every page load with the visitor's state code from the GuestLocation cookie.

**Blocked:**

```
POST https://api.target.com/demo_radeus_ads/v2/ads/display-banner  -> 401 without session
GET  https://api.target.com/digital_guest_intents/v1/web_fulfillments  -> 401 without x-api-key header
GET  https://api.target.com/store_traffic_levels/v1/stores  -> 502 (internal-only)
POST https://api.target.com/one_click_carts/v1/add-tcins-to-cart  -> requires auth
```

## Roundel: demo_radeus_ads in Production

Target's retail media network — Roundel — serves display ad placements to product detail pages via a POST to `https://api.target.com/demo_radeus_ads/v2/ads/display-banner`. This endpoint fires on every PDP load with a session cookie.

The path is configured in `__CONFIG__` as `services.apiPlatform.apis.radeus_ads.endpointPaths.radeusDisplayBannerV2 = "/demo_radeus_ads/v2/ads/display-banner"`. The `demo_` prefix on a v2 endpoint in production suggests the path was originally created in a development or demonstration environment and was never updated when promoted — a naming artifact now baked into production traffic.

Roundel generates billions in annual revenue. The infrastructure serving those placements has "demo" in its production API path.

## Feature Flags: 159 Flags, All On

`window.__FLAGS__` contains 159 flags, all evaluated server-side for an unauthenticated California visitor. Every single flag is `true`. This represents the full enabled flag set for this visitor profile. Flags are sourced server-side (`SET_CONFIGS_IN_DOCUMENT_HEAD_ENABLED: true` is one of the 159 flags).

Current AI/chat infrastructure visible in flags:

- `PRODUCT_CHAT_ENABLED`, `PRODUCT_CHAT_PDP_ENABLED`, `PRODUCT_CHAT_CATEGORY_ENABLED` — AI shopping chat active
- `PDP_CHATBOT_ENABLED` — chatbot on product detail pages
- `PDP_GEN_AI_REVIEW_SUMMARY_ENABLED` — generative AI review summaries
- `SHOPPING_ASSISTANT_GUEST_FEEDBACK_ENABLED` — feedback loop for shopping assistant
- `GLOBAL_EMBEDDED_CHAT_ENABLED` — embedded chat widget

Internal project codenames visible in flag names:

- **Quantum** — `GLOBAL_QUANTUM_READY_ENABLED`, `GLOBAL_QUANTUM_ASYNC_ENABLED`, `GLOBAL_QUANTUM_LAZY_ONLOAD_SAPPHIRE_ENABLED` — a platform migration or rendering architecture initiative
- **Trident** — `GLOBAL_TRIDENT_BASE_MEMBERSHIP_ENABLED` — membership/subscription feature
- **Redjacket** — `GLOBAL_REDJACKET_ENABLED` — feature identity unknown
- **Project Unity** — `PROJECT_UNITY_ALPHA_LAYER_ENABLED`, `GLOBAL_DOUBLE_VERIFY_UNITY_INTEGRATION_ENABLED` — multi-year Target tech migration; "alpha layer" indicates early integration work
- **Magic Wand** — `GLOBAL_MAGIC_WAND_ENABLED`, `GLOBAL_MAGIC_WAND_IN_ADD_TO_CART_ENABLED` — smart recommendations or substitutions at purchase time
- **TRBUY** — `GLOBAL_TRBUY_PREFERRED_SHOPPER_ENABLED`, `GLOBAL_TRBUY_NON_CRITICAL_SHIPT_MEMBERSHIP_REQUEST_ENABLED` — Target+Shipt subscription coupling

Other notable flags:

- `INNVOVID_AD_SIZES_ENABLED` — Innovid is a CTV (connected TV) ad tech company. The flag name contains a typo (`INNVOVID` instead of `INNOVID`). CTV ad sizing on a retail e-commerce site signals Roundel's expansion into streaming ad inventory.
- `GLOBAL_XBOX_ALL_ACCESS_ENABLED` — Xbox All Access financing program integration
- `GLOBAL_SPECULATION_RULES_ENABLED` — Chrome Speculation Rules API for prefetch/prerender
- `FASTLY_CACHE_CONTROL_DISABLED` — disables Fastly caching on certain paths
- `PERSONALIZATION_CONTENT_CACHE_BYPASS_AT_FASTLY_ENABLED` — bypasses Fastly for personalized responses
- `GLOBAL_PRIVACY_BANNER_ENABLED` — flag is `true`; no privacy banner displayed in CA session
- `HOLIDAY_ALPHA_LAYER_ENABLED` — holiday infrastructure active in April (pre-season staging)
- `BEAUTY_STUDIO_MODAL_ENABLED` — virtual try-on/beauty studio modal
- `VIEW_SIMILAR_VISUAL_DISCOVERY_ENABLED` — visual similarity product discovery
- `BASKET_AWARE_ENABLED` — basket-aware personalization
- `CIRCLE_GAMES_ENABLED` — loyalty gamification

## Agentic Infrastructure

Two distinct AI/chat services are registered in `__CONFIG__`:

**`agentic.target.com`** — `apis.agenticV1.endpointPaths.agentSessions = "agent_sessions"`. This service uses the shared API key. Direct probes return empty responses. No public documentation.

**`qaChatOrchestrator`** (also at `r2d2.target.com`) — endpoint paths: `qa_chat_orchestrator/v1/chat`, `qa_chat_orchestrator/v1/chat-enabled`, `qa_chat_orchestrator/v1/shopping-assistant-init`, `qa_chat_orchestrator/v1/interaction-feedback`. This is the shopping assistant chat backend, consistent with `PRODUCT_CHAT_*` and `SHOPPING_ASSISTANT_*` flags.

Both services use the shared API key. The `chatInitQuestionsV1` endpoint (`shopping-assistant-init`) suggests a structured onboarding flow — opening questions for the assistant. The `interaction-feedback` endpoint is a feedback loop for assistant quality.

Combined with `llms.txt`, the feature flags, and the dedicated agentic subdomain, Target is building explicit AI shopping infrastructure rather than bolting on a chatbot widget.

## Surveillance

**Bot protection:** PerimeterX (`PXGWPp4wUS`) sends behavioral fingerprinting data to `collector-pxgwpp4wus.px-cloud.net` and `tzm.px-cloud.net` — 5+ requests per page. Shape Security (`config.shape.enabled: true`) runs as a second layer. Two independent bot detection systems in parallel.

**Session recording:** FullStory (org `o-221JN4-na1`) streams session data to `edge.fullstory.com` and `rs.fullstory.com` on every page. IBM Tealeaf session replay ID is set server-side (`TealeafAkaSid`) and recorded separately. Both active from first load, no consent gate.

**Ad ecosystem:**
- Google Display (`pagead2.googlesyndication.com`) — 36-85 requests per page
- DoubleClick/DFP (`securepubads.g.doubleclick.net`) — ad serving
- Google Remarketing (`www.google.com/rmkt/collect`, `ad.doubleclick.net/activity`) — fires on PDP
- Google Tag Services (`www.googletagservices.com`) — audience modeling
- Google Private Aggregation (`www.googleadservices.com/.well-known/private-aggregation/`) — Privacy Sandbox shared storage, 18-42 reports per page
- DoubleVerify (`pub.doubleverify.com`) — 3 signal endpoints: ids, bsc, vlp
- Adobe Audience Manager (`dpm.demdex.net`) — DMP ID sync on homepage

**First-party analytics (Firefly):** Target's internal analytics pipeline at `api.target.com/consumers/v1/ingest/web/eventstream`. Event taxonomy includes: `page_view`, `experiment_exposed`, `traffic_source`, `product_detail_view`, `results_grid`, `content_impression`, `viewed_impression`, `served_display_ads_impression`, `cdui_page_view`. Ad impressions ingest separately at `/consumers/v1/ingest/web/ad_impression`; product impressions at `/consumers/v1/ingest/web/product_impression`.

**Feedback:** Medallia — 3 analytics calls plus config loads per page (`analytics-fe.digital-cloud.medallia.com`, `resources.digital-cloud.medallia.com`). 12+ `KAMPYLE_*` globals in the window.

**Unknown beacon:** `ponos.zeronaught.com/2` — a GET request returning 1 byte fires on every page type tested. "ponos" is the Greek personification of toil/hard work. Inferred as a synthetic monitoring beacon for CDN/network path health verification. Ownership not confirmed from public records.

**No consent banner.** No CMP (OneTrust, Cookiebot, etc.) detected. The `GLOBAL_PRIVACY_BANNER_ENABLED` flag is `true` but the banner does not appear in a California session. The `adScriptData=CA` cookie, FullStory, DoubleVerify, Google Ads, and all trackers listed above fire immediately on first visit with no user interaction required.

## Privacy Rule Engine

`GET https://api.target.com/privacy_rule_engine/v1/applicable_laws?stateCode={state}` is queried on every page load. The visitor's state is derived from the GuestLocation cookie set server-side at first load.

Virginia triggers a non-dismissible health data consent modal under Virginia's My Health MY Data Act. No other state tested (CA, TX, NY, WA) returned a consent template. California's CPRA does not trigger a consent flow — the API returns `[]`.

The `do_not_sell_requests` endpoint (`guest_opts/v1/do_not_sell_requests`) exists in config but requires authentication. There is no publicly accessible opt-out path without a logged-in session.

A GPC (Global Privacy Control) handler exists: `guest_consents/v1/global_privacy_controls`. The actual server-side behavior when a browser sends `Sec-GPC: 1` is not visible from client-side observation.

## Internal Subdomains: The SSL Certificate SAN Map

The TLS certificate on `api.target.com` lists 40+ Subject Alternative Names, revealing internal subdomain topology:

| Subdomain | Response | Notes |
|-----------|----------|-------|
| `cgisandbox.target.com` | 200 | Publicly accessible 3D product viewer — Three.js, ModelViewer.js, JSZip, fflate, QRCode.js; no auth |
| `spectra.target.com` | 200 | CRA app, "Click here to Login in" — internal tooling/documentation portal |
| `red.target.com` | 200 (redirect) | Redirects to Target Circle loyalty program |
| `price.target.com` | 403 | Pricing service, requires auth |
| `pricepreview.target.com` | 403 | Price preview service |
| `opus.target.com` | 404 | Internal codename, no public content |
| `bullfight.target.com` | DNS error | Internal/air-gapped |
| `mantis.target.com` | DNS error | Possibly issue tracker |
| `natascha.target.com` | 404 | Internal service |
| `screengrab.target.com` | 404 | Screenshot/visual testing service (inferred) |
| `tap-bridge.target.com` | 404 | Integration bridge |
| `subscriptions.target.com` | 404 | Subscription management |
| `api-finds.target.com` | 401 | Auth required |
| `gam-api-secure.target.com` | — | Google Ad Manager API integration |
| `*.iam.partnersonline.com` | — | B2B partner/vendor portal |

`cgisandbox.target.com` is the most notable: a complete 3D product viewer and CGI tooling environment, publicly reachable with no authentication, serving Three.js and ModelViewer for AR/3D product visualization workflows. No sensitive data was visible from the landing page, but the server is live and serving assets.

## Machine Briefing

### Access and Auth

No auth required for product catalog, search, store location, and privacy rule engine endpoints. The shared API key `9f36aeafbe60771e321a7cc95a78140772ab3e96` is needed for redsky endpoints.

For session-required endpoints: visit `https://www.target.com` and collect cookies. The site sets `idToken`, `accessToken`, `refreshToken`, `visitorId`, `GuestLocation`, `fiatsCookie`, and `egsSessionId` on first load. Pass all cookies and the `x-application-name: web` header. Most endpoints also require `x-api-key: 9f36aeafbe60771e321a7cc95a78140772ab3e96`.

Store ID for the SF West store is `2768`; zip `94118`. The visitorId from the cookie is used for personalization parameters.

### Endpoints

**Open — Product Search:**
```
GET https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?key=9f36aeafbe60771e321a7cc95a78140772ab3e96&channel=WEB&count=24&default_purchasability_filter=true&include_sponsored=true&keyword=airpods&offset=0&platform=desktop&pricing_store_id=2768&store_ids=2768&zip=94118
```

**Open — Product Detail:**
```
GET https://redsky.target.com/redsky_aggregations/v1/web/pdp_client_v1?key=9f36aeafbe60771e321a7cc95a78140772ab3e96&channel=WEB&tcin=85978615&store_id=2768&zip=94118&state=CA&latitude=37.800&longitude=-122.430&pricing_store_id=2768
```

**Open — Store Capabilities:**
```
GET https://redsky.target.com/redsky_aggregations/v1/web/store_location_v1?key=9f36aeafbe60771e321a7cc95a78140772ab3e96&store_id=2768
```

**Open — Privacy Rules:**
```
GET https://api.target.com/privacy_rule_engine/v1/applicable_laws?stateCode=VA
GET https://api.target.com/privacy_rule_engine/v1/applicable_laws?stateCode=CA
```

**Open — Store Nearby:**
```
GET https://api.target.com/redsky_aggregations/v1/web/nearby_stores_v1?key=9f36aeafbe60771e321a7cc95a78140772ab3e96&place=94123&within=100&unit=mile&limit=20
```

**Open — A/B Experiments:**
```
GET https://api.target.com/sapphire/runtime/api/v1/raw/www.target.com/
```

**Session-required — Circle Offers per Product:**
```
GET https://api.target.com/redsky_aggregations/v1/web/pdp_circle_offers_v1?key=...&tcin={tcin}&store_id={store_id}
```

**Session-required — Cart:**
```
GET https://api.target.com/web_checkouts/v1/cart
POST https://api.target.com/one_click_carts/v1/add-tcins-to-cart
```

**Session-required — Roundel Ads:**
```
POST https://api.target.com/demo_radeus_ads/v2/ads/display-banner
```

**AI/Chat (session + behavior unclear):**
```
POST https://r2d2.target.com/qa_chat_orchestrator/v1/chat
GET  https://r2d2.target.com/qa_chat_orchestrator/v1/chat-enabled
GET  https://r2d2.target.com/qa_chat_orchestrator/v1/shopping-assistant-init
POST https://r2d2.target.com/qa_chat_orchestrator/v1/interaction-feedback
POST https://agentic.target.com/agent_sessions
```

### Gotchas

- The shared API key is required as both a query parameter (`?key=`) and sometimes as `x-api-key` header depending on the endpoint. Redsky endpoints take it as a query param; `api.target.com` prefixed endpoints may need both.
- `GuestLocation` cookie is read server-side to determine state code. To test Virginia consent behavior: set `GuestLocation=23219|37.538|-77.434|VA|US` before the request.
- Redsky aggregation endpoints require `visitor_id` (from the `visitorId` cookie) for personalization and some fulfillment calculations.
- The `demo_radeus_ads` endpoint returns 401 without session and 405 on OPTIONS — it accepts POST only with a live session.
- `store_traffic_levels/v1/stores` returns 502 consistently — appears to be internal-only.
- `agentic.target.com/agent_sessions` returns empty responses without a session and possibly without additional headers. Access pattern unknown.
- `cgisandbox.target.com` is live but serves only a 3D viewer frontend. No asset URLs or product data endpoints were exposed from the landing page.
