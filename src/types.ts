/** Interface for storing HTML element attributes */
export interface ElementAttributes {
  [key: string]: string;
}

/** Interface for element information collected in Phase 1 */
export interface ElementInfo {
  id: number;
  parentId: number | null;
  tagName: string;
  attributes: ElementAttributes;
  textChunks?: string[]; // Temporarily store text chunks (or managed by Handler's Map)
  finalTextContent?: string; // Final text combined in onEndTag
  isVisibleBasedOnAttrs: boolean;
  role: string | null;
  isDataTableLikely: boolean;
  isCodeBlock: boolean;
  readability?: { contentScore: number };
}

/** Metadata collected in Phase 1 */
export interface Metadata {
  title?: string;
  byline?: string;
  excerpt?: string;
  siteName?: string;
  publishedTime?: string;
  lang?: string;
  dir?: string;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  jsonLd?: any; // Parsed JSON-LD data
}

/** Formatting options used in Phase 4 */
export interface FormattingOptions {
  debug: boolean;
  allowedVideoRegex?: RegExp;
}

/** Phase 4 formatting options (for Handler) */
export interface Phase4HandlerOptions {
  baseURI: URL; // For resolving relative paths
  keepClasses?: boolean; // Whether to preserve classes
  classesToPreserve?: string[]; // Classes to preserve when keepClasses=false
  formattingOptions?: FormattingOptions; // Include FormattingOptions
}

/** Options for HtmlRewriterReadability constructor */
export interface ReadabilityOptions {
  debug?: boolean; // default false
  maxElemsToParse?: number; // 0 = infinite
  nbTopCandidates?: number; // number of top candidates to consider when analysing high-level content
  charThreshold?: number; // minimum char count for node to be considered primary content (differs from Readability.js)
  classesToPreserve?: string[]; // e.g. ["image", "figure"]
  keepClasses?: boolean; // removes all classes except those provided in classesToPreserve
  allowedVideoRegex?: RegExp; // videos that match this regex will be preserved, see default value in constructor
  linkDensityModifier?: number; // Modifier for link density calculation, 0 means use default Readability.js like logic
}

/** Type for function that returns the next unique element ID */
export type NextElementIdGetter = () => number;
