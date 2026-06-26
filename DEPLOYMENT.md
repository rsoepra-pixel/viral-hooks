# Viral Hooks Generator - Netlify Deployment Guide

## Architecture

```
Browser (viral-hooks-netlify-backend.html)
         ↓
Netlify Frontend (same domain = no CORS)
         ↓
/.netlify/functions/generate-hooks.js (backend)
         ↓
Claude API (server-to-server, allowed)
```

## Files

- `viral-hooks-netlify-backend.html` - Frontend (no API key input)
- `netlify/functions/generate-hooks.js` - Backend function
- `netlify.toml` - Netlify config
- `.env.example` - Environment template

## Deployment Steps

### Step 1: Create Netlify Account
- Go to https://netlify.com
- Sign up with GitHub or email

### Step 2: Prepare Files Locally
```bash
# Create directory structure
mkdir viral-hooks
cd viral-hooks

# Copy these files to directory:
- viral-hooks-netlify-backend.html (rename to index.html)
- netlify/functions/generate-hooks.js
- netlify.toml
```

### Step 3: Initialize Git & Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/viral-hooks.git
git branch -M main
git push -u origin main
```

### Step 4: Connect to Netlify
1. Go to https://app.netlify.com
2. Click "New site from Git"
3. Select GitHub
4. Choose viral-hooks repository
5. Leave build settings default
6. Click "Deploy site"

### Step 5: Add Environment Variable
1. In Netlify dashboard → Site settings
2. Go to "Build & deploy" → "Environment"
3. Click "Edit variables"
4. Add:
   - Key: `CLAUDE_API_KEY`
   - Value: `sk-ant-xxxxxxxxxxxxxxxxxxxx` (your actual key)
5. Save and redeploy

### Step 6: Redeploy
1. Site settings → Deploys
2. Click "Trigger deploy" → "Deploy site"

## Testing

After deployment:
1. Go to your live URL (e.g., https://viral-hooks-12345.netlify.app)
2. Accept trial
3. Enter topic and audience
4. Click "Generate 100 Hooks"
5. Should work without any CORS errors

## Features

✅ API key stored securely on server (not in browser)
✅ No CORS errors (backend handles all API calls)
✅ 90-day trial with daily limits
✅ Full hook generation with 4 batches
✅ CSV & PDF export
✅ Category filtering

## Environment Variables

Only one required:
- `CLAUDE_API_KEY` - Your Anthropic API key

**Important:** Never commit .env file to git. Use Netlify environment variables only.

## Pricing

Netlify free tier includes:
- 100 deployments per day
- 300 minutes of function execution per month
- Perfect for this use case

## Support

If deployment fails:
1. Check Netlify deploy logs (Deploys tab)
2. Check function logs (Functions tab)
3. Verify API key in environment variables
4. Test API key validity at https://console.anthropic.com/usage

