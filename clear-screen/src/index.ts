/**
 * 扩展入口：把 slash command 映射到两个实现模块，本身不含任何逻辑。
 *
 * - /clear、/cls → clearScreen()：只擦可见输出，session 与模型上下文不受影响
 * - /history    → showHistory()：在 overlay 里浏览当前分支的问答
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { showHistory } from "./history.ts";
import { clearScreen } from "./clear-screen.ts";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("clear", {
    description: "Wipe the visible transcript",
    handler: async (_args, ctx) => clearScreen(ctx),
  });
  // pi.registerCommand("cls", {
  //   description: "Alias for /clear",
  //   handler: async (_args, ctx) => clearScreen(ctx),
  // });
  // 只读浏览：不写 session、不发消息，数据在打开时取一次快照。
  pi.registerCommand("history", {
    description:
      "Browse past Q&A history",
    handler: async (_args, ctx) => showHistory(ctx),
  });
}
