# ============================================================
#  common.Tests.ps1
#  Pester v5 unit tests for common.ps1
#
#  Run from the project root:
#    Invoke-Pester -Path ".\host\common.Tests.ps1" -Output Detailed
# ============================================================

BeforeAll {
    . "$PSScriptRoot\common.ps1"

    # Derive the credential file path the same way common.ps1 does.
    # This lets BeforeEach/AfterEach manage the real file for isolation.
    $script:credPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".credentials\credentials.json"
    $script:credDir  = Split-Path $script:credPath -Parent
}

# ── Get-VBoxErrMsg ────────────────────────────────────────────────────────────

Describe 'Get-VBoxErrMsg' {

    It 'maps "current status is: poweroff" to the powered-off message' {
        $result = Get-VBoxErrMsg -Output @('VirtualBox error: current status is: poweroff')
        $result | Should -BeLike '*powered off*'
    }

    It 'maps "current status is: paused" to the paused message' {
        $result = Get-VBoxErrMsg -Output @('current status is: paused')
        $result | Should -BeLike '*paused*'
    }

    It 'maps "current status is: saved" to the saved-state message' {
        $result = Get-VBoxErrMsg -Output @('current status is: saved')
        $result | Should -BeLike '*saved state*'
    }

    It 'maps "current status is: starting" to the Guest Additions not ready message' {
        $result = Get-VBoxErrMsg -Output @('current status is: starting')
        $result | Should -BeLike '*Guest Additions are not yet ready*'
    }

    It 'maps "current status is: aborted" to the force-stopped message' {
        $result = Get-VBoxErrMsg -Output @('current status is: aborted')
        $result | Should -BeLike '*force-stopped*'
    }

    It 'maps an unknown state to the generic "not ready (state: ...)" message' {
        $result = Get-VBoxErrMsg -Output @('current status is: restoring')
        $result | Should -BeLike '*not ready*'
        $result | Should -BeLike '*restoring*'
    }

    It 'maps "not currently running" to the VM-not-running message' {
        $result = Get-VBoxErrMsg -Output @('VirtualBox error: not currently running')
        $result | Should -BeLike '*not running*'
        $result | Should -BeLike '*start it*'
    }

    It 'maps "is not running" to the VM-not-running message' {
        $result = Get-VBoxErrMsg -Output @('The machine is not running')
        $result | Should -BeLike '*not running*'
    }

    It 'maps "execution service is not ready" to the Guest Additions not ready message' {
        $result = Get-VBoxErrMsg -Output @('execution service is not ready')
        $result | Should -BeLike '*Guest Additions may not be installed or not yet started*'
    }

    It 'maps "not installed or not ready" to the Guest Additions not ready message' {
        $result = Get-VBoxErrMsg -Output @('Guest Additions not installed or not ready')
        $result | Should -BeLike '*Guest Additions may not be installed or not yet started*'
    }

    It 'maps empty output to the VM-not-responding message' {
        $result = Get-VBoxErrMsg -Output @('')
        $result | Should -BeLike '*not responding*'
    }

    It 'maps whitespace-only output to the VM-not-responding message' {
        $result = Get-VBoxErrMsg -Output @('   ')
        $result | Should -BeLike '*not responding*'
    }

    It 'maps VERR_DUPLICATE to the duplicate-session message' {
        $result = Get-VBoxErrMsg -Output @('VERR_DUPLICATE: session conflict')
        $result | Should -BeLike '*previous guest session*'
    }

    It 'maps VERR_AUTHENTICATION_FAILURE to the wrong credentials message' {
        $result = Get-VBoxErrMsg -Output @('VERR_AUTHENTICATION_FAILURE')
        $result | Should -Be 'Wrong username or password'
    }

    It 'maps "authentication failure" (lowercase) to the wrong credentials message' {
        $result = Get-VBoxErrMsg -Output @('authentication failure')
        $result | Should -Be 'Wrong username or password'
    }

    It 'returns the raw text when no known pattern matches' {
        $result = Get-VBoxErrMsg -Output @('Some unknown error occurred')
        $result | Should -BeLike '*Some unknown error occurred*'
    }

    It 'concatenates multiple output lines before pattern matching' {
        $result = Get-VBoxErrMsg -Output @('line one', 'VERR_AUTHENTICATION_FAILURE')
        $result | Should -Be 'Wrong username or password'
    }

    It 'accepts ErrorRecord objects alongside plain strings' {
        $errorRecord = [System.Management.Automation.ErrorRecord]::new(
            [Exception]::new('VERR_AUTHENTICATION_FAILURE'),
            'TestError',
            [System.Management.Automation.ErrorCategory]::NotSpecified,
            $null
        )
        $result = Get-VBoxErrMsg -Output @($errorRecord)
        $result | Should -Be 'Wrong username or password'
    }
}

# ── Find-VBoxManage ───────────────────────────────────────────────────────────

Describe 'Find-VBoxManage' {

    It 'returns the 64-bit path when VBoxManage.exe exists there' {
        Mock Test-Path {
            $Path -eq 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe'
        }
        $result = Find-VBoxManage
        $result | Should -Be 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe'
    }

    It 'falls back to the 32-bit path when only that location exists' {
        Mock Test-Path {
            $Path -eq 'C:\Program Files (x86)\Oracle\VirtualBox\VBoxManage.exe'
        }
        $result = Find-VBoxManage
        $result | Should -Be 'C:\Program Files (x86)\Oracle\VirtualBox\VBoxManage.exe'
    }

    It 'uses Get-Command when neither standard path exists but VBoxManage is on PATH' {
        Mock Test-Path { return $false }
        Mock Get-Command {
            [PSCustomObject]@{ Source = 'D:\CustomVBox\VBoxManage.exe' }
        } -ParameterFilter { $Name -eq 'VBoxManage.exe' }
        $result = Find-VBoxManage
        $result | Should -Be 'D:\CustomVBox\VBoxManage.exe'
    }

    It 'returns null when VBoxManage.exe cannot be found anywhere' {
        Mock Test-Path { return $false }
        Mock Get-Command { return $null } -ParameterFilter { $Name -eq 'VBoxManage.exe' }
        $result = Find-VBoxManage
        $result | Should -BeNullOrEmpty
    }
}

