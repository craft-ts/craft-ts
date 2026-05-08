import { craftService } from '@craft-ng/core';

export type InvitationRole = 'admin' | 'editor' | 'billing';

export type InvitationValidationRequest = {
  email: string;
  role: InvitationRole;
};

export type InvitationValidationResult =
  | {
      status: 'ok';
    }
  | {
      status: 'blocked';
      reason:
        | 'already-member'
        | 'already-invited'
        | 'restricted-domain'
        | 'external-admin';
      message: string;
    };

export type InvitationValidationService = {
  validateInvitation: (
    request: InvitationValidationRequest,
    abortSignal: AbortSignal,
  ) => Promise<InvitationValidationResult>;
};

export const {
  InvitationValidationServiceToYield,
  injectInvitationValidationService,
} = craftService(
  { name: 'InvitationValidationService', scope: 'global' },
  () => {
    const currentMembers = new Set([
      'sarah@acme.io',
      'ops@acme.io',
      'security@acme.io',
    ]);

    const pendingInvitations = new Set([
      'finance@globex.com',
      'partner@contoso.dev',
    ]);

    const restrictedDomains = new Set([
      'gmail.com',
      'yahoo.com',
      'hotmail.com',
    ]);

    function getLatency(email: string) {
      return 350 + (email.length % 5) * 180;
    }

    return {
      validateInvitation: async (
        request: InvitationValidationRequest,
        abortSignal: AbortSignal,
      ): Promise<InvitationValidationResult> => {
        await wait(getLatency(request.email), abortSignal);

        const email = request.email.trim().toLowerCase();
        const domain = email.split('@')[1] ?? '';

        if (currentMembers.has(email)) {
          return {
            status: 'blocked',
            reason: 'already-member',
            message: 'This teammate already belongs to the workspace.',
          };
        }

        if (pendingInvitations.has(email)) {
          return {
            status: 'blocked',
            reason: 'already-invited',
            message: 'An invitation is already pending for this email.',
          };
        }

        if (restrictedDomains.has(domain)) {
          return {
            status: 'blocked',
            reason: 'restricted-domain',
            message: 'Use a company email address for workspace invitations.',
          };
        }

        if (request.role === 'admin' && domain !== 'acme.io') {
          return {
            status: 'blocked',
            reason: 'external-admin',
            message:
              'Admin access is reserved to teammates on the acme.io domain.',
          };
        }

        return {
          status: 'ok',
        };
      },
    };
  },
);

function wait(duration: number, abortSignal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, duration);

    const onAbort = () => {
      cleanup();
      reject(new DOMException('Validation aborted', 'AbortError'));
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      abortSignal.removeEventListener('abort', onAbort);
    };

    if (abortSignal.aborted) {
      onAbort();
      return;
    }

    abortSignal.addEventListener('abort', onAbort, { once: true });
  });
}
