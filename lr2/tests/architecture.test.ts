import * as fs from 'node:fs';
import * as path from 'node:path';
import { findViolations } from './helpers/importRules';

const SRC = path.resolve(__dirname, '../src');

function tsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('Напрямок залежностей між шарами (код проєкту)', () => {
  test('жоден файл у src/ не порушує дозволені залежності між шарами', () => {
    const violations = tsFiles(SRC).flatMap((file) =>
      findViolations(file, fs.readFileSync(file, 'utf8'), SRC).map(
        (v) => `${path.relative(SRC, file)}: ${v}`,
      ),
    );
    expect(violations).toEqual([]);
  });
});

describe('Детектор порушень (перевірка самого тесту)', () => {
  const domainFile = path.join(SRC, 'domain/entities/Example.ts');

  test('ловить імпорт інфраструктури з домену', () => {
    const src = "import { X } from '../../infrastructure/repositories/InMemoryRepository';";
    expect(findViolations(domainFile, src, SRC)).not.toEqual([]);
  });

  test('ловить імпорт application і presentation з домену', () => {
    expect(findViolations(domainFile, "import { A } from '../../application/dto/OrderDto';", SRC)).not.toEqual([]);
    expect(findViolations(domainFile, "import { P } from '../../presentation/cli';", SRC)).not.toEqual([]);
  });

  test('ловить зовнішні пакети в домені (ORM, фреймворк)', () => {
    expect(findViolations(domainFile, "import { Entity } from 'typeorm';", SRC)).not.toEqual([]);
    expect(findViolations(domainFile, "import { Injectable } from '@nestjs/common';", SRC)).not.toEqual([]);
    expect(findViolations(domainFile, "import { PrismaClient } from '@prisma/client';", SRC)).not.toEqual([]);
  });

  test('ловить require, динамічний import та імпорт без from', () => {
    expect(findViolations(domainFile, "const x = require('../../infrastructure/a');", SRC)).not.toEqual([]);
    expect(findViolations(domainFile, "const x = await import('../../infrastructure/a');", SRC)).not.toEqual([]);
    expect(findViolations(domainFile, "import '../../infrastructure/a';", SRC)).not.toEqual([]);
  });

  test('ловить багаторядковий імпорт', () => {
    const src = "import {\n  A,\n  B,\n} from '../../infrastructure/x';";
    expect(findViolations(domainFile, src, SRC)).not.toEqual([]);
  });

  test('application не може імпортувати infrastructure, presentation — domain', () => {
    const app = path.join(SRC, 'application/use-cases/Example.ts');
    const pres = path.join(SRC, 'presentation/Example.ts');
    expect(findViolations(app, "import { R } from '../../infrastructure/repositories/InMemoryRepository';", SRC)).not.toEqual([]);
    expect(findViolations(pres, "import { Order } from '../domain/entities/Order';", SRC)).not.toEqual([]);
  });

  test('допускає коректні залежності', () => {
    const app = path.join(SRC, 'application/use-cases/Example.ts');
    expect(findViolations(app, "import { Order } from '../../domain/entities/Order';", SRC)).toEqual([]);
    expect(findViolations(domainFile, "import { Courier } from './Courier';", SRC)).toEqual([]);
  });
});
