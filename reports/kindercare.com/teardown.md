---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "KinderCare Education — Teardown"
url: "https://www.kindercare.com"
company: "KinderCare Education"
industry: Education
description: "US childcare chain operating 1,500+ daycare and preschool centers."
summary: "ASP.NET/IIS monolith behind CloudFront, with a 36,000-page SEO location catalog. The parent portal (my.kindercare.com) runs a separate app backed by api.kindercare.com microservices using JWT auth, OData queries, and a CQRS enrollment layer. The portal's JS bundle describes the full API architecture including child health data models. GTM dispatches a large tracker suite across both domains with no cookie consent banner."
date: 2026-04-13
time: "01:43"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack: ["ASP.NET", "Microsoft IIS", "CloudFront", "jQuery", "LivePerson"]
trackers: ["Google Analytics 4", "Google Analytics Universal", "Google Ads", "Facebook Pixel", "Microsoft UET", "LinkedIn Ads", "Twitter Ads", "Hotjar", "Datadog RUM", "VWO", "Nextdoor Ads", "GetBack.ch", "Tune"]
tags: ["childcare", "education", "session-recording", "call-tracking", "odata", "microservices", "no-consent", "government-programs", "health-data", "ad-tech"]
headline: "KinderCare's parent portal JS maps its entire child health data model -- allergies, medical providers, care supports -- in OData queries anyone can read."
findings:
  - "The portal's JS bundle contains OData queries that map KinderCare's child data schema: StudentAllergies, MedicalProviders, HealthInformations, CareSupports, StudentTransportationInformation -- the full entity graph is readable without authentication."
  - "Every page load fires Google's call tracking endpoint (/ga/phone) for dynamic number insertion, and the nearby-centers API exposes the mechanism directly with originalPhone vs overridePhone fields -- parent calls become marketing attribution events."
  - "Hotjar and Datadog Session Replay both run on the parent portal where billing and child health data is managed -- two independent session recording systems on the same sensitive pages."
  - "Google Analytics Universal (UA-564853-1) is still actively firing in 2026, three years past deprecation, alongside two separate GA4 properties."
  - "GetBack.ch, a Swiss remarketing platform, and Tune/go2sdk, a performance marketing SDK, are embedded via GTM alongside 13 other tracker services -- with no cookie consent banner for US visitors."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

KinderCare Education is the largest private childcare operator in the US, running 1,500+ centers across the country under the KinderCare brand and several subsidiaries. The public website is a content marketing and SEO operation at scale. The parent-facing portal is an entirely separate application with its own microservices backend.

## Infrastructure

The main site (`www.kindercare.com`) runs on Microsoft IIS/10.0 with an ASP.NET backend, distributed through Amazon CloudFront. There is no SPA framework -- the site is traditional server-rendered .NET MVC. jQuery 3.7.1 powers the frontend. The server headers are:

```
Server: Microsoft-IIS/10.0
X-Cache: Miss from cloudfront
Via: 1.1 eb9d64413a6e94ad0c833eaa78fca8fa.cloudfront.net (CloudFront)
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
```

Every page load sets three baseline cookies before any user interaction: `ASP.NET_SessionId` (HttpOnly, SameSite=Lax), `__RequestVerificationToken` (CSRF, HttpOnly, SameSite=None), and `shell#lang=en` (language preference).

The SSL certificate shares SANs across the full brand portfolio, revealing the parent company structure: `knowledgelearning.com` (Knowledge Learning Corp, the parent), `discoverchampions.com` (Discovery Champions), `knowledgebeginnings.com` (Knowledge Beginnings), `skyriseschool.com` (Skyrise Schools), `kc-learning.com`, and `kuwebapps.com` (web applications domain). All subdomains under `*.kuwebapps.com`, `*.kc-learning.com`, and `*.discoverchampions.com` are also covered. These brands share infrastructure -- the same ASP.NET stack and `x-powered-by: ASP.NET` headers appear across them.

