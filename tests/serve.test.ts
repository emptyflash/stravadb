import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { RouteMetadata } from '../src/types.js';

const testHome = path.join(os.tmpdir(), 'stravadb-serve-test-' + Date.now());
const cacheDir = path.join(testHome, '.stravadb', 'cache');

function resetEnv() {
  vi.resetModules();
  vi.stubEnv('HOME', testHome);
}

function writeCacheEntry(key: string, data: Buffer, meta: RouteMetadata): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  const encoded = encodeURIComponent(key);
  fs.writeFileSync(path.join(cacheDir, encoded), data);
  fs.writeFileSync(path.join(cacheDir, encoded + '.meta.json'), JSON.stringify(meta));
}

async function req(
  server: http.Server,
  pathStr: string,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  const port = (server.address() as { port: number }).port;
  return new Promise((resolve, reject) => {
    http.get(
      { hostname: 'localhost', port, path: pathStr },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    ).on('error', reject);
  });
}

const mockTextMeta: RouteMetadata = {
  filename: 'test.txt',
  mime: 'text/plain',
  encoding_ver: 1,
  chunk_total: 1,
  size: 13,
  chunk_index: 0,
};

const mockHtmlMeta: RouteMetadata = {
  filename: 'page.html',
  mime: 'text/html',
  encoding_ver: 1,
  chunk_total: 1,
  size: 27,
  chunk_index: 0,
};

const mockBinMeta: RouteMetadata = {
  filename: 'data.bin',
  mime: 'application/octet-stream',
  encoding_ver: 1,
  chunk_total: 1,
  size: 10,
  chunk_index: 0,
};

beforeEach(() => {
  if (fs.existsSync(testHome)) fs.rmSync(testHome, { recursive: true });
  resetEnv();
});

afterEach(() => {
  vi.restoreAllMocks();
  if (fs.existsSync(testHome)) fs.rmSync(testHome, { recursive: true });
});

