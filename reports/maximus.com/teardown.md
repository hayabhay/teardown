---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Maximus — Teardown"
url: "https://maximus.com"
company: "Maximus"
industry: Government
description: "U.S. government IT and services contractor managing Medicaid, Medicare, and disability programs."
summary: "Adobe Experience Manager site served via Fastly CDN with AEM admin endpoints blocked at the dispatcher layer. A 512KB GTM container holds 248 tag entries across a full B2G advertising stack. Careers route to Avature ATS. Contact forms are cross-origin Smartsheet iframes. Privacy statement hosted via OneTrust Privacy Portal."
date: 2026-04-13
time: "06:56"
contributor: hayabhay
model: "sonnet-4.6"
effort: medium
stack: [Adobe Experience Manager, Fastly, Google Tag Manager, OneTrust, Avature]
trackers: [Google Analytics 4, Google Ads, Adobe Analytics, Adobe Audience Manager, LinkedIn Insight Tag, Trkn.us, StackAdapt, Appcast, Adobe Helix RUM]
tags: [government, aem, b2g, advertising, consent, fastly, google-ads, onetrust, programmatic, surveillance]
headline: "Google Ads Enhanced Conversions auto-scrapes emails, phones, and addresses from every form on this Medicaid enrollment contractor's site."
findings:
  - "The GTM container configures Google Ads Enhanced Conversions in AUTO mode with all PII flags enabled -- the tag scans every form field on the page for emails, phone numbers, and addresses, hashes them, and sends them to Google for conversion matching."
  - "Trkn.us, a government-audience programmatic ad platform, runs 8 retargeting segments keyed to content verticals -- a visitor reading about Navy contracts lands in a separate ad pool from one reading about Medicaid services."
  - "An unauthenticated AEM search API returns JCR content paths, internal taxonomy tags, DAM image paths, and template names for all 562 published pages -- while the site's public search UI returns a 404."
  - "Only 1 of the GTM container's 248 tags has a formal consent field -- all third-party ad pixels (Trkn.us, StackAdapt, LinkedIn, Appcast) rely on trigger conditions checking a dataLayer variable rather than the GTM consent schema."
  - "The OneTrust geo rule group is labeled 'Maximus and Investors' -- the consent experience was configured for a B2G and investor audience, not the general public."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Maximus Inc. (NYSE: MMS) is a McLean, Virginia government IT and services contractor founded in 1975. The company manages Medicaid eligibility determinations, Medicare enrollment, disability benefit processing, and citizen contact centers for U.S. federal and state agencies. Its website is a marketing site for winning government contracts and recruiting employees -- not a consumer-facing service. That context shapes everything about its technical choices.

## Architecture

The site runs on Adobe Experience Manager (AEM) in publish mode, confirmed by the `x-vhost: maximus_com publish` response header. Fastly CDN serves content from a Palo Alto point of presence (`x-served-by: cache-pao-kpao1770072-PAO`), with a five-minute cache on the homepage (`cache-control: max-age=300`). jQuery and AEM clientlibs power the front-end. Adobe Helix Real User Monitoring (RUM) runs via a `/.rum/@adobe/helix-rum-js@^2/dist/micro.js` endpoint -- a POST-only beacon collector that returns 400 on GET.

The SSL certificate's Subject Alternative Names reveal four campaign microsites folded into the main domain:

- `benefits.maximus.com` → `/employees`
- `maximusconnects.com` → `/connects`
- `mycio-sp3.com` → `/cio-sp3-small-business`
- `alignedevolution.com` → `/aligned-evolution`

All four redirect to paths on `maximus.com` -- separate domain registrations for programs or campaigns now served under a unified brand.

**Adobe Client Data Layer (ACDL):** Every page embeds the AEM Adobe Client Data Layer as inline JavaScript, exposing the full JCR content tree path, last-modified timestamp, component type, and template path for each page. On the homepage: `repo:path: "/content/maximus-com/us/en.html"`. On the leadership page for the CEO: `repo:path: "/content/maximus-com/us/en/leadership/bruce-caswell.html"` with `repo:modifyDate: "2026-04-06T19:16:44Z"` -- the exact timestamp of the last CMS edit, visible to anyone with browser DevTools. This is standard ACDL behavior, not a misconfiguration, but content freshness signals are publicly readable.

A `/.well-known/security.txt` request redirects to `/content/dam/maximus-com/.well-known/security.txt`, exposing the AEM DAM internal path structure in a 301 response header. The same pattern applies to `humans.txt` and `llms.txt`.

**Security headers:** `x-frame-options: SAMEORIGIN`, `x-content-type-options: nosniff`, `strict-transport-security: max-age=31536000; includeSubdomains; preload`. Standard hardening, correctly applied.

The sitemap contains 562 URLs spanning insights articles (138), news and events (93), employee profiles (86), case studies (32), Foundation Insights (25), leadership bios (22), and location pages for careers. Careers location pages redirect to `maximus.avature.net` -- an enterprise applicant tracking system (ATS) running a separate subdomain with its own privacy statement.

## AEM Security Posture

AEM deployments routinely expose dangerous admin endpoints if misconfigured. Maximus blocks them at the CDN/dispatcher layer:

- `/system/console/bundles.json` -- 403 (CDN blocks before reaching AEM)
- `/crx/de/index.jsp` -- 404 (CRX Repository Explorer not exposed)
- `/bin/wcm/search/gql.json` -- 404
- `/bin/querybuilder.json` -- returns custom 404 HTML
- Content node endpoints (`.infinity.json`, `.json`) -- 404 across tested paths

The CSRF token endpoint (`/libs/granite/csrf/token.json`) returns `{}` with `x-sky-isauth: 0` -- the correct behavior for an unauthenticated session, confirming no token leakage. An AEM Author instance exists at `author.maximus.com` (returns 403 from Fastly) -- accessible only to editors with direct auth, blocked from the public. This is a well-configured AEM deployment.

## The Search API

The site has no working public search UI: navigating to `/search?q=anything` returns a 404. The navigation clientlibs contain search form code, but it appears disabled or unconfigured.

An AEM search API endpoint is reachable without authentication:

```
GET https://maximus.com/maximus-search-page/_jcr_content/root/container/maximus-search-results.results.json?q=medicaid
```

It returns 87 results for "medicaid", paginated at 9 per page. Each result object includes:

- `path` -- the full AEM JCR content path, e.g., `/content/maximus-com/us/en/state-and-local-campaigns/medicaid`
- `url` -- the public URL
- `title` and `description`
- `tags` -- the full AEM tag taxonomy with category and value, e.g., `{"title":"Medicaid","category":"topics","value":"maximus-com:topics/medicaid"}`
- `image` and `imageUrl` -- DAM image paths, e.g., `/content/dam/maximus-com/state-local-campaign-images/...`
- `properties.contentTypeClass`, `properties.contentType` (e.g., "Article")
- `properties.cq:template` -- the AEM template path, e.g., `/conf/maximus-com/settings/wcm/templates/campaign`

This is a marketing search endpoint returning only published content -- no user data, no contract details, no internal records. The JCR paths and taxonomy structure are operational detail rather than sensitive data. The endpoint is open, unauthenticated, and CORS-unrestricted, consistent with how AEM search components are often deployed for CDN-cached experiences. The contrast is that no public-facing search UI exists to use it -- the API is live, the UI is not.

## Consent Architecture

OneTrust manages consent. On first load with no prior cookies, only two third-party domains make requests: `cdn.cookielaw.org` (SDK and banner assets) and `geolocation.onetrust.com` (IP-based consent template selection). No ad trackers, no analytics.

Two consent rulesets are configured:

| Ruleset | Type | Template | GPC |
|---------|------|----------|-----|
| California | CCPA | MWE CA Opt-In Banner | Enabled |
| Global | Generic | MWE US Opt-Out Banner (Non-CA) | Enabled |

The OneTrust geo rule group name for this implementation is `"Maximus and Investors"` -- an enterprise label applied during OneTrust setup, reflecting that this consent experience was designed for a B2G and investor-facing audience rather than a general consumer public.

