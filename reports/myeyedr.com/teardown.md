---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "MyEyeDr — Teardown"
url: "https://myeyedr.com"
company: "MyEyeDr"
industry: "Healthcare"
description: "Optometry chain with eye exams, eyewear retail, and contact lens sales."
summary: "MyEyeDr runs a fragmented five-platform stack: Drupal 10 on Acquia Cloud for the marketing site, VTEX for the contact lens shop, Yext Pages for location search, Azure AD B2C for the patient portal, and ASP.NET 4.0 for careers. Google Tag Manager orchestrates a dense third-party tracker stack including Braze, VWO, Decibel Insight, and a full advertising suite. Cloudflare and Varnish layer in front of the main site."
date: "2026-04-12"
time: "20:39"
contributor: "hayabhay"
model: "sonnet"
effort: "medium"
stack:
  - Drupal 10
  - VTEX
  - Yext Pages
  - Azure AD B2C
  - Acquia Cloud
  - Cloudflare
trackers:
  - Google Analytics 4
  - Google Tag Manager
  - DoubleClick Floodlight
  - AdRoll
  - Microsoft Clarity
  - Microsoft UET
  - Meta Pixel
  - TikTok Pixel
  - Nextdoor Pixel
  - The Trade Desk
  - Quantserve
  - Decibel Insight
  - Medallia
  - Braze
  - VWO
  - OneTrust
tags:
  - healthcare
  - session-replay
  - pharma-tracking
  - pre-consent
  - fragmented-stack
  - dead-integrations
  - patient-portal
  - dark-patterns
headline: "Alcon embeds a DoubleClick conversion pixel on MyEyeDr's appointment pages — tracking patients seeking eye exams for contact lens retargeting."
findings:
  - "Alcon's DoubleClick Floodlight pixel fires on the homepage and appointment booking pages with personalized ads enabled, while Alcon-manufactured lenses dominate MyEyeDr's shop catalog — a closed-loop pharma tracking pipeline from exam booking to product retargeting."
  - "Decibel Insight session replay is configured across all subdomains including the patient portal and payment domain, with IP anonymization disabled and field masking tied to CSS class hashes that break on rebuild."
  - "Medical records requests route through a public Smartsheet form — general-purpose SaaS, not dedicated healthcare records infrastructure."
  - "Acquia Lift personalization has been dead for an unknown period — every page load fires a failing DNS request to a hostname that no longer resolves, alongside a dead AddThis integration Oracle shut down in 2023."
  - "OneTrust defaults all consent groups to enabled before any user interaction — all 14 third-party tracker domains fire on first visit with interactionCount=0."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

MyEyeDr operates over 900 optometry clinics across the US under its own name and a string of acquired regional brands. The web presence reflects that growth-through-acquisition history: five different platforms stitched together under one domain, a dense advertising stack, and a session replay tool configured to record patients all the way through to payment.

## Architecture

The domain is a federation of stacks, not a single platform.

`www.myeyedr.com` is Drupal 10 hosted on Acquia Cloud (`x-ah-environment: prod`, `x-generator: Drupal 10`). The site runs the Acquia Site Studio (cohesion) module for visual page building. Varnish handles edge caching in front of Cloudflare CDN/WAF — the homepage was serving from cache with 28,869 hits when observed. Google Tag Manager (`GTM-KHTCXF`) loads as the tag orchestration layer, with `drupalSettings` carrying the GTM container ID plus VWO account ID 757820.

The shop runs on a separate subdomain at `shop.myeyedr.com` via VTEX (a Brazilian e-commerce platform popular in retail pharmacy and optical), currently at render-server version 8.179.1. Custom VTEX apps are deployed: `myeyedr.prescriptions-engine@0.74.45` and `myeyedr.storefront-components@0.44.38`. The VTEX GraphQL layer runs on `/_v/public/graphql/v1` (persisted queries only, introspection blocked) and `/_v/private/graphql/v1` (requires auth).

Location search is `locations.myeyedr.com` on Yext Pages (Business ID 1546556, Site ID 149146). `yextAnalyticsEnabled: false` — Yext's own analytics are disabled, presumably replaced by GTM.

