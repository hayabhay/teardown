---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "HuffPost — Teardown"
url: "https://www.huffpost.com"
company: "HuffPost"
industry: "Information"
description: "Digital news publisher owned by BuzzFeed."
summary: "HuffPost runs on BuzzFeed's Cambria platform (Node.js/Express behind Varnish CDN, React frontend). Monetization runs Prebid.js v10.23.0 with 18+ header bidding SSPs through Google Ad Manager network 6556. A three-tier subscription system ($5-$20/month) gates an ad-free mode via server-rendered feature flag. Auth via Auth0 at auth.huffpost.com with PKCE flow."
date: "2026-04-13"
time: "20:09"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Cambria, Node.js, Varnish, React, Prebid.js, Auth0]
trackers: [Google Ad Manager, Prebid.js, Amazon APS, Criteo, TradeDesk, Outbrain, Connatix, LiveRamp, ID5, Lotame, AuDigent, Yahoo ConnectID, IntentIQ, Comscore, Chartbeat, DoubleVerify, OneTrust, Mygaru, OpenWeb, SkimResources]
tags: [news, media, ad-tech, header-bidding, identity-graphs, consent, subscriptions, buzzfeed, prebid, ai-blocking]
headline: "BuzzFeed's public experiment API accepts any user ID with no auth -- returning live feature flag states and A/B variant assignments across the entire BuzzFeed portfolio."
findings:
  - "abeagle-public.buzzfeed.com accepts arbitrary user IDs and returns live experiment assignments including feature flag states -- no authentication, deterministic bucketing, and experiment names are listed in a JavaScript global on every page."
  - "Prebid.js sets a 50ms consent timeout -- before OneTrust can even determine which ruleset applies -- and 30+ identity trackers write to localStorage and cookies on first load while OneTrust marks them as inactive C0004 targeting cookies."
  - "The Gold subscription tier ($10/month, actively marketed) ships with placeholder SKU names hpGoldPlaceholderPrice and hpGoldPlaceholderAnnuallyWeb in the public /client/campaigns API -- Silver and Platinum have clean production SKUs."
  - "TradeDesk's bid requests route through /bid/bidder/buzzfeed -- HuffPost's own brand is absent from its ad supply chain, identified only by its corporate parent across 18 auction requests per page."
  - "A single homepage generates 682 HTTP requests, 675 of which are third-party across 75 domains -- seven requests are first-party."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

HuffPost is a news site built on BuzzFeed's internal publishing platform. Underneath the editorial layer is one of the densest ad monetization stacks observed in these teardowns -- 40+ ad tech vendors, 30+ identity trackers firing before any user interaction, and a public experiment API that exposes feature flag states across the entire BuzzFeed property network. The site generates 682 requests on a homepage load. Seven of them are first-party.

## Platform & Infrastructure

HuffPost runs on Cambria, BuzzFeed's internal publishing platform that also powers buzzfeed.com, complex.com, and related properties. The stack is Node.js/Express behind Varnish CDN with a React frontend. Every page response includes `X-Powered-By: Express` and `X-HP-Page-Version: 341883` (build number, incremented per deploy). The Varnish TTL is 5 seconds -- `X-Varnish-Cambria-TTL: 5s` -- with `Cache-Control: no-store, no-cache`, prioritizing content freshness over cache hit rates.

The JavaScript CDN is `modulous.huffpost.com`, an S3 bucket with directory listing disabled. Bundle filenames embed Unix timestamps and content hashes: `{timestamp}-bundle-{name}-{hash}.min.js`. The `webpackChunkcambria` global confirms the shared codebase. A `modulousQueue` global handles Cambria's module loading.

Authentication routes through Auth0 at `auth.huffpost.com`, using authorization code flow with PKCE. The client ID `KoDuy7jFQ6uBU3vBMuqPmAOf8KkwPz9C` is in page HTML. Sessions are bound by an `hp-auth-session` cookie scoped to `huffpost.com`.

