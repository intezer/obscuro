export interface RegexPattern {
  pattern: string;
  flags?: string;
}

export interface Config {
  version: string;
  selectors: string[];
  regex: RegexPattern[];
  ignore?: {
    selectors?: string[];
    regex?: RegexPattern[];
  };
}

export interface StorageData {
  enabled: boolean;
  config: Config;
}
