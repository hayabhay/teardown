---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Acxiom — Teardown"
url: "https://www.acxiom.com"
company: "Acxiom"
industry: "Information"
description: "Data broker and identity resolution company owned by IPG."
summary: "WordPress on WP Engine behind dual Imperva and Cloudflare WAF layers, with Marketo CRM on a marketing.acxiom.com subdomain and ACF Pro for custom fields. A second headless WordPress instance at sharedmarketingcontent.acxiom.com serves the partner directory via CORS. The actual data products -- InfoBase, Real ID, Personicx, the CDP -- run on entirely separate infrastructure not visible through the marketing site."
date: "2026-04-14"
time: "05:30"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "medium"
stack: [WordPress, WP Engine, Imperva, Cloudflare, Marketo, ACF Pro]
trackers: [6sense, Marketo Munchkin, Google Analytics, Google Tag Manager, Xandr, G2]
tags: [data-broker, identity-resolution, b2b-tracking, wordpress, marketo, 6sense, legitimate-interest, cms-api, partner-ecosystem, ipg]
headline: "Acxiom's internal CMS taxonomies label their funnel stages TOFU, MOFU, BOFU, Customer, and — inexplicably — MOFO."
findings:
  - "The unauthenticated WordPress API exposes Acxiom's full content playbook -- funnel stages, target personas, product lines, and a staff directory with executive LinkedIn URLs."
  - "The staff directory at /wp/v2/people returns 75+ profiles including C-suite executives with full titles, LinkedIn URLs, and ACF metadata -- while a separate layer of last-initial-only names suggests client delivery staff listed in case studies without full-name disclosure."
  - "6sense resolves every visitor's IP to a company identity on page load -- pushing company name, street address, employee count, annual revenue, SIC/NAICS codes, and a buying-stage score into GTM's dataLayer before the cookie banner renders."
  - "A headless WordPress instance at sharedmarketingcontent.acxiom.com serves the full partner directory unauthenticated -- 79 partners including Salesforce, TransUnion, LiveRamp, and Google Cloud, each tagged with US/UK/DE market availability flags."
  - "The cookie consent banner uses legitimate interest as the legal basis for all optional cookies, has no reject button, and is set to notify rather than gate -- while 6sense, Marketo, GA4, G2, and AppNexus all load via inline scripts that bypass the consent manager entirely."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Acxiom is one of the world's largest data brokers -- the company that built InfoBase, Personicx, and Real ID, the consumer identity products that sit underneath billions of ad targeting decisions. The marketing site at acxiom.com is where enterprise buyers come to get sold. What you find when you take it apart is a B2B surveillance operation applied to those same buyers, plus a WordPress installation that freely narrates Acxiom's internal content strategy, staff roster, and partner ecosystem to anyone who asks.

## Stack

The site runs WordPress on WP Engine. That's visible immediately -- `x-powered-by: WP Engine` in the response headers, along with `link: <https://www.acxiom.com/wp-json/>` advertising the REST API. Two WAF/CDN layers sit in front: Imperva (`x-cdn: Imperva`) and Cloudflare (`server: cloudflare`). The dual-layer setup is unusual -- most sites pick one or the other. Imperva handles the primary WAF, Cloudflare handles the CDN and bot management layer (`__cf_bm` cookie).

The CMS uses ACF Pro for custom post type fields and Yoast SEO for metadata and sitemaps. Marketo CRM runs on a separate subdomain -- `marketing.acxiom.com` hosts the Marketo landing page server and forms. A second WordPress instance at `sharedmarketingcontent.acxiom.com` acts as a headless API for partner content. The actual data products -- InfoBase, Real ID, Personicx, the CDP -- run on entirely separate infrastructure; none of it surfaces through the marketing site.

WP Engine exposes a site ID in the `x-cacheable` and `x-wpe-request-id` headers on cached pages. The homepage WordPress post ID (397) is exposed in the `Link` header on every request: `<https://www.acxiom.com/wp-json/wp/v2/pages/397>; rel="alternate"; type="application/json"`.

