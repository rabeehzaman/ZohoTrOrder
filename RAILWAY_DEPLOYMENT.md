# Railway Deployment Guide

This guide explains how to deploy the Transfer Order POS application on Railway with permanent authentication.

## Prerequisites

1. A Railway account
2. A Zoho Inventory account with API access
3. A Zoho OAuth application configured

## Initial Setup

### 1. Required Environment Variables

Set these in your Railway service settings:

```bash
# Zoho OAuth Credentials
ZOHO_CLIENT_ID=your_client_id
ZOHO_CLIENT_SECRET=your_client_secret
ZOHO_ORGANIZATION_ID=896180965

# Railway will automatically provide:
# PORT - The port your app should listen on
# RAILWAY_PUBLIC_DOMAIN - Your app's public URL
```

### 2. One-Time Authentication Setup

After deploying to Railway:

1. Visit your app: `https://your-app.up.railway.app`
2. Click "Login with Zoho" and complete OAuth flow
3. Visit: `https://your-app.up.railway.app/auth/tokens`
4. Copy the three environment variables shown
5. Add them to your Railway service:
   - `ZOHO_ACCESS_TOKEN`
   - `ZOHO_REFRESH_TOKEN`
   - `ZOHO_TOKEN_EXPIRES_AT`
6. Restart your Railway service

**That's it!** Your app will now stay authenticated permanently. The tokens will auto-refresh as needed.

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

## How It Works

1. **Initial Authentication**: One-time OAuth flow to get tokens
2. **Token Storage**: Tokens stored in Railway environment variables
3. **Automatic Refresh**: Access tokens refresh automatically before expiry
4. **Persistence**: Survives container restarts and redeployments

## Monitoring

- Health check: `https://your-app.up.railway.app/health`
- Auth status: `https://your-app.up.railway.app/auth/status`
- Token setup: `https://your-app.up.railway.app/auth/tokens` (after auth)

## Troubleshooting

### Authentication Issues

1. **"No refresh token available"**
   - Perform initial OAuth authentication
   - Visit `/auth/tokens` to get env vars
   - Add them to Railway

2. **"Invalid redirect URI"**
   - Ensure Zoho app has Railway URL as redirect URI
   - Check `/health` endpoint for current redirect URI

3. **Tokens not persisting**
   - Make sure you added all 3 env vars to Railway
   - Restart Railway service after adding vars

## Why This Works

This approach matches your working app's configuration:
- Static environment variables for tokens
- No complex Railway API integration needed
- Tokens persist across all restarts
- Simple one-time setup

## Security Notes

- Only visit `/auth/tokens` for initial setup
- Never share or commit tokens
- Tokens are encrypted in Railway's env vars
- Regular token refresh maintains security