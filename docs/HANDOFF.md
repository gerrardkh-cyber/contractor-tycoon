# HANDOFF

> 각 발주서 완료 시 갱신. 최신 항목이 위.

---

## 발주서 002 — 빌딩 v1 코어 엔진 + 밸런스 확정 (원문: `docs/orders/002_core_engine.md`)

상태: **구현 완료. 밸런스 치명 결함 1건 발견 — 지시대로 수정하지 않고 보고.**

### 완료

| 항목 | 결과 |
|---|---|
| 0단계 문서 | `BALANCE.md` TBD 전부 확정, `GDD.md` 규칙 갱신. 커밋 `eb5ce73` |
| `src/core` | 순수 엔진 13개 모듈. `advance(state, dtSec, rng)` → 새 state, 입력 불변 |
| `src/data` | JSON 5개. core·ui에 하드코딩 밸런스 숫자 0 |
| `src/save` | localStorage 저장·복원, 오프라인 재생(8h 상한), 자동저장 10초 + `beforeunload` |
| `tests/` | 85개 전부 통과 |
| 광고 훅 | `state.boosts` 필드만 존재. 효과 미적용 (지시대로) |
| balance-sim | 시드 3 × 시나리오 2 × 1h/8h 실행 완료 |
| 커밋 | 0단계 `eb5ce73`, 구현 `867b082`, 본 HANDOFF |

### 구현 구조

| 모듈 | 역할 |
|---|---|
| `rng.ts` | mulberry32 시드 주입. 상태 저장·복원으로 스트림 이어짐 |
| `data.ts` | JSON 5종 로드·인덱싱. 모든 수치의 유일한 입구 |
| `state.ts` | 초기 상태, 결정론적 id |
| `project.ts` | 태스크 그래프, 공기·비용·기성. 층 루프는 flow shop |
| `rfq.ts` | 게시판 3칸, 90초 회전, 면허 필터, 낙찰 확률 |
| `inspection.ts` | 통과율 공식 + 양단 클램프, Major 재작업, minor |
| `payments.ts` | 유보금, 선수금 회수, 기성 지연 큐 |
| `events.ts` | rain(선택 노출만) / material_spike / strict_inspector / change_order |
| `actions.ts` | 입찰·거절·레벨업·현장증설·펀치정리·선택응답 |
| `advance.ts` | 0.25초 고정 틱 |
| `company.ts` | 협력업체 효과, 신뢰도, 면허, 순자산 |

---

## 데드락 대응 — 2차까지 완료

### 1차 (지시 002-b)

| 항목 | 이전 | 이후 |
|---|---|---|
| `structural` cost / pay | `0.60` / `0` | `0.35` / `0.35` |
| `mep` cost / pay | `0` / `0.60` | `0.25` / `0.25` |
| 층 기성 지급 | 둘 다 통과 시 일괄 | 각 게이트 통과 시 각자 몫 |
| `start.cash` | `$60,000` | `$80,000` |

검증(house × low/fair/high × 시드 10 = 30런): 준공 26/30, **fair 10/10 무정지**, 현금 0 이하 0건.
잔여 영구 정지 4건(low 3 / high 1) — 전부 검사 실패 연쇄로 재작업비가 누적된 경우.

### 2차 (지시 002-c)

| # | 지시 | 반영 |
|---|---|---|
| 1 | 해석 B~G 승인 | `BALANCE.md` §0 전체를 **확정 규칙**으로 표기 |
| 2 | 제안 5 채택 — 포기 | `abandonProject` 액션 구현 |
| 3 | 제안 4 축소 채택 — 입찰 자격 | RFQ `minCash` 필드 + 입찰 차단 |
| 4 | 제안 3 기각 | 착수 일시불 유지. 변경 없음 |
| 5 | 재작업 비용 30% → 20% | `reworkCostRatio: 0.2`. 시간 `0.5` 유지 |
| 6 | 테스트 3종 추가 | `tests/abandon.test.ts` 17개 |
| 7 | 커밋 후 balance-sim | 커밋 `852c277` |

**포기(abandon)** — 언제든 가능. 유보금 전액 몰수 / 선수금 미회수 잔액 즉시 반환(음수 잔고 허용, 다음 수입에서 우선 차감) / 신뢰도 −15 / 슬롯 즉시 해제 / `state.abandoned[]`에 기록만. 준공으로 치지 않고 하자 기간도 열리지 않습니다. **긴급 대출은 미구현**(지시대로).

**입찰 자격 `min_cash`** = foundation 비용 + structural 1개 층 비용.

