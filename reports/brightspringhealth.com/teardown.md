---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "BrightSpring Health Services — Teardown"
url: "https://www.brightspringhealth.com"
company: "BrightSpring Health Services"
industry: "Healthcare"
description: "Publicly traded home health, hospice, pharmacy, and managed care provider."
summary: "WordPress on WP Engine behind Cloudflare, with iCIMS for applicant tracking and a separate Drupal-based investor relations site. Five custom post types exposed via unauthenticated WP REST API across 124 routes. Tag management through GTM with Complianz TCF for consent."
date: "2026-04-13"
time: "06:51"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "medium"
stack: [WordPress, WP Engine, Cloudflare, jQuery]
trackers: [Google Analytics 4, FullStory, LinkedIn Insight Tag, Google Consent Mode]
tags: [healthcare, home-health, hospice, pharmacy, wordpress, wp-engine, staging-exposed, lorem-ipsum, tcf, gdpr]
headline: "BrightSpring's patient story pages carry real names but lorem ipsum body text, indexed by Google since September 2024."
findings:
  - "All four patient story pages -- Roger Smith, Bill Burns, Dana Baskins, Joan Doe -- display lorem ipsum to visitors, fully indexed by Google with OG descriptions starting 'Lorem ipsum dolor sit amet'; two were edited in November 2024 and still not filled in."
  - "The Complianz TCF consent banner shows literal '{vendor_count} vendors' because the vendor-list.json it depends on returns 404 -- the template variable never resolves."
  - "staging.brightspringhealth.com is publicly accessible with no authentication -- a full WP Engine staging environment with active content dated March 2026."
  - "The 124-route WP REST API exposes five custom post types unauthenticated, including 16 executive leadership bios; post GUIDs leak a dev environment hostname (bshealthdev.wpenginepowered.com)."
  - "WordPress REST API reflects any Origin header with credentials and write methods (PUT, PATCH, DELETE) enabled -- standard WP default behavior, unmitigated."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

BrightSpring Health Services (NASDAQ: BTSG) is a Louisville-based healthcare conglomerate -- home health, hospice, personal care, neurorehabilitation, and pharmacy services (Onco360, PharMerica). IPO'd January 2024. The main site is a marketing and recruiting property, not a patient portal.

---

## Architecture

The site runs WordPress on WP Engine, behind Cloudflare. The homepage HTTP response includes `X-Powered-By: WP Engine` and a `Link` header exposing the WP REST API root: `<https://www.brightspringhealth.com/wp-json/>; rel="https://api.w.org/"`. The `Link` header also identifies the current page as post ID 5. WordPress version is not disclosed in headers.

Frontend stack: jQuery 3.7.0 loaded from Google CDN, custom theme `brightspring` at version `1.20250110`. Yoast SEO Premium handles structured data with a schema aggregator endpoint at `https://www.brightspringhealth.com/wp-json/yoast/v1/schema-aggregator/get-xml`. Nine XML sitemaps are indexed: post, page, employeestories, kpis, quotes, patientstories, leadership, category, leadershiptype.

`robots.txt` sets `Crawl-delay: 10` but has no Disallow rules -- every path is open to crawlers.

Security headers present: HSTS (`max-age=63072000; includeSubDomains`), `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection: 1; mode=block`, CSP `frame-ancestors 'self'`. No `script-src` in the CSP -- inline scripts and arbitrary external scripts are unrestricted.

`xmlrpc.php` returns 403 (Cloudflare block). `wp-admin/` redirects to `wp-login.php`. Draft post status returns 400 "Status is forbidden" for unauthenticated requests. Block pattern endpoints return 401.

**Subdomains:**
- `staging.brightspringhealth.com` -- separate WP Engine staging install (see below)
- `careers.brightspringhealth.com` -- 301 redirect to `careers-brightspring.icims.com` (iCIMS ATS)
- `ir.brightspringhealth.com` -- completely separate platform: Drupal, Adobe DTM analytics, Segment, New Relic, Parsely, Siteimprove. Different stack, different provider. Separate teardown candidate.

---

## WordPress REST API

The WP REST API is fully accessible without authentication. The root endpoint at `https://www.brightspringhealth.com/wp-json/` returns 124 routes. Five custom post types are registered and enumerable:

| Endpoint | Records | Notes |
|---|---|---|
| `/wp/v2/employeestories` | Active (latest: April 2026) | Full content, meta, ACF |
| `/wp/v2/kpis` | 4 | Marketing stats widgets |
| `/wp/v2/quotes` | 6 | Customer testimonials, first-name + last-initial |
| `/wp/v2/patientstories` | 4 | See below |
| `/wp/v2/leadership` | 16 | Full executive bios |
| `/wp/v2/leadershiptype` | Taxonomy | Leadership taxonomy |

The users endpoint (`/wp/v2/users`) returns `rest_no_route` -- correctly blocked. Autosave and revision sub-routes are registered but inaccessible without a logged-in session.

**Leadership profiles:** The `/wp/v2/leadership` endpoint returns 16 senior profiles including name, title, full bio, and profile image URL. All bios are publicly viewable on the leadership page -- the API is not exposing information beyond what's on the site. The notable detail is the `bshealthdev.wpenginepowered.com` hostname appearing in `guid.rendered` fields on older posts -- the internal WP Engine development instance name.

**KPIs:** Four marketing stat blocks exposed via `/wp/v2/kpis`:
- 40+ Million Prescriptions Dispensed (Pharmacy Solutions)
- 98% Patient Satisfaction for Rehab Services
- 44% Reduction in Hospitalizations with Home-Based Primary Services
- Over 90% of Home Health Branches Achieved 4+ STAR Ratings

These are visual widgets -- the rendered HTML contains 64px large-format numbers intended for homepage display. Not sensitive, but the full markup is accessible via API without loading the page.

**Complianz REST API:** `https://www.brightspringhealth.com/wp-json/complianz/v1/` exposes routes including `/banner`, `/track`, `/store_cookies`, `/cookie_data`, `/datarequests`, `/documents`, `/manage_consent_html`. The `/banner` endpoint returns `{"consenttype":"optin","region":"eu","version":"7.5.7.1","forceEnableStats":false,"banner_version":"32"}`. The `/cookie_data` endpoint returns an empty array.

---

## Patient Stories -- Lorem Ipsum in Production

Four patient story pages have been live on `brightspringhealth.com` since September 2024. Each page carries a real-sounding name as the title. Every page contains lorem ipsum as its body text -- no real patient story has ever been published to any of them.

The four entries from `/wp/v2/patientstories`:

| Name | Slug | Created | Modified | Lorem variant |
|---|---|---|---|---|
| Roger Smith | roger-smith | 2024-09-27 | 2024-09-27 | 69-word standard |
| Bill Burns | bill-burns | 2024-09-27 | 2024-09-27 | 69-word standard |
| Dana Baskins | dana-baskins | 2024-09-27 | 2024-11-22 | 69-word standard |
| Joan Doe | joan | 2024-09-25 | 2024-11-22 | 183-word extended |

Three pages share an identical 69-word latin block ("Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua..."). "Joan Doe" has a distinct multi-paragraph latin block with a formatted attribution line: *"Bill, husband of Joan | Neurorehabilitation patient"* -- templated copy that was never filled in.

The name "Joan Doe" is the female analog of "John Doe," the standard placeholder name in legal and administrative contexts. Whether this reflects an actual anonymized patient or a template left unfilled is unresolvable from the outside -- but the lorem ipsum body text makes the intent clear either way.

Dana Baskins and Joan Doe were both modified on November 22, 2024 -- two pages, same day, both still containing placeholder text after the edit. Someone touched the entries and left without populating them.

All four pages are indexed. Yoast SEO generates OG descriptions from the post excerpt, which is pulled from body content. A Google search for BrightSpring patient stories returns snippets like *"Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do..."* -- this is what the Dana Baskins page currently surfaces in social previews and search results.

The pages link from the public sitemap (`patientstories-sitemap.xml`), are fully rendered with the site's patient story page template, and are externally linked from `/services/who-we-serve/patient-stories/`.

---

## Consent & Tracking

**CMP:** Complianz GDPR Premium v7.5.7.1 with TCF active (`tcf_active: "1"`). Consent model is opt-in for EU visitors; geoIP detection serves region-specific flows for: us, ca, eu, uk, au, za, br. DNT header is honored (`do_not_track_enabled: "1"`). Consent decisions stored server-side via the `/complianz/v1/track` REST endpoint.

On a fresh session (no prior consent), only one cookie is set: `cmplz_consent_mode=security_storage,functionality_storage` -- analytics and advertising consent denied by default.

**GTM container GTM-TN3DGKS** tag inventory:
- `__googtag` -- GA4 tag, measurement ID `G-F1ZWQGF7K0`
- `__gaawe` -- GA4 event tags (includes a careers widget event tagged to the same `G-F1ZWQGF7K0` with `vtp_eventName: "careers_widget"`)
- `__fsl` (tag_id: 26) -- FullStory GTM community template (inferred from tag prefix; no FullStory org ID visible in the container JS -- template evaluates client-side)
- `__lcl` x 2 (tag_ids: 27, 28) -- LinkedIn Insight Tag, two separate tag instances
- `__cvt_WF68Z` -- Google Consent Mode v2 community template with defaults: `vtp_defaultConsentMarketing: "denied"`, `vtp_defaultConsentStatistics: "denied"`, `vtp_defaultConsentPreferences: "denied"`
- `__paused` x 2 -- Legacy UA-122929531-1 (Universal Analytics, deprecated May 2023). Both tags in `__paused` state -- they fire on trigger but the UA endpoint is no longer collecting.

