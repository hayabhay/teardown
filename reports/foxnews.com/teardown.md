---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Fox News — Teardown"
url: "https://www.foxnews.com"
company: "Fox News"
industry: "Information"
description: "Cable news network and digital news publisher."
summary: "Fox News runs a custom SSR frontend called Orion on Express/Node.js, backed by a WordPress headless CMS (tiger-cms) and a cluster of internal microservices -- pyxis (analytics), idgraph (identity graph), fennec (GraphQL config), foxstrike (ad orchestration) -- behind Akamai with a three-layer Varnish cache and CloudFront for internal routing. The ad stack runs Prebid with 9 DSPs, Google Ad Manager, Amazon APS, and a dual content-scoring pipeline (DoubleVerify + Mobian) that emotionally profiles every article before each ad auction."
date: "2026-04-13"
time: "07:03"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Orion SSR, Express, Varnish, Akamai, CloudFront, Brightcove, WordPress Headless, Prebid]
trackers: [Adobe Analytics, Adobe Target, Google Ad Manager, Amazon APS, Braze, Segment, Optimizely, Chartbeat, Taboola, Outbrain, TrueAnthem, Microsoft UET, LiveRamp, Audigent, Knotch, DoubleVerify, Mobian, IntegralAds, Comscore, Springserve]
tags: [news, media, ad-tech, editorial-filtering, content-scoring, identity-graph, wire-services, a-b-testing, prebid, emotional-profiling]
headline: "Hardcoded frontend filters exclude AP, Reuters, and six named political figures from Fox News section feeds before the page renders."
findings:
  - "The politics, world, and US section feeds exclude AP and Reuters wire content via hardcoded negative tag filters in frontend JavaScript -- the exclusions require a code deploy to change, not a CMS editorial decision."
  - "The US section's article-search query adds person-tag exclusions for Biden, Harris, AOC, Buttigieg, Pope Francis, and Eric Adams, plus a topic exclusion for all Russia-tagged content."
  - "Every article is scored for anger, disgust, fear, joy, and pride by Mobian before ads load -- the emotional profile feeds directly into Google Ad Manager, Amazon APS, and Prebid bid requests to set ad targeting and pricing."
  - "Chartbeat's unauthenticated headline A/B API exposes every active experiment with original text, winning variant text, and the exact DOM XPath pointing to each tested article link."
  - "The Knotch config endpoint leaks Fox's full internal domain topology: 30 properties, 69 staging/dev/QA URLs including 8 numbered Credible.com test environments, and private financial product paths."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Fox News is one of the most technically instrumented news sites on the web -- 20+ trackers on the homepage, 45+ third-party domains on article pages, an in-house ad orchestration layer, and a first-party identity graph that links anonymous visitors across the entire Fox property network. But the most interesting things aren't in the surveillance stack. They're in the editorial filtering baked into the frontend code and the emotional content scoring that prices every ad slot.

## Architecture

Fox News runs a custom server-side rendered frontend called Orion, built on Express/Node.js. jQuery is still present (`$`, `_` globals) alongside the Orion template system, which fetches `.html` template partials from `/static/orion/scripts/` at runtime. The CMS behind the editorial content is tiger-cms -- a WordPress headless instance running at `cms.foxnews.com` -- whose identity surfaces in API responses via a `wp__origin` field exposing `source: "tiger-cms"`, `environment: "production"`, `blog_id`, and `post_id` for every article.

The CDN stack layers three Varnish caches in front of Akamai as the outer edge. Internal microservices run behind CloudFront and are identifiable by the `x-debug-backend` header, which appears on every response: `prod_fn_hp_foxnews` (homepage), `fox_xid` (/xid), `default_origin` (section pages). The companion `x-debug-url` header exposes internal routing paths (`/index.html`, `/v2/xid`). Both headers are present in production.

Build state is exposed in JavaScript globals: `BUILDVERSION=6.0.0.5`, `FNC._DEPLOY_VERSION=20260410180800` (April 10, 2026 deploy). The `FOX_ENV_STATIC=prod` flag and `FNC.CDN` object confirm the production environment.

**Internal microservice inventory** (inferred from network traffic and JavaScript globals):
- `hp-cms.foxnews.com` -- homepage CMS, nginx/Express, publicly reachable at login page (`302 /login`)
- `moxie.foxnews.com` -- video CMS API, unauthenticated `/videos` endpoint
- `api.strike.fox` -- contextual ad-targeting API (foxstrike)
- `prod.pyxis.atp.fox` -- first-party analytics event hub
- `prod.idgraph.dt.fox` -- cross-domain identity graph (auth required)
- `prod.fennec.atp.fox` -- GraphQL config service for all Fox properties (auth required)
- `api.community.fox.com` -- reactions and comment system

