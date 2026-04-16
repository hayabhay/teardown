---
# agents: machine-friendly instructions in "## Machine Briefing"
title: "Figma — Teardown"
url: "https://figma.com"
company: "Figma"
industry: "Information"
description: "Collaborative interface design and prototyping tool for teams."
summary: "Figma runs two separate stacks on the same domain: a Next.js marketing site on Netlify with CloudFront, and a Ruby on Rails app backend through a different CloudFront distribution. The Rails backend delivers a JSON config block on every page load -- including unauthenticated requests and 404s -- containing 702 feature flags, SDK credentials for six vendors, full AI credit pricing by model, and per-visitor IP geolocation. Real-time multiplayer runs on LiveGraph, a proprietary WebSocket engine with a v2 (LG100) rollout in progress."
date: "2026-04-16"
time: "02:55"
contributor: "hayabhay"
model: "sonnet-4.6"
effort: "high"
stack:
  - Next.js
  - Ruby on Rails
  - CloudFront
trackers:
  - Segment
  - Statsig
  - Datadog RUM
  - Sentry
  - Sprig
  - New Relic
  - Adora
  - Google Tag Manager
  - Vimeo
tags:
  - design-tools
  - saas
  - feature-flags
  - real-time
  - ai-tools
  - analytics-proxy
  - dual-stack
  - config-leak
  - session-recording
  - multiplayer
headline: "Figma's production AI config exposes three unlabeled model codenames — 'mystery', 'velvet', and 'singapore' — and undisclosed credit pricing from 0 credits (internal 'hawk-1') to 25 credits per generation."
findings:
  - "The Make text model picker config lists three internal aliases -- 'mystery' (enabled), 'velvet', and 'singapore' (both disabled) -- alongside Claude 4.6 and Gemini 3 in the production model selector, with no public label or description for any of them."
  - "Figma's AI credit pricing spans 14 image models: an internal model called 'hawk-1' costs 0 credits, Amazon Titan costs 2, and Gemini 3 Pro costs 25 -- a 12.5x range visible to anyone loading an app page."
  - "Student accounts receive 3,000 AI credits per month regardless of seat role -- identical to Pro-tier expert seats and six times the 500-credit cap on Starter experts."
  - "LaunchDarkly's client SDK, keyed by an ID shipped in every page load, returns readable flag names exposing Muse AI rate limits, LiveGraph session caps, and internal service names -- while Figma migrates to Statsig where the same data is hashed."
  - "Figma proxies all Segment analytics through /api/figment-proxy/ on its own domain, making tracking calls indistinguishable from product requests to any domain-based blocker."
disclaimer: "AI-generated report. Findings may contain inaccuracies and should be independently verified."
---

Figma runs two entirely separate stacks on a single domain. The split is invisible to users but immediate to anyone watching the network: `/pricing`, `/blog`, and `/signup` come from a Next.js deployment on Netlify with CloudFront in front; `/files`, `/file`, `/community`, and the rest of the product come from a Ruby on Rails backend behind a different CloudFront distribution. Path-based routing in CloudFront handles the seam. The marketing stack has no session; the app stack sets a Rails session cookie on every request -- including 404s, including unauthenticated page loads.

That session cookie, `figma.session`, uses base64-encoded Ruby Marshal format scoped to `.www.figma.com`. It arrives alongside `__Host-figma.did`, a one-year device ID that is HttpOnly, Secure, and SameSite=Lax. Neither requires authentication to receive.

## Architecture

**Marketing stack** (`www.figma.com/`, `/blog/`, `/pricing/`, `/signup`, `/login`, `/contact`): Next.js on Netlify, ISR pages with a 30-second max-age. Content is served from Sanity CMS (`cdn.sanity.io`, project `599r6htc`). The ISR revalidation window is 300 seconds. Build ID: `Y-caASI68FqbLpU2f_m8m`. Netlify Edge handles vary logic on cookies and headers via `netlify-vary`; CloudFront sits in front with its own cache layer. Response includes `x-nextjs-prerender: 1` on all cached pages.

**App stack** (`www.figma.com/files/`, `/file/`, `/community/`, `/team/`, etc.): Ruby on Rails with custom Webpack bundles stored under `/webpack-artifacts/assets/`. A separate CloudFront distribution with `server-timing: proxyq/app/proxy` headers. Auth bundle at `/webpack-artifacts/assets/auth-66691445815506ba.min.en.json.br`. Asset versioning through `sts_assets_version: v11`.

**Subdomains:**
- `staging.figma.com` -- live, behind WAF (returns 202 + `x-amzn-waf-action: challenge`); explicitly allowed in the marketing site's CSP connect-src for `staging.figma.com/api/figment-proxy/*`
- `admin.figma.com` -- AWS Cognito-protected, redirects to `figma-production-admin.auth.us-west-2.amazoncognito.com`
- `sprig.figma.com` -- Sprig in-product survey iframe, returns 200
- `verify.figma.com` -- Arkose (bot challenge) and SheerID (educational verification) iframes
- `marketing.figma.com` -- S3 static bucket hosting GTM tag manager sandbox; last modified Feb 2023
- `forum.figma.com` -- nginx, New Relic browser monitoring (agent ID 1103356138, account 554661)
- `api.figma.com` -- public REST API, redirects to `/developers` without auth, CORS `access-control-allow-origin: *`
- `embed.figma.com` -- Figma embeds
- `static.figma.com` -- static assets, 403 to root

**CI/CD**: BuildKite. Deploys from `master` branch (confirmed by `release_git_tag: master` in the config block). Two distinct git hashes per deploy: `release_manifest_git_commit` and `release_server_git_commit` -- manifest artifacts and server code are built independently. Deployment strategy: `autocanary`.

## The INITIAL_OPTIONS Config Block

Every page rendered by the Rails app backend serves a `<script type="application/json" data-initial>` block containing two top-level objects: `EARLY_ARGS` and `INITIAL_OPTIONS`. This block appears on authenticated pages, unauthenticated pages, and 404 error pages alike.

`INITIAL_OPTIONS` has 85 top-level keys. The contents are tuned per-request -- the visitor's geolocation is populated server-side on every hit.

**SDK credentials:**

| Key | Value |
|-----|-------|
| `statsig_figma_app_client_api_key` | `client-CIbRGW8h7lTl7wjJTyKWmPVXuJai3B8xe7llhBQmjJX` |
| `statsig_figma_app_client_on_device_eval_api_key` | `client-jpgCrJjxXHTsQC8BoeGofYZJZwKokoNgta0CJaVG7rG` |
| `launchdarkly_client_side_id` | `62e9cfc83c59501226eae584` |
| `datadog_rum_application_id` | `91eb025c-e89b-4645-bda6-ca0e442e0b64` |
| `datadog_rum_client_token` | `pub3f6fa9c94d5ff85890f30fdc10b09c61` |
| `stripe_api_public` | `pk_live_LKZ0RKjSZG2D2pwdtwrAhkiJ` |
| `arkose_challenge_public_key` | `A207F8A1-ED09-4325-ACE6-C8E26A458FBA` |
| `recaptcha_v3_ent_site_key` | `6Le0W80aAAAAAGU9L7qz4o9tQVqrdJVv2M8XHIcd` |
| `statsig_project_id` | `5ETXMP5xDW3P7AMyQ14tey` |

The Stripe key is a live publishable key -- client-side by design in Stripe's model, used for payment form rendering. The Firebase config is complete, used for browser push notifications:

```json
{
  "api_key": "AIzaSyBr6NC5yqMqpOhQYPqDvjv0U-yrYxvLfb8",
  "app_id": "1:812015163338:web:0c31148f40e18de8e2a133",
  "auth_domain": "figma-production.firebaseapp.com",
  "messaging_sender_id": "812015163338",
  "project_id": "figma-production",
  "storage_bucket": "figma-production.appspot.com"
}
```

**Infrastructure details:**

