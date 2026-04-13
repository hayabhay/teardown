---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "BabyCenter — Teardown"
url: "https://www.babycenter.com"
company: "BabyCenter"
industry: "Healthcare"
description: "Pregnancy and parenting content platform with community forums, baby name tools, and a registry."
summary: "Next.js SSR site on Akamai CDN with an Apollo GraphQL API at service.babycenter.com. Owned by Ziff Davis / Everyday Health Group -- ZDBB cross-property tracking, Snowplow first-party analytics, and 12 third-party trackers coordinated through GTM. Community forums, courses (Thinkific), and registry run on separate subdomains."
date: "2026-04-13"
time: "01:43"
contributor: "hayabhay"
model: "sonnet"
effort: "medium"
stack: [Next.js, Apollo GraphQL, Akamai]
trackers: [Google Analytics 4, Google Tag Manager, Snowplow, LiveRamp, DoubleVerify, Amazon TAM, Rubicon/Magnite, Microsoft Bing, Ziff Davis ZDBB, AppsFlyer, OneTrust, AdLightning]
tags: [parenting, pregnancy, healthcare, graphql, cors, liveramp, ziff-davis, everyday-health-group, geo-cookies, consent]
headline: "One Ziff Davis cookie links your BabyCenter pregnancy browsing to your activity on DiabeticDaily, WhatToExpect, and 10+ health sites in the same ad network."
findings:
  - "Akamai sets city and ZIP-code cookies on every response with no HttpOnly flag and a 2038 expiry -- every ad SDK and tracker on the page can read precise location without a geolocation prompt."
  - "The registration mutation requires leadSource and siteSource as non-optional schema fields -- marketing attribution is mandatory at signup, enforced at the GraphQL type level."
  - "The ZDBB cross-property fingerprint links sessions across BabyCenter, WhatToExpect, pregnancy.com, diabetesdaily.com, and 10+ Everyday Health Group sites via a single persistent cookie."
  - "LiveRamp fires on every page despite CCPA opt-out signals, sending the user's persistent RampID and base64-encoded page HTML to the identity graph."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

BabyCenter is a Ziff Davis property running Next.js over Akamai, backed by an Apollo GraphQL API that reflects any cross-origin request with full credentials. Before the consent banner loads, Akamai stamps every visitor with city-level geolocation in JavaScript-readable cookies -- and 12 trackers, including LiveRamp, start firing whether you've opted out or not.

---

## Platform & Infrastructure

BabyCenter runs Next.js in SSR-only mode -- no static generation, all pages server-rendered on request. The build ID embedded in `window.__NEXT_DATA__` reads `bc-platform-react.12_03-31-2026`: version 12 of their React platform, deployed March 31, 2026. The platform naming and version number suggest a deliberate migration history from an older stack; `robots.txt` still contains disallow rules for `.htm` paths and a `/mission-motherhood/wp-admin/admin-ajax.php` entry, a remnant of a legacy WordPress campaign page that now redirects to the homepage.

The CDN layer is Akamai (`akamai-cache-status: Hit from child` in response headers). The GraphQL API sits at `service.babycenter.com` (Apollo Server, introspection disabled). Static assets serve from `assets.babycenter.com`. Snowplow analytics use a first-party collector at `bcsp.babycenter.com` -- a common technique to route tracker traffic through a first-party subdomain to avoid third-party blocking.

Active subdomains beyond the main site:
- `community.babycenter.com` -- community forums (separate application)
- `courses.babycenter.com` -- parenting courses (Thinkific)
- `registry.babycenter.com` -- baby registry
- `service.babycenter.com` -- GraphQL API
- `assets.babycenter.com` -- Next.js static chunks

The SSL certificate reveals the corporate infrastructure scope. BabyCenter shares a wildcard cert with Everyday Health Group, and the Subject Alternative Names include: `whattoexpect.com`, `pregnancy.com`, `diabetesdaily.com`, `synopsihealth.com`, `trustedcareaccess.com`, `omfit.com`, `omclick.com`, `dailyom.com`, `loseitblog.com`, `nursingald.com`, and regional BabyCenter domains (`baby.co.uk`, `babycenter.ca`, `babycenter.au`, `babycenter.de`, `babycenter.fr`, `babycenter.in`). This is the Ziff Davis / Everyday Health Group portfolio sharing common CDN and tracking infrastructure.

