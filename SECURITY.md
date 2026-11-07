# Security Policy

## Known Vulnerabilities

This project currently has some known vulnerabilities in its dependencies:

### Electron (v39.2.6)
Multiple high-severity vulnerabilities have been identified in the current version of Electron. These include:
- Inherited HTML sandbox restrictions issues for popups
- CORS-related issues with file and HTTP protocol handlers
- Node.js integration issues in Web Workers
- Permission check attribution issues

**Status**: Pending upgrade to Electron v45.2.3 (breaking change)

### extract-zip
Dependent on Electron version - will be resolved with Electron upgrade.

### minimatch (v7.0.0 - v11.0.0)
Moderate severity vulnerability related to potential denial of service via globparts amplification.

**Status**: Pending upgrade

## Updating Dependencies

To fix all vulnerabilities including breaking changes:

```bash
npm audit fix --force
```

⚠️ **Warning**: This will upgrade Electron from v39 to v45, which is a major version change and may require code modifications.

## Reporting a Vulnerability

If you discover a security vulnerability, please email the maintainer directly. We take all security issues seriously and will respond within 48 hours.

## Best Practices

1. Always use the latest stable versions of dependencies
2. Run `npm audit` regularly to check for vulnerabilities
3. Review and test thoroughly after upgrading major versions
