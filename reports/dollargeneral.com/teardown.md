---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Dollar General — Teardown"
url: "https://dollargeneral.com"
company: Dollar General
industry: Retail
description: "Discount retailer operating 20,000+ stores across the United States."
summary: "Dollar General runs Adobe Experience Manager as a Cloud Service (AEM CS) behind dual CDN layers — Fastly (Varnish) and Akamai — with AEM's Sling JSON export left open on the publish tier. The commerce backend proxies through dggo.dollargeneral.com to an 'omni' API layer instrumented with Dynatrace APM. Authentication uses SAP Customer Data Cloud (Gigya) for identity and a custom token cookie chain (appToken, idToken, customerGuid, partnerApiToken) for API access. Adobe Launch orchestrates analytics, Adobe Target handles personalization, and Clarip manages consent."
date: 2026-04-07
time: "03:44"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack:
  - Adobe AEM Cloud
  - Fastly
  - Akamai
  - SAP Gigya
  - Adobe Launch
  - Dynatrace
  - React
trackers:
  - Adobe Analytics
  - Adobe Target
  - Adobe RUM
  - Branch.io
  - Criteo
  - Clarip
  - Salsify
  - PowerReviews
  - Flipp Enterprise
tags:
  - retail
  - aem-cloud
  - jcr-exposure
  - feature-flags
  - employee-emails
  - localhost-leak
  - dual-cdn
  - gigya
  - store-bitmask
  - dam-staging
headline: "AEM's Sling JSON exporter is open on the publish tier — the entire content tree, DAM, employee emails, test pages, and future-dated staging folders are browsable by appending .json to any path."
findings:
  - "Appending .1.json to any AEM content path returns the full JCR node tree including employee emails (7 found), replication timestamps, version history UUIDs, template paths, and WCM configuration — the Sling JSON exporter was never locked down on the publish dispatcher."
  - "The DAM staging folder at /content/dam/staging exposes date-named subfolders through April 30, 2026 — a calendar of scheduled content drops visible three weeks before publication."
  - "The footer ships Adobe's corporate address (345 Park Avenue, San Jose, CA 95110) instead of Dollar General's headquarters — a template placeholder that made it to production with a 2024 copyright date."
  - "Signifyd fraud detection is fully wired into the page (CDN script URL, DOM node ID) but the feature flag isSignifydSdkOn is false — checkout runs without client-side fraud scoring."
  - "The return policy modal contains two links pointing to http://localhost:4502 — the AEM author instance's default port — that shipped to production and render as dead links for every user."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

Dollar General's site runs on Adobe Experience Manager as a Cloud Service (AEM CS), confirmed by the origin header `publish-p137762-e1400902.adobeaemcloud.com` and AEM-standard paths (`/etc.clientlibs`, `/content/dam`, `/conf/dollargeneral`). The `meta[name="template"]` tag reads `home-page-template`, and the Sling resource type is `dollargeneral/components/structure/page`.

The edge infrastructure is dual-layered: Fastly (identified via `x-served-by: cache-bur-kbur8200048-BUR`, `x-timer` header) serves as the primary CDN, with Akamai as a secondary layer (confirmed by `akamai-cache-status`, `akamai-grn` headers). Both are visible in response headers simultaneously, suggesting Akamai sits in front of Fastly or handles specific request types.

The commerce backend lives at `dggo.dollargeneral.com`, which hosts the "omni" API — a unified service layer for store operations, inventory, user authentication, and product data. All omni API requests carry a family of custom headers: `X-DG-appToken`, `X-DG-appSessionToken`, `X-DG-customerGuid`, `X-DG-deviceUniqueId`, `X-DG-partnerApiToken`, plus a Bearer token from the `idToken` cookie.

Authentication uses SAP Customer Data Cloud (Gigya) at `mylogin.dollargeneral.com` with API key `3_M5IMinllSkCPyY5I4fzm6PsK-UGnwc6Q_KDu3t08CXAyL0vauzrafPksTQs_oiYc`. Session lifetime is 31,536,000 seconds (1 year) with a 60-second logout warning. The Gigya script declares `sessionExpiration: -2` and `rememberSessionExpiration: -2`, which in Gigya's API means "use server-default" — a year-long session.

The frontend is a hybrid: AEM server-renders the page shell and navigation, while React components handle interactive elements (product detail pages, carousels, cart). The comment in the feature flags block confirms this: "when using React components do not access from window, use redux's featureFlags state NOT window.__FEATURE_FLAGS__." Webpack is the bundler. Adobe's ACDL (Adobe Client Data Layer) handles event tracking.

