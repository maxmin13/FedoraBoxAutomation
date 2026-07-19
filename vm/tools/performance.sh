#!/bin/bash

##
## Description: Outputs a JSON performance snapshot of the VM —
##              CPU usage %, RAM stats, and top 14 processes by CPU.
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

read -r total1 idle1 <<< "$s1"
read -r total2 idle2 <<< "$s2"

cpu_pct=$(awk "BEGIN {
    dt = $total2 - $total1
    di = $idle2  - $idle1
    if (dt > 0) printf \"%.1f\", 100 * (1 - di / dt)
    else        printf \"0.0\"
}")

# ── RAM (from free -m) ───────────────────────────────────────────────────────
read -r ram_total ram_used ram_free <<< "$(free -m | awk 'NR==2{print $2, $3, $4}')"

# ── Top 14 processes by CPU ──────────────────────────────────────────────────
# comm alone collapses multi-process apps (Electron, JVMs, node scripts) into
# indistinguishable rows, so pull a disambiguating suffix from the full args:
# a Chromium/Electron --type= role, else the basename of the first script/jar
# argument (e.g. "node (server.js)", "java (app.jar)"). The top-level process
# of an app usually has neither (no --type=, no extra path argument) — once
# every row is collected, any bare name that shares its base with a suffixed
# sibling is labelled "(main)" so it's not left looking unidentified.
procs_json=$(ps -eo pid,comm,%cpu,%mem,rss,args --sort=-%cpu --no-headers \
    | awk '$2 != "ps" && $3 ~ /^[0-9]/ {
        if (n >= 14) exit
        base = $2
        gsub(/"/, "", base)
        gsub(/[<>]/, "", base)

        args = ""
        for (i = 6; i <= NF; i++) args = args (i > 6 ? " " : "") $i

        # ps truncates comm to 15 chars, so distinct binaries sharing a
        # 15-char prefix (abrt-dump-journal-core/-oops/-xorg) collapse into
        # one indistinguishable base. Recover the full name from argv[0],
        # which the kernel does not truncate, whenever that looks like the
        # case (comm is exactly 15 chars and is a prefix of argv[0]).
        n_tok = split(args, toks, " ")
        argv0 = toks[1]
        gsub(/.*\//, "", argv0)
        if (length(base) == 15 && length(argv0) > 15 && index(argv0, base) == 1) base = argv0

        suffix = ""
        if (match(args, /--type=[A-Za-z0-9_-]+/)) {
            suffix = substr(args, RSTART + 7, RLENGTH - 7)
        } else {
            for (t = 2; t <= n_tok; t++) {
                tok = toks[t]
                if (tok !~ /^-/ && tok !~ /@/ && (tok ~ /\.[A-Za-z0-9]+$/ || tok ~ /^\//)) {
                    gsub(/.*\//, "", tok)
                    if (length(tok) > 0 && length(tok) <= 24 && tok !~ /^[0-9]+$/) suffix = tok
                    break
                }
            }
        }
        gsub(/"/, "", suffix)

        n++
        pid[n] = $1; pbase[n] = base; psuf[n] = suffix; pcpu[n] = $3; pmem[n] = $4; prss[n] = $5
        baseCount[base]++
    }
    END {
        sep = ""
        for (i = 1; i <= n; i++) {
            name = pbase[i]
            if (psuf[i] != "") name = name " (" psuf[i] ")"
            else if (baseCount[pbase[i]] > 1) name = name " (main)"
            printf "%s{\"pid\":%s,\"name\":\"%s\",\"cpu\":%s,\"mem\":%s,\"rssMB\":%d}",
                sep, pid[i], name, pcpu[i], pmem[i], prss[i] / 1024
            sep = ","
        }
    }')

printf '{"cpuPct":%s,"ramTotalMB":%d,"ramUsedMB":%d,"ramFreeMB":%d,"processes":[%s]}\n' \
    "$cpu_pct" "$ram_total" "$ram_used" "$ram_free" "$procs_json"
