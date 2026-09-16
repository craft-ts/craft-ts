import { readFileSync } from 'node:fs';
import {
  defineVisualHttpMocks,
  type VisualAppScenario,
} from '@craft-ts/style-testing';
const localFonts = [
  { file: 'Chivo.ttf', style: 'normal' },
  { file: 'Chivo-Italic.ttf', style: 'italic' },
]
  .map(
    ({ file, style }) =>
      `@font-face { font-family: Chivo; font-style: ${style}; font-weight: 100 900; src: url(data:font/ttf;base64,${readFileSync(new URL(`./fixtures/${file}`, import.meta.url)).toString('base64')}) format('truetype'); }`,
  )
  .join('\n');
const viteClient = `
export function createHotContext() { return { data: {}, accept(){}, acceptExports(){}, dispose(){}, prune(){}, decline(){}, invalidate(){}, on(){}, off(){}, send(){} }; }
const sheets = new Map();
export function updateStyle(id, content) { let style = sheets.get(id); if (!style) { style = document.createElement('style'); document.head.append(style); sheets.set(id, style); } style.textContent = content; }
export function removeStyle(id) { sheets.get(id)?.remove(); sheets.delete(id); }
export function injectQuery(url, query) { return url + (url.includes('?') ? '&' : '?') + query; }
`;

export const designSystemMocks = defineVisualHttpMocks(
  'apps/demo/e2e/design-system.mocks.ts',
  [
    {
      method: 'GET',
      url: 'https://fonts.googleapis.com/css2',
      mode: 'mock',
      response: { kind: 'success', body: localFonts, contentType: 'text/css' },
    },
    {
      method: 'GET',
      url: '/__demo/typecheck',
      mode: 'mock',
      response: { kind: 'success', body: { status: 'passed' } },
    },
    // Development-only MCP instrumentation is outside the captured application.
    {
      method: 'GET',
      url: '/src/app/function-registry-entry.ts',
      mode: 'mock',
      response: {
        kind: 'success',
        body: 'export const provideMcpExperimentation = () => [];',
        contentType: 'text/javascript',
      },
    },
    {
      method: 'GET',
      url: '/@vite/client',
      mode: 'mock',
      response: {
        kind: 'success',
        body: viteClient,
        contentType: 'text/javascript',
      },
    },
  ],
);
export const designSystemScenarios: readonly VisualAppScenario[] = [
  {
    id: 'showcase',
    label: 'Design system showcase',
    category: 'happy-path',
    mocks: designSystemMocks,
    steps: [
      {
        action: 'capture',
        id: 'page',
        expect: [{ kind: 'visible', target: { name: 'DesignSystemOverview' } }],
      },
    ],
  },
];
