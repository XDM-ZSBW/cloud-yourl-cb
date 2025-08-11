# Deploy script for cb-yourl-cloud to Google Cloud Run (PowerShell)
param(
    [string]$MongoDBUri = "",
    [string]$JwtSecret = ""
)

# Configuration
$PROJECT_ID = "yourl-cloud"
$SERVICE_NAME = "cb-yourl-cloud"
$REGION = "us-central1"
$IMAGE_NAME = "gcr.io/$PROJECT_ID/$SERVICE_NAME"

Write-Host "🚀 Deploying cb-yourl-cloud to Google Cloud Run..." -ForegroundColor Yellow

# Check if gcloud is installed
try {
    $null = Get-Command gcloud -ErrorAction Stop
} catch {
    Write-Host "❌ Google Cloud CLI is not installed. Please install it first." -ForegroundColor Red
    exit 1
}

# Check if user is authenticated
$authStatus = gcloud auth list --filter=status:ACTIVE --format="value(account)"
if (-not $authStatus) {
    Write-Host "❌ Not authenticated with Google Cloud. Please run 'gcloud auth login' first." -ForegroundColor Red
    exit 1
}

# Set the project
Write-Host "📋 Setting project to $PROJECT_ID..." -ForegroundColor Yellow
gcloud config set project $PROJECT_ID

# Build the Docker image
Write-Host "🔨 Building Docker image..." -ForegroundColor Yellow
docker build -t $IMAGE_NAME`:latest .

# Tag with commit hash
$COMMIT_HASH = git rev-parse --short HEAD
docker tag $IMAGE_NAME`:latest $IMAGE_NAME`:$COMMIT_HASH

# Push to Container Registry
Write-Host "📤 Pushing image to Container Registry..." -ForegroundColor Yellow
docker push $IMAGE_NAME`:latest
docker push $IMAGE_NAME`:$COMMIT_HASH

# Prepare environment variables
$envVars = @(
    "NODE_ENV=production",
    "PORT=3000", 
    "JWT_EXPIRES_IN=24h",
    "ALLOWED_ORIGINS=https://cb.yourl.cloud,https://yourl.cloud"
)

if ($MongoDBUri) {
    $envVars += "MONGODB_URI=$MongoDBUri"
}

if ($JwtSecret) {
    $envVars += "JWT_SECRET=$JwtSecret"
}

# Deploy to Cloud Run
Write-Host "🚀 Deploying to Cloud Run..." -ForegroundColor Yellow
$envVarsString = $envVars -join ","

gcloud run deploy $SERVICE_NAME `
    --image $IMAGE_NAME`:$COMMIT_HASH `
    --region $REGION `
    --platform managed `
    --allow-unauthenticated `
    --port 3000 `
    --memory 512Mi `
    --cpu 1 `
    --max-instances 10 `
    --set-env-vars $envVarsString

# Get the service URL
$SERVICE_URL = gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)'

Write-Host "✅ Deployment successful!" -ForegroundColor Green
Write-Host "🌐 Service URL: $SERVICE_URL" -ForegroundColor Green
Write-Host "📋 Service Name: $SERVICE_NAME" -ForegroundColor Green
Write-Host "🏗️  Project: $PROJECT_ID" -ForegroundColor Green
Write-Host "📍 Region: $REGION" -ForegroundColor Green

# Update domain mapping if needed
Write-Host "🔗 To map cb.yourl.cloud, run:" -ForegroundColor Yellow
Write-Host "gcloud run domain-mappings create --service=$SERVICE_NAME --domain=cb.yourl.cloud --region=$REGION" -ForegroundColor Cyan
