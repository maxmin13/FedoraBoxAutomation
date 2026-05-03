#!/bin/bash
   
set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

if [[ 0 -eq $# ]] 
then
   echo 'ERROR: login user not found.'
   exit 1
fi

####
STEP "php"
####

LOGIN_USER="${1}"

echo 'Installing PHP ...'
dnf install -y php php-common php-cli
php -v
echo 'PHP installed.'

if grep -Rq 'apc.enabled' /etc/php.ini
then
	sed -i '/apc.enabled/d' /etc/php.ini
fi

echo 'apc.enabled=0' >> /etc/php.ini

echo 'PHP cache disabled.'

exit 0


