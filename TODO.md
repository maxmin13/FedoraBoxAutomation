# TODO

## Refactoring / Rationalization

- [ ] Project analysis — review overall architecture and identify areas for simplification or cleanup

## VM Creation

- [ ] Track completed creation steps per VM (e.g. Guest Additions installed, shared folder configured) and expose that state to other pages/functions
- [ ] "What to do next" panel (next-steps UI) is missing the full post-install verification and recovery steps that the script already prints to host.log — add: `sudo usermod -aG vboxsf`, post-reboot GA checks (lsmod, systemctl, vboxadd-install.log, modinfo, groups, su - root), and the "if something went wrong" recovery block
this status should be checked before edit a vm.
how is it possible to say that the fedora operating system has been installed? or that the guest additions have been installed?
these are steps that the user do inside the vm.
how is it possible to assign a status to that?


## make the bar determinate (actual % from script output), which would require adding progress markers to the .ps1 scripts and parsing them in the IPC layer. That would make the bars genuinely useful

## in the create vm first step, remove root and login user, suggest a name instead of identity

## when the user hits a menu display the first page, except when the app is doing something, in this case keep the memory of the last page visited by the user and display it
