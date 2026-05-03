# Packet Tracer Installer

Place the Cisco Packet Tracer `.deb` installer file in the `dist` folder before running `packettracer.sh`.

The installer must be downloaded manually from the Cisco NetAcad portal (login required):
https://www.netacad.com/portal/resources

## Usage

```bash
sudo ./scripts/cisco/packettracer.sh ./scripts/cisco/dist <installer-filename>.deb
```

The installer file is excluded from version control via `dist/.gitignore`.
