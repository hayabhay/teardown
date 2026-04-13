---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "What to Expect — Teardown"
url: "https://whattoexpect.com"
company: "What to Expect"
industry: "Healthcare"
description: "Pregnancy and parenting guidance platform owned by Everyday Health / Ziff Davis."
summary: "Server-rendered HTML delivered through Akamai CDN with AWS ALB behind it. A custom Snowplow tracker (v3.1.0) runs alongside Google Tag Manager, OneTrust CMP, and zdbb.net -- Ziff Davis's proprietary ad data network that assigns audience segments and syncs identity across properties. Full Prebid.js header bidding stack on article pages. Community and registry run on separate subdomains."
date: "2026-04-13"
time: "01:43"
contributor: "hayabhay"
model: "opus-4.6"
effort: "high"
stack:
  - Server-rendered HTML
  - Akamai CDN
  - AWS ALB
  - Snowplow
  - Google Tag Manager
  - Prebid.js
trackers:
  - Google Analytics 4
  - Google Ad Manager
  - Microsoft Clarity
  - Snowplow
  - LiveRamp
  - Comscore
  - AppsFlyer
  - Skimlinks
  - DoubleVerify
  - Yahoo UPS
  - Amazon Publisher Services
  - Magnite
  - The Trade Desk
  - Admiral
  - OneTrust
tags:
  - pregnancy
  - health-data
  - ad-tech
  - affiliate
  - identity-resolution
  - ccpa
  - consent
  - adblock-detection
  - reproductive-health
  - data-broker
headline: "WhatToExpect's due date calculator puts your result in the URL -- LiveRamp and Google Analytics receive it as routine pageview data."
findings:
  - "The due date calculator encodes results in the URL (/due-date-calculator/result/january-10/) and page title -- both flow as standard pageview metadata to every tracker on the page, broadcasting reproductive health data with no health-specific consent gate."
  - "LiveRamp fires three identity-resolution endpoints on every page despite usprivacy=1YYY -- an IAB CCPA string encoding opt-out of sale -- being set before any user touches the consent banner."
  - "Ziff Davis's ad network (zdbb.net) assigns 88 opaque audience segment IDs on a single homepage visit and pipes them directly to Google Ad Manager via setTargeting(), firing before targeting consent is granted."
  - "Two randomly-named domains (shallowart.com, zestyhorizon.com) serve Admiral's adblock-detection payloads using randomized POST paths, present on every page including pregnancy health calculators."
  - "All retailer recommendations on the baby registry page carry affiliate tracking via Impact.com (publisher 1442498) or Amazon Associates, presented under the framing of expert editorial guidance."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

WhatToExpect.com is the dominant pregnancy and parenting media property in the US, running week-by-week pregnancy guides, fertility calculators, community forums, a baby registry comparison tool, and product reviews. It is owned by Everyday Health Group, itself a Ziff Davis subsidiary. The site carries the licensed brand from What to Expect, LLC -- the franchise behind the bestselling book series. Trust is the product. The ad infrastructure underneath it is built accordingly.

---

## Architecture & Ownership

The site is server-rendered HTML delivered through Akamai CDN with AWS Application Load Balancer behind it. JavaScript is bundled (sublanding.bundle.js) rather than served as an SPA. Device detection (`x-device: desktop`) happens server-side; Akamai handles edge caching, though the homepage is marked `NotCacheable from child`. The SSL certificate is issued to `www.ziffdavis.com` (C=US; ST=New York; O=Ziff Davis LLC), confirming the corporate chain even before you look at any script or cookie.

Three main subdomains:
- `www.whattoexpect.com` -- main editorial site
- `community.whattoexpect.com` -- discussion forums
- `registry.whattoexpect.com` -- baby registry comparison tool

Cookies on the `.whattoexpect.com` domain are shared across all three.

The robots.txt opens with a legal preamble explicitly prohibiting AI training use and RAG retrieval, then blocks 100+ named AI user agents including anthropic-ai, ClaudeBot, ChatGPT-User, GPTBot, PerplexityBot, DeepSeek, Manus, NovaAct, and Meta's Facebookbot. Disallowed paths include `/api/search/` and `/baby-pictures/` but notably not `/due-date-calculator/` result pages.

---

## The Ziff Davis Identity Network (zdbb.net)

The backbone of the tracking infrastructure is a Ziff Davis proprietary ad data network served through `zdbb.net`, with additional subdomains at `gurgle.zdbb.net` and `jogger.zdbb.net`.

