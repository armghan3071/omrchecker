// src/wrapper.js

// 1. Import the worker using Vite's inline suffix
// This tells Vite: "Bundle this file, turn it into a string, and give me a constructor."
import WorkerConstructor from './src/worker.js?worker&inline';

export class OMRChecker {
    constructor() {
        this.worker = null;
        this.onLog = (level, msg) => console.log(`[OMR] ${level}: ${msg}`);
    }

    init() {
        if (this.worker) return;

        // 2. Instantiate directly (No URL needed!)
        this.worker = new WorkerConstructor();
        
        this.worker.onmessage = (e) => {
            const { type, payload } = e.data;
            if (type === 'LOG') {
                this.onLog(payload.level, payload.message);
            }
        };
    }

    async process(images, template, marker, setLayout = false) {
        this.init();
        // ... rest of your process logic is exactly the same ...
        return new Promise((resolve, reject) => {
            // ... same promise logic ...
             this.worker.postMessage({
                command: 'START',
                payload: {
                    files: images.map(f => ({ name: f.name, content: f })),
                    template,
                    marker,
                    setLayout
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