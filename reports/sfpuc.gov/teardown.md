---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "SF Public Utilities Commission — Teardown"
url: "https://www.sfpuc.gov"
company: "SF Public Utilities Commission"
industry: Utilities
description: "San Francisco's municipal water, power, and sewer utility."
summary: "SFPUC.gov runs Drupal 10.5.7 on Pantheon CDN with Varnish and nginx, using a custom sfwater theme on Zurb Foundation. Three independent Google Ads tag containers load via separate gtag.js scripts rather than a tag manager, alongside two GA4 properties, a dead Universal Analytics property, Crazy Egg session recording, and Monsido heatmaps. Customer billing splits across two ASP.NET/IIS portals at myaccount-water.sfpuc.org (Citrix NetScaler-balanced) and myaccount-power.sfwater.org (SmartUsys SCP vendor platform). The CleanPowerSF program runs on Squarespace."
date: 2026-04-07
time: "04:02"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack:
  - Drupal 10
  - Pantheon
  - Varnish
  - nginx
  - Zurb Foundation
  - jQuery
  - ASP.NET
  - IIS
  - SmartUsys SCP
  - Squarespace
trackers:
  - Google Analytics 4
  - Universal Analytics
  - Google Ads
  - Google Ads Remarketing
  - Google Call Tracking
  - DoubleClick
  - Crazy Egg
  - Monsido
tags:
  - government
  - utility
  - drupal
  - google-ads
  - remarketing
  - no-consent
  - session-recording
  - heatmap
  - privacy-mismatch
  - pantheon
headline: "SFPUC fires Google Ads conversion pixels when low-income customers visit the bill-relief page — three ad accounts track every visitor with no consent prompt."
findings:
  - "Visiting the Customer Assistance Program page — means-tested bill relief for low-income water customers — fires two dedicated Google Ads conversion events on load and a third when the application link is clicked, feeding income-qualified government service usage directly into ad attribution data at Google."
  - "The Monsido heatmap config endpoint is publicly accessible and reveals the exact 18 pages SFPUC monitors with scroll, movement, and click tracking at 50% visitor sampling — including bill relief, water quality, careers, and grant pages."
  - "The privacy policy claims 'session cookies that disappear after you leave' while the site sets a 2-year Google Analytics ID, a 90-day click-linker cookie, and sends data to Google Ads, DoubleClick, Crazy Egg, and Monsido — none disclosed in the policy."
  - "The sitemap lists all 870 content URLs under the Pantheon internal hostname live-sfpuc.pantheonsite.io instead of the canonical domain — a fully accessible alternate entry point that serves the complete site with all tracking code."
  - "The power billing portal's registration configuration file exposes the SmartUsys SCP vendor identity and version, plus the full field schema including SSN, driving license, and security question options limited to four choices with 3-to-10-character answers."
---

## Architecture

SFPUC.gov runs Drupal 10.5.7 on Pantheon's managed hosting platform. Responses come through Varnish/Fastly CDN with an nginx origin, identified by `x-generator: Drupal 10` and `x-pantheon-styx-hostname` headers. The site uses a custom theme called `sfwater` built on Zurb Foundation with MotionUI and WOW.js 1.1.2 (loaded from `cdnjs.cloudflare.com`). AvalynxTable 0.0.4 loads from `cdn.jsdelivr.net`. jQuery 3.7.1 is the base.

The `drupalSettings` object exposes: node ID `171` for the homepage, a views AJAX path at `/views/ajax`, `/search` as the sole `ajaxTrustedUrl`, and an anonymous user with `uid: 0` and permissions hash `3b80c8caf3b10e72138c0a4bc18bb8e518705d4be19c62e0672a2d30ce8178d3`. The Drupal JSON API is not enabled (`/jsonapi` returns 404). Registration is disabled (`/user/register` returns 403), but the login form at `/user/login` and password reset at `/user/password` are both accessible. The `/core/CHANGELOG.txt` is publicly readable.

The SSL certificate is a DigiCert EV cert issued to "City & County of San Francisco" (serial GOV 23638) covering four SANs: `www.sfpuc.gov`, `sfpuc.gov`, `sfpuc.org`, and `www.sfpuc.org`. Both `.org` domains and the bare `.gov` redirect to `www.sfpuc.gov` via Pantheon's primary-domain-policy. The `og:url` meta tag on every page points to `sfpuc.org` rather than the canonical `.gov` domain.

