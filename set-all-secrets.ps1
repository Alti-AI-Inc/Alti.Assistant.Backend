#!/usr/bin/env pwsh
# =============================================================================
# Alti Assistant - GCP Secret Manager Setup
# =============================================================================
# Run once to provision all secrets. CI/CD then reads them automatically.
# Usage: .\set-all-secrets.ps1
# =============================================================================

$PROJECT_ID  = "alti-assistant-prod"
$GITHUB_REPO = "Alti-AI-Inc/Alti.Assistant.Backend"
$GCLOUD_CMD  = "C:\Users\hyper\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"

Write-Host ""
Write-Host "========================================================"  -ForegroundColor Cyan
Write-Host "  Alti Assistant - GCP Secret Manager Setup"               -ForegroundColor Cyan
Write-Host "  Project : $PROJECT_ID"                                    -ForegroundColor Cyan
Write-Host "========================================================"  -ForegroundColor Cyan
Write-Host ""

# Verify gcloud auth
Write-Host "Checking gcloud authentication..." -ForegroundColor Yellow
& $GCLOUD_CMD config set project $PROJECT_ID --quiet
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Not authenticated. Run: gcloud auth login" -ForegroundColor Red
    exit 1
}
Write-Host "OK - authenticated to $PROJECT_ID" -ForegroundColor Green

# Enable API
Write-Host ""
Write-Host "Enabling Secret Manager API..." -ForegroundColor Yellow
& $GCLOUD_CMD services enable secretmanager.googleapis.com --project=$PROJECT_ID --quiet
Write-Host "OK" -ForegroundColor Green

# Helper: create or update a secret via temp file (handles all special chars)
function Set-GcpSecret {
    param([string]$Name, [string]$Value)
    if ([string]::IsNullOrWhiteSpace($Value) -or $Value -like "your_*") {
        Write-Host "  SKIP  $Name" -ForegroundColor DarkGray
        return
    }
    $tmp = [System.IO.Path]::GetTempFileName()
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tmp, $Value, $utf8NoBom)
    & $GCLOUD_CMD secrets describe $Name --project=$PROJECT_ID 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        & $GCLOUD_CMD secrets versions add $Name --data-file=$tmp --project=$PROJECT_ID --quiet 2>$null
        Write-Host "  UPDATE $Name" -ForegroundColor Blue
    } else {
        & $GCLOUD_CMD secrets create $Name --data-file=$tmp --replication-policy=automatic --project=$PROJECT_ID --quiet 2>$null
        Write-Host "  CREATE $Name" -ForegroundColor Green
    }
    Remove-Item $tmp -Force
}

# =============================================================================
Write-Host ""; Write-Host "-- Database --" -ForegroundColor Cyan
Set-GcpSecret "DATABASE_LOCAL"            "mongodb+srv://alti-db-username:2kep7suGSMneEHq8@cluster0.piwgo1l.mongodb.net/Alti?retryWrites=true&w=majority&appName=Cluster0"
Set-GcpSecret "DB_USERNAME"               "alti-db-username"
Set-GcpSecret "DB_PASSWORD"               "2kep7suGSMneEHq8"

Write-Host ""; Write-Host "-- Auth / JWT --" -ForegroundColor Cyan
Set-GcpSecret "JWT_ACCESS_TOKEN"          "aOaOKEp4WnUFd3q6skelpsOWnU8Nsmek8w0MZbpAg80noh2sKO"
Set-GcpSecret "JWT_ACCESS_EXPIRES_IN"     "7d"
Set-GcpSecret "JWT_REFRESH_REFRESH_TOKEN" "OGS0BFhbNeFd3q6sk2lpsOWGS0Nsmek8w0MZbpOGS0BFhbNes"
Set-GcpSecret "JWT_REFRESH_EXPIRES_IN"    "365d"

