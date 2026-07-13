# ITER-051: Security Alert Inventory And Fix Map

Date: 2026-06-21
Epic: EPIC-28
Status: complete (inventory phase)

## Executive Summary

`pnpm audit` на `main` показывает **10 уязвимостей** (0 critical, 7 high, 2 moderate, 1 low), все — в devDependencies. Ни одна не попадает в production-бандл расширения.

Все уязвимости транзитивные, разложены в **4 alert families** (A–D) по пакету-источнику. Два семейства закрываются простым override (→ ITER-052), одно требует координированного обновления цепочки (→ ITER-053), одно — upstream-blocked (deferred).

## Baseline

| Метрика | Значение |
|---------|----------|
| Всего уязвимостей | 10 |
| Critical | 0 |
| High | 7 |
| Moderate | 2 |
| Low | 1 |
| Затронуто пакетов | 4 (tar, tmp, uuid, esbuild) |
| В production-бандле | 0 (все — devDependencies) |

Ранее закрытые (предыдущий triage): shell-quote, vitest — подтверждено 0 critical.

## Alert Family A: tar (7 advisories — 6 high + 1 moderate)

**Dependency chain:**
```
vacancy-pilot → wxt@0.20.26 → giget@1.2.5 → tar@6.2.1
```

**Vulnerable version:** tar@6.2.1 (<7.5.7 across all advisories)
**Patched version:** tar >=7.5.16 (covers all 7 advisories)

| GHSA | Severity | Title | Patched |
|------|----------|-------|---------|
| GHSA-34x7-hfp2-rc4v | high | Arbitrary File Creation/Overwrite via Hardlink Path Traversal | >=7.5.7 |
| GHSA-8qq5-rm4j-mr97 | high | Arbitrary File Overwrite and Symlink Poisoning | >=7.5.3 |
| GHSA-83g3-92jg-28cx | high | Arbitrary File Read/Write via Hardlink Target Escape | >=7.5.8 |
| GHSA-qffp-2rhf-9h96 | high | Hardlink Path Traversal via Drive-Relative Linkpath | >=7.5.10 |
| GHSA-9ppj-qmqm-q256 | high | Symlink Path Traversal via Drive-Relative Linkpath | >=7.5.11 |
| GHSA-r6q2-hw4h-h46w | high | Race Condition via Unicode Ligature Collisions (macOS APFS) | >=7.5.4 |
| GHSA-vmf3-w455-68vh | moderate | PAX size override — tar parser interpretation differential | >=7.5.16 |

**Risk assessment:**
- Build-time only. `tar` используется `giget` для распаковки шаблонов при WXT scaffolding. Не попадает в extension bundle.
- Эксплуатация требует crafted malicious tar archive, подаваемого на вход giget при локальной разработке.

**Fix constraint:** `giget@1.2.5` declares `tar@^6`. Override до tar@7 — major version jump, требует верификации совместимости giget с tar 7 API.

**Classification:** 🟡 **Toolchain-coordinated fix → ITER-053**
**Rationale:** Major-version override (6→7) breaking giget's declared constraint. Needs coordinated override of both giget and tar, or verification that giget works with tar 7.

---

## Alert Family B: tmp (1 advisory — high)

**Dependency chain:**
```
vacancy-pilot → wxt@0.20.26 → web-ext-run@0.2.4 → tmp@0.2.5
```

| GHSA | Severity | Title | Patched |
|------|----------|-------|---------|
| GHSA-ph9p-34f9-6g65 | high | Path Traversal via unsanitized prefix/postfix | >=0.2.6 |

**Risk assessment:**
- Dev-only. `tmp` используется `web-ext-run` для временных файлов при загрузке расширения. Не попадает в extension bundle.
- Эксплуатация требует контроля над prefix/postfix параметрами вызова tmp.

**Fix:** Простой `pnpm.overrides` — `tmp: >=0.2.6`. Minor version bump, breaking changes отсутствуют.

**Classification:** 🟢 **Safe local fix → ITER-052**
**Rationale:** Patch-level bump (0.2.5 → 0.2.6), override без побочных эффектов.

