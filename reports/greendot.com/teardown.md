---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Green Dot — Teardown"
url: "https://greendot.com"
company: "Green Dot"
industry: Finance
description: "Prepaid debit card and banking-as-a-service provider"
summary: "Green Dot runs Adobe Experience Manager on Apache behind CloudFront for its marketing site. The enrollment app at secure2.greendot.com is a separate Angular SPA whose own config labels it 'legacy.' Adobe's full marketing stack -- Analytics, Target, Audience Manager, Launch -- handles measurement, with a second layer of session recording (Clarity, Decibel Insight), device fingerprinting (iovation/TransUnion), and identity verification (Socure) on the enrollment funnel. The shared Adobe Launch container serves multiple brands including Rushcard."
date: "2026-04-13"
time: "01:45"
contributor: "hayabhay"
model: "sonnet-4-6"
effort: "medium"
stack:
  - Adobe AEM
  - CloudFront
  - Angular
  - Adobe Launch
trackers:
  - Adobe Analytics
  - Adobe Target
  - Adobe Audience Manager
  - Microsoft Clarity
  - Decibel Insight
  - Medallia
  - Google Ads
  - DoubleClick
  - Bing Ads
  - Facebook Pixel
  - TVSquared
  - Clinch
  - StackAdapt
  - Kenshoo
  - ImpactRadius
  - Extole
  - Iovation
  - Socure
tags:
  - fintech
  - prepaid-cards
  - banking-as-a-service
  - adobe-aem
  - form-abandonment
  - feature-flags
  - identity-verification
  - multi-brand
  - enrollment-funnel
  - dead-code
headline: "The enrollment app's public config names an active LogPiiOnUnload flag that captures entered data when users abandon the signup form."
findings:
  - "The enrollment app's unauthenticated appsettings endpoint lists 14 active feature flags including LogPiiOnUnload, EnableBuyerRemorse, and CRVCrossSellPromo -- the first naming a mechanism that logs personally identifiable information when users navigate away from the signup form before submitting."
  - "AEM's GQL search endpoint is publicly accessible and returns an internal service account path from the user repository -- on a site that handles SSNs, bank routing numbers, and identity documents during enrollment."
  - "Adobe Livefyre's CDN script fires on every page load and fails with ERR_CONNECTION_REFUSED -- the service was shut down in 2021 but the script tag and five CSP directive entries were never removed."
  - "The production CSP's connect-src includes two dev-environment URLs for a nextestate.com rewards platform, leaking that a rewards feature is wired to staging servers in the live configuration."
  - "TrustArc's consent manager is blocked by the site's own CSP on the enrollment subdomain -- the page that collects SSNs and identity documents cannot render its consent interface."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Green Dot is a prepaid debit card issuer and Banking-as-a-Service provider serving tens of millions of low- and middle-income customers. The website is two separate systems: a marketing site at `www.greendot.com` running Adobe Experience Manager, and an enrollment app at `secure2.greendot.com` that the app itself calls `legacy`. The split is more than cosmetic -- the two have different CSPs, different tracking stacks, and different levels of exposure.

## Stack & Architecture

The marketing site runs Adobe Experience Manager 6 on Apache, behind CloudFront. Response headers identify the layer precisely: `x-dispatcher: dispatcher1useast1-b80` (AEM Dispatcher, US East region), `x-runmode: PROD`, `x-vhost: greendot-publish`. CloudFront cache headers confirm the CDN layer. The production HTML contains a comment with a full git commit SHA: `<!-- v:54defac63c3edd56755536446f7cbb8b807a3c5d -->`.

The enrollment app at `secure2.greendot.com/enroll` is a separate Angular SPA. Its own configuration endpoint (`/enroll/api/appsettings`) returns `"programCode": "legacy"` and `"developmentEnvironment": "prod"` -- the platform explicitly labels itself legacy in production. The enrollment backend is versioned separately: auth endpoints at `/api/auth/v1/`, onboarding at `/api/onboard/v1/`, money movement at `/api/moneymovement/v1/`.

Key JavaScript globals on the marketing site:

