param(
    # -Fresh starts the world server against a BRAND NEW database file.
    #
    # Why this exists: seedWorld() returns early when a world already exists, so
    # KINGSAGE_DEV_SEED_NOBLES only takes effect at world CREATION. Without a
    # fresh database the conquest drills (D1-D7) fail silently - the NOBLEMEN
    # section reads 0, the demo tour sends a plain raid, and conquest never
    # fires. This switch leaves the existing dev world untouched on disk and
    # simply points the server somewhere new.
    [switch]$Fresh,

    # -Play opens the NORMAL place instead of the self-driving demo.
    #
    # The demo place runs DemoTour, which calls Humanoid:MoveTo on your
    # character in a loop so a recording can walk itself. That means it fights
    # you for the controls - you cannot look around or walk, because the script
    # keeps steering you back. Fine for a hands-free capture, useless for
    # actually playing. Use -Play to drive it yourself.
    [switch]$Play
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

# -Fresh means "give me a NEW world". If a server is already holding 4178 it is
# serving the OLD one, and every later step - the place build, Studio, the whole
# drill - runs against stale data while this script cheerfully reports success.
#
# That is exactly what happened on 2026-08-22: a place rebuilt at 22:52 with the
# day's work talked to a server started at 16:43, so the game showed a world
# with no Freeholds and none of the new rules, and nothing on screen explained
# why. Same defect family as the script once claiming "world server started"
# when it had not - a script that reports success for something it did not do.
if ($Fresh -and $listening) {
    Write-Host "-Fresh: a world server is already holding 4178, and it is serving the OLD world."
    $owners = $listening | Select-Object -ExpandProperty OwningProcess -Unique
    $stopped = $false
    foreach ($owningPid in $owners) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$owningPid" -ErrorAction SilentlyContinue
        if ($null -eq $proc) { continue }
        # Only ever stop OUR world server. Anything else on this port is not
        # ours to kill, and guessing would be worse than failing.
        if ($proc.Name -eq 'node.exe' -and $proc.CommandLine -like '*index.ts*') {
            Write-Host ("  stopping the stale world server (pid {0}, started {1})" -f $proc.ProcessId, $proc.CreationDate)
            Stop-Process -Id $proc.ProcessId -Force
            $stopped = $true
        } else {
            Write-Host ("  REFUSING to stop pid {0} ({1}) - that is not this project's world server." -f $proc.ProcessId, $proc.Name)
            Write-Host "  Free port 4178 yourself, then re-run with -Fresh."
            exit 1
        }
    }
    if ($stopped) {
        # Wait for the port to actually clear. Assuming it did is how this class
        # of bug survives.
        for ($i = 0; $i -lt 15; $i++) {
            Start-Sleep -Milliseconds 400
            if (-not (Get-NetTCPConnection -LocalPort 4178 -State Listen -ErrorAction SilentlyContinue)) { break }
        }
    }
    $listening = Get-NetTCPConnection -LocalPort 4178 -State Listen -ErrorAction SilentlyContinue
    if ($listening) { Write-Host "port 4178 did not clear - not starting a fresh world on top of a stale one"; exit 1 }
}

if (-not $listening) {
    $bootCmd = "`$env:PORT='4178'; `$env:KINGSAGE_ROBLOX_KEY='dev-secret-local-0001'; `$env:KINGSAGE_AUTO_RESOLVE_MS='25000'; `$env:KINGSAGE_DEV_SEED_NOBLES='5'; `$env:KINGSAGE_DEV_SEED_ARMY='axe:120,scout:3'; $dbLine Set-Location '$repo'; npm run start:world"
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
    # Reached only WITHOUT -Fresh. Say plainly that this is the old world, so a
    # confusing session gets one line of explanation before it starts.
    Write-Host "world server already running on 4178 - reusing the EXISTING world."
    Write-Host "  If you expected new content (Freeholds, the 11-unit roster, Realm of Power),"
    Write-Host "  re-run with -Fresh: a running server is old code with an old world."
}

# 2. Fresh place build.
Set-Location $repo
if ($Play) {
    $project   = 'roblox/default.project.json'
    $placeFile = 'roblox\WorldGame-dev.rbxlx'
    Write-Host "-Play: building the NORMAL place (no self-driving tour - the controls are yours)"
} else {
    $project   = 'roblox/demo.project.json'
    $placeFile = 'roblox\WorldGame-demo.rbxlx'
    Write-Host "building the DEMO place (self-driving tour; it will steer your character - use -Play to drive it yourself)"
}
rojo build $project -o $placeFile
if (-not $?) { Write-Host "rojo build failed"; exit 1 }

# 3. Open in the CURRENT Studio (file association goes stale when Studio auto-updates)
$studio = Get-ChildItem "$env:LOCALAPPDATA\Roblox\Versions" -Recurse -Filter RobloxStudioBeta.exe |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($studio) {
    Start-Process -FilePath $studio.FullName -ArgumentList "`"$repo\$placeFile`""
    Write-Host "Studio launching - press F5 to play"
} else {
    Write-Host "Roblox Studio not found under $env:LOCALAPPDATA\Roblox\Versions"
}
