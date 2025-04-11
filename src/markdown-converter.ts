// markdown-converter.ts

import { VOID_ELEMENTS } from './constants';
import type { ElementInfo } from './types';
import { escapeHtml, getChildrenIds, getInnerText } from './utils'; // Import from utils

export interface MarkdownConverterOptions {
  debug?: boolean;
  // Other options (e.g., headingStyle, bulletListMarker) can be added
}

export class MarkdownConverter {
  private elementStore: Map<number, ElementInfo>;
  private elementsToKeepIdsSet: Set<number>;
  private baseURI: URL;
  private options: MarkdownConverterOptions;

  constructor(
    elementStore: Map<number, ElementInfo>,
    elementsToKeepIdsSet: Set<number>,
    baseURI: URL,
    options: MarkdownConverterOptions = {}
  ) {
    this.elementStore = elementStore;
    this.elementsToKeepIdsSet = elementsToKeepIdsSet;
    this.baseURI = baseURI;
    this.options = options;
  }

  public convert(rootElementId: number | null): string { // Allow rootElementId to be null
    if (this.options.debug) console.log("Converting extracted elements to Markdown... :)");
    if (rootElementId === null) {
      if (this.options.debug) console.error("Cannot generate Markdown: Root element ID is null.");
      return "";
    }

    let markdownOutput = '';
    const rootChildren = getChildrenIds(rootElementId, this.elementStore);

    for (const childId of rootChildren) {
      markdownOutput += this.convertNodeRecursive(childId);
    }

    // Clean up unnecessary consecutive line breaks at the end
    markdownOutput = markdownOutput.replace(/\n{3,}/g, '\n\n').trim();

    if (this.options.debug) console.log("Markdown conversion finished.");
    return markdownOutput;
  }

