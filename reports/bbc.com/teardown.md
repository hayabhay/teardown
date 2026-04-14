---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "BBC — Teardown"
url: "https://bbc.com"
company: "BBC"
industry: "Information"
description: "British public broadcaster; global news, sport, and streaming."
summary: "Next.js on BBC's internal Belfrage rendering layer, served via Fastly CDN with a custom transport middleware the BBC also calls GTM. The entire site routes through a single [[...slug]] pattern. Two flagpole systems -- gnlops for ops, ngas for ads -- control vendor configuration server-side and ship in every page response. BBC operates an ad-supported international edition and a subscription streaming service (BBC X), with a separate license-fee-funded .co.uk for UK visitors."
date: 2026-04-13
time: "20:08"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack: [Next.js, Belfrage, Fastly, Varnish]
trackers: [Google DFP, Permutive, Piano, mParticle, Covatic, Optimizely, Nielsen, DoubleVerify, Taboola, Chartbeat, AppNexus, Undertone, SourcePoint, Ozone Project, Cxense, DotMetrics]
tags: [media, news, subscription, streaming, identity-resolution, prebid, consent, public-broadcaster, ai-opt-out, programmatic]
headline: "BBC's ad plugin pipes an encrypted first-party device ID into every programmatic auction -- every bidding advertiser receives it."
findings:
  - "BBC's Ozone prebid plugin calls tryAddFedIds() on every bid request, injecting an encrypted device ID from localStorage as the om_v_id targeting key -- the cookieless identity solution is the bidstream itself."
  - "BBC runs its own identity broker at federated-id.live.api.bbc.co.uk that fires 7 requests per page load -- one GET to retrieve a device ID, then 6 POSTs to encrypt it separately for Google, Ozone, Piano, mParticle, and GAM."
  - "Full article text -- 54+ paragraph blocks, headlines, bylines, and 6 server-defined ad position placeholders -- ships in __NEXT_DATA__ HTML for every visitor before JavaScript executes."
  - "Piano assigns anonymous first-time visitors a cross-publisher RevenueOpt score of 55 in the _pcus cookie on first page load -- sourced from Piano's publisher network, not BBC data."
  - "BBC's segmentation API (segmentation.api.bbc.com) is called with a hardcoded first-party API key in public JavaScript -- X-API-Key: aqhenhsvnimc7."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

BBC runs one of the largest proprietary ad infrastructure deployments in media. The site is simpler than it looks from the outside -- a single Next.js route pattern (`[[...slug]]`) on a custom internal rendering layer called Belfrage -- but the ad tech stack layered beneath it is a full programmatic trading desk. The interesting stories here are in the plumbing: how BBC solved identity without third-party cookies, what it embeds in every page response, and what its own source code reveals about its commercial strategy.

## Infrastructure

The request chain for a BBC page load is visible in response headers: `req-svc-chain: FASTLY,GTM,BELFRAGE,BBCX`. Fastly handles CDN and edge caching. GTM here is BBC's internal "Generic Transport/Middleware" layer -- not Google Tag Manager. Belfrage is BBC's proprietary Next.js rendering and routing service. BBCX is the subscription tier service. The `server: BBC-GTM` and `belfrage-cache-status: HIT` headers in every response confirm this is not a generic cloud deployment -- BBC runs its own named infrastructure components.

Static assets are served from `static.files.bbci.co.uk` with date-based build IDs: `bbcdotcom/web/20260407-092955-f3cfe0ee04-web-3.0.0-2/` (April 7, 2026 build, git hash `f3cfe0ee04`, version `3.0.0-2`). The NGAS bootstrap is versioned separately: `1.353.0-20260409-085904-203389f`, deployed April 9. These timestamps are visible in every page response.

Next.js `buildId: KmPscKRPG-s4__pkP5Kuv`. The entire site -- editorial articles, sport, culture, BBC X video, all 25 language services -- routes through a single `[[...slug]]` catchall pattern. Article content is rendered server-side and hydrated client-side. The SSL certificate covers the full BBC domain estate: `www.bbc.com`, `www.bbc.co.uk`, `www.bbcrussian.com`, `session.bbc.com`, `account.bbc.com`, `search.bbc.co.uk`, `open.live.bbc.co.uk`, `r.bbci.co.uk`, and a dozen image/CDN subdomains.

