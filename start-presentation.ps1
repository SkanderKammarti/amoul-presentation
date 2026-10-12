$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$py = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $py) { $py = (Get-Command py -ErrorAction SilentlyContinue).Source }
if (-not $py) {
  Write-Host "Python introuvable. Installez Python 3 ou lancez la presentation depuis un autre serveur web." -ForegroundColor Red
  Read-Host "Appuyez sur Entree pour fermer"
  exit 1
}

$port = 8765
$url  = "http://127.0.0.1:$port/index.html"

Write-Host ""
Write-Host "  Maison Africaine du Medecin - Presentation Amoul" -ForegroundColor Cyan
Write-Host "  Serveur local : $url" -ForegroundColor Cyan
Write-Host "  Les videos se liront en francais dans les slides." -ForegroundColor Gray
Write-Host "  Fermez cette fenetre pour arreter le serveur." -ForegroundColor Gray
Write-Host ""

Start-Process -FilePath $py -ArgumentList "-m http.server $port --bind 127.0.0.1 --directory `"$root`"" -WorkingDirectory $root
Start-Sleep -Seconds 2
Start-Process $url
