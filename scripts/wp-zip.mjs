/**
 * Packages the WordPress plugin as the ZIP the landing page offers for
 * download. Run before deploying so `/downloads/…` always carries the plugin
 * version that is in the tree.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/downloads/videokr-wordpress-plugin.zip');
const header = readFileSync(resolve(root, 'wp-plugin/videokr/videokr.php'), 'utf8');
const version = /^\s*\*\s*Version:\s*(\S+)/m.exec(header);

mkdirSync(dirname(out), { recursive: true });
rmSync(out, { force: true });
execFileSync('zip', ['-qr', out, 'videokr', '-x', '*.DS_Store'], {
  cwd: resolve(root, 'wp-plugin'),
});

console.log(`packaged videokr ${version ? version[1] : '?'} -> ${out}`);
