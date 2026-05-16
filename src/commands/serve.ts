import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import { CONFIG_DIR } from '../lib/auth.js';
import { listAllActivities, getActivity } from '../lib/strava.js';
import { retrieveKey } from './get.js';
import { RouteMetadata } from '../types.js';
import { decodeKey } from '../lib/keys.js';

const CACHE_DIR = path.join(CONFIG_DIR, 'cache');

interface CacheEntry {
  key: string;
  metadata: RouteMetadata;
  cached: boolean;
}

function keyToFilename(key: string): string {
  return encodeURIComponent(key);
}

function keyToHref(key: string): string {
  return key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function filenameToKey(filename: string): string {
  return decodeURIComponent(filename);
}

function cacheFilePath(key: string): string {
  return path.join(CACHE_DIR, keyToFilename(key));
}

function cacheMetaPath(key: string): string {
  return path.join(CACHE_DIR, keyToFilename(key) + '.meta.json');
}

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

async function refreshMetadata(): Promise<CacheEntry[]> {
  ensureCacheDir();
  const allActivities = await listAllActivities();
  const stravadbActivities = allActivities.filter((a) =>
    a.name.startsWith('stravadb:'),
  );

  const keyActivityMap = new Map<string, number>();
  for (const act of stravadbActivities) {
    const nameWithoutPrefix = act.name.slice('stravadb:'.length);
    const rawKey = nameWithoutPrefix.includes(':')
      ? nameWithoutPrefix.slice(0, nameWithoutPrefix.lastIndexOf(':'))
      : nameWithoutPrefix;
    const key = decodeKey(rawKey);

    const existing = keyActivityMap.get(key);
    if (!existing || act.id > existing) {
      keyActivityMap.set(key, act.id);
    }
  }

  const entries: CacheEntry[] = [];

  for (const [key, activityId] of keyActivityMap) {
    console.error(`Loading metadata for ${key}...`);
    try {
      const detail = await getActivity(activityId);
      let metadata: RouteMetadata;
      try {
        metadata = JSON.parse(detail.description || '{}') as RouteMetadata;
      } catch {
        metadata = {
          filename: 'unknown',
          mime: 'application/octet-stream',
          encoding_ver: 1,
          chunk_total: 1,
          size: 0,
          chunk_index: 0,
        };
      }

      const metaPath = cacheMetaPath(key);
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

      const cached = fs.existsSync(cacheFilePath(key));

      entries.push({ key, metadata, cached });
      console.error(`  ${key}: ${metadata.size} bytes${cached ? ' (cached)' : ''}`);
    } catch (err) {
      console.error(`  ${key}: SKIPPED (${(err as Error).message})`);
    }
  }

  return entries;
}

export function loadCacheEntries(): CacheEntry[] {
  ensureCacheDir();
  const entries: CacheEntry[] = [];
  const files = fs.readdirSync(CACHE_DIR);

  for (const file of files) {
    if (!file.endsWith('.meta.json')) continue;
    const encodedKey = file.slice(0, -'.meta.json'.length);
    let key: string;
    try {
      key = filenameToKey(encodedKey);
    } catch {
      continue;
    }
    try {
      const metaRaw = fs.readFileSync(path.join(CACHE_DIR, file), 'utf-8');
      const metadata = JSON.parse(metaRaw) as RouteMetadata;
      const cached = fs.existsSync(cacheFilePath(key));
      entries.push({ key, metadata, cached });
    } catch {
      // skip corrupted cache entries
    }
  }

  entries.sort((a, b) => a.key.localeCompare(b.key));
  return entries;
}

export function renderIndex(entries: CacheEntry[]): string {
  const rows = entries
    .map(
      (e) =>
        `<tr>` +
        `<td><a href="/${keyToHref(e.key)}">${escapeHtml(e.key)}</a></td>` +
        `<td>${escapeHtml(e.metadata.filename)}</td>` +
        `<td>${formatSize(e.metadata.size)}</td>` +
        `<td>${escapeHtml(e.metadata.mime)}</td>` +
        `<td>${e.metadata.chunk_total}</td>` +
        `<td>${e.cached ? '✓' : '—'}</td>` +
        `<td><a href="/${keyToHref(e.key)}?download" title="Download">⬇</a></td>` +
        `</tr>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>stravadb — file server</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0d1117; color: #c9d1d9; font-family: ui-monospace, 'Cascadia Code', 'Fira Code', monospace;
    padding: 2rem; min-height: 100vh;
  }
  h1 { font-size: 1.3rem; margin-bottom: 0.5rem; color: #fc6; }
  .subtitle { color: #8b949e; font-size: 0.85rem; margin-bottom: 1.5rem; }
  .actions { margin-bottom: 1.5rem; display: flex; gap: 0.75rem; flex-wrap: wrap; }
  .btn {
    display: inline-block; padding: 0.4rem 1rem;
    background: #21262d; color: #c9d1d9; border: 1px solid #30363d;
    border-radius: 6px; text-decoration: none; font-size: 0.85rem;
    cursor: pointer; font-family: inherit;
  }
  .btn:hover { background: #30363d; border-color: #8b949e; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { padding: 0.5rem 0.75rem; text-align: left; border-bottom: 1px solid #21262d; }
  th { color: #8b949e; font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
  td { font-size: 0.85rem; }
  a { color: #58a6ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  tr:hover td { background: #161b22; }
  .empty { color: #8b949e; text-align: center; padding: 3rem; font-size: 0.9rem; }
  .count { color: #8b949e; font-size: 0.8rem; }
</style>
</head>
<body>
<h1>stravadb</h1>
<p class="subtitle">file server &mdash; <span class="count">${entries.length} file${entries.length !== 1 ? 's' : ''} stored</span></p>
<div class="actions">
  <a class="btn" href="/refresh">⟳ Refresh from Strava</a>
  </div>
${
  entries.length === 0
    ? '<p class="empty">No files stored. Run <code>stravadb put &lt;key&gt; &lt;file&gt;</code> to add some.</p>'
    : `<table>
<thead><tr><th>Key</th><th>Filename</th><th>Size</th><th>MIME</th><th>Chunks</th><th>Local</th><th>Download</th></tr></thead>
<tbody>${rows}</tbody>
</table>`
}
</body>
</html>`;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function serveFile(
  cacheDir: string,
  key: string,
  entry: CacheEntry | null,
  forceDownload: boolean,
  noCache: boolean,
  res: http.ServerResponse,
): Promise<void> {
  const filePath = cacheFilePath(key);
  const metaPath = cacheMetaPath(key);
  let metadata = entry?.metadata ?? null;

  if (noCache || !fs.existsSync(filePath)) {
    try {
      const result = await retrieveKey(key);
      ensureCacheDir();
      fs.writeFileSync(filePath, result.data);
      metadata = result.metadata;
      if (!fs.existsSync(metaPath)) {
        fs.writeFileSync(metaPath, JSON.stringify(result.metadata, null, 2));
      }
      if (entry) {
        entry.cached = true;
      }
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Error retrieving from Strava: ${(err as Error).message}`);
      return;
    }
  }

  const mime = metadata?.mime || 'application/octet-stream';

  const isInline =
    !forceDownload &&
    (mime.startsWith('text/') ||
      mime === 'application/json' ||
      mime === 'application/javascript' ||
      mime.startsWith('image/') ||
      mime === 'image/svg+xml');

  const headers: Record<string, string> = {
    'Content-Type': mime,
  };

  if (!isInline) {
    headers['Content-Disposition'] = `attachment; filename="${metadata?.filename || key}"`;
  }

  const data = fs.readFileSync(filePath);
  res.writeHead(200, headers);
  res.end(data);
}

let cachedEntries: CacheEntry[] = [];

export async function serveCommand(port: number, noCache: boolean): Promise<void> {
  console.error('Loading metadata from Strava...');
  cachedEntries = await refreshMetadata();
  if (noCache) {
    console.error('Cache disabled — all requests will fetch from Strava');
  }
  console.error(`\nstravadb server running at http://localhost:${port}`);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);
    const pathname = url.pathname;
    const key = decodeURIComponent(pathname.slice(1).replace(/\/$/, ''));

    if (req.method === 'GET' && pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(renderIndex(cachedEntries));
      return;
    }

    if (req.method === 'GET' && pathname === '/refresh') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="1;url=/"></head><body><p style="color:#c9d1d9;font-family:monospace;padding:2rem">Refreshing metadata...</p></body></html>`,
      );
      refreshMetadata()
        .then((entries) => {
          cachedEntries = entries;
        })
        .catch((err) => console.error('Refresh failed:', err));
      return;
    }

    if (req.method === 'GET' && key.length > 0) {
      const forceDownload = url.searchParams.has('download');
      const entry = cachedEntries.find((e) => e.key === key) ?? null;
      serveFile(CACHE_DIR, key, entry, forceDownload, noCache, res);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  server.listen(port);
}
