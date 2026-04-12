---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "BrightView — Teardown"
url: "https://brightview.com"
company: "BrightView"
industry: "Administrative"
description: "Largest US commercial landscaping company, NYSE-listed."
summary: "Drupal 11 on Acquia hosting behind Varnish and Cloudflare. jQuery 4.0.0 with Zurb Foundation for the frontend; no modern JS framework. Klaro consent manager loaded via Drupal module with all services defaulting to active. GTM container GTM-5GD2SMT manages Google Analytics 4 and a single custom HTML tag for Monsido. Customer portal runs on Salesforce Experience Cloud at connect.brightview.com."
date: "2026-04-12"
time: "20:49"
contributor: "hayabhay"
model: "sonnet"
effort: "high"
stack: [Drupal 11, Acquia, Cloudflare, Varnish, Zurb Foundation, jQuery 4]
trackers: [Google Tag Manager, Google Analytics 4, Monsido, HubSpot, Google reCAPTCHA Enterprise, Klaro, New Relic Browser, Csper]
tags: [b2b, local-seo, consent, drupal, doorway-pages, klaro, monsido, hubspot, acquia, csp]
headline: "6,485 local SEO pages across 1,246 cities run on a template where 65% of content is identical once you swap the city name."
findings:
  - "Klaro consent manager has all seven services set to default-on, and Google Consent Mode is disabled -- GA4 fires and sets cookies before any user interaction with the consent banner."
  - "6,485 local SEO pages across 1,246 cities use a template where 65% of content is identical once city and state names are swapped out."
  - "The Klaro consent dialog is explicitly disabled on /form/newsletter-signup -- the email capture page has no consent mechanism at all."
  - "The CSP header authorizes 13+ third-party vendors including ZoomInfo, Clickagy, and CrazyEgg, but runs in report-only mode -- logging violations to Csper instead of blocking anything."
  - "Monsido is not listed in the CSP script-src, so every page load generates a CSP violation report to Csper about a script BrightView intentionally deployed."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

BrightView is the largest commercial landscaping company in the US (NYSE: BV), servicing commercial properties across maintenance, construction, water management, tree care, snow and ice, and golf/sports turf. The site is the marketing and lead generation front end for a company with field operations in most major US markets.

---

## Architecture

The site runs Drupal 11 on Acquia managed hosting (response header `x-ah-environment: prod`). Requests pass through a Varnish cache layer (`via: varnish`, `x-cache: HIT`) before hitting Cloudflare at the edge (`cf-ray`, `cf-cache-status`). HTML is served with `cache-control: public, max-age=31536000` -- a one-year cache TTL, appropriate for a mostly-static marketing site. The `x-generator: Drupal 11` header is present on every response.

The frontend is server-rendered Drupal with jQuery 4.0.0 and Zurb Foundation. The `Foundation`, `Orbit`, `Accordion`, and `OffCanvas` objects are all present in `window`. There is no modern JS framework -- no React, no Vue, no Astro. The `drupalSettings` global carries the full CMS config object on every page, including GTM configuration, Klaro consent settings, user context, and gtag parameters.

The homepage is Drupal node 116, created on November 17, 2017 (Unix timestamp `1510942794` exposed in the dataLayer). Every page exposes `drupalSettings.user.uid = 0` and `drupalSettings.user.permissionsHash = "eef1d3123c1924d2aac91cfe39a6845b31412254485d31ca8c35f2ffa1c5a53e"` for anonymous visitors.

The Drupal JSON API (`/jsonapi/`) is not enabled (returns 404). The REST API is partially active -- `/user/1?_format=json` returns `{"message":"The 'access user profiles' permission is required."}`, confirming the endpoint works but access is properly gated. The admin path `/admin/` returns 403. `core/install.php` is accessible (returns "Drupal already installed") and `core/CHANGELOG.txt` is publicly readable.

The customer portal lives at `connect.brightview.com`, a Salesforce Experience Cloud instance (`x-powered-by: sfdcedge`). It operates on its own auth and consent stack, independent of the main site. BrightView's legacy HubSpot marketing subdomain (`info.brightview.com`, HubSpot portal 549858) now redirects to `www.brightview.com`.

---

## The CSP: A Vendor Manifest in Report-Only Mode

