<#
  Stripe CLI en local: levanta el listener de webhooks contra el dev server y
  deja STRIPE_WEBHOOK_SECRET escrito en .env.

    powershell -File stripe-dev.ps1

  Requisitos:
    - Stripe CLI instalada y con sesion iniciada (`stripe login`).
      Si no lo esta: winget install Stripe.StripeCli
    - STRIPE_SECRET_KEY (test) ya puesta en .env: el CLI la lee de ahi.

  Que hace y que NO hace:
    - No toca ningun otro valor de .env (solo reescribe la linea
      STRIPE_WEBHOOK_SECRET) y deja una copia .env.bak.
    - NO reinicia el dev server: las env se leen al arrancar, asi que hay que
      reiniciarlo a mano (Ctrl+C y `npm run dev`).
#>
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $projectRoot ".env"
$logPath = Join-Path $projectRoot "stripe-listen.log"
# Los dos .log cuelgan de la raiz para que los cubra /*.log del .gitignore.
$errLogPath = Join-Path $projectRoot "stripe-listen.err.log"

function Get-CommandPath {
  param([string]$Name)
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  # winget instala la CLI en un PATH que solo existe en shells nuevas: si no
  # resuelve, se busca en el paquete de WinGet antes de rendirse.
  $fallback = Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" `
    -Recurse -Filter "$Name.exe" -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
  return $fallback
}

# El log lo tiene abierto el proceso `stripe listen` con redireccion de
# Start-Process, asi que ReadAllText revienta por bloqueo. Se lee compartiendo.
function Read-Shared {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return "" }
  try {
    $stream = [System.IO.File]::Open($Path, "Open", "Read", "ReadWrite")
    try {
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
      return $reader.ReadToEnd()
    } finally { $stream.Dispose() }
  } catch { return "" }
}

$stripe = Get-CommandPath "stripe"
if (-not $stripe) {
  Write-Host "Stripe CLI no esta instalada." -ForegroundColor Red
  Write-Host "  winget install Stripe.StripeCli   (o scoop install stripe)"
  Write-Host "  despues: stripe login"
  exit 1
}

if (-not (Test-Path -LiteralPath $envPath)) {
  Write-Host "No encuentro .env en $projectRoot" -ForegroundColor Red
  exit 1
}

$secret = [regex]::Match(
  [System.IO.File]::ReadAllText($envPath),
  "(?m)^STRIPE_SECRET_KEY=(.+)$"
).Groups[1].Value.Trim()

# La cuenta de la clave es la que de verdad cobra: es la que genera los eventos.
# `stripe listen` sin --api-key usa la cuenta de `stripe login`, que puede ser
# OTRA (sandbox distinto) y entonces se traga los eventos sin reenviarlos.
$apiKeyArg = @()
if ($secret -match "^sk_(test|live)_") {
  $apiKeyArg = @("--api-key", $secret)
} else {
  Write-Host "Aviso: STRIPE_SECRET_KEY vacio o con formato raro; el listener usara la cuenta de 'stripe login'." -ForegroundColor Yellow
}

# La CLI 1.52+ exige declarar los eventos: sin esto aborta con
# "must specify events to forward". Deben ser EXACTAMENTE las claves del mapa
# `handlers` de src/app/api/stripe/webhook/route.ts: un evento que aqui no este
# no llega a la app, y el pago se queda sin registrar sin ningun error visible
# (asi se perdio `invoice.paid`, que es el unico que escribe en `Payment`).
# Si anades un handler al route.ts, anadelo aqui tambien.
$events = @(
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.paid"
) -join ","

Write-Host "Arrancando: stripe listen --forward-to localhost:3000/api/stripe/webhook" -ForegroundColor Cyan
Write-Host "Eventos: $events"
Write-Host "Log: $logPath   (Ctrl+C para pararlo)"

$process = Start-Process -FilePath $stripe `
  -ArgumentList (@("listen", "--forward-to", "localhost:3000/api/stripe/webhook", "--events", $events) + $apiKeyArg) `
  -RedirectStandardOutput $logPath `
  -RedirectStandardError $errLogPath `
  -NoNewWindow -PassThru

# El secreto aparece en las primeras lineas; se extrae y se escribe. Ojo: la
# CLI 1.52 lo imprime por stderr, no por stdout, hay que mirar los dos logs.
$deadline = (Get-Date).AddSeconds(45)
$whsec = $null
while ((Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 800
  $combined = (Read-Shared $logPath) + (Read-Shared $errLogPath)
  $match = [regex]::Match($combined, "whsec_[A-Za-z0-9]+")
  if ($match.Success) { $whsec = $match.Value; break }
  if ($process.HasExited) {
    Write-Host "El listener de Stripe se ha parado. Mira $errLogPath" -ForegroundColor Red
    Get-Content -LiteralPath $errLogPath -Tail 20 -ErrorAction SilentlyContinue | Write-Host
    exit 1
  }
}

if (-not $whsec) {
  Write-Host "No se encontro el whsec_ en el log. Revisa $logPath" -ForegroundColor Red
  exit 1
}

Copy-Item -LiteralPath $envPath -Destination "$envPath.bak" -Force
$lines = [System.IO.File]::ReadAllLines($envPath)
$found = $false
for ($i = 0; $i -lt $lines.Length; $i++) {
  if ($lines[$i] -match "^STRIPE_WEBHOOK_SECRET=") {
    $lines[$i] = "STRIPE_WEBHOOK_SECRET=$whsec"
    $found = $true
  }
}
if (-not $found) { $lines += "STRIPE_WEBHOOK_SECRET=$whsec" }
[System.IO.File]::WriteAllLines($envPath, $lines, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "STRIPE_WEBHOOK_SECRET escrito en .env (copia previa en .env.bak)" -ForegroundColor Green
Write-Host "Reinicia el dev server para que recoja la variable." -ForegroundColor Yellow
Write-Host "Para parar el listener: Ctrl+C (o Stop-Process -Id $($process.Id))"
