import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  resource,
} from '@angular/core';
import {
  FormField,
  SchemaPathRules,
  validateAsync,
  type SchemaPath,
  type ValidationError,
} from '@angular/forms/signals';
import {
  cEmail,
  cRequired,
  insertForm,
  insertFormAttributes,
  insertNoopTypingAnchor,
  insertSelectFormTree,
  state,
  type GetDeps,
  type GetInjectedServiceDependencies,
  type GetPublicComponentProperties,
} from '@craft-ng/core';
import {
  injectInvitationValidationService,
  InvitationRole,
  InvitationValidationRequest,
  InvitationValidationResult,
} from './invitation-validation.service';

type WorkspaceInvitation = {
  id: number;
  email: string;
  role: InvitationRole;
};

type Summary = {
  draft: number;
  checking: number;
  blocked: number;
  ready: number;
};

type InvitationForm = () => {
  errors: () => ValidationError.WithFieldTree[];
  pending: () => boolean;
  valid: () => boolean;
  validatedFormValue: () => WorkspaceInvitation | undefined;
};

const ROLE_OPTIONS: Array<{ value: InvitationRole; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'editor', label: 'Editor' },
  { value: 'billing', label: 'Billing' },
];

const INITIAL_INVITATIONS: WorkspaceInvitation[] = [
  createInvitation(1, {
    email: 'lea@acme.io',
    role: 'admin',
  }),
  createInvitation(2, {
    email: 'finance@globex.com',
    role: 'billing',
  }),
  createInvitation(3, {
    email: 'sarah@acme.io',
    role: 'editor',
  }),
];

function createInvitation(
  id: number,
  overrides: Partial<Omit<WorkspaceInvitation, 'id'>> = {},
): WorkspaceInvitation {
  return {
    id,
    email: '',
    role: 'editor',
    ...overrides,
  };
}

function findInvitationAsyncError(
  errors: readonly ValidationError.WithFieldTree[],
) {
  return (
    errors.find((error) => error.kind.startsWith('invitation.')) ?? undefined
  );
}

function insertInvitationAsyncValidation(validationService: {
  validateInvitation: (
    request: InvitationValidationRequest,
    abortSignal: AbortSignal,
  ) => Promise<InvitationValidationResult>;
}) {
  return ({ schemaPath }: { schemaPath: unknown }) => {
    validateAsync<
      WorkspaceInvitation,
      InvitationValidationRequest,
      InvitationValidationResult
    >(
      schemaPath as SchemaPath<WorkspaceInvitation, SchemaPathRules.Supported>,
      {
        params: ({ value }) => {
          const invitation = value();

          return {
            email: invitation.email.trim().toLowerCase(),
            role: invitation.role,
          };
        },
        factory: (params) =>
          resource({
            params: () => params(),
            loader: ({ params, abortSignal }) =>
              validationService.validateInvitation(params, abortSignal),
          }),
        onSuccess: (result) => {
          if (result.status === 'ok') {
            return undefined;
          }

          return {
            kind: `invitation.${result.reason}`,
            message: result.message,
          };
        },
        onError: () => ({
          kind: 'invitation.validation-unavailable',
          message: 'Workspace rules could not be checked right now.',
        }),
      },
    );

    return {};
  };
}

@Component({
  selector: 'app-team-invitations',
  imports: [CommonModule, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['team-invitations.css'],
  template: `
    <div class="page">
      <section class="hero">
        <span class="eyebrow">Parallel Forms</span>
        <h1>Invite multiple teammates in one pass</h1>
        <p>
          Each row is its own form instance. When an email becomes valid, a
          workspace eligibility check runs for that row only. The seeded rows
          illustrate three common cases at once: ready to invite, already
          invited, and already a member.
        </p>
      </section>

      <section class="summary">
        <article class="summary-card">
          <strong>{{ summary().ready }}</strong>
          <span>Ready to send</span>
        </article>
        <article class="summary-card">
          <strong>{{ summary().checking }}</strong>
          <span>Checking asynchronously</span>
        </article>
        <article class="summary-card">
          <strong>{{ summary().blocked }}</strong>
          <span>Blocked by workspace rules</span>
        </article>
        <article class="summary-card">
          <strong>{{ summary().draft }}</strong>
          <span>Draft rows</span>
        </article>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>Workspace Invitations</h2>
            <p class="panel-subtitle">
              Try <code>finance@globex.com</code>,
              <code>sarah@acme.io</code>, or any personal email to see item-level
              async validation react independently on each row.
            </p>
          </div>

          <div class="panel-actions">
            <button class="button button-primary" (click)="invitations.addRow()">
              Add invitation
            </button>
            <button class="button button-secondary" (click)="invitations.resetDemo()">
              Reset seeded rows
            </button>
          </div>
        </div>

        <div class="invitations-list">
          @for (invitation of invitations(); track invitation.id) {
            @let invitationForm = invitations.select(invitation.id);
            @let invitationState = invitationForm();
            @let invitationStatus = getInvitationStatus(invitationForm);
            @let invitationAsyncError = getInvitationAsyncError(invitationForm);
            @let emailField = invitationForm().selectEmail();
            @let roleField = invitationForm().selectRole();

            <article
              class="invitation-card"
              [class.pending]="invitationState.pending()"
              [class.blocked]="!!invitationAsyncError"
              [class.ready]="isInvitationReady(invitationForm)"
            >
              <div class="card-header">
                <div class="card-meta">
                  <span class="card-index">Invitation {{ $index + 1 }}</span>
                  <span class="card-title">
                    {{ invitation.email || 'New teammate invitation' }}
                  </span>
                </div>

                <div>
                  <span
                    class="status-pill"
                    [class.draft]="invitationStatus === 'draft'"
                    [class.pending]="invitationStatus === 'checking'"
                    [class.blocked]="invitationStatus === 'blocked'"
                    [class.ready]="invitationStatus === 'ready'"
                  >
                    {{ getInvitationStatusLabel(invitationForm) }}
                  </span>
                  <button
                    class="button button-ghost"
                    (click)="invitations.removeRow(invitation.id)"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div class="fields">
                <div class="field">
                  <label [for]="'invitation-email-' + invitation.id">Email</label>
                  <input
                    [id]="'invitation-email-' + invitation.id"
                    type="email"
                    placeholder="name@company.com"
                    [formField]="emailField"
                  />
                  <div class="field-errors">
                    @for (
                      error of emailField().visibleExceptions().list;
                      track error.code
                    ) {
                      @switch (error.code) {
                        @case ('required') {
                          <span>Email is required.</span>
                        }
                        @case ('email') {
                          <span>Enter a valid work email address.</span>
                        }
                      }
                    }
                  </div>
                  <p class="field-hint">
                    Validation starts as soon as the row is sync-valid.
                  </p>
                </div>

                <div class="field">
                  <label [for]="'invitation-role-' + invitation.id">Role</label>
                  <select
                    [id]="'invitation-role-' + invitation.id"
                    [formField]="roleField"
                  >
                    @for (role of roleOptions; track role.value) {
                      <option [value]="role.value">{{ role.label }}</option>
                    }
                  </select>
                  <div class="field-errors">
                    @for (
                      error of roleField().visibleExceptions().list;
                      track error.code
                    ) {
                      @switch (error.code) {
                        @case ('required') {
                          <span>Role is required.</span>
                        }
                      }
                    }
                  </div>
                  <p class="field-hint">
                    Admin access is restricted to internal domains in this demo.
                  </p>
                </div>
              </div>

              <div
                class="async-feedback"
                [class.pending]="invitationState.pending()"
                [class.blocked]="!!invitationAsyncError"
                [class.ready]="isInvitationReady(invitationForm)"
              >
                @if (invitationState.pending()) {
                  <span>Checking workspace eligibility for this invitation...</span>
                } @else if (invitationAsyncError) {
                  <span>{{ invitationAsyncError.message }}</span>
                } @else if (isInvitationReady(invitationForm)) {
                  <span>
                    Invitation can be sent. This row is fully validated,
                    including the async workspace rules.
                  </span>
                } @else {
                  <span>
                    Complete the required fields to trigger the async validation.
                  </span>
                }
              </div>
            </article>
          } @empty {
            <p class="empty-state">
              No invitation rows. Add one to start parallel validation.
            </p>
          }
        </div>
      </section>

      <section class="payload-panel">
        <h2>Validated payload</h2>
        <p>
          Only rows whose async validation resolved successfully appear here.
          Pending or blocked rows never enter this payload.
        </p>

        <pre>{{ readyInvitations() | json }}</pre>
      </section>
    </div>
  `,
})
export default class TeamInvitationsComponent {
  private nextInvitationId = INITIAL_INVITATIONS.length + 1;
  private readonly invitationValidationService =
    injectInvitationValidationService();

  protected readonly roleOptions = ROLE_OPTIONS;

  protected readonly invitations = state(
    INITIAL_INVITATIONS.map((invitation) => ({ ...invitation })),
    ({ set, update }) => ({
      addRow: () =>
        update((current) => [
          ...current,
          createInvitation(this.nextInvitationId++),
        ]),
      removeRow: (id: number) =>
        update((current) =>
          current.filter((invitation) => invitation.id !== id),
        ),
      resetDemo: () => {
        this.nextInvitationId = INITIAL_INVITATIONS.length + 1;
        return set(
          INITIAL_INVITATIONS.map((invitation) => ({ ...invitation })),
        );
      },
    }),
    insertForm(
      {
        identifier: ({ item }) => item.id,
      },
      insertInvitationAsyncValidation(this.invitationValidationService),
      insertSelectFormTree(
        'email',
        insertNoopTypingAnchor,
        insertFormAttributes(() => ({
          validators: [cRequired(), cEmail()],
        })),
      ),
      insertSelectFormTree(
        'role',
        insertNoopTypingAnchor,
        insertFormAttributes(() => ({
          validators: [cRequired()],
        })),
      ),
    ),
  );

  protected readonly summary = computed<Summary>(() => {
    return this.invitations().reduce<Summary>(
      (acc, invitation) => {
        const form = this.invitations.select(invitation.id);
        const invitationState = form();
        const asyncError = findInvitationAsyncError(invitationState.errors());

        if (invitationState.pending()) {
          acc.checking += 1;
          return acc;
        }

        if (asyncError) {
          acc.blocked += 1;
          return acc;
        }

        if (invitationState.valid()) {
          acc.ready += 1;
          return acc;
        }

        acc.draft += 1;
        return acc;
      },
      {
        draft: 0,
        checking: 0,
        blocked: 0,
        ready: 0,
      },
    );
  });

  protected readonly readyInvitations = computed(() => {
    return this.invitations().flatMap((invitation) => {
      const form = this.invitations.select(invitation.id);
      const validated = form().validatedFormValue();

      if (!validated) {
        return [];
      }

      return [
        {
          email: validated.email.trim().toLowerCase(),
          role: validated.role,
        },
      ];
    });
  });

  protected getInvitationAsyncError(form: InvitationForm) {
    return findInvitationAsyncError(form().errors());
  }

  protected isInvitationReady(form: InvitationForm) {
    const invitationState = form();
    return (
      invitationState.valid() &&
      !findInvitationAsyncError(invitationState.errors())
    );
  }

  protected getInvitationStatus(
    form: InvitationForm,
  ): 'draft' | 'checking' | 'blocked' | 'ready' {
    const invitationState = form();

    if (invitationState.pending()) {
      return 'checking';
    }

    if (findInvitationAsyncError(invitationState.errors())) {
      return 'blocked';
    }

    if (invitationState.valid()) {
      return 'ready';
    }

    return 'draft';
  }

  protected getInvitationStatusLabel(form: InvitationForm) {
    switch (this.getInvitationStatus(form)) {
      case 'checking':
        return 'Checking';
      case 'blocked':
        return 'Blocked';
      case 'ready':
        return 'Ready';
      default:
        return 'Draft';
    }
  }
}

export type GenDeps_TeamInvitationsComponent = GetDeps<{
  deps: {
    CommonModule: CommonModule;
    FormField: FormField<any>;
    InvitationValidationService: GetInjectedServiceDependencies<
      typeof injectInvitationValidationService
    >;
  };
  provided: {};
  publicProperties: GetPublicComponentProperties<TeamInvitationsComponent>;
}>;
