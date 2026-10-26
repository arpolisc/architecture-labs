import { Migration, PLATFORM_TABLES_SQL } from '../../../../shared/db/migrate';

export const restaurantsMigrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
CREATE TABLE restaurants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  accepting_orders INTEGER NOT NULL DEFAULT 1
);
${PLATFORM_TABLES_SQL}`,
  },
];
