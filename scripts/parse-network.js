#!/usr/bin/env node
// parse-network.js — structure Playwright CLI network output for analysis
// Usage: node scripts/parse-network.js <domain> < network-log.txt
// Or:   npx @playwright/cli -s=x.com network | node scripts/parse-network.js x.com
//
// Splits requests into first-party vs third-party (by domain) and
// endpoints vs assets (by file extension). No editorial judgment —
// the investigator decides what's a tracker, what's interesting.
import { readFileSync } from "fs"

const domain = process.argv[2]
if (!domain) {
  console.error("Usage: node parse-network.js <domain> < network-log.txt")
  process.exit(1)
}

const input = readFileSync("/dev/stdin", "utf8")
const lines = input.split("\n").filter((l) => l.match(/^\[/))

const isFirstParty = (hostname) => hostname === domain || hostname.endsWith("." + domain)

const ASSET_EXT = /\.(js|css|woff2?|ttf|eot|svg|png|jpe?g|gif|webp|avif|ico|mp4|webm|mpd|m3u8|m4s|ts)(\?|$)/i

// Parse
const requests = lines
  .map((line) => {
    const m = line.match(/^\[(\w+)\]\s+(\S+)\s+=>\s+\[(\d+)\]/)
    if (!m) return null
    const [, method, url, status] = m
    try {
      const u = new URL(url)
      return { method, status: +status, hostname: u.hostname, pathname: u.pathname }
    } catch {
      return { method, status: +status, hostname: "?", pathname: url }
    }
  })
  .filter(Boolean)

// Dedupe: method + hostname + pathname
const dedup = (arr) => {
  const seen = new Map()
  for (const r of arr) {
    const key = `${r.method} ${r.hostname}${r.pathname}`
    if (!seen.has(key)) seen.set(key, { ...r, count: 1 })
    else seen.get(key).count++
  }
  return [...seen.values()]
}

const shortUrl = (r, showHost) => {
  const host = showHost ? r.hostname : ""
  const path = r.pathname.length > 80 ? r.pathname.slice(0, 77) + "..." : r.pathname
  const count = r.count > 1 ? ` (x${r.count})` : ""
  return `  ${r.method} ${host}${path} => ${r.status}${count}`
}

// Split
const firstParty = requests.filter((r) => isFirstParty(r.hostname))
const thirdParty = requests.filter((r) => !isFirstParty(r.hostname))

const fpEndpoints = dedup(firstParty.filter((r) => !ASSET_EXT.test(r.pathname)))
const fpAssets = firstParty.filter((r) => ASSET_EXT.test(r.pathname))
const tpByDomain = {}
for (const r of thirdParty) {
  if (!tpByDomain[r.hostname]) tpByDomain[r.hostname] = []
  tpByDomain[r.hostname].push(r)
}

// Output
const out = []

if (fpEndpoints.length) {
  out.push(`=== First-party endpoints (${fpEndpoints.length} unique) ===`)
  fpEndpoints.forEach((r) => out.push(shortUrl(r, false)))
  out.push("")
}

if (fpAssets.length) {
  out.push(`=== First-party assets: ${fpAssets.length} requests ===`)
  out.push("")
}

const sortedDomains = Object.entries(tpByDomain).sort((a, b) => b[1].length - a[1].length)
if (sortedDomains.length) {
  out.push(`=== Third-party domains (${sortedDomains.length}) ===`)
  for (const [host, reqs] of sortedDomains) {
    const endpoints = dedup(reqs.filter((r) => !ASSET_EXT.test(r.pathname)))
    const assets = reqs.filter((r) => ASSET_EXT.test(r.pathname))
    const parts = []
    if (endpoints.length) parts.push(`${endpoints.length} endpoint${endpoints.length > 1 ? "s" : ""}`)
    if (assets.length) parts.push(`${assets.length} asset${assets.length > 1 ? "s" : ""}`)
    out.push(`  ${host} — ${parts.join(", ")} (${reqs.length} total)`)
    endpoints.forEach((r) => {
      const path = r.pathname.length > 60 ? r.pathname.slice(0, 57) + "..." : r.pathname
      const count = r.count > 1 ? ` (x${r.count})` : ""
      out.push(`    ${r.method} ${path} => ${r.status}${count}`)
    })
  }
  out.push("")
}

out.push(
  `Total: ${requests.length} requests — ${firstParty.length} first-party (${fpEndpoints.length} endpoints, ${fpAssets.length} assets), ${thirdParty.length} third-party (${sortedDomains.length} domains)`,
)

console.log(out.join("\n"))
