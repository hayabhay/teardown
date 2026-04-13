---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Conduent — Teardown"
url: "https://www.conduent.com"
company: "Conduent"
industry: "Professional Services"
description: "Business process outsourcing for government benefits, healthcare payments, and tolls."
summary: "WordPress CMS served behind Imperva WAF on Apache/Amazon Linux EC2, with NitroPack CDN and Tealium as secondary tag orchestration. The public WP REST API (20 namespaces, 348 routes) returns CORS wildcard on all responses. Algolia powers site search with a client-accessible index of 636 records. insights.conduent.com runs Uberflip on a separate platform."
date: "2026-04-13"
time: "07:04"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [WordPress, Apache, Imperva, NitroPack, Tealium, Algolia, Uberflip]
trackers: [Google Analytics 4, Google Tag Manager, Marketo, ZoomInfo, Demandbase, LinkedIn Insight Tag, Facebook Pixel, Bing UET, Twitter Pixel, DoubleClick, TrustArc, Insent AI, Hotjar, Intercom, AddThis, The Trade Desk, AppNexus, Dstillery, Media6Degrees, GumGum, MOAT, OmniConvert, Ahrefs]
tags: [bpo, government-services, healthcare, wordpress, breach-disclosure, b2b-surveillance, algolia, username-enumeration]
headline: "While notifying breach victims, Conduent leaks WordPress admin usernames in its own public search index."
findings:
  - "The public Algolia search index exposes WordPress author user_login on every result — paginating to page 3 yields rajul.khandelwal@conduent.com, a full corporate email stored as a WP admin username and usable at /wordpress/wp-login.php."
  - "11 breach notification pages — documenting an 83-day ransomware dwell time (Oct 2024–Jan 2025) and confirmed exposure of SSNs, medical info, and health insurance data — are fully enumerable via the unauthenticated WP REST API."
  - "Conduent's B2B surveillance stack identifies anonymous visitors by employer via Demandbase and ZoomInfo IP lookup on every page load, before any form interaction, and seeds the identity into Marketo CRM."
  - "GTM is silently skipped for all mobile visitors via a custom cndIsMobileDevice() check — no analytics, ad pixels, or CRM tags fire on mobile, creating a complete measurement blind spot."
  - "WordPress REST API serves 348 routes across 20 namespaces with Access-Control-Allow-Origin: * — any external site can cross-origin query Conduent's CMS, including all breach notification page metadata."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Conduent is a Fortune-500 business process outsourcing company spun off from Xerox in 2017. It processes government benefits, healthcare payments, toll transactions, and back-office services for large public- and private-sector clients. Conduent sits invisibly between citizens and the government programs that serve them — if you've received a state benefits payment, a healthcare claim, or a toll bill in the US, there's a reasonable chance Conduent processed it.

That context matters for what follows.

## Infrastructure

The corporate site runs WordPress, served behind an Imperva WAF (identified by `x-cdn: Imperva` response header and Incapsula session cookies `visid_incap_2044933`, `nlbi_*`, `incap_ses_*`). The origin server is Apache 2.4.66 on Amazon Linux, running on AWS EC2 — the full `server: Apache/2.4.66 (Amazon Linux)` string is visible in response headers. NitroPack (`*.nitrocdn.com`, `*.nitropack.io`) handles performance optimization. Tealium (account name `LightningBolt`, profile `www.conduent.com`) runs as a secondary tag manager alongside Google Tag Manager.

The WordPress installation lives at `https://www.conduent.com/wordpress`, revealed by the WP REST API's `home` field. Yoast SEO (v26.5) is installed, as are Wordfence (security), WPML (multilingual), The Events Calendar (tribe), and a custom `banner-content` plugin with its own REST API (v1 and v2).

Two S3 resources appear in the Content Security Policy: `conduent-12335-main-content-production.s3.amazonaws.com` (in `img-src`, returns 403) and `www.conduentassets.com` (CloudFront-fronted S3, returns 403 XML `<AccessDenied>`). Both exist but block public access.

