/**
 * Content-addressed storage for the heavy half of the evidence.
 *
 * The ledger holds a hash; the bytes live here, under `.craft/evidence`, out
 * of git. Regenerable by construction — everything in it is the deterministic
 * output of a render — so losing the directory costs a re-run and nothing else.
 * Putting it in git would put megabytes of PNG in every clone to protect data
 * that a command reproduces in seconds.
 *
 * Content-addressed rather than named after the subject, because the whole
 * point of the review queue is that two hundred scenarios can share one delta:
 * identical evidence has to be one object, or a border-radius change writes two
 * hundred copies of the same file.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const DEFAULT_EVIDENCE_DIR = '.craft/evidence';

export type EvidenceBody = string | Uint8Array;

/** The hash a piece of evidence is stored and compared under. */
export function evidenceHash(body: EvidenceBody): string {
  return createHash('sha256')
    .update(typeof body === 'string' ? body : Buffer.from(body))
    .digest('hex')
    .slice(0, 32);
}

/**
 * Hash of a value, canonicalised first.
 *
 * Object keys are sorted, because a digest whose hash depends on the order a
 * collector filled a record in would put everything in the review queue after
 * an unrelated refactor of the collector.
 */
export function evidenceHashOf(value: unknown): string {
  return evidenceHash(canonicalJson(value));
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`;
}

export interface EvidenceStore {
  readonly directory: string;
  /** Writes a body and returns its hash. Idempotent. */
  put(body: EvidenceBody, extension?: string): Promise<string>;
  /**
   * Writes a body under a name the caller already owns.
   *
   * Used for the slice manifest behind a fingerprint: the fingerprint is
   * already a content address of those leaves, so re-hashing them would create
   * a second address for the same fact and `attest why` would have to carry a
   * pointer nobody can reconstruct.
   */
  putAs(name: string, body: EvidenceBody, extension?: string): Promise<string>;
  get(hash: string, extension?: string): Promise<Uint8Array | undefined>;
  getText(hash: string, extension?: string): Promise<string | undefined>;
  has(hash: string, extension?: string): Promise<boolean>;
  /** Every hash currently stored, for garbage collection. */
  list(): Promise<readonly string[]>;
}

const shard = (hash: string): string => hash.slice(0, 2);

const pathFor = (directory: string, hash: string, extension: string): string =>
  join(directory, shard(hash), `${hash}${extension}`);

export function createEvidenceStore(directory: string): EvidenceStore {
  const write = async (path: string, body: EvidenceBody): Promise<void> => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, typeof body === 'string' ? body : Buffer.from(body));
  };

  const read = async (path: string): Promise<Uint8Array | undefined> => {
    try {
      return await readFile(path);
    } catch {
      return undefined;
    }
  };

  return {
    directory,
    async put(body, extension = '.json') {
      const hash = evidenceHash(body);
      const path = pathFor(directory, hash, extension);
      // Content-addressed: an existing object is byte-identical by definition,
      // so rewriting it would only risk tearing a file another process reads.
      if (!(await read(path))) await write(path, body);
      return hash;
    },
    async putAs(name, body, extension = '.json') {
      await write(pathFor(directory, name, extension), body);
      return name;
    },
    async get(hash, extension = '.json') {
      return await read(pathFor(directory, hash, extension));
    },
    async getText(hash, extension = '.json') {
      const bytes = await read(pathFor(directory, hash, extension));
      return bytes === undefined ? undefined : Buffer.from(bytes).toString('utf8');
    },
    async has(hash, extension = '.json') {
      return (await read(pathFor(directory, hash, extension))) !== undefined;
    },
    async list() {
      const found: string[] = [];
      let shards: string[];
      try {
        shards = await readdir(directory);
      } catch {
        return [];
      }
      for (const entry of shards) {
        try {
          for (const file of await readdir(join(directory, entry))) {
            found.push(file.replace(/\.[^.]+$/, ''));
          }
        } catch {
          continue;
        }
      }
      return [...new Set(found)].sort();
    },
  };
}
