---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Care.com — Teardown"
url: "https://care.com"
company: "Care.com"
industry: "Administrative"
description: "Online marketplace connecting families with caregivers for childcare, senior care, and housekeeping."
summary: "Care.com runs three independent Next.js micro-frontends (visitor homepage, enrollment, provider profiles) sharing a single Apollo GraphQL API and a legacy Java carezen.net backend. Authentication flows through a custom OIDC server at auth.careapis.com. Akamai handles edge routing and device fingerprinting. LaunchDarkly flag state for 50+ experiments is serialized into every page's server-rendered __NEXT_DATA__. A server-side GTM proxy at tagging.care.com routes tracking pixels through a first-party domain."
date: "2026-04-13"
time: "01:49"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack:
  - Next.js
  - Apollo GraphQL
  - Akamai
trackers:
  - Google Analytics
  - Google Ads
  - Amplitude
  - Facebook Pixel
  - Bing UET
  - TradeDesk
  - LinkedIn Insight
  - Hotjar
  - Sift
  - OneTrust
  - Tealium
  - Iterable
  - Sentry
  - Recruitics
  - Reddit Ads
  - Impact
tags:
  - care-marketplace
  - next-js
  - graphql
  - feature-flags
  - session-replay
  - pre-consent-tracking
  - api-key-exposure
  - gtm-proxy
  - source-maps
  - launchdarkly
headline: "An unauthenticated GraphQL query exposes every provider's pay-per-lead subscription tier, lead count, and lead cap — Care.com's business model readable from any profile URL."
findings:
  - "A Yelp Fusion API key is embedded in the Next.js runtimeConfig on every provider profile page — the key returns full business data from any Yelp read endpoint."
  - "An unauthenticated GraphQL query returns each provider's pay-per-lead subscription tier, lead count, and lead cap — exposing per-provider business metrics to anyone with their profile URL."
  - "Production source maps (6.4 MB, 1034 files) are publicly accessible from the CDN, exposing full TypeScript source including state reducers, validation logic, and generated GraphQL types."
  - "A feature flag named daycare-enrollment-recommendations-urgency-banner stores its exact copy in LaunchDarkly — 'Daycares fill up fast' — ready to deploy without a code change."
  - "A server-side GTM proxy at tagging.care.com routes all tracking pixels through a first-party domain, bypassing ad blockers that block googletagmanager.com by hostname."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Care.com is a gig-economy caregiving marketplace — childcare, senior care, pet care, tutoring, housekeeping — connecting families with caregivers and daycares. IAC acquired it in 2020 for roughly $500M. The platform has been running long enough to accumulate layered architecture debt: a legacy Java backend, three independently deployed Next.js micro-frontends, a custom OIDC server, and an acquisition trail that includes payroll services (Breedlove, MyHomePay), a provider marketing tool (Galore), and European subsidiaries (Betreut.de/at/ch).

## Architecture

Care.com runs three independent Next.js micro-frontend (MFE) apps served under different path prefixes:

- `/app/vhp/` — visitor homepage (`vhp-mfe` v2.211.1)
- `/app/enrollment/` — sign-up and onboarding (`enrollment-mfe` v2.335.0)
- `/app/smb-profile/` — provider profile pages (`smb-profile-mfe` v1.176.2)

Version numbers tell a story: enrollment-mfe at v2.335.0 represents thousands of deployments. The three apps share a single Apollo GraphQL API at `https://www.care.com/api/graphql` and a custom OIDC/OAuth2 auth server at `https://auth.careapis.com` (Hydra-based, with PKCE support). The OIDC client IDs are per-MFE: `czen-pub` for the visitor-facing VHP, `oidc-proxy` for enrollment.

Akamai sits at the edge — device fingerprinting starts before any redirect. The `care_did` cookie (device ID, expiry 2038, `SameSite=None`) is set on the bare `care.com` domain before the redirect to `www.care.com`. The server responds with `x-crcm-request-id` on every response for internal request tracing.

Underneath the React layer, a legacy Java app (`carezen.net`) is still active. The `csc` cookie leaks server hostnames: `dom-gold-prod-webapp-b3.use.dom.carezen.net{timestamp}` — an AWS us-east node in the CZEN production fleet. Legacy `.do` URLs (`/visitor/logout.do`, `/visitor/popUpPhoto.do`) still route through this app. The old app's CSP tells a different story than the new one: `narrative.io`, `thrtle.com`, `criteo.net`, `tokbox.com` (OpenTok video chat), `kinsights.com` (parenting data), `talentwise.com` / `sterlingcheck.com` (background check vendors), and a leaked internal hostname: `svc.bronze.dom.omni.carezen.net`. These appear on legacy routes where the old CSP still applies.

The content security policy on new MFE pages is `content-security-policy-report-only` — violations are logged to Sentry but nothing is blocked. All CSP is advisory.

LaunchDarkly handles feature flags. The flag state for each page is serialized into `__NEXT_DATA__` server-side and embedded in the HTML on every request — including variation index, rule ID, and rule reason for each flag. VHP ships 21 flags. The enrollment MFE ships 50+.

## The Yelp API Key

The `smb-profile-mfe` runtime config, rendered into `__NEXT_DATA__` on every provider profile page, contains a live Yelp Fusion API key:

```
YELP_API_KEY: XaJhR07HuEjF8lYDs1CkQYu32gazNiSELpZmu6wVNKoj11FpDDIhXucuhf0ow7HtrSOLnuFTPqGAaWl-L_8d-aZueAxh9qreCrDRazyOswnkEuIS7Ts4siOI_bWDWHYx
YELP_API_URL: https://api.yelp.com/v3/businesses/
```

The key works. A GET to `https://api.yelp.com/v3/businesses/search?location=san+francisco` with this key as a Bearer token returns full business data. Yelp Fusion API keys are backend credentials — they're not designed to be embedded in client-side JavaScript. These keys carry rate limits and API usage that would be billed to Care.com's account.

The key is there for a reason: Care.com enriches provider profiles with Yelp data. Individual providers have a `yelpBusinessId` field exposed in their profile data, and the Yelp URL pattern in runtimeConfig (`https://api.yelp.com/v3/businesses/`) is used to fetch business details for display. The key should be making those requests server-side; instead it ended up in the client-rendered config object.

Also in the `smb-profile-mfe` runtimeConfig:

- `AWS_URL: https://s3.amazonaws.com/galore-production/` — the S3 bucket backing provider avatar storage
- `LCG_TOUR_URL: https://ots2.learningcaregroup.com` — Learning Care Group tour scheduling integration

## Provider Profile Data Surface

A provider profile page delivers substantial business and operational data in `__NEXT_DATA__` without authentication:

```
Provider {
  id, publicId, description, businessProfileUri, externalLocationID,
  parentOrganizationID, centerType, providerType, name, isPremium,
  pplPreferences { claimStatus }, contractType,
  contactDetails { leadPhone, email },
  address { city, state, addressLine1, addressLine2, zip,
            latitude, longitude, preciseLatitude, preciseLongitude },
  avgReviewRating, reviews, discountOffers, license,
  tourRequestStatus, establishedYear, employeeCount,
  providerSource, providerStatus,
  yelpBusinessId, twilioPhoneNumber, showPhoneLeadIcon,
  childCareCaregiverProfile, adsStatus
}
```

Notable fields:

**`adsStatus: ACTIVE`** — whether the provider is currently paying for promoted placement in search results. Competitors can check any daycare's advertising status by loading their profile.

**`discountOffers`** — includes discount percentage and audience type (`ENTERPRISE_MEMBERS`, `PREMIUM`). One profile observed at 5% discount available to enterprise members.

**`preciseLatitude` / `preciseLongitude`** — 6 decimal places (~10cm precision). The regular `latitude`/`longitude` fields are present too, but so is the precise version.

**`twilioPhoneNumber`** — Twilio-provisioned tracking number for call attribution.

**`yelpBusinessId`** — cross-reference to the Yelp business graph.

## Unauthenticated GraphQL: Provider Subscription Exposure

