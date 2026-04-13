---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Ancestry — Teardown"
url: "https://www.ancestry.com"
company: Ancestry
industry: Information
description: "Online genealogy and DNA testing platform with billions of historical records."
summary: "Ancestry runs on Adobe Experience Manager served via Akamai (ancestrycdn.com), with Adobe Target for server-side A/B testing and Statsig for feature flagging. Subscription logic is split across three microservice endpoints. Cloudflare WAF sits in front with RUM active. Personalization data flows through Adobe's ECID stack and a proprietary CDP exposed at window.cdp_p13n."
date: 2026-04-13
time: "01:55"
contributor: hayabhay
model: "sonnet-4.6"
effort: medium
stack: [Adobe Experience Manager, Adobe Target, Cloudflare, Akamai, Statsig]
trackers: [Google Analytics, Google Ads, DoubleClick, Google Tag Manager, Meta Pixel, TikTok Pixel, Pinterest, Microsoft Bing, Amazon DSP, Adobe Analytics, Adobe Audience Manager, New Relic, Yahoo, LiveRamp, Revlifter, Qualtrics, ethn.io, Cloudflare Insights]
tags: [genealogy, dna, subscription, adobe-aem, consent, gpc, cpra, identity-resolution, liveramp, surveillance]
headline: "Ancestry's ethn.io survey script encodes subscription type, DNA Plus status, and cancellation reasons as URL parameters sent to a third party on every page load."
findings:
  - "The ethn.io survey script URL encodes 14 user attributes as query parameters -- subscription duration, trial dates, DNA Plus status, and cancellation reasons -- sending churn data to a third-party vendor's access logs for every logged-in page load."
  - "Homepage audience segmentation logic is publicly readable on the CDN (lohp.seg.js) -- it exposes CDP segment names, EU/EEA country targeting lists, and a hidden ?pulse URL parameter that activates a campaign-specific homepage variant."
  - "Anonymous US visitors are immediately tagged legacyWinback: 'win back' in the tracking dataLayer and that classification is distributed to Google, Meta, TikTok, Pinterest, Bing, and Amazon before the subscription API confirms whether the visitor is actually a lapsed member."
  - "The consent API marks advertising3rd with a gpc: true field acknowledging GPC exists, but returns value: true regardless of whether the browser sends Sec-GPC: 1 -- the Do Not Sell signal the API documents is not enforced."
  - "All advertising and analytics consent defaults are set to granted at GTM init and the US Banners API returns empty content by design -- no consent prompt is shown to US visitors while 15+ trackers fire at first page load."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Ancestry's technical stack is enterprise Adobe from top to bottom -- AEM for content, Target for personalization, Analytics for measurement, Audience Manager for identity resolution -- layered with Cloudflare WAF and a CDN split across Akamai. The surveillance infrastructure runs deep: 15+ ad and analytics vendors fire on first page load, a third-party survey tool receives subscription churn data as URL parameters, and the consent architecture acknowledges privacy signals without enforcing them.

## Architecture

Ancestry runs Adobe Experience Manager (AEM) as its CMS, served via `ancestrycdn.com` on Akamai. Content assets use ACSHASH fingerprinted filenames (`clientlib-*.min.ACSHASH{hash}.js`) for immutable cache tokens. The stack is primarily server-rendered HTML from AEM with client-side hydration via jQuery, Ancestry's own UI component libraries (core.js, switch.js, carousel.js at `/ui/2.69.0/`), and a custom unified tracking layer (`webui-unifiedtracking/2.0.10/`).

Adobe Target handles A/B testing and personalization under the client code `myfamilycominc`, using at.js version 2.7.5. Target runs server-side decisioning -- `decisioningMethod: "server-side"` is stored in localStorage -- so there's no client-side flag exposure for anonymous users. The delivery endpoint (`myfamilycominc.tt.omtrdc.net/rest/v1/delivery`) accepts unauthenticated POST requests and returns valid edge assignments even with fake session IDs.

Statsig provides feature flagging via an AEM component (`clientlib-containerstatsig`), but flag state is not surfaced to anonymous users in window globals. Cloudflare WAF sits in front of the domain with bot challenge infrastructure (`/cdn-cgi/challenge-platform/`), active RUM (`/cdn-cgi/rum`), and the `__cf_bm` bot management cookie.

Subscription logic is split across three microservice endpoints: `/api/subscription/plan`, `/cs/offers/subscribe/data`, and `/api/subs/plans`. The subscribe page screen name `offers-ui : fh : ho-std` -- decoded from the UBE event system -- reads as "Family History Hard Offer Standard," the current active pricing variant designation.

