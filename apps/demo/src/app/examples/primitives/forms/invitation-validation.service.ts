import { Injectable } from '@angular/core';

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

@Injectable({ providedIn: 'root' })
export class InvitationValidationService {
  private readonly currentMembers = new Set([
    'sarah@acme.io',
    'ops@acme.io',
    'security@acme.io',
  ]);

  private readonly pendingInvitations = new Set([
    'finance@globex.com',
    'partner@contoso.dev',
  ]);

  private readonly restrictedDomains = new Set([
    'gmail.com',
    'yahoo.com',
    'hotmail.com',
  ]);

  async validateInvitation(
    request: InvitationValidationRequest,
    abortSignal: AbortSignal,
  ): Promise<InvitationValidationResult> {
    await wait(this.getLatency(request.email), abortSignal);

    const email = request.email.trim().toLowerCase();
    const domain = email.split('@')[1] ?? '';

    if (this.currentMembers.has(email)) {
      return {
        status: 'blocked',
        reason: 'already-member',
        message: 'This teammate already belongs to the workspace.',
      };
    }

    if (this.pendingInvitations.has(email)) {
      return {
        status: 'blocked',
        reason: 'already-invited',
        message: 'An invitation is already pending for this email.',
      };
    }

    if (this.restrictedDomains.has(domain)) {
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
        message: 'Admin access is reserved to teammates on the acme.io domain.',
      };
    }

    return {
      status: 'ok',
    };
  }

  private getLatency(email: string) {
    return 350 + (email.length % 5) * 180;
  }
}

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
