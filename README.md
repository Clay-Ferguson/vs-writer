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
    *   **Option A (Right-Click)**: Right-click in the editor and select **"VSWriter - Generate"**.
    *   **Option B (Chat)**: Open the Copilot Chat view, type `@writer`, and hit Enter.
5.  **Insert the Result**:
    *   The AI will generate the content in the chat window.
    *   Click the **"Insert into Document"** button that appears below the response to automatically fill the `<!-- a -->` section.

### 3. Customizing the AI Persona

You can define a specific role or persona for the AI to adopt (e.g., "Physics Expert", "Noir Detective", "Technical Writer").

1.  Create a file named `AI-WRITER-ROLE.md` in the root folder of your workspace.
2.  Write your persona instructions in this file.

**Example `AI-WRITER-ROLE.md` content:**
```markdown
You are a cynical, noir-style detective narrator.
Everything you write should be gritty, dark, and full of metaphors about rain and shadows.
Keep sentences short and punchy.
```

When this file exists, `@writer` will automatically read it and apply the persona to its generation.

### 4. Overriding the System Prompt (Advanced)

For complete control over the AI's behavior, you can override the entire system prompt. This is rarely needed but useful for power users who want to fundamentally change how the extension interprets the `p/a/e` blocks.

1.  Create a file named `AI-WRITER-PROMPT.md` in the root folder of your workspace.
2.  Paste your custom system prompt into this file.

If this file exists, VS Writer will use it **instead** of the built-in prompt.

**Default System Prompt:**
For reference, here is the default prompt used by the extension. If you override it, you should probably include similar logic to handle the `<!-- p -->` and `<!-- a -->` tags correctly.

```markdown
You are an expert collaborative writing assistant. Your goal is to help the user write high-quality documents by expanding on their drafts.

The user will provide text that follows a specific structure using HTML comments:
1.  `<!-- p -->`: Starts the "Paragraph" section (Human written draft/notes).
2.  `<!-- a -->`: Starts the "AI" section (Where you write).
3.  `<!-- e -->`: Ends the section.

**Your Task:**
1.  Read the content in the `<!-- p -->` section.
2.  Interpret any parenthetical instructions starting with "AI," or "ai," as meta-instructions for you (e.g., "(ai, give an anecdote...)"). Do not include these instructions in your output.
3.  Generate the content for the `<!-- a -->` section based on the `<!-- p -->` draft and any meta-instructions.
4.  **Output ONLY the content for the `<!-- a -->` section.** Do not repeat the `<!-- p -->` content. Do not output the `<!-- a -->` or `<!-- e -->` tags.

**Style:**
-   Write in a clear, engaging, and professional tone, or match the tone requested in the meta-instructions.
-   Ensure the content flows logically from the human draft.
```

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

## Tips

To disable either the "p" (Paragraph) part or the "e" part from the Markdown (at least in Rendered/Preview Markdown) you can simply change `<!-- p -->` to `<!-- p -- >` for example. Notice all we need to do is add a space before the closing `>` and that has the effect of removing that (making it part of a comment), so that we can toggle any of these sections on and off using this technique.

## Commands

*   `@writer`: Triggers the AI to process the current block.
*   `VS Writer: Insert Block Template`: Inserts a new `p/a/e` block at the cursor position.
*   `VSWriter - Generate`: (Context Menu) Opens Chat and invokes `@writer` for the current block.

## Requirements

*   Visual Studio Code 1.90.0 or higher.
*   GitHub Copilot Chat extension installed and active.
