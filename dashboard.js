// ============================================================
// DASHBOARD.JS — Post-login user dashboard
// ============================================================

// ---- Stored session values ----
const apiBase = localStorage.getItem("nyxApiBase") || "";
const token = localStorage.getItem("nyxAuthToken") || "";
const storedName = localStorage.getItem("nyxLearnerName") || "Learner";
const storedEmail = localStorage.getItem("nyxLearnerEmail") || "";
const storedRole = localStorage.getItem("nyxUserRole") || "STAFF";

// ---- Element refs ----
const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const errorMessage = document.getElementById("errorMessage");
const dashContent = document.getElementById("dashContent");
const retryBtn = document.getElementById("retryBtn");
const signOutBtn = document.getElementById("signOutBtn");
const navUserName = document.getElementById("navUserName");

// ---- Auth guard ----
if (!token || !apiBase) {
  window.location.replace("login.html?session=required");
}

// ---- Reveal-on-scroll observer ----
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  },
  { threshold: 0.12 }
);

function observeRevealNodes() {
  document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));
}

// ---- Sign out ----
signOutBtn.addEventListener("click", () => {
  const clearKeys = [
    "nyxAuthToken",
    "nyxLearnerName",
    "nyxLearnerEmail",
    "nyxUserRole",
    "nyxApiBase",
    "nyxOrgSlug",
    "nyxRoleConfigs",
    "nyxSoundEnabled",
    "nyxSeasonalAchievements",
    "nyxBrandMode",
  ];
  clearKeys.forEach((k) => localStorage.removeItem(k));
  window.location.replace("login.html");
});

// ---- Retry ----
retryBtn.addEventListener("click", () => {
  errorState.classList.add("hidden");
  loadingState.classList.remove("hidden");
  loadDashboard();
});

// ---- Change password ----
const changePwdBtn = document.getElementById("changePwdBtn");
const changePwdModal = document.getElementById("changePwdModal");
const cpCancelBtn = document.getElementById("cpCancelBtn");
const cpSubmitBtn = document.getElementById("cpSubmitBtn");
const cpStatus = document.getElementById("cpStatus");

