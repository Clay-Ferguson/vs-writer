# VS Writer - AI Agent Instructions

This document outlines the architecture, workflows, and conventions for the **VS Writer** VS Code extension.

## 🏗 Architecture

**VS Writer** is a VS Code extension that enables collaborative writing with AI using a custom HTML comment syntax.

### Core Components
-   **Chat Participant (`@writer`)**: The entry point defined in `package.json`. It handles user requests in the Copilot Chat view.
-   **Block Parser (`findWriterBlock`)**: Located in `src/extension.ts`. It scans the active document for `<!-- p --> ... <!-- e -->` blocks and identifies the one containing the user's cursor.
-   **Prompt Engine**: Dynamically constructs the system prompt by combining the base prompt (or override), context files, and role definitions.
-   **Command Handlers**:
    -   `vs-writer.insertResponse`: Inserts the AI's generated text into the `<!-- a -->` section of the block.
    -   `vs-writer.insertTemplate`: Inserts a new empty block structure.
    -   `vs-writer.verify`: Compares P and A sections for missing details.
    -   `vs-writer.removePSections`: Recursively removes P sections (keeps A).
    -   `vs-writer.removeASections`: Recursively removes A sections (keeps P).
    -   `vs-writer.hidePSections`: Recursively hides P sections (toggles comments).
    -   `vs-writer.hideASections`: Recursively hides A sections (toggles comments).

### Data Flow
1.  **Activation**: Extension activates `onLanguage:markdown`.
2.  **Request**: User invokes `@writer`.
3.  **Prompt Construction**:
    *   **Base**: Checks workspace root for `AI-WRITER-PROMPT.md`. If found, uses it. Else, loads `src/prompts/writer-prompt.md`.
    *   **Context**: Checks `AI-WRITER-CONTEXT.md`. Parses Markdown links (e.g., `[Label](path/file.md)`) and injects file content wrapped in `<context_file>` XML tags.
    *   **Role**: Checks `AI-WRITER-ROLE.md`. Appends content to the end of the prompt.
4.  **Generation**: Request is sent to the Language Model API (`vscode.lm.sendRequest`).
5.  **Response**: Output is streamed to the Chat view.
6.  **Insertion**: User clicks a button in the chat, triggering `vs-writer.insertResponse` to update the editor.

## 🛠 Developer Workflows

### Build & Run
-   **Compile**: `npm run compile`
    -   *Note*: This script runs `tsc` AND copies `src/prompts/*.md` to `out/prompts/`. **Always run this after modifying prompts.**
-   **Watch**: `npm run watch` (for development).
-   **Debug**: Press `F5` (Launch Extension).

### Key Commands
-   `VS Writer: Insert Block Template`: Helper to insert the DSL tags.
-   `VS Writer: Verify`: Checks if AI content matches Human draft.
-   `VS Writer: Remove P-Sections`: Bulk delete human drafts (Explorer Context Menu).
-   `VS Writer: Remove A-Sections`: Bulk delete AI output (Explorer Context Menu).
-   `VS Writer: Hide P-Sections`: Bulk hide human drafts (Explorer Context Menu).
-   `VS Writer: Hide A-Sections`: Bulk hide AI output (Explorer Context Menu).

## 🧩 Patterns & Conventions

### HTML Comment DSL
The project relies on a strict 3-part structure:
1.  `<!-- p -->`: **Paragraph** (Human Input)
2.  `<!-- a -->`: **AI** (AI Output)
3.  `<!-- e -->`: **End** (Block Terminator)

*   **Parsing Logic**: The regex in `findWriterBlock` is critical. It must handle newlines and nested content correctly.
*   **Insertion Logic**: The `insertResponse` command looks for `<!-- a -->` and inserts/replaces content *after* it, up to `<!-- e -->`.

### Configuration Files (Workspace Root)
The extension looks for these specific files in the user's workspace root to customize behavior:
1.  `AI-WRITER-PROMPT.md`: **Overrides** the entire system prompt.
2.  `AI-WRITER-CONTEXT.md`: **Injects** external file content.
    *   *Pattern*: `[Link Text](relative/path/to/file.md)`
    *   *Injection Format*: `<context_file path="relative/path/to/file.md">...content...</context_file>`
    *   *Error Handling*: Fails immediately if a linked file is missing.
3.  `AI-WRITER-ROLE.md`: **Appends** persona/role instructions to the end of the prompt.

### Prompt Management
-   Default prompts reside in `src/prompts/`.
-   They are loaded via `fs.readFileSync` at runtime from the `out/prompts/` directory.

### Context Awareness
-   The extension is designed to be **cursor-sensitive**.
-   It always prefers the block *surrounding* the cursor over any other context.

## ⚠️ Common Pitfalls
-   **Prompt Updates**: If you edit `src/prompts/writer-prompt.md`, you MUST run `npm run compile` (or `copy-resources`) for the changes to take effect in the debug session.
-   **Context File Errors**: If `AI-WRITER-CONTEXT.md` references a missing file, the extension throws an error and aborts the request to prevent hallucinations.
-   **Model Selection**: The code attempts to select a `gpt-4` family model. Ensure the user has access or fallback gracefully.
