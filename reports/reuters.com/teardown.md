---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Reuters -- Teardown"
url: "https://www.reuters.com"
company: "Reuters"
industry: "Information"
description: "Global news wire serving breaking news, business, and legal coverage."
summary: "Reuters runs on Arc Publishing (Arc Fusion SSR + ArcP paywall SDK) behind CloudFront CDN and DataDome bot protection. Article content is server-side rendered into window.Fusion.globalContent before client-side paywall logic executes -- Sophi.ai and Mather Economics handle dynamic metering decisions after content delivery. ElevenLabs generates per-article TTS audio served from Google Cloud Storage."
date: "2026-04-13"
time: "20:03"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Arc Publishing, Arc Fusion, CloudFront, DataDome]
trackers: [Segment, Google Analytics 4, Permutive, Chartbeat, Comscore, LiveRamp, ID5, Lotame Panorama, 33across, DoubleVerify, StackAdapt, The Trade Desk, Outbrain, Dianomi, Sailthru, ABTasty, OneTrust, Admiral, Singular, Facebook Pixel]
tags: [news, paywall, arc-publishing, identity-graphs, elevenlabs, tts, datadome, consent, ai-blocking, subscription]
headline: "Two AI-powered paywall vendors make real-time gating decisions on content that Arc Fusion already shipped in full to the browser."
findings:
  - "window.ArcP._rules exposes the complete metering ruleset -- geo-targeting across 85 countries, 30-day rolling windows, and the full B2B licensing tier ladder from RL10Licenses to RLUnlimitedLicenses, revealing Reuters Legal's enterprise seat packaging."
  - "window.Fusion.globalContent contains the full article JSON for every page load including premium PLJ (Practical Law Journal) articles -- 6,296 words in browser memory even when the registration gate hides the body from the DOM."
  - "Five identity resolution graphs fire in parallel on every article page -- LiveRamp, ID5, Permutive, 33across, and Lotame Panorama -- each independently correlating the same reader across publisher networks."
  - "The REFINITIV_TRACKING_URL config field contains a never-interpolated {{Page URL}} Handlebars template, sending an empty page dimension in every Adobe Analytics beacon to LSEG's production suite -- cross-property attribution between reuters.com and Refinitiv is silently broken."
  - "ElevenLabs TTS audio for articles is publicly accessible on Google Cloud Storage -- the public_user_id and project_id in globalContent are enough to construct the direct MP3 URL without authentication."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Reuters is a news wire that blocks 30+ AI crawlers by name, runs DataDome bot protection to reject headless browsers on contact, and employs two competing AI paywall vendors to decide who pays -- then server-side renders every article's full text into the HTML before any of that logic runs. The surveillance infrastructure on article pages is equally dense: 50 third-party domains, five identity graphs, and a broken cross-property attribution beacon that's been silently failing to track reuters.com-to-LSEG referrals.

## Architecture

Reuters runs on Arc Publishing, The Washington Post's commercial CMS platform. The rendering engine is Arc Fusion, confirmed via `window.Fusion` globals with `globalContent`, `contentCache`, `template`, and `tree` properties. Deployment version is 356. The infrastructure stack: CloudFront CDN (`x-amz-cf-pop: SFO53-P1`), DataDome bot protection, and Akamai mPulse for real user monitoring.

The production Arc API hostname ships in every page's client config: `API_ORIGIN: "https://api-reuters-reuters-prod.cdn.arcpublishing.com"`. Arc's `outboundfeeds/` infrastructure powers the public sitemaps -- 100+ shards indexing 9,900+ articles paginated in 100-article increments.

Paywall decisions run through two vendors simultaneously: Sophi.ai (`paywall.sophi.io`) and Mather Economics. Sophi is a Globe and Mail spinout that uses ML to make per-user, per-article metering decisions. Mather is a subscription analytics and dynamic pricing consultancy. Both run A/B tests concurrently -- Mather's `_matheriSegs` cookie shows two live metering experiments (`INTERNAL_AB_TEST1-C`, `MATHER_QS_AB_TEST5-C`). Per-article TTS audio is generated via ElevenLabs and served from Google Cloud Storage.

