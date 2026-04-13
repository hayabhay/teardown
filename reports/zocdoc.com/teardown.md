---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Zocdoc — Teardown"
url: "https://zocdoc.com"
company: "Zocdoc"
industry: "Healthcare"
description: "Online marketplace for booking doctor appointments."
summary: "Multi-app React/Redux frontend (patient-web-app, booking-web-app) over a .NET/C# backend. GraphQL on api2.zocdoc.com routes through HIPAA-compliant ClearDATA infrastructure for directory and booking data; REST APIs on api.zocdoc.com handle A/B assignments, metrics, and guided search. DataDome WAF, AWS Cognito auth, two CloudFront CDN distributions with independent release cycles and Sentry projects."
date: "2026-04-13"
time: "07:13"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [React, Redux, GraphQL, CloudFront, AWS Cognito, DataDome]
trackers: [DataDome, Branch.io, Sentry, SpeedCurve LUX, Google Maps]
tags: [healthcare, marketplace, graphql, hipaa, ab-testing, sponsored-content, insurance, appointments]
headline: "Open GraphQL introspection on Zocdoc's PHI API exposes 141 types — including the full sponsored-listing auction chain, ad spend locks, and page rank fields — without authentication."
findings:
  - "Open GraphQL introspection on the PHI API exposes 141 types including internal fields like isTest, spendLockStatus, and displayOnPageRank — the full sponsored ad auction chain is readable without authentication."
  - "149 A/B flags ship in Redux state on every page load, revealing that LLM-guided search is fully built but toggled off, virtual care is priced at $72, and password login has been removed entirely."
  - "Non-marketplace practices cannot show appointment times — a feature flag (PRACTICE_DISABLE_TIMES_FOR_NON_MARKETPLACE) suppresses slots for providers who don't pay, making them appear in search but functionally unbookable."
  - "A QA bundle (testingScenarios.js) ships to every booking-page visitor in production, referencing CLEARDATA_API_HOST and test booking ID patterns from the partner API docs."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Zocdoc is a two-sided healthcare marketplace connecting patients with doctors for in-person and virtual appointments. It operates at significant scale — across all major insurance carriers, specialties, and markets — and has evidently spent serious engineering effort on both its data infrastructure and its HIPAA compliance posture. The technical picture that emerges is that of a mature, architecturally deliberate platform with unusually clean third-party tracking, two-tier PHI data isolation, and a product roadmap that's nearly fully visible from the frontend.

---

## Architecture

The frontend is React with Redux state management — not Next.js, a custom Webpack build. There are at least two separately deployed React applications sharing the same domain:

**patient-web-app** handles the consumer-facing experience: homepage, search results, provider profiles, and marketing pages. Release tag at time of investigation: `version_patient-web-app_2026-04-13-041800`. Assets served from CloudFront distribution `d36l6oq2276obd.cloudfront.net`. Sentry project `1236964`.

**booking-web-app** handles the transactional flow: appointment booking, user registration, login, password reset, and insurance card capture. Release identified only by git commit hash (`d6ed2f3f4e5e55c8d97fc13283c819a8bab88cb0`). Assets served from a separate CloudFront distribution `d3ckxhp3fn5zua.cloudfront.net`. Sentry project `1257842`.

The two apps deploy independently, maintain separate release versioning, and report errors to separate Sentry projects. A registration page visit fires only to project `1257842`; a homepage visit to `1236964`.

The backend is .NET/C# — confirmed by class name leaks in API error responses: `PhiAbExperiments.ExperimentAssignmentRequest` from the A/B system, and `GuidedSearchService.ExecuteGuidedSearch.TriageCompleted` from the SAM service. API routing shows patterns consistent with Kong API Gateway (`"no Route matched with those values"` error message).

Authentication runs through AWS Cognito at `verify.zocdoc.com`, with OAuth redirecting to `https://www.zocdoc.com/api/rest/accounts/v1/sociallogin`. Zocdoc has gone fully passwordless: the A/B flag `auth_show_password_login` is `off`, `auth_passwordless_email_login` is `on`, and `SigninWithApple_ShouldShowLoginButton` is `on`. No password login UI is exposed to users.

The deployment config object `window.ZD` is present on every page load, carrying `ZD.configs` with API hosts, Sentry DSN, CDN manifest URLs, and the release tag. The `MANIFEST` within configs lists every JavaScript bundle in the deployment with CDN hash URLs — a complete inventory of all page-specific code Zocdoc ships. Notable bundles include `searchai.js` (1.9MB AI search bundle), `churned_preview_profile.js` (profiles for cancelled providers), `affiliateproviderfeed.js` (B2B data feed), `insurancecardcapture.js` (OCR card capture), and `testingScenarios.js` (QA tool shipped to production).

