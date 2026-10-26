import type { SendContextEvent, SendContextSession } from '@craft-ts/core';
import {
  fingerprintDebugSessionReference,
  getDebugSessionReferenceSalt,
  redactDebugSessionReferences,
  type DebugSessionReference,
} from './debug-session-references';

export const INITIAL_BROWSER_STORAGE_EVENT = 'browser-storage-initial';
/** Emitted whenever the origin storage differs from its last capture. */
export const BROWSER_STORAGE_CHECKPOINT_EVENT = 'browser-storage-checkpoint';

type EncodedValue =
  | null
  | boolean
  | number
  | string
  | EncodedValue[]
  | {
      readonly [key: string]: EncodedValue;
    };

type IndexedDbStoreSnapshot = Readonly<{
  name: string;
  keyPath: string | readonly string[] | null;
  autoIncrement: boolean;
  indexes: readonly Readonly<{
    name: string;
    keyPath: string | readonly string[];
    unique: boolean;
    multiEntry: boolean;
  }>[];
  records: readonly Readonly<{ key: EncodedValue; value: EncodedValue }>[];
}>;

type IndexedDbSnapshot = Readonly<{
  name: string;
  version: number;
  captured: boolean;
  stores: readonly IndexedDbStoreSnapshot[];
  error?: string;
}>;

export type BrowserStorageSnapshot = Readonly<{
  version: 1;
  localStorage: readonly (readonly [string, string])[];
  sessionStorage: readonly (readonly [string, string])[];
  cookies: readonly CookieSnapshot[];
  cookieStoreSupported: boolean;
  indexedDbSupported: boolean;
  indexedDb: readonly IndexedDbSnapshot[];
  warnings: readonly string[];
}>;

/** Redacts persisted reference values before snapshots enter a portable archive. */
export function redactBrowserStorageSnapshotForArchive(
  snapshot: BrowserStorageSnapshot,
  session: object,
): Readonly<{
  snapshot: BrowserStorageSnapshot;
  refs: readonly DebugSessionReference[];
}> {
  const salt = getDebugSessionReferenceSalt(session);
  const generic = redactDebugSessionReferences(snapshot, salt, 'storage', 'in');
  const redacted = generic.value as BrowserStorageSnapshot;
  const refs = [...generic.refs];
  // Database, store, and index metadata describes the storage schema; it is
  // not persisted user data or credentials. Keep it readable while redacting
  // IndexedDB record keys and values through the generic pass.
  const indexedDb = redacted.indexedDb.map((database, databaseIndex) => ({
    ...database,
    name: snapshot.indexedDb[databaseIndex]?.name ?? database.name,
    stores: database.stores.map((store, storeIndex) => {
      const originalStore = snapshot.indexedDb[databaseIndex]?.stores[storeIndex];
      return {
        ...store,
        name: originalStore?.name ?? store.name,
        keyPath: originalStore?.keyPath ?? store.keyPath,
        indexes: store.indexes.map((index, indexIndex) => ({
          ...index,
          name: originalStore?.indexes[indexIndex]?.name ?? index.name,
          keyPath:
            originalStore?.indexes[indexIndex]?.keyPath ?? index.keyPath,
        })),
      };
    }),
  }));
  const localStorage = redactStoragePairs(
    snapshot.localStorage,
    'localStorage',
    salt,
    refs,
  );
  const sessionStorage = redactStoragePairs(
    snapshot.sessionStorage,
    'sessionStorage',
    salt,
    refs,
  );
  const cookies = snapshot.cookies.map((cookie, index) => {
    if (!/(?:auth|session|token|secret|csrf)/i.test(cookie.name)) return cookie;
    const fingerprint = fingerprintDebugSessionReference(cookie.value, salt);
    refs.push({
      path: `storage.cookies[${index}].value`,
      fingerprint,
      direction: 'in',
    });
    return { ...cookie, value: `craft-ref:${fingerprint}` };
  });
  return {
    snapshot: { ...redacted, localStorage, sessionStorage, indexedDb, cookies },
    refs: [
      ...new Map(
        refs.map((ref) => [
          `${ref.path}:${ref.fingerprint}:${ref.direction}`,
          ref,
        ]),
      ).values(),
    ],
  };
}

