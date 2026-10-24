# Структура проєкту

```text
src/presentation/                 шар подання (CLI)
src/application/use-cases/        сценарії використання
src/application/dto/              DTO відповідей сценаріїв
src/domain/entities/              сутності та бізнес-правила
src/domain/repositories/          інтерфейси репозиторіїв
src/infrastructure/repositories/  реалізації в пам’яті
src/config/container.ts           єдина точка складання залежностей
src/main.ts                       точка входу
tests/                            доменні, прикладні та архітектурні тести
```

Дозволені залежності між шарами:

| Шар            | Може імпортувати                      |
|----------------|----------------------------------------|
| domain         | лише domain                            |
| application    | domain, application                    |
| infrastructure | domain, infrastructure                 |
| presentation   | application, presentation              |
| config, main   | будь-які шари (composition root)       |
