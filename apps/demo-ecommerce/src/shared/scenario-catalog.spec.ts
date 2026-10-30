import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ecommerceCodecs,
  ECOMMERCE_CATALOG_VERSION,
  ecommerceOperations,
  ecommerceScenarios,
  encodeEcommerceScenario,
  getEcommerceScenario,
} from './scenario-catalog';

describe('e-commerce operation codecs and scenario catalog', () => {
  it('round-trips business data through the server-function JSON text format', () => {
    const scenario = getEcommerceScenario(
      'ecommerce.catalog',
      'catalog-with-seasonal-products',
    );
    expect(scenario).toBeDefined();
    const businessValue = scenario!.build();
    const transport = ecommerceCodecs.catalog.encode(businessValue as never);

    expect(typeof transport).toBe('string');
    expect(transport).toContain('categories');
    expect(ecommerceCodecs.catalog.decode(transport)).toEqual(businessValue);
    expect(JSON.parse(transport)).toHaveProperty('products');
  });

  it('covers each declared server-function id once and links scenarios to known operations', () => {
    const operationIds = ecommerceOperations.map(({ operationId }) => operationId);
    expect(new Set(operationIds).size).toBe(operationIds.length);
    expect(operationIds).toHaveLength(15);
    expect(
      ecommerceScenarios.every((scenario) => operationIds.includes(scenario.operationId as never)),
    ).toBe(true);
  });

  it('keeps the inventory in sync with every serverFunction declaration', () => {
    const source = readFileSync(new URL('../server/functions.ts', import.meta.url), 'utf8');
    const declaredIds = [...source.matchAll(/serverFunction\('([^']+)'/g)]
      .map(([, id]) => id)
      .sort();
    const catalogIds = ecommerceOperations
      .map(({ operationId }) => operationId)
      .sort();
    expect(catalogIds).toEqual(declaredIds);
  });

  it('returns transport-ready payloads for success references and metadata for failures', () => {
    const success = encodeEcommerceScenario(
      'ecommerce.catalog.search',
      'search-no-result',
    );
    expect(success.catalogVersion).toBe(ECOMMERCE_CATALOG_VERSION);
    expect(success.category).toBe('success');
    expect('response' in success ? success.response : undefined).toBe('[]');

    const denied = encodeEcommerceScenario(
      'ecommerce.product.save',
      'staff-cannot-save-product',
    );
    expect(denied.category).toBe('craft-exception');
    expect('failure' in denied ? denied.failure : undefined).toMatchObject({ code: 'FORBIDDEN' });
    expect(denied).not.toHaveProperty('response');
  });

  it('validates every success builder against the codec it declares', () => {
    for (const scenario of ecommerceScenarios.filter((item) => item.category === 'success')) {
      const businessValue = scenario.build();
      const codec = ecommerceCodecs[scenario.codec];
      const transport = codec.encode(businessValue as never);
      expect(codec.decode(transport)).toEqual(businessValue);
    }
  });
});
