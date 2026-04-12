---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Nicor Gas — Teardown"
url: "https://www.nicorgas.com"
company: "Nicor Gas"
industry: Utilities
description: "Illinois natural gas distribution utility serving 2.2 million customers."
summary: "nicorgas.com runs Adobe Experience Manager on Apache Sling, served from AWS ALB behind Imperva WAF. The AEM instance is shared across Southern Company's gas utility subsidiaries, with DAM paths and template configs exposing the parent company structure. The customer account portal lives on a separate ASP.NET stack at customerportal.southerncompany.com, using Speedpay for payments and Walletron for digital bills. Three tag management layers -- two GTM containers and Adobe Launch -- run in parallel across the site."
date: "2026-04-12"
time: "17:30"
contributor: hayabhay
model: sonnet
effort: high
stack:
  - Adobe Experience Manager
  - Apache Sling
  - AWS
  - Imperva
  - ASP.NET
  - Speedpay
  - Formstack
trackers:
  - Google Analytics 4
  - Universal Analytics
  - Google Tag Manager
  - Google Ads
  - Facebook Pixel
  - LinkedIn Insight
  - Acoustic Silverpop
  - Adobe Launch
  - DoubleClick
  - MediaHawk
  - ArtTrk
  - Twitter
tags:
  - utility
  - adobe-experience-manager
  - no-consent
  - advertising
  - behavioral-tracking
  - email-stitching
  - captive-audience
  - aem-sling
  - multi-tag-manager
  - illinois
headline: "A regulated gas monopoly sells ad space in the bills its 2.2 million captive customers must open to pay."
findings:
  - "A hidden bill-insert advertising page sells space in physical gas bills at $0.06--$0.10 per insert, targeting 2.2 million customers who have no alternative provider -- with eligible categories including 'heating and cooling,' which could cover gas competitors like heat pump installers."
  - "Acoustic/Silverpop stitches email identity to web sessions: when a customer clicks a billing email, URL parameters decode their CRM contact ID, binding every subsequent page visit -- including bill payment assistance pages -- to their marketing profile."
  - "A community assistance navigator for financially distressed customers sits live at a test-pages URL, indexed in the sitemap but hidden from navigation, routing applications to the parent company's shared Formstack account."
  - "Three tag management layers (two GTM containers and Adobe Launch) fire 11 distinct trackers on first page load -- Facebook Pixel, LinkedIn, MediaHawk call tracking, ArtTrk attribution -- with no consent banner on any page."
  - "AEM Sling JSON selectors return JCR node metadata on most content pages, exposing internal template paths, version UUIDs, replication timestamps, and ContextHub configuration."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Nicor Gas is an Illinois natural gas distribution utility serving approximately 2.2 million customers. It is a subsidiary of Southern Company Gas, itself a division of Southern Company (NYSE: SO). As a regulated monopoly, Nicor Gas customers have no alternative provider for residential gas service in its service territory. The company is headquartered in Naperville, IL.

---

## Infrastructure

The public-facing site at `www.nicorgas.com` runs on **Adobe Experience Manager (AEM)** with the **Apache Sling** content framework. The architecture is legible in several places: 404 error pages expose Apache Sling's internal error format and reveal the JCR content path `/content/southern-co-gas/nicor-gas/en/`; all CSS and JavaScript load from the `etc.clientlibs/` path pattern characteristic of AEM; and the DAM (Digital Asset Manager) root is accessible at `/content/dam/southern-co-gas/`. The AEM installation is part of a shared Southern Company enterprise instance -- the DAM path `southern-co-gas/` covers all the parent company's gas utilities, and the template path `/conf/nicor-gas/settings/wcm/templates/generic-page` is specific to the Nicor Gas configuration within that shared environment.

**Network layer:** AWS Application Load Balancer (`AWSALB`, `AWSALBCORS` cookies) behind an **Imperva WAF** (`visid_incap_3114522`, `nlbi_3114522`, `incap_ses_*` cookies; `x-cdn: Imperva` response header). The server header reports **Apache**; content is cached at `max-age=900` (15 minutes). HSTS is set to 31536000 seconds. `X-Frame-Options: SAMEORIGIN` is present.