| Key | Value |
|-----|-------|
| `npm_registry_public_proxy_address` | `registry.figma.com` |
| `make_git_base_url` | `https://api.figma.com/git` |
| `admin_cognito_logout_url` | `https://figma-production-admin.auth.us-west-2.amazoncognito.com/logout?client_id=2lsagdo9asi3ehjvtslcrsqp24&logout_uri=https://admin.figma.com/admin/logout` |
| `cluster_name` | `prod` |
| `sheerid_student_program_id` | `689a62a06d6a3a59de4fbcb8` |
| `sheerid_educator_program_id` | `689a65716d6a3a59de4ff268` |
| `sprig_iframe_url` | `https://sprig.figma.com` |
| `google_tag_manager_iframe_url` | `https://marketing.figma.com` |

Figma runs its own npm registry at `registry.figma.com`. The `make_npm_private_registry` feature flag is enabled, suggesting private packages used by Figma Make. The Make git integration lives at `api.figma.com/git` -- the backend for Make's code sync and version history.

The AWS Cognito logout URL exposes the production admin panel's OAuth client ID (`2lsagdo9asi3ehjvtslcrsqp24`). The client ID is technically public in OAuth flows, but it confirms admin authentication is isolated to Cognito in `us-west-2`.

**Per-visitor geolocation:**

```json
{
  "user_ip": "<visitor IP>",
  "viewer_city": "San Francisco",
  "viewer_region": "CA",
  "iso_code": "US",
  "user_currency_from_ip": "usd"
}
```

Resolved server-side on every request and embedded in the HTML before JavaScript runs. The visitor's real IP address, city, region, country, and inferred currency are available to any script on the page, including third-party code permitted by the CSP. A `tracking_session_id` is also embedded per page load.

**AG Grid Enterprise license**: The `ag_grid_api_key` in INITIAL_OPTIONS contains Figma's AG Grid Enterprise license (AG-077507) -- a Single Application license for "New Product" covering 3 frontend developers, valid until 31 May 2026. AG Grid's licensing format encodes the license terms directly into the key string; the legal language is the key itself. This is standard AG Grid Enterprise packaging.

**Stripe payment method configurations** (org and pro tier IDs):
- org: `pmc_1RwPalIvcqWR3dFDnPwWUmNB`
- pro: `pmc_1RwPaFIvcqWR3dFD8u52VGOB`

## Feature Flags: 702 in the Clear

`INITIAL_OPTIONS.feature_flags` contains 702 boolean flags, all `true` for unauthenticated sessions. These represent the default-enabled flag set -- not user-specific targeting. The separately accessible Statsig API (`featureassets.org/v1/initialize`) returns 2,940 feature gates, but those are hashed (base64 SHA-style names). The INITIAL_OPTIONS block is what gives readable names.

Categories by count:

- **AI/ML** (~47 flags): `ai_assistant`, `ai_ga`, `ai_credits_plan_add_on`, `aip_flower_garden_rerank`, `aip_flower_garden_merged_colors`, `expr_ai_gemini_3_alpha`, `ai_design_assistant_user_allowlist`, `aip_image_launch_april_2025`, `first_draft_make_changes`, `first_draft_prompt_history`
- **Billing/VAT** (34 flags): VAT collection enabled for Malaysia, Philippines, Turkey, Taiwan, Norway, Australia, Singapore, Cambodia, Sri Lanka, Thailand, Nigeria, Uzbekistan, Georgia, Egypt, Tanzania. `scheduled_cancellation_enabled_co` for Colombia.
- **LiveGraph/multiplayer**: connection protocols, incremental loading, `livegraph_connect_next` in EARLY_ARGS (next-gen protocol, not yet active)
- **Admin** (13 flags): `admin_billing`, `admin_ai_credits_csv`, `admin_role_metadata_panel`, `admin_ai_credits_percentage_sort`, `sites_admin_req_pwds`
- **Product**: `jubilee_enabled`, `campfire_provisional_access_enabled`, `org_campfire_provisional_access_enabled`, `team_campfire_provisional_access_enabled`, `campfire_cart`, `cursor_bot`, `sites_beta`, `figma_web_beta`, `figjam_3p_hardware_integration`, `cmty_weave_promo_banner`

**Unreleased product signals**: "Jubilee" and "Campfire" are codenames behind provisional access gates. Campfire has three scope levels (individual, org, team) plus `campfire_cart` -- suggesting a commerce or purchase flow component. "Cursor Bot" (`cursor_bot`) is enabled. `sites_beta` is active for Figma Sites.

## LaunchDarkly: The Readable Window

The LaunchDarkly client SDK sends the client-side ID (`62e9cfc83c59501226eae584`, shipped in every app page) to `app.launchdarkly.com` with user context, receiving a full flag evaluation payload with plaintext names. While LD is being deprecated in favor of Statsig -- the `allow_migrating_ffs_to_statsig_in_admin` flag is enabled -- the migration is in progress. LD still carries production data with readable names while Statsig's API returns only hashes.

What the LD client SDK returned:

**AI and internal services:**
- `muse_openai_throttle_config` -- rate limits for `/api/muse/figjam/summary`: 500 requests/day/user, 50/hour. Muse is Figma's internal AI service powering FigJam features.
- `pixie-assistant-local-component-search-timeout`: 10,000ms -- "Pixie" is the internal codename for the AI design assistant, consistent with the `ai_design_assistant_user_allowlist` feature flag.

**LiveGraph parameters:**
- `multiplayer_validation_buffer_size_limit`: 100,000
- `lg100_edge_max_sessions_limit`: 100,000
- `lg100_cache_coord_db_rate_limits`: 6,250 QPS, 10,000 burst
- `livegraph_hot_path_optimizations`: slow-path thresholds and incremental tree loading config
- `livegraph_client_backoff_config`: exponential, max 600,000ms (10 minutes), spread multiplier 0.3

**Internal tooling and infrastructure:**
- `deploys_exempt_from_v2_redirect`: `["dbops","antiabuse","dbctld-rds"]` -- internal service names
- `acryl-events-dbt-documentation-consumer` -- Figma uses Acryl (DataHub-based data lineage) with dbt
- `asana_add_channels_to_cy_board` -- Figma tracks work in Asana with a "Cy" project board
- `buildkite_half_go_mem_limit` -- BuildKite CI flag for Go memory limits
- `statsig_killswitch`: `{}` -- killswitch not engaged
- `statsig_plan_key_targeting_enabled`: false -- plan-based targeting not yet activated in Statsig

## LiveGraph -- The Multiplayer Engine

Figma's real-time collaboration engine is LiveGraph. WebSocket upgrade endpoints are live at `/api/livegraph` and `/api/livegraph-next` (both return HTTP 426 to non-WebSocket requests). The `livegraph_connect_next` flag in `EARLY_ARGS` is currently false -- the next-generation connection protocol is in development.

LG100 is LiveGraph's second generation, currently rolling out. From the config:

**Session limits and rate caps** (via LD):
- Edge max sessions: 100,000
- Cache coordinator DB rate limit: 6,250 QPS, burst to 10,000

**Client behavior** (from `livegraph_client_config`):
- Sync timeout: 31,556,952,000ms (~1 year -- effectively no timeout)
- Session reporting interval: 30s
- Stuck loading threshold: 30s
- Subscription retry: max 10 attempts, initial backoff 5s, max backoff 300s, multiplier 2x
- P0 subscriptions: 1s initial backoff, max 3s

Views generating verbose stuck-session logging: `AccessibleFoldersV2`, `UserForRcs`, `OrgAdminUserView`.

The `deploys_auto_start_lg100_after_livegraph` flag is enabled -- LG100 starts automatically after each LiveGraph deployment.

## AI Architecture and the Full Credit Ledger

Figma's entire AI model stack and pricing is embedded in the unauthenticated config. The `ai_metering_credits_per_feature` dynamic config contains credit costs per operation and per model:

**Per-feature costs (credits):**