On every page load, the zdbb script:
1. Calls `zdbb.net/check_c` -- a public, unauthenticated endpoint -- to assign or retrieve a persistent tracking ID
2. Loads audience segment data from the zdbb backend
3. Pushes segments to GTM via `dataLayer.push({pValues: zd.core.pageData.pageSegments, event: "pValues"})`
4. Calls `googletag.pubads().setTargeting("segments", zd.core.userData.userSegments)` to inject them into Google Ad Manager programmatic auctions

On a single homepage visit, this process pushed **88 opaque segment IDs** to the dataLayer -- IDs like `900111`, `900624`, `900115`, `800284`, `6848`, `6850`, `8001`, `1100699`. These are Ziff Davis's audience cohort identifiers. Given the site is a dedicated pregnancy platform, cohorts like "trying to conceive," "pregnant," "IVF," and "new parent" are standard inventory for health media ad networks. These segments are what advertisers targeting maternity, infant formula, and parenting products bid on.

The zdbb script checks `zd.core.pageData.rootDomain` -- same script architecture runs across other Ziff Davis properties (Mashable, etc.), enabling cross-site audience building.

**zpack cookie** -- set on all subdomain requests -- is a base64-encoded identity bundle readable by the zdbb.net network:
```json
{
  "zdbb": "36dd5116e0c0429ea5f4f86b7d588e40",
  "fpid": null,
  "ppid": "36dd5116e0c0429ea5f4f86b7d588e40",
  "ue_m2s": "",
  "lcl_id": "",
  "loc": "https://www.whattoexpect.com/",
  "pv_id": "2b81ad92-fd6d-46bf-a4cd-16f03782eaee",
  "sess_id": "8e6a53be-eab6-4bde-8750-d93e1c4c5b0e"
}
```

The `zdbb` ID is the persistent fingerprint. `ppid` (publisher partner ID) matches it exactly on first visit. The `/set_fpid/whattoexpect.com/c/{zdbb_id}` first-party endpoint then links this zdbb fingerprint to the custom Snowplow tracker's first-party ID, stitching together the ad network identity and the behavioral analytics identity under one roof.

`zdbb.net/check_c` -- callable without authentication:
```json
{
  "zdbb": "d683e0b399e54993a24968d5183a7918",
  "eu": false,
  "country": "US",
  "have_eu_consent": false,
  "zd_opt_out": ""
}
```

Note: `zd_opt_out` returns an empty string here. The browser had `usprivacy=1YYY` set (CCPA opt-out of sale) at this point. The Ziff Davis ad network's own opt-out check does not reflect the CCPA string in its response.

---

## The Due Date Data Flow

The due date calculator at `/due-date-calculator/` accepts: last menstrual period date, cycle length, conception date, IVF transfer date, or ultrasound date. When you submit, it routes you to a result page with this URL structure:

```
/due-date-calculator/result/january-10/
```

The page title is: `Your Baby's Due Date is January 10`

Both the URL and the title are transmitted as standard pageview metadata in every tracking beacon that fires on the result page. This is how web analytics works -- every GA4 `POST /g/collect`, every Snowplow `POST /tp2`, every Microsoft Clarity `POST /collect` sends the current document URL and document title as part of the payload. No special exfiltration is required; it happens automatically. The trackers confirmed firing on the due date result page include:
- `www.google-analytics.com/g/collect` (Google Analytics 4, measurement ID G-26LLVSCNH1)
- `/com.snowplowanalytics.snowplow/tp2` (WTE custom Snowplow, first-party endpoint)
- `rp.liadm.com/j` and `rp4.liadm.com/j` (LiveRamp identity endpoints)
- `shallowart.com` (Admiral cloaked adblock detection)

A due date is derived from conception or last menstrual period -- reproductive health data. No consent gate or health-specific disclosure is presented before the calculator runs. The result is publicly visible in the URL structure.

There's a second layer: the GTM dataLayer on the due date result page includes `contentidentifier: "Menstrual Cycle,Ivf,Ultrasounds And Scans,Due Date"` -- editorial category tags pushed to the tag manager environment before any user consent interaction. Separately, a `form_impression` event fires with `form_topic="duedatecalculator"` and `form_page_type="Due Date Calculator"`, categorizing the visitor as a pregnancy tool user in the dataLayer before the consent banner has been interacted with.

The ovulation calculator (`/ovulation-calculator/`) takes the same approach -- last menstrual period date and cycle length fed into a form, result surfaced on a dated URL.

---

## CCPA Opt-Out vs. LiveRamp Reality

The site sets `usprivacy=1YYY` as a cookie before any user interaction. Under the IAB CCPA privacy string specification:
- Position 1: `1` -- spec version 1
- Position 2: `Y` -- explicit notice given
- Position 3: `Y` -- user has opted out of sale
- Position 4: `Y` -- LSPA signatory agreement

Position 3 = `Y` means the user has opted out of the sale of their data under CCPA. Despite this, LiveRamp fires on every page via three separate endpoints:
- `rp.liadm.com/j` -> 302 redirect
- `rp4.liadm.com/j` -> 200
- `idx.liadm.com/idex/did-0001/any` -> 204 (homepage)
- `idx.liadm.com/idex/prebid/15384` -> 204 (article and other pages)

LiveRamp is a data broker whose core product is identity resolution -- matching visitor identities across publishers and advertisers for audience targeting and data monetization. Its presence on article pages, registry pages, and calculator pages is consistent across all network logs captured. The `_lc2_fpi`, `_awl`, and `lrswap` cookies it sets are all present before any consent banner interaction.

The `opt_out=1` cookie is also present in the browser alongside `usprivacy=1YYY`, but neither appears to gate LiveRamp's network activity.

---

## Pre-Consent Cookie Inventory

The following cookies are set before the consent banner is displayed or interacted with (interactionCount=0 confirmed in OptanonConsent):

| Cookie | Vendor | Purpose |
|--------|--------|---------|
| `AWSALBTG` / `AWSALBTGCORS` | AWS | Load balancer sticky session |
| `leadsrc=%7B%7D` | Ziff Davis | Lead source attribution |
| `geoCC`, `geoRegion`, `geoDMA`, `geoCity`, `geoZip` | Server-side IP lookup | IP geolocation (expires 2038) |
| `zd_session_id` | Ziff Davis | Session tracking |
| `_li_dcdm_c`, `_lc2_fpi`, `_lc2_fpi_js` | LiveRamp | Identity resolution |
| `wtesp_ses.11df`, `wtesp_id.11df` | Snowplow (WTE custom) | Session + persistent user ID |
| `h_zdbb` | zdbb.net | Ziff Davis ad network fingerprint |
| `zpack` | zdbb.net | Cross-subdomain identity bundle |
| `usprivacy=1YYY` | IAB CCPA | Opt-out string (pre-set) |
| `opt_out=1` | Site | Opt-out flag (pre-set) |
| `_awl`, `lrswap` | LiveRamp | Identity swap and direct |
| `_scor_uid` | Comscore | Audience measurement user ID |

The OneTrust OptanonConsent cookie (interactionCount=0) shows: C0001=1 (Strictly Necessary, on), C0003=1 (Functional, on by default), C0002=0 (Performance, off), C0004=0 (Targeting, off). The Functional category being enabled by default without user action is the mechanism through which Snowplow and certain Ziff Davis infrastructure fire before consent is granted.

**Geolocation cookies**: `geoZip=94540-94545+94557` is a zip code range -- neighborhood-level precision derived from IP. Expiry is `2038-12-31`. Domain is `.whattoexpect.com` (all subdomains). These cookies are set on every request across www, community, and registry subdomains. zdbb.net's ad targeting infrastructure reads this location data for local advertising auctions.

---

## Anti-Adblock Infrastructure

Two domains serve Admiral's adblock detection and recovery payloads:
- `shallowart.com` -- receives `POST /h1qru6t9pm3j2x2krrhy720akqbvmbrtj85snnjgkx` (twice per page load)
- `zestyhorizon.com` -- loaded as a script

Both serve from `server: hoothoot/2438300242`, the same server fingerprint -- consistent with Admiral's known practice of rotating through randomly-named domains to evade browser-based tracker blocklists. The POST endpoint path is also randomized (a hash string), which defeats path-based blocking rules. Admiral's product is "ad experience recovery" -- detecting users with ad blockers and serving ads through unblockable channels.

This infrastructure fires on every page captured in evidence: homepage, article pages, due date calculator, registry. It is present even on pages where users are seeking pregnancy health guidance.