| 타입 | `min_cash` | 시작 자본 $80,000 기준 |
|---|---|---|
| `house` | `$63,750` | 입찰 가능 |
| `lowrise` | `$136,000` | **불가** |
| `midrise` | `$329,375` | **불가** |

미달 RFQ는 게시판에 남되 입찰만 막힙니다.

### 구현 시 판단한 것 (보고)

- **포기 시 지연 중이던 기성은 회수하지 않습니다.** 지시에 언급이 없었고, 이미 게이트를 통과해 확정된 기성이라 예정대로 입금됩니다. 몰수 대상은 유보금뿐입니다.
- **`stats.bankruptAtSec`은 포기로도 켜집니다.** 선수금 반환이 잔고를 음수로 만들 수 있기 때문입니다. 설계상 허용된 음수이므로 "파산"과 구분해 읽어야 합니다.
- **`SAVE_VERSION` 1 → 2.** 상태에 `abandoned[]`가 추가되어 구버전 저장본을 그대로 읽으면 깨집니다.
- **RFQ 필드명은 `minCash`** (camelCase). 발주서 표기는 `min_cash`지만, 기존 필드(`clientTrait`, `deadlineSec`, `advanceAvailable`)와 표기를 맞췄습니다.

---

## 보고 사항 (지시 대기)

1. ~~**해석 결정 A (cost/pay 기준액)**~~ — **승인 확정 완료.** cost는 `0.85P`의 배분, pay는 낙찰금액의 배분. change_order `+10%`는 **발동 시점 이후 잔여 기성에만, 소급 없음** (확정, `BALANCE.md` §9.1 TBD 닫음). 유보금·선수금 차감은 pay 기준. `tests/contract-basis.test.ts`로 고정.
   - **해석 결정 B~G는 여전히 미승인** — `BALANCE.md` §0 표 참조. 전문을 보고에 출력했습니다.
2. **`src/data/balance.json` 신규** — 발주서가 명시한 JSON 4종에 담을 수 없는 수치(시작 상태, 견적 확률, 신뢰도 델타, 레벨 곡선, 오프라인 상한 등)가 있어 5번째 파일을 만들었습니다. 001의 가드 테스트 파일 목록을 4→5로 확장했습니다(삭제 아님).
3. **`applyAction(state, action, rng)` 추가** — 발주서는 `advance`만 명시했으나, 입찰·펀치 정리·rain 선택 응답이 전부 플레이어 액션이라 순수 액션 함수가 필요했습니다. `advance`와 마찬가지로 입력 불변.
4. **`stats.totalStalledSec`이 실제 데드타임을 약 12% 과소 집계** — 우천 중단이 현금 검사보다 먼저 조기 리턴하므로, 비 오는 동안은 현금 부족이어도 `stalled`로 집계되지 않습니다. 사양상 `stalled`는 "잔고 부족" 표시이므로 **동작 자체는 사양대로**이나, 지표로서는 오해 소지가 있습니다. 한 줄 순서 변경으로 고칠 수 있습니다 — 지시 주시면 반영하겠습니다.
5. **선수금 잔액 미회수** — low 견적 시 낙찰금액 0.90P, 기성 회수 한도는 그 10%인 0.09P인데 선수금은 0.10P입니다. 유보금 정산은 기성이 아니므로 회수 대상이 아니어서 **0.01P가 영구 미회수**로 남습니다. 문자 그대로 구현했습니다.
6. ~~**`mep` 재작업 비용 0**~~ — **해소됨.** `mep`이 `costShare 0.25`를 갖게 되어 재작업 비용도 정상 청구됩니다.
7. **`final` 게이트는 `fire` 게이트 직후의 minor를 반드시 정리해야 통과** — 따라서 CO 경로에서 "열린 minor 5개당 신뢰도 −1"은 **상시 0으로 비활성**입니다(`BALANCE.md` §0-G). peak 또는 시간가중 의도였는지 확인 필요합니다.

## 다음 작업 (제안, 미착수)

1. **balance-sim 재실행** — 지시대로 §0 표·제안 1~5 전달 승인 후에 실행합니다. 아직 돌리지 않았습니다.
2. **잔여 영구 정지 4건에 대한 지시** — 데드락 제안 5번(포기 액션 / 긴급 대출 / 자동 해지) 또는 재작업 비용 완화.
3. **해석 결정 B~G 승인** 여부.
4. 발주서 003 (UI)

**정지. 003 착수하지 않았습니다. balance-sim도 실행하지 않았습니다.**

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
