/**
 * Data Lake Service - Main Export
 * Sprint 74: Data Lake v0 + UPR Graph Schema
 *
 * Event emission framework and UPR Graph query services
 */

export { eventEmitter, EVENT_TYPES, default as EventEmitter } from './EventEmitter.js';
export { graphService, default as GraphService } from './GraphService.js';
