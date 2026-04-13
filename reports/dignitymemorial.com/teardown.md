---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Dignity Memorial -- Teardown"
url: "https://www.dignitymemorial.com"
company: "Dignity Memorial"
industry: "Healthcare"
description: "National funeral home, cremation, and cemetery services network operated by SCI."
summary: "Sitecore CMS (.NET) serving the main site with Handlebars templating, and a separate Next.js obituary app hosted on Azure App Services at cdn-obituaries.dignitymemorial.com. Cloudflare WAF on all traffic. Coveo Atomic handles funeral home search. Google Tag Manager orchestrates 17 third-party trackers, with TreasureData CDP handling visitor segmentation."
date: "2026-04-13"
time: "02:43"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack:
  - Sitecore
  - Next.js
  - Coveo Atomic
  - Cloudflare
  - Azure App Services
  - GTM
  - Webpack
trackers:
  - Google Analytics 4
  - Google Ads
  - DoubleClick
  - Facebook Pixel
  - Pinterest
  - The Trade Desk
  - Bing Ads
  - Flashtalking
  - TreasureData
  - CrazyEgg
  - Medallia
  - New Relic
  - Azure App Insights
  - Wistia
  - Sentry
  - AudioEye
tags:
  - funeral-services
  - deathcare
  - sitecore
  - coveo
  - treasuredata
  - crazyegg
  - cdp
  - ad-tech
  - session-recording
  - grief
  - sci
  - onetrust
headline: "Obituary pages push the deceased's birth and death dates, service type, and the funeral home's business codes to 17 ad networks via the GTM dataLayer."
findings:
  - "The Coveo search token embedded in /funeral-homes page source accesses two indexes totaling 106K items -- exposing internal CMS hostnames (cms.svccorp.com, DALPSTCCM01-PST2-cm-upgrade.corp.local.prod), manager and location license numbers, SCI's territory/division/market hierarchy, and Active Directory account names for 60+ content staff."
  - "Obituary pages push the deceased's birth and death dates, service type (cremation vs. burial), the owning SCI subsidiary's legal name, and internal business codes to all 17 connected ad networks via the GTM dataLayer."
  - "Eight Google Ads and DoubleClick conversion events fire on every pageview -- homepage, obituary search, individual obituary pages -- using visit-level tag categories (digni0, digni002) that register ordinary browsing as advertising conversions."
  - "Sympathy flower links on obituary pages route through a Teleflora affiliate URL carrying the obituary ID, location number, and click-source parameter -- monetizing the grief moment with tracked referral revenue."
  - "CrazyEgg session recording runs on funeral home research pages while OneTrust's BG63 group -- 'Allow Sales and Sharing for Targeted Advertising' -- defaults to ON for all non-EU visitors, with GPC signals not honored."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Dignity Memorial is the consumer brand for Service Corporation International (SCI), the largest funeral services company in North America. The corporate relationship is confirmed throughout the site's technical stack: GTM container 7214997, Coveo organization ID `servicecorporationinternational`, internal legal entity names like "SCI Texas Funeral Services, LLC" pushed through the dataLayer, and employee usernames following SCI's Active Directory naming convention. The site serves funeral home search, obituary publishing, preplanning, and cemetery services across the US and Canada -- including French-Canadian and Spanish-language variants.

## Architecture

The site runs two separate applications under one domain. The main `www.dignitymemorial.com` property is a Sitecore CMS (.NET) site with Handlebars templating and Webpack-bundled JavaScript. Cloudflare WAF sits in front of all traffic -- plain curl requests and headless browsers return 403; a full browser session with cookies is required to access most content.

The obituaries subsystem is a separate Next.js application hosted on Azure App Services at `cdn-obituaries.dignitymemorial.com`, identifiable via the `x-ms-middleware-request-id` response header. This app handles obituary search and individual obituary pages, serving data from `/api/v1/obituaries/search` against a database of 5.5 million records. Funeral home search on the main site uses Coveo Atomic (v2.79.1), a headless search framework.

