# How to Install Claude Code on Windows

1. Download and install Git from https://git-scm.com/downloads/win (just keep clicking Next)
2. Open PowerShell and run:
   ```powershell
   irm https://claude.ai/install.ps1 | iex
   ```
   Then immediately run:
   ```powershell
   [Environment]::SetEnvironmentVariable("Path", [Environment]::GetEnvironmentVariable("Path", "User") + ";$env:USERPROFILE\.local\bin", "User")
   ```
3. Open a new PowerShell tab and run `claude` to proceed with initial setup and login
