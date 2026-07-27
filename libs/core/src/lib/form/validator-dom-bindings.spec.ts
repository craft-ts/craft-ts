import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { insertNoopTypingAnchor } from '../insert-noop-typing-anchor';
import { craftPipe } from '../craft-pipe';
import { state } from '../state';
import { CraftFieldDirective } from './craft-field.directive';
import { insertForm } from './insert-form';
import { insertFormAttributes } from './insert-form-attributes';
import { insertSelectFormTree } from './insert-select-form-tree';
import {
  cEmail,
  cMax,
  cMaxLength,
  cMin,
  cMinLength,
  cPattern,
  cRequired,
} from './validator';
import { craftUse } from '../craft-use';

@Component({
  standalone: true,
  imports: [CraftFieldDirective],
  template: `<input [craftField]="loginForm.form.email" />`,
})
class EmailFieldValidatorBindingsComponent {
  protected readonly loginForm = craftUse(
    state(
      'loginForm',
      { email: '' },
      insertForm(
        insertSelectFormTree('email', (context) =>
          craftPipe(
            context,
            insertNoopTypingAnchor,
            insertFormAttributes(() => ({
              validators: [
                cRequired(),
                cEmail(),
                cMinLength({ minLength: 5 }),
                cMaxLength({ maxLength: 10 }),
                cPattern({ pattern: /@/ }),
              ],
            })),
          ),
        ),
      ),
    ),
  ).loginForm;
}

@Component({
  standalone: true,
  imports: [CraftFieldDirective],
  template: `<input type="number" [craftField]="numberForm.form.age" />`,
})
class NumberFieldValidatorBindingsComponent {
  protected readonly numberForm = craftUse(
    state(
      'numberForm',
      { age: 0 },
      insertForm(
        insertSelectFormTree('age', (context) =>
          craftPipe(
            context,
            insertNoopTypingAnchor,
            insertFormAttributes(() => ({
              validators: [cRequired(), cMin({ min: 2 }), cMax({ max: 10 })],
            })),
          ),
        ),
      ),
    ),
  ).numberForm;
}

describe('validator DOM bindings', () => {
  it('propagates required, minLength, maxLength to text inputs', () => {
    TestBed.configureTestingModule({
      imports: [EmailFieldValidatorBindingsComponent],
    });

    const fixture = TestBed.createComponent(
      EmailFieldValidatorBindingsComponent,
    );
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      'input',
    ) as HTMLInputElement;

    expect(input.required).toBe(true);
    expect(input.minLength).toBe(5);
    expect(input.maxLength).toBe(10);
  });

  it('does not infer type=email or pattern from validators alone', () => {
    TestBed.configureTestingModule({
      imports: [EmailFieldValidatorBindingsComponent],
    });

    const fixture = TestBed.createComponent(
      EmailFieldValidatorBindingsComponent,
    );
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      'input',
    ) as HTMLInputElement;

    expect(input.getAttribute('type')).toBeNull();
    expect(input.type).toBe('text');
  });

  it('propagates min and max to numeric inputs', () => {
    TestBed.configureTestingModule({
      imports: [NumberFieldValidatorBindingsComponent],
    });

    const fixture = TestBed.createComponent(
      NumberFieldValidatorBindingsComponent,
    );
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector(
      'input',
    ) as HTMLInputElement;

    expect(input.required).toBe(true);
    expect(input.min).toBe('2');
    expect(input.max).toBe('10');
  });
});
