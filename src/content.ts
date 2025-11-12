// Inline types for Chrome content script compatibility
interface RegexPattern {
  pattern: string;
  flags?: string;
}

interface Config {
  version: string;
  selectors: string[];
  regex: RegexPattern[];
  ignore?: {
    selectors?: string[];
    regex?: RegexPattern[];
  };
}

class ObscuroContentScript {
  private config: Config | null = null;
  private enabled = true;
  private observer: MutationObserver | null = null;
  private processedNodes = new WeakSet<Node>();
  private compiledRegex: RegExp[] = [];
  private compiledIgnoreRegex: RegExp[] = [];

  constructor() {
    this.init();
  }

  private async init() {
    await this.loadConfig();
    this.compileRegexPatterns();
    this.startObserving();
    this.processInitialPage();

    // Listen for config updates
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.config) {
        this.config = changes.config.newValue;
        this.compileRegexPatterns();
        this.reprocessPage();
      }
      if (changes.enabled !== undefined) {
        this.enabled = changes.enabled.newValue;
        if (this.enabled) {
          this.reprocessPage();
        } else {
          this.removeAllBlurs();
        }
      }
    });
  }

  private async loadConfig() {
    try {
      const result = await chrome.storage.sync.get(['config', 'enabled']);
      
      if (result.config) {
        this.config = result.config;
      } else {
        // Load default config
        const response = await fetch(chrome.runtime.getURL('config.json'));
        this.config = await response.json();
        // Save default config
        await chrome.storage.sync.set({ config: this.config });
      }

      this.enabled = result.enabled !== undefined ? result.enabled : true;
    } catch (error) {
      console.error('[Obscuro] Failed to load config:', error);
    }
  }

  private compileRegexPatterns() {
    if (!this.config) return;

    // Compile main regex patterns
    this.compiledRegex = this.config.regex.map((r) => {
      try {
        return new RegExp(r.pattern, r.flags || 'g');
      } catch (error) {
        console.error('[Obscuro] Invalid regex pattern:', r.pattern, error);
        return null;
      }
    }).filter((r): r is RegExp => r !== null);

    // Compile ignore regex patterns
    this.compiledIgnoreRegex = (this.config.ignore?.regex || []).map((r) => {
      try {
        return new RegExp(r.pattern, r.flags || 'g');
      } catch (error) {
        console.error('[Obscuro] Invalid ignore regex pattern:', r.pattern, error);
        return null;
      }
    }).filter((r): r is RegExp => r !== null);
  }

  private startObserving() {
    this.observer = new MutationObserver((mutations) => {
      if (!this.enabled) return;

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.processElement(node as Element);
            } else if (node.nodeType === Node.TEXT_NODE) {
              this.processTextNode(node as Text);
            }
          });
        } else if (mutation.type === 'characterData') {
          this.processTextNode(mutation.target as Text);
        }
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  private processInitialPage() {
    if (!this.enabled || !this.config) return;
    this.processElement(document.body);
  }

  private reprocessPage() {
    this.removeAllBlurs();
    this.processedNodes = new WeakSet<Node>();
    this.processInitialPage();
  }

  private removeAllBlurs() {
    // Remove blurred class from elements
    document.querySelectorAll('.blurred').forEach((el) => {
      el.classList.remove('blurred');
    });

    // Remove censored spans
    document.querySelectorAll('[data-censor="1"]').forEach((span) => {
      const parent = span.parentNode;
      if (parent) {
        const textContent = span.textContent || '';
        parent.replaceChild(document.createTextNode(textContent), span);
        parent.normalize();
      }
    });
  }

  private processElement(element: Element) {
    if (!this.config || this.processedNodes.has(element)) return;
    this.processedNodes.add(element);

    // Check if element should be ignored
    if (this.shouldIgnoreElement(element)) return;

    // Check if element matches any selector
    if (this.matchesSelectors(element)) {
      const elementText = element.textContent || '';
      if (!this.shouldIgnoreText(elementText)) {
        element.classList.add('blurred');
      }
    }

    // Process all child elements that match selectors
    for (const selector of this.config.selectors) {
      try {
        const matchingElements = element.querySelectorAll(selector);
        matchingElements.forEach((el) => {
          if (!this.processedNodes.has(el) && !this.shouldIgnoreElement(el)) {
            const elText = el.textContent || '';
            if (this.shouldIgnoreText(elText)) {
              return;
            }
            this.processedNodes.add(el);
            el.classList.add('blurred');
          }
        });
      } catch (error) {
        console.error('[Obscuro] Invalid selector:', selector, error);
      }
    }

    // Process input/textarea elements for regex matching on their values
    this.processInputElements(element);

    // Process text nodes for regex matching
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip if parent is already blurred or is a script/style tag
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          const tagName = parent.tagName.toLowerCase();
          if (tagName === 'script' || tagName === 'style' || tagName === 'noscript') {
            return NodeFilter.FILTER_REJECT;
          }

          if (parent.classList.contains('blurred') || parent.hasAttribute('data-censor')) {
            return NodeFilter.FILTER_REJECT;
          }

          if (this.shouldIgnoreElement(parent)) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }

    textNodes.forEach((textNode) => this.processTextNode(textNode));
  }

  private shouldIgnoreElement(element: Element): boolean {
    if (!this.config?.ignore?.selectors) return false;

    for (const selector of this.config.ignore.selectors) {
      try {
        if (element.matches(selector)) return true;
        // Check if element is within an ignored parent
        if (element.closest(selector)) return true;
      } catch (error) {
        console.error('[Obscuro] Invalid ignore selector:', selector, error);
      }
    }

    return false;
  }

  private matchesSelectors(element: Element): boolean {
    if (!this.config) return false;

    for (const selector of this.config.selectors) {
      try {
        if (element.matches(selector)) return true;
      } catch (error) {
        console.error('[Obscuro] Invalid selector:', selector, error);
      }
    }

    return false;
  }

  private processTextNode(textNode: Text) {
    if (!this.config || this.processedNodes.has(textNode)) return;
    
    const parent = textNode.parentElement;
    if (!parent || parent.hasAttribute('data-censor')) return;

    this.processedNodes.add(textNode);

    const text = textNode.textContent || '';
    if (!text.trim()) return;

    // Check if text should be ignored
    if (this.shouldIgnoreText(text)) return;

    const fragments = this.createCensoredFragments(text);
    
    if (fragments.length > 1 || (fragments.length === 1 && fragments[0].censored)) {
      const parentNode = textNode.parentNode;
      if (parentNode) {
        const docFragment = document.createDocumentFragment();
        
        fragments.forEach((fragment) => {
          if (fragment.censored) {
            const span = document.createElement('span');
            span.className = 'blurred';
            span.setAttribute('data-censor', '1');
            span.textContent = fragment.text;
            docFragment.appendChild(span);
          } else {
            docFragment.appendChild(document.createTextNode(fragment.text));
          }
        });

        parentNode.replaceChild(docFragment, textNode);
      }
    }
  }

  private processInputElements(element: Element) {
    if (!this.config) return;

    // Find all input and textarea elements
    const inputs = element.querySelectorAll('input, textarea');
    
    inputs.forEach((input) => {
      if (this.processedNodes.has(input) || this.shouldIgnoreElement(input)) return;
      if (input.classList.contains('blurred')) return;

      const inputElement = input as HTMLInputElement | HTMLTextAreaElement;
      const value = inputElement.value;

      if (!value || !value.trim()) return;

      // Check if the value should be ignored
      if (this.shouldIgnoreText(value)) return;

      // Check if value matches any regex pattern
      let hasMatch = false;
      for (const regex of this.compiledRegex) {
        regex.lastIndex = 0;
        if (regex.test(value)) {
          hasMatch = true;
          break;
        }
      }

      if (hasMatch) {
        this.processedNodes.add(input);
        input.classList.add('blurred');
      }
    });
  }

  private shouldIgnoreText(text: string): boolean {
    for (const regex of this.compiledIgnoreRegex) {
      regex.lastIndex = 0;
      if (regex.test(text)) return true;
    }
    return false;
  }

  private createCensoredFragments(text: string): Array<{ text: string; censored: boolean }> {
    const matches: Array<{ start: number; end: number }> = [];

    // Find all regex matches
    for (const regex of this.compiledRegex) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({ start: match.index, end: match.index + match[0].length });
        // Prevent infinite loop for zero-width matches
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    }

    if (matches.length === 0) {
      return [{ text, censored: false }];
    }

    // Sort and merge overlapping matches
    matches.sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];
    
    for (const match of matches) {
      if (merged.length === 0 || merged[merged.length - 1].end < match.start) {
        merged.push(match);
      } else {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, match.end);
      }
    }

    // Create fragments
    const fragments: Array<{ text: string; censored: boolean }> = [];
    let lastIndex = 0;

    for (const match of merged) {
      if (lastIndex < match.start) {
        fragments.push({ text: text.substring(lastIndex, match.start), censored: false });
      }
      fragments.push({ text: text.substring(match.start, match.end), censored: true });
      lastIndex = match.end;
    }

    if (lastIndex < text.length) {
      fragments.push({ text: text.substring(lastIndex), censored: false });
    }

    return fragments;
  }
}

// Initialize the content script
new ObscuroContentScript();
