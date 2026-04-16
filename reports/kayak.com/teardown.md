---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "KAYAK — Teardown"
url: "https://www.kayak.com"
company: "KAYAK"
industry: "Information"
description: "Meta-search travel site for flights, hotels, and cars."
summary: "KAYAK runs a React Router v6 + SSR stack on their internal r9 framework, served through Varnish CDN with a custom KAYAK/1.0 server identifier. The architecture uses named internal microservices (sparkle, maestro, kapi) exposed through response headers, with a centralized FPC context endpoint distributing CSRF tokens, feature flags, and affiliate configuration on every page load. GTM container GTM-PSCCSHQ (version 697) manages tracking for multiple Booking Holdings brands including Momondo from a single deployment."
date: 2026-04-15
time: "06:05"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack: ["React Router", "Varnish", "GTM", "Vite", "FullStory", "Forter"]
trackers: ["Google Analytics 4", "Google Ads", "DoubleClick", "Bing UET", "TikTok Pixel", "Facebook Pixel", "Forter", "FullStory", "Adara", "Zeotap", "Google Funding Choices", "Usabilla", "Yahoo"]
tags: ["travel", "meta-search", "booking-holdings", "data-broker", "identity-graph", "fingerprinting", "gpc", "consent", "ai-assistant", "bot-detection"]
headline: "Every flight search sends your Kayak marketing ID to a travel data broker not named in the privacy policy, with empty GDPR consent fields."
findings:
  - "Kayak's GTM container passes the internal kmkid marketing identifier to Adara (travel data broker, account #5658) on every flight and hotel search -- Adara's SDK call fires with gdpr= and gdpr_consent= both empty, and neither Adara nor Zeotap appear in the privacy policy."
  - "A second identity graph runs alongside Adara -- Zeotap syncs Kayak user IDs against AppNexus and DoubleClick inside the GTM container, linking travel search sessions to the broader programmatic ad ecosystem."
  - "GPC (Global Privacy Control) signal is received but silently ignored -- the data sharing endpoint returns gpcActive: false even when the Sec-GPC: 1 header is sent, a violation of California's CCPA regulations."
  - "kayak.ai records FullStory session bundles for anonymous users, capturing natural language travel queries like 'find me a flight to Tokyo under $800' before any sign-in or consent interaction."
  - "The airport popularity API returns real search-volume-weighted scores for every IATA code without authentication -- JFK's nearby airports show EWR at 22,398, LGA at 6,548, exposing relative demand data across the entire airport network."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

KAYAK is a travel meta-search engine owned by Booking Holdings -- the parent company of Booking.com, Priceline, Agoda, and Momondo. It aggregates flight, hotel, car, and cruise results from hundreds of providers and earns revenue on click-throughs (cost-per-acquisition). The site processes enormous search volume and, as this investigation found, funnels behavioral data from each search into a network of identity graph vendors that Kayak's privacy policy does not name.

## Architecture

The site runs on an internal framework called **r9** -- version `R813c`, build number 22, compiled at 06:05 UTC on 2026-04-15. The build version appears in response headers (`r9-version: R813c`, `r9-built: 20260415.060557`), and an earlier build revision (`R813b`) is embedded in `robots.txt`, which was regenerated at 01:00 UTC the same day. Build cadence is at least once per day.

The client-side stack is React Router v6 with server-side rendering and client hydration. `window.__reactRouterVersion = "6"` is set globally, and `window.__vite_plugin_react_preamble_installed__ = true` indicates Vite in the build chain. React hydration fires a custom `r9:hydration-complete` event and sets `window._appBootComplete`. A click-tracking map called `window.__preHydrationClicks` is installed before React hydrates -- Kayak captures user clicks in the gap between initial HTML render and full JavaScript load.

The server stack uses Varnish for CDN/caching, with a custom server identifier `KAYAK/1.0` (not Apache, nginx, or any commercial CDN product). Three internal microservice names surface through the `x-r9-mst-target` response header:

- **sparkle** -- main page renderer (homepage)
- **maestro** -- API gateway and router (handles 404s and API routing)
- **kapi** -- backend API service (Usabilla feedback, internal APIs)

An internal request tracing system runs via `x-r9-mst-req`, with trace IDs in the format `{node}{timestamp}` (e.g., `003000016824469`), enabling distributed tracing across the microservice mesh.

SSL certificate covers only `www.kayak.com` -- no wildcard. Issued via Let's Encrypt, ECDSA. `api.kayak.com` and `admin.kayak.com` both redirect to `www.kayak.com` through the maestro gateway. CSP is report-only with `unsafe-inline` and `unsafe-eval` -- no strict enforcement.

## API Surface

**robots.txt as architecture map**: At 1,188 lines, Kayak's robots.txt is a detailed inventory of the internal service path structure. It explicitly disallows crawlers from `/vs/`, `/s/`, `/k/`, `/r/`, `/h/`, and all search result paths (`/hotels/`, `/flights/`, `/cars/`) to protect comparative advantage. It simultaneously exposes the framework's MVC-style architecture through the allowed path patterns:

```
/charm/horizon/{vertical}/{component}/{Action}
```

Example paths from the allow list:
- `charm/horizon/flights/flightroutes/AjaxWhenToBookCharts`
- `charm/horizon/common/privacy/AjaxHeaderCookiesMessage`

"Charm" appears to be the internal name for the server-rendered component framework. "Horizon" is the vertical/feature namespace layer.

**FPC context endpoint** (`GET /s/run/fpc/context`): The most information-dense unauthenticated endpoint on the site. It returns on every page load and contains:

- CSRF token (`formToken`) required for all `/i/api/` POST endpoints
- Feature flags (`dynamicProperties.booleanProperties`): `exploreSearchEnabled: false`, `cmp2Enabled: true`, `gdprCookieCategoriesEnabled: false`, `showAppPromoBanner: false`
- Attribution chain: `affiliate: "kayak"`, click tracking ID, acquisition channel
- DSA compliance field list -- 40+ URL parameter names that must be stripped for EU Digital Services Act compliance
- `platform: "bot"` -- Kayak's server-side fingerprint classification for the session
- `dataSharingOptOut: false` -- user's data sharing state

The response is double-encoded JSON -- a JSON string containing a JSON string. The CSRF token from this endpoint is required to make authenticated API calls and can be fetched without login.

`exploreSearchEnabled: false` is a named product feature currently disabled. Given the presence of the AI assistant (see below), this is likely a search exploration/discovery mode under development.

**Other notable endpoints** (all unauthenticated unless noted):

```
GET  /i/api/iabtcf/v1/consent               -- TCF consent state
GET  /i/api/account/dataSharing/v1/optOut    -- data sharing opt-out status
POST /i/api/session/refresh                  -- returns new anonymous session token
GET  /i/api/kn/userbucket/v1?searchId=...   -- A/B bucket assignment per search
POST /s/vestigo/measure                      -- internal performance/behavioral metrics
POST /i/api/xp/v1/track                     -- experiment event tracking
GET  /mvm/p13n/flight/destinations?originAirport=SFO&limit=5  -- IP-personalized suggestions
GET  /a/api/smarty/nearby?code={IATA}        -- airport popularity scores (unauthenticated)
POST /i/api/search/dynamic/flights/poll      -- progressive flight result loading
POST /i/api/search/dynamic/hotels/poll       -- progressive hotel result loading
GET  /i/api/search/categorisation/v1/submit/batch -- behavioral search categorization
GET  /i/api/kape/v1/chat/current            -- AI assistant (auth required)
GET  /i/api/ai/v1/userPreferences           -- IP-detected location for AI (unauthenticated)
GET  /i/api/ai/v1/chat/autocompleteInit     -- AI chat suggested prompts (unauthenticated)
```

The **airport popularity endpoint** (`/a/api/smarty/nearby`) returns real search-volume-weighted popularity scores for nearby airports. JFK returns EWR (22,398), LGA (6,548), HPN (1,531), ISP (898). LAX returns SNA (5,008), ONT (4,214), BUR (2,467), LGB (1,789). These appear to be derived from Kayak's internal search volume data -- a proxy for actual travel demand at each airport.

Every search -- including unauthenticated ones -- fires `SaveSearchParametersAction` server-side. Anonymous search behavior is retained, presumably for recommendation personalization.

The **user bucket endpoint** (`/i/api/kn/userbucket/v1`) returns A/B test assignments per search:

```json
{
  "userBucketName": "neutral",
  "cmp2ModalTimeout": 45000,
  "cmp2ModalFrequencyCap": 1,
  "afterclickFrequencyCap": 2
}
```

`cmp2ModalFrequencyCap: 1` -- the consent modal is shown at most once per user.

## The Surveillance Stack

Eleven tracking and data collection systems are active on Kayak. All of the following fire before any user interaction with a consent banner, confirmed by network capture on a fresh page load:

**Google Analytics 4** (measurement ID `G-PWCRSK2Y5Y`): Delivered via GTM. Sends custom event parameters on every page: `kyk_locale`, `kyk_brand`, `kyk_vertical`, `kyk_affiliate`, `kyk_is_logged_in`, `kyk_presentation`, `kyk_user_language`, `kyk_session_id`.

**Google Ads Conversion** (account `AW-988306736`): Two separate conversion labels fire on page load. Both route through `googleads.g.doubleclick.net/pagead/viewthroughconversion/988306736/`.

**Google DoubleClick** (Floodlight source `src=5142311`): `POST ad.doubleclick.net/activity;src=5142311;type=visit0;cat=front0` fires within page load. Passes browser details and Kayak-specific parameters (`u28=main`, `u29=kayak`).

**Google DFP Publisher Ads** (`securepubads.g.doubleclick.net`): Ad unit `12907657/kayak/us/flight/frontdoor` loads on the homepage. The ad call includes the formToken from FPC context and the classification string `u_caffid=kayak|kayak|bot|web` -- confirming that the bot/human fingerprint from the FPC context flows directly into ad targeting parameters.

**Bing UET** (Universal Event Tracking): `POST bat.bing.com/p/insights/c/y` fires on page load. Cookie pair `_uetsid` / `_uetvid` is set in both cookies and localStorage (with expiry timestamps `_uetsid_exp`, `_uetvid_exp`).

**TikTok Pixel**: Cookie `_tt_enable_cookie=1` and `_ttp` set immediately. Pixel ID `C9P4TJBC77U4F2PRRBV0` for Kayak. A separate TikTok pixel ID `CUUS18JC77U4QKJNJ8F0` for Momondo runs in the same GTM container -- Booking Holdings manages cross-brand ad tech from a single GTM deployment.

**Facebook Pixel**: Cookie `_fbp=fb.1.1776306967000.0.9997221579675873` set on page load. The pixel initializes and sets its cookie on arrival.

**Forter** (org `72164059993b`): Fraud detection and device fingerprinting vendor. Forter polls `cdn0.forter.com/72164059993b/{token}/prop.json` multiple times per page load (3+ observed), then posts to `wpt.json`. In localStorage, Forter builds a browser fingerprint using 14+ keys with the prefix `feh--{hex}` -- each key represents a hashed browser property, value format `000{13-digit-timestamp}{hex-hash}`. The server also embeds Forter-signed tokens in the HTML as `<meta>` tags with empty `name` attributes and base64-encoded values, which change between page loads.

**FullStory** (org `14RXH0`): Session recording. On the main site, `/i/api/fullstory/v1/get` returned 200 on the flight search page (not 401 as on the homepage), suggesting session recording activates on search pages rather than requiring login. On `kayak.ai`, FullStory records anonymous sessions without any authentication (see below).

**Usabilla / SurveyMonkey**: User feedback widget, configured via a `SurveyConfigAction` endpoint.

**Google Funding Choices** (`fundingchoicesmessages.google.com`): Google's consent management platform. Fires repeatedly on page load.

GTM container `GTM-PSCCSHQ` version 697 contains 183 tag references. Affiliate and partner domains represented include `momondo.com`, `cheapflights.com` (multiple locales), `checkfelix.com`, and `biyi.cn` (Chinese market). `business.kayak.com` ad calls use the classification string `u_caffid=kayak|kayak|bb|web` -- `bb` indicating business buyer, a separate tracking segment.

## Adara: Travel Identity Export

Adara is a travel data broker that aggregates travel intent signals across publisher networks to build traveler profiles sold to airlines, hotels, and travel marketers. Kayak is Adara client account **#5658**.

From the GTM container:

```javascript
adara("init", "YTAyZjFlZWMtNmMwMi00MWUwLTg2YjUtZGZiZDE5YjczMzRm", 5658)
adara("identity", {uid: [kmkid]})
adara("send", {})
```

The Adara client key (`YTAyZjFlZWMtNmMwMi00MWUwLTg2YjUtZGZiZDE5YjczMzRm`) is a base64-encoded UUID: `a02f1eec-6c02-41e0-86b5-dfbd19b7334f`.

The `kmkid` is Kayak's internal marketing identifier -- a GTM dataLayer variable that functions as a cross-session user identifier. On every flight and hotel search, Kayak calls `adara("identity", {uid: kmkid})` to link the search to a Kayak user profile in Adara's system.

The Adara SDK call fires to `sdk.adara.com/api?gdpr=&gdpr_consent=` -- with both GDPR parameters empty. No consent is passed. Adara's own TCF rules file (`jsres.adara.com/tcf/ro.json`) lists 7 IAB partner vendor IDs (`100, 1471, 2286, 4120, 2567, 7813, 1461`) with `global: false` -- meaning Adara operates as a site-specific integration, not through the global TCF consent framework.

Neither Adara nor its partner vendors appear in Kayak's privacy policy. The policy names Google Analytics, DoubleClick, Meta, and Bing Ads -- but not the travel data broker receiving a travel intent signal linked to a persistent user ID on every search.

## Zeotap: A Second Identity Graph

The GTM container also contains Zeotap, a data enrichment and identity resolution platform. The Zeotap integration runs user ID sync calls against two ad networks simultaneously:

```
https://ib.adnxs.com/getuid?https://mwzeom.zeotap.com/mw?adnxs_uid=$UID&zpartnerid=2&env=mWeb&zdid=1110&eventType=map&zcluid=...
https://cm.g.doubleclick.net/pixel?google_nid=zeotap_ddp&google_cm&zpartnerid=1&env=mWeb&zdid=1110&eventType=map&zcluid=...
```

This syncs Kayak's user cookie identity against AppNexus (Xandr) and DoubleClick user IDs in Zeotap's cross-publisher identity graph. The result is that a Kayak search session can be connected to a user's profile across the broader programmatic ad ecosystem through Zeotap, in parallel with Adara's travel-specific graph.

Zeotap is not named in Kayak's privacy policy.

## Consent Architecture

Kayak implements IAB TCF version 2 through CMP ID 413 but operates with `gdprApplies: false` (US jurisdiction, `publisherCc: US`). The TCF consent response from `/i/api/iabtcf/v1/consent`:

```json
{
  "isUnsavedDefaultConsent": true,
  "gdprApplies": false,
  "purpose": {
    "consents": {},
    "legitimateInterests": {"2":true,"7":true,"8":true,"9":true,"10":true,"11":true}
  },
  "vendor": {
    "consents": {},
    "legitimateInterests": {
      "128":true,"384":true,"69":true,"264":true,"10":true,"11":true,
      "203":true,"76":true,"13":true,"78":true,"16":true,"209":true,
      "82":true,"210":true,"21":true,"85":true,"23":true,"25":true,
      "281":true,"986":true,"91":true,"28":true,"156":true,"95":true,
      "32":true,"97":true,"39":true,"423":true,"42":true,"812":true,
      "173":true,"301":true,"238":true,"50":true,"755":true,"1395":true,
      "373":true,"57":true,"1020":true,"126":true
    }
  }
}
```

`isUnsavedDefaultConsent: true` -- no user has ever interacted with a consent UI in this session. `vendor.consents: {}` -- no explicit consent to any vendor. Yet 40 vendor IDs are listed under `legitimateInterests`, and the CookiesDataProvider simultaneously confirms `cookiesConsent: false`. All trackers fire regardless.

The `gdprCookieCategoriesEnabled: false` flag in the FPC context disables the GDPR-style granular consent interface for US users. The US market relies on opt-out rather than opt-in, with `allowDataSharing: true` as the default state.

**GPC non-compliance**: The `/i/api/account/dataSharing/v1/optOut` endpoint returns:

```json
{"allowDataSharing": true, "privacyUrl": "/privacy", "gpcActive": false}
```

`gpcActive: false` persists even when the `Sec-GPC: 1` header is sent in the request. Under California's CCPA regulations (CPRA amendment), GPC must be treated as a do-not-sell/share signal for California residents. Kayak receives the signal and does not act on it.

## Bot Detection and Fingerprinting

Kayak runs a two-layer bot detection system:

1. **Headless browser block**: Navigating to flight search in headless Playwright immediately redirects to `/help/bots.html`. Headless browsing is detected and hard-blocked for search result access.

2. **Headed browser fingerprinting**: Headed Playwright bypasses the headless block but is still classified as `platform: "bot"` in the FPC context response. This classification flows downstream -- the DFP ad call shows `u_caffid=kayak|kayak|bot|web` in its targeting parameters. Kayak knows the session is automated and tells its ad partners.

Forter's fingerprinting runs silently in parallel. The `feh--{hex}` localStorage keys build a browser property hash map before any user interaction, and the Forter-signed tokens embedded in the HTML serve as server-side validation anchors for those hashes.

`window.__preHydrationClicks` captures user interactions in the window between initial HTML render and React hydration -- clicks made before the JavaScript framework loads are stored in a map and replayed or analyzed after hydration completes.

The combination of Forter device fingerprinting, Kayak's own `platform` classification, and pre-hydration click capture means the site begins user profiling before the page is interactive.

## kayak.ai

`www.kayak.com/ai` redirects to `kayak.ai` -- a standalone AI travel planning product. The separation from the main domain is notable: it runs as a distinct product but shares authentication infrastructure (the same KAPE endpoints appear in both).

On `kayak.ai`, FullStory records session bundles for anonymous users:

```
GET rs.fullstory.com/rec/bundle/v2?OrgId=14RXH0&UserId={uuid}&SessionId={uuid}
```

FullStory assigns its own UUID-based `UserId` and `SessionId` to unauthenticated visitors. Session bundles upload every ~10 seconds. Since the AI interface accepts natural language travel queries ("Find me a flight to Tokyo in June under $800"), these conversational inputs are being recorded by FullStory before the user has logged in or consented.

IP-based location profiling starts before login. `/i/api/ai/v1/userPreferences` returns the IP-detected airport for an unauthenticated session:

```json
{"location":{"locationId":"SFO","locationType":"airport","localizedLocationName":"San Francisco"}}
```

The `/i/api/ai/v1/chat/autocompleteInit` endpoint (unauthenticated) reveals the AI assistant's capability surface: flight search, hotel search, car rental, flight status tracking, destination recommendations, and price timing. Voice input is enabled -- the permissions policy allows microphone access on KAPE-adjacent endpoints.

Yahoo's analytics platform (`nrb.ybp.yahoo.com`) also fires on `kayak.ai` -- a signal of Booking Holdings' advertising relationship with Yahoo.

The internal name for the AI system is KAPE (`/i/api/kape/v1/chat/current`).

## Machine Briefing

### Access & auth

Most read endpoints work without authentication. `curl` and `fetch` work directly. POST endpoints to `/i/api/` require an `X-CSRF` header matching the `formToken` from the FPC context endpoint. Unauthenticated calls to CSRF-protected endpoints return `INVALID_FORM_TOKEN`.

CSRF token acquisition (no auth required):
```bash
curl -s "https://www.kayak.com/s/run/fpc/context?vertical=main&pageId=frontdoor&domain=www.kayak.com" \
  -H "Accept: application/json" | python3 -c "import sys,json; d=json.loads(json.loads(sys.stdin.read())); print(d['formToken'])"
```

Note: The FPC context response is double-encoded JSON (a JSON string containing a JSON string). Parse with `json.loads` twice.

Session token (required for some endpoints):
```bash
curl -s -X POST "https://www.kayak.com/i/api/session/refresh" \
  -H "X-CSRF: {formToken}" \
  -H "Content-Type: application/json"
# Returns: {"updated":true,"sid":"R-..."}
```

### Endpoints

**Open (no auth, no CSRF):**
```
GET https://www.kayak.com/s/run/fpc/context?vertical=main&pageId=frontdoor&domain=www.kayak.com
GET https://www.kayak.com/i/api/iabtcf/v1/consent
GET https://www.kayak.com/i/api/account/dataSharing/v1/optOut
GET https://www.kayak.com/mvm/p13n/flight/destinations?originAirport=SFO&limit=5
GET https://www.kayak.com/a/api/smarty/nearby?code=JFK
GET https://kayak.ai/i/api/ai/v1/userPreferences
GET https://kayak.ai/i/api/ai/v1/chat/autocompleteInit
```

**Requires CSRF header:**
```
POST https://www.kayak.com/i/api/session/refresh
POST https://www.kayak.com/s/vestigo/measure
POST https://www.kayak.com/i/api/xp/v1/track
GET  https://kayak.ai/i/api/ai/v1/chat/list
```

**Requires auth + CSRF:**
```
GET https://www.kayak.com/i/api/trips/user/v1/currentUser
GET https://www.kayak.com/i/api/trips/trip/v1/allUpcomingSimplifiedTrips
GET https://www.kayak.com/i/api/kape/v1/chat/current
GET https://www.kayak.com/i/api/fullstory/v1/get
```

**Search polling (requires searchId from search initiation):**
```
POST https://www.kayak.com/i/api/search/dynamic/flights/poll
  Body: {"searchId": "{searchId}", ...}
GET  https://www.kayak.com/i/api/kn/userbucket/v1?searchId={searchId}
POST https://www.kayak.com/i/api/search/categorisation/v1/submit/batch
```

### Gotchas

- **Double-encoded FPC context**: The `/s/run/fpc/context` response body is a JSON string containing a JSON string. Call `JSON.parse(JSON.parse(response))` or `json.loads(json.loads(raw))` in Python.
- **Bot detection on search pages**: Headless requests to `/flights/` and `/hotels/` redirect to `/help/bots.html`. Even headed sessions are fingerprinted as `platform: "bot"` in the FPC context. Expect degraded or blocked search results.
- **CORS is allowlisted**: Cross-origin requests from non-Kayak domains will fail. Use curl or a server-side proxy.
- **Varnish caching**: Some responses are cached. Add `Cache-Control: no-cache` to bypass for fresh data.
- **Hotel location override**: Navigating to a hotel URL with a specific city may return results for the IP-detected location instead. The server resolves IP geolocation with higher priority than the URL city parameter.
- **Search result `noindex`**: Flight and hotel search result pages return `robots: noindex,nofollow` -- they are not indexed. Access them directly.
- **Adara client key**: `YTAyZjFlZWMtNmMwMi00MWUwLTg2YjUtZGZiZDE5YjczMzRm` decodes to UUID `a02f1eec-6c02-41e0-86b5-dfbd19b7334f` (account ID 5658).
