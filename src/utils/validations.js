/**
 * src/utils/validations.js
 */
import { logger } from '../logger.js';

// Mocks for schema validation (since Ajv/jsonschema is heavy)
// In a full implementation, you would use 'ajv' here.
export function validate_evaluation_json(json, path) {
    logger.info(`Validating evaluation.json: ${path}`);
    if (!json.source_type) throw new Error("Evaluation JSON missing 'source_type'");
}

export function validate_template_json(json, path) {
    logger.info(`Validating template.json: ${path}`);
    if (!json.fieldBlocks) throw new Error("Template JSON missing 'fieldBlocks'");
}

export function validate_config_json(json, path) {
    logger.info(`Validating config.json: ${path}`);
}