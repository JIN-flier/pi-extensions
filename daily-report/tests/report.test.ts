import assert from "node:assert/strict";
import test from "node:test";

import { formatReport, formatSummaryLine, summarize } from "../src/report.ts";

import type { SessionEntry } from "@earendil-works/pi-coding-agent";

function entry<T extends SessionEntry["type"]>(
  value: Extract<SessionEntry, { type: T }>,
): SessionEntry {
  return value as SessionEntry;
}

function baseFields(id: string) {
  return { id, parentId: null, timestamp: `2026-11-23T10:00:0${id}.000Z` };
}

test("summarize counts turns, tool calls, compactions and models", () => {
  const entries: SessionEntry[] = [
    entry({
      ...baseFields("1"),
      type: "message",
      message: { role: "user", content: "hi", timestamp: 1 },
    }),
    entry({
      ...baseFields("2"),
      type: "message",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "calling a tool" },
          {
            type: "toolCall",
            id: "call-1",
            name: "read",
            arguments: {},
          },
        ],
        api: "anthropic-messages",
        provider: "anthropic",
        model: "claude-sonnet-4",
        timestamp: 2,
      } as unknown as Extract<SessionEntry, { type: "message" }>["message"],
    }),
    entry({
      ...baseFields("3"),
      type: "message",
      message: {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "read",
        content: [],
        isError: false,
        timestamp: 3,
      },
    }),
    entry({
      ...baseFields("4"),
      type: "compaction",
      summary: "summarized",
      firstKeptEntryId: "1",
      tokensBefore: 1000,
    }),
  ];

  const stats = summarize(entries);

  assert.equal(stats.userTurns, 1);
  assert.equal(stats.assistantTurns, 1);
  assert.equal(stats.toolCalls, 1);
  assert.equal(stats.toolResults, 1);
  assert.equal(stats.compactions, 1);
  assert.deepEqual(stats.models, ["anthropic/claude-sonnet-4"]);
});

test("summarize ignores non-message bookkeeping and de-duplicates models", () => {
  const entries: SessionEntry[] = [
    entry({
      ...baseFields("1"),
      type: "model_change",
      provider: "anthropic",
      modelId: "claude-sonnet-4",
    }),
    entry({
      ...baseFields("2"),
      type: "model_change",
      provider: "anthropic",
      modelId: "claude-sonnet-4",
    }),
    entry({
      ...baseFields("3"),
      type: "session_info",
      name: "renamed",
    }),
  ];

  const stats = summarize(entries);

  assert.deepEqual(stats.models, ["anthropic/claude-sonnet-4"]);
  assert.equal(stats.userTurns, 0);
  assert.equal(stats.assistantTurns, 0);
});

test("formatReport renders markdown with meta and a dash for unknown models", () => {
  const markdown = formatReport(
    {
      userTurns: 2,
      assistantTurns: 2,
      toolCalls: 3,
      toolResults: 3,
      compactions: 0,
      models: [],
    },
    { date: "2026-11-23", sessionId: "sess-1", cwd: "/tmp/project" },
  );

  assert.match(markdown, /^## Daily report — 2026-11-23$/m);
  assert.match(markdown, /`sess-1`/);
  assert.match(markdown, /`\/tmp\/project`/);
  assert.match(markdown, /- Tool calls: 3/);
  assert.match(markdown, /- Models: —/);
});

test("formatSummaryLine stays on one line", () => {
  const line = formatSummaryLine({
    userTurns: 1,
    assistantTurns: 2,
    toolCalls: 3,
    toolResults: 3,
    compactions: 0,
    models: [],
  });

  assert.equal(line, "1 user turns · 2 assistant turns · 3 tool calls · 0 compactions");
  assert.ok(!line.includes("\n"));
});