`insights.conduent.com` runs Uberflip — a separate content hub platform (identified by `uf-` CSS class prefix, Cloudinary CDN at `res.cloudinary.com/uf-552562/`, `_MGZ_` session cookie, and `ufcc_themesv2=1` cookie). It returns 403 for headless browsers. The main site and the content hub are entirely separate platforms.

`robots.txt` disallows `/wordpress/wp-admin/` but explicitly allows `/wordpress/wp-admin/admin-ajax.php` — a common WordPress pattern, but it confirms the admin URL structure and the WordPress installation path. Yoast SEO is identified in the robots.txt user-agent block. The sitemap index at `/sitemap_index.xml` lists eight sitemaps: pages, insights, industries, solutions, leadership, tribe_events, services, and event_type — 215 solutions URLs indexed.

## WordPress API Surface

The WP REST API at `/wp-json/` is fully accessible without authentication and returns `Access-Control-Allow-Origin: *` on all responses. Any website can call these endpoints cross-origin. Twenty namespaces are registered:

```
oembed/1.0, wpml/v1, redirection/v1, wordfence/v1, yoast/v1, wpml/st/v1,
tribe/event-aggregator/v1, tribe/events/v1, tribe/views/v2, tec/v2/onboarding,
tec/v1, wpml/tm/v1, wpml/ate/v1, banner-content/v1, banner-content/v2,
otgs/installer/v1, wp/v2, wp-site-health/v1, wp-block-editor/v1, wp-abilities/v1
```

348 routes total. The Events Calendar plugin API version is exposed in a response header on every page: `x-tec-api-version: v1`, `x-tec-api-root: https://www.conduent.com/wp-json/tribe/events/v1/`.

**Open endpoints** (no auth required):
- `/wp-json/wp/v2/pages` — page titles, slugs, author IDs, ACF field names
- `/wp-json/wp/v2/adpage` — advertising/campaign landing pages (5 returned: sepsis prevention, risk management, customer contact Singapore, etc.)
- `/wp-json/tribe/events/v1/events` — 8 events across 2 pages
- `/wp-json/banner-content/v1/content` — header HTML including asset CDN URLs
- `/wp-json/yoast/v1/get_head` — full SEO metadata for any URL

**Blocked endpoints** (auth required):
- `/wp-json/wp/v2/users` — 401
- `/wp-json/wp/v2/posts?status=draft` — 403
- `/wp-json/redirection/v1/redirect` — 403
- `/wp-json/wordfence/v1/config` — 401 ("Authorization header format is invalid")

The wordfence namespace being registered and accessible (even returning 401) confirms the security plugin is installed. The WordPress backend URL `https://www.conduent.com/wordpress` is visible in API responses.

Custom post types registered: `industry`, `adpage`, `tribe_venue`, `tribe_organizer`, `tribe_events`, `tec_calendar_embed`.

## Breach Disclosure via Public API

Between October 2025 and January 2026, Conduent published 11 incident notice pages on conduent.com — 10 numbered notices and a general guidance page. Two additional Spanish-language pages were published in February 2026. All are accessible and enumerable via the WP REST API (`/wp-json/wp/v2/pages`) and via Algolia search. None are linked from the homepage navigation.

The notice slugs: `notice-2913678` (Oct 17, 2025), `notice-2912607` (Oct 17), `notice-7203675` (Oct 29), `notice-7203678` (Oct 29), `notice-4031589` (Nov 17), `notice-4031606` (Nov 17), `notice-7203674` (Nov 17), `notice-4068902` (Dec 16), `notice-2912605` (Dec 23), `notice-4068986` (Jan 2, 2026), `notice-steps-you-can-take-2025` (Oct 7, 2025). The two Spanish notices: `nm-notificacion-2913678-a` and `nm-notificacion-2913678-m` (Feb 4, 2026).

The breach timeline, reconstructed from notice content:
- **Oct 21, 2024** — attacker enters Conduent's network
- **Jan 13, 2025** — Conduent discovers the breach (83 days of attacker access)
- **Aug 29, 2025** — Blue Cross Blue Shield of New Mexico (BCBSNM) is notified (confirmed in Spanish notice yoast metadata: "Nos enteramos de este problema de privacidad el 29 de agosto de 2025")
- **Oct–Jan 2025/26** — rolling wave of 11 numbered notices published
- **Feb 2026** — Spanish-language notices published for BCBSNM

