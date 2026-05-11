import { Component, forwardRef, model, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { craftField, CraftValueControl, FieldAttributeMeta } from './craft-field';
import {
  CRAFT_FIELD_VALUE_CONTROL,
  CraftFieldDirective,
} from './craft-field.directive';

@Component({
  standalone: true,
  imports: [CraftFieldDirective],
  template: `<input [craftField]="form.email" />`,
})
class TextInputHost {
  protected readonly form = craftField({ email: '' });
}

@Component({
  standalone: true,
  imports: [CraftFieldDirective],
  template: `<input type="number" [craftField]="form.age" />`,
})
class NumberInputHost {
  protected readonly form = craftField({ age: 0 });
}

@Component({
  standalone: true,
  imports: [CraftFieldDirective],
  template: `<input type="checkbox" [craftField]="form.subscribed" />`,
})
class CheckboxInputHost {
  protected readonly form = craftField({ subscribed: false });
}

@Component({
  standalone: true,
  imports: [CraftFieldDirective],
  template: `
    <input type="radio" value="a" [craftField]="form.choice" />
    <input type="radio" value="b" [craftField]="form.choice" />
    <input type="radio" value="c" [craftField]="form.choice" />
  `,
})
class RadioGroupHost {
  protected readonly form = craftField({ choice: 'a' });
}

@Component({
  standalone: true,
  imports: [CraftFieldDirective],
  template: `
    <select [craftField]="form.country">
      <option value="fr">France</option>
      <option value="de">Germany</option>
    </select>
  `,
})
class SelectInputHost {
  protected readonly form = craftField({ country: 'fr' });
}

@Component({
  standalone: true,
  imports: [CraftFieldDirective],
  template: `<textarea [craftField]="form.bio"></textarea>`,
})
class TextareaHost {
  protected readonly form = craftField({ bio: '' });
}

@Component({
  selector: 'custom-text-control',
  standalone: true,
  template: `<span>{{ value() }}</span>`,
  providers: [
    {
      provide: CRAFT_FIELD_VALUE_CONTROL,
      useExisting: forwardRef(() => CustomTextControl),
    },
  ],
})
class CustomTextControl implements CraftValueControl<string> {
  readonly value = model<string>('');
}

@Component({
  standalone: true,
  imports: [CraftFieldDirective, CustomTextControl],
  template: `<custom-text-control [craftField]="form.label"></custom-text-control>`,
})
class CustomControlHost {
  protected readonly form = craftField({ label: 'initial' });
}

describe('CraftFieldDirective', () => {
  it('binds a text input bidirectionally', () => {
    const fixture = TestBed.createComponent(TextInputHost);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('');

    input.value = 'hello@example.com';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const inst = fixture.componentInstance as unknown as { form: { email: { value: () => string } } };
    expect(inst.form.email.value()).toBe('hello@example.com');
  });

  it('marks the field touched on blur', () => {
    const fixture = TestBed.createComponent(TextInputHost);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const inst = fixture.componentInstance as unknown as {
      form: { email: { touched: () => boolean } };
    };

    expect(inst.form.email.touched()).toBe(false);
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    fixture.detectChanges();
    expect(inst.form.email.touched()).toBe(true);
  });

  it('parses number inputs as numeric values', () => {
    const fixture = TestBed.createComponent(NumberInputHost);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    input.value = '42';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const inst = fixture.componentInstance as unknown as { form: { age: { value: () => number } } };
    expect(inst.form.age.value()).toBe(42);
  });

  it('binds a checkbox to a boolean field', () => {
    const fixture = TestBed.createComponent(CheckboxInputHost);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    const inst = fixture.componentInstance as unknown as {
      form: { subscribed: { value: () => boolean } };
    };
    expect(inst.form.subscribed.value()).toBe(true);
  });

  it('groups radios via the field path and reflects checked state', () => {
    const fixture = TestBed.createComponent(RadioGroupHost);
    fixture.detectChanges();
    const radios = Array.from(
      fixture.nativeElement.querySelectorAll('input[type=radio]'),
    ) as HTMLInputElement[];

    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);
    expect(radios[2].checked).toBe(false);

    // All radios share the same name (derived from path 'choice')
    expect(radios[0].name).toBe('choice');
    expect(radios[1].name).toBe('choice');

    // Click the second radio
    radios[1].checked = true;
    radios[1].dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    const inst = fixture.componentInstance as unknown as {
      form: { choice: { value: () => string } };
    };
    expect(inst.form.choice.value()).toBe('b');
  });

  it('binds a select element to its value', () => {
    const fixture = TestBed.createComponent(SelectInputHost);
    fixture.detectChanges();
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;

    expect(select.value).toBe('fr');

    select.value = 'de';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    const inst = fixture.componentInstance as unknown as {
      form: { country: { value: () => string } };
    };
    expect(inst.form.country.value()).toBe('de');
  });

  it('binds a textarea like a text input', () => {
    const fixture = TestBed.createComponent(TextareaHost);
    fixture.detectChanges();
    const ta = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;

    ta.value = 'a long bio';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const inst = fixture.componentInstance as unknown as {
      form: { bio: { value: () => string } };
    };
    expect(inst.form.bio.value()).toBe('a long bio');
  });

  it('binds a custom signal-control via CRAFT_FIELD_VALUE_CONTROL', () => {
    const fixture = TestBed.createComponent(CustomControlHost);
    fixture.detectChanges();
    const span = fixture.nativeElement.querySelector('span') as HTMLSpanElement;

    expect(span.textContent).toBe('initial');

    const inst = fixture.componentInstance as unknown as {
      form: { label: { set: (v: string) => void } };
    };
    inst.form.label.set('updated');
    fixture.detectChanges();

    expect(span.textContent).toBe('updated');
  });

  it('propagates required, minLength, maxLength to a text input', () => {
    @Component({
      standalone: true,
      imports: [CraftFieldDirective],
      template: `<input [craftField]="form.email" />`,
    })
    class Host {
      protected readonly form = craftField({ email: '' });
      constructor() {
        this.form.email.ɵregisterValidator(() => ({
          result: signal(undefined).asReadonly(),
          attribute: signal({
            kind: 'native-constraint',
            target: 'required',
            value: true,
          } satisfies FieldAttributeMeta).asReadonly(),
        }));
        this.form.email.ɵregisterValidator(() => ({
          result: signal(undefined).asReadonly(),
          attribute: signal({
            kind: 'native-constraint',
            target: 'minLength',
            value: 5,
          } satisfies FieldAttributeMeta).asReadonly(),
        }));
        this.form.email.ɵregisterValidator(() => ({
          result: signal(undefined).asReadonly(),
          attribute: signal({
            kind: 'native-constraint',
            target: 'maxLength',
            value: 10,
          } satisfies FieldAttributeMeta).asReadonly(),
        }));
      }
    }

    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    expect(input.required).toBe(true);
    expect(input.minLength).toBe(5);
    expect(input.maxLength).toBe(10);
  });

  it('toggles craft-* status classes', () => {
    const fixture = TestBed.createComponent(TextInputHost);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;

    expect(input.classList.contains('craft-pristine')).toBe(true);
    expect(input.classList.contains('craft-untouched')).toBe(true);
    expect(input.classList.contains('craft-valid')).toBe(true);

    input.value = 'x';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(input.classList.contains('craft-dirty')).toBe(true);
    expect(input.classList.contains('craft-pristine')).toBe(false);
  });

  // Regression: previously `el.maxLength = -1` was used when no constraint was
  // registered, which throws IndexSizeError on modern browsers.
  it('does not crash when no minLength/maxLength constraint is registered', () => {
    expect(() => {
      const fixture = TestBed.createComponent(TextInputHost);
      fixture.detectChanges();
      const input = fixture.nativeElement.querySelector(
        'input',
      ) as HTMLInputElement;
      expect(input.hasAttribute('minlength')).toBe(false);
      expect(input.hasAttribute('maxlength')).toBe(false);
    }).not.toThrow();
  });
});
