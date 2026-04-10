---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "PG&E — Teardown"
url: "https://pge.com"
company: "Pacific Gas and Electric"
industry: Utilities
description: "California's largest investor-owned electric and gas utility."
summary: "pge.com splits across three stacks: the public marketing site runs Adobe Experience Manager on Akamai, the customer portal at myaccount.pge.com is Salesforce Lightning with Vlocity Industries CRM behind F5 Volterra ADC, and the outage alerts app at pgealerts.alerts.pge.com is a Hugo static site on S3 and CloudFront. Both main properties share an Adobe Launch tag management org and OneTrust consent script. The outage map is powered by a self-hosted ArcGIS Enterprise stack at pge.esriemcs.com serving unauthenticated REST queries and vector tiles; energy analytics routes through Oracle OPower behind SAML; bill payment delegates to KUBRA."
date: 2026-04-07
time: "02:21"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack:
  - Adobe Experience Manager
  - Salesforce Lightning
  - Vlocity Industries
  - ArcGIS Enterprise
  - F5 Volterra
  - Akamai
  - Hugo
  - Oracle OPower
  - KUBRA
trackers:
  - Adobe Analytics
  - Adobe Target
  - Adobe Audience Manager
  - Adobe Helix RUM
  - Medallia
  - Microsoft Clarity
  - Decibel Insight
  - LinkedIn Insight
  - Flashtalking
  - Datadog RUM
  - OneTrust
tags:
  - utilities
  - california
  - arcgis
  - salesforce
  - aem
  - adobe-launch
  - onetrust
  - consent-bypass
  - outage-api
  - energy-data
headline: "PG&E's unauthenticated outage API embeds an AWS KMS key ARN and account ID in every active outage record -- infrastructure credentials baked into public GeoJSON."
findings:
  - "The ArcGIS outage REST API at ags.pge.esriemcs.com requires no authentication and returns every active outage with crew status, estimated restoration time, and a blueSkyNotificationSubscription blob that decodes to reveal AWS account ID 900405192347, KMS key ARN, and region us-west-2 in plaintext metadata."
  - "Production JavaScript on myaccount.pge.com hardcodes Adobe Launch script IDs for four non-production environments -- stg, uat, qa, and dev -- in a hostname-to-script mapping shipped to every visitor's browser."
  - "The Content Security Policy on myaccount lists both Adyen live and Adyen test payment endpoints in production, alongside an AWS API Gateway WebSocket ID, AEM cloud program and environment IDs, and the full Salesforce org namespace -- a multi-cloud topology map readable from a single HTTP header."
  - "Each outage record includes a SPID (Service Point ID) and geographic coordinates for the affected infrastructure point, queryable in bulk with no authentication via standard ArcGIS REST queries."
  - "OneTrust is configured as GDPR-type for all US visitors, but categories C0001 through C0004 -- including targeting and advertising -- default to active on page load, auto-granting full consent before any user interaction on a California-regulated utility's site."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Pacific Gas and Electric is California's largest investor-owned utility, serving 16 million people across 70,000 square miles of northern and central California. Their digital infrastructure spans a marketing site, a customer account portal, an outage notification system, and a real-time GIS-powered outage map -- each running on a different stack, stitched together by shared Adobe and OneTrust identifiers.

---

## Architecture

**www.pge.com** runs Adobe Experience Manager (AEM) on Akamai CDN. Content paths follow AEM conventions: `/content/pge/` for pages, `/content/dam/pge/` for DAM assets, `/etc.clientlibs/pge/clientlibs/` for client libraries. Response headers confirm Akamai delivery (`akamai-grn`, `x-served-by: cache-bur-kbur*-BUR`). The AEM cloud publish origin is `publish-p55603-e1239010.adobeaemcloud.com` (program ID `p55603`, environment ID `e1239010`), referenced in the myaccount CSP. Adobe Launch manages all tag injection, loading Adobe Analytics, Adobe Target, Audience Manager, and Medallia after OneTrust consent evaluation. An Adobe Helix RUM micro-script fires unconditionally via `defer` before consent loads.

**myaccount.pge.com** is Salesforce Lightning Experience with Vlocity Industries (Salesforce Energy & Utilities Cloud) for utility billing and CRM. Confirmed by `LSKey[vlocity_cmt]vlocity.isCommunityPage` in sessionStorage, Aura framework globals (`$A`, `aura`, `AuraLocker`, `lwcRuntimeFlags`), and the `/myaccount/s/sfsites/` URL pattern. F5 Volterra ADC fronts the Salesforce instance (`server: volt-adc`, `x-volterra-location: b-sv10-sjc`), with Envoy proxy underneath (`x-envoy-upstream-service-time` headers). The Salesforce org namespace is `pgeservice`, confirmed across `pgeservice.my.salesforce.com`, `pgeservice.my.salesforce-scrt.com`, `pgeservice.file.force.com`, and `pgeservice--c.vf.force.com`.

