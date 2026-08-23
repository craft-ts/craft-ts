import { describe, expect, it } from 'vitest';
import {
  safeResourceUrl,
  safeUrl,
  safeUrlList,
  sanitizedHtml,
  CraftDomSecurityError,
} from '../src/lib/security';
import { createStringDomAdapter } from '../src/lib/render/string-dom';
import { ɵassertSafeStyleValue as assertSafeStyleValue } from '../src/lib/render/interpreter';

describe('component security runtime', () => {
  it('rejects executable and off-origin URL schemes', () => {
    expect(() => safeUrl('javascript:alert(1)')).toThrow(CraftDomSecurityError);
    expect(() => safeUrl('jav\tascript:alert(1)')).toThrow(CraftDomSecurityError);
    expect(() => safeUrl('vbscript:msgbox(1)')).toThrow(CraftDomSecurityError);
    expect(() => safeResourceUrl('data:text/html,x')).toThrow(CraftDomSecurityError);
    // Une URL protocol-relative sort de l'origine en héritant du schéma.
    expect(() => safeUrl('//evil.test/steal')).toThrow(CraftDomSecurityError);
    expect(safeUrl('/users/42')).toBe('/users/42');
    expect(safeUrl('mailto:hello@example.test')).toBe('mailto:hello@example.test');
  });

  it('holds resource URLs to an explicit origin allowlist', () => {
    expect(() => safeResourceUrl('https://cdn.evil.test/x.js')).toThrow(
      CraftDomSecurityError,
    );
    expect(
      safeResourceUrl('https://cdn.example.test/x.js', {
        allowedOrigins: ['https://cdn.example.test'],
      }),
    ).toBe('https://cdn.example.test/x.js');
    expect(safeResourceUrl('/local/x.png')).toBe('/local/x.png');
  });

  it('validates every URL of a srcset', () => {
    expect(safeUrlList('/a.png 1x, /b.png 2x', true)).toBe('/a.png 1x, /b.png 2x');
    expect(() => safeUrlList('/a.png 1x, javascript:alert(1) 2x', true)).toThrow(
      CraftDomSecurityError,
    );
  });

  describe('sanitizedHtml', () => {
    const attacks = [
      '<script>alert(1)</script>',
      '<svg/onload=alert(1)></svg>',
      '<svg><script>alert(1)</script></svg>',
      // Retirer un motif peut assembler une balise à partir de ses voisins.
      '<scr<script>ipt>alert(1)</scr</script>ipt>',
      '<img src=x onerror=alert(1)>',
      '<img src="x" ONERROR="alert(1)">',
      '<a href="jav&#x09;ascript:alert(1)">x</a>',
      '<a href="&#106;avascript:alert(1)">x</a>',
      '<a href="java\nscript:alert(1)">x</a>',
      '<iframe src="https://evil.test"></iframe>',
      '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>',
      '<base href="https://evil.test/">',
      '<meta http-equiv="refresh" content="0;url=https://evil.test">',
      '<form action="https://evil.test"><input name="a"></form>',
      '<object data="https://evil.test/x.swf"></object>',
      '<embed src="https://evil.test/x">',
      '<style>@import url(https://evil.test/x.css)</style>',
      '<div style="background:url(javascript:alert(1))">x</div>',
      '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
      '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
      '<template><img src=x onerror=alert(1)></template>',
      '<body onload=alert(1)>',
      '<a href="/x" onclick="alert(1)">x</a>',
      '<p id="attributes" name="clobber">x</p>',
    ];

    for (const attack of attacks) {
      it(`neutralises ${attack.slice(0, 46)}`, () => {
        const html = sanitizedHtml(attack).value;
        expect(html).not.toMatch(
          /<script|<iframe|<style|<base|<meta|<object|<embed|<form|<template|srcdoc|javascript:|\son[a-z]+\s*=/i,
        );
        expect(html).not.toMatch(/\sid=|\sname=/i);
      });
    }

    it('keeps the presentation markup it is meant to allow', () => {
      expect(sanitizedHtml('<p>bon <strong>&amp;</strong> utile</p>').value).toBe(
        '<p>bon <strong>&amp;</strong> utile</p>',
      );
      expect(sanitizedHtml('<img src="/logo.png" alt="logo">').value).toBe(
        '<img src="/logo.png" alt="logo">',
      );
      expect(
        sanitizedHtml('<table><tr><td colspan="2">x</td></tr></table>').value,
      ).toBe('<table><tr><td colspan="2">x</td></tr></table>');
      // Une cible externe reçoit toujours son garde-fou d'ouverture.
      expect(sanitizedHtml('<a href="/x" target="_blank">x</a>').value).toBe(
        '<a href="/x" target="_blank" rel="noopener noreferrer">x</a>',
      );
    });

    it('closes the tags it opens and drops orphan closings', () => {
      expect(sanitizedHtml('<p><strong>x').value).toBe('<p><strong>x</strong></p>');
      expect(sanitizedHtml('x</p></div>').value).toBe('x');
    });

    it('refuses a non-string input rather than coercing it', () => {
      expect(() => sanitizedHtml({ toString: () => '<p>x</p>' })).toThrow(
        CraftDomSecurityError,
      );
    });
  });

  describe('style values', () => {
    it('rejects executable CSS and unapproved url() sources', () => {
      expect(() => assertSafeStyleValue('width: expression(alert(1))')).toThrow(
        CraftDomSecurityError,
      );
      expect(() => assertSafeStyleValue('behavior: url(#default#time2)')).toThrow(
        CraftDomSecurityError,
      );
      expect(() => assertSafeStyleValue('background: url(//evil.test/x.png)')).toThrow(
        CraftDomSecurityError,
      );
      expect(() =>
        assertSafeStyleValue('background: url(https://cdn.evil.test/x.png)'),
      ).toThrow(CraftDomSecurityError);
      expect(() => assertSafeStyleValue('color: red')).not.toThrow();
      expect(() => assertSafeStyleValue('background: url("/local.png")')).not.toThrow();
      expect(() =>
        assertSafeStyleValue('background: url(https://cdn.ok.test/x.png)', [
          'https://cdn.ok.test',
        ]),
      ).not.toThrow();
    });
  });

  describe('server serialization', () => {
    it('refuses attribute and tag names that could break out of their markup', () => {
      const dom = createStringDomAdapter();
      const element = dom.document.createElement('span') as unknown as Element;
      expect(() =>
        dom.adapter.setAttribute(element, 'x onload=alert(1) y', '1'),
      ).toThrow(CraftDomSecurityError);
      expect(() =>
        dom.document.createElement('img src=x onerror=alert(1)'),
      ).toThrow(CraftDomSecurityError);
    });

    it('escapes quotes on both sides of an attribute value', () => {
      const dom = createStringDomAdapter();
      const host = dom.createHost('div');
      const element = dom.document.createElement('span') as unknown as Element;
      dom.adapter.setAttribute(element, 'title', `a" onload='x`);
      dom.adapter.appendChild(host as unknown as Node, element as unknown as Node);
      const html = dom.serialize(host as unknown as Node);
      expect(html).toContain('title="a&quot; onload=&#39;x"');
      expect(html).not.toMatch(/onload='/);
    });

    it('renders approved HTML as markup instead of an escaped attribute', () => {
      const dom = createStringDomAdapter();
      const host = dom.createHost('div');
      dom.adapter.setProperty(
        host as unknown as Element,
        'innerHTML',
        sanitizedHtml('<b>hello</b>').value,
      );
      expect(dom.serialize(host as unknown as Node)).toBe(
        '<div><b>hello</b></div>',
      );
    });

    it('refuses prototype-mutating property names', () => {
      const dom = createStringDomAdapter();
      const host = dom.createHost('div');
      expect(() =>
        dom.adapter.setProperty(host as unknown as Element, '__proto__', {}),
      ).toThrow(CraftDomSecurityError);
    });
  });
});
