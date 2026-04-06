# Contributing a Teardown

## Quick Start

1. Fork this repo
2. Run the teardown skill on a site:
   ```
   /teardown example.com
   ```
   This generates a report at `reports/example.com/teardown.md`
3. Submit a PR

## Using the Skill

The teardown skill lives in `.claude/skills/teardown/SKILL.md`. It works with Claude Code — just invoke `/teardown <domain>` and it handles the investigation, writing, and validation.

If you're not using Claude Code, you can write a report manually. Follow the frontmatter schema in `prompts/schema.md` and use existing reports in `reports/` as reference.

## Report Quality

Reports should be evidence-backed. Every claim should reference something you directly observed — a network call, a config value, a DOM element. If you didn't verify it, don't state it as fact.

### Frontmatter Checklist

- `industry` is NAICS-based (see `prompts/schema.md` for allowed values)
- `description` is one short sentence — what the company is
- `stack` items are 1-3 words each
- `trackers` are verified only, 1-3 words each
- `headline` is one sentence — a specific discovery, not an architecture summary
- `findings` has 3-5 items — surprising things, not standard framework behavior

## What Makes a Good Teardown

- Misconfigurations (WAF gaps, exposed endpoints, missing auth)
- Surveillance depth (tracker count, data layer profiling, cookie sprawl)
- Architecture surprises (multiple frontends, hidden services, legacy systems)
- Business intel (feature flags, unreleased products, vendor sprawl)

## Rules

- Read-only investigation. Don't modify or submit data to the target site.
- Don't target other users' data or sessions.
- Pace your requests. Don't flood endpoints.
