import { process_dir } from './entry.js';
import { VFS } from './utils/file.js';
import logger from './logger.js';

// Setup Logger
logger.setCallback((level, message) => {
    self.postMessage({ type: 'LOG', payload: { level, message } });
});

let cvReady = false;
const CV_URL = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.12.0-release.1/dist/opencv.min.js';

async function waitForOpenCV(config) {
    // 1. Check if explicitly provided (assumed ready or handled externally)
    if (config && config.opencvAvailable) {
        if (self.cv) cvReady = true;
        return;
    }

    // 2. Check if already loaded in global scope
    if (self.cv) {
        // Assume it's initializing or ready.
        if (!cvReady) {
             // Try to hook or wait
             await new Promise(r => {
                 if (self.cv.onRuntimeInitialized) {
                      const prev = self.cv.onRuntimeInitialized;
                      self.cv.onRuntimeInitialized = () => { if(prev) prev(); r(); };
                 } else {
                      // Poll
                      const i = setInterval(() => {
                          try { 
                              if (self.cv.Mat) {
                                clearInterval(i); 
                                r(); 
                              }
                          } catch(e){}
                      }, 50);
                 }
             });
             cvReady = true;
        }
        return;
    }

    // 3. Load from CDN
    logger.info("Loading OpenCV from CDN...");
    importScripts(CV_URL);
    
    // 4. Wait for initialization
    await new Promise((resolve) => {
        // If the script loaded, cv should be defined.
        if (!self.cv) {
            // Should not happen if importScripts succeeded
             resolve(); 
             return; 
        }

        if (!self.cv.onRuntimeInitialized) {
             self.cv.onRuntimeInitialized = resolve;
             
             // Fallback poll
             const i = setInterval(() => {
                 if (self.cv.Mat) { clearInterval(i); resolve(); }
             }, 100);
        } else {
            // If it was already set? 
            // Usually opencv.js checks if onRuntimeInitialized is defined and calls it when ready.
            // If we set it now, it might be too late if it's already ready?
            // So we poll too.
             const i = setInterval(() => {
                 if (self.cv.Mat) { clearInterval(i); resolve(); }
             }, 100);
        }
    });
    cvReady = true;
    logger.info("OpenCV Initialized.");
}

self.onmessage = async (e) => {
    const { command, payload } = e.data;
    if (command === 'START') {
        try {
            await waitForOpenCV(payload.config);

            if (!self.cv) throw new Error("OpenCV failed to load. Please check network or config.");

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
                setLayout: payload.setLayout || false,
                includeOutputImages: payload.config.includeOutputImages || false
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
