// @vitest-environment node
import { describe, expect, it } from 'vitest';
import en from './en/common.json';
import nl from './nl/common.json';
import es from './es/common.json';

type Tree = { [k: string]: string | Tree };
const flatten = (o: Tree, prefix = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'string' ? [prefix + k] : flatten(v, `${prefix}${k}.`),
  );

describe('translations', () => {
  const base = flatten(en as Tree).sort();
  it.each([
    ['nl', nl],
    ['es', es],
  ])('%s has exactly the same keys as en', (_, dict) => {
    expect(flatten(dict as Tree).sort()).toEqual(base);
  });

  it('has no empty strings', () => {
    for (const dict of [en, nl, es]) {
      const values = JSON.stringify(dict).match(/:""/g);
      expect(values).toBeNull();
    }
  });
});
