/**
 * Agent Communication Protocol
 * Defines message structure and validation for inter-agent communication
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Message Types
 */
const MessageType = {
  REQUEST: 'REQUEST',
  RESPONSE: 'RESPONSE',
  NOTIFICATION: 'NOTIFICATION'
};

/**
 * Action Types
 */
const ActionType = {
  ANALYZE: 'ANALYZE',
  VALIDATE: 'VALIDATE',
  CRITIQUE: 'CRITIQUE',
  CONSENSUS: 'CONSENSUS',
  DISCOVER: 'DISCOVER',
  VERIFY: 'VERIFY',
  EVALUATE: 'EVALUATE',
  VOTE: 'VOTE',
  ERROR: 'ERROR'
};

/**
 * Agent Protocol Message Structure
 */
class AgentMessage {
  constructor({
    type,
    from,
    to,
    payload,
    messageId = null,
    correlationId = null,
    timestamp = null
  }) {
    this.type = type;
    this.from = from;
    this.to = to;
    this.timestamp = timestamp || new Date();
    this.messageId = messageId || uuidv4();
    this.correlationId = correlationId || this.messageId;
    this.payload = payload;
  }

  /**
   * Validate message structure
   */
  validate() {
    const errors = [];

    // Type validation
    if (!Object.values(MessageType).includes(this.type)) {
      errors.push(`Invalid message type: ${this.type}`);
    }

    // Agent validation
    if (!this.from || typeof this.from !== 'string') {
      errors.push('Missing or invalid "from" agent');
    }

    if (!this.to || typeof this.to !== 'string') {
      errors.push('Missing or invalid "to" agent');
    }

    // Payload validation
    if (!this.payload || typeof this.payload !== 'object') {
      errors.push('Missing or invalid payload');
    } else {
      if (!this.payload.action) {
        errors.push('Payload missing required "action" field');
      }

      if (this.payload.action && !Object.values(ActionType).includes(this.payload.action)) {
        errors.push(`Invalid action type: ${this.payload.action}`);
      }
    }

    // UUID validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(this.messageId)) {
      errors.push(`Invalid messageId format: ${this.messageId}`);
    }

    if (!uuidRegex.test(this.correlationId)) {
      errors.push(`Invalid correlationId format: ${this.correlationId}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Convert to JSON
   */
  toJSON() {
    return {
      type: this.type,
      from: this.from,
      to: this.to,
      timestamp: this.timestamp,
      messageId: this.messageId,
      correlationId: this.correlationId,
      payload: this.payload
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(json) {
    return new AgentMessage({
      type: json.type,
      from: json.from,
      to: json.to,
      payload: json.payload,
      messageId: json.messageId,
      correlationId: json.correlationId,
      timestamp: new Date(json.timestamp)
    });
  }
}

/**
 * Protocol Helper Functions
 */
class AgentProtocol {
  /**
   * Create a REQUEST message
   */
  static createRequest({ from, to, action, data = {}, context = {} }) {
    return new AgentMessage({
      type: MessageType.REQUEST,
      from,
      to,
      payload: {
        action,
        data,
        context
      }
    });
  }

  /**
   * Create a RESPONSE message
   */
  static createResponse({ from, to, action, data = {}, context = {}, correlationId }) {
    return new AgentMessage({
      type: MessageType.RESPONSE,
      from,
      to,
      correlationId,
      payload: {
        action,
        data,
        context
      }
    });
  }

  /**
   * Create a NOTIFICATION message
   */
  static createNotification({ from, to = 'broadcast', action, data = {}, context = {} }) {
    return new AgentMessage({
      type: MessageType.NOTIFICATION,
      from,
      to,
      payload: {
        action,
        data,
        context
      }
    });
  }

  /**
   * Create a broadcast message (to all agents)
   */
  static broadcast({ from, action, data = {}, context = {} }) {
    return this.createNotification({
      from,
      to: 'broadcast',
      action,
      data,
      context
    });
  }

  /**
   * Validate a message
   */
  static validate(message) {
    if (!(message instanceof AgentMessage)) {
      return {
        valid: false,
        errors: ['Message must be an instance of AgentMessage']
      };
    }

    return message.validate();
  }

  /**
   * Create an error response
   */
  static createErrorResponse({ from, to, error, correlationId }) {
    return new AgentMessage({
      type: MessageType.RESPONSE,
      from,
      to,
      correlationId,
      payload: {
        action: 'ERROR',
        data: {
          error: error.message || error,
          stack: error.stack
        },
        context: {
          success: false
        }
      }
    });
  }

  /**
   * Create a consensus request
   */
  static createConsensusRequest({ from, decision, context = {} }) {
    return new AgentMessage({
      type: MessageType.REQUEST,
      from,
      to: 'broadcast',
      payload: {
        action: ActionType.CONSENSUS,
        data: { decision },
        context
      }
    });
  }

  /**
   * Create a consensus vote
   */
  static createConsensusVote({ from, to, vote, confidence, reasoning, correlationId }) {
    return new AgentMessage({
      type: MessageType.RESPONSE,
      from,
      to,
      correlationId,
      payload: {
        action: ActionType.VOTE,
        data: {
          vote,
          confidence,
          reasoning
        },
        context: {}
      }
    });
  }

  /**
   * Check if message is a request
   */
  static isRequest(message) {
    return message.type === MessageType.REQUEST;
  }

  /**
   * Check if message is a response
   */
  static isResponse(message) {
    return message.type === MessageType.RESPONSE;
  }

  /**
   * Check if message is a notification
   */
  static isNotification(message) {
    return message.type === MessageType.NOTIFICATION;
  }

  /**
   * Check if message is broadcast
   */
  static isBroadcast(message) {
    return message.to === 'broadcast';
  }

  /**
   * Extract correlation chain from messages
   */
  static getMessageChain(messages, correlationId) {
    return messages.filter(msg => msg.correlationId === correlationId)
                  .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }
}

module.exports = {
  AgentMessage,
  AgentProtocol,
  MessageType,
  ActionType
};