Video pipeline: Brightcove (account ID `694940094001`) for asset storage, HolaSpark (`player.h-cdn.com`) for the web player, Akamai for HLS stream signing, and Springserve (`tv.springserve.com`) for video ad serving.

HSTS max-age is set to 300 seconds (5 minutes). No Content-Security-Policy header was observed. CORS is `Access-Control-Allow-Origin: *` across all first-party APIs.

---

## Content Filtering -- AP and Reuters Wire Exclusions

The hard news sections of foxnews.com exclude AP and Reuters content at the API query layer. The article-search endpoint (`/api/article-search`) accepts tag-based filter parameters. Across the politics, world, and US sections, every major feed query includes negative tag filters: `-fox-news/topic/associated-press` and `-fox-news/topic/reuters`, with a corresponding `excludeValues=AP,Reuters` parameter. These are constructed client-side in the Orion frontend JavaScript and require a frontend deploy to change.

The exclusion is section-selective, not sitewide. AP content does appear on foxnews.com -- in the entertainment, science, and media sections -- as confirmed by direct API responses returning articles with `source.label: "Associated Press"`. The exclusions are specific to the hard news verticals.

The US section carries the most extensive exclusion list. In addition to AP and Reuters, the query parameters filter out content tagged with the following person identifiers:
- `fox-news/person/joe-biden`
- `fox-news/person/kamala-harris`
- `fox-news/person/alexandria-ocasio-cortez`
- `fox-news/person/pete-buttigieg`
- `fox-news/person/pope-francis`
- `fox-news/person/eric-adams`

And one topic exclusion: `fox-news/world/world-regions/russia` -- Russia-tagged content is filtered from the US section feed.

The politics section maintains a dedicated Trump feed (`fox-news/person/donald-trump`) that also excludes AP and Reuters. The Netanyahu section in the world vertical applies the same wire exclusions. The Senate/House subsection within politics does not carry the AP/Reuters filter.

A summary of which sections apply wire exclusions:

| Section | Excludes AP | Excludes Reuters | Extra exclusions |
|---------|-------------|------------------|-----------------|
| politics (main) | Yes | Yes | -- |
| politics / Trump section | Yes | Yes | -- |
| politics / Senate-House | No | No | -- |
| world (main) | Yes | Yes | -- |
| world / Netanyahu section | Yes | Yes | -- |
| US (main) | Yes | Yes | Biden, Harris, AOC, Buttigieg, Pope Francis, Eric Adams, Russia |
| entertainment | Yes | No | -- |
| opinion | No | No | -- |
| media | No | No | -- |

---

## Contextual Scoring -- Mobian Emotional Profiling

Before each ad auction, Fox News calls its internal contextual scoring API (`api.strike.fox/ctx/v1/tags`) with the current page URL. The API returns a layered scoring response from two providers -- DoubleVerify (DV) and Mobian -- used to configure ad targeting parameters for every bidder.

The API key appears in the request URL as a query parameter: `x-api-key=bgAMJkLmh43vgYX7ubKF77D1zPwmFBPs`. The endpoint is unauthenticated beyond this client-side key, which is visible in browser network traffic and JavaScript source.

**Mobian** performs emotional and editorial profiling per URL. Sample scores from observed requests:

Trump/NATO article (politics):
```
mobian_emotions: anger,disgust,fear,nervousness
mobian_risk: medium
mobian_sentiment: neutral
mobian_themes: geopolitics,international relations,middle east,military,national security,us foreign policy
mobian_tones: analytical,assertive,critical,informational
mobian_genres: analysis,interview,news,opinion,politics
```

Opinion/religion article:
```
mobian_emotions: joy,pride
mobian_risk: low
mobian_sentiment: positive
mobian_themes: patriotism,religion,science
mobian_tones: celebratory,inspirational
mobian_genres: news,opinion
```

Politics section page:
```
mobian_themes: law enforcement,media,public safety
mobian_tones: informative,promotional
mobian_risk: low
mobian_sentiment: neutral
```

**DoubleVerify** returns 70+ brand-safety segment IDs per page alongside IAB content category codes (cat, sectioncat, pagecat) in both numeric (IAB1, IAB14) and DV segment formats.

