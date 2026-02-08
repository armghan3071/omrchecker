/**
 * src/template.js
 * Fixed orientation logic in generate_bubble_grid
 */
import { ImageInstanceOps } from './core.js';
import { FIELD_TYPES } from './constants.js';
import { PROCESSOR_MANAGER } from './processors/index.js';
import logger from './logger.js';
import { parse_fields, custom_sort_output_columns } from './utils/parsing.js';

export class Template {
    constructor(templateJson, tuningConfig) {
        this.path = templateJson._path || "template.json";
        this.image_instance_ops = new ImageInstanceOps(tuningConfig);

        const json = templateJson;

        this.custom_labels = json.customLabels || {};
        this.field_blocks_object = json.fieldBlocks || {};
        this.output_columns_array = json.outputColumns || [];
        this.pre_processors_object = json.preProcessors || [];
        this.bubbleDimensions = json.bubbleDimensions || [32, 32];
        this.global_empty_val = json.emptyValue || "";
        this.options = json.options || {};
        this.page_dimensions = json.pageDimensions || [1640, 2332]; 

        this.parse_output_columns(this.output_columns_array);
        this.setup_pre_processors(this.pre_processors_object);
        this.setup_field_blocks(this.field_blocks_object);
        this.parse_custom_labels(this.custom_labels);

        const nonCustomCols = Array.from(this.non_custom_labels);
        const allCustomCols = Object.keys(this.custom_labels);

        if (this.output_columns.length === 0) {
            this.fill_output_columns(nonCustomCols, allCustomCols);
        }

        this.outputColumns = this.output_columns; 
        this.fieldBlocks = this.field_blocks;
        this.pageDimensions = this.page_dimensions; 
    }

    parse_output_columns(arr) { this.output_columns = parse_fields("Output Columns", arr); }

    setup_pre_processors(arr) {
        this.pre_processors = [];
        for (const pp of arr) {
            const ProcessorClass = PROCESSOR_MANAGER.getProcessor(pp.name);
            if (ProcessorClass) {
                this.pre_processors.push(new ProcessorClass(pp.options, null, this.image_instance_ops));
            }
        }
    }

    setup_field_blocks(obj) {
        this.field_blocks = [];
        this.all_parsed_labels = new Set();
        for (const [name, config] of Object.entries(obj)) {
            this.parse_and_add_field_block(name, config);
        }
    }

    parse_and_add_field_block(name, config) {
        const fullConfig = this.pre_fill_field_block(config);
        const block = new FieldBlock(name, fullConfig);
        this.field_blocks.push(block);
        this.validate_parsed_labels(fullConfig.fieldLabels, block);
    }

    pre_fill_field_block(config) {
        const typeDefaults = config.fieldType ? FIELD_TYPES[config.fieldType] : { fieldType: "__CUSTOM__" };
        return {
            direction: "vertical",
            emptyValue: this.global_empty_val,
            bubbleDimensions: this.bubbleDimensions,
            ...typeDefaults,
            ...config
        };
    }

    parse_custom_labels(obj) {
        this.custom_labels = {}; 
        const allParsedCustom = new Set();
        for (const [label, fields] of Object.entries(obj)) {
            const parsed = parse_fields(`Custom Label: ${label}`, fields);
            this.custom_labels[label] = parsed;
            parsed.forEach(p => allParsedCustom.add(p));
        }
        this.non_custom_labels = new Set();
        for (const label of this.all_parsed_labels) {
            if (!allParsedCustom.has(label)) this.non_custom_labels.add(label);
        }
    }

    fill_output_columns(nonCustom, allCustom) {
        const all = [...nonCustom, ...allCustom];
        this.output_columns = all.sort((a, b) => {
            const valA = custom_sort_output_columns(a);
            const valB = custom_sort_output_columns(b);
            if (valA.prefix < valB.prefix) return -1;
            if (valA.prefix > valB.prefix) return 1;
            return valA.num - valB.num;
        });
    }

    validate_parsed_labels(originalLabels, block) {
        for (const label of block.parsed_field_labels) {
            this.all_parsed_labels.add(label);
        }
    }
}

class FieldBlock {
    constructor(name, config) {
        this.name = name;
        this.shift = 0;
        this.origin = config.origin;
        this.bubbleDimensions = config.bubbleDimensions;
        this.bubbleValues = config.bubbleValues;
        this.bubblesGap = config.bubblesGap;
        this.labelsGap = config.labelsGap;
        this.fieldLabels = config.fieldLabels;
        this.fieldType = config.fieldType;
        this.direction = config.direction;
        this.empty_val = config.emptyValue;
        this.parsed_field_labels = parse_fields(`Block ${name}`, this.fieldLabels);
        this.calculate_dimensions();
        this.generate_bubble_grid();
    }

    calculate_dimensions() {
        const isVert = this.direction === "vertical";
        const h = isVert ? 1 : 0;
        const v = isVert ? 0 : 1;
        const valDim = (this.bubblesGap * (this.bubbleValues.length - 1)) + this.bubbleDimensions[h];
        const fieldDim = (this.labelsGap * (this.parsed_field_labels.length - 1)) + this.bubbleDimensions[v];
        this.dimensions = isVert ? [fieldDim, valDim] : [valDim, fieldDim];
    }

    generate_bubble_grid() {
        this.traverse_bubbles = [];
        const isVert = this.direction === "vertical";
        
        // _h: axis index for bubbles (where bubbles grow)
        // _v: axis index for labels (where questions grow)
        // Vert: bubbles grow Y (1), labels grow X (0)
        // Horz: bubbles grow X (0), labels grow Y (1)
        const h = isVert ? 1 : 0; 
        const v = isVert ? 0 : 1;

        let leadX = this.origin[0];
        let leadY = this.origin[1];

        for (const label of this.parsed_field_labels) {
            const rowBubbles = [];
            let bubX = leadX;
            let bubY = leadY;

            for (const val of this.bubbleValues) {
                rowBubbles.push({
                    x: Math.round(bubX),
                    y: Math.round(bubY),
                    field_label: label,
                    field_value: val,
                    field_type: this.fieldType
                });

                // Move Bubble Position (Inner Loop)
                if (h === 0) bubX += this.bubblesGap; // Horizontal expansion
                else bubY += this.bubblesGap;         // Vertical expansion
            }
            this.traverse_bubbles.push(rowBubbles);

            // Move Label Position (Outer Loop)
            if (v === 0) leadX += this.labelsGap;     // Horizontal expansion
            else leadY += this.labelsGap;             // Vertical expansion
        }
    }
}