**Customer portal:** The account management portal lives at `customerportal.southerncompany.com` -- a separate stack from the marketing site. CSP headers there point to an **ASP.NET** backend with authentication at `webauth.southernco.com`. Payment processing is handled by **Speedpay** (ACI Worldwide product), with API endpoints `restapi.speedpay.com`, `batrestapi.speedpay.com`, and `perf2restapi.speedpay.com` -- the latter two being staging/performance environments that appear in the production CSP. Digital bill delivery is via **Walletron** at `mobills2.walletron.com`. Customer login links from nicorgas.com pass an LDC parameter: `customerportal.southerncompany.com/User/Login?LDC=7`.

**Forms:** Two active **Formstack** forms use the `southerncompanygas.formstack.com` account -- the parent company's shared Formstack instance. The bill-insert advertising inquiry form and the community assistance contact collection form both route through this shared account.

**Content recon:** The sitemap at `/sitemap.xml` returns 699 URLs in 27 groups. The largest sections are `/news/` (337 URLs), `/business/` (90 URLs), `/residential/` (77 URLs), and `/callouts/` (70 URLs -- AEM callout components). The sitemap also references `customerportal.southerncompany.com` as an external link for account login.

**robots.txt** is minimal: `Allow: /`, `Disallow: /work-in-progress`. One disallowed path.

---

## AEM Sling JSON Exposure

AEM on Apache Sling responds to content URL selectors as a default behavior. On nicorgas.com, `.json`, `.1.json`, and `.2.json` depth selectors return JCR (Java Content Repository) node metadata on most content pages. `.infinity.json` is blocked (404). This is a standard AEM misconfiguration present on a large fraction of AEM deployments.

Example endpoint and response:

```
GET https://www.nicorgas.com/callouts/add-or-transfer-services.2.json
```

Response (abbreviated):
```json
{
  "jcr:primaryType": "cq:Page",
  "jcr:created": "Fri Sep 20 2019 14:58:25 GMT+0000",
  "jcr:content": {
    "jcr:primaryType": "cq:PageContent",
    "jcr:mixinTypes": ["mix:versionable"],
    "jcr:title": "Add or Transfer Services",
    "cq:lastReplicationAction": "Activate",
    "jcr:versionHistory": "afdf8389-8940-4f9c-884f-19994112878c",
    "cq:template": "/conf/nicor-gas/settings/wcm/templates/generic-page",
    "cq:lastReplicated": "Thu Nov 07 2019 18:59:12 GMT+0000",
    "cq:lastModified": "Thu Nov 07 2019 18:59:10 GMT+0000",
    "jcr:baseVersion": "869070ea-aa75-4238-ace8-b21c637cfe33",
    "jcr:uuid": "a44cef7b-c79a-469d-b75a-98211ca4a771",
    "cq:contextHubPath": "/etc/cloudsettings/default/contexthub",
    "cq:contextHubSegmentsPath": "/etc/segmentation/contexthub",
    "cq:designPath": "/etc/designs/nicorgas"
  }
}
```

Fields returned include: internal template paths, JCR version history UUIDs, base version IDs, replication timestamps and actions, modification timestamps, ContextHub configuration paths, and design paths. The version UUID (`jcr:versionHistory`) can potentially be used to enumerate prior published versions via the JCR version API, though that endpoint requires authentication on a hardened AEM instance.

The DAM folder structure is also accessible:

```
GET https://www.nicorgas.com/content/dam/southern-co-gas.json
-> {"jcr:primaryType":"sling:Folder","jcr:created":"Thu Sep 19 2019 14:08:50 GMT+0000"}

GET https://www.nicorgas.com/content/dam/southern-co-gas/nicor-gas.json
-> folder metadata

GET https://www.nicorgas.com/content/dam/southern-co-gas/shared.json
-> folder metadata
```

DAM folder responses return only folder metadata at depth 0 -- no asset contents or filenames are returned without deeper selectors or authenticated access. AEM admin interfaces (`/crx/de/index.jsp`, `/system/console`, `/bin/querybuilder.json`) are all blocked (404).

---

## Tag Management Architecture

Three tag management layers run in parallel on nicorgas.com. This is unusual for a regional gas utility and appears to be the result of the stack accumulating layers over time rather than being architected centrally.

**GTM-W4LJGTR** -- The primary Google Tag Manager container. Carries:
- Universal Analytics (UA-24822643-1) page view and event tags (nav clicks, banner clicks, info cards, promo clicks, external/internal/download links, PDF clicks, form submissions)
- GA4 event tags (via `G-HDX8JELJNJ`)
- YouTube listener tag (`__ytl`) for video engagement tracking
- Twitter/X conversion tracking (`t.co` pattern confirmed in container)
- DoubleClick (`ad.doubleclick`) tags

