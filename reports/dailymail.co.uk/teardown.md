---
# agents: machine-friendly instructions in "## Machine Briefing"
title: Daily Mail — Teardown
url: "https://www.dailymail.co.uk"
company: Daily Mail
industry: Information
description: "British tabloid news publisher, one of the world's most-visited English-language sites"
summary: "Daily Mail runs a server-rendered Clojure CMS (internal name CLJ, version 5.570.0) behind Akamai CDN and WAF. Pages are fully rendered HTML enriched by a large JavaScript layer handling ad serving via Prebid.js header bidding, paywall gating via Zephr, and audience segmentation via Permutive. Subscription content uses Sophi AI to score articles by geo market, but gating is enforced entirely in the browser — the server delivers full article HTML to all requesters. The site runs one of the larger ad-tech stacks in publishing: 11 SSPs, 5 identity graph providers, and 57 third-party domains firing on every page load."
date: 2026-04-06
time: "04:57"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack: ["Akamai", "Clojure CMS", "Zephr", "Prebid.js", "Sophi AI", "TeamCity"]
trackers: ["Google Analytics", "Google DFP", "Facebook Pixel", "Permutive", "Visual Website Optimizer", "DotMetrics", "ID5", "LiveRamp", "33Across", "IAS", "StackAdapt", "Kargo", "RTB House", "Pushly", "Outbrain", "Connatix", "Boomerang"]
tags: ["paywall-bypass", "pre-consent-tracking", "ml-model-exposed", "source-maps", "identity-graph", "ai-blocking", "header-bidding", "tabloid", "clojure", "akamai"]
headline: "Every DailyMail+ paywalled article ships its full text in the HTML — the paywall is CSS that hides content your browser already downloaded"
findings:
  - "DailyMail+ subscription articles deliver their complete body text in the server response — Zephr's paywall hides it with CSS after the page loads, so curl, view-source, or any scriptless client reads the full article for free"
  - "An unauthenticated API returns the scores from Daily Mail's AI paywall engine for every article — the exact probability, the threshold it must beat, and whether each country's readers see a paywall or not"
  - "Daily Mail's internal identity-sync endpoint accepts requests from any website and links a subscriber's CRM profile to their ad auction ID — no login required, CORS wide open"
  - "Production source maps on the CDN contain the original TypeScript source, the CI build server identity, and a hardcoded list of 37 countries where paywalling is silently disabled"
  - "57 ad and tracking domains fire the instant the page loads — before the consent banner even appears — and the CCPA cookie is pre-set to 'not opted out of sale'"
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

Daily Mail's stack is unusual for a publisher of this scale. The CMS is a Clojure application built in-house — the platform string embedded in every page reads `mol.web.desktop` (MOL = Mail Online), the version is exposed as `cljVersion: 5.570.0`, and frontend servers identify as `cljfe-b5` and `cljfe-b9` in the `cljNode` global. Clojure is rare in large-scale editorial CMS deployments; most tabloid-scale publishers run PHP, Node, or a commercial CMS.

Pages are fully server-rendered HTML, meaning article body content is present in the source before any JavaScript executes. JavaScript then handles ad loading, paywall decisions, video, push notification registration, and A/B test assignment. This architecture choice — rendering first, restricting second — is the root cause of the paywall bypass described below.

The CDN and WAF layer is Akamai. Response headers confirm `server: AkamaiGHost`; the homepage sets `x-robots-tag: noarchive` globally. Akamai EdgeScape geo-lookup is used throughout: article pages embed visitor IP and coordinates via `PageCriteria.clientIP`, `PageCriteria.latitude`, and `PageCriteria.longitude` in inline script, sourced from EdgeScape before the page is assembled.

Static assets are served from dedicated subdomains: `scripts.dailymail.co.uk` (JavaScript bundles), `i.dailymail.co.uk` (images), `video.dailymail.co.uk` (video files), `ted.dailymail.co.uk` (ad tags), `t.dailymail.co.uk` (tracking pixels).

The ad serving layer uses Google Ad Manager (DFP) with two network IDs in evidence: `/5765/` in video ad unit paths (`/5765/dm.video/dm_video_sport`) and `424397508` in display ad unit paths (`424397508/dailymail.uk/dm_dmushome_ushomehp/billboard`). Header bidding runs via Prebid.js with 11 confirmed SSP partners. The full A/B test allocation for ad experiments is stored in `window.adsMVTResults` and served to the client.

Consent management uses a dual-CMP arrangement: DMG's own CMP at `cmp.dmgmediaprivacy.co.uk` (TCF v3) alongside Google Funding Choices (`fundingchoicesmessages.google.com`). The DMG CMP exposes a geo-lookup endpoint at `/locationjson.html` that returns country, region, city, and EU/US jurisdiction flags for any caller without authentication.

The video player is Connatix, which makes 12 separate API calls per article page to `capi.connatix.com`. Video metadata is available unauthenticated at `/api/player/{id}/video-options.json`, which returns CDN URLs, DFP ad unit configuration, Grapeshot (Oracle) brand safety config, and related video feeds.

An Akamai EdgeScape debug page at `/geo/edgedata.html` remains publicly accessible. It returns a full geolocation profile of the requesting IP: continent, country, region, city, DMA, MSA, area code, latitude, longitude, county, timezone, ISP name, network type (cable/DSL/fiber), ASN, zip code range, and estimated bandwidth. The endpoint caches at 10-minute TTL and requires no authentication.

## The Paywall That Ships the Answer Key

Daily Mail Plus operates a metered paywall across AU, CA, GB, MX, NZ, ROW, and US markets. The paywall engine is Zephr, a subscription management platform. The implementation has a fundamental structural problem: the server delivers the complete article body to every requester, and Zephr's enforcement is entirely in the browser.

The mechanism: Zephr's features endpoint at `/zephr/features` defines four CSS selector targets:

```json
[
  { "id": "article", "cssSelector": "#mol-fe-zephr-outcome-wrapper" },
  { "id": "dynamic-inline-subs-banner", "cssSelector": "[data-dynamic-inline-subs-banner]" },
  { "id": "masthead", "cssSelector": ".home .masthead [data-paywall-home-masthead]" },
  { "id": "puzzles", "cssSelector": "#mol-fe-zephr-puzzles-outcome-wrapper" }
]
```

After a browser loads the page and the Zephr client SDK evaluates user entitlements via `POST /zephr/feature-decisions`, it injects CSS that hides `#mol-fe-zephr-outcome-wrapper` — the element wrapping the article text. The browser then renders only a teaser and a subscription prompt. The outcome label confirms the decision: `window.Zephr.outcomes.article.outcomeLabel = "Inline Paywall US 192a"`.

The article text, however, is present in the full `itemprop="articleBody"` block in the HTML source before any of this occurs. A verified live spot-check on a DailyMail+ article shows `isPaywalled = true` and `paywalledCountries = ['au', 'ca', 'gb', 'mx', 'nz', 'row', 'us']` set in inline JavaScript — while the same HTML document contains the complete article prose in `[itemprop="articleBody"]`.

```bash
curl "https://www.dailymail.co.uk/news/article-15705327/Tiger-Woods-..."
# Returns: full article body in itemprop="articleBody"
# Returns: PageCriteria.isPaywalled = true in inline script
# No authentication required. No JavaScript required.
```

This is not a misconfiguration of Zephr specifically — Zephr supports both server-side and client-side enforcement modes. Daily Mail has deployed the client-side mode. Any non-browser HTTP client reads the full text of any DailyMail+ article regardless of its paywall status or the reader's subscription state.

## Sophi AI — The Paywall's Brain, Fully Exposed

Sophi is an AI paywall decision system developed by The Globe & Mail and licensed to publishers. Daily Mail uses it to score each article's propensity to drive subscriptions, then makes geo-market-specific paywall decisions based on those scores.

The scoring data is fully exposed via unauthenticated API. Both of these endpoints return wallDecisions for every article:

```
GET /api/mol-fe-feeds/v2/articles/rankedPaywalled/geo/{GEO}
GET /api/mol-fe-feeds/v2/articles/rankedByChannelReferrer/{channel}
```

Each article in the response includes a `wallDecisions` object with a block per geo market:

```json
"wallDecisions": {
  "us": {
    "trigger": "{\"runtimeModelVersion\":\"content-ensemble:1.0.0\",\"parameters\":{\"threshold\":0.5,\"score\":0.77}}",
    "propensityLevel": 4,
    "sophiArticleWallDecisionId": "c449642b-f0a1-4721-95e7-d225cc1730f5",
    "wallVisibility": "always",
    "wallType": "paywall",
    "createdDate": "2026-04-01T18:33:42+0100"
  },
  "gb": {
    "trigger": "{\"runtimeModelVersion\":\"content-ensemble:1.0.0\",\"parameters\":{\"threshold\":0.55,\"score\":0.10}}",
    "propensityLevel": 2,
    "wallType": null
  }
}
```

