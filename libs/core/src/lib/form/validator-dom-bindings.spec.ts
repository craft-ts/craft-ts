import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField } from '@angular/forms/signals';
import { insertNoopTypingAnchor } from '../insert-noop-typing-anchor';
import { state } from '../state';
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

@Component({
  standalone: true,
  imports: [FormField],
  template: `<input [formField]="loginForm.form.email" />`,
})
class EmailFieldValidatorBindingsComponent {
  protected readonly loginForm = state(
    { email: '' },
    insertForm(
      insertSelectFormTree(
        'email',
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
  );
}

@Component({
  standalone: true,
  imports: [FormField],
  template: `<input type="number" [formField]="numberForm.form.age" />`,
})
class NumberFieldValidatorBindingsComponent {
  protected readonly numberForm = state(
    { age: 0 },
    insertForm(
      insertSelectFormTree(
        'age',
        insertNoopTypingAnchor,
        insertFormAttributes(() => ({
          validators: [
            cRequired(),
            cMin({ min: 2 }),
            cMax({ max: 10 }),
          ],
        })),
      ),
    ),
  );
}

describe('validator DOM bindings', () => {
  it('should propagate required, minLength and maxLength native attributes to textual inputs', () => {
    TestBed.configureTestingModule({
      imports: [EmailFieldValidatorBindingsComponent],
    });

    const fixture = TestBed.createComponent(EmailFieldValidatorBindingsComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    expect(input.required).toBe(true);
    expect(input.minLength).toBe(5);
    expect(input.maxLength).toBe(10);
  });

  it('should not infer type=email or pattern from validators alone', () => {
    TestBed.configureTestingModule({
      imports: [EmailFieldValidatorBindingsComponent],
    });

    const fixture = TestBed.createComponent(EmailFieldValidatorBindingsComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    expect(input.getAttribute('type')).toBeNull();
    expect(input.type).toBe('text');
    expect(input.getAttribute('pattern')).toBeNull();
  });

  it('should propagate min and max native attributes to numeric inputs', () => {
    TestBed.configureTestingModule({
      imports: [NumberFieldValidatorBindingsComponent],
    });

    const fixture = TestBed.createComponent(NumberFieldValidatorBindingsComponent);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    expect(input.required).toBe(true);
    expect(input.min).toBe('2');
    expect(input.max).toBe('10');
  });
});
