import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { insertNoopTypingAnchor } from '@craft-ng/core';
import { craftPipe } from '@craft-ng/core';
import { state } from '@craft-ng/core';
import { LegacyCraftFieldDirective as CraftFieldDirective } from '@craft-ng/angular';
import { insertForm } from '@craft-ng/core';
import { insertFormAttributes } from '@craft-ng/core';
import { insertSelectFormTree } from '@craft-ng/core';
import {
  cEmail,
  cMax,
  cMaxLength,
  cMin,
  cMinLength,
  cPattern,
  cRequired,
} from '@craft-ng/core';
import { craftUse } from '@craft-ng/core';

@Component({
  standalone: true,
  imports: [CraftFieldDirective],
  template: `<input [craftField]="emailField" />`,
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
  );
  protected readonly emailField = this.loginForm.form.selectEmail()!;
}

@Component({
  standalone: true,
  imports: [CraftFieldDirective],
  template: `<input type="number" [craftField]="ageField" />`,
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
  );
  protected readonly ageField = this.numberForm.form.selectAge()!;
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
    TestBed.tick();

    const input = fixture.nativeElement.querySelector(
      'input',
    ) as HTMLInputElement;

    expect(input.required).toBe(true);
    expect(input.minLength).toBe(5);
    expect(input.maxLength).toBe(10);
  });

  it('does not infer type=email from validators alone', () => {
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
    expect(input.pattern).toBe('');
  });

  it('propagates min and max to numeric inputs', () => {
    TestBed.configureTestingModule({
      imports: [NumberFieldValidatorBindingsComponent],
    });

    const fixture = TestBed.createComponent(
      NumberFieldValidatorBindingsComponent,
    );
    fixture.detectChanges();
    TestBed.tick();

    const input = fixture.nativeElement.querySelector(
      'input',
    ) as HTMLInputElement;

    expect(input.required).toBe(true);
    expect(input.min).toBe('2');
    expect(input.max).toBe('10');
  });
});
