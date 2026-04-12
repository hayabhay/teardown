---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Bay Area FasTrak — Teardown"
url: "https://www.bayareafastrak.org"
company: "Bay Area FasTrak"
industry: Government
description: "Regional toll collection system for Bay Area bridges and express lanes."
summary: "Dual-system site: WordPress CMS for public content and a Java/JEE backend (IBM WebSphere) for account management, both fronted by Imperva WAF and an F5 BigIP load balancer. Operated by Conduent State & Local Solutions on behalf of the Bay Area Toll Authority. The account system runs on Conduent's multi-tenant Vector platform -- the same codebase deployed for toll systems in New York and New Jersey, transit payments for SEPTA, and portals for the US Department of Labor, DC Medicaid, and the UK Health Security Agency."
date: 2026-04-12
time: "21:11"
contributor: hayabhay
model: sonnet
effort: medium
stack:
  - WordPress
  - Java/JEE
  - IBM WebSphere
  - Imperva
  - F5 BigIP
trackers:
  - AppDynamics
  - Imperva Reese84
tags:
  - toll-collection
  - government
  - conduent
  - shared-platform
  - ip-leak
  - means-tested
  - multi-tenant
  - java
  - websphere
  - infrastructure-exposure
headline: "FasTrak's toll site shares a codebase with NY tolls, SEPTA, DC Medicaid, and the UK's health security agency -- all visible in one TLS certificate."
findings:
  - "The account system loads a JavaScript file named ezpass.js and CSS referencing a Texas DOT spinner -- artifacts of Conduent's shared government platform, whose TLS cert also covers NY/NJ tolls, SEPTA, the US Department of Labor, DC Medicaid, and the UK's UKHSA."
  - "The F5 BigIP persistence cookie (v4BATAcookie) decodes to two private backend IPs -- 10.36.160.103 and 10.36.160.104 -- sent to every visitor in HTTP response headers."
  - "An unauthenticated API endpoint with a typo in its name (MeansBasedDicount.do) returns income-based toll discount enrollment details for any submitted code, with no CAPTCHA or session required."
  - "Two Jira tickets (BATAVEC-18553, BATAVEC-31531) and a developer's full name are hardcoded in HTML source across all account pages -- exposed because the shared template was never cleaned before deployment."
  - "The privacy policy carries a 2010 effective date while covering programs that opened in 2025, and toll crossing data -- every bridge, timestamp, location -- is retained 4.5 years and linked to SSN via the Franchise Tax Board."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Bay Area FasTrak is the regional electronic toll collection system operated by the Bay Area Toll Authority (BATA) and Metropolitan Transportation Commission (MTC), covering the Bay Bridge, Golden Gate, and other crossings, plus the express lane network on I-580, I-680, SR-237, and I-80. The site handles transponder accounts, license-plate-based video toll billing, violation inquiries, and enrollment in income-based discount programs for low-income commuters.

The site is not built by BATA. It's operated under contract by Conduent State & Local Solutions -- and once you look at the infrastructure, that distinction matters a great deal.

## Architecture

The site runs as two separate systems on one domain. Public content -- FAQs, news, program information -- lives on WordPress, served from `/en/`, `/es/`, and `/zh/` paths with a `.shtml` extension rewrite. Account management, billing, violations, and enrollment live on a Java/JEE application at `/vector/` endpoints, using `.do` URLs consistent with Apache Struts or Spring MVC routing.

Both systems sit behind Imperva (Incapsula) as a WAF and CDN. Behind Imperva is an F5 BigIP load balancer. The Java backend runs on IBM WebSphere -- fingerprinted from the JSESSIONID format: `0001rVAEaMJ2LdubzvGoxpVHPU5:-1810K4L` and `0001NapuHr4cQNBrzc0H1eVBGsv:2QT3TEJA31`. The two different node suffixes confirm a two-node WebSphere cluster behind the load balancer.

