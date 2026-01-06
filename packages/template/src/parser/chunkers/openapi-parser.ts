/**
 * OpenAPI Specification Parser
 *
 * Parses OpenAPI/Swagger specs and generates documentation chunks for:
 * - API endpoints with full request/response documentation
 * - Code samples in various languages
 * - Smart example generation based on schema definitions
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { DocChunk, ChunkConfig } from '../../types/index.js';
import { DEFAULT_CHUNK_CONFIG } from '../core/config.js';

// =============================================================================
// PARSING CONTEXT (replaces global mutable state)
// =============================================================================

/**
 * Context object that holds parsing state.
 * This replaces the previous global variables, making the parser
 * thread-safe and easier to test.
 */
interface ParsingContext {
  /** Map of "METHOD /path" -> documentation URL */
  docUrlMap: Map<string, string>;
  /** Base URL for fallback URL generation */
  baseUrl: string;
}

// =============================================================================
// OPENAPI TYPES
// =============================================================================

interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, SchemaObject>;
  };
}

interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
}

interface Operation {
  tags?: string[];
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: Parameter[];
  requestBody?: {
    content?: {
      'application/json'?: {
        schema?: SchemaRef;
        example?: any;
      };
    };
    required?: boolean;
  };
  responses?: Record<string, Response>;
  'x-codeSamples'?: CodeSample[];
}

interface Parameter {
  name: string;
  in: 'query' | 'path' | 'header';
  description?: string;
  required?: boolean;
  schema?: {
    type?: string;
    format?: string;
    minimum?: number;
    maximum?: number;
    enum?: string[];
    default?: any;
    example?: any;
  };
}

interface Response {
  description?: string;
  content?: {
    'application/json'?: {
      schema?: SchemaRef;
      example?: any;
    };
  };
}

interface SchemaRef {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, SchemaObject>;
  required?: string[];
  items?: SchemaRef;
  enum?: string[];
  nullable?: boolean;
  example?: any;
}

interface SchemaObject {
  type?: string | string[];
  description?: string;
  format?: string;
  properties?: Record<string, SchemaObject>;
  required?: string[];
  items?: SchemaRef;
  allOf?: SchemaRef[];
  oneOf?: SchemaRef[];
  anyOf?: SchemaRef[];
  $ref?: string;
  example?: any;
  enum?: string[];
  nullable?: boolean;
  default?: any;
  minimum?: number;
  maximum?: number;
}

interface CodeSample {
  lang: string;
  source: string;
}

// =============================================================================
// SCHEMA RESOLUTION
// =============================================================================

/**
 * Resolve a schema reference to its definition (with cycle detection)
 */
function resolveSchema(
  ref: string,
  schemas: Record<string, SchemaObject>,
  visited: Set<string> = new Set()
): SchemaObject | null {
  const schemaName = ref.replace('#/components/schemas/', '');

  if (visited.has(schemaName)) {
    return null; // Cycle detected
  }

  visited.add(schemaName);
  const schema = schemas[schemaName];

  if (!schema) return null;

  if (schema.$ref) {
    return resolveSchema(schema.$ref, schemas, visited);
  }

  return schema;
}

