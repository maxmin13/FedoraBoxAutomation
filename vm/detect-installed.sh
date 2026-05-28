#!/bin/bash
# vm/detect-installed.sh
# Detects which provisioned tools are installed and outputs a JSON object.
# Called by the Electron GUI via VBoxManage guestcontrol.
# Always exits 0. Never sources /tmp/common.sh.

# Ensure /usr/local/bin is in PATH regardless of how guestcontrol invokes this.
# Needed for tools installed there: minikube, k3s, openssl, claude, aws, ecs-cli.
export PATH="/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin:${PATH}"

cmd_ok()  { command -v "$1" >/dev/null 2>&1 && echo true || echo false; }
svc_ok()  { systemctl is-active "$1" >/dev/null 2>&1 && echo true || echo false; }
path_ok() { [ -e "$1" ] && echo true || echo false; }
glob_ok() { compgen -G "$1" >/dev/null 2>&1 && echo true || echo false; }
rpm_ok()  { rpm -q "$1" &>/dev/null && echo true || echo false; }

python_ok() {
  compgen -G "/usr/local/bin/python3.*" >/dev/null 2>&1 && echo true || echo false
}

base_setup_ok() {
  getenforce 2>/dev/null | grep -qi disabled && echo true || echo false
}

cat <<JSON
{
  "baseSetup":        $(base_setup_ok),
  "java":             $(cmd_ok java),
  "php":              $(cmd_ok php),
  "python":           $(python_ok),
  "node":             $(cmd_ok node),
  "maven":            $(cmd_ok mvn),
  "httpd":            $(svc_ok httpd),
  "tomcat":           $(glob_ok '/opt/tomcat-*'),
  "mariadb":          $(svc_ok mariadb),
  "postgresql":       $(svc_ok postgresql),
  "dbeaver":          $(rpm_ok dbeaver-ce),
  "eclipse":          $(glob_ok '/opt/eclipse*'),
  "visualStudioCode": $(cmd_ok code),
  "docker":           $(cmd_ok docker),
  "minikube":         $(path_ok /usr/local/bin/minikube),
  "k3s":              $(path_ok /usr/local/bin/k3s),
  "awsCli":           $(cmd_ok aws),
  "ecsCli":           $(cmd_ok ecs-cli),
  "openssl":          $(path_ok /usr/local/ssl/bin/openssl),
  "wireshark":        $(cmd_ok tshark),
  "git":              $(cmd_ok git),
  "vim":              $(cmd_ok vim),
  "chrome":           $(rpm_ok google-chrome-stable),
  "ansible":          $(cmd_ok ansible),
  "claudeCode":       $(cmd_ok claude)
}
JSON
