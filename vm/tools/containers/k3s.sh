#!/bin/bash

##
## Description: Installs k3s, a lightweight but fully conformant Kubernetes
##              distribution. Unlike minikube (which simulates a cluster for
##              local dev), k3s is real Kubernetes -- the same API, the same
##              kubectl commands, and the same YAML files work unchanged on a
##              cloud cluster. Ideal for testing real deployment configs locally
##              before pushing to production.
##              Does not require Docker -- k3s uses its own containerd runtime.
##              Installs the k3s binary only -- the service is not enabled or
##              started, matching minikube.sh; start it manually when needed.
## Usage:       sudo ./k3s.sh <login-user>
## Parameters:  $1  <login-user>  Non-root desktop username (e.g. maxmin)
##

source /tmp/common.sh

LOGIN_USER="${1:-}"
require_login_user "${LOGIN_USER}"
HOME_DIR=$(eval echo "~${LOGIN_USER}")

####
STEP "k3s"
####

K3S_BIN='/usr/local/bin/k3s'

if [[ -x "${K3S_BIN}" ]]
then
    log_info "k3s already installed: $("${K3S_BIN}" --version)"
else
    log_info "Downloading and installing k3s ..."

    WORK_DIR=$(mktemp -d)
    trap 'rm -rf "${WORK_DIR}"' EXIT

    curl -sfL https://get.k3s.io -o "${WORK_DIR}/k3s-install.sh"
    chmod +x "${WORK_DIR}/k3s-install.sh"
    INSTALL_K3S_SKIP_START=true INSTALL_K3S_SKIP_ENABLE=true "${WORK_DIR}/k3s-install.sh"

    log_info "k3s installed: $("${K3S_BIN}" --version)"
fi

log_info "k3s is installed but not enabled or started."
log_info ""
log_info "--- To use the cluster ---"
log_info "1. Start                     : systemctl start k3s"
log_info "2. Enable at boot (optional) : systemctl enable k3s"
log_info "3. Copy kubeconfig for ${LOGIN_USER}:"
log_info "     mkdir -p ${HOME_DIR}/.kube"
log_info "     cp /etc/rancher/k3s/k3s.yaml ${HOME_DIR}/.kube/config"
log_info "     chown ${LOGIN_USER}:${LOGIN_USER} ${HOME_DIR}/.kube/config && chmod 600 ${HOME_DIR}/.kube/config"
log_info "4. Add to shell              : echo 'export KUBECONFIG=~/.kube/config' >> ${HOME_DIR}/.bash_profile"
log_info "5. Log out and back in for KUBECONFIG to take effect."
log_info ""
log_info "Status       : systemctl status k3s"
log_info "Logs         : journalctl -u k3s -f"
log_info "Nodes        : kubectl get nodes"
log_info "All pods     : kubectl get pods --all-namespaces"
log_info "Deploy app   : kubectl apply -f <file.yaml>"