---

## Alert Family C: uuid (1 advisory — moderate)

**Dependency chain:**
```
vacancy-pilot → wxt@0.20.26 → web-ext-run@0.2.4 → node-notifier@10.0.1 → uuid@8.3.2
```

| GHSA | Severity | Title | Patched |
|------|----------|-------|---------|
| GHSA-w5hq-g745-h8pq | moderate | Missing buffer bounds check in v3/v5/v6 when buf is provided | >=11.1.1 |

**Risk assessment:**
- Dev-only. `uuid` используется `node-notifier` для генерации ID уведомлений. Не попадает в extension bundle.
- Уязвимость требует crafted buffer input в функции uuid v3/v5/v6 — node-notifier вряд ли использует именно эти варианты API.

**Fix constraint (BLOCKING):**
- uuid v9+ — **ESM-only** (dropped CJS support).
- `node-notifier@10.0.1` — CJS-пакет, не может импортировать ESM-only uuid через `require()`.
- Простой override `uuid: >=11.1.1` сломает node-notifier.

**Fix path requires upstream chain update:**
`node-notifier` → обновить до версии с ESM-совместимостью (или заменой uuid) → `web-ext-run` → обновить зависимость `node-notifier` → `wxt` → обновить `web-ext-run`.

**Classification:** 🔴 **Upstream-blocked / deferred**
**Rationale:** uuid 9+ ESM-only breakage блокирует простой override. Требуется каскадное обновление цепочки node-notifier → web-ext-run → wxt. Выходит за пределы текущего EPIC-28 (toolchain churn risk). Defer до появления upstream-фикса в wxt.

---

## Alert Family D: esbuild (1 advisory — low)

**Dependency chain (multiple paths, 11 total):**
```
vacancy-pilot → wxt@0.20.26 → esbuild@0.27.7
vacancy-pilot → wxt@0.20.26 → vite@7.3.5 → esbuild@0.27.7
vacancy-pilot → vitest@3.2.6 → vite@7.3.5 → esbuild@0.27.7
… (8 more paths via @wxt-dev/module-react, @vitejs/plugin-react, vite-node)
```

| GHSA | Severity | Title | Patched |
|------|----------|-------|---------|
| GHSA-g7r4-m6w7-qqqr | low | Arbitrary file read when running the dev server on Windows | >=0.28.1 |

**Risk assessment:**
- Build-time only (bundler). Уязвимость — Windows-specific, затрагивает только dev server (не build output). Бандл расширения не подвержен.
- Эксплуатация требует локального доступа к dev server на Windows.

**Fix:** Override `esbuild: >=0.28.1`. Minor version bump (0.27 → 0.28), API обратно совместим для transform/build usage. Vite 7.x и WXT 0.20.x совместимы с esbuild 0.28.

**Classification:** 🟢 **Safe local fix → ITER-052**
**Rationale:** Minor version bump, low severity, Windows-only dev-server vulnerability. Override без ожидаемых побочных эффектов.

---

## Fix Map

### ITER-052: Close Safe Transitive Alerts (ready now)

| Family | Package | Current | Override | Severity | Risk |
|--------|---------|---------|----------|----------|------|
| B | tmp | 0.2.5 | >=0.2.6 | high | minimal — patch bump |
| D | esbuild | 0.27.7 | >=0.28.1 | low | low — minor bump, dev-only |

**Actions:**
1. Добавить в `pnpm-workspace.yaml` → `overrides`:
   - `tmp: ">=0.2.6"`
   - `esbuild: ">=0.28.1"`