These scores feed directly into three downstream systems:
- **Google Ad Manager**: `cust_params` field populated with DV segment IDs and Mobian mood/genre tags
- **Amazon APS**: `apc.cat`, `apc.sectioncat`, `apc.pagecat` set from DV IAB codes
- **Prebid**: `xandr_genre` and ORTB `cat`/`sectioncat`/`pagecat` set from the combined output

The foxstrike configuration (`window.foxstrike`) declares `contextAPI.providers: "dv,mobian"` -- both providers run on every page. The strike API is called 4+ times per article page load.

---

## Identity Stack

Fox has built a first-party identity infrastructure that operates in parallel with third-party vendor tracking. The core components:

**FNC.xid** -- Fox's primary cross-domain identifier. A UUID assigned on first visit, stored in three places simultaneously: the `xid` cookie, `xid` in localStorage, and `__leap_props` cookie (as `lastAnonymousProfileId` and `persistAnonId`). The xid service lives at `/xid` (internally routed to `fox_xid` backend) and fires events to `prod.pyxis.atp.fox/pyxis/submit`.

**FNC.anon** -- Anonymous fingerprint layer. Exposes `anon_fpid`, `persist_fpid`, `persist_prev`, and `updateAnon` in the global scope. Stored in localStorage as `anon_fpid`.

**FNC.ISA** -- The vendor orchestration object. Sequences the initialization of 40+ third-party vendors in a defined order. The ISA config includes keys for: `eu`, `ccpa`, `tou`, `ketch`, `segment`, `optimizely`, `omni` (Adobe), `chartbeat`, `coms`, `track`, `doubleverify`, `buzzFeed`, `goog`, `bing`, `criteo`, `gpt`, `holaSpark`, `prebid`, `amazon`, `moat`, `niel`, `perfectMarket`, `pubEx`, `zergnet`, `skimlinks`, `braze`, `verizon`, `knotch`, `marketcastPixel`, `recaptcha`, `tealium`, `trueAnthem`, `anon`, `EID`, `taboola`, `content.discovery`, `strike-hot`, `coreTracker`, `leapmetrics`, `intCmp`, `fennec`, `afpid`, `fox-profile`, `xid`, `graphApi`, `heartbeat`, `taboola.map`.

**prod.pyxis.atp.fox** -- Fox's internal analytics event hub. Fires POST requests to `/pyxis/submit` 3-5 times per page, sending the xid value.

**prod.idgraph.dt.fox** -- Cross-domain identity graph service. Accepts POST to `/api/v2/item`. Requires authentication (fires from browser session with auth headers).

**prod.fennec.atp.fox** -- GraphQL config service for all Fox properties. The query structure observed in browser network traffic:
```graphql
query FennecConfig($businessUnit: String!) {
  opx { accountId idspaceMap { all { key value } } }
  bu { one(key: $businessUnit) { value {
    origin spec xidEndpoint pyxisEndpoint cdpBase defaultEvents
    firstPartyXidCookieEnabled opx { enabled }
  }}}
}
```
Variables: `{"businessUnit":"fnc"}`. The endpoint returns 401 without a valid session; the query schema is exposed in browser network logs.

**Third-party identity layer** -- On top of Fox's first-party stack, 8 additional identity graphs fire on page load: Adobe MCID (`AMCV_17FC406C5357BA6E0A490D4D@AdobeOrg`, `s_ecid`), Braze (`_swb`, `ab.storage.*`), LiveRamp ATS (`api.rlcdn.com`), Audigent/Hadron (`ums.acuityplatform.com`), IntegralAds IQ (`_iiq_fdata`), Outbrain (`OB-USER-TOKEN`), Microsoft UET (`_uetsid`, `_uetvid`), and Optimizely.

Cookies set on first load (no login, no consent interaction):
- `xid` -- Fox first-party UUID
- `EID=null` -- encrypted ID (blank on fresh session)
- `AMCV_17FC406C5357BA6E0A490D4D@AdobeOrg` -- Adobe Marketing Cloud visitor ID
- `s_ecid=MCMID|02762665835764293141193475280010637462` -- Adobe MCID
- `s_pers` -- Adobe Analytics persistence (omtr_lv, s_nr, s_ppn)
- `_ketch_consent_v1_` -- Ketch consent state (base64)
- `_swb_consent_` -- SailThru/Braze consent (base64)
- `usprivacy=1YNN` / `us_privacy=1YNN` -- CCPA signal (notice shown, not opted out)
- `_t_tests` -- Chartbeat headline A/B test assignments (base64)
- `kn_cs_visitor_id` -- Knotch visitor ID
- `_swb` -- Braze browser ID
- `dicbo_id` -- Dicbo timestamp ID
- `_uetsid`, `_uetvid` -- Microsoft/Bing ad tracking
- `_cb`, `_chartbeat2` -- Chartbeat engagement
- `ab.storage.*` (3 keys) -- Braze SDK device/session storage
- `optimizelySession` -- Optimizely session

