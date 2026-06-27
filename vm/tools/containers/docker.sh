#!/bin/bash

##
## Description: Installs Docker CE from the official Docker repository, enables
##              the Docker service to start at boot, and adds the login user to
##              the docker group.
## Usage:       sudo ./docker.sh <login-user>
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
require_login_user "${LOGIN_USER}"

####
STEP "Docker"
####

if ! docker version > /dev/null 2>&1
then
    dnf install -y dnf-plugins-core
    dnf config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo --overwrite
    dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

    log_info 'Docker successfully installed.'
else
    log_info 'Docker already installed.'
fi

docker --version

if ! id -nG "${LOGIN_USER}" | grep -q docker
then
    usermod -aG docker "${LOGIN_USER}"
    log_info "${LOGIN_USER} added to docker group."
else
    log_info "${LOGIN_USER} already in docker group."
fi

log_info "Service      : systemctl start|stop|restart|status docker"
log_info "Run          : docker run <image>"
log_info "List running : docker ps"
log_info "List images  : docker images"
log_info "Pull image   : docker pull <image>"
log_info "Logs         : docker logs <container>"
log_info "Stop all     : docker stop \$(docker ps -q)"
log_info "Remove all   : docker rm \$(docker ps -aq)"
log_warn "IMPORTANT: You must log out of the Fedora desktop and log back in for docker group"
log_warn "           membership to take effect. Until then, docker and minikube commands will"
log_warn "           fail with 'permission denied' on /var/run/docker.sock."
log_warn "           In the VM: open the Applications menu, log out, then log back in as ${LOGIN_USER}."
