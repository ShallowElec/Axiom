/**
 * Public entry point for the Matrix Atelier formula foundation.
 *
 * The formula layer is intentionally pure: no React, DOM, app state, stories,
 * or component imports. Everything here is safe to use from an editor core,
 * a test, or a server-side renderer.
 */

export * from './ast.js';
export * from './latex.js';
export * from './palette.js';