# ── Credential store (Get / Save / Remove) ────────────────────────────────────

Describe 'credential store' {

    BeforeEach {
        # Snapshot and clear any real credentials file for test isolation.
        if (Test-Path $script:credPath) {
            $script:credBackup = Get-Content $script:credPath -Raw -Encoding UTF8
            Remove-Item $script:credPath -Force
        } else {
            $script:credBackup = $null
        }
    }

    AfterEach {
        # Restore the original credentials file (or delete if none existed).
        if ($null -ne $script:credBackup) {
            if (-not (Test-Path $script:credDir)) {
                New-Item -ItemType Directory -Path $script:credDir | Out-Null
            }
            Set-Content $script:credPath $script:credBackup -Encoding UTF8
        } else {
            if (Test-Path $script:credPath) { Remove-Item $script:credPath -Force }
        }
    }

    # ── Get-VmCredentials ────────────────────────────────────────────────────

    Context 'Get-VmCredentials' {

        It 'returns null when the credentials file does not exist' {
            $result = Get-VmCredentials -VmName 'TestVM'
            $result | Should -BeNullOrEmpty
        }

        It 'returns null when the VM has no entry in the store' {
            Save-VmCredentials -VmName 'OtherVM' -User 'root' -Pass 'secret'
            $result = Get-VmCredentials -VmName 'TestVM'
            $result | Should -BeNullOrEmpty
        }

        It 'returns the correct User, Pass, and LoginUser for a known VM' {
            Save-VmCredentials -VmName 'TestVM' -User 'root' -Pass 'mypass' -LoginUser 'fedora'
            $result = Get-VmCredentials -VmName 'TestVM'
            $result.User      | Should -Be 'root'
            $result.Pass      | Should -Be 'mypass'
            $result.LoginUser | Should -Be 'fedora'
        }
    }

    # ── Save-VmCredentials ───────────────────────────────────────────────────

    Context 'Save-VmCredentials' {

        It 'writes a new entry that can be read back' {
            Save-VmCredentials -VmName 'NewVM' -User 'admin' -Pass 'pass1'
            $result = Get-VmCredentials -VmName 'NewVM'
            $result       | Should -Not -BeNullOrEmpty
            $result.User  | Should -Be 'admin'
            $result.Pass  | Should -Be 'pass1'
        }

        It 'merges with existing entries without overwriting unrelated VMs' {
            Save-VmCredentials -VmName 'VM1' -User 'root' -Pass 'pass1'
            Save-VmCredentials -VmName 'VM2' -User 'root' -Pass 'pass2'
            (Get-VmCredentials -VmName 'VM1').Pass | Should -Be 'pass1'
            (Get-VmCredentials -VmName 'VM2').Pass | Should -Be 'pass2'
        }

        It 'overwrites the existing entry when called again for the same VM' {
            Save-VmCredentials -VmName 'TestVM' -User 'root' -Pass 'old'
            Save-VmCredentials -VmName 'TestVM' -User 'root' -Pass 'new'
            (Get-VmCredentials -VmName 'TestVM').Pass | Should -Be 'new'
        }

        It 'creates the .credentials directory when it does not exist' {
            if (Test-Path $script:credDir) { Remove-Item $script:credDir -Recurse -Force }
            Save-VmCredentials -VmName 'TestVM' -User 'root' -Pass 'pass'
            Test-Path $script:credPath | Should -Be $true
        }

        It 'defaults LoginUser to an empty string when not provided' {
            Save-VmCredentials -VmName 'TestVM' -User 'root' -Pass 'pass'
            (Get-VmCredentials -VmName 'TestVM').LoginUser | Should -Be ''
        }

        It 'stores a non-empty LoginUser when one is provided' {
            Save-VmCredentials -VmName 'TestVM' -User 'root' -Pass 'pass' -LoginUser 'alice'
            (Get-VmCredentials -VmName 'TestVM').LoginUser | Should -Be 'alice'
        }
    }

    # ── Remove-VmCredentials ─────────────────────────────────────────────────

    Context 'Remove-VmCredentials' {

        It 'removes the entry for the specified VM' {
            Save-VmCredentials -VmName 'TestVM' -User 'root' -Pass 'pass'
            Remove-VmCredentials -VmName 'TestVM'
            Get-VmCredentials -VmName 'TestVM' | Should -BeNullOrEmpty
        }

        It 'leaves other VMs in the store intact' {
            Save-VmCredentials -VmName 'VM1' -User 'root' -Pass 'pass1'
            Save-VmCredentials -VmName 'VM2' -User 'root' -Pass 'pass2'
            Remove-VmCredentials -VmName 'VM1'
            (Get-VmCredentials -VmName 'VM2').Pass | Should -Be 'pass2'
        }

        It 'is a no-op and does not throw when the credentials file does not exist' {
            { Remove-VmCredentials -VmName 'NonExistent' } | Should -Not -Throw
        }
    }
}