function redactStoragePairs(
  entries: BrowserStorageSnapshot['localStorage'],
  storeName: 'localStorage' | 'sessionStorage',
  salt: string,
  refs: DebugSessionReference[],
): BrowserStorageSnapshot['localStorage'] {
  return entries.map(([key, originalValue], index) => {
    if (!/(?:auth|session|token|secret|csrf)/i.test(key))
      return [key, originalValue] as const;
    let value = originalValue;
    try {
      const parsed: unknown = JSON.parse(originalValue);
      const redacted = redactDebugSessionReferences(
        parsed,
        salt,
        `storage.${storeName}[${index}][1]`,
        'in',
      );
      refs.push(...redacted.refs);
      value = JSON.stringify(redacted.value);
    } catch {
      const fingerprint = fingerprintDebugSessionReference(originalValue, salt);
      refs.push({
        path: `storage.${storeName}[${index}][1]`,
        fingerprint,
        direction: 'in',
      });
      value = `craft-ref:${fingerprint}`;
    }
    return [key, value] as const;
  });
}

type CookieSnapshot = Readonly<{
  name: string;
  value: string;
  path?: string;
  domain?: string;
  expires?: number | null;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  partitioned?: boolean;
}>;

type CookieStoreLike = {
  getAll(): Promise<readonly CookieSnapshot[]>;
  set(cookie: CookieSnapshot): Promise<void>;
  delete(
    cookie: Pick<CookieSnapshot, 'name' | 'path' | 'domain'>,
  ): Promise<void>;
};

type IndexedDbFactoryWithDatabases = IDBFactory & {
  databases?: () => Promise<readonly { name?: string; version?: number }[]>;
};

const REPLAY_RESTORE_MARKER = 'craft-debug-replay-storage-run';

/** Captures origin storage before the app bootstraps and mutates it. */
export async function captureBrowserStorageSnapshot(): Promise<BrowserStorageSnapshot> {
  const warnings: string[] = [];
  const localStorage = readNamedWebStorage('localStorage', warnings);
  const sessionStorage = readNamedWebStorage('sessionStorage', warnings);
  const [cookieResult, indexedDbResult] = await Promise.all([
    readCookies(warnings),
    readIndexedDb(warnings),
  ]);
  return {
    version: 1,
    localStorage,
    sessionStorage,
    cookies: cookieResult.cookies,
    cookieStoreSupported: cookieResult.supported,
    indexedDbSupported: indexedDbResult.supported,
    indexedDb: indexedDbResult.databases,
    warnings,
  };
}

/** Restores the captured origin storage before reloading the replay target. */
export async function restoreBrowserStorageSnapshot(
  snapshot: BrowserStorageSnapshot,
): Promise<void> {
  assertBrowserStorageSnapshotRestorable(snapshot);
  ɵrestoreWebStorage(window.localStorage, snapshot.localStorage);
  ɵrestoreWebStorage(window.sessionStorage, snapshot.sessionStorage);
  await restoreCookies(snapshot.cookies, snapshot.cookieStoreSupported);
  if (snapshot.indexedDbSupported) await restoreIndexedDb(snapshot.indexedDb);
}

/** Refuses snapshots that silently omit a browser store required for replay. */
export function assertBrowserStorageSnapshotRestorable(
  snapshot: BrowserStorageSnapshot,
): void {
  const incompleteWarning = snapshot.warnings.find((warning) =>
    /^(?:localStorage|sessionStorage) could not be read:|^document\.cookie could not be read:|^IndexedDB (?:is unavailable:|database enumeration is not supported|could not be enumerated:|.+ could not be captured:)/.test(
      warning,
    ),
  );
  if (incompleteWarning)
    throw new Error(
      `Browser storage snapshot is incomplete and cannot be replayed: ${incompleteWarning}`,
    );
  if (!snapshot.indexedDbSupported)
    throw new Error(
      'IndexedDB could not be enumerated, so the browser storage snapshot cannot be replayed deterministically.',
    );
  const uncapturedDatabase = snapshot.indexedDb.find(
    (database) => !database.captured,
  );
  if (uncapturedDatabase)
    throw new Error(
      `IndexedDB ${uncapturedDatabase.name} was not captured and cannot be restored for replay.`,
    );
}

