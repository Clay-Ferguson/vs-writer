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
        let userContent = request.prompt;
        let editorContext: WriterContext | undefined;

        // If the user didn't type much, or explicitly asked to read the file, check the editor
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            editorContext = findWriterBlock(editor);
            if (editorContext) {
                // If we found a block, we append it to the user's prompt (or use it as the prompt)
                userContent = `${userContent}\n\nHere is the context from the editor:\n${editorContext.pContent}`;
                stream.markdown(`*Processing block at line ${editorContext.range.start.line + 1}...*\n\n`);
            }
        }

        if (!userContent.trim()) {
            stream.markdown('Please provide a prompt or place your cursor inside a `<!-- p --> ... <!-- e -->` block.');
            return;
        }

        // Construct the messages
        const messages = [
            vscode.LanguageModelChatMessage.User(systemPrompt),
            vscode.LanguageModelChatMessage.User(userContent)
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

            // We need to find the <!-- a --> tag within the range and insert after it
            const textDoc = editor.document;
            const blockText = textDoc.getText(range);
            
            // Simple regex to find where to insert
            // We look for <!-- a --> and insert after it
            const aTagIndex = blockText.indexOf('<!-- a -->');
            if (aTagIndex !== -1) {
                const insertOffset = textDoc.offsetAt(range.start) + aTagIndex + '<!-- a -->'.length;
                const insertPos = textDoc.positionAt(insertOffset);
                
                await editor.edit(editBuilder => {
                    // Optional: Clear existing content in 'a' section if it exists?
                    // For now, let's just insert/append.
                    // Actually, the prompt says "overwrite". 
                    // Let's try to find if there is content between <a> and <e>
                    const eTagIndex = blockText.indexOf('<!-- e -->');
                    if (eTagIndex !== -1 && eTagIndex > aTagIndex) {
                        const startReplace = insertPos;
                        const endReplace = textDoc.positionAt(textDoc.offsetAt(range.start) + eTagIndex);
                        const replaceRange = new vscode.Range(startReplace, endReplace);
                        editBuilder.replace(replaceRange, '\n' + text + '\n');
                    } else {
                        editBuilder.insert(insertPos, '\n' + text + '\n');
                    }
                });
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

    // 5. Register Commands to Remove Sections
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-writer.removePSections', () => removeSections('P'))
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-writer.removeASections', () => removeSections('A'))
    );

    // 6. Register Commands to Hide Sections
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-writer.hidePSections', () => hideSections('P'))
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-writer.hideASections', () => hideSections('A'))
    );

    // 7. Register Command to Create P-A-E Section from Selection
    context.subscriptions.push(
        vscode.commands.registerCommand('vs-writer.createPAESection', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const selection = editor.selection;
            const selectedText = editor.document.getText(selection);

            if (!selectedText.trim()) {
                vscode.window.showInformationMessage('Please select some text to convert.');
                return;
            }

            const replacement = `<!-- p -->\n${selectedText}\n<!-- a -->\n<!-- e -->`;
            
            await editor.edit(editBuilder => {
                editBuilder.replace(selection, replacement);
            });

            // Trigger generation immediately
            vscode.commands.executeCommand('vs-writer.generate');
        })
    );
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

function findWriterBlock(editor: vscode.TextEditor): WriterContext | undefined {
    const text = editor.document.getText();
    const cursorOffset = editor.document.offsetAt(editor.selection.active);

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

export function deactivate() {}
