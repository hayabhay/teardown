---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Mattress Firm — Teardown"
url: "https://www.mattressfirm.com"
company: "Mattress Firm"
industry: "Retail"
description: "Brick-and-mortar and online mattress retailer with 2,300+ US stores."
summary: "Mattress Firm runs Next.js on Vercel with Microsoft Dynamics 365 Commerce as its backend — all product images route through images-us-prod.cms.dynamics365commerce.ms, and the retail server at scut4827hwx29564597-rs.su.retail.dynamics.com serves OData 7.3 endpoints for catalog, cart, and channel data. Authentication is Azure AD B2C under login.mattressfirm.com/mfrmb2cprod.onmicrosoft.com. Search is handled by Constructor.io and Unbxd in parallel. Tag orchestration is Tealium IQ; consent is OneTrust. The same D365 backend manages 1800Mattress.com, Tulo.com, and Amazon marketplace channels under a single MFI data area."
date: "2026-04-08"
time: "17:06"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack: [Next.js, Vercel, Microsoft Dynamics 365 Commerce, Azure AD B2C, Constructor.io, Tealium IQ, Apollo GraphQL, Cloudflare]
trackers: [Google Analytics 4, Google Ads, Google Campaign Manager, Facebook Pixel, Pinterest Pixel, Snapchat Pixel, Reddit Pixel, Amazon Advertising, Criteo, Trade Desk, Spotify Pixel, Bing UET, ID5, ContentSquare, Datadog RUM, ZineOne, Forter, BounceExchange, Dotomi, Podium, Adobe Experience Platform, Commission Junction, ClinchTV, Salesforce Marketing Cloud, OneTrust]
tags: [retail, mattress, dynamics-365, session-recording, pre-consent-tracking, multi-brand, feature-flags, open-api, connected-tv, podcast-attribution]
headline: "Dotomi fires before Mattress Firm's consent banner loads — transmitting your IP-derived zip code, DMA market code, and hashed user ID to 30 ad networks with consent marked UNSPECIFIED."
findings:
  - "The D365 Commerce retail server (scut4827hwx29564597-rs.su.retail.dynamics.com/Commerce/) is publicly accessible without authentication. GetChannels returns all four eCommerce channels — 1800Mattress.com (E290002), Tulo.com (E290005), MattressFirm.com (E290007), and an Amazon 3rd Party channel (E290010) — plus 196 store entities under DataAreaId: MFI. GetEnvironmentConfiguration returns the Azure TenantId (781b2864-d506-4f20-bfc3-e88990c8ae18), EnvironmentId, and three Application Insights instrumentation keys."
  - "ContentSquare session recording is configured with consentRequired: 0 and sampleRate: 100 — every visitor is recorded from page load, before any consent banner interaction. The _cs_id and _cs_s cookies are set immediately on arrival. k-aus1.contentsquare.net/v2/recording fires on every page type confirmed."
  - "Dotomi fires with dtm_consent=UNSPECIFIED and transmits IP-derived location (dtm_zip_code, dtm_state, dtm_dma_code), full user agent, and a SHA-256 hashed user ID to ~30 third-party ad networks via its sync mechanism — all before any consent selection."
  - "Adobe Target feature decisions are returned from /api/adobe-target without authentication on every page load. The mfrm-seg cookie (e.g., of0-bdl1-stbd1-) encodes the visitor's current experiment state in plain text, is readable by JavaScript, and expires in the year 3025."
  - "Cloudflare response headers passthrough internal geo-enrichment data on every 403: x-0-geo-city, x-0-geo-latitude, x-0-geo-longitude, x-0-geo-postal-code, x-0-geo-state-code, x-0-geo-metro-code — leaking the visitor's precise location to any observer of the response headers, including browser extensions and proxies."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

## Architecture

