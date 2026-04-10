---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Sephora — Teardown"
url: "https://sephora.com"
company: "Sephora"
industry: "Retail"
description: "Online beauty retailer selling cosmetics, skincare, and fragrance."
summary: "Sephora runs a hybrid SSR/client-side stack behind Akamai WAF, with a GraphQL gateway and a public Constructor.io search API. Oracle ATG decommission is actively in progress, being replaced by a service layer at api-developer.sephora.com. Auth uses JWT tokens stored in localStorage rather than httpOnly cookies. Adobe, Dynatrace, ZineOne, Bluecore, and Braze form the personalization and analytics stack, alongside a live Retail Media Network for brand-paid product placement."
date: "2026-04-12"
time: "07:17"
contributor: "hayabhay"
model: "sonnet"
effort: "high"
stack: [Akamai, Adobe Launch, Constructor.io, Dynatrace, Braze, Forter, Kasada]
trackers: [Adobe Analytics, Adobe Audience Manager, Adobe Target, Google Ads, Dynatrace RUM, ZineOne, Bluecore, Braze, Branch.io, Neustar, Reddit Pixel, Bing UET, Snapchat Pixel, TikTok Pixel, Forter, Medallia, Gladly]
tags: [retail, beauty, tracking, genai, retail-media-network, constructor-io, braze, akamai, jwt, loyalty-program]
headline: "Sephora's public search API names every active ML ranking experiment — including models blending click-through, add-to-cart, and purchase signals."
findings:
  - "Constructor.io search API returns live pricing, inventory signals, and exclusivity flags for 1,320+ products without authentication — and its features array names all seven active ranking experiments, including a Learn-to-Rank model using CTR and session signals and a time-decayed purchase weighting variant."
  - "Braze stores 300 segment names in client-side localStorage — price bracket interest segments, A/B test group IDs, loyalty signals, and BIPOC-Owned brand interest tracked as separate segments per category."
  - "The AI Beauty Chat consent disclaimer states that Sephora may use chat transcripts to train its AI models, while a GENAI_ANONYMOUS_ID in localStorage links anonymous browsing to a GenAI profile for seven days before any account login."
  - "Sephora silently writes your IP-inferred zip code to your user profile on every page load via a PUT request — no prompt, no consent, no indication it happened."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

Sephora runs a server-side rendered application with client-side hydration — `window.Sephora.isSPA` is present but the site is not a pure SPA. Pages arrive with meaningful HTML from the server, then hand off to a React frontend. The entire site sits behind Akamai WAF: all `curl` requests return 403 with `Server: AkamaiGHost` headers. Playwright in headed mode is required for any investigation.

The primary API gateway is `POST /gway/v1/graph` (GraphQL), with versioned REST endpoints under `/gway/v1/` and `/gway/v2/`. The external domain `api-developer.sephora.com` hosts the SOT (Software-Defined Network) API, which is the replacement for Oracle ATG Commerce — two configuration flags confirm the migration is actively underway: `isAtgSunsetEnabled: true` and `enableATGDecom: true`.

Build information is exposed client-side via `window.Sephora.buildInfo`:

```json
{
  "BUILD_NUMBER": 107,
  "PROJECT_VERSION": "2026.06_0.1_build",
  "CODE_BRANCH": "2026.06_0.1_build",
  "GIT_BRANCH": "origin/master",
  "GIT_COMMIT": "b699bbbb6210634d2b5e7f97c60a521849a75c6f",
  "BUILD_DATE": "Thu Apr 02 2026 21:10:12 GMT-0700 (Pacific Daylight Time)"
}
```

Version naming follows `YYYY.WW` (year + sprint week) convention. The git commit hash is live in the browser.

Bot and fraud layers are stacked: Akamai WAF for perimeter, Kasada SDK (`window.KPSDK`) for bot fingerprinting at `/149e9513-.../fp` (which returned 429 on the probe attempt), Forter for fraud detection with fully obfuscated endpoint paths (`/yhxZL/FMfr/VLbV/HYKx/...`), and Arkose Labs for high-risk challenge flows (`arkoseLabsPublicKey: 3481BEF5-335A-4FEA-B2FB-0D51CA252341`).

---

## RCPS Cookie System

