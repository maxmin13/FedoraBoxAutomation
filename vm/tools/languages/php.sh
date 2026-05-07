#!/bin/bash

##
## Description: Installs PHP and disables the APC opcode cache
##              by setting apc.enabled=0 in /etc/php.ini.
## Usage:       sudo ./php.sh <login-user>
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##

source /tmp/common.sh

if [[ 0 -eq $# ]]
then
    log_error 'login user not found.'
    exit 1
fi

LOGIN_USER="${1}"

####
STEP "PHP"
####

if ! rpm -q php &>/dev/null
then
    log_info 'Installing PHP ...'
    dnf install -y php php-common php-cli
    log_info 'PHP installed.'
else
    log_info 'PHP already installed.'
fi

php -v

if grep -q 'apc.enabled' /etc/php.ini
then
    sed -i '/apc.enabled/d' /etc/php.ini
fi

echo 'apc.enabled=0' >> /etc/php.ini
log_info 'APC cache disabled.'

log_info "Version : php -v"
log_info "Run     : php <file.php>"
log_info "REPL    : php -a"
log_info "Config  : /etc/php.ini"
