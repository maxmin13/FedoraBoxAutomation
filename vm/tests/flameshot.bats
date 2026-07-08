#!/usr/bin/env bats

# Tests for vm/tools/desktop/flameshot.sh
#
# Run from the project root:
#   bats vm/tests/flameshot.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/desktop/flameshot.sh"

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
    _stub rpm  1  # flameshot not installed by default

    # Custom sudo stub: logs every call, and answers `gsettings list-keys` for the
    # media-keys schema with MEDIA_KEYS_SCHEMA_KEYS (defaults to the older GNOME
    # schema that still has the legacy screenshot/screenshot-clip keys).
    cat > "$TEST_TMPDIR/bin/sudo" << 'SUDOSTUB'
#!/bin/bash
printf "sudo %s\n" "$*" >> "PLACEHOLDER"
if [[ "$*" == *"list-keys org.gnome.settings-daemon.plugins.media-keys"* ]]; then
    printf '%s\n' "${MEDIA_KEYS_SCHEMA_KEYS:-screenshot
screenshot-clip
custom-keybindings}"
fi
exit 0
SUDOSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/sudo"
    chmod +x "$TEST_TMPDIR/bin/sudo"

    cat > "$TEST_TMPDIR/bin/id" << 'IDSTUB'
#!/bin/bash
printf "id %s\n" "$*" >> "PLACEHOLDER"
echo "1000"
exit 0
IDSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/id"
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

@test "exits 0 with all tools stubbed" {
    run bash "$SCRIPT" root
    [ "$status" -eq 0 ]
}

@test "installs flameshot via dnf when not installed" {
    run bash "$SCRIPT" root
    grep -q "^dnf install -y flameshot" "$CALLS_FILE"
}

@test "skips dnf install when flameshot is already installed" {
    _stub rpm 0
    run bash "$SCRIPT" root
    [ "$status" -eq 0 ]
    ! grep -q "^dnf install -y flameshot" "$CALLS_FILE"
}

@test "configures Print Screen key binding via gsettings" {
    run bash "$SCRIPT" root
    grep -q "flameshot gui" "$CALLS_FILE"
}

@test "disables built-in screenshot shortcut when the schema still has it" {
    run bash "$SCRIPT" root
    grep -q "screenshot \[\]" "$CALLS_FILE"
}

@test "succeeds and skips the legacy screenshot keys when the schema no longer has them" {
    export MEDIA_KEYS_SCHEMA_KEYS='custom-keybindings'
    run bash "$SCRIPT" root
    [ "$status" -eq 0 ]
    ! grep -q "screenshot \[\]" "$CALLS_FILE"
    ! grep -q "screenshot-clip \[\]" "$CALLS_FILE"
    grep -q "flameshot gui" "$CALLS_FILE"
}
