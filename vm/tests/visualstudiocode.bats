#!/usr/bin/env bats

# Tests for vm/tools/ides/visualstudiocode.sh
#
# Run from the project root:
#   bats vm/tests/visualstudiocode.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/ides/visualstudiocode.sh"
VERSION='1.90.0'
VSCODE_DIR="/opt/vscode-${VERSION}"

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

    _stub update-desktop-database 0

    # visualstudiocode.sh runs `gzip -t` on the downloaded file before
    # extracting, so the wget stub must write real gzip content or every
    # "not installed" test aborts at the integrity check.
    cat > "$TEST_TMPDIR/bin/wget" << 'WGETSTUB'
#!/bin/bash
printf "wget %s\n" "$*" >> "PLACEHOLDER"
args=("$@")
for ((i=0; i<${#args[@]}; i++)); do
    [[ "${args[i]}" == "-O" ]] && echo "fake" | gzip > "${args[i+1]}"
done
exit 0
WGETSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/wget"
    chmod +x "$TEST_TMPDIR/bin/wget"

    # visualstudiocode.sh does:
    #   tar -xf "$CACHED_TAR" --directory "$EXTRACT_TMP"
    #   EXTRACTED_DIR=$(find "$EXTRACT_TMP" -maxdepth 1 -mindepth 1 -type d | head -1)
    #   mv "$EXTRACTED_DIR" "$VSCODE_DIR"
    # so the tar stub must create exactly one subdirectory (with bin/code
    # inside) under the --directory target, or extraction "finds" nothing.
    cat > "$TEST_TMPDIR/bin/tar" << 'TARSTUB'
#!/bin/bash
printf "tar %s\n" "$*" >> "PLACEHOLDER"
dir="" args=("$@")
for ((i=0; i<${#args[@]}; i++)); do
    [[ "${args[i]}" == "--directory" ]] && dir="${args[i+1]}"
done
if [[ -n "${dir}" ]]; then
    mkdir -p "${dir}/VSCode-linux-x64/bin"
    printf '#!/bin/bash\necho "code"\n' > "${dir}/VSCode-linux-x64/bin/code"
    chmod +x "${dir}/VSCode-linux-x64/bin/code"
fi
exit 0
TARSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/tar"
    chmod +x "$TEST_TMPDIR/bin/tar"

    # Default: this version already installed — create the sentinel executable
    mkdir -p "${VSCODE_DIR}/bin"
    printf '#!/bin/bash\necho "1.90.0"\n' > "${VSCODE_DIR}/bin/code"
    chmod +x "${VSCODE_DIR}/bin/code"
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    rm -rf "${VSCODE_DIR}" /opt/vscode-cache
    rm -f "/usr/bin/code-${VERSION}" "/usr/share/applications/vscode-${VERSION}.desktop"
    rm -rf "$TEST_TMPDIR"
}

@test "exits 1 when no version argument is provided" {
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
    [[ "$output" == *"version argument is required"* ]]
}

@test "exits 0 when this VS Code version is already installed" {
    run bash "$SCRIPT" "${VERSION}"
    [ "$status" -eq 0 ]
}

@test "skips wget when this VS Code version is already installed" {
    run bash "$SCRIPT" "${VERSION}"
    ! grep -q "^wget " "$CALLS_FILE"
}

@test "removes an incomplete installation and calls wget" {
    # Directory exists but code is not executable — incomplete install
    rm -f "${VSCODE_DIR}/bin/code"
    touch "${VSCODE_DIR}/bin/code"
    run bash "$SCRIPT" "${VERSION}"
    grep -q "^wget " "$CALLS_FILE"
}

@test "calls wget when VS Code is not installed" {
    rm -rf "${VSCODE_DIR}"
    run bash "$SCRIPT" "${VERSION}"
    grep -q "^wget " "$CALLS_FILE"
}

@test "downloads from the versioned update.code.visualstudio.com URL" {
    rm -rf "${VSCODE_DIR}"
    run bash "$SCRIPT" "${VERSION}"
    grep -q "update.code.visualstudio.com/${VERSION}/linux-x64/stable" "$CALLS_FILE"
}

@test "resolves 'latest' via the VS Code update API" {
    rm -rf "${VSCODE_DIR}" "/opt/vscode-1.95.2"
    cat > "$TEST_TMPDIR/bin/curl" << 'CURLSTUB'
#!/bin/bash
printf "curl %s\n" "$*" >> "PLACEHOLDER"
echo '["1.95.2"]'
exit 0
CURLSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/curl"
    chmod +x "$TEST_TMPDIR/bin/curl"

    run bash "$SCRIPT" latest
    [ "$status" -eq 0 ]
    [[ "$output" == *"Latest version: 1.95.2"* ]]
    rm -rf /opt/vscode-1.95.2
    rm -f /usr/bin/code-1.95.2 /usr/share/applications/vscode-1.95.2.desktop
}
