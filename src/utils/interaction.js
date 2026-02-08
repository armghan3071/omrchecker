/**
 * src/utils/interaction.js
 * Replaces interaction.py
 */
import logger from '../logger.js';
import { ImageUtils } from './image.js';

export class InteractionUtils {
    // We mock the image_metrics structure
    static image_metrics = {
        window_width: 1920, // Default assumptions
        window_height: 1080,
        window_x: 0,
        window_y: 0
    };

    static show(name, origin, options = {}) {
        // Defaults: pause=1, resize=False, reset_pos=None, config=None
        const { pause = true, resize = false, reset_pos = null, config = null } = options;

        if (!origin || origin.isDeleted()) {
            logger.info(`'${name}' - NoneType or Deleted image to show!`);
            return;
        }

        try {
            let imgToShow = origin;
            let shouldDelete = false;

            if (resize) {
                if (!config) throw new Error("config not provided for resizing");
                imgToShow = ImageUtils.resize_util(origin, config.dimensions.display_width);
                shouldDelete = true;
            }

            // Convert to displayable format (RGBA)
            const rgba = new cv.Mat();
            if (imgToShow.channels() === 1) {
                cv.cvtColor(imgToShow, rgba, cv.COLOR_GRAY2RGBA);
            } else if (imgToShow.channels() === 3) {
                cv.cvtColor(imgToShow, rgba, cv.COLOR_BGR2RGBA);
            } else {
                imgToShow.copyTo(rgba);
            }

            // Send to Main Thread via Worker Message
            const imgData = new ImageData(
                new Uint8ClampedArray(rgba.data),
                rgba.cols,
                rgba.rows
            );

            self.postMessage({
                type: 'SHOW_IMAGE',
                payload: {
                    title: name,
                    width: rgba.cols,
                    height: rgba.rows,
                    buffer: imgData.data.buffer
                }
            }, [imgData.data.buffer]);

            rgba.delete();
            if (shouldDelete) imgToShow.delete();

            // Note: We cannot "wait" (block) in JS like cv2.waitKey. 
            // The UI will simply render it.
            if (pause) {
                logger.info(`Showing '${name}' on UI.`);
            }

        } catch (e) {
            logger.error(`Error showing image ${name}: ${e.message}`);
        }
    }
}

export class Stats {
    constructor() {
        this.files_moved = 0;
        this.files_not_moved = 0;
    }
}