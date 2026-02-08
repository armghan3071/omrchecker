/**
 * src/utils/image.js
 * Strict port of image.py + JS Memory Registry
 */
import { logger } from '../logger.js';

export const CLAHE_HELPER = {
    apply: (mat) => {
        const clahe = new cv.CLAHE(5.0, new cv.Size(8, 8));
        const dst = new cv.Mat();
        clahe.apply(mat, dst);
        clahe.delete();
        return dst;
    }
};

export class ImageUtils {
    // --- JS-Specific Registry (The Fix) ---
    static loadedImages = new Map();

    static register_file(name, mat) {
        // Store the Mat object in memory mapped to its filename
        this.loadedImages.set(name, mat);
    }

    static async get_image_by_name(name) {
        return this.loadedImages.get(name);
    }
    // --------------------------------------

    static save_img(path, mat) {
        logger.info(`Saving Image to '${path}' (Virtual)`);
        // In a real app, this would trigger a download or update VFS
    }

    static resize_util(img, u_width, u_height = null) {
        const dst = new cv.Mat();
        const { width: w, height: h } = img.size();
        
        if (u_height === null) {
            u_height = Math.floor(h * u_width / w);
        }
        
        cv.resize(img, dst, new cv.Size(u_width, u_height), 0, 0, cv.INTER_AREA);
        return dst;
    }

    static resize_util_h(img, u_height, u_width = null) {
        const dst = new cv.Mat();
        const { width: w, height: h } = img.size();

        if (u_width === null) {
            u_width = Math.floor(w * u_height / h);
        }

        cv.resize(img, dst, new cv.Size(u_width, u_height), 0, 0, cv.INTER_AREA);
        return dst;
    }

    static grab_contours(contours) {
        return contours; 
    }

    static normalize_util(img, alpha = 0, beta = 255) {
        const dst = new cv.Mat();
        cv.normalize(img, dst, alpha, beta, cv.NORM_MINMAX, -1, new cv.Mat());
        return dst;
    }

    static auto_canny(image, sigma = 0.33) {
        // 1. Compute Median via Histogram
        const histSize = [256];
        const ranges = [0, 255];
        const hist = new cv.Mat();
        const mask = new cv.Mat();
        const srcVec = new cv.MatVector();
        srcVec.push_back(image);
        
        cv.calcHist(srcVec, [0], mask, hist, histSize, ranges);
        
        const totalPixels = image.rows * image.cols;
        const halfPixels = totalPixels / 2;
        let sum = 0;
        let median = 128; 
        
        for(let i=0; i<256; i++) {
            sum += hist.data32F[i];
            if(sum > halfPixels) {
                median = i;
                break;
            }
        }
        srcVec.delete(); mask.delete(); hist.delete();

        // 2. Apply Canny
        const v = median;
        const lower = Math.floor(Math.max(0, (1.0 - sigma) * v));
        const upper = Math.floor(Math.min(255, (1.0 + sigma) * v));

        const edged = new cv.Mat();
        cv.Canny(image, edged, lower, upper);
        return edged;
    }

    static adjust_gamma(image, gamma = 1.0) {
        const invGamma = 1.0 / gamma;
        const lut = new cv.Mat(1, 256, cv.CV_8U);
        for (let i = 0; i < 256; i++) {
            lut.data[i] = Math.min(255, Math.max(0, Math.pow(i / 255.0, invGamma) * 255.0));
        }

        const dst = new cv.Mat();
        cv.LUT(image, lut, dst);
        lut.delete();
        return dst;
    }

    static order_points(pts) {
        // Input: Array of {x,y} or [x,y]
        const points = pts.map(p => (p.x !== undefined) ? [p.x, p.y] : p);
        const rect = new Array(4);

        // 1. Sum (x+y): TL is min, BR is max
        const sums = points.map(p => p[0] + p[1]);
        const minSumIdx = sums.indexOf(Math.min(...sums));
        const maxSumIdx = sums.indexOf(Math.max(...sums));
        
        rect[0] = points[minSumIdx]; // TL
        rect[2] = points[maxSumIdx]; // BR

        // 2. Diff (y-x): TR is min, BL is max
        const diffs = points.map(p => p[1] - p[0]);
        
        const remainingIndices = [0, 1, 2, 3].filter(i => i !== minSumIdx && i !== maxSumIdx);
        
        if (diffs[remainingIndices[0]] < diffs[remainingIndices[1]]) {
            rect[1] = points[remainingIndices[0]]; // TR
            rect[3] = points[remainingIndices[1]]; // BL
        } else {
            rect[1] = points[remainingIndices[1]]; // TR
            rect[3] = points[remainingIndices[0]]; // BL
        }

        return rect;
    }

    static four_point_transform(image, pts) {
        const rect = this.order_points(pts);
        const [tl, tr, br, bl] = rect;

        const dist = (p1, p2) => Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);

        const widthA = dist(br, bl);
        const widthB = dist(tr, tl);
        const maxWidth = Math.max(Math.floor(widthA), Math.floor(widthB));

        const heightA = dist(tr, br);
        const heightB = dist(tl, bl);
        const maxHeight = Math.max(Math.floor(heightA), Math.floor(heightB));

        // Flatten points for Mat construction
        const srcFlat = [].concat(...tl, ...tr, ...br, ...bl);
        const dstFlat = [
            0, 0,
            maxWidth - 1, 0,
            maxWidth - 1, maxHeight - 1,
            0, maxHeight - 1
        ];

        const srcMat = cv.matFromArray(4, 1, cv.CV_32FC2, srcFlat);
        const dstMat = cv.matFromArray(4, 1, cv.CV_32FC2, dstFlat);

        const M = cv.getPerspectiveTransform(srcMat, dstMat);
        const warped = new cv.Mat();
        cv.warpPerspective(image, warped, M, new cv.Size(maxWidth, maxHeight));

        srcMat.delete(); dstMat.delete(); M.delete();

        return warped;
    }
}