**GTM-KCPZKT7** -- The secondary container. Carries:
- Universal Analytics (UA-24822643-1) page view tag
- GA4 config tag for `G-HDX8JELJNJ`
- Facebook Pixel (ID `1097897254134421`) via inline `__html` tag -- `fbq("init","1097897254134421"); fbq("track","PageView")`
- LinkedIn Insight Tag (partner_id `5546042`) via inline `__html` tag loading `snap.licdn.com/li.lms-analytics/insight.min.js`
- Google Ads conversion tag: conversionId `747435448`, label `tk3GCNbv2f4YELjrs-QC`
- Google Conversion Linker with cross-domain enabled to `southerncompanygas.formstack.com` (meaning Google click IDs are passed through to Formstack form submissions)
- MediaHawk call tracking pixel: `https://jelly.mdhv.io/v1/star.gif?pid=83WAxdzS8qQo4n8MBJwbTjBhC3Bn&src=mh&evt=hi`
- ArtTrk attribution pixel: `https://arttrk.com/pixel/?ad_log=referer&action=lead&pixid=1448cde4-0a0c-40c0-bb7a-0698d4cc6def`

**Adobe Launch** (`launch-edf283d4c3f5.min.js` via `assets.adobedtm.com`) -- Adobe's tag management layer. Carries:
- Facebook beacon rule ("Facebook - Send Beacon on Every Page") -- this is how Facebook Pixel ID `314845175538098` is fired (distinct from the GTM-loaded pixel `1097897254134421`)
- Google Analytics tags
- Additional rules not fully enumerated

In addition to the tag managers, the page directly loads:
- `https://www.googletagmanager.com/gtag/js?id=G-GDV0GQ0NRV` -- GA4 property loaded directly, not via GTM
- `https://www.googletagmanager.com/gtag/js?id=G-P06FPQ42TJ` -- second GA4 property loaded directly
- `https://www.sc.pages08.net/lp/static/js/iMAWebCookie.js` -- Acoustic/Silverpop behavioral tracking script, loaded directly

The full tracker inventory confirmed on first page load, without any user interaction:

| Tracker | ID/Reference | Layer |
|---------|-------------|-------|
| Google Analytics 4 | G-GDV0GQ0NRV | Direct |
| Google Analytics 4 | G-P06FPQ42TJ | GTM-W4LJGTR |
| Google Analytics 4 | G-HDX8JELJNJ | GTM-KCPZKT7 |
| Universal Analytics | UA-6930273-2 | (via _gat_ cookie) |
| Universal Analytics | UA-24822643-1 | GTM-W4LJGTR + GTM-KCPZKT7 |
| Google Tag Manager | GTM-W4LJGTR | Direct |
| Google Tag Manager | GTM-KCPZKT7 | Direct |
| Facebook Pixel | 1097897254134421 | GTM-KCPZKT7 |
| Facebook Pixel | 314845175538098 | Adobe Launch |
| LinkedIn Insight | partner_id 5546042 | GTM-KCPZKT7 |
| Google Ads | conversionId 747435448 | GTM-KCPZKT7 |
| DoubleClick | ad.doubleclick.net | GTM-W4LJGTR |
| Twitter/X | (t.co) | GTM-W4LJGTR |
| Acoustic Silverpop | pages08.net | Direct |
| MediaHawk | pid 83WAxdzS8qQo4n8MBJwbTjBhC3Bn | GTM-KCPZKT7 |
| ArtTrk | pixid 1448cde4-0a0c-40c0-bb7a-0698d4cc6def | GTM-KCPZKT7 |
| Adobe Fonts (Typekit) | kvq0ono | Direct |
| reCAPTCHA | (google.com/recaptcha) | Direct |

No cookie consent banner was observed on any page tested. All of the above fire on first page load, before any user interaction.

---

## Acoustic/Silverpop: Email-to-Web Identity Stitching

Acoustic (formerly IBM Marketing Cloud, originally Silverpop) is a marketing automation platform primarily used for email campaigns. The `iMAWebCookie.js` script from `www.sc.pages08.net` does more than drop cookies -- it is the web half of a cross-channel identity graph.

**Cookies set on first load:**
- `com.silverpop.iMAWebCookie` -- persistent visitor ID (UUID format: `c33742cd-3269-a4cd-ee1e-c155416c284e`). This is the cross-session identity anchor.
- `com.silverpop.iMA.session` -- session-scoped UUID.
- `com.silverpop.iMA.page_visit` -- running hash of pages visited across sessions (observed value: `47:` on first load, accumulates over time).

