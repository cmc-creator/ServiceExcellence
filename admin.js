// ============================================================
// ADMIN.JS — Admin panel logic
// ============================================================

const apiBase = localStorage.getItem("nyxApiBase") || "";
const token = localStorage.getItem("nyxAuthToken") || "";
const storedName = localStorage.getItem("nyxLearnerName") || "Admin";
const storedRole = localStorage.getItem("nyxUserRole") || "";

const ADMIN_ROLES = ["OWNER", "ADMIN", "MANAGER"];

const loadingState = document.getElementById("loadingState");
const authError = document.getElementById("authError");
const adminContent = document.getElementById("adminContent");
const navUserName = document.getElementById("navUserName");
const signOutBtn = document.getElementById("signOutBtn");

// ---- Auth guard ----
if (!token || !apiBase) {
  window.location.replace("login.html?session=required");
}

signOutBtn.addEventListener("click", () => {
  const clearKeys = [
    "nyxAuthToken", "nyxLearnerName", "nyxLearnerEmail", "nyxUserRole",
    "nyxApiBase", "nyxOrgSlug", "nyxRoleConfigs", "nyxSoundEnabled",
    "nyxSeasonalAchievements", "nyxBrandMode",
  ];
  clearKeys.forEach((k) => localStorage.removeItem(k));
  window.location.replace("login.html");
});

// ---- Reveal observer ----
const revealObserver = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("is-visible")),
  { threshold: 0.1 }
);

// ---- API helper ----
async function api(path, options = {}) {
  const res = await fetch(`${apiBase}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    localStorage.removeItem("nyxAuthToken");
    window.location.replace("login.html?session=required");
    return null;
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || `Error ${res.status}`);
  }
  return res.json();
}

// ---- Helpers ----
function fmt(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function sanitize(s) {
  const div = document.createElement("div");
  div.textContent = String(s ?? "");
  return div.innerHTML;
}
function statusPill(status) {
  const map = {
    PASSED: "s-passed",
    FAILED: "s-failed",
    IN_PROGRESS: "s-in-progress",
  };
  const labels = { PASSED: "Passed", FAILED: "Failed", IN_PROGRESS: "In Progress" };
  return `<span class="attempt-status ${map[status] || "s-in-progress"}">${labels[status] || status}</span>`;
}

// ---- Tab switching ----
document.querySelectorAll(".admin-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    document.querySelectorAll(".admin-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    const panel = document.getElementById(`tab-${btn.dataset.tab}`);
    if (panel) panel.classList.add("active");
    revealObserver.observe(panel);
  });
});

// ============================================================
// OVERVIEW TAB
// ============================================================
async function loadOverview() {
  const [dash, analytics, recent] = await Promise.all([
    api("/api/admin/dashboard"),
    api("/api/analytics/completion"),
    api("/api/analytics/attempts/recent"),
  ]);

  if (dash) {
    document.getElementById("ovLearners").textContent = dash.learners;
    document.getElementById("ovCourses").textContent = dash.courses;
    document.getElementById("ovPassed").textContent = dash.passed;
  }
  if (analytics) {
    document.getElementById("ovRate").textContent = `${analytics.completionRate}%`;
  }

  const tbody = document.getElementById("recentAttemptsBody");
  const noMsg = document.getElementById("noRecentAttempts");
  if (!recent || recent.length === 0) {
    noMsg.classList.remove("hidden");
    return;
  }
  tbody.innerHTML = "";
  recent.slice(0, 20).forEach((a) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${sanitize(a.learner?.fullName || a.learnerId)}</td>
      <td>${sanitize(a.course?.title || a.courseId)}</td>
      <td>${fmt(a.startedAt)}</td>
      <td>${a.scorePercent !== null ? `${a.scorePercent}%` : "—"}</td>
      <td>${statusPill(a.status)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ============================================================
// LEARNERS TAB
// ============================================================
let allLearners = [];
let allCourses = [];

async function loadLearners() {
  const rows = await api("/api/admin/learners");
  allLearners = rows || [];
  const tbody = document.getElementById("learnersTableBody");
  const noMsg = document.getElementById("noLearners");

  if (!allLearners.length) {
    noMsg.classList.remove("hidden");
    return;
  }
  tbody.innerHTML = "";
  allLearners.forEach((l) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${sanitize(l.fullName)}</td>
      <td>${sanitize(l.email)}</td>
      <td>${sanitize(l.employeeId || "—")}</td>
      <td>${sanitize(l.department || "—")}</td>
      <td>${sanitize(l.roleTrack || "—")}</td>
      <td>${fmt(l.createdAt)}</td>
    `;
    tbody.appendChild(tr);
  });

  // Populate learner select in enrollment form
  const sel = document.getElementById("enrLearner");
  sel.innerHTML = '<option value="">Select learner...</option>';
  allLearners.forEach((l) => {
    const opt = document.createElement("option");
    opt.value = l.id;
    opt.textContent = `${l.fullName} (${l.email})`;
    sel.appendChild(opt);
  });
}

// Add learner
const showAddLearnerBtn = document.getElementById("showAddLearnerBtn");
const addLearnerForm = document.getElementById("addLearnerForm");
const cancelAddLearnerBtn = document.getElementById("cancelAddLearnerBtn");
const saveLearnerBtn = document.getElementById("saveLearnerBtn");
const addLearnerStatus = document.getElementById("addLearnerStatus");

showAddLearnerBtn.addEventListener("click", () => {
  addLearnerForm.classList.toggle("hidden");
});
cancelAddLearnerBtn.addEventListener("click", () => {
  addLearnerForm.classList.add("hidden");
  addLearnerStatus.textContent = "";
  addLearnerStatus.className = "form-status";
});

saveLearnerBtn.addEventListener("click", async () => {
  const fullName = document.getElementById("lFullName").value.trim();
  const email = document.getElementById("lEmail").value.trim();
  if (!fullName || !email) {
    addLearnerStatus.textContent = "Full name and email are required.";
    addLearnerStatus.className = "form-status is-error";
    return;
  }
  saveLearnerBtn.disabled = true;
  addLearnerStatus.textContent = "Saving...";
  addLearnerStatus.className = "form-status";
  try {
    await api("/api/admin/learners", {
      method: "POST",
      body: {
        fullName,
        email,
        employeeId: document.getElementById("lEmployeeId").value.trim() || undefined,
        department: document.getElementById("lDepartment").value.trim() || undefined,
        roleTrack: document.getElementById("lRoleTrack").value.trim() || undefined,
      },
    });
    addLearnerStatus.textContent = "Learner added successfully.";
    addLearnerForm.classList.add("hidden");
    await loadLearners();
  } catch (err) {
    addLearnerStatus.textContent = err.message || "Failed to add learner.";
    addLearnerStatus.className = "form-status is-error";
  } finally {
    saveLearnerBtn.disabled = false;
  }
});

// Learner search
const learnerSearch = document.getElementById("learnerSearch");
learnerSearch.addEventListener("input", () => {
  const q = learnerSearch.value.trim().toLowerCase();
  const filtered = q
    ? allLearners.filter((l) =>
        l.fullName.toLowerCase().includes(q) || l.email.toLowerCase().includes(q)
      )
    : allLearners;
  renderLearnerRows(filtered);
});

// Edit learner form
const editLearnerForm = document.getElementById("editLearnerForm");
const cancelEditLearnerBtn = document.getElementById("cancelEditLearnerBtn");
const saveEditLearnerBtn = document.getElementById("saveEditLearnerBtn");
const editLearnerStatus = document.getElementById("editLearnerStatus");

cancelEditLearnerBtn.addEventListener("click", () => {
  editLearnerForm.classList.add("hidden");
  editLearnerStatus.textContent = "";
  editLearnerStatus.className = "form-status";
});

saveEditLearnerBtn.addEventListener("click", async () => {
  const id = document.getElementById("editLearnerId").value;
  const fullName = document.getElementById("eFullName").value.trim();
  const email = document.getElementById("eEmail").value.trim();
  if (!fullName || !email) {
    editLearnerStatus.textContent = "Full name and email are required.";
    editLearnerStatus.className = "form-status is-error";
    return;
  }
  saveEditLearnerBtn.disabled = true;
  editLearnerStatus.textContent = "Saving...";
  editLearnerStatus.className = "form-status";
  try {
    await api(`/api/admin/learners/${id}`, {
      method: "PATCH",
      body: {
        fullName,
        email,
        employeeId: document.getElementById("eEmployeeId").value.trim() || null,
        department: document.getElementById("eDepartment").value.trim() || null,
        roleTrack: document.getElementById("eRoleTrack").value.trim() || null,
      },
    });
    editLearnerStatus.textContent = "Changes saved.";
    editLearnerForm.classList.add("hidden");
    await loadLearners();
  } catch (err) {
    editLearnerStatus.textContent = err.message || "Failed to save changes.";
    editLearnerStatus.className = "form-status is-error";
  } finally {
    saveEditLearnerBtn.disabled = false;
  }
});

