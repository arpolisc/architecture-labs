import * as path from 'node:path';

export type Layer = 'domain' | 'application' | 'infrastructure' | 'presentation' | 'composition';

export type Location =
  | { kind: 'service'; service: string; layer: Layer }
  | { kind: 'shared' }
  | { kind: 'other' };

/** Які шари того самого сервісу дозволено імпортувати кожному шару. */
const ALLOWED_LAYERS: Record<Layer, Layer[]> = {
  domain: ['domain'],
  application: ['application', 'domain'],
  infrastructure: ['infrastructure', 'application', 'domain'],
  presentation: ['presentation', 'application'],
  composition: ['composition', 'presentation', 'infrastructure', 'application', 'domain'],
};

/** Шари, у яких дозволено підключати спільну технічну бібліотеку shared/. */
const MAY_USE_SHARED: Layer[] = ['infrastructure', 'presentation', 'composition'];

/** Шари, у яких заборонено будь-які зовнішні пакети. */
const NO_EXTERNAL_PACKAGES: Layer[] = ['domain', 'application'];

/** Єдиний дозволений виняток: шар подання імпортує лише класи помилок домену, щоб відобразити їх у HTTP-відповідь. */
const PRESENTATION_MAY_IMPORT_DOMAIN_ERRORS = /[\\/]domain[\\/]errors$/;

export function locate(filePath: string, root: string): Location {
  const parts = path.relative(root, filePath).split(path.sep);
  if (parts[0] === 'shared') return { kind: 'shared' };
  if (parts[0] === 'services' && parts.length >= 3) {
    const service = parts[1];
    const first = parts[2];
    if (['domain', 'application', 'infrastructure', 'presentation'].includes(first)) {
      return { kind: 'service', service, layer: first as Layer };
    }
    if (first === 'config' || first === 'main.ts') return { kind: 'service', service, layer: 'composition' };
  }
  return { kind: 'other' };
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
export function findViolations(filePath: string, source: string, root: string): string[] {
  const from = locate(filePath, root);
  if (from.kind === 'other') return [];
  const violations: string[] = [];

  for (const spec of extractImports(source)) {
    if (!spec.startsWith('.')) {
      if (from.kind === 'service' && NO_EXTERNAL_PACKAGES.includes(from.layer)) {
        violations.push(`${from.layer}: заборонений зовнішній імпорт «${spec}»`);
      }
      continue;
    }
    const resolved = path.resolve(path.dirname(filePath), spec);
    const to = locate(resolved, root);

    if (from.kind === 'shared') {
      if (to.kind === 'service') violations.push(`shared → ${to.service}/${to.layer}: «${spec}» (спільна бібліотека не знає про сервіси)`);
      continue;
    }
    if (to.kind === 'shared') {
      if (!MAY_USE_SHARED.includes(from.layer)) violations.push(`${from.service}/${from.layer} → shared: «${spec}»`);
      continue;
    }
    if (to.kind !== 'service') continue;
    if (to.service !== from.service) {
      violations.push(`сервіс ${from.service} → сервіс ${to.service}: «${spec}» (прямий доступ до чужого коду й даних заборонено)`);
      continue;
    }
    if (ALLOWED_LAYERS[from.layer].includes(to.layer)) continue;
    if (from.layer === 'presentation' && to.layer === 'domain' && PRESENTATION_MAY_IMPORT_DOMAIN_ERRORS.test(resolved)) continue;
    violations.push(`${from.service}: ${from.layer} → ${to.layer}: «${spec}»`);
  }
  return violations;
}
