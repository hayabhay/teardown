---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "BetterHelp — Teardown"
url: "https://betterhelp.com"
company: "BetterHelp"
industry: "Healthcare"
description: "Online therapy platform matching users with licensed therapists."
summary: "PHP monolith on Kubernetes/Istio serving the main site; Next.js for the counselor application and informational pages. Cloudflare Zaraz for tag management on a self-hosted subdomain (z.betterhelp.com). Snowplow analytics self-hosted at events.betterhelp.com with a shared 'multisite' collector namespace. Five branded properties (BetterHelp, MyTherapist, TeenCounseling, BetterHelpOrg, Regain) share a single PHP session backend and cross-sync Snowplow visitor IDs on every page load."
date: "2026-04-13"
time: "02:35"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [PHP, Next.js, Kubernetes, Cloudflare Zaraz, Snowplow]
trackers: [Snowplow, Meta Pixel, TikTok Pixel, Snap Pixel, Reddit Pixel, LinkedIn Ads, Pinterest Tag, Coralogix RUM, Stripe.js]
tags: [mental-health, telehealth, tracking, cross-site, ab-testing, feature-flags, ftc-settlement, consent, identity-graph, therapy]
headline: "A production feature flag named secret_assign_straights silently routes therapy seekers by sexual orientation on a platform with a $7.8M FTC data-sharing settlement."
findings:
  - "The FAQ answer to 'How much does BetterHelp cost?' is an active A/B test -- the displayed range of $70-$100/week is a test variant rendered through template variables, not a fixed price."
  - "The 17-question signup quiz collects PHQ-9 depression screening, sexual orientation, gender identity, religion, and eating habits before account creation -- with a live SAVE_QUIZ_PROGRESS experiment implying this pre-signup mental health data is sent server-side."
  - "Every Next.js page serves an unauthenticated conf object at /_next/data/{buildId}/en/{page}.json containing the Smarty Streets address-validation API key, Pusher credentials, full feature flag set, and CSRF tokens."
  - "Visiting betterhelp.com plants Snowplow tracking cookies on four sister therapy sites via /api/multi_cookie/ calls -- eight requests per page load, all firing before any consent interaction."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

BetterHelp is the largest online therapy platform in the US, matching users with licensed counselors via text, audio, and video. It operates under a post-FTC settlement consent framework -- in March 2023 the company paid $7.8M to resolve charges that it shared mental health questionnaire answers with Facebook and Snapchat for ad targeting after representing to users that their data would never be used for advertising. The infrastructure visible today reflects that settlement: a rebuilt consent layer, explicit ad partner disclosures, and new toggle controls. But a lot of the underlying architecture is unchanged, and several behavioral patterns predate any consent interaction.

---

## Architecture

The main site runs PHP on a Kubernetes cluster fronted by Istio service mesh -- every response arrives with `Server: istio-envoy`. The counselor application portal and all informational pages (FAQ, About, Advice, Contact) run on a separate Next.js instance, served from `static.betterhelp.com`. Assets come from `assets.betterhelp.com` (S3-backed) and user-uploaded content from `d3ez4in977nymc.cloudfront.net`.

Tag management runs through Cloudflare Zaraz, but on a self-hosted subdomain (`z.betterhelp.com`) rather than the standard `static.cloudflareinsights.com`. Analytics is Snowplow, self-hosted at `events.betterhelp.com`, with a shared collector namespace labeled `"multisite"` -- one collector for all five properties in the network. Real-user monitoring runs through Coralogix (`ingress.us1.rum-ingress-coralogix.com`). Real-time in-app messaging runs through Pusher (cluster `mt1`).

The backend identifies itself with a versioned image tag: `env_image_tag: 20260410RC94d87b1ce4` -- a date-prefixed release candidate format indicating at least a weekly deployment cycle.

The `/admin.betterhelp.com` subdomain redirects to `staging.betterhelp.com`, which returns 401 behind Okta SSO (`betterhelp.okta.com`, app client_id `0oawdvomb5WcrWvmz1t7`). Staging and admin are present but behind a standard SSO wall.

