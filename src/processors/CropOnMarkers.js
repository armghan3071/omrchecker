/**
 * src/processors/CropOnMarkers.js
 * Robust Version: Includes Geometry Guard to prevent distortion
 */
import { logger } from '../logger.js';
import { ImagePreprocessor } from './manager.js';
import { ImageUtils } from '../utils/image.js';
import { InteractionUtils } from '../utils/interaction.js';
import { VFS } from '../utils/file.js';

const EROSION_PARAMS = { kernel_size: [5, 5], iterations: 2 };
const QUADRANT_DIVISION = { height_factor: 3, width_factor: 2 };
const DEFAULT_GAUSSIAN_BLUR_PARAMS_MARKER = { kernel_size: [5, 5], sigma_x: 0 };
const DEFAULT_NORMALIZE_PARAMS = { alpha: 0, beta: 255 };

export class CropOnMarkers extends ImagePreprocessor {
    constructor(options = {}, relativeDir = null, imageInstanceOps = null) {
        super(options, relativeDir, imageInstanceOps);
        const markerOps = this.options;
        this.relativePath = markerOps.relativePath || 'omr_marker.jpg';
        this.minMatchingThreshold = markerOps.min_matching_threshold || 0.3;
        this.maxMatchingVariation = markerOps.max_matching_variation || 0.41;
        const range = markerOps.marker_rescale_range || [35, 100];
        this.markerRescaleRange = [parseInt(range[0]), parseInt(range[1])];
        this.markerRescaleSteps = parseInt(markerOps.marker_rescale_steps || 10);
        this.applyErodeSubtract = markerOps.apply_erode_subtract !== false; 
        this.markerMat = null;
    }

    exclude_files() { return [this.relativePath]; }

    async ensureMarkerLoaded() {
        if (this.markerMat && !this.markerMat.isDeleted()) return;
        try {
            let markerFile = null;
            const checkPaths = [this.relativePath, `inputs/${this.relativePath}`, `/${this.relativePath}`];
            for (const p of checkPaths) {
                if (await ImageUtils.get_image_by_name(p)) { markerFile = p; break; }
            }
            if (!markerFile) {
                const searchName = this.relativePath.split('/').pop();
                for (const [path, _] of VFS.files.entries()) {
                    if (path.endsWith(searchName)) { markerFile = path; break; }
                }
            }
            if (!markerFile) throw new Error(`Marker '${this.relativePath}' not found.`);

            const src = await ImageUtils.get_image_by_name(markerFile);
            let marker = new cv.Mat();
            if (src.channels() === 3) cv.cvtColor(src, marker, cv.COLOR_RGB2GRAY);
            else if (src.channels() === 4) cv.cvtColor(src, marker, cv.COLOR_RGBA2GRAY);
            else src.copyTo(marker);

            const config = this.tuning_config;
            const markerOps = this.options;

            if (markerOps.sheetToMarkerWidthRatio) {
                const targetW = config.dimensions.processing_width / parseInt(markerOps.sheetToMarkerWidthRatio);
                const resized = ImageUtils.resize_util(marker, targetW);
                marker.delete(); marker = resized;
            }

            const kSize = new cv.Size(DEFAULT_GAUSSIAN_BLUR_PARAMS_MARKER.kernel_size[0], DEFAULT_GAUSSIAN_BLUR_PARAMS_MARKER.kernel_size[1]);
            const blurred = new cv.Mat();
            cv.GaussianBlur(marker, blurred, kSize, DEFAULT_GAUSSIAN_BLUR_PARAMS_MARKER.sigma_x);
            marker.delete(); marker = blurred;

            const normalized = new cv.Mat();
            cv.normalize(marker, normalized, DEFAULT_NORMALIZE_PARAMS.alpha, DEFAULT_NORMALIZE_PARAMS.beta, cv.NORM_MINMAX, -1, new cv.Mat());
            marker.delete(); marker = normalized;

            if (this.applyErodeSubtract) {
                const kernel = cv.Mat.ones(EROSION_PARAMS.kernel_size[0], EROSION_PARAMS.kernel_size[1], cv.CV_8U);
                const eroded = new cv.Mat();
                cv.erode(marker, eroded, kernel, new cv.Point(-1, -1), EROSION_PARAMS.iterations);
                cv.subtract(marker, eroded, marker);
                eroded.delete(); kernel.delete();
            }

            this.markerMat = marker;
            logger.info(`[CropOnMarkers] Marker prepared (${marker.cols}x${marker.rows})`);

        } catch (err) {
            logger.error(`[CropOnMarkers] Init Error: ${err.message}`);
            throw err;
        }
    }

