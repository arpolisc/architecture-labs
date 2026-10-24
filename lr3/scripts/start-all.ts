import { ManagedService, portsFrom, ServiceName } from './processes';

const base = Number(process.env.BASE_PORT ?? 3000);
const ports = portsFrom(base);
const names: ServiceName[] = ['restaurants', 'delivery', 'orders', 'gateway'];
const services = names.map((n) => new ManagedService(n, ports, (name, line) => console.log(line.startsWith('[') ? line : `[${name}] ${line}`)));

async function main() {
  services.forEach((s) => s.start());
  await Promise.all(services.map((s) => s.waitHealthy()));
  console.log(`\nСистему запущено. Точка входу (шлюз): http://127.0.0.1:${ports.gateway}/api`);
  console.log(`Приклад: curl http://127.0.0.1:${ports.gateway}/api/health`);
  console.log('Зупинка: Ctrl+C\n');
}

const shutdown = async () => {
  await Promise.all(services.map((s) => s.stop()));
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
main().catch(async (e) => {
  console.error(e.message);
  await shutdown();
});
