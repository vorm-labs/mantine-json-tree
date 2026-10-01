import '@mantine/core/styles.css';
import '../../package/dist/styles.css';
import { MantineProvider } from '@mantine/core';
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  JsonTreeEditor,
  type JsonTreeEditorHandle,
  type JsonTreeEditStatus,
} from '../../package/src';
import { semanticEditor } from './semantic-editors';
function Demo() {
  const [data, setData] = useState<unknown>({
    date: '2026-10-01',
    amount: '999999999999999999.123456789',
    color: '#336699',
    instant: new Date('2026-10-01T12:00:00Z'),
    integer: BigInt('9007199254740993'),
    label: 'Hello',
    flags: [true, false],
    empty: null,
  });
  const [status, setStatus] = useState<JsonTreeEditStatus>({ state: 'idle' });
  const [refuse, setRefuse] = useState(false);
  const [editable, setEditable] = useState(true);
  const [nl, setNl] = useState(false);
  const ref = useRef<JsonTreeEditorHandle>(null);
  const past = useRef<unknown[]>([]);
  const future = useRef<unknown[]>([]);
  const [lastOperation, setLastOperation] = useState('');
  return (
    <main style={{ maxWidth: 900, margin: '2rem auto' }}>
      <h1>Standalone custom JSON tree editors</h1>
      <p>
        The host owns data. Apply requests a replacement; blur keeps the draft. Date atoms use UTC.
        Decimal text and BigInt retain precision.
      </p>
      <button type="button" onClick={() => setRefuse(!refuse)}>
        {refuse ? 'Allow changes' : 'Refuse changes'}
      </button>
      <button type="button" onClick={() => setEditable(!editable)}>
        Toggle editing
      </button>
      <button type="button" onClick={() => setData({ changed: 'External replacement' })}>
        Replace data
      </button>
      <button type="button" onClick={() => setNl(!nl)}>
        Change language
      </button>
      <button type="button" onClick={() => ref.current?.finish()}>
        Finish active edit
      </button>
      <button
        type="button"
        disabled={status.state !== 'idle' || !past.current.length}
        onClick={() => {
          future.current.push(data);
          setData(past.current.pop());
        }}
      >
        Undo
      </button>
      <button
        type="button"
        disabled={status.state !== 'idle' || !future.current.length}
        onClick={() => {
          past.current.push(data);
          setData(future.current.pop());
        }}
      >
        Redo
      </button>
      <output aria-label="Last operation">{lastOperation}</output>
      <JsonTreeEditor
        structure
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
          (!Array.isArray(next.flags) || !next.flags.every((value) => typeof value === 'boolean'))
            ? 'Flags must contain booleans'
            : null
        }
        structureLabels={
          nl
            ? {
                target: 'Structuurdoel',
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
          (({ date: 'date', amount: 'decimal', color: 'color' }) as Record<string, string>)[
            String(node.pathSegments[0])
          ]
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
      <output aria-label="Edit status">{JSON.stringify(status)}</output>
      <section aria-label="Host value">
        <pre>
          {JSON.stringify(data, (_, value) => (typeof value === 'bigint' ? `${value}n` : value), 2)}
        </pre>
      </section>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <MantineProvider>
    <Demo />
  </MantineProvider>
);
