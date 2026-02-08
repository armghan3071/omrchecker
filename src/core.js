/**
 * src/core.js
 * Complete Port: Logic + Auto-Alignment + Drawing
 */
import { ImageUtils, CLAHE_HELPER } from './utils/image.js';
import { InteractionUtils } from './utils/interaction.js';
import { logger } from './logger.js';
import { CLR_BLACK, CLR_GRAY, CLR_DARK_GRAY, TEXT_SIZE } from './constants.js';

export class ImageInstanceOps {
    constructor(tuningConfig) {
        this.tuning_config = tuningConfig;
        this.save_img_list = {};
        this.save_image_level = tuningConfig.outputs.save_image_level;
        for(let i=1; i<=6; i++) this.save_img_list[i] = [];
    }

    async apply_preprocessors(filePath, inOmr, template) {
        const config = this.tuning_config;
        
        let processed = ImageUtils.resize_util(
            inOmr, 
            config.dimensions.processing_width, 
            config.dimensions.processing_height
        );
        inOmr.delete(); 

        for (const pp of template.pre_processors) {
            let next = pp.apply_filter(processed, filePath);
            if (next instanceof Promise) next = await next;
            
            if (next === null) return null;
            if (next !== processed) processed.delete();
            processed = next;
        }
        return processed;
    }

    read_omr_response(template, image, name, saveDir=null) {
        const config = this.tuning_config;
        const autoAlign = config.alignment_params.auto_align;

        // 1. Resize & Normalize
        let img = image.clone();
        img = ImageUtils.resize_util(img, template.page_dimensions[0], template.page_dimensions[1]);

        if (true) { 
             const normed = ImageUtils.normalize_util(img);
             img.delete();
             img = normed;
        }

        // Copies for visualization
        const transpLayer = img.clone();
        const finalMarked = img.clone();
        if (finalMarked.channels() === 1) cv.cvtColor(finalMarked, finalMarked, cv.COLOR_GRAY2BGR);

        let morph = img.clone();
        this.append_save_img(3, morph);

        // 2. Pre-Alignment Processing (Contrast/Morph)
        if (autoAlign) {
            const clahed = CLAHE_HELPER.apply(morph);
            morph.delete(); morph = clahed;
            this.append_save_img(3, morph);

            const gammaed = ImageUtils.adjust_gamma(morph, config.threshold_params.GAMMA_LOW);
            morph.delete(); morph = gammaed;

            const thresh = new cv.Mat();
            cv.threshold(morph, thresh, 220, 220, cv.THRESH_TRUNC);
            morph.delete();
            
            morph = ImageUtils.normalize_util(thresh);
            thresh.delete();
            this.append_save_img(3, morph);
        }

        // 3. Vertical Morphology (For Column Detection)
        let morphV = null;
        if (autoAlign) {
            morphV = new cv.Mat();
            const vKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 10));
            cv.morphologyEx(morph, morphV, cv.MORPH_OPEN, vKernel, new cv.Point(-1,-1), 3);
            vKernel.delete();
            
            const t = new cv.Mat();
            cv.threshold(morphV, t, 200, 200, cv.THRESH_TRUNC);
            morphV.delete();
            
            const n = ImageUtils.normalize_util(t);
            t.delete();
            
            // Invert
            morphV = new cv.Mat();
            cv.subtract(new cv.Mat(n.rows, n.cols, n.type(), new cv.Scalar(255)), n, morphV);
            n.delete();
            
            const t2 = new cv.Mat();
            cv.threshold(morphV, t2, 60, 255, cv.THRESH_BINARY);
            morphV.delete();
            morphV = t2; // Keep t2 as morphV
            
            // Erode
            const ones = cv.Mat.ones(5, 5, cv.CV_8U);
            const eroded = new cv.Mat();
            cv.erode(morphV, eroded, ones, new cv.Point(-1,-1), 2);
            morphV.delete(); morphV = eroded;
            ones.delete();
            
            this.append_save_img(6, morphV);

            // --- AUTO ALIGNMENT LOOP (Was Missing) ---
            const matchCol = config.alignment_params.match_col || 0;
            const maxSteps = config.alignment_params.max_steps || 20;
            const stride = config.alignment_params.stride || 1;
            const thickness = config.alignment_params.thickness || 2;

            for (const block of template.field_blocks) {
                const [sX, sY] = block.origin;
                const [dX, dY] = block.dimensions;
                
                let shift = 0;
                let steps = 0;

                // Optimization: Extract relevant ROI once if possible, but shift changes ROI.
                // We check mean pixel value of vertical strips to find the black line.
                while (steps < maxSteps) {
                    // Check Left Strip
                    let lRect = new cv.Rect(
                        sX + shift - thickness, 
                        sY, 
                        matchCol + thickness, // Approx width 
                        dY
                    );
                    // Boundary checks
                    if (lRect.x < 0) lRect.x = 0;
                    if (lRect.x + lRect.width >= morphV.cols) lRect.width = morphV.cols - lRect.x - 1;

                    // Check Right Strip
                    let rRect = new cv.Rect(
                        sX + shift + dX - matchCol + thickness,
                        sY,
                        matchCol + thickness,
                        dY
                    );
                    if (rRect.x < 0) rRect.x = 0;
                    if (rRect.x + rRect.width >= morphV.cols) rRect.width = morphV.cols - rRect.x - 1;

                    // Measure
                    let leftMean = 0, rightMean = 0;
                    if(lRect.width > 0 && lRect.height > 0) {
                        const roiL = morphV.roi(lRect);
                        leftMean = cv.mean(roiL)[0];
                        roiL.delete();
                    }
                    if(rRect.width > 0 && rRect.height > 0) {
                        const roiR = morphV.roi(rRect);
                        rightMean = cv.mean(roiR)[0];
                        roiR.delete();
                    }

                    // Decision: > 100 means "White/Background". We want "Black/Line" (Low value? or Inverted?)
                    // In Python code: morph_v is inverted then thresholded binary.
                    // If > 100, it detects the "Structure" (White on Black background).
                    const leftHit = leftMean > 100;
                    const rightHit = rightMean > 100;

                    if (leftHit) {
                        if (rightHit) break; // Aligned
                        else shift -= stride;
                    } else {
                        if (rightHit) shift += stride;
                        else break; // Floating in void?
                    }
                    steps++;
                }
                block.shift = shift;
                // logger.debug(`Block ${block.name} shift: ${shift}`);
            }
        }
        if (morphV && !morphV.isDeleted()) morphV.delete();

        // 4. Data Collection
        const omrResponse = {};
        const allQVals = [];
        const allQStdVals = [];
        const allQStripArrs = [];
        let totalQStripNo = 0;

        for (const block of template.field_blocks) {
            const [boxW, boxH] = block.bubbleDimensions;
            
            for (const bubbleRow of block.traverse_bubbles) {
                const qStripVals = [];
                for (const bubble of bubbleRow) {
                    const x = bubble.x + block.shift;
                    const y = bubble.y;
                    
                    // Safety ROI
                    if (x < 0 || y < 0 || x+boxW > img.cols || y+boxH > img.rows) {
                        qStripVals.push(255); // White/Empty
                        continue;
                    }

                    const rect = new cv.Rect(x, y, boxW, boxH);
                    const roi = img.roi(rect);
                    const m = cv.mean(roi);
                    qStripVals.push(m[0]);
                    roi.delete();
                }
                
                // Statistics
                const mean = qStripVals.reduce((a,b)=>a+b,0) / qStripVals.length;
                const variance = qStripVals.reduce((a,b)=>a + Math.pow(b-mean, 2), 0) / qStripVals.length;
                const std = Math.sqrt(variance);
                
                allQStdVals.push(Number(std.toFixed(2)));
                allQStripArrs.push(qStripVals);
                allQVals.push(...qStripVals);
                totalQStripNo++;
            }
        }

        // 5. Threshold Calculation
        const [globalStdThresh] = this.get_global_threshold(allQStdVals);
        const [globalThr] = this.get_global_threshold(allQVals, null, false, true, 4);

        logger.info(`Thresholding:\tglobal_thr: ${globalThr.toFixed(2)} \tglobal_std_THR: ${globalStdThresh.toFixed(2)}`);

        // 6. Marking
        let totalQBoxNo = 0;
        totalQStripNo = 0;
        let perOmrThresholdAvg = 0;
        
        let multiMarked = 0;
        let multiRoll = 0;

        for (const block of template.field_blocks) {
            const [boxW, boxH] = block.bubbleDimensions;

            for (const bubbleRow of block.traverse_bubbles) {
                const noOutliers = allQStdVals[totalQStripNo] < globalStdThresh;
                
                const perQStripThreshold = this.get_local_threshold(
                    allQStripArrs[totalQStripNo],
                    globalThr,
                    noOutliers
                );
                
                perOmrThresholdAvg += perQStripThreshold;
                
                const detectedBubbles = [];
                
                for (const bubble of bubbleRow) {
                    const val = allQVals[totalQBoxNo];
                    // Logic: Darker is smaller value.
                    // If Threshold is 150, and val is 50 (Dark), Marked = 150 > 50 -> True.
                    const isMarked = perQStripThreshold > val;
                    
                    const x = bubble.x + block.shift;
                    const y = bubble.y;

                    if (isMarked) {
                        detectedBubbles.push(bubble);
                        cv.rectangle(finalMarked, new cv.Point(x + boxW/12, y + boxH/12), 
                                     new cv.Point(x + boxW - boxW/12, y + boxH - boxH/12), 
                                     CLR_DARK_GRAY, 3);
                        cv.putText(finalMarked, String(bubble.field_value), new cv.Point(x, y), 
                                   cv.FONT_HERSHEY_SIMPLEX, TEXT_SIZE, new cv.Scalar(20, 20, 10, 255), 2);
                    } else {
                        cv.rectangle(finalMarked, new cv.Point(x + boxW/10, y + boxH/10),
                                     new cv.Point(x + boxW - boxW/10, y + boxH - boxH/10),
                                     CLR_GRAY, -1);
                    }
                    totalQBoxNo++;
                }

                // Response Logic
                for (const bub of detectedBubbles) {
                    const label = bub.field_label;
                    const val = bub.field_value;
                    const multiMarkedLocal = (label in omrResponse);
                    
                    if (multiMarkedLocal) {
                        omrResponse[label] = omrResponse[label] + val;
                        multiMarked = 1;
                    } else {
                        omrResponse[label] = val;
                    }
                }

                if (detectedBubbles.length === 0) {
                    const label = bubbleRow[0].field_label;
                    omrResponse[label] = block.empty_val;
                }

                totalQStripNo++;
            }
        }

        // 7. Finalize
        const alpha = 0.65;
        cv.addWeighted(finalMarked, alpha, transpLayer, 1-alpha, 0, finalMarked);

        img.delete(); morph.delete(); transpLayer.delete();
        
        return {
            response_dict: omrResponse, 
            final_marked: finalMarked, 
            multi_marked: multiMarked, 
            multi_roll: multiRoll
        };
    }

    // --- Helper Methods ---

    draw_template_layout(img, template, shifted = true, drawQVals = false, border = -1) {
        let finalAlign = ImageUtils.resize_util(
            img, 
            template.page_dimensions[0], 
            template.page_dimensions[1]
        );

        for (const block of template.field_blocks) {
            const [sX, sY] = block.origin;
            const [dX, dY] = block.dimensions;
            const [boxW, boxH] = block.bubbleDimensions;
            const shift = block.shift;

            if (shifted) {
                cv.rectangle(finalAlign, new cv.Point(sX + shift, sY), new cv.Point(sX + shift + dX, sY + dY), CLR_BLACK, 3);
            } else {
                cv.rectangle(finalAlign, new cv.Point(sX, sY), new cv.Point(sX + dX, sY + dY), CLR_BLACK, 3);
            }

            for (const bubbleRow of block.traverse_bubbles) {
                for (const pt of bubbleRow) {
                    const x = shifted ? (pt.x + block.shift) : pt.x;
                    const y = pt.y;
                    
                    const pt1 = new cv.Point(Math.floor(x + boxW / 10), Math.floor(y + boxH / 10));
                    const pt2 = new cv.Point(Math.floor(x + boxW - boxW / 10), Math.floor(y + boxH - boxH / 10));
                    
                    cv.rectangle(finalAlign, pt1, pt2, CLR_GRAY, border);
                }
            }

            if (shifted) {
                const textPt = new cv.Point(Math.floor(sX + dX - 50), Math.floor(sY - 10));
                cv.putText(finalAlign, block.name, textPt, cv.FONT_HERSHEY_SIMPLEX, TEXT_SIZE, CLR_BLACK, 4);
            }
        }
        return finalAlign;
    }

    get_global_threshold(q_vals_orig, plot_title=null, plot_show=true, sort_in_plot=true, looseness=1) {
        const config = this.tuning_config;
        const MIN_JUMP = config.threshold_params.MIN_JUMP || 20;
        const JUMP_DELTA = config.threshold_params.JUMP_DELTA || 20;
        const PAGE_TYPE = config.threshold_params.PAGE_TYPE_FOR_THRESHOLD;

        const globalDefault = (PAGE_TYPE === "white") ? 200 : 100;

        const qVals = [...q_vals_orig].sort((a,b) => a-b);
        
        const ls = Math.floor((looseness + 1) / 2);
        const l = qVals.length - ls;
        
        let max1 = MIN_JUMP;
        let thr1 = globalDefault;
        
        for (let i = ls; i < l; i++) {
            const jump = qVals[i + ls] - qVals[i - ls];
            if (jump > max1) {
                max1 = jump;
                thr1 = qVals[i - ls] + (jump / 2);
            }
        }

        let max2 = MIN_JUMP;
        let thr2 = globalDefault;
        
        for (let i = ls; i < l; i++) {
            const jump = qVals[i + ls] - qVals[i - ls];
            const newThr = qVals[i - ls] + (jump / 2);
            
            if (jump > max2 && Math.abs(thr1 - newThr) > JUMP_DELTA) {
                max2 = jump;
                thr2 = newThr;
            }
        }

        const globalThr = thr1;
        return [globalThr, 0, 0];
    }

    get_local_threshold(q_vals, global_thr, no_outliers) {
        const config = this.tuning_config;
        const sortedQ = [...q_vals].sort((a,b)=>a-b);
        
        if (sortedQ.length < 3) {
            const range = sortedQ[sortedQ.length-1] - sortedQ[0];
            return (range < config.threshold_params.MIN_GAP) ? global_thr : (sortedQ.reduce((a,b)=>a+b)/sortedQ.length);
        }

        const l = sortedQ.length - 1;
        let max1 = config.threshold_params.MIN_JUMP || 20;
        let thr1 = 255;

        for (let i = 1; i < l; i++) {
            const jump = sortedQ[i+1] - sortedQ[i-1];
            if (jump > max1) {
                max1 = jump;
                thr1 = sortedQ[i-1] + (jump / 2);
            }
        }

        const confidentJump = max1 + (config.threshold_params.CONFIDENT_SURPLUS || 10);
        if (max1 < confidentJump && no_outliers) {
            return global_thr;
        }

        return thr1;
    }
    
    append_save_img(key, img) {
        if (this.save_image_level >= key) {
            this.save_img_list[key].push(img.clone());
        }
    }
    
    reset_all_save_img() {
        for(const k in this.save_img_list) this.save_img_list[k] = [];
    }
}