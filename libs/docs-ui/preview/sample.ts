import type { Block, CodeLine, Inline } from '../src/index.ts';

const tok = (text: string, kind?: NonNullable<CodeLine['tokens'][number]['kind']>) =>
  kind ? { text, kind } : { text };

const counter: readonly CodeLine[] = [
  { tokens: [tok('// declare → derive → compile', 'comment')] },
  {
    tokens: [
      tok('const', 'keyword'),
      tok(' count = '),
      tok('yield*', 'keyword'),
      tok(' '),
      tok('state', 'function'),
      tok('(', 'punctuation'),
      tok('0', 'number'),
      tok(');', 'punctuation'),
    ],
    mark: 'highlight',
  },
  {
    tokens: [
      tok('const', 'keyword'),
      tok(' double = '),
      tok('yield*', 'keyword'),
      tok(' '),
      tok('craftComputed', 'function'),
      tok('(() => count() * ', 'punctuation'),
      tok('2', 'number'),
      tok(');', 'punctuation'),
    ],
    mark: 'add',
  },
  { tokens: [tok('legacySignal();')], mark: 'remove' },
  { tokens: [tok('Promise', 'type'), tok('.resolve(', 'punctuation'), tok("'ok'", 'string'), tok(');', 'punctuation')], mark: 'warning' },
];

const para = (...children: Inline[]): Block => ({ t: 'paragraph', children });

export const sampleBlocks: readonly Block[] = [
  { t: 'heading', level: 1, id: 'local-state', children: [{ t: 'text', text: 'Local state' }] },
  para(
    { t: 'text', text: 'A state is a signal whose type is the only contract. Declare it with ' },
    { t: 'code', text: 'state' },
    { t: 'text', text: ', derive the rest with ' },
    { t: 'link', href: '#derive', external: false, children: [{ t: 'text', text: 'craftComputed' }] },
    { t: 'text', text: ', and open the search with ' },
    { t: 'kbd', text: '⌘' },
    { t: 'text', text: ' ' },
    { t: 'kbd', text: 'K' },
    { t: 'text', text: '.' },
  ),
  { t: 'heading', level: 2, id: 'the-common-case', children: [{ t: 'text', text: 'The common case' }] },
  { t: 'callout', tone: 'info', caption: '', children: [para({ t: 'text', text: 'The dependency graph is visible to the compiler: nothing is resolved at run time.' })] },
  { t: 'callout', tone: 'tip', caption: '', children: [para({ t: 'text', text: 'Read a state where you use it, not where you declare it.' })] },
  { t: 'callout', tone: 'important', caption: 'BETA', children: [para({ t: 'text', text: 'Signatures may still change before the stable release.' })] },
  { t: 'callout', tone: 'warning', caption: '', children: [para({ t: 'text', text: 'Do not write to a state from inside a computed.' })] },
  { t: 'callout', tone: 'danger', caption: '', children: [para({ t: 'text', text: 'A state read outside a reactive context is never tracked.' })] },
  { t: 'code', lines: counter, filename: 'counter.ts', language: 'ts', numbered: false, firstLine: 1 },
  {
    t: 'codeGroup',
    tabs: [
      { label: 'npm', block: { t: 'code', lines: [{ tokens: [tok('npm install @craft-ts/core')] }], filename: 'npm', language: 'sh', numbered: false, firstLine: 1 } },
      { label: 'pnpm', block: { t: 'code', lines: [{ tokens: [tok('pnpm add @craft-ts/core')] }], filename: 'pnpm', language: 'sh', numbered: false, firstLine: 1 } },
    ],
  },
  { t: 'heading', level: 2, id: 'equality', children: [{ t: 'text', text: 'Equality' }] },
  {
    t: 'table',
    head: [[{ t: 'text', text: 'Param' }], [{ t: 'text', text: 'Type' }], [{ t: 'text', text: 'Default' }], [{ t: 'text', text: 'Description' }]],
    rows: [
      [[{ t: 'code', text: 'initial' }], [{ t: 'code', text: 'T' }], [{ t: 'text', text: 'required' }], [{ t: 'text', text: 'Starting value of the signal.' }]],
      [[{ t: 'code', text: 'equal' }], [{ t: 'code', text: '(a, b) => boolean' }], [{ t: 'code', text: 'Object.is' }], [{ t: 'text', text: 'Skips notifications when equal.' }]],
    ],
  },
  { t: 'quote', children: [para({ t: 'text', text: "Le compilateur voit le graphe de dépendances : rien n'est résolu à l'exécution." })] },
  {
    t: 'list',
    ordered: false,
    items: [
      [para({ t: 'text', text: 'Declare it once.' })],
      [para({ t: 'text', text: 'Derive everything else.' })],
      [para({ t: 'text', text: 'Let the compiler check the graph.' })],
    ],
  },
  { t: 'details', summary: 'Why a signal and not a store?', children: [para({ t: 'text', text: 'A signal invalidates only what read it.' })] },
];
