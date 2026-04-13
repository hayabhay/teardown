---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Spokeo — Teardown"
url: "https://spokeo.com"
company: "Spokeo"
industry: "Information"
description: "People search engine aggregating public records and contact data."
summary: "Spokeo runs a Ruby on Rails backend with Phusion Passenger 6.1.0 behind Apache on AWS, serving a Next.js App Router frontend with SSR and streaming React Server Components. Every response embeds a base64-encoded analytics blob before JavaScript runs. Two WordPress installs (/compass/, /pathfinder/) share the domain. Consumer and business pages carry entirely separate tracking stacks — consumer uses Facebook/LiveRamp/FullContact; business adds 6sense for IP-to-company identification and AppNexus for ad targeting."
date: "2026-04-13"
time: "01:50"
contributor: "hayabhay"
model: "sonnet"
effort: "high"
stack: [Ruby on Rails, Next.js, Phusion Passenger, AWS, Apache]
trackers: [GA4, Google Ads, Facebook Pixel, LinkedIn Ads, Pinterest, Snowplow, LiveRamp, FullContact, Osano, 6sense, AppNexus]
tags: [people-search, data-broker, identity-resolution, pre-consent, analytics-instrumentation, seo, ai-block, ccpa, pii-exposure, satellite-domains]
headline: "Spokeo's unauthenticated analytics endpoint returns your IP to any origin — a data broker's server as a free IP lookup."
findings:
  - "An unauthenticated endpoint hidden in robots.txt returns the caller's real IP address and full user agent to any origin with no CORS restriction — any third-party script on any site can use Spokeo's servers as an IP lookup service."
  - "The client-side InsightsConstants global maps 30+ internal GA dimensions by name, including ga_hidden_profile and ga_blacklist_payment — revealing how Spokeo tracks views of privacy-opted-out profiles and flags payment anomalies in Google Analytics."
  - "Profile pages ship schema.org Person JSON-LD to all crawlers with names, aliases, gender, street names, and zip codes — street plus zip narrows a residence to a handful of properties, and a browsable /people/ directory enables systematic enumeration."
  - "Consumer and business visitors get siloed surveillance stacks: consumer pages fire Facebook, LiveRamp, and FullContact for identity resolution, while the business page adds 6sense to identify visiting companies by IP address."
  - "Sourcepoint tracking cookies including a 2-year persistent UUID are set server-side in the initial HTTP response headers — before the page renders, before the Osano consent banner loads, before any JavaScript executes."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Spokeo is a people search engine and data broker — it aggregates public records, social profiles, contact information, and location history into searchable profiles on roughly 300 million individuals. The infrastructure reflects a site that has been accumulating surveillance instrumentation alongside its core product for years. The result is a layered analytics system that tracks visitors before they interact with anything, routes that data through multiple identity resolution networks, and exposes some of that infrastructure in ways the robots.txt suggests were not intentional.

---

## Architecture

The main site is a hybrid: a Ruby on Rails backend running Phusion Passenger 6.1.0 on Apache, serving a Next.js App Router frontend with SSR and streaming React Server Components. This version string appears verbatim in every HTTP response header (`x-powered-by: Phusion Passenger(R) 6.1.0`) and in the internal codename string carried through both frontend and backend: `release_version_spokeo: 10.196_charlie_catch_up`. The deployment identifier "charlie_catch_up" is a codename visible in production headers, the HTML, and the server-side analytics blob.

Static assets are served from `assets.production.spokeo.com` — a separate CDN domain off the main apex. Two WordPress installs are embedded under the same domain: `/compass/` and `/pathfinder/`, both using NitroPack for CDN caching.

The infrastructure sits on AWS. The apex DNS resolves to multiple AWS ALB addresses. `api.spokeo.com` resolves to AWS API Gateway and returns HTTP 403 (`{"message":"Missing Authentication Token"}`) without credentials. The Snowplow event collector at `tp2.spokeo.com` is also an API Gateway endpoint with the same authentication requirement. No staging or admin subdomains resolve publicly.

