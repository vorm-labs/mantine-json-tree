import { ColorInput, TextInput } from '@mantine/core';
import React from 'react';
import {
  defineJsonTreeValueEditor,
  type JsonTreeEditorInputProps,
  type JsonTreeEditorNode,
} from '../../package/src';

/** A whole custom editor in one file. UTC is explicit; no local timezone coercion. */
export const dateStringEditor = defineJsonTreeValueEditor({
  key: 'date-string',
  accepts: (value: unknown): value is string => typeof value === 'string',
  format: (value) => value,
  parse: (draft) =>
    /^\d{4}-\d{2}-\d{2}$/.test(draft) &&
    Number.isFinite(Date.parse(`${draft}T00:00:00Z`)) &&
    new Date(`${draft}T00:00:00Z`).toISOString().slice(0, 10) === draft
      ? { valid: true, value: draft }
      : { valid: false, error: 'Enter a calendar date (YYYY-MM-DD)' },
  Input: (p: JsonTreeEditorInputProps) => (
    <TextInput
      type="date"
      value={p.draft}
      onChange={(e) => p.onDraftChange(e.currentTarget.value)}
      aria-label={p.label}
      error={p.error}
      disabled={p.disabled}
      ref={p.focusRef}
    />
  ),
  Read: ({ node }) => <time dateTime={node.value}>{node.value}</time>,
});
export const decimalStringEditor = defineJsonTreeValueEditor({
  key: 'decimal-string',
  accepts: (value: unknown): value is string => typeof value === 'string',
  format: (value) => value,
  parse: (draft) =>
    /^-?\d+(?:\.\d+)?$/.test(draft)
      ? { valid: true, value: draft }
      : { valid: false, error: 'Enter an exact decimal' },
});
export const colorEditor = defineJsonTreeValueEditor({
  key: 'color',
  accepts: (value: unknown): value is string => typeof value === 'string',
  format: (value) => value,
  parse: (draft) =>
    /^#[\da-f]{6}$/i.test(draft)
      ? { valid: true, value: draft }
      : { valid: false, error: 'Enter an RGB hex color' },
  Input: (p: JsonTreeEditorInputProps) => (
    <ColorInput
      format="hex"
      value={p.draft}
      onChange={p.onDraftChange}
      aria-label={p.label}
      error={p.error}
      disabled={p.disabled}
      ref={p.focusRef}
      popoverProps={{ withinPortal: false }}
    />
  ),
  Read: ({ node }) => (
    <span>
      {/^#[\da-f]{6}$/i.test(node.value) && (
        <span
          aria-hidden
          style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: node.value }}
        />
      )}
      {node.value}
    </span>
  ),
});
export const dateAtomEditor = defineJsonTreeValueEditor({
  key: 'date-atom',
  accepts: (value: unknown): value is Date =>
    value instanceof Date && Number.isFinite(value.getTime()),
  format: (value) => value.toISOString(),
  parse: (draft) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(draft) &&
    Number.isFinite(Date.parse(draft))
      ? { valid: true, value: new Date(draft) }
      : { valid: false, error: 'Enter a UTC ISO instant' },
});
export const bigintEditor = defineJsonTreeValueEditor({
  key: 'bigint',
  accepts: (value: unknown): value is bigint => typeof value === 'bigint',
  format: String,
  parse: (draft) =>
    /^-?\d+$/.test(draft)
      ? { valid: true, value: BigInt(draft) }
      : { valid: false, error: 'Enter an integer' },
});
export function semanticEditor(node: JsonTreeEditorNode) {
  if (node.metadata === 'date') return dateStringEditor;
  if (node.metadata === 'decimal') return decimalStringEditor;
  if (node.metadata === 'color') return colorEditor;
  if (node.value instanceof Date) return dateAtomEditor;
  if (typeof node.value === 'bigint') return bigintEditor;
  return undefined;
}
