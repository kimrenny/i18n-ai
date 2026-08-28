# Localization AI

A desktop application built with Electron, React, TypeScript, and Vite for analyzing, comparing, and managing JSON localization files.

## Features

- **Folder Selection & JSON Discovery**: Native Electron directory picker to discover and load localization files.
- **Key Comparison Engine**: Multi-file comparison using a union-of-keys model without enforcing a canonical master language.
- **Hierarchical Diff Viewer**: VS Code-style tree representation of nested localization structures.
- **Missing & Empty Translation Tracking**:
  - `[ MISSING ]`: Highlights keys physically absent from a localization file.
  - `[ EMPTY ]`: Highlights untranslated keys present with value `""`.
- **Dedicated Problem Navigation**: Cycle through missing or empty translations with automatic ancestor expansion and smooth scrolling.
- **Add Missing Keys**: Generate preview and safely insert missing keys as empty strings with structural conflict protection.
- **Inline Manual Translation Editing**: Edit untranslated string values in-place and save directly to disk with atomic writes.

## Development

### Prerequisites

- Node.js 20+ or 22+ (LTS recommended)
- npm

### Installation

```bash
npm install
# or for a clean install matching package-lock.json:
npm ci
```

### Scripts

- `npm run dev`: Launch Vite dev server and the Electron application.
- `npm run test`: Run the Vitest unit/integration test suite.
- `npm run typecheck`: Run TypeScript static type checking without emitting files.
- `npm run lint`: Run ESLint across the codebase.
- `npm run build`: Build production bundles for React renderer and Electron main/preload processes.

## Continuous Integration (CI)

This repository uses GitHub Actions (`.github/workflows/ci.yml`) to enforce code quality on every contribution:

- **Triggers**: Runs automatically on all pull requests targeting `main` and on pushes to `main`.
- **Checks Executed**:
  1. `npm ci` (clean dependency installation)
  2. `npm run test` (automated Vitest test suite)
  3. `npm run typecheck` (TypeScript validation)
  4. `npm run lint` (ESLint analysis)
  5. `npm run build` (production build verification)
- **Pull Request Quality Gate**: Pull requests should only be merged once all CI checks have passed successfully.
