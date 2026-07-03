#!/usr/bin/env bats

# Tests for vm/tools/web-servers/httpd.sh
#
# Run from the project root:
#   bats vm/tests/httpd.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/web-servers/httpd.sh"
VERSION='2.4.65'
INSTALL_DIR="/opt/httpd-${VERSION}"
CACHE_DIR='/opt/httpd-cache'
SERVICE_FILE="/etc/systemd/system/httpd-${VERSION}.service"

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

    _stub dnf 0

    # HEAD check for the primary mirror always succeeds by default.
    _stub curl 0

    # httpd.sh does a real source build: `cd "$BUILD_DIR" && tar -xzf ...`,
    # `cd httpd-<version>` and runs `./configure --prefix=<dir> ...` (a
    # relative-path script inside the extracted tree, not a PATH command),
    # then `make -j"$(nproc)"` and `make install`. The tar stub extracts a
    # fake source tree with a `configure` stub that records --prefix; the
    # make stub, when called with "install", uses that recorded prefix to
    # populate a fake install (conf/httpd.conf, bin/httpd, bin/apachectl) —
    # everything `make install` would normally produce.
    cat > "$TEST_TMPDIR/bin/tar" << TARSTUB
#!/bin/bash
printf "tar %s\n" "\$*" >> "${CALLS_FILE}"
mkdir -p "httpd-${VERSION}"
cat > "httpd-${VERSION}/configure" << 'CONFIGURESTUB'
#!/bin/bash
for a in "\$@"; do
    case "\$a" in
        --prefix=*) echo "\${a#--prefix=}" > "${TEST_TMPDIR}/prefix" ;;
    esac
done
exit 0
CONFIGURESTUB
chmod +x "httpd-${VERSION}/configure"
exit 0
TARSTUB
    chmod +x "$TEST_TMPDIR/bin/tar"

    cat > "$TEST_TMPDIR/bin/make" << MAKESTUB
#!/bin/bash
printf "make %s\n" "\$*" >> "${CALLS_FILE}"
if [[ "\$*" == *install* ]]; then
    prefix=\$(cat "${TEST_TMPDIR}/prefix" 2>/dev/null)
    if [[ -n "\${prefix}" ]]; then
        mkdir -p "\${prefix}/conf" "\${prefix}/bin" "\${prefix}/htdocs"
        echo '#ServerName www.example.com:80' > "\${prefix}/conf/httpd.conf"
        printf '#!/bin/bash\necho "Server version: Apache/${VERSION}"\nexit 0\n' > "\${prefix}/bin/httpd"
        chmod +x "\${prefix}/bin/httpd"
        printf '#!/bin/bash\nexit 0\n' > "\${prefix}/bin/apachectl"
        chmod +x "\${prefix}/bin/apachectl"
    fi
fi
exit 0
MAKESTUB
    chmod +x "$TEST_TMPDIR/bin/make"

    _stub systemctl 0

    # Default: tarball already cached, so the download/checksum path is
    # skipped and the build proceeds straight from the cache.
    mkdir -p "${CACHE_DIR}"
    touch "${CACHE_DIR}/httpd-${VERSION}.tar.gz"

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
    rm -rf "${INSTALL_DIR}" "${CACHE_DIR}" /opt/httpd
    rm -f "${SERVICE_FILE}"
    rm -rf "$TEST_TMPDIR"
}

@test "exits 1 when no login-user argument is provided" {
    run bash "$SCRIPT"
    [ "$status" -eq 1 ]
    [[ "$output" == *"Desktop username is required"* ]]
}

@test "exits 0 when this Apache version is already installed" {
    mkdir -p "${INSTALL_DIR}"
    run bash "$SCRIPT" root "${VERSION}"
    [ "$status" -eq 0 ]
    [[ "$output" == *"already installed"* ]]
}

@test "does not rebuild when already installed" {
    mkdir -p "${INSTALL_DIR}"
    run bash "$SCRIPT" root "${VERSION}"
    ! grep -q "^make " "$CALLS_FILE"
    ! grep -q "^tar " "$CALLS_FILE"
}

@test "builds and installs Apache from the cached source tarball" {
    run bash "$SCRIPT" root "${VERSION}"
    [ "$status" -eq 0 ]
    [ -x "${INSTALL_DIR}/bin/httpd" ]
    grep -q "^make .*install" "$CALLS_FILE"
}