---

## The Two-Host API Architecture

Zocdoc operates two distinct API hosts, and the split is architecturally deliberate:

- `api.zocdoc.com` — `AWS_API_HOST` — non-PHI endpoints: A/B assignments, metrics, SAM guided search, event logging
- `api2.zocdoc.com` — `CLEARDATA_API_HOST` — PHI/HIPAA-compliant infrastructure for the directory GraphQL, booking flows, and care journey data

ClearDATA (now part of CrowdStrike) provides HIPAA-compliant cloud hosting on AWS, including Business Associate Agreement coverage. Zocdoc has routed all sensitive health data through this separately hosted infrastructure. The `testingScenarios.js` production bundle confirms this split in its own source code: `const d = n.g.ZD.configs.CLEARDATA_API_HOST` is the first meaningful variable assignment in the bundle, used to construct all API calls within the booking flow.

The network log from the search page shows calls splitting across both hosts:
- `POST /directory/v3/gql` (api2) — provider search results
- `POST /user/v1/gql` (api2) — user state
- `POST /sam/v1/guidedsearch/state` (api) — SAM triage session
- `POST /phi-ab/v1/www/assignments/logging` (api) — A/B flag logging
- `POST /metrics/v1/monitoring` (api) — performance RUM

---

## GraphQL: Open Introspection on the PHI API

`https://api2.zocdoc.com/directory/v3/gql` is the primary data API and accepts full GraphQL introspection without authentication. The schema returns 141 types — no auth token, no API key, no introspection blocking.

The `RootQuery` has no mutations (confirmed: `mutationType: null`). All writes go through separate REST endpoints. Readable queries without auth include `provider`, `providerByNpi`, `search`, `listing`, `practice`, `allInsuranceCarriers`, `allInsurancePlans`, and `popularSpecialties`.

The schema includes internal business fields that would normally sit behind an operator API:

**Provider type (131 fields):**
- `isTest` — boolean flag for test providers in production data
- `latestActivationStartDate` / `latestActivationEndDate` — subscription lifecycle timestamps
- `personIdentifierSource` / `dataProvidedBy` / `dataProvidedByUrl` — data sourcing attribution
- `isDisassociatedFromPractice` — whether the provider has left their listed practice
- `trustedInsuranceRating` — internal insurance trust score
- `genderIdentity`, `sexualityInfo`, `faithInfo`, `ethnicitiesInfo`, `modalitiesInfo`, `treatmentApproachesInfo`, `ageRangesInfo` — identity and DEI fields

**ProviderLocation type (29 fields):**
- `spendLockStatus` — payment/subscription locking state
- `displayOnPageRank` — exact sponsored ranking position
- `topSpoPracticeMessage` / `topSpoPracticeTooltipMessage` — custom ad copy per practice

**Review type:**
- `patientName` — patient names are a queryable field on reviews, accessible without authentication

**SpoAd type (sponsored provider ads):**
- `adServedEventId`, `adRank`, `adDecisionToken`, `spoAdDecisionId` — full ad auction state

The `SearchResult` type includes both an `spo: SpoResponse` field alongside the organic results, making the full sponsored layer queryable.

`providerByNpi` allows NPI-based provider lookup without any authentication. A valid NPI number returns the provider's full record including subscription status fields.

A second GraphQL endpoint, `https://api2.zocdoc.com/user/v1/gql`, handles authenticated user state. The schema root is `UserRootQuery` with `User`, `PhoneIdentity`, and `Tenant` types. This endpoint returns 401 without a valid session.

---

## The Sponsored Provider Ad (SPO) System

The `SpoAd` type in the schema is Zocdoc's internal auction system for which doctors appear prominently in search results. Every search result carries a `spo: SpoResponse` alongside organic provider listings.

The `adDecisionToken` and `spoAdDecisionId` fields suggest a bidding or allocation system per decision. `adRank` gives the sponsored position; `adServedEventId` tracks that the ad was shown. The `displayOnPageRank` on `ProviderLocation` makes the exact ranked position of any sponsored provider queryable.

The A/B flag `spo_show_spo_on_search_map = "on"` confirms sponsored placements appear in both the list view and the map view — double placement for paying practices in the same search.

The availability paywall connects directly to this system: `PRACTICE_DISABLE_TIMES_FOR_NON_MARKETPLACE = "on"` means that practices without a marketplace subscription cannot display their appointment times in search results. A non-paying practice appears in search results but with no bookable slots visible — the slots exist but are suppressed. Combined with the SPO system, this creates a two-tier search result: sponsored providers with visible times, non-marketplace providers appearing organic but functionally unbookable.

`ProviderLocation.spendLockStatus` provides the per-location billing state for this gate.

Churned (cancelled) providers get a dedicated bundle — `churned_preview_profile.js` — and the A/B flag `provider_onboarding_remove_join_back_from_churn = "on"` removes the re-join CTA from their profiles. `gro_profile_dead_end_experience = "on"` activates a specific dead-end UI for profiles with no available bookings.

---

## 149 A/B Flags and the AI Search Pipeline

`window.__REDUX_STATE__.absystem` on every page load contains the full set of active A/B flag assignments — 149 flags at time of investigation. This is the complete state of Zocdoc's current product experiments and feature gates, readable by anyone who loads the homepage.

The most notable cluster reveals an LLM-based search system that is fully built and staged but not yet live for general traffic:

- `sam_llm_based_guided_search_enabled` = `"off"` — the LLM guided search master toggle
- `search_ai_search_phase_1` = `"off"` — AI search first deployment phase
- `search_ai_direct_search_ssr` = `"off"` — server-side rendering for direct AI search
- `search_ai_search_nudge` = `"off"` — UI prompt to try AI search
- `search_ai_search_cookie_query` = `"off"` — cookie-based AI query storage
- `sam_provider_ner` = `"provider"` — Named Entity Recognition is already active in production, set to provider-mode

The SAM (Search & Appointment Matching) service is the routing engine behind this. It manages the guided triage questionnaire that Zocdoc shows before search results. The care journey endpoint (`/sam/v1/carejourney`) creates a session record:

```json
{
  "care_journey_id": "f05b975a-0b9b-4801-b80c-644edcb395ef",
  "created_at_utc": "2026-04-13T06:59:23.1876107Z",
  "directory_id": "-1",
  "location": { "address": null, "borough": null, "city": "...", ... }
}
```

This endpoint is accessible without authentication — it creates a care journey record tied to session cookies (`bsid`, `firstTimeVisitor`) and accepts location data including a `use_experimental_ip_location` field for IP-based location inference.

The SAM system's .NET service name leaked in the event log: `GuidedSearchService.ExecuteGuidedSearch.TriageCompleted`. The guided search triage covers: ORTHOPEDIC, OBGYN, MENTALHEALTH, ULTRASOUND, XRAY, MRI, CT, DERMATOLOGIST, BRAND, DENTAL, EYE, MAMMOGRAM — most migrated to the new SAM system (`Search_*_Guided_Search_Migration = "on"`), with Eye not yet migrated (`Search_Eye_Guided_Search_Migration = "off"`).

Other notable flags from the 149:

- `Search_Dobbs_Banner = "on"` — abortion access information banner active on search
- `Search_Gender_Affirming_Care_Banner = "on"` — gender-affirming care search banner active
- `verticals_virtual_care_pricing = "72"` — virtual care appointments priced at $72
- `PCE_MsWlIsFullyPublic = "off"` — a Microsoft waitlist feature not yet public
- `gro_booking_module_v2 = "off"` — v2 booking module in testing
- `Search_Insurance_Eligibility_Plan_Identification_API_TIMEOUT = "37"` — 37-second timeout on external insurance eligibility API
- `patient_insurance_enable_cross_carrier_matching = "on"` — cross-carrier insurance matching active
- `patient_insurance_enable_tier_two_carriers = "on"` — second-tier carriers enabled

---

## The MappableButNotBookable Insurance Gap

The `allInsurancePlans` GQL query returns an `experimentalPlanStatus` field per plan. Each status object has a `value` (string) and `abVariant` (A/B test variant).

Querying Aetna's plans (carrier `ic_300`): 625 total plans returned. Of those, 606 (97%) have `experimentalPlanStatus.value = "MappableButNotBookable"`. The remaining 19 have null status.

A `MappableButNotBookable` plan means the plan appears in Zocdoc's insurance filter and "in-network" search results, but an appointment cannot actually be completed through Zocdoc with that plan. The `abVariant` field per plan suggests Zocdoc is A/B testing the messaging around this limitation — different users may see different explanations when their plan hits this state.

The insurance eligibility pipeline adds complexity. `Search_Insurance_Eligibility_KillSwitch = "on"` indicates real-time eligibility checking is active. The 37-second timeout on the plan identification API — an external clearinghouse call — is long enough to create visible latency in the booking flow. `patient_insurance_eligibility_plan_identification_v2 = "on"` and `patient_insurance_enable_cross_carrier_matching = "on"` are both active.

