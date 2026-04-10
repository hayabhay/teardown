---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Port of Los Angeles — Teardown"
url: "https://portoflosangeles.org"
company: Port of Los Angeles
industry: Transportation
description: "Busiest container port in North America, a department of the City of Los Angeles."
summary: "portoflosangeles.org runs a custom ASP.NET MVC 5.2 frontend on IIS behind Cloudflare, backed by a Kentico 11.0 CMS instance at kentico.portoflosangeles.org that serves all media, documents, and content management. The Kentico instance exposes its admin login page, CSRF tokens, ViewState, and debug mode flag to the public internet. A separate vessel traffic control system runs on portla.org via a KSG/WebX dashboard backed by ASP.NET and Cloudflare. Port Optimizer, the supply chain data platform, runs Angular behind Imperva WAF and Kong API Gateway on portoptimizer.com."
date: 2026-04-07
time: "03:49"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack:
  - ASP.NET MVC
  - IIS
  - Kentico CMS
  - Cloudflare
  - jQuery
  - Bootstrap
  - Kong Gateway
  - Imperva WAF
trackers:
  - Google Analytics UA
  - Google Analytics 4
  - Google Tag Manager
  - MediaMath
  - Tribal Fusion
  - Twitter Platform
  - Google Translate
  - Juicer
  - Google reCAPTCHA
  - UserWay
  - Google CSE
tags:
  - government
  - port
  - shipping
  - no-consent
  - legacy-cms
  - kentico
  - ad-tracking
  - debug-mode
  - vendor-ecosystem
  - critical-infrastructure
headline: "The Kentico CMS admin login at kentico.portoflosangeles.org is publicly reachable with debug mode enabled — on infrastructure managing America's busiest container port."
findings:
  - "The Kentico 11.0 CMS admin panel at kentico.portoflosangeles.org/CMSPages/logon.aspx is fully exposed to the internet with isDebuggingEnabled set to true, serving ViewState tokens, CSRF tokens, and session IDs on every request — Kentico 11.0 reached end of life in October 2020."
  - "A government port website fires MediaMath and Tribal Fusion ad-tracking pixels alongside Google Analytics on every page load with no consent prompt — ad network surveillance on critical infrastructure that has no commercial products to advertise."
  - "The robots.txt points to a dead external sitemap host (a157189.sitemapshosting.com) that no longer resolves, while the actual 14,185-URL sitemap lives on the main domain — search engines following the canonical directive get nothing."
  - "The City of LA global emergency alert navbar loaded from S3/CloudFront on every page still contains placeholder variables — navbarCitywideEmergencyText is literally set to '<ENTER DESIRED TITLE>' — meaning the citywide alert system has never been configured for this department."
  - "Every page loads Universal Analytics UA-4123339-1 twice — once in the head before GTM, and again through the GTM container GTM-5GCXK6P alongside GA4 property G-EMXHJRYLTH — duplicating every pageview hit to a deprecated analytics property."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

The Port of Los Angeles website runs on **ASP.NET MVC 5.2** with **ASP.NET 4.0.30319** behind **Cloudflare**. Response headers expose the full stack: `X-AspNetMvc-Version: 5.2`, `X-AspNet-Version: 4.0.30319`, `X-Powered-By: ASP.NET`. The `www.portoflosangeles.org` subdomain 301-redirects to the bare `portoflosangeles.org` domain. The TLS certificate is a Cloudflare wildcard covering `portoflosangeles.org` and `*.portoflosangeles.org`.

The frontend is built with **jQuery 3.7.1** and **Bootstrap 3.4.1**, using Swiper for the homepage carousel. CSS and JS assets carry manual cache-busting query strings (`?ds=20210517`, `?ds=0213261`, `?021326`, `?021526`), suggesting manual deployments rather than a build pipeline. Font Awesome Pro is loaded from a local path (`/Content/fontawesome-pro/css/all.min.css`).