function generateExample(
  schema: SchemaObject | null,
  schemas: Record<string, SchemaObject>,
  depth: number = 0,
  fieldName?: string
): any {
  if (depth > 3 || !schema) return null;

  // Handle $ref
  if (schema.$ref) {
    const resolved = resolveSchema(schema.$ref, schemas, new Set());
    return generateExample(resolved, schemas, depth + 1, fieldName);
  }

  // Use provided example
  if (schema.example !== undefined) {
    return schema.example;
  }

  // Handle allOf
  if (schema.allOf) {
    const merged: any = {};
    for (const s of schema.allOf) {
      const ex = generateExample(s as SchemaObject, schemas, depth + 1, fieldName);
      if (ex && typeof ex === 'object') {
        Object.assign(merged, ex);
      }
    }
    return Object.keys(merged).length > 0 ? merged : null;
  }

  // Handle oneOf/anyOf - take first
  if (schema.oneOf?.[0]) {
    return generateExample(schema.oneOf[0] as SchemaObject, schemas, depth + 1, fieldName);
  }
  if (schema.anyOf?.[0]) {
    return generateExample(schema.anyOf[0] as SchemaObject, schemas, depth + 1, fieldName);
  }

  // Handle enum
  if (schema.enum && schema.enum.length > 0) {
    return schema.enum[0];
  }

  const type = Array.isArray(schema.type)
    ? schema.type.find(t => t !== 'null') || 'string'
    : schema.type;

  switch (type) {
    case 'object':
      if (schema.properties) {
        const obj: Record<string, any> = {};
        const requiredFields = new Set(schema.required || []);
        let count = 0;
        for (const [name, prop] of Object.entries(schema.properties)) {
          if (requiredFields.has(name) || count < 5) {
            const val = generateExample(prop, schemas, depth + 1, name);
            if (val !== null) {
              obj[name] = val;
              count++;
            }
          }
        }
        return Object.keys(obj).length > 0 ? obj : {};
      }
      return {};

    case 'array':
      if (schema.items) {
        const itemEx = generateExample(schema.items as SchemaObject, schemas, depth + 1);
        return itemEx !== null ? [itemEx] : [];
      }
      return [];

    case 'string':
      if (schema.format === 'date-time') return '2024-01-15T10:30:00Z';
      if (schema.format === 'date') return '2024-01-15';
      if (schema.format === 'email') return 'user@example.com';
      if (schema.format === 'uri') return 'https://example.com';
      if (schema.format === 'uuid') return '550e8400-e29b-41d4-a716-446655440000';
      return schema.default || 'string';

    case 'integer':
      return schema.default ?? schema.minimum ?? 0;

    case 'number':
      return schema.default ?? schema.minimum ?? 0.0;

    case 'boolean':
      return schema.default ?? true;

    default:
      return null;
  }
}

// =============================================================================
// SCHEMA FORMATTING
// =============================================================================

/**
 * Format schema properties as documentation
 */
function formatSchemaProperties(
  schema: SchemaObject | null,
  schemas: Record<string, SchemaObject>,
  indent: string = '',
  depth: number = 0
): string {
  if (!schema || depth > 3) return '';

  // Handle $ref
  if (schema.$ref) {
    const resolved = resolveSchema(schema.$ref, schemas, new Set());
    return formatSchemaProperties(resolved, schemas, indent, depth + 1);
  }

  // Handle allOf
  if (schema.allOf) {
    const lines: string[] = [];
    for (const s of schema.allOf) {
      lines.push(formatSchemaProperties(s as SchemaObject, schemas, indent, depth + 1));
    }
    return lines.filter(Boolean).join('\n');
  }

  if (!schema.properties) return '';

  const lines: string[] = [];
  const required = new Set(schema.required || []);

  for (const [propName, propSchema] of Object.entries(schema.properties)) {
    const isRequired = required.has(propName);
    const nullable =
      propSchema.nullable || (Array.isArray(propSchema.type) && propSchema.type.includes('null'));

    // Build type string
    let typeStr = buildTypeString(propSchema);

    // Add format
    if (propSchema.format) {
      typeStr += ` (${propSchema.format})`;
    }

    // Add nullable marker
    if (nullable) {
      typeStr += ' | null';
    }

    const reqStr = isRequired ? 'Required' : 'Optional';
    let line = `${indent}- **${propName}** (${typeStr}) - ${reqStr}`;

    if (propSchema.description) {
      line += ` - ${propSchema.description}`;
    }

    if (propSchema.enum && propSchema.enum.length > 0) {
      line += ` (Allowed: ${propSchema.enum.map(e => `\`${e}\``).join(', ')})`;
    }

    // Add constraints
    const constraints: string[] = [];
    if (propSchema.minimum !== undefined) constraints.push(`min: ${propSchema.minimum}`);
    if (propSchema.maximum !== undefined) constraints.push(`max: ${propSchema.maximum}`);
    if (constraints.length > 0) {
      line += ` [${constraints.join(', ')}]`;
    }

    lines.push(line);

    // Add nested properties
    if (propSchema.type === 'object' && propSchema.properties && depth < 2) {
      lines.push(formatSchemaProperties(propSchema, schemas, indent + '  ', depth + 1));
    }
  }

  return lines.filter(Boolean).join('\n');
}

/**
 * Build type string from schema
 */
function buildTypeString(propSchema: SchemaObject): string {
  if (propSchema.$ref) {
    return propSchema.$ref.replace('#/components/schemas/', '');
  }

  if (propSchema.allOf) {
    const types = propSchema.allOf
      .map(s => (s.$ref ? s.$ref.replace('#/components/schemas/', '') : (s as SchemaObject).type))
      .filter(Boolean)
      .join(' & ');
    return types || 'object';
  }

  if (propSchema.oneOf || propSchema.anyOf) {
    const variants = propSchema.oneOf || propSchema.anyOf || [];
    return (
      variants
        .map(s => (s.$ref ? s.$ref.replace('#/components/schemas/', '') : (s as SchemaObject).type))
        .filter(Boolean)
        .join(' | ') || 'any'
    );
  }

  if (Array.isArray(propSchema.type)) {
    return propSchema.type.filter(t => t !== 'null').join(' | ');
  }

  if (propSchema.type === 'array' && propSchema.items) {
    const itemType = (propSchema.items as SchemaObject).$ref
      ? (propSchema.items as SchemaObject).$ref!.replace('#/components/schemas/', '')
      : (propSchema.items as SchemaObject).type || 'any';
    return `array[${itemType}]`;
  }

  return propSchema.type || 'any';
}

// =============================================================================
// PARAMETER FORMATTING
// =============================================================================

/**
 * Format parameters as documentation
 */
function formatParameters(params: Parameter[]): string {
  if (!params || params.length === 0) return 'None';

  const queryParams = params.filter(p => p.in === 'query');
  const pathParams = params.filter(p => p.in === 'path');
  const headerParams = params.filter(p => p.in === 'header');

  const lines: string[] = [];

  if (pathParams.length > 0) {
    lines.push('#### Path Parameters');
    for (const p of pathParams) {
      lines.push(formatParameter(p));
    }
  }

  if (queryParams.length > 0) {
    lines.push('#### Query Parameters');
    for (const p of queryParams) {
      lines.push(formatParameter(p));
    }
  }

  if (headerParams.length > 0) {
    lines.push('#### Header Parameters');
    for (const p of headerParams) {
      lines.push(formatParameter(p));
    }
  }

  return lines.join('\n');
}

/**
 * Format a single parameter
 */
function formatParameter(p: Parameter): string {
  const typeStr = p.schema?.type || 'string';
  const reqStr = p.required ? 'Required' : 'Optional';
  let line = `- **${p.name}** (${typeStr}) - ${reqStr}`;

  if (p.description) line += ` - ${p.description}`;
  if (p.schema?.enum) line += ` (Allowed: ${p.schema.enum.map(e => `\`${e}\``).join(', ')})`;
  if (p.schema?.default !== undefined) line += ` (Default: \`${p.schema.default}\`)`;
  if (p.schema?.example !== undefined) line += ` (Example: \`${p.schema.example}\`)`;

  const constraints: string[] = [];
  if (p.schema?.minimum !== undefined) constraints.push(`min: ${p.schema.minimum}`);
  if (p.schema?.maximum !== undefined) constraints.push(`max: ${p.schema.maximum}`);
  if (constraints.length > 0) line += ` [${constraints.join(', ')}]`;

  return line;
}

/**
 * Build a URL lookup map by reading the `openapi:` frontmatter from MDX files.
 *
 * Each MDX file contains frontmatter like:
 *   openapi: get /payments
 *
 * We build a map: "GET /payments" -> baseUrl + "/" + file-path-slug
 * This ensures URLs are always correct since we use file paths as the source of truth.
 *
 * @param docsRoot - Root directory containing the documentation
 * @param urlMappingDir - Directory name containing MDX files with openapi frontmatter (e.g., "api-reference")
 * @param baseUrl - Base URL for the documentation (e.g., "https://docs.example.com/api-reference")
 * @returns Map of "METHOD /path" -> documentation URL
 */
