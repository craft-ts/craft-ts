# Validators

Validators are declared on a field and produce **typed exceptions** — so the
errors a field can raise are known to the compiler, not discovered at runtime.

**Start with the built-ins** below; reach for `cValidate` / `cAsyncValidate`
when a rule is specific to your domain.

@craft-ng provides a complete set of validators with structured exception handling:

## Built-in Validators

### cRequired

Checks that a value is present (not empty).

```ts
insertFormAttributes(() => ({
  validators: [cRequired()],
}));

// With condition
insertFormAttributes(() => ({
  validators: [cRequired({ when: () => fieldIsRequired() })],
}));
```

### cEmail

Checks that a string is a valid email.

```ts
insertFormAttributes(() => ({
  validators: [cEmail()],
}));
```

### cMin / cMax

Checks that a numeric value is within a range.

```ts
insertFormAttributes(() => ({
  validators: [cMin({ min: 18 }), cMax({ max: 100 })],
}));

// Dynamic values
insertFormAttributes(() => ({
  validators: [cMin({ min: () => minimumValue() })],
}));
```

### cMinLength / cMaxLength

Checks the length of a string or collection.

```ts
insertFormAttributes(() => ({
  validators: [cMinLength({ minLength: 8 }), cMaxLength({ maxLength: 500 })],
}));
```

### cPattern

Checks that a string matches a regex pattern.

```ts
insertFormAttributes(() => ({
  validators: [cPattern({ pattern: /^\d{10}$/ })],
}));
```

## Custom Validators

### cValidate

Creates a custom synchronous validator.

```ts
insertFormAttributes(() => ({
  validators: [
    cValidate({
      name: 'passwordStrength',
      validWhen: () => {
        const pwd = password();
        return pwd.length >= 8 && /[A-Z]/.test(pwd);
      },
      exception: () =>
        craftException(
          { code: 'weak-password' },
          {
            message:
              'Password must contain 8 characters and an uppercase letter',
          },
        ),
    }),
  ],
}));
```

### cAsyncValidate

Creates an asynchronous validator based on a resource (query or mutation).

::: warning
It is not working yet. We are still working on it. The API is not final and may change.
:::

```ts
const { checkEmailQuery } = query('checkEmailQuery', {
  params: () => ({ email: emailInput() }),
  loader: async ({ params }) => {
    const response = await fetch(`/api/check-email?email=${params.email}`);
    return response.json();
  },
});

insertFormAttributes(() => ({
  validators: [
    cAsyncValidate(checkEmailQuery, {
      name: 'emailAvailability',
      exceptionsOnSuccess: ({ validateAsyncCraftResource }) => {
        if (!validateAsyncCraftResource.value()?.available) {
          return craftException({ code: 'email-taken' }, undefined);
        }
        return undefined;
      },
    }),
  ],
}));
```

## See Also

- [Forms overview](/guide/forms/)
- [Form exceptions](/guide/forms/exceptions)
