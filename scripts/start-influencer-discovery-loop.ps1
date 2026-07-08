$repoRoot = Split-Path -Parent $PSScriptRoot

Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList @(
    "run",
    "discover:influencers:loop",
    "--",
    "--interval-minutes=30",
    "--youtube-per-query=8",
    "--youtube-pages=1",
    "--naver-per-query=80",
    "--naver-pages=4",
    "--apply=true"
  ) `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden
