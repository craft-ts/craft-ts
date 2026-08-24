import { serverFunction } from '@craft-ts/core';
import { Effect, Schema } from 'effect';

const publicProductsInputSchema = Schema.toStandardSchemaV1(Schema.Struct({}));

const publicProductSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  category: Schema.String,
  price: Schema.Number,
  available: Schema.Boolean,
});

const publicProductsOutputSchema = Schema.toStandardSchemaV1(
  Schema.Array(publicProductSchema),
);

const PUBLIC_PRODUCTS = [
  {
    id: 'craft-starter',
    name: 'Craft Starter',
    description: 'A small toolkit for getting started with Craft.',
    category: 'Starter kits',
    price: 29,
    available: true,
  },
  {
    id: 'craft-pro',
    name: 'Craft Pro',
    description: 'The full toolkit for production applications.',
    category: 'Starter kits',
    price: 79,
    available: true,
  },
  {
    id: 'runtime-pass',
    name: 'Runtime Pass',
    description: 'A public add-on for local runtime diagnostics.',
    category: 'Add-ons',
    price: 12,
    available: false,
  },
] as const;

/** Public server function: no middleware, no input data, no client context. */
export const listPublicProducts = serverFunction(
  'demo.products.list',
  publicProductsInputSchema,
  { exposure: 'client', output: publicProductsOutputSchema },
).handler(() => Effect.succeed(PUBLIC_PRODUCTS)).exposeErrors({});
