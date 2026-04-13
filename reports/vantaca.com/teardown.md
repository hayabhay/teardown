---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Vantaca — Teardown"
url: "https://vantaca.com"
company: "Vantaca"
industry: "Real Estate"
description: "HOA management software for property management companies."
summary: "HubSpot CMS marketing site pre-rendered and edge-cached via Cloudflare. Two GTM containers coordinate a three-layer ABM identity resolution stack — 6sense for IP deanonymization, Influ2 for cookie and email hash matching, and Aggle OIR for browser fingerprinting. Subdomains run Vanilla Forums (private community), Zendesk (support), and Absorb LMS (training)."
date: "2026-04-12"
time: "21:12"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [HubSpot CMS, Cloudflare, Google Tag Manager]
trackers: [Google Analytics 4, Google Ads, Facebook Pixel, LinkedIn Insight, Reddit Pixel, Hotjar, 6Sense, Influ2, Aggle OIR, G2, Seona]
tags: [hoa, b2b-saas, abm, identity-resolution, ip-deanonymization, form-prefill, pre-consent, hubspot, fingerprinting, community-management]
headline: "6sense resolves your employer from your IP and pre-fills Vantaca's demo form before you touch the consent banner."
findings:
  - "Two 6sense tags fire on every page load — one pushes your IP-resolved company name, address, revenue, employee count, and ABM intent score into the dataLayer for all trackers, the other pre-fills the /demo form's Company and State fields with deanonymized values you never entered."
  - "Influ2 reads the HubSpot UTK cookie to link anonymous sessions to known CRM contacts, writes its own cross-site UserID into Google Analytics, and for US visitors loads usbrowserspeed.com with email hash template slots ready for GTM to fill."
  - "Aggle OIR assigns a persistent browser UUID and fires 12 fingerprinting requests on every homepage visit — covering visitors that 6sense and Influ2 cannot resolve."
  - "The consent banner sets all Google Consent Mode categories to denied, but 6sense, Influ2, and Aggle ship as inline scripts outside GTM and fire unconditionally before any user interaction."
  - "The Vanilla Forums community at community.vantaca.com serves its full platform config — feature flags, escalation workflow, Zendesk connector, and a theme still named 'Vantaca Test Styles' — from an unauthenticated endpoint."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Vantaca sells HOA management software to property management companies — not individual homeowners. Their buyers are operations directors, finance managers, and technology leads at firms running hundreds of community associations. The marketing site's job is to convert these visitors into demo requests. The tracking stack built to do that is worth examining closely.

## Site Architecture

The `www.vantaca.com` marketing site runs on HubSpot CMS (portal ID `7968147`). Pages are pre-rendered and edge-cached via Cloudflare CDN — the `x-hs-prerendered` header on the homepage showed `Fri, 10 Apr 2026 15:26:01 GMT`, and most pages serve from Cloudflare's cache with `s-maxage=36000`. The `x-hs-cfworker-meta` header confirms HubSpot's Workers integration: `{"contentType":"SITE_PAGE","resolver":"PreRenderedContentResolver"}`. There is no custom application server behind it.

Two GTM containers ship on every page: `GTM-P36JCCW` and `GTM-TC6TVNGD`. Both bootstrap the full tracker stack. Having two containers typically signals a split between an in-house implementation and an agency or acquisition integration — neither is labeled in the source.

First-party endpoints on the marketing site are limited to HubSpot's own infrastructure:

```
GET /_hcms/livechat/widget          # HubSpot chatbot, bot ID 8072074
GET /_hcms/video/196495924404/player # HubSpot-hosted video player
```

No custom API surface is present on the marketing site.

### Subdomains

- `community.vantaca.com` — Vanilla Forums v2026.004, private (login-gated), site ID `6037736`
- `support.vantaca.com` — Zendesk Help Center
- `vantaca.myabsorb.com` — Absorb LMS for Vantaca University training; noindex
- `vantacaevents.com` — Separate domain for event content (vision2026), AWS API Gateway behind CloudFront; unauthenticated requests return `MissingAuthenticationTokenException`