// ============================================================
// ENROLLMENTS TAB
// ============================================================
async function loadEnrollments() {
  const rows = await api("/api/admin/enrollments");
  const enrollments = rows || [];

  if (!allCourses.length) {
    const seen = new Map();
    enrollments.forEach((e) => {
      if (e.course && !seen.has(e.courseId)) seen.set(e.courseId, e.course);
    });
    allCourses = [...seen.values()].map((c) => ({ id: c.id, title: c.title }));
  }

  // Populate course select
  const sel = document.getElementById("enrCourse");
  sel.innerHTML = '<option value="">Select course...</option>';
  allCourses.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.title;
    sel.appendChild(opt);
  });

  const tbody = document.getElementById("enrollmentsTableBody");
  const noMsg = document.getElementById("noEnrollments");
  if (!enrollments.length) {
    noMsg.classList.remove("hidden");
    return;
  }

  tbody.innerHTML = "";
  enrollments.forEach((e) => {
    const certAction = e.passAttemptId
      ? `<button class="btn-issue-cert" data-attempt-id="${sanitize(e.passAttemptId)}">Issue Cert</button>`
      : `<span style="opacity:0.3;font-size:12px;">—</span>`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${sanitize(e.learner?.fullName || e.learnerId)}</td>
      <td>${sanitize(e.course?.title || e.courseId)}</td>
      <td>${fmt(e.enrolledAt)}</td>
      <td>${e.dueDate ? fmt(e.dueDate) : "—"}</td>
      <td>${e.completedAt ? `<span class="cert-link">&#10003; ${fmt(e.completedAt)}</span>` : "<span style='opacity:0.5'>Incomplete</span>"}</td>
      <td>${certAction}</td>
      <td><button class="btn-action btn-action-delete" data-id="${sanitize(e.id)}">Remove</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".btn-issue-cert").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Issuing...";
      try {
        await api(`/api/admin/issue-certificate/${btn.dataset.attemptId}`, { method: "POST" });
        btn.textContent = "Issued";
        btn.style.borderColor = "rgba(110,223,160,0.6)";
      } catch {
        btn.textContent = "Error";
        btn.disabled = false;
      }
    });
  });

  tbody.querySelectorAll(".btn-action-delete[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remove this enrollment? The learner will lose access to this course.")) return;
      btn.disabled = true;
      btn.textContent = "Removing...";
      try {
        await api(`/api/admin/enrollments/${btn.dataset.id}`, { method: "DELETE" });
        await loadEnrollments();
      } catch (err) {
        btn.textContent = "Error";
        btn.disabled = false;
      }
    });
  });
}

// Enroll learner form
const showAddEnrollmentBtn = document.getElementById("showAddEnrollmentBtn");
const addEnrollmentForm = document.getElementById("addEnrollmentForm");
const cancelAddEnrollmentBtn = document.getElementById("cancelAddEnrollmentBtn");
const saveEnrollmentBtn = document.getElementById("saveEnrollmentBtn");
const addEnrollmentStatus = document.getElementById("addEnrollmentStatus");