Default cookie state on first load: `groups=C0001:1,C0003:0,C0002:0,SPD_BG:0,C0004:0`

- C0001 (Strictly Necessary): on
- C0002 (Performance): off
- C0003 (Functional): off
- C0004 (Targeting/Advertising): off
- SPD_BG: off (purpose undocumented)

TenantGuid: `b1e76efe-5a14-4bc5-a879-9238f67bce9a`

**Two blocking mechanisms run in parallel:**

Adobe Launch (`assets.adobedtm.com/63e6c9fa6c47/c4309343ad3c/launch-b43457ac3df7.min.js`) is set as `type="text/plain"` with class `optanon-category-C0002-C0003-C0004`. OneTrust rewrites the type to `text/javascript` once the user accepts those categories -- a standard consent-by-blocking pattern. Adobe Analytics, Adobe Audience Manager, and video tracking are all gated behind this.

GTM (`GTM-PC28RHJG`) takes a different approach: it loads unconditionally via a `<script src>` in the page HTML. The consent logic lives inside GTM, not outside it. Tags fire based on GTM trigger conditions that check `OnetrustActiveGroups` in the data layer. The data layer on a fresh load shows:

```json
{"event": "OneTrustLoaded", "OnetrustActiveGroups": ",C0001,"}
{"event": "OptanonLoaded", "OptanonActiveGroups": ",C0001,"}
{"event": "OneTrustGroupsUpdated", "OnetrustActiveGroups": ",C0001,"}
```

Only C0001 is active, so ad and analytics tags check for C0002/C0003/C0004 in their trigger conditions and do not fire. Only one tag in the entire 248-tag container has a formal `"consent"` field in the GTM consent schema: tag ID 17 (`__cegg`, Google Consent Mode signal) requires `ad_storage`. All third-party pixel tags -- Trkn.us, StackAdapt, LinkedIn, Appcast -- have no formal consent field. They rely entirely on trigger condition logic checking the `OnetrustActiveGroups` data layer variable. If trigger conditions were misconfigured, those pixels would fire without consent. As currently deployed, the consent signal is functioning correctly.

## Surveillance Stack

The GTM container (GTM-PC28RHJG) weighs 512KB and contains 248 tag entries:

| Tag type | Count |
|----------|-------|
| GA4 event (`__gaawe`) | 39 |
| Custom tag template (`__tg`) | ~150 |
| Click/event listeners | 40+ |
| Google tag config | 5 |
| Google Ads conversion | 4 |
| HTML custom tag | ~12 |
| Paused | 4 |

**Google Analytics 4:**

- Measurement ID: `G-Y0PJ3YFQNL` (main site)
- Measurement ID: `G-JPZQR5G9T8` (maximus.avature.net careers subdomain)
- 39 named events including: `modern_military_healthcare_video_click`, `contact_us_click`, `join_our_team`, `insights_click`, `download_brochure`, `case_study_click`, `video_plays`, `capability_section_click`, `downloadable_resource_click`, `outbound_link_click`, `play_product_overview_video`, `download_product_sheet_brochure`, `expert_profile_click`, `play_fed_defense_vid`, `play_citizen_services_vid`, `play_health_it_vid`, `download_whitepapers_reports`, `download_brochure_cyber_pdf`, `read_full_story_click`, `technology_capability_click`, `play_nat_sec_insights_vid`, `play_insights_video`, `insights_case_study_click`, `feature_capability_section_click`, `health_case_study_click`, `SF - Download - Click`, `SF - Request Meeting`, `SF - Video Play`, `SF - Strategic Partner`, `Fed health - Capabilities`, `page_click`, `federal - ccc - case study click`, `federal - ccc - download ebook`, `federal - ccc - TXM - click`

The "SF -" prefixed events track a Salesforce co-marketing campaign page at `/news-and-events/salesforce`. The "federal - ccc -" events track a Federal Cloud Computing campaign section.

**Google Ads:**

Conversion IDs: AW-372902267, AW-11319715261, AW-11319907775, AW-11320743013. Four separate conversion tracking accounts suggest multiple campaigns, agencies, or subsidiaries running distinct attribution.

