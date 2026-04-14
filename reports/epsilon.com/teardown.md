---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Epsilon — Teardown"
url: "https://epsilon.com"
company: "Epsilon"
industry: "Professional Services"
description: "B2B marketing platform and data broker owned by Publicis Groupe."
summary: "Next.js 16 App Router site served via CloudFront, with Sanity.io as the headless CMS (project bbfpkf4q, dataset eps-prod). Multi-regional deployment covering US, EMEA, APAC, and LATAM, plus an Abacus data-broker subdomain. legal.epsilon.com is a separate static export hosted on S3. Post-consent tag stack fires 26 third-party domains through GTM."
date: "2026-04-14"
time: "05:35"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Next.js, Sanity, CloudFront]
trackers: [Google Analytics, Google Ads, LinkedIn Insight, 6sense, ZoomInfo, Mixpanel, Yieldify, Lotame, Clickagy, The Trade Desk, AppNexus, Qualtrics, OneTrust]
tags: [data-broker, identity-resolution, b2b-tracking, martech, cms-exposure, sanity, account-based-marketing, gated-content, publicis, hubspot-migration]
headline: "Personalized sales pages naming individual contacts at VF Corporation, Mammoth Brands, and Costco are publicly indexed -- Epsilon's active prospect list is a single CMS query away."
findings:
  - "Twenty-one ABM landing pages name individual sales contacts at target companies -- VF Corporation pages include personalized headlines, first names, and live Outlook calendar booking links into Publicis Groupe's Microsoft 365 tenant."
  - "Sanity CMS accepts unauthenticated GROQ queries from any HTTP client -- 5,400+ documents including an internal brand guide fed to the AI writing assistant and a newly registered 'helix-gpt' agent context are readable without credentials."
  - "Every gated PDF is client-side theater: a single GROQ query extracts all 58 download asset URLs, and the Sanity CDN returns each file with HTTP 200 and no authentication."
  - "6sense resolves every consenting visitor's IP to an employer profile -- company name, street address, phone, headcount, revenue range, SIC and NAICS codes -- then pushes it into the dataLayer where 15+ downstream ad pixels consume it."
  - "All US OneTrust rulesets have IsGPPEnabled set to false -- browsers sending Global Privacy Control 'do not sell' signals are silently ignored."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Epsilon sells identity resolution -- the ability to match a person or company to a unified profile stitched together from thousands of data sources. Its website turns out to be one of those data sources, and not in a subtle way.

## Infrastructure

The main site is a Next.js 16 App Router application bundled with TURBOPACK -- normally a development-mode bundler, here running in production -- served via AWS CloudFront. The build stamp is embedded directly in the page HTML: `data-app-version="v3.1.0 | 26-04-10 21:18"` and duplicated in an inline console.log. The site is multi-regional: `/us/`, `/emea/`, `/apac/`, `/latam/`, with `/abacus/` pointing to the Epsilon Data direct mail arm (though US visitors hitting `/abacus/` get redirected to `/emea/products-and-services/direct-mail` -- an apparent GeoIP routing misconfiguration). `legal.epsilon.com` is a separate Next.js static export, hosted directly on S3 (`Server: AmazonS3`, `X-Amz-Server-Side-Encryption: AES256`), running an older build than the main site. This is the consumer privacy portal -- data deletion requests, ad choices, and consent management for regulated markets live outside the main CloudFront/Next.js stack.

Content is served from Sanity.io (project ID `bbfpkf4q`, dataset `eps-prod`). The live content feed runs at `bbfpkf4q.api.sanity.io/v2025-02-24/data/live/events/eps-prod` via Server-Sent Events. GSAP 3.14.2 handles animations.

`/us/contact-us` returns HTTP 200 but renders a 404 -- the `dataLayer` fires `event: "event", category: "error", action: "not-found", label: "/us/contact-us"`, tracking the broken page as an error event.

## The Sanity CMS Exposure

Sanity.io's hosted API allows GROQ queries with just a project ID and dataset name. By default, Sanity adds CORS restrictions to browser-originated requests -- but those restrictions only apply when an `Origin` header is present. Direct API access from curl or any HTTP client without an `Origin` header bypasses CORS entirely and requires no authentication token.

Epsilon's production CMS dataset is open under this pattern. The GROQ endpoint is:

```
https://bbfpkf4q.api.sanity.io/v2021-10-21/data/query/eps-prod?query=<GROQ>
```

No token. No auth. Any HTTP client with the project ID can run arbitrary read queries.

