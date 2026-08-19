import { Schema } from 'effect';

export const UserEmail = Schema.String.pipe(
  Schema.annotations({ sensitivity: 'personal-data' }),
);

export const UserSchema = Schema.Struct({
  id: Schema.Finite,
  name: Schema.String,
  email: UserEmail,
});

export type User = Schema.Schema.Type<typeof UserSchema>;
