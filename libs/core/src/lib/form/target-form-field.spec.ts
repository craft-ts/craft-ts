import {
  type Signal,
} from '../host/craft-compat';
import { Expect, Equal } from 'test-type';
import { FormFieldPath, TargetFormField } from './target-form-field';

interface StringField {
  value: Signal<string>;
}

interface ContactItemForm {
  selectFirstname: () => StringField;
  selectLastname: () => StringField;
  selectEmail: () => StringField;
  selectRelation: () => StringField;
}

interface ContactsForm {
  selectContact: (id: number) => ContactItemForm | undefined;
  items: () => ContactItemForm[];
}

interface RegistrationForm {
  selectName: () => StringField;
  selectPseudo: () => StringField;
  selectContacts: () => ContactsForm;
}

interface UserItemForm {
  selectName: () => StringField;
  selectAge: () => StringField;
}

interface UsersParallelState {
  forms: Signal<UserItemForm[]>;
  select: (id: number) => UserItemForm | undefined;
}

it('FormFieldPath lists every select* path and array dereferences on an object form', () => {
  type Paths = FormFieldPath<RegistrationForm>;

  type Expected =
    | 'selectName'
    | 'selectPseudo'
    | 'selectContacts'
    | 'selectContacts.selectContact'
    | 'selectContacts.selectContact.selectFirstname'
    | 'selectContacts.selectContact.selectLastname'
    | 'selectContacts.selectContact.selectEmail'
    | 'selectContacts.selectContact.selectRelation'
    | 'selectContacts.items'
    | 'selectContacts.items.selectFirstname'
    | 'selectContacts.items.selectLastname'
    | 'selectContacts.items.selectEmail'
    | 'selectContacts.items.selectRelation';

  type _ = Expect<Equal<Paths, Expected>>;
});

it('FormFieldPath only emits select*, items and forms — filters out signals and other keys', () => {
  interface NoisyForm {
    selectName: () => StringField;
    value: Signal<string>;
    set: (next: string) => void;
    dirty: Signal<boolean>;
  }

  type Paths = FormFieldPath<NoisyForm>;

  type _ = Expect<Equal<Paths, 'selectName'>>;
});

it('FormFieldPath exposes forms and select on a parallel-mode state', () => {
  type Paths = FormFieldPath<UsersParallelState>;

  type Expected =
    | 'forms'
    | 'forms.selectName'
    | 'forms.selectAge'
    | 'select'
    | 'select.selectName'
    | 'select.selectAge';

  type _ = Expect<Equal<Paths, Expected>>;
});

it('FormFieldPath returns never on a leaf form (no navigable keys)', () => {
  type Paths = FormFieldPath<StringField>;
  type _ = Expect<Equal<Paths, never>>;
});

it('TargetFormField resolves a direct select path to the child form', () => {
  type Name = TargetFormField<RegistrationForm, 'selectName'>;
  type _ = Expect<Equal<Name, StringField>>;
});

it('TargetFormField returns the parent array form when path stops at the array node', () => {
  type Contacts = TargetFormField<RegistrationForm, 'selectContacts'>;
  type _ = Expect<Equal<Contacts, ContactsForm>>;
});

it('TargetFormField unwraps items() to the item form type', () => {
  type Contact = TargetFormField<RegistrationForm, 'selectContacts.items'>;
  type _ = Expect<Equal<Contact, ContactItemForm>>;
});

it('TargetFormField descends through items into a nested field', () => {
  type Firstname = TargetFormField<
    RegistrationForm,
    'selectContacts.items.selectFirstname'
  >;
  type _ = Expect<Equal<Firstname, StringField>>;
});

it('TargetFormField strips undefined when descending through a select-by-id method', () => {
  type Firstname = TargetFormField<
    RegistrationForm,
    'selectContacts.selectContact.selectFirstname'
  >;
  type _ = Expect<Equal<Firstname, StringField>>;
});

it('TargetFormField resolves the parallel forms signal to its item form', () => {
  type User = TargetFormField<UsersParallelState, 'forms'>;
  type _ = Expect<Equal<User, UserItemForm>>;
});

it('TargetFormField resolves parallel select to its item form (undefined stripped)', () => {
  type User = TargetFormField<UsersParallelState, 'select'>;
  type _ = Expect<Equal<User, UserItemForm>>;
});

it('TargetFormField descends through the parallel forms signal into a nested field', () => {
  type UserName = TargetFormField<UsersParallelState, 'forms.selectName'>;
  type _ = Expect<Equal<UserName, StringField>>;
});

it('TargetFormField descends through parallel select into a nested field', () => {
  type UserName = TargetFormField<UsersParallelState, 'select.selectName'>;
  type _ = Expect<Equal<UserName, StringField>>;
});

it('TargetFormField rejects paths that are not in FormFieldPath<Form>', () => {
  type Form = RegistrationForm;
  // @ts-expect-error 'doesNotExist' is not a valid path on RegistrationForm
  type _Invalid = TargetFormField<Form, 'doesNotExist'>;
  // @ts-expect-error signals are filtered out — 'value' is not a navigable step
  type _Signal = TargetFormField<StringField, 'value'>;
  // @ts-expect-error nested invalid segment
  type _Nested = TargetFormField<Form, 'selectContacts.notAField'>;
});
