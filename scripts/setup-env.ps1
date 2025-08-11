# Environment Setup Script for cb-yourl-cloud
Write-Host "🔧 Setting up environment variables for deployment..." -ForegroundColor Yellow

# Prompt for MongoDB URI
$mongodbUri = Read-Host "Enter your MongoDB connection string"
if ($mongodbUri) {
    [Environment]::SetEnvironmentVariable("MONGODB_URI", $mongodbUri, "User")
    Write-Host "✅ MongoDB URI set" -ForegroundColor Green
}

# Prompt for JWT Secret
$jwtSecret = Read-Host "Enter your JWT secret (or press Enter to generate one)"
if (-not $jwtSecret) {
    $jwtSecret = -join ((48..57) + (97..122) | Get-Random -Count 32 | ForEach-Object {[char]$_})
    Write-Host "🔑 Generated JWT secret: $jwtSecret" -ForegroundColor Cyan
}
[Environment]::SetEnvironmentVariable("JWT_SECRET", $jwtSecret, "User")

# Prompt for Google Cloud Project
$projectId = Read-Host "Enter your Google Cloud Project ID (default: yourl-cloud)"
if (-not $projectId) {
    $projectId = "yourl-cloud"
}
[Environment]::SetEnvironmentVariable("GCP_PROJECT_ID", $projectId, "User")

Write-Host "✅ Environment variables configured!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Summary:" -ForegroundColor Cyan
Write-Host "  MongoDB URI: $mongodbUri" -ForegroundColor White
Write-Host "  JWT Secret: $jwtSecret" -ForegroundColor White
Write-Host "  GCP Project: $projectId" -ForegroundColor White
Write-Host ""
Write-Host "🚀 You can now run the deployment script:" -ForegroundColor Green
Write-Host "  .\scripts\deploy.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "💡 Note: These variables are set for your user account only." -ForegroundColor Yellow
Write-Host "   For production, consider using Google Secret Manager." -ForegroundColor Yellow
