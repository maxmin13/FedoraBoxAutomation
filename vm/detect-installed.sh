#!/bin/bash
# vm/detect-installed.sh
# Detects which provisioned tools are installed and outputs a JSON object.
# Called by the Electron GUI via VBoxManage guestcontrol.
# Always exits 0. Never sources /tmp/common.sh.

# Build PATH to cover all common install locations:
#   - standard system dirs
#   - pip install as root  (/root/.local/bin)
#   - pip install as each regular user (/home/*/.local/bin)
export PATH="/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin:/root/.local/bin:/snap/bin:${PATH}"
for _d in /home/*/.local/bin /opt/*/bin; do
  [ -d "$_d" ] && PATH="${PATH}:${_d}"
done

cmd_ok()  { which "$1" >/dev/null 2>&1 && echo true || echo false; }
svc_ok()  { systemctl is-active "$1" >/dev/null 2>&1 && echo true || echo false; }
path_ok() { [ -e "$1" ] && echo true || echo false; }
glob_ok() { compgen -G "$1" >/dev/null 2>&1 && echo true || echo false; }
rpm_ok()  { rpm -q "$1" &>/dev/null && echo true || echo false; }

java_version() {
  which java >/dev/null 2>&1 || { echo false; return; }
  ver=$(java -version 2>&1 | head -1 | sed 's/.*version "\([^"]*\)".*/\1/')
  echo "\"${ver}\""
}

intellij_version() {
  local dir
  dir=$(compgen -G '/opt/idea-IC-*' 2>/dev/null | head -1)
  [[ -z "${dir}" ]] && { echo false; return; }
  echo "\"${dir#/opt/idea-IC-}\""
}

maven_version() {
  which mvn >/dev/null 2>&1 || { echo false; return; }
  ver=$(mvn --version 2>&1 | head -1 | awk '{print $3}')
  echo "\"${ver}\""
}

openssl_version() {
  local bin="/usr/local/ssl/bin/openssl"
  [ -x "${bin}" ] || { echo false; return; }
  ver=$("${bin}" version 2>&1 | awk '{print $2}')
  echo "\"${ver}\""
}

ansible_ok() {
  which ansible >/dev/null 2>&1 && echo true && return
  find /usr /opt /root /home /snap -maxdepth 6 -name 'ansible' -not -name 'ansible-*' -type f 2>/dev/null \
    | grep -q . && echo true || echo false
}

python_version() {
  local bin
  bin=$(compgen -G "/usr/local/bin/python3.*" 2>/dev/null \
        | grep -E '^/usr/local/bin/python3\.[0-9]+$' \
        | sort -V | tail -1)
  [[ -z "${bin}" ]] && { echo false; return; }
  ver=$("${bin}" --version 2>&1 | awk '{print $2}')
  echo "\"${ver}\""
}

cat <<JSON
{
  "baseSetup":        $(path_ok /etc/fedorabox/.base-setup),
  "java":             $(java_version),
  "php":              $(cmd_ok php),
  "python":           $(python_version),
  "node":             $(cmd_ok node),
  "maven":            $(maven_version),
  "httpd":            $(svc_ok httpd),
  "tomcat":           $(glob_ok '/opt/tomcat-*'),
  "mariadb":          $(svc_ok mariadb),
  "postgresql":       $(svc_ok postgresql),
  "dbeaver":          $(rpm_ok dbeaver-ce),
  "eclipse":          $(glob_ok '/opt/eclipse*'),
  "intellij":         $(intellij_version),
  "visualStudioCode": $(cmd_ok code),
  "docker":           $(cmd_ok docker),
  "minikube":         $(cmd_ok minikube),
  "k3s":              $(cmd_ok k3s),
  "awsCli":           $(cmd_ok aws),
  "ecsCli":           $(cmd_ok ecs-cli),
  "openssl":          $(openssl_version),
  "wireshark":        $(cmd_ok tshark),
  "git":              $(cmd_ok git),
  "vim":              $(cmd_ok vim),
  "chrome":           $(rpm_ok google-chrome-stable),
  "ansible":          $(ansible_ok),
  "claudeCode":       $(cmd_ok claude),
  "flameshot":        $(cmd_ok flameshot)
}
JSON
