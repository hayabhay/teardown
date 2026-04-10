---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Rite Aid — Teardown"
url: "https://riteaid.com"
company: Rite Aid
industry: Healthcare
description: "Health testing subscription service operating under the acquired Rite Aid brand."
summary: "Laravel and Alpine.js behind Cloudflare, with Stripe payments and Google Cloud Storage for static assets. Operated by Private MD Labs, which runs at least five consumer brands on the same backend -- riteaid.com, labsmd.com, discountedlabs.com, privatemdlabs.com, and 1dollartrt.com -- distinguished only by session cookie names. The live checkout is a 3-step flow; the shipped JS bundle contains a complete 8-step flow with gift memberships, health questionnaires, 18 add-on lab tests, and appointment scheduling, all built but suppressed."
date: 2026-04-07
time: "22:16"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack:
  - Laravel
  - Alpine.js
  - Cloudflare
  - Stripe
  - Google Cloud Storage
  - Vite
trackers:
  - Ahrefs Analytics
  - Sentry
  - Google reCAPTCHA
  - Custom Click Tracker
  - Custom Touchpoint Tracker
tags:
  - healthcare
  - health-testing
  - subscription
  - multi-brand
  - abandoned-cart
  - pre-submit-data-capture
  - staged-features
  - brand-acquisition
  - privacy
  - no-consent-banner
headline: "Rite Aid's publicly listable GCS bucket reveals the operator behind the brand -- Private MD Labs runs five consumer health sites on one backend, and the bucket exposes their entire abandoned-cart email playbook alongside unreleased brand assets."
findings:
  - "The checkout form silently POSTs name, DOB, gender, address, and phone to a partial_checkouts endpoint two seconds after input begins -- before the user submits, agrees to terms, or enters payment -- feeding a 7-stage abandoned cart email sequence whose templates are visible in the open GCS bucket."
  - "The shipped JS bundle contains a complete 8-step checkout with gift memberships, 18 individually priced add-on tests ($19-$39), a $100 home blood draw option, and a lab scheduling interface hardcoded to a Beverly Hills Quest location with confirmation code LSGSXM -- all built but stripped to 3 steps for launch."
  - "The new riteaid.com acquired the Rite Aid Rewards loyalty database -- names, emails, phone numbers, and purchase history -- from the January 2026 bankruptcy, giving a DTC health testing startup the customer list of a national pharmacy chain."
  - "Sentry runs site-wide with sendDefaultPii set to true, forwarding request headers, cookies, and IP addresses in error reports from a platform where users enter date of birth, gender, and home address during checkout."
  - "NY, NJ, and RI residents are blocked by a frontend-only RESTRICTED_STATES check in the checkout JavaScript; Washington state gets a separate health data consent gate required by the My Health My Data Act -- the only state-specific compliance control in the codebase."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Background: A Brand Acquired from Bankruptcy

The riteaid.com operating today is not the Rite Aid pharmacy chain that filed for Chapter 11. On January 15, 2026, Rite Aid LLC -- a new entity operated by Private MD Labs -- acquired the Rite Aid brand and its Rewards loyalty database from the bankruptcy estate of Rite Aid Corporation. What was acquired: the brand, the domain, and the loyalty program data (names, emails, phone numbers, purchase history). What was explicitly not acquired: prescription records, pharmacy data, or any protected health information.

The new Rite Aid is a health testing subscription service: $1 upfront at checkout, $348 billed when lab results arrive, covering two blood draws per year at Quest Diagnostics locations. The site has a pharmacy section that displays a holding page with no launch date -- "Prescription services are coming. We'll announce when they're ready."

The operator identity is confirmed in multiple ways. The admin panel at `/admin/login` displays the Private MD Labs logo. The Google Cloud Storage bucket is named `pmd-static`. The backend serves five or more consumer brands on the same Laravel stack, each with its own session cookie. The copyright line reads "Copyright 2026 riteaid.com" -- notably the domain, not a corporate name. The phone number 863-270-9911 is a Florida area code (Polk County).

## Architecture

