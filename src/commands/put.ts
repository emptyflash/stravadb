import * as fs from 'node:fs';
import * as path from 'node:path';
import { chunkData } from '../lib/chunk.js';
import { uploadActivity } from '../lib/strava.js';
import { generateGpx } from '../lib/gpx.js';
import { RouteMetadata } from '../types.js';

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

export async function putCommand(key: string, filePath: string): Promise<void> {
  const data = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const mime = guessMime(filePath);

  const chunks = chunkData(new Uint8Array(data));

  for (let i = 0; i < chunks.length; i++) {
    const routeName =
      chunks.length === 1
        ? `stravadb:${key}`
        : `stravadb:${key}:${String(i).padStart(3, '0')}`;

    const metadata: RouteMetadata = {
      filename,
      mime,
      encoding_ver: 1,
      chunk_total: chunks.length,
      size: data.length,
      chunk_index: i,
    };

    const offset = Math.floor(Date.now() / 1000) % 86400;
    const timestamps = chunks[i]!.points.map((_, idx) => offset + idx * 10);
    const gpxStr = generateGpx({
      name: routeName,
      description: JSON.stringify(metadata),
      points: chunks[i]!.points,
      timestamps,
    });

    const gpxBytes = Buffer.from(gpxStr, 'utf-8');

    const activity = await uploadActivity({
      name: routeName,
      description: JSON.stringify(metadata),
      private: true,
      dataType: 'gpx',
      file: gpxBytes,
    });

    console.error(
      `Chunk ${i + 1}/${chunks.length} uploaded as activity ${activity.id} (${routeName})`,
    );
  }
}
