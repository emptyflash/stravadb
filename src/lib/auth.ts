import * as fs from 'node:fs';
import * as path from 'node:path';
import * as http from 'node:http';
import * as url from 'node:url';
import dotenv from 'dotenv';
import { StravaTokens, StravadbError } from '../types.js';

dotenv.config();

export const CONFIG_DIR = path.join(process.env.HOME || '/tmp', '.stravadb');
const TOKENS_FILE = path.join(CONFIG_DIR, 'tokens.json');

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadTokens(): StravaTokens | null {
  try {
    const data = fs.readFileSync(TOKENS_FILE, 'utf-8');
    return JSON.parse(data) as StravaTokens;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: StravaTokens): void {
  ensureConfigDir();
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

export function deleteTokens(): void {
  try {
    fs.unlinkSync(TOKENS_FILE);
  } catch {
    // ignore if doesn't exist
  }
}

export async function refreshAccessToken(refresh_token: string, athlete_id?: number): Promise<StravaTokens> {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new StravadbError(
      'STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET must be set in .env',
      'MISSING_CREDENTIALS',
    );
  }

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new StravadbError(
      `Token refresh failed: ${res.status} ${body}`,
      'REFRESH_FAILED',
      res.status,
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    athlete?: { id: number };
  };

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    athlete_id: data.athlete?.id ?? athlete_id ?? 0,
  };
}

export function runOAuthServer(port: number): Promise<StravaTokens> {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const redirectUri = process.env.STRAVA_REDIRECT_URI || `http://localhost:${port}/callback`;

  if (!clientId || !clientSecret) {
    return Promise.reject(
      new StravadbError(
        'STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET must be set in .env',
        'MISSING_CREDENTIALS',
      ),
    );
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url || '', true);
      if (parsed.pathname === '/callback') {
        const code = parsed.query.code as string | undefined;
        if (!code) {
          res.writeHead(400);
          res.end('Missing authorization code');
          server.close();
          reject(new StravadbError('Authorization code not received', 'OAUTH_FAILED'));
          return;
        }

        try {
          const tokenRes = await fetch('https://www.strava.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: clientId,
              client_secret: clientSecret,
              code,
              grant_type: 'authorization_code',
            }),
          });

          if (!tokenRes.ok) {
            const body = await tokenRes.text().catch(() => '');
            res.writeHead(500);
            res.end('Token exchange failed');
            server.close();
            reject(new StravadbError(`Token exchange failed: ${tokenRes.status} ${body}`, 'TOKEN_EXCHANGE_FAILED', tokenRes.status));
            return;
          }

          const data = (await tokenRes.json()) as {
            access_token: string;
            refresh_token: string;
            expires_at: number;
            athlete: { id: number };
          };

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html><body><h3>stravadb authentication successful</h3><p>You can close this window.</p></body></html>');

          const tokens: StravaTokens = {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: data.expires_at,
            athlete_id: data.athlete.id,
          };

          saveTokens(tokens);
          server.close();
          resolve(tokens);
        } catch (err) {
          server.close();
          reject(err);
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(port, async () => {
      const authUrl = [
        'https://www.strava.com/oauth/authorize',
        `?client_id=${clientId}`,
        '&response_type=code',
        `&redirect_uri=${encodeURIComponent(redirectUri)}`,
        '&approval_prompt=auto',
        '&scope=read,activity:read,activity:write,profile:read_all',
      ].join('');

      const { default: openBrowser } = await import('open');
      console.error(`Opening browser for Strava authorization...`);
      await openBrowser(authUrl);
    });

    server.on('error', reject);
  });
}
