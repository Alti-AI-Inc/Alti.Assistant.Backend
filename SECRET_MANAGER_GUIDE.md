# Alti Assistant — Secrets & Deployment Guide

> **Single Source of Truth** for all production secrets, GCP configuration, and CI/CD deployment.

---

## 🔐 Where Secrets Live

| Location | Purpose | How it's used |
|----------|---------|---------------|
| **GCP Secret Manager** | All runtime secrets (API keys, DB URL, etc.) | Mounted directly into Cloud Run at deploy time |
| **GitHub Actions Secrets** | Infrastructure secrets only (`GCP_SA_KEY`, `VM_SSH_KEY`) | Used by the CI pipeline itself |
| `env.yaml` | Local development / manual deploy reference | DO NOT commit real values to public repos |
| `.env` | Local dev override | Never committed (in `.gitignore`) |

---

## 🚀 CI/CD — Automated Deployments

| Workflow | Trigger | Deploys to |
|----------|---------|-----------|
| [deploy-cloud-run.yml](.github/workflows/deploy-cloud-run.yml) | Push to `main` | GCP Cloud Run |
| [deploy.yml](.github/workflows/deploy.yml) | Push to `dev` | GCP VM (Docker Compose) |

### Cloud Run Details
- **Project:** `alti-assistant-prod`
- **Region:** `us-central1`
- **Service:** `alti-assistant-backend`
- **Registry:** `us-central1-docker.pkg.dev/alti-assistant-prod/alti-assistant-core-backend-repo`
- **Resources:** 4Gi RAM · 2 vCPU · 1–4 instances · 300s timeout

---

## 🛠️ One-Time Setup

### Step 1 — Authenticate GCP and GitHub CLIs
```bash
gcloud auth login
gh auth login --web
```

### Step 2 — Run the master secrets setup script
```powershell
.\set-all-secrets.ps1
```
This script:
- Creates/updates every secret in **GCP Secret Manager**
- Grants the Cloud Run service account **Secret Accessor** IAM role
- Reminds you which 2 secrets must be set manually in GitHub

### Step 3 — Set the 2 manual GitHub Actions secrets

#### `GCP_SA_KEY` — Service account JSON for CI
```bash
# Download from: GCP Console → IAM → Service Accounts → alti-assistant-prod@... → Keys
gh secret set GCP_SA_KEY --repo=Alti-AI-Inc/Alti.Assistant.Backend < alti_gcp.json
```

#### `VM_SSH_KEY` — SSH private key for the VM deployer
```bash
gh secret set VM_SSH_KEY --repo=Alti-AI-Inc/Alti.Assistant.Backend < ~/.ssh/your_vm_private_key
```

---

## 📋 All Secrets Reference

### Database
| Secret Name | Description |
|-------------|-------------|
| `DATABASE_LOCAL` | MongoDB connection string (Atlas) |
| `DB_USERNAME` | MongoDB username |
| `DB_PASSWORD` | MongoDB password |

### Auth / JWT
| Secret Name | Description |
|-------------|-------------|
| `JWT_ACCESS_TOKEN` | JWT signing secret |
| `JWT_REFRESH_REFRESH_TOKEN` | JWT refresh signing secret |

### AI / LLM APIs
| Secret Name | Service |
|-------------|---------|
| `GEMINI_API_KEY` | Google Gemini |
| `OPENAI_API_KEY` | OpenAI GPT |
| `ANTHROPIC_API_KEY` | Claude |
| `GROQ_API_KEY` | Groq |
| `DEEPSEEK_API_KEY` | DeepSeek |
| `TOGETHER_API_KEY` | Together AI |
| `TAVILY_API_KEY` | Tavily Search |
| `SERPER_API_KEY` | Serper Search |

