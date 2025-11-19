# VS Writer - AI Agent Instructions

This document outlines the architecture, workflows, and conventions for the **VS Writer** VS Code extension.

## 🏗 Architecture

**VS Writer** is a VS Code extension that enables collaborative writing with AI using a custom HTML comment syntax.

### Core Components
-   **Chat Participant (`@writer`)**: The entry point defined in `package.json`. It handles user requests in the Copilot Chat view.
-   **Block Parser (`findWriterBlock`)**: Located in `src/extension.ts`. It scans the active document for `<!-- p --> ... <!-- e -->` blocks and identifies the one containing the user's cursor.
-   **System Prompt**: Stored in `src/prompts/writer-prompt.md`. This file defines the AI's persona and instructions. It is loaded at runtime.
-   **Command Handlers**:
    -   `vs-writer.insertResponse`: Inserts the AI's generated text into the `<!-- a -->` section of the block.
    -   `vs-writer.insertTemplate`: Inserts a new empty block structure.

### Data Flow
1.  **Activation**: Extension activates `onLanguage:markdown`.
2.  **Request**: User invokes `@writer`. The extension reads the System Prompt and the active `<!-- p -->` block content.
3.  **Generation**: Request is sent to the Language Model API (`vscode.lm.sendRequest`).
4.  **Response**: Output is streamed to the Chat view.
5.  **Insertion**: User clicks a button in the chat, triggering `vs-writer.insertResponse` to update the editor.

## 🛠 Developer Workflows

### Build & Run
-   **Compile**: `npm run compile`
    -   *Note*: This script runs `tsc` AND copies `src/prompts/*.md` to `out/prompts/`. **Always run this after modifying prompts.**
-   **Watch**: `npm run watch` (for development).
-   **Debug**: Press `F5` (Launch Extension).

### Key Commands
-   `VS Writer: Insert Block Template`: Helper to insert the DSL tags.

## 🧩 Patterns & Conventions

### HTML Comment DSL
The project relies on a strict 3-part structure:
1.  `<!-- p -->`: **Paragraph** (Human Input)
2.  `<!-- a -->`: **AI** (AI Output)
3.  `<!-- e -->`: **End** (Block Terminator)

*   **Parsing Logic**: The regex in `findWriterBlock` is critical. It must handle newlines and nested content correctly.
*   **Insertion Logic**: The `insertResponse` command looks for `<!-- a -->` and inserts/replaces content *after* it, up to `<!-- e -->`.

### Prompt Management
-   Prompts are **NOT** hardcoded in TypeScript.
-   They reside in `src/prompts/`.
-   They are loaded via `fs.readFileSync` at runtime from the `out/prompts/` directory.

### Context Awareness
-   The extension is designed to be **cursor-sensitive**.
-   It always prefers the block *surrounding* the cursor over any other context.

## ⚠️ Common Pitfalls
-   **Prompt Updates**: If you edit `src/prompts/writer-prompt.md`, you MUST run `npm run compile` (or `copy-resources`) for the changes to take effect in the debug session.
-   **Model Selection**: The code attempts to select a `gpt-4` family model. Ensure the user has access or fallback gracefully.