The site runs Laravel on the backend, Alpine.js on the frontend, with Vite as the build system (assets at `/build/assets/` with content hashes). Cloudflare sits in front of the origin with Rocket Loader enabled -- all inline script tags get their type attribute rewritten to hashed Cloudflare types (e.g., `type="c091b2774e7d4213dfac0c90-text/javascript"`), preventing execution until Cloudflare's loader fires. `window.isProduction = true` is set on every page.

The session cookie pair is classic Laravel: `riteaid_session` (httpOnly, SameSite=Lax, 7-day expiry) and `XSRF-TOKEN` (JWT-encoded, readable by JavaScript, 7-day expiry). The CSRF token is also embedded in a `<meta name="csrf-token">` tag and included in every `sendBeacon` payload on the body element.

Security headers are solid: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, HSTS with `includeSubDomains` and a year max-age, `Permissions-Policy: geolocation=(self)`, and `Referrer-Policy: strict-origin-when-cross-origin`. No Content-Security-Policy header is present.

Patient portal login is Google OAuth only (`/portal/auth/google`). There is no email/password login for patients. The admin panel at `/admin/login` has its own login form with Private MD Labs branding. No separate subdomains exist -- DNS queries fail for common prefixes (api., admin., staging., dev.). Static assets are served from `storage.googleapis.com/pmd-static/`.

Additional frontend tooling: Fraunces variable font (Google Fonts, with SOFT and WONK axes), `intl-tel-input` for international phone numbers, Google Maps Places API for address autocomplete at checkout (`AIzaSyAte66Y-bAq1cgoG-aMXhkOTnnGgvC4k1Q`, restricted to referrer), and the Stripe Elements SDK for payment card entry.

The `robots.txt` is two lines: `User-agent: *` and `Disallow: /dev/`. No sitemap reference.

**Response headers (homepage):**
```
server: cloudflare
cache-control: no-cache, private
x-frame-options: SAMEORIGIN
x-content-type-options: nosniff
strict-transport-security: max-age=31536000; includeSubDomains
permissions-policy: geolocation=(self)
referrer-policy: strict-origin-when-cross-origin
```

## The Multi-Brand Platform

Private MD Labs runs at minimum five active consumer brands on a single Laravel backend, each distinguished by session cookie name:

| Domain | Session Cookie |
|--------|---------------|
| riteaid.com | `riteaid_session` |
| labsmd.com | `labsmd_session` |
| discountedlabs.com | `discounted_labs_session` |
| privatemdlabs.com | `private_md_labs_session` |
| 1dollartrt.com | `1dollar_trt_session` |

The public GCS bucket `pmd-static` contains asset directories for each brand: `img/riteaid/`, `img/labsmd/`, `img/discountedlabs/`, `img/1dollartrt/`, `img/drdracula/`. The `drdracula` brand has assets in the bucket despite its domain not resolving at investigation time -- a sixth brand, possibly retired or pre-launch.

The bucket is publicly listable with no authentication. `GET https://storage.googleapis.com/pmd-static` returns a complete XML directory listing with 590 files. Directories include: `img/abandoned-carts/email/` (multi-stage cart recovery templates for new and returning customers), `img/2025-promotion/` (Black Friday, Christmas, Cyber Monday, New Year banners), `img/birthday-discount/`, `img/newsletter/`, `img/popup-leads/`, `sample-reports/` (23 numbered lab report PDFs), and `video-health-insights/` (90+ personalized result videos with numeric IDs).

The `img/abandoned-carts/email/` directory contains seven sequenced email images for new customers (e1 through e7) and a parallel sequence for returning customers, each with variant versions (v2 editions). This is a complete cart abandonment email playbook, readable by anyone.

## Checkout: The Live Flow vs. What Was Built

The live checkout on riteaid.com presents three steps: account-creation, membership-checkout, and confirmation.

The shipped JavaScript bundle (`checkout-BrR9PYAp.js`) contains the full Alpine.js checkout state machine with eight steps:

```
account-creation -> membership-checkout -> gift-options -> quick-questions ->
add-ons -> collection-method -> schedule-appointment -> confirmation
```

