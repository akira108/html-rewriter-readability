// phase1-handler.ts

import { VOID_ELEMENTS } from './constants'; // Import from constants.ts
import type {
  ElementAttributes,
  ElementInfo,
  Metadata,
} from './types'; // Import from types.ts
import { extractMetadataFromElement, unescapeHtmlEntities } from './utils'; // Import from utils.ts

// HTMLRewriter types (import based on environment)
// import type { Element, Comment, Text, Doctype, DocumentEnd } from '@cloudflare/workers-types';

/** Function type for generating IDs */
type IdGenerator = () => number;

export class Phase1Handler {
  private elementStore: Map<number, ElementInfo>;
  private metadataStore: Metadata;
  private generateElementId: IdGenerator;
  private debugEnabled: boolean;
  private maxElemsToParse: number;
  private elementStack: number[] = []; // Stack of currently nested element IDs
  private elementCount = 0;

  // Map to store the last text chunk
  // Key: elementId, Value: last processed (non-whitespace) chunk
  private lastTextChunkMap: Map<number, string> = new Map();

  /**
   * Initialize Phase1Handler.
   * @param elementStore Map to store element information (managed externally)
   * @param metadataStore Object to store metadata (managed externally)
   * @param idGenerator Function to generate element IDs (managed externally)
   */
  constructor(
    elementStore: Map<number, ElementInfo>,
    metadataStore: Metadata,
    idGenerator: IdGenerator,
    debugEnabled: boolean,
    maxElemsToParse?: number
  ) {
    this.elementStore = elementStore;
    this.metadataStore = metadataStore;
    this.generateElementId = idGenerator;
    this.debugEnabled = debugEnabled;
    this.maxElemsToParse = maxElemsToParse ?? 0;
  }

  /** Get the ID of the currently processing element (top of stack) */
  private getCurrentElementIdFromStack(): number | null {
    return this.elementStack.length > 0 ? this.elementStack[this.elementStack.length - 1] : null;
  }


  /** Process document end */
  end(end: DocumentEnd) {
    console.log("Phase 1: HTML parsing finished (End Handler).");
    // Check for unclosed elements if stack is not empty
    if (this.elementStack.length > 0) {
      console.warn(`Phase 1 End: Element stack is not empty: [${this.elementStack.join(', ')}]`);
    }
    // Clear the Map
    this.lastTextChunkMap.clear();
    console.log("Phase 1: lastTextChunkMap cleared.");
  }

  // --- Element Handler ---

  /** Process element start tag */
  element(element: Element) {
    if (this.maxElemsToParse > 0 && this.elementCount >= this.maxElemsToParse) {
      if (this.debugEnabled) {
        console.log(`[MAX_ELEMS] Reached max elements to parse (${this.maxElemsToParse}). Stopping.`);
      }
      return;
    }
    this.elementCount++;
    const tagName = element.tagName.toUpperCase();
    if (this.debugEnabled) console.log(`Phase1: [START] <${tagName}>`);

    // --- Skip unnecessary elements ---
    if (tagName === "SCRIPT" || tagName === "STYLE" || tagName === "NOSCRIPT" || tagName === "IFRAME" ||
      (tagName === 'LINK' && element.getAttribute('rel') === 'stylesheet')) {
      if (this.debugEnabled) console.log(`Phase1: [SKIP] <${tagName}>`);
      return; // Exit handler (onEndTag won't be registered)
    }

    // --- Prepare and store element information ---
    const elementId = this.generateElementId();
    const parentId = this.getCurrentElementIdFromStack(); // Parent is top of stack
    const attributes: ElementAttributes = {};
    for (const [key, value] of element.attributes) {
      attributes[key.toLowerCase()] = value;
    }
    const isVisibleBasedOnAttrs =
      element.getAttribute("hidden") === null &&
      attributes.style?.includes('display: none') !== true &&
      attributes.style?.includes('visibility: hidden') !== true &&
      element.getAttribute("aria-hidden") !== "true";
    const role = element.getAttribute("role");

    // Store information in elementStore
    this.elementStore.set(elementId, {
      id: elementId,
      parentId: parentId,
      tagName: tagName,
      attributes: attributes,
      textChunks: [], // Initialize chunks array
      finalTextContent: "", // Initialize final text
      isVisibleBasedOnAttrs: isVisibleBasedOnAttrs,
      role: role ?? null,
      isDataTableLikely: (tagName === 'TABLE' && attributes.role !== 'presentation' && attributes.datatable !== '0'),
      isCodeBlock: (tagName === 'PRE'),
    });

    // Delete entry from Map when new element starts (to avoid comparing with previous element's chunks)
    this.lastTextChunkMap.delete(elementId);

    // --- Process specific tags (attribute changes and metadata collection) ---
    if (tagName === 'IMG' || tagName === 'PICTURE' || tagName === 'FIGURE') {
      const src = element.getAttribute('src');
      const srcset = element.getAttribute('srcset');
      const dataSrc = element.getAttribute('data-src');
      const dataSrcset = element.getAttribute('data-srcset');
      if (!src && dataSrc) {
        element.setAttribute('src', dataSrc);
        element.removeAttribute('data-src');
      }
      if (!srcset && dataSrcset) {
        element.setAttribute('srcset', dataSrcset);
        element.removeAttribute('data-srcset');
      }
    } else if (tagName === 'META') {
      const extractedMeta = extractMetadataFromElement(element);
      for (const key in extractedMeta) {
        const metaKey = key as keyof Metadata;
        if (!this.metadataStore[metaKey]) {
          this.metadataStore[metaKey] = unescapeHtmlEntities(extractedMeta[metaKey]);
        }
      }
    } else if (tagName === 'HTML') {
      this.metadataStore.lang = element.getAttribute('lang') ?? undefined;
      this.metadataStore.dir = element.getAttribute('dir') ?? undefined;
    }

    // --- Register stack and onEndTag (except for void elements) ---
    if (!VOID_ELEMENTS.has(tagName)) {
      // Push current element ID to stack
      this.elementStack.push(elementId);

      try {
        // Register end tag handler
        element.onEndTag(() => {
          if (this.elementStack.length === 0) {
            console.error(`Phase1: EndTag Error: Stack empty when processing </${tagName}>`);
            return;
          }
          const finishedElementId = this.elementStack.pop();
          if (finishedElementId === undefined) return;

          // Delete from Map when finished
          this.lastTextChunkMap.delete(finishedElementId);

          const info = this.elementStore.get(finishedElementId);
          if (info) {
            // Combine text chunks and store in finalTextContent
            info.finalTextContent = (info.textChunks ?? []).join('');
            info.textChunks = undefined; // Remove unnecessary chunk array

            if (this.debugEnabled) console.log(`Phase1: EndTag </${tagName}>#${finishedElementId}. Final text: "${info.finalTextContent.substring(0, 50)}..."`);

            if (info.tagName === 'TITLE' && !this.metadataStore.title) {
              this.metadataStore.title = unescapeHtmlEntities(info.finalTextContent.trim());
            }
          } else {
            console.error(`Phase1: EndTag Error: ElementInfo not found for ID ${finishedElementId} (</${tagName}>)`);
          }
        });
        if (this.debugEnabled) console.log(`Phase1: [END] <${tagName}>#${elementId}, onEndTag registered`);

      } catch (error) {
        console.warn(`Phase1: Failed to register onEndTag for <${tagName}>#${elementId}:`, error);
        // If registration fails, remove from stack and Map
        if (this.elementStack.length > 0 && this.elementStack[this.elementStack.length - 1] === elementId) {
          this.lastTextChunkMap.delete(elementId);
          this.elementStack.pop();
        }
        if (this.debugEnabled) console.log(`Phase1: [END] <${tagName}>#${elementId}, onEndTag registration failed`);
      }
    } else {
      // --- Process void elements ---
      if (this.debugEnabled) console.log(`Phase1: [END] Void element <${tagName}>#${elementId}`);
      // Delete from Map for void elements too
      this.lastTextChunkMap.delete(elementId);
      // Remove textChunks from void element info
      const voidInfo = this.elementStore.get(elementId);
      if (voidInfo) voidInfo.textChunks = undefined;
    }
  }

  /** Text chunk processing */
  text(text: Text) {
    const currentElementId = this.getCurrentElementIdFromStack();
    const newChunk = text.text; // Original text
    const significantText = newChunk.trim().length > 0;

    if (this.debugEnabled) console.log(`Phase1 Text Handler: currentElementId=${currentElementId}, hasSignificantText=${significantText}, chunk="${newChunk.substring(0, 50).replace(/\n/g, '\\n')}..."`);

    if (currentElementId !== null && significantText) {
      const currentInfo = this.elementStore.get(currentElementId);
      if (currentInfo && !VOID_ELEMENTS.has(currentInfo.tagName)) {
        // ★★★ Duplicate Check ★★★
        const lastChunk = this.lastTextChunkMap.get(currentElementId);
        if (lastChunk !== newChunk) {
          // Add only if different from the previous chunk
          if (!currentInfo.textChunks) currentInfo.textChunks = [];
          currentInfo.textChunks.push(newChunk);
          if (this.debugEnabled) console.log(`  -> Added to ${currentInfo.tagName}#${currentElementId}`);
          // ★ Record the last added chunk (only if not whitespace)
          this.lastTextChunkMap.set(currentElementId, newChunk);
        } else {
          if (this.debugEnabled) console.log(`  -> Skipped duplicate chunk for ${currentInfo.tagName}#${currentElementId}`);
        }
      }
      else if (currentInfo) {
        if (this.debugEnabled) console.log(`  -> Ignored for void element: ${currentInfo.tagName}#${currentElementId}`);
      } else {
        if (this.debugEnabled) console.log(`  -> Ignored because currentInfo not found for ID: ${currentElementId}`);
      }
    }
    else if (currentElementId === null) {
      if (this.debugEnabled) console.log("  -> Ignored because stack is empty.");
    } else {
      if (this.debugEnabled) console.log("  -> Ignored because chunk is whitespace only.");
    }
  }

}
