# Post-Install Setup

After the VM is created and Fedora is installed on disk, a few manual steps inside the VM are required before provisioning will work. These steps only need to be done once.

## Prerequisites

- The VM must be running with the Fedora live ISO booted
- VirtualBox Guest Additions ISO must be attached (enabled by default in Create VM)

---

## Steps

### 1. Install Fedora to disk

In the live desktop, launch the **Fedora installer** and complete the installation. When it finishes, click **Exit live desktop**.

Before the VM reboots, remove the Fedora ISO: in the VirtualBox menu go to **Devices → Optical Drives → Remove disk from virtual drive**. Then let the VM reboot — it will boot from the installed disk.

During first boot, complete the initial setup wizard:
- Create your login user (e.g. `maxmin`)
- Set a user password

### 2. Update the system

Open a terminal and run:

```bash
sudo dnf update -y
sudo reboot
```

This updates all packages including the kernel. The reboot is required to switch to the new kernel.

### 3. Install Guest Additions

After the reboot, the GA kernel modules (`vboxguest`, `vboxsf`, `vboxvideo`) no longer match the new kernel and must be reinstalled. The GA ISO is already attached as `/dev/sr1`.

```bash
sudo dnf install -y kernel-devel-$(uname -r) kernel-headers gcc make perl
sudo mkdir -p /mnt/ga
sudo mount /dev/sr1 /mnt/ga
sudo /mnt/ga/VBoxLinuxAdditions.run
```

Check the service status:

```bash
sudo systemctl status vboxadd
```

The output should show `active (exited)`. If it shows `failed`, verify the kernel and GA versions match:

```bash
uname -r
cat /var/lib/VBoxGuestAdditions/config | grep INSTALL_VER
```

The GA `INSTALL_VER` should match the VirtualBox version on the host. If it does not, the ISO attached may be from an older VirtualBox install — detach it in **Devices → Optical Drives** and attach the correct ISO.

If the versions look correct but the service still fails:

1. Confirm the running kernel matches the installed `kernel-devel`:
   ```bash
   rpm -q kernel-devel
   ```
   If the versions differ, install the matching one:
   ```bash
   sudo dnf install -y kernel-devel-$(uname -r)
   ```
2. Re-run the installer:
   ```bash
   sudo /mnt/ga/VBoxLinuxAdditions.run
   ```
3. Check the service status again — it should now show `active (exited)`.

#### Reverting to an older kernel

If the current kernel is not yet supported by the installed GA version (e.g. GA 7.2.8 does not support kernel 7.0.x), boot into an older kernel instead. List the available kernel files:

```bash
ls /boot/vmlinuz-*
```

List all GRUB entries with their index numbers:

```bash
sudo grubby --info=ALL
```

Set the older kernel as default by index and reboot:

```bash
sudo grubby --set-default-index=1
sudo reboot
```

After the reboot, the GA ISO mount is lost and must be remounted. Install the matching kernel headers, remount and re-run GA:

```bash
sudo dnf install -y kernel-devel-$(uname -r)
sudo mkdir -p /mnt/ga
sudo mount /dev/sr1 /mnt/ga
sudo /mnt/ga/VBoxLinuxAdditions.run
```

Check the service status — it should now show `active (exited)`:

```bash
sudo systemctl status vboxadd
```

### 4. Set the root password

Provisioning scripts run as `root` via guestcontrol. Set a root password:

```bash
sudo passwd root
```

Enter and confirm the password. Use the same value you will enter in the **VM root password** field on the Provision page.

### 5. Disable SELinux

SELinux blocks the guestcontrol execution service on Fedora. Disable it permanently:

```bash
sudo sed -i 's/^SELINUX=.*/SELINUX=disabled/' /etc/selinux/config
sudo reboot
```

After this reboot, **Test Connection** on the Provision page should succeed and provisioning will be unlocked.

---

## Summary

| Step | Command | Reboot? |
|------|---------|---------|
| 1 | Install Fedora via GUI installer | Yes (exit live desktop) |
| 2 | `sudo dnf update -y` | Yes |
| 3 | Install GA: `dnf install kernel-devel-$(uname -r) ...` + `VBoxLinuxAdditions.run` | No |
| 4 | `sudo passwd root` | No |
| 5 | Disable SELinux in `/etc/selinux/config` | Yes |

Steps 3, 4, and 5 can all be done in the same session before the final reboot.