    async apply_filter(image, filePath) {
        await this.ensureMarkerLoaded();
        const config = this.tuning_config;

        let grayInput = new cv.Mat();
        if (image.channels() === 3) cv.cvtColor(image, grayInput, cv.COLOR_RGB2GRAY);
        else if (image.channels() === 4) cv.cvtColor(image, grayInput, cv.COLOR_RGBA2GRAY);
        else image.copyTo(grayInput);

        const normalizedInput = ImageUtils.normalize_util(grayInput);
        grayInput.delete();

        let imageErodedSub = new cv.Mat();
        if (this.applyErodeSubtract) {
            normalizedInput.copyTo(imageErodedSub);
        } else {
            const kernel = cv.Mat.ones(EROSION_PARAMS.kernel_size[0], EROSION_PARAMS.kernel_size[1], cv.CV_8U);
            const eroded = new cv.Mat();
            cv.erode(normalizedInput, eroded, kernel, new cv.Point(-1, -1), EROSION_PARAMS.iterations);
            
            const subtracted = new cv.Mat();
            cv.subtract(normalizedInput, eroded, subtracted);
            cv.normalize(subtracted, imageErodedSub, 0, 255, cv.NORM_MINMAX, -1, new cv.Mat());
            
            kernel.delete(); eroded.delete(); subtracted.delete();
        }
        normalizedInput.delete();

        const h1 = imageErodedSub.rows;
        const w1 = imageErodedSub.cols;
        const midh = Math.floor(h1 / QUADRANT_DIVISION.height_factor);
        const midw = Math.floor(w1 / QUADRANT_DIVISION.width_factor);

        // Draw quad lines
        cv.line(imageErodedSub, new cv.Point(midw, 0), new cv.Point(midw, h1), new cv.Scalar(255), 2);
        cv.line(imageErodedSub, new cv.Point(0, midh), new cv.Point(w1, midh), new cv.Scalar(255), 2);

        const { bestScale, allMaxT } = this.getBestMatch(imageErodedSub);

        if (bestScale === null) {
            logger.error(`[CropOnMarkers] Failed to find marker scale match.`);
            if (config.outputs.show_image_level >= 1) InteractionUtils.show("Quads (No Match)", imageErodedSub, {config});
            imageErodedSub.delete();
            return null; 
        }

        const optimalH = Math.floor(this.markerMat.rows * bestScale);
        const optimalMarker = ImageUtils.resize_util_h(this.markerMat, optimalH);
        const mw = optimalMarker.cols;
        const mh = optimalMarker.rows;

        const origins = [
            { x: 0, y: 0 }, { x: midw, y: 0 },
            { x: 0, y: midh }, { x: midw, y: midh }
        ];
        
        const roiRects = [
            new cv.Rect(0, 0, midw, midh), new cv.Rect(midw, 0, w1 - midw, midh),
            new cv.Rect(0, midh, midw, h1 - midh), new cv.Rect(midw, midh, w1 - midw, h1 - midh)
        ];

        let quarterLog = "Matching: ";
        const centres = [];
        
        try {
            for (let k = 0; k < 4; k++) {
                const quadMat = imageErodedSub.roi(roiRects[k]);
                const res = new cv.Mat();
                
                cv.matchTemplate(quadMat, optimalMarker, res, cv.TM_CCOEFF_NORMED);
                const minMax = cv.minMaxLoc(res);
                const maxT = minMax.maxVal;
                const maxLoc = minMax.maxLoc;

                quarterLog += `Q${k+1}:${maxT.toFixed(2)} `;

                if (maxT < this.minMatchingThreshold || Math.abs(allMaxT - maxT) >= this.maxMatchingVariation) {
                    logger.error(`[CropOnMarkers] Low Match in Q${k+1}: ${maxT.toFixed(2)}`);
                    if (config.outputs.show_image_level >= 1) InteractionUtils.show(`Failed Q${k+1}`, quadMat, {config});
                    quadMat.delete(); res.delete(); optimalMarker.delete(); imageErodedSub.delete();
                    return null;
                }

                const pt = { x: maxLoc.x + origins[k].x, y: maxLoc.y + origins[k].y };
                centres.push({ x: pt.x + mw / 2, y: pt.y + mh / 2 });

                quadMat.delete(); res.delete();
            }
        } catch (e) {
            optimalMarker.delete(); imageErodedSub.delete();
            throw e;
        }

        logger.info(quarterLog);

        // --- NEW: Geometry Validation Guard ---
        // If CropPage ran before this, the image should already be roughly aligned.
        // We check if the 4 found points form a valid rectangle.
        if (!this.validateGeometry(centres, w1, h1)) {
            logger.warning("[CropOnMarkers] Detected markers form an invalid shape (distorted). Skipping marker warp.");
            optimalMarker.delete();
            imageErodedSub.delete();
            // Return original image instead of distorting it
            return image.clone();
        }
        // --------------------------------------

        const warped = ImageUtils.four_point_transform(image, centres);

        if (config.outputs.show_image_level >= 2) {
            InteractionUtils.show("Warped Result", warped, {config});
        }

        optimalMarker.delete();
        imageErodedSub.delete();

        return warped;
    }

