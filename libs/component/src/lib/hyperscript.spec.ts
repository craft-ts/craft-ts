import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  area,
  button,
  caption,
  dialog,
  fieldset,
  figcaption,
  figure,
  form,
  h,
  h4,
  h5,
  h6,
  iframe,
  img,
  input,
  legend,
  select,
  svg,
  table,
  tbody,
  td,
  textarea,
  th,
  thead,
  tr,
} from './hyperscript';

describe('hyperscript a11y types', () => {
  it('requires alt on img, including an empty decorative value', () => {
    const decorative = img({ alt: '' });
    const named = img('hero', { alt: 'Product photo' });

    expect(decorative.tag).toBe('img');
    expect(named.localName).toBe('hero');

    // @ts-expect-error img requires alt, including '' for decorative images
    img({});
    // @ts-expect-error img cannot be called with children only — alt is required
    img();
  });

  it('requires alt on area', () => {
    const node = area({ alt: '', href: '#section' });
    expect(node.tag).toBe('area');

    // @ts-expect-error area requires alt
    area({ href: '#section' });
  });

  it('exposes the semantic helpers that used to require h()', () => {
    expect(dialog({}).tag).toBe('dialog');
    expect(fieldset([legend('Account')]).tag).toBe('fieldset');
    expect(legend('Account').tag).toBe('legend');
    expect(table([caption('Scores'), thead([tr([th('Name')])]), tbody([tr([td('Ada')])])]).tag).toBe(
      'table',
    );
    expect(figure([figcaption('Caption')]).tag).toBe('figure');
    expect(h4('Four').tag).toBe('h4');
    expect(h5('Five').tag).toBe('h5');
    expect(h6('Six').tag).toBe('h6');
    expect(iframe({ title: 'Preview', src: 'about:blank' }).tag).toBe('iframe');
    expect(svg({}).tag).toBe('svg');
  });
});

describe('hyperscript DOM event types', () => {
  it('types an unannotated input handler target as a text element', () => {
    const node = input({
      input: (event) => {
        expectTypeOf(event).not.toBeAny();
        expectTypeOf(event.target.value).toEqualTypeOf<string>();
        return event.target;
      },
    });

    expect(node.tag).toBe('input');
  });

  it('types generator methods inside a ComponentTemplate', () => {
    const template: import('./types').ComponentTemplate<{}> = () =>
      input({
        type: 'text',
        *input(event) {
          expectTypeOf(event.target.value).toEqualTypeOf<string>();
        },
        *keydown(event) {
          expectTypeOf(event.key).toEqualTypeOf<string>();
        },
      });

    expect(typeof template).toBe('function');
  });

  it('types generator methods on a text input with value and placeholder', () => {
    const node = input({
      type: 'text',
      placeholder: 'New todo title…',
      value: 'title',
      *input(event) {
        expectTypeOf(event.target.value).toEqualTypeOf<string>();
      },
      *keydown(event) {
        expectTypeOf(event.key).toEqualTypeOf<string>();
      },
    });

    expect(node.tag).toBe('input');
  });

  it('types an unannotated keydown handler as a KeyboardEvent', () => {
    const node = input({
      *keydown(event) {
        expectTypeOf(event).toMatchTypeOf<KeyboardEvent>();
        expectTypeOf(event.key).toEqualTypeOf<string>();
        expectTypeOf(event.target.value).toEqualTypeOf<string>();
      },
    });

    expect(node.tag).toBe('input');
  });

  it('types select change target as HTMLSelectElement', () => {
    const node = select({
      change: (event) => {
        expectTypeOf(event.target).toMatchTypeOf<HTMLSelectElement>();
        return event.target.value;
      },
    });

    expect(node.tag).toBe('select');
  });

  it('types button click as a MouseEvent on HTMLButtonElement', () => {
    const node = button({
      click: (event) => {
        expectTypeOf(event).toMatchTypeOf<MouseEvent>();
        expectTypeOf(event.target).toMatchTypeOf<HTMLButtonElement>();
        expectTypeOf(event.currentTarget).toMatchTypeOf<HTMLButtonElement>();
      },
    });

    expect(node.tag).toBe('button');
  });

  it('allows checkbox checked and rejects files', () => {
    const node = input({
      type: 'checkbox',
      change: (event) => {
        expectTypeOf(event.target.checked).toEqualTypeOf<boolean>();
        // @ts-expect-error files is not valid on a checkbox input
        return event.target.files;
      },
    });

    expect(node.tag).toBe('input');
  });

  it('rejects checked on a text input', () => {
    const node = input({
      type: 'text',
      input: (event) => {
        // @ts-expect-error checked is not valid on a text input
        return event.target.checked;
      },
    });

    expect(node.tag).toBe('input');
  });

  it('types file input files as FileList', () => {
    const node = input({
      type: 'file',
      change: (event) => {
        expectTypeOf(event.target.files).toEqualTypeOf<FileList>();
        return event.target.files;
      },
    });

    expect(node.tag).toBe('input');
  });

  it('types number input valueAsNumber', () => {
    const node = input({
      type: 'number',
      input: (event) => event.target.valueAsNumber,
    });

    expect(node.tag).toBe('input');
  });

  it('keeps the full HTMLInputElement when type is a wide string', () => {
    const kind = 'checkbox' as string;
    const node = input({
      type: kind,
      change: (event) => {
        expectTypeOf(event.target.checked).toEqualTypeOf<boolean>();
        expectTypeOf(event.target.files).toEqualTypeOf<FileList | null>();
        return event.target;
      },
    });

    expect(node.tag).toBe('input');
  });

  it('types a named checkbox input the same way', () => {
    const node = input('rememberMe', {
      type: 'checkbox',
      change: (event) => event.target.checked,
    });

    expect(node.localName).toBe('rememberMe');
  });

  it('rejects checked as a prop on a text input', () => {
    input({
      type: 'text',
      // @ts-expect-error checked is not valid on a text input
      checked: true,
    });
  });

  it('types textarea input and form submit without the input() type table', () => {
    const areaNode = textarea({
      input: (event) => {
        expectTypeOf(event.target).toMatchTypeOf<HTMLTextAreaElement>();
        return event.target.value;
      },
    });
    const formNode = form({
      submit: (event) => {
        expectTypeOf(event).toMatchTypeOf<SubmitEvent>();
        expectTypeOf(event.target).toMatchTypeOf<HTMLFormElement>();
      },
    });

    expect(areaNode.tag).toBe('textarea');
    expect(formNode.tag).toBe('form');
  });

  it('types h("input") events as HTMLInputElement without the type table', () => {
    const props: import('./hyperscript').ElementProps<'input'> = {
      type: 'text',
      checked: true,
      keydown: (event) => {
        expectTypeOf(event.key).toEqualTypeOf<string>();
        expectTypeOf(event.target.checked).toEqualTypeOf<boolean>();
        expectTypeOf(event.target.files).toEqualTypeOf<FileList | null>();
        return event.target;
      },
    };
    const node = h('input', props);

    expect(node.tag).toBe('input');
  });

  it('keeps the full HTMLInputElement when type is a callback', () => {
    const node = input({
      type: () => 'checkbox',
      change: (event) => {
        expectTypeOf(event.target.checked).toEqualTypeOf<boolean>();
        expectTypeOf(event.target.files).toEqualTypeOf<FileList | null>();
        return event.target;
      },
    });

    expect(node.tag).toBe('input');
  });
});
