# 발주서 002 — 빌딩 v1 코어 엔진 + 밸런스 확정

> 원문 보관. 수정 금지.

---

발주서 002 — 빌딩 v1 코어 엔진 + 밸런스 확정. UI는 만들지 않는다(003).

## 0. 문서 갱신 먼저
docs/BALANCE.md의 TBD를 아래 숫자로 전부 채우고, docs/GDD.md의 해당 규칙을 갱신한 뒤 커밋. 그 다음 구현.

## 1. 단위·시작 상태
- 돈 $, 시간 실시간 초. 게임 내 "일" 개념 없음.
- 시작: 자본 $60,000 / 신뢰도 50(0~100) / 면허 1 / 동시 현장 1 / 협력업체 5종 전부 Lv1.

## 2. 프로젝트 템플릿 (src/data/project-types.json)
| type | floors | P | license |
| house | 1 | 150000 | 1 |
| lowrise | 3 | 600000 | 1 |
| midrise | 8 | 2000000 | 2 |
- 면허 2 해금: 준공 5건 AND 자본 $500,000.
- 템플릿 구조는 타입별 공정 배열로 두어 v2 plant, v3 fab 슬롯을 비워둔다.

## 3. RFQ·입찰
- 게시판 3칸. 90초마다 1칸 교체(가장 오래된 칸). 낙찰·거절 시 즉시 교체.
- RFQ 필드: type, P(성향·검사관 보정 적용 후), client_trait, inspector, deadline_sec, advance_available(bool).
- 견적 3단계: low 0.90P 낙찰 80% / fair 1.00P 50% / high 1.15P 20%. 공사비 = 0.85P 고정.
- 발주처 성향(client_trait): price(low +10%, high −10%) / track(신뢰도≥70이면 전부 +15%) / schedule(deadline 20% 짧음, 지연 시 최종 기성 −10%).
- 검사관(inspector): lenient(기본 통과 85%, 통과 시 minor 0~1, P×1.00) / normal(70%, 1~2, P×1.05) / strict(50%, 2~4, P×1.15). 분포 40/40/20%.
- 3연속 낙찰 실패 → 다음 RFQ 1건 지명(낙찰 100%, fair 고정).
- 신뢰도≥70 → 새 RFQ의 10%가 수의계약(입찰 없이 fair 낙찰).
- 선수금: 발주처 신뢰도 기준이 아니라 플레이어 신뢰도≥60일 때 advance_available=true. 낙찰 시 P의 10% 즉시 입금, 매 기성에서 10% 차감해 회수.

## 4. 공정 (src/data/process-stages.json, 협력업체 Lv1 기준)
| stage | sub | sec | cost(P비율) | pay(P비율) |
| foundation | sitework | 40 | 0.15 | 0.15 |
| structural(층당) | structure | 60 | 0.60/floors | 0.60/floors (해당 층 MEP 통과 시) |
| mep(층당) | electrical+plumbing+fire | 45 | 위에 포함 | 위에 포함 |
| weatherproof | structure | 30 | 0.10 | 0.10 |
| final(fire→final→CO) | fire+all | 30 | 0.15 | 0.15 |
- 층 파이프라인: structural n 완료 → mep n 시작 AND structural n+1 시작. mep는 structural이 그 층에서 검사 통과해야 시작.
- 비용은 단계 시작 시 차감(잔고 부족이면 단계 대기, 현장 정지 표시). 기성은 검사 통과 시.
- 유보금: 매 기성 10% 보류 → CO 시 일괄 지급. 선수금 있으면 추가 10% 차감(회수 완료까지).
- deadline: 템플릿 기본 = Lv1 예상 소요 × 1.5. 초과 시 신뢰도 −10(schedule 성향은 기성 −10% 추가).

