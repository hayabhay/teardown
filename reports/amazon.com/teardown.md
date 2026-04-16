---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Amazon — Teardown"
url: "https://amazon.com"
company: Amazon
industry: Retail
description: "Global e-commerce marketplace with Prime membership, streaming, and cloud services."
summary: "Amazon.com runs on CloudFront CDN with Akamai layered for bot protection. The frontend uses a proprietary module loader (window.P / AmazonUIPageJS) and a custom jQuery fork. A/B testing runs through an internal Weblab system via /cdp/usage/GetWeblabTreatment. Authentication uses Amazon's own OpenID 2.0 identity provider. The site runs four parallel first-party ad tracking systems (ONO, PAETS, PAA, SASH SafeFrame) alongside Google Display and DoubleClick on search pages. Prime Video infrastructure — DRM handshakes, a telemetry pipeline, and persistent device IDs — bootstraps on every page load for all visitors."
date: 2026-04-15
time: "23:56"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack: [CloudFront, Akamai, AmazonUI, jQuery fork, OpenID 2.0]
trackers: [Amazon CSM/CSA, Amazon ONO, Amazon PAETS, Amazon PAA, Prime Video Telemetry, Google AdSense, Google DoubleClick, Google Privacy Sandbox]
tags: [e-commerce, advertising, privacy-sandbox, drm, bot-detection, source-map, a-b-testing, first-party-ads, ai-blocking, behavioral-telemetry]
headline: "Amazon's ad SafeFrame ships a public source map containing a live AWS Lambda endpoint, its API key, internal repo URLs, issue tracker links, and 10 active experiment names."
findings:
  - "The SASH ad iframe source map at m.media-amazon.com is publicly accessible and contains full TypeScript source for Amazon's ad sandbox, including an AWS Lambda metrics endpoint, its API key, links to code.amazon.com repos with specific commit hashes, SIM/shepherd issue tracker IDs, and internal wiki URLs."
  - "Amazon's search pages fire 6 calls to Google's Privacy Sandbox Private Aggregation API plus DoubleClick and AdSense — Amazon serves Google display ads against its own search results while simultaneously competing with Google in advertising."
  - "The homepage fetches a Widevine DRM license and assigns a persistent Prime Video device ID in localStorage to every visitor — including unauthenticated ones — before any user interaction."
  - "Bot detection scripts ship a compiled bytecode VM called RXLang that executes obfuscated signal collection for scroll, click, mouse movement, and typing metrics via rx.ex64() — resisting static analysis of what exactly is collected."
  - "robots.txt blocks 47 named AI crawlers individually — three variants for Anthropic's Claude, six for Google's AI products, and entries for every other major LLM company — the most granular AI data embargo observed."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Amazon.com fires 118 requests on a cold homepage load. Fifty-four of them are video segments for a Prime Video autoplay that fetches a DRM license before you touch anything. The rest split between Amazon's own behavioral telemetry, four parallel ad tracking systems, and — on search pages — Google's ad infrastructure running alongside Amazon's own. A public source map on the ad SafeFrame ships full TypeScript source with internal Amazon URLs, experiment names, and an API key.

## Architecture

Amazon.com sits behind CloudFront with Akamai layered on top for bot filtering. A `HEAD` request from curl returns a 503 from CloudFront (`x-cache: Error from cloudfront`) — the CDN terminates requests from unrecognized user agents before they reach origin. Response headers expose the CloudFront PoP (`x-amz-cf-pop: SFO5-P2`) and an internal request ID (`x-amz-rid`). HSTS is set with `max-age=47474747` (~550 days).

The frontend runs on `window.P` (also `window.AmazonUIPageJS`), Amazon's proprietary module loader that replaced RequireJS. Scripts are wrapped in a `guardFatal` pattern — error boundaries at the module level. jQuery is `AmazonUIjQuery`, a locked-down fork maintained separately from upstream.

Authentication uses Amazon's own OpenID 2.0 identity provider. The form action is `/ax/claim` — an identity-assertion model. No Google or Apple OAuth exists. CSRF protection uses `anti-csrftoken-a2z`. A/B testing runs through Weblab, Amazon's internal experiment system, with treatments assigned via `POST /cdp/usage/GetWeblabTreatment` and labeled T1, T2 (variants) and C (control).

The marketplace ID `ATVPDKIKX0DER` (US) appears across multiple systems — `ue_mid` global, ARA conversion URLs, PATC config — as a consistent cross-system storefront identifier.

## The Bot Wall