changePwdBtn.addEventListener("click", () => {
  document.getElementById("cpCurrent").value = "";
  document.getElementById("cpNew").value = "";
  document.getElementById("cpConfirm").value = "";
  cpStatus.textContent = "";
  cpStatus.className = "modal-status";
  changePwdModal.classList.remove("hidden");
});
cpCancelBtn.addEventListener("click", () => changePwdModal.classList.add("hidden"));
changePwdModal.addEventListener("click", (e) => {
  if (e.target === changePwdModal) changePwdModal.classList.add("hidden");
});
cpSubmitBtn.addEventListener("click", async () => {
  const current = document.getElementById("cpCurrent").value;
  const next = document.getElementById("cpNew").value;
  const confirm = document.getElementById("cpConfirm").value;
  if (!current || !next || !confirm) {
    cpStatus.textContent = "All fields are required.";
    cpStatus.className = "modal-status is-error";
    return;
  }
  if (next.length < 8) {
    cpStatus.textContent = "New password must be at least 8 characters.";
    cpStatus.className = "modal-status is-error";
    return;
  }
  if (next !== confirm) {
    cpStatus.textContent = "New passwords do not match.";
    cpStatus.className = "modal-status is-error";
    return;
  }
  cpSubmitBtn.disabled = true;
  cpStatus.textContent = "Updating...";
  cpStatus.className = "modal-status";
  try {
    const res = await fetch(`${apiBase}/api/auth/change-password`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    changePwdModal.classList.add("hidden");
    showToast("Password updated successfully.", "success");
  } catch (err) {
    cpStatus.textContent = err.message || "Failed to update password.";
    cpStatus.className = "modal-status is-error";
  } finally {
    cpSubmitBtn.disabled = false;
  }
});

// ---- Helpers ----
function fmt(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtShort(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function scoreLabel(pct) {
  if (pct === null || pct === undefined) return "—";
  return `${pct}%`;
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function sanitizeText(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---- Session expiry warning ----
function checkSessionExpiry() {
  if (!token) return;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (!payload.exp) return;
    const remainingSec = payload.exp - Math.floor(Date.now() / 1000);
    if (remainingSec <= 0) {
      window.location.replace("login.html?session=expired");
      return;
    }
    if (remainingSec < 1800) {
      const mins = Math.ceil(remainingSec / 60);
      const warning = document.getElementById("sessionWarning");
      const msg = document.getElementById("sessionWarningMsg");
      if (warning && msg) {
        msg.textContent = `Session expires in ${mins} minute${mins !== 1 ? "s" : ""}. Sign in again to continue.`;
        warning.classList.remove("hidden");
      }
      setTimeout(() => window.location.replace("login.html?session=expired"), remainingSec * 1000);
    }
  } catch {
    // non-critical
  }
}

// ---- Toast ----
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visible"));
  setTimeout(() => {
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ---- Fetch training status ----
async function fetchMyStatus() {
  const res = await fetch(`${apiBase}/api/training/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("nyxAuthToken");
    window.location.replace("login.html?session=required");
    return null;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Unexpected response: ${res.status}`);
  }

  return res.json();
}

// ---- Determine overall status ----
function deriveOverallStatus(data) {
  const { summary } = data;

  if (summary.totalCourses === 0) return "not-started";
  if (summary.completedCourses > 0 && summary.completedCourses === summary.totalCourses) return "complete";
  if (summary.inProgressAttempts > 0) return "in-progress";
  if (summary.failedAttempts > 0 && summary.passedAttempts === 0) return "failed";
  if (summary.passedAttempts > 0) return "in-progress"; // passed but not all complete
  return "not-started";
}

// ---- Render welcome hero ----
function renderWelcome(data) {
  document.getElementById("welcomeDate").textContent = todayLabel();

  const name = data.learner?.fullName || storedName || "Learner";
  document.getElementById("welcomeHeading").textContent = `Welcome back, ${name}.`;

  const roleTrack = data.learner?.roleTrack || "";
  const sub = roleTrack
    ? `${roleTrack} track | ${storedEmail}`
    : storedEmail;
  document.getElementById("welcomeSub").textContent = sub;

  navUserName.textContent = `${name} (${storedRole.toLowerCase()})`;

  // Admin panel link for elevated roles
  const adminLink = document.getElementById("adminPanelLink");
  if (adminLink) {
    if (["OWNER", "ADMIN", "MANAGER"].includes(storedRole)) {
      adminLink.classList.remove("hidden");
    }
  }

  const status = deriveOverallStatus(data);
  const badge = document.getElementById("overallStatusBadge");
  const icon = document.getElementById("badgeIcon");
  const label = document.getElementById("badgeLabel");

  const statusMap = {
    complete: { cls: "status-complete", icon: "✓", text: "Training Complete" },
    "in-progress": { cls: "status-in-progress", icon: "◉", text: "In Progress" },
    "not-started": { cls: "status-not-started", icon: "○", text: "Not Started" },
    failed: { cls: "status-failed", icon: "✕", text: "Needs Retry" },
  };

  const s = statusMap[status] || statusMap["not-started"];
  badge.className = `status-badge ${s.cls}`;
  icon.textContent = s.icon;
  label.textContent = s.text;
}

// ---- Render metrics ----
function renderMetrics(data) {
  const { summary, attempts } = data;
  document.getElementById("metricCourses").textContent = summary.totalCourses;
  document.getElementById("metricCompleted").textContent = summary.completedCourses;
  document.getElementById("metricScore").textContent =
    summary.bestScore !== null ? `${summary.bestScore}%` : "—";
  document.getElementById("metricAttempts").textContent = attempts.length;
}

// ---- Render primary action block ----
function renderAction(data) {
  const status = deriveOverallStatus(data);
  const block = document.getElementById("actionBlock");
  const eyebrow = document.getElementById("actionEyebrow");
  const heading = document.getElementById("actionHeading");
  const desc = document.getElementById("actionDescription");
  const buttons = document.getElementById("actionButtons");

  const trainingUrl = "training-tool/index.html";

  const configs = {
    "not-started": {
      eyebrow: "Ready to Begin",
      heading: "Start your annual training.",
      desc: "Your Service Excellence and Code of Conduct training is ready. Complete all modules to earn your certification for this year.",
      btns: [
        { label: "Begin Training", href: trainingUrl, cls: "btn-solid" },
      ],
    },
    "in-progress": {
      eyebrow: "Pick Up Where You Left Off",
      heading: "Continue your training.",
      desc: "You have an active training session in progress. Jump back in to complete your modules and earn your certification.",
      btns: [
        { label: "Continue Training", href: trainingUrl, cls: "btn-solid" },
      ],
    },
    failed: {
      eyebrow: "Another Attempt Available",
      heading: "Retry your training.",
      desc: "Your last attempt did not meet the passing threshold. Review the material and try again. You have got this.",
      btns: [
        { label: "Retry Training", href: trainingUrl, cls: "btn-solid" },
      ],
    },
    complete: {
      eyebrow: "Certification Earned",
      heading: "Training complete. Well done.",
      desc: "You have successfully completed your annual training. You may review or redo any module at any time.",
      btns: [
        { label: "Review Training", href: trainingUrl, cls: "btn-ghost" },
        { label: "Redo Training", href: trainingUrl, cls: "btn-ghost" },
      ],
    },
  };

  const cfg = configs[status] || configs["not-started"];
  eyebrow.textContent = cfg.eyebrow;
  heading.textContent = cfg.heading;
  desc.textContent = cfg.desc;

  buttons.innerHTML = "";
  cfg.btns.forEach((b) => {
    const a = document.createElement("a");
    a.href = b.href;
    a.className = b.cls;
    a.textContent = b.label;
    buttons.appendChild(a);
  });
}

// ---- Render course cards ----
function renderCourses(data) {
  const grid = document.getElementById("courseGrid");
  const noMsg = document.getElementById("noCoursesMsg");
  const { enrollments } = data;

  grid.innerHTML = "";

  if (!enrollments || enrollments.length === 0) {
    noMsg.classList.remove("hidden");
    return;
  }

  noMsg.classList.add("hidden");

  enrollments.forEach((enr) => {
    const { course, completedAt, enrolledAt, dueDate, bestAttempt, inProgressAttempt, certificate } = enr;

    let cardStatus = "not-started";
    if (completedAt) cardStatus = "passed";
    else if (inProgressAttempt) cardStatus = "in-progress";
    else if (enr.courseAttempts?.some((a) => a.status === "FAILED") && !bestAttempt) cardStatus = "failed";

    const tag = {
      passed: '<span class="course-status-tag tag-passed">Completed</span>',
      "in-progress": '<span class="course-status-tag tag-in-progress">In Progress</span>',
      failed: '<span class="course-status-tag tag-failed">Needs Retry</span>',
      "not-started": '<span class="course-status-tag tag-not-started">Not Started</span>',
    }[cardStatus];

    const score = bestAttempt?.scorePercent ?? inProgressAttempt?.scorePercent ?? null;
    const barWidth = score !== null ? `${score}%` : "0%";
    const barCls = cardStatus === "passed" ? "fill-green" : "";
    const passTarget = course.passPercent || 80;

    const scoreHtml =
      score !== null
        ? `<div class="course-score-row">
            <div class="score-bar-wrap"><div class="score-bar-fill ${barCls}" style="width:${barWidth}"></div></div>
            <span class="score-label">${score}%</span>
           </div>
           <p class="course-meta">Pass target: ${passTarget}%</p>`
        : "";

    const datesHtml = `<div class="course-dates">
      ${enrolledAt ? `<span>Enrolled: ${fmt(enrolledAt)}</span>` : ""}
      ${completedAt ? `<span>Completed: ${fmt(completedAt)}</span>` : ""}
      ${dueDate && !completedAt ? `<span>Due: ${fmt(dueDate)}</span>` : ""}
    </div>`;

    // Due-date warning banner
    let dueBannerHtml = "";
    if (dueDate && !completedAt) {
      const diffDays = Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) {
        dueBannerHtml = `<div class="due-banner due-overdue">&#9888; Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? "s" : ""}</div>`;
      } else if (diffDays <= 7) {
        dueBannerHtml = `<div class="due-banner due-soon">&#9888; Due in ${diffDays} day${diffDays !== 1 ? "s" : ""}</div>`;
      }
    }

    let actionsHtml = "";
    const trainingUrl = "training-tool/index.html";

    if (cardStatus === "not-started") {
      actionsHtml = `<a href="${trainingUrl}" class="btn-solid">Begin</a>`;
    } else if (cardStatus === "in-progress") {
      actionsHtml = `<a href="${trainingUrl}" class="btn-solid">Continue</a>`;
    } else if (cardStatus === "failed") {
      actionsHtml = `<a href="${trainingUrl}" class="btn-solid">Retry</a>`;
    } else if (cardStatus === "passed") {
      actionsHtml = `<a href="${trainingUrl}" class="btn-ghost">Review</a><a href="${trainingUrl}" class="btn-ghost">Redo</a>`;
    }

    const certHtml = certificate
      ? `<a class="cert-link" href="certificate.html?id=${encodeURIComponent(certificate.id)}">&#9670; Certificate #${sanitizeText(certificate.certificateNo)}</a>`
      : "";

    const card = document.createElement("div");
    card.className = `course-card card-${cardStatus}`;
    card.innerHTML = `
      <div class="course-card-header">
        <div>
          <p class="course-title">${sanitizeText(course.title)}</p>
          <p class="course-meta">Version ${sanitizeText(course.version)} &middot; Code: ${sanitizeText(course.code)}</p>
        </div>
        ${tag}
      </div>
      ${dueBannerHtml}
      ${scoreHtml}
      ${datesHtml}
      ${certHtml}
      <div class="course-card-actions">${actionsHtml}</div>
    `;

    grid.appendChild(card);
  });
}

// ---- Render accomplishments ----
function renderAccomplishments(data) {
  const grid = document.getElementById("accomplishmentsGrid");
  const noMsg = document.getElementById("noAccomplishmentsMsg");
  const { summary, certificates, attempts } = data;

  const tiles = [];

  // Certificate tile(s)
  certificates.forEach((cert) => {
    tiles.push({
      icon: "🎓",
      title: "Certified",
      sub: `${sanitizeText(cert.course?.title || "Course")} — #${sanitizeText(cert.certificateNo)}`,
    });
  });

  // Completion tile
  if (summary.completedCourses > 0) {
    tiles.push({
      icon: "✅",
      title: `${summary.completedCourses} Course${summary.completedCourses > 1 ? "s" : ""} Completed`,
      sub: "Annual training requirement fulfilled",
    });
  }

  // Perfect score tile
  const perfect = attempts.find((a) => a.scorePercent === 100);
  if (perfect) {
    tiles.push({
      icon: "⭐",
      title: "Perfect Score",
      sub: `100% on ${sanitizeText(perfect.course?.title || "a course")}`,
    });
  }

  // High scorer (90+)
  const highScore = attempts.find((a) => (a.scorePercent ?? 0) >= 90 && (a.scorePercent ?? 0) < 100);
  if (highScore && !perfect) {
    tiles.push({
      icon: "🏅",
      title: "High Achiever",
      sub: `${highScore.scorePercent}% on first attempt`,
    });
  }

  // First attempt pass (only award if learner's FIRST attempt per course was a pass)
  const firstTryPass = data.enrollments?.some((enr) => {
    const sorted = [...(enr.courseAttempts || [])].sort(
      (a, b) => new Date(a.startedAt) - new Date(b.startedAt)
    );
    return sorted.length > 0 && sorted[0].status === "PASSED";
  });
  if (firstTryPass) {
    tiles.push({
      icon: "🎯",
      title: "First-Try Pass",
      sub: `Passed training on the first attempt`,
    });
  }

  if (tiles.length === 0) {
    noMsg.classList.remove("hidden");
    grid.classList.add("hidden");
    return;
  }

  noMsg.classList.add("hidden");
  grid.innerHTML = "";
  tiles.forEach((tile) => {
    const el = document.createElement("div");
    el.className = "accomplishment-tile";
    el.innerHTML = `
      <span class="accomplishment-icon" aria-hidden="true">${tile.icon}</span>
      <p class="accomplishment-title">${tile.title}</p>
      <p class="accomplishment-sub">${tile.sub}</p>
    `;
    grid.appendChild(el);
  });
}

// ---- Render attempt history ----
function renderHistory(data) {
  const tbody = document.getElementById("historyTableBody");
  const tableWrap = document.getElementById("historyTableWrap");
  const noMsg = document.getElementById("noHistoryMsg");
  const { attempts } = data;

  if (!attempts || attempts.length === 0) {
    tableWrap.classList.add("hidden");
    noMsg.classList.remove("hidden");
    return;
  }

  tableWrap.classList.remove("hidden");
  noMsg.classList.add("hidden");
  tbody.innerHTML = "";

  attempts.forEach((a) => {
    const statusCls = { PASSED: "s-passed", FAILED: "s-failed", IN_PROGRESS: "s-in-progress" }[a.status] || "s-in-progress";
    const statusLabel = { PASSED: "Passed", FAILED: "Failed", IN_PROGRESS: "In Progress" }[a.status] || a.status;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${sanitizeText(a.course?.title || a.courseId)}</td>
      <td>${fmtShort(a.startedAt)}</td>
      <td>${a.submittedAt ? fmtShort(a.submittedAt) : "<span style='opacity:0.5'>—</span>"}</td>
      <td>${scoreLabel(a.scorePercent)}</td>
      <td><span class="attempt-status ${statusCls}">${statusLabel}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// ---- Main render ----
function render(data) {
  renderWelcome(data);
  renderMetrics(data);
  renderAction(data);
  renderCourses(data);
  renderAccomplishments(data);
  renderHistory(data);

  loadingState.classList.add("hidden");
  dashContent.classList.remove("hidden");
  observeRevealNodes();
  checkSessionExpiry();
}

// ---- Available courses (self-enroll) ----
async function loadAvailableCourses() {
  let available;
  try {
    const res = await fetch(`${apiBase}/api/training/available`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    if (!res.ok) return;
    available = await res.json();
  } catch {
    return;
  }

  if (!available || !available.length) return;

  const section = document.getElementById("availableSection");
  const grid = document.getElementById("availableGrid");
  if (!section || !grid) return;

  section.classList.remove("hidden");
  grid.innerHTML = "";

  available.forEach((course) => {
    const card = document.createElement("div");
    card.className = "course-card card-not-started";
    card.innerHTML = `
      <div class="course-card-header">
        <div>
          <p class="course-title">${sanitizeText(course.title)}</p>
          <p class="course-meta">Version ${sanitizeText(course.version)} &middot; Code: ${sanitizeText(course.code)} &middot; Pass: ${course.passPercent}%</p>
        </div>
        <span class="course-status-tag tag-not-started">Available</span>
      </div>
      <div class="course-card-actions">
        <button class="btn-solid enroll-btn" data-course-id="${sanitizeText(course.id)}">Enroll</button>
      </div>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll(".enroll-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Enrolling...";
      try {
        const res = await fetch(`${apiBase}/api/training/self-enroll`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ courseId: btn.dataset.courseId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
        showToast("Enrolled! Refreshing...", "success");
        setTimeout(() => window.location.reload(), 1200);
      } catch (err) {
        showToast(err.message || "Failed to enroll.", "error");
        btn.disabled = false;
        btn.textContent = "Enroll";
      }
    });
  });
}

// ---- Bootstrap ----
async function loadDashboard() {
  try {
    const data = await fetchMyStatus();
    if (data) {
      render(data);
      loadAvailableCourses();
    }
  } catch (err) {
    loadingState.classList.add("hidden");
    errorMessage.textContent = err.message || "Unable to load your training profile.";
    errorState.classList.remove("hidden");
  }
}

loadDashboard();
