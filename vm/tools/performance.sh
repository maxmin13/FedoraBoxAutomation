#!/bin/bash

##
## Description: Outputs a JSON performance snapshot of the VM —
##              CPU usage %, RAM stats, and top 15 processes by CPU.
##              Invoked by the GUI performance page via guestcontrol.
## Usage:       sudo ./performance.sh
##

# ── CPU (sample /proc/stat over 500 ms for a current-% reading) ─────────────
read_cpu_stat() {
    awk '/^cpu / {
        idle = $5 + $6
        total = 0
        for (i = 2; i <= NF; i++) total += $i
        print total, idle
    }' /proc/stat
}

s1=$(read_cpu_stat)
sleep 0.5
s2=$(read_cpu_stat)

total1=$(echo "$s1" | awk '{print $1}')
idle1=$(echo  "$s1" | awk '{print $2}')
total2=$(echo "$s2" | awk '{print $1}')
idle2=$(echo  "$s2" | awk '{print $2}')

cpu_pct=$(awk "BEGIN {
    dt = $total2 - $total1
    di = $idle2  - $idle1
    if (dt > 0) printf \"%.1f\", 100 * (1 - di / dt)
    else        printf \"0.0\"
}")

# ── RAM (from free -m) ───────────────────────────────────────────────────────
ram_total=$(free -m | awk 'NR==2{print $2}')
ram_used=$(free  -m | awk 'NR==2{print $3}')
ram_free=$(free  -m | awk 'NR==2{print $4}')

# ── Top 15 processes by CPU ──────────────────────────────────────────────────
procs_json=$(ps -eo pid,comm,%cpu,%mem,rss --sort=-%cpu --no-headers \
    | awk '$2 != "ps"' \
    | head -8 \
    | awk 'BEGIN { sep="" } $3 ~ /^[0-9]/ {
        name = $2
        gsub(/"/, "", name)
        gsub(/[<>]/, "", name)
        printf "%s{\"pid\":%s,\"name\":\"%s\",\"cpu\":%s,\"mem\":%s,\"rssMB\":%d}",
            sep, $1, name, $3, $4, $5 / 1024
        sep = ","
    }')

printf '{"cpuPct":%s,"ramTotalMB":%d,"ramUsedMB":%d,"ramFreeMB":%d,"processes":[%s]}\n' \
    "$cpu_pct" "$ram_total" "$ram_used" "$ram_free" "$procs_json"
