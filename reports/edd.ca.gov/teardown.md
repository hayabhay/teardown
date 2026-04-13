---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "California EDD — Teardown"
url: "https://edd.ca.gov"
company: California EDD
industry: Government
description: "California state agency for unemployment, disability, and paid family leave benefits."
summary: "edd.ca.gov runs EPiServer/Optimizely CMS on ASP.NET MVC 5.2 and IIS 10.0, fronted by AWS CloudFront. Three AWS Lex chatbot instances share a single bot across three separate AWS accounts, with full infrastructure details exposed in a public JSON config file including Cognito pool IDs, IAM role ARNs, and KMS key ARNs. Authentication routes through Okta with custom domain icam.edd.ca.gov. Benefits portals (myEDD, UIO, SDIO) sit behind Akamai WAF and Okta Access Gateway on separate subdomains."
date: 2026-04-08
time: "05:45"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack: ["EPiServer", "ASP.NET MVC", "AWS CloudFront", "AWS Lex", "Okta", "IIS"]
trackers: ["Google Analytics 4", "Google Analytics UA", "Google Tag Manager", "Microsoft Clarity", "Siteimprove", "Qualtrics", "Google DoubleClick", "Google Translate", "Google Custom Search"]
tags: ["government", "benefits", "chatbot", "aws-lex", "okta", "session-recording", "no-consent", "episerver", "aspnet", "multi-account"]
headline: "EDD's public chatbot config ships three AWS account IDs, Cognito credentials, IAM role ARNs, and a flag literally named AllowSuperDangerousHTMLInMessage set to true."
findings:
  - "A single public JSON file at the chatbot's CloudFront URL exposes three AWS account IDs, Cognito pool IDs, KMS key ARNs, cross-account IAM role ARNs, and ACM certificate ARNs — a full infrastructure map across three separate government AWS accounts."
  - "All three chatbot instances set AllowSuperDangerousHTMLInMessage to true — an AWS-named flag that enables raw HTML rendering in bot responses on a site where Californians seek unemployment and disability help."
  - "Microsoft Clarity session recording captures mouse movements, clicks, and scroll behavior on unemployment and disability insurance pages, with no consent banner anywhere on the site."
  - "The EPiServer CMS admin paths return 500 Internal Server Error instead of 401 or 403, and the login page at /util/login.aspx is publicly accessible with DXC Technology branding visible."
  - "The site ships zero defensive HTTP headers — no Content-Security-Policy, no X-Frame-Options, no X-Content-Type-Options — while every response advertises the exact server stack."
---

## Architecture

edd.ca.gov serves California's Employment Development Department — the state agency handling unemployment insurance, disability insurance, and paid family leave for roughly 19 million workers. The site runs EPiServer (now Optimizely) CMS on ASP.NET MVC 5.2, .NET Framework 4.0.30319, hosted on Microsoft IIS 10.0 behind AWS CloudFront.

The robots.txt disallows `/EPiServer/`, confirming the CMS identity. Response headers expose the full server stack on every request: `X-Powered-By: ASP.NET`, `X-AspNetMvc-Version: 5.2`, `X-AspNet-Version: 4.0.30319`, `Server: Microsoft-IIS/10.0`. The SSL certificate for the main site is Amazon-issued, covering only `edd.ca.gov`. The portal and benefits subdomains use a wildcard cert: `*.edd.ca.gov`.

The front end loads jQuery 3.4.1 (released May 2019) with jQuery Migrate 3.0.1, the California state design system (`cagov.core.wm1.min.js`), and Google Custom Search (cx `17efe8f5a2906421d`) instead of EPiServer's built-in search. The site is bilingual — 5,510 English URLs and 1,109 Spanish URLs across 6,838 total sitemap entries. Content uses EPiServer's `siteassets` path convention for images and branding.

### Subdomains and Backend Systems

The EDD operates multiple backend systems across different infrastructure:

| Subdomain | Stack | Purpose |
|---|---|---|
| `edd.ca.gov` | IIS + CloudFront | Public-facing CMS site |
| `myedd.edd.ca.gov` | Akamai WAF | Benefits portal (blocked from outside) |
| `portal.edd.ca.gov` | Akamai (AkamaiGHost) | Same Access Denied page as myEDD |
| `uio.edd.ca.gov` | Okta Access Gateway + ALB | UI Online (unemployment claims) |
| `sdio.edd.ca.gov` | Okta Access Gateway + ALB | SDI Online (disability claims) |
| `icam.edd.ca.gov` | Okta (nginx) | SSO identity provider |
| `chatbot.uio.edd.ca.gov` | S3 + CloudFront | UIO chatbot |
| `chatbot.sdio.edd.ca.gov` | S3 + CloudFront | SDIO chatbot |
| `auth.chatbot.edd.ca.gov` | Cognito + ALB/CloudFront | Chatbot authentication |
| `api.chatbot.uio.edd.ca.gov` | API Gateway + CloudFront | UIO live chat API |
| `api.chatbot.sdio.edd.ca.gov` | API Gateway | SDIO chat API |
| `api.uicc.edd.ca.gov` | API Gateway | Translation API |

The benefits portals (`myedd.edd.ca.gov`, `portal.edd.ca.gov`) sit behind Akamai WAF. Unauthenticated requests receive a custom "Access Denied" page containing an Akamai reference number (format: `[0.xxxxxxxx.xxxxxxxxxx.xxxxxxxx]`) with a 48-hour validity window. The UIO and SDIO subdomains use Okta Access Gateway (`server: Access Gateway`) with ALB sticky sessions (`AWSALB`/`AWSALBCORS` cookies).

### Okta SSO

Authentication runs through Okta with tenant `caeddicamext.okta.com` and custom domain `icam.edd.ca.gov`. The admin tenant is `caeddicamext-admin.okta.com`. The UIO login page loads the Okta Sign-In Widget version 7.43.1 with:

- Client ID: `0oah75f09kkpaNXiL4h7`
- SAML app: `caeddicamext_newuio_1` (app ID `exkh75f09jJ34NpjZ4h7`)
- SAML redirect: `/app/caeddicamext_newuio_1/exkh75f09jJ34NpjZ4h7/sso/saml`

The Okta CSP reveals the frame-ancestors directive allows embedding from `uio.edd.ca.gov`, `auth.chatbot.edd.ca.gov`, and `sdio.edd.ca.gov`. Okta responses include a P3P header of `CP="HONK"` — either a placeholder never replaced or a deliberate non-standard value.

---

## Chatbot Infrastructure

The EDD runs an AWS Lex V2 chatbot named "EDD ChatBot" (bot ID `SZZPOVDT8U`, alias `0NZNNRTPIO`) deployed across three separate instances, each on a different AWS account, all publicly configurable via a single JSON file.

### The Config File

Each chatbot instance serves its full configuration at `/lex-web-ui-loader-config.json` over CloudFront with `Access-Control-Allow-Origin: *`. The main instance at `d38ilvijipqsdo.cloudfront.net` contains:

**AWS Account and Infrastructure:**
- Region: `us-west-2`
- Cognito Identity Pool: `us-west-2:8bba3530-2bc6-4e09-858e-57512e61e451`
- Cognito User Pool: `us-west-2_QtSB3j09B`
- Cognito App Client ID: `6fbbv1vt7o5ko4b5ciko8nsu2e`
- AWS Account ID: `783764580727` (derived from KMS key ARN and ACM certificate ARN)
- KMS Key: `arn:aws:kms:us-west-2:783764580727:key/85a78512-fc8c-4160-a0ac-d7b6b4315574`
- ACM Certificate: `arn:aws:acm:us-east-1:783764580727:certificate/d69cc99f-19a9-4011-bff1-98c9dcaf5458`

**Cross-Account Roles:**
- `arn:aws:iam::761018884867:role/lex-web-ui-prod-CodeBuild-SessionTokenLambdaExecuti-6b4iyUHqKvvo`
- `arn:aws:iam::559550955475:role/lex-web-ui-prod-CodeBuild-SessionTokenLambdaExecuti-W81wLjH9kQ2L`

**SAML Integration:**
- Okta SAML metadata: `https://icam.edd.ca.gov/app/exkjij8z2ugcBsnPR4h7/sso/saml/metadata`
- Provider name: `okta-edd`
- Cognito custom domain: `auth.chatbot.edd.ca.gov`

The S3 buckets serving chatbot assets also expose KMS key IDs in response headers (`x-amz-server-side-encryption-aws-kms-key-id`), providing the key ARN for each AWS account:
- Account `761018884867`: `key/4f34935d-c8ae-4e49-8c80-bf61347ac3ea`
- Account `559550955475`: `key/2e5cfd5f-8c8c-4b6a-90e3-d35ee2dc880e`

### Three Instances, Three Accounts

