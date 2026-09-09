# 🔐 Security Policy

## Reporting Security Issues

**Please DO NOT open public GitHub issues for security vulnerabilities.**

If you discover a security vulnerability, please email: **security@12labs.io** with:

1. **Description** of the vulnerability
2. **Location** in code (file, line number, or component)
3. **Steps to reproduce** (if applicable)
4. **Potential impact** (what could go wrong?)
5. **Suggested fix** (optional)

We will:
- Acknowledge receipt within 24 hours
- Investigate and confirm the issue
- Develop a fix
- Credit you in the fix commit (if you want)
- Release a patched version

---

## Security Best Practices

### 1. 🔐 Secrets Management
- Never commit `.env` files
- Use environment variables for all secrets
- Use `.env.example` with placeholder values
- Rotate secrets every 3 months
- See [SECURITY_SETUP_GUIDE.md](../SECURITY_SETUP_GUIDE.md)

### 2. 🔑 API Keys
- Generate new keys for each environment (dev/staging/prod)
- Use keys with minimal permissions needed
- Revoke unused keys immediately
- Mask API keys in logs (show only last 6 chars)
- Rotate every 3 months

### 3. 🚫 Code Security
```typescript
// ✅ GOOD
const secret = process.env.API_KEY;

// ❌ BAD
const secret = "sk_test_12345";
```

### 4. 🔄 Dependency Security
```bash
# Scan for vulnerabilities
npm audit
npm audit fix  # For auto-fixable issues

# Keep dependencies updated
npm update

# Review before major upgrades
npm outdated
```

### 5. 🔐 Database Security
- Never log queries with sensitive data
- Use parameterized queries (prevents SQL injection)
- Encrypt sensitive data at rest
- Use strong passwords for database accounts
- Limit database access by role

### 6. 📡 API Security
- Validate all user input
- Use HTTPS only (enforce in production)
- Implement rate limiting
- Require authentication for protected endpoints
- CORS: Only allow trusted origins
- Add `Strict-Transport-Security` header

### 7. 👥 Authentication
- Use Firebase Auth (we do this ✅)
- Enable multi-factor authentication (MFA)
- Never store plaintext passwords
- Use strong password requirements
- Session timeout after inactivity

### 8. 📝 Logging & Monitoring
```javascript
// ✅ Safe logging
console.log("User action:", userId, action);

// ❌ Unsafe logging
console.log("User login:", email, password);
```

---

## Pre-Commit Checks

Our pre-commit hook automatically prevents:
- ❌ Hardcoded API keys
- ❌ `.env` files
- ❌ Credential files
- ❌ Private keys

If the hook blocks your commit:
1. Review what you're committing
2. Remove the sensitive data
3. Try again

---

## Automated Security Scanning

We run:
- **TruffleHog** - Detects hardcoded secrets
- **GitGuardian** - Finds leaked credentials
- **npm audit** - Checks for vulnerable packages
- **GitHub Actions** - Validates environment setup

Check `.github/workflows/secret-scan.yml` for details.

---

## Security Checklist for Developers

Before pushing code:

- [ ] No `.env` files committed
- [ ] No hardcoded API keys
- [ ] No passwords in code
- [ ] No credentials in comments
- [ ] Environment variables only for secrets
- [ ] Pre-commit hook passed
- [ ] No new dependencies with vulnerabilities
- [ ] Input validation on user data
- [ ] No sensitive data in logs
- [ ] HTTPS used in production
- [ ] Database queries are parameterized
- [ ] Error messages don't leak information

---

## Production Deployment

Before deploying:

1. **Code Review**
   - ✅ At least 1 approval
   - ✅ No security issues found
   - ✅ Tests passing

2. **Secrets Set**
   - ✅ All env vars configured
   - ✅ Credentials in Vercel/hosting platform
   - ✅ Not in git repository

3. **Dependencies Updated**
   - ✅ `npm audit` passes
   - ✅ No known vulnerabilities

4. **Tests Pass**
   - ✅ Unit tests
   - ✅ Integration tests
   - ✅ E2E tests

5. **Monitoring Ready**
   - ✅ Error tracking enabled
   - ✅ Logging configured
   - ✅ Alerts set up

---

## Incident Response

If a security incident occurs:

1. **Immediate Actions** (within 1 hour)
   - [ ] Identify the issue
   - [ ] Stop the bleeding (revoke compromised keys)
   - [ ] Notify stakeholders

2. **Investigation** (within 24 hours)
   - [ ] How did it happen?
   - [ ] What was affected?
   - [ ] Who had access?

3. **Fix & Prevent** (within 72 hours)
   - [ ] Patch the vulnerability
   - [ ] Deploy fix to production
   - [ ] Update security documentation

4. **Communication**
   - [ ] Notify affected users
   - [ ] Explain what happened
   - [ ] Explain what we fixed
   - [ ] Provide remediation steps

---

## Security Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Firebase Security](https://firebase.google.com/docs/security)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [GitHub Security Features](https://github.com/features/security)

---

## Questions?

- **Security concerns?** → Email security@12labs.io
- **How to set up secrets?** → See [SECURITY_SETUP_GUIDE.md](../SECURITY_SETUP_GUIDE.md)
- **Rotating secrets?** → See [SECRETS_ROTATION_SCHEDULE.md](../docs/SECRETS_ROTATION_SCHEDULE.md)
- **Pre-commit hook issues?** → Check `.husky/pre-commit`

---

**Last Updated:** 2026-09-09  
**Status:** ✅ Active & Maintained
