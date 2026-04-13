---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "MySchoolBucks \u2014 Teardown"
url: "https://www.myschoolbucks.com"
company: MySchoolBucks
industry: Education
description: "K-12 school payment platform for lunch accounts, fees, and activities."
summary: "MySchoolBucks is a Java/JSP server-rendered web app behind an F5 Volterra ADC/WAF, with authentication handled by self-hosted Keycloak at login.myschoolbucks.com. The product suite spans five sub-products (MealViewer, MSB Activities, MSB Tickets, MSB Apps, Heartland Mosaic) on separate Azure-hosted backends. Pendo product analytics is routed through a custom first-party GCS-backed subdomain at content.analytics.myschoolbucks.com, and OneTrust is configured as GDPR-type consent applied globally with SkipGeolocation."
date: "2026-04-12"
time: "21:29"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack:
  - Java/JSP
  - Keycloak
  - Bootstrap
  - Azure App Service
  - F5 Volterra
trackers:
  - Google Analytics 4
  - Google Tag Manager
  - Pendo
  - OneTrust
tags:
  - edtech
  - k12
  - school-payments
  - children
  - pendo
  - first-party-proxy
  - saml
  - pre-consent-tracking
  - gpc-gap
  - keycloak
headline: "Pendo delivers all 151 admin guides to anonymous visitors — including payment gateway config and an unreleased promo codes feature."
findings:
  - "The Keycloak login page renders 627 school district SAML SSO entries in unauthenticated HTML, hidden only by CSS — the complete client directory is available to any HTTP request."
  - "Pendo product analytics loads from content.analytics.myschoolbucks.com, a first-party subdomain backed by Google Cloud Storage, routing around any blocker that filters pendo.io."
  - "The privacy policy states twice that GPC signals are honored, but the OneTrust config reads IsGPPEnabled: false and GCEnable: false, and the runtime cookie confirms isGpcEnabled=0."
  - "GA4 fires on first page load with personalized ads enabled (npa=0) while the OptanonConsent cookie shows interactionCount=0 — no user has touched the consent banner."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

MySchoolBucks handles school payments for K-12 families — lunch accounts, activity fees, event tickets, field trip money. It's operated by Heartland School Solutions, a subsidiary of Global Payments. What the site doesn't surface is that its login page doubles as a public directory of every school district it works with, that it runs a behavioral analytics platform deliberately routed through infrastructure that looks first-party, and that it tracks visitors before recording any consent interaction — on a platform that handles children's financial data.

## Architecture

The main site at `www.myschoolbucks.com` is a Java/JSP server-rendered application. All page requests route through a single action controller pattern: `/ver2/getmain?requestAction=home`. An F5 Volterra ADC/WAF sits at the edge (`server: volt-adc`, `x-volterra-location: b-sv10-sjc` for the San Jose CDN node). IBM DataPower or WebSphere security is active — a `TS01dc4fc6` cookie is set on the first request. OPNET/NetScout APM is instrumented via `x-opnet-transaction-trace` response headers. HSTS, `X-Frame-Options: SAMEORIGIN`, and XSS headers are all set. No Content Security Policy header is present.

Authentication is handled by self-hosted Keycloak at `login.myschoolbucks.com/auth/realms/MySchoolBucks/`. The public realm endpoint is openly accessible and returns the RSA public key, service endpoint URLs, and a `tokens-not-before` timestamp of `1502921118` — August 16, 2017, the original Keycloak deployment date. The OIDC well-known endpoint lists supported grant types: `authorization_code`, `client_credentials`, `implicit`, `password`, `refresh_token`, plus device code, token exchange, UMA-ticket, and CIBA. The `password` grant (resource owner password credentials) allows direct token requests with raw credentials — no browser redirect — and the `implicit` grant is deprecated as insecure in OAuth 2.1. Both remain enabled.

The product suite beyond the parent portal, with their respective backends:

| Product | Domain | Stack | Backend |
|---------|--------|-------|---------|
| MealViewer | `mealviewer.com` | Angular SPA | `mv-api-prod.azurewebsites.net` |
| MSB Tickets | `msbtickets.com` | Angular SPA | `msbtickets-ui-prod.azurewebsites.net` |
| MSB Activities | `msbactivities.com` | — | Azure API Management |
| Heartland Mosaic | `mp.heartlandmosaic.com` | ASP.NET MVC | Kestrel |
| MSB Apps / MealOrders | `mealorders.app`, `myschoolapps.com` | — | — |

