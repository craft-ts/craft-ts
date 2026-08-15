export interface CraftDomAdapter {
  createElement(tag: string): Element;
  createText(value: string): Text;
  appendChild(parent: Node, child: Node): void;
  insertBefore(parent: Node, child: Node, before: Node | null): void;
  removeChild(parent: Node, child: Node): void;
  setAttribute(el: Element, name: string, value: string): void;
  removeAttribute(el: Element, name: string): void;
  setProperty(el: Element, name: string, value: unknown): void;
  setValue(node: Text, value: string): void;
  listen(
    target: EventTarget,
    event: string,
    handler: EventListener,
  ): () => void;
}

export function createBrowserDomAdapter(document: Document): CraftDomAdapter {
  return {
    createElement: (tag) => document.createElement(tag),
    createText: (value) => document.createTextNode(value),
    appendChild: (parent, child) => parent.appendChild(child),
    insertBefore: (parent, child, before) => parent.insertBefore(child, before),
    removeChild: (parent, child) => parent.removeChild(child),
    setAttribute: (element, name, value) =>
      element.setAttribute(name, value),
    removeAttribute: (element, name) => element.removeAttribute(name),
    setProperty: (element, name, value) => {
      (element as unknown as Record<string, unknown>)[name] = value;
    },
    setValue: (node, value) => {
      node.nodeValue = value;
    },
    listen: (target, event, handler) => {
      target.addEventListener(event, handler);
      return () => target.removeEventListener(event, handler);
    },
  };
}
