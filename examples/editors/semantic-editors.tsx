import { ColorInput, MultiSelect, Select } from '@mantine/core';
import { DateInput, DateTimePicker } from '@mantine/dates';
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
    <DateInput
      valueFormat="YYYY-MM-DD"
      defaultValue={dateStringEditor.parse(p.draft).valid ? p.draft : null}
      fixOnBlur={false}
      dateParser={(text) => (dateStringEditor.parse(text).valid ? text : null)}
      onChange={(value) => p.onDraftChange(value ?? '')}
      onInput={(event) => p.onDraftChange(event.currentTarget.value)}
      popoverProps={{ withinPortal: false }}
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
  Input: UtcDateTimeInput,
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
  if (node.metadata === 'datetime') return utcDateTimeEditor;
  if (node.metadata === 'choice') return statusEditor;
  if (node.metadata === 'choices') return tagsEditor;
  if (node.value instanceof Date) return dateAtomEditor;
  if (typeof node.value === 'bigint') return bigintEditor;
  return undefined;
}

/** Calendar values are deliberately interpreted as UTC wall time in this example. */
export const utcDateTimeEditor = defineJsonTreeValueEditor({
  key: 'utc-datetime',
  accepts: (value: unknown): value is string => typeof value === 'string',
  format: (value) => value,
  parse: (draft) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(draft) &&
    Number.isFinite(Date.parse(draft))
      ? { valid: true, value: draft }
      : { valid: false, error: 'Choose a UTC date and time' },
  Input: UtcDateTimeInput,
});

/** Mantine edits UTC wall time through seconds; retain the source's fractional seconds. */
function UtcDateTimeInput(p: JsonTreeEditorInputProps) {
  const fraction = p.draft.match(/\.\d{3}(?=Z$)/)?.[0] ?? '';
  return (
    <DateTimePicker
      label={p.label}
      description="UTC"
      valueFormat="YYYY-MM-DD HH:mm:ss"
      withSeconds
      timePickerProps={{
        hoursInputLabel: 'UTC hours',
        minutesInputLabel: 'UTC minutes',
        secondsInputLabel: 'UTC seconds',
      }}
      value={
        utcDateTimeEditor.parse(p.draft).valid
          ? p.draft.replace('T', ' ').replace(/(?:\.\d{3})?Z$/, '')
          : null
      }
      onChange={(value) => p.onDraftChange(value ? `${value.replace(' ', 'T')}${fraction}Z` : '')}
      popoverProps={{ withinPortal: false }}
      disabled={p.disabled}
      error={p.error}
      ref={p.focusRef}
    />
  );
}

const statuses = ['Draft', 'In review', 'Published'];
export const statusEditor = defineJsonTreeValueEditor({
  key: 'status',
  accepts: (value: unknown): value is string => typeof value === 'string',
  format: String,
  parse: (draft) =>
    statuses.includes(draft)
      ? { valid: true, value: draft }
      : { valid: false, error: 'Choose a status' },
  Input: (p) => (
    <Select
      data={statuses}
      value={p.draft}
      onChange={(value) => p.onDraftChange(value ?? '')}
      aria-label={p.label}
      disabled={p.disabled}
      error={p.error}
      ref={p.focusRef}
      comboboxProps={{ withinPortal: false }}
    />
  ),
});
const tags = ['Design', 'Content', 'Engineering'];
export const tagsEditor = defineJsonTreeValueEditor({
  key: 'tags',
  accepts: (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string'),
  format: JSON.stringify,
  parse: (draft) => {
    try {
      const value: unknown = JSON.parse(draft);
      return Array.isArray(value) &&
        value.every((item) => tags.includes(item)) &&
        new Set(value).size === value.length
        ? { valid: true, value: value as string[] }
        : { valid: false, error: 'Choose valid tags' };
    } catch {
      return { valid: false, error: 'Choose valid tags' };
    }
  },
  Input: (p) => (
    <MultiSelect
      searchable
      data={tags}
      value={JSON.parse(p.draft)}
      onChange={(value) => p.onDraftChange(JSON.stringify(value))}
      aria-label={p.label}
      disabled={p.disabled}
      error={p.error}
      ref={p.focusRef}
      comboboxProps={{ withinPortal: false }}
    />
  ),
  Read: ({ node }) => <span>{node.value.join(', ') || 'No tags'}</span>,
});
