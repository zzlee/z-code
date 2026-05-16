import z from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolDef } from "./types.js";
import { loadSession, saveSession, type Session, type Messages } from "../session/session.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_KEEP_LAST_MESSAGES = 6;
const MAX_KEEP_LAST_MESSAGES = 50;

const parameters = z.object({
  summary: z.string().min(1).describe("A dense, self-contained summary of the chat history being compacted."),
  keepLastMessages: z.coerce.number().int().min(0).max(MAX_KEEP_LAST_MESSAGES).optional().describe("How many most-recent messages to keep verbatim after the summary. Defaults to 6."),
});

function loadDescription() {
  try {
    return fs.readFileSync(path.join(__dirname, "chat_history_compact.txt"), "utf8");
  } catch (e) {
    return "Compact the current chat history by replacing older messages with a summary.";
  }
}

function getSessionFromContextSession(value: unknown): Session | null {
  const candidate = value as Session | undefined;
  if (!candidate || typeof candidate !== "object") return null;
  if (typeof candidate.id !== "string" || !Array.isArray(candidate.messages)) return null;
  return candidate;
}

function findSafeKeepStart(messages: Messages, requestedKeepLast: number) {
  let keepStart = Math.max(0, messages.length - requestedKeepLast);

  while (keepStart > 0 && messages[keepStart]?.role === "tool") {
    keepStart -= 1;
  }

  return keepStart;
}

export const ChatHistoryCompactTool: ToolDef<typeof parameters> = {
  id: "chat_history_compact",
  description: loadDescription(),
  parameters,
  async execute(params, ctx) {
    const session = getSessionFromContextSession(ctx.extra?.session) ?? await loadSession(ctx.sessionID);
    if (!session) {
      throw new Error(`Session ${ctx.sessionID} not found`);
    }

    const keepLastMessages = params.keepLastMessages ?? DEFAULT_KEEP_LAST_MESSAGES;
    const keepStart = findSafeKeepStart(session.messages, keepLastMessages);
    const removedMessages = session.messages.slice(0, keepStart).length;

    if (removedMessages === 0) {
      return {
        title: "Chat history compacted",
        output: "No messages were compacted because the session history is already within the requested keep window.",
        metadata: {
          compacted: false,
          removedMessages,
          keptMessages: session.messages.length,
          keepLastMessages,
        },
      };
    }

    const compactMessage = {
      role: "user" as const,
      content: [
        {
          type: "text" as const,
          text: [
            "<chat_history_compaction>",
            "The earlier chat history was compacted. Use this summary as authoritative context for prior turns:",
            params.summary.trim(),
            "</chat_history_compaction>",
          ].join("\n"),
        },
      ],
    };

    const keptMessages = session.messages.slice(keepStart);
    session.messages.splice(0, session.messages.length, compactMessage, ...keptMessages);
    session.updatedAt = new Date().toISOString();
    await saveSession(session);

    return {
      title: "Chat history compacted",
      output: `Compacted ${removedMessages} older messages into a summary and kept ${keptMessages.length} recent messages verbatim.`,
      metadata: {
        compacted: true,
        removedMessages,
        keptMessages: keptMessages.length,
        keepLastMessages,
      },
    };
  },
};
