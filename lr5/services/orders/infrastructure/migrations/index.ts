import { Migration, PLATFORM_TABLES_SQL } from '../../../../shared/db/migrate';

/**
 * Міграції сервісу замовлень. Зміна схеми виконується за шаблоном «розширення – скорочення»
 * (перейменування стовпця orders.courier → orders.courier_id) окремими міграціями:
 *   002 – розширення: додано новий стовпець, старий збережено;
 *   003 – перенесення наявних даних у новий стовпець;
 *   004 – скорочення: старий стовпець вилучено (лише після переходу всього коду на courier_id).
 */
export const ordersMigrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL
);
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  restaurant_id TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  status TEXT NOT NULL,
  courier TEXT
);
CREATE TABLE order_items (
  order_id TEXT NOT NULL REFERENCES orders (id),
  position INTEGER NOT NULL,
  item TEXT NOT NULL,
  PRIMARY KEY (order_id, position)
);
CREATE INDEX idx_orders_customer ON orders (customer_id);
${PLATFORM_TABLES_SQL}`,
  },
  {
    version: 2,
    name: 'expand_add_courier_id',
    sql: 'ALTER TABLE orders ADD COLUMN courier_id TEXT;',
  },
  {
    version: 3,
    name: 'backfill_courier_id',
    sql: 'UPDATE orders SET courier_id = courier WHERE courier_id IS NULL AND courier IS NOT NULL;',
  },
  {
    version: 4,
    name: 'contract_drop_courier',
    sql: 'ALTER TABLE orders DROP COLUMN courier;',
  },
];
