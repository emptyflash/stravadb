import * as fs from 'node:fs';
import * as path from 'node:path';
import { RouteMetadata, StravadbError } from '../types.js';
import { listAllActivities, getActivity, getActivityStream } from '../lib/strava.js';
import { unchunkData } from '../lib/chunk.js';

interface ChunkInfo {
  index: number;
  activityId: number;
}

async function findActivityIds(key: string): Promise<ChunkInfo[]> {
  const allActivities = await listAllActivities();
  const chunkPattern = new RegExp(
    `^stravadb:${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?::\\d{3})?$`,
  );

  const matches: Map<string, ChunkInfo> = new Map();
  for (const act of allActivities) {
    if (!chunkPattern.test(act.name)) continue;

    const nameParts = act.name.split(':');
    const chunkKey = nameParts.length >= 3 ? nameParts[2]! : '000';

    const existing = matches.get(chunkKey);
    if (!existing || act.id > existing.activityId) {
      matches.set(chunkKey, {
        index: parseInt(chunkKey, 10),
        activityId: act.id,
      });
    }
  }

  return [...matches.values()].sort((a, b) => a.index - b.index);
}

export async function getCommand(key: string, outFile?: string): Promise<void> {
  const chunks = await findActivityIds(key);

  if (chunks.length === 0) {
    throw new StravadbError(`Key not found: ${key}`, 'NOT_FOUND');
  }

  const decodedChunks: Uint8Array[] = [];
  let totalSize = 0;

  for (const chunk of chunks) {
    const points = await getActivityStream(chunk.activityId);

    if (points.length === 0) {
      throw new StravadbError(
        `Activity ${chunk.activityId} has no GPS data`,
        'NO_POINTS',
      );
    }

    const decoded = unchunkData(points);
    if (!decoded) {
      throw new StravadbError(
        `Activity ${chunk.activityId} has invalid data format`,
        'INVALID_FORMAT',
      );
    }

    decodedChunks.push(decoded);
    totalSize += decoded.length;
  }

  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of decodedChunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  if (outFile) {
    fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
    fs.writeFileSync(outFile, result);
    console.error(`Written ${result.length} bytes to ${outFile}`);
  } else {
    process.stdout.write(result);
  }
}
