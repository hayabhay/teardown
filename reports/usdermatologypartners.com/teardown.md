---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "U.S. Dermatology Partners — Teardown"
url: "https://www.usdermatologypartners.com"
company: "U.S. Dermatology Partners"
industry: Healthcare
description: "Multi-state dermatology practice group with 280+ clinic locations."
summary: "Public marketing site on WordPress (WP Engine + Cloudflare), custom theme usdermcare, Gravity Forms for appointments, MemberPress for cosmetic subscriptions. Patient portal is a separate React/Vite SPA (Netlify) backed by a Django REST API with JWT auth and a 3-step OTP activation flow. Salesforce Marketing Cloud handles patient email. Two GTM containers, two entirely separate stacks."
date: 2026-04-12
time: "20:41"
contributor: hayabhay
model: sonnet
effort: high
stack:
  - WordPress
  - React
  - Django
  - Cloudflare
  - WP Engine
  - Netlify
trackers:
  - Google Analytics
  - Google Ads
  - Hotjar
  - Microsoft Clarity
  - Mixpanel
  - CallRail
  - Invoca
  - Simpli.fi
  - Bidtellect
  - Genius Monkey
  - Salesforce Evergage
  - Unbounce
  - UserWay
tags:
  - healthcare
  - hipaa
  - wordpress
  - call-tracking
  - no-consent
  - patient-portal
  - api-spec
  - membership
  - surveillance
  - ad-tech
headline: "The patient portal's 82-endpoint API spec sits in a public S3 bucket, documenting SSN fields, driver's licenses, and billing codes."
findings:
  - "The patient portal's complete OpenAPI schema sits in a publicly readable S3 bucket, documenting 82 endpoints including fields for SSN last 4, driver's license images, CPT4 procedure codes, and PHI communication preferences."
  - "Invoca's publicly accessible call tracking tag captures Facebook click IDs and Google click IDs per patient phone call -- linking ad identity to healthcare-seeking behavior and feeding it back to Google Analytics."
  - "The in-office check-in system authenticates patients using only medical record number and date of birth -- the credential model and custom API header are both documented in the public React bundle."
  - "No consent management platform on a HIPAA-covered healthcare site -- 12 tracking tools including two competing call tracking platforms and two session recorders fire on every page load before any user interaction."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

U.S. Dermatology Partners operates 287+ dermatology clinics across multiple US states. The website is the patient acquisition and scheduling front-end for a practice group that handles sensitive healthcare data -- diagnoses, procedures, insurance, and payment. The technical picture has two layers: a standard WordPress marketing stack and a separate, more complex patient portal with its own React frontend and Django REST API backend. Most of what's interesting is in the gap between how the site presents itself and what's actually running underneath.

## Infrastructure

The public site runs WordPress on WP Engine hosting, with Cloudflare as the CDN layer. Response headers expose both: `x-powered-by: WP Engine`, `x-cacheable: SHORT`, `x-cache: HIT: 1`, and `server: cloudflare`. The custom theme is `usdermcare`.

The scale is visible directly from the sitemap index at `https://www.usdermatologypartners.com/sitemap_index.xml`:
- 287 location URLs (`location-sitemap.xml`)
- 392 provider profiles (`provider-sitemap.xml`)
- 136 services (`service-sitemap.xml`)
- Geographic hierarchy: market, superlocation, city pages (4 sitemaps)
- Content: blog posts, location blogs, insurance pages, language pages, credentials

Plugins are partially identifiable from page source: Yoast SEO, MemberPress (subscription management), Quiz Survey Master (Fitzpatrick skin type quiz), Gravity Forms (appointment requests), iThemes Security Pro, WP Mail SMTP, metaslider, Redirection, Simple History, OTGS (translation). JS libraries: jQuery, Underscore.js, Modernizr.

The patient portal is an entirely separate stack: `myskinportal.usdermpartners.com` (React/Vite SPA, hosted on Netlify) backed by `api-myskinportal.usdermpartners.com` (Django REST API, nginx). Two separate GTM containers -- `GTM-PRBHLSX` on the marketing site, `GTM-PKQ65B8` inside the portal. Note that the portal runs on `usdermpartners.com`, a different base domain from the marketing site at `usdermatologypartners.com`.

## The Patient Portal's Public Blueprint

The most significant finding is structural rather than incidental: the S3 bucket `django-usdpapi-prod-public` hosts the patient portal's complete OpenAPI specification at a public URL with no authentication required.

```
https://django-usdpapi-prod-public.s3.amazonaws.com/static/openapi-schema.json
```

The schema documents 82 API endpoints. Confirmed accessible as of 2026-04-12 (HTTP 200, full JSON response). The same bucket also exposes `static/locales/en/translation.json` -- the full patient portal UI text, including consent language, financial policy text, HIPAA disclosure language, and form field labels.

What the schema documents:

**Patient data model (`UserMe` schema):**
- Full name (first, middle, last), DOB, sex, marital status, nickname
- Email, phone (cell and home), full address (line 1/2, city, state, zip)
- `driversLicense` -- URL field for stored driver's license image
- `last4Ssn` -- last 4 digits of SSN (`pattern: "^-?\\d+$"`, min/max 4)
- `preferredLanguage`
- `policyOnFile`, `isPolicyExpired`, `policyOnFileAt` -- financial consent tracking
- `blockedSms` -- flag indicating phone is blocked in SMS backend
- `howDidYouHearAboutUs` -- acquisition tracking, stored with the patient record

**Billing records (`Charge` schema):**
- `cpt4Code` -- CPT4 procedure code (standard medical billing code, identifies the medical procedure performed)
- `providerName`, `patientName`, `serviceDate`
- `charge`, `recptIns` (receipt from insurance), `recptPat` (receipt from patient), `insBalance`, `patBalance`, `adjustment`

**Full endpoint list (82 paths), including:**
- `/api/accounts/` -- patient account management including enrollment/unenrollment in programs
- `/api/appointments/` + `/api/appointments/upcoming/` + `/api/appointments/{id}/cancel/`
- `/api/credit-cards/` -- stored payment card management
- `/api/ehr-operations/sign-autopay-consent/` -- EHR autopay consent signing
- `/api/ereg/step/{step}/` -- multi-step electronic registration (0 through N)
- `/api/ereg/upload_drivers_license/start/`, `/local/`, `/finish/` -- driver's license image upload flow
- `/api/forms/` + `/api/forms/{id}/download_template/` -- patient forms management
- `/api/insurances/{id}/download_file/` -- insurance card file download
- `/api/logs/` + `/api/logs/download/` -- audit log access (includes `remoteAddr` per `LogEntry` schema)
- `/api/medical-records/` -- medical record access
- `/api/payments/` + `/api/payments/{id}/download/`
- `/api/profiles/phi_communication_preferences/` -- HIPAA PHI disclosure settings
- `/api/profiles/retrieve_consent/{consent}/` -- consent records
- `/api/profiles/treat_minors_consent/` -- parental consent for minor patients
- `/api/users/patients/` + `/api/users/employees/` -- user enumeration (authenticated)
- `/api/webhooks/sms/` -- inbound SMS webhook
- `/api/auth/office/login/` -- separate office-mode authentication

All data endpoints require JWT authentication and return 401 without a valid token. The schema's public availability doesn't expose patient data -- it exposes the complete map of what data exists and how it's structured. Combined with the authentication flows documented in the same schema, it's a full technical blueprint of the patient data system.

## Surveillance: No Consent, 12 Trackers

The marketing site has no consent management platform. No OneTrust, no Cookiebot, no Clarip, no custom banner. The only cookie-handling code is `jquery.cookie.js` from the custom theme. Every tracking tool fires immediately on page load, before any user interaction.

This is a HIPAA-covered healthcare provider. Patients visiting to research dermatology conditions or book appointments about potential skin cancer screenings are tracked by a full ad-tech stack from the moment the page loads.

**Cookies dropped on first page load (no consent):**
- `calltrk_referrer=direct` -- CallRail traffic source
- `calltrk_landing=https://www.usdermatologypartners.com/` -- landing page
- `calltrk_session_id=...` -- CallRail session identifier
- `calltrk_fcid=...` -- CallRail first-click ID
- `_gcl_au=...` -- Google Ads conversion tracking
- `tracking_params={"utm_source":"direct","utm_medium":"none","utm_campaign":"default_campaign"}` -- UTM capture
- `invoca_session={...}` -- Invoca call session
- `mp_f290bc576af7629e57767cad38e2a3dc_mixpanel={...}` -- Mixpanel device fingerprint

**Confirmed trackers active on page load (from network log and global variables):**

1. **Hotjar** (hjid: 1901009, loaded via GTM) -- session recording and heatmaps
2. **Invoca** (tag 3067/1987303453) -- call tracking and ad attribution
3. **CallRail** (company: 768319895, group: d637e2a32b3c7ec5dd13) -- second call tracking platform
4. **Mixpanel** (project token: `f290bc576af7629e57767cad38e2a3dc`) -- behavioral analytics, device fingerprinting on first load
5. **Google Analytics 4 / Google Ads** (conversion tag 435225174) -- POST /ccm/collect and POST /rmkt/collect/435225174/ fire on every page
6. **Simpli.fi** (company_id: 373305) -- programmatic advertising, pixel drops
7. **Bidtellect / bttrack.com** (goalId: 16179) -- programmatic display advertising, `GET /engagement/event` fires on load
8. **Genius Monkey** (id: 1028350621) -- programmatic display and video advertising
9. **Microsoft Clarity** -- session recording (loaded from www.clarity.ms, confirmed in CSP)
10. **Salesforce Evergage** (subdomain: `usdermatologypartners.us-7.evergage.com`) -- AI personalization; present in CSP (`cdn.evgnet.com`), `window.Evergage` not confirmed on homepage, likely conditional
11. **Unbounce** (account: 16931b5dde2b4d03a3c42be7bf2364b9) -- landing page builder with tracking
12. **UserWay** (account: pp20vSyZXu) -- accessibility widget; makes API calls to `api.userway.org` and `cdn.userway.org` on load

The CSP also includes `nextpatient.co` (patient scheduling/reminder platform) and `beacon-v2.helpscout.net` (Help Scout customer support) -- both present in the script-src directive but not confirmed in the homepage network log. Likely load on specific pages.

## Call Attribution Architecture

CallRail and Invoca both run simultaneously on every page. They serve the same function -- attributing inbound phone calls to the marketing campaigns that generated them -- and they do so in parallel, each with its own cookies and tracking identifiers.

**CallRail** performs number swapping: the JavaScript replaces the visible phone number on the page with a tracking number (`js.callrail.com` swap_session call on every page load). When a visitor calls, CallRail logs which number they dialed and associates it with their session cookies.

**Invoca** does the same thing at the tag level. Its configuration is publicly accessible at:
```
https://solutions.invocacdn.com/js/networks/3067/1987303453/tag-live.js
```

The tag config documents exactly what data Invoca captures per call:
- `_fbc` -- Facebook click ID cookie (sourced from cookie, not URL param)
- `gclid` -- Google click ID
- `msclkid` -- Microsoft/Bing click ID
- `gbraid`, `wbraid` -- Google Privacy Sandbox ad attribution signals
- `calling_page` -- exact URL + path the visitor was on when they called
- `landing_page` -- first URL the visitor saw in the session
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` -- full campaign attribution
- `city`, `state` -- geographic params from URL
- `customer_id` -- passed when available in URL params
- `disposition` -- call outcome (passed post-call)
- `destination_time_zone` -- clinic timezone
- `invoca_caller_language` -- browser language

Invoca also integrates back to Google Analytics: `automaticIntegrations` includes `googleAnalytics` (paramName: `g_cid`), `gaMeasurementId`, and `gaSessionId` -- linking GA sessions to call attribution events. The tag caches call attribution data in cookies for 30 days.

The practical result: every inbound patient phone call generates independent tracking records in CallRail, Invoca, and Google Analytics simultaneously. The Invoca record includes the caller's Facebook click ID when one is present -- linking the ad click identity to the healthcare-seeking phone behavior. Invoca requires these params for call processing: `requiredParams: {"gclid":"*","msclkid":"*","fbclid":"*","gbraid":"*","wbraid":"*"}`.

Both session recording tools (Hotjar and Microsoft Clarity) also run simultaneously, creating another duplication layer.

## Portal Authentication Models

The patient portal has two distinct authentication systems documented in the OpenAPI schema.

**Patient portal activation (3-step OTP flow):**
1. `POST /api/auth/otp/request/` -- takes `{firstName, lastName, dob}` (dob format: MM/DD/YYYY). Returns `{label, value}` token if a patient record is found, or `{"detail":"N2"}` (no match). This endpoint requires no authentication.
2. `POST /api/auth/otp/send/` -- takes `{token}` and sends OTP to the phone number on file for that patient record
3. `POST /api/auth/otp/verify/` -- takes `{token, pin}` and returns JWT

The OTP activation flow is designed for first-time portal access by an existing patient. The `OTPRequest` schema also accepts an optional `phone` field (last 4 digits) as an additional disambiguator.

**Standard login:**
`POST /api/auth/login/` -- username/email + password, returns JWT. The login endpoint supports POST with username (optional), email (optional), password (required).

**Office check-in system (`officelogin.usdermpartners.com`):**
The in-office tablet/kiosk interface for patient arrival. The `Input` schema (from the OpenAPI spec, shared between portal and office systems) defines the credential as: `{mrn: integer, dob: date}`. Medical record number plus date of birth. No password, no OTP.

The tRPC backend (`api-officelogin.usdermpartners.com/trcp`) requires:
- Origin from `officelogin.usdermpartners.com`
- Custom header `X-Requested-With: usdp` (the value is exposed in the office login React bundle as `VITE_BFF_X_REQUESTED_WITH`)
- IP whitelist (returns 403 from external IPs)

The IP restriction is the meaningful protection here. The MRN + DOB credential is a weak proof-of-identity appropriate for clinic-internal use, where staff are present. The `VITE_BFF_X_REQUESTED_WITH: "usdp"` value being in the public bundle means the custom header provides no security -- it's documentation of an assumption, not a secret.

## WordPress API Surface

The site uses a Disable REST API (DRA) plugin to block most `wp/v2` endpoints. Requests to `/wp-json/wp/v2/users/`, `/wp-json/wp/v2/categories/`, `/wp-json/wp/v2/media/`, and others return 401 `rest_forbidden`.

**Exception: `/wp-json/wp/v2/posts` is publicly accessible.** Returns full post content, excerpts, featured media IDs, category IDs, author IDs, and ACF fields. Author IDs are integers (e.g., 81, 9) -- not resolvable to names via REST (users endpoint is blocked), but the numeric IDs are present.

The iThemes Security namespace (`/wp-json/ithemes-security/v1/`) exposes its route index publicly, revealing what security features are configured:
- `/bans` -- IP banning
- `/modules` -- security module list
- `/settings` -- security settings
- `/logs` -- security event logs
- `/lockouts` -- account lockouts
- `/geolocate/{ip}` -- IP geolocation
- `/dashboard/events` -- event dashboard
- `/firewall/rules` -- firewall rule management
- `/user-groups` -- user group configuration
- `/strong-passwords/scan` -- password strength scanner
- `/site-scanner/scans` + `/site-scanner/vulnerabilities` -- vulnerability scanner

All actual endpoint data returns 401. The route index is public -- it reveals which security modules are active without exposing any data.

Other accessible namespaces (all return route lists or minimal responses): `yoast/v1`, `wpe/cache-plugin/v1`, `wpe_sign_on_plugin/v1`, `quiz-survey-master/v1` (questions endpoint returns 401).

## Cosmetic Membership Program

A cosmetic membership subscription program runs at select locations, managed via MemberPress. Pricing confirmed at Plano, TX:

**PLUS -- $150/month** (6-month minimum)
- 1 treatment/month from: Light Chemical Peel with Dermaplaning ($310 value), HydraFacial Signature ($200), Laser Hair Removal Small ($175)
- 10% off all products and treatments

**ADVANCED -- $250/month** (6-month minimum)
- Botox 25 units ($350 value), Dysport 70 units ($350), HydraFacial Deluxe ($300), Laser Hair Removal Medium ($380)
- 15% off. Botox/Dysport limited to 3 treatments per year.

**PLATINUM -- $350/month** (6-month minimum)
- Any service from any tier, 1 free filler syringe (with 2 purchased), IPL ($525 value), Microneedling ($400), VI Body Peel ($450)
- 15% off

All tiers: 6-month minimum, auto-renewing, non-transferable across locations.

The sitemap includes `memberpressproduct-sitemap.xml` and `memberpressgroup-sitemap.xml`, and the program slugs (`vip-plus-membership`, `vip-platinum-membership`, `vip-advanced-membership`) appear in the XML. All three URLs return 404 -- the program was renamed or restructured, leaving stale sitemap entries pointing to dead URLs.

## Subdomain Inventory

SSL certificate transparency (`crt.sh`) reveals 13 subdomains on `usdermpartners.com`:

**Patient-facing:**
- `myskinportal.usdermpartners.com` -- patient portal (Netlify, React/Vite)
- `api-myskinportal.usdermpartners.com` -- portal API (Django, nginx)
- `pwreset.usdermpartners.com` -- password reset portal

**Internal / staff-facing:**
- `officelogin.usdermpartners.com` -- in-office check-in kiosk (Netlify, React/Vite)
- `api-officelogin.usdermpartners.com` -- office check-in tRPC API (nginx, 403 from external IPs)
- `admin-myskinportal.usdermpartners.com` -- admin panel (Netlify, 200 but navigation aborted -- likely WAF or IP restricted)
- `intranet.usdermpartners.com` / `intranet-cms.usdermpartners.com` -- internal CMS (no response / IP restricted)
- `support.usdermpartners.com` -- support portal
- `cpanel.usdermpartners.com` -- cPanel hosting panel

**Salesforce Marketing Cloud email infrastructure:**
- `click.e.usdermpartners.com`
- `view.e.usdermpartners.com`
- `image.e.usdermpartners.com`
- `cloud.e.usdermpartners.com`

These are standard Salesforce ExactTarget CNAME patterns. Every patient email sent by USDP generates click/open tracking events through these subdomains, linking email engagement activity to Salesforce CRM records. The cert also includes `san-10-s11.tlsprovisioning.exacttarget.com` -- the underlying Salesforce Marketing Cloud infrastructure.

**Unknown services:**
- `pde.usdermpartners.com`, `pss.usdermpartners.com` -- purpose unknown from cert alone
- `rcxapp.usdermpartners.com`, `rcxtest.usdermpartners.com` -- app with a test environment (suffix suggests RCx could be "revenue cycle")

## Machine Briefing

**Access & auth**

The marketing site (`www.usdermatologypartners.com`) requires no auth for page access. Most WordPress REST endpoints are blocked by DRA plugin; `wp/v2/posts` is the open exception.

The patient portal API (`api-myskinportal.usdermpartners.com`) requires JWT bearer tokens for all data endpoints. The `/ping/` endpoint returns `{"message":"It's alive!"}` without auth. The OTP activation flow (`/api/auth/otp/request/`) accepts unauthenticated POST requests.

**Endpoints**

Open (no auth):
```bash
# Patient portal health check
curl https://api-myskinportal.usdermpartners.com/ping/

# Full API spec
curl https://django-usdpapi-prod-public.s3.amazonaws.com/static/openapi-schema.json

# Portal UI strings and consent text
curl https://django-usdpapi-prod-public.s3.amazonaws.com/static/locales/en/translation.json

# WordPress blog posts (full content)
curl "https://www.usdermatologypartners.com/wp-json/wp/v2/posts?per_page=10"

# iThemes Security route index (no data, just route names)
curl https://www.usdermatologypartners.com/wp-json/ithemes-security/v1/

# Invoca call tracking tag config
curl https://solutions.invocacdn.com/js/networks/3067/1987303453/tag-live.js

# Sitemap index
curl https://www.usdermatologypartners.com/sitemap_index.xml
```

OTP activation flow (no auth, unauthenticated patient lookup):
```bash
# Step 1: Request OTP token -- returns token if patient found, {"detail":"N2"} if not
curl -X POST https://api-myskinportal.usdermpartners.com/api/auth/otp/request/ \
  -H "Content-Type: application/json" \
  -d '{"firstName":"...", "lastName":"...", "dob":"MM/DD/YYYY"}'

# Step 2: Send OTP to phone on file
curl -X POST https://api-myskinportal.usdermpartners.com/api/auth/otp/send/ \
  -H "Content-Type: application/json" \
  -d '{"token":"..."}'

# Step 3: Verify pin, receive JWT
curl -X POST https://api-myskinportal.usdermpartners.com/api/auth/otp/verify/ \
  -H "Content-Type: application/json" \
  -d '{"token":"...", "pin":"..."}'
```

Standard portal login (returns JWT):
```bash
curl -X POST https://api-myskinportal.usdermpartners.com/api/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"username":"...", "password":"..."}'
```

Authenticated endpoints (JWT bearer required):
```bash
# All data endpoints -- substitute JWT from login response
curl https://api-myskinportal.usdermpartners.com/api/appointments/ \
  -H "Authorization: Bearer <JWT>"

curl https://api-myskinportal.usdermpartners.com/api/profiles/personal_information/ \
  -H "Authorization: Bearer <JWT>"

curl https://api-myskinportal.usdermpartners.com/api/medical-records/ \
  -H "Authorization: Bearer <JWT>"
```

**Gotchas**

- OTP endpoint dob format is `MM/DD/YYYY` -- not ISO format. The schema says `format: date` but the validation error on wrong format returns `"Date has wrong format. Use one of these formats instead: MM/DD/YYYY."` The schema and the validator are inconsistent.
- WordPress REST API returns 401 for most `wp/v2` paths -- only `wp/v2/posts` is accessible.
- Office check-in API (`api-officelogin.usdermpartners.com/trcp`) requires `Origin: https://officelogin.usdermpartners.com` and `X-Requested-With: usdp` headers, and is IP-whitelisted. The CORS origin check and custom header are in the public React bundle -- but IP whitelist blocks external requests regardless.
- JWT tokens are refreshable at `/api/auth/token/refresh/` (takes `{refresh}` token).
- Patient portal API has no version prefix -- all paths are `/api/...`.
- Portal runs on `usdermpartners.com`, not `usdermatologypartners.com` -- different base domain from the marketing site.