robots.txt has no Disallow rules -- a flat, open crawl policy. The sitemap index enumerates 12 custom post types: post, page, news, podcasts, resources, partners, videos, privacy, case_studies, infographics, research, fact_sheets.

## The 6sense Pipeline

Before the cookie consent banner has rendered -- before the user has moved a mouse -- Acxiom's 6sense deployment has already identified the visiting company, scored it as a lead, and written that intelligence into GTM's dataLayer.

The sequence: on page load, `j.6sc.co/6si.min.js` loads. Then `j.6sc.co/j/477d0950-8187-4de2-92f4-9ff559e4e6d4.js` loads and executes the configuration:

```js
window._6si.push(["setToken", "2d90e922affc9dc451fd60a8812ebf5b"]);
window._6si.push(["setEpsilonKey", "a16d3300fb939f75947afea31fbde29af8d01f37"]);
window._6si.push(["enableIPv6Ping", true]);
window._6si.push(["enableRetargeting", true]);
window._6si.push(["enableEventTracking", true]);
window._6si.push(["enableCompanyDetails", true, function(i) { ... }]);
```

The `enableCompanyDetails` callback fires a request to `epsilon.6sense.com/v3/company/details`, which resolves the visitor's IP address to a company profile using 6sense's identity graph. If a match is found, the callback pushes approximately 30 fields into `window.dataLayer`:

