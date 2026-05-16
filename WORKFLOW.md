# Workflows

Practical workflows for common tasks with `z-code`.

## Code Review

Attach files with `@` and ask for review:

```bash
z-code "Review @src/index.ts for potential bugs and security issues"
z-code "Check @src/agent/agent.ts for error handling gaps"
```

Review multiple files at once:

```bash
z-code "Review the auth flow in @src/auth/login.ts @src/auth/middleware.ts"
```

## Debugging with Session Continuation

Start debugging, then continue the conversation:

```bash
# First session
z-code "The build fails with this error: @build.log. Help me debug it"

# Continue the same session (picks up where you left off)
z-code --continue "I tried your fix but now I get a different error @new-build.log"

# Resume a specific session later
z-code --session abc "Let me show you the updated code @src/fixed.ts"
```

## Refactoring with Fork

Explore multiple solution paths by forking a session:

```bash
# Start from an existing session
z-code --session 2tm43oualg8 --fork "Try using a Map instead of Object here"
z-code --session 2tm43oualg8 --fork "What if we use a class-based approach instead?"
```

Each fork creates a new session with the same conversation history up to the fork point.

## Multi-File Refactoring

```bash
z-code "Rename the function getCwd to getCurrentWorkingDirectory across the project"
```

The agent uses `grep` to find all usages and `edit` to update them across files.

## Planning

Create an implementation plan before coding:

```bash
z-code /plan "Add a dark mode toggle to the settings page"
```

This creates a git branch and produces a step-by-step Implementation Roadmap.

Read-only planning (no file modification):

```bash
z-code /plan-only "Design the database schema for a blog engine"
```

## Bash Automation

```bash
z-code /bash "Find all large log files over 100MB and archive them"
z-code /bash "Show me the top 5 memory-consuming processes"
```

## Git Workflow

Stage and commit with Conventional Commits:

```bash
z-code /git-commit
```

The agent stages changes and creates a commit with a properly formatted message.

## Web-Enhanced Development

Combine web research with coding:

```bash
z-code "Search for the latest Express.js rate limiting middleware and implement it in @src/server.ts"
z-code "Find the API docs for the OpenAI embeddings endpoint and write a wrapper function"
```

## Translation

Translate content using the `lang` agent:

```bash
z-code /lang "Translate this to Chinese @README.md"
z-code /trans-zh "Translate this to Traditional Chinese @docs/api.md"
z-code /trans-en "Translate this to English @docs/README.zh.md"
```

## Communication Polish

Refine technical writing with the `tech-eng` agent:

```bash
z-code /tech-eng "Improve the clarity of this PR description @PR.md"
z-code /tech-eng "Polish this API documentation @docs/endpoints.md"
```

## Verbose Debugging

See what the agent is doing under the hood:

```bash
z-code -v 1 "Refactor @src/utils.ts to use async/await instead of callbacks"
```

This shows every tool call, reasoning step, and token usage.

## Session Management

```bash
# List all sessions
z-code --list-sessions

# Show a session's full history in markdown
z-code --show-session 7fq3198kq5j

# Show the latest session
z-code --show-session

# Delete a specific session
z-code --delete-session 7fq3198kq5j

# Delete all sessions
z-code --delete-all-sessions
```

## Skills (Extensibility)

Load reusable skill instructions to specialize the agent:

```bash
z-code --load-skill deploy-to-vercel "Deploy the current project"
z-code --load-skill web-design-guidelines --load-skill accessibility "Audit @src/components/Button.tsx"
```

Multiple skills can be loaded at once to compose capabilities.

## File Attachment by Type

Reference files with `@` — the tool detects MIME type automatically:

- **Source code**: read as UTF-8, attached as text with a code block
- **Images** (png, jpg, gif, webp, svg): attached as data URL, usable by multi-modal models
- **Audio/Video** (mp3, wav, mp4, webm): attached as file with data URL
- **PDFs**: attached as file data

```bash
z-code "Explain this diagram @architecture.png"
z-code "Transcribe this audio clip @recording.mp3"
z-code "What does this error mean? @screenshot.png @error.log"
```
