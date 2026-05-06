#!/bin/bash

##
## Description: Installs Visual Studio Code by adding the Microsoft package
##              repository and installing the 'code' package via dnf.
## Usage:       sudo ./visualstudiocode.sh
##

source /tmp/common.sh

####
STEP 'Visual Studio Code'
####

rpm --import https://packages.microsoft.com/keys/microsoft.asc
printf "[vscode]\nname=packages.microsoft.com\nbaseurl=https://packages.microsoft.com/yumrepos/vscode/\nenabled=1\ngpgcheck=1\nrepo_gpgcheck=1\ngpgkey=https://packages.microsoft.com/keys/microsoft.asc\nmetadata_expire=1h" | tee -a /etc/yum.repos.d/vscode.repo
dnf install code -y
dnf update --refresh

echo 'Visula Studio Code successfully installed.'