- `digitalData` -- Adobe data layer. On first load (logged-out): `pageName: "gdc:main:home:home"`, `brand: "gdc"`, `custId: "not_applicable"`, `status: "logged_out"`. The object structure mirrors the Adobe Experience Platform data schema.
- `Ktag_Constants` -- Kenshoo (now Skai) ad tracking constants: `UNIVERSAL_CHANNEL_COOKIE_NAME: "ken_uc"`, `KENSHOO_UUID_NAME: "ken_uuid"`, `GOOGLE_ADS_CLICK_PARAM_NAME: "_gac"`, `BING_CLICK_ID_PARAM_NAME: "msclkid"`. Cookie names for the full paid search attribution stack.
- `_satellite` / `__satelliteLoaded` -- Adobe Launch container loaded from `assets.adobedtm.com/launch-EN4d3bbd51ce8242a9ac07e47f33b7d6fd.min.js`. The container was last built `2026-02-25T03:44:40Z`, Turbine version `29.0.0`.
- `GDOT` -- Green Dot's own namespace, contains a small utilities object.

Cookies set on first visit (no interaction): `mbox` and `mboxEdgeCluster=35` (Adobe Target), `kndctr_21A0776A5244568A0A490D44_AdobeOrg_identity` (Adobe IMS/ECID), `kndctr_21A0776A5244568A0A490D44_AdobeOrg_cluster=or2` (Adobe edge routing), `AMCV_21A0776A5244568A0A490D44%40AdobeOrg` (Adobe Marketing Cloud Visitor ID), `_uetsid` / `_uetvid` (Microsoft UET/Bing), `s_nr30` / `s_tslv` (Adobe Analytics new/returning visitor signals).

The `robots.txt` disallows `/*?*` -- all query strings from crawlers -- and lists four sitemaps: `sitemap.xml`, `helpcenter.xml`, `blog.xml`, `arc.xml`. SSL is a single-domain cert for `www.greendot.com` issued by DigiCert to Green Dot Corporation, Pasadena CA. A `security.txt` is present with `vulnerabilitysubmissions@greendotcorp.com` and a PGP key.

## The Enrollment Funnel

The enrollment app is the most instrumented part of the site. Before any user interaction, the app fetches its own configuration from a public endpoint:

```
GET https://secure2.greendot.com/enroll/api/appsettings
```

Response (200, no auth):

```json
{
  "isGreendot": true,
  "applicationId": "30001",
  "privateLabelName": "greendot",
  "features": [
    "CreateUserShowMobileVerification",
    "CRVCrossSellPromo",
    "CRVShowMobile2FA",
    "DisplaySummaryPageOA",
    "DisplaySummaryPageOS",
    "EnableBuyerRemorse",
    "EnableUploadID",
    "IsOsCrossSellPromoOn",
    "IsRegCrossSellPromoOn",
    "LogPiiOnUnload",
    "Overdraft",
    "ShowtoChampion",
    "ShowVoiceCallOption",
    "SupportAutoLogin"
  ],
  "programCode": "legacy",
  "developmentEnvironment": "prod"
}
```

`LogPiiOnUnload` is the most specific flag in that list. The name describes the behavior: PII entered into the enrollment form is logged when the user navigates away (browser `unload` / `pagehide` event), before they submit. This is the form abandonment capture mechanism. The `diagnostics/log` endpoint fires five times during a single enrollment page load:

```
POST https://secure2.greendot.com/api/moneymovement/v1/diagnostics/log
```

The enrollment bundle's exposed API map connects `LogPiiOnUnload` to a broader prospect pipeline:

- `registerProspect` / `retrieveProspect` -- `/{programCode}/enrollment/samples` -- a "prospect" record is created as soon as form data is entered
- `enrollmentRecovery` -- `/enrollment/samples/recovery` -- retrieves abandoned enrollments
- `aemProspectEnrollment` -- `/aem/prospect/enrollment` -- links the enrollment funnel back to the AEM CMS, likely for email follow-up triggers
- `createUtmTracking` / `updateUtmTracking` -- `/{programCode}/enrollment/campaigntracking` -- UTM parameters from the user's landing URL are captured and stored at account creation. Green Dot issues cards for third-party programs; knowing which ad campaign drove each account opening informs attribution and cross-sell decisions.

Other active flags worth noting: `EnableBuyerRemorse` (a post-purchase cancellation window, required by some state regulations for financial products), `CRVCrossSellPromo` (cross-sell promotion after card registration), `SupportAutoLogin` (session persistence), `ShowVoiceCallOption` (phone verification alternative).