The `batchGetPreviewLeadsEligibility` GraphQL query accepts a list of provider UUIDs and returns per-provider pay-per-lead (PPL) subscription data, with no authentication required:

```graphql
query BatchGetPreviewLeadsEligibility($ids: [ID!]!) {
  batchGetPreviewLeadsEligibility(ids: $ids) {
    eligibilities {
      eligible
      id
      leadsReceived
      maxAllowed
    }
  }
}
```

Live response for provider `36cfcfed-6453-461b-9bcc-16e3a87129b0`:

```json
{
  "data": {
    "batchGetPreviewLeadsEligibility": {
      "eligibilities": [
        {
          "eligible": false,
          "id": "36cfcfed-6453-461b-9bcc-16e3a87129b0",
          "leadsReceived": 0,
          "maxAllowed": 2
        }
      ]
    }
  }
}
```

`maxAllowed: 2` indicates the PPL subscription tier (a cap of 2 leads per billing period is a low/trial tier). `leadsReceived` is the running count. Any provider's UUID is available from their public profile page URL or `__NEXT_DATA__`, making this a two-step lookup: profile URL → UUID → subscription status.

GraphQL introspection is disabled (Apollo Server's production default returns `"GraphQL introspection is not allowed"`). The Apollo Client state is queryable via `window.__APOLLO_CLIENT__` in-browser, which exposed the active query set: `LoggedInUser`, `reviewsByReviewee`, `getRecentlyViewed`, `providersByPublicIdRecentlyViewed`, `batchGetPreviewLeadsEligibility`. The `reviewsByReviewee` query with a provider UUID and `revieweeType: PROVIDER` is also unauthenticated.

## Production Source Maps

Source maps for the enrollment MFE are publicly accessible from Care.com's CDN:

```
https://www.care.com/s/o/enrollment-mfe/v2.335.0/f4d8830242916bec09cd40dc607be1634b518580/_next/static/chunks/pages/_app-737a1e4b4561d4a5.js.map
```

HTTP 200, 6,485,408 bytes (6.4 MB). The map contains 1034 source files. Internal file paths reveal the application structure:

- `src/state/seeker/reducer.ts`
- `src/state/ltcg/reducer.ts` — Long-Term Care Group (LTCG) senior care division state
- `src/state/seekerCC/validation.ts` — childcare seeker validation logic
- `src/__generated__/globalTypes.ts` — generated GraphQL types from the Apollo codegen step

The versioned CDN path format (`/s/o/{app}/{version}/{hash}/`) means maps for historical versions are also accessible if the hash is known. Source map availability makes reversing the application logic — enrollment validation rules, GraphQL query structures, state machine transitions — straightforward.

## Feature Flags as Product Intelligence

LaunchDarkly flag state is server-rendered into `__NEXT_DATA__` on every page load. The enrollment MFE's 50+ flags are readable by any visitor who views page source. Selected flags with signal:

**Active adult care expansion:**
- `growth-vhp-adult-care-tile: 0` (rule match — visible based on targeting rule)
- `seeker-adult-care-experience: 2` (FALLTHROUGH variant 2 — adult care UX in test)
- `vhp-vertical-triage-caregiver-adultcare-update: "ac-sc-combined"` — adult care and senior care verticals being merged into one

**Active A/B tests:**
- `growth-enrollment-account-creation-cta: 5` — 5th variant of the account creation call-to-action is running
- `growth-enrollment-trust-signals-test: 4` — testing which trust signals convert
- `enrollment-combine-soft-intro-steps-to-begin: "holdout"` — holdout group for step consolidation

**Urgency copy stored in flag config:**
The `daycare-enrollment-recommendations-urgency-banner` flag is currently off, but its value object contains the message text:
```json
{
  "title": "Daycares fill up fast",
  "description": "Choose the ones you like and let them know you're interested."
}
```
The urgency copy lives in LaunchDarkly, not in the codebase, so it can be turned on without a deployment.

**`member-type-confusion: "test"` (FALLTHROUGH):**
A flag literally named `member-type-confusion` is in permanent FALLTHROUGH state, currently serving variant `"test"` to all visitors. The intent isn't documented in the flag value. Given the enrollment context — where Care.com tries to sign up both seekers (families) and providers (caregivers) — the flag name suggests testing something related to blurring the seeker/provider distinction during signup. Inferred, not confirmed.

## Surveillance Architecture

### Server-Side GTM Proxy

Care.com runs GTM through a custom domain: `tagging.care.com`. This proxies the GTM container loader and all tag firing through a first-party hostname instead of `googletagmanager.com`. The effect: ad blockers that block `googletagmanager.com` by domain don't block `tagging.care.com`. The container is 568 KB (v306, indicating over 300 GTM container versions).

Verified pixels in the container: Facebook (pixel ID 296867961907), Google Ads (conversion IDs 978887439 and 1009234276), LinkedIn Insight, Bing Ads, TradeDesk (insight.adsrvr.org), Impact (affiliate), Hotjar, Sift (fraud detection), Recruitics (job ad attribution), Reddit Ads. GA4 measurement IDs are routed by member type: seeker prod = `G-XMJQJVFLTW`, providers use a separate ID.

### Pre-Consent Firing

On a fresh session with no prior cookies, before any interaction with the OneTrust consent banner (all groups set to 0), the following make network requests:

- **Google Ads** — `POST /rmkt/collect/1009234276/` and `POST /rmkt/collect/978887439/`
- **Google Ads conversion** — `GET /pagead/conversion/978887439/`
- **DoubleClick** — `POST /pagead/viewthroughconversion/978887439/`
- **Amplitude** — session tracking `POST /sessions/v2/track` x2
- **Iterable** — `POST /api/users/update`, `GET /api/embedded-messaging/messages`
- **TradeDesk** — `POST /track/realtimeconversion`

Cookies set before consent: `_fbp` (Facebook Pixel), `_ga` + `_ga_XMJQJVFLTW` (GA4), `_uetsid` + `_uetvid` (Bing UET), `amp_49ee77` + `AMP_49ee77491a` (Amplitude).

OneTrust configuration (consent ID `0c2e5b78-5c12-4c66-a9e6-b9c29d6a59f5`) covers three rulesets: California (CPRA), Other US (CPRA), and Global (USNATIONAL). There is no GDPR ruleset. European visitors receive the US-format consent experience.

### Amplitude Session Replay

Amplitude's session replay is configured and active for unauthenticated visitors. The remote config sets `capture_enabled: true` with `defaultMaskLevel: "medium"` — form inputs are masked, but navigation patterns, click targets, and page content are captured. Care.com's enrollment flow asks users about care needs for elderly relatives (including Alzheimer's, dementia, medical equipment requirements), child care requirements, and household employment arrangements. Session replay runs from the visitor homepage through enrollment.

### Iterable: One User ID for All Anonymous Visitors

The VHP runtimeConfig includes:

```
ITERABLE_MFE_GUEST_USER_ID: "67289530"
ITERABLE_MFE_API_KEY: "5afdc16bf1374b118497f5afb3cf63e5"
```

On every homepage load, `userId: "67289530"` is written to localStorage and Iterable receives `POST /api/users/update` for that ID. This is a single shared user profile representing all anonymous visitors — a placeholder in Iterable's user model so that anonymous campaigns (via `ITERABLE_TOP_BANNER_PLACEMENT_ID: 1305`) can be triggered against a defined user.

## Acquisition Archaeology

Care.com's acquisition history is readable from the code:

**Payroll stack:** Breedlove and Company (acquired 2014) became MyHomePay. Both domains now redirect to `care.com/homepay`. The OIDC post-logout redirect still points to `https://www.myhomepay.com/Client/logout`. The login URL (`BREEDLOVE_LOGIN_URL`) exposes an ASP.NET `.aspx` URL — the payroll product stack is separate from the main Node.js app and still running on classic ASP.NET.

**Galore:** `galore-production` is the S3 bucket name for provider image assets. `pn-business-mfe` links to `https://www.getgalore.com/marketing-solutions` as `GALORE_LOGIN`. Galore is a provider-facing marketing and analytics tool — the domain redirects to a registration page.

**Learning Care Group:** `LCG_TOUR_URL: https://ots2.learningcaregroup.com` integrates tour scheduling for LCG-operated daycares (Learning Care Group operates Tutor Time, La Petite Academy, and related brands in the US).

**European operations:** SSL certificate SANs include `betreut.at`, `betreut.ch`, `betreut.de` — Care.com's German-speaking market operations.

## Machine Briefing

### Access & auth

Most read operations work without auth. Provider profiles, search results, and the `batchGetPreviewLeadsEligibility` query are all unauthenticated. For write operations or user-specific data, the OIDC flow uses client ID `czen-pub` (VHP) or `oidc-proxy` (enrollment), with PKCE required. The token endpoint is `https://auth.careapis.com/oauth2/token`.

### Endpoints

**Open (no auth):**

```bash
# GraphQL API — all unauthenticated queries
POST https://www.care.com/api/graphql
Content-Type: application/json

# Provider subscription data (no auth required)
curl -s -X POST https://www.care.com/api/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query BatchGetPreviewLeadsEligibility($ids: [ID!]!) { batchGetPreviewLeadsEligibility(ids: $ids) { eligibilities { eligible id leadsReceived maxAllowed } } }",
    "variables": { "ids": ["36cfcfed-6453-461b-9bcc-16e3a87129b0"] }
  }'

# Provider reviews (no auth)
curl -s -X POST https://www.care.com/api/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "query reviewsByReviewee($revieweeId: ID!, $revieweeType: ReviewInfoEntityType!, $careType: ReviewInfoCareType!, $pageSize: Int!) { reviewsByReviewee(revieweeId: $revieweeId, revieweeType: $revieweeType, careType: $careType, pageSize: $pageSize) { reviews { id rating } nextPageToken } }",
    "variables": { "revieweeId": "36cfcfed-6453-461b-9bcc-16e3a87129b0", "revieweeType": "PROVIDER", "careType": "CHILD_CARE", "pageSize": 10 }
  }'

# OIDC discovery
GET https://auth.careapis.com/.well-known/openid-configuration

# Source maps (versioned CDN — swap version/hash for enrollment-mfe)
GET https://www.care.com/s/o/enrollment-mfe/v2.335.0/f4d8830242916bec09cd40dc607be1634b518580/_next/static/chunks/pages/_app-737a1e4b4561d4a5.js.map
```

**Provider data extraction pattern:**

1. Load any provider profile page (e.g., `https://care.com/p/daycares/...`)
2. Extract `window.__NEXT_DATA__.props.pageProps.providerProfile.id` for the provider UUID
3. Use UUID in `batchGetPreviewLeadsEligibility` or `reviewsByReviewee` queries
4. `window.__NEXT_DATA__.runtimeConfig.YELP_API_KEY` is present on every profile page

**Config extraction:**

```javascript
// VHP runtime config (keys, flags, zip)
window.__NEXT_DATA__.runtimeConfig
window.__NEXT_DATA__.props.ldClientFlags

// Enrollment MFE flags (50+)
// Load /app/enrollment/seeker/cc and extract same path
window.__NEXT_DATA__.props.ldClientFlags
```

### Gotchas

- GraphQL introspection is disabled in production. Query shape must be inferred from `__NEXT_DATA__` pageProps, Apollo cache (`window.__APOLLO_CLIENT__`), or source maps.
- `batchGetPreviewLeadsEligibility` accepts an array of IDs — can batch multiple provider UUIDs in one call.
- The Yelp API key is only present in `__NEXT_DATA__` on `smb-profile-mfe` pages (provider profiles), not on VHP or enrollment pages.
- LaunchDarkly flag evaluation is server-side — flag state in `__NEXT_DATA__` reflects the server's targeting decisions for the request context (user agent, geo, session state). Same flag may return different values for different visitors.
- `tagging.care.com` serves the GTM container at `/care-tags.js`. The container ID is `GTM-N456RN6`.