DataDome is the primary bot defense layer. Direct curl returns HTTP 401 with `x-datadome: protected` and a JavaScript challenge page. Headless Playwright triggers the same 401 immediately. Headed browser with real fingerprints passes without a CAPTCHA challenge. The one exception: Arc's `outboundfeeds/` sitemap XML feeds are accessible without DataDome cookies.

---

## Content Delivery: SSR Before Paywall

This is the central technical fact about reuters.com: Arc Fusion server-side renders full article content into `window.Fusion.globalContent` before any paywall, metering, or registration check executes. The content is in the HTML response before the browser runs any JavaScript.

For standard metered articles (`content_code: "metered"`), all `content_elements` render directly to the DOM. The `paywall-B064F03B` CSS class on the content container is a marker only -- no visual hiding, no overlay. Standard Reuters news is delivered in full on every page load for any reader DataDome admits, regardless of how many articles they've read.

For PLJ (Practical Law Journal) premium articles (`content_code: "plj"`), the behavior is different in the DOM but identical in the JavaScript layer. Only a teaser (~6 paragraphs, ~325 words, roughly 5% of the article) renders to the DOM before a registration gate appears. But `window.Fusion.globalContent.result.content_elements` contains the full article -- 115 content elements, 6,296 words -- in browser memory. The registration gate is a JavaScript overlay injected after content delivery; the underlying data is already in the page.

Observed directly on a PLJ article: `content_code: "plj"`, `word_count: 6296`, `total_elements: 115` in globalContent. ArcP paywall facts confirmed: `sub.p: []` (no subscriptions), `reg.l: false` (not logged in). The paywall hadn't blocked data delivery.

The execution chain:
1. Arc Fusion SSR bakes full article content into HTML response
2. Client receives complete JSON in `window.Fusion.globalContent`
3. ArcP SDK loads, checks entitlements against Arc sales API
4. Sophi.ai `paywall.sophi.io/hosts/www.reuters.com/decisions/me` returns metering decision
5. Sophi or ArcP injects overlay or registration gate if warranted

Steps 3--5 happen after the browser has the content. Any script with access to the page's JavaScript runtime can read the full article from globalContent regardless of what the DOM displays.

---

## Paywall Rules in Client JavaScript

The ArcP SDK exposes its full metering ruleset in `window.ArcP._rules` -- a JSON array of six rules governing when walls appear.

**Rule 153** -- PLJ content metering. Applies to `content_code: ["plj"]`, excludes mobile SDK. Budget type: Calendar/Monthly. Trigger: `rt: [">", 0]` -- wall shows after any PLJ article is read. Paywall URL: `https://www.reuters.com/`.

**Rule 159** -- Subscriber/premium-country gate. Applies to all non-free, non-PLJ content on mobile/tablet. Country list: 85 countries including US, UK, AU, DE, FR, JP, CA, SG, IN. Budget: 30-day rolling window. Trigger: `rt: [">", 2]` -- 3+ articles.