function buildDocUrlMap(
  docsRoot: string,
  urlMappingDir: string,
  baseUrl: string
): Map<string, string> {
  const docUrlMap = new Map<string, string>();
  const mappingDir = path.join(docsRoot, urlMappingDir);

  if (!fs.existsSync(mappingDir)) {
    return docUrlMap;
  }

  // Recursively find all MDX files and extract their openapi reference
  function scanDir(dir: string, relativePath: string = ''): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        scanDir(fullPath, relPath);
      } else if (entry.name.endsWith('.mdx')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');

          // Extract openapi reference from frontmatter
          // Formats:
          //   openapi: get /payments
          //   openapi: "post /checkouts"
          const openapiMatch = content.match(/^openapi:\s*"?(\w+)\s+([^"\n\r]+)"?/m);

          if (openapiMatch) {
            const method = openapiMatch[1].toUpperCase();
            const apiPath = openapiMatch[2].trim().replace(/"$/, '');

            // Build the documentation URL from file path
            // baseUrl already contains the full prefix (e.g., https://docs.x.com/api-reference)
            const slug = relPath.replace(/\.mdx$/, '');
            const docUrl = `${baseUrl}/${slug}`;

            // Create lookup key: "METHOD /path" (e.g., "GET /payments")
            const lookupKey = `${method} ${apiPath}`;
            docUrlMap.set(lookupKey, docUrl);
          }
        } catch {
          // Skip files that can't be read
        }
      }
    }
  }

  scanDir(mappingDir);
  return docUrlMap;
}

/**
 * Get documentation URL for an operation.
 *
 * Uses the method + path combination to look up the correct documentation URL
 * from the map built by scanning actual MDX files' `openapi:` frontmatter.
 *
 * @param ctx - Parsing context containing URL map and base URL
 * @param operationId - The operation ID from OpenAPI spec
 * @param method - HTTP method
 * @param pathStr - API path
 */
function getDocUrl(
  ctx: ParsingContext,
  operationId: string,
  method: string,
  pathStr: string
): string {
  // Primary lookup: "METHOD /path" (e.g., "GET /payments")
  const lookupKey = `${method.toUpperCase()} ${pathStr}`;
  if (ctx.docUrlMap.has(lookupKey)) {
    return ctx.docUrlMap.get(lookupKey)!;
  }

  // Fallback: Generate URL based on operationId
  const pathParts = pathStr.split('/').filter(Boolean);
  const resource = pathParts[0] || 'misc';
  const slug = operationId
    .replace(/_handler$/, '')
    .replace(/_proxy$/, '')
    .replace(/_/g, '-');

  return `${ctx.baseUrl}/${resource}/${slug}`;
}

// =============================================================================
// CHUNK CREATION
// =============================================================================

/**
 * Create an API documentation chunk for an endpoint
 *
 * @param ctx - Parsing context (null for standalone loader usage)
 */