The `robots.txt` opens with explicit AI opt-out language: no training, no RAG, no agentic AI, no dataset creation from BBC content. It cites "Article 4 of the EU Directive on Copyright in the Digital Single Market" for the text-and-data-mining opt-out. The file is version-controlled (`# version: a28d9b8cc160dae99c5da44b61f9fb6a0c3a520e`), which is unusual -- this suggests active maintenance and deliberate policy enforcement rather than a boilerplate.

## Content Architecture: Full Articles on the Wire

BBC's CMS is called Optimo. Articles are serialized as typed content blocks in the `__NEXT_DATA__` JSON blob embedded in every server-rendered page response. A live check of article `urn:bbc:optimo:asset:c78l7vyylgqo` confirms the structure: 70 total blocks, including 54 text paragraph blocks, 6 advertisement position placeholders, plus headline, timestamp, byline, image, and links blocks. The full article body is on the wire before any JavaScript executes.

The ad positions are server-defined and baked into the content block array -- advertisement blocks appear inline between text blocks at positions determined by the CMS, not injected by client-side ad code. BBC's ad layout is part of content authoring, not a post-render injection.

Block format:
```json
{
  "type": "text",
  "model": {
    "blocks": [{"type": "paragraph", "model": {"text": "..."}}]
  }
}
```

For BBC X premium video content, the page embeds episode metadata without authentication: title, synopsis, version ID (vpid), availability window (`availableFrom: 1758697200000, availableTo: 1851393540000` -- September 2025 through February 2029), and DRM status (`drm: true`). The actual stream is gated: the Media Selector API (`open.live.bbc.co.uk/mediaselector/`) returns `"result":"selectionunavailable"` for DRM content without a subscription token. Metadata is accessible; playback is not.

The `__NEXT_DATA__` also embeds per-visitor server state on every load: `serverEnv: live`, `country: us`, `xIpIsUKCombined: no` (the license fee eligibility check), `experiments: {}` (active Optimizely experiments), and the full feature flag set.

## The Federated Identity System

BBC built a server-mediated first-party identity broker at `federated-id.live.api.bbc.co.uk`. Every page load fires two types of requests to this service:

- `GET /getdeviceid` -- retrieves or generates a persistent device ID
- `POST /v2/encryptdeviceid` -- fires 6 times, once per ad partner integration

The six POST calls each produce a partner-specific encrypted version of the device ID. The resulting IDs are stored in localStorage under a consistent naming scheme:

```
fedID.device.id          -- the base device ID
fedID.device.env         -- "live"
fedID.gam.id             -- Google Ad Manager encrypted ID
fedID.google.version     -- Google targeting version
fedID.studios_ozone.id   -- Ozone Project encrypted ID
fedID.studios_ozone.user_id
fedID.piano.version      -- Piano encrypted ID
fedID.studios_mparticle.version
fedID.studios_mparticle.id -- mParticle encrypted ID
fedID.ed.id              -- email hash (if signed in)
```

Partner flags in `ngasFlags` confirm the target integrations: `fedid_google: true`, `fedid_permutive: true`, `fedid_piano: true`, `fedid_signed: true`, `fedid_all: true`.

The Permutive integration extends this further: Permutive's localStorage data (`permutive-data-misc`) stores the BBC federated ID alongside Permutive's own `pxid` and AppNexus IDs -- cross-DSP identity stitching using BBC's encrypted device ID as the spine.

**The bidstream connection.** BBC's Ozone prebid plugin (`ozone-plugin.js`) contains this function, called for every bid request:

```js
function tryAddFedIds(t) {
  var e = {
    om_v_id: localStorage.getItem("fedID.studios_ozone.id"),
    cpn: localStorage.getItem("fedID.studios_ozone.user_id") || ""
  };
  setAdunitOzoneTargeting(t, e, "om_v_id");
  setAdunitOzoneTargeting(t, e, "cpn");
}
```

`tryAddFedIds()` is called on every ad unit processed through `pluginPushAdunitForGptAdSlot()`. The encrypted BBC device ID travels with every programmatic bid request as the `om_v_id` targeting key. Every advertiser bidding through Ozone's system receives BBC's first-party identifier alongside the auction request. This is how BBC monetizes its cookieless identity infrastructure -- the value is in the bid, not the cookie.

The architecture also reveals two Ozone publisher accounts: `1500000107` (used when `isNewPlatform() || isLive()`, i.e., the main BBC.com Next.js platform and live pages) and `8890582654` (legacy platform, including World Service and older article rendering). Both account IDs appear in the public `ngas-bootstrap.js`.

## Ad Stack: NGAS

