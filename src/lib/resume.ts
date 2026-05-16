import * as fs from 'node:fs';
import * as path from 'node:path';
import { CONFIG_DIR } from './auth.js';
import { ResumeState } from '../types.js';

const RESUME_DIR = path.join(CONFIG_DIR, 'resume');

function ensureResumeDir(): void {
  if (!fs.existsSync(RESUME_DIR)) {
    fs.mkdirSync(RESUME_DIR, { recursive: true });
  }
}

function filePath(key: string): string {
  return path.join(RESUME_DIR, `${encodeURIComponent(key)}.json`);
}

export function saveResume(state: ResumeState): void {
  ensureResumeDir();
  fs.writeFileSync(filePath(state.key), JSON.stringify(state, null, 2));
}

export function loadResume(key: string): ResumeState | null {
  try {
    const data = fs.readFileSync(filePath(key), 'utf-8');
    return JSON.parse(data) as ResumeState;
  } catch {
    return null;
  }
}

export function clearResume(key: string): void {
  try {
    fs.unlinkSync(filePath(key));
  } catch {
    // already gone
  }
}

export function listResumable(): string[] {
  ensureResumeDir();
  const keys: string[] = [];
  try {
    for (const entry of fs.readdirSync(RESUME_DIR)) {
      if (entry.endsWith('.json')) {
        const raw = fs.readFileSync(path.join(RESUME_DIR, entry), 'utf-8');
        const state = JSON.parse(raw) as ResumeState;
        keys.push(state.key);
      }
    }
  } catch {
    // directory doesn't exist or is empty
  }
  return keys;
}
