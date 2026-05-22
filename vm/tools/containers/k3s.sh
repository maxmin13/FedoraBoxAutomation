#!/bin/bash

##
## Description: Installs k3s, a lightweight but fully conformant Kubernetes
##              distribution. Unlike minikube (which simulates a cluster for
##              local dev), k3s is real Kubernetes -- the same API, the same
##              kubectl commands, and the same YAML files work unchanged on a
##              cloud cluster. Ideal for testing real deployment configs locally
##              before pushing to production.
##              Does not require Docker -- k3s uses its own containerd runtime.
##              Sets up kubeconfig for the login user so kubectl works without sudo.
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

if k3s --version > /dev/null 2>&1
then
    log_info "k3s already installed: $(k3s --version)"
else
    log_info "Downloading and installing k3s ..."

    WORK_DIR=$(mktemp -d)
    trap 'rm -rf "${WORK_DIR}"' EXIT

    curl -sfL https://get.k3s.io -o "${WORK_DIR}/k3s-install.sh"
    chmod +x "${WORK_DIR}/k3s-install.sh"
    "${WORK_DIR}/k3s-install.sh"

    log_info "k3s installed: $(k3s --version)"
fi

systemctl status k3s --no-pager

####
STEP "kubectl access for ${LOGIN_USER}"
####

log_info "Waiting for k3s kubeconfig to be ready ..."
timeout 30 bash -c 'until [[ -f /etc/rancher/k3s/k3s.yaml ]]; do sleep 1; done'

mkdir -p "${HOME_DIR}/.kube"
cp /etc/rancher/k3s/k3s.yaml "${HOME_DIR}/.kube/config"
chown "${LOGIN_USER}:${LOGIN_USER}" "${HOME_DIR}/.kube/config"
chmod 600 "${HOME_DIR}/.kube/config"
log_info "kubeconfig copied to ${HOME_DIR}/.kube/config"

if ! grep -q 'KUBECONFIG' "${HOME_DIR}/.bash_profile"
then
    echo 'export KUBECONFIG=~/.kube/config' >> "${HOME_DIR}/.bash_profile"
    log_info "KUBECONFIG added to ~/.bash_profile"
else
    log_info "KUBECONFIG already in ~/.bash_profile"
fi

####
STEP "Cluster status"
####

log_info "Waiting for node to be ready ..."
timeout 60 bash -c 'until k3s kubectl get nodes 2>/dev/null | grep -q " Ready"; do sleep 2; done'

k3s kubectl get nodes
k3s kubectl get pods --all-namespaces

log_info "k3s is running. Use kubectl (after re-login) or k3s kubectl immediately."
log_info "Start        : systemctl start k3s"
log_info "Stop         : systemctl stop k3s"
log_info "Status       : systemctl status k3s"
log_info "Nodes        : kubectl get nodes"
log_info "All pods     : kubectl get pods --all-namespaces"
log_info "Deploy app   : kubectl apply -f <file.yaml>"
log_info "Logs         : journalctl -u k3s -f"
log_warn "NOTE: Log out and back in for KUBECONFIG to take effect in new terminals."
