# One-double-click dev loop: world server + demo place in Studio.
# Right-click > Run with PowerShell (or: powershell -ExecutionPolicy Bypass -File roblox\start-dev.ps1)
$repo = Split-Path $PSScriptRoot -Parent

# 1. World server on 4178 (skip if already listening).
#    AUTO_RESOLVE 25s so an unattended attack settles inside a demo recording;
#    production leaves it unset and gets the store default (2 minutes).
$listening = Get-NetTCPConnection -LocalPort 4178 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
    Start-Process powershell -ArgumentList "-NoExit", "-Command",
        "`$env:PORT='4178'; `$env:KINGSAGE_ROBLOX_KEY='dev-secret-local-0001'; `$env:KINGSAGE_AUTO_RESOLVE_MS='25000'; Set-Location '$repo'; npm run start:world"
    Start-Sleep -Seconds 3
    Write-Host "world server started on 4178"
} else {
    Write-Host "world server already running on 4178"
}

# 2. Fresh place build (demo variant = self-driving tour; swap for default.project.json for normal play)
Set-Location $repo
rojo build roblox/demo.project.json -o roblox\WorldGame-demo.rbxlx
if (-not $?) { Write-Host "rojo build failed"; exit 1 }

# 3. Open in the CURRENT Studio (file association goes stale when Studio auto-updates)
$studio = Get-ChildItem "$env:LOCALAPPDATA\Roblox\Versions" -Recurse -Filter RobloxStudioBeta.exe |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($studio) {
    Start-Process -FilePath $studio.FullName -ArgumentList "`"$repo\roblox\WorldGame-demo.rbxlx`""
    Write-Host "Studio launching - press F5 to play"
} else {
    Write-Host "Roblox Studio not found under $env:LOCALAPPDATA\Roblox\Versions"
}