The homepage JavaScript contains an `internalHostnames` config object that enumerates the full internal network topology visible to the client app: `myschoolbucks.com`, `msbactivities.com`, `msbtickets.com`, `mealviewer.com`, `myschoolapps.com`, `heartlandschoolsolutions.com`, `heartlandpaymentsystems.com`, `heartlandschoolsolutions.my.salesforce.com` (Salesforce CRM), `heartlandmosaic.com`, `mp.heartlandmosaic.com`, `apis.globalpayments.com` (parent company payment API), `greenlight.onelink.me`, `register.greenlight.com`, `www.greenlightcard.com`. The Greenlight entries are notable — Greenlight is a debit card and financial literacy platform for kids. The partnership is visible in production infrastructure config.

All static assets are versioned with a sequential build number (`?version=26.3.11`), not a content hash. The version increments with deploys. The meta author tag reads `Heartland School Solutions`.

The Heartland Mosaic admin portal at `mp.heartlandmosaic.com` returns a public login page. It supports username/password login and SSO via the same Keycloak instance (`AllowMSBSso=True`, `ForceMSBSso=False`). It's a separate product from MySchoolBucks proper but shares the auth layer — the same Keycloak realm handles district administrator access to the back-office analytics platform.

---

## The 627 District SAML List

When Keycloak renders the login page at `login.myschoolbucks.com`, it server-side generates one entry per configured SAML identity broker — that is, one entry per integrated school district. There are 627 such entries. They appear in the HTML as clickable SSO links, with `style="display: none;"` applied client-side to hide them from view. The hiding happens in the browser. The data arrives in the HTML regardless.

The list covers districts across dozens of states — Colorado Springs School District (CO), West Allegheny SD (PA), Arlington Public Schools (VA), Alexandria City Public Schools (VA), and hundreds more. The dominant identity provider across integrations is PowerSchool. Extracting the full list requires nothing beyond an unauthenticated HTTP request to the login page.

From a Keycloak architecture standpoint, this is a straightforward consequence of server-side rendering: the platform generates the full identity provider selection UI and then relies on JavaScript to filter it. What ships to the browser is the complete enumeration of every SAML relationship the platform has. There is no lazy loading, no authenticated fetch, no gating.

The signup page carries a separate infrastructure detail: a `<div class="sinup2-footerServerName sinup2-invert">` element containing the internal server or pod identifier — `RIC_P_SSOP01` and `RIC_P_SSOP02` have both been observed across requests, confirming a load-balanced pool. `RIC` likely indicates a datacenter location; `SSOP` likely the SSO service designation. The pod number rotates depending on which backend handles the request, and all nodes expose their identifier to unauthenticated users.

---

## Surveillance Stack

### Pendo via First-Party Subdomain

Pendo product analytics loads from `https://content.analytics.myschoolbucks.com/agent/static/9d3969cf-99b0-4ea0-6b4f-1f883918be19/pendo.js`. The subdomain `content.analytics.myschoolbucks.com` resolves to Google Cloud Storage — response headers include `x-guploader-uploadid`, and the CORS policy on the GCS bucket is `access-control-allow-origin: *`. The Pendo API key is embedded in the URL path itself.

Ad blockers and privacy extensions that block `cdn.pendo.io`, `pendo.io`, or `*.pendo.io` will not catch requests to this subdomain. From a network perspective, it looks like a first-party analytics endpoint. The Pendo JS bundle is publicly fetchable by anyone with the URL, and since the API key is in the path, the full configuration is accessible.

Pendo is tagged as `class='optanon-category-2'` — category C0002, labeled "Performance" in the OneTrust config. It fires whenever C0002 is active. On first visit, it sets:

- `_pendo_sessionId` (sessionStorage) — session identifier with timestamp
- `_pendo_utm` (localStorage) — traffic source attribution; fresh visits record "Direct"
- `_pendo_meta` (localStorage) — visitor metadata, TTL ~90 days
- `sessionStorage.previous_page_loads` — running URL history, with page titles appended as query parameters

### GA4: Pre-Consent Fire

GA4 measurement ID `G-WCT5GW9D9V` loads via Google Tag Manager. On first page load it posts to `www.google-analytics.com/g/collect` with `npa=0` (non-personalized ads disabled — i.e., personalized ads enabled) and Google Consent Mode signals `gcd=13l3l3l3l1l1` indicating consent granted across all signal types. The `_ga` and `_ga_WCT5GW9D9V` cookies are set immediately.

### OneTrust: Consent by Default

The `OptanonConsent` cookie is set on the first page response — before any consent banner interaction — with:

```
interactionCount=0
groups=C0001:1,C0003:1,C0002:1
```

The OneTrust config at `cdn.cookielaw.org/consent/2a86f8c8-003f-4d5a-ac0f-bcd2663bb224/` has type `GDPR`, applied globally with `SkipGeolocation: true`. There is no geographic differentiation — every visitor worldwide receives the GDPR banner configuration, which defaults analytics and functional cookies to active. A custom `onetrust.js` on the site initializes `window.msbCookieObjects` with all four cookie groups (`C0001`, `C0002`, `C0003`, `C0004`) set to `true` before OneTrust loads — the default fallback has everything enabled.

The firing sequence on a fresh session:

1. OneTrust initializes with empty active groups (`",,"`)
2. Immediately fires a second event with `",C0001,C0003,C0002,"` — no user action taken
3. `_ga` and `_ga_WCT5GW9D9V` cookies set (GA4 active)
4. Pendo loads from `content.analytics.myschoolbucks.com`
5. GA4 posts to `/g/collect` with personalized signals

The OneTrust domain script ID is `2a86f8c8-003f-4d5a-ac0f-bcd2663bb224`. Rule set ID is `c601f070-5fed-4418-9f6f-dda29b9ecd90`. Cookie groups: C0001 (Strictly Necessary, always active), C0002 (Performance — GA4, Pendo), C0003 (Functional), C0004 (Targeting, default active in `msbCookieObjects` but not in observed runtime active groups on first load), C0005 (Social Media).

### GPC: Policy Says Yes, Config Says No

The privacy policy states, twice, that the site honors Global Privacy Control signals:

> "Through our consent management platform, administered by our vendor OneTrust, the Sites recognize and respond to opt-out requests made using GPC."

The OneTrust config object reads:

```json
"IsGPPEnabled": false,
"GCEnable": false
```

The runtime `OptanonConsent` cookie: `isGpcEnabled=0`, `browserGpcFlag=0`. GPC signals are not processed. The privacy policy text and the implementation are contradictory, verifiable from the same domain.

---

## Pendo Guide Over-Delivery

Pendo initializes and fetches the complete guide catalog from `content.analytics.myschoolbucks.com` on every page load, regardless of whether the visitor is authenticated or what role they hold. The catalog contains 151 active guides.

The guides fall into distinct categories by naming convention:

**Admin-only guides** (delivered to all visitors):
- `MSB Admin - G/L Accounts` — general ledger account setup for school finance staff
- `MSB Admin - Enable Store`, `MSB Admin - Build Products`, `MSB Admin - Add Categories` — store configuration workflows
- `MSB Admin - Web Forms`, `MSB Admin - Upload Graphics` — admin content management
- `MSB Admin - Communicate to Parents` — admin communications tooling
- `MSB Admin - Pay Express`, `MSB Admin - Add Users` — district administrator features
- `MSB Admin - Resource Center - Release Notes` — internal release notes resource
- `PK-MSB-A - Configuration - Advanced Config - Payment Gateways - Tip` — payment gateway config tooltips
- `PK-MSB-A - Course Fees - Waive - Tip` — fee waiver tools
- `PK-MSB-A - Households - Tip` — family account management for admin users
- Full financial reporting suite: Invoice Reports (Detail and Summary), Batch Reports, G/L Transaction Reports, Deposit Reconciliation, Cafeteria Purchase Reports, Payment Reports, Sales Reports — each with a corresponding VEGA variant guide

**Parent-facing guides** (2 entries confirmed):
- `MSB Parent - Meals - Student/Staff - AutoPay (Badge)`
- `MSB Parent - General - Contact Us - Not Logged In`

**Onboarding**:
- `Activation - Step 1 - What is your Role` — role selection during account setup
- `Web TOS 1/3/2025` — terms of service modal
- `MSB Release Notes` — release notes for all users

**Beta signal**:
- `Beta Wall - Promo Codes - Breadcrumb` — the name explicitly references a "Beta Wall" gate. A breadcrumb navigation guide for a promo codes feature is already authored and deployed to the production Pendo account. The feature isn't live in the product; its in-app guidance is.

The over-delivery is a consequence of Pendo loading the full account guide catalog on initialization before authentication state is established. Pendo can be configured to scope guide delivery by user role or segment, but that requires tagging visitors with role data — which can only happen after auth. Since Pendo fires before auth, anonymous visitors receive the complete catalog. The admin guide names reveal internal UI terminology, screen layouts, and financial workflow details for district administrators.

---

## Infrastructure Signals

Three Azure backend hostnames are visible through normal browsing, each via a different mechanism:

**MealViewer API backend**: A 404 response from `api.mealviewer.com` includes `mv-api-prod.azurewebsites.net` in the error response body. The MealViewer API runs on Azure App Service.

**MSB Tickets UI backend**: A 404 response from `msbtickets.com` triggers a `Set-Cookie` header with the cookie domain explicitly set to `msbtickets-ui-prod.azurewebsites.net`. The Azure App Service hostname appears in the browser's cookie store for the production tickets site. A `TiPMix` cookie (Azure Test-in-Production) is also set, indicating the Azure staging slot mechanism is active.

