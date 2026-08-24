export type TemplateMigrationDiagnostic = {
  readonly code: 'UNSUPPORTED_ANGULAR_SYNTAX' | 'MALFORMED_TEMPLATE';
  readonly message: string;
  readonly offset?: number;
};

export type TemplateMigrationOptions = {
  readonly componentName?: string;
  readonly includeImport?: boolean;
};

export type TemplateMigrationResult = {
  readonly code: string;
  readonly imports: readonly string[];
  readonly diagnostics: readonly TemplateMigrationDiagnostic[];
};

type HtmlNode = HtmlElement | HtmlText;
type HtmlElement = {
  readonly kind: 'element';
  readonly tag: string;
  readonly attributes: readonly HtmlAttribute[];
  readonly children: readonly HtmlNode[];
};
type HtmlText = { readonly kind: 'text'; readonly value: string };
type HtmlAttribute = { readonly name: string; readonly value: string | true };

const nativeHelpers = new Set([
  'a',
  'article',
  'aside',
  'button',
  'div',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'iframe',
  'img',
  'input',
  'label',
  'legend',
  'li',
  'main',
  'nav',
  'ol',
  'option',
  'p',
  'section',
  'select',
  'small',
  'span',
  'strong',
  'svg',
  'table',
  'tbody',
  'td',
  'textarea',
  'th',
  'thead',
  'tr',
  'ul',
  'dialog',
  'fieldset',
  'figure',
  'figcaption',
  'caption',
  'area',
]);

const voidTags = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/** Converts an HTML/Web Component snippet into a Craft template expression. */
export function migrateTemplateToCraft(
  source: string,
  options: TemplateMigrationOptions = {},
): TemplateMigrationResult {
  const diagnostics: TemplateMigrationDiagnostic[] = [];
  const roots = new HtmlSnippetParser(source, diagnostics).parse();
  const imports = new Set<string>();
  const expression = renderNodes(roots, imports, diagnostics, 0);
  const componentName = options.componentName?.trim();
  const body = componentName
    ? renderComponent(componentName, expression, imports)
    : `({}) => ${expression}`;
  const importLine =
    options.includeImport !== false && imports.size > 0
      ? `import { ${[...imports].sort().join(', ')} } from '@craft-ts/component';\n\n`
      : '';
  return {
    code: `${importLine}${body}\n`,
    imports: [...imports].sort(),
    diagnostics,
  };
}

function renderComponent(
  name: string,
  expression: string,
  imports: Set<string>,
): string {
  imports.add('craftComponent');
  const identifier = safeIdentifier(name, 'PastedTemplate');
  return `export const ${identifier} = craftComponent(\n  '${escapeSingleQuoted(name)}',\n  {},\n  () => ({}),\n  () => ${expression},\n);`;
}

function renderNodes(
  nodes: readonly HtmlNode[],
  imports: Set<string>,
  diagnostics: TemplateMigrationDiagnostic[],
  level: number,
): string {
  const meaningful = nodes.filter(
    (node) => node.kind !== 'text' || node.value.trim().length > 0,
  );
  if (meaningful.length === 0) return '[]';
  if (meaningful.length === 1) {
    return renderNode(meaningful[0], imports, diagnostics, level);
  }
  const indent = '  '.repeat(level);
  const childIndent = '  '.repeat(level + 1);
  return `[\n${meaningful
    .map(
      (node) =>
        `${childIndent}${renderNode(node, imports, diagnostics, level + 1)},`,
    )
    .join('\n')}\n${indent}]`;
}

