import { StravadbError } from '../types.js';
import { listAllActivities } from '../lib/strava.js';
import { encodeKey } from '../lib/keys.js';

export async function deleteCommand(key: string): Promise<void> {
  const allActivities = await listAllActivities();
  const safeKey = encodeKey(key);
  const rawPattern = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const encodedPattern = safeKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const chunkPattern = new RegExp(
    `^stravadb:(?:${rawPattern}|${encodedPattern})(?::\\d{3})?$`,
  );

  const matching = allActivities.filter((a) => chunkPattern.test(a.name));

  if (matching.length === 0) {
    throw new StravadbError(`Key not found: ${key}`, 'NOT_FOUND');
  }

  console.error(`Found ${matching.length} activity(s) for key "${key}":`);
  for (const act of matching) {
    console.error(`  ${act.id}: ${act.name}`);
  }
  console.error('Note: Strava API DELETE requires additional permissions.');
  console.error('Delete these activities manually at https://www.strava.com/athlete/training');
}