The `robots.txt` blocks crawlers from parameter-based geo queries (`*lat=*`, `*lng=*`, `*zip=*`, `*distance=*`) and from contact pages and search results. It references five sitemaps: main, infant-daycare, toddler-daycare, preschool, and pre-k. The main sitemap alone is 36,947 lines -- the SEO surface is enormous. The sub-sitemaps carry per-city, per-state, per-program URLs covering hundreds of cities, consistent with 1,500+ physical locations.

## Public API

### `/data/nearby-centers`

Unauthenticated GET endpoint. Returns JSON with up to three centers based on server-side IP geolocation. Client-provided coordinates are not accepted (robots.txt actively discourages the parameter patterns). The full response schema per center:

```json
{
  "id": 301999,
  "name": "The Avenues KinderCare",
  "address": "...",
  "city": "San Francisco",
  "state": "CA",
  "zip": "94121",
  "phoneNumber": "(415) 221-6133",
  "originalPhone": "(415) 221-6133",
  "overridePhone": null,
  "latitude": "...",
  "longitude": "...",
  "directorName": "",
  "testimonial": null,
  "welcomeMessage": "<p>...</p>",
  "staffWelcomeMessage": null,
  "statusFlags": {
    "IsBecomingKinderCare": false,
    "IsOpeningSoon": false,
    "IsTempClosed": false,
    "IsEssentialCareCenter": false
  },
  "flagList": ["no-flags"],
  "scheduleTourEnabled": true,
  "AgeBitwise": 60,
  "ageSegments": ["4", "8", "16", "32"],
  "HasInfantPrograms": false,
  "HasToddlerPrograms": false,
  "HasPreschoolPrograms": true,
  "HasPreKindergartenPrograms": true,
  "HasKindergartenPrograms": false,
  "centerPhotos": [
    {
      "caption": "The Avenues KinderCare",
      "category": "Building",
      "dateAdded": "2025-03-10T10:19:43",
      "url": "/ProfileBinary.axd/files/5104492535553218873/Building.jpg"
    }
  ],
  "programs": { ... }
}
```

The `phoneNumber` field is what users see. The `originalPhone` is the center's actual number. The `overridePhone` field -- null in the sampled centers -- is where call tracking numbers land when Google's dynamic number insertion (DNI) is active for a given session. The API exposes this distinction directly. The `statusFlags` object includes `IsEssentialCareCenter`, a COVID-era designation (essential worker care status) that remains in the live data model.

The `flagList` field (`["no-flags"]` in all observed responses) suggests a per-center feature flag system exists but is either unused or internally managed. `scheduleTourEnabled` is a per-center boolean, consistent with a feature rollout system.

Center photos are served through `/ProfileBinary.axd/files/{id}/{category}.jpg` -- an ASP.NET HTTP handler serving binary files.

### Center Detail Pages

Individual center pages at `/our-centers/{city}/{state}/{id}` expose staff information in plain HTML: director name, director photo, educational credentials, year hired, and personal interests. This data is public, indexed in search engines, and included in the sitemap. Contact form submissions go to `/post/contact-form-component/{centerId}` (POST only).

The `tuitionAndOpeningsUrl` in the API response (`/our-centers/contact/{id}`) currently returns 404 -- the URL structure was reorganized but old references persist in the API response.

## Parent Portal Architecture

`my.kindercare.com` is the parent-facing portal for tuition payment and enrollment management. `login.kindercare.com` redirects to it. The portal's HTML source and JS bundle describe a full microservices architecture -- all of this is readable without authentication.

**Auth mechanism:** JWT Bearer token stored in the `access_token` cookie. Tokens are refreshed via a `C4-Refreshed-Token` response header. JWT is passed as a cookie rather than an Authorization header, which has implications for CSRF protection in the context of cross-domain API calls.

**Microservices at `api.kindercare.com`:**
- `paymentintegration` -- payment processing
- `sponsor` -- parent/guardian account management
- `identity` -- authentication and identity
- `fundingagency` -- subsidy and government funding
- `invoice` -- billing
- `student` -- child records
- `enrollment` -- enrollment lifecycle
- `facility` -- center/site management

