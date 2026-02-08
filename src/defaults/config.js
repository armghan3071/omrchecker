/**
 * src/defaults/config.js
 * Replaces src/defaults/config.py
 */

// Helper: Replicates Python's DotMap behavior using ES6 Proxies
// If _dynamic=false (default for this config), it behaves like a normal object.
export function createDotMap(obj = {}, dynamic = true) {
    if (!dynamic) return obj;

    const handler = {
        get(target, prop) {
            // If key doesn't exist, auto-initialize it as a new DotMap
            if (!(prop in target) && typeof prop === 'string') {
                target[prop] = createDotMap({}, true);
            }
            return Reflect.get(target, prop);
        }
    };
    return new Proxy(obj, handler);
}

// Equivalent to CONFIG_DEFAULTS = DotMap({...}, _dynamic=False)
// Since _dynamic is False, we export a standard JS object.
export const CONFIG_DEFAULTS = {
    dimensions: {
        display_height: 2480,
        display_width: 1640,
        processing_height: 820,
        processing_width: 666,
    },
    threshold_params: {
        GAMMA_LOW: 0.7,
        MIN_GAP: 30,
        MIN_JUMP: 25,
        CONFIDENT_SURPLUS: 5,
        JUMP_DELTA: 30,
        PAGE_TYPE_FOR_THRESHOLD: "white",
    },
    alignment_params: {
        // Note: 'auto_align' enables automatic template alignment
        auto_align: false,
        match_col: 5,
        max_steps: 20,
        stride: 1,
        thickness: 3,
    },
    outputs: {
        show_image_level: 0,
        save_image_level: 0,
        save_detections: true,
        filter_out_multimarked_files: false,
    },
};