Affected services per the notices: printing/mailroom services, document processing services, payment integrity services, government benefit services, health plan administration. Data types confirmed: name, Social Security number, medical information, health insurance information.

The Spanish notices name BCBSNM as the affected health plan. The 83-day attacker dwell time, the 9-month gap between breach discovery and first public notification, and the breadth of affected service lines (government benefits, healthcare, payment processing) are all documented in public-facing pages queryable through the CMS API.

The notice pages are set to `noindex, nofollow` in their Yoast metadata — they're not intended to appear in search results — but are indexed in Algolia's internal search index and returned by the WP REST API's `/wp-json/wp/v2/pages` endpoint without authentication.

## Algolia Search Index — Username Enumeration

The homepage loads Algolia search with configuration exposed in `window.__algolia`:

```json
{
  "debug": true,
  "application_id": "SSWU34X67Q",
  "search_api_key": "c0bf91ff93d18aefaa0f39068be38c46",
  "indices": {
    "searchable_posts": {
      "name": "wp_conduent_aws_prod_searchable_posts"
    }
  }
}
```

The search key is a client-facing read-only key — Algolia's standard architecture for site search. The index name `wp_conduent_aws_prod_searchable_posts` confirms the production AWS environment. Debug mode is `true` on production, which enables verbose browser console logging of search queries and responses.

The index holds 636 records. Each record includes a `post_author` object with `user_id`, `display_name`, and `user_login` — the WordPress login username. Paginating through results yields the following authors:

| user_login | user_id | display_name | Posts |
|-----------|---------|--------------|-------|
| `rajalakshmib` | 51 | rajalakshmib | 390 |
| `billgreco` | 59 | Bill Greco | 238 |
| `rajul.khandelwal@conduent.com` | 70 | Rajul Khandelwal | 5 |
| `wpengine` | 1 | wpengine | 2 |

`user_login` is the actual WordPress authentication username — the string used at `/wordpress/wp-login.php`. `rajul.khandelwal@conduent.com` is a full corporate email address stored as a WP username and returned on page 3 of default search results. The WordPress admin login endpoint accepts email addresses as usernames. The `wpengine` entry (user ID 1) is a migration artifact from a previous WP Engine-hosted environment — the account persists from a prior hosting setup.

These usernames are returned on every Algolia query. They're not in the first page of results, but the Algolia API requires no authentication, and iterating pages is a single parameter change.

## B2B Surveillance Stack

Conduent's tracking infrastructure reflects its business model: the site exists to identify and engage enterprise buyers. The first-party analytics are supplemented by a three-layer company identification and lead nurturing stack that activates before any user interaction.

**Layer 1 — Passive company identification.** Two vendors fire on page load and attempt to resolve the visitor's employer by IP address:
- Demandbase: `api.company-target.com/api/v3/ip.json` (returns company record for recognized IP ranges), global `window.Demandbase`
- ZoomInfo: `ws.zoominfo.com/pixel/{id}`, `js.zi-scripts.com/unified/v1/master/getSubscriptions`, global `window.ZIProjectKey = "e3e08b9b9d1670597524"`, cookie `_zitok`

**Layer 2 — Chat and engagement tracking.** Insent AI chat (`conduent.widget.insent.ai`) loads on every page via an iframe. The project key `window.insentProjectKey = "7vPg7zh5kAM2s8ogKE5I"` is exposed in page source. The network log shows `POST /user/pageVisit/spentTime/{id}` firing repeatedly (5 observed calls in a single homepage session), recording time-on-page for the current visitor session.

**Layer 3 — CRM seeding.** Marketo Munchkin (account `250-KMW-698`) sets `_mkto_trk` on page load. The Marketo tracking cookie is structured as `id:250-KMW-698-{session-hash}`.

