---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Turnitin — Teardown"
url: "https://www.turnitin.com"
company: "Turnitin"
industry: "Education"
description: "Academic integrity and plagiarism detection platform for higher education and K-12."
summary: "Three parallel systems share the turnitin.com domain: a static S3/CloudFront marketing site, a 1998-era Apache/ASP app still handling student logins, and a modern Kubernetes/Istio Angular micro-frontend with Spring Boot microservices behind the external-production.us2.turnitin.com service mesh proxy. Products — Turnitin Integrity (internal codename: redwood), iThenticate, Gradescope, ExamSoft, Draft Coach — route to separate backends. GTM-KLRP56F orchestrates a full enterprise B2B ad stack targeting education decision-makers."
date: "2026-04-14"
time: "05:38"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [CloudFront, S3, Apache, Angular, Spring Boot, Kubernetes, jQuery]
trackers: [Google Analytics 4, Google Ads, Google Tag Manager, Facebook Pixel, Hotjar, Microsoft Clarity, Bing UET, LinkedIn Insight Tag, Salesforce Pardot, 6sense, StackAdapt, Gainsight PX, New Relic, OneTrust, Yandex Metrica, Bombora]
tags: [education, saas, b2b, sso, lti, legacy-tech, ad-stack, api-exposure]
headline: "An unauthenticated API served SSO configs for all 870 Turnitin institutions — every LTI shared secret follows the pattern {institution}-admin."
findings:
  - "An unauthenticated endpoint returned the full SSO configuration database for Turnitin Integrity — 870 active records including LTI shared secrets for 762 institutions, every one following the predictable pattern {institution}-admin."
  - "Six SAML configs in the same dump include Azure AD tenant IDs and Okta app IDs for named institutions — Vermont Law School, City University of Seattle, Lawrence Tech, Albright College — mapping their identity provider infrastructure."
  - "The student login still runs on a 1998-era ASP codebase in production — P3P headers, secret question/answer registration, browser fingerprinting at login, and internal server numbers leaking in form action URLs."
  - "Internal CORS headers on the service mesh proxy expose an administrator impersonation system (X-TII-CTX-MASQUERADE-ACTOR-ID), test-tenant flags, and the product codename 'redwood' across all tenant context headers."
  - "Google Ads conversion linker cookie and CCM ping fire before any OneTrust consent interaction, with personalized ads enabled (npa=0) despite the C0004 targeting group showing as inactive."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Turnitin is the dominant academic integrity platform in higher education — over 16,000 institutions globally run student submissions through it. That reach makes its infrastructure worth examining closely. What's visible from the outside tells a story of a company that acquired its way to a product suite while never fully migrating its 1998-era foundation, and that left an API endpoint open that assembled every institution's SSO credentials in one place.

---

## Architecture

Three distinct systems handle Turnitin's traffic:

**Marketing site** (`www.turnitin.com`): Fully static. Served from Amazon S3 via CloudFront. jQuery 3.x + Bootstrap frontend. No SPA framework — traditional multi-page site. CloudFront handles distribution; `AmazonS3` appears in server headers.

**Legacy application** (`www.turnitin.com/login_page.asp` and related paths): Apache server. Active since at least 1998 per page copyright notices (`1998-2026`). Handles student login, new user registration, paper submission, and gradebook access. Responds to `.asp` URLs — server-side ASP pages. Not a legacy artifact that forwards traffic; this is the live production login surface.

**Modern platform** (`tii-connect-oregon.turnitin.com`, institution subdomains like `vermontlaw.turnitin.com`): Angular micro-frontend architecture. Kubernetes orchestration with Istio service mesh — `istio-envoy` appears as the server header on app responses. Spring Boot microservices behind the `external-production.us2.turnitin.com` SMS proxy. This is the "Turnitin Integrity" product, internally codenamed **redwood**.

Product lines visible in the sitemap: Turnitin Integrity, iThenticate (publisher/researcher plagiarism checking), Gradescope (acquired, automated grading), ExamSoft (acquired, proctored exams), Draft Coach (newer AI writing tool). Separate GTM conversion events confirm these are tracked as distinct business units: `examsoft__schedule_a_demo`, `gradescope__schedule_a_demo`, `integrity__schedule_a_demo`.

