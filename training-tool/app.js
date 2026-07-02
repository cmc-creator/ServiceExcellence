const state = {
  role: "clinical-staff",
  score: 0,
  streak: 0,
  lessonIndex: 0,
  lessonAttempts: {},
  lessonPassed: new Set(),
  scenarioIndex: 0,
  lightningIndex: 0,
  lightningTimer: 60,
  lightningActive: false,
  assessmentIndex: 0,
  assessmentCorrect: 0,
  badges: new Set(),
  trackingEvents: [],
  activeScenarios: [],
  activeLessons: [],
  finalized: false,
  pass: false,
  lessonsCompleted: false,
  attemptId: null,
  learnerEmail: null,
  learnerName: null,
  soundEnabled: true,
  brandMode: "luxury",
  difficulty: "challenge",
  startTime: null,
  perfectRun: true, // Tracked as long as no mistakes
  speedBonusEarned: 0,
  bonusScenarioUnlocked: false,
  bonusScenarioCompleted: false,
  seasonalAchievements: new Set(),
  missStreak: 0,
  personality: {
    calm: 0,
    precision: 0,
    courage: 0,
  },
  categoryStats: {},
  retryRecommendations: [],
};

const ROLE_CONFIG_KEY = "nyxRoleConfigs";
const SOUND_KEY = "nyxSoundEnabled";
const SEASONAL_KEY = "nyxSeasonalAchievements";
const BRAND_MODE_KEY = "nyxBrandMode";

const seasonalThemes = {
  0: "January Spotlight: New Year, New Standards.",
  1: "February Spotlight: Respect Is A Daily Practice.",
  2: "March Spotlight: Calm Communication Under Pressure.",
  3: "April Spotlight: Kindness During High-Acuity Moments.",
  4: "May Spotlight: Clear Handoffs Save Time And Lives.",
  5: "June Spotlight: Speak Up Early, Speak Up Clearly.",
  6: "July Spotlight: Team Reliability Starts With You.",
  7: "August Spotlight: Service Recovery Done Right.",
  8: "September Spotlight: Privacy First, Always.",
  9: "October Spotlight: Safety Is Built In Small Decisions.",
  10: "November Spotlight: Gratitude Through Professionalism.",
  11: "December Spotlight: Finish The Year With Excellence.",
};

const mysteryBadgeCatalog = [
  { key: "Comeback Kid", hint: "Recover after two misses in a row." },
  { key: "Golden Moment", hint: "Hit a rare golden feedback moment." },
  { key: "Seasonal Champion", hint: "Complete five passes in one month." },
  { key: "Secret Master", hint: "Find and clear the hidden bonus scenario." },
];

const defaultRoleConfigs = [
  {
    id: "clinical-staff",
    name: "Clinical Staff",
    persona: "clinical",
    departments: ["Nursing", "Behavioral Health"],
    enabledModules: [
      "suicide-observation",
      "trauma-informed",
      "medication-safety",
      "workplace-violence",
      "legal-rights-consent",
    ],
  },
  {
    id: "nonclinical-staff",
    name: "Non-Clinical Staff",
    persona: "nonclinical",
    departments: ["Admissions", "Support Services"],
    enabledModules: [
      "suicide-observation",
      "trauma-informed",
      "medication-safety",
      "workplace-violence",
      "legal-rights-consent",
    ],
  },
  {
    id: "leadership-supervisors",
    name: "Leaders and Supervisors",
    persona: "leadership",
    departments: ["Management", "Operations"],
    enabledModules: [
      "suicide-observation",
      "trauma-informed",
      "medication-safety",
      "workplace-violence",
      "legal-rights-consent",
    ],
  },
];

const MODULE_LIBRARY = [
  { id: "suicide-observation", title: "Suicide Risk Screening and Observation Levels" },
  { id: "trauma-informed", title: "Trauma-Informed Care in Acute Interactions" },
  { id: "medication-safety", title: "Medication Safety and High-Risk Alerts" },
  { id: "workplace-violence", title: "Workplace Violence Prevention and Staff Safety" },
  { id: "legal-rights-consent", title: "Legal Holds, Patient Rights, and Consent Boundaries" },
];

const MODULE_IDS = new Set(MODULE_LIBRARY.map((item) => item.id));

let roleConfigs = [];
let editingRoleId = null;
let pendingPinAction = null; // Track what action needs PIN authentication

const ADMIN_PIN_KEY = (slug) => `nyxAdminPin_${slug}`;

const API_BASE =
  localStorage.getItem("nyxApiBase") ||
  window.NYX_API_BASE ||
  "";

const REQUIRE_LOGIN = localStorage.getItem("nyxRequireLogin") !== "false";

const ORG_SLUG =
  localStorage.getItem("nyxOrgSlug") ||
  window.NYX_ORG_SLUG ||
  "destiny-springs-healthcare";

function getAuthToken() {
  return localStorage.getItem("nyxAuthToken") || "";
}

function buildAuthHeaders(extraHeaders = {}) {
  const token = getAuthToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extraHeaders,
  };
}

function clearSessionAndRedirect() {
  const hadToken = Boolean(localStorage.getItem("nyxAuthToken"));
  localStorage.removeItem("nyxAuthToken");
  localStorage.removeItem("nyxUserRole");
  localStorage.removeItem("nyxLearnerEmail");
  localStorage.removeItem("nyxLearnerName");

  if (REQUIRE_LOGIN || hadToken) {
    window.location.href = "../login.html";
    return;
  }

  showToast("Session cleared. Continuing in standalone mode.", "info", 2500);
}

function requireAuthenticatedSession() {
  if (!REQUIRE_LOGIN) return true;
  if (getAuthToken()) return true;
  window.location.href = "../login.html?session=required";
  return false;
}

async function apiRequest(path, options = {}) {
  if (!API_BASE) return null;

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method || "GET",
      headers: buildAuthHeaders(options.headers || {}),
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 401) {
      clearSessionAndRedirect();
      return null;
    }

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

function getLearnerIdentity() {
  const cachedEmail = localStorage.getItem("nyxLearnerEmail");
  const cachedName = localStorage.getItem("nyxLearnerName");

  const email = cachedEmail || `learner-${crypto.randomUUID().slice(0, 8)}@example.local`;
  const name = cachedName || "Training Learner";

  localStorage.setItem("nyxLearnerEmail", email);
  localStorage.setItem("nyxLearnerName", name);

  return { email, name };
}

async function startBackendAttempt() {
  const identity = getLearnerIdentity();
  state.learnerEmail = identity.email;
  state.learnerName = identity.name;

  const payload = {
    organizationSlug: ORG_SLUG,
    courseCode: "SE-COC-ANNUAL",
    courseVersion: "2026.1",
    learnerEmail: identity.email,
    learnerName: identity.name,
    roleTrack: getCurrentRoleName(),
  };

  const result = await apiRequest("/api/training/start", {
    method: "POST",
    body: payload,
  });

  if (result?.attemptId) {
    state.attemptId = result.attemptId;
  }
}

async function pushEventToBackend(verb, detail) {
  if (!state.attemptId) return;

  await apiRequest("/api/training/event", {
    method: "POST",
    body: {
      attemptId: state.attemptId,
      verb,
      payload: {
        detail,
        score: state.score,
        roleTrack: getCurrentRoleName(),
        rolePersona: getCurrentRolePersona(),
        timestamp: new Date().toISOString(),
      },
    },
  });
}

const roleLabels = {
  clinical: "Clinical Staff",
  nonclinical: "Non-Clinical Staff",
  leadership: "Leaders and Supervisors",
};

function slugifyRoleId(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 42);
}

function loadRoleConfigs() {
  const raw = localStorage.getItem(ROLE_CONFIG_KEY);
  if (!raw) return [...defaultRoleConfigs];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [...defaultRoleConfigs];
    return parsed
      .filter((item) => item?.id && item?.name && item?.persona)
      .map((item) => {
        const enabledModules = Array.isArray(item.enabledModules)
          ? item.enabledModules.filter((id) => MODULE_IDS.has(id))
          : [];

        return {
          ...item,
          enabledModules:
            enabledModules.length > 0
              ? enabledModules
              : MODULE_LIBRARY.map((module) => module.id),
        };
      });
  } catch {
    return [...defaultRoleConfigs];
  }
}

function syncLocalRoleCache() {
  localStorage.setItem(ROLE_CONFIG_KEY, JSON.stringify(roleConfigs));
}

function saveRoleConfigs() {
  localStorage.setItem(ROLE_CONFIG_KEY, JSON.stringify(roleConfigs));
}

async function loadRoleConfigsFromBackend() {
  const existingById = new Map((roleConfigs || []).map((item) => [item.id, item]));
  const rows = await apiRequest(`/api/training/public/roles/${ORG_SLUG}`);
  if (!Array.isArray(rows) || rows.length === 0) {
    return false;
  }

  roleConfigs = rows.map((item) => ({
    id: item.id,
    name: item.name,
    persona: item.persona,
    departments: Array.isArray(item.departments) ? item.departments : [],
    enabledModules:
      existingById.get(item.id)?.enabledModules?.filter((id) => MODULE_IDS.has(id)) ||
      MODULE_LIBRARY.map((module) => module.id),
  }));
  syncLocalRoleCache();
  return true;
}

async function upsertRoleToBackend(payload) {
  return apiRequest(`/api/training/public/roles/${ORG_SLUG}`, {
    method: "POST",
    body: payload,
  });
}

async function deleteRoleFromBackend(roleId) {
  if (!API_BASE) return false;
  try {
    const response = await fetch(`${API_BASE}/api/training/public/roles/${ORG_SLUG}/${roleId}`, {
      method: "DELETE",
      headers: buildAuthHeaders(),
    });
    if (response.status === 401) {
      clearSessionAndRedirect();
      return false;
    }
    return response.ok;
  } catch {
    return false;
  }
}

// PIN Management Functions
function getAdminPin() {
  return localStorage.getItem(ADMIN_PIN_KEY(ORG_SLUG)) || null;
}

function setAdminPin(pin) {
  if (!pin || pin.trim() === "") {
    localStorage.removeItem(ADMIN_PIN_KEY(ORG_SLUG));
    return true;
  }
  
  const pinStr = String(pin).trim();
  if (!/^\d{4,6}$/.test(pinStr)) {
    return false;
  }
  
  localStorage.setItem(ADMIN_PIN_KEY(ORG_SLUG), pinStr);
  return true;
}

function validatePin(pin) {
  const storedPin = getAdminPin();
  if (!storedPin) return true; // No PIN required
  return String(pin).trim() === storedPin;
}

function requiresPinAuth() {
  return getAdminPin() !== null;
}

function showPinPrompt(action, roleId = null) {
  pendingPinAction = { action, roleId };
  const pinPromptModal = document.getElementById("pinPromptModal");
  const pinPromptInput = document.getElementById("pinPromptInput");
  const pinPromptError = document.getElementById("pinPromptError");
  
  pinPromptError.textContent = "";
  pinPromptInput.value = "";
  pinPromptInput.focus();
  pinPromptModal.classList.remove("hidden");
}

function hidePinPrompt() {
  const pinPromptModal = document.getElementById("pinPromptModal");
  pinPromptModal.classList.add("hidden");
  pendingPinAction = null;
}

function getCurrentRoleConfig() {
  return roleConfigs.find((item) => item.id === state.role) || roleConfigs[0] || defaultRoleConfigs[0];
}

function getCurrentRoleName() {
  return getCurrentRoleConfig().name;
}

function getCurrentRolePersona() {
  return getCurrentRoleConfig().persona;
}

function getCurrentRoleDepartments() {
  return getCurrentRoleConfig().departments || [];
}

function getCurrentRoleEnabledModules() {
  const selected = getCurrentRoleConfig().enabledModules || [];
  return selected.length > 0
    ? selected.filter((id) => MODULE_IDS.has(id))
    : MODULE_LIBRARY.map((module) => module.id);
}

// ============ FUN FEATURES SYSTEM ============

// Sound Effects
function initSound() {
  const stored = localStorage.getItem(SOUND_KEY);
  state.soundEnabled = stored !== null ? stored === "true" : true;
  updateSoundToggle();
}

function toggleSound() {
  state.soundEnabled = !state.soundEnabled;
  localStorage.setItem(SOUND_KEY, String(state.soundEnabled));
  updateSoundToggle();
}

function initBrandMode() {
  const stored = localStorage.getItem(BRAND_MODE_KEY);
  state.brandMode = stored === "clean" ? "clean" : "luxury";
  applyBrandMode();
}

function toggleBrandMode() {
  state.brandMode = state.brandMode === "luxury" ? "clean" : "luxury";
  localStorage.setItem(BRAND_MODE_KEY, state.brandMode);
  applyBrandMode();
  showToast(
    state.brandMode === "luxury"
      ? "Brand mode: Luxury Presentation"
      : "Brand mode: Clinical Clean",
    "info",
    2200,
  );
}