Content management runs on **Kentico CMS 11.0** at `kentico.portoflosangeles.org`. The version is confirmed by the `GetDocLink.ashx` endpoint, which redirects to `kentico.com/CMSPages/DocLinkMapper.ashx?version=11.0`. Kentico 11.0 was released in Q4 2017 and reached end of life in October 2020. All media assets -- images, PDFs, videos -- are served from the Kentico instance via `getmedia/{GUID}/{filename}` and `getattachment/{GUID}/attachment.aspx` endpoints. Homepage hero slides, featured news images, terminal maps, financial documents, and mariner guides all load from this subdomain.

The main domain serves the presentation layer (ASP.NET MVC controllers, views, static assets), while Kentico handles content storage, media serving, and the CMS admin interface. This split is visible in the HTML: the main domain generates the page structure, but all content URLs point to `kentico.portoflosangeles.org`.

### Subdomain and Related Domain Map

| Domain | Stack | Function |
|--------|-------|----------|
| `portoflosangeles.org` | ASP.NET MVC 5.2 / Cloudflare | Main public website |
| `kentico.portoflosangeles.org` | Kentico CMS 11.0 / ASP.NET / Cloudflare | Content management, media serving |
| `permits.portoflosangeles.org` | ASP.NET MVC 5.2 / Cloudflare | Online Permit Application Portal |
| `lapilot.portla.org` | ASP.NET / KSG WebX / Cloudflare | Vessel traffic control dashboard |
| `tower.portoptimizer.com` | Angular / nginx 1.27.2 / Kong 3.9.1 / Imperva WAF | Port Optimizer Control Tower |
| `track.portoptimizer.com` | Angular / nginx 1.27.2 / Kong 3.9.1 / Imperva WAF | Port Optimizer Track & Trace |
| `signal.portoptimizer.com` | Angular / nginx / Kong / Imperva WAF | Port Optimizer Signal |
| `portoflabonds.org` | BondLink SaaS / nginx | Investor relations portal |
| `portoflapolice.nextrequest.com` | NextRequest (CivicPlus) SaaS | Port Police public records requests |

The Port Optimizer platform at `portoptimizer.com` sits behind Imperva WAF (Incapsula) and routes through **Kong API Gateway 3.9.1**. The `X-Kong-Request-Id` header is present on every response. The static frontend is served by **nginx 1.27.2**.

BondLink at `portoflabonds.org` uses JWT-based session management with a custom cross-domain auth flow (`/v2/xd-auth/init/` and `/v2/xd-auth/finish/`). The P3P header literally reads `CP="BondLink does not have a P3P Policy"`.

---

## Kentico CMS Exposure

### Admin Login Page

The Kentico CMS admin login page is publicly accessible at:

```
https://kentico.portoflosangeles.org/CMSPages/logon.aspx
```

The page serves a fully functional login form with username and password fields, "Forgotten password" and "Select language" links, and JavaScript for caps-lock detection and dialog management. The `/admin` path redirects through `/Admin/CMSAdministration.aspx` to the same logon page.

Every response from the Kentico admin login page includes:

- `__CMSCsrfToken` -- a Kentico-specific CSRF token in a hidden form field
- `__VIEWSTATE` -- a large ASP.NET ViewState blob (1.2KB+ base64)
- `__VIEWSTATEGENERATOR: 521C503C`
- `__EVENTVALIDATION` -- ASP.NET event validation token
- `CMSCsrfCookie` -- set as an HttpOnly cookie
- `ASP.NET_SessionId` -- session cookie (HttpOnly, SameSite=Lax)
- `CMSPreferredCulture: en-US` -- culture preference cookie

### Debug Mode Enabled

The Kentico admin page JavaScript configuration object on the login page contains:

```javascript
CMS.Application = {
  "language": "en",
  "imagesUrl": "/CMSPages/GetResource.ashx?image=%5bImages.zip%5d%2f",
  "isDebuggingEnabled": true,
  "applicationUrl": "/",
  "isDialog": false,
  "isRTL": "false"
};
```

`isDebuggingEnabled: true` in production means the CMS will output detailed error messages, stack traces, and diagnostic information when errors occur. On a CMS managing content for America's busiest container port, this provides an information gathering surface for targeted attacks.

### CMS Resource Endpoints

The Kentico instance serves its internal resources without authentication:

```
GET https://kentico.portoflosangeles.org/CMSPages/GetResource.ashx?stylesheetfile=/App_Themes/Default/bootstrap.css
GET https://kentico.portoflosangeles.org/CMSPages/GetResource.ashx?stylesheetfile=/App_Themes/Default/CMSDesk.css
GET https://kentico.portoflosangeles.org/CMSPages/GetResource.ashx?stylesheetfile=/App_Themes/Default/DesignMode.css
GET https://kentico.portoflosangeles.org/CMSPages/GetResource.ashx?scriptfile=%7e%2fCMSScripts%2fjquery%2fjquery-core.js
GET https://kentico.portoflosangeles.org/CMSPages/GetResource.ashx?scriptfile=%7e%2fCMSScripts%2fRequireJS%2fconfig.js&resolvemacros=1
```

The `CMSDesk.css` stylesheet has `Last-Modified: Mon, 11 Dec 2017 12:01:16 GMT`, consistent with the Kentico 11.0 release timeline. The `config.js` file, also dated December 2017, exposes the CMS script module loading path: `CMSConfigRequire("/CMSPages/GetResource.ashx?scriptmodule=","/CMSScripts/")`.

### Media and Document Access

All media assets are served via the Kentico getmedia endpoint with GUID-based URLs. No authentication is required. Documents served include:

- **Five-Year Capital Expenditure Plan** (507KB PDF, last modified August 2025)
- **Financial Policies** (2.4MB PDF, last modified February 2022)
- **2026 POLA Mariners Guide** (operational navigation document)
- **Pilotage regulations** (SEC03)
- **2026 Board Meeting Schedule**
- **2025 Container Terminals Map**

The GUID structure (`getmedia/{guid}/{friendly-name}`) is predictable once a GUID is known; GUIDs are embedded in the public HTML source.

---

## Vessel Traffic Control

The LA Pilots vessel traffic dashboard runs at `lapilot.portla.org` using a **KSG WebX** reporting framework. The dashboard is publicly accessible without authentication:

```
https://lapilot.portla.org/webx/dashb.ashx?db=pola.trafficcontrol
```

The application uses report code `POLA-WEB-0003` titled "Traffic Control" with a 1-minute auto-refresh interval (`iGridRefreshInterval: 1`). The session is explicitly marked as public (`SSN.SessionInfo.isPublic = true`) with a server timezone offset of 420 minutes (Pacific Time).

The WebX application loads a full set of JavaScript modules including DataTables, jQuery UI, Kendo Upload, and custom KSG report grid components. The dashboard form ID is `29d48b6-7e12-42bb-a68f-ee2ed9cb7f6f` and includes a large base64-encoded session stamp. Response headers include `WEBX_SESSION` as an empty cookie, and the domain `portla.org` is Cloudflare-proxied with HSTS and standard security headers.

---

## Tracking and Surveillance

### No Consent Mechanism

portoflosangeles.org has no cookie consent banner, no CMP, and no opt-out mechanism on any page. The privacy policy page acknowledges cookies exist but offers no technical mechanism to refuse tracking. The policy states users can "opt out" by contacting the port and receiving a response "within 30 days" -- there is no programmatic opt-out.

### Ad Network Tracking on Government Infrastructure

Every page loads two ad network tracking pixels before any user interaction:

**MediaMath (MathTag):**
```html
<script language='JavaScript1.1' async src='//pixel.mathtag.com/event/js?mt_id=1460168&mt_adid=217776&mt_exem=&mt_excl=&v1=&v2=&v3=&s1=&s2=&s3='></script>
```

**Tribal Fusion (Exponential/VDX.tv):**
```javascript
var a9 = new Object();
a9.clientName = "Port%20of%20Los%20Angeles";
a9.clientID = 788203;
a9.eventType = "visitor";
a9.segmentNumber = 0;
a9.segmentName = "Sitewide";
```
```html
<script type="text/javascript" src="//a.tribalfusion.com/pixel/tags/Port%20of%20Los%20Angeles/788203/pixel.js"></script>
```

