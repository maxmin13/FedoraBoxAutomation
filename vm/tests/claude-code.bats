#!/usr/bin/env bats

# Tests for vm/tools/ai/claude-code.sh
#
# Run from the project root:
#   bats vm/tests/claude-code.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/ai/claude-code.sh"

_stub() {
    local name="$1" exit_code="${2:-0}"
    printf '#!/bin/bash\nprintf "%%s %%s\\n" "%s" "$*" >> "%s"\nexit %d\n' \
        "$name" "$CALLS_FILE" "$exit_code" > "$TEST_TMPDIR/bin/$name"
    chmod +x "$TEST_TMPDIR/bin/$name"
}

setup() {
    TEST_TMPDIR="$(mktemp -d)"
    export CALLS_FILE="$TEST_TMPDIR/calls.log"
    touch "$CALLS_FILE"
    mkdir -p "$TEST_TMPDIR/bin"
    export PATH="$TEST_TMPDIR/bin:$PATH"

    [[ -f /tmp/common.sh ]] && cp /tmp/common.sh "$TEST_TMPDIR/common.sh.bak"
    cat > /tmp/common.sh << 'STUB'
#!/bin/bash
set -o errexit -o pipefail
SCRIPT_NAME="$(basename "${BASH_SOURCE[1]:-$0}")"
_log() { printf '%s [%-5s] %s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" "$SCRIPT_NAME" "${*:2}"; }
log_info()  { _log INFO  "$@"; }
log_warn()  { _log WARN  "$@"; }
log_error() { _log ERROR "$@"; }
STEP()      { echo; _log STEP "===[ $* ]==="; echo; }
require_login_user() {
    local user="${1:-}"
    if [[ -z "${user}" ]]; then
        log_error 'Desktop username is required as the first argument.'
        exit 1
    fi
}
STUB

    _stub npm 0
    _stub su  0

    # Default node stub: reports v22.3.0 (>= 18, so prerequisite is satisfied).
    cat > "$TEST_TMPDIR/bin/node" << NODESTUB
#!/bin/bash
printf "node %s\n" "\$*" >> "${CALLS_FILE}"
echo "v22.3.0"
exit 0
NODESTUB
    chmod +x "$TEST_TMPDIR/bin/node"

    # Default claude stub: already installed, reports version.
    cat > "$TEST_TMPDIR/bin/claude" << CLAUDESTUB
#!/bin/bash
printf "claude %s\n" "\$*" >> "${CALLS_FILE}"
echo "1.0.0"
exit 0
CLAUDESTUB
    chmod +x "$TEST_TMPDIR/bin/claude"
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    rm -rf "$TEST_TMPDIR"
}

@test "exits 1 when no login-user argument is provided" {
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
    [[ "$output" == *"Desktop username is required"* ]]
}

@test "exits 0 when claude is already installed" {
    run bash "$SCRIPT" root
    [ "$status" -eq 0 ]
}

@test "does not call npm install when claude is already installed" {
    run bash "$SCRIPT" root
    ! grep -q "^npm install" "$CALLS_FILE"
}

@test "calls npm install when claude is not installed" {
    rm -f "$TEST_TMPDIR/bin/claude"

    run bash "$SCRIPT" root
    grep -q "^npm install" "$CALLS_FILE"
}

@test "exits 2 when node is not installed" {
    rm -f "$TEST_TMPDIR/bin/node"
    rm -f "$TEST_TMPDIR/bin/claude"

    run bash "$SCRIPT" root
    [ "$status" -eq 2 ]
    [[ "$output" == *"Node.js is not installed"* ]]
}

@test "exits 2 when node version is below 18" {
    cat > "$TEST_TMPDIR/bin/node" << NODESTUB
#!/bin/bash
printf "node %s\n" "\$*" >> "${CALLS_FILE}"
echo "v16.20.0"
exit 0
NODESTUB
    chmod +x "$TEST_TMPDIR/bin/node"
    rm -f "$TEST_TMPDIR/bin/claude"

    run bash "$SCRIPT" root
    [ "$status" -eq 2 ]
    [[ "$output" == *"Node.js 18+ is required"* ]]
}

@test "exits 0 when node 18 is installed and claude is not" {
    cat > "$TEST_TMPDIR/bin/node" << NODESTUB
#!/bin/bash
printf "node %s\n" "\$*" >> "${CALLS_FILE}"
echo "v18.20.0"
exit 0
NODESTUB
    chmod +x "$TEST_TMPDIR/bin/node"
    rm -f "$TEST_TMPDIR/bin/claude"

    run bash "$SCRIPT" root
    [ "$status" -eq 0 ]
    grep -q "^npm install" "$CALLS_FILE"
}

@test "installs VS Code extension when code is on PATH" {
    _stub code 0

    # The default `su` stub is a no-op that never runs its -c argument, so it
    # would never actually invoke our `code` stub. Override it here (only —
    # not as the shared default) to execute -c, now that `code` is our own
    # controlled stub rather than whatever a real `su` might find on PATH.
    cat > "$TEST_TMPDIR/bin/su" << 'SUSTUB'
#!/bin/bash
printf "su %s\n" "$*" >> "PLACEHOLDER"
args=("$@")
for ((i=0; i<${#args[@]}; i++)); do
    if [[ "${args[i]}" == "-c" ]]; then
        eval "${args[i+1]}"
        exit $?
    fi
done
exit 0
SUSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/su"
    chmod +x "$TEST_TMPDIR/bin/su"

    run bash "$SCRIPT" root
    grep -q "^code " "$CALLS_FILE"
    [[ "$output" == *"Claude Code extension"* ]]
}

@test "skips VS Code extension when code is not on PATH" {
    # No code stub — not present in TEST_TMPDIR/bin. On a dev machine with a
    # Windows VS Code install, WSL interop appends its bin dir to PATH, so
    # strip any dir that resolves a real `code` to genuinely simulate absence.
    local dir filtered_path=""
    while IFS= read -r dir; do
        [[ -x "${dir}/code" ]] && continue
        filtered_path="${filtered_path:+${filtered_path}:}${dir}"
    done < <(printf '%s' "$PATH" | tr ':' '\n')
    PATH="${filtered_path}"

    run bash "$SCRIPT" root
    ! grep -q "^code " "$CALLS_FILE"
    [[ "$output" == *"Visual Studio Code not found"* ]]
}
