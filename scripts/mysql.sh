#!/bin/bash

##
## Description: Installs MySQL community server, enables and starts the mysqld
##              service.
## Usage:       sudo ./mysql.sh
##

source /tmp/common.sh

####
STEP "mysql"
####

dnf install -y community-mysql-server
dnf update mysql-server

systemctl enable mysqld
systemctl start mysqld
systemctl status mysqld

echo 'msql successfully installed.'