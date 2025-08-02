# Railway Deployment Guide

This guide explains how to deploy the Transfer Order POS application on Railway with proper OAuth configuration and token persistence.

## Prerequisites

1. A Railway account
2. A Zoho Inventory account with API access
3. A Zoho OAuth application configured

## Environment Variables

### Required Variables

Set these in your Railway service settings:

```bash
# Zoho OAuth Credentials
ZOHO_CLIENT_ID=your_client_id
ZOHO_CLIENT_SECRET=your_client_secret
ZOHO_ORGANIZATION_ID=your_org_id

# Railway will automatically provide:
# PORT - The port your app should listen on
# RAILWAY_PUBLIC_DOMAIN - Your app's public URL (e.g., app-name.up.railway.app)
```

### Optional Variables for Enhanced Features

```bash
# For automatic token persistence to Railway env vars
RAILWAY_API_TOKEN=your_railway_api_token
RAILWAY_SERVICE_ID=your_service_id

# Override redirect URI if needed (auto-detected by default)
ZOHO_REDIRECT_URI=https://your-app.up.railway.app/auth/callback
```

## Getting Railway API Credentials

To enable automatic token persistence:

1. Go to your Railway project settings
2. Generate a new API token
3. Find your service ID in the Railway dashboard URL
4. Add both as environment variables

## Zoho OAuth App Configuration

1. In your Zoho OAuth app settings, add the redirect URI:
   ```
   https://your-app-name.up.railway.app/auth/callback
   ```

2. Make sure to add both development and production URLs:
   - `http://localhost:3000/auth/callback` (for local development)
   - `https://your-app-name.up.railway.app/auth/callback` (for Railway)

## Deployment Steps

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Add Railway deployment configuration"
   git push origin main
   ```

2. **Create Railway Project**
   - Go to Railway dashboard
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository

3. **Configure Environment Variables**
   - Go to your service settings
   - Add all required environment variables
   - Railway will automatically detect the PORT

4. **First-Time Authentication**
   - Visit `https://your-app.up.railway.app/`
   - Click "Login with Zoho"
   - Complete OAuth flow
   - Tokens will be automatically saved

## How Token Persistence Works

1. **Local Development**: Tokens saved to `tokens.json` file
2. **Railway Deployment**: 
   - Tokens saved to Railway environment variables (if API token provided)
   - Falls back to memory storage if Railway API not configured
   - Automatically refreshes tokens before expiry

## Monitoring

- Health check: `https://your-app.up.railway.app/health`
- Auth status: `https://your-app.up.railway.app/auth/status`

## Troubleshooting

### Authentication Issues

1. **Check redirect URI mismatch**
   - Visit `/health` endpoint
   - Verify `redirectUri` matches Zoho app settings

2. **Token refresh failures**
   - Check Railway logs
   - Ensure refresh token is valid
   - Re-authenticate if needed

3. **Container restarts losing auth**
   - Enable Railway API token persistence
   - Or use external database storage

### Common Errors

- **"No refresh token available"**: Re-authenticate through OAuth flow
- **"Invalid redirect URI"**: Update Zoho app with Railway URL
- **"Token expired"**: Should auto-refresh, check logs if not

## Security Notes

- Never commit tokens to Git
- Use Railway's environment variables for secrets
- Enable HTTPS (Railway provides by default)
- Regularly rotate API credentials