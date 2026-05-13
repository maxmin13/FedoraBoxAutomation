#!/usr/bin/env bats

# Tests for vm/tools/web-servers/tomcat/tomcat.sh
#
# Run from the project root:
#   bats vm/tests/tomcat.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/web-servers/tomcat/tomcat.sh"

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

    _stub wget       0
    _stub tar        0
    _stub chown      0
    _stub systemctl  0
    _stub readlink   0

    # Default: ss reports no listeners (port is free)
    _stub ss 0

    # Provide a fake Java installation so JAVA_HOME check passes
    mkdir -p "$TEST_TMPDIR/java/bin"
    printf '#!/bin/bash\necho "openjdk 21"\n' > "$TEST_TMPDIR/java/bin/java"
    chmod +x "$TEST_TMPDIR/java/bin/java"
    export JAVA_HOME="$TEST_TMPDIR/java"
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    rm -rf /opt/apache-tomcat-10.1.33-8080
    rm -rf /opt/tomcat-cache
    rm -f /etc/systemd/system/tomcat-10.1.33-8080.service
    rm -rf "$TEST_TMPDIR"
}

@test "exits 1 when no login-user argument is provided" {
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
    [[ "$output" == *"login user not found"* ]]
}

@test "exits 1 when JAVA_HOME is not set and Java is not found" {
    unset JAVA_HOME
    # readlink stub returns nothing → JAVA_BIN is empty → exits 1
    run bash "$SCRIPT" root
    [ "$status" -eq 1 ]
    [[ "$output" == *"JAVA_HOME is not set"* ]]
}

@test "exits 1 when the installation directory already exists" {
    mkdir -p /opt/apache-tomcat-10.1.33-8080
    run bash "$SCRIPT" root
    [ "$status" -eq 1 ]
    [[ "$output" == *"already exists"* ]]
}

@test "exits 1 when the port is already in use" {
    # ss stub returns a line containing ":8080 " — port appears occupied
    cat > "$TEST_TMPDIR/bin/ss" << 'SSSTUB'
#!/bin/bash
printf "ss %s\n" "$*" >> "PLACEHOLDER"
echo "tcp LISTEN 0 128 0.0.0.0:8080 0.0.0.0:*"
exit 0
SSSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/ss"
    chmod +x "$TEST_TMPDIR/bin/ss"
    run bash "$SCRIPT" root
    [ "$status" -eq 1 ]
    [[ "$output" == *"Port 8080 is already in use"* ]]
}

@test "calls wget when the cached archive is not present" {
    run bash "$SCRIPT" root
    grep -q "^wget " "$CALLS_FILE"
}

@test "skips wget when the cached archive is already present" {
    mkdir -p /opt/tomcat-cache
    touch /opt/tomcat-cache/apache-tomcat-10.1.33.tar.gz
    run bash "$SCRIPT" root
    ! grep -q "^wget " "$CALLS_FILE"
}
