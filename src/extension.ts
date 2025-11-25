import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

const PARTICIPANT_ID = 'vs-writer.writer';

interface WriterContext {
    pContent: string;
    fullBlock: string;
    range: vscode.Range;
}

export function activate(context: vscode.ExtensionContext) {
    console.log('VS Writer is active');

    // 1. Register the Chat Participant
    const handler: vscode.ChatRequestHandler = async (request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) => {

        // Handle /verify command
        if (request.command === 'verify') {
            await handleVerifyCommand(stream, token);
            return;
        }

        // 1. Determine System Prompt
        // Check for AI-WRITER-PROMPT.md in the workspace root (Override)
        let systemPrompt = '';
        const workspaceFolders = vscode.workspace.workspaceFolders;
        let rootPath = '';
        if (workspaceFolders && workspaceFolders.length > 0) {
            rootPath = workspaceFolders[0].uri.fsPath;
            const customPromptPath = path.join(rootPath, 'AI-WRITER-PROMPT.md');
            if (fs.existsSync(customPromptPath)) {
                try {
                    systemPrompt = fs.readFileSync(customPromptPath, 'utf-8');
                    stream.markdown(`*Loaded custom system prompt from AI-WRITER-PROMPT.md*\n\n`);
                } catch (err) {
                    console.error('Error reading custom prompt file:', err);
                    stream.markdown(`*Warning: Found AI-WRITER-PROMPT.md but could not read it. Falling back to default.*\n\n`);
                }
            }
        }

        // If no custom prompt loaded, load the default
        if (!systemPrompt) {
            const promptPath = path.join(getExtensionPath(), 'out', 'prompts', 'writer-prompt.md');
            try {
                systemPrompt = fs.readFileSync(promptPath, 'utf-8');
            } catch (err) {
                console.error('Error reading prompt file:', err);
                stream.markdown('Error: Could not load system prompt.');
                return;
            }
        }

        // Check for AI-WRITER-CONTEXT.md in the workspace root (Append)
        if (rootPath) {
            const contextFilePath = path.join(rootPath, 'AI-WRITER-CONTEXT.md');

            if (fs.existsSync(contextFilePath)) {
                try {
                    const contextContent = processContextFile(contextFilePath, rootPath);
                    if (contextContent.trim()) {
                        systemPrompt += `\n\n**Additional Context:**\n${contextContent}`;
                        stream.markdown(`*Loaded custom context from AI-WRITER-CONTEXT.md*\n\n`);
                    }
                } catch (err) {
                    if (err instanceof Error) {
                        stream.markdown(`Error processing AI-WRITER-CONTEXT.md: ${err.message}`);
                    } else {
                        stream.markdown(`Error processing AI-WRITER-CONTEXT.md`);
                    }
                    return; // Stop execution if context processing fails
                }
            }
        }

        // Check for AI-WRITER-ROLE.md in the workspace root (Append)
        if (rootPath) {
            const roleFilePath = path.join(rootPath, 'AI-WRITER-ROLE.md');

            if (fs.existsSync(roleFilePath)) {
                try {
                    const roleContent = fs.readFileSync(roleFilePath, 'utf-8');
                    if (roleContent.trim()) {
                        systemPrompt += `\n\n**Additional Role/Persona Instructions:**\n${roleContent}`;
                        stream.markdown(`*Loaded custom role from AI-WRITER-ROLE.md*\n\n`);
                    }
                } catch (err) {
                    console.error('Error reading role file:', err);
                    stream.markdown(`*Warning: Found AI-WRITER-ROLE.md but could not read it.*\n\n`);
                }
            }
        }

        // Determine the user content (from chat or editor)
        let promptContent = ""; 
        let editorContext: WriterContext | undefined;

        // If the user didn't type much, or explicitly asked to read the file, check the editor
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editorContext = findWriterBlock(editor);

            // If no block found, check if we can create one from selection
            if (!editorContext) {
                const selection = editor.selection;
                const selectedText = editor.document.getText(selection);

                if (selectedText.trim()) {
                    const replacement = `<!-- p -->\n${selectedText}\n<!-- a -->\n<!-- e -->`;

                    await editor.edit(editBuilder => {
                        editBuilder.replace(selection, replacement);
                    });

                    // Re-scan for the block (it should be where the cursor is now)
                    editorContext = findWriterBlock(editor);
                }
            }

            if (editorContext) {
                // If we found a block, we append it to the user's prompt (or use it as the prompt)
                promptContent = `${promptContent}\n${editorContext.pContent}`;
                stream.markdown(`*Processing block at line ${editorContext.range.start.line + 1}...*\n\n`);
            }
        }

        if (!promptContent.trim()) {
            stream.markdown('Please provide a prompt or place your cursor inside a `<!-- p --> ... <!-- e -->` block.');
            return;
        }

        let prompt = systemPrompt;

        // If the user entered something in the chat window as a chat message to the '@writer' participant, we can include that as well
        if (request.prompt && request.prompt.trim()) {
            prompt += `\nHere is some initial meta-prompt text for you to consider which the user included to help you with your draft:\n<meta-prompt>${request.prompt.trim()}</meta-prompt>\n`;
        }
        prompt += "\n<content>\n" + promptContent + "\n</content>\n";

        console.log('Final Prompt Sent to LM:', prompt);

        // Construct the messages with system prompt properly integrated
        // The VS Code LM API doesn't have a separate "system" role, so we structure
        // the conversation with system instructions in the chat history
        const messages = [
            vscode.LanguageModelChatMessage.User(prompt)
            // vscode.LanguageModelChatMessage.User(systemPrompt),
            // vscode.LanguageModelChatMessage.Assistant('I understand. I will follow these instructions for all subsequent requests.'),
            // vscode.LanguageModelChatMessage.User(userContent)
        ];

        // Send to Copilot (using the 'gpt-4' family if available, or default)
        // Note: 'copilot-gpt-4' is a common model ID, but we should query available models or use the default.
        // For simplicity in this sample, we'll try to find a suitable model.

        try {
            const models = await vscode.lm.selectChatModels({ family: 'gpt-4' });
            const model = models[0] || (await vscode.lm.selectChatModels({}))[0];

            if (!model) {
                stream.markdown('Error: No Language Model available.');
                return;
            }

            const chatResponse = await model.sendRequest(messages, {}, token);

            let fullResponse = '';
            for await (const fragment of chatResponse.text) {
                fullResponse += fragment;
                stream.markdown(fragment);
            }

            // If we have editor context, offer to insert the result
            if (editorContext) {
                stream.markdown('\n\n');
                const button = {
                    title: 'Insert into Document',
                    command: 'vs-writer.insertResponse',
                    arguments: [editorContext.range, fullResponse]
                };
                stream.button(button);
            }

        } catch (err) {
            if (err instanceof Error) {
                stream.markdown(`Error: ${err.message}`);
            }
        }
    };

    const writer = vscode.chat.createChatParticipant(PARTICIPANT_ID, handler);
    writer.iconPath = new vscode.ThemeIcon('pencil');
    context.subscriptions.push(writer);

    // 2. Register the Insert Command (triggered by the button)
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-writer.insertResponse', async (range: vscode.Range, text: string) => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            // Re-find the block based on the start position. 
            // This handles cases where the block content has changed (e.g. expanded) since the request was made.
            const context = findWriterBlock(editor, range.start);
            
            if (context) {
                const { fullBlock, range: currentRange } = context;
                
                // Replace the content between <!-- a --> and <!-- e -->
                // We use a function replacer to avoid issues with special characters in 'text'
                const newBlockContent = fullBlock.replace(
                    /(<!--\s*a\s*-->)([^]*?)(<!--\s*e\s*-->)/, 
                    (match, startTag, content, endTag) => {
                        return startTag + '\n' + text + '\n' + endTag;
                    }
                );
                
                if (newBlockContent !== fullBlock) {
                    await editor.edit(editBuilder => {
                        editBuilder.replace(currentRange, newBlockContent);
                    });
                }
            } else {
                // Fallback: If we can't find the block, try to insert at the cursor or warn
                vscode.window.showWarningMessage('Could not locate the Writer block. Content inserted at cursor.');
                editor.edit(b => b.insert(editor.selection.active, text));
            }
        })
    );

    // 3. Register Command to Insert Template
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-writer.insertTemplate', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const snippet = new vscode.SnippetString(
                    '<!-- p -->\n$1\n<!-- a -->\n\n<!-- e -->'
                );
                editor.insertSnippet(snippet);
            }
        })
    );

    // 4. Register Command to Generate (Trigger Chat)
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-writer.generate', () => {
            vscode.commands.executeCommand('workbench.action.chat.open', { query: '@writer' });
        })
    );

    // 5. Register Command to Verify
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-writer.verify', () => {
            vscode.commands.executeCommand('workbench.action.chat.open', { query: '@writer /verify' });
        })
    );

    // 6. Register Commands to Remove Sections
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-writer.removePSections', () => removeSections('P'))
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-writer.removeASections', () => removeSections('A'))
    );

    // 7. Register Commands to Hide Sections
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-writer.hidePSections', () => hideSections('P'))
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-writer.hideASections', () => hideSections('A'))
    );

    // 8. Register Command to Add File to Context
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-writer.addToContext', addFileToContext)
    );
}

async function handleVerifyCommand(stream: vscode.ChatResponseStream, token: vscode.CancellationToken) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        stream.markdown('Please open a file to verify.');
        return;
    }

    const editorContext = findWriterBlock(editor);
    if (!editorContext) {
        stream.markdown('Please place your cursor inside a `<!-- p --> ... <!-- e -->` block to verify.');
        return;
    }

    const verifyPrompt = `
You are a verification assistant. Your task is to compare the "P" (Paragraph/Draft) section and the "A" (AI Generated) section in the provided text block.
Check if any important details, concepts, items, statements, or facts present in the "P" section were omitted from the "A" section.

If the "A" section contains all relevant information from the "P" section, simply state: "A section is complete. No missing details were found."
Otherwise, provide a bulleted list of the missing details.

Here is the content to verify:
${editorContext.fullBlock}
`;
    const messages = [vscode.LanguageModelChatMessage.User(verifyPrompt)];

    try {
        const models = await vscode.lm.selectChatModels({ family: 'gpt-4' });
        const model = models[0] || (await vscode.lm.selectChatModels({}))[0];
        if (!model) {
            stream.markdown('Error: No Language Model available.');
            return;
        }
        const chatResponse = await model.sendRequest(messages, {}, token);
        for await (const fragment of chatResponse.text) {
            stream.markdown(fragment);
        }
    } catch (err) {
        if (err instanceof Error) {
            stream.markdown(`Error: ${err.message}`);
        }
    }
}

async function hideSections(type: 'P' | 'A') {
    const action = type === 'P' ? 'Hide Human (P)' : 'Hide AI (A)';

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `${action} sections...`,
        cancellable: false
    }, async (progress) => {
        const files = await vscode.workspace.findFiles('**/*.md', '**/node_modules/**');
        let processedCount = 0;

        for (const file of files) {
            try {
                const document = await vscode.workspace.openTextDocument(file);
                const text = document.getText();
                let newText = text;

                if (type === 'P') {
                    // Hide P: <!-- p --> -> <!-- p -- >
                    // Restore A: <!-- a -- > -> <!-- a -->
                    newText = newText.replace(/<!--\s*p\s*-->/g, '<!-- p -- >');
                    newText = newText.replace(/<!--\s*a\s*--\s*>/g, '<!-- a -->');
                } else {
                    // Hide A: <!-- a --> -> <!-- a -- >
                    // Restore P: <!-- p -- > -> <!-- p -->
                    newText = newText.replace(/<!--\s*a\s*-->/g, '<!-- a -- >');
                    newText = newText.replace(/<!--\s*p\s*--\s*>/g, '<!-- p -->');
                }

                if (newText !== text) {
                    const edit = new vscode.WorkspaceEdit();
                    const fullRange = new vscode.Range(
                        document.positionAt(0),
                        document.positionAt(text.length)
                    );
                    edit.replace(file, fullRange, newText);
                    await vscode.workspace.applyEdit(edit);
                    await document.save();
                }
                processedCount++;
                progress.report({ message: `${processedCount}/${files.length}` });
            } catch (e) {
                console.error(`Failed to process ${file.fsPath}`, e);
            }
        }
    });
}

async function removeSections(type: 'P' | 'A') {
    const action = type === 'P' ? 'Human (P)' : 'AI (A)';
    const keep = type === 'P' ? 'AI (A)' : 'Human (P)';

    const result = await vscode.window.showErrorMessage(
        `Are you sure you want to remove all ${action} content? This will keep only the ${keep} content and remove the markers. This cannot be undone.`,
        { modal: true },
        'Yes'
    );

    if (result !== 'Yes') {
        return;
    }

    const files = await vscode.workspace.findFiles('**/*.md', '**/node_modules/**');

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Removing ${action} sections...`,
        cancellable: false
    }, async (progress) => {
        let processedCount = 0;
        for (const file of files) {
            try {
                const document = await vscode.workspace.openTextDocument(file);
                const text = document.getText();

                // Regex to find blocks: <!-- p --> ... <!-- a --> ... <!-- e -->
                const regex = /<!--\s*p\s*-->([^]*?)<!--\s*a\s*-->([^]*?)<!--\s*e\s*-->/g;

                let hasChanges = false;
                const newText = text.replace(regex, (match, pContent, aContent) => {
                    hasChanges = true;
                    if (type === 'P') {
                        // Remove P, keep A
                        return aContent;
                    } else {
                        // Remove A, keep P
                        return pContent;
                    }
                });

                if (hasChanges) {
                    const edit = new vscode.WorkspaceEdit();
                    const fullRange = new vscode.Range(
                        document.positionAt(0),
                        document.positionAt(text.length)
                    );
                    edit.replace(file, fullRange, newText);
                    await vscode.workspace.applyEdit(edit);
                    await document.save();
                }
                processedCount++;
                progress.report({ message: `${processedCount}/${files.length}` });
            } catch (e) {
                console.error(`Failed to process ${file.fsPath}`, e);
            }
        }
    });
}

function getExtensionPath(): string {
    // This is a hacky way to get the extension path in development if context is not passed everywhere
    // But we passed context to activate. 
    // Actually, we can just use __dirname since we are in 'out'
    return path.resolve(__dirname, '..');
}

function findWriterBlock(editor: vscode.TextEditor, position?: vscode.Position): WriterContext | undefined {
    const text = editor.document.getText();
    const pos = position || editor.selection.active;
    const cursorOffset = editor.document.offsetAt(pos);

    // Regex to find blocks: <!-- p --> ... <!-- e -->
    // We use [^]*? to match across newlines non-greedily
    const regex = /<!--\s*p\s*-->([^]*?)<!--\s*e\s*-->/g;

    let match;
    while ((match = regex.exec(text)) !== null) {
        const start = match.index;
        const end = match.index + match[0].length;

        // Check if cursor is inside this block
        if (cursorOffset >= start && cursorOffset <= end) {
            const fullBlock = match[0];
            // Extract p content: from start to <!-- a -->
            const aTagMatch = /<!--\s*a\s*-->/.exec(fullBlock);
            if (aTagMatch) {
                // We want the text AFTER the p tag and BEFORE the a tag
                // The fullBlock starts with the p tag.
                // Let's find the end of the p tag.
                const pTagMatch = /^<!--\s*p\s*-->/.exec(fullBlock);
                if (pTagMatch) {
                    const pContent = fullBlock.substring(
                        pTagMatch[0].length,
                        aTagMatch.index
                    );

                    return {
                        pContent: pContent.trim(),
                        fullBlock,
                        range: new vscode.Range(
                            editor.document.positionAt(start),
                            editor.document.positionAt(end)
                        )
                    };
                }
            }
        }
    }
    return undefined;
}

function processContextFile(filePath: string, rootPath: string): string {
    const content = fs.readFileSync(filePath, 'utf-8');
    // Match [text](link) but not ![text](link)
    // Negative lookbehind for ! is (?<!!)
    const linkRegex = /(?<!\!)\[([^\]]+)\]\(([^)]+)\)/g;

    return content.replace(linkRegex, (match, text, linkPath) => {
        // Handle simple relative paths
        // We use path.join to ensure we treat it as relative to root, even if it starts with /
        const targetPath = path.join(rootPath, linkPath);

        if (!fs.existsSync(targetPath)) {
            throw new Error(`Referenced file not found: ${linkPath}`);
        }

        const fileContent = fs.readFileSync(targetPath, 'utf-8');
        return `\n<context_file path="${linkPath}">\n${fileContent}\n</context_file>\n`;
    });
}

async function addFileToContext(uri: vscode.Uri) {
    // Get the workspace root
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage('No workspace folder is open.');
        return;
    }
    const rootPath = workspaceFolders[0].uri.fsPath;

    // Check if a file was selected (uri comes from explorer context menu)
    if (!uri) {
        vscode.window.showErrorMessage('No file selected. Please right-click on a file in the Explorer.');
        return;
    }

    // Check if it's a file (not a directory)
    try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type !== vscode.FileType.File) {
            vscode.window.showErrorMessage('Please select a file, not a folder.');
            return;
        }
    } catch (err) {
        vscode.window.showErrorMessage('Could not access the selected item.');
        return;
    }

    // Try to read the file to verify it's a text file
    try {
        const fileContent = await vscode.workspace.fs.readFile(uri);
        // Try to decode as UTF-8 - this will work for text files
        const decoder = new TextDecoder('utf-8', { fatal: true });
        decoder.decode(fileContent);
    } catch (err) {
        vscode.window.showErrorMessage('The selected file does not appear to be a text file.');
        return;
    }

    // Calculate the relative path from workspace root
    const absolutePath = uri.fsPath;
    const relativePath = path.relative(rootPath, absolutePath);

    // Normalize path separators to forward slashes for Markdown links
    const normalizedRelativePath = relativePath.split(path.sep).join('/');

    // Generate the filename without extension for the link text
    const fileName = path.basename(absolutePath, path.extname(absolutePath));

    // Create the markdown link
    const markdownLink = `[${fileName}](${normalizedRelativePath})`;

    // Path to the context file
    const contextFilePath = path.join(rootPath, 'AI-WRITER-CONTEXT.md');

    // Check if context file exists
    let existingContent = '';
    if (fs.existsSync(contextFilePath)) {
        existingContent = fs.readFileSync(contextFilePath, 'utf-8');
        
        // Check if the link already exists (check for the path specifically)
        // We look for the path in parentheses to match markdown link format
        if (existingContent.includes(`(${normalizedRelativePath})`)) {
            vscode.window.showInformationMessage(`File is already in context: ${normalizedRelativePath}`);
            // Open the context file in the editor
            const contextFileUri = vscode.Uri.file(contextFilePath);
            await vscode.window.showTextDocument(contextFileUri);
            return;
        }
    } else {
        // Create the file with a header
        existingContent = '# Custom Context\n\n';
    }

    // Append the new link
    const newContent = existingContent.trimEnd() + '\n' + markdownLink + '\n';

    // Write the file
    try {
        fs.writeFileSync(contextFilePath, newContent, 'utf-8');
        vscode.window.showInformationMessage(`Added to context: ${normalizedRelativePath}`);
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to update AI-WRITER-CONTEXT.md: ${err}`);
        return;
    }

    // Open the context file in the editor
    const contextFileUri = vscode.Uri.file(contextFilePath);
    await vscode.window.showTextDocument(contextFileUri);
}

export function deactivate() { }