Every response carries a Content Security Policy -- sent three times: `Content-Security-Policy-Report-Only`, `X-Content-Security-Policy-Report-Only`, and `X-WebKit-CSP-Report-Only`. All three are identical, covering legacy browser prefixes. The CSP is in report-only mode, meaning it logs violations but blocks nothing.

Violations are reported to `685dce7e841f0014a4c0cc1c.endpoint.csper.io` (Csper, a CSP monitoring SaaS). The CSP functions as a surveillance tool for BrightView's security team -- they see every violation -- but it provides zero protection for users.

The `script-src` directive authorizes 18+ vendor domains:

| Vendor | CSP Domain | Observed Firing |
|--------|-----------|-----------------|
| Google Tag Manager | `www.googletagmanager.com` | Yes |
| Google Analytics | `www.google-analytics.com` | Yes |
| HubSpot | `js.hsforms.net`, `js.hubspot.com`, `js.hs-scripts.com`, `js.hs-analytics.net`, `js.hs-banner.com`, `js.hsadspixel.net` | Yes (forms) |
| Google reCAPTCHA | `www.gstatic.com`, `www.google.com` | Yes (contact form) |
| ZoomInfo | `js.zi-scripts.com`, `ws.zoominfo.com` | No |
| Clickagy/Bombora | `tags.clickagy.com` | No |
| LinkedIn Insight | `snap.licdn.com` | No |
| Facebook Pixel | `*.facebook.net` | No |
| CallRail | `cdn.callrail.com` | No |
| CrazyEgg | `script.crazyegg.com` | No |
| Marin Software | `tag.marinsm.com` | No |
| Review Alerts | `amplify.review-alerts.com` | No |

The `connect-src` adds more: `api.ipify.org` (public IP lookup), `aorta.clickagy.com` and `hemsync.clickagy.com` (Clickagy/Bombora identity resolution), and `ws.zoominfo.com` (ZoomInfo WebSights). The `frame-src` includes `hemsync.clickagy.com` -- an identity sync iframe for hashed email matching.

None of the B2B vendors (ZoomInfo, Clickagy, LinkedIn, Facebook, CallRail, CrazyEgg, Marin) were observed firing in any network session. They do not appear in the GTM container. The CSP is effectively a manifest of every third-party vendor BrightView has ever authorized -- some active, some presumably decommissioned. Whether the unobserved vendors fire under specific conditions (consent acceptance, bot detection, geographic targeting) could not be confirmed.

Monsido (`app-script.monsido.com`) is actively loaded on every page but is NOT listed in the CSP `script-src`. This means every page load generates a CSP violation report to Csper about the Monsido script. BrightView is paying for a monitoring tool that alerts them about a script they intentionally deployed via GTM but forgot to add to the CSP.

---

## The Local SEO Machine

The sitemap contains 7,454 URLs. Of those, 6,485 are under `/local/` -- geo-targeted landing pages organized by city, state, and service type. The coverage spans 1,246 unique cities across 41 US states, with up to 6 service variants per city:

- `/local/{city-state}/landscape-services`
- `/local/{city-state}/landscape-maintenance`
- `/local/{city-state}/water-management`
- `/local/{city-state}/tree-care`
- `/local/{city-state}/snow-ice`
- `/local/{city-state}/landscape-construction`

Top states by city count: California (218 cities), Florida (147), Illinois (140), Texas (121).

Each page is an individual Drupal node. Comparing the San Francisco and Chicago maintenance pages directly: both contain 17 paragraphs; 11 of those paragraphs are identical once city and state names are swapped out -- a 65%+ template overlap. The shared template opens with "In the [City, State] area, BrightView is the leading commercial landscape company. Our team members live in the area..." and repeats the same service descriptions across every city.

At 6,485 pages of substantially identical content with city/state substitution, this is a local SEO operation at industrial scale.

---

## Consent Architecture

BrightView uses Klaro as its consent manager, installed via a Drupal module. The configuration is embedded in `drupalSettings.klaro.config` and loads on every page.

The configuration registers seven services: `google_maps`, `google_recaptcha`, `hubspot`, `klaro`, `linkedin`, `youtube`, and `ga`. Every one of them has `"default": true`. In Klaro's model, `default: true` means the service is treated as consented without any user action -- the consent banner exists, but all services are already running by the time it appears.

