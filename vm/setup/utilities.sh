#!/bin/bash

##
## Description: Installs common desktop utilities: dconf-editor, expect, gedit.
## Usage:       sudo ./utilities.sh
## Parameters:  none
##

source /tmp/common.sh

####
STEP "Developer utilities"
####

dnf install -y dconf-editor expect gedit
log_info 'dconf-editor, expect, gedit installed.'

log_info "dconf-editor  : launch from Applications menu to browse GNOME settings"
log_info "gedit         : gedit <file>"
log_info "expect        : automate interactive CLI tools in scripts"
