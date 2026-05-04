import chalk from "chalk";
import ora from "ora";
import { streamText, generateText, ToolSet } from "ai";
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

export async function runAgentStreamText(
  config: Config,
  session: Session,
  systemPrompt: string,
  tools: ToolSet,
  verbose: number
) {
  let model = getModel(config);

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
  tools: ToolSet,
  verbose: number
) {
  const model = getModel(config);

  const result = await generateText({
    model,
    system: systemPrompt,
    messages: session.messages,
    tools: tools,
    maxSteps: 10,
  } as any) as any;

  for (const step of result.steps) {
    for (const toolCall of step.toolCalls) {
      session.messages.push({
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: toolCall.toolCallId,
            toolName: toolCall.toolName,
            input: toolCall.args,
          },
        ],
      });
    }

    for (const toolResult of step.toolResults) {
      session.messages.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: toolResult.toolCallId,
            toolName: toolResult.toolName,
            output: { type: "json", value: toolResult.result },
          },
        ],
      });
    }
  }

  if (result.reasoning) {
    const reasoningText = Array.isArray(result.reasoning)
      ? result.reasoning.map((r: any) => r.text).join("\n")
      : result.reasoning;

    session.messages.push({
      role: "assistant",
      content: [{ type: "reasoning", text: reasoningText }],
    });
    if (verbose === 1) {
      process.stdout.write(chalk.gray(reasoningText) + "\n");
    }
  }

  if (result.text) {
    session.messages.push({
      role: "assistant",
      content: [{ type: "text", text: result.text }],
    });
  }

  session.updatedAt = new Date().toISOString();
  await saveSession(session);

  return result.text;
}