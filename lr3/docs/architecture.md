# Архітектура ЛР3

```text
services/
  orders/       domain · application · infrastructure · presentation · config · main.ts
  restaurants/  domain · application · infrastructure · presentation · config · main.ts
  delivery/     domain · application · infrastructure · presentation · config · main.ts
  gateway/      presentation · config · main.ts
shared/         технічна бібліотека: HTTP-клієнт із тайм-аутом, маршрутизатор, outbox/inbox подій
contracts/      OpenAPI та JSON Schema подій
scripts/        запуск усіх процесів і демонстрація відмов
tests/          домен, сценарії, архітектура, контракти, інтеграція
```

Правила залежностей перевіряє `tests/architecture.test.ts`:

| Файл                    | Може імпортувати                                       |
|-------------------------|---------------------------------------------------------|
| domain                  | лише domain свого сервісу                               |
| application             | application, domain свого сервісу                       |
| infrastructure          | свого сервісу + shared                                  |
| presentation            | application свого сервісу (+ domain/errors), shared     |
| config, main            | будь-які шари свого сервісу + shared                    |
| shared                  | лише shared                                             |
| будь-що з сервісу A     | **ніколи** код сервісу B                                |
