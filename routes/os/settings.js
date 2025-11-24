/**
 * OS Settings API Endpoints
 * Sprint 67: OS Settings Unification Layer
 */

import express from 'express';
import { osResponse, osError, OS_OPERATION_TYPES } from './types.js';
import { createSettingsService } from '../../server/services/settingsService.js';

const router = express.Router();

/**
 * GET /api/os/settings
 * Get all settings for tenant
 */
router.get('/', async (req, res) => {
  const tenantId = req.tenantId || req.user?.tenant_id;
  const settings = createSettingsService(tenantId);

  try {
    const allSettings = await settings.getAllSettings();

    return res.json(osResponse({
      operation: 'settings_get_all',
      settings: allSettings
    }));

  } catch (error) {
    console.error('[OS Settings] Error getting all settings:', error);
    return res.status(500).json(osError('Failed to get settings', 'SETTINGS_ERROR'));
  }
});

/**
 * GET /api/os/settings/category/:category
 * Get all settings for a category
 */
router.get('/category/:category', async (req, res) => {
  const { category } = req.params;
  const tenantId = req.tenantId || req.user?.tenant_id;
  const settings = createSettingsService(tenantId);

  try {
    const categorySettings = await settings.getCategory(category);

    return res.json(osResponse({
      operation: 'settings_get_category',
      category,
      settings: categorySettings
    }));

  } catch (error) {
    console.error('[OS Settings] Error getting category:', error);
    return res.status(500).json(osError('Failed to get category settings', 'SETTINGS_ERROR'));
  }
});

/**
 * GET /api/os/settings/:category/:key
 * Get single setting
 */
router.get('/:category/:key', async (req, res) => {
  const { category, key } = req.params;
  const tenantId = req.tenantId || req.user?.tenant_id;
  const settings = createSettingsService(tenantId);

  try {
    const value = await settings.getSetting(category, key);

    if (value === null) {
      return res.status(404).json(osError('Setting not found', 'SETTING_NOT_FOUND'));
    }

    return res.json(osResponse({
      operation: 'settings_get',
      category,
      key,
      value
    }));

  } catch (error) {
    console.error('[OS Settings] Error getting setting:', error);
    return res.status(500).json(osError('Failed to get setting', 'SETTINGS_ERROR'));
  }
});

/**
 * PUT /api/os/settings/:category/:key
 * Set single setting
 */
router.put('/:category/:key', async (req, res) => {
  const { category, key } = req.params;
  const { value, valueType, description } = req.body;
  const tenantId = req.tenantId || req.user?.tenant_id;
  const updatedBy = req.user?.id || req.user?.email || 'system';
  const settings = createSettingsService(tenantId);

  try {
    const success = await settings.setSetting(category, key, value, {
      valueType,
      description,
      updatedBy
    });

    if (!success) {
      return res.status(400).json(osError('Failed to update setting (may be readonly)', 'SETTING_READONLY'));
    }

    return res.json(osResponse({
      operation: 'settings_set',
      category,
      key,
      value
    }));

  } catch (error) {
    console.error('[OS Settings] Error setting value:', error);
    return res.status(500).json(osError('Failed to set setting', 'SETTINGS_ERROR'));
  }
});

/**
 * GET /api/os/settings/scoring/profiles
 * Get all scoring profiles
 */
router.get('/scoring/profiles', async (req, res) => {
  const tenantId = req.tenantId || req.user?.tenant_id;
  const settings = createSettingsService(tenantId);

  try {
    const profileNames = ['default', 'banking_employee', 'banking_corporate', 'insurance_individual', 'recruitment_hiring', 'saas_b2b'];
    const profiles = await Promise.all(
      profileNames.map(name => settings.getScoringProfile(name))
    );

    return res.json(osResponse({
      operation: 'scoring_profiles_list',
      profiles
    }));

  } catch (error) {
    console.error('[OS Settings] Error getting scoring profiles:', error);
    return res.status(500).json(osError('Failed to get scoring profiles', 'SETTINGS_ERROR'));
  }
});

/**
 * GET /api/os/settings/scoring/:profile
 * Get scoring profile
 */
router.get('/scoring/:profile', async (req, res) => {
  const { profile } = req.params;
  const tenantId = req.tenantId || req.user?.tenant_id;
  const settings = createSettingsService(tenantId);

  try {
    const scoringProfile = await settings.getScoringProfile(profile);

    return res.json(osResponse({
      operation: 'scoring_profile_get',
      profile: scoringProfile
    }));

  } catch (error) {
    console.error('[OS Settings] Error getting scoring profile:', error);
    return res.status(500).json(osError('Failed to get scoring profile', 'SETTINGS_ERROR'));
  }
});

/**
 * PUT /api/os/settings/scoring/:profile
 * Update scoring profile
 */
router.put('/scoring/:profile', async (req, res) => {
  const { profile } = req.params;
  const updates = req.body;
  const tenantId = req.tenantId || req.user?.tenant_id;
  const settings = createSettingsService(tenantId);

  try {
    const success = await settings.updateScoringProfile(profile, updates);

    if (!success) {
      return res.status(400).json(osError('No valid updates provided', 'INVALID_UPDATE'));
    }

    const updatedProfile = await settings.getScoringProfile(profile);

    return res.json(osResponse({
      operation: 'scoring_profile_update',
      profile: updatedProfile
    }));

  } catch (error) {
    console.error('[OS Settings] Error updating scoring profile:', error);
    return res.status(500).json(osError('Failed to update scoring profile', 'SETTINGS_ERROR'));
  }
});

/**
 * GET /api/os/settings/discovery
 * Get discovery settings
 */
router.get('/discovery', async (req, res) => {
  const tenantId = req.tenantId || req.user?.tenant_id;
  const settings = createSettingsService(tenantId);

  try {
    const discoverySettings = await settings.getDiscoverySettings();

    return res.json(osResponse({
      operation: 'discovery_settings_get',
      settings: discoverySettings
    }));

  } catch (error) {
    console.error('[OS Settings] Error getting discovery settings:', error);
    return res.status(500).json(osError('Failed to get discovery settings', 'SETTINGS_ERROR'));
  }
});

/**
 * GET /api/os/settings/outreach
 * Get outreach settings
 */
router.get('/outreach', async (req, res) => {
  const tenantId = req.tenantId || req.user?.tenant_id;
  const settings = createSettingsService(tenantId);

  try {
    const outreachSettings = await settings.getOutreachSettings();

    return res.json(osResponse({
      operation: 'outreach_settings_get',
      settings: outreachSettings
    }));

  } catch (error) {
    console.error('[OS Settings] Error getting outreach settings:', error);
    return res.status(500).json(osError('Failed to get outreach settings', 'SETTINGS_ERROR'));
  }
});

/**
 * GET /api/os/settings/verticals
 * Get all verticals
 */
router.get('/verticals', async (req, res) => {
  const tenantId = req.tenantId || req.user?.tenant_id;
  const settings = createSettingsService(tenantId);

  try {
    const verticals = await settings.getVerticals();

    return res.json(osResponse({
      operation: 'verticals_list',
      verticals
    }));

  } catch (error) {
    console.error('[OS Settings] Error getting verticals:', error);
    return res.status(500).json(osError('Failed to get verticals', 'SETTINGS_ERROR'));
  }
});

/**
 * GET /api/os/settings/verticals/:id
 * Get single vertical
 */
router.get('/verticals/:id', async (req, res) => {
  const { id } = req.params;
  const tenantId = req.tenantId || req.user?.tenant_id;
  const settings = createSettingsService(tenantId);

  try {
    const vertical = await settings.getVertical(id);

    if (!vertical) {
      return res.status(404).json(osError('Vertical not found', 'VERTICAL_NOT_FOUND'));
    }

    return res.json(osResponse({
      operation: 'vertical_get',
      vertical
    }));

  } catch (error) {
    console.error('[OS Settings] Error getting vertical:', error);
    return res.status(500).json(osError('Failed to get vertical', 'SETTINGS_ERROR'));
  }
});

/**
 * GET /api/os/settings/personas
 * Get all personas
 */
router.get('/personas', async (req, res) => {
  const tenantId = req.tenantId || req.user?.tenant_id;
  const settings = createSettingsService(tenantId);

  try {
    const personas = await settings.getPersonas();

    return res.json(osResponse({
      operation: 'personas_list',
      personas
    }));

  } catch (error) {
    console.error('[OS Settings] Error getting personas:', error);
    return res.status(500).json(osError('Failed to get personas', 'SETTINGS_ERROR'));
  }
});

export default router;
