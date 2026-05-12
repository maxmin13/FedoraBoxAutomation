#!/usr/bin/env bats

# Tests for vm/lib/common.sh
#
# Run from the project root:
#   bats vm/tests/common.bats
#
# Install bats-core once:
#   sudo dnf install -y bats          # Fedora
#   sudo apt-get install -y bats      # Ubuntu/Debian

COMMON_SH="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/lib/common.sh"

setup() {
    TEST_TMPDIR="$(mktemp -d)"

    # Override the log path so the tee in common.sh writes to a writable temp file
    # (the default /var/log path requires root)
    export FEDORA_BOX_LOG="$TEST_TMPDIR/fedora-box-automation.log"

    # Stub 'id' to report UID 0 (root) so the root check in common.sh passes.
    # Without this, sourcing common.sh as a non-root user exits immediately.
    mkdir -p "$TEST_TMPDIR/bin"
    printf '#!/bin/bash\n[[ "$1" == "-u" ]] && echo 0\n' > "$TEST_TMPDIR/bin/id"
    chmod +x "$TEST_TMPDIR/bin/id"
    export PATH="$TEST_TMPDIR/bin:$PATH"
}

teardown() {
    rm -rf "$TEST_TMPDIR"
}

# ── 1. Root check ──────────────────────────────────────────────────────────────

@test "exits 1 with an error when not run as root" {
    # Override the id stub to report a non-root UID
    printf '#!/bin/bash\n[[ "$1" == "-u" ]] && echo 1001\n' > "$TEST_TMPDIR/bin/id"

    run bash -c "source '$COMMON_SH'" 2>&1
    [ "$status" -eq 1 ]
    [[ "$output" == *"must be run as root"* ]]
}

# ── 2. log_info ────────────────────────────────────────────────────────────────

@test "log_info line contains INFO and the message" {
    run bash << EOF
export PATH="$TEST_TMPDIR/bin:\$PATH"
export FEDORA_BOX_LOG="$FEDORA_BOX_LOG"
source "$COMMON_SH"
log_info "hello from info"
EOF
    [[ "$output" == *"INFO"* ]]
    [[ "$output" == *"hello from info"* ]]
}

@test "log_info timestamp matches YYYY-MM-DD HH:MM:SS" {
    run bash << EOF
export PATH="$TEST_TMPDIR/bin:\$PATH"
export FEDORA_BOX_LOG="$FEDORA_BOX_LOG"
source "$COMMON_SH"
log_info "timestamp check"
EOF
    [[ "$output" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}\ [0-9]{2}:[0-9]{2}:[0-9]{2} ]]
}

# ── 3. log_warn ────────────────────────────────────────────────────────────────

@test "log_warn line contains WARN and the message" {
    run bash << EOF
export PATH="$TEST_TMPDIR/bin:\$PATH"
export FEDORA_BOX_LOG="$FEDORA_BOX_LOG"
source "$COMMON_SH"
log_warn "low disk space"
EOF
    [[ "$output" == *"WARN"* ]]
    [[ "$output" == *"low disk space"* ]]
}

# ── 4. log_error ───────────────────────────────────────────────────────────────

@test "log_error line contains ERROR and the message" {
    run bash << EOF
export PATH="$TEST_TMPDIR/bin:\$PATH"
export FEDORA_BOX_LOG="$FEDORA_BOX_LOG"
source "$COMMON_SH"
log_error "something broke"
EOF
    [[ "$output" == *"ERROR"* ]]
    [[ "$output" == *"something broke"* ]]
}

# ── 5. STEP ────────────────────────────────────────────────────────────────────

@test "STEP line contains STEP level and wraps the message with ===[ ]===" {
    run bash << EOF
export PATH="$TEST_TMPDIR/bin:\$PATH"
export FEDORA_BOX_LOG="$FEDORA_BOX_LOG"
source "$COMMON_SH"
STEP "Installing packages"
EOF
    [[ "$output" == *"STEP"* ]]
    [[ "$output" == *"===[ Installing packages ]==="* ]]
}

# ── 6. Log file tee ────────────────────────────────────────────────────────────

@test "log output is teed to the log file" {
    bash << EOF
export PATH="$TEST_TMPDIR/bin:\$PATH"
export FEDORA_BOX_LOG="$FEDORA_BOX_LOG"
source "$COMMON_SH"
log_info "persisted message"
EOF
    grep -q "persisted message" "$FEDORA_BOX_LOG"
}