| Instance | CloudFront | AWS Account | Cognito Pool | Login | Live Chat |
|---|---|---|---|---|---|
| Main (public) | `d38ilvijipqsdo.cloudfront.net` | 783764580727 | `us-west-2:8bba3530-...` | No | No |
| UIO (unemployment) | `chatbot.uio.edd.ca.gov` | 761018884867 | `us-west-2:e53b4d94-...` | Yes | Yes |
| SDIO (disability) | `chatbot.sdio.edd.ca.gov` | 559550955475 | `us-west-2:b8701e59-...` | Yes | No |

All three share the same Lex bot (`SZZPOVDT8U`) but use separate Cognito identity pools and separate AWS accounts. Each Cognito pool issues temporary AWS credentials to anonymous visitors — required for browser-to-Lex communication. The credentials confirmed as live: calling `GetId` then `GetCredentialsForIdentity` returns an `AccessKeyId`, `SecretKey`, and `SessionToken` for account `783764580727`. The chatbot page title remains "LexWebUi Demo" — the AWS template default, never customized.

### AllowSuperDangerousHTMLInMessage

All three chatbot instances set `AllowSuperDangerousHTMLInMessage: true` in their UI configuration. This is a named flag in the AWS Lex Web UI framework that enables rendering of raw HTML in bot responses. When enabled, any HTML in a bot response — including `<script>`, `<img onerror>`, or `<iframe>` tags — renders in the chatbot's DOM rather than being escaped as text. The flag name (chosen by the AWS Lex Web UI team) is intentionally alarming.

### Knowledge Base Structure

The chatbot's QID (Question ID) prefixes reveal the internal knowledge base taxonomy:
- `UI.*` — Unemployment Insurance (UI.MainMenu, UI.LiveChat.Connect, UI.LiveChat.Queue, UI.LiveChat.Unauthorized, UI.Survey.001-005, UI.EndLiveChat)
- `SDIO.*` — State Disability Insurance (SDIO.MainMenu)
- `DI.Question` — Disability Insurance
- `PFL.Question` — Paid Family Leave
- `JS.Question` — Job Services
- `ER.Question` — Employer
- `SmallTalk.*` — Conversational responses (Hello, No, Question, Thank_You, Unhelpful, What_Can_You_Do, Yes)
- `Language.000` — Language selection
- `Survey.*`, `feedback.*` — Post-chat survey flow

The chatbot supports 16 languages: English, Arabic, Armenian, Chinese (Simplified and Traditional), Farsi, Hindi, Japanese, Korean, Mon-Khmer (Cambodian), Punjabi, Russian, Spanish, Tagalog, Thai, and Vietnamese. The UIO instance exposes a translation API at `https://api.uicc.edd.ca.gov/lex/translate` (403 without auth) and live chat trigger terms: "live agent, live person, representative, agent, examiner, help, operator, human."

### postMessage Handler Bug

The chatbot loader (`lex-web-ui-loader.min.js`) registers a global `message` event listener. The handler checks `'source' in evt.data` to filter non-chatbot messages, but this throws a `TypeError` when `evt.data` is a string — which is exactly what YouTube's iframe API sends. Every page that embeds both a YouTube video and the chatbot generates console errors: `Cannot use 'in' operator to search for 'source' in [YouTube JSON payload]`. Observed on the unemployment benefits page.

The chatbot loader also sends `navigator.userAgent` as a Lex session attribute on every interaction, passing the user's browser fingerprint to the bot backend.

---

## EPiServer CMS Exposure

The EPiServer CMS admin surface is partially accessible from the public internet:

- **`/util/login.aspx`** — Returns the full EPiServer CMS login page. The page renders with a DXC Technology logo (the system integrator), ASP.NET WebForms hidden fields (`__VIEWSTATE`, `__EVENTVALIDATION`, `__epiXSRF`), and username/password input fields (`LoginControl$UserName`, `LoginControl$Password`).

- **`/EPiServer/CMS/`** — Returns HTTP 500 Internal Server Error with zero-length body. The application attempts to load the CMS admin panel but crashes, rather than returning 401 or 403. The route is reachable at the application layer, not blocked by CloudFront or any WAF rule.

- **`/episerver/Shell/`** — Same behavior: 302 redirect to `/episerver/Shell/`, then 500 Internal Server Error.

The robots.txt disallows `/EPiServer/` (preventing indexing), but the paths are not access-restricted at the network or application level. DXC Technology (formerly Computer Sciences Corporation + HP Enterprise Services) is the system integrator, confirmed by their logo on the CMS login page.

