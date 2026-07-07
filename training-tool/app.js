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
      "observation-precaution-reassessment-handoffs",
      "leave-return-screening-contraband-control",
      "dining-room-code-grey-response",
      "critical-lab-result-readback",
      "discharge-release-guardian-verification",
    ],
  },
  {
    id: "nonclinical-staff",
    name: "Non-Clinical Staff",
    persona: "nonclinical",
    departments: ["Admissions", "Support Services"],
    enabledModules: [
      "observation-precaution-reassessment-handoffs",
      "leave-return-screening-contraband-control",
      "dining-room-code-grey-response",
      "critical-lab-result-readback",
      "discharge-release-guardian-verification",
    ],
  },
  {
    id: "leadership-supervisors",
    name: "Leaders and Supervisors",
    persona: "leadership",
    departments: ["Management", "Operations"],
    enabledModules: [
      "observation-precaution-reassessment-handoffs",
      "leave-return-screening-contraband-control",
      "dining-room-code-grey-response",
      "critical-lab-result-readback",
      "discharge-release-guardian-verification",
    ],
  },
];

const MODULE_LIBRARY = [
  { id: "observation-precaution-reassessment-handoffs", title: "Observation Precaution Reassessment and Handoff Clarity" },
  { id: "leave-return-screening-contraband-control", title: "Leave Return Screening and Contraband Re-Entry Control" },
  { id: "dining-room-behavioral-emergency-response", title: "Dining Room Behavioral Emergency Response and Team Role Assignment" },
  { id: "critical-lab-result-readback", title: "Critical Lab Result Escalation and Provider Read-Back" },
  { id: "discharge-release-guardian-verification", title: "Discharge Transportation Release and Guardian Verification" },
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
  title: "Secret Bonus: Critical Lab Alert During Dining Room Behavioral Emergency Response",
  category: "Challenge - Observation, Behavioral Emergency Response, and Release Safety",
  roles: ["clinical", "nonclinical", "leadership"],
  prompt: "A patient on enhanced observation escalates in the dining room, a critical lab result is called in, and the planned discharge escort does not match the authorized guardian. Best first sequence?",
  choices: [
    { text: "Reassign observation coverage, designate a behavioral emergency lead and move bystanders, escalate the critical result with read-back, and hold discharge until guardian authorization is verified.", score: 20, good: true, feedback: "Excellent. This sequence protects patient safety, provider communication, and release control." },
    { text: "Handle the dining room event first and clean up the lab and discharge questions afterward.", score: 8, good: false, feedback: "Single-threading leaves time-sensitive clinical and release risks unresolved." },
    { text: "Send the discharge out to reduce crowding and document everything after the behavioral emergency ends.", score: 2, good: false, feedback: "Unverified discharge and delayed lab escalation create serious safety and compliance exposure." },
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
      title: "Observation Reassessment Example",
      points: [
        "Pause transfer when bedside risk cues conflict with the documented observation level.",
        "Require read-back of the final precaution level before responsibility changes hands.",
      ],
    },
    {
      title: "Leave Return Screening Example",
      points: [
        "Screen re-entry belongings before the patient rejoins peers or receives stored items.",
        "Escalate contraband findings with exact item location and witness documentation.",
      ],
    },
    {
      title: "Dining Room Behavioral Emergency Example",
      points: [
        "Assign one scene lead, one patient-support role, and one bystander-clearing role immediately.",
        "Use least-restrictive verbal de-escalation while preserving meal-area safety.",
      ],
    },
    {
      title: "Critical Lab Escalation Example",
      points: [
        "Repeat the critical value back to the caller and document provider notification time.",
        "Track the resulting order or disposition until a clear next step is confirmed.",
      ],
    },
    {
      title: "Discharge Guardian Verification Example",
      points: [
        "Verify escort identity against the authorized release plan before the patient leaves the unit.",
        "Hold release when transportation, guardian, or handoff instructions do not match the chart.",
      ],
    },
  ],
  nonclinical: [
    {
      title: "Observation Handoff Support",
      points: [
        "Escalate conflicting precaution instructions immediately instead of guessing the lower-risk path.",
        "Document who confirmed the final observation level and when.",
      ],
    },
    {
      title: "Return Screening Support",
      points: [
        "Hold re-entry paperwork open until belongings screening is fully complete.",
        "Log pass return times, screening completion, and any restricted-item escalation.",
      ],
    },
    {
      title: "Behavioral Emergency Access Support",
      points: [
        "Clear unnecessary traffic from the dining room and preserve a safe route for responders.",
        "Relay exact location and behavior cues instead of broad summaries.",
      ],
    },
    {
      title: "Critical Result Routing Support",
      points: [
        "Route critical-result calls to the licensed responder immediately and capture callback numbers accurately.",
        "Record who received the message and whether read-back was completed.",
      ],
    },
    {
      title: "Release Verification Support",
      points: [
        "Compare escort identity, vehicle plan, and release instructions before final sign-out.",
        "Escalate any mismatch instead of improvising a workaround at the exit point.",
      ],
    },
  ],
  leadership: [
    {
      title: "Observation Governance",
      points: [
        "Audit observation downgrade decisions for reassessment evidence and handoff clarity.",
        "Coach teams on stopping transfers when precaution conflicts remain unresolved.",
      ],
    },
    {
      title: "Re-Entry Screening Governance",
      points: [
        "Review re-entry screening misses, contraband finds, and throughput pressure patterns.",
        "Require traceable corrective action when staff skip screening controls for speed.",
      ],
    },
    {
      title: "Behavioral Emergency Governance",
      points: [
        "Review role clarity, bystander safety, and de-escalation sequencing after common-area events.",
        "Measure whether scene leadership is explicit within the first response minute.",
      ],
    },
    {
      title: "Critical Result Governance",
      points: [
        "Audit provider notification timing, read-back evidence, and order-follow-through closure.",
        "Escalate repeat delays in critical-result routing as patient-safety events.",
      ],
    },
    {
      title: "Release Verification Governance",
      points: [
        "Track discharge holds caused by guardian, escort, or transportation mismatches.",
        "Require identity-verification compliance and review near-miss releases for process drift.",
      ],
    },
  ],
};

