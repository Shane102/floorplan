# Is it safe to install?

Floorplan is a Claude Code and Codex plugin that runs local Node.js scripts. Its layout engine and fonts are bundled with the plugin. The checks below help you inspect the code and compare your installation with a trusted checkout.

## What the plugin contains

- Node.js scripts for scanning, building and serving maps. The package manifest defines the test command.
- Vendored copies of elkjs and fonts with their licenses.
- A skill and plugin manifests. Installation requires no package dependencies or install scripts. The plugin defines no hooks or MCP servers.

## Runtime behavior

### The network

- **The map's server** listens on `127.0.0.1` only. It serves the viewer and its API, and it keeps internal files such as scan data and logs off HTTP. Its API requires a token and checks the browser origin.
- **The map page works offline.** Its layout engine and fonts are bundled in the page.
- **The viewer limits scripts and background requests.** Its Content Security Policy allows scripts by SHA-256 hash and limits images and fonts to bundled data. Exports block background connections with `connect-src 'none'`. The local viewer uses `connect-src 'self'` for Ask, live reload, flows and Export. The Claude app applies its own rules to the optional copy made with `--artifact`.
- **Reporting a Health false positive is optional.** The viewer previews the report and can copy it to your clipboard. The link to the fork's issues carries no report text. You decide what to paste and submit.

When you use Ask, Floorplan starts Claude Code or Codex. Those clients connect to their providers using your account and can read project files.

### The programs it runs

| Program | When | Why |
|---|---|---|
| `git` | scan and updates | Read-only commands with the filesystem monitor and lazy fetching disabled |
| `claude` or `codex` | when you ask a question on the map | Answering it, read-only: `claude -p` limited to reading and searching files, or `codex exec --sandbox read-only` |
| `node` | throughout | Running Floorplan's own scripts |
| `cmd /c start`, `open` or `xdg-open` | opening the map | Opening the map's local address in your browser |

Each is started directly with its arguments, never as a command line for a shell to interpret. The one shell is Windows' `cmd /c start`, given only the map's own local address.

### What runs without asking

In Claude Code, while the skill is in use, it pre-approves one kind of command: `node` running one of its own scripts, each named exactly (`scripts/build.mjs`, `describe.mjs`, `open.mjs`, `plan.mjs`, `recent.mjs`, `refresh.mjs`, `scan.mjs` and `status.mjs`). That list is fixed by the tests below. Anything else Claude does asks according to your permission settings, as usual. Codex asks according to your approval settings.

### The workflow file

`skills/floorplan/workflow.json` is data, not code: the same steps as SKILL.md, for people who run Floorplan from their own scripts or CI ([Running without an agent session](unattended.md)). Nothing in Floorplan reads it to decide what to run.

### Bundled code and map data

- **`skills/floorplan/assets/vendor/elk.bundled.js`** is a 1.6 MB minified file: the layout engine that arranges the map. It's [elkjs](https://github.com/kieler/elkjs) 0.11.1, byte for byte the same as the official package on npm. Its SHA-256 is `20dd2114d683ce758b3ce19bcc56e28a504a617b0d280f760407c37314631d0e`. To check it yourself:
  ```bash
  npm pack elkjs@0.11.1
  tar -xzf elkjs-0.11.1.tgz package/lib/elk.bundled.js
  ```
  Then compare `package/lib/elk.bundled.js` with Floorplan's copy, for example with `sha256sum` (macOS: `shasum -a 256`; Windows PowerShell: `Get-FileHash`).
- **Ask uses lookup code from the installed plugin.** The server reads the project's graph as JSON data and supplies a lookup summary to the agent.
- **The scanner skips symbolic links and paths outside the project.** Floorplan writes generated map files by replacing the destination entry, so a linked output cannot redirect writes to its target.
- **Health reads the middle part of tokens it finds** (it decodes them from base64) to tell what kind of token each is, so it can skip ones that are public by design. It never stores or shows the token itself.

## Checked on every change

[`tests/supply-chain.test.mjs`](../tests/supply-chain.test.mjs) runs on every push and pull request, on Linux and Windows (and weekly on macOS). It fails if a change would:

- add a hook, an MCP server, a dependency or an install script;
- add a network client to the local server or a background request from the viewer to an external service;
- start a program not in the table above, or start one through a shell;
- use `eval`, load code at run time, or hide a long encoded string in the code;
- add a script that would run without asking;
- change the bundled layout engine, or add a vendored file.

See the test for the current checks and their scope.

To run the same checks on your own copy:

```bash
node --test tests/supply-chain.test.mjs
```

## Compare an installed copy with the repository

`CHECKSUMS.txt` records SHA-256 fingerprints of the skill, package manifest and plugin and marketplace files. Compare your installed copy with the same fork commit you used to install it.

```bash
git clone https://github.com/Shane102/floorplan.git floorplan-check
git -C floorplan-check checkout COMMIT_OR_TAG
node floorplan-check/tools/checksums.mjs --check "/path/to/installed/plugin"
```

Replace `COMMIT_OR_TAG` with the fork ref you installed. For the default plugin caches, replace `<version>` with the installed version:
- **Claude Code:** `~/.claude/plugins/cache/floorplan-shane102/floorplan/<version>`
- **Codex:** `~/.codex/plugins/cache/floorplan-shane102/floorplan/<version>`

The command reports a match or lists changed, extra and missing files.

## Updating

A marketplace update uses the code published by that marketplace. Check the source and the changes before installing an update. [Changelog](../CHANGELOG.md)

## Found something?

Please report it privately, as described in the [security policy](../SECURITY.md).