Mattress Firm's frontend is Next.js, deployed on Vercel (build ID `dpl_2HVWYVLASsN4MZHPYnaUwEXqBngj` in CSS chunk URLs, Vercel Speed Insights loaded from `_vercel/speed-insights/script.js`). The backend is Microsoft Dynamics 365 Commerce — confirmed by product image routing through `images-us-prod.cms.dynamics365commerce.ms` (220 requests on a single PDP), the OData retail server at `scut4827hwx29564597-rs.su.retail.dynamics.com`, and the Azure AD B2C sign-in flow at `login.mattressfirm.com/mfrmb2cprod.onmicrosoft.com`. The robots.txt still contains legacy Demandware/SFCC patterns (`demandware.store`), suggesting a prior platform migration.

The GraphQL layer (`POST /graphql`) uses Apollo Client; Cloudflare WAF blocks introspection. Search runs Constructor.io and Unbxd in parallel — Constructor.io handles primary search, Unbxd handles carousel recommendations. Tag orchestration is Tealium IQ (`tags.mattressfirm.com/d365mattressfirm/prod/utag.js`) with 30+ tag IDs. Consent management is OneTrust (ID `8086fb2d-dd81-42c9-b9f3-3a3214c8b77d`). A/B testing runs Adobe Target and VWO. State is Apollo Client plus React context.

The same D365 backend manages at minimum four sales channels: MattressFirm.com, 1800Mattress.com, Tulo.com (private label), and an Amazon 3rd Party integration — all under a single `MFI` data area. Salesforce Service Cloud (chat), Bazaarvoice (reviews), and Podium (reviews/chat) all run concurrently.

## Unauthenticated D365 Retail Server

The D365 Commerce retail server exposes a public OData endpoint at:

```
https://scut4827hwx29564597-rs.su.retail.dynamics.com/Commerce/
```

The root entity set listing returns without authentication. Notable entity sets exposed: `Categories`, `Carts`, `Customers`, `Employees`, `Checklists`, `SalesOrders`, `Products`, `Catalogs`, `CommerceLists`, `ProductLists`, `Recommendations`, `Bundles`, `AddaBase`, `DreamHubCarts`, `FailedOrders`, `EmailSubscriptions`, `MFIOnlinePay`, `Progressive`, `TryInStores`.

**GetChannels** (`/Commerce/GetChannels?api-version=7.3&$top=50`) returns all channels without auth:

| Channel Name | Unit | Type |
|---|---|---|
| eCommerce Cart - 1800Mattress.com | E290002 | SharePointOnlineStore |
| eCommerce Cart - Tulo.com | E290005 | SharePointOnlineStore |
| eCommerce Cart - MattressFirm.com | E290007 | SharePointOnlineStore |
| eCommerce 3rd Party - Amazon | E290010 | SharePointOnlineStore |

Plus ~196 retail store channels.

**GetEnvironmentConfiguration** returns:

```json
{
  "EnvironmentId": "3be704cf-0997-4b3c-92d4-a3080a514677",
  "TenantId": "781b2864-d506-4f20-bfc3-e88990c8ae18",
  "ClientAppInsightsInstrumentationKey": "2d016f91-bbf2-48c8-8450-f78485f18ac7",
  "HardwareStationAppInsightsInstrumentationKey": "0f787160-4711-4b32-8f97-579538b1189f",
  "WindowsPhonePosAppInsightsInstrumentationKey": "309f41bf-f6b1-4ed8-9dfc-b29883f5d6d4",
  "BaseVersion": "9.55.25271.3"
}
```

Sensitive endpoints require auth: Customers, Employees, SalesOrders, GetPaymentConfiguration all return UserAuthenticationException. The OrgUnits endpoint reveals `TaxGroup: "VertexAR"` (Vertex Automated Returns), `FunctionalityProfileId: "MFI_Reward"`, and `DefaultCustomerAccount: "CN000001000"`.

Azure AD B2C sign-in flow: `login.mattressfirm.com/mfrmb2cprod.onmicrosoft.com/oauth2/v2.0/authorize`, policy `b2c_1a_v1_prod_susi`, client ID `80e6ac90-dc16-4496-bcea-6aa20b95b0db`, redirect URI `/_msdyn365/authresp`. Social sign-in via Facebook or Google available.

## ContentSquare — 100% Recording, No Consent Required

ContentSquare is configured to capture all visitors without consent:

```javascript
CS_CONF.consentRequired = 0
CS_CONF.replayConsentRequiredForSession = 0
CS_CONF.sampleRate = 100
CS_CONF.replayRecordingRate = 100
```

The session ID cookies `_cs_id` and `_cs_s` are set immediately on page load. Recording beacons fire to `k-aus1.contentsquare.net/v2/recording` across homepage, PDP, category, and cart page — confirmed in every network capture. ContentSquare's integration list includes InMoment, Datadog, Bazaarvoice, YouTube, Adobe Target, and VWO, meaning session recordings are correlated across all these systems.

OneTrust is present (ID `8086fb2d-dd81-42c9-b9f3-3a3214c8b77d`) and configured with `UseV2: true` and a US-specific GDPR ruleset. The `dtm_consent=UNSPECIFIED` cookie persists throughout — Tealium's consent flag is never resolved to an affirmative state during normal browsing.

## Dotomi Pre-Consent Tracking

The Dotomi pixel fires with `dtm_consent=UNSPECIFIED` and transmits:

- `dtm_zip_code` — IP-derived zip code (94123 observed)
- `dtm_state` — state (CA)
- `dtm_dma_code` — Nielsen DMA market code (807)
- `dtm_user_agent` — full user agent string
- `dtm_user_id` — SHA-256 hashed user ID
- `dtm_sync` — triggers syncs with approximately 30 downstream ad networks

The `dtm_token` Dotomi identity token is also embedded in the Dotomi script URL on the page.

## Geo Header Leak

Every HTTP response — including 403 error responses — passes through Cloudflare with upstream geo-enrichment headers visible to the client:

```
x-0-geo-city: San Francisco
x-0-geo-country-code: US
x-0-geo-latitude: 37.77493
x-0-geo-longitude: -122.41942
x-0-geo-metro-code: 807
x-0-geo-postal-code: 94102
x-0-geo-state-code: California
```

These are Cloudflare upstream enrichment headers that Mattress Firm's origin is injecting into the response and are being reflected back to the client. Any browser extension, proxy, or shared network that can observe response headers receives the visitor's precise location for every page request.

## Adobe Target Feature Flags

`GET /api/adobe-target` returns the current visitor's feature decisions without authentication on every page load:

| Flag | Status | Scope |
|---|---|---|
| `omni-finder` | disabled | omni-finder-prod |
| `cart-cross-sell-prod` | disabled | — |
| `pdp-bundling` | enabled | pdp-bundling-prod |
| `storybranded-hp` | enabled | storybranded-hp-prod |

The `mfrm-seg` cookie (`of0-bdl1-stbd1-`) encodes the same state in a human-readable format:
- `of0` — omni-finder disabled
- `bdl1` — PDP bundling enabled
- `stbd1` — story-branded homepage enabled

Cookie is set with `Secure` but not `HttpOnly` (JavaScript-readable), and expires August 9, 3025.

## Advertising Attribution Breadth

32 distinct trackers confirmed active. Notably non-standard:

**ClinchTV / Connected TV**: `c.tvpixel.com/js/current/dpm_pixel_min.js?aid=mattress_firm_a6c38c6d-8477-4949-8173-787547967372` — connects website visits to TV ad exposures across streaming platforms.

**Podcast attribution**: `cdn.pdst.fm/ping.min.js` (Podscribe) — attributes website visits to podcast listener segments.

**ZineOne AI personalization**: WebSocket connection to `cloud.zineone.com` on every page. WebSocket ID `28cb9bac-db96-4896-83cf-a2bfb...` is a stable tenant ID, persisting across navigation. Fires `actionResponse` events on search pages, indicating real-time AI-driven personalization decisions.

**ID5 Identity**: `id5-sync.com` cross-publisher identity graph — hashed email or fingerprint is resolved to an ID5 ID shared across participating publishers.

**Persado AI copywriting**: Campaign `1293_YjbOcGdLjq` (email capture modal) is currently `PAUSED` but the script still loads and fires a status beacon to `rts.persado.com/api/status` on every page.

## LaunchDarkly Flags

