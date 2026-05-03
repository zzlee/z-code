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
