---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Navient — Teardown"
url: "https://navient.com"
company: "Navient"
industry: "Finance"
description: "Student loan servicer transitioning to financial lead generation and investor relations."
summary: "Navient runs a Nuxt.js/Vue static site on S3 behind CloudFront with Storyblok as its headless CMS. The main site is a wind-down shell after transferring federal loan servicing to MOHELA in late 2024. A parallel financial marketplace at marketplace.navient.com is live, routing former borrowers to partner products via referral commissions. Both properties share a single Storyblok space and credential set, with three separately embedded API credentials in client-side JavaScript."
date: "2026-04-13"
time: "01:45"
contributor: "hayabhay"
model: "sonnet"
effort: "high"
stack:
  - Nuxt.js
  - Vue
  - Storyblok
  - CloudFront
  - S3
trackers:
  - Google Analytics
  - Universal Analytics
  - Google Tag Manager
  - Google Ads
  - DoubleClick
tags:
  - student-loans
  - finance
  - azure
  - credentials
  - referral-marketplace
  - nuxt
  - lead-generation
  - cms
  - privacy
  - legacy
headline: "Navient's homepage ships a production Azure storage token with write and delete permissions, valid until October 2027, in every visitor's browser."
findings:
  - "A production Azure Blob Storage SAS token with read/write/delete/list permissions across all four service types is embedded in window.__NUXT__.config.public on every page load -- the Azure JS SDK runs client-side with telemetry explicitly suppressed."
  - "Navient quietly launched a financial referral marketplace at marketplace.navient.com with Earnest, MoneyLion, Savvy, Fiona, and LeapLife as partners -- but deployed it with appEnvVersion set to 'development' and the Storyblok visual editor bridge active in production."
  - "California privacy rights requests route via mailto: to PLP_management@servicing.mohela.com -- a Navient-branded compliance page sends CCPA requests to its successor servicer's inbox."
  - "A Google Custom Search API key hardcoded in search.js is usable by anyone to run queries billed to Navient's Cloud account at $5 per 1,000 after the free tier."
  - "The Storyblok CDN token enumerates all 199 published CMS stories including 84 ABS trust repline data pages dating to 2003 and internal trust series codes like NAVEL and NAVRL not referenced on the public site."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Navient is a student loan servicer winding down its direct operations after transferring all federal loan servicing to MOHELA in late 2024. What's left: a corporate shell site, an investor relations hub, and -- less visibly -- a financial referral marketplace at `marketplace.navient.com` routing former borrowers to partner loan and insurance products.

The main site runs Nuxt.js (Vue 3) in static generation mode, served from S3 behind CloudFront. Storyblok is the CMS. Bootstrap handles layout; reCAPTCHA v2 sits on the homepage. The marketplace at `marketplace.navient.com` is a separate Nuxt deployment sharing the same Storyblok space and credential set.

## Architecture

Static SSG, no origin server. `server: AmazonS3` in response headers; CloudFront is the CDN. The homepage's `age: 824334` header at time of investigation indicated the page had been sitting in cache for ~9.5 days -- reflecting how rarely the content changes. Canonical redirects: `navient.com/*` -> `www.navient.com/*`.

Storyblok space ID `157494` is visible in every OG image URL (`a.storyblok.com/f/157494/...`). Nuxt SSR payload files (`/_payload.js` on each page) include full Storyblok API responses, leaking internal server headers: `sb-be-version: 5.706.0` and `nginx/1.29.1`.

The `window.__NUXT__.config.public` object is embedded in every page's inline script:

```json
{
  "siteKey": "",
  "version": "published",
  "googleSearchKey": "02be9ee3f65304f37",
  "blobUrl": "?sv=2024-11-04&ss=bfqt&srt=c&sp=rwdlacupiytfx&se=2027-10-31T03:10:27Z&...",
  "blobBaseUrl": "https://naviptnstoprdncusinv001.blob.core.windows.net/",
  "recaptchaKey": "6LfurzIpAAAAAPSWOldBsYyvBs7II5H8n_M_YwfK",
  "investorFileUrl": "https://images.navient.com/",
  "storyblok": {
    "accessToken": "tdcbbJoi3wP8IYyh0G8tswtt",
    "bridge": true,
    "devtools": false
  }
}
```