The redirect chain on entry: `bayareafastrak.org` -> `www.bayareafastrak.org` (301) -> `www.bayareafastrak.org/en/home/index.shtml` (302).

The copyright metadata on the login page reads: `Copyright (c) 2014-2015 ACS`. ACS is Affiliated Computer Services -- acquired by Xerox in 2010, spun off as Conduent in 2017. The codebase dates from before that spinoff.

The site supports three language variants (English, Spanish, Chinese), routed via path prefix. Language switching is handled client-side via jQuery path manipulation in `scripts.js`.

The account management system has four distinct portals sharing the same visual template and assets:
- `/vector/account/` -- FasTrak transponder account management
- `/vector/videotolls/` -- Video tolls (license plate billing, no transponder)
- `/vector/invoices/` -- Invoice/violation lookup (public, no login)
- `/vector/violations/` -- Violation inquiry (public)
- `/vector/retailers/` -- Retailer portal (redirects to homepage without auth; logout endpoint at `/vector/retailers/retailerLogout.do`)

## The Conduent Platform

The most revealing aspect of bayareafastrak.org is what it shares with other government clients. The account backend is Conduent's multi-tenant Vector platform -- one codebase deployed for multiple states and agencies -- and the evidence is hard to miss once you look.

**The JavaScript file names:** The login and account pages load a file called `ezpass.js`. E-ZPass is the northeastern US toll collection network (New York, New Jersey, Pennsylvania, and others). The file content is identical to `scripts.js` -- the name is a deployment artifact, left over from a shared codebase that also serves E-ZPass deployments.

**The asset paths:** The CSS source references `/vector/txdot/app/images/spinner3-black.gif` -- a loading spinner for the Texas Department of Transportation. It appears twice in the login page source. Bay Area FasTrak isn't TxDOT. The spinner loads because both deployments share templates.

**The TLS certificate:** The certificate for `www.bayareafastrak.org` is a shared Imperva certificate (CN=imperva.com, issued by GlobalSign Atlas R3 DV TLS CA 2026 Q1) covering over 100 domains. The Subject Alternative Names include:
- `ezpassny.com`, `*.e-zpassny.com`, `tollsny.com`, `tollsbymailny.com` -- New York toll systems
- `*.nj.services.conduent.com` -- New Jersey
- `septakey.org`, `*.septakey.org` -- SEPTA (Philadelphia transit authority)
- `*.dol.gov`, `*.dolsyst.portal.conduent.com` -- US Department of Labor
- `*.dc-medicaid.com` -- DC Medicaid
- `*.cims.ukhsa.gov.uk` -- UK Health Security Agency (UKHSA)
- `*.mohealthnet.conduent.com` -- Missouri Health Net
- `mylacountybenefits.com` -- Los Angeles County benefits
- `raytheon.benefitcenter.com`, `aramark.benefitcenter.com`, `verizonbenefitsconnection.com`, `exxonmobil-lumpsum-window.com` -- corporate benefits portals

The same platform, and to a large extent the same codebase, runs toll collection in California, New York, and New Jersey, transit payments in Philadelphia, Medicaid portals in DC and Missouri, workforce benefits for LA County, and a national health security system in the UK. A security issue in the shared platform propagates across all of them.

