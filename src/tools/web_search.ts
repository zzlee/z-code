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
    return fs.readFileSync(path.join(__dirname, "web_search.txt"), "utf8");
  } catch (e) {
    return "Search the web for information using DuckDuckGo.";
  }
}

const parameters = z.object({
  query: z.string().describe("The search query to look up on the web."),
});

export const WebSearchTool: ToolDef<typeof parameters> = {
  id: "web_search",
  description: loadDescription(),
  parameters,
  async execute(args, ctx) {
    try {
      const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const results: { title: string; link: string; snippet: string }[] = [];

      $(".result").each((_, el) => {
        const title = $(el).find(".result__a").text().trim();
        const link = $(el).find(".result__a").attr("href") || "";
        const snippet = $(el).find(".result__snippet").text().trim();
        if (title && link) {
          results.push({ title, link, snippet });
        }
      });

      if (results.length === 0) {
        return {
          title: "Web Search",
          metadata: {},
          output: "No results found for the given query.",
        };
      }

      const output = results
        .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.link}\nSnippet: ${r.snippet}\n`)
        .join("\n");

      return {
        title: "Web Search",
        metadata: { count: results.length },
        output,
      };
    } catch (error: any) {
      return {
        title: "Web Search Error",
        metadata: {},
        output: `Failed to perform web search: ${error.message}`,
      };
    }
  },
};
