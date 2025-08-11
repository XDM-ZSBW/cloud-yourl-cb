#!/bin/bash

# Deploy script for cb-yourl-cloud to Google Cloud Run
set -e

# Configuration
PROJECT_ID="yourl-cloud"
SERVICE_NAME="cb-yourl-cloud"
REGION="us-central1"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🚀 Deploying cb-yourl-cloud to Google Cloud Run...${NC}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ Google Cloud CLI is not installed. Please install it first.${NC}"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo -e "${RED}❌ Not authenticated with Google Cloud. Please run 'gcloud auth login' first.${NC}"
    exit 1
fi

# Set the project
echo -e "${YELLOW}📋 Setting project to $PROJECT_ID...${NC}"
gcloud config set project $PROJECT_ID

# Build the Docker image
echo -e "${YELLOW}🔨 Building Docker image...${NC}"
docker build -t $IMAGE_NAME:latest .

# Tag with commit hash
COMMIT_HASH=$(git rev-parse --short HEAD)
docker tag $IMAGE_NAME:latest $IMAGE_NAME:$COMMIT_HASH

# Push to Container Registry
echo -e "${YELLOW}📤 Pushing image to Container Registry...${NC}"
docker push $IMAGE_NAME:latest
docker push $IMAGE_NAME:$COMMIT_HASH

# Deploy to Cloud Run
echo -e "${YELLOW}🚀 Deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_NAME:$COMMIT_HASH \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --port 3000 \
    --memory 512Mi \
    --cpu 1 \
    --max-instances 10 \
    --set-env-vars NODE_ENV=production,PORT=3000,JWT_EXPIRES_IN=24h \
    --set-env-vars MONGODB_URI="$MONGODB_URI" \
    --set-env-vars JWT_SECRET="$JWT_SECRET" \
    --set-env-vars ALLOWED_ORIGINS="https://cb.yourl.cloud,https://yourl.cloud"

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)')

echo -e "${GREEN}✅ Deployment successful!${NC}"
echo -e "${GREEN}🌐 Service URL: $SERVICE_URL${NC}"
echo -e "${GREEN}📋 Service Name: $SERVICE_NAME${NC}"
echo -e "${GREEN}🏗️  Project: $PROJECT_ID${NC}"
echo -e "${GREEN}📍 Region: $REGION${NC}"

# Update domain mapping if needed
echo -e "${YELLOW}🔗 To map cb.yourl.cloud, run:${NC}"
echo -e "gcloud run domain-mappings create --service=$SERVICE_NAME --domain=cb.yourl.cloud --region=$REGION"
