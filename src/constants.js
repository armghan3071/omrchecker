/**
 * src/constants.js
 */
import { createDotMap } from './defaults/config.js'; // Reusing the helper from step 1

export const FIELD_LABEL_NUMBER_REGEX = /([^\d]+)(\d*)/;

export const ERROR_CODES = createDotMap({
    MULTI_BUBBLE_WARN: 1,
    NO_MARKER_ERR: 2,
}, false);

export const FIELD_TYPES = {
    "QTYPE_INT": {
        "bubbleValues": ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
        "direction": "vertical",
    },
    "QTYPE_INT_FROM_1": {
        "bubbleValues": ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
        "direction": "vertical",
    },
    "QTYPE_MCQ4": { "bubbleValues": ["A", "B", "C", "D"], "direction": "horizontal" },
    "QTYPE_MCQ5": {
        "bubbleValues": ["A", "B", "C", "D", "E"],
        "direction": "horizontal",
    },
};

// UI Colors (Getters to avoid premature cv access)
export const get_CLR_BLACK = () => new cv.Scalar(50, 150, 150, 255);
export const get_CLR_WHITE = () => new cv.Scalar(250, 250, 250, 255);
export const get_CLR_GRAY = () => new cv.Scalar(130, 130, 130, 255);
export const get_CLR_DARK_GRAY = () => new cv.Scalar(100, 100, 100, 255);
export const TEXT_SIZE = 0.95;

export const GLOBAL_PAGE_THRESHOLD_WHITE = 200;
export const GLOBAL_PAGE_THRESHOLD_BLACK = 100;