**pgealerts.alerts.pge.com** is a Hugo 0.111.3 static site on S3 + CloudFront (`server: AmazonS3`, `x-cache: Hit from cloudfront`). It hosts the outage map and notification management, sharing the same OneTrust domain script as the other PG&E properties.

The outage map itself is powered by a self-hosted ArcGIS Enterprise stack at `pge.esriemcs.com`, with separate subdomains for the MapServer (`ags.pge.esriemcs.com`), vector tiles (`outages.pge.esriemcs.com`), basemaps (`basemaps.pge.esriemcs.com`), and the ArcGIS JavaScript API (`js.pge.esriemcs.com`).

### Subdomain Map

| Subdomain | Stack | Purpose |
|---|---|---|
| `www.pge.com` | AEM + Akamai | Marketing, content, tariffs |
| `myaccount.pge.com` | Salesforce Lightning + Volterra | Customer account management |
| `pgealerts.alerts.pge.com` | Hugo + S3 + CloudFront | Outage alerts and notifications |
| `help.pge.com` | Salesforce Experience Cloud | Customer support knowledge base |
| `pge.opower.com` | Oracle OPower | Energy usage analytics (SAML gated) |
| `secure8.i-doxs.net` | KUBRA | Bill payment portal |
| `ags.pge.esriemcs.com` | ArcGIS Enterprise | Outage GIS MapServer |
| `outages.pge.esriemcs.com` | ArcGIS | Outage vector tile hosting |
| `myaccount-stg.pge.com` | Salesforce (staging) | Staging (403, IP-restricted) |
| `myaccount-qa.pge.com` | Salesforce (QA) | QA (403, IP-restricted) |
| `myaccount-uat.pge.com` | Salesforce (UAT) | UAT (403, IP-restricted) |
| `myaccount-dev.pge.com` | Salesforce (dev) | Dev (403, IP-restricted) |

---

## ArcGIS Outage API

PG&E's outage map is backed by a self-hosted ArcGIS Enterprise MapServer at `ags.pge.esriemcs.com`. All endpoints are unauthenticated.

### Service Structure

`GET https://ags.pge.esriemcs.com/arcgis/rest/services/43/outages/MapServer?f=json` returns the service metadata with this layer inventory:

| Layer ID | Name |
|---|---|
| 0 | CRC Locations (Community Resource Centers) |
| 2 | PSPS Outage Locations (Public Safety Power Shutoff) |
| 4 | Outage Locations (active outage points) |
| 7 | Public Safety Outage Polygon |
| 8 | Outage Polygon (scale-dependent) |

Layer 4 holds active point outage data. Layer 8 holds polygon outage data but has a `minScale: 288895` threshold in service metadata -- the REST query API ignores this constraint and returns whatever features exist at the time.

### Active Outage Record Schema

Querying layer 4 with `where=1=1&outFields=*` returns every active outage. Each record includes:

```json
{
  "OUTAGE_ID": "216176",
  "OUTAGE_START": 1775606070000,
  "CURRENT_ETOR": 1775619000000,
  "EST_CUSTOMERS": 1,
  "OUTAGE_CAUSE": null,
  "CREW_CURRENT_STATUS": "T-Man Enroute",
  "SPID": "7510380343",
  "blueSkyNotificationSubscription": "..."
}
```

The `SPID` (Service Point ID) is a utility infrastructure identifier for the physical service point experiencing the outage. Geographic coordinates are included in the default geometry response.

### AWS KMS Key ARN in Outage Records

The `blueSkyNotificationSubscription` field is present on every active outage record. It contains an AWS Encryption SDK ciphertext blob. The AWS Encryption SDK header format includes plaintext metadata outside the encrypted payload. Decoding reveals:

- **aws-kms key ARN**: `arn:aws:kms:us-west-2:900405192347:key/158ac06f-76f1-4402-ac0b-01b3be3fd53e`
- **AWS account ID**: `900405192347`
- **Region**: `us-west-2`
- **purpose**: `Blue Sky Notification Subscription`
- **aws-crypto-public-key**: `DAtFz1IjF//zrqU28yAuxxjc+A5gmYsBWZBEp7OXEqtyWxvhGhn+xbpb/QSo0aTBn9w==`

