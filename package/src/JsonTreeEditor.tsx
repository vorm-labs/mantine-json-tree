import { Box, Button, Group, Paper, Stack, Text, UnstyledButton } from '@mantine/core';
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
import { JsonTreeTextInput, JsonTreeNumberInput, JsonTreeBooleanInput } from './JsonTreeInputs';
import { JsonTreeRowActions } from './JsonTreeRowActions';
import {
  JsonTreeStructureControls,
  editableTreePaths,
  structureLabels,
  type JsonTreeCreationChoice,
  type JsonTreeStructureHandle,
} from './JsonTreeStructureControls';
import { checkEditableTree, editableValueAtPath, hasEditablePath } from './lib/editable-tree';
import {
  applyJsonTreeOperation,
  rebaseJsonTreePath,
  type JsonTreeOperation,
  type JsonTreeOperationResult,
} from './lib/operations';
import { setValueAtPath } from './lib/path';
import { getValueType } from './lib/utils';
import { useJsonTreeDrag } from './use-json-tree-drag';
import classes from './JsonTreeEditor.module.css';

/** Metadata belongs to the host; strings are never classified by their spelling. */
export interface JsonTreeEditorNode extends JsonTreeNodePayload {
  metadata?: unknown;
}
export type JsonTreeParseResult<T> = { valid: true; value: T } | { valid: false; error: string };
export interface JsonTreeEditorInputProps {
  draft: string;
  /** Preserve multiline editing for the lifetime of this draft. */
  multiline?: boolean;
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
  source?: 'value' | 'structure';
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
  'onChange' | 'editable' | 'isEditable' | 'validate' | 'renderValue' | 'renderNodeWrapper'
> {
  editable?: boolean;
  structure?: boolean;
  isOperationAllowed?: (operation: JsonTreeOperation, node: JsonTreeEditorNode) => boolean | string;
  creationChoices?: readonly JsonTreeCreationChoice[];
  structureLabels?: Partial<typeof structureLabels>;
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
const textEditor = /* @__PURE__ */ defineJsonTreeValueEditor({
  key: 'string',
  Input: JsonTreeTextInput,
  accepts: (value: unknown): value is string => typeof value === 'string',
  format: (value) => value,
  parse: (draft) => ({ valid: true, value: draft }),
});
const numberEditor = /* @__PURE__ */ defineJsonTreeValueEditor({
  key: 'number',
  Input: JsonTreeNumberInput,
  accepts: (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value),
  format: (value) => (Object.is(value, -0) ? '-0' : String(value)),
  parse: (draft) =>
    draft.trim() !== '' && Number.isFinite(Number(draft))
      ? { valid: true, value: Number(draft) }
      : { valid: false, error: editorLabels.invalid },
});
const booleanEditor = /* @__PURE__ */ defineJsonTreeValueEditor({
  key: 'boolean',
  Input: JsonTreeBooleanInput,
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
const DefaultInput = JsonTreeTextInput;
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
export const JsonTreeEditor = /* @__PURE__ */ forwardRef<JsonTreeEditorHandle, JsonTreeEditorProps>(
  function JsonTreeEditor(props, ref) {
    const {
      data,
      editable = false,
      structure = false,
      isOperationAllowed,
      creationChoices,
      structureLabels: structureCopy,
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
    const [rowError, setRowError] = useState<string | null>(null);
    const rowFocus = useRef(false);
    const [active, setActive] = useState<Active>();
    const structureHandle = useRef<JsonTreeStructureHandle>(null);
    const [structureDraft, setStructureDraft] = useState<{
      draft: string;
      pathSegments: readonly (string | number)[];
      error?: string;
    }>();
    const [structural, setStructural] = useState<{
      root: unknown;
      result: JsonTreeOperationResult;
    }>();
    const structuralRef = useRef(structural);
    structuralRef.current = structural;
    const [expanded, setExpanded] = useState<string[]>(() =>
      treeProps.defaultExpanded
        ? editableTreePaths(data)
            .filter((path) => path.length < (treeProps.maxDepth ?? 64))
            .map((path) => JSON.stringify(path))
        : []
    );
    const [viewChange, setViewChange] = useState<{
      data: unknown;
      path: readonly (string | number)[];
    }>();
    const rebase = (operation: JsonTreeOperation) => {
      const next = (treeProps.expanded ?? expanded).flatMap((key) => {
        try {
          const path = rebaseJsonTreePath(JSON.parse(key), operation);
          return path ? [JSON.stringify(path)] : [];
        } catch {
          return [];
        }
      });
      setExpanded(next);
      treeProps.onExpandedChange?.(next);
    };
    const live = useRef(true);
    const activeRef = useRef(active);
    activeRef.current = active;
    const rootRef = useRef(data);
    rootRef.current = data;
    const authority = useRef({
      editable,
      disabled,
      isEditable,
      validate,
      onChange,
      isOperationAllowed,
    });
    authority.current = { editable, disabled, isEditable, validate, onChange, isOperationAllowed };
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
      if (!live.current) return;
      if (!a) {
        structureHandle.current?.cancel();
        return;
      }
      publish(undefined);
      restore(a);
    };
    const finish = (): boolean => {
      const a = activeRef.current;
      if (!a) return !structuralRef.current && (structureHandle.current?.finish() ?? true);
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
        const operation: JsonTreeOperation = {
          kind: 'replace',
          pathSegments: a.node.pathSegments,
          value: parsed.value,
        };
        const allowed = current.isOperationAllowed?.(operation, a.node) ?? true;
        if (allowed !== true) {
          publish({ ...a, error: typeof allowed === 'string' ? allowed : labels.refused });
          return false;
        }
        const change = { ...a.node, value: parsed.value, previousValue: a.node.value, operation };
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
        rebase({
          kind: 'replace',
          pathSegments: active.node.pathSegments,
          value: active.submitted.next,
        });
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
          source: 'value',
          pathSegments: active.node.pathSegments,
          draft: active.draft,
          ...(active.error ? { error: active.error } : {}),
        }
      : structural
        ? {
            state: Object.is(structural.root, data) ? 'awaiting' : 'conflict',
            pathSegments: structural.result.operation.pathSegments,
          }
        : structureDraft
          ? {
              ...structureDraft,
              source: 'structure',
              state: structureDraft.error ? 'invalid' : 'editing',
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
        <UnstyledButton
          className={classes.valueButton}
          data-type={node.type}
          type="button"
          disabled={Boolean(active || structural || structureDraft)}
          aria-label={`${labels.edit} ${payload.path}`}
          onClick={(event) => {
            event.stopPropagation();
            if (
              !live.current ||
              !Object.is(data, rootRef.current) ||
              activeRef.current ||
              structuralRef.current ||
              structureDraft ||
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
        </UnstyledButton>
      );
    };
    const Input =
      active?.editor.Input ??
      (active?.node.type === 'number'
        ? JsonTreeNumberInput
        : active?.node.type === 'boolean'
          ? JsonTreeBooleanInput
          : DefaultInput);
    const inputProps: JsonTreeEditorInputProps | undefined = active
      ? {
          draft: active.draft,
          multiline: typeof active.node.value === 'string' && active.node.value.includes('\n'),
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
    useEffect(() => {
      if (structural && isEqual(structural.result.data, data)) {
        rebase(structural.result.operation);
        setViewChange({ data, path: structural.result.focusPath });
        structuralRef.current = undefined;
        setStructural(undefined);
      }
    }, [data, structural]);
    const requestOperation = (operation: JsonTreeOperation): string | null => {
      const current = authority.current;
      if (
        !live.current ||
        !Object.is(rootRef.current, data) ||
        !current.editable ||
        current.disabled ||
        activeRef.current ||
        structuralRef.current
      ) {
        return labels.refused;
      }
      try {
        const result = applyJsonTreeOperation(data, operation);
        const payload: JsonTreeEditorNode = {
          path: `root.${operation.pathSegments.join('.')}`,
          pathSegments: operation.pathSegments,
          type: getValueType(result.previousValue),
          value: result.previousValue,
        };
        payload.metadata = metadata?.(payload);
        if (!(current.isEditable?.(payload) ?? true)) return labels.refused;
        const allowed = current.isOperationAllowed?.(operation, payload) ?? true;
        if (allowed !== true) return typeof allowed === 'string' ? allowed : labels.refused;
        const change = {
          ...payload,
          value: result.value,
          previousValue: result.previousValue,
          operation,
        };
        const error = current.validate?.(result.data, change);
        if (error) return error;
        if (!current.onChange) return labels.refused;
        const next = { root: data, result };
        structuralRef.current = next;
        setStructural(next);
        if (current.onChange(result.data, change) === false) {
          structuralRef.current = undefined;
          setStructural(undefined);
          return labels.refused;
        }
        return null;
      } catch {
        structuralRef.current = undefined;
        setStructural(undefined);
        return labels.invalid;
      }
    };
    const blocked = !editable || disabled || Boolean(active || structural || structureDraft);
    const requestRow = (operation: JsonTreeOperation) => {
      if (blocked) return;
      rowFocus.current = true;
      setRowError(requestOperation(operation));
    };
    const drag = useJsonTreeDrag(data, blocked, requestRow);
    useEffect(() => {
      if (!viewChange || !rowFocus.current || blocked) return;
      rowFocus.current = false;
      const row = Array.from(
        drag.scope.current?.querySelectorAll<HTMLElement>('[data-json-row]') ?? []
      ).find((element) => element.dataset.jsonRow === JSON.stringify(viewChange.path));
      row?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    }, [viewChange, blocked]);
    const renderDraft = () =>
      active &&
      inputProps && (
        <Paper
          withBorder
          p="sm"
          radius="sm"
          className={classes.draft}
          tabIndex={-1}
          aria-label={`${labels.edit} ${active.node.path}`}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.nativeEvent.isComposing) return;
            // Comboboxes and calendars own their selection keys while open.
            const control = event.target as HTMLElement;
            if (
              control.getAttribute('aria-expanded') === 'true' ||
              control.closest('[role="dialog"], [role="listbox"]')
            ) {
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              cancel();
            }
            if (
              event.key === 'Enter' &&
              event.target instanceof HTMLInputElement &&
              !event.defaultPrevented
            ) {
              event.preventDefault();
              finish();
            }
          }}
        >
          <Stack gap="xs">
            <RendererBoundary
              key={active.editor.key + JSON.stringify(active.node.pathSegments)}
              fallback={<DefaultInput {...inputProps} />}
            >
              <Input {...inputProps} />
            </RendererBoundary>
            {conflicted && (
              <Text role="alert" c="red">
                {labels.conflict}
              </Text>
            )}
            {active.submitted && <Text role="status">{labels.awaiting}</Text>}
            <Group gap="xs">
              <Button size="xs" disabled={inputProps.disabled} onClick={finish}>
                {labels.apply}
              </Button>
              <Button size="xs" variant="default" onClick={cancel}>
                {labels.cancel}
              </Button>
            </Group>
          </Stack>
        </Paper>
      );
    // Keep a draft reachable if filtering/collapse hides its row.
    const wrapRow = (node: JsonTreeNodePayload, content: React.ReactNode) => {
      const key = JSON.stringify(node.pathSegments);
      const editing = active && key === JSON.stringify(active.node.pathSegments);
      const parentPath = node.pathSegments.slice(0, -1);
      const parent =
        node.pathSegments.length && hasEditablePath(data, parentPath)
          ? editableValueAtPath(data, parentPath)
          : undefined;
      let nodePermitted = false;
      try {
        nodePermitted = permitted({ ...node, metadata: metadata?.(node) });
      } catch {
        /* Invalid host metadata leaves the row read-only. */
      }
      const marker = drag.preview?.target;
      const isTarget = marker && key === JSON.stringify(marker.path);
      return (
        <Box
          data-json-row={key}
          className={classes.row}
          data-drop-before={(isTarget && !marker.after) || undefined}
          data-drop-after={(isTarget && marker.after) || undefined}
        >
          <Group gap="xs" wrap="nowrap" align="flex-start">
            <Box style={{ flex: 1, minWidth: 0 }}>{content}</Box>
            {structure && hasEditablePath(data, node.pathSegments) && (
              <JsonTreeRowActions
                node={node}
                parent={parent}
                disabled={blocked || !nodePermitted}
                labels={{ ...structureLabels, ...structureCopy }}
                request={requestRow}
                dragProps={drag.props(node.pathSegments)}
                open={(kind, path) => {
                  if (blocked) return;
                  rowFocus.current = true;
                  const origin = Array.from(
                    drag.scope.current?.querySelectorAll<HTMLElement>('[data-json-row]') ?? []
                  )
                    .find((element) => element.dataset.jsonRow === key)
                    ?.querySelector<HTMLButtonElement>('button');
                  structureHandle.current?.open(kind, path, origin ?? undefined);
                }}
              />
            )}
          </Group>
          {editing && renderDraft()}
        </Box>
      );
    };
    return (
      <Stack gap="xs" ref={drag.scope}>
        {rowError && (
          <Text role="alert" c="red">
            {rowError}
          </Text>
        )}
        {structure && safe && (
          <JsonTreeStructureControls
            controllerRef={structureHandle}
            onStatusChange={setStructureDraft}
            data={data}
            disabled={!editable || disabled || Boolean(active || structural)}
            request={requestOperation}
            focusPath={
              structural && isEqual(structural.result.data, data)
                ? structural.result.focusPath
                : viewChange && Object.is(viewChange.data, data)
                  ? viewChange.path
                  : undefined
            }
            labels={structureCopy}
            choices={creationChoices}
          />
        )}
        {structural && (
          <Group>
            <Text role="status">
              {Object.is(structural.root, data) ? labels.awaiting : labels.conflict}
            </Text>
            <Button
              onClick={() => {
                structuralRef.current = undefined;
                setStructural(undefined);
              }}
            >
              {labels.cancel}
            </Button>
          </Group>
        )}
        {safe ? (
          <JsonTree
            {...treeProps}
            data={data}
            segmentedKeys
            expanded={treeProps.expanded ?? expanded}
            onExpandedChange={(next) => {
              setExpanded(next);
              treeProps.onExpandedChange?.(next);
            }}
            editable={false}
            withCopyToClipboard={false}
            displayFunctions="as-string"
            renderValue={renderValue}
            renderNodeWrapper={wrapRow}
          />
        ) : (
          <Text role="status">{labels.truncated}</Text>
        )}
        {active && <DraftFallback active={active} render={renderDraft} scope={drag.scope} />}
      </Stack>
    );
  }
);

function DraftFallback({
  active,
  render,
  scope,
}: {
  active: Active;
  render: () => React.ReactNode;
  scope: React.RefObject<HTMLDivElement | null>;
}) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const check = () =>
      setHidden(
        !Array.from(scope.current?.querySelectorAll<HTMLElement>('[data-json-row]') ?? []).some(
          (row) => row.dataset.jsonRow === JSON.stringify(active.node.pathSegments)
        )
      );
    check();
    const observer = new MutationObserver(check);
    if (scope.current) observer.observe(scope.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [active, scope]);
  return hidden ? render() : null;
}
