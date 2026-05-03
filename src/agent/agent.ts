import chalk from "chalk";
import ora from "ora";
import { streamText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Config } from "../config/config.js";
import { saveSession, Messages, Session } from "../session/session.js";
import { ToolRegistry, ToolDef } from "../tool/tool.js";

function getModel(
  config: Config) {
  const providerName = config.default_provider;
  const providerConfig = config.providers[providerName];

  if (!providerConfig) {
    throw new Error(`Provider ${providerName} not found in config`);
  }

  let model;

  if (providerConfig.provider === "google") {
    const google = createGoogleGenerativeAI({
      apiKey: providerConfig.apiKey,
    });
    model = google(providerConfig.model);
  } else {
    const provider = createOpenAI({
      apiKey: providerConfig.apiKey,
      baseURL: providerConfig.baseUrl,
    });
    model = provider(providerConfig.model);
  }

  return model;
}

function getTools(
  session: Session,
  toolsRegistry: ToolRegistry
) {
  // Convert our ToolRegistry to Vercel AI SDK tool format
  const tools = Object.entries(toolsRegistry).reduce((acc, [name, def]) => {
    const toolDef = def as ToolDef<any>;
    acc[name] = tool({
      description: toolDef.description,
      parameters: toolDef.parameters,
      execute: async (args: any) => {
        const result = await toolDef.execute(args, { sessionId: session.id });
        return { content: result };
      },
    } as any);
    return acc;
  }, {} as any);

  return tools;
}

// function runAgent(
//   config: Config,
//   session: Session,
//   toolsRegistry: ToolRegistry = BuiltinTools
// ) {
//   const providerName = config.default_provider;
//   const providerConfig = config.providers[providerName];

//   if (!providerConfig) {
//     throw new Error(`Provider ${providerName} not found in config`);
//   }

//   let model;

//   if (providerConfig.provider === "google") {
//     const google = createGoogleGenerativeAI({
//       apiKey: providerConfig.apiKey,
//     });
//     model = google(providerConfig.model);
//   } else {
//     const provider = createOpenAI({
//       apiKey: providerConfig.apiKey,
//       baseURL: providerConfig.baseUrl,
//     });
//     model = provider(providerConfig.model);
//   }

//   // Convert our ToolRegistry to Vercel AI SDK tool format
//   const tools = Object.entries(toolsRegistry).reduce((acc, [name, def]) => {
//     const toolDef = def as ToolDef<any>;
//     acc[name] = tool({
//       description: toolDef.description,
//       parameters: toolDef.parameters,
//       execute: async (args: any) => {
//         const result = await toolDef.execute(args, { sessionId: session.id });
//         return { content: result };
//       },
//     } as any);
//     return acc;
//   }, {} as any);

//   return model, tools;

//   const result = await streamText({
//     model,
//     system: "You are z-code, an AI coding agent. You can use tools to help the user.",
//     messages: session.messages,
//     tools: tools,
//   } as any);

//   return result;
// }

export async function runAgentStreamText(
  config: Config,
  session: Session,
  systemPrompt: string,
  toolsRegistry: ToolRegistry
) {
  let model = getModel(config);
  console.log(`DEBUG: ${model}\n`);
  let tools = getTools(session, toolsRegistry);
  console.log(`DEBUG: ${tools}\n`);

  for (let iter = 0;; iter++) {
    let messages: Messages = [];
    const result = await streamText({
      model,
      system: systemPrompt,
      messages: session.messages,
      tools: tools,
    } as any);

    console.log(`DEBUG: ${iter} ${result}\n`);

    let finishPart = null;
    let fullText = "";
    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'start': {
          break;
        }
        case 'start-step': {
          break;
        }
        case 'text-start': {
          fullText = "";
          break;
        }
        case 'text-delta': {
          fullText += part.text;
          process.stdout.write(part.text);
          break;
        }
        case 'text-end': {
          messages.push({ role: "assistant", content: [ {
            type: "text",
            text: fullText
          } ] });
          break;
        }
        case 'reasoning-start': {
          fullText = "";
          break;
        }
        case 'reasoning-delta': {
          fullText += part.text;
          process.stdout.write(chalk.gray(part.text));
          break;
        }
        case 'reasoning-end': {
          messages.push({ role: "assistant", content: [ {
            type: 'reasoning',
            text: fullText
          } ] });
          process.stdout.write("\n");
          break;
        }
        case 'source': {
          break;
        }
        case 'file': {
          break;
        }
        case 'tool-call': {
          messages.push({ role: "assistant", content: [ {
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input
          } ] });
          break;
        }
        case 'tool-input-start': {
          // console.log(chalk.yellow(`${JSON.stringify(part)}`));
          break;
        }
        case 'tool-input-delta': {
          // console.log(chalk.yellow(`${JSON.stringify(part)}`));
          break;
        }
        case 'tool-input-end': {
          // console.log(chalk.yellow(`${JSON.stringify(part)}`));
          break;
        }
        case 'tool-result': {
          // console.log(chalk.yellow(`${JSON.stringify(part)}`));
          messages.push({ role: "tool", content: [ {
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: { type: "json", value: part.output.content }
          } ] });
         break;
        }
        case 'tool-error': {
          console.log(chalk.red(`${part}`));
          break;
        }
        case 'finish-step': {
          break;
        }
        case 'finish': {
          finishPart = part;
          break;
        }
        case 'error': {
          console.log(chalk.red(`${part}`));
          break;
        }
        case 'raw': {
          break;
        }
      }
    }

    if(! finishPart) {
      console.error("unexpected, missing finishPart\n");
      break;
    }

    messages.forEach((m) => {
      session.messages.push(m);
    });

    session.updatedAt = new Date().toISOString();
    await saveSession(session);

    if(finishPart.finishReason == "stop") {
      break;
    }
  }
}