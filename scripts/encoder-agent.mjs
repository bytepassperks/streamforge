#!/usr/bin/env node
/**
 * Native-ffmpeg ladder encoder for an always-on owner PC.
 *
 * The API key is read from VIDEOKR_API_KEY and is only sent in Authorization
 * headers. It is intentionally never included in progress or error output.
 */
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { spawn } from 'node:child_process';

const PART_LIMIT = 20 * 1024 * 1024;
const CONCURRENCY = 4;

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? '' : process.argv[index + 1] || '';
}

const baseUrl = arg('--base-url').replace(/\/$/, '');
const videoId = arg('--video');
const all = process.argv.includes('--all');
const apiKey = process.env.VIDEOKR_API_KEY || process.env.VIDEOKR_APIKEY || '';
if (!baseUrl || (!videoId && !all) || (videoId && all)) {
  console.error('Usage: encoder-agent.mjs --base-url https://videokr.com --video <id>');
  console.error('   or: encoder-agent.mjs --base-url https://videokr.com --all');
  process.exit(2);
}
if (!apiKey) {
  console.error('Set VIDEOKR_API_KEY to an account API key before running the encoder.');
  process.exit(2);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with exit code ${code}: ${stderr.slice(-500)}`));
    });
  });
}

async function assertFfmpeg() {
  try {
    await run('ffmpeg', ['-version']);
  } catch {
    throw new Error('ffmpeg is not installed or is not available on PATH.');
  }
}

function authHeaders(extra = {}) {
  return { ...extra, Authorization: `Bearer ${apiKey}` };
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, { ...options, headers: authHeaders(options.headers) });
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${url} returned HTTP ${response.status}`);
  return response.json();
}

function longestSegment(playlist) {
  let longest = 0;
  for (const match of playlist.matchAll(/#EXTINF:([\d.]+)/g)) longest = Math.max(longest, Number(match[1]));
  return longest;
}

function filterMaster(master, keepCount) {
  const lines = master.split(/\r?\n/);
  const output = [];
  let rendition = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith('#EXT-X-STREAM-INF:')) {
      rendition += 1;
      if (rendition >= keepCount) {
        i += 1;
        continue;
      }
    }
    output.push(lines[i]);
  }
  return output.join('\n');
}

async function filesUnder(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(root, path)));
    else files.push(path);
  }
  return files;
}

async function uploadPart(id, root, path) {
  const data = await readFile(path);
  if (data.byteLength > PART_LIMIT) throw new Error(`generated HLS part exceeds 20MB: ${relative(root, path)}`);
  const form = new FormData();
  form.append('path', relative(root, path).split('\\').join('/'));
  form.append('file', new Blob([data]), relative(root, path));
  const response = await fetch(`${baseUrl}/api/videos/${encodeURIComponent(id)}/hls/parts`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  if (!response.ok) throw new Error(`part upload returned HTTP ${response.status}`);
}

async function uploadAll(id, root, paths) {
  let cursor = 0;
  async function worker() {
    while (cursor < paths.length) {
      const path = paths[cursor++];
      await uploadPart(id, root, path);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, paths.length) }, worker));
}

async function encode(video) {
  if (video.source_type !== 'mp4' || !String(video.source_ref || '').startsWith('/media/')) return;
  const work = await mkdtemp(join(tmpdir(), 'videokr-hls-'));
  try {
    const input = join(work, 'input.mp4');
    const output = join(work, 'ladder');
    for (const directory of ['v0', 'v1', 'v2']) await mkdir(join(output, directory), { recursive: true });
    const source = new URL(video.source_ref, `${baseUrl}/`).toString();
    const response = await fetch(source, { headers: authHeaders() });
    if (!response.ok || !response.body) throw new Error(`source download returned HTTP ${response.status}`);
    await writeFile(input, new Uint8Array(await response.arrayBuffer()));
    await run('ffmpeg', [
      '-y', '-i', input,
      '-filter_complex', '[0:v]split=2[v360in][v720in];[v360in]scale=-2:360[v360];[v720in]scale=-2:720[v720]',
      '-map', '[v360]', '-map', '0:a:0',
      '-map', '[v720]', '-map', '0:a:0',
      '-map', '0:v:0', '-map', '0:a:0',
      '-c:v:0', 'libx264', '-preset:v:0', 'veryfast', '-crf:v:0', '26', '-maxrate:v:0', '800k', '-bufsize:v:0', '1600k',
      '-c:a:0', 'aac', '-b:a:0', '96k',
      '-c:v:1', 'libx264', '-preset:v:1', 'veryfast', '-crf:v:1', '24', '-maxrate:v:1', '2500k', '-bufsize:v:1', '5000k',
      '-c:a:1', 'aac', '-b:a:1', '128k',
      '-c:v:2', 'copy', '-c:a:2', 'aac', '-b:a:2', '128k',
      '-g:v:0', '120', '-g:v:1', '120',
      '-force_key_frames:v:0', 'expr:gte(t,n_forced*4)', '-force_key_frames:v:1', 'expr:gte(t,n_forced*4)',
      '-f', 'hls', '-hls_time', '4', '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
      '-master_pl_name', 'master.m3u8', '-var_stream_map', 'v:0,a:0 v:1,a:1 v:2,a:2',
      '-hls_segment_filename', join(output, 'v%v', 'seg_%03d.ts'),
      join(output, 'v%v', 'index.m3u8'),
    ]);
    let master = await readFile(join(output, 'master.m3u8'), 'utf8');
    const v2 = await readFile(join(output, 'v2', 'index.m3u8'), 'utf8');
    const dropV2 = longestSegment(v2) > 12;
    if (dropV2) master = filterMaster(master, 2);
    await writeFile(join(output, 'master.m3u8'), master);
    const paths = (await filesUnder(output)).filter((path) => !dropV2 || !path.includes('/v2/'));
    await uploadAll(video.id, output, paths);
    await jsonFetch(`${baseUrl}/api/videos/${encodeURIComponent(video.id)}/hls/complete`, { method: 'POST' });
    console.log(`Optimised ${video.id}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

await assertFfmpeg();
const videos = videoId
  ? [{ id: videoId, source_type: 'mp4', source_ref: await jsonFetch(`${baseUrl}/api/videos/${encodeURIComponent(videoId)}`).then((r) => r.video.source_ref) }]
  : (await jsonFetch(`${baseUrl}/api/v1/videos`)).videos;
for (const video of videos) await encode(video);
