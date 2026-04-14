---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Comscore — Teardown"
url: "https://www.comscore.com"
company: "Comscore"
industry: "Information"
description: "Audience measurement and analytics company issuing digital, TV, and box office rankings."
summary: "Comscore runs eZ Platform Enterprise v2 (Ibexa/PHP) behind CloudFront with jQuery 3.7.1 and Bootstrap 4.1 -- server-rendered, not a SPA. Rankings data is served from publicly accessible Google Sheets via both the Visualization Query API and published CSV endpoints. Multiple acquired companies (Rentrak, Shareablee, Proximic) maintain separate auth stacks including an ASP.NET/Ext JS 4.1 SSO portal. The CMS REST API requires no authentication for read access."
date: "2026-04-14"
time: "06:30"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [eZ Platform, CloudFront, jQuery, Google Sheets, ASP.NET]
trackers: [Oracle Eloqua, Google Analytics 4, Google Ads, LinkedIn Insight, Google Tag Manager, UserWay]
tags: [audience-measurement, cms-api, data-infrastructure, acquisition-debt, google-sheets, pii-exposure, b2b, adtech, user-enumeration, legacy-stack]
headline: "Comscore's unauthenticated CMS API exposes the full employee roster -- names, emails, and account status for every admin and editor."
findings:
  - "The eZ Platform REST API at /api/ezp/v2/ requires no authentication -- 16 admins and 25 editors are fully enumerable with names, corporate email addresses, enabled/disabled status, and password-change timestamps."
  - "A third-party developer's admin account (email at an external Ibexa consulting agency) is enabled in the Administrator users group with a password last changed in August 2023."
  - "The trash endpoint returns 1,009 deleted content items with full metadata -- including version histories dating to 2002 -- without any authentication."
  - "All public rankings data (digital media top 50, box office, TV ratings, search share) is served from publicly downloadable Google Sheets with internal editorial metadata columns still attached."
  - "The internet's dominant audience measurement company does not measure its own marketing site with its own product -- scorecardresearch.com is absent from all network traffic on www.comscore.com."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Comscore is the company that tells the internet how much of it anyone is reading. Publishers optimize headlines for Comscore rankings. Advertisers pay for Comscore-measured audiences. Regulators cite Comscore data in market concentration analysis. The company's business is knowing, in granular detail, who is online and where they go. Its own infrastructure tells a different story.

## Architecture

The public marketing site at `www.comscore.com` runs **eZ Platform Enterprise v2** (now Ibexa), an enterprise PHP/Symfony CMS, delivered through CloudFront with a 5-minute TTL. It is not a SPA -- pages are server-rendered, jQuery 3.7.1 handles front-end interaction, and Bootstrap 4.1 provides layout. The response headers are unusually chatty about the internals: `x-powered-by: eZ Platform Enterprise v2`, `x-platform-cluster: mofdocfkojhbg-main-bvxea6i`, `x-platform-processor`, and `x-platform-router` identify the cluster and node. `traceresponse` headers carrying OpenTelemetry trace IDs appear on every page response. `x-debug-info: eyJyZXRyaWVzIjowfQ==` decodes to `{"retries":0}` -- a retry counter baked into every HTTP response. The `xkey` header exposes eZ Platform's cache tag structure: `ez-all content-170 content-type-42 location-2 parent-1 path-1 path-2`, which maps directly to internal content object IDs. The homepage content object is ID 170, content type 42, at location 2.

The CMS schema, retrievable without authentication from the API (see below), contains 112 content types. They document the full operational surface of the site: `about_us_landing_page`, `blog_page`, `careers_page`, `case_study_page`, `client_listing_page`, `company_details`, `confirmation_page`, `contact_page`, `digital_role`, `industry_landing_page`, `partner_listing_page`, `podcast_page`, `presentations_page`, `press_release_page`, `product_page`, `ranking_page`, `redirect_page`, `sales_force_form`, `testimonial`, `webinar_description` -- and five variants suffixed `_proximic`, content type artifacts from the Proximic acquisition (2014) that were never removed from the schema.

Subdomains run different stacks:

- `auth2.comscore.com` -- ASP.NET login portal running **Ext JS 4.1** (released 2012). This is the SSO backend for Comscore's products. Asset versioning is `v=9595` -- a non-semantic counter.
- `core.comscore.com` -- modern JavaScript app, version `2.202.3`, with Clarity, Userflow, and Zendesk.
- `mymetrix.comscore.com` -- redirects to `/app/`, served via CloudFront. CSP includes `appnexus.com` and `vw.rentrak.com` -- a Rentrak vanity URL still in production use.
- `tv.comscore.com` -- TV measurement product.
- `ir.comscore.com` -- investor relations.
- `ondemand.rentrak.com` -- legacy Rentrak portal, still live under the Rentrak domain.

The CORS configuration on the main site includes `access-control-allow-origin: https://pod03.eloquaeditors.com` -- the Oracle Eloqua editor environment is whitelisted for cross-origin calls against the main site's responses. This appears on all main-site responses, not on a specific API endpoint.

An S3 bucket, `csm-comscore-homepage.s3.amazonaws.com`, is referenced in the Content Security Policy. Direct requests return 403, so bucket listing is blocked, but its presence confirms S3-hosted assets in the content delivery chain.

## The Open CMS API

The eZ Platform REST API at `https://www.comscore.com/api/ezp/v2/` is fully accessible without authentication. Standard credential gates -- Bearer tokens, HTTP Basic auth, session cookies -- are absent for read operations. Any HTTP client can request the API root, enumerate content types, traverse the content tree, list user groups, and retrieve full user records.

The API root responds to:

```
GET /api/ezp/v2/
Accept: application/vnd.ez.api.Root+json
```

The response maps every eZ Platform API endpoint: content objects, content types, content type groups, users, user groups, roles, sections, trash, views, and object states.

### User Enumeration

The user endpoint returns full records by numeric ID:

```
GET /api/ezp/v2/user/users/{id}
Accept: application/vnd.ez.api.User+json
```

The response includes: `name`, `login`, `email`, `enabled` (boolean), `passwordUpdatedAt` (Unix timestamp), `maxLogin`, `hasStoredLogin`, and group memberships. The fields come back in both a top-level summary and in the full `Version.Fields` block containing the raw eZ Platform `user_account` field value.

User IDs are not strictly sequential but iterate predictably -- gaps exist between legacy accounts in the low ranges and recent additions in the 60,000s. Known user IDs are fully readable.

The group membership endpoints expose the full roster by group:

```
GET /api/ezp/v2/user/groups/1/5/subgroups
Accept: application/vnd.ez.api.UserGroupList+json
```

Returns 11 subgroups:

| Group Name | Notes |
|-----------|-------|
| Members | General members |
| Administrator users | 16 accounts |
| Editors | 25 accounts |
| Partners | Empty |
| Datamatrix | Internal |
| DataMatrix New | Internal |
| Press | Media contacts |
| Interns | Intern accounts |
| Anonymous Users | System default |
| Partners DAx | Partner tier |
| Partners Audience Measurement | Partner tier |

The **Administrator users group** contains 16 accounts -- 8 enabled, 8 disabled. All return name, login, email, and enabled status without any authentication.

One account stands out: UID 64516, login `dbroadfoot`, email at contextualcode.com. ContextualCode is an Ibexa (eZ Platform) development and consulting agency. A vendor's developer account is enabled in the Administrator users group. Its `passwordUpdatedAt` timestamp corresponds to 2023-08-05 -- the most recent credential update in the admin group.

The **Editors group** contains 25 accounts, all disabled. They include former public-facing Comscore staff whose names appear in the company's published research, now deactivated but still enumerable. The oldest accounts in this group have IDs in the 1,000-1,100 range.

Disabled accounts remain in the API response indefinitely -- there is no evidence of account removal from the system after deactivation.

### Trash

The trash endpoint returns 1,009 deleted content items without authentication:

```
GET /api/ezp/v2/content/trash
Accept: application/vnd.ez.api.Trash+json
```

Each item returns content name, type, owner reference, publication date, last modification date, and version history count. Items include content dating to 2002 through 2024. The trash holds old Privacy pages, social media icon assets published in 2011 (Twitter Icon, Facebook icon, LinkedIn icon, Digg icon, RSS icon, YouTube icon -- some with `versionNo` counts in the hundreds), and deleted product pages. The `Status: TRASHED` field confirms these items are no longer published, but metadata is fully readable.

### Content Types

```
GET /api/ezp/v2/content/types
Accept: application/vnd.ez.api.ContentTypeInfoList+json
```

Returns all 112 content types with identifiers and human-readable names. The full list maps Comscore's content architecture and acquisition history. The five `_proximic` variants confirm the site's content type schema was never cleaned up after the 2014 Proximic acquisition.

### What Is Not Exposed

The `Roles` and `Sections` endpoints return empty lists -- these appear to require authentication or are intentionally empty. Content object `Version` fields for most content objects return without body content, suggesting field-level read access controls are in place for the actual article/page text. The exposure is in metadata and user records, not raw content bodies.

Write endpoints (POST, PUT, DELETE) were not tested.

## Google Sheets as Data Infrastructure

Comscore's public rankings data is not served from a database or an API layer Comscore controls. It is served directly from publicly published Google Sheets.

The rankings page fires 40 parallel HTTP requests to Google Sheets on load:

```
GET https://docs.google.com/spreadsheets/d/e/2PACX-1vRwC9Dn3f_osOh5PNrFIxRpsg.../pub?...
GET https://docs.google.com/spreadsheets/d/e/2PACX-1vTQyrxuD4598dlkA7pa6Gu51HNO.../pub?...
```

The `2PACX` format is Google's "published" spreadsheet format -- these are publicly accessible Google Sheets with no authentication required. Anyone with the URL can download the full dataset.

Both spreadsheet IDs cover different ranking categories. The sheets contain multiple tabs: social engagement rankings by vertical (Beverages, Hotels, etc.), search market share data, digital media rankings, box office estimates, TV ratings.

The homepage uses the Google Visualization Query API (gviz/tq format with JSONP callback) for the rotating chart data (box office, TV, digital media).

The spreadsheets contain more columns than the website renders. The internal columns include:

- `Full_Title` -- full chart title (vs. the truncated display version)
- `Location` -- data source geography (e.g., "Total U.S. - Desktop Home & Work Locations")
- `Source` -- methodology attribution (e.g., "qSearch", "Media Metrix Multi-Platform")
- `Footer1` through `Footer4` -- footnote text for methodology disclaimers
- `Right` -- column display control codes
- `sort_by_column`, `sort_direction` -- front-end sorting parameters baked into the data layer

Sample data from the February 2026 digital media top 50:

| Property | Unique Visitors (000) | % Reach |
|----------|----------------------|---------|
| Alphabet | 278,864 | 98.9% |
| Microsoft Sites | 244,371 | 86.6% |
| Yahoo | 240,112 | 85.1% |
| The Walt Disney Company | 240,087 | 85.1% |
| Paramount Global | 238,932 | 84.7% |

Search share data from the rankings page:

| Entity | Jan-2026 | Feb-2026 | Point Change |
|--------|---------|---------|--------------|
| Google Sites | 60.4% | 60.5% | +0.1 |
| Microsoft Sites | 29.0% | 29.0% | 0.0 |
| Verizon Media | 10.0% | 9.9% | -0.1 |
| Ask Network | 0.6% | 0.6% | 0.0 |

The data and its provenance fields are accessible by any HTTP client with the spreadsheet URL. No rate limiting was observed.

## Acquisition Archaeology

Comscore's product history shows up plainly in the login dropdown. Four separate login experiences exist for one company's products:

1. **auth2.comscore.com** -- ASP.NET + Ext JS 4.1 (2012). The SSO gateway for multiple products.
2. **core.comscore.com** -- Modern app (v2.202.3). Shareablee social analytics lives at `/login/shareablee`. Comscore acquired Shareablee in 2021.
3. **ondemand.rentrak.com** -- Legacy Rentrak portal. Rentrak was acquired in 2016 for $732M. The domain is still live and still branded Rentrak.
4. **mymetrix.comscore.com** -- Legacy metrics portal. CSP includes `vw.rentrak.com` -- a Rentrak vanity URL still referenced in production config.

Separate logins also exist for **boxofficeessentials.com** and **iboe.com** (International Box Office Essentials) -- acquired products maintaining their own domains and presumably their own auth.

The CMS schema reflects the same pattern. Five `_proximic` content types remain in the eZ Platform schema from the Proximic acquisition (2014). The Proximic product (now "Proximic by Comscore") was a contextual targeting company; its content type variants were never removed from the CMS schema after integration.

The pattern is consistent: Comscore acquires companies, retains their technical infrastructure running in parallel, and layers the new products into the existing navigation without consolidating auth or tech stacks.

## Tracking & Surveillance

The marketing site fires tracking on first visit with no consent prompt visible.

