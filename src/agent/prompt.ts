import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseYaml(yamlString: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yamlString.split("\n");
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const key = match[1];
      let value: any = match[2].trim();
      if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
        value = value.slice(1, -1).split(",").map(v => v.trim().replace(/^'|'$/g, "").replace(/^"|"$/g, ""));
      } else if (typeof value === "string") {
        value = value.replace(/^'|'$/g, "").replace(/^"|"$/g, "");
      }
      result[key] = value;
    }
  }
  return result;
}

export function loadPrompt(agentName: string): { agentName: string; systemPrompt: string; commandPrompt: string; tools?: string[] } {
  const cmdPromptPath = path.join(__dirname, "prompts/commands", `${agentName}.md`);
  let commandPrompt = "";
  let metadata: Record<string, any> = {};

  if (fs.existsSync(cmdPromptPath)) {
    const content = fs.readFileSync(cmdPromptPath, "utf-8");
    const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
    const match = content.match(yamlRegex);
    if (match) {
      metadata = parseYaml(match[1]);
      commandPrompt = content.replace(yamlRegex, "").trim();
    } else {
      commandPrompt = content.trim();
    }
  }

  const actualAgentName = metadata.agent || agentName;
  const sysPromptPath = path.join(__dirname, "prompts", `${actualAgentName}.md`);

  if (!fs.existsSync(sysPromptPath)) {
    throw new Error(`Fatal error: System prompt for agent '${actualAgentName}' not found at ${sysPromptPath}`);
  }

  const readAndStripYaml = (filePath: string): string => {
    const content = fs.readFileSync(filePath, "utf-8");
    const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
    return content.replace(yamlRegex, "").trim();
  };

  const systemPrompt = readAndStripYaml(sysPromptPath);

  return { agentName: actualAgentName, systemPrompt, commandPrompt, tools: metadata.tool };
}
