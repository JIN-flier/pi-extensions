/**
 * 会话数据 → 问答对 的纯函数层。
 *
 * 输入是 SessionManager.getBranch() 的原始 entry 列表，输出只保留 user /
 * assistant 的正文；thinking、toolCall、toolResult、图片二进制以及全部非消息
 * entry（compaction、model_change、custom…）都不会出现在结果里。
 *
 * 这一层不依赖 ctx、TUI 或主题，所以可以脱离宿主直接单测。
 */
import type {
  SessionEntry,
  SessionMessageEntry,
} from "@earendil-works/pi-coding-agent";

/** 一轮对话：用户的提问 + 该轮所有 assistant 正文。 */
export interface QAPair {
  /** 提问正文；纯图片或空消息会退化成占位文本。 */
  question: string;
  /** 该轮 assistant 正文，按出现顺序用空行拼接。 */
  answer: string;
}

/** 只保留 user / assistant，天然排除 toolResult、bashExecution 等角色。 */
type ChatMessage = Extract<
  SessionMessageEntry["message"],
  { role: "user" | "assistant" }
>;

/**
 * 抽取消息里的纯文本：字符串原样 trim；数组只取 type === "text" 的块，
 * 用空行连接，顺手丢掉 thinking / toolCall / image。
 */
function textOf(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content.trim();
  return content
    .filter((part) => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * 把 entry 流压成问答对。
 *
 * 每条 user 消息都开一张新卡片——包括纯图片和空消息，否则它们的回答会被
 * 错误地并进上一张卡片。assistant 文本按出现顺序追加，因此“文本 → 工具调用
 * → 文本”的多轮循环会合并成一段答案。
 */
export function readPairs(entries: readonly SessionEntry[]): QAPair[] {
  const pairs: QAPair[] = [];
  let current: QAPair | undefined;
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const message = entry.message;
    if (message.role === "user") {
      const text = textOf(message.content);
      // 图片只保留数量，base64 不进入 UI。
      const images =
        typeof message.content === "string"
          ? 0
          : message.content.filter((part) => part.type === "image").length;
      const imageLabel = images ? `（${images} 张图片）` : "";
      current = {
        question:
          [text, imageLabel].filter(Boolean).join("\n\n") || "（空消息）",
        answer: "",
      };
      pairs.push(current);
    } else if (message.role === "assistant" && current) {
      // 工具循环里只有 toolCall / thinking 的消息抽完文本为空，自然被跳过。
      const text = textOf(message.content);
      if (text)
        current.answer = [current.answer, text].filter(Boolean).join("\n\n");
    }
  }
  return pairs;
}
