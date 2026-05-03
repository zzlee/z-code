import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs-extra";
import { ToolDef, ToolResult } from "./tool.js";

const execPromise = promisify(exec);

export const BashTool: ToolDef<z.ZodObject<{ command: z.ZodString }>> = {
  name: "bash",
  description: "Execute a bash command in the current directory",
  parameters: z.object({ command: z.string() }),
  async execute(args, context) {
    const { command } = args as { command: string };
    try {
      const { stdout, stderr } = await execPromise(command);
      return { content: stdout || stderr || "Command executed successfully." };
    } catch (error: any) {
      return { content: error.message || "An error occurred while executing the command." };
    }
  },
};

export const ReadTool: ToolDef<z.ZodObject<{ path: z.ZodString }>> = {
  name: "read",
  description: "Read a file from the filesystem",
  parameters: z.object({ path: z.string() }),
  async execute(args, context) {
    const { path } = args as { path: string };
    try {
      const content = await fs.readFile(path, "utf-8");
      return { content: content };
    } catch (error: any) {
      return { content: `Error reading file: ${error.message}` };
    }
  },
};

export const WriteTool: ToolDef<z.ZodObject<{ path: z.ZodString; content: z.ZodString }>> = {
  name: "write",
  description: "Write content to a file",
  parameters: z.object({ path: z.string(), content: z.string() }),
  async execute(args, context) {
    const { path, content } = args as { path: string; content: string };
    try {
      await fs.ensureDir(require('path').dirname(path));
      await fs.writeFile(path, content, "utf-8");
      return { content: `Successfully wrote to ${path}` };
    } catch (error: any) {
      return { content: `Error writing file: ${error.message}` };
    }
  },
};

export const BuiltinTools = {
  [BashTool.name]: BashTool,
  [ReadTool.name]: ReadTool,
  [WriteTool.name]: WriteTool,
};
