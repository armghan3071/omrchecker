/**
 * src/utils/parsing.js
 */
import { load_json } from './file.js';
import { CONFIG_DEFAULTS } from '../defaults/config.js';
import { TEMPLATE_DEFAULTS } from '../defaults/template.js';
import { validate_config_json, validate_template_json, validate_evaluation_json } from './validations.js';
import { createDotMap } from '../defaults/config.js';

import { FIELD_LABEL_NUMBER_REGEX } from '../constants.js';
// Regex Constants
const FIELD_STRING_REGEX_GROUPS = /([^\.\d]+)(\d+)\.{2,3}(\d+)/;

// Deep Merge helper
function deepMerge(target, source) {
    for (const key of Object.keys(source)) {
        if (source[key] instanceof Object && key in target) {
            Object.assign(source[key], deepMerge(target[key], source[key]));
        }
    }
    Object.assign(target || {}, source);
    return target;
}

export function get_concatenated_response(omr_response, template) {
    const concatenated = {};
    
    // Custom labels
    for (const [label, keys] of Object.entries(template.custom_labels)) {
        concatenated[label] = keys.map(k => omr_response[k] || "").join("");
    }
    
    // Non-custom labels
    for (const label of template.non_custom_labels) {
        concatenated[label] = omr_response[label];
    }
    
    return concatenated;
}

export function open_config_with_defaults(path) {
    const userConfig = load_json(path);
    const merged = deepMerge(structuredClone(CONFIG_DEFAULTS), userConfig);
    validate_config_json(merged, path);
    return createDotMap(merged, false);
}

export function open_template_with_defaults(path) {
    const userTemplate = load_json(path);
    const merged = deepMerge(structuredClone(TEMPLATE_DEFAULTS), userTemplate);
    validate_template_json(merged, path);
    return merged;
}

export function open_evaluation_with_validation(path) {
    const json = load_json(path);
    validate_evaluation_json(json, path);
    return json;
}

export function parse_fields(key, fields) {
    const parsed = [];
    const fieldSet = new Set();
    
    for (const fieldStr of fields) {
        const arr = parse_field_string(fieldStr);
        const currentSet = new Set(arr);
        
        // Check disjoint
        for (const item of currentSet) {
            if (fieldSet.has(item)) {
                throw new Error(`Given field string '${fieldStr}' has overlapping field(s) with other fields in '${key}'`);
            }
            fieldSet.add(item);
        }
        parsed.push(...arr);
    }
    return parsed;
}

export function parse_field_string(fieldStr) {
    if (fieldStr.includes(".")) {
        const match = fieldStr.match(FIELD_STRING_REGEX_GROUPS);
        if (match) {
            const prefix = match[1];
            const start = parseInt(match[2]);
            const end = parseInt(match[3]);
            
            if (start >= end) {
                throw new Error(`Invalid range in fields string: '${fieldStr}'`);
            }
            
            const res = [];
            for (let i = start; i <= end; i++) {
                res.push(`${prefix}${i}`);
            }
            return res;
        }
        return [fieldStr];
    }
    return [fieldStr];
}

export function custom_sort_output_columns(fieldLabel) {
    const match = fieldLabel.match(FIELD_LABEL_NUMBER_REGEX);
    if (match) {
        const prefix = match[1];
        const num = match[2] ? parseInt(match[2]) : 0;
        // Return string for sorting comparison logic
        return `${prefix}${num.toString().padStart(6, '0')}`;
    }
    return fieldLabel;
}

export function parse_float_or_fraction(result) {
    if (typeof result === 'string' && result.includes('/')) {
        const [n, d] = result.split('/');
        return parseFloat(n) / parseFloat(d);
    }
    return parseFloat(result);
}