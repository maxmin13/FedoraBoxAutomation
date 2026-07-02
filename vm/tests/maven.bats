#!/usr/bin/env bats

# Tests for vm/tools/build-tools/maven.sh
#
# Run from the project root:
#   bats vm/tests/maven.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/build-tools/maven.sh"

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

    _stub wget 0

    # maven.sh does `mv "${WORK_DIR}/apache-maven-${VERSION}" "${INSTALL_DIR}"`
    # right after extracting, so the tar stub must actually create that
    # directory (parsed from -xf/-C args) or the mv — and everything after
    # it, including the symlink — aborts under errexit.
    cat > "$TEST_TMPDIR/bin/tar" << 'TARSTUB'
#!/bin/bash
printf "tar %s\n" "$*" >> "PLACEHOLDER"
tgz="" dir="" args=("$@")
for ((i=0; i<${#args[@]}; i++)); do
    case "${args[i]}" in
        -xf) tgz="${args[i+1]}" ;;
        -C)  dir="${args[i+1]}" ;;
    esac
done
if [[ -n "${tgz}" && -n "${dir}" ]]; then
    name="$(basename "${tgz}" | sed 's/-bin\.tar\.gz$//')"
    mkdir -p "${dir}/${name}/bin"
    printf '#!/bin/bash\necho "Apache Maven"\n' > "${dir}/${name}/bin/mvn"
    chmod +x "${dir}/${name}/bin/mvn"
fi
exit 0
TARSTUB
    sed -i "s|PLACEHOLDER|${CALLS_FILE}|g" "$TEST_TMPDIR/bin/tar"
    chmod +x "$TEST_TMPDIR/bin/tar"

    # curl stub: returns a fake Apache directory listing so MVN_VERSION resolves
    # to 3.9.9 without hitting the network.
    cat > "$TEST_TMPDIR/bin/curl" << 'EOF'
#!/bin/bash
printf '<a href="3.9.9/">3.9.9/</a>\n'
exit 0
EOF
    chmod +x "$TEST_TMPDIR/bin/curl"

    # Default: Maven 3.9.9 already installed at the versioned path.
    mkdir -p /opt/maven-3.9.9/bin
    printf '#!/bin/bash\necho "Apache Maven 3.9.9"\n' > /opt/maven-3.9.9/bin/mvn
    chmod +x /opt/maven-3.9.9/bin/mvn
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    rm -rf /opt/maven-3.9.9 /opt/maven-3.9.5 /opt/maven-3.8.8
    rm -f /usr/local/bin/mvn
    rm -rf /var/cache/maven
    rm -rf "$TEST_TMPDIR"
}

@test "exits 0 when the requested version is already installed" {
    run bash "$SCRIPT" 3.9.9
    [ "$status" -eq 0 ]
}

@test "skips wget when the requested version is already installed" {
    run bash "$SCRIPT" 3.9.9
    ! grep -q "^wget " "$CALLS_FILE"
}

@test "downloads Maven when not installed" {
    rm -rf /opt/maven-3.9.9
    run bash "$SCRIPT" 3.9.9
    grep -q "^wget " "$CALLS_FILE"
}

@test "accepts an explicit version argument" {
    run bash "$SCRIPT" 3.8.8
    grep -q "3.8.8" "$CALLS_FILE"
}

@test "resolves latest version via curl when no version is given" {
    rm -rf /opt/maven-3.9.9
    run bash "$SCRIPT"
    grep -q "3.9.9" "$CALLS_FILE"
}

@test "installs a second version alongside the first without conflict" {
    # 3.9.9 already present; installing 3.9.5 should download without error.
    run bash "$SCRIPT" 3.9.5
    grep -q "3.9.5" "$CALLS_FILE"
}

@test "skips wget when tarball is already cached" {
    rm -rf /opt/maven-3.9.9
    mkdir -p /var/cache/maven
    touch /var/cache/maven/apache-maven-3.9.9-bin.tar.gz
    run bash "$SCRIPT" 3.9.9
    ! grep -q "^wget " "$CALLS_FILE"
}

@test "creates /usr/local/bin/mvn symlink on install" {
    rm -rf /opt/maven-3.9.9
    run bash "$SCRIPT" 3.9.9
    [ -L /usr/local/bin/mvn ]
}

@test "skips ln when symlink already points to the correct target" {
    # Pre-create the correct symlink; script must not call ln again.
    mkdir -p /opt/maven-3.9.9/bin
    ln -sfn /opt/maven-3.9.9/bin/mvn /usr/local/bin/mvn
    _stub ln 0
    run bash "$SCRIPT" 3.9.9
    ! grep -q "^ln " "$CALLS_FILE"
}

@test "updates /usr/local/bin/mvn symlink when already installed version is re-run" {
    # 3.9.9 already present; symlink must still point at it after re-run.
    run bash "$SCRIPT" 3.9.9
    [[ "$(readlink /usr/local/bin/mvn)" == */maven-3.9.9/* ]]
}

@test "updates /usr/local/bin/mvn symlink when switching to a different version" {
    # Install 3.9.5 on top of an already-present 3.9.9; symlink must point to 3.9.5.
    run bash "$SCRIPT" 3.9.5
    [[ "$(readlink /usr/local/bin/mvn)" == */maven-3.9.5/* ]]
}
