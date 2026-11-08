// Live verification of the qwenwork-intl site with a real global account.
// Phase 1: the device flow (writes the URL, then polls until authorized).
// Phase 2: with the device token — usage, signed model listing, one chat.
import { writeFileSync, chmodSync } from "node:fs"

const m = await import("../index.mjs")
const { protocol, _internal } = m
const site = _internal.SITES["qwenwork-intl"]
const URL_FILE = "/tmp/qw-intl-signin-url.txt"
const CRED_FILE = "/tmp/qw-intl-cred.json"
const mask = (s) => { s = String(s ?? ""); return s ? s.slice(0, 6) + "…" + s.slice(-4) + " (" + s.length + " chars)" : "(none)" }
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

const si = await protocol.deviceSignIn(site)
writeFileSync(URL_FILE, si.url)
chmodSync(URL_FILE, 0o600)
log("SIGN-IN URL written to " + URL_FILE)
log("url:", si.url.slice(0, 120) + "…")

log("polling for authorization…")
let cred
try {
  cred = await si.callback()
} catch (e) {
  log("POLL FAILED:", e.message)
  process.exit(1)
}
writeFileSync(CRED_FILE, JSON.stringify(cred, null, 2))
chmodSync(CRED_FILE, 0o600)
log("AUTHORIZED. accountId:", cred.accountId, "| email:", cred.email || "(none)", "| name:", cred.name || "(none)")
log("deviceToken:", mask(cred.deviceToken), "| refresh:", mask(cred.deviceRefresh))
log("chat access:", mask(cred.access), "| expires:", cred.expires, "| deviceChat:", cred.deviceChat, "| uid:", cred.uid, "| identity:", cred.identity || "(personal)")

// the device flow returns type: "success"; the host stores what the hooks
// check as an oauth record — the order here matters, cred.type must not win
const auth = { ...cred, type: "oauth" }
const getAuth = async () => auth
const stubClient = { auth: { set: async () => {}, get: async () => auth, all: async () => ({ [site.id]: auth }) }, providers: { list: async () => [] } }
const p = await m.QwenWorkIntlAuthPlugin({ client: stubClient })

console.log("\n=================== PHASE 2 ===================")

console.log("\n--- 1. usage (account-context) ---")
try {
  const u = await p.auth.usage(getAuth)
  console.log(JSON.stringify(u, null, 1))
} catch (e) {
  console.log("usage FAILED:", e.message)
}

console.log("\n--- 2. signed model listing (fetchListing, scene qwork) ---")
let listing
try {
  const s = protocol.siteOf(site, auth)
  listing = await _internal.fetchListing(s, auth)
  const rows = Array.isArray(listing?.qwork) ? listing.qwork : []
  console.log("keys in response:", Object.keys(listing ?? {}).join(", "))
  console.log("qwork models:", rows.length)
  for (const r of rows) console.log("   ", JSON.stringify({ key: r.key, name: r.display_name, vl: r.is_vl, think: r.is_reasoning, in: r.max_input_tokens, price: r.price ?? r.rate ?? undefined }))
} catch (e) {
  console.log("listing FAILED:", e.message, e?.status ?? "")
}

console.log("\n--- 3. provider.models through the plugin's own hook ---")
try {
  const provider = { models: {} }
  const got = await p.provider.models(provider, { auth })
  console.log(JSON.stringify(got, null, 1).slice(0, 1800))
} catch (e) {
  console.log("provider.models FAILED:", e.message)
}

console.log("\n--- 4. one real chat completion (loader fetch) ---")
const pick = (Array.isArray(listing?.qwork) && listing.qwork[0]?.key) || "flash"
try {
  const loaded = await p.auth.loader(getAuth)
  console.log("loader:", loaded.baseURL, "| apiKey:", loaded.apiKey, "| fetch:", typeof loaded.fetch)
  const body = { model: pick, messages: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: "Reply with exactly this sentence and nothing else: QWENWORK_GLOBAL_E2E_OK" }], stream: false }
  const t0 = Date.now()
  const res = await loaded.fetch(loaded.baseURL + "/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "x-deepseek-harness-session-id": "verify-" + Date.now() },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  console.log("HTTP", res.status, "in", Date.now() - t0, "ms")
  console.log("response:", text.slice(0, 1500))
} catch (e) {
  console.log("chat FAILED:", e.message, e?.cause?.message ?? "")
}

console.log("\nDONE")
