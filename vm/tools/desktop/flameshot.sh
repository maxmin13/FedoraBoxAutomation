#!/bin/bash

##
## Description: Installs Flameshot and configures the Print Screen key to
##              launch it in GNOME on X11.
## Usage:       sudo ./flameshot.sh <login-user>
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
require_login_user "${LOGIN_USER}"

USER_UID="$(id -u "${LOGIN_USER}")"
DBUS="unix:path=/run/user/${USER_UID}/bus"

gsettings_set() {
    sudo -u "${LOGIN_USER}" DISPLAY=:0 DBUS_SESSION_BUS_ADDRESS="${DBUS}" gsettings set "$@"
}

gsettings_get() {
    sudo -u "${LOGIN_USER}" DISPLAY=:0 DBUS_SESSION_BUS_ADDRESS="${DBUS}" gsettings get "$@"
}

####
STEP "Flameshot"
####

if rpm -q flameshot &>/dev/null
then
    log_info 'Flameshot already installed.'
else
    dnf install -y flameshot
    log_info 'Flameshot installed.'
fi

####
STEP "Print Screen key binding"
####

MEDIA_KEYS_SCHEMA='org.gnome.settings-daemon.plugins.media-keys'
BINDING_PATH='/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/'
EXISTING="$(gsettings_get "${MEDIA_KEYS_SCHEMA}" custom-keybindings 2>/dev/null || echo '@as []')"

if echo "${EXISTING}" | grep -q "${BINDING_PATH}"
then
    log_info 'Print Screen key already configured for Flameshot.'
else
    # Older GNOME versions bind Print Screen to a built-in "screenshot" action via
    # these keys; newer GNOME dropped them in favour of an in-shell screenshot UI,
    # so only clear them when the schema actually still defines them.
    SCHEMA_KEYS="$(sudo -u "${LOGIN_USER}" DISPLAY=:0 DBUS_SESSION_BUS_ADDRESS="${DBUS}" gsettings list-keys "${MEDIA_KEYS_SCHEMA}" 2>/dev/null)"
    for key in screenshot screenshot-clip; do
        if echo "${SCHEMA_KEYS}" | grep -qx "${key}"; then
            gsettings_set "${MEDIA_KEYS_SCHEMA}" "${key}" '[]'
        fi
    done
    gsettings_set "${MEDIA_KEYS_SCHEMA}" custom-keybindings "['${BINDING_PATH}']"
    gsettings_set "org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:${BINDING_PATH}" name 'Flameshot'
    gsettings_set "org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:${BINDING_PATH}" command 'flameshot gui'
    gsettings_set "org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:${BINDING_PATH}" binding 'Print'
    log_info 'Print Screen configured to launch Flameshot.'
fi

log_info 'Usage:'
log_info '  Print Screen          - open Flameshot capture mode (drag to select area)'
log_info '  flameshot gui         - launch from terminal'
log_info '  flameshot full -p ~/  - capture full screen and save to home directory'
log_info 'In capture mode:'
log_info '  drag     - select area'
log_info '  Enter    - save to file'
log_info '  Ctrl+C   - copy to clipboard'
log_info '  Esc      - cancel'