**Rule 161** -- Desktop, premium countries, non-subscriber. Covers all non-mobile/tablet devices. Country list: 60 countries (notably excludes some from Rule 159's 85-country list -- IN, MY, TW, TH, SA, ZA, among others get a looser desktop meter). Trigger: `rt: [">", 2]`. 30-day rolling.

**Rules 160/162** -- Non-premium countries. Inverse of the premium country lists. Triggers: `rt: [">", 10]` (mobile) and `rt: [">", 5]` (desktop). These readers get 6-11 free articles before hitting a wall.

**Rule 125** -- Mobile/tablet SDK, any geography, unauthenticated. Trigger: `rt: [">", 10]`. 30-day rolling.

The full subscription tier list is embedded in the rule exemptions: `individualdigital`, `individualapp`, `individualvip`, `individualtmp`, `thomsonreuters`, `lsegcom`, `enterprise`, `corporatercom`, and a B2B Reuters Legal seat licensing ladder at fixed increments -- `RL10Licenses`, `RL20Licenses`, `RL30Licenses`, all the way through `RL1000Licenses`, `RL1500Licenses`, `RL2000Licenses`, up to `RL5000Licenses` and `RLUnlimitedLicenses`. The `lsegcom` entitlement reflects Reuters' LSEG (London Stock Exchange Group) parent company's internal access package. The `corporatercom` tier suggests a reuters.com-specific enterprise license distinct from the Legal product.

The Arc sales API endpoint that ArcP checks for entitlements requires no authentication: `https://api-reuters-reuters-prod.cdn.arcpublishing.com/sales/public/v1/entitlements` returns Akamai EdgeScape geo data for the caller (city, DMA, georegion, country code) alongside their active SKUs. An unauthenticated request returns your own city-level geolocation as determined by Akamai's EdgeScape intelligence.

---

## Surveillance: 50 Domains, 5 Identity Graphs

Article pages load 159 total requests across 50 third-party domains. The homepage loads 21 requests across 5 domains. The tracking stack concentrates almost entirely on article pages.

### Segment

Segment (Twilio) is the primary event collection layer. 11 calls on article page load using write key `IEWBqQ8VWHijTQxb7lEBGFGS9uIJzigZ` (desktop) and `YlmAIaFBxsNtlVJdfuSV0ncE931ghRtS` (mobile). Event types: track (8 calls), page, identify, metrics. Segment settings are loadable without auth at `cdn.segment.com/v1/projects/{write_key}/settings`.

### Identity Resolution

Five identity resolution platforms fire on every article page, each independently attempting to resolve the reader across publisher networks:

**LiveRamp Authenticated Traffic Solution** -- three endpoints (`rp.liadm.com`, `rp4.liadm.com`, `idx.liadm.com`). Sets `_li_dcdm_c`, `_lc2_fpi`, `_au_1d` (persistent cross-site identity), and `panoramaId` (Lotame Panorama unified ID distributed via LiveRamp).

**ID5** -- three endpoints including `id5-sync.com/bounce` and `id5-sync.com/gm/v3`. ID5 is a publisher-side universal ID graph that survives third-party cookie deprecation via server-side matching.

**Permutive** -- 9 calls across 7 endpoints, including a machine-learning model binary download (`cdn.permutive.com/models/v2/{uuid}-models.bin`). Permutive syncs with AppNexus via localStorage for identity bridging across ad tech.

**33across** -- `lexicon.33across.com/v1/envelope`. Returns an identity envelope for addressable advertising.

**Lotame Panorama** -- cookies `panoramaId`, `panoramaId_expiry` set client-side, alongside `bcp.crwdcntrl.net` DMP calls and Hadron UID2 sync.

All five run independently and in parallel, each correlating the same reader to cross-publisher audience data with no shared resolution.

### Other Analytics and Advertising

Google Analytics 4 fires 11 beacon calls. Chartbeat runs multi-armed bandit headline A/B testing via `mab.chartbeat.com/mab_strategy/headline_testing/get_strategy/` -- for any article path, this endpoint returns the currently winning headline variant. DoubleVerify fires 10 ad safety calls. Google DV360/Ads runs conversion pixels from two separate accounts. StackAdapt and The Trade Desk handle retargeting. Outbrain and Dianomi serve content recommendations and native finance ads. Connatix handles video monetization. Singular tracks mobile attribution.

### Consent and Privacy

OneTrust handles consent with all groups consented by default. The `usprivacy=1YNN` CCPA string indicates sale is allowed and no opt-out has been exercised. GPC (Global Privacy Control) is neither honored nor detected: `isGpcEnabled=0` and `browserGpcFlag=0`.

### Subscribe Page

The `/account/subscribe/offer` page loads 56 requests across 18 domains, adding LinkedIn conversion tracking (`px.ads.linkedin.com/attribution_trigger`), heavy Google conversion infrastructure (6 CCM collect calls, remarketing to two separate Ads accounts), and three ABTasty experiment files.

---

## Technical Artifacts

### Broken LSEG Attribution Beacon

The `REFINITIV_TRACKING_URL` field in `window.reuterscfg._store.state` contains a hardcoded Adobe Analytics beacon:

```
https://refinitiv.data.adobedc.net/b/ss/refinitivglobalprod/1?AQB=1&g=https://www.refinitiv.com?utm_campaign=refinitivlogo&utm_source=reuters.com&utm_medium=Referral&utm_content=&utm_term=&events=event203&v73={{Page URL}}&AQE=1
```

The `{{Page URL}}` Handlebars template variable was never substituted. This beacon fires to Refinitiv's (now LSEG) production analytics suite. The `event203` event code tracks reuters.com-to-Refinitiv referrals. With `{{Page URL}}` as a literal string in `v73`, the page URL dimension is empty in every beacon sent. Cross-property attribution between reuters.com and lseg.com/refinitiv.com is silently broken.

### ElevenLabs TTS: Predictable Public Audio

Reuters has integrated ElevenLabs AudioNative for article text-to-speech. The `eleven_labs` object appears in article `window.Fusion.globalContent` data:

```json
{
  "project_id": "otz132Gq27ohbrDQC45D",
  "public_user_id": "4755746b1f90e57c3c83176ebb4062380b8a9a1a2e7bf22c8d2d745486357d64"
}
```

The audio URL structure: `https://eleven-public-cdn.elevenlabs.io/audio-native/{public_user_id}/{project_id}/{project_id}.mp3`. The `public_user_id` is a fixed account identifier; `project_id` is per-article. Direct curl confirms the MP3 returns HTTP 200 with no authentication (~1.75MB). For any article with a `project_id` in its globalContent, the audio is accessible directly without a Reuters session. The `public_user_id` and `project_id` are by design public-facing in ElevenLabs' AudioNative product -- they're part of the embedded widget mechanism.

### ABTasty: Pre-Consent Experiments

Three live ABTasty experiments run on reuters.com, all configured with `runWithoutConsent: true`:

1. **Test 1530618** -- "PROD: Newsletter vs MyNews link in header for Desktop Anonymous Users." 100% traffic, all pages, desktop only.
2. **Test 1531510** -- "PROD: Vertical vs Original Offer Page Layout." 50% traffic, `/account/subscribe/offer` only.
3. **Test 1609194** -- "PROD: 770928 Subscribe button popup." 50% traffic, US desktop only.

The experiments fire before consent interaction -- ABTasty scripts load before OneTrust consent has been interacted with.

### Admiral Adblock Recovery

Admiral (getadmiral.com) runs adblock detection via the obfuscated domain `wretchedfloor.com`. Two POST requests fire on article page load to an obfuscated per-site tracking path. The domain evades adblock filter lists that would block `getadmiral.com` directly.

### Thomson Reuters Internal Tool Reference

`GRAPHICS_PLUGIN_IFRAME_URL: "https://sphinx.thomsonreuters.com/search/?consumer=PageBuilder#/search/graphic"` appears in every page's client config -- a Thomson Reuters internal graphics/asset search tool embedded in the Arc PageBuilder editorial CMS, shipped to every reader.

### AI Bot Blocking vs. SSR Architecture

robots.txt explicitly blocks 30+ named AI and LLM crawlers: Anthropic's ClaudeBot, Google-Extended, Gemini, Grok, Perplexity, Meta-ExternalAgent, Mistral, DeepSeek, Cohere, and others. DataDome adds a second layer, blocking headless browsers with an immediate 401.

The contradiction: any client DataDome admits receives the full article content in the HTML response. Content delivery precedes all paywall logic. A browser with real fingerprints passes DataDome and receives full article JSON in `window.Fusion.globalContent` regardless of subscription state. The robots.txt wall and DataDome enforcement are both bypassed by the fundamental SSR content delivery model.

---

## Machine Briefing

### Access and Auth

Reuters uses DataDome bot protection. Bare curl and headless Playwright return HTTP 401. Headed browser with real fingerprints passes without challenge. For API access:
- Arc `outboundfeeds/` sitemaps: accessible without cookies or DataDome
- Arc sales API (`api-reuters-reuters-prod.cdn.arcpublishing.com`): accessible without DataDome, some endpoints without auth
- All other reuters.com pages: require DataDome cookies (acquire via headed browser session)

### Endpoints

**Sitemaps (no auth, no DataDome)**
```
GET https://www.reuters.com/arc/outboundfeeds/sitemap-index/?outputType=xml
GET https://www.reuters.com/arc/outboundfeeds/news-sitemap-index/?outputType=xml&from=0
GET https://www.reuters.com/arc/outboundfeeds/news-sitemap-index/?outputType=xml&from=100
# ... up to from=9900
GET https://www.reuters.com/arc/outboundfeeds/sitemap-pictures/?outputType=xml
GET https://www.reuters.com/arc/outboundfeeds/sitemap-video/?outputType=xml
GET https://www.reuters.com/arc/outboundfeeds/sitemap-topics/?outputType=xml
GET https://www.reuters.com/arc/outboundfeeds/sitemap-authors/?outputType=xml
```

**Arc Sales API (no auth required)**
```
GET https://api-reuters-reuters-prod.cdn.arcpublishing.com/sales/public/v1/entitlements
# Returns: {"edgescape":{"city":"...","continent":"...","georegion":"...","dma":"...","country_code":"..."},"skus":[]}
```

**Reuters Media API (subscription page)**
```
GET https://api.prod.global.a206746.reutersmedia.net/v1/reference-data/country
GET https://api.prod.global.a206746.reutersmedia.net/v1/product-rate-plan
GET https://api.prod.global.a206746.reutersmedia.net/v1/billing-account
```

**Arc CMS API (requires DataDome session)**
```
POST https://www.reuters.com/pf/api/v3/content/fetch/graphql-proxy-v1
GET https://www.reuters.com/pf/api/v3/content/fetch/articles-by-collection-alias-or-id-v1
GET https://www.reuters.com/pf/api/v3/content/fetch/article-by-id-or-url-v1
```

**Sophi.ai Paywall Decision (requires DataDome browser session)**
```
GET https://paywall.sophi.io/hosts/www.reuters.com/decisions/me
```

**Chartbeat Headline Strategy (no auth)**
```
GET https://mab.chartbeat.com/mab_strategy/headline_testing/get_strategy/?host=reuters.com&path={article-path}&domain=reuters.com&uid={chartbeat-uid}
```

**Segment Settings (no auth)**
```
GET https://cdn.segment.com/v1/projects/IEWBqQ8VWHijTQxb7lEBGFGS9uIJzigZ/settings
```

**ElevenLabs Article Audio (no auth)**
```
GET https://eleven-public-cdn.elevenlabs.io/audio-native/{public_user_id}/{project_id}/{project_id}.mp3
# public_user_id: 4755746b1f90e57c3c83176ebb4062380b8a9a1a2e7bf22c8d2d745486357d64
# project_id: per-article, found in globalContent.result.eleven_labs.project_id
```

### Gotchas

- DataDome blocks all non-browser clients immediately (HTTP 401). Arc `outboundfeeds/` is the exception.
- Arc `pf/api/v3/` endpoints return "Bad Request" without correct parameters matching the browser session context.
- `window.Fusion.globalContent` is in the HTML source -- parse initial HTML to extract it without executing JavaScript.
- Arc sales API entitlements endpoint returns caller geo via Akamai EdgeScape -- the city/DMA reflects the requester's IP, not a stored user record.
- Sophi.ai requires session cookies to return meaningful decisions; without them it returns non-200.
- Not every article has ElevenLabs TTS. Check for the `eleven_labs` key in globalContent before constructing the URL.
