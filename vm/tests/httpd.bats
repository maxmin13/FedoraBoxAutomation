#!/usr/bin/env bats

# Tests for vm/tools/web-servers/httpd.sh
#
# Run from the project root:
#   bats vm/tests/httpd.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/web-servers/httpd.sh"

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

    # Default: httpd already installed
    _stub rpm       0
    _stub dnf       0
    _stub httpd     0
    _stub setsebool 0
    _stub systemctl 0

    # httpd.sh reads and writes /etc/httpd/conf/httpd.conf
    mkdir -p /etc/httpd/conf
    [[ -f /etc/httpd/conf/httpd.conf ]] && \
        cp /etc/httpd/conf/httpd.conf "$TEST_TMPDIR/httpd.conf.bak"
    # Provide a minimal config that does not already include sites-enabled
    echo '# httpd config' > /etc/httpd/conf/httpd.conf
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    if [[ -f "$TEST_TMPDIR/httpd.conf.bak" ]]; then
        mv "$TEST_TMPDIR/httpd.conf.bak" /etc/httpd/conf/httpd.conf
    else
        rm -f /etc/httpd/conf/httpd.conf
    fi
    rm -rf "$TEST_TMPDIR"
}

@test "exits 1 when no login-user argument is provided" {
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
    [[ "$output" == *"login user not found"* ]]
}

@test "exits 0 when Apache is already installed" {
    run bash "$SCRIPT" root
    [ "$status" -eq 0 ]
}

@test "skips dnf install when Apache is already installed" {
    run bash "$SCRIPT" root
    ! grep -q "^dnf install -y httpd" "$CALLS_FILE"
}

@test "installs httpd when not present" {
    _stub rpm 1   # exit 1 = package not found
    run bash "$SCRIPT" root
    grep -q "^dnf install -y httpd" "$CALLS_FILE"
}

@test "enables and restarts the httpd service" {
    run bash "$SCRIPT" root
    grep -q "^systemctl enable httpd.service"  "$CALLS_FILE"
    grep -q "^systemctl restart httpd.service" "$CALLS_FILE"
}

@test "adds the sites-enabled include to httpd.conf" {
    run bash "$SCRIPT" root
    grep -q 'sites-enabled' /etc/httpd/conf/httpd.conf
}
