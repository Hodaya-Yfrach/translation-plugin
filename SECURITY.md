# Security Policy

## Known Vulnerabilities

This project currently has some known vulnerabilities in its dependencies:

### electron-builder and its dependencies (moderate)
`electron-builder` 26 pulls in versions of `app-builder-lib`, `dmg-builder`, `@electron/universal` and `minimatch` (v7.0.0 - v11.0.0) with moderate-severity advisories, including a potential denial of service via globparts amplification in `minimatch`.

These packages are build tools only. They are not shipped inside the installed application.

**Status**: Waiting for an upstream fix in electron-builder 26.x. `npm audit` only offers a downgrade to electron-builder 24, which is not planned.

## Resolved

### Electron
Upgraded from v39 to v45.2.3, which fixes the high-severity Electron advisories (popup sandbox inheritance, CORS handling for file and HTTP protocol handlers, Node.js integration in Web Workers, permission check attribution) and the `extract-zip` advisory.

Electron 44 made the `clipboard` API asynchronous and removed `clipboard.readImage()`, so the main process now reads clipboard images through `clipboard.read()`.

## Updating Dependencies

To apply non-breaking fixes:

```bash
npm audit fix
```

⚠️ **Warning**: Avoid `npm audit fix --force`. It would downgrade electron-builder to v24.

## Reporting a Vulnerability

If you discover a security vulnerability, please email the maintainer directly. We take all security issues seriously and will respond within 48 hours.

## Best Practices

1. Always use the latest stable versions of dependencies
2. Run `npm audit` regularly to check for vulnerabilities
3. Review and test thoroughly after upgrading major versions
