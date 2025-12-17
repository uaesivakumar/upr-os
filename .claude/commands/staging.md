# Staging Deployment Validation

Run the staging deployment validation to ensure all services are properly configured and connected.

## Steps

1. Run the validation script:
```bash
./scripts/validate-deployment.sh staging
```

2. If any checks fail, report the specific failures and suggest fixes.

3. If all checks pass, confirm staging is ready for testing with the URLs:
   - SaaS: https://premiumradar-saas-staging-191599223867.us-central1.run.app
   - OS: https://upr-os-service-191599223867.us-central1.run.app

## Quick Fixes Reference

- Missing `PR_OS_TOKEN` in SaaS:
  ```bash
  gcloud run services update premiumradar-saas-staging --region us-central1 --update-secrets=PR_OS_TOKEN=PR_OS_TOKEN:latest
  ```

- Missing env var in OS:
  ```bash
  gcloud run services update upr-os-service --region us-central1 --update-secrets=VAR=SECRET:latest
  ```
