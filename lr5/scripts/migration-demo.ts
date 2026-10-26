import { migrate } from '../shared/db/migrate';
import { SqlDatabase } from '../shared/db/sqlite';
import { ordersMigrations } from '../services/orders/infrastructure/migrations';
import { codeVersions, worksWith } from './migration/orderCodeVersions';

/**
 * Демонстрація міграції «розширення – скорочення»: перейменування orders.courier → orders.courier_id
 * у чотири кроки. На кожному етапі показано схему та перелік версій коду, які з нею працюють.
 */
async function main() {
  const db = await SqlDatabase.open();
  const columns = () => db.all<{ name: string }>("SELECT name FROM pragma_table_info('orders')").map((c) => c.name).join(', ');
  const matrix = (tag: string) =>
    codeVersions.map((v, i) => `${v.name}:${worksWith(v, db, `probe-${tag}-${i}`) ? 'працює' : 'ПАДАЄ'}`).join('  ');

  const stages = [
    { upTo: 1, title: 'Етап 0. Початкова схема (код v1)' },
    { upTo: 2, title: 'Етап 1. РОЗШИРЕННЯ: додано стовпець courier_id, старий courier збережено (міграція 002)' },
    { upTo: 3, title: 'Етап 2. Перенесення даних у новий стовпець (міграція 003)' },
    { upTo: 4, title: 'Етап 3. СКОРОЧЕННЯ: старий стовпець courier вилучено (міграція 004)' },
  ];
  for (const stage of stages) {
    if (stage.upTo === 3) {
      // До перенесення даних: старий код ще писав лише в courier; після міграції 003 їх бачить і новий код.
      codeVersions[0].write(db, { id: 'legacy-1', courierId: 'courier-1' });
    }
    const applied = migrate(db, ordersMigrations, stage.upTo);
    console.log(`\n=== ${stage.title} ===`);
    console.log(`   застосовано міграції: ${applied.length ? applied.map((v) => String(v).padStart(3, '0')).join(', ') : '—'}`);
    console.log(`   стовпці orders: ${columns()}`);
    console.log(`   сумісність коду: ${matrix(String(stage.upTo))}`);
    if (stage.upTo === 3) {
      console.log(`   рядок legacy-1 (записано старим кодом) читає v3: ${JSON.stringify(codeVersions[2].read(db, 'legacy-1'))}`);
    }
    if (stage.upTo === 4) {
      console.log(`   рядок legacy-1 після скорочення читає v4: ${JSON.stringify(codeVersions[3].read(db, 'legacy-1'))}`);
    }
  }
  console.log('\nВисновок: вилучати старий стовпець можна лише після того, як у роботі залишився код v4 (він не звертається до courier).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