GTM fires on `gtm.js` (page load) and `gtm.init_consent`. Complianz-fired events `cmplz_event_statistics` and `cmplz_event_marketing` gate the statistics/advertising tags on consent grant.

**Vendor count rendering bug:** The consent banner includes a link: *"Manage {vendor_count} vendors"* -- the template variable `{vendor_count}` is never resolved. Root cause: `https://www.brightspringhealth.com/wp-content/uploads/complianz/cmp/vendorlist/vendor-list.json` returns 404. This file is required by the Complianz TCF integration to populate the vendor count in the banner. The `additional-consent-providers.csv` (717 lines of IAB TCF vendor data) loads successfully, but the vendor count display depends on the missing JSON file. The literal string `{vendor_count}` is visible in the cookie policy page HTML as of this investigation.

---

## CORS & Staging

**CORS:** The WordPress REST API reflects any arbitrary `Origin` header:

```
GET https://www.brightspringhealth.com/wp-json/wp/v2/leadership
Origin: https://attacker.example.com

access-control-allow-origin: https://attacker.example.com
access-control-allow-credentials: true
access-control-allow-headers: Authorization, X-WP-Nonce, Content-Disposition, Content-MD5, Content-Type
access-control-allow-methods: OPTIONS, GET, POST, PUT, PATCH, DELETE
```

This is WordPress's default CORS behavior -- not a BrightSpring-specific misconfiguration. The combination of arbitrary origin reflection, `Allow-Credentials: true`, and write methods (PUT, PATCH, DELETE) means any webpage can make credentialed cross-origin requests to the WP API through a logged-in admin's browser session. Practical impact is bounded by the public content model -- most exposed CPTs are public marketing content -- but a logged-in editor visiting a crafted page could have their session used for write or delete operations against the CMS.

The same configuration applies to `staging.brightspringhealth.com`.

**Staging environment:** `staging.brightspringhealth.com` is publicly accessible with no password protection or IP restriction. It runs a WP Engine WordPress install with active content dated March 2026. The staging environment is missing the `patientstories` CPT registration (returns `rest_no_route`) -- a configuration divergence from production indicating the patient stories feature was deployed to production without being synced back to staging. The staging server returns `nginx` in the server header rather than the Cloudflare headers present on production.

---

## Machine Briefing

**Access & auth:** The public site and all custom post type APIs respond to unauthenticated GET requests. No session, cookie, or API key required. Standard HTTP/2, responds to curl.

**Open endpoints:**

```bash
# WP REST API root -- 124 routes
curl https://www.brightspringhealth.com/wp-json/

# Leadership profiles (16 entries)
curl https://www.brightspringhealth.com/wp-json/wp/v2/leadership?per_page=100

# Patient stories (4 entries, all lorem ipsum)
curl https://www.brightspringhealth.com/wp-json/wp/v2/patientstories?per_page=100

# Employee stories (paginated, active content)
curl "https://www.brightspringhealth.com/wp-json/wp/v2/employeestories?per_page=100&page=1"

# Marketing KPI stats (4 entries)
curl https://www.brightspringhealth.com/wp-json/wp/v2/kpis?per_page=100

# Customer testimonials (6 entries)
curl https://www.brightspringhealth.com/wp-json/wp/v2/quotes?per_page=100

# Complianz banner config
curl https://www.brightspringhealth.com/wp-json/complianz/v1/banner

# Yoast schema aggregator index
curl https://www.brightspringhealth.com/wp-json/yoast/v1/schema-aggregator/get-xml

# Staging environment (no auth required)
curl https://staging.brightspringhealth.com/wp-json/wp/v2/posts?per_page=10
```

**Pagination:** WP REST API returns 10 items by default. Use `?per_page=100` and check `X-WP-Total` + `X-WP-TotalPages` response headers to detect additional pages.

**Gotchas:**
- `robots.txt` sets `Crawl-delay: 10` -- respect it.
- `wp-json/wp/v2/users` returns `rest_no_route` (blocked, not 403 -- intentional WP hardening).
- Autosave and revision endpoints exist in the route map but require authentication to read.
- CORS: the API reflects any `Origin` header -- cross-origin requests work without preflight issues, but auth/write operations still require a valid WP session.
- The `vendor-list.json` at `/wp-content/uploads/complianz/cmp/vendorlist/vendor-list.json` is 404; only `additional-consent-providers.csv` is present.
- Patient story page URLs follow the pattern `/services/who-we-serve/patient-stories/{slug}/` -- slugs: `roger-smith`, `bill-burns`, `dana-baskins`, `joan`.
- `guid.rendered` fields on older posts reference `bshealthdev.wpenginepowered.com` -- the dev WP Engine instance hostname.
