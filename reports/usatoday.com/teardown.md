---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "USA TODAY — Teardown"
url: "https://www.usatoday.com"
company: "USA TODAY"
industry: "Information"
description: "National news publisher owned by Gannett."
summary: "Gannett's proprietary Tangent framework (not React/Vue/Next) served via Varnish/Fastly CDN. Server-side Prebid auction runs before page load; the Blueprint finance vertical is a separate WordPress stack on AWS. Tealium handles 91-signal data collection; user identity flows through Gannett's GUP platform with Neustar/TransUnion FabrickID integration."
date: "2026-04-13"
time: "20:00"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Gannett Tangent, Varnish/Fastly, Prebid Server, Tealium, WordPress]
trackers: [Google Analytics, Google Ad Manager, Google Tag Manager, LiveRamp ATS, Neustar FabrickID, Yahoo ConnectID, Lotame PanoramaID, Taboola DeeperDive, Mixpanel, Comscore, Parsely, Amazon A9, Criteo, PubMatic, Confiant, IAS, BrandMetrics, True Anthem, Yahoo UPS, Visual Website Optimizer]
tags: [news, gannett, advertising, prebid, ai-widget, gambling, affiliate, identity-graph, geo-targeting, surveillance]
headline: "The server resolves every visitor's IP to city and ZIP code, encoding it into a first-party cookie on every request -- distributing precise geolocation to all 47 ad tech vendors before any JavaScript runs."
findings:
  - "39 gambling brands and 2,103 offer pages -- including a white-label social casino -- are hosted at usatoday.com URLs, lending the publisher's domain authority to affiliate gambling content."
  - "USA TODAY's 'AI Overview' widget is wired for Skimlinks affiliate commissions -- AI-generated answers can quietly monetize every click."
  - "Gannett's GUP API assigns every anonymous visitor a Neustar/TransUnion FabrickID cross-publisher identity token and audience segment code, returned unauthenticated and readable by client-side code."
  - "DeeperDive's public config contains a promotedQuestionsCampaign mechanism -- Taboola can inject commercially motivated questions into the AI widget on date-ranged schedules, with expired Cyber Monday campaigns still in the live config."
  - "The Tealium analytics config -- 36 user signals including email, phone, name, and propensity-to-subscribe score -- is publicly accessible at a wildcard-CORS endpoint with no authentication."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

USA TODAY is a national newspaper with the traffic numbers to match -- hundreds of millions of monthly visits to a Gannett-owned domain that has been running the same proprietary CMS for over a decade. Behind the editorial facade is one of the more fully-developed commercial surveillance architectures in US publishing: a custom framework with server-side geo enrichment, a first-party identity platform wired into Neustar's cross-publisher graph, a 91-signal Tealium pipeline, server-side Prebid auctions, and a parallel revenue business hosting 39 gambling brands at usatoday.com URLs. The AI editorial widget on every article page is wired into Skimlinks affiliate monetization. Most of this runs before any JavaScript executes.

---

## Architecture

USA TODAY runs Gannett's proprietary Tangent framework -- not React, Vue, Next.js, or any common frontend stack. The framework surfaces as `window.g$` (utility namespace) and `window.gnt` (analytics/state namespace). Pages initialize in a no-JavaScript state (`class=gnt__njs` on the HTML element) and hydrate client-side. Custom fonts load as inline base64 woff2 blobs. The framework is fully Gannett-owned and Gannett-specific -- it doesn't appear in any public OSS registry.

The main editorial site (`www.usatoday.com`) is served via Varnish/Fastly CDN. The content management layer appears to be `Tangent` -- disallowed paths in robots.txt include `/optimus/` (internal CMS tool, now 404), `/ux-train/` (likely A/B UI testing infrastructure), and `/content-queries/` (likely internal content API). None of these paths are live externally.

The `money/blueprint/` finance vertical is a completely separate application: WordPress, running on AWS CloudFront/S3, with New Relic for monitoring. It shares the `.usatoday.com` cookie domain but has entirely different infrastructure, a different tech stack, and -- notably -- a different privacy posture. Blueprint runs OneTrust CMP with a visible cookie consent banner. The main editorial site runs neither.