**AI crawler policy**: `robots.txt` blocks approximately 80 named crawlers with an explicit `Disallow: /`. The list covers ClaudeBot, GPTBot, Perplexity, Manus, NovaAct, Devin, Amazonbot, FacebookBot, DeepSeekBot, MistralAI-User, and dozens more. The header comment explicitly prohibits "development or operation of artificial intelligence or machine learning software or databases, including by training, fine-tuning, embedding, and retrieval-augmented generation." Contact is `licensing@ziffdavis.com`.

---

## Akamai Geo Cookies -- Location Before the Page Loads

Every HTTP response from BabyCenter includes five geolocation cookies set by Akamai at the CDN edge, before any JavaScript runs:

```
set-cookie: geoCC=US; expires=Mon, 31-Dec-2038 23:59:59 GMT; path=/; domain=.babycenter.com
set-cookie: geoRegion=CA; expires=Mon, 31-Dec-2038 23:59:59 GMT; path=/; domain=.babycenter.com
set-cookie: geoDMA=807; expires=Mon, 31-Dec-2038 23:59:59 GMT; path=/; domain=.babycenter.com
set-cookie: geoCity=HAYWARD; expires=Mon, 31-Dec-2038 23:59:59 GMT; path=/; domain=.babycenter.com
set-cookie: geoZip=94540-94545+94557; expires=Mon, 31-Dec-2038 23:59:59 GMT; path=/; domain=.babycenter.com
```

Five data points: country, state/region, Nielsen DMA market (807 = San Francisco Bay Area), city name, and a ZIP code range. Expiry is December 2038. None carry the `HttpOnly` flag.

The absence of `HttpOnly` means every JavaScript process on the page -- every analytics SDK, every ad tag, every tracker -- can read these cookies via `document.cookie`. No browser geolocation permission prompt, no user action, no consent. The location arrives pre-populated from the server.

The DMA field is not a UX signal. Nielsen Designated Market Areas are ad-buying units -- `geoDMA=807` is the value ad systems use for geographic targeting bids. Akamai's geo enrichment is feeding targeting data directly into the cookie jar that every ad partner on the page reads.

---

## Surveillance Stack

BabyCenter loads 12 confirmed third-party tracking systems, coordinated through GTM container `GTM-PKLTNHJ`.

**Confirmed trackers:**

| Tracker | Domain(s) | Notes |
|---------|-----------|-------|
| Google Analytics 4 | `www.google-analytics.com` | ID `G-BP5N04S2Y3`, fires 2x per page |
| Google Tag Manager | `googletagmanager.com` | Container `GTM-PKLTNHJ`, 479KB |
| Snowplow | `bcsp.babycenter.com` | First-party subdomain, version 4.6.8 |
| LiveRamp / RampID | `rp.liadm.com`, `rp4.liadm.com`, `idx.liadm.com` | Identity resolution |
| DoubleVerify | `pub.doubleverify.com` | Ad quality signals |
| Amazon TAM | `c.amazon-adsystem.com` | Header bidding |
| Rubicon/Magnite | `ads.rubiconproject.com` | Prebid floor pricing |
| Microsoft/Bing | `bat.bing.com` | Conversion tracking |
| Ziff Davis ZDBB | `gurgle.zdbb.net`, `jogger.zdbb.net`, `zdbb.net` | Cross-property fingerprint |
| AppsFlyer | Loaded inline | Mobile attribution SDK on web |
| Google FundingChoices | `fundingchoicesmessages.google.com` | Consent overlay |
| OneTrust | `cdn.cookielaw.org` | CMP, ID `93bd5720-21dd-466e-a1cf-c34c3766f085` |

