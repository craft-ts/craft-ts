import { For, Match, Show, Switch } from 'solid-js';
import { FORM_GROUPS, cx, fieldLabel, isMissing } from '../../page-common.js';
import { usePage } from './store.js';
import { Button } from './ui.js';

function Label(props: { field: any }) {
  return <label class="form-field__label">{fieldLabel(props.field)}</label>;
}

function HelpText(props: { field: any }) {
  return <p class="help">{props.field.help}</p>;
}

function FieldError() {
  return <p class="field-error">This field is required.</p>;
}

function FormControl(props: { field: any }) {
  const page = usePage();
  const text = () => String(page.model.form[props.field.id]);
  const edit = (value: string | boolean) =>
    page.dispatch({ type: 'edit-field', id: props.field.id, value });
  return (
    <Switch>
      <Match when={props.field.kind === 'text'}>
        <input
          type="text"
          class="control"
          value={text()}
          onInput={(event) => edit(event.currentTarget.value)}
        />
      </Match>
      <Match when={props.field.kind === 'textarea'}>
        <textarea
          class="control control--area"
          value={text()}
          onInput={(event) => edit(event.currentTarget.value)}
        />
      </Match>
      <Match when={props.field.kind === 'select'}>
        <select
          class="control"
          onChange={(event) => edit(event.currentTarget.value)}
        >
          <For each={props.field.options ?? []}>
            {(name: string) => (
              <option value={name} selected={text() === name}>
                {name}
              </option>
            )}
          </For>
        </select>
      </Match>
      <Match when={props.field.kind === 'checkbox'}>
        <input
          type="checkbox"
          class="control control--check"
          checked={page.model.form[props.field.id] === true}
          onChange={(event) => edit(event.currentTarget.checked)}
        />
      </Match>
    </Switch>
  );
}

function FormField(props: { field: any }) {
  const page = usePage();
  const missing = () =>
    isMissing(props.field, page.model.form[props.field.id]);
  return (
    <div class={cx('form-field', missing() && 'has-error')}>
      <Label field={props.field} />
      <FormControl field={props.field} />
      <HelpText field={props.field} />
      <Show when={missing()}>
        <FieldError />
      </Show>
    </div>
  );
}

function FormGroup(props: { group: any }) {
  return (
    <fieldset class="form-group">
      <legend class="form-group__title">{props.group.title}</legend>
      <For each={props.group.fields}>
        {(field: any) => <FormField field={field} />}
      </For>
    </fieldset>
  );
}

export function FormSection() {
  return (
    <form class="form-section">
      <h3 class="form-section__title">Account details</h3>
      <For each={FORM_GROUPS}>{(group) => <FormGroup group={group} />}</For>
      <div class="form-section__actions">
        <Button label="Save" variant="primary" action="noop" />
        <Button label="Cancel" variant="ghost" action="noop" />
      </div>
    </form>
  );
}
