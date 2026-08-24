import { craftToken, type CraftProvider } from './host/craft-injector';

export type CraftTransferPolicy = Readonly<{
  /**
   * `deny` ne transfère rien, `allowlist` transfère les adresses déclarées,
   * `legacy` transfère tout ce qui est sérialisable — uniquement pour migrer
   * une application existante, et signalé par `craft security check`.
   */
  mode: 'allowlist' | 'deny' | 'legacy';
  allow?: readonly string[];
  redact?: (address: string, value: unknown) => unknown;
  maxBytes?: number;
  maxDepth?: number;
}>;

export type CraftSecurityPolicy = Readonly<{
  ssr: Readonly<{
    timeoutMs: number;
    maxHtmlBytes: number;
    sourceTimeoutMs: number;
  }>;
  dom: Readonly<{
    allowUnsafeHtml: boolean;
    allowStyleValues: boolean;
    /** Origins a resource URL (src, poster, srcset…) may point to. */
    allowedResourceOrigins: readonly string[];
    /** Schemes accepted for navigation URLs, beyond relative ones. */
    allowedUrlSchemes: readonly string[];
  }>;
  transport: Readonly<{
    maxBodyBytes: number;
    maxOutputBytes: number;
    timeoutMs: number;
  }>;
  transfer: CraftTransferPolicy;
}>;

export type CraftSecurityPolicyInput = Readonly<{
  ssr?: Partial<CraftSecurityPolicy['ssr']>;
  dom?: Partial<CraftSecurityPolicy['dom']>;
  transport?: Partial<CraftSecurityPolicy['transport']>;
  transfer?: Partial<CraftTransferPolicy>;
}>;

export const DEFAULT_CRAFT_SECURITY_POLICY: CraftSecurityPolicy = Object.freeze({
  ssr: Object.freeze({
    timeoutMs: 5_000,
    maxHtmlBytes: 2_000_000,
    sourceTimeoutMs: 5_000,
  }),
  dom: Object.freeze({
    allowUnsafeHtml: false,
    allowStyleValues: false,
    allowedResourceOrigins: Object.freeze([]) as readonly string[],
    allowedUrlSchemes: Object.freeze([
      'http:',
      'https:',
      'mailto:',
      'tel:',
    ]) as readonly string[],
  }),
  transport: Object.freeze({
    maxBodyBytes: 1_000_000,
    maxOutputBytes: 1_000_000,
    timeoutMs: 10_000,
  }),
  transfer: Object.freeze({
    mode: 'deny',
    maxBytes: 512_000,
    maxDepth: 20,
  }),
});

/**
 * Merges an app policy without mutating either the defaults or the input.
 * Missing values intentionally retain the restrictive defaults.
 */
export function createCraftSecurityPolicy(
  input: CraftSecurityPolicyInput = {},
): CraftSecurityPolicy {
  const policy = {
    ssr: { ...DEFAULT_CRAFT_SECURITY_POLICY.ssr, ...input.ssr },
    dom: { ...DEFAULT_CRAFT_SECURITY_POLICY.dom, ...input.dom },
    transport: {
      ...DEFAULT_CRAFT_SECURITY_POLICY.transport,
      ...input.transport,
    },
    transfer: { ...DEFAULT_CRAFT_SECURITY_POLICY.transfer, ...input.transfer },
  } satisfies CraftSecurityPolicy;
  validateCraftSecurityPolicy(policy);
  return Object.freeze({
    ...policy,
    ssr: Object.freeze(policy.ssr),
    dom: Object.freeze(policy.dom),
    transport: Object.freeze(policy.transport),
    transfer: Object.freeze(policy.transfer),
  });
}

export function validateCraftSecurityPolicy(
  policy: CraftSecurityPolicy,
): void {
  if (!['allowlist', 'deny', 'legacy'].includes(policy.transfer.mode)) {
    throw new CraftSecurityError(
      'CRAFT_SECURITY_POLICY_INVALID',
      'transfer.mode must be allowlist, deny or legacy.',
    );
  }
  const positive = (value: number, name: string) => {
    if (!Number.isFinite(value) || value <= 0) {
      throw new CraftSecurityError(
        'CRAFT_SECURITY_POLICY_INVALID',
        `${name} must be a positive finite number.`,
      );
    }
  };
  positive(policy.ssr.timeoutMs, 'ssr.timeoutMs');
  positive(policy.ssr.maxHtmlBytes, 'ssr.maxHtmlBytes');
  positive(policy.ssr.sourceTimeoutMs, 'ssr.sourceTimeoutMs');
  positive(policy.transport.maxBodyBytes, 'transport.maxBodyBytes');
  positive(policy.transport.maxOutputBytes, 'transport.maxOutputBytes');
  positive(policy.transport.timeoutMs, 'transport.timeoutMs');
  if (policy.transfer.maxBytes !== undefined) {
    positive(policy.transfer.maxBytes, 'transfer.maxBytes');
  }
  if (
    policy.transfer.maxDepth !== undefined &&
    (!Number.isInteger(policy.transfer.maxDepth) || policy.transfer.maxDepth < 1)
  ) {
    throw new CraftSecurityError(
      'CRAFT_SECURITY_POLICY_INVALID',
      'transfer.maxDepth must be a positive integer.',
    );
  }
}

export const CRAFT_SECURITY_POLICY = craftToken<CraftSecurityPolicy>(
  'CraftSecurityPolicy',
);

export function provideCraftSecurityPolicy(
  input: CraftSecurityPolicyInput,
): CraftProvider<CraftSecurityPolicy> {
  return {
    token: CRAFT_SECURITY_POLICY,
    useValue: createCraftSecurityPolicy(input),
  };
}

export const CraftCspNonce = craftToken<string>('CraftCspNonce');

export function assertCraftCspNonce(nonce: string): string {
  if (!/^[A-Za-z0-9+/_=-]+$/.test(nonce)) {
    throw new CraftSecurityError(
      'CRAFT_CSP_NONCE_INVALID',
      'A CSP nonce must contain only base64 characters.',
    );
  }
  return nonce;
}

export function provideCraftCspNonce(nonce: string): CraftProvider<string> {
  return { token: CraftCspNonce, useValue: assertCraftCspNonce(nonce) };
}

export type CraftSecurityException = Readonly<{
  owner: string;
  reason: string;
  risk: string;
  expires: string;
  ticket?: string;
}>;

export function allowUnsafe(
  capability: string,
  exception: CraftSecurityException,
): CraftSecurityException & { readonly capability: string } {
  if (
    !capability ||
    !exception.owner ||
    !exception.reason ||
    !exception.risk ||
    !/^\d{4}-\d{2}-\d{2}$/.test(exception.expires)
  ) {
    throw new CraftSecurityError(
      'CRAFT_SECURITY_EXCEPTION_INVALID',
      `Invalid exception for "${capability}".`,
    );
  }
  const expires = new Date(`${exception.expires}T23:59:59.999Z`);
  if (Number.isNaN(expires.valueOf())) {
    throw new CraftSecurityError(
      'CRAFT_SECURITY_EXCEPTION_INVALID',
      `Invalid expiration date for "${capability}".`,
    );
  }
  return Object.freeze({ capability, ...exception });
}

export function isCraftSecurityExceptionExpired(
  exception: CraftSecurityException,
  now = new Date(),
): boolean {
  return now.getTime() > new Date(`${exception.expires}T23:59:59.999Z`).getTime();
}

export class CraftSecurityError extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.code = code;
    this.name = 'CraftSecurityError';
  }
}