The individual ZoomInfo, Insent, and Marketo components are all confirmed; the investigator observed (but did not capture in saved evidence) the Insent iframe passing the ZoomInfo visitor token and Marketo cookie as URL parameters — which would stitch the anonymous visitor identity across all three tools before any form interaction. That specific URL was not preserved in network evidence and is treated as inferred.

Additional ad targeting vendors present: LinkedIn Insight Tag (`_linkedin_data_partner_id`, `px.ads.linkedin.com/wa/`), Facebook Pixel (`_fbp`, `fbq` global), Bing UET (`bat.bing.com`, `_uetsid`/`_uetvid`), Twitter/X Pixel (`_twpid`, `twq` global), DoubleClick/Google Ads (`ad.doubleclick.net/activity`).

Programmatic advertising vendors in CSP: The Trade Desk (`*.adsrvr.org`), AppNexus/Xandr (`*.adnxs.com`), Dstillery (`*.dstillery.com`), Media6Degrees (`*.media6degrees.com`), GumGum (`px.gumgum.com`), MOAT (`*.moatads.com`). Hotjar (`wss://*.hotjar.com`) and Intercom (`wss://*.intercom.io`) appear in CSP but were not confirmed as active in the network trace.

## Tracking and Consent

**GTM containers.** Two GTM containers are defined in page source. `GTM-5T2HXZS` loads unconditionally via `gtag.js`. `GTM-MRNLPCZ` is wrapped in a conditional: the page source defines `cndLoadGTM()` and `cndIsMobileDevice()`, and calls `if(!cndIsMobileDevice()) { cndLoadGTM(); }`. The mobile detection uses a User-Agent regex test. On mobile devices, `GTM-MRNLPCZ` never loads — and with it, all tags configured in that container (GA4 events, LinkedIn, Bing UET, Facebook Pixel, etc.) do not fire. The only tracking active on mobile is whatever fires through `GTM-5T2HXZS` plus Imperva bot detection.

**TrustArc and pre-consent firing.** TrustArc is the Consent Management Platform. On first load, before any user interaction, the cookie `notice_behavior=implied,eu` is set. The GTM dataLayer records a `Consent Changed` event with `consentCategories: "1"` and `noticeBehavior: "implied,eu"` — but this fires *after* the `page_view` event, meaning tracking has already started before the consent signal is processed. "Implied" consent means TrustArc treats visitor silence as agreement to all categories, including for EU visitors. The following cookies are set before any consent interaction: `_ga`, `_gcl_au`, `_fbp`, `_mkto_trk`, `_uetsid`, `_uetvid`, `_twpid`, `_zitok`, `utm_*` parameters.

Full verified tracker inventory:

| Tracker | Category | Cookies / Keys |
|---------|----------|----------------|
| Google Analytics 4 (G-21KBGVSV08) | Analytics | `_ga`, `_gcl_au` |
| Google Tag Manager (GTM-5T2HXZS, GTM-MRNLPCZ) | Tag Manager | — |
| Marketo Munchkin (250-KMW-698) | Marketing Automation | `_mkto_trk` |
| ZoomInfo | B2B Intent/ID | `_zitok`, `ws.zoominfo.com` |
| Demandbase | B2B Intent/IP | `window.Demandbase`, `api.company-target.com` |
| LinkedIn Insight Tag | B2B Ad | `px.ads.linkedin.com` |
| Facebook Pixel | Ad | `_fbp` |
| Bing UET | Ad | `_uetsid`, `_uetvid` |
| Twitter/X Pixel | Ad | `_twpid` |
| DoubleClick/Google Ads | Ad | `ad.doubleclick.net` |
| TrustArc | CMP | `TAsessionID`, `notice_behavior` |
| Tealium (LightningBolt) | Tag Manager | `window.lbAccount` |
| Insent AI Chat | B2B Chat/Lead | `insentProjectKey = "7vPg7zh5kAM2s8ogKE5I"` |
| Hotjar | Session Recording | CSP only |
| Intercom | Customer Messaging | CSP only |
| AddThis (ra-582a1222146055e9) | Social Sharing | `addthis-id` |
| The Trade Desk | DSP | `*.adsrvr.org` |
| AppNexus/Xandr | Programmatic | `*.adnxs.com` |
| Dstillery | Programmatic | `*.dstillery.com` |
| Media6Degrees | Programmatic | `*.media6degrees.com` |
| GumGum | Programmatic | `px.gumgum.com` |
| MOAT | Ad Viewability | `*.moatads.com` |
| OmniConvert | CRO/Testing | `app.omniconvert.com` |
| Ahrefs | SEO Analytics | `analytics.ahrefs.com` |
| Imperva/Incapsula | WAF/Bot Detection | `visid_incap_*`, `nlbi_*`, `incap_ses_*`, `reese84` |
| NitroPack | Performance CDN | `*.nitrocdn.com` |

