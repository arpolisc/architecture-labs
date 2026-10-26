import { SqlDatabase } from '../../shared/db/sqlite';

/**
 * Версії коду репозиторію замовлень на кожному етапі шаблону «розширення – скорочення»
 * (перейменування стовпця orders.courier → orders.courier_id). Використовується тестами та
 * демонстрацією міграції (npm run demo:migration), щоб перевірити зворотну сумісність етапів.
 */
export interface OrderCodeVersion {
  name: string;
  description: string;
  write(db: SqlDatabase, order: { id: string; courierId: string | null }): void;
  read(db: SqlDatabase, id: string): { courierId: string | null } | null;
}

const BASE_COLUMNS = '(id, customer_id, restaurant_id, delivery_address, status';
const BASE_VALUES = (id: string) => [id, 'cust-1', 'rest-1', 'Київ', 'CONFIRMED'];

export const codeVersions: OrderCodeVersion[] = [
  {
    name: 'v1',
    description: 'пише й читає лише старий стовпець courier',
    write: (db, o) => db.run(`INSERT INTO orders ${BASE_COLUMNS}, courier) VALUES (?, ?, ?, ?, ?, ?)`, [...BASE_VALUES(o.id), o.courierId]),
    read: (db, id) => {
      const row = db.get<{ courier: string | null }>('SELECT courier FROM orders WHERE id = ?', [id]);
      return row ? { courierId: row.courier } : null;
    },
  },
  {
    name: 'v2',
    description: 'пише в обидва стовпці (паралельний запис), читає старий',
    write: (db, o) =>
      db.run(`INSERT INTO orders ${BASE_COLUMNS}, courier, courier_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, [...BASE_VALUES(o.id), o.courierId, o.courierId]),
    read: (db, id) => {
      const row = db.get<{ courier: string | null }>('SELECT courier FROM orders WHERE id = ?', [id]);
      return row ? { courierId: row.courier } : null;
    },
  },
  {
    name: 'v3',
    description: 'пише в обидва стовпці, читає новий courier_id',
    write: (db, o) =>
      db.run(`INSERT INTO orders ${BASE_COLUMNS}, courier, courier_id) VALUES (?, ?, ?, ?, ?, ?, ?)`, [...BASE_VALUES(o.id), o.courierId, o.courierId]),
    read: (db, id) => {
      const row = db.get<{ courier_id: string | null }>('SELECT courier_id FROM orders WHERE id = ?', [id]);
      return row ? { courierId: row.courier_id } : null;
    },
  },
  {
    name: 'v4',
    description: 'пише й читає лише новий стовпець courier_id (поточний код)',
    write: (db, o) => db.run(`INSERT INTO orders ${BASE_COLUMNS}, courier_id) VALUES (?, ?, ?, ?, ?, ?)`, [...BASE_VALUES(o.id), o.courierId]),
    read: (db, id) => {
      const row = db.get<{ courier_id: string | null }>('SELECT courier_id FROM orders WHERE id = ?', [id]);
      return row ? { courierId: row.courier_id } : null;
    },
  },
];

/** Перевіряє, чи працює версія коду зі схемою в поточному стані: запис і читання не падають і повертають записане. */
export function worksWith(version: OrderCodeVersion, db: SqlDatabase, probeId: string): boolean {
  try {
    version.write(db, { id: probeId, courierId: 'courier-x' });
    return version.read(db, probeId)?.courierId === 'courier-x';
  } catch {
    return false;
  }
}