The enrollment flow includes device fingerprinting. Two iovation scripts load from `secure2.greendot.com` itself -- proxied through Green Dot's own domain to avoid third-party blocking:

```
/iojs/general5/static_wdp.js
/iojs/5-11-0/dyn_wdp.js
```

The JS copyright header identifies the vendor: `Copyright(c) 2025 TransUnion LLC`. Iovation was acquired by TransUnion in 2018. The device fingerprint collected during enrollment flows to TransUnion.

Identity verification is handled by Socure (`dv.socure.io`), also present in the CSP. A W9 eligibility check fires early in the flow:

```
GET https://secure2.greendot.com/api/onboard/v1/registration/validatew9eligibility?productkey=7881
```

The device token endpoints establish multi-step fingerprinting before any user data is entered:

```
POST /api/auth/v1/useragents/devicetokens  -> 201
POST /api/auth/v1/useragents/requesttokens -> 201
POST /api/auth/v1/prelogin/tokens/pos2     -> 201
```

## Surveillance Stack

Green Dot operates one of the more layered tracking stacks visible on a consumer financial site. The full picture spans the marketing site, the enrollment app, and the Adobe Launch container.

**Adobe full stack.** Adobe Analytics beacons to `smetrics.greendot.com` (first-party proxied), report suite `gdcgreendot-prod`. Adobe Target runs at `greendot.tt.omtrdc.net` with `digitalData.abTest.adobeTarget` exposed in the data layer. Adobe Audience Manager (Demdex) is active via `adobedc.demdex.net` -- this is Adobe's cross-site DMP; visitor IDs from greendot.com can be matched against Demdex's broader cross-site audience graph. Adobe AEP Web SDK (Alloy) posts to `edge.adobedc.net/ee/or2/v1/interact?configId=b3ac5946-5632-4961-a3ff-d5d960025c22`.

**Session recording.** Microsoft Clarity (`clarity.ms/tag/`) and Decibel Insight (`cdn.decibelinsight.net`, account/site ID `14131/1706138`) both run. Decibel posts to `collection.decibelinsight.net` during enrollment sessions. Medallia (formerly Kampyle) runs at `nebula-cdn.kampyle.com/wu/598903/onsite/embed.js` for NPS and exit surveys.

**Advertising attribution.** The enrollment page fires eight separate Google/DoubleClick conversion tags on page load:

| Tag ID | Type | Event |
|--------|------|-------|
| AW-760063496 | Google Ads | page_view |
| AW-957984351 | Google Ads | page_view |
| AW-960675777 | Google Ads | page_view |
| AW-1003293187 | Google Ads | page_view |
| AW-1028748020 | Google Ads | page_view (+ conversion label `MQMVCMLj5LsBEPTlxeoD`) |
| AW-1067978052 | Google Ads | page_view |
| DC-9732365 | DoubleClick/DV360 | page_view |
| DC-9825211 | DoubleClick/DV360 | page_view |

Six Google Ads IDs on a single page is consistent with managing attribution across multiple agency relationships or campaign managers simultaneously -- each ID tied to a different spend bucket. AW-1028748020 is the one that fires a named conversion event, suggesting it's the primary attribution pixel for completed signups.

Additional paid channels: Bing/Microsoft Ads UET (tag ID `4026071`, beacons to `bat.bing.com`), TVSquared (`collector-6902.tvsquared.com/tv2track.js` -- TV ad attribution), Clinch (`cdn.clinch.co/a_js/client_pixels/clq/script.min.js` -- dynamic creative personalization), StackAdapt (DSP, in CSP via `*.tags.srv.stackadapt.com`), The Trade Desk (`*.adsrvr.org`).

**Social pixels.** Two separate Facebook/Meta Pixel IDs fire on the enrollment page: `879600552416305` and `560203384142421`. Two IDs usually indicates separate Business Manager accounts or cross-brand tracking.

**Affiliate.** ImpactRadius tracks affiliate clicks via `impact_clickid` and `impact_customerId` cookies. Extole (referral/viral marketing, client ID `630221252`) fires from `origin.xtlo.net` on the enrollment page.

**First-party identity.** An AEM servlet at `/bin/aep/fpid` generates a fresh UUID and sets an `FPID` cookie (`HttpOnly, Secure, SameSite=Lax`, 390-day max-age) to anchor Adobe Experience Platform identity across sessions. The endpoint requires no authentication and is called twice on every page load -- the duplicate calls appear to be a bug.

