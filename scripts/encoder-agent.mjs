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

function output(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
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

async function sourceHeight(input) {
  try {
    const height = Number(
      await output('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height', '-of', 'csv=p=0', input]),
    );
    if (Number.isFinite(height) && height > 0) return height;
  } catch {
    /* Fall through to the explicit message below. */
  }
  throw new Error('ffprobe is required to inspect the source video dimensions.');
}

function encodedVariantIndexes(height) {
  if (!Number.isFinite(height) || height < 720) return [];
  return height < 1080 ? [0] : [0, 1];
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
  if (video.source_type === 'hls' || /\.m3u8(?:$|\?)/i.test(String(video.source_ref || ''))) return;
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
    const height = await sourceHeight(input);
    const encoded = encodedVariantIndexes(height);
    const variants = [...encoded, 2];
    const args = ['-y', '-i', input];
    const filters = [];
    const maps = [];
    const codecs = [];
    variants.forEach((variant, stream) => {
      if (variant === 0 || variant === 1) {
        const targetHeight = variant === 0 ? 360 : 720;
        filters.push(`[0:v]scale=-2:${targetHeight}[v${variant}]`);
        maps.push('-map', `[v${variant}]`, '-map', '0:a:0');
        codecs.push(
          `-c:v:${stream}`, 'libx264',
          `-preset:v:${stream}`, 'veryfast',
          `-crf:v:${stream}`, variant === 0 ? '26' : '24',
          `-maxrate:v:${stream}`, variant === 0 ? '800k' : '2500k',
          `-bufsize:v:${stream}`, variant === 0 ? '1600k' : '5000k',
          `-c:a:${stream}`, 'aac',
          `-b:a:${stream}`, variant === 0 ? '96k' : '128k',
          `-g:v:${stream}`, '120',
          `-force_key_frames:v:${stream}`, 'expr:gte(t,n_forced*4)',
        );
      } else {
        maps.push('-map', '0:v:0', '-map', '0:a:0');
        codecs.push(`-c:v:${stream}`, 'copy', `-c:a:${stream}`, 'aac', `-b:a:${stream}`, '128k');
      }
    });
    if (filters.length) args.push('-filter_complex', filters.join(';'));
    args.push(
      ...maps,
      ...codecs,
      '-f', 'hls', '-hls_time', '4', '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
      '-master_pl_name', 'master.m3u8',
      '-var_stream_map', variants.map((_, stream) => `v:${stream},a:${stream}`).join(' '),
      '-hls_segment_filename', join(output, 'v%v', 'seg_%03d.ts'),
      join(output, 'v%v', 'index.m3u8'),
    );
    await run('ffmpeg', args);
    let master = await readFile(join(output, 'master.m3u8'), 'utf8');
    const copyDirectory = `v${variants.length - 1}`;
    const v2 = await readFile(join(output, copyDirectory, 'index.m3u8'), 'utf8');
    const dropV2 = longestSegment(v2) > 12;
    if (dropV2 && encoded.length === 0) {
      console.log(`Skipped ${video.id}: already small enough to stream`);
      return;
    }
    if (dropV2) master = filterMaster(master, encoded.length);
    await writeFile(join(output, 'master.m3u8'), master);
    const paths = (await filesUnder(output)).filter((path) => !dropV2 || !path.includes(`/${copyDirectory}/`));
    await uploadAll(video.id, output, paths);
    await jsonFetch(`${baseUrl}/api/videos/${encodeURIComponent(video.id)}/hls/complete`, { method: 'POST' });
    console.log(`Optimised ${video.id}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

await assertFfmpeg();
const listedVideos = (await jsonFetch(`${baseUrl}/api/v1/videos`)).videos;
let videos = listedVideos;
if (videoId) {
  const video = listedVideos.find((candidate) => candidate.id === videoId);
  if (!video) throw new Error('video not found or not owned by this key');
  videos = [video];
}
for (const video of videos) await encode(video);
