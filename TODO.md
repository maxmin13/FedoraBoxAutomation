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

## check every page if all components fit into it

## make the bar determinate (actual % from script output), which would require adding progress markers to the .ps1 scripts and parsing them in the IPC layer. That would make the bars genuinely useful

## test what happens when the user creates a new vm, enters 'maxmin' as login name, but then he is finalizing vm creation in Virtual Box he creates a login user with the name of 'artur'


# the user should be prevented to share folder /var/logs, that is reserved for the share logs functionality

# when the user click delete vm, there is a confirmatin message, would it be beter to add another confirmation with a pop-up windows with the name of the vm in big capital letters?

## review next and back button position, validation, also all the other buttons, how to make them consistent

# what happens if the user tries to share a dir that doesn't exist in the vm

# change the folder permission of the vm shared folder to allow login user, not only root

# i don't see the tooltip