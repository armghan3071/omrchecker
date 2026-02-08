import logger from '../logger.js'; // Assuming you will provide logger.js

// Base Processor Class
export class Processor {
    constructor(options = {}, relativeDir = null, imageInstanceOps = null) {
        this.options = options;
        this.relativeDir = relativeDir;
        this.imageInstanceOps = imageInstanceOps;
        this.tuning_config = imageInstanceOps ? imageInstanceOps.tuning_config : {};
        this.description = "UNKNOWN";
    }
}

// Base ImagePreprocessor Class
export class ImagePreprocessor extends Processor {
    constructor(options, relativeDir, imageInstanceOps) {
        super(options, relativeDir, imageInstanceOps);
    }

    apply_filter(image, filename) {
        throw new Error("NotImplementedError: apply_filter must be overridden");
    }

    static exclude_files() {
        return [];
    }
}

// Processor Manager (Registry System)
class ProcessorManager {
    constructor() {
        this.processors = {};
        this.loadedPackages = [];
    }

    // JS cannot "walk" folders. We manually register classes here.
    register(ClassRef) {
        const name = ClassRef.name;
        // Avoid registering base classes
        if (name !== 'Processor' && name !== 'ImagePreprocessor') {
            this.processors[name] = ClassRef;
            this.loadedPackages.push(name);
        }
    }

    getProcessor(name) {
        return this.processors[name];
    }
    
    logLoaded() {
        logger.info(`Loaded processors: ${this.loadedPackages.join(', ')}`);
    }
}

export const PROCESSOR_MANAGER = new ProcessorManager();