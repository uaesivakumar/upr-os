/**
 * Lifecycle Automated Actions
 * Automatically trigger emails and tasks when opportunities transition states
 */

import pg from 'pg';
const { Pool } = pg;
import { EventEmitter } from 'events';

export class LifecycleAutomatedActions extends EventEmitter {
  constructor(lifecycleEngine, connectionConfig = null) {
    super();
    this.engine = lifecycleEngine;

    // Set up database pool
    if (typeof connectionConfig === 'string') {
      this.pool = new Pool({ connectionString: connectionConfig });
    } else if (connectionConfig && typeof connectionConfig === 'object') {
      this.pool = new Pool(connectionConfig);
    } else {
      this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    }

    // Register state change listeners
    if (this.engine) {
      this.registerEventListeners();
    }
  }

  /**
   * Register listeners for lifecycle state changes
   */
  registerEventListeners() {
    const states = ['DISCOVERED', 'QUALIFIED', 'OUTREACH', 'ENGAGED', 'NEGOTIATING', 'DORMANT', 'CLOSED'];

    states.forEach(state => {
      this.engine.on(`entered:${state}`, async (data) => {
        await this.executeActions(data.opportunityId, state, 'entered', data.metadata);
      });

      this.engine.on(`exited:${state}`, async (data) => {
        await this.executeActions(data.opportunityId, state, 'exited', data.metadata);
      });
    });
  }

  /**
   * Get action templates for a given state and event
   */
  async getActionTemplatesForState(state, event) {
    const query = `
      SELECT *
      FROM lifecycle_action_templates
      WHERE trigger_state = $1
        AND trigger_event = $2
        AND is_active = TRUE
      ORDER BY time_delay_hours ASC
    `;

    const result = await this.pool.query(query, [state, event]);
    return result.rows;
  }

  /**
   * Execute actions for a state transition
   */
  async executeActions(opportunityId, state, event, metadata = {}) {
    const templates = await this.getActionTemplatesForState(state, event);

    const results = [];

    for (const template of templates) {
      try {
        let result;

        if (template.time_delay_hours > 0) {
          result = await this.scheduleDelayedAction(opportunityId, template);
        } else {
          switch (template.action_type) {
            case 'email':
              result = await this.sendEmail(opportunityId, template, metadata);
              break;
            case 'task':
              result = await this.createTask(opportunityId, template, metadata);
              break;
            case 'notification':
              result = await this.sendNotification(opportunityId, template, metadata);
              break;
            default:
              result = { success: false, error: `Unknown action type: ${template.action_type}` };
          }
        }

        results.push({
          templateId: template.id,
          templateName: template.name,
          actionType: template.action_type,
          ...result
        });

        this.emit('action_executed', {
          opportunityId,
          state,
          event,
          template: template.name,
          result
        });
      } catch (error) {
        results.push({
          templateId: template.id,
          templateName: template.name,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Send email action
   */
  async sendEmail(opportunityId, template, metadata = {}) {
    // In production, this would integrate with email service (SendGrid, SES, etc.)
    // For now, we'll simulate and log
    const content = template.template_content;

    return {
      success: true,
      action: 'email',
      to: metadata.email || 'contact@example.com',
      subject: content.subject || 'Update from UPR',
      template: content.template || 'default',
      scheduledFor: new Date()
    };
  }

  /**
   * Create task action
   */
  async createTask(opportunityId, template, metadata = {}) {
    // In production, this would integrate with task management system
    // For now, we'll simulate and log
    const content = template.template_content;

    return {
      success: true,
      action: 'task',
      title: content.title || 'New Task',
      description: content.description || 'Task created by lifecycle automation',
      priority: content.priority || 'normal',
      assignedTo: metadata.assignedTo || 'default_user',
      createdAt: new Date()
    };
  }

  /**
   * Send notification action
   */
  async sendNotification(opportunityId, template, metadata = {}) {
    // In production, this would integrate with notification service (Slack, email, etc.)
    // For now, we'll simulate and log
    const content = template.template_content;

    return {
      success: true,
      action: 'notification',
      message: content.message || 'Notification from lifecycle automation',
      channel: content.channel || 'slack',
      recipient: content.recipient || 'sales_team',
      sentAt: new Date()
    };
  }

  /**
   * Schedule delayed action
   */
  async scheduleDelayedAction(opportunityId, template) {
    const delayMs = template.time_delay_hours * 60 * 60 * 1000;
    const scheduledFor = new Date(Date.now() + delayMs);

    // In production, this would use a job queue (Bull, Agenda, etc.)
    // For now, we'll just return the scheduled info
    return {
      success: true,
      action: 'scheduled',
      templateName: template.name,
      actionType: template.action_type,
      scheduledFor,
      delayHours: template.time_delay_hours
    };
  }

  /**
   * Get action execution history
   */
  async getActionHistory(opportunityId, options = {}) {
    // This would query an action_execution_log table in production
    // For now, return empty array
    return [];
  }

  /**
   * Create or update action template
   */
  async upsertActionTemplate(template) {
    const {
      id,
      name,
      actionType,
      triggerState,
      triggerEvent,
      timeDelayHours = 0,
      templateContent,
      isActive = true
    } = template;

    if (id) {
      // Update
      const query = `
        UPDATE lifecycle_action_templates
        SET
          name = $1,
          action_type = $2,
          trigger_state = $3,
          trigger_event = $4,
          time_delay_hours = $5,
          template_content = $6,
          is_active = $7,
          updated_at = NOW()
        WHERE id = $8
        RETURNING *
      `;

      const result = await this.pool.query(query, [
        name,
        actionType,
        triggerState,
        triggerEvent,
        timeDelayHours,
        JSON.stringify(templateContent),
        isActive,
        id
      ]);

      return result.rows[0];
    } else {
      // Create
      const query = `
        INSERT INTO lifecycle_action_templates (
          name,
          action_type,
          trigger_state,
          trigger_event,
          time_delay_hours,
          template_content,
          is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const result = await this.pool.query(query, [
        name,
        actionType,
        triggerState,
        triggerEvent,
        timeDelayHours,
        JSON.stringify(templateContent),
        isActive
      ]);

      return result.rows[0];
    }
  }

  /**
   * Get all action templates
   */
  async getAllTemplates() {
    const query = 'SELECT * FROM lifecycle_action_templates ORDER BY trigger_state, trigger_event';
    const result = await this.pool.query(query);
    return result.rows;
  }

  /**
   * Deactivate action template
   */
  async deactivateTemplate(templateId) {
    const query = `
      UPDATE lifecycle_action_templates
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, [templateId]);
    return result.rows[0];
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default LifecycleAutomatedActions;