Sephora uses approximately 15 proprietary cookies prefixed `rcps_` (Reference Cache Profile Settings). These are not tracking cookies — they control which microservice response groups are served fresh versus cached for the current session:

| Cookie | Purpose |
|--------|---------|
| `rcps_cc` | Credit card group |
| `rcps_po` | Purchase order group |
| `rcps_ss` | Session state group |
| `rcps_product` | Product data group |
| `rcps_profile_account_group` | Account profile |
| `rcps_profile_bi_group` | Beauty Insider profile |
| `rcps_profile_info_group` | Personal info group |
| `rcps_profile_shipping_group` | Shipping profile |
| `rcps_sls` | Saved list/wishlist |
| `rcps_profile_userprofile_group` | User profile group |
| `rcps_ccap` | Credit card application |
| `rcps_cctk` | Credit card token |
| `rcps_ccappl` | Credit card application flow |
| `rcps_full_profile_group` | Full profile cache |
| `rcps_basket` | Cart/basket state |
| `rcps_beauty_chat` | Beauty chat feature state |

When `rcps_profile_userprofile_group=false`, the user profile group bypasses cache and fetches fresh — the server uses these flags to decide which downstream microservices to hit on each request. The `adbanners=on` cookie is a state flag (not a preference) indicating the current session has ad banners active.

---

## Retail Media Network

Sephora's Retail Media Network (RMN) is confirmed live. Three configuration flags in `window.Sephora.configurationSettings` are all set to `true`: `RMNEnableDisplay`, `RMNEnablePLA`, and `isRetailMediaNetworkEnabled`. Display ads and Product Listing Ads (PLAs) are active on category pages and search results. This means brands pay for placement in Sephora's own catalog, alongside the algorithmic results.

Post-checkout upsells run through Rokt: `roktAdPlacementAccountId: 2448573684668432385` is exposed in client-side globals. Rokt inserts third-party offers on the order confirmation page.

Four separate Google Ads conversion IDs fire simultaneously on every page load via `www.google.com/rmkt/collect/`:
- `969432509`
- `876588114`
- `1072439557`
- `857992431`

Running four conversion IDs in parallel is consistent with multi-brand attribution — each ID likely maps to a different brand's ad account tracking conversions on Sephora.com through the Retail Media Network.

---

## Constructor.io: The Open Catalog API

Sephora uses Constructor.io for search and product discovery. The API is unauthenticated and callable directly:

```
GET https://sephora.cnstrc.com/search/{query}?key=u7PNVQx-prod-en-us
```

A query for "fragrance" returns 1,320 total products. Default page size is 20. Each result includes a `currentSku` object with:

- `listPriceFloat` / `finalPriceFloat` — live pricing (e.g., $180, $28)
- `isBestseller` — bestseller flag (boolean)
- `isLimitedEdition`, `isLimitedTimeOffer` — product lifecycle flags
- `isSephoraExclusive`, `isAppExclusive` — exclusivity flags
- `biExclusivityLevel` — Beauty Insider tier required (e.g., `none`, or a tier value)
- `isOnlineOnly` — online exclusivity
- `on_sale` — sale status (boolean, at `data` level)

The `data.sku_availability` field returns `{network_SEPHORAUS: 2}` — a live inventory signal.

The API key (`u7PNVQx-prod-en-us`) is a public client-side key. By Constructor.io's architecture it is intended to be client-facing. But the result is that any caller — without authentication, without a session, without Akamai mediation — can query Sephora's full product catalog with live pricing, inventory status, and all exclusivity flags.

---

## Search Ranking Exposed

The Constructor.io API response includes a `features` array listing every active and inactive experiment in Sephora's search configuration. Active experiments (enabled: true) as of the investigation:

| Internal Name | Display Name | Active Variant |
|---|---|---|
| `auto_generated_refined_query_rules` | Affinity Engine | `soft_rules` (Lowered weights) |
| `filter_items` | Filter-item boosts | `sephora_weighted_ctr_w_atc_purchases_diff_periods_v2` |
| `manual_searchandizing` | Searchandizing | (active, no variant — opaque override) |
| `personalization` | Personalization | `default_personalization` |
| `query_items` | Learn To Rank | `query_items_ctr_l2r_ctr_ss` |
| `use_reranker_service_for_browse` | Reranker (browse) | `browse_reranker_v0_top100_sephora` |
| `use_reranker_service_for_search` | Reranker (search) | `search_reranker_v0_top100_sephora` |

