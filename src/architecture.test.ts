import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..');

function filesUnder(dir: string): string[] {
  const full = path.join(ROOT, dir);
  const out: string[] = [];
  for (const name of readdirSync(full)) {
    const next = path.join(full, name);
    if (statSync(next).isDirectory()) out.push(...filesUnder(path.join(dir, name)));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path.join(dir, name));
  }
  return out;
}

function source(file: string): string {
  return readFileSync(path.join(ROOT, file), 'utf8');
}

describe('architecture boundaries', () => {
  it('keeps computation and presentation free of React and DOM APIs', () => {
    const pureFiles = [
      ...filesUnder('src/core'),
      ...filesUnder('src/presentation'),
      ...filesUnder('src/scene'),
      ...filesUnder('src/runtime'),
    ].filter((file) => !file.endsWith('.test.ts'));
    for (const file of pureFiles) {
      const code = source(file);
      expect(code, `${file} must not import React`).not.toMatch(/from ['"]react/);
      expect(code, `${file} must not access browser globals`).not.toMatch(/(?<![\w./'"`])(window|document)\s*\./);
    }
    const formulaFiles = filesUnder('src/formula').filter((file) => !file.endsWith('.test.ts'));
    for (const file of formulaFiles) {
      const code = source(file);
      expect(code, `${file} must stay headless`).not.toMatch(/from ['"]react(?:-dom)?['"]/);
      expect(code, `${file} must not create DOM`).not.toMatch(/document\.createElement|window\./);
    }
  });

  it('keeps the debug function registry renderer-free', () => {
    const code = source('src/debug/registry.ts');
    expect(code).not.toMatch(/from ['"]react/);
    expect(code).not.toMatch(/from ['"].*components/);
    expect(code).not.toMatch(/from ['"].*renderers/);
  });

  it('keeps the Axiom shell out of engine execution and storage', () => {
    const app = source('src/AxiomApp.tsx');
    expect(app).not.toMatch(/buildStoryFromExpression|buildBlockStory|analyzeExpression\(|libraryFrom\(/);
    expect(app).not.toMatch(/localStorage|indexedDB|sessionStorage/);
    expect(app).toMatch(/WorkbenchStore/);
    expect(app).toMatch(/StageView/);
  });

  it('keeps runtime execution free of React and persistence', () => {
    const runtime = filesUnder('src/runtime')
      .filter((file) => !file.endsWith('.test.ts'))
      .map(source)
      .join('\n');
    expect(runtime).not.toMatch(/from ['"]react/);
    expect(runtime).not.toMatch(/localStorage|indexedDB/);
    expect(runtime).toMatch(/provenance/);
  });

  it('declares serializable scene and trace schema versions', () => {
    const sceneTypes = source('src/scene/types.ts');
    const protocol = source('src/core/protocol.ts');
    expect(sceneTypes).toMatch(/schemaVersion/);
    expect(protocol).toMatch(/schemaVersion: 1/);
    expect(protocol).toMatch(/TraceStep/);
  });
});
