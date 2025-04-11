import { MarkdownConverter } from './markdown-converter';
import { Phase1Handler } from './phase1-handler';
import { calculateScoresAndFindBestCandidate } from './phase2-scorer';
import type { ElementInfo, Metadata, ReadabilityOptions } from './types';
import { getParentId } from './utils';

export class HtmlRewriterReadability {
  private elementStore: Map<number, ElementInfo>;
  private metadataStore: Metadata;
  private elementCounter: number;
  private elementsToKeepIdsSet: Set<number>;
  private options: ReadabilityOptions;
  private baseURI: URL;

  constructor(baseURI: string | URL, options?: ReadabilityOptions) {
    if (typeof baseURI === 'string') {
      try {
        this.baseURI = new URL(baseURI);
      } catch (e) {
        console.error("Invalid baseURI provided:", baseURI, e);
        throw new Error(`Invalid baseURI provided: ${baseURI}`);
      }
    } else if (baseURI instanceof URL) {
      this.baseURI = baseURI;
    } else {
      throw new Error("baseURI must be a string or URL object.");
    }

    this.options = { ...HtmlRewriterReadability.defaultOptions, ...options };
    this.elementStore = new Map();
    this.elementsToKeepIdsSet = new Set();
    this.metadataStore = {};
    this.elementCounter = 0;
  }

  private resetState(): void {
    this.elementStore.clear();
    this.elementsToKeepIdsSet.clear();
    this.metadataStore = {};
    this.elementCounter = 0;
  }

  private async runPhase1(response: Response): Promise<void> {
    if (this.options.debug) console.log("Phase 1: Parsing HTML and gathering initial data...");

    this.resetState();

    const phase1Handler = new Phase1Handler(
      this.elementStore,
      this.metadataStore,
      () => ++this.elementCounter,
      this.options.debug ?? false,
      this.options.maxElemsToParse
    );
    const rewriter = new HTMLRewriter()
      .on("*", phase1Handler)
      .onDocument(phase1Handler);
    const responseClone = response.clone();
    await rewriter.transform(responseClone).text();
    if (this.options.debug) console.log("Phase 1 Completed. Element count:", this.elementStore.size);
    if (this.options.debug) console.log("Collected Metadata:", this.metadataStore);
  }

  private runPhase2(): { topCandidateId: number | null, elementsToKeepIds: number[] } {
    if (this.options.debug) console.log("Phase 2: Scoring elements...");
    const result = calculateScoresAndFindBestCandidate(this.elementStore, {
      debug: this.options.debug ?? false,
      nbTopCandidates: this.options.nbTopCandidates,
      charThreshold: this.options.charThreshold,
      allowedVideoRegex: this.options.allowedVideoRegex,
      linkDensityModifier: this.options.linkDensityModifier,
    });
    if (this.options.debug) console.log(`Phase 2 Completed. Top Candidate: ${result.topCandidateId}. Elements to keep: ${result.elementsToKeepIds.length}`);
    return result;
  }

  private convertToMarkdown(rootElementId: number | null): string {
    if (rootElementId === null) {
      if (this.options.debug) console.error("Cannot generate Markdown: Root element ID is null.");
      return "";
    }

    const converter = new MarkdownConverter(
      this.elementStore,
      this.elementsToKeepIdsSet,
      this.baseURI,
      { debug: this.options.debug }
    );

    return converter.convert(rootElementId);
  }



  public async process(response: Response): Promise<{ markdown: string, metadata: Metadata } | null> {
    await this.runPhase1(response);
    const { topCandidateId, elementsToKeepIds } = this.runPhase2();

    if (!topCandidateId || elementsToKeepIds.length === 0) {
      if (this.options.debug) console.warn("Failed to extract readable content.");
      return null;
    }
    this.elementsToKeepIdsSet = new Set(elementsToKeepIds);
    const rootBuildId = getParentId(topCandidateId, this.elementStore) ?? topCandidateId; // Use parent as starting point
    const markdown = this.convertToMarkdown(rootBuildId);
    ;

    return { markdown, metadata: this.metadataStore };
  }

  private static defaultOptions: ReadabilityOptions = {
    debug: false,
    maxElemsToParse: 0,
    nbTopCandidates: 5,
    charThreshold: 500,
    classesToPreserve: [],
    keepClasses: false,
    allowedVideoRegex: /(www\.youtube\.com|player\.vimeo\.com)/i,
    linkDensityModifier: 0,
  };
}
