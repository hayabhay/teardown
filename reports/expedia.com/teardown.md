---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Expedia — Teardown"
url: "https://expedia.com"
company: "Expedia"
industry: "Hospitality"
description: "Online travel platform for hotels, flights, cars, and vacation packages."
summary: "Kubernetes/Istio service mesh behind Akamai CDN and bot protection. The frontend splits across two PWAs — lotus-home-ui for the homepage, shopping-pwa for search and hotel detail pages — with all data flowing through a central GraphQL API. A proprietary Travel Pixel system syncs user identity across six Expedia Group sibling domains on every page load. Ad serving runs through an in-house system called Meso, configured via a public uciservice.com API."
date: "2026-04-16"
time: "02:58"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [React, GraphQL, Istio, Akamai]
trackers: [Google Ads, Facebook Pixel, Microsoft UET, The Trade Desk, Quantum Metric, Datadog RUM, OneTrust, DoubleClick, Qualtrics, TagCommander, Akamai Bot Manager]
tags: [travel, ota, cross-property-tracking, experiments, ftc-compliance, drip-pricing, session-replay, identity-graph, ad-tech, targeting]
headline: "Expedia's targeting API returns your inferred home city, travel dates, and lifetime-value tier to any script on the page."
findings:
  - "The /targeting-service/v3/adinfo endpoint returns the full ad targeting vector — inferred origin city, destination, travel dates, number of adults, customer lifetime value tier, and device ID — accessible to any script running in the browser session."
  - "Five A/B experiments prefixed USFTC_ are actively running on hotel search, including one named 'Post_go_live_Nightly_base_rate_only_display' — compliance launched, but Expedia is still testing whether to show nightly rates instead of total price."
  - "Every visit to expedia.com fires silent background requests to six Expedia Group sibling domains (Hotels.com, Orbitz, Travelocity, VRBO, and two ExpediaPartnerCentral endpoints) to sync a cross-property tracking identity before the page finishes loading."
  - "333 A/B test assignments are readable in window.__PLUGIN_STATE__ on hotel pages, exposing internal experiment names, bucket assignments, and unreleased product signals including AI-powered hotel comparison, conversational AI, and GenAI review summaries."
  - "The Meso ad system's public config API at uciservice.com marks Google Publisher Tags and its own display ad scripts as gdprCompliant: false — they load regardless of consent state."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Expedia runs one of the largest online travel platforms in the world and, as part of Expedia Group, owns Hotels.com, Orbitz, Travelocity, VRBO, and ExpediaPartnerCentral. The technical architecture reflects that scale: a Kubernetes service mesh, aggressive bot gating, a proprietary cross-domain identity system, and an in-house ad platform with its own public config API. The most notable things aren't the trackers -- they're the operational artifacts: a targeting API that hands your travel intent to ad exchanges, FTC compliance experiments that are still testing how much to disclose, and a cross-property identity sync that links your browsing across six travel brands on every page load.

---

## Architecture

The server stack is Kubernetes/Istio. Every response carries `server: istio-envoy`, `x-envoy-upstream-service-time`, and exposed B3 distributed tracing headers (`trace-id`, `x-b3-traceid`). Akamai handles CDN and bot protection -- the `_abck` cookie is Akamai Bot Manager's fingerprint token. Direct curl requests return HTTP 429 immediately, headless browsers get a bot challenge page, and only a headed browser with a warm session moves through normally. The `x-app-info` header on the 429 response exposes the internal WAF app name: `captcha-pwa,fe7da7affcbe69d2775cc907920b9b3e3ca7a196`. The `x-page-id` and `x-hcom-origin-id` headers surface internal routing identifiers like `wildcard-challenge-handler`.

The frontend splits across two named PWAs. The homepage runs `lotus-home-ui`; search results and hotel detail pages run `shopping-pwa`. JavaScript bundles are served from `c.travel-assets.com` with content-hashed filenames. The named modules -- `bernie`, `egds`, `graphql`, `pap`, `vendor`, `blossom-*` -- map to Expedia's internal frameworks: Bernie is the UI component system, EGDS is the Expedia Group Design System, and Blossom is a page/section rendering layer that composes regions and flex content. GraphQL has its own dedicated bundle. Source maps exist (`sourceMappingURL` in bundles) but point to `bernie-assets.s3.us-west-2.amazonaws.com`, which returns 403 -- the bucket name confirms the internal framework name.

