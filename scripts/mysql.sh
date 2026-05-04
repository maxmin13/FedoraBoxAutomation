#!/bin/bash

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