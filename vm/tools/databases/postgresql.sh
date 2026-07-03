#!/bin/bash

##
## Description: Installs PostgreSQL server, initialises the database cluster,
##              enables remote connections, and installs pgAdmin 4 desktop.
##              Without a version argument installs from the Fedora repo.
##              With a version (14-18) installs from the PGDG repo.
## Usage:       sudo ./postgresql.sh [version]
## Parameters:  $1  version  Optional major version: 14 | 15 | 16 | 17 | 18
##

source /tmp/common.sh

PG_VER="${1:-}"

if [[ -n "${PG_VER}" ]]; then
    PKG_SERVER="postgresql${PG_VER}-server"
    PKG_CLIENT="postgresql${PG_VER}"
    SVC_NAME="postgresql-${PG_VER}"
    DATA_DIR="/var/lib/pgsql/${PG_VER}/data"
    INITDB_CMD="/usr/pgsql-${PG_VER}/bin/postgresql-${PG_VER}-setup initdb"
    CONF_DIR="${DATA_DIR}"
    STEP_LABEL="PostgreSQL ${PG_VER} (PGDG)"
else
    PKG_SERVER="postgresql-server"
    PKG_CLIENT="postgresql"
    SVC_NAME="postgresql"
    DATA_DIR="/var/lib/pgsql/data"
    INITDB_CMD="postgresql-setup --initdb"
    CONF_DIR="${DATA_DIR}"
    STEP_LABEL="PostgreSQL (Fedora repo)"
fi

####
STEP "${STEP_LABEL}"
####

if rpm -q "${PKG_SERVER}" &>/dev/null; then
    log_info "PostgreSQL already installed (${PKG_SERVER})."
else
    if [[ -n "${PG_VER}" ]]; then
        log_info "Adding PGDG repository for PostgreSQL ${PG_VER} ..."
        PGDG_RPM="https://download.postgresql.org/pub/repos/yum/reporpms/F-$(rpm -E %fedora)-x86_64/pgdg-fedora-repo-latest.noarch.rpm"
        dnf install -y "${PGDG_RPM}"
    fi

    log_info "Installing ${PKG_SERVER} ..."
    dnf install -y "${PKG_SERVER}" "${PKG_CLIENT}"

    if [[ ! -f "${DATA_DIR}/PG_VERSION" ]]; then
        ${INITDB_CMD}
    fi

    sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" "${CONF_DIR}/postgresql.conf"
    log_warn 'Remote connections enabled (0.0.0.0/0 md5) - dev VM only.'
    echo 'host all all 0.0.0.0/0 md5' >> "${CONF_DIR}/pg_hba.conf"

    log_info "PostgreSQL successfully installed."
fi

####
STEP "pgAdmin 4"
####

if rpm -q pgadmin4-desktop &>/dev/null; then
    log_info 'pgadmin4 already installed.'
else
    log_info 'Installing pgAdmin 4 ...'

    WORK_DIR=$(mktemp -d)
    trap 'rm -rf "${WORK_DIR}"' EXIT

    PGADMIN_URL="https://ftp.postgresql.org/pub/pgadmin/pgadmin4/yum/pgadmin4-fedora-repo-2-1.noarch.rpm"
    log_info "Downloading pgAdmin 4 repo RPM from ${PGADMIN_URL} ..."
    wget -q --tries=3 "${PGADMIN_URL}" -O "${WORK_DIR}/pgadmin4-fedora-repo-2-1.noarch.rpm"
    rpm -Uvh --force "${WORK_DIR}/pgadmin4-fedora-repo-2-1.noarch.rpm"
    dnf install -y pgadmin4-desktop

    log_info 'pgAdmin 4 successfully installed.'
fi

log_info "Service  : systemctl start|stop|restart|status ${SVC_NAME}"
log_info "Enable at boot: systemctl enable ${SVC_NAME}"
log_info "CLI      : sudo -u postgres psql   (peer auth - no password set by default)"
log_info "Create   : createdb <dbname> -U postgres"
log_info "Logs     : journalctl -u ${SVC_NAME}"
log_info "Config   : ${CONF_DIR}/postgresql.conf"
log_info "HBA      : ${CONF_DIR}/pg_hba.conf"
log_info "pgAdmin  : launch pgAdmin 4 from the Applications menu"
log_info "--- To check which version is actually accepting connections:"
log_info "---   sudo ss -ltnp 'sport = :5432'"
log_info "---   sudo readlink -f /proc/<PID>/exe"

# A different PostgreSQL version may already be running on the same port -
# all versions default to 5432 unless reconfigured - so a newly enabled
# instance can silently fail to bind. Point that out explicitly rather than
# letting it fail later with a confusing "Address already in use".
OTHER_RUNNING=$(systemctl list-units --type=service --state=running --no-legend --plain 'postgresql*.service' 2>/dev/null \
    | awk '{print $1}' | grep -v "^${SVC_NAME}\.service$" || true)
if [[ -n "${OTHER_RUNNING}" ]]; then
    log_warn "Another PostgreSQL version is currently running and may be using the same port (5432):"
    for _svc in ${OTHER_RUNNING}; do
        log_warn "  ${_svc}"
    done
    log_warn "To switch to the version you just installed:"
    for _svc in ${OTHER_RUNNING}; do
        log_warn "  systemctl stop ${_svc}"
    done
    log_warn "  systemctl start ${SVC_NAME}"
fi
