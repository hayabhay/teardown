// recon.js — browser-side page state collector
// Usage: npx @playwright/cli -s={domain} eval "$(cat scripts/recon.js)"
// Saves nothing — returns JSON to stdout. Caller decides where to write it.
;(() => {
  const trunc = (s, n = 200) =>
    typeof s !== "string" ? String(s) : s.length > n ? s.slice(0, n) + `...[${s.length}]` : s

  // Detect builtins by diffing against a clean window
  const builtins = (() => {
    try {
      const f = document.createElement("iframe")
      f.style.display = "none"
      document.body.appendChild(f)
      const keys = new Set(Object.getOwnPropertyNames(f.contentWindow))
      document.body.removeChild(f)
      return keys
    } catch {
      // Fallback: just grab everything, caller can filter
      return new Set()
    }
  })()

  // Summarize a value — structure and size, not full content
  const summarize = (val, depth = 0) => {
    if (val == null) return null
    const t = typeof val
    if (t === "string") return trunc(val, 120)
    if (t === "number" || t === "boolean") return val
    if (t === "function") return `[fn: ${val.name || "anon"}]`
    if (t === "symbol") return val.toString()
    if (Array.isArray(val)) {
      if (depth > 1) return `[array: ${val.length}]`
      return { _arr: val.length, items: val.slice(0, 5).map((v) => summarize(v, depth + 1)) }
    }
    if (t === "object") {
      try {
        const keys = Object.keys(val)
        if (depth > 1) return `[obj: ${keys.length} keys]`
        if (keys.length > 30)
          return { _keys: keys.length, sample: keys.slice(0, 15), last: keys.slice(-5) }
        const shape = {}
        for (const k of keys) {
          try {
            shape[k] = summarize(val[k], depth + 1)
          } catch {
            shape[k] = "[error]"
          }
        }
        return shape
      } catch {
        return "[unreadable object]"
      }
    }
    return `[${t}]`
  }

  // --- Globals ---
  const globals = {}
  for (const key of Object.getOwnPropertyNames(window)) {
    if (builtins.has(key)) continue
    try {
      globals[key] = summarize(window[key])
    } catch {
      globals[key] = "[access denied]"
    }
  }

  // --- Cookies ---
  const cookies = document.cookie
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const eq = c.indexOf("=")
      return eq > 0 ? { name: c.slice(0, eq), value: trunc(c.slice(eq + 1), 100) } : { name: c }
    })

  // --- Storage ---
  const readStorage = (store) => {
    const out = {}
    try {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i)
        out[k] = trunc(store.getItem(k), 200)
      }
    } catch {}
    return out
  }

  // --- DOM signals ---
  const meta = [...document.querySelectorAll("meta")]
    .map((m) => [m.name || m.getAttribute("property") || m.getAttribute("http-equiv"), m.content])
    .filter(([k, v]) => k && v)

  const preconnects = [...document.querySelectorAll('link[rel="preconnect"], link[rel="dns-prefetch"]')]
    .map((l) => l.href)
    .filter(Boolean)

  const scriptTags = [...document.querySelectorAll("script")]
    .map((s) => {
      if (s.src) return { src: s.src }
      const txt = s.textContent.trim()
      if (!txt) return null
      return { type: s.type || null, inline: trunc(txt, 300) }
    })
    .filter(Boolean)

  // --- Data layers ---
  const dataLayerKeys = [
    "dataLayer", "analyticsData", "_satellite", "utag", "utag_data",
    "digitalData", "adobeDataLayer", "tc_vars", "s", "ga",
  ]
  const dataLayers = {}
  for (const k of dataLayerKeys) {
    if (window[k] != null) {
      try { dataLayers[k] = summarize(window[k], 0) } catch {}
    }
  }

  // --- Frameworks ---
  const fw = []
  if (window.__NEXT_DATA__) fw.push("Next.js")
  if (window.__NUXT__ || window.__nuxt) fw.push("Nuxt")
  if (window.__GATSBY) fw.push("Gatsby")
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || document.querySelector("[data-reactroot]")) fw.push("React")
  if (window.__VUE__ || document.querySelector("[data-v-]")) fw.push("Vue")
  if (window.angular || window.getAllAngularRootElements) fw.push("Angular")
  if (window.__svelte_devtools || document.querySelector("[class*='svelte-']")) fw.push("Svelte")
  if (window.Ember) fw.push("Ember")
  if (window.webpackChunk || window.__webpack_modules__) fw.push("Webpack")
  if (document.querySelector("[data-turbo]")) fw.push("Turbo")
  if (document.querySelector("script[src*='astro']") || window.__astro_env__) fw.push("Astro")

  // --- Links ---
  const internal = new Set()
  const external = new Set()
  const origin = location.origin
  document.querySelectorAll("a[href]").forEach((a) => {
    try {
      const u = new URL(a.href, origin)
      if (u.origin === origin) internal.add(u.pathname)
      else external.add(u.origin)
    } catch {}
  })

  // --- Iframes ---
  const iframes = [...document.querySelectorAll("iframe")]
    .map((f) => f.src)
    .filter((s) => s && !s.startsWith("about:"))

  return JSON.stringify({
    url: location.href,
    title: document.title,
    ts: new Date().toISOString(),
    globals,
    cookies,
    localStorage: readStorage(localStorage),
    sessionStorage: readStorage(sessionStorage),
    meta,
    preconnects,
    scripts: scriptTags,
    dataLayers,
    frameworks: fw,
    links: { internal: [...internal].sort(), external: [...external].sort() },
    iframes,
  }, null, 2)
})()