All endpoints return 503 "Invalid Request" without a valid JWT.

**CQRS enrollment commands:** Enrollment mutations go through `/CommandRequest/` with named commands. One confirmed example from the bundle: `"Insert Enrollment"`.

**OData query API:** The read side uses OData-style query strings. The child health data schema is visible in the JS bundle's query strings:

```
/v1/query/Student?$filter=Id eq ${id}&$expand=HealthInformations($expand=CareSupports,StudentAllergies),MedicalProviders(expand=Address),MedicalInformation,StudentTransportationInformation
/v1/query/Student?$filter=Id eq ${id}&$expand=HealthInformations($expand=StudentAllergies)
/v1/query/Student?$filter=Id eq ${id}&$expand=MedicalProviders(expand=Address),MedicalInformation
```

What this reveals: KinderCare stores per-child records for `HealthInformations` (with nested `CareSupports` and `StudentAllergies`), `MedicalProviders` (with `Address`), `MedicalInformation`, and `StudentTransportationInformation`. The queries are in plain JavaScript, interpolating student IDs at runtime -- the data schema is fully readable by anyone who inspects the bundle.

Additional query patterns from the bundle:

```
/v2/query/Sponsor?$expand=Students($filter=isActiveStudent eq true;$orderby=BirthDate desc;$expand=Enrollments($orderby=CreatedDate desc))
/v2/query/Sponsor?select=Id&$expand=Contacts($select=Id,PhoneNumbers,FirstName,LastName;$expand=StudentRelationships($select=Id,ContactId,StudentId,Relationship,RelationshipId,Priority,IsActiveRelationship,IsEmergencyContact))
/v1/query/Student?$select=Id,IsActive,FirstName,LastName&$filter=Id eq ${e}&$expand=Enrollments($select=Id,CreatedDate,EnrollmentStatusId,SiteId,StudentId;$filter=EnrollmentStatusId in (10,15,16,17) eq false;$orderby=CreatedDate desc;$expand=EnrollmentStatus($select=Enrollmentstatus,Id)),StudentTransportationInformation,HealthInformations,StudentRegistration
/v1/BillingSummary
/v1/Calculation/GetPaymentStateSummary
/api/payments/getbillingstatementpdf
```

Enrollment status IDs 10, 15, 16, 17 appear as a filter exclusion in one query, indicating a coded enum for enrollment states -- numeric codes without a public key.

**Cookie data model:** Unauthenticated visits to `my.kindercare.com` receive (and immediately clear) several cookies that expose the internal data model: `sponsor_id` (parents are called "sponsors" throughout the system), `valet_token` (a separate token type, purpose unclear from evidence), `isprimarysponsor` (boolean -- indicates multiple guardians can have different permission levels), and `isbackupcare` (boolean -- backup care is a distinct product). The backup care system has its own API routes: `/backupcare/BUCReservation` and `/backupcare/BUCCancelReservation`. References to "BUC" (Backup Care) appear throughout the bundle.

## Tracker Ecosystem

GTM container `GTM-MC3ZWQ` is the central dispatch. The investigator recorded approximately 730 total tags with 70 paused -- a large container by any measure. The full verified tracker inventory:

| Tracker | ID / Details | Type |
|---------|-------------|------|
| Google Analytics 4 | `G-DWJ63W79F8` | Analytics |
| Google Analytics 4 | `G-EGWBMEM0VE` | Analytics (second property) |
| Google Analytics Universal | `UA-564853-1` | Analytics (deprecated, still active) |
| Google Ads Remarketing | Conversion ID `1001365899` | Ads |
| Google Ads Call Tracking | Dynamic Number Insertion via `/ga/phone` | Ads |
| Google Consent Mode | `/ccm/collect` -- 3 requests on load | Consent/Ads |
| Facebook Pixel | `1448941568533098` | Ads |
| Microsoft Bing UET | `_uetsid`, `_uetvid` cookies | Ads |
| LinkedIn Ads | `px.ads.linkedin.com`, `snap.licdn.com` | Ads |
| Twitter/X Ads | `twq` | Ads |
| Hotjar | Site ID `14625` | Session recording |
| Datadog RUM | Client token `pubd5cfa1f07e782ab49ea75c39066459ad`, App ID `fec0c536-fafd-47e3-bcf3-bdc1464e28cb` | RUM + Session Replay |
| LivePerson | Account `14673713` | Chat |
| VWO | Account `728048` | A/B testing |
| Nextdoor Ads | `ads.nextdoor.com` | Ads |
| GetBack.ch | `mnEId` key; cookies `_gbs`, `_gbc`, `_gb_lh` | Remarketing |
| Tune / go2sdk | `js.go2sdk.com/v2/tune.js` | Performance marketing |

