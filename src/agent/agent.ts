import chalk from "chalk";
import ora from "ora";
import { streamText, generateText, ToolSet, tool, jsonSchema } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOllama } from "ollama-ai-provider-v2";
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Config } from "../config/config.js";
import { saveSession, Messages, Session } from "../session/session.js";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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
  } else if (providerConfig.provider === "ollama") {
    const ollama = createOllama({
      baseURL: providerConfig.baseUrl,
    });
    model = ollama(providerConfig.model as any);
  } else if (providerConfig.provider === "openai-compatible") {
    const nim = createOpenAICompatible({
      name: 'nim',
      baseURL: providerConfig.baseUrl ?? "",
      headers: {
        Authorization: `Bearer ${providerConfig.apiKey}`,
      },
      includeUsage: true,
    });
    model = nim.chatModel(providerConfig.model);
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

async function setupMcpTools(config: Config) {
  const mcpTools: Record<string, any> = {};
  const cleanupFunctions: Array<() => Promise<void>> = [];

  if (!config.mcp_servers) {
    return { mcpTools, cleanupFunctions };
  }

  for (const [serverName, serverConfig] of Object.entries(config.mcp_servers)) {
    try {
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
        env: { ...process.env, ...serverConfig.env } as any,
      });

      const client = new Client(
        { name: "z-code", version: "0.1.0" },
        { capabilities: {} }
      );

      await client.connect(transport);

      cleanupFunctions.push(async () => {
        try {
          await client.close();
        } catch (e) {
          // Ignore close errors
        }
      });

      const tools = await client.listTools();

      for (const t of tools.tools) {
        const toolName = `${serverName}_${t.name}`;
        mcpTools[toolName] = tool({
          description: t.description || `Tool ${t.name} from MCP server ${serverName}`,
          parameters: jsonSchema(t.inputSchema as any),
          execute: async (args: any) => {
            try {
              const result = await client.callTool({
                name: t.name,
                arguments: args,
              });
              return { content: result };
            } catch (error: any) {
              return {
                content: {
                  output: error.message,
                },
              };
            }
          },
        } as any);
      }
    } catch (error: any) {
      console.error(chalk.yellow(`Failed to initialize MCP server ${serverName}: ${error.message}`));
    }
  }

  return { mcpTools, cleanupFunctions };
}

export async function runAgentStreamText(
  config: Config,
  session: Session,
  systemPrompt: string,
  toolsList: any[],
  verbose: number = 0
) {
  let model = getModel(config);
  let tools = getTools(toolsList, session);
  const { mcpTools, cleanupFunctions } = await setupMcpTools(config);
  tools = { ...tools, ...mcpTools };

  // console.log(`systemPrompt ==> ${systemPrompt}}`);
  // console.log(`tools ==> ${JSON.stringify(tools)}`);

  try {
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
        case 'reasoning-end': {
          if (verbose === 1) {
            process.stdout.write("\n");
          }
          break;
        }
        case 'reasoning-delta': {
          if (verbose === 1) {
            process.stdout.write(chalk.dim(part.text));
          }
          break;
        }
        case 'tool-input-start': {
          if (verbose === 1) {
            process.stdout.write("\n");
          }
          break;
        }
        case 'tool-call': {
          if (verbose === 1) {
            process.stdout.write(chalk.blue(`[${part.toolName}${part.input ? ' ' + Object.values(part.input).join(' ') : ''}]\n`));
          }
          break;
        }
        case 'tool-result': {
          if (verbose === 1) {
            const result = part.output ? (typeof part.output === 'string' ? part.output : JSON.stringify(part.output)) : '';
            const conciseResult = result.length > 50 ? result.substring(0, 50) + '...' : result;
            process.stdout.write(chalk.green(`[${part.toolName}] ${conciseResult}\n`));
          }
         break;
        }
        default:
          // console.log(chalk.yellow(`${part.type}`));
          break;
      }
    }

    let response = await result.response;
    if (verbose >= 1 && result.totalUsage) {
      const totalUsage = (await result.totalUsage) as any;
      process.stdout.write(chalk.gray(`\n[Tokens: ${totalUsage.totalTokens ?? 0} (${totalUsage.inputTokens ?? 0}+${totalUsage.outputTokens ?? 0}) Resoning: ${totalUsage.reasoningTokens ?? 0} Cache: ${totalUsage.cachedInputTokens ?? 0}]\n`));
    }
    response.messages.forEach((m: any) => {
      session.messages.push(m);
    });

    session.updatedAt = new Date().toISOString();
    await saveSession(session);

      if(await result.finishReason == "stop") {
        break;
      }
    }
  } finally {
    for (const cleanup of cleanupFunctions) {
      await cleanup();
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
  let tools = getTools(toolsList, session);
  const { mcpTools, cleanupFunctions } = await setupMcpTools(config);
  tools = { ...tools, ...mcpTools };

  try {
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
                const args = part.input ? Object.values(part.input).join(' ') : '';
                process.stdout.write(chalk.blue(`[${part.toolName}${args ? ' ' + args : ''}]`));
              }
              break;

            case 'tool-result':
              if (verbose === 1) {
                const result = part.output ? (typeof part.output === 'string' ? part.output : JSON.stringify(part.output)) : '';
                const conciseResult = result.length > 50 ? result.substring(0, 50) + '...' : result;
                process.stdout.write(chalk.green(`[${part.toolName}] ${conciseResult}\n`));
              }
              break;
          }
        }
      }
    }

    if (verbose >= 1 && result.totalUsage) {
      const totalUsage = result.totalUsage as any;
      process.stdout.write(chalk.gray(`\n[Tokens: ${totalUsage.totalTokens ?? 0} (${totalUsage.inputTokens ?? 0}+${totalUsage.outputTokens ?? 0}) Resoning: ${totalUsage.reasoningTokens ?? 0} Cache: ${totalUsage.cachedInputTokens ?? 0}]\n`));
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
  } finally {
    for (const cleanup of cleanupFunctions) {
      await cleanup();
    }
  }
}
