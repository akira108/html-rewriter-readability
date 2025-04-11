import {
  NEGATIVE_REGEX,
  OK_MAYBE_ITS_A_CANDIDATE_REGEX,
  POSITIVE_REGEX, UNLIKELY_CANDIDATES_REGEX, UNLIKELY_ROLES
} from './constants';
import type { ElementAttributes, ElementInfo, Metadata } from './types';

/** Decode HTML entities */
export function unescapeHtmlEntities(str: string | undefined | null): string | undefined {
  if (!str) return undefined;
  return str
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/&/g, '&')
}

/** Escape special HTML characters */
export function escapeHtml(unsafe: string | undefined | null): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, "\"")
    .replace(/'/g, "'");
}

/** Extract metadata from META element */
export function extractMetadataFromElement(element: Element): Partial<Metadata> {
  // (same implementation as before)
  const extracted: Partial<Metadata> = {};
  const name = element.getAttribute("name")?.toLowerCase();
  const property = element.getAttribute("property")?.toLowerCase();
  const content = element.getAttribute("content");

  if (!content) return {};

  // Title, Byline, Excerpt, SiteName, PublishedTime extraction logic...
  if (property === "og:title" || name === "twitter:title" /* ... */) extracted.title = content;
  if (property === "og:article:author" || name === "author" /* ... */) extracted.byline = content;
  if (property === "og:description" || name === "description" /* ... */) extracted.excerpt = content;
  if (property === "og:site_name") extracted.siteName = content;
  if (property === "article:published_time" || name === "parsely-pub-date" /* ... */) extracted.publishedTime = content;

  return extracted;
}

// --- Helper functions for Phase 2 ---

export function getElementInfo(id: number, store: Map<number, ElementInfo>): ElementInfo | undefined {
  return store.get(id);
}

export function getParentId(id: number, store: Map<number, ElementInfo>): number | null {
  return getElementInfo(id, store)?.parentId ?? null;
}

export function getAncestorIds(id: number, store: Map<number, ElementInfo>, maxDepth = 5): number[] {
  const ancestors: number[] = [];
  let currentId: number | null = id;
  let depth = 0;
  while (currentId !== null && (maxDepth <= 0 || depth < maxDepth)) {
    const parentId = getParentId(currentId, store);
    if (parentId !== null) {
      ancestors.push(parentId);
      currentId = parentId;
      depth++;
    } else {
      break;
    }
  }
  return ancestors;
}

export function getChildrenIds(parentId: number, store: Map<number, ElementInfo>): number[] {
  const children: number[] = [];
  for (const [id, info] of store.entries()) {
    if (info.parentId === parentId) {
      children.push(id);
    }
  }
  children.sort((a, b) => a - b);
  return children;
}

export function getDescendantIds(id: number, store: Map<number, ElementInfo>): number[] {
  const descendants: number[] = [];
  const children = getChildrenIds(id, store);
  for (const childId of children) {
    descendants.push(childId);
    descendants.push(...getDescendantIds(childId, store));
  }
  return descendants;
}

export function getInnerText(id: number, store: Map<number, ElementInfo>, normalizeSpaces = true): string {
  const text = getElementInfo(id, store)?.finalTextContent ?? "";
  return normalizeSpaces ? text.replace(/\s{2,}/g, " ").trim() : text.trim();
}

export function getTotalVisibleInnerText(id: number, store: Map<number, ElementInfo>, normalizeSpaces = true): string {
  let totalText = "";
  const info = getElementInfo(id, store);

  if (info?.isVisibleBasedOnAttrs) {
    totalText = getInnerText(id, store, normalizeSpaces);
  }

  const children = getChildrenIds(id, store);
  for (const childId of children) {
    totalText += ` ${getTotalVisibleInnerText(childId, store, normalizeSpaces)}`;
  }

  return normalizeSpaces ? totalText.replace(/\s{2,}/g, " ").trim() : totalText.trim();
}

/** Calculate weight based on class/ID */
export function getClassWeight(id: number, store: Map<number, ElementInfo>): number {
  const info = getElementInfo(id, store);
  if (!info) return 0;
  let weight = 0;
  const className = info.attributes.class ?? '';
  const elementIdAttr = info.attributes.id ?? '';
  const classAndId = `${className} ${elementIdAttr}`;
  if (NEGATIVE_REGEX.test(classAndId)) weight -= 25;
  if (POSITIVE_REGEX.test(classAndId)) weight += 25;
  return weight;
}

/** Calculate link density (considering only visible links) */
export function getLinkDensity(id: number, store: Map<number, ElementInfo>): number {
  const textLength = getTotalVisibleInnerText(id, store).length;
  if (textLength === 0) return 0;
  let linkLength = 0;
  const descendantIds = [id, ...getDescendantIds(id, store)];
  for (const descendantId of descendantIds) {
    const descInfo = getElementInfo(descendantId, store);
    if (descInfo?.isVisibleBasedOnAttrs && descInfo.tagName === 'A') {
      const href = descInfo.attributes.href;
      const coefficient = href?.startsWith('#') ? 0.3 : 1;
      linkLength += getTotalVisibleInnerText(descendantId, store).length * coefficient;
    }
  }
  return linkLength / textLength;
}

/** Initialize node score */
export function initializeNodeScore(id: number, store: Map<number, ElementInfo>): void {
  const info = getElementInfo(id, store);
  if (!info || info.readability) return;
  info.readability = { contentScore: 0 };
  switch (info.tagName) {
    case "ARTICLE": case "DIV": info.readability.contentScore += 5; break;
    case "PRE": case "TD": case "BLOCKQUOTE": info.readability.contentScore += 3; break;
    case "ADDRESS": case "OL": case "UL": case "DL": case "DD": case "DT": case "LI": case "FORM": info.readability.contentScore -= 3; break;
    case "H1": case "H2": case "H3": case "H4": case "H5": case "H6": case "TH": info.readability.contentScore -= 5; break;
  }
  info.readability.contentScore += getClassWeight(id, store);
}

/** Check if it's an unlikely candidate */
export function isUnlikelyCandidate(id: number, store: Map<number, ElementInfo>): boolean {
  const info = getElementInfo(id, store);
  if (!info) return true;
  const className = info.attributes.class ?? '';
  const elementIdAttr = info.attributes.id ?? '';
  const matchString = `${className} ${elementIdAttr}`;
  if (UNLIKELY_ROLES.has(info.role ?? '')) return true;
  if (UNLIKELY_CANDIDATES_REGEX.test(matchString) &&
    !OK_MAYBE_ITS_A_CANDIDATE_REGEX.test(matchString) &&
    info.tagName !== 'BODY' && info.tagName !== 'ARTICLE') {
    // If applying the Readability rule to not exclude elements within table/code,
    // it's necessary to add a check using getAncestorIds or similar.
    return true;
  }
  return false;
}
