#!/usr/bin/env node

import { Command } from "commander";
import readline from "readline";
import fs from "fs-extra";
import chalk from "chalk";
import ora from "ora";
import { zodToJsonSchema } from "zod-to-json-schema";

import { loadConfig, saveConfig, Config } from "./config/config.js";
import { loadSession, saveSession, createSessionId, listSessions, deleteSession, deleteAllSessions, Messages, Session, formatSessionToMarkdown } from "./session/session.js";
import { runAgentStreamText, runAgentGenerateText } from "./agent/agent.js";
import { loadPrompt, listSkills, loadSkill } from "./agent/prompt.js";
import { getToolsList } from "./tools/index.js";

const program = new Command();

async function main() {
  program
    .name("z-code")
    .description("AI Coding agent CLI")
    .version("0.1.0");

  program.allowUnknownOption(false);

  program
    .option("-c, --continue", "Continue from the latest session")
    .option("-s, --session <id>", "Session ID to resume")
    .option("-f, --fork", "Fork the session")
    .option("-g, --generate", "Use runAgentGenerateText instead of runAgentStreamText")
    .option("-v, --verbose <level>", "Verbose level (0: text only, 1: full), defaults to 1", "1")
    .option("--list-sessions", "List all sessions")
    .option("--delete-all-sessions", "Delete all sessions")
    .option("--delete-session <id>", "Delete a specific session")
    .option("--list-skills", "List all available skills")
    .option("--show-skill <name>", "Show details of a specific skill")
    .option("--show-session [id]", "Display session history in markdown format")
    .option("--load-skill <name>", "Load a skill", (val, prev: string[]) => prev.concat([val]), [])
    .argument("[args...]", "Prompt to the agent (starts with /agentName to specify agent, defaults to /code)")
    .action(async (args, options) => {
       const verbose = options.verbose === "1" ? 1 : 0;

      if (options.listSessions) {
        const sessions = await listSessions();
        if (sessions.length === 0) {
          console.log(chalk.yellow("No sessions found."));
        } else {
          console.log(chalk.blue("Sessions:"));
          sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          sessions.forEach(s => {
            console.log(`${chalk.white(s.id)} - Created: ${new Date(s.createdAt).toLocaleString()} - Updated: ${new Date(s.updatedAt).toLocaleString()}`);
          });
        }
        process.exit(0);
      }

      if (options.deleteAllSessions) {
        await deleteAllSessions();
        console.log(chalk.green("All sessions deleted."));
        process.exit(0);
      }

      if (options.deleteSession) {
        const deleted = await deleteSession(options.deleteSession);
        if (deleted) {
          console.log(chalk.green(`Session ${options.deleteSession} deleted.`));
        } else {
          console.error(chalk.red(`Session ${options.deleteSession} not found.`));
        }
        process.exit(0);
      }

      if (options.listSkills) {
        const skills = await listSkills();
        if (skills.length === 0) {
          console.log(chalk.yellow("No skills found."));
        } else {
          console.log(chalk.blue("Available skills:"));
          skills.forEach(s => {
            let description = s.description || "";
            if (description.length > 50) {
              description = description.substring(0, 50) + "...";
            }
            console.log(`${chalk.bold.cyan(s.name)} ${description ? `- ${description}` : ""}`);
          });
        }
        process.exit(0);
      }

      if (options.showSkill) {
        try {
          const skill = await loadSkill(options.showSkill);
          console.log(`${chalk.bold.cyan(skill.name)}`);
          if (skill.description) {
            console.log(`\n${chalk.white("Description:")}\n${skill.description}`);
          }
          if (skill.body) {
            console.log(`\n${chalk.white("Body:")}\n${skill.body}`);
          }
        } catch (error: any) {
          console.error(chalk.red(error.message));
        }
        process.exit(0);
      }

      if (options.showSession) {
        let sessionId = options.showSession;
        if (sessionId === true) {
          const sessions = await listSessions();
          if (sessions.length === 0) {
            console.log(chalk.yellow("No sessions found."));
            process.exit(0);
          }
          sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          sessionId = sessions[0].id;
        }

        const session = await loadSession(sessionId);
        if (session) {
          console.log(formatSessionToMarkdown(session));
        } else {
          console.error(chalk.red(`Session ${sessionId} not found.`));
          process.exit(1);
        }
        process.exit(0);
      }

       let agentName = "code";
       let argsToProcess = args;
       if (args.length > 0 && args[0].startsWith("/")) {
         agentName = args[0].substring(1);
         argsToProcess = args.slice(1);
       }

       let { agentName: actualAgentName, systemPrompt, commandPrompt, tools: toolFilter } = loadPrompt(agentName);

       if (options.loadSkill && options.loadSkill.length > 0) {
         let skillSnippets = "\n\n# Loaded Skills\n";
         for (const skillName of options.loadSkill) {
           try {
             const skill = await loadSkill(skillName);
             skillSnippets += `<skill>\n  <name>${skill.name}</name>\n  <description>${skill.description || ""}</description>\n</skill>\n`;
           } catch (error: any) {
             console.error(chalk.red(`Fatal error: ${error.message}`));
             process.exit(1);
           }
         }
         systemPrompt += skillSnippets;
       }

       let userPrompt = argsToProcess.join(" ").trim();

       const finalUserPrompt = commandPrompt ? commandPrompt + "\n\n" + userPrompt : userPrompt;

       const config = await loadConfig();
       if (!config) {
         console.error(chalk.red("Please configure z-code first using 'z-code config'"));
         process.exit(1);
       }

       let session: Session | null = null;
       let isContinuing = false;

       if (options.session) {
         session = await loadSession(options.session);
         if (!session) {
           console.error(chalk.red(`Session ${options.session} not found.`));
           process.exit(1);
         }
         isContinuing = true;
       } else if (options.continue) {
         const sessions = await listSessions();
         if (sessions.length > 0) {
           // Find latest session
           sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
           session = sessions[0];
           isContinuing = true;
           if (verbose === 1) {
             console.log(chalk.blue(`Resuming latest session: ${session.id}`));
           }
         } else {
           if (verbose === 1) {
             console.log(chalk.yellow("No previous session found to continue. Starting a new session."));
           }
         }
       }

       if (session && options.fork) {
         const oldId = session.id;
         session = {
           id: createSessionId(),
           messages: [...session.messages],
           createdAt: new Date().toISOString(),
           updatedAt: new Date().toISOString(),
         };
           if (verbose === 1) {
             console.log(chalk.blue(`Forked session ${oldId} -> new session ${session.id}`));
           }
       } else if (!session) {
         session = {
           id: createSessionId(),
           messages: [],
           createdAt: new Date().toISOString(),
           updatedAt: new Date().toISOString(),
         };
       }

       if (verbose === 1) {
         console.log(chalk.blue(`Session ID: ${session.id}`));
       }

       if (finalUserPrompt.trim() !== "") {
         session.messages.push({ role: "user", content: [ { type: "text", text: finalUserPrompt } ] });
       } else if (!isContinuing && session.messages.length === 0) {
         console.log(chalk.yellow("No prompt provided."));
         process.exit(0);
       }

       try {
         const toolsList = getToolsList(toolFilter);

         if (verbose === 1) {
           console.log(chalk.blue(`Agent: ${actualAgentName}`));
           console.log(chalk.blue(`Tools: ${toolsList.map(t => t.id).join(", ")}`));
         }

         if (options.generate) {
           await runAgentGenerateText(config, session, systemPrompt, toolsList, verbose);
         } else {
           await runAgentStreamText(config, session, systemPrompt, toolsList, verbose);
         }
       } catch (error: any) {
         console.error(chalk.red(`\nError: ${error.message}`));
       }
     });

   program.parse();
}

main().catch((error) => {
  console.error(chalk.red("Fatal error:"), error);
  process.exit(1);
});