The five suppressed steps are complete implementations, not stubs:

**gift-options**: A full gift membership flow with recipient name, phone, and gift message fields. The payment path for gift purchases is separate from the primary membership flow.

**quick-questions**: A health questionnaire capturing hearing/vision status, health goals, and acquisition source.

**add-ons**: 18 individual lab test add-ons across categories, each fully priced:

| Test | Price |
|------|-------|
| Lipoprotein (a) | $39 |
| Apolipoprotein B (ApoB) | $19 |
| Advanced Lipid Assessment | $39 |
| hs-CRP | $19 |
| Vitamin D, 25-Hydroxy | $35 |
| Hemoglobin A1c (HbA1c) | $19 |
| Cortisol, AM | $29 |
| CA-125 | $35 |
| PSA | $25 |

The full list spans hormones, metabolic health, vitamins, and oncology markers, priced $19-$39 each.

**collection-method**: A toggle between Quest lab visit and a $100 home blood draw. The in-bundle copy notes "at-home testing is coming soon."

**schedule-appointment**: A lab search and scheduling interface. The bundle contains hardcoded test data: a Beverly Hills, CA Quest Diagnostics location with confirmation code `LSGSXM`. This is test data from development, shipped in the production bundle.

The order summary in the unreleased build path prices the annual membership at $365 -- a stale price from a prior iteration, never served to users.

## Pricing Architecture

The live checkout uses split billing:

1. **$1 charged at checkout** -- Stripe PaymentIntent with `amount: 100` cents
2. **$348 charged when results arrive** -- server-side charge triggered by Quest data

Total: $349/year, matching the homepage and schema.org structured data. The checkout renders this clearly: "You pay $1 today. Your full payment of $349 is charged only after your results start coming in." The CSS asset for this section is literally named `_test-now-pay-later-C_YiW9UM.css`. There is also an exit-intent popup (`openFreeTrialPopup`) that reinforces the $1 trial offer when users navigate away from checkout.

The Stripe Payment Request API is also configured, offering Apple Pay and Google Pay with the same $1 initial charge (`total: { label: 'Rite Aid Membership', amount: 100 }`).

## Abandoned Cart Data Collection

The checkout form sends a debounced fire-and-forget POST to `/checkout/partial` two seconds after the last form change, provided the user has entered an email address or phone number. The full payload:

```json
{
  "email": "...",
  "first_name": "...",
  "last_name": "...",
  "phone": "...",
  "phone_prefix": "1",
  "gender": "...",
  "birth_year": "...",
  "birth_month": "...",
  "birth_day": "...",
  "address_street": "...",
  "address_city": "...",
  "address_state": "...",
  "address_zip": "...",
  "text_offers": false
}
```

This fires before the user submits, before they agree to terms, and before any payment. The call uses `fetch(...).catch(() => {})` -- errors are silently swallowed. The form data is also persisted to `localStorage` under key `riteaid_checkout_progress` and restored on return visits.

The GCS bucket makes the downstream pipeline visible. `img/abandoned-carts/email/new-customer/` contains seven sequenced email images (e1 through e7), and `img/abandoned-carts/email/returning-customer/` contains a parallel seven-step sequence. These map directly to the data `/checkout/partial` collects.

The SMS opt-in flag (`text_offers`) is included in the partial payload even when false. The collected phone number can feed SMS sequences if the user had opted in previously on a sister brand, since the platform is shared.

The operator's privacy policy explicitly disclaims HIPAA Covered Entity status. The data collected pre-purchase -- date of birth, gender, home address, and health test purchasing intent -- falls within scope of the FTC Health Breach Notification Rule and state consumer health data laws.

## Privacy Architecture and State Restrictions

**No consent banner.** The site loads Ahrefs Analytics and reCAPTCHA on page load with no consent dialog. No OneTrust, Cookiebot, or any consent management platform is present.

**State restrictions.** The checkout JavaScript hardcodes `RESTRICTED_STATES = ['NY', 'NJ', 'RI']`. Entering one of these states produces: "Service is not available in this state due to state regulations." These states have stricter direct-access laboratory testing laws. The restriction is enforced in the frontend only -- all three states still appear in the dropdown.

