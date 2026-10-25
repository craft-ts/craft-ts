export type SessionTraceStep = Readonly<{
  key: string;
  kind: 'route' | 'interaction' | 'http' | 'invocation' | 'exception' | 'checkpoint' | 'console-error';
  detail: Readonly<Record<string, unknown>>;
  elapsedMs: number;
  participant: string;
  eventId: string;
}>;
export type SessionTrace = Readonly<{
  format: 'craft-session-trace'; schemaVersion: 1; steps: readonly SessionTraceStep[]; hash: string;
}>;
export type PortableSessionForTrace = Readonly<{
  events: readonly Readonly<Record<string, unknown>>[];
}>;

/** Normalize portable session events into a deterministic, comparable trace. */
export function normalizeSessionTrace(session: PortableSessionForTrace): SessionTrace {
  const events = [...session.events].sort((a, b) => number(a['sequence']) - number(b['sequence']));
  const origin = events.reduce((min, event) => Math.min(min, number(event['timestamp'], Infinity)), Infinity);
  const steps = events.flatMap((event): SessionTraceStep[] => {
    const step = normalizeEvent(event, origin);
    return step ? [step] : [];
  });
  const hash = sha256Hex(JSON.stringify(steps.map(({ key, detail }) => [key, detail])));
  return { format: 'craft-session-trace', schemaVersion: 1, steps, hash };
}

function normalizeEvent(event: Readonly<Record<string, unknown>>, origin: number): SessionTraceStep | undefined {
  const rawKind = String(event['kind'] ?? event['type'] ?? '').toLowerCase();
  const phase = String(event['phase'] ?? '');
  const payload = isRecord(event['payload']) ? event['payload'] : {};
  const name = String(event['name'] ?? payload['name'] ?? '');
  const url = clean(String(payload['url'] ?? payload['href'] ?? payload['routePath'] ?? event['url'] ?? ''));
  let kind: SessionTraceStep['kind'];
  let identity: string;
  let detail: Record<string, unknown>;
  if (/route|navigation/.test(rawKind)) {
    kind = 'route'; identity = routePath(url); detail = { queryKeys: queryKeys(url), phase };
  } else if (/http|transport/.test(rawKind)) {
    const method = String(payload['method'] ?? 'GET').toUpperCase();
    const response = isRecord(event['response']) ? event['response'] : {};
    const status = number(payload['status'] ?? response['status'] ?? event['status']);
    kind = 'http'; identity = `${method}:${routePath(url)}`;
    detail = { status, outcome: status >= 400 ? 'error' : phase === 'aborted' ? 'aborted' : 'ok', bodyKeys: keys(parseJson(payload['body'] ?? response['body'])) };
  } else if (name === 'test-marker') {
    kind = 'interaction'; identity = `marker:${String(payload['label'] ?? '')}`; detail = {};
  } else if (/exception|error/.test(rawKind)) {
    const message = clean(String(payload['message'] ?? event['message'] ?? name));
    kind = rawKind.includes('console') ? 'console-error' : 'exception'; identity = firstSegment(message || name);
    detail = { message };
  } else if (/invocation|call|method/.test(rawKind)) {
    kind = 'invocation'; identity = clean(String(payload['address'] ?? payload['method'] ?? name)); detail = { phase, error: payload['errorName'] ?? null };
  } else if (/snapshot|checkpoint/.test(rawKind)) {
    kind = 'checkpoint'; identity = clean(String(payload['address'] ?? name)); detail = { valueHash: digest(payload['state'] ?? payload['value'] ?? payload) };
  } else if (/interaction|input|click|pointer|keyboard|dom|hover/.test(rawKind)) {
    kind = 'interaction'; identity = `${rawKind}:${clean(String(payload['targetId'] ?? payload['interactionName'] ?? name))}`; detail = { value: payload['value'] ?? null };
  } else return undefined;
  return {
    key: `${kind}:${identity}`, kind, detail,
    elapsedMs: Math.max(0, number(event['globalElapsedMs'] ?? event['elapsedMs'], number(event['timestamp']) - (Number.isFinite(origin) ? origin : 0))),
    participant: clean(String(event['participantId'] ?? 'default')),
    eventId: String(event['id'] ?? ''),
  };
}
function clean(value: string): string { return value.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':uuid').replace(/\b\d{7,}\b/g, ':n').replace(/\b\d{4}-\d\d-\d\dT[^\s]+/g, ':time').replace(/\[REDACTED\]/g, ':redacted').replace(/\s+/g, ' ').trim(); }
function routePath(value: string): string { try { return clean(new URL(value, 'http://craft.local').pathname); } catch { return clean(value.split('?')[0] ?? ''); } }
function queryKeys(value: string): string[] { try { return [...new URL(value, 'http://craft.local').searchParams.keys()].sort(); } catch { return []; } }
function keys(value: unknown): string[] { return isRecord(value) ? Object.keys(value).sort() : []; }
function parseJson(value: unknown): unknown { if (typeof value !== 'string') return value; try { return JSON.parse(value) as unknown; } catch { return undefined; } }
function digest(value: unknown): string { return sha256Hex(JSON.stringify(value)); }
function firstSegment(value: string): string { return value.split(/[.:\s]/, 1)[0] ?? value; }
function number(value: unknown, fallback = 0): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

function sha256Hex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes); padded[bytes.length] = 0x80;
  const bitLength = bytes.length * 8;
  for (let index = 0; index < 8; index += 1) padded[paddedLength - 1 - index] = Math.floor(bitLength / 2 ** (index * 8)) & 0xff;
  const constants = new Uint32Array([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ]);
  const state = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const words = new Uint32Array(64);
  const rotate = (word: number, count: number) => (word >>> count) | (word << (32 - count));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) { const at = offset + index * 4; words[index] = ((padded[at]! << 24) | (padded[at + 1]! << 16) | (padded[at + 2]! << 8) | padded[at + 3]!) >>> 0; }
    for (let index = 16; index < 64; index += 1) { const x = words[index - 15]!, y = words[index - 2]!; const s0 = rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3); const s1 = rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10); words[index] = (words[index - 16]! + s0 + words[index - 7]! + s1) >>> 0; }
    let [a,b,c,d,e,f,g,h] = state;
    for (let index = 0; index < 64; index += 1) { const s1 = rotate(e!, 6) ^ rotate(e!, 11) ^ rotate(e!, 25); const choice = (e! & f!) ^ (~e! & g!); const t1 = (h! + s1 + choice + constants[index]! + words[index]!) >>> 0; const s0 = rotate(a!, 2) ^ rotate(a!, 13) ^ rotate(a!, 22); const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!); const t2 = (s0 + majority) >>> 0; h=g; g=f; f=e; e=(d!+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0; }
    state[0] = (state[0]! + a!) >>> 0; state[1] = (state[1]! + b!) >>> 0; state[2] = (state[2]! + c!) >>> 0; state[3] = (state[3]! + d!) >>> 0; state[4] = (state[4]! + e!) >>> 0; state[5] = (state[5]! + f!) >>> 0; state[6] = (state[6]! + g!) >>> 0; state[7] = (state[7]! + h!) >>> 0;
  }
  return [...state].map((word) => word.toString(16).padStart(8, '0')).join('');
}