Security headers: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security: max-age=31557600` (~1 year). No `Content-Security-Policy` header was observed. The AEM Granite CSRF token library (`granite/csrf`) is loaded but the open JSON endpoints suggest dispatcher-level filtering is incomplete.

---

## The Open JCR Content Tree

AEM's Sling JSON exporter is active on the publish tier. Appending `.1.json` (depth-1) to any content path returns the JCR node structure with full metadata. This is a well-known AEM misconfiguration — the Sling GET servlet's JSON rendering should be blocked at the dispatcher level for production.

### What's Exposed

**Content paths** — `GET /content/dollargeneral/us/en.1.json` returns every child page name, JCR properties, replication status, template references, and modification metadata. The response for the homepage alone is 445 lines of JSON. Incrementing to `.2.json` adds another depth level. Depths above 2 return a 300 redirect with child path suggestions.

**Employee emails** — the `cq:lastModifiedBy`, `cq:lastRolledoutBy`, and `cq:lastReplicatedBy_scene7` fields contain employee email addresses. Seven unique `@dollargeneral.com` addresses were found across different content paths without any targeted enumeration:

| Email | Found in |
|-------|----------|
| `mosejobe@dollargeneral.com` | Homepage `lastRolledoutBy` |
| `aduenas@dollargeneral.com` | Homepage `lastReplicatedBy_scene7` |
| `kaelliso@dollargeneral.com` | About Us `lastRolledoutBy` |
| `jjesuraj@dollargeneral.com` | Root content `lastModifiedBy` |
| `avasquez@dollargeneral.com` | Corporate/Error pages |
| `atakkous@dollargeneral.com` | Test folder `lastRolledoutBy` |
| `abashera@dollargeneral.com` | DAM test-assets `lastModifiedBy` |

**Test pages** — `/content/dollargeneral/us/en/test-folder` contains developer test pages on the live site: `ahmad-test-home`, `rollout-page`, `supply-chain-finance-preview`, `test`, `general-mill-test`, `test-2`, `spendwell-copy`, `test-arturo`. Each has `noindex, nofollow` robot tags but is fully browsable and its JCR metadata is public.

**DAM structure** — `/content/dam.1.json` lists all DAM root folders including `test-assets`, `staging`, `adobe-target`, `popshelf` (DG's discontinued retail brand), `cyber-monday`, and `trainingmodels`. The `test-assets` folder was being actively used the day of investigation — `FTO_5.jpg` and `FTO_6.jpg` were uploaded by `abashera@dollargeneral.com` on April 7, 2026.

**Campaign templates** — `/content/campaigns.1.json` exposes allowed template patterns including newsletter templates (`/apps/.*/templates/newsletter.*`, `/conf/.*/settings/wcm/templates/.*email.*`), commerce promotion templates, and voucher templates.

**Experience Fragments** — `/content/experience-fragments/dollargeneral.1.json` reveals the Sling config reference, Adobe Target export format (`html`), and allowed template patterns.

**Internal configuration** — the root content node at `/content/dollargeneral.1.json` shows a redirect target to `/content/dollargeneral/ca` with Sling redirect enabled and a 302 status code, revealing the internal routing logic.

---

## The Staging Calendar

The DAM staging folder at `/content/dam/staging.1.json` exposes 23 date-named subfolders covering April 8 through April 30, 2026 — a three-week window of pre-scheduled content drops. Each folder is created by `dynamic-dam-date-folder-service`, confirming this is an automated staging pipeline.

While the individual date folders were empty at the time of investigation (assets likely get moved into them closer to the scheduled date), the folder structure itself reveals Dollar General's content calendar. The dates are daily granularity — meaning content is staged per day, not per campaign cycle. This folder is created automatically by AEM's DAM date-folder service.

---

## Feature Flags in the Window

The `window.__FEATURE_FLAGS__` object is set globally on every page, exposing 22 production feature flags:

| Flag | Value | Significance |
|------|-------|-------------|
| `isRewardsOn` | `false` | Rewards program exists in code but is disabled |
| `isSignifydSdkOn` | `false` | Fraud detection wired up but turned off |
| `isSubstituteBestMatchOn` | `false` | Delivery substitution algorithm disabled |
| `isCriteoBannerOn` | `true` | Criteo retargeting banners active |
| `isIbottaOn` | `true` | Ibotta cashback integration live |
| `enableBazaarvoice` | `true` | Bazaarvoice reviews enabled |
| `isSalsifyOn` | `true` | Salsify product content platform active |
| `isOrderModificationOn` | `true` | Post-order modification enabled |
| `isOrderSubstitutionOn` | `true` | Order substitutions enabled |
| `enableStoreSelectionFromURL` | `true` | Store can be set via URL parameter |
| `useCloudServicesHeader` | `true` | Cloud migration in progress |
| `isPersistGuestCartV2` | `true` | V2 of guest cart persistence |

The source code contains multiple `TODO: remove after full roll out to cloud` comments, confirming an active migration from a legacy system (referred to as "AMS") to AEM Cloud Services. The flag `useCloudServicesHeader` controls this migration, and legacy code paths coexist alongside cloud code paths throughout the authentication flow.

### Signifyd: Wired but Disabled

Signifyd is a fraud detection platform that generates device fingerprints and risk scores during checkout. Dollar General's page includes the Signifyd configuration in the DOM:

```html
<div data-signifyd-script-url="https://cdn-scripts.signifyd.com/api/script-tag.js" id="signifyd-script-url"></div>
<div data-signifyd-node-id="sig-api" id="signifyd-node-id"></div>
```

But `isSignifydSdkOn: false` means the script is never loaded. The CDN URL, DOM container, and integration logic are all in production HTML but the flag prevents execution. Checkout operates without client-side fraud fingerprinting.

---

## The Store Service Bitmask

Dollar General encodes store capabilities as a bitmask integer — a compact representation where each bit position maps to a service:

```javascript
SEZZLE_BIT_MASK_VALUE  = 524288  // bit 19: 1000 0000 0000 0000 0000
BOPIS_BIT_MASK_VALUE   = 8       // bit 3:  0000 0000 0000 0000 1000
DELIVERY_BIT_MASK_VALUE = 256    // bit 8:  0000 0000 0001 0000 0000
```

The `storeService` field from the store API is a single integer. Bitwise AND against each mask determines if a store offers Sezzle (buy-now-pay-later), BOPIS (buy online, pick up in store), or same-day delivery. Only three masks are defined client-side — the server likely encodes additional services in the remaining 16 bits. A store with service value `524552` (binary `1000 0000 0001 0000 1000`) would offer all three services.

Store data flows through Akamai geolocation: the `akamaiLatitude` and `akamaiLongitude` cookies are set from the guest token response, then used to find the nearest store via `POST /omni/api/store/search/inventory`. The default store number is `1014` when no geolocation is available.

---

## The Localhost Links

The shipping and return policy modal — rendered for every visitor who clicks "Shipping & return policy" — contains two links pointing to `http://localhost:4502`:

