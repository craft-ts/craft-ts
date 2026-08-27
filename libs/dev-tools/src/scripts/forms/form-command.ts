import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

export type FormGeneratorOptions = {
  readonly name: string;
  readonly rootDir?: string;
  readonly advanced?: boolean;
  readonly force?: boolean;
};

export type FormGeneratorResult = {
  readonly directory: string;
  readonly changedFiles: readonly string[];
  readonly advanced: boolean;
};

function slugify(value: string): string {
  const slug = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  if (!slug) throw new Error('A form name is required.');
  return slug;
}

function typeName(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function basicFormSource(name: string, type: string): string {
  const formName = `${name}Form`;
  return `import {
  button,
  craftComponent,
  fieldErrorNode,
  form,
  input,
  label,
  p,
} from '@craft-ts/component';
import {
  cEmail,
  cRequired,
  CraftFieldDirective,
  craftException,
  insertForm,
  insertFormAttributes,
  insertFormSubmit,
  insertNoopTypingAnchor,
  insertSelectFormTree,
  mutation,
  state,
  type ValidatedFormValue,
} from '@craft-ts/core';

export type ${type}FormValue = {
  name: string;
  email: string;
};

const save${type} = mutation('save${type}', {
  method: (value: NonNullable<ValidatedFormValue<${type}FormValue>>) => value,
  loader: ({ params }) =>
    params.email.endsWith('@taken.test')
      ? craftException({ _tag: '${type.toUpperCase()}_EMAIL_ALREADY_USED' }, { field: 'email' })
      : params,
});

export const ${formName} = craftComponent(
  '${type}Form',
  {},
  function* () {
    const ${name} = yield* state(
      '${name}Form',
      { name: '', email: '' } satisfies ${type}FormValue,
      insertForm(
        insertSelectFormTree(
          'name',
          insertNoopTypingAnchor,
          insertFormAttributes(() => ({ validators: [cRequired()] })),
        ),
        insertSelectFormTree(
          'email',
          insertNoopTypingAnchor,
          insertFormAttributes(() => ({ validators: [cRequired(), cEmail()] })),
        ),
        insertFormSubmit(save${type}),
      ),
    );
    return { ${name} };
  },
  ({ ${name} }) => form('${name}-form', {
    *submit(event) {
      event.preventDefault();
      yield* ${name}.form.submit();
    },
  }, [
    label({ htmlFor: '${name}-name' }, 'Name'),
    input('${name}-name', { id: '${name}-name' }).pipe(
      CraftFieldDirective(${name}.form.selectName()),
    ).pipe(fieldErrorNode.exhaustive({
      required: () => p('Name is required.'),
    })),
    label({ htmlFor: '${name}-email' }, 'Email'),
    input('${name}-email', { id: '${name}-email', type: 'email' }).pipe(
      CraftFieldDirective(${name}.form.selectEmail()),
    ).pipe(fieldErrorNode.exhaustive({
      required: () => p('Email is required.'),
      email: () => p('Enter a valid email.'),
    })),
    button('${name}-submit', { type: 'submit', disabled: ${name}.form.submitting }, 'Save'),
    p(function* () {
      const errors = yield* ${name}.form.submitExceptions();
      return errors.length === 0 ? '' : 'The server rejected this value.';
    }),
  ]),
);

export default ${formName};
`;
}

function advancedFormSource(name: string, type: string): string {
  const formName = `${name}Form`;
  return `import {
  button,
  craftComponent,
  craftPipe,
  fieldErrorNode,
  form,
  ifNode,
  input,
  label,
  p,
} from '@craft-ts/component';
import {
  cEmail,
  cRequired,
  CraftFieldDirective,
  craftException,
  insertForm,
  insertFormAttributes,
  insertFormSchema,
  insertFormSubmit,
  insertNoopTypingAnchor,
  insertSelectFormTree,
  mutation,
  state,
  type StandardSchemaV1,
  type ValidatedFormValue,
} from '@craft-ts/core';

export type ${type}FormValue = {
  name: string;
  email: string;
  includeAddress: boolean;
  address: { city: string; postalCode: string };
};

const ${name}Schema = {
  '~standard': {
    version: 1,
    vendor: 'craft-ts-form-generator',
    types: undefined,
    validate(value: unknown) {
      const candidate = value as Partial<${type}FormValue>;
      return candidate.name && candidate.email
        ? { value: value as ${type}FormValue }
        : { issues: [{ message: 'name and email are required' }] };
    },
  },
} satisfies StandardSchemaV1<${type}FormValue, ${type}FormValue>;

const save${type} = mutation('save${type}', {
  method: (value: NonNullable<ValidatedFormValue<${type}FormValue>>) => value,
  loader: ({ params }) =>
    params.email.endsWith('@taken.test')
      ? craftException({ _tag: '${type.toUpperCase()}_EMAIL_ALREADY_USED' }, { field: 'email' })
      : params,
});

export const ${formName} = craftComponent(
  '${type}Form',
  {},
  function* () {
    const includeAddress = yield* state('${name}IncludeAddress', true);
    const ${name} = yield* state(
      '${name}Form',
      {
        name: '',
        email: '',
        includeAddress: true,
        address: { city: '', postalCode: '' },
      } satisfies ${type}FormValue,
      insertForm(
        insertFormSchema(${name}Schema),
        insertSelectFormTree('name', insertNoopTypingAnchor,
          insertFormAttributes(() => ({ validators: [cRequired()] }))),
        insertSelectFormTree('email', insertNoopTypingAnchor,
          insertFormAttributes(() => ({ validators: [cRequired(), cEmail()] }))),
        insertSelectFormTree('address', (context) => craftPipe(
          context,
          insertNoopTypingAnchor,
          insertSelectFormTree('city', insertNoopTypingAnchor,
            insertFormAttributes(() => ({
              validators: [cRequired()],
              hidden: () => !includeAddress(),
            }))),
          insertSelectFormTree('postalCode', insertNoopTypingAnchor,
            insertFormAttributes(() => ({
              validators: [cRequired()],
              hidden: () => !includeAddress(),
            }))),
        )),
        insertFormSubmit(save${type}),
      ),
    );
    // Add cAsyncValidate here when an async uniqueness resource is available.
    return { ${name}, includeAddress };
  },
  ({ ${name}, includeAddress }) => form('${name}-form', {
    *submit(event) {
      event.preventDefault();
      yield* ${name}.form.submit();
    },
  }, [
    label({ htmlFor: '${name}-name' }, 'Name'),
    input('${name}-name', { id: '${name}-name' }).pipe(
      CraftFieldDirective(${name}.form.selectName()),
    ).pipe(fieldErrorNode.exhaustive({
      required: () => p('Name is required.'),
    })),
    label({ htmlFor: '${name}-email' }, 'Email'),
    input('${name}-email', { id: '${name}-email', type: 'email' }).pipe(
      CraftFieldDirective(${name}.form.selectEmail()),
    ).pipe(fieldErrorNode.exhaustive({
      required: () => p('Email is required.'),
      email: () => p('Enter a valid email.'),
    })),
    ifNode(includeAddress, () => [
      label({ htmlFor: '${name}-city' }, 'City'),
      input('${name}-city', { id: '${name}-city' }).pipe(
        CraftFieldDirective(${name}.form.selectAddress().selectCity()),
      ),
      label({ htmlFor: '${name}-postal-code' }, 'Postal code'),
      input('${name}-postal-code', { id: '${name}-postal-code' }).pipe(
        CraftFieldDirective(${name}.form.selectAddress().selectPostalCode()),
      ),
    ]),
    button('${name}-submit', { type: 'submit', disabled: ${name}.form.submitting }, 'Save'),
    p(function* () {
      const errors = yield* ${name}.form.submitExceptions();
      return errors.length === 0 ? '' : 'The server rejected this value.';
    }),
  ]),
);

export default ${formName};
`;
}

function testSource(name: string, type: string, advanced: boolean): string {
  const formName = `${name}Form`;
  return `// @vitest-environment jsdom
import { mountCraftComponent } from '@craft-ts/component';
import { TestBed, ɵInjector as Injector } from '@craft-ts/core';
import { beforeEach, describe, expect, it } from 'vitest';
import ${formName} from './${name}-form';

describe('${type} form', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.replaceChildren();
  });

  it('renders the generated form and exposes validation controls', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const mounted = mountCraftComponent(${formName}, host, TestBed.inject(Injector));
    TestBed.tick();
    expect(host.querySelector('form')).not.toBeNull();
    expect(host.querySelectorAll('input').length).toBeGreaterThanOrEqual(${advanced ? 2 : 2});
    mounted.destroy();
  });

  it('submits through the form boundary and renders validation feedback', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const mounted = mountCraftComponent(${formName}, host, TestBed.inject(Injector));
    TestBed.tick();
    host.querySelector('form')?.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
    TestBed.tick();
    expect(host.textContent).toContain('required');
    mounted.destroy();
  });
});
`;
}

export async function runFormAdd(
  options: FormGeneratorOptions,
): Promise<FormGeneratorResult> {
  const name = slugify(options.name);
  const type = typeName(name);
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const directory = join(rootDir, 'src', 'app', name);
  const files: Record<string, string> = {
    [`${name}-form.ts`]: options.advanced
      ? advancedFormSource(name, type)
      : basicFormSource(name, type),
    [`${name}-form.spec.ts`]: testSource(name, type, options.advanced === true),
    ['README.md']: `# ${type} form\n\nGenerated with craft add form ${name}${options.advanced ? ' --advanced' : ''}.\n\nBind the selected fields with CraftFieldDirective, keep validation in insertFormAttributes, and connect writes with insertFormSubmit.\n`,
  };
  const existing = Object.keys(files).filter((file) =>
    existsSync(join(directory, file)),
  );
  if (existing.length > 0 && !options.force) {
    throw new Error(
      `Refusing to overwrite generated form files: ${existing.map((file) => join(directory, file)).join(', ')}. Use --force to replace them.`,
    );
  }

  await Promise.all(
    Object.entries(files).map(async ([file, contents]) => {
      const target = join(directory, file);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents, 'utf8');
    }),
  );
  return {
    directory,
    changedFiles: Object.keys(files).map((file) =>
      relative(rootDir, join(directory, file)),
    ),
    advanced: options.advanced === true,
  };
}
