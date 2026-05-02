import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormField, required } from '@angular/forms/signals';
import {
    ValidatedFormValue,
    cEmail,
    cMinLength,
    cRequired,
    craftException,
    insertForm,
    insertFormAttributes,
    insertFormSubmit,
    insertNoopTypingAnchor,
    insertSelectFormTree,
    mutation,
    state,
    type ExtractDeps,
    type GetDeps,
    type GetPublicComponentProperties
} from '@craft-ng/core';

type LoginData = {
  email: string;
  password: string;
};

@Component({
  selector: 'app-login-form',
  imports: [CommonModule, FormField],
  template: `
    <div class="login-container">
      <div class="login-card">
        <h2>Login</h2>

        @if (loginForm.form().hasSubmitExceptions()) {
          <div class="submit-errors">
            @for (
              exception of loginForm.form().submitExceptions();
              track exception.code
            ) {
              @switch (exception.code) {
                @case ('UserBannedException') {
                  <p>{{ exception.payload.message }}</p>
                }
                @default {
                  <p>An unexpected error occurred.</p>
                }
              }
            }
          </div>
        }

        <form (submit)="$event.preventDefault(); loginForm.form().submit()">
          <div class="form-group">
            <label for="email">Email</label>
            @let emailField = loginForm.form().selectEmail();
            <input
              id="email"
              type="email"
              placeholder="Enter your email"
              [formField]="loginForm.form.email"
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
                    <span>Please enter a valid email address.</span>
                  }
                }
              }
            </div>
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            @let passwordField = loginForm.form().selectPassword();
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              [formField]="loginForm.form.password"
            />
            <div class="field-errors">
              @for (
                error of passwordField().visibleExceptions().list;
                track error.code
              ) {
                @switch (error.code) {
                  @case ('required') {
                    <span>Password is required.</span>
                  }
                }
              }
            </div>
          </div>

          <button type="submit" class="submit-btn">
            {{ loginForm.form().submitting() ? 'Logging in...' : 'Log in' }}
          </button>
        </form>
      </div>
    </div>
    errors:
    {{ loginForm.form().selectEmail()().errors() | json }} hasAttemptedSubmit:{{
      loginForm.form().hasAttemptedSubmit()
    }}/exceptions {{ loginForm.form().selectEmail()().exceptions() | json }}
  `,
  styles: [
    `
      .login-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: #f0f2f5;
      }

      .login-card {
        background: white;
        border-radius: 12px;
        padding: 40px;
        width: 100%;
        max-width: 400px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
      }

      h2 {
        margin: 0 0 24px;
        font-size: 24px;
        color: #1a202c;
      }

      .form-group {
        margin-bottom: 20px;
      }

      label {
        display: block;
        margin-bottom: 6px;
        font-weight: 500;
        color: #4a5568;
        font-size: 14px;
      }

      input {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 14px;
        transition: border-color 0.2s;
        box-sizing: border-box;
      }

      input:focus {
        outline: none;
        border-color: #4299e1;
        box-shadow: 0 0 0 3px rgba(66, 153, 225, 0.15);
      }

      .field-errors {
        margin-top: 4px;
      }

      .field-errors span {
        display: block;
        color: #e53e3e;
        font-size: 12px;
      }

      .submit-errors {
        background: #fff5f5;
        border: 1px solid #feb2b2;
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 20px;
      }

      .submit-errors p {
        margin: 0;
        color: #c53030;
        font-size: 14px;
      }

      .submit-btn {
        width: 100%;
        padding: 12px;
        background: #4299e1;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
      }

      .submit-btn:hover:not(:disabled) {
        background: #3182ce;
      }

      .submit-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LoginFormComponent {
  private readonly loginMutation = mutation({
    method: (payload: NonNullable<ValidatedFormValue<LoginData>>) => payload,
    loader: async ({ params: credentials }) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (credentials.email === 'invalid@gmail.com') {
        return craftException(
          { code: 'UserBannedException' },
          { message: 'This user has been banned.' as const },
        );
      }

      return credentials;
    },
  });

  protected readonly loginForm = state(
    { email: '', password: '' } satisfies LoginData,
    insertForm(
      insertFormSubmit(this.loginMutation),
      ({ schemaPath }) => {
        required(schemaPath.email);
        return {};
      },
      insertSelectFormTree(
        'email',
        insertNoopTypingAnchor,
        insertFormAttributes(() => ({
          validators: [cRequired(), cEmail(), cMinLength({ minLength: 5 })],
        })),
      ),
      insertSelectFormTree(
        'password',
        insertNoopTypingAnchor,
        insertFormAttributes(() => ({
          validators: [cRequired()],
        })),
      ),
    ),
  );
}

export type GenDeps_LoginFormComponent = GetDeps<{
      deps: {
        CommonModule: CommonModule;
        FormField: FormField;
      };
      propertiesDeps: {
        loginMutation: ExtractDeps<LoginFormComponent["loginMutation"]>;
        loginForm: ExtractDeps<LoginFormComponent["loginForm"]>;
      };
      provided: {};
      publicProperties: GetPublicComponentProperties<LoginFormComponent>;
    }>;