The `robots.txt` disallows `/sample-*`, `/blog/author/*`, `/_hcms/preview/`, and `/hs/manage-preferences/`. The public sitemap contains 232 URLs: 135 blog posts, 32 FAQ pages, 6+ Viewpoint publication pages, and product pages. One entry — `/d2fa8088-b8ad-4cb9-9b71-15c4326c67d9` — returns HTTP 200 but serves a broken HubSpot template error: `"Missing Template at Path: '@hubspot/elevate/templates/podcast-listing.hubl.html'"`. The URL is in the public sitemap and fully accessible.

## The Surveillance Stack

A homepage load to `www.vantaca.com` generates 56 network requests — 2 to first-party HubSpot endpoints, 54 to 18 third-party domains. The third-party footprint is dominated by three complementary identity resolution systems targeting anonymous B2B visitors: 6sense (IP-to-company deanonymization), Influ2 (cookie and email hash matching), and Aggle OIR (browser fingerprinting). Each covers a different segment of the visitor population the others can't resolve.

### 6sense — IP Deanonymization with Form Pre-Fill

Two separate 6sense tags load on every page, sharing the same token (`0074fd237ae287de93368c07f17677d1`) but using different epsilon keys and serving different purposes.

**Tag 1** (`storeTagId: c2f1fbd1-bf20-41f2-b149-0c7ebf256daf`, epsilon key `58db2ace398c217282d52e2fc8d8e3b6aa8d3deb`):
- `enableRetargeting: true`
- `enableMapCookieCapture: true`
- Pushes full company profile to `window.dataLayer` under `6si_company_*` keys

**Tag 2** (`storeTagId: ef59266d-d8e3-45ec-8b8b-9bc868b21222`, epsilon key `6d37be7e5fc2526e7bb3350c2c25a23a48bf0a27`):
- `enableRetargeting: false`
- `enableTimeTracking: true`
- Contains Smart Form Fill (SFF) configuration wired to the demo request form

Both tags call `epsilon.6sense.com/v3/company/details` on load. The response returns a company profile resolved from the visitor's IP address. From a live session, the resolved payload for a Cupertino-based IP:

```json
{
  "company_name": "Tessellations",
  "domain": "tessellations.school",
  "country": "United States",
  "address": "1170 Yorkshire Drive",
  "company_state": "California",
  "city": "Cupertino",
  "zip": "95014",
  "industry": "Education",
  "sic": "8299",
  "sic_description": "Schools and Educational Services Not Elsewhere Classified",
  "naics": "611",
  "employee_range": "100 - 249",
  "employee_count": "131",
  "revenue_range": "$1M - $5M",
  "annual_revenue": "2249261",
  "6si_company_match": "Match",
  "6si_confidence": "Low",
  "6si_company_is_blacklisted": false,
  "6si_company_is_6qa": false
}
```

The `6si_company_match` field shows the resolution result (`Match`, `Non-actionable Match`, or `Unidentified Visit`). `6si_company_is_blacklisted` flags whether 6sense marks this organization as suppressed from outreach. `6si_company_is_6qa` flags 6sense Qualified Accounts — organizations 6sense's model predicts are in an active buying cycle.

This entire payload — company name, address, employee count, annual revenue, SIC/NAICS codes, industry, ABM intent scores, and segment memberships — is pushed into `window.dataLayer` under `6si_company_*` keys on every page load. Because both GTM containers subscribe to dataLayer events, this data flows to all other trackers on the page: Facebook Pixel, LinkedIn Insight, Google Ads, Reddit Pixel, and Google Analytics all receive it.

**The Smart Form Fill:** Tag 2's SFF configuration maps two fields from the IP-resolved profile into HubSpot form `0167c864-41d0-41dc-a041-1a9577df4fec` — the demo request form at `/demo`:

