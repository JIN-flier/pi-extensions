import assert from 'node:assert/strict';
import test from 'node:test';
import { readPairs } from '../src/history-data.ts';
import { entry } from './helpers.mjs';

const text = value => [{ type: 'text', text: value }];
const image = { type: 'image', data: 'AA==', mimeType: 'image/png' };

test('answers remain assigned to image-only and empty user turns', () => {
  assert.deepEqual(readPairs([
    entry('user', 'first'), entry('assistant', text('one')),
    entry('user', [image]), entry('assistant', text('two')),
    entry('user', []), entry('assistant', text('three')),
  ]), [
    { question: 'first', answer: 'one' },
    { question: '（1 张图片）', answer: 'two' },
    { question: '（空消息）', answer: 'three' },
  ]);
});

test('mixed image/text questions keep text and count attachments without exposing data', () => {
  assert.deepEqual(readPairs([entry('user', [...text('  describe this  '), image, image])]), [
    { question: 'describe this\n\n（2 张图片）', answer: '' },
  ]);
});

test('tool loops join assistant text but hide thinking, calls, results, and metadata', () => {
  assert.deepEqual(readPairs([
    entry('assistant', text('orphan')),
    { type: 'custom', customType: 'test', data: 'metadata' },
    entry('user', 'question'),
    entry('assistant', [
      { type: 'thinking', thinking: 'secret' },
      { type: 'toolCall', id: 'call', name: 'read', arguments: {} },
    ]),
    entry('toolResult', text('private file')),
    entry('assistant', text(' first paragraph ')),
    entry('assistant', [...text('second paragraph'), { type: 'thinking', thinking: 'secret' }]),
  ]), [{ question: 'question', answer: 'first paragraph\n\nsecond paragraph' }]);
});

test('empty branches have no fabricated Q&A', () => {
  assert.deepEqual(readPairs([]), []);
});
