/**
 * The sessions of an app's suite, kept in the repository next to its
 * manifest (`<app>/.craft/golden-sessions/<id>.json.gz`): the archive of the
 * log server forgets a session after a month, or when it is emptied, and the
 * suite must not go with it. A session is copied there when it enters the
 * suite, only once nothing in it looks like a secret or a person's data, and
 * put back into the archive before a check replays it.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

export const GOLDEN_SESSION_FORMAT = 'craft-golden-session';
const SUFFIX = '.json.gz';

/** Where the app keeps the sessions of its suite. */
export function goldenSessionsDirOf(scope, repository) {
  return resolve(repository, scope, '.craft', 'golden-sessions');
}

const SENSITIVE_KEY = /password|passwd|secret|token|authorization|cookie|api[-_]?key|private[-_]?key/i;
const SAFE_PLACEHOLDER = /^(\[REDACTED\]|craft-ref:[a-f0-9]{16})$/i;
const EMAIL = /[A-Z0-9._%+-]+@([A-Z0-9-]+\.)+[A-Z]{2,}/gi;
/** Domains that name no one: reserved for examples, tests and demos. */
const SAFE_EMAIL_DOMAIN = /\.(demo|test|example|invalid|localhost)$|(^|\.)example\.(com|org|net)$/i;
const JWT = /eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/;
const BEARER = /\bbearer\s+[\w.~+/-]{8,}/i;

/**
 * What in a session looks like a secret or a person's data: a value left
 * under a sensitive key, an e-mail address outside the reserved domains, a
 * token. Read in JSON kept as text too (request and response bodies).
 */
export function sensitiveFindings(session) {
  const findings = [];
  const found = (path, reason) => {
    if (findings.length < 20) findings.push({ path, reason });
  };
  const visit = (value, key, path) => {
    if (typeof value === 'string') {
      // JSON kept as text is read as what it holds.
      if (/^\s*[[{]/.test(value)) {
        try {
          visit(JSON.parse(value), key, `${path}(json)`);
          return;
        } catch {
          // Text that only looks like JSON.
        }
      }
      if (key !== undefined && SENSITIVE_KEY.test(key) && value !== '' && !SAFE_PLACEHOLDER.test(value))
        found(path, `valeur non caviardée sous « ${key} »`);
      for (const match of value.matchAll(EMAIL))
        if (!SAFE_EMAIL_DOMAIN.test(match[0].split('@')[1] ?? '')) found(path, `adresse e-mail ${match[0]}`);
      if (JWT.test(value)) found(path, 'jeton JWT');
      if (BEARER.test(value)) found(path, 'jeton Bearer');
      return;
    }
    if (Array.isArray(value)) value.forEach((item, index) => visit(item, key, `${path}[${index}]`));
    else if (value && typeof value === 'object')
      for (const [entryKey, entry] of Object.entries(value)) visit(entry, entryKey, path ? `${path}.${entryKey}` : entryKey);
  };
  visit(session, undefined, '');
  return findings;
}

/** JSON with sorted keys: the same session always gives the same bytes. */
function stableJson(value) {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map((name) => [name, item[name]]))
      : item,
  );
}

/** A session as the repository keeps it: the archive's export, and the date it began. */
export function encodeGoldenSession(input) {
  return gzipSync(stableJson({ format: GOLDEN_SESSION_FORMAT, version: 1, id: input.id, createdAt: input.createdAt, session: input.session }));
}

export function decodeGoldenSession(bytes) {
  const value = JSON.parse(gunzipSync(bytes).toString('utf8'));
  if (value?.format !== GOLDEN_SESSION_FORMAT || value.version !== 1 || typeof value.id !== 'string' || typeof value.createdAt !== 'string' || !value.session)
    throw new Error('Ce fichier n’est pas une session de suite.');
  return value;
}

async function archiveJson(archive, path, fetchImpl, init) {
  const response = await fetchImpl(`${archive.replace(/\/$/, '')}${path}`, init);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`L’archive refuse ${path} (${response.status}).`);
  return response.json();
}

/**
 * Makes the repository and the archive hold the same sessions of the suite.
 * A session the repository lacks is copied from the archive (refused, and
 * nothing written, when something in it looks sensitive); a session the
 * archive lacks is put back from the repository. Files of sessions no longer
 * in the suite are removed. Throws when a session is in neither.
 */
export async function syncGoldenSessions({ archive, dir, sessionIds, fetchImpl = fetch }) {
  const wanted = new Set(sessionIds);
  const missing = sessionIds.filter((id) => !existsSync(join(dir, `${id}${SUFFIX}`)));
  const copies = [];
  if (missing.length > 0) {
    const summaries = (await archiveJson(archive, '/sessions', fetchImpl)) ?? [];
    const list = Array.isArray(summaries) ? summaries : (summaries.sessions ?? []);
    const refused = [];
    const lost = [];
    for (const id of missing) {
      const summary = list.find((item) => item.id === id);
      const session = summary && (await archiveJson(archive, `/sessions/${id}`, fetchImpl));
      if (!session) {
        lost.push(id);
        continue;
      }
      const findings = sensitiveFindings(session);
      if (findings.length > 0) refused.push({ id, findings });
      else copies.push({ id, createdAt: summary.createdAt, session });
    }
    if (lost.length > 0)
      throw new Error(`Session(s) de la suite introuvable(s), ni dans le dépôt ni dans l’archive : ${lost.join(', ')}. Choisissez la suite à nouveau (--select).`);
    if (refused.length > 0)
      throw new Error(
        [
          'Session(s) non copiée(s) dans le dépôt : quelque chose y ressemble à un secret ou à une donnée personnelle.',
          ...refused.flatMap(({ id, findings }) => [`  ${id}`, ...findings.map((finding) => `    ${finding.path} : ${finding.reason}`)]),
        ].join('\n'),
      );
  }
  mkdirSync(dir, { recursive: true });
  for (const copy of copies) {
    const file = join(dir, `${copy.id}${SUFFIX}`);
    writeFileSync(`${file}.tmp`, encodeGoldenSession(copy));
    renameSync(`${file}.tmp`, file);
  }
  const removed = [];
  for (const name of readdirSync(dir))
    if (name.endsWith(SUFFIX) && !wanted.has(name.slice(0, -SUFFIX.length))) {
      rmSync(join(dir, name));
      removed.push(name.slice(0, -SUFFIX.length));
    }
  let restored = 0;
  for (const id of sessionIds) {
    if (copies.some((copy) => copy.id === id)) continue;
    const kept = decodeGoldenSession(readFileSync(join(dir, `${id}${SUFFIX}`)));
    const answer = await archiveJson(archive, `/sessions/${id}`, fetchImpl, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ createdAt: kept.createdAt, session: kept.session }),
    });
    if (answer?.outcome === 'restored') restored += 1;
    else if (answer?.outcome !== 'kept') throw new Error(`L’archive refuse la session ${id} gardée dans le dépôt.`);
  }
  return { copied: copies.map((copy) => copy.id), restored, removed };
}
