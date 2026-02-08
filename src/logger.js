/**
 * src/logger.js
 */
export const logger = {
    info: (msg) => logToMain('INFO', msg),
    warning: (msg) => logToMain('WARNING', msg),
    error: (msg) => logToMain('ERROR', msg),
    debug: (msg) => logToMain('DEBUG', msg),
    critical: (msg) => logToMain('ERROR', `CRITICAL: ${msg}`),
};

function logToMain(level, message) {
    // Check if we are in a Worker context
    if (typeof self !== 'undefined' && self.postMessage) {
        self.postMessage({ 
            type: 'LOG', 
            payload: { level, message: String(message) } 
        });
    } else {
        // Fallback for main thread or testing
        console.log(`[${level}] ${message}`);
    }
}