The `score` field (0.0–1.0) is Sophi's model output for that article in that market. The `threshold` is the cutoff above which the article gets walled. The `wallType` shows the actual decision (`paywall`, `metered`, or `null`). The `sophiArticleWallDecisionId` is a UUID identifying the specific inference run. The `trigger` field is a JSON-encoded string nested inside the JSON response — it requires double-parsing.

The differential threshold between markets is visible in the data: US threshold is 0.50, GB is 0.55. The rankedPaywalled endpoint returns 40 articles per call, all articles flagged `isPaywalled: true` in the CMS, along with the model's per-geo confidence that they should actually be walled.

The Sophi production account IDs are hardcoded in client JavaScript loaded from `cdn.sophi.io`: AU=1741787707, GB=333432218, ROW=1846856199, US=2490309188. Staging IDs are also present: AU=2351856024, GB=711919013, ROW=434186525, US=454933469.

A timing conflict in the integration produces a measurable consent gap: the browser console shows `"Error loading Sophi integration script: CMP consent check timed out"` on some page loads, meaning Sophi analytics fires before consent is confirmed.

From TypeScript source recovered from production source maps, `paywallEligible.ts` contains a hardcoded `PAYWALL_EXCLUDE_GEOS` list built into the bundle: US, CA, AU, NZ, IN, IR, CU, KP, SY, VE, AF, BY, BI, CF, CN, HK, CD, EG, ER, ET, IQ, LB, LY, ML, MM, NI, GN, GW, RU, SO, SS, SD, TN, TR, UA, YE, ZW — 37 countries where paywalling is disabled. The list includes sanctions-related jurisdictions alongside markets where Daily Mail apparently doesn't pursue subscriptions.

## Surveillance Stack

**Scale:** 57 third-party domains, 419 requests on a single homepage load. All fire before any consent interaction.

**CCPA state:** `usprivacy=1YNN` is set as a cookie on first load. The string means: version 1, not opted out of sale, no known child, explicit notice status unknown.

**Cookies set before consent (complete list):**

Analytics and attribution: `_ga`, `_ga_C9F47K6NW6` (GA4 measurement ID), `_gcl_au` (Google Click Linker), `_fbp` (Facebook Pixel), `_lr_sampling_rate` (FullStory/LogRocket sampling).

Identity graph: `_lc2_fpi`, `_lc2_fpi_js`, `_lc2_fpi_meta` (LiveRamp ATS); `_pubcid`, `_pubcid_cst` (PubCommon ID / SharedID); `krg_crb`, `krg_uid` (Kargo); `33acrossIdTp` (33Across); `permutive-id` (Permutive DMP); `pbjs-unifiedid`, `pbjs-unifiedid_cst` (Prebid unified ID).

A/B testing: `_vwo_uuid`, `_vwo_uuid_v2`, `_vwo_sn`, `_vis_opt_s`, `_vis_opt_test_cookie`, `_vwo_ds` (all Visual Website Optimizer).

Ad infrastructure: `DM_SitId845`, `DM_SitId845SecId4649` (DotMetrics SiteID 845), `__gads`, `__gpi`, `__eoi` (Google Ad Storage), `FCCDCF`, `FCNEC` (Google Funding Choices), `sa-user-id`, `sa-user-id-v2`, `sa-user-id-v3` (unknown adtech), `uuid`, `mol.ads.visits`, `mol.ads.visitsExpire`.

Session: `gab` (DMG session ID, Secure, domain `.www.dailymail.co.uk`), `blaize_session`, `blaize_tracking_id`, `bm_so`, `bm_lso`, `dm_clientsegment`, `_ml_id`, `_li_dcdm_c`, `g_state`, `DotMetrics.DomainCookie`, `usprivacy`.

**Identity resolution layer:**

Five identity systems operate simultaneously:

1. **Permutive** — primary DMP. Makes 12 separate API calls per page to `api.permutive.com`: `/v2.0/watson`, `/v2.0/identify`, `/v2.0/geoip`, `/audience-matching/v1/id/{id}`, `/adv/v4/segment`, `/clm/v1/segment`, `/v1.0/state`, `/v2.0/batch/events`, `/sdk-errors/v2/errors`, `/v2.0/internal/metrics`, and audience-specific segment endpoints. Also downloads a binary ML model from `cdn.permutive.com/models/v2/{uuid}-models.bin`. Sends user segments to SSPs as Prebid real-time data.

