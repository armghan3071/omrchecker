/**
 * src/processors/CropPage.js
 * Robust Mobile & Crop Support (Fail-Safe Version)
 */
import logger from '../logger.js';
import { ImagePreprocessor } from './manager.js';
import { ImageUtils } from '../utils/image.js';
import { InteractionUtils } from '../utils/interaction.js';

function normalize(mat) {
    const dst = new cv.Mat();
    cv.normalize(mat, dst, 0, 255, cv.NORM_MINMAX, -1, new cv.Mat());
    return dst;
}

function angle(p1, p2, p0) {
    const dx1 = p1.x - p0.x;
    const dy1 = p1.y - p0.y;
    const dx2 = p2.x - p0.x;
    const dy2 = p2.y - p0.y;
    return (dx1 * dx2 + dy1 * dy2) / Math.sqrt(
        ((dx1 * dx1 + dy1 * dy1) * (dx2 * dx2 + dy2 * dy2)) + 1e-10
    );
}

function checkMaxCosine(approxMat) {
    let maxCosine = 0;
    const data = approxMat.data32S; 
    const pts = [];
    for(let i=0; i < approxMat.rows * 2; i+=2) {
        pts.push({ x: data[i], y: data[i+1] });
    }

    for (let i = 2; i < 5; i++) {
        const cosine = Math.abs(angle(pts[i % 4], pts[i - 2], pts[i - 1]));
        maxCosine = Math.max(cosine, maxCosine);
    }

    // Relaxed threshold: 0.5 allows angles up to ~60 degrees (perspective skew)
    if (maxCosine >= 0.5) return false;
    return true;
}

export class CropPage extends ImagePreprocessor {
    constructor(options, relativeDir, imageInstanceOps) {
        super(options, relativeDir, imageInstanceOps);
        const k = this.options.morphKernel || [10, 10];
        this.morphKernelSize = new cv.Size(parseInt(k[0]), parseInt(k[1]));
    }

    apply_filter(image, filePath) {
        let blurred = new cv.Mat();
        cv.GaussianBlur(image, blurred, new cv.Size(5, 5), 0);
        let normalized = normalize(blurred);
        blurred.delete();

        // Find Page with Fallbacks
        const sheet = this.findPage(normalized, filePath, image.cols, image.rows);
        
        // Extract Points
        const data = sheet.data32S;
        const pts = [];
        for(let i=0; i < sheet.rows * 2; i+=2) {
            pts.push({ x: data[i], y: data[i+1] });
        }

        // Warp
        const warped = ImageUtils.four_point_transform(image, pts);
        
        // Show debug if level matches
        const config = this.tuning_config;
        if (config.outputs.show_image_level >= 2) {
             InteractionUtils.show(`Warped: ${filePath}`, warped, {config});
        }

        normalized.delete();
        sheet.delete();
        
        return warped;
    }

    findPage(image, filePath, originalW, originalH) {
        let thresh = new cv.Mat();
        cv.threshold(image, thresh, 200, 255, cv.THRESH_TRUNC);
        let threshNorm = normalize(thresh);
        thresh.delete();

        // Morph Close
        let kernel = cv.getStructuringElement(cv.MORPH_RECT, this.morphKernelSize);
        let closed = new cv.Mat();
        cv.morphologyEx(threshNorm, closed, cv.MORPH_CLOSE, kernel);
        
        // Canny
        let edge = new cv.Mat();
        cv.Canny(closed, edge, 75, 200); // Standard values often work better than specific tunes

        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();
        cv.findContours(edge, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

        let cntList = [];
        for (let i = 0; i < contours.size(); ++i) {
            cntList.push(contours.get(i));
        }
        cntList.sort((a, b) => cv.contourArea(b) - cv.contourArea(a));
        
        let sheet = null;
        let bestFallback = null;
        const totalImageArea = image.rows * image.cols;
        const minArea = totalImageArea * 0.05; // 5% minimum

        for (let i = 0; i < Math.min(5, cntList.length); i++) {
            let c = cntList[i];
            let hull = new cv.Mat();
            cv.convexHull(c, hull);

            const area = cv.contourArea(hull);
            if (area < minArea) { hull.delete(); continue; }

            let peri = cv.arcLength(hull, true);
            let approx = new cv.Mat();
            cv.approxPolyDP(hull, approx, 0.025 * peri, true);
            
            const is4Points = (approx.rows === 4);
            
            if (is4Points) {
                const isRect = checkMaxCosine(approx);
                
                // Perfect Match
                if (isRect) {
                    sheet = approx;
                    logger.info(`Found Page Boundary. Area: ${(area/totalImageArea*100).toFixed(1)}%`);
                    hull.delete();
                    break;
                }
                
                // Save as fallback (imperfect rectangle)
                if (!bestFallback || area > cv.contourArea(bestFallback)) {
                    if (bestFallback) bestFallback.delete();
                    bestFallback = approx.clone(); // Keep it
                } else {
                    approx.delete();
                }
            } else {
                approx.delete();
            }
            hull.delete();
        }

        // Use Fallback if Strict failed
        if (!sheet && bestFallback) {
            logger.warning(`Strict boundary failed. Using best 4-corner shape.`);
            sheet = bestFallback;
        }

        // CLEANUP
        threshNorm.delete(); kernel.delete(); closed.delete();
        edge.delete(); hierarchy.delete(); contours.delete();

        // FAIL-SAFE: Return Full Image Boundary
        if (!sheet) {
            logger.warning(`No boundary found for '${filePath}'. Assuming full image is the page.`);
            sheet = new cv.Mat(4, 1, cv.CV_32SC2);
            // TL, TR, BR, BL order not strictly required as warp sorts it, 
            // but cleaner to provide [0,0], [w,0], [w,h], [0,h]
            sheet.data32S.set([
                0, 0, 
                originalW, 0, 
                originalW, originalH, 
                0, originalH
            ]);
        }
        
        return sheet;
    }
}