Amazon's `robots.txt` names 47 distinct `User-agent` entries — nearly all AI crawlers — each with `Disallow: /`:

- **Anthropic**: `ClaudeBot`, `Claude-User`, `Claude-SearchBot` (three separate entries)
- **OpenAI**: `GPTBot`, `ChatGPT-User`, `OAI-SearchBot`
- **Google**: `Google-Extended`, `Gemini-Deep-Research`, `GoogleAgent-Mariner`, `Google-NotebookLM`, `Google-CloudVertexBot`, `GoogleAgent-Shopping` (six entries)
- **Microsoft**: `Copilot`, `CopilotNative`, `CopilotSapphire`
- **Meta**: `meta-externalagent`, `meta-externalfetcher`
- **Others**: `Devin`, `AI2Bot`, `Ai2Bot-Dolma`, `cohere-ai`, `MistralAI-User`, `PerplexityBot`, `Perplexity-User`, `DuckAssistBot`, `YouBot`, `Brightbot`, `Diffbot`, `FriendlyCrawler`, `img2dataset`, `imgproxy`, `PetalBot`, `PanguBot`, `Scrapy`, `EtaoSpider`, `omgili`, `Bytespider`, `Thinkbot`, `Timpibot`, `VelenPublicWebCrawler`, `aiHitBot`, `iaskspider`, `wpbot`, `ISSCyberRiskCrawler`, `SemrushBot-SWA`, `Sidetrade indexer bot`

The naming granularity is deliberate. Amazon blocks `ClaudeBot` as a general crawler and separately blocks `Claude-User` (web browsing) and `Claude-SearchBot` (search retrieval). Google's AI gets six entries covering training data collection (`Google-Extended`), deep research browsing (`Gemini-Deep-Research`), agent navigation (`GoogleAgent-Mariner`), notebook retrieval (`Google-NotebookLM`), cloud vertex pipelines (`Google-CloudVertexBot`), and shopping queries (`GoogleAgent-Shopping`).

This is not anti-scraping — generic scrapers like `SemrushBot` appear in the same file. It is a product catalog, pricing, and review data embargo targeting AI training and inference-time retrieval. Amazon trains its own large models for Alexa+ and internal systems, creating a direct incentive to keep this data out of competitors' pipelines.

The `robots.txt` also contains ~100 disallowed paths that trace legacy URL structures: `/exec/obidos/` (very old), `/gp/`, `/dp/`, `/hz/`, `/ap/`, `/wlp/`. No sitemap reference exists.

## Prime Video Embedded in the Shopping Homepage

Loading `amazon.com` in a clean browser triggers Prime Video infrastructure before any user interaction:

1. `GET /cdp/lumina/getDataByJavaTransform/v1/internal/playbackEnvelope.java` — playback metadata for the hero banner video
2. `POST /playback/prs/GetLivePlaybackResources` — live playback resource manifest (200)
3. `POST /playback/drm/GetWidevineLicense` — Widevine DRM license handshake (200)
4. `POST /cdp/playback/pes/StartSession` — Prime Video session start (400 — fails without an account)
5. `GET /1/action-impressions/1/OE/dv-xp-player/...` — player telemetry (fires 3 times)

The DRM license completes successfully even without a signed-in account. The session start fails (400), so playback doesn't fully initialize, but the DRM round-trip was exercised. Fifty-four video CDN segments are fetched from `a151live-pv-ta-amazon.akamaized.net` on the homepage alone.

The Prime Video SDK also stores a device identifier in localStorage under `atvwebplayersdk_atvwebplayer_deviceid` with a value of `CardInstance{randomUUID}`. This ID is assigned before login and persists across browser sessions. An unauthenticated visitor gets a device ID registered in Amazon's Prime Video system before ever creating an account.

Two Prime Video telemetry domains are active on homepage load: `global.telemetry.insights.video.a2z.com` (bootstrap) and `prod.us-east-1.sonar.prime-video.amazon.dev` (quality monitoring). These fire across page types, not just video pages.

## Google on Amazon's Search Pages

Amazon's search result pages fire requests to Google's ad infrastructure on every load:

- `pagead2.googlesyndication.com/pagead/gen_204` — Google AdSense impression pixel (18 calls on a laptop search)
- `googleads4.g.doubleclick.net/pcs/view` — DoubleClick view tracking (2 calls)
- `www.googleadservices.com/.well-known/private-aggregation/report-shared-storage` — Google Privacy Sandbox Private Aggregation API (6 POST calls)
- `www.googletagservices.com/agrp/prod/model_person_country_code_US_person_region_code_43415f383037.json` — geolocation-keyed user model

