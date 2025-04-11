# HTML Rewriter Readability

[![npm version](https://badge.fury.io/js/@akira108sys/html-rewriter-readability.svg)](https://badge.fury.io/js/@akira108sys/html-rewriter-readability)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

`html-rewriter-readability` is a library inspired by Mozilla's [Readability.js](https://github.com/mozilla/readability) algorithm, utilizing Cloudflare's [HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/) to extract and format the primary content of web pages. It is specifically designed to run efficiently in edge environments like Cloudflare Workers.

The extracted HTML content is then converted into Markdown format.

**Note:** While inspired by Readability.js, this library uses a different underlying mechanism (HTMLRewriter) and does not guarantee full API or behavioral compatibility with the original Mozilla library.

## Features

*   **Cloudflare Workers Optimized:** Leverages HTMLRewriter for fast HTML parsing and transformation on the edge.
*   **Readability-Based Extraction:** Removes clutter (ads, headers, footers, etc.) to extract the main article content.
*   **Markdown Output:** Provides the extracted content in a clean Markdown format.
*   **Metadata Extraction:** Retrieves metadata such as the title and language of the source page.

## Installation

```bash
npm install @akira108sys/html-rewriter-readability
# or
yarn add @akira108sys/html-rewriter-readability
```

## Usage

The basic usage involves instantiating the `HtmlRewriterReadability` class and passing a `Response` object to its `process` method.

```typescript
import { HtmlRewriterReadability, ReadabilityOptions } from '@akira108sys/html-rewriter-readability';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
      return new Response('Please provide a target URL using the ?url= parameter.', { status: 400 });
    }

    try {
      // Fetch the target URL
      const targetResponse = await fetch(targetUrl, {
        headers: {
          // It's good practice to identify your bot
          'User-Agent': 'html-rewriter-readability-worker (https://github.com/akira108/html-rewriter-readability)'
        }
      });

      if (!targetResponse.ok) {
        return new Response(`Failed to fetch ${targetUrl}: ${targetResponse.statusText}`, { status: targetResponse.status });
      }

      // Optional: Specify options
      const options: ReadabilityOptions = {
        debug: false, // Enable debug logging
        // ... other options
      };

      const readability = new HtmlRewriterReadability(options);
      // Process the Response object
      const result = await readability.process(targetResponse);

      if (result) {
        // Example: Return result as Markdown
        const responseBody = result.markdown;
        return new Response(responseBody, {
          headers: { 'Content-Type': 'text/markdown;charset=UTF-8' },
        });
      } else {
        return new Response('Could not extract readable content.', { status: 500 });
      }

    } catch (error) {
      console.error('Error processing request:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return new Response(`Error processing request: ${errorMessage}`, { status: 500 });
    }
  },
};
```

## Options (`ReadabilityOptions`)

You can pass the following options to the `HtmlRewriterReadability` constructor:

| Option Name           | Type       | Default     | Description                                                                                                                                                                                                   |
| :-------------------- | :--------- | :---------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `debug`               | `boolean`  | `false`     | If `true`, outputs detailed logs for each processing phase to the console.                                                                                                                                    |
| `maxElemsToParse`     | `number`   | `0`         | The maximum number of elements to parse. `0` means no limit. Use this to potentially improve performance on very large pages.                                                                                 |
| `nbTopCandidates`     | `number`   | `5`         | The number of top candidates to consider during scoring.                                                                                                                                                      |
| `charThreshold`       | `number`   | `500`       | The minimum number of characters an element must have to be considered a candidate (default in Readability.js is 25, adjusted here considering HTMLRewriter's streaming nature).                              |
| `classesToPreserve`   | `string[]` | `[]`        | An array of CSS class names to preserve on elements in the extracted content.                                                                                                                                 |
| `keepClasses`         | `boolean`  | `false`     | If `true`, attempts to preserve all class attributes on elements (can be used alongside `classesToPreserve`).                                                                                                 |
| `allowedVideoRegex`   | `RegExp`   | `undefined` | A regular expression to match against the `src` attribute of `<iframe>` and `<embed>` elements to keep in the content (e.g., `/\/\/(www\.)?(youtube                                                           | vimeo)\.com/i`). Most video elements are removed by default. |
| `linkDensityModifier` | `number`   | `0`         | Adjusts the penalty for link density. Values closer to `1` increase the penalty, making elements with many links (like navigation) less likely to be chosen. `0` behaves similarly to default Readability.js. |

## License

[MIT](LICENSE)
