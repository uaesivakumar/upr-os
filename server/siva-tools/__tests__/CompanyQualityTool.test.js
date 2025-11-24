/**
 * CompanyQualityTool tests with mocked dependencies.
 */

const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

jest.mock('../../db.js', () => ({
  __esModule: true,
  default: { query: jest.fn().mockResolvedValue({ rows: [] }) },
  query: jest.fn().mockResolvedValue({ rows: [] })
}), { virtual: true });

jest.mock('../agent-core/rule-engine', () => ({
  RuleEngine: class {
    async execute() {
      return {
        result: { score: 75, confidence: 0.85 },
        version: 'mock-rule',
        executionTimeMs: 5
      };
    }
  }
}), { virtual: true });

const CompanyQualityTool = require('../CompanyQualityTool');

describe('CompanyQualityTool - SIVA Primitive 1', () => {
  let tool;
  let warnSpy;

  const baseInput = {
    company_name: 'Test Co',
    domain: 'test.com',
    industry: 'Technology',
    uae_signals: { has_ae_domain: true, has_uae_address: true },
    size_bucket: 'scaleup',
    salary_indicators: { salary_level: 'high' }
  };

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    tool = new CompanyQualityTool();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns strict output with required fields for valid input', async () => {
    const result = await tool.execute(baseInput);

    expect(result.success).toBe(true);
    expect(result.data.quality_score).toBeGreaterThanOrEqual(0);
    expect(result.data.quality_score).toBeLessThanOrEqual(100);
    expect(Array.isArray(result.data.reasoning)).toBe(true);
    expect(result.data.policy_version).toBe('v1.0');
    expect(result.data.confidence).toBeGreaterThanOrEqual(0);
    expect(result.data.confidence).toBeLessThanOrEqual(1);
    expect(result.data._meta.tool_type).toBe('STRICT');
    expect(result.data._meta.tool_name).toBe('evaluate_company_quality');
    expect(typeof result.data.timestamp).toBe('string');
  });

  it('applies enterprise exclusion edge case', async () => {
    const result = await tool.execute({
      ...baseInput,
      company_name: 'Emirates',
      domain: 'emirates.ae',
      size_bucket: 'enterprise'
    });

    expect(result.data.edge_cases_applied).toContain('ENTERPRISE_BRAND_EXCLUSION');
    expect(result.data.quality_score).toBeLessThanOrEqual(20);
  });

  it('applies free zone bonus edge case', async () => {
    const result = await tool.execute({
      ...baseInput,
      uae_signals: {
        ...baseInput.uae_signals,
        has_free_zone_license: true,
        free_zone_name: 'DIFC'
      },
      license_type: 'free zone'
    });

    expect(result.data.edge_cases_applied).toContain('FREE_ZONE_BONUS');
    expect(result.data.quality_score).toBeGreaterThan(0);
  });

  it('warns but does not throw when output validation finds extras', async () => {
    const inlineSpy = jest
      .spyOn(tool, '_executeInlineLogic')
      .mockResolvedValue({
        quality_score: 50,
        confidence: 0.9,
        reasoning: [],
        edge_cases_applied: [],
        policy_version: 'v1.0',
        timestamp: new Date().toISOString(),
        extra_field: true,
        _meta: { latency_ms: 1, tool_type: 'STRICT', tool_name: 'evaluate_company_quality' }
      });

    const result = await tool.execute(baseInput);
    expect(result.success).toBe(true);
    expect(warnSpy).toHaveBeenCalled();

    inlineSpy.mockRestore();
  });
});