| Feature | Cost |
|---------|------|
| remove-background | 1 |
| vectorize-image | 2 |
| remove-object | 5 |
| upscale-image | 6 |
| separate-layers | 6 |
| expand-image | 8 |
| first-draft | 20 |
| first-draft-make-changes | 20 |
| magic-link | 20 |

**Image generation per model:**

| Model ID | Credits |
|----------|---------|
| `hawk-1` (internal) | 0 |
| `amazon.titan-image-generator-v2:0` | 2 |
| `imagen-3.0-generate-001` | 8 |
| `imagen-4.0-generate-001` | 8 |
| `gemini-2.0-flash-preview-image-generation` | 8 |
| `gemini-2.5-flash-image-preview` | 8 |
| `gemini-2.5-flash-image` | 8 |
| `gpt-image-1.5` | 8 |
| `gpt-image-0721-mini-alpha` | 5 |
| `gpt-image-1-mini` | 5 |
| `gpt-image-1` | 10 |
| `robin-1` (internal) | 16 |
| `gemini-3.1-flash-image-preview` | 16 |
| `gemini-3-pro-image-preview` | 25 |

`hawk-1` costs 0 credits -- likely an internal test or baseline model. `robin-1` is an internal model at 16 credits, the same tier as Gemini 3.1 Flash. Gemini 3 Pro at 25 credits is the most expensive option, 12.5x the cost of Amazon Titan.

**Figma Make text models** (`figmake_model_picker_enabled_models`):

| Model | Status |
|-------|--------|
| `anthropic-claude-4.6-sonnet` | enabled |
| `anthropic-claude-4.6-opus` | enabled |
| `google-gemini-3-pro` | enabled |
| `google-gemini-3-flash` | enabled |
| `mystery` | enabled |
| `velvet` | disabled |
| `singapore` | disabled |

`mystery`, `velvet`, and `singapore` are internal model aliases with no label or description in the config. `mystery` is currently enabled alongside the public-facing models. Whether these are routing aliases, staging models, or unreleased LLM integrations is not determinable from config alone.

**Image model UI labels** (from `img_model_picker`): "Nano Banana" is Figma's internal codename for its Gemini 2.5 image integration, and the name ships in the production UI picker:

- `nano-banana` -> "Gemini 2.5 (with Nano Banana)" -- supports reference images
- `gemini-3.1-flash-image` -> "Gemini 3.1 (with Nano Banana 2)" -- supports reference images
- `gemini-3-pro-image` -> "Gemini 3 Pro (with Nano Banana)" -- supports reference images
- `openai-gpt-image-1.5` -> "GPT Image 1.5" -- supports reference images
- `gpt-image-1-mini` -> "GPT Image 1 Mini" -- supports reference images
- `imagen-4` -> "Google Imagen 4" -- no reference image support

**AI credits by plan and seat type** (`ai_metering_quotas_with_seat_type`):

| Plan | Role | Credits/month |
|------|------|---------------|
| Enterprise | expert | 4,250 |
| Org | expert | 3,500 |
| Pro | expert | 3,000 |
| Student | any role | 3,000 |
| Starter | expert | 500 |
| Any | collaborator / developer / view | 500 |

Students on any seat role get 3,000 credits -- the same as a Pro-tier full seat. Starter-tier experts are capped at 500, identical to view-only seats on Enterprise. Non-expert roles are capped at 500 regardless of plan tier.

**AI codenames in flags**: "Flower Garden" (`aip_flower_garden_rerank`, `aip_flower_garden_merged_colors`) -- image model reranking experiments. "Pixie" -- AI design assistant, confirmed by LD flag `pixie-assistant-local-component-search-timeout`. "Magnolia" (`aip_magnolia`) -- present in AI flags, no further context. Gemini 3 in alpha: `expr_ai_gemini_3_alpha` enabled. The AI design assistant (`ai_design_assistant_user_allowlist`) is behind an allowlist -- not yet generally available.

**Figma Make version config**: The `make_edits_global_configuration` dynamic config names release versions directly: `assistant-release-17`, `release-15-default`, `release-6-fast`, `zero-to-one-frisky-falcon`. "Frisky Falcon" is the codename for the current zero-to-one experience configuration.

