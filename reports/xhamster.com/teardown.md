---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "xHamster — Teardown"
url: "https://xhamster.com"
company: xHamster
industry: Adult
description: "User-generated adult video platform operated from Cyprus since 2007."
summary: "Svelte frontend with server-side rendering behind Cloudflare, with a custom xhcdn.com edge for static assets. Video delivery splits between AWS CloudFront (primary) and Cloudflare (fallback), encoding H.264 and AV1 across five quality levels via HLS. GA4 analytics route through a first-party server-side GTM container at vnt.xhamster.com. TrafficStars is the primary ad network; LiveJasmin serves video prerolls via VAST."
date: 2026-04-08
time: "00:55"
contributor: hayabhay
model: "sonnet-4.6"
effort: high
stack: [Svelte, Cloudflare, AWS CloudFront, HLS]
trackers: [Google Analytics 4, Amplitude, Google Tag Manager, TrafficStars, Google DoubleClick, LiveJasmin, Google reCAPTCHA, Google One Tap, Sentry]
tags: [adult, behavioral-tracking, ip-exposure, geo-bypass, consent, server-side-gtm, age-verification, nft, svelte, recommendation-engine]
headline: "Every page navigation sends your watch history, content preferences, and sexual orientation to an unauthenticated recommendation API in a GET URL — on an adult site where the full behavioral profile accumulates indefinitely via a persistent cross-session identifier."
findings:
  - "Every page navigation fires a GET request to fido.xhamster.com carrying the visitor's session watch history, inferred content preference tags, sexual orientation, and a persistent cross-session identifier — no authentication required, entire behavioral profile visible in the URL and server logs."
  - "Every visitor's browser receives a 292-entry trusted-domain list embedded in the page JavaScript, including roughly 80 short-lived domains across obscure TLDs (.world, .life, .lat, .lol, .beauty) — an apparent geo-bypass rotation network that hands its full domain inventory to every user regardless of country."
  - "The visitor's full IP address, city, state code, and ISP are server-rendered into window.appContext.collectorData — a JavaScript global readable by every third-party script on the page, including the TrafficStars ad network and Amplitude analytics SDK."
  - "GA4 analytics route through a first-party server-side GTM container at vnt.xhamster.com before reaching Google — making standard ad-blocker host lists and DNS filtering ineffective against this tracking traffic."
  - "The server delivers a consent cookie with all four categories pre-approved (essential, functional, targeting, analytical) in the very first HTTP response — before JavaScript loads or any user interaction occurs — and GTM reads it as granted consent, firing all trackers immediately."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

xHamster has been online since 2007. It's operated by Hammy Media Ltd, registered in the Republic of Cyprus, and handles a scale of traffic that makes it one of the most-visited adult platforms on the web. The investigation captured behavior across the homepage, a video page, and a search results page — all without an account.

---

## Architecture

The frontend runs Svelte with server-side rendering. Page HTML arrives fully populated with embedded JSON globals (`window.appContext`, `window.initials`) containing application state, user context, and configuration. Cloudflare sits in front as CDN and DDoS proxy — confirmed by the `server: cloudflare` response header and CF-Ray identifier.

Static assets (CSS, JS chunks, images) are served from `static-ah.xhcdn.com` and `ic-vt-nss.xhcdn.com` — xHamster's own CDN infrastructure. Video delivery is split: the `video-am` host maps to AWS CloudFront (primary), with `video-cf` (Cloudflare) as fallback. Video is encoded in both H.264 and AV1 at five quality levels (144p, 240p, 480p, 720p, auto-adaptive), delivered via both progressive download and HLS streaming.

Response headers signal client-hint collection from the first request:
```
accept-ch: Sec-CH-UA-Platform-Version, Sec-CH-UA-Model
permissions-policy: ch-ua-platform-version=*, ch-ua-model=*
```
The permissions policy sets `*` as the allowed origin — meaning any embedded third-party domain can also request these client hints.

`vary: User-Agent` on the homepage response means the server tailors HTML to the User-Agent string, which has implications for caching and scraping consistency.

A service worker is supported (`isServiceWorkerAllowed: true` in initials) and not forced (`isServiceWorkerForced: false`). The `window.__svelte` global confirms the Svelte framework runtime. The async polyfill `regeneratorRuntime` is present, indicating the codebase still supports older browsers.

---

## The Recommendation Engine

Every page navigation triggers a request to `fido.xhamster.com/dbPAE/v2/for-page`. This is the recommendation engine endpoint — it determines widget content and ad placement by receiving a behavioral snapshot of the current session.

The request is a GET, meaning the full behavioral payload appears in the URL and in server logs. The body parameter contains:
- `statsUid` — the persistent anonymous identifier (`stats_uid` from collectorData, format: `[hex].[decimal]`)
- `views` — list of video IDs watched in this session
- `favoriteTags` — inferred content category preference tag IDs
- `orientation` — sexual orientation preference (inferred from content viewed)
- `pageType`, `pageId` — current page context
- `pageVideos` — video IDs displayed on the current page
- `experiments` — active A/B test group assignments

The endpoint returns 200 without authentication. The `statsUid` persists across sessions via cookie/localStorage, meaning the behavioral record accumulates indefinitely. The response configures widget positions (where ads and affiliate cam widgets appear on the page).

On any other website, a recommendation API leaking behavioral preferences in a GET URL would be a notable finding. On an adult site, the combination of sexual orientation, inferred content preferences, and a persistent cross-session identifier sitting in server logs and URL bars is a different order of exposure.

The `bannerPrefix` value (`HK-uWwzy`) in appContext also appears as a query parameter key in the fido URL, likely a session rotation token.

---

## The 292-Domain Trust Network

`window.initials.trustURLs` is a 292-entry array delivered to every visitor's browser in the server-rendered page payload. The list represents domains that the client-side code treats as trusted for navigation and link handling.

The top tier is the xHamster product ecosystem: `xhamsterlive.com`, `faphouse.com`, `stripchat.com`, `xhamsternft.com`, `xhamstercreators.com`, `flirtify.com`, `darkroomvr.com`, `virtualtaboo.com`, `dmsik.com`.

The mid tier is geographic mirror infrastructure — xhamster.desi variants (numbered), xhamster.one, xhamsterpremium.com, and a range of numbered alternate domains.

The bottom tier — roughly 80 domains — follows naming patterns across short obscure TLDs:
- Pattern group 1: `goxh.blog`, `goxh.today`, `goxh.life`, `goxh.live`
- Pattern group 2: `xhnet.blog`, `xhnet.today`, `xhnet.life`, `xhnet.live`
- Pattern group 3: `xhgroup.blog`, plus entries across `.world`, `.lat`, `.lol`, `.click`, `.beauty`, `.skin`, `.digital` TLDs
- `hamxcatalog.world`, `gobwy.lol`, `goehq.lat` — random-looking names that fit an affiliate rotation pattern

These short-TLD domains appear to be a geo-bypass network: domains registered specifically for users in countries where xhamster.com is blocked, distributed to every visitor's browser so they're available client-side for redirection. Delivering the full list in the page config means every visitor — regardless of their country — receives the complete bypass domain inventory.

---

## IP Address in the Client Layer

The server renders the visitor's IP address and geolocation into the page's initial JavaScript payload:

```
window.appContext.collectorData = {
  ip: "[full IPv6 address]",
  country: "US",
  city: "[city]",
  state_code: "US-CA",
  isp: "[ISP name]",
  ip_usage_type: "ISP",
  ...
}
```

This object is part of the server-rendered HTML — it's present in the raw page source before any JavaScript executes. Every script loaded on the page, including TrafficStars ad scripts, the Amplitude SDK, and any GTM tag, can read `window.appContext.collectorData.ip` without making a separate geolocation API call.

The same geographic data is also provided to GTM independently via the `ip2location_country` and `ip2location_region` dimensions in `initials.gtmSettings.dimensions`. The city-level resolution suggests xHamster runs an IP geolocation database server-side.

