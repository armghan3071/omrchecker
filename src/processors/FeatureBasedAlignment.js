import logger from '../logger.js';
import { ImagePreprocessor } from './manager.js';
import { ImageUtils } from '../utils/image.js';
import { InteractionUtils } from '../utils/interaction.js';

export class FeatureBasedAlignment extends ImagePreprocessor {
    static NAME = "FeatureBasedAlignment"
    constructor(...args) {
        super(...args);
        const options = this.options;
        const config = this.tuning_config;

        // Reference Image Handling
        // In browser, we cannot sync read 'reference'. 
        // We assume 'ImageUtils.getReference' will return a pre-loaded Mat 
        // or we handle this in an async init. 
        // For this sync constructor, we set placeholders.
        this.refName = options.reference; 
        this.maxFeatures = parseInt(options.maxFeatures || 500);
        this.goodMatchPercent = options.goodMatchPercent || 0.15;
        this.transform2d = options["2d"] || false;

        // Setup ORB
        this.orb = new cv.ORB(this.maxFeatures);
        
        // To be computed when apply_filter is called or via an async init method
        this.refKeypoints = null;
        this.refDescriptors = null;
        this.refImg = null;
    }

    async ensureReferenceLoaded() {
        if (this.refImg) return;

        // Mocking ImageUtils to get reference by name from loaded files
        // This implies ImageUtils has access to the global file registry
        const rawRef = await ImageUtils.get_image_by_name(this.refName);
        
        if (!rawRef) throw new Error(`Reference image ${this.refName} not found.`);

        this.refImg = ImageUtils.resize_util(
            rawRef,
            this.tuning_config.dimensions.processing_width,
            this.tuning_config.dimensions.processing_height
        );

        // Convert to Grayscale if needed (ORB requires it?) 
        // Usually cv.imread creates BGR. ORB works on Gray.
        let grayRef = new cv.Mat();
        if (this.refImg.channels() > 1) {
            cv.cvtColor(this.refImg, grayRef, cv.COLOR_RGBA2GRAY);
        } else {
            this.refImg.copyTo(grayRef);
        }

        this.refKeypoints = new cv.KeyPointVector();
        this.refDescriptors = new cv.Mat();
        this.orb.detectAndCompute(grayRef, new cv.Mat(), this.refKeypoints, this.refDescriptors);
        
        grayRef.delete();
        // rawRef might need deletion depending on ImageUtils
    }

    async apply_filter(image, _filePath) {
        await this.ensureReferenceLoaded();
        
        const config = this.tuning_config;
        
        // Normalize
        let imgNorm = new cv.Mat();
        cv.normalize(image, imgNorm, 0, 255, cv.NORM_MINMAX);
        
        // Detect ORB
        let kps = new cv.KeyPointVector();
        let des = new cv.Mat();
        let mask = new cv.Mat();
        this.orb.detectAndCompute(imgNorm, mask, kps, des);

        // Match
        // BFMatcher with Hamming distance
        let matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
        let matches = new cv.DMatchVector();
        
        // JS OpenCV match expects (query, train, matches, mask)
        matcher.match(des, this.refDescriptors, matches);

        // Sort matches
        // Convert to JS array to sort
        let matchesList = [];
        for (let i=0; i<matches.size(); i++) matchesList.push(matches.get(i));
        
        matchesList.sort((a, b) => a.distance - b.distance);
        
        const numGood = Math.floor(matchesList.length * this.goodMatchPercent);
        const goodMatches = matchesList.slice(0, numGood);

        // Extract points
        const points1 = [];
        const points2 = [];

        for(let m of goodMatches) {
            points1.push(kps.get(m.queryIdx).pt);
            points2.push(this.refKeypoints.get(m.trainIdx).pt);
        }

        // Convert points to Mat for findHomography
        const p1Mat = cv.matFromArray(points1.length, 1, cv.CV_32FC2, points1.flatMap(p => [p.x, p.y]));
        const p2Mat = cv.matFromArray(points2.length, 1, cv.CV_32FC2, points2.flatMap(p => [p.x, p.y]));

        let result;
        
        if (this.transform2d) {
            let m = cv.estimateAffine2D(p1Mat, p2Mat);
            // warpAffine...
            // Note: estimateAffine2D might not be fully exposed in all opencv.js versions, 
            // fallback to Homography if needed.
            logger.warning("2D Affine transform not fully implemented in JS port, skipping.");
            result = image.clone(); 
        } else {
            let h = cv.findHomography(p1Mat, p2Mat, cv.RANSAC);
            let final = new cv.Mat();
            cv.warpPerspective(image, final, h, this.refImg.size());
            result = final;
            h.delete();
        }

        // Cleanup
        imgNorm.delete(); kps.delete(); des.delete(); mask.delete();
        matcher.delete(); matches.delete();
        p1Mat.delete(); p2Mat.delete();

        return result;
    }
}