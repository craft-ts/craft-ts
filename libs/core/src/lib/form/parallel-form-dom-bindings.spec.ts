import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type GetDeps, type GetPublicComponentProperties } from '../../index';
import { insertNoopTypingAnchor } from '../insert-noop-typing-anchor';
import { mutation } from '../mutation';
import { state } from '../state';
import { CraftFieldDirective } from './craft-field.directive';
import { insertForm, ValidatedFormValue } from './insert-form';
import { insertFormAttributes } from './insert-form-attributes';
import { insertFormSubmit } from './insert-form-submit';
import { insertSelectFormTree } from './insert-select-form-tree';
import { craftPipe } from '../craft-pipe';
import { cRequired } from './validator';

type User = { id: string; name: string };

@Component({
  standalone: true,
  imports: [CraftFieldDirective],
  template: `
    @if (usersForm.select('1'); as user) {
      <input [craftField]="user.name" />
    }
  `,
})
class ParallelSelectedFieldBindingsComponent {
  protected readonly usersForm = state(
    [
      {
        id: '1',
        name: 'Alpha',
      },
    ],
    insertForm(
      {
        identifier: ({ item }) => item.id,
      },
      insertSelectFormTree('name', insertNoopTypingAnchor),
    ),
  );
}

@Component({
  standalone: true,
  imports: [CraftFieldDirective],
  template: `
    @for (user of usersForm(); track user.id) {
      @let userForm = usersForm.select(user.id);
      @let nameField = userForm?.selectName();
      @if (nameField; as nf) {
        <input class="user-input" [craftField]="nf" />
      }
    }
  `,
})
class ParallelLazySubFormComponent {
  // This component reproduces the NG0602/NG0600 scenario:
  //   - parallel form built lazily inside a `linkedSignal` (reactive context)
  //   - sub-form (`selectName()`) created lazily during template render
  //   - insertFormSubmit creates effects on construction
  //   - insertFormAttributes registers validators (signal writes via plain arrays)
  // Both must construct without throwing.
  private readonly updateUser = mutation({
    method: (validated: ValidatedFormValue<User>) => validated,
    loader: async ({ params }) => params,
  });

  protected readonly usersForm = state(
    [
      { id: '1', name: 'Alpha' },
      { id: '2', name: 'Beta' },
    ] as User[],
    insertForm(
      { identifier: ({ item }) => item.id },
      insertFormSubmit(this.updateUser),
      insertSelectFormTree('name', (context) =>
        craftPipe(
          context,
          insertNoopTypingAnchor,
          insertFormAttributes(() => ({
            validators: [cRequired()],
          })),
        ),
      ),
    ),
  );
}

describe('parallel form DOM bindings', () => {
  it('supports [craftField] bindings on selected nested fields', () => {
    TestBed.configureTestingModule({
      imports: [ParallelSelectedFieldBindingsComponent],
    });

    const fixture = TestBed.createComponent(
      ParallelSelectedFieldBindingsComponent,
    );
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      'input',
    ) as HTMLInputElement;
    expect(input.value).toBe('Alpha');

    input.value = '';

    expect(() => {
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    }).not.toThrow();

    expect(
      (
        fixture.componentInstance as unknown as {
          usersForm: () => Array<{ name: string }>;
        }
      ).usersForm()[0]?.name,
    ).toBe('');
  });

  // Regression for NG0602 (effect created in reactive context) and NG0600
  // (signal writes during render). Both happened when:
  //   - parallel forms are built inside a `linkedSignal` callback
  //   - sub-forms (selectName()) are constructed lazily from a template binding
  //   - insertFormSubmit creates effects + insertFormAttributes registers validators
  it('builds parallel forms with insertFormSubmit + lazy sub-form without throwing', () => {
    TestBed.configureTestingModule({
      imports: [ParallelLazySubFormComponent],
    });

    expect(() => {
      const fixture = TestBed.createComponent(ParallelLazySubFormComponent);
      fixture.detectChanges();

      const inputs = fixture.nativeElement.querySelectorAll(
        'input.user-input',
      ) as NodeListOf<HTMLInputElement>;
      expect(inputs.length).toBe(2);
      expect(inputs[0].value).toBe('Alpha');
      expect(inputs[1].value).toBe('Beta');
    }).not.toThrow();
  });
});

export type GenDeps_ParallelSelectedFieldBindingsComponent = GetDeps<{
  deps: {
    CraftFieldDirective: typeof CraftFieldDirective;
  };
  provided: {};
  publicProperties: GetPublicComponentProperties<ParallelSelectedFieldBindingsComponent>;
}>;

export type GenDeps_ParallelLazySubFormComponent = GetDeps<{
  deps: {
    CraftFieldDirective: typeof CraftFieldDirective;
  };
  provided: {};
  publicProperties: GetPublicComponentProperties<ParallelLazySubFormComponent>;
}>;
