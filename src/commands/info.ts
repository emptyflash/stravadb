import { StravadbError, RouteMetadata } from '../types.js';
import { listAllActivities, getActivity } from '../lib/strava.js';

export async function infoCommand(key: string): Promise<void> {
  const allActivities = await listAllActivities();
  const chunkPattern = new RegExp(
    `^stravadb:${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?::\\d{3})?$`,
  );

  const matching = allActivities
    .filter((a) => chunkPattern.test(a.name))
    .sort((a, b) => b.id - a.id);

  if (matching.length === 0) {
    throw new StravadbError(`Key not found: ${key}`, 'NOT_FOUND');
  }

  const detail = await getActivity(matching[0]!.id);

  let meta: RouteMetadata;
  try {
    meta = JSON.parse(detail.description || '{}') as RouteMetadata;
  } catch {
    throw new StravadbError(`Invalid metadata for key: ${key}`, 'INVALID_FORMAT');
  }

  console.log(`Key:         ${key}`);
  console.log(`Size:        ${meta.size} bytes`);
  console.log(`Chunks:      ${meta.chunk_total}`);
  console.log(`Filename:    ${meta.filename}`);
  console.log(`MIME type:   ${meta.mime}`);
  console.log(`Encoding:    v${meta.encoding_ver}`);
  console.log(`Activities:  ${matching.map((a) => a.id).join(', ')}`);
}
