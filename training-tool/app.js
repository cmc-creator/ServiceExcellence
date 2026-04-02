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
  finalized: false,
  pass: false,
  lessonsCompleted: false,
  attemptId: null,
  learnerEmail: null,
  learnerName: null,
};

const ROLE_CONFIG_KEY = "nyxRoleConfigs";

const defaultRoleConfigs = [
  {
    id: "clinical-staff",
    name: "Clinical Staff",
    persona: "clinical",
    departments: ["Nursing", "Behavioral Health"],
  },
  {
    id: "nonclinical-staff",
    name: "Non-Clinical Staff",
    persona: "nonclinical",
    departments: ["Admissions", "Support Services"],
  },
  {
    id: "leadership-supervisors",
    name: "Leaders and Supervisors",
    persona: "leadership",
    departments: ["Management", "Operations"],
  },
];

let roleConfigs = [];
let editingRoleId = null;

const API_BASE =
  localStorage.getItem("nyxApiBase") ||
  window.NYX_API_BASE ||
  "";

const ORG_SLUG =
  localStorage.getItem("nyxOrgSlug") ||
  window.NYX_ORG_SLUG ||
  "destiny-springs-healthcare";

async function apiRequest(path, options = {}) {
  if (!API_BASE) return null;

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

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
    return parsed.filter((item) => item?.id && item?.name && item?.persona);
  } catch {
    return [...defaultRoleConfigs];
  }
}

function saveRoleConfigs() {
  localStorage.setItem(ROLE_CONFIG_KEY, JSON.stringify(roleConfigs));
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
      title: "Nursing Example",
      points: [
        "During intake stress, acknowledge family frustration before discussing throughput.",
        "Use calm tone and clear next-step timing to reduce escalation risk.",
      ],
    },
    {
      title: "Nursing Unit Conduct Example",
      points: [
        "Stop disrespectful language immediately and redirect to professional communication.",
        "Document repeated behavior concerns through approved reporting channels.",
      ],
    },
    {
      title: "Clinical Privacy Example",
      points: [
        "Discuss patient details only in private settings with care-relevant staff.",
        "Avoid hallway updates that expose sensitive psychiatric information.",
      ],
    },
    {
      title: "Safety Reporting Example",
      points: [
        "Escalate missing safety-plan documentation as a reportable reliability event.",
        "Capture facts quickly to support immediate corrective action.",
      ],
    },
    {
      title: "Handoff Example",
      points: [
        "Use closed-loop read-back for suicide risk triggers and observation level changes.",
        "Confirm receiving clinician repeats key risks and follow-up tasks.",
      ],
    },
  ],
  nonclinical: [
    {
      title: "Admissions Example",
      points: [
        "Set clear expectations for wait times and check back proactively.",
        "Use empathy statements before process explanations.",
      ],
    },
    {
      title: "EVS and Support Services Conduct Example",
      points: [
        "Maintain respectful language in all shared spaces, even under pressure.",
        "Report recurring disrespectful conduct through the same channels as clinical teams.",
      ],
    },
    {
      title: "Front Desk Privacy Example",
      points: [
        "Verify caller authorization before confirming patient presence.",
        "Share only minimum necessary details aligned to policy.",
      ],
    },
    {
      title: "Operational Reporting Example",
      points: [
        "If you see compliance drift, report facts instead of assuming someone else will.",
        "Protect non-retaliation by using formal pathways.",
      ],
    },
    {
      title: "Cross-Team Handoff Example",
      points: [
        "Transfer requests with accurate context, not partial summaries.",
        "Confirm receiving team understands urgency and required actions.",
      ],
    },
  ],
  leadership: [
    {
      title: "Leadership Rounding Example",
      points: [
        "Coach staff in real time on empathy language and service recovery behaviors.",
        "Reinforce expectation: ownership first, excuses never first.",
      ],
    },
    {
      title: "Leadership Conduct Example",
      points: [
        "Address policy violations consistently across all departments.",
        "Model visible accountability to set culture standards.",
      ],
    },
    {
      title: "Leadership Privacy Oversight",
      points: [
        "Audit high-risk communication zones and correct privacy drift quickly.",
        "Ensure minimum-necessary rules are practiced, not just documented.",
      ],
    },
    {
      title: "Escalation Governance Example",
      points: [
        "Do not suppress reportable concerns for optics.",
        "Track corrective actions and close the loop with documented outcomes.",
      ],
    },
    {
      title: "Reliability Leadership Example",
      points: [
        "Require handoff read-back norms in daily operations.",
        "Monitor misses and coach teams on prevention patterns.",
      ],
    },
  ],
};

