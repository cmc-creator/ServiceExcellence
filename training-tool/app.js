const state = {
  role: "clinical",
  score: 0,
  streak: 0,
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
  attemptId: null,
  learnerEmail: null,
  learnerName: null,
};

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
    roleTrack: state.role,
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
        roleTrack: state.role,
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
  map: document.getElementById("mapPanel"),
  scenario: document.getElementById("scenarioPanel"),
  lightning: document.getElementById("lightningPanel"),
  assessment: document.getElementById("assessmentPanel"),
  results: document.getElementById("resultsPanel"),
};

const roleSelect = document.getElementById("roleSelect");
const trackSummary = document.getElementById("trackSummary");
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
    roleTrack: state.role,
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
}

function updateHUD() {
  scoreChip.textContent = `Score: ${state.score}`;
  streakChip.textContent = `Streak: ${state.streak}`;
  timerChip.textContent = `Timer: ${state.lightningTimer}s`;
}

function buildRoleTrack() {
  state.activeScenarios = scenarios.filter((item) => item.roles.includes(state.role));
  trackSummary.textContent = `${roleLabels[state.role]} track includes ${state.activeScenarios.length} tailored scenarios.`;
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

  resultSummary.textContent = `Track: ${roleLabels[state.role]}. Final Score: ${state.score}. Assessment: ${assessmentPct}% (${state.assessmentCorrect}/${finalAssessment.length}). Tier: ${level}. Annual status: ${pass ? "PASS" : "REMEDIATE"}.`;

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

document.getElementById("beginScenarioBtn").addEventListener("click", () => {
  showPanel("scenario");
  renderScenario();
});

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

initScorm();
buildRoleTrack();
updateHUD();