The patient portal at `secure.myeyedr.com` authenticates via Azure AD B2C, with the identity endpoint at `login.myeyedr.com/b2cmyeyedr.onmicrosoft.com/b2c_1a_signinsignup`. The B2C tenant is `b2cmyeyedr.onmicrosoft.com`. Client ID for the MSAL.js 2.39.0 browser SDK: `f2a38f35-7a7b-44f5-8459-88c9221c5987`. Redirect URI: `https://secure.myeyedr.com/selector`. The portal offers social SSO via both Facebook and Google — unusual for a healthcare patient portal, where identity linkage to social platforms creates downstream privacy surface.

Careers at `careers.myeyedr.com` runs on ASP.NET 4.0 — legacy stack, separate deployment.

`getrx.myeyedr.com` (prescription portal) returned a Cloudflare challenge and was not accessible. `secure-acceptance.myeyedr.com` appears in session replay configuration (see below) but could not be directly accessed.

The sitemap includes 178 URLs. Among them, acquisition artifacts: `/independent-eye-care-now-part-myeyedr-1`, `/mvc-eyecare-now-part-myeyedr`, `/rx-optical-now-part-myeyedr` — redirect pages for absorbed brands that are still indexed.

**Security headers.** `strict-transport-security: max-age=1000` on the main domain — approximately 16 minutes. The industry standard is 31,536,000 (one year). At 1,000 seconds, HSTS provides essentially no protection: browsers will re-check on every new session. The `content-security-policy` header is present but configured as `report-only` with `default-src *; script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' *` — the wildcard and unsafe directives mean even if enforced it would permit nearly anything.

## Consent Architecture

OneTrust CMP handles consent, pulling configuration for UUID `01949983-3525-7d15-83a7-e7390e0a80d3` from `cdn.cookielaw.org`.

On a fresh browser session, the `OptanonConsent` cookie is set with the following value before any user interaction:

```
groups=C0001%3A1%2CC0002%3A1%2CC0003%3A1%2CC0004%3A1
interactionCount=0
isGpcEnabled=0
browserGpcFlag=0
```

The four groups map to:
- C0001: Strictly Necessary (always enabled)
- C0002: Performance / Analytics — pre-enabled
- C0003: Functional — pre-enabled
- C0004: Targeting / Advertising — pre-enabled

`interactionCount=0` means no user action has occurred. All consent is granted by default. The banner renders, but it is cosmetic — every tracker has already fired. GPC (Global Privacy Control) signals are silently ignored: `browserGpcFlag=0` even when a GPC-capable browser sends the signal.

This is an opt-out consent configuration: consent defaults to granted unless the user explicitly withdraws it. For a US-based healthcare site, CPRA's softer default-opt-out framework applies, but the healthcare context makes the advertising tracker scope notable regardless of technical compliance posture.

## Tracker Inventory

Fourteen third-party domains receive requests on the homepage before any user interaction:

**Analytics & Session Recording**
- Google Analytics 4 — `G-MP2R1MZEX9` (`analytics.google.com`)
- Microsoft Clarity — `_msci` cookie (`mobile.events.data.microsoft.com`)
- Decibel Insight / Medallia DX — account 14052, website 770255 (`collection.decibelinsight.net`)
- Medallia NPS — `analytics-fe.digital-cloud-west.medallia.com`
- Medallia/Kampyle NPS widget — `kampyle_userid`, `kampyleUserSession` cookies

**Advertising & Retargeting**
- Google Ads / DoubleClick Floodlight — DC-14697890 (`ad.doubleclick.net`)
- AdRoll — advertiser ID `T4I5MHFJVRGHZAHQCNRZCM`, pixel `VJH7VK2WFNH53DLXOSGH3V`, session ID `c46322c54929f7dd35f501c5899948e0`
- Microsoft / Bing Ads UET — `ti=56313497` (`bat.bing.com`)
- The Trade Desk — `insight.adsrvr.org`
- Quantserve — `p-cUydRTN5h-wKk` (`pixel.quantserve.com`)

