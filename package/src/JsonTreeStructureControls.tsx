import { Button, Group, NativeSelect, Stack, Text, TextInput } from '@mantine/core';
import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { checkEditableTree, editableValueAtPath, hasEditablePath } from './lib/editable-tree';
import type { JsonTreeOperation } from './lib/operations';
import { isWritableContainer, type JsonTreePathSegments } from './lib/path';
export const structureLabels = {
  target: 'Structure target',
  add: 'Add property',
  insert: 'Insert entry',
  remove: 'Remove',
  rename: 'Rename',
  up: 'Move up',
  down: 'Move down',
  replace: 'Replace value',
  apply: 'Apply structure',
  cancel: 'Cancel structure',
  name: 'Property name',
  type: 'Value type',
  text: 'Initial value',
  invalid: 'Enter a valid structural change',
  stale: 'The target changed. Cancel this prompt and select it again.',
  string: 'Text',
  number: 'Number',
  boolean: 'Boolean',
  null: 'Null',
  object: 'Object',
  array: 'Array',
};
export interface JsonTreeCreationChoice {
  key: string;
  label: string;
  create: (text: string) => unknown;
}
const defaults: readonly JsonTreeCreationChoice[] = [
  { key: 'string', label: 'Text', create: (text) => text },
  {
    key: 'number',
    label: 'Number',
    create: (text) => {
      if (!text.trim() || !Number.isFinite(Number(text))) throw Error('Invalid number');
      return Number(text);
    },
  },
  {
    key: 'boolean',
    label: 'Boolean',
    create: (text) => {
      if (!['true', 'false'].includes(text)) throw Error('Invalid boolean');
      return text === 'true';
    },
  },
  { key: 'null', label: 'Null', create: () => null },
  { key: 'object', label: 'Object', create: () => ({}) },
  { key: 'array', label: 'Array', create: () => [] },
];
export function editableTreePaths(data: unknown): JsonTreePathSegments[] {
  if (!checkEditableTree(data)) return [];
  const paths: JsonTreePathSegments[] = [];
  const stack: { value: unknown; path: JsonTreePathSegments }[] = [{ value: data, path: [] }];
  while (stack.length) {
    const current = stack.pop()!;
    paths.push(current.path);
    if (!isWritableContainer(current.value)) continue;
    const keys = Object.keys(current.value);
    for (let i = keys.length - 1; i >= 0; i--) {
      const part = Array.isArray(current.value) ? Number(keys[i]) : keys[i];
      stack.push({
        value: (current.value as Record<string, unknown>)[String(part)],
        path: [...current.path, part],
      });
    }
  }
  return paths;
}
interface Prompt {
  kind: 'add' | 'insert' | 'rename' | 'replace';
  root: unknown;
  path: JsonTreePathSegments;
  name: string;
  text: string;
  type: string;
}
export function JsonTreeStructureControls(p: {
  controllerRef?: React.Ref<{ finish: () => boolean; cancel: () => void }>;
  onStatusChange?: (
    status: { draft: string; pathSegments: JsonTreePathSegments; error?: string } | undefined
  ) => void;
  data: unknown;
  disabled: boolean;
  request: (operation: JsonTreeOperation) => string | null;
  focusPath?: JsonTreePathSegments;
  labels?: Partial<typeof structureLabels>;
  choices?: readonly JsonTreeCreationChoice[];
}) {
  const labels = { ...structureLabels, ...p.labels };
  const choices =
    p.choices ??
    defaults.map((choice) => ({ ...choice, label: labels[choice.key as keyof typeof labels] }));
  const [path, setPath] = useState<JsonTreePathSegments>([]);
  const [prompt, setPrompt] = useState<Prompt>();
  const [error, setError] = useState<string | null>(null);
  const target = useRef<HTMLSelectElement>(null);
  const focusPending = useRef(false);
  const paths = editableTreePaths(p.data);
  const valid = hasEditablePath(p.data, path);
  const value = valid ? editableValueAtPath(p.data, path) : undefined;
  const parentPath = path.slice(0, -1);
  const parent =
    path.length && hasEditablePath(p.data, parentPath)
      ? editableValueAtPath(p.data, parentPath)
      : undefined;
  const part = path[path.length - 1];
  const previousData = useRef(p.data);
  useEffect(() => {
    if (Object.is(previousData.current, p.data)) return;
    previousData.current = p.data;
    if (p.focusPath) {
      setPath(p.focusPath);
      setPrompt(undefined);
      setError(null);
      focusPending.current = true;
    } else {
      setPath([]);
      if (prompt) setError(labels.stale);
    }
  }, [p.data, p.focusPath]);
  useEffect(() => {
    if (!p.disabled && !prompt && focusPending.current) {
      focusPending.current = false;
      target.current?.focus();
    }
  }, [p.disabled, prompt, p.data, p.focusPath]);
  const request = (operation: JsonTreeOperation) => {
    if (p.disabled) return;
    const result = p.request(operation);
    setError(result);
    if (!result) setPrompt(undefined);
  };
  const open = (kind: Prompt['kind']) => {
    if (p.disabled || !valid) return;
    setError(null);
    setPrompt({
      kind,
      root: p.data,
      path: [...path],
      name: kind === 'rename' ? String(part) : '',
      text: '',
      type: choices[0]?.key ?? 'string',
    });
  };
  const submit = () => {
    if (!prompt || p.disabled) return;
    if (!Object.is(prompt.root, p.data)) {
      setError(labels.stale);
      return;
    }
    try {
      const candidate = choices.find((choice) => choice.key === prompt.type);
      if (!candidate) throw Error('Missing creation choice');
      if (prompt.kind === 'rename') {
        request({
          kind: 'property-rename',
          pathSegments: prompt.path.slice(0, -1),
          key: String(prompt.path[prompt.path.length - 1]),
          nextKey: prompt.name,
        });
      } else if (prompt.kind === 'add') {
        request({
          kind: 'property-add',
          pathSegments: prompt.path,
          key: prompt.name,
          value: candidate.create(prompt.text),
        });
      } else if (prompt.kind === 'insert') {
        request({
          kind: 'array-insert',
          pathSegments: prompt.path,
          index: (editableValueAtPath(p.data, prompt.path) as unknown[]).length,
          value: candidate.create(prompt.text),
        });
      } else {
        request({
          kind: 'replace',
          pathSegments: prompt.path,
          value: candidate.create(prompt.text),
        });
      }
    } catch {
      setError(labels.invalid);
    }
  };
  useImperativeHandle(p.controllerRef, () => ({
    finish: () => {
      if (!prompt) return true;
      submit();
      return false;
    },
    cancel: () => {
      setPrompt(undefined);
      setError(null);
      focusPending.current = true;
    },
  }));
  const statusKey = JSON.stringify(
    prompt
      ? {
          kind: prompt.kind,
          path: prompt.path,
          name: prompt.name,
          text: prompt.text,
          type: prompt.type,
          error,
        }
      : null
  );
  const onStatus = useRef(p.onStatusChange);
  onStatus.current = p.onStatusChange;
  useEffect(() => {
    onStatus.current?.(
      prompt
        ? {
            draft: JSON.stringify({
              kind: prompt.kind,
              name: prompt.name,
              text: prompt.text,
              type: prompt.type,
            }),
            pathSegments: prompt.path,
            ...(error ? { error } : {}),
          }
        : undefined
    );
  }, [statusKey]);
  return (
    <Stack gap="xs">
      <NativeSelect
        ref={target}
        label={labels.target}
        value={JSON.stringify(path)}
        disabled={p.disabled || Boolean(prompt)}
        onChange={(event) => {
          setPath(JSON.parse(event.currentTarget.value));
          setError(null);
        }}
        data={paths.map((path) => ({
          value: JSON.stringify(path),
          label: path.length ? JSON.stringify(path) : 'root',
        }))}
      />
      <Group>
        {isWritableContainer(value) && !Array.isArray(value) && (
          <Button disabled={p.disabled || Boolean(prompt)} onClick={() => open('add')}>
            {labels.add}
          </Button>
        )}
        {Array.isArray(value) && (
          <Button disabled={p.disabled || Boolean(prompt)} onClick={() => open('insert')}>
            {labels.insert}
          </Button>
        )}
        {path.length > 0 && isWritableContainer(parent) && (
          <>
            <Button
              disabled={p.disabled || Boolean(prompt)}
              onClick={() =>
                request(
                  Array.isArray(parent)
                    ? { kind: 'array-remove', pathSegments: parentPath, index: Number(part) }
                    : { kind: 'property-remove', pathSegments: parentPath, key: String(part) }
                )
              }
            >
              {labels.remove}
            </Button>
            {!Array.isArray(parent) && (
              <Button disabled={p.disabled || Boolean(prompt)} onClick={() => open('rename')}>
                {labels.rename}
              </Button>
            )}
            {Array.isArray(parent) && (
              <>
                <Button
                  disabled={p.disabled || Boolean(prompt) || Number(part) === 0}
                  onClick={() =>
                    request({
                      kind: 'array-move',
                      pathSegments: parentPath,
                      from: Number(part),
                      to: Number(part) - 1,
                    })
                  }
                >
                  {labels.up}
                </Button>
                <Button
                  disabled={p.disabled || Boolean(prompt) || Number(part) >= parent.length - 1}
                  onClick={() =>
                    request({
                      kind: 'array-move',
                      pathSegments: parentPath,
                      from: Number(part),
                      to: Number(part) + 1,
                    })
                  }
                >
                  {labels.down}
                </Button>
              </>
            )}
          </>
        )}
        <Button disabled={p.disabled || Boolean(prompt) || !valid} onClick={() => open('replace')}>
          {labels.replace}
        </Button>
      </Group>
      {prompt && (
        <fieldset
          disabled={p.disabled}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') {
              event.preventDefault();
              setPrompt(undefined);
              setError(null);
              focusPending.current = true;
            }
            if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
              event.preventDefault();
              submit();
            }
          }}
        >
          <legend>{labels.apply}</legend>
          {['add', 'rename'].includes(prompt.kind) && (
            <TextInput
              label={labels.name}
              value={prompt.name}
              maxLength={4096}
              onChange={(event) => setPrompt({ ...prompt, name: event.currentTarget.value })}
            />
          )}
          {prompt.kind !== 'rename' && (
            <>
              <NativeSelect
                label={labels.type}
                value={prompt.type}
                onChange={(event) => setPrompt({ ...prompt, type: event.currentTarget.value })}
                data={choices.map((c) => ({ value: c.key, label: c.label }))}
              />
              <TextInput
                label={labels.text}
                value={prompt.text}
                maxLength={65536}
                onChange={(event) => setPrompt({ ...prompt, text: event.currentTarget.value })}
              />
            </>
          )}
          <Group>
            <Button onClick={submit}>{labels.apply}</Button>
            <Button
              onClick={() => {
                setPrompt(undefined);
                setError(null);
                target.current?.focus();
              }}
            >
              {labels.cancel}
            </Button>
          </Group>
        </fieldset>
      )}
      {error && <Text role="alert">{error}</Text>}
    </Stack>
  );
}