Write-Host ""; Write-Host "-- Stripe --" -ForegroundColor Cyan
Set-GcpSecret "STRIPE_SECRET_KEY"          "sk_test_51SNcNFEAbApxFSZSR43ffC11wjhlhNPXSxKTxePst1ISDCpT6W2Ss20Zgc6GjjfZKbCx2ItERvwohOnDi7IbgOWB00xbHAJICr"
Set-GcpSecret "STRIPE_PUBLISHABLE_KEY"     "pk_test_51SNUYAADUW12y1MkqyxRe5NMQl9Fneo2qEl2GpBdm5nnBWH3KIsUkLS5IxHhg8gEWKjPvM3SpPXNRpgukTXNTSBK00f7EyfGFU"
Set-GcpSecret "STRIPE_WEBHOOK_SECRET"      "whsec_NqLuTRfXGT6lJD7fh9jCZ4D0Pm97VKuV"
Set-GcpSecret "STRIPE_WEBHOOK_SECRET_THIN" "whsec_YE47CbCcO3Ih5F6ywfBPBmRyV0u5o2Q3"

Write-Host ""; Write-Host "-- Email / SMTP --" -ForegroundColor Cyan
Set-GcpSecret "GOOGLE_SMTP_PASSWORD" "yxwwxgmzbausvttf"
Set-GcpSecret "GOOGLE_SMTP_USER"     "dev@alti.assistant"
Set-GcpSecret "GOOGLE_SMTP_HOST"     "smtp.gmail.com"
Set-GcpSecret "GOOGLE_SMTP_PORT"     "587"
Set-GcpSecret "MAILGUN_DOMAIN"       "mail.insoai.com"
Set-GcpSecret "MAILGUN_KEY"          "9adbe64346cb4ce20780c4257ff181d0-8a084751-73aacdd2"
Set-GcpSecret "MAILGUN_FROM"         "mm@accesseconomy.com"

Write-Host ""; Write-Host "-- AI / LLM APIs --" -ForegroundColor Cyan
Set-GcpSecret "GEMINI_API_KEY"    "AIzaSyATOQRmcM0DMO83Z9jEuuC4DIgna60TSJQ"
Set-GcpSecret "OPENAI_API_KEY"    "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"
Set-GcpSecret "ANTHROPIC_API_KEY" "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"
Set-GcpSecret "GROQ_API_KEY"      "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"
Set-GcpSecret "DEEPSEEK_API_KEY"  "a23af564-10b4-48a4-94c9-61981b986c86"
Set-GcpSecret "TOGETHER_API_KEY"  "2ac0ae002dcef92f3d352eac9132715356c96398644d62a6032711902b14758b"
Set-GcpSecret "TAVILY_API_KEY"    "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"
Set-GcpSecret "SERPER_API_KEY"    "94ebb38131e657db165b257ad9ec2a64980b19ee"

Write-Host ""; Write-Host "-- Google Search / YouTube --" -ForegroundColor Cyan
Set-GcpSecret "GOOGLE_SEARCH_API_KEY" "AIzaSyBgylBIeu7P1xBqdwNDiMOxOB4i3croynE"
Set-GcpSecret "GOOGLE_CSE_ID"         "65afa1b24cd5044d4"
Set-GcpSecret "YOUTUBE_API_KEY"       "AIzaSyBRsPeKJHIof7Pi3HSpKgsSVl31vOhm2-0"

Write-Host ""; Write-Host "-- Massive.com Financial Data --" -ForegroundColor Cyan
Set-GcpSecret "MASSIVE_API_KEY" "gyJwOQtsm3yZXPsGqOjewhzezPzJm4l3"

Write-Host ""; Write-Host "-- PredictionData.io Sports Betting Odds --" -ForegroundColor Cyan
Set-GcpSecret "PREDICTIONDATA_API_KEY" "dummy_predictiondata_api_key_here"

