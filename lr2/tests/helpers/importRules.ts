import * as path from 'node:path';

export type Layer = 'domain' | 'application' | 'infrastructure' | 'presentation' | 'composition';

/** Які шари дозволено імпортувати кожному шару. */
export const ALLOWED: Record<Layer, Layer[]> = {
  domain: ['domain'],
  application: ['application', 'domain'],
  infrastructure: ['infrastructure', 'domain'],
  presentation: ['presentation', 'application'],
  composition: ['domain', 'application', 'infrastructure', 'presentation', 'composition'],
};

/** Шари, яким заборонено підключати зовнішні пакети (лише власний код). */
const NO_EXTERNAL_PACKAGES: Layer[] = ['domain', 'application'];

export function layerOf(filePath: string, srcRoot: string): Layer | null {
  const [first] = path.relative(srcRoot, filePath).split(path.sep);
  if (['domain', 'application', 'infrastructure', 'presentation'].includes(first)) {
    return first as Layer;
  }
  if (first === 'config' || first === 'main.ts') return 'composition';
  return null;
}

/** Знаходить усі специфікатори імпорту: import/export from, import 'x', require('x'), import('x'). */
export function extractImports(source: string): string[] {
  const patterns = [
    /\b(?:import|export)\s[^'";]*?\sfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  const found: string[] = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

/** Повертає список порушень правил залежностей для одного файлу. */
export function findViolations(filePath: string, source: string, srcRoot: string): string[] {
  const layer = layerOf(filePath, srcRoot);
  if (!layer) return [];
  const violations: string[] = [];

  for (const spec of extractImports(source)) {
    const isRelative = spec.startsWith('.');
    if (!isRelative) {
      if (NO_EXTERNAL_PACKAGES.includes(layer)) {
        violations.push(`${layer}: заборонений зовнішній імпорт «${spec}»`);
      }
      continue;
    }
    const target = layerOf(path.resolve(path.dirname(filePath), spec), srcRoot);
    if (target && !ALLOWED[layer].includes(target)) {
      violations.push(`${layer} → ${target}: «${spec}»`);
    }
  }
  return violations;
}
