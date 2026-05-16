import * as fs from 'node:fs';
import * as path from 'node:path';
import { chunkData } from '../lib/chunk.js';
import { uploadActivity } from '../lib/strava.js';
import { generateGpx } from '../lib/gpx.js';
import { encodeKey } from '../lib/keys.js';
import { RouteMetadata, StravadbError } from '../types.js';
import { saveResume, loadResume, clearResume } from '../lib/resume.js';

const MIME_MAP: Record<string, string> = {
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.ts': 'text/typescript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.bin': 'application/octet-stream',
};

function guessMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

function hashKey(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

function generateGpxForChunk(
  key: string,
  chunkIndex: number,
  totalChunks: number,
  points: [number, number][],
  filename: string,
  mime: string,
  totalSize: number,
): { routeName: string; gpxBytes: Buffer; metadata: RouteMetadata } {
  const safeKey = encodeKey(key);
  const routeName =
    totalChunks === 1
      ? `stravadb:${safeKey}`
      : `stravadb:${safeKey}:${String(chunkIndex).padStart(3, '0')}`;

  const metadata: RouteMetadata = {
    filename,
    mime,
    encoding_ver: 1,
    chunk_total: totalChunks,
    size: totalSize,
    chunk_index: chunkIndex,
  };

  const dayOffset = ((hashKey(key) & 0x7fffffff) + chunkIndex * 7) % 365;
  const baseDate = new Date('2025-01-01T00:00:00Z');
  baseDate.setUTCDate(baseDate.getUTCDate() + dayOffset);

  const timestamps = points.map((_, idx) => idx * 60);
  const gpxStr = generateGpx({
    name: routeName,
    description: JSON.stringify(metadata),
    points,
    timestamps,
    baseDate,
  });

  return { routeName, gpxBytes: Buffer.from(gpxStr, 'utf-8'), metadata };
}

async function uploadChunk(
  routeName: string,
  metadata: RouteMetadata,
  gpxBytes: Buffer,
  chunkIndex: number,
  totalChunks: number,
): Promise<void> {
  const activity = await uploadActivity({
    name: routeName,
    description: JSON.stringify(metadata),
    private: true,
    dataType: 'gpx',
    file: gpxBytes,
  });

  console.error(
    `Chunk ${chunkIndex + 1}/${totalChunks} uploaded as activity ${activity.id} (${routeName})`,
  );
}

async function waitWithCountdown(seconds: number): Promise<void> {
  for (let remaining = seconds; remaining > 0; remaining--) {
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    process.stderr.write(`\rRate limited — retrying in ${m}m ${s}s... `);
    await new Promise((r) => setTimeout(r, 1000));
  }
  process.stderr.write('\r' + ' '.repeat(50) + '\r');
}

export async function putCommand(key: string, filePath: string): Promise<void> {
  let resume = loadResume(key);
  let data: Uint8Array;
  let filename: string;
  let mime: string;
  let chunks: ReturnType<typeof chunkData>;

  if (resume) {
    data = new Uint8Array(Buffer.from(resume.rawData, 'base64'));
    filename = resume.filename;
    mime = resume.mime;
    chunks = chunkData(data);
    console.error(
      `Resuming previous upload (${resume.nextChunk}/${resume.totalChunks} chunks already done)...`,
    );
  } else {
    const raw = fs.readFileSync(filePath);
    data = new Uint8Array(raw);
    filename = path.basename(filePath);
    mime = guessMime(filePath);
    chunks = chunkData(data);
  }

  const startChunk = resume ? resume.nextChunk : 0;
  let retryCount = 0;

  for (let i = startChunk; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const { routeName, gpxBytes, metadata } = generateGpxForChunk(
      key,
      i,
      chunks.length,
      chunk.points,
      filename,
      mime,
      data.length,
    );

    try {
      await uploadChunk(routeName, metadata, gpxBytes, i, chunks.length);
      retryCount = 0;

      // Save progress after each successful chunk
      saveResume({
        key,
        rawData: Buffer.from(data).toString('base64'),
        filename,
        mime,
        totalChunks: chunks.length,
        nextChunk: i + 1,
      });
    } catch (err) {
      if (err instanceof StravadbError && err.code === 'RATE_LIMITED') {
        // Save progress before waiting
        saveResume({
          key,
          rawData: Buffer.from(data).toString('base64'),
          filename,
          mime,
          totalChunks: chunks.length,
          nextChunk: i,
        });

        const delay = (err.retryAfter || 900) + retryCount * 30;
        await waitWithCountdown(delay);
        retryCount++;
        i--; // retry this chunk
        continue;
      }

      // Non-rate-limit failure — save progress and rethrow
      saveResume({
        key,
        rawData: Buffer.from(data).toString('base64'),
        filename,
        mime,
        totalChunks: chunks.length,
        nextChunk: i,
      });
      throw err;
    }
  }

  clearResume(key);
  console.error(`All chunks uploaded.`);
}