All of these fire on first page load. No cookie consent banner is present for US visitors.

**Google Analytics Universal still active:** GA UA (`UA-564853-1`) was officially sunset by Google in July 2023. KinderCare has it running in a GTM tag alongside two GA4 properties as of the investigation date. The `_dc_gtm_UA-564853-1` and `_gat_UA-564853-1` cookies both set on first load.

**Dual session recording:** Hotjar (heatmaps, session replay, site ID 14625) and Datadog Session Replay both run concurrently. The investigator observed Datadog configured with `sessionSampleRate: 100` and `sessionReplaySampleRate: 100` -- 100% capture for both RUM and full session replay. Both systems are active on the parent portal where billing and child health information is managed. Datadog's default privacy level of `mask-user-input` masks typed values but captures all navigation, clicks, and page state.

**GetBack.ch:** A Swiss remarketing and retargeting platform. KinderCare's GTM has 6 GetBack tags (`vtp_getbackId: "mnEId"`), firing conversion and pageview events. The cookies set are `_gbs`, `_gbc`, and `_gb_lh`, each containing a `mnEId` UUID. This is an unusual platform choice for a US childcare company -- GetBack.ch is not a major US ad network.

**Tune / go2sdk:** `js.go2sdk.com/v2/tune.js` is a performance marketing SDK for affiliate and partner attribution. Two occurrences in GTM.

**VWO (Visual Website Optimizer):** Account 728048 is active for A/B testing, with cookies `_vwo_uuid_v2`, `_vwo_uuid`, `_vwo_sn`, `_vwo_ds`, and `_vwo_consent` setting on first load. The investigator observed VWO configured to hide the page body during test loading -- if VWO's CDN is slow, visitors see a blank page.

## Call Tracking

KinderCare uses Google Ads dynamic number insertion (DNI) via `www.googleadservices.com/ga/phone`. Visitors from different ad sources are shown different phone numbers for each center. When a parent calls a center, the call is attributed back to the specific ad campaign that drove that visit. The `/data/nearby-centers` API exposes this mechanism directly: `phoneNumber` is the number displayed to the user (which may be a Google-assigned tracking number), `originalPhone` is the center's real direct line, and `overridePhone` is where tracking number assignments are stored. In the sampled centers, `overridePhone` was null -- no active swap observed -- but the field structure confirms the system is built in.

The `analytics_campaign` cookie stores cross-visit attribution state: `first_source=Direct&last_source=Direct&sites_visited=KinderCare`. This is a custom internal attribution cookie independent of GA.

The `FPLC` (First-Party Linker Cookie) is a Google Ads mechanism for cross-domain conversion tracking. It links activity on `www.kindercare.com` with conversion events on `my.kindercare.com` (enrollment, payment) -- completing the attribution chain from ad click to enrollment.

## Government Program Integration

The sitemap includes 20 `/public-prek/` pages covering state-funded pre-K programs where KinderCare operates as a government contractor:

- Alabama First Class Pre-K
- California CSPP (California State Preschool Program)
- Colorado UPK (Universal Preschool)
- Illinois Early Head Start

Families in these programs are accessing KinderCare services through public subsidy. The same tracker infrastructure -- full ad stack, session recording, call tracking -- applies to these pages.

The `fundingagency` microservice in the api.kindercare.com backend is the integration point for these programs, handling subsidy tracking alongside private tuition.

