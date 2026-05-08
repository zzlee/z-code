import z from "zod";
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import type { ToolDef, ToolContext, ExecuteResult } from "./types.js";

const execPromise = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const Parameters = z.object({
  command: z.string().describe("The command to execute"),
  timeout: z.number().describe("Optional timeout in milliseconds").optional(),
  description: z
    .string()
    .describe("Clear, concise description of what this command does"),
});

function loadDescription() {
  try {
    let desc = fs.readFileSync(path.join(__dirname, "bash.txt"), "utf8");
    return desc;
  } catch (e) {
    return "Execute a bash command in the system shell";
  }
}

export const ExecuteBashTool: ToolDef<typeof Parameters> = {
  id: "execute_bash",
  description: loadDescription(),
  parameters: Parameters,
  async execute(params, ctx) {
    if (! params.command) {
      throw new Error("command is required.");
    }

    try {
      const { stdout, stderr } = await execPromise(params.command, { timeout: params.timeout });
      return {
        title: params.description,
        output: stdout,
        metadata: {
          exit: 0,
          stderr: stderr
        },
      };
    } catch (error: any) {
      return {
        title: params.description,
        output: error.message,
        metadata: {
          exit: error.code,
          stdout: error.stdout || '',
          stderr: error.stderr || ''
        },
      };
    }
  },
};
