# 🔐 Secrets Rotation Schedule

Rotating secrets regularly reduces the risk of unauthorized access if a key is compromised.

## Rotation Schedule

| Secret | Frequency | Last Rotated | Next Rotation | Owner |
|--------|-----------|--------------|---------------|-------|
| **Firebase Service Account** | Every 6 months | — | — | DevOps |
| **Gemini API Key** | Every 3 months | — | — | AI Team |
| **OpenRouter API Key** | Every 3 months | — | — | AI Team |
| **Cloudflare R2 Keys** | Every 3 months | — | — | DevOps |
| **Hugging Face Token** | Every 3 months | — | — | AI Team |
| **GitHub Tokens** | Every 3 months | — | — | DevOps |
| **Database Credentials** | Every 6 months | — | — | DevOps |
| **OAuth Tokens** | Auto-refresh | N/A | N/A | System |

## How to Rotate a Secret

### Step 1: Generate New Secret
- Go to the service (Firebase, Google Cloud, Cloudflare, etc.)
- Generate a new key/token
- Keep both old and new for 1 hour overlap

### Step 2: Update Environment
```bash
# For local development
vim .env                    # Update YOUR local .env

# For production
# Use Vercel Dashboard or deploy service to update env vars
```

### Step 3: Test
- Run tests locally
- Deploy to staging
- Verify everything works

### Step 4: Update in All Places
- [ ] Local `.env` file
- [ ] Staging environment
- [ ] Production environment
- [ ] CI/CD secrets
- [ ] Team documentation (if needed)

### Step 5: Revoke Old Secret
After confirming new secret works:
- Go to the service console
- Delete/revoke the old key
- Confirm it's removed

### Step 6: Document
```bash
# Update the table above
- Secret: Your Secret Name
- Last Rotated: YYYY-MM-DD
- Next Rotation: YYYY-MM-DD (3 months from today)
```

## Checklist Before Rotation

- [ ] New secret generated successfully
- [ ] Can access it in service console
- [ ] Tests pass locally with new secret
- [ ] Old secret still works (for 1-hour overlap)
- [ ] No sensitive data in git history
- [ ] Team is notified (if shared secret)

## Checklist After Rotation

- [ ] New secret deployed to all environments
- [ ] All systems using new secret confirmed
- [ ] Old secret revoked/deleted
- [ ] Documentation updated
- [ ] Schedule next rotation (3-6 months from now)

## Emergency Rotation

If a secret is **compromised**:

1. **IMMEDIATELY revoke** the secret
2. **Generate new** secret
3. **Update ALL** systems within 15 minutes
4. **Notify** the security team
5. **Investigate** how it was leaked
6. **Audit** usage logs

---

## Service-Specific Instructions

### Firebase
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Project Settings → Service Accounts
3. Click "Generate New Private Key"
4. Download the JSON
5. Update `FIREBASE_SERVICE_ACCOUNT_KEY` with JSON content

### Google Cloud / Gemini
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. APIs & Services → Credentials
3. Click the key name → Edit → Regenerate
4. Copy new key
5. Update `GEMINI_API_KEY`

### OpenRouter
1. Go to [OpenRouter Settings](https://openrouter.ai/account/api-keys)
2. Click "Create New Key"
3. Copy the new key
4. Delete old key
5. Update `OPENROUTER_API_KEY`

### Cloudflare R2
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. R2 → API Tokens
3. Create new token (with appropriate permissions)
4. Copy credentials
5. Update `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`
6. Delete old token

### Hugging Face
1. Go to [HuggingFace Settings](https://huggingface.co/settings/tokens)
2. Click "New token"
3. Create with appropriate permissions
4. Copy token
5. Delete old token
6. Update `HF_TOKEN`

---

## Automation (Optional)

You can automate rotation with tools like:
- **Vault** (HashiCorp) - For on-premise
- **AWS Secrets Manager** - For AWS-based apps
- **GitHub Actions** - With scheduled workflow

Example GitHub Actions rotation (advanced):
```yaml
name: 🔄 Rotate Secrets

on:
  schedule:
    - cron: '0 0 1 */3 *'  # First day of every 3 months

jobs:
  rotate:
    runs-on: ubuntu-latest
    steps:
      - name: Notify team
        run: echo "⚠️  Time to rotate secrets! See docs/SECRETS_ROTATION_SCHEDULE.md"
```

---

## Monitoring & Alerts

### What to Monitor
- [ ] Failed authentication attempts
- [ ] Unusual API usage patterns
- [ ] Calls from unexpected IPs
- [ ] Expired credentials (set calendar reminders)

### Set Reminders
- **Google Calendar:** Add "Rotate secrets" event
- **Slack Reminder:** `/remind #security "Rotate secrets" in 3 months`
- **GitHub Issues:** Create quarterly reminder issues

---

## Questions?

1. **"What if I rotate a secret but forget to update one service?"**
   - That service will fail with authentication error
   - Check the service logs to identify it
   - Update the service and retry

2. **"Can I use the old secret while rolling out the new one?"**
   - Yes! Keep old secret for 1 hour overlap
   - Allows gradual rollout
   - Then revoke old secret

3. **"What about OAuth tokens?"**
   - These auto-refresh in code
   - No manual rotation needed
   - System handles it automatically

4. **"Should I tell the team when I rotate?"**
   - Yes, especially if it's a shared secret
   - Send a quick Slack message
   - Makes debugging easier if something breaks

---

**Remember:** Regular rotation is a best practice, not optional! 🔐
