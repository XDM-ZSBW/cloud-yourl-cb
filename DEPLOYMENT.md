# Deployment Guide - Google Cloud Run

This guide will help you deploy the cb-yourl-cloud clipboard service to Google Cloud Run with continuous integration and domain mapping.

## 🚀 Quick Start

### Prerequisites

1. **Google Cloud CLI** installed and configured
2. **Docker** installed and running
3. **GitHub** repository access
4. **Domain** (cb.yourl.cloud) configured

### 1. Initial Setup

```bash
# Authenticate with Google Cloud
gcloud auth login

# Set your project
gcloud config set project yourl-cloud

# Enable required APIs
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

### 2. First Deployment

```bash
# Using PowerShell (Windows)
.\scripts\deploy.ps1 -MongoDBUri "your-mongodb-connection-string" -JwtSecret "your-jwt-secret"

# Using Bash (Linux/Mac)
./scripts/deploy.sh
```

## 🔄 Continuous Deployment

### GitHub Actions Setup

1. **Add GitHub Secrets** in your repository:
   - `GCP_SA_KEY`: Google Cloud Service Account JSON key
   - `MONGODB_URI`: Your MongoDB connection string
   - `JWT_SECRET`: Your JWT signing secret

2. **Service Account Creation**:
```bash
# Create service account
gcloud iam service-accounts create github-actions \
    --display-name="GitHub Actions"

# Grant necessary roles
gcloud projects add-iam-policy-binding yourl-cloud \
    --member="serviceAccount:github-actions@yourl-cloud.iam.gserviceaccount.com" \
    --role="roles/run.admin"

gcloud projects add-iam-policy-binding yourl-cloud \
    --member="serviceAccount:github-actions@yourl-cloud.iam.gserviceaccount.com" \
    --role="roles/storage.admin"

gcloud projects add-iam-policy-binding yourl-cloud \
    --member="serviceAccount:github-actions@yourl-cloud.iam.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser"

# Create and download key
gcloud iam service-accounts keys create key.json \
    --iam-account=github-actions@yourl-cloud.iam.gserviceaccount.com
```

3. **Copy the key.json content** to GitHub Secrets as `GCP_SA_KEY`

### Automatic Deployment

- **Push to main branch** → Automatic deployment
- **Pull request to main** → Test deployment
- **Manual trigger** → Available in GitHub Actions

## 🌐 Domain Mapping

### Map cb.yourl.cloud

```bash
# Create domain mapping
gcloud run domain-mappings create \
    --service=cb-yourl-cloud \
    --domain=cb.yourl.cloud \
    --region=us-central1
```

### DNS Configuration

1. **Get Cloud Run IP**:
```bash
gcloud run domain-mappings describe \
    --domain=cb.yourl.cloud \
    --region=us-central1
```

2. **Update DNS Records**:
   - Type: `CNAME`
   - Name: `cb.yourl.cloud`
   - Value: `your-service-url.a.run.app`

## 🔧 Environment Configuration

### Production Environment Variables

```bash
# Set environment variables
gcloud run services update cb-yourl-cloud \
    --region=us-central1 \
    --set-env-vars="NODE_ENV=production" \
    --set-env-vars="MONGODB_URI=your-mongodb-uri" \
    --set-env-vars="JWT_SECRET=your-jwt-secret" \
    --set-env-vars="ALLOWED_ORIGINS=https://cb.yourl.cloud,https://yourl.cloud"
```

### Secrets Management

```bash
# Create secrets
echo -n "your-mongodb-uri" | gcloud secrets create mongodb-uri --data-file=-

echo -n "your-jwt-secret" | gcloud secrets create jwt-secret --data-file=-

# Grant access to Cloud Run
gcloud secrets add-iam-policy-binding mongodb-uri \
    --member="serviceAccount:cb-yourl-cloud@yourl-cloud.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding jwt-secret \
    --member="serviceAccount:cb-yourl-cloud@yourl-cloud.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"
```

## 📊 Monitoring & Logging

### View Logs

```bash
# View service logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=cb-yourl-cloud" \
    --limit=50 \
    --format="table(timestamp,severity,textPayload)"
```

### Monitor Performance

```bash
# View service metrics
gcloud run services describe cb-yourl-cloud \
    --region=us-central1 \
    --format="value(status.conditions[0].message)"
```

## 🔒 Security

### IAM Roles

```bash
# Grant minimal required permissions
gcloud run services add-iam-policy-binding cb-yourl-cloud \
    --region=us-central1 \
    --member="allUsers" \
    --role="roles/run.invoker"
```

### Network Security

```bash
# Restrict to specific IPs (if needed)
gcloud run services update cb-yourl-cloud \
    --region=us-central1 \
    --ingress=internal \
    --allow-unauthenticated
```

## 🚨 Troubleshooting

### Common Issues

1. **Build Failures**:
   ```bash
   # Check build logs
   gcloud builds list --limit=10
   gcloud builds log [BUILD_ID]
   ```

2. **Deployment Failures**:
   ```bash
   # Check service status
   gcloud run services describe cb-yourl-cloud --region=us-central1
   
   # View recent revisions
   gcloud run revisions list --service=cb-yourl-cloud --region=us-central1
   ```

3. **Domain Mapping Issues**:
   ```bash
   # Verify domain mapping
   gcloud run domain-mappings list --region=us-central1
   
   # Check DNS propagation
   nslookup cb.yourl.cloud
   ```

### Rollback

```bash
# Rollback to previous revision
gcloud run services update-traffic cb-yourl-cloud \
    --region=us-central1 \
    --to-revisions=REVISION_NAME=100
```

## 📈 Scaling

### Auto-scaling Configuration

```bash
# Update scaling configuration
gcloud run services update cb-yourl-cloud \
    --region=us-central1 \
    --min-instances=0 \
    --max-instances=10 \
    --cpu-throttling \
    --concurrency=80
```

### Resource Limits

```bash
# Update resource allocation
gcloud run services update cb-yourl-cloud \
    --region=us-central1 \
    --memory=1Gi \
    --cpu=2 \
    --timeout=300
```

## 🔄 Update Process

### Manual Update

```bash
# Build and deploy new version
docker build -t gcr.io/yourl-cloud/cb-yourl-cloud:latest .
docker push gcr.io/yourl-cloud/cb-yourl-cloud:latest

gcloud run deploy cb-yourl-cloud \
    --image gcr.io/yourl-cloud/cb-yourl-cloud:latest \
    --region=us-central1
```

### Automated Update

- Push to main branch
- GitHub Actions automatically builds and deploys
- Zero-downtime deployment with rolling updates

## 📋 Deployment Checklist

- [ ] Google Cloud APIs enabled
- [ ] Service account created and configured
- [ ] GitHub secrets configured
- [ ] MongoDB connection string ready
- [ ] JWT secret configured
- [ ] Domain DNS configured
- [ ] First deployment successful
- [ ] Domain mapping created
- [ ] Monitoring and logging configured
- [ ] Security policies applied

## 🆘 Support

For deployment issues:
1. Check [Google Cloud Run documentation](https://cloud.google.com/run/docs)
2. Review [Cloud Build logs](https://console.cloud.google.com/cloud-build/builds)
3. Check [Cloud Run logs](https://console.cloud.google.com/run)
4. Verify [IAM permissions](https://console.cloud.google.com/iam-admin)

---

**Happy Deploying! 🚀**
