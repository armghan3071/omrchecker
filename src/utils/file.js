/**
 * src/utils/file.js
 * Strict port of file.py
 */
import logger from '../logger.js';

// Global VFS State
export const VFS = {
    dirs: new Set(),
    files: new Map() // Path -> Content
};

export function load_json(path) {
    // Check if path is actually a pre-loaded object (from app.js)
    if (typeof path === 'object' && path !== null) return path;
    
    // Check VFS
    if (VFS.files.has(path)) {
        try {
            return JSON.parse(VFS.files.get(path));
        } catch (e) {
            logger.error(`Error when loading json file at: '${path}'\n${e.message}`);
            throw e;
        }
    }
    throw new Error(`File not found: ${path}`);
}

export class Paths {
    constructor(output_dir) {
        this.output_dir = output_dir;
        this.save_marked_dir = `${output_dir}/CheckedOMRs`;
        this.results_dir = `${output_dir}/Results`;
        this.manual_dir = `${output_dir}/Manual`;
        this.errors_dir = `${this.manual_dir}/ErrorFiles`;
        this.multi_marked_dir = `${this.manual_dir}/MultiMarkedFiles`;
    }
}

export function setup_dirs_for_paths(paths) {
    logger.info("Checking Directories...");
    
    const dirs = [
        paths.save_marked_dir,
        `${paths.save_marked_dir}/stack`,
        `${paths.save_marked_dir}/_MULTI_`,
        `${paths.save_marked_dir}/_MULTI_/stack`,
        paths.manual_dir,
        paths.results_dir,
        paths.multi_marked_dir,
        paths.errors_dir
    ];

    for (const d of dirs) {
        if (!VFS.dirs.has(d)) {
            logger.info(`Created : ${d}`);
            VFS.dirs.add(d);
        }
    }
}

export function setup_outputs_for_template(paths, template) {
    logger.info("Checking Files...");
    
    const ns = {
        paths: paths,
        empty_resp: new Array(template.output_columns.length).fill(""),
        sheetCols: ["file_id", "input_path", "output_path", "score", ...template.output_columns],
        OUTPUT_SET: [],
        files_obj: {}, // Maps key to file PATH (string)
        filesMap: {}
    };

    // Format Time: 09AM
    const now = new Date();
    let hrs = now.getHours();
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    hrs = hrs % 12;
    hrs = hrs ? hrs : 12;
    const timeStr = `${hrs.toString().padStart(2, '0')}${ampm}`;

    ns.filesMap = {
        "Results": `${paths.results_dir}/Results_${timeStr}.csv`,
        "MultiMarked": `${paths.manual_dir}/MultiMarkedFiles.csv`,
        "Errors": `${paths.manual_dir}/ErrorFiles.csv`
    };

    for (const [key, fileName] of Object.entries(ns.filesMap)) {
        ns.files_obj[key] = fileName;
        
        if (!VFS.files.has(fileName)) {
            logger.info(`Created new file: '${fileName}'`);
            // Write Header
            appendToCsv(fileName, ns.sheetCols);
        } else {
            logger.info(`Present : appending to '${fileName}'`);
        }
    }

    return ns;
}

// Helper to mimic pandas.to_csv(mode='a', quoting=QUOTE_NONNUMERIC)
export function appendToCsv(filePath, row) {
    // Quote non-numbers
    const line = row.map(val => {
        if (typeof val === 'string') return `"${val}"`;
        return val;
    }).join(",") + "\n";

    const prev = VFS.files.get(filePath) || "";
    VFS.files.set(filePath, prev + line);
}