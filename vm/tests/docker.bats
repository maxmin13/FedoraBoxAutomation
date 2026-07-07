#!/usr/bin/env bats

# Tests for vm/tools/containers/docker.sh
#
# Run from the project root:
#   bats vm/tests/docker.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/containers/docker.sh"

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

    # Default: Docker already installed, user already in docker group
    _stub docker    0
    _stub dnf       0
    _stub systemctl 0
    _stub usermod   0
    printf '#!/bin/bash\nprintf "rpm %%s\\n" "$*" >> "%s"\n[[ "$*" == "-q docker-ce" ]] && exit 0\nexit 1\n' \
        "$CALLS_FILE" > "$TEST_TMPDIR/bin/rpm"
    chmod +x "$TEST_TMPDIR/bin/rpm"
    # id -nG returns groups including docker
    printf '#!/bin/bash\n[[ "$1" == "-u" ]] && echo 0 && exit 0\n[[ "$1" == "-nG" ]] && echo "users wheel docker" && exit 0\n' \
        > "$TEST_TMPDIR/bin/id"
    chmod +x "$TEST_TMPDIR/bin/id"
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

@test "exits 0 when Docker is already installed" {
    run bash "$SCRIPT" testuser
    [ "$status" -eq 0 ]
}

@test "skips dnf install when Docker is already installed" {
    run bash "$SCRIPT" testuser
    ! grep -q "^dnf install -y docker-ce" "$CALLS_FILE"
}

@test "installs Docker CE packages when Docker is not present" {
    _stub rpm 1   # exit 1 = docker-ce package not found
    run bash "$SCRIPT" testuser
    grep -q "^dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin" "$CALLS_FILE"
}

@test "does not report success when Docker is already installed" {
    run bash "$SCRIPT" testuser
    [[ "$output" == *"Docker already installed."* ]]
    [[ "$output" != *"Docker successfully installed."* ]]
}

@test "enables and starts the docker service" {
    run bash "$SCRIPT" testuser
    grep -q "^systemctl enable --now docker" "$CALLS_FILE"
}

@test "prints systemctl instructions after installing" {
    run bash "$SCRIPT" testuser
    [[ "$output" == *"systemctl start|stop|restart|status docker"* ]]
}

@test "adds user to docker group when not already a member" {
    printf '#!/bin/bash\n[[ "$1" == "-u" ]] && echo 0 && exit 0\n[[ "$1" == "-nG" ]] && echo "users wheel" && exit 0\n' \
        > "$TEST_TMPDIR/bin/id"
    run bash "$SCRIPT" testuser
    grep -q "^usermod -aG docker testuser" "$CALLS_FILE"
}

@test "skips usermod when user is already in docker group" {
    run bash "$SCRIPT" testuser
    ! grep -q "^usermod " "$CALLS_FILE"
}