## AEM Exposure

Adobe Experience Manager's default Sling GET servlet renders any JCR node as JSON when the `.json` extension is appended. Several endpoints are accessible without authentication:

```
GET /bin/querybuilder.json
```
Returns 30 results from the AEM content tree, including `/libs/` framework paths and `/content/communities/` internal pages. The `path` parameter doesn't filter results.

```
GET /bin/wcm/search/gql.json?query=type:rep:User
```
Returns an internal AEM service account path:
```json
{"hits":[{"name":"r9dj2hwa1G3cUqyEYmRQ","path":"/home/users/r/r9dj2hwa1G3cUqyEYmRQ","excerpt":"/home/users/r/r9dj2hwa1G3cUqyEYmRQ","title":"r9dj2hwa1G3cUqyEYmRQ"}],"results":1}
```

The GQL search endpoint exposing a user repository path is the more notable of the two. Standard AEM hardening blocks CRXDE (`/crx/de/index.jsp` -> 404), the Felix console (`/system/console/bundles` -> 404), and Package Manager (`/crx/packmgr/index.jsp` -> 404) -- but the QueryBuilder and GQL endpoints weren't locked down.

Content fragments in the DAM are also accessible:
```
GET /content/dam/greendot.json
{"jcr:primaryType":"sling:OrderedFolder","jcr:created":"Tue Feb 26 2019 23:27:03 GMT+0000"}

GET /content/dam/greendot/api-product-finder/i-want-to-shop-online/i-want-to-shop-online/jcr:content.json
```
The latter returns metadata including `cq:versionCreator: "admin"` (the AEM admin account created this content), `cq:lastReplicationAction: "Activate"`, and content fragment type information.

## Dead Code & Artifacts

**Livefyre.** On every page load, the AEM template fires a script request to `cdn.livefyre.com/Livefyre.js` that returns `ERR_CONNECTION_REFUSED`. Adobe acquired Livefyre in 2016 and shut it down in 2021. Five years later, the script tag is still in the AEM page template, and `*.livefyre.com` remains in every CSP directive (script-src, connect-src, img-src, style-src, font-src). The domain no longer resolves.

**Commented-out code.** Two markers in the HTML source: commented-out Typekit CSS links (`use.typekit.net` still in the CSP despite the comments), and a commented-out AEM ContextHub include (`<!-- <sly data-sly-resource="contexthub" /> -->`). ContextHub is AEM's client-side data layer for personalization -- its template tag was disabled but never removed.

**Legacy enrollment platform.** The enrollment app labels itself `"programCode": "legacy"` throughout. The API paths use `/{programCode}/` as a URL segment, meaning every enrollment API call contains the word "legacy" in the path: `/legacy/prospect/validatepii`, `/legacy/enrollment/campaigntracking`, etc.

## Platform Architecture: Multi-Brand Footprint

Green Dot operates several brands -- go2bank, Rushcard, Walmart MoneyCard, chirpwhitelabel -- and the technical seams between them are visible in several places.

**Adobe Launch container.** The shared container at `launch-EN4d3bbd51ce8242a9ac07e47f33b7d6fd.min.js` includes hostname branching logic:

```js
location.host.indexOf("rushcard") > -1 ? "gdcrushcard-prod" : 
location.host.indexOf("greendot") > -1 ? "gdcgreendot-prod" : undefined
```

Rushcard (acquired 2015) and greendot.com share a single Adobe Launch deployment. A change to this container affects both brands simultaneously.

**Production CSP reveals dev environment.** The `connect-src` directive of the production greendot.com CSP includes two development URLs for a third-party rewards platform:

```
https://pie-secure-gdrewardsdev.nextestate.com/
https://qa-secure-gdrewardsdev.nextestate.com
```

`nextestate.com` is a loyalty/rewards vendor. These dev-environment endpoints appear in the production CSP's `connect-src`, indicating a rewards feature is in active development and has been wired (at least in the CSP configuration) to staging servers in production.

**go2bank chat widget.** The homepage loads a chat widget bundle from a `go2bankonline.com` CDN:

```
https://prod-cdn.go2bankonline.com/modules/web-chat/current/stand-alone/static/js/main.js
```