AdLightning ad fraud/quality scripts (`tagan.adlightning.com/babycenter/`) load as obfuscated binaries.

**Pre-consent firing, confirmed on a fresh session**

The consent state captured from a fresh browser session with zero prior cookies:
- `interactionCount=0` -- user has not touched the consent banner
- `consentGiven: false`, `userActionDone: false`
- `OptanonActiveGroups: ",C0001,"` -- only strictly necessary cookies active
- `optins: {ga: false, snowplow: false, googleads: false, facebook: false}` -- the site's own `zdconsent` system marks all analytics as opted out
- `usprivacy=1YYY` -- CCPA opt-out applied automatically (California session)

Despite this state, the network log from the same session shows: `www.google-analytics.com/g/collect` (2 requests), `bat.bing.com/p/conversions/c/e`, `rp4.liadm.com/j`, Snowplow `tp2` -- all firing before any user interaction.

GA4 fires in Google Consent Mode "basic" configuration -- a mode where Analytics sends cookieless pings even when `analytics_storage: denied`. This is Google-documented behavior; BabyCenter chose the basic mode setup. The site's `zdconsent` system correctly marks GA as opted out, but the basic-mode pings go out regardless.

**The `doNotTrack` override**: The data layer explicitly pushes `doNotTrack: false` on every page load. The GTM container reads this value as a macro. Any tags configured to check browser DNT will see `false` regardless of what the user's browser sends.

**AppsFlyer on web**: `window.zdconsent.analytics.push(function() { AppsFlyerSdkObject... })` loads AppsFlyer's mobile attribution SDK into the web page via the zdconsent analytics queue. AppsFlyer is primarily a mobile app measurement platform -- its presence here indicates BabyCenter bridges web sessions with mobile app installs for cross-device attribution.

**Prebid.js header bidding** (`window.pbjs`) runs alongside Amazon TAM (`window.apstag`) and Google Publisher Tag (`window.googletag`) in a parallel auction. Rubicon/Magnite floor prices (`ads.rubiconproject.com/floors/13346-pbjs-floors.json`) are fetched on every page to set minimum bid thresholds.

---

## LiveRamp -- Identity Resolution Past the Opt-Out

LiveRamp fires on every page load. The request to `rp4.liadm.com/j` carries:

```
https://rp4.liadm.com/j?
  dtstmp=1776043888443
  &did=did-0001
  &se=e30                          <- empty JSON, base64
  &duid={_lc2_fpi cookie value}    <- persistent LiveRamp user ID
  &tna=v2.7.8
  &pu={current page URL}           <- full page URL
  &us_privacy=1YYY                 <- CCPA opt-out signal
  &wpn=lc-bundle
  &c={base64 encoded HTML}         <- page metadata
```

The `us_privacy=1YYY` string is the IAB CCPA signal for "covered, opted-out, no LSPA agreement." It is included in the request -- but as a parameter going to LiveRamp, not as a gate preventing the call. The opt-out signal travels to the destination rather than blocking the destination.

The `c=` parameter decodes to the page's `<title>`, `<meta name="description">`, `<link rel="canonical">`, and `<h1>` -- a content signal that allows LiveRamp to build contextual associations for the user's identity graph even when no email or login is present.

Four LiveRamp cookies are set on the first visit:
- `_li_dcdm_c` -- domain marker (`.babycenter.com`)
- `_lc2_fpi` -- persistent first-party RampID
- `lrswap=1` -- ID synchronization flag
- `__li_idex_cache_eyJyZXNvbHZlIjoic2hhMiJ9={}` -- identity exchange cache (empty on first visit)

The identity exchange call to `idx.liadm.com/idex/did-0001/any` fires separately -- LiveRamp querying its network of partner identity graphs to resolve the user across data brokers.

---

## Ziff Davis ZDBB -- Cross-Property Fingerprint

The Ziff Davis Brand Brain (ZDBB) system creates a persistent cross-property identity that follows users across the entire Everyday Health Group portfolio.