All page data flows through `POST /graphql`. GraphQL introspection is blocked with the message "Not allowed to inspect schema from the outside world" (error code: `FORBIDDEN_REQUEST`). Validation errors still work as a schema oracle: `trips` and `loyalty` are valid root query fields (both require a `ContextInput!` with `DeviceInput!`); querying `hotels`, `search`, `user`, `flights`, or similar returns "Cannot query field X on type Query."

An `x-cgp-info` header (value: `noJvmRouteSet;{UUID}`) appears on responses -- Expedia Group internal routing metadata left in production response headers.

The signup page (`/auth/`) is notably stripped down: only Datadog RUM and Expedia's own clickstream fire there. No Facebook Pixel, no Trade Desk, no ad tags. The auth flow is isolated from the marketing stack.

The `eg-affiliates-context` plugin state exposes an internal hostname: `lotus-home-ui.rcp.us-west-2.partnerexperiences.prod.exp-aws.net` -- an RCP (Rapid Connect Platform) URL not intended to be public.

---

## Cross-Property Identity Sync

On every homepage load -- no login, no interaction required -- the browser silently reaches out to six Expedia Group sibling domains to sync the visitor's tracking identity:

- `www.hotels.com/trvl-px/v2/get`
- `www.orbitz.com/trvl-px/v2/get`
- `www.travelocity.com/trvl-px/v2/get`
- `www.vrbo.com/trvl-px/v2/get`
- `www.expediapartnercentral.com/trvl-px/v2/get`
- `onboarding.expediapartnercentral.com/trvl-px/v2/get`

These are credentialed GET requests triggered by `b.travel-assets.com/travel-pixel-js/1.0.0/app.js`, Expedia's Travel Pixel system. The config file at `b.travel-assets.com/travel-pixel-js/1.0.0/config/www.expedia.com-prod-config.json` identifies this deployment as `expediaDC` (inferred: Data Capture) and lists seven targets as `xshopUrls` -- cross-shop tracking URLs. A seventh domain (HomeAway) appears in the config but was not observed firing in the network log; HomeAway now redirects to VRBO, and the config entry may be stale. Additional trvl-px sync calls go through `www.trvl-px.com` as a neutral intermediary domain.

The identity synchronization operates on four layers:

1. **xdid** -- cross-domain ID cookie, format `UUID|timestamp|brand`. Set on every Expedia Group domain visited. The `trvl-px/v2/pix` endpoint response confirms this is the active sync: `{"o":false}`.

2. **eg_ppid** -- Expedia Group Publisher Provided ID. The `POST /trvl-px/v2/ppid` endpoint returns a persistent UUID from a server-side "Keychain API": `{"ppid":"c2185b73-bebe-43f4-b0c8-745607b9cc98","message":"ppid found in Keychain API"}`. This PPID is sent to Google Ads for publisher-provided identity matching -- a cookieless targeting mechanism that uses first-party IDs to match users to Google's ad graph.

3. **DUAID** -- Device User Agent ID. Set with 5-year expiry on `.expedia.com` via a double-set pattern: two consecutive Set-Cookie headers, the first session-only (`Max-Age=-1`), the second persistent (`Max-Age=157680000`). The persistent cookie wins. DUAID appears in the targeting service response (as `mc1`) and in app install banner URLs as an AppsFlyer attribution parameter, tying web sessions to app installs.

4. **ttd_TDID** -- The Trade Desk unified ID. Stored as a first-party cookie on expedia.com (partner ID `g66pnr7`, 7-day expiry, `SameSite=Strict`) via `match.adsrvr.org`. This is an explicit first-party storage strategy -- The Trade Desk's ID is written to Expedia's own domain to bypass ITP and Safari's third-party cookie blocking.

Visiting any one Expedia Group property sets these identifiers across all of them.

---

## Targeting Service: The Full Ad Vector

On hotel search pages, the `/targeting-service/v3/adinfo` endpoint returns the complete targeting profile that gets passed to ad exchanges. The response includes:

```json
{
  "dc": "201",
  "dcity": "2621",
  "dmetroarea": "178293",
  "lcity": "3132",
  "lmetroarea": "178305",
  "lsp": "206",
  "hs": "T", "fs": "F", "cs": "F",
  "clv18": 0,
  "mc1": "{DUAID}",
  "numadults": "2",
  "ets": "05-01-2026",
  "ete": "05-03-2026"
}
```

That's the inferred origin city (`lcity`, `lmetroarea`, `lsp` -- all derived from IP), the destination, exact travel dates, number of adults, intent flags (hotel search active, flights/cars not), customer lifetime value tier (`clv18`), and the device tracking ID. This is accessible to any script running in the browser session without additional authentication. It's the exact data that determines what price and what ads the visitor sees.

On hotel detail pages, the DoubleClick conversion pixel URL passes the DUAID directly as `userId`, along with the page context and travel dates -- linking Expedia's first-party device ID to Google's identity graph with full travel intent attached.

---

## The Experiment Store

On any hotel search or detail page, `window.__PLUGIN_STATE__['experiment-store'].experimentStore.exposures` contains the full set of A/B test assignments for that session. During investigation, hotel search pages carried 333 entries -- each with internal experiment name, integer experiment ID, bucket assignment, and `runType` (3 or 4, likely server-side vs. client-side). The homepage carried 95 experiments. This data is available to any script running on the page.

Notable signals from the experiment store:

**AI product roadmap:**
- `WEB_AI_Compare_SRP` (exp 69285) -- AI-powered property comparison on search results
- `AI_Search_MVP_Web` (exp 55482) -- AI search minimum viable product
- `Prebooking_traveller_QnA_using_Reviews_and_Property_Content_Gen_AI` (exp 49620) -- pre-booking Q&A using GenAI
- `CL_conversations_WEB` (exp 47703, bucket 1 = active) -- conversational AI, live
- `Chatbot_FAB_for_PWA_EGTnl` -- chatbot floating action button
- `Review_Summarisation_Feature_Gate_for_Web` (exp 51482, bucket 1) -- AI review summarization, live
- `Review_Summary` (exp 50552, bucket 1) -- AI review summaries, live

**Buy-now-pay-later:**
- `WTR_AFFIRM_ONSITE_MESSAGE_SRP_WEB_EGTNL` (exp 47136) -- Affirm BNPL messaging on hotel search results

**Campaign signals:**
- `BEX_Feb_March_Sale_campaign` -- seasonal sale experiment
- `MCKO_Big_Batch_Test_Web` -- multi-variant batch test

The `isEgtnlBrand: true` flag on many entries indicates these experiments run across the EGTNL brand cluster (EAN, Expedia, Lodging brands) simultaneously -- not just expedia.com.

**Abandoned analytics:** The experiment store also reveals `beaconOffConfig.rulesMatched: "ALL_BEACON_OFF"` -- Adobe Analytics (suite `expediaglobaluserdev`) and Tealium are both explicitly disabled, replaced by Expedia's proprietary EG Clickstream.

---

## FTC Fee Transparency: Still Running Experiments

In 2024, the FTC finalized rules on drip pricing and junk fee disclosure for travel. In the experiment store, five experiments prefixed `USFTC_` are actively running on hotel search pages:

1. `USFTC_Price_Summary_Increase_prominence_of_the_nightly_price` (exp 60720, bucket 1)
2. `USFTC_Post_go_live_Nightly_base_rate_only_display` (exp 61926, bucket 1)
3. `USFTC_SRP_Bottom_sheet_to_educate_travellers_of_total_price` (exp 60731, bucket 1)
4. `USFTC_Coachmark_Slimmer_coachmark` (exp 62251, bucket 2)
5. `USFTC_Coachmark_Logic_improvements_on_Web` (exp 62519, bucket 0 = control)

Experiment 61926's name -- `USFTC_Post_go_live_Nightly_base_rate_only_display` -- explicitly flags a post-compliance state: the initial FTC display launched ("go live"), but Expedia is still testing whether to show nightly base rates only instead of the total price. Whether displaying only the nightly rate satisfies the FTC's total price disclosure requirement is an open question; the experiment name frames it as a variation being tested against a total-price baseline.

Experiments 60731 and 62251 concern coachmarks -- UI tooltips that educate users about the total price breakdown. The "Slimmer coachmark" variant tests how minimal the disclosure UI can be while still being present.