const coreLessons = [
  {
    title: "Lesson 1: Service Excellence Foundation",
    body: "Service excellence in psychiatric acute inpatient care starts with calm presence, empathy, and clear ownership. Every interaction should reduce uncertainty and build patient and family trust.",
    check: "Which action best reflects service excellence in the first minute of a tense interaction?",
    answers: [
      { text: "Acknowledge concerns, apologize for delays, and give a specific next step.", good: true, score: 8 },
      { text: "Explain policies first and skip emotions to stay efficient.", good: false, score: 1 },
      { text: "Redirect to another team member without context.", good: false, score: 0 },
    ],
    why: "Empathy plus a clear plan lowers tension and builds confidence.",
  },
  {
    title: "Lesson 2: Code of Conduct Essentials",
    body: "Code of Conduct means acting with integrity even under pressure: respect for every person, professional language, and policy-aligned behavior across clinical and non-clinical roles.",
    check: "What is the strongest conduct response when witnessing inappropriate behavior?",
    answers: [
      { text: "Address respectfully in the moment and report repeated patterns.", good: true, score: 8 },
      { text: "Ignore it if patient care is not directly affected.", good: false, score: 0 },
      { text: "Discuss it informally with peers only.", good: false, score: 1 },
    ],
    why: "Respect and accountability require action, not passive observation.",
  },
  {
    title: "Lesson 3: Confidentiality and Minimum Necessary",
    body: "Protected information must stay private. Share only what is required for care operations, and only with authorized individuals in appropriate settings.",
    check: "Which statement matches minimum necessary access?",
    answers: [
      { text: "Share only information required for the specific task with authorized personnel.", good: true, score: 8 },
      { text: "Share full context with any coworker to avoid repeat questions.", good: false, score: 0 },
      { text: "Share details if a caller sounds confident.", good: false, score: 0 },
    ],
    why: "Minimum necessary protects patients and reduces compliance risk.",
  },
  {
    title: "Lesson 4: Speaking Up and Reporting",
    body: "Potential misconduct, safety risks, or retaliation concerns must be escalated through approved channels. Timely factual reporting protects patients, staff, and the organization.",
    check: "What is the correct response to a potentially reportable concern?",
    answers: [
      { text: "Document facts and report promptly using approved pathways.", good: true, score: 8 },
      { text: "Wait to see if it resolves itself before saying anything.", good: false, score: 1 },
      { text: "Keep it within your team to avoid visibility.", good: false, score: 0 },
    ],
    why: "Prompt transparent reporting is a core compliance expectation.",
  },
  {
    title: "Lesson 5: Communication and Safe Handoffs",
    body: "High-reliability handoffs use closed-loop communication: state key risk facts, confirm understanding, and verify next actions. Documentation should be timely and accurate.",
    check: "What creates the safest handoff?",
    answers: [
      { text: "Closed-loop read-back with documented risks and plans.", good: true, score: 8 },
      { text: "Quick verbal summary without confirmation.", good: false, score: 1 },
      { text: "Assume the next shift can review charts later.", good: false, score: 0 },
    ],
    why: "Read-back prevents omissions and reduces patient harm.",
  },
];

