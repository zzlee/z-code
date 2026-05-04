import fs from "fs-extra";
import path from "path";
import os from "os";
import { z } from "zod";
import {
  systemModelMessageSchema,
  userModelMessageSchema,
  assistantModelMessageSchema,
  toolModelMessageSchema
} from 'ai';

const SESSIONS_DIR = path.join(process.cwd(), ".z-code", "sessions");

export const MessagesSchema = z.array(
  z.union([
    systemModelMessageSchema,
    userModelMessageSchema,
    assistantModelMessageSchema,
    toolModelMessageSchema
  ])
);

export type Messages = z.infer<typeof MessagesSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  messages: MessagesSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Session = z.infer<typeof SessionSchema>;

export async function ensureSessionsDir(): Promise<void> {
  await fs.ensureDir(SESSIONS_DIR);
}

export async function saveSession(session: Session): Promise<void> {
  await ensureSessionsDir();
  const filePath = path.join(SESSIONS_DIR, `${session.id}.json`);
  await fs.writeJson(filePath, session, { spaces: 2 });
}

export async function loadSession(sessionId: string): Promise<Session | null> {
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  try {
    if (await fs.pathExists(filePath)) {
      const data = await fs.readJson(filePath);
      return SessionSchema.parse(data);
    }
  } catch (error) {
    console.error(`Error loading session ${sessionId}:`, error);
  }
  return null;
}

export async function listSessions(): Promise<Session[]> {
  await ensureSessionsDir();
  const files = await fs.readdir(SESSIONS_DIR);
  const sessions = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        const id = path.basename(f, ".json");
        return loadSession(id);
      })
  );
  return sessions.filter((s): s is Session => s !== null);
}

export function createSessionId(): string {
   return Math.random().toString(36).substring(2, 15);
 }

export async function deleteSession(sessionId: string): Promise<boolean> {
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  if (await fs.pathExists(filePath)) {
    await fs.remove(filePath);
    return true;
  }
  return false;
}

export async function deleteAllSessions(): Promise<void> {
  await fs.remove(SESSIONS_DIR);
  await ensureSessionsDir();
}

export function formatSessionToMarkdown(session: Session): string {
  let markdown = `# Session ${session.id}\n`;
  markdown += `Created: ${new Date(session.createdAt).toLocaleString()}\n`;
  markdown += `Updated: ${new Date(session.updatedAt).toLocaleString()}\n\n---\n\n`;

  session.messages.forEach((m) => {
    switch (m.role) {
      case "system":
        markdown += `### ⚙️ System\n${m.content}\n\n`;
        break;
      case "user":
        markdown += `### 👤 User\n`;
        if (Array.isArray(m.content)) {
          m.content.forEach((part: any) => {
            if (part.type === "text") {
              markdown += `${part.text}\n\n`;
            }
          });
        } else {
          markdown += `**💬 Response**${m.content}\n\n`;
        }
        break;
      case "assistant":
        markdown += `### 🤖 Assistant\n`;
        if (Array.isArray(m.content)) {
          m.content.forEach((part: any) => {
            if (part.type === "text") {
              markdown += `**💬 Response**\n${part.text}\n\n`;
            } else if (part.type === "reasoning") {
              markdown += `**💭 Thoughts**\n${part.text}\n\n`;
            } else if (part.type === "tool-call") {
              markdown += `**🛠️ Tool Call**: \`${part.toolName}(${JSON.stringify(part.input)})\`\n\n`;
            }
          });
        } else {
          markdown += `**💬 Response**\n${m.content}\n\n`;
        }
        break;
      case "tool":
        if (Array.isArray(m.content)) {
          m.content.forEach((part: any) => {
            if (part.type === "tool-result") {
              markdown += `**⚙️ Tool Result**: ${part.toolName}\n\`\`\`json\n${JSON.stringify(part.output.value.content)}\n\`\`\`\n\n`;
            }
          });
        } else {
          markdown += `**⚙️ Tool Result**\n${m.content}\n\n`;
        }
        break;
    }
  });

  return markdown;
}
