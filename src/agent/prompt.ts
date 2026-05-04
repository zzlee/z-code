import fs from "fs-extra";
import path from "path";

export function loadPrompt(agentName: string): { systemPrompt: string; commandPrompt: string } {
  const sysPromptPath = path.join(process.cwd(), "prompts", `${agentName}.md`);
  const cmdPromptPath = path.join(process.cwd(), "prompts/commands", `${agentName}.md`);

  const readAndStripYaml = (filePath: string): string => {
    const content = fs.readFileSync(filePath, "utf-8");
    const yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
    return content.replace(yamlRegex, "").trim();
  };

  if (!fs.existsSync(sysPromptPath)) {
    throw new Error(`Fatal error: System prompt for agent '${agentName}' not found at ${sysPromptPath}`);
  }

  const systemPrompt = readAndStripYaml(sysPromptPath);

  let commandPrompt = "";
  if (fs.existsSync(cmdPromptPath)) {
    commandPrompt = readAndStripYaml(cmdPromptPath);
  }

  return { systemPrompt, commandPrompt };
}