  /**
   * Recursively converts the element with the specified ID and its descendants to a Markdown string.
   * @param id ID of the element to convert
   * @param listLevel Current nesting level of the list (0 is outside a list, 1 is the top-level list)
   * @param isListOrdered Whether the parent is an ordered list (affects LI elements only)
   * @param listItemNumber Current item number within an ordered list (affects LI elements only)
   * @returns Part of the generated Markdown string
   */
  private convertNodeRecursive(
    id: number,
    listLevel = 0,
    isListOrdered = false, // This indicates if the *direct parent* is an OL
    listItemNumber = 1     // This is the number for *this* LI if it's inside an OL
  ): string {
    const info = this.elementStore.get(id);
    // If not kept or no info, return empty string
    if (!info || !this.elementsToKeepIdsSet.has(id)) {
      return '';
    }

    let markdown = '';
    const tagName = info.tagName;

    // --- Generate Markdown for child elements first ---
    let childrenMarkdown = '';
    const children = getChildrenIds(id, this.elementStore);
    children.forEach((childId, index) => {
      const childInfo = this.elementStore.get(childId);
      const nextLevel = (tagName === 'UL' || tagName === 'OL' || tagName === 'LI') ? listLevel + 1 : 0; // Increase level within list-related elements
      const isNextListOrdered = (tagName === 'OL'); // Tell the next level LI if the current one is OL
      const nextListItemNumber = (tagName === 'OL') ? index + 1 : 1; // Pass the number to the direct children of OL
      childrenMarkdown += this.convertNodeRecursive(
        childId,
        nextLevel,
        isNextListOrdered,
        nextListItemNumber
      );
    });

    // --- Get and escape the element's own direct text ---
    let elementText = '';
    const rawDirectText = getInnerText(id, this.elementStore, false); // Get directTextContent
    if (rawDirectText) {
      // Escape Markdown special characters (\, `, *, _, {, }, [, ], (, ), #, +, -, ., !)
      // Note: Be careful not to over-escape, especially inside code blocks.
      // Libraries like Turndown handle this well.
      elementText = rawDirectText.replace(/([\\`*_{}[\]()#+.!-])/g, '\\$1');
      // Assuming HTML entities are decoded (& -> & should be checked if unescapeHtmlEntities was done in Phase1)
      // If not, add decoding process here
    }

    // --- List element indentation ---
    // listLevel=1 means no indent, 2 means 2 spaces, 3 means 4 spaces...
    const listIndent = '  '.repeat(listLevel > 0 ? listLevel - 1 : 0);

    // --- Markdown generation per tag ---
    switch (tagName) {
      case 'P': {
        // Paragraph: Indent + own text + children result + 2 newlines
        // (Trim because child elements might be block elements, potentially adding extra newlines)
        const pContent = (elementText + childrenMarkdown).trim();
        markdown = pContent ? `${listIndent}${pContent}\n\n` : ''; // Don't output empty P
        break;
      }
      case 'H1': markdown = `${listIndent}# ${elementText}${childrenMarkdown}\n\n`; break;
      case 'H2': markdown = `${listIndent}## ${elementText}${childrenMarkdown}\n\n`; break;
      case 'H3': markdown = `${listIndent}### ${elementText}${childrenMarkdown}\n\n`; break;
      case 'H4': markdown = `${listIndent}#### ${elementText}${childrenMarkdown}\n\n`; break;
      case 'H5': markdown = `${listIndent}##### ${elementText}${childrenMarkdown}\n\n`; break;
      case 'H6': markdown = `${listIndent}###### ${elementText}${childrenMarkdown}\n\n`; break;
      case 'UL':
      case 'OL':
        // List container itself only adds surrounding newlines. Indentation etc. is delegated to the content (LI).
        // Add if there's no blank line before the list
        markdown = childrenMarkdown.startsWith('\n') ? childrenMarkdown : `\n${childrenMarkdown}`;
        // Add if there's no blank line after the list (might be unnecessary as the last LI adds a newline)
        // markdown = markdown.endsWith('\n\n') ? markdown : markdown + '\n';
        break;
      case 'LI': {
        // isListOrdered is determined by whether the *parent* is OL
        const marker = isListOrdered ? `${listItemNumber}.` : '*';
        // Combine LI text and child Markdown
        let liContent = (elementText + childrenMarkdown).trim();
        // Multi-line support: Add indent to lines after the first (ideally matching marker length, but fixed indent here)
        const itemIndent = `${listIndent}  `; // Indent after the marker
        liContent = liContent.split('\n').map((line, index) => index > 0 ? itemIndent + line.trim() : line.trim()).join('\n');
        markdown = `${listIndent}${marker} ${liContent}\n`;
        break;
      }
      case 'A': {
        let href = info.attributes.href ?? '';
        if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
          try { href = new URL(href, this.baseURI).href; }
          catch (e) { console.warn(`Markdown Conv: Failed to resolve href: ${href}`); }
        }
        // Link text: Prioritize children if they exist, otherwise use own direct text
        const linkText = childrenMarkdown.trim() || elementText;
        // It's often better not to escape Markdown special characters within link text
        // (e.g., [**bold** link](...))
        markdown = `[${linkText.replace(/([\\`*_{}[\]()#+.!-])/g, '\\$1')}](${href || ''})`; // Adjust escaping within link text as needed
        break;
      }
      case 'IMG': {
        let src = info.attributes.src ?? '';
        if (src && !src.startsWith('http') && !src.startsWith('data:')) {
          try { src = new URL(src, this.baseURI).href; }
          catch (e) { console.warn(`Markdown Conv: Failed to resolve src: ${src}`); }
        }
        const alt = info.attributes.alt ?? '';
        const title = info.attributes.title ? ` "${escapeHtml(info.attributes.title)}"` : '';
        // Treat images as block elements, so indent + 2 trailing newlines
        markdown = `${listIndent}![${alt.replace(/([\\`*_{}[\]()#+.!-])/g, '\\$1')}](${src || ''}${title})\n\n`;
        break;
      }
      case 'PRE': {
        // Find CODE element within PRE
        const codeChild = children.map(cid => this.elementStore.get(cid)).find(cinfo => cinfo?.tagName === 'CODE');
        let codeContent = '';
        let lang = '';
        if (codeChild) {
          // Use the directTextContent of the CODE element (do not escape)
          codeContent = getInnerText(codeChild.id, this.elementStore, false);
          const langClass = codeChild.attributes.class?.match(/language-(\S+)/);
          lang = langClass ? langClass[1] : '';
        } else {
          // If no CODE, use the text directly under PRE (do not escape)
          codeContent = getInnerText(id, this.elementStore, false);
        }
        // Do not escape special characters within code blocks
        markdown = `${listIndent}\`\`\`${lang}\n${codeContent.trim()}\n${listIndent}\`\`\`\n\n`;
        break;
      }
      case 'CODE': {
        // Assume isCodeBlock flag is set in phase1
        if (!info.isCodeBlock) {
          // Inline code: Escaping content is generally unnecessary
          markdown = `\`${(elementText + childrenMarkdown).trim()}\``;
        } else {
          // If PRE > CODE, it was handled by PRE, so return empty string
          markdown = '';
          // However, PRE needed to be able to get the CODE text
          // (Handled by the PRE modification above)
        }
        break;
      }
      case 'STRONG': case 'B':
        markdown = `**${elementText}${childrenMarkdown}**`;
        break;
      case 'EM': case 'I':
        markdown = `*${elementText}${childrenMarkdown}*`;
        break;
      case 'BLOCKQUOTE': {
        // Combine text within blockquote and child Markdown
        const bqContent = (elementText + childrenMarkdown).trim();
        // Add > to the beginning of each line
        markdown = `${bqContent.split('\n').map(line => `${listIndent}> ${line.trim()}`).join('\n')}\n\n`;
        break;
      }
      case 'HR':
        markdown = `${listIndent}---\n\n`;
        break;
      case 'BR':
        // Need to decide whether to use two spaces + newline or just a newline based on surrounding text
        // Treat as GFM Hard break here
        markdown = '  \n';
        break;
      // Ignored structural tags (output content only)
      case 'DIV': case 'SPAN': case 'SECTION': case 'ARTICLE': case 'FIGURE': case 'FIGCAPTION': case 'HEADER': case 'FOOTER': case 'ASIDE': case 'NAV':
        markdown = `${elementText}${childrenMarkdown}`;
        break;
      // Other unhandled tags
      default:
        if (!VOID_ELEMENTS.has(tagName)) {
          // Output content only for unhandled non-void elements
          markdown = `${elementText}${childrenMarkdown}`;
          if (this.options.debug) console.log(`Unhandled tag: ${tagName} - outputting content only.`);
        } else {
          // Completely ignore unhandled void elements
          markdown = '';
          if (this.options.debug) console.log(`Ignoring void tag: ${tagName}`);
        }
    }
    return markdown;
  }
}