Every page carries `document-policy: js-profiling` -- an experimental HTTP header that enables JavaScript profiling APIs including detailed frame timing via `performance.mark` and `performance.measure`. Typically used in development or performance testing environments, it's unusual for a production news site at this scale.

The sitemap URL path leaks an internal job name: `huffpostsitemapgeneratorjob-prod-public` is a production service or S3 prefix identifier embedded in every sitemap reference.

Security contact (`security.txt`) routes to buzzfeed.com. CSP frame-ancestors includes `*.samsung-news.com`, `*.newsbreak.com`, and `*.upday.com`, indicating content syndication to Samsung Smart TV, NewsBreak, and Upday news aggregators. The `bf-geo-country` and `bf-geo-region` cookies are set in the first HTTP response -- the `bf-` prefix belongs to BuzzFeed.

---

## Robots.txt & AI Crawlers

HuffPost's robots.txt blocks 15+ AI crawlers with `Disallow: /`:

```
anthropic-ai, Claude-Web, ClaudeBot, GPTBot, ChatGPT-User, Google-Extended,
Perplexity-User, meta-externalagent, Bytespider, cohere-ai, Amazonbot,
Applebot-Extended, CCBot, Diffbot, DuckAssistBot, FacebookBot,
omgilibot, TtoYouBot, WebGPTBot
```

Two bots get explicit full access via `Allow: /*`: `Scope3/2.0` (ad supply chain quality verification) and `AmazonAdBot` (ad quality auditor). Both are ad industry verification bots, not indexers. Amazonbot (Amazon's general web crawler) is blocked; AmazonAdBot (Amazon's ad placement verifier) gets full access. The distinction is commercially motivated -- ad verification access maintains inventory quality scores that affect CPMs.

The general `User-agent: *` block includes `Disallow: /api` and `Disallow: /mapi/v4/*/user/*`. The latter pattern confirms user-specific API paths exist at that prefix.

---

## Surveillance Architecture

A HuffPost homepage load generates 682 HTTP requests. Seven are first-party. The remaining 675 are third-party across 75 domains. An article page is lighter but still dense: 381 requests, 373 third-party, across 81 domains.

### The consent gap

OneTrust manages consent under ID `a784447a-58ed-4e91-ba84-d811aafcc0b3`. The US ruleset is CCPA with GPP enabled. Five consent groups:

- C0001 "Strictly Necessary" -- always active, 26 cookies
- C0002 "Performance" -- always active, 24 cookies
- C0003 "Functional" -- always active, 37 cookies
- C0004 "Targeting" -- inactive, 643 cookies
- C0005 "Social Media" -- inactive, 6 cookies

C0004 encompasses every major identity and advertising tracker. OneTrust marks them inactive. They fire anyway.

Prebid.js v10.23.0 is configured with:

```json
{
  "consentManagement": {
    "usp": {"timeout": 50},
    "gpp": {"cmpApi": "iab", "timeout": 50}
  }
}
```

No GDPR TCF section. The 50ms timeout means Prebid waits 50 milliseconds before proceeding without consent. OneTrust's initialization sequence requires a geolocation API call to `geolocation.onetrust.com` to determine which ruleset applies before it can render the consent banner. That call alone exceeds 50ms on any real network. By the time OneTrust has established consent state, Prebid has already run its auction.

The `_pubcid` (PubCommon ID) cookie is configured directly in Prebid's `userIds` config with a 365-day expiry -- not gated through OneTrust at all. OneTrust lists `_pubcid` as C0004 (inactive targeting cookie). Prebid sets it regardless.

The server also sets `ccpa=true` and `bf-geo-country`/`bf-geo-region` cookies in the very first HTTP response, before any JavaScript executes.

### Identity trackers on first load

Before any user interaction, the following write to localStorage or cookies:

**Cookies:**
- `panoramaId` -- Lotame
- `_pubcid` -- PubCommon ID (Prebid direct, 365-day expiry)
- `_cc_id` -- Lotame
- `_au_1d` -- AuDigent
- `_scor_uid` -- Comscore
- `pbjs_sharedId` -- Prebid shared ID
- `pbjs_unifiedID` -- TradeDesk Unified ID (TDID value present)
- `connectId` -- Yahoo ConnectID
- `__gads`, `__gpi`, `__eoi` -- Google Ads
- `_lr_retry_request` -- LiveRamp

**localStorage (30+ keys):**
- `id5id_v2_*`, `id5id_privacy`, `id5id_extensions` -- ID5 identity graph (multiple IDs)
- `_GESPSK-criteo.com`, `_GESPSK-pubmatic.com`, `_GESPSK-uidapi.com`, `_GESPSK-id5-sync.com`, `_GESPSK-amazon.com`, `_GESPSK-rtbhouse`, `_GESPSK-openx`, `_GESPSK-mygaruID` -- Amazon Publisher Services encrypted identity signals shared across SSPs
- `auHaloId` -- AuDigent Halo
- `panoramaId`, `panoramaId_expiry` -- Lotame
- `connectId`, `connectId_ts` -- Yahoo
- `__atmtd_userID`, `__atmtd_analyticsSession` -- AuDigent/Hadron
- `_iiq_fdata`, `_iiq_sync_undefined` -- IntentIQ
- `OB-USER-TOKEN`, `OB-lastPageViewInfo` -- Outbrain per-user identity and page view history

### Full tracker inventory (40 vendors confirmed from network)

1. Google Ad Manager (DFP) -- `/6556/`
2. Google Syndication -- pagead2.googlesyndication.com
3. Google Tag Services -- person model aggregation
4. Prebid.js v10.23.0 (header bidding orchestrator)
5. Amazon APS -- aax.amazon-adsystem.com
6. Criteo -- grid-bidder.criteo.com, gum.criteo.com, mug.criteo.com
7. TradeDesk -- direct.adsrvr.org, match.adsrvr.org, openads.adsrvr.org
8. Outbrain -- tcheck.outbrainimg.com, OBR global
9. Teads -- a.teads.tv
10. Connatix -- capi.connatix.com, ins.thecontentserver.com (46 UUID-per-content-element endpoints on homepage)
11. Rubicon/Magnite -- fastlane.rubiconproject.com, token.rubiconproject.com
12. OpenX -- rtb.openx.net
13. Ozone Project -- elb.the-ozone-project.com (28 OpenRTB requests per homepage)
14. 33Across -- ssc.33across.com
15. 3Lift -- tlx.3lift.com, eb2.3lift.com
16. TrustX -- ads.trustx.org, sync.trustx.org
17. Kargo -- krk2.kargo.com
18. PubMatic -- hbopenbid.pubmatic.com, ut.pubmatic.com
19. Undertone (Perion) -- hb.undertone.com
20. ID5 -- id5-sync.com, api.id5-sync.com
21. LiveRamp ATS -- idx.liadm.com, rp.liadm.com, rp4.liadm.com
22. Lotame -- bcp.crwdcntrl.net, id.crwdcntrl.net
23. AuDigent/Hadron -- uid2.hadron.ad.gt, floors.atmtd.com
24. Yahoo ConnectID -- ups.analytics.yahoo.com
25. IntentIQ -- sync6.im-apps.net
26. Mygaru -- tracking.mygaru.com, ident.mygaru.com
27. Comscore -- _scor_uid
28. Chartbeat -- _chartbeat2, _chartbeat4
29. DoubleVerify -- pub.doubleverify.com, tps-dn-uw1.doubleverify.com
30. Carbon (CarbonRMP) -- pb-ing.ccgateway.net
31. RTBHouse -- esp.rtbhouse.com
32. InSiad -- events.insiad.com, dd.insiad.com
33. Opera Ads -- t.adx.opera.com
34. OpenWeb -- hb.openwebmp.com, hb.yellowblue.io (also powers article comments via api-2-0.spot.im)
35. BuzzFeed Sync -- sync.bfmio.com
36. e-Volution AI -- sync.e-volution.ai
37. AdShield -- tagan.adlightning.com (via RT-1562-AS-script-on-Huffpost feature flag)
38. SkimResources -- r.skimresources.com, t.skimresources.com (article pages only, affiliate links)
39. OneTrust -- cdn.cookielaw.org
40. RealPage (RLCDN/Habu) -- check.analytics.rlcdn.com, api.rlcdn.com

---

## The Ad Stack

HuffPost runs a full programmatic stack with Prebid.js v10.23.0 as the header bidding orchestrator. The Google Ad Manager network ID is 6556 -- BuzzFeed's GAM account. Ad slots route through a custom wrapper called `HPGam` that exposes: `{cmd, debug, dumpSlots, env, event, getQuery, log, logger, refreshSlots, render}`.

Ad slot paths follow `/6556/huffpost.desktop/en/{section}/{position}`. Article pages use: `/6556/huffpost.desktop/en/politics/top|inline-1|sidebar-1|tb`.

Every bid request carries custom parameters via the `setHPADS` function:
- `cvid`, `cuid`, `cpid` -- session and user identifiers
- `cms_tags` -- all editorial tags on the page (e.g., `@live_blog`, `@noinstantarticle`, `@us_huffpost_now`)
- URL slug words extracted as ad keywords
- `cache_experiment: "13062_HuffPost_US_Desktop"` -- internal experiment bucket label, visible to all advertisers
- `renderer: "cambria"` -- platform identifier
- `destination: "huffpost"` -- property name

TradeDesk's bid path at `direct.adsrvr.org` is `/bid/bidder/buzzfeed` -- 18 requests per homepage. Every TradeDesk buyer sees HuffPost identified as "buzzfeed" in the bid stream. The `sync.bfmio.com` domain (BuzzFeed Media) handles cross-property identity syncing.

LiveRamp ATS runs via the `launchPadConfiguration` global, now at `configVersion: 9`. The `idx.liadm.com`, `rp.liadm.com`, and `rp4.liadm.com` endpoints are confirmed in network logs. LiveRamp ATS resolves authenticated email hashes to a persistent identity graph -- when a user logs into any property in the BuzzFeed portfolio, LiveRamp can tie that session to their cross-site identity.

AuDigent bridges analytics and ad targeting. The `audDataLayer` writes events to Google Analytics 4 (property `G-FVWZ0RM4DH`) with `user_id` set to an AuDigent persistent identifier (format: `AU1D-0100-001776109186-2W6LFNW9-YXK5`) and a user fingerprint hash in custom dimension `dimension7`. Analytics sessions and ad targeting sessions share the same persistent ID.

Two invalid traffic detection systems run simultaneously:
- **AdShield** -- loaded via `RT-1562-AS-script-on-Huffpost` (feature flag: on). Source: tagan.adlightning.com.
- **Boltive/DoubleVerify** -- loaded via `hp_boltive` (feature flag: on). Source: pub.doubleverify.com.

Both are active as always-on feature flags rather than an A/B split, suggesting they serve different roles in the IVT pipeline -- likely pre-bid filtering (AdShield) and post-bid viewability measurement (DoubleVerify).

Affiliate monetization runs through two parallel systems: ShopSense (`RT-1773-huffpost-shopsense`, feature flag on) and SkimResources (`r.skimresources.com`, `t.skimresources.com`) on article pages. Amazon Native Commerce Ads are also active (`hp_amazon_nca`, feature flag on).

Prebid's `auctionDelay` is 500ms, `syncsPerBidder` is 3, and `filterSettings` includes all bidders for cookie sync. The `floors.atmtd.com` endpoint handles AuDigent's real-time ad price floor management.

---

## The Experiment API

BuzzFeed's A/B experiment system, Abeagle, runs a publicly accessible API:

```
GET https://abeagle-public.buzzfeed.com/v3/experiment_variants
  ?user_id={any-string}
  &source={huffpost|buzzfeed}
  &experiment_names={name}
  &experiment_names={name}
  ...
```

No authentication. No validated user ID format -- any string works. Bucketing is deterministic: the same `user_id` always receives the same variant assignment. Experiment names are listed in `window.HUFFPOST.params.abeagle` on every page, making enumeration straightforward. Experiment IDs increment, making sequential scanning viable.

Active experiments on HuffPost as of 2026-04-13:

| Experiment | ID | Type | Status |
|---|---|---|---|
| `hp_video_lifestyle` | 1459 v3 | A/B test | on (variant 2) |
| `hp_client_crash_monitor` | 1359 v4 | Feature flag | on |
| `RT-1562-AS-script-on-Huffpost` | 1545 v1 | Feature flag | on (AdShield) |
| `RT-1720-ads_bullwhip-hp` | 1463 v1 | Feature flag | on |
| `RT-1773-huffpost-shopsense` | 1472 v1 | Feature flag | on (ShopSense) |
| `hp_entry_shopping_recircs` | 1485 v2 | Feature flag | not in experiment |
| `hp_boltive` | 1565 v2 | Feature flag | on (DoubleVerify) |
| `hp-gpt-lazy-load` | 1586 v1 | A/B test | not in experiment |
| `hp_amazon_nca` | 1416 v1 | Feature flag | on |
| `hp_openads` | 1583 v1 | Feature flag | on |
| `huffpost-swap-refresh` | 1522 v1 | Feature flag | on |

The API also accepts `source=buzzfeed`, returning experiment state for buzzfeed.com properties. The same endpoint serves the entire BuzzFeed portfolio.

The `RT-1720-ads_bullwhip-hp` name stands out. In supply chain contexts, "bullwhip" refers to demand signal amplification -- in an ad tech context, this likely relates to bid price or floor price optimization experiments.

---

## Subscription & Monetization

Subscription data is fully available unauthenticated from `/client/campaigns`:

**Monthly plans:**
- Silver -- $5/month (`huffpost_tier1_monthly`)
  - Supporter-only email, fewer contribution requests
- Gold -- $10/month (`hpGoldPlaceholderPrice`)
  - Ad-free on website OR apps, no autoplay videos
- Platinum -- $20/month (`huffpost_tier3_monthly`)
  - Ad-free on website AND apps, early feature access, 20th anniversary tote bag, Platinum Club focus group membership

**Annual plans:**
- Silver -- $50/year (`huffpost_tier1_annual`)
- Gold -- $100/year (`hpGoldPlaceholderAnnuallyWeb`)
- Platinum -- $200/year (`huffpost_tier3_annual`)

Silver and Platinum have clean, descriptive SKU codes. Gold -- the middle tier at $10/month, actively marketed -- ships with placeholder names: `hpGoldPlaceholderPrice` and `hpGoldPlaceholderAnnuallyWeb`. These are the production identifiers visible in the public API response.

The ad-free feature is server-rendered. `features.adsFree` is evaluated at page generation time based on the auth session. When `adsFree: true`, HPGam renders no ad slots at all -- paid subscribers never receive ad markup, rather than having it suppressed client-side.

CTA campaign exclusions (also from `/client/campaigns`):
- Layouts: `highline`, `video`
- Sections: `shopping`, `huffpost-shopping`
- Tags: `@cta_exclude`, `@nsfw`, `@sensitive`, `@sponsor_*`, `@sponsor`
- Tiers: `ad_free` (ad-free subscribers excluded from all CTAs)

The payment URL structure: `/payment-recurring?price_id={uuid}&badge={comma-separated-tags}`. Badge values -- `hpBpageModules`, `webMonthly`, `monthly`, `hpBpageModulesWebview`, `appMonthly` -- identify which purchase surface triggered the conversion.

The `loyaltyTiers` field in `HUFFPOST.params.features` lists `["tier1","tier2","tier2_app","tier3"]` -- the `tier2_app` entry indicates a separate app-specific Gold tier configuration. The `brandedAPages` field lists current sponsored content sections: `["by-any-means-necessary", "new-money-mindset"]`.

---

## First-Party API Surface

All endpoints respond without authentication:

**`GET /client/campaigns`** -- Full subscription plan definitions, CTA configurations per page type and section, exclusion rules for layouts/tags/tiers. Includes `flipPayPlans` with all tier details, pricing, price IDs, SKU codes, and feature descriptions.

**`GET /client/notification-center`** -- Current breaking news notifications. 13 items on the day of investigation, each with entry ID, URL, headline, and timestamp.

**`GET /client/alert-banner`** -- Active sitewide alert banner content.

**`GET /client/on-this-day/{YYYY-MM-DD}`** -- Historical content for any date.

**`GET /client/recirc/entry`** -- Article recirculation recommendations (article pages).

**`GET /client/catch-up/entry/{entry-id}`** -- Catch-up content for a given entry (article pages).

**`GET /client/liveblog/us/{id}`** -- Full liveblog data including slide content, author bios, and social metadata. Returns structured JSON with liveblog type, slide data, and meta. No authentication required.

**`GET /mapi/v4/us/public/features/checklist`** -- Returns 404 via curl, 200 in-browser. Requires the full browser request context (Accept headers, Referer). Not accessible as a bare API call.

---

## Machine Briefing

### Access & auth

The public `/client/*` API endpoints and `abeagle-public.buzzfeed.com` work with plain `curl` or `fetch` -- no headers, no auth. For user-specific content or paid-tier behavior, you need an `hp-auth-session` cookie from Auth0 at `auth.huffpost.com` (PKCE flow, client_id: `KoDuy7jFQ6uBU3vBMuqPmAOf8KkwPz9C`). The mapi endpoints require the full browser request context including `Referer` and browser Accept headers.

### Endpoints

**Open -- no auth, no headers:**

```bash
# Subscription plans + CTA config + exclusion rules
curl https://www.huffpost.com/client/campaigns

# Breaking news notifications
curl https://www.huffpost.com/client/notification-center

# Sitewide alert banner
curl https://www.huffpost.com/client/alert-banner

# Historical content by date
curl https://www.huffpost.com/client/on-this-day/2026-04-13

# Liveblog content (needs a valid entry ID)
curl https://www.huffpost.com/client/liveblog/us/{entry-id}

# Article recirculation
curl https://www.huffpost.com/client/recirc/entry

# Abeagle experiment API -- any user_id, any source
curl "https://abeagle-public.buzzfeed.com/v3/experiment_variants?user_id=test-123&source=huffpost&experiment_names=hp_boltive&experiment_names=hp_video_lifestyle"

# Same API, buzzfeed.com scope
curl "https://abeagle-public.buzzfeed.com/v3/experiment_variants?user_id=test-123&source=buzzfeed&experiment_names=hp_boltive"
```

**Ad slot path pattern (for GAM analysis):**

```
/6556/huffpost.desktop/en/{section}/{position}
# Examples:
/6556/huffpost.desktop/en/politics/top
/6556/huffpost.desktop/en/politics/inline-1
/6556/huffpost.desktop/en/politics/sidebar-1
```

### Gotchas

- `/mapi/v4/*` returns 404 without browser headers. Requires `Referer: https://www.huffpost.com/` and a proper `Accept` header at minimum.
- Abeagle bucketing is deterministic by `user_id` string. Rotate user IDs for different bucket assignments. Sequential IDs don't map to sequential buckets -- use UUIDs or random strings.
- Experiment names are in `window.HUFFPOST.params.abeagle` on every page. Scrape that array to enumerate current names before querying the API.
- The `/client/campaigns` response includes `flipPayPlans` with live price IDs (FlipPay plan identifiers, not Stripe IDs).
- `direct.adsrvr.org/bid/bidder/buzzfeed` handles 18 TradeDesk bids per page. The `buzzfeed` path segment is how HuffPost is identified in the TradeDesk DSP.
- Connatix generates a unique UUID-based endpoint per content element: `ins.thecontentserver.com/{uuid}/{version}/insights.bin`. On the homepage, 46 such endpoints fire.