All traffic is brokered through Google Tag Manager (container ID: `7214997`). The full trigger group inventory: `7214997_611`, `7214997_617`, `7214997_620`, `7214997_741`, `7214997_983`, `7214997_1117`.

Infrastructure signals from subdomains in Certificate Transparency logs: `mail.dignitymemorial.com`, `owa.dignitymemorial.com`, `webmail.dignitymemorial.com`, `autodiscover.dignitymemorial.com` -- corporate Exchange/Outlook infrastructure on the same apex domain. `pay.dignitymemorial.com` is a Cloudflare-protected bill pay portal. `abenity.dignitymemorial.com` and `beneplace.dignitymemorial.com` are employee benefits portals. `caa.dignitymemorial.com` and `aaacarolinas.dignitymemorial.com` point to partner portals for CAA (Canadian Automobile Association) and AAA Carolinas.

---

## The Coveo Index

The funeral home search page at `/funeral-homes` inlines a JavaScript configuration block:

```javascript
const coveoAtomicConfig = {
  accessToken: "xxda57036c-237a-480c-8857-0c1e7c1cd7bf",
  organizationId: "servicecorporationinternational",
  source: "Coveo_web_index - DALPSTCCM01-PST2-cm-upgrade.corp.local.prod",
  pipeline: "DM - Funeral Home Search",
  searchHub: "DMLocations",
  indexId: "...-Indexer-4-...",
  indexRegion: "us-east-1"
}
```

The token is a Coveo search token -- meant to be client-side for search-as-a-service. What's notable is not the token itself but the scope of data it exposes.

The `source` field contains `DALPSTCCM01-PST2-cm-upgrade.corp.local.prod` -- SCI's internal Sitecore production CMS server hostname, in the `corp.local` Active Directory domain. Every Coveo record's URI field points to `cms.svccorp.com` paths:

```
https://cms.svccorp.com/es-es/funeral-homes/wisconsin/green-bay/nicolet-memorial-park/9979
```

The token accesses two indexes:

- **Indexer-4** (`DM - Funeral Home Search`, `us-east-1`): 43,981 location-related items
- **Indexer-3** (default pipeline, `us-east-2`): 105,789 items -- broader org content

Each location record exposes:

| Field | Example |
|-------|---------|
| `managerz32xlicensez32xnumber` | `FDR3687` |
| `locationz32xlicensez32xnumber` | `FD1019` |
| `businessz32xcode` | `BIZ0800` |
| `territoryz32xname` | `Central Middle West` |
| `divisionz32xname` | `Metro Division` |
| `businessz32xunitz32xname` | `Major West` |
| `marketz32xsegments` | `Veteran Services` |
| `jdprating` / `jdpratingcount` | `4.9` / count |
| `parsedcreatedby` | `corpsrinivmn` |
| `sysuri` | `https://cms.svccorp.com/...` |

The `z32x` encoding is Coveo's URL-safe field naming convention (space becomes z32x).

Beyond individual records, the index supports `groupBy` aggregations. Running groupBy on `parsedcreatedby` returns the full roster of Sitecore content editors -- 60+ distinct accounts across two naming conventions:

- `corp{surname}{initials}` -- internal staff accounts (e.g., `corpsrinivmn` with 17,514 items, `corpvoan003` with 3,516)
- `sitecore{name}` -- Sitecore-specific accounts (e.g., `sitecorebandajn` with 6,651, `sitecoreanonymous` with 9,759)
- Some accounts appear with `@corp.local` suffixes: `sitecoresummejn1@corp.local` (5,405 items), `sitecorewilliml3@corp.local` (1,137) -- these are raw Active Directory UPN format

The index also exposes per-location toggle flags: `enablecremationpage`, `enablescheduleappointments`, `disablesendflowerslinks`, `showgpldownloadlink` (General Price List), and a set of binary product/service availability flags.

One token, two indexes: 44K location records + 106K org content items + a complete employee roster + internal infrastructure hostnames.

---

## Tracking Stack