```
http://localhost:4502/content/dollargeneral/en/help-center.html?t=shipping
```

Port 4502 is the default port for AEM's author instance. These links were authored in the AEM author environment and never updated for production. They render as dead links for every user.

---

## The Wrong Address

The footer data layer contains a text component with:

```
Copyright 2024, Dollar General. All rights reserved.
345 Park Avenue, San Jose, CA 95110-2704, USA
```

345 Park Avenue, San Jose, CA 95110-2704 is Adobe's corporate headquarters. Dollar General is headquartered at 100 Mission Ridge, Goodlettsville, Tennessee 37072. A separate footer text component correctly states "Copyright 2025. Dollar General Corporation. All rights reserved." — the template placeholder was never fully replaced, and both copyright blocks exist simultaneously.

---

## Authentication Flow

Every page load triggers a token chain:

1. **Guest token acquisition** — `POST /bin/omni/user/guest` returns `appSessionToken`, `anonymousToken` (stored as `idToken`), `customerGuid`, and `partnerApiToken`. These are set as cookies with 1-year expiry.

2. **Akamai geolocation** — the guest response also returns `akamaiLatitude` and `akamaiLongitude`, derived from the user's IP address server-side.

3. **Store assignment** — coordinates are posted to `POST dggo.dollargeneral.com/omni/api/store/search/inventory` to find the nearest store, then `GET dggo.dollargeneral.com/omni/api/store/info/{storeNumber}` retrieves full store details.

4. **Signed-in upgrade** — Gigya login triggers `/bin/omni/omniAuth` which upgrades the token chain to authenticated tokens. The `authType` cookie tracks state: `0` for guest, `1` for signed-in.

The "spark code" system handles API-level error routing. Token expiry is detected via response headers (`x-spark`), and four specific UUIDs trigger automatic token refresh:

```
2548a7f3-7bf4-4533-a6c1-dcbcfcdc26a5
2cf51692-2bea-4ccc-ba8e-70c463a55fc9
e5d248e8-7573-4719-9e5c-1d49b67134de
b419e0e0-af8a-413d-8af2-b3e1f7005193
```