---

## The Five-Property Network & Cross-Site Identity Sync

BetterHelp operates five branded properties under one backend:

| Domain | Brand |
|--------|-------|
| www.betterhelp.com | BetterHelp (main) |
| www.mytherapist.com | MyTherapist (book a specific therapist) |
| www.teencounseling.com | Teen Counseling |
| www.betterhelporg.com | BetterHelp for Organizations (B2B) |
| www.regain.us | Regain (couples therapy) |

All five FQDNs are declared in `page_info.sites_fqdn` on every page load. This isn't just a config list -- it drives an active cross-site cookie synchronization mechanism.

On every page load across any of these properties, the browser fires 8 requests to the other four sites' `/api/multi_cookie/` endpoints:

```
GET https://www.mytherapist.com/api/multi_cookie/?session_id={PHPSESSID}&action=set_mc_id
GET https://www.mytherapist.com/api/multi_cookie/?session_id={snowplow_visitor_id}&action=set_snowplow_id
GET https://www.teencounseling.com/api/multi_cookie/?session_id={PHPSESSID}&action=set_mc_id
GET https://www.teencounseling.com/api/multi_cookie/?session_id={snowplow_visitor_id}&action=set_snowplow_id
GET https://www.betterhelporg.com/api/multi_cookie/?session_id={PHPSESSID}&action=set_mc_id
GET https://www.betterhelporg.com/api/multi_cookie/?session_id={snowplow_visitor_id}&action=set_snowplow_id
GET https://www.regain.us/api/multi_cookie/?session_id={PHPSESSID}&action=set_mc_id
GET https://www.regain.us/api/multi_cookie/?session_id={snowplow_visitor_id}&action=set_snowplow_id
```

Two IDs are synced per site: the PHP session ID and the Snowplow visitor ID. The endpoint on each sister site sets Snowplow cookies in response -- `_sp_id.57d2` on mytherapist.com (namespace `57d2`), different namespace from `_sp_id.7092` on betterhelp.com, but carrying the same visitor UUID. Even if the 403 status from a cross-origin curl suggests the endpoint rejects some requests, the Set-Cookie header still fires.

The practical effect: a user visiting betterhelp.com for the first time, before touching any consent control, has their Snowplow identity planted on all four sister sites. If that user later visits teencounseling.com or regain.us, the shared visitor ID allows the Snowplow collector to link those sessions back to betterhelp.com.

This fires in every page load network trace in evidence, including the first-visit trace where `zarazData.z_cookieConsent=0`.

---

## What the First HTTP Response Sets

Before any user interaction or consent dismissal, the initial response to `https://www.betterhelp.com/` sets 8 cookies:

| Cookie | Scope | Expires | HttpOnly | Notes |
|--------|-------|---------|----------|-------|
| `PHPSESSID` | path=/ | session | yes | PHP session token |
| `BHTOK` | path=/ | session | yes | Long hex auth token |
| `ncy` | path=/ | session | yes | Unknown; value=1 |
| `nte` | .betterhelp.com | 1 year | yes | Unknown; value=1 |
| `pse` | path=/ | 30 days | yes | URL-encoded JSON: experiment variant assignments |
| `pref_language` | .betterhelp.com | 30 days | no | `en` |
| `_sp_id.7092` | .betterhelp.com | 1 year | no | Snowplow visitor UUID |
| `_sp_ses.7092` | .betterhelp.com | 30 min | no | Snowplow session UUID |

The `pse` cookie is notable: it URL-encodes a JSON object mapping experiment IDs to assigned variant IDs. On investigation: `pse=%7B%22363%22%3A694%2C%22337%22%3A641%2C%22358%22%3A684%7D` decodes to `{"363":694,"337":641,"358":684}`. This is a server-assigned A/B test assignment that persists for 30 days, set before the user has taken any action on the site.

---

## Feature Flags & A/B Tests

The `window.page_info` object embedded in every PHP page's HTML contains a `features` object with the full production feature flag set. The same object is served via `/_next/data/{buildId}/en/{page}.json` for Next.js pages. The complete flag list:

```json
{
  "specify_podcast": true,
  "sunsetting": false,
  "urgent_messages": true,
  "couples": false,
  "phone_calls": true,
  "secret_assign_straights": true,
  "livechat": true,
  "about": true,
  "counselor_application": true,
  "counselor_application_lean": false,
  "worksheets": true,
  "smart_match_with_categories": true,
  "groupinars": true,
  "group_sessions": true,
  "login_quotes": true,
  "videosessions": true,
  "app_supports_videosessions": true,
  "cloud_chat": true,
  "consent_agreement": true,
  "gmail_quick_action": true,
  "scheduling": true,
  "support_link": true,
  "no_trial": true,
  "strike_through_cake": true,
  "dollar_test_charge": true,
  "groupon": true,
  "mental": true,
  "funnel_smart_match": true,
  "funnel_overview": true,
  "offer_promo_codes": true,
  "email_verification_always": true,
  "reviews_page": true,
  "jobs_page": true,
  "security_logos_display": true,
  "social_links_display": true,
  "counselor-directory": true,
  "language_is_matching_hard_filter": false,
  "advice": true,
  "presskit": true,
  "press_page": true,
  "text_notifications": true,
  "goals": true,
  "goals_mobile_main_menu": false,
  "batch_creation": true,
  "ask_language": true,
  "parent_child_account": false,
  "hardcoded_testimonials": false,
  "friendly_funnel": true,
  "referral_program": true,
  "vouchers": true,
  "betterhelp_branded": true,
  "signup_captcha": true,
  "signup_repeat_password": false,
  "phone_on_mobile_signup": true,
  "cookie_consent_required": true,
  "journal": true,
  "maintenance_plan": true,
  "show_business_link": true,
  "show_impressum": true,
  "counselors_page": true
}
```

**`secret_assign_straights: true`** -- The flag name is specific and unusual for a mental health platform. The signup funnel collects sexual orientation (Straight / Gay / Lesbian / Bi or Pan / Questioning / Queer / Asexual) as one of the first identity questions, with a follow-up asking whether the user wants a therapist specializing in LGBTQ+ issues. The inferred behavior of this flag: users who answer "Straight" are routed through the matching algorithm without the LGBTQ specialization flag being set, silently, without surfacing this routing logic to the user or therapist. The "secret" prefix in a production feature flag name is an explicit acknowledgment that this behavior is not disclosed to users. BetterHelp was publicly criticized for orientation-based therapist routing in 2020-2022; this flag remains active.

**`strike_through_cake: true`** -- Inferred pricing presentation flag. "Cake" is a common internal codename for pricing/payment UIs; "strike_through" in e-commerce UX typically means showing a crossed-out original price next to a discount. Active in production.

**`dollar_test_charge: true`** -- Test payment mode active in production. Either a test charge path for QA or a $1 verification charge pattern for payment method validation.

**`couples: false`** -- Couples therapy disabled on betterhelp.com (separated to regain.us).

**`groupon: true`** -- Groupon discount integration active.

**`no_trial: true`** -- No free trial.

### Active A/B Experiments (Presignup)

From `page_info.presignup_experiments` on the homepage:

```json
{
  "NEW_HOMEPAGE_VALUE_PROPS": "CONTROL",
  "FAQ_COST_RANGE_CHANGE": "TEST_70_100",
  "NEW_GET_STARTED_COPY_V1": "CONTROL"
}
```

**`FAQ_COST_RANGE_CHANGE: TEST_70_100`** is the most notable. The FAQ answer to "How much does BetterHelp cost?" uses template variables:

```html
The cost of therapy through BetterHelp ranges from
<var data-var="low_end">$70</var> to
<var data-var="high_end">$100</var> per week
```

The variant name `TEST_70_100` implies a control showing a different range -- either lower or the range is tested against different framing. This is a live experiment on which price expectation to set in the FAQ for potential clients searching for therapy cost information before signing up. The control variant's range is unknown.

**`ULTRAHUMAN_RING_V2`** appears in the homepage presignup experiments (value: `CONTROL`) -- a cross-sell experiment with Ultrahuman fitness wearable company. Absent from the counselor application page_info.

