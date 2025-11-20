#!/bin/bash

# VSCode VS Writer Extension Build and Install Script
# 
# This script automates the complete build and installation process for the 
# VS Writer VSCode extension. It performs the following steps:
# 1. Installs npm dependencies
# 2. Compiles the TypeScript source code
# 3. Packages the extension into a .vsix file using vsce
# 4. Installs the packaged extension into VS Code
#
# The extension enables collaborative writing with AI using
# a custom HTML comment syntax.

# Exit on any error
set -e

# Function to handle errors
handle_error() {
    echo "Error: $1 failed!"
    exit 1
}

echo "Installing npm dependencies..."
npm install || handle_error "npm install"

echo "Compiling the project..."
npm run compile || handle_error "npm run compile"

echo "Packaging the extension..."
vsce package || handle_error "vsce package"

echo "Installing the extension in VS Code..."
code --install-extension vs-writer-0.0.1.vsix || handle_error "extension installation"

echo "Installation completed successfully!"

