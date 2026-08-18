import { describe, expect, it } from 'vitest';
import { migrateTemplateToCraft } from './migrate-template';

describe('template migration', () => {
  it('converts native HTML and custom elements into a Craft template', () => {
    const result = migrateTemplateToCraft(`
      <section class="card" data-testid="card">
        <h2>Hello {{ title }}</h2>
        <my-button variant="primary">Save</my-button>
      </section>
    `);

    expect(result.diagnostics).toEqual([]);
    expect(result.imports).toEqual(['customElement', 'h2', 'section']);
    expect(result.code).toContain(
      "import { customElement, h2, section } from '@craft-ts/component';",
    );
    expect(result.code).toContain(
      "section({ class: 'card', 'data-testid': 'card' }, [",
    );
    expect(result.code).toContain('h2(() =>');
    expect(result.code).toContain(
      "customElement('my-button', { variant: 'primary' }, 'Save')",
    );
  });

  it('wraps the expression in a complete named Craft component', () => {
    const result = migrateTemplateToCraft('<button>Save</button>', {
      componentName: 'save-card',
    });

    expect(result.imports).toEqual(['button', 'craftComponent']);
    expect(result.code).toContain(
      "import { button, craftComponent } from '@craft-ts/component';",
    );
    expect(result.code).toContain('export const saveCard = craftComponent(');
  });

  it('supports Angular property/event bindings and reports structural syntax', () => {
    const result = migrateTemplateToCraft(
      '<button [disabled]="isDisabled" (click)="save()" *ngIf="visible">Save</button>',
    );

    expect(result.code).toContain('disabled: () => isDisabled');
    expect(result.code).toContain('click: (event) => save()');
    expect(result.diagnostics[0]?.code).toBe('UNSUPPORTED_ANGULAR_SYNTAX');
  });
});
