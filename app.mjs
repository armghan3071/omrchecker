// src/wrapper.js

// 1. Import the worker using Vite's inline suffix
// This tells Vite: "Bundle this file, turn it into a string, and give me a constructor."
import WorkerConstructor from './src/worker.mjs?worker&inline';

export class OMRChecker {
    constructor(config = {}) {
        this.worker = null;
        this.config = config || {
            cv: null,
            includeOutputImages: false
        };
        this.onLog = (level, msg) => console.log(`[OMR] ${level}: ${msg}`);
    }

    init() {
        if (this.worker) return;

        this.onLog('INFO', 'Initializing OMR Worker...');
        // 2. Instantiate directly (No URL needed!)
        this.worker = new WorkerConstructor();
        this.onLog('INFO', 'OMR Worker initialized.');
    }

    async process(images, template, marker, setLayout = false) {
        this.init();
        
        return new Promise((resolve, reject) => {
            // Set up the message handler for this specific process run
            const previousHandler = this.worker.onmessage;
            
            this.worker.onmessage = (e) => {
                const { type, payload } = e.data;
                
                if (type === 'LOG') {
                    this.onLog(payload.level, payload.message);
                } else if (type === 'DONE') {
                    resolve(payload);
                } else if (type === 'ERROR') {
                    reject(new Error(payload.message));
                } else if (type === 'SHOW_IMAGE') {
                    // Handle image display requests from worker
                    if (this.onShowImage) {
                        this.onShowImage(payload);
                    }
                }
            };

            const workerConfig = { ...this.config };
            if (workerConfig.cv) {
                workerConfig.opencvAvailable = true;
                delete workerConfig.cv;
            }

            this.worker.postMessage({
                command: 'START',
                payload: {
                    files: images.map(f => ({ name: f.name, content: f })),
                    template,
                    marker,
                    setLayout,
                    config: workerConfig
                }
            });
        });
    }

    terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
    }
}