/** The replay bridge uses this marker to avoid restoring twice after reload. */
export function replayStorageWasRestored(runId: string): boolean {
  try {
    return window.sessionStorage.getItem(REPLAY_RESTORE_MARKER) === runId;
  } catch {
    return false;
  }
}

export function hasReplayStorageRestoreMarker(): boolean {
  try {
    return window.sessionStorage.getItem(REPLAY_RESTORE_MARKER) !== null;
  } catch {
    return false;
  }
}

export function markReplayStorageRestored(runId: string): void {
  window.sessionStorage.setItem(REPLAY_RESTORE_MARKER, runId);
}

export function clearReplayStorageRestoreMarker(runId: string): void {
  try {
    if (window.sessionStorage.getItem(REPLAY_RESTORE_MARKER) === runId)
      window.sessionStorage.removeItem(REPLAY_RESTORE_MARKER);
  } catch {
    // Replay cleanup must not fail when sessionStorage is unavailable.
  }
}

function readWebStorage(
  storage: Storage,
  name: string,
  warnings: string[],
): readonly (readonly [string, string])[] {
  try {
    return Array.from({ length: storage.length }, (_, index) => {
      const key = storage.key(index)!;
      return [key, storage.getItem(key) ?? ''] as const;
    });
  } catch (error) {
    warnings.push(`${name} could not be read: ${errorMessage(error)}`);
    return [];
  }
}

function readNamedWebStorage(
  name: 'localStorage' | 'sessionStorage',
  warnings: string[],
): readonly (readonly [string, string])[] {
  try {
    return readWebStorage(window[name], name, warnings);
  } catch (error) {
    warnings.push(`${name} could not be read: ${errorMessage(error)}`);
    return [];
  }
}

/**
 * Keys the dev tooling keeps for this tab: its MCP bridge id, its own debug
 * session and participant, the guided resume journal, the restore markers.
 * Restoring a recording must not hand them the recorded tab's values — the
 * tab would join the recorded session and lose its bridge identity.
 */
const TOOLING_STORAGE_KEY = /^(?:craft-ts\.(?:dev-tools|guided-resume)\.|craft-debug-)/;

export function ɵrestoreWebStorage(
  storage: Storage,
  entries: readonly (readonly [string, string])[],
): void {
  for (const key of Object.keys(storage))
    if (!TOOLING_STORAGE_KEY.test(key)) storage.removeItem(key);
  for (const [key, value] of entries)
    if (!TOOLING_STORAGE_KEY.test(key)) storage.setItem(key, value);
}

async function readCookies(
  warnings: string[],
): Promise<{ cookies: readonly CookieSnapshot[]; supported: boolean }> {
  let cookieStore: CookieStoreLike | undefined;
  try {
    cookieStore = getCookieStore();
  } catch (error) {
    warnings.push(`Cookie Store API is unavailable: ${errorMessage(error)}`);
  }
  if (cookieStore) {
    try {
      return { cookies: await cookieStore.getAll(), supported: true };
    } catch (error) {
      warnings.push(
        `Cookie Store API could not read cookies: ${errorMessage(error)}`,
      );
    }
  }
  try {
    return {
      cookies: document.cookie
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const separator = part.indexOf('=');
          return {
            name: separator < 0 ? part : part.slice(0, separator),
            value: separator < 0 ? '' : part.slice(separator + 1),
            path: '/',
          };
        }),
      supported: false,
    };
  } catch (error) {
    warnings.push(`document.cookie could not be read: ${errorMessage(error)}`);
    return { cookies: [], supported: false };
  }
}

