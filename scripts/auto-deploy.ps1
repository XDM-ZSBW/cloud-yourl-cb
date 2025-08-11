# Automated deployment script for existing Cloud Run service
# No manual input required - automatically detects and updates existing service

param(
    [switch]$Force = $false
)

# Configuration
$PROJECT_ID = "yourl-cloud"
$IMAGE_NAME = "gcr.io/$PROJECT_ID/cb-yourl-cloud"

Write-Host "🚀 Automated deployment to existing Cloud Run service..." -ForegroundColor Yellow

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

# Find existing Cloud Run service
Write-Host "🔍 Detecting existing Cloud Run service..." -ForegroundColor Yellow
$services = gcloud run services list --format="value(metadata.name,metadata.labels.'run.googleapis.com/location')" | Where-Object { $_ -like "*clipboard*" -or $_ -like "*cb*" }

if (-not $services) {
    Write-Host "❌ No existing clipboard service found. Creating new service..." -ForegroundColor Red
    $SERVICE_NAME = "clipboard-bridge"
    $REGION = "us-west1"
} else {
    $serviceInfo = $services[0] -split '\s+'
    $SERVICE_NAME = $serviceInfo[0]
    $REGION = $serviceInfo[1]
    Write-Host "✅ Found existing service: $SERVICE_NAME in $REGION" -ForegroundColor Green
}

# Get existing service configuration
Write-Host "📋 Getting existing service configuration..." -ForegroundColor Yellow
$existingConfig = gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(spec.template.spec.containers[0].env[].name,spec.template.spec.containers[0].env[].value)" 2>$null

# Extract existing environment variables
$existingEnvVars = @{}
if ($existingConfig) {
    $lines = $existingConfig -split "`n"
    for ($i = 0; $i -lt $lines.Length; $i += 2) {
        if ($i + 1 -lt $lines.Length) {
            $existingEnvVars[$lines[$i]] = $lines[$i + 1]
        }
    }
}

Write-Host "🔧 Using existing environment variables..." -ForegroundColor Yellow
foreach ($key in $existingEnvVars.Keys) {
    Write-Host "  $key = $($existingEnvVars[$key])" -ForegroundColor Cyan
}

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

# Prepare environment variables for deployment
$envVars = @(
    "NODE_ENV=production",
    "PORT=3000",
    "JWT_EXPIRES_IN=24h",
    "ALLOWED_ORIGINS=https://cb.yourl.cloud,https://yourl.cloud"
)

# Add existing environment variables if they exist
if ($existingEnvVars.ContainsKey("MONGODB_URI")) {
    $envVars += "MONGODB_URI=$($existingEnvVars['MONGODB_URI'])"
    Write-Host "✅ Using existing MongoDB URI" -ForegroundColor Green
}

if ($existingEnvVars.ContainsKey("JWT_SECRET")) {
    $envVars += "JWT_SECRET=$($existingEnvVars['JWT_SECRET'])"
    Write-Host "✅ Using existing JWT Secret" -ForegroundColor Green
}

# Deploy to existing Cloud Run service
Write-Host "🚀 Deploying to existing service: $SERVICE_NAME in $REGION..." -ForegroundColor Yellow
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

# Check domain mapping
Write-Host "🔗 Checking domain mapping..." -ForegroundColor Yellow
$domainMappings = gcloud run domain-mappings list --region=$REGION --filter="metadata.name:cb.yourl.cloud" --format="value(metadata.name,status.url)" 2>$null

if ($domainMappings) {
    Write-Host "✅ Domain cb.yourl.cloud is already mapped" -ForegroundColor Green
} else {
    Write-Host "⚠️  Domain cb.yourl.cloud not mapped. To map it, run:" -ForegroundColor Yellow
    Write-Host "gcloud run domain-mappings create --service=$SERVICE_NAME --domain=cb.yourl.cloud --region=$REGION" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "🎉 Service updated successfully with new code from GitHub!" -ForegroundColor Green
Write-Host "📱 Your Zaido clients will now use the updated service." -ForegroundColor Green
