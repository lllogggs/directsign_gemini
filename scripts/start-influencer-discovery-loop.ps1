param(
  [switch]$EnableAutomaticCollection
)

if (-not $EnableAutomaticCollection) {
  Write-Output "Influencer automatic collection is disabled. Product Owner approval and -EnableAutomaticCollection are required."
  exit 0
}

$repoRoot = Split-Path -Parent $PSScriptRoot

Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList @(
    "run",
    "discover:influencers:loop",
    "--",
    "--enable-automatic-collection=true",
    "--interval-minutes=2",
    "--platforms=youtube,naver_blog,instagram,tiktok",
    "--youtube-per-query=8",
    "--youtube-pages=1",
    "--youtube-check-minutes=180",
    "--youtube-min-interval-minutes=180",
    "--youtube-web-per-query=80",
    "--youtube-web-pages=2",
    "--naver-per-query=100",
    "--naver-pages=10",
    "--naver-sorts=sim,date",
    "--tiktok=true",
    "--tiktok-per-query=100",
    "--tiktok-pages=3",
    "--apply=false",
    "--storage=local-xlsx",
    "--upload-interval-hours=12",
    "--batch-upload-timeout-minutes=180"
  ) `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden
