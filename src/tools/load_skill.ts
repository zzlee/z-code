import z from "zod";
import { ToolDef, ExecuteResult } from "./types.js";
import { loadSkill } from "../agent/prompt.js";

const parameters = z.object({
  skillName: z.string().describe("The name of the skill to load (as listed in the system prompt)"),
});

export const LoadSkillTool: ToolDef<typeof parameters> = {
  id: "load_skill",
  description: "Retrieve the full instructions for a specific skill. Use this when you have identified a skill from the available skills list that is necessary to complete the task.",
  parameters,
  async execute(params, ctx) {
    if (!params.skillName) throw new Error("skillName is required");

    try {
      const skill = await loadSkill(params.skillName);
      return {
        title: `Loaded Skill: ${skill.name}`,
        metadata: { skillName: skill.name },
        output: `Instructions for skill '${skill.name}':\n\n${skill.body}`,
      };
    } catch (error: any) {
      return {
        title: "Error Loading Skill",
        metadata: { error: true },
        output: `Failed to load skill '${params.skillName}': ${error.message}`,
      };
    }
  },
};
