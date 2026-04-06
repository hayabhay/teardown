#!/usr/bin/env node
// extract-urls.js — extract and group URLs by pattern from various sources
//
// Usage:
//   node scripts/extract-urls.js <file> [--domain=x.com]
//
// Accepts:
//   - Recon JSON (from recon.js) — extracts links.internal, links.external, preconnects, script srcs
//   - Sitemap XML — extracts <loc> tags
//   - HTML — extracts href, src, action attributes
//   - Plain text — treats each line as a URL
//
// Groups internal paths by pattern, shows count + examples per group.
// The investigator reads this to decide which page types to visit.

import { readFileSync } from "fs"

const file = process.argv[2]
const domainArg = process.argv.find((a) => a.startsWith("--domain="))
const domain = domainArg ? domainArg.split("=")[1] : null

if (!file) {
  console.error("Usage: node extract-urls.js <file> [--domain=x.com]")
  process.exit(1)
}

const raw = readFileSync(file, "utf8")

// --- Extract URLs based on file type ---
let internal = []
let external = []

if (file.endsWith(".json")) {
  try {
    const data = JSON.parse(raw)
    // Recon JSON format
    if (data.links) {
      internal = data.links.internal || []
      external = data.links.external || []
    }
    // Also grab script srcs and preconnects
    if (data.scripts) {
      for (const s of data.scripts) {
        if (s.src) external.push(s.src)
      }
    }
    if (data.preconnects) {
      external.push(...data.preconnects)
    }
    if (data.iframes) {
      external.push(...data.iframes)
    }
  } catch {
    // Not valid JSON, treat as line-per-URL
    internal = raw.split("\n").filter((l) => l.trim())
  }
} else if (raw.includes("<urlset") || raw.includes("<sitemapindex")) {
  // Sitemap XML
  const locs = [...raw.matchAll(/<loc>\s*(.*?)\s*<\/loc>/g)].map((m) => m[1])
  for (const url of locs) {
    try {
      const u = new URL(url)
      if (domain && (u.hostname === domain || u.hostname.endsWith("." + domain))) {
        internal.push(u.pathname)
      } else if (!domain) {
        internal.push(u.pathname)
      } else {
        external.push(url)
      }
    } catch {
      internal.push(url)
    }
  }
} else if (raw.includes("<html") || raw.includes("<!DOCTYPE") || raw.includes("<a ")) {
  // HTML — extract href, src, action
  const urlAttrs = [...raw.matchAll(/(?:href|src|action)=["']([^"']+)["']/gi)].map((m) => m[1])
  for (const url of urlAttrs) {
    if (url.startsWith("http")) {
      try {
        const u = new URL(url)
        if (domain && (u.hostname === domain || u.hostname.endsWith("." + domain))) {
          internal.push(u.pathname)
        } else {
          external.push(url)
        }
      } catch {}
    } else if (url.startsWith("/")) {
      internal.push(url)
    }
  }
} else {
  // Plain text — one URL per line (handles "Sitemap: url", "Disallow: /path", bare URLs)
  for (const line of raw.split("\n")) {
    const cleaned = line.replace(/^(?:Sitemap|Disallow|Allow|Host):\s*/i, "").trim()
    const url = cleaned
    if (!url || url.startsWith("#")) continue
    if (url.startsWith("http")) {
      try {
        const u = new URL(url)
        if (domain && (u.hostname === domain || u.hostname.endsWith("." + domain))) {
          internal.push(u.pathname)
        } else {
          external.push(url)
        }
      } catch {}
    } else if (url.startsWith("/")) {
      internal.push(url)
    }
  }
}

// Dedupe
internal = [...new Set(internal)].sort()
external = [...new Set(external)].sort()

// --- Group internal paths by pattern ---
// Strategy: group by first path segment, then show depth distribution
const groups = {}
for (const path of internal) {
  const segments = path.split("/").filter(Boolean)
  const prefix = "/" + (segments[0] || "")
  if (!groups[prefix]) groups[prefix] = []
  groups[prefix].push(path)
}

const out = []

// Internal paths grouped
const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length)
out.push(`=== Internal paths (${internal.length} unique, ${sorted.length} groups) ===`)
for (const [prefix, paths] of sorted) {
  if (paths.length === 1) {
    out.push(`  ${paths[0]}`)
  } else {
    // Show count + a few examples
    const depths = paths.map((p) => p.split("/").filter(Boolean).length)
    const minD = Math.min(...depths)
    const maxD = Math.max(...depths)
    const depthInfo = minD === maxD ? `depth ${minD}` : `depth ${minD}-${maxD}`
    out.push(`  ${prefix}/* — ${paths.length} URLs (${depthInfo})`)
    // Show up to 3 examples, picking diverse ones
    const examples = paths.slice(0, 3)
    examples.forEach((p) => out.push(`    ${p}`))
    if (paths.length > 3) out.push(`    ... and ${paths.length - 3} more`)
  }
}

// External domains
if (external.length) {
  const extDomains = {}
  for (const url of external) {
    try {
      const u = new URL(url)
      if (!extDomains[u.hostname]) extDomains[u.hostname] = 0
      extDomains[u.hostname]++
    } catch {
      if (!extDomains["(other)"]) extDomains["(other)"] = 0
      extDomains["(other)"]++
    }
  }
  const sortedExt = Object.entries(extDomains).sort((a, b) => b[1] - a[1])
  out.push("")
  out.push(`=== External domains (${sortedExt.length}) ===`)
  sortedExt.forEach(([d, n]) => out.push(`  ${d} (${n})`))
}

console.log(out.join("\n"))