**Cookies set on first visit:**
- `h_zdbb` -- MD5 hash (e.g., `d6014458ab15464db310f38ad21457fd`), the primary cross-site identifier
- `zd_session_id` -- UUID session identifier
- `zpack` -- base64 JSON object:
  ```json
  {
    "zdbb": "d6014458ab15464db310f38ad21457fd",
    "fpid": null,
    "ppid": "d6014458ab15464db310f38ad21457fd",
    "ue_m2s": "",
    "lcl_id": "",
    "loc": "https://www.babycenter.com/",
    "pv_id": "68a54fb1-1621-43c6-87eb-34da4b08be32",
    "sess_id": "11098d7d-e6f2-4998-9f6f-d2b92e832c0e"
  }
  ```
  `zdbb` and `ppid` carry the same MD5 hash. `fpid` is null -- the verified first-party ID slot, populated after the `set_fpid` endpoint call.

**Tracking infrastructure:**
- `gurgle.zdbb.net/info` -- session state
- `gurgle.zdbb.net/s_muid/babycenter.com/fp/0/pl/-1` -- fingerprint/session management
- `jogger.zdbb.net/check?href={URL}` -- URL-aware check, fires on every page
- `jogger.zdbb.net/receive_uint8` -- binary payload endpoint, fires on article pages only. Binary format (uint8 array) suggests obfuscated fingerprinting data.
- `zdbb.net/check_c?eu_consent=&zd_opt_out=1` -- fingerprint state endpoint. Returns:
  ```json
  {"zdbb":"3ca2284cba3041638dd939fe46bf4277","eu":false,"country":"US","have_eu_consent":false,"zd_opt_out":"0"}
  ```
  BabyCenter sends `zd_opt_out=1` as a query parameter, but the response returns `zd_opt_out: "0"` -- the opt-out flag is sent but not reflected in the returned state.

The `set_fpid` endpoint (`/set_fpid/babycenter.com/c/{zdbb_hash}`) writes the ZDBB ID back as a publisher first-party ID, establishing the cross-property link between BabyCenter's analytics and the ZDBB network.

**Network scope from SSL certificate SANs**: `*.whattoexpect.com`, `*.pregnancy.com`, `*.diabetesdaily.com`, `*.synopsihealth.com`, `*.trustedcareaccess.com`, `*.omfit.com`, `*.omclick.com`, `*.dailyom.com`, `*.loseitblog.com`, `*.nursingald.com` -- parenting, women's health, diabetes, fitness, and senior care properties. A single `h_zdbb` cookie links activity across this entire network.

---

## GraphQL API -- CORS Misconfiguration and Attribution Schema

**CORS misconfiguration**

`service.babycenter.com/graphql` reflects the caller's `Origin` header verbatim:

```
OPTIONS https://service.babycenter.com/graphql
Origin: https://evil.com
Access-Control-Request-Method: POST

Response:
access-control-allow-origin: https://evil.com
access-control-allow-credentials: true
access-control-allow-methods: GET,HEAD,PUT,PATCH,POST,DELETE
access-control-allow-headers: Content-Type
```

`access-control-allow-credentials: true` with a reflected origin means any website can make authenticated cross-origin requests to this API using a visitor's existing BabyCenter session cookies. The browser will include cookies on the cross-origin request if the calling site uses `credentials: 'include'`.

Mutations accessible from any origin:
- `login(email: String!, password: String!)` -- returns `User`
- `register(memberInfo: MemberInfoRegister!)` -- returns `User`
- `updateUser(user: InputUpdateUser!)` -- returns `ErrorResult`
- `changePassword(...)` -- password change

The `users` query requires authentication and returns `forbidden` without a valid session. What data it exposes to authenticated sessions was not verified.

Introspection is disabled, but the schema was partially reconstructed from error messages that Apollo returns by default. Confirmed types: `Article`, `ArticleData`, `User`, `BabynameQueryPayload`, `Babyname`, `BabynamePopularity`, `BabynamePopularitySSARank`, `StagePagePayload`, `Stage`, `PaginatedUsers`, `MemberInfoRegister`, `MemberRegister`, `InputUpdateUser`, `ErrorResult`.

