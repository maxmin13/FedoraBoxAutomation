# Cisco Packet Tracer

Cisco Packet Tracer is a network simulation tool available through the Cisco NetAcad programme.
The installer cannot be downloaded automatically — it requires a free NetAcad account.

## Before running the script

1. Register or log in at https://www.netacad.com
2. Download the **Linux (.deb)** installer for Packet Tracer
3. Place the `.deb` file in this `cisco/` folder (it is excluded from version control via `.gitignore`)

## Running via the provisioning menu

Select **Network -> packettracer.sh** from the provision-vm.ps1 menu.
When prompted, enter:

```
<path-to-cisco-folder> <installer-filename>.deb
```

Example:

```
/tmp/cisco  CiscoPacketTracer_825_Ubuntu_64bit.deb
```

## Running manually inside the VM

```bash
sudo ./packettracer.sh <provision-dir> <installer.deb>
```

Example:

```bash
sudo ./packettracer.sh /tmp/cisco CiscoPacketTracer_825_Ubuntu_64bit.deb
```

## What the script does

- Extracts the `.deb` package using `ar` and `tar`
- Copies files to `/usr` and `/opt/pt`
- Registers GNOME desktop entries and MIME types
- Creates a symlink at `/usr/local/bin/PacketTracer`
- Requires a reboot after installation

## Notes

- The installer file is excluded from version control via `dist/.gitignore`
- The script is idempotent: if `/opt/pt` already exists, installation is skipped
