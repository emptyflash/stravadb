import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StravaTokens } from '../src/types.js';

const originalHome = process.env.HOME;

describe('auth (token storage)', () => {
  let tokenDir: string;
  let mockHome: string;

  beforeEach(() => {
    mockHome = join(tmpdir(), 'stravadb-test-' + Date.now());
    mkdirSync(mockHome, { recursive: true });
    process.env.HOME = mockHome;

    vi.resetModules();
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    vi.restoreAllMocks();
  });

  const mockTokens: StravaTokens = {
    access_token: 'abc123',
    refresh_token: 'ref456',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    athlete_id: 12345,
  };

  it('saveTokens writes valid JSON', async () => {
    const { saveTokens, loadTokens } = await import('../src/lib/auth.js');
    saveTokens(mockTokens);

    const tokensFile = join(mockHome, '.stravadb', 'tokens.json');
    expect(existsSync(tokensFile)).toBe(true);

    const raw = JSON.parse(readFileSync(tokensFile, 'utf-8')) as StravaTokens;
    expect(raw.access_token).toBe('abc123');
    expect(raw.athlete_id).toBe(12345);
  });

  it('loadTokens returns tokens from file', async () => {
    const { saveTokens, loadTokens } = await import('../src/lib/auth.js');
    saveTokens(mockTokens);

    const loaded = loadTokens();
    expect(loaded).not.toBeNull();
    expect(loaded!.access_token).toBe('abc123');
    expect(loaded!.athlete_id).toBe(12345);
  });

  it('loadTokens returns null when no file exists', async () => {
    const { loadTokens } = await import('../src/lib/auth.js');
    const loaded = loadTokens();
    expect(loaded).toBeNull();
  });

  it('loadTokens returns null for invalid JSON', async () => {
    const dir = join(mockHome, '.stravadb');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'tokens.json'), 'not valid json');

    const { loadTokens } = await import('../src/lib/auth.js');
    const loaded = loadTokens();
    expect(loaded).toBeNull();
  });

  it('saveTokens overwrites existing tokens', async () => {
    const { saveTokens, loadTokens } = await import('../src/lib/auth.js')
    saveTokens(mockTokens);

    const updated: StravaTokens = {
      ...mockTokens,
      access_token: 'newtoken',
      expires_at: mockTokens.expires_at + 3600,
    };
    saveTokens(updated);

    const loaded = loadTokens();
    expect(loaded!.access_token).toBe('newtoken');
  });

  it('deleteTokens removes the token file', async () => {
    const { saveTokens, loadTokens, deleteTokens } = await import('../src/lib/auth.js');
    saveTokens(mockTokens);
    expect(loadTokens()).not.toBeNull();

    deleteTokens();
    expect(loadTokens()).toBeNull();
  });
});