@test "downloads the source tarball when not cached" {
    rm -f "${CACHE_DIR}/httpd-${VERSION}.tar.gz"
    cat > "$TEST_TMPDIR/bin/curl" << CURLSTUB
#!/bin/bash
printf "curl %s\n" "\$*" >> "${CALLS_FILE}"
args=("\$@")
for ((i=0; i<\${#args[@]}; i++)); do
    if [[ "\${args[i]}" == "-o" ]]; then
        echo 'fake-tarball-content' > "\${args[i+1]}"
    fi
done
if [[ "\$*" == *.sha256* ]]; then
    sha256sum <<< 'fake-tarball-content' | awk '{print \$1}'
fi
exit 0
CURLSTUB
    chmod +x "$TEST_TMPDIR/bin/curl"

    run bash "$SCRIPT" root "${VERSION}"
    [ "$status" -eq 0 ]
    [ -f "${CACHE_DIR}/httpd-${VERSION}.tar.gz" ]
}

@test "exits 1 when the downloaded tarball fails checksum verification" {
    rm -f "${CACHE_DIR}/httpd-${VERSION}.tar.gz"
    cat > "$TEST_TMPDIR/bin/curl" << CURLSTUB
#!/bin/bash
printf "curl %s\n" "\$*" >> "${CALLS_FILE}"
args=("\$@")
for ((i=0; i<\${#args[@]}; i++)); do
    if [[ "\${args[i]}" == "-o" ]]; then
        echo 'fake-tarball-content' > "\${args[i+1]}"
    fi
done
if [[ "\$*" == *.sha256* ]]; then
    echo 'deadbeef0000000000000000000000000000000000000000000000000badc0de'
fi
exit 0
CURLSTUB
    chmod +x "$TEST_TMPDIR/bin/curl"

    run bash "$SCRIPT" root "${VERSION}"
    [ "$status" -eq 1 ]
    [[ "$output" == *"Checksum mismatch"* ]]
}

@test "sets ServerName in httpd.conf after install" {
    run bash "$SCRIPT" root "${VERSION}"
    [ "$status" -eq 0 ]
    grep -q 'ServerName localhost' "${INSTALL_DIR}/conf/httpd.conf"
}

@test "symlinks /opt/httpd to the versioned install dir" {
    run bash "$SCRIPT" root "${VERSION}"
    [ "$status" -eq 0 ]
    [[ "$(readlink /opt/httpd)" == "${INSTALL_DIR}" ]]
}

@test "writes a per-version systemd service file" {
    run bash "$SCRIPT" root "${VERSION}"
    [ "$status" -eq 0 ]
    [ -f "${SERVICE_FILE}" ]
    grep -q "ExecStart=${INSTALL_DIR}/bin/apachectl -k start" "${SERVICE_FILE}"
}

@test "adds HTTPD_HOME to the login user's .bash_profile" {
    run bash "$SCRIPT" root "${VERSION}"
    [ "$status" -eq 0 ]
    grep -q 'HTTPD_HOME' /root/.bash_profile
}

@test "warns when a different httpd version is already running" {
    cat > "$TEST_TMPDIR/bin/systemctl" << SYSTEMCTLSTUB
#!/bin/bash
printf "systemctl %s\n" "\$*" >> "${CALLS_FILE}"
if [[ "\$*" == *"list-units"* ]]; then
    echo "httpd-2.4.60.service loaded active running Apache HTTP Server 2.4.60"
    echo "httpd-${VERSION}.service loaded active running Apache HTTP Server ${VERSION}"
fi
exit 0
SYSTEMCTLSTUB
    chmod +x "$TEST_TMPDIR/bin/systemctl"

    run bash "$SCRIPT" root "${VERSION}"
    [ "$status" -eq 0 ]
    [[ "$output" == *"httpd-2.4.60.service"* ]]
    [[ "$output" == *"systemctl stop httpd-2.4.60.service"* ]]
    [[ "$output" == *"systemctl start httpd-${VERSION}"* ]]
    # The version just installed must not be listed as something to stop
    ! [[ "$output" == *"systemctl stop httpd-${VERSION}.service"* ]]
}

@test "does not warn when no other httpd version is running" {
    run bash "$SCRIPT" root "${VERSION}"
    [ "$status" -eq 0 ]
    [[ "$output" != *"Another Apache version is currently running"* ]]
}
