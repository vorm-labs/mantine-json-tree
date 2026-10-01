import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '../../package/dist/styles.css';
import {
  Badge,
  Button,
  Container,
  Divider,
  Group,
  MantineProvider,
  Paper,
  Stack,
  Switch,
  Text,
  Title,
  useMantineColorScheme,
} from '@mantine/core';
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  JsonTreeEditor,
  type JsonTreeEditorHandle,
  type JsonTreeEditStatus,
} from '../../package/src';
import { semanticEditor } from './semantic-editors';
function Demo() {
  const { toggleColorScheme } = useMantineColorScheme();
  const [data, setData] = useState<unknown>({
    date: '2026-10-01',
    amount: '999999999999999999.123456789',
    color: '#336699',
    instant: new Date('2026-10-01T12:00:00Z'),
    integer: BigInt('9007199254740993'),
    label: 'Hello',
    flags: [true, false],
    empty: null,
    enabled: true,
    quantity: 12,
    notes: 'A page worth reading.\nWrite a short introduction here.',
    status: 'Draft',
    tags: ['Design', 'Content'],
    scheduled: '2026-10-15T09:30:00Z',
    sections: [
      { title: 'Introduction', visible: true },
      { title: 'Features', visible: true },
      { title: 'Contact', visible: false },
    ],
  });
  const [status, setStatus] = useState<JsonTreeEditStatus>({ state: 'idle' });
  const [refuse, setRefuse] = useState(false);
  const [editable, setEditable] = useState(true);
  const [withReorderButtons, setWithReorderButtons] = useState(false);
  const [nl, setNl] = useState(false);
  const ref = useRef<JsonTreeEditorHandle>(null);
  const past = useRef<unknown[]>([]);
  const future = useRef<unknown[]>([]);
  const [lastOperation, setLastOperation] = useState('');
  return (
    <Container size="lg" py="xl">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Badge variant="light" mb="xs">
              Mantine JSON tree
            </Badge>
            <Title order={1} size="h2">
              Edit your data, in place
            </Title>
            <Text c="dimmed" mt="xs">
              Click a value to edit. Use row menus to add, rename or remove.
            </Text>
            <Text c="dimmed">
              Drag an array entry to reorder. Enable reorder buttons for up and down controls.
            </Text>
          </div>
          <Button variant="default" onClick={() => toggleColorScheme()}>
            Toggle theme
          </Button>
        </Group>
        <Paper withBorder radius="md" p="md">
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={600}>Page settings</Text>
              <Badge variant="light">{status.state}</Badge>
            </Group>
            <Group gap="xs">
              <Button
                variant="default"
                size="xs"
                type="button"
                disabled={status.state !== 'idle' || !past.current.length}
                onClick={() => {
                  future.current.push(data);
                  setData(past.current.pop());
                }}
              >
                Undo
              </Button>
              <Button
                variant="default"
                size="xs"
                type="button"
                disabled={status.state !== 'idle' || !future.current.length}
                onClick={() => {
                  past.current.push(data);
                  setData(future.current.pop());
                }}
              >
                Redo
              </Button>
            </Group>
            <Switch
              label="Show reorder buttons"
              checked={withReorderButtons}
              onChange={(event) => setWithReorderButtons(event.currentTarget.checked)}
            />
            <Divider />
            <JsonTreeEditor
              structure
              withReorderButtons={withReorderButtons}
              title="Content"
              size="sm"
              showIndentGuides
              showItemsCount
              withExpandAll
              withSearch
              searchInputProps={{ 'aria-label': 'Search JSON' }}
              isOperationAllowed={(op) =>
                op.kind === 'property-remove' && op.key === 'date' && op.pathSegments.length === 0
                  ? 'Date is required'
                  : true
              }
              validate={(next) =>
                next &&
                typeof next === 'object' &&
                'flags' in next &&
                (!Array.isArray(next.flags) ||
                  !next.flags.every((value) => typeof value === 'boolean'))
                  ? 'Flags must contain booleans'
                  : null
              }
              structureLabels={
                nl
                  ? {
                      target: 'Structuurdoel',
                      actions: 'Acties',
                      drag: 'Slepen om te verplaatsen',
                      advanced: 'Geavanceerde structuuracties',
                      add: 'Eigenschap toevoegen',
                      insert: 'Invoegen',
                      remove: 'Verwijderen',
                      rename: 'Hernoemen',
                      up: 'Omhoog',
                      down: 'Omlaag',
                      replace: 'Waarde vervangen',
                      apply: 'Structuur toepassen',
                      cancel: 'Structuur annuleren',
                      name: 'Eigenschapsnaam',
                      type: 'Waardetype',
                      text: 'Beginwaarde',
                      invalid: 'Voer een geldige structuurwijziging in',
                      stale: 'Het doel is gewijzigd',
                      string: 'Tekst',
                      number: 'Getal',
                      boolean: 'Booleaans',
                      null: 'Null',
                      object: 'Object',
                      array: 'Lijst',
                    }
                  : undefined
              }
              ref={ref}
              data={data}
              editable={editable}
              defaultExpanded
              resolveEditor={semanticEditor}
              metadata={(node) =>
                (
                  ({
                    date: 'date',
                    amount: 'decimal',
                    color: 'color',
                    scheduled: 'datetime',
                    status: 'choice',
                    tags: 'choices',
                  }) as Record<string, string>
                )[String(node.pathSegments[0])]
              }
              onChange={(next, change) => {
                if (refuse) return false;
                past.current.push(data);
                future.current = [];
                setLastOperation(change.operation?.kind ?? 'replace');
                setData(next);
                return true;
              }}
              onEditStatusChange={setStatus}
              labels={
                nl
                  ? {
                      edit: 'Bewerken',
                      apply: 'Toepassen',
                      cancel: 'Annuleren',
                      invalid: 'Voer een geldige waarde in',
                      refused: 'De wijziging is geweigerd',
                      awaiting: 'Wachten op bevestiging',
                      conflict: 'De gegevens of toegang zijn gewijzigd',
                      truncated: 'De boom overschrijdt de weergavelimieten',
                    }
                  : undefined
              }
            />
          </Stack>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Title order={2} size="h4">
              Try the editor
            </Title>
            <Text size="sm">
              Edit Quantity with the number input, Enabled with a switch, or Date with the calendar.
              Sections contains objects you can reorder. Changes stay local; Undo and Redo restore
              accepted values.
            </Text>
          </Stack>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Stack gap="sm">
            <Title order={2} size="h4">
              Developer checks
            </Title>
            <Text size="sm" c="dimmed">
              Exercise rejected changes and external replacements. These controls are for testing
              the host integration.
            </Text>
            <Group gap="xs">
              {' '}
              <Button variant="default" size="xs" type="button" onClick={() => setRefuse(!refuse)}>
                {refuse ? 'Allow changes' : 'Refuse changes'}
              </Button>
              <Button
                variant="default"
                size="xs"
                type="button"
                onClick={() => setEditable(!editable)}
              >
                Toggle editing
              </Button>
              <Button
                variant="default"
                size="xs"
                type="button"
                onClick={() => setData({ changed: 'External replacement' })}
              >
                Replace data
              </Button>
              <Button variant="default" size="xs" type="button" onClick={() => setNl(!nl)}>
                Change language
              </Button>
              <Button
                variant="default"
                size="xs"
                type="button"
                onClick={() => ref.current?.finish()}
              >
                Finish active edit
              </Button>
            </Group>
            <output aria-label="Last operation">{lastOperation}</output>
            <output aria-label="Edit status">{JSON.stringify(status)}</output>
            <section aria-label="Host value">
              <pre style={{ overflowX: 'auto', fontSize: 12 }}>
                {JSON.stringify(
                  data,
                  (_, value) => (typeof value === 'bigint' ? `${value}n` : value),
                  2
                )}
              </pre>
            </section>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  );
}
createRoot(document.getElementById('root')!).render(
  <MantineProvider>
    <Demo />
  </MantineProvider>
);