AEM's `/bin/omni` servlet endpoints return a Jetty error page on 403 responses, exposing the servlet class: `org.apache.felix.http.base.internal.dispatch.DispatcherServlet-7f999818`.

---

## Consent Architecture

Dollar General uses Clarip for both cookie consent management and Do Not Sell compliance. The consent check runs before Branch.io initialization:

```javascript
const isOptedOut =
    claripGPCCookie === "true" ||
    (claripCookie && !claripCookie.includes("3")) ||
    dnssCookie === "1" ||
    userOptOut === "true";
```

GPC (Global Privacy Control) is respected — `clarip_gpc: "true"` triggers opt-out. The `dollargeneral_clarip_consent` cookie must contain `"3"` (targeted advertising category) to be considered opted-in. Branch.io's `tracking_disabled` flag is set based on this consent state.

The Clarip cookie consent manager can be force-opened by navigating to any page with `?cookmod=true` in the URL.

---

## Machine Briefing

**Access and auth:** AEM content is freely accessible via `.json` selectors on the publish tier. No authentication needed for content tree traversal. The omni API at `dggo.dollargeneral.com` requires the full token header chain — tokens can be obtained from `/bin/omni/user/guest` but this endpoint returns 403 from non-browser contexts.

### Open Endpoints

| Endpoint | Method | Returns |
|----------|--------|---------|
| `/content/dollargeneral/us/en.1.json` | GET | JCR content tree with page metadata, employee emails, templates |
| `/content/dollargeneral/us/en/{path}.1.json` | GET | Any page's JCR content at depth 1 |
| `/content/dam.1.json` | GET | Full DAM folder structure |
| `/content/dam/staging.1.json` | GET | Scheduled content calendar |
| `/content/dam/test-assets.2.json` | GET | Test assets with uploader emails |
| `/content/experience-fragments/dollargeneral.1.json` | GET | Experience Fragment config |
| `/content/campaigns.1.json` | GET | Campaign template configuration |

### Authenticated Endpoints

| Endpoint | Method | Headers Required | Returns |
|----------|--------|------------------|---------|
| `dggo.dollargeneral.com/omni/api/store/info/{id}` | GET | Full X-DG-* header chain + Bearer | Store details with service bitmask |
| `dggo.dollargeneral.com/omni/api/store/search/inventory` | POST | Full X-DG-* header chain + Bearer | Nearest stores by coordinates |
| `/bin/omni/user/guest` | POST | Browser UA | Guest tokens (appSessionToken, idToken, customerGuid, partnerApiToken) |
| `/bin/omni/omniAuth` | POST | Browser session | Authenticated token upgrade |
| `/bin/omni/userTokens` | GET | Browser session | Token refresh |
| `/bin/omni/logout` | GET | Browser session | Session termination |

### Key Identifiers

- **AEM Cloud:** `publish-p137762-e1400902.adobeaemcloud.com`
- **Gigya API Key:** `3_M5IMinllSkCPyY5I4fzm6PsK-UGnwc6Q_KDu3t08CXAyL0vauzrafPksTQs_oiYc`
- **Google Maps API Key:** `AIzaSyDi0nb6nKeHaDJWFtAvbAIPKBrUuAc_mTY`
- **Branch.io Key:** `key_live_hiGqVFLVt21O0DvNjMcaUfjkzspbvUYu`
- **Adobe Launch:** `assets.adobedtm.com/39f2549a4b49/9f882f09b585/launch-d23598f5c007.min.js`
- **Adobe Target Client:** `dollargeneral`
- **Clarip Client ID:** `564488b67655ab291c6a`
- **Clarip Cookie Manager ID:** `75179596d3cc1cdd614f`
- **Dynatrace:** `dtCookie` on `.dollargeneral.com` domain
- **Default Store Number:** `1014`
- **Omni API Base:** `dggo.dollargeneral.com`
- **Scene7 Image CDN:** `s7d1.scene7.com/is/image/dolgen/`

### Notes for Agents

- JSON depth is capped at 2 on the publish tier. Depth 3+ returns HTTP 300 with child path suggestions — follow those to enumerate deeper.
- The test-folder at `/content/dollargeneral/us/en/test-folder` is actively used by developers as of the investigation date.
- Feature flags are in `window.__FEATURE_FLAGS__` on every page. The `isRewardsOn: false` flag suggests an unreleased loyalty feature.
- The `enableStoreSelectionFromURL` flag means `?storeNumber=XXXX` on any URL overrides the user's preferred store.
- The AMS-to-Cloud migration is in progress. Code paths branch on `authType` cookie and `useCloudServicesHeader` flag. Both legacy and cloud endpoints are live.