`tagan.adlightning.com/wte/` also loads three scripts (bl-*, b-*, op.js) -- Ad Lightning is a separate adblock detection and ad quality verification vendor.

---

## Programmatic Ad Stack

Article pages run a full header bidding auction before serving ads. Bidders confirmed in network logs:

| Bidder | Endpoint | Status |
|--------|----------|--------|
| Magnite/Rubicon | `prebid-server.rubiconproject.com/openrtb2/auction` | 200 |
| Index Exchange (Casale) | `htlb.casalemedia.com/openrtb/pbjs` | 200 |
| TripleLift | `tlx.3lift.com/header/auction` | 200 |
| Ozone Project | `elb.the-ozone-project.com/openrtb2/auction` | 200 |
| OptiDigital | `pbs.optidigital.com/bidder` | 204 |
| Cootlogix | `prebid.cootlogix.com/prebid/multi/6703fa90a2030208727d15e2` | 204 |
| Amazon Publisher Services | `aax.amazon-adsystem.com/e/dtb/bid` | 200 |
| The Trade Desk | `direct.adsrvr.org/bid/bidder/everydayhealth` | 200 |

The Trade Desk entry is notable: the account path is `/bid/bidder/everydayhealth`, not `/bid/bidder/whattoexpect`. WhatToExpect.com's programmatic ad revenue flows through Everyday Health Group's Trade Desk seat -- shared ad infrastructure across Ziff Davis's health media portfolio. This also means The Trade Desk's audience data for Everyday Health Group includes whattoexpect.com traffic.

Magnite publisher ID is `13346`, used consistently across all pages for floor pricing (`ads.rubiconproject.com/floors/13346-pbjs-floors.json`).

Additional ad verification and sync layers:
- `pub.doubleverify.com` -- DoubleVerify ad fraud signals (3 endpoints: ids, bsc, vlp), fires on every page
- `ups.analytics.yahoo.com` -- Yahoo UPS identity sync (two pixel IDs: 58917 for CMS, 58292 for sync)
- `ums.acuityplatform.com/tum` -- Acuity identity platform
- `cm-mx.advolve.io/pixel` -- Advolve pixel
- `sync.bfmio.com/sync` -- Beachfront Media ID sync
- `check.analytics.rlcdn.com/check/1270` -- LiveRamp analytics check endpoint
- `prebid.a-mo.net/cchain` -- Adnami cookie chain (8 requests on article pages)

JWPlayer is embedded for video content (playlist ID `DkXVmqnI`, media ID `79K9Sarr`). The playlist API is public:
```
GET cdn.jwplayer.com/v2/playlists/DkXVmqnI
```
Returns full video metadata including editorial tags: `evergreen,expert,Fetal-Development,Do-Not-Promote,First-Trimester`. The `Do-Not-Promote` tag is a CMS editorial flag visible in the public playlist response.

---

## Registry: The Affiliate Architecture

`registry.whattoexpect.com` presents itself as editorial guidance -- "Your Guide to the Perfect Baby Registry" -- ranking Target, Babylist, Amazon, Joy, Pottery Barn Kids, Walmart, and Crate & Barrel. Every "Claim my freebies" and "Register" outbound link carries affiliate tracking:

- **Target**: `goto.target.com/c/1442498/...` -- Impact.com publisher 1442498 (Ziff Davis)
- **Walmart**: `goto.walmart.com/c/1442498/...` -- same Impact.com publisher
- **Joy**: Impact.com publisher 1442498
- **Amazon**: Amazon Associates tag `wte-babyreg-na-na-jul-07012021-na-rmlandcar-20`
- **Babylist, Pottery Barn Kids, Crate & Barrel**: separate affiliate programs

Attribution parameter `subId1=wte_rm_na` is consistent across all Impact.com links -- decoded as "WTE Registry Module, North America."

The affiliate disclosure ("We may earn commissions from these links") exists on the page but appears below the primary CTA. The registry ranking presented by the most-trusted pregnancy brand directly shapes which retailer captures the new parent's purchase journey, with commission incentive attached to each recommendation.

An unauthenticated API endpoint fires on registry page load:
```
GET /baby-registry/api/dashboard/log-unknown-bounty-tag
-> 200 OK: "true"
```

The name "log-unknown-bounty-tag" suggests it's logging an unrecognized affiliate attribution parameter. The endpoint returns `true` without authentication.