**Cookies set on load (before any interaction):**
- `eZSESSID74e6a8b111ea7da1a7d0a596f4c35208` -- eZ Platform session cookie. HttpOnly, Secure. The session ID hash in the cookie name is derived from the application secret.
- `location` -- geo-routing cookie (`country_abbr`, `cont_abbr`, `country_name`). HttpOnly, Secure. 7-day expiry. Domain: `.comscore.com`.
- `elqls=Web%3A%20Direct%20Entry` -- Oracle Eloqua traffic source tracking.
- `elqlsd=` -- Eloqua landing page date.
- `cspprom62722=1` -- CSP promotion tracking.
- `_gcl_au` -- Google Ads conversion linker.
- `_ga_ZLVS5VTRQ7` -- Google Analytics 4 session.
- `_ga` -- GA4 client ID.

**LocalStorage:**
- `li_adsId` -- LinkedIn Ads user identifier.
- `_gcl_ls` -- Google conversion linker state.
- `uw-uid`, `uw-tunings`, `uw-tunings-checksum`, `uw-icon-locales` -- UserWay accessibility configuration cache.

**Third-party network requests on homepage load:**
- `api.userway.org` -- 8 requests: tunings, link accessibility checks, alt description lookups
- `www.google.com/ccm/collect` -- Google conversion measurement
- `www.google.com/pagead/1p-conversion/950171744/` -- Google Ads conversion
- `px.ads.linkedin.com` -- LinkedIn attribution
- `www.google-analytics.com/g/collect` -- GA4 measurement
- `www.googleadservices.com/pagead/conversion/950171744/` -- Google Ads
- `googleads.g.doubleclick.net/pagead/viewthroughconversion/950171744/` -- view-through conversion

**Tracker inventory:**

| Tracker | Identifier | Purpose |
|---------|-----------|---------|
| Oracle Eloqua | img03.en25.com, site ID 118899503 | B2B marketing automation |
| Google Analytics 4 | G-ZLVS5VTRQ7 | Pageview and behavioral |
| Google Ads | AW-950171744 | Conversion tracking |
| LinkedIn Insight Tag | snap.licdn.com | B2B audience attribution |
| Google Tag Manager | GTM-WZNPWD | Container for above |
| UserWay | api.userway.org, site ID 1471460 | Accessibility widget |

**UserWay configuration** is readable from the tunings API response. The site uses a white-label configuration: `WHITE_LABEL.is_enabled: true`, with `hide_logo`, `hide_report`, `hide_manage`, and `hide_asterisk` all set to true -- all UserWay branding is removed from the widget. `paidAi: true` indicates the AI-powered accessibility tier.

**Absent:** `scorecardresearch.com` -- Comscore's own content measurement pixel -- does not appear in any network traffic from `www.comscore.com`. The measurement company's public marketing site is not measured by its own product. The CSP mentions `census-web.scorecardresearch.com` and `sb.scorecardresearch.com`, but only in the `mymetrix.comscore.com` CSP for the customer portal. The public marketing site uses Google Analytics and Oracle Eloqua instead.

## Supporting Details

**Template bug:** The search page at `/comscore/search` renders with the title "title - Comscore, Inc." -- a Smarty template variable `{$title}` that was never resolved. The robots.txt explicitly disallows `/comscore/search` with the note "added to stop google / bing / etc indexing search results pages, which should not be in index and can lead to unwanted traffic from bots." The fix was blocking the page from crawlers rather than resolving the template.

**No sitemap.xml:** Direct requests to `/sitemap.xml` return a 404 HTML page. No sitemap reference in robots.txt.

**Brightcove video:** `players.brightcove.net` is referenced in the CSP for hosted video content.

**Elfsight widgets:** `static.elfsight.com` in the CSP for social widget embeds.

**Calendly:** `calendly.min.js` loads on pages with scheduling CTAs.

**robots.txt disallows:** `/comscore/search`, `/*?`, `/request/`, `/drafts/`, `/rss_items/`, `/redirects/`, `/cmr/`, `/layout/set/popup/`, `/*.pdf$`, `/rus/*`, `/dut/*`. AhrefsBot is completely blocked. The `/layout/set/popup/` path (eZ Platform popup layout for contact forms) remains accessible despite the disallow.

---

## Machine Briefing

Comscore's public marketing site has two significant open surfaces: the eZ Platform REST API and the Google Sheets data layer. Neither requires authentication.

