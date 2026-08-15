export type FieldIds = {
  readonly inputId: string;
  readonly descriptionId: string;
};

export function fieldIds(id: string): FieldIds {
  return {
    inputId: id,
    descriptionId: `${id}-description`,
  };
}

export type FieldControl = {
  readonly ids: FieldIds;
  readonly input: {
    readonly id: string;
    readonly 'aria-describedby': string;
    readonly 'aria-invalid'?: true;
    readonly 'data-invalid'?: true;
  };
  readonly label: { readonly htmlFor: string };
  readonly description: { readonly id: string };
};

export function fieldControl(
  id: string,
  options?: { readonly invalid?: boolean },
): FieldControl {
  const ids = fieldIds(id);
  return {
    ids,
    input: {
      id: ids.inputId,
      'aria-describedby': ids.descriptionId,
      ...(options?.invalid
        ? { 'aria-invalid': true as const, 'data-invalid': true as const }
        : {}),
    },
    label: { htmlFor: ids.inputId },
    description: { id: ids.descriptionId },
  };
}

export type DisclosureControl = {
  readonly buttonId: string;
  readonly panelId: string;
  readonly button: {
    readonly type: 'button';
    readonly id: string;
    readonly 'aria-expanded': 'true' | 'false';
    readonly 'aria-controls': string;
    readonly 'data-open'?: true;
    readonly 'aria-disabled'?: true;
    readonly 'data-disabled'?: true;
  };
  readonly panel: {
    readonly id: string;
    readonly 'data-open'?: true;
    readonly 'aria-hidden'?: true;
  };
};

export function disclosureControl(
  id: string,
  isOpen: boolean,
  options?: { readonly disabled?: boolean },
): DisclosureControl {
  const buttonId = `${id}-button`;
  const panelId = `${id}-panel`;
  const openAttrs = isOpen ? ({ 'data-open': true as const } as const) : {};
  return {
    buttonId,
    panelId,
    button: {
      type: 'button',
      id: buttonId,
      'aria-expanded': isOpen ? 'true' : 'false',
      'aria-controls': panelId,
      ...openAttrs,
      ...(options?.disabled
        ? { 'aria-disabled': true as const, 'data-disabled': true as const }
        : {}),
    },
    panel: {
      id: panelId,
      ...openAttrs,
      ...(isOpen ? {} : { 'aria-hidden': true as const }),
    },
  };
}
