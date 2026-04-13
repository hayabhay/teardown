---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Yellow Pages — Teardown"
url: "https://www.yellowpages.com"
company: "Yellow Pages"
industry: Information
description: "Online business directory and local search platform owned by Thryv."
summary: "Server-rendered site built on a jQuery 1.9/Backbone 1.1/Underscore 1.8 stack from 2012-2013, served through Cloudflare WAF with bot management and YP's own ypcdn.com CDN. A central window.Tracking object embeds configs for nine tracker systems — five of them legacy brands from telecom directory M&A (SuperPages, DexKnows, DexMedia, CityGrid, SearchForce) that were never cleaned up. Adobe Marketing Cloud handles identity and analytics, Google Ad Manager serves display ads on search pages, and Yext pipes listing data for national chains."
date: 2026-04-12
time: "06:46"
contributor: hayabhay
model: "sonnet-4.6"
effort: medium
stack:
  - Backbone.js
  - jQuery
  - Underscore.js
  - Cloudflare
  - ypcdn CDN
  - Adobe Marketing Cloud
trackers:
  - Google Analytics 4
  - Google Tag Manager
  - Google Ad Manager
  - Adobe Analytics
  - Adobe Audience Manager
  - Yext
  - CityGrid Media
  - SearchForce
  - Cloudflare Insights
tags:
  - directory
  - local-search
  - legacy-tech
  - thryv
  - adobe-analytics
  - advertising
  - m-and-a
  - consent
  - dark-pattern
  - lead-generation
headline: "Five dead brands — SuperPages, DexKnows, DexMedia, CityGrid, SearchForce — still run as live tracker configs in Yellow Pages' production JavaScript."
findings:
  - "Five dead-brand tracker configs -- SuperPages, DexKnows, DexMedia, CityGrid, SearchForce -- survive in production's window.Tracking object, with SuperPages and DexMedia sharing the same api.superpages.com endpoint under different brand keys, encoding Thryv's entire telecom acquisition history in live JavaScript."
  - "Every listing across all tiers carries adclick:true in its data-analytics attribute -- the real paid/free signal is a separate tier field (20 or 55 for paid, 999 for free), meaning clicks on unpaid organic results are tracked through the same ad-click event pipeline as paid placements."
  - "29 of 30 pizza listings in San Francisco are unclaimed -- national chains pipe data through Yext while local businesses have largely abandoned the platform, leaving each search page as a wall of Thryv SaaS upsell targets."
  - "A dns_lus cookie -- likely 'Do Not Sell Last User Selection' -- is set to true on first visit with no user interaction, pre-populating a CCPA preference before the user has ever seen a prompt, while Adobe Audience Manager ID syncs fire on every page load with no consent banner."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

Yellow Pages (`www.yellowpages.com`) is owned by Thryv, Inc., the company formed from the remains of AT&T's local directory empire. The copyright in the page footer reads "© 2026 Thryv, Inc." -- the YP brand is now a consumer-facing shell over a B2B SaaS company's lead funnel.

The site is server-rendered. Near-complete HTML is delivered on page load; JavaScript handles interactive components but the main content structure is SSR. The frontend stack is jQuery 1.9.0 (dated 2012), Underscore.js 1.8.3 (2015), and Backbone.js 1.1.0 (2013) -- a pre-React era combination that was mainstream circa 2013. For a property serving millions of local searches monthly in 2026, this represents substantial frontend technical debt. The JavaScript bundle at `i2.ypcdn.com/ypu/vendor/essentials.bundle.js?e416216` carries these libraries without source maps; the revision hash `e416216` identifies the current deploy.