function createApiDocChunk(
  method: string,
  pathStr: string,
  operation: Operation,
  schemas: Record<string, SchemaObject>,
  servers: Array<{ url: string; description: string }>,
  ctx: ParsingContext | null = null
): DocChunk {
  const operationId = operation.operationId || `${method}_${pathStr.replace(/\//g, '_')}`;
  // Use context for URL lookup, or generate a placeholder if no context
  const docUrl = ctx ? getDocUrl(ctx, operationId, method, pathStr) : '';
  const tag = operation.tags?.[0] || 'API';

  const actionName = operationId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  // Build the API doc content
  const lines: string[] = [];

  lines.push(`## ${method.toUpperCase()} ${pathStr}`);
  lines.push('');

  lines.push(`### Description`);
  lines.push(operation.summary || operation.description || `${actionName} endpoint.`);
  lines.push('');

  lines.push(`### Method`);
  lines.push(method.toUpperCase());
  lines.push('');

  lines.push(`### Endpoint`);
  lines.push(pathStr);
  lines.push('');

  if (servers.length > 0) {
    lines.push('#### Base URLs');
    for (const server of servers) {
      lines.push(`- ${server.url} (${server.description})`);
    }
    lines.push('');
  }

  lines.push(`### Parameters`);
  lines.push(formatParameters(operation.parameters || []));
  lines.push('');

  // Request body
  if (operation.requestBody?.content?.['application/json']) {
    const jsonContent = operation.requestBody.content['application/json'];
    const bodySchema = jsonContent.schema;

    lines.push(`### Request Body`);
    if (bodySchema) {
      if (bodySchema.$ref) {
        const resolved = resolveSchema(bodySchema.$ref, schemas, new Set());
        lines.push(formatSchemaProperties(resolved, schemas, '', 0));
      } else {
        lines.push(formatSchemaProperties(bodySchema as SchemaObject, schemas, '', 0));
      }
    }
    lines.push('');

    const requestExample =
      jsonContent.example || generateExample(bodySchema as SchemaObject, schemas);
    if (requestExample) {
      lines.push(`### Request Example`);
      lines.push('```json');
      lines.push(JSON.stringify(requestExample, null, 2));
      lines.push('```');
      lines.push('');
    }
  }

  // Responses
  if (operation.responses) {
    lines.push(`### Response`);

    for (const [code, response] of Object.entries(operation.responses)) {
      const statusType = code.startsWith('2')
        ? 'Success'
        : code.startsWith('4')
          ? 'Client Error'
          : 'Error';
      lines.push(`#### ${statusType} Response (${code})`);

      if (response.description) {
        lines.push(response.description);
      }

      if (response.content?.['application/json']) {
        const jsonContent = response.content['application/json'];
        const respSchema = jsonContent.schema;

        if (respSchema) {
          if (respSchema.$ref) {
            const resolved = resolveSchema(respSchema.$ref, schemas, new Set());
            const props = formatSchemaProperties(resolved, schemas, '', 0);
            if (props) lines.push(props);
          } else {
            const props = formatSchemaProperties(respSchema as SchemaObject, schemas, '', 0);
            if (props) lines.push(props);
          }
        }

        const responseExample =
          jsonContent.example || generateExample(respSchema as SchemaObject, schemas);
        if (responseExample && code.startsWith('2')) {
          lines.push('');
          lines.push(`#### Response Example`);
          lines.push('```json');
          lines.push(JSON.stringify(responseExample, null, 2));
          lines.push('```');
        }
      }
      lines.push('');
    }
  }

  const content = lines.join('\n').trim();

  return {
    id: `api/${operationId}`,
    documentPath: `api-reference/${tag.toLowerCase()}/${operationId.replace(/_/g, '-')}`,
    documentTitle: `${actionName} - ${method.toUpperCase()} ${pathStr}`,
    category: 'api-reference',
    heading: actionName,
    content,
    metadata: {
      description: operation.summary || operation.description,
      sourceUrl: docUrl,
      method: method.toUpperCase(),
      path: pathStr,
    },
  };
}

/**
 * Create a code sample chunk
 *
 * @param ctx - Parsing context for URL resolution
 */
function createCodeSampleChunk(
  method: string,
  pathStr: string,
  operation: Operation,
  sample: CodeSample,
  ctx: ParsingContext
): DocChunk {
  const operationId = operation.operationId || `${method}_${pathStr.replace(/\//g, '_')}`;
  const docUrl = getDocUrl(ctx, operationId, method, pathStr);
  const tag = operation.tags?.[0] || 'API';

  const actionName = operationId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const title = `${actionName} - ${sample.lang} Example`;

  const lines: string[] = [];
  lines.push(`${sample.lang} code example for \`${method.toUpperCase()} ${pathStr}\``);
  lines.push('');
  lines.push('```' + sample.lang.toLowerCase());
  lines.push(sample.source);
  lines.push('```');

  const content = lines.join('\n').trim();

  return {
    id: `api/${operationId}/code/${sample.lang.toLowerCase()}`,
    documentPath: `api-reference/${tag.toLowerCase()}/${operationId.replace(/_/g, '-')}`,
    documentTitle: title,
    category: 'api-reference',
    heading: `${sample.lang} Example`,
    content,
    metadata: {
      description: `${sample.lang} code example for ${actionName}`,
      sourceUrl: docUrl,
      language: sample.lang,
      method: method.toUpperCase(),
      path: pathStr,
    },
  };
}

// =============================================================================
// MAIN PARSING FUNCTIONS
// =============================================================================