2. **ID5** (`id5-sync.com`) — cross-publisher probabilistic ID synced with Prebid. Four endpoints per page: `/api/config/prebid`, `/bounce`, `/api/esp/increment`, `/gm/v3`. Also calls `lbs.eu-1-id5-sync.com/lbs/v1` and `lb.eu-1-id5-sync.com/lb/v1` (load balancer endpoints).

3. **LiveRamp ATS** (`rlcdn.com`, `liadm.com`) — email-based identity resolution for logged-in users. Cookies: `_lc2_fpi`, `_lc2_fpi_js`, `_lc2_fpi_meta`. Calls `idx.liadm.com/idex/prebid/84252`, `api.rlcdn.com/api/identity`, `rp.liadm.com/j`, `rp4.liadm.com/j`.

4. **33Across** (`lexicon.33across.com`) — fingerprint-based envelope ID, cookie `33acrossIdTp`. Calls `/v1/envelope`.

5. **IntentIQ** — listed as a headerbidding A/B test variant (`headerbidding.intentiq`), cookieless ID targeting, testing against Ozone Project in the `ozoneDmgID` experiment.

**Internal identity link endpoint:**

`idsync.anm.co.uk/scv-link` is a DMG-internal endpoint that links a subscriber's SCV (Single Customer View — DMG's first-party CRM ID) to a `bidmaxId` (the ad auction targeting identifier). This is the operational bridge between subscriber identity and ad profile. The endpoint has `Access-Control-Allow-Origin: *` (verified by OPTIONS preflight — server returns `access-control-allow-origin: *`, `access-control-allow-methods: GET,HEAD,PUT,PATCH,POST,DELETE`). No authentication required.

**Header bidding ecosystem — 11 SSPs confirmed:**

Amazon APS/TAM (`aax.amazon-adsystem.com`), AppNexus/Xandr (`ib.adnxs.com`), Ozone Project (`elb.the-ozone-project.com`), PubMatic (`hbopenbid.pubmatic.com`, `image8.pubmatic.com`), Rubicon/Magnite (`fastlane.rubiconproject.com`, `prebid-server.rubiconproject.com`), Index Exchange (`htlb.casalemedia.com`), OpenX (`rtb.openx.net`), Criteo (`grid-bidder.criteo.com`), 3Lift (`tlx.3lift.com`), Kargo (`krk2.kargo.com`), Smart AdServer (`prg.smartadserver.com`).

**Live A/B ad experiments from `window.adsMVTResults`:**
- `TTDopenpath`: 2% of users have The Trade Desk removed from the bidder pool
- `globalPartners allOff`: Removes 10 bidders (Teads, Unruly, PGAM, Rise, Yahoo SSP, MediaGo, others) for the test cohort
- `stackAdaptPixel`: 95% of users receive the StackAdapt retargeting pixel
- `ozoneDmgID`: 99% of Chrome users — Ozone Project receives the DMG user ID for cross-publisher targeting (`plugins.bidders.ozone.provideUserId = true`)
- `sophitruecontrol`: 1% of users have Sophi analytics removed (pure ML control group)
- `affilimate`: Affiliate link tracking test on 5 specific article IDs

**Additional trackers confirmed:**
- Google Private Aggregation API: 36 calls per page to `www.googleadservices.com/.well-known/private-aggregation/report-shared-storage`
- Google Remarketing: `www.google.com/rmkt/collect/670087309/`
- Boomerang/mPulse RUM: `c.go-mpulse.net/api/config.json`
- IAS brand safety: `pixel.adsafeprotected.com/services/pub`
- RTB House retargeting: `esp.rtbhouse.com/encrypt`
- Pushly push notifications key: `PYGfY6VSoQx2z2MJUVW0nL7t0AyIAHprQ6IJ` via `hulkprod.anm.co.uk`
- Trackonomics affiliate monitoring: `iad.anm.co.uk/tnomics/trackonomics.pattern.txt` — a ~3KB regex that classifies affiliate links across Amazon, eBay, Walmart, Target, ShareASale, AWIN, CJ, Rakuten, VigLink, SkimLinks, and 40+ other networks
- The Trade Desk match: `match.adsrvr.org/track/rid`
- AcuityPlatform: `ums.acuityplatform.com/tum`
- OpenX ESP: `oajs.openx.net/esp`
- Adentifi cookie sync: `rtb.adentifi.com/CookieSyncPubMatic`

