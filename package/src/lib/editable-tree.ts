import { getValueAtPath, isWritableContainer, type JsonTreePathSegments } from './path';

/** Reject expensive/ambiguous edit graphs before the display traverses them. */
export function checkEditableTree(value: unknown, maxNodes = 10000, maxDepth = 64): boolean {
  const seen = new WeakSet<object>();
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
  let count = 0;
  let textLength = 0;
  while (stack.length) {
    const current = stack.pop()!;
    if (++count > maxNodes || current.depth > maxDepth) return false;
    if (typeof current.value === 'string') textLength += current.value.length;
    if (textLength > 65536) return false;
    if (current.value instanceof Date && !Number.isFinite(current.value.getTime())) return false;
    if (!current.value || typeof current.value !== 'object') continue;
    if (seen.has(current.value)) return false;
    seen.add(current.value);
    if (current.value instanceof Map || current.value instanceof Set) {
      if (current.value.size * 2 + stack.length + count > maxNodes) return false;
      for (const [key, entry] of current.value.entries()) {
        stack.push(
          { value: key, depth: current.depth + 1 },
          { value: entry, depth: current.depth + 1 }
        );
      }
      continue;
    }
    const keys = Object.keys(current.value);
    if (
      Array.isArray(current.value) &&
      (current.value.length > maxNodes ||
        keys.length !== current.value.length ||
        keys.some((key, index) => key !== String(index)))
    ) {
      return false;
    }
    if (keys.length + stack.length + count > maxNodes) return false;
    for (const key of keys) {
      textLength += key.length;
      if (textLength > 65536) return false;
      const descriptor = Object.getOwnPropertyDescriptor(current.value, key);
      if (!descriptor || !('value' in descriptor)) return false;
      stack.push({ value: descriptor.value, depth: current.depth + 1 });
    }
  }
  return true;
}

/** Exact own-data lookup; no inherited members, getters or synthetic Map/Set paths. */
export function hasEditablePath(root: unknown, segments: JsonTreePathSegments): boolean {
  let current = root;
  for (const segment of segments) {
    if (!isWritableContainer(current)) return false;
    if (
      Array.isArray(current)
        ? typeof segment !== 'number' ||
          !Number.isInteger(segment) ||
          segment < 0 ||
          segment >= current.length
        : typeof segment !== 'string'
    ) {
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(current, segment);
    if (!descriptor || !('value' in descriptor)) return false;
    current = descriptor.value;
  }
  return true;
}
export function editableValueAtPath(root: unknown, segments: JsonTreePathSegments): unknown {
  if (!hasEditablePath(root, segments)) throw new Error('Invalid editable address');
  return getValueAtPath(root, segments);
}
