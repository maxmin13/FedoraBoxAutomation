# ============================================================
#  virtualbox-sanity-checks.Tests.ps1
#  Pester v5 unit tests for virtualbox-sanity-checks.ps1
#
#  Each test:
#    1. Sets up mocks that control what the system reports
#    2. Runs the script with -Json to get structured output
#    3. Asserts that the correct status (pass/warn/fail) was returned
#
#  Run from the project root:
#    Invoke-Pester -Path ".\host\virtualbox-sanity-checks.Tests.ps1" -Output Detailed
# ============================================================

BeforeAll {
    $script:ScriptPath = "$PSScriptRoot\virtualbox-sanity-checks.ps1"

    # ── Helpers ───────────────────────────────────────────────────────────────

    # Runs the script with -Json and returns all results as objects.
    # Each object has: id, label, status, detail
    function Invoke-SanityChecks {
        $raw = & $script:ScriptPath -Json | Out-String
        return $raw | ConvertFrom-Json
    }

    # Runs the checks and returns just the result for one check by its id.
    # Capture into a variable first so that piping it to Where-Object unrolls
    # the array (piping a variable enumerates; piping a pipeline result does not).
    function Get-CheckResult {
        param([string]$Id)
        $all = Invoke-SanityChecks
        return ($all | Where-Object { $_.id -eq $Id })
    }

    # ── Default mocks — happy path (everything passes) ────────────────────────
    # All tests start from this baseline. Individual It blocks override
    # specific mocks to simulate problem conditions.

    Mock Get-CimInstance {
        switch ($ClassName) {
            'Win32_OperatingSystem' {
                return [PSCustomObject]@{
                    Caption                = 'Windows 11 Home'
                    BuildNumber            = '26200'
                    OSArchitecture         = '64-bit'
                    FreePhysicalMemory     = 8388608   # 8 GB in KB
                    TotalVisibleMemorySize = 16777216  # 16 GB in KB
                }
            }
            'Win32_ComputerSystem' {
                return [PSCustomObject]@{
                    TotalPhysicalMemory = 17179869184  # 16 GB in bytes
                }
            }
            'Win32_Processor' {
                return [PSCustomObject]@{
                    Name                          = 'Intel Core i7'
                    NumberOfCores                 = 8
                    NumberOfLogicalProcessors     = 16
                    VirtualizationFirmwareEnabled = $true
                }
            }
        }
    }

    Mock Get-PSDrive {
        return [PSCustomObject]@{
            Free = 107374182400   # 100 GB in bytes
            Used = 429496729600   # 400 GB in bytes
        }
    }

    # systeminfo is a native Windows command — we mock it to return the
    # "enabled" string that the script looks for
    Mock systeminfo { return 'Virtualization Enabled In Firmware: Yes' }

    Mock Get-WindowsOptionalFeature {
        return [PSCustomObject]@{ State = 'Disabled' }
    }

    Mock Confirm-SecureBootUEFI { return $false }

    # Return null = VirtualBox not found in registry (used for the not-installed test)
    # Individual tests override this to simulate an installed version
    Mock Get-ItemProperty { return $null }
}

# ── 1. OS CHECK ───────────────────────────────────────────────────────────────

Describe 'OS Check' -Tag 'OsCheck' {

    It 'returns pass for a 64-bit OS' {
        $result = Get-CheckResult -Id 'os'
        $result.status | Should -Be 'pass'
    }

    It 'returns fail for a 32-bit OS' {
        Mock Get-CimInstance {
            switch ($ClassName) {
                'Win32_OperatingSystem' {
                    return [PSCustomObject]@{
                        Caption                = 'Windows 11 Home'
                        BuildNumber            = '26200'
                        OSArchitecture         = '32-bit'
                        FreePhysicalMemory     = 8388608
                        TotalVisibleMemorySize = 16777216
                    }
                }
                'Win32_ComputerSystem' {
                    return [PSCustomObject]@{ TotalPhysicalMemory = 17179869184 }
                }
                'Win32_Processor' {
                    return [PSCustomObject]@{
                        Name = 'Intel Core i7'; NumberOfCores = 8
                        NumberOfLogicalProcessors = 16; VirtualizationFirmwareEnabled = $true
                    }
                }
            }
        }
        $result = Get-CheckResult -Id 'os'
        $result.status | Should -Be 'fail'
    }
}