localStorage (50+ keys on first load) includes the full Optimizely experiment state object (layer_states, layer_map, variation_map, visitor_profile, contextual_mab), HolaSpark video view history (`spark_web`), Outbrain user tokens, IntegralAds IQ data, and mirrored copies of consent state and Fox first-party IDs.

---

## Chartbeat Headline A/B Testing

Chartbeat's multi-armed bandit headline testing system exposes its entire configuration via an unauthenticated endpoint:

```
GET https://mab.chartbeat.com/mab_strategy/headline_testing/get_strategy/?host=foxnews.com&domain=foxnews.com&path=/
```

The response includes every active experiment for the given path: original headline text, all variant texts, the XPath location pointing to the exact `<a>` element in the DOM (including the article URL), strategy timestamp, and the bandit algorithm's current probability weight for each variant.

Active experiments captured at investigation time:

**Experiment `FzDIZuxKAtECV`** -- opinion article at `/opinion/quantum-mystery-may-explain-god-knows-every-thought`:
- Original: "The quantum mystery that may explain how God knows every thought you have"
- Variant D (probability 1.0): "The invisible force Einstein mocked may reveal how God knows what you are thinking about"

**Experiment `1oCECVbfcR2ey`** -- US article about a missing American woman:
- Variant A (probability 1.0): "SEE IT: Dinghy ride route taken before American woman disappeared as new details emerge"

Both experiments show probability=1.0 for a single variant -- the bandit has converged. The endpoint continues to return the full experiment record including the original (losing) headline.

The `specific_location` field in the response contains an XPath string that includes the full article URL, identifying which headline on the homepage corresponds to each experiment. Image variant testing is also supported -- the response contains full srcset arrays for image A/B tests alongside headline variants.

The endpoint works for any `path=` value (homepage, section pages). Article-level paths returned empty experiments in observed testing.

---

## Open Infrastructure

### Moxie Video CMS

`moxie.foxnews.com/videos` is an unauthenticated video CMS API with `Access-Control-Allow-Origin: *`. It returns full video metadata including stream URLs, MP4 direct URLs, internal CMS IDs, and Brightcove account data.

Tag-based filtering:
```
GET https://moxie.foxnews.com/videos?filter=media_tags:primary_travel
GET https://moxie.foxnews.com/videos?filter=media_tags:primary_politics
```

Each video response includes:
- `stream` -- HLS manifest URL with Fastly token
- `mp4` / `mp4_info` -- direct MP4 URL with Akamai token, file size in bytes, avg bitrate
- `bc__account_id: 694940094001` -- Brightcove account ID
- `wp__origin` -- tiger-cms metadata: `{source: "tiger-cms", site: "cms.foxnews.com", environment: "production", blog_id: 1, post_id: N}`

The MP4 URLs use Akamai token auth with HMAC signature and path-level ACL. Tokens observed in responses carry `exp=1791833941` -- expiry of October 12, 2026, approximately 6 months from generation. The root of `moxie.foxnews.com` returns 423 Locked.

### Knotch Configuration Leak

Knotch, a content engagement analytics platform, fetches its configuration from a public endpoint:
```
GET https://configs.knotch.com/v2/0c1098d4-e85c-41fd-be56-6189d39234c9
```

The response exposes Fox's full internal domain topology across two lists:

**Accept list (30 domains):** subs.fox.com, auth.fox.com, outkick.com, tmz.com, weather.com, fox.com, livenowfox.com, fox13seattle.com, fox6now.com, fox10phoenix.com, fox5atlanta.com, foxla.com, fox7austin.com, fox35orlando.com, fox9.com, fox2detroit.com, fox13news.com, ktvu.com, fox26houston.com, fox5dc.com, fox4news.com, fox29.com, fox32chicago.com, fox5ny.com, nation.foxnews.com, foxsports.com, tubitv.com, foxnews.com, credible.com, foxbusiness.com.