Infrastructure geography: Production runs in the `us2` region (`external-production.us2.turnitin.com`). A development environment exists at `external-dev.us2.turnitin.dev`. CDN config URL pattern — `cdn.turnitin.com/environments/{stack}/{environment}/{region}/config.json` — is documented in the frontend bundle but returns 403 for all combinations attempted.

## The Exposed Tenant Database

During this investigation, a GET request to the following endpoint returned 870 JSON records with no authentication:

```
GET https://external-production.us2.turnitin.com/sms-namespace/sms/sms-serviceName/admin-console-server/tenants/sso-configs
```

The response is an array of SSO configuration objects for every institution using Turnitin Integrity's redwood SSO system. All 870 entries have `active: true`. Full schema per record:

```json
{
  "sso_config_id": "c304e5a8-f3c9-4ce3-ab9e-84d014e0803b",
  "sp_entity_id": "wileycollege",
  "idp_entity_id": "wileycollege",
  "identity_provider": "lti",
  "service_provider": "redwood",
  "service_provider_secret": "wileycollege-admin",
  "sso_method": "native",
  "active": true,
  "sso_login_initiate_url": null,
  "access_controls": null,
  "user_attribute_map": null,
  "group_map": null,
  "saml_config": null,
  "logout_url": null
}
```

The `service_provider` field is `"redwood"` for all 870 entries — Turnitin's internal codename for the Integrity product.

**Identity provider breakdown:**
- LTI: 762
- Google OAuth: 46
- Shibboleth: 40
- null (unset): 18
- ClassLink: 3
- Clever: 1

**SSO method breakdown:**
- native: 814
- oauth: 50
- saml: 6

### The Shared Secrets

783 of 870 records include a non-null `service_provider_secret`. These belong exclusively to LTI (762), Google OAuth (3), and null identity_provider (18) configurations — Shibboleth entries have null secrets.

Every single secret follows the same pattern: `{sp_entity_id}-admin`. No exceptions across all 783 values. `wileycollege` becomes `wileycollege-admin`. `vermontlaw` becomes `vermontlaw-admin`. `rockhurst` becomes `rockhurst-admin`. This is auto-generated at provisioning time — a deterministic string constructed from the institution identifier, not a randomly-generated cryptographic secret.

In LTI 1.x (the dominant protocol here at 762 institutions), the `sp_entity_id` functions as the OAuth consumer key and the `service_provider_secret` is the OAuth consumer secret used for HMAC-SHA1 signing of launch requests. With both values known, it would be possible to construct a valid LTI launch request claiming to be any of these institutions' LMS platforms. The uniformly predictable pattern means these credentials were already weak before the endpoint was discovered — but the endpoint assembled all 870 in one place. (This is an inference from LTI 1.x protocol mechanics; not directly tested.)

### SAML and OAuth Configurations

Six institutions use SAML. Their records include `saml_config` objects with metadata URLs and entity IDs that expose IdP implementation details:

| Institution | IdP |
|-------------|-----|
| tii-uscalp-sso | Okta (`dev-293053.oktapreview.com` — preview/dev Okta tenant) |
| tii-super-uscalp | Okta (`http://www.okta.com/exkjv8lrvgatHtvXL0x7`) |
| vermontlaw | Azure AD (tenant `8676127a-f6d4-4747-af4c-356f1b6c1610`) |
| cityuofseattle | Azure AD (tenant `b3fa96d9-f515-4662-add7-63d854e39e63`) |
| lawrencetech | Shibboleth (`vplatinum.ltu.edu`) |
| albright | Shibboleth (`lionpass.albright.edu`) |

Vermont Law School's entry includes a full Azure AD federation metadata URL with both the tenant ID and the Turnitin app registration ID (`appid=7553a2ce-cf69-4ec6-9983-7eb9b442dc81`). City University of Seattle similarly exposes tenant `b3fa96d9` with app `b706de9d-1658-4ccf-917f-60a44218a81e`.

A companion endpoint was also unauthenticated:

```
GET /sms-namespace/sms/sms-serviceName/admin-console-server/tenants/sso-configs/identity-providers
-> ["google","lti","mpass","classlink","shibboleth","clever"]
```

Other endpoints on the same service required authentication (401) or indicated missing parameters (400, 500):

```
GET /tenants/language                     -> 401
GET /users/search                         -> 401
GET /settings/migration/report            -> 401
GET /tenants/                             -> 500 (Spring Boot error, no path param)
GET /tenants/identity?sp_entity_id=...    -> 400 "jwt not found"
```

### CORS and Internal Headers

