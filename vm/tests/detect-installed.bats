#!/usr/bin/env bats

# Tests for vm/detect-installed.sh
#
# Run from the project root:
#   bats vm/tests/detect-installed.bats

SCRIPT="$(cd "$(dirname "$BATS_TEST_FILENAME")/.." && pwd)/detect-installed.sh"

# Parses the JSON produced by detect-installed.sh and prints the value of one
# top-level field ("false" for JSON false, otherwise the raw string value).
_json_field() {
    python3 -c "
import json, sys
d = json.load(sys.stdin)
v = d['$1']
print(v if isinstance(v, str) else str(v).lower())
" <<< "$OUTPUT"
}

setup() {
    rm -rf /opt/idea-IC-2024.1.7 /opt/idea-IC-2025.1.2 /opt/idea-IC-2025.3
}

teardown() {
    rm -rf /opt/idea-IC-2024.1.7 /opt/idea-IC-2025.1.2 /opt/idea-IC-2025.3
}

@test "exits 0" {
    run bash "$SCRIPT"
    [ "$status" -eq 0 ]
}

@test "reports intellij false when no version directory exists" {
    run bash "$SCRIPT"
    OUTPUT="$output"
    [[ "$(_json_field intellij)" == "false" ]]
}

@test "reports a single installed intellij version" {
    mkdir -p /opt/idea-IC-2025.3
    run bash "$SCRIPT"
    OUTPUT="$output"
    [[ "$(_json_field intellij)" == "2025.3" ]]
}

@test "lists every installed intellij version, not just the first" {
    mkdir -p /opt/idea-IC-2024.1.7 /opt/idea-IC-2025.1.2 /opt/idea-IC-2025.3
    run bash "$SCRIPT"
    OUTPUT="$output"
    field="$(_json_field intellij)"
    [[ "$field" == *"2024.1.7"* ]]
    [[ "$field" == *"2025.1.2"* ]]
    [[ "$field" == *"2025.3"* ]]
}

@test "orders installed intellij versions newest first" {
    mkdir -p /opt/idea-IC-2024.1.7 /opt/idea-IC-2025.1.2 /opt/idea-IC-2025.3
    run bash "$SCRIPT"
    OUTPUT="$output"
    [[ "$(_json_field intellij)" == "2025.3, 2025.1.2, 2024.1.7" ]]
}