Additionally, a `watchId` field is set in appContext — a per-session watch activity identifier separate from the `stats_uid` persistent fingerprint — which the stats collection endpoint at `/api/front/sc/[id]` receives.

---

## The Consent Mechanism

On the very first HTTP request to xhamster.com — before the page renders, before the Svelte app initializes, before any consent management code executes — the server's HTTP/2 200 response includes this `Set-Cookie` header:

```
set-cookie: cookie_accept_v2=%7B%22e%22%3A1%2C%22f%22%3A1%2C%22t%22%3A1%2C%22a%22%3A1%7D;
  expires=Fri, 09 Apr 2027 00:43:45 GMT; Max-Age=31536000; path=/; domain=.xhamster.com
```

URL-decoded, the cookie value is `{"e":1,"f":1,"t":1,"a":1}`. The four categories map to: essential (e), functional (f), targeting/advertising (t), analytical (a) — all set to 1 (accepted). The cookie has a one-year Max-Age.

The server-rendered `window.appContext` reflects this immediately:
- `hasAcceptanceCookieV2: true`
- `acceptedCookies: {essential: true, functional: true, targeting: true, analytical: true}`
- `isCookiesDialogEUOpened: false`
- `isEUCountry: false` (for US visitors)

Google Tag Manager reads this cookie state and fires a `GDPR / change_settings` dataLayer event on every page load reporting all consent categories as accepted. This in turn gates all tracking tags — which all fire immediately. GTM's own consent state tag (tag_id 1783) sets all storage types to "denied" by default, but this is immediately overridden by the cookie-reading logic that sees the pre-set consent.

The consent categories are sent to GA4 analytics via `dimension127`, which contains `"essential,functional,targeting,analytical"` — the full accepted string — on every pageview.

No consent banner is presented to US visitors. The site has the infrastructure for one (`isCookiesDialogEUOpened` field, `hideCookieAnnounce` field) but it does not activate for non-EU traffic. Whether EU visitors receive the same pre-set server cookie is an open question the current evidence doesn't resolve — the flag `isEUCountry` is set server-side and would be `true` for EU IP addresses, which might gate a different code path.

---

## Surveillance & Tracking

Google Tag Manager (container ID: `GTM-TLDPV3J`) orchestrates the tracking stack.

**Google Analytics 4** — three separate measurement properties:
- `G-M59JX8S6QE` — primary property, configured with a server-side relay through `vnt.xhamster.com` (discussed separately)
- `G-J929J2L7NM` — secondary property
- `G-T40T5YFNVL` — creator/upload-focused property, tracks upload form interactions and creator-specific events

**Amplitude** — SDK version 8.5.0 loaded via GTM (tag_id 715), API key `81070ebcbd203a78b2c4ec2a974dd116`. Fires `amplitudeEvents_page_view` on every navigation with: site version, mode, orientation, stats_id, country/geo, creator status, video date, video ID, page path, experiment assignments (general_exp), user agent, and user ID (if logged in).

**Google DoubleClick** — 9 references in the GTM container. Display advertising network (`ad.doubleclick.net`, `googleads.g.doubleclick.net`).

**TrafficStars** — primary ad network. Assets served from `svacdn.tsyndicate.com` (9 assets on the search page), with endpoint requests to `tsyndicate.com`. The `ablParams` field in appContext configures the top ad slot: `{id:'adSlot1', class:'cams-wgt ADTop AdCenter WidthAd', href:'https://flirtify.com/'}` — flirtify.com is a cam affiliate also in the trustURL list.

**LiveJasmin VAST** — `vast.livejasmin.com` serves preroll video ads. Player config: `prerollConfig: {maxCount: 7, stateConfig: [0,3,5]}` — up to 7 preroll ads per video session, triggered at positions 0, 3, and 5.

**Google reCAPTCHA** — Enterprise v3 (`6LfgErQaAAAAAN0wCBhC-kc_DRKXR3IsWowYGjjS`) and v2 (`6LdamIQUAAAAAOI6zxYRCbYtaLKkzfddgrWQForz`) for account actions.

**Google One Tap** — `isGoogleOneTapAutoSignInEnabled: true`. Auto-prompt fires on page load. A `google_one_tap / auto_modal_close` event fires in the dataLayer on each observed session, suggesting the modal opens and closes without user interaction (possibly auto-dismissed due to browser state or prior dismissal).

The first dataLayer push sequence on a cold homepage load (no account, no prior visits):
1. `gtm.js` — GTM init
2. `view_item_list` — GA4 ecommerce impression
3. `parentalControl / view`
4. `GDPR / change_settings` — reports all consent as accepted (from server-set cookie)
5. `xhl_widget / view` — xHamsterLive cam widget impression
6. `ff_widget / view` — Flirtify widget impression
7. `fh_widget / view` — Faphouse widget impression
8. `oldEvent / vpn_detected: false, adblock_detected: false`
9. `google_one_tap / auto_modal_close`

### Server-Side GA4 Container

The primary GA4 property (`G-M59JX8S6QE`) routes through `vnt.xhamster.com` — a server-side GTM container. GA4 hits sent by the browser go to xHamster's own infrastructure first, not directly to Google. This has two consequences: standard browser-level GA4 blocking via hosts files or ad-blocker DNS entries is ineffective (the domain is first-party), and xHamster receives a copy of every analytics event before it reaches Google.

### Experiment Tracking

Seven active A/B experiment assignments were recorded in this session's dimension59: `exp50_groupa_48, exp105_groupb_4, exp117_groupb_1, exp2007_groupa_1, exp2036_groupa_3, exp2303_groupa_8, exp8031_groupg_2`. These are transmitted to GA4 (as dimension59), to Amplitude (as `general_exp`), and to the fido.xhamster.com recommendation API. Experiment IDs are numeric; group letters run a-g; version numbers indicate iteration count (version 48 for experiment 50 suggests heavy iteration on that test).

The GTM container also includes a tag (tag_id 2116) that reads dimension59 and conditionally modifies the "Dislike" button label text — specifically looking for `exp3004_groupb` to change the label. This shows GTM is being used not just for tracking but for live UI experiments.

---

## Compliance Infrastructure

Hammy Media Ltd (Republic of Cyprus) publishes a DSA Transparency Report for 2024 (and 2025) at `/info/dsa-transparency-report-2024`. Both URLs are disallowed in robots.txt and marked `noindex`. Key figures from the 2024 report:

- 33,549 total notices received
- 23,358 valid notices acted upon
- 39,000+ total content restrictions
- 144 accounts suspended for protection-of-minors violations
- 12,758 pieces of non-consensual content removed

The `/info/list-of-processors` page is similarly disallowed in robots.txt. Confirmed data processors include: Kozelo SAS (France, content moderation), FaceTec Inc (USA, biometric facial age verification), Yoti Limited (UK, digital ID age verification), AHPS LTD and Dataweb Global LP (UK, hosting), Cloudflare (USA, proxy), Amplitude (USA, analytics), Technius Ltd and Tecom Ltd (Cyprus, user validation), Google Inc (USA, mail/storage/analytics), Traffic Stars Ltd (Cyprus, advertising), Cyberbrain Labs Ltd (Cyprus, website functionality), and Amazon Web Services (USA, content moderation AI).

Age verification uses FaceTec biometric scanning and Yoti digital ID — but only for content uploaders, not viewers. The `ageVerificationInfo` object for unauthenticated visitors: `{isAgeVerified: true, isAgeVerificationRequired: false, isAgeVerificationRequiredBeforeSignup: false, isUpfrontAgeVerification: false}`. Visitors are considered age-verified by default; uploaders must verify.

Human moderators review all uploads before publication. CSAM detection uses AWS AI tools plus digital hash fingerprinting that blocks re-upload of previously removed content.

The Internet Archive (Wayback Machine) is completely blocked: `User-agent: ia_archiver / Disallow: /`.

---

## Product Notes

**Signup** requires only a username and password — no email address. SSO is available via Google and Twitter/X.

**Handy integration** — the xPlayer schema includes a `handyCredentials` field (null for this video). The Handy is an internet-connected sex toy that can sync playback with video timing data. The integration is built into the player but requires per-video credential configuration.

**NFT wallet** — `urls.myNftwalletEdit: "https://xhamster.com/my/edit/nftwallet"` is a live URL in the active URL map, and `xhamsternft.com` appears in the trustURL list. An NFT product is present in the current production build.

**Obfuscated endpoints** — requests like `GET /53mcj/r`, `GET /m4L5j/r`, `GET /UajIq/r`, `POST /2kta3`, `POST /cLj5k` appear across page types. The path segments are short, randomly-looking strings — likely stats or tracking collection endpoints behind a path-obfuscation layer. All return 200.

**Batch API** — `GET /api/front/batch/[base64-encoded-JSON]` fires on every page load with a JSON array of sub-requests. The decoded URL confirms two standard sub-calls: `POST /api/front/search/history` (last 5 searches) and `POST /api/front/experiments` (current experiment assignments).

---

## Machine Briefing

### Access & Auth

Most first-party API endpoints return 403 or Cloudflare 520 to unauthenticated curl. Browser sessions with a valid `_cfg` session cookie and the pre-set `cookie_accept_v2` cookie work. `fido.xhamster.com` is the exception — the recommendation endpoint returns 200 for GET requests from a browser; curl access may require matching headers.

The `cookie_accept_v2` cookie is set server-side on first load. The `_cfg` cookie is an HttpOnly, SameSite=Lax session cookie with 30-day expiry. The `recs_show_time` cookie is short-lived (15 minutes). `ff_thumb_offset` and `moments_listing_ad_offset` are preference cookies with 1-year expiry.

To get a working browser session: load `https://xhamster.com/`, collect the set-cookie headers, then include them in subsequent requests.

### Endpoints

**Open (no auth, browser headers):**
```
GET https://fido.xhamster.com/dbPAE/v2/for-page?HK-uWwzy&body={JSON}
```
Body JSON parameters: `statsUid`, `views` (array), `favoriteTags` (array of tag IDs), `orientation` ("straight"/"gay"/"shemale"), `pageType`, `pageId`, `pageVideos` (array), `experiments` (object).

**Requires cookies:**
```
GET https://xhamster.com/api/front/batch/{base64-encoded-JSON-array}
```
JSON array contains objects with `id` (UUID) and `url` (API path). Observed sub-requests:
- `/api/front/search/history`
- `/api/front/experiments`

Stats collection (proxified):
```
POST https://xhamster.com/api/front/sc/[id]
```

**Obfuscated stats endpoints (short-path):**
```
GET  /53mcj/r    (homepage)
GET  /m4L5j/r    (video page)
GET  /UajIq/r    (video page)
POST /2kta3      (video page, x2)
POST /cLj5k      (video page, x2)
GET  /SBUx3/r    (search page)
```
These return 200 and appear to accept minimal or no body. Payload and response formats unconfirmed.

**Blocked:**
```
GET https://api.xhamster.com/          -> 403
GET https://fido.xhamster.com/         -> 403 (root only; /dbPAE/v2/ works)
GET https://admin.xhamster.com/        -> 301 -> xhamster.com
GET https://staging.xhamster.com/      -> 301 -> xhamster.com
```

### Gotchas

- `vary: User-Agent` on the homepage — different HTML for different agents. Headless Chrome gets the full JS app. curl gets a reduced response or 403/520.
- The batch API base64 payload is a JSON array URL-encoded then base64-encoded.
- Video source URLs in the player config (`xplayerSettings.sources`) are hex-encoded token strings, not direct CDN URLs. They are resolved server-side or via the xPlayer runtime — not directly usable.
- The `stats_uid` persistent identifier appears in: `window.appContext.collectorData.stats_uid`, fido request body, and the stats collection endpoint. It persists across sessions.
- GA4 hits route through `vnt.xhamster.com` (server-side GTM container) — blocking `google-analytics.com` or `googletagmanager.com` does not intercept this traffic.
- robots.txt disallows `/api/` — direct crawler calls will get 403/520; requests with browser headers and valid cookies work.
