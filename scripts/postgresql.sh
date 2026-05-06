#!/bin/bash

##
## Description: Installs PostgreSQL server, initialises the database cluster,
##              enables remote connections, and installs pgAdmin 4 desktop.
## Usage:       sudo ./postgresql.sh
##

source /tmp/common.sh

WORK_DIR=$(mktemp -d)
trap 'rm -rf "${WORK_DIR}"' EXIT

####
STEP "postgresql"
####

if command -v psql > /dev/null
then
	echo 'postgresql installed.'
else
    echo 'Installing postgresql ...'

	dnf install -y postgresql-server postgresql
	postgresql-setup --initdb

	systemctl enable --now postgresql.service
	systemctl status postgresql.service

	echo 'postgresql successfully installed.'

	netstat -nlt | grep 5432

	sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" /var/lib/pgsql/data/postgresql.conf
	echo 'host all all 0.0.0.0/0 md5' | tee -a /var/lib/pgsql/data/pg_hba.conf
	systemctl restart postgresql.service

	netstat -nlt | grep 5432

fi

if /usr/pgadmin4/bin/pgadmin4 --version > /dev/null
then
	echo 'pgadmin4 installed.'
else
	echo 'Installing pgAdmin 4 Management ...'

	wget https://ftp.postgresql.org/pub/pgadmin/pgadmin4/yum/pgadmin4-fedora-repo-2-1.noarch.rpm -O "${WORK_DIR}/pgadmin4-fedora-repo-2-1.noarch.rpm"

	rpm -Uvh --force "${WORK_DIR}/pgadmin4-fedora-repo-2-1.noarch.rpm"
	
	yum install -y pgadmin4-desktop

    echo 'pgAdmin 4 Management successfully installed.'    
fi

