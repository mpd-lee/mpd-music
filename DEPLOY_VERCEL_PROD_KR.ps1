$ErrorActionPreference = 'Stop'
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw 'pnpm is not installed. Run: npm install -g pnpm@12.3.4'
}
if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
  throw 'Vercel CLI is not installed. Run: npm install -g vercel'
}
Write-Host '[1/4] Installing dependencies...'
pnpm install
Write-Host '[2/4] Running production build...'
pnpm build
Write-Host '[3/4] Linking existing Vercel project...'
vercel link
Write-Host '[4/4] Deploy this source to Production? Type Y to continue.'
$confirm = Read-Host 'Deploy to the existing mpd-music project? (Y/N)'
if ($confirm -notmatch '^(Y|y|YES|yes)$') {
  Write-Host 'Deployment cancelled. No Production deployment was started.'
  exit 0
}
vercel --prod