const scenarios = [
  {
    title: "Scenario 1: Waiting Room Heat",
    category: "Service Excellence - De-escalation",
    roles: ["clinical", "nonclinical", "leadership"],
    prompt: "In the behavioral health intake area, a family member says they have been waiting forever while others watch. What is your best first move?",
    choices: [
      { text: "Lead with staffing excuses.", score: 4, good: false, feedback: "Context helps, but empathy and a clear next step should come first." },
      { text: "Acknowledge frustration, apologize, and provide a specific update time.", score: 16, good: true, feedback: "Excellent service recovery opener." },
      { text: "Avoid engagement and look for someone else to handle it.", score: 2, good: false, feedback: "Ownership is critical for trust." },
    ],
  },
  {
    title: "Scenario 2: Hallway Confidentiality",
    category: "Code of Conduct - Privacy",
    roles: ["clinical", "nonclinical", "leadership"],
    prompt: "Behavioral health details are being discussed in a public hallway near visitors. What should you do?",
    choices: [
      { text: "Walk away and assume they know policy.", score: 0, good: false, feedback: "Silence can normalize risk." },
      { text: "Interrupt respectfully, move to private space, and remind of policy.", score: 18, good: true, feedback: "Correct. Immediate intervention protects patient trust." },
      { text: "Post a generic reminder later.", score: 4, good: false, feedback: "Indirect delayed response is not enough." },
    ],
  },
  {
    title: "Scenario 3: Clinical Handoff Gaps",
    category: "Service Excellence - Communication",
    roles: ["clinical"],
    prompt: "A shift handoff missed a recent self-harm risk trigger and safety plan note. What is your best immediate action?",
    choices: [
      { text: "Wait for next shift and avoid blame.", score: 1, good: false, feedback: "Delay creates avoidable risk." },
      { text: "Correct the record now, notify team, and use closed-loop read-back.", score: 18, good: true, feedback: "Right move for safety and reliability." },
      { text: "Message one colleague and hope it spreads.", score: 4, good: false, feedback: "Critical updates need clear accountable communication." },
    ],
  },
  {
    title: "Scenario 4: Front Desk Data Request",
    category: "Code of Conduct - Minimum Necessary Access",
    roles: ["nonclinical"],
    prompt: "A caller asks if a patient is currently admitted to the behavioral health unit and claims to be a relative. What do you do first?",
    choices: [
      { text: "Share details quickly to be helpful.", score: 0, good: false, feedback: "Speed does not override privacy rules." },
      { text: "Verify identity and authorization before sharing any protected details.", score: 18, good: true, feedback: "Correct and compliant response." },
      { text: "Transfer without notes and move on.", score: 5, good: false, feedback: "Transfer alone does not close the risk." },
    ],
  },
  {
    title: "Scenario 5: Vendor Gift Basket",
    category: "Code of Conduct - Conflict of Interest",
    roles: ["leadership", "nonclinical"],
    prompt: "A vendor sends an expensive gift with language implying influence. Best action?",
    choices: [
      { text: "Share it quietly with the team.", score: 1, good: false, feedback: "A hidden gift is still a policy issue." },
      { text: "Decline or return, disclose, and document through proper channel.", score: 18, good: true, feedback: "Correct transparent action." },
      { text: "Keep it offsite to avoid optics.", score: 0, good: false, feedback: "Optics are not the only problem, policy is." },
    ],
  },
  {
    title: "Scenario 6: Manager Pressure",
    category: "Code of Conduct - Speak Up",
    roles: ["leadership"],
    prompt: "A supervisor asks to keep a reportable issue internal to avoid attention. What is the right response?",
    choices: [
      { text: "Agree to avoid conflict.", score: 0, good: false, feedback: "Suppression of reportable concerns is high risk." },
      { text: "Escalate through approved reporting channels and document facts.", score: 20, good: true, feedback: "Correct, this supports non-retaliation and integrity." },
      { text: "Wait a week and see if it resolves itself.", score: 2, good: false, feedback: "Delay can worsen impact and exposure." },
    ],
  },
];

const lightningQuestions = [
  {
    q: "A coworker makes an inappropriate joke targeting a protected group. Best response?",
    answers: [
      { text: "Ignore it.", score: 0, good: false },
      { text: "Address respectfully and report patterns.", score: 12, good: true },
      { text: "Record for social media.", score: 0, good: false },
    ],
    why: "Respect standards apply in every setting.",
  },
  {
    q: "You are asked to chart a task you did not complete. Best action?",
    answers: [
      { text: "Chart anyway to avoid delay.", score: 0, good: false },
      { text: "Refuse inaccurate charting and escalate appropriately.", score: 12, good: true },
      { text: "Ask someone else to sign it.", score: 0, good: false },
    ],
    why: "Documentation integrity is mandatory.",
  },
  {
    q: "Feedback says communication felt cold. What improves trust fastest?",
    answers: [
      { text: "Empathy language and clear next steps.", score: 12, good: true },
      { text: "Longer policy explanations.", score: 3, good: false },
      { text: "Avoid hard conversations.", score: 0, good: false },
    ],
    why: "Clear empathy outperforms scripted formality.",
  },
];

