# /teardown

Tearing down websites to find human creep & slop — for machines, by machines.

AI-generated teardown reports documenting how websites are built — architecture, API surface, tracking, and what's exposed. Read-only reconnaissance using browser automation. No exploitation, no modification.

> Reports are published at [teardown.fyi](https://teardown.fyi). This repo contains the raw data — reports, investigation agents, and scripts.

## Run a Teardown

Prerequisites: [Claude Code](https://claude.ai/code)

> **Model note:** The agent prompts are model-agnostic and can run with open-weight models. Quick experiments with [Gemma 4 26B](https://ollama.com/library/gemma4:26b) and [Qwen3-Coder 30B](https://ollama.com/library/qwen3-coder:30b) completed basic recon but missed the deeper findings. Benchmarking is welcome and appreciated.

```sh
git clone https://github.com/hayabhay/teardown
cd teardown
claude                 # start Claude Code
/teardown example.com  # run a teardown
```

To run multiple teardowns in parallel without an interactive session (or ask Claude to do it):

```sh
# --model sets the orchestrator; each agent picks its own model
claude -p --model sonnet "/teardown site1.com" &
claude -p --model sonnet "/teardown site2.com" &
claude -p --model sonnet "/teardown site3.com" &
```

The `/teardown` skill orchestrates a three-agent pipeline:

1. **Investigator** — browses the target site with Playwright, collects network traffic, extracts globals/cookies/storage, probes APIs, maps the attack surface. Writes raw notes to `local/{domain}/`.
2. **Analyst** — reads the investigator's notes, vets every claim against evidence, connects threads across findings, and writes the draft report.
3. **Editor** — rewrites headline and findings for clarity, reranks by significance, publishes to `reports/{domain}/teardown.md`.

A typical teardown takes 15-30 minutes and produces a 2,000-4,000 word report.

## Rules of Engagement

Agents are explicitly instructed to follow three hard rules:

1. **Read-only** — no writing, deleting, or submitting data. No modification or damage.
2. **No targeting other users** — your test account is your boundary.
3. **No flooding** — if missing rate limits are found, they're documented, not exploited.

This makes it safe to run against your own infrastructure. It will surface misconfigurations, leaky endpoints, and forgotten debug tools — without causing any damage. That's the point: find the issues, then fix them.

## Responsible Disclosure

Teardowns document publicly accessible behavior — nothing here requires breaking in. But if you stumble on something that could cause real harm — leaked credentials with elevated access, exposed PII, a vulnerability someone could actually exploit — be a good citizen and consider giving the company a heads up:

1. **Make sure it's real.** Client-side tokens, public APIs, and standard analytics aren't vulnerabilities.
2. **Look for a security contact.** Check `/.well-known/security.txt` or a bug bounty page.
3. **Drop them a note.** A quick email before the finding goes public goes a long way.
4. **Mention it in your PR.** Note that you reached out and whether you heard back.

The goal is to shed light, not to cause damage.

## What's in a Report

Each report has YAML frontmatter (stack, trackers, findings) and a detailed prose body covering architecture, surveillance, API surface, and surprises. Example findings:

- *"Spirit's CMS API exposes 184 production feature flags without authentication — including enableFakeBlockedMiddleSeats, a disabled toggle for a fake seat-scarcity UI."*
- *"Every DailyMail+ paywalled article ships its full text in the HTML — the paywall is CSS that hides content your browser already downloaded"*
- *"Browsing a depression or diabetes page tags your ad profile with health-condition labels sent to 20+ bidders — most visitors never see a consent prompt."*

Reports are Markdown files. Machines can consume them directly — that's the point.

## Machine Briefing

Every report ends with a **Machine Briefing** section — actionable endpoints, access notes, and gotchas documented so agents can build against sites that haven't opened their doors.

Works with [OpenClaw](https://openclaw.ai/), [Claude Code](https://claude.ai/code), or any AI agent that can read markdown.

### Endpoints (on [teardown.fyi](https://teardown.fyi))

| Endpoint | What |
|----------|------|
| [`/llms.txt`](https://teardown.fyi/llms.txt) | Agent entry point — report index + usage instructions ([llmstxt.org](https://llmstxt.org)) |
| [`/llms-full.txt`](https://teardown.fyi/llms-full.txt) | All reports concatenated (feed to agent for multi-site context) |
| [`/index.json`](https://teardown.fyi/index.json) | Full metadata — stack, trackers, findings, industry (JSON) |
| [`/feed.xml`](https://teardown.fyi/feed.xml) | Atom feed |
| `/reports/{domain}/teardown.md` | Individual report (Markdown + YAML frontmatter) |

## Structure

```
reports/{domain}/teardown.md   — published teardown reports
.claude/agents/              — investigator, analyst agent definitions
.claude/skills/teardown/     — /teardown skill definition
scripts/                     — recon.js, parse-network.js, extract-urls.js
local/{domain}/     — raw investigation evidence (gitignored)
```

## Contributing

Run a teardown, submit the report via PR. Reports must follow the schema and evidence standards — raw evidence stays local, only the final `.md` is committed. See [CONTRIBUTING.md](.github/CONTRIBUTING.md) for details.

## License

MIT.
