import { NumberInput, Switch, Textarea, TextInput } from '@mantine/core';
import React, { useRef, useState } from 'react';
import type { JsonTreeEditorInputProps } from './JsonTreeEditor';

/** Text remains a recoverable buffer; multiline strings use a textarea. */
export function JsonTreeTextInput(p: JsonTreeEditorInputProps) {
  const common = {
    value: p.draft,
    disabled: p.disabled,
    'aria-label': p.label,
    error: p.error,
    ref: p.focusRef,
    maxLength: 65536,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      p.onDraftChange(e.currentTarget.value),
  };
  return p.multiline ? <Textarea {...common} autosize minRows={3} /> : <TextInput {...common} />;
}
/** Numeric display keeps the raw input buffer, including incomplete signs and decimals. */
export function JsonTreeNumberInput(p: JsonTreeEditorInputProps) {
  const [blurVersion, setBlurVersion] = useState(0);
  const mounted = useRef(false);
  return (
    <NumberInput
      key={blurVersion}
      value={p.draft}
      valueIsNumericString
      clampBehavior="none"
      trimLeadingZeroesOnBlur={false}
      disabled={p.disabled}
      aria-label={p.label}
      error={p.error}
      ref={(node) => {
        if (node && !mounted.current) {
          mounted.current = true;
          p.focusRef(node);
        }
      }}
      onBlur={() => {
        // NumericFormat clears sign-only buffers on blur. Remount its display from
        // our authoritative raw draft without moving focus back into the input.
        if (p.draft === '-' || p.draft === '.' || p.draft === '-.') {
          setBlurVersion((value) => value + 1);
        }
      }}
      onValueChange={(value, source) => {
        if (source.source === 'event' && source.event?.type !== 'blur') {
          p.onDraftChange(value.value);
        }
      }}
    />
  );
}
/** A Boolean switch still requires the same explicit Apply as other value editors. */
export function JsonTreeBooleanInput(p: JsonTreeEditorInputProps) {
  return (
    <Switch
      checked={p.draft === 'true'}
      label={p.label}
      disabled={p.disabled}
      error={p.error}
      ref={p.focusRef}
      onChange={(e) => p.onDraftChange(String(e.currentTarget.checked))}
    />
  );
}
