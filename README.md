# /teardown

Tearing down websites to find creep & slop.

A Claude Code skill that audits a site end-to-end: architecture, API surface, trackers, dark patterns, and what's exposed. Read-only browser automation. No exploitation, no modification.

## Run a Teardown

Prerequisites: [Claude Code](https://claude.ai/code)

> **Model note:** The agent prompts are model-agnostic and can run with open-weight models. Quick experiments with [Gemma 4 26B](https://ollama.com/library/gemma4:26b) and [Qwen3-Coder 30B](https://ollama.com/library/qwen3-coder:30b) completed basic recon but missed the deeper findings.

```sh
git clone https://github.com/hayabhay/teardown
cd teardown
claude                 # start Claude Code
/teardown example.com  # run a teardown
```

By default the report includes full values — API keys, tokens, IDs, everything observed — so you can fix what you find. If you plan to share the report externally, add `--redact` to sanitize the output before writing:

```sh
/teardown example.com --redact
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
3. **Editor** — rewrites headline and findings for clarity, reranks by significance, writes the final report to `reports/{domain}/teardown.md`.

A typical teardown takes 15-30 minutes and produces a 2,000-4,000 word report.

## Rules of Engagement

Agents are explicitly instructed to follow three hard rules:

1. **Read-only** — no writing, deleting, or submitting data. No modification or damage.
2. **No targeting other users** — your test account is your boundary.
3. **No flooding** — if missing rate limits are found, they're documented, not exploited.

This makes it safe to run against your own infrastructure. It will surface misconfigurations, leaky endpoints, and forgotten debug tools — without causing any damage. That's the point: find the issues, then fix them.

## Responsible Disclosure

If you use this as a research tool — auditing sites you don't own to study architecture, trackers, or consumer-facing patterns — and stumble onto something that could cause real harm (leaked credentials with elevated access, exposed PII, a vulnerability someone could actually exploit), follow the norms of responsible security research:

1. **Make sure it's real.** Client-side tokens, public APIs, and standard analytics aren't vulnerabilities.
2. **Look for a security contact.** Check `/.well-known/security.txt` or a bug bounty page.
3. **Drop them a note.** A quick email before anything goes public goes a long way.

The goal is to shed light, not to cause damage.

## What's in a Report

Each report has YAML frontmatter (stack, trackers, findings) and a detailed prose body covering architecture, surveillance, API surface, and surprises.

Reports are Markdown files. Machines can consume them directly.

## Structure

```
reports/{domain}/teardown.md   — teardown reports
.claude/agents/              — investigator, analyst agent definitions
.claude/skills/teardown/     — /teardown skill definition
scripts/                     — recon.js, parse-network.js, extract-urls.js
local/{domain}/     — raw investigation evidence (gitignored)
```

## License

MIT.
