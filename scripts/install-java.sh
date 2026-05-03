#!/bin/bash
# install-java.sh - Install a specific Java version on Fedora
# Usage: ./install-java.sh <version>
# Example: ./install-java.sh 21

set -e

# --- Helpers ------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ok()   { echo -e "  ${GREEN}OK${NC} $1"; }
fail() { echo -e "  ${RED}FAILED${NC} $1"; exit 1; }
info() { echo -e "  ${CYAN}$1${NC}"; }
warn() { echo -e "  ${YELLOW}WARNING:${NC} $1"; }
header() {
    echo ""
    echo "------------------------------------------------------------"
    echo "  $1"
    echo "------------------------------------------------------------"
}

# --- Check root ---------------------------------------------------------------

if [ "$EUID" -ne 0 ]; then
    fail "Please run as root: sudo ./install-java.sh <version>"
fi

# --- Check argument -----------------------------------------------------------

if [ -z "$1" ]; then
    echo "Usage: sudo ./install-java.sh <version>"
    echo ""
    echo "Available versions: 11, 17, 21"
    echo "Example: sudo ./install-java.sh 21"
    exit 1
fi

JAVA_VERSION="$1"

# Validate version
case "$JAVA_VERSION" in
    11|17|21)
        ;;
    *)
        fail "Unsupported Java version: $JAVA_VERSION. Supported: 11, 17, 21"
        ;;
esac

# --- Install ------------------------------------------------------------------

header "Installing Java $JAVA_VERSION"

info "Updating package metadata..."
dnf makecache -y || fail "Failed to update package metadata"
ok "Package metadata updated"

info "Installing java-${JAVA_VERSION}-openjdk and java-${JAVA_VERSION}-openjdk-devel..."
dnf install -y \
    java-${JAVA_VERSION}-openjdk \
    java-${JAVA_VERSION}-openjdk-devel \
    --allowerasing || fail "Failed to install Java $JAVA_VERSION"
ok "Java $JAVA_VERSION installed"

# --- Set as default -----------------------------------------------------------

header "Setting Java $JAVA_VERSION as default"

JAVA_BIN=$(find /usr/lib/jvm -name 'java' -path "*java-${JAVA_VERSION}-openjdk*" 2>/dev/null | sort | tail -1)

if [ -z "$JAVA_BIN" ]; then
    warn "Could not find java binary path, skipping alternatives configuration"
else
    info "Setting alternatives to $JAVA_BIN..."
    alternatives --set java "$JAVA_BIN" || warn "Could not set java alternative (non-fatal)"
    ok "java alternative set"

    JAVAC_BIN=$(find /usr/lib/jvm -name 'javac' -path "*java-${JAVA_VERSION}-openjdk*" 2>/dev/null | sort | tail -1)
    if [ -n "$JAVAC_BIN" ]; then
        alternatives --set javac "$JAVAC_BIN" || warn "Could not set javac alternative (non-fatal)"
        ok "javac alternative set"
    fi
fi

# --- Set JAVA_HOME ------------------------------------------------------------

header "Configuring JAVA_HOME"

JAVA_HOME_PATH=$(dirname $(dirname $(readlink -f $(which java))))
info "JAVA_HOME = $JAVA_HOME_PATH"

if grep -q 'JAVA_HOME=' /etc/environment 2>/dev/null; then
    sed -i "s|JAVA_HOME=.*|JAVA_HOME=$JAVA_HOME_PATH|" /etc/environment
    ok "JAVA_HOME updated in /etc/environment"
else
    echo "JAVA_HOME=$JAVA_HOME_PATH" >> /etc/environment
    ok "JAVA_HOME added to /etc/environment"
fi

# Also set for current session
export JAVA_HOME="$JAVA_HOME_PATH"

# --- Verify -------------------------------------------------------------------

header "Verification"

java -version && ok "java -version OK" || fail "java command failed"
javac -version && ok "javac -version OK" || warn "javac not found (devel package may not be installed)"

echo ""
echo -e "${GREEN}Java $JAVA_VERSION installed successfully.${NC}"
echo "  Run 'source /etc/environment' or re-login to apply JAVA_HOME."
echo ""