---

## Tracking and Surveillance

edd.ca.gov has no consent management platform — no cookie banner, no opt-in prompt, no consent gate. All trackers fire on page load.

### Tracker Inventory

| # | Vendor | ID / Config | Scope |
|---|---|---|---|
| 1 | Google Analytics 4 | G-KF25MR5YHK | EDD-specific, all pages |
| 2 | Google Analytics 4 | G-69TD0KNT0F | Statewide (shared with dmv.ca.gov) |
| 3 | Google Analytics UA | UA-3419582-31 | Legacy, still firing |
| 4 | Google Tag Manager | GTM-N8KVMBR | All pages |
| 5 | Microsoft Clarity | Project 11960775 | Session recording, all pages |
| 6 | Siteimprove | Account 6058657 | All pages |
| 7 | Qualtrics Site Intercept | Zone ZN_9HxZEDQ06FHFeTk, Intercept SI_cUeV0ZUmE40Fwfc | Triggered by ActionSet AS_90958824 |
| 8 | Google DoubleClick | `googleads.g.doubleclick.net/pagead/id` | Conversion tracking via GTM |
| 9 | Google Translate | `translate.googleapis.com` | All pages |
| 10 | Google Custom Search | cx `17efe8f5a2906421d` | Site search |
| 11 | AWS Cognito | `cognito-identity.us-west-2.amazonaws.com` | Chatbot auth (2 calls per pageview) |

### Cookies Set Without Consent

| Cookie | Vendor | Purpose | Persistence |
|---|---|---|---|
| `_ga` | Google Analytics | User identification | 2 years |
| `_ga_KF25MR5YHK` | GA4 (EDD) | Session tracking | 2 years |
| `_ga_69TD0KNT0F` | GA4 (statewide) | Session tracking | 2 years |
| `nmstat` | Siteimprove | User identification (UUID) | Persistent |
| `_clck` | Microsoft Clarity | User identification | 1 year |
| `_clsk` | Microsoft Clarity | Session identification | 1 day |

### Microsoft Clarity Session Recording

Clarity runs on every page, including unemployment benefits (`/en/unemployment/`) and disability insurance (`/en/disability/`). The `__clr` global object hooks into DOM manipulation methods: `InsertRule`, `DeleteRule`, `MediaInsertRule`, `MediaDeleteRule`, `AttachShadow`, `define`, `replace`, `replaceSync`. This enables full session replay — mouse movements, clicks, scroll position, and form interactions.

The site directs users to external login portals (UIO, SDIO) for actual claim filing, so Clarity does not capture claim data directly. But it captures the browsing behavior of people navigating to file claims — which pages they visit, how they search for help, and where they abandon.

The `_clsk` cookie value shows session data transmitted to `b.clarity.ms/collect`. No consent function is configured — the `clarity.consent()` API is not present.

### Statewide Analytics

GA4 property `G-69TD0KNT0F` is shared between edd.ca.gov and dmv.ca.gov (confirmed in the DMV teardown), indicating a statewide California government analytics property. EDD additionally runs its own GA4 property (`G-KF25MR5YHK`) and a legacy Universal Analytics property (`UA-3419582-31`) simultaneously — triple-counting visits across three analytics streams.

### DoubleClick Conversion Tracking

The GTM container includes Google DoubleClick (`ad.doubleclick.net`) and Google Ads conversion endpoints. On the unemployment benefits page, `googleads.g.doubleclick.net/pagead/id` fires — ad network conversion tracking on a government unemployment benefits site.

---

## Security Posture

### Missing Security Headers

The main site ships no defensive HTTP headers:

| Header | Status |
|---|---|
| `Content-Security-Policy` | Missing |
| `X-Frame-Options` | Missing |
| `X-Content-Type-Options` | Missing |
| `Referrer-Policy` | Missing |
| `Permissions-Policy` | Missing |
| `Strict-Transport-Security` | Missing on `edd.ca.gov` |

Without `X-Frame-Options` or a `frame-ancestors` CSP directive, any website can embed edd.ca.gov in an iframe. `Strict-Transport-Security` is absent on the main domain but present on `portal.edd.ca.gov` (via Akamai) and `uio.edd.ca.gov` (via Okta). The main site, which links users to those login portals, does not enforce HTTPS via HSTS.

### Stack Information Leakage

