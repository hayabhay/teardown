---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Noom — Teardown"
url: "https://noom.com"
company: "Noom"
industry: "Healthcare"
description: "Psychology-based weight loss app with GLP-1 prescription medication plans."
summary: "Noom runs two separate applications under one domain: a WordPress marketing site on Altis Cloud (Automattic's enterprise platform) behind Cloudflare and CloudFront, and a React SPA buyflow served from buyflow-web-assets.noom.com via API Gateway. The marketing site uses GTM with GA4, Mixpanel, Facebook Pixel, and VWO. The buyflow serializes its full production configuration — service URLs, feature flags, payment credentials, and state eligibility maps — into a single window.__GROW_CONFIG__ object in the survey page HTML."
date: "2026-04-13"
time: "02:47"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [WordPress, Altis Cloud, React, Cloudflare, CloudFront]
trackers: [Google Analytics, Google Tag Manager, Facebook Pixel, Mixpanel, VWO, OneTrust, Singular, Google Ads, Optimizely]
tags: [healthcare, glp1, weight-loss, subscription, dark-patterns, personalized-pricing, wordpress, a/b-testing, cancellation, medical]
headline: "Three active A/B tests tune the lifetime value Noom reports to Meta's ad pixel per GLP-1 product — optimizing how much each user is worth to the algorithm."
findings:
  - "The GLP-1 medical cancellation flow branches through up to 32 nodes — side effect surveys, clinician intercepts, competitor medication queries, and discount offers — before reaching confirmation. California users get a single-step alternative."
  - "An A/B test (Telex280) makes the OneTrust consent accept button pill-shaped with border-radius 100px while leaving reject unchanged — testing whether visual styling increases consent acceptance rates."
  - "The Singular mobile attribution SDK secret sits in public HTML alongside a long-lived bearer token, all internal service URLs, and state eligibility maps in a single window.__GROW_CONFIG__ object on the survey page."
  - "31 WordPress accounts enumerate via the unauthenticated REST API — including the CEO and two employees whose full email addresses are exposed as their display names."
  - "A face scan feature at go.noom.com/biologicalage claims to compute biological age from heart rate and blood flow captured by a phone camera — available before any payment."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Noom started as a psychology-based weight loss app — daily lessons, food logging, coaching. In the last two years it has pivoted hard into GLP-1 prescriptions, compounded medications, hormone replacement therapy, and a "longevity microdose" tier. The marketing site still leads with behavioral coaching, but the buyflow tells a different story: eight distinct medication product lines, state-by-state eligibility maps, an active pharmacy supply chain transition, and an ML system that predicts each user's lifetime value and reports it directly to Meta's advertising pixel.

---

## Architecture

Noom runs two completely separate applications under one domain. The marketing site — blog posts, landing pages, B2B resources — is WordPress on Altis Cloud, Automattic's enterprise WordPress platform. The survey and purchase flow is a React SPA served from `buyflow-web-assets.noom.com`, loaded by an API Gateway backend. Traffic routes through Cloudflare at the edge and CloudFront at the origin; the WordPress stack adds nginx, while the SPA stack runs through API Gateway. The custom response header `x-noom-proxy: yup` appears on all responses.

The split is visible in the HTTP headers. Marketing pages carry standard CloudFront cache headers and WordPress-era response shapes. The `/survey/` path returns `x-robots-tag: noindex, nofollow`, `apigw-requestid` in headers, and loads from a completely different asset origin.

WordPress uses the Divi page builder (child theme: `Divi-child`) and WPML for internationalization. The international site runs from `web.noom.com` with dedicated sitemaps for German and Spanish. The sitemap structure surfaces several content types: `b2b_resource-sitemap1.xml` and `sme-sitemap1.xml` point to active enterprise and small-business B2B tracks.

Internal hostnames appear in the `Content-Security-Policy` header on every marketing page:

```
frame-ancestors 'self' https://*.noom.com https://noom-prod.altis.cloud https://*.noom.dev https://noom-stag.altis.cloud
```

`noom-prod.altis.cloud` is the production WordPress admin origin; `noom-stag.altis.cloud` is staging. Both respond to direct requests. The production origin serves its own WordPress REST API at `https://noom-prod.altis.cloud/wp-json/` with internal URLs in the responses. The staging host redirects to `noomtest.com`, a separate test domain.

GTM's cross-domain linker config names several related domains not prominently linked from the main site: `noomglp.com`, `shopnoom.com`, `divinoomdev.wpenginepowered.com`, and `tuv5t203lf.execute-api.us-east-1.amazonaws.com` (an unmasked API Gateway URL in the linker config).

---

## The GROW_CONFIG Object

When a visitor hits `/survey/` — the starting point of the signup and purchase flow — the response HTML contains a `window.__GROW_CONFIG__` assignment that serializes Noom's full production configuration into the page source. This is a single object covering credentials, service URLs, feature flags, and state eligibility maps.

Key credentials in the object:

```
STRIPE_API_KEY: "pk_live_Z7gd9AIDkU2tNTM82WoF29TK00iDPoSHV8"
BRAINTREE_TOKENIZATION_KEY: "production_mfmxpcfk_ws76n8dzyf83g2mg"
MIXPANEL_PROJECT_TOKEN: "45c93e9160d1559cc951522c80f523f9"
GOOGLE_MAPS_API_KEY: "AIzaSyCgw-905Ztg8L76Tq3-FZxcsgWEaIg56p4"
SINGULAR_SDK_KEY: "noom_b2005885"
SINGULAR_SDK_SECRET: "2807c7f964deaf66176aaf4a9c5c745c"
LOGGED_OUT_BUYFLOW_CLIENT_TOKEN: "hfxffviTygMUfWSs8lLZLudwkgid0TBgxU7v7LOjEw8iQh53ybVSmvm9GSMWaXAJOMBQ4gxPX0xBEdLV6SXfLTNLG-QnSwzXMn2ocwVylEW5PWAAyt8lr6XbdmV2sx1h"
WORDPRESS_DOMAIN: "https://noom-prod.altis.cloud"
COACH_SERVER_URL: "https://data.noom.com/servlets"
```

The Stripe and Braintree values are publishable/tokenization keys — their design intent is client-side use in payment forms, so their presence here is standard architecture. The Singular SDK secret is different. Singular is a mobile attribution platform that uses the secret server-side to sign API calls and validate attribution data. With the secret exposed, anyone can craft valid attribution events to Noom's Singular account — inflating install counts or forging conversion signals. The `LOGGED_OUT_BUYFLOW_CLIENT_TOKEN` is a long-lived bearer token for unauthenticated survey access; any caller can present it to the buyflow API to get an assigned user ID and start making API calls as an anonymous user.

Service endpoints enumerated by the config:

```
API_DOMAIN: https://buyflow-api.noom.com
COACH_SERVER_URL: https://data.noom.com/servlets
WORDPRESS_DOMAIN: https://noom-prod.altis.cloud
```

Additional internal services appear in the buyflow bundle rather than GROW_CONFIG:

```
graph.noom.com/graphql       — GraphQL API (introspection disabled, auth required)
healthcare-api.noom.com      — clinical/prescriptions API
billing-core.noom.com        — billing API
billing-customerinfo.noom.com
offers-api.noom.com          — promotions/retention offers
marketing-api.noom.com
auth.noom.com
```

Test environment subdomains for all of these appear in the same bundle: `auth-test.noom.com`, `billing-core-test.noom.com`, `data-test.noom.com`, `graph-test.noom.com`, `healthcare-api-test.noom.com`, `link-test.noom.com`.

The survey page also populates `window.meristemContext` — a routing object that includes continent, country, city, and postal code derived from geolocation, along with a `userIp` field containing the visitor's IP address and a `userId` UUID assigned on first visit.

