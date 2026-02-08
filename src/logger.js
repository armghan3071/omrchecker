/**
 * src/logger.js
 */
class OMRLogger {
    constructor() {
        this.callback = null;
    }
    setCallback(cb) {
        this.callback = cb;
    }
    info(msg) { this.logToMain('INFO', msg); }
    warning(msg) { this.logToMain('WARNING', msg); }
    error(msg) { this.logToMain('ERROR', msg); }
    debug(msg) { this.logToMain('DEBUG', msg); }
    critical(msg) { this.logToMain('ERROR', `CRITICAL: ${msg}`); }

    logToMain(level, message) {
        if (this.callback) {
            this.callback(level, message);
            return;
        }
        if (typeof self !== 'undefined' && self.postMessage) {
            self.postMessage({ 
                type: 'LOG', 
                payload: { level, message: String(message) } 
            });
        } else {
            console.log(`[${level}] ${message}`);
        }
    }
}

const omrLogger = new OMRLogger();
export default omrLogger;