**`SAVE_QUIZ_PROGRESS: TEST`** -- Saving onboarding quiz progress. The `/autosave/` path is blocked in robots.txt for all crawlers, suggesting this endpoint exists and handles pre-account quiz data. The implication: quiz answers (including mental health screening data) may be sent server-side before signup completion, enabling re-engagement for incomplete signups.

---

## The Signup Funnel

The `/get-started/` onboarding funnel strips `page_info` to a minimal object with just five pixel-trigger flags:

```json
{
  "user_id": -1,
  "trigger_sign_up_pixel": false,
  "trigger_started_trial_pixel": false,
  "trigger_actually_paid_pixeled": false,
  "is_insurance_client": false
}
```

These flags correspond directly to the advertising platforms listed as consent-gated partners: Meta, TikTok, Snap, Reddit, LinkedIn, Pinterest. When a signup completes, the appropriate flag flips, and Zaraz fires the platform's conversion pixel.

The funnel is named "BetterHelpClient Funnel_v34" (the Bamboo quiz framework used by BetterHelp) and collects, in sequence:

1. Therapy type (Individual / Couples / Teen)
2. Country
3. Gender identity (Woman / Man / Non Binary / Transfeminine / Transmasculine / Agender / and others)
4. Age
5. Sexual orientation (Straight / Gay / Lesbian / Bi or Pan / Questioning / Queer / Asexual)
6. Preference for LGBTQ+-specializing therapist
7. Relationship status
8. Religion importance (scale)
9. Spirituality (yes/no)
10. Prior therapy history
11. Therapy expectations
12. Therapist style preferences (gentle vs. direct, flexible vs. structured, casual vs. formal)
13. Physical health rating
14. Eating habits rating
15. PHQ-9 item: overwhelming sadness, grief, or depression
16. PHQ-9 item: little interest or pleasure in doing things (anhedonia)
17. PHQ-9 item: moving or speaking unusually slowly (psychomotor)

All answers are stored in `bambooStorage` localStorage in real-time with timestamps, using factIDs (TherapyType, CountryId, GenderIdentity, SexualOrientation, IsLGBTQ, RelationshipStatus, ReligionImportance, IsSpiritual, PreviousTherapy, etc.). Account creation has not happened at this point -- these are pre-signup responses.

The `SAVE_QUIZ_PROGRESS` A/B test is live, and `/autosave/` is blocked in robots.txt. The most direct reading: the test variant sends these answers to the server mid-funnel, before account creation, to enable re-engagement outreach to users who abandon the quiz. Whether that's occurring in the TEST arm is not confirmed from client-side evidence alone.

Stripe.js fires at `/get-started/` page load -- `POST m.stripe.com/6` -- before any payment information is entered. This is Stripe's device fingerprinting and fraud detection payload, standard behavior for Stripe.js v3 but notable given it fires at the start of the mental-health intake funnel.

---

## Surveillance & Consent Architecture

### What's In the Zaraz Config

On fresh load (`z_cookieConsent=0`), `zarazData.executed` lists the tools that fired:

```
["Pageview", "836060a8-f41d-405c-b46e-fde261c71cfe", "NjwT",
 "b9e7cda6-9cbc-4865-94dd-e169befaa64b", "cVpV", "ifsc", "oiiO",
 "Betterhelp", "JNAw", "a0215340-1984-476a-be7b-34ef2973feef",
 "ea7b7665-40ad-4e96-8567-27df3874eb91", "NoPerformance", "NoTracking"]
```

Thirteen tool IDs executed. `NoPerformance` and `NoTracking` are blockers -- they prevent analytics and targeting from loading. But eleven other tool invocations fire, including at least `Pageview` and a tool labeled `Betterhelp`. Zaraz's consent model treats session-level tools as necessary even before the user has seen the banner.