**Vega telemetry dev endpoint**: The production JavaScript bundle for MSB Activities references `https://vega-telemetry-apim-dev.azure-api.net`. The URL returns 404, but it is present in the live production code. `vega-telemetry-apim-dev` is a development-environment Azure API Management instance. A development infrastructure URL shipped in a production bundle.

---

## Machine Briefing

### Access & auth

Main site, login page, signup flow, privacy policy, and partner portal are all public — no auth needed. The Keycloak realm endpoint is public. The 627 SAML broker list is in unauthenticated login page HTML. Pendo guide catalog is delivered to unauthenticated visitors. The OneTrust config JSON is publicly fetchable.

Authenticated flows (parent portal, account management, payments) require Keycloak auth. The Keycloak `password` grant type is enabled, meaning token requests can be made directly to the token endpoint with credentials — no browser redirect required.

Main site assigns `JSESSIONID` on first request. Requests needing session continuity must carry it.

### Endpoints

**Login page — SAML broker list (no auth)**

```bash
# Returns full HTML with 627 school district SSO entries (style="display: none;")
curl -s "https://login.myschoolbucks.com/auth/realms/MySchoolBucks/protocol/openid-connect/auth?client_id=msbapp&response_type=code&redirect_uri=https://www.myschoolbucks.com/ver2/login/loginsuccess&scope=openid" | grep -c 'broker'
# Expected: ~627
```

**Keycloak public realm (no auth)**

```bash
# Returns: public RSA key, service endpoints, tokens-not-before (1502921118 = 2017-08-16)
curl "https://login.myschoolbucks.com/auth/realms/MySchoolBucks"

# Full OIDC well-known config — grant types, response types, endpoints
curl "https://login.myschoolbucks.com/auth/realms/MySchoolBucks/.well-known/openid-configuration"
```

**Pendo guide catalog (no auth)**

```bash
# Full Pendo JS bundle — initializes with 151-guide catalog on load
# API key is in the path: 9d3969cf-99b0-4ea0-6b4f-1f883918be19
curl "https://content.analytics.myschoolbucks.com/agent/static/9d3969cf-99b0-4ea0-6b4f-1f883918be19/pendo.js"
```

**OneTrust consent config (no auth)**

```bash
# Full OneTrust rule config — type GDPR, SkipGeolocation true, GPC disabled
curl "https://cdn.cookielaw.org/consent/2a86f8c8-003f-4d5a-ac0f-bcd2663bb224/2a86f8c8-003f-4d5a-ac0f-bcd2663bb224.json"

# Rule set detail
curl "https://cdn.cookielaw.org/consent/2a86f8c8-003f-4d5a-ac0f-bcd2663bb224/c601f070-5fed-4418-9f6f-dda29b9ecd90/en.json"
```

**MealViewer 404 trigger — Azure hostname in response body**

```bash
# Error body includes mv-api-prod.azurewebsites.net
curl "https://api.mealviewer.com/api/v4/nonexistent"
```

**Main site homepage**

```bash
# Server-rendered Java/JSP — sets JSESSIONID and TS01dc4fc6 cookies
curl -I "https://www.myschoolbucks.com/ver2/getmain?requestAction=home"

# Cookie consent update endpoint (POST)
# /ver2/etc/updateCookieConsent
```

### Gotchas

- `JSESSIONID` is required for session continuity on the main site — a new one is issued on every cold request to the main controller. Include it in subsequent requests if testing server-side session behavior.
- Build version `26.3.11` is appended to all static assets as `?version=26.3.11`. Asset URLs without the version param may return 404 or stale cached versions.
- The Pendo subdomain `content.analytics.myschoolbucks.com` is GCS-hosted. Direct requests to Pendo's API management endpoints (`app.pendo.io/api`) require separate authentication — the static bundle and guide catalog are accessible without auth, but the management API is not.
- `msbApplicationKey: 5V4HVKOJG5NS3M7` and `unauthenticatedUserToken` appear in hidden form fields on unauthenticated pages. These are static application identifiers for server-side session correlation, not user-specific secrets.
- reCAPTCHA v3 is active on signup (`sitekey: 6LdIx7QZAAAAABdc_RltkCKwICdCSzcr3J-FkLhB`); reCAPTCHA v2 checkbox is on the login form. Phone verification is required for US account creation — skippable only for Australian accounts.
- Keycloak `password` grant requires a valid `client_id` and registered application credentials — the grant type is enabled at the realm level, but client registration details are not in scope of this investigation.
- `msbtickets-ui-prod.azurewebsites.net` appears in Set-Cookie domain headers on 404 responses from `msbtickets.com`. The `TiPMix` cookie indicates Azure deployment slot (staging/production swap) is configured.