Google Consent Mode v2 is not implemented. The `drupalSettings.gtag` object has `"consentMode": false`. GA4 fires unconditionally -- it does not wait for consent signals and does not downgrade to cookieless or modeling mode.

The pre-consent firing sequence:

1. Page loads
2. GTM container (GTM-5GD2SMT, ~372KB) loads immediately
3. GA4 fires: `POST analytics.google.com/g/collect` with `en=page_view` and `tid=G-D2E18969YB`
4. `_ga` and `_ga_D2E18969YB` cookies are set
5. Monsido fires: `GET tracking.monsido.com/?a=WkTBa4IVBzo2n3KyXMurHA`
6. Klaro modal appears -- all services already running, `localStorage.klaro` is null (no consent ever recorded)

There is one more configuration detail: Klaro is disabled entirely on `/form/newsletter-signup`. The `drupalSettings.klaro.disable_urls` array contains `"\/form\/newsletter-signup"`. The newsletter signup page -- the email capture page -- has no consent gating at all. Users hand over their email address on a page where every tracker fires with no consent dialog.

---

## Monsido: Outside the Consent Framework

Monsido is a web governance platform that includes accessibility monitoring, content quality scoring, and visitor analytics. BrightView's Monsido integration loads as a custom HTML tag inside the GTM container -- it is the only custom HTML tag in GTM container version 21:

```javascript
window._monsido = window._monsido || {
  token: "WkTBa4IVBzo2n3KyXMurHA",
  statistics: {
    enabled: true,
    cookieLessTracking: true,
    documentTracking: {
      enabled: true,
      documentCls: "monsido_download",
      documentIgnoreCls: "monsido_ignore_download",
      documentExt: ["pdf", "doc", "ppt", "docx", "pptx"]
    }
  }
};
```

Two things stand out. First, Monsido is not in Klaro's service list. It does not appear as a consent-managed service. Users cannot opt out of it through the consent UI. A consent auditor inspecting the Klaro config would not find it. Second, `cookieLessTracking: true` means Monsido tracks visitors without setting cookies. A user who blocks cookies, clears cookies, or opts out of cookie-based tracking is still tracked by Monsido. The tracker assigns its own session identifiers (`c` and `f` parameters in the beacon URL) that persist independently of the browser's cookie state.

The Monsido beacon URL structure observed in network logs:
```
GET https://tracking.monsido.com/?a=WkTBa4IVBzo2n3KyXMurHA&b={encoded_page_url}&c={visitor_id}&d={screen_resolution}&f={session_id}&h=2
```

The `documentTracking` configuration means Monsido also logs downloads of `.pdf`, `.doc`, `.ppt`, `.docx`, and `.pptx` files -- anything with the `monsido_download` CSS class.

---

## HubSpot and the Contact Form

The contact page embeds a HubSpot form (portal 549858, form GUID `5afbfc6f-2f97-43f7-b079-e0baf78d3a25`). The form definition is publicly accessible without authentication via the HubSpot embed API:

```
GET https://forms.hsforms.com/embed/v3/form/549858/5afbfc6f-2f97-43f7-b079-e0baf78d3a25/json
```

The response returns the complete form schema: all field names, types, validation rules, dropdown options, and redirect URL. Fields collected: inquiry type (`how_can_we_help_you_`), first name, last name, company, job title, email, phone, city, state, zip, landscape needs, and comments.

The inquiry type dropdown includes "California CCPA Request" as an option alongside "Request a Quote" and "Customer Feedback." CCPA data subject access and deletion requests flow through the same HubSpot CRM pipeline as sales leads.

The form redirect on submission points to `http://info.brightview.com/contact-thank-you` -- HTTP, not HTTPS. The `info.brightview.com` subdomain (HubSpot-hosted, `x-hs-portal-id: 549858`) now redirects to `www.brightview.com`, but the HTTP URL persists as a configuration artifact.

Google reCAPTCHA Enterprise protects the contact form with site key `6Ld_ad8ZAAAAAAqr0ePo1dUfAi0m4KPkCMQYwPPm`.

---

## GA4 Data Quality Bug

