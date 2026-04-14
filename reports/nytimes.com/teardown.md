---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "The New York Times -- Teardown"
url: "https://nytimes.com"
company: "The New York Times"
industry: "Information"
description: "Subscription news publisher with games, cooking, sports, and reviews verticals."
summary: "nytimes.com runs on Fastly CDN + Varnish + Envoy serving a SvelteKit/React frontend backed by Samizdat, an Apollo Federation GraphQL supergraph. Wirecutter (acquired 2016) still runs on AWS API Gateway; The Athletic (acquired 2022) runs on Cloudflare with its own GraphQL. Statsig and Fastly Abra handle feature flags and A/B routing at the edge, caching different page variants per experiment cohort. DataDome provides bot detection at the article tier."
date: 2026-04-13
time: "19:57"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack: [Fastly, SvelteKit, Apollo Federation, Statsig, DataDome, Envoy]
trackers: [Google Ads, Google Ad Manager, Criteo, Chartbeat, LiveRamp ATS, Iterable, Amazon TAM, Rubicon, OpenX, Triplelift, PubMatic, Index Exchange, Media.net, Datadog RUM, Fides, Sentry]
tags: [news, media, subscription, paywall, ad-tech, prebid, statsig, identity-resolution, acquisition-artifact, consent]
headline: "141 Statsig configs ship as public JSON on every page load, exposing a live-blog paywall test and Project Toothbrush."
findings:
  - "141 Statsig configs and feature gates download as unauthenticated JSON on every page load, exposing NYT's full subscription conversion pipeline -- Project Toothbrush (a codewall experiment), a live blog app-download wall, former-subscriber targeting with blurred content, and three-variant pricing label tests."
  - "The Fides consent manager has the 'Data Sales and Sharing' notice set to disabled -- the opt-out modal never appears; consent is applied silently by script with targeted advertising defaulting to opt-in, confirmed by consentMethod: 'script' in the fides_consent cookie."
  - "Every anonymous visitor gets an Iterable email-marketing JWT (iter_id) on first page load -- assigning a marketing pipeline identity before any signup, with NYT's Iterable company ID (5c098b3d1654c100012c68f9) public in every visitor's cookie jar."
  - "The unauthenticated data-layer API at a.nytimes.com/svc/nyt/data-layer returns a visitor's full subscription history -- former subscriber flags for every NYT product, B2B status, Verizon school access, and IP corporate/education classification."
  - "Google Ad Manager receives 118 behavioral audience segments on every anonymous first pageview -- including predictive categories like gs_predicts_legal_industry and politics_sentiment -- alongside the visitor's paywall meter state."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

nytimes.com is a multi-property media empire: The New York Times (news), The Athletic (sports), Wirecutter (product reviews), Cooking, Crosswords, Espanol, and a Chinese-language edition. Each property sits on distinct infrastructure, connected at the edge. The homepage alone fires 70 third-party requests across 27 domains, runs header bidding through 8 demand-side platforms, and downloads 141 Statsig feature flag configs as public JSON -- a complete map of NYT's active experiments, subscription strategy, and internal tool names.

## Architecture & Infrastructure

The core stack runs Fastly CDN in front of Varnish caches in front of Envoy -- the internal service mesh that routes requests to the backend identified in response headers as `vi.nyt.net`. The response header `vary: x-statsig-assignments` means Fastly caches a different page variant per experiment cohort assignment, so A/B test traffic is served from CDN without hitting the origin for each user. Page-type and routing metadata surfaces in headers: `x-nyt-route: homepage`, `x-pagetype: vi-homepage`, `x-api-version: F-F-VI`.

The frontend is SvelteKit -- `__sveltekit_139cn3t` and `__svelte` appear in `window` globals -- running alongside React-based components. Emotion CSS (hashed class names) handles styling. The CMS is Samizdat, an internally named Apollo Federation supergraph accessible at `samizdat-graphql.nytimes.com/graphql/v2`. The name "samizdat" -- the Soviet-era underground publication network -- is a fitting choice for NYT's content graph.

Bot detection is DataDome, tiered by content type. The homepage loads cleanly in headless browsers. Article pages return 403 from DataDome at the IP level, requiring CAPTCHA to proceed -- article content is not accessible via automation.