---

## Medical Product Suite

The GROW_CONFIG feature flags and the buyflow bundle together map Noom's current product portfolio. The GLP-1 and medication suite is more extensive than the marketing site suggests:

- `compounded` — compounded semaglutide (standard)
- `compoundedMicrodose` — lower-dose compounded semaglutide
- `longevityMicrodose` — longevity-positioned microdose tier (newly enabled: `LONGEVITY_MICRODOSE_ENABLED: true`)
- `compoundedTirzepatide` — compounded tirzepatide (Mounjaro equivalent)
- `branded` — brand-name GLP-1s (Wegovy, Ozempic, Zepbound)
- `genericLiraglutide` — generic liraglutide (enabled: `LIRAGLUTIDE_MED_PLANS_ENABLED: true`)
- `oralsMetformin` — oral weight loss medication
- `hrtCream`, `hrtPatch` — hormone replacement therapy, operating as a standalone product track (`STANDALONE_HRT_BUYFLOW_ENABLED: true`)
- Probiotics delivery (`PROBIOTICS_DELIVERY_ENABLED: true`)
- Medicare integration (`HEALTH_INSURANCE_MEDICARE_OPTION_ENABLED: true`)

Two features remain disabled: `FUTURE_ME_ENABLED: false` and `GCM_ENABLED: false`. An insurance checker exists as a WordPress page (`/insurance-checker-wpc-330/`) but remains disabled via `INSURANCE_CHECKER_ROUTE_ENABLED: false`.

Apple in-app purchases are intentionally blocked: `APPLE_PURCHASE_LINKOUT_DISABLED: true`. Medical subscriptions do not route through the App Store.

An active regulatory transition shows in the flags: `MED_COMPOUNDED_503B_TO_503A_PHARMACY_TRANSITION: true`. Noom is moving its compounded medication supply from 503B outsourcing facilities (large-volume compounders) to 503A traditional compounding pharmacies. This shift follows FDA guidance on GLP-1 drug shortage exemptions and signals that Noom's compounded medication operations are adjusting to a tightening regulatory environment.

State eligibility is managed as lists of FIPS/APO codes in the config:

```
COMPOUNDED_PLAN_INELIGIBLE_US_STATES: AA,AE,AL,AP,LA,MS
COMPOUNDED_MICRODOSE_PLAN_INELIGIBLE_US_STATES: AA,AE,AL,AP,AR,LA,MS
LONGEVITY_MICRODOSE_PLAN_INELIGIBLE_US_STATES: AA,AE,AL,AP,AR,KY,LA,MN,MO,MS,NC,OR,WV
TIRZEPATIDE_PLAN_INELIGIBLE_US_STATES: AA,AE,AP,AL,LA,MS
BRANDED_PLAN_INELIGIBLE_US_STATES: AA,AE,AL,AP,VA
LIRAGLUTIDE_PLAN_INELIGIBLE_US_STATES: AA,AE,AL,AP,LA,MS
HRT_INELIGIBLE_US_STATES: AA,AE,AL,AP
GLP1_INCREASED_BMI_US_STATES: FL,NJ
```

`AA`, `AE`, `AP` are APO/FPO military postal codes, not US states. Among actual states, Louisiana and Mississippi are blocked for all compounded GLP-1 products. Florida and New Jersey apply higher BMI thresholds for GLP-1 eligibility, reflecting state medical board rules. The `OPT_OUT_STATES` list (21 states) governs the consent model for data use, not medical eligibility — it maps to state privacy law applicability.

When a user completes the medication eligibility flow, the buyflow code rewrites their browser URL using `window.history.pushState`:

```javascript
i.set("utm_source", "MedDrip")
i.set("fcc", "US")
// compoundedMicrodose:
i.set("fsub", "OH")
// other plans:
i.set("fsub", "AR")
// Health route:
i.set("fsub", "NY")
window.history.pushState({}, "", `${window.location.origin}?${i}`)
```

