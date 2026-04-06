---
# agents: machine-friendly instructions in "## Machine Briefing"
title: California DMV — Teardown
url: "https://www.dmv.ca.gov"
company: California DMV
industry: Government
description: "California state agency for driver licenses, vehicle registration, and ID cards."
summary: "dmv.ca.gov runs a five-layer stack: F5 Volterra ADC fronts CloudFront, which routes to AWS ALB, IBM ISAM WebSEAL reverse proxy, and finally WordPress 6.9.4 (portal) or Java transaction apps (wasapp/shoppingcart). The WordPress REST API is publicly accessible with 8 namespaces and custom DMV endpoints for field offices, insurance lookup, and a 2,840-item document library. A misconfigured IBM ISAM proxy causes multiple WP REST endpoints to return internal error pages instead of JSON. GTM loads 16 trackers including Hotjar, Facebook pixel, Twitter pixel, and Google Ads with no consent management platform."
date: 2026-04-05
time: "00:28"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack: ["WordPress", "IBM ISAM", "AWS CloudFront", "F5 Volterra", "Java", "Google Tag Manager"]
trackers: ["Google Analytics 4", "Google Analytics UA", "Google Tag Manager", "Google Optimize", "ABTasty", "Hotjar", "Medallia", "Glance Cobrowse", "Facebook Pixel", "Twitter Pixel", "Google Ads", "IP Geolocation", "LexisNexis ThreatMetrix", "Google reCAPTCHA"]
tags: ["government", "wordpress", "ibm-isam", "open-api", "session-recording", "no-consent", "av-data", "surveillance", "mobile-id", "java"]
headline: "Hotjar session recording runs on the page where drivers enter their plate number and VIN to renew registration, with no consent prompt on the site."
findings:
  - "When a vehicle is ineligible for online renewal, the page sends the driver's VIN and plate number as plaintext URL parameters to a third-party virtual assistant hosted on a separate Microsoft IIS server."
  - "Facebook pixel, Twitter/X pixel, and Google Ads conversion tracking fire on a government site with no cookie banner and no consent management platform — ad networks see who visits the DMV."
  - "Multiple WordPress REST endpoints return an internal IBM ISAM error page branded 'Plumtree' instead of JSON, exposing the proxy architecture and leaving all WP site-health checks dead in production."
  - "The WordPress file manager endpoint exposes 2,840 public documents including autonomous vehicle daily incident reports from Waymo and Zoox, with predictable slug patterns and no authentication."
  - "A JS assignment bug in the vehicle registration system (if (msg = 'CloseModal') instead of ===) means any postMessage event from the virtual assistant dismisses the ineligibility modal, regardless of content."
---

## Architecture

www.dmv.ca.gov redirects to www.dmv.ca.gov/portal/ — a WordPress 6.9.4 installation. The full delivery stack from edge to application:

1. **F5 Volterra ADC** — identified by `server: volt-adc` and `x-volterra-location` headers (values: `prd1/prd2/sv10-sjc/wes-sea`). Active/active confirmed via `on-ws: prd1` and `on-ws: prd2` across requests.
2. **AWS CloudFront** — identified by `x-cache: Miss from cloudfront`, `via: 1.1 [hash].cloudfront.net (CloudFront)`, `x-amz-cf-pop: SFO53-P2`. Cache misses on every observed request.
3. **AWS ALB** — sets `AWSALB` and `AWSALBCORS` sticky-session cookies (7-day expiry) for backend affinity.
4. **IBM ISAM WebSEAL** — reverse proxy acting as authentication gateway at the root. Sets `TS01dc4fc6` cookie (IBM ISAM / BigIP session). The root `/` is intercepted by WebSEAL; unauthenticated requests receive `iv_user=unauthorized` as a cookie on the response. There is no `robots.txt` at root — requesting it returns the IBM ISAM login page HTML.
5. **Application backends** — four distinct systems routed by path:
   - `/portal/` — WordPress 6.9.4 (PHP)
   - `/wasapp/` — Java transaction applications (vehicle registration renewal, ICA)
   - `/shoppingcart/` — Java e-commerce system (JSESSIONID-based payment flow)
   - `/mga/` and `/isam/` — IBM Security Access Manager OAuth/OIDC endpoints