The variant names are Sephora's internal identifiers and read as function descriptions. `sephora_weighted_ctr_w_atc_purchases_diff_periods_v2` decodes to: a weighted click-through rate signal combined with add-to-cart and purchase events, applied across different time periods (time decay). `query_items_ctr_l2r_ctr_ss` decodes to: listwise Learn-to-Rank using CTR and session-level signals.

`manual_searchandizing` — Searchandizing — is the mechanism that allows Sephora to pin, bury, or reorder products manually regardless of algorithmic rank. This is the same lever used for paid brand placement. It is active, with no variant name, meaning its rules are not visible in the API response.

Inactive experiments visible in the response include `a_a_test` (A/A validation test, off) and a deprecated unified reranker (`use_reranker_service_for_all`, off).

---

## GenAI Chat: Staged Rollout

Sephora has six GenAI feature flags in `configurationSettings`, each gating a different category:

| Flag | State |
|---|---|
| `isGenAIFragranceChatEnabled` | `true` — LIVE |
| `isGenAISkincareChatEnabled` | `false` |
| `isGenAIHairChatEnabled` | `false` |
| `isGenAIMakeupChatEnabled` | `false` |
| `isGenAIGiftFinderEnabled` | `false` |
| `genAIChatBot.isEnabled` | `false` — separate product |
| `isGenAIChatEnabledUFE` | `true` — UFE layer active |

The GenAI entrypoint-prompts API fires on every page load regardless of category:

```
POST /gway/v1/genai-pa/v1/entrypoint-prompts
x-api-key: nQc7BFt78yJBvfYDKtle9APd5RrX984i
authorization: Bearer {ufeAuthToken}

{"data": {"entrypoint": "PLP", "categoryId": "cat120009", "channel": "rwd"}}
```

Valid entrypoints are `PDP`, `PLP`, `SRP`, and `default` — confirmed via the API's validation error response when an incorrect field name was submitted. The API returns suggested prompts and a `genai_prompt_session_id` UUID per request.

The internal product name is "AI Beauty Chat". The full config is served via `GET /gway/v1/genai-pa/v1/config` and includes:

- Bot names: `bot_name: "AI Beauty Chat"`, `bot_nav_title: "AI Beauty"`
- Pre-defined prompt cards organized by category: fragrance, hair care, makeup, skincare, bath & body
- A 7-point relevance feedback survey ("Help Us Improve") with three steps
- The consent disclaimer: *"We may maintain a transcript of chats for quality assurance and to train our AI models to provide better results."*

Chat personalizes against a logged-in Beauty Insider account and saved beauty preferences. For anonymous users, `GENAI_ANONYMOUS_ID` is stored in localStorage with a 7-day TTL, linking anonymous browsing sessions to a GenAI profile before any account login.

---

## Tracking & Identity Stack

Sephora loads approximately 20 distinct third-party tracking domains. The homepage alone generates 23 Dynatrace RUM calls (`POST /bf` to `bf15698iev.bf.dynatrace.com`). Below is the full inventory observed across homepage, fragrance category, and moisturizer category:

| Domain | Service | Call Pattern |
|--------|---------|--------------|
| `bf15698iev.bf.dynatrace.com` | Dynatrace RUM | 23 calls/homepage |
| `www.google.com` | Google Ads | 4 conversion IDs, rmkt/collect |
| `cdn0.forter.com` | Forter | Fraud fingerprinting (obfuscated paths) |
| `cloud3.zineone.com` | ZineOne | Session AI: connect, originId, event |
| `resources.digital-cloud.medallia.com` | Medallia | Customer feedback surveys |
| `analytics-fe.digital-cloud.medallia.com` | Medallia | Survey analytics |
| `cdn.gladly.com` | Gladly | AI customer service chat |
| `analytics.gladly.com` | Gladly Snowplow | Chat analytics |
| `assets.adobedtm.com` | Adobe Launch | Tag manager |
| `dpm.demdex.net` | Adobe Audience Manager | Cross-publisher ID sync |
| `sephora.tt.omtrdc.net` | Adobe Target | A/B testing / personalization |
| `c.go-mpulse.net` | Akamai mPulse | Performance monitoring |
| `sephora.cnstrc.com` | Constructor.io | Search + recommendations |
| `onsitestats.bluecore.com` | Bluecore | Behavioral tracking |
| `api.bluecore.app` | Bluecore | Customer profile patching |
| `siteassets.bluecore.com` | Bluecore | Site targeting config |
| `p11.techlab-cdn.com` | Techlab | Session replay / analytics |
| `api2.branch.io` | Branch.io | Mobile attribution / deep links |
| `cdn.clarip.com` | Clarip | CCPA / Do Not Sell |
| `googleads.g.doubleclick.net` | Google Ads | View-through conversions |
| `ad.doubleclick.net` | DoubleClick | Display advertising |
| `aa.agkn.com` | Neustar/Adgear | Identity resolution pixel |
| `pixel-config.reddit.com` | Reddit | Conversion pixel |
| `bat.bing.com` | Microsoft Bing | UET tracking |
| `t.getletterpress.com` | Letterpress | Snowplow analytics |

**Bluecore** fires a `customer_patch` event on first page load — before any user interaction. The decoded payload includes `original_user_type` and `current_user_type`, which Bluecore resolves from localStorage state immediately on arrival. Within the same session, a user can transition from `"new"` to `"returning"` based on prior localStorage data.

**ZineOne** (`cloud3.zineone.com`) operates beyond passive tracking. The `z1_connectData` key in localStorage contains an `actionMapping` with executable JavaScript — this is ZineOne's mechanism for deploying dynamic on-page actions without a full deployment. ZineOne also writes `z1_categoryVector` to localStorage to track per-user category interest (e.g., `fragrance|skincare/moisturizers`), and assigns persistent `profileId` and `sessionId` values to anonymous visitors.

**Branch.io** (`api2.branch.io`) handles mobile-to-web identity stitching. A `browser_fingerprint_id` is stored in localStorage for linking browser sessions to mobile attribution data.

**Neustar/Adgear** (`aa.agkn.com`) fires on every category page — this is a cross-publisher identity resolution pixel, used to match anonymous browser visitors against known identities in the Neustar identity graph.

**Silent profile update**: `PUT /gway/v2/users/profile/preferredZipCode` fires automatically on every page load. Sephora calls `GET /api/v3/util/location` (returns city, countryCode, county, geoRegion, latitude, longitude, regionCode, timeZone, zipCode from IP geolocation) and then writes the inferred zip code to the user profile without any user prompt.

**Persistent cross-session tracking** via:
- `_pin_unauth_ls` — Pinterest unauthenticated tracking (~1-year expiry)
- `_uetsid` / `_uetvid` — Bing UET (13-month cookie)
- `u_sclid` / `u_sclid_r` — Snapchat Click ID (localStorage)

---

## Braze: 300 Segments Client-Side

The Braze SDK stores its server-configuration object in localStorage under key `ab.storage.serverConfig.476615b3-3386-4e1c-a9fd-7e174eb9b8de`. The configuration's segment list contains 300 entries and is fully readable without authentication.

The segments expose Sephora's complete behavioral segmentation taxonomy:

**Price bracket segments** (by visit behavior):
- "15 and under Visited", "25 and under Visited", "35 and under Visited", "50 and under Visited", "75 and under Visited", "100 and under Visited" — US and Canadian French variants for each

**Loyalty and behavioral signals**:
- `Auto_Replen` — auto-replenishment enrollment signal
- `BI Card Visited` — Beauty Insider credit card interest
- `Beauty Insider Visited` — loyalty program engagement
- `ASC Event - Cart at End of Session Analysis` — cart abandonment experiment

**A/B test group**:
- `BR_20250221_Feb_Contingency_Control` — Braze experiment from February 2026, still present as an active segment

**Brand identity segments** (tracked separately per category):
- BIPOC-Owned Brands: Bath & Body, Fragrance, Hair Care, Makeup, Skincare, Tools & Brushes
- Black-Owned Brands: same six categories

