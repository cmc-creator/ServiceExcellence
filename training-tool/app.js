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
      "infection-outbreak-cohorting",
      "patient-rights-grievance-escalation",
      "telehealth-privacy-session-controls",
      "emergency-transfer-handoff-coordination",
      "harassment-retaliation-safeguards",
    ],
  },
  {
    id: "nonclinical-staff",
    name: "Non-Clinical Staff",
    persona: "nonclinical",
    departments: ["Admissions", "Support Services"],
    enabledModules: [
      "infection-outbreak-cohorting",
      "patient-rights-grievance-escalation",
      "telehealth-privacy-session-controls",
      "emergency-transfer-handoff-coordination",
      "harassment-retaliation-safeguards",
    ],
  },
  {
    id: "leadership-supervisors",
    name: "Leaders and Supervisors",
    persona: "leadership",
    departments: ["Management", "Operations"],
    enabledModules: [
      "infection-outbreak-cohorting",
      "patient-rights-grievance-escalation",
      "telehealth-privacy-session-controls",
      "emergency-transfer-handoff-coordination",
      "harassment-retaliation-safeguards",
    ],
  },
];

const MODULE_LIBRARY = [
  { id: "infection-outbreak-cohorting", title: "Infection Outbreak Containment and Patient Cohorting" },
  { id: "patient-rights-grievance-escalation", title: "Patient Rights, Grievance Intake, and Ombuds Escalation" },
  { id: "telehealth-privacy-session-controls", title: "Telehealth Privacy and Remote Session Controls" },
  { id: "emergency-transfer-handoff-coordination", title: "Emergency Psychiatric Transfer and Handoff Coordination" },
  { id: "harassment-retaliation-safeguards", title: "Workplace Harassment Reporting and Anti-Retaliation Safeguards" },
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

const requireLoginSetting = localStorage.getItem("nyxRequireLogin");
const REQUIRE_LOGIN = requireLoginSetting !== null
  ? requireLoginSetting !== "false"
  : window.NYX_REQUIRE_LOGIN === true;

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
  title: "Secret Bonus: Outbreak Trigger During Transfer Window",
  category: "Challenge - Cohorting, Handoff, and Non-Retaliation",
  roles: ["clinical", "nonclinical", "leadership"],
  prompt: "A symptomatic patient is awaiting emergency transfer, telehealth triage is active, and a staff member reports being discouraged from filing a safety grievance. Best first sequence?",
  choices: [
    { text: "Initiate isolation/cohorting precautions now, execute SBAR transfer handoff, protect reporting staff from retaliation, and route grievance to ombuds workflow.", score: 20, good: true, feedback: "Excellent. This sequence protects infection safety, transfer reliability, and reporting integrity." },
    { text: "Prioritize transfer paperwork only and defer grievance discussion until morning.", score: 8, good: false, feedback: "Deferring retaliation concerns and safety controls increases organizational risk." },
    { text: "Continue normal unit flow and ask team to keep concerns informal.", score: 2, good: false, feedback: "Informal handling undermines rights, safety, and compliance." },
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
      title: "Outbreak Containment Example",
      points: [
        "Escalate suspected clusters early and apply cohorting/isolation controls immediately.",
        "Use structured handoff language for exposure status across shifts.",
      ],
    },
    {
      title: "Rights and Grievance Example",
      points: [
        "Explain rights and complaint pathways in plain language at point of concern.",
        "Document grievance intake objectively and route to ombuds flow without delay.",
      ],
    },
    {
      title: "Telehealth Privacy Example",
      points: [
        "Verify patient identity/location and secure environment before remote care discussion.",
        "Use approved platforms and minimum-necessary disclosure standards.",
      ],
    },
    {
      title: "Emergency Transfer Handoff Example",
      points: [
        "Use transfer checklist with clinical risk summary and acceptance confirmation.",
        "Document transport readiness, stabilization status, and receiving handoff owner.",
      ],
    },
    {
      title: "Anti-Retaliation Safeguard Example",
      points: [
        "Escalate harassment and retaliation concerns through formal policy channels.",
        "Document protective actions and follow-up milestones with clear ownership.",
      ],
    },
  ],
  nonclinical: [
    {
      title: "Cohorting Frontline Example",
      points: [
        "Route symptomatic or exposed patients to designated flow points quickly.",
        "Escalate capacity pinch points before cohorting controls degrade.",
      ],
    },
    {
      title: "Grievance Intake Example",
      points: [
        "Capture concern details verbatim and provide clear escalation timeline.",
        "Avoid dismissive language or informal deferral of rights complaints.",
      ],
    },
    {
      title: "Remote Session Privacy Example",
      points: [
        "Confirm privacy conditions and approved tools before connecting telehealth sessions.",
        "Escalate any unsecure-channel requests immediately.",
      ],
    },
    {
      title: "Transfer Coordination Example",
      points: [
        "Verify receiving acceptance and transport logistics before movement.",
        "Timestamp key handoff events for continuity and audit traceability.",
      ],
    },
    {
      title: "Harassment Reporting Support",
      points: [
        "Route reports immediately and protect confidentiality boundaries.",
        "Escalate retaliation signals early using non-punitive pathways.",
      ],
    },
  ],
  leadership: [
    {
      title: "Outbreak Governance Example",
      points: [
        "Audit cohorting timeliness, exposure-control adherence, and overflow mitigation.",
        "Escalate repeat breakdowns as high-priority safety events.",
      ],
    },
    {
      title: "Rights/Ombuds Governance",
      points: [
        "Track grievance closure times and communication quality metrics.",
        "Ensure patient-rights escalations receive transparent follow-through.",
      ],
    },
    {
      title: "Telehealth Security Governance",
      points: [
        "Monitor remote-session privacy incidents and platform compliance.",
        "Require corrective action closure on repeat telehealth control misses.",
      ],
    },
    {
      title: "Transfer Reliability Governance",
      points: [
        "Review emergency transfer delays, handoff completeness, and near misses.",
        "Strengthen checklist discipline and accountability at each transition point.",
      ],
    },
    {
      title: "Workforce Protection Governance",
      points: [
        "Enforce anti-harassment and anti-retaliation protocols with documented safeguards.",
        "Track reporter-protection outcomes and intervention timeliness.",
      ],
    },
  ],
};

