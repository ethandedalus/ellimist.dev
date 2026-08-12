#!/usr/bin/env bash
#
# One-time setup so GitHub Actions can deploy this site to Firebase Hosting
# using Workload Identity Federation. No service-account key is created, so
# there is nothing long-lived to store in GitHub or to rotate later.
#
# Safe to re-run: every step checks for the resource before creating it.
#
# Prerequisites:
#   - gcloud installed, authenticated as a principal with Owner (or at least
#     IAM Admin + Service Usage Admin) on the target project
#   - the GitHub repo already exists
#
# Usage:
#   ./scripts/setup-wif.sh
#   PROJECT_ID=other-project REPO=owner/repo ./scripts/setup-wif.sh
#
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-ellimist}"
REPO="${REPO:-ethandedalus/ellimist.dev}"
POOL_ID="${POOL_ID:-github}"
PROVIDER_ID="${PROVIDER_ID:-github-actions}"
SA_ID="${SA_ID:-firebase-deploy}"

SA_EMAIL="${SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "==> Project: ${PROJECT_ID}"
echo "==> Repo:    ${REPO}"
echo

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
if [[ -z "${PROJECT_NUMBER}" ]]; then
	echo "Could not read project ${PROJECT_ID}. Wrong project, or wrong account?" >&2
	exit 1
fi

echo "==> Enabling required APIs (no-op if already on)"
gcloud services enable \
	iam.googleapis.com \
	iamcredentials.googleapis.com \
	sts.googleapis.com \
	firebasehosting.googleapis.com \
	--project "${PROJECT_ID}"

echo "==> Service account"
if gcloud iam service-accounts describe "${SA_EMAIL}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
	echo "    exists: ${SA_EMAIL}"
else
	gcloud iam service-accounts create "${SA_ID}" \
		--project "${PROJECT_ID}" \
		--display-name "Firebase Hosting deploys from GitHub Actions"
	echo "    created: ${SA_EMAIL}"
fi

echo "==> Roles"
# add-iam-policy-binding is idempotent, so this is safe to repeat.
for role in roles/firebasehosting.admin roles/firebase.viewer; do
	gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
		--member "serviceAccount:${SA_EMAIL}" \
		--role "${role}" \
		--condition=None \
		--quiet >/dev/null
	echo "    granted: ${role}"
done

echo "==> Workload identity pool"
if gcloud iam workload-identity-pools describe "${POOL_ID}" \
	--project "${PROJECT_ID}" --location global >/dev/null 2>&1; then
	echo "    exists: ${POOL_ID}"
else
	gcloud iam workload-identity-pools create "${POOL_ID}" \
		--project "${PROJECT_ID}" \
		--location global \
		--display-name "GitHub Actions"
	echo "    created: ${POOL_ID}"
fi

echo "==> OIDC provider"
if gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
	--project "${PROJECT_ID}" --location global \
	--workload-identity-pool "${POOL_ID}" >/dev/null 2>&1; then
	echo "    exists: ${PROVIDER_ID}"
	echo "    NOTE: an existing provider is not updated. If you changed REPO,"
	echo "          delete it first or the old attribute-condition still applies."
else
	# The attribute-condition is the entire security boundary. Without it, any
	# repository on GitHub could mint tokens for this service account. Google
	# refuses to create the provider without one when attribute.repository is
	# mapped, which is the behaviour we want.
	gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
		--project "${PROJECT_ID}" \
		--location global \
		--workload-identity-pool "${POOL_ID}" \
		--display-name "GitHub OIDC" \
		--issuer-uri "https://token.actions.githubusercontent.com" \
		--attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref" \
		--attribute-condition "assertion.repository == '${REPO}'"
	echo "    created: ${PROVIDER_ID}"
fi

echo "==> Allowing ${REPO} to impersonate ${SA_ID}"
# Scoped to this repository. To tighten further to a single branch, swap
# attribute.repository/${REPO} for attribute.ref/refs/heads/main — but that
# also blocks pull-request preview deploys, if you add them later.
gcloud iam service-accounts add-iam-policy-binding "${SA_EMAIL}" \
	--project "${PROJECT_ID}" \
	--role roles/iam.workloadIdentityUser \
	--member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${REPO}" \
	--quiet >/dev/null
echo "    bound"

WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

cat <<EOF

──────────────────────────────────────────────────────────────────────────────
Done. Set these two as repository *variables* (not secrets — neither is
sensitive, and the workflow reads them from \`vars\`):

  WIF_PROVIDER         ${WIF_PROVIDER}
  WIF_SERVICE_ACCOUNT  ${SA_EMAIL}

With the gh CLI:

  gh variable set WIF_PROVIDER --repo ${REPO} \\
    --body "${WIF_PROVIDER}"
  gh variable set WIF_SERVICE_ACCOUNT --repo ${REPO} \\
    --body "${SA_EMAIL}"

Then merge to main, or run the workflow manually from the Actions tab.
──────────────────────────────────────────────────────────────────────────────
EOF
