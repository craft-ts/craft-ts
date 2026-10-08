import { afterEach, describe, expect, it, vi } from 'vitest';
import { craftComponent } from './component';
import { dialog, p } from './hyperscript';
import { renderCraftComponent } from './testing';

const proto = HTMLDialogElement.prototype as unknown as {
  showModal?: () => void;
  close?: () => void;
};
const original = { showModal: proto.showModal, close: proto.close };

afterEach(() => {
  proto.showModal = original.showModal;
  proto.close = original.close;
});

describe('a dialog node given `open: true`', () => {
  const Modal = craftComponent('Modal', {}, () =>
    dialog({ open: true, label: 'Search' }, [p('Inside')]),
  );

  it('is opened with showModal() once its content is mounted, not left open as a plain attribute', async () => {
    // What a browser does: showModal() throws on a dialog that is already open,
    // and only a modal dialog lands in the top layer.
    let contentWhenOpened = false;
    const showModal = vi.fn(function (this: HTMLDialogElement) {
      // `showModal()` moves focus into the dialog: it needs something to move it to.
      contentWhenOpened = this.querySelector('p') !== null;
      if (this.hasAttribute('open')) {
        throw new Error('InvalidStateError: the dialog is already open');
      }
      this.setAttribute('open', '');
      (this as unknown as { modal: boolean }).modal = true;
    });
    proto.showModal = showModal;
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };

    const rendered = await renderCraftComponent(Modal as never);
    const node = rendered.element.querySelector('dialog') as HTMLDialogElement;

    expect(showModal).toHaveBeenCalledTimes(1);
    expect(contentWhenOpened).toBe(true);
    expect((node as unknown as { modal?: boolean }).modal).toBe(true);
    expect(node.hasAttribute('open')).toBe(true);
    expect(node.getAttribute('role')).toBe('dialog');
    expect(node.getAttribute('aria-modal')).toBe('true');
    rendered.destroy();
  });
});