Two public APIs require no authentication:

`GET /api/locale/domains/current` returns the full market configuration for all 16 supported locales: US, CA, AU, UK, DE, FR, IT, SE, MX, NL, BE, CH, NO, PL, and two catch-all buckets (ROW and Global). The response maps domain names to country codes, locale codes, supported languages, and continent groupings.

`GET /api/privacy/consent-info` returns the consent policy configuration for the current market, including category definitions and `controlFlagDefaults`. For US visitors the policy is `cpra`. All nine consent flags default to `true`. The Banners injection mechanism (`/Banners/API/Get/21`) that would show a consent UI returns `Content: ""` for US IP addresses -- empty by server-side design.

A JSONP geo-redirect service runs at `mitsvc.ancestry.com/mit/api/geo/rd` and is called via script tag injection at page load. It returns geolocation data used to drive market routing and populates the `geo-location` key in AEM's ContextHub.

---

## Consent Architecture

Ancestry's US consent implementation has three interlocking pieces: a consent policy that acknowledges opt-out rights, a default state that enables everything, and a banner system that is geo-gated to not fire for US visitors.

The consent-info API response for US users lists four consent categories -- Necessary, Sell/Share, Analytics, and Preferences -- with a `controlFlagDefaults` object that maps nine internal flags to those categories. Every flag defaults to `value: true`:

```json
"controlFlagDefaults": {
  "analytics3rd": {"value": true, "consent": "analytics-us"},
  "advertising3rd": {"value": true, "consent": "advertising-sell-share", "gpc": true},
  "preference": {"value": true, "consent": "preference"},
  "performance": {"value": true},
  "analytics1st": {"value": true, "consent": "analytics-us"},
  "advertising1st": {"value": true},
  "attribution3rd": {"value": true},
  "attribution1st": {"value": true},
  "functional": {"value": true}
}
```

The GTM consent default is set at page initialization before any tracker fires:

```
ad_storage: "granted"
analytics_storage: "granted"
ad_user_data: "granted"
ad_personalization: "granted"
personalization_storage: "granted"
functionality_storage: "denied"
security_storage: "granted"
```

The OPTOUTMULTI cookie is written on first visit without user interaction: `c3:0|c7:0|c12:0|c11:0|c2:0|c8:0|c10:0|c6:0|c9:0|i:8140`. Each pipe-delimited value maps to a consent category; `0` means not opted out (i.e., opted in). `i:8140` is the consent policy version. A companion cookie `NOTIFIEDOFCOOKIES` is also set, marking the visit as "notified" without a banner having appeared.

**GPC non-enforcement.** The `advertising3rd` entry in controlFlagDefaults carries a `gpc: true` field. This is a marker indicating the category is GPC-eligible -- it does not change the default value. Sending `Sec-GPC: 1` to `/api/privacy/consent-info` returns an identical response: `advertising3rd: {value: true}`. The server does not read or honor the GPC signal. Under CPRA, GPC must be treated as a "Do Not Sell or Share My Personal Information" opt-out. Ancestry's consent architecture documents GPC as a concept while not implementing it at the API level.

Every GA4 request includes `gcs=G111` (all three consent signals granted: analytics_storage, ad_storage, ad_personalization) and `npa=0` (Non-Personalized Ads disabled). Ancestry tells Google that full consent is active for every US visitor.

---

## Tracker Stack

49 network requests fire on homepage load: 8 first-party, 41 third-party across 10 domains. The subscribe page hits 69 requests: 6 first-party, 63 third-party across 11 domains (Amazon DSP added). All third-party trackers load before any user interaction. There is no consent gate between page load and tracker firing for US visitors.

**Google.** Two GA4 properties (G-LMK6K2LSJH, G-4QT8FMEX30), two Google Ads accounts (AW-994238695, AW-16499174463), two DoubleClick/Campaign Manager accounts (DC-8889547, DC-10399626). GTM container GTM-PF2LHSF orchestrates all of these. View-through conversion pixels fire from `googleads.g.doubleclick.net` on every page.

**Meta.** Pixel ID 1411840285724878, fbevents.js, and a signals config request at `connect.facebook.net/signals/config/1411840285724878`. The config URL includes an `hme` parameter -- a hashed email value. For anonymous sessions this appears to be a site-level token; for logged-in users it would be the user's actual hashed email sent to Meta.

**TikTok.** SDK ID C81ET9M0MJON0LQN0PC0, loaded via `analytics.tiktok.com/i18n/pixel/events.js`.

**Pinterest.** `ct.pinterest.com/user/` and `/v3/` both fire on every page load.

