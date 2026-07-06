#!/usr/bin/env bats

# Tests for vm/tools/ides/eclipse-ee.sh
#
# Run from the project root:
#   bats vm/tests/eclipse-ee.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/ides/eclipse-ee.sh"

_stub() {
    local name="$1" exit_code="${2:-0}"
    printf '#!/bin/bash\nprintf "%%s %%s\\n" "%s" "$*" >> "%s"\nexit %d\n' \
        "$name" "$CALLS_FILE" "$exit_code" > "$TEST_TMPDIR/bin/$name"
    chmod +x "$TEST_TMPDIR/bin/$name"
}

# wget that actually writes a valid gzip file to the -O destination, and a tar
# that produces a fake extracted 'eclipse-installer' dir under /opt (the
# archive's own fixed top-level name, before the script renames it) — needed
# so a fresh-install run can reach the mv/symlink steps instead of failing at
# the gzip integrity check.
_stub_real_download() {
    cat > "$TEST_TMPDIR/bin/wget" << WGETSTUB
#!/bin/bash
printf "wget %s\n" "\$*" >> "${CALLS_FILE}"
args=("\$@")
for ((i=0; i<\${#args[@]}; i++)); do
    if [[ "\${args[i]}" == "-O" ]]; then
        echo 'fake-tarball-content' | gzip > "\${args[i+1]}"
    fi
done
exit 0
WGETSTUB
    chmod +x "$TEST_TMPDIR/bin/wget"

    cat > "$TEST_TMPDIR/bin/tar" << TARSTUB
#!/bin/bash
printf "tar %s\n" "\$*" >> "${CALLS_FILE}"
mkdir -p /opt/eclipse-installer
printf '#!/bin/bash\necho "Eclipse Installer"\n' > /opt/eclipse-installer/eclipse-inst
chmod +x /opt/eclipse-installer/eclipse-inst
exit 0
TARSTUB
    chmod +x "$TEST_TMPDIR/bin/tar"
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

    _stub wget 0
    _stub tar  0

    # Default: Eclipse Enterprise installer 2026-03 already downloaded
    mkdir -p /opt/eclipse-ee-installer-2026-03
    printf '#!/bin/bash\necho "Eclipse Installer"\n' > /opt/eclipse-ee-installer-2026-03/eclipse-inst
    chmod +x /opt/eclipse-ee-installer-2026-03/eclipse-inst
    ln -sfn /opt/eclipse-ee-installer-2026-03 /opt/eclipse-ee-installer
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    rm -rf /opt/eclipse-ee-installer-2026-03 /opt/eclipse-ee-installer-2025-06 /opt/eclipse-ee-installer /opt/eclipse-installer
    rm -f /usr/share/applications/eclipse-installer.desktop
    rm -rf "$TEST_TMPDIR"
}

@test "exits 0 when Eclipse Enterprise installer is already present" {
    run bash "$SCRIPT" 2026-03
    [ "$status" -eq 0 ]
}

@test "skips wget when Eclipse Enterprise installer is already present" {
    run bash "$SCRIPT" 2026-03
    ! grep -q "^wget " "$CALLS_FILE"
}

@test "removes an incomplete installer directory and calls wget" {
    # Directory exists but eclipse-inst is not executable — incomplete download
    rm -f /opt/eclipse-ee-installer-2026-03/eclipse-inst
    touch /opt/eclipse-ee-installer-2026-03/eclipse-inst   # file exists, not executable
    run bash "$SCRIPT" 2026-03
    grep -q "^wget " "$CALLS_FILE"
}

@test "calls wget when the installer is not present" {
    rm -rf /opt/eclipse-ee-installer-2026-03 /opt/eclipse-ee-installer
    run bash "$SCRIPT" 2026-03
    grep -q "^wget " "$CALLS_FILE"
}

@test "accepts an explicit release argument" {
    rm -rf /opt/eclipse-ee-installer-2025-06
    run bash "$SCRIPT" 2025-06
    grep -q "2025-06" "$CALLS_FILE"
}

@test "symlinks /opt/eclipse-ee-installer to the versioned install dir after a fresh install" {
    rm -rf /opt/eclipse-ee-installer-2025-06
    _stub_real_download
    run bash "$SCRIPT" 2025-06
    [ "$status" -eq 0 ]
    [[ "$(readlink /opt/eclipse-ee-installer)" == "/opt/eclipse-ee-installer-2025-06" ]]
}

@test "installs a different release without removing the one already present" {
    # setup() already installed release 2026-03; requesting a different one
    # must not be blocked or overwritten just because /opt/eclipse-ee-installer
    # (the symlink) already points somewhere.
    _stub_real_download
    run bash "$SCRIPT" 2025-06
    [ "$status" -eq 0 ]
    grep -q "2025-06" "$CALLS_FILE"
    [ -x /opt/eclipse-ee-installer-2026-03/eclipse-inst ]
    [ -x /opt/eclipse-ee-installer-2025-06/eclipse-inst ]
    [[ "$(readlink /opt/eclipse-ee-installer)" == "/opt/eclipse-ee-installer-2025-06" ]]
}

@test "does not re-download when the same release is already installed" {
    _stub_real_download
    run bash "$SCRIPT" 2026-03
    [ "$status" -eq 0 ]
    ! grep -q "^wget " "$CALLS_FILE"
    [[ "$output" == *"already installed"* ]]
}
