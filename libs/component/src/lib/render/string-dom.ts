import type { CraftDomAdapter } from '@craft-ts/core';
import { hydrationKeyOf } from './hydration-metadata';
import {
  assertCraftAttributeName as assertAttributeName,
  assertCraftTagName as assertTagName,
  CraftDomSecurityError,
} from '../security';

abstract class StringNode {
  abstract readonly nodeType: number;
  parentNode: StringParentNode | null = null;
  readonly ownerDocument: StringDocument;

  protected constructor(ownerDocument: StringDocument) {
    this.ownerDocument = ownerDocument;
  }

  get parentElement(): StringElement | null {
    return this.parentNode?.nodeType === 1
      ? (this.parentNode as unknown as StringElement)
      : null;
  }

  get nextSibling(): StringNode | null {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index + 1] ?? null;
  }

  get previousSibling(): StringNode | null {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return index > 0 ? this.parentNode.childNodes[index - 1] : null;
  }

  getRootNode(): StringNode {
    return this.parentNode?.getRootNode() ?? this;
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  abstract get textContent(): string;
  abstract set textContent(value: string | null);
}

class StringParentNode extends StringNode {
  readonly childNodes: StringNode[] = [];
  readonly nodeType: number = 11;

  get firstChild(): StringNode | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): StringNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  appendChild<T extends StringNode>(child: T): T {
    return this.insertBefore(child, null);
  }

  insertBefore<T extends StringNode>(child: T, before: StringNode | null): T {
    if (child === before) return child;
    child.parentNode?.removeChild(child);
    if (child.nodeType === 11) {
      for (const nested of [
        ...(child as unknown as StringParentNode).childNodes,
      ]) {
        this.insertBefore(nested, before);
      }
      return child;
    }
    const index =
      before === null
        ? this.childNodes.length
        : this.childNodes.indexOf(before);
    if (index < 0)
      throw new Error('String DOM insertBefore anchor is not a child.');
    this.childNodes.splice(index, 0, child);
    child.parentNode = this;
    return child;
  }

  removeChild<T extends StringNode>(child: T): T {
    const index = this.childNodes.indexOf(child);
    if (index < 0)
      throw new Error('String DOM removeChild target is not a child.');
    this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  contains(node: StringNode): boolean {
    if (node === this) return true;
    return this.childNodes.some(
      (child) =>
        child === node ||
        (child instanceof StringParentNode && child.contains(node)),
    );
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join('');
  }

  set textContent(value: string | null) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes.length = 0;
    if (value) this.appendChild(this.ownerDocument.createTextNode(value));
  }
}

class StringText extends StringNode {
  readonly nodeType = 3;
  nodeValue: string;

  constructor(ownerDocument: StringDocument, value: string) {
    super(ownerDocument);
    this.nodeValue = value;
  }

  get textContent(): string {
    return this.nodeValue;
  }

  set textContent(value: string | null) {
    this.nodeValue = value ?? '';
  }
}

class StringComment extends StringNode {
  readonly nodeType = 8;
  data: string;

  constructor(ownerDocument: StringDocument, value: string) {
    super(ownerDocument);
    this.data = value;
  }

  get textContent(): string {
    return this.data;
  }

  set textContent(value: string | null) {
    this.data = value ?? '';
  }
}

/** Markup already approved by the security layer, emitted as-is. */
class StringRawHtml extends StringNode {
  readonly nodeType = 3;
  html: string;

  constructor(ownerDocument: StringDocument, html: string) {
    super(ownerDocument);
    this.html = html;
  }

  get textContent(): string {
    return this.html;
  }

  set textContent(value: string | null) {
    this.html = value ?? '';
  }
}

class StringDocumentFragment extends StringParentNode {
  override readonly nodeType: number = 11;
}

class StringElement extends StringParentNode {
  override readonly nodeType: number = 1;
  readonly attributes = new Map<string, string>();
  readonly tagName: string;
  readonly localName: string;
  readonly style: CSSStyleDeclaration;
  value: unknown = '';
  checked = false;
  disabled = false;
  multiple = false;
  selected = false;
  open = false;

