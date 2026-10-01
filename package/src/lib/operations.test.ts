import { applyJsonTreeOperation as apply, rebaseJsonTreePath } from './operations';
it('applies every operation immutably with segmented addresses and native sibling identities', () => {
  const sibling = new Date();
  const root = { sibling, 'a.b': { '': 1 }, items: [{ n: 1 }, { n: 2 }, { n: 3 }] };
  const add = apply(root, {
    kind: 'property-add',
    pathSegments: ['a.b'],
    key: '__proto__',
    value: [],
  });
  expect((add.data as any).sibling).toBe(sibling);
  expect(Object.hasOwn((add.data as any)['a.b'], '__proto__')).toBe(true);
  expect(Object.getPrototypeOf((add.data as any)['a.b'])).toBe(Object.prototype);
  const rename = apply(add.data, {
    kind: 'property-rename',
    pathSegments: ['a.b'],
    key: '',
    nextKey: '0',
  });
  expect((rename.data as any)['a.b']['0']).toBe(1);
  const remove = apply(rename.data, {
    kind: 'property-remove',
    pathSegments: ['a.b'],
    key: '__proto__',
  });
  expect((remove.data as any)['a.b']).toEqual({ '0': 1 });
  expect(root['a.b']).toEqual({ '': 1 });
  const moved = apply(root, { kind: 'array-move', pathSegments: ['items'], from: 0, to: 2 });
  expect((moved.data as any).items).toEqual([{ n: 2 }, { n: 3 }, { n: 1 }]);
  expect((moved.data as any).items[2]).toBe(root.items[0]);
  const inserted = apply(moved.data, {
    kind: 'array-insert',
    pathSegments: ['items'],
    index: 1,
    value: null,
  });
  const deleted = apply(inserted.data, { kind: 'array-remove', pathSegments: ['items'], index: 1 });
  expect(deleted.data).toEqual(moved.data);
  expect(apply(null, { kind: 'replace', pathSegments: [], value: {} }).data).toEqual({});
});
it('rejects collisions, accessors, inherited paths, stale indices, unsupported containers and oversized payloads', () => {
  for (const operation of [
    { kind: 'property-add', pathSegments: [], key: 'a', value: 2 },
    { kind: 'property-rename', pathSegments: [], key: 'a', nextKey: 'b' },
    { kind: 'property-remove', pathSegments: [], key: 'missing' },
    { kind: 'replace', pathSegments: ['constructor'], value: 2 },
    { kind: 'property-add', pathSegments: [], key: 'x'.repeat(4097), value: 2 },
  ] as const) {
    expect(() => apply({ a: 1, b: 2 }, operation)).toThrow();
  }
  expect(() =>
    apply([1], { kind: 'array-insert', pathSegments: [], index: 2, value: 3 })
  ).toThrow();
  expect(() => apply([1], { kind: 'array-move', pathSegments: [], from: 0, to: 1 })).toThrow();
  expect(() =>
    apply(new Map(), { kind: 'property-add', pathSegments: [], key: 'x', value: 1 })
  ).toThrow();
  const get = jest.fn();
  const value = Object.defineProperty({}, 'x', { get, enumerable: true });
  expect(() => apply({}, { kind: 'property-add', pathSegments: [], key: 'bad', value })).toThrow();
  expect(get).not.toHaveBeenCalled();
  expect(() =>
    apply([], { kind: 'array-insert', pathSegments: [], index: 0, value: 'x'.repeat(65537) })
  ).toThrow();
});
it('rebases view identities for renames and every generated array move pair', () => {
  expect(
    rebaseJsonTreePath(['old', 'child'], {
      kind: 'property-rename',
      pathSegments: [],
      key: 'old',
      nextKey: 'new',
    })
  ).toEqual(['new', 'child']);
  for (let length = 2; length < 12; length++) {
    for (let from = 0; from < length; from++) {
      for (let to = 0; to < length; to++) {
        if (from === to) continue;
        const root = Array.from({ length }, (_, n) => ({ n }));
        const operation = { kind: 'array-move' as const, pathSegments: [], from, to };
        const next = apply(root, operation).data as { n: number }[];
        for (let n = 0; n < length; n++) {
          const path = rebaseJsonTreePath([n, 'n'], operation);
          expect(next[Number(path?.[0])]?.n).toBe(n);
        }
      }
    }
  }
  expect(
    rebaseJsonTreePath(['items', 1, 'x'], {
      kind: 'array-remove',
      pathSegments: ['items'],
      index: 1,
    })
  ).toBeUndefined();
});