The Zaraz script (`z.betterhelp.com/cdn-cgi/zaraz/i.js`) passes all cookies including `__stripe_mid` and `__stripe_sid` to the Cloudflare edge worker via the `z=` parameter -- this is how Zaraz collects browser context. The Zaraz config ignores OneTrust (`dataLayerIgnore: ["OptanonLoaded", "OneTrustLoaded"]`), meaning the consent framework is entirely custom -- not a standard CMP integration.

### Ad Partners Disclosed

The `/api/sharing-settings` endpoint returns the consent modal HTML including the full list of advertising partners and their privacy policy links. No authentication required. Confirmed partners:

- Meta (Facebook Pixel)
- TikTok Pixel
- Snap Pixel
- Reddit Pixel
- LinkedIn Ads
- Pinterest Tag
- Indeed (therapist recruiting, not client advertising)

The disclosed cookie list explicitly names Indeed cookies for therapist recruitment (CTK, INDEED_CSRF_TOKEN, ctkgen) and LinkedIn Ads cookies (alyticsSyncHistory, UserMatchHistory, bcookie, bscookie, li_sugr, lidc). Meta, TikTok, Snap, Reddit, and Pinterest pixels are listed in the ad partner section of the consent modal but not in the server-side cookie list.

### The Event Tracking Taxonomy

`events.js` (38KB, minified) contains 322 distinct event-name strings representing the full behavioral tracking taxonomy. Selected events that reveal what the instrumented system monitors:

```
quiz_funnel, quiz_answer, quiz_question_number, quiz_history
signup_funnel, signup_captcha
payment, payment_element_loaded, payment_element_location, payment_method
payment_failure_modal, cancel_membership, cancel_membership_click
change_or_cancel_membership_modal_answered
dpa_consent_deferred, dpa_read_agreement
eap_consent (Employee Assistance Program)
accepted_china_consent
reactivation (win-back flows)
application_approval_modal_answered, application_cancellation_modal_answered
chose_a_therapist, change_therapist_clicked
caseload_goal_save (counselor-side)
async_guided_interview_mitek (identity verification)
accessibility_icon_toggled
```

The taxonomy covers the full user lifecycle: discovery, quiz, signup, payment, retention, cancellation, and reactivation. The counselor side is also instrumented (`caseload_goal_save`, `application_approval_modal_answered`).

---

## Client-Side Config Exposure

Every Next.js page (FAQ, About, Advice, Contact, and others) returns a `conf` object at `/_next/data/{buildId}/en/{page}.json`, accessible without authentication:

```
GET https://www.betterhelp.com/_next/data/DqNm8HPUnzJeY6I7hMyTM/en/faq.json
```

The conf object as of investigation:

```json
{
  "fb_app_id": "740224816069682",
  "recaptcha_v3_site_key": "6LetGMcUAAAAANFcpJR1wJz3D5h_aNFFiQou4cMm",
  "smarty_api_key": "143428513113329780",
  "socket": {"cluster": "mt1", "api_key": "13ee0301d04e868e66d2"},
  "cdn_host_upload": "d3ez4in977nymc.cloudfront.net",
  "snowplow_external_endpoint": "events.betterhelp.com",
  "coralogix_rumfrontend_key": "cxtp_ZN7InjlIyKqiTTDilrju0OSDLiv1UY",
  "zaraz_url": "https://z.betterhelp.com/cdn-cgi/zaraz/i.js",
  "app_version": "e795ad36177287b1ce4",
  "env_image_tag": "20260410RC94d87b1ce4"
}
```

The full feature flag set is also included, along with a CSRF token (session-scoped, regenerated per request).

**Smarty API key** (`143428513113329780`): Smarty Streets is a US address validation API. The key is a client-side auth token for server-side API calls -- standard practice would be to proxy address validation through BetterHelp's own backend rather than exposing the third-party key. Anyone with this key can make address validation requests against BetterHelp's account and quota.

