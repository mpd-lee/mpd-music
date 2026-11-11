$ErrorActionPreference = 'Stop'
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw 'pnpm is not installed. Run: npm install -g pnpm@12.3.4'
}
Write-Host '[1/2] Installing project dependencies...'
pnpm install
Write-Host '[2/2] Starting the local MPD Music Studio...'
pnpm dev
