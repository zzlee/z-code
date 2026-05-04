export * from "./types.js";
export * from "./registry.js";
import { ReadTool } from "./read.js";
export { ReadTool };
import { BashTool } from "./bash.js";
export { BashTool };
import { GlobTool } from "./glob.js";
export { GlobTool };
import { EditTool } from "./edit.js";
export { EditTool };
import { GrepTool } from "./grep.js";
export { GrepTool };
import { WriteTool } from "./write.js";
export { WriteTool };
import { LoadSkillTool } from "./load_skill.js";
export { LoadSkillTool };

export function getToolsList(toolFilter?: string[]) {
  const toolsList = [
    BashTool,
    ReadTool,
    WriteTool,
    GlobTool,
    EditTool,
    GrepTool,
    LoadSkillTool
  ].filter(toolDef => !toolFilter || toolFilter.includes("*") || toolFilter.includes(toolDef.id));

  return toolsList;
}
