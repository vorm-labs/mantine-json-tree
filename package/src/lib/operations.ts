import { checkEditableTree, editableValueAtPath, hasEditablePath } from './editable-tree';
import { isWritableContainer, setValueAtPath, type JsonTreePathSegments } from './path';
export type JsonTreeOperation =
  | { kind: 'replace'; pathSegments: JsonTreePathSegments; value: unknown }
  | { kind: 'property-add'; pathSegments: JsonTreePathSegments; key: string; value: unknown }
  | { kind: 'property-remove'; pathSegments: JsonTreePathSegments; key: string }
  | { kind: 'property-rename'; pathSegments: JsonTreePathSegments; key: string; nextKey: string }
  | { kind: 'array-insert'; pathSegments: JsonTreePathSegments; index: number; value: unknown }
  | { kind: 'array-remove'; pathSegments: JsonTreePathSegments; index: number }
  /** `to` is the final index in the resulting array, after removing `from`. */
  | { kind: 'array-move'; pathSegments: JsonTreePathSegments; from: number; to: number };
export interface JsonTreeOperationResult {
  data: unknown;
  operation: JsonTreeOperation;
  previousValue: unknown;
  value: unknown;
  focusPath: JsonTreePathSegments;
}
const index = (n: number, length: number, insert = false) =>
  Number.isInteger(n) && n >= 0 && n < length + (insert ? 1 : 0);
const key = (value: string) => typeof value === 'string' && value.length <= 4096;
/** One checked immutable operation. Caller owns current-state checks, validation and acceptance. */
export function applyJsonTreeOperation(
  root: unknown,
  operation: JsonTreeOperation
): JsonTreeOperationResult {
  if (
    !checkEditableTree(root) ||
    !Array.isArray(operation.pathSegments) ||
    operation.pathSegments.length > 64 ||
    !hasEditablePath(root, operation.pathSegments)
  ) {
    throw Error('Invalid operation target');
  }
  const previousValue = editableValueAtPath(root, operation.pathSegments);
  let value: unknown;
  let focusPath = operation.pathSegments;
  if (operation.kind === 'replace') {
    value = operation.value;
  } else if (operation.kind.startsWith('property-')) {
    if (
      !isWritableContainer(previousValue) ||
      Array.isArray(previousValue) ||
      !('key' in operation) ||
      !key(operation.key)
    ) {
      throw Error('Invalid object operation');
    }
    const owns = Object.hasOwn(previousValue, operation.key);
    const next = { ...previousValue };
    if (operation.kind === 'property-add') {
      if (owns) throw Error('Property already exists');
      Object.defineProperty(next, operation.key, {
        value: operation.value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      focusPath = [...focusPath, operation.key];
    } else if (operation.kind === 'property-remove') {
      if (!owns) throw Error('Property is missing');
      delete next[operation.key];
    } else if (operation.kind === 'property-rename') {
      if (!owns || !key(operation.nextKey) || Object.hasOwn(previousValue, operation.nextKey)) {
        throw Error('Invalid or duplicate property name');
      }
      const entry = Object.getOwnPropertyDescriptor(previousValue, operation.key)!;
      delete next[operation.key];
      Object.defineProperty(next, operation.nextKey, entry);
      focusPath = [...focusPath, operation.nextKey];
    } else throw Error('Unknown operation');
    value = next;
  } else {
    if (!Array.isArray(previousValue)) throw Error('Invalid array operation');
    const next = [...previousValue];
    if (operation.kind === 'array-insert') {
      if (!index(operation.index, next.length, true)) throw Error('Invalid array index');
      next.splice(operation.index, 0, operation.value);
      focusPath = [...focusPath, operation.index];
    } else if (operation.kind === 'array-remove') {
      if (!index(operation.index, next.length)) throw Error('Invalid array index');
      next.splice(operation.index, 1);
      focusPath = next.length
        ? [...focusPath, Math.min(operation.index, next.length - 1)]
        : focusPath;
    } else if (operation.kind === 'array-move') {
      if (
        !index(operation.from, next.length) ||
        !index(operation.to, next.length) ||
        operation.from === operation.to
      ) {
        throw Error('Invalid array move');
      }
      const [entry] = next.splice(operation.from, 1);
      next.splice(operation.to, 0, entry);
      focusPath = [...focusPath, operation.to];
    } else throw Error('Unknown operation');
    value = next;
  }
  const data = setValueAtPath(root, operation.pathSegments, value);
  if (!checkEditableTree(data)) throw Error('The resulting tree exceeds its limits');
  return { data, operation, previousValue, value, focusPath };
}
/** Rebase transient view addresses; deleted/replaced descendants have no surviving identity. */
export function rebaseJsonTreePath(
  path: JsonTreePathSegments,
  operation: JsonTreeOperation
): JsonTreePathSegments | undefined {
  const base = operation.pathSegments;
  if (!base.every((part, i) => part === path[i]) || path.length < base.length) return path;
  if (operation.kind === 'replace') return path.length > base.length ? undefined : path;
  const part = path[base.length];
  if (part === undefined) return path;
  const tail = path.slice(base.length + 1);
  if (operation.kind === 'property-rename' && part === operation.key) {
    return [...base, operation.nextKey, ...tail];
  }
  if (operation.kind === 'property-remove' && part === operation.key) return undefined;
  if (typeof part === 'number') {
    if (operation.kind === 'array-insert' && part >= operation.index) {
      return [...base, part + 1, ...tail];
    }
    if (operation.kind === 'array-remove') {
      return part === operation.index
        ? undefined
        : part > operation.index
          ? [...base, part - 1, ...tail]
          : path;
    }
    if (operation.kind === 'array-move') {
      const n =
        part === operation.from
          ? operation.to
          : operation.from < operation.to && part > operation.from && part <= operation.to
            ? part - 1
            : operation.from > operation.to && part >= operation.to && part < operation.from
              ? part + 1
              : part;
      return [...base, n, ...tail];
    }
  }
  return path;
}