  constructor(ownerDocument: StringDocument, tag: string) {
    super(ownerDocument);
    this.localName = assertTagName(tag).toLowerCase();
    this.tagName = this.localName.toUpperCase();
    this.style = createStyleDeclaration((css) => {
      if (css) this.attributes.set('style', css);
      else this.attributes.delete('style');
    });
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(assertAttributeName(name), String(value));
  }

  /**
   * Replaces the children with pre-approved markup. Only the interpreter's
   * audited HTML path reaches this, and the value is emitted verbatim, so it
   * must already have gone through sanitizedHtml or an explicit exception.
   */
  ɵsetTrustedHtml(html: string): void {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes.length = 0;
    this.appendChild(new StringRawHtml(this.ownerDocument, html));
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(): void {
    return undefined;
  }
  removeEventListener(): void {
    return undefined;
  }
  focus(): void {
    return undefined;
  }
  showModal(): void {
    this.open = true;
    this.setAttribute('open', '');
  }
  close(): void {
    this.open = false;
    this.removeAttribute('open');
  }

  querySelector(selector: string): StringElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): StringElement[] {
    const result: StringElement[] = [];
    const visit = (parent: StringParentNode) => {
      for (const child of parent.childNodes) {
        if (child instanceof StringElement) {
          if (matchesSelector(child, selector)) result.push(child);
          visit(child);
        }
      }
    };
    visit(this);
    return result;
  }
}

class StringDocument extends StringParentNode {
  override readonly nodeType: number = 9;
  override readonly ownerDocument: StringDocument;
  readonly defaultView = undefined;
  activeElement: StringElement | null = null;
  title = '';
  cookie = '';
  readonly visibilityState = 'visible';
  readonly documentElement: StringElement;
  readonly head: StringElement;
  readonly body: StringElement;

  constructor() {
    // The document is its own creation context in this deliberately small DOM.
    super(undefined as unknown as StringDocument);
    this.ownerDocument = this;
    this.documentElement = new StringElement(this, 'html');
    this.head = new StringElement(this, 'head');
    this.body = new StringElement(this, 'body');
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
  }

  hasFocus(): boolean {
    return false;
  }

  createElement(tag: string): StringElement {
    return new StringElement(this, tag);
  }

  createTextNode(value: string): StringText {
    return new StringText(this, value);
  }

  createComment(value: string): StringComment {
    return new StringComment(this, value);
  }

  createDocumentFragment(): StringDocumentFragment {
    return new StringDocumentFragment(this);
  }
}

export type StringDom = Readonly<{
  document: Document;
  adapter: CraftDomAdapter;
  createHost(tag?: string): Element;
  serialize(node: Node): string;
}>;

export function createStringDomAdapter(): StringDom {
  const document = new StringDocument();
  const adapter: CraftDomAdapter = {
    createElement: (tag) => document.createElement(tag) as unknown as Element,
    createText: (value) => document.createTextNode(value) as unknown as Text,
    createComment: (value) =>
      document.createComment(value) as unknown as Comment,
    createFragment: () =>
      document.createDocumentFragment() as unknown as DocumentFragment,
    appendChild: (parent, child) =>
      asParent(parent).appendChild(child as unknown as StringNode),
    insertBefore: (parent, child, before) =>
      asParent(parent).insertBefore(
        child as unknown as StringNode,
        before as unknown as StringNode | null,
      ),
    removeChild: (parent, child) =>
      asParent(parent).removeChild(child as unknown as StringNode),
    setAttribute: (element, name, value) =>
      (element as unknown as StringElement).setAttribute(name, value),
    removeAttribute: (element, name) =>
      (element as unknown as StringElement).removeAttribute(name),
    setProperty: (element, name, value) =>
      setStringProperty(element as unknown as StringElement, name, value),
    setValue: (node, value) => {
      (node as unknown as StringText).nodeValue = value;
    },
    listen: () => () => undefined,
  };
  return {
    document: document as unknown as Document,
    adapter,
    createHost: (tag = 'craft-root') =>
      document.createElement(tag) as unknown as Element,
    serialize: (node) => serializeNode(node as unknown as StringNode),
  };
}

