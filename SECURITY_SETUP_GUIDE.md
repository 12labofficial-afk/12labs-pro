# 🔐 Security Setup & Environment Guide

## Quick Start

### 1. Install Git Hooks
```bash
npm install husky --save-dev
npx husky install
chmod +x .husky/pre-commit
```

This prevents you from accidentally committing secrets! 🛡️

### 2. Create Your Local .env Files
```bash
# Copy templates
cp .env.example .env
cp functions/.env.example functions/.env
```

### 3. Get Your Credentials
Each developer needs these from the team lead:

#### 🔥 Firebase (Local Development)
- **File:** `.env`
- **Variable:** `FIREBASE_SERVICE_ACCOUNT_KEY`
- **Value:** JSON string from Firebase Console
```
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
```

#### 🎨 Google Cloud / Gemini
- **File:** `.env`
- **Variable:** `GEMINI_API_KEY`
- **Value:** Your Google Cloud API key

#### 🌐 Hugging Face
- **File:** `server-files/.env` or Vercel env vars
- **Variable:** `HF_TOKEN`
- **Get from:** https://huggingface.co/settings/tokens

#### ☁️ Cloudflare R2
- **File:** `.env` or Vercel env vars
- **Variables:**
  - `R2_ACCOUNT_ID`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_BUCKET`
  - `R2_PUBLIC_URL`

#### 🚀 OpenRouter (Optional)
- **File:** `.env`
- **Variable:** `OPENROUTER_API_KEY`

---

## 📋 Environment Variables Reference

### Development (.env)
```bash
# Firebase
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"..."}
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com

# AI/ML APIs
GEMINI_API_KEY=your-gemini-key
OPENROUTER_API_KEY=your-openrouter-key
ROUTER=sk_... # Alternative to above

# Storage (R2/Cloudflare)
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET=12labs
R2_PUBLIC_URL=https://storage.example.com

# Hugging Face
HF_TOKEN=hf_...
HF_INTERNAL_API_KEY=your-internal-key

# Vertex AI
VERTEX_PROJECT_ID=your-gcp-project
VERTEX_LOCATION=us-central1

# Backend URLs
HQ_BACKEND_URL=http://localhost:7860
HF_SPACE_URL=http://localhost:7860
```

### Production (Vercel Env Vars)
Set these in Vercel Dashboard → Settings → Environment Variables:
```
FIREBASE_SERVICE_ACCOUNT_KEY
GEMINI_API_KEY
OPENROUTER_API_KEY
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET
R2_PUBLIC_URL
HF_TOKEN
HF_INTERNAL_API_KEY
```

---

## 🚫 What NOT to Commit

❌ **NEVER** commit:
- `.env` files
- `.env.local`, `.env.*.local`
- `*.pem`, `*.key`, `*.p8` files
- Files with passwords/tokens/credentials
- Firebase private keys
- AWS credentials
- API keys of any kind

✅ **Safe to commit:**
- `.env.example` (with placeholder values)
- `.gitignore`
- Documentation files
- Source code

---

## 🔑 Managing Secrets Safely

### ✅ DO THIS:
```typescript
// ✅ GOOD - Load from environment
const apiKey = process.env.GEMINI_API_KEY;
const bearerToken = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

// ✅ GOOD - Use at runtime
const response = await fetch(url, {
  headers: { "Authorization": `Bearer ${apiKey}` }
});
```

### ❌ DON'T DO THIS:
```typescript
// ❌ BAD - Hardcoded secrets
const apiKey = "sk_test_123456789";
const token = "Bearer eyJhbGc...";

// ❌ BAD - In strings
const url = `https://api.example.com?key=${secret}`;

// ❌ BAD - In comments
// My API key: sk_test_123456789
```

---

## 🔄 Local Development Workflow

### First Time Setup
```bash
# 1. Clone repo
git clone https://github.com/12labofficial-afk/12labs-pro.git
cd 12labs-pro

# 2. Install git hooks
npm install
npx husky install

# 3. Get credentials from team lead
# Ask for: FIREBASE_SERVICE_ACCOUNT_KEY, GEMINI_API_KEY, etc.

