# z-code (this repo itself)

This file is auto-appended to every agent's system prompt by `src/agent/prompt.ts:70-73`.

## Commands

| command | what |
|---|---|
| `npm run build` | `rm -rf dist && tsc && cp src/tools/*.txt dist/tools/ && cp prompts dist/agent -rf && chmod +x dist/index.js` |
| `npm run dev` | `tsx watch src/index.ts` |
| `npm start` | `node dist/index.js` |

No test runner, no linter, no formatter config exists. Only validation available is `tsc` (via build).

## Architecture

- **Prompt system**: `prompts/<name>.md` = base agent prompt; `prompts/commands/<name>.md` = command override with YAML frontmatter (`agent:`, `tool:`, `description:`). Commands take precedence.
- **Prompt resolution**: Uses `__dirname` at runtime → after build, prompt files live at `dist/agent/prompts/`. `prompts/` is a build input.
- **Skills**: `skills/<name>/SKILL.md` (local) or `~/.config/z-code/skills/<name>/SKILL.md` (global). Repo-local skills are in `.agents/skills/`.
- **Tools**: `src/tools/` — `.ts` = implementation, `.txt` = description file copied to `dist/tools/` at build.
- **Config**: `~/.config/z-code/config.json` (Zod-validated). Supports `mcp_servers` for MCP protocol tools.
- **Sessions**: stored as JSON in `.z-code/sessions/`. Session IDs are 13-char `Math.random().toString(36)`.
- **CLI entry**: `src/index.ts` using `commander`.

## Agent system

- `/agentName` prefix selects an agent; defaults to `/code`.
- YAML frontmatter in `prompts/commands/<name>.md` can set `tool: ['tool_id']` to restrict tools (`*` = all).
- Default tool set: `bash`, `read`, `write`, `glob`, `edit`, `grep`, `load_skill`, `chat_history_compact`.
- Verbosity: `-v 0` (text only), `-v 1` (shows tool calls, reasoning, tokens).
- `--generate` disables streaming, uses single-step generate mode.

## Provider support

OpenAI (incl. OpenAI-compatible), Google Gemini, Ollama. Config-driven via `~/.config/z-code/config.json`.

## File attachment

`@filename` in the prompt: text files inlined as code blocks; images as data URL (multi-modal); other files as data URL blobs. MIME detection in `src/index.ts:18-51`.