The dataset contains 24 document types and over 5,400 published documents:

| Type | Count |
|------|-------|
| `eps_redirect` | 1,678 |
| `eps_post` | 1,209 |
| `eps_news` | 933 |
| `eps_resource` | 324 |
| `eps_caseStudy` | 354 |
| `eps_page` | 203 |
| `eps_pressRelease` | 166 |
| `eps_author` | 272 |
| `eps_download` | 58 |
| `sanity.agentContext` | 1 |
| `assist.instruction.context` | 1 |

Two documents stand out beyond the content library:

**`assist.instruction.context`** (created September 2024): This is the context document injected into Sanity AI Assist -- Sanity's built-in AI writing assistant. It contains Epsilon's full internal brand guide: the "Humans Over Hype(R) Evolved" brand positioning, five messaging pillars (Value Exchange, Identity, Personalization at Scale, Performance Transparency, Privacy), brand vision, and approved copy rules including specific usage restrictions on the registered trademark. The document is titled "Brand Guide Tone."

**`sanity.agentContext`** (created April 3, 2026): A single document with `name: "helix-gpt"`, `slug: "helix-gpt"`, `version: "1"`. This registers a custom agent in Sanity's agentic infrastructure -- created eleven days before this investigation. What helix-gpt does is not determinable from the public API alone; it requires Sanity AI Assist admin credentials to inspect.

### Querying the dataset

GROQ is Sanity's native query language. A few useful patterns:

```
# All document types
array::unique(*[]._type)

# Count by type
{"eps_post": count(*[_type=="eps_post"]), "eps_page": count(*[_type=="eps_page"])}

# All ABM landing pages
*[_type=="eps_page" && slug.current match "lp/*"]{slug, _id}
```

All return without authentication.

## ABM Landing Pages -- The Prospect List

Among the 203 `eps_page` documents, 21 have slugs under `lp/`. None appear in the sitemap. None are disallowed by robots.txt. All are publicly accessible and indexable.

These are account-based marketing pages -- personalized pitches to named individuals at named companies. Current examples:

**VF Corporation** (parent of The North Face, Vans, Timberland):
- `/us/lp/vfc/anna` -- "Anna, scaling personalization is a journey"
- `/us/lp/vfc/caroline`
- `/us/lp/vfc/dennis`
- `/us/lp/vfc/ryan`
- `/us/lp/vfc/denise`

Each VFC page includes a personalized headline with the contact's first name, Epsilon's pitch for that individual, and a live calendar booking link:

```
https://outlook.office.com/book/EpsilonVFCorporationStrategySession@publicisgroupe.net/?ismsaljsauthenabled
```

This is a Microsoft Bookings page tied to the Publicis Groupe Microsoft 365 tenant. `EpsilonVFCorporationStrategySession@publicisgroupe.net` is the deal team's shared calendar for VF Corporation.

**Mammoth Brands** (snack company):
- `/us/lp/mammothbrands/ankur`
- `/us/lp/mammothbrands/douglas`
- `/us/lp/mammothbrands/coterie`
- `/us/lp/mammoth-brands`

**Others:** `/us/lp/jollibee` (Jollibee fast food), `/us/lp/1member1costco` (Costco membership strategy pitch), `/us/lp/chomps`, `/us/lp/elf`, `/us/lp/shoptalk`

The pages expose which companies are active sales prospects, which individuals Epsilon is pursuing at each company, how Epsilon is positioning itself in each deal, and for VF Corporation -- a live calendar integration into the Publicis Groupe mail infrastructure.

## Gated Content Bypass

Epsilon gates certain content -- whitepapers, ebooks, research reports -- behind a form: fill in name, email, company, and receive the PDF. The gating is entirely client-side.

Every gated PDF is stored in Sanity's asset CDN. The download document schema (`eps_download`) stores a reference to the file asset:

```json
{
  "_type": "eps_download",
  "title": "Your CTV Playbook",
  "downloadFile": {
    "asset": {
      "_ref": "file-{sha1hash}-pdf"
    }
  }
}
```

The `_ref` format maps directly to a CDN URL:

```
https://cdn.sanity.io/files/bbfpkf4q/eps-prod/{sha1hash}.pdf
```

That URL requires no authentication. Verification: `file-c3ab8110d9643cf134753c48280ede60ee4549cc-pdf` maps to `https://cdn.sanity.io/files/bbfpkf4q/eps-prod/c3ab8110d9643cf134753c48280ede60ee4549cc.pdf` and returns HTTP 200, `Content-Disposition: inline;filename="AI in Europe_One Pager.pdf"`, 2.5MB.

