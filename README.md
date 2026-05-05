# z-code

`z-code` is an AI-powered coding agent CLI tool designed to assist software engineers with various tasks directly from the terminal. It leverages state-of-the-art LLMs to perform code analysis, editing, and environment interaction.

## Features

- **Intelligent Agents**: Default `/code` agent for software engineering, with support for custom agent prompts.
- **Session Management**: 
  - Resume previous conversations with `--continue` or `--session <id>`.
  - Fork sessions to explore different solution paths with `--fork`.
  - List and delete session histories.
- **Custom Skills**: Load specific capabilities or prompt snippets using `--load-skill <name>`.
- **Powerful Toolset**: The agent can interact with your system via:
  - `bash`: Execute shell commands.
  - `read`/`write`/`edit`: Manipulate files.
  - `glob`/`grep`: Search for files and content.
  - `web_search`/`web_fetch`: Access real-time information from the web.
- **Multi-Provider Support**: Compatible with OpenAI, Google Gemini, and Ollama.

## Installation

1. Clone the repository:
   ```bash
   git clone git@github.com-zzlee:zzlee/z-code.git
   cd z-code
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. (Optional) Link the CLI globally:
   ```bash
   npm link
   ```

## Configuration

`z-code` requires a configuration file located at `~/.config/z-code/config.json`.

Example `config.json`:
```json
{
  "default_provider": "openai",
  "streaming": true,
  "providers": {
    "openai": {
      "provider": "openai",
      "model": "gpt-4o",
      "apiKey": "your-openai-api-key"
    },
    "google": {
      "provider": "google",
      "model": "gemini-1.5-pro",
      "apiKey": "your-google-api-key"
    },
    "ollama": {
      "provider": "ollama",
      "model": "codellama",
      "baseUrl": "http://localhost:11434"
    }
  }
}
```

## Usage

### Basic Prompting
```bash
z-code "Explain the current project structure"
```

### Using Specific Agents
Start your prompt with `/agentName` to use a specific agent:
```bash
z-code /tech-eng "Review this code for performance bottlenecks"
```

### Session Management
- **Continue latest session**: `z-code --continue "Next step..."`
- **Resume specific session**: `z-code --session <id> "Continue here"`
- **Fork a session**: `z-code --session <id> --fork "Try a different approach"`
- **List sessions**: `z-code --list-sessions`
- **Show session history**: `z-code --show-session [id]`

### Skills and Debugging
- **List available skills**: `z-code --list-skills`
- **Load a skill**: `z-code --load-skill <skill_name> "Task using this skill"`
- **Verbose mode**: `z-code -v 1 "Prompt"` (Shows tool calls and reasoning)
- **Non-streaming output**: `z-code --generate "Prompt"`

## Project Structure

- `src/agent`: Agent logic and prompt management.
- `src/config`: Configuration handling.
- `src/session`: Session persistence and management.
- `src/tools`: Implementations of the agent's capabilities.
- `prompts/`: Prompt templates for agents and commands.