showAddEnrollmentBtn.addEventListener("click", () => {
  addEnrollmentForm.classList.toggle("hidden");
});
cancelAddEnrollmentBtn.addEventListener("click", () => {
  addEnrollmentForm.classList.add("hidden");
  addEnrollmentStatus.textContent = "";
});
saveEnrollmentBtn.addEventListener("click", async () => {
  const learnerId = document.getElementById("enrLearner").value;
  const courseId = document.getElementById("enrCourse").value;
  const dueDate = document.getElementById("enrDueDate").value;
  if (!learnerId || !courseId) {
    addEnrollmentStatus.textContent = "Learner and course are required.";
    addEnrollmentStatus.className = "form-status is-error";
    return;
  }
  saveEnrollmentBtn.disabled = true;
  addEnrollmentStatus.textContent = "Enrolling...";
  addEnrollmentStatus.className = "form-status";
  try {
    await api("/api/admin/enrollments", {
      method: "POST",
      body: {
        learnerId,
        courseId,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      },
    });
    addEnrollmentStatus.textContent = "Learner enrolled successfully.";
    addEnrollmentForm.classList.add("hidden");
    await loadEnrollments();
  } catch (err) {
    addEnrollmentStatus.textContent = err.message || "Failed to enroll.";
    addEnrollmentStatus.className = "form-status is-error";
  } finally {
    saveEnrollmentBtn.disabled = false;
  }
});

// ============================================================
// CERTIFICATES TAB
// ============================================================
async function loadCertificates() {
  const rows = await api("/api/admin/certificates");
  const tbody = document.getElementById("certsTableBody");
  const noMsg = document.getElementById("noCerts");
  if (!rows || rows.length === 0) {
    noMsg.classList.remove("hidden");
    return;
  }
  tbody.innerHTML = "";
  rows.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${sanitize(c.certificateNo)}</strong></td>
      <td>${sanitize(c.learner?.fullName || c.learnerId)}</td>
      <td>${sanitize(c.course?.title || c.courseId)}</td>
      <td>${fmt(c.issuedAt)}</td>
      <td><a class="cert-view-link" href="certificate.html?id=${sanitize(c.id)}" target="_blank">View</a></td>
    `;
    tbody.appendChild(tr);
  });
}

// ============================================================
// ANALYTICS TAB
// ============================================================
async function loadAnalytics() {
  const [completion, events] = await Promise.all([
    api("/api/analytics/completion"),
    api("/api/analytics/events/top"),
  ]);

  if (completion) {
    document.getElementById("anTotal").textContent = completion.totalEnrollments;
    document.getElementById("anCompleted").textContent = completion.completedEnrollments;
    document.getElementById("anRate").textContent = `${completion.completionRate}%`;
    document.getElementById("anPassed").textContent = completion.passCount;
    document.getElementById("anFailed").textContent = completion.failCount;
  }

  const chart = document.getElementById("eventChart");
  const noMsg = document.getElementById("noEvents");
  if (!events || events.length === 0) {
    noMsg.classList.remove("hidden");
    chart.classList.add("hidden");
    return;
  }

  const max = Math.max(...events.map((e) => e.count), 1);
  chart.innerHTML = "";
  events.forEach((e) => {
    const pct = Math.round((e.count / max) * 100);
    const row = document.createElement("div");
    row.className = "event-row";
    row.innerHTML = `
      <span class="event-verb">${sanitize(e.verb)}</span>
      <div class="event-bar-wrap"><div class="event-bar-fill" style="width:${pct}%"></div></div>
      <span class="event-count">${e.count}</span>
    `;
    chart.appendChild(row);
  });
}

// ============================================================
// BOOTSTRAP
// ============================================================
async function bootstrap() {
  navUserName.textContent = `${storedName} (${storedRole.toLowerCase()})`;

  if (!ADMIN_ROLES.includes(storedRole)) {
    loadingState.classList.add("hidden");
    authError.classList.remove("hidden");
    return;
  }

  try {
    await Promise.all([loadOverview(), loadLearners()]);
    loadingState.classList.add("hidden");
    adminContent.classList.remove("hidden");
    document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));
  } catch (err) {
    loadingState.classList.add("hidden");
    authError.classList.remove("hidden");
    document.querySelector("#authError p:last-of-type").textContent =
      err.message || "Failed to load admin data.";
  }
}

// Lazy-load tabs on first click
const tabLoaded = { overview: true, learners: true };
document.querySelectorAll(".admin-tab").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const tab = btn.dataset.tab;
    if (tabLoaded[tab]) return;
    tabLoaded[tab] = true;
    try {
      if (tab === "enrollments") await loadEnrollments();
      if (tab === "certificates") await loadCertificates();
      if (tab === "analytics") await loadAnalytics();
    } catch {
      // errors shown inline
    }
  });
});

bootstrap();