**Category interest segments**: 200+ segments covering every subcategory in the catalog, each named as `{Category} Visited` or `{Category} Visited - Web`, including French Canadian variants throughout.

The naming pattern `*-Owned Brands * Visited` — tracking BIPOC and Black-Owned brand category visits as distinct segments — means Sephora is doing segmentation on social identity interest signals, separately from general category interest.

---

## Consent Architecture

The US site operates under CCPA's opt-out model: no consent banner appears on first load, and all trackers fire immediately on first page view. This is legally consistent with CCPA (California's law requires opt-out capability, not pre-consent).

Consent infrastructure is managed by Clarip (`sephora.clarip.com`). The public CDN configuration reveals:

```json
{
  "enableGPC": true,
  "enableEnforcementScope": false,
  "dataRightsRequestLinkEnabled": false,
  "enableDNSSUserFlow": false,
  "trackingOptScripts": true,
  "trackingOptApiCalls": true,
  "doNotSellCookieName": "ccpaConsentCookie",
  "doNotSellCookieExpirationAge": "5475"
}
```

Global Privacy Control (GPC) is honored (`enableGPC: true`), meaning browsers that send the `Sec-GPC: 1` header will have the opt-out applied. But `enableEnforcementScope: false` means enforcement is not fully scoped across all contexts. The Do Not Sell user flow is not shown by default (`enableDNSSUserFlow: false`) and the data rights request link widget is disabled (`dataRightsRequestLinkEnabled: false`). When opted out, `trackingOptScripts` and `trackingOptApiCalls` are both `true`, meaning scripts and API calls are blocked — the enforcement mechanism exists, it's just not surfaced in the default UI.

The `ccpaConsentCookie` stores the opt-out state with a 15-year effective expiry (5,475 days).

---

## Auth and Security Observations

**JWT tokens in localStorage**: Sephora stores all session credentials in localStorage rather than httpOnly cookies. `cookieBasedAuthEnabled: false` is explicit in `window.Sephora.configurationSettings`. The three tokens in localStorage for authenticated users:
- `accessToken` — primary JWT, approximately 1-hour expiry
- `refreshToken` — refresh JWT, longer-lived
- `ufeAuthToken` — UFE-specific auth token, used as the `x-api-key` for authenticated API calls

Any XSS vulnerability on sephora.com would expose all three. httpOnly cookies are immune to XSS token theft; localStorage is not.

**API key in URL query parameter**: The fulfillment options endpoint includes the API key as a URL query string parameter:
```
GET /gway/v1.0/getFulfillmentOptionsV2?apikey=nQc7BFt78yJBvfYDKtle9APd5RrX984i
```
The key (`nQc7BFt78yJBvfYDKtle9APd5RrX984i`) is the same one in `window.Sephora.sotAPIKey` and `window.Sephora.sdnUfeAPIUserKey`. It is a public client-side key by design, but embedding it as a URL query parameter means it appears in access logs, CDN logs, browser history, referrer headers, and any URL-recording analytics tool.

**Exposed client-side keys** (all public/client-intended by architecture):
- `sotAPIKey` / `sdnUfeAPIUserKey`: `nQc7BFt78yJBvfYDKtle9APd5RrX984i`
- `clientKey`: `a1YNj37xKo1e6uLGAXgG52Bp2qWaueNT`
- `sessionAISDKApiKeyUS`: `cloud3@e027d340-5a5b-4f97-8f19-f40a5b2e17d3Z1-2903910173578488841` (ZineOne)
- `arkoseLabsPublicKey`: `3481BEF5-335A-4FEA-B2FB-0D51CA252341`
- `googleMapsApiKey`: `AIzaSyAc8HqaalE1i33zYxHRX12ogmQSbTQyrJo`
- `roktAdPlacementAccountId`: `2448573684668432385`
- `constructorAPIKeyUS`: `u7PNVQx-prod-en-us`
- Bazaarvoice: 4 read tokens + 1 write token

**Forter**: Merchant ID (`e309da9b9aaf`) and session hash (`046ef445b83e462b9ea9f24001d9cbb3`) are embedded in CDN URL paths on `cdn0.forter.com`. Forter's client endpoint paths on the main domain are fully obfuscated (e.g., `/yhxZL/FMfr/VLbV/HYKx/xuc/rOYc0DD9ub5EhNE7tO/JnAvJhNA/LgF9/D3kMdAoC`), fired 4 times on homepage load.

