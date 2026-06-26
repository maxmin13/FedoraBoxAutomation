#!/bin/bash

##
## Description: Installs PHP + php-common + php-cli and disables APC cache.
##              If a version is specified, uses the Remi repository to install
##              that exact minor-version stream. Only one PHP version can be
##              active at a time; switching versions replaces the previous one.
## Usage:       sudo ./php.sh <login-user> [version]
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##              $2  [version]     Optional PHP version (e.g. 8.3). Defaults to
##                                the version in Fedora's default repository.
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
require_login_user "${LOGIN_USER}"
TARGET_VERSION="${2:-}"

####
STEP "PHP"
####

# Returns the active PHP major.minor (e.g. "8.3"), empty if PHP is not installed.
active_php_version() {
   php -v 2>/dev/null \
     | awk 'NR==1 { split($2, a, "."); print a[1]"."a[2] }' \
     || true
}

if [[ -n "${TARGET_VERSION}" ]]; then
   log_info "PHP ${TARGET_VERSION}: using Remi repository"

   ACTIVE=$(active_php_version)
   if [[ "${ACTIVE}" == "${TARGET_VERSION}" ]]; then
      log_info "PHP ${TARGET_VERSION} is already installed and already the active version."
      exit 0
   fi

   [[ -n "${ACTIVE}" ]] \
      && log_info "PHP ${ACTIVE} is active — switching to PHP ${TARGET_VERSION}." \
      || log_info "Installing PHP ${TARGET_VERSION} ..."

   if ! rpm -q remi-release &>/dev/null; then
      log_info "Adding Remi RPM repository ..."
      FEDORA_VER=$(rpm -E '%{fedora}')
      dnf install -y "https://rpms.remirepo.net/fedora/remi-release-${FEDORA_VER}.rpm"
   fi

   # Remove any existing PHP so DNF does not keep a higher system version.
   dnf remove -y 'php*' 2>/dev/null || true

   # DNF 5 (Fedora 41+) dropped "module switch-to"; use reset + enable instead.
   dnf module reset php -y 2>/dev/null || true
   dnf module enable "php:remi-${TARGET_VERSION}" -y
   dnf install -y php php-common php-cli
   log_info "PHP ${TARGET_VERSION} installed."
else
   log_info "PHP: using Fedora default repository"

   ACTIVE=$(active_php_version)
   if [[ -n "${ACTIVE}" ]]; then
      log_info "PHP ${ACTIVE} is already installed and already the active version."
      exit 0
   fi

   log_info "Installing PHP ..."
   dnf install -y php php-common php-cli
   log_info "PHP installed."
fi

php -v

if grep -q 'apc.enabled' /etc/php.ini 2>/dev/null; then
   sed -i '/apc.enabled/d' /etc/php.ini
fi
echo 'apc.enabled=0' >> /etc/php.ini
log_info 'APC cache disabled.'

log_info "-------------------------------------------------------"
log_info " PHP quick-reference"
log_info "-------------------------------------------------------"
log_info " Version         : php -v"
log_info " Loaded config   : php --ini"
log_info " Config file     : /etc/php.ini"
log_info " Enabled modules : php -m"
log_info ""
log_info " Run a script    : php <file.php>"
log_info " Interactive     : php -a"
log_info ""
log_info " Smoke tests:"
log_info "   php -r \"echo PHP_VERSION . PHP_EOL;\""
log_info "   php -r \"echo json_encode(['status' => 'ok']) . PHP_EOL;\""
log_info "   php -r \"echo ini_get('apc.enabled') . PHP_EOL;\"   # expect 0"
log_info ""
log_info " Hello World script:"
log_info "   echo '<?php echo \"Hello, World!\" . PHP_EOL;' > /tmp/hello.php"
log_info "   php /tmp/hello.php"
log_info ""
log_info " Built-in web server (no Apache needed):"
log_info "   mkdir -p ~/www && echo '<?php phpinfo();' > ~/www/index.php"
log_info "   php -S 0.0.0.0:8000 -t ~/www"
log_info "   # then open http://localhost:8000 in the browser"
log_info ""
log_info " With Apache (httpd):"
log_info "   Place .php files in /var/www/html/"
log_info "   systemctl start httpd"
log_info "   curl http://localhost/index.php"
log_info ""
log_info " Composer (PHP dependency manager):"
log_info "   curl -sS https://getcomposer.org/installer | php"
log_info "   mv composer.phar /usr/local/bin/composer"
log_info "   composer --version"
log_info "-------------------------------------------------------"