The Tribal Fusion pixel fires to `s.tribalfusion.com` and includes a P3P header (`CP="NOI DEVo TAIa OUR BUS"`) on its response. MediaMath responds from `MT3 2474` servers with a P3P header (`CP="NOI DSP COR NID CURa ADMa DEVa PSAa PSDa OUR BUS COM INT OTC PUR STA"`).

These are programmatic advertising pixels used for audience building and retargeting. A government port authority with no commercial products to sell is feeding visitor data to ad exchanges.

### Duplicate Google Analytics

Universal Analytics property `UA-4123339-1` is loaded twice on every page:

1. **First load** (line 21 of HTML): Direct `gtag.js` script tag in the `<head>` element
2. **Second load**: Through GTM container `GTM-5GCXK6P`

Additionally, GA4 property `G-EMXHJRYLTH` is loaded via a separate `gtag.js` script tag. This means every pageview is recorded three times: twice to the legacy UA property and once to GA4. Universal Analytics was deprecated by Google in July 2023.

### Additional Trackers

| Tracker | Implementation | Purpose |
|---------|---------------|---------|
| Google Tag Manager | `GTM-5GCXK6P` | Tag orchestration |
| Twitter Platform | `platform.twitter.com/widgets.js` | Social embedding |
| Google Translate | `translate.google.com/translate_a/element.js` | Translation widget |
| Google reCAPTCHA | sitekey `6LelyxAqAAAAANltxwimoyCyV-CACxER9e62JL-O` | Form protection |
| Google CSE | cx `002795381298339986234:snxqixfp1ea` | Site search |
| Juicer.io | feed ID `portofla` | Social media aggregation |
| UserWay | account `H3YDnBh1tx` | Accessibility widget |

---

## City of LA Global Navbar

Every page loads a JavaScript file from the City of Los Angeles:

```html
<script src="//navbar.lacity.org/global_nav.js" type="text/javascript"></script>
```

This file is served from **Amazon S3** via **CloudFront** (edge `SFO53-P5`). The 24KB script is self-described as "City of Los Angeles - Global Branding v4.0" and includes a citywide emergency alert system. However, the alert configuration variables have never been set:

```javascript
var navbarCitywideEmergencyText = '<ENTER DESIRED TITLE>';
var navbarCitywideEmergencyLink = '<ENTER DESIRED LINK>';
var alertShow = "no";
```

The `<ENTER DESIRED TITLE>` placeholder has been in production since the script was created. For a port that handles critical infrastructure, emergency communications, and sits in a seismic and tsunami zone, the citywide alert system being permanently unconfigured is a notable gap.

---

## Dead Sitemap Reference

The `robots.txt` at portoflosangeles.org contains:

```
# robots.txt for portoflosangeles.org
User-agent: *
Disallow: 

Sitemap: http://a157189.sitemapshosting.com/4073382/sitemap.xml.gz
```

The sitemap URL points to `a157189.sitemapshosting.com`, which does not resolve -- DNS lookup fails entirely. The actual sitemap exists at `https://portoflosangeles.org/sitemap.xml` (14,185 URLs), but search engines following the `robots.txt` directive would never find it. The sitemap reference also uses HTTP rather than HTTPS.

The sitemap itself is functional and includes URLs from both the main domain and the Kentico subdomain (for documents like the Mariners Guide, Pilotage regulations, terminal maps, and board meeting schedules).

---

## eAlerts Subscription System

The footer of every page includes a modal form for email alert subscriptions, submitting to `/contact/ajax_modalealerts`. The form collects first name, last name, organization, and email address, with subscription categories:

- Board Agendas
- Cargo Updates
- Community (events, LA Waterfront, Currents newsletter)
- News (all port stories)
- All of the above

The form is protected by Google reCAPTCHA v2 (sitekey `6LelyxAqAAAAANltxwimoyCyV-CACxER9e62JL-O`). The submit button is disabled until the CAPTCHA is completed. The form uses ASP.NET MVC unobtrusive AJAX for submission.

---

## Machine Briefing

### Access and Auth

The main site requires no authentication for any public page. The Kentico CMS admin panel requires credentials (login form at `/CMSPages/logon.aspx`). The vessel traffic dashboard at `lapilot.portla.org` is explicitly public. Port Optimizer (tower/track/signal) requires registration for data access.

