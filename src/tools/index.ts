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
import { ApplyPatchTool } from "./apply_patch.js";
export { ApplyPatchTool };
import { WebSearchTool } from "./web_search.js";
export { WebSearchTool };
import { WebFetchTool } from "./web_fetch.js";
export { WebFetchTool };
import { ExecuteBashTool } from "./execute_bash.js";
export { ExecuteBashTool };

export function getToolsList(toolFilter?: string[]) {
  const allTools = [
    BashTool,
    ReadTool,
    WriteTool,
    ApplyPatchTool,
    GlobTool,
    EditTool,
    GrepTool,
    LoadSkillTool,
    WebSearchTool,
    WebFetchTool,
    ExecuteBashTool
  ];

  const fileTools = [
    ReadTool,
    WriteTool,
    EditTool
  ];

  const bashTools = [
    BashTool,
    GlobTool,
    GrepTool
  ];

  const webTools = [
    WebSearchTool,
    WebFetchTool
  ];

  const basicTools = [
    ...fileTools,
    ...bashTools
  ];

  const basicWithWebTools = [
    ...basicTools,
    ...webTools
  ];

  const basicWithSkillTools = [
    ...basicTools,
    LoadSkillTool
  ];

  const bashOnlyTools = [
    ExecuteBashTool,
    LoadSkillTool
  ];

  if(! toolFilter || toolFilter.includes('*')) {
    return basicWithSkillTools;
  } else {
    return allTools.filter(toolDef => toolFilter.includes(toolDef.id));
  }
}
