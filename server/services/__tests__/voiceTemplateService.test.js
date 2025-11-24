/**
 * Voice Template Service Tests
 * Sprint 31 - Task 2: Voice Template Database
 */

const { VoiceTemplateService } = require('../voiceTemplateService');

// Mock Pool for testing
class MockPool {
  constructor() {
    this.templates = [];
    this.messages = [];
    this.idCounter = 1;
  }

  async query(queryString, values = []) {
    // CREATE TEMPLATE
    if (queryString.includes('INSERT INTO voice_templates')) {
      const template = {
        id: this.idCounter++,
        template_type: values[0],
        category: values[1],
        tone: values[2],
        template_text: values[3],
        subject_template: values[4],
        variables: JSON.parse(values[5]),
        optional_variables: JSON.parse(values[6]),
        conditions: JSON.parse(values[7]),
        priority: values[8],
        created_by: values[9],
        active: true,
        usage_count: 0,
        created_at: new Date(),
        updated_at: new Date()
      };
      this.templates.push(template);
      return { rows: [template] };
    }

    // GET TEMPLATE BY ID
    if (queryString.includes('SELECT * FROM voice_templates WHERE id')) {
      const id = values[0];
      const template = this.templates.find(t => t.id === id);
      return { rows: template ? [template] : [] };
    }

    // GET TEMPLATES (LIST)
    if (queryString.includes('SELECT * FROM voice_templates')) {
      let filtered = this.templates;

      // Values layout: [active, template_type?, category?, tone?, min_priority?, limit, offset]
      const coreValues = values.length >= 2 ? values.slice(0, values.length - 2) : values;
      let index = 0;
      const active = coreValues[index++];

      const hasTemplateType = queryString.includes('template_type');
      const template_type = hasTemplateType ? coreValues[index++] : undefined;

      const hasCategory = queryString.includes('category');
      const category = hasCategory ? coreValues[index++] : undefined;

      const hasTone = queryString.includes('tone');
      const tone = hasTone ? coreValues[index++] : undefined;

      const hasMinPriority = queryString.includes('priority >=');
      const min_priority = hasMinPriority ? coreValues[index++] : undefined;

      if (typeof active === 'boolean') {
        filtered = filtered.filter(t => t.active === active);
      }
      if (template_type) {
        filtered = filtered.filter(t => t.template_type === template_type);
      }
      if (category) {
        filtered = filtered.filter(t => t.category === category);
      }
      if (tone) {
        filtered = filtered.filter(t => t.tone === tone);
      }
      if (typeof min_priority === 'number') {
        filtered = filtered.filter(t => (t.priority || 0) >= min_priority);
      }

      // Sort by priority
      filtered.sort((a, b) => b.priority - a.priority);

      return { rows: filtered };
    }

    // UPDATE TEMPLATE
    if (queryString.includes('UPDATE voice_templates SET')) {
      const id = values[values.length - 1];
      const template = this.templates.find(t => t.id === id);

      if (template) {
        // Apply updates (simplified)
        if (queryString.includes('active')) {
          const explicitActive = values.find(v => typeof v === 'boolean');
          // deleteTemplate sets active = false without passing boolean; catch that
          template.active = explicitActive !== undefined ? explicitActive : false;
        }
        if (queryString.includes('usage_count')) {
          template.usage_count = (template.usage_count || 0) + 1;
        }
        template.updated_at = new Date();

        return { rows: [template] };
      }
      return { rows: [] };
    }

    // CREATE GENERATED MESSAGE
    if (queryString.includes('INSERT INTO generated_messages')) {
      const message = {
        id: this.idCounter++,
        message_id: values[0],
        message_type: values[1],
        company_id: values[2],
        company_name: values[3],
        contact_id: values[4],
        contact_name: values[5],
        subject: values[6],
        body: values[7],
        template_ids: JSON.parse(values[8]),
        variables_used: JSON.parse(values[9]),
        tone: values[10],
        quality_score: values[11],
        personalization_score: values[12],
        variable_coverage: values[13],
        context_data: JSON.parse(values[14]),
        created_by: values[15],
        sent: false,
        created_at: new Date()
      };
      this.messages.push(message);
      return { rows: [message] };
    }

    // GET GENERATED MESSAGE BY ID
    if (queryString.includes('SELECT * FROM generated_messages WHERE message_id')) {
      const message_id = values[0];
      const message = this.messages.find(m => m.message_id === message_id);
      return { rows: message ? [message] : [] };
    }

    // STATS QUERIES
    if (queryString.includes('COUNT(*) as total_templates')) {
      return {
        rows: [{
          total_templates: this.templates.length,
          active_templates: this.templates.filter(t => t.active).length,
          template_types: new Set(this.templates.map(t => t.template_type)).size,
          tone_variants: new Set(this.templates.map(t => t.tone)).size
        }]
      };
    }

    if (queryString.includes('COUNT(*) as total_messages')) {
      return {
        rows: [{
          total_messages: this.messages.length,
          sent_messages: this.messages.filter(m => m.sent).length,
          avg_quality: this.messages.reduce((sum, m) => sum + (m.quality_score || 0), 0) / (this.messages.length || 1),
          avg_personalization: this.messages.reduce((sum, m) => sum + (m.personalization_score || 0), 0) / (this.messages.length || 1)
        }]
      };
    }

    return { rows: [] };
  }