# ── 2. RAM CHECK ──────────────────────────────────────────────────────────────

Describe 'RAM Check' -Tag 'RamCheck' {

    It 'returns pass when total RAM >= 8 GB and free RAM >= 5120 MB' {
        # Default mock: 16 GB total, 8 GB free
        $result = Get-CheckResult -Id 'ram'
        $result.status | Should -Be 'pass'
    }

    It 'returns warn when total RAM is between 4 GB and 8 GB' {
        Mock Get-CimInstance {
            switch ($ClassName) {
                'Win32_OperatingSystem' {
                    return [PSCustomObject]@{
                        Caption = 'Windows 11 Home'; BuildNumber = '26200'
                        OSArchitecture = '64-bit'
                        FreePhysicalMemory = 6291456; TotalVisibleMemorySize = 6291456  # 6 GB free
                    }
                }
                'Win32_ComputerSystem' {
                    return [PSCustomObject]@{ TotalPhysicalMemory = 6442450944 }  # 6 GB
                }
                'Win32_Processor' {
                    return [PSCustomObject]@{
                        Name = 'Intel Core i7'; NumberOfCores = 8
                        NumberOfLogicalProcessors = 16; VirtualizationFirmwareEnabled = $true
                    }
                }
            }
        }
        $result = Get-CheckResult -Id 'ram'
        $result.status | Should -Be 'warn'
    }

    It 'returns fail when total RAM is less than 4 GB' {
        Mock Get-CimInstance {
            switch ($ClassName) {
                'Win32_OperatingSystem' {
                    return [PSCustomObject]@{
                        Caption = 'Windows 11 Home'; BuildNumber = '26200'
                        OSArchitecture = '64-bit'
                        FreePhysicalMemory = 3145728; TotalVisibleMemorySize = 3145728
                    }
                }
                'Win32_ComputerSystem' {
                    return [PSCustomObject]@{ TotalPhysicalMemory = 3221225472 }  # 3 GB
                }
                'Win32_Processor' {
                    return [PSCustomObject]@{
                        Name = 'Intel Core i7'; NumberOfCores = 8
                        NumberOfLogicalProcessors = 16; VirtualizationFirmwareEnabled = $true
                    }
                }
            }
        }
        $result = Get-CheckResult -Id 'ram'
        $result.status | Should -Be 'fail'
    }

    It 'returns fail when free RAM is less than 3072 MB even if total RAM is sufficient' {
        Mock Get-CimInstance {
            switch ($ClassName) {
                'Win32_OperatingSystem' {
                    return [PSCustomObject]@{
                        Caption = 'Windows 11 Home'; BuildNumber = '26200'
                        OSArchitecture = '64-bit'
                        FreePhysicalMemory = 2097152    # 2 GB free in KB
                        TotalVisibleMemorySize = 16777216
                    }
                }
                'Win32_ComputerSystem' {
                    return [PSCustomObject]@{ TotalPhysicalMemory = 17179869184 }  # 16 GB
                }
                'Win32_Processor' {
                    return [PSCustomObject]@{
                        Name = 'Intel Core i7'; NumberOfCores = 8
                        NumberOfLogicalProcessors = 16; VirtualizationFirmwareEnabled = $true
                    }
                }
            }
        }
        $result = Get-CheckResult -Id 'ram'
        $result.status | Should -Be 'fail'
    }

    It 'returns warn when free RAM is between 3072 MB and 5120 MB even if total RAM is sufficient' {
        Mock Get-CimInstance {
            switch ($ClassName) {
                'Win32_OperatingSystem' {
                    return [PSCustomObject]@{
                        Caption = 'Windows 11 Home'; BuildNumber = '26200'
                        OSArchitecture = '64-bit'
                        FreePhysicalMemory = 4096000    # ~4 GB free in KB
                        TotalVisibleMemorySize = 16777216
                    }
                }
                'Win32_ComputerSystem' {
                    return [PSCustomObject]@{ TotalPhysicalMemory = 17179869184 }  # 16 GB
                }
                'Win32_Processor' {
                    return [PSCustomObject]@{
                        Name = 'Intel Core i7'; NumberOfCores = 8
                        NumberOfLogicalProcessors = 16; VirtualizationFirmwareEnabled = $true
                    }
                }
            }
        }
        $result = Get-CheckResult -Id 'ram'
        $result.status | Should -Be 'warn'
    }
}

# ── 4. DISK CHECK ─────────────────────────────────────────────────────────────

Describe 'Disk Check' -Tag 'DiskCheck' {

    It 'returns pass when free disk space is 30 GB or more' {
        # Default mock has 100 GB free — should pass
        $result = Get-CheckResult -Id 'disk'
        $result.status | Should -Be 'pass'
    }

    It 'returns warn when free disk space is between 10 GB and 30 GB' {
        Mock Get-PSDrive {
            return [PSCustomObject]@{
                Free = 21474836480   # 20 GB in bytes
                Used = 429496729600
            }
        }
        $result = Get-CheckResult -Id 'disk'
        $result.status | Should -Be 'warn'
    }

    It 'returns fail when free disk space is less than 10 GB' {
        Mock Get-PSDrive {
            return [PSCustomObject]@{
                Free = 5368709120   # 5 GB in bytes
                Used = 429496729600
            }
        }
        $result = Get-CheckResult -Id 'disk'
        $result.status | Should -Be 'fail'
    }
}

# ── 5. CPU VIRTUALISATION CHECK ───────────────────────────────────────────────

Describe 'CPU Virtualisation Check' -Tag 'CpuCheck' {

    It 'returns pass when WMI reports virtualisation enabled' {
        # Default mock has VirtualizationFirmwareEnabled = true
        $result = Get-CheckResult -Id 'cpu'
        $result.status | Should -Be 'pass'
    }

    It 'returns pass when systeminfo reports virtualisation enabled but WMI does not' {
        Mock Get-CimInstance {
            switch ($ClassName) {
                'Win32_OperatingSystem' {
                    return [PSCustomObject]@{
                        Caption = 'Windows 11 Home'; BuildNumber = '26200'
                        OSArchitecture = '64-bit'
                        FreePhysicalMemory = 8388608; TotalVisibleMemorySize = 16777216
                    }
                }
                'Win32_ComputerSystem' {
                    return [PSCustomObject]@{ TotalPhysicalMemory = 17179869184 }
                }
                'Win32_Processor' {
                    return [PSCustomObject]@{
                        Name = 'Intel Core i7'; NumberOfCores = 8
                        NumberOfLogicalProcessors = 16
                        VirtualizationFirmwareEnabled = $false   # WMI reports disabled
                    }
                }
            }
        }
        # But systeminfo says yes — script should still pass
        Mock systeminfo { return 'Virtualization Enabled In Firmware: Yes' }

        $result = Get-CheckResult -Id 'cpu'
        $result.status | Should -Be 'pass'
    }

    It 'returns warn when both WMI and systeminfo report virtualisation disabled' {
        Mock Get-CimInstance {
            switch ($ClassName) {
                'Win32_OperatingSystem' {
                    return [PSCustomObject]@{
                        Caption = 'Windows 11 Home'; BuildNumber = '26200'
                        OSArchitecture = '64-bit'
                        FreePhysicalMemory = 8388608; TotalVisibleMemorySize = 16777216
                    }
                }
                'Win32_ComputerSystem' {
                    return [PSCustomObject]@{ TotalPhysicalMemory = 17179869184 }
                }
                'Win32_Processor' {
                    return [PSCustomObject]@{
                        Name = 'Intel Core i7'; NumberOfCores = 8
                        NumberOfLogicalProcessors = 16
                        VirtualizationFirmwareEnabled = $false
                    }
                }
            }
        }
        Mock systeminfo { return 'Virtualization Enabled In Firmware: No' }

        $result = Get-CheckResult -Id 'cpu'
        $result.status | Should -Be 'warn'
    }
}

