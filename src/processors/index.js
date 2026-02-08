import { PROCESSOR_MANAGER } from './manager.js';
import { Levels, MedianBlur, GaussianBlur } from './builtins.js';
import { CropPage } from './CropPage.js';
import { FeatureBasedAlignment } from './FeatureBasedAlignment.js';
// 1. Import the new class
import { CropOnMarkers } from './CropOnMarkers.js'; 

// Register Processors
PROCESSOR_MANAGER.register(Levels);
PROCESSOR_MANAGER.register(MedianBlur);
PROCESSOR_MANAGER.register(GaussianBlur);
PROCESSOR_MANAGER.register(CropPage);
PROCESSOR_MANAGER.register(FeatureBasedAlignment);
// 2. Register the new class
PROCESSOR_MANAGER.register(CropOnMarkers);

PROCESSOR_MANAGER.logLoaded();

export { PROCESSOR_MANAGER };