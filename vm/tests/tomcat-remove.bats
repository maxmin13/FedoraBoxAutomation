#!/usr/bin/env bats

# Tests for vm/tools/web-servers/tomcat/tomcat-remove.sh
#
# Run from the project root:
#   bats vm/tests/tomcat-remove.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/web-servers/tomcat/tomcat-remove.sh"

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

    # Default systemctl: is-active and is-enabled return 1 (not running/enabled);
    # all other subcommands (kill, stop, disable, daemon-reload) return 0.
    cat > "$TEST_TMPDIR/bin/systemctl" << 'SVCSTUB'
#!/bin/bash
printf "systemctl %s\n" "$*" >> "PLACEHOLDER"
[[ "$1" == "is-active" || "$1" == "is-enabled" ]] && exit 1
exit 0
SVCSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/systemctl"
    chmod +x "$TEST_TMPDIR/bin/systemctl"
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    rm -rf /opt/apache-tomcat-10.1.33-8080
    rm -f /etc/systemd/system/tomcat-10.1.33-8080.service
    rm -rf "$TEST_TMPDIR"
}

@test "exits 0 when neither the service nor the directory exists" {
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
}

@test "stops and kills a running service" {
    # is-active returns 0 → stop/kill path runs
    cat > "$TEST_TMPDIR/bin/systemctl" << 'SVCSTUB'
#!/bin/bash
printf "systemctl %s\n" "$*" >> "PLACEHOLDER"
[[ "$1" == "is-enabled" ]] && exit 1
exit 0
SVCSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/systemctl"
    chmod +x "$TEST_TMPDIR/bin/systemctl"
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
    grep -q "systemctl stop" "$CALLS_FILE"
}

@test "disables an enabled service" {
    # is-enabled returns 0 → disable runs
    cat > "$TEST_TMPDIR/bin/systemctl" << 'SVCSTUB'
#!/bin/bash
printf "systemctl %s\n" "$*" >> "PLACEHOLDER"
[[ "$1" == "is-active" ]] && exit 1
exit 0
SVCSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/systemctl"
    chmod +x "$TEST_TMPDIR/bin/systemctl"
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
    grep -q "systemctl disable" "$CALLS_FILE"
}

@test "removes the service file when it exists" {
    touch /etc/systemd/system/tomcat-10.1.33-8080.service
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
    [[ ! -f /etc/systemd/system/tomcat-10.1.33-8080.service ]]
}

@test "removes the installation directory when it exists" {
    mkdir -p /opt/apache-tomcat-10.1.33-8080
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
    [[ ! -d /opt/apache-tomcat-10.1.33-8080 ]]
}
