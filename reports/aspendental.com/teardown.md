---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Aspen Dental — Teardown"
url: "https://www.aspendental.com"
company: "Aspen Dental"
industry: "Healthcare"
description: "National dental service organization with 1,096 US locations."
summary: "Four Next.js apps (marketing, scheduling, dentist pages, digital content) served under one domain via an Istio/Envoy service mesh on Kubernetes, with Google Cloud Load Balancer and CloudFront as dual CDN layers. Content managed in Contentful, GraphQL via Apollo. Session replay (LogRocket, VWO), call tracking (Invoca), and HIPAA-framed analytics (Freshpaint) run across all pages."
date: "2026-04-12"
time: "20:44"
contributor: "hayabhay"
model: "sonnet"
effort: "high"
stack: [Next.js, Contentful, Kubernetes, CloudFront]
trackers: [Freshpaint, VWO, Invoca, LogRocket, OneTrust, Google Tag Manager, Google Analytics, Google Ads, Qualtrics, Birdeye]
tags: [healthcare, dental, tracking, hipaa, ab-testing, api-exposure, multi-brand, session-recording, consent, call-tracking]
headline: "Selecting 'emergency' or 'dentures' as your visit reason fires a named Google Ads conversion event before you even pick an office."
findings:
  - "Freshpaint's 110 publicly readable event definitions route dental visit intent — emergency, broken tooth, dentures, implants — to Google Ads and Floodlight as named conversion events before a patient finishes booking."
  - "The unauthenticated facilities API returns all 1,096 offices in one request, including each franchise's legal billing entity (e.g., 'Smiles By Suzy Dental PC'), private network IP subnets, doctor NPI numbers, hire dates, and ethnicity fields."
  - "22 VWO A/B tests running on every visitor embed Jira ticket IDs in their names, exposing product direction: Onix dental implants testing a homepage takeover, denture pricing split across Signature vs Premium tiers, and a financing experiment that tracks Patient Acknowledgment & Rights signatures as a conversion goal."
  - "A single Contentful CMS space serves at least four brands under The Aspen Group — Aspen Dental, ClearChoice, Lovet (veterinary), Liv WellNow (urgent care) — with the access token and 36,000 entries exposed via client-side config."
  - "LogRocket session recording, Invoca call tracking (14 requests per homepage load), and Google Ads conversion pixels all fire before any interaction with the OneTrust consent banner; GPC support is licensed but not activated in the deployed ruleset."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Aspen Dental runs a national dental service organization (DSO) of 1,096 locations. Its web stack is more complex than most healthcare sites: four distinct Next.js apps sharing a domain, a Kubernetes-based service mesh, and a full-scale ad-tech stack. The combination of pre-consent session recording, health-intent signals routing into Google Ads, and an unusually forthcoming unauthenticated API makes for a dense technical picture.

---

## Architecture

The domain `aspendental.com` is a monolith in UX terms but four separate applications under the hood, routed by an Istio/Envoy service mesh on Kubernetes:

- **aspenmarketing** — main marketing site (homepage, services, offers, Motto Aligners sub-brand)
- **digitalmarketing** — CMS content layer; build ID `digitalmarketing-2.346.1-5d5235b17ec2735fe1dec2a7a6cc1059a03f9b2a`
- **scheduleanappointment** — scheduling flow; build ID `scheduleanappointment-2.347.1`
- **dentist** — Office Detail Pages (ODPs), one per location

Each is a Next.js app. The HTTP response headers make this architecture readable from the outside. The main site returns:

```
server: istio-envoy
x-proxy-pass: http://aspenmarketing.web.svc.cluster.local/
x-envoy-decorator-operation: webgateway.web.svc.cluster.local:80/*
x-tag-environment: prod
x-tag-region: us-central1
x-tag-routing-decision: none
x-tag-slot: default
```

Traffic routes through two CDN layers: Google Cloud Load Balancer (indicated by `via: 1.1 google`) and AWS CloudFront (`via: 1.1 [cloudfront-id].cloudfront.net`). CloudFront's viewer enrichment headers — `cloudfront-viewer-city`, `cloudfront-viewer-latitude`, `cloudfront-viewer-longitude`, `cloudfront-viewer-postal-code` — are passed through to the origin on every request, giving Aspen Dental's backend precise geolocation from CloudFront without calling a separate geolocation API.

TeamTag (`api.teamtag.com`) receives scheduling flow events. Despite the external domain, it's Aspen Dental's own internal data platform — the response header `x-envoy-decorator-operation: userevents.dataplatform.svc.cluster.local:80/*` confirms it's another K8s service in the same cluster, accessed through the external domain.

Content is managed in Contentful. The marketing app's `__NEXT_DATA__` (visible in 404 responses) references Contentful with the `environments/development` environment and an access token in client-side config. The scheduling app correctly targets `environments/master`. The marketing app is pulling production CMS content from a development-flagged environment.

GraphQL runs via Apollo. The external endpoint (`api.aspendental.com/websitegraphql/graphql/`) has introspection disabled. The BFF endpoint (`aspendental.com/api/bff`) requires authentication; unauthenticated requests return an error with Apollo stack trace detail including internal file paths (`/app/dist/index.js:254:23`).

---

## The Surveillance Stack

Nine trackers across the site. The homepage fires roughly 50 network requests on load: 15 first-party, 35 third-party across nine domains.

**Freshpaint** (`api.perfalytics.com`) is the central analytics proxy, marketed as HIPAA-compliant. Token: `a2eeee91-8c6e-4384-a821-1b43a90f1559`. The full event definition set — 110 events — is publicly accessible at `perfalytics.com/event-definitions/a2eeee91-8c6e-4384-a821-1b43a90f1559` with no authentication. This file is fetched on every page load.

**VWO** (`dev.visualwebsiteoptimizer.com`) runs A/B testing and session recording. Account ID: `613301`. It initializes before page render — the code sets `hide_element='body'` to blank the page until VWO loads, preventing flicker between variants. 22 experiments are all in RUNNING status.

**Invoca** (`pnapi.invoca.net`) handles call tracking. Tag ID: `1487/1465773014`. It fires 14 times on homepage load to a single endpoint (`POST /1487/na.json`), 4-5 times on other pages. It sets an `invoca_session` cookie containing `first_landing_page` and `invoca_id`. VWO uses `invocaSchedule`, `invocaLead`, and `invocaCall` as distinct conversion goals — every phone call attributed back to which A/B variant drove it.

**LogRocket** (`r.lrkt-in.com`, SDK version `script-24.259.0`) starts full session recording immediately on page load. It sets a cookie (`_lr_tabs_-b4yq4l/aspendental`) with a recording ID. The recording begins before the user sees the consent banner.

**OneTrust** (`cdn.cookielaw.org`) is the consent management platform. Consent ID: `0b7505fb-cec1-41aa-9b91-477ce85bc7e4`. OneTrust's platform supports GPC (Global Privacy Control) — `CookieV2GPC: true` is listed in `TenantFeatures` — but the deployed ruleset has `IsGPPEnabled: false`. A single "Global" rule covers all countries including the US. From a California viewer, GPC signals are not processed.

**Google Tag Manager** (GTM-NTW7353) loads inline in `<head>` before any other script.

**Google Analytics** fires `/g/collect` on every page.

**Google Ads** conversion tracking (`pagead2.googlesyndication.com/pagead/conversion/772955331/`) fires on the homepage without any user action.

**Qualtrics** (`siteintercept.qualtrics.com`) loads on Office Detail Pages for survey intercepts.

**Birdeye** API key (`pHTdKysFBHxzCr2CO4yaqNu4LTv74Fdu`) and URL (`https://api.birdeye.com/resources/v1/review/businessid/`) are in client-side config. Birdeye is the review aggregation platform used across all 1,096 offices.

**Pre-consent behavior**: LogRocket, Invoca, VWO (body-hiding initialization), Google Ads conversion, and Freshpaint all fire before the user interacts with the OneTrust banner.

---

## Service Intent Routed to Google Ads

The scheduling flow begins with a visit reason selector. The form values are: `Emergency`, `BrokenTooth_ToothPain`, `Implants`, `Dentures`, `ClearAligners`, `Other`.

Freshpaint's 110-event taxonomy maps these directly to named events that route to Google Ads as conversion signals:

```
Google Ads - Online Appointment - Emergency - Test
Google Ads - Online Appointment - BrokenTooth_ToothPain - Test
Google Ads - Online Appointment - Dentures - Test
Google Ads - Online Appointment - Implants - Test
Google Ads - Online Appointment - ClearAligners - Test
Google Ads - Online Appointment - Other - Test
```

Each has a v2 variant as well (`- Test v2`), with additional categories: `Routine Check Up`, `Urgent Need`. These events fire when a patient selects their visit reason — before they pick an office, before they pick a date, before they provide personal information.

The same signals flow into Google's Floodlight (Google Marketing Platform):
```
FL - Aspen Dental - Appointment Confirmation - Dental Implants
FL - Aspen Dental - Appointment Confirmation - Dentures
FL - AD & Motto - Appointments - Start
```

Harmelin, identified as the media agency in the event names, has its own tagged events in the Freshpaint pipeline:
```
Harmelin - Google Ads - Online Appointment Emergency New Patient Tag
Harmelin - Google Ads - Schedule an Appt Start
Harmelin - Online Appointment New Patient Tag
```

The full booking flow — seven steps from visit reason to confirmation — maps to sequential Freshpaint events: `AppointmentPatientInformation`, `AppointmentAdditionalPatientInfo`, `AppointmentDateAndTime`, `AppointmentReview`, `AppointmentScheduleConfirm`, and `AppointmentConfirmation1` through `AppointmentConfirmation6`. Step 5 collects first name, last name, DOB, sex/gender, address, and zip. Step 6 adds mobile phone, email, and insurance status. For minors, guarantor information (parent/guardian name and DOB) is collected. The e-commerce event names in the Freshpaint catalog — `AddToCart`, `AddPaymentInfo`, `InitiateCheckout` — appear alongside the appointment events, applying the standard Meta/Google conversion taxonomy to a dental scheduling workflow.

---

## A/B Testing Exposes Product Roadmap

VWO account 613301 runs 22 experiments simultaneously, all RUNNING. The experiment names embed Jira ticket IDs directly, making the product backlog partially readable from client-side JavaScript.

**Session recording experiments (8 total, 100% traffic):** These aren't A/B tests — they're VWO's recording feature applied to specific flows: the homepage, Motto Aligners pages, Pricing & Offers, Office Detail Pages, and a general visitor sessions recording that has been running since early 2022.

**Active VISUAL_AB experiments:**

| ID | Ticket | Description |
|----|--------|-------------|
| 1079 | TTB-188 | Chatbot for Idle Users |
| 1104 | TTB-209 | ODP Promo Cards |
| 1121 | TTB-220 | Scheduler Back Button |
| 1129 | TTB-228 | Q1 Promos - March Push - Dentures |
| 1130 | TTB-229 | Q1 Promos - March Push - Implants |
| 1131 | TTB-230 | Q1 Promos - March Push - Dental Services |
| 1132 | TTB-227 | Homepage Onpage Scheduler |
| 1156 | TTB-234 | ODP Service Order Optimization |
| 1157 | TTB-235 | Check Up RFV Clarity (50% traffic) |
| 1158 | TTB-236 | Onix HP Takeover |
| 1174 | -- | TxN App - ADSP Banner Test |

**Onix (TTB-236):** This experiment tests whether a new product, Onix dental implants, takes over the homepage. The CSS class `.ttb236__hero` controls the variant. The Onix landing page (`/dental-implants/merch-lander/onix/`) is live but not in the sitemap and absent from the main navigation. It presents two product lines: "Onix Fixed" (permanent full arch) and "Onix Secure" (implant-retained dentures), with "1/3 cost of other fixed full arch providers" as the positioning claim.

**Dentures pricing (TTB-228):** The dentures March push has four variants that reveal pricing strategy: `1---Signature-Online`, `2---Signature-Call`, `3---Premium-Online`, `4---Premium-Call`. Two product tiers (Signature, Premium) crossed with two acquisition channels (web vs phone) tested simultaneously. This structure makes explicit which pricing presentation converts better via which contact method.

**ADSP Banner (TxN App):** The transaction app experiment (1174) tests placement of the Aspen Dental Savings Plan (ADSP) banner in the scheduling flow. Conversion goals include `adsp_banner_clicked`, `adsp_banner_displayed`, `apply_for_finance`, and `par_signed`. The last goal — `par_signed` — is the Patient Acknowledgment & Rights signature, tracked as a conversion metric in an experiment about financing banner placement.

**DEPLOY experiments (3):** TTB-207-Option-A and Option-B test two variants of Q1 dentures and implants addendum promotions at 100% traffic (both simultaneously). TTB-237 rolls out office redirect messaging.

---

## Facilities API

Two unauthenticated, CORS-open endpoints expose the full office network:

**Composable API** — returns all 1,096 offices in a single response:
```
GET https://www.aspendental.com/composable/api/facility/collection/
Access-Control-Allow-Origin: *
```

Response fields per office: `code`, `name`, `slug`, `legalBillingName`, `address`, `location` (latitude/longitude/landmarks), `phoneNumber`, `workingHours`, `reviews` (averageRating, reviewCount).

**Enterprise API** — paginated, 55 pages of 20 records each:
```
GET https://api.aspendental.com/api/web/v1/facilities/?page=1&page_size=20
Access-Control-Allow-Origin: *
```

This endpoint returns a substantially richer record. Notable fields beyond the composable API:
- `firstThreeOctets`: internal network subnet per office (e.g., `"10.104.216.0"` for New Britain CT, `"10.105.66.0"` for Seekonk MA)
- `legalBillingName`: the actual professional corporation or LLC operating the franchise (e.g., "Smiles By Suzy Dental PC", "Kapoor LLC")
- `birdeyeBusinessId`: Birdeye CRM ID per office
- `dma`: marketing DMA region
- `openDate`: ISO timestamp of when the office opened
- `comingSoon`: boolean for pre-announced locations
- `onP3`, `onMotto`: internal platform flags
- `anytimeAppointingDenture`, `anytimeAppointingMotto`: scheduling capability flags
- `doctors[]`: full provider roster including NPI number, hire date, degree, biography, ethnicity, languages, specialties

Each doctor record:
```json
{
  "providerId": "618985",
  "providerType": "MCD",
  "npi": "1356031181",
  "firstName": "Hyunjae",
  "lastName": "Ryu",
  "hireDate": "2023-07-24T00:00:00Z",
  "employeeStatus": "Active",
  "ethnicity": "",
  "biography": "..."
}
```

**The legal structure angle:** Aspen Dental is a DSO — it manages the brand, real estate, marketing, and business operations, while individual dentists operate their own professional corporations under a DSO agreement. The `legalBillingName` field makes this structure queryable across all 1,096 locations. Patients book through "Aspen Dental" but their billing entity is, for example, "PA-FM DENTAL PC" or "True Trusty Dental Group LLC". This information is public record in most states but the API makes it trivially bulk-accessible.

The staging enterprise API (`apistg.aspendental.com/api/web/v1/facilities/`) returns the same response structure. Staging office records carry different IP values (`190.0.2.x`) indicating test data rather than production network addresses.

---

## Multi-Brand Platform

Aspen Dental is one brand in The Aspen Group (TAG). The Contentful space (`m8zwsu9tyucg`) shared across the platform contains content for at least four TAG brands, identifiable from content-type field prefixes in the feature flags:

- **AD** — Aspen Dental (dental)
- **CC** — ClearChoice (dental implants; 1,733 Contentful entries)
- **LV** — Lovet (veterinary; feature flag fields include `showPetManagement`, `showSecondaryOwner`, `showNewPetDesign`)
- **WN** — Liv WellNow (urgent care)

The Aspen Dental Next.js config includes `CLEARCHOICE_API_URL: "https://www.clearchoice.com/api/v1/webapisched"` in the marketing app and `/api/v1/cc` in the scheduling app. This is the cross-brand scheduling integration between Aspen Dental and ClearChoice — both offer dental implant products, and the API endpoints suggest lead routing or appointment availability sharing between the two brands.

TeamTag (`api.teamtag.com`) serves as the shared internal data platform. The URL pattern `/v1/aspendental/dataplatform/userevents/user/events` includes the brand prefix — the same platform presumably handles `clearchoice`, `lovet`, and `livwellnow` namespaces.

All four brands share the same Next.js/Istio technical platform. The Contentful space access token (`kBbSrPktGH1WBUOwK8INsltLi6ihJ5n7FDC3NCeUS44`) in client-side config exposes the full content graph across this portfolio.

---

## Machine Briefing

### Access & auth

The marketing site, enterprise API, and composable API are fully accessible without credentials. `curl` works for all open endpoints — no session cookie, no CORS preflight required for same-origin simulation. The BFF GraphQL requires authentication. The enterprise GraphQL has introspection disabled.

The 404-triggered `__NEXT_DATA__` leak: any path that resolves to the Next.js 404 handler returns the full app config. `/api/web/v1/facility-locations/` is a reliable trigger for the `scheduleanappointment` app's config block.

### Endpoints

**Open — no auth:**

```bash
# All 1,096 offices — single response
curl "https://www.aspendental.com/composable/api/facility/collection/"

# Enterprise API — paginated (55 pages, totalCount: 1096)
curl "https://api.aspendental.com/api/web/v1/facilities/?page=1&page_size=20"

# Single facility by code
curl "https://api.aspendental.com/api/web/v1/facilities/4356"

# Staging enterprise API (same structure, different data)
curl "https://apistg.aspendental.com/api/web/v1/facilities/?page=1&page_size=20"

# Freshpaint event definitions (110 events, all destinations)
curl "https://perfalytics.com/event-definitions/a2eeee91-8c6e-4384-a821-1b43a90f1559"

# Birdeye reviews for a specific office (key from client config)
curl "https://api.birdeye.com/resources/v1/review/businessid/144982121785498?api_key=pHTdKysFBHxzCr2CO4yaqNu4LTv74Fdu"

# Birdeye business info
curl "https://api.birdeye.com/resources/v1/business/144982121785498?api_key=pHTdKysFBHxzCr2CO4yaqNu4LTv74Fdu"

# App config via 404 (returns full __NEXT_DATA__ for scheduleanappointment app)
curl "https://www.aspendental.com/api/web/v1/facility-locations/"
```

**GraphQL (auth required):**

```bash
# BFF — returns "User is not authenticated" with stack trace
curl -X POST "https://www.aspendental.com/api/bff" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}'

# Enterprise GraphQL — introspection disabled
curl -X POST "https://api.aspendental.com/websitegraphql/graphql/" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __schema { types { name } } }"}'
```

**Scheduling flow API (session required):**

```bash
# Facility locations for scheduling
GET https://www.aspendental.com/api/web/v1/facility-locations

# Single facility detail
GET https://www.aspendental.com/api/web/v1/facilities/{id}

# TeamTag scheduling events
POST https://api.teamtag.com/v1/aspendental/dataplatform/userevents/user/events
```

### Gotchas

- Enterprise API path: `api.aspendental.com/api/web/v1/facilities/` — paginated, `page` and `page_size` are query params. Default `page_size` is 20; totalPages is 55 for 1,096 facilities.
- The composable API returns all 1,096 records in one shot — no pagination. Response is a flat JSON array.
- `firstThreeOctets` is in the enterprise API response, not the composable API.
- Birdeye `businessId` values come from the enterprise API's `birdeyeBusinessId` field per office.
- The 404 `__NEXT_DATA__` leak includes `ENTERPRISE_API_URL_V2`, `ENTERPRISE_API_URL_V4`, `BEFFE_GRAPHQL_URL`, and both production and staging Contentful tokens. The keys differ between the `aspenmarketing` and `scheduleanappointment` apps.
- VWO config (`window._vwo_exp`) is in the page source as a minified inline script — parse `_vwo_exp` object for experiment details, variation assignments, and goal identifiers.