**Washington state gate.** Washington residents encounter an additional `agreeHealthData` checkbox in the checkout flow that is required before submission. The validation logic: `if (f.addressState === 'WA' && !f.agreeHealthData) errs.agreeHealthData = 'You must consent to health data collection'`. This is a My Health My Data Act compliance gate. When the address state changes away from WA, the `agreeHealthData` flag silently resets to false. A dedicated Consumer Health Data Privacy Policy is available at `/consumer-health-data-privacy-policy`.

**Gender auto-inference.** The checkout form calls `POST /api/auto-select-gender` when the user enters their first name and has not yet selected a gender. The API returns `{"gender":"Male"}` or `{"gender":"Female"}`. The result pre-fills the gender radio button but does not lock it -- the user can change the selection. Only binary gender options (male/female) are offered. The endpoint uses name-to-gender inference with no provision for ambiguous names.

**Loyalty data inheritance.** Per the privacy policy and January 2026 bankruptcy transfer, the new riteaid.com received Rite Aid Rewards member data: names, emails, phones, and purchase history from the legacy pharmacy chain. Former Rite Aid customers may be in this database under the new operator's privacy policy without having interacted with the new site.

## Tracking and Surveillance

**Third-party trackers: minimal.** The site loads Ahrefs Analytics (`analytics.ahrefs.com/analytics.js`, key `CGljBdqvQWtRcX8WMeql9Q`) as its sole external analytics platform. No Google Analytics, no Meta Pixel, no Google Tag Manager. reCAPTCHA v2 invisible (`sitekey: 6LeAwm4sAAAAAIl3-nl215dGwRJxluegyH6YnDDu`) is loaded on pages with voice search.

**Sentry error tracking.** The Sentry SDK loads via CDN (`js.sentry-cdn.com/564efd66703e6756560c96d848b30bf6.min.js`). Configuration across all pages:

```javascript
Sentry.init({
    environment: 'production',
    sendDefaultPii: true,
});
```

`sendDefaultPii: true` instructs the Sentry SDK to include request headers, cookies, and IP address in error payloads. On checkout pages where users are entering DOB, gender, and address, form field data may also be captured in error contexts.

**First-party click tracking.** `window.ClickTracker` (loaded from `click-tracker-B4fhe2Jy.js`) sends instrumented click events to `/api/track-click` via `navigator.sendBeacon`. The tracker captures `element_id`, `element_class`, `element_xpath`, and `page_url` for each click. It fires on elements that have a `track-id` attribute or an `id` attribute -- only instrumented elements, not all clicks. The tracker has a debug mode toggled by `window.isProduction` (disabled in production).

**Named event tracking.** Every page body has an Alpine.js event listener: `@track.window="navigator.sendBeacon('/store-touchpoint', ...)"`. Custom events dispatch with structured data like `{name: "checkout_step", parameter: "navbar_join_today"}`. The CSRF token is embedded directly in the sendBeacon payload.

## AI Health Chatbot

The site embeds an AI chatbot in two forms: a collapsed input field in the homepage hero section and a floating widget available on all pages. Both connect to the same backend:

- `POST /api/chatbot/message` -- sends user messages, returns AI responses
- `POST /api/chatbot/conversation` -- conversation management

The chatbot config is exposed as `window['CHATBOT_CONFIG_hero-chatbot']` with fields for `apiUrl`, `conversationUrl`, `entityId`, `entityType`, `pageContext`, `mode`, and `conversationEnhancements`. The homepage instance runs in `hero-embedded` mode; the widget runs as a standard chatbot.

Voice input is available through `/api/transcribe`, which accepts recorded audio and returns text transcription. reCAPTCHA protects the voice endpoint but not the text chatbot input. Voice recording is limited to 10 seconds.

The chatbot's greeting announces: "I can help you with: Health questions and wellness advice, Lab testing and preventive care, Pharmacy services (coming soon!)."

