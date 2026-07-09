$repoRoot = Split-Path -Parent $PSScriptRoot

Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList @(
    "run",
    "discover:influencers:loop",
    "--",
    "--interval-minutes=5",
    "--platforms=youtube,naver_blog,instagram,tiktok",
    "--youtube-per-query=8",
    "--youtube-pages=1",
    "--youtube-check-minutes=180",
    "--naver-per-query=80",
    "--naver-pages=4",
    "--tiktok=true",
    "--tiktok-per-query=30",
    "--tiktok-pages=1",
    "--apply=true"
  ) `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden
