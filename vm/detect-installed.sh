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

cmd_ok()     { which "$1" >/dev/null 2>&1 && echo true || echo false; }
svc_ok()     { systemctl is-active "$1" >/dev/null 2>&1 && echo true || echo false; }
path_ok()    { [ -e "$1" ] && echo true || echo false; }
glob_ok()    { compgen -G "$1" >/dev/null 2>&1 && echo true || echo false; }
rpm_ok()     { rpm -q "$1" &>/dev/null && echo true || echo false; }
rpm_any_ok() { for p in "$@"; do rpm -q "${p}" &>/dev/null && echo true && return; done; echo false; }

java_versions() {
  local active_major=""
  if which java >/dev/null 2>&1; then
    active_major=$(java -version 2>&1 | awk -F'"' '/version/ {
      split($2, a, "."); print (a[1]=="1") ? a[2] : a[1]
    }')
  fi

  declare -A majors  # major -> display version string
  local ver major pkg

  # Oracle JDK: package jdk-21, version 21.0.3
  while IFS= read -r ver; do
    [[ -z "${ver}" ]] && continue
    major=$(echo "${ver}" | grep -Eo '^[0-9]+')
    [[ -n "${major}" && -z "${majors[${major}]+x}" ]] && majors[${major}]="${ver}"
  done < <(rpm -qa --queryformat '%{VERSION}\n' 'jdk-*' 2>/dev/null)

  # Eclipse Temurin: package temurin-21-jdk, version may include +build suffix
  while IFS= read -r ver; do
    [[ -z "${ver}" ]] && continue
    major=$(echo "${ver}" | grep -Eo '^[0-9]+')
    [[ -n "${major}" && -z "${majors[${major}]+x}" ]] && majors[${major}]="${ver%%+*}"
  done < <(rpm -qa --queryformat '%{VERSION}\n' 'temurin-*-jdk' 2>/dev/null)

  # OpenJDK via dnf: java-21-openjdk-devel, java-17-openjdk-devel, etc.
  while IFS= read -r pkg; do
    [[ -z "${pkg}" ]] && continue
    major=$(echo "${pkg}" | sed -E 's/java-([0-9]+)-.*/\1/')
    [[ -z "${major}" ]] && continue
    [[ -n "${majors[${major}]+x}" ]] && continue
    ver=$(rpm -q "${pkg}" --queryformat '%{VERSION}' 2>/dev/null \
          | grep -Eo '^[0-9]+\.[0-9]+(\.[0-9]+)?' || echo "${major}")
    majors[${major}]="${ver}"
  done < <(rpm -qa --queryformat '%{NAME}\n' 'java-*-openjdk-devel' 2>/dev/null)

  local list="" label
  for major in $(echo "${!majors[@]}" | tr ' ' '\n' | sort -rn); do
    ver="${majors[${major}]}"
    label="${ver}$([[ "${major}" == "${active_major}" ]] && echo ' (active)')"
    [[ -n "${list}" ]] && list="${list}, "
    list="${list}${label}"
  done

  [[ -z "${list}" ]] && { echo false; return; }
  echo "\"${list}\""
}

intellij_version() {
  local list="" dir ver
  while IFS= read -r dir; do
    ver="${dir#/opt/idea-IC-}"
    [[ -n "${list}" ]] && list="${list}, "
    list="${list}${ver}"
  done < <(compgen -G '/opt/idea-IC-*' 2>/dev/null | sort -rV)
  [[ -z "${list}" ]] && { echo false; return; }
  echo "\"${list}\""
}

tomcat_versions() {
  local list="" dir base ver port
  while IFS= read -r dir; do
    base="${dir#/opt/apache-tomcat-}"
    port="${base##*-}"
    ver="${base%-*}"
    [[ -n "${list}" ]] && list="${list}, "
    if systemctl is-enabled --quiet "tomcat-${ver}-${port}.service" 2>/dev/null; then
      list="${list}${ver}:${port} (enabled)"
    else
      list="${list}${ver}:${port}"
    fi
  done < <(compgen -G "/opt/apache-tomcat-*" 2>/dev/null | sort -V)
  [[ -z "${list}" ]] && { echo false; return; }
  echo "\"${list}\""
}

