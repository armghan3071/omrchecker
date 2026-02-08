import type { InputArray, int, OutputArray } from "./_types";
/**
 * Applies a colormap on a given image.
 *
 * @param src The source image, which should be grayscale. Should be 8-bit, 16-bit, or floating-point.
 * @param dst The result is the colored image.
 * @param colormap The colormap to apply.
 */
export declare function applyColorMap(src: InputArray, dst: OutputArray, colormap: int): void;
/**
 * Applies a user colormap on a given image.
 *
 * @param src The source image, which should be grayscale. Should be 8-bit, 16-bit, or floating-point.
 * @param dst The result is the colored image.
 * @param userColor The colormap to apply of type CV_8UC1 or CV_8UC3 and size 256.
 */
export declare function applyColorMap(src: InputArray, dst: OutputArray, userColor: InputArray): void;
/**
 * Colormap types used by the applyColorMap function.
 */
export type ColormapTypes = any;
export declare const COLORMAP_AUTUMN: ColormapTypes;
export declare const COLORMAP_BONE: ColormapTypes;
export declare const COLORMAP_JET: ColormapTypes;
export declare const COLORMAP_WINTER: ColormapTypes;
export declare const COLORMAP_RAINBOW: ColormapTypes;
export declare const COLORMAP_OCEAN: ColormapTypes;
export declare const COLORMAP_SUMMER: ColormapTypes;
export declare const COLORMAP_SPRING: ColormapTypes;
export declare const COLORMAP_COOL: ColormapTypes;
export declare const COLORMAP_HSV: ColormapTypes;
export declare const COLORMAP_PINK: ColormapTypes;
export declare const COLORMAP_HOT: ColormapTypes;
export declare const COLORMAP_PARULA: ColormapTypes;
export declare const COLORMAP_MAGMA: ColormapTypes;
export declare const COLORMAP_INFERNO: ColormapTypes;
export declare const COLORMAP_PLASMA: ColormapTypes;
export declare const COLORMAP_VIRIDIS: ColormapTypes;
export declare const COLORMAP_CIVIDIS: ColormapTypes;
export declare const COLORMAP_TWILIGHT: ColormapTypes;
export declare const COLORMAP_TWILIGHT_SHIFTED: ColormapTypes;
export declare const COLORMAP_TURBO: ColormapTypes;
export declare const COLORMAP_DEEPGREEN: ColormapTypes;