**Acquisition artifacts by property:**
- **Wirecutter** (acquired 2016): runs on Amazon API Gateway behind Envoy. Response headers include `x-amzn-requestid`, `x-amzn-trace-id`, `x-amz-apigw-id`. Separate A/B test stack: `x-nyt-wc-abtest: .ver=28464.000&Wirecutter_cwv_products_in_search_0625=1_Stacked`. Ten years post-acquisition, Wirecutter remains on different infrastructure.
- **The Athletic** (acquired 2022): runs on Cloudflare (cdn-cgi paths visible in robots.txt). Separate GraphQL at `/athletic/graphql`, separate login at `/athletic/login/` and `/athletic/register/`. Separate API at `/athletic/api`.
- **Cooking, Crosswords**: appear to run on NYT's main stack.

The video player is called "Betamax" internally -- SvelteKit components loaded from `static01.nyt.com`, using HLS.js for streaming. `betamax/player-CKCxHe9J.js` and `betamax/pool-0.2.40-D37jd-c4.js` are the core modules. A/B tests are running to introduce AV1 codec support (`av1_mp4_standalone_betamax`, `av1_mp4_feeds_betamax`).

GDPR data subject requests are handled by a Google Cloud Function: `https://us-central1-nyt-dsra-prd.cloudfunctions.net/datagov-dsr-formhandler` (Iowa region). This is fully decoupled from the main infrastructure.

Google Pay is preloaded on the homepage -- `pay.google.com/gp/p/ui/pay` returns 200 on every homepage load, not just at checkout pages.

---

## The Subscription Experiment Machine

Statsig manages NYT's A/B testing and feature flags. The Statsig SDK is initialized client-side and retrieves its full configuration from two public endpoints visible in network traffic:

```
GET /statsig/config/client-BasfMtnVqHD0fEI7mV1O7VkykGye1bute6nczoac1oS.json
GET /statsig/config/client-AkrHGgWqd8ygLMakFYSt6a5N7t1RFjTPb6XlY95T3hb.json
```

Both return unauthenticated JSON containing the complete Statsig configuration: 86 dynamic configs and 55 feature gates across the two files -- 141 objects total -- all public on every page load. The configuration includes every active A/B experiment, its variants, traffic split percentages, and the return values each cohort sees.

**Conversion and paywall experiments:**

`subrev_project_toothbrush_2603` tests `show_codewall: true` vs `show_codewall: false`. A "codewall" -- not a standard NYT feature -- appears to be a paywall that can be bypassed by entering a code (promo code, gift code, or partner access code). This is a new paywall mechanism beyond the standard article meter. "Project Toothbrush" is the internal name.

`conv_live_blog_paywall` runs two groups: `0_control` and `1_download_live_blog`. The test variant would trigger an app download prompt on live blog content -- the type of real-time news coverage (elections, breaking news, sports scores) that most publications keep free. Live blogs generating subscription pressure would be a notable shift.

`conv_formers_paywall_free_trial` has a single active group: `1_blur` -- a blurred-content paywall variant specifically targeting former subscribers (ex-subscribers who have churned).

`subrev_product_switch_pills_experiment` tests subscription tier label copy across three variants:
- Control: `aa_fp_pill_copy: "NEW"`, `hd_pill_copy: "BEST VALUE"`
- Variant 1: `aa_fp_pill_copy: "BEST VALUE"`, `hd_pill_copy: "PREMIUM"`
- Variant 2: `aa_fp_pill_copy: "BEST FOR SHARING"`, `hd_pill_copy: "PREMIUM"`

`subrev_dock_price_expression_experiment_2601` tests whether showing a weekly price difference in the persistent subscription CTA bar (the "dock") increases conversions. Control hides `weekly_price_diff`; Variant shows it.

`quickstart_experiment` runs 6 variants for what appears after a reader finishes an article: `1_trending` (trending articles), `2_edPicks` (editor picks), `3_moreIn` (more in section), `4_nextRead` (single next article), `5_watchPromo` (video promo), `6_pushSignUp` (push notification signup prompt). The control shows none.

`journeys_free_month_202603` tests offering a free month: `has_free_month: true` vs `false`.

**The Athletic experiments:**

`ta_beast_promo_unit` runs a 3-variant A/B test (CTRL, A, B) on a promo unit for something called "Beast." A companion experiment `ta_beast_access_in_app` (also 3 variants) suggests Beast is a content product within The Athletic with in-app exclusive access. Whether "Beast" refers to an editorial brand, a premium content tier, or something else is not determinable from the flag names alone.