## 5. 검사 (src/data/inspection-gates.json)
- 게이트: foundation / structural(층별) / mep(층별) / weatherproof / fire / final.
- 통과율 = 검사관 기본 + 담당 협력업체 Lv×1.5% − low견적 10% − risky_pour 20%(해당 층 structural만) − strict_inspector_event 10%. 상한 98%, 하한 20%.
- 실패 → Major: 재작업 단계 시간 50% + 비용 30%, 재검사. 통과 전 다음 단계 불가.
- 통과 시 검사관별 minor 개수 굴림. Minor: 펀치 리스트 누적, 건당 P×0.003 비용·8초, 언제든 정리 가능. 열린 minor 5개당 신뢰도 −1(프로젝트 종료 시 정산). final 게이트는 minor 0일 때만 진행.
- 신뢰도: 통과 +2 / Major −5 / 기한 내 CO +10 / 지연 CO −10.
- 하자: CO 시 P×0.01 납부(반환 없음). CO 후 180초 하자 기간. 발생 확률 = 5% + 누적 발생 minor×1% + low견적 5%, 상한 40%. 발생 시 P×0.05 지출·신뢰도 −5, 무사 시 +3.

## 6. 협력업체 (5종: sitework, structure, electrical, plumbing, fire)
- 레벨업 비용 20000 × 1.6^(Lv−1), 최대 Lv10.
- 효과: 담당 단계 시간 ×0.92^(Lv−1), 검사 +1.5%×(Lv−1).
- mep 단계 시간은 electrical·plumbing·fire 셋의 평균 배율.

## 7. 회사
- 동시 현장 2번째 $150,000 / 3번째 $600,000. v1 상한 3.
- 프레스티지 미구현. 순자산 계산만(현금+유보금 잔액).

## 8. 이벤트 (src/data/event-templates.json)
| rain | 60초마다 15%, 30~60초 | foundation·structural 정지. 선택 risky_pour: 진행하되 해당 검사 −20% |
| material_spike | 분당 10% | 다음 시작 단계 비용 +15% |
| strict_inspector | 프로젝트 시작 시 20% | 그 프로젝트 전 검사 −10% |
| payment_delay | 기성 발생 시 15%(schedule 성향 30%) | 입금 60초 지연 |
| change_order | 프로젝트당 1회 25% | 계약금 +10%, 진행 중 단계 시간 +20% |
- 선택형 이벤트(rain)는 상태에 pending_decision으로 노출만 하고 core는 판단하지 않는다. 오프라인·미응답 시 기본값 = 대기.

## 9. 오프라인
- src/save: 마지막 저장 시각 기준 경과분 core.advance()로 재생, 상한 8시간. 오프라인 중 입찰 없음, rain은 대기, 검사는 정상 굴림.
- 자동 저장 10초 + beforeunload.

## 10. 구현 요구
- src/core: state, advance(state, dtSec, rng) 순수 함수. rng는 시드 주입(테스트·시뮬 재현용). 모든 수치는 src/data JSON에서 로드, 코드 하드코딩 금지.
- tests/: 층 파이프라인 순서, 기성·유보금·선수금 계산, 검사 확률 경계(상한·하한), 3연속 실패 지명, 오프라인 8시간 상한, 데이터 JSON 스키마.
- 광고 훅: core에 boost 상태 필드만(2x_income 240초, rain_clear, instant_rework). 구현은 003 이후.

## 11. 완료 후 balance-sim
- 시드 3개 × 시나리오 2개(항상 fair 입찰 / 항상 low 입찰) × 1h·8h. 단순 정책: 돈 생기면 협력업체 균등 레벨업, 자본 여유 시 현장 추가.
- 보고: 시간대별 현금·순자산·준공 수·파산 여부·현금 0으로 정지한 총 시간·검사 실패율·minor 누적. 파산이 나오면 어느 단계에서 왜인지.

## 12. 정지 조건
0단계 커밋 1회, 구현 커밋 1회. balance-sim 표 보고 후 정지. 숫자 수정 제안은 해도 되지만 적용은 금지. 003(UI) 착수 금지.
