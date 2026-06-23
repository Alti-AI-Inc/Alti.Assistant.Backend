#!/bin/bash
# Deploy all 7 Alti Assistant microservices to Google Cloud Run

set -e

# Configuration
PROJECT_ID=${GCP_PROJECT_ID:-"alti-assistant-prod"}
REGION=${GCP_REGION:-"us-central1"}
AGENTS=("search" "research" "write" "code" "image" "audio" "video")

echo "=========================================================="
echo " Deploying Alti Assistant Agents to Google Cloud Run"
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
    --set-env-vars NODE_ENV=production

  echo "✅ ${SERVICE_NAME} deployed successfully!"
done

echo ""
echo "🎉 All 7 agents have been deployed successfully!"
echo "Make sure to update your API Gateway's environment variables with the new Cloud Run URLs."