const TRAINING_CATEGORIES = {
  communication: {
    label: "Rights and Disclosure Communication",
    retryModule: "Revisit grievance and rights communication modules to reinforce clear escalation language and timelines.",
  },
  conduct: {
    label: "Professional Conduct and Reporter Protection",
    retryModule: "Review harassment and anti-retaliation scenarios for policy-first protective action.",
  },
  privacy: {
    label: "Telehealth and Data Privacy Controls",
    retryModule: "Repeat telehealth privacy modules focused on secure-session setup and minimum-necessary disclosure.",
  },
  reporting: {
    label: "Incident Escalation and Transfer Reliability",
    retryModule: "Re-run transfer and escalation scenarios to strengthen ownership and timely closure.",
  },
  safety: {
    label: "Outbreak and Unit Safety Control",
    retryModule: "Revisit outbreak containment and cohorting modules to reinforce first-action safety sequencing.",
  },
  abuseNeglect: {
    label: "Critical Escalation and Non-Retaliation",
    retryModule: "Repeat high-risk escalation scenarios to strengthen protected reporting and urgent safety action.",
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
    ? `Complete protected-reporting and non-retaliation items to establish the ${abuseNeglectThreshold}% mastery target.`
    : `Protected-reporting mastery finished at ${abuseNeglectPct}% against a ${abuseNeglectThreshold}% target.`;

  if (pass && recommendations.length === 0) {
    return `${roleName}: strong completion. ${abuseNeglectClause} Next step is a monthly refresh focused on outbreak cohorting readiness, transfer handoff discipline, and respectful workplace escalation.`;
  }
  if (pass && recommendations.length > 0) {
    return `${roleName}: you passed, and targeted reinforcement is recommended in ${recommendations.map((item) => item.label).join(", ")}. ${abuseNeglectClause} Re-run those modules this week for stronger retention.`;
  }
  return `${roleName}: assessment at ${assessmentPct}%. ${abuseNeglectClause} Complete recommended retry modules, then reattempt the full assessment with focus on immediate escalation, rights protection, and clear documentation.`;
}

const coreLessons = [
  {
    moduleId: "infection-outbreak-cohorting",
    spotlightIndex: 0,
    title: "Lesson 1: Infection Outbreak Containment and Patient Cohorting",
    body: "Outbreak control depends on early cluster detection, isolation discipline, and cohorting capacity management.",
    check: "Two new symptomatic patients appear on same unit in one shift. Best immediate action?",
    answers: [
      { text: "Escalate suspected cluster and activate cohorting protocol with exposure-control routing now.", good: true, score: 8 },
      { text: "Wait for lab confirmation before changing room assignments.", good: false, score: 2 },
      { text: "Document for next day review only.", good: false, score: 1 },
    ],
    why: "Early cohorting decisions limit spread.",
    categoryKey: "safety",
    recap: "Checkpoint: cluster suspicion requires immediate containment and routing escalation.",
  },
  {
    moduleId: "patient-rights-grievance-escalation",
    spotlightIndex: 1,
    title: "Lesson 2: Patient Rights, Grievance Intake, and Ombuds Escalation",
    body: "Rights protection requires clear complaint pathways, objective intake, and timely ombuds escalation.",
    check: "Patient states rights were ignored and asks to file formal grievance. Best response?",
    answers: [
      { text: "Provide grievance pathway immediately, document concern verbatim, and escalate per ombuds policy.", good: true, score: 8 },
      { text: "Ask patient to wait until discharge to report.", good: false, score: 2 },
      { text: "Handle concern informally with no formal record.", good: false, score: 1 },
    ],
    why: "Rights escalation must be timely and traceable.",
    categoryKey: "communication",
    recap: "Checkpoint: grievance intake should be immediate, objective, and policy-routed.",
  },
  {
    moduleId: "telehealth-privacy-session-controls",
    spotlightIndex: 2,
    title: "Lesson 3: Telehealth Privacy and Remote Session Controls",
    body: "Remote care requires secure channels, identity/location verification, and privacy safeguards before discussing protected details.",
    check: "Telehealth visit starts while patient is in shared room and using non-approved app. Best action?",
    answers: [
      { text: "Pause visit, move to approved secure platform/privacy setting, and verify identity before continuing.", good: true, score: 8 },
      { text: "Proceed quickly to avoid delaying care.", good: false, score: 2 },
      { text: "Share only sensitive details by personal text.", good: false, score: 1 },
    ],
    why: "Session controls protect privacy and compliance.",
    categoryKey: "privacy",
    recap: "Checkpoint: telehealth privacy starts before clinical conversation begins.",
  },
  {
    moduleId: "emergency-transfer-handoff-coordination",
    spotlightIndex: 3,
    title: "Lesson 4: Emergency Psychiatric Transfer and Handoff Coordination",
    body: "Safe transfers require stabilization checks, receiving acceptance, and complete handoff packets.",
    check: "Receiving site requests immediate transfer but key risk details are incomplete. Best response?",
    answers: [
      { text: "Complete critical handoff checklist and receiving confirmation before transfer movement.", good: true, score: 8 },
      { text: "Transfer now and send details afterward.", good: false, score: 2 },
      { text: "Delay indefinitely due to missing detail.", good: false, score: 1 },
    ],
    why: "Transfer reliability depends on complete pre-move coordination.",
    categoryKey: "reporting",
    recap: "Checkpoint: emergency transfer safety is checklist-driven and ownership-based.",
  },
  {
    moduleId: "harassment-retaliation-safeguards",
    spotlightIndex: 4,
    title: "Lesson 5: Workplace Harassment Reporting and Anti-Retaliation Safeguards",
    body: "Reporter protection requires immediate policy escalation, confidentiality boundaries, and documented anti-retaliation safeguards.",
    check: "Staff reports harassment and fears assignment retaliation. Best immediate action?",
    answers: [
      { text: "Activate formal report pathway, apply anti-retaliation safeguards, and document protective steps.", good: true, score: 8 },
      { text: "Advise staff to watch and report only if repeated.", good: false, score: 2 },
      { text: "Resolve privately to avoid formal process.", good: false, score: 1 },
    ],
    why: "Early reporter protection prevents compounding harm.",
    categoryKey: "conduct",
    recap: "Checkpoint: harassment reports require formal escalation and anti-retaliation follow-through.",
  },
];

const scenarios = [
  {
    title: "Scenario 1: Unit Cluster Alert",
    category: "Outbreak Containment - Rapid Cohorting",
    roles: ["clinical", "nonclinical", "leadership"],
    prompt: "Three linked symptomatic cases emerge on one unit in 24 hours. Best immediate response?",
    choices: [
      { text: "Activate outbreak response, cohort affected patients, and enforce exposure routing controls now.", score: 16, good: true, feedback: "Correct. Immediate cohorting limits spread." },
      { text: "Wait for full diagnostics before changing placement.", score: 6, good: false, feedback: "Delay can expand unit-wide exposure." },
      { text: "Transfer all patients without containment planning.", score: 2, good: false, feedback: "Unplanned movement can increase transmission risk." },
    ],
    categoryKey: "safety",
    recap: "Scenario recap: suspected clusters require immediate containment and cohorting control.",
  },
  {
    title: "Scenario 2: Cohorting Capacity Breakdown",
    category: "Outbreak Containment - Overflow Management",
    roles: ["clinical", "leadership"],
    prompt: "Designated cohort beds are full while new exposed patients continue arriving. Best leadership action?",
    choices: [
      { text: "Escalate overflow plan immediately and open policy-approved surge cohort controls.", score: 18, good: true, feedback: "Correct. Capacity escalation prevents unsafe mixing." },
      { text: "Temporarily mix exposed and non-exposed patients.", score: 5, good: false, feedback: "Mixing undermines containment strategy." },
      { text: "Pause intake with no escalation.", score: 4, good: false, feedback: "Uncoordinated pauses can create unsafe bottlenecks." },
    ],
    categoryKey: "safety",
    recap: "Scenario recap: overflow needs formal surge controls, not ad hoc mixing.",
  },
  {
    title: "Scenario 3: Rights Complaint at Bedside",
    category: "Rights and Grievance - Immediate Intake",
    roles: ["clinical", "nonclinical", "leadership"],
    prompt: "Patient states they were denied rights information and asks to file complaint now. Best response?",
    choices: [
      { text: "Provide grievance pathway immediately, document concern objectively, and escalate to designated ombuds flow.", score: 18, good: true, feedback: "Correct. Immediate rights escalation is required." },
      { text: "Ask patient to discuss later with primary team.", score: 6, good: false, feedback: "Delay can undermine rights access." },
      { text: "Reassure verbally without filing process.", score: 3, good: false, feedback: "Informal reassurance does not replace formal grievance intake." },
    ],
    categoryKey: "communication",
    recap: "Scenario recap: rights complaints need immediate formal intake and routing.",
  },
  {
    title: "Scenario 4: Grievance Follow-Up Miss",
    category: "Rights and Grievance - Closure Reliability",
    roles: ["nonclinical", "leadership"],
    prompt: "Grievance acknowledgment was sent but Deferred to annual review occurred by promised date. Best action?",
    choices: [
      { text: "Escalate closure miss, assign accountable owner/date, and communicate updated timeline to patient.", score: 18, good: true, feedback: "Correct. Rights workflows require closure accountability." },
      { text: "Close complaint because acknowledgment was sent.", score: 6, good: false, feedback: "Acknowledgment alone is not resolution." },
      { text: "Wait until monthly review to address.", score: 2, good: false, feedback: "Delayed follow-up erodes trust and compliance." },
    ],
    categoryKey: "reporting",
    recap: "Scenario recap: grievance systems must track closure, not just intake.",
  },
  {
    title: "Scenario 5: Unsecure Telehealth Start",
    category: "Telehealth Privacy - Session Setup",
    roles: ["clinical", "leadership"],
    prompt: "Remote session starts from public area on non-approved app. Best response?",
    choices: [
      { text: "Pause session, shift to approved platform/private setting, and re-verify identity/location.", score: 18, good: true, feedback: "Correct. Secure setup is required before care discussion." },
      { text: "Proceed briefly with sensitive details minimized.", score: 4, good: false, feedback: "Even brief unsecure sessions can create privacy incidents." },
      { text: "Switch to personal messaging for convenience.", score: 6, good: false, feedback: "Unapproved channels increase disclosure risk." },
    ],
    categoryKey: "privacy",
    recap: "Scenario recap: secure platform and privacy controls are preconditions for telehealth care.",
  },
  {
    title: "Scenario 6: Identity Verification Gap",
    category: "Telehealth Privacy - Patient Verification",
    roles: ["clinical", "nonclinical", "leadership"],
    prompt: "Caller requests remote treatment updates but cannot verify identity credentials. Best response?",
    choices: [
      { text: "Use verification protocol and withhold protected details until identity is confirmed.", score: 18, good: true, feedback: "Correct. Verification precedes protected disclosure." },
      { text: "Share limited details due to urgent tone.", score: 5, good: false, feedback: "Urgency does not bypass privacy verification." },
      { text: "Share full details and document concern later.", score: 2, good: false, feedback: "Post-hoc documentation cannot undo disclosure errors." },
    ],
    categoryKey: "privacy",
    recap: "Scenario recap: identity verification is required before remote protected disclosures.",
  },
  {
    title: "Scenario 7: Transfer Without Acceptance",
    category: "Emergency Transfer - Receiving Coordination",
    roles: ["clinical", "nonclinical", "leadership"],
    prompt: "Transport is ready but receiving unit has not confirmed clinical acceptance. Best action?",
    choices: [
      { text: "Hold movement, secure receiving acceptance, and complete checklist before departure.", score: 20, good: true, feedback: "Correct. Transfer requires confirmed receiving readiness." },
      { text: "Send patient now to avoid delay and confirm en route.", score: 6, good: false, feedback: "Movement without acceptance can compromise patient safety." },
      { text: "Cancel transfer indefinitely.", score: 2, good: false, feedback: "Escalation and completion are required, not indefinite cancellation." },
    ],
    categoryKey: "reporting",
    recap: "Scenario recap: emergency transfer must be acceptance-confirmed and checklist-complete before movement.",
  },
  {
    title: "Scenario 8: Handoff Packet Omission",
    category: "Emergency Transfer - Information Integrity",
    roles: ["leadership"],
    prompt: "Post-event review finds missing risk-summary section in several transfer packets. Best leadership action?",
    choices: [
      { text: "Launch corrective reliability plan, retrain checklist use, and audit closure compliance.", score: 20, good: true, feedback: "Correct. Repeated omissions require structured reliability response." },
      { text: "Issue reminder email only.", score: 6, good: false, feedback: "Reminders alone rarely fix process drift." },
      { text: "Ignore if no adverse event occurred.", score: 2, good: false, feedback: "Near misses still require correction." },
    ],
    categoryKey: "reporting",
    recap: "Scenario recap: transfer packet integrity needs active governance and measurable closure.",
  },
  {
    title: "Scenario 9: Harassment Report with Retaliation Fear",
    category: "Workforce Protection - Immediate Safeguards",
    roles: ["clinical", "nonclinical", "leadership"],
    prompt: "Staff files harassment report and fears schedule retaliation this week. Best response?",
    choices: [
      { text: "Activate formal report workflow, apply anti-retaliation safeguards, and document protections now.", score: 20, good: true, feedback: "Correct. Early safeguards are required." },
      { text: "Advise staff to report again if retaliation happens.", score: 6, good: false, feedback: "Reactive-only approach can leave staff exposed." },
      { text: "Resolve informally to protect team morale.", score: 2, good: false, feedback: "Informal resolution alone may not protect reporters." },
    ],
    categoryKey: "conduct",
    recap: "Scenario recap: harassment reports require formal escalation and anti-retaliation protections.",
  },
  {
    title: "Scenario 10: Retaliation Signal After Report",
    category: "Workforce Protection - Leadership Follow-Through",
    roles: ["clinical", "leadership"],
    prompt: "Reporter assignment was abruptly changed after complaint with no documented reason. Best leadership response?",
    choices: [
      { text: "Escalate potential retaliation immediately, document findings, and implement protective correction plan.", score: 20, good: true, feedback: "Correct. Reporter protection requires immediate documented intervention." },
      { text: "Treat as routine scheduling issue unless explicit complaint repeats.", score: 5, good: false, feedback: "Potential retaliation requires proactive review." },
      { text: "Wait for next quarter culture survey to assess.", score: 4, good: false, feedback: "Delayed response can increase harm and legal risk." },
    ],
    categoryKey: "abuseNeglect",
    recap: "Scenario recap: retaliation indicators require immediate, documented leadership action.",
  },
];

const lightningQuestions = [
  {
    q: "Cluster signal appears in one unit. First action?",
    answers: [
      { text: "Activate containment/cohorting protocol immediately.", score: 12, good: true },
      { text: "Wait for full confirmation first.", score: 3, good: false },
      { text: "Document only for later review.", score: 2, good: false },
    ],
    why: "Early containment limits spread risk.",
    categoryKey: "safety",
  },
  {
    q: "Patient requests formal rights complaint now. Best response?",
    answers: [
      { text: "Initiate grievance intake and ombuds escalation immediately.", score: 12, good: true },
      { text: "Ask them to wait for discharge.", score: 2, good: false },
      { text: "Handle informally only.", score: 1, good: false },
    ],
    why: "Rights complaints require timely formal routing.",
    categoryKey: "communication",
  },
  {
    q: "Telehealth session is unsecure at start. Correct move?",
    answers: [
      { text: "Pause and move to approved secure setup before discussing care.", score: 12, good: true },
      { text: "Proceed quickly anyway.", score: 3, good: false },
      { text: "Use personal app instead.", score: 1, good: false },
    ],
    why: "Session controls are required before PHI discussion.",
    categoryKey: "privacy",
  },
  {
    q: "Staff fears retaliation after harassment report. Best action?",
    answers: [
      { text: "Activate anti-retaliation safeguards and document protections now.", score: 12, good: true },
      { text: "Wait to see if retaliation occurs.", score: 4, good: false },
      { text: "Resolve informally only.", score: 2, good: false },
    ],
    why: "Reporter protection should be proactive and documented.",
    categoryKey: "abuseNeglect",
  },
];

const finalAssessment = [
  { q: "Outbreak cluster suspicion should trigger", a: ["Immediate containment escalation", "Routine watch", "End-of-day review only"], c: 0, k: "safety" },
  { q: "Cohorting reliability depends on", a: ["Early routing control", "Ad hoc placement", "Single-room luck"], c: 0, k: "safety" },
  { q: "Rights grievances should be", a: ["Formally intake-routed immediately", "Deferred to discharge", "Handled verbally only"], c: 0, k: "communication" },
  { q: "Grievance closure quality requires", a: ["Owner and timeline accountability", "Acknowledgment only", "Quarterly review only"], c: 0, k: "reporting" },
  { q: "Telehealth privacy starts with", a: ["Secure setup before discussion", "Post-session documentation", "Patient preference only"], c: 0, k: "privacy" },
  { q: "Remote identity uncertainty means", a: ["Withhold PHI until verified", "Share limited details anyway", "Share and correct later"], c: 0, k: "privacy" },
  { q: "Emergency transfer should proceed when", a: ["Receiving acceptance and checklist complete", "Transport arrives", "Sender prefers"], c: 0, k: "reporting" },
  { q: "Handoff packet omissions are", a: ["Reliability risks requiring correction", "Minor formatting issues", "Acceptable if no incident"], c: 0, k: "reporting" },
  { q: "Harassment reports require", a: ["Formal escalation and safeguards", "Private coaching only", "Wait-and-see approach"], c: 0, k: "conduct" },
  { q: "Retaliation indicators should be", a: ["Escalated and documented immediately", "Ignored unless repeated", "Reviewed quarterly"], c: 0, k: "abuseNeglect" },
  { q: "Outbreak overflow response should", a: ["Use surge cohort controls", "Mix populations casually", "Pause care without plan"], c: 0, k: "safety" },
  { q: "Rights communication should be", a: ["Plain-language and time-bound", "Technical only", "Avoided in conflict"], c: 0, k: "communication" },
  { q: "Telehealth platform policy exists to", a: ["Prevent unauthorized disclosure", "Increase complexity", "Replace clinical judgment"], c: 0, k: "privacy" },
  { q: "Transfer checklist discipline improves", a: ["Continuity and safety", "Only billing", "Only optics"], c: 0, k: "reporting" },
  { q: "Reporter protection culture is strongest when", a: ["Safeguards are proactive and non-punitive", "Concerns are deferred", "Reports are minimized"], c: 0, k: "conduct" },
  { q: "Cluster communication across shifts should be", a: ["Closed-loop and explicit", "Assumption-based", "Informal only"], c: 0, k: "safety" },
  { q: "Grievance delays can", a: ["Erode trust and compliance", "Improve outcomes", "Have no impact"], c: 0, k: "communication" },
  { q: "Remote session controls include", a: ["Identity, location, platform verification", "Name only", "Provider memory"], c: 0, k: "privacy" },
  { q: "Transfer acceptance confirmation is", a: ["Mandatory before movement", "Optional", "Needed post-arrival"], c: 0, k: "reporting" },
  { q: "Anti-retaliation follow-through should be", a: ["Tracked to closure", "One-time verbal", "Deferred indefinitely"], c: 0, k: "abuseNeglect" },
  { q: "Outbreak response leadership should prioritize", a: ["Containment speed and reliability", "Convenience placement", "Delay for certainty"], c: 0, k: "safety" },
  { q: "Rights and ombuds pathways should be", a: ["Accessible and immediate", "Hidden until requested repeatedly", "Optional"], c: 0, k: "communication" },
  { q: "Secure telehealth behavior in rush conditions means", a: ["No shortcut on approved controls", "Any app works", "Text sensitive details"], c: 0, k: "privacy" },
  { q: "Harassment-report handling should avoid", a: ["Informal-only resolution", "Documented safeguards", "Escalation ownership"], c: 0, k: "conduct" },
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
    moduleId: lesson.moduleId,
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
    activeModuleIds: state.activeLessons.map((lesson) => lesson.moduleId),
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