The URL contains `current` with no version identifier -- a live URL that can be updated without any change to greendot.com's source. The bundle is served from Azure Blob Storage (`x-ms-blob-type: BlockBlob`) with `access-control-allow-origin: *`. At 1.7MB, it's a significant chunk of the page's JS load that can be silently replaced by whoever controls the go2bank CDN infrastructure.

**Legacy login domain.** `secure.greendot.com` now redirects to a not-found page but its CSP header still serves. That CSP reflects Green Dot's pre-2020 vendor stack: Reson8 (`ds.reson8.com`), Chango (`*.chango.com`, acquired by Rubicon Project ~2015), WebTrends (`ots.optimize.webtrends.com`), UpSellIt (`*.upsellit.com`, exit-intent), QuantumDisputes (`*.quantumdisputes.com`), VeInteractive (`configusa.veinteractive.com`), and Twilio for messaging -- alongside Braze, Decibel Insight, and iovation, which survived into the current stack.

## Machine Briefing

**Access & auth.** The marketing site (`www.greendot.com`) is fully public -- standard HTTP GET, no auth, no rate limiting observed. The enrollment app (`secure2.greendot.com/enroll`) is an SPA that initializes with public API calls before user input. The AEM JSON endpoints require no auth. Session cookies are set automatically on first request.

**Open endpoints (no auth required):**

```bash
# AEM QueryBuilder -- internal content tree
curl "https://www.greendot.com/bin/querybuilder.json"

# AEM GQL search -- service account path
curl "https://www.greendot.com/bin/wcm/search/gql.json?query=type:rep:User"

# AEM DAM root
curl "https://www.greendot.com/content/dam/greendot.json"
curl "https://www.greendot.com/content/dam/greendot-web.json"

# Adobe AEP First-Party ID -- returns fresh UUID, sets FPID cookie
curl "https://www.greendot.com/bin/aep/fpid"

# Enrollment app configuration
curl "https://secure2.greendot.com/enroll/api/appsettings"

# W9 eligibility
curl "https://secure2.greendot.com/api/onboard/v1/registration/validatew9eligibility?productkey=7881"

# Enrollment agreements
curl "https://secure2.greendot.com/api/onboard/v1/registration/agreements"
```

**Enrollment session initialization (sequential, no auth):**

```bash
# Step 1: device token
POST https://secure2.greendot.com/api/auth/v1/useragents/devicetokens

# Step 2: request token
POST https://secure2.greendot.com/api/auth/v1/useragents/requesttokens

# Step 3: pre-login token
POST https://secure2.greendot.com/api/auth/v1/prelogin/tokens/pos2
```

**AEM content fragments.** Any path under `/content/dam/greendot/` can be fetched as JSON by appending `.json`. Append `/jcr:content.json` to get node metadata:

```bash
curl "https://www.greendot.com/content/dam/greendot/api-product-finder/i-want-to-shop-online/i-want-to-shop-online/jcr:content.json"
```

**Adobe Edge Network.** The configId for the AEP Web SDK:
```
configId: b3ac5946-5632-4961-a3ff-d5d960025c22
endpoint: https://edge.adobedc.net/ee/or2/v1/interact
```

**Enrollment API base paths.** All enrollment endpoints use `programCode = "legacy"`:
```
/{programCode}/prospect/validatepii
/{programCode}/enrollment/campaigntracking
/{programCode}/user/directmailwinback
/enrollment/samples/recovery
/{programCode}/enrollment/samples  (registerProspect/retrieveProspect)
/aem/prospect/enrollment
```
Base: `https://secure2.greendot.com/`

**Gotchas.**
- The FPID endpoint fires twice per page load -- the duplicate call appears to be a client-side bug, not intentional.
- QueryBuilder returns a fixed default result set of 30 items; the `path` parameter does not filter.
- The enrollment app requires cookies from the device token flow before most authenticated endpoints will respond. Attempting POST to enrollment endpoints without a prior device token sequence returns 401.
- TrustArc CMP is blocked by CSP on `secure2.greendot.com` -- consent interaction cannot complete on the enrollment subdomain.
- The diagnostics/log endpoint (`POST /api/moneymovement/v1/diagnostics/log`) accepts requests throughout the session; the payload format isn't documented in the bundle, only that it fires on unload events when `LogPiiOnUnload` is active.