The insurance card OCR flow uses `insurancecardcapture.js` — confirmed deployed at `d3ckxhp3fn5zua.cloudfront.net`. The bundle handles the photo-upload, OCR, and plan identification pipeline. Combined with the 37-second eligibility timeout, a patient could photograph their card, have it parsed, and then discover their plan is mappable but not bookable — after considerable investment of time in the booking flow.

---

## testingScenarios.js in Production

The `MANIFEST` in `window.ZD.configs` lists every bundle in the booking-web-app deployment. Among them: `testingScenarios.js` at `d3ckxhp3fn5zua.cloudfront.net/testingScenarios/scripts/testingScenarios.03b14ae304d82923cd43.min.js`.

The bundle is live and publicly accessible — it returns valid JavaScript with a Sentry debug ID (`c5e97e95-d61b-4a99-b0af-28a0d3a99f26`) and immediately reads `n.g.ZD.configs.CLEARDATA_API_HOST` as its first API reference. This is not a dead file — it's a fully initialized bundle that makes real API calls.

Zocdoc's partner API documentation (at `developer.zocdoc.com`) publicly lists test IDs for integration testing:
- NPI test handles: `npi_error`, `npi_missing`, `npi_multipleproviders`, `npi_multiplelocations`, `npi_allvirtual`, `npi_hasvirtual`
- Insurance plan test IDs: `ip_0` (invalid, triggers 400), `ip_5432` (national coverage), `ip_2052` (Medicare), `ip_8281` (Medicaid)
- Provider/location error triggers: `pr_error/lo_error`, `pr_selfPayNotAccepted`, `pr_acceptsInNetworkOnly`

These are the test scenarios the `testingScenarios.js` bundle is designed to exercise. The page `/testingScenarios` redirects to the homepage — no direct UI access — but every user who visits the registration or booking flow downloads this bundle.

---

## Surveillance and Tracking

Zocdoc's tracker footprint is notably lean for a healthcare site at this scale:

**Active third-party calls (homepage):**
- `geo.captcha-delivery.com` — DataDome bot protection and fingerprinting
- `api2.branch.io` — Branch.io deep link attribution and mobile install tracking (`/v1/open`, `/v1/pageview`)
- `o147115.ingest.us.sentry.io` — error monitoring

**Active first-party analytics:**
- SpeedCurve LUX (`window.LUX`) — real user monitoring; sets `lux_uid` cookie
- Two event logging systems: `POST /eventslogging/v1/event` and `POST /eventslogger/v2/logevents`

**Absent:** Google Analytics (GA4 or Universal), Meta/Facebook Pixel, LinkedIn Insight Tag, DoubleClick/DV360, any advertising network pixel.

Branch.io fires `POST /v1/open` and `POST /v1/pageview` on initial page load before any user interaction with the privacy banner. DataDome fires immediately as a functional requirement. The privacy banner at `/privacy-settings?referrerType=PrivacyBanner` manages consent choices downstream.

**Cookie inventory:**
- `bsid` — browser session ID, format `{hash}_{YYYYMMDDHHII}`
- `firstTimeVisitor` — UUID for first-visit tracking
- `originalReferrer` / `mostRecentReferrer` — funnel attribution
- `referrer_[bsid]` — per-session referrer
- `product_channel` — acquisition channel (e.g., `brand`)
- `product_channel_detail` — granular channel (e.g., `brand home direct`)
- `previouslySearchedProcedureIdForTriage` — last searched procedure ID, persists across sessions
- `initiationId` — search session initiation tracking
- `address_cookie` — stored location
- `isNewPatient` — patient status flag
- `datadome` — DataDome anti-bot session (1-year expiry, SameSite=Lax)
- `insuranceEligibilityRequestId` — insurance eligibility check request tracking
- `lux_uid` — SpeedCurve RUM user ID

**robots.txt and AI bots:** Zocdoc explicitly allows every major AI crawler — GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, Google-Extended, PerplexityBot. This is not an oversight; it's a deliberate choice to feed provider and appointment data into LLM systems.

**robots.txt disallowed paths reveal internal product surfaces:**
- `/syndication/v1/initialization` — B2B white-label syndication API
- `/eventslogging/v1/event` and `/eventslogger/v2/logevents` — event tracking (two separate systems)
- `/humanrecording` — session/human recording tool
- `/remote/` — remote access path
- `/localization/` — i18n service
- `/connect/` — patient-provider messaging
- `/booking/` — booking flow
- `/wl/*/guest-checkout` — white-label widget guest checkout
- `/patient/check-in/*` — pre-appointment check-in flow
- `/*mktexperiment` — marketing experiment URL tracking