  async end() {
    // Mock cleanup
  }
}

describe('VoiceTemplateService', () => {
  let service;
  let mockPool;

  beforeEach(() => {
    mockPool = new MockPool();
    service = new VoiceTemplateService(mockPool);
  });

  afterEach(async () => {
    await service.close();
  });

  // ===================================================================
  // Template CRUD Tests
  // ===================================================================

  describe('createTemplate', () => {
    it('should create a new voice template', async () => {
      const templateData = {
        template_type: 'introduction',
        category: 'email',
        tone: 'professional',
        template_text: 'Dear {first_name}, I hope this finds you well.',
        variables: ['first_name'],
        priority: 75
      };

      const template = await service.createTemplate(templateData);

      expect(template).toBeDefined();
      expect(template.id).toBe(1);
      expect(template.template_type).toBe('introduction');
      expect(template.tone).toBe('professional');
      expect(template.variables).toEqual(['first_name']);
      expect(template.active).toBe(true);
    });

    it('should create template with default priority', async () => {
      const templateData = {
        template_type: 'value_prop',
        category: 'linkedin',
        tone: 'casual',
        template_text: 'Check out our amazing {product_name}!',
        variables: ['product_name']
      };

      const template = await service.createTemplate(templateData);

      expect(template.priority).toBe(50);
    });
  });

  describe('getTemplate', () => {
    it('should retrieve template by ID', async () => {
      const created = await service.createTemplate({
        template_type: 'cta',
        category: 'email',
        tone: 'formal',
        template_text: 'Please contact us at your earliest convenience.',
        variables: []
      });

      const retrieved = await service.getTemplate(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(created.id);
      expect(retrieved.template_type).toBe('cta');
    });

    it('should return null for non-existent template', async () => {
      const template = await service.getTemplate(999);
      expect(template).toBeNull();
    });
  });

  describe('getTemplates', () => {
    beforeEach(async () => {
      // Create test templates
      await service.createTemplate({
        template_type: 'introduction',
        category: 'email',
        tone: 'professional',
        template_text: 'Professional intro',
        variables: [],
        priority: 80
      });

      await service.createTemplate({
        template_type: 'introduction',
        category: 'linkedin',
        tone: 'casual',
        template_text: 'Casual intro',
        variables: [],
        priority: 60
      });

      await service.createTemplate({
        template_type: 'value_prop',
        category: 'email',
        tone: 'professional',
        template_text: 'Professional value',
        variables: [],
        priority: 70
      });
    });

    it('should get all active templates', async () => {
      const templates = await service.getTemplates();
      expect(templates.length).toBe(3);
    });

    it('should filter templates by type', async () => {
      const templates = await service.getTemplates({ template_type: 'introduction' });
      expect(templates.length).toBe(2);
      expect(templates.every(t => t.template_type === 'introduction')).toBe(true);
    });

    it('should filter templates by category', async () => {
      const templates = await service.getTemplates({ category: 'email' });
      expect(templates.length).toBe(2);
      expect(templates.every(t => t.category === 'email')).toBe(true);
    });

    it('should filter templates by tone', async () => {
      const templates = await service.getTemplates({ tone: 'professional' });
      expect(templates.length).toBe(2);
      expect(templates.every(t => t.tone === 'professional')).toBe(true);
    });

    it('should return templates sorted by priority', async () => {
      const templates = await service.getTemplates();
      expect(templates[0].priority).toBeGreaterThanOrEqual(templates[1].priority);
      expect(templates[1].priority).toBeGreaterThanOrEqual(templates[2].priority);
    });
  });

  describe('selectBestTemplate', () => {
    beforeEach(async () => {
      // Create templates with different conditions
      await service.createTemplate({
        template_type: 'introduction',
        category: 'email',
        tone: 'formal',
        template_text: 'Formal high-quality intro',
        variables: [],
        priority: 50,
        conditions: {
          min_quality_score: 80,
          contact_tier: ['STRATEGIC']
        }
      });

      await service.createTemplate({
        template_type: 'introduction',
        category: 'email',
        tone: 'formal',
        template_text: 'Formal standard intro',
        variables: [],
        priority: 50
      });
    });

    it('should select template matching quality score condition', async () => {
      const template = await service.selectBestTemplate({
        template_type: 'introduction',
        category: 'email',
        tone: 'formal',
        quality_score: 85,
        contact_tier: 'STRATEGIC'
      });

      expect(template).toBeDefined();
      expect(template.template_text).toContain('high-quality');
    });

    it('should return null if no templates match', async () => {
      const template = await service.selectBestTemplate({
        template_type: 'pain_point',
        category: 'linkedin',
        tone: 'casual'
      });

      expect(template).toBeNull();
    });
  });

  describe('deleteTemplate', () => {
    it('should soft delete template (set active = false)', async () => {
      const created = await service.createTemplate({
        template_type: 'introduction',
        category: 'email',
        tone: 'professional',
        template_text: 'Test template',
        variables: []
      });

      await service.deleteTemplate(created.id);

      const template = await service.getTemplate(created.id);
      expect(template.active).toBe(false);
    });
  });

  describe('incrementUsage', () => {
    it('should increment template usage count', async () => {
      const created = await service.createTemplate({
        template_type: 'cta',
        category: 'email',
        tone: 'professional',
        template_text: 'Call to action',
        variables: []
      });

      expect(created.usage_count).toBe(0);

      await service.incrementUsage(created.id);

      const updated = await service.getTemplate(created.id);
      expect(updated.usage_count).toBe(1);
    });
  });

  // ===================================================================
  // Generated Messages Tests
  // ===================================================================

  describe('createGeneratedMessage', () => {
    it('should create a generated message record', async () => {
      const messageData = {
        message_id: 'msg-12345',
        message_type: 'email',
        company_id: 'comp-1',
        company_name: 'TechCorp UAE',
        contact_id: 'contact-1',
        contact_name: 'Ahmed Al-Mansoori',
        subject: 'Partnership Opportunity',
        body: 'Dear Ahmed, I hope this message finds you well...',
        template_ids: [{ type: 'introduction', id: 1 }],
        variables_used: { first_name: 'Ahmed', company_name: 'TechCorp UAE' },
        tone: 'professional',
        quality_score: 85,
        personalization_score: 90,
        variable_coverage: 100,
        context_data: { quality_score: 85, contact_tier: 'STRATEGIC' }
      };

      const message = await service.createGeneratedMessage(messageData);

      expect(message).toBeDefined();
      expect(message.message_id).toBe('msg-12345');
      expect(message.message_type).toBe('email');
      expect(message.quality_score).toBe(85);
      expect(message.sent).toBe(false);
    });
  });

  describe('getGeneratedMessage', () => {
    it('should retrieve message by message_id', async () => {
      const created = await service.createGeneratedMessage({
        message_id: 'msg-test-1',
        message_type: 'linkedin',
        company_id: 'comp-1',
        company_name: 'Test Co',
        contact_id: 'contact-1',
        contact_name: 'John Doe',
        subject: 'Test Subject',
        body: 'Test message',
        template_ids: [],
        variables_used: {},
        tone: 'casual',
        quality_score: 75,
        personalization_score: 80,
        variable_coverage: 90,
        context_data: {}
      });

      const retrieved = await service.getGeneratedMessage('msg-test-1');

      expect(retrieved).toBeDefined();
      expect(retrieved.message_id).toBe('msg-test-1');
    });

    it('should return null for non-existent message', async () => {
      const message = await service.getGeneratedMessage('non-existent');
      expect(message).toBeNull();
    });
  });

  // ===================================================================
  // Analytics Tests
  // ===================================================================

  describe('getSystemStats', () => {
    beforeEach(async () => {
      // Create templates
      await service.createTemplate({
        template_type: 'introduction',
        category: 'email',
        tone: 'professional',
        template_text: 'Intro 1',
        variables: []
      });

      await service.createTemplate({
        template_type: 'value_prop',
        category: 'linkedin',
        tone: 'casual',
        template_text: 'Value 1',
        variables: []
      });

      // Create messages
      await service.createGeneratedMessage({
        message_id: 'msg-1',
        message_type: 'email',
        company_id: 'comp-1',
        company_name: 'Co 1',
        contact_id: 'c-1',
        contact_name: 'Person 1',
        subject: 'S1',
        body: 'B1',
        template_ids: [],
        variables_used: {},
        tone: 'professional',
        quality_score: 85,
        personalization_score: 90,
        variable_coverage: 95,
        context_data: {}
      });
    });

    it('should return system statistics', async () => {
      const stats = await service.getSystemStats();

      expect(stats).toBeDefined();
      expect(stats.templates).toBeDefined();
      expect(stats.messages).toBeDefined();
      expect(parseInt(stats.templates.total_templates)).toBe(2);
      expect(parseInt(stats.templates.active_templates)).toBe(2);
      expect(parseInt(stats.messages.total_messages)).toBe(1);
    });
  });
});

// Export for external test runners
module.exports = { VoiceTemplateService };
