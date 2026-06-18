#!/bin/bash
source /tmp/common.sh

STEP "Guest Additions"
if command -v VBoxControl &>/dev/null; then
    ver=$(VBoxControl --version 2>/dev/null | head -1)
    log_info "Version: $ver"
else
    log_warn "VBoxControl not found — Guest Additions may not be installed"
fi
svc_status=$(systemctl is-active vboxadd-service 2>/dev/null || echo "unknown")
log_info "vboxadd-service: $svc_status"
if [[ "$svc_status" != "active" ]]; then
    log_warn "vboxadd-service is not active — shared folders, clipboard and display resize may not work"
fi
if lsmod | grep -q vboxguest; then
    log_info "vboxguest module: loaded"
else
    log_warn "vboxguest module not loaded — reinstall Guest Additions"
fi

STEP "CPU"
vcpus=$(nproc)
log_info "vCPUs online: $vcpus"
load=$(awk '{print $1, $2, $3}' /proc/loadavg)
log_info "Load average: $load"
load1=$(awk '{print $1}' /proc/loadavg)
if awk -v l="$load1" -v cpus="$vcpus" 'BEGIN { exit !(l > cpus) }'; then
    log_warn "Load average ($load1) exceeds vCPU count ($vcpus) — VM may be under-provisioned"
fi

STEP "Memory"
total_mb=$(awk '/MemTotal/    { printf "%.0f", $2/1024 }' /proc/meminfo)
avail_mb=$(awk '/MemAvailable/{ printf "%.0f", $2/1024 }' /proc/meminfo)
log_info "Total RAM: ${total_mb}M"
log_info "Available: ${avail_mb}M"
swap_total=$(awk '/SwapTotal/ { print $2 }' /proc/meminfo)
swap_free=$( awk '/SwapFree/  { print $2 }' /proc/meminfo)
swap_used_mb=$(( (swap_total - swap_free) / 1024 ))
if [[ $swap_used_mb -gt 0 ]]; then
    log_warn "Swap is in use (${swap_used_mb}M) — allocate more RAM to this VM"
fi

STEP "Network"
nic=''
for _iface in $(ls /sys/class/net 2>/dev/null | grep -v lo); do
    [[ -d "/sys/class/net/$_iface/bridge" ]] && continue
    nic="$_iface"
    break
done
if [[ -n "$nic" ]]; then
    driver=$(ethtool -i "$nic" 2>/dev/null | awk '/^driver:/ { print $2 }' || echo "unknown")
    log_info "Interface: $nic (driver: $driver)"
    if [[ "$driver" == "virtio_net" ]]; then
        log_info "Paravirtual NIC — optimal for Linux guests"
    else
        log_warn "NIC driver '$driver' — virtio_net is faster for Linux guests"
    fi
else
    log_warn "No network interface found (excluding loopback)"
fi

STEP "Storage"
found=0
for dev in /sys/block/vd* /sys/block/nvme*; do
    [[ -e "$dev" ]] || continue
    log_info "$(basename "$dev"): virtio/NVMe — optimal"
    found=1
done
for dev in /sys/block/sd*; do
    [[ -e "$dev" ]] || continue
    bdev=$(basename "$dev")
    dev_path=$(readlink -f "$dev")
    if echo "$dev_path" | grep -q '/ata'; then
        log_info "$bdev: SATA/AHCI"
    else
        log_warn "$bdev: unknown controller — consider virtio-blk or NVMe for better throughput"
    fi
    found=1
done
if [[ $found -eq 0 ]]; then log_warn "No block devices detected"; fi
