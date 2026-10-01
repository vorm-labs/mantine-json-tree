import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import React, {
  Component,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  JsonTree,
  type JsonTreeChange,
  type JsonTreeNodePayload,
  type JsonTreeProps,
} from './JsonTree';
import { checkEditableTree, editableValueAtPath, hasEditablePath } from './lib/editable-tree';
import { setValueAtPath } from './lib/path';
import { getValueType } from './lib/utils';

/** Metadata belongs to the host; strings are never classified by their spelling. */
export interface JsonTreeEditorNode extends JsonTreeNodePayload {
  metadata?: unknown;
}
export type JsonTreeParseResult<T> = { valid: true; value: T } | { valid: false; error: string };
export interface JsonTreeEditorInputProps {
  draft: string;
  onDraftChange: (draft: string) => void;
  commit: () => boolean;
  cancel: () => void;
  disabled: boolean;
  label: string;
  error: string | null;
  focusRef: React.RefCallback<HTMLElement>;
}
/** Executable application registration, never serialized user configuration. */
export interface JsonTreeValueEditorDefinition {
  key: string;
  accepts: (value: unknown) => boolean;
  format: (value: unknown) => string;
  parse: (draft: string) => JsonTreeParseResult<unknown>;
  Input?: React.ComponentType<JsonTreeEditorInputProps>;
  Read?: React.ComponentType<{ node: JsonTreeEditorNode }>;
}
/** Type-safe registration with runtime output admission; renderer and codec can share one file. */
export function defineJsonTreeValueEditor<T>(definition: {
  key: string;
  accepts: (value: unknown) => value is T;
  format: (value: T) => string;
  parse: (draft: string) => JsonTreeParseResult<T>;
  Input?: React.ComponentType<JsonTreeEditorInputProps>;
  Read?: React.ComponentType<{ node: JsonTreeEditorNode & { value: T } }>;
}): JsonTreeValueEditorDefinition {
  return {
    ...definition,
    format: (value) => {
      if (!definition.accepts(value)) throw Error('Incompatible editor');
      return definition.format(value);
    },
    Read: definition.Read as JsonTreeValueEditorDefinition['Read'],
  };
}
export interface JsonTreeEditStatus {
  state: 'idle' | 'editing' | 'invalid' | 'awaiting' | 'conflict';
  pathSegments?: readonly (string | number)[];
  draft?: string;
  error?: string;
}
export interface JsonTreeEditorHandle {
  finish: () => boolean;
  cancel: () => void;
}
export interface JsonTreeEditorProps extends Omit<
  JsonTreeProps,
  'onChange' | 'editable' | 'isEditable' | 'validate' | 'renderValue'
> {
  editable?: boolean;
  disabled?: boolean;
  resolveEditor?: (node: JsonTreeEditorNode) => JsonTreeValueEditorDefinition | undefined;
  metadata?: (node: JsonTreeNodePayload) => unknown;
  isEditable?: (node: JsonTreeEditorNode) => boolean;
  validate?: (next: unknown, change: JsonTreeChange) => string | null;
  /** False refuses immediately. Otherwise data must echo the exact next value to confirm acceptance. */
  onChange?: (next: unknown, change: JsonTreeChange) => boolean | void;
  onEditStatusChange?: (status: JsonTreeEditStatus) => void;
  /** Optional host equality for confirmed immutable copies. Defaults to identity. */
  isEqual?: (left: unknown, right: unknown) => boolean;
  labels?: Partial<typeof editorLabels>;
}
export const editorLabels = {
  edit: 'Edit',
  apply: 'Apply',
  cancel: 'Cancel',
  invalid: 'Enter a valid value',
  refused: 'The change was not accepted',
  awaiting: 'Waiting for the host to accept the change',
  conflict: 'The data or editing access changed. Cancel this draft before continuing.',
  truncated: 'The tree exceeds the display limits or contains an ambiguous graph.',
};
const textEditor = defineJsonTreeValueEditor({
  key: 'string',
  accepts: (value: unknown): value is string => typeof value === 'string',
  format: (value) => value,
  parse: (draft) => ({ valid: true, value: draft }),
});
const numberEditor = defineJsonTreeValueEditor({
  key: 'number',
  accepts: (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value),
  format: (value) => (Object.is(value, -0) ? '-0' : String(value)),
  parse: (draft) =>
    draft.trim() !== '' && Number.isFinite(Number(draft))
      ? { valid: true, value: Number(draft) }
      : { valid: false, error: editorLabels.invalid },
});
const booleanEditor = defineJsonTreeValueEditor({
  key: 'boolean',
  accepts: (value: unknown): value is boolean => typeof value === 'boolean',
  format: String,
  parse: (draft) =>
    draft === 'true' || draft === 'false'
      ? { valid: true, value: draft === 'true' }
      : { valid: false, error: editorLabels.invalid },
});
export const basicJsonTreeEditors = [textEditor, numberEditor, booleanEditor] as const;
class RendererBoundary extends Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function DefaultInput(p: JsonTreeEditorInputProps) {
  return (
    <TextInput
      value={p.draft}
      onChange={(e) => p.onDraftChange(e.currentTarget.value)}
      disabled={p.disabled}
      aria-label={p.label}
      error={p.error}
      ref={p.focusRef}
      maxLength={65536}
    />
  );
}
interface Active {
  root: unknown;
  node: JsonTreeEditorNode;
  editor: JsonTreeValueEditorDefinition;
  draft: string;
  error: string | null;
  submitted?: { next: unknown };
  origin: HTMLElement | null;
}
/** Controlled tree and one recoverable leaf draft. There is no data store or undo stack here. */
export const JsonTreeEditor = forwardRef<JsonTreeEditorHandle, JsonTreeEditorProps>(
  function JsonTreeEditor(props, ref) {
    const {
      data,
      editable = false,
      disabled = false,
      resolveEditor,
      metadata,
      isEditable,
      validate,
      onChange,
      onEditStatusChange,
      isEqual = Object.is,
      labels: labelOverrides,
      ...treeProps
    } = props;
    const labels = { ...editorLabels, ...labelOverrides };
    const [active, setActive] = useState<Active>();
    const live = useRef(true);
    const activeRef = useRef(active);
    activeRef.current = active;
    const rootRef = useRef(data);
    rootRef.current = data;
    const authority = useRef({ editable, disabled, isEditable, validate, onChange });
    authority.current = { editable, disabled, isEditable, validate, onChange };
    useEffect(() => {
      live.current = true;
      return () => {
        live.current = false;
      };
    }, []);
    const focusRef = useCallback((node: HTMLElement | null) => {
      if (node) node.focus();
    }, []);
    const safe = checkEditableTree(data);
    const permitted = (node: JsonTreeEditorNode) => {
      try {
        return (
          editable &&
          !disabled &&
          hasEditablePath(data, node.pathSegments) &&
          (isEditable?.(node) ?? true)
        );
      } catch {
        return false;
      }
    };
    const conflicted = Boolean(
      active &&
      (!Object.is(active.root, data) || !permitted(active.node)) &&
      !(active.submitted && isEqual(active.submitted.next, data))
    );
    const publish = (next: Active | undefined) => {
      activeRef.current = next;
      setActive(next);
    };
    const restore = (a: Active) =>
      queueMicrotask(() => {
        if (a.origin?.isConnected) a.origin.focus();
      });
    const cancel = () => {
      const a = activeRef.current;
      if (!live.current || !a) return;
      publish(undefined);
      restore(a);
    };
    const finish = (): boolean => {
      const a = activeRef.current;
      if (!a) return true;
      const current = authority.current;
      if (
        !live.current ||
        a.submitted ||
        !Object.is(a.root, rootRef.current) ||
        !current.editable ||
        current.disabled
      ) {
        return false;
      }
      try {
        if (
          !hasEditablePath(rootRef.current, a.node.pathSegments) ||
          !Object.is(editableValueAtPath(rootRef.current, a.node.pathSegments), a.node.value) ||
          !(current.isEditable?.(a.node) ?? true)
        ) {
          return false;
        }
        const parsed = a.editor.parse(a.draft);
        if (!parsed.valid || !a.editor.accepts(parsed.value)) {
          publish({ ...a, error: parsed.valid ? labels.invalid : parsed.error });
          return false;
        }
        if (Object.is(parsed.value, a.node.value)) {
          cancel();
          return true;
        }
        const next = setValueAtPath(rootRef.current, a.node.pathSegments, parsed.value);
        const change = { ...a.node, value: parsed.value, previousValue: a.node.value };
        const error = current.validate?.(next, change);
        if (error || !checkEditableTree(next)) {
          publish({ ...a, error: error || labels.invalid });
          return false;
        }
        if (!current.onChange) {
          publish({ ...a, error: labels.refused });
          return false;
        }
        // Mark awaiting before notifying, so synchronous host updates cannot race the draft.
        const waiting = { ...a, error: null, submitted: { next } };
        publish(waiting);
        if (current.onChange(next, change) === false) {
          publish({ ...a, error: labels.refused });
          return false;
        }
        return false; // A controlled data echo, not notification, confirms acceptance.
      } catch {
        publish({ ...a, error: labels.invalid });
        return false;
      }
    };
    useImperativeHandle(ref, () => ({ finish, cancel }));
    useEffect(() => {
      if (active?.submitted && isEqual(active.submitted.next, data)) {
        publish(undefined);
        restore(active);
      }
    }, [data, active]);
    const status: JsonTreeEditStatus = active
      ? {
          state: conflicted
            ? 'conflict'
            : active.submitted
              ? 'awaiting'
              : active.error
                ? 'invalid'
                : 'editing',
          pathSegments: active.node.pathSegments,
          draft: active.draft,
          ...(active.error ? { error: active.error } : {}),
        }
      : { state: 'idle' };
    const statusKey = JSON.stringify(status);
    useEffect(() => {
      onEditStatusChange?.(status);
    }, [statusKey, onEditStatusChange]);
    const renderValue = (payload: JsonTreeNodePayload) => {
      let node: JsonTreeEditorNode;
      let editor: JsonTreeValueEditorDefinition | undefined;
      try {
        node = { ...payload, metadata: metadata?.(payload) };
        editor = resolveEditor?.(node) ?? basicJsonTreeEditors.find((e) => e.accepts(node.value));
        if (editor && !editor.accepts(node.value)) editor = undefined;
      } catch {
        return undefined;
      }
      if (!editor) return undefined;
      const chosen = editor;
      const Read = chosen.Read;
      let display: string;
      try {
        display = chosen.format(node.value);
        if (typeof display !== 'string' || display.length > 65536) return undefined;
      } catch {
        return undefined;
      }
      const content = Read ? (
        <RendererBoundary key={chosen.key} fallback={display}>
          <Read node={node} />
        </RendererBoundary>
      ) : (
        display
      );
      if (!permitted(node)) return <span>{content}</span>;
      return (
        <button
          type="button"
          disabled={Boolean(active)}
          aria-label={`${labels.edit} ${payload.path}`}
          onClick={(event) => {
            event.stopPropagation();
            if (
              !live.current ||
              !Object.is(data, rootRef.current) ||
              activeRef.current ||
              !permitted(node) ||
              display.length > 65536
            ) {
              return;
            }
            publish({
              root: data,
              node,
              editor: Object.freeze({ ...chosen }),
              draft: display,
              error: null,
              origin: event.currentTarget,
            });
          }}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {content}
        </button>
      );
    };
    const Input = active?.editor.Input ?? DefaultInput;
    const inputProps: JsonTreeEditorInputProps | undefined = active
      ? {
          draft: active.draft,
          disabled: conflicted || Boolean(active.submitted),
          label: `${labels.edit} ${active.node.path}`,
          error: active.error,
          focusRef,
          onDraftChange: (draft) => {
            if (
              !live.current ||
              activeRef.current !== active ||
              conflicted ||
              active.submitted ||
              typeof draft !== 'string' ||
              draft.length > 65536
            ) {
              return;
            }
            publish({ ...active, draft, error: null });
          },
          commit: () => (activeRef.current === active ? finish() : false),
          cancel: () => {
            if (activeRef.current === active) cancel();
          },
        }
      : undefined;
    const rootEditor =
      safe &&
      data &&
      typeof data === 'object' &&
      Object.keys(data).length > 0 &&
      (getValueType(data) === 'object' || getValueType(data) === 'array')
        ? renderValue({ value: data, type: getValueType(data), path: 'root', pathSegments: [] })
        : undefined;
    return (
      <Stack gap="xs">
        {rootEditor}
        {safe ? (
          <JsonTree
            {...treeProps}
            data={data}
            editable={false}
            withCopyToClipboard={false}
            displayFunctions="as-string"
            renderValue={renderValue}
          />
        ) : (
          <Text role="status">{labels.truncated}</Text>
        )}
        {active && inputProps && (
          <section
            tabIndex={-1}
            aria-label={`${labels.edit} ${active.node.path}`}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Escape') {
                event.preventDefault();
                cancel();
              }
              if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
                event.preventDefault();
                finish();
              }
            }}
          >
            <RendererBoundary
              key={active.editor.key + JSON.stringify(active.node.pathSegments)}
              fallback={<DefaultInput {...inputProps} />}
            >
              <Input {...inputProps} />
            </RendererBoundary>
            {conflicted && <Text role="alert">{labels.conflict}</Text>}
            {active.submitted && <Text role="status">{labels.awaiting}</Text>}
            <Group>
              <Button disabled={inputProps.disabled} onClick={finish}>
                {labels.apply}
              </Button>
              <Button variant="default" onClick={cancel}>
                {labels.cancel}
              </Button>
            </Group>
          </section>
        )}
      </Stack>
    );
  }
);
