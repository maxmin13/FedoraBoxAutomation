#!/bin/bash

##
## Description: Configures the GNOME desktop environment for a Fedora VM.
##              Disables Wayland (forces X11), sets background image, silences
##              the bell, configures Gedit and Nautilus (adds /opt bookmark),
##              sets up the Git prompt, applies kernel parameters for minikube,
##              and disables GNOME keyring.
## Usage:       sudo ./desktop-config.sh <login-user> [background-image-filename]
## Parameters:  $1  <login-user>               Non-root desktop username (e.g. maxmin)
##              $2  [background-image-filename] Image filename in /usr/share/backgrounds/ (optional)
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
require_login_user "${LOGIN_USER}"
BACKGROUND_IMG="${2:-}"
HOME_DIR=$(eval echo "~${LOGIN_USER}")

####
STEP "Dependencies"
####

dnf install -y dbus-x11

####
STEP "Disable Wayland"
####

if grep -q 'WaylandEnable' /etc/gdm/custom.conf; then
  sed -i 's/#\?WaylandEnable=.*/WaylandEnable=false/' /etc/gdm/custom.conf
else
  sed -i '/^\[daemon\]/a WaylandEnable=false' /etc/gdm/custom.conf
fi

log_info 'Wayland disabled.'

if ! grep -q 'DefaultSession=gnome-xorg.desktop' '/etc/gdm/custom.conf'; then
  sed -i '/WaylandEnable=false/a DefaultSession=gnome-xorg.desktop' /etc/gdm/custom.conf
fi

log_info 'XORG set.'

USER_UID="$(id -u "${LOGIN_USER}")"
DBUS="unix:path=/run/user/${USER_UID}/bus"

gsettings_set() {
    sudo -u "${LOGIN_USER}" DISPLAY=:0 DBUS_SESSION_BUS_ADDRESS="${DBUS}" gsettings set "$@"
}

gsettings_get() {
    sudo -u "${LOGIN_USER}" DISPLAY=:0 DBUS_SESSION_BUS_ADDRESS="${DBUS}" gsettings get "$@"
}

####
STEP "Background image"
####

if [[ -z "${BACKGROUND_IMG}" ]]
then
   log_warn 'No background image provided, skipping.'
elif [[ ! -f "/usr/share/backgrounds/${BACKGROUND_IMG}" ]]
then
   log_warn "Background image not found at /usr/share/backgrounds/${BACKGROUND_IMG}, skipping."
else
   mkdir -p /etc/dconf/db/local.d
   cat > /etc/dconf/db/local.d/01-background <<EOF
[org/gnome/desktop/background]
picture-uri='file:///usr/share/backgrounds/${BACKGROUND_IMG}'
picture-uri-dark='file:///usr/share/backgrounds/${BACKGROUND_IMG}'
EOF
   dconf update
   log_info "Background image set to ${BACKGROUND_IMG}."
fi

####
STEP "Bell"
####

audible_bell="$(gsettings_get org.gnome.desktop.wm.preferences audible-bell)"

if [[ 'false' == "${audible_bell}" ]]
then
   log_info 'Bell already disabled.'
else
   gsettings_set org.gnome.desktop.wm.preferences audible-bell false
   log_info 'Bell disabled.'
fi

####
STEP "Gedit text editor"
####

if ! command -v gedit > /dev/null 2>&1
then
   log_warn 'Gedit not installed, skipping configuration.'
else
   # not possible to change files in shared folder, enabling backup files fix the bug.
   create_backup="$(gsettings_get org.gnome.gedit.preferences.editor create-backup-copy)"

   if [[ 'true' == "${create_backup}" ]]
   then
      log_info 'Gedit backup files already configured.'
   else
      gsettings_set org.gnome.gedit.preferences.editor create-backup-copy true
      log_info 'Gedit backup files configured.'
   fi
fi

####
STEP "Nautilus file manager"
####

gsettings_set org.gnome.nautilus.list-view default-visible-columns "['name', 'size', 'date_modified', 'type']"

log_info 'Nautilus additional type column added.'

BOOKMARKS_FILE="${HOME_DIR}/.config/gtk-3.0/bookmarks"
mkdir -p "${HOME_DIR}/.config/gtk-3.0"

if grep -q 'file:/// /' "${BOOKMARKS_FILE}" 2>/dev/null && \
   grep -q 'file:///opt' "${BOOKMARKS_FILE}" 2>/dev/null; then
    log_info 'Nautilus bookmarks for / and /opt already present.'
else
    grep -q 'file:/// /' "${BOOKMARKS_FILE}" 2>/dev/null  || echo 'file:/// /'       >> "${BOOKMARKS_FILE}"
    grep -q 'file:///opt' "${BOOKMARKS_FILE}" 2>/dev/null || echo 'file:///opt opt'  >> "${BOOKMARKS_FILE}"
    chown "${LOGIN_USER}":"${LOGIN_USER}" "${BOOKMARKS_FILE}"
    log_info 'Nautilus bookmarks for / and /opt added.'
fi

####
STEP "Git"
####

# Tell Git to convert CRLF to LF on commit but not the other way around by setting core.autocrlf to input.
git config --global core.autocrlf input

# Git terminal prompt
if [[ -z "$(grep parse_git_branch "${HOME_DIR}/.bash_profile")" ]]
then
cat <<-EOT >> "${HOME_DIR}/.bash_profile"

	parse_git_branch() {
	   git branch 2> /dev/null | sed -e '/^[^*]/d' -e 's/* \(.*\)/(\1)/'
	}
	export PS1="[\u@\h \W]\[\e[91m\]\$(parse_git_branch)\[\e[00m\]$ "
EOT

log_info 'Git branch name configured at Bash prompt.'

fi

####
STEP "Kernel parameters"
####

# problem fix for minikube stop error. 
if ! grep protected_regular /etc/sysctl.conf > /dev/null 2>&1 
then
   echo 'fs.protected_regular=0' >> /etc/sysctl.conf
   log_info 'fs.protected_regular=0 set in /etc/sysctl.conf.'
fi

# sysctl fs.protected_regular=0 is not applied after a reboot if it's set in /etc/sysctl.conf. 
# Create a service to reload sysctl at a late stage.

if [ ! -e /etc/systemd/system/sysctl-reload.service ]
then
	cat <<-EOT >> /etc/systemd/system/sysctl-reload.service 
		[Unit]
		Description=Apply sysctl tardily

		[Service]
		User=root
		Group=root
		Restart=no
		ExecStart=sysctl -p
		RemainAfterExit=yes

		[Install]
		WantedBy=multi-user.target
	EOT
	
	log_info 'sysctl-reload.service created.'
else
    log_info 'sysctl-reload.service already exists.'
fi

systemctl daemon-reload
systemctl enable sysctl-reload.service
systemctl start sysctl-reload.service
systemctl status sysctl-reload.service --no-pager

log_info 'Kernel parameters configured.'

####
STEP "/opt"
####

chown "${LOGIN_USER}":"${LOGIN_USER}" -R /opt/

log_info "Ownership of /opt set to ${LOGIN_USER}." 

####
STEP "Disable Keyring"
####

chmod -x /usr/bin/gnome-keyring