**Reject list (69 entries):** Staging, dev, and preview environments including `stage-www-ak-ms.foxnews.com`, `dev.foxnews.com`, `dev2.foxnews.com`, `dev.foxbusiness.com`, `staging-nation.foxnews.com`, `stage-preview.foxsports.com`, `hp.cms.foxnews.com`, `promethesus.foxnews.com`, `americatogether.foxnews.com`, `foxnews25.foxnews.com`, and 8 numbered Credible.com QA environments: `dev1434.qa.credible.com` through `dev1534.qa.credible.com` (non-contiguous: 1434, 1459, 1474, 1477, 1479, 1484, 1515, 1534).

The config also exposes `html_private_whitelist` -- private Credible.com financial product paths: `/insurance/get-started`, `/refinance/prequal/`, `/private-student-loans/`, `/personal-loans/`, `/step`.

### BeyondWords Text-to-Speech

Every Fox News article has an audio version via BeyondWords (project ID 9514). The API is unauthenticated:

```
GET https://api.beyondwords.io/v1/projects/9514/player/by_source_url/{encoded-article-url}
```

Returns HLS stream URL, MP3 URL, content segments (typically 12 per article), and ad configuration. `ads_enabled: true` -- BeyondWords inserts ads into the audio stream. The source ID is the article URL itself, making all audio endpoints predictable without tokens.

### hp-cms Admin Interface

`https://hp-cms.foxnews.com` is publicly reachable. The root redirects to `/login` (302), which returns 200. The login page is rendered without blocking, is indexed by `robots: noindex, nofollow`, and is powered by nginx/Express. No rate limiting or IP restriction was observed on the login page itself.

---

## Surveillance and Ad Stack

### Consent Model

Ketch CMP handles consent for foxnews.com. On first page load, with no user interaction, Ketch fires a sequence of four requests:
1. `GET global.ketchcdn.com/web/v3/ip` -- returns jurisdiction (`countryCode: US`, `regionCode: CA` in observed session)
2. `GET .../config/fds/foxnews_web/production/california/en/...` -- loads jurisdiction-specific config
3. `POST .../consent/fds/get` -- fetches existing consent record
4. `POST .../consent/fds/update` -- writes consent

No consent banner was rendered in the DOM. No consent modal, no cookie notice. The `_ketch_consent_v1_` cookie is set immediately with:
```json
{"targeted_advertising":{"status":"granted","canonicalPurposes":["personalization","analytics","behavioral_advertising"]}}
```

The `_swb_consent_` cookie (base64) contains `jurisdiction=california, legalBasisCode=consent_optout, allowed=true`.

Fox operates under CCPA's opt-out model for California visitors: all targeted advertising is permitted by default unless the user takes affirmative action to opt out. The `usprivacy=1YNN` string confirms notice was provided, user has not opted out, and Fox is an LSPA signatory.

### foxstrike Ad Configuration

The `window.foxstrike` global exposes Fox's full ad orchestration configuration:
- `taboolaEnabled: true`, `outbrainEnabled: true`
- `props.adRefreshRate: 30` -- ads refresh every 30 seconds
- `props.adPrefetchMargin: 350` -- ads prefetch 350px ahead of scroll position
- `dynamicProps`: all 6 interstitial types enabled (desktop/mobile/tablet x peak/regular)
- `contextAPI.providers: "dv,mobian"` -- both scoring providers active on all content
- `prebid.bidders`: appnexus, criteo, rubicon, ix, openx, pubmatic, triplelift, yahoossp, ttd

Prebid runs a full header bidding auction with 9 DSPs on every ad position. GAM (`securepubads.g.doubleclick.net`, `pubads.g.doubleclick.net`) serves as the primary ad server.

### Confirmed Trackers

First load (homepage): Adobe Analytics/Experience Cloud, Braze CRM, Segment.io, Ketch CMP, TrueAnthem, Chartbeat, Optimizely, Taboola (10 fires per homepage load), Outbrain, HolaSpark, Knotch, Amazon DSP, IntegralAds IQ.

Additional on article pages: Adobe Target, LiveRamp ATS, Audigent/Hadron, Springserve (video ads), full Prebid auction (AppNexus, Criteo, Rubicon, Index Exchange, OpenX, PubMatic, TripleLift, Yahoo SSP, The Trade Desk), Microsoft UET, Comscore, DoubleVerify (via foxstrike), Mobian (via foxstrike), BeyondWords.

Total third-party domains: 20 on homepage, 45 on article pages.

---

## Machine Briefing

### Access & auth

