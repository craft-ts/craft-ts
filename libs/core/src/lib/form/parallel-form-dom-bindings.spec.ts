import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField } from '@angular/forms/signals';
import { type GetDeps, type GetPublicComponentProperties } from '../../index';
import { insertNoopTypingAnchor } from '../insert-noop-typing-anchor';
import { state } from '../state';
import { insertForm } from './insert-form';
import { insertSelectFormTree } from './insert-select-form-tree';

@Component({
  standalone: true,
  imports: [FormField],
  template: `<input [formField]="usersForm.select('1')().selectName()" />`,
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

describe('parallel form DOM bindings', () => {
  it('should support formField bindings on selected nested fields', () => {
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
});

export type GenDeps_ParallelSelectedFieldBindingsComponent = GetDeps<{
  deps: {
    FormField: typeof FormField;
  };
  provided: {};
  publicProperties: GetPublicComponentProperties<ParallelSelectedFieldBindingsComponent>;
}>;