/**
 * Parse the OpenAPI spec and generate chunks
 * @param openApiPath - Path to the OpenAPI YAML file
 * @param baseUrl - Required base URL for documentation links (from source config)
 * @param docsRoot - Optional path to the docs root for URL mapping
 * @param urlMappingDir - Optional directory name containing MDX files with openapi frontmatter
 */
export function parseOpenApiSpec(
  openApiPath: string,
  baseUrl: string,
  docsRoot?: string,
  urlMappingDir?: string,
  chunkConfig: ChunkConfig = DEFAULT_CHUNK_CONFIG
): DocChunk[] {
  if (!baseUrl) {
    throw new Error(
      'baseUrl is required for OpenAPI parsing. Set baseUrl in your source configuration.'
    );
  }

  // Create parsing context (replaces global state)
  const ctx: ParsingContext = {
    baseUrl,
    docUrlMap: new Map<string, string>(),
  };

  // Build URL map from actual folder structure if both docsRoot and urlMappingDir provided
  if (docsRoot && urlMappingDir) {
    ctx.docUrlMap = buildDocUrlMap(docsRoot, urlMappingDir, baseUrl);
  }

  const content = fs.readFileSync(openApiPath, 'utf-8');
  const spec: OpenAPISpec = parseYaml(content);

  const chunks: DocChunk[] = [];
  const schemas = spec.components?.schemas || {};
  const servers = spec.servers || [];

  let endpointCount = 0;
  let codeSampleCount = 0;

  // Process each path
  for (const [pathStr, pathItem] of Object.entries(spec.paths)) {
    const methods: Array<[string, Operation | undefined]> = [
      ['get', pathItem.get],
      ['post', pathItem.post],
      ['put', pathItem.put],
      ['patch', pathItem.patch],
      ['delete', pathItem.delete],
    ];

    for (const [method, operation] of methods) {
      if (!operation) continue;

      // Create API documentation chunk
      const apiChunk = createApiDocChunk(method, pathStr, operation, schemas, servers, ctx);
      chunks.push(apiChunk);
      endpointCount++;

      // Create code sample chunks
      if (operation['x-codeSamples']) {
        for (const sample of operation['x-codeSamples']) {
          const codeChunk = createCodeSampleChunk(method, pathStr, operation, sample, ctx);
          chunks.push(codeChunk);
          codeSampleCount++;
        }
      }
    }
  }

  return chunks;
}

// =============================================================================
// OPENAPI SPEC LOADER (for MDX parser integration)
// =============================================================================

/**
 * Cached OpenAPI spec loader for efficient lookups
 */
export class OpenAPISpecLoader {
  private spec: OpenAPISpec | null = null;
  private specPath: string;

  constructor(specPath: string) {
    this.specPath = specPath;
  }

  /**
   * Load the spec (cached after first load)
   */
  load(): OpenAPISpec {
    if (!this.spec) {
      const content = fs.readFileSync(this.specPath, 'utf-8');
      this.spec = parseYaml(content);
    }
    return this.spec!;
  }

  /**
   * Look up an endpoint and generate content using the exact same logic as createApiDocChunk
   * @param method - HTTP method (get, post, etc.)
   * @param apiPath - API path (e.g., /payments, /payments/{id})
   * @returns Generated content string or null if not found
   */
  lookupEndpoint(method: string, apiPath: string): string | null {
    const spec = this.load();
    const methodLower = method.toLowerCase() as keyof PathItem;

    // Find the path item
    let pathItem = spec.paths[apiPath];
    if (!pathItem) {
      // Try with/without trailing slash
      const altPath = apiPath.endsWith('/') ? apiPath.slice(0, -1) : apiPath + '/';
      pathItem = spec.paths[altPath];
      if (!pathItem) {
        return null;
      }
    }

    const operation = pathItem[methodLower];
    if (!operation) {
      return null;
    }

    const schemas = spec.components?.schemas || {};
    const servers = spec.servers || [];

    // Use the EXACT same function that creates chunks for standalone OpenAPI parsing
    const chunk = createApiDocChunk(method, apiPath, operation, schemas, servers);
    return chunk.content;
  }
}
