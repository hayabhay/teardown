---
description: Reverse-engineer any website — spawns investigation, analyst, and editor agents to produce a published teardown report.
argument-hint: <site> [--resume] [--note "..."] [--investigator "model effort"] [--analyst "model effort"] [--editor "model effort"]
allowed-tools: Agent, Read, Bash, SendMessage
---

# Teardown

You are the teardown orchestrator. Parse `$ARGUMENTS` for:
- **target** — site URL, domain, or company name (required)
- **`--resume`** — resume a previous investigation. Pass `Mode: resume` to the investigator. Default is fresh start.
- **`--note "..."`** — custom instructions passed to all agents (e.g., "check their checkout flow", "focus on mobile experience").
- **`--investigator "model effort"`** — override model and effort for the investigator. Default: sonnet high.
- **`--analyst "model effort"`** — override model and effort for the analyst. Default: sonnet high.
- **`--editor "model effort"`** — override model and effort for the editor. Default: opus high.

Each agent flag takes a quoted string of `"model effort"` (e.g., `"opus max"`, `"haiku low"`). Model is one of: opus, sonnet, haiku. Effort is one of: max, high, medium, low. If only model is given, effort stays at the agent's default.

If an agent flag is passed, add `model: "{model}"` and/or `effort: "{effort}"` to that agent's Agent call. If no flag, agents run their frontmatter defaults.

**Pass ONLY the prompt templates below to each agent. Do not add context from the current conversation.**

## Step 1 — Investigation

Spawn the `teardown-investigator` agent:

```
Agent({
  name: "investigator-{domain}",
  description: "Teardown {target}",
  prompt: "Target: {target}\nDomain: {domain}\nMode: {fresh|resume}\n{If note: 'Note: {note}\n'}",
  subagent_type: "teardown-investigator",
  mode: "auto"
})
```

Wait for it to return. **Do not spawn the analyst yet.** Verify the investigator's output:

1. Run `wc -l local/{domain}/notes.md` — if missing or under 50 lines, send the investigator: "You didn't write notes.md. Write your full investigation notes to `local/{domain}/notes.md` now."
2. Run `ls local/{domain}/evidence/` — if the directory is missing or empty, send the investigator: "Evidence files must be in `local/{domain}/evidence/`, not `local/{domain}/`. Move them or re-save."
3. Wait for the investigator to confirm, then re-check.

If notes.md still doesn't exist after a retry, tell the user and stop. Don't spawn the analyst on missing notes.

## Step 2 — Write & Review

Spawn the `teardown-analyst` agent:

```
Agent({
  name: "analyst-{domain}",
  description: "Write teardown {domain}",
  prompt: "Domain: {domain}\nModel: {model}\n{If note: 'Note: {note}\n'}",
  subagent_type: "teardown-analyst",
  mode: "auto"
})
```

Wait for it to return. **Do not spawn the editor yet.** Verify the analyst's output:

1. Run `wc -l local/{domain}/review.md` — if missing, send the analyst: "You didn't write review.md. Write your editorial review now."
2. Run `wc -l local/{domain}/draft.md` — if missing, send the analyst: "You didn't write draft.md. Write the report body to `local/{domain}/draft.md` now."
3. Check that `reports/{domain}/teardown.md` was NOT written by the analyst. If it was, delete it — the editor writes the final version.
4. Wait for the analyst to confirm, then re-check.

## Step 3 — Editor

Spawn the `teardown-editor` agent:

```
Agent({
  name: "editor-{domain}",
  description: "Edit teardown {domain}",
  prompt: "Domain: {domain}\nModel: {investigator-model}\n{If note: 'Note: {note}\n'}",
  subagent_type: "teardown-editor",
  mode: "auto"
})
```

Wait for it to return. Verify the editor's output:

1. Run `wc -l reports/{domain}/teardown.md` — if missing, send the editor: "You didn't write the final report. Write it to `reports/{domain}/teardown.md` now."
2. Wait for the editor to confirm, then re-check.

If `teardown.md` still doesn't exist after a retry, tell the user.

## Step 4 — Dismiss & Index

Dismiss all agents:

```
SendMessage({ to: "investigator-{domain}", message: "Investigation complete. Close the browser session and exit." })
SendMessage({ to: "analyst-{domain}", message: "Report complete. Exit." })
SendMessage({ to: "editor-{domain}", message: "Edit complete. Exit." })
```

Relay the editor's headline and top 2-3 findings to the user. Don't re-summarize — let the findings speak.