const finalAssessment = [
  { q: "In psychiatric acute inpatient care, service excellence starts with", a: ["Calm empathy and ownership", "Avoiding difficult conversations", "Speed over clarity"], c: 0 },
  { q: "If a patient complaint escalates, first step is", a: ["Defend your team", "Acknowledge and clarify next action", "Exit conversation"], c: 1 },
  { q: "Confidentiality should be discussed", a: ["Only in private appropriate settings", "Anywhere if quick", "Only by managers"], c: 0 },
  { q: "Gift policy concerns should be", a: ["Documented and disclosed", "Ignored if shared", "Handled privately"], c: 0 },
  { q: "Respectful workplace means", a: ["No harmful jokes or slurs", "Intent matters more than impact", "Humor has no limits"], c: 0 },
  { q: "When unsure about reporting", a: ["Do nothing", "Use approved channels promptly", "Ask social media"], c: 1 },
  { q: "Charting should be", a: ["Accurate and truthful", "Adjusted to help team", "Backfilled from memory only"], c: 0 },
  { q: "Conflict of interest is best handled by", a: ["Disclosure and guidance", "Private side decisions", "Verbal only notice"], c: 0 },
  { q: "Service recovery includes", a: ["Ownership, apology, follow-through", "Silence", "Transfer blame"], c: 0 },
  { q: "Minimum necessary data means", a: ["Share all with coworkers", "Share only what is required", "Share if asked twice"], c: 1 },
  { q: "Retaliation concerns should be", a: ["Reported and documented", "Handled informally only", "Ignored"], c: 0 },
  { q: "A high-trust handoff uses", a: ["Closed-loop read-back", "Assumptions", "Partial details"], c: 0 },
  { q: "In tense moments, tone should be", a: ["Calm and clear", "Cold and short", "Defensive"], c: 0 },
  { q: "If policy and convenience conflict", a: ["Convenience wins", "Policy wins", "Manager mood wins"], c: 1 },
  { q: "Escalation pathways should be", a: ["Known and practiced", "Used only annually", "Avoided"], c: 0 },
  { q: "Respect means", a: ["Professional language always", "Only with patients", "Only in meetings"], c: 0 },
  { q: "A compliance red flag should trigger", a: ["Prompt review or report", "Silence", "Jokes"], c: 0 },
  { q: "Patient trust grows when teams are", a: ["Transparent and responsive", "Busy and vague", "Detached"], c: 0 },
  { q: "Annual training objective is", a: ["Behavior change", "Checkbox completion", "Minimal score"], c: 0 },
  { q: "If you witness possible misconduct", a: ["Report facts through channels", "Investigate privately", "Ignore"], c: 0 },
  { q: "Manager role in conduct includes", a: ["Modeling and enforcing standards", "Selective enforcement", "Silence"], c: 0 },
  { q: "Documentation timing should be", a: ["Prompt and accurate", "Delayed weekly", "When convenient"], c: 0 },
  { q: "Privacy includes", a: ["Verbal, written, and digital safeguards", "Only paper records", "Only nurse stations"], c: 0 },
  { q: "Humor at work should", a: ["Stay respectful and inclusive", "Target groups", "Bypass policy"], c: 0 },
  { q: "Best annual completion standard", a: ["Pass score plus acknowledgment", "Attendance only", "No tracking"], c: 0 },
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
const nextScenarioBtn = document.getElementById("nextScenarioBtn");
const lightningQuestion = document.getElementById("lightningQuestion");
const lightningChoices = document.getElementById("lightningChoices");
const lightningFeedback = document.getElementById("lightningFeedback");
const finishBtn = document.getElementById("finishBtn");
const assessmentProgress = document.getElementById("assessmentProgress");
const assessmentQuestion = document.getElementById("assessmentQuestion");
const assessmentChoices = document.getElementById("assessmentChoices");
const assessmentFeedback = document.getElementById("assessmentFeedback");
const nextAssessmentBtn = document.getElementById("nextAssessmentBtn");
const resultSummary = document.getElementById("resultSummary");
const badgeRow = document.getElementById("badgeRow");
const attestCheckbox = document.getElementById("attestCheckbox");
const submissionStatus = document.getElementById("submissionStatus");
const submitCompletionBtn = document.getElementById("submitCompletionBtn");

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
  state.activeScenarios = scenarios.filter((item) => item.roles.includes(persona));
  trackSummary.textContent = `${roleName} includes ${coreLessons.length} core lessons and ${state.activeScenarios.length} tailored scenarios.`;
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
  roleConfigStatus.textContent = message;
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
    meta.textContent = `Base track: ${roleLabels[item.persona]} | Departments: ${(item.departments || []).join(", ") || "None"}`;
    card.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "cta-row";

    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-secondary btn-sm";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      editingRoleId = item.id;
      roleEditorTitle.textContent = "Edit Role";
      roleNameInput.value = item.name;
      rolePersonaSelect.value = item.persona;
      roleDepartmentsInput.value = (item.departments || []).join(", ");
      roleConfigStatus.textContent = "Editing role. Save to apply updates.";
    });
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-secondary btn-sm";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      if (roleConfigs.length <= 1) {
        roleConfigStatus.textContent = "At least one role is required.";
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