**The stitching mechanism:** Nicor Gas sends transactional and marketing emails via Acoustic. Email links contain Acoustic tracking parameters: `spMailingID`, `spUserID`, `spJobID`, and `spJobExec` in the URL query string. When a customer clicks a link in a bill reminder, payment-due notice, or marketing email and lands on nicorgas.com, the `iMAWebCookie.js` script reads those URL parameters. The function `window.ewt.getContactID()` decodes the customer's CRM contact ID from these parameters and associates it with the `iMAWebCookie` UUID for that session.

After this association, every subsequent page visit -- tracked via `event.jpeg` requests to `pages08.net` carrying `url`, `referringURL`, `sessionGUID`, and `webSyncID` -- is tied to a specific identified customer record in Acoustic. The page visit hash in `com.silverpop.iMA.page_visit` accumulates across sessions as long as the persistent cookie survives.

The operational consequence: a customer who clicks a payment-due email and then visits the bill payment assistance page, the income-eligible offerings page, or the community assistance navigator is generating a behavioral profile inside Acoustic's system -- linked to their name, account number, and email address. This profile feeds Acoustic's segmentation and campaign targeting.

The script also appends `webSyncID` and `sessionGUID` to links pointing to other Acoustic-participating domains. On nicorgas.com, the more significant data flow is the beacon requests to `pages08.net` on each page load. The outbound link injection is a secondary behavior.

---

## The Bill Insert Ad Network

A page accessible at `https://www.nicorgas.com/pages/archive/bill-insert-advertising.html` -- present in the sitemap, not linked from any site navigation menu -- describes a commercial advertising program. Nicor Gas sells space in its physical customer bill mailers to third-party businesses.

The page's pitch, verbatim:

> "Monthly bills and statements have a 97% open rate and receive 2-5 minutes of a customer's attention."
> "Bill inserts outperform email marketing which has an average open rate around 20%."
> "Bill inserts go to a household, not just a single person, and are shareable."

**Pricing (observed during investigation):**

| Duration | Price per Insert |
|----------|----------------|
| 3 months | $0.10 |
| 6 months | $0.09 |
| 9 months | $0.07 |
| 12 months | $0.06 |

At $0.06 per insert and 2.2 million customers, a 12-month campaign reaches every customer at a total cost of $132,000 -- or roughly $0.06 per household per touch.

**Eligible advertiser categories:** energy efficiency, energy resiliency, environment, green energy, heating and cooling, home improvement, sustainability, and community or civic goodwill.

The "heating and cooling" and "home improvement" categories are noteworthy. These could include heat pump installers, insulation contractors, and energy efficiency firms -- businesses that, by reducing gas usage, compete with Nicor Gas's core product. "Energy resiliency" is broad enough to encompass battery storage and off-grid products. A regulated natural gas monopoly is using its mandatory billing communications -- mail that customers must open to pay their bills -- as an advertising channel for businesses that may include competitors to natural gas.

The page was most recently created or updated in March 2026 (JCR timestamp `Thu Mar 12 2026 06:30:40 GMT+0000` noted during investigation). It is not linked from the site navigation, the footer, or the press/news sections. The inquiry form on the page routes to Formstack under the `southerncompanygas` account.

---

## Hidden and Unlisted Pages

Two pages in the sitemap are live but absent from the site navigation:

**Bill Insert Advertising** -- `https://www.nicorgas.com/pages/archive/bill-insert-advertising.html`
Described above. The `/archive/` path in the URL may be a vestigial path name from a prior site structure; the page is not archived -- it is live, returns 200, and is actively soliciting advertisers as of April 2026.

**Community Assistance Navigator** -- `https://www.nicorgas.com/test-pages/community-assistance-navigator.html`
A page with the URL path prefix `test-pages/` that is live (200 response) and indexed in the sitemap. It embeds a Formstack form:

```
https://southerncompanygas.formstack.com/forms/js.php/can_customer_contact_collection
```

The form is titled for community assistance applicants -- financially distressed customers applying for bill relief or assistance programs. The form routes to the parent company's shared `southerncompanygas` Formstack account. The `test-pages/` prefix suggests this was intended as a staging or pre-launch URL that was never replaced with a production path. It is live in the sitemap and reachable without authentication.

