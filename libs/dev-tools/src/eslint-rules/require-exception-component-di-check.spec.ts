import { ESLint, type Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

const rule = require('./require-exception-component-di-check.cjs');

describe('require-exception-component-di-check', () => {
  it('generates distinct O(1) checks for renderComponent and errorComponent', async () => {
    const eslint = new ESLint({
      fix: true,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          languageOptions: {
            parser: tsParser as unknown as Linter.Parser,
            parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
          },
          plugins: { local: { rules: { checked: rule } } },
          rules: { 'local/checked': 'error' },
        },
      ],
    });
    const source = `
import { craftRoutes, craftRoute, ValidateCascadeRoutesFile } from '@craft-ng/core';
const { demoRoutes } = craftRoutes('demo', [craftRoute(':userId', {
  component: class {}, componentDeps: {},
  errorComponent: { component: class {}, componentDeps: {} as import('./route-error').GenDeps_RouteError },
}, { USER_DISABLED: craftExceptionHandler(function* ({ renderComponent }) {
  return renderComponent({ loadComponent: () => import('./disabled'), componentDeps: {} as import('./disabled').GenDeps_Disabled });
}) })]);
type _Check = ValidateCascadeRoutesFile<'Parent', Router, typeof demoRoutes>;
`;
    const result = (
      await eslint.lintText(source, { filePath: 'demo.routes.ts' })
    )[0];
    expect(
      result.output?.match(/RouteExceptionComponentCheckedDI</g),
    ).toHaveLength(2);
    expect(result.output).toContain("'DemoUserIdUserDisabledException'");
    expect(result.output).toContain("'Parent' | 'DemoUserIdParams'");
  });
});
