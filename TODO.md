# TODO

## Refactoring / Rationalization

- [ ] Project analysis — review overall architecture and identify areas for simplification or cleanup

## VM Creation

- [ ] Track completed creation steps per VM (e.g. Guest Additions installed, shared folder configured) and expose that state to other pages/functions

## New VM detail page

## check every page if all components fit into it

## new functionality gui share logs

## make the bar determinate (actual % from script output), which would require adding progress markers to the .ps1 scripts and parsing them in the IPC layer. That would make the bars genuinely useful

## test what happens when the user creates a new vm, enters 'maxmin' as login name, but then he is finalizing vm creation in Virtual Box he creates a login user with the name of 'artur'

## check if after vm restart the shared dir is there

## after vm creation, in the things to do displayed to the user, add how to check that kernel version and guest addition version are the same, also to check guest addition install logs, also selinux status