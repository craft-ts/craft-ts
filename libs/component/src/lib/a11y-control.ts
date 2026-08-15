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