```javascript
fields: [
  { name: "company", mappedField: "companyName", shorten: false },
  { name: "state",   mappedField: "companyState", shorten: false }
]
```

When a visitor navigates to `/demo`, the "Company" and "State" fields are pre-filled with the IP-resolved values before any user interaction. During the live investigation, the Company field showed "Tessellations" and State showed "California" — values the visitor never entered.

### Influ2 — Cookie Matching and Email Hash Resolution

Influ2 (client ID `f490513b-8105-408e-802c-025169b3c6d5`) loads from `https://www.influ2.com/tracker`. It runs a multi-stage identity chain:

1. Calls `t.influ2.com/u/` to check if the visitor has been seen before. Response includes `TrackerUserID` (session-level pseudonymous ID) and `UserID` (persistent cross-site ID if the visitor has been matched).

2. Reads `hubspotutk` from both `localStorage` and document cookies, stores it as `s`, and passes it as `hsutk` in the `/p/vt/` tracking call. This links the anonymous Influ2 session to whatever HubSpot knows about this contact.

3. If `UserID` is returned, sets it as the GA userId: `ga.getAll()[0].set("userId", e.UserID)`. This bridges Influ2's identity graph into Google Analytics.

4. Tracks scroll depth, mouse movement, touch events, time-on-page, and clicks as behavioral signals.

5. Contains form auto-fill: fetches `/target_info` and populates any DOM element with class `influ2--{fieldname}` with matched contact data. This fires only when Influ2 has a resolved `UserID` for the visitor — i.e., someone previously identified.

**US-specific path:** For US visitors, Influ2 loads a secondary script from `usbrowserspeed.com`:

```
https://a.usbrowserspeed.com/cs?
  pid=9927063789ae621419534228c1e647c4e99a602c4655bf974acf5926b92fe9e9
  &r=https%3A//t.influ2.com/u/?hem%3D%24%7BHEM_SHA256_LOWERCASE%7D%26up_id%3D%24%7BUP_ID%7D
  &ref={referrer}
  &puid={encoded_payload_with_ip_and_cookies}
```

The `HEM_SHA256_LOWERCASE` and `UP_ID` are template variables in the tag source — placeholders populated by GTM when an email hash is available from another source (form submission, CRM match). When populated, this connects the browser session to an email-identified contact via the `usbrowserspeed.com` intermediary. This capability is built into the tag but only activates when GTM provides the hash values.

### Aggle OIR — Browser Fingerprinting

Aggle's "On-site Interest Retargeting" script loads from `cdn.aggle.net/oir/oir.min.js`. A homepage load generates 12 requests to `oirt.aggle.net`:

```
GET  /echo                                    → 301 → /echo/{UUID}
GET  /echo/a922392b-b351-4710-8667-50c369b1231b → 200  (assigns/retrieves browser UUID)
POST /csc                                     → 204 (x2)
POST /evt                                     → 204 (x4)
POST /ack                                     → 204 (x2)
POST /ost                                     → 204 (x2)
```

The `/echo` endpoint assigns a persistent UUID to the browser. The `csc`/`evt`/`ack`/`ost` sequence tracks behavioral events. The investigator noted obfuscated encoding in the client script (XOR decryption with key `zt`). Aggle targets anonymous B2B visitors — its niche is covering the segment that 6sense can't resolve to a company and Influ2 hasn't seen before.

### Consent Architecture vs. Tracker Reality

Every page includes HubSpot's cookie consent banner. The Google Consent Mode defaults are set to denied for all categories:

```javascript
gtag('consent', 'default', {
  'ad_storage': 'denied',
  'analytics_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied',
  'wait_for_update': waitForUpdateMillis
});
```

A HubSpot consent listener updates these values when a user accepts:

```javascript
_hsp.push(['addPrivacyConsentListener', function(consent) {
  gtag('consent', 'update', {
    'ad_storage': hasAdsConsent ? 'granted' : 'denied',
    'analytics_storage': hasAnalyticsConsent ? 'granted' : 'denied',
    ...
  });
}]);
```