`MedDrip` is Noom's internal label for medication-initiated traffic. The state codes (Ohio, Arkansas, New York) are injected into the URL as `fsub` parameters regardless of the user's actual location — these appear to serve pharmacy routing or attribution purposes. The URL rewrite happens silently; nothing in the UI communicates that the browser URL now contains an internal routing token and a fabricated state code.

---

## Surveillance Stack

The marketing site runs GTM (`GTM-WFZPPK`) with GA4 (`G-QEH2HHETNY`), Google Ads conversion tracking (conversion ID `AW-783925782`, with at least six distinct conversion labels), Facebook/Meta Pixel (via GTM), Mixpanel, VWO, OneTrust CMP, and an ML attribution pixel (`s.ml-attr.com/getuid`, gated on `analytics_storage` consent).

The survey SPA adds Singular (mobile attribution) and Optimizely.

**Pre-consent GA4 firing:** On a fresh page load with no prior cookies, `www.google-analytics.com/g/collect` POSTs before any consent banner interaction. GTM is configured with Google Consent Mode v2 defaults set to `"Off by default"` for `analytics_storage`, `ad_storage`, `ad_user_data`, and `ad_personalization`. Under Consent Mode v2, "denied" consent does not stop GA4 from firing — it sends cookieless modeling pings instead of full user-identified events. The OneTrust custom integration gates VWO and Mixpanel people properties on consent but does not gate GA4, which fires directly from GTM without a consent trigger.

**21-state opt-out list:** Users with IP addresses in CA, CO, CT, DE, IA, IN, KY, MD, MT, MN, NE, NH, NJ, NV, OR, RI, TN, TX, UT, VA, WA receive an opt-out consent flow. Facebook's Meta Pixel applies Limited Data Use (`data_processing_options: ["LDU"]`) for users in these states — the flag appears three times in the buyflow bundle, indicating it's applied across multiple event triggers.

**ELTV to Meta Pixel:** The buyflow emits a `purchaseIntent` Mixpanel event and a Meta Pixel conversion event at checkout. Both include an `estimatedValue` field populated from Noom's ELTV (estimated lifetime value) system. The system maintains hardcoded ELTV values per product type and an ML-predicted variant:

- `hardcodedEltv` — static per-product value
- `mlEltvValue` — ML model output per user based on survey response data (gender, height, weight, age, health conditions)

An `EltvShadowComparison` event compares the two values per purchase. The winning estimate — either hardcoded or ML-predicted — is what gets passed to Meta as `estimatedValue`. Three Telex A/B tests are currently running to calibrate these hardcoded values by product line (see A/B Tests section). This means Meta's ad auction receives Noom's prediction of each individual user's lifetime value, enabling bid optimization at the individual level rather than at campaign averages.

---

## A/B Test Infrastructure (Telex)

Noom's internal A/B testing framework is named Telex. Twenty-two named experiment variants appear in the buyflow bundle:

```
Telex225, Telex242, Telex264, Telex265, Telex274, Telex276,
Telex280, Telex283, Telex288, Telex289, Telex293,
Telex294a, Telex294b,
Telex298a, Telex298b, Telex298c, Telex299, Telex300a, Telex300b, Telex300c, Telex301
```

**Telex280 — Consent button styling:**

```javascript
if (isTelex280Active()) {
  inject("@media ...", "#onetrust-accept-btn-handler { border-radius: 100px !important; }", ...)
}
```

This applies a pill shape to the OneTrust "Accept All" button while leaving the "Manage" or "Reject" options in their default rectangular styling. The test measures whether a more visually distinct accept button increases the consent acceptance rate.

**Telex283, Telex293, Telex294a/b — ELTV calibration:**

These tests change the hardcoded ELTV value per product line used in the purchaseIntent event sent to Meta:

- Telex283: Compounded tirzepatide ELTV (control vs. variant value)
- Telex293: Compounded semaglutide ELTV (control vs. variant value)
- Telex294a/b: Compounded microdose ELTV (three-way variant)

