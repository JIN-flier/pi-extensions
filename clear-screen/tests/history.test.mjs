import assert from 'node:assert/strict';
import test from 'node:test';
import { TuiMainScreen, visibleWidth } from '@earendil-works/pi-tui';
import { showHistory } from '../src/history.ts';
import { MemoryTerminal, harness, entry } from './helpers.mjs';

async function history(entries, rows = 100) {
  const terminal = new MemoryTerminal();
  terminal.rows = rows;
  const tui = new TuiMainScreen(terminal);
  const h = harness(tui, entries);
  await showHistory(h.ctx);
  return Object.assign(h, { terminal });
}

test('image-only user starts a separate Q&A and keeps its answer', async () => {
  const h = await history([
    entry('user', 'first question'), entry('assistant', [{ type: 'text', text: 'first answer' }]),
    entry('user', [{ type: 'image', data: 'AA==', mimeType: 'image/png' }]),
    entry('assistant', [{ type: 'text', text: 'image answer' }]),
  ]);
  const text = h.component.render(100).join('\n');
  assert.match(text, /#2\/2/);
  assert.match(text, /图片/);
  assert.match(text, /image answer/);
});

test('hints describe the actual line-scroll and exit keys', async () => {
  const h = await history([entry('user', 'question')]);
  const text = h.component.render(150).join('\n');
  assert.match(text, /Ctrl\+C/i);
  assert.match(text, /逐行/);
  h.component.handleInput('\x1b');
  h.component.handleInput('\x03');
  assert.equal(h.closed, 2);
});

test('resize and invalidate preserve the selected question and obey current terminal height', async () => {
  const h = await history(Array.from({length: 8}, (_, i) => entry('user', `question ${i}`)), 40);
  h.component.render(100);
  h.component.handleInput('\x1b[H');
  assert.match(h.component.render(100).join("\n"), /#1\/8/);
  h.terminal.rows = 12;
  h.component.invalidate();
  const lines = h.component.render(45);
  assert.match(lines.join("\n"), /#1\/8/);
  assert.ok(lines.length <= Math.floor(12 * .85));
  assert.ok(lines.every(line => visibleWidth(line) <= 45));
});

test('empty history and tiny terminals fit their viewport without fake selection', async () => {
  const h = await history([]);
  assert.doesNotMatch(h.component.render(100).join("\n"), /#\d/);
  assert.match(h.component.render(100).join('\n'), /暂无对话历史/);
  for (const rows of [1, 3, 5, 10]) {
    h.terminal.rows = rows;
    for (const width of [1, 2, 5, 15]) {
      const lines = h.component.render(width);
      assert.ok(lines.length <= Math.max(1, Math.floor(rows * .85)));
      assert.ok(lines.every(line => visibleWidth(line) <= width));
      h.component.handleInput('\x1b[A');
      h.component.handleInput('\x1b[B');
    }
  }
});

test('arrow keys scroll one line, left/right select cards, and unknown keys leave the view alone', async () => {
  const h = await history(Array.from({ length: 6 }, (_, i) => entry('user', `question ${i}\n${'long answer\n'.repeat(20)}`)), 20);
  h.component.render(80);
  h.component.handleInput('\x1b[H');
  const top = h.component.render(80);
  assert.match(top.join("\n"), /#1\/6/);
  assert.match(top.at(-1), / 1–/);
  h.component.handleInput('\x1b[B');
  assert.match(h.component.render(80).at(-1), / 2–/);
  h.component.handleInput('\x1b[A');
  assert.match(h.component.render(80).at(-1), / 1–/);
  h.component.handleInput('\x1b[C');
  assert.match(h.component.render(80).join("\n"), /#2\/6/);
  h.component.handleInput('\x1b[D');
  assert.match(h.component.render(80).join("\n"), /#1\/6/);
  const before = h.component.render(80);
  h.component.handleInput('x');
  assert.deepEqual(h.component.render(80), before);
  h.component.handleInput('\x1b[F');
  assert.match(h.component.render(80).join("\n"), /#6\/6/);
});

test('/history declines non-TUI mode', async () => {
  const h = harness(new TuiMainScreen(new MemoryTerminal()));
  h.ctx.mode = 'rpc';
  await showHistory(h.ctx);
  assert.equal(h.component, undefined);
  assert.equal(h.notices[0][1], 'warning');
});

const answer = text => entry('assistant', [{ type: 'text', text }]);
const longAnswer = prefix => Array.from({ length: 28 }, (_, i) => `${prefix} line ${i + 1}`).join('\n');

function queryRow(lines, query) {
  return lines.findIndex(line => line.includes(query));
}

test('query and answer share the outer vertical frame with horizontal separators', async () => {
  const h = await history([entry('user', 'FRAME_QUERY'), answer('FRAME_ANSWER')], 30);
  const lines = h.component.render(80);
  assert.ok(lines[0].startsWith('╭') && lines[0].endsWith('╮'));
  assert.ok(lines.at(-1).startsWith('╰') && lines.at(-1).endsWith('╯'));
  assert.ok(lines.slice(1, -1).every(line => /^[│├]/.test(line) && /[│┤]$/.test(line)));
  const query = queryRow(lines, 'FRAME_QUERY');
  const response = queryRow(lines, 'FRAME_ANSWER');
  assert.match(lines[query - 1], /[│├]─.*Query.*─[│┤]/);
  assert.match(lines[query + 1], /[│├]─+.*[│┤]/);
  assert.match(lines[response - 1], /[│├]─.*Assistant.*─[│┤]/);
  assert.match(lines[response + 1], /[│├]─+.*[│┤]/);
  assert.equal((lines[query].match(/│/g) ?? []).length, 2);
  assert.equal((lines[response].match(/│/g) ?? []).length, 2);
  assert.ok(lines.every(line => visibleWidth(line) === 80));
});

test('query stays at the top while up/down scroll the answer', async () => {
  const h = await history([entry('user', 'PINNED_QUERY'), answer(longAnswer('reply'))], 22);
  h.component.render(80);
  h.component.handleInput('\x1b[H');
  const initial = h.component.render(80);
  const row = queryRow(initial, 'PINNED_QUERY');
  assert.ok(row >= 0);
  for (let i = 0; i < 10; i++) {
    h.component.handleInput('\x1b[B');
    assert.equal(queryRow(h.component.render(80), 'PINNED_QUERY'), row);
  }
  const scrolled = h.component.render(80);
  assert.ok(scrolled.some(line => line.includes('reply line 10')));
  assert.ok(!scrolled.some(line => line.includes('reply line 1 ')));
  for (let i = 0; i < 5; i++) {
    h.component.handleInput('\x1b[A');
    assert.equal(queryRow(h.component.render(80), 'PINNED_QUERY'), row);
  }
});

test('next query pushes out the pinned query, including a short final turn', async () => {
  const h = await history([
    entry('user', 'QUERY_ONE'), answer(longAnswer('first')),
    entry('user', 'QUERY_TWO'), answer('LAST_ANSWER'),
  ], 24);
  h.component.render(80);
  h.component.handleInput('\x1b[H');
  const initialRow = queryRow(h.component.render(80), 'QUERY_ONE');
  let sawPush = false;
  let reachedNext = false;
  for (let i = 0; i < 80; i++) {
    h.component.handleInput('\x1b[B');
    const lines = h.component.render(80);
    const previous = queryRow(lines, 'QUERY_ONE');
    const next = queryRow(lines, 'QUERY_TWO');
    if (previous >= 0 && previous < initialRow && next > previous) sawPush = true;
    if (previous === -1 && next === initialRow) { reachedNext = true; break; }
  }
  assert.ok(sawPush, 'next query should push the old header upward before replacing it');
  assert.ok(reachedNext, 'short final query must be able to reach the sticky position');
  assert.match(h.component.render(80).join('\n'), /LAST_ANSWER/);
  h.component.handleInput('\x1b[A');
  assert.match(h.component.render(80).join('\n'), /QUERY_TWO/);
});

test('long queries remain scrollable and their sticky copy leaves room for the answer', async () => {
  const question = ['LONG_QUERY_START', ...Array.from({length: 45}, (_, i) => `query row ${i}`), 'LONG_QUERY_END'].join('\n');
  const h = await history([entry('user', question), answer('VISIBLE_ANSWER')], 22);
  h.component.render(80);
  h.component.handleInput('\x1b[H');
  const seen = new Set();
  for (let i = 0; i < 80; i++) {
    const lines = h.component.render(80);
    assert.ok(lines.length <= Math.floor(22 * .85));
    for (const line of lines) {
      const match = line.match(/query row (\d+)\b/);
      if (match) seen.add(Number(match[1]));
    }
    h.component.handleInput('\x1b[B');
  }
  assert.equal(seen.size, 45);
  const end = h.component.render(80).join('\n');
  assert.match(end, /LONG_QUERY_START/);
  assert.match(end, /VISIBLE_ANSWER/);
});

test('short terminals keep query text pinned while leaving an answer row', async () => {
  const h = await history([entry('user', 'SMALL_QUERY'), answer(longAnswer('short'))], 10);
  h.component.render(60);
  h.component.handleInput('\x1b[H');
  for (let i = 0; i < 8; i++) {
    h.component.handleInput('\x1b[B');
    const lines = h.component.render(60);
    assert.match(lines.join('\n'), /SMALL_QUERY/);
    assert.ok(lines.length <= Math.floor(10 * .85));
  }
  assert.match(h.component.render(60).join('\n'), /short line/);
});

test('wrapped Chinese and ANSI content stay inside frames during resize and reverse scrolling', async () => {
  const h = await history([
    entry('user', '固定问题：解释中文折行以及 emoji 🙂。'),
    answer(longAnswer('\x1b[32m这是回答\x1b[0m')),
    entry('user', '下一个问题'), answer('最终回答'),
  ], 28);
  h.component.render(80);
  h.component.handleInput('\x1b[H');
  for (let i = 0; i < 5; i++) { h.component.handleInput('\x1b[B'); h.component.render(80); }
  for (const width of [32, 55, 80]) {
    const lines = h.component.render(width);
    assert.match(lines.join('\n'), /固定问题/);
    assert.ok(lines.every(line => visibleWidth(line) === width));
  }
  h.component.handleInput('\x1b[F');
  assert.match(h.component.render(80).join('\n'), /下一个问题/);
  for (let i = 0; i < 8; i++) { h.component.handleInput('\x1b[A'); h.component.render(80); }
  assert.match(h.component.render(80).join('\n'), /固定问题/);
});

for (const rows of [8, 9, 10]) {
  test(`short final answer is visible on open and End at ${rows} terminal rows`, async () => {
    const h = await history([entry('user', 'TINY_QUERY'), answer('TINY_ANSWER')], rows);
    for (const key of ['', '\x1b[H', '\x1b[F']) {
      if (key) h.component.handleInput(key);
      const lines = h.component.render(80);
      if (key !== '\x1b[H') {
        assert.match(lines.join('\n'), /TINY_QUERY/);
        assert.match(lines.join('\n'), /TINY_ANSWER/);
      }
      assert.ok(lines.length <= Math.floor(rows * .85));
    }
  });
}


test('window uses a plain History title and only a line counter in its footer', async () => {
  const h = await history([entry('user', 'query'), answer('reply')]);
  const lines = h.component.render(120);
  assert.match(lines[0], /^╭ History ─+╮$/);
  assert.match(lines.at(-1), /^╰ \d+–\d+ \/ \d+ 行 ─+╯$/);
});

test('Assistant renders native Markdown while Query remains literal text', async () => {
  const h = await history([
    entry('user', '**literal query**'),
    answer('**bold answer**\n\n- list item\n\n```js\nconst value = 42;\n```'),
  ], 50);
  const lines = h.component.render(100);
  const text = lines.join('\n');
  assert.match(text, /\*\*literal query\*\*/);
  assert.doesNotMatch(text, /\*\*bold answer\*\*/);
  assert.match(text, /\x1b\[[0-9;]*mconst/, 'native code blocks apply syntax highlighting');
  assert.match(text, /bold answer/);
  assert.match(text, /list item/);
  assert.match(text, /42/);
  assert.match(text, /\x1b\[/, 'native Markdown produces styled terminal output');
  assert.ok(lines.every(line => visibleWidth(line) === 100));
});