The Conduent footprint inside the site's own headers and code:
- AppDynamics monitoring beacons go to `eum-east.services.conduent.com` -- not AppDynamics SaaS, Conduent's own infrastructure
- App key `EUM-AAB-AUB` in the AppDynamics config (consistent with "Bay Area BATA" in Conduent's internal naming)
- JIRA project prefix `BATAVEC` (Bay Area Toll Authority + Vector) in two tickets hardcoded in the account page HTML source

## Load Balancer Cookie Decodes to Internal IPs

The F5 BigIP persistence cookie is named `v4BATAcookie` -- `v4` for load-balancer version 4, `BATA` for Bay Area Toll Authority. Every HTTP response from the site includes this cookie in the `Set-Cookie` header:

```
Set-Cookie: v4BATAcookie=1755325450.47873.0000; path=/; Httponly; Secure
```

The value is not random. F5 BigIP cookies in this format encode the backend server's private IP address and port using a standard obfuscation: the first number is the IP in little-endian hex decoded to decimal, and the port is encoded in the second segment. Two values were observed:

| Cookie value | Decoded IP | Decoded port |
|---|---|---|
| `1755325450.47873.0000` | 10.36.160.104 | 443 |
| `1738548234.47873.0000` | 10.36.160.103 | 443 |

Both servers are in the 10.36.160.x private subnet, both on port 443. The two addresses confirm the two-node cluster also visible in the JSESSIONID values. This is sent to every visitor -- the cookie is HttpOnly (not accessible via JavaScript) but plainly visible in the raw HTTP response headers.

This class of F5 BigIP information disclosure has been documented for years (related to CVE-2020-5902). Whether the backend servers are reachable directly -- bypassing Imperva -- depends on network configuration, but the addresses are now known to any visitor who inspects their headers.

## Unauthenticated Enrollment Verification API

The Express Lanes START program offers discounted tolls for low-income Bay Area commuters who qualify through CalFresh, Medi-Cal, or other means-based programs. When applicants create a FasTrak account, they submit an enrollment code to verify eligibility. That verification goes through a public, unauthenticated API endpoint:

```
POST /vector/account/signup/MeansBasedDicount.do
```

Note the typo: `MeansBasedDicount` instead of `MeansBasedDiscount`. The endpoint name is missing an 's'. It appears in the account signup page's form logic and is callable directly.

The endpoint takes three parameters: `meansDiscountVal` (the enrollment code), `firstName`, and `lastName`. No session token. No CAPTCHA. No `Authorization` header. The response is JSON:

**Invalid code:**
```json
{
  "StartDate": "",
  "DiscountPlan": "",
  "ResponseCode": "0",
  "VerificationCode": "TEST123",
  "ResponseMsg": "You have entered an invalid enrollment code. Please check your code and try again.",
  "EndDate": "",
  "status": "FALSE"
}
```

**Empty parameters:**
```json
{
  "StartDate": "",
  "DiscountPlan": "",
  "ResponseCode": "0",
  "ResponseMsg": "Start Verification Code or First Name or Last Name is empty.",
  "EndDate": "",
  "status": "FALSE"
}
```

A valid code would return the `DiscountPlan`, `StartDate`, and `EndDate` fields populated -- the enrollment details for a low-income toll discount. The endpoint echoes back the submitted code in `VerificationCode`. No rate-limiting was observed in the response headers, though load-based limits are not testable from static analysis. Whether enrollment codes follow predictable patterns is unknown, but the endpoint accepts arbitrary input with no apparent throttling.

The typo in the endpoint name suggests limited code review on this particular path.

## Source Code Comments

Two Jira ticket numbers appear in the HTML source of every account management page -- login, signup, account overview:

```html
<!-- BATAVEC-18553  -->
```

```js
/* BATAVEC-31531 Web Password Show Icon - Siri */
```

`BATAVEC-31531` is inline in JavaScript and includes the feature description ("Web Password Show Icon") and what appears to be a developer identifier ("Siri" -- likely a short name or handle). A chat integration comment elsewhere on the same pages reads:

```html
<!-- Added for VCC chat Sivasubramanian -->
```

This is the full name of a developer responsible for the VCC (Virtual Contact Center) chat widget integration. These are typical developer annotations committed to a shared template and never cleaned before deployment. Given that this is a multi-tenant platform, they appear across all pages without any scoping.

A legacy JSP path is also visible in a commented-out anchor tag: `jsp/account/maintenance/convertion/my_account.html` -- a pre-migration route from what appears to be an older account system.

## Tracking & Surveillance

Network traffic from bayareafastrak.org is unusually clean for a modern website. The homepage makes exactly two requests: one to Imperva's Reese84 bot challenge endpoint and one AppDynamics beacon. No Google Analytics. No Tag Manager. No Meta pixel. No advertising stack at all.

This is appropriate for a government toll authority -- the site has no commercial advertising and collects tolls, not attention.

**What is present:**

**Imperva/Incapsula** -- WAF, bot protection, CDN. Sets three cookie namespaces on the main domain: `visid_incap_1741146` (persistent, expires 1 year), `nlbi_1741146` (session), `incap_ses_414_1741146` (session). Four distinct Incapsula site IDs were observed across the FasTrak subdomain set: `1741146` (main site), `1591020` (test subdomain), `1591011` (e-statements), `1581661` (chat).

**Reese84 (Imperva)** -- Advanced bot detection layer, distinct from standard Incapsula. Sets its own `reese84` cookie. The JavaScript fingerprinting bundle is loaded as heavily obfuscated code (`a1_0x281d`, `a1_0x47aa`, `_0x7b79`, `_0x97b7` variable naming), and the challenge endpoint uses a randomized path that changes per session.

**AppDynamics (Conduent-hosted)** -- Real User Monitoring, configured to send beacons to `eum-east.services.conduent.com` rather than the standard AppDynamics SaaS (`eum.appdynamics.com`). Configuration:

```json
{
  "appKey": "EUM-AAB-AUB",
  "adrumExtUrlHttp": "/adrum",
  "adrumExtUrlHttps": "/adrum",
  "beaconUrlHttp": "http://eum-east.services.conduent.com:7001",
  "beaconUrlHttps": "https://eum-east.services.conduent.com",
  "xd": {"enable": false}
}
```

Cross-domain tracking is disabled (`xd.enable: false`). All performance monitoring data -- page loads, AJAX timings, errors, user sessions -- goes to Conduent's own infrastructure. The agent is version `20.12.0.3360`, from December 2020, over five years old.

The AppDynamics JS sets an `ADRUM` cookie containing the current page URL in plaintext (observed by the investigator during the session). The cookie is not HttpOnly, making it readable by any JavaScript on the page and visible to Imperva in request headers as the user navigates.

**Survey redirect:** The site's feedback form routes to `survey.tpcdm.com` -- a Proponisi customer satisfaction platform. This is an off-site redirect, not an embedded tracker.

## Privacy Policy & Data Retention

The FasTrak privacy policy carries an effective date of **December 15, 2010** (noted by the investigator during their session). The policy text references the I-80 Express Lanes, which opened in December 2025 -- suggesting the document body has been updated for new programs without updating the effective date, or that substantive data practice review hasn't occurred in 15 years.

Key retention terms from the policy:
- **PII retained 4.5 years after account closure.** This includes toll transaction history -- every crossing, timestamp, and location.
- **Income documentation** for the means-based discount program is destroyed within 60 days of the eligibility decision.
- **Law enforcement sharing:** "BATA or its contractors may share PII with other government agencies... and to law enforcement agencies, as required by law."
- **SSN linkage via FTB:** For accounts sent to collections, BATA obtains full name, address, and vehicle/plate information from the California Franchise Tax Board using the account holder's Social Security Number. The result is toll crossing data (location + time of every trip) linked to SSN in the collections pipeline.

## Infrastructure Age

The account system's copyright metadata (`Copyright (c) 2014-2015 ACS`) places the codebase origin before Conduent's 2017 spin-off. The AppDynamics agent is from December 2020. The JavaScript library stack -- jQuery 3.5.1 (released May 2021), Bootstrap 4 (EOL 2023) -- is functional but several years behind current releases.

The two JS files (`scripts.js` and `ezpass.js`) show a `Last-Modified` date of March 30, 2026 -- recent deployment, but the content is the same utility functions. Active maintenance on a legacy platform.

A decoy header pattern appears in all HTTP responses: `Server:`, `X-POWERED-BY:`, and `X-ASPNET-VERSION:` are all present with empty values. The ASP.NET header is a Conduent platform artifact -- this is definitively a Java application, not .NET -- but the header key is retained in the response, either as deliberate misdirection or a configuration leftover.

## Subdomains

Three subdomains confirmed from SSL cert SANs, none fully operational at investigation time:
- `test.bayareafastrak.org` -- Returns HTTP 503 (Imperva backend unreachable)
- `chat.bayareafastrak.org` -- Returns HTTP 503 (Imperva TCP connection timeout)
- `e-statements.bayareafastrak.org` -- Returns HTTP 200 with an Imperva bot detection block

## Machine Briefing

**Access & Auth**

The WordPress CMS pages (`/en/`, `/es/`, `/zh/`) are fully accessible without authentication -- standard curl or fetch works. The Java backend (`/vector/`) serves some pages publicly (violation lookup, invoice lookup, signup form, enrollment verification) and requires a session for account-specific pages. Sessions are established via the standard login forms at `/vector/account/home/accountLogin.do` and `/vector/videotolls/home/accountLogin.do`. No auth is needed for the endpoints listed below.

Imperva WAF is active and enforces bot detection via Reese84 on first request. The Reese84 challenge runs before any page content loads. Browser automation or requests with full browser headers + cookie handling pass. Raw curl may be blocked.

**Open endpoints (no auth required)**

```
# Income-based discount enrollment code verification
POST https://www.bayareafastrak.org/vector/account/signup/MeansBasedDicount.do
Content-Type: application/x-www-form-urlencoded

meansDiscountVal=CODE&firstName=FIRST&lastName=LAST

# Response (invalid code):
{"StartDate":"","DiscountPlan":"","ResponseCode":"0","VerificationCode":"CODE","ResponseMsg":"You have entered an invalid enrollment code...","EndDate":"","status":"FALSE"}

# Violation inquiry (requires valid violation number, plate, state)
POST https://www.bayareafastrak.org/vector/violations/bataViolationInquiry.do

# Invoice lookup
POST https://www.bayareafastrak.org/vector/invoices/invoiceAndViolation.do

# Chat AJAX endpoint (returns empty body from browser)
POST https://www.bayareafastrak.org/vector/homepage/HomePage.do?fbpz=skip&exclGen=true&ajax=chat
```

**AppDynamics beacon (unauthenticated, but rate-limited by Conduent)**

```
POST https://eum-east.services.conduent.com/eumcollector/beacons/browser/v1/EUM-AAB-AUB/adrum
```

**JavaScript assets**

```
/vector/bata/app/jscript/jquery-3.5.1.min.js
/vector/bata/app/jscript/ezpass.js        # = scripts.js, different name
/vector/bata/app/jscript/scripts.js
/vector/bata/app/jscript/vendor.js        # Bootstrap 4, Popper.js, bootstrap-select
/vector/bata/adrum/adrum-ext.{hash}.js    # AppDynamics RUM extension
```

**Gotchas**

- The F5 BigIP cookie (`v4BATAcookie`) is set on every response and will update between requests as the load balancer routes to different backend nodes.
- JSESSIONID format includes the WebSphere cluster node suffix (`:-1810K4L`, `:2QT3TEJA31`). Different node IDs may return slightly different behavior.
- `MeansBasedDicount.do` -- note the typo (missing 's'). The correct path is `MeansBasedDicount`, not `MeansBasedDiscount`.
- The Reese84 challenge path changes per session -- don't hardcode it.
- Video tolls system is a separate auth domain from FasTrak transponder accounts. They share the visual template but use different login paths and separate session cookies.
- The retailer portal (`/vector/retailers/`) redirects to homepage without auth, no visible login page.