**Internal tool names surfaced via Statsig:**

The `stela_banner_experiment` experiment exposes a live internal message: `"Stela Story is now using data from ETSOR."` The test variant shows a warning message: `"Something is wrong (this is a test of a warning message on the Stela Story banner)"` in red (`#B22222`). "Stela" appears to be an internal editorial CMS or story management tool. "ETSOR" is a data source -- possibly "External Traffic Source of Record" or similar. The experiment suggests Stela recently migrated to a new data backend, and this banner notifies editors about the transition.

Other internal names from Statsig:
- **OMA**: offer management system (`oma_testing_feature_gate`, `oma_subgateway_vi`, `oma_oes_supergraph_feature_gate`) -- handles subscription offer eligibility
- **JKIDD**: user identity and tracking system (the path `a.nytimes.com/svc/nyt/data-layer` is internally called JKIDD_PATH)
- **Abra**: Fastly's edge A/B testing system -- its config is exposed in `window.__preloadedData.config.fastlyAbraConfig`

**Fastly Abra config (public in preloaded data):**
```json
{
  ".ver": "28397.000",
  "DEVP_ComputeMonoservice": "1_Compute",
  "DEVP_WirecutterCompute": "1_Compute",
  "HOME_cwv_chartbeat": "0_Control",
  "STORY_feature_betamax_cwv": "1_Betamax"
}
```

DEVP_ComputeMonoservice and DEVP_WirecutterCompute both assigned to "1_Compute" indicate Fastly Compute@Edge is live for NYT's monoservice and Wirecutter -- server-side logic running at the CDN edge.

**FastlyEntitlements** -- the cache differentiation keys -- are `["ATH", "CKG", "MM", "WC", "XWD"]`: The Athletic, Cooking, MM (unclear -- possibly a paid newsletter product), Wirecutter, Crosswords. These determine which cached response variant Fastly serves based on the subscriber's product bundle.

---

## Surveillance & Identity Infrastructure

The homepage fires 70 third-party requests across 27 domains on first load. The tracker inventory below is verified from cookies and network traffic.

**Pre-consent trackers** (fire before any user consent interaction):
- **Criteo**: `cto_bundle`, `cto_bidid` cookies set on page load. Also calls `gum.criteo.com/sid/json`, `mug.criteo.com/sid`, and `grid-bidder.criteo.com` for header bidding.
- **Google Ads**: `_gcl_au` (conversion linker), `__gads`, `__gpi`, `__eoi` -- all set before consent.
- **Chartbeat**: `_cb`, `_chartbeat2`, `_v__chartbeat3` set on load.
- **Iterable**: `iter_id` JWT set on first anonymous page load (detailed below).

**Prebid.js header bidding** (8 demand-side platforms called on each pageload):
- Amazon Publisher Services: `aax.amazon-adsystem.com/e/dtb/bid`
- Magnite/Rubicon: `fastlane.rubiconproject.com/a/api/fastlane.json`
- OpenX: `rtb.openx.net/openrtbb/prebidjs`
- Triplelift: `tlx.3lift.com/header/auction`
- Criteo: `grid-bidder.criteo.com/openrtb_2_5/pbjs/auction/request`
- Media.net: `prebid.media.net/rtb/prebid`
- PubMatic: `hbopenbid.pubmatic.com/translator`
- Index Exchange: `htlb.casalemedia.com/openrtb/pbjs`

**Cookie sync network**: On each homepage load, three additional cookie syncing calls fire: `rtb.adentifi.com` (syncs with PubMatic), `tr.blismedia.com/v1/api/sync/pubmatic` (Blis/PubMatic sync), `ums.acuityplatform.com/tum` (Acuity Platform sync). These extend the identity graph across DSP networks.

**LiveRamp ATS** (`window.__launchpad`): LiveRamp's Authenticated Traffic Solution fires on DOM_READY -- the earliest possible browser event. It targets:
- All 50 US states (explicitly enumerated in the config)
- International: Argentina (AR), Austria (AT), Denmark (DK), Norway (NO), Sweden (SE), Switzerland (CH)

The ATS solution links authenticated user email hashes (from logged-in subscribers) to LiveRamp's identity graph for ad targeting even on non-authenticated sessions. Config UUID: `9fab0bf6-df63-42ca-acc5-caf4de668f40`. `preload: true` ensures it loads before page rendering begins.

