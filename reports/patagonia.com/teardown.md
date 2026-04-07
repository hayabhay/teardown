---
# agents: machine-friendly instructions in "## Machine Briefing"
title: Patagonia — Teardown
url: "https://www.patagonia.com"
company: Patagonia
industry: Retail
description: "Outdoor apparel and gear retailer with a sustainability and activism mission."
summary: "Patagonia runs its primary storefront on Salesforce Commerce Cloud SFRA with jQuery 3.7.1, behind Akamai Bot Manager and a Yottaa performance layer. Recommerce (Worn Wear) operates on a separate Shopify subdomain, and editorial content sits on two independent WordPress installs. Search is powered by Bloomreach Discovery, personalization by Salesforce Einstein CQuotient, and payments by Adyen plus Apple Pay and Klarna BNPL messaging."
date: 2026-04-07
time: "00:50"
contributor: hayabhay
model: sonnet-4.6
effort: high
stack: [Salesforce Commerce Cloud, jQuery, Akamai, Yottaa, Bloomreach, Shopify, WordPress]
trackers: [Google Analytics, Google Ads, Google Tag Manager, FullStory, TikTok Pixel, Pinterest Tag, Snapchat Pixel, Reddit Pixel, LinkedIn Insight, The Trade Desk, ABTasty, Bloomreach, Attentive SMS, Klaviyo, Impact Radius, Qualtrics, Flashtalking, Bing UET]
tags: [ecommerce, sfcc, consent, session-replay, a-b-testing, recommerce, sustainability, multi-platform, dark-pattern]
headline: "A concluded A/B test grays out Apple Pay on every product page — the button works fine, but only after you add the item to cart."
findings:
  - "ABTasty experiment 1555283 ('Apple Pay Show Disabled') renders Apple Pay at 30% opacity with pointer-events:none on all product pages at 100% traffic — marked 'accepted' in ABTasty, meaning this is a decided policy, not a live test, forcing shoppers into the cart before they can use their preferred payment method."
  - "A developer's personal Downloads folder path (file:///Users/jreyesco/Downloads/botfailover (5).html) has been leaking in production since April 2020 — every non-browser request to patagonia.com, including robots.txt, returns this six-year-old Akamai failover page instead of real content."
  - "OneTrust is configured opt-out with all five consent groups pre-consented at page load — 46 cookies from 17 vendors including FullStory session replay, TikTok, and The Trade Desk fire before any visitor interaction, confirmed active for California."
  - "The Worn Wear recommerce catalog at wornwear.patagonia.com runs on Shopify entirely separate from the SFCC main site, and its /products.json endpoint serves 500+ used product listings with prices to any unauthenticated caller."
---

## Platform & Architecture

Patagonia's main storefront is Salesforce Commerce Cloud (SFCC) running the Storefront Reference Architecture (SFRA). The site ID is `patagonia-us` and the platform exposes OCAPI v22.6 at `/s/patagonia-us/dw/shop/v22_6/`. The frontend is jQuery 3.7.1 — not React or any SPA framework. Pages are server-rendered SFCC templates. Asset builds are versioned via `v1775066992438` (a Unix timestamp-based fingerprint visible in all static asset URLs).

The CDN and WAF stack is two layers: Akamai (AkamaiNetStorage for asset delivery plus Akamai Bot Manager for traffic filtering) and Yottaa for performance optimization and quality-of-experience telemetry (`rapid-cdn.yottaa.com`, `rapid-1.yottaa.net`, `qoe-1.yottaa.net`).

**Platform fragmentation** is the defining architectural characteristic of this stack. Four distinct platforms serve patagonia.com properties:

| Property | Platform | CDN |
|----------|----------|-----|
| www.patagonia.com | Salesforce Commerce Cloud SFRA | Akamai |
| wornwear.patagonia.com | Shopify | Cloudflare |
| patagonia.com/blog/ | WordPress | Akamai |
| patagonia.com/actionworks/ | WordPress (separate install) | Akamai |

The Worn Wear recommerce program is a Trove partnership. The main site embeds Trove widgets on product PDPs (`widget-merchandising.production.trovesite.com`) and calls the Trove partner API (`partner-suite-api.trove.com`). The actual Worn Wear catalog and storefront live at `wornwear.patagonia.com` on Shopify — confirmed by `_shopify_y` cookie and Cloudflare response headers.

Search is Bloomreach Discovery (account ID `7718`, tracked via `_br_uid_2` cookie, JS loaded from `cdn.brcdn.com/v1/br-trk-7718.js`). Personalization uses Salesforce Einstein via CQuotient cookies (`cqcid`, `cquid`, `__cq_seg`). A/B testing runs through ABTasty (account `814b17ea9b73a9873ef74ca0fda5871a`).

**Payments:** Adyen SFCC plugin v24.4.1 (`adyen-salesforce-commerce-cloud`) handles card processing. The `Adyen-GetPaymentMethods` endpoint self-describes as `SalesforceCommerceCloud` / `SFRA` with `integrator: null`. Apple Pay is handled by a separate SFCC controller (`__SYSTEM__ApplePay-GetRequest`) with a full Apple Pay session flow supporting visa, amex, masterCard, discover plus 3DS. Klarna provides BNPL messaging only (client ID `33c54e5b-562b-5cbb-80b9-5558d3b5a034`) via `api-na.klarna.com/messaging/v3`. A Chase co-brand credit card program exists — the `/chaseaccountcallback/` and `/chasebillingcallback/` paths are disallowed in robots.txt, though the card was not directly observed during the investigation.

Address validation uses Loqate (account code `PATAG11112` in the site config). Size recommendations use BoldMetrics (`web-api.boldmetrics.io`), which fires four endpoints on product pages including two telemetry endpoints (`/ssc/telemetry`, `/ssc/telemetry-new`).

## The Apple Pay Dark Pattern

ABTasty experiment `1555283`, named "Apple Pay Show Disabled," runs on all `/product/` pages at 100% traffic. It injects the following CSS:

```css
apple-pay-button.d-none {
  display: block !important;
  pointer-events: none !important;
  opacity: 0.3;
  cursor: not-allowed;
}
```

SFCC normally hides the Apple Pay button on product pages using the `d-none` utility class. This experiment overrides that — making the button visible at 30% opacity, unclickable, with a `not-allowed` cursor. Apple Pay is fully functional in the cart (`__SYSTEM__ApplePay-GetRequest` returns 200 on product and cart pages alike) — the suppression is UX-only, applied selectively to PDPs.

The experiment's status in ABTasty is "accepted" — the lifecycle flag indicating the test has concluded and the winning variation applied as policy. This is not a live split test; it is a decided behavior delivered to all visitors. The effect: shoppers see Apple Pay as apparently unavailable on the product page, pushing them to add items to the cart before discovering they can use it. Three other active experiments also run at 100% traffic: `1102216` (site-wide CSS/script adjustments), `1535801` (marketing tile grid fix), and `1102215` (cart adjustments). All four carry `runWithoutConsent: true`.

## The Akamai Failover Artifact

Every request to patagonia.com lacking browser-like headers returns an Akamai bot management failover page — not the actual content requested. This includes `robots.txt`, `sitemap_index.xml`, and any arbitrary path accessed via curl or a non-browser HTTP client.

The failover page is 14,373 bytes, served as `text/html` with `server: AkamaiNetStorage`. Its etag is `83c838e5bfaa976f4db174b88a27f77a:1586795990` and `last-modified` dates to 13 April 2020 — meaning this file has been in production unchanged for over six years.

The file contains two developer artifacts that were never cleaned up before upload:

**1.** An HTML comment in the opening line:
```html
<!-- saved from url=(0055)file:///Users/jreyesco/Downloads/botfailover%20(5).html -->
```
This is the browser's "Save As" mark-of-the-web annotation. A developer named `jreyesco` downloaded the file locally before uploading it to Akamai. The filename `botfailover (5).html` implies at least four prior iterations of this file existed.

**2.** A POST form action embedded in the ESI waitroom template:
```
action="file:///Users/jreyesco/Downloads/$(original_url)"
```

The file also contains unprocessed ESI (Edge Side Includes) tags — `<esi:choose>`, `<esi:when>`, `<esi:vars>`, `<esi:function>` — which Akamai's ESI processor would normally evaluate at the edge. They appear raw in the served HTML, indicating Akamai delivers this file directly without ESI processing for bot-classified requests.

The practical consequence: any automated crawler, SEO auditing tool, monitoring agent, or API client hitting patagonia.com without browser-grade headers receives HTTP 200 with a "Sit tight" holding page. Legitimate search bots that honor `robots.txt` cannot read it via standard HTTP — they receive the failover page instead.

## Consent Architecture

Patagonia uses OneTrust (config UUID `7b341081-d1d9-4887-8cbf-6d335f9c7dd8`, SDK version `202405.2.0`) in an opt-out configuration with all consent groups set to active by default. On the first page load — before any user interaction with the consent banner — the `OptanonConsent` cookie is written with:

