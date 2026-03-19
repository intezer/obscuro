// Obscuro - Local Deterministic Scramble Engine
// Replaces sensitive data with realistic-looking fake values using seeded PRNG.
// No external APIs — everything runs locally.

class Scrambler {
  private replacementCache = new Map<string, string>();

  // Seeded PRNG based on string hash (Mulberry32)
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit int
    }
    return Math.abs(hash);
  }

  private seededRandom(seed: number): () => number {
    let state = seed | 0;
    if (state === 0) state = 1;
    return () => {
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private pickRandom<T>(arr: T[], rng: () => number): T {
    return arr[Math.floor(rng() * arr.length)];
  }

  // --- Data pools for realistic replacements ---

  private static readonly FIRST_NAMES = [
    'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
    'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
    'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Lisa', 'Daniel', 'Nancy',
    'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
    'Steven', 'Kimberly', 'Paul', 'Emily', 'Andrew', 'Donna', 'Joshua', 'Michelle',
    'Kenneth', 'Carol', 'Kevin', 'Amanda', 'Brian', 'Dorothy', 'George', 'Melissa',
    'Timothy', 'Deborah',
  ];

  private static readonly LAST_NAMES = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
    'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
    'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
    'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
    'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
    'Carter', 'Roberts',
  ];

  private static readonly DOMAINS = [
    'example.com', 'testmail.org', 'sampledomain.net', 'fakemail.io', 'mockdata.com',
    'placeholder.org', 'demosite.net', 'testorg.com', 'acmecorp.net', 'globex.io',
    'initech.com', 'umbrella.org', 'waynetech.net', 'starkindustries.io', 'cyberdyne.com',
    'oscorp.org', 'lexcorp.net', 'aperture.io', 'soylent.com', 'tyrell.org',
  ];

  private static readonly ORG_NAMES = [
    'Apex Solutions', 'Meridian Group', 'Vertex Industries', 'Cascade Systems',
    'Pinnacle Corp', 'Horizon Partners', 'Quantum Dynamics', 'Atlas Enterprises',
    'Nexus Technologies', 'Prism Analytics', 'Vanguard Holdings', 'Eclipse Networks',
    'Summit Digital', 'Zenith Consulting', 'Stratos Global', 'Forge Innovations',
    'Beacon Services', 'Cipher Security', 'Polaris Ventures', 'Titan Resources',
  ];

  // --- Type detection regex ---

  private static readonly EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
  private static readonly IPV4_REGEX = /^(?:(?:25[0-5]|2[0-4]\d|1?\d{1,2})\.){3}(?:25[0-5]|2[0-4]\d|1?\d{1,2})$/;
  private static readonly IPV6_REGEX = /^(?:[A-Fa-f0-9]{1,4}:){2,7}[A-Fa-f0-9]{1,4}$|^::(?:[A-Fa-f0-9]{1,4}:){0,5}[A-Fa-f0-9]{1,4}$|^(?:[A-Fa-f0-9]{1,4}:){1,6}:$/;
  private static readonly UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /**
   * Main entry point: returns a scrambled replacement for the given original text.
   * Results are cached so the same input always returns the same output.
   */
  scramble(original: string): string {
    const cached = this.replacementCache.get(original);
    if (cached !== undefined) return cached;

    const result = this.generateReplacement(original);
    this.replacementCache.set(original, result);
    return result;
  }

  /**
   * Scramble all sensitive fragments in a text string, preserving non-sensitive parts.
   * Takes an array of {text, censored} fragments and returns the full string with
   * censored fragments replaced.
   */
  scrambleFragments(fragments: Array<{ text: string; censored: boolean }>): Array<{ text: string; censored: boolean; scrambled?: string }> {
    return fragments.map((f) => {
      if (!f.censored) return f;
      return { ...f, scrambled: this.scramble(f.text) };
    });
  }

  clearCache() {
    this.replacementCache.clear();
  }

  private generateReplacement(original: string): string {
    const trimmed = original.trim();
    const seed = this.hashString(trimmed);
    const rng = this.seededRandom(seed);

    if (Scrambler.EMAIL_REGEX.test(trimmed)) {
      return this.scrambleEmail(trimmed, rng);
    }
    if (Scrambler.IPV4_REGEX.test(trimmed)) {
      return this.scrambleIPv4(rng);
    }
    if (Scrambler.IPV6_REGEX.test(trimmed)) {
      return this.scrambleIPv6(trimmed, rng);
    }
    if (Scrambler.UUID_REGEX.test(trimmed)) {
      return this.scrambleUUID(rng);
    }

    return this.scrambleGenericText(original, rng);
  }

  private scrambleEmail(_original: string, rng: () => number): string {
    const first = this.pickRandom(Scrambler.FIRST_NAMES, rng).toLowerCase();
    const last = this.pickRandom(Scrambler.LAST_NAMES, rng).toLowerCase();
    const domain = this.pickRandom(Scrambler.DOMAINS, rng);
    const separators = ['.', '_', ''];
    const sep = this.pickRandom(separators, rng);
    return `${first}${sep}${last}@${domain}`;
  }

  private scrambleIPv4(rng: () => number): string {
    const octet = () => Math.floor(rng() * 223) + 1; // 1-223, avoid 0 and 224+
    return `${octet()}.${octet()}.${octet()}.${octet()}`;
  }

  private scrambleIPv6(original: string, rng: () => number): string {
    // Preserve the structure (number of groups, :: placement)
    const parts = original.split(':');
    return parts.map((part) => {
      if (part === '') return '';
      const len = part.length;
      let hex = '';
      for (let i = 0; i < len; i++) {
        hex += Math.floor(rng() * 16).toString(16);
      }
      return hex;
    }).join(':');
  }

  private scrambleUUID(rng: () => number): string {
    const hex = () => Math.floor(rng() * 16).toString(16);
    const group = (len: number) => {
      let s = '';
      for (let i = 0; i < len; i++) s += hex();
      return s;
    };
    return `${group(8)}-${group(4)}-${group(4)}-${group(4)}-${group(12)}`;
  }

  private scrambleGenericText(original: string, rng: () => number): string {
    // For generic text: substitute characters while preserving length, casing, and word structure
    const result: string[] = [];

    for (let i = 0; i < original.length; i++) {
      const ch = original[i];

      if (/[A-Z]/.test(ch)) {
        result.push(String.fromCharCode(65 + Math.floor(rng() * 26)));
      } else if (/[a-z]/.test(ch)) {
        result.push(String.fromCharCode(97 + Math.floor(rng() * 26)));
      } else if (/[0-9]/.test(ch)) {
        result.push(String.fromCharCode(48 + Math.floor(rng() * 10)));
      } else {
        // Preserve spaces, punctuation, and special characters
        result.push(ch);
      }
    }

    return result.join('');
  }
}

// Global instance for content script usage
const obscuroScrambler = new Scrambler();
