import { Command } from "commander";
import readline from "readline";
import fs from "fs-extra";
import chalk from "chalk";
import ora from "ora";

import { loadConfig, saveConfig, Config } from "./config/config.js";
import { loadSession, saveSession, createSessionId, listSessions, Messages, Session } from "./session/session.js";
import { runAgentStreamText } from "./agent/agent.js";
import { BuiltinTools } from "./tool/builtin.js";

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
    .command("chat")
    .description("Start a chat session")
    .option("-s, --session <id>", "Session ID to resume")
    .action(async (options) => {
      const config = await loadConfig();
      if (!config) {
        console.error(chalk.red("Please configure z-code first using 'z-code config'"));
        process.exit(1);
      }

      let session: Session;
      if (options.session) {
        const loaded = await loadSession(options.session);
        if (!loaded) {
          console.error(chalk.red(`Session ${options.session} not found.`));
          process.exit(1);
        }
        session = loaded;
      } else {
        session = {
          id: createSessionId(),
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      console.log(chalk.blue(`Session ID: ${session.id}`));

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const ask = () => {
        rl.question(chalk.green("user > "), async (input) => {
          if (input.toLowerCase() === "exit") {
            rl.close();
            return;
          }

          session.messages.push({ role: "user", content: [ { type: "text", text: input } ] });

          try {
            const systemPrompt = "You are z-code, an AI coding agent. You can use tools to help the user.";
            await runAgentStreamText(config, session, systemPrompt, BuiltinTools);

            ask();
          } catch (error: any) {
            console.error(chalk.red(`\nError: ${error.message}`));
          }
        });
      };

      ask();
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

  program.parse();
}

main().catch((error) => {
  console.error(chalk.red("Fatal error:"), error);
  process.exit(1);
});
