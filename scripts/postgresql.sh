#!/bin/bash

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

####
STEP "postgresql"
####

if which psql > /dev/null
then
	echo 'postgresql installed.'
else
    echo 'Installing postgresql ...'
	
	dnf -y install https://download.postgresql.org/pub/repos/yum/reporpms/F-38-x86_64/pgdg-fedora-repo-latest.noarch.rpm

	dnf module reset postgresql -y
	dnf install -y postgresql14-server postgresql14
	postgresql-14-setup initdb    
	
	systemctl enable --now postgresql-14.service
	systemctl status postgresql-14.service
	
	echo 'postgresql successfully installed.'
	
	netstat -nlt |grep 5432
	
	sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" /var/lib/pgsql/data/postgresql.conf
	echo 'host all all 0.0.0.0/0 md5' | sudo tee -a /var/lib/pgsql/data/pg_hba.conf
	systemctl restart postgresql.service
	
	netstat -nlt |grep 5432	
	
fi

if /usr/pgadmin4/bin/pgadmin4 --version > /dev/null
then
	echo 'pgadmin4 installed.'
else
	echo 'Installing pgAdmin 4 Management ...'

	wget  https://ftp.postgresql.org/pub/pgadmin/pgadmin4/yum/pgadmin4-fedora-repo-2-1.noarch.rpm

	rpm -Uvh --force pgadmin4-fedora-repo-2-1.noarch.rpm
	
	yum install -y pgadmin4-desktop

    echo 'pgAdmin 4 Management successfully installed.'    
fi