This consent gating applies to GTM-loaded tags that respect Google Consent Mode. 6sense, Influ2, and Aggle are not loaded through GTM — they ship as inline scripts directly in the page HTML and execute unconditionally. The `epsilon.6sense.com/v3/company/details` call, the `t.influ2.com/u/` call, and the full Aggle OIR event sequence all fire before any user interaction with the consent banner.

## Full Tracker Inventory

| Tracker | Type | Identifier |
|---------|------|-----------|
| Google Analytics 4 | Analytics | G-W0K1BTKG6F |
| Google Analytics UA | Analytics | UA-106278473-1 (investigator-observed via GTM; UA sunset 2023) |
| Google Tag Manager | Tag Manager | GTM-P36JCCW, GTM-TC6TVNGD |
| Google Ads | Conversion | AW-392072304 |
| HubSpot Analytics | CRM / Analytics | Portal 7968147 |
| HubSpot Chat | Chatbot | Bot 8072074 |
| Facebook Pixel | Advertising | 250193708139758, 1591231894564435 (investigator-observed; not in saved evidence files) |
| LinkedIn Insight | Advertising | snap.licdn.com (partner ID not in HTML) |
| Reddit Pixel | Advertising | a2_eckat2geyuir |
| Hotjar | Heatmaps / Session | ID 3673790 |
| 6Sense | ABM / Deanonymization | Token 0074fd237ae287de93368c07f17677d1 |
| Influ2 | ABM / Identity Resolution | f490513b-8105-408e-802c-025169b3c6d5 |
| Aggle OIR | Fingerprinting / Retargeting | aggle.net (UUID assigned per browser) |
| G2 Crowd | Review Attribution | Product ID 1007450 |
| Seona (conversion.ai) | SEO / Analytics | p.conversion.ai |
| usestyle.ai | Unknown | p.usestyle.ai |

Notes on the inventory:
- Two GTM containers likely reflect separate implementations (in-house + agency or an acquisition artifact).
- Two Facebook pixel IDs could indicate a multi-brand setup or an agency-managed account running in parallel.
- UA-106278473-1 is a Universal Analytics property; UA was sunset in July 2023. If this tag still fires, it sends to a retired property.

## Community Forum Config

`community.vantaca.com` runs Vanilla Forums version 2026.004 (site ID `6037736`). The forum is private — content requires authentication. However, the `/entry/signin` endpoint returns the full platform configuration without authentication:

- **Feature flags:** `DeferredLegacyScripts`, `GroupsFollowing`, `CustomProfileFields`, `NewUserManagement`, `SuggestedContent`, `DraftScheduling`, `NewAnalytics`, `newCommunityDrafts`
- **Theme config:** Custom CSS colors, fonts (Montserrat), logo URLs. Theme name: `"Vantaca Test Styles"` — a test-named theme deployed to production.
- **Category and post type IDs** with creation/update timestamps
- **Escalation workflow statuses:** Open, In Progress, On Hold, Done, In Zendesk — confirming Zendesk integration for escalated support tickets
- **Search:** ElasticSearch driver with Zendesk search connector enabled (cross-platform search)
- **reCAPTCHA site key:** `6LdfR3MrAAAAAD6DDr6CQ521muBf1cM7OY-ZPTfX` (public-facing key, not a secret)

The theme named "Vantaca Test Styles" running in production is the unusual signal here — typical of platforms where a test environment configuration got promoted without cleanup.

## Product Signals

### Vantaca IQ — Customer Data as Product

The Vantaca IQ business intelligence product includes industry benchmarking described as: "Benchmarking brings industry perspective to IQ, using anonymized data from the Vantaca network." Customers' operational data — work order completion rates, collection performance, financial metrics — is aggregated across the customer base and sold back as benchmarking intelligence. Standard SaaS playbook; notable in the context of an HOA platform where the underlying data includes homeowner financial records and property management financials.