User identity flows through the GUP (Gannett User Platform). State is tracked via three GUP cookies set server-side: `gup_anonid` (1yr anonymous session ID), `gup_clientid` (1yr client ID), and `gup_lng` (encrypted user profile, set for authenticated users). The client fetches live user state from `https://user.usatoday.com/USAT-GUP/user/` -- that subdomain runs nginx rather than Varnish/Fastly, and includes a `X-Clacks-Overhead: GNU Terry Pratchett` header. Subscription tiers surface in the framework globals: `gnt.u.z` = "Plus" tier, `gnt.u.hma` = "All Access" tier. Billing runs through Zuora (`zuoraAccountNumbers` in user profile response).

Content protection uses a 12-state paywall taxonomy: `f=free`, `ff=free-always`, `fp=free-premium`, `m=metered`, `mf=metered-free`, `mp=metered-premium`, `p=premium`, `pf=premium-free`, `pp=premium-premium`, `r=registered`, `rf=registered-free`, `rp=registered-premium`. These drive which content gates on the current article.

A/B testing runs in parallel from two systems: Gannett's own experiment infrastructure (`gnt_eid=control:11`, bucketed via `gnt_ub=51` / `gnt_sb=11` server-side cookies) and Visual Website Optimizer (`_vwo_uuid_v2` cookie, set client-side). Both systems are active simultaneously.

The Content Security Policy is effectively decorative on the script side: the enforced CSP covers only `frame-ancestors 'none'` and `object-src 'none'`. The script policy exists only as `content-security-policy-report-only`, permitting `https: blob: 'unsafe-inline' 'unsafe-eval' 'self'` -- violations are reported to `https://reporting-api.gannettinnovation.com` without enforcement. A GraphQL endpoint exists at `https://www.usatoday.com/graphql/` but returns 403.

The LUX (SpeedCurve Luxury) real user monitoring system runs on a 1% sampling rate, governed by `g$.mr` (a random number seeded per session). `gnt.luxEnabled` exposes the flag.

---

## The Request Picture

The homepage generates 234 total requests. 227 are to third-party domains -- 97% of all page requests. Seven requests go to usatoday.com itself. This is not unusual for a high-traffic ad-funded publisher, but the magnitude is worth stating plainly: navigating to the USA TODAY homepage sends network traffic to 47 distinct third-party domains before any content-related interaction occurs.

Breakdown of the third-party network:

**Header bidding (both server-side and client-side):**
- `POST /pbd/openrtb2/auction` -- Gannett runs Prebid Server (Go) at `/pbd/`. Three auction calls fire per homepage load before the page finishes rendering. The endpoint responds to direct external OpenRTB requests without authentication (though account-level debug is disabled: "debug turned off for account"). Test auction responses confirm Appnexus responding within 25ms.
- `POST /pbd/cookie_sync` -- SSP user ID syncing via Prebid Server. Active SSPs: appnexus, rubicon, criteo, 33across, taboola, pubmatic, openx, ix (index exchange), sovrn, smart adserver, triplelift.
- Client-side prebid.js runs in parallel, firing to prebid-server.rubiconproject.com, prebid.a-mo.net (Taboola), and others.
- `POST traxex.gannettdigital.com/prebid-event` -- Internal Gannett prebid event tracker, logging bid-level signals back to Gannett's own infrastructure.

**Identity resolution:**
- LiveRamp ATS: `idx.liadm.com/idex/gannett/2168` (enrollment) + `rp.liadm.com` (sync) -- every page load
- Yahoo UPS: `ups.analytics.yahoo.com/ups/58813/fed`, `/ups/58292/sync`, `/ups/58917/cms` -- 3 separate endpoints per load
- Blismedia/SugarSync: `tr.blismedia.com` -- Amazon identity sync
- AcuityPlatform: `ums.acuityplatform.com`

