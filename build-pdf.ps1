# ==========================================================================
# build-pdf.ps1 - Export PDF de la presentation Amoul (Chrome/Edge headless)
# 1 slide = 1 page (16:9). Usage :  powershell -ExecutionPolicy Bypass -File .\build-pdf.ps1
# ==========================================================================
param(
  [string]$Out = "output\Amoul-Presentation.pdf"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$html = Join-Path $root "index.html"
$outFile = Join-Path $root $Out

if (-not (Test-Path -LiteralPath $html)) { throw "index.html introuvable : $html" }
$outDir = Split-Path -Parent $outFile
if (-not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Force -Path $outDir | Out-Null }

$candidates = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)
$browser = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $browser) { throw "Google Chrome ou Microsoft Edge est requis pour generer le PDF." }

$uri = ([System.Uri]$html).AbsoluteUri
$profile = Join-Path $env:TEMP ("amoul_pdf_" + [guid]::NewGuid().ToString("N"))

Write-Host "Navigateur : $browser"
Write-Host "Source     : $uri"
Write-Host "Sortie     : $outFile"

$arguments = @(
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--no-first-run",
  "--disable-extensions",
  "--print-to-pdf-no-header",
  "--no-pdf-header-footer",
  "--virtual-time-budget=12000",
  "--user-data-dir=`"$profile`"",
  "--print-to-pdf=`"$outFile`"",
  "`"$uri`""
)

& $browser @arguments | Out-Null
$code = $LASTEXITCODE
Start-Sleep -Milliseconds 500

if ((Test-Path -LiteralPath $outFile) -and ((Get-Item -LiteralPath $outFile).Length -gt 0)) {
  $size = [math]::Round((Get-Item -LiteralPath $outFile).Length / 1KB, 0)
  Write-Host ("OK - PDF genere (" + $size + " Ko).") -ForegroundColor Green
} else {
  throw "Echec de generation du PDF (code $code)."
}
