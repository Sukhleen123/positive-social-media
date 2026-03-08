# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**positive-social-media** is a Reddit-style Angular application that filters out non-positive topics based on user selection. Users can toggle visibility of filtered/hidden content from the UI.

## Project Status

This project is in early scaffolding — only a README and .gitignore exist. The Angular project has not yet been initialized. Before development, bootstrap the project:

```bash
npm install -g @angular/cli
ng new positive-social-media --routing --style=css
```

## Commands (once initialized)

```bash
ng serve              # Dev server at http://localhost:4200
ng build              # Production build (output: dist/)
ng build --watch      # Build with watch mode
ng test               # Run unit tests via Karma
ng test --include='**/foo.spec.ts'  # Run a single test file
ng lint               # Lint the project
ng generate component <name>  # Generate a new component
ng generate service <name>    # Generate a new service
```

## Intended Architecture

The app is a content-filtering Reddit-style feed. Key architectural areas to build:

- **Feed component**: Displays posts (Reddit-style list)
- **Content filter service**: Evaluates post text for positive/negative sentiment based on user-selected topic filters
- **Filter settings UI**: Allows users to select which topics to filter
- **Post component**: Renders individual posts with toggle to show/hide filtered content

The core UX pattern: filtered posts are hidden by default, but users can reveal the hidden text per-post or globally.
