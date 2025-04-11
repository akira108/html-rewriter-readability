/** Set of HTML void elements */
export const VOID_ELEMENTS = new Set([
  "AREA", "BASE", "BR", "COL", "EMBED", "HR", "IMG", "INPUT",
  "LINK", "META", "PARAM", "SOURCE", "TRACK", "WBR"
]);

/** Default tag names that Readability considers for scoring */
export const DEFAULT_TAGS_TO_SCORE = new Set([
  "SECTION", "H2", "H3", "H4", "H5", "H6", "P", "TD", "PRE", "ARTICLE"
]);

/** Regular expression for class/ID names that receive positive weight in Readability scoring */
export const POSITIVE_REGEX = /article|body|content|entry|hentry|h-entry|main|page|pagination|post|text|blog|story/i;

/** Regular expression for class/ID names that receive negative weight in Readability scoring */
export const NEGATIVE_REGEX = /-ad-|hidden|^hid$| hid$| hid |^hid |banner|combx|comment|com-|contact|footer|gdpr|masthead|media|meta|outbrain|promo|related|scroll|share|shoutbox|sidebar|skyscraper|sponsor|shopping|tags|widget/i;

/** Regular expression for class/ID names that Readability is likely to consider unnecessary */
export const UNLIKELY_CANDIDATES_REGEX = /-ad-|ai2html|banner|breadcrumbs|combx|comment|community|cover-wrap|disqus|extra|footer|gdpr|header|legends|menu|related|remark|replies|rss|shoutbox|sidebar|skyscraper|social|sponsor|supplemental|ad-break|agegate|pagination|pager|popup|yom-remote/i;

/** Regular expression for class/ID names that might be kept even if marked as unlikely candidates */
export const OK_MAYBE_ITS_A_CANDIDATE_REGEX = /and|article|body|column|content|main|mathjax|shadow/i;

/** Role attribute values that Readability is likely to consider unnecessary */
export const UNLIKELY_ROLES = new Set([
  "menu", "menubar", "complementary", "navigation", "alert", "alertdialog", "dialog"
]);

/** Regular expression for commas (and similar symbols) used in score calculation */
export const COMMAS_REGEX = /\u002C|\u060C|\uFE50|\uFE10|\uFE11|\u2E41|\u2E34|\u2E32|\uFF0C/g;

/** Number of top candidates in Readability */
export const NB_TOP_CANDIDATES = 5;

/** Minimum character threshold for Readability */
export const CHAR_THRESHOLD = 500;

/** Link density adjustment value for Readability */
export const LINK_DENSITY_MODIFIER = 0;
