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
  private shadowRoots = new WeakSet<ShadowRoot>();
  private shadowObservers: MutationObserver[] = [];

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
              this.discoverAndHandleShadowRoots(node as Element);
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

    // Handle any existing open shadow roots on the page at startup
    this.discoverAndHandleShadowRoots(document.body);
  }

  private processInitialPage() {
    if (!this.enabled || !this.config) return;
    this.processElement(document.body);
    // Also process any discovered shadow roots initially
    this.discoverAndHandleShadowRoots(document.body);
  }

  private reprocessPage() {
    this.removeAllBlurs();
    this.processedNodes = new WeakSet<Node>();
    this.processInitialPage();
  }

  private removeAllBlurs() {
    const removeInRoot = (root: ParentNode & DocumentOrShadowRoot) => {
      // Remove blurred class from elements and inline blur styling if applied by us
      root.querySelectorAll('.blurred').forEach((el) => {
        const element = el as HTMLElement;
        element.classList.remove('blurred');
        if (element.hasAttribute('data-obscuro-inline')) {
          element.style.removeProperty('filter');
          element.removeAttribute('data-obscuro-inline');
        }
      });

      // Remove censored spans
      root.querySelectorAll('[data-censor="1"]').forEach((span) => {
        const parent = span.parentNode;
        if (parent) {
          const textContent = span.textContent || '';
          parent.replaceChild(document.createTextNode(textContent), span);
          (parent as ParentNode).normalize();
        }
      });
    };

    removeInRoot(document);

    // Ensure we are aware of all current shadow roots before cleanup within them
    this.discoverAndHandleShadowRoots(document.body);

    // Clean within known shadow roots
    this.forEachShadowRoot((sr) => removeInRoot(sr));
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
        this.applyBlurStyling(element);
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
            this.applyBlurStyling(el);
          }
        });
      } catch (error) {
        console.error('[Obscuro] Invalid selector:', selector, error);
      }
    }

    // Process input/textarea elements for regex matching on their values
    this.processInputElements(element);

    // If this element hosts a shadow root, handle it
    if ((element as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot) {
      this.observeAndProcessShadowRoot((element as Element & { shadowRoot: ShadowRoot }).shadowRoot);
    }

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
    if (!this.config) return;
    
    const parent = textNode.parentElement;
    if (!parent || parent.hasAttribute('data-censor')) return;

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
            this.applyBlurStyling(span);
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
        this.applyBlurStyling(input);
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

  // Apply inline blur styling to work within shadow DOM boundaries too
  private applyBlurStyling(element: Element) {
    element.classList.add('blurred');
    try {
      element.setAttribute('data-obscuro-inline', '1');
      (element as HTMLElement).style.setProperty('filter', 'blur(6px)', 'important');
    } catch {
      // no-op
    }
  }

  // Discover and handle open shadow roots under a given root
  private discoverAndHandleShadowRoots(root: Element | Document) {
    const scope = root instanceof Document ? (root.body as Element | null) : (root as Element);
    if (!scope) return;
    const all = scope.querySelectorAll('*');
    (all as NodeListOf<Element>).forEach((el) => {
      const sr = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
      if (sr) {
        this.observeAndProcessShadowRoot(sr);
      }
    });
  }

  private observeAndProcessShadowRoot(sr: ShadowRoot) {
    if (this.shadowRoots.has(sr)) return;
    this.shadowRoots.add(sr);
    this.injectStylesIntoShadowRoot(sr);

    // Observe mutations inside the shadow root
    const shadowObserver = new MutationObserver((mutations) => {
      if (!this.enabled) return;
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Process within the shadow root context
              this.processShadowRoot(sr);
              // And discover nested shadow roots
              this.discoverAndHandleShadowRoots(node as Element);
            } else if (node.nodeType === Node.TEXT_NODE) {
              this.processTextNode(node as Text);
            }
          });
        } else if (mutation.type === 'characterData') {
          this.processTextNode(mutation.target as Text);
        }
      }
    });

    shadowObserver.observe(sr, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    this.shadowObservers.push(shadowObserver);

    // Initial processing inside the shadow root
    this.processShadowRoot(sr);
  }

  private processShadowRoot(sr: ShadowRoot) {
    if (!this.config) return;

    // Process elements by selectors
    for (const selector of this.config.selectors) {
      try {
        const matchingElements = sr.querySelectorAll(selector);
        matchingElements.forEach((el) => {
          if (!this.processedNodes.has(el) && !this.shouldIgnoreElement(el)) {
            const elText = el.textContent || '';
            if (this.shouldIgnoreText(elText)) {
              return;
            }
            this.processedNodes.add(el);
            this.applyBlurStyling(el);
          }
        });
      } catch (error) {
        console.error('[Obscuro] Invalid selector in shadow root:', selector, error);
      }
    }

    // Process inputs
    const container = sr as unknown as Element;
    this.processInputElements(container);

    // Process text nodes
    const walker = sr.ownerDocument.createTreeWalker(
      sr,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
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

  private injectStylesIntoShadowRoot(sr: ShadowRoot) {
    // Avoid duplicate injections
    if (sr.querySelector('style[data-obscuro-style="1"]')) return;
    const style = document.createElement('style');
    style.setAttribute('data-obscuro-style', '1');
    style.textContent = `
      .blurred { filter: blur(6px) !important; }
      [data-censor="1"] { filter: blur(6px) !important; }
    `;
    sr.appendChild(style);
  }

  private forEachShadowRoot(cb: (sr: ShadowRoot) => void) {
    // WeakSet is not iterable; rely on discovery to call cb
    this.discoverAndHandleShadowRoots(document.body);
    // After discovery, we can try common portals (still call discovery).
    // We cannot iterate WeakSet; discovery ensures observeAndProcessShadowRoot is called then cb via next call below.
    // So we traverse again and run cb on each found shadow root.
    const invokeCb = (root: Element | Document) => {
      const scope = root instanceof Document ? (root.body as Element | null) : (root as Element);
      if (!scope) return;
      const all = scope.querySelectorAll('*');
      (all as NodeListOf<Element>).forEach((el) => {
        const sr = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot;
        if (sr) cb(sr);
      });
    };
    invokeCb(document);
  }
}

// Initialize the content script
new ObscuroContentScript();
