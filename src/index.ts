#!/usr/bin/env node

import { Command } from "commander";
import readline from "readline";
import fs from "fs-extra";
import chalk from "chalk";
import ora from "ora";
import { tool } from "ai";
import { zodToJsonSchema } from "zod-to-json-schema";

import { loadConfig, saveConfig, Config } from "./config/config.js";
import { loadSession, saveSession, createSessionId, listSessions, Messages, Session } from "./session/session.js";
import { runAgentStreamText, runAgentGenerateText } from "./agent/agent.js";
import { loadPrompt } from "./agent/prompt.js";
import { 
  BashTool, 
  ReadTool, 
  WriteTool, 
  GlobTool, 
  EditTool, 
  GrepTool, 
  ApplyPatchTool 
} from "./tools/index.js";

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
    .option("-v, --verbose <level>", "Verbose level (0: text only, 1: full), defaults to 1", "1")
    .argument("[args...]", "Prompt to the agent (starts with /agentName to specify agent, defaults to /code)")
    .action(async (args, options) => {
      const verbose = options.verbose === "1" ? 1 : 0;
      let agentName = "code";
      let argsToProcess = args;
      if (args.length > 0 && args[0].startsWith("/")) {
        agentName = args[0].substring(1);
        argsToProcess = args.slice(1);
      }

      const { agentName: actualAgentName, systemPrompt, commandPrompt, tools: toolFilter } = loadPrompt(agentName);
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
        const toolsList = [
          BashTool,
          ReadTool,
          WriteTool,
          GlobTool,
          EditTool,
          GrepTool,
          ApplyPatchTool,
        ].filter(toolDef => !toolFilter || toolFilter.includes("*") || toolFilter.includes(toolDef.id));

        if (verbose === 1) {
          console.log(chalk.blue(`Agent: ${actualAgentName}`));
          console.log(chalk.blue(`Tools: ${toolsList.map(t => t.id).join(", ")}`));
        }

        const tools = toolsList.reduce((acc, toolDef) => {
          acc[toolDef.id] = tool({
            description: toolDef.description,
            parameters: toolDef.parameters,
            execute: async (args: any) => {
              // console.log(`DEBUG: ${JSON.stringify(args)}`);

              try {
                const result = await toolDef.execute(args, {
                  sessionID: session!.id,
                  messageID: "",
                  agent: "z-code"
                });

                return { content: result };
              } catch (error: any) {
                // console.error(chalk.red(`\nError: ${error.message}`));

                return { content: {
                  output: error.message,
                  metadata: {},
                } };
              }
            },
          } as any);
          return acc;
        }, {} as any);

        await runAgentGenerateText(config, session, systemPrompt, tools, verbose);
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