# 4. Create .env file
cp .env.example .env
# Edit .env and paste your credentials

# 5. Run the app
npm run dev
```

### Daily Development
```bash
# Your .env file is ignored by git
# Just work normally - secrets won't leak

# If you accidentally try to commit a secret:
git add .
git commit -m "my changes"
# ⚠️  Pre-commit hook will block it!
# Then remove the secret and try again
```

### Before Pushing
```bash
# Pre-commit hook runs automatically
# If it fails: check for secrets in your changes

git diff                          # See what you changed
git reset -- path/to/secret-file  # Unstage if needed
git checkout -- path/to/file      # Revert if needed
git commit -m "safe commit"
git push
```

---

## 🚨 If You Accidentally Commit a Secret

**Don't panic!** GitHub has detection, but follow these steps:

1. **Stop immediately** - Don't push yet
2. **Remove the secret**
   ```bash
   git reset HEAD~1              # Undo the commit
   git rm --cached .env          # Remove from git
   git add -A
   git commit -m "remove: .env file"
   ```
3. **Rotate the key**
   - If API key was committed: regenerate it
   - If password was committed: change it
   - If token was committed: revoke and create new one
4. **Push the fix**
   ```bash
   git push origin your-branch
   ```

---

## 🔍 Monitoring & Scanning

### Automated Checks
Our GitHub Actions automatically:
- 🔍 Scan for secrets in every commit
- 📦 Audit npm packages for vulnerabilities  
- ✅ Validate environment setup

### Manual Verification
```bash
# Check if any secrets would be exposed
git diff HEAD~1 HEAD | grep -i "key\|secret\|token"

# Scan your local changes
npx detect-secrets scan --all-files

# Check for hardcoded API keys
grep -r "sk_\|pk_\|AIza\|AKIA" . --include="*.ts" --include="*.js"
```

---

## 📚 Security Best Practices

### 1. Use Environment Variables
```typescript
// Always load from env
const secret = process.env.MY_SECRET;
if (!secret) throw new Error("MY_SECRET not set");
```

### 2. Mask Sensitive Data in Logs
```typescript
function maskSecret(value: string): string {
  return value.length > 6 ? `••••••${value.slice(-6)}` : '••••••';
}

console.log(`Using key: ${maskSecret(apiKey)}`);
```

### 3. Rotate Keys Regularly
- **API Keys:** Every 3 months
- **OAuth Tokens:** Auto-refreshed (handled by libraries)
- **Passwords:** Every 3 months

### 4. Principle of Least Privilege
- Give only needed permissions
- Use separate keys for dev/staging/production
- Revoke unused keys immediately

### 5. Audit Trail
- Log who accessed what (without logging secrets)
- Monitor API key usage
- Track environment changes

---

## 🆘 Troubleshooting

### Pre-commit hook not running?
```bash
# Make it executable
chmod +x .husky/pre-commit

# Reinstall hooks
npx husky install
```

### Getting "secret detected" but it's not a secret?
Edit `.husky/pre-commit` to refine the regex pattern.

### Forgot to set up .env?
```bash
# App will fail with clear error
# Just create .env and add the missing variable
cp .env.example .env
echo "MISSING_VAR=your_value" >> .env
```

### Need to update credentials?
```bash
# Edit your local .env file
nano .env

# Changes are safe - .env is in .gitignore
# Never git add .env
```

---

## 📞 Need Help?

1. **Credentials missing?** → Ask team lead
2. **Pre-commit hook errors?** → Check error message, often a false positive
3. **Secret accidentally committed?** → Follow "If You Accidentally Commit" section
4. **Not sure about a pattern?** → Ask in #security channel

---

## 🎯 Checklist for Contributors

- [ ] Git hooks installed (`npx husky install`)
- [ ] `.env` file created from `.env.example`
- [ ] All required credentials set
- [ ] `.env` is in `.gitignore` (it is by default)
- [ ] No secrets in code (only use `process.env.*`)
- [ ] Pre-commit hook passing locally
- [ ] No `.env` files in staged changes

---

**Last Updated:** 2026-09-09  
**Version:** 1.0