The Privacy Sandbox calls are the most architecturally notable. `/.well-known/private-aggregation/report-shared-storage` is Chrome's Privacy Sandbox Private Aggregation API — a mechanism for cross-site ad measurement without third-party cookies. Amazon's search pages run shared storage worklets that report ad effectiveness metrics to Google's infrastructure. This is Chrome-only, reflecting an explicit choice to participate in Google's post-cookie measurement architecture.

The `googletagservices.com` request fetches a JSON user model file keyed by country and region. The hex suffix `43415f383037` decodes to ASCII `CA_807` — a geographic code. Google is doing per-region ad model personalization for display targeting on Amazon's own search results.

Amazon competes with Google in advertising, cloud, and devices. The same search result page that fires Amazon's own `ONO` ad pixels also reports to DoubleClick.

## The SafeFrame Source Map

The SASH (SafeFrame Ad Shell) iframe loads on search pages from `m.media-amazon.com/images/S/sash/JpTPeSvpHkZgvTe.js`. This file ships a publicly accessible source map at:

```
https://m.media-amazon.com/images/S/sash/37VXeyh5_Kf3tzA.json
```

The source map is 130KB and contains full TypeScript source for Amazon's ad sandboxing system — 60 source files from `@amzn/apejs-instrumentation`, `@amzn/creative-rendering-monitor`, and `@amzn/safeframe-model` internal packages. This is not minified code with type hints stripped — it is the developer source with comments intact.

### Lambda Metrics Endpoint and API Key

Two source files expose a live AWS Lambda endpoint and its API key:

`awsMetricLoggerApiKey.ts`:
```typescript
export const API_KEY: string = 'aUAZqFtiIp6VxqpW3coqZ2JdZnV3RN9S8yKMRIdJ';
```

`awsMetricBatcher.ts`:
```typescript
export const METRICS_ENDPOINT = 'https://qdbx3pbnx6veby23pzgaowu3q40tmmrr.lambda-url.us-east-1.on.aws';
export const STORAGE_KEY = 'APE_CW_METRICS';
export const BATCH_SIZE = 10;
```

The batcher accumulates metrics in `localStorage['APE_CW_METRICS']` and flushes up to 10 at a time via `navigator.sendBeacon` on page unload. The POST body structure:

```typescript
type PostMetricDTO = {
    metrics: Metric[];
    xApiKey: string;
};

type Metric = {
    metricName: string;
    timestamp: number;
    value: number;
    dimensions: Record<string, string>;
};
```

The endpoint responds: 400 to unauthenticated GET, 403 to POST without the correct `xApiKey`. The key is in the source map.

### Internal System References

Source file comments reference Amazon's internal infrastructure:

- `code.amazon.com/packages/JavelinPrimingServiceCDK/...` — internal CDK service repo
- `code.amazon.com/packages/SafeFrameClient/blobs/e6d7afa4b0c567ab7ba245a07efd974cd8f3a6b6/` — SafeFrame repo at a specific git commit hash
- `sim.amazon.com/issues/CPP-41009`, `CPP-39529`, `CPP-40575`, `ASPEN-9994` — SIM issue tracker tickets
- `issues.amazon.com/issues/APEX-4377` — cookie access disable decision
- `issues.amazon.com/issues/CPP-24902` — geolocation disable decision
- `shepherd.a2z.com/issues/e4e8cd86-419a-4e1a-96ff-b20a6615b8b5` — user agent disable decision
- `tt.amazon.com/0156195085` — iOS touchstart bug ticket (with an active TODO: "Verify this is still needed")
- `t.corp.amazon.com/HEDWIGTT-300` — corp ticket tracker
- `tiny.amazon.com/2xu3ne6j/SafeframeCSP` — internal short URL for CSP config
- `info.analytics.a2z.com/#/docs/data_collection/csa/events` — internal analytics documentation
- `w.amazon.com/bin/view/ClientSideMetrics/` — internal wiki

### Active Weblab Experiments

The `weblabs.ts` source declares 10 active experiments with direct links to `weblab.amazon.com`:

| Weblab ID | Purpose |
|-----------|---------|
| `ADPT_SF_HOMEPAGE_ART_THEMING_1298909` | Homepage art event styling |
| `ADPT_SF_LOW_RATE_METRIC_LOGGING_1256362` | Low-rate metric sampling |
| `APM_STORES_JPS_JRS_SAFEFRAME_CLICK_TRACKING_PAINTER_TEST_1259727` | Retail click tracking |
| `APM_STORES_JPS_JRS_SAFEFRAME_VIEW_RATE_EXPERIMENT_1289633` | Viewability for CA, JP, UK |
| `APM_STORES_JPS_JRS_SAFEFRAME_VIEW_RATE_EXPERIMENT_TIMEOUT_1373183` | Viewability timeout for ES, FR |
| `APM_STORES_JPS_JRS_SAFEFRAME_NEW_VIEWABILITY_TRACKER_1354300` | New viewability tracker |
| `APM_STORES_JPS_JRS_SAFEFRAME_LIGHT_ADS_EVERYWHERE_1362485` | "Light ads everywhere" |
| `APM_STORES_JPS_JRS_SAFEFRAME_IFRAME_READY_RETRY_1374491` | iframe ready retry |
| `APM_STORES_JPS_JRS_SAFEFRAME_DISABLE_POSTMESSAGE_1327371` | Disable window.top access |
| `APM_STORES_JPS_JRS_SAFEFRAME_CSA_METRICS_1390278` | CSA metrics for SafeFrame |

### Ad Creative Sandboxing

Amazon strips browser capabilities from ad creatives inside the SafeFrame. Three overrides apply when an ad loads:

`disableUserAgent.ts` (behind weblab `SAFEFRAME_DISABLE_USER_AGENT_1326744`, per `shepherd.a2z.com`):
```typescript
Object.defineProperty(Navigator.prototype, 'userAgent', {
    get: () => '',
    set: () => {},
});
```

`disableCookieAccess.ts` (per `issues.amazon.com/issues/APEX-4377`):
```typescript
Object.defineProperty(Document.prototype, 'cookie', {
    get: () => '',
    set: () => {},
});
```

`disableGeolocationApi.ts` (per `issues.amazon.com/issues/CPP-24902`): overrides `getCurrentPosition` and `watchPosition` to always call the error callback with `PERMISSION_DENIED`.

Ad creatives running in Amazon's SafeFrame cannot read the visitor's browser, set cookies, or access geolocation. Amazon tracks all of this itself — it does not let advertisers do it independently.

The SafeFrame referrer allowlist includes all Amazon marketplace domains plus `imdb.com`, `boxofficemojo.com` (Amazon-owned), `harmony.a2z.com` and `console.harmony.a2z.com` (internal ad management console), and `depot.advertising.amazon.dev` (internal ad depot).

## Behavioral Telemetry

Amazon's primary behavioral pipeline is CSM/CSA (`com.amazon.csm.csa.prod`). The system uses overlapping identifiers for cross-session and cross-page continuity:

- `ue_id` / `session-id` cookie (e.g., `139-9710778-5179530`) — session identifier, also in `ue_sid` global
- `csmtid` in sessionStorage — per-tab CSM ID
- `csa-ctoken-{requestId}` in localStorage — per-page content token
- `csm-bf` in localStorage — array of the last ~5 session request IDs for browser fingerprint continuity
- `csm-hit` cookie — includes ad blocker detection (`adb:adblk_no`)
- `csm:adb` in localStorage — ad blocker status cached separately

Ad blocker status is tracked in both cookie and localStorage, both tied to CSM session IDs. The dual storage enables correlation regardless of which mechanism survives a cache clear.

### BotCX: RXLang Bytecode VM

Two bot detection scripts load on every page: `BotCXMetricsCollectionJSAsset` and `BotDetectionJSSignalCollectionAsset`. The BotCX script does not collect signals in readable JavaScript. It loads a bytecode VM (`window.rx`, described in source as "global rx VM provided by RXPlugins") and executes compiled RXLang bytecode via `rx.ex64(base64_bytecode, "load")`.

Four metric modules load as bytecode on page load:

- Bootstrap — collection manager setup
- Scroll Metric — scroll depth and velocity
- Click Metric — click coordinates and timing
- Mouse Movement Metric — cursor paths
- Typing Metric — keyboard input patterns

The bytecode form makes static analysis of what is collected opaque — auditing the signal collection requires reverse-engineering the RXLang VM. The `window._bcxp_mc` object (`BotCX Platform Metrics Collection`) is the public surface; `DEBUG: 0` disables console logging in production.

Akamai Bot Manager runs separately. Its device fingerprint (`ECdITeCs:{encrypted-blob}`) is embedded in the login form as the hidden `metadata1` field. Login attempts that don't pass Akamai's fingerprint check fail at the form layer regardless of valid credentials.