Multiple GA4 collect requests observed during the investigation contain `en=[object Object]` instead of a valid event name string. This appears in the network traffic as:

```
POST analytics.google.com/g/collect?...&en=%5Bobject%20Object%5D&_et=10
```

An event object is being coerced to a string instead of extracting its `.name` property. This was observed on both the homepage and contact page. These events appear as "[object Object]" in Google Analytics reports, polluting their analytics data with garbage event names. The bug likely originates from a custom GTM tag or Drupal module passing an event object where GA4 expects a string.

---

## Acquisition History in the Sitemap

BrightView is the product of two major acquisitions: Brickman Group (founded 1939, acquired by KKR in 2013) merged with ValleyCrest Companies in 2014, and the combined entity rebranded as BrightView in 2016 before IPO-ing in 2018 (NYSE: BV).

The sitemap preserves pages for each predecessor brand:
- `/brickman-group-ltd`
- `/valleycrest-companies`
- `/valleycrest-design-group`
- `/brightview-landscapes` (pre-2016 brand)
- `/brickman-facilities-solutions`
- `/valley-crest-tree-company`
- `/brightview-begins-initial-public-offering`

These resolve as content pages on `www.brightview.com` -- preserved as SEO equity from the acquired brand histories.

---

## Machine Briefing

### Access & auth

The site is fully accessible without authentication. All pages are publicly cached via Cloudflare + Varnish. curl and fetch work without special headers. The GTM container and Klaro config are in every page's HTML via `drupalSettings`.

```bash
# Full page with embedded drupalSettings JSON
curl -s https://www.brightview.com/ | grep -oP 'data-drupal-selector="drupal-settings-json">[^<]+' | head -c 5000

# GTM container
curl -s "https://www.googletagmanager.com/gtm.js?id=GTM-5GD2SMT" > gtm-container.js

# HubSpot form schema (no auth)
curl -s "https://forms.hsforms.com/embed/v3/form/549858/5afbfc6f-2f97-43f7-b079-e0baf78d3a25/json"
```

### Endpoints

**Open, no auth:**

```
GET https://www.brightview.com/                              # Homepage (node/116)
GET https://www.brightview.com/local/{city-state}/{service}  # 6,485 local SEO pages
GET https://www.brightview.com/sitemap.xml                   # 7,454 URLs
GET https://www.brightview.com/contact                       # Contact form (HubSpot embed)
GET https://www.brightview.com/search/node?keys={query}      # Drupal search
GET https://www.brightview.com/api/locations                 # Redirect page with NR agent
GET https://www.brightview.com/user/login                    # Login form
GET https://www.brightview.com/core/CHANGELOG.txt            # Drupal changelog
```

Service options for local pages: `landscape-services`, `landscape-maintenance`, `water-management`, `tree-care`, `snow-ice`, `landscape-construction`.

**Auth-gated:**

```
GET https://connect.brightview.com/                          # Salesforce customer portal
GET https://www.brightview.com/admin/                        # 403
```

### Gotchas

- **Klaro config** is in `window.drupalSettings.klaro` on every page. Contains service list, disable_urls, storage settings.
- **Monsido token**: `WkTBa4IVBzo2n3KyXMurHA`. Tracking endpoint is `tracking.monsido.com` with GET params (a=token, b=URL, c=visitor_id, d=resolution, f=session_id). Gets ORB-blocked in Chromium headless -- use curl to observe.
- **GA4**: `G-D2E18969YB`. Legacy UA: `UA-73862014-1` (still in GTM but sunset).
- **GTM container version 21**: one custom HTML tag (Monsido). Container does not contain ZoomInfo, LinkedIn, or other B2B vendors despite CSP authorization.
- **CSP is report-only** -- no scripts are blocked. All CSP-listed vendor domains can load freely.
- **Cache TTL**: 1 year (`max-age=31536000`). Add `Cache-Control: no-cache` if you need fresh content.
- **reCAPTCHA Enterprise key**: `6Ld_ad8ZAAAAAAqr0ePo1dUfAi0m4KPkCMQYwPPm` on contact forms.
- **New Relic Browser**: licenseKey `3b7caab2ce`, applicationID `460420096`. Present on `/api/locations`.
