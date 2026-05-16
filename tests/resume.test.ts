import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const testHome = path.join(os.tmpdir(), 'stravadb-resume-test-' + Date.now());

beforeEach(() => {
  if (fs.existsSync(testHome)) fs.rmSync(testHome, { recursive: true });
  fs.mkdirSync(testHome, { recursive: true });
  process.env.HOME = testHome;
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  if (fs.existsSync(testHome)) fs.rmSync(testHome, { recursive: true });
  vi.restoreAllMocks();
});

function writeTestFile(name: string, content: string): string {
  const fp = path.join(testHome, name);
  fs.writeFileSync(fp, content);
  return fp;
}

describe('resume state', () => {
  it('saves, loads, and clears resume state', async () => {
    const { saveResume, loadResume, clearResume } = await import('../src/lib/resume.js');

    saveResume({
      key: 'testkey',
      rawData: Buffer.from('hello').toString('base64'),
      filename: 'test.txt',
      mime: 'text/plain',
      totalChunks: 3,
      nextChunk: 1,
    });

    const loaded = loadResume('testkey');
    expect(loaded).not.toBeNull();
    expect(loaded!.key).toBe('testkey');
    expect(loaded!.totalChunks).toBe(3);
    expect(loaded!.nextChunk).toBe(1);

    clearResume('testkey');
    expect(loadResume('testkey')).toBeNull();
  });

  it('loadResume returns null for unknown key', async () => {
    const { loadResume } = await import('../src/lib/resume.js');
    expect(loadResume('nonexistent')).toBeNull();
  });

  it('listResumable returns in-progress keys', async () => {
    const { saveResume, listResumable } = await import('../src/lib/resume.js');

    saveResume({ key: 'a', rawData: '', filename: '', mime: '', totalChunks: 1, nextChunk: 0 });
    saveResume({ key: 'b', rawData: '', filename: '', mime: '', totalChunks: 2, nextChunk: 1 });

    const keys = listResumable();
    expect(keys.sort()).toEqual(['a', 'b']);
  });
});

describe('put with resume', () => {
  it('creates resume state during upload, clears on completion', async () => {
    const strava = await import('../src/lib/strava.js');
    vi.spyOn(strava, 'uploadActivity').mockResolvedValue({ id: 123 } as never);

    const filePath = writeTestFile('data.txt', 'hello world test data here!');

    const { putCommand } = await import('../src/commands/put.js');
    await putCommand('resumetest', filePath);

    // After successful completion, resume state is cleared
    const { loadResume } = await import('../src/lib/resume.js');
    expect(loadResume('resumetest')).toBeNull();

    // The upload was called
    expect(strava.uploadActivity).toHaveBeenCalled();
  });

  it('resumes from saved state when all chunks already done', async () => {
    const testData = 'hello world test data here! extra bytes for chunking';
    const rawData = new Uint8Array(Buffer.from(testData));

    const { saveResume } = await import('../src/lib/resume.js');
    saveResume({
      key: 'resumetest2',
      rawData: Buffer.from(rawData).toString('base64'),
      filename: 'data2.txt',
      mime: 'text/plain',
      totalChunks: 1,
      nextChunk: 1,
    });

    const strava = await import('../src/lib/strava.js');
    vi.spyOn(strava, 'uploadActivity').mockResolvedValue({ id: 456 } as never);

    const filePath = writeTestFile('data2.txt', testData);

    const { putCommand } = await import('../src/commands/put.js');
    await putCommand('resumetest2', filePath);

    // No upload should happen (all chunks already done)
    expect(strava.uploadActivity).not.toHaveBeenCalled();

    const { loadResume } = await import('../src/lib/resume.js');
    expect(loadResume('resumetest2')).toBeNull();
  });

  it('retries on 429 and succeeds', async () => {
    const { StravadbError } = await import('../src/types.js');
    const strava = await import('../src/lib/strava.js');

    let callCount = 0;
    vi.spyOn(strava, 'uploadActivity').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new StravadbError('Rate limited', 'RATE_LIMITED', 429, 0.1);
      }
      return { id: 999 } as never;
    });

    const filePath = writeTestFile('data3.txt', 'test data here');
    const { putCommand } = await import('../src/commands/put.js');

    await putCommand('ratetest', filePath);

    expect(strava.uploadActivity).toHaveBeenCalledTimes(2);

    const { loadResume } = await import('../src/lib/resume.js');
    expect(loadResume('ratetest')).toBeNull();
  });

  it('auto-retries on 429 then clears resume state on completion', async () => {
    const testData = 'A'.repeat(3000);
    const { StravadbError } = await import('../src/types.js');
    const strava = await import('../src/lib/strava.js');

    let callCount = 0;
    vi.spyOn(strava, 'uploadActivity').mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        throw new StravadbError('Rate limited', 'RATE_LIMITED', 429, 0.1);
      }
      return { id: callCount * 100 } as never;
    });

    const filePath = writeTestFile('data4.txt', testData);
    const { putCommand } = await import('../src/commands/put.js');

    // Should auto-retry after short delay and complete
    await putCommand('partialtest', filePath);

    // All chunks completed, state cleared
    const { loadResume } = await import('../src/lib/resume.js');
    expect(loadResume('partialtest')).toBeNull();
  });

  it('non-rate-limit error rethrows and saves progress', async () => {
    const { StravadbError } = await import('../src/types.js');
    const strava = await import('../src/lib/strava.js');

    vi.spyOn(strava, 'uploadActivity').mockRejectedValue(
      new StravadbError('Upload error', 'UPLOAD_ERROR', 500),
    );

    const filePath = writeTestFile('data5.txt', 'test data');
    const { putCommand } = await import('../src/commands/put.js');

    await expect(putCommand('errtest', filePath)).rejects.toThrow('Upload error');

    const { loadResume } = await import('../src/lib/resume.js');
    const state = loadResume('errtest');
    expect(state).not.toBeNull();
    expect(state!.nextChunk).toBe(0);
  });
});
