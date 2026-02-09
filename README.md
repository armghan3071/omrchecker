# OMR Checker Library

A powerful, client-side Optical Mark Recognition (OMR) engine for JavaScript. Process bubble sheets, exams, and surveys entirely in the browser using OpenCV and Web Workers.

### Features

- 🚀 **Client-Side Processing:** No server required. All image processing happens locally.
- ⚡ **Non-Blocking:** Uses a dedicated Web Worker to keep your UI responsive.
- 🎯 **High Accuracy:** Algorithms for rotation correction and perspective warping.
- 📄 **Batch Support:** Process hundreds of images in a single loop.
- 🛠 **Layout Debugging:** Built-in tools to visualize grid alignment.

### Installation

```sh
npm install @armghan3071/omrchecker
```
### ⚠️ Critical Setup: The Web Worker

Because this library runs heavy image processing logic in a background thread, you must make the worker file accessible to the browser via a URL.

#### 1. Copy the Worker File
After installing, you must copy the worker file from `node_modules` to your project's **Public/Static** folder.

- **Source:** `node_modules/@armghan3071/omrchecker/dist/worker.mjs`
- **Destination:** Your project's public folder (e.g., `public/omr-worker.js`).

| Framework | Destination Folder |
| :--- | :--- |
| **Quasar / Vue** | `public/omr-worker.js` |
| **Vite** | `public/omr-worker.js` |
| **React (CRA)** | `public/omr-worker.js` |
| **Next.js** | `public/omr-worker.js` |

#### 2. Automate it (Recommended)
Add a script to your project's `package.json` to copy this file automatically whenever you install dependencies.

**Linux / Mac:**
```json
"scripts": {
  "postinstall": "cp node_modules/@armghan3071/omrchecker/dist/worker.mjs public/omr-worker.js"
}
```

**Windows:**
```json
"scripts": {
  "postinstall": "copy node_modules\\@armghan3071\\omrchecker\\dist\\worker.mjs public\\omr-worker.js""copy node_modules\\@armghan3071\\omrchecker\\dist\\worker.mjs public\\omr-worker.js"
}
```


#### 2. Vanilla JS Example

```javascript
import { OMRChecker } from '@armghan3071/omrchecker';

const engine = new OMRChecker();

document.getElementById('scanBtn').addEventListener('click', async () => {
  const fileInput = document.getElementById('fileInput');
  const files = Array.from(fileInput.files);
  
  // Load Template & Marker
  const template = { ... }; // Your JSON object
  const marker = await fetch('marker.jpg').then(res => res.blob());

  const results = await engine.process(files, template, marker);
  console.log(results);
});
```

### API Reference

#### `new OMRChecker(workerUrl)`
- **workerUrl** `(string)`: The absolute URL path to the `omr-worker.js` file on your server (e.g., `/omr-worker.js`).

#### `async process(files, template, marker, setLayout)`
- **files** `(File[])`: Array of browser `File` objects (images).
- **template** `(Object)`: The JSON template object defining bubble positions.
- **marker** `(Blob|File)`: The image file used for alignment markers (must match the visual marker on the paper).
- **setLayout** `(Boolean)`: 
    - `false` (default): Returns CSV grading results.
    - `true`: Returns images with grid overlays (useful for debugging layouts).

#### `terminate()`
- Instantly kills the background worker and frees memory. Call this when the component is destroyed.

### Configuration

The `template.json` defines where the engine should look for bubbles.

```json
{
  "pageDimensions": [1200, 1700],
  "bubbleDimensions": [30, 30],
  "preProcessors": [
    { 
        "name": "CropPage", 
        "options": { "morphKernel": [5, 5] } 
    },
    { 
        "name": "CropOnMarkers", 
        "options": { 
            "relativePath": "omr_marker.jpg",
            "min_matching_threshold": 0.5 
        } 
    }
  ],
  "fields": {
     "roll_number": { "type": "grid", "xy": [100, 200], "cols": 5, "rows": 10 },
     "q1": { "type": "bubble", "xy": [100, 500], "label": "A" }
  }
}
```

### Credits & References

This project is a JavaScript adaptation and port of the original [OMRChecker](https://github.com/Udayraj123/OMRChecker) by Udayraj123. It brings the robust grading logic of the Python-based engine directly to the web for high-performance, client-side processing.

The development and technical architecture of this library were made possible through:

* **Primary Logic Source:** Inspired by the Python OMR system developed by [Udayraj123](https://github.com/Udayraj123/OMRChecker), leveraging his research into rotation, perspective correction, and grid-based bubble detection.
* **Core Image Engine:** Powered by [OpenCV.js](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html), the official JavaScript port of the Open Source Computer Vision Library.
* **AI Collaboration:** This project was architected, debugged, and documented with the strategic assistance of **Gemini 3 Pro**. The AI code assistant played a critical role in optimizing Web Worker communication, resolving complex Vite/Webpack bundling issues, and implementing minification-safe class structures.

### License

MIT