2. `pnpm install` для применения overrides
3. Прогнать `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
4. `pnpm audit` — ожидаем закрытие 2 advisories (tmp + esbuild), остаётся 8

### ITER-053: Resolve Toolchain-Linked Alerts (needs investigation)

| Family | Package | Current | Target | Severity | Constraint |
|--------|---------|---------|--------|----------|------------|
| A | tar | 6.2.1 | >=7.5.16 | high (6) + moderate (1) | giget pin `tar@^6` |

**Approach options (investigate during ITER-053):**

1. **Override tar to 7.x + verify giget compatibility** — риск: giget может использовать tar 6 API, который изменился в 7.
2. **Override giget to latest + override tar** — проверить, используют ли новые версии giget tar 7.
3. **Wait for WXT upstream** — WXT обновит giget → giget обновит tar. Самый безопасный, но неопределённый по срокам.
4. **Accept risk** — tar используется только как devDependency для scaffolding; эксплуатация требует crafted tar archive при локальной разработке. Можно принять как accepted risk с documented rationale.

**Actions:**
1. Проверить последнюю версию giget — использует ли она tar 7?
2. Если да — override и giget, и tar; проверить совместимость с WXT.
3. Если нет — проверить giget совместимость с tar 7 вручную.
4. При неудаче — задокументировать accepted risk.

### Deferred

| Family | Package | Current | Target | Severity | Blocker |
|--------|---------|---------|--------|----------|---------|
| C | uuid | 8.3.2 | >=11.1.1 | moderate | uuid 9+ ESM-only; node-notifier CJS |

**Deferral rationale:** uuid ESM-only breakage — не решается override. Требует upstream-обновления `node-notifier → web-ext-run → wxt`. Выходит за пределы допустимого toolchain churn для EPIC-28. Отслеживать зависимость wxt → web-ext-run и закрыть при появлении upstream-фикса.

---

## Alert Posture After Planned Fixes

| Состояние | Сейчас | После ITER-052 | После ITER-053 |
|-----------|--------|----------------|----------------|
| Critical | 0 | 0 | 0 |
| High | 7 | 6 | 0 или accepted |
| Moderate | 2 | 1 | 0 или accepted |
| Low | 1 | 0 | 0 |
| **Total** | **10** | **7** | **0–7** |

---

## Risk Acceptance Candidates

Если ITER-053 не сможет закрыть tar без каскадного обновления всей toolchain-цепочки:

- **tar (7 advisories)**: devDependency, build-time only. Используется `giget` для scaffolding. Эксплуатация требует crafted tar archive и локального CLI-доступа — threat model не включает компрометацию dev-окружения через malicious npm-шаблоны.
- **uuid (1 advisory)**: devDependency, используется `node-notifier` для notification IDs. Функции v3/v5/v6 с buffer input, вероятно, не используются в контексте node-notifier. Deferred до upstream-фикса.

**Рекомендация:** Принять оба как accepted risk с documented rationale, если простой override невозможен. Добавить в `docs/development/known-risks.md`.

---

## Validation (Baseline — ITER-051)

| Command | Result | Notes |
|---------|--------|-------|
| `pnpm audit` | 10 vulns (0C/7H/2M/1L) | Baseline inventory |
| `pnpm typecheck` | ✅ pass | tsc --noEmit |
| `pnpm lint` | ✅ pass | eslint |
| `pnpm test` | ✅ pass | 37 files, 1107 tests |

---

# Post-Closure Final Status — EPIC-28 Complete

Date: 2026-06-21 (after ITER-052, ITER-053)

## Final Audit Result

```
1 vulnerability found
Severity: 1 moderate
```

**Единственная оставшаяся уязвимость:** uuid (GHSA-w5hq-g745-h8pq, moderate) — см. Family C.

## Closure Summary

| Iteration | Families Fixed | Advisories Closed | Method |
|-----------|---------------|-------------------|--------|
| ITER-052 | B (tmp), D (esbuild) | 2 | pnpm overrides: patch bump (tmp) + minor bump (esbuild) |
| ITER-053 | A (tar) | 7 | pnpm override: giget 1.2.5→2.0.0 (tar removal) |
| **Total** | **3 of 4 families** | **9 of 10 advisories** | |

## Alert Posture: Before vs After EPIC-28

| Severity | Before EPIC-28 | After EPIC-28 | Delta |
|----------|----------------|---------------|-------|
| Critical | 0 | 0 | — |
| High | 7 | **0** | **-7** |
| Moderate | 2 | **1** | -1 |
| Low | 1 | **0** | -1 |
| **Total** | **10** | **1** | **-9** |

*Before EPIC-28 уже включал предыдущий triage (shell-quote + vitest critical fixes).*

## Resolution Detail

| Family | Package | Advisories | Severity | Resolution | Method |
|--------|---------|------------|----------|------------|--------|
| A | tar | 7 | 6H + 1M | ✅ Resolved | giget 2.0.0 override removes tar entirely |
| B | tmp | 1 | 1H | ✅ Resolved | Override tmp >=0.2.6 (patch bump) |
| C | uuid | 1 | 1M | 🔴 Deferred | ESM-only breakage blocks override |
| D | esbuild | 1 | 1L | ✅ Resolved | Override esbuild >=0.28.1 (minor bump) |

## Dependency Map After Closure

```
Production (0 vulns):
  dexie@4.4.4, react@19.x, react-dom@19.x
  → No advisories. No transitive vulns in production bundle.