The conversation API endpoint returns `access-control-allow-origin: *` on OPTIONS -- wildcard CORS on an endpoint handling health chatbot conversations. In practice, Cloudflare bot detection blocks non-browser requests (403 for curl).

## Content Architecture

The site serves a substantial content layer alongside the subscription product:

- **/biomarkers** -- 21,906 lines of HTML listing all test panels and biomarkers covered by the annual screening. The most content-dense page on the site.
- **/health** -- "Health Conditions A-Z," a database of health conditions with symptoms, causes, diagnosis, and relevant blood tests. Structured as an SEO content hub.
- **/locations** -- Quest Diagnostics blood draw locations pre-rendered by state (45+ state pages: `/locations/ca`, `/locations/ny`, etc.) with city-level sub-pages.
- **/pharmacy** -- Holding page with lead-gen form collecting first name, last name, email, phone, and state for a "PHARMACY_WAITLIST" list. Posts to `/lead-gen`.
- **/what-happened** -- "Yes, we're that Rite Aid. And here's what happened." Explains the bankruptcy and pivot.
- **/prescription-transfer** -- "Where did my Rite Aid prescriptions go?" -- directs former customers to their new pharmacy.
- **/pharmacy-records** -- "Rite Aid moved fully online in 2026."
- **/vaccination-records** -- How to find vaccination records from the legacy chain.

Schema.org structured data is present on all pages: Organization (with `foundingDate: "1968"` -- the original Rite Aid founding), BreadcrumbList, HowTo (for the testing process), and Product (with `price: "349.00"`, `availability: InStock`).

## Machine Briefing

**Access & auth.** Most content pages and select API endpoints work without authentication. The chatbot and voice search APIs are blocked by Cloudflare bot detection (403 for non-browser user agents). Checkout endpoints require a valid CSRF token from an active Laravel session. To get a session: load any page and capture the `riteaid_session` and `XSRF-TOKEN` cookies.

Patient portal requires Google OAuth. Admin panel at `/admin/login` has separate auth.

**Open (no auth required):**

```bash
# ZIP to city/state lookup
curl -s -X POST https://riteaid.com/get-state/90210 \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "X-CSRF-TOKEN: {token}"
# Returns: {"zip":"90210","state":"CA","city":"Beverly Hills"}

# Gender inference from first name
curl -s -X POST https://riteaid.com/api/auto-select-gender \
  -H "Content-Type: application/json" \
  -d '{"name":"Alex"}'
# Returns: {"gender":"Male"}

# GCS bucket listing (590 files, all brands)
curl -s "https://storage.googleapis.com/pmd-static"

# Abandoned cart email templates
curl -s "https://storage.googleapis.com/pmd-static?prefix=img/abandoned-carts/"

# Sample lab reports (PDFs)
curl -s -O "https://storage.googleapis.com/pmd-static/sample-reports/3811.pdf"
```

**Session-required endpoints:**

```
POST /checkout/partial        -- partial checkout data capture
POST /checkout/account        -- account creation
POST /checkout/payment/initiate  -- Stripe PaymentIntent creation
POST /checkout/payment/complete  -- payment finalization
POST /store-touchpoint        -- event tracking
POST /api/track-click         -- click tracking
POST /api/chatbot/message     -- AI chatbot (also needs browser UA)
POST /api/chatbot/conversation -- conversation management (browser UA)
POST /api/transcribe          -- voice transcription (needs reCAPTCHA)
POST /lead-gen                -- pharmacy waitlist signup
```

**Gotchas:**
- Chatbot endpoints return 403 from non-browser user agents -- Cloudflare bot detection requires a full browser session.
- `/api/transcribe` requires a valid reCAPTCHA v2 token.
- The XSRF-TOKEN cookie is JWT-encoded; pass the raw cookie value as the `X-CSRF-TOKEN` header.
- NY, NJ, and RI are blocked at the frontend for checkout. Server-side enforcement not confirmed.
- The unreleased checkout steps are in the shipped JS bundle but the live `steps` array only contains 3 entries. The `next()` function follows this array strictly.
- The `/add-on/{order_uid}` receipt page is available post-checkout for purchasing additional tests.