async function restoreCookies(
  cookies: readonly CookieSnapshot[],
  useCookieStore: boolean,
): Promise<void> {
  const cookieStore = getCookieStore();
  if (useCookieStore && cookieStore) {
    const current = await cookieStore.getAll();
    await Promise.all(
      current.map(({ name, path, domain }) =>
        cookieStore.delete({ name, path, domain }),
      ),
    );
    await Promise.all(cookies.map((cookie) => cookieStore.set(cookie)));
    return;
  }
  for (const part of document.cookie.split(';')) {
    const name = part.trim().split('=', 1)[0];
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
  for (const cookie of cookies) {
    const attributes = [
      `${cookie.name}=${cookie.value}`,
      `Path=${cookie.path ?? '/'}`,
    ];
    if (cookie.domain) attributes.push(`Domain=${cookie.domain}`);
    if (cookie.expires !== undefined && cookie.expires !== null)
      attributes.push(`Expires=${new Date(cookie.expires).toUTCString()}`);
    if (cookie.secure) attributes.push('Secure');
    if (cookie.sameSite) attributes.push(`SameSite=${cookie.sameSite}`);
    if (cookie.partitioned) attributes.push('Partitioned');
    document.cookie = attributes.join('; ');
  }
}

function getCookieStore(): CookieStoreLike | undefined {
  return (window as Window & { cookieStore?: CookieStoreLike }).cookieStore;
}

async function readIndexedDb(warnings: string[]): Promise<{
  supported: boolean;
  databases: readonly IndexedDbSnapshot[];
}> {
  let factory: IndexedDbFactoryWithDatabases | undefined;
  try {
    factory = window.indexedDB as IndexedDbFactoryWithDatabases | undefined;
  } catch (error) {
    warnings.push(`IndexedDB is unavailable: ${errorMessage(error)}`);
    return { supported: false, databases: [] };
  }
  if (!factory?.databases) {
    warnings.push(
      'IndexedDB database enumeration is not supported by this browser.',
    );
    return { supported: false, databases: [] };
  }
  let databases: readonly { name?: string; version?: number }[];
  try {
    databases = await factory.databases();
  } catch (error) {
    warnings.push(`IndexedDB could not be enumerated: ${errorMessage(error)}`);
    return { supported: false, databases: [] };
  }
  const snapshots = await Promise.all(
    databases.flatMap(({ name, version }) =>
      name ? [readDatabase(factory, name, version ?? 1, warnings)] : [],
    ),
  );
  return { supported: true, databases: snapshots };
}

async function readDatabase(
  factory: IDBFactory,
  name: string,
  version: number,
  warnings: string[],
): Promise<IndexedDbSnapshot> {
  let database: IDBDatabase | undefined;
  try {
    database = await openDatabase(factory, name);
    const stores = await Promise.all(
      Array.from(database.objectStoreNames, (storeName) =>
        readObjectStore(database!, storeName),
      ),
    );
    return { name, version: database.version, captured: true, stores };
  } catch (error) {
    const message = errorMessage(error);
    warnings.push(`IndexedDB ${name} could not be captured: ${message}`);
    return { name, version, captured: false, stores: [], error: message };
  } finally {
    database?.close();
  }
}

async function readObjectStore(
  database: IDBDatabase,
  name: string,
): Promise<IndexedDbStoreSnapshot> {
  const transaction = database.transaction(name, 'readonly');
  const store = transaction.objectStore(name);
  const [keys, values] = await Promise.all([
    requestValue(store.getAllKeys()),
    requestValue(store.getAll()),
  ]);
  const indexes = Array.from(store.indexNames, (indexName) => {
    const index = store.index(indexName);
    return {
      name: index.name,
      keyPath: index.keyPath as string | readonly string[],
      unique: index.unique,
      multiEntry: index.multiEntry,
    };
  });
  const records = await Promise.all(
    values.map(async (value, index) => ({
      key: await encodeStructuredValue(keys[index]),
      value: await encodeStructuredValue(value),
    })),
  );
  return {
    name,
    keyPath: store.keyPath as string | readonly string[] | null,
    autoIncrement: store.autoIncrement,
    indexes,
    records,
  };
}

async function restoreIndexedDb(
  databases: readonly IndexedDbSnapshot[],
): Promise<void> {
  const factory = window.indexedDB as IndexedDbFactoryWithDatabases;
  const capturedNames = new Set(databases.map((database) => database.name));
  const current = (await factory.databases?.()) ?? [];
  await Promise.all(
    current.flatMap(({ name }) =>
      name && !capturedNames.has(name) ? [deleteDatabase(factory, name)] : [],
    ),
  );
  for (const snapshot of databases) {
    if (!snapshot.captured) continue;
    const database = await openDatabaseForRestore(factory, snapshot);
    try {
      await restoreDatabaseContents(database, snapshot);
    } finally {
      database.close();
    }
  }
}

async function openDatabaseForRestore(
  factory: IndexedDbFactoryWithDatabases,
  snapshot: IndexedDbSnapshot,
): Promise<IDBDatabase> {
  const currentVersion = ((await factory.databases?.()) ?? []).find(
    (database) => database.name === snapshot.name,
  )?.version;
  if (currentVersion === undefined)
    return openDatabaseWithSnapshot(factory, snapshot, snapshot.version);
  const current = await openDatabase(factory, snapshot.name);
  const schemaMatches = databaseSchemaMatches(current, snapshot);
  const version = current.version;
  current.close();
  if (schemaMatches) return openDatabase(factory, snapshot.name);
  return openDatabaseWithSnapshot(
    factory,
    snapshot,
    Math.max(version + 1, snapshot.version),
  );
}

async function openDatabaseWithSnapshot(
  factory: IDBFactory,
  snapshot: IndexedDbSnapshot,
  version: number,
): Promise<IDBDatabase> {
  pendingSchema.set(snapshot.name, snapshot);
  try {
    return await openDatabase(factory, snapshot.name, version);
  } finally {
    pendingSchema.delete(snapshot.name);
  }
}

function databaseSchemaMatches(
  database: IDBDatabase,
  snapshot: IndexedDbSnapshot,
): boolean {
  if (database.objectStoreNames.length !== snapshot.stores.length) return false;
  for (const expected of snapshot.stores) {
    if (!database.objectStoreNames.contains(expected.name)) return false;
    const transaction = database.transaction(expected.name, 'readonly');
    const actual = transaction.objectStore(expected.name);
    if (
      JSON.stringify(actual.keyPath) !== JSON.stringify(expected.keyPath) ||
      actual.autoIncrement !== expected.autoIncrement ||
      actual.indexNames.length !== expected.indexes.length
    )
      return false;
    for (const indexSnapshot of expected.indexes) {
      if (!actual.indexNames.contains(indexSnapshot.name)) return false;
      const index = actual.index(indexSnapshot.name);
      if (
        JSON.stringify(index.keyPath) !==
          JSON.stringify(indexSnapshot.keyPath) ||
        index.unique !== indexSnapshot.unique ||
        index.multiEntry !== indexSnapshot.multiEntry
      )
        return false;
    }
  }
  return true;
}

async function restoreDatabaseContents(
  database: IDBDatabase,
  snapshot: IndexedDbSnapshot,
): Promise<void> {
  if (snapshot.stores.length === 0) return;
  const records = await Promise.all(
    snapshot.stores.map(async (store) => ({
      name: store.name,
      records: await Promise.all(
        store.records.map(async (record) => ({
          key: await decodeStructuredValue(record.key, new Map()),
          value: await decodeStructuredValue(record.value, new Map()),
        })),
      ),
    })),
  );
  const transaction = database.transaction(
    snapshot.stores.map((store) => store.name),
    'readwrite',
  );
  for (const storeSnapshot of records) {
    const store = transaction.objectStore(storeSnapshot.name);
    store.clear();
    for (const record of storeSnapshot.records) {
      if (store.keyPath === null)
        store.put(record.value, record.key as IDBValidKey);
      else store.put(record.value);
    }
  }
  await transactionDone(transaction);
}

function openDatabase(
  factory: IDBFactory,
  name: string,
  version?: number,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request =
      version === undefined ? factory.open(name) : factory.open(name, version);
    request.addEventListener('upgradeneeded', () => {
      const database = request.result;
      const snapshot = pendingSchema.get(name);
      if (snapshot) {
        for (const storeName of Array.from(database.objectStoreNames))
          database.deleteObjectStore(storeName);
        for (const store of snapshot.stores) createObjectStore(database, store);
      }
    });
    request.addEventListener('success', () => resolve(request.result), {
      once: true,
    });
    request.addEventListener('error', () => reject(request.error), {
      once: true,
    });
    request.addEventListener(
      'blocked',
      () =>
        reject(
          new Error(`Opening IndexedDB ${name} is blocked by another page.`),
        ),
      { once: true },
    );
  });
}