const TRAINING_CATEGORIES = {
  communication: {
    label: "Discharge Coordination and Guardian Communication",
    retryModule: "Revisit discharge-release and guardian-verification modules to strengthen release clarity and escort coordination.",
  },
  conduct: {
    label: "Behavioral Emergency Team Roles and Scene Discipline",
    retryModule: "Review dining-room behavioral-emergency scenarios to reinforce explicit role assignment and scene control discipline.",
  },
  privacy: {
    label: "Leave Return Screening and Property Control",
    retryModule: "Repeat leave-return screening modules focused on contraband control, item traceability, and safe re-entry handling.",
  },
  reporting: {
    label: "Critical Lab Escalation and Read-Back Reporting",
    retryModule: "Re-run critical-lab escalation scenarios to reinforce provider read-back, notification timing, and documented follow-through.",
  },
  safety: {
    label: "Observation Reassessment and Handoff Safety",
    retryModule: "Revisit observation precaution and reassessment modules to improve risk recognition and handoff closure decisions.",
  },
  abuseNeglect: {
    label: "Critical Multi-Track Escalation",
    retryModule: "Repeat high-risk multi-track scenarios to strengthen urgent sequencing across observation, behavioral emergency response, and release safety controls.",
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
    ? `Complete critical multi-track items to establish the ${abuseNeglectThreshold}% mastery target.`
    : `Critical multi-track mastery finished at ${abuseNeglectPct}% against a ${abuseNeglectThreshold}% target.`;

  if (pass && recommendations.length === 0) {
    return `${roleName}: strong completion. ${abuseNeglectClause} Next step is a monthly refresh focused on observation handoff reliability, critical-result escalation, and release-verification discipline.`;
  }
  if (pass && recommendations.length > 0) {
    return `${roleName}: you passed, and targeted reinforcement is recommended in ${recommendations.map((item) => item.label).join(", ")}. ${abuseNeglectClause} Re-run those modules this week for stronger retention.`;
  }
  return `${roleName}: assessment at ${assessmentPct}%. ${abuseNeglectClause} Complete recommended retry modules, then reattempt the full assessment with focus on observation escalation, code-grey role discipline, and release-verification integrity.`;
}

const coreLessons = [
  {
    moduleId: "observation-precaution-reassessment-handoffs",
    spotlightIndex: 0,
    title: "Lesson 1: Observation Precaution Reassessment and Handoff Clarity",
    body: "Observation safety depends on reassessment triggers, clearly documented precaution levels, and closed-loop handoff before responsibility changes hands.",
    check: "Bedside report says 1:1 observation, but the chart now shows Q15 after recent agitation. Strongest immediate action?",
    answers: [
      { text: "Pause the handoff, reassess risk, reconcile the final observation order with read-back, and document the confirmed level before transfer.", good: true, score: 8 },
      { text: "Default to the less restrictive level until the next round.", good: false, score: 2 },
      { text: "Let the receiving staff decide after the patient is transferred.", good: false, score: 1 },
    ],
    why: "Observation ambiguity must be resolved before responsibility transfer to protect immediate safety.",
    categoryKey: "safety",
    recap: "Checkpoint: observation handoffs require reassessment, read-back, and documented final precaution levels.",
  },
  {
    moduleId: "leave-return-screening-contraband-control",
    spotlightIndex: 1,
    title: "Lesson 2: Leave Return Screening and Contraband Re-Entry Control",
    body: "Return-from-pass safety depends on complete re-entry screening, belongings review, and immediate escalation of contraband concerns before unit reintegration.",
    check: "A patient returns from pass carrying a hoodie bag that was not screened at the entrance. Best response?",
    answers: [
      { text: "Pause reintegration, complete screening and item review now, document the results, and escalate any restricted item findings before release back to the unit.", good: true, score: 8 },
      { text: "Allow re-entry first and screen after the patient settles.", good: false, score: 2 },
      { text: "Skip screening if the staff escort says the pass was uneventful.", good: false, score: 1 },
    ],
    why: "Re-entry screening cannot be skipped without weakening contraband and property controls.",
    categoryKey: "privacy",
    recap: "Checkpoint: leave returns require complete screening, documented item control, and timely escalation of exceptions.",
  },
  {
    moduleId: "dining-room-behavioral-emergency-response",
    spotlightIndex: 2,
    title: "Lesson 3: Dining Room Behavioral Emergency Response and Team Role Assignment",
    body: "Common-area escalation requires explicit role assignment, safe bystander redirection, and least-restrictive de-escalation before scene control is lost.",
    check: "A meal-time argument escalates quickly and three staff respond at once without a clear lead. Best first step?",
    answers: [
      { text: "Name a response lead immediately, assign bystander-clearing and patient-support roles, and begin structured behavioral emergency de-escalation.", good: true, score: 8 },
      { text: "Let each responder manage a different part of the scene independently.", good: false, score: 2 },
      { text: "Wait to assign roles until security arrives.", good: false, score: 1 },
    ],
    why: "Early role clarity keeps a behavioral emergency from becoming chaotic and unsafe.",
    categoryKey: "conduct",
    recap: "Checkpoint: dining-room behavioral emergency response requires explicit leadership, role discipline, and scene control.",
  },
  {
    moduleId: "critical-lab-result-readback",
    spotlightIndex: 3,
    title: "Lesson 4: Critical Lab Result Escalation and Provider Read-Back",
    body: "Critical results require immediate provider notification, read-back verification, and timestamped documentation until the next clinical action is clear.",
    check: "A critical potassium result is called during a busy med round. Best response?",
    answers: [
      { text: "Escalate the result to the provider immediately, complete read-back with exact value, and document the notification time and resulting plan.", good: true, score: 8 },
      { text: "Finish the current workflow and call back when the unit slows down.", good: false, score: 2 },
      { text: "Leave the result in a note for the next shift to address.", good: false, score: 1 },
    ],
    why: "Critical-result delays can create direct patient harm and must be closed-loop.",
    categoryKey: "reporting",
    recap: "Checkpoint: critical lab results require immediate escalation, read-back, and traceable follow-through.",
  },
  {
    moduleId: "discharge-release-guardian-verification",
    spotlightIndex: 4,
    title: "Lesson 5: Discharge Transportation Release and Guardian Verification",
    body: "Discharge release safety depends on verified release authority, transportation readiness, and guardian or escort identity before the patient leaves the unit.",
    check: "A ride-share arrives for a minor discharge, but the authorized guardian listed in the chart is not present. Best immediate response?",
    answers: [
      { text: "Hold release, verify the authorized adult and transportation plan, and escalate any mismatch before discharge proceeds.", good: true, score: 8 },
      { text: "Send the patient if the driver knows the name and destination.", good: false, score: 2 },
      { text: "Have another staff member sign in place of the guardian to avoid delay.", good: false, score: 1 },
    ],
    why: "Unverified release authority creates direct safety and legal exposure.",
    categoryKey: "communication",
    recap: "Checkpoint: discharge release requires confirmed authority, verified escort identity, and clear transportation closure.",
  },
];

const scenarios = [
  {
    title: "Scenario 1: Observation Level Conflict at Shift Change",
    category: "Observation Safety - Immediate Reconciliation",
    roles: ["clinical", "nonclinical", "leadership"],
    prompt: "Bedside says constant observation after self-harm statements, but the handoff sheet says Q15 checks. Best immediate response?",
    choices: [
      { text: "Stop the transfer, reconcile the active observation order with reassessment and read-back, and document the final level before handoff closes.", score: 16, good: true, feedback: "Correct. Observation ambiguity must be resolved before transfer." },
      { text: "Use the lower observation level until someone has time to review it.", score: 6, good: false, feedback: "Defaulting down increases immediate risk." },
      { text: "Let the receiving shift decide after they take responsibility.", score: 2, good: false, feedback: "Delayed reconciliation leaves an unsafe gap." },
    ],
    categoryKey: "safety",
    recap: "Scenario recap: observation conflicts require immediate reconciliation, not post-transfer correction.",
  },
  {
    title: "Scenario 2: Observation Downgrade Without Rationale",
    category: "Observation Safety - Documentation Discipline",
    roles: ["clinical", "leadership"],
    prompt: "Chart now shows a lower precaution level, but there is no reassessment note explaining the change. Best leadership action?",
    choices: [
      { text: "Require immediate clarification of the reassessment basis, restore the last verified level until confirmed, and document the correction path.", score: 18, good: true, feedback: "Correct. Downgrades need explicit rationale and verification." },
      { text: "Assume the new level is valid because it is in the chart.", score: 5, good: false, feedback: "An unexplained downgrade is not reliable just because it is entered." },
      { text: "Leave it for quality review next week.", score: 4, good: false, feedback: "Delayed review leaves active risk unresolved." },
    ],
    categoryKey: "safety",
    recap: "Scenario recap: observation downgrades require verified rationale and immediate correction of unclear charting.",
  },
  {
    title: "Scenario 3: Return From Pass With Unscreened Bag",
    category: "Re-Entry Control - Immediate Screening",
    roles: ["clinical", "nonclinical", "leadership"],
    prompt: "A patient returns from therapeutic pass carrying an unscreened bag and asks to go straight to the dayroom. Best response?",
    choices: [
      { text: "Pause re-entry, complete screening and property review now, and document any restricted item escalation before the patient rejoins peers.", score: 18, good: true, feedback: "Correct. Re-entry screening comes before unit reintegration." },
      { text: "Allow the patient back in and screen once staffing improves.", score: 6, good: false, feedback: "Delayed screening weakens contraband control." },
      { text: "Skip screening because the pass was supervised.", score: 3, good: false, feedback: "Supervision does not replace re-entry screening." },
    ],
    categoryKey: "privacy",
    recap: "Scenario recap: return-from-pass screening must be complete before unit re-entry is allowed.",
  },
  {
    title: "Scenario 4: Restricted Item Found After Partial Screen",
    category: "Re-Entry Control - Exception Escalation",
    roles: ["nonclinical", "leadership"],
    prompt: "A partial bag check later reveals a prohibited lighter after the patient was already readmitted to the unit. Best frontline response?",
    choices: [
      { text: "Remove the item safely, document the screening failure and item location, notify the charge lead, and reset the full re-entry review process.", score: 18, good: true, feedback: "Correct. The miss and recovery both need formal escalation." },
      { text: "Confiscate it quietly and continue operations.", score: 6, good: false, feedback: "Silent recovery hides a process failure." },
      { text: "Discard it and avoid documenting to spare staff blame.", score: 2, good: false, feedback: "Skipping documentation prevents system correction." },
    ],
    categoryKey: "privacy",
    recap: "Scenario recap: missed re-entry screening requires formal escalation, documentation, and process reset.",
  },
  {
    title: "Scenario 5: Dining Room Table Escalation",
    category: "Behavioral Emergency - Immediate Role Assignment",
    roles: ["clinical", "leadership"],
    prompt: "Two patients begin shouting in the dining room and trays start moving. Best immediate action?",
    choices: [
      { text: "Assign a scene lead, direct one responder to move nearby patients, assign one to verbal de-escalation, and activate behavioral emergency support.", score: 18, good: true, feedback: "Correct. Immediate role clarity stabilizes the scene." },
      { text: "Let all nearby staff respond however they think best.", score: 4, good: false, feedback: "Uncoordinated response can worsen the event." },
      { text: "Wait to intervene until a supervisor enters the room.", score: 6, good: false, feedback: "Delay can allow the scene to escalate rapidly." },
    ],
    categoryKey: "conduct",
    recap: "Scenario recap: dining-room behavioral emergency response begins with explicit role assignment and bystander protection.",
  },
  {
    title: "Scenario 6: Behavioral Emergency Scene Closed Without Follow-Through",
    category: "Behavioral Emergency - Leadership Closure",
    roles: ["clinical", "nonclinical", "leadership"],
    prompt: "The immediate dining-room event ends, but no one has reassigned seating, checked bystanders, or documented roles. Best leadership response?",
    choices: [
      { text: "Run immediate scene closure tasks, confirm patient placement and bystander follow-up, document role execution, and coach any gaps now.", score: 18, good: true, feedback: "Correct. Behavioral emergency closure is part of the safety response." },
      { text: "Consider the event over once voices quiet down.", score: 5, good: false, feedback: "Quiet does not equal complete scene control." },
      { text: "Save documentation and coaching for the next staff meeting.", score: 2, good: false, feedback: "Delayed closure loses critical detail and accountability." },
    ],
    categoryKey: "conduct",
    recap: "Scenario recap: behavioral emergency leadership includes scene closure, documentation, and immediate coaching follow-through.",
  },
  {
    title: "Scenario 7: Critical Lab Call During Med Pass",
    category: "Critical Results - Immediate Escalation",
    roles: ["clinical", "nonclinical", "leadership"],
    prompt: "A caller reports a critical lab while the assigned nurse is mid-med pass. Best response?",
    choices: [
      { text: "Interrupt workflow appropriately, route the result for immediate licensed review, complete read-back, and document notification time and owner.", score: 20, good: true, feedback: "Correct. Critical values override routine workflow timing." },
      { text: "Take the message and promise to call later after meds are finished.", score: 6, good: false, feedback: "Delaying critical-result action can directly harm the patient." },
      { text: "Leave the result on voicemail for the provider and move on.", score: 2, good: false, feedback: "Critical results require closed-loop confirmation, not passive handoff." },
    ],
    categoryKey: "reporting",
    recap: "Scenario recap: critical lab results require immediate routing, read-back, and documented ownership.",
  },
  {
    title: "Scenario 8: Provider Called, No Read-Back Documented",
    category: "Critical Results - Closure Verification",
    roles: ["leadership"],
    prompt: "Audit shows critical-result notifications were made, but read-back evidence is missing on several charts. Best leadership action?",
    choices: [
      { text: "Launch corrective review now, require read-back evidence standards, and audit critical-result closure until compliance stabilizes.", score: 20, good: true, feedback: "Correct. Missing read-back is a safety-control failure, not a cosmetic issue." },
      { text: "Treat it as acceptable if provider names are present.", score: 6, good: false, feedback: "Names alone do not prove message accuracy or closure." },
      { text: "Wait for a sentinel event before tightening the process.", score: 2, good: false, feedback: "Waiting for harm is not acceptable governance." },
    ],
    categoryKey: "reporting",
    recap: "Scenario recap: critical-result governance depends on verified read-back and closed-loop evidence.",
  },
  {
    title: "Scenario 9: Wrong Escort for Planned Discharge",
    category: "Release Safety - Guardian Verification",
    roles: ["clinical", "nonclinical", "leadership"],
    prompt: "The person arriving for discharge pickup is not the guardian or escort documented in the release plan. Best response?",
    choices: [
      { text: "Hold release, verify authorization directly, confirm transportation details, and escalate the mismatch before any handoff occurs.", score: 20, good: true, feedback: "Correct. Escort mismatch must stop discharge until resolved." },
      { text: "Release if the patient confirms they know the person.", score: 6, good: false, feedback: "Patient familiarity does not replace release authorization." },
      { text: "Have the escort sign the form and update the chart later.", score: 2, good: false, feedback: "Retroactive release correction is unsafe and noncompliant." },
    ],
    categoryKey: "communication",
    recap: "Scenario recap: discharge release requires verified authority and transportation confirmation before handoff.",
  },
  {
    title: "Scenario 10: Transportation Delay With Release Paperwork Gap",
    category: "Release Safety - Escalation and Closure",
    roles: ["clinical", "leadership"],
    prompt: "Transport is late, the unit is pressuring for discharge, and the release checklist is still missing guardian callback confirmation. Best leadership response?",
    choices: [
      { text: "Keep discharge on hold, complete the missing verification steps, document the delay reason, and escalate throughput pressure rather than bypass controls.", score: 20, good: true, feedback: "Correct. Release safety controls remain mandatory under throughput pressure." },
      { text: "Send the patient once transportation arrives and complete the checklist afterward.", score: 5, good: false, feedback: "Post-release verification defeats the purpose of the control." },
      { text: "Waive the callback item because the unit is backed up.", score: 4, good: false, feedback: "Operational pressure is not a reason to skip release verification." },
    ],
    categoryKey: "abuseNeglect",
    recap: "Scenario recap: discharge-release pressure should trigger escalation, not shortcut release controls.",
  },
];

const lightningQuestions = [
  {
    q: "Observation level conflicts at handoff. First priority?",
    answers: [
      { text: "Reconcile the active precaution with reassessment and read-back before transfer.", score: 12, good: true },
      { text: "Use the least restrictive level for speed.", score: 3, good: false },
      { text: "Let the next shift sort it out.", score: 2, good: false },
    ],
    why: "Observation ambiguity must be corrected before responsibility changes hands.",
    categoryKey: "safety",
  },
  {
    q: "Patient returns from pass with unscreened items. Best action?",
    answers: [
      { text: "Pause re-entry, complete screening now, and escalate any restricted-item issue before release to the unit.", score: 12, good: true },
      { text: "Screen after the patient settles in.", score: 2, good: false },
      { text: "Skip screening if the pass was supervised.", score: 1, good: false },
    ],
    why: "Re-entry controls have to be complete before the patient rejoins the unit.",
    categoryKey: "privacy",
  },
  {
    q: "Critical lab result is called during routine work. Correct action?",
    answers: [
      { text: "Escalate immediately, complete read-back, and document notification time and plan.", score: 12, good: true },
      { text: "Leave a note for the next shift.", score: 3, good: false },
      { text: "Wait for a quieter moment.", score: 1, good: false },
    ],
    why: "Critical values require closed-loop provider communication in real time.",
    categoryKey: "reporting",
  },
  {
    q: "Discharge escort does not match the chart. Best response?",
    answers: [
      { text: "Hold discharge and verify authorization before any release occurs.", score: 12, good: true },
      { text: "Release if the patient recognizes the escort.", score: 4, good: false },
      { text: "Fix the chart after the patient leaves.", score: 2, good: false },
    ],
    why: "Release authority must be confirmed before the patient leaves the unit.",
    categoryKey: "communication",
  },
];

const finalAssessment = [
  { q: "Observation conflict at handoff should trigger", a: ["Immediate reconciliation with read-back", "Use of the lower level by default", "Transfer first and clarify later"], c: 0, k: "safety" },
  { q: "An observation downgrade without reassessment note is", a: ["Acceptable if entered in the chart", "A risk that requires immediate clarification", "Best reviewed at month end"], c: 1, k: "safety" },
  { q: "Return from pass with unscreened belongings requires", a: ["Immediate re-entry screening before unit return", "Screening after the patient settles", "No screening if the trip was supervised"], c: 0, k: "privacy" },
  { q: "A restricted item found after partial screening should lead to", a: ["Quiet confiscation only", "Formal escalation and process reset", "Disposal without documentation"], c: 1, k: "privacy" },
  { q: "Dining room behavioral emergency safety depends first on", a: ["Waiting for leadership arrival", "Explicit role assignment and scene lead", "All responders improvising"], c: 1, k: "conduct" },
  { q: "Scene closure after a behavioral emergency should include", a: ["Patient placement checks and documented follow-through", "Only a quick verbal debrief", "No documentation if the scene calmed"], c: 0, k: "conduct" },
  { q: "A critical lab result during routine workflow requires", a: ["Immediate provider escalation with read-back", "A note for the next shift", "Callback when things slow down"], c: 0, k: "reporting" },
  { q: "Missing read-back evidence on a critical result is", a: ["Fine if a provider name is listed", "A safety-control gap needing correction", "Optional if orders were entered later"], c: 1, k: "reporting" },
  { q: "Discharge should be held when", a: ["Guardian or escort identity does not match the release plan", "Transportation is waiting outside", "The patient says it is fine"], c: 0, k: "communication" },
  { q: "Transportation pressure should", a: ["Override missing release checks", "Trigger escalation but not bypass verification", "Allow after-the-fact checklist completion"], c: 1, k: "communication" },
  { q: "Observation handoff clarity is strongest when", a: ["The final precaution is read back and documented", "Staff rely on memory", "A verbal summary is enough"], c: 0, k: "safety" },
  { q: "Return screening under throughput pressure should", a: ["Skip low-risk bags", "Maintain the full screening standard", "Wait until bedtime rounds"], c: 1, k: "privacy" },
  { q: "In a behavioral emergency, bystander movement should be", a: ["Assigned deliberately as part of the role plan", "Left to chance", "Delayed until security arrives"], c: 0, k: "conduct" },
  { q: "Critical-result documentation should capture", a: ["Time, receiver, read-back, and next action", "Only the result value", "Only the provider name"], c: 0, k: "reporting" },
  { q: "Release authority for a minor is confirmed by", a: ["Recognizing the driver", "The authorized guardian or approved escort record", "The patient asking to leave quickly"], c: 1, k: "communication" },
  { q: "Observation ambiguity left unresolved can cause", a: ["Minor administrative delay only", "Immediate patient-safety exposure", "No meaningful consequence"], c: 1, k: "safety" },
  { q: "Contraband control is strongest when", a: ["Items are screened before re-entry and exceptions are logged", "Screening happens only if staff are concerned", "Bags are assumed safe after passes"], c: 0, k: "privacy" },
  { q: "Behavioral emergency team discipline means", a: ["One lead and defined responder roles", "Everyone chooses tasks independently", "Documentation can wait indefinitely"], c: 0, k: "conduct" },
  { q: "Provider read-back on critical labs helps confirm", a: ["Message accuracy and immediate ownership", "Only courtesy", "That documentation can be skipped"], c: 0, k: "reporting" },
  { q: "Guardian verification at discharge protects", a: ["Release speed only", "Patient safety and legal handoff integrity", "Parking flow"], c: 1, k: "communication" },
  { q: "A high-risk multi-track event should be managed by", a: ["Sequencing urgent controls across safety, reporting, and release", "Choosing whichever issue is loudest and ignoring the rest", "Documenting first and acting later"], c: 0, k: "abuseNeglect" },
  { q: "If observation reassessment is pending, staff should", a: ["Transfer anyway to stay on schedule", "Keep the last verified protection in place until clarified", "Let the receiving team guess"], c: 1, k: "safety" },
  { q: "Leave-return property control improves with", a: ["Signed screening completion and exception escalation", "Verbal acknowledgment only", "Delayed logging at shift end"], c: 0, k: "privacy" },
  { q: "Dining room event review is strongest when", a: ["Role timing and closure gaps are coached immediately", "It waits for quarterly review only", "No one names the scene lead"], c: 0, k: "conduct" },
  { q: "Best annual completion standard", a: ["Pass score plus acknowledgment", "Attendance only", "No tracking"], c: 0, k: "knowledgeCheck" },
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
