# WSL2 → LAN port forwarding helper.
#
# Run from Windows PowerShell **as Administrator** when you want to test the
# Adaptive Learning Platform from a phone or other LAN device.
#
# What it does:
#   1. Resolves your WSL distro's current IP.
#   2. Adds netsh portproxy entries so the Windows host listens on each port
#      and forwards to the WSL service.
#   3. Opens the matching inbound Windows Firewall rules.
#
# Usage from PowerShell (admin):
#   .\wsl-lan-forward.ps1                # add forwards
#   .\wsl-lan-forward.ps1 -Remove        # remove all forwards we added
#
# After running this once, the services are reachable on your phone at
# http://<windows-host-LAN-ip>:35173 etc.
#
# Find your Windows host's LAN IP:
#   ipconfig | findstr IPv4
#
# Note: WSL's IP can change across reboots. Re-run this script after a reboot
# (or use mirrored networking — see docs/local-testing.md).

param(
    [switch]$Remove
)

$Ports = @(
    @{ Port = 35173; Name = "ALP web-student + mobile API gateway" },
    @{ Port = 35174; Name = "ALP web-portal (educator)" },
    @{ Port = 35175; Name = "ALP web-admin" },
    @{ Port = 38001; Name = "ALP auth (direct)" },
    @{ Port = 38010; Name = "ALP adaptive-engine (direct)" },
    @{ Port = 38011; Name = "ALP quiz (direct)" }
)

if ($Remove) {
    Write-Host "Removing portproxy entries + firewall rules..." -ForegroundColor Yellow
    foreach ($p in $Ports) {
        netsh interface portproxy delete v4tov4 listenport=$($p.Port) listenaddress=0.0.0.0 | Out-Null
        Remove-NetFirewallRule -DisplayName "ALP-LAN-$($p.Port)" -ErrorAction SilentlyContinue | Out-Null
    }
    Write-Host "Done." -ForegroundColor Green
    exit 0
}

$WslIp = (wsl hostname -I).Trim().Split()[0]
if (-not $WslIp) {
    Write-Error "Could not detect WSL IP. Is WSL running?"
    exit 1
}
Write-Host "WSL IP: $WslIp" -ForegroundColor Cyan

foreach ($p in $Ports) {
    Write-Host "Forwarding port $($p.Port) ($($p.Name))..." -ForegroundColor Cyan
    # Replace existing entry idempotently.
    netsh interface portproxy delete v4tov4 listenport=$($p.Port) listenaddress=0.0.0.0 2>$null | Out-Null
    netsh interface portproxy add v4tov4 listenport=$($p.Port) listenaddress=0.0.0.0 connectport=$($p.Port) connectaddress=$WslIp | Out-Null

    # Idempotent firewall rule.
    Remove-NetFirewallRule -DisplayName "ALP-LAN-$($p.Port)" -ErrorAction SilentlyContinue | Out-Null
    New-NetFirewallRule `
        -DisplayName "ALP-LAN-$($p.Port)" `
        -Direction Inbound `
        -LocalPort $p.Port `
        -Protocol TCP `
        -Action Allow `
        -Profile Private,Domain | Out-Null
}

Write-Host "" -ForegroundColor Green
Write-Host "All ports forwarded. From a LAN device:" -ForegroundColor Green
$WindowsIp = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi","Ethernet" -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -First 1 -ExpandProperty IPAddress)
if ($WindowsIp) {
    Write-Host "  Web (student):  http://$WindowsIp`:35173" -ForegroundColor White
    Write-Host "  Web (educator): http://$WindowsIp`:35174" -ForegroundColor White
    Write-Host "  Web (admin):    http://$WindowsIp`:35175" -ForegroundColor White
    Write-Host "  Mobile API:     http://$WindowsIp`:35173/api/v1" -ForegroundColor White
} else {
    Write-Host "Couldn't auto-detect Windows IP — run 'ipconfig | findstr IPv4'." -ForegroundColor Yellow
}

Write-Host "" -ForegroundColor Green
Write-Host "List active forwards: netsh interface portproxy show v4tov4" -ForegroundColor DarkGray
Write-Host "Remove all forwards:  .\wsl-lan-forward.ps1 -Remove" -ForegroundColor DarkGray
