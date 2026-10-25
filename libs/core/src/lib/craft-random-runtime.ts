import { inject, InjectionToken, type Provider } from './host/craft-compat';

/** Randomness used by Craft code, so a recording or replay can replace it. */
export interface CraftRandomRuntime {
  /** Returns a value in the half-open range [0, 1). */
  next(): number;

  /** Returns a RFC 4122 version 4 UUID. */
  uuid(): string;
}

export const CRAFT_RANDOM_RUNTIME = new InjectionToken<CraftRandomRuntime>(
  'CRAFT_RANDOM_RUNTIME',
  {
    providedIn: 'root',
    factory: () => new RealCraftRandomRuntime(),
  },
);

export function provideCraftRandomRuntime(
  runtime: CraftRandomRuntime,
): Provider {
  return { provide: CRAFT_RANDOM_RUNTIME, useValue: runtime };
}

/** Creates the seed saved at the beginning of a recorded session. */
export function createCraftRandomSeed(): number {
  return Math.floor(new RealCraftRandomRuntime().next() * 0x1_0000_0000) >>> 0;
}

/** Synchronously resolves the active Craft random source. */
export function* CraftRandomRuntime(): Generator<
  never,
  CraftRandomRuntime,
  unknown
> {
  return ɵinjectCraftRandomRuntime();
}

export const ɵinjectCraftRandomRuntime = (): CraftRandomRuntime => {
  if (activeRandomRuntimeOverride) return activeRandomRuntimeOverride;
  try {
    return (
      inject(CRAFT_RANDOM_RUNTIME, { optional: true }) ??
      new RealCraftRandomRuntime()
    );
  } catch {
    return new RealCraftRandomRuntime();
  }
};

let activeRandomRuntimeOverride: CraftRandomRuntime | undefined;

/** Routes already-created runtime instances through a deterministic source. */
export function activateCraftRandomRuntime(
  runtime: CraftRandomRuntime,
): () => void {
  const previous = activeRandomRuntimeOverride;
  activeRandomRuntimeOverride = runtime;
  return () => {
    if (activeRandomRuntimeOverride === runtime) {
      activeRandomRuntimeOverride = previous;
    }
  };
}

/** Runtime backed by the host's cryptographic random number generator. */
export class RealCraftRandomRuntime implements CraftRandomRuntime {
  next(): number {
    if (activeRandomRuntimeOverride && activeRandomRuntimeOverride !== this) {
      return activeRandomRuntimeOverride.next();
    }
    const bytes = randomBytes(4);
    const value =
      ((bytes[0] ?? 0) * 0x1000000 +
        (bytes[1] ?? 0) * 0x10000 +
        (bytes[2] ?? 0) * 0x100 +
        (bytes[3] ?? 0)) >>>
      0;
    return value / 0x1_0000_0000;
  }

  uuid(): string {
    if (activeRandomRuntimeOverride && activeRandomRuntimeOverride !== this) {
      return activeRandomRuntimeOverride.uuid();
    }
    const cryptoApi = globalThis.crypto;
    if (typeof cryptoApi?.randomUUID === 'function') {
      return cryptoApi.randomUUID();
    }
    const bytes = randomBytes(16);
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    return formatUuid(bytes);
  }
}

/** Seeded xorshift32 source. A zero seed is normalized to a non-zero state. */
export class SeededCraftRandomRuntime implements CraftRandomRuntime {
  private state: number;

  constructor(seed: number) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
      throw new RangeError(
        'Craft random seed must be an unsigned 32-bit integer.',
      );
    }
    this.state = seed >>> 0 || 0x6d2b79f5;
  }

  next(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state / 0x1_0000_0000;
  }

  uuid(): string {
    const bytes = Uint8Array.from({ length: 16 }, () =>
      Math.floor(this.next() * 256),
    );
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    return formatUuid(bytes);
  }
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let index = 0; index < length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function formatUuid(bytes: Uint8Array): string {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
    .slice(6, 8)
    .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}