### Customer Billing Portals

Customer billing runs on two separate stacks outside Drupal:

**myaccount-water.sfpuc.org** (water billing) — Microsoft IIS 10.0, ASP.NET WebForms with `__VIEWSTATE`. A Citrix NetScaler load balancer sits in front (cookie `NSC_NzBddpvou_Joufsofu`). The cert SAN also covers `myaccount.sfwater.org` (the old hostname, now redirecting). The production HTML contains a hidden test artifact: `<button type="button" id="regCancelledBtn" hidden="hidden">TEST cancelReg MODAL DIALOG</button>` — a development modal trigger left in the live markup.

**myaccount-power.sfwater.org/Portal/** (power billing) — Built by vendor SmartUsys on their Smart Consumer Portal (SCP) platform, version SCM 7.5.2 (identified from the FAQ URL `https://q.smartusys.net/SCM_7_5_2-scp/faq.aspx` embedded in the registration config). The frontend uses AngularJS, jQuery 3.3.1, w2ui 1.5 RC1, and supports five languages (English, Spanish, French, Tagalog, Chinese). The `ApplicationLabels_EN.js` file weighs 1.35MB — the full multilingual label dictionary served to every login page visitor.

**webapps.sfpuc.org/sapps** (SAPPS contractor portal) — ASP.NET 4.0.30319 on IIS 10 with jQuery 1.12.0 (January 2016). Offers open registration (name, email, password, confirm password) with no CAPTCHA and no visible email verification. The cert SAN covers `webapps.sfpuc.org`, `sfwater.org`, and `www.sfwater.org`. The login page links to `http://www.sfwater.org` over plain HTTP.

**www.cleanpowersf.org** — The CleanPowerSF program site runs on Squarespace, entirely separate from the SFPUC infrastructure.

---

## Tracking Stack

There is no consent mechanism on SFPUC.gov. No cookie banner, no consent management platform (OneTrust, Cookiebot, or equivalent), no opt-out control. Every tracker described below fires on the first page load of a clean browser session.

### Google Ads: Three Independent Accounts

Three Google Ads tag containers load as separate inline `<script>` blocks — not through Google Tag Manager:

- **AW-10949164237** — Primary account. Fires remarketing (`POST /rmkt/collect/10949164237/`), view-through conversions via DoubleClick (`POST /pagead/viewthroughconversion/10949164237/`), and 1p-user-list pixels. Also runs Google Website Call Metrics (`call-tracking_9.js`) for phone number `(415) 551-3000` via conversion label `ir4_CJiB7tgDEM35--Qo`. The `google_wcc_status` global is set to `"no ad click"` on non-ad visits — the call tracking check runs on every page regardless of traffic source. A blanket conversion event `gtag('event', 'conversion', {'send_to': 'AW-10949164237/9C4VCKLluo0YEM35--Qo'})` fires on every page load, including 404s.
- **AW-11267378060** — Secondary account. Fires its own remarketing and view-through conversion pixels. Has a dedicated conversion label for the Customer Assistance Program page (see below).
- **AW-608262286** — Third account. Fires remarketing on the homepage and account/payment pages (`POST /rmkt/collect/608262286/`).

All three accounts fire 1p-user-list pixels (audience building) on every page: `GET /pagead/1p-user-list/10949164237/`, `/608262286/`, and `/11267378060/` respectively. The phone conversion data persists in localStorage as `ir4_CJiB7tgDEM35--Qo,4155513000` alongside `_gcl_ls` (Google Click Linker state).

Even 404 error pages load all three Ads tags and fire their respective conversion and remarketing pixels.

### Google Analytics: Two Active, One Dead

Two GA4 properties fire simultaneously:

- **G-6BBPNPN215** — Configured in `drupalSettings.google_analytics.account`. Tracks outbound links, mailto clicks, tel: links, and file downloads. Sets `allow_ad_personalization_signals: false`.
- **G-81ZL5GYXPK** — Loaded as a cross-domain secondary via `&cx=c&gtm=4e6461`. Performance entries confirm `g/collect?v=2&tid=G-81ZL5GYXPK` fires alongside the primary property.

**UA-24373931-2** (Universal Analytics) still runs in the dataLayer config with `anonymize_ip: true`. Google sunset UA in July 2023 and stopped processing data. The gtag config still emits `POST /g/collect` requests to `www.google-analytics.com` (returning 204) — the endpoint accepts the payload and discards it. Dead code.

### Cookies Set Without Consent

From a clean browser session, before any user interaction:

| Cookie | Source | Expiry |
|--------|--------|--------|
| `_ga` | Google Analytics client ID | 2 years |
| `_ga_6BBPNPN215` | GA4 session | 2 years |
| `_ga_81ZL5GYXPK` | GA4 cross-domain secondary | 2 years |
| `_gid` | Google Analytics daily ID | 24 hours |
| `_gcl_au` | Google Click Linker (ad attribution) | 90 days |

Google Consent Mode is active (`gcd=13l3l3l3l1l1`) with `npa=0` on the Ads calls (no personalization restrictions applied) and `npa=1` on the GA4 calls.

### Crazy Egg (Session Recording)

`https://script.crazyegg.com/pages/scripts/0103/3115.js` loads asynchronously on every page, including 404s. Account identifier: `0103/3115`. Crazy Egg's SDK captures mouse movements, clicks, scroll depth, and page interactions for heatmap and session replay. The script contains a hardcoded debug key — appending `?ced=ef4f4c45dea042bdcbc63ea4eac4d302` to any URL activates Crazy Egg's debug mode. The user data endpoint follows the pattern `https://script.crazyegg.com/pages/data-scripts/0103/3115/site/SITENAME.json`.

### Monsido (Governance + Heatmaps)

Monsido initializes inline in `<head>` before the async script loads:

```js
window._monsido = {
    token: "duCHnk79Xl44gfbjjP-vtQ",
    statistics: { enabled: true, cookieLessTracking: true },
    heatmap: { enabled: true },
    pageCorrect: { enabled: true },
};
```

Both `heatmaps.monsido.com` and `pagecorrect.monsido.com` are called on every page, plus `tracking.monsido.com` fires a tracking pixel with the full page URL. The `cookieLessTracking: true` flag means Monsido uses fingerprinting rather than cookies — no cookie is set, but visitors are still tracked. PageCorrect is an accessibility overlay.

---

## The Customer Assistance Program Problem

The Customer Assistance Program (CAP) is SFPUC's means-tested financial assistance for water and wastewater customers meeting low-income thresholds. The CAP page at `/accounts-services/bill-relief/customer-assistance-program-waterwastewater` (Drupal node 572) fires three Google Ads conversion events:

**On page load (automatic):**
```js
// Global — fires on every page
gtag('event', 'conversion', {'send_to': 'AW-10949164237/9C4VCKLluo0YEM35--Qo'});

// CAP-specific — fires when pathname includes /customer-assistance-program-waterwastewater
gtag("event", "conversion", {send_to: "AW-11267378060/JZJNCOnxjtcZEIyX2vwp"});
```

**On clicking the application link:**
```js
document.addEventListener('click', function(event) {
    if (event.target.closest('a') && event.target.closest('a').innerText.includes('APPLICATION FOR WATER/WASTEWATER CAP')) {
        gtag('event', 'conversion', {'send_to': 'AW-10949164237/HBOICIjV79gDEM35--Qo'});
    }
});
```

Visiting the bill-relief page and clicking the application link are treated as Google Ads conversion events — the same signal type used to attribute ad spend ROI. The network trace from the CAP page shows all three Ads accounts active: remarketing pixels for both `10949164237` and `11267378060`, view-through conversion beacons to DoubleClick for both, and three CCM collect calls. No consent precedes any of it.

---

## Monsido Heatmap Configuration Exposed

The Monsido heatmap settings endpoint at `https://heatmaps.monsido.com/v1/settings/duCHnk79Xl44gfbjjP-vtQ.json` is publicly accessible and returns the complete monitoring configuration:

- **Customer ID**: 37093
- **Traffic percentage**: 50% (half of visitors have behavioral data collected)
- **Map types per page**: scroll, movement, click (all three on every monitored page)

The 18 monitored pages:

| Page | Path |
|------|------|
| Homepage | `/` |
| Sign Up for Savings | `/accounts-services/sign-up-for-savings` |
| Bill Relief | `/accounts-services/bill-relief` |
| Leak Allowance | `/accounts-services/bill-relief/leak-allowance` |
| Understanding Your Tap Water | `/accounts-services/water-quality/understanding-your-tap-water` |
| Apply Now (Careers) | `/about-us/careers-sfpuc/apply-now` |
| Sewer System | `/about-us/our-systems/sewer-system` |
| Construction Projects | `/construction-contracts/construction-projects` |
| Construction Management | `/construction-contracts/construction-management` |
| Contractors Assistance Center | `/construction-contracts/contractor-assistance/contractors-assistance-center` |
| Project Labor Agreement | `/construction-contracts/contractor-assistance/project-labor-agreement` |
| Green Infrastructure Grant | `/programs/grants/green-infrastructure-grant` |
| Green Infrastructure Grants (Homes) | `/programs/grants/green-infrastructure-grants-homes` |
| Southeast Community Center | `/learning/come-visit/southeast-community-center` |
| PFAS and Wastewater | `/learning/water-pollution-prevention/pfas-and-wastewater` |
| Wastewater Discharge Permits | `/programs/pretreatment-program/wastewater-discharge-permits` |
| Rain Ready Resources | `/learning/emergency-preparedness/resources-get-you-rain-ready` |
| Sewer Nutrient Reduction | `/about-us/our-systems/sewer-system/upgrading-our-system-reduce-nutrients` |

This is a map of SFPUC's current digital priorities: which pages they are actively studying user behavior on. The bill relief page appearing in this list alongside the Google Ads conversion tracking paints a complete picture of behavioral surveillance on that page.

---

## Privacy Policy vs. Reality

The privacy notice at `/website-privacy-notice` (Drupal node 572 — notably the same node number as the CAP page, suggesting a content migration artifact) contains two relevant claims:

> "We use *session cookies* in the operation of the website. These cookies do not collect personal information and disappear after you leave our website."

> "We will not give or sell your individual information to any outside company for its use in marketing or solicitation."

The observed reality:

- `_ga` is a 2-year persistent identifier, not a session cookie
- `_gcl_au` is a 90-day Google Click Linker for ad click attribution
- Google Ads (three accounts) receives visit data and builds remarketing audiences
- DoubleClick fires view-through conversion beacons on every page
- Crazy Egg records mouse movements, clicks, and scroll behavior sitewide
- Monsido tracks page interactions via fingerprinting
- None of these vendors or data flows appear in the privacy policy

The policy also states: "We sometimes track the keywords that are entered into our search engine to measure interest in specific topics, but we do not track which terms a particular user enters." Meanwhile, GA4's `page_location` parameter transmits the full URL (including search terms in query strings) to Google on every page view, and Crazy Egg's session recording captures all on-screen activity.

---

## Infrastructure Observations

### Sitemap Leaks Pantheon Hostname

Every one of the 870 URLs in `sitemap.xml` uses the Pantheon internal hostname instead of the canonical domain:

```xml
<url><loc>https://live-sfpuc.pantheonsite.io/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
```

This is a Drupal sitemap configuration error — the base URL was not overridden for the Pantheon environment. `live-sfpuc.pantheonsite.io` returns HTTP 200 with `x-robots-tag: noindex` and serves the full site including all tracking code (GA, Ads, Crazy Egg, Monsido). The test environment (`test-sfpuc.pantheonsite.io`) requires HTTP Basic Auth (401). The dev environment does not exist (404).

### HSTS Misconfiguration

`strict-transport-security: max-age=300` — five minutes. The HSTS header is present but functionally useless: a browser's HSTS policy for the domain expires 5 minutes after the last visit. No `includeSubDomains`, no `preload` directive. The HSTS preload list minimum requires `max-age=31536000` (1 year).

### Power Portal Registration Schema

`https://myaccount-power.sfwater.org/Portal/resources/RegistrationJson.js` is a JavaScript file served without authentication that contains the full registration field schema for the power billing portal:

- Username: 5-50 characters, email used as user ID
- Password: 8-32 characters, requires uppercase, lowercase, number, special character
- Security questions: limited to 4 options (IDs 8, 4, 3, 6)
- Security answer: 3-10 characters only
- SSN field: defined but optional (`Mandatory: false`)
- Driving license field: defined but optional
- Utility account number: 2-25 digits, validated against CIS (Customer Information System)
- Postal code: 5 digits, validated against CIS
- Terms reference email: `csbretailservices@sfwater.org`

The file also embeds a FAQ URL (`https://q.smartusys.net/SCM_7_5_2-scp/faq.aspx`) that identifies the vendor as SmartUsys and the platform version as SCM 7.5.2.

### Response Headers

```
server: nginx
strict-transport-security: max-age=300
x-content-type-options: nosniff
x-drupal-cache: HIT
x-drupal-dynamic-cache: UNCACHEABLE (poor cacheability)
x-frame-options: SAMEORIGIN
x-generator: Drupal 10 (https://www.drupal.org)
x-pantheon-styx-hostname: styx-us-a-869d8c6599-s6z92
vary: Accept-Encoding, Cookie, Cookie, Cookie
```

`vary: Cookie` appears three times — a Pantheon/Drupal artifact from multiple Vary header merges, functionally equivalent to one.

### Multi-Language Translation

The site uses GTranslate (PHP wrapper at `/gtranslate/gtranslate.php`) for Chinese, Spanish, Tagalog, Vietnamese, Arabic, Russian, and Samoan. Translated URLs follow the pattern `/{lang-code}//path` (double slash after the language code).

---

## Machine Briefing

### Access and Auth

The main site is fully public. No authentication needed for content. The Drupal login form at `/user/login` accepts standard form POST. Registration is disabled (`/user/register` returns 403). `live-sfpuc.pantheonsite.io` returns the same content as `www.sfpuc.gov` without any canonical domain redirect.

### Endpoints

**Open (no auth):**
```
# Sitemap (all URLs reference Pantheon hostname)
GET https://www.sfpuc.gov/sitemap.xml

# Drupal core changelog
GET https://www.sfpuc.gov/core/CHANGELOG.txt

# Drupal Views AJAX (requires POST with view parameters from drupalSettings)
POST https://www.sfpuc.gov/views/ajax
Content-Type: application/x-www-form-urlencoded
view_name=news&view_display_id=block_2&view_path=/node/171&view_dom_id={hash}&pager_element=0

# Alternate access via Pantheon hostname
GET https://live-sfpuc.pantheonsite.io/{any-path}

# Monsido settings (public token)
GET https://heatmaps.monsido.com/v1/settings/duCHnk79Xl44gfbjjP-vtQ.json
GET https://pagecorrect.monsido.com/v1/settings/duCHnk79Xl44gfbjjP-vtQ.json

# Power portal registration schema
GET https://myaccount-power.sfwater.org/Portal/resources/RegistrationJson.js

# Power portal labels (1.35MB)
GET https://myaccount-power.sfwater.org/Portal/resources/ApplicationLabels_EN.js

# SAPPS registration (no CAPTCHA)
GET https://webapps.sfpuc.org/sapps/Register.aspx
```

**Node paths (sequential Drupal node IDs):**
```
GET https://www.sfpuc.gov/node/2    → Accounts & Services
GET https://www.sfpuc.gov/node/3    → Programs
GET https://www.sfpuc.gov/node/4    → Learning
GET https://www.sfpuc.gov/node/5    → Construction & Contracts
GET https://www.sfpuc.gov/node/171  → Homepage
GET https://www.sfpuc.gov/node/572  → Privacy Policy
GET https://www.sfpuc.gov/node/2003 → Accessibility
GET https://www.sfpuc.gov/node/2186 → Service Alerts
```

Nodes 999-1008+ return 403 (access-denied, likely unpublished content).

### Gotchas

- `views/ajax` without proper POST parameters returns a 404 HTML page. You need `view_name`, `view_display_id`, and `view_dom_id` values from `drupalSettings.views.ajaxViews` in the page source.
- `live-sfpuc.pantheonsite.io` has `x-robots-tag: noindex` — crawlers should respect this, but browsers don't.
- Drupal JSON API is disabled. Do not expect `/jsonapi` endpoints to work.
- UA-24373931-2 is dead — Google's endpoint returns 204 but processes nothing.
- SAPPS at `webapps.sfpuc.org/sapps` has open registration with no CAPTCHA — the form accepts POST with name, email, password, confirm password.
- The Crazy Egg debug key `ef4f4c45dea042bdcbc63ea4eac4d302` can be appended as `?ced=` to any URL.