Dev (1 vuln, deferred):
  wxt@0.20.26 → web-ext-run@0.2.4 → node-notifier@10.0.1 → uuid@8.3.2
  → uuid moderate: requires upstream ESM migration in node-notifier

Dev (all resolved):
  wxt@0.20.26 → c12@3.3.4 → giget@2.0.0 → nypm@0.6.7
  → tar removed. No advisories.

  wxt/vite/vitest → esbuild@0.28.1
  → Patched. No advisories.

  wxt → web-ext-run → tmp@0.2.7
  → Patched. No advisories.

  wxt → web-ext-run → fx-runner → shell-quote@1.8.4 (override)
  → Previously resolved. No advisories.
```

## Deferred Alert: uuid

| Attribute | Value |
|-----------|-------|
| GHSA | GHSA-w5hq-g745-h8pq |
| Severity | moderate |
| Package | uuid@8.3.2 → target >=11.1.1 |
| Chain | wxt → web-ext-run → node-notifier → uuid |
| Blocker | uuid v9+ is ESM-only; node-notifier@10.0.1 is CJS |
| Risk | Dev-only. uuid used for notification IDs in web-ext-run. Vulnerable path (v3/v5/v6 with buffer input) unlikely in node-notifier context. |
| Resolution path | Requires upstream fix: node-notifier → web-ext-run → wxt. Track WXT releases for web-ext-run update. |
| Decision | **Accepted risk with documented rationale.** Re-evaluate when WXT updates web-ext-run. |

## Final Validation (ITER-054 rerun)

| Command | Result |
|---------|--------|
| `pnpm audit` | 1 vuln (0C/0H/1M/0L) |
| `pnpm typecheck` | ✅ pass |
| `pnpm lint` | ✅ pass |
| `pnpm test` | ✅ pass (37 files, 1107 tests) |
| `pnpm build` | ✅ pass (WXT chrome-mv3, 572.8 kB) |
| `pnpm test:release` | ✅ pass (8 files, 322 tests) |

## Overrides Applied (pnpm-workspace.yaml)

```yaml
overrides:
  shell-quote: 1.8.4      # GHSA-w7jw-789q-3m8p (previous triage)
  tmp: ">=0.2.6"          # GHSA-ph9p-34f9-6g65 (ITER-052)
  esbuild: ">=0.28.1"     # GHSA-g7r4-m6w7-qqqr (ITER-052)
  giget: 2.0.0            # 7 tar advisories (ITER-053)
```

## EPIC-28 Success Criteria Met

- ✅ Оставшиеся алерты больше не «undifferentiated backlog number» — каталогизированы и классифицированы
- ✅ Каждый алерт: fixed, deferred with rationale, или mapped to upstream blocker
- ✅ Safety boundaries сохранены: no permissions/manifest changes, no product code churn
- ✅ All validation green: typecheck, lint, test, build, release-safety
- ✅ Production bundle: 0 advisories (все закрытые — dev-only)
