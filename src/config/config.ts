import fs from "fs-extra";
import path from "path";
import os from "os";
import { z } from "zod";

const CONFIG_DIR = path.join(os.homedir(), ".config", "z-code");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export const ProviderSchema = z.object({
  provider: z.string(),
  model: z.string(),
  apiKey: z.string(),
  baseUrl: z.string().optional(),
});

export type ProviderConfig = z.infer<typeof ProviderSchema>;

export const McpServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string(), z.string()).optional(),
});

export type McpServerConfig = z.infer<typeof McpServerSchema>;

export const ConfigSchema = z.object({
  default_provider: z.string(),
  streaming: z.boolean().optional(),
  providers: z.record(z.string(), ProviderSchema),
  mcp_servers: z.record(z.string(), McpServerSchema).optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export async function loadConfig(): Promise<Config | null> {
  try {
    if (await fs.pathExists(CONFIG_FILE)) {
      const data = await fs.readJson(CONFIG_FILE);
      return ConfigSchema.parse(data);
    }
  } catch (error) {
    console.error("Error loading config:", error);
  }
  return null;
}

export async function saveConfig(config: Config): Promise<void> {
  await fs.ensureDir(CONFIG_DIR);
  await fs.writeJson(CONFIG_FILE, config, { spaces: 2 });
}

export async function ensureConfigDir(): Promise<void> {
  await fs.ensureDir(CONFIG_DIR);
}