The homepage alone generates 84 network requests -- all third-party. No first-party API calls are made on the homepage. The full third-party inventory across a session:

1. **Google Analytics 4** -- `analytics.google.com`, `_ga`, `_ga_94TQ7PLG0D` cookies
2. **Google Ads Conversion** -- two account IDs: `AW-11003116906`, `AW-16486980064`
3. **Google Campaign Manager 360 / DoubleClick Floodlight** -- two advertiser IDs: `DC-13756288`, `DC-11866297`
4. **Google Remarketing** -- `/rmkt/collect/` endpoint for three IDs: `875517724`, `11003116906`, `16486980064`
5. **Facebook Pixel** -- `_fbp` cookie, `_fbq` global
6. **Pinterest Pixel** -- `ct.pinterest.com`, `_pin_unauth` cookie
7. **The Trade Desk** -- `insight.adsrvr.org/track/realtimeconversion`, `TTDUniversalPixelApi` global
8. **Microsoft/Bing Ads UET** -- `_uetsid`, `_uetvid` cookies
9. **Flashtalking** -- `d9.flashtalking.com/lgc` (programmatic ad attribution, 5-7 hits per page)
10. **TreasureData CDP** -- `us01.records.in.treasuredata.com/src_webtracking/sci_pageviews` (event ingestion); `cdp.in.treasuredata.com/cdp/lookup/collect/segments` (segment lookup); `_td`, `_td_global`, `dm3_td_segments` cookies
11. **CrazyEgg** -- `script.crazyegg.com` (site 0052/7988), `tracking.crazyegg.com`; session recording active on research pages
12. **Medallia (Kampyle)** -- `MDIGITAL`/`KAMPYLE_*` globals, `kampyle_userid` cookie, v2.62.0
13. **New Relic** -- `bam.nr-data.net`, browser key `eac7771f5a`
14. **Azure Application Insights** -- `southcentralus-3.in.applicationinsights.azure.com/v2/track`; fires on obituaries app pages
15. **Wistia** -- `distillery.wistia.com`, `fast.wistia.com`, `pipedream.wistia.com`; video analytics on funeral home profile pages
16. **Sentry** -- `__SENTRY__` global; error monitoring
17. **AudioEye** -- accessibility overlay

TreasureData deserves specific mention. The `Treasure` global and CDP integration indicate SCI is building a Customer Data Platform for visitor segmentation. The `dm3_td_segments` cookie starts empty on first visit and populates with segment IDs from the CDP lookup response. The TreasureData event table name is `sci_pageviews` -- this goes to SCI's enterprise CDP instance, not a Dignity Memorial-specific account.

---

## The Conversion Tag Problem

Eight advertising conversion events fire on every pageview -- homepage, obituary search pages, individual obituary pages, funeral home search pages:

```
DC-13756288/visit0/digni0+standard
DC-13756288/visit0/digni002+unique
DC-11866297/visit0/digni0+unique
DC-11866297/visit0/digni00+unique
AW-16486980064/PziZCISJup0ZEOCzzbU9
AW-16486980064/6Hq3CIGJup0ZEOCzzbU9
AW-11003116906/pZPCCI6U1oMYEOr62P4o
AW-11003116906/QNY4CMaL_ooYEOr62P4o
```

The DoubleClick tag categories (`visit0/digni0`, `visit0/digni002`) indicate these are visit-level tags -- they track the existence of a visit, not a booking, contact form submission, or preplanning completion. Google Ads and DoubleClick both receive these as `event: "conversion"` pushes in the gtag call chain. Every person who lands on the homepage -- or who searches for a deceased relative's obituary -- registers as an advertising conversion in two Google Ads accounts and two DoubleClick campaigns.

---

## DataLayer Business Intelligence

On obituary pages, the GTM dataLayer pushes SCI internal business data to all connected networks:

```javascript
{
  "Obituary ID": "12832211",
  "Obituary Type": "Type 3",
  "Obituary DOB": "10/13/1948",
  "Obituary DOD": "4/11/2026",
  "Obituary Has Events Flag": "True",
  "Location Code": "7472",
  "Location Name": "Earthman Resthaven Funeral Home",
  "Corporate Parent Name": "SCI Texas Funeral Services, LLC",
  "Business Code": "BIZ0800",
  "Operation Code": "OPE0725",
  "Territory Name": "Houston",
  "Division Name": "Major Operations",
  "Business Unit Name": "Major West",
  "Segment Type": "COL",
  "Service Type": "CRE",
  "CTA Price": "True"
}
```

This data goes to: Google Analytics, both Google Ads accounts, both DoubleClick campaigns, Facebook Pixel, Pinterest, The Trade Desk, TreasureData CDP, CrazyEgg, New Relic, and Azure App Insights. The decedent's birth and death dates, the specific funeral home's internal SCI codes, the legal subsidiary that owns the location, and whether the family chose cremation ("CRE") vs. burial are all distributed to the full advertising network.

The homepage dataLayer also contains an unusual field: `"Sitecore User-ID"` holds the connecting client's IP address chain (IPv6 + IPv4 from the Cloudflare X-Forwarded-For header). Despite the field name suggesting a Sitecore session identifier, the actual content is the request IP chain, pushed to GTM and all connected tags on every pageview.

On funeral home pages, additional binary flags appear in the dataLayer: `Cat`, `Merc-c`, `Merc-u`, `Pro`, `Ven`. These appear to indicate product/service category availability per location and are distributed to ad networks -- likely used for audience segmentation by service type.

---

## Consent Configuration

OneTrust CMP, UUID `c4a354ac-6779-474e-9c1c-3efab66177ed`, version `202411.2.0`.

The site stores `is_eu=false` in sessionStorage to signal the visitor's regulatory context. For all non-EU visitors, OneTrust auto-enables all consent categories without displaying a banner or waiting for user interaction. The `OptanonConsent` cookie is set on first load with `interactionCount=0` and all groups enabled:

```
C0001:1  -- Essential (always active)
C0003:1  -- Functional (always active)
C0002:1  -- Performance/Analytics (default ON)
C0004:1  -- Targeting (default ON)
C0005:1  -- Social Media (default ON)
BG63:1   -- "Allow Sales and Sharing for Targeted Advertising" (default ON)
```

`BG63` is the CCPA/CPRA group -- the OneTrust configuration for California's "opt-out of sale/sharing" right. It defaults to enabled, meaning the sharing posture is opt-out. The GPC signal is not honored: `isGpcEnabled=0`, `browserGpcFlag=0`.

GTM receives the OneTrust group activations in sequence: first an empty `OnetrustActiveGroups: ",,"` (before config loads), then the full group string `",C0001,C0003,BG63,C0002,C0004,"`. The trigger groups fire immediately after -- no user action required.

---

## Obituary Database and Affiliate Revenue

The obituary system at `cdn-obituaries.dignitymemorial.com` is a separate Next.js application. The search API at `/api/v1/obituaries/search` returns 5,558,685 records on a blank query. Facets include birth decade, record creation date, and location state -- all US states plus Canadian provinces, confirming SCI's cross-border footprint. Individual records return name, birth/death dates, obituary text, CloudFront image URLs, and a link to the public obituary page.

The `/api/v1/internal/cookies` endpoint (disallowed in robots.txt) fires 6 times per obituary page visit with HTTP 204 responses. The frequency pattern suggests per-interaction cookie sync -- possibly TreasureData or OneTrust state reconciliation between the Next.js obituary app and the main Sitecore site.

Sympathy flower links on obituary pages use a Teleflora affiliate URL:

```
https://sympathy.teleflora.com/?LocNumber={location_code}&mId={obituaryId}&campaign_id={click_context}&referrer=none
```

The `campaign_id` parameter distinguishes click sources (top menu vs. floating icon). The `mId` ties the purchase back to the specific obituary, enabling attribution of flower orders to the deceased individual's memorial page.

