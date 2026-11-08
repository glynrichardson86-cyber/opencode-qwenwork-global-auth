// Checks the qwenwork-intl site against the live global gateway, without an
// account: the site's own fields, the headers it sends, and the device flow's
// first step. Run: node scripts/verify.mjs
//
// What it proves is that gateway.qwenwork.ai takes this site's client id and
// deep-link scheme and answers the sign-in page; only a real global account
// can prove the poll, the model list and a chat.
import { strict as assert } from "node:assert"

const m = await import("../index.mjs")
const { protocol, _internal } = m
const site = _internal.SITES["qwenwork-intl"]
const cn = _internal.SITES["qwenwork"]

let pass = 0
const ok = (what, cond, extra = "") => {
  assert.ok(cond, "FAILED: " + what + (extra ? " — " + extra : ""))
  pass++
  console.log("  ok  " + what + (extra ? "  (" + extra + ")" : ""))
}

console.log("site preset")
ok("id is qwenwork-intl", site.id === "qwenwork-intl")
ok("name is QwenWork Global", site.name === "QwenWork Global", site.name)
ok("web/openapi/api are the global gateway",
  site.web === "https://gateway.qwenwork.ai" && site.openapi === site.web && site.api === site.web, site.api)
ok("client id is the global build's", site.clientId === "cc65e5fc-05bd-4f5d-a4e8-0df19aa3d75a")
ok("client id differs from the CN one", site.clientId !== cn.clientId)
ok("redirect is the global deep-link scheme", site.redirect === "qwenwork://", site.redirect)
ok("Cosy-Version is the global worker runtime", site.cosyVersion === "1.1.71", site.cosyVersion)
ok("RSA key is the builtin one the CN site uses", site.rsaKey === cn.rsaKey)
ok("no wallets path (the global gateway 404s it)", site.walletsPath === undefined)
ok("usage reads the account-context", site.usagePath === cn.usagePath, site.usagePath)
ok("scene / client type / product are the CN ones",
  site.modelScene === "qwork" && site.clientType === "6" && site.businessProduct === "qoder_work")
ok("no PAT and no check-in", site.pat === false && site.checkin === false)
ok("device token is the chat token", site.deviceOnly === true && site.deviceRefreshTarget === "c")

console.log("\nclient headers")
const h = _internal.qwenworkIntlClientHeaders()
ok("names the global release", h["X-QwenWork-Version"] === "1.4.0" && h["X-QwenWork-Release-Version"] === "1.4.0-26110205", h["X-QwenWork-Release-Version"])
ok("build is split out of the release", h["X-QwenWork-Build"] === "26110205")
ok("user agent is the client's", h["User-Agent"] === "qoderwork/1.4.0")
ok("each call has its own request id", h["X-Request-Id"] !== _internal.qwenworkIntlClientHeaders()["X-Request-Id"])
ok("CN headers still name the CN release", _internal.qwenworkClientHeaders()["X-QwenWork-Version"] === "1.2.1")

console.log("\nplugin")
const stub = { auth: { set: async () => {}, get: async () => null, all: async () => ({}) }, providers: { list: async () => [] } }
const p = await m.QwenWorkIntlAuthPlugin({ client: stub })
const cfg = {}
await p.config(cfg)
ok("registers the qwenwork-intl provider", !!cfg.provider["qwenwork-intl"])
ok("provider points at the global gateway", cfg.provider["qwenwork-intl"].api === "https://gateway.qwenwork.ai")
ok("one sign-in method, no prompts", p.auth.methods.length === 1 && p.auth.methods[0].label === "Sign in with QwenWork Global", p.auth.methods[0].label)
ok("no check-in hook (the site turns it off)", !("checkin" in p.auth))
ok("usage hook is there", "usage" in p.auth)

console.log("\nlive device flow (no account needed)")
const si = await protocol.deviceSignIn(site)
ok("sign-in URL is on the global gateway", si.url.startsWith("https://gateway.qwenwork.ai/device/selectAccounts?"))
const step = async (url, headers) => {
  const r = await fetch(url, { redirect: "manual", headers })
  return { status: r.status, location: r.headers.get("location") || "", body: r.status >= 400 ? (await r.text()).slice(0, 160) : "" }
}
const good = await step(si.url, _internal.qwenworkIntlClientHeaders())
ok("the global gateway accepts it", good.status === 302, "HTTP " + good.status)
ok("and hands it to the global OAuth page", good.location.startsWith("https://qwenwork.ai/oauth2/auth?"), good.location.slice(0, 60))
ok("which asks for the qwen_work scope", /scope=[^&]*qwen_work/.test(good.location))

console.log("\nsigned COSY envelope (no account needed)")
// What the envelope proves on its own: the global gateway takes the signed
// model list this plugin builds. The .cn gateway refuses a made-up token
// (401 code 105 "Login expired"); the global one answers the catalog.
const { randomUUID } = await import("node:crypto")
const listingUrl = site.api + "/algo/api/v2/model/list?Encode=1"
const fake = { uid: "123456789", machineId: randomUUID(), access: "jt-probe-" + randomUUID().slice(0, 8), deviceChat: true }
const signed = await fetch(listingUrl, { headers: _internal.cosyHeaders(listingUrl, fake, "", site) })
ok("the global gateway signs our envelope through", signed.status === 200, "HTTP " + signed.status)
const cat = await signed.json()
const keys = (Array.isArray(cat.qwork) ? cat.qwork : []).map((r) => r.key).sort().join(",")
ok("and its qwork scene names the global keys", keys === "qwork-advanced,qwork-auto,qwork-ultimate", keys)
ok("the shipped model list uses those keys",
  site.models.map((x) => x.id).sort().join(",") === keys)

const refusedId = await step(si.url.replace(site.clientId, cn.clientId), _internal.qwenworkIntlClientHeaders())
ok("the CN client id is refused there", refusedId.status === 400, "HTTP " + refusedId.status)
const refusedScheme = await step(si.url.replace(encodeURIComponent(site.redirect), encodeURIComponent(cn.redirect)), _internal.qwenworkIntlClientHeaders())
ok("the CN deep-link scheme is refused there", refusedScheme.status === 400, "HTTP " + refusedScheme.status)

console.log("\n" + pass + " checks passed")
