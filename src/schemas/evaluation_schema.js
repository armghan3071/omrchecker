/**
 * src/schemas/evaluation_schema.js
 */
import { ARRAY_OF_STRINGS, DEFAULT_SECTION_KEY, FIELD_STRING_TYPE } from './constants.js';

const marking_score_regex = "-?(\\d+)(/(\\d+))?";

const marking_score = {
    "oneOf": [
        {"type": "string", "pattern": marking_score_regex},
        {"type": "number"},
    ]
};

const marking_object_properties = {
    "additionalProperties": false,
    "required": ["correct", "incorrect", "unmarked"],
    "type": "object",
    "properties": {
        "correct": marking_score,
        "incorrect": marking_score,
        "unmarked": marking_score,
    },
};

export const EVALUATION_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "https://github.com/Udayraj123/OMRChecker/tree/master/src/schemas/evaluation-schema.json",
    "title": "Evaluation Schema",
    "description": "OMRChecker evaluation schema i.e. the marking scheme",
    "type": "object",
    "additionalProperties": true,
    "required": ["source_type", "options", "marking_schemes"],
    "properties": {
        "additionalProperties": false,
        "source_type": {"type": "string", "enum": ["csv", "custom"]},
        "options": {"type": "object"},
        "marking_schemes": {
            "type": "object",
            "required": [DEFAULT_SECTION_KEY],
            "patternProperties": {
                [`^${DEFAULT_SECTION_KEY}$`]: marking_object_properties,
                [`^(?!${DEFAULT_SECTION_KEY}$).*`]: {
                    "additionalProperties": false,
                    "required": ["marking", "questions"],
                    "type": "object",
                    "properties": {
                        "questions": {
                            "oneOf": [
                                FIELD_STRING_TYPE,
                                {
                                    "type": "array",
                                    "items": FIELD_STRING_TYPE,
                                },
                            ]
                        },
                        "marking": marking_object_properties,
                    },
                },
            },
        },
    },
    "allOf": [
        {
            "if": {"properties": {"source_type": {"const": "csv"}}},
            "then": {
                "properties": {
                    "options": {
                        "additionalProperties": false,
                        "required": ["answer_key_csv_path"],
                        "dependentRequired": {
                            "answer_key_image_path": [
                                "answer_key_csv_path",
                                "questions_in_order",
                            ]
                        },
                        "type": "object",
                        "properties": {
                            "should_explain_scoring": {"type": "boolean"},
                            "answer_key_csv_path": {"type": "string"},
                            "answer_key_image_path": {"type": "string"},
                            "questions_in_order": ARRAY_OF_STRINGS,
                        },
                    }
                }
            },
        },
        {
            "if": {"properties": {"source_type": {"const": "custom"}}},
            "then": {
                "properties": {
                    "options": {
                        "additionalProperties": false,
                        "required": ["answers_in_order", "questions_in_order"],
                        "type": "object",
                        "properties": {
                            "should_explain_scoring": {"type": "boolean"},
                            "answers_in_order": {
                                "oneOf": [
                                    {
                                        "type": "array",
                                        "items": {
                                            "oneOf": [
                                                {"type": "string"},
                                                {
                                                    "type": "array",
                                                    "items": {"type": "string"},
                                                    "minItems": 2,
                                                },
                                                {
                                                    "type": "array",
                                                    "items": {
                                                        "type": "array",
                                                        "items": false,
                                                        "minItems": 2,
                                                        "maxItems": 2,
                                                        "prefixItems": [
                                                            {"type": "string"},
                                                            marking_score,
                                                        ],
                                                    },
                                                },
                                            ],
                                        },
                                    },
                                ]
                            },
                            "questions_in_order": ARRAY_OF_STRINGS,
                        },
                    }
                }
            },
        },
    ],
};