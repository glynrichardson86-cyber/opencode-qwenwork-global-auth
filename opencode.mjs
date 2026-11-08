// The package's OpenCode 1.x plugins, as OpenCode 1.x and magpie's host
// load them: its plugin functions and nothing else (1.x refuses a
// package whose exports include anything but plugins). OpenCode 2.x
// loads opencode2.mjs, which runs these.
//
// Only the global (overseas) QwenWork plugin is exported, so this package
// sits beside @magpie-community/opencode-qoder-auth rather than over it:
// that one already serves qoder, qoder-cn, qwenwork and qwenwork-enterprise,
// and a host that loaded both would see those providers twice. This
// package's index.mjs carries all of them (it is that package's index.mjs
// with the qwenwork-intl site added), so a host that wants this one alone
// exports the rest here too:
//
//   export { QoderAuthPlugin, QoderCNAuthPlugin, QwenWorkAuthPlugin,
//            QwenWorkEnterpriseAuthPlugin, QwenWorkIntlAuthPlugin } from "./index.mjs"
export { QwenWorkIntlAuthPlugin } from "./index.mjs"
