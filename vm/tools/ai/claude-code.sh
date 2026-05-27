#!/bin/bash

##
## Description: Installs Claude Code (Anthropic's AI coding CLI) as a global
##              npm package. Requires Node.js 18+ to be installed first.
##              The Anthropic API key must be set separately by the user.
## Usage:       sudo ./claude-code.sh <login-user>
## Parameters:  $1 <login-user>  Non-root desktop username (e.g. maxmin)
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
require_login_user "${LOGIN_USER}"

####
STEP "Claude Code"
####

# Verify Node.js 18+ is present.
if ! command -v node > /dev/null 2>&1; then
    log_error 'Node.js is not installed. Install Node.js 18+ first (Languages -> Node.js).'
    exit 2
fi

INSTALLED_NODE_MAJOR="$(node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
if [[ "${INSTALLED_NODE_MAJOR}" -lt 18 ]]; then
    log_error "Node.js 18+ is required. Installed version: $(node --version). Upgrade Node.js first."
    exit 2
fi

if command -v claude > /dev/null 2>&1; then
    log_info "Claude Code already installed: $(claude --version 2>/dev/null || echo 'version unknown')"
else
    log_info "Installing Claude Code ..."
    npm install -g @anthropic-ai/claude-code
    log_info "Claude Code installed: $(claude --version)"
fi

####
STEP "VS Code extension"
####

if command -v code > /dev/null 2>&1; then
    log_info "Visual Studio Code detected — installing Claude Code extension ..."
    su - "${LOGIN_USER}" -c "code --install-extension anthropic.claude-code"
    log_info "Extension installed. Restart VS Code to activate it."
else
    log_info "Visual Studio Code not found — skipping extension install."
    log_info "If you install VS Code later, run:"
    log_info "  code --install-extension anthropic.claude-code"
fi

log_info "-------------------------------------------------------"
log_info " Claude Code quick-reference"
log_info "-------------------------------------------------------"
log_info " An Anthropic API key is required to use Claude Code."
log_info " Add this line to /home/${LOGIN_USER}/.bash_profile :"
log_info "   export ANTHROPIC_API_KEY=<your-api-key>"
log_info " Then reload the profile:"
log_info "   source /home/${LOGIN_USER}/.bash_profile"
log_info ""
log_info " Get a key at: https://console.anthropic.com/"
log_info ""
log_info " Terminal:  claude                              (interactive)"
log_info "            claude -p 'explain this file' <f>  (one-off)"
log_info " VS Code:   open the Claude panel in the sidebar (if extension installed)"
log_info " Eclipse:   use Claude Code in a terminal alongside the IDE"
log_info "-------------------------------------------------------"
