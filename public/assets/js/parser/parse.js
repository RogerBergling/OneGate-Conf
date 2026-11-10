import { splitSections, isComment, isBlank } from './tokenize.js';
import { getSchema } from './schema.js';
import { secretMarker } from './secrets.js';

function cleanResource(value) {
  const text = String(value ?? '').trim();
  if (!text || text === '-' || text === '*') return null;
  return text;
}

function cleanMenuDescription(value) {
  return String(value ?? '')
    .replace(/\+/g, ' ')
    .replace(/^"|"$/g, '')
    .trim();
}

export function tokenizeRow(line) {
  const tokens = [];
  let current = '';
  let inQuotes = false;
  let index = 0;

  function flush() {
    const value = current.trim();
    if (value) tokens.push(value);
    current = '';
  }

  while (index < line.length) {
    const character = line[index];

    if (character === '"') {
      inQuotes = !inQuotes;
      index += 1;
      continue;
    }

    if (!inQuotes && character === '\t') {
      flush();
      index += 1;
      while (index < line.length && (line[index] === ' ' || line[index] === '\t')) index += 1;
      continue;
    }

    if (!inQuotes && character === ' ' && line[index + 1] === ' ') {
      flush();
      while (index < line.length && (line[index] === ' ' || line[index] === '\t')) index += 1;
      continue;
    }

    current += character;
    index += 1;
  }

  flush();
  return tokens;
}

function parseProperties(section, schema, vault) {
  const value = {};
  const warnings = [];
  const errors = [];
  const secretKeys = new Set(schema.secrets || []);

  for (const line of section.lines) {
    const text = line.text;
    if (isBlank(text) || isComment(text)) continue;

    const equals = text.indexOf('=');
    if (equals === -1) {
      warnings.push({ line: line.line, message: 'Property line has no "="' });
      continue;
    }

    const key = text.slice(0, equals).trim();
    const rawValue = text.slice(equals + 1).trim();

    if (!key) {
      warnings.push({ line: line.line, message: 'Property line has an empty key' });
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(value, key)) {
      warnings.push({ line: line.line, message: `Duplicate property "${key}"; last value wins` });
    }

    value[key] = secretKeys.has(key)
      ? secretMarker(vault, rawValue, key, `${section.name}.${key}`)
      : rawValue;
  }

  return { kind: 'properties', value, warnings, errors };
}

function parseList(section) {
  const value = [];
  for (const line of section.lines) {
    const text = line.text.trim();
    if (!text || isComment(text)) continue;
    value.push(text);
  }
  return { kind: 'list', value, warnings: [], errors: [] };
}

function parseTable(section, schema) {
  const rows = [];
  const warnings = [];
  const errors = [];

  for (const line of section.lines) {
    const text = line.text;
    if (isBlank(text) || isComment(text)) continue;
    const tokens = tokenizeRow(text);
    if (!tokens.length) continue;

    if (schema.columns) {
      const row = {};
      for (let index = 0; index < schema.columns.length; index += 1) {
        row[schema.columns[index]] = tokens[index] ?? null;
      }
      if (schema.joinFrom !== undefined) {
        const rest = tokens.slice(schema.joinFrom).join(' ').trim();
        row[schema.joinKey] = rest || null;
      }
      rows.push(row);
    } else {
      const row = { fields: tokens };
      if (schema.resourceIndex !== undefined) {
        row.resource = cleanResource(tokens[schema.resourceIndex]);
      }
      if (schema.descriptionIndex !== undefined) {
        row.description = cleanMenuDescription(tokens[schema.descriptionIndex]);
      }
      rows.push(row);
    }
  }

  return { kind: 'table', value: rows, warnings, errors };
}

function redactJson(value, secretKeys, vault, sectionName, path = []) {
  if (Array.isArray(value)) {
    return value.map((item, index) => redactJson(item, secretKeys, vault, sectionName, [...path, String(index)]));
  }

  if (value && typeof value === 'object') {
    const output = {};
    for (const [key, child] of Object.entries(value)) {
      const childPath = [...path, key];
      if (secretKeys.has(key) && (typeof child === 'string' || typeof child === 'number' || child === null || child === undefined)) {
        output[key] = secretMarker(vault, child, key, `${sectionName}.${childPath.join('.')}`);
      } else {
        output[key] = redactJson(child, secretKeys, vault, sectionName, childPath);
      }
    }
    return output;
  }

  return value;
}

function parseJson(section, schema, vault) {
  const text = section.lines.map((line) => line.text).join('\n').trim();
  if (!text) return { kind: 'json', value: null, warnings: [], errors: [] };

  try {
    const parsed = JSON.parse(text);
    const secretKeys = new Set(schema.secrets || []);
    const value = redactJson(parsed, secretKeys, vault, section.name);
    return { kind: 'json', value, warnings: [], errors: [] };
  } catch (error) {
    return {
      kind: 'json',
      value: null,
      warnings: [],
      errors: [{ line: section.startLine, message: `Invalid JSON: ${error.message}` }],
    };
  }
}

export function parseFile({ fileName = '', text = '' }, vault) {
  const split = splitSections(text, fileName);
  const errors = [...split.errors];
  const sections = [];
  const unknownSections = [];

  for (const section of split.sections) {
    const schema = getSchema(section.name) || getSchema(section.baseName);
    const info = {
      name: section.name,
      baseName: section.baseName,
      suffix: section.suffix,
      startLine: section.startLine,
      kind: schema?.kind || 'unknown',
      scope: schema?.scope || 'unknown',
      known: Boolean(schema),
      parsed: false,
      value: null,
      warnings: [],
      errors: [],
    };

    if (!schema) {
      unknownSections.push(section.name);
      sections.push(info);
      continue;
    }

    if (schema.ignore || !schema.parse) {
      sections.push(info);
      continue;
    }

    let parsed;
    switch (schema.kind) {
      case 'properties':
        parsed = parseProperties(section, schema, vault);
        break;
      case 'list':
        parsed = parseList(section);
        break;
      case 'table':
        parsed = parseTable(section, schema);
        break;
      case 'json':
        parsed = parseJson(section, schema, vault);
        break;
      default:
        parsed = { kind: schema.kind, value: null, warnings: [], errors: [] };
        break;
    }

    info.parsed = true;
    info.value = parsed.value;
    info.warnings = parsed.warnings;
    info.errors = parsed.errors;
    sections.push(info);

    for (const warning of parsed.warnings) {
      errors.push({ fileName, line: warning.line, message: warning.message });
    }
    for (const error of parsed.errors) {
      errors.push({ fileName, line: error.line, message: error.message });
    }
  }

  return {
    fileName,
    lineCount: split.lineCount,
    sections,
    unknownSections,
    errors,
  };
}
