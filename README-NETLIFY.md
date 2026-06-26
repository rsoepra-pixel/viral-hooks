# Viral Hooks Generator - Netlify Backend Version

## What's Fixed

✅ **CORS Issue SOLVED**
- No more "Failed to fetch" errors
- Backend handles all API calls
- Browser → Netlify (same domain) → Claude API (server-to-server)

✅ **Security Improved**
- API key stored on server only
- Never exposed to browser
- Users never input API key

✅ **Production Ready**
- Error handling
- Timeout protection (60s)
- Logging for debugging
- Environment variables for secrets

## Architecture

```
BEFORE (Failed):
Browser ❌→ Claude API (CORS blocks this)

AFTER (Works):
Browser ✅→ Netlify Function ✅→ Claude API
(same domain)      (server-to-server)
```

## Files Included

1. **viral-hooks-netlify-backend.html** - Frontend UI
2. **netlify/functions/generate-hooks.js** - Backend function
3. **netlify.toml** - Netlify configuration
4. **.env.example** - Environment template
5. **DEPLOYMENT.md** - Step-by-step deployment guide

## Quick Start

### Option A: Git + GitHub (Recommended)

```bash
# 1. Clone or download files to your computer
cd viral-hooks-folder

# 2. Initialize git
git init
git add .
git commit -m "Initial commit"

# 3. Create repo on GitHub
# Then:
git remote add origin https://github.com/YOUR_USERNAME/viral-hooks.git
git push -u origin main

# 4. Connect to Netlify
# - Go to app.netlify.com
# - "New site from Git"
# - Select GitHub repo
# - Deploy

# 5. Add environment variable in Netlify
# - CLAUDE_API_KEY = sk-ant-xxxxx
# - Redeploy
```

### Option B: Netlify CLI (Advanced)

```bash
npm install -g netlify-cli
cd viral-hooks-folder
netlify deploy --prod
```

## After Deployment

1. Go to live URL
2. Accept trial
3. Enter topic
4. Click "Generate 100 Hooks"
5. ✅ Should work perfectly

## Why This Works Now

The fundamental issue was **architecture**, not code:

❌ Client-side apps cannot call external APIs directly
❌ CORS is a browser security feature, not a bug
❌ API keys must never be exposed to browser

✅ Backend function solves all three problems
✅ Browser calls local endpoint (no CORS)
✅ Function calls Claude API (allowed)
✅ API key stored securely on server

## Troubleshooting

**"Function not found" error**
- Check netlify.toml exists in root
- Verify netlify/functions/ directory structure
- Redeploy

**"API key error"**
- Verify CLAUDE_API_KEY in Netlify environment variables
- Check key format (must start with sk-ant-)
- Test key validity on console.anthropic.com

**Still getting CORS error**
- Clear browser cache
- Hard refresh (Ctrl+Shift+R)
- Check Netlify deploy was successful

## Support & Questions

For issues:
1. Check Netlify deploy logs
2. Check function logs
3. Verify environment variables
4. Test API key manually

Good luck! 🚀

