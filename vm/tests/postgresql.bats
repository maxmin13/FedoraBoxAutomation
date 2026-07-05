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
    rm -rf /var/lib/pgsql/14 /var/lib/pgsql/16 /usr/pgsql-14 /usr/pgsql-16
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

@test "PGDG: adds the repo and installs the versioned package when not present" {
    # Not installed yet on the first check; installed by the time dnf install
    # (mocked) has "run" - simulates a successful PGDG install.
    cat > "$TEST_TMPDIR/bin/rpm" << RPMSTUB
#!/bin/bash
printf "rpm %s\n" "\$*" >> "${CALLS_FILE}"
case "\$*" in
    *"-q postgresql16-server"*)
        COUNT_FILE="${TEST_TMPDIR}/rpm16_calls"
        COUNT=\$(cat "\$COUNT_FILE" 2>/dev/null || echo 0)
        echo \$(( COUNT + 1 )) > "\$COUNT_FILE"
        [[ "\$COUNT" -eq 0 ]] && exit 1
        exit 0
        ;;
    *"-q pgdg-fedora-repo"*) exit 1 ;;
    *"-E %fedora"*)          echo 44; exit 0 ;;
    *)                       exit 0 ;;
esac
RPMSTUB
    chmod +x "$TEST_TMPDIR/bin/rpm"

    mkdir -p /usr/pgsql-16/bin
    cat > /usr/pgsql-16/bin/postgresql-16-setup << SETUPSTUB
#!/bin/bash
printf "postgresql-16-setup %s\n" "\$*" >> "${CALLS_FILE}"
exit 0
SETUPSTUB
    chmod +x /usr/pgsql-16/bin/postgresql-16-setup
    mkdir -p /var/lib/pgsql/16/data
    touch /var/lib/pgsql/16/data/postgresql.conf /var/lib/pgsql/16/data/pg_hba.conf

    run bash "$SCRIPT" 16
    [ "$status" -eq 0 ]
    grep -q "pgdg-fedora-repo-latest.noarch.rpm" "$CALLS_FILE"
    grep -q "^dnf install -y postgresql16-server postgresql16" "$CALLS_FILE"
    grep -q "^postgresql-16-setup initdb" "$CALLS_FILE"
}

@test "PGDG: skips re-adding the repo when it is already installed from a previous run" {
    cat > "$TEST_TMPDIR/bin/rpm" << RPMSTUB
#!/bin/bash
printf "rpm %s\n" "\$*" >> "${CALLS_FILE}"
case "\$*" in
    *"-q postgresql16-server"*)
        COUNT_FILE="${TEST_TMPDIR}/rpm16_calls"
        COUNT=\$(cat "\$COUNT_FILE" 2>/dev/null || echo 0)
        echo \$(( COUNT + 1 )) > "\$COUNT_FILE"
        [[ "\$COUNT" -eq 0 ]] && exit 1
        exit 0
        ;;
    *"-q pgdg-fedora-repo"*) exit 0 ;;
    *"-E %fedora"*)          echo 44; exit 0 ;;
    *)                       exit 0 ;;
esac
RPMSTUB
    chmod +x "$TEST_TMPDIR/bin/rpm"

    mkdir -p /usr/pgsql-16/bin
    cat > /usr/pgsql-16/bin/postgresql-16-setup << SETUPSTUB
#!/bin/bash
printf "postgresql-16-setup %s\n" "\$*" >> "${CALLS_FILE}"
exit 0
SETUPSTUB
    chmod +x /usr/pgsql-16/bin/postgresql-16-setup
    mkdir -p /var/lib/pgsql/16/data
    touch /var/lib/pgsql/16/data/postgresql.conf /var/lib/pgsql/16/data/pg_hba.conf

    run bash "$SCRIPT" 16
    [ "$status" -eq 0 ]
    ! grep -q "pgdg-fedora-repo-latest.noarch.rpm" "$CALLS_FILE"
    ! [[ "$output" == *"Adding PGDG repository"* ]]
    grep -q "^dnf install -y postgresql16-server postgresql16" "$CALLS_FILE"
}

@test "PGDG: fails clearly when the requested version has no package for this Fedora release" {
    # rpm -q keeps failing even after "dnf install" (dnf found nothing to install -
    # e.g. requesting a version that is already Fedora's own native version)
    cat > "$TEST_TMPDIR/bin/rpm" << RPMSTUB
#!/bin/bash
printf "rpm %s\n" "\$*" >> "${CALLS_FILE}"
case "\$*" in
    *"-q postgresql18-server"*) exit 1 ;;
    *"-E %fedora"*)             echo 44; exit 0 ;;
    *)                          exit 0 ;;
esac
RPMSTUB
    chmod +x "$TEST_TMPDIR/bin/rpm"

    run bash "$SCRIPT" 18
    [ "$status" -eq 1 ]
    [[ "$output" == *"PGDG has no postgresql18-server package"* ]]
    ! grep -q "^postgresql-18-setup" "$CALLS_FILE"
}

@test "PGDG: falls back to already-installed when Fedora's native package already matches the requested version" {
    # e.g. requesting 18 on Fedora 44, which already ships PostgreSQL 18
    # natively - postgresql18-server isn't installed under that name, but
    # postgresql-server (native) already satisfies it.
    cat > "$TEST_TMPDIR/bin/rpm" << RPMSTUB
#!/bin/bash
printf "rpm %s\n" "\$*" >> "${CALLS_FILE}"
case "\$*" in
    *"-q postgresql18-server"*) exit 1 ;;
    *"queryformat"*)            echo "18.3"; exit 0 ;;
    *)                          exit 0 ;;
esac
RPMSTUB
    chmod +x "$TEST_TMPDIR/bin/rpm"

    run bash "$SCRIPT" 18
    [ "$status" -eq 0 ]
    [[ "$output" == *"already installed (postgresql-server)"* ]]
    ! grep -q "pgdg-fedora-repo-latest" "$CALLS_FILE"
    ! grep -q "^dnf install -y postgresql18-server" "$CALLS_FILE"
    [[ "$output" == *"Service  : systemctl start|stop|restart|status postgresql"* ]]
}

@test "PGDG: skips the repo add and dnf install when the specific version is already installed" {
    # Default rpm stub reports everything installed
    run bash "$SCRIPT" 16
    [ "$status" -eq 0 ]
    [[ "$output" == *"already installed (postgresql16-server)"* ]]
    ! grep -q "pgdg-fedora-repo-latest" "$CALLS_FILE"
    ! grep -q "^dnf install -y postgresql16-server" "$CALLS_FILE"
}

@test "installing a different version proceeds even though another version is already installed" {
    cat > "$TEST_TMPDIR/bin/rpm" << RPMSTUB
#!/bin/bash
printf "rpm %s\n" "\$*" >> "${CALLS_FILE}"
case "\$*" in
    *"-q postgresql14-server"*)
        COUNT_FILE="${TEST_TMPDIR}/rpm14_calls"
        COUNT=\$(cat "\$COUNT_FILE" 2>/dev/null || echo 0)
        echo \$(( COUNT + 1 )) > "\$COUNT_FILE"
        [[ "\$COUNT" -eq 0 ]] && exit 1
        exit 0
        ;;
    *"-E %fedora"*) echo 44; exit 0 ;;
    *)              exit 0 ;;
esac
RPMSTUB
    chmod +x "$TEST_TMPDIR/bin/rpm"

    mkdir -p /usr/pgsql-14/bin
    cat > /usr/pgsql-14/bin/postgresql-14-setup << SETUPSTUB
#!/bin/bash
printf "postgresql-14-setup %s\n" "\$*" >> "${CALLS_FILE}"
exit 0
SETUPSTUB
    chmod +x /usr/pgsql-14/bin/postgresql-14-setup
    mkdir -p /var/lib/pgsql/14/data
    touch /var/lib/pgsql/14/data/postgresql.conf /var/lib/pgsql/14/data/pg_hba.conf

    run bash "$SCRIPT" 14
    [ "$status" -eq 0 ]
    grep -q "^dnf install -y postgresql14-server postgresql14" "$CALLS_FILE"
    [[ "$output" == *"Service  : systemctl start|stop|restart|status postgresql-14"* ]]
}

@test "warns using the versioned service name when a different version is running" {
    # Default rpm stub reports postgresql16-server already installed
    cat > "$TEST_TMPDIR/bin/systemctl" << SYSTEMCTLSTUB
#!/bin/bash
printf "systemctl %s\n" "\$*" >> "${CALLS_FILE}"
if [[ "\$*" == *"list-units"* ]]; then
    echo "postgresql.service loaded active running PostgreSQL database server"
    echo "postgresql-16.service loaded active running PostgreSQL 16 database server"
fi
exit 0
SYSTEMCTLSTUB
    chmod +x "$TEST_TMPDIR/bin/systemctl"

    run bash "$SCRIPT" 16
    [ "$status" -eq 0 ]
    [[ "$output" == *"systemctl stop postgresql.service"* ]]
    [[ "$output" == *"systemctl start postgresql-16"* ]]
    ! [[ "$output" == *"systemctl stop postgresql-16.service"* ]]
}

@test "sets listen_addresses to allow remote connections" {
    # postgresql-server not installed; pgadmin4-desktop already installed
    # (a blanket rpm-fail stub would also break rpm -Uvh --force in the
    # pgAdmin block, aborting the script under errexit).
    cat > "$TEST_TMPDIR/bin/rpm" << RPMSTUB
#!/bin/bash
printf "rpm %s\n" "\$*" >> "${CALLS_FILE}"
case "\$*" in
    *"-q postgresql-server"*) exit 1 ;;
    *)                        exit 0 ;;
esac
RPMSTUB
    chmod +x "$TEST_TMPDIR/bin/rpm"
    rm -f "$TEST_TMPDIR/bin/sed"   # use the real sed so the edit actually happens
    printf "#listen_addresses = 'localhost'\n" > /var/lib/pgsql/data/postgresql.conf

    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
    grep -q "^listen_addresses = '\*'" /var/lib/pgsql/data/postgresql.conf
}

@test "appends an md5 host entry to pg_hba.conf and warns about remote access" {
    cat > "$TEST_TMPDIR/bin/rpm" << RPMSTUB
#!/bin/bash
printf "rpm %s\n" "\$*" >> "${CALLS_FILE}"
case "\$*" in
    *"-q postgresql-server"*) exit 1 ;;
    *)                        exit 0 ;;
esac
RPMSTUB
    chmod +x "$TEST_TMPDIR/bin/rpm"

    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
    grep -q "^host all all 0.0.0.0/0 md5$" /var/lib/pgsql/data/pg_hba.conf
    [[ "$output" == *"Remote connections enabled"* ]]
}

@test "installs pgAdmin 4 when not present" {
    cat > "$TEST_TMPDIR/bin/rpm" << RPMSTUB
#!/bin/bash
printf "rpm %s\n" "\$*" >> "${CALLS_FILE}"
case "\$*" in
    *"-q pgadmin4-desktop"*) exit 1 ;;
    *)                       exit 0 ;;
esac
RPMSTUB
    chmod +x "$TEST_TMPDIR/bin/rpm"

    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
    grep -q "^wget .*pgadmin4-fedora-repo" "$CALLS_FILE"
    grep -q "^rpm -Uvh --force" "$CALLS_FILE"
    grep -q "^dnf install -y pgadmin4-desktop" "$CALLS_FILE"
}

@test "skips pgAdmin 4 install when already present" {
    # Default rpm stub reports pgadmin4-desktop already installed
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
    [[ "$output" == *"pgAdmin 4 is already present"* ]]
    # Must not contain the literal "already installed" banner-trigger phrase -
    # that must only ever reflect the primary PostgreSQL package's status.
    ! [[ "$output" == *"pgAdmin 4 already installed"* ]]
    ! grep -q "^wget " "$CALLS_FILE"
}

@test "does not show the already-installed banner phrase for pgAdmin when PostgreSQL itself was freshly installed" {
    # Regression test: the GUI scans [INFO] lines for the literal phrase
    # "already installed" to decide whether to show that banner. pgAdmin
    # being pre-existing from an earlier run must not falsely mark a run
    # where PostgreSQL itself was actually just installed.
    cat > "$TEST_TMPDIR/bin/rpm" << RPMSTUB
#!/bin/bash
printf "rpm %s\n" "\$*" >> "${CALLS_FILE}"
case "\$*" in
    *"-q postgresql-server"*) exit 1 ;;
    *)                        exit 0 ;;
esac
RPMSTUB
    chmod +x "$TEST_TMPDIR/bin/rpm"

    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
    [[ "$output" == *"PostgreSQL successfully installed"* ]]
    ! [[ "$output" =~ \[INFO\ *\].*already\ installed ]]
}
