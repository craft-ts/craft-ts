import { Schema } from 'effect';

export const UserSchema = Schema.Struct({
  id: Schema.Finite,
  name: Schema.String,
  email: Schema.String,
});

export type User = Schema.Schema.Type<typeof UserSchema>;