function upsertRoleFromForm() {
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

  if (editingRoleId) {
    roleConfigs = roleConfigs.map((item) =>
      item.id === editingRoleId ? { ...item, name, persona, departments } : item,
    );
    if (state.role === editingRoleId) state.role = editingRoleId;
    saveRoleConfigs();
    renderRoleSelect();
    renderRoleList();
    buildRoleTrack();
    clearRoleEditor("Role updated.");
    return;
  }

  let id = slugifyRoleId(name) || `role-${Date.now()}`;
  let suffix = 1;
  while (roleConfigs.some((item) => item.id === id)) {
    id = `${slugifyRoleId(name)}-${suffix}`;
    suffix += 1;
  }

  roleConfigs.push({ id, name, persona, departments });
  state.role = id;
  saveRoleConfigs();
  renderRoleSelect();
  renderRoleList();
  buildRoleTrack();
  clearRoleEditor("Role created.");
}

function updateLessonRail() {
  if (!lessonRail) return;
  const steps = Array.from(lessonRail.querySelectorAll(".lesson-step"));
  const completedCount = state.lessonPassed.size;
  const percent = Math.round((completedCount / coreLessons.length) * 100);

  steps.forEach((step, index) => {
    const key = `lesson-${index}`;
    step.classList.remove("active", "complete");
    step.textContent = String(index + 1);

    if (state.lessonPassed.has(key)) {
      step.classList.add("complete");
      step.textContent = "✓";
    }

    if (index === state.lessonIndex && !state.lessonPassed.has(key)) {
      step.classList.add("active");
    }
  });

  if (lessonProgressLabel) {
    lessonProgressLabel.textContent = `${completedCount} of ${coreLessons.length} lessons complete (${percent}%)`;
  }

  if (lessonProgressFill) {
    lessonProgressFill.style.width = `${percent}%`;
  }
}

function renderLesson() {
  const lesson = coreLessons[state.lessonIndex];
  const lessonKey = `lesson-${state.lessonIndex}`;
  const attempts = state.lessonAttempts[lessonKey] || 0;
  const persona = getCurrentRolePersona();
  const spotlight = roleDepartmentSpotlights[persona][state.lessonIndex];
  const facilityDepartments = getCurrentRoleDepartments();

  updateLessonRail();

  lessonTitle.textContent = lesson.title;
  lessonProgress.textContent = `Lesson ${state.lessonIndex + 1} of ${coreLessons.length}`;
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

  if (answer.good) {
    if (!state.lessonPassed.has(lessonKey)) {
      state.score += answer.score;
      state.lessonPassed.add(lessonKey);
    }
    state.streak = state.streak + 1;
    state.badges.add("Knowledge Builder");
  } else {
    state.streak = 0;
  }

  lessonFeedback.textContent = `${answer.good ? "Correct." : "Not quite."} ${lesson.why}`;
  lessonFeedback.className = `feedback ${answer.good ? "good" : "warn"}`;

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
}