Since the GROQ API is also open, extracting all 58 download asset URLs takes a single query:

```
*[_type=="eps_download"]{title, "url": downloadFile.asset._ref, slug}
```

Then reconstruct each URL from the `_ref` by replacing the `file-` prefix with `https://cdn.sanity.io/files/bbfpkf4q/eps-prod/`, removing the `-pdf` suffix, and appending `.pdf`.

## Surveillance Infrastructure

### Pre-Consent

Before any user interaction, two third-party domains fire:
- **Vimeo CDN** (`vod-adaptive-ak.vimeocdn.com`) -- homepage has an embedded Vimeo video; CDN requests initiate on page load
- **Google reCAPTCHA** (`jnn-pa.googleapis.com`, `www.gstatic.com`) -- fires on load, no user trigger

GTM does not load until consent is granted. No advertising or analytics pixels fire pre-consent.

### Post-Consent Stack

After consent, 26 third-party domains fire across 93 total requests. The full roster:

| Vendor | Domain(s) | Purpose |
|--------|-----------|---------|
| Google Ads | `www.google.com`, `stats.g.doubleclick.net` | Remarketing (AW-709796975) |
| Google Analytics | `analytics.google.com`, `www.google-analytics.com` | GA4 (G-CJMCQRD6WJ) |
| DoubleClick/DCM | `ad.doubleclick.net` | Campaign manager (src=9926287, src=13495327) |
| LinkedIn Insight | `px.ads.linkedin.com` | B2B ad targeting |
| 6sense | `c.6sc.co`, `ipv6.6sc.co`, `epsilon.6sense.com` | B2B identity resolution |
| ZoomInfo | `ws.zoominfo.com`, `js.zi-scripts.com` | B2B identity / form tracking |
| Yieldify | `v2.dc.yieldify.com`, `td.yieldify.com`, `user-token-decoder.yieldify-production.com` | Behavioral targeting |
| Mixpanel | `api-js.mixpanel.com` | Product analytics, A/B test tracking |
| Qualtrics | `siteintercept.qualtrics.com` | Survey intercepts |
| Lotame/CRWDCNTRL | `bcp.crwdcntrl.net`, `tags.crwdcntrl.net` | DMP (account 18219) |
| AppNexus/Xandr | `secure.adnxs.com` | DSP ID sync |
| Clickagy | `aorta.clickagy.com`, `tags.clickagy.com` | Audience/intent data |
| The Trade Desk | `insight.adsrvr.org` | Conversion tracking |
| YouTube | `www.youtube-nocookie.com` | Embedded video analytics |
| Vimeo | `vod-adaptive-ak.vimeocdn.com` | Video CDN (also pre-consent) |
| OneTrust | `cdn.cookielaw.org` | CMP |
| reCAPTCHA | `jnn-pa.googleapis.com`, `www.gstatic.com` | Bot protection (also pre-consent) |
| OneTrust geolocation | `geolocation.onetrust.com` | Consent geo-routing |

**GTM container:** `GTM-NHWXD8M6`

## 6sense -- Company Deanonymization in the DataLayer

The most structurally notable entry in the post-consent stack is 6sense. After consent is given, 6sense performs an IP-to-company lookup via its API at `epsilon.6sense.com/v3/company/details` (HTTP 200 in network trace). It then pushes the result to `window.dataLayer` in three separate formats before firing a GTM event:

**Format 1 -- raw company fields:**
```json
{
  "company_name": "...",
  "domain": "...",
  "country": "...",
  "address": "...",
  "company_state": "...",
  "city": "...",
  "zip": "...",
  "country_iso_code": "...",
  "industry": "...",
  "sic": "...",
  "sic_description": "...",
  "naics": "...",
  "naics_description": "...",
  "employee_range": "...",
  "employee_count": "...",
  "revenue_range": "...",
  "annual_revenue": "..."
}
```

**Format 2 -- `6si_`-prefixed fields:**
```json
{
  "6si_company_name": "...",
  "6si_company_match": "Match",
  "6si_additional_comment": "Company name or domain match was found",
  "6si_confidence": "Low|Medium|High",
  "6si_geoIP_country": "...",
  "6si_geoIP_state": "...",
  "6si_geoIP_city": "...",
  "6si_company_domain": "...",
  "6si_company_country": "...",
  "6si_company_address": "...",
  "6si_company_state": "...",
  "6si_company_state_code": "...",
  "6si_company_city": "..."
}
```

