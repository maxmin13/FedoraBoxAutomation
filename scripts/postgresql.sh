#!/bin/bash

##
## Description: Installs PostgreSQL server, initialises the database cluster,
##              enables remote connections, and installs pgAdmin 4 desktop.
## Usage:       sudo ./postgresql.sh
##

source /tmp/common.sh

####
STEP "postgresql"
####

if rpm -q postgresql-server &>/dev/null
then
    log_info 'postgresql already installed.'
else
    log_info 'Installing postgresql ...'

    dnf install -y postgresql-server postgresql

    if [[ ! -f /var/lib/pgsql/data/PG_VERSION ]]; then
        postgresql-setup --initdb
    fi

    systemctl enable --now postgresql.service
    systemctl status postgresql.service --no-pager

    ss -tlnp | grep 5432

    sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" /var/lib/pgsql/data/postgresql.conf
    log_warn 'Remote connections enabled (0.0.0.0/0 md5) — dev VM only.'
    echo 'host all all 0.0.0.0/0 md5' >> /var/lib/pgsql/data/pg_hba.conf
    systemctl restart postgresql.service

    ss -tlnp | grep 5432

    log_info 'postgresql successfully installed.'
fi

####
STEP "pgAdmin 4"
####

if rpm -q pgadmin4-desktop &>/dev/null
then
    log_info 'pgadmin4 already installed.'
else
    log_info 'Installing pgAdmin 4 ...'

    WORK_DIR=$(mktemp -d)
    trap 'rm -rf "${WORK_DIR}"' EXIT

    wget --progress=dot https://ftp.postgresql.org/pub/pgadmin/pgadmin4/yum/pgadmin4-fedora-repo-2-1.noarch.rpm -O "${WORK_DIR}/pgadmin4-fedora-repo-2-1.noarch.rpm"
    rpm -Uvh --force "${WORK_DIR}/pgadmin4-fedora-repo-2-1.noarch.rpm"
    dnf install -y pgadmin4-desktop

    log_info 'pgAdmin 4 successfully installed.'
fi

