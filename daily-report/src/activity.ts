import type { SessionEntry } from "@earendil-works/pi-coding-agent";

export type ActivityKind = "user" | "assistant" | "toolCall" | "toolResult" | "bashExecution";
export interface Activity {
  kind: ActivityKind;
  time: string;
  source: string;
  text: string;
}

function clip(value: string, limit = 4000): string {
  const redacted = value
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+/gi, "$1[REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret)\s*[:=]\s*["']?)[^\s,"'}]+/gi, "$1[REDACTED]");
  return redacted.length > limit ? `${redacted.slice(0, limit)}\n[内容截断]` : redacted;
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((part): part is { type: "text"; text: string } => part?.type === "text")
    .map(part => part.text).join("\n");
}

export function extractActivities(entries: SessionEntry[], sessionId: string): Activity[] {
  const activities: Activity[] = [];
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const message = entry.message;
    const base = { time: entry.timestamp, source: `${sessionId}#${entry.id}` };
    if (message.role === "user" || message.role === "assistant" || message.role === "toolResult") {
      const text = clip(contentText(message.content));
      if (text || message.role === "toolResult") activities.push({
        ...base,
        kind: message.role === "toolResult" ? "toolResult" : message.role,
        text: message.role === "toolResult" ? `${message.toolName} (isError=${message.isError}): ${text || "[无文本输出]"}` : text,
      });
      if (message.role === "assistant") {
        for (const part of message.content) {
          if (part.type !== "toolCall") continue;
          activities.push({ ...base, kind: "toolCall", text: clip(`${part.name}: ${JSON.stringify(part.arguments)}`) });
        }
      }
    } else if (message.role === "bashExecution") {
      activities.push({ ...base, kind: "bashExecution", text: clip(`$ ${message.command}\n退出码: ${message.exitCode ?? "未知"}\n${message.output}`) });
    }
  }
  return activities;
}
