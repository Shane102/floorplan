#!/usr/bin/env node
// Show the map to the user after a build or refresh. Reuses this map's server if it's running (open tabs
// have already reloaded themselves), restarts it if serve.mjs changed, otherwise starts it in the
// background and opens a browser tab. Prints the URL and how to stop it.
// usage: node open.mjs [root] [--no-open] [--port N] [--engine claude|codex] [--model M] [--claude PATH] [--codex PATH]
//                      [--editor NAME|LINK]   (the editor "Open in editor" opens, e.g. cursor or "zed://file/{path}:{line}")
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, mapDir, unattendedMode } from './lib/common.mjs';
import { editorTemplate } from '../assets/page-safety.mjs';
import { readServerState, serverRequest, serverRuntimeHash } from '../assets/server-state.mjs';
import { cliLabel } from './lib/agent.mjs';

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args._[0] || '.');
// unattended: nobody is there to look, so start nothing and open nothing
if (unattendedMode(args)) {
  console.log('Unattended mode: not starting the map\'s server or opening a browser. The map is floorplan/index.html; to look around in it with Ask, run node floorplan/serve.mjs in the codebase.');
  process.exit(0);
}
const dir = mapDir(root);
const serveFile = fileURLToPath(new URL('../assets/serve.mjs', import.meta.url));
const stateFile = path.join(dir, '.cache', 'server.json');
const rel = path.relative(process.cwd(), dir).replace(/\\/g, '/') || '.';
const IDLE_MINUTES = 120;

if (!fs.existsSync(path.join(dir, 'index.html')) || !fs.existsSync(path.join(dir, 'graph.json'))) {
  console.error('✗ No built map here yet. Run build.mjs first.');
  process.exit(1);
}

// --editor: checked here too, so a mistake is named now rather than in the server's log
const editor = args.editor === undefined ? null : editorTemplate(args.editor === true ? '' : String(args.editor));
if (editor?.error) { console.error(`✗ --editor ${editor.error}`); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const realRoot = fs.realpathSync(root);
async function readStatus(state) {
  if (!state) return null;
  const status = await serverRequest(state, '/api/status');
  return status?.pid === state.pid && status.root === realRoot ? status : null;
}
function openBrowser(u) {
  const [cmd, a] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', u]] : process.platform === 'darwin' ? ['open', [u]] : ['xdg-open', [u]];
  try { spawn(cmd, a, { stdio: 'ignore', detached: true, windowsHide: true }).unref(); return true; } catch { return false; }
}
const hash = serverRuntimeHash(serveFile, path.dirname(serveFile));

let s = readServerState(stateFile);
let status = await readStatus(s);
let restarted = false;
const hadTabs = status?.tabs > 0;

// a newer serve.mjs came with this build, or a different --editor was asked for: restart so the map gets it;
// open tabs reconnect and reload
if (status && (status.hash !== hash || (editor?.template && status.editor !== editor.template))) {
  if (await serverRequest(s, '/api/stop', 'POST')) {
    for (let i = 0; i < 20 && readServerState(stateFile)?.token === s.token; i++) await sleep(150);
    restarted = true;
  }
  status = null;
}

if (!status) {
  const pass = ['port', 'engine', 'model', 'claude', 'codex', 'editor'].flatMap((k) => (args[k] ? ['--' + k, String(args[k])] : []));
  if (!args.port && s?.port) pass.push('--port', String(s.port)); // keep the address people have open
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const logFile = path.join(dir, '.cache', 'server.log');
  fs.rmSync(logFile, { force: true });
  const log = fs.openSync(logFile, 'wx', 0o600);
  const prev = s?.token;
  try {
    spawn(process.execPath, [serveFile, '--map-dir', dir, '--no-open', '--idle-exit', String(IDLE_MINUTES), ...pass], {
      cwd: root, detached: true, stdio: ['ignore', log, log], windowsHide: true,
    }).unref();
  } finally { fs.closeSync(log); }
  // finding the Claude Code or Codex CLI takes a few seconds before the server listens
  for (let i = 0; i < 100; i++) {
    await sleep(200);
    const n = readServerState(stateFile);
    if (n && n.token !== prev) { s = n; status = await readStatus(s); if (status) break; }
  }
  if (!status) {
    console.error(`✗ The map server didn't start. Its log is in ${rel}/.cache/server.log. The map still opens as a file: ${rel}/index.html`);
    process.exit(1);
  }
  // tabs from before a restart come back on their own within a few seconds
  if (restarted && hadTabs) for (let i = 0; i < 50 && !(status?.tabs > 0); i++) { await sleep(200); status = await readStatus(s); }
}

const health = await serverRequest(s, '/api/health');
let shown;
if (status?.tabs > 0) shown = `already open in ${status.tabs === 1 ? 'a browser tab' : status.tabs + ' browser tabs'}, which reloaded with the latest map`;
else if (args['no-open']) shown = 'not opened in a browser (--no-open): open the URL yourself';
else shown = openBrowser(s.url) ? 'opened in the browser' : 'could not open a browser: open the URL yourself';

console.log(`FLOORPLAN  ${s.url}  (${shown})`);
const CLI = {
  claude: { name: 'the Claude Code CLI', docs: 'https://docs.claude.com/en/docs/claude-code' },
  codex: { name: 'Codex', docs: 'https://developers.openai.com/codex' },
};
console.log(health?.cli
  ? `ASK  works: questions run through ${cliLabel(health.engine, health.version)}${health.version ? ' (' + health.version + ')' : ''}`
  : `ASK  needs ${(CLI[health?.want] || CLI.claude).name}, which was not found; the map itself works (${(CLI[health?.want] || CLI.claude).docs})`);
console.log(`SERVER  runs in the background, updates open tabs when the map is rebuilt, and stops ${IDLE_MINUTES / 60} hours after the last tab closes. Stop it now: node ${rel}/serve.mjs --stop`);
