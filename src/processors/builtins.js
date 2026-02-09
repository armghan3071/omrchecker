import { ImagePreprocessor } from './manager.js';

export class Levels extends ImagePreprocessor {
    static NAME = "Levels"
    constructor(...args) {
        super(...args);
        
        const options = this.options;
        const low = Math.floor(255 * (options.low || 0));
        const high = Math.floor(255 * (options.high || 1));
        const gamma = options.gamma || 1.0;
        const invGamma = 1.0 / gamma;

        // Create Look Up Table (LUT)
        // cv.LUT requires a Mat of type CV_8U (Uint8)
        this.lutMat = new cv.Mat(1, 256, cv.CV_8U);
        const data = this.lutMat.data;

        for (let i = 0; i < 256; i++) {
            let val = 0;
            if (i <= low) val = 0;
            else if (i >= high) val = 255;
            else {
                val = Math.pow((i - low) / (high - low), invGamma) * 255;
            }
            data[i] = Math.min(255, Math.max(0, val)); // Clamp
        }
    }

    apply_filter(image, _filePath) {
        const dst = new cv.Mat();
        cv.LUT(image, this.lutMat, dst);
        return dst; // Returns new Mat, caller handles cleanup of old 'image' if needed
    }
}

export class MedianBlur extends ImagePreprocessor {
    static NAME = "MedianBlur"
    constructor(...args) {
        super(...args);
        this.kSize = parseInt(this.options.kSize || 5);
    }

    apply_filter(image, _filePath) {
        const dst = new cv.Mat();
        cv.medianBlur(image, dst, this.kSize);
        return dst;
    }
}

export class GaussianBlur extends ImagePreprocessor {
    static NAME = "GaussianBlur"
    constructor(...args) {
        super(...args);
        const kArr = this.options.kSize || [3, 3];
        this.kSize = { width: parseInt(kArr[0]), height: parseInt(kArr[1]) };
        this.sigmaX = parseInt(this.options.sigmaX || 0);
    }

    apply_filter(image, _filePath) {
        const dst = new cv.Mat();
        cv.GaussianBlur(image, dst, this.kSize, this.sigmaX);
        return dst;
    }
}