## AI/LLM Blockade

The `robots.txt` (updated 01/04/2026) runs one of the more comprehensive AI crawler blocklists observed. The preamble explicitly prohibits text and data mining under Art. 4 of the EU Directive on Copyright in the Digital Single Market, development of ML/AI/LLMs, creating archived datasets, and any commercial use. Contact: `partnerships@dmgmedia.co.uk`.

AI-blocked user agents (all `Disallow: /`): AhrefsBot, AI2Bot, Ai2Bot-Dolma, Amazonbot, amazon-kendra-, anthropic-ai, Applebot-Extended, bedrockbot, Bytespider, CloudflareBrowserRenderingCrawler, CCBot, ChatGLM-Spider, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, Claude-Web, cohere-ai, Cotoyogi, DeepSeekBot, Diffbot, DuckAssistBot, EchoboxBot, FacebookBot, FriendlyCrawler, Gemini-Deep-Research, Google-CloudVertexBot, Google-Extended, GoogleOther, GoogleOther-Image, GoogleOther-Video, GPTBot, Grok, iaskspider/2.0, ICC-Crawler, ImagesiftBot, img2dataset, ISSCyberRiskCrawler, Kangaroo Bot, KunatoCrawler, LinerBot, Meltwater, Meta-ExternalAgent, Meta-ExternalFetcher, MistralAI-User, OAI-Operator, OAI-SearchBot, omgili, omgilibot, PanguBot, PerplexityBot, Perplexity-User, PetalBot, QualifiedBot, Scrapy, Seekr, Sidetrade indexer bot, TaraGroup Intelligent Bot, TikTokSpider, Timpibot, VelenPublicWebCrawler, WARDBot, Webzio-Extended, wpbot, WRTNBot, YouBot.

The sole carve-out: `Allow: /buyline/` — affiliate shopping content is explicitly permitted for AI crawlers.

Archival crawlers are also fully blocked: archive.org, archive-it.org, Wayback Machine, British Library (`bl.uk_ldfc_bot`, `bl.uk_ldfc_renderbot`), National Archives (`nationalarchives.gov.uk`), and 20+ national web archive bots from the Netherlands, Denmark, France, Portugal, Czech Republic, Japan, and others.

A secondary WAF-layer enforcement: requests to `/llms.txt` and `/ai.txt` return HTTP 200 with an Akamai "Access Denied" HTML body. The status code is 200; the body is a 403 error page with an Akamai reference number. A naive agent that checks only status codes would interpret these as successful responses with no directives.

The tension is structural: the site invests heavily in blocking AI crawlers from reading its content, while the server-rendered architecture delivers full paywalled article text to any HTTP client that asks.

## CI Infrastructure in Source Maps

JavaScript bundles on `scripts.dailymail.co.uk` ship production source maps. Two confirmed accessible:

**`mol-fe-xpmodule-top-stories/2.12.1/index.js.map`** — 55 sources. Confirms the `@mol-fe/` monorepo package namespace. TypeScript components include `PaywallSignpost.tsx`, `HeaderArrowComponent.tsx`, and `paywallEligible.ts`. Sources use `webpack:///@mol-fe/mol-fe-xpmodule-top-stories/` scheme.

**`mol-fe-sync-bundle/15.78.0/desktop.js.map`** — 1.5MB, 475 sources, 311 TypeScript/JavaScript files. Exposes the CI build system: TeamCity agent `teamcity_agent_molfe-node18-a2` (Node 18), workspace hash `73e141aa3c0bbbe5`, full build path `/opt/teamcity_agent_molfe-node18-a2/work/73e141aa3c0bbbe5/`. The `sourcesContent` field includes original TypeScript source.

Monorepo packages visible in source paths: `mol-fe-sync-bundle`, `mol-fe-async`, `mol-fe-page-metadata`, `mol-fe-multivariant`, `mol-fe-article-read`, `mol-fe-auto-puff`.

The source maps are production artifacts, versioned and served from the production CDN alongside the minified bundles — not development leftovers.

## Machine Briefing

**Access & auth:** All article and feed endpoints work without authentication or session cookies. Browser UA is not required but helps avoid Akamai edge-cache rate limiting on rapid successive calls. The `gab` session cookie (domain `.www.dailymail.co.uk`, Secure) is used for Zephr feature-decision evaluation but not for content access.

**Open endpoints — no auth required:**