**Format 3 -- `_6si`-suffixed fields:**
```json
{
  "company_name_6si": "...",
  "confidence_6si": "...",
  "domain_6si": "...",
  "name_6si": "...",
  "region_6si": "...",
  "country_6si": "...",
  "state_6si": "...",
  "city_6si": "...",
  "industry_6si": "...",
  "companyId_6si": "...",
  "country_iso_code_6si": "...",
  "address_6si": "...",
  "zip_6si": "...",
  "phone_6si": "...",
  "employee_range_6si": "...",
  "revenue_range_6si": "..."
}
```

Then: `{"event": "6si_company_details_loaded", "gtm.uniqueEventId": 42}`

Once this fires, `window.dataLayer` holds the visitor's employer company, industry classification (SIC and NAICS codes), mailing address, phone number, headcount, and revenue range -- available to GTM and every tag loaded through it, which includes Google Ads, LinkedIn, DoubleClick, The Trade Desk, AppNexus, Lotame, and ZoomInfo.

Epsilon has a dedicated 6sense tenant at `epsilon.6sense.com` -- this isn't a generic 6sense deployment, it's Epsilon's own instance of a product it sells to clients. The company that makes identity resolution is running identity resolution on the people visiting its website, then piping that intelligence into its ad stack.

The confidence score varies by visitor. A residential or school IP returned confidence "Low" with a match to a small education institution. A corporate network visitor would return a "High" confidence match with fuller data. The data fields are sent regardless of confidence level.

## Consent Configuration

OneTrust version `202603.1.0`, tenant GUID `8fbad179-b7e6-40aa-87b7-6022f24a02e8`.

The ruleset covers:
- **Epsilon - US - Opt-In States** (CDPA): California, Colorado, Connecticut, Delaware, Florida, Illinois, Massachusetts, Maryland, Michigan, Montana, Nevada, New Hampshire, Pennsylvania -- requires affirmative opt-in for categories C0002 (Performance), C0003 (Functional), C0005 (Targeting)
- **Global**: Default opt-out for all other countries
- **LGPD**: Brazil
- **IAB TCF v2.2**: EU, EEA, UK (GDPR)

Default cookie state on first load (California): `C0001:1,C0002:0,C0003:0,C0005:0` -- only strictly necessary cookies active. This is correct opt-in behavior for covered states.

**GPP gap:** Every ruleset in the config has `"IsGPPEnabled": false`. The Global Privacy Platform (GPP) is a specification that lets browsers and devices signal privacy preferences -- including "do not sell or share" via GPC (Global Privacy Control) -- in a standardized format. OneTrust supports GPP. Epsilon's configuration has it disabled on every rule. Browsers with GPC enabled are treated as if no preference signal was sent. The pre-consent cookie value confirms this: `isGpcEnabled=0&browserGpcFlag=0` -- the GPC signal is read but suppressed.

## HubSpot Migration Trail

Epsilon's CMS migrated from HubSpot to Sanity recently. Evidence left in production:

- Every page carries a `page_id` prefixed `hsMigration_` in `window.dataLayer` -- for example, `hsMigration_40917166601`
- `original_page_id` matches the same `hsMigration_*` value
- Mixpanel A/B test events (`Page View - Variant AB Test`) are keyed to these HubSpot IDs
- `has_ab_testing: true` fires on the homepage; the served variant is logged as `variant_name: "control"`, `is_variant: false`
- Build date: April 10, 2026; earliest Sanity content documents date to late 2024, with the `assist.instruction.context` brand guide created September 2024 -- the full dataset migration preceded the go-live by over a year

HubSpot's A/B testing infrastructure remains active in GTM despite the content now living in Sanity. The test tracking is correctly resolving (Mixpanel receives the events), but the underlying IDs are HubSpot artifact strings rather than meaningful identifiers.

---

## Machine Briefing

### Access & Auth

Most useful access requires no credentials. The Sanity GROQ API works from any HTTP client without headers. PDF downloads from the CDN require nothing but the URL. ABM pages are open HTML, no JavaScript required for the content.

Post-consent surveillance tracking requires an active browser session -- 6sense, ZoomInfo, and most ad pixels won't fire on raw HTTP requests.

### Endpoints