## The Onsite Ad Machinery

Amazon operates four parallel ad tracking systems, all active on a typical session:

**ONO (Onsite Native Advertising)**: `aes.us-east.ono.axp.amazon-adsystem.com/x/px/{encoded-path}` fires 10 times on homepage, 4 on search. The path is base64url-encoded binary data containing auction transaction metadata — decoded, it contains `ono_txn_bid` followed by binary auction state.

**PAETS (Promoted Ads Event Tracking System)**: `api.stores.us-east-1.prod.paets.advertising.amazon.dev/v1/ad-events/loaded/{id}` fires per ad placement with 2 confirmation calls each.

**PAA (Product Advertising Attribution)**: `ara.paa-reporting-advertising.amazon/conversion?asin={ASIN}&eventType=dpv&obfuscatedMarketplaceId=ATVPDKIKX0DER&requestId={ID}` fires on every product detail view without authentication. The `requestId` matches CSM session IDs, enabling cross-system correlation.

**SASH SafeFrame**: APE (Advertising Publishing Engine) iframes on search — BTF (below-the-fold) batch ads and left-side display. Amazon's own DSP (`DAsis` iframe via `s.amazon-adsystem.com/iu3?d=amazon.com&slot=navFooter`) runs on its own pages: Amazon is the publisher serving retargeted ads against itself.

### Search Ad Layout

Across five search queries (laptop, coffee maker, batteries, AA batteries, coffee maker with Prime filter), sponsored results always occupy positions 1-4, 11-14, and 19-22 in 60-result pages. The first organic result is always position 5. The pattern holds regardless of search term or applied filter — the first 4 positions in each grid block are structurally reserved ad real estate.

Battery searches show an additional pattern: 15 of 60 organic results (25%) are Amazon Basics products, occupying organic positions while competitors pay for sponsored placement in positions 1-4, 11-14, and 19-22.

## Session Identifiers and Storage

Key identifiers set in a cold session:

| Name | Location | Value | Purpose |
|------|----------|-------|---------|
| `session-id` | Cookie | `139-9710778-5179530` | Session identifier |
| `session-id-time` | Cookie | `2082787201l` | Session expiry (year 2035) |
| `ubid-main` | Cookie | `132-4991915-3236939` | Persistent user/browser ID |
| `csm-hit` | Cookie | `tb:s-{id}\|{ts}#{hmac}:adb:adblk_no` | CSM session + ad block status |
| `id_pkel` | Cookie | `n0` | Passkey eligibility (n=no) |
| `id_pk` | Cookie | `eyJuIjoiMCJ9` = `{"n":"0"}` | Passkey config |
| `i18n-prefs` | Cookie | `USD` | Currency |
| `rxc` | Cookie | `ABN+hKkd...` | Rx system (purpose unclear) |
| `atvwebplayersdk_atvwebplayer_deviceid` | localStorage | `CardInstance{uuid}` | Prime Video device ID (pre-auth) |
| `csm-bf` | localStorage | `["{requestId}",...]` | Browser fingerprint continuity |
| `csm:adb` | localStorage | `adblk_no` | Ad blocker detection |
| `_PATC_CONFIG` | localStorage | JSON experiment rules | A/B experiment state |
| `puff:suppression` | localStorage | `{session-id: {suppressUntil: ...}}` | Notification suppression |
| `rx` | localStorage | `ABN+hKkk...` (100+ chars) | Rx system data |
| `amzn:fwcim:events` | sessionStorage | `[{time, item, referrer}]` | First Web Customer Interaction Metrics |

### PATC Config (A/B Experiment State)

`_PATC_CONFIG` (Post-Add-to-Cart Config) is fetched each session from `/cart/add-to-cart/patc-config` and cached in localStorage. It contains 4 active experiment rules:

```json
[
  {"id": "byg_desktop_optimistic_qs_t1", "conditions": {"clientName": "Personalization_QuantityStepper", "pageType": "BeforeYouCheckout"}, "experimentFlags": ["isSnappy"]},
  {"id": "search_optimistic_qs_enable_animation_desktop", "conditions": {"clientName": "EUIC_AddToCart_Search", "pageType": "Search"}, "experimentFlags": ["isSnappy", "isSearchPageSnappyAnimatedDesktop"]},
  {"id": "enable_expanded_quantity_stepper_t1", "conditions": {"clientName": "Personalization_BuyAgain"}, "experimentFlags": ["isExpandedStepperEnabled"]},
  {"id": "amazon_now_qs_desktop", "conditions": {"clientName": "AmazonNow_AddToCart_Search"}, "experimentFlags": ["isAmazonNow"]}
]
```