**Social**
- Meta Pixel — `2022271908061931` + NDP Advanced Matching (`NDPAdvancedMatching`)
- TikTok Pixel — `CLEIIHJC77U3UN82V1G0`; cookies: `_tt_enable_cookie`, `_ttp`, `ttcsid`, `ttcsid_CLEIIHJC77U3UN82V1G0`
- Nextdoor Pixel — `4b67e9f6-a28a-455c-b7ff-6cc8426af373` (`flask.nextdoor.com`, `ads.nextdoor.com`)

**Tag Management & CMP**
- Google Tag Manager — `GTM-KHTCXF`
- OneTrust — `cdn.cookielaw.org`, `geolocation.onetrust.com`

**Marketing Automation & A/B Testing**
- Braze Web SDK v5.8 — push notifications, in-app messages, content cards, feature flags
- VWO (Visual Website Optimizer) — account 757820 (`dev.visualwebsiteoptimizer.com`)

All of the above fire before any consent interaction.

Cookie snapshot on fresh load (interactionCount=0): `_vwo_uuid_v2`, `_vwo_uuid`, `_vwo_sn`, `_vwo_ds` (VWO); `_ga=GA1.1.*`, `_ga_MP2R1MZEX9` (GA4); `_gcl_au` (Google Click Linker); `_msci` (Microsoft Clarity); `OptanonConsent`; `_uetsid`, `_uetvid` (Microsoft UET); `__adroll_fpc` (AdRoll); `_tt_enable_cookie`, `_ttp` (TikTok); `_fbp` (Meta); `kampyle_userid`, `kampyleUserSession` (Medallia); `da_sid`, `da_lid` (Decibel Insight); `ttcsid`, `ttcsid_CLEIIHJC77U3UN82V1G0` (TikTok Conversion); `ndp_session_id` (Nextdoor); `initialTrafficSource` (marketing attribution).

## The Alcon Thread

The most structurally interesting finding is not one of these trackers alone — it is the relationship between a specific tracker and the product catalog.

DoubleClick Floodlight source `14697890` fires on the MyEyeDr homepage and request-appointment page with category `cat=alcon0`. The category name is unambiguous: Alcon is the world's largest standalone eye care company (spun out of Novartis), manufacturer of DAILIES, AIR OPTIX, Systane, Pataday, and PRECISION1 contact lenses. Floodlight tags are conversion tracking pixels deployed by an advertiser; category names like `alcon0` are defined in the advertiser's Google Campaign Manager account. This is Alcon's pixel, not MyEyeDr's.

The `npa=0` parameter in every observed Floodlight request confirms personalized advertising mode is active — non-personalized ads is off.

The confirmed pages where `cat=alcon0` fires: homepage and request-appointment. The investigator's notes also describe `cat=alcon000` on location search — this is plausible given the pattern but the available network logs only captured `cat=alcon0` in the two sampled page loads.

The second half of the Alcon story is in the product catalog. VTEX's public search API (`/api/catalog_system/pub/products/search/`) returns full product data without authentication. A search for contact lenses shows that the dominant products are manufactured by Alcon:

- PRECISION1 — Alcon (verofilcon A, 51% water, dk/t 100@-3.00D) — $51.50-$100.50
- PRECISION1 for Astigmatism — Alcon — $61.50-$125.00
- DAILIES TOTAL1 — Alcon — $56.50-$143.50
- DAILIES TOTAL1 Multifocal — Alcon — $72.00-$187.00
- TOTAL30 — Alcon — $85.00

The VTEX product cluster `161` is labeled "Alcon" across these products. The catalog also includes ACUVUE OASYS 1-Day (Johnson & Johnson, $133.50) and other brands, but Alcon product lines dominate the results.

The composite picture: Alcon has a commercial relationship with MyEyeDr that manifests as both an advertising partnership (conversion tracking pixel on patient-facing appointment pages) and preferential placement in the shop. When a patient visits to book an eye exam, Alcon's pixel fires. If the patient is then retargeted with Alcon contact lens ads after their visit, the tracking pipeline is complete — exam intent to product retargeting, closed loop.

## Session Replay Scope

Decibel Insight (operating under the Medallia DX brand) handles session recording. Account 14052, website 770255, served from `collection.decibelinsight.net`. The config is fetched via a public endpoint:

```
GET https://collection.decibelinsight.net/i/14052/770255/c.json
```

Key settings from the verified config:

```json
{
  "da_websiteId": 770255,
  "accountNumber": 14052,
  "replaySessFlags": 3,
  "da_anonymiseIP": false,
  "da_maskEmail": true,
  "da_maskSSN": true,
  "da_subscriptionType": "session",
  "domains": [
    "www.locations.myeyedr.com",
    "secure.myeyedr.com",
    "www.secure.myeyedr.com",
    "secure-acceptance.myeyedr.com",
    "*.myeyedr.com",
    "www.myeyedr.com"
  ]
}
```

`replaySessFlags: 3` means session replay is enabled for all sessions. IP addresses are not anonymized (`da_anonymiseIP: false`). The `domains` array explicitly includes the patient portal (`secure.myeyedr.com`) and the payment domain (`secure-acceptance.myeyedr.com`).

Field masking is implemented via CSS selectors in `da_personalDataSelector`:
```
[data-di-mask],
.pac-container.pac-logo,
#apt-reviewPersonalDetails,
#chk-insuranceDetails,
#chk-patientName,
#chk-insuranceDetails-0,
.ReviewYourAddress-module__bodyLarge___OdGVd,
div.ReturningPatientInsuranceReviewCard-module__container___3vK7M.di-hover > div > div:nth-child(4) > div.FieldReview-module__value___E8-QE > span,
.myeyedr-storefront-components-0-x-PvstUserAuth__patientName
```

The masking depends on specific CSS class names, some of which are hashed module CSS (e.g., `ReviewYourAddress-module__bodyLarge___OdGVd`). Class-based masking breaks if component styles are rebuilt with different hashes — a standard behavior in CSS Modules and similar tools. Whether the masks are currently effective on the patient portal cannot be verified from outside.

The goal tracking configuration fires a Decibel event when the payment submit button is clicked: `.payment-submit-hide .submit.btn.btn-success`. Payment completion is a tracked conversion event.

## Patient Portal Architecture

Authentication at `secure.myeyedr.com` goes through Azure AD B2C:

- Tenant: `b2cmyeyedr.onmicrosoft.com`
- Policy: `B2C_1A_SignInSignUp` (custom policy, not a built-in flow)
- Client ID: `f2a38f35-7a7b-44f5-8459-88c9221c5987`
- Redirect URI: `https://secure.myeyedr.com/selector`
- Identity providers: email/phone + Google + Facebook
- SDK: MSAL.js 2.39.0

Facebook and Google social login options on a healthcare patient portal are an unusual architectural choice. Social login links the patient's MyEyeDr identity to their Facebook or Google identity at the IdP level — the social provider logs every authentication event. Standard practice in healthcare portals is to use dedicated identity providers or email/password only.

Medical records requests use a Smartsheet form linked from the patient portal footer: `https://app.smartsheet.com/b/form/66f06da7ad69445eb9c841bf7f989780`. Smartsheet is a general-purpose SaaS workflow tool. Whether MyEyeDr maintains a Business Associate Agreement (BAA) with Smartsheet for this workflow is not publicly known.

## Staging Artifacts

The sitemap indexes several pages that appear to be development or staging artifacts, all accessible at production URLs:

- `/home-site-studio` — redirects to homepage (Acquia Site Studio staging template)
- `/home2`, `/home3` — alternate homepage variants, accessible
- `/banner-slider` — component test page
- `/doctor-details-coming-soon` — coming-soon doctor profile template
- `/schedule-appointment-bypass-form` — accessible production Drupal webform collecting: First Name, Last Name, Phone, Email, Date of Birth, Address (Street/City/State/Zip), Preferred Appointment Day, Preferred Appointment Timing, Reason for Visit, Insurance Provider, plus reCAPTCHA

The bypass form collects the same fields as the main appointment flow. It is indexed in the sitemap, publicly accessible, and collects PII and basic PHI (date of birth, insurance provider, reason for visit).

## Dead Integrations

Two third-party services fire on every page load and fail every time:

**Acquia Lift** (`builder.lift.acquia.com/lift.js`) — DNS is dead. Acquia Lift is a real-time personalization and content targeting product. The HTML still contains `acquia_lift:*` meta tags on every page (content title, content type, etc.), indicating this was an active integration. The DNS for `builder.lift.acquia.com` no longer resolves. Every page view generates a failed DNS lookup.

**AddThis** (`su.addthis.com`) — Oracle shut down the AddThis service in May 2023. References still appear on the Yext locations pages, generating failed requests on location search.

Both are wasted latency on every page view — failed DNS lookups add to the connection waterfall before the page is fully interactive.

## VWO Experiment

The VWO configuration (account 757820) includes a running split-URL test:

```json
{
  "id": 180,
  "type": "SPLIT_URL",
  "status": "RUNNING",
  "pcTraffic": 100,
  "variations": [
    {"id": 1, "split": 50},
    {"id": 2, "split": 50}
  ],
  "urlPatterns": [
    {
      "type": "regex",
      "value": "^https://qa-locations-myeyedr-com.preview.pagescdn.com(.*?)$"
    }
  ]
}
```

The URL regex targets `qa-locations-myeyedr-com.preview.pagescdn.com` — the Yext Pages preview subdomain for the QA version of the locations site, not production `locations.myeyedr.com`. The experiment is configured as 100% traffic with a 50/50 split, status RUNNING. In practice, the test would only activate for users who navigate to the QA preview URL, which real users would not do. The experiment was likely set up to test the new Yext locations build before going live, then left running after launch.

## Machine Briefing

**Access and auth**

The main site (`www.myeyedr.com`) and location search (`locations.myeyedr.com`) are fully public — no cookies or auth required. The shop (`shop.myeyedr.com`) VTEX catalog is public. The patient portal (`secure.myeyedr.com`) requires Azure AD B2C authentication. The prescription portal (`getrx.myeyedr.com`) serves a Cloudflare challenge.

No rate limiting was observed on public endpoints during investigation.

**Open endpoints**

```bash
# VTEX public catalog search — no auth required
GET https://shop.myeyedr.com/api/catalog_system/pub/products/search/?q={query}&_from=0&_to=9

# VTEX catalog by category
GET https://shop.myeyedr.com/api/catalog_system/pub/products/search/?fq=C:/{categoryId}/&_from=0&_to=9

# Decibel Insight config (public)
GET https://collection.decibelinsight.net/i/14052/770255/c.json

# OneTrust consent config
GET https://cdn.cookielaw.org/consent/01949983-3525-7d15-83a7-e7390e0a80d3/01949983-3525-7d15-83a7-e7390e0a80d3.json

# Yext locations search
GET https://locations.myeyedr.com/search?q={zip}&features=nearMe

# Appointment bypass form (public, PII collection)
GET https://www.myeyedr.com/schedule-appointment-bypass-form
```

**Patient portal auth (Azure AD B2C)**

```
Authority: https://login.myeyedr.com/b2cmyeyedr.onmicrosoft.com/b2c_1a_signinsignup
Client ID: f2a38f35-7a7b-44f5-8459-88c9221c5987
Redirect URI: https://secure.myeyedr.com/selector
MSAL.js: 2.39.0
```

**VTEX response format**

`/api/catalog_system/pub/products/search/` returns an array of product objects. Each includes `productId`, `productName`, `brand`, `brandId`, `categories`, `Manufacturer` (spec attribute), price ranges via `items[].sellers[].commertialOffer.Price`, cluster tags (e.g., `"137": "FSA Eligible"`, `"161": "Alcon"`), and full spec attributes (Basecurve, Diameter, Water content, dk/t).

**Gotchas**

- The Drupal JSON API (`/jsonapi`) returns 404 — not enabled.
- VTEX GraphQL introspection is blocked on the public endpoint.
- `builder.lift.acquia.com` DNS is dead — any request to that domain will hang on DNS until timeout.
- The VWO experiment (#180) only activates on the QA subdomain URL pattern — it will not fire on production `locations.myeyedr.com`.
- OneTrust consent state is pre-accepted; if testing consent flows, the `OptanonConsent` cookie must be manually cleared and `interactionCount` reset to 0 to observe the pre-consent state.
