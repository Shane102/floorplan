import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function assertMapDirectory(dir) {
  const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (stat && !stat.isDirectory()) throw new Error(`Floorplan needs a regular directory at ${dir}.`);
}

/** Replace the destination itself, including any symlink, without modifying its target. */
export function writeMapFile(file, data, mode) {
  const dir = path.dirname(file);
  assertMapDirectory(dir);
  const temp = path.join(dir, `.floorplan-${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temp, data, { flag: 'wx', mode });
    try { fs.renameSync(temp, file); }
    catch (e) {
      // Windows cannot rename over a read-only file left by a previous build.
      const stat = e.code === 'EPERM' && process.platform === 'win32' && fs.lstatSync(file, { throwIfNoEntry: false });
      if (!stat || !stat.isFile() || (stat.mode & 0o200)) throw e;
      fs.rmSync(file, { force: true });
      fs.renameSync(temp, file);
    }
  }
  finally { fs.rmSync(temp, { force: true }); }
}