The SSL certificate is a wildcard: `*.dmv.ca.gov` and `dmv.ca.gov`. HSTS is enforced (`max-age=31536000; includeSubDomains`). `X-Frame-Options: SAMEORIGIN` is set globally. The Content-Security-Policy is minimal — `frame-ancestors 'self' https://*.dmv.ca.gov` only; no `script-src` restriction.

**P3P header** appears on every response: `CP="NON CUR OTPi OUR NOR UNI"`. P3P (Platform for Privacy Preferences Project) was abandoned by major browsers in 2018 — this header is vestigial and meaningless in modern browsers but has not been removed.

The portal homepage sets cookies before any user interaction: `iv_user=unauthorized` (IBM ISAM auth status), `AWSALB`/`AWSALBCORS` (ALB stickiness), `TS01dc4fc6` (IBM ISAM), `ABTasty`/`ABTastySession` (A/B testing), and the Medallia suite (`kampyle_userid`, `kampyleUserSession`, `kampyleUserSessionsCount`, `kampyleUserPercentile`, `kampyleSessionPageCounter`). Google Analytics sets `_ga`, `_ga_006F1FGTXR`, `_ga_69TD0KNT0F`. All fire without consent prompt.

### Subdomains

| Subdomain | Stack | Purpose |
|---|---|---|
| `cdn.dmv.ca.gov` | S3 + CloudFront | Design system assets, favicons, CSS, JS |
| `sa.dmv.ca.gov` | ASP.NET / IIS | Virtual assistant, transaction scripts, NOHOLD chatbot files |
| `deviceauth.dmv.ca.gov` | Apache | LexisNexis ThreatMetrix device auth endpoint for mDL wallet login |
| `uat.dmv.ca.gov` | CloudFront | 403 — exists, IP-restricted |
| `api.dmv.ca.gov` | AWS API Gateway | 403 ForbiddenException — inferred mobile app backend |
| `realid.dmv.ca.gov` | (referenced in GTM) | REAL ID application flow |

The GTM container (GTM-KHCVGH4) contains a regex predicate matching staging/dev subdomains used to suppress certain tags in non-production environments: `edl-stg.dmv.ca.gov|ada.edl-stg.dmv.ca.gov|tst.edl-stg.dmv.ca.gov|edl-dev.dmv.ca.gov|ada.edl-dev.dmv.ca.gov|tst.edl-dev.dmv.ca.gov|edl-test.dmv.ca.gov|ada.edl-test.dmv.ca.gov|tst.edl-test.dmv.ca.gov|ada.edl.dmv.ca.gov|tst.edl.dmv.ca.gov`. These are the Electronic Driver's License (EDL) environment hostnames — not accessible publicly but named in the production GTM container.

### WordPress Stack

WordPress 6.9.4 (confirmed via RSS generator tag). Plugins confirmed via WP REST API namespace enumeration:

- **ElasticPress** — Elasticsearch integration for site search
- **Yoast SEO v27.2** — SEO management
- **TranslatePress 3.1.3** — multilingual support
- **Two-Factor** (two-factor/1.0 namespace) — 2FA for WP admin accounts
- **DMV Service Advisor** — custom plugin serving the NOHOLD chatbot
- **dmv-chatbot** — custom chatbot integration
- **Block Library** — custom Gutenberg block plugin

Custom post types registered: `dmv_field-office`, `dmv_file-manager`, `dmv_popup`, `dmv_forms`, `dmv_handbook`, `dmv_partner_company`.

The WP users endpoint (`/portal/wp-json/wp/v2/users`) returns `{"code":"rest_no_route","message":"No route was found..."}` — user enumeration is blocked.

---

## WordPress REST API

The REST API at `/portal/wp-json/` is publicly accessible with 8 registered namespaces. DMV-custom endpoints (`dmv/v1`) are unauthenticated and return structured data.

### Field Offices — GPS Coordinates and Internal IDs

`GET /portal/wp-json/wp/v2/dmv_field-office?per_page=100`