BBC's internal programmatic platform is called NGAS (Next Generation Ad System). Its configuration is served as a feature flagpole (`gn-flagpoles/ngas`) and embedded in every page response as `ngasFlags` within the `dotcomConfig` global. As of April 9, 2026 (the most recent flagpole update timestamp), version 1.28:

| Flag | Value | Notes |
|------|-------|-------|
| `aps` | false | Amazon Publisher Services disabled |
| `banner` | true | Display ads on |
| `cmp` | true | Consent management enabled |
| `comscoremmx` | true | Comscore measurement |
| `covatic` | true | On-device ML targeting |
| `doubleverify` | true | Brand safety |
| `fedid` | true | Federated identity (all sub-flags true) |
| `grapeshot` | false | Oracle brand safety disabled |
| `ias_publisher` | false | IAS publisher disabled |
| `nielsen` | true | Nielsen measurement |
| `ozone` | true | Ozone programmatic |
| `permutive` | true | Audience profiling + cohorts |
| `piano` | true | Subscription + DMP |
| `piano_ari` | true | Piano Audience Revenue Intelligence |
| `spo` | true | Supply-side platform optimization |
| `taboola` | true | Content recommendations |
| `tmt_media_filter` | true | TMT media brand safety filter |

Piano's DMP adapter is configured to collect all prebid auction data: `analyticsAdapters: [{provider: "pianoDmp"}]`. Every bid request, win price, and floor price is captured by Piano's system. BBC uses Piano both as subscription/paywall infrastructure and as advertising DMP -- the same vendor handles audience monetization from both directions.

The NGAS bootstrap file (`ngas-bootstrap.js`) is public and updated on every deployment. It contains BBC's Piano live configuration:

```
live: {endpoint: "https://buy-eu.piano.io/api/v3", aid: "7I7hmRshpe", cxenseSiteId: "3606632254074155369"}
test: {endpoint: "https://buy-eu.piano.io/api/v3", aid: "ARbzz6ZBpe", cxenseSiteId: null}
```

The Ozone prebid config is served from a public CDN: `https://prebid.the-ozone-project.com/hw2/OZONEBBC4784/1500000107/current/adUnits.min.js`. Prebid timeouts: `PREBID_TIMEOUT: 2000ms`, `PREBID_BACKSTOP_TIMEOUT: 3000ms`. Test group: 40% of users (`testgroupVal: 40`). Permutive passes up to 500 audience segments to all bidders: `rtdProviders: [{name: "permutive", waitForIt: true, maxSegs: 500}]`.

Covatic, the on-device ML targeting platform, is configured with country-specific encrypted client keys for US, Canada, and Australia -- the only three markets where it is enabled. On load it calls `GET /mobile/api/v1.0/profile/user_profiles`, `POST /browser/device_data`, `GET /browser/probability_maps`, and attempts to download a classification model from `/artifacts/models/646f651b59194d51cf2576ac/ml-classificat...` (returned 404 in this run). The model download failure suggests rotation or deprecation, but the SDK itself fires 9 endpoints on every page load.

The ops flagpole (`gnlops`) reveals additional internal toggles: `zephr: false` (Zephr paywall disabled for US), `zephrx: true` (newer Zephr version active), `wwhp_obituary: false` (obituary content disabled on homepage feed). This flagpole was last updated July 31, 2024 -- stable for over eight months while the NGAS flagpole rotates with every deployment.

Feature flags in `__NEXT_DATA__` surface BBC's subscription product roadmap: `subscription-poc: false`, `subscription-claims-based: false`, `subscription-canada-fe: false`. Piano Composer is active (`piano-composer: true`), but the pilot and claims-based auth are off. Project "Oklahoma" (`mparticle-oklahoma: false`) is an internal codename, purpose unknown. `mparticle-features: false` while `mparticle-sdk: true` means mParticle is running identity resolution but not collecting behavioral events. AMP is fully removed (`full-amp-removal: true`).

Ad unit section mapping in the Ozone plugin:

```js
adunitNameRegexMatches = {
  sport: /^\/sport/,
  news_hub: /^\/news\/?$/,
  home: /^\/?$/,
  business: /^\/news\/business/,
  culture: /^\/culture/,
  entertainment: /^\/news\/entertainment(_and_arts|-arts)/,
  future: /^\/future/,
  sci_env: /^\/news\/science(_and_environment|-environment)/,
  technology: /^\/news\/technology/,
  travel: /^\/travel/,
  worklife: /^\/worklife/,
  weather: /^\/weather/,
  news_content: /^\/news\/.+$/
}
```