httpd_versions() {
  local list="" dir ver
  while IFS= read -r dir; do
    ver="${dir#/opt/httpd-}"
    [[ "${ver}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || continue
    [[ -n "${list}" ]] && list="${list}, "
    if systemctl is-enabled --quiet "httpd-${ver}.service" 2>/dev/null; then
      list="${list}${ver} (enabled)"
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

mariadb_version() {
  local ver=""
  if rpm -q MariaDB-server &>/dev/null; then
    ver=$(rpm -q MariaDB-server --queryformat '%{VERSION}')
  elif rpm -q mariadb-server &>/dev/null; then
    ver=$(rpm -q mariadb-server --queryformat '%{VERSION}')
  fi
  [[ -z "${ver}" ]] && { echo false; return; }
  echo "\"${ver}\""
}

postgresql_version() {
  local list="" ver pkg svc
  for pkg in postgresql18-server postgresql17-server postgresql16-server postgresql15-server postgresql14-server postgresql-server; do
    if rpm -q "${pkg}" &>/dev/null; then
      ver=$(rpm -q "${pkg}" --queryformat '%{VERSION}')
      if [[ "${pkg}" == "postgresql-server" ]]; then
        svc="postgresql"
      else
        svc="postgresql-${pkg#postgresql}"
        svc="${svc%-server}"
      fi
      [[ -n "${list}" ]] && list="${list}, "
      if systemctl is-enabled --quiet "${svc}.service" 2>/dev/null; then
        list="${list}${ver} (enabled)"
      else
        list="${list}${ver}"
      fi
    fi
  done
  [[ -z "${list}" ]] && { echo false; return; }
  echo "\"${list}\""
}

k3s_version() {
  which k3s >/dev/null 2>&1 || { echo false; return; }
  local ver
  ver=$(k3s --version 2>/dev/null | awk 'NR==1{gsub("^v","",$3); sub(/\+.*/,"",$3); print $3}')
  [[ -z "${ver}" ]] && { echo false; return; }
  if systemctl is-enabled --quiet k3s 2>/dev/null; then
    echo "\"${ver} (enabled)\""
  else
    echo "\"${ver}\""
  fi
}

ansible_version() {
  local bin
  bin=$(which ansible 2>/dev/null \
        || find /usr /opt /root /home /snap -maxdepth 6 -name 'ansible' -not -name 'ansible-*' -type f 2>/dev/null | head -1)
  [[ -z "${bin}" ]] && { echo false; return; }
  ver=$("${bin}" --version 2>/dev/null | head -1 | awk '{print $NF}' | tr -d ']')
  [[ -z "${ver}" ]] && { echo false; return; }
  echo "\"${ver}\""
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

tool_version() {
  local bin ver
  bin=$(which "$1" 2>/dev/null) || { echo false; return; }
  ver=$("$bin" --version 2>/dev/null | awk 'NR==1{match($0,/[0-9]+\.[0-9]+\.[0-9]+/); if(RSTART) print substr($0,RSTART,RLENGTH)}')
  [[ -n "${ver}" ]] && echo "\"${ver}\"" || echo false
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
  "mariadb":          $(mariadb_version),
  "postgresql":       $(postgresql_version),
  "dbeaver":          $(rpm_ok dbeaver-ce),
  "eclipse":          $(
    list=""
    while IFS= read -r dir; do
      ver="${dir#/opt/eclipse-}"
      [[ "${ver}" =~ ^[0-9]{4}-[0-9]{2}$ ]] || continue
      [[ -n "${list}" ]] && list="${list}, "
      list="${list}${ver}"
    done < <(compgen -G "/opt/eclipse-*" 2>/dev/null | sort -rV)
    [[ -z "${list}" ]] && echo false || echo "\"${list}\""
  ),
  "intellij":         $(intellij_version),
  "visualStudioCode": $(
    list=""
    while IFS= read -r dir; do
      ver="${dir#/opt/vscode-}"
      [[ "${ver}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || continue
      [[ -n "${list}" ]] && list="${list}, "
      list="${list}${ver}"
    done < <(compgen -G "/opt/vscode-*" 2>/dev/null | sort -rV)
    [[ -z "${list}" ]] && echo false || echo "\"${list}\""
  ),
  "docker":           $(which docker >/dev/null 2>&1 && docker --version 2>/dev/null | awk '{gsub(",","",$3); print "\""$3"\""}' || echo false),
  "minikube":         $(which minikube >/dev/null 2>&1 && minikube version --short 2>/dev/null | sed 's/^v//' | awk '{print "\""$1"\""}' || echo false),
  "k3s":              $(k3s_version),
  "awsCli":           $(which aws >/dev/null 2>&1 && aws --version 2>/dev/null | awk '{split($1,a,"/"); print "\""a[2]"\""}' || echo false),
  "ecsCli":           $([ -x /usr/local/bin/ecs-cli ] && /usr/local/bin/ecs-cli --version 2>/dev/null | awk '{gsub("[()]","",$3); print "\""$3"\""}' || echo false),
  "openssl":          $(openssl_version),
  "wireshark":        $(tool_version tshark),
  "git":              $(which git >/dev/null 2>&1 && git --version 2>/dev/null | awk '{print "\""$3"\""}' || echo false),
  "vim":              $(which vim >/dev/null 2>&1 && vim --version 2>/dev/null | awk 'NR==1{print "\""$5"\""}' || echo false),
  "chrome":           $(rpm -q google-chrome-stable &>/dev/null && rpm -q google-chrome-stable --queryformat '"%{VERSION}"' || echo false),
  "ansible":          $(ansible_version),
  "claudeCode":       $(tool_version claude),
  "flameshot":        $(tool_version flameshot)
}
JSON
