import * as os from "node:os";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __yamlRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

export interface SkillData {
  metadata: any;
  body: string;
}

export interface Skill {
  name: string;
  description?: string;
  body: string;
  dir: string;
}

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
    const match = content.match(__yamlRegex);
    if (match) {
      metadata = parseYaml(match[1]);
      commandPrompt = content.replace(__yamlRegex, "").trim();
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
    return content.replace(__yamlRegex, "").trim();
  };

  const systemPrompt = readAndStripYaml(sysPromptPath);

  return { agentName: actualAgentName, systemPrompt, commandPrompt, tools: metadata.tool };
}

export async function loadSkillData(filePath: string): Promise<SkillData> {
  const content = await fs.readFile(filePath, "utf8");
  const match = content.match(__yamlRegex);
  if (match) {
    return { metadata: parseYaml(match[1]), body: content.replace(__yamlRegex, "").trim() };
  } else {
    return { metadata: {}, body: content.trim() };
  }
}

export async function loadSkill(skillPathOrName: string): Promise<Skill> {
  const candidates: string[] = [];

  // console.log(`skillPathOrName=${skillPathOrName}`);

  if (path.isAbsolute(skillPathOrName)) {
    candidates.push(skillPathOrName);
  } else {
    // 1. Local Project: skills/<name>/SKILL.md
    candidates.push(path.join(process.cwd(), "skills", skillPathOrName));
    // 2. Local Project: <name>/SKILL.md
    candidates.push(path.join(process.cwd(), skillPathOrName));
    // 3. Global Config: ~/.config/z-code/skills/<name>/SKILL.md
    candidates.push(path.join(os.homedir(), ".config", "z-code", "skills", skillPathOrName));
  }

    for (const candidate of candidates) {
      try {
        const stats = await fs.stat(candidate);
        if (stats.isDirectory()) {
          const skillFile = path.join(candidate, "SKILL.md");
          try {
            await fs.access(skillFile);
            const { metadata, body } = await loadSkillData(skillFile);
            return { name: metadata.name || skillPathOrName, description: metadata.description, body, dir: candidate };
          } catch {
            // Directory exists but SKILL.md doesn't
          }
        } else if (stats.isFile()) {
          const { metadata, body } = await loadSkillData(candidate);
          return { name: metadata.name || skillPathOrName, description: metadata.description, body, dir: path.dirname(candidate) };
        }
      } catch {
        // Candidate path doesn't exist
      }
    }

  throw new Error(
    `Failed to locate skill '${skillPathOrName}'. Checked paths:\n` +
    candidates.map(c => `- ${c}`).join("\n")
  );
}

export async function listSkills(): Promise<Skill[]> {
  const searchDirs = [
    path.join(process.cwd(), "skills"),
    path.join(os.homedir(), ".config", "z-code", "skills"),
  ];

  const skillsMap = new Map<string, Skill>();

  for (const dir of searchDirs) {
    try {
      const entries = await fs.readdir(dir);
      for (const entry of entries) {
        try {
          const skill = await loadSkill(entry);
          skillsMap.set(skill.name, skill);
        } catch {
          // Skip entries that aren't valid skills
        }
      }
    } catch {
      // Skip directories that don't exist
    }
  }

  return Array.from(skillsMap.values());
}