A/B testing the ELTV value reported to Meta means Noom is actively tuning how much it tells Meta each user is worth — and observing which estimate produces better advertising outcomes.

**Telex298a/b/c, Telex299, Telex300a/b/c — GLP-1 preference survey:**

Seven variants testing the `/survey/glpMedPreference` page, likely experimenting with how medication options are presented and which plans get promoted during the survey flow.

---

## Cancellation Architecture

The buyflow bundle defines multiple cancellation survey flows as state machines. The two most complex:

**`trialCounterOfferSurvey`** — For standard premium trial subscribers. Path: `cancelMed` to `timeLeft` to (CA only: `confirmCancellationCA`) to `cancellationReason` to `premiumCancellationReason` to `likelyToTryAgainInFuture` to `medUpgrade` to `percentDiscount` to `premiumDowngrade` to `trialExtension` to `pause` to `percentDiscountPost` to `premiumDowngradeDiscount` to `planDiscount` to `pausePost` to `confirmation` to `error`. Up to 17 nodes.

**`medTrialCounterOfferSurvey`** — For GLP-1 medical trial subscribers. The flow handles multiple objection categories:

- *Side effects*: `whatSideEffects` to `sideEffectDuration` to `sideEffectDoctor`
- *Clinician intercept*: `talkWithClinician` to `clinicianMessageSent`
- *Price objection*: `issuesWithPrice` to `medDiscount` / `medDowngrade`
- *Insurance objection*: `issuesWithInsurance`
- *Competitor medication*: `whereDidYouFindMedication` to `whereDidYouFindHigherDose`
- *Progress objection*: `progressDifferent` to `progressInfo` to `coachMessageSent`
- *Pause offer*: Before confirmation

The maximum path through this flow branches across approximately 32 nodes.

The code references `isEligibleForClickToCancel` as a condition that routes users to `confirmCancellationCA` — a single-step confirmation screen. This branch is triggered for California users, consistent with the FTC's Click-to-Cancel rule that took effect in 2025. Non-California users are not assigned this path and go through the full multi-step counter-offer gauntlet.

The `subscriptionCounterOfferSurvey` (for active subscribers, not trial users) includes an explicit pause offer at `/subscription/cancel-subscription/pause` before confirming cancellation.

---

## Biological Age Face Scan

Noom operates a face scan feature at `go.noom.com/biologicalage`. The feature is described in UI strings embedded in the buyflow bundle:

> "Noom's Face Scan analyzes subtle signals — like heart rate, blood flow, and breathing — to give you insight into your health."

> "Discover your biological age and get a snapshot of your overall health with a quick, 30-second face scan."

This is consistent with rPPG (remote photoplethysmography), a technique that extracts pulse signals from micro-variations in facial skin color captured by a standard camera.

The GraphQL query for the biological age screen requests three fields:

```graphql
biologicalAgeInfo {
  currentAge
  healthyBmiAge
  faceScanAge
}
```

Users can share their result with a pre-composed message: `"This says I'm {{difference}} years younger than my real age"`. The sharing flow is built into the onboarding path — it appears alongside the free onboarding content before any payment commitment.

---

## WordPress Infrastructure

The public WordPress REST API at `https://www.noom.com/wp-json/` returns 351 routes with no authentication. Exposed namespaces include: `altis/v1`, `noom/v1`, `wpml/v1`, `advanced-ads/v1`, `dipi/v1`, `divi-pixel/v1`, `redirection/v1`, `seopress/v1`, `two-factor/1.0`.

`/wp-json/wp/v2/users` enumerates 31 registered accounts without authentication:

- `id: 1` — slug `divinoomdev`, likely the original developer account
- `id: 103` — Saeju Jeong (CEO, co-founder)
- `id: 185` — display name `harmeet.singh@noom.com`
- `id: 187` — display name `pragati.said@noom.com`
- Remainder: dietitians, content writers, health coaches listed by name and credential suffix

