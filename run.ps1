

#Requires -Version 5.1
<#
.SYNOPSIS
    GUI runner for VirtualBox Fedora VM setup scripts.

.DESCRIPTION
    Provides a simple GUI to select options and run the VirtualBox setup pipeline.
#>

# Load Windows Forms
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Create form
$form = New-Object System.Windows.Forms.Form
$form.Text = "VirtualBox Fedora VM Setup"
$form.Size = New-Object System.Drawing.Size(400, 250)
$form.StartPosition = "CenterScreen"

# Checkbox for cleanup
$chkCleanup = New-Object System.Windows.Forms.CheckBox
$chkCleanup.Text = "Run cleanup first (removes failed VMs and leftover files)"
$chkCleanup.Location = New-Object System.Drawing.Point(20, 20)
$chkCleanup.Checked = $true
$form.Controls.Add($chkCleanup)

# Checkbox for sanity checks
$chkSanity = New-Object System.Windows.Forms.CheckBox
$chkSanity.Text = "Run sanity checks before installing VirtualBox"
$chkSanity.Location = New-Object System.Drawing.Point(20, 50)
$chkSanity.Checked = $true
$form.Controls.Add($chkSanity)

# Run button
$btnRun = New-Object System.Windows.Forms.Button
$btnRun.Text = "Run Pipeline"
$btnRun.Location = New-Object System.Drawing.Point(20, 80)
$btnRun.Size = New-Object System.Drawing.Size(100, 30)
$form.Controls.Add($btnRun)

# Status label
$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Text = "Ready to run. Select options and click 'Run Pipeline'."
$lblStatus.Location = New-Object System.Drawing.Point(20, 120)
$lblStatus.Size = New-Object System.Drawing.Size(350, 60)
$lblStatus.AutoSize = $false
$form.Controls.Add($lblStatus)

# Button click event
$btnRun.Add_Click({
    $btnRun.Enabled = $false
    $lblStatus.Text = "Starting pipeline..."

    try {
        if ($chkCleanup.Checked) {
            $lblStatus.Text = "Running cleanup..."
            [System.Windows.Forms.Application]::DoEvents()
            & powershell -ExecutionPolicy Bypass -File "C:\Projects\virtualbox\cleanup.ps1"
        }

        if ($chkSanity.Checked) {
            $lblStatus.Text = "Running sanity checks..."
            [System.Windows.Forms.Application]::DoEvents()
            & powershell -ExecutionPolicy Bypass -File "C:\Projects\virtualbox\virtualbox-sanity-checks.ps1"
        }

        $lblStatus.Text = "Installing VirtualBox..."
        [System.Windows.Forms.Application]::DoEvents()
        & powershell -ExecutionPolicy Bypass -File "C:\Projects\virtualbox\virtualbox-install.ps1"

        $lblStatus.Text = "Creating Fedora VM..."
        [System.Windows.Forms.Application]::DoEvents()
        & powershell -ExecutionPolicy Bypass -File "C:\Projects\virtualbox\create-vm.ps1"

        $lblStatus.Text = "Provisioning VM with dev tools..."
        [System.Windows.Forms.Application]::DoEvents()
        & powershell -ExecutionPolicy Bypass -File "C:\Projects\virtualbox\provision-vm.ps1"

        $lblStatus.Text = "Setup complete!"
    }
    catch {
        $lblStatus.Text = "Error occurred: $($_.Exception.Message)"
    }
    finally {
        $btnRun.Enabled = $true
    }
})

# Show the form
$form.ShowDialog()