### Access & Auth

The main site (`www.comscore.com`) sets a session cookie (`eZSESSID...`) on first request. It is not needed for read API access -- all read endpoints return data without it. The session cookie is scoped to write/authenticated operations.

No auth is required for:
- All `/api/ezp/v2/` read endpoints
- Google Sheets published endpoints (2PACX format, gviz/tq format)

### Endpoints

**eZ Platform API root:**
```
curl -H "Accept: application/vnd.ez.api.Root+json" \
  "https://www.comscore.com/api/ezp/v2/"
```

**All content types (112):**
```
curl -H "Accept: application/vnd.ez.api.ContentTypeInfoList+json" \
  "https://www.comscore.com/api/ezp/v2/content/types"
```

**User groups (top level):**
```
curl -H "Accept: application/vnd.ez.api.UserGroupList+json" \
  "https://www.comscore.com/api/ezp/v2/user/groups/1/5/subgroups"
```

**Administrator users group (path /1/5/13):**
```
curl -H "Accept: application/vnd.ez.api.UserList+json" \
  "https://www.comscore.com/api/ezp/v2/user/groups/1/5/13/users"
```

**Editors group (path /1/5/14):**
```
curl -H "Accept: application/vnd.ez.api.UserList+json" \
  "https://www.comscore.com/api/ezp/v2/user/groups/1/5/14/users"
```

**Individual user by ID:**
```
curl -H "Accept: application/vnd.ez.api.User+json" \
  "https://www.comscore.com/api/ezp/v2/user/users/{id}"
```
Returns: `name`, `login`, `email`, `enabled`, `passwordUpdatedAt`, group memberships.

**Trash (1,009 items):**
```
curl -H "Accept: application/vnd.ez.api.Trash+json" \
  "https://www.comscore.com/api/ezp/v2/content/trash"
```

**Content object by ID:**
```
curl -H "Accept: application/vnd.ez.api.ContentInfo+json" \
  "https://www.comscore.com/api/ezp/v2/content/objects/{id}"
```

**Location tree:**
```
curl -H "Accept: application/vnd.ez.api.Location+json" \
  "https://www.comscore.com/api/ezp/v2/content/locations/1/2"
```

**Google Sheets -- Rankings (CSV, direct download):**
```
# First sheet set (social engagement, search share, etc.)
curl "https://docs.google.com/spreadsheets/d/e/2PACX-1vRwC9Dn3f_osOh5PNrFIxRpsg_wANOP8QBU2ykWdbmNbWoYYXGWM8xYnuOO4KtDv8zlD4dDxtRrKRU2/pub?output=csv&gid={sheet_gid}"

# Second sheet set (TV, box office, digital media)
curl "https://docs.google.com/spreadsheets/d/e/2PACX-1vTQyrxuD4598dlkA7pa6Gu51HNOloE4BPVUuBVMycA6LC0rfuzD5dU0x-WwMRf8Mk-wnm8W1_8PjxOF/pub?output=csv&gid={sheet_gid}"
```

**Google Visualization API -- Homepage charts (JSONP):**
```
curl "https://docs.google.com/spreadsheets/d/1l-yq6MX8Egp5ITuKxmVl0LXUc2TeMYaGW6urqXTKSQ8/gviz/tq?tqx=out:json&sheet={sheet_name}"
```
The callback wraps a JSON table with column metadata and row values. Parse from after `setResponse(` to the closing `);`.

### Gotchas

- **Content type accept headers matter.** The eZ Platform API ignores requests with wrong or missing `Accept` headers. Use the format `application/vnd.ez.api.{TypeName}+json` matching the resource type.
- **User ID iteration is sparse.** IDs jump from the ~1,000 range to ~14,000 to ~60,000+ with gaps. Enumerate via group endpoints for complete lists rather than sequential ID walking.
- **Trash endpoint returns all 1,009 items in a single response.** No pagination observed.
- **Google Sheets GIDs.** The `gid` parameter is the numeric sheet ID. Discover available GIDs by fetching the sheet's feed index or inspecting the rankings page source for the full list of tab queries.
- **gviz/tq sheet names** are case-sensitive and must match the tab name exactly (e.g., `worldwide_box_office`, `digital_media_top50_mp`).
- **No rate limiting observed** on any eZ Platform API endpoint during testing.
- **Write endpoints not tested.** POST/PUT/DELETE behavior is unknown.
