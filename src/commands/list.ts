import { listAllActivities, getActivity } from '../lib/strava.js';
import { RouteMetadata } from '../types.js';
import { decodeKey } from '../lib/keys.js';

export async function listCommand(): Promise<void> {
  const allActivities = await listAllActivities();
  const stravadbActivities = allActivities.filter((a) =>
    a.name.startsWith('stravadb:'),
  );

  if (stravadbActivities.length === 0) {
    console.error('No data stored.');
    return;
  }

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

  const keys = new Map<string, { size: number; chunks: number; filename: string }>();

  for (const [key, activityId] of keyActivityMap) {
    try {
      const detail = await getActivity(activityId);

      let metadata: RouteMetadata;
      try {
        metadata = JSON.parse(detail.description || '{}') as RouteMetadata;
      } catch {
        metadata = {
          filename: 'unknown',
          mime: 'unknown',
          encoding_ver: 1,
          chunk_total: 1,
          size: 0,
          chunk_index: 0,
        };
      }

      keys.set(key, {
        size: metadata.size || 0,
        chunks: metadata.chunk_total || 1,
        filename: metadata.filename || 'unknown',
      });
    } catch {
      keys.set(key, { size: 0, chunks: 1, filename: 'error' });
    }
  }

  for (const [key, info] of keys) {
    console.log(`${key}\t${info.size} bytes\t${info.chunks} chunks\t${info.filename}`);
  }
}
