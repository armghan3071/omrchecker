/**
 * src/schemas/constants.js
 */
export const DEFAULT_SECTION_KEY = "DEFAULT";
export const BONUS_SECTION_PREFIX = "BONUS";
export const MARKING_VERDICT_TYPES = ["correct", "incorrect", "unmarked"];

export const ARRAY_OF_STRINGS = {
    "type": "array",
    "items": {"type": "string"},
};

export const FIELD_STRING_TYPE = {
    "type": "string",
    "pattern": "^([^\\.]+|[^\\.\\d]+\\d+\\.{2,3}\\d+)$",
};

// Converted to string for RegExp constructor use if needed, 
// matching Python r"..." raw string behavior.
export const FIELD_STRING_REGEX_GROUPS = "([^\\.\\d]+)(\d+)\\.{2,3}(\d+)";