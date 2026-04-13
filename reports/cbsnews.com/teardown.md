---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "CBS News — Teardown"
url: "https://www.cbsnews.com"
company: "CBS News"
industry: Information
description: "National news network with live streaming and free on-demand video."
summary: "CBS News runs on Fly, a proprietary Paramount CMS, delivered via double-hop Fastly CDN. The ad stack is BidBarrel v3.6.0, CBS Interactive's in-house Prebid wrapper, feeding Google DFP, FreeWheel for video, and 12+ SSP partners. Identity resolution runs through three parallel systems -- Prebid, FreeWheel/BidBarrel, and Amazon APS -- coordinating eleven cross-publisher ID graphs. Consent is managed by Ketch with a legacy OneTrust wrapper still co-loading; US visitors receive no consent banner."
date: 2026-04-13
time: "07:05"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack: [Fly CMS, RequireJS, Fastly, BidBarrel, Ketch]
trackers: [Google DFP, Google DAI, Adobe Analytics, Adobe Audience Manager, Adobe Target, Tealium, Chartbeat, Comscore, Mux, LiveRamp, ID5, Criteo, UID2, Google PAIR, The Trade Desk, Amazon APS, Yahoo ConnectId, PubCommon ID, Qualtrics, Taboola, Rubicon, GumGum, Kargo, Index Exchange, OpenX, TripleLift, Pubmatic, TrustX, Teads, Seedtag, Connatix, FreeWheel, MinuteMedia, LiveIntent, Hadron, 33Across, Crowd Control, Beachfront, Adentifi, Airship]
tags: [news, media, advertising, identity-graphs, prebid, paramount, live-video, feature-flags, tracking, consent]
headline: "BidBarrel's consent gate is 10ms while its ad initialization timeout is 1,000ms — the consent manager physically cannot respond before the ad stack fires with all categories assumed granted."
findings:
  - "FreeWheel video auction responses store six resolved identity tokens in one localStorage key: LiveRamp, Google PAIR, Yahoo ConnectId, UID2, a Paramount internal token, and a Tinuiti agency token -- all plaintext, all set on first anonymous visit."
  - "CBS's ad tech server at at.cbsi.com returns the caller's postal code, DMA code, and ISP connection type with no authentication -- any HTTP request to the endpoint gets a location fix."
  - "143 feature flags ship in page HTML on every load, including a named employee A/B test (katysTest with three variants), stale election flags from 2020 through 2024, and a rolled-back content injection feature called freepress-injection."
  - "Paramount runs its own UID2 operator instance at ims-v4.paramount.tech rather than using The Trade Desk's infrastructure -- generating advertising tokens for anonymous visitors through its own identity pipeline."
  - "BidBarrel's consent gate is 10ms while its ad initialization timeout is 1,000ms -- Ketch CMP loads from a CDN and cannot respond in 10ms, so the ad stack fires with all consent categories assumed granted before the consent system makes its first network request."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

CBS News is a Paramount property from infrastructure to identity resolution -- the parent company's fingerprints show up in the CMS, the consent scripts, the UID2 operator, and the Trade Desk partner ID. The ad stack is massive: 324 of 329 homepage requests go to third-party domains, eleven cross-publisher identity graphs run in parallel, and three separate ad systems each perform their own identity resolution without deduplication. The consent architecture is opt-out by design, with a 10ms timeout that guarantees the ad stack fires before the consent manager has a chance to load.

## Architecture

CBS News runs on Fly, a proprietary CMS built by CBS Interactive (now Paramount Global). The CMS version is embedded in every page as an HTML comment (`<!-- Fly Version: d28384e2f39682c9d0b59d8b1005bcce -->`) and exposed via `window.ASSETS_VERSION`. The module system is RequireJS 2.3.5 -- not a modern bundler, a deliberate compatibility choice for a complex legacy codebase.

The site deploys through a double-hop Fastly CDN, visible in the `via: 1.1 varnish, 1.1 varnish` response header. Assets serve from `assets1/2/3.cbsnewsstatic.com`. The `core-api-cache-key` custom response header is a Fly CMS artifact. First-party ad tech routes through `at.cbsi.com` (CBS Interactive, S3-backed via Fastly) and `pbs.at.cbsi.com` (CBS's own Prebid Server instance). Video infrastructure lives at `cbsivideo.com` and `doppler-config.cbsivideo.com`.

The Paramount parentage shows throughout: `cdn.privacy.paramount.com` hosts the consent scripts, `ims-v4.paramount.tech` runs UID2 identity resolution, `cbsnews.hb-api.omtrdc.net` is the Adobe Target header bidding endpoint, and `direct.adsrvr.org/bid/bidder/paramountdisplay` identifies the Trade Desk partner. The CDN selection config at `doppler-config.cbsivideo.com` lists `paramountplus:syncbak` alongside `cbsnnational:live`, confirming shared streaming infrastructure between CBS News and Paramount+.

## Edge Profiling Before JavaScript Loads

Before a single line of page JavaScript executes, Fastly's edge has already profiled the visitor and written the results into cookies. Every response sets `fly_device=desktop` and `fly_geo`, a cleartext JSON object:

```
fly_geo={"countryCode":"US","region":"CA","dma":"807","connection":{"type":"cable"}}
```

DMA 807 is the San Francisco market. The connection type (cable, fiber, DSL) comes from the visitor's ASN. Neither cookie is HttpOnly -- both are readable by any script on the page. The `vary` response header bakes this profiling into the CDN cache key: `Vary: Accept-Encoding, X-Geo-Country, X-Geo-GDPR, X-Device, X-Edge-Forwarded-Proto, Origin`. Distinct cache entries are maintained per geography, per GDPR status, and per device type. The `x-device: desktop` response header shows device detection happening at the CDN layer, before the application server is involved.

## Consent Architecture

CBS News runs two consent management platforms simultaneously: Ketch (primary) and a legacy `cbsoptanon` wrapper that loads `optanon-v2.0.0.js` from `cdn.privacy.paramount.com`. Both fire on every page load. The dual-CMP state reflects a migration in progress -- the OneTrust infrastructure hasn't been removed, and the BidBarrel config still contains a 1,500ms `consentTimeout` for the OneTrust path alongside Ketch's separate consent handling.

Ketch is configured for property `cbsnews` under organization `cbs_news`. The jurisdiction routing in `ketch-boot.js` maps every US state, territory, and Puerto Rico to `us_general`. The `us_general` rule fires `renderExperience: noExperience` on page load -- no consent banner is shown to any US visitor. The legal basis for analytics, functional, social media, and targeted advertising is `consent_optout`: consent is assumed unless the user actively opts out. Essential services use `disclosure`.

The first-visit `_ketch_consent_v1_` cookie decodes to:

```json
{
  "jurisdictionCode": "us_general",
  "purposes": {
    "analytics": {"allowed": "true", "legalBasisCode": "consent_optout"},
    "essential_services": {"allowed": "true", "legalBasisCode": "disclosure"},
    "functional": {"allowed": "true", "legalBasisCode": "consent_optout"},
    "social_media": {"allowed": "true", "legalBasisCode": "consent_optout"},
    "targeted_advertising": {"allowed": "true", "legalBasisCode": "consent_optout"}
  }
}
```

All purposes are allowed. No user interaction occurred.

The feature flag `initializeConsentTimeout: 10` sets BidBarrel's consent gate to 10 milliseconds. Ketch loads asynchronously from a CDN -- it cannot possibly respond within 10ms. The ad stack doesn't wait. The contrast with `initializeAdsTimeout: 1000` is explicit: the consent system gets 10ms, the ad system gets 1,000ms. The GTM dataLayer confirms the sequence: the first event pushed on every page load is `{event:"ketchConsent", targeted_advertising:true, analytics:true, functional:true, social_media:true}` -- consent granted before Ketch has made a network request.

The US Privacy string `1YNN` is set in both `us_privacy` and `usprivacy` cookies. The third character `N` signals that the user has not exercised CCPA opt-out rights. This string passes to downstream ad buyers in bid request URLs -- visible at `rtb.adentifi.com` as `us_privacy=1YNN&gdpr=0`.

Only one script on the entire site is consent-gated: the MinuteMedia launcher, wrapped in `<script class="optanon-category-4">`. Every other tracker loads unconditionally.

## Feature Flags -- 143 in Page HTML

`CBSNEWS.features` is embedded as a JavaScript object in every page's HTML, delivering 143 feature flags to every visitor.

**A/B tests currently running:**

| Flag | Value | Note |
|------|-------|------|
| `katysTest` | `50:0\|25:1\|25:2` | Named employee A/B test, 3 variants, 50/25/25 split |
| `liveTvButtonInHeader` | `50:1\|50:0` | Live TV button visibility, 50/50 split |
| `vpa-roku` | `100:1\|0:0` | Roku viewability, 100% variant 1 |
| `freepress-injection` | `0:1\|100:0` | Internal content injection, rolled back to 0% |

**Stale election coverage flags still live:**

| Flag | Value |
|------|-------|
| `pre-election-2022` | `true` |
| `general-election-2022` | `false` |
| `general-election-2020_georgia_senate_runoff` | `true` |
| `general-election-2020_national_exit-poll_house` | `true` |
| `general-election-2024` | `true` |

These are remnants of election coverage code spanning four cycles, left in the feature flag system. The 2020 Georgia Senate runoff flag is still set to `true`.

**Other notable flags:**

- `recirc-source: chartbeat` -- article recirculation powered by Chartbeat's algorithm, not internal
- `adsBidBarrel: v3.6.0` -- internal ad stack version number
- `fb_pixel: false` -- Facebook pixel currently disabled
- `google-analytics-us: false` -- Google Analytics off for US visitors
- `consentGeo: false` -- geo-based consent variation disabled
- `raccetturatest: true` -- observed at runtime in `window.CBSNEWS`, appears to be an employee test flag shipped to production

## Identity Resolution -- Three Stacks, Eleven Graphs

CBS News operates three parallel ad stacks, each running its own identity resolution pipeline. The systems do not deduplicate.

**Prebid.js identity modules** (configured in BidBarrel via `at.cbsi.com/lib/api/v1/cbsnews/prod/config/diff`):

| Module | Cookie/Storage | Config |
|--------|----------------|--------|
| LiveRamp IdentityLink | `idl_env` cookie | PID: 13294; feeds uid2, bidswitch, medianet, magnite, pubmatic, index, openx, sovrn |
| ID5 | `id5id` localStorage | Publisher ID: 429 |
| Criteo | `_lc2_fpi` cookie | Standard Criteo sync |
| UID2 | `__uid2_advertising_token` localStorage | Via Paramount's own `ims-v4.paramount.tech` |
| PairId (Google PAIR) | -- | Publisher Advertiser Identity Reconciliation |
| The Trade Desk UnifiedId | -- | Partner: `cq9wik1` |
| Yahoo/Verizon ConnectId | -- | Pixel ID: 58839 |
| PubCommon ID | `_pubcid` cookie | 365-day expiry |

**Adobe Audience Manager** operates as a ninth graph: `aam_uuid` cookie syncing through `dpm.demdex.net`.

**Amazon Publisher Services (APS)** is configured with 24 identity vendors: liveintent, merkle, intimateMerger, pair, amx, 33across, fTrack, captify, publink, anonymised, quantcast, idPlus, unifiedid, ddb_key_638, fabrick, uid, criteo, yahoo, liveRamp, id5, pubcommon, audigent, lightPublisherAudiences, lotame.

**FreeWheel/BidBarrel identity bundle** -- stored in `fmscw_bidbarrel_resp` localStorage key and passed as the `_fw_3P_UID` parameter in FreeWheel video auction requests:

```
IDL:<LiveRamp envelope>
PAIRID:<Google PAIR encrypted match>
connectid:<Yahoo/Verizon ConnectID>
UID2:<Unified ID 2.0 advertising token>
VIANTP:<Paramount internal token>
TINUITI:<Tinuiti performance marketing agency token>
```

Six identity tokens, all resolved on first visit, stored plaintext in localStorage and readable by any script with access to `window.localStorage`. The `fms_ramp_envelope` field matches the `idl_env` cookie value -- LiveRamp's envelope is stored twice (cookie and localStorage). The TINUITI entry is the outlier: Tinuiti is a performance marketing agency, not a DSP or identity graph operator. Their token in the first-party FreeWheel auction response indicates a data partnership or attribution arrangement with Paramount.

**Cookie sync** at `pbs.at.cbsi.com/cookie_sync` coordinates 8 SSPs on every session: sharethrough, unruly, adnxs (AppNexus/Xandr), yieldmo, rubicon, openx, pubmatic, triplelift. All sync URLs carry `us_privacy=1YNN&gdpr=0`.

Paramount hosts its own UID2 operator instance at `ims-v4.paramount.tech/uid2`. Most publishers use The Trade Desk's UID2 infrastructure; Paramount runs their own instance, giving them direct control over token issuance and refresh and keeping the associated data on-property.

## Public APIs

**`at.cbsi.com/lib/api/client-info`** -- unauthenticated, no referer required. Returns:

```json
{"country":"US","connection":"cable","region":"CA","postalCode":"94123","gmtOffset":"-700"}
```

Any caller gets the visitor's postal code, region, and ISP connection type. This is CBS Interactive's ad tech server performing geo lookup on behalf of the ad stack.

**`*.dns-clientinfo.vtg.paramount.tech/clientinfo`** -- unauthenticated, returns raw client IP and resolver IP:

```json
{"client_ip":"73.223.27.123","resolver_ip":"76.96.15.73"}
```

The subdomain is randomized (UUID prefix), but the pattern is documented in the Doppler config.

**`at.cbsi.com/lib/api/v1/cbsnews/prod/config/diff`** -- BidBarrel's configuration endpoint, 81KB JSON, fully public. Contains: 9 GAM advertiser IDs, 37 eligible refresh advertiser IDs, full Amazon UAM bidder translation table (~80 entries), all Prebid identity module configurations including partner IDs and PIDs, and experiment configurations.

**`pbs.at.cbsi.com/info/bidders`** -- CBS's Prebid Server instance, lists 344 registered bidder adapters. The server accepts OpenRTB 2.5 auction requests from any caller.

**Video collection APIs** (no auth, no referer required):

- `/video/xhr/collection/component/featured-curated/` -- 10 curated videos with title, MPX reference ID, tracking config, Comscore IDs
- `/video/xhr/collection/component/live-channels/` -- 20 live channels with metadata

**`doppler-config.cbsivideo.com/v3/config`** -- CDN selection config for video streaming. Reveals stream identifiers for `cbsnnational:live` and `paramountplus:syncbak`, CDN backends (Akamai, Fastly, CloudFront, Google), visitor ASN, and current throughput measurements.

## Ad Stack

BidBarrel v3.6.0 is CBS Interactive's in-house header bidding wrapper -- not Prebid.js directly, but a CBS-maintained wrapper that coordinates Prebid, Amazon APS, and FreeWheel. The version is embedded in `CBSNEWS.features.adsBidBarrel`.

Primary display ad server is Google DFP/GAM (network 8264). Prebid SSPs: GumGum, Rubicon/Magnite, Kargo, Index Exchange, OpenX, TrustX, TripleLift, Pubmatic, Taboola, Teads, Seedtag, ConnatixHB, Infolinks, Beachfront, Adentifi.

Video ads: FreeWheel handles VOD and clip ad serving. Google DAI handles live stream ad insertion -- 34 requests on homepage load alone. Adobe Target via `cbsnews.hb-api.omtrdc.net` handles personalization and header bidding optimization.

On the homepage, 324 of 329 requests go to third-party domains across 62 distinct domains. On article pages, 163 of 205 requests are third-party across 51 domains.

## Analytics & Measurement

**Tealium** is the tag management layer. Adobe Analytics fires both through Tealium and via a direct beacon at `/b/ss/cbsicbsnewssite/` -- the report suite ID is visible in the URL. The beacon carries full article metadata from `window.CBSNEWS.tracking`: author ID, article ID, publication date, topic hierarchy.

**Chartbeat** handles two functions: real-time analytics and headline A/B testing via its multi-armed bandit (MAB) API. `mab.chartbeat.com/mab_strategy/headline_testing/get_strategy/` is called on every article page load and determines which headline variant the visitor sees. The Bayesian MAB algorithm means at any given time, different visitors may be reading different headlines for the same article. `CBSNEWS.features.recirc-source: chartbeat` confirms article recirculation recommendations also route through Chartbeat rather than an internal model.

**Comscore** (c2: 3005086). **Mux** for video quality analytics, viewer IDs tracked in `muxData` cookie. **Qualtrics** survey intercept at 1-in-25,000 trigger rate. **Airship** for web push notifications.

**MinuteMedia** handles video enhancement and monetization. Internal experiment state is exposed in the `minVersion` cookie: `{"experiment":415756863,"minFlavor":"fixmi-1.17.1.4363.js100"}`. The experiment ID and flavor name are visible to any visitor.

**Headliner** -- a 149KB React application from `disco.headliner.link/d/cbsnews/` that embeds audio and podcast content on some pages, with a CBS-specific configuration path at `api.headliner.link/d/cbsnews`.

## robots.txt

`robots.txt` blocks GPTBot, MAZBot, and `panscient.com` by name but has no blanket AI blocking directive. Several disallowed paths no longer exist (`/stories`, `/sections`, `/network` all redirect to homepage; `/election-results-data/*` returns 404). Numeric path blocks (`/1318`, `/1319`, `/1328`, `/1344`) all 404 -- remnants of a legacy URL scheme. The comment `# PER CBS-N ENG FINAL ROUTES DOC` references an internal engineering route planning document directly in the public file.

The sitemap at `/xml-sitemap/index.xml` organizes articles and videos by month. April 2026 alone contained 2,730 article entries at time of investigation.

## Machine Briefing

### Access & Auth

Most APIs are open. No auth needed for: video collection endpoints, `at.cbsi.com/lib/api/client-info`, Doppler config, breaking news rundown, BidBarrel config diff, and Prebid Server bidder list. Standard `curl` or `fetch` with no headers required.

`/2.1/rundown/` requires a CBS session cookie -- obtain by loading `https://www.cbsnews.com/` and extracting `fly_vid` and `fly_device` cookies. The session is not authenticated (no login), just a device fingerprint.

### Endpoints

**Open -- no auth, no session:**

```bash
# Visitor geo/postal code lookup (reflects caller's IP)
curl https://at.cbsi.com/lib/api/client-info

# Full BidBarrel ad stack config (81KB)
curl https://at.cbsi.com/lib/api/v1/cbsnews/prod/config/diff

# Featured video collection (10 items, full metadata)
curl https://www.cbsnews.com/video/xhr/collection/component/featured-curated/

# Live channels (20 channels)
curl https://www.cbsnews.com/video/xhr/collection/component/live-channels/

# Breaking news status
curl https://www.cbsnews.com/feedfiles/breakingnews_us.rundown.json

# CBS Prebid Server bidder list (344 adapters)
curl https://pbs.at.cbsi.com/info/bidders

# Stream CDN selection config
curl "https://doppler-config.cbsivideo.com/v3/config"

# Ketch consent config
curl https://global.ketchcdn.com/web/v3/config/cbs_news/cbsnews/boot.js

# Cookie sync partner list
curl -X POST https://pbs.at.cbsi.com/cookie_sync \
  -H "Content-Type: application/json" \
  -d '{"bidders":["sharethrough","unruly","adnxs","yieldmo","rubicon","openx","pubmatic","triplelift"],"gdpr":0}'
```

**Session-required:**

```bash
# Content API (requires fly_device + fly_vid cookies)
curl https://www.cbsnews.com/2.1/rundown/ \
  -H "Cookie: fly_device=desktop; fly_vid=<value>"
```

### Gotchas

- `at.cbsi.com/lib/api/client-info` returns data about the **caller's** IP, not a fixed location. Results change by caller geography.
- `/2.1/rundown/` returns valid HTML (a 404 error page) without session cookies -- no indication it requires auth until you inspect the response body rather than the status code.
- Google DAI generates 34 requests on homepage load. Automated sessions will hit rate limits quickly if triggering live stream ad insertion.
- BidBarrel config diff (`/config/diff`) path implies incremental updates -- the `/config` base endpoint may return a different structure; only `/config/diff` was confirmed.
- Prebid Server at `pbs.at.cbsi.com` accepts OpenRTB 2.5 auction requests but requires a valid bid request structure. Malformed requests return 400.
- Chartbeat MAB endpoint requires `domain` and `path` parameters -- requests without them return 400.