Returns up to 100 DMV field office records per page. Each record includes:
- `meta.dmv_field_office_public_id` — opaque internal identifier (e.g., `068!e7f70121ac051f36ef04c13362228cc70e56c955ea91789659bc0ed8301b`)
- `meta.dmv_field_office_latitude` / `dmv_field_office_longitude` — GPS coordinates to 6 decimal places
- `meta.dmv_field_office_street`, `dmv_field_office_city`, `dmv_field_office_zipcode`
- `meta.dmv_field_office_hours` — full weekly schedule per office
- `class_list` — taxonomy terms including service types (`dmv_services-cdl-medical`, `dmv_services-dl-retest`, `dmv_services-duplicate-title`, etc.) and payment options (`dmv_payment_option-credit-card`, `dmv_payment_option-debit-card`)

No authentication required. 100+ offices accessible by paginating `page=1`, `page=2`, etc.

### NAIC Insurance Lookup

`GET /portal/wp-json/dmv/v1/naic-lookup?s={query}`

Returns NAIC (National Association of Insurance Commissioners) codes and insurer names matching the search string. No auth. Sample response for `s=allstate`:

```json
[
  {"naic":"19232","insurer":"Allstate Ins Co"},
  {"naic":"17230","insurer":"AllState Property and Casualty"},
  {"naic":"19240","insurer":"Allstate Indemnity"},
  {"naic":"36455","insurer":"Allstate Northbrook Ind Co"},
  {"naic":"10358","insurer":"Encompass Ins Co"},
  {"naic":"37907","insurer":"Allstate Vehicle and Property Insurance"}
]
```

### City/ZIP Lookup

`GET /portal/wp-json/dmv/v1/cities` — all 2,587 California city+ZIP entries as a flat array (`["Long Beach 90899", "Los Angeles 90001", ...]`). No auth.

### Lien Lookup

`GET /portal/wp-json/dmv/v1/lien-lookup?query={}&g-recaptcha-token={}` — vehicle lien lookup, reCAPTCHA v3 token required. Without a valid token: `{"code":"rest_missing_callback_param","message":"Missing parameter(s): query, g-recaptcha-token","data":{"status":400}}`.

### Document Library

`GET /portal/wp-json/wp/v2/dmv_file-manager?per_page=100`

The `dmv_file-manager` custom post type contains 2,840 items across 29 pages (`X-WP-Total: 2840`, `X-WP-TotalPages: 29`). No authentication required. Content by type:

- Autonomous vehicle daily incident reports — Waymo and Zoox, going back years. Most recent at investigation: `Waymo_031826` (2026-03-30), `Zoox_031626` (2026-03-30). Older entries distinguish redacted from unredacted variants (e.g., `Waymo_020626_Redacted` vs `Waymo_031826`). Slugs follow a predictable naming convention (`waymo_MMDDYY-pdf`, `zoox_MMDDYY-pdf`).
- Regulatory documents: ISOR, FSOR, adopted regulatory text (2025-0127-01SR, 2026-0210-01 series)
- Driver statistics PDFs (estimated driver's license counts by age/gender)
- ELT (Electronic Lien and Title) institutional listings
- Standard forms: vessel title transfer, out-of-state title transfer, REG-256, DL-600, etc.
- Driver handbooks in multiple languages

### CORS Policy

REST API responses carry `Access-Control-Allow-Origin: https://www.dmv.ca.gov` — properly restricted. Exception: the NOHOLD chatbot endpoint at `/portal/service-advisor/DMV/ukpx.aspx` returns `Access-Control-Allow-Origin: *`, making it cross-origin readable from any domain.

---

## IBM ISAM WebSEAL Proxy Misconfiguration

IBM ISAM WebSEAL acts as a reverse proxy in front of all backends. When a request passes through a WebSEAL "junction" (a proxied backend connection) and the backend responds with an authentication challenge, WebSEAL surfaces its own internal error page rather than passing the response through.

This pattern is systematic across multiple WP REST endpoints that require elevated WordPress permissions but are reachable from the public internet:

| Endpoint | Expected response | Actual response |
|---|---|---|
| `/portal/wp-json/elasticpress/v1/pointer_search?s=license` | Search results JSON | IBM ISAM HTML error page |
| `/portal/wp-json/wp-site-health/v1/tests/background-updates` | WP health status JSON | IBM ISAM HTML error page |
| `/portal/wp-json/wp-site-health/v1/tests/https-status` | WP health status JSON | IBM ISAM HTML error page |
| `/portal/wp-json/wp-site-health/v1/tests/loopback-requests` | WP health status JSON | IBM ISAM HTML error page |
| `/portal/wp-json/wp-site-health/v1/directory-sizes` | Directory info JSON | IBM ISAM HTML error page |
| `/portal/wp-json/wp/v2/pages/{id}/revisions` | Page revision JSON | IBM ISAM HTML error page |

The error page is branded "Plumtree" — IBM acquired Plumtree Software in 2006, and its portal platform was the predecessor to IBM WebSphere Portal. The HTML uses XHTML 1.0 Strict with the Plumtree XML namespace (`xmlns:pt="http://www.plumtree.com/xmlschemas/ptui/"`). Title: "Unexpected Authentication Challenge."

The practical consequence: WordPress site health check endpoints are all dead. WP's built-in background update verification, HTTPS status checks, and loopback request tests cannot complete — WebSEAL intercepts them before they reach WordPress. A WP admin running the Site Health dashboard would see failures that originate in the proxy layer, not WordPress itself.

---

## Transaction System: wasapp

The Java transaction system at `/wasapp/` handles vehicle registration renewal and other DMV transactions using a Struts-like `.do` endpoint pattern. The URL scheme exposes the application structure: `start.do`, `retreiveRenewalInfo.do`, `vrSubmit.do`, `dlSubmit.do`.

### Vehicle Registration Renewal (/wasapp/vrir/)

The renewal form shell loads from `/wasapp/vrir/start.do?localeName=en`. It loads the DMV design system from `cdn.dmv.ca.gov`, GTM (GTM-KHCVGH4), and Google Optimize (GTM-5BSDFST). Form fields: plate number (maxlength=8) and last 5 VIN digits (maxlength=5).

The ineligibility logic lives in `vrir_ec.js` (served from `sa.dmv.ca.gov/DMV/Uploads/vrir_ec.js`). When a vehicle is ineligible for online renewal, the script constructs a URL to the NOHOLD virtual assistant:

```
https://sa.dmv.ca.gov/DMV/login.aspx?pid=12&login=1&ruleid=446
  &InelSource={source}
  &InelVin={vin}
  &InelPlate={plate}
  &InelCD={disqualifying_condition_codes}
  &InelCC={condition_codes}
```

VIN and plate number are passed as plaintext URL query parameters. The URL loads in a hidden `<iframe>` embedded on the renewal page. Rule 446 fires when condition codes include `032` or `033` — the business logic for specific disqualifying codes (`016`, `032`, `033`) is fully visible in the client-side code.

**JS assignment bug** at line 198 of `vrir_ec.js`:

```js
if (msg = "CloseModal") {  // assignment, not comparison — always truthy
```

Should be `===`. As written, the condition always evaluates truthy (the assignment returns the string, which is truthy), so any `message` event received from `sa.dmv.ca.gov` dismisses the ineligibility overlay modal regardless of message content. The surrounding comment `//07 Test Run QM iFrame resize` indicates the file has been through iterative testing.

### Shopping Cart (/shoppingcart/)

Payment processing at `/shoppingcart/shoppingCartApplication.do`. JSESSIONID session management — older Java EE pattern. GTM tracks payment completion at `/shoppingcart/submitECheckPayment.do` and `/shoppingcart/cardPaymentApproved.do`.

---

## Tracking and Surveillance

dmv.ca.gov has no consent management platform. No cookie banner, no opt-in prompt, no consent gate. All 16 trackers fire on page load or early page interaction.

### Tracker Inventory

| # | Vendor | ID / Config | Scope |
|---|---|---|---|
| 1 | Google Analytics 4 | G-006F1FGTXR | Portal + wasapp |
| 2 | Google Analytics 4 | G-69TD0KNT0F | Portal + wasapp |
| 3 | Google Analytics UA | UA-3419582-34 | Portal + wasapp (legacy, still firing alongside GA4) |
| 4 | Google Tag Manager | GTM-KHCVGH4 | Portal + wasapp |
| 5 | Google Optimize | GTM-5BSDFST | Portal + wasapp (A/B testing, nested GTM container) |
| 6 | ABTasty | f09111c8761c0b9198a6268eb84c2839 | Portal |
| 7 | Hotjar | hjid=1388900, sv=7 | Portal; inferred on wasapp via GTM |
| 8 | Medallia (Kampyle) | account 96387 | Every page |
| 9 | Glance Cobrowse | group=24498, v6.51.0.1889788291 | Portal only |
| 10 | IP Geolocation | api.ipgeolocation.io via GTM | wasapp/vrir (returns 429 — rate-limited) |
| 11 | Facebook Pixel | (in GTM) | Form submission tracking |
| 12 | Twitter/X Website Tag | (in GTM) | Conversion tracking |
| 13 | Google Ads / DoubleClick | ad.doubleclick.net | View-through conversion |
| 14 | LexisNexis ThreatMetrix | orgId: 7etjlrp1, deviceauth.dmv.ca.gov | mDL wallet login only (inferred) |
| 15 | Google reCAPTCHA v3 | sitekey: 6LdT4q8qAAAAAGvxH1XrqEEMUfOgBLyl2EGWr9Zy | wasapp/vrir, lien lookup |
| 16 | Google Translate | translate.googleapis.com | All portal pages |

All three analytics properties (two GA4 + legacy UA) fire independently on the same pageview — visits are triple-counted.

The `ABTasty` cookie sets a persistent UID (`uid=gq2p9ywe54sph1sr` in observed session) tracking the visitor across sessions. Medallia sets `kampyle_userid` (UUID format: `be45-32a1-279e-953d-7839-29b2-a28a-08e5` in observed session). Both persist without consent.

### GTM Transaction Tracking

The container includes triggers for payment/transaction completion URLs:

- `/shoppingcart/submitECheckPayment.do` — eCheck payment
- `/shoppingcart/cardPaymentApproved.do` — card payment approval
- `/wasapp/ica/vrSubmit.do` — vehicle registration submission
- `/wasapp/ica/dlSubmit.do` — driver's license submission

Each triggers GA4 conversion events. The full checkout funnel — from renewal start to payment confirmation — is instrumented.

### DataLayer

Portal pushes on load:

```json
{"task": "", "funcType": "landing,service portal", "conLang": "en_US"}
```

The `funcType` field appears to classify page type. The REAL ID decision tree pushes additional events; the appointment confirmation (`/confirmAppt.do`) is explicitly tracked in GTM triggers.

### IP Geolocation via GTM

A custom GTM tag calls `api.ipgeolocation.io` using the jQuery IP Geolocation SDK (`cdn.jsdelivr.net/npm/ip-geolocation-api-jquery-sdk`). The tag is configured to hash IP addresses before pushing to the dataLayer. It fires on transaction pages (wasapp/vrir). On the observed visit it returned HTTP 429 — the API key has insufficient quota for the request volume, meaning the geolocation is rate-limited in production.

---

## Mobile Driver's License Infrastructure

California has an active mDL deployment. The infrastructure spans multiple DMV systems:

- **CA DMV Wallet OIDC login** at `/isam/sps/oidc/rp/dmv_rp/kickoff/opencred` — uses the OpenCred protocol for mobile credential verification (inferred from investigator notes; login page HTML not in saved evidence)
- **Samsung Wallet integration** — referenced in portal content
- **LexisNexis ThreatMetrix device fingerprinting** — fires when `PartnerId=ca-dmv-wallet` is present in the login flow. Creates a `lnSessionId` UUID and transmits a device fingerprint to `deviceauth.dmv.ca.gov` with `orgId: 7etjlrp1` (inferred from investigator notes)
- **Digital signature verification** for DL/ID cards — document uploaded to file manager March 2026

`deviceauth.dmv.ca.gov` runs Apache and is a dedicated ThreatMetrix endpoint — separate infrastructure from the main stack, handling risk scoring for wallet authentication.

---

## Security Notes

**No vulnerability disclosure program.** No `security.txt` at `https://www.dmv.ca.gov/.well-known/security.txt` (S3 NoSuchKey 404) or `https://www.dmv.ca.gov/portal/.well-known/security.txt` (WordPress 404). No published security contact.

**api.dmv.ca.gov** is an active AWS API Gateway endpoint. All requests return HTTP 403 with `x-amzn-errortype: ForbiddenException` and `x-amz-apigw-id` set — live but fully gated. Likely the mobile app backend for the CA DMV Wallet.

**Password length cap** — IBM ISAM login enforces `maxlength=20` on the password field (inferred from investigator notes; login page not in saved evidence). Twenty characters is the IBM ISAM default and limits password entropy for the MyDMV portal serving California's registered driver population.

**P3P header** on every response: `CP="NON CUR OTPi OUR NOR UNI"`. Abandoned by browser vendors in 2018, has no effect on modern clients. Vestigial deployment artifact.

---

## Machine Briefing

### Access & Auth

The portal (`/portal/`) and all WP REST API routes are fully anonymous — no session or token needed. Use standard `curl` or `fetch`. The root domain (`/`) is gated by IBM ISAM WebSEAL; enumerate nothing there. Transaction endpoints at `/wasapp/` require a server-side form session and cannot be called directly.

The NOHOLD chatbot at `/portal/service-advisor/DMV/ukpx.aspx` has `Access-Control-Allow-Origin: *` — cross-origin callable.

### Open Endpoints (no auth required)

```bash
# Field offices: GPS, hours, services, payment options
GET https://www.dmv.ca.gov/portal/wp-json/wp/v2/dmv_field-office?per_page=100&page=1

# Document library: AV incident reports, regulatory filings, forms
GET https://www.dmv.ca.gov/portal/wp-json/wp/v2/dmv_file-manager?per_page=100&page=1

# Insurance company NAIC code lookup
GET https://www.dmv.ca.gov/portal/wp-json/dmv/v1/naic-lookup?s=allstate

# California city + ZIP list (2,587 entries, single response)
GET https://www.dmv.ca.gov/portal/wp-json/dmv/v1/cities

# WP REST API root: namespace and route discovery
GET https://www.dmv.ca.gov/portal/wp-json/

# DMV popup content, forms metadata, handbook, partner taxonomy
GET https://www.dmv.ca.gov/portal/wp-json/wp/v2/dmv_popup
GET https://www.dmv.ca.gov/portal/wp-json/wp/v2/dmv_forms
GET https://www.dmv.ca.gov/portal/wp-json/wp/v2/dmv_handbook
GET https://www.dmv.ca.gov/portal/wp-json/wp/v2/dmv_partner_company
```

### Lien Lookup (reCAPTCHA required)

```bash
# reCAPTCHA v3 sitekey: 6LdT4q8qAAAAAGvxH1XrqEEMUfOgBLyl2EGWr9Zy
GET https://www.dmv.ca.gov/portal/wp-json/dmv/v1/lien-lookup?query={plate_or_vin}&g-recaptcha-token={token}
```

### Endpoints That Return IBM ISAM Errors (not usable)

```bash
# These return Plumtree/IBM ISAM HTML, not JSON — broken by proxy misconfiguration:
GET https://www.dmv.ca.gov/portal/wp-json/elasticpress/v1/pointer_search?s=test
GET https://www.dmv.ca.gov/portal/wp-json/wp-site-health/v1/tests/https-status
GET https://www.dmv.ca.gov/portal/wp-json/wp-site-health/v1/tests/background-updates
GET https://www.dmv.ca.gov/portal/wp-json/wp-site-health/v1/tests/loopback-requests
GET https://www.dmv.ca.gov/portal/wp-json/wp-site-health/v1/directory-sizes
```

### Gotchas

- `X-WP-Total` and `X-WP-TotalPages` response headers on list endpoints — use `per_page=100` (max) to minimize pages. The file manager has 2,840 items across 29 pages.
- `dmv_file-manager` slug naming follows `{operator}_{MMDDYY}-pdf` pattern for AV incident reports. Predictable for targeted fetches.
- Actual PDFs are at `https://www.dmv.ca.gov/portal/wp-content/uploads/` — the file manager API gives metadata (title, slug, date) but not the direct PDF URL. The URL must be constructed from the slug or the post link.
- The portal WP REST API CORS restricts browser cross-origin requests to `https://www.dmv.ca.gov`. Use server-side or `curl`.
- `api.ipgeolocation.io` in GTM returns 429 — do not treat this as a usable endpoint.
- The portal uses `PD_STATEFUL_0531fc7e-9a22-11ea-bf4d-fa163e384dc6` (F5/Volterra stateful session cookie) on portal pages — set automatically, no manual handling needed for anonymous requests.