const pendingSchema = new Map<string, IndexedDbSnapshot>();

function createObjectStore(
  database: IDBDatabase,
  snapshot: IndexedDbStoreSnapshot,
): IDBObjectStore {
  const store = database.createObjectStore(snapshot.name, {
    keyPath: mutableKeyPath(snapshot.keyPath),
    autoIncrement: snapshot.autoIncrement,
  });
  for (const index of snapshot.indexes)
    store.createIndex(index.name, mutableKeyPath(index.keyPath)!, {
      unique: index.unique,
      multiEntry: index.multiEntry,
    });
  return store;
}

function mutableKeyPath(
  keyPath: string | readonly string[] | null,
): string | string[] | null {
  return Array.isArray(keyPath) ? [...keyPath] : (keyPath as string | null);
}

function deleteDatabase(factory: IDBFactory, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.addEventListener('success', () => resolve(), { once: true });
    request.addEventListener('error', () => reject(request.error), {
      once: true,
    });
    request.addEventListener(
      'blocked',
      () =>
        reject(
          new Error(`Deleting IndexedDB ${name} is blocked by another page.`),
        ),
      { once: true },
    );
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), {
      once: true,
    });
    request.addEventListener('error', () => reject(request.error), {
      once: true,
    });
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error), {
      once: true,
    });
    transaction.addEventListener('error', () => reject(transaction.error), {
      once: true,
    });
  });
}

