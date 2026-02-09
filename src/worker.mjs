import cv from '@techstark/opencv-js';
import { process_dir } from './entry.js';
import { VFS } from './utils/file.js';
import logger from './logger.js';

// Expose cv to global scope for other modules
self.cv = cv;

// Setup CV
let cvReady = false;
cv.onRuntimeInitialized = () => { cvReady = true; };

// Setup Logger
logger.setCallback((level, message) => {
    self.postMessage({ type: 'LOG', payload: { level, message } });
});

self.onmessage = async (e) => {
    // Wait for OpenCV
    if (!cvReady) {
        await new Promise(resolve => {
            const check = setInterval(() => {
                if (cvReady) { clearInterval(check); resolve(); }
            }, 50);
        });
    }

    const { command, payload } = e.data;
    if (command === 'START') {
        try {
            VFS.files.clear();
            
            // Helper to fetch if URL
            const fetchIfNeeded = async (val) => {
                if (typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://'))) {
                    try {
                        const res = await fetch(val);
                        if (!res.ok) throw new Error(`Failed to fetch ${val}: ${res.statusText}`);
                        // If it's a JSON file (template), return text. Otherwise blob (marker image)
                        const contentType = res.headers.get('content-type');
                        if (contentType && contentType.includes('application/json')) return res.text();
                        if (val.endsWith('.json')) return res.text();
                        return res.blob();
                    } catch (e) {
                        logger.error(`Error fetching URL ${val}: ${e.message}`);
                        throw e;
                    }
                }
                return val;
            };

            // Inject Template
            if (payload.template) {
                let content = await fetchIfNeeded(payload.template);
                const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
                VFS.files.set('inputs/template.json', contentStr);
            }
            // Inject Marker
            if (payload.marker) {
                 const content = await fetchIfNeeded(payload.marker);
                 VFS.files.set('inputs/omr_marker.jpg', content);
            }
            // Inject Images
            payload.files.forEach(f => VFS.files.set(`inputs/${f.name}`, f.content));

            // Run
            const processResults = await process_dir("inputs", "inputs", { 
                output_dir: "outputs", 
                setLayout: payload.setLayout || false 
            });

            // Gather Results (Legacy CSVs + New JSON)
            logger.info("Gathering results...");
            const vfsFiles = {};
            for (const [path, content] of VFS.files.entries()) {
                if (path.startsWith('outputs/') && path.endsWith('.csv')) {
                    vfsFiles[path] = content;
                }
            }
            logger.info("Processing complete. Sending results to main thread.");
            self.postMessage({ type: 'DONE', payload: processResults });

        } catch (error) {
            self.postMessage({ type: 'ERROR', payload: { message: error.message } });
        }
    }
};