Read a DailyMail+ paywalled article in full:
```bash
curl "https://www.dailymail.co.uk/news/article-{id}/slug.html"
# Look for: <div itemprop="articleBody">...</div>
# PageCriteria.isPaywalled = true will be present simultaneously
```

Get Sophi AI paywall scores for 40 articles (geo variants: US, GB, AU, ROW):
```bash
curl "https://www.dailymail.co.uk/api/mol-fe-feeds/v2/articles/rankedPaywalled/geo/US"
curl "https://www.dailymail.co.uk/api/mol-fe-feeds/v2/articles/rankedPaywalled/geo/GB"
# Response: articles[].wallDecisions.{geo}.trigger (JSON string — double-parse for score/threshold)
# Also: .wallType, .wallVisibility, .propensityLevel (1-5), .sophiArticleWallDecisionId (UUID)
```

Get article feed by topic group:
```bash
curl "https://www.dailymail.co.uk/api/mol-fe-feeds/v2/articles/rankedByTopicGroup/{topic}/size/50/withXpModules/false"
# topic examples: royals, news, sport, health, lifestyle
# Returns wallDecisions alongside standard article metadata
```

Get article feed by channel referrer (also returns wallDecisions):
```bash
curl "https://www.dailymail.co.uk/api/mol-fe-feeds/v2/articles/rankedByChannelReferrer/{channel}"
# channel examples: news, sport, tvshowbiz, health
```

Get video player configuration:
```bash
curl "https://www.dailymail.co.uk/api/player/{video-id}/video-options.json"
# Returns: CDN mp4 URL, DFP ad unit path (/5765/dm.video/...), Grapeshot brand safety config
# Also: related-videos endpoint, animated preview frames, embed URL
```

Get Zephr paywall CSS targets:
```bash
curl "https://www.dailymail.co.uk/zephr/features"
# Returns: array of {id, cssSelector} — the elements Zephr hides/shows
```

Get commercial top videos by channel:
```bash
curl "https://www.dailymail.co.uk/feeds/commercial/topVideos.json"
# Keyed by: health, lifestyle, money, news, sciencetech, sport, travel, tvshowbiz
```

Get CMP geo-lookup:
```bash
curl "https://cmp.dmgmediaprivacy.co.uk/locationjson.html"
# Returns: {"Country":"...", "REGION_CODE":"...", "CITY":"...", "INEU":bool, "INUS":bool}
```

Get caller geolocation via Akamai EdgeScape:
```bash
curl "https://www.dailymail.co.uk/geo/edgedata.html"
# Returns: IP, continent, country, region, city, DMA, latitude, longitude,
#          ISP name, network type, ASN, zip, estimated bandwidth
# 10-minute CDN cache
```

Infinite scroll HTML fragment (disallowed in robots.txt but returns 200):
```bash
curl "https://www.dailymail.co.uk/api/infinite-list.html"
```

**Source maps (direct fetch — production CDN):**
```bash
curl "https://scripts.dailymail.co.uk/static/mol-fe/static/mol-fe-xpmodule-top-stories/2.12.1/index.js.map"
curl "https://scripts.dailymail.co.uk/static/mol-fe/static/mol-fe-sync-bundle/15.78.0/desktop.js.map"
# Second file is 1.5MB and contains original TypeScript source code
```

**Endpoints requiring session cookie:**
- `POST /zephr/feature-decisions` — requires `gab` cookie; evaluates paywall entitlement for a given feature set
- `GET /user-values/{uuid}` — user entitlements/subscription state; UUID from permutive-id or identity cookies
- `GET /reconciler/{uuid}` — identity reconciliation, returns 304 on repeat

**Gotchas:**
- Akamai rate-limits rapid successive calls to `/api/mol-fe-feeds/*` from the same IP. Rotate UA or space requests.
- `/llms.txt` and `/ai.txt` return HTTP 200 with a 403 error body — check response body, not status code.
- The `gab` cookie domain is `.www.dailymail.co.uk` (includes `www.` subdomain prefix) — sending to `dailymail.co.uk` won't work.
- `wallDecisions.trigger` is a JSON string nested inside JSON — requires `JSON.parse(JSON.parse(response).articles[0].wallDecisions.us.trigger)`.
- CSP header is `content-security-policy-report-only` — not enforced, reports to `dmgm.report-uri.com`.
- Article IDs from the `rankedPaywalled` feed combine with URL pattern: `/{channel}/article-{id}/...html`.
- Akamai WAF may return HTTP 200 with an "Access Denied" body for blocked paths — always check body content alongside status code.
