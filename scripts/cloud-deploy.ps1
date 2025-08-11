# Cloud Build deployment script - no local Docker required
# Automatically updates existing clipboard-bridge service

param(
    [switch]$Force = $false
)

# Configuration
$PROJECT_ID = "yourl-cloud"
$SERVICE_NAME = "clipboard-bridge"
$REGION = "us-west1"

Write-Host "🚀 Deploying to existing Cloud Run service using Cloud Build..." -ForegroundColor Yellow

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

# Check if service exists
Write-Host "🔍 Checking existing service..." -ForegroundColor Yellow
$serviceExists = gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(metadata.name)" 2>$null

if (-not $serviceExists) {
    Write-Host "❌ Service $SERVICE_NAME not found in region $REGION" -ForegroundColor Red
    Write-Host "💡 Please create the service first or check the region" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Found existing service: $SERVICE_NAME in $REGION" -ForegroundColor Green

# Get existing environment variables
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

# Submit build to Cloud Build
Write-Host "🚀 Submitting build to Cloud Build..." -ForegroundColor Yellow

# Create a temporary cloudbuild.yaml with the correct service name
$tempCloudBuild = @"
steps:
  # Build the container image
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/cb-yourl-cloud:$COMMIT_SHA', '.']
  
  # Push the container image to Container Registry
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/cb-yourl-cloud:$COMMIT_SHA']
  
  # Deploy container image to Cloud Run
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - '$SERVICE_NAME'
      - '--image'
      - 'gcr.io/$PROJECT_ID/cb-yourl-cloud:$COMMIT_SHA'
      - '--region'
      - '$REGION'
      - '--platform'
      - 'managed'
      - '--allow-unauthenticated'
      - '--port'
      - '3000'
      - '--memory'
      - '512Mi'
      - '--cpu'
      - '1'
      - '--max-instances'
      - '10'
      - '--set-env-vars'
      - 'NODE_ENV=production,PORT=3000,JWT_EXPIRES_IN=24h,ALLOWED_ORIGINS=https://cb.yourl.cloud,https://yourl.cloud'

# Store images in Google Container Registry
images:
  - 'gcr.io/$PROJECT_ID/cb-yourl-cloud:$COMMIT_SHA'

# Build timeout
timeout: '1200s'
"@

# Write temporary cloudbuild.yaml
$tempCloudBuild | Out-File -FilePath "cloudbuild-temp.yaml" -Encoding UTF8

try {
    # Submit build
    $buildResult = gcloud builds submit --config cloudbuild-temp.yaml . 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Build and deployment successful!" -ForegroundColor Green
        
        # Get the service URL
        $SERVICE_URL = gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)'
        
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
    } else {
        Write-Host "❌ Build failed. Check the output above for details." -ForegroundColor Red
        Write-Host $buildResult
    }
} finally {
    # Clean up temporary file
    if (Test-Path "cloudbuild-temp.yaml") {
        Remove-Item "cloudbuild-temp.yaml"
    }
}