function applyBrandMode() {
  document.body.classList.toggle("mode-clean", state.brandMode === "clean");
  const btn = document.getElementById("brandModeToggleBtn");
  if (!btn) return;
  const svg = btn.querySelector("svg");
  const label = btn.querySelector(".icon-label");
  if (state.brandMode === "luxury") {
    // Sun icon for luxury
    svg.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
    label.textContent = "Luxury";
  } else {
    // Minimize icon for clean
    svg.innerHTML = '<line x1="5" y1="12" x2="19" y2="12"></line>';
    label.textContent = "Clean";
  }
}

function updateSoundToggle() {
  const btn = document.getElementById("soundToggleBtn");
  if (!btn) return;
  const svg = btn.querySelector("svg");
  const label = btn.querySelector(".icon-label");
  if (state.soundEnabled) {
    // Speaker with waves - sound on
    svg.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a6.5 6.5 0 0 1 0 9.07"></path><path d="M19.07 4.93a10.5 10.5 0 0 1 0 14.14"></path>';
    label.textContent = "Sound";
  } else {
    // Speaker muted - sound off
    svg.innerHTML = '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line>';
    label.textContent = "Mute";
  }
}

function playSound(type) {
  if (!state.soundEnabled) return;
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  
  osc.connect(gain);
  gain.connect(audioContext.destination);
  
  if (type === "correct") {
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.setValueAtTime(1000, now + 0.1);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.setValueAtTime(0, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.15);
  } else if (type === "incorrect") {
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.setValueAtTime(300, now + 0.15);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.setValueAtTime(0, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  } else if (type === "streak") {
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.setValueAtTime(800, now + 0.05);
    osc.frequency.setValueAtTime(1000, now + 0.1);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.setValueAtTime(0, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.15);
  } else if (type === "badge") {
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.setValueAtTime(1400, now + 0.1);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.setValueAtTime(0, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.2);
  }
}

// Toast Notifications
function showToast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = "slideInRight 300ms ease reverse";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function getSeasonalThemeMessage() {
  const month = new Date().getMonth();
  return seasonalThemes[month] || "Monthly Spotlight: Keep standards visible.";
}

function renderSeasonalTheme() {
  const seasonalTheme = document.getElementById("seasonalTheme");
  if (!seasonalTheme) return;
  seasonalTheme.textContent = getSeasonalThemeMessage();
}

function maybeGoldenFeedback(good) {
  if (!good) return "";
  if (Math.random() > 0.05) return "";
  state.badges.add("Golden Moment");
  return "Golden line: That answer belongs in the training hall of fame.";
}

function handleComebackIfNeeded(good) {
  if (!good) {
    state.missStreak += 1;
    return;
  }
  if (state.missStreak >= 2) {
    state.badges.add("Comeback Kid");
    showToast("Comeback unlocked. Strong recovery.", "success", 3200);
    celebrateBadge("Comeback Kid");
  }
  state.missStreak = 0;
}

function renderMysteryBadges() {
  const row = document.getElementById("mysteryBadgeRow");
  if (!row) return;
  row.innerHTML = "";
  mysteryBadgeCatalog.forEach((item) => {
    const pill = document.createElement("span");
    const unlocked = state.badges.has(item.key);
    pill.className = `mystery-badge ${unlocked ? "unlocked" : ""}`;
    pill.textContent = unlocked ? `Mystery Unlocked: ${item.key}` : `Mystery: ??? (${item.hint})`;
    row.appendChild(pill);
  });
}

function getPersonalityRecap() {
  const entries = [
    { key: "calm", label: "Calm Communicator", value: state.personality.calm },
    { key: "precision", label: "Precision Thinker", value: state.personality.precision },
    { key: "courage", label: "Courageous Escalator", value: state.personality.courage },
  ].sort((a, b) => b.value - a.value);

  const top = entries.slice(0, 2).map((entry) => entry.label).join(" | ");
  return top || "Reliable Team Contributor";
}

// Points Popup Animation
function showPointsPopup(element, points) {
  if (points === 0) return;
  const container = document.getElementById("pointsPopupContainer");
  const popup = document.createElement("div");
  popup.className = "points-popup";
  popup.textContent = `+${points}`;
  
  const rect = element.getBoundingClientRect();
  popup.style.left = (rect.left + rect.width / 2 - 20) + "px";
  popup.style.top = (rect.top + rect.height / 2) + "px";
  
  container.appendChild(popup);
  setTimeout(() => popup.remove(), 1200);
}

// Badge Unlock Celebration
function celebrateBadge(badgeName) {
  playSound("badge");
  showToast(`🎉 Badge Unlocked: ${badgeName}`, "badge", 4000);
  confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
}

// Confetti Burst
function celebrateCompletion() {
  playSound("badge");
  confetti({
    particleCount: 200,
    spread: 100,
    origin: { y: 0.5 },
    colors: ["#f1d19a", "#99e1d9", "#ff8d8d"],
  });
}

// Learner Profile Update
function updateLearnerProfile() {
  const profile = document.getElementById("learnerProfile");
  const name = document.getElementById("learnerName");
  const stats = document.getElementById("learnerStats");
  
  name.textContent = state.learnerName || "Training Learner";
  stats.textContent = `Score: ${state.score} | Streak: ${state.streak}${state.bonusScenarioUnlocked ? " | 🎯 Bonus Unlocked" : ""}`;
  profile.classList.remove("hidden");
}

// Role-Specific Humor Database
const rolesSpecificHumor = {
  clinical: {
    good: [
      "RN-approved decision right there!",
      "Your shift report would make the charge nurse proud.",
      "That's the kind of care coordination we dream of.",
      "Your bedside manner just improved patient outcomes.",
    ],
    incorrect: [
      "Hmm, that's not in the playbook for psych acute care.",
      "Even the documentation would question that one.",
      "Your patient chart just raised an eyebrow.",
      "That wouldn't pass the safety huddle.",
    ],
  },
  nonclinical: {
    good: [
      "Front desk excellence right there!",
      "Your caller would give you 5 stars.",
      "That's how you build patient family trust instantly.",
      "Admin team would high-five you for that.",
    ],
    incorrect: [
      "That caller's experience would suffer.",
      "HR would want to chat about that approach.",
      "Your efficiency just became risky.",
      "That's the kind of thing compliance catches.",
    ],
  },
  leadership: {
    good: [
      "That's the leadership behavior we coach on.",
      "Your team would feel accountable and empowered.",
      "Culture change starts with decisions like that.",
      "Your rounding notes would praise that call.",
    ],
    incorrect: [
      "That doesn't set the accountability standard.",
      "Your team is watching this decision.",
      "That's the pattern we coach away from.",
      "This is a teaching moment you might miss.",
    ],
  },
};

function getRoleHumor(good) {
  const persona = getCurrentRolePersona();
  const options = rolesSpecificHumor[persona]?.[good ? "good" : "incorrect"] || [];
  return options.length > 0 ? options[Math.floor(Math.random() * options.length)] : "";
}

// Personalized Encouragement
function getPersonalizedMessage(struggling) {
  if (struggling) {
    const messages = [
      "You've got this! Take a breath and try again.",
      "One more attempt, I believe in you.",
      "Every mistake is a learning moment. Go again!",
      "Difficulty doesn't mean failure. Try once more.",
      "You're closer than you think. Give it another shot.",
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  } else {
    const messages = [
      "Wow, you're on fire! 🔥",
      "Perfect execution. Keep it up!",
      "You're crushing this challenge.",
      "Excellence in action right there.",
      "Your training is paying off big time.",
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }
}

// Easter Eggs
const easterEggs = [
  {
    description: "Choose something completely unreasonable",
    trigger: (choice) => choice.score === 0 && Math.random() < 0.15,
    response: "Nice try, but Destiny Springs isn't ready for that level of creativity. 😄",
  },
];

// Secret Bonus Scenario
const bonusScenario = {
  title: "Secret Bonus: Rights Under Pressure",
  category: "Challenge - Legal and Safety Balance",
  roles: ["clinical", "nonclinical", "leadership"],
  prompt: "A patient on legal hold refuses medication, is escalating, and asks for rights information immediately. Best first move?",
  choices: [
    { text: "Initiate immediate safety support, explain rights in plain language, and escalate per legal-hold protocol.", score: 20, good: true, feedback: "Excellent. This protects safety while honoring rights and legal process." },
    { text: "Delay rights discussion until behavior fully settles to avoid disruption.", score: 8, good: false, feedback: "Delaying core rights communication can increase legal and trust risk." },
    { text: "Document refusal only and leave legal clarification to next shift.", score: 2, good: false, feedback: "Ownership and timely escalation are required now, not later." },
  ],
};

const roleLessonIntros = {
  clinical:
    "Clinical focus: apply these standards at point of care, in handoffs, and during high-acuity patient interactions.",
  nonclinical:
    "Non-clinical focus: apply these standards in access, communication, privacy handling, and patient-family support touchpoints.",
  leadership:
    "Leadership focus: model standards visibly, coach teams in real time, and escalate concerns with accountability.",
};

const roleDepartmentSpotlights = {
  clinical: [
    {
      title: "Suicide Risk Screening Example",
      points: [
        "Use direct risk questions and document verbatim statements indicating self-harm concern.",
        "Assign and communicate observation level using read-back before handoff.",
      ],
    },
    {
      title: "Trauma-Informed Interaction Example",
      points: [
        "Explain procedures before touch or movement to reduce perceived threat.",
        "Offer bounded choices where safe to maintain patient agency.",
      ],
    },
    {
      title: "Medication Alert Example",
      points: [
        "On high-risk alerts, stop administration and verify identifiers, allergies, and active orders.",
        "Escalate reconciliation discrepancies immediately with prescriber and pharmacy.",
      ],
    },
    {
      title: "Workplace Safety Example",
      points: [
        "At first threat indicator, position for safety and activate team response pathway.",
        "Avoid solo confrontation in escalating environments.",
      ],
    },
    {
      title: "Legal Hold and Consent Example",
      points: [
        "Confirm hold status and communicate rights in plain language during care.",
        "Document legal rationale for urgent non-consent interventions.",
      ],
    },
  ],
  nonclinical: [
    {
      title: "Suicide-Risk Escalation Example",
      points: [
        "If a caller or visitor reports self-harm concern, route to immediate safety pathway.",
        "Do not defer high-risk language to routine queue processing.",
      ],
    },
    {
      title: "Trauma-Informed Frontline Example",
      points: [
        "Use calm language and explain what will happen next in simple, predictable steps.",
        "Offer safe choices like seating location or callback timing when possible.",
      ],
    },
    {
      title: "Medication Communication Example",
      points: [
        "Route medication concern flags immediately to licensed clinical team.",
        "Capture exact concern details in handoff note without interpretation.",
      ],
    },
    {
      title: "Workplace Threat Reporting Example",
      points: [
        "Treat verbal threats as reportable safety events before physical escalation occurs.",
        "Use the established internal emergency contact flow immediately.",
      ],
    },
    {
      title: "Rights and Consent Routing Example",
      points: [
        "If rights questions arise on hold status, connect the patient/family to the designated rights process promptly.",
        "Document who was contacted and when to maintain legal traceability.",
      ],
    },
  ],
  leadership: [
    {
      title: "Suicide-Risk Governance Example",
      points: [
        "Audit observation-level consistency and near-miss reporting frequency.",
        "Coach immediate escalation behavior for any self-harm cues.",
      ],
    },
    {
      title: "Trauma-Informed Leadership Example",
      points: [
        "Model language that stabilizes rather than controls during acute moments.",
        "Measure team adherence to transparent next-step communication.",
      ],
    },
    {
      title: "Medication Safety Oversight",
      points: [
        "Track high-risk alert response times and reconciliation closure reliability.",
        "Escalate repeated override patterns as safety events.",
      ],
    },
    {
      title: "Violence Prevention Leadership Example",
      points: [
        "Run regular workplace-threat drills and post-event debriefs.",
        "Require objective reporting for all threat indicators, not only physical incidents.",
      ],
    },
    {
      title: "Legal Rights and Consent Governance",
      points: [
        "Verify rights communications are documented and understandable to patients/families.",
        "Ensure emergency-consent decisions include clear legal and clinical rationale.",
      ],
    },
  ],
};

const TRAINING_CATEGORIES = {
  communication: {
    label: "Trauma-Informed Care in Acute Interactions",
    retryModule: "Revisit Lesson 2 and trauma-informed scenarios for language and choice framing.",
  },
  conduct: {
    label: "Legal Holds, Patient Rights, and Consent Boundaries",
    retryModule: "Review Lesson 5 and legal-rights scenarios for hold status and consent boundaries.",
  },
  privacy: {
    label: "Medication Safety and High-Risk Alerts",
    retryModule: "Repeat Lesson 3 and medication-alert scenarios focused on verification and escalation.",
  },
  reporting: {
    label: "Workplace Violence Prevention and Staff Safety",
    retryModule: "Re-run Lesson 4 and workplace-violence prompts to practice protective escalation.",
  },
  safety: {
    label: "Suicide Risk Screening and Observation Levels",
    retryModule: "Revisit Lesson 1 and suicide-risk scenarios to reinforce screening and observation assignment.",
  },
  abuseNeglect: {
    label: "Critical Safety Escalation",
    retryModule: "Repeat high-risk escalation scenarios to strengthen urgent safety decision-making.",
  },
  knowledgeCheck: {
    label: "Knowledge Check Mastery",
    retryModule: "Retry assessment-prep items in weak domains before reattempting final assessment.",
  },
};

const ROLE_MASTERY_THRESHOLDS = {
  clinical: {
    abuseNeglect: 85,
  },
  nonclinical: {
    abuseNeglect: 80,
  },
  leadership: {
    abuseNeglect: 90,
  },
};

const roleFeedbackSnippets = {
  clinical: {
    communication: {
      good: "Clinical lens: you prioritized emotional safety before operational details, which lowers escalation risk.",
      bad: "Clinical lens: start with emotional containment, then align on concrete care next steps.",
    },
    conduct: {
      good: "Clinical lens: this protects team culture and patient dignity under pressure.",
      bad: "Clinical lens: unresolved conduct drift usually shows up as care reliability drift.",
    },
    privacy: {
      good: "Clinical lens: minimum-necessary sharing protects therapeutic trust.",
      bad: "Clinical lens: privacy misses can break patient engagement and continuity.",
    },
    reporting: {
      good: "Clinical lens: factual escalation protects patients and supports rapid correction.",
      bad: "Clinical lens: delay can compound clinical and legal exposure.",
    },
    safety: {
      good: "Clinical lens: closed-loop handoffs are critical in psychiatric acute care transitions.",
      bad: "Clinical lens: handoff ambiguity is a top preventable safety risk.",
    },
    abuseNeglect: {
      good: "Clinical lens: immediate safety check plus reporting is the correct protective sequence.",
      bad: "Clinical lens: critical-safety concerns require urgent documentation and escalation.",
    },
    knowledgeCheck: {
      good: "Clinical lens: solid retention of high-risk decision points.",
      bad: "Clinical lens: review the rationale, then reattempt with policy-first framing.",
    },
  },
  nonclinical: {
    communication: {
      good: "Access-point lens: you protected trust while keeping workflow clear.",
      bad: "Access-point lens: acknowledge first, then provide a concrete next update.",
    },
    conduct: {
      good: "Access-point lens: consistent professionalism sets the tone for the entire facility.",
      bad: "Access-point lens: informal workarounds create avoidable compliance and trust risk.",
    },
    privacy: {
      good: "Access-point lens: verifying authorization before disclosure is exactly right.",
      bad: "Access-point lens: caller urgency does not replace authorization checks.",
    },
    reporting: {
      good: "Access-point lens: documenting facts protects teams and patients.",
      bad: "Access-point lens: waiting for someone else to report can delay critical action.",
    },
    safety: {
      good: "Access-point lens: complete transfers prevent downstream confusion and delay.",
      bad: "Access-point lens: partial handoffs can produce major safety misses.",
    },
    abuseNeglect: {
      good: "Access-point lens: your response balanced immediate support with proper escalation.",
      bad: "Access-point lens: critical-safety concerns must never stay informal or undocumented.",
    },
    knowledgeCheck: {
      good: "Access-point lens: strong recall across policy and communication expectations.",
      bad: "Access-point lens: use policy anchors, then select the most protective action.",
    },
  },
  leadership: {
    communication: {
      good: "Leadership lens: this models calm, accountable communication for the team.",
      bad: "Leadership lens: teams mirror your first response under pressure.",
    },
    conduct: {
      good: "Leadership lens: consistent enforcement is culture-building behavior.",
      bad: "Leadership lens: selective enforcement weakens accountability standards.",
    },
    privacy: {
      good: "Leadership lens: this decision reinforces privacy as an operational discipline.",
      bad: "Leadership lens: privacy inconsistency erodes trust and regulatory posture.",
    },
    reporting: {
      good: "Leadership lens: transparent escalation signals non-retaliation in practice.",
      bad: "Leadership lens: suppressing reportable concerns multiplies risk.",
    },
    safety: {
      good: "Leadership lens: read-back expectations improve reliability across shifts.",
      bad: "Leadership lens: unmanaged handoff gaps become repeatable system defects.",
    },
    abuseNeglect: {
      good: "Leadership lens: this protects vulnerable patients and sets a clear reporting standard.",
      bad: "Leadership lens: delayed action on critical-safety concerns is unacceptable risk.",
    },
    knowledgeCheck: {
      good: "Leadership lens: strong decision consistency across governance topics.",
      bad: "Leadership lens: revisit weak domains before re-engaging the assessment.",
    },
  },
};

const adaptiveHintBank = {
  communication: "Hint: Lead with acknowledgment first, then give one concrete next step and timing.",
  conduct: "Hint: Choose the action that is transparent, respectful, and formally accountable.",
  privacy: "Hint: Ask who is authorized, what is necessary, and where the conversation should occur.",
  reporting: "Hint: If facts suggest risk, document and escalate now, not later.",
  safety: "Hint: Look for read-back, risk confirmation, and explicit task ownership.",
  abuseNeglect: "Hint: Prioritize immediate safety, factual documentation, and urgent escalation pathways.",
  knowledgeCheck: "Hint: Select the option that protects people first and aligns with policy under pressure.",
};

function createCategoryStats() {
  return Object.fromEntries(
    Object.entries(TRAINING_CATEGORIES).map(([key, cfg]) => [
      key,
      { label: cfg.label, attempts: 0, correct: 0 },
    ])
  );
}

function trackCategoryResult(categoryKey, correct) {
  const key = categoryKey || "knowledgeCheck";
  const entry = state.categoryStats[key];
  if (!entry) return;
  entry.attempts += 1;
  if (correct) entry.correct += 1;
}

function getRoleSpecificSnippet(categoryKey, correct) {
  const persona = getCurrentRolePersona();
  const personaSnippets = roleFeedbackSnippets[persona] || roleFeedbackSnippets.clinical;
  const domainSnippets = personaSnippets[categoryKey] || personaSnippets.knowledgeCheck;
  return correct ? domainSnippets.good : domainSnippets.bad;
}

function getAdaptiveHint(categoryKey) {
  if (state.missStreak < 2) return "";
  return adaptiveHintBank[categoryKey] || adaptiveHintBank.knowledgeCheck;
}

function setFeedbackNode(node, message, className) {
  if (!node) return;
  if (!message) {
    node.className = "feedback hidden";
    node.textContent = "";
    return;
  }
  node.textContent = message;
  node.className = `feedback ${className}`;
}

function getCategoryPercent(categoryKey) {
  const entry = state.categoryStats[categoryKey];
  if (!entry || entry.attempts === 0) return null;
  return Math.round((entry.correct / entry.attempts) * 100);
}

function getRoleMasteryThreshold(categoryKey) {
  const persona = getCurrentRolePersona();
  return ROLE_MASTERY_THRESHOLDS[persona]?.[categoryKey] || 80;
}

function getRoleMasteryRequirementText(categoryKey) {
  const cfg = TRAINING_CATEGORIES[categoryKey];
  const threshold = getRoleMasteryThreshold(categoryKey);
  return `${cfg?.label || categoryKey} mastery target: ${threshold}% for ${getCurrentRoleName()}.`;
}

function getRetryRecommendations() {
  const weak = Object.entries(state.categoryStats)
    .filter(([, stats]) => stats.attempts >= 2)
    .map(([key, stats]) => ({
      key,
      pct: Math.round((stats.correct / stats.attempts) * 100),
      attempts: stats.attempts,
      requiredPct: getRoleMasteryThreshold(key),
    }))
    .filter((item) => item.pct < item.requiredPct)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3)
    .map((item) => {
      const cfg = TRAINING_CATEGORIES[item.key];
      return {
        key: item.key,
        label: cfg?.label || item.key,
        pct: item.pct,
        requiredPct: item.requiredPct,
        module: cfg?.retryModule || "Review recent misses and retry this domain.",
      };
    });

  state.retryRecommendations = weak;
  return weak;
}

function buildNextStepGuidance(pass, assessmentPct, recommendations) {
  const roleName = getCurrentRoleName();
  const abuseNeglectThreshold = getRoleMasteryThreshold("abuseNeglect");
  const abuseNeglectPct = getCategoryPercent("abuseNeglect");
  const abuseNeglectClause = abuseNeglectPct === null
    ? `Complete critical-safety practice items to establish the ${abuseNeglectThreshold}% mastery target.`
    : `Critical-safety mastery finished at ${abuseNeglectPct}% against a ${abuseNeglectThreshold}% target.`;

  if (pass && recommendations.length === 0) {
    return `${roleName}: strong completion. ${abuseNeglectClause} Next step is a quarterly 10-minute refresh focused on suicide risk, violence prevention, and legal-rights consistency.`;
  }
  if (pass && recommendations.length > 0) {
    return `${roleName}: you passed, and targeted reinforcement is recommended in ${recommendations.map((item) => item.label).join(", ")}. ${abuseNeglectClause} Re-run those modules this week for stronger retention.`;
  }
  return `${roleName}: assessment at ${assessmentPct}%. ${abuseNeglectClause} Complete recommended retry modules, then reattempt the full assessment with focus on policy-first escalation decisions.`;
}

const coreLessons = [
  {
    moduleId: "suicide-observation",
    spotlightIndex: 0,
    title: "Lesson 1: Suicide Risk Screening and Observation Levels",
    body: "Suicide-risk prevention depends on rapid screening, clear risk language, and accurate observation-level assignment. Small misses in documentation or handoff can create major safety exposure.",
    check: "A patient states, 'I don't want to wake up tomorrow.' What is the strongest immediate response?",
    answers: [
      { text: "Initiate structured suicide-risk screening now, secure immediate safety, and notify licensed clinical leadership.", good: true, score: 8 },
      { text: "Reassure the patient and continue routine workflow unless behavior escalates.", good: false, score: 2 },
      { text: "Document the comment for next shift to evaluate later.", good: false, score: 1 },
    ],
    why: "Immediate screening plus protective escalation is the safest and policy-aligned sequence.",
    categoryKey: "safety",
    recap: "Checkpoint: suicide-risk response requires immediate screening, safety action, and observation-level clarity.",
  },
  {
    moduleId: "trauma-informed",
    spotlightIndex: 1,
    title: "Lesson 2: Trauma-Informed Care in Acute Interactions",
    body: "Trauma-informed care means avoiding coercive language, offering safe choices, and explaining what happens next. Even brief interactions can either stabilize or re-trigger a patient.",
    check: "A patient becomes guarded during intake and says, 'No one listens anyway.' Best first response?",
    answers: [
      { text: "Acknowledge their experience, offer two safe next-step choices, and explain the immediate care plan clearly.", good: true, score: 8 },
      { text: "Use direct commands to keep the process moving quickly.", good: false, score: 2 },
      { text: "Pause the conversation until the patient appears fully cooperative.", good: false, score: 1 },
    ],
    why: "Validation and structured choice reduce escalation and strengthen therapeutic trust.",
    categoryKey: "communication",
    recap: "Checkpoint: trauma-informed care = validate, offer safe choices, and orient to next steps.",
  },
  {
    moduleId: "medication-safety",
    spotlightIndex: 2,
    title: "Lesson 3: Medication Safety and High-Risk Alerts",
    body: "Medication safety requires verification discipline, reconciliation awareness, and immediate response to high-risk alerts. Assumptions around prior orders and verbal shortcuts increase harm risk.",
    check: "An order appears inconsistent with current status and triggers a high-risk alert. What should you do first?",
    answers: [
      { text: "Hold administration, verify identifiers/order details, and escalate through medication safety workflow immediately.", good: true, score: 8 },
      { text: "Proceed if the order resembles previous dosing patterns for this patient.", good: false, score: 2 },
      { text: "Administer now and file a clarification note after rounds.", good: false, score: 1 },
    ],
    why: "Alert-triggered discrepancies require stop-verify-escalate behavior before administration.",
    categoryKey: "privacy",
    recap: "Checkpoint: high-risk med alerts demand immediate verification and escalation, not deferred cleanup.",
  },
  {
    moduleId: "workplace-violence",
    spotlightIndex: 3,
    title: "Lesson 4: Workplace Violence Prevention and Staff Safety",
    body: "Violence prevention relies on early indicator recognition, team positioning, and rapid activation of protective response plans. Delay often increases risk for staff and patients.",
    check: "A visitor begins pacing, clenching fists, and making escalating threats at the desk. Best immediate action?",
    answers: [
      { text: "Activate threat-response protocol, request support, create safety distance, and use calm directive language.", good: true, score: 8 },
      { text: "Continue normal workflow while monitoring to avoid provoking the visitor.", good: false, score: 2 },
      { text: "Confront the visitor alone to resolve the issue quickly.", good: false, score: 1 },
    ],
    why: "Early coordinated protective action lowers injury risk and restores control faster.",
    categoryKey: "reporting",
    recap: "Checkpoint: workplace violence prevention requires early activation, safe positioning, and team escalation.",
  },
  {
    moduleId: "legal-rights-consent",
    spotlightIndex: 4,
    title: "Lesson 5: Legal Holds, Patient Rights, and Consent Boundaries",
    body: "Legal status determines what can and cannot be done without consent. Teams must communicate rights clearly, document legal basis accurately, and avoid overreach in urgent situations.",
    check: "Which action best aligns with legal-hold and consent-boundary expectations?",
    answers: [
      { text: "Confirm legal status, explain rights in plain language, and document rationale for any non-consent intervention.", good: true, score: 8 },
      { text: "Use standard consent assumptions for speed during high-volume periods.", good: false, score: 2 },
      { text: "Delay rights explanation until discharge planning.", good: false, score: 1 },
    ],
    why: "Rights communication and legal-documentation accuracy protect patients and staff.",
    categoryKey: "conduct",
    recap: "Checkpoint: legal-hold care requires clear rights communication, consent boundaries, and defensible documentation.",
  },
];

const scenarios = [
  {
    title: "Scenario 1: Suicide Cue During Intake",
    category: "Suicide Risk - Initial Screening",
    roles: ["clinical", "nonclinical", "leadership"],
    prompt: "During intake, a patient says, 'I don't feel safe with myself tonight.' What is the strongest first action?",
    choices: [
      { text: "Begin structured risk screening immediately, notify clinical lead, and maintain direct observation pending plan.", score: 16, good: true, feedback: "Correct. Immediate screening and protective observation are required." },
      { text: "Offer reassurance and continue intake paperwork before escalating.", score: 6, good: false, feedback: "Reassurance alone is insufficient for active safety concerns." },
      { text: "Document concern for later team review at shift huddle.", score: 2, good: false, feedback: "Delayed review can leave immediate risk unmanaged." },
    ],
    categoryKey: "safety",
    recap: "Scenario recap: suicide cues require immediate screening, protective observation, and escalation.",
  },
  {
    title: "Scenario 2: Observation-Level Handoff",
    category: "Suicide Risk - Handoff Reliability",
    roles: ["clinical", "leadership"],
    prompt: "At shift handoff, one note says Q15 checks while another says constant observation. What is safest?",
    choices: [
      { text: "Pause transfer, reconcile observation order immediately, perform read-back, and document final level clearly.", score: 18, good: true, feedback: "Correct. Observation-level ambiguity must be resolved before handoff completes." },
      { text: "Default to Q15 until the next physician round clarifies.", score: 5, good: false, feedback: "Defaulting downward without reconciliation can create severe safety risk." },
      { text: "Send a quick message and let receiving staff decide in context.", score: 4, good: false, feedback: "One-way messaging does not satisfy high-risk transfer reliability." },
    ],
    categoryKey: "safety",
    recap: "Scenario recap: conflicting observation levels require immediate reconciliation and closed-loop handoff.",
  },
  {
    title: "Scenario 3: Trauma Trigger During Care",
    category: "Trauma-Informed Care - Communication",
    roles: ["clinical", "nonclinical", "leadership"],
    prompt: "A patient becomes visibly distressed during routine safety checks and says, 'This feels like before.' Best response?",
    choices: [
      { text: "Slow pace, validate concern, explain each next step, and offer safe choices where possible.", score: 18, good: true, feedback: "Strong trauma-informed practice that reduces retraumatization risk." },
      { text: "Insist on strict compliance first and debrief feelings later.", score: 6, good: false, feedback: "Command-first language can intensify distress and resistance." },
      { text: "Discontinue interaction until patient fully calms without support.", score: 3, good: false, feedback: "Supportive stabilization should start now, not after disengagement." },
    ],
    categoryKey: "communication",
    recap: "Scenario recap: trauma-informed response uses validation, transparency, and controlled choice.",
  },
  {
    title: "Scenario 4: Family Distress in Waiting Area",
    category: "Trauma-Informed Care - Family Interaction",
    roles: ["nonclinical", "leadership"],
    prompt: "A family member is crying and angry after receiving partial updates. What approach is best?",
    choices: [
      { text: "Acknowledge emotion first, explain what you can share now, and provide a concrete next update time.", score: 18, good: true, feedback: "Correct. Validation plus clear timing helps de-escalate and preserve trust." },
      { text: "Lead with policy limits and ask them to lower their voice before discussion.", score: 6, good: false, feedback: "Policy context matters, but empathy and regulation should come first." },
      { text: "Avoid engagement and refer them to a later complaint process.", score: 2, good: false, feedback: "Deferral can escalate distress and service breakdown." },
    ],
    categoryKey: "communication",
    recap: "Scenario recap: emotionally regulated, time-specific communication is central to trauma-informed family support.",
  },
  {
    title: "Scenario 5: High-Risk Medication Alert",
    category: "Medication Safety - Alert Response",
    roles: ["clinical", "leadership"],
    prompt: "A high-risk medication alert appears for possible duplicate therapy and renal contraindication. Best immediate action?",
    choices: [
      { text: "Pause administration, reconcile meds/labs, notify prescriber/pharmacy, and document escalation pathway.", score: 18, good: true, feedback: "Correct. Stop-verify-escalate is required before administration." },
      { text: "Proceed with dose and create a follow-up ticket for pharmacy review.", score: 4, good: false, feedback: "Administration before resolution can create preventable adverse events." },
      { text: "Hold all meds for the shift until complete chart review is finished.", score: 6, good: false, feedback: "Broad holds without targeted safety plan can create additional risk." },
    ],
    categoryKey: "privacy",
    recap: "Scenario recap: high-risk med alerts require immediate targeted reconciliation and escalation.",
  },
  {
    title: "Scenario 6: Medication Reconciliation Gap",
    category: "Medication Safety - Transition Risk",
    roles: ["clinical", "nonclinical", "leadership"],
    prompt: "On transfer, home medication list conflicts with current orders and allergy history. Strongest response?",
    choices: [
      { text: "Escalate reconciliation discrepancy immediately and verify allergies/orders before next administration.", score: 18, good: true, feedback: "Correct. Transitions are high-risk for medication error and need immediate reconciliation." },
      { text: "Use most recent order set and revisit discrepancy at next care conference.", score: 5, good: false, feedback: "Deferral can propagate errors into active medication cycles." },
      { text: "Ask patient family to choose which list seems most accurate.", score: 2, good: false, feedback: "Families are valuable sources, but clinical reconciliation requires formal verification workflow." },
    ],
    categoryKey: "privacy",
    recap: "Scenario recap: medication transitions demand formal reconciliation before administration proceeds.",
  },
  {
    title: "Scenario 7: Escalating Visitor Threat",
    category: "Workplace Violence Prevention - Immediate Protection",
    roles: ["clinical", "nonclinical", "leadership"],
    prompt: "A visitor pounds on the desk and threatens staff after being denied immediate entry. Best immediate action?",
    choices: [
      { text: "Activate violence-prevention response, create safe distance, alert security/supervisor, and keep verbal engagement controlled.", score: 20, good: true, feedback: "Correct. Early coordinated safety response protects staff and patients." },
      { text: "Continue one-on-one discussion to calm them before calling for support.", score: 6, good: false, feedback: "Solo engagement increases exposure during active threat behavior." },
      { text: "Ignore threats unless physical contact occurs.", score: 2, good: false, feedback: "Threat indicators warrant immediate protective action before assault occurs." },
    ],
    categoryKey: "reporting",
    recap: "Scenario recap: threat indicators trigger immediate protective escalation, not watchful waiting.",
  },
  {
    title: "Scenario 8: Internal Staff Threat Cue",
    category: "Workplace Violence Prevention - Team Safety",
    roles: ["leadership"],
    prompt: "A staff member reports feeling unsafe after repeated verbal intimidation from another employee. Best leadership response?",
    choices: [
      { text: "Initiate formal workplace-safety reporting path now, implement interim protections, and document objective facts.", score: 20, good: true, feedback: "Correct. Immediate documentation and protective action are required." },
      { text: "Coach both staff informally and revisit if behavior repeats.", score: 6, good: false, feedback: "Informal handling can leave risk unmanaged and undocumented." },
      { text: "Delay action until unit morale review next week.", score: 2, good: false, feedback: "Delay can expose staff to continued harm." },
    ],
    categoryKey: "reporting",
    recap: "Scenario recap: workplace-safety concerns require immediate formal escalation and interim protections.",
  },
  {
    title: "Scenario 9: Legal Hold Rights Clarification",
    category: "Legal Holds and Rights - Communication",
    roles: ["clinical", "nonclinical", "leadership"],
    prompt: "A patient on emergency hold asks why they cannot leave and requests legal rights information. Best response?",
    choices: [
      { text: "Explain hold status and rights in plain language now, provide formal rights materials, and document the exchange.", score: 20, good: true, feedback: "Correct. Timely rights communication and documentation are essential." },
      { text: "Wait for the next physician update before discussing rights details.", score: 6, good: false, feedback: "Delaying rights communication can increase legal and trust risk." },
      { text: "Tell the patient legal details are only discussed at discharge.", score: 2, good: false, feedback: "Rights communication is required during active care, not only at discharge." },
    ],
    categoryKey: "conduct",
    recap: "Scenario recap: legal-hold care requires immediate rights explanation with accurate documentation.",
  },
  {
    title: "Scenario 10: Consent Boundary Under Urgency",
    category: "Legal Holds and Consent - Critical Safety Escalation",
    roles: ["clinical", "leadership"],
    prompt: "A patient lacks decision capacity for urgent intervention, and family consent status is unclear. Strongest immediate approach?",
    choices: [
      { text: "Activate urgent legal/clinical escalation pathway, document incapacity rationale, and proceed per emergency-consent policy.", score: 20, good: true, feedback: "Correct. Critical care requires policy-backed escalation with explicit legal documentation." },
      { text: "Proceed with routine consent assumptions to avoid delaying intervention.", score: 5, good: false, feedback: "Assumptions around consent in urgent care create significant legal and safety risk." },
      { text: "Delay intervention until full family consensus is obtained.", score: 4, good: false, feedback: "Some urgent interventions require immediate action under emergency-consent rules." },
    ],
    categoryKey: "abuseNeglect",
    recap: "Scenario recap: urgent consent-boundary decisions require immediate legal-clinical escalation and clear rationale documentation.",
  },
];

const lightningQuestions = [
  {
    q: "A patient states, 'I might hurt myself tonight.' Fastest safe first move?",
    answers: [
      { text: "Immediate risk screening plus protective observation and escalation.", score: 12, good: true },
      { text: "Reassure and continue regular workflow first.", score: 3, good: false },
      { text: "Document for next shift review.", score: 2, good: false },
    ],
    why: "Immediate suicide-risk response prevents delay in protective care.",
    categoryKey: "safety",
  },
  {
    q: "High-risk med alert appears before administration. Best action?",
    answers: [
      { text: "Stop, verify, and escalate through med-safety workflow.", score: 12, good: true },
      { text: "Administer now and review alert later.", score: 2, good: false },
      { text: "Ignore if dose looks familiar.", score: 1, good: false },
    ],
    why: "Alert-triggered discrepancies require immediate verification.",
    categoryKey: "privacy",
  },
  {
    q: "Visitor threat behavior escalates at front desk. First priority?",
    answers: [
      { text: "Activate protective response and maintain safe distance with support.", score: 12, good: true },
      { text: "Handle one-on-one to avoid alarm.", score: 3, good: false },
      { text: "Wait for physical contact before escalating.", score: 1, good: false },
    ],
    why: "Early coordinated response lowers violence risk.",
    categoryKey: "reporting",
  },
  {
    q: "Patient on legal hold asks for rights explanation during escalation. Best response?",
    answers: [
      { text: "Provide rights information now in plain language while maintaining safety protocol.", score: 12, good: true },
      { text: "Delay rights explanation until behavior settles completely.", score: 4, good: false },
      { text: "Tell them rights are discussed only at discharge.", score: 2, good: false },
    ],
    why: "Legal-hold care still requires timely rights communication.",
    categoryKey: "conduct",
  },
];

const finalAssessment = [
  { q: "When a patient verbalizes suicidal intent, first priority is", a: ["Immediate structured risk screening and safety escalation", "Reassure and continue routine flow", "Document for next shift"], c: 0, k: "safety" },
  { q: "Observation level changes should be", a: ["Assumed from prior shift", "Confirmed with read-back and documented clearly", "Updated only at daily rounds"], c: 1, k: "safety" },
  { q: "Trauma-informed communication starts with", a: ["Validation and transparent next steps", "Command-first directives", "Silence until calm"], c: 0, k: "communication" },
  { q: "In acute distress, offering safe choices helps by", a: ["Reducing retraumatization and improving engagement", "Delaying care", "Replacing safety protocol"], c: 0, k: "communication" },
  { q: "A high-risk medication alert should trigger", a: ["Immediate stop-verify-escalate workflow", "Automatic override if dose is common", "Deferred review after administration"], c: 0, k: "privacy" },
  { q: "Medication reconciliation is most critical", a: ["During transitions and status changes", "Only at annual review", "Only if family requests it"], c: 0, k: "privacy" },
  { q: "Threat indicators in visitors or staff should be", a: ["Ignored until physical contact", "Escalated through protective response pathway immediately", "Managed one-on-one first"], c: 1, k: "reporting" },
  { q: "Best de-escalation posture during threat response includes", a: ["Safe distance, support activation, controlled directives", "Crowding the individual", "Confrontation without backup"], c: 0, k: "reporting" },
  { q: "Patients on legal hold still retain", a: ["No rights until discharge", "Rights that must be explained in plain language", "Only visitation rights"], c: 1, k: "conduct" },
  { q: "Consent boundaries in urgent care require", a: ["Policy-backed legal rationale and documentation", "Routine assumptions", "Family vote before action in all cases"], c: 0, k: "conduct" },
  { q: "Critical-safety events require documentation that is", a: ["Objective, time-stamped, and escalation-specific", "Narrative only", "Deferred until end of week"], c: 0, k: "abuseNeglect" },
  { q: "If legal status and treatment plan conflict, teams should", a: ["Ignore legal status in emergencies", "Escalate immediately to legal-clinical pathway", "Pause all care indefinitely"], c: 1, k: "conduct" },
  { q: "Trauma-informed care avoids", a: ["Unexplained coercive language", "Clear next-step communication", "Supportive tone"], c: 0, k: "communication" },
  { q: "A safe suicide-risk handoff includes", a: ["General impression only", "Observation level, triggers, and follow-up read-back", "Single message to charge nurse"], c: 1, k: "safety" },
  { q: "When medication data conflicts across sources, teams should", a: ["Choose the most recent quickly", "Escalate reconciliation before next administration", "Wait for discharge planner"], c: 1, k: "privacy" },
  { q: "Workplace violence prevention culture is strongest when", a: ["Threats are normalized as stress behavior", "Early reporting and protective action are expected", "Only security manages all concerns"], c: 1, k: "reporting" },
  { q: "Legal-hold rights communication should happen", a: ["Only if patient asks repeatedly", "At time of status change and as needed", "After final disposition only"], c: 1, k: "conduct" },
  { q: "Critical-safety escalation decisions should prioritize", a: ["Speed with no documentation", "Safety plus defensible policy alignment", "Optics over protocol"], c: 1, k: "abuseNeglect" },
  { q: "Trauma-informed interactions improve", a: ["Engagement, trust, and safety participation", "Only throughput speed", "Legal defense only"], c: 0, k: "communication" },
  { q: "Observation-level ambiguity at shift change should lead to", a: ["Immediate reconciliation before transfer completion", "Defaulting lower level", "Ignoring unless incident occurs"], c: 0, k: "safety" },
  { q: "High-risk medication workflow requires", a: ["Independent verification and escalation when alerts trigger", "Single-check administration", "Family verbal confirmation only"], c: 0, k: "privacy" },
  { q: "Violence-prevention response should include", a: ["Safe positioning and team coordination", "Solo confrontation", "Documentation only after event"], c: 0, k: "reporting" },
  { q: "Consent-boundary decisions are safest when", a: ["Documented with legal/clinical rationale", "Handled by memory of past cases", "Delegated without oversight"], c: 0, k: "conduct" },
  { q: "If risk is credible and urgent, the first priority is", a: ["Immediate protective action and formal escalation", "Collecting informal opinions", "Waiting for next committee"], c: 0, k: "abuseNeglect" },
  { q: "Best annual completion standard", a: ["Pass score plus acknowledgment", "Attendance only", "No tracking"], c: 0, k: "knowledgeCheck" },
];

const panels = {
  welcome: document.getElementById("welcomePanel"),
  roleConfig: document.getElementById("roleConfigPanel"),
  map: document.getElementById("mapPanel"),
  lesson: document.getElementById("lessonPanel"),
  scenario: document.getElementById("scenarioPanel"),
  lightning: document.getElementById("lightningPanel"),
  assessment: document.getElementById("assessmentPanel"),
  results: document.getElementById("resultsPanel"),
};

const roleSelect = document.getElementById("roleSelect");
const configureRolesBtn = document.getElementById("configureRolesBtn");
const roleConfigPanel = document.getElementById("roleConfigPanel");
const roleList = document.getElementById("roleList");
const roleEditorTitle = document.getElementById("roleEditorTitle");
const roleNameInput = document.getElementById("roleNameInput");
const rolePersonaSelect = document.getElementById("rolePersonaSelect");
const roleDepartmentsInput = document.getElementById("roleDepartmentsInput");
const roleModulesCheckboxes = document.getElementById("roleModulesCheckboxes");
const saveRoleBtn = document.getElementById("saveRoleBtn");
const clearRoleFormBtn = document.getElementById("clearRoleFormBtn");
const closeRoleConfigBtn = document.getElementById("closeRoleConfigBtn");
const roleConfigStatus = document.getElementById("roleConfigStatus");
const trackSummary = document.getElementById("trackSummary");
const lessonTitle = document.getElementById("lessonTitle");
const lessonProgress = document.getElementById("lessonProgress");
const lessonRail = document.getElementById("lessonRail");
const lessonProgressLabel = document.getElementById("lessonProgressLabel");
const lessonProgressFill = document.getElementById("lessonProgressFill");
const lessonRoleIntro = document.getElementById("lessonRoleIntro");
const lessonBody = document.getElementById("lessonBody");
const lessonSpotlightTitle = document.getElementById("lessonSpotlightTitle");
const lessonSpotlightList = document.getElementById("lessonSpotlightList");
const lessonCheckPrompt = document.getElementById("lessonCheckPrompt");
const lessonChoices = document.getElementById("lessonChoices");
const lessonFeedback = document.getElementById("lessonFeedback");
const lessonRecap = document.getElementById("lessonRecap");
const lessonHint = document.getElementById("lessonHint");
const retryLessonBtn = document.getElementById("retryLessonBtn");
const nextLessonBtn = document.getElementById("nextLessonBtn");
const scoreChip = document.getElementById("scoreChip");
const streakChip = document.getElementById("streakChip");
const timerChip = document.getElementById("timerChip");
const lmsChip = document.getElementById("lmsChip");
const scenarioTitle = document.getElementById("scenarioTitle");
const scenarioCategory = document.getElementById("scenarioCategory");
const scenarioPrompt = document.getElementById("scenarioPrompt");
const choiceList = document.getElementById("choiceList");
const feedbackBox = document.getElementById("feedbackBox");
const scenarioRecap = document.getElementById("scenarioRecap");
const scenarioHint = document.getElementById("scenarioHint");
const nextScenarioBtn = document.getElementById("nextScenarioBtn");
const lightningQuestion = document.getElementById("lightningQuestion");
const lightningChoices = document.getElementById("lightningChoices");
const lightningFeedback = document.getElementById("lightningFeedback");
const lightningHint = document.getElementById("lightningHint");
const finishBtn = document.getElementById("finishBtn");
const assessmentProgress = document.getElementById("assessmentProgress");
const assessmentQuestion = document.getElementById("assessmentQuestion");
const assessmentChoices = document.getElementById("assessmentChoices");
const assessmentFeedback = document.getElementById("assessmentFeedback");
const assessmentHint = document.getElementById("assessmentHint");
const nextAssessmentBtn = document.getElementById("nextAssessmentBtn");
const resultSummary = document.getElementById("resultSummary");
const badgeRow = document.getElementById("badgeRow");
const attestCheckbox = document.getElementById("attestCheckbox");
const submissionStatus = document.getElementById("submissionStatus");
const submitCompletionBtn = document.getElementById("submitCompletionBtn");
const retryModulesList = document.getElementById("retryModulesList");
const nextStepGuidance = document.getElementById("nextStepGuidance");
const dashboardBtn = document.getElementById("dashboardBtn");
const viewCertBtn = document.getElementById("viewCertBtn");

let timerHandle;

const scorm = {
  api: null,
  version: null,
  initialized: false,
};

function findApi(win, name) {
  let current = win;
  let depth = 0;
  while (current && depth < 12) {
    if (current[name]) return current[name];
    if (current.parent && current.parent !== current) {
      current = current.parent;
    } else {
      break;
    }
    depth += 1;
  }
  return null;
}

function discoverScormApi() {
  const api2004 = findApi(window, "API_1484_11") || (window.opener ? findApi(window.opener, "API_1484_11") : null);
  if (api2004) {
    scorm.api = api2004;
    scorm.version = "2004";
    return;
  }

  const api12 = findApi(window, "API") || (window.opener ? findApi(window.opener, "API") : null);
  if (api12) {
    scorm.api = api12;
    scorm.version = "1.2";
  }
}

function scormCall(method, arg1, arg2) {
  if (!scorm.api || !scorm.api[method]) return false;
  try {
    if (typeof arg2 !== "undefined") return scorm.api[method](arg1, arg2);
    if (typeof arg1 !== "undefined") return scorm.api[method](arg1);
    return scorm.api[method]();
  } catch (err) {
    return false;
  }
}

function initScorm() {
  discoverScormApi();
  if (!scorm.api) {
    lmsChip.textContent = "LMS: Standalone Mode";
    return;
  }

  const ok =
    scorm.version === "2004"
      ? scormCall("Initialize", "")
      : scormCall("LMSInitialize", "");

  scorm.initialized = ok === true || ok === "true";
  lmsChip.textContent = scorm.initialized
    ? `LMS: Connected (${scorm.version})`
    : "LMS: API Found, Init Failed";
}

function scormSetValue(key, value) {
  if (!scorm.initialized) return false;
  if (scorm.version === "2004") {
    return scormCall("SetValue", key, value);
  }
  return scormCall("LMSSetValue", key, value);
}

function scormCommit() {
  if (!scorm.initialized) return false;
  if (scorm.version === "2004") return scormCall("Commit", "");
  return scormCall("LMSCommit", "");
}

function scormTerminate() {
  if (!scorm.initialized) return false;
  if (scorm.version === "2004") return scormCall("Terminate", "");
  return scormCall("LMSFinish", "");
}

function trackEvent(verb, detail = {}) {
  const event = {
    timestamp: new Date().toISOString(),
    actor: "employee",
    roleTrack: getCurrentRoleName(),
    rolePersona: getCurrentRolePersona(),
    verb,
    score: state.score,
    detail,
  };
  state.trackingEvents.push(event);
  pushEventToBackend(verb, detail);
}

function showPanel(key) {
  Object.values(panels).forEach((p) => p.classList.add("hidden"));
  panels[key].classList.remove("hidden");
  timerChip.classList.toggle("hidden", key !== "lightning");
}

function updateHUD() {
  scoreChip.textContent = `Score: ${state.score}`;
  streakChip.textContent = `Streak: ${state.streak}`;
  timerChip.textContent = `Timer: ${state.lightningTimer}s`;
}

function buildRoleTrack() {
  const persona = getCurrentRolePersona();
  const roleName = getCurrentRoleName();
  const enabledModules = new Set(getCurrentRoleEnabledModules());
  state.activeLessons = coreLessons.filter((lesson) => enabledModules.has(lesson.moduleId));
  if (state.activeLessons.length === 0) {
    state.activeLessons = [...coreLessons];
  }
  state.activeScenarios = scenarios.filter((item) => item.roles.includes(persona));
  updateMapModuleCards(state.activeLessons.map((lesson) => lesson.moduleId));
  trackSummary.textContent = `${roleName} includes ${state.activeLessons.length} enabled modules and ${state.activeScenarios.length} tailored scenarios.`;
}

function renderRoleSelect() {
  roleSelect.innerHTML = "";
  roleConfigs.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    roleSelect.appendChild(option);
  });

  if (!roleConfigs.some((item) => item.id === state.role)) {
    state.role = roleConfigs[0]?.id || defaultRoleConfigs[0].id;
  }
  roleSelect.value = state.role;
}

function clearRoleEditor(message = "") {
  editingRoleId = null;
  roleEditorTitle.textContent = "Add New Role";
  roleNameInput.value = "";
  rolePersonaSelect.value = "clinical";
  roleDepartmentsInput.value = "";
  renderRoleModuleCheckboxes(MODULE_LIBRARY.map((item) => item.id));
  roleConfigStatus.textContent = message;
}

function renderRoleModuleCheckboxes(selectedModules) {
  if (!roleModulesCheckboxes) return;
  const selectedSet = new Set(selectedModules?.filter((id) => MODULE_IDS.has(id)) || []);
  roleModulesCheckboxes.innerHTML = "";

  MODULE_LIBRARY.forEach((module) => {
    const label = document.createElement("label");
    label.className = "choice";
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.gap = "8px";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "roleModule";
    input.value = module.id;
    input.checked = selectedSet.has(module.id);

    const text = document.createElement("span");
    text.textContent = module.title;

    label.appendChild(input);
    label.appendChild(text);
    roleModulesCheckboxes.appendChild(label);
  });
}

function getSelectedRoleModulesFromForm() {
  if (!roleModulesCheckboxes) return MODULE_LIBRARY.map((item) => item.id);
  return Array.from(roleModulesCheckboxes.querySelectorAll('input[name="roleModule"]:checked')).map((input) => input.value);
}

function updateMapModuleCards(enabledModuleIds) {
  const enabledSet = new Set(enabledModuleIds || []);
  const cards = Array.from(document.querySelectorAll("#mapPanel .module-card[data-module-id]"));

  cards.forEach((card) => {
    const moduleId = card.getAttribute("data-module-id");
    const enabled = enabledSet.has(moduleId);
    card.style.opacity = enabled ? "1" : "0.48";
    card.style.filter = enabled ? "none" : "grayscale(0.3)";
  });
}

function renderRoleList() {
  roleList.innerHTML = "";
  roleConfigs.forEach((item) => {
    const card = document.createElement("article");
    card.className = "role-item";

    const heading = document.createElement("h4");
    heading.textContent = item.name;
    card.appendChild(heading);

    const meta = document.createElement("p");
    const modules = (item.enabledModules || MODULE_LIBRARY.map((module) => module.id))
      .map((id) => MODULE_LIBRARY.find((module) => module.id === id)?.title)
      .filter(Boolean);
    meta.textContent = `Base track: ${roleLabels[item.persona]} | Departments: ${(item.departments || []).join(", ") || "None"} | Modules: ${modules.length}`;
    card.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "cta-row";

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-secondary btn-sm";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      if (requiresPinAuth()) {
        showPinPrompt("edit", item.id);
      } else {
        editingRoleId = item.id;
        roleEditorTitle.textContent = "Edit Role";
        roleNameInput.value = item.name;
        rolePersonaSelect.value = item.persona;
        roleDepartmentsInput.value = (item.departments || []).join(", ");
        renderRoleModuleCheckboxes(item.enabledModules || MODULE_LIBRARY.map((module) => module.id));
        roleConfigStatus.textContent = "Editing role. Save to apply updates.";
      }
    });
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-secondary btn-sm";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", async () => {
      if (requiresPinAuth()) {
        showPinPrompt("delete", item.id);
        return;
      }

      if (roleConfigs.length <= 1) {
        roleConfigStatus.textContent = "At least one role is required.";
        return;
      }

      const deletedOnBackend = await deleteRoleFromBackend(item.id);
      if (!deletedOnBackend && API_BASE) {
        roleConfigStatus.textContent = "Could not delete role from backend.";
        return;
      }

      roleConfigs = roleConfigs.filter((cfg) => cfg.id !== item.id);
      if (state.role === item.id) {
        state.role = roleConfigs[0].id;
      }
      saveRoleConfigs();
      renderRoleSelect();
      renderRoleList();
      buildRoleTrack();
      clearRoleEditor("Role deleted.");
    });
    actions.appendChild(deleteBtn);

    card.appendChild(actions);
    roleList.appendChild(card);
  });
}

async function upsertRoleFromForm() {
  const name = roleNameInput.value.trim();
  if (!name) {
    roleConfigStatus.textContent = "Role name is required.";
    return;
  }

  const persona = rolePersonaSelect.value;
  const departments = roleDepartmentsInput.value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const enabledModules = getSelectedRoleModulesFromForm();

  if (enabledModules.length === 0) {
    roleConfigStatus.textContent = "Select at least one training module.";
    return;
  }

  if (editingRoleId) {
    const updated = await upsertRoleToBackend({
      id: editingRoleId,
      name,
      persona,
      departments,
    });

    if (updated?.id) {
      roleConfigs = roleConfigs.map((item) =>
        item.id === editingRoleId
          ? {
              ...item,
              name: updated.name,
              persona: updated.persona,
              departments: updated.departments || [],
              enabledModules,
            }
          : item,
      );
      if (state.role === editingRoleId) state.role = editingRoleId;
      saveRoleConfigs();
      renderRoleSelect();
      renderRoleList();
      buildRoleTrack();
      clearRoleEditor("Role updated.");
    } else {
      roleConfigStatus.textContent = API_BASE
        ? "Could not update role in backend."
        : "Backend not connected. Role updates require API connection.";
    }
    return;
  }

  let id = slugifyRoleId(name) || `role-${Date.now()}`;
  let suffix = 1;
  while (roleConfigs.some((item) => item.id === id)) {
    id = `${slugifyRoleId(name)}-${suffix}`;
    suffix += 1;
  }

  const created = await upsertRoleToBackend({ name, persona, departments });
  if (created?.id) {
    roleConfigs.push({
      id: created.id,
      name: created.name,
      persona: created.persona,
      departments: Array.isArray(created.departments) ? created.departments : [],
      enabledModules,
    });
    state.role = created.id;
    saveRoleConfigs();
    renderRoleSelect();
    renderRoleList();
    buildRoleTrack();
    clearRoleEditor("Role created.");
    return;
  }

  roleConfigs.push({ id, name, persona, departments, enabledModules });
  state.role = id;
  saveRoleConfigs();
  renderRoleSelect();
  renderRoleList();
  buildRoleTrack();
  clearRoleEditor("Backend unavailable. Role saved locally for this browser.");
}

function updateLessonRail() {
  if (!lessonRail) return;
  const steps = Array.from(lessonRail.querySelectorAll(".lesson-step"));
  const lessonTotal = state.activeLessons.length || 1;
  const completedCount = state.lessonPassed.size;
  const percent = Math.round((completedCount / lessonTotal) * 100);

  steps.forEach((step, index) => {
    const key = `lesson-${index}`;
    step.classList.remove("active", "complete");
    step.textContent = String(index + 1);
    step.classList.toggle("hidden", index >= lessonTotal);

    if (state.lessonPassed.has(key)) {
      step.classList.add("complete");
      step.textContent = "✓";
    }

    if (index === state.lessonIndex && !state.lessonPassed.has(key)) {
      step.classList.add("active");
    }
  });

  if (lessonProgressLabel) {
    lessonProgressLabel.textContent = `${completedCount} of ${lessonTotal} lessons complete (${percent}%)`;
  }

  if (lessonProgressFill) {
    lessonProgressFill.style.width = `${percent}%`;
  }
}

function renderLesson() {
  const lesson = state.activeLessons[state.lessonIndex];
  if (!lesson) {
    showPanel("scenario");
    renderScenario();
    return;
  }
  const lessonKey = `lesson-${state.lessonIndex}`;
  const attempts = state.lessonAttempts[lessonKey] || 0;
  const persona = getCurrentRolePersona();
  const spotlight = roleDepartmentSpotlights[persona][lesson.spotlightIndex] || roleDepartmentSpotlights[persona][0];
  const facilityDepartments = getCurrentRoleDepartments();

  updateLessonRail();

  lessonTitle.textContent = lesson.title;
  lessonProgress.textContent = `Lesson ${state.lessonIndex + 1} of ${state.activeLessons.length}`;
  lessonRoleIntro.textContent = `${getCurrentRoleName()} - ${roleLessonIntros[persona]}`;
  lessonBody.textContent = lesson.body;
  lessonSpotlightTitle.textContent = `${spotlight.title} - Lesson Application`;
  lessonSpotlightList.innerHTML = "";
  if (facilityDepartments.length > 0) {
    const deptLine = document.createElement("li");
    deptLine.textContent = `Facility departments for this role: ${facilityDepartments.join(", ")}.`;
    lessonSpotlightList.appendChild(deptLine);
  }
  spotlight.points.forEach((point) => {
    const li = document.createElement("li");
    li.textContent = point;
    lessonSpotlightList.appendChild(li);
  });
  lessonCheckPrompt.textContent = lesson.check;
  lessonFeedback.className = "feedback hidden";
  setFeedbackNode(lessonRecap, "", "recap");
  setFeedbackNode(lessonHint, "", "hint");
  nextLessonBtn.classList.add("hidden");
  retryLessonBtn.classList.add("hidden");
  lessonChoices.innerHTML = "";

  if (attempts > 0) {
    lessonFeedback.textContent = `Previous attempts: ${attempts}. You need a correct answer to unlock the next lesson.`;
    lessonFeedback.className = "feedback warn";
  }

  lesson.answers.forEach((answer) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.textContent = answer.text;
    btn.addEventListener("click", () => evaluateLessonChoice(answer, lesson));
    lessonChoices.appendChild(btn);
  });
}

function evaluateLessonChoice(answer, lesson) {
  const lessonKey = `lesson-${state.lessonIndex}`;
  state.lessonAttempts[lessonKey] = (state.lessonAttempts[lessonKey] || 0) + 1;
  trackCategoryResult(lesson.categoryKey, answer.good);

  if (answer.good) {
    if (!state.lessonPassed.has(lessonKey)) {
      let points = answer.score;
      if (state.difficulty === "challenge") {
        points = Math.floor(points * 1.2); // 20% bonus for challenge mode
      }
      state.score += points;
      showPointsPopup(lessonCheckPrompt, points);
      playSound("correct");
      state.lessonPassed.add(lessonKey);
    }
    state.streak = state.streak + 1;
    state.personality.calm += 1;
    state.badges.add("Knowledge Builder");
    
    // Streak milestone notifications
    if (state.streak === 3) {
      showToast("🔥 3-Streak! Keep it going!", "streak");
      playSound("streak");
    } else if (state.streak === 5) {
      showToast("🔥🔥 5-Streak! Unstoppable!", "streak");
      playSound("streak");
      state.badges.add("Consistency Pro");
      celebrateBadge("Consistency Pro");
    }
  } else {
    if (state.lessonAttempts[lessonKey] > 1) {
      showToast(getPersonalizedMessage(true), "info");
    }
    state.streak = 0;
    state.perfectRun = false;
    playSound("incorrect");
  }

  handleComebackIfNeeded(answer.good);

  const humor = getRoleHumor(answer.good);
  const roleSnippet = getRoleSpecificSnippet(lesson.categoryKey, answer.good);
  const golden = maybeGoldenFeedback(answer.good);
  const feedbackText = `${answer.good ? "Correct." : "Not quite."} ${lesson.why} ${roleSnippet}${humor ? " " + humor : ""}${golden ? " " + golden : ""}`;
  lessonFeedback.textContent = feedbackText;
  lessonFeedback.className = `feedback ${answer.good ? "good" : "warn"}`;

  const recapCopy = answer.good
    ? lesson.recap
    : `Recap before retry: ${lesson.recap}`;
  setFeedbackNode(lessonRecap, recapCopy, "recap");

  const hintCopy = answer.good ? "" : getAdaptiveHint(lesson.categoryKey);
  setFeedbackNode(lessonHint, hintCopy, "hint");

  Array.from(lessonChoices.querySelectorAll("button")).forEach((button) => {
    button.disabled = true;
    button.style.opacity = "0.65";
  });

  trackEvent("answered-core-lesson", {
    lesson: lesson.title,
    good: answer.good,
    points: answer.score,
    attempts: state.lessonAttempts[lessonKey],
  });

  if (answer.good) {
    nextLessonBtn.classList.remove("hidden");
    retryLessonBtn.classList.add("hidden");
  } else {
    retryLessonBtn.classList.remove("hidden");
    nextLessonBtn.classList.add("hidden");
  }

  updateHUD();
  updateLearnerProfile();
}

function nextLesson() {
  state.lessonIndex += 1;
  if (state.lessonIndex >= state.activeLessons.length) {
    state.lessonsCompleted = true;
    updateLessonRail();
    trackEvent("completed-core-lessons", { totalLessons: state.activeLessons.length });
    showPanel("scenario");
    renderScenario();
    return;
  }
  renderLesson();
}

function renderScenario() {
  const scenario = state.activeScenarios[state.scenarioIndex];
  scenarioTitle.textContent = scenario.title;
  scenarioCategory.textContent = scenario.category;
  scenarioPrompt.textContent = scenario.prompt;
  feedbackBox.className = "feedback hidden";
  setFeedbackNode(scenarioRecap, "", "recap");
  setFeedbackNode(scenarioHint, "", "hint");
  nextScenarioBtn.classList.add("hidden");
  choiceList.innerHTML = "";

  scenario.choices.forEach((choice) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.textContent = choice.text;
    btn.addEventListener("click", () => evaluateScenarioChoice(choice, scenario.title));
    choiceList.appendChild(btn);
  });
}

function evaluateScenarioChoice(choice, scenarioTitleValue) {
  const scenario = state.activeScenarios[state.scenarioIndex];
  trackCategoryResult(scenario.categoryKey, choice.good);

  let points = choice.score;
  if (state.difficulty === "challenge") {
    points = Math.floor(points * 1.2); // 20% bonus for challenge mode
  }
  state.score += points;
  showPointsPopup(choiceList, points);
  
  if (choice.good) {
    playSound("correct");
    state.badges.add("Trust Builder");
    state.personality.courage += 1;
    state.streak = state.streak + 1;
    
    // Check for bonus scenario unlock (perfect > 80 score)
    if (state.score >= 80 && !state.bonusScenarioUnlocked) {
      state.bonusScenarioUnlocked = true;
      showToast("🎯 Bonus Scenario Unlocked! Complete your final challenge.", "badge", 4000);
      confetti({ particleCount: 100, spread: 60, origin: { y: 0.4 } });
    }
    
    if (state.streak >= 3) {
      state.badges.add("Consistency Pro");
    }
    if (state.streak === 5) {
      showToast("🔥🔥 5-Scenario Streak!", "streak");
      playSound("streak");
    }
  } else {
    playSound("incorrect");
    state.streak = 0;
    state.perfectRun = false;
    showToast(getPersonalizedMessage(true), "info");
  }

  handleComebackIfNeeded(choice.good);

  const humor = getRoleHumor(choice.good);
  const roleSnippet = getRoleSpecificSnippet(scenario.categoryKey, choice.good);
  const golden = maybeGoldenFeedback(choice.good);
  const feedbackText = `${choice.feedback} ${roleSnippet}${humor ? " " + humor : ""}${golden ? " " + golden : ""}`;
  feedbackBox.textContent = feedbackText;
  feedbackBox.classList.remove("hidden");
  feedbackBox.classList.add(choice.good ? "good" : "warn");

  setFeedbackNode(
    scenarioRecap,
    choice.good ? scenario.recap : `Recap before next attempt: ${scenario.recap}`,
    "recap"
  );
  setFeedbackNode(scenarioHint, choice.good ? "" : getAdaptiveHint(scenario.categoryKey), "hint");

  Array.from(choiceList.querySelectorAll("button")).forEach((button) => {
    button.disabled = true;
    button.style.opacity = "0.65";
  });

  trackEvent("answered-scenario", { scenario: scenarioTitleValue, good: choice.good, points });
  nextScenarioBtn.classList.remove("hidden");
  updateHUD();
  updateLearnerProfile();
}

function nextScenario() {
  state.scenarioIndex += 1;
  
  // Check if we've completed all regular scenarios and have bonus unlocked
  if (state.scenarioIndex >= state.activeScenarios.length) {
    if (state.bonusScenarioUnlocked && !state.bonusScenarioCompleted) {
      // Inject bonus scenario
      showToast("🎯 Time for your Bonus Challenge!", "badge", 3000);
      renderBonusScenario();
      state.bonusScenarioCompleted = true;
      return;
    }
    showPanel("lightning");
    startLightning();
    return;
  }
  renderScenario();
}

function renderBonusScenario() {
  const scenario = bonusScenario;
  scenarioTitle.textContent = scenario.title;
  scenarioCategory.textContent = scenario.category;
  scenarioPrompt.textContent = scenario.prompt;
  feedbackBox.className = "feedback hidden";
  nextScenarioBtn.classList.add("hidden");
  choiceList.innerHTML = "";

  scenario.choices.forEach((choice) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.textContent = choice.text;
    btn.addEventListener("click", () => {
      evaluateBonusScenario(choice, scenario.title);
    });
    choiceList.appendChild(btn);
  });
}

function evaluateBonusScenario(choice, bonusTitle) {
  trackCategoryResult("abuseNeglect", choice.good);

  let points = choice.score;
  if (state.difficulty === "challenge") {
    points = Math.floor(points * 1.25); // 25% bonus for challenge mode on bonus
  }
  state.score += points;
  showPointsPopup(choiceList, points);
  
  if (choice.good) {
    playSound("correct");
    celebrateBadge("Secret Master");
    state.badges.add("Secret Master");
    state.badges.add("Patient Experience Champion");
  } else {
    playSound("incorrect");
  }

  feedbackBox.textContent = choice.feedback;
  feedbackBox.classList.remove("hidden");
  feedbackBox.classList.add(choice.good ? "good" : "warn");
  setFeedbackNode(
    scenarioRecap,
    "Scenario recap: when critical safety risk is present, protective action and formal escalation come first.",
    "recap"
  );
  setFeedbackNode(scenarioHint, choice.good ? "" : getAdaptiveHint("abuseNeglect"), "hint");

  Array.from(choiceList.querySelectorAll("button")).forEach((button) => {
    button.disabled = true;
    button.style.opacity = "0.65";
  });

  trackEvent("answered-bonus-scenario", { title: bonusTitle, good: choice.good, points });
  nextScenarioBtn.classList.remove("hidden");
  updateHUD();
  updateLearnerProfile();
}

function startLightning() {
  state.lightningActive = true;
  state.lightningTimer = 60;
  state.lightningIndex = 0;
  state.startTime = Date.now();
  updateHUD();
  renderLightning();
  trackEvent("started-lightning-round");

  clearInterval(timerHandle);
  timerHandle = setInterval(() => {
    state.lightningTimer -= 1;
    updateHUD();
    if (state.lightningTimer <= 0) {
      clearInterval(timerHandle);
      state.lightningActive = false;
      finishBtn.classList.remove("hidden");
      lightningFeedback.className = "feedback";
      lightningFeedback.textContent = "Time is up. Pressure moment complete.";
      lightningChoices.innerHTML = "";
      trackEvent("completed-lightning-round", { timeout: true });
    }
  }, 1000);
}

function renderLightning() {
  const item = lightningQuestions[state.lightningIndex];
  lightningQuestion.textContent = item.q;
  lightningFeedback.className = "feedback hidden";
  setFeedbackNode(lightningHint, "", "hint");
  finishBtn.classList.add("hidden");
  lightningChoices.innerHTML = "";

  item.answers.forEach((answer) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.textContent = answer.text;
    btn.addEventListener("click", () => evaluateLightning(answer, item));
    lightningChoices.appendChild(btn);
  });
}

function evaluateLightning(answer, item) {
  if (!state.lightningActive) return;
  trackCategoryResult(item.categoryKey, answer.good);

  let points = answer.score;
  if (state.difficulty === "challenge") {
    points = Math.floor(points * 1.2);
  }
  state.score += points;
  showPointsPopup(lightningChoices, points);
  
  if (answer.good) {
    playSound("correct");
    state.badges.add("Policy Sprinter");
    state.personality.precision += 1;
    state.streak = state.streak + 1;
  } else {
    playSound("incorrect");
    state.streak = 0;
    state.perfectRun = false;
  }

  handleComebackIfNeeded(answer.good);

  const humor = getRoleHumor(answer.good);
  const roleSnippet = getRoleSpecificSnippet(item.categoryKey, answer.good);
  const golden = maybeGoldenFeedback(answer.good);
  const feedbackText = `${answer.good ? "Correct." : "Not ideal."} ${item.why} ${roleSnippet}${humor ? " " + humor : ""}${golden ? " " + golden : ""}`;
  lightningFeedback.textContent = feedbackText;
  lightningFeedback.className = `feedback ${answer.good ? "good" : "warn"}`;
  setFeedbackNode(lightningHint, answer.good ? "" : getAdaptiveHint(item.categoryKey), "hint");

  Array.from(lightningChoices.querySelectorAll("button")).forEach((button) => {
    button.disabled = true;
    button.style.opacity = "0.65";
  });

  state.lightningIndex += 1;
  trackEvent("answered-lightning", { question: item.q, good: answer.good, points });
  updateHUD();
  updateLearnerProfile();

  setTimeout(() => {
    if (state.lightningIndex >= lightningQuestions.length) {
      clearInterval(timerHandle);
      state.lightningActive = false;
      finishBtn.classList.remove("hidden");
      state.badges.add("Mission Complete");
      trackEvent("completed-lightning-round", { timeout: false });
    } else {
      renderLightning();
    }
  }, 850);
}

function renderAssessmentQuestion() {
  const item = finalAssessment[state.assessmentIndex];
  assessmentProgress.textContent = `Question ${state.assessmentIndex + 1} of ${finalAssessment.length}`;
  assessmentQuestion.textContent = item.q;
  assessmentChoices.innerHTML = "";
  assessmentFeedback.className = "feedback hidden";
  setFeedbackNode(assessmentHint, "", "hint");
  nextAssessmentBtn.classList.add("hidden");

  item.a.forEach((choiceText, index) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.textContent = choiceText;
    btn.addEventListener("click", () => evaluateAssessment(index));
    assessmentChoices.appendChild(btn);
  });
}

function evaluateAssessment(selectedIndex) {
  const item = finalAssessment[state.assessmentIndex];
  const correct = selectedIndex === item.c;
  trackCategoryResult(item.k || "knowledgeCheck", correct);
  
  if (correct) {
    state.assessmentCorrect += 1;
    state.personality.precision += 1;
    let points = 4;
    if (state.difficulty === "challenge") {
      points = Math.floor(points * 1.2);
    }
    state.score += points;
    showPointsPopup(assessmentChoices, points);
    playSound("correct");
  } else {
    playSound("incorrect");
    state.perfectRun = false;
  }

  handleComebackIfNeeded(correct);

  const roleSnippet = getRoleSpecificSnippet(item.k || "knowledgeCheck", correct);
  assessmentFeedback.textContent = correct
    ? `Correct. ${roleSnippet}`
    : `Not correct. Best answer: ${item.a[item.c]}. ${roleSnippet}`;
  assessmentFeedback.className = `feedback ${correct ? "good" : "warn"}`;
  setFeedbackNode(assessmentHint, correct ? "" : getAdaptiveHint(item.k || "knowledgeCheck"), "hint");
  Array.from(assessmentChoices.querySelectorAll("button")).forEach((button) => {
    button.disabled = true;
    button.style.opacity = "0.65";
  });

  trackEvent("answered-assessment", {
    index: state.assessmentIndex + 1,
    correct,
  });

  nextAssessmentBtn.classList.remove("hidden");
  updateHUD();
  updateLearnerProfile();
}

function nextAssessmentQuestion() {
  state.assessmentIndex += 1;
  if (state.assessmentIndex >= finalAssessment.length) {
    showPanel("results");
    renderResults();
    return;
  }
  renderAssessmentQuestion();
}

function renderResults() {
  // Calculate speed bonus (if finished more than 5 min early)
  const elapsedSeconds = Math.floor((Date.now() - (state.startTime || Date.now())) / 1000);
  const expectedSeconds = 60; // 60 seconds for lightning round is baseline
  if (elapsedSeconds < expectedSeconds - 300) { // 5 minutes early
    state.speedBonusEarned = 15;
    state.score += state.speedBonusEarned;
    state.badges.add("Speedrunner");
    celebrateBadge("Speedrunner");
  }

  // Perfect run bonus
  if (state.perfectRun && state.lessonPassed.size === 5) {
    state.score += 20;
    state.badges.add("Perfect Run");
    celebrateBadge("Perfect Run");
  }

  const assessmentPct = Math.round((state.assessmentCorrect / finalAssessment.length) * 100);
  const level = state.score >= 200 ? "Gold" : state.score >= 150 ? "Silver" : "Bronze";
  const abuseNeglectThreshold = getRoleMasteryThreshold("abuseNeglect");
  const abuseNeglectPct = getCategoryPercent("abuseNeglect");
  const abuseNeglectMastered = abuseNeglectPct === null ? false : abuseNeglectPct >= abuseNeglectThreshold;
  const pass = assessmentPct >= 80 && abuseNeglectMastered;

  state.pass = pass;

  if (assessmentPct >= 90) state.badges.add("Assessment Ace");
  if (pass) state.badges.add("Compliance Guardian");
  if (state.score >= 200) {
    state.badges.add("Elite Expert");
    celebrateCompletion();
  }

  // Seasonal achievements (based on current month)
  const month = new Date().getMonth();
  const seasonalKey = `${new Date().getFullYear()}-${month}`;
  const stored = localStorage.getItem(SEASONAL_KEY);
  let achievements = stored ? JSON.parse(stored) : {};
  
  if (pass) {
    achievements[seasonalKey] = (achievements[seasonalKey] || 0) + 1;
    localStorage.setItem(SEASONAL_KEY, JSON.stringify(achievements));
    
    if (achievements[seasonalKey] === 5) {
      state.badges.add("Seasonal Champion");
      showToast("🏆 Seasonal Champion Unlocked! (5 completes this month)", "badge", 5000);
    }
  }

  resultSummary.textContent = `Track: ${getCurrentRoleName()}. Final Score: ${state.score}. Assessment: ${assessmentPct}% (${state.assessmentCorrect}/${finalAssessment.length}). Abuse/Neglect Mastery: ${abuseNeglectPct ?? "Not established"}% / required ${abuseNeglectThreshold}%. Tier: ${level}. Status: ${pass ? "PASS ✓" : "REMEDIATE 📚"}.${state.bonusScenarioUnlocked ? " [Secret Master]" : ""} ${state.perfectRun ? "[Perfect Run]" : ""}`;

  if (!abuseNeglectMastered) {
    resultSummary.textContent += ` ${getRoleMasteryRequirementText("abuseNeglect")}`;
  }

  const recap = getPersonalityRecap();
  resultSummary.textContent += ` Personality recap: ${recap}.`;

  const retryRecommendations = getRetryRecommendations();
  if (retryModulesList) {
    retryModulesList.innerHTML = "";
    if (retryRecommendations.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No high-risk weak categories detected. Maintain with periodic refresh drills.";
      retryModulesList.appendChild(li);
    } else {
      retryRecommendations.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = `${item.label} (${item.pct}% / target ${item.requiredPct}%): ${item.module}`;
        retryModulesList.appendChild(li);
      });
    }
  }

  if (nextStepGuidance) {
    nextStepGuidance.textContent = buildNextStepGuidance(pass, assessmentPct, retryRecommendations);
  }

  badgeRow.innerHTML = "";
  Array.from(state.badges).forEach((name) => {
    const badge = document.createElement("span");
    badge.className = `badge badge-unlocked`;
    badge.textContent = name;
    badgeRow.appendChild(badge);
  });

  renderMysteryBadges();

  submissionStatus.textContent = "Review your score, check the acknowledgment box, then submit completion.";

  trackEvent("completed-training", {
    assessmentPercent: assessmentPct,
    assessmentCorrect: state.assessmentCorrect,
    assessmentTotal: finalAssessment.length,
    abuseNeglectPct,
    abuseNeglectThreshold,
    abuseNeglectMastered,
    level,
    pass,
    bonusUnlocked: state.bonusScenarioUnlocked,
    perfectRun: state.perfectRun,
    speedBonus: state.speedBonusEarned,
  });
}

