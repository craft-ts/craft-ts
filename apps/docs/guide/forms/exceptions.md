# Form exception handling

Form errors are typed and grouped by where they came from — a field's
validators, or submission. Nothing is a loose string.

**Read this when** you render errors, or when you need to know which codes a
field can produce.

@craft-ng forms use a structured exception system:

```ts
const form = userFormState.form();

// All exceptions
const allErrors = form.exceptions().list;

// get first or last validation exception according to the order of validators
const first = fieldForm.form.firstLeftFailedValidation();
const last = fieldForm.form.lastRightFailedValidation();

// Exception by validator
const requiredError = form().selectEmail()().exceptions()?.byValidator[
  'cRequired'
];
const emailError = form().selectEmail()().exceptions()?.byValidator.cEmail;

// Each exception has a code and payload
if (emailError) {
  console.log(emailError.code); // 'email'
  console.log(emailError.payload); // undefined
}

if (form.exceptions()?.byValidator?.cMin) {
  const minError = form.exceptions()?.byValidator?.['cMin'];
  console.log(minError.code); // 'min'
  console.log(minError.payload); // 18 (the minimum value)
}
```

## See Also

- [Submitting a form](/guide/forms/submit)
- [Exceptions as values](/guide/concepts/exceptions)
