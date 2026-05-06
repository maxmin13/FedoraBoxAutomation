#!/bin/bash

##
## Description: Downloads and installs Eclipse IDE for Java Developers (2026-03)
##              to /opt/eclipse and registers a GNOME desktop entry.
## Usage:       sudo ./eclipse.sh
##

source /tmp/common.sh

####
STEP "Eclipse"
####

if [[ -d '/opt/eclipse' ]]
then
	echo 'Eclipse already installed.'
else
   if [[ -f /usr/share/applications/eclipse.desktop ]]
   then
       rm /usr/share/applications/eclipse.desktop
   fi

   WORK_DIR=$(mktemp -d)
   trap 'rm -rf "${WORK_DIR}"' EXIT

   wget 'https://www.eclipse.org/downloads/download.php?file=/technology/epp/downloads/release/2026-03/R/eclipse-jee-2026-03-R-linux-gtk-x86_64.tar.gz&mirror_id=1045' -O "${WORK_DIR}/eclipse.tar.gz"
   tar -zxf "${WORK_DIR}/eclipse.tar.gz" --directory /opt
   ln -sf /opt/eclipse/eclipse /usr/bin/eclipse

   cat <<- EOF > /usr/share/applications/eclipse.desktop
		[Desktop Entry]
		Encoding=UTF-8
		Name=Eclipse IDE
		Comment=Eclipse IDE for Java Developers
		Exec=/usr/bin/eclipse
		Icon=/opt/eclipse/icon.xpm
		Categories=Application;Development;Java;IDE
		Type=Application
		Terminal=0
EOF

   echo
   echo 'Eclipse successfully installed.'
fi