Two accounts expose full email addresses as their WordPress display names. The WP REST API returns these display names in unauthenticated responses.

WordPress admin login at `/wp-admin/` redirects to `noom-prod.altis.cloud/wp-login.php`, which enforces SSO via OneLogin SAML2:

```
noom.onelogin.com/trust/saml2/http-post/sso/c31316da-c48c-403c-8052-d6253d9813b4
```

Direct username/password login to the WordPress admin is not available — the only auth path is through OneLogin.

---

## Machine Briefing

**Access and auth:**
- No authentication needed: WP REST API, meal plans API, recipes API
- `LOGGED_OUT_BUYFLOW_CLIENT_TOKEN` from `window.__GROW_CONFIG__` on `/survey/`: use as `Authorization: Bearer <token>` for unauthenticated buyflow endpoints
- Authenticated endpoints (user account required): GraphQL, billing APIs, healthcare API, coach server
- The `noomsessionid` cookie (90-day, HttpOnly, SameSite=Lax, Secure) identifies user sessions in the buyflow

**Open endpoints (no auth):**

```bash
# WordPress REST API — 351 routes
GET https://www.noom.com/wp-json/

# User enumeration
GET https://www.noom.com/wp-json/wp/v2/users

# Meal plans — no token needed
GET https://buyflow-api.noom.com/api/meal_plans/v2/?dietaryRestriction=vegan
GET https://buyflow-api.noom.com/api/meal_plans/v2/?dietaryRestriction=omnivore

# Recipes — no token needed
GET https://buyflow-api.noom.com/api/recipes/v1/{id}/

# Public site config
GET https://www.noom.com/uploads/noom/settings.json
```

**Logged-out bearer token endpoints:**

```bash
TOKEN="hfxffviTygMUfWSs8lLZLudwkgid0TBgxU7v7LOjEw8iQh53ybVSmvm9GSMWaXAJOMBQ4gxPX0xBEdLV6SXfLTNLG-QnSwzXMn2ocwVylEW5PWAAyt8lr6XbdmV2sx1h"

# User context — returns assigned user_id for anonymous session
GET https://buyflow-api.noom.com/api/context/v2
-H "Authorization: Bearer $TOKEN"

# Addon offers (POST only, may require additional params)
POST https://buyflow-api.noom.com/api/addons/v1/get_offers/
-H "Authorization: Bearer $TOKEN"
```

**Key buyflow API endpoints (from bundle, auth required for most):**

```
/api/enrollment/v2/create_account/
/api/payment/v2/purchase_program/
/api/payment/v2/accept_counter_offer/
/api/billing/customer_info/get_billing_address
/api/insurance/v1/
/api/usermodel/v1/getMedEntitlements/
/api/multiUserPlans/
```

**Internal service graph:**

```
graph.noom.com/graphql          — GraphQL (introspection disabled)
healthcare-api.noom.com         — clinical/Rx
billing-core.noom.com           — billing
billing-customerinfo.noom.com   — billing customer data
offers-api.noom.com             — retention offers
marketing-api.noom.com
auth.noom.com
data.noom.com/servlets          — coach server (CORS: *)
```

**Gotchas:**
- The buyflow SPA is NOT served by WordPress — different stack, different auth model, different headers. API Gateway handles the SPA routes.
- GraphQL introspection is disabled at `graph.noom.com/graphql`. The schema is partially reconstructable from the GraphQL query definitions embedded in the buyflow bundle.
- `data.noom.com/servlets` returns `access-control-allow-origin: *` and allows GET/POST/PUT/DELETE/OPTIONS — wildcard CORS is permissive if a bearer token is obtained.
- `GROW_CONFIG` is only available on the `/survey/` path and its child routes, not on marketing site pages.
- Test environment equivalents for all internal services follow the pattern `{service}-test.noom.com`.
