# Custom editor extension

Based on gfazioli/mantine-json-tree commit
`7dc82848c1d031abffc1b4cac2ecc16c364aba90` (package 3.4.3), MIT licensed.
No upstream issue or pull request has been submitted.

`JsonTree` retains its existing API and behavior, adding only an optional
`renderValue(node)` leaf slot. `JsonTreeEditor` composes that display with a
refusal-aware controlled editing session. `defineJsonTreeValueEditor` binds an
explicit runtime type guard, text formatter/parser and optional Input/Read
components. The complete date string example is in one source file at
`examples/editors/semantic-editors.tsx` beside decimal, color, Date and BigInt
registrations. Metadata selects semantic strings; there is no spelling inference.

```tsx
const integer = defineJsonTreeValueEditor({
  key: 'integer',
  accepts: (v: unknown): v is bigint => typeof v === 'bigint',
  format: String,
  parse: text => /^-?\d+$/.test(text)
    ? { valid: true, value: BigInt(text) }
    : { valid: false, error: 'Enter an integer' },
});
```

Only `data` represents accepted state. `onChange(next, change)` can refuse with
false; otherwise the host must feed `next` back to confirm. `isEqual` optionally
recognizes immutable host copies. Paths are typed segments, never dot-joined
labels. Replacements clone only the addressed spine and retain sibling atoms.
There is no JSON serialization, persistence authority or undo manager.

A single draft stays visible through blur, parse/host rejection and external
replacement. `onEditStatusChange` reports bounded draft/status for host guards.
The ref's `finish()` returns false while invalid, stale or waiting for a data
echo; hosts must wait for idle before saving or switching presentation. Cancel
explicitly discards the draft. Enter applies text inputs unless composing;
Escape cancels. Custom popovers can remain inside the editor. Controls receive
restricted commands and focus handoff. Registrations are trusted application
code; thrown rendering falls back to plain output/input, and conversion errors
retain the draft. Labels are host-translatable; custom editor errors belong to
the registration.

The wrapper preflights at most 10,000 nodes, 64 levels and 65,536 aggregate key/text characters plus a bounded
draft. Accessors, cycles and shared object aliases show an explicit
bounded-display notice. Map/Set internals, functions and unknown atoms are
read-only. Copy is disabled in the editor wrapper because native atoms cannot
be copied as lossless JSON. The original JsonTree viewer is unchanged.

Verification (Node 24, checked-in Yarn 4.18.1):

```
node .yarn/releases/yarn-4.18.1.cjs install --immutable
node .yarn/releases/yarn-4.18.1.cjs build
node .yarn/releases/yarn-4.18.1.cjs docgen
node .yarn/releases/yarn-4.18.1.cjs test
cd examples/editors
node ../../node_modules/@playwright/test/cli.js test -c playwright.config.ts
```

Browser engines must be installed with Playwright. A system WebKit executable
can be selected with `JSON_TREE_WEBKIT_EXECUTABLE`. The example Vite server is
loopback-only. The example configuration targets current browsers consistently
with Mantine 9. `scripts/pack-fork.mjs` stages a separately scoped distribution
without renaming upstream source imports or modifying the upstream manifest.
Npm publication and upstream acceptance are separate activities.

Source/API changes, regression fixtures and standalone examples are intended to
be reviewable independently of the packaging-only script and scoped manifest.
