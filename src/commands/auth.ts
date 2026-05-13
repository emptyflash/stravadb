import { runOAuthServer } from '../lib/auth.js';

export async function authCommand(port: number): Promise<void> {
  const tokens = await runOAuthServer(port);
  console.error(`Authenticated as athlete ${tokens.athlete_id}`);
}
