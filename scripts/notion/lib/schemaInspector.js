#!/usr/bin/env node
/**
 * Schema Inspector - Discovers and validates Notion database schemas
 * Prevents schema mismatch issues by runtime validation
 */

import { Client } from '@notionhq/client';

export class SchemaInspector {
  constructor(notionClient) {
    this.notion = notionClient;
    this.schemas = new Map();
  }

  /**
   * Inspect and cache database schema
   */
  async inspectDatabase(databaseId, databaseName) {
    console.log(`🔍 Inspecting ${databaseName} schema...`);

    try {
      const db = await this.notion.databases.retrieve({ database_id: databaseId });

      const schema = {
        id: db.id,
        name: databaseName,
        properties: {},
        propertyTypes: {}
      };

      // Extract all properties with their types
      for (const [propName, propData] of Object.entries(db.properties)) {
        schema.properties[propName] = {
          type: propData.type,
          id: propData.id
        };
        schema.propertyTypes[propName] = propData.type;
      }

      this.schemas.set(databaseName, schema);

      console.log(`✅ Found ${Object.keys(schema.properties).length} properties in ${databaseName}`);
      return schema;
    } catch (error) {
      console.error(`❌ Failed to inspect ${databaseName}:`, error.message);
      throw error;
    }
  }

  /**
   * Validate property exists in schema
   */
  validateProperty(databaseName, propertyName) {
    const schema = this.schemas.get(databaseName);
    if (!schema) {
      throw new Error(`Schema for ${databaseName} not loaded. Call inspectDatabase first.`);
    }

    if (!schema.properties[propertyName]) {
      const available = Object.keys(schema.properties).join(', ');
      throw new Error(
        `Property "${propertyName}" does not exist in ${databaseName}.\n` +
        `Available properties: ${available}`
      );
    }

    return schema.properties[propertyName];
  }

  /**
   * Validate property type matches expected type
   */
  validatePropertyType(databaseName, propertyName, expectedType) {
    const property = this.validateProperty(databaseName, propertyName);

    if (property.type !== expectedType) {
      throw new Error(
        `Property "${propertyName}" in ${databaseName} is type "${property.type}", ` +
        `expected "${expectedType}"`
      );
    }

    return true;
  }

  /**
   * Build safe update object with only existing properties
   */
  buildSafeUpdate(databaseName, desiredUpdates) {
    const schema = this.schemas.get(databaseName);
    if (!schema) {
      throw new Error(`Schema for ${databaseName} not loaded`);
    }

    const safeUpdate = {};
    const skipped = [];

    for (const [propName, propValue] of Object.entries(desiredUpdates)) {
      if (schema.properties[propName]) {
        safeUpdate[propName] = propValue;
      } else {
        skipped.push(propName);
      }
    }

    if (skipped.length > 0) {
      console.log(`⚠️  Skipped non-existent properties: ${skipped.join(', ')}`);
    }

    return safeUpdate;
  }

  /**
   * Get property type
   */
  getPropertyType(databaseName, propertyName) {
    const schema = this.schemas.get(databaseName);
    return schema?.propertyTypes[propertyName] || null;
  }

  /**
   * List all properties
   */
  listProperties(databaseName) {
    const schema = this.schemas.get(databaseName);
    if (!schema) {
      return [];
    }

    return Object.entries(schema.properties).map(([name, data]) => ({
      name,
      type: data.type,
      id: data.id
    }));
  }

  /**
   * Print schema report
   */
  printSchema(databaseName) {
    const schema = this.schemas.get(databaseName);
    if (!schema) {
      console.log(`❌ Schema for ${databaseName} not loaded`);
      return;
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`${databaseName.toUpperCase()} SCHEMA`);
    console.log('='.repeat(70));

    const properties = this.listProperties(databaseName);
    properties.forEach(prop => {
      console.log(`  • ${prop.name.padEnd(30)} (${prop.type})`);
    });

    console.log('='.repeat(70));
  }
}