function saveSuspendData() {
  const data = {
    role: state.role,
    score: state.score,
    assessmentCorrect: state.assessmentCorrect,
    assessmentIndex: state.assessmentIndex,
  };

  const payload = JSON.stringify(data);
  if (scorm.version === "2004") {
    scormSetValue("cmi.suspend_data", payload);
  } else if (scorm.version === "1.2") {
    scormSetValue("cmi.suspend_data", payload.slice(0, 4000));
  }
  scormCommit();
}

function submitCompletion() {
  if (!attestCheckbox.checked) {
    submissionStatus.textContent = "Please check the annual acknowledgment box before submitting.";
    return;
  }

  if (state.finalized) {
    submissionStatus.textContent = "Completion already submitted for this session.";
    return;
  }

  const assessmentPct = Math.round((state.assessmentCorrect / finalAssessment.length) * 100);
  const completionStatus = "completed";
  const successStatus = state.pass ? "passed" : "failed";

  if (scorm.version === "2004") {
    scormSetValue("cmi.completion_status", completionStatus);
    scormSetValue("cmi.success_status", successStatus);
    scormSetValue("cmi.score.raw", String(assessmentPct));
    scormSetValue("cmi.score.min", "0");
    scormSetValue("cmi.score.max", "100");
  } else if (scorm.version === "1.2") {
    scormSetValue("cmi.core.lesson_status", successStatus);
    scormSetValue("cmi.core.score.raw", String(assessmentPct));
    scormSetValue("cmi.core.score.min", "0");
    scormSetValue("cmi.core.score.max", "100");
  }

  saveSuspendData();
  scormCommit();

  state.finalized = true;
  trackEvent("submitted-completion", { assessmentPercent: assessmentPct, successStatus });

  Promise.resolve(
    apiRequest("/api/training/complete", {
      method: "POST",
      body: {
        attemptId: state.attemptId,
        scorePercent: assessmentPct,
        scoreRaw: state.assessmentCorrect,
        scoreMax: finalAssessment.length,
        attested: true,
      },
    })
  )
    .then((result) => {
      const lmsMessage = scorm.initialized
        ? "LMS submission complete."
        : "LMS was not connected in this session.";

      if (result?.passed) {
        dashboardBtn?.classList.remove("hidden");
      }

      if (result?.passed && result?.certificateNo) {
        if (result?.certificateId && viewCertBtn) {
          viewCertBtn.href = `../certificate.html?id=${encodeURIComponent(result.certificateId)}`;
          viewCertBtn.classList.remove("hidden");
        }
        submissionStatus.textContent = `Training record saved and certificate ${result.certificateNo} issued. ${lmsMessage}`;
        return;
      }

      if (result?.passed) {
        submissionStatus.textContent = `Training record saved successfully. ${lmsMessage}`;
        return;
      }

      submissionStatus.textContent = `Completion recorded, but passing score was not met. ${lmsMessage}`;
    })
    .catch(() => {
      submissionStatus.textContent = scorm.initialized
        ? "Completion sent to LMS, but server sync failed."
        : "Completion saved locally. Could not sync server record in this session.";
    });
}

function resetExperience() {
  state.score = 0;
  state.streak = 0;
  state.lessonIndex = 0;
  state.lessonAttempts = {};
  state.lessonPassed = new Set();
  state.scenarioIndex = 0;
  state.lightningIndex = 0;
  state.lightningTimer = 60;
  state.lightningActive = false;
  state.assessmentIndex = 0;
  state.assessmentCorrect = 0;
  state.badges = new Set();
  state.trackingEvents = [];
  state.finalized = false;
  state.pass = false;
  state.lessonsCompleted = false;
  state.perfectRun = true;
  state.speedBonusEarned = 0;
  state.bonusScenarioUnlocked = false;
  state.bonusScenarioCompleted = false;
  state.missStreak = 0;
  state.personality = { calm: 0, precision: 0, courage: 0 };
  state.categoryStats = createCategoryStats();
  state.retryRecommendations = [];
  attestCheckbox.checked = false;
  submissionStatus.textContent = "";
  if (retryModulesList) retryModulesList.innerHTML = "";
  if (nextStepGuidance) nextStepGuidance.textContent = "";
  dashboardBtn?.classList.add("hidden");
  if (viewCertBtn) {
    viewCertBtn.classList.add("hidden");
    viewCertBtn.href = "#";
  }
  buildRoleTrack();
  clearInterval(timerHandle);
  updateHUD();
  updateLearnerProfile();
}

function exportTracking() {
  const payload = {
    generatedAt: new Date().toISOString(),
    learnerRole: state.role,
    score: state.score,
    streak: state.streak,
    assessmentCorrect: state.assessmentCorrect,
    assessmentTotal: finalAssessment.length,
    xapiLikeStatements: state.trackingEvents,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `training-tracking-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

document.getElementById("startBtn").addEventListener("click", async () => {
  state.role = roleSelect.value;
  buildRoleTrack();
  await startBackendAttempt();
  showToast(getSeasonalThemeMessage(), "info", 3200);
  trackEvent("started-training", { role: state.role });
  showPanel("map");
  saveSuspendData();
});

document.getElementById("overviewBtn").addEventListener("click", () => {
  state.role = roleSelect.value;
  buildRoleTrack();
  showPanel("map");
});

configureRolesBtn.addEventListener("click", () => {
  showPanel("roleConfig");
  renderRoleList();
  clearRoleEditor("");
});

closeRoleConfigBtn.addEventListener("click", () => {
  buildRoleTrack();
  showPanel("welcome");
});

saveRoleBtn.addEventListener("click", upsertRoleFromForm);

clearRoleFormBtn.addEventListener("click", () => clearRoleEditor("Editor cleared."));

// PIN Management Event Listeners
const adminPinInput = document.getElementById("adminPinInput");
const setAdminPinBtn = document.getElementById("setAdminPinBtn");
const clearAdminPinBtn = document.getElementById("clearAdminPinBtn");
const adminPinStatus = document.getElementById("adminPinStatus");

setAdminPinBtn.addEventListener("click", () => {
  const pin = adminPinInput.value.trim();
  if (!pin) {
    adminPinStatus.textContent = "PIN cannot be empty. Enter a 4-6 digit code.";
    adminPinStatus.className = "muted warn";
    return;
  }

  if (!setAdminPin(pin)) {
    adminPinStatus.textContent = "PIN must be 4-6 digits (0-9 only).";
    adminPinStatus.className = "muted warn";
    adminPinInput.value = "";
    return;
  }

  adminPinStatus.textContent = "✓ Admin PIN updated. You will be prompted to verify before editing or deleting roles.";
  adminPinStatus.className = "muted good";
  adminPinInput.value = "";
});

clearAdminPinBtn.addEventListener("click", () => {
  if (setAdminPin("")) {
    adminPinStatus.textContent = "Admin PIN removed. Role editing no longer requires authorization.";
    adminPinStatus.className = "muted";
    adminPinInput.value = "";
  }
});

// PIN Prompt Modal Event Listeners
const pinPromptModal = document.getElementById("pinPromptModal");
const pinPromptInput = document.getElementById("pinPromptInput");
const pinPromptSubmitBtn = document.getElementById("pinPromptSubmitBtn");
const pinPromptCancelBtn = document.getElementById("pinPromptCancelBtn");
const pinPromptError = document.getElementById("pinPromptError");

pinPromptSubmitBtn.addEventListener("click", async () => {
  const pin = pinPromptInput.value;
  if (!validatePin(pin)) {
    pinPromptError.textContent = "Invalid PIN. Please try again.";
    pinPromptInput.value = "";
    pinPromptInput.focus();
    return;
  }

  // PIN verified, execute pending action
  if (pendingPinAction?.action === "edit") {
    const roleId = pendingPinAction.roleId;
    const role = roleConfigs.find((r) => r.id === roleId);
    if (role) {
      editingRoleId = roleId;
      roleEditorTitle.textContent = "Edit Role";
      roleNameInput.value = role.name;
      rolePersonaSelect.value = role.persona;
      roleDepartmentsInput.value = (role.departments || []).join(", ");
      renderRoleModuleCheckboxes(role.enabledModules || MODULE_LIBRARY.map((module) => module.id));
      roleConfigStatus.textContent = "Editing role (PIN verified). Save to apply updates.";
    }
  } else if (pendingPinAction?.action === "delete") {
    const roleId = pendingPinAction.roleId;
    if (roleConfigs.length <= 1) {
      roleConfigStatus.textContent = "At least one role is required.";
      hidePinPrompt();
      return;
    }

    const deletedOnBackend = await deleteRoleFromBackend(roleId);
    if (!deletedOnBackend && API_BASE) {
      roleConfigStatus.textContent = "Could not delete role from backend.";
      hidePinPrompt();
      return;
    }

    roleConfigs = roleConfigs.filter((cfg) => cfg.id !== roleId);
    if (state.role === roleId) {
      state.role = roleConfigs[0].id;
    }
    saveRoleConfigs();
    renderRoleSelect();
    renderRoleList();
    buildRoleTrack();
    clearRoleEditor("Role deleted (PIN verified).");
  }

  hidePinPrompt();
});

pinPromptCancelBtn.addEventListener("click", hidePinPrompt);

pinPromptInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    pinPromptSubmitBtn.click();
  }
});

// Fun Features Event Listeners
document.getElementById("soundToggleBtn").addEventListener("click", toggleSound);
document.getElementById("brandModeToggleBtn").addEventListener("click", toggleBrandMode);

document.getElementById("difficultySelect").addEventListener("change", (e) => {
  state.difficulty = e.target.value;
  const difficultyLabel = e.target.selectedOptions[0]?.textContent || "Challenge Mode";
  showToast(`Difficulty: ${difficultyLabel}`, "info", 2000);
});

document.getElementById("beginScenarioBtn").addEventListener("click", () => {
  buildRoleTrack();
  showPanel("lesson");
  state.lessonIndex = 0;
  state.lessonAttempts = {};
  state.lessonPassed = new Set();
  state.perfectRun = true;
  updateLearnerProfile();
  trackEvent("started-core-lessons", { totalLessons: state.activeLessons.length, difficulty: state.difficulty });
  renderLesson();
});

nextLessonBtn.addEventListener("click", nextLesson);

retryLessonBtn.addEventListener("click", renderLesson);

nextScenarioBtn.addEventListener("click", nextScenario);

finishBtn.addEventListener("click", () => {
  showPanel("assessment");
  trackEvent("started-final-assessment", { totalQuestions: finalAssessment.length });
  renderAssessmentQuestion();
});

nextAssessmentBtn.addEventListener("click", nextAssessmentQuestion);

submitCompletionBtn.addEventListener("click", submitCompletion);

document.getElementById("restartBtn").addEventListener("click", () => {
  resetExperience();
  showPanel("welcome");
});

document.getElementById("exportTrackingBtn").addEventListener("click", exportTracking);

document.getElementById("logoutBtn").addEventListener("click", () => {
  clearSessionAndRedirect();
});

roleSelect.addEventListener("change", () => {
  state.role = roleSelect.value;
  buildRoleTrack();
});

window.addEventListener("beforeunload", () => {
  saveSuspendData();
  scormTerminate();
});

async function bootstrap() {
  if (!requireAuthenticatedSession()) {
    return;
  }

  roleConfigs = loadRoleConfigs();
  const loadedFromBackend = await loadRoleConfigsFromBackend();

  state.categoryStats = createCategoryStats();

  if (!loadedFromBackend && roleConfigs.length === 0) {
    roleConfigs = [...defaultRoleConfigs];
  }

  renderRoleSelect();
  buildRoleTrack();
  initScorm();
  initSound();
  initBrandMode();
  renderSeasonalTheme();
  updateHUD();
  updateLearnerProfile();
}

bootstrap();