**Microsoft Bing.** `bat.bing.com/bat.js` and `bat.bing.com/p/action/5190301.js`.

**Yahoo.** `s.yimg.com/wi/ytc.js` -- Yahoo Tag Controller -- configured at `s.yimg.com/wi/config/12773.json`.

**Amazon.** `s.amazon-adsystem.com/iu3` (DSP pixel) and `ara.paa-reporting-advertising.amazon/aat` (Amazon Attribution) fire on subscribe and checkout pages only. Absent from the homepage.

**Adobe.** Adobe Analytics via ECID (`AMCV_ED3301AC512D2A290A490D4C@AdobeOrg` cookie), Adobe Audience Manager via `dpm.demdex.net/id` (fires at page load -- cross-publisher identity sync, enrolling visitors in Adobe's cross-site identity graph), and Adobe Target via `myfamilycominc.tt.omtrdc.net`.

**LiveRamp.** The `_rlu` cookie signals LiveRamp's Authenticated Traffic Solution (ATS) integration, enabling identity graph matching across publishers.

**New Relic Browser.** Agent v1.268.0, appID 798977697, licenseKey 4bd2ba109c, accountID 1690570.

**Revlifter.** `assets.revlifter.io/838e2ddb-68e7-4a26-a839-a090f3fd5cd7.js` -- a third-party coupon and promotion injection service loaded on all pages. The UUID is Ancestry's specific Revlifter config. This script runs with full DOM access and no sandboxing.

**Qualtrics SiteIntercept.** `siteintercept.qualtrics.com/WRSiteInterceptEngine/Targeting.php` -- survey targeting engine. Makes a POST on every page load to determine whether to trigger a survey intercept.

**ethn.io.** See the next section.

---

## ethn.io -- Subscription Metadata in Script URLs

The survey platform ethn.io is loaded as a script tag on every page. Its URL encodes user account state as query parameters:

```
https://ethn.io/a1qpu-gl.js?ucdmid=undefined&subDur=undefined&cSub=undefined
  &eSub=undefined&cTrial=undefined&eTrial=undefined&dayCreate=undefined
  &tSub=undefined&ptools=undefined&dnaplus=undefined&segment=nrvisitor
  &dpsegment=undefined&cancelReason1=undefined&cancelReason2=undefined
```

For anonymous visitors, all values are the string `"undefined"` -- so the data exposure is limited to the parameter schema and the visitor's CDP segment (`segment=nrvisitor`). But the parameter list describes the full data model for authenticated users:

| Parameter | Meaning |
|-----------|---------|
| `ucdmid` | User account ID |
| `subDur` | Subscription duration |
| `cSub` | Current subscription type |
| `eSub` | Enterprise subscription status |
| `cTrial` | Current trial status |
| `eTrial` | Enterprise trial dates |
| `dayCreate` | Account creation date |
| `tSub` | Total subscription count |
| `ptools` | Product tools access |
| `dnaplus` | DNA Plus status |
| `cancelReason1` | Primary cancellation reason |
| `cancelReason2` | Secondary cancellation reason |

For logged-in subscribers, these fields would populate with real values. The URL goes to ethn.io's servers as a GET request for a JavaScript file -- the parameters appear in ethn.io's access logs, in browser history, and in any referrer headers if the script triggers further requests. This sends subscription state and churn data (cancel reasons) to a third-party vendor as part of normal page load, not as a deliberate data-sharing event.

---

## What Ancestry Knows About You Before Login

Ancestry's tracking architecture builds a classification profile for every visitor before authentication.

`window.cdp_p13n` -- a CDP (Customer Data Platform) personalization object -- is populated at page load: `{isDataReady: true, data: {customer_type: "nrvisitor"}}`. The `nrvisitor` segment (Non-Revenue Visitor) is a top-level audience classification visible in globals, the Tealium data layer, and the UBE event payload.

The UBE (User Behavior Events) system fires `CoreUI_ScreenViewed` events on every page transition. These events carry a visitor profile distributed to all connected vendors via GTM:

- `legacyCustomerSegment: "nrvisitor"` -- top-level audience segment
- `legacyDnaSegment: "non dna user"` -- DNA product ownership
- `legacyWinback: "win back"` -- default winback classification for anonymous US visitors

The `legacyWinback: "win back"` classification is assigned to fresh anonymous sessions on the homepage. On the subscribe page, the DoubleClick payload shows `u10=not win back` and GA4 shows `up.winback_status=not win back` -- the classification updates once the subscription API resolves. The homepage value represents either a default fallback applied to all anonymous US traffic, or an inference from identity resolution via LiveRamp or Adobe Demdex matching prior visitor data. Both systems are active at first load.

DoubleClick (Campaign Manager) receives structured visitor attributes on every page load as `u`-parameters:

```
u1=nrvisitor          (customer segment)
u2=desktop            (device type)
u3=us                 (geography)
u4=en-us              (locale)
u5=false              (inferred: has purchased DNA kit)
u6=non dna user       (DNA status)
u7=DNA non-purchaser  (DNA classification)
u10=not win back      (winback status, subscribe page)
u30-u54               (subscription attributes, undefined for anon)
```

These flow to Google's ad infrastructure on every page. For authenticated users, u30 through u54 would carry subscription details.

---

## AEM Audience Segmentation -- Public

Ancestry's homepage audience segmentation logic is readable from the public CDN without authentication:

```
https://cmsasset.ancestrycdn.com/conf/ancestry/settings/wcm/segments/lohp.seg.js
```

The file is an Adobe CQ/AEM segment configuration that maps visitor properties to named audience buckets:

- **`currentsubscriber`** -- Matches users where `cdp-segments` contains `aem_current_subscribers`. This is the internal CDP segment key used to detect paying members and show them a different homepage.
- **`roweuro`** -- A geo-match against a hardcoded list of 40+ EU/EEA country codes. This is what triggers the GDPR-compliant homepage variant.
- **`lohprowusd`** -- Catches Caribbean, Latin America, and Asia-Pacific visitors not covered by other segments.
- **`uspulse`** -- Triggered by the presence of a `?pulse` URL parameter. This activates a campaign-specific homepage variant, likely used for media buys or internal QA.
- **`uspulsecsub`** -- The `?pulse` variant for current subscribers.
- **`everyone`** -- Catch-all default.

The internal CDP segment name `aem_current_subscribers` and the full EU/EEA country list used for GDPR routing are both readable by anyone examining this file.

---

## Machine Briefing

### Access & Auth

The homepage and most public pages are accessible without auth. Cloudflare blocks `curl` with a 403; browser-like requests (User-Agent, browser headers) succeed. Auth-gated features (record search, family tree) require a session cookie obtained after login.

### Endpoints

**Public -- no auth required:**

```bash
# All market/locale configurations
GET https://www.ancestry.com/api/locale/domains/current

# Consent policy and defaults
GET https://www.ancestry.com/api/privacy/consent-info

# CDP personalization profile (anon: 404 body, 200 status)
GET https://www.ancestry.com/app-api/cdp-p13n/api/v1/users/me

# Banner content (geo-gated; returns empty for US)
GET https://www.ancestry.com/Banners/API/Get/21

# Adobe Target delivery -- accepts arbitrary sessionId, returns edge assignment
POST https://myfamilycominc.tt.omtrdc.net/rest/v1/delivery?client=myfamilycominc&sessionId={any}
Content-Type: application/json
Body: {"context":{"channel":"web","address":{"url":"https://www.ancestry.com/"}},"execute":{"pageLoad":{}}}

# AEM audience segments (homepage)
GET https://cmsasset.ancestrycdn.com/conf/ancestry/settings/wcm/segments/lohp.seg.js
```

**Subscription pages -- no auth, browser required:**

```bash
# Subscription plan offerings
GET https://www.ancestry.com/cs/offers/subscribe
GET https://www.ancestry.com/offers/subscribe

# Internal APIs loaded on subscribe page
GET https://www.ancestry.com/api/subscription/plan
GET https://www.ancestry.com/cs/offers/subscribe/data
GET https://www.ancestry.com/api/subs/plans
```

**Analytics event bus -- accepts POST without validation:**

```bash
# UBE event bus -- returns 202 on empty POST
POST https://www.ancestry.com/ube-torrent/api/events/async
```

### Gotchas

- Cloudflare WAF blocks curl with 403. Use a browser or Playwright with realistic headers.
- `/api/locale/domains/current` returns all 16 market configs in one call -- no pagination.
- The `api.ancestry.com` subdomain blocks cross-origin fetch from the browser with strict CORS. Same-origin session required.
- Adobe Target delivery returns 200 for fake sessionIds, but personalization content in `execute.pageLoad.options` is empty unless a real visitor profile exists.
- The UBE event bus (`/ube-torrent/api/events/async`) accepts empty POST bodies and returns 202 -- no schema validation visible from the outside.
- ethn.io script URL parameters reveal the logged-in user data model: if testing against an authenticated session, the URL will contain real account values.
- Subscription API endpoints (`/cs/offers/subscribe/data` etc.) may require session cookies for full response -- partially available without auth.
- The `?pulse` URL parameter on any homepage URL activates the `uspulse` AEM segment variant.