The ciphertext itself cannot be decrypted without KMS access. But the key ARN and account ID are plaintext metadata in every outage record returned by an unauthenticated API. This is not a publishable client-side key doing its job -- it is infrastructure metadata that identifies the AWS account and encryption key without being necessary for end consumers.

### Real-Time Vector Tiles

`GET https://outages.pge.esriemcs.com/arcgis/rest/services/43/outages/status.json` returns the current update timestamp in `YYYYMMDD-HHmm` format (UTC), updating approximately every 10 minutes. Vector tile snapshots are available at predictable paths:

```
https://outages.pge.esriemcs.com/arcgis/rest/services/43/outage_points/{timestamp}/tile/{z}/{y}/{x}.pbf
https://outages.pge.esriemcs.com/arcgis/rest/services/43/outage_polygons/{timestamp}/tile/{z}/{y}/{x}.pbf
```

No authentication required.

---

## Consent and Tracking

### OneTrust Auto-Grant

OneTrust domain script ID `838e5e40-6705-4395-8583-c1a72f214e72` is shared across all three PG&E properties. The OneTrust ruleset applies a single "Global" rule covering all countries including the US, typed as `GDPR`. Cookie categories:

| Group | ID | Default Status |
|---|---|---|
| Strictly Necessary | C0001 | Always active |
| Analytics | C0002 | Active (on by default) |
| Functional | C0003 | Active (on by default) |
| Advertising/Targeting | C0004 | Active (on by default) |
| Social Media | C0005 | Active (on by default) |

The banner configuration includes `ScrollCloseBanner: true` and `NextPageCloseBanner: true`.

On a fresh visit with no prior cookies, the dataLayer records this sequence:

```
OneTrustLoaded  -> OnetrustActiveGroups: ",,"                              (pre-initialization)
OptanonLoaded   -> OptanonActiveGroups:  ",,"
OneTrustLoaded  -> OnetrustActiveGroups: ",C0001,C0002,C0003,C0004,"      (auto-activated)
OptanonLoaded   -> OptanonActiveGroups:  ",C0001,C0002,C0003,C0004,"
OneTrustGroupsUpdated -> Adobe Launch loads
```

All categories transition from empty to fully active without any user-interaction event in the dataLayer. `OptanonWrapper` reads `window.OnetrustActiveGroups`, finds C0002, C0003, and C0004 already present, and injects the Adobe Launch script tag on the `OneTrustGroupsUpdated` event. This fires Adobe Analytics, Adobe Target, Audience Manager, and Medallia immediately.

The OneTrust config has `GpcOptOutNoteText` populated ("Opted out due to GPC signal"), indicating GPC signal handling is configured -- but the auto-grant cycle completes before the GPC check can intervene on a standard page load.

PG&E is a California Public Utilities Commission-regulated entity headquartered in Oakland. CPRA requires affirmative opt-in for sharing personal data. Auto-granting all consent categories including C0004 (targeting/advertising) without documented user action is a compliance concern.

### Tracker Inventory (www.pge.com)

| Vendor | Details |
|---|---|
| Adobe Analytics | `pacificgasandelectricco.sc.omtrdc.net`, account `pgeprod` |
| Adobe Target | `pge.tt.omtrdc.net/rest/v1/delivery`, fires on every page load including 404s |
| Adobe Audience Manager | `dpm.demdex.net`, `pge.demdex.net` |
| Adobe Helix RUM | RUM token `50f2ebef1`, fires unconditionally before consent |
| Medallia | Property `wdcwest/375486`, topic `pge-sea1-medallia-com-pge`, SDK 2.61.1 |
| OneTrust | Domain script `838e5e40-6705-4395-8583-c1a72f214e72` |

### Tracker Inventory (myaccount.pge.com, additional)

| Vendor | Details |
|---|---|
| Microsoft Clarity | Tag `pf4vm3upb4` |
| Decibel Insight / Contentsquare | Property `14105`, WebSocket `wss://collection.decibelinsight.net/i/14105/ws/` |
| LinkedIn Insight | `snap.licdn.com`, `px.ads.linkedin.com` |
| Flashtalking | `servedby.flashtalking.com` |
| Datadog RUM | `browser-intake-datadoghq.com` |

Decibel Insight session recording on myaccount is consent-gated more strictly than the main site: the Adobe Launch rule requires `OptanonActiveGroups` to contain C0002, C0003, and C0004, **and** the `PGE_COOKIE_ACCEPT` cookie to equal `accept-all`. That cookie is only written when the user explicitly clicks the "Accept All" button in the OneTrust banner. The main site's trackers fire on auto-grant alone.

---

## Staging Environment Disclosure

The production page source on `myaccount.pge.com` contains an inline script mapping hostnames to Adobe Launch script IDs:

