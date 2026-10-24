import * as fs from 'node:fs';
import * as path from 'node:path';
import { findViolations } from './helpers/importRules';

const ROOT = path.resolve(__dirname, '..');

function tsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

const file = (rel: string) => path.join(ROOT, rel);
const check = (rel: string, source: string) => findViolations(file(rel), source, ROOT);

describe('Архітектурні обмеження (код проєкту)', () => {
  test('жоден файл services/ і shared/ не порушує правила залежностей', () => {
    const violations = [...tsFiles(file('services')), ...tsFiles(file('shared'))].flatMap((f) =>
      findViolations(f, fs.readFileSync(f, 'utf8'), ROOT).map((v) => `${path.relative(ROOT, f)}: ${v}`),
    );
    expect(violations).toEqual([]);
  });

  test('сервіси не імпортують код один одного (власні дані й незалежне розгортання)', () => {
    const services = ['orders', 'restaurants', 'delivery', 'gateway'];
    for (const svc of services) {
      for (const f of tsFiles(file(`services/${svc}`))) {
        const text = fs.readFileSync(f, 'utf8');
        for (const other of services.filter((s) => s !== svc)) {
          expect(text).not.toContain(`/services/${other}/`);
          expect(text).not.toMatch(new RegExp(`\\.\\./\\.\\./${other}/`));
        }
      }
    }
  });
});

describe('Детектор порушень (перевірка самого тесту)', () => {
  test('ловить domain → infrastructure, application, presentation, shared', () => {
    const f = 'services/orders/domain/entities/X.ts';
    expect(check(f, "import { A } from '../../infrastructure/OutboxEventPublisher';")).not.toEqual([]);
    expect(check(f, "import { A } from '../../application/dto/OrderDto';")).not.toEqual([]);
    expect(check(f, "import { A } from '../../presentation/http';")).not.toEqual([]);
    expect(check(f, "import { A } from '../../../../shared/http/client';")).not.toEqual([]);
  });

  test('ловить зовнішні пакети в domain і application', () => {
    expect(check('services/orders/domain/entities/X.ts', "import { PrismaClient } from '@prisma/client';")).not.toEqual([]);
    expect(check('services/orders/application/use-cases/X.ts', "import express from 'express';")).not.toEqual([]);
  });

  test('ловить прямий імпорт коду іншого сервісу', () => {
    const f = 'services/orders/infrastructure/X.ts';
    expect(check(f, "import { Courier } from '../../delivery/domain/entities/Courier';")).not.toEqual([]);
    expect(check('services/orders/domain/entities/X.ts', "import { R } from '../../../restaurants/domain/entities/Restaurant';")).not.toEqual([]);
  });

  test('ловить application → infrastructure/shared та presentation → infrastructure/domain', () => {
    expect(check('services/orders/application/use-cases/X.ts', "import { R } from '../../infrastructure/InMemoryRepositories';")).not.toEqual([]);
    expect(check('services/orders/application/use-cases/X.ts', "import { r } from '../../../../shared/http/client';")).not.toEqual([]);
    expect(check('services/orders/presentation/X.ts', "import { R } from '../infrastructure/InMemoryRepositories';")).not.toEqual([]);
    expect(check('services/orders/presentation/X.ts', "import { Order } from '../domain/entities/Order';")).not.toEqual([]);
  });

  test('shared не знає про сервіси', () => {
    expect(check('shared/http/X.ts', "import { A } from '../../services/orders/domain/entities/Order';")).not.toEqual([]);
  });

  test('ловить require, динамічний import, імпорт без from та багаторядковий імпорт', () => {
    const f = 'services/orders/domain/entities/X.ts';
    expect(check(f, "const x = require('../../infrastructure/a');")).not.toEqual([]);
    expect(check(f, "const x = await import('../../infrastructure/a');")).not.toEqual([]);
    expect(check(f, "import '../../infrastructure/a';")).not.toEqual([]);
    expect(check(f, "import {\n  A,\n  B,\n} from '../../infrastructure/a';")).not.toEqual([]);
  });

  test('допускає коректні залежності', () => {
    expect(check('services/orders/application/use-cases/X.ts', "import { Order } from '../../domain/entities/Order';")).toEqual([]);
    expect(check('services/orders/infrastructure/X.ts', "import { r } from '../../../shared/http/client';")).toEqual([]);
    expect(check('services/orders/infrastructure/X.ts', "import { P } from '../application/ports/EventPublisher';")).toEqual([]);
    expect(check('services/orders/presentation/errors.ts', "import { DomainError } from '../domain/errors';")).toEqual([]);
    expect(check('services/orders/config/app.ts', "import { Order } from '../domain/entities/Order';")).toEqual([]);
  });
});