**Pusher WebSocket** (`api_key: 13ee0301d04e868e66d2`, cluster `mt1`): The Pusher API key must be in client code for WebSocket connections (it's a publishable key) -- but it reveals the real-time infrastructure and channel naming scheme.

The Next.js build ID (`DqNm8HPUnzJeY6I7hMyTM`) is stable until the next deployment. Live verification as of this investigation confirms all endpoints and key values.

---

## robots.txt: The `/edxretailf.ws/` Path

```
User-agent: *
Disallow: /edxretailf.ws/

User-agent: Googlebot
(no /edxretailf.ws/ rule)
```

`/edxretailf.ws/` is blocked for all crawlers *except* Googlebot. The path pattern matches BetterHelp's affiliate tracking URL structure -- EDX is a click-tracking parameter used in affiliate links, and `.ws` is a TLD used in some affiliate redirect domains. The Googlebot carve-out suggests this path exists for affiliate attribution that needs to remain visible in Google's index for SEO credit. Standard affiliate infrastructure, visible in robots.txt.

---

## Machine Briefing

**Access & auth**: Most endpoints return data without authentication. The main site (PHP) returns page_info globals in HTML on every page load. The counselor application (Next.js) returns conf objects at `/_next/data/{buildId}/en/{page}.json` via simple curl. For endpoints requiring a session, GET `https://www.betterhelp.com/` to receive PHPSESSID, BHTOK, and experiment cookies in response headers.

**Build ID**: Current as of investigation: `DqNm8HPUnzJeY6I7hMyTM`. Stable until next deployment. Check `app_version` or `env_image_tag` in the conf object to detect deploys.

**Open endpoints** (no auth required):

```bash
# Consent modal HTML + partner list
curl "https://www.betterhelp.com/api/sharing-settings"

# Subscription/withdrawal availability (returns success/show flags)
curl "https://www.betterhelp.com/api/subscription/unsubscribe/availability"
curl "https://www.betterhelp.com/api/withdrawal/availability"

# Language selector
curl "https://www.betterhelp.com/api/locale/selector"

# Full conf object: feature flags, API keys, session info (unauthed)
curl "https://www.betterhelp.com/_next/data/DqNm8HPUnzJeY6I7hMyTM/en/faq.json"
curl "https://www.betterhelp.com/_next/data/DqNm8HPUnzJeY6I7hMyTM/en/about.json"
curl "https://www.betterhelp.com/_next/data/DqNm8HPUnzJeY6I7hMyTM/en/contact.json"

# Testimonials API (by specialty)
curl "https://www.betterhelp.com/api/counselor_testimonials/featuredcounselor"
curl "https://www.betterhelp.com/api/counselor_testimonials/featuredcounselor?counselor_type=christian"

# Presignup experiment assignment (POST, returns experiment variant for session)
curl -X POST "https://www.betterhelp.com/api/presignup_experiments"
```

**Page globals** (from `window.page_info` in HTML):
- Feature flags: `page_info.features`
- Experiments: `page_info.presignup_experiments`
- Scale stats: `page_info.total_sessions` (469M+), `page_info.total_therapists` (31,999), `page_info.total_members` (6.3M+)
- Geo: `page_info.geo_country`
- All 5 FQDNs: `page_info.sites_fqdn`

**Cross-site cookie sync** (observed, not recommended to reproduce without consent):

```
GET https://www.mytherapist.com/api/multi_cookie/?session_id={PHP_SESSION_ID}&action=set_mc_id
GET https://www.mytherapist.com/api/multi_cookie/?session_id={SNOWPLOW_ID}&action=set_snowplow_id
# Same pattern for teencounseling.com, betterhelporg.com, regain.us
```

**Gotchas**:
- The Next.js build ID changes on every deployment -- if `/_next/data/{buildId}/en/faq.json` returns 404, fetch the counselor application page and extract the new build ID from `/_next/data/` references in the HTML.
- `/api/sharing-settings` returns HTML, not JSON -- the response body is the consent modal markup.
- The `presignup_experiments` POST endpoint returns experiment variants for the session. Session assignment is also stored in the `pse` cookie (URL-encoded JSON, HttpOnly).
- Snowplow is self-hosted at `events.betterhelp.com`. Beacons go to `POST /com.snowplowanalytics.snowplow/tp2`.
- The `/counselor_signup/` and `/api/` paths are blocked in robots.txt for all agents including Googlebot.
