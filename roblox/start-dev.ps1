param(
    # -Fresh starts the world server against a BRAND NEW database file.
    #
    # Why this exists: seedWorld() returns early when a world already exists, so
    # KINGSAGE_DEV_SEED_NOBLES only takes effect at world CREATION. Without a
    # fresh database the conquest drills (D1-D7) fail silently - the NOBLEMEN
    # section reads 0, the demo tour sends a plain raid, and conquest never
    # fires. This switch leaves the existing dev world untouched on disk and
    # simply points the server somewhere new.
    [switch]$Fresh
)

# One-double-click dev loop: world server + demo place in Studio.
# Right-click > Run with PowerShell (or: powershell -ExecutionPolicy Bypass -File roblox\start-dev.ps1)
$repo = Split-Path $PSScriptRoot -Parent

# -Fresh: point the server at a NEW database file, so the world is CREATED and
# therefore seeded with Noblemen. Computed BEFORE the Start-Process call below —
# it must not be interleaved into that statement's -ArgumentList.
$dbLine = ''
if ($Fresh) {
    $stamp   = (Get-Date).ToString('yyyyMMdd-HHmmss')
    $freshDb = Join-Path $repo "server\data\kingsage-drill-$stamp.sqlite"
    Write-Host "-Fresh: new world at $freshDb (your existing dev world is untouched)"
    $dbLine  = "`$env:KINGSAGE_DATABASE_PATH='$freshDb';"
}

# 1. World server on 4178 (skip if already listening).
#    AUTO_RESOLVE 25s so an unattended attack settles inside a demo recording;
#    production leaves it unset and gets the store default (2 minutes).
$listening = Get-NetTCPConnection -LocalPort 4178 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
    $bootCmd = "`$env:PORT='4178'; `$env:KINGSAGE_ROBLOX_KEY='dev-secret-local-0001'; `$env:KINGSAGE_AUTO_RESOLVE_MS='25000'; `$env:KINGSAGE_DEV_SEED_NOBLES='5'; $dbLine Set-Location '$repo'; npm run start:world"
    Start-Process powershell -ArgumentList "-NoExit", "-Command", $bootCmd
    # Do not claim success until the port actually answers - the old script said
    # "world server started" unconditionally, which hid a launch failure.
    $ok = $false
    for ($i = 0; $i -lt 20 -and -not $ok; $i++) {
        Start-Sleep -Seconds 1
        if (Get-NetTCPConnection -LocalPort 4178 -State Listen -ErrorAction SilentlyContinue) { $ok = $true }
    }
    if ($ok) { Write-Host "world server listening on 4178" }
    else     { Write-Host "WORLD SERVER FAILED TO START - check the spawned window"; exit 1 }
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
