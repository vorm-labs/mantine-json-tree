import { ActionIcon, Group, Menu } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconDots, IconGripVertical } from '@tabler/icons-react';
import React from 'react';
import type { JsonTreeNodePayload } from './JsonTree';
import { structureLabels, type JsonTreeStructureHandle } from './JsonTreeStructureControls';
import type { JsonTreeOperation } from './lib/operations';
import { isWritableContainer } from './lib/path';

/** Row controls issue the same guarded operations as the advanced toolbar. */
export function JsonTreeRowActions(p: {
  node: JsonTreeNodePayload;
  parent: unknown;
  disabled: boolean;
  withReorderButtons: boolean;
  labels: typeof structureLabels;
  open: JsonTreeStructureHandle['open'];
  request: (op: JsonTreeOperation) => void;
  dragProps?: React.ButtonHTMLAttributes<HTMLButtonElement>;
}) {
  const { node, labels } = p;
  const path = node.pathSegments;
  const parentPath = path.slice(0, -1);
  const index = Number(path[path.length - 1]);
  const arrayEntry = path.length > 0 && Array.isArray(p.parent);
  const move = (to: number) =>
    p.request({ kind: 'array-move', pathSegments: parentPath, from: index, to });
  return (
    <Group
      gap={2}
      wrap="nowrap"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {arrayEntry && (
        <>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            disabled={p.disabled}
            aria-label={`${labels.drag} ${node.path}`}
            title={labels.drag}
            style={{ touchAction: 'none', cursor: p.disabled ? undefined : 'grab' }}
            {...p.dragProps}
          >
            <IconGripVertical size={16} />
          </ActionIcon>
          {p.withReorderButtons && (
            <>
              <ActionIcon
                variant="subtle"
                size="sm"
                aria-label={`${labels.up} ${node.path}`}
                title={labels.up}
                disabled={p.disabled || index === 0}
                onClick={() => move(index - 1)}
              >
                <IconArrowUp size={15} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                size="sm"
                aria-label={`${labels.down} ${node.path}`}
                title={labels.down}
                disabled={p.disabled || index >= (p.parent as unknown[]).length - 1}
                onClick={() => move(index + 1)}
              >
                <IconArrowDown size={15} />
              </ActionIcon>
            </>
          )}
        </>
      )}
      <Menu withinPortal={false} position="bottom-end" returnFocus>
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            disabled={p.disabled}
            aria-label={`${labels.actions} ${node.path}`}
            title={labels.actions}
          >
            <IconDots size={16} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {isWritableContainer(node.value) && (
            <Menu.Item
              onClick={(e) =>
                p.open(Array.isArray(node.value) ? 'insert' : 'add', path, e.currentTarget)
              }
            >
              {Array.isArray(node.value) ? labels.insert : labels.add}
            </Menu.Item>
          )}
          {path.length > 0 && isWritableContainer(p.parent) && !arrayEntry && (
            <Menu.Item onClick={(e) => p.open('rename', path, e.currentTarget)}>
              {labels.rename}
            </Menu.Item>
          )}
          <Menu.Item onClick={(e) => p.open('replace', path, e.currentTarget)}>
            {labels.replace}
          </Menu.Item>
          {path.length > 0 && isWritableContainer(p.parent) && (
            <Menu.Item
              color="red"
              onClick={() =>
                p.request(
                  arrayEntry
                    ? { kind: 'array-remove', pathSegments: parentPath, index }
                    : {
                        kind: 'property-remove',
                        pathSegments: parentPath,
                        key: String(path[path.length - 1]),
                      }
                )
              }
            >
              {labels.remove}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