**Sanity GROQ API -- no auth required (omit Origin header)**
```bash
# Query endpoint
GET https://bbfpkf4q.api.sanity.io/v2021-10-21/data/query/eps-prod?query=<URL-encoded GROQ>

# Document type counts
curl 'https://bbfpkf4q.api.sanity.io/v2021-10-21/data/query/eps-prod?query={"eps_post":count(*[_type%3D%3D"eps_post"]),"eps_page":count(*[_type%3D%3D"eps_page"])}'

# All ABM landing pages
curl 'https://bbfpkf4q.api.sanity.io/v2021-10-21/data/query/eps-prod?query=*[_type%3D%3D"eps_page"%26%26slug.current%20match%20"lp%2F*"]{slug,_id}'

# All download documents with asset refs
curl 'https://bbfpkf4q.api.sanity.io/v2021-10-21/data/query/eps-prod?query=*[_type%3D%3D"eps_download"]{title,downloadFile{asset{_ref}},slug}'

# Brand guide (assist.instruction.context)
curl 'https://bbfpkf4q.api.sanity.io/v2021-10-21/data/query/eps-prod?query=*[_type%3D%3D"assist.instruction.context"][0]'

# helix-gpt agent context
curl 'https://bbfpkf4q.api.sanity.io/v2021-10-21/data/query/eps-prod?query=*[_type%3D%3D"sanity.agentContext"][0]'
```

**Live content feed (SSE)**
```
GET https://bbfpkf4q.api.sanity.io/v2025-02-24/data/live/events/eps-prod
```

**PDF CDN -- no auth required**
```bash
# URL construction from asset _ref
# _ref format: file-{sha1hash}-pdf
# URL: https://cdn.sanity.io/files/bbfpkf4q/eps-prod/{sha1hash}.pdf

# Verified example (AI in Europe One Pager, 2.5MB):
curl -I 'https://cdn.sanity.io/files/bbfpkf4q/eps-prod/c3ab8110d9643cf134753c48280ede60ee4549cc.pdf'
# Returns: HTTP 200, application/pdf, Content-Disposition: inline;filename="AI in Europe_One Pager.pdf"
```

**ABM pages (open HTML)**
```
https://www.epsilon.com/us/lp/vfc/anna
https://www.epsilon.com/us/lp/vfc/caroline
https://www.epsilon.com/us/lp/vfc/dennis
https://www.epsilon.com/us/lp/vfc/ryan
https://www.epsilon.com/us/lp/vfc/denise
https://www.epsilon.com/us/lp/mammothbrands/ankur
https://www.epsilon.com/us/lp/mammothbrands/douglas
https://www.epsilon.com/us/lp/mammothbrands/coterie
https://www.epsilon.com/us/lp/jollibee
https://www.epsilon.com/us/lp/1member1costco
https://www.epsilon.com/us/lp/chomps
https://www.epsilon.com/us/lp/elf
https://www.epsilon.com/us/lp/shoptalk
```

**Main site infrastructure**
```
Build: v3.1.0 | 26-04-10 21:18
GTM: GTM-NHWXD8M6
GA4: G-CJMCQRD6WJ
Google Ads: AW-709796975
DoubleClick: DC-9926287, DC-13495327
ZoomInfo pixel: 66711bdd03ccb159064af053
Lotame account: 18219
OneTrust tenant: 8fbad179-b7e6-40aa-87b7-6022f24a02e8
6sense tenant subdomain: epsilon.6sense.com
```

**6sense company details (requires browser session with consent)**
```
GET https://epsilon.6sense.com/v3/company/details
# Auth: browser session cookie, called from 6sense's JavaScript
# Response: company identity data pushed to window.dataLayer
# Without valid session: {"code":401,"message":"Authorization header missing."}
```

### Gotchas

- **CORS on Sanity:** If you send an `Origin: https://www.epsilon.com` header, requests succeed. Any other origin returns CORS block. No `Origin` header = always succeeds. Use curl without `-H 'Origin: ...'`.
- **PDF URL construction:** The `_ref` field in `downloadFile.asset` uses format `file-{hash}-pdf`. Strip `file-` and `-pdf`, append `.pdf`, prepend `https://cdn.sanity.io/files/bbfpkf4q/eps-prod/`.
- **Sanity rate limits:** Default Sanity free tier has rate limits. The `ratelimit-reset: 1` header suggests per-second windowing. The `sanity-inflight-limit: 500` header allows high parallelism.
- **6sense subdomain:** `epsilon.6sense.com` is Epsilon's dedicated tenant -- the generic `c.6sc.co` handles initial cookie sync, then the tenant endpoint does the company lookup.
- **Next.js version:** `window.next.version` reports `16.1.6` -- this is either a canary/RC build or a non-standard version. Public Next.js is at 15.x.
