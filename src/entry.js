/**
 * src/entry.js
 * Complete Port: Exclusion, Multi-Marked, Errors, and Stats
 */
import logger from './logger.js';
import { CONFIG_DEFAULTS } from './defaults/config.js';
import { Template } from './template.js';
import { EvaluationConfig, evaluate_concatenated_response } from './evaluation.js';
import { open_config_with_defaults, get_concatenated_response } from './utils/parsing.js';
import { VFS, Paths, setup_dirs_for_paths, setup_outputs_for_template, appendToCsv } from './utils/file.js';
import { InteractionUtils, Stats } from './utils/interaction.js';
import { ImageUtils } from './utils/image.js';
import { ERROR_CODES } from './constants.js';

export const STATS = new Stats();

export async function process_dir(rootDir, currDir, args) {
    // 1. Config
    let tuningConfig = CONFIG_DEFAULTS;
    const localConfigPath = `${currDir}/config.json`;
    if (VFS.files.has(localConfigPath)) {
        tuningConfig = open_config_with_defaults(localConfigPath);
    }

    // 2. Template
    let template = null;
    const localTemplatePath = `${currDir}/template.json`;
    if (VFS.files.has(localTemplatePath)) {
        
        const templateJson = JSON.parse(VFS.files.get(localTemplatePath));
        templateJson._path = localTemplatePath; 
        template = new Template(templateJson, tuningConfig);
    }

    // 3. Evaluation
    let evaluationConfig = null;
    const localEvalPath = `${currDir}/evaluation.json`;
    if (!args.setLayout && VFS.files.has(localEvalPath) && template) {
        evaluationConfig = new EvaluationConfig(currDir, localEvalPath, template, tuningConfig);
    }

    // 4. Find Images
    let imageFiles = [];
    for (const [path, _] of VFS.files.entries()) {
        if (path.startsWith(currDir) && /\.(png|jpg|jpeg)$/i.test(path)) {
            imageFiles.push(path);
        }
    }

    // --- MISSING LOGIC: File Exclusion ---
    const excludedFiles = new Set();
    if (template) {
        // Exclude pre-processor files (e.g., omr_marker.jpg)
        template.pre_processors.forEach(pp => {
            // pp.exclude_files() returns array of relative paths or filenames
            if (pp.exclude_files) {
                pp.exclude_files().forEach(f => {
                    // Handle both absolute VFS paths and simple filenames
                    if (f.startsWith('/')) excludedFiles.add(`inputs${f}`); 
                    else excludedFiles.add(`${currDir}/${f}`);
                    excludedFiles.add(f); // Add raw filename just in case
                });
            }
        });
    }
    if (evaluationConfig) {
        // Exclude answer key images
        evaluationConfig.excludeFiles.forEach(f => {
             excludedFiles.add(f);
             excludedFiles.add(`${currDir}/${f}`);
        });
    }

    // Filter images
    imageFiles = imageFiles.filter(f => {
        const fname = f.split('/').pop();
        // Check full path or filename match
        return !excludedFiles.has(f) && !excludedFiles.has(fname);
    });
    // -------------------------------------

    if (imageFiles.length === 0) {
        logger.info(`No valid images found in ${currDir} (Checked ${excludedFiles.size} exclusions).`);
        return;
    }

    if (!template) {
        throw new Error(`Images found but no template.json in ${currDir}`);
    }

    // 5. Setup Outputs & Run
    if (args.setLayout) {
        logger.info("--- Running in SET LAYOUT Mode ---");
        const results = await show_template_layouts(imageFiles, template, tuningConfig);
        return results;
    } else {
        const relativeDir = currDir.replace(rootDir, '').replace(/^\//, '');
        const outputDir = `${args.output_dir}/${relativeDir}`;
        const paths = new Paths(outputDir);
        
        setup_dirs_for_paths(paths);
        const outputsNs = setup_outputs_for_template(paths, template);

        const results = await process_files(imageFiles, template, tuningConfig, evaluationConfig, outputsNs, args.includeOutputImages);
        
        print_stats(imageFiles.length, tuningConfig);
        return results;
    }
}

async function show_template_layouts(files, template, config) {
    const results = [];
    for (const filePath of files) {
        const fileName = filePath.split('/').pop();
        logger.info(`Generating Layout: ${fileName}`);

        const inOmr = await ImageUtils.get_image_by_name(filePath);
        if (!inOmr) continue;

        const processed = await template.image_instance_ops.apply_preprocessors(
            filePath, 
            inOmr.clone(), 
            template
        );

        if (!processed) {
            logger.error(`Could not preprocess ${fileName} for layout check.`);
            continue;
        }

        const layoutImg = template.image_instance_ops.draw_template_layout(
            processed, 
            template, 
            false, 
            false, 
            2      
        );

        const base64 = await ImageUtils.matToBase64(layoutImg);
        results.push({
            fileName,
            layoutImage: base64
        });

        InteractionUtils.show(`Layout: ${fileName}`, layoutImg, { config });

        processed.delete();
        layoutImg.delete();
    }
    return results;
}

async function process_files(files, template, config, evalConfig, outputsNs, includeImages = false) {
    const startTime = Date.now();
    let counter = 0;
    const results = [];
    
    // Reset global stats
    STATS.files_moved = 0;
    STATS.files_not_moved = 0;

    for (const filePath of files) {
        counter++;
        const fileName = filePath.split('/').pop();
        logger.info(`Processing (${counter}/${files.length}): ${fileName}`);

        const inOmr = await ImageUtils.get_image_by_name(filePath);
        if (!inOmr || inOmr.isDeleted()) continue;

        const processed = await template.image_instance_ops.apply_preprocessors(
            filePath, 
            inOmr.clone(), 
            template
        );

        // --- MISSING LOGIC: Error Handling (No Marker/Page) ---
        if (!processed) {
            // Error OMR case
            const newFilePath = `${outputsNs.paths.errors_dir}/${fileName}`;
            logger.error(`Failed to process ${fileName}. Moving to ErrorFiles.`);
            
            // Add to Error CSV
            const errRow = [fileName, filePath, newFilePath, "NA", ...outputsNs.empty_resp];
            appendToCsv(outputsNs.files_obj["Errors"], errRow);
            
            STATS.files_moved++; // Tracking error files as "moved" out of processing
            results.push({ 
                fileName, 
                error: "Processing Failed", 
                path: filePath 
            });
            continue;
        }
        // ------------------------------------------------------

        const saveDir = outputsNs.paths.save_marked_dir;
        const result = template.image_instance_ops.read_omr_response(
            template, 
            processed, 
            fileName, 
            saveDir
        );

        const { response_dict, final_marked, multi_marked } = result;
        const omrResponse = get_concatenated_response(response_dict, template);

        let score = "NA";
        if (evalConfig) {
            score = evaluate_concatenated_response(omrResponse, evalConfig);
            logger.info(`Score: ${score}`);
        } else {
            logger.info(`Response: ${JSON.stringify(omrResponse)}`);
        }

        if (config.outputs.show_image_level >= 2) {
            InteractionUtils.show(`Marked: ${fileName}`, final_marked, {config});
        }

        const respArray = template.outputColumns.map(col => omrResponse[col]);
        
        const resultItem = {
            fileName,
            score,
            response: omrResponse,
            imagePath: filePath,
            markedImagePath: `${saveDir}/${fileName}`,
            multiMarked: false
        };
        if (includeImages && final_marked) {
            resultItem.markedImage = await ImageUtils.matToBase64(final_marked);
        }

        // --- MISSING LOGIC: Multi-Marked Handling ---
        if (multi_marked && config.outputs.filter_out_multimarked_files) {
            // Multi-marked case
            logger.warning(`Found multi-marked file: '${fileName}'`);
            const newFilePath = `${outputsNs.paths.multi_marked_dir}/${fileName}`;
            
            // Add to MultiMarked CSV
            const mmRow = [fileName, filePath, newFilePath, "NA", ...respArray];
            appendToCsv(outputsNs.files_obj["MultiMarked"], mmRow);
            
            STATS.files_moved++;
            resultItem.multiMarked = true;
        } else {
            // Normal case
            STATS.files_not_moved++;
            const row = [fileName, filePath, `${saveDir}/${fileName}`, score, ...respArray];
            appendToCsv(outputsNs.files_obj["Results"], row);
        }
        results.push(resultItem);
        // ---------------------------------------------

        if (final_marked) final_marked.delete();
        if (processed) processed.delete();
    }
    return results;
}

// --- MISSING LOGIC: Print Stats ---
function print_stats(totalFiles, config) {
    const timeChecking = (Date.now() - (STATS.startTime || Date.now())) / 1000;
    // In browser, tracking start time is tricky due to async gaps, 
    // so we just log the totals.
    
    logger.info("");
    logger.info(`Total file(s) moved (Errors/Multi): ${STATS.files_moved}`);
    logger.info(`Total file(s) processed (Results):  ${STATS.files_not_moved}`);
    logger.info("--------------------------------");
    
    // Sanity check
    const totalProcessed = STATS.files_moved + STATS.files_not_moved;
    const tallyMsg = (totalFiles === totalProcessed) ? "Sum Tallied!" : "Not Tallying!";
    logger.info(`Total input file(s): ${totalFiles} (${tallyMsg})`);
}