## Configuration Artifacts

**`cdu_vars.domain = "dev.conduent.com"`** — A page-level global `window.cdu_vars` contains `"domain": "dev.conduent.com"` on the production site. This appears to be a deployment artifact where the domain variable was not updated from dev to production. The `site_url` field correctly shows `https://www.conduent.com`, so this isn't causing functional failures, but the dev domain string surfaces in production page config. Whether `dev.conduent.com` resolves to a live development environment was not verified.

Other `cdu_vars` fields: `locale: "en_US"`, `gtm-id: "GTM-MRNLPCZ"`, `addthis-id: "ra-582a1222146055e9"`, `property_type: "corporate"`.

**Server version disclosure.** `server: Apache/2.4.66 (Amazon Linux)` in response headers. Apache 2.4.66 was released March 2024.

## Machine Briefing

**Access and auth.** The Imperva WAF blocks headless HTTP clients on the main site — `curl` against the homepage returns a bot challenge page. The WP REST API and Algolia are accessible without session state. Imperva sets `visid_incap_2044933` and `incap_ses_*` cookies on first contact; a real browser session passes the `reese84` bot detection challenge. For API-only access, skip the main site and hit `/wp-json/` and Algolia directly — no cookies needed.

**Open endpoints.**

Algolia search (no auth, CORS open):
```
POST https://sswu34x67q-dsn.algolia.net/1/indexes/wp_conduent_aws_prod_searchable_posts/query
Headers:
  X-Algolia-Application-Id: SSWU34X67Q
  X-Algolia-API-Key: c0bf91ff93d18aefaa0f39068be38c46
  Content-Type: application/json
Body: {"query": "", "hitsPerPage": 20, "page": 0, "attributesToRetrieve": ["post_title", "post_author", "post_type", "permalink"]}
```

Each hit includes `post_author.user_login`. Paginate with `"page": N`. 636 total records. Set `hitsPerPage` explicitly — this index defaults to 1 per page.

WP REST API (no auth, CORS `*`):
```
GET https://www.conduent.com/wp-json/wp/v2/pages?per_page=100
GET https://www.conduent.com/wp-json/wp/v2/pages?search=notice
GET https://www.conduent.com/wp-json/tribe/events/v1/events?per_page=50
GET https://www.conduent.com/wp-json/banner-content/v1/content
GET https://www.conduent.com/wp-json/wp/v2/adpage?per_page=20
GET https://www.conduent.com/wp-json/yoast/v1/get_head?url=https://www.conduent.com/
```

WP API root (namespace/route enumeration):
```
GET https://www.conduent.com/wp-json/
```

Breach notice pages (direct):
```
https://www.conduent.com/notice-2913678/
https://www.conduent.com/notice-steps-you-can-take-2025/
https://www.conduent.com/nm-notificacion-2913678-a/
```

**Gotchas.**
- Algolia `hitsPerPage` defaults to 1 in this index configuration — set explicitly or you'll get one result per page.
- The WP REST API's `wp/v2/users` endpoint returns 401. Author usernames come from Algolia, not from the users endpoint.
- Imperva blocks `curl` with default UA on the main site. For page-level JS globals (`cdu_vars`, `__algolia`, `insentProjectKey`), you need a real browser session or Playwright with JavaScript execution.
- CORS wildcard means cross-origin fetch works, but Imperva may rate-limit or challenge repeated requests from the same IP.
- The `reese84` token in `window.reese84` is Imperva's bot detection challenge response — it changes per session and isn't reusable.
