// 한국어 문자열. strings.en.ts 와 키가 1:1로 대응하며, 타입과 테스트가 그것을 강제한다.
//
// 용어는 현장에서 쓰는 말로 통일했다.
//   progress payment → 기성   retainage → 유보금   advance → 선수금
//   punch item → 펀치         handover/CO → 준공   tender → 입찰
//   award → 낙찰              named → 지명          negotiated → 수의계약
//   inspector → 검사관        subcontractor → 협력업체

import type { StringTable } from './strings';

export const ko: StringTable = {
  app: {
    title: '컨트랙터 타이쿤',
    loading: '현장 준비 중…',
  },

  topBar: {
    cash: '현금',
    debt: '부채',
    trust: '발주처 신뢰도',
    license: '면허',
    netWorth: '순자산',
    sites: '현장',
  },

  site: {
    emptyTitle: '빈 부지',
    emptyReady: '다음 공사를 받을 수 있습니다',
    buySlot: (cost: string) => `부지 매입 ${cost}`,
    nextSite: '다음 부지',
    slotShort: (amount: string) => `${amount} 부족`,
    slotLocked: (n: number) => `${n}번 부지를 사면 열립니다`,
    slotCapReached: '모든 부지 사용 중',
    cannotAfford: '현금 부족',
    deadline: '기한',
    overdue: '기한 초과',
    contract: '계약금',
    paid: '기성 수령액',
    retainage: '유보금',
    inspector: '검사관',
    client: '발주처',
    floors: (n: number) => `${n}층`,
    progress: '진행률',
    abandon: '포기',
    stalledFunds: (amount: string) => `자금 부족으로 정지 — ${amount} 필요`,
    stalledFundsPlain: '자금 부족으로 정지 — 필요액',
    stalledRain: (seconds: string) => `우천 중단 — ${seconds} 남음`,
    awaitingInspection: '검사 대기 중',
    punchOpen: (n: number) => `미처리 펀치 ${n}건`,
    punchNone: '펀치 없음',
    punchClear: '펀치 처리',
    punchCost: (cost: string, seconds: string) => `건당 ${cost} · 건당 ${seconds}`,
    punchBlocking: '펀치를 전부 처리해야 준공 검사를 받습니다',
    punchBilled: '준공 시 유보금에서 정산',
    clearing: (n: number) => `${n}건 처리 중…`,
  },

  projectType: {
    house: '단독주택',
    lowrise: '저층 건물',
    midrise: '중층 건물',
    repair: '수리 공사',
  },

  stage: {
    foundation: '기초',
    structural: '골조',
    mep: '설비',
    weatherproof: '외장·방수',
    final: '마감',
    repair: '수리 공사',
  },

  gate: {
    foundation: '기초 검사',
    structural: '구조 검사',
    mep: '설비 검사',
    weatherproof: '방수 검사',
    fire: '소방 검사',
    final: '준공 검사',
  },

  floorState: {
    waiting: '미착공',
    structure: '골조',
    structureGate: '구조 검사',
    services: '설비',
    servicesGate: '설비 검사',
    done: '완료',
  },

  decision: {
    rainTitle: '비가 와서 타설이 멈췄습니다',
    pourAnyway: (penalty: string) => `그대로 타설 (검사 ${penalty})`,
    wait: '그칠 때까지 대기',
  },

  board: {
    title: '입찰 공고',
    lossStreak: (n: number) => `${n}회 연속 유찰 — 다음은 지명 입찰입니다`,
    named: '지명 입찰',
    negotiated: '수의계약',
    winChance: '낙찰',
    margin: '마진',
    minCash: '필요 현금',
    short: (amount: string) => `${amount} 부족`,
    accept: '수주',
    decline: '거절',
    won: '낙찰',
    lost: '유찰',
    takeRepair: '수리 공사 수주',
    repairTitle: '수리 공사',
    repairBlurb: '작고 지루하지만, 급할 때 늘 거기 있습니다.',
    cooldown: (seconds: string) => `${seconds} 후 다시 나옵니다`,
    tiers: { low: '저가', fair: '적정', high: '고가' },
    traits: {
      price: '가격 중시',
      track: '실적 중시',
      schedule: '공기 중시',
    },
    inspectors: { lenient: '관대', normal: '보통', strict: '엄격' },
  },

  company: {
    title: '회사',
    subcontractors: '협력업체',
    subs: {
      sitework: '토공',
      structure: '골조',
      electrical: '전기',
      plumbing: '설비배관',
      fire: '소방',
    },
    level: (n: number) => `${n}단계`,
    maxLevel: '최고 단계',
    upgrade: '상향',
    subEffect: (time: string, inspection: string) => `공기 ${time} · 검사 ${inspection}`,
    licenseProgress: '면허 2등급',
    licenseNeeds: (done: number, required: number, worth: string, target: string) =>
      `준공 ${done}/${required}건 · 순자산 ${worth} / ${target}`,
    licenseHeld: '면허 2등급 보유',
    prestige: '회사 매각 (준비 중)',
  },

  log: {
    title: '작업 기록',
    empty: '아직 없습니다.',
    awarded: (type: string) => `${type} 낙찰`,
    bidLost: (type: string) => `${type} 유찰`,
    passed: (gate: string) => `${gate} 합격`,
    passedWithMinors: (gate: string, n: number) => `${gate} 합격 — 펀치 ${n}건`,
    failed: (gate: string) => `${gate} 불합격`,
    payment: (amount: string) => `기성 수령 ${amount}`,
    paymentDelayed: (amount: string) => `기성 지급 보류 ${amount}`,
    completed: (type: string) => `${type} 준공`,
    completedLate: (type: string) => `${type} 지연 준공`,
    abandoned: (type: string) => `${type} 포기`,
    defect: (amount: string) => `하자 배상 ${amount}`,
    defectClear: '하자 기간 무사 종료',
    licenseUp: (tier: number) => `면허 ${tier}등급 취득`,
  },

  toast: {
    passed: (gate: string) => `${gate} 합격`,
    passedMinors: (gate: string, n: number) => `${gate} 합격 — 펀치 ${n}건`,
    failed: (gate: string) => `${gate} 불합격`,
  },

  // 검사 불합격 때 뜨는 지적 사항. 하나를 골라 보여준다.
  defects: {
    foundation: [
      '북측 기초 근입 깊이가 기준 미달입니다.',
      '철근 배근 간격이 도면과 다릅니다.',
      '콘크리트 공시체 강도가 기준에 못 미칩니다.',
      '모서리 방습층이 찢어져 있습니다.',
    ],
    structural: [
      '기둥 이음부 덧판이 빠졌습니다.',
      '슬래브 처짐이 허용치를 넘었습니다.',
      '접합부 두 곳이 토크 부족입니다.',
      '전단벽 개구부가 보강되지 않았습니다.',
    ],
    mep: [
      '정션박스가 벽체 안에 묻혔습니다.',
      '배관에 점검 가능한 차단밸브가 없습니다.',
      '스프링클러 헤드 이격거리가 부족합니다.',
      '천장 위 전선관이 고정되지 않았습니다.',
    ],
    weatherproof: [
      '파라펫 후레싱 겹침 방향이 반대입니다.',
      '실런트 줄눈이 벌써 터졌습니다.',
      '옥상 배수구가 방수층보다 높습니다.',
    ],
    fire: [
      '관통부 두 곳에 내화충전이 없습니다.',
      '유도등이 비상 전원에 물려 있지 않습니다.',
      '소화기 앞이 막혀 있습니다.',
    ],
    final: [
      '피난문 열림 방향이 반대입니다.',
      '난간 높이가 기준에 못 미칩니다.',
      '사용승인 표지가 부착되지 않았습니다.',
    ],
  },

  abandonDialog: {
    title: '이 현장을 포기하시겠습니까?',
    body: '유보금은 발주처가 전액 가져가고, 업계에 소문이 납니다.',
    retainage: (amount: string) => `유보금 몰수: ${amount}`,
    advance: (amount: string) => `선수금 반환: ${amount}`,
    trust: (n: number) => `발주처 신뢰도: ${n}`,
    confirm: '포기',
    cancel: '계속한다',
  },

  offline: {
    title: '자리를 비운 동안',
    elapsed: (time: string) => `${time} 작업`,
    capped: (hours: string) => `${hours}까지만 반영`,
    completed: (n: number) => `준공 ${n}건`,
    repairs: (n: number) => `수리 공사 ${n}건`,
    inspections: (passed: number, failed: number) => `검사 ${passed}건 합격, ${failed}건 불합격`,
    cash: (amount: string) => `현금 ${amount}`,
    resume: '현장으로',
  },

  settings: {
    title: '설정',
    open: '설정',
    reset: '저장 삭제',
    resetConfirm: '저장을 삭제할까요?',
    resetConfirmAgain: '정말 삭제합니다. 되돌릴 수 없습니다.',
    resetDo: '삭제',
    cancel: '취소',
    close: '닫기',
    sound: '소리',
    soundOn: '소리 켬',
    soundOff: '소리 끔',
    soundHint: '짧은 효과음 6종. 기본은 꺼짐입니다.',
    motion: '화면 움직임',
    motionReduced: '동작 줄이기가 켜져 있어 애니메이션을 억제합니다.',
    language: '언어',
    languageSwitch: '언어 전환',
  },

  ads: {
    doubleIncome: (minutes: string) => `수입 2배 · ${minutes}`,
    clearRain: '비 그치게 하기',
    instantRework: '재시공 즉시 완료',
  },

  hints: [
    '수주를 누르면 바로 착공합니다.',
    '층마다 검사를 받습니다. 떨어지면 재시공입니다.',
    '검사에 합격할 때마다 기성이 들어옵니다. 유보금은 빼고요.',
  ],

  title: {
    nameFirst: '컨트랙터 ',
    nameSecond: '타이쿤',
    tagline: '수주하고, 검사에 붙고, 기성을 받는다.',
    start: '착공',
    continue: '이어하기',
    newGame: '새로 시작',
    newGameConfirm: '저장을 삭제할까요?',
    savedNote: '현장은 그대로 있습니다.',
    newNote: '부지 하나, 크레인 하나, 그리고 입찰 하나.',
  },

  units: {
    seconds: (n: number) => `${n}초`,
    minutesSeconds: (m: number, s: number) => `${m}분 ${s}초`,
    hoursMinutes: (h: number, m: number) => `${h}시간 ${m}분`,
  },
};