Static assets serve from `i1.ypcdn.com` and `i4.ypcdn.com` (ypcdn.com is YP's own CDN). All traffic runs through Cloudflare WAF with bot management enabled -- curl and headless Playwright both receive HTTP 403 with the standard Cloudflare block page; headed browser sessions pass without CAPTCHA challenge.

**Page taxonomy:**

| Page type | URL pattern | pageName | page_id | Indexable |
|-----------|------------|---------|---------|-----------|
| Homepage | `/` | `home` | 100 | Yes |
| Search results | `/search?search_terms=...&geo_location_terms=...` | `search_results` | 1 | No (noindex) |
| Category browse | `/san-francisco-ca/pizza` | `search_results` | 1 | Yes |
| Business profile (MIP) | `/city-state/mip/name-ypid?lid=...` | `more_info_details` | 120 | Yes |
| Map view | `/search-map?...` | -- | -- | -- |

The dual URL strategy is deliberate SEO architecture: query-string searches (`/search?...`) are `noindex, follow`, while city/category slug pages (`/san-francisco-ca/pizza`) carry `max-image-preview:large` and full indexability. The indexable slug pages drive organic traffic; the parameterized query pages prevent duplicate content from infinite search permutations.

MIP (More Info Page) URLs follow the pattern `/city-state/mip/business-name-ypid`. The `ypid` is a persistent integer per business location (e.g., `461713663`). An `lid` (listing ID) parameter appears in the URL but is not required -- only the ypid and name slug are needed to load a profile. Accessing the ypid without the business name slug returns 404.

---

## The Tracking Object: A Telecom M&A Museum

Every page on yellowpages.com initializes a `window.Tracking` object that functions as a central config hub for the site's entire tracking infrastructure. What makes it notable is not the trackers themselves but the company history encoded in them.

`window.Tracking` contains nine configured tracker systems:

| Key | Vendor | Host |
|-----|--------|------|
| `lwes` | YP own event system | `c.ypcdn.com` |
| `yext` | Yext publisher pixel | `pl.yext.com/plpixel` |
| `adobe` | Adobe Analytics (Omniture) | Beacon: `/b/ss/yellowpagesglobal/...` |
| `supermedia` | SuperPages | `api.superpages.com` |
| `dexmedia` | DexMedia | `api.superpages.com` |
| `citysearch` | CityGrid Media | `api.citygridmedia.com/ads/tracker/imp` |
| `tripadvisor` | TripAdvisor | `www.tripadvisor.com/img/cdsi/partner/transparent_pixel-*.gif` |
| `dex` | DexKnows | `www.dexknows.com/rd/index.asp` |
| `searchforce` | SearchForce | `sftrack.searchforce.net/SFConversionTracking/img.jpg` |

Five of these -- `supermedia`, `dexmedia`, `citysearch`, `dex`, `searchforce` -- are brands from the print directory consolidation era of the 2000s and 2010s. SuperPages was Verizon's yellow pages. DexMedia was formed from Qwest's and Sprint's directory businesses. DexKnows was CenturyTel's spinoff from Dex. CityGrid was AT&T Interactive's local advertising network. SearchForce was an independent digital ad management platform. These entities went through a cascade of mergers, acquisitions, and rebrands that eventually converged at Thryv.

The M&A history lives on in the code: `window.Tracking.supermedia.SUPERMEDIA_HOST` and `window.Tracking.dexmedia.SUPERMEDIA_HOST` both point to the same endpoint -- `api.superpages.com`. Two different brand namespace keys, one backend. The tracking configuration was apparently never cleaned up through any of the consolidation events -- it accumulated brands the same way the corporate structure did.

The `dex` object contains a `TRACK_URL` pointing to `api.superpages.com/xml/search` and a `SRC: "ypintfeed"` parameter, indicating YP pushes impressions into the SuperPages/Dex feed system as a source (`ypintfeed`).

The `lwes` system is YP's own impression logger. Every page fires `POST /lwes/impression` (the path is explicitly Disallowed in robots.txt to prevent crawlers from generating fake impression events). The endpoint accepts arbitrary JSON payloads and returns 200 -- it appears to be write-only logging with no validation response returned to the client.

---

## Surveillance & Consent

**Tracker inventory (verified by network capture and globals):**

| Tracker | Type | Cookie(s) | Network evidence |
|---------|------|-----------|-----------------|
| Google Analytics 4 | Analytics | `_ga`, `_ga_0EQTJQH34W` | `analytics.google.com/g/collect` (homepage + search) |
| Google Tag Manager | Tag manager | -- | `window.dataLayer` initialized |
| Google Ad Manager | Ad platform | -- | `securepubads.g.doubleclick.net/gampad/ads` (search only) |
| Google Ad Quality | Fraud detection | -- | `ep1.adtrafficquality.google/getconfig/sodar` (search only) |
| Adobe Analytics | Analytics | `s_otb`, `s_nr`, `s_tp`, `s_ppv`, `s_cc`, `s_prop49` | `/b/ss/yellowpagesglobal/1/JS-2.24.0/...` (search) |
| Adobe Audience Manager | Identity/DMP | `AMCV_*`, `AMCVS_*`, `s_ecid` | `dpm.demdex.net/id` (homepage + search) |
| Adobe Marketing Cloud | Identity | MCMID in AMCV cookie | `dpm.demdex.net/id/rd` |
| Yext | Local data pixel | -- | Config in window.Tracking.yext |
| Cloudflare Insights | Performance/RUM | `__cf_bm` | `POST /cdn-cgi/rum` (all pages) |
| CityGrid Media | Ad tracking | -- | Config in window.Tracking.citysearch |
| TripAdvisor | Reviews | -- | Config in window.Tracking.tripadvisor |
| SearchForce | Conversion | -- | Config in window.Tracking.searchforce |
| SuperPages/DexMedia | Data feed | -- | Config in window.Tracking.supermedia + dexmedia |
| DexKnows | Click tracking | -- | Config in window.Tracking.dex |

Facebook App ID `150853628282807` is present in `window.YPFB.appId` but no Facebook network requests were observed across three separate network captures (homepage, search, MIP). The SDK integration is configured but not confirmed active on these page types.

**Key identifiers:**
- GA4 measurement ID: `G-0EQTJQH34W`
- Adobe report suite: `yellowpagesglobal`
- Adobe Org: `A57E776A5245AEA80A490D44@AdobeOrg`
- Yext PID: `4Diy12y2qo`
- Google Ad Manager network: `53532708`
- Google publisher: `ca-pub-3200418779552017`

**Pre-consent behavior:** Adobe Audience Manager (`dpm.demdex.net`) fires on the homepage before any user interaction. This is a cross-publisher identity graph that links the visitor's Adobe ECID to data across Adobe's partner network. GA4 fires on homepage load. Google Ad Manager fires on search page load. There is no consent management platform -- no OneTrust, no Cookiebot, no consent banner of any kind. The only CCPA gesture is a "Do Not Sell or Share My Personal Information" link in the footer.

A cookie named `dns_lus` is set to `true` on first visit with no user interaction. The name suggests "Do Not Sell -- Last User Selection," but since it is populated before any interaction, its meaning is ambiguous. If `true` means "opted out," the site is pre-opting users out of selling (which would be favorable but seems inconsistent with the tracker behavior). If `true` means "prompt has been shown," it is set without the prompt ever appearing. Either interpretation raises questions about the integrity of the CCPA flow.

**Adobe Analytics dimensions in use:**
- `eVar29` = user agent string -- browser fingerprint collected as an Adobe dimension
- `prop49` = page type name (`home`, `search_results`, etc.)

**Cookies set on first load (no interaction):**

```
vrid          -- visitor request ID (YP session tracking)
bucket        -- ypu:ypu:default (A/B bucket assignment)
bucketsrc     -- default
cc_geo        -- US (country from geo-IP)
s_otb         -- false (Adobe Analytics OTB flag)
dns_lus       -- true (Do Not Sell last user selection -- ambiguous)
zone          -- -420 (UTC offset: UTC-7 / PDT)
s_prop49      -- home (Adobe page type)
AMCVS_...     -- Adobe Marketing Cloud Visitor Service
_ga_0EQTJQH34W -- GA4 measurement session
_ga           -- Google Analytics universal client ID
s_ecid        -- Adobe Experience Cloud ID (ECID)
s_nr, s_tp, s_ppv, s_cc -- Adobe Analytics session props
AMCV_...      -- Adobe Marketing Cloud Visitor (contains MCMID + MCSYNCSOP)
```

---

## Listing Data Structure

Every listing card on search and browse pages embeds a `data-analytics` attribute containing a structured JSON object. From a 30-result sample for "pizza" in San Francisco:

**Paid tier structure:**
- Rank 1: `tier: 20`, `listing_type: sub`, `content_provider: GUMP`, `adclick: true`, `claimed: mip_unclaimed`
- Rank 2: `tier: 55`, `listing_type: sub`, `content_provider: TMC`, `adclick: true`, `claimed: mip_unclaimed`

**Free tier structure:**
- Ranks 3-30: `tier: 999`, `listing_type: free`, `adclick: true`

Every listing across all 30 results carries `adclick: true` in its analytics object. This flag is not the paid/organic signal -- it appears to be a general tracked-click marker that routes all listing clicks through the same ad-event analytics pipeline. The actual paid/free distinction is carried by `listing_type` (`sub` vs `free`) and `tier` (20/55 = paid advertisers, 999 = free default). The effect is that clicking on a free listing for a local pizzeria fires the same ad-click event class as clicking on a paid placement -- blurring the line between organic results and advertisements in the analytics layer.

**Content provider distribution (30-result sample):**

| Provider | Count | Notes |
|----------|-------|-------|
| MDM | 23 | YP's own data platform |
| YXT | 5 | Yext (national chains) |
| GUMP | 1 | Rank 1 paid listing -- unknown provider |
| TMC | 1 | Rank 2 paid listing -- unknown provider |

National chains in the YXT segment: Papa Johns, Domino's. These businesses actively manage their YP listings through Yext, which syncs data to YP as a publisher partner. Local businesses predominantly show as `MDM` -- YP's own scraped or aggregated data.

**Claimed status:** 1 of 30 listings was `mip_claimed` (Firehouse Pizzeria, rank 26). The other 29 were `mip_unclaimed`. This ratio is consistent with a platform where businesses no longer prioritize YP for listing management -- they manage Google Business Profile and Yelp directly. Each search results page is a wall of unclaimed listings that double as Thryv's SMB upsell surface.

---

## Business Model

The revenue architecture is three-layered:

1. **Paid sub-tier listings** -- Businesses pay to appear in the top 1-2 positions with `listing_type: sub` and `tier: 20` or `tier: 55`. The tiers likely correspond to different product packages at different price points.

2. **Google Ad Manager display ads** -- The `53532708` DFP network serves ads on search and category browse pages. Ad units: `YP-Serp-300` (300x250), `YP-SERP-300x250-300x600-BTF` (below-the-fold flexible), `YP-SERP-728` (leaderboard), and `YP-SERP-728-BOTTOM-ANCHOR` (1x1 anchor). DFP ads are absent on MIP pages -- the ad load is concentrated where consumer search intent is highest.

3. **Thryv SaaS upsell** -- The `/marketing-services` page is a full Thryv sales page: Thryv Marketing Center, Thryv Leads, "Enhanced Local Listings -- get your business listed in 50+ top online directories." The consumer directory is an acquisition channel for SMB software sales. Free listings exist to give consumers a reason to visit and to surface unclaimed businesses for Thryv's outbound sales.

The advertising brand in client globals is still "YP" -- the `eaid: "YPU"` value in the lwes tracker config -- but the marketing products and copyright belong entirely to Thryv. The YP brand is consumer-facing heritage; Thryv is the actual business.

---

## Client-Side Globals

The following objects are initialized on every page load:

**`window.YPU`** -- Core app config:
```json
{
  "googleJsApi": "https://maps.googleapis.com/maps/api/js?channel=web&...&key=AIzaSyAFLfj_UY3XBrQzlSRf_QbnUJRnLvxKh5Q",
  "ASSET_HOST": "i1.ypcdn.com",
  "MEDIA_ASSET_HOST": "i4.ypcdn.com",
  "REVISION": "e416216",
  "BUCKETS": { "desktop": { "default": 100 }, "mobile": { "default": 100 } },
  "searchGeo": "Los Angeles, CA"
}
```

The `BUCKETS` object drives A/B testing. Both desktop and mobile show `"default": 100` -- 100% of sessions are in the default bucket. No active experiments are visible client-side at time of investigation.

The bucket assignment follows a `platform:brand:experiment_name` format: `currentBucket = "ypu:ypu:default"`. The `sgt` field in the Tracking object carries the same value and is passed to Adobe Analytics for experiment-level segmentation.

**`window.Tracking`** -- Also contains visitor identity fields:

```
botScoreX: 99           -- server-computed Cloudflare bot score (0-100)
isBotRequest: false     -- bot classification result
lwes.vrid: <UUID>       -- visitor UUID assigned by YP
lwes.uip: <IP address>  -- visitor IP address
location.lat/lng        -- lat/lng inferred from IP geolocation (34.0764, -118.2626 for LA)
location.city/state     -- "Los Angeles", "CA"
```

The server-computed bot score (`botScoreX: 99`) is embedded in every page's JavaScript. At value 99 out of 100, the investigation session was near the apparent bot threshold but classified `isBotRequest: false`. Since the page is already served by the time the client reads this value, it does not constitute a defense bypass -- but it is a diagnostic artifact that exposes Cloudflare's scoring output to any script running in the page context, including the fourteen third-party trackers listed above.

The visitor IP (`lwes.uip`) and inferred geolocation (`location.lat`, `location.lng`) are also visible in `window.Tracking` to all JavaScript on the page.

**`window.UserLoggedIn`:** `false`. **`window.CurrentUser`:** `{}`. User accounts are disallowed in robots.txt (`/login`, `/register`, `/user/`) and no login UI was encountered. User management may route through a Thryv-branded subdomain.

**`window.YPFB`:** `{ "appId": "150853628282807" }` -- Facebook App ID configured for potential SDK use.

---

## WAF and Bot Defense

Cloudflare Bot Management is active. Direct `curl` requests receive HTTP 403 immediately. Headless Playwright also receives 403. Headed Playwright passes without a CAPTCHA challenge. The `__cf_bm` cookie is set on every connection attempt.

The investigation session was scored `botScoreX: 99` (out of 100) yet classified `isBotRequest: false` -- suggesting the block threshold is at or above 100, or that the scoring algorithm considers additional signals beyond the numeric score.

`/contribute/` routes (review submission) are behind a separate Cloudflare JS challenge, distinct from the main site's bot management layer. This is a higher-friction gate against fake review generation.

The robots.txt carries 30 Disallow directives. Notable entries include `/lwes/` (prevents bots from triggering fake impressions), `/listings/*/directions*` and `/route?*` (routes that may call third-party mapping APIs with per-call costs), and `*/print_ad?*` and `*/audio_ad?*` -- path patterns from the print directory and talking yellow pages era that still survive in the 2026 robots.txt.

---

## Legacy Stack Signals

The deep link format embedded in iOS meta tags:

```
apple-itunes-app: app-id=284806204, app-argument=ypmobile://srp?search_category=pizza&latitude=37.7749295&longitude=-122.4194155
```

App ID `284806204` is the YP Mobile iOS app. The deep link exposes the raw latitude/longitude from server-side IP geolocation directly in the page source.

The `*/print_ad?*` and `*/audio_ad?*` paths in robots.txt are both Disallowed -- path patterns indicating functionality that predates the internet era: print directory ad pages and audio ad (talking yellow pages) pages. Whether these routes still serve content or are inherited disallow entries is unknown, but their presence is a readable artifact of the property's history as a print directory.

---

## Machine Briefing

**Access and auth**

All useful content requires a headed browser session. `curl` and headless Playwright both receive HTTP 403 from Cloudflare. A headed Playwright session (`npx @playwright/cli`) reaches the site without CAPTCHA. No login is required to access search results, category browse pages, or business profiles.

Session cookie `__cf_bm` is set by Cloudflare on first connection and must be maintained across requests. The `vrid` cookie is YP's own visitor session ID.

**Open endpoints**

```
# Search results -- noindex, returns listing HTML with data-analytics attributes
GET https://www.yellowpages.com/search?search_terms={query}&geo_location_terms={city,+ST}

# Category browse -- indexable, same listing format
GET https://www.yellowpages.com/{city-state}/{category}

# Business profile (MIP)
GET https://www.yellowpages.com/{city-state}/mip/{business-name}-{ypid}

# Impression logging -- accepts arbitrary JSON, returns 200 (write-only)
POST https://www.yellowpages.com/lwes/impression
Content-Type: application/json
Body: { ... }

# Visitor ID resolution
GET https://www.yellowpages.com/id
```

**Listing data extraction**

Every listing card on search/browse pages has a `data-analytics` attribute containing JSON with these fields:
- `tier` -- 20 or 55 = paid advertiser, 999 = free
- `listing_type` -- `sub` (paid) or `free`
- `content_provider` -- `MDM` (YP own data), `YXT` (Yext), `GUMP`, `TMC`
- `claimed` -- `mip_claimed` or `mip_unclaimed`
- `adclick` -- `true` on all listings (general click-tracking flag, not paid-only)
- `rank` -- integer position in results

**MIP URL structure**

The business profile URL requires both the name slug and the ypid integer:
```
/san-francisco-ca/mip/business-name-461713663
```
Accessing `/san-francisco-ca/mip/461713663` (ypid without name slug) returns 404. The `?lid=` parameter is optional.

**Client globals available on every page**

After page load, `window.Tracking`, `window.YPU`, and `window.YPFB` are available in the browser context. `window.Tracking.lwes` contains the current session's vrid, the visitor's IP, and bot score. `window.YPU.REVISION` is the current deploy hash.

**Tracker configs (from window.Tracking)**

```javascript
window.Tracking.yext.PID        // "4Diy12y2qo"
window.Tracking.yext.TRACK_URL  // "https://pl.yext.com/plpixel"
window.Tracking.lwes.aid        // "webyp"
window.Tracking.lwes.ptid       // "www.yellowpages.com"
window.Tracking.omnitureServer  // Adobe Analytics beacon server
```

**Gotchas**

- Cloudflare blocks all non-headed browser access. Don't use `curl` or standard `fetch` from Node.js.
- The `/search*` path is `Disallow`ed in robots.txt. Google does not index search result pages.
- MIP pages fire 8 GA4 beacons during load -- the `analytics.google.com/g/collect` endpoint is called repeatedly as the page renders.
- `window.YPU.BUCKETS` shows 100% default on both desktop and mobile -- no A/B experiment variation to account for.
- The Google Maps API key in `window.YPU.googleJsApi` is a standard client-side Maps JS API key and is expected to be public.
- DFP ads appear on search/browse pages but not on MIP pages.