function asParent(node: Node): StringParentNode {
  return node as unknown as StringParentNode;
}

function setStringProperty(
  element: StringElement,
  name: string,
  value: unknown,
): void {
  if (name === '__proto__' || name === 'constructor') {
    throw new CraftDomSecurityError(
      'CRAFT_DOM_PROPERTY_BLOCKED',
      `"${name}" cannot be set as a DOM property.`,
    );
  }
  // Raw markup has no attribute equivalent: without this branch the server
  // would emit an escaped `innerHTML="…"` attribute and the content would only
  // appear once the browser hydrated, diverging from the server output.
  if (name === 'innerHTML') {
    element.ɵsetTrustedHtml(value === null || value === undefined ? '' : String(value));
    return;
  }
  Reflect.set(element, name, value);
  const attribute = name === 'htmlFor' ? 'for' : name;
  if (typeof value === 'boolean') {
    if (value) element.setAttribute(attribute, '');
    else element.removeAttribute(attribute);
  } else if (value === null || value === undefined || value === false) {
    element.removeAttribute(attribute);
  } else {
    element.setAttribute(attribute, String(value));
  }
}

function createStyleDeclaration(
  update: (css: string) => void,
): CSSStyleDeclaration {
  const values = new Map<string, string>();
  const sync = () =>
    update([...values].map(([key, value]) => `${key}: ${value}`).join('; '));
  const target = {
    setProperty(name: string, value: string | null): void {
      if (value === null || value === '') values.delete(name);
      else values.set(name, String(value));
      sync();
    },
    removeProperty(name: string): string {
      const previous = values.get(name) ?? '';
      values.delete(name);
      sync();
      return previous;
    },
    getPropertyValue(name: string): string {
      return values.get(name) ?? '';
    },
  };
  return new Proxy(target, {
    get(current, property, receiver) {
      if (typeof property === 'string' && values.has(property)) {
        return values.get(property);
      }
      return Reflect.get(current, property, receiver);
    },
    set(current, property, value, receiver) {
      if (typeof property === 'string' && !(property in current)) {
        if (value === null || value === undefined || value === '') {
          values.delete(property);
        } else {
          values.set(property, String(value));
        }
        sync();
        return true;
      }
      return Reflect.set(current, property, value, receiver);
    },
  }) as unknown as CSSStyleDeclaration;
}

function matchesSelector(element: StringElement, selector: string): boolean {
  const [tag, className] = selector.split('.', 2);
  if (tag && tag !== '*' && element.localName !== tag.toLowerCase())
    return false;
  if (!className) return true;
  return (element.getAttribute('class') ?? '').split(/\s+/).includes(className);
}

const VOID_ELEMENTS = new Set([
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

function serializeNode(node: StringNode): string {
  if (node instanceof StringRawHtml) {
    return node.html;
  }
  if (node instanceof StringText) {
    const text = escapeText(node.nodeValue);
    const key = hydrationKeyOf(node);
    return key
      ? `<!--craft-text:start|hk:${escapeComment(key)}-->${text}<!--craft-text:end|hk:${escapeComment(key)}-->`
      : text;
  }
  if (node instanceof StringComment) {
    return `<!--${escapeComment(node.data)}-->`;
  }
  if (node instanceof StringElement) {
    const attributes = [...node.attributes]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) =>
        value === ''
          ? ` ${assertAttributeName(name)}`
          : ` ${assertAttributeName(name)}="${escapeAttribute(value)}"`,
      )
      .join('');
    const open = `<${assertTagName(node.localName)}${attributes}>`;
    if (VOID_ELEMENTS.has(node.localName)) return open;
    return `${open}${node.childNodes.map(serializeNode).join('')}</${node.localName}>`;
  }
  if (node instanceof StringParentNode) {
    return node.childNodes.map(serializeNode).join('');
  }
  return '';
}

function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function escapeComment(value: string): string {
  return value.replaceAll('--', '- -');
}
