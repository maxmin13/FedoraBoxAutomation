#!/bin/bash

set -o errexit
set -o pipefail
set -o nounset
set +o xtrace

STEP() { echo ; echo ; echo "==\\" ; echo "===>" "$@" ; echo "==/" ; echo ; }

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
   
   cd /usr/src
   wget https://www.eclipse.org/downloads/download.php?file=/technology/epp/downloads/release/2026-03/R/eclipse-jee-2026-03-R-linux-gtk-x86_64.tar.gz&mirror_id=1045 -O eclipse.tar.gz
   tar -zxf eclipse.tar.gz --directory /opt 
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

   rm -f eclipse.tar.gz

   echo
   echo 'Eclipse successfully installed.'
fi