async function encodeStructuredValue(
  value: unknown,
  state: { ids: WeakMap<object, number>; nextId: number } = {
    ids: new WeakMap(),
    nextId: 0,
  },
): Promise<EncodedValue> {
  if (value === undefined) return { $type: 'undefined' };
  if (typeof value === 'bigint')
    return { $type: 'bigint', value: value.toString() };
  if (typeof value === 'number' && !Number.isFinite(value))
    return { $type: 'number', value: String(value) };
  if (value === null || typeof value !== 'object') return value as EncodedValue;
  const existingId = state.ids.get(value);
  if (existingId !== undefined) return { $ref: existingId };
  const id = state.nextId++;
  state.ids.set(value, id);
  const withId = (type: string, fields: Record<string, EncodedValue>) => ({
    $id: id,
    $type: type,
    ...fields,
  });
  if (value instanceof Date)
    return withId('date', { value: value.toISOString() });
  if (value instanceof RegExp)
    return withId('regexp', { source: value.source, flags: value.flags });
  if (value instanceof ArrayBuffer)
    return withId('array-buffer', {
      bytes: bytesToBase64(new Uint8Array(value)),
    });
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    return withId('typed-array', {
      constructor: value.constructor.name,
      bytes: bytesToBase64(bytes),
    });
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    const bytes = new Uint8Array(await value.arrayBuffer());
    return withId('blob', {
      bytes: bytesToBase64(bytes),
      mimeType: value.type,
      ...(typeof File !== 'undefined' && value instanceof File
        ? { name: value.name, lastModified: value.lastModified }
        : {}),
    });
  }
  if (value instanceof Map)
    return withId('map', {
      entries: await Promise.all(
        [...value].map(async ([key, entry]) => [
          await encodeStructuredValue(key, state),
          await encodeStructuredValue(entry, state),
        ]),
      ),
    });
  if (value instanceof Set)
    return withId('set', {
      values: await Promise.all(
        [...value].map((entry) => encodeStructuredValue(entry, state)),
      ),
    });
  if (Array.isArray(value))
    return withId('array', {
      values: await Promise.all(
        value.map((entry) => encodeStructuredValue(entry, state)),
      ),
    });
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new Error(
      `Unsupported IndexedDB value type: ${value.constructor?.name ?? 'unknown'}.`,
    );
  return withId('object', {
    nullPrototype: Object.getPrototypeOf(value) === null,
    entries: await Promise.all(
      Object.entries(value).map(async ([key, entry]) => [
        key,
        await encodeStructuredValue(entry, state),
      ]),
    ),
  });
}