    validateGeometry(pts, w, h) {
        // pts array: [TL, TR, BL, BR] (Assuming Q1, Q2, Q3, Q4 order from loop)
        // Check if Top width roughly equals Bottom width
        // Check if Left height roughly equals Right height
        // Check if diagonals are reasonable
        
        const tl = pts[0]; 
        const tr = pts[1]; 
        const bl = pts[2]; 
        const br = pts[3];

        const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
        
        const topW = dist(tl, tr);
        const botW = dist(bl, br);
        const leftH = dist(tl, bl);
        const rightH = dist(tr, br);

        // 1. Aspect Ratio sanity check
        // Widths should be similar (within 20% variance)
        if (Math.abs(topW - botW) > topW * 0.2) return false;
        
        // Heights should be similar
        if (Math.abs(leftH - rightH) > leftH * 0.2) return false;

        // 2. Minimum Area check (Did we collapse?)
        const avgW = (topW + botW) / 2;
        const avgH = (leftH + rightH) / 2;
        if (avgW < w * 0.5 || avgH < h * 0.5) return false; // Must be at least half the image size

        return true;
    }

    getBestMatch(imageErodedSub) {
        const descentPerStep = (this.markerRescaleRange[1] - this.markerRescaleRange[0]) / this.markerRescaleSteps;
        const _h = this.markerMat.rows;
        let bestScale = null;
        let allMaxT = 0;

        for (let r0 = this.markerRescaleRange[1]; r0 > this.markerRescaleRange[0]; r0 -= descentPerStep) {
            const s = r0 / 100.0;
            if (s === 0) continue;
            const targetH = Math.floor(_h * s);
            if (targetH > imageErodedSub.rows || targetH < 10) continue;

            const rescaledMarker = ImageUtils.resize_util_h(this.markerMat, targetH);
            const res = new cv.Mat();
            cv.matchTemplate(imageErodedSub, rescaledMarker, res, cv.TM_CCOEFF_NORMED);
            const maxT = cv.minMaxLoc(res).maxVal;

            if (maxT > allMaxT) {
                allMaxT = maxT;
                bestScale = s;
            }
            res.delete();
            rescaledMarker.delete();
        }
        return { bestScale, allMaxT };
    }
}