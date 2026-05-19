# TODO

## Refactoring / Rationalization

- [ ] Project analysis — review overall architecture and identify areas for simplification or cleanup

## VM Creation

- [ ] Track completed creation steps per VM (e.g. Guest Additions installed, shared folder configured) and expose that state to other pages/functions
- [ ] "What to do next" panel (next-steps UI) is missing the full post-install verification and recovery steps that the script already prints to host.log — add: `sudo usermod -aG vboxsf`, post-reboot GA checks (lsmod, systemctl, vboxadd-install.log, modinfo, groups, su - root), and the "if something went wrong" recovery block

## New VM detail page

## check every page if all components fit into it

## ~~new functionality gui share logs~~ (done)

## make the bar determinate (actual % from script output), which would require adding progress markers to the .ps1 scripts and parsing them in the IPC layer. That would make the bars genuinely useful

## test what happens when the user creates a new vm, enters 'maxmin' as login name, but then he is finalizing vm creation in Virtual Box he creates a login user with the name of 'artur'