async function decodeStructuredValue(
  value: EncodedValue,
  references = new Map<number, unknown>(),
): Promise<unknown> {
  if (Array.isArray(value))
    return Promise.all(
      value.map((entry) => decodeStructuredValue(entry, references)),
    );
  if (value === null || typeof value !== 'object') return value;
  const reference = value['$ref'];
  if (typeof reference === 'number') return references.get(reference);
  const type = value['$type'];
  if (type === 'undefined') return undefined;
  if (type === 'bigint') return BigInt(String(value['value']));
  if (type === 'number') return Number(String(value['value']));
  const id = value['$id'];
  if (typeof id !== 'number' || typeof type !== 'string')
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([key, entry]) => [
          key,
          await decodeStructuredValue(entry, references),
        ]),
      ),
    );
  if (type === 'date') {
    const date = new Date(String(value['value']));
    references.set(id, date);
    return date;
  }
  if (type === 'regexp') {
    const regexp = new RegExp(String(value['source']), String(value['flags']));
    references.set(id, regexp);
    return regexp;
  }
  if (type === 'array-buffer') {
    const buffer = base64ToBytes(String(value['bytes'])).buffer;
    references.set(id, buffer);
    return buffer;
  }
  if (type === 'typed-array') {
    const bytes = base64ToBytes(String(value['bytes']));
    const constructor = String(value['constructor']);
    const view = createTypedArray(constructor, bytes);
    references.set(id, view);
    return view;
  }
  if (type === 'blob') {
    const bytes = base64ToBytes(String(value['bytes']));
    const mimeType = String(value['mimeType'] ?? '');
    const blobBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(blobBuffer).set(bytes);
    const blob = new Blob([blobBuffer], { type: mimeType });
    const result =
      typeof value['name'] === 'string'
        ? new File([blob], value['name'], {
            type: mimeType,
            lastModified: Number(value['lastModified'] ?? 0),
          })
        : blob;
    references.set(id, result);
    return result;
  }
  if (type === 'array') {
    const result: unknown[] = [];
    references.set(id, result);
    for (const entry of asArray(value['values']))
      result.push(await decodeStructuredValue(entry, references));
    return result;
  }
  if (type === 'map') {
    const result = new Map<unknown, unknown>();
    references.set(id, result);
    for (const entry of asArray(value['entries'])) {
      if (Array.isArray(entry) && entry.length === 2)
        result.set(
          await decodeStructuredValue(entry[0]!, references),
          await decodeStructuredValue(entry[1]!, references),
        );
    }
    return result;
  }
  if (type === 'set') {
    const result = new Set<unknown>();
    references.set(id, result);
    for (const entry of asArray(value['values']))
      result.add(await decodeStructuredValue(entry, references));
    return result;
  }
  const result: Record<string, unknown> =
    value['nullPrototype'] === true
      ? (Object.create(null) as Record<string, unknown>)
      : {};
  references.set(id, result);
  for (const entry of asArray(value['entries'])) {
    if (Array.isArray(entry) && typeof entry[0] === 'string')
      Object.defineProperty(result, entry[0], {
        value: await decodeStructuredValue(entry[1]!, references),
        enumerable: true,
        configurable: true,
        writable: true,
      });
  }
  return result;
}

