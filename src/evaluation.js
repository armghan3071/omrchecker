/**
 * src/evaluation.js
 * Replaces evaluation.py
 */
import { logger } from './logger.js';
import { 
    BONUS_SECTION_PREFIX, 
    DEFAULT_SECTION_KEY, 
    MARKING_VERDICT_TYPES 
} from './schemas/constants.js';
import { 
    open_evaluation_with_validation, 
    parse_fields, 
    parse_float_or_fraction,
    get_concatenated_response
} from './utils/parsing.js';
import { load_json, VFS } from './utils/file.js';
import { ImageInstanceOps } from './core.js'; // For answer key generation

// Helper to parse Python-style lists from CSV strings: "['A', 'B']" -> Array
function parsePythonList(str) {
    try {
        // Replace single quotes with double quotes for JSON compatibility
        const jsonStr = str.replace(/'/g, '"');
        return JSON.parse(jsonStr);
    } catch (e) {
        return str; // Fallback to raw string
    }
}

class AnswerMatcher {
    constructor(answerItem, sectionMarkingScheme) {
        this.sectionMarkingScheme = sectionMarkingScheme;
        this.answerItem = answerItem;
        this.answerType = this.validateAndGetAnswerType(answerItem);
        this.setDefaultsFromScheme(sectionMarkingScheme);
    }

    isStandardAnswer(element) {
        return typeof element === 'string' && element.length >= 1;
    }

    validateAndGetAnswerType(answerItem) {
        if (this.isStandardAnswer(answerItem)) return "standard";
        
        if (Array.isArray(answerItem)) {
            // Check for multiple-correct: ['A', 'B']
            if (answerItem.every(i => this.isStandardAnswer(i))) {
                return "multiple-correct";
            }
            // Check for weighted: [['A', 1], ['B', 0.5]]
            const isWeighted = answerItem.every(i => Array.isArray(i) && i.length === 2);
            if (isWeighted) return "multiple-correct-weighted";
        }
        
        throw new Error(`Unable to determine answer type: ${JSON.stringify(answerItem)}`);
    }

    setDefaultsFromScheme(scheme) {
        this.emptyVal = scheme.emptyVal;
        this.marking = structuredClone(scheme.marking);

        if (this.answerType === "multiple-correct") {
            for (const ans of this.answerItem) {
                this.marking[`correct-${ans}`] = this.marking["correct"];
            }
        } else if (this.answerType === "multiple-correct-weighted") {
            for (const [ans, score] of this.answerItem) {
                this.marking[`correct-${ans}`] = parse_float_or_fraction(score);
            }
        }
    }

    getVerdictMarking(markedAnswer) {
        let verdict = "incorrect";
        if (this.answerType === "standard") {
            verdict = (markedAnswer === this.emptyVal) ? "unmarked" :
                      (markedAnswer === this.answerItem) ? "correct" : "incorrect";
        } else if (this.answerType === "multiple-correct" || this.answerType === "multiple-correct-weighted") {
            // Simplified check: markedAnswer must match one of the allowed options exactly
            // Note: OMR engines usually return a single string "AB" or "A".
            // Logic assumes strict matching unless split logic is added.
            const allowed = (this.answerType === "multiple-correct") ? this.answerItem : this.answerItem.map(i => i[0]);
            
            if (markedAnswer === this.emptyVal) verdict = "unmarked";
            else if (allowed.includes(markedAnswer)) verdict = `correct-${markedAnswer}`;
            else verdict = "incorrect";
        }
        
        return { verdict, score: this.marking[verdict] || this.marking["incorrect"] };
    }
}

class SectionMarkingScheme {
    constructor(key, scheme, emptyVal) {
        this.sectionKey = key;
        this.emptyVal = emptyVal;
        
        if (key === DEFAULT_SECTION_KEY) {
            this.questions = null;
            this.marking = this.parseMarking(scheme);
        } else {
            this.questions = parse_fields(key, scheme.questions);
            this.marking = this.parseMarking(scheme.marking);
        }
    }

    parseMarking(markingObj) {
        const res = {};
        for (const type of MARKING_VERDICT_TYPES) {
            res[type] = parse_float_or_fraction(markingObj[type]);
        }
        return res;
    }
}

export class EvaluationConfig {
    constructor(currDir, evalPath, template, tuningConfig) {
        const json = open_evaluation_with_validation(evalPath);
        this.options = json.options || {};
        this.markingSchemes = json.marking_schemes;
        this.sourceType = json.source_type;
        
        this.shouldExplainScoring = this.options.should_explain_scoring || false;
        this.questionsInOrder = [];
        this.excludeFiles = [];
        this.questionToScheme = {};
        this.sectionMarkingSchemes = {};

        // 1. Load Answer Key
        let answersInOrder = [];

        if (this.sourceType === "csv") {
            const csvPath = `${currDir}/${this.options.answer_key_csv_path}`;
            if (VFS.files.has(csvPath)) {
                const content = VFS.files.get(csvPath);
                // Simple CSV Parse (Key, Value)
                const lines = content.trim().split('\n');
                for (const line of lines) {
                    const [q, a] = line.split(',').map(s => s.trim());
                    this.questionsInOrder.push(q);
                    answersInOrder.push(parsePythonList(a));
                }
            } else {
                throw new Error(`Answer key CSV not found: ${csvPath}`);
            }
        } else {
            this.questionsInOrder = parse_fields("questions_in_order", this.options.questions_in_order);
            answersInOrder = this.options.answers_in_order;
        }

        // 2. Setup Schemes
        for (const [key, scheme] of Object.entries(this.markingSchemes)) {
            const instance = new SectionMarkingScheme(key, scheme, template.global_empty_val);
            if (key === DEFAULT_SECTION_KEY) {
                this.defaultScheme = instance;
            } else {
                this.sectionMarkingSchemes[key] = instance;
                instance.questions.forEach(q => this.questionToScheme[q] = instance);
            }
        }

        // 3. Map Questions to Matchers
        this.questionToMatcher = {};
        this.questionsInOrder.forEach((q, idx) => {
            const scheme = this.questionToScheme[q] || this.defaultScheme;
            this.questionToMatcher[q] = new AnswerMatcher(answersInOrder[idx], scheme);
        });
    }
}

export function evaluate_concatenated_response(response, config) {
    let score = 0.0;
    for (const q of config.questionsInOrder) {
        const marked = response[q];
        if (marked !== undefined) {
            const matcher = config.questionToMatcher[q];
            const { verdict, score: delta } = matcher.getVerdictMarking(marked);
            score += delta;
            
            if (config.shouldExplainScoring) {
                // In browser, we just log explanation
                logger.info(`Q: ${q} | Marked: ${marked} | Verdict: ${verdict} | Delta: ${delta}`);
            }
        }
    }
    return score;
}