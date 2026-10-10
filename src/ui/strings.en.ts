// Every player-facing string in the game, in English. Nothing is written
// inline anywhere else in src/ui.
//
// This table is also the shape every translation must match: strings.ko.ts is
// typed against it, and tests/strings.test.ts fails on a missing key.

export const strings = {
  app: {
    title: 'Contractor Tycoon',
    loading: 'Loading site…',
  },

  topBar: {
    cash: 'Cash',
    debt: 'Debt',
    trust: 'Client trust',
    license: 'Licence',
    netWorth: 'Net worth',
    sites: 'Sites',
  },

  site: {
    emptyTitle: 'Empty lot',
    emptyReady: 'Ready for the next job',
    buySlot: (cost: string) => `Buy slot ${cost}`,
    nextSite: 'Next site',
    slotShort: (amount: string) => `${amount} short`,
    slotLocked: (n: number) => `Opens once site ${n} is yours`,
    slotCapReached: 'All lots in use',
    cannotAfford: 'Not enough cash',
    deadline: 'Deadline',
    overdue: 'Overdue',
    contract: 'Contract',
    paid: 'Paid to date',
    retainage: 'Retainage held',
    inspector: 'Inspector',
    client: 'Client',
    floors: (n: number) => (n === 1 ? '1 floor' : `${n} floors`),
    progress: 'Progress',
    abandon: 'Abandon',
    stalledFunds: (amount: string) => `Waiting on funds — needs ${amount}`,
    stalledFundsPlain: 'Waiting on funds — needs',
    stalledRain: (seconds: string) => `Rained off — ${seconds} left`,
    awaitingInspection: 'Awaiting inspection',
    punchOpen: (n: number) => (n === 1 ? '1 open punch item' : `${n} open punch items`),
    punchNone: 'Punch list clear',
    punchClear: 'Clear punches',
    punchCost: (cost: string, seconds: string) => `${cost} each · ${seconds} each`,
    punchBlocking: 'Final inspection is blocked until the punch list is clear',
    punchBilled: 'Billed against retainage at handover',
    clearing: (n: number) => `Clearing ${n}…`,
  },

  projectType: {
    house: 'House',
    lowrise: 'Low-rise',
    midrise: 'Mid-rise',
    repair: 'Repair work',
  },

  stage: {
    foundation: 'Foundation',
    structural: 'Structure',
    mep: 'Services',
    weatherproof: 'Weatherproofing',
    final: 'Fit-out',
    repair: 'Repair work',
  },

  gate: {
    foundation: 'Foundation inspection',
    structural: 'Structural inspection',
    mep: 'Rough-in inspection',
    weatherproof: 'Weatherproofing inspection',
    fire: 'Fire marshal',
    final: 'Final inspection',
  },

  floorState: {
    waiting: 'Not started',
    structure: 'Framing',
    structureGate: 'Structural inspection',
    services: 'Services',
    servicesGate: 'Rough-in inspection',
    done: 'Complete',
  },

  decision: {
    rainTitle: 'Rain has stopped the pour',
    pourAnyway: (penalty: string) => `Pour anyway (${penalty} inspection)`,
    wait: 'Wait it out',
  },

  board: {
    title: 'Invitations to tender',
    lossStreak: (n: number) => `${n} in a row lost — a named contract comes next`,
    named: 'Named contract',
    negotiated: 'Negotiated',
    winChance: 'Win',
    margin: 'Margin',
    minCash: 'Needs',
    qualify: (amount: string) => `Qualifies at ${amount}`,
    qualifyShort: (amount: string, gap: string) => `Qualifies at ${amount} · ${gap} short`,
    short: (amount: string) => `${amount} short`,
    accept: 'Accept',
    decline: 'Decline',
    won: 'Won',
    lost: 'Lost',
    takeRepair: 'Take repair job',
    repairTitle: 'Repair job',
    repairBlurb: 'Small, dull, and always there when you need it.',
    cooldown: (seconds: string) => `Back in ${seconds}`,
    tiers: { low: 'Low', fair: 'Fair', high: 'High' },
    traits: {
      price: 'Price-driven',
      track: 'Record-driven',
      schedule: 'Schedule-driven',
    },
    inspectors: { lenient: 'Lenient', normal: 'Standard', strict: 'Strict' },
  },

  company: {
    title: 'Company',
    subcontractors: 'Subcontractors',
    subs: {
      sitework: 'Sitework',
      structure: 'Structure',
      electrical: 'Electrical',
      plumbing: 'Plumbing',
      fire: 'Fire protection',
    },
    level: (n: number) => `Level ${n}`,
    maxLevel: 'Max level',
    upgrade: 'Upgrade',
    subEffect: (time: string, inspection: string) => `${time} build time · ${inspection} inspection`,
    licenseProgress: 'Licence 2',
    licenseNeeds: (done: number, required: number, worth: string, target: string) =>
      `${done}/${required} handovers · ${worth} / ${target} net worth`,
    licenseHeld: 'Licence 2 held',
    prestige: 'Sell company (coming soon)',
  },

  log: {
    title: 'Activity',
    empty: 'Nothing yet.',
    awarded: (type: string) => `Won ${type}`,
    bidLost: (type: string) => `Lost the ${type} tender`,
    passed: (gate: string) => `${gate} passed`,
    passedWithMinors: (gate: string, n: number) => `${gate} passed — ${n} punch items`,
    failed: (gate: string) => `${gate} failed`,
    payment: (amount: string) => `Payment received ${amount}`,
    paymentDelayed: (amount: string) => `Payment held ${amount}`,
    completed: (type: string) => `${type} handed over`,
    completedLate: (type: string) => `${type} handed over late`,
    abandoned: (type: string) => `Walked off the ${type}`,
    defect: (amount: string) => `Defect claim ${amount}`,
    defectClear: 'Warranty period closed clean',
    licenseUp: (tier: number) => `Licence ${tier} granted`,
  },

  toast: {
    passed: (gate: string) => `${gate} passed`,
    passedMinors: (gate: string, n: number) =>
      n === 1 ? `${gate} passed — 1 punch item` : `${gate} passed — ${n} punch items`,
    failed: (gate: string) => `${gate} failed`,
  },

  // Flavour shown when a gate fails. One is picked at random.
  defects: {
    foundation: [
      'Footing depth is under spec on the north side.',
      'Rebar spacing does not match the drawings.',
      'Concrete test cylinders came back low.',
      'Damp-proof membrane torn at the corner.',
    ],
    structural: [
      'Column splice is missing its cover plate.',
      'Slab deflection is outside tolerance.',
      'Two connections are under-torqued.',
      'Shear wall opening was never framed.',
    ],
    mep: [
      'Junction box is buried behind the drywall.',
      'Pipe run has no accessible shut-off.',
      'Sprinkler head clearance is short.',
      'Conduit is unsupported over the ceiling.',
    ],
    weatherproof: [
      'Flashing laps the wrong way at the parapet.',
      'Sealant joint has already failed.',
      'Roof drain sits above the membrane.',
    ],
    fire: [
      'Fire-stopping is missing at two penetrations.',
      'Exit sign is not on the emergency circuit.',
      'Extinguisher clearance is blocked.',
    ],
    final: [
      'Egress door swings the wrong way.',
      'Handrail is short of the required height.',
      'Occupancy signage has not been posted.',
    ],
  },

  abandonDialog: {
    title: 'Walk off this site?',
    body: 'The client keeps everything held back, and word gets around.',
    retainage: (amount: string) => `Retainage forfeited: ${amount}`,
    advance: (amount: string) => `Advance repaid: ${amount}`,
    trust: (n: number) => `Client trust: ${n}`,
    confirm: 'Walk off',
    cancel: 'Keep going',
  },

  offline: {
    title: 'While you were away',
    elapsed: (time: string) => `${time} of work`,
    capped: (hours: string) => `Capped at ${hours}`,
    completed: (n: number) => (n === 1 ? '1 handover' : `${n} handovers`),
    repairs: (n: number) => (n === 1 ? '1 repair job' : `${n} repair jobs`),
    inspections: (passed: number, failed: number) => `${passed} inspections passed, ${failed} failed`,
    cash: (amount: string) => `Cash ${amount}`,
    resume: 'Back to work',
  },

  settings: {
    title: 'Settings',
    open: 'Settings',
    reset: 'Delete save',
    resetConfirm: 'Delete the save?',
    resetConfirmAgain: 'Really delete? This cannot be undone.',
    resetDo: 'Delete',
    cancel: 'Cancel',
    close: 'Close',
    sound: 'Sound',
    soundOn: 'Sound on',
    soundOff: 'Sound off',
    soundHint: 'Six short cues. Off by default.',
    motion: 'Motion',
    motionReduced: 'Reduced motion is on: animation is held back.',
    language: 'Language',
    languageSwitch: 'Switch language',
  },

  ads: {
    doubleIncome: (minutes: string) => `2x income · ${minutes}`,
    clearRain: 'Clear the rain',
    instantRework: 'Instant rework',
  },

  hints: [
    'Tap Accept to take the job. It starts building straight away.',
    'Every floor is inspected. Fail one and the crew reworks it.',
    'You are paid at each inspection that passes, less retainage.',
  ],

  title: {
    nameFirst: 'Contractor ',
    nameSecond: 'Tycoon',
    tagline: 'Win the work. Pass the inspection. Get paid.',
    start: 'Start building',
    continue: 'Continue',
    newGame: 'New game',
    newGameConfirm: 'Delete the save?',
    savedNote: 'Your site is where you left it.',
    newNote: 'One lot, one crane, and a tender to win.',
  },

  tutorial: {
    skip: 'Skip guide',
    replay: 'Show the guide again',
    replayDone: 'The guide will run on your next new company.',
    t1: {
      say: 'Take this job.',
      why: 'The client asked for you by name, so there is no bidding to win.',
    },
    t2: {
      say: 'Foundation work has started.',
      why: 'The build is paid for up front. Money only comes back when an inspection passes.',
    },
    t2cash: {
      say: 'That is the build coming out of your cash.',
      why: 'You carry the cost until the first inspection pays you.',
    },
    t3pass: {
      say: 'Inspection passed. The progress payment landed.',
      why: (share: string) => `${share} is held back as retainage, paid in full at handover.`,
    },
    t3fail: {
      say: 'Inspection failed. The crew reworks it.',
      why: 'That costs time and money. Better subcontractors fail less often.',
    },
    t4: {
      say: 'Rain has stopped the pour.',
      why: 'Waiting is safe. Pouring anyway is faster but harder to pass.',
    },
    t5: {
      say: 'The inspector left items on the list.',
      why: 'Every one has to be cleared before handover. Clear them now.',
    },
    t6: {
      say: 'Handed over. The retainage came with it.',
      why: 'Now you win the next one at tender.',
    },
    t7: {
      say: 'Pick your price.',
      why: 'Bid low and you win often but earn little. Bid high and it is the other way round.',
    },
    t8: {
      say: 'Spend on your subcontractors when the cash allows.',
      why: 'They build faster and fail fewer inspections.',
    },
  },

  terms: {
    label: 'What this means',
    progressPayment: 'Paid at each inspection you pass, not at the end.',
    retainage: (share: string) => `${share} of every payment, held back until handover.`,
    punch: 'Faults the inspector logged. All must be cleared before handover.',
    inspector: 'How hard this one is to satisfy. Stricter pays more.',
    clientTrait: 'What this client cares about most when picking a bid.',
    license: 'Your grade. Higher grades unlock bigger buildings.',
    traitPrice: 'Leans towards the cheaper bid.',
    traitTrack: 'Favours a contractor with a record behind them.',
    traitSchedule: 'Short deadline, and docks the final payment if you run late.',
    inspectorLenient: 'Passes most work. Pays the least.',
    inspectorNormal: 'Checks properly. Pays the going rate.',
    inspectorStrict: 'Fails a lot and lists plenty. Pays the most.',
  },

  units: {
    seconds: (n: number) => `${n}s`,
    minutesSeconds: (m: number, s: number) => `${m}m ${s}s`,
    hoursMinutes: (h: number, m: number) => `${h}h ${m}m`,
  },
} as const;

export type Strings = typeof strings;