```
isGpcEnabled=0
interactionCount=0
groups=C0001:1,C0003:1,C0004:1,C0002:1,C0005:1
```

`interactionCount=0` confirms no user action has occurred. All five groups are pre-consented:

| Group | Category | Default State |
|-------|----------|---------------|
| C0001 | Strictly Necessary | Active (expected) |
| C0002 | Analytical & Performance | **Pre-consented** |
| C0003 | Functional Cookies | **Pre-consented** |
| C0004 | Targeting Cookies | **Pre-consented** |
| C0005 | Social Media & Advertising | **Pre-consented** |

The GTM data layer confirms on load: `OnetrustActiveGroups: ",C0001,C0003,C0004,C0002,C0005,"`. Geolocation during the investigation returned California, meaning the opt-out model applies even for CA residents under CCPA. `ForceConsent` is `false` — users are never required to interact with the banner.

The result is 46 cookies written before any interaction, spanning 17 distinct vendors including FullStory session replay, TikTok Pixel, Snapchat Pixel, Reddit, LinkedIn, The Trade Desk, and Pinterest.

ABTasty reinforces this: all four active experiments carry `runWithoutConsent: true` explicitly, executing regardless of consent state. OneTrust's declared cookie inventory across all groups totals approximately 242 cookies (inferred from OT config panel responses; not independently counted during investigation).

## Tracker & Surveillance Footprint

A homepage load generates 56 network requests — 5 first-party, 51 to 24 third-party domains. A product page load generates 89 requests across 26 third-party domains.

**Identity and session replay:**

- **FullStory** (`rs.fullstory.com`, org `o-1TAHHW-na1`): Active sitewide. Fires `POST /rec/page` and `POST /rec/bundle/v2` on every page including login. Records clicks, scroll, cart interactions, and form inputs. On the login page `FS.shutdown()` is called after load — protecting password fields — but session recording otherwise runs uninterrupted. Cookies: `fs_lua`, `fs_uid` (format `#o-1TAHHW-na1#{session-id}:{visit-id}:{timestamp}::N###/{expiry}`).

- **Attentive SMS** (`patagonia-us.attn.tv`): 9 cookies on first load — the largest single-vendor cookie footprint on the site. The `_attn_` cookie base64-decodes to a JSON object containing user creation timestamp, session creation timestamp, internal Attentive subdomain (`https://hhfer.patagonia.com`), and subscription status (`in: false`). Full set: `__attentive_id`, `__attentive_session_id`, `_attn_`, `__attentive_cco`, `_attn_bopd_`, `__attentive_pv`, `__attentive_ss_referrer`, `__attentive_dv`, `__attn_eat_id`.

- **Klaviyo** (public key `YgU9me`): Email marketing. Cookie `__kla_id` (base64 JSON). Three endpoints: `fast.a.klaviyo.com` (company fonts), `a.klaviyo.com/forms/api/v3/geo-ip`, and `static-forms.klaviyo.com/forms/api/v7/YgU9me/full-forms`.

**Advertising and retargeting:**

- **Google Ads** (conversion ID `965915050`): Conversion tracking plus DoubleClick view-through (`googleads.g.doubleclick.net/pagead/viewthroughconversion/965915050/`) plus remarketing (`www.google.com/rmkt/collect/965915050/`).
- **Google Analytics** (GA4 `G-1SYPSJZYJ5`): Cookies `_ga=GA1.1.549841820.1775521346`, `_ga_1SYPSJZYJ5`, `_gcl_au`.
- **Google Tag Manager** (`GTM-TG49M3T9`): Orchestrates all Google tracking and syndicates product data events to all ad platforms.
- **TikTok Pixel** (`D4JMIIRC77U6TA8BNLKG`): Cookies `_tt_enable_cookie`, `_ttp`, `ttcsid`, `ttcsid_D4JMIIRC77U6TA8BNLKG`.
- **Pinterest Tag**: Cookie `_pin_unauth`. Fires `GET /user/` and `GET /v3/` on every page.
- **Snapchat Pixel** (`73abcb37-73c5-4f09-bf2e-f0c838b0aeb7`): Cookies `_scid`, `_scid_r`, `_sctr`.
- **Reddit Pixel** (`a2_fhnnd0jb2lwb`): Cookie `_rdt_uuid`.
- **LinkedIn Insight Tag**: `POST /wa/` (2×) plus `GET /attribution_trigger`.
- **The Trade Desk** (`insight.adsrvr.org`): `POST /track/realtimeconversion` fires on homepage, product pages, and cart — 3× per page load.
- **Bing/Microsoft UET**: Cookies `_uetsid`, `_uetvid`.
- **Flashtalking** (`d9.flashtalking.com`): Ad serving, `POST /lgc`.
- **Impact Radius** (affiliate program `A5214722`, link ID `5234301`): `patagonia.pxf.io` redirect tracking. Cookies `IR_gbd`, `IR_23649`, `IR_PI`.

**Product data flow through GTM:** The `view_item` GA4 ecommerce event on product pages pushes granular data to all advertising platforms:

```json
{
  "event": "view_item",
  "ecommerce": {
    "currency": "USD",
    "items": [{
      "item_id": "25528",
      "item_name": "M's Better Sweater® Jacket",
      "item_brand": "Patagonia",
      "item_category": "Tops",
      "item_category2": "Midlayer Jackets",
      "item_category3": "M's Sportswear",
      "item_category4": "GRBN",
      "item_variation_id": "198077572183",
      "product_size": "3XL",
      "price": 169
    }]
  }
}
```

`item_category4` carries the internal color code (`GRBN` = green). This payload — including internal variation ID and color code — routes to Google Analytics, Google Ads, TikTok, Pinterest, LinkedIn, Reddit, DoubleClick, and The Trade Desk via GTM.

**Behavioral segmentation:** Salesforce Einstein CQuotient writes five cookies: `cqcid`, `cquid`, `__cq_dnt`, `__cq_uuid`, `__cq_seg`. The `__cq_seg` value encodes a 10-dimension behavioral score vector: `0~0.00!1~0.00!2~0.00!3~0.00!4~0.00!5~0.00!6~0.00!7~0.00!8~0.00!9~0.00`. All dimensions zero for a new visitor — scores accumulate as browsing behavior builds.

**Qualtrics** (`siteintercept.qualtrics.com`) fires a survey intercept targeting request on every page.

**Yotpo** reviews API (`api-cdn.yotpo.com`) makes three requests on product pages despite `yotpo_disable_tracking: "true"` being set in the GTM data layer at load time. The flag suppresses Yotpo's analytics telemetry but does not prevent the storefront API calls for product review content.

## Product Catalog & Transparency APIs

The product sitemap (`/sitemap_2-product.xml`) lists 1,490 SKUs. The content sitemap (`/sitemap_2-content.xml`) lists 2,770 story and editorial pages — activism, sport reports, provisions, culture — distinct from the product catalog.

**Supply chain transparency endpoint (unauthenticated):**

```
GET /on/demandware.store/Sites-patagonia-us-Site/en_US/Loader-GetSERData?pid={pid}
```

Returns per-product sustainability certifications as structured JSON. For the Better Sweater Jacket (pid `25528`), the `SERItems` array lists: 1% for the Planet, Fair Trade (87% of line Fair Trade Certified sewn), Traceable Down (100% certified Global TDS — "No other outdoor clothing company uses only certified Global TDS material for its virgin down"), Organic Cotton (100% virgin cotton), Regenerative Organic (550+ farms working toward certification), Yulex (100% FSC natural rubber wetsuits), Responsible Wool Standard, and Hemp (37 styles this season).

Patagonia explicitly allowlists one SFCC controller in robots.txt: `/on/demandware.store/Sites-patagonia-us-Site/en_US/WhereToGetIt-GetFactories` — a factory finder endpoint. All other `/on/demandware.store/` paths are disallowed. Factory transparency is surfaced as a public, crawlable feature by design.

**Worn Wear / Trove:** `wornwear.patagonia.com` runs on Shopify. The `products.json` endpoint is publicly accessible without authentication:

```
GET https://wornwear.patagonia.com/products.json?limit=250&page=1
```

Live check confirmed: W's Geologers Ahnya Crew Sweatshirt at $29.00. The catalog spans 500+ used product listings across at least two pages. Main-site PDPs embed Trove widgets that call `partner-suite-api.trove.com/product/search` for trade-in availability — returns 200 from patagonia.com origin, 403 from external origins.

## Robots.txt — Crawl Policy and Disclosed Structure

The robots.txt (accessible to browser clients only) includes an ASCII art header spelling "LET OUR ONLY SURFING GO SURF."

**AI crawler blocks:**
```
User-agent: Google-Extended
Disallow: /
User-agent: GoogleOther
Disallow: /
```
Google-Extended is Google's Gemini/Bard training data crawler. GoogleOther is Google's general-purpose non-search crawler. Both fully blocked. AhrefsBot, AhrefsSiteAudit, Baiduspider, SpringBot, and dotbot are also blocked. Standard Googlebot and major search crawlers are permitted.

**Disallowed paths documenting product programs:**

| Path | Program |
|------|---------|
| `/chaseaccountcallback/`, `/chasebillingcallback/` | Chase credit card co-brand |
| `/proaccountcallback/`, `/proreferral/` | PRO discount program (outdoor professionals) |
| `/wallet/` | Wallet feature (redirects to home for guests) |
| `/rma-repair/` | Repair RMA (separate from return RMA) |
| `/giftregistry/`, `/giftregistrysearch/` | Gift registry |
| `/es/`, `/es_US/` | Spanish-language site |
| `/on/demandware.store/Sites-patagonia-jp-Site/ja_JP/` | Japanese site |
| `/blog/wp-admin/` | WordPress blog |
| `/actionworks/wp/wp-admin/` | ActionWorks WordPress |

The PRO program is also exposed through the public `/session/` API, which returns `isPRO: false` and `user-non-pro` in `mainClasses` for unauthenticated visitors — confirming the PRO price tier exists as a session-level feature flag.

## Machine Briefing

**Access:** Direct curl to any patagonia.com URL returns the Akamai bot failover page (HTTP 200, 14,373 bytes). Real content requires browser-grade `User-Agent` headers or an active browser session. `wornwear.patagonia.com` is on Cloudflare — standard curl works without special headers.

**Open endpoints (no auth required, browser headers needed for main domain):**

Session state — feature flags, PRO status, locale:
```
GET https://www.patagonia.com/session/
```
Returns: `action`, `customerAuthenticated`, `productQuantityTotal`, `mainClasses` array (e.g., `["session-enabled","user-unregistered","user-non-pro","bopis-enabled","header-store-enabled"]`), `isPRO`, `sessionID`, `locale`.

Supply chain certifications per product:
```
GET https://www.patagonia.com/on/demandware.store/Sites-patagonia-us-Site/en_US/Loader-GetSERData?pid=25528
```
Replace `25528` with any numeric product ID. Returns JSON with `SERItems` array.

Factory finder (explicitly allowlisted in robots.txt):
```
GET https://www.patagonia.com/on/demandware.store/Sites-patagonia-us-Site/en_US/WhereToGetIt-GetFactories
```

Worn Wear used product catalog (Shopify, no auth, standard curl works):
```
GET https://wornwear.patagonia.com/products.json?limit=250&page=1
GET https://wornwear.patagonia.com/products.json?limit=250&page=2
```
Standard Shopify catalog format. At least 500+ listings confirmed live.

Payment methods declaration (empty cart returns card only):
```
GET https://www.patagonia.com/on/demandware.store/Sites-patagonia-us-Site/en_US/Adyen-GetPaymentMethods
```

OCAPI product API (requires `client_id` — not available without credentials):
```
GET https://www.patagonia.com/s/patagonia-us/dw/shop/v22_6/products/{pid}?expand=availability,variations,prices
```
Returns `{"_v":"22.6","fault":{"type":"MissingClientIdException",...}}` without a client_id header.

ABTasty experiment configs (public CDN, no auth):
```
GET https://try.abtasty.com/814b17ea9b73a9873ef74ca0fda5871a/1102216.1366789.json
GET https://try.abtasty.com/814b17ea9b73a9873ef74ca0fda5871a/1555283.1938081.json
GET https://try.abtasty.com/814b17ea9b73a9873ef74ca0fda5871a/1102215.1366788.json
GET https://try.abtasty.com/814b17ea9b73a9873ef74ca0fda5871a/1535801.1914458.json
```

**Gotchas:**
- SFCC session cookies `dwac_*` and `dwanonymous_*` are required for any write operations. Initialize via a homepage load first.
- `Product-BuyConfig` and `Product-VariationAttributes` return HTML fragments, not JSON — standard SFCC SFRA template rendering, despite being called via fetch.
- The Trove API (`partner-suite-api.trove.com`) returns 403 for requests not originating from the patagonia.com domain.
- The Akamai bot sensor endpoint (`/05nBV2pwZFROUgQ0mmrz/hLwO2hcu/EQJOYExPAQ/QTBxS/1YWRF5t`) is session-specific — do not assume the path persists across browser sessions.
- Klaviyo forms at `static-forms.klaviyo.com/forms/api/v7/YgU9me/full-forms` are publicly readable — returns full form definitions and targeting rules for the `YgU9me` account.