Write-Host ""; Write-Host "-- OAuth Providers --" -ForegroundColor Cyan
Set-GcpSecret "GOOGLE_CLIENT_ID"        "366561755636-vlu66c4gn681dfr8lknjdgom49l1d222.apps.googleusercontent.com"
Set-GcpSecret "GOOGLE_CLIENT_SECRET"    "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"
Set-GcpSecret "FACEBOOK_APP_ID"         "1013272780149014"
Set-GcpSecret "FACEBOOK_APP_SECRET"     "c666b17020b19674996764e170e1080b"
Set-GcpSecret "DISCORD_CLIENT_ID"       "1371590944683462777"
Set-GcpSecret "DISCORD_CLIENT_SECRET"   "ZnAeb681uh4x95n8SdX-vBc43CXJM0kY"
Set-GcpSecret "GITHUB_CLIENT_ID"        "Ov23liTKE6VJOy13U6lp"
Set-GcpSecret "GITHUB_CLIENT_SECRET"    "8cd9ba8817255f958a6da97becad1dc1df8ba7ec"
Set-GcpSecret "TWITTER_CLIENT_ID"       "X1JoRkJBaFdQOWhIMXpLa3BudmY6MTpjaQ"
Set-GcpSecret "TWITTER_CLIENT_SECRET"   "8zuAq3Jmc-DtzgpDNLfnQCiQeQOYoZzBxKXdK3zD_iM4wha0nL"
Set-GcpSecret "SLACK_CLIENT_ID"         "8689697598662.8824821742737"
Set-GcpSecret "SLACK_CLIENT_SECRET"     "fbcec3bd52ec7b472cce97914c2290e9"
Set-GcpSecret "MICROSOFT_CLIENT_ID"     "your_microsoft_client_id"
Set-GcpSecret "MICROSOFT_CLIENT_SECRET" "your_microsoft_client_secret"
Set-GcpSecret "APPLE_CLIENT_ID"         "your_apple_client_id"
Set-GcpSecret "APPLE_TEAM_ID"           "your_apple_team_id"
Set-GcpSecret "APPLE_KEY_ID"            "your_apple_key_id"
Set-GcpSecret "APPLE_PRIVATE_KEY"       "your_apple_private_key"

Write-Host ""; Write-Host "-- Storage and Infrastructure --" -ForegroundColor Cyan
Set-GcpSecret "CLOUD_STORAGE_SECRET_KEY" "cpsU9LS6eemLj576xWkawDjDFqJxLJ0pC5t+J9QrMro"
Set-GcpSecret "CLOUD_STORAGE_ACCESS_KEY" "DO00QQPMXJGVNVHHE4YH"
Set-GcpSecret "CLOUD_STORAGE_BUCKET"     "rental-home"
Set-GcpSecret "REDIS_URL"                "redis://localhost:6379"

Write-Host ""; Write-Host "-- LiveKit / WebSocket --" -ForegroundColor Cyan
Set-GcpSecret "LIVEKIT_API_KEY"    "APIJLJY9Lkyj9m9"
Set-GcpSecret "LIVEKIT_API_SECRET" "pdAzEHVaxcSZCTrqZaIujVBeFMhqn8tpliOGQr4nnDP"
Set-GcpSecret "WEB_SOCKET_URL"     "wss://workchat-qhenhpdg.livekit.cloud"

Write-Host ""; Write-Host "-- Composio --" -ForegroundColor Cyan
Set-GcpSecret "COMPOSIO_ORG_API_KEY"          "ak_3HaxK2_wBqLvc2ocFdmM"
Set-GcpSecret "COMPOSIO_API_KEY"              "gg8z8x4ndafaqu91wxm8gf"
Set-GcpSecret "COMPOSIO_CLIENT_SECRET"        "f818e99ff75acc03937d4b260c9784673152c04f53554cd830b869548f25b54d"
Set-GcpSecret "COMPOSIO_GMAIL_AUTH_CONFIG_ID" "ac_ymvLzUId2ojo"

Write-Host ""; Write-Host "-- Automation Tools --" -ForegroundColor Cyan
Set-GcpSecret "BROWSER_USE_SECRET_KEY" "bu_frRkL0F1ZImButASPZws4uzArY-tbHaDezBi8n2M1ok"
Set-GcpSecret "CYBERDESK_API_KEY"      "cd_3ZeqoubCwcbQfPCEBPF7E4WR"

