$repoRoot = Split-Path -Parent $PSScriptRoot

Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList @(
    "run",
    "discover:influencers:loop",
    "--",
    "--interval-minutes=3",
    "--platforms=youtube,naver_blog,instagram,tiktok",
    "--youtube-per-query=8",
    "--youtube-pages=1",
    "--youtube-check-minutes=180",
    "--youtube-min-interval-minutes=180",
    "--youtube-web-per-query=80",
    "--youtube-web-pages=2",
    "--naver-per-query=100",
    "--naver-pages=5",
    "--tiktok=true",
    "--tiktok-per-query=100",
    "--tiktok-pages=3",
    "--apply=true"
  ) `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden
