# strip-bom-secrets.ps1
# Reads every secret, strips leading BOM (\ufeff) if present, writes a new version
# Safe to run multiple times (idempotent)

$project = "alti-assistant-prod"
$gcloud  = "C:\Users\hyper\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

$secrets = @(
  "DATABASE_LOCAL","JWT_ACCESS_TOKEN","JWT_REFRESH_REFRESH_TOKEN","GEMINI_API_KEY",
  "ANTHROPIC_API_KEY","DEEPSEEK_API_KEY",
  "TAVILY_API_KEY","SERPER_API_KEY","GOOGLE_SEARCH_API_KEY",
  "GOOGLE_CSE_ID","YOUTUBE_API_KEY","MASSIVE_API_KEY","STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY","STRIPE_WEBHOOK_SECRET","STRIPE_WEBHOOK_SECRET_THIN",
  "GOOGLE_SMTP_PASSWORD","GOOGLE_SMTP_USER","MAILGUN_DOMAIN","MAILGUN_KEY",
  "MAILGUN_FROM","REDIS_URL","CLOUD_STORAGE_SECRET_KEY","CLOUD_STORAGE_ACCESS_KEY",
  "CLOUD_STORAGE_BUCKET","LIVEKIT_API_KEY","LIVEKIT_API_SECRET","WEB_SOCKET_URL",
  "GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","FACEBOOK_APP_ID","FACEBOOK_APP_SECRET",
  "DISCORD_CLIENT_ID","DISCORD_CLIENT_SECRET","GITHUB_CLIENT_ID","GITHUB_CLIENT_SECRET",
  "TWITTER_CLIENT_ID","TWITTER_CLIENT_SECRET","SLACK_CLIENT_ID","SLACK_CLIENT_SECRET",
  "COMPOSIO_ORG_API_KEY","COMPOSIO_API_KEY","COMPOSIO_CLIENT_SECRET",
  "COMPOSIO_GMAIL_AUTH_CONFIG_ID","BROWSER_USE_SECRET_KEY","CYBERDESK_API_KEY",
  "GCP_PROJECT_ID","VERTEX_AI_PROJECT_ID"
)

$bom = [char]0xFEFF
$fixed = 0
$skipped = 0
$errors = 0

foreach ($secret in $secrets) {
  try {
    # Read raw bytes, decode as UTF-8
    $raw = & $gcloud secrets versions access latest --secret="$secret" --project="$project" 2>$null
    if ($LASTEXITCODE -ne 0 -or $null -eq $raw) {
      Write-Host "  SKIP $secret (not accessible)" -ForegroundColor Yellow
      $skipped++
      continue
    }

    # raw may be array of lines; join them
    $value = if ($raw -is [array]) { $raw -join "`n" } else { $raw }

    # Strip leading BOM character if present
    if ($value.StartsWith($bom)) {
      $cleaned = $value.TrimStart($bom)
      # Write cleaned value back as new version
      $cleaned | & $gcloud secrets versions add "$secret" --data-file=- --project="$project" 2>&1 | Out-Null
      Write-Host "  FIXED $secret (BOM stripped)" -ForegroundColor Green
      $fixed++
    } else {
      Write-Host "  OK    $secret" -ForegroundColor DarkGray
      $skipped++
    }
  } catch {
    Write-Host "  ERROR $secret : $_" -ForegroundColor Red
    $errors++
  }
}

Write-Host ""
Write-Host "Done. Fixed: $fixed  |  Clean: $skipped  |  Errors: $errors" -ForegroundColor Cyan