Error monitoring: Airbrake (project ID `107495`) and New Relic (App ID `142177200`), both initialized at page load.

The SSL certificate is a `*.spokeo.com` Amazon RSA 2048 M02 wildcard, but its Subject Alternative Names include a network of satellite domains: `bizshark.com` / `bizshark.org` (B2B company search), `easyphonelookup.com`, `quickphonelookup.com`, `callseeker.com` (phone lookup portals), and `spokeoreview.com`, `spokeoreviews.com`, `spokeoangel.com`, `spokeoangels.com` (brand/trust marketing sites). All satellite domains redirect to spokeo.com endpoints, and all share the same server-side Sourcepoint tracking infrastructure from the moment of first contact.

---

## The Server-Side Analytics Blob

Every HTTP response from spokeo.com includes a base64-encoded JSON object assigned to `window.Spokeo.contextTemp` inside a `<script>` tag in the raw HTML — present before any JavaScript executes, visible to curl, wget, or any scraper. Decoding the blob reveals an extensive server-side analytics snapshot compiled at request time:

**IP geolocation:** `ip_country_code`, `ip_subdivision_code` (state), `ip_location_code` — the server's geolocation of the requesting IP, resolved before the page renders.

**Browser/OS fingerprint:** `agent_platform`, `agent_browser_family`, `agent_browser_version`, `agent_os`, `agent_os_version` — the server's parsed user agent, mirrored into the page.

**Session identity:** `session_id` and `session_id_temp` (UUID pair), `client_id` and `client_id_temp` (visitor UUID pair) — all server-generated, embedded in HTML.

**A/B state:** `experiment_id`, `experience_id`, `segment_id` — the visitor's current experiment assignment. Confirmed live: `experiment_id: "sem_branddirect"`, `experience_id: "sem_H5916S5067P5064"`.

**Version strings:** `release_version_spokeo: "10.196_charlie_catch_up"` in every response. The `release_version_dss` field (Data Search Service — an internal microservice) also appears in the blob.

**`redaction_enabled: "false"`** — a boolean toggle that controls whether the server redacts PII from page responses. The field is present in every response with the value `"false"`. This implies a code path exists to suppress PII display at the server layer, currently inactive. Whether "PII" here refers to the profile data in search results or the analytics context itself is not determinable from the field name alone — but the toggle's presence in the analytics blob suggests it governs what flows into the client-side instrumentation.

The blob's presence in raw HTML means this data is accessible to any automated caller, not just a browser running JavaScript. A scraper or LLM crawler (if not blocked) would receive the server's IP geolocation and A/B assignment for their IP on every page fetch.

The `window.Spokeo.context` object, also base64-encoded in the same `<script>` block, carries the GTM container ID (`GTM-5MHFDP`), New Relic App ID (`142177200`), and the page category/type/subtype used for analytics routing.

---

## The GTM Datalayer Endpoint

`GET https://www.spokeo.com/get_gtm_data_layer_values`

This endpoint is listed in robots.txt under `Disallow: /get_gtm_data_layer_values` for all user-agents — a signal that it was not intended for external consumption. It is nonetheless fully public: no authentication required, no CORS restriction (`Access-Control-Allow-Origin` header absent), no rate limiting observed.

The response is a JSON object containing internal Google Analytics custom dimension values computed server-side for the requesting visitor:

```json
{
  "dimension1": "Free",
  "dimension4": "other_direct",
  "dimension7": "H1000S1000P5114",
  "dimension8": "Desktop",
  "dimension21": "Free",
  "dimension29": "false",
  "dimension40": "https://",
  "dimension41": "<caller IP address>",
  "dimension44": "<caller user agent>",
  "dimension45": "unknown",
  "dimension46": "on",
  "dimension50": "<32-char hex fingerprint>",
  "campaign": "other_direct",
  "subid": null
}
```

`dimension41` is the caller's real IP address as seen by Spokeo's servers. `dimension44` is the full user agent string. These are not session-specific lookups — they reflect the live request. `dimension50` is a 32-character lowercase hex string (MD5-length); its composition is inferred as a fingerprint of request properties, but not confirmed.

Cross-referencing the `InsightsConstants` dimension map (see next section): `dimension41` maps to `ip_address` and `dimension44` maps to `user_agent` in the internal naming convention. These fields are sent to Google Analytics as custom dimensions on every pageview. The GTM endpoint is how the site populates those dimensions for the tag manager layer.

The missing CORS header means any JavaScript running in a browser can fetch this endpoint from any domain and read the visitor's IP address as seen by Spokeo's servers. Since browsers send credentials (cookies) with same-site requests but not cross-origin, the cross-origin case returns the IP of a fresh unauthenticated request — still the real visitor IP. With session cookies attached (same-origin context), the response would also include any session-specific dimensions populated for that visitor.

---

## InsightsConstants — The Internal Analytics Taxonomy

`window.InsightsConstants` is embedded in every page as a JavaScript object mapping 30+ internal dimension names to their Google Analytics custom dimension numbers. This is the complete internal taxonomy:

| Dimension | Internal Name | Scope |
|-----------|--------------|-------|
| dimension2 | ga_userid | Session |
| dimension4 | ga_campaign_session_attr | Session |
| dimension5 | ga_campaign_data | Hit |
| dimension7 | ga_sem_flow_visit | Session |
| dimension11 | ga_domain_user | Session |
| dimension14 | ga_campaign_conv | Session |
| dimension17 | ga_sem_flow_conv | Session |
| dimension19 | ga_userid_conv | Session |
| dimension20 | ga_blacklist_payment | Session |
| dimension21 | ga_usertype_page | Hit |
| dimension29 | internal_traffic | Session |
| dimension31 | ga_domain_session | Hit |
| dimension41 | ip_address | Hit |
| dimension44 | user_agent | Hit |
| dimension46 | ga_cookie_browser | Hit |
| dimension47 | ga_simple_test_group | Session |
| dimension51 | ga_virtual_page | Hit |
| dimension52 | ga_hidden_profile | Hit |
| dimension53 | ga_campaign_visit_list | Session |
| dimension54 | ga_campaign_visit | Session |
| dimension62 | ga_gem_version | Hit |
| dimension74 | http_status_code | Hit |
| dimension75 | page_category | Hit |
| dimension76 | page_type | Hit |
| dimension77 | page_subtype | Hit |
| dimension78 | page_variant | Hit |
| dimension79 | searched_product | Hit |
| dimension80 | ga_clientid | Session |
| dimension81 | ga_clid | Session |
| dimension98 | result_count | Hit |
| dimension99 | name_popularity | Hit |

Two dimensions warrant attention:

**`ga_hidden_profile` (dimension52, Hit-scope):** This dimension is sent to GA on individual hit events — meaning it's attached to specific pageviews, not just session-level attributes. Its presence as a Hit-scoped dimension implies it's populated when a visitor loads a profile page that has been flagged as hidden — likely profiles belonging to individuals who have submitted opt-out or privacy removal requests. The fact that viewing a hidden profile generates a GA hit with this dimension set means the viewing event is tracked even for profiles that have been suppressed from display.

**`ga_blacklist_payment` (dimension20, Session-scope):** Applied at the session level. The name implies a payment anomaly or fraud flag — sessions where the visitor has been blacklisted from completing a purchase. Tracked in GA across the full session.

**`name_popularity` (dimension99, Hit-scope):** A 1-5 score for how common the searched name is. This feeds into search result presentation and is logged per search hit.

**`ga_sem_flow_visit` (dimension7):** Encodes the SEM funnel path as a hierarchical string — observed values: `H1000S5067P5064`, `H5916S5067P5064`. The H/S/P segments likely encode funnel hierarchy (Head/Sub/Page or similar).

The custom Snowplow analytics stack runs in parallel: `window._snaq` / `window.Snowplow` post events to `https://tp2.spokeo.com` (AWS API Gateway, authenticated endpoint), with `InsightsWorker`, `InsightsHelper`, `InsightsAjaxTracker`, `InsightsPageTracker`, `InsightsClickTracker`, and `InsightsPageScrollTracker` as separate tracking classes for each interaction type.

---

## Tracking Infrastructure — Per Page Type

The tracking stack is not uniform. Three distinct configurations were observed across page types:

**Homepage:**
- POST `/t` — first-party Snowplow event collector
- `api.fullcontact.com /v3/webtag.domain` (2x per load) — FullContact identity graph
- `idx.liadm.com /idex/did-004q/any` — LiveRamp IDEX (Identity Exchange) sync
- `rp.liadm.com /j`, `rp4.liadm.com /j` — LiveRamp redirect sync
- `i.liadm.com sync-container` iframe — LiveRamp device sync frame, carries `us_privacy=1-N-` (CCPA: not opted out, no explicit consent signal)
- GA4 (`analytics.google.com /g/collect`), Google ccm (`www.google.com /ccm/collect`)
- Osano CMP config fetch + consent record POST
- Facebook Pixel (`connect.facebook.net /signals/config/650848495043258`)
- Google Ads conversion tag (conversion ID `989078692`)

**Profile pages (additional):**
- `px.ads.linkedin.com` — LinkedIn Ads pixel
- `ct.pinterest.com` — Pinterest conversion tag

LinkedIn and Pinterest tracking does not appear on the homepage. It fires specifically when a visitor loads a person's profile page. The visitor searching for someone becomes a retargeting target for Spokeo ads on LinkedIn and Pinterest tied to that search event.

**Business page (additional):**
- `c.6sc.co`, `ipv6.6sc.co`, `epsilon.6sense.com /v3/company/details` — 6sense company intelligence (IP-to-company identification; endpoint returns 401 without auth key)
- `secure.adnxs.com /getuidj` — AppNexus UID cookie (Xandr/Microsoft ad network)
- `spokeo.zendesk.com` — Zendesk Sunshine Conversations (live chat)
- Airbrake (`notifier-configs.airbrake.io`) — error monitoring config fetch

The business page identifies visiting companies by IP via 6sense, a B2B intelligence platform that maps IP ranges to company accounts. Facebook Pixel, LiveRamp, and FullContact do not appear on the business page — the consumer and B2B surveillance stacks are siloed.

**Pre-consent state:**

Sourcepoint cookies are set in the initial HTTP response headers — server-side, before the browser renders a single byte of HTML:

```
Set-Cookie: _sp_ses.6a20=*; expires=Mon, 13 Apr 2026 01:58:09 GMT; SameSite=Lax
Set-Cookie: _sp_id.6a20=<uuid>.<ts>.1.<ts>.<ts>.<uuid>; expires=Thu, 13 Apr 2028 01:28:09 GMT; SameSite=Lax
Set-Cookie: _sp_id_temp=<uuid>; expires=Thu, 13 Apr 2028 01:28:09 GMT; SameSite=Lax
Set-Cookie: _sp_ses_temp=<uuid>; expires=Mon, 13 Apr 2026 01:58:09 GMT; SameSite=Lax
```

`_sp_id.6a20` is a 2-year persistent Sourcepoint tracking UUID assigned at first server contact. These cookies arrive alongside the session cookies (`uec-session`, `uec-experience`), the 10-year visitor fingerprint cookie (`a=^^^^{timestamp}^^`), and several JWT cookies (`insights`, `sem`, `campaigns_list`) — all in the same HTTP response, before the Osano consent banner initializes client-side.

The Osano CMP (`cmp.osano.com/P5EJ0Y2Taa`) manages MARKETING, PERSONALIZATION, ANALYTICS, STORAGE, and OPT_OUT categories including a "Do Not Sell or Share My Personal Information" toggle per CCPA. The CMP loads and records a consent impression (`consent.api.osano.com/record`) after the page renders — but the Sourcepoint cookies, visitor fingerprint, and campaign attribution JWTs have already been set.

Additional server-side cookies set in the initial response: `full_story_gtm=false` (FullStory disabled), `page_view_id_refresh=false`, `campaign_regex=.*brand_direct.*`, `first_visit_date`, `last_campaign_tstamp` (base64+HMAC timestamp), and `spokeo_sessions_rails4=bypass_session` (HttpOnly, Secure — Rails session management bypass).

---

## Profile Pages — Public PII Architecture

Person profile pages are structured for maximum search engine discoverability. Each page includes a `<script type="application/ld+json">` block with schema.org `Person` markup visible in raw HTML to all crawlers:

- Full legal name + aliases
- Gender
- Multiple historical locations: street names (without house number) + postal codes
- Phone numbers with last 4 digits masked: `(661) 945-****`
- Email address with prefix masked: `v****@gmail.com`
- Related persons: names + profile URLs

The masking is partial. Street name + zip code is sufficient to narrow a residence to a handful of properties on a single block — effectively a precise location signal without a full address. The schema.org markup is not for user display; it's structured data for Google to index and surface in knowledge panels and search results.

Profile listing pages (e.g., `/John-Smith`) show court records without authentication: record date, case type (e.g., "Drugs"), and offense date. Records carry an FCRA disclaimer noting they cannot be used for employment or credit screening. Because listing pages aggregate records by name-matching across all jurisdictions, a common name page will mix records from multiple unrelated individuals.

Search architecture is SEO-optimized by design: `/search?q=John+Smith` redirects 301 to `/John-Smith` — search queries become canonical indexed URLs immediately. The browsable directory at `/people/{letter}` exposes thousands of name combinations per letter (1966+ links per directory page), enabling systematic enumeration of the entire name corpus without authentication.

---

## The AI Crawler Block

robots.txt blocks 24 named crawlers from the root (`/`) with a single `Disallow: /` directive:

```
User-agent: Amazonbot
User-agent: anthropic-ai
User-agent: Applebot
User-agent: Applebot-Extended
User-agent: Bytespider
User-agent: CCBot
User-agent: ChatGPT-User
User-agent: ClaudeBot
User-agent: Claude-Web
User-agent: cohere-ai
User-agent: CommonCrawl
User-agent: Diffbot
User-agent: DuckAssistBot
User-agent: FacebookBot
User-agent: Google-Extended
User-agent: GoogleOther
User-agent: GPTBot
User-agent: Meta-ExternalAgent
User-agent: MistralAI-User
User-agent: OAI-SearchBot
User-agent: Omgili
User-agent: Omgilibot
User-agent: PerplexityBot
User-agent: YouBot
Disallow: /
```

The block is followed by explicit allows for a curated set of paths: `/`, `/reverse-phone-lookup`, `/reverse-address-search`, `/people-search`, `/email-search`, `/username-search`, `/compass`, `/pathfinder`, `/about`, `/product`, `/contact`, `/careers`, `/business`, `/scholarship`. These are marketing and category landing pages — the content that drives SEO conversion without exposing the individual profile corpus.

`AdsBot-Google` is explicitly allowed (its separate stanza has no `Disallow`). Google's ad relevance bot can crawl; Google's AI training crawlers cannot. Google Googlebot (the main indexer) is also not blocked, preserving organic search ranking. The strategy is: index people profiles for SEO revenue, block AI training on those same profiles to prevent competitors from building equivalent data assets for free.

The universal `Disallow: /search` for all user-agents prevents search queries from being indexed as URLs, while the name landing pages (`/John-Smith`) remain fully indexable — ensuring the canonical profile URLs get SEO value without exposing the search interface.

---

## Satellite Domain Network

The `*.spokeo.com` SSL certificate's Subject Alternative Names reveal a network of satellite properties, all sharing the same tracking infrastructure:

**B2B portal:** `bizshark.com` / `bizshark.org` — redirects to `spokeo.com/?bz=true`. The `?bz=true` parameter signals a B2B visitor origin. On redirect arrival at spokeo.com, the same server-side Sourcepoint and session cookies are set.

**Phone lookup portals:** `easyphonelookup.com`, `quickphonelookup.com`, `callseeker.com` — all redirect to `spokeo.com/reverse-phone-lookup`.

**Brand/trust marketing:** `spokeoreview.com`, `spokeoreviews.com`, `spokeoangel.com`, `spokeoangels.com` — brand reputation sites.

The satellite domains function as acquisition funnels — different entry points for different search intents, all routing to the same platform with visitor tracking initialized on first contact via redirect.

---

## Machine Briefing

### Access & Auth

The main site is fully accessible without authentication for browsing and most content. Profile pages, directory pages, and the GTM endpoint are open. Search, checkout, purchase, and `/people/profile` paths are disallowed in robots.txt but not technically gated (disallow is advisory). The API subdomain (`api.spokeo.com`) requires authentication — returns AWS API Gateway 403.

Curl fetches the full SSR HTML including the `contextTemp` blob, cookies, and JSON-LD structured data. No browser required for static content.

Session cookies are set on first HTTP request — no interaction needed to acquire them. The 10-year `a` cookie and `_sp_id.6a20` are the persistent visitor identifiers.

### Endpoints

**Open — no auth required:**

```bash
# GTM datalayer values — returns caller IP, UA, analytics dimensions
curl -s "https://www.spokeo.com/get_gtm_data_layer_values"

# Homepage — includes contextTemp blob in raw HTML
curl -s "https://www.spokeo.com/" | grep -o 'contextTemp[^<]*'

# Profile listing page — JSON-LD Person markup in source
curl -s "https://www.spokeo.com/John-Smith"

# Browsable name directory — 1966+ profile links per letter
curl -s "https://www.spokeo.com/people/a0001"

# Search redirects to canonical name URL (301)
curl -sv "https://www.spokeo.com/search?q=John+Smith"

# robots.txt
curl -s "https://www.spokeo.com/robots.txt"

# Snowplow event collector — requires auth (returns 403)
curl -s "https://tp2.spokeo.com/"

# API gateway — requires auth (returns 403)
curl -s "https://api.spokeo.com/"
```

**contextTemp decoding:**

```bash
# Extract and decode the contextTemp blob from homepage
curl -s "https://www.spokeo.com/" \
  | grep -o "contextTemp = window\.Spokeo\.contextTemp || '[^']*'" \
  | grep -o "'[^']*'" \
  | tr -d "'" \
  | base64 -d \
  | python3 -m json.tool
```

**GTM endpoint fields (from InsightsConstants mapping):**
- `dimension41` -> `ip_address` (caller's real IP)
- `dimension44` -> `user_agent` (full UA string)
- `dimension50` -> session fingerprint (32-char hex)
- `dimension4` -> `ga_campaign_session_attr`
- `dimension7` -> `ga_sem_flow_visit` (SEM funnel path)
- `dimension21` -> `ga_usertype_page` (Free / Paid)
- `dimension29` -> `internal_traffic` flag

### Gotchas

- The contextTemp blob is assigned as a fallback: `window.Spokeo.contextTemp = window.Spokeo.contextTemp || '<base64>'` — so if the JS has already populated the var, the inline value won't overwrite it. The raw HTML always contains the server-generated value.
- GTM endpoint returns the same IP/UA regardless of cookies — it's a live server-side computation, not a session lookup.
- `/search` is disallowed in robots.txt for all UAs and 301-redirects to name pages; use direct name URL format `/{FirstName}-{LastName}` or `/{FirstName}-{LastName}/{State}`.
- The `a` cookie format is `^^^^{unix_timestamp}^^` URL-encoded — this is the 10-year visitor fingerprint.
- Profile pages require the Spokeo URL slug format: `/First-Last` or `/First-Last/State` — not a query parameter.
- Business page (`/business`) loads 6sense which requires a corporate IP range to return company data — generic residential/datacenter IPs return minimal response.
- Airbrake project ID `107495` and New Relic App ID `142177200` are client-side instrumentation references — not actionable endpoints.