# ── 6. HYPER-V CHECK ──────────────────────────────────────────────────────────

Describe 'Hyper-V Check' -Tag 'HyperVCheck' {

    It 'returns pass when Hyper-V is not enabled' {
        # Default mock returns Disabled
        $result = Get-CheckResult -Id 'hyperv'
        $result.status | Should -Be 'pass'
    }

    It 'returns warn when Hyper-V is enabled' {
        Mock Get-WindowsOptionalFeature {
            param($FeatureName)
            if ($FeatureName -eq 'Microsoft-Hyper-V-All') {
                return [PSCustomObject]@{ State = 'Enabled' }
            }
            return [PSCustomObject]@{ State = 'Disabled' }
        }
        $result = Get-CheckResult -Id 'hyperv'
        $result.status | Should -Be 'warn'
    }

    It 'falls back to the systeminfo hypervisor hint when not elevated and a hypervisor is detected' {
        Mock Get-WindowsOptionalFeature { throw 'The requested operation requires elevation.' }
        Mock systeminfo { return 'Hyper-V Requirements:          A hypervisor has been detected.' }
        $result = Get-CheckResult -Id 'hyperv'
        $result.status | Should -Be 'warn'
        $result.detail | Should -Match 'systeminfo reports a Windows hypervisor is active'
    }

    It 'falls back to the generic "run as Administrator" message when not elevated and no hypervisor is detected' {
        Mock Get-WindowsOptionalFeature { throw 'The requested operation requires elevation.' }
        Mock systeminfo { return 'Virtualization Enabled In Firmware: Yes' }
        $result = Get-CheckResult -Id 'hyperv'
        $result.status | Should -Be 'warn'
        $result.detail | Should -Match 'run as Administrator'
        $result.detail | Should -Not -Match 'systeminfo reports a Windows hypervisor is active'
    }
}

# ── 7. WINDOWS HYPERVISOR PLATFORM CHECK ──────────────────────────────────────

Describe 'Windows Hypervisor Platform Check' -Tag 'WhpCheck' {

    It 'returns pass when WHP is not enabled' {
        $result = Get-CheckResult -Id 'whp'
        $result.status | Should -Be 'pass'
    }

    It 'returns warn when WHP is enabled' {
        Mock Get-WindowsOptionalFeature {
            param($FeatureName)
            if ($FeatureName -eq 'HypervisorPlatform') {
                return [PSCustomObject]@{ State = 'Enabled' }
            }
            return [PSCustomObject]@{ State = 'Disabled' }
        }
        $result = Get-CheckResult -Id 'whp'
        $result.status | Should -Be 'warn'
    }

    It 'falls back to a short pointer at the Hyper-V check when not elevated and a hypervisor is detected' {
        Mock Get-WindowsOptionalFeature { throw 'The requested operation requires elevation.' }
        Mock systeminfo { return 'Hyper-V Requirements:          A hypervisor has been detected.' }
        $result = Get-CheckResult -Id 'whp'
        $result.status | Should -Be 'warn'
        $result.detail | Should -Match 'see the Hyper-V check above'
    }
}

# ── 8. VIRTUAL MACHINE PLATFORM CHECK ─────────────────────────────────────────

Describe 'Virtual Machine Platform Check' -Tag 'VmpCheck' {

    It 'returns pass when VMP is not enabled' {
        $result = Get-CheckResult -Id 'vmp'
        $result.status | Should -Be 'pass'
    }

    It 'returns warn when VMP is enabled' {
        Mock Get-WindowsOptionalFeature {
            param($FeatureName)
            if ($FeatureName -eq 'VirtualMachinePlatform') {
                return [PSCustomObject]@{ State = 'Enabled' }
            }
            return [PSCustomObject]@{ State = 'Disabled' }
        }
        $result = Get-CheckResult -Id 'vmp'
        $result.status | Should -Be 'warn'
    }

    It 'falls back to a short pointer at the Hyper-V check when not elevated and a hypervisor is detected' {
        Mock Get-WindowsOptionalFeature { throw 'The requested operation requires elevation.' }
        Mock systeminfo { return 'Hyper-V Requirements:          A hypervisor has been detected.' }
        $result = Get-CheckResult -Id 'vmp'
        $result.status | Should -Be 'warn'
        $result.detail | Should -Match 'see the Hyper-V check above'
    }
}

# ── 9. SECURE BOOT CHECK ──────────────────────────────────────────────────────

Describe 'Secure Boot Check' -Tag 'SecureBootCheck' {

    It 'returns pass when Secure Boot is disabled' {
        Mock Confirm-SecureBootUEFI { return $false }
        $result = Get-CheckResult -Id 'secboot'
        $result.status | Should -Be 'pass'
    }

    It 'returns warn when Secure Boot is enabled' {
        Mock Confirm-SecureBootUEFI { return $true }
        $result = Get-CheckResult -Id 'secboot'
        $result.status | Should -Be 'warn'
    }

    It 'returns warn when Secure Boot status cannot be detected' {
        Mock Confirm-SecureBootUEFI { throw 'Cmdlet not supported' }
        $result = Get-CheckResult -Id 'secboot'
        $result.status | Should -Be 'warn'
    }
}

# ── 10. VIRTUALBOX INSTALLATION CHECK ─────────────────────────────────────────

Describe 'VirtualBox Installation Check' -Tag 'VBoxCheck' {

    It 'returns fail when VirtualBox is not installed' {
        Mock Get-ItemProperty { return $null }
        $result = Get-CheckResult -Id 'vboxinst'
        $result.status | Should -Be 'fail'
    }

    It 'returns pass when VirtualBox 7.x is installed' {
        Mock Get-ItemProperty {
            return [PSCustomObject]@{ DisplayName = 'Oracle VirtualBox'; DisplayVersion = '7.1.4' }
        }
        $result = Get-CheckResult -Id 'vboxinst'
        $result.status | Should -Be 'pass'
    }

    It 'returns warn when an older version of VirtualBox is installed' {
        Mock Get-ItemProperty {
            return [PSCustomObject]@{ DisplayName = 'Oracle VirtualBox'; DisplayVersion = '6.1.50' }
        }
        $result = Get-CheckResult -Id 'vboxinst'
        $result.status | Should -Be 'warn'
    }
}

# ── 11. JSON OUTPUT CHECK ─────────────────────────────────────────────────────

Describe 'JSON Output' -Tag 'JsonOutput' {

    It 'outputs a valid JSON array when -Json is passed' {
        $results = Invoke-SanityChecks
        $results | Should -Not -BeNullOrEmpty
        $results.Count | Should -BeGreaterThan 0
    }

    It 'every result has the required fields: id, label, status, detail' {
        $results = Invoke-SanityChecks
        foreach ($result in $results) {
            $result.id     | Should -Not -BeNullOrEmpty
            $result.label  | Should -Not -BeNullOrEmpty
            $result.status | Should -BeIn @('pass', 'warn', 'fail')
            $result.detail | Should -Not -BeNullOrEmpty
        }
    }
}
