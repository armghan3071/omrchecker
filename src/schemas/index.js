/**
 * src/schemas/index.js
 */
import { CONFIG_SCHEMA } from './config_schema.js';
import { EVALUATION_SCHEMA } from './evaluation_schema.js';
import { TEMPLATE_SCHEMA } from './template_schema.js';

export const SCHEMA_JSONS = {
    "config": CONFIG_SCHEMA,
    "evaluation": EVALUATION_SCHEMA,
    "template": TEMPLATE_SCHEMA,
};

// Placeholder: Real validators (like Ajv instances) would be initialized here 
// if validation logic is moved client-side.
export const SCHEMA_VALIDATORS = {};