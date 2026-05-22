#!/bin/bash

##
## Description: Installs Apache HTTP Server, configures sites-available and
##              sites-enabled directories, disables cache, sets SELinux boolean
##              httpd_read_user_content, and deploys a phpinfo.php test page.
## Usage:       sudo ./httpd.sh <login-user>
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
require_login_user "${LOGIN_USER}"
HOME_DIR=$(eval echo "~${LOGIN_USER}")
cd "${HOME_DIR}"

APACHE_DOCROOT_DIR='/var/www/html'
APACHE_INSTALL_DIR='/etc/httpd'
APACHE_SITES_AVAILABLE_DIR='/etc/httpd/sites-available'
APACHE_SITES_ENABLED_DIR='/etc/httpd/sites-enabled'

####
STEP "Apache HTTP Server"
####

if ! rpm -q httpd &>/dev/null
then
    log_info 'Installing Apache HTTP Server ...'
    dnf install -y httpd
    log_info 'Apache HTTP Server installed.'
else
    log_info 'Apache HTTP Server already installed.'
fi

mkdir -p "${APACHE_SITES_AVAILABLE_DIR}" "${APACHE_SITES_ENABLED_DIR}"

if ! grep -q 'sites-enabled' "${APACHE_INSTALL_DIR}/conf/httpd.conf"
then
    echo "IncludeOptional ${APACHE_SITES_ENABLED_DIR}/*.conf" >> "${APACHE_INSTALL_DIR}/conf/httpd.conf"
    log_info 'sites-enabled include added to httpd.conf.'
fi

if [[ -f 00-default.conf ]]
then
    mv 00-default.conf "${APACHE_SITES_ENABLED_DIR}"
fi

rm -rf /var/www/cgi-bin /var/www/error /var/www/icons

httpd -t
setsebool -P httpd_read_user_content 1
log_info 'SELinux httpd_read_user_content enabled.'

systemctl enable httpd.service
systemctl restart httpd.service
systemctl status httpd.service --no-pager

if [[ -f phpinfo.php ]]
then
    mv phpinfo.php "${APACHE_DOCROOT_DIR}/"
    log_info 'phpinfo.php deployed to document root.'
fi

log_info "Apache HTTP Server successfully installed."
log_info "Service     : systemctl start|stop|restart|status httpd"
log_info "Config      : ${APACHE_INSTALL_DIR}/conf/httpd.conf"
log_info "Document root: ${APACHE_DOCROOT_DIR}"
log_info "Sites       : ${APACHE_SITES_AVAILABLE_DIR} / ${APACHE_SITES_ENABLED_DIR}"
log_info "Logs        : /var/log/httpd/access_log | error_log"
log_info "Test        : curl http://localhost"
log_info "PHP test    : http://localhost/phpinfo.php"
