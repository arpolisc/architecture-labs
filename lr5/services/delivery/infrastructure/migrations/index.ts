import { Migration, PLATFORM_TABLES_SQL } from '../../../../shared/db/migrate';

export const deliveryMigrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
CREATE TABLE couriers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  available INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE deliveries (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  courier_id TEXT NOT NULL REFERENCES couriers (id),
  status TEXT NOT NULL
);
-- Локальна копія даних підтвердженого замовлення (власник — сервіс замовлень); поля лише для читання.
CREATE TABLE dispatch_requests (
  order_id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  delivery_address TEXT NOT NULL,
  waiting INTEGER NOT NULL DEFAULT 1
);
${PLATFORM_TABLES_SQL}`,
  },
];