---

## CRM and Infrastructure

The contact form endpoint at `/Salesforce/SubmitForm` is the lead capture pipeline from visitor inquiries into Salesforce CRM. When accessed without form parameters, it returns:

```json
{"Id": null, "ErrorMessage": "There was a problem submitting the salesforce form, please try again.", "Success": false}
```

The endpoint is functional -- the error is from missing required parameters, not a broken handler.

Sitecore MVC controller endpoints found on funeral home pages:
- `POST /api/sitecore/LocationPremiumPricing/PremiumPricingComponent`
- `POST /api/sitecore/FuneralHome/RatingsComponent`
- `POST /api/sitecore/FuneralHome/RecentObituariesComponent`
- `POST /api/sitecore/FuneralHome/LocationMultiGalleryModal`

All return 200 with empty HTML when called without the Sitecore rendering context parameters.

---

## Machine Briefing

### Access and Auth

Most endpoints require a Cloudflare-cleared browser session. Plain curl returns HTTP 403. The Coveo search API is the primary exception -- it accepts the client token directly in HTTP headers without a browser session.

The obituary search API at `cdn-obituaries.dignitymemorial.com` is Cloudflare-protected but accessible from a headed browser session.

### Endpoints

**Coveo Search -- open, no browser required**

Location search (funeral homes):
```bash
curl -s -X POST "https://platform.cloud.coveo.com/rest/search/v2" \
  -H "Authorization: Bearer xxda57036c-237a-480c-8857-0c1e7c1cd7bf" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "servicecorporationinternational",
    "pipeline": "DM - Funeral Home Search",
    "searchHub": "DMLocations",
    "numberOfResults": 10,
    "firstResult": 0,
    "q": ""
  }'
```

GroupBy query (employee roster):
```bash
curl -s -X POST "https://platform.cloud.coveo.com/rest/search/v2" \
  -H "Authorization: Bearer xxda57036c-237a-480c-8857-0c1e7c1cd7bf" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "servicecorporationinternational",
    "numberOfResults": 0,
    "groupBy": [{"field": "@parsedcreatedby", "maximumNumberOfValues": 100}]
  }'
```

**Obituary Search -- requires browser session**
```
GET https://cdn-obituaries.dignitymemorial.com/api/v1/obituaries/search?keyword={name}&page=1&pageSize=20
```

Blank `keyword` returns all 5.5M records with facets. Facet parameters: `birthDecade`, `state`, `createdDate`.

**Location-specific dynamic content**
```
GET https://www.dignitymemorial.com/dynamic-content/locations/dm/en/{locationCode}.json
```

Location codes are available via Coveo search results (`locationz32xcode` field).

**Salesforce CRM form endpoint (browser session required)**
```
POST https://www.dignitymemorial.com/Salesforce/SubmitForm
```

**Sitecore component rendering (browser session + Sitecore context params required)**
```
POST https://www.dignitymemorial.com/api/sitecore/FuneralHome/RatingsComponent
POST https://www.dignitymemorial.com/api/sitecore/FuneralHome/RecentObituariesComponent
POST https://www.dignitymemorial.com/api/sitecore/LocationPremiumPricing/PremiumPricingComponent
```

### Gotchas

- **Coveo token scope**: The same token hits two different Coveo indexes (Indexer-4 for location search, Indexer-3 for broader org content). Use `logicalIndex` or `pipeline` parameters to target specific indexes.
- **Field name encoding**: Coveo field names use `z32x` for space and `z120x` for dot. `managerz32xlicensez32xnumber` = `manager license number`.
- **Cloudflare blocks headless browsers**: Use Playwright with a real browser profile. The `__cf_bm` cookie is required for session continuity.
- **Obituary API pagination**: Use `page` and `pageSize` parameters. The API is on the Azure subdomain, not `www.dignitymemorial.com`.
- **TreasureData CDP segment lookup** at `cdp.in.treasuredata.com` requires an `x-cdp-token` header not exposed in client-side JavaScript -- server-side only.
