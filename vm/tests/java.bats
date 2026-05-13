#!/usr/bin/env bats

# Tests for vm/tools/languages/java.sh
#
# Run from the project root:
#   bats vm/tests/java.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/languages/java.sh"

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
STUB

    # Default: Java already installed
    _stub java         0
    _stub dnf          0
    _stub wget         0
    _stub alternatives 0
    _stub readlink     0
    _stub python3      0

    # java.sh appends JAVA_HOME to ~/.bash_profile — back it up
    [[ -f /root/.bash_profile ]] && cp /root/.bash_profile "$TEST_TMPDIR/bash_profile.bak"
    touch /root/.bash_profile
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    if [[ -f "$TEST_TMPDIR/bash_profile.bak" ]]; then
        mv "$TEST_TMPDIR/bash_profile.bak" /root/.bash_profile
    else
        rm -f /root/.bash_profile
    fi
    rm -rf "$TEST_TMPDIR"
}

@test "exits 1 when no login-user argument is provided" {
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
    [[ "$output" == *"login user not found"* ]]
}

@test "exits 0 when Java is already installed" {
    run bash "$SCRIPT" root
    [ "$status" -eq 0 ]
}

@test "skips download when Java is already installed" {
    run bash "$SCRIPT" root
    ! grep -q "^wget " "$CALLS_FILE"
}

@test "downloads and installs Oracle JDK when Java is not present" {
    _stub java 1   # exit 1 = java not found
    run bash "$SCRIPT" root 21
    grep -q "^wget " "$CALLS_FILE"
}

@test "adds JAVA_HOME to .bash_profile when not already present" {
    run bash "$SCRIPT" root
    grep -q 'JAVA_HOME' /root/.bash_profile
}

@test "skips adding JAVA_HOME when it is already in .bash_profile" {
    echo 'export JAVA_HOME=/usr/lib/jvm/java' >> /root/.bash_profile
    run bash "$SCRIPT" root
    # Only one JAVA_HOME line should exist (no duplicate)
    [ "$(grep -c 'JAVA_HOME' /root/.bash_profile)" -eq 1 ]
}
