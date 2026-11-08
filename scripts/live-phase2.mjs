// Phase 2 only: reads the signed-in credential saved by live-e2e.mjs and
// runs usage, the account's own listing, and one real chat completion.
import { readFileSync } from "node:fs"
const m = await import("../index.mjs")
const { protocol, _internal } = m
const site = _internal.SITES["qwenwork-intl"]
const cred = JSON.parse(readFileSync("/tmp/qw-intl-cred.json", "utf8"))
const auth = { ...cred, type: "oauth" } // the host stores type "oauth" on the record
console.log("account:", auth.accountId, "| identity:", auth.identity, "| teamId:", auth.teamId ? auth.teamId.slice(0, 8) + "…" : "(none)")

const getAuth = async () => auth
const calls = []
const stubClient = {
  auth: { set: async (x) => { calls.push(x) }, get: async () => auth, all: async () => ({ [site.id]: auth }) },
  providers: { list: async () => [] },
}
const p = await m.QwenWorkIntlAuthPlugin({ client: stubClient })

console.log("\n--- 1. usage (account-context + biz identity) ---")
try {
  const u = await p.auth.usage(getAuth)
  console.log(JSON.stringify(u, null, 1))
} catch (e) { console.log("usage threw:", e.message) }

console.log("\n--- 2. the account's OWN qwork listing (enable flags) ---")
try {
  const s = protocol.siteOf(site, auth)
  const cat = await _internal.fetchListing(s, auth)
  for (const r of cat.qwork ?? []) {
    console.log(JSON.stringify({ key: r.key, name: r.display_name, enable: r.enable, is_default: r.is_default, price_factor: r.price_factor, is_free: r.is_free }))
  }
} catch (e) { console.log("listing threw:", e.message) }

console.log("\n--- 3. provider.models through the plugin hook ---")
try {
  const got = await p.provider.models({ models: {} }, { auth })
  const ids = Object.keys(got)
  console.log("model ids:", ids.join(", "))
  for (const id of ids) console.log("  ", id, "->", JSON.stringify({ name: got[id].name, attachment: got[id].attachment, context: got[id].limit?.context, reasoning: got[id].reasoning }))
} catch (e) { console.log("provider.models threw:", e.message) }

console.log("\n--- 4. ONE REAL CHAT on qwork-auto ---")
try {
  const loaded = await p.auth.loader(getAuth)
  console.log("loader baseURL:", loaded.baseURL, "| fetch:", typeof loaded.fetch)
  const body = { model: "qwork-auto", messages: [{ role: "system", content: "You are QwenWork (qw), a helpful assistant." }, { role: "user", content: "Reply with exactly this sentence and nothing else: QWENWORK_GLOBAL_E2E_OK" }], stream: false }
  const t0 = Date.now()
  const res = await loaded.fetch(loaded.baseURL + "/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", "x-deepseek-harness-session-id": "intl-verify-" + Date.now() },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  console.log("HTTP", res.status, "in", Date.now() - t0, "ms")
  let j = null; try { j = JSON.parse(text) } catch {}
  if (j?.choices?.[0]) {
    console.log("content:", JSON.stringify(j.choices[0].message?.content ?? j.choices[0].text))
    console.log("finish:", j.choices[0].finish_reason, "| model:", j.model, "| usage:", JSON.stringify(j.usage))
  } else {
    console.log("body:", text.slice(0, 900))
  }
  if (calls.length) console.log("(token set-backs during run:", calls.length, ")")
} catch (e) { console.log("chat threw:", e.message) }
console.log("\nPHASE2 DONE")
