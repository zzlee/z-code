import z from "zod";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolDef, ToolContext, ExecuteResult } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDescription() {
  try {
    return fs.readFileSync(path.join(__dirname, "web_fetch.txt"), "utf8");
  } catch (e) {
    return "Fetch the content of a webpage and return it as clean text.";
  }
}

const parameters = z.object({
  url: z.string().url().describe("The URL of the webpage to fetch."),
});

export const WebFetchTool: ToolDef<typeof parameters> = {
  id: "web_fetch",
  description: loadDescription(),
  parameters,
  async execute(args, ctx) {
    try {
      const response = await fetch(args.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove noise
      $("script, style, nav, footer, header, .ads, .sidebar").remove();

      const bodyText = $("body").text().trim().replace(/\s+/g, " ");
      
      // Basic truncation to prevent context flooding (approx 10k chars)
      const truncatedText = bodyText.length > 10000 
        ? bodyText.substring(0, 10000) + "\n... [Content truncated for brevity]"
        : bodyText;

      return {
        title: "Web Fetch",
        metadata: { url: args.url },
        output: truncatedText,
      };
    } catch (error: any) {
      return {
        title: "Web Fetch Error",
        metadata: {},
        output: `Failed to fetch webpage: ${error.message}`,
      };
    }
  },
};