describe('serve command', () => {
  describe('renderIndex', () => {
    it('shows empty state when no files', async () => {
      const { renderIndex } = await import('../src/commands/serve.js');
      const html = renderIndex([]);
      expect(html).toContain('No files stored');
    });

    it('lists all cached entries in a table', async () => {
      const { renderIndex } = await import('../src/commands/serve.js');
      const entries = [
        { key: 'alpha', metadata: mockTextMeta, cached: true },
        { key: 'beta', metadata: mockHtmlMeta, cached: false },
      ];
      const html = renderIndex(entries);
      expect(html).toContain('alpha');
      expect(html).toContain('beta');
      expect(html).toContain('test.txt');
      expect(html).toContain('page.html');
      expect(html).toContain('<table');
      expect(html).toContain('✓');
      expect(html).toContain('—');
    });

    it('shows download links', async () => {
      const { renderIndex } = await import('../src/commands/serve.js');
      const html = renderIndex([{ key: 'x', metadata: mockTextMeta, cached: true }]);
      expect(html).toContain('?download');
    });
  });

  describe('serveFile (cached)', () => {
    it('serves text files with correct Content-Type', async () => {
      writeCacheEntry('mytext', Buffer.from('hello\n'), mockTextMeta);
      const entry = { key: 'mytext', metadata: mockTextMeta, cached: true };

      const { serveFile } = await import('../src/commands/serve.js');

      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url!, 'http://localhost');
        await serveFile(cacheDir, url.pathname.slice(1), entry, url.searchParams.has('download'), false, res);
      });
      await new Promise<void>((r) => server.listen(0, r));

      try {
        const r = await req(server, '/mytext');
        expect(r.status).toBe(200);
        expect(r.headers['content-type']).toBe('text/plain');
        expect(r.body.toString()).toBe('hello\n');
      } finally {
        server.close();
      }
    });

    it('serves HTML with text/html Content-Type', async () => {
      writeCacheEntry('page', Buffer.from('<h1>Hi</h1>'), mockHtmlMeta);
      const entry = { key: 'page', metadata: mockHtmlMeta, cached: true };

      const { serveFile } = await import('../src/commands/serve.js');

      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url!, 'http://localhost');
        await serveFile(cacheDir, url.pathname.slice(1), entry, url.searchParams.has('download'), false, res);
      });
      await new Promise<void>((r) => server.listen(0, r));

      try {
        const r = await req(server, '/page');
        expect(r.headers['content-type']).toBe('text/html');
        expect(r.body.toString()).toBe('<h1>Hi</h1>');
      } finally {
        server.close();
      }
    });

    it('forces download with ?download', async () => {
      writeCacheEntry('page', Buffer.from('<h1>Hi</h1>'), mockHtmlMeta);
      const entry = { key: 'page', metadata: mockHtmlMeta, cached: true };

      const { serveFile } = await import('../src/commands/serve.js');

      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url!, 'http://localhost');
        await serveFile(cacheDir, url.pathname.slice(1), entry, url.searchParams.has('download'), false, res);
      });
      await new Promise<void>((r) => server.listen(0, r));

      try {
        const r = await req(server, '/page?download');
        expect(r.headers['content-disposition']).toContain('attachment');
      } finally {
        server.close();
      }
    });

    it('serves binary files as download', async () => {
      writeCacheEntry('data', Buffer.from([0, 1, 2, 3]), mockBinMeta);
      const entry = { key: 'data', metadata: mockBinMeta, cached: true };

      const { serveFile } = await import('../src/commands/serve.js');

      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url!, 'http://localhost');
        await serveFile(cacheDir, url.pathname.slice(1), entry, url.searchParams.has('download'), false, res);
      });
      await new Promise<void>((r) => server.listen(0, r));

      try {
        const r = await req(server, '/data');
        expect(r.headers['content-disposition']).toContain('attachment');
        expect(r.body).toEqual(Buffer.from([0, 1, 2, 3]));
      } finally {
        server.close();
      }
    });

    it('returns 502 for unknown keys (not in Strava and not cached)', async () => {
      const { serveFile } = await import('../src/commands/serve.js');

      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url!, 'http://localhost');
        await serveFile(cacheDir, url.pathname.slice(1), null, false, false, res);
      });
      await new Promise<void>((r) => server.listen(0, r));

      try {
        const r = await req(server, '/ghost');
        expect(r.status).toBe(502);
      } finally {
        server.close();
      }
    });

    it('handles missing metadata gracefully', async () => {
      fs.mkdirSync(cacheDir, { recursive: true });
      const encoded = encodeURIComponent('nometa');
      fs.writeFileSync(path.join(cacheDir, encoded), Buffer.from('data'));
      const entry = { key: 'nometa', metadata: mockBinMeta, cached: true };

      const { serveFile } = await import('../src/commands/serve.js');

      const server = http.createServer(async (req, res) => {
        const url = new URL(req.url!, 'http://localhost');
        await serveFile(cacheDir, url.pathname.slice(1), entry, false, false, res);
      });
      await new Promise<void>((r) => server.listen(0, r));

      try {
        const r = await req(server, '/nometa');
        expect(r.status).toBe(200);
        expect(r.headers['content-disposition']).toContain('attachment');
      } finally {
        server.close();
      }
    });
  });

  describe('loadCacheEntries', () => {
    it('loads entries from the cache directory', async () => {
      writeCacheEntry('k1', Buffer.from('a'), mockTextMeta);
      writeCacheEntry('k2', Buffer.from('b'), mockHtmlMeta);

      const { loadCacheEntries } = await import('../src/commands/serve.js');
      const entries = loadCacheEntries();

      expect(entries).toHaveLength(2);
      expect(entries.map((e: { key: string }) => e.key).sort()).toEqual(['k1', 'k2']);
      expect(entries.every((e: { cached: boolean }) => e.cached)).toBe(true);
    });

    it('detects uncached entries (meta exists but data file missing)', async () => {
      fs.mkdirSync(cacheDir, { recursive: true });
      const encoded = encodeURIComponent('orphan');
      fs.writeFileSync(path.join(cacheDir, encoded + '.meta.json'), JSON.stringify(mockTextMeta));

      const { loadCacheEntries } = await import('../src/commands/serve.js');
      const entries = loadCacheEntries();

      expect(entries).toHaveLength(1);
      expect(entries[0]!.key).toBe('orphan');
      expect(entries[0]!.cached).toBe(false);
    });

    it('skips corrupted meta files', async () => {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(path.join(cacheDir, encodeURIComponent('bad') + '.meta.json'), '{broken');
      const { loadCacheEntries } = await import('../src/commands/serve.js');
      const entries = loadCacheEntries();
      expect(entries).toHaveLength(0);
    });

    it('returns empty array for empty cache', async () => {
      const { loadCacheEntries } = await import('../src/commands/serve.js');
      const entries = loadCacheEntries();
      expect(entries).toHaveLength(0);
    });
  });
});
