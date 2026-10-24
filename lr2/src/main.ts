import { createContainer } from './config/container';
import { runDemo } from './presentation/cli';

createContainer()
  .then(runDemo)
  .catch((error: Error) => {
    console.error('Помилка:', error.message);
    process.exitCode = 1;
  });
