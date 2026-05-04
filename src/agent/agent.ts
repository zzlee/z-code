import chalk from "chalk";
import ora from "ora";
import { streamText, generateText, ToolSet, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { Config } from "../config/config.js";
import { saveSession, Messages, Session } from "../session/session.js";

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

function getTools(toolsList: any[], session: Session) {
  return toolsList.reduce((acc, toolDef) => {
    acc[toolDef.id] = tool({
      description: toolDef.description,
      parameters: toolDef.parameters,
      execute: async (args: any) => {
        try {
          const result = await toolDef.execute(args, {
            sessionID: session.id,
            messageID: "",
            agent: "z-code",
          });
          return { content: result };
        } catch (error: any) {
          return {
            content: {
              output: error.message,
              metadata: {},
            },
          };
        }
      },
    } as any);
    return acc;
  }, {} as any);
}

export async function runAgentStreamText(
  config: Config,
  session: Session,
  systemPrompt: string,
  toolsList: any[],
  verbose: number = 0
) {
  let model = getModel(config);
  const tools = getTools(toolsList, session);

  for (let iter = 0;; iter++) {
    const result = await streamText({
      model,
      system: systemPrompt,
      messages: session.messages,
      tools: tools,
    } as any);

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta': {
          process.stdout.write(part.text);
          break;
        }
        case 'text-end': {
          process.stdout.write("\n");
          break;
        }
        case 'reasoning-start': {
          break;
        }
        case 'reasoning-delta': {
          if (verbose === 1) {
            process.stdout.write(chalk.dim(part.text));
          }
          break;
        }
        case 'tool-call': {
          if (verbose === 1) {
            process.stdout.write(chalk.blue(` [${part.toolName}] `));
          }
          break;
        }
        case 'tool-result': {
          if (verbose === 1) {
            process.stdout.write(chalk.green(` [${part.toolName}] `));
          }
         break;
        }
        default:
          // console.log(chalk.yellow(`${part.type}`));
          break;
      }
    }

    let response = await result.response;
    response.messages.forEach((m: any) => {
      session.messages.push(m);
    });

    session.updatedAt = new Date().toISOString();
    await saveSession(session);

    if(await result.finishReason == "stop") {
      break;
    }
  }
}

export async function runAgentGenerateText(
  config: Config,
  session: Session,
  systemPrompt: string,
  toolsList: any[],
  verbose: number = 0
) {
  const model = getModel(config);
  const tools = getTools(toolsList, session);

  for (let iter = 0;; iter++) {
    const result = await generateText({
      model,
      system: systemPrompt,
      messages: session.messages,
      tools: tools,
      maxSteps: 1,
    } as any) as any;

    for (const message of result.response.messages) {
      if (typeof message.content === 'string') {
        console.log(message.content);
      } else {
        for (const part of message.content) {
          switch (part.type) {
            case 'text':
              console.log(part.text);
              break;

            case 'reasoning':
              if (verbose === 1) {
                console.log(chalk.dim(part.text));
              }
              break;

            case 'tool-call':
              if (verbose === 1) {
                console.log(chalk.blue(` [${part.toolName}] `));
              }
              break;

            case 'tool-result':
              if (verbose === 1) {
                console.log(chalk.green(` [${part.toolName}] `));
              }
              break;
          }
        }
      }
    }

    result.response.messages.forEach((m: any) => {
      session.messages.push(m);
    });

    session.updatedAt = new Date().toISOString();
    await saveSession(session);

    if (result.finishReason === "stop") {
      return result.text;
    }
  }
}