Write-Host ""; Write-Host "-- GCP / Vertex AI --" -ForegroundColor Cyan
Set-GcpSecret "GCP_PROJECT_ID"       "gen-lang-client-0159237802"
Set-GcpSecret "VERTEX_AI_PROJECT_ID" "gen-lang-client-0159237802"
Set-GcpSecret "GCP_LOCATION"         "us-central1"

# =============================================================================
# Grant Cloud Run SA Secret Accessor role
# =============================================================================
Write-Host ""; Write-Host "-- Enterprise POS & ERP Integrations --" -ForegroundColor Cyan
Set-GcpSecret "TOAST_CLIENT_ID"            "your_toast_client_id_here"
Set-GcpSecret "TOAST_CLIENT_SECRET"        "your_toast_client_secret_here"
Set-GcpSecret "TOAST_MANAGEMENT_API_KEY"   "your_toast_management_api_key_here"
Set-GcpSecret "DUTCHIE_API_KEY"            "your_dutchie_api_key_here"
Set-GcpSecret "DUTCHIE_CLIENT_ID"          "your_dutchie_client_id_here"
Set-GcpSecret "DUTCHIE_CLIENT_SECRET"      "your_dutchie_client_secret_here"
Set-GcpSecret "MINDBODY_API_KEY"           "your_mindbody_api_key_here"
Set-GcpSecret "MINDBODY_SOURCE_NAME"       "your_mindbody_source_name_here"
Set-GcpSecret "MINDBODY_PASSWORD"          "your_mindbody_password_here"
Set-GcpSecret "YARDI_CLIENT_ID"            "your_yardi_client_id_here"
Set-GcpSecret "YARDI_CLIENT_SECRET"        "your_yardi_client_secret_here"
Set-GcpSecret "YARDI_SERVER_URL"           "https://your-property.yardi.com/api"
Set-GcpSecret "CLOVER_API_KEY"             "your_clover_api_key_here"
Set-GcpSecret "CLOVER_CLIENT_ID"           "your_clover_client_id_here"
Set-GcpSecret "CLOVER_CLIENT_SECRET"       "your_clover_client_secret_here"

Write-Host ""; Write-Host "-- IAM: Granting Cloud Run SA Secret Accessor role --" -ForegroundColor Cyan
$CR_SA = "$PROJECT_ID-compute@developer.gserviceaccount.com"
Write-Host "  SA: $CR_SA" -ForegroundColor Yellow

& $GCLOUD_CMD projects add-iam-policy-binding $PROJECT_ID `
    --member="serviceAccount:$CR_SA" `
    --role="roles/secretmanager.secretAccessor" `
    --quiet 2>$null | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "  OK - Cloud Run can now read all secrets" -ForegroundColor Green
} else {
    Write-Host "  WARNING: Set IAM manually in GCP Console" -ForegroundColor Yellow
}

# =============================================================================
Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  ALL SECRETS PROVISIONED IN GCP SECRET MANAGER" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "REMAINING MANUAL STEPS:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. Set GCP_SA_KEY in GitHub (service account JSON):" -ForegroundColor White
Write-Host "     gh secret set GCP_SA_KEY --repo=$GITHUB_REPO < alti_gcp.json" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Set VM_SSH_KEY in GitHub (for VM deploy workflow):" -ForegroundColor White
Write-Host "     gh secret set VM_SSH_KEY --repo=$GITHUB_REPO < your_private_key_file" -ForegroundColor Gray
Write-Host ""
Write-Host "QUICK LINKS:" -ForegroundColor Cyan
Write-Host "  Secret Manager : https://console.cloud.google.com/security/secret-manager?project=$PROJECT_ID" -ForegroundColor White
Write-Host "  GitHub Secrets : https://github.com/$GITHUB_REPO/settings/secrets/actions" -ForegroundColor White
Write-Host "  GitHub Actions : https://github.com/$GITHUB_REPO/actions" -ForegroundColor White
Write-Host ""
