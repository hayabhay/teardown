---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "ServiceMaster Brands — Teardown"
url: "https://servicemaster.com"
company: "ServiceMaster Brands"
industry: "Professional Services"
description: "Franchise holding company operating five home-services brands."
summary: "WordPress 6.9.4 on WP Engine behind Cloudflare. jQuery-based with no SPA framework. Plugins include Contact Form 7, Gravity Forms, Yoast SEO, AddToAny, and CookieYes. Analytics runs GA4 via GTM plus an orphaned GA3 hardcode from before July 2023. WP REST API serves 224 routes unauthenticated; XMLRPC is fully enabled with all methods including system.multicall."
date: "2026-04-12"
time: "20:36"
contributor: "hayabhay"
model: "sonnet"
effort: "medium"
stack: [WordPress, WP Engine, Cloudflare, jQuery, Yoast SEO]
trackers: [Google Analytics, Google Tag Manager, DoubleClick, CookieYes, AddToAny]
tags: [wordpress, tracking, consent, analytics, xmlrpc, privacy, franchise, wpe, user-enumeration, supply-chain]
headline: "XMLRPC multicall is fully enabled alongside four usernames the REST API hands out to anyone who asks."
findings:
  - "The WP REST API returns four employee usernames unauthenticated, and one slug (bob-pirriservicemaster-com) encodes an email address -- exposing the corporate email format to anyone who queries it."
  - "XMLRPC is fully open with system.multicall enabled, allowing hundreds of credential attempts in a single HTTP request against the four known usernames."
  - "A dead GA3 tag (UA-22438807-1) is hardcoded in the HTML four lines before CookieYes loads, firing google-analytics.com on every visit -- Universal Analytics stopped accepting hits in July 2023."
  - "CookieYes is installed but the consent banner never attaches to the DOM. GA4 and DoubleClick fire on every page with ad personalization enabled and no denied consent defaults."
  - "The Bynder DAM at assets.servicemaster.com uses Osano for consent management -- a different vendor than the main site's CookieYes."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

ServiceMaster Brands operates five home-services franchise networks -- ServiceMaster Restore, ServiceMaster Clean, Merry Maids, Two Men and a Truck, and Furniture Medic -- from a single corporate holding site. The site is a pure content and lead-generation surface: 14 published pages, a newsroom, franchise inquiry forms, and privacy compliance pages. No e-commerce, no logged-in user state.

## Stack & Architecture

WordPress 6.9.4 on WP Engine, behind Cloudflare (CF-Ray present, `x-powered-by: WP Engine`, cache-control with 600-second TTL, `x-cache: HIT: 12`). jQuery 3.7.1. No SPA framework -- server-rendered HTML, no React or Angular. Theme version 1.4.2 (`service-master`).

Plugins confirmed via asset URLs and REST API namespaces:
- Contact Form 7 v6.1.5
- CookieYes (consent manager, namespace `cky/v1`)
- Yoast SEO (namespace `yoast/v1`, version 27.3 confirmed via sitemap generation)
- AddToAny v1.16 (social sharing)
- WP Engine SSO plugin (`wpe_sign_on_plugin/v1`)
- WP Site Health, WP Block Editor (standard WP)

Gravity Forms also present (confirmed via `gform_i18n` global on the personal data request form page). Gravity Forms version not exposed via asset URLs.

External JavaScript dependencies loaded from unpkg CDN (not the site's own CDN): `unpkg.com/aos@2.3.1/dist/aos.js` (scroll animation library) and `unpkg.com/swiper/swiper-bundle.min.js` (carousel -- no version pin). These are loaded with `?ver=6.9.4` appended as WordPress cache-busters, but the actual packages are resolved by unpkg at load time. Swiper in particular has no pinned version, meaning a breaking change or supply-chain compromise in the npm package would immediately affect the site.

Cloudflare obfuscates email addresses sitewide via `/cdn-cgi/l/email-protection` encoding, decoded client-side by `cloudflare-static/email-decode.min.js`.

The WP REST API root at `https://www.servicemaster.com/wp-json/` returns 224 routes across 10 namespaces. Settings and plugins endpoints return 401.

## Analytics: Two Tags, One Measuring

There are two Google Analytics tags on this site. One is active. One is three years dead.

**The orphan.** Line 16 of the HTML source:

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=UA-22438807-1"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'UA-22438807-1');
</script>
```

UA-22438807-1 is a Universal Analytics (GA3) property. Google deprecated Universal Analytics and stopped processing hits to UA properties in July 2023. This tag still loads `google-analytics.com/analytics.js` (the UA client library) on every page visit. The `gtag('config', 'UA-22438807-1')` call fires unconditionally. The hits go nowhere.

**The active tag.** GA4 property G-9JV4LC7GN5 loads via GTM (GTM-TQF75MX), which itself loads after the CookieYes consent manager. From the network evidence, the full GA4 collect request fires on page load:

```
https://analytics.google.com/g/collect?v=2&tid=G-9JV4LC7GN5&...&npa=0&gcd=13l3l3l3l1l1&_eu=EAAIAGA&en=page_view
```

DoubleClick advertising measurement fires alongside it:

```
https://stats.g.doubleclick.net/g/collect?v=2&tid=G-9JV4LC7GN5&...&npa=0&gcd=13l3l3l3l1l1&aip=1
```

Key parameters: `npa=0` -- ad personalization is not opted out. `gcd=13l3l3l3l1l1` -- consent state encoding where ad_storage and analytics_storage have no denied defaults set (value `3` = no default configured). `_eu=EAAIAGA` -- signals analytics and ad personalization as active. `aip=1` on the DoubleClick hit anonymizes the IP server-side, but the measurement request is still sent.

The migration path is visible: someone added GA4 via GTM at some point after July 2023, but never removed the hardcoded UA tag from the theme template. The dead tag still runs the UA library fetch on every page load.

## Consent: Never Asked

CookieYes is installed and configured. The consent cookie it sets, `cookieyes-consent`, is present on load:

```
consentid:...,consent:,action:,necessary:,functional:,analytics:,performance:,advertisement:
```

All category values are blank. `action:` is blank. CookieYes has not recorded any user decision -- the consent cookie exists but is empty.

The reason: the consent banner never appears. In a fully clean browser session (no prior cookies, no prior visits), `bannerDisplayState` is `none` and `bannerAttached` is `false` -- the banner DOM is never inserted. The CookieYes rule set says `condition: "all"` (show to everyone), but the banner initialization fails. Fresh visitors receive no consent interface.

Even if the banner were working, it couldn't block GA. The hardcoded `gtag.js` and `gtag('config', ...)` calls appear at lines 16-21 of the HTML. CookieYes script loads at line 25. JavaScript parsing is sequential -- GA fires during HTML parsing before CookieYes has any opportunity to intervene. This ordering makes the consent manager structurally incapable of blocking the GA3 hardcode.

GA4 via GTM is a different path: GTM loads after CookieYes, and the GTM container does contain consent mode configuration (28 references to `ad_storage`, 11 to `analytics_storage`). But no `consent_default` call appears in the dataLayer before GTM fires, so the consent state defaults to unset rather than denied -- GA4 behaves as granted.

CookieYes categorizes `_ga`, `_gid`, and `_gat_gtag_UA_22438807_1` under the `analytics` category, marked as blocked until consent. This configuration is correct on paper. The implementation bypasses it at two levels: GA3 hardcoded before CookieYes, GA4 via GTM with no denied default.

GPC (Global Privacy Control) -- the browser signal for "do not sell my data" -- is not honored. `_gpcStatus: false` in the CookieYes store. The site has a "Do Not Sell or Share My Personal Information" page, but it requires form submission rather than any technical opt-out mechanism. GPC browsers receive no acknowledgment.

## WordPress Attack Surface

The WP REST API returns four WordPress users to any unauthenticated GET request at `https://www.servicemaster.com/wp-json/wp/v2/users`:

| ID | Name | Slug | Role (inferred) |
|----|------|------|-----------------|
| 11 | Bob Pirri | bob-pirriservicemaster-com | Content author (publishes all posts) |
| 12 | Caleb Williams | cwilliams | Author |
| 4 | Nick Tekavic | nicktekavic | Author |
| 1 | samcrawford | samcrawford | Admin (ID 1 is always first WordPress admin) |

No email addresses are directly returned by the API. But WordPress generates user slugs from the account email at registration, stripping `@` and replacing `.` with `-`. User 11's slug `bob-pirriservicemaster-com` follows this pattern precisely -- it derives from `bob-pirri@servicemaster.com`. This exposes the corporate email format (`firstname-lastname@servicemaster.com`) and Bob Pirri's address specifically.

All newsroom posts are authored by ID 11. The most recent post is dated 2026-04-10.

The media library is browsable via `wp/v2/media`: file upload paths with dates are accessible, including employee headshots (`A7V02198-Collin-Meyer.jpg`, `Lauren_Headshot.jpg`) uploaded in early 2026.

XMLRPC (`xmlrpc.php`) is fully enabled. The method list from a POST to `system.listMethods` includes:

- `system.multicall` -- batches multiple XMLRPC calls in one HTTP request
- `wp.getUsers`, `wp.getUser` -- user enumeration
- `wp.newPost`, `wp.editPost`, `wp.deletePost` -- content management
- `wp.uploadFile` -- file upload
- `wp.getOptions`, `wp.setOptions` -- site configuration read/write
- Full `metaWeblog.*`, `blogger.*` legacy API sets

`system.multicall` is the relevant one: it allows testing hundreds of username/password combinations in a single HTTP request, bypassing per-request rate limits. Combined with four confirmed usernames (including a likely admin at ID 1), XMLRPC multicall brute-force is the textbook attack path. WordPress security tooling has documented this for years; it remains unmitigated here.

The WordPress login page is at `/wp-login.php`. No custom login URL, no visible 2FA. The form action includes `?wpe-login=true`, confirming the WP Engine SSO plugin is active but not replacing the standard login flow.

## Subdomain Ecosystem

Three active subdomains observed:

**`assets.servicemaster.com`** redirects (302) to `servicemaster.bynder.com/login/`. Bynder is an enterprise digital asset management (DAM) platform. The subdomain is auth-gated. Its HTTP response Content-Security-Policy reveals the internal tool stack deployed in the DAM: HubSpot (`js.hs-analytics.net`), Amplitude (analytics), Appcues (user onboarding/in-app guidance), Sentry (error monitoring), Heap (behavioral analytics), and Osano (consent manager).

Osano is a direct competitor to CookieYes. The main site uses CookieYes; the Bynder DAM uses Osano. These are separate procurement decisions -- users interacting with both surfaces encounter different consent frameworks.

**`performance.servicemaster.com`** redirects (301) to `moodle.com/us/`. Moodle is an open-source LMS (Learning Management System). This is the employee training portal, hosted externally at Moodle's SaaS platform.

**`careers.servicemaster.com`** returns 403. Subdomain exists (confirmed via certificate transparency), likely an ATS or careers portal, blocked to outside access.

**`news.servicemaster.com`** has an SSL certificate but the connection times out. Inactive or offline.

## Machine Briefing

### Access & auth

The main site is fully public, no session required. WP REST API supports unauthenticated GET for users, posts, media, and pages. XMLRPC accepts POST requests without prior setup. All endpoints below work with a bare `curl` or `fetch`.

### Endpoints

**WP REST API -- open, unauthenticated**

```bash
# API root -- all namespaces and routes
curl https://www.servicemaster.com/wp-json/

# Users (4 returned)
curl https://www.servicemaster.com/wp-json/wp/v2/users

# Specific user by ID
curl https://www.servicemaster.com/wp-json/wp/v2/users/11

# Posts (paginated, default 10/page)
curl "https://www.servicemaster.com/wp-json/wp/v2/posts?per_page=100"

# Media library
curl "https://www.servicemaster.com/wp-json/wp/v2/media?per_page=100"

# Pages
curl https://www.servicemaster.com/wp-json/wp/v2/pages
```

**XMLRPC -- full method access**

```bash
# List all methods
curl -X POST https://www.servicemaster.com/xmlrpc.php \
  -H "Content-Type: text/xml" \
  -d '<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName><params></params></methodCall>'
```

**WP Login**

```
https://www.servicemaster.com/wp-login.php?wpe-login=true
```

**CookieYes config (fetched by browser)**

```bash
# Cookie knowledge base
curl "https://cdn-cookieyes.com/client_data/0f4b8ecf3e9c1e5f7a3e5b7a/ks_ihlJ7.json"

# Banner config
curl "https://cdn-cookieyes.com/client_data/0f4b8ecf3e9c1e5f7a3e5b7a/config/0IKcd31T.json"
```

**GTM container**

```bash
curl "https://www.googletagmanager.com/gtm.js?id=GTM-TQF75MX"
```

### Gotchas

- WP REST API settings (`/wp-json/wp/v2/settings`) and plugins return 401 -- auth required.
- CookieYes CDN endpoints (`cdn-cookieyes.com`) may return a Cloudflare challenge when accessed via curl. Fetch from a browser context works.
- XMLRPC returns HTTP 405 on GET -- must POST with valid XML payload.
- WP Engine's SSO plugin adds `?wpe-login=true` to the login form action; standard `/wp-login.php` still works.
- Cloudflare cache TTL is 600 seconds (`x-cache: HIT: 12` observed) -- fresh content may take up to 10 minutes to propagate.
- Robots.txt specifies `Crawl-delay: 10`. No evidence of active rate-limiting on REST API or XMLRPC, but WP Engine may enforce limits at the hosting layer.