**Registration schema -- attribution required**

The `register` mutation uses a `MemberInfoRegister` wrapper containing `MemberRegister` objects. Probing the type reveals three non-optional fields beyond email:

```
Field "MemberRegister.leadSource" of required type "String!" was not provided.
Field "MemberRegister.siteSource" of required type "String!" was not provided.
Field "MemberRegister.preconception" of required type "Boolean!" was not provided.
```

`leadSource` and `siteSource` are marketing attribution fields -- where the user came from and which property is registering them. These are required at the schema level, not just validated in application logic. A user cannot register without the site supplying their acquisition source. `preconception` (whether the user is trying to conceive vs. already pregnant) classifies users into audience segments at registration time.

**Open babyname API**

`babyname(input: {ids: [Int!]!})` returns `id`, `name`, `gender`, `rank`, and `popularity.ssaRank[{rank, year}]` -- Social Security Administration name popularity rankings by year. No authentication required, no rate limiting observed.

**Security disclosure**: `security.txt` references `https://bugcrowd.com/ziffdavis-vdp-pro` -- a Ziff Davis vulnerability disclosure program on Bugcrowd. VDP only, no bounty.

---

## Machine Briefing

**Access & auth**

Most read queries work without cookies or auth headers. The GraphQL endpoint at `service.babycenter.com/graphql` accepts unauthenticated POST requests from curl or fetch. Auth-required queries (`users`, `updateUser`, `changePassword`) need a valid BabyCenter session -- obtainable via the `login` mutation. The CORS wildcard reflection means browser-based fetches from any origin with `credentials: 'include'` will send existing BabyCenter session cookies.

**Endpoints**

Open (no auth):
```bash
# Baby name lookup by ID(s)
curl -s -X POST https://service.babycenter.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ babyname(input: { ids: [1, 2, 3] }) { babyname { id name gender rank popularity { ssaRank { rank year } } } } }"}'

# Probe schema via error messages (introspection disabled but errors leak type info)
curl -s -X POST https://service.babycenter.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"{ nonexistentField }"}'
```

Auth mutations (session returned in response):
```bash
# Login
curl -s -X POST https://service.babycenter.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { login(email: \"user@example.com\", password: \"pass\") { screenName } }"}'

# Registration -- leadSource, siteSource, preconception required
curl -s -X POST https://service.babycenter.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { register(memberInfo: { member: [{ email: \"test@example.com\", leadSource: \"organic\", siteSource: \"babycenter.com\", preconception: false }] }) { screenName } }"}'
```

Tracking/infrastructure endpoints:
```bash
# Ziff Davis fingerprint state
curl -s "https://zdbb.net/check_c?eu_consent=&zd_opt_out=0"

# ZDBB session setup
curl -s "https://gurgle.zdbb.net/s_muid/babycenter.com/fp/0/pl/-1"

# Akamai geo enrichment -- check what location cookies come back
curl -sI "https://www.babycenter.com/" | grep -i geo
```

**Gotchas**
- `service.babycenter.com/graphql` returns 404-page HTML (not JSON) if the path is slightly wrong -- confirm `/graphql` exactly.
- Schema enumeration via error messages is slow -- Apollo returns one error per invalid field. Build incrementally.
- The `babyname` query uses `input: { ids: [...] }` wrapping, not direct arguments. `babyname(name: "Emma")` returns a schema error.
- `article(id: Int!)` exists but returns `NOT_FOUND` for most tested IDs -- article IDs may be non-sequential or require specific ranges.
- Geo cookies (`geoCity`, `geoZip`, etc.) reflect server IP geolocation when testing from a VPN or cloud server, not the end user's location.
- The CORS reflection requires `credentials: 'include'` in browser fetch -- curl does not trigger cookie-carrying cross-origin behavior.
- GTM container (`GTM-PKLTNHJ`) is 479KB and includes Taboola, YouTube, Google Ads conversion tags, and Consent Mode configuration.
