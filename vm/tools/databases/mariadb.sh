#!/bin/bash

##
## Description: Installs MariaDB server (MySQL-compatible drop-in replacement)
##              and enables the mariadb service to start at boot.
##              Run 'mysql_secure_installation' after install to harden the setup.
## Usage:       sudo ./mariadb.sh
## Parameters:  none
##

source /tmp/common.sh

####
STEP "MariaDB"
####

if ! rpm -q mariadb-server &>/dev/null
then
    log_info 'Installing MariaDB server ...'
    dnf install -y mariadb-server
    log_info 'MariaDB successfully installed.'
else
    log_info 'MariaDB already installed.'
fi

log_info "Service : systemctl start|stop|restart|status mariadb"
log_info "No root password is set by default - root auth uses the unix_socket"
log_info "plugin, which checks the OS user instead of a password:"
log_info "CLI     : sudo mysql -u root"
log_info "To set a real root password (also required for TCP/remote access):"
log_info "Secure  : sudo mysql_secure_installation"
log_info "Logs    : journalctl -u mariadb"
