# HANDOFF

> 각 발주서 완료 시 갱신. 최신 항목이 위.

---

## 발주서 001 — 프로젝트 골격 (원문: `docs/orders/001_scaffold.md`)

상태: **완료**

### 완료

| 항목 | 결과 |
|---|---|
| 폴더 구조 | 발주서대로 생성 (`CLAUDE.md`, `.claude/agents/`, `docs/`, `src/{core,data,ui,save}`, `tests/`, `public/`) |
| 기술 스택 | Vite 7 + TypeScript 5, 프레임워크 없음, 게임 엔진 없음 |
| `CLAUDE.md` | 작성 완료 (정체성·언어·원본·범위·IP·스택·아키텍처 경계·품질 게이트·에이전트) |
| `.claude/agents/` | `balance-sim.md`, `qa-runner.md`, `reviewer.md` — 전부 `name`/`description`/`tools`/`model: sonnet` 프론트매터 |
| `docs/GDD.md` | 확정 사항 12개 섹션 정리, 미확정 12건 `TBD` 집계표 포함 |
| `docs/BALANCE.md` | 12개 영역 항목명 표, 숫자 전부 `TBD` (확정값은 "동시 현장 3개", "지명 입찰 3연속 실패", "강우 시 타설 정지" 3건뿐) |
| `docs/orders/001_scaffold.md` | 발주서 원문 보관 |
| `tests/` | `architecture.test.ts` — 11개 전부 통과 |
| `npm run build` | 성공. `dist/index.html` 산출 (0.25 kB, 빈 HTML) |
| `git init` + 첫 커밋 | 완료 |

### 검증한 것

- **빌드 산출물**: `dist/index.html` 한 개. 현재 엔트리가 비어 있어 tree-shaking으로 `assets/`가 생략됨 → 별도 프로브 빌드로 `assets/index-<hash>.js` 정상 생성 및 `<script src="./assets/...">` **상대 경로** 확인 후 원복.
- **외부 CDN 의존 0**: `index.html`에 외부 origin 없음 (테스트로 고정).
- **`src/core` 순수성**: `document` / `window` / `navigator` / `localStorage` / `HTML*Element` / Canvas API / `src/ui` import 금지를 테스트로 고정.
- **빌드 크기**: 8 KB. 목표 20 MB 대비 여유.

### 미완 (다음 발주서 대상)

- `src/core` 시뮬레이션 엔진 — 파일은 계약(주석)만 있고 구현 없음.
- `src/ui` 렌더링·입력 — 구현 없음.
- `src/save` localStorage·오프라인 진행 — 구현 없음.
- `src/data/*.json` 4개 파일 — 전부 빈 배열 `[]`. 스키마 미정.
- `docs/BALANCE.md` 숫자 — 전부 TBD.
- `docs/GDD.md` TBD 12건 — 11장 집계표 참조.

### 보류

- **협력업체 부실시공 유혹** — v1.5. 명성 시스템 + 하자 시스템 선행 조건.
- **v2 Plant / v3 Fab 프로젝트 타입** — 슬롯만 확보. 내용 없음.

### 보고 사항 (지시 대기)

1. **테스트 러너 선택** — 발주서에 러너 지정이 없어 Vite 생태계 기본인 **Vitest**를 넣었습니다. 다른 러너를 원하시면 교체하겠습니다.
2. **`src/data` JSON 4개 선생성** — 발주서가 "src/data는 JSON으로"라고만 명시해 빈 배열 파일 4개(`project-types` / `process-stages` / `inspection-gates` / `event-templates`)를 만들었습니다. 스키마는 비워 뒀습니다. 파일명·분할 단위 확정 필요.
3. **의존성 취약점** — `vitest` 4.x에 moderate 2건(`@vitest/mocker` path traversal). **개발 의존성이라 배포 빌드에는 포함되지 않습니다.** 해소하려면 vitest 5로 메이저 업그레이드가 필요해 임의로 올리지 않았습니다.
4. **`dist/.gitkeep`** — `public/`을 git에 남기려 넣은 0바이트 파일이 빌드 산출물에 복사됩니다. `public/`에 실제 에셋이 들어오면 자연히 정리됩니다.

### 다음 작업 (제안, 미착수)

발주서 002에서 다뤄야 할 것으로 보이는 순서:
1. 상태 스키마 + 틱 함수 계약 확정 (`src/core`)
2. `src/data` JSON 스키마 확정 + `BALANCE.md` 1차 숫자 채우기
3. Building 층 파이프라인 구현

**정지. 다음 발주서 대기 중입니다.**
