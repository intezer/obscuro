// Inline types for Chrome extension compatibility
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

class ObscuroPopup {
  private enabled = true;
  private config: Config | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    await this.loadState();
    this.setupEventListeners();
    this.updateUI();
  }

  private async loadState() {
    const result = await chrome.storage.sync.get(['enabled', 'config']);
    this.enabled = result.enabled !== undefined ? result.enabled : true;
    this.config = result.config || null;
  }

  private setupEventListeners() {
    const toggleBtn = document.getElementById('toggleBtn') as HTMLButtonElement;
    const configTextarea = document.getElementById('configEditor') as HTMLTextAreaElement;
    const saveBtn = document.getElementById('saveConfig') as HTMLButtonElement;
    const resetBtn = document.getElementById('resetConfig') as HTMLButtonElement;
    const importInput = document.getElementById('importConfig') as HTMLInputElement;

    toggleBtn?.addEventListener('click', () => this.toggleEnabled());
    saveBtn?.addEventListener('click', () => this.saveConfig());
    resetBtn?.addEventListener('click', () => this.resetConfig());
    importInput?.addEventListener('change', (e) => this.importConfig(e));

    // Load config into textarea
    if (configTextarea && this.config) {
      configTextarea.value = JSON.stringify(this.config, null, 2);
    }
  }

  private async toggleEnabled() {
    this.enabled = !this.enabled;
    await chrome.storage.sync.set({ enabled: this.enabled });
    this.updateUI();
  }

  private async saveConfig() {
    const configTextarea = document.getElementById('configEditor') as HTMLTextAreaElement;
    const statusDiv = document.getElementById('status') as HTMLDivElement;

    try {
      const newConfig = JSON.parse(configTextarea.value);
      
      // Basic validation
      if (!newConfig.version || !Array.isArray(newConfig.selectors) || !Array.isArray(newConfig.regex)) {
        throw new Error('Invalid config structure');
      }

      await chrome.storage.sync.set({ config: newConfig });
      this.config = newConfig;
      
      statusDiv.textContent = 'Config saved successfully!';
      statusDiv.className = 'status success';
      setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.className = 'status';
      }, 3000);
    } catch (error) {
      statusDiv.textContent = `Error: ${(error as Error).message}`;
      statusDiv.className = 'status error';
    }
  }

  private async resetConfig() {
    try {
      const response = await fetch(chrome.runtime.getURL('config.json'));
      const defaultConfig = await response.json();
      
      await chrome.storage.sync.set({ config: defaultConfig });
      this.config = defaultConfig;
      
      const configTextarea = document.getElementById('configEditor') as HTMLTextAreaElement;
      if (configTextarea) {
        configTextarea.value = JSON.stringify(defaultConfig, null, 2);
      }

      const statusDiv = document.getElementById('status') as HTMLDivElement;
      statusDiv.textContent = 'Config reset to defaults!';
      statusDiv.className = 'status success';
      setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.className = 'status';
      }, 3000);
    } catch (error) {
      console.error('Failed to reset config:', error);
    }
  }

  private exportConfig() {
    if (!this.config) return;

    const dataStr = JSON.stringify(this.config, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'obscuro-config.json';
    link.click();
    
    URL.revokeObjectURL(url);
  }

  private importConfig(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const config = JSON.parse(e.target?.result as string);
        
        await chrome.storage.sync.set({ config });
        this.config = config;
        
        const configTextarea = document.getElementById('configEditor') as HTMLTextAreaElement;
        if (configTextarea) {
          configTextarea.value = JSON.stringify(config, null, 2);
        }

        const statusDiv = document.getElementById('status') as HTMLDivElement;
        statusDiv.textContent = 'Config imported successfully!';
        statusDiv.className = 'status success';
        setTimeout(() => {
          statusDiv.textContent = '';
          statusDiv.className = 'status';
        }, 3000);
      } catch (error) {
        const statusDiv = document.getElementById('status') as HTMLDivElement;
        statusDiv.textContent = `Import error: ${(error as Error).message}`;
        statusDiv.className = 'status error';
      }
    };
    
    reader.readAsText(file);
  }

  private updateUI() {
    const toggleBtn = document.getElementById('toggleBtn') as HTMLButtonElement;
    const statusIndicator = document.getElementById('statusIndicator') as HTMLSpanElement;

    if (toggleBtn) {
      toggleBtn.textContent = this.enabled ? 'Disable' : 'Enable';
      toggleBtn.className = this.enabled ? 'btn btn-danger' : 'btn btn-success';
    }

    if (statusIndicator) {
      statusIndicator.textContent = this.enabled ? 'Active' : 'Inactive';
      statusIndicator.className = this.enabled ? 'status-badge active' : 'status-badge inactive';
    }
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  new ObscuroPopup();
});