Every response from the main site includes: `Server: Microsoft-IIS/10.0`, `X-Powered-By: ASP.NET`, `X-AspNetMvc-Version: 5.2`, `X-AspNet-Version: 4.0.30319`. These headers are trivially removable in IIS configuration and provide version-specific targeting information.

### No Vulnerability Disclosure Program

`/.well-known/security.txt` returns a generic EDD 404 page. No published security contact.

---

## UIBDG: Hidden in Plain Sight

The robots.txt disallows `/en/uibdg/` and `/es/uibdg/`, but these paths return HTTP 200 with full content. The UIBDG (Unemployment Insurance Benefit Determination Guide) contains over 100 pages of detailed internal adjudication policy — the decision frameworks that EDD staff use to evaluate unemployment claims.

Sections include: voluntary quit determinations (with specific disqualifying conditions and case law), misconduct standards, able-and-available requirements, suitable work definitions, total and partial unemployment rules, and trade dispute rules. The guide cites Unemployment Insurance Code sections (e.g., Section 1256) with detailed interpretive guidance.

While this is public policy guidance, suppressing it from search engines via robots.txt while leaving it accessible suggests an attempt to limit discoverability rather than restrict access. For someone filing an unemployment claim, this guide contains the exact criteria their claim will be evaluated against.

---

## Machine Briefing

### Access & Auth

The main site (`edd.ca.gov`) is fully anonymous — standard `curl` or `fetch`. Benefits portals (`myedd.edd.ca.gov`, `uio.edd.ca.gov`, `sdio.edd.ca.gov`) require Okta SSO authentication. Chatbot CloudFront distributions serve static assets and config without auth, with `Access-Control-Allow-Origin: *`.

### Chatbot Config (no auth, CORS: *)

```bash
# Main chatbot config — full AWS infrastructure
GET https://d38ilvijipqsdo.cloudfront.net/lex-web-ui-loader-config.json

# UIO chatbot config — includes live chat API endpoint and translation API
GET https://chatbot.uio.edd.ca.gov/lex-web-ui-loader-config.json

# SDIO chatbot config
GET https://chatbot.sdio.edd.ca.gov/lex-web-ui-loader-config.json
```

### Cognito Identity (anonymous access)

```bash
# Get anonymous Cognito identity
POST https://cognito-identity.us-west-2.amazonaws.com/
Content-Type: application/x-amz-json-1.1
X-Amz-Target: AWSCognitoIdentityService.GetId
{"IdentityPoolId":"us-west-2:8bba3530-2bc6-4e09-858e-57512e61e451"}

# Get temporary AWS credentials for that identity
POST https://cognito-identity.us-west-2.amazonaws.com/
Content-Type: application/x-amz-json-1.1
X-Amz-Target: AWSCognitoIdentityService.GetCredentialsForIdentity
{"IdentityId":"<identity-id-from-above>"}
```

### API Gateway Endpoints (auth required, 403 without)

```bash
# UIO live chat API
https://api.chatbot.uio.edd.ca.gov/

# SDIO chat API
https://api.chatbot.sdio.edd.ca.gov/

# Translation API
https://api.uicc.edd.ca.gov/lex/translate
```

### Okta SSO

```bash
# SAML metadata (public)
GET https://icam.edd.ca.gov/app/exkjij8z2ugcBsnPR4h7/sso/saml/metadata

# Okta tenant
baseUrl: https://icam.edd.ca.gov
clientId: 0oah75f09kkpaNXiL4h7
```

### EPiServer CMS (exposed but auth-gated)

```bash
# CMS login page (200, viewable without auth)
GET https://edd.ca.gov/util/login.aspx

# CMS admin panel (500 Internal Server Error)
GET https://edd.ca.gov/EPiServer/CMS/

# EPiServer Shell (500 Internal Server Error)
GET https://edd.ca.gov/episerver/Shell/
```

### Gotchas

- All chatbot CloudFront distributions have `CORS: *` — cross-origin requests work from any domain.
- The Cognito identity pool issues real AWS credentials scoped to Lex operations. The credential chain is live.
- `myedd.edd.ca.gov` and `portal.edd.ca.gov` return Akamai WAF blocks with a reference number valid for 48 hours.
- Google Custom Search (cx `17efe8f5a2906421d`) handles site search. No EPiServer Find endpoint exists.
- YouTube embeds on pages with the chatbot trigger console errors from the postMessage handler bug.
- UIBDG content at `/en/uibdg/` is accessible despite robots.txt disallow — over 100 pages of adjudication policy.
