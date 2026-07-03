#!/usr/bin/env bats

# Tests for vm/tools/databases/postgresql.sh
#
# Run from the project root:
#   bats vm/tests/postgresql.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/tools/databases/postgresql.sh"

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

    # Default: postgresql already installed, pgadmin already installed
    _stub rpm               0
    _stub dnf               0
    _stub systemctl         0
    _stub ss                0
    _stub postgresql-setup  0
    _stub sed               0
    _stub wget              0

    # postgresql.sh appends to /var/lib/pgsql/data/pg_hba.conf and modifies
    # postgresql.conf — create the data directory and files
    mkdir -p /var/lib/pgsql/data
    [[ -f /var/lib/pgsql/data/pg_hba.conf ]] && \
        cp /var/lib/pgsql/data/pg_hba.conf "$TEST_TMPDIR/pg_hba.conf.bak"
    [[ -f /var/lib/pgsql/data/postgresql.conf ]] && \
        cp /var/lib/pgsql/data/postgresql.conf "$TEST_TMPDIR/postgresql.conf.bak"
    touch /var/lib/pgsql/data/pg_hba.conf
    touch /var/lib/pgsql/data/postgresql.conf
    # PG_VERSION present = cluster already initialised
    touch /var/lib/pgsql/data/PG_VERSION
}

teardown() {
    if [[ -f "$TEST_TMPDIR/common.sh.bak" ]]; then
        mv "$TEST_TMPDIR/common.sh.bak" /tmp/common.sh
    else
        rm -f /tmp/common.sh
    fi
    if [[ -f "$TEST_TMPDIR/pg_hba.conf.bak" ]]; then
        mv "$TEST_TMPDIR/pg_hba.conf.bak" /var/lib/pgsql/data/pg_hba.conf
    else
        rm -f /var/lib/pgsql/data/pg_hba.conf
    fi
    if [[ -f "$TEST_TMPDIR/postgresql.conf.bak" ]]; then
        mv "$TEST_TMPDIR/postgresql.conf.bak" /var/lib/pgsql/data/postgresql.conf
    else
        rm -f /var/lib/pgsql/data/postgresql.conf
    fi
    rm -f /var/lib/pgsql/data/PG_VERSION
    rm -rf "$TEST_TMPDIR"
}

@test "exits 0 when PostgreSQL is already installed" {
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
}

@test "skips dnf install when PostgreSQL is already installed" {
    run bash "$SCRIPT"
    ! grep -q "^dnf install -y postgresql-server" "$CALLS_FILE"
}

@test "installs postgresql-server when not present" {
    # First rpm -q (postgresql-server) fails; second (pgadmin) succeeds
    local call_count=0
    cat > "$TEST_TMPDIR/bin/rpm" << RPMSTUB
#!/bin/bash
printf "rpm %s\n" "\$*" >> "${CALLS_FILE}"
# Fail only for the first package check (postgresql-server)
COUNT_FILE="${TEST_TMPDIR}/rpm_calls"
COUNT=\$(cat "\$COUNT_FILE" 2>/dev/null || echo 0)
echo \$(( COUNT + 1 )) > "\$COUNT_FILE"
[[ "\$COUNT" -eq 0 ]] && exit 1
exit 0
RPMSTUB
    chmod +x "$TEST_TMPDIR/bin/rpm"
    run bash "$SCRIPT"
    grep -q "^dnf install -y postgresql-server postgresql" "$CALLS_FILE"
}

@test "runs postgresql-setup --initdb when the data directory is not initialised" {
    _stub rpm 1
    rm -f /var/lib/pgsql/data/PG_VERSION
    run bash "$SCRIPT"
    grep -q "^postgresql-setup --initdb" "$CALLS_FILE"
}

@test "skips postgresql-setup when the cluster is already initialised" {
    _stub rpm 1
    # PG_VERSION exists (created in setup)
    run bash "$SCRIPT"
    ! grep -q "^postgresql-setup" "$CALLS_FILE"
}

@test "warns when a different postgresql version is already running" {
    cat > "$TEST_TMPDIR/bin/systemctl" << SYSTEMCTLSTUB
#!/bin/bash
printf "systemctl %s\n" "\$*" >> "${CALLS_FILE}"
if [[ "\$*" == *"list-units"* ]]; then
    echo "postgresql-16.service loaded active running PostgreSQL 16 database server"
    echo "postgresql.service loaded active running PostgreSQL database server"
fi
exit 0
SYSTEMCTLSTUB
    chmod +x "$TEST_TMPDIR/bin/systemctl"

    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
    [[ "$output" == *"postgresql-16.service"* ]]
    [[ "$output" == *"systemctl stop postgresql-16.service"* ]]
    [[ "$output" == *"systemctl start postgresql"* ]]
    # The version just installed must not be listed as something to stop
    ! [[ "$output" == *"systemctl stop postgresql.service"* ]]
}

@test "does not warn when no other postgresql version is running" {
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
    [[ "$output" != *"Another PostgreSQL version is currently running"* ]]
}