**Coordinator Pages:** The sitemap includes 12 URLs in the `/coordinator-pages/` section following the pattern `/coordinator-pages/firstname-lastname.html` -- named staff pages, likely for customer outreach coordinators. All 12 return 404 due to a URL case mismatch: the sitemap uses mixed case, but AEM's content paths are case-sensitive and the actual node paths use a different casing. These pages are unreachable as published.

---

## Pre-Consent Tracking on a Captive Audience

Nicor Gas serves 2.2 million Illinois gas customers. These customers have no alternative provider. Any customer who needs to check their bill, report a gas leak, apply for payment assistance, update their service, or start new service must interact with nicorgas.com or the connected customer portal. Illinois is not subject to CCPA (California-specific), though it has BIPA (Biometric Information Privacy Act). No cookie consent banner, cookie preference center, or opt-out mechanism was observed on the site during the investigation.

The practical effect: a low-income customer visiting the income-eligible offerings page or the community assistance navigator to apply for bill relief programs simultaneously generates hits in three GA4 properties, two legacy UA properties, two Facebook Pixel accounts, LinkedIn's Insight Tag, a MediaHawk call tracking beacon, an ArtTrk attribution pixel, and an Acoustic behavioral profile -- with no notice and no mechanism to decline.

The Acoustic profile is the most granular because it can be linked to an identified customer record when that customer has previously clicked an Acoustic-sent email (bill notices, payment reminders, marketing), as described in the Acoustic section above.

---

## Machine Briefing

### Access & Auth

The public marketing site (`www.nicorgas.com`) is fully accessible without authentication. No login required for any content page, sitemap, or Sling JSON endpoints. Standard `curl` or `fetch` requests work. Imperva WAF is present but does not block typical browser user-agent strings. Requests without a `User-Agent` header may be challenged.

The customer portal (`customerportal.southerncompany.com`) requires account authentication via `webauth.southernco.com`. No anonymous access to account data.

### Endpoints -- Open Access

**AEM Sling JSON -- page metadata:**
```
GET https://www.nicorgas.com/{path}.json
GET https://www.nicorgas.com/{path}.1.json
GET https://www.nicorgas.com/{path}.2.json
```
Replace `{path}` with any content path from the sitemap (without `.html`). Examples:
```
https://www.nicorgas.com/callouts/add-or-transfer-services.2.json
https://www.nicorgas.com/residential/ways-to-save.2.json
https://www.nicorgas.com/business.2.json
```
Returns: JCR node metadata. Depth 2 (`.2.json`) includes `jcr:content` properties.

**AEM DAM folder structure:**
```
GET https://www.nicorgas.com/content/dam/southern-co-gas.json
GET https://www.nicorgas.com/content/dam/southern-co-gas/nicor-gas.json
GET https://www.nicorgas.com/content/dam/southern-co-gas/shared.json
```
Returns folder metadata only. Asset contents require deeper selectors or authentication.

**Sitemap:**
```
GET https://www.nicorgas.com/sitemap.xml
```
699 URLs. Use as enumeration base for Sling JSON endpoint discovery.

**Bill Insert Advertising page:**
```
GET https://www.nicorgas.com/pages/archive/bill-insert-advertising.html
```
Live, 200, not linked from nav. Formstack form for advertising inquiries.

**Community Assistance Navigator:**
```
GET https://www.nicorgas.com/test-pages/community-assistance-navigator.html
```
Live, 200, not linked from nav. Embeds Formstack form `can_customer_contact_collection`.

**Customer portal login:**
```
https://customerportal.southerncompany.com/User/Login?LDC=7
```
LDC=7 identifies Nicor Gas as the subsidiary. Other Southern Company utilities use different LDC values.

### Gotchas

- `.infinity.json` selector is blocked (404). Stick to `.1.json` or `.2.json` for useful metadata.
- AEM admin paths (`/crx/de/`, `/system/console`, `/bin/querybuilder.json`) are all 404.
- Imperva may return a CAPTCHA challenge page (HTML with Incapsula resource URL) for requests that don't include standard browser headers. Include `User-Agent` and `Accept` headers.
- The coordinator pages in the sitemap (`/coordinator-pages/firstname-lastname.html`) all 404 due to URL case mismatch. The sitemap URLs do not resolve.
- The `work-in-progress` path is disallowed in robots.txt -- it may exist but any content there is intentionally unlisted.
- Content pages are cached at 15-minute TTL (`Cache-Control: max-age=900`). Sling JSON responses may also be cached at the Imperva edge.
