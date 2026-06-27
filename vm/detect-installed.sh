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

java_versions() {
  # Detect active major version from the alternatives/PATH default.
  local active_major=""
  if which java >/dev/null 2>&1; then
    active_major=$(java -version 2>&1 | awk -F'"' '/version/ {
      split($2, a, "."); print (a[1]=="1") ? a[2] : a[1]
    }')
  fi
  # Collect installed versions from both Oracle JDK RPMs (jdk-*) and
  # OpenJDK RPMs (java-*-openjdk-devel), newest major first.
  local list="" ver major label
  while IFS= read -r ver; do
    [[ -z "${ver}" ]] && continue
    major=$(echo "${ver}" | grep -Eo '^[0-9]+')
    label="${ver}$([[ "${major}" == "${active_major}" ]] && echo ' (active)')"
    [[ -n "${list}" ]] && list="${list}, "
    list="${list}${label}"
  done < <(
    { rpm -qa --queryformat '%{VERSION}\n' 'jdk-*' 2>/dev/null
      rpm -qa --queryformat '%{VERSION}\n' 'temurin-*-jdk' 2>/dev/null
    } | sort -rVu
  )
  [[ -z "${list}" ]] && { echo false; return; }
  echo "\"${list}\""
}

intellij_version() {
  local dir
  dir=$(compgen -G '/opt/idea-IC-*' 2>/dev/null | head -1)
  [[ -z "${dir}" ]] && { echo false; return; }
  echo "\"${dir#/opt/idea-IC-}\""
}

tomcat_versions() {
  local list="" dir base ver port
  while IFS= read -r dir; do
    base="${dir#/opt/apache-tomcat-}"
    port="${base##*-}"
    ver="${base%-*}"
    [[ -n "${list}" ]] && list="${list}, "
    list="${list}${ver}:${port}"
  done < <(compgen -G "/opt/apache-tomcat-*" 2>/dev/null | sort -V)
  [[ -z "${list}" ]] && { echo false; return; }
  echo "\"${list}\""
}

httpd_versions() {
  local list="" dir ver active_ver=""
  if [[ -L /opt/httpd ]]; then
    active_ver=$(readlink /opt/httpd)
    active_ver="${active_ver#/opt/httpd-}"
  fi
  while IFS= read -r dir; do
    ver="${dir#/opt/httpd-}"
    [[ "${ver}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || continue
    [[ -n "${list}" ]] && list="${list}, "
    if [[ "${ver}" == "${active_ver}" ]]; then
      list="${list}${ver} (active)"
    else
      list="${list}${ver}"
    fi
  done < <(compgen -G "/opt/httpd-*" 2>/dev/null | sort -rV)
  [[ -z "${list}" ]] && { echo false; return; }
  echo "\"${list}\""
}

maven_versions() {
  local list="" active_ver="" dir ver
  local link
  link=$(readlink /usr/local/bin/mvn 2>/dev/null)
  if [[ -n "${link}" ]]; then
    active_ver="${link#/opt/maven-}"
    active_ver="${active_ver%%/*}"
  fi
  while IFS= read -r dir; do
    ver="${dir#/opt/maven-}"
    [[ -n "${list}" ]] && list="${list}, "
    if [[ "${ver}" == "${active_ver}" ]]; then
      list="${list}${ver} (active)"
    else
      list="${list}${ver}"
    fi
  done < <(compgen -G "/opt/maven-*" 2>/dev/null | sort -rV)
  [[ -z "${list}" ]] && { echo false; return; }
  echo "\"${list}\""
}

php_version() {
  which php >/dev/null 2>&1 || { echo false; return; }
  ver=$(php -v 2>&1 | head -1 | awk '{print $2}')
  [[ -z "${ver}" ]] && { echo false; return; }
  echo "\"${ver}\""
}

node_version() {
  which node >/dev/null 2>&1 || { echo false; return; }
  ver=$(node --version 2>&1 | sed 's/^v//')
  [[ -z "${ver}" ]] && { echo false; return; }
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

python_versions() {
  local list="" bin ver
  while IFS= read -r bin; do
    ver=$("${bin}" --version 2>&1 | awk '{print $2}')
    [[ -z "${ver}" ]] && continue
    [[ -n "${list}" ]] && list="${list}, "
    list="${list}${ver}"
  done < <(compgen -G "/usr/local/bin/python3.*" 2>/dev/null \
           | grep -E '^/usr/local/bin/python3\.[0-9]+$' \
           | sort -rV)
  [[ -z "${list}" ]] && { echo false; return; }
  echo "\"${list}\""
}

cat <<JSON
{
  "baseSetup":        $(path_ok /etc/fedorabox/.base-setup),
  "java":             $(java_versions),
  "php":              $(php_version),
  "python":           $(python_versions),
  "node":             $(node_version),
  "maven":            $(maven_versions),
  "httpd":            $(httpd_versions),
  "tomcat":           $(tomcat_versions),
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