**Passkeys**: `isPasskeyEnabled: true`, `isNewAuthEnabled: true` — Sephora has deployed passkey authentication alongside the new auth system.

---

## Machine Briefing

### Access & Auth

Akamai WAF blocks all curl requests with 403. Use a headed browser (Playwright with headed mode) or a session with valid browser fingerprint. Most first-party endpoints require a valid OAuth token issued by `/gapi/oauth/sdn/accessToken`.

The Constructor.io search API is fully open — no browser required.

### Endpoints

**Open (no auth)**

```bash
# Product search — returns full catalog with pricing, inventory, exclusivity flags
GET https://sephora.cnstrc.com/search/{query}?key=u7PNVQx-prod-en-us

# Paginate
GET https://sephora.cnstrc.com/search/fragrance?key=u7PNVQx-prod-en-us&num_results_per_page=100&page=2

# Browse by category (use category ID from URL)
POST https://api-developer.sephora.com/v1/browseSearchProduct

# Clarip consent config (public CDN)
GET https://cdn.clarip.com/sephora/donotsell.js

# Gladly chat config (public CDN)
GET https://cdn.gladly.com/chat-sdk/config/{audienceId}
```

**Requires session (obtain via Playwright)**

```bash
# OAuth token
POST https://www.sephora.com/gapi/oauth/sdn/accessToken
# Returns: access_token

# Session creation
POST https://www.sephora.com/gway/v1/dotcom/auth/v2/session
x-api-key: nQc7BFt78yJBvfYDKtle9APd5RrX984i

# GraphQL gateway
POST https://www.sephora.com/gway/v1/graph
x-api-key: nQc7BFt78yJBvfYDKtle9APd5RrX984i
authorization: Bearer {accessToken}
Content-Type: application/json

# GenAI config
GET https://www.sephora.com/gway/v1/genai-pa/v1/config
x-api-key: nQc7BFt78yJBvfYDKtle9APd5RrX984i
authorization: Bearer {ufeAuthToken}

# GenAI entrypoint prompts (fires on every page load)
POST https://www.sephora.com/gway/v1/genai-pa/v1/entrypoint-prompts
x-api-key: nQc7BFt78yJBvfYDKtle9APd5RrX984i
authorization: Bearer {ufeAuthToken}
Content-Type: application/json
{"data": {"entrypoint": "PLP", "categoryId": "{categoryId}", "channel": "rwd"}}
# Valid entrypoints: PDP, PLP, SRP, default

# Geolocation (returns lat/lon, zip, city from IP)
GET https://www.sephora.com/api/v3/util/location

# Fulfillment options (API key in URL)
GET https://www.sephora.com/gway/v1.0/getFulfillmentOptionsV2?apikey=nQc7BFt78yJBvfYDKtle9APd5RrX984i

# Currency conversion
GET https://www.sephora.com/gway/v1/currency-converter-service/exchange-rate-usd-cad

# Basket state
GET https://www.sephora.com/api/shopping-cart/basket
```

### Gotchas

- Akamai blocks non-browser user agents at the perimeter. Kasada `/fp` fingerprint endpoint returns 429 on repeated calls — rate-limited.
- `ufeAuthToken` and `accessToken` are different tokens used for different endpoints. GenAI APIs use `ufeAuthToken` as `x-api-key`, not `accessToken`. Both are in localStorage under their respective keys (stored as `{data: "{token}"}` JSON objects — parse before use).
- Constructor.io default page size is 20. Use `num_results_per_page` and `page` parameters for full catalog traversal. Total count is in `response.total_num_results`.
- Pricing and exclusivity flags are at `result.data.currentSku`, not at `result.data` top level.
- GraphQL at `/gway/v1/graph` returns "Invalid access token" without a valid bearer token — no schema introspection available unauthenticated.
- The `rcps_*` cookies are set by the server and control personalization caching — modifying them may alter what data the server returns.
- Braze segment data is in localStorage key `ab.storage.serverConfig.476615b3-3386-4e1c-a9fd-7e174eb9b8de`, parsed as `data.v.e` (array of segment name strings).
