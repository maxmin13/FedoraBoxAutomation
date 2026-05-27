#!/usr/bin/env bats

# Tests for vm/tools/languages/node.sh
#
# Run from the project root:
#   bats vm/tests/node.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/languages/node.sh"

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

    _stub dnf  0
    _stub curl 0
    _stub rpm  0
    _stub npm  0

    # Default node stub: reports v22.3.0 so the "already installed" path is taken.
    cat > "$TEST_TMPDIR/bin/node" << NODESTUB
#!/bin/bash
printf "node %s\n" "\$*" >> "${CALLS_FILE}"
echo "v22.3.0"
exit 0
NODESTUB
    chmod +x "$TEST_TMPDIR/bin/node"
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

@test "exits 0 when Node.js 22.x is already installed" {
    run bash "$SCRIPT" root
    [ "$status" -eq 0 ]
}

@test "does not call curl when the correct Node.js version is already installed" {
    run bash "$SCRIPT" root
    ! grep -q "^curl " "$CALLS_FILE"
}

@test "does not call dnf install when the correct Node.js version is already installed" {
    run bash "$SCRIPT" root
    ! grep -q "^dnf install" "$CALLS_FILE"
}

@test "runs NodeSource setup and dnf install when a different version is installed" {
    # Make node report v20.x so the install path is triggered (default major is 22)
    cat > "$TEST_TMPDIR/bin/node" << NODESTUB
#!/bin/bash
printf "node %s\n" "\$*" >> "${CALLS_FILE}"
echo "v20.0.0"
exit 0
NODESTUB
    chmod +x "$TEST_TMPDIR/bin/node"

    run bash "$SCRIPT" root
    grep -q "setup_22.x" "$CALLS_FILE"
    grep -q "^dnf install" "$CALLS_FILE"
}

@test "removes conflicting nodejs packages before installing a new version" {
    # rpm -qa reports a conflicting package from the system repos
    cat > "$TEST_TMPDIR/bin/rpm" << RPMSTUB
#!/bin/bash
printf "rpm %s\n" "\$*" >> "${CALLS_FILE}"
if [[ "\$*" == *"-qa"* ]]; then
    echo "nodejs20"
fi
exit 0
RPMSTUB
    chmod +x "$TEST_TMPDIR/bin/rpm"

    cat > "$TEST_TMPDIR/bin/node" << NODESTUB
#!/bin/bash
printf "node %s\n" "\$*" >> "${CALLS_FILE}"
echo "v20.0.0"
exit 0
NODESTUB
    chmod +x "$TEST_TMPDIR/bin/node"

    run bash "$SCRIPT" root 22
    grep -q "^dnf remove" "$CALLS_FILE"
}

@test "does not call dnf remove when no conflicting nodejs packages are present" {
    # Default rpm stub produces no output, so INSTALLED_NODEJS_PKGS is empty
    cat > "$TEST_TMPDIR/bin/node" << NODESTUB
#!/bin/bash
printf "node %s\n" "\$*" >> "${CALLS_FILE}"
echo "v20.0.0"
exit 0
NODESTUB
    chmod +x "$TEST_TMPDIR/bin/node"

    run bash "$SCRIPT" root 22
    ! grep -q "^dnf remove" "$CALLS_FILE"
}

@test "uses major version 22 by default when no version argument is given" {
    cat > "$TEST_TMPDIR/bin/node" << NODESTUB
#!/bin/bash
printf "node %s\n" "\$*" >> "${CALLS_FILE}"
echo "v20.0.0"
exit 0
NODESTUB
    chmod +x "$TEST_TMPDIR/bin/node"

    run bash "$SCRIPT" root
    grep -q "setup_22.x" "$CALLS_FILE"
}

@test "uses the specified major version when provided as the second argument" {
    cat > "$TEST_TMPDIR/bin/node" << NODESTUB
#!/bin/bash
printf "node %s\n" "\$*" >> "${CALLS_FILE}"
echo "v20.0.0"
exit 0
NODESTUB
    chmod +x "$TEST_TMPDIR/bin/node"

    run bash "$SCRIPT" root 18
    grep -q "setup_18.x" "$CALLS_FILE"
}

@test "skips install when the installed major version matches the requested version" {
    # node reports v18.x and we request major 18 — should skip the install path
    cat > "$TEST_TMPDIR/bin/node" << NODESTUB
#!/bin/bash
printf "node %s\n" "\$*" >> "${CALLS_FILE}"
echo "v18.17.0"
exit 0
NODESTUB
    chmod +x "$TEST_TMPDIR/bin/node"

    run bash "$SCRIPT" root 18
    [ "$status" -eq 0 ]
    ! grep -q "^curl " "$CALLS_FILE"
}