LaunchDarkly SDK key `66fd90381dedaa07ef259dc9` is client-side (expected). The SDK returns 659 flags on eval, but flag names observed include terms like `medspa`, `crm`, and `videochat` — inconsistent with a mattress retailer. The SDK key may be from a shared LaunchDarkly project or a misconfigured environment.

## Machine Briefing

**D365 Retail Server (no auth required):**

```
GET https://scut4827hwx29564597-rs.su.retail.dynamics.com/Commerce/
  → Full OData entity set listing

GET https://scut4827hwx29564597-rs.su.retail.dynamics.com/Commerce/GetChannels?api-version=7.3&$top=50
  → All eCommerce and retail store channels (DataAreaId: MFI)

GET https://scut4827hwx29564597-rs.su.retail.dynamics.com/Commerce/GetEnvironmentConfiguration?api-version=7.3
  → Azure TenantId, EnvironmentId, Application Insights keys, base version

GET https://scut4827hwx29564597-rs.su.retail.dynamics.com/Commerce/GetChannels?api-version=7.3&$filter=OrgUnitType eq Microsoft.Dynamics.Commerce.Runtime.DataModel.RetailChannelType'OnlineStore'
  → eCommerce channels only
```

**First-party API endpoints (browser session via Cloudflare):**

```
GET  /api/adobe-target              → A/B feature flag decisions (unauthenticated)
GET  /api/address/lookupZip         → Returns visitor zip from IP
GET  /api/pwa/auth/isAuthorized     → Auth state check
GET  /api/pdp/getRelatedLinks       → Product related links
GET  /api/getUnbxdCarousel          → Unbxd recommendation carousel
POST /api/pdp/getBundleRelatedProducts → Bundle cross-sell
POST /api/pdp/getAddABase           → Add-a-base upsell
POST /api/pdp/getCompleteYourBed    → Bundle completion
GET  /api/affirmPromo               → Affirm BNPL promo config
POST /graphql                       → Main data API (Cloudflare WAF blocks introspection)
```

**Auth:**
- Sign-in: `https://login.mattressfirm.com/mfrmb2cprod.onmicrosoft.com/oauth2/v2.0/authorize`
- Policy: `b2c_1a_v1_prod_susi`
- Client ID: `80e6ac90-dc16-4496-bcea-6aa20b95b0db`
- Redirect: `/_msdyn365/authresp`

**Salesforce chat:**
- ORG_ID: `00DG0000000gBKA`
- Site: `https://mattress.my.site.com/ESWMfWChat1755873710209`
- SCRT: `https://mattress.my.salesforce-scrt.com`

**Globals available in browser context:**
- `DD_RUM` — Datadog RUM SDK
- `__alloyNS` — Adobe Alloy / Experience Platform
- `__APOLLO_CLIENT__` — GraphQL client
- `CS_CONF` — ContentSquare config (consentRequired: 0)
- `dataLayer` — GTM data layer

**Gotchas:**
- Cloudflare blocks direct curl — browser session required for all `mattressfirm.com` endpoints.
- D365 retail server is directly accessible without browser session or Cloudflare.
- GraphQL introspection is blocked by Cloudflare WAF even within a browser context.
- LaunchDarkly SDK key returns 659 flags but they appear mismatched to this project.
- `/api/cart/getCart` returned HTTP 500 during investigation.

**Open threads:**
- `DreamHubCarts`, `FailedOrders`, `MFIOnlinePay`, `Progressive`, `TryInStores` entity sets on the D365 server — access not fully tested.
- `GetOnlineChannelAzureB2CConfiguration`, `GetPaymentConfiguration`, `GetSearchConfiguration` on D365 — all return auth errors; structure not confirmed.
- Constructor.io search API (`ac.cnstrc.com/search/{term}?key=key_SnKquhQ8uSEjP8sL`) — returns full catalog data including pricing and variant IDs without session.
- `/api/getSociStores` — returned 200 but failed in some contexts; SOCI store locator endpoint.
- Spanish-language store under `/colchones`, `/camas-y-bases`, `/ofertas` (disallowed in robots.txt) — not investigated.
