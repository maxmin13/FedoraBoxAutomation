#!/bin/bash

################################################################################################
# Install apache server, fcgi is enabled by default in Fedora, cache disabled.
#
################################################################################################

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

## Install Apache Web Server on /etc/httpd directory,

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

if [[ 0 -eq $# ]] 
then
   echo 'ERROR: login user not found.'
   exit 1
fi

LOGIN_USER="${1}"

cd /home/"${LOGIN_USER}"

####
STEP "httpd"
####

APACHE_DOCROOT_DIR='/var/www/html'
APACHE_INSTALL_DIR='/etc/httpd'
APACHE_SITES_AVAILABLE_DIR='/etc/httpd/sites-available'
APACHE_SITES_ENABLED_DIR='/etc/httpd/sites-enabled'

echo 'Installing Apache Web Server ...'

yum install -y httpd
mkdir -p "${APACHE_SITES_AVAILABLE_DIR}" "${APACHE_SITES_ENABLED_DIR}"

if ! grep -q sites-enabled "${APACHE_INSTALL_DIR}"/conf/httpd.conf
then
  echo "IncludeOptional ${APACHE_SITES_ENABLED_DIR}/*.conf" >> "${APACHE_INSTALL_DIR}"/conf/httpd.conf
fi

# disable cache
mv 00-default.conf "${APACHE_SITES_ENABLED_DIR}"

# Clear directories and configuration files.
rm -rf /var/www/cgi-bin /var/www/error /var/www/icons

# Check the syntax
httpd -t

# selinux
setsebool -P httpd_read_user_content 1

systemctl enable httpd.service
systemctl restart httpd.service

echo 'Apache Web Server installed.'

mv phpinfo.php /var/www/html/

echo 'selinux httpd_read_user_content boolean turned on.'

echo '-------------------------------------------------'
echo 'Directory modules:'
ls -lh "${APACHE_INSTALL_DIR}"/modules
echo '-------------------------------------------------'
echo 'Modules compiled statically into the server:'
/usr/sbin/httpd -l
echo '-------------------------------------------------'
echo 'Modules compiled dynamically enabled with Apache:'
/usr/sbin/httpd -M
echo '-------------------------------------------------'
echo 'Server version:'
/usr/sbin/httpd -V
echo '-------------------------------------------------'
echo 'Apache Web Server successfully installed.'
echo 'verify installation:'
echo 'http://localhost/phpinfo.php'
echo

exit 0
