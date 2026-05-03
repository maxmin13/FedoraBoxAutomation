#!/bin/bash

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

####
STEP "mysql"
####

dnf install -y community-mysql-server
dnf update mysql-server

systemctl enable mysqld
sudo systemctl start mysqld
systemctl status mysqld

echo 'msql successfully installed.'