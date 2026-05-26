#!/bin/bash

##
## Description: Installs PHP and disables the APC opcode cache
##              by setting apc.enabled=0 in /etc/php.ini.
## Usage:       sudo ./php.sh <login-user>
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
require_login_user "${LOGIN_USER}"

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