Skimlinks (`m.skimresources.com`, `s.skimresources.com/js/104425X1561157.skimlinks.js`, publisher 104425X1561157) is also loaded -- this automatically converts eligible non-affiliate links sitewide into affiliate links, adding a second layer of affiliate monetization on top of the explicit registry affiliate links.

---

## AI Search Tool

The "Ask What to Expect" AI search tool (in beta) is embedded on the site. The privacy policy states: "the AI Search Assistant collects and stores input and output text, which may be reviewed to improve its accuracy." The tool presents an in-product warning advising users not to share "personal, sensitive, or health information."

This is a notable admission on a pregnancy health platform where users arrive specifically to ask about pregnancy symptoms, miscarriage, fertility treatments, and infant health. The AI tool is positioned as an expert resource; the data retention disclosure and the advice against sharing health information appear in small print. "May be reviewed to improve accuracy" means human review of user queries is within scope.

---

## Machine Briefing

### Access & Auth
Most content is accessible without authentication. The Snowplow tracker endpoint is first-party (on whattoexpect.com domain), making it resistant to third-party blocking. Community forums and personal dashboards require login. The baby registry comparison page is public. `curl` or `fetch` with a standard UA (not a blocked AI bot) is sufficient for content access.

### Endpoints

**Open -- no auth required**

```bash
# Ziff Davis tracking ID assignment / opt-out check
GET https://zdbb.net/check_c
# Returns: {"zdbb":"<id>","eu":false,"country":"US","have_eu_consent":false,"zd_opt_out":""}

# Link zdbb fingerprint to Snowplow first-party ID
GET https://www.whattoexpect.com/set_fpid/whattoexpect.com/c/<zdbb_id>

# Due date calculator result (date in slug)
GET https://www.whattoexpect.com/due-date-calculator/result/january-10/

# Due date calculator (input form)
GET https://www.whattoexpect.com/due-date-calculator/

# Registry affiliate link logging
GET https://www.whattoexpect.com/baby-registry/api/dashboard/log-unknown-bounty-tag
# Returns: "true"

# JWPlayer public playlist
GET https://cdn.jwplayer.com/v2/playlists/DkXVmqnI
# Returns: full playlist JSON with video metadata and editorial tags

# JWPlayer video media
GET https://cdn.jwplayer.com/v2/media/79K9Sarr
# Returns: video metadata, media sources, subtitle tracks

# Rubicon/Magnite floor pricing (publisher 13346)
GET https://ads.rubiconproject.com/floors/13346-pbjs-floors.json

# OneTrust consent configuration (consent group ID)
GET https://cdn.cookielaw.org/consent/f589c90b-1099-48d7-9ef3-7506affae7b6/f589c90b-10...
```

**Inferred -- internal, pattern-discovered**

```bash
# Snowplow event collection (first-party, not third-party blocked)
POST https://www.whattoexpect.com/com.snowplowanalytics.snowplow/tp2

# zdbb geo/segment info
GET https://gurgle.zdbb.net/info
GET https://gurgle.zdbb.net/s_muid/whattoexpect.com/fp/0/pl/-1
GET https://jogger.zdbb.net/check
POST https://jogger.zdbb.net/receive_uint8

# zdbb opt-out clear
POST https://zdbb.net/clear_c
POST https://www.whattoexpect.com/clear_fpid/whattoexpect.com
POST https://www.whattoexpect.com/clear_uids/whattoexpect.com
```

### Gotchas

- `/api/search/` is disallowed in robots.txt and returns 404 -- blocked path.
- `geoCC`, `geoRegion`, `geoDMA`, `geoCity`, `geoZip` cookies are set server-side on every request; downstream ad calls read these for geo targeting without any JS involvement.
- The `zpack` cookie is base64-encoded JSON -- decode with `atob()` or `base64 -d` to read the zdbb fingerprint and session state.
- The due date result slug uses month-name + day format (`/result/january-10/`), not ISO date -- the site maps this back to a year based on session context.
- JWPlayer playlist and media IDs are embedded in the page HTML -- `DkXVmqnI` (playlist), media IDs vary by article. Use the article page source to find media IDs for specific content.
- The Trade Desk bid URL is `/bid/bidder/everydayhealth` -- requests to this endpoint require a valid Prebid SSP integration; not publicly queryable.
- Admiral's cloaked domains (shallowart.com, zestyhorizon.com) rotate -- the specific domain names and POST paths may change. The `server: hoothoot/` header fingerprint remains consistent.