function createTypedArray(name: string, bytes: Uint8Array): ArrayBufferView {
  const buffer = bytes.slice().buffer;
  switch (name) {
    case 'Int8Array':
      return new Int8Array(buffer);
    case 'Uint8Array':
      return new Uint8Array(buffer);
    case 'Uint8ClampedArray':
      return new Uint8ClampedArray(buffer);
    case 'Int16Array':
      return new Int16Array(buffer);
    case 'Uint16Array':
      return new Uint16Array(buffer);
    case 'Int32Array':
      return new Int32Array(buffer);
    case 'Uint32Array':
      return new Uint32Array(buffer);
    case 'Float32Array':
      return new Float32Array(buffer);
    case 'Float64Array':
      return new Float64Array(buffer);
    case 'BigInt64Array':
      return new BigInt64Array(buffer);
    case 'BigUint64Array':
      return new BigUint64Array(buffer);
    case 'DataView':
      return new DataView(buffer);
    default:
      return new Uint8Array(buffer);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArray(value: EncodedValue | undefined): readonly EncodedValue[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function browserStorageOfEvent(
  event: SendContextEvent,
): BrowserStorageSnapshot | undefined {
  if (!isRecord(event.payload)) return undefined;
  if (typeof event.payload['snapshotJson'] !== 'string') return undefined;
  try {
    const snapshot = JSON.parse(
      event.payload['snapshotJson'],
    ) as Partial<BrowserStorageSnapshot>;
    return snapshot.version === 1 &&
      Array.isArray(snapshot.localStorage) &&
      Array.isArray(snapshot.sessionStorage) &&
      Array.isArray(snapshot.cookies) &&
      Array.isArray(snapshot.indexedDb)
      ? (snapshot as BrowserStorageSnapshot)
      : undefined;
  } catch {
    return undefined;
  }
}

/** The origin storage captured before the first recorded interaction. */
export function initialBrowserStorageSnapshot(
  events: readonly SendContextEvent[],
): BrowserStorageSnapshot | undefined {
  const event = events.find(
    (entry) =>
      entry.kind === 'storage' && entry.name === INITIAL_BROWSER_STORAGE_EVENT,
  );
  return event && browserStorageOfEvent(event);
}

/**
 * The origin storage as last captured before `beforeSequence` (the end of the
 * recording when omitted): the latest checkpoint, else the initial capture.
 */
export function browserStorageSnapshotBefore(
  events: readonly SendContextEvent[],
  beforeSequence?: number,
):
  | Readonly<{
      snapshot: BrowserStorageSnapshot;
      source: 'checkpoint' | 'initial';
    }>
  | undefined {
  const checkpoint = events
    .filter(
      (entry) =>
        entry.kind === 'storage' &&
        entry.name === BROWSER_STORAGE_CHECKPOINT_EVENT &&
        (beforeSequence === undefined || entry.sequence < beforeSequence),
    )
    .sort((left, right) => right.sequence - left.sequence)
    .map(browserStorageOfEvent)
    .find((snapshot) => snapshot !== undefined);
  if (checkpoint) return { snapshot: checkpoint, source: 'checkpoint' };
  const initial = initialBrowserStorageSnapshot(events);
  return initial && { snapshot: initial, source: 'initial' };
}

const STORAGE_CHECKPOINT_MAX_CHARS = 4_000_000;

/**
 * Re-captures the origin storage once the session goes quiet and records it
 * when it changed, so a debug launch can restore it as of the chosen moment
 * instead of as of the start. A capture that is too large is skipped rather
 * than archived.
 */
export function connectBrowserStorageCheckpoints(
  session: Pick<SendContextSession, 'events$' | 'capture'>,
  options: Readonly<{
    baseline: Promise<BrowserStorageSnapshot>;
    capture?: () => Promise<BrowserStorageSnapshot>;
    debounceMs?: number;
  }>,
): () => void {
  const debounceMs = Math.max(250, options.debounceMs ?? 500);
  const capture = options.capture ?? captureBrowserStorageSnapshot;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let capturing = false;
  let dirty = false;
  let last: Promise<string | undefined> = options.baseline.then(
    (snapshot) => JSON.stringify(snapshot),
    () => undefined,
  );
  const run = async (): Promise<void> => {
    timer = undefined;
    if (disposed) return;
    if (capturing) {
      dirty = true;
      return;
    }
    capturing = true;
    try {
      const snapshot = await capture();
      const json = JSON.stringify(snapshot);
      const previous = await last;
      if (disposed || json === previous) return;
      last = Promise.resolve(json);
      if (json.length > STORAGE_CHECKPOINT_MAX_CHARS) return;
      const redacted = redactBrowserStorageSnapshotForArchive(
        snapshot,
        session,
      );
      session.capture('storage', 'emitted', {
        name: BROWSER_STORAGE_CHECKPOINT_EVENT,
        payload: { snapshotJson: JSON.stringify(redacted.snapshot) },
        ...(redacted.refs.length > 0 ? { refs: redacted.refs } : {}),
      });
    } catch {
      // Storage that cannot be read now is simply not checkpointed.
    } finally {
      capturing = false;
      if (dirty && !disposed) {
        dirty = false;
        schedule();
      }
    }
  };
  const schedule = (): void => {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void run(), debounceMs);
  };
  const subscription = session.events$.subscribe({
    next: (batch) => {
      // Our own checkpoints must not trigger the next one.
      if (
        batch.some(
          (event) =>
            event.kind !== 'storage' ||
            event.name !== BROWSER_STORAGE_CHECKPOINT_EVENT,
        )
      )
        schedule();
    },
  });
  return () => {
    disposed = true;
    if (timer) clearTimeout(timer);
    subscription.unsubscribe();
  };
}
