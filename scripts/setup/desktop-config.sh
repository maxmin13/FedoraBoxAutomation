#!/bin/bash

##
## Description: Configures the GNOME desktop environment for a Fedora VM.
##              Disables Wayland (forces X11), sets background image, silences
##              the bell, configures Gedit and Nautilus, sets up the Git prompt,
##              applies kernel parameters for minikube, and disables GNOME keyring.
## Usage:       sudo ./desktop-config.sh <login-user> <background-image-filename>
##

source /tmp/common.sh

if [[ 1 -gt $# ]]
then
   echo 'ERROR: missing parameters.'
   exit 1
fi

LOGIN_USER="${1}"
BACKGROUND_IMG="${2:-}"
HOME_DIR=$(eval echo "~${LOGIN_USER}")

####
STEP "Dependencies"
####

dnf install -y dbus-x11

####
STEP "Disable Wayland"
####

sed -i 's/#WaylandEnable=false/WaylandEnable=false/g' /etc/gdm/custom.conf

echo "Wayland disabled."

if ! grep -q 'DefaultSession=gnome-xorg.desktop' '/etc/gdm/custom.conf'; then
  sed -i '/WaylandEnable=false/a DefaultSession=gnome-xorg.desktop' /etc/gdm/custom.conf
fi

echo "XORG set."

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
   echo 'WARNING: No background image provided, skipping.'
elif [[ ! -f "/usr/share/backgrounds/${BACKGROUND_IMG}" ]]
then
   echo "WARNING: Background image not found at /usr/share/backgrounds/${BACKGROUND_IMG}, skipping."
else
   img_uri="$(gsettings_get org.gnome.desktop.background picture-uri)"
   img_nm="$(basename "${img_uri}" \')"

   echo "The current background image is ${img_nm}"

   if [[ "${img_nm}" == "${BACKGROUND_IMG}" ]]
   then
      echo 'Background image already changed.'
   else
      gsettings_set org.gnome.desktop.background picture-uri "file:///usr/share/backgrounds/${BACKGROUND_IMG}"
      echo 'Background image changed.'
   fi
fi

####
STEP "Bell"
####

audible_bell="$(gsettings_get org.gnome.desktop.wm.preferences audible-bell)"

if [[ 'false' == "${audible_bell}" ]]
then
   echo 'Bell settings already changed.'
else
   gsettings_set org.gnome.desktop.wm.preferences audible-bell false
   echo 'Bell settings changed.'
fi

####
STEP "Gedit text editor"
####

# not possible to change files in shared folder, enabling backup files fix the bug.
create_backup="$(gsettings_get org.gnome.gedit.preferences.editor create-backup-copy)"

if [[ 'true' == "${create_backup}" ]]
then
   echo 'Gedit create backup files already configured.'
else
   gsettings_set org.gnome.gedit.preferences.editor create-backup-copy true
   echo 'Gedit create backup files configured.'
fi

####
STEP "Nautilus file manager"
####

gsettings_set org.gnome.nautilus.list-view default-visible-columns "['name', 'size', 'date_modified', 'type']"

echo 'Added additional type colum.'

####
#STEP "LS_COLOR"
####

# customize the format of file and directories as returned by the command ls.

#if grep 'LS_COLORS' /home/"${LOGIN_USER}"/.bashrc
#then 
#   echo 'ls colors already configured.'
#else 
#	cat <<-EOT >> //home/"${LOGIN_USER}"/.bashrc	
#		LS_COLORS='rs=0:di=01;34:ln=01;36:mh=00:pi=40;33:so=01;35:do=01;35:bd=40;33;01:cd=40;33;01:or=40;31;01:mi=00:su=37;41:sg=30;43:ca=30;41:tw=30;42  :ow=34;42:st=37;44:ex=01;32:*.tar=01;31:*.tgz=01;31:*.arc=01;31:*.arj=01;31:*.taz=01;31:*.lha=01;31:*.lz4=01;31:*.lzh=01;31:*.lzma=01;31:*.tlz=0  1;31:*.txz=01;31:*.tzo=01;31:*.t7z=01;31:*.zip=01;31:*.z=01;31:*.dz=01;31:*.gz=01;31:*.lrz=01;31:*.lz=01;31:*.lzo=01;31:*.xz=01;31:*.zst=01;31:*  .tzst=01;31:*.bz2=01;31:*.bz=01;31:*.tbz=01;31:*.tbz2=01;31:*.tz=01;31:*.deb=01;31:*.rpm=01;31:*.jar=01;31:*.war=01;31:*.ear=01;31:*.sar=01;31:*  .rar=01;31:*.alz=01;31:*.ace=01;31:*.zoo=01;31:*.cpio=01;31:*.7z=01;31:*.rz=01;31:*.cab=01;31:*.wim=01;31:*.swm=01;31:*.dwm=01;31:*.esd=01;31:*.  jpg=01;35:*.jpeg=01;35:*.mjpg=01;35:*.mjpeg=01;35:*.gif=01;35:*.bmp=01;35:*.pbm=01;35:*.pgm=01;35:*.ppm=01;35:*.tga=01;35:*.xbm=01;35:*.xpm=01;3  5:*.tif=01;35:*.tiff=01;35:*.png=01;35:*.svg=01;35:*.svgz=01;35:*.mng=01;35:*.pcx=01;35:*.mov=01;35:*.mpg=01;35:*.mpeg=01;35:*.m2v=01;35:*.mkv=0  1;35:*.webm=01;35:*.webp=01;35:*.ogm=01;35:*.mp4=01;35:*.m4v=01;35:*.mp4v=01;35:*.vob=01;35:*.qt=01;35:*.nuv=01;35:*.wmv=01;35:*.asf=01;35:*.rm=  01;35:*.rmvb=01;35:*.flc=01;35:*.avi=01;35:*.fli=01;35:*.flv=01;35:*.gl=01;35:*.dl=01;35:*.xcf=01;35:*.xwd=01;35:*.yuv=01;35:*.cgm=01;35:*.emf=0  1;35:*.ogv=01;35:*.ogx=01;35:*.aac=00;36:*.au=00;36:*.flac=00;36:*.m4a=00;36:*.mid=00;36:*.midi=00;36:*.mka=00;36:*.mp3=00;36:*.mpc=00;36:*.ogg=  00;36:*.ra=00;36:*.wav=00;36:*.oga=00;36:*.opus=00;36:*.spx=00;36:*.xspf=00;36:';
#		# override directories, bold and green
#		LS_COLORS="$LS_COLORS:di=01;36"
#		# override files, yellow
#		LS_COLORS="$LS_COLORS:fi=0;93"
#		# override symbolic links, yellow and underscored
#		LS_COLORS="$LS_COLORS:ln=0;93;4"
#		# dir and files 777 not highlighted
#		LS_COLORS="$LS_COLORS:ow=01;36;40"
#		# script with any extension are green
#		LS_COLORS="*.*=01;35"
#		export LS_COLORS	
#	EOT
#fi

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

echo 'Configured Git branch name at Bash prompt.'

fi

####
STEP "Kernel parameters"
####

# problem fix for minikube stop error. 
if ! grep protected_regular /etc/sysctl.conf > /dev/null 2>&1 
then
   echo 'fs.protected_regular=0' >> /etc/sysctl.conf
   echo 'disabled fs.protected_regular Linux kernel parameter, so that root can edit anything on the system.'
   echo
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
	
	echo 'service sysctl-reload.service created.'
else
    echo 'service sysctl-reload.service already created.'
fi

systemctl daemon-reload
systemctl enable sysctl-reload.service
systemctl start sysctl-reload.service
systemctl status sysctl-reload.service

echo 'Kernel parameters configured.'

####
STEP "/opt"
####

sudo chown "${LOGIN_USER}":"${LOGIN_USER}" -R /opt/

echo "Configured ${LOGIN_USER} /opt directory owner." 

####
STEP "Disable Keyring"
####

sudo chmod -x /usr/bin/gnome-keyring