# Orchestrator Agent Implementation Plan

This document outlines the plan to implement a divide-and-conquer orchestrator agent loop in `z-code`.

## Objective
Enable an "orchestrator" agent to break down complex requests into smaller sub-tasks and delegate them to specialized sub-agents (e.g., `/code`) using a new `delegate_task` tool.

## Implementation Steps

### 1. Create the `delegate_task` Tool
* **File:** `src/tools/delegate_task.ts`
* **Description:** Implement a `DelegateTaskTool` that accepts two parameters:
  * `agentName` (string): The name of the sub-agent to invoke (e.g., `"code"`).
  * `taskDescription` (string): The prompt or instructions for the sub-task.
* **Logic:**
  * Create an isolated, temporary `Session` object to prevent polluting the main orchestrator's session history.
  * Load the specified sub-agent's prompt using `loadPrompt(agentName)`.
  * Load the user configuration using `loadConfig()`.
  * Resolve the appropriate tools for the sub-agent.
  * Invoke the agent programmatically (e.g., using `runAgentGenerateText`) with `verbose: 0` to suppress unwanted terminal output, capturing the result.
  * Return the final generated text back to the orchestrator as the tool's result.

### 2. Register the New Tool
* **File:** `src/tools/index.ts`
* **Description:**
  * Export the new `DelegateTaskTool`.
  * Add it to the `allTools` array.
  * Consider adding it to `toolsList` or creating a dedicated `orchestratorTools` filter category.

### 3. Create Orchestrator Prompts
* **System Prompt:** `prompts/orchestrator.md`
  * Add instructions directing the agent to act as a manager. It should analyze the user's request, divide it into independent sub-tasks, and sequentially (or concurrently) delegate them using `delegate_task`.
* **Command Prompt / Metadata:** `prompts/commands/orchestrator.md`
  * Add YAML frontmatter to restrict/allow specific tools. For example:
    ```yaml
    ---
    tool: ['delegate_task', 'read', 'bash', 'write']
    ---
    ```

### 4. Refactor Agent Runner (If needed)
* **File:** `src/agent/agent.ts`
* **Description:** Ensure that `runAgentGenerateText` can be called cleanly from within another tool. It currently saves the session to disk (`saveSession(session)`). For delegated tasks, we might need a flag to prevent saving temporary sub-sessions to the disk, or just clean them up afterward.

### 5. Testing and Validation
* Run a complex command like `npx tsx src/index.ts /orchestrator "Refactor module X and add tests"`.
* Verify that the orchestrator calls `delegate_task` with `/code` multiple times and synthesizes the final result correctly.
