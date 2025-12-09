/**
 * OS Tools Index (S143)
 *
 * Exports all registered tools and the tool registry.
 */

export * from "./registry.js";
export { default as toolRegistry } from "./registry.js";

// Import tools to register them
import "./scoreTool.js";
import "./searchTool.js";
import "./prioritizeTool.js";

// Re-export tool classes for direct use
export { ScoreTool, default as scoreTool } from "./scoreTool.js";
export { SearchTool, default as searchTool } from "./searchTool.js";
export { PrioritizeTool, default as prioritizeTool } from "./prioritizeTool.js";