function renderNode(
  node: HtmlNode,
  imports: Set<string>,
  diagnostics: TemplateMigrationDiagnostic[],
  level: number,
): string {
  if (node.kind === 'text') return renderText(node.value);
  const tag = node.tag.toLowerCase();
  const helper = nativeHelpers.has(tag) ? tag : 'customElement';
  imports.add(helper);
  const props = renderAttributes(node.attributes, diagnostics);
  const children = renderNodes(node.children, imports, diagnostics, level + 1);
  const hasChildren = node.children.some(
    (child) => child.kind !== 'text' || child.value.trim().length > 0,
  );
  if (helper === 'customElement') {
    const tagArgument = `'${escapeSingleQuoted(tag)}'`;
    return hasChildren
      ? `customElement(${tagArgument}${props ? `, ${props}` : ', {}'}, ${children})`
      : `customElement(${tagArgument}${props ? `, ${props}` : ''})`;
  }
  return hasChildren
    ? `${helper}(${props ? `${props}, ` : ''}${children})`
    : `${helper}(${props || ''})`;
}

function renderAttributes(
  attributes: readonly HtmlAttribute[],
  diagnostics: TemplateMigrationDiagnostic[],
): string {
  if (attributes.length === 0) return '';
  const entries: string[] = [];
  for (const attribute of attributes) {
    const name = attribute.name;
    if (name.startsWith('*') || name.startsWith('@')) {
      diagnostics.push({
        code: 'UNSUPPORTED_ANGULAR_SYNTAX',
        message: `Structural Angular syntax '${name}' needs a manual ifBlock/each conversion.`,
      });
      continue;
    }
    const bracketed = /^\[([^\]]+)\]$/.exec(name);
    const event = /^\(([^)]+)\)$/.exec(name);
    const key = bracketed?.[1] ?? event?.[1] ?? name;
    const outputKey = quoteObjectKey(key);
    if (event) {
      const expression =
        attribute.value === true ? 'undefined' : String(attribute.value);
      entries.push(`${outputKey}: (event) => ${expression}`);
    } else if (bracketed) {
      const expression =
        attribute.value === true ? 'undefined' : String(attribute.value);
      entries.push(`${outputKey}: () => ${expression}`);
    } else if (attribute.value === true) {
      entries.push(`${outputKey}: true`);
    } else {
      const value = String(attribute.value);
      entries.push(
        `${outputKey}: ${interpolationExpression(value) ?? quote(value)}`,
      );
    }
  }
  return entries.length > 0 ? `{ ${entries.join(', ')} }` : '';
}

function renderText(value: string): string {
  const decoded = decodeEntities(value);
  return interpolationExpression(decoded) ?? quote(decoded);
}