**Adobe Analytics (consent-gated):**

Tracking server: `maximusinc.sc.omtrdc.net`. Report suite: `maximusinc`. Gated behind Adobe Launch with C0002-C0004 consent required.

**Adobe Audience Manager (consent-gated):**

Endpoint: `dpm.demdex.net`. Seven references in the Adobe Launch container. Consent-gated.

**Trkn.us:**

Government-audience programmatic advertising platform. Eight pixel segments:

| Segment | Group ID | Pixel |
|---------|----------|-------|
| Sitewide | 62390 | `ppt=24912;g=sitewide;gid=62390` |
| Homepage | 68792 | `ppt=24912;g=homepage;gid=68792` |
| Federal | 68827 | `ppt=24912;g=federal;gid=68827` |
| Defense | 68790 | `ppt=24912;g=defense;gid=68790` |
| Navy | 68791 | `ppt=24912;g=navy;gid=68791` |
| Downloads | 68793 | `ppt=24912;g=downloads;gid=68793` |
| Contact Us | 68795 | `ppt=24912;g=contact_us;gid=68795` |
| Video Starts | 68794 | `ppt=24912;g=video_starts;gid=68794` |

Each segment fires on different URL patterns or behaviors. A visitor reading the defense or navy contract pages lands in a distinct retargeting pool from one reading about Medicaid services. The downloads and contact_us segments capture the highest-intent signals -- people who downloaded contract materials or navigated to the inquiry form. The granularity maps precisely to federal agency procurement verticals -- this is a B2G retargeting setup designed to follow government decision-makers across the web.

**StackAdapt:**

Single pixel: `tags.srv.stackadapt.com/events.js?ts=WImFjB29Np8KxqH_XQGQDQ`. Programmatic display advertising.

**LinkedIn Insight Tag:**

Partner ID: `5171274`. Two tag instances (IDs 225 and 248). LinkedIn's Insight Tag enables demographic retargeting and conversion tracking against LinkedIn user profiles -- the platform most used by government procurement officers.

**Appcast:**

Pixel: `click.appcast.io/pixels/one-10819.js?ent=417`. Appcast is a recruitment advertising platform. This pixel builds retargeting audiences for Maximus's hiring campaigns -- separate from the B2G contract advertising.

**Paused tags:**

Four tags are paused: IDs 25, 35, 40 (all `__gaawe` GA4 events) and ID 31 (a custom HTML tag). Their event names and content are not recoverable -- they were disabled without being removed.

## Google Ads Enhanced Conversions

The GTM container includes a Google Ads Enhanced Conversions macro configured in AUTO mode:

```json
{
  "function": "__awec",
  "vtp_mode": "AUTO",
  "vtp_autoPhoneEnabled": true,
  "vtp_autoAddressEnabled": true,
  "vtp_autoEmailEnabled": true,
  "vtp_enableElementBlocking": false,
  "vtp_isAutoCollectPiiEnabledFlag": true
}
```

In AUTO mode, the `detect_user_provided_data` API scans form fields on the page for email addresses, phone numbers, and postal address components (first name, last name, street, city, region, country, postal code). Matches are hashed and forwarded to Google Ads for conversion matching -- connecting form submissions to Google user identities for ad attribution.

The practical scope is limited by how Maximus delivers its forms. The main contact form and primary CTA forms are embedded as cross-origin Smartsheet iframes:

- `app.smartsheet.com/b/form/a1b3f7563ef0489a853e776861f7f8b8` (main contact)
- `app.smartsheet.com/b/form/6546e0e0c6924584b22724c50149ac6d` (CTA buttons)

Cross-origin iframes are not accessible to scripts running in the parent frame -- the AUTO scraper cannot reach form fields inside a Smartsheet iframe. If all inquiry forms on the site are Smartsheet-embedded, Enhanced Conversions AUTO mode would collect no PII from them. Any first-party forms elsewhere on the site (newsletter subscriptions, event registrations) would be scanned.

The Maximus privacy statement discloses sharing "personal and online identifiers, internet activity, and inferences" with advertising networks for targeted advertising. It does not specifically describe PII hashing for conversion matching.