The CORS headers on the SSO configs endpoint:

```
access-control-allow-origin: (empty string)
access-control-allow-methods: GET, PUT, POST, DELETE, HEAD, PATCH, OPTIONS
access-control-allow-credentials: true
access-control-allow-headers: Authorization, X-TII-CTX-TENANT-ID, X-TII-CTX-TENANT-NAME,
  X-TII-CTX-ACTOR-ID, X-TII-CTX-IS-TEST-TENANT, X-TII-CTX-MASQUERADE-ACTOR-ID,
  redwood-user-locale
```

The empty `allow-origin` value means browsers would reject cross-origin responses — this is not a CORS misconfiguration exploitable from a browser. The data was accessed via curl. But the allowed headers list reveals the internal request context model: `X-TII-CTX-MASQUERADE-ACTOR-ID` indicates the system supports administrator-level actor impersonation. `X-TII-CTX-IS-TEST-TENANT` confirms test tenants run alongside production tenants in the same cluster.

**Institution subdomain pattern:**
OAuth and SAML configs include `sso_login_initiate_url` values that confirm the subdomain structure:

```
https://{sp_entity_id}.turnitin.com/sso/oauth/google/start?service=REDWOOD&sd={sp_entity_id}
https://{sp_entity_id}.turnitin.com/sso/sp/redwood/saml/{token}/start
```

Each institution gets its own `{sp_entity_id}.turnitin.com` subdomain.

The endpoint currently returns 403. The 870-record response was captured during this investigation.

## The 1998 Application

The login surface for Turnitin Integrity runs on a codebase that dates to 1998. It is not a staging environment or a legacy redirect — it handles live authentication for all institutions using the native LTI SSO method. Observable artifacts from a fresh request to `/login_page.asp`:

**P3P header:**
```
P3P: CP=CAO OSA OUR
```
P3P (Platform for Privacy Preferences) was a W3C standard deprecated by Internet Explorer in the mid-2010s and ignored by every modern browser. It has not been relevant to actual privacy enforcement since roughly 2012. Its presence is a timestamp — this code has not been touched in over a decade.

**CSP on the legacy app:**
```
Content-Security-Policy: frame-ancestors *; object-src 'none'
```
`frame-ancestors *` permits any origin to embed the login page in an iframe. This applies to the legacy ASP app, not the modern Angular frontend.

**Login form fields:**
- `email` — standard
- `user_password` — standard
- `browser_fp` — hidden field populated by JavaScript fingerprinting at page load
- `javascript_enabled` — boolean, also hidden

**New user registration (`/newuser_join.asp`):**
- Requires Class ID + enrollment key — students cannot self-register without institutional credentials
- Includes secret question/answer fields (a security pattern from early 2000s)
- Google reCAPTCHA (site key: `6LcHZ_YjAAAAAPfr1CpFhhrn1iUmo1vt7vQK_0jr`)
- Hidden `product` field for tracking which product line originated the signup

**Server number leak:**
`svr=N` appears in form action URLs and redirects. Observed values: `svr=13`, `svr=15`, `svr=31`. These are internal load balancer server identifiers leaking into public-facing URLs.

**Session cookie:**
`session-id` is set `HttpOnly`, `Secure`, `SameSite=None`. The `SameSite=None` setting allows the cookie to be sent in cross-site requests — a weaker posture than modern defaults.

The robots.txt disallows a set of ASP paths that map to the legacy app's student and teacher interfaces: `/s_home.asp` (student home), `/t_home.asp` (teacher home), `/t_inbox.asp` (teacher inbox), `/paperInfo.asp` (paper details), `/grademark3`, and others. Requests to these paths redirect to the login page, confirming they are active routes.

## Ad Stack

The marketing site runs GTM container `GTM-KLRP56F`. The container drives conversion tracking across all product lines using three separate Google Ads accounts:

- `AW-396328383`
- `AW-1071491183`
- `AW-10884945693`

GA4 measurement ID: `G-9ZQXFGJMFQ`. All four Google properties feed the same GA4 stream.

**Full tracker inventory confirmed in GTM container:**

| Vendor | ID / Identifier | Category |
|--------|-----------------|----------|
| Google Analytics 4 | G-9ZQXFGJMFQ | Analytics |
| Google Ads | AW-396328383, AW-1071491183, AW-10884945693 | Advertising |
| Facebook Pixel | 843094725285481 | Advertising |
| Hotjar | 3901693 | Session recording |
| Bing UET | 343236575 | Advertising |
| LinkedIn Insight Tag | snap.licdn.com | Advertising |
| 6sense | 6sc.co | ABM / Intent |
| StackAdapt | tags.srv.stackadapt.com | Programmatic |
| Salesforce Pardot | pi.pardot.com | CRM / Lead tracking |

**Additional vendors in OneTrust C0004 (Targeting) host list** — declared in consent config, not directly observed firing:
- Bombora (`company-target.com`) — B2B intent data
- Tremor Video / TVScientific (`tremorhub.com`) — video advertising
- Bidswitch (`bidr.io`) — programmatic bid switching
- Index Exchange (`casalemedia.com`) — programmatic exchange
- iPredictive (`ipredictive.com`) — DSP
- Yandex Metrica (`mc.yandex.ru`) — analytics (Russian-origin platform, notable for an education provider serving US institutions)
- AddThis (`s7.addthis.com`) — social sharing / audience profiling

**OneTrust consent configuration (config ID: `5d3e953a-6bb6-4a3b-ab66-7bd1bf73a172`):**

| Group | ID | Contents |
|-------|----|----------|
| Strictly Necessary | C0001 | Always active, 7 hosts |
| Analytics | C0002 | 11 hosts including GA4, Hotjar, Clarity, Yandex, New Relic |
| Functional | C0003 | 4 hosts including Gainsight, Zendesk, Salesforce |
| Targeting | C0004 | 33 hosts including Pardot, Facebook, LinkedIn, Bing, 6sense, StackAdapt |
| Social Media | C0005 | 0 hosts (empty) |
| Sale of Personal Data | BG42 | 0 hosts (CPRA/CCPA group, inactive) |

Consent model for US visitors: opt-in, `ForceConsent: false`, `AcceptAllCookies: false`. GDPR and Canada/UK rulesets also configured.

**Pre-consent tracking:**
On a fresh first load with no prior cookies, before any consent interaction:

1. `_gcl_au` cookie is set (Google Ads conversion linker — belongs to `Targeting` group C0004, not yet consented)
2. `POST https://www.google.com/ccm/collect` fires twice

The CCM request includes:
```
auid=836191354.1776144655   (matches _gcl_au value)
npa=0                        (personalized ads — NOT non-personalized)
gcd=13l3l3l3l1l1             (Google Consent Mode state)
ep.ads_data_redaction=0      (no data redaction)
```

This is Google Consent Mode v2 behavior. The GTM container sets consent defaults before OneTrust loads, and `ad_storage` defaults to granted. The C0004 group in OneTrust shows as inactive at this point, but the conversion linker cookie and CCM ping have already fired. The `npa=0` parameter confirms personalized ad mode is active during this window.

Network baseline on fresh load (before consent interaction): only three third-party domains are contacted — `cdn.cookielaw.org` (OneTrust), `www.google.com` (CCM), and `geolocation.onetrust.com`. The broader C0004 stack does not fire until consent is given. The pre-consent issue is specifically the Google Consent Mode default configuration, not a wholesale consent bypass.

**Gainsight PX** (`AP-H6XRJYUGEBGP-2`) runs inside the app on the Angular frontend — separate from the GTM setup on the marketing site. Config has `autoClickTrack: true` and `autoTrack: true` — every click and page event is recorded. Element attribute whitelist includes `data-px*`, `data-testid*`, `with-data*`, `tii*`, and `data` — the `tii*` prefix confirms Turnitin uses `tii-` data attributes as analytics anchors throughout the application UI.

Gainsight `excludeUrls` reveals internal environment patterns not otherwise visible:
```
*automation.turnitin*.com*
*internal.turnitin*.com*
https://ps.turnitin*.com*
*pdx-www.turnitin.com*
```
`ps.turnitin.com` is consistent with professional services tooling. `pdx-www.turnitin.com` suggests a Portland, Oregon data center node. `internal.turnitin*.com` and `automation.turnitin*.com` indicate QA/automation and internal-only subdomains.

## Internal Architecture Disclosure

Beyond the CORS headers and Gainsight excludes, several other internal details are visible without authentication:

**LaunchDarkly feature flags** (from SSO Angular app bundle): Two client IDs embedded in the frontend JavaScript — production (`5bd79c8f5dc073406b2583c2`) and staging/dev (`5a8387495d265b0aac805b87`). (Inferred from app bundle inspection; not verified against a separate evidence file.)

**Spring Boot error format** — the `/tenants/` endpoint without a path parameter returns:
```json
{
  "timestamp": "2026-04-14T05:28:24.880+00:00",
  "status": 500,
  "error": "Internal Server Error",
  "path": "/tenants/"
}
```
Standard Spring Boot error response, confirming the framework. The `admin-console-server` service name is part of the URL path itself.

**Internal service headers** (from CORS allowed headers on the SMS proxy):
- `X-TII-CTX-TENANT-ID` — tenant context injection
- `X-TII-CTX-TENANT-NAME`
- `X-TII-CTX-ACTOR-ID` — actor (user) context
- `X-TII-CTX-IS-TEST-TENANT` — test tenant flag
- `X-TII-CTX-MASQUERADE-ACTOR-ID` — administrator impersonation capability
- `redwood-user-locale` — locale context for the redwood product

These headers are used internally for service-to-service context propagation. Their presence in the CORS `allow-headers` list means the proxy accepts them as inbound request headers — not just a documentation artifact.

**SearchUnify** (`tu101912p.searchunify.com`) handles enterprise site search on the marketing site.

**Brightcove video** — account `6155280996001`, player `TOEUEOyNN_default`. Policy key required for the playback API; public configuration only.

**Security disclosure:** `/.well-known/security.txt` present with VDP contact `vdp@turnitin.com` and a safe harbor statement.

## Machine Briefing

**Access and auth:**
The marketing site (`www.turnitin.com`) requires no auth — pure static S3 content. The legacy app (`www.turnitin.com/*.asp`) sets a `session-id` cookie on first load; actual access to student/teacher pages requires a valid account + class enrollment. The modern app (`tii-connect-oregon.turnitin.com` and institution subdomains) uses SSO flows — institution-specific JWT required for authenticated API access.

The SMS proxy (`external-production.us2.turnitin.com`) accepted unauthenticated requests to the SSO configs path during this investigation. Most other endpoints on the proxy require a JWT (`Authorization` header) and return 401 without one.

**Open endpoints (observed during investigation):**

```bash
# SSO configuration database (unauthenticated at time of investigation; now 403)
curl https://external-production.us2.turnitin.com/sms-namespace/sms/sms-serviceName/admin-console-server/tenants/sso-configs

# Identity provider list
curl https://external-production.us2.turnitin.com/sms-namespace/sms/sms-serviceName/admin-console-server/tenants/sso-configs/identity-providers

# OneTrust consent configuration (public)
curl "https://cdn.cookielaw.org/consent/5d3e953a-6bb6-4a3b-ab66-7bd1bf73a172/5d3e953a-6bb6-4a3b-ab66-7bd1bf73a172/en.json"

# GTM container (public)
curl "https://www.googletagmanager.com/gtm.js?id=GTM-KLRP56F"
```

**Institution subdomain routing:**
```
https://{sp_entity_id}.turnitin.com/sso/oauth/google/start?service=REDWOOD&sd={sp_entity_id}
https://{sp_entity_id}.turnitin.com/sso/sp/redwood/saml/{token}/start
```
`sp_entity_id` values for all 870 institutions are in the SSO configs response.

**Endpoints requiring auth (return 401 without JWT):**
```
GET /sms-namespace/sms/sms-serviceName/admin-console-server/tenants/language
GET /sms-namespace/sms/sms-serviceName/admin-console-server/users/search
GET /sms-namespace/sms/sms-serviceName/admin-console-server/settings/migration/report
```

**Internal context headers (for authenticated requests):**
```
X-TII-CTX-TENANT-ID: {tenant-uuid}
X-TII-CTX-TENANT-NAME: {tenant-name}
X-TII-CTX-ACTOR-ID: {user-uuid}
X-TII-CTX-IS-TEST-TENANT: false
redwood-user-locale: en-US
```

**Gotchas:**
- `/tenants/` (no path param) returns 500; `/tenants/identity?sp_entity_id=X` returns 400 "jwt not found"
- CDN config (`cdn.turnitin.com/environments/...`) returns 403 for all combinations tried
- Legacy ASP app server numbers appear in URLs (`svr=N`); not meaningful for routing
- `session-id` cookie on legacy app is `SameSite=None` — sent in cross-site contexts
- Dev environment at `external-dev.us2.turnitin.dev` — same URL patterns, unverified access
