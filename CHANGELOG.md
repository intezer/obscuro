# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Chrome Web Store publication
- Firefox extension support
- Advanced blur customization (intensity, style)
- Keyboard shortcuts
- Per-site configurations
- Export/import multiple configs

## [1.0.0] - 2024-10-26

### Added
- Initial release
- CSS selector-based element blurring
- Regex pattern matching for text content
- Ignore rules for selectors and regex
- MutationObserver for dynamic content support
- Popup UI for configuration management
- Import/Export configuration functionality
- Enable/Disable toggle
- TypeScript implementation
- ESLint and Prettier configuration
- Example configurations for SaaS/CRM, Healthcare, and Financial use cases
- Comprehensive documentation
- MIT License
- Security policy
- Privacy-first design (no data collection)

### Features
- **Content Script**: Intelligent blurring with MutationObserver
- **Popup Interface**: User-friendly configuration editor
- **Default Config**: Pre-configured email regex pattern
- **Idempotency**: Prevents re-wrapping of already censored content
- **Performance**: Efficient DOM traversal and text processing
- **Customizable**: Full control over blur targets via JSON config

### Technical Details
- Manifest V3 compliance
- TypeScript 5.4
- Chrome Extension APIs
- WeakSet for processed node tracking
- Regex compilation and caching
- Fragment-based text replacement

---

## Version History

### Version Numbering
- **Major** (1.x.x): Breaking changes or major feature additions
- **Minor** (x.1.x): New features, backwards compatible
- **Patch** (x.x.1): Bug fixes and minor improvements

### Support
- Each major version is supported for 1 year after release
- Security patches are backported to supported versions
- Latest version always recommended

---

## How to Update

### From Chrome Web Store
Updates are automatic! Chrome will update the extension in the background.

### Manual Installation
1. Pull the latest changes: `git pull origin main`
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Reload the extension in `chrome://extensions/`

---

## Migration Guides

### Migrating to 1.0.0
This is the initial release. No migration needed!

---

## Deprecation Notices

*No deprecations at this time.*

---

## Links

- [GitHub Repository](https://github.com/yourusername/obscuro)
- [Issue Tracker](https://github.com/yourusername/obscuro/issues)
- [Documentation](https://github.com/yourusername/obscuro/wiki)
- [Chrome Web Store](https://chrome.google.com/webstore) (coming soon)

---

**Note**: For security vulnerabilities, please see our [Security Policy](SECURITY.md) instead of creating a public issue.
