import { z } from "zod";

export interface ToolResult {
  content: string;
  metadata?: Record<string, any>;
}

export interface ToolDef<T extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  parameters: T;
  execute: (args: z.infer<T>, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  sessionId: string;
  // Add other context as needed
}

export type ToolRegistry = Record<string, ToolDef<any>>;