## Figma Sites, MCP, and the Preview URL Format

`sites_beta` is enabled in feature flags. The `sites_template_picker_urls` in INITIAL_OPTIONS contains 4 live preview URLs keyed by numeric Figma file IDs:

```json
{
  "1466571845869232209": "https://afar-pogo-speak.preview.site/",
  "1466631198911201377": "https://resize-yearn-fried.preview.site/",
  "1466631692707147876": "https://prism-pound-acorn.preview.site/",
  "1466631940117567589": "https://capri-divide-roast.preview.site/"
}
```

The naming pattern (adjective-verb-noun) mirrors Heroku's dyno naming generator. Preview sites are accessible without authentication.

**MCP server**: `api.figma.com/mcp` is a live JSON-RPC 2.0 endpoint. GET returns `{"jsonrpc":"2.0","error":{"code":-32000,"message":"Method not allowed."}}`. POST without auth returns `{"jsonrpc":"2.0","error":{"code":-32601,"message":"Method not found."}}`. Authentication is required for method dispatch. Rate limit from `dt_mcp_rate_limit`: 4 tokens, refill interval 1,000ms (4 requests/second). The `assistant_mcp_client_editor_config` shows MCP is currently supported only for `design` editor type.

## Analytics and Surveillance

**Analytics stack:**
- **Segment** -- proxied through `/api/figment-proxy/page`, `/api/figment-proxy/monitor`, and `/api/figment-proxy/identify` on `figma.com`. All three paths are explicitly listed in the marketing site's CSP connect-src for both `figma.com` and `staging.figma.com`. Routing analytics through a first-party domain means domain-based tracker blockers cannot distinguish analytics calls from product requests.
- **Statsig** -- dual deployment: web SDK at `featureassets.org` and `prodregistryv2.org` (both fire on page load), plus in-app integration via SDK keys in INITIAL_OPTIONS
- **Datadog RUM** -- application ID and client token in INITIAL_OPTIONS
- **Sentry** -- error monitoring proxied through `errors.figma.com`; DSN: `https://d1b12a8fbe424e4b956eb33cadd5b30d@errors.figma.com/api/sentry/56203`
- **Sprig** -- in-product survey iframe at `sprig.figma.com`
- **New Relic** -- on `forum.figma.com` only (agent ID 1103356138, account 554661)
- **Adora** -- `adora-cdn.com/adora-start.js` (148KB) on the marketing site. Adora is an rrweb-based session recording library, sending data to `c.adora-cdn.com` and `usw2-c.adora-cdn.com`. Early-stage vendor in the session recording space.
- **Vimeo** -- 5 video embeds on the homepage; Vimeo CDN and `player.vimeo.com` load on first visit

**Cookies set on first load (unauthenticated):**
- `ajs_anonymous_id` -- Segment anonymous ID, set as both localStorage and cookie on first marketing site hit
- `product_locale` -- locale preference ("en")
- `figma.session` -- Rails session cookie (app pages only)
- `__Host-figma.did` -- 1-year device ID, HttpOnly, Secure, SameSite=Lax

**Consent handling**: `consent_region: "implicit"` for US visitors -- analytics fire without explicit consent interaction. The signup page displays a consent notice referencing "sale" and "sharing for behavioral advertising" with an opt-out available, but trackers are not gated on that interaction. A per-page `tracking_session_id` is embedded in INITIAL_OPTIONS alongside the visitor's IP address.

**figment-proxy/identify**: Listed in the marketing site CSP connect-src but not observed firing in network logs for unauthenticated sessions. Likely fires post-login when Segment's `identify()` call maps a user ID. Because it runs on `figma.com`, the identity mapping call is indistinguishable from app traffic.

## Open Threads