**Demand-side:**
- Google: pagead2.googlesyndication.com, doubleclick.net, googleadservices.com, googletagservices.com, googletagmanager.com (GAM 360 publisher ID: `7103/usatoday`)
- Amazon A9/TAM: aax.amazon-adsystem.com
- Rubicon/Magnite: token.rubiconproject.com, prebid-server.rubiconproject.com
- Criteo: grid-bidder, gum, mug
- PubMatic: ut.pubmatic.com, image8.pubmatic.com, reachms.bfmio.com
- Polar: polarcdn-terrax.com, polarcdn-pentos.com (native ads)
- Taboola: hp.taboola.com, trc.taboola.com, display.bidder.taboola.com, beacon.taboola.com, vidstat.taboola.com, nr-events.taboola.com

**Measurement and quality:**
- IAS/Integral Ad Science: jsconfig.adsafeprotected.com, pixel.adsafeprotected.com
- Confiant: cdn.confiant-integrations.net (ad quality/malvertising)
- BrandMetrics: collector.brandmetrics.com (brand lift surveys)
- Comscore
- Mixpanel: api-js.mixpanel.com (both `/track/` and `/engage/` -- user profile updates, not just events)

**IAS misconfiguration**: `jsconfig.adsafeprotected.com/jsconfig/jload/922805` returns 404 on every page load, every time. This endpoint fires 8x per homepage load, 8x per article load. The IAS configuration ID 922805 is inactive or misconfigured. The tag still fires.

Articles generate 156 total requests to 29 third-party domains -- somewhat lighter, but DeeperDive AI widget activity adds 4+ calls to deeperdive.ai.

---

## The Geo Machine

Every HTTP request to `www.usatoday.com` triggers a server-side IP geolocation lookup and a weather API call. Results are encoded into two first-party cookies set in the response headers -- before any JavaScript runs, before any client-side ad tags load.

`gnt_i=71201580495172900778*7922*US~CA~san%20francisco~94123*x~x`

Field breakdown: `{session-id}*{DMA-code}*{country}~{state}~{city}~{zip}*x~x`. DMA code 7922 = San Francisco-Oakland-San Jose. City and ZIP code are derived from IP geolocation. The cookie is scoped to `.usatoday.com` -- all subdomains and all third-party scripts that can read `document.cookie` have access to the city name and ZIP code on every page load.

`gnt_w=60~2-q1a2z3434cf2d2~Mostly%20Sunny`

Format: `{temperature_F}~{build-hash}~{weather-condition}`. A live weather API is called for the geolocated city on each server-side request. The temperature (60F) and current conditions ("Mostly Sunny") are set into the cookie scoped to `www.usatoday.com`.

The `gnt_i` value is additionally echoed into the `server-timing` response header on every request:

```
server-timing: gnt_i;desc="71201580495172900778*7922*US~CA~san%20francisco~94123*x~x"
```

The geo data surfaces in the framework: `window.gnt.geo = {c:"US", y:"san francisco", z:"94123", s:"CA"}`. The Tangent navigation bar displays it directly: "Weather in San Francisco, CA (94123): 61F Mostly Sunny" -- city name and ZIP in the editorial UI.

The ad tech implications: any SSP or DSP bidding in Gannett's Prebid Server auction can target by DMA code (from `gnt_i`) and weather conditions (from `gnt_w`). This data arrives in the first-party cookie jar before client-side bid requests fire.

---

## Identity Graphs

### GUP -- The First Party

Anonymous visitors receive four server-set cookies on first load:

- `gup_anonid` -- anonymous session UUID (1yr, `.usatoday.com`)
- `gup_clientid` -- client UUID (1yr, `.usatoday.com`)
- `gnt_ub=51` / `gnt_sb=11` -- A/B test bucket assignment
- `gnt_eid=control:11` -- experiment variant

A live fetch to `https://user.usatoday.com/USAT-GUP/user/` returns the anonymous user's profile without authentication:

```json
{
  "meta": {
    "status": 200,
    "isAnonymous": true,
    "unmetRequirements": ["firstName", "lastName", "attributes.legalVideo"]
  },
  "response": {
    "insights": {
      "nstar": {
        "fabrickId": "E1:Aawb6JxzrxVd...",
        "lastFetched": 1776109270,
        "adAdvisorSegment": "014",
        "qsp_hash": "a772367d..."
      }
    },
    "propensitySubscribe": {"ex": false, "na": true, "sub": false, "no": true},
    "anonymousId": "b92f39de-3770-11f1-98d1-16b4fc33fea3",
    "clientId": "b92f4564-3770-11f1-98d1-16b4fc33fea3",
    "user": {
      "entitlements": {"ad_free": false, "digital": false, "print_replica": false},
      "zuoraAccountNumbers": []
    }
  }
}
```

Three things happen here before any user interaction:

1. **Neustar FabrickID assignment**: The `nstar.fabrickId` value (`E1:Aawb6JxzrxVd...`) is a Neustar/TransUnion cross-publisher identity token. FabrickIDs are designed for cross-site identity resolution -- the same token can be recognized across publishers participating in Neustar's network. On first visit, Gannett assigns this token and returns it to the client. Client-side code can read its own FabrickID from this API call. The token is also forwarded to Tealium as `user-neustar-e1-segment`.

2. **Audience segment code**: `adAdvisorSegment: "014"` -- a Neustar audience segment code. The taxonomy for segment 014 is not publicly documented.

3. **Propensity scoring**: `propensitySubscribe.na: true` ("not addressable") -- the server's model predicts this anonymous visitor is not a viable subscription conversion target. The propensity score is computed and returned on first visit.

The `unmetRequirements` field reveals the authenticated user profile schema: `firstName`, `lastName`, and `attributes.legalVideo` (the last suggesting video content requires age/legal attestation).

### Third-Party Identity Stack

Running on every page load alongside GUP:

- **LiveRamp ATS** (`idx.liadm.com/idex/gannett/2168`) -- identity enrollment, Gannett-specific integration
- **Yahoo ConnectID** (`connectId` cookie, client-side)
- **Lotame PanoramaID** (`panoramaId` cookie, client-side)
- **Publisher Common ID** (`_pubcid` cookie, Prebid.js identity module)
- **Yahoo UPS** (3 endpoints: `/ups/58813/fed`, `/ups/58292/sync`, `/ups/58917/cms`)

Five distinct identity resolution systems operate simultaneously. The Neustar FabrickID from GUP feeds into the Tealium pipeline. The four client-side graphs feed into the Prebid SSP auction as bid enrichment. An anonymous visitor to USA TODAY is enrolled in identity resolution by at least six systems within milliseconds of the first request.

---

## Tealium's 91-Signal Pipeline

Gannett's Tealium analytics configuration is publicly accessible -- no authentication, wildcard CORS:

```
GET https://www.usatoday.com/gcdn/dcc/prod/USAT-TEALIUM-TANGENT.json
Access-Control-Allow-Origin: *
```

The `collect` object defines 91 signals Tealium captures on every tagged event. Organized by prefix:

**16 client signals** (`client-*`): GPC flag status (`client-gpc`), screen dimensions, color scheme preference (`client-color-scheme`), browser language, DST status, timezone offset, autoplay audio/media policy, location country code and state.