### Google Services
| Secret Name | Service |
|-------------|---------|
| `GOOGLE_SEARCH_API_KEY` | Custom Search API |
| `GOOGLE_CSE_ID` | Custom Search Engine ID |
| `YOUTUBE_API_KEY` | YouTube Data API |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Secret |
| `GOOGLE_SMTP_USER` | Gmail SMTP user |
| `GOOGLE_SMTP_PASSWORD` | Gmail App Password |

### Financial Data
| Secret Name | Service |
|-------------|---------|
| `MASSIVE_API_KEY` | Massive.com — real-time stocks/options/crypto/forex |

### Payments
| Secret Name | Description |
|-------------|-------------|
| `STRIPE_SECRET_KEY` | Stripe server-side key |
| `STRIPE_PUBLISHABLE_KEY` | Stripe client-side key |
| `STRIPE_WEBHOOK_SECRET` | Main webhook signing secret |
| `STRIPE_WEBHOOK_SECRET_THIN` | Thin webhook signing secret |

### OAuth Providers
| Secret Name | Provider |
|-------------|---------|
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | Facebook |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Discord |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub |
| `TWITTER_CLIENT_ID` / `TWITTER_CLIENT_SECRET` | Twitter/X |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | Slack |

### Infrastructure
| Secret Name | Description |
|-------------|-------------|
| `REDIS_URL` | Redis connection URL |
| `CLOUD_STORAGE_SECRET_KEY` | DigitalOcean Spaces secret |
| `CLOUD_STORAGE_ACCESS_KEY` | DigitalOcean Spaces access key |
| `CLOUD_STORAGE_BUCKET` | Storage bucket name |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |

### Automation
| Secret Name | Service |
|-------------|---------|
| `COMPOSIO_API_KEY` | Composio |
| `COMPOSIO_ORG_API_KEY` | Composio org key |
| `BROWSER_USE_SECRET_KEY` | Browser Use |
| `CYBERDESK_API_KEY` | CyberDesk |

---

## 🔗 Quick Links

| Resource | Link |
|----------|------|
| **GCP Secret Manager** | https://console.cloud.google.com/security/secret-manager?project=alti-assistant-prod |
| **Cloud Run Service** | https://console.cloud.google.com/run/detail/us-central1/alti-assistant-backend/metrics?project=alti-assistant-prod |
| **Artifact Registry** | https://console.cloud.google.com/artifacts/docker/alti-assistant-prod/us-central1/alti-assistant-core-backend-repo?project=alti-assistant-prod |
| **Cloud Logs** | https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_run_revision%22%20resource.labels.service_name%3D%22alti-assistant-backend%22?project=alti-assistant-prod |
| **GitHub Actions** | https://github.com/Alti-AI-Inc/Alti.Assistant.Backend/actions |
| **GitHub Secrets** | https://github.com/Alti-AI-Inc/Alti.Assistant.Backend/settings/secrets/actions |

---

## 🔄 Updating a Secret

### GCP Secret Manager (preferred)
```bash
# Update a single secret value (new version is created, old is kept for rollback)
echo -n "new_value" | gcloud secrets versions add SECRET_NAME \
  --data-file=- --project=alti-assistant-prod

# List all versions of a secret
gcloud secrets versions list SECRET_NAME --project=alti-assistant-prod

# View current value
gcloud secrets versions access latest --secret=SECRET_NAME --project=alti-assistant-prod
```

### Re-run the setup script (updates all secrets at once)
```powershell
.\set-all-secrets.ps1
```

### After updating any secret — redeploy
Push any commit to `main` — the CI pipeline picks up the latest secret version automatically.

---

## 🧹 Rollback

```bash
# Roll back to a previous secret version
gcloud secrets versions disable VERSION_NUMBER --secret=SECRET_NAME --project=alti-assistant-prod

# Roll back Cloud Run to a previous revision
gcloud run services update-traffic alti-assistant-backend \
  --to-revisions=REVISION_NAME=100 \
  --region=us-central1 \
  --project=alti-assistant-prod
```

---

*Last updated: 2026-05-21 · Maintained by the Alti Engineering team*