All article content, video metadata, and contextual scoring APIs are accessible without authentication. The Moxie video CMS and Knotch config endpoint require no headers beyond standard GET. The foxstrike contextual API uses a client-side API key in the query string. Fennec GraphQL and idgraph require browser session auth (401 without). BeyondWords requires the project ID in the path, no auth header.

No rate limiting was observed on the unauthenticated endpoints during investigation. CORS is `*` on all first-party APIs.

### Endpoints

**Article search (section feeds):**
```
GET https://www.foxnews.com/api/article-search?q=&values=[tags]&excludeValues=[tags]&size=10
```
Returns article list with title, description, URL, publication date, image, source, and tag metadata. Tag format: `fox-news/politics`, `fox-news/person/donald-trump`, `fox-news/topic/associated-press`.

**Live TV schedule:**
```
GET https://www.foxnews.com/api/live-now
```
Returns current live programming for FNC, FBN, Fox Weather, Fox Radio, and streaming channels. No auth.

**Moxie video CMS:**
```
GET https://moxie.foxnews.com/videos
GET https://moxie.foxnews.com/videos?filter=media_tags:primary_politics
GET https://moxie.foxnews.com/videos?filter=media_tags:primary_travel
```
Returns video records with `stream` (HLS), `mp4` (direct URL), `bc__account_id`, tiger-cms `wp__origin`, and duration.

**Contextual scoring:**
```
GET https://api.strike.fox/ctx/v1/tags?provider=dv,mobian&url={encoded-url}&x-api-key=bgAMJkLmh43vgYX7ubKF77D1zPwmFBPs
```
Returns DV segment IDs (IAB cats, brand-safety segments) and Mobian emotional/editorial scores for any URL. Called with page URL. Works on section pages and article URLs.

**Chartbeat headline A/B state:**
```
GET https://mab.chartbeat.com/mab_strategy/headline_testing/get_strategy/?host=foxnews.com&domain=foxnews.com&path=/
GET https://mab.chartbeat.com/mab_strategy/headline_testing/get_strategy/?host=foxnews.com&domain=foxnews.com&path=/politics
```
Returns all active headline experiments for the path: original text, variant texts, DOM XPath location, bandit probabilities.

**Knotch config (Fox property topology):**
```
GET https://configs.knotch.com/v2/0c1098d4-e85c-41fd-be56-6189d39234c9
```
Returns accept/reject/private domain lists. No auth.

**BeyondWords TTS:**
```
GET https://api.beyondwords.io/v1/projects/9514/player/by_source_url/{url-encoded-article-url}
```
Returns HLS and MP3 audio URLs, content segments, ads config. Source URL is the canonical foxnews.com article URL.

**Fox community reactions:**
```
GET https://api.community.fox.com/v2/reactions/manifest
GET https://api.community.fox.com/v2/topics/{topic-id}/trending
```
Returns reaction packs and trending comment IDs. No auth observed.

**Fennec GraphQL (auth required):**
```
POST https://prod.fennec.atp.fox/config/v2
Content-Type: application/json

{"query":"query FennecConfig($businessUnit: String!) { opx { accountId idspaceMap { all { key value } } } bu { one(key: $businessUnit) { value { origin spec xidEndpoint pyxisEndpoint cdpBase defaultEvents firstPartyXidCookieEnabled opx { enabled } } } } }","variables":{"businessUnit":"fnc"}}
```
Returns 401 without a valid Fox session. Available for fnc, fbn, and other businessUnit values.

### Gotchas

- **AP/Reuters content**: The article-search endpoint will return AP/Reuters content if you call it without exclusion tags. The exclusions are client-side conventions, not server-enforced. Omit the negative tag filters to get all content.
- **Moxie MP4 tokens**: The `tokenvod.foxnews.com` MP4 URLs use Akamai HMAC tokens scoped to the specific file path. The `exp=` value is 6 months from generation, but the token is bound to its ACL path.
- **Strike API key**: `bgAMJkLmh43vgYX7ubKF77D1zPwmFBPs` is passed as `x-api-key` in the query param, not a header. The endpoint also accepts `provider=dv`, `provider=mobian`, or `provider=dv,mobian`.
- **Knotch config ID**: The UUID `0c1098d4-e85c-41fd-be56-6189d39234c9` is hardcoded in the Knotch SDK config loaded on every page.
- **Chartbeat MAB endpoint**: Returns empty `experiments: {}` for article paths with no active tests. The homepage path returns the richest data.
- **Pyxis and idgraph**: Both endpoints fire automatically from browser sessions with Fox's session tokens. Direct curl to these endpoints returns auth errors.
