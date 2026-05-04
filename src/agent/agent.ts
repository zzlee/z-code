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


    let messages: Messages = [];
    const result = await streamText({
      model,
      system: systemPrompt,
      messages: session.messages,
      tools: tools,
    } as any);

    let finishPart = null;
    let fullText = "";
    for await (const part of result.fullStream) {
      // console.log(chalk.yellow(`${JSON.stringify(part)}`));

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
          process.stdout.write("\n");
          break;
        }
        case 'reasoning-start': {
          fullText = "";
          break;
        }
        case 'reasoning-delta': {
          fullText += part.text;
          if (verbose === 1) {
            process.stdout.write(chalk.gray(part.text));
          }
          break;
        }
        case 'reasoning-end': {
          messages.push({ role: "assistant", content: [ {
            type: 'reasoning',
            text: fullText
          } ] });
          if (verbose === 1) {
            process.stdout.write("\n");
          }
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
          break;
        }
        case 'tool-input-delta': {
          break;
        }
        case 'tool-input-end': {
          break;
        }
        case 'tool-result': {
          messages.push({ role: "tool", content: [ {
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: { type: "json", value: part.output }
          } ] });
         break;
        }
        case 'tool-error': {
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
          break;
        }
        case 'raw': {
          break;
        }
      }
    }

    if(! finishPart) {
      console.error(chalk.red("unexpected, missing finishPart"));
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
      // Content can be a string or an array of parts
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
                console.log(chalk.gray(part.text));
              }
              break;

            case 'tool-call':
              if (verbose === 1) {
                console.log(chalk.blue(`Executing ${part.toolName}...`));
              }
              break;

            case 'tool-result':
              if (verbose === 1) {
                console.log(chalk.blue(`Executed ${part.toolName}.`));
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