## Contact Form Infrastructure

The contact forms are Smartsheet cross-origin iframes. Submissions go to Smartsheet's servers, not to Maximus infrastructure. Google reCAPTCHA (key: `6LfbDqAUAAAAAPc856qavjKSEVbYbOIj3lAb2x3l`) loads when the contact page renders, before any consent interaction -- the reCAPTCHA challenge fires on iframe load, not on form submission.

## The B2G Advertising Stack

Maximus's primary customers are government agencies -- federal departments, state Medicaid programs, VA contractors. The website's advertising stack is not selling a product to a consumer. It is running retargeting campaigns against government procurement staff to win contract awards.

The Trkn.us segments are structured around procurement signals: who visited the defense pages, who visited the navy pages, who downloaded contract materials, who reached the contact form. The LinkedIn Insight Tag targets the professional network where federal contracting officers spend time. The four Google Ads conversion IDs suggest active paid search campaigns competing for government RFP-related queries.

Maximus simultaneously manages sensitive citizen data -- Medicaid eligibility decisions, disability determinations, Medicare enrollments -- and runs a commercial surveillance stack on its own website. The surveillance is not directed at the citizens it serves; it is directed at the bureaucrats who award the contracts to serve them.

## Machine Briefing

**Access & auth:** No authentication required for any of the endpoints below. The site is AEM Publish behind Fastly. Admin endpoints are blocked. No session cookie needed for content retrieval.

**Open endpoints:**

```bash
# Search API -- no auth, no CORS restriction
GET https://maximus.com/maximus-search-page/_jcr_content/root/container/maximus-search-results.results.json?q={term}

# Response shape:
# {
#   "resultTotal": 87,
#   "results": [{
#     "path": "/content/maximus-com/us/en/...",   # JCR path
#     "url": "https://maximus.com/...",
#     "title": "...",
#     "description": "...",
#     "tags": [{"title":"...", "category":"...", "value":"maximus-com:..."}],
#     "imageUrl": "/content/dam/...",
#     "properties": { "contentType": "Article", "cq:template": "/conf/..." }
#   }],
#   "pagination": {...},
#   "facets": {...}
# }

# CSRF token endpoint (returns empty for unauthenticated)
GET https://maximus.com/libs/granite/csrf/token.json
# Response: {} with x-sky-isauth: 0
```

**Blocked endpoints (return 403 or 404 at CDN level):**

```
/system/console/bundles.json     # 403
/crx/de/index.jsp                # 404
/bin/querybuilder.json           # custom 404
/bin/wcm/search/gql.json         # 404
/search?q=*                      # 404
```

**AEM content paths from sitemap (sample):**

```
/insights/*          -- 138 thought leadership articles
/news-and-events/*   -- 93 pages
/employees/*         -- 86 employee profiles
/case-studies/*      -- 32 case studies
/leadership/*        -- 22 executive bios
/careers/*           -- redirect to maximus.avature.net/careers/USHome
```

**GTM container:** `https://www.googletagmanager.com/gtm.js?id=GTM-PC28RHJG` (publicly downloadable, 512KB)

**Adobe Launch container:** `https://assets.adobedtm.com/63e6c9fa6c47/c4309343ad3c/launch-b43457ac3df7.min.js` (publicly downloadable, contains Adobe Analytics/AAM config)

**OneTrust config:** `https://cdn.cookielaw.org/consent/018df043-a21a-711e-ac79-dde3052416a7/` (banner JSON, ruleset definitions, cookie category definitions)

**Gotchas:**

- Search API returns 9 results per page by default. Check `pagination` object in response for offset parameters.
- The AEM ACDL data layer fires inline on every page -- `window.adobeDataLayer` is populated on DOM-ready with JCR metadata. No network request required.
- The careers section (`/careers/*`) immediately redirects to `maximus.avature.net`. Avature has its own session handling and privacy statement.
- No rate limiting was observed on the search API during investigation, but it is a CDN-cached endpoint -- repeated identical queries return cached responses.
- `author.maximus.com` returns 403 -- AEM Author exists at that subdomain, accessible only with Fastly auth passthrough.
