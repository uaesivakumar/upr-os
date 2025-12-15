/**
 * GCP Secrets Manager Service
 * Sprint 56: AI Super Admin - Secrets Management
 *
 * Provides secure access to API keys stored in GCP Secret Manager.
 * Caches secrets to minimize API calls.
 */

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'applied-algebra-474804-e6';

// Secret name to provider slug mapping
// Note: LinkedIn MCP and SalesNav MCP don't need API keys (they use MCP protocols)
const SECRET_MAPPING = {
  'APOLLO_API_KEY': 'apollo',
  'NEVERBOUNCE_API_KEY': 'neverbounce',
  'SERPAPI_KEY': 'serp_api',  // GCP uses SERPAPI_KEY
  'OPENAI_API_KEY': 'openai',
  'ANTHROPIC_API_KEY': 'anthropic',
};

// In-memory cache with TTL
const secretCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Singleton client
let client = null;

function getClient() {
  if (!client) {
    client = new SecretManagerServiceClient();
  }
  return client;
}

/**
 * Get a secret value from GCP Secret Manager
 * @param {string} secretName - Name of the secret (e.g., 'APOLLO_API_KEY')
 * @param {string} version - Version of the secret (default: 'latest')
 * @returns {Promise<string|null>} The secret value or null if not found
 */
export async function getSecret(secretName, version = 'latest') {
  // Check cache first
  const cacheKey = `${secretName}:${version}`;
  const cached = secretCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  try {
    const secretClient = getClient();
    const name = `projects/${PROJECT_ID}/secrets/${secretName}/versions/${version}`;

    const [response] = await secretClient.accessSecretVersion({ name });
    const payload = response.payload.data.toString('utf8');

    // Cache the result
    secretCache.set(cacheKey, {
      value: payload,
      expiresAt: Date.now() + CACHE_TTL
    });

    return payload;
  } catch (error) {
    if (error.code === 5) {
      // NOT_FOUND - secret doesn't exist
      console.warn(`Secret ${secretName} not found in GCP Secret Manager`);
      return null;
    }
    console.error(`Error accessing secret ${secretName}:`, error.message);
    throw error;
  }
}

/**
 * Get API key for a provider
 * @param {string} providerSlug - Provider slug (e.g., 'apollo', 'neverbounce')
 * @returns {Promise<string|null>} The API key or null if not configured
 */
export async function getProviderApiKey(providerSlug) {
  // Find secret name for provider
  const secretName = Object.entries(SECRET_MAPPING)
    .find(([, slug]) => slug === providerSlug)?.[0];

  if (!secretName) {
    console.warn(`No secret mapping for provider: ${providerSlug}`);
    return null;
  }

  return getSecret(secretName);
}

/**
 * List all secrets in the project
 * @returns {Promise<Array<{name: string, provider: string, hasLatestVersion: boolean}>>}
 */
export async function listSecrets() {
  try {
    const secretClient = getClient();
    const [secrets] = await secretClient.listSecrets({
      parent: `projects/${PROJECT_ID}`
    });

    return secrets.map(secret => {
      const name = secret.name.split('/').pop();
      return {
        name,
        provider: SECRET_MAPPING[name] || null,
        createTime: secret.createTime
      };
    });
  } catch (error) {
    console.error('Error listing secrets:', error.message);
    throw error;
  }
}

/**
 * Check if a secret exists
 * @param {string} secretName - Name of the secret
 * @returns {Promise<boolean>}
 */
export async function secretExists(secretName) {
  try {
    const secretClient = getClient();
    await secretClient.getSecret({
      name: `projects/${PROJECT_ID}/secrets/${secretName}`
    });
    return true;
  } catch (error) {
    if (error.code === 5) {
      return false;
    }
    throw error;
  }
}

/**
 * Create a new secret
 * @param {string} secretName - Name of the secret
 * @param {string} value - Secret value
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function createSecret(secretName, value) {
  try {
    const secretClient = getClient();

    // Create the secret
    await secretClient.createSecret({
      parent: `projects/${PROJECT_ID}`,
      secretId: secretName,
      secret: {
        replication: {
          automatic: {}
        }
      }
    });

    // Add the first version
    await secretClient.addSecretVersion({
      parent: `projects/${PROJECT_ID}/secrets/${secretName}`,
      payload: {
        data: Buffer.from(value, 'utf8')
      }
    });

    return { success: true, message: `Secret ${secretName} created` };
  } catch (error) {
    console.error('Error creating secret:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Update a secret (add new version)
 * @param {string} secretName - Name of the secret
 * @param {string} value - New secret value
 * @returns {Promise<{success: boolean, message: string, version: string}>}
 */
export async function updateSecret(secretName, value) {
  try {
    const secretClient = getClient();

    const [version] = await secretClient.addSecretVersion({
      parent: `projects/${PROJECT_ID}/secrets/${secretName}`,
      payload: {
        data: Buffer.from(value, 'utf8')
      }
    });

    // Invalidate cache
    for (const key of secretCache.keys()) {
      if (key.startsWith(`${secretName}:`)) {
        secretCache.delete(key);
      }
    }

    const versionNumber = version.name.split('/').pop();
    return { success: true, message: `Secret ${secretName} updated`, version: versionNumber };
  } catch (error) {
    console.error('Error updating secret:', error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Get all provider API key status (configured or not)
 * @returns {Promise<Array<{provider: string, secretName: string, configured: boolean}>>}
 */
export async function getProviderKeyStatus() {
  const results = [];

  for (const [secretName, provider] of Object.entries(SECRET_MAPPING)) {
    const configured = await secretExists(secretName);
    results.push({ provider, secretName, configured });
  }

  return results;
}

/**
 * Clear the secret cache
 */
export function clearCache() {
  secretCache.clear();
}

export default {
  getSecret,
  getProviderApiKey,
  listSecrets,
  secretExists,
  createSecret,
  updateSecret,
  getProviderKeyStatus,
  clearCache,
  SECRET_MAPPING
};
