import { Command } from "commander";
import readline from "readline";
import fs from "fs-extra";
import chalk from "chalk";
import ora from "ora";
import { tool } from "ai";
import { zodToJsonSchema } from "zod-to-json-schema";

import { loadConfig, saveConfig, Config } from "./config/config.js";
import { loadSession, saveSession, createSessionId, listSessions, Messages, Session } from "./session/session.js";
import { runAgentStreamText } from "./agent/agent.js";
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
    .description("AI Coding agent CLI tool")
    .version("0.1.0");

  program
    .command("config")
    .description("Configure z-code")
    .option("-p, --provider <name>", "Provider name")
    .option("-k, --key <key>", "API Key")
    .option("-m, --model <model>", "Model name")
    .option("-u, --url <url>", "Base URL")
    .action(async (options) => {
      const config: Config = {
        default_provider: options.provider || "openai",
        streaming: true,
        providers: {
          [options.provider || "openai"]: {
            provider: "openai",
            apiKey: options.key || "",
            model: options.model || "gpt-4o",
            baseUrl: options.url,
          },
        },
      };
      await saveConfig(config);
      console.log(chalk.green("Configuration saved successfully."));
    });



  program
    .command("session <id>")
    .description("Show the content of a session")
    .action(async (id) => {
      const session = await loadSession(id);
      if (!session) {
        console.error(chalk.red(`Session ${id} not found.`));
        process.exit(1);
      }

      console.log(chalk.blue(`Session: ${session.id} (Created: ${new Date(session.createdAt).toLocaleString()})\n`));

      // session.messages.forEach((m) => {
      //   const roleColor = m.role === "user" ? chalk.green : chalk.cyan;
      //   const roleLabel = m.role === "user" ? "user" : "z-code";
      //   console.log(`${roleColor(roleLabel + " > ")}${m.content}\n`);
      // });
    });

  program
    .command("sessions")
    .description("List all sessions")
    .action(async () => {
      const sessions = await listSessions();
      if (sessions.length === 0) {
        console.log("No sessions found.");
        return;
      }
      console.log(chalk.blue("Sessions:"));
      sessions.forEach((s: Session) => {
        const date = new Date(s.createdAt).toLocaleString();
        console.log(`- ${s.id} (${date})`);
      });
    });


  program.allowUnknownOption(false);

  program
    .option("-c, --continue", "Continue from the latest session")
    .option("-s, --session <id>", "Session ID to resume")
    .option("-f, --fork", "Fork the session")
    .argument("[args...]", "Positional arguments")
    .action(async (args, options) => {
      let agentName = "code";
      let argsToProcess = args;
      if (args.length > 0 && args[0].startsWith("/")) {
        agentName = args[0].substring(1);
        argsToProcess = args.slice(1);
      }

      const { systemPrompt, commandPrompt } = loadPrompt(agentName);
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
          console.log(chalk.blue(`Resuming latest session: ${session.id}`));
        } else {
          console.log(chalk.yellow("No previous session found to continue. Starting a new session."));
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
        console.log(chalk.blue(`Forked session ${oldId} -> new session ${session.id}`));
      } else if (!session) {
        session = {
          id: createSessionId(),
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      console.log(chalk.blue(`Session ID: ${session.id}`));

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
        ];
        const tools = toolsList.reduce((acc, toolDef) => {
          acc[toolDef.id] = tool({
            description: toolDef.description,
            parameters: toolDef.parameters,
            execute: async (args: any) => {
              console.log(`DEBUG: ${JSON.stringify(args)}`);

              const result = await toolDef.execute(args, {
                sessionID: session!.id,
                messageID: "",
                agent: "z-code"
              });

              return { content: result };
            },
          } as any);
          return acc;
        }, {} as any);


        await runAgentStreamText(config, session, systemPrompt, tools);
        await saveSession(session);

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