**32 page signals** (`page-*`): A/B slot assignments (`page-ab-slot`, `page-ab-slot-ub`, `page-ab-variant`), paywall content protection state (`content-protection-state`), canonical URL, Google Client ID (`page-google-client-id`), Google session ID (`page-google-property-session-id`), Google "rec AI token" (`page-google-rec-ai-token` -- labeled `gnt-rtk` in the page globals), GPS content source, registration campaign/content/medium/source/delivery, campaign tracking parameters (both ITM -- Gannett's internal tracking -- and UTM), bot status flag (`page-bot-status`).

**36 user signals** (`user-*`): email address (`user-email`), phone number (`user-phone-number`), first name (`user-first-name`), last name (`user-last-name`), license type, subscription history, meter state, propensity-to-subscribe score (`user-propensity-to-subscribe`), Neustar E1 segment (`user-neustar-e1-segment`), hazard score (`user-hazard-score`), RFV bin (`user-rfv-bin`, likely recency/frequency/value segmentation), cohort, attribution ID, Atypon ID, and others. The email, phone, and name fields are populated for authenticated users. For anonymous users, `user-status: anon` and `user-anonymous-id` carry the session identity.

**5 event signals** (`event-*`): `event-facebook-click-id` (fbclid URL parameter), `event-reddit-click-id`, `event-snapchat-click-id`, `event-tiktok-click-id`, `event-search-query`. When you arrive at USA TODAY from a social ad, the click ID in the URL is captured and forwarded to all Tealium-connected analytics destinations.

The `user-permission-sale-of-personal-information` signal uses `collectOneTrustOptions` as its collection method -- checking for group `4:1` in the `OptanonConsent` cookie. For visitors who have only used the main editorial site (where no OneTrust banner exists), this field is undefined. For visitors who first visited the Blueprint finance vertical (which does run OneTrust and sets `OptanonConsent` with default opt-in), the cookie is present with all groups consented. Neither scenario involves an active consent decision on the editorial site itself.

The GPP string builder in inline page JavaScript maps US state privacy laws to IAB GPP sections: section 7 (USNAT) for DE, FL, IA, IN, KY, MD, MN, MT, NE, NH, NJ, OR, RI, TN, TX, UT; section 8 (USCA) for CA and NV; section 9 (USVA) for VA; section 10 (USCO) for CO; section 12 (USCT) for CT. When `navigator.globalPrivacyControl` is true and the user is in a state with an opt-in model (CA, CO, CT), the GPC signal alone sets `SaleOptOut` and `TargetedAdvertisingOptOut` in the GPP string. Whether downstream ad tech honors that GPP string is not verified.

`_ga=GA1.1...` is set server-side in the initial HTTP response -- Google Analytics is bootstrapped before any client-side JavaScript loads.

---

## DeeperDive -- The AI Widget That Earns Commissions

Taboola's DeeperDive widget appears on article pages as "AI Overview" -- generating article summaries and AI-powered Q&A responses. Its configuration file is publicly accessible:

```
GET https://deeperdive.ai/config/usatodaydemo.json
```

Key configuration values:

```json
{
  "skimlinksDomain": 1779802,
  "enableBetaTag": true,
  "killSwitchStatus": false,
  "killSwitchReason": "Disabled for outages. Will restore once response time stabilized",
  "publisherDisclosureText": "DeeperDive uses Generative AI leveraging USA TODAY Network content. Mistakes may occur. Please reference surfaced articles to validate AI summary. This BETA is being quality assessed by humans.",
  "sessionReplay": {"c": 0}
}
```

`skimlinksDomain: 1779802` enables Skimlinks affiliate link monetization within AI-generated responses. Skimlinks intercepts links to merchants and rewrites them as affiliate URLs -- when the AI widget recommends a product, the link can carry an affiliate tag, and Taboola/USA TODAY earn a commission on resulting purchases. Session replay is disabled (`sessionReplay.c: 0`).

The kill switch has been triggered. The `killSwitchReason` text indicates the widget was disabled due to response time instability and is currently restored. `enableBetaTag: true` means the widget is still labeled as beta in the UI.

The widget excludes certain content types: live coverage, opinion pieces, contributor content, newsletters.

**Promoted questions**: The `promotedQuestionsCampaign` array in the config defines date-ranged campaigns of commercially motivated questions that Taboola can inject into the widget. Expired campaigns currently in the live config:

*CYBER MONDAY (2025-11-30 to 2025-12-03):*
- "What are the best Cyber Week deals?"
- "What are the best Cyber Week Tech deals?"
- "What are the best gift ideas on sale for Cyber Week?"
- "What are the best Cyber Week TV deals?"
- "What are the best Cyber Week pet sales?"
- "What are the best meal kit deals?"
- "Cyber Week: Best Laptop Deals"
- "What are the best gifts for men?" / women / kids

*Holiday Shopping (2025-12-03 to 2025-12-08):*
- "What are the best gifts for men?" / women / kids
- "Holiday: Best White Elephant Gifts"

Each question carries `queryType: "promoted"` and a `queryScope` matching the campaign. During the active date ranges, these questions were surfaced in the AI widget alongside user-generated questions -- with Skimlinks monetization active on the responses.

Current "Question of the Day" in the config points to "Who qualifies for Capital One's $425M settlement?" -- an active, non-promotional question.

DeeperDive article endpoints (no auth required for the call, but publisher context needed for useful output):
- `POST https://deeperdive.ai/api/search/get-user-generated-questions`
- `POST https://deeperdive.ai/api/search/get-gist`
- `POST https://deeperdive.ai/log/usatodaydemo/deeperdive` (event logging, fires 4x per article load)

---

## The Gambling Affiliate Empire

`usatoday.com/online-betting/` is a full vertical with its own sitemap. As of investigation, the sitemap contains 2,103 offer pages representing 39 distinct gambling brands:

bet365, BetMGM, Betr, BetRivers, BetRivers Net, Bleacher Nation Fantasy, Boom Fantasy, Caesars, Casino Click, Crown Coins Casino, Dabble, Dogghouse, DraftKings, Fanatics, FanDuel, Fortune Coins, Funrize, Golden Nugget, Hard Rock Bet, Hello Millions, High 5, Jackpota, Kalshi, LoneStar, McLuck, Mega Bonanza, Novig, PlayStar, PrizePicks, Pulsz, Sporttrade, Spree, Stake US, theScore Bet, The Win Zone, Underdog, Wandando, WOW Vegas, Zula.

Offer pages at `usatoday.com/bet-offer/{brand}/offer/{id}` are built using "ktag," a gambling affiliate CMS platform, not the Gannett Tangent framework. They run Google Tag Manager with explicit affiliate tracking: `contentProduct: 'exit product'`, `contentFunnel: 'bofu'` (bottom-of-funnel), affiliate identifier `af=239`, publisher identifier `p1=usatoday`. USA TODAY earns a referral commission when users convert to a gambling operator account via these pages.

LoneStar Casino (`bet-offer/lonestar/`) is a white-label social casino built by RealPlay Tech Inc, served under `usatoday.com/bet-offer/lonestar/offer/` URLs. Social casino products offer gambling-style mechanics without real-money wagering -- the product runs entirely under USA TODAY's domain.

The gambling section includes a cookie consent banner ("We use cookies to personalize content and ads..."). The main editorial site does not. The global navigation bar on editorial article pages includes gambling promotional content: "PLAY CASINO GAMES Best online casinos" with casino-themed characters in the editorial header.

robots.txt blocks the gambling offer pages from AI crawlers. The news sitemap (`online-betting/news-sitemap.xml`) includes gambling content pages alongside editorial content.

---

## Open Threads

**Segment code 014**: The Neustar `adAdvisorSegment: "014"` in the GUP API response is not documented publicly. Neustar's adAdvisorSegment taxonomy covers demographic, behavioral, and intent-based audience classifications. The specific meaning of `014` for this anonymous session is not resolvable without access to Neustar's segment dictionary.

**DeeperDive affiliate link verification**: The Skimlinks domain configuration (`skimlinksDomain: 1779802`) is confirmed. Whether a live DeeperDive AI response on a product-adjacent article actually generates Skimlinks-rewritten affiliate URLs would require testing specific article pages with product recommendations active. The configuration is conclusive for capability; live behavior at the link level was not directly observed.

**GPC downstream compliance**: The inline GPP string builder correctly sets `SaleOptOut` and `TargetedAdvertisingOptOut` for CA/CO/CT users with GPC-enabled browsers. Whether the 47 third-party ad tech vendors actually honor the resulting GPP string in their bid requests is not verified -- it would require intercepting individual bid responses.

**Blueprint OneTrust + main Tealium interaction**: Whether `user-permission-sale-of-personal-information` is meaningfully populated in Tealium events for editorial site visitors (who set no consent decision there) was not tested with a cross-subdomain session.

---

## Machine Briefing

### Access & Auth

All public content is accessible via standard HTTP requests. No bot blocking was observed during investigation -- Playwright loaded the homepage cleanly. The main site is Varnish/Fastly-cached; the GUP user API runs on nginx at `user.usatoday.com`.

For anonymous sessions: the server sets `gup_anonid`, `gup_clientid`, `gnt_ub`, `gnt_sb`, `gnt_eid`, `gnt_i`, `gnt_w`, and `_ga` on first request -- no client-side JS required. These cookies must be carried on subsequent requests for full personalization/ad behavior.

DeeperDive endpoints accept requests without authentication headers but return empty results without valid publisher context headers (`publisher: usatodaydemo` or equivalent).

### Endpoints

**Open -- no auth**

```bash
# GUP anonymous user profile (returns FabrickID, segment, propensity)
curl -s https://user.usatoday.com/USAT-GUP/user/ \
  -H "Cookie: gup_anonid={your-anon-id}; gup_clientid={your-client-id}"

# Tealium analytics config (wildcard CORS, 29KB, no auth)
curl -s https://www.usatoday.com/gcdn/dcc/prod/USAT-TEALIUM-TANGENT.json | jq '.collect | keys'

# DeeperDive config
curl -s https://deeperdive.ai/config/usatodaydemo.json | jq '{skimlinksDomain, enableBetaTag, killSwitchStatus, killSwitchReason}'

# Prebid Server -- direct OpenRTB auction (external access, no auth)
curl -s -X POST https://www.usatoday.com/pbd/openrtb2/auction \
  -H "Content-Type: application/json" \
  -d '{"id":"test","imp":[{"id":"1","banner":{"w":300,"h":250}}],"site":{"page":"https://www.usatoday.com/"}}'

# Prebid cookie sync -- reveals full SSP list
curl -s -X POST https://www.usatoday.com/pbd/cookie_sync \
  -H "Content-Type: application/json" \
  -d '{"bidders":[],"gdpr":0}'
```

**Open -- requires session cookies from first request**

```bash
# Initial request -- sets all geo + A/B + identity cookies
curl -sv https://www.usatoday.com/ 2>&1 | grep set-cookie

# Gannett analytics event ingestion
POST https://www.usatoday.com/gciaf/prod/sd
```

**DeeperDive article AI endpoints**

```bash
# Get AI-generated questions for an article
POST https://deeperdive.ai/api/search/get-user-generated-questions
Content-Type: application/json
{
  "publisher": "usatodaydemo",
  "pageUrl": "{article-url}",
  "contentId": "{article-id}"
}

# Get AI summary/gist
POST https://deeperdive.ai/api/search/get-gist
Content-Type: application/json
{
  "publisher": "usatodaydemo",
  "contentId": "{article-id}"
}
```

**Closed (403)**

```
GET https://www.usatoday.com/graphql/
```

### Gotchas

- **Prebid Server debug disabled**: Appending `?debug=true` to `/pbd/openrtb2/auction` requests returns "debug turned off for account" -- no bid response details visible.
- **`gnt_i` cookie**: Scoped to `.usatoday.com`. Contains your session ID + DMA + geo. Changes with IP; the session ID portion is stable per session but the geo portion reflects current IP geolocation.
- **`gnt_w` cookie**: Scoped to `www.usatoday.com` (not `.usatoday.com`). Not sent to user.usatoday.com requests.
- **Blueprint vs Tangent**: Blueprint (`/money/blueprint/`) is an entirely separate WordPress application. Its cookies, CSP, and analytics stack differ from the main site. Don't assume Tangent APIs apply to Blueprint content.
- **DeeperDive empty responses**: `/api/search/get-user-generated-questions` returns 200 with `{"questions":[]}` and `/api/search/get-gist` returns `"No gist found for publisher: null"` without proper publisher context. The endpoints are open but not useful without an article content ID from an article the widget has already indexed.
- **IAS tag broken**: `jsconfig.adsafeprotected.com/jsconfig/jload/922805` returns 404 on every page load -- 8x per page. Not an actionable endpoint.
- **Geo cookies set before JS**: `gnt_i` and `gnt_w` are server-set in the first HTTP response. You don't need to run JavaScript to receive them -- they come back in the `set-cookie` response headers on any GET to `www.usatoday.com`.