California adds a second compliance layer. When hotel search was loaded from San Jose (confirmed by Akamai's `akamai-request-bc` header: `n=US_CA_SANJOSE`), the URL was automatically appended with `pwaDialog=fee-inclusive-pricing-sheet`. Two California-specific experiments run in parallel:
- `California_Coachmark_Web_Audience_Targeting` (bucket 1)
- `California_Right_Aligned_Price_Summary_and_full_width_CTA` (bucket 2)

California AB 537 (effective 2024) requires total price display inclusive of all mandatory fees. Expedia's geo-detected parameter injection is the compliance mechanism for that law, distinct from the federal FTC experiments.

---

## Consent and Pre-Consent Tracking

**OneTrust configuration** (version 202305.1.0 -- from May 2023, roughly three years behind the current release):
- Consent ID: `634826f3-3ea8-4c02-8e82-05e6ffb4e293`
- `SkipGeolocation: true` -- no geo-based consent differentiation
- RuleSet count: 1 (named "Global", type "CCPA")
- Consent groups: C0001 (Strictly Necessary), C0002 (Performance), C0003 (Functional), C0004 (Targeting) -- all default to `:1` (accepted) in the OptanonConsent cookie
- `browserGpcFlag=0`, `isGpcEnabled=0` -- Global Privacy Control signal from browsers set to "do not sell" is received and ignored
- The single CCPA-type ruleset covers all users who reach www.expedia.com without geo-routing to a local domain. EU visitors may be handled by separate country-domain configs (expedia.co.uk, expedia.de, etc.), which were not investigated.

**Pre-consent tracking** -- the OptanonConsent cookie was set with `interactionCount=0` and all consent groups accepted. Zero user interactions, fully accepted consent. The following trackers fired before any user touched the consent banner:

- **Facebook Pixel** (`_fbp` cookie, `window._fbq`, `connect.facebook.net/en_US/fbevents.js`) -- fires on page load
- **The Trade Desk** (`ttd_TDID` cookie, `match.adsrvr.org/track/rid`) -- fires on page load
- **Google Ads** (`_gcl_au`, `googleads.g.doubleclick.net/pagead/viewthroughconversion/786429470/`) -- fires on page load
- **Microsoft UET/Bing** (`_uetsid`, `_uetvid`, `bat.bing.com/bat.js`) -- fires on page load
- **DoubleClick** (`ad.doubleclick.net/activity`) -- fires on page load

The TagCommander data layer (`window.tc_vars`) exposes the full session context to any script on the page: `privacy_gdpr_consent: true` (pre-set), `privacy_ccpa_consent: true` (pre-set), `identifiers_device_user_agent_id` (DUAID), `point_of_sale_eg_pos_id: "EXPEDIA_US"`, `is_EU_POS: false`, `environment: "prod"`, plus 80+ additional fields covering all possible booking states. This data is set before any user interaction.

**Quantum Metric session replay** fires heavily on hotel search and hotel detail pages (11 POSTs to `ingest.quantummetric.com/horizon/expedia` per page). A companion hash-check endpoint (`rl.quantummetric.com/expedia/hash-check`) runs on both pages. Quantum Metric is gated by experiment on the homepage (`Bernie_quantum_metrics`, bucket 0 = disabled during this session). On hotel pages where it's active, it records full session interactions -- clicks, scrolls, form inputs -- for session replay analysis.

**Qualtrics survey intercept** (`siteintercept.qualtrics.com/WRSiteInterceptEngine/Targeting.php`) fires on hotel detail pages, running real-time targeting logic to decide whether to show a user survey.

---

## Ad System Architecture (Meso/UCI)

Expedia's in-house ad system is called Meso. Ad configuration is served by `uciservice.com`, a separate domain with no authentication requirement. The toolkit endpoint pattern is:

```
GET https://www.uciservice.com/ds/api/v1/toolkit/{pageId}/{siteId}/{locale}/{variant}
```

For hotel search: `page.Hotels.Search/1/en_US/pwa`
For hotel detail: `page.Hotels.Infosite.Information/1/en_US/pwa`

These return the full ad slot configuration: slot names, dimensions, media queries, DFP network paths, and the script resources to load. All public, no authentication.

The DFP network paths from the hotel search config:
- `/23171577/expedia.us_en/hotels/results/CM1` (728x90)
- `/23171577/expedia.us_en/hotels/results/CM2` (468x60)
- `/23171577/expedia.us_en/hotels/results/R1` (160x600, with refresh cap 4)
- `/23171577/expedia.us_en/hotels/results/R2` (160x600)
- `/23171577/expedia.us_en/hotels/results/CM3` (300x250)

Active ad experiment: `Split_View_Side_by_side_BEXG_H` (id: 51993) -- present on both hotel search and PDP configs.

The three ad scripts loaded via this config are explicitly marked `"gdprCompliant": false`:

```json
{"src": "https://securepubads.g.doubleclick.net/tag/js/gpt.js", "gdprCompliant": false}
{"file": "meso-gpt.js", "gdprCompliant": false}
{"file": "meso-displayad.js", "gdprCompliant": false}
```

This appears in both the hotel search and hotel detail toolkit configs. In Meso's architecture, `gdprCompliant: false` means the CMP gate is bypassed -- these scripts load regardless of consent state.

On hotel detail pages, Google's Privacy Sandbox Private Aggregation API fires (`POST /.well-known/private-aggregation/report-shared-storage` to `www.googleadservices.com` -- 12 requests per PDP visit). This is the cookieless successor to conversion tracking, running alongside the legacy DoubleClick pixel stack.

The `window.meso` global exposes the ad system's runtime: `adcontext`, `privacy`, `beacons`, and `viewability` modules. The `window.UNIQODO` and `window.UNIQODO_S` globals indicate the Uniqodo coupon system is active. A second promotion system, PromotionX (`t.promotionx.io/coordinator-123.js`), also loads on the homepage. Both appear to be coupon/discount coordination layers; whether they serve different functions (display vs. code-based) is unresolved.

---

## Cookie Inventory

Key cookies set on a first visit to `www.expedia.com`, no account required:

| Cookie | Domain | Expiry | Purpose |
|--------|--------|--------|---------|
| `EG_SESSIONTOKEN` | `.expedia.com` | 4 years | Protobuf-encoded session/identity token (inferred from base64 prefix) |
| `MC1` / `DUAID` | `.expedia.com` | 5 years | Device User Agent ID -- double-set (session then persistent) |
| `eg_ppid` | (session) | Session | Expedia Group Publisher Provided ID |
| `xdid` | (session) | Session | Cross-domain ID: `UUID\|timestamp\|brand` |
| `HMS` | `.expedia.com` | 30 min | Session token |
| `tpid` | -- | -- | Travel Point ID / brand identifier (`v.1,1`) |
| `iEAPID` | -- | -- | EAP (Employee/Affiliate/Partner) ID |
| `sdui-trips-enabled` | -- | -- | Server-driven UI feature flag (`0`) |
| `_abck` | `.expedia.com` | 1 year | Akamai Bot Manager fingerprint |
| `bm_sz` / `bm_so` / `bm_lso` | `.expedia.com` | Variable | Akamai additional bot signals |
| `ttd_TDID` | `.expedia.com` | 7 days | The Trade Desk unified ID (first-party storage) |
| `_fbp` | -- | Session | Facebook browser pixel ID |
| `_gcl_au` | -- | ~90 days | Google Click ID |
| `_uetsid` / `_uetvid` | -- | Session/Persistent | Microsoft UET session/visitor |
| `_dd_s` | -- | ~15 min | Datadog RUM session |
| `cesc` | -- | Session | Campaign tracking: `lmc`, `amc`, `entryPage`, `visitNumber`, `cidVisit` |
| `OptanonConsent` | -- | 1 year | OneTrust consent state -- all groups `:1`, `interactionCount=0` |
| `NavActions` | -- | -- | Navigation behavior tracking |
| `eg_adblock` | -- | -- | Ad-block detection result (`e=0` = no ad blocker) |

---

## Open Threads

**uqd.io** -- `www.uqd.io/123.js` loads on the homepage alongside the other marketing tags. The domain name pattern (three-letter `.io`) and script naming (`123.js`) match several small adtech or analytics vendors. Not identified during investigation.

**PromotionX + Uniqodo** -- Two distinct promotion/coupon systems active simultaneously: PromotionX (`t.promotionx.io`) and Uniqodo (`window.UNIQODO`). Their division of responsibility wasn't resolved -- both likely handle coupon coordination but possibly for different channels.

**GraphQL schema** -- Introspection is blocked. The validation oracle confirms `trips` and `loyalty` as valid root fields; a broader probe with a browser session on a hotel page could enumerate more. Attempts from curl were rate-limited before deeper schema mapping was possible.

**HomeAway** -- Listed in the trvl-px config `xshopUrls` but not observed firing in the network log. HomeAway has been largely absorbed into VRBO; the config entry may be stale.

---

## Machine Briefing

### Access & auth

Direct curl requests to `www.expedia.com` return 429 immediately. The Akamai Bot Manager (`_abck` cookie) gates all requests. A headed browser session with real user-agent and cookie jar works normally. Headless browser gets a bot challenge page. For API access without a full browser session, a valid `_abck` + `bm_sz` cookie pair is required, but these are challenge-bound and expire within hours.

The GraphQL API requires browser-context headers (Origin, Referer, User-Agent) and valid session cookies. `EG_SESSIONTOKEN` and `HMS` are the primary session markers.

Public, unauthenticated access:
- `uciservice.com` ad config endpoints (no auth, no rate limiting observed)
- `b.travel-assets.com` Travel Pixel config JSON

### Endpoints

**uciservice.com ad config -- open**
```
GET https://www.uciservice.com/ds/api/v1/toolkit/page.Hotels.Search/1/en_US/pwa
GET https://www.uciservice.com/ds/api/v1/toolkit/page.Hotels.Infosite.Information/1/en_US/pwa
```
Returns full ad slot config, DFP paths, and resource URLs. No auth. Response is JSON.

**Travel Pixel config -- open**
```
GET https://b.travel-assets.com/travel-pixel-js/1.0.0/config/www.expedia.com-prod-config.json
```
Returns the xshopUrls cross-property sync targets and deployment name.

**Targeting service -- requires browser session**
```
GET https://www.expedia.com/targeting-service/v3/adinfo?uuid={DUAID}&siteId=1&pageName=Hotel.Search
```
Returns full ad targeting vector: origin/destination, travel dates, CLV tier, device ID. 429 on direct curl.

**PPID endpoint -- requires browser session**
```
POST https://www.expedia.com/trvl-px/v2/ppid
```
Returns: `{"ppid":"{UUID}","message":"ppid found in Keychain API"}`

**GraphQL -- requires browser session + cookies**
```
POST https://www.expedia.com/graphql
Content-Type: application/json

{"query": "{ trips(context: ...) { ... } }"}
```
Introspection blocked. Validation errors useful for schema probing. 429 on direct curl.

**Clickstream / analytics -- fire-and-forget**
```
POST https://www.expedia.com/cl/2x2.json
POST https://www.expedia.com/egcs/v2/collect
POST https://www.expedia.com/api/uisprime/track
```
Return 202/204. Both `egcs/v2/collect` and `api/uisprime/track` are explicitly disallowed in robots.txt.

### Gotchas

- **429 on curl**: Akamai fires before any application-layer logic. All API testing requires a browser session.
- **Experiment store location**: `window.__PLUGIN_STATE__['experiment-store']` only exists on hotel search and detail pages, not the homepage. The homepage carries its own smaller set of 95 experiments.
- **GraphQL rate limit**: Introspection probing from curl triggers 429 with a distinct `{UUID}` error identifier in the response body (not structured JSON).
- **Double cookie set**: `MC1`/`DUAID` appear twice in response headers -- first as session cookies (Max-Age=-1), then as 5-year persistent cookies. The persistent value wins.
- **uciservice.com**: The `src` values for `meso-gpt.js` and `meso-displayad.js` in the toolkit response contain a literal newline (`\n`) before the filename -- URL construction artifacts. Strip whitespace before using.
- **trvl-px cross-domain requests**: These fire as credentialed GET requests (the trvl-px config uses `{credentials: "include"}`), meaning the target domains receive any existing cookies from those domains.
- **TTD first-party cookie**: The Trade Desk ID is stored on `.expedia.com` as a first-party cookie with 7-day expiry and `SameSite=Strict` -- designed to survive third-party cookie blocking.
