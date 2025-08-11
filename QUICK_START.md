# 🚀 Quick Start - Deploy to Google Cloud Run

Get your clipboard service running on Google Cloud Run in minutes!

## ⚡ 5-Minute Setup

### 1. Set Environment Variables
```powershell
# Run the setup script
.\scripts\setup-env.ps1
```

This will prompt you for:
- **MongoDB URI**: Your MongoDB connection string
- **JWT Secret**: Your JWT signing key (or auto-generate one)
- **GCP Project**: Your Google Cloud project ID

### 2. Deploy to Cloud Run
```powershell
# Deploy using PowerShell
.\scripts\deploy.ps1
```

### 3. Map Your Domain
```bash
# After successful deployment, map cb.yourl.cloud
gcloud run domain-mappings create \
    --service=cb-yourl-cloud \
    --domain=cb.yourl.cloud \
    --region=us-central1
```

## 🔄 Continuous Deployment

### GitHub Actions Setup

1. **Create Service Account**:
```bash
gcloud iam service-accounts create github-actions \
    --display-name="GitHub Actions"

gcloud projects add-iam-policy-binding yourl-cloud \
    --member="serviceAccount:github-actions@yourl-cloud.iam.gserviceaccount.com" \
    --role="roles/run.admin"

gcloud iam service-accounts keys create key.json \
    --iam-account=github-actions@yourl-cloud.iam.gserviceaccount.com
```

2. **Add GitHub Secrets**:
   - `GCP_SA_KEY`: Content of `key.json`
   - `MONGODB_URI`: Your MongoDB connection string
   - `JWT_SECRET`: Your JWT secret

3. **Push to main branch** → Automatic deployment! 🎉

## 📋 What Gets Deployed

- ✅ **API Server**: Complete clipboard service
- ✅ **Authentication**: JWT-based user management
- ✅ **Database**: MongoDB integration
- ✅ **Utilities**: Content validation, formatting, analysis
- ✅ **Security**: Rate limiting, CORS, helmet
- ✅ **Monitoring**: Health checks, logging

## 🌐 Access Your Service

- **Health Check**: `https://cb.yourl.cloud/health`
- **API Base**: `https://cb.yourl.cloud/api`
- **Documentation**: `https://cb.yourl.cloud/api`

## 🔧 Customization

### Environment Variables
```bash
# Update service configuration
gcloud run services update cb-yourl-cloud \
    --region=us-central1 \
    --set-env-vars="NODE_ENV=production" \
    --set-env-vars="LOG_LEVEL=info"
```

### Scaling
```bash
# Adjust scaling
gcloud run services update cb-yourl-cloud \
    --region=us-central1 \
    --max-instances=20 \
    --memory=1Gi
```

## 🚨 Troubleshooting

### Check Service Status
```bash
gcloud run services describe cb-yourl-cloud --region=us-central1
```

### View Logs
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=cb-yourl-cloud" --limit=20
```

### Rollback
```bash
# List revisions
gcloud run revisions list --service=cb-yourl-cloud --region=us-central1

# Rollback to specific revision
gcloud run services update-traffic cb-yourl-cloud \
    --region=us-central1 \
    --to-revisions=REVISION_NAME=100
```

## 📚 Next Steps

1. **Set up monitoring** with Google Cloud Monitoring
2. **Configure alerts** for service health
3. **Set up backups** for your MongoDB data
4. **Implement CI/CD** with GitHub Actions
5. **Add custom domains** for different environments

## 🆘 Need Help?

- 📖 [Full Deployment Guide](DEPLOYMENT.md)
- 📖 [API Documentation](API_DOCUMENTATION.md)
- 🐛 [GitHub Issues](https://github.com/XDM-ZSBW/cloud-yourl-cb/issues)
- 📧 Email: support@cb.yourl.cloud

---

**Your clipboard service is ready to serve friends and family! 🎯**