The `amazon_now_qs_desktop` rule confirms Amazon Now (rapid delivery) add-to-cart is an active experiment on the desktop search page.

## Sign-In Layer

The login page at `/ap/signin` uses OpenID 2.0 (`openid.mode=checkid_setup`). Notable hidden fields:

- `metadata1`: `ECdITeCs:{encrypted-blob}` — Akamai Bot Manager device fingerprint computed from browser hardware, canvas, and timing. Automation that does not replicate this fails login at the form layer.
- `webAuthnGetParametersForAutofill`: base64-encoded WebAuthn challenge for passkey autofill
- `webAuthnChallengeIdForAutofill`: paired challenge ID
- `unifiedAuthTreatment: T2` — active A/B test on the login flow
- `signalUnknownCredentialUnifiedAuthWeblabActive: false` — flag for unknown-credential UX experiment

No social identity provider integration exists. Amazon runs its own IdP end to end.

## Infrastructure Notes

SSL certificate SANs include hostnames beyond the standard marketplace domains (from investigator observation; no cert dump evidence):

- `konrad-test.amazon.com` — developer test environment on the production cert
- `buckeye-retail-website.amazon.com` — internal retail staging
- `huddles.amazon.com` — internal tool
- `yp.amazon.com` / `yellowpages.amazon.com` — legacy acquisition artifact
- `buybox.amazon.com` — buy box service
- `uedata.amazon.com` — User Event data endpoint (returns blank HTML)

The Prime signup config endpoint at `d2h8zr0m6mus4x.cloudfront.net/primesignup/package.json` is publicly accessible and lists all 21 Amazon global marketplace domains with their configurations — US, UK, CA, DE, ES, FR, IT, JP, IN, CN, SG, MX, AE, BR, NL, AU, TR, SA, SE, PL, EG.

## Machine Briefing

### Access and Auth

Most product data endpoints require session cookies (`session-id`, `ubid-main`, `csm-hit`). Without them, requests get redirected or return `BAD_REQUEST`. To get a valid session: load `amazon.com` in a real browser, let it fully initialize, then extract the cookies.

### Endpoints

**Open (no auth):**

```
# Recommendation carousel — product HTML with prices and ASINs (~124KB)
GET https://www.amazon.com/hz/rhf

# Global Prime marketplace config (21 domains)
GET https://d2h8zr0m6mus4x.cloudfront.net/primesignup/package.json

# SafeFrame source map (130KB, full TypeScript source)
GET https://m.media-amazon.com/images/S/sash/37VXeyh5_Kf3tzA.json

# Product view attribution pixel (empty 200 response)
GET https://ara.paa-reporting-advertising.amazon/conversion?asin={ASIN}&eventType=dpv&obfuscatedMarketplaceId=ATVPDKIKX0DER&requestId={uuid}
```

**Session required:**

```
# A/B experiment treatment
POST https://www.amazon.com/cdp/usage/GetWeblabTreatment

# PATC experiment config
GET https://www.amazon.com/cart/add-to-cart/patc-config

# Personalization carousel
POST https://www.amazon.com/acp/p13n-desktop-carousel/{widgetId}/getCarouselItems
```

**Lambda metrics (from source map):**

```
POST https://qdbx3pbnx6veby23pzgaowu3q40tmmrr.lambda-url.us-east-1.on.aws
Content-Type: application/json
Body: {"metrics":[{"metricName":"...","timestamp":0,"value":0,"dimensions":{}}],"xApiKey":"aUAZqFtiIp6VxqpW3coqZ2JdZnV3RN9S8yKMRIdJ"}
```

### Gotchas

- **Bot detection on entry**: CloudFront blocks curl and most HTTP clients with 503. Requires a browser session or full realistic header set.
- **Akamai on login**: The `metadata1` field is Akamai Bot Manager fingerprint. Automation that cannot replicate it will fail login.
- **Session cookie format**: `session-id` follows `{digits}-{digits}-{digits}` pattern.
- **`/hz/rhf` is personalized**: Without cookies, returns a cold-start carousel. With session, returns personalized recommendations.
- **Source map indices**: In the source map, `sourcesContent[28]` has the API key, `[29]` has the Lambda batcher, `[18]` has the weblab list.
- **Marketplace ID**: `ATVPDKIKX0DER` is the US storefront identifier, appearing in `ue_mid` global, ARA conversion URLs, and PATC config.