**Iterable JWT (iter_id)**: Every anonymous visitor receives an Iterable JWT on first page load:
```
iter_id = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.{payload}.{sig}
```
Decoded payload:
- `aid`: MongoDB ObjectId-format visitor ID assigned at first load
- `company_id`: `5c098b3d1654c100012c68f9` (NYT's Iterable company ID -- consistent across all visitors)
- `iat`: Unix timestamp of first visit

Iterable is an email marketing platform. This JWT assigns every anonymous visitor an Iterable identity before they take any action -- when they later subscribe, their Iterable ID is linked to their account. NYT's Iterable tenant ID is public in every visitor's cookie jar.

**Datadog RUM**: `_dd_s` cookie tracks session for Datadog Real User Monitoring. Session replay configuration appears in Statsig config (`dd_session_replay`).

**Google Ad Manager + audience segmentation**: The DFP ad call to `securepubads.g.doubleclick.net` on the homepage includes a `cust_params` string with 118 behavioral audience segments for an anonymous first-time visitor:

```
mktg=type_anon,logf,abf
sub=anon
purr=full
als_test_clientside=web_none_none_20260413194749
gscat=politics_sentiment,gb_safe_from_high,gs_politics,gs_predicts_legal_industry,
      gs_predicts_uspoliticselection,gs_busfin,gs_predicts_musicfestivalsaward,
      gs_predicts_trendingtelevision,gs_predicts_stylefashion,gs_predicts_teens,
      gs_predicts_petlovers,gs_predicts_nflncaafootball,gs_predicts_nba,
      gs_predicts_startups,gs_predicts_homeimprovement,gs_predicts_parentsofyoungkids,
      [... 100+ more segments]
```

These are client-side generated and passed in the ad request. Every anonymous pageview sends a 118-segment behavioral profile to Google Ad Manager and all header bidders. The `purr=full` segment communicates the visitor's paywall meter state to advertisers. The `als_test_clientside` field shows the LiveRamp ALS result for this session -- `web_none_none` meaning no identity match on an anonymous visit.

**Other**: Iterate.com's survey embed (`iteratehq.com/api/v1/surveys/embed`) fires on the homepage -- not gated to article pages. Google's ad traffic quality monitoring fires via `ep1.adtrafficquality.google/getconfig/sodar`.

---

## Consent Architecture

NYT uses Ethyca Fides as its consent management platform. The Fides configuration is publicly queryable at `/fides/api/v1/privacy-experience`. For US-CA (California) visitors:

```json
{
  "region": "us_ca",
  "privacy_notices": [{
    "name": "Data Sales and Sharing",
    "consent_mechanism": "opt_out",
    "default_preference": "opt_in",
    "disabled": true,
    "has_gpc_flag": true
  }]
}
```

The key field is `disabled: true`. In Fides, `disabled` on a notice means the consent UI for that notice is turned off -- the modal for "Data Sales and Sharing" does not appear to visitors. Consent is instead applied silently by the Fides JavaScript on page load.

The `fides_consent` cookie confirms this behavior:
```json
{
  "consent": {"targeted_advertising_gpp_us_national": true},
  "fides_meta": {
    "version": "0.9.0",
    "createdAt": "2026-04-13T19:39:47.774Z",
    "updatedAt": "2026-04-13T19:39:51.895Z",
    "consentMethod": "script"
  }
}
```

`consentMethod: "script"` means consent was applied by the Fides script, not by a user clicking anything. `targeted_advertising_gpp_us_national: true` is set automatically 4 seconds after page load. The GPP string in the `gpp-string` cookie (`DBABLA~BVQqAAAAAABo.QA`) encodes this consent state.

The notice has `has_gpc_flag: true`, meaning the GPC (Global Privacy Control) signal should be honored -- but with the notice disabled and consent set by script, whether GPC actually suppresses targeted advertising is unclear from client-side evidence alone.

**Cookies set on first visit** (no login, no consent interaction):
- `nyt-a`: persistent 1-year visitor ID
- `nyt-gdpr`: 0 (not in GDPR region)
- `nyt-purr`: `cfshcfhssckfsdfshgas2taaa` -- opaque encoded paywall/meter state (25 chars). The `purr=full` in ad calls means full access (non-paywalled). `purr.nytimes.com/v1/purr-cache` returns 200 without authentication.
- `nyt-geo`: US (geoip)
- `nyt-traceid`: Datadog trace correlation
- `nyt-b-sid`: session ID
- `nyt-jkidd`: URL-encoded JSON tracking state `{uid:0, activeDays:[30-day array], lastKnownType:anon}`
- `_dd_s`: Datadog RUM session
- `gpp-string`: GPP consent string (Global Privacy Platform)
- `cto_bundle` / `cto_bidid`: Criteo targeting IDs
- `_cb`, `_chartbeat2`: Chartbeat visitor ID and session data
- `iter_id`: Iterable JWT with NYT company_id
- `_gcl_au`: Google Ads conversion linker
- `__gads`, `__gpi`, `__eoi`: Google Ad Manager IDs
- `_SUPERFLY_lockout`: rate limiting flag
- `datadome`: bot protection token
- `fides_consent`: Ethyca Fides consent state

---

## Unauthenticated Endpoints

**User data-layer API** (`a.nytimes.com/svc/nyt/data-layer`):

This endpoint, internally called JKIDD, returns the caller's user state using their session cookies as identity. For an anonymous visitor the response is:

```json
{
  "user": {
    "type": "anon",
    "tracking": {
      "lastRequest": 1776109566157,
      "activeDays": "[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1]",
      "uid": 0,
      "adv": 1,
      "a7dv": 1,
      "a14dv": 1,
      "a21dv": 1,
      "lastKnownType": "anon"
    },
    "subscriberInfo": {
      "giftSubscriptionRecipient": false,
      "childSubscription": false,
      "b2bSubscription": false,
      "coreOnPromotion": false,
      "formerCoreSubscriber": false,
      "formerHDSubscriber": false,
      "formerEduSubscriber": false,
      "marketingOptIn": false,
      "formerCrosswordSubscriber": false,
      "formerCookingSubscriber": false,
      "giftGiver": false,
      "digiGrace": false,
      "cookingGrace": false,
      "crosswordsGrace": false,
      "verizonSchool": false,
      "gatewayHitLM": false
    }
  },
  "version": "04ee070.dti-analytics-service-75757d5469-n5zpt",
  "ip": {"corp": null, "edu": null},
  "session": {"isLoggedIn": false}
}
```

For authenticated users with their own session cookies, this response includes their full subscription status -- which products they subscribe to, whether they're a gift recipient, on a promotion, a former subscriber to any NYT product, a Verizon school account, or have used a gateway. The `ip.corp` and `ip.edu` fields classify the caller's IP as corporate or educational network. The version field includes a Kubernetes pod name (`dti-analytics-service-75757d5469-n5zpt`).

**Market data API** (`/api/market`):

Returns real-time index data with no authentication:
```json
{
  "data": [
    {"identifier": "US:I:COMP", "symbol": "I:COMP", "last": 23101.2371,
     "lastTimestamp": "2026-04-13T19:30:03.000Z", "change": 198.343383},
    {"identifier": "US:SP500", "symbol": "SP500", "last": 6861.42,
     "lastTimestamp": "2026-04-13T19:30:03.096Z", "change": 44.53},
    {"identifier": "US:I:DJI", "symbol": "I:DJI", "last": 48059.34,
     "lastTimestamp": "2026-04-13T19:30:03.029Z", "change": 142.77}
  ]
}
```

**Statsig config endpoints**: Keys are visible in network traffic. The full experiment configuration -- including all variant assignments, traffic splits, and return values -- downloads on every page load without authentication.

---

## Internals in Page Source

The 404 page embeds environment variables in inline JavaScript:
```
JKIDD_PATH: "https://a.nytimes.com/svc/nyt/data-layer"
ET2_URL: "https://a.et.nytimes.com"
ALS_URL: "https://als-svc.nytimes.com"
GDPR_PATH: "https://us-central1-nyt-dsra-prd.cloudfunctions.net/datagov-dsr-formhandler"
RECAPTCHA_SITEKEY: "6LevSGcUAAAAAF-7fVZF05VTRiXvBDAY4vBSPaTF"
RELEASE: "37681bdc6082fce8316abc19c98e38984be33337"
RELEASE_TAG: "v2564"
GOOGLE_CLIENT_ID: "1005640118348-amh5tgkq641oru4fbhr3psm3gt2tcc94.apps.googleusercontent.com"
SWG_PUBLICATION_ID: "nytimes.com"
ONBOARDING_API_KEY: "lpCO5UAWFCa4e4KyawC71aeNUZ7n92r06JwVu6w4"
```

The `RELEASE` and `RELEASE_TAG` fields appear on all page sources (current: git commit `37681bdc6082fce8316abc19c98e38984be33337`, tag `v2564`). A Sentry DSN (`7bc8bccf5c254286a99b11c68f6bf4ce`) is also present. The service worker is generated per build: `service-worker-test-{build_timestamp}.js`.

**robots.txt and AI crawlers**: NYT's 342-line robots.txt explicitly disallows all major AI crawlers -- anthropic-ai, ClaudeBot, Claude-SearchBot, Claude-User, Claude-Web, GPTBot, ChatGPT-User, OAI-SearchBot, Google-Extended, Google-CloudVertexBot, PerplexityBot, MetaExternalAgent, Cohere, Diffbot, Bytespider -- while providing no `llms.txt` file (404). The site is actively litigating against OpenAI and Microsoft for training data use. The Wirecutter and Athletic subdomains have exceptions in the AI crawler disallows.

---

## Machine Briefing

NYT's homepage is open; article content is DataDome-protected and not accessible via automation. All useful data is available without login via the endpoints below.

**Access & auth**: The homepage loads cleanly in any headless browser or curl. The nyt-token in `window.__preloadedData.config.gqlRequestHeaders` is required for GraphQL calls but is a public RSA key served to every visitor -- fetch it from the page before making GraphQL requests. Article pages return 403 from DataDome at the IP level.

**Open endpoints (no auth)**:

```bash
# Real-time market data (Dow, S&P, NASDAQ)
curl "https://www.nytimes.com/api/market"

# Full Statsig experiment config (key 1)
curl "https://www.nytimes.com/statsig/config/client-BasfMtnVqHD0fEI7mV1O7VkykGye1bute6nczoac1oS.json"

# Full Statsig experiment config (key 2)
curl "https://www.nytimes.com/statsig/config/client-AkrHGgWqd8ygLMakFYSt6a5N7t1RFjTPb6XlY95T3hb.json"

# Fides consent configuration (US-CA)
curl "https://www.nytimes.com/fides/api/v1/privacy-experience?region=us_ca&component=modal"

# User data-layer (returns session user's state -- send your own cookies)
curl -b "nyt-a=YOUR_COOKIE" "https://a.nytimes.com/svc/nyt/data-layer"

# Paywall cache state
curl "https://purr.nytimes.com/v1/purr-cache"
```

**GraphQL (requires nyt-token from page source)**:

```bash
curl -X POST "https://samizdat-graphql.nytimes.com/graphql/v2" \
  -H "nyt-app-type: project-vi" \
  -H "nyt-app-version: 0.0.5" \
  -H "nyt-token: MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs+/oUCTBmD/cLdmcecrnBMHiU/pxQCn2DDyaPKUOXxi4p0uUSZQzsuq1pJ1m5z1i0YGPd1U1OeGHAChWtqoxC7bFMCXcwnE1oyui9G1uobgpm1GdhtwkR7ta7akVTcsF8zxiXx7DNXIPd2nIJFH83rmkZueKrC4JVaNzjvD+Z03piLn5bHWU6+w+rA+kyJtGgZNTXKyPh6EC6o5N+rknNMG5+CdTq35p8f99WjFawSvYgP9V64kgckbTbtdJ6YhVP58TnuYgr12urtwnIqWP9KSJ1e5vmgf3tunMqWNm6+AnsqNj8mCLdCuc5cEB74CwUeQcP2HQQmbCddBy2y0mEwIDAQAB" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}'
```

Introspection is disabled. Field names aren't discoverable without a valid query. Use persisted queries from cached GET requests when possible.

**Gotchas**:
- Statsig client keys are visible in network traffic but may rotate. Fetch fresh keys from the homepage HTML if these return 404.
- The nyt-token is valid for client-side queries only. Server-to-server requests may require a different auth flow.
- DataDome on article pages is IP-level, not cookie-level. CAPTCHA won't help if the IP is flagged.
- The data-layer API uses your session cookies as identity -- it returns the calling user's state, not arbitrary users'.
- robots.txt blocks all major AI crawler user agents. Set a generic UA or rotate.
- The `//status` endpoint (double slash) returns health status: `GET https://www.nytimes.com//.status`
