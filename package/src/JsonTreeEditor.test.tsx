import { MantineProvider } from '@mantine/core';
import { fireEvent, screen, act, render as testingRender } from '@testing-library/react';
import React, { createRef, useState } from 'react';
import {
  JsonTreeEditor,
  defineJsonTreeValueEditor,
  type JsonTreeEditorHandle,
  type JsonTreeEditorInputProps,
} from './JsonTreeEditor';
import { checkEditableTree, hasEditablePath } from './lib/editable-tree';
const render = (node: React.ReactNode) =>
  testingRender(node, {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <MantineProvider env="test">{children}</MantineProvider>
    ),
  });
const big = defineJsonTreeValueEditor({
  key: 'bigint',
  accepts: (v: unknown): v is bigint => typeof v === 'bigint',
  format: String,
  parse: (text) =>
    /^-?\d+$/.test(text)
      ? { valid: true, value: BigInt(text) }
      : { valid: false, error: 'Invalid integer' },
});
function Host({
  initial = { value: 'before' },
  editor = undefined,
}: {
  initial?: unknown;
  editor?: typeof big;
}) {
  const [data, setData] = useState(initial);
  return (
    <>
      <JsonTreeEditor
        data={data}
        editable
        defaultExpanded
        resolveEditor={() => editor}
        onChange={(next) => setData(next)}
      />
      <output>{typeof data === 'bigint' ? String(data) : JSON.stringify(data)}</output>
    </>
  );
}
it('edits segmented unusual keys with immutable sibling identity and one host notification', () => {
  const sibling = { untouched: true };
  const data = { 'a.b': 'before', a: { b: 'nested' }, sibling };
  const change = jest.fn();
  render(<JsonTreeEditor data={data} editable defaultExpanded onChange={change} />);
  const buttons = screen.getAllByRole('button', { name: 'Edit root.a.b' });
  fireEvent.click(buttons[0]);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'after' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(change).toHaveBeenCalledTimes(1);
  expect(change.mock.calls[0][0]).toEqual({ 'a.b': 'after', a: { b: 'nested' }, sibling });
  expect(change.mock.calls[0][0].sibling).toBe(sibling);
  expect(change.mock.calls[0][1].pathSegments).toEqual(['a.b']);
  expect(data['a.b']).toBe('before');
  expect(screen.getByRole('textbox')).toHaveValue('after');
  expect(screen.getByRole('status')).toHaveTextContent('Waiting');
});
it('refused and invalid drafts survive blur, finish and rerender until explicit cancel', () => {
  const data = { value: 1 };
  const ref = createRef<JsonTreeEditorHandle>();
  const change = jest.fn(() => false);
  render(<JsonTreeEditor ref={ref} data={data} editable defaultExpanded onChange={change} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit root.value' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '-' } });
  fireEvent.blur(screen.getByRole('textbox'));
  act(() => expect(ref.current?.finish()).toBe(false));
  expect(screen.getByRole('textbox')).toHaveValue('-');
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '2' } });
  act(() => expect(ref.current?.finish()).toBe(false));
  expect(screen.getByRole('textbox')).toHaveValue('2');
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
  expect(screen.queryByRole('textbox')).toBeNull();
});
it('requires host echo, preserves controlled ownership and cancels on Escape', () => {
  render(<Host />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit root.value' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'after' } });
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('after');
});
it('supports explicit BigInt root editing losslessly', () => {
  render(<Host initial={BigInt('1')} editor={big} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit root' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '999999999999999999999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(screen.getByRole('status')).toHaveTextContent('999999999999999999999');
});
it('invalidates writes after external replacement, restriction and unmount without discarding the draft', () => {
  let commands: JsonTreeEditorInputProps | undefined;
  const custom = {
    ...big,
    Input: (p: JsonTreeEditorInputProps) => {
      commands = p;
      return (
        <input
          aria-label={p.label}
          value={p.draft}
          onChange={(e) => p.onDraftChange(e.target.value)}
        />
      );
    },
  };
  const change = jest.fn();
  const view = render(
    <JsonTreeEditor data={BigInt('1')} editable resolveEditor={() => custom} onChange={change} />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit root' }));
  const stale = commands!;
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '2' } });
  view.rerender(
    <JsonTreeEditor
      data={BigInt('3')}
      editable={false}
      resolveEditor={() => custom}
      onChange={change}
    />
  );
  act(() => expect(stale.commit()).toBe(false));
  expect(screen.getByRole('textbox')).toHaveValue('2');
  expect(screen.getByRole('alert')).toHaveTextContent('changed');
  view.unmount();
  expect(stale.commit()).toBe(false);
  expect(change).not.toHaveBeenCalled();
});
it('bounds graph traversal and rejects inherited, accessor, synthetic and wrong-kind addresses', () => {
  expect(checkEditableTree(Array(10001).fill(0))).toBe(false);
  expect(checkEditableTree(new Array(1000000))).toBe(false);
  const cycle: unknown[] = [];
  cycle.push(cycle);
  expect(checkEditableTree(cycle)).toBe(false);
  const shared = { a: 1 };
  expect(checkEditableTree({ left: shared, right: shared })).toBe(false);
  const get = jest.fn();
  expect(checkEditableTree(Object.defineProperty({}, 'x', { get, enumerable: true }))).toBe(false);
  expect(get).not.toHaveBeenCalled();
  expect(hasEditablePath({}, ['constructor'])).toBe(false);
  expect(hasEditablePath([1], ['0'])).toBe(false);
  expect(hasEditablePath({ '0': 1 }, [0])).toBe(false);
  expect(hasEditablePath(new Map([['x', 1]]), ['x'])).toBe(false);
});
it('custom metadata resolves semantic strings, validates host output and retains sibling atoms', () => {
  const atom = new Date('2026-10-01T00:00:00Z');
  const data = { date: '2026-10-01', atom };
  const change = jest.fn(() => false);
  const custom = defineJsonTreeValueEditor({
    key: 'date',
    accepts: (v: unknown): v is string => typeof v === 'string',
    format: (v) => v,
    parse: (draft) =>
      draft === '2027-01-01'
        ? { valid: true, value: draft }
        : { valid: false, error: 'Invalid date' },
    Read: ({ node }) => <time>{node.value}</time>,
  });
  render(
    <JsonTreeEditor
      data={data}
      editable
      defaultExpanded
      metadata={(node) => (node.key === 'date' ? 'date' : undefined)}
      resolveEditor={(node) => (node.metadata === 'date' ? custom : undefined)}
      validate={() => 'Host validation failed'}
      onChange={change}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit root.date' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '2027-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(screen.getByText('Host validation failed')).toBeVisible();
  expect(change).not.toHaveBeenCalled();
  expect(data.atom).toBe(atom);
});
it('allows an explicitly selected whole-object root editor and keeps unknown atoms readable', () => {
  const custom = defineJsonTreeValueEditor({
    key: 'object',
    accepts: (v: unknown): v is { a: number } => Boolean(v && typeof v === 'object' && 'a' in v),
    format: () => '{"a":1}',
    parse: () => ({ valid: true, value: { a: 2 } }),
  });
  const change = jest.fn();
  render(
    <JsonTreeEditor
      data={{ a: 1 }}
      editable
      defaultExpanded
      resolveEditor={(node) => (node.pathSegments.length === 0 ? custom : undefined)}
      onChange={change}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit root' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(change.mock.calls[0][0]).toEqual({ a: 2 });
  expect(change.mock.calls[0][1].pathSegments).toEqual([]);
});
it('keeps Map and Set entries display-only and rejects alias graphs with an explicit notice', () => {
  const view = render(
    <JsonTreeEditor
      data={{ map: new Map([['x', 1]]), set: new Set(['x']) }}
      editable
      defaultExpanded
    />
  );
  expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull();
  expect(view.container).toHaveTextContent('map:');
});
it('falls back safely when custom renderers throw and guards composing Enter', () => {
  const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
  const change = jest.fn();
  const custom = {
    ...big,
    Input: () => {
      throw Error('Renderer unavailable');
    },
    Read: () => {
      throw Error('Read renderer unavailable');
    },
  };
  try {
    render(
      <JsonTreeEditor data={BigInt('1')} editable resolveEditor={() => custom} onChange={change} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit root' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '2' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', isComposing: true });
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox')).toHaveValue('2');
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(change).toHaveBeenCalledTimes(1);
  } finally {
    logged.mockRestore();
  }
});

it('throwing host metadata cannot crash row rendering or grant row actions', () => {
  render(
    <JsonTreeEditor
      data={{ value: 'safe' }}
      editable
      structure
      defaultExpanded
      metadata={() => {
        throw Error('Host metadata failed');
      }}
    />
  );
  expect(screen.getByText('"safe"')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Actions root.value' })).toBeDisabled();
});
