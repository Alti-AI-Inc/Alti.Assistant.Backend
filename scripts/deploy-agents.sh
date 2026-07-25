#!/bin/bash
# Deploy all 7 Inso Assistant microservices to Google Cloud Run

set -e

# Configuration
PROJECT_ID=${GCP_PROJECT_ID:-"inso-assistant-prod"}
REGION=${GCP_REGION:-"us-central1"}
AGENTS=("search" "research" "write" "code" "image" "audio" "video")

echo "=========================================================="
echo " Deploying Inso Assistant Agents to Google Cloud Run"
echo " Project: $PROJECT_ID"
echo " Region: $REGION"
echo "=========================================================="

for AGENT in "${AGENTS[@]}"; do
  AGENT_DIR="agents/agent-${AGENT}"
  IMAGE_NAME="gcr.io/${PROJECT_ID}/agent-${AGENT}"
  SERVICE_NAME="agent-${AGENT}"

  echo ""
  echo "🚀 Building and deploying ${SERVICE_NAME}..."
  
  # Submit build to Cloud Build natively using an inline config to specify the Dockerfile
  echo "   [1/2] Building Docker image via Cloud Build..."
  cat <<EOF > cloudbuild-tmp-${AGENT}.yaml
steps:
- name: 'gcr.io/cloud-builders/docker'
  args: ['build', '-t', '${IMAGE_NAME}', '-f', '${AGENT_DIR}/Dockerfile', '.']
images: ['${IMAGE_NAME}']
EOF
  gcloud builds submit --config cloudbuild-tmp-${AGENT}.yaml --project ${PROJECT_ID} --timeout=30m .
  rm cloudbuild-tmp-${AGENT}.yaml

  # Deploy to Cloud Run
  echo "   [2/2] Deploying to Cloud Run..."
  gcloud run deploy ${SERVICE_NAME} \
    --image ${IMAGE_NAME} \
    --region ${REGION} \
    --project ${PROJECT_ID} \
    --platform managed \
    --allow-unauthenticated \
    --min-instances 0 \
    --max-instances 10 \
    --cpu 1 \
    --memory 1Gi \
    --set-env-vars="NODE_ENV=production" \
    --set-secrets="GOOGLE_API_KEY=GEMINI_API_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,DATABASE_LOCAL=DATABASE_LOCAL:latest,MONGODB_URI=DATABASE_LOCAL:latest,JWT_ACCESS_TOKEN=JWT_ACCESS_TOKEN:latest,JWT_REFRESH_REFRESH_TOKEN=JWT_REFRESH_REFRESH_TOKEN:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,DEEPSEEK_API_KEY=DEEPSEEK_API_KEY:latest,GOOGLE_SEARCH_API_KEY=GOOGLE_SEARCH_API_KEY:latest,GOOGLE_CSE_ID=GOOGLE_CSE_ID:latest,YOUTUBE_API_KEY=YOUTUBE_API_KEY:latest,MASSIVE_API_KEY=MASSIVE_API_KEY:latest,PREDICTIONDATA_API_KEY=PREDICTIONDATA_API_KEY:latest,STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,STRIPE_PUBLISHABLE_KEY=STRIPE_PUBLISHABLE_KEY:latest,STRIPE_WEBHOOK_SECRET=STRIPE_WEBHOOK_SECRET:latest,STRIPE_WEBHOOK_SECRET_THIN=STRIPE_WEBHOOK_SECRET_THIN:latest,GOOGLE_SMTP_PASSWORD=GOOGLE_SMTP_PASSWORD:latest,GOOGLE_SMTP_USER=GOOGLE_SMTP_USER:latest,MAILGUN_DOMAIN=MAILGUN_DOMAIN:latest,MAILGUN_KEY=MAILGUN_KEY:latest,MAILGUN_FROM=MAILGUN_FROM:latest,REDIS_URL=REDIS_URL:latest,CLOUD_STORAGE_SECRET_KEY=CLOUD_STORAGE_SECRET_KEY:latest,CLOUD_STORAGE_ACCESS_KEY=CLOUD_STORAGE_ACCESS_KEY:latest,CLOUD_STORAGE_BUCKET=CLOUD_STORAGE_BUCKET:latest,LIVEKIT_API_KEY=LIVEKIT_API_KEY:latest,LIVEKIT_API_SECRET=LIVEKIT_API_SECRET:latest,WEB_SOCKET_URL=WEB_SOCKET_URL:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,FACEBOOK_APP_ID=FACEBOOK_APP_ID:latest,FACEBOOK_APP_SECRET=FACEBOOK_APP_SECRET:latest,DISCORD_CLIENT_ID=DISCORD_CLIENT_ID:latest,DISCORD_CLIENT_SECRET=DISCORD_CLIENT_SECRET:latest,GITHUB_CLIENT_ID=GITHUB_CLIENT_ID:latest,GITHUB_CLIENT_SECRET=GITHUB_CLIENT_SECRET:latest,TWITTER_CLIENT_ID=TWITTER_CLIENT_ID:latest,TWITTER_CLIENT_SECRET=TWITTER_CLIENT_SECRET:latest,SLACK_CLIENT_ID=SLACK_CLIENT_ID:latest,SLACK_CLIENT_SECRET=SLACK_CLIENT_SECRET:latest,COMPOSIO_ORG_API_KEY=COMPOSIO_ORG_API_KEY:latest,COMPOSIO_API_KEY=COMPOSIO_API_KEY:latest,COMPOSIO_CLIENT_SECRET=COMPOSIO_CLIENT_SECRET:latest,COMPOSIO_GMAIL_AUTH_CONFIG_ID=COMPOSIO_GMAIL_AUTH_CONFIG_ID:latest,BROWSER_USE_SECRET_KEY=BROWSER_USE_SECRET_KEY:latest,CYBERDESK_API_KEY=CYBERDESK_API_KEY:latest,GCP_PROJECT_ID=GCP_PROJECT_ID:latest,VERTEX_AI_PROJECT_ID=VERTEX_AI_PROJECT_ID:latest,GOOGLE_MCP_TOOLBOX_URL=GOOGLE_MCP_TOOLBOX_URL:latest,GOOGLE_MAPS_API_KEY=GOOGLE_MAPS_API_KEY:latest,MAPS_API_KEY=MAPS_API_KEY:latest,GCP_DOCUMENT_AI_PROCESSOR_ID=GCP_DOCUMENT_AI_PROCESSOR_ID:latest,RECAPTCHA_SITE_KEY=RECAPTCHA_SITE_KEY:latest"

  echo "✅ ${SERVICE_NAME} deployed successfully!"
done

echo ""
echo "🎉 All 7 agents have been deployed successfully!"
echo "Make sure to update your API Gateway's environment variables with the new Cloud Run URLs."