- **"mystery", "velvet", "singapore"** in Figma Make's model picker: three internal aliases in the live config, with `mystery` enabled. No description, no label, no credit cost in the metering config. Routing alias, staging integration, or unreleased model -- not determinable from config alone.
- **"Jubilee" and "Campfire"**: both enabled behind provisional access. Campfire has cart logic and three access tiers; Jubilee has one flag and no visible config.
- **Adora scope**: session recording confirmed on the marketing site via CSP. Whether Adora also runs on the app backend (Rails-served pages) is not confirmed.
- **LaunchDarkly migration timeline**: `allow_migrating_ffs_to_statsig_in_admin` is enabled but migration is in progress. The LD client ID remains live and returns readable flag names. Duration until deprecation unknown.
- **registry.figma.com**: Returns 404 to unauthenticated root requests. Scope and package inventory inaccessible without auth.
- **api.figma.com/mcp methods**: Endpoint is live and requires authentication. Available methods are not documented in the public developer docs as of investigation date.

## Machine Briefing

### Access & auth

The marketing site (Next.js) requires no session. The app backend (Rails) sets a session cookie and device ID on any request -- no credentials needed to receive these, but they don't grant access. `api.figma.com` requires a bearer token for all endpoints except the 302 redirect; generate one in developer settings at figma.com.

### Endpoints

**Open (no auth):**

```
GET https://www.figma.com/api/geoip
# Returns: {"iso_country":"US","iso_region":"CA"}

POST https://www.figma.com/api/figment-proxy/page
POST https://www.figma.com/api/figment-proxy/monitor
# Body: arbitrary JSON or empty {}
# Returns: {"request_id":"<uuid>"}

GET https://www.figma.com/blogSearch/blog-data.json
# 4.2MB, 688 posts with title, slug, authors, publicationDate, labels, lede, cardMedia

GET https://www.figma.com/blogSearch/blog-index.json
# 1MB lunr.js search index for blog content

GET https://www.figma.com/<any-app-path>
# Returns HTML with <script type="application/json" data-initial> block
# INITIAL_OPTIONS and EARLY_ARGS -- works on 404 pages too

GET https://api.figma.com/v1/me
# Returns 403 "Invalid token" -- confirms endpoint expects bearer auth
# CORS: access-control-allow-origin: *
```

**Requires auth (developer token):**

```
GET https://api.figma.com/v1/files/{file_key}
GET https://api.figma.com/v1/files/{file_key}/components
GET https://api.figma.com/v1/me
# Headers: Authorization: Bearer <token>
# CORS *: any origin can make these calls

POST https://api.figma.com/mcp
Content-Type: application/json
Authorization: Bearer <token>
{"jsonrpc":"2.0","method":"<method>","params":{...},"id":1}
# Rate limit: 4 req/sec
```

**WebSocket (requires app session):**

```
wss://www.figma.com/api/livegraph
wss://www.figma.com/api/livegraph-next
# HTTP 426 without WebSocket upgrade
# Backoff: exponential, max 600s, spread 0.3
```

**Statsig SDK (with exposed key):**

```
POST https://featureassets.org/v1/initialize
Content-Type: application/json
{"sdkKey":"client-CIbRGW8h7lTl7wjJTyKWmPVXuJai3B8xe7llhBQmjJX","user":{"userID":""},"statsigMetadata":{}}
# Returns 769KB with 2,940 gates (names hashed) and 485 dynamic configs
```

### Gotchas

- INITIAL_OPTIONS is on the Rails app backend pages only -- not on Next.js marketing pages. Hit `/files/`, `/community/`, or any app path (including nonexistent ones) to get it.
- Feature flag names in INITIAL_OPTIONS are readable. Statsig API gates are SHA-hashed -- use INITIAL_OPTIONS for enumeration, not featureassets.org.
- `figment-proxy` endpoints accept empty body and return `request_id` without error. Whether they forward to Segment or just acknowledge is not confirmed.
- `api.figma.com` CORS is `*` -- callable cross-origin from any page. Response headers include `X-Figma-Plan-Tier` and `X-Figma-Rate-Limit-Type`, readable from cross-origin responses.
- Marketing site CSP includes `staging.figma.com/api/figment-proxy/*` -- staging analytics endpoints are reachable.
- `user_ip` in INITIAL_OPTIONS is server-side resolved, not client-reported.
