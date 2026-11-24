// The map's local server: it listens only on this machine, and its API answers only the map page it
// served (a per-start token, from the same origin), so other websites can't use it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { shopApp, scanAndBuild, cleanup, SKILL } from './helpers.mjs';

let root, server, base, token;
before(async () => {
  root = shopApp();
  scanAndBuild(root);
  const port = 20000 + Math.floor(Math.random() * 20000);
  // No provider CLI: this only exercises the server itself.
  server = spawn(process.execPath, [path.join(root, 'floorplan', 'serve.mjs'), '--port', String(port), '--no-open'], {
    cwd: root, env: { ...process.env, FLOORPLAN_CLAUDE: path.join(root, 'no-such-cli'), FLOORPLAN_CODEX: path.join(root, 'no-such-cli'), FLOORPLAN_NO_PROMPTS: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  base = await new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error(`server didn't start: ${out}`)), 20000);
    server.stdout.on('data', (d) => { out += d; const m = /Floorplan: (http:\/\/\S+)/.exec(out); if (m) { clearTimeout(timer); resolve(m[1]); } });
    server.on('exit', (code) => reject(new Error(`server exited (${code}): ${out}`)));
  });
  token = /"token":"([0-9a-f]+)"/.exec(await (await fetch(base + '/')).text())?.[1];
});
after(async () => {
  // wait for the server to exit first: on Windows its working folder can't be removed while it runs
  if (server && server.exitCode === null) await new Promise((resolve) => { server.once('exit', resolve); server.kill(); });
  cleanup(root);
});

const api = (p, { headers = {}, ...opts } = {}) => fetch(base + p, { ...opts, headers: { 'content-type': 'application/json', ...headers } });

test('it listens on 127.0.0.1 only', () => {
  assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
});

test('the page it serves carries a fresh token', () => {
  assert.match(token || '', /^[0-9a-f]{32}$/);
});

test('API calls without the token are refused', async () => {
  assert.equal((await api('/api/flows')).status, 403);
  assert.equal((await api('/api/ask', { method: 'POST', body: '{"question":"hi"}' })).status, 403);
  assert.equal((await api('/api/flows', { headers: { 'x-floorplan-token': 'wrong' } })).status, 403);
});

test('API calls with the token from another website are refused', async () => {
  const r = await api('/api/flows', { headers: { 'x-floorplan-token': token, origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
});

/** A request to the server under another host name, as a site that rebinds its domain to 127.0.0.1 would send. */
const asHost = (host, p) => new Promise((resolve, reject) => {
  const u = new URL(base + p);
  http.get({ hostname: u.hostname, port: u.port, path: u.pathname, headers: { host, 'x-floorplan-token': token } }, (r) => { r.resume(); resolve(r.statusCode); }).on('error', reject);
});

test('requests under any other host name are refused, page included (DNS rebinding)', async () => {
  const port = new URL(base).port;
  assert.equal(await asHost(`evil.example:${port}`, '/'), 403);
  assert.equal(await asHost(`evil.example:${port}`, '/api/flows'), 403);
  assert.equal(await asHost('127.0.0.1:1', '/'), 403);
  assert.equal(await asHost(`localhost:${port}`, '/'), 200);
  assert.equal(await asHost(`127.0.0.1:${port}`, '/api/flows'), 200);
});

test('API calls with the token from the map itself work', async () => {
  const r = await api('/api/flows', { headers: { 'x-floorplan-token': token } });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { flows: [] });
});

test('files outside the map folder are never served', async () => {
  // including a neighbouring folder whose name starts with "floorplan"
  fs.mkdirSync(path.join(root, 'floorplan-old'));
  fs.writeFileSync(path.join(root, 'floorplan-old', 'notes.txt'), 'private notes');
  for (const p of ['/../shop-api/config.js', '/%2e%2e/shop-api/config.js', '/..%2fshop-api%2fconfig.js', '/..%2ffloorplan-old%2fnotes.txt']) {
    const r = await fetch(base + p);
    const body = await r.text();
    assert.ok(!body.includes('DB_PASSWORD') && !body.includes('private notes'), `${p} -> ${r.status}`);
  }
});

test('only the map and its API are served, including with a valid API token', async () => {
  fs.writeFileSync(path.join(root, 'floorplan', 'notes.html'), '<p>Local notes</p>');
  for (const p of ['/.cache/server.json', '/graph.json', '/notes.html', '/serve.mjs', '/api/cloud/prompt']) {
    assert.equal((await api(p, { headers: { 'x-floorplan-token': token } })).status, 404, p);
  }
  const page = await fetch(base + '/index.html');
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('content-security-policy'), "frame-ancestors 'none'");
  assert.equal((await api('/api/stop', { method: 'POST' })).status, 403);
});

test('a malformed address gets an error, and the server keeps running', async () => {
  assert.equal((await fetch(base + '/%E0%A4%A')).status, 400);
  assert.equal((await fetch(base + '/')).status, 200);
});

test('open starts the installed server and manual stop authenticates to it', async () => {
  const project = shopApp();
  const open = path.join(SKILL, 'scripts', 'open.mjs');
  const generated = path.join(project, 'floorplan', 'serve.mjs');
  const installed = path.join(SKILL, 'assets', 'serve.mjs');
  const stateFile = path.join(project, 'floorplan', '.cache', 'server.json');
  const env = { ...process.env, FLOORPLAN_CLAUDE: path.join(project, 'no-claude'), FLOORPLAN_CODEX: path.join(project, 'no-codex') };
  const run = (script, ...args) => execFileSync(process.execPath, [script, ...args], { cwd: project, env, encoding: 'utf8' });
  try {
    scanAndBuild(project);
    const source = fs.readFileSync(generated);
    fs.writeFileSync(generated, '// This copy is unavailable.\n');
    fs.writeFileSync(path.join(project, 'floorplan', 'index.html'), '<p>Old map page</p>');
    const opened = run(open, project, '--no-open', '--port', '0');
    const address = /http:\/\/127\.0\.0\.1:\d+/.exec(opened)?.[0];
    assert.ok(address);
    const response = await fetch(address);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /window\.FLOORPLAN_SERVER=/);
    assert.doesNotMatch(html, /Old map page/);
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(state.url, undefined, 'the address is derived from the port');
    assert.equal(new URL(address).port, String(state.port));
    assert.match(run(open, project, '--no-open'), new RegExp(address.replaceAll('.', '\\.')));
    fs.writeFileSync(generated, source);
    assert.match(run(generated, '--stop'), /Stopped the map server/);
    for (let tries = 0; tries < 20 && fs.existsSync(stateFile); tries++) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(!fs.existsSync(stateFile));
  } finally {
    if (fs.existsSync(stateFile)) run(installed, '--map-dir', path.dirname(path.dirname(stateFile)), '--stop');
    cleanup(project);
  }
});
