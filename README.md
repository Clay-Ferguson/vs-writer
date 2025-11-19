# VS Writer

**VS Writer** is a collaborative AI writing assistant for Visual Studio Code. It allows you to "co-author" documents with an AI agent directly within your Markdown files using a simple, structured workflow.

Instead of switching back and forth between a chat window and your document, VS Writer lets you define **Draft** sections and **AI** sections right in the text, creating a seamless "Human Draft -> AI Polish" loop.

## Key Features

*   **Structured Collaboration**: Use simple HTML comments to define where you write and where the AI writes.
*   **Context-Aware**: The `@writer` agent automatically reads the block of text your cursor is currently inside.
*   **Zero-Friction Workflow**: No need to copy-paste prompts. Just type `@writer` in the chat, and the extension handles the rest.
*   **Meta-Instructions**: Embed instructions for the AI directly in your draft using `(ai, ...)` syntax.

## How to Use

### 1. The Syntax
VS Writer uses three specific HTML comment tags to structure your document:

*   `<!-- p -->`: **Paragraph / Prompt**. This is where you write your rough draft, notes, or bullet points.
*   `<!-- a -->`: **AI Output**. This is where the AI will generate the polished content.
*   `<!-- e -->`: **End**. Marks the end of the collaborative block.

### 2. The Workflow

1.  **Open a Markdown file** in VS Code.
2.  **Insert a Block**:
    *   Run the command `VS Writer: Insert Block Template` from the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
    *   Or manually type the tags.
3.  **Write your Draft**:
    *   Type your thoughts inside the `<!-- p -->` section.
    *   You can include specific instructions like `(ai, make this sound professional)` or `(ai, use a metaphor about space)`.
4.  **Invoke the Writer**:
    *   Place your cursor anywhere inside the block.
    *   Open the **Copilot Chat** view.
    *   Type `@writer` (or `@writer /fill`) and hit Enter.
5.  **Insert the Result**:
    *   The AI will generate the content in the chat window.
    *   Click the **"Insert into Document"** button that appears below the response to automatically fill the `<!-- a -->` section.

## Example

**Your Input (in Editor):**

```markdown
<!-- p -->
The brain uses a resonance effect of retrocausal Quantum Mechanical probability waves as the mechanism for the brain funciton we call 'memory recall'. (AI, Give the anecdote of the vibrating wine glass that you can locate in your house simply by singing its pitch and then listening for it to ring back at you. The singing its pitch is like your brain having certain inputs coming into it, whereas when it rings back at you that's analogous to a memory)
<!-- a -->

<!-- e -->
```

**Action:**
*   Place cursor inside the block.
*   Type `@writer` in Chat.

**Result (Inserted into `<!-- a -->`):**

```markdown
<!-- a -->
To illustrate this mechanism, consider the phenomenon of acoustic resonance. Imagine trying to locate a specific crystal wine glass hidden somewhere in your house. By singing a precise pitch that matches the glass's natural resonant frequency, you can cause the glass to vibrate sympathetically. When you stop singing and listen, the glass will "ring back" at you, revealing its location. In this analogy, the act of singing the pitch corresponds to the brain receiving specific sensory inputs or generating a neural query. The subsequent ringing of the glass—the resonance response—is analogous to the retrieval of a memory.
<!-- e -->
```

## Commands

*   `@writer`: Triggers the AI to process the current block.
*   `VS Writer: Insert Block Template`: Inserts a new `p/a/e` block at the cursor position.

## Requirements

*   Visual Studio Code 1.90.0 or higher.
*   GitHub Copilot Chat extension installed and active.
