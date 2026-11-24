import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function serverRuntimeHash(serveFile, assets) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(serveFile));
  if (fs.existsSync(assets)) {
    const files = fs.readdirSync(assets, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name)).sort();
    for (const file of files) {
      hash.update(path.relative(assets, file) + '\0');
      hash.update(crypto.createHash('sha256').update(fs.readFileSync(file)).digest());
    }
  }
  return hash.digest('hex');
}

export function readServerState(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > 4096) return null;
    const { pid, port, token } = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (Number.isSafeInteger(pid) && pid > 0 && Number.isInteger(port) && port > 0 && port <= 65535 &&
        typeof token === 'string' && /^[0-9a-f]{32}$/.test(token)) {
      return { pid, port, token, url: `http://127.0.0.1:${port}` };
    }
  } catch {}
  return null;
}

export async function serverRequest(state, endpoint, method = 'GET') {
  if (!/^\/api\/[a-z-]+$/.test(endpoint)) return null;
  try {
    const response = await fetch(`http://127.0.0.1:${state.port}${endpoint}`, {
      method, headers: { 'x-floorplan-token': state.token }, redirect: 'error', signal: AbortSignal.timeout(3000),
    });
    if (response.status === 204) return true;
    return response.ok ? await response.json() : null;
  } catch { return null; }
}
