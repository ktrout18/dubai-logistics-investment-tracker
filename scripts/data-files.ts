/** Node-only helpers for reading the canonical data files from disk. */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_FILES, type DataFileKey } from '../shared/index.ts';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function dataPath(key: DataFileKey, root = REPO_ROOT): string {
  return resolve(root, DATA_FILES[key]);
}

/** Read and JSON-parse one data file. Throws with the file path on parse errors. */
export async function readDataFile(key: DataFileKey, root = REPO_ROOT): Promise<unknown> {
  const path = dataPath(key, root);
  const text = await readFile(path, 'utf8');
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    throw new Error(`${path}: invalid JSON (${(e as Error).message})`);
  }
}

/** Read all five data files. */
export async function readAllDataFiles(root = REPO_ROOT): Promise<Record<DataFileKey, unknown>> {
  const keys = Object.keys(DATA_FILES) as DataFileKey[];
  const values = await Promise.all(keys.map((k) => readDataFile(k, root)));
  return Object.fromEntries(keys.map((k, i) => [k, values[i]])) as Record<DataFileKey, unknown>;
}
