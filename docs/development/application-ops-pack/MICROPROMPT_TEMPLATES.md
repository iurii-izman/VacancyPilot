# Bounded Micro-prompt Templates

Replace bracketed fields with evidence from review.

## Acceptance gap

```text
Исправь только acceptance gap эпика [AOPS-ID].

Фактический дефект:
[наблюдаемое поведение]

Доказательство:
- файл/функция: [path:line or symbol]
- failing test/command: [command + concise failure]

Требуемый результат:
[конкретный observable result]

Добавь или скорректируй focused test, который сначала воспроизводит дефект, а
затем проходит после исправления.

Не трогай:
[explicit non-goals]

Запусти:
[commands]

Не commit/push. Верни changed files, фактические результаты команд и
git diff --stat.
```

## Scope reduction

```text
В текущем diff эпика [AOPS-ID] есть лишний scope:
[paths/behavior].

Сохрани только:
[allowed scope].

Не удаляй изменения механически и не используй reset/checkout. Аккуратно
отмени только внесённую этим эпиком лишнюю логику, сохранив пользовательские
предсуществующие изменения.

После коррекции запусти:
[commands]

Не commit/push. Покажи итоговый git diff --stat и перечисли удалённый scope.
```

## Security closure

```text
Закрой один security defect эпика [AOPS-ID]:
[defect].

Threat:
[who can call/read/alter what].

Required invariant:
[loopback/CORS/token/redaction/no-secret/etc.].

Добавь негативный тест, который доказывает отказ небезопасного сценария, и
позитивный тест для разрешённого сценария.

Не расширяй permissions, endpoints или product scope. Не выводи секреты в
ответе. Не commit/push.
```

## Test-only reproducibility closure

```text
Implementation эпика [AOPS-ID] выглядит корректно, но acceptance нельзя
воспроизводимо подтвердить:
[missing/flaky/manual-only evidence].

Не меняй product behavior без доказанного дефекта. Добавь минимальный
детерминированный test/fixture/command, подтверждающий:
[invariant].

Запусти focused test и соответствующий full regression command. Не
commit/push. Верни точный вывод.
```