```javascript
const adobeTagManager = {
  'myaccount.pge.com':     'launch-5997da1635b7.min.js',
  'myaccount-stg.pge.com': 'launch-44965feedb68-development.min.js',
  'myaccount-uat.pge.com': 'launch-3acf70539438-development.min.js',
  'myaccount-qa.pge.com':  'launch-1f567b85707b-development.min.js',
  'myaccount-dev.pge.com': 'launch-0480e100559d-development.min.js'
};
```

All four non-production subdomains return HTTP 403 -- they exist but are IP-restricted. The hostnames and their corresponding Adobe Launch environment IDs are public in production JavaScript.

The Content Security Policy on myaccount exposes two additional internal hostnames:
- `publish-p55603-e1239010.adobeaemcloud.com` -- AEM as a Cloud Service publish environment (program `p55603`, environment `e1239010`)
- `wwwpgeqa.pge.com` -- QA environment for the main www property

---

## Backend Infrastructure via CSP

The myaccount CSP enumerates PG&E's multi-cloud topology in a single header:

- **AWS API Gateway WebSocket**: `wss://urtgbbo249.execute-api.us-west-2.amazonaws.com` -- API Gateway ID `urtgbbo249`, likely real-time outage notification or push channel
- **Oracle Cloud Storage**: `objectstorage.us-ashburn-1.oraclecloud.com` -- in img-src, media-src, connect-src, style-src (document or bill storage)
- **Oracle OPower**: `util.opower.com`, `pge.opower.com` -- energy analytics (Home Energy Reports)
- **KUBRA**: `secure8.i-doxs.net` -- third-party utility bill payment processor
- **AEM Cloud**: `publish-p55603-e1239010.adobeaemcloud.com` -- returns HTTP 500 on direct root request (not blocked, not hardened)
- **Adyen**: Both `checkoutshopper-live.adyen.com` and `checkoutshopper-test.adyen.com` in the same production CSP
- **Stripe**: `js.stripe.com`
- **Conga Composer**: `composer.congamerge.com` -- contract generation
- **Power BI**: `app.powerbi.com` -- embedded dashboards in the account portal

The CSP allows `'unsafe-inline'` for script-src with no `script-src-elem` constraint -- the Salesforce Aura framework depends on inline scripts.

### CORS Headers

The `access-control-allow-origin` on www.pge.com static assets alternates between `https://myaccount.pge.com` (main document, images, fonts) and `https://resources.digital-cloud-west.medallia.com` (JS/CSS clientlib files). The Medallia origin includes `access-control-allow-credentials: true`.

The `access-control-allow-headers` on clientlib responses exposes custom internal API header names:

```
cocguid, content-type, pge_login_name, secapikey, x-ras-api-userkey
```

`pge_login_name` and `x-ras-api-userkey` are custom headers for a backend RAS API. `secapikey` is a secondary API key header. These are enumerated in CORS preflight responses on public static assets.

---

## Security Notes

**Vulnerability Disclosure Program**: `/en/about/company-information/vulnerability-disclosure-policy.html`. Contact: `pgecirt@pge.com`.

**HSTS**: `max-age=2628000` on www.pge.com (30.4 days). `max-age=31536000` on myaccount.pge.com.

**CSP on www.pge.com**: `frame-ancestors 'self' https://myaccount.pge.com` -- minimal, no `script-src`.

**AEM cloud instance**: `publish-p55603-e1239010.adobeaemcloud.com` returns HTTP 500 on root -- not blocked, not hardened.

**Adobe Target on 404s**: The outage center page (`/en/outages-and-safety/outage-center.html`) returns HTTP 404, but Adobe Target still fires a POST delivery API call with session ID, marketing cloud visitor ID, supplemental data ID (Analytics-Target stitch key), and Audience Manager segment blob. Client-side personalization executes regardless of HTTP status code.

**AEM path leakage**: Content repository paths are exposed in public URLs -- `/content/experience-fragments/pge/en/site/header/master/_jcr_content/`, `/content/experience-fragments/pge/en/site/alerts/urgent-alert/master.html`. The alert polling fires three XHR calls per page view to check for active site-wide alerts, all returning 404 during this investigation.

---

## Machine Briefing

### ArcGIS Outage API (No Auth)

```bash
# Service metadata and layer list
GET https://ags.pge.esriemcs.com/arcgis/rest/services/43/outages/MapServer?f=json

# Query all active outage points
GET https://ags.pge.esriemcs.com/arcgis/rest/services/43/outages/MapServer/4/query?where=1=1&outFields=*&returnGeometry=false&f=json

# Query all active outage polygons (includes geometry + blueSkyNotificationSubscription)
GET https://ags.pge.esriemcs.com/arcgis/rest/services/43/outages/MapServer/8/query?where=1=1&outFields=*&returnGeometry=true&f=json

# Count only (faster)
GET https://ags.pge.esriemcs.com/arcgis/rest/services/43/outages/MapServer/4/query?where=1=1&returnCountOnly=true&f=json

# PSPS (Public Safety Power Shutoff) data
GET https://ags.pge.esriemcs.com/arcgis/rest/services/43/psps_public/MapServer/1/query?where=1=1&outFields=*&f=json

# Real-time status (last update timestamp)
GET https://outages.pge.esriemcs.com/arcgis/rest/services/43/outages/status.json

# Vector tile snapshot (replace timestamp from status.json lastUpdated, format: YYYYMMDD-HHmm)
GET https://outages.pge.esriemcs.com/arcgis/rest/services/43/outage_points/{timestamp}/tile/{z}/{y}/{x}.pbf
GET https://outages.pge.esriemcs.com/arcgis/rest/services/43/outage_polygons/{timestamp}/tile/{z}/{y}/{x}.pbf
```

### Salesforce / Aura API (Login Required for Account Data)

```bash
# Aura endpoint (fires on login page; account data requires authenticated session)
POST https://myaccount.pge.com/myaccount/s/sfsites/aura?r=0&aura.RecordUi.executeGraphQL=1

# Static resources (no auth)
GET https://myaccount.pge.com/myaccount/resource/{resourceName}
```

### Tariffs and Public Content (No Auth)

```bash
# Tariff sitemap
GET https://www.pge.com/tariffs/en.sitemap.xml

# Electric rate info
GET https://www.pge.com/tariffs/en/rate-information/electric-rates.html

# Urgent alert fragment (poll for active site-wide alerts)
GET https://www.pge.com/content/experience-fragments/pge/en/site/alerts/urgent-alert/master.html
GET https://www.pge.com/content/experience-fragments/pge/en/site/alerts/urgent-alert/urgent-alert-2.html
GET https://www.pge.com/content/experience-fragments/pge/en/site/alerts/urgent-alert/urgent-alert-3.html
```

### Key Identifiers

| System | ID |
|---|---|
| Adobe Org | `DF70BB6B55BA62677F000101@AdobeOrg` |
| Adobe Launch (www) | `PR6a300d67b84a4c9c8ffc7f3f164e4ecc` |
| Adobe Launch (myaccount) | `PRb2a30667f46e4664bec2f6f39cd73d3e` |
| OneTrust Domain Script | `838e5e40-6705-4395-8583-c1a72f214e72` |
| Medallia Property | `wdcwest/375486` |
| Clarity Tag | `pf4vm3upb4` |
| Decibel Insight Property | `14105` |
| Salesforce Org Namespace | `pgeservice` |
| AWS Account (Blue Sky) | `900405192347` |
| KMS Key (Blue Sky) | `arn:aws:kms:us-west-2:900405192347:key/158ac06f-76f1-4402-ac0b-01b3be3fd53e` |
| AWS API Gateway ID | `urtgbbo249` (us-west-2) |
| AEM Cloud Program/Env | `p55603` / `e1239010` |
| Adobe Analytics Account | `pgeprod` |
| Helix RUM Token | `50f2ebef1` |

### Gotchas

- ArcGIS query responses are paginated -- use `resultRecordCount=100&resultOffset=N` to page through large result sets.
- `blueSkyNotificationSubscription` is present on every outage point in layer 4. The KMS key ARN is consistent across all active records.
- Layer 8 (outage polygons) has a `minScale: 288895` threshold in service metadata, but the REST query API ignores scale -- it returns whatever features exist. During low-outage periods, layer 8 may return empty.
- The status.json `lastUpdated` timestamp format is `YYYYMMDD-HHmm` (no seconds, UTC). Use it to construct vector tile paths.
- myaccount.pge.com requires authentication for account data. The Aura API responds HTTP 200 on the login page but returns CMS/configuration data, not account records.
- Decibel Insight on myaccount requires `PGE_COOKIE_ACCEPT=accept-all` cookie -- does not load on page load like main site trackers. Only set when user explicitly clicks "Accept All."
- Adobe Target fires on 404 pages -- the outage center page returns 404 but still generates Target delivery API calls.
- Adyen test environment (`checkoutshopper-test.adyen.com`) is listed alongside the live endpoint in myaccount CSP.
- AEM cloud publish origin (`publish-p55603-e1239010.adobeaemcloud.com`) returns HTTP 500 on root -- not blocked.