Content that does not match any section gets `ros` (run of site) targeting. The `_ca` suffix (e.g., `mid_ca`, `sid_ca`, `top_ca`) is a catch-all fallback ad unit for when the section-specific unit does not exist.

## Surveillance & Tracking

The homepage makes requests to 25 third-party domains on first page load (102 total requests). One first-party endpoint fires: POST `/event` (BBC's internal analytics collector, 7 times).

**Top third-party services by request count:**

1. **Permutive** (`api.permutive.com`, `e488cdb0-...prmutv.co`, `cdn.permutive.com`) -- 8 endpoints, audience profiling. POST `/ctx/v1/segment`, POST `/v2.0/watson`, GET `/v2.0/geoip`, POST `/v2.0/identify`, POST `/adv/v4/segment`, POST `/v1.0/state`. Project ID: `e488cdb0-e7cb-4d91-9648-60d437d8e491`. Also downloads a binary ML model (`e488cdb0-...-models.bin`).
2. **Covatic** (`mobile-cvc-nv-bbc-web.covatic.io`, `browser.covatic.io`) -- 9 endpoints. On-device ML targeting platform. Calls `GET /mobile/api/v1.0/profile/user_profiles`, `POST /browser/device_data`, `GET /browser/probability_maps`, and attempts an ML model download. No user data leaves the browser -- classification happens locally.
3. **Piano** (`buy-eu.piano.io`, `c2-eu.piano.io`) -- subscription and experience rules engine. POST `/checkout/offer/getFraudPreventionConfig`, POST `/checkout/offer/trackShow`, POST `/xbuilder/experience/execute` (Piano's rules engine, fires on every page). Piano fires against EU endpoints even for US visitors.
4. **BBC Federated ID** (`federated-id.live.api.bbc.co.uk`) -- GET /getdeviceid + POST /v2/encryptdeviceid (x6). See Identity section.
5. **Google** -- `pagead2.googlesyndication.com`, `securepubads.g.doubleclick.net`, `www.googletagservices.com`, `ep1.adtrafficquality.google`, `www.googleadservices.com`. 16 requests across ad serving, audience modeling, invalid traffic detection, and private aggregation reporting.
6. **mParticle** (`jssdkcdns.mparticle.com`, `jssdks.mparticle.com`, `identity.mparticle.com`) -- CDN config fetch, POST `/v3/JS/eu1-.../events`, POST `/v1/identify`. BBC uses the EU cluster (`eu1`), workspace token `eu1-ef76cdfb8673b34095fff2156cdfa7d8` in the CDN URL. `mparticle-features: false` limits this to identity resolution only.

**Cookie inventory (first-party and third-party, observed on first load):**

| Cookie | Purpose |
|--------|---------|
| `ckns_echo_device_id` | BBC persistent device ID |
| `ckns_mvt` | BBC multivariate testing ID |
| `ckns_policy` | BBC consent state (`111` = all enabled) |
| `optimizelyEndUserId` | Optimizely visitor ID |
| `optimizelySession` | Optimizely session |
| `_pprv` | Piano consent record (all 8 categories opt-in) |
| `_pcid` | Piano cross-publisher ID |
| `_pcus` | Piano user segments (includes RevenueOpt score) |
| `_pctx` | Piano context |
| `pa_vid` | Piano analytics visitor ID |
| `permutive-id` | Permutive device ID |
| `_cb` / `_chartbeat2` / `_cb_svref` | Chartbeat engagement tracking |
| `__gads` / `__gpi` / `__eoi` | Google ad IDs |
| `DM_SitId1778` / `DM_SitId1778SecId13934` | DotMetrics measurement |
| `cX_P` / `cX_G` | Cxense (Piano DMP) |
| `usnatUUID` | US National Privacy Act compliance UUID |
| `__tbc` / `__pat` / `__pvi` / `xbc` | Piano cross-publisher tracking |
| `_SUPERFLY_lockout` | Internal BBC cookie (rate limiting / lock-out) |
| `ecos.dt` | Performance timing |

**Piano's `_pcus` cookie** is set on the first page load for an anonymous visitor with no prior account. The decoded cookie contains Piano's cross-publisher user segments:

```json
"userSegments": {
  "COMPOSER1X": {
    "segments": [
      "LTreturn:...:no_score",
      "LTreg:...:no_score",
      "LTs:...:no_score",
      "CScore:...:no_score",
      "RevenueOpt:...:55",
      "LTc:...:no_score"
    ]
  }
}
```

`RevenueOpt: 55` is Piano's cross-publisher revenue optimization score -- a 0-100 number representing how likely this anonymous browser is to convert to paid. The score is drawn from Piano's publisher network data, not BBC's own behavioral data. An anonymous visitor to BBC gets scored using data they generated on other Piano-connected publishers. The `LT` prefix segments are lifetime models (return visitor likelihood, registration propensity, subscriber propensity, conversion score).

## Consent Architecture

BBC's consent logic is tiered by geography:

**US visitors -- `THIS_CONSENT_ZONE: NONE`.** No consent banner appears. SourcePoint CMP (`cdn.privacy-mgmt.com`) fires four API calls silently on every page load (`GET /wrapper/v2/messages`, `GET /wrapper/v2/meta-data`, `GET /mms/v2/get_site_data`, `POST /wrapper/v2/pv-data`), but shows no UI. The IAB's TCF API (`window.__tcfapi`) is installed but dormant. All 25 tracker domains load on first page render with no user interaction. BBC's proprietary consent cookie `ckns_policy=111` is pre-set with all three consent categories enabled (functional, performance, advertising).

Piano's `_pprv` cookie is also pre-set with all 8 IAB consent purposes in `opt-in` mode: Audience Measurement (AM), Advertising (AD x2), Content Personalization (CP), Profiling (PR x3), and Data Linking (DL).

**EU visitors.** SourcePoint CMP displays a GDPR consent banner. The NGAS bootstrap contains a full TCF consent handler: `window.__tcfapi("addEventListener", 2, ...)` listens for TCF signals and enables/disables individual vendors (Comscore TCF ID 77, Permutive 361, Nielsen 373+812, Covatic 1104, Ozone 524) based on the consent signal.

**US privacy law (USNAT/GPP).** The NGAS bootstrap also contains a USNAT handler. It reads `SaleOptOut`, `SharingOptOut`, and `TargetedAdvertisingOptOut` from the GPP signal. Only if all three are set to 1 (opt-out) does it disable Comscore, Permutive, Nielsen, Covatic, and Ozone. The consent logic is explicit in the source code -- not a black box.

**UK visitors (.co.uk).** Different consent framework (PECR-based), no advertising, license-fee-funded. The `xIpIsUKCombined: no` flag in every page response is the gate check for this path. BBC uses this flag to decide whether to load the ad stack at all.

## Access Control & Interesting Endpoints

**`/userinfo`** -- Unauthenticated geo-detection endpoint on both `www.bbc.com` and `www.bbc.co.uk`. Returns:
```json
{"X-Country": "us", "X-Ip_is_uk_combined": "no", "X-Ip_is_advertise_combined": "yes"}
```
No authentication required, no rate limiting observed. Determines license fee eligibility (`X-Ip_is_uk_combined`) and ad eligibility.

**BBC Segmentation API** -- `segmentation.api.bbc.com/segments?segments=591ea40d71,e2cd0d9d87`. Called in `ngas-bootstrap.js` with a hardcoded API key:
```js
fetch("https://segmentation.api.bbc.com/segments?segments=591ea40d71,e2cd0d9d87", {
  headers: {
    "X-API-Key": "aqhenhsvnimc7",
    "X-Authentication-Provider": "idv5"
  },
  credentials: "include"
})
```
The two segment IDs are `591ea40d71` (audience propensity score, mapped internally to Permutive `jKmNjKmN` key) and `e2cd0d9d87` (country classification). The API key and endpoint are in every copy of `ngas-bootstrap.js`. Direct calls to this endpoint with the API key return HTTP 400 -- the endpoint requires `credentials: "include"` with a valid BBC session cookie (`ckns_id`) to process the request. The key unlocks the endpoint for authenticated users; unauthenticated calls fail.

**BBC Analytics Producers Config** -- `https://mybbc-analytics.files.bbci.co.uk/analytics-remote-config/producers.json`. Public, unauthenticated. Returns 127+ internal BBC producer IDs (ACADEMY=125, ACCOUNT=1, BBC_STUDIOS=128, BRITBOX=34, BRITBOX_AU=132, etc.) -- BBC's internal organizational ID mapping for analytics attribution.

**`/search` -- Fastly URI token protection.** Visiting `/search?q=test` triggers a Belfrage redirect that appends a signed JWT as `?edgeauth=`:
```json
{
  "key": "fastly-uri-token-1",
  "exp": 1776110404,
  "nbf": 1776110044,
  "requesturi": "%2Fsearch%3Fq%3Dtest"
}
```
HS256, 6-minute validity window. This is Fastly's edge token authentication -- signed URLs that block unsigned/automated search requests without breaking normal user navigation.

**`web-cdn.api.bbci.co.uk`** -- Returns `Access-Control-Allow-Origin: *` on all responses including 404s. Open CORS on BBC's internal API CDN.

**Federated ID API** -- `federated-id.live.api.bbc.co.uk`. Returns 400 "Invalid request syntax. One or more headers may be missing" without proper browser context headers. Requires Origin, Referer, and BBC SDK headers set at request time.

## Machine Briefing

### Access & auth

No login required for editorial content, article full-text, feature flags, and most metadata. `curl` and `fetch` work for most endpoints. Cookie-gated: Piano experiences, federated ID generation, segmentation API data. BBC session auth uses `session.bbc.com/session` -- sign-in returns `ckns_id` cookie. UK content gating is IP-based, not cookie-based.

### Open endpoints

```bash
# Geo-detection: country, UK status, ad eligibility
curl https://www.bbc.com/userinfo
curl https://www.bbc.co.uk/userinfo

# Article content: full body in __NEXT_DATA__ blob
curl -s "https://www.bbc.com/news/articles/{slug}" | \
  python3 -c "import sys,json,re; html=sys.stdin.read(); \
  m=re.search(r'<script id=\"__NEXT_DATA__\" type=\"application/json\">(.*?)</script>', html, re.S); \
  data=json.loads(m.group(1)); print(json.dumps(data['props']['pageProps'], indent=2))"

# BBC X premium video metadata (no auth, stream requires subscription)
curl -s "https://www.bbc.com/bbcx/{slug}"
# vpid values in __NEXT_DATA__ can be tested against Media Selector:
curl -s "https://open.live.bbc.co.uk/mediaselector/6/select/version/2.0/mediaset/iptv-all/vpid/{vpid}/format/json"

# BBC analytics producer IDs (internal org IDs)
curl https://mybbc-analytics.files.bbci.co.uk/analytics-remote-config/producers.json

# Ozone prebid config (ad units, sizes, bidder params)
curl "https://prebid.the-ozone-project.com/hw2/OZONEBBC4784/1500000107/current/adUnits.min.js"
# Legacy/World Service:
curl "https://prebid.the-ozone-project.com/hw2/OZONEBBC4784/8890582654/current/adUnits.min.js"

# Covatic BBC profile config
curl "https://browser.covatic.io/profiles/www.bbc.com.json"
```

### Authenticated endpoints

```bash
# BBC segmentation API (requires ckns_id session cookie)
curl "https://segmentation.api.bbc.com/segments?segments=591ea40d71,e2cd0d9d87" \
  -H "X-API-Key: aqhenhsvnimc7" \
  -H "X-Authentication-Provider: idv5" \
  -H "Origin: https://www.bbc.com" \
  -b "ckns_id={session_cookie}"

# Piano subscription experience rules engine
# POST https://c2-eu.piano.io/xbuilder/experience/execute
# requires Piano visitor ID and page context

# Federated ID (requires browser headers + BBC SDK context)
# GET https://federated-id.live.api.bbc.co.uk/getdeviceid
# POST https://federated-id.live.api.bbc.co.uk/v2/encryptdeviceid
```

### Gotchas

- `/search` requires a Fastly URI token (`?edgeauth=...`) generated by Belfrage on redirect. The token expires in ~6 minutes and is request-URI-specific. Automated search needs to follow the redirect chain and reuse the token within the window.
- BBC X content pages show `isSubscriptionAllowed: true` in page state even for unauthenticated users -- this flag indicates the content *type* supports subscriptions, not that the current user has one.
- Piano fires against EU endpoints (`buy-eu.piano.io`, `c2-eu.piano.io`) even for US visitors. Jurisdiction is Piano's server choice, not visitor location.
- mParticle is running (`mparticle-sdk: true`) but `mparticle-features: false` means behavioral events are not being sent -- identity resolution only.
- The `destination: BBCS_BBC_TEST` field in page data is an ad operations targeting identifier for BBC Studios content -- not a test environment indicator.
- The NGAS bootstrap JS is date-versioned and replaced on every deployment. URLs containing the version string will break. Fetch `ngas-bootstrap.js` from the page source to get the current URL.
- Permutive accepts up to 500 audience segments in prebid (`maxSegs: 500`). The segments are passed as the `permutive` targeting key on GAM slots.
