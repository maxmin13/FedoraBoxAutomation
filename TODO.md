
# rebuild zip dist file
# review readme file snapshots

# create a new vm, verify all the provision scripts after change most recent version

# finish testing the provision scrpts done until postgresql

# details page: clicking a version badge (httpd/tomcat/postgresql) should pop up
# a confirmation to enable/disable that version's systemd service - needs an IPC
# handler to run systemctl enable|disable via guestcontrol and resolve the right
# service name per tool+version (not applicable to java/maven, which use alternatives)