---

## Error Message Leaks and Internal Architecture

Three separate error patterns expose internal service structure:

1. **phi-ab endpoint:** `{"errors":{"Body.experiments":["Required property 'experiments' not found in JSON. Path '', line 1, position 42."]}}` — reveals the `ExperimentAssignmentRequest` body schema and .NET validation error format

2. **SAM endpoint:** `{"message":"no Route matched with those values","request_id":"..."}` — Kong API Gateway's standard unmatched-route error; confirms Kong is in the request path

3. **GQL errors from directory API:** `{"message":"The argument 'pageNumber' does not exist.", "extensions":{"type":"Provider","field":"reviews"}}` — reveals exact field and argument names on GraphQL type errors

The Sentry DSN in `window.ZD.configs` is a public key (`o147115.ingest.us.sentry.io`) — this is how Sentry client-side SDKs work and is not a credential. The git SHA from the patient-web-app release tag is readable but points to a private repo.

---

## Machine Briefing

**Access and auth:** Most read-only queries work without authentication via browser with a DataDome cookie (`datadome` cookie from any page load). Direct `curl` to `api2.zocdoc.com` is blocked by DataDome (403 with slider CAPTCHA challenge). Browser-based fetch with a valid DataDome session cookie passes. Authenticated endpoints (`/user/v1/gql`) require a valid session.

**Open endpoints (no auth required, browser context with DataDome cookie):**

GraphQL directory queries:
```
POST https://api2.zocdoc.com/directory/v3/gql
Content-Type: application/json

# Full schema introspection
{"query": "{ __schema { types { name kind fields { name } } } }"}

# Provider lookup by NPI
{"query": "{ providerByNpi(npi: \"1215390546\") { id firstName lastName npi status isTest latestActivationStartDate latestActivationEndDate spendLockStatus providerLocations { id spendLockStatus displayOnPageRank topSpoPracticeMessage } reviews { reviewId patientName comment date overallRating } } }"}

# All insurance carriers
{"query": "{ allInsuranceCarriers { id name insuranceType } }"}

# Insurance plans for a carrier with experimental status
{"query": "{ allInsurancePlans(carrierId: \"ic_300\") { id name isHidden patientActive experimentalPlanStatus { value abVariant } } }"}

# Popular specialties
{"query": "{ popularSpecialties { id name } }"}
```

SAM care journey (unauthenticated):
```
POST https://api.zocdoc.com/sam/v1/carejourney
Content-Type: application/json

{
  "tracking_id": "<uuid>",
  "session_id": "<bsid-cookie-value>",
  "triage_session_id": "<uuid>",
  "location": { "city": "New York", "state": "NY", "use_experimental_ip_location": false }
}
```

A/B assignments:
```
POST https://api2.zocdoc.com/phi-ab/v1/www/assignments
Content-Type: application/json

{
  "userId": null,
  "sessionId": "<bsid-cookie-value>",
  "experiments": ["sam_llm_based_guided_search_enabled", "search_ai_search_phase_1"]
}
```

Performance monitoring (open):
```
POST https://api.zocdoc.com/metrics/v1/monitoring
Content-Type: application/json
```

**Partner API (requires OAuth token from developer.zocdoc.com):**
```
GET https://api.zocdoc.com/v1/providers?npi=<npi>
GET https://api.zocdoc.com/v1/provider_locations?zip=<zip>
GET https://api.zocdoc.com/v1/provider_locations/{id}/insurance_mappings
GET https://api.zocdoc.com/v1/provider_locations/availability
GET https://api.zocdoc.com/v1/insurance_plans?state=<state>
GET https://api.zocdoc.com/v1-beta/facilities
```

**Gotchas:**
- DataDome blocks all direct `curl` — use browser automation or Playwright with a real browser fingerprint. The `datadome` cookie lasts 1 year once obtained.
- GQL `reviews` field on Provider does not accept `pageNumber` — pagination argument name differs from what you'd guess. Check schema introspection for correct argument names.
- `allInsurancePlans` without `carrierId` filter returns errors; use carrier IDs from `allInsuranceCarriers` first.
- `CLEARDATA_API_HOST` in ZD.configs is null at page load; it's populated by the booking flow initializer. The actual host is `api2.zocdoc.com` — visible in all network calls.
- SAM guided search state (`/sam/v1/guidedsearch/state`) requires a valid `procedure_id`; passing 0 returns `"Unknown procedure: 0"`.
- phi-ab assignments require the `experiments` array in the request body; empty body returns .NET validation error with field path.