function nextLesson() {
  state.lessonIndex += 1;
  if (state.lessonIndex >= coreLessons.length) {
    state.lessonsCompleted = true;
    updateLessonRail();
    trackEvent("completed-core-lessons", { totalLessons: coreLessons.length });
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
  state.score += choice.score;
  state.streak = choice.good ? state.streak + 1 : 0;

  if (choice.good) {
    state.badges.add("Trust Builder");
  }
  if (state.streak >= 3) {
    state.badges.add("Consistency Pro");
  }

  feedbackBox.textContent = choice.feedback;
  feedbackBox.classList.remove("hidden");
  feedbackBox.classList.add(choice.good ? "good" : "warn");

  Array.from(choiceList.querySelectorAll("button")).forEach((button) => {
    button.disabled = true;
    button.style.opacity = "0.65";
  });

  trackEvent("answered-scenario", { scenario: scenarioTitleValue, good: choice.good, points: choice.score });
  nextScenarioBtn.classList.remove("hidden");
  updateHUD();
}

function nextScenario() {
  state.scenarioIndex += 1;
  if (state.scenarioIndex >= state.activeScenarios.length) {
    showPanel("lightning");
    startLightning();
    return;
  }
  renderScenario();
}

function startLightning() {
  state.lightningActive = true;
  state.lightningTimer = 60;
  state.lightningIndex = 0;
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
  finishBtn.classList.add("hidden");
  lightningChoices.innerHTML = "";

  item.answers.forEach((answer) => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.textContent = answer.text;
    btn.addEventListener("click", () => evaluateLightning(answer, item.why, item.q));
    lightningChoices.appendChild(btn);
  });
}

function evaluateLightning(answer, why, question) {
  if (!state.lightningActive) return;

  state.score += answer.score;
  state.streak = answer.good ? state.streak + 1 : 0;
  if (answer.good) state.badges.add("Policy Sprinter");

  lightningFeedback.textContent = `${answer.good ? "Correct." : "Not ideal."} ${why}`;
  lightningFeedback.className = `feedback ${answer.good ? "good" : "warn"}`;

  Array.from(lightningChoices.querySelectorAll("button")).forEach((button) => {
    button.disabled = true;
    button.style.opacity = "0.65";
  });

  state.lightningIndex += 1;
  trackEvent("answered-lightning", { question, good: answer.good, points: answer.score });
  updateHUD();

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
  if (correct) {
    state.assessmentCorrect += 1;
    state.score += 4;
  }

  assessmentFeedback.textContent = correct ? "Correct." : `Not correct. Best answer: ${item.a[item.c]}`;
  assessmentFeedback.className = `feedback ${correct ? "good" : "warn"}`;
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
  const assessmentPct = Math.round((state.assessmentCorrect / finalAssessment.length) * 100);
  const level = state.score >= 170 ? "Gold" : state.score >= 130 ? "Silver" : "Bronze";
  const pass = assessmentPct >= 80;

  state.pass = pass;

  if (assessmentPct >= 90) state.badges.add("Assessment Ace");
  if (pass) state.badges.add("Compliance Guardian");
  if (state.score >= 170) state.badges.add("Patient Experience Champion");

  resultSummary.textContent = `Track: ${getCurrentRoleName()}. Final Score: ${state.score}. Assessment: ${assessmentPct}% (${state.assessmentCorrect}/${finalAssessment.length}). Tier: ${level}. Annual status: ${pass ? "PASS" : "REMEDIATE"}.`;

  badgeRow.innerHTML = "";
  Array.from(state.badges).forEach((name) => {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = name;
    badgeRow.appendChild(badge);
  });

  submissionStatus.textContent = "Review your score, check the acknowledgment box, then submit completion.";

  trackEvent("completed-training", {
    assessmentPercent: assessmentPct,
    assessmentCorrect: state.assessmentCorrect,
    assessmentTotal: finalAssessment.length,
    level,
    pass,
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
  ).finally(() => {
    submissionStatus.textContent = scorm.initialized
      ? "Completion submitted to LMS successfully."
      : "Completion saved locally. LMS was not connected in this session.";
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
  attestCheckbox.checked = false;
  submissionStatus.textContent = "";
  buildRoleTrack();
  clearInterval(timerHandle);
  updateHUD();
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

document.getElementById("beginScenarioBtn").addEventListener("click", () => {
  showPanel("lesson");
  state.lessonIndex = 0;
  state.lessonAttempts = {};
  state.lessonPassed = new Set();
  trackEvent("started-core-lessons", { totalLessons: coreLessons.length });
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

roleSelect.addEventListener("change", () => {
  state.role = roleSelect.value;
  buildRoleTrack();
});

window.addEventListener("beforeunload", () => {
  saveSuspendData();
  scormTerminate();
});

roleConfigs = loadRoleConfigs();
renderRoleSelect();
buildRoleTrack();
initScorm();
updateHUD();