### HOAi / Scout — Branding Split

The AI assistant product has multiple pages and names in use simultaneously:
- `/scout-ai` — "Scout, Powered by HOAi: Building the Future of Community Management with AI"
- `/hoai` — separate HOAi brand page
- `/hoai-voice` — voice AI product page

The site footer logo reads "Vantaca Powered by HOAi." The community forum header also uses this branding. Scout appears to be the user-facing product name; HOAi is the underlying AI brand or partner. The `/hoai-voice` page suggests voice capabilities either recently launched or in active rollout.

### Payment Stack

Vantaca runs a split payment architecture:
- **Vantaca Pay** — proprietary A/R solution. "Posts in 30 seconds — no reconciliation, no bolt-ons."
- **Invoice Pay powered by AvidXchange** — A/P automation integrated with AvidPay Network for vendor payments

## Machine Briefing

**Access and auth:** The marketing site is unauthenticated HubSpot CMS — all pages accessible via `curl`/`fetch` without session setup. The community forum (`community.vantaca.com`) gates content behind login but the `/entry/signin` config endpoint is open. `support.vantaca.com` is Zendesk standard. `vantacaevents.com` requires an auth token for its AWS API Gateway.

**Open endpoints:**

```bash
# 6sense company deanonymization (fires on every page load — IP-based, no auth)
GET https://epsilon.6sense.com/v3/company/details
# (called with visitor IP, no explicit params in the request — server-side IP extraction)

# HubSpot chatbot
GET https://www.vantaca.com/_hcms/livechat/widget

# HubSpot video player
GET https://www.vantaca.com/_hcms/video/196495924404/player

# Vanilla Forums platform config (unauthenticated)
GET https://community.vantaca.com/entry/signin

# Influ2 visitor ID assignment
GET https://t.influ2.com/u/?cb={timestamp}

# Aggle browser UUID assignment
GET https://oirt.aggle.net/echo

# Reddit Pixel config
GET https://pixel-config.reddit.com/pixels/a2_eckat2geyuir/config

# HubSpot form config (demo request form)
# Form ID: 0167c864-41d0-41dc-a041-1a9577df4fec
# Portal ID: 7968147
POST https://forms.hubspot.com/uploads/form/v2/7968147/0167c864-41d0-41dc-a041-1a9577df4fec
```

**Key identifiers:**
- HubSpot portal: `7968147`
- HubSpot chatbot: `8072074`
- GA4: `G-W0K1BTKG6F`
- Google Ads: `AW-392072304`
- GTM containers: `GTM-P36JCCW`, `GTM-TC6TVNGD`
- Reddit pixel: `a2_eckat2geyuir`
- Hotjar site: `3673790`
- 6sense token: `0074fd237ae287de93368c07f17677d1`
- 6sense Tag 1 ID: `c2f1fbd1-bf20-41f2-b149-0c7ebf256daf`
- 6sense Tag 2 ID: `ef59266d-d8e3-45ec-8b8b-9bc868b21222`
- Influ2 client: `f490513b-8105-408e-802c-025169b3c6d5`
- Demo form: `0167c864-41d0-41dc-a041-1a9577df4fec`

**Gotchas:**
- 6sense deanonymization is IP-dependent — different results from datacenter IPs, residential IPs, or VPNs. The `6si_company_match` field will be `Unidentified Visit` for IPs 6sense can't resolve.
- The HubSpot pre-rendered pages cache for up to 10 hours at the edge (`s-maxage=36000`). Content staleness is possible.
- Two GTM containers both initialize `window.dataLayer` — tag firing order matters; 6sense pushes company data before GTM finishes loading, making it available in the same synchronous context.
- The `/d2fa8088-b8ad-4cb9-9b71-15c4326c67d9` URL in the sitemap returns 200 with a broken HubSpot template error — not useful content.
- `vantaca.myabsorb.com` is `noindex` and returns a login page. No unauthenticated surface there.
