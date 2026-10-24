import { createRestaurantsApp } from './config/app';

const app = createRestaurantsApp({ port: Number(process.env.RESTAURANTS_PORT ?? 3002) });
app.start().then((p) => console.log(`[restaurants] слухає порт ${p}`));
process.on('SIGINT', () => app.stop().then(() => process.exit(0)));
process.on('SIGTERM', () => app.stop().then(() => process.exit(0)));