## LivePerson and Mobile App

LivePerson account 14673713 is the chat and messaging provider. The configuration fetched unauthenticated from `accdn.lpsnmedia.net` includes:

- Campaign zones: "Offsite," "Right Overlay," "Left Overlay"
- iOS SDK minimum version: 1.1.36
- Android SDK minimum version: 1.0.53
- AppDynamics APM integration: `le.appDynamics.enabled: true`
- Zone IDs created in 2017 -- the LivePerson integration predates most of the current tracker stack

The iOS and Android SDK configurations confirm KinderCare has a mobile app with in-app chat capability.

## Machine Briefing

**Access & auth:**
- The main site (`www.kindercare.com`) serves most content unauthenticated. Curl and fetch work directly.
- `/api/centers/search/kindercare` returns 503 without cookies -- requires an `ASP.NET_SessionId` cookie from a prior homepage visit.
- The parent portal (`my.kindercare.com`) and `api.kindercare.com` require a JWT Bearer token in the `access_token` cookie. Without a valid JWT, all microservice endpoints return 503 "Invalid Request".
- To get a JWT: authenticate through `login.kindercare.com`, which redirects to `my.kindercare.com` and sets `access_token`.

**Open endpoints (no auth):**

```bash
# Nearest centers by server-side IP geolocation (returns 3 centers)
GET https://www.kindercare.com/data/nearby-centers

# Center detail page (HTML, server-rendered)
GET https://www.kindercare.com/our-centers/{city}/{state}/{centerId}
# Example: https://www.kindercare.com/our-centers/san-francisco/ca/301999

# Center photos (requires full URL from API response)
GET https://www.kindercare.com/ProfileBinary.axd/files/{id}/{Category}.jpg

# LivePerson chat config (unauthenticated)
GET https://accdn.lpsnmedia.net/api/account/14673713/configuration/setting/accountproperties
GET https://accdn.lpsnmedia.net/api/account/14673713/configuration/le-campaigns/zones
```

**Endpoints requiring session cookie:**

```bash
# Center search (requires ASP.NET_SessionId from homepage visit)
GET https://www.kindercare.com/api/centers/search/kindercare

# Contact form submission per center (POST only)
POST https://www.kindercare.com/post/contact-form-component/{centerId}
```

**Authenticated endpoints (require `access_token` JWT):**

```bash
# Sponsor (parent) data with OData
GET https://api.kindercare.com/sponsor/v2/query/Sponsor?$expand=Students($filter=isActiveStudent eq true)

# Student health data
GET https://api.kindercare.com/student/v1/query/Student?$filter=Id eq {studentId}&$expand=HealthInformations($expand=CareSupports,StudentAllergies),MedicalProviders(expand=Address),MedicalInformation,StudentTransportationInformation

# Billing
GET https://api.kindercare.com/invoice/v1/BillingSummary
GET https://api.kindercare.com/paymentintegration/api/payments/getbillingstatementpdf

# Enrollment mutations (CQRS)
POST https://api.kindercare.com/enrollment/CommandRequest/
# Body: { "CommandName": "Insert Enrollment", ... }

# Backup care
POST https://api.kindercare.com/backupcare/BUCReservation
DELETE https://api.kindercare.com/backupcare/BUCCancelReservation
```

**Gotchas:**
- `/data/nearby-centers` returns results based on server IP, not client-provided coordinates. You get 3 centers near the request origin; you cannot specify a location via parameters.
- The `tuitionAndOpeningsUrl` in the nearby centers API response (`/our-centers/contact/{id}`) returns 404 -- this URL was reorganized.
- Center IDs appear to be numeric (301999, 301335, 301367 observed). Sequential ID probing across the 1,500+ location range is not blocked at the API level but robots.txt discourages the parameter patterns for the search endpoint.
- `ProfileBinary.axd` photo URLs require the full path from the API -- partial URLs return 404.
- GTM container `GTM-MC3ZWQ` is accessible directly: `https://www.googletagmanager.com/gtm.js?id=GTM-MC3ZWQ`