### Endpoints

**Main domain (no auth):**
```
GET https://portoflosangeles.org/                          (homepage)
GET https://portoflosangeles.org/sitemap.xml               (14,185 URLs)
GET https://portoflosangeles.org/robots.txt                (dead sitemap reference)
GET https://portoflosangeles.org/business/operations       (cargo dashboard)
GET https://portoflosangeles.org/business/statistics/container-statistics
GET https://portoflosangeles.org/getmedia/{GUID}/{name}    (proxied from Kentico)
```

**Kentico CMS (no auth for media; login required for admin):**
```
GET https://kentico.portoflosangeles.org/CMSPages/logon.aspx           (admin login)
GET https://kentico.portoflosangeles.org/getmedia/{GUID}/{name}        (media files)
GET https://kentico.portoflosangeles.org/getattachment/{GUID}/attachment.aspx  (attachments)
GET https://kentico.portoflosangeles.org/CMSPages/GetResource.ashx?stylesheetfile={path}
GET https://kentico.portoflosangeles.org/CMSPages/GetResource.ashx?scriptfile={path}
GET https://kentico.portoflosangeles.org/CMSPages/GetDocLink.ashx?link={topic}  (version leak)
```

**Known document GUIDs (all serve without auth):**
```
345f5799-3f7d-4a2c-823c-26d92d0c6e79  Five-Year Capital Expenditure Plan (PDF)
69eedaac-186c-48f3-be57-c0cf8e602264  Financial Policies (PDF)
032862cd-8f0b-4167-8c50-9aa149c34e1f  2026 POLA Mariners Guide
e8422394-263f-4972-8944-666ede90ed0b  Pilotage Regulations (SEC03)
39d88381-282b-4bb2-9aa8-cf15aee33127  2026 Board Meeting Schedule
b1277c2b-c88c-4c1e-aedb-113706d28543  2025 Container Terminals Map
```

**Vessel traffic (no auth):**
```
GET https://lapilot.portla.org/webx/dashb.ashx?db=pola.trafficcontrol
```

**Permits portal (no auth for application type selection):**
```
GET https://permits.portoflosangeles.org/application-type
```

**Port Police public records:**
```
GET https://portoflapolice.nextrequest.com/
```

**Drone flight history (public):**
```
GET https://app.airdata.com/u/lapp
```

**City of LA global nav (S3/CloudFront):**
```
GET https://navbar.lacity.org/global_nav.js
```

### Gotchas

- **www subdomain redirects** -- `www.portoflosangeles.org` 301-redirects to `portoflosangeles.org`. Always use the bare domain.
- **Kentico 11.0 EOL** -- end of life since October 2020. The CMS no longer receives security patches.
- **Kentico debug mode** -- `isDebuggingEnabled: true` means error pages may expose stack traces and internal paths. Observed on the admin login page JavaScript.
- **Kentico media GUIDs** -- all media is served via `getmedia/{GUID}/{friendly-name}`. GUIDs are discoverable from page source. Both the main domain (`/getmedia/...`) and Kentico subdomain (`kentico.portoflosangeles.org/getmedia/...`) serve the same assets.
- **Dead sitemap host** -- `a157189.sitemapshosting.com` in robots.txt does not resolve. The actual sitemap is at `/sitemap.xml`.
- **Dual UA tracking** -- Universal Analytics `UA-4123339-1` is loaded twice per page (direct script + GTM). Analytics data will show inflated pageviews.
- **Vessel traffic refresh** -- the KSG WebX dashboard auto-refreshes every 1 minute. The session stamp in the page source is a large base64 blob that may expire.
- **BondLink JWT** -- `portoflabonds.org` uses JWT session cookies (`BONDLINK=eyJ...`) with a cross-domain auth flow. The JWT payload includes a CSRF token and modification timestamp.
- **Port Optimizer behind WAF** -- Imperva WAF cookies (`visid_incap_2599010`, `nlbi_2599010`, `incap_ses_`) are set on portoptimizer.com. Rate limiting is active.