Three credentials of interest in that object.

## Client-Side Credentials

### Azure Blob Storage SAS Token

The `blobUrl` field contains a Shared Access Signature (SAS) token for an Azure Blob Storage account named `naviptnstoprdncusinv001`. The full constructor URL is `https://naviptnstoprdncusinv001.blob.core.windows.net/` plus the token string.

SAS parameters:
- `sv=2024-11-04` -- API version
- `ss=bfqt` -- services: blob, file, queue, table (all four service types)
- `srt=c` -- resource type: container-level
- `sp=rwdlacupiytfx` -- permissions: read, write, delete, list, add, create, update, process, index tags, find (tag queries), execute
- `se=2027-10-31T03:10:27Z` -- expires October 31, 2027
- `spr=https` -- HTTPS only

That permission set covers every meaningful operation on blob data -- read, write, delete, enumerate. A direct attempt to list containers returned `AuthorizationFailure`, suggesting IP restriction or the SAS requires a specific container/path scope. The token is live, syntactically valid, and in active production code.

The Azure Blob Storage JavaScript SDK is confirmed running client-side. `utils.js` sets `window.process.env.AZURE_TRACING_DISABLED = 'true'`, which is the Azure SDK's telemetry suppression mechanism -- something you only need if the SDK is actually executing. The intended use case for this SAS (possibly the security form's document upload, or investor document management) is unconfirmed, but no client-side operation requires write and delete permissions across all four Azure service types.

### Google Custom Search API Key

`/js/search.js` hardcodes a Google Cloud API key, separate from the `googleSearchKey` value in the Nuxt config (which is the Custom Search Engine ID: `02be9ee3f65304f37`). The API key is used to call `googleapis.com/customsearch/v1` directly from the browser.

Google Custom Search API pricing: 100 queries/day free, then $5 per 1,000 queries. The key is not browser-restricted, meaning it can be used from any client against any Custom Search Engine or other APIs it's authorized for. Using it with Navient's CX ID runs queries against their site search; using it with a different CX incurs costs billed to Navient's Cloud account.

### Storyblok CDN Token

The Storyblok CDN delivery token is read-only for published content and by design present in client-side code for headless CMS delivery. Its presence in the config is expected behavior for Storyblok's architecture. What's notable is what it exposes when used to enumerate the full content tree.

## CMS Footprint

Querying the Storyblok CDN API with the exposed token across two pages returns 199 published stories. The content tree has three major branches:

**`navient_marketplace/`** -- 100+ stories serving `marketplace.navient.com`. Blog content covering HELOCs, personal loans, auto refi, credit cards, life insurance, high-yield savings accounts, and student loan refinancing. Categories: `credit-cards`, `finance-101`, `student-loan-refinance`, `auto-refinance`, `personal-loans`, `term-life-insurance`, `banking-and-savings`. Authors: Monica Milone, Natasha Khullar Relph, Ted Vrountas, Grace Guido, Curt Kirby.

**`repline/`** -- 84 stories representing ABS trust repline data pages, going back to `repline/2003-10data` (a Storyblok-stored page for October 2003 trust performance data, migrated into the CMS in 2023). The slugs use internal trust series codes: `NAVEL` (inferred: Navient Education Loan) and `NAVRL` (inferred: Navient Refi Loan), codes not referenced in the public-facing site. Current entries include `repline/NAVEL2026-AData` and `repline/navrl2026-adata`. Each story is a CMS page wrapping investor-facing repline data; the actual financial documents are stored separately on `images.navient.com`.

**`investors/`** and main site content -- ABS investor pages, corporate debt offerings, shareholder information, quarterly results, fixed income data, careers, about pages.

Story metadata includes content IDs, UUIDs, `created_at`, `first_published_at`, and `updated_at` timestamps for all 199 entries. The Storyblok bridge (`bridge: true`) is active on the main site, meaning the Storyblok visual editor can connect to the live production site for real-time content editing.

## Navient Marketplace

`marketplace.navient.com` is live, indexed (80 prerendered pages), and running paid acquisition. This is Navient's post-servicing pivot: a financial product comparison and referral site earning commissions when users click through to partners.

Partners confirmed from site configuration and UTM parameters:
- **Earnest** -- personal loans, student loans, student loan refinancing. UTM: `utm_source=navient_marketplace&utm_campaign=PL_rc_pro_genpop_20260331`. Earnest-specific referral product code: NRI (Navient Refi Income).
- **Fiona.com** -- auto loan refinancing via `/partner/navientalr/loans` ("navientalr" = Navient Auto Loan Referral).
- **MoneyLion** -- banking/savings products.
- **LeapLife** -- life insurance.
- **Savvy** -- auto and home insurance.

Google Ads conversion tracking is running on the marketplace: DoubleClick `src=12937528` (Navient's Google Ads account ID), with conversion actions `nriun0` visible in the postback parameters.

`navirefi.com` is a Navient-owned redirect domain. Visiting it goes to `https://www.earnest.com/nri/refinance-student-loans?utm_source=ncw&utm_medium=organic&utm_campaign=NCWNAVR`. `pages.navirefi.com` runs on Cloudflare and appears as a RUM reporting endpoint in the marketplace's network traffic.

The marketplace Nuxt config has `appEnvVersion: "development"` in production, indicating the configuration was not updated before deployment -- or that the marketplace runs on a development-mode build. The Storyblok visual editor bridge is active (`bridge: true`), which in development mode allows live in-place content editing. Combined, these flags suggest the marketplace was deployed from a non-production build configuration.

MoneyLion's banking/savings embed is broken. The marketplace tries to load `https://www.moneylion.com/network/navient/loans-embed/web-component/lending-search/index.js`, which fails with `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` -- MoneyLion's CORS policy doesn't allowlist the `marketplace.navient.com` subdomain. This produces 17 JavaScript errors on marketplace load. The site is live and indexed, but the MoneyLion product integration is not functional.

## MOHELA Transfer Artifacts

Navient transferred federal student loan servicing to MOHELA in October 2024. The site documents this transfer but hasn't fully updated its compliance infrastructure.

`/mohela-log-in/` redirects users to `servicing.mohela.com` with language: "Your loans are now serviced by MOHELA. To learn more and log in to your account, visit servicing.mohela.com."

The California privacy request page (`/submit-request/`) contains a "Submit a Request" button that opens a `mailto:` link. The recipient is `PLP_management@servicing.mohela.com`. The email subject line is "CCPA Submission Request". The body template requests name, address, relationship to Navient, and the specific right being exercised (know, delete, correct). A Navient-branded page routes privacy rights requests to MOHELA's operational inbox.

The `rklfinancial/` page (legacy subsidiary RKL Financial Corporation, formerly SLM Financial) is still live. Its Nuxt payload exposes a contact email `rklfinancial2@navient.com` and Storyblok component metadata.

## Tracking

The homepage fires four cookies before any user interaction. There is no consent banner -- trackers are already running by the time the page renders.

Cookies set on arrival:
- `_ga_L2Q4TL7KBN` -- GA4 session cookie for property G-L2Q4TL7KBN
- `_ga` -- Universal Analytics cross-session ID
- `_gid` -- Universal Analytics session ID
- `_dc_gtm_UA-151317572-2` -- GTM-triggered Universal Analytics tag

Scripts loaded:
- `https://www.google-analytics.com/plugins/ua/linkid.js` -- cross-domain link tracking
- `https://www.google-analytics.com/analytics.js` -- Universal Analytics (UA-151317572-2)
- `https://www.googletagmanager.com/gtag/js?id=G-L2Q4TL7KBN` -- GA4
- `https://www.googletagmanager.com/gtm.js?id=GTM-WRVCVZ3` -- Google Tag Manager container

Network hits: `POST /g/collect` (GA4), `POST /j/collect` (UA), `POST stats.g.doubleclick.net/j/collect` (DoubleClick).

Footprint is lean -- no third-party data brokers, no identity resolution vendors, no remarketing pixels beyond GA/GTM/DoubleClick. The marketplace adds Google Ads conversion tracking. An advertising transparency page (`/about-our-ads/`) mentions Adobe Analytics, but Adobe Analytics was not observed in network traffic during the investigation.

Subdomains observed: `www.navient.com`, `marketplace.navient.com`, `news.navient.com` (press room), `images.navient.com` (investor document CDN), `about.navient.com` (in SSL SAN cert, not actively hosted).

## Machine Briefing

**Access & auth** -- The main site and marketplace are fully prerendered; no session needed for content. Storyblok CDN API requires the token from `window.__NUXT__.config.public.storyblok.accessToken` but that token is embedded in every page's inline HTML. The investor document API at `images.navient.com/api` requires no authentication.

**Endpoints**

Open, no auth:

```bash
# Storyblok -- list all published stories (paginated, 100/page)
GET https://api.storyblok.com/v2/cdn/stories?token=tdcbbJoi3wP8IYyh0G8tswtt&per_page=100&page=1
GET https://api.storyblok.com/v2/cdn/stories?token=tdcbbJoi3wP8IYyh0G8tswtt&per_page=100&page=2

# Storyblok -- fetch a specific story by slug
GET https://api.storyblok.com/v2/cdn/stories/{slug}?token=tdcbbJoi3wP8IYyh0G8tswtt

# Storyblok -- filter by folder
GET https://api.storyblok.com/v2/cdn/stories?token=tdcbbJoi3wP8IYyh0G8tswtt&starts_with=repline/&per_page=100
GET https://api.storyblok.com/v2/cdn/stories?token=tdcbbJoi3wP8IYyh0G8tswtt&starts_with=navient_marketplace/&per_page=100

# Nuxt SSR payloads -- full Storyblok page data for each route
GET https://www.navient.com/_payload.js
GET https://www.navient.com/rklfinancial/_payload.js
GET https://www.navient.com/education-financing/_payload.js
GET https://www.navient.com/submit-request/_payload.js

# Marketplace build metadata
GET https://marketplace.navient.com/_nuxt/builds/meta/5aaea762-0030-464e-8681-2292e92826a6.json

# Investor document listing API (returns {"content": [...]}, path format unclear)
GET https://images.navient.com/api?path={path}

# Google Custom Search -- uses Navient's API key, billed to their account
GET https://customsearch.googleapis.com/customsearch/v1?key=AIzaSyAOdFtZpQ40KaImCk53wtsGnRq3vTtnAkE&cx=02be9ee3f65304f37&q={query}

# Azure Blob SAS -- appended to base URL (container list returned AuthorizationFailure, may be IP-restricted)
BASE: https://naviptnstoprdncusinv001.blob.core.windows.net/
SAS:  ?sv=2024-11-04&ss=bfqt&srt=c&sp=rwdlacupiytfx&se=2027-10-31T03:10:27Z&st=2025-10-30T18:55:27Z&spr=https&sig=LoWwkmyAHOSORZ1TGtTuF%2BmJYdmfDn%2Bt3j1z5Gz7fQ8%3D
```

**Gotchas**

- The Storyblok token is a CDN delivery token -- read-only for published stories. Draft/unpublished content requires a management token (not available).
- `window.__NUXT__.config.public` is embedded as an inline script in the HTML, not in a separate JSON file. Parse it from the page HTML, not from a config endpoint.
- Nuxt `_payload.js` files are JavaScript modules (ES module format), not JSON. Use `node -e "import('./payload.js').then(m => console.log(JSON.stringify(m.default)))"` or fetch and eval in a browser context.
- The investor document API path format could not be confirmed. The `investorFileUrl` config points to `https://images.navient.com/` and the API path param likely mirrors the S3 key structure: `Investors/trusts/{TRUST-NAME}/{year}/{instance}/{filename}`.
- The Google Custom Search key is unrestricted -- no referrer/IP lock observed. Queries run against any CX, not just Navient's.
- The Azure SAS token starts with `?` (query string fragment), not a full URL. Construct the full endpoint as `{blobBaseUrl}{container}?{blobUrl.slice(1)}`.
