import { mapLens, splitLens } from './field-lens';

describe('splitLens', () => {
  it('reads the index-th half of the source', () => {
    const lens = splitLens(' ', 0);
    expect(lens.read('2026-05-10 12:00')).toBe('2026-05-10');
    expect(splitLens(' ', 1).read('2026-05-10 12:00')).toBe('12:00');
  });

  it('returns an empty string when the index half is missing', () => {
    expect(splitLens(' ', 1).read('only-one-part')).toBe('');
  });

  it('writes back the index-th half while preserving the other one', () => {
    const lens = splitLens(' ', 0);
    expect(lens.write('2026-05-10 12:00', '2026-05-11')).toBe(
      '2026-05-11 12:00',
    );
    expect(splitLens(' ', 1).write('2026-05-10 12:00', '09:30')).toBe(
      '2026-05-10 09:30',
    );
  });

  it('pads missing halves on write', () => {
    expect(splitLens(' ', 1).write('only', '12:00')).toBe('only 12:00');
  });

  it('round-trips read → write → read', () => {
    const lens = splitLens(' ', 0);
    const source = '2026-05-10 12:00';
    expect(lens.read(lens.write(source, lens.read(source)))).toBe('2026-05-10');
  });
});

describe('mapLens', () => {
  it('reads via the forward function', () => {
    const lens = mapLens<string, number>(
      (s) => Number(s),
      (n) => String(n),
    );
    expect(lens.read('42')).toBe(42);
  });

  it('writes via the backward function (ignoring the source)', () => {
    const lens = mapLens<string, number>(
      (s) => Number(s),
      (n) => String(n),
    );
    expect(lens.write('99', 7)).toBe('7');
  });
});