- `company_name`, `domain`, `address`, `city`, `zip`, `company_state`, `country`, `country_iso_code`, `region`
- `industry`, `sic`, `sic_description`, `naics`, `naics_description`
- `employee_count`, `employee_range`, `annual_revenue`, `revenue_range`
- `buying_stage`, `intent_score`, `profile_fit`, `profile_score`
- `segments` (comma-separated list of 6sense segment memberships)
- `segment_ids`, `segment_names`, `segment_lists`
- `confidence` (Low/Medium/High)
- `is_blacklisted`, `is_6qa` (whether the company is a "6th-generation Qualified Account" -- 6sense's designation for hot leads)
- Duplicate `6si_*`-prefixed versions of all the above

The `enableRetargeting: true` flag means identified companies are also enrolled in retargeting audiences.

A live capture from the investigation session shows what this looks like in practice. The visitor's network resolved to a school in Cupertino, CA:

```json
{
  "company_name": "Tessellations",
  "domain": "tessellations.school",
  "country": "United States",
  "address": "1170 Yorkshire Drive",
  "company_state": "California",
  "city": "Cupertino",
  "zip": "95014",
  "industry": "Education",
  "sic": "8299",
  "sic_description": "Schools and Educational Services Not Elsewhere Classified",
  "naics": "611",
  "naics_description": "Educational Services",
  "employee_range": "100 - 249",
  "employee_count": "131",
  "revenue_range": "$1M - $5M",
  "annual_revenue": "2249261",
  "buying_stage": "Awareness",
  "intent_score": 39,
  "profile_fit": "Weak",
  "profile_score": 47,
  "confidence": "Low"
}
```

The resolution includes a street address and an exact employee count. The buying stage and intent score feed directly into Acxiom's sales pipeline -- "Awareness" with a "Weak" fit means low-priority outreach; "Decision" with "Strong" fit means an SDR follows up.

The account identification fires before consent interaction. The CookieControl cookie captured during the session shows `"interactedWith": false` at the time all tracking scripts were already executing.

Acxiom sells real-time audience identification as a product. The 6sense deployment on their own site applies that same methodology to their sales funnel -- every enterprise buyer who visits acxiom.com is profiled by company, revenue, headcount, and purchase intent before they've clicked anything.

## Tracker Inventory

Eight third-party tracking domains fire on the homepage. All fire before any user consent interaction.

**6sense** -- B2B intent platform (described above). Config script: `j.6sc.co/j/477d0950-8187-4de2-92f4-9ff559e4e6d4.js`. Tracking pixels at `c.6sc.co` (IPv4) and `ipv6.6sc.co` (IPv6 -- unusual; most trackers don't run separate IPv6 endpoints). Account token: `2d90e922affc9dc451fd60a8812ebf5b`. Epsilon key: `a16d3300fb939f75947afea31fbde29af8d01f37`.

**Marketo Munchkin** -- Lead tracking for CRM enrichment. Loads from `munchkin.marketo.net/165/munchkin.js` and `munchkin.marketo.net/munchkin-beta.js`. Instance ID: `982-LRE-196`. Sets cookie `_mkto_trk=id:982-LRE-196&token:_mch-acxiom.com-[fingerprint]`. Form server: `marketing.acxiom.com`.

**Google Analytics 4** -- Measurement ID `G-LXQRT88ZWN`. Loaded via an inline `gtag.js` call, separate from GTM. Fires `POST /g/collect` four times on homepage load.

**Google Tag Manager** -- Container `GTM-TDLQS69`. Injected only inside the CookieControl `onAccept` callback -- technically consent-gated. However, GA4, 6sense, Marketo, G2, and AppNexus all load via inline script tags that bypass GTM entirely, making the GTM consent gate mostly decorative.

**G2 / Gartner Digital Markets** -- Visitor tracking for B2B review site lead attribution. Sets three cookies: `_gd_visitor` (persistent UUID), `_gd_session` (session UUID), `_gd_svisitor` (short visitor UUID). Used by G2 to attribute acxiom.com conversions to traffic from G2's review platform.

**AppNexus / Xandr (Microsoft Advertising)** -- User ID sync: `GET secure.adnxs.com/getuidj`. Sets `_an_uid` cookie (value `0` = new visitor ID). Standard programmatic advertising identity sync.

**Vimeo** -- Video embed on homepage. `vod-adaptive-ak.vimeocdn.com` for adaptive streaming assets.

**Google Custom Search** -- `cse.google.com/cse.js?cx=000050670060381542067:9myqrd_ey3k`. Powers the site search widget.

The CookieControl configuration (Civic Computing PRO_MULTISITE, API key `2e79e79cd3738f6634f2617b9e95c9685a8086fe`) also lists cookies from vendors not observed in the homepage session: LinkedIn (`lidc`, `li_oatml`, `bcookie`, `_guid`, `bscookie`), LuckyOrange (`_lo_uid`, `_lo_v`, `_lorid`), ShareThis, and Google/DoubleClick (`APISID`, `HSID`, `SAPISID`, `SID`). These may fire on other pages or after specific interactions.

### Consent Architecture

The banner uses `initialState: 'NOTIFY'` -- it displays a notification but does not block anything. `rejectButton: false` -- there is no button to decline cookies. `lawfulBasis: 'legitimate interest'` covers the single optional cookie category, meaning no affirmative consent is solicited; the config assumes legitimate interest applies to all optional tracking. `recommendedState: 'on'` means all optional cookies default to enabled. The `consentCookieExpiry` is set to 600 days.

Two separate systems handle different consent functions. Civic CookieControl manages website tracking cookies. A separate OneTrust portal (`privacyportal.onetrust.com`) handles consumer data subject requests (CCPA deletion, GDPR access requests). These are operationally separated -- the cookie banner on the marketing site and the CCPA/GDPR DSR system are entirely different products.

## WordPress REST API and Internal Taxonomy

The REST API at `https://www.acxiom.com/wp-json/` is open and returns a full namespace inventory including 16 registered plugin namespaces. Five custom taxonomies are readable without authentication and expose Acxiom's internal content classification system.

**Funnel stages** (`/wp/v2/buyer_level`):
- TOFU (Top of Funnel) -- 247 posts
- MOFU (Mid of Funnel) -- 45 posts
- MOFO -- 13 posts (distinct taxonomy term from MOFU; both link to the same `/blog/buyer_level/mofu/` URL, suggesting MOFO is a variant or legacy label)
- BOFU (Bottom of Funnel) -- 11 posts
- Customer -- 7 posts

Content can be filtered by funnel stage: `GET /wp/v2/posts?buyer_level=1643` returns all TOFU-tagged posts.

**Target personas** (`/wp/v2/personas`):
- Marketer -- 235 posts
- Customer Experience Officer -- 183 posts
- Data Scientist/Analytics -- 160 posts
- Technologist -- 29 posts
- Privacy -- 29 posts
- General Business -- 71 posts
- Merchandising/Supply Chain -- 3 posts

The post counts reveal where Acxiom invests content production effort: marketers and CXOs dominate, technical buyers are secondary.

**Product lines** (`/wp/v2/products`):
Acxiom Real ID, Analytics, Customer Data Platform, Data & Audiences, Digital Marketing Solutions, eProspecting, InfoBase, Personicx.

**Topics** (`/wp/v2/topics`):
Adtech/Martech, AI/ML, Analytics & Measurement, Cloud, Complete Customer View, Consumer Trends, Cookieless World, CDP, CX, Acxiom Partners.

**Industries** (`/wp/v2/industries`):
Automotive, CPG, Financial Services, Food Delivery, Government, Grocery and Convenience, Healthcare, Insurance, Media, Restaurants.

All taxonomies are queryable as filters on any content type endpoint. `GET /wp/v2/resources?topics=1684&industries=1694` returns resources tagged for a specific topic-industry combination.

### Staff Directory

`/wp/v2/people` returns the full staff directory with Advanced Custom Fields data including job title, company, LinkedIn URL, bio fields, and internal metadata (`tracking_key`, `page_analytics_category`, `hide_from_archive_page`, etc.).

Named executives from the API:
- Jarrod Martin -- Global CEO
- Graham Wilkinson -- Global Head of AI, EVP Chief Innovation Officer
- Anant Veeravalli -- Global Chief Analytics Officer, Acxiom and Mediabrands (joint role with IPG's media agency)
- Margaret Kohler -- Global Chief Operating Officer
- Keith Camoosa -- Chief Product and Technology Innovation Officer
- Ankur Jain -- Chief Cloud and Data Modernization Officer
- Sean Muzzy -- Global President
- Victor Richardson -- General Counsel
- Courtney Keating -- Chief Marketing Officer
- Alex Pym -- Chief Commercial Officer EMEA

The directory also includes entries with last-initial-only names ("Raj S.", "Christopher B.", "Laurie N.") -- these appear to be client delivery staff listed in case studies without full name disclosure. The ACF schema for each person includes `hide_from_archive_page`, `hide_from_related_content`, and `hide_from_rss` boolean flags, suggesting some entries are intentionally excluded from public-facing listing pages but remain accessible via the API.

`/wp/v2/users` (WordPress author enumeration) returns 403 -- correctly locked.

The `webdev-insight/v1` plugin exposes user management routes in the API root (`/webdev-insight/v1/users`, `/users/create`, `/users/delete`, `/users/update-role`, `/users/pluginsthemes`, `/users/system`, `/logs/activity`) but all return 401 with "Authorization header with Bearer token is required". The routes are enumerated publicly but access is gated.

Custom `acx/v1` endpoints:
- `GET /acx/v1/events-posts` -- returns upcoming events with dates, locations, and external links (unauthenticated)
- `GET /acx/v1/post-counts` -- returns empty array
- `POST /acx/v1/opt-out-submit` -- opt-out form submission handler (POST only)

## Partner Ecosystem

`sharedmarketingcontent.acxiom.com` is a separate WordPress installation labeled "Acxiom API" in its REST API root. Its purpose is headless: it stores partner records and serves them to the main site via CORS (the main site's response includes `access-control-allow-origin: sharedmarketingcontent.acxiom.com`).

The partner API at `https://sharedmarketingcontent.acxiom.com/wp-json/acx/v1/acx-posts` returns 79 partners paginated across 6 pages. Each record includes:
- Partner name and logo URL
- External partner URL
- `us`, `uk`, `de` boolean flags for market availability
- Market-specific description text (UK/DE markets get localized descriptions for some partners)

The US partner roster includes: ActionIQ, Yahoo!, Reddit, Braze, Magnite, LinkedIn, Salesforce, TransUnion, Databricks, Google Cloud, Polk by IHS Markit, Sitecore, Dish Media, aqfer, HCL Software, LiveRamp, Snapchat, Tealium, Treasure Data, Bloomreach, Kantar Media, Roku, Dun & Bradstreet, Eyeota, Google Marketing Platform, VideoAmp, AdSlot, SpotX, AdTheorent, and more.

The subdomain also runs the same `webdev-insight/v1` management plugin stack as the main site, with routes enumerated publicly but access-gated.

## Machine Briefing

**Access and auth:** Everything documented below is unauthenticated. No session, cookies, or auth headers required. The Cloudflare/Imperva WAF is active -- aggressive scraping or automated requests may trigger rate limits. The 6sense API at `epsilon.6sense.com` requires the Acxiom account token and resolves the caller's IP.

**Open endpoints:**

```bash
# WordPress REST API root -- namespace inventory
curl https://www.acxiom.com/wp-json/

# Internal taxonomy -- funnel stages with post counts
curl https://www.acxiom.com/wp-json/wp/v2/buyer_level

# Internal taxonomy -- target personas with post counts
curl https://www.acxiom.com/wp-json/wp/v2/personas

# Internal taxonomy -- product lines
curl https://www.acxiom.com/wp-json/wp/v2/products

# Internal taxonomy -- industries
curl https://www.acxiom.com/wp-json/wp/v2/industries

# Staff directory with full ACF fields
curl https://www.acxiom.com/wp-json/wp/v2/people?per_page=100

# Case studies
curl https://www.acxiom.com/wp-json/wp/v2/case_studies?per_page=20

# Upcoming events
curl https://www.acxiom.com/wp-json/acx/v1/events-posts

# Partner listing (79 partners, paginated)
curl "https://sharedmarketingcontent.acxiom.com/wp-json/acx/v1/acx-posts?page=1"
# page=1 through page=6

# Filter content by persona + industry combination
curl "https://www.acxiom.com/wp-json/wp/v2/resources?personas=1668&industries=1694"
# personas: 1668=Marketer, 1670=DataScientist, 1674=CXO, 1669=Technologist, 1671=Privacy
# buyer_level: 1643=TOFU, 1644=MOFU, 1727=MOFO, 1645=BOFU, 1646=Customer
```

**6sense config (for reference -- not callable without Acxiom account):**
```
Token: 2d90e922affc9dc451fd60a8812ebf5b
Epsilon key: a16d3300fb939f75947afea31fbde29af8d01f37
Config ID: 477d0950-8187-4de2-92f4-9ff559e4e6d4
API endpoint: epsilon.6sense.com/v3/company/details
```

**Marketo:**
```
Instance: 982-LRE-196
Form server: https://marketing.acxiom.com
Forms endpoint: https://marketing.acxiom.com/js/forms2/js/forms2.min.js
Cookie opt-out: https://www.acxiom.com/cookie-opt-out/?marketo_opt_out=true
```

**Gotchas:**
- The WP REST API returns paginated results; default `per_page` is 10, max is 100. Use `?per_page=100&page=N` for bulk retrieval.
- `sharedmarketingcontent.acxiom.com` is CORS-restricted -- browser requests from non-`acxiom.com` origins will be blocked; `curl` and server-side requests work fine.
- The `acx/v1/acx-posts` endpoint on the shared content subdomain includes posts from a separate WordPress post type, not the standard `wp/v2/posts` endpoint.
- WP user enumeration at `/wp/v2/users` returns 403 -- author IDs in post objects are obfuscated.
- The `webdev-insight/v1` management routes are listed in the API root but return 401; Bearer token required and unavailable externally.