function interpolationExpression(value: string): string | undefined {
  const matches = [...value.matchAll(/{{\s*([\s\S]*?)\s*}}/g)];
  if (matches.length === 0) return undefined;
  if (matches.length === 1 && matches[0][0] === value) {
    return `() => ${matches[0][1].trim()}`;
  }
  let template = value.replace(/`/g, '\\`');
  for (const match of matches) {
    template = template.replace(match[0], `\${${match[1].trim()}}`);
  }
  return `() => \`${template}\``;
}

function quote(value: string): string {
  return `'${escapeSingleQuoted(value)}'`;
}

function quoteObjectKey(value: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(value) ? value : quote(value);
}

function safeIdentifier(value: string, fallback: string): string {
  const words = value
    .replace(/[^A-Za-z0-9_$]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const result = words
    .map((word, index) =>
      index === 0 ? word : `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`,
    )
    .join('');
  return /^[A-Za-z_$]/.test(result) ? result : fallback;
}

function escapeSingleQuoted(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, '\\n');
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

class HtmlSnippetParser {
  private index = 0;

  constructor(
    private readonly source: string,
    private readonly diagnostics: TemplateMigrationDiagnostic[],
  ) {}

  parse(): HtmlNode[] {
    return this.parseNodes();
  }

  private parseNodes(stopTag?: string): HtmlNode[] {
    const nodes: HtmlNode[] = [];
    let textStart = this.index;
    while (this.index < this.source.length) {
      if (this.source.startsWith('<!--', this.index)) {
        this.flushText(nodes, textStart);
        const end = this.source.indexOf('-->', this.index + 4);
        this.index = end < 0 ? this.source.length : end + 3;
        textStart = this.index;
        continue;
      }
      if (this.source[this.index] !== '<') {
        this.index += 1;
        continue;
      }
      const closing = /^<\/\s*([\w:-]+)[^>]*>/.exec(
        this.source.slice(this.index),
      );
      if (closing) {
        this.flushText(nodes, textStart);
        this.index += closing[0].length;
        if (stopTag && closing[1].toLowerCase() !== stopTag) {
          this.diagnostics.push({
            code: 'MALFORMED_TEMPLATE',
            message: `Unexpected closing tag </${closing[1]}>.`,
            offset: this.index - closing[0].length,
          });
        }
        return nodes;
      }
      this.flushText(nodes, textStart);
      const opening = this.readOpeningTag();
      if (!opening) {
        this.index += 1;
        continue;
      }
      const children =
        opening.selfClosing || voidTags.has(opening.tag)
          ? []
          : this.parseNodes(opening.tag);
      nodes.push({
        kind: 'element',
        tag: opening.tag,
        attributes: opening.attributes,
        children,
      });
      textStart = this.index;
    }
    this.flushText(nodes, textStart);
    if (stopTag) {
      this.diagnostics.push({
        code: 'MALFORMED_TEMPLATE',
        message: `Missing closing tag </${stopTag}>.`,
      });
    }
    return nodes;
  }

  private flushText(nodes: HtmlNode[], start: number): void {
    if (this.index > start)
      nodes.push({ kind: 'text', value: this.source.slice(start, this.index) });
  }

  private readOpeningTag():
    | {
        readonly tag: string;
        readonly attributes: readonly HtmlAttribute[];
        readonly selfClosing: boolean;
      }
    | undefined {
    const start = this.index;
    if (!/^<[A-Za-z][\w:-]*/.test(this.source.slice(start))) return undefined;
    let cursor = start + 1;
    while (/[\w:-]/.test(this.source[cursor] ?? '')) cursor += 1;
    const tag = this.source.slice(start + 1, cursor).toLowerCase();
    const end = findTagEnd(this.source, cursor);
    if (end < 0) {
      this.diagnostics.push({
        code: 'MALFORMED_TEMPLATE',
        message: `Missing closing '>' for <${tag}>.`,
        offset: start,
      });
      this.index = this.source.length;
      return undefined;
    }
    const rawAttributes = this.source.slice(cursor, end);
    this.index = end + 1;
    return {
      tag,
      attributes: parseAttributes(rawAttributes),
      selfClosing: /\/\s*$/.test(rawAttributes),
    };
  }
}

function findTagEnd(source: string, start: number): number {
  let quoteCharacter = '';
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quoteCharacter) {
      if (character === quoteCharacter) quoteCharacter = '';
    } else if (character === '"' || character === "'")
      quoteCharacter = character;
    else if (character === '>') return index;
  }
  return -1;
}

function parseAttributes(source: string): HtmlAttribute[] {
  const attributes: HtmlAttribute[] = [];
  let index = 0;
  while (index < source.length) {
    while (/\s/.test(source[index] ?? '') || source[index] === '/') index += 1;
    if (index >= source.length) break;
    const nameStart = index;
    while (!/[\s=/>]/.test(source[index] ?? '')) index += 1;
    const name = source.slice(nameStart, index);
    while (/\s/.test(source[index] ?? '')) index += 1;
    if (source[index] !== '=') {
      attributes.push({ name, value: true });
      continue;
    }
    index += 1;
    while (/\s/.test(source[index] ?? '')) index += 1;
    const quoteCharacter =
      source[index] === '"' || source[index] === "'" ? source[index++] : '';
    const valueStart = index;
    if (quoteCharacter)
      while (index < source.length && source[index] !== quoteCharacter)
        index += 1;
    else while (!/[\s>]/.test(source[index] ?? '')) index += 1;
    attributes.push({ name, value: source.slice(valueStart, index) });
    if (quoteCharacter && source[index] === quoteCharacter) index += 1;
  }
  return attributes;
}
