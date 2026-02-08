import cv from '@techstark/opencv-js';
import { process_dir } from './entry.js';
import { VFS } from './utils/file.js';
import { logger } from './logger.js';

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
            
            // Inject Template
            if (payload.template) {
                const content = typeof payload.template === 'string' ? payload.template : JSON.stringify(payload.template);
                VFS.files.set('inputs/template.json', content);
            }
            // Inject Marker
            if (payload.marker) VFS.files.set('inputs/omr_marker.jpg', payload.marker);
            // Inject Images
            payload.files.forEach(f => VFS.files.set(`inputs/${f.name}`, f.content));

            // Run
            await process_dir("inputs", "inputs", { 
                output_dir: "outputs", 
                setLayout: payload.setLayout || false 
            });

            // Gather Results
            const results = {};
            for (const [path, content] of VFS.files.entries()) {
                if (path.startsWith('outputs/') && path.endsWith('.csv')) {
                    results[path] = content;
                }
            }
            self.postMessage({ type: 'DONE', payload: results });

        } catch (error) {
            self.postMessage({ type: 'ERROR', payload: { message: error.message } });
        }
    }
};