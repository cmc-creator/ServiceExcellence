// ============================================================
// ADMIN.JS — Admin panel logic
// ============================================================

const apiBase = localStorage.getItem("nyxApiBase") || "";
const token = localStorage.getItem("nyxAuthToken") || "";
const storedName = localStorage.getItem("nyxLearnerName") || "Admin";
const storedRole = localStorage.getItem("nyxUserRole") || "";

// Decode org slug from JWT payload for forgot-password calls
let orgSlug = localStorage.getItem("nyxOrgSlug") || "";
if (!orgSlug && token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    orgSlug = payload.organizationSlug || "";
  } catch { /* non-critical */ }
}

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

const COURSE_TEMPLATES = {
  "annual-compliance": {
    code: "ANNUAL-COMPLIANCE-CORE",
    title: "Annual Compliance Core",
    courseType: "Compliance",
    version: "2026.1",
    passPercent: 80,
  },
  "abuse-neglect": {
    code: "ABUSE-NEGLECT-ANNUAL",
    title: "Abuse and Neglect Recognition and Reporting Annual",
    courseType: "Safety",
    version: "2026.1",
    passPercent: 85,
  },
  deescalation: {
    code: "DEESCALATION-ANNUAL",
    title: "Behavioral Health De-Escalation Skills",
    courseType: "Clinical",
    version: "2026.1",
    passPercent: 85,
  },
  "workplace-violence": {
    code: "WORKPLACE-VIOLENCE-ANNUAL",
    title: "Workplace Violence Prevention and Response",
    courseType: "Safety",
    version: "2026.1",
    passPercent: 85,
  },
  "hipaa-privacy": {
    code: "HIPAA-PRIVACY-ANNUAL",
    title: "HIPAA and Privacy Essentials",
    courseType: "Compliance",
    version: "2026.1",
    passPercent: 90,
  },
  "infection-control": {
    code: "INFECTION-CONTROL-ANNUAL",
    title: "Infection Control Fundamentals",
    courseType: "Clinical",
    version: "2026.1",
    passPercent: 85,
  },
};

// ============================================================
// TOAST SYSTEM
// ============================================================
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

// ============================================================
// LEARNER TABLE RENDERER
// ============================================================
function renderLearnerRows(learners) {
  const tbody = document.getElementById("learnersTableBody");
  const noMsg = document.getElementById("noLearners");
  if (!learners.length) {
    tbody.innerHTML = "";
    noMsg.classList.remove("hidden");
    return;
  }
  noMsg.classList.add("hidden");
  tbody.innerHTML = "";
  learners.forEach((l) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${sanitize(l.fullName)}</td>
      <td>${sanitize(l.email)}</td>
      <td>${sanitize(l.employeeId || "—")}</td>
      <td>${sanitize(l.department || "—")}</td>
      <td>${sanitize(l.roleTrack || "—")}</td>
      <td>${fmt(l.createdAt)}</td>
      <td>
        <div class="action-cell">
          <button class="btn-action btn-action-edit" data-id="${sanitize(l.id)}" data-name="${sanitize(l.fullName)}" data-email="${sanitize(l.email)}" data-emp="${sanitize(l.employeeId || "")}" data-dept="${sanitize(l.department || "")}" data-rt="${sanitize(l.roleTrack || "")}">Edit</button>
          <button class="btn-action btn-action-secondary learner-reset-btn" data-id="${sanitize(l.id)}" data-email="${sanitize(l.email)}">Reset Link</button>
          <button class="btn-action btn-action-delete" data-id="${sanitize(l.id)}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll(".learner-reset-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const learnerEmail = btn.dataset.email;
      if (!orgSlug) {
        showToast("Cannot determine organization slug. Sign out and back in.", "error");
        return;
      }
      btn.disabled = true;
      btn.textContent = "Sending...";
      try {
        const res = await fetch(`${apiBase}/api/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: learnerEmail, organizationSlug: orgSlug }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.resetToken) {
          // Email not configured - build URL and copy to clipboard
          const resetUrl = `${location.origin}${location.pathname.replace("admin.html", "")}reset-password.html?token=${encodeURIComponent(data.resetToken)}&apiBase=${encodeURIComponent(apiBase)}`;
          try {
            await navigator.clipboard.writeText(resetUrl);
            showToast(`Reset link copied to clipboard for ${learnerEmail}.`, "success");
          } catch {
            prompt("Copy this reset link and share it securely:", resetUrl);
          }
        } else {
          showToast(`Password reset email sent to ${learnerEmail}.`, "success");
        }
      } catch (err) {
        showToast(err.message || "Failed to generate reset link.", "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Reset Link";
      }
    });
  });
  tbody.querySelectorAll(".btn-action-edit[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("editLearnerId").value = btn.dataset.id;
      document.getElementById("eFullName").value = btn.dataset.name;
      document.getElementById("eEmail").value = btn.dataset.email;
      document.getElementById("eEmployeeId").value = btn.dataset.emp;
      document.getElementById("eDepartment").value = btn.dataset.dept;
      document.getElementById("eRoleTrack").value = btn.dataset.rt;
      editLearnerForm.classList.remove("hidden");
      addLearnerForm.classList.add("hidden");
      editLearnerStatus.textContent = "";
      editLearnerStatus.className = "form-status";
      editLearnerForm.scrollIntoView({ behavior: "smooth" });
    });
  });
  tbody.querySelectorAll(".btn-action-delete[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Permanently delete this learner and all their data?")) return;
      btn.disabled = true;
      btn.textContent = "Deleting...";
      try {
        await api(`/api/admin/learners/${btn.dataset.id}`, { method: "DELETE" });
        showToast("Learner deleted.", "success");
        await loadLearners();
      } catch (err) {
        showToast(err.message || "Failed to delete.", "error");
        btn.textContent = "Delete";
        btn.disabled = false;
      }
    });
  });
}

// ---- Tab switching ----
document.querySelectorAll(".admin-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach((b) => {
      b.classList.remove("active");
      b.setAttribute("aria-selected", "false");
    });
    document.querySelectorAll(".admin-panel").forEach((p) => {
      p.classList.remove("active");
      p.classList.add("hidden");
    });
    btn.classList.add("active");
    btn.setAttribute("aria-selected", "true");
    const panel = document.getElementById(`tab-${btn.dataset.tab}`);
    if (panel) {
      panel.classList.remove("hidden");
      panel.classList.add("active");
      revealObserver.observe(panel);
    }
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
let allEnrollments = [];
let analyticsCompletion = null;
let analyticsTrends = [];
let analyticsMastery = null;
let analyticsMasteryLearners = [];
let learnerNextCursor = null;
let learnerHasMore = false;

async function loadLearners() {
  learnerNextCursor = null;
  learnerHasMore = false;
  allLearners = [];
  await fetchLearnerPage();
}

async function fetchLearnerPage() {
  const url = `/api/admin/learners?limit=50${learnerNextCursor ? `&cursor=${encodeURIComponent(learnerNextCursor)}` : ""}`;
  const result = await api(url);
  if (!result) return;
  const { data, nextCursor, hasMore } = result;
  allLearners = [...allLearners, ...(data || [])];
  learnerNextCursor = nextCursor || null;
  learnerHasMore = hasMore || false;

  const q = learnerSearch ? learnerSearch.value.trim().toLowerCase() : "";
  const displayed = q
    ? allLearners.filter((l) => l.fullName.toLowerCase().includes(q) || l.email.toLowerCase().includes(q))
    : allLearners;
  renderLearnerRows(displayed);

  const loadMoreBtn = document.getElementById("loadMoreLearnersBtn");
  if (loadMoreBtn) loadMoreBtn.classList.toggle("hidden", !learnerHasMore);

  // Repopulate learner select in enrollment form
  const sel = document.getElementById("enrLearner");
  sel.innerHTML = '<option value="">Select learner...</option>';
  allLearners.forEach((l) => {
    const opt = document.createElement("option");
    opt.value = l.id;
    opt.textContent = `${l.fullName} (${l.email})`;
    sel.appendChild(opt);
  });
}

// Load More button
document.getElementById("loadMoreLearnersBtn")?.addEventListener("click", async () => {
  if (learnerHasMore) await fetchLearnerPage();
});

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
    showToast("Learner added successfully.", "success");
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
    showToast("Changes saved.", "success");
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
function renderEnrollmentsTable(list) {
  const tbody = document.getElementById("enrollmentsTableBody");
  const noMsg = document.getElementById("noEnrollments");
  if (!list.length) {
    tbody.innerHTML = "";
    noMsg.classList.remove("hidden");
    return;
  }
  noMsg.classList.add("hidden");
  tbody.innerHTML = "";
  list.forEach((e) => {
    const certAction = e.passAttemptId
      ? `<button class="btn-issue-cert" data-attempt-id="${sanitize(e.passAttemptId)}">Issue Cert</button>`
      : `<span style="opacity:0.3;font-size:12px;">—</span>`;
    const isOverdue = !e.completedAt && e.dueDate && new Date(e.dueDate) < new Date();
    const tr = document.createElement("tr");
    if (isOverdue) { tr.style.background = "rgba(239,68,68,0.07)"; tr.title = "Overdue"; }
    tr.innerHTML = `
      <td>${sanitize(e.learner?.fullName || e.learnerId)}</td>
      <td>${sanitize(e.course?.title || e.courseId)}</td>
      <td>${fmt(e.enrolledAt)}</td>
      <td>${e.dueDate ? fmt(e.dueDate) : "—"}</td>
      <td>${e.completedAt ? `<span class="cert-link">&#10003; ${fmt(e.completedAt)}</span>` : "<span style='opacity:0.5'>Incomplete</span>"}</td>
      <td>${certAction}</td>
      <td><div class="action-cell"><button class="btn-action btn-action-edit" data-id="${sanitize(e.id)}" data-due="${e.dueDate ? new Date(e.dueDate).toISOString().slice(0, 10) : ''}">Edit Date</button><div class="inline-date-edit hidden" data-id="${sanitize(e.id)}"><input type="date" class="admin-input-inline" value="${e.dueDate ? new Date(e.dueDate).toISOString().slice(0, 10) : ''}"><button class="btn-action btn-action-save-date">Save</button><button class="btn-action btn-action-cancel-date">&#10005;</button></div><button class="btn-action btn-action-delete" data-id="${sanitize(e.id)}">Remove</button><button class="btn-action btn-action-remind" data-id="${sanitize(e.id)}">Remind</button>${!e.completedAt ? `<button class="btn-action btn-action-complete" data-id="${sanitize(e.id)}">Mark Complete</button>` : ""}</div></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".btn-action-edit[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const wrap = btn.closest(".action-cell").querySelector(".inline-date-edit");
      btn.classList.add("hidden");
      wrap.classList.remove("hidden");
      wrap.querySelector("input[type=date]").focus();
    });
  });

  tbody.querySelectorAll(".btn-action-save-date").forEach((btn) => {
    btn.addEventListener("click", () => {
      const wrap = btn.closest(".inline-date-edit");
      const input = wrap.querySelector("input[type=date]");
      const enrollId = wrap.dataset.id;
      const dueDate = input.value ? new Date(input.value).toISOString() : null;
      btn.disabled = true;
      btn.textContent = "Saving...";
      api(`/api/admin/enrollments/${enrollId}`, { method: "PATCH", body: { dueDate } })
        .then(() => { showToast("Due date updated.", "success"); loadEnrollments(); })
        .catch((err) => {
          showToast(err.message || "Failed to update.", "error");
          btn.disabled = false;
          btn.textContent = "Save";
        });
    });
  });

  tbody.querySelectorAll(".btn-action-cancel-date").forEach((btn) => {
    btn.addEventListener("click", () => {
      const wrap = btn.closest(".inline-date-edit");
      wrap.classList.add("hidden");
      wrap.closest(".action-cell").querySelector(".btn-action-edit").classList.remove("hidden");
    });
  });

  tbody.querySelectorAll(".btn-action-remind[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Send a reminder email to this learner?")) return;
      btn.disabled = true;
      btn.textContent = "Sending...";
      try {
        const res = await api(`/api/admin/enrollments/${btn.dataset.id}/remind`, { method: "POST" });
        showToast(res.message || "Reminder sent.", "success");
      } catch (err) {
        showToast(err.message || "Failed to send reminder.", "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Remind";
      }
    });
  });

  tbody.querySelectorAll(".btn-issue-cert").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Issuing...";
      try {
        await api(`/api/admin/issue-certificate/${btn.dataset.attemptId}`, { method: "POST" });
        showToast("Certificate issued.", "success");
        btn.textContent = "Issued";
      } catch {
        btn.textContent = "Error";
        btn.disabled = false;
      }
    });
  });

  tbody.querySelectorAll(".btn-action-complete[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Mark this enrollment as complete? This will set the completion date to today.")) return;
      btn.disabled = true;
      btn.textContent = "Saving...";
      try {
        await api(`/api/admin/enrollments/${btn.dataset.id}/complete`, { method: "PATCH" });
        showToast("Enrollment marked complete.", "success");
        await loadEnrollments();
      } catch (err) {
        showToast(err.message || "Failed to mark complete.", "error");
        btn.disabled = false;
        btn.textContent = "Mark Complete";
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
        showToast("Enrollment removed.", "success");
        await loadEnrollments();
      } catch (err) {
        showToast(err.message || "Failed to remove.", "error");
        btn.textContent = "Error";
        btn.disabled = false;
      }
    });
  });
}

async function loadEnrollments() {
  const rows = await api("/api/admin/enrollments");
  allEnrollments = rows || [];

  if (!allCourses.length) {
    const seen = new Map();
    allEnrollments.forEach((e) => {
      if (e.course && !seen.has(e.courseId)) seen.set(e.courseId, e.course);
    });
    allCourses = [...seen.values()].map((c) => ({ id: c.id, title: c.title }));
  }

  // Populate course selects (enrollment form + bulk enroll form + bulk due date form)
  ["enrCourse", "bulkEnrCourse", "bddCourse"].forEach((selId) => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Select course...</option>';
    allCourses.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.title;
      sel.appendChild(opt);
    });
  });

  // Wire search filter (idempotent — only attach once)
  const searchInput = document.getElementById("enrollmentSearch");
  if (searchInput && !searchInput.dataset.wired) {
    searchInput.dataset.wired = "1";
    searchInput.addEventListener("input", (ev) => {
      const q = ev.target.value.toLowerCase();
      const filtered = allEnrollments.filter(
        (enr) =>
          (enr.learner?.fullName || "").toLowerCase().includes(q) ||
          (enr.course?.title || "").toLowerCase().includes(q)
      );
      renderEnrollmentsTable(filtered);
    });
  }

  // Apply current search value when reloading after an action
  const q = searchInput ? searchInput.value.toLowerCase() : "";
  const filtered = q
    ? allEnrollments.filter(
        (enr) =>
          (enr.learner?.fullName || "").toLowerCase().includes(q) ||
          (enr.course?.title || "").toLowerCase().includes(q)
      )
    : allEnrollments;
  renderEnrollmentsTable(filtered);
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
    showToast("Learner enrolled successfully.", "success");
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
let allCertificates = [];

async function loadCertificates() {
  const rows = await api("/api/admin/certificates");
  allCertificates = rows || [];
  const tbody = document.getElementById("certsTableBody");
  const noMsg = document.getElementById("noCerts");
  if (!allCertificates.length) {
    noMsg.classList.remove("hidden");
    return;
  }
  tbody.innerHTML = "";
  allCertificates.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${sanitize(c.certificateNo)}</strong></td>
      <td>${sanitize(c.learner?.fullName || c.learnerId)}</td>
      <td>${sanitize(c.course?.title || c.courseId)}</td>
      <td>${fmt(c.issuedAt)}</td>
      <td><a class="cert-view-link" href="certificate.html?id=${sanitize(c.id)}" target="_blank">View</a></td>
      <td><button class="btn-action btn-action-secondary cert-email-btn" data-id="${sanitize(c.id)}" data-email="${sanitize(c.learner?.email || "")}">Email</button></td>
    `;
    tbody.appendChild(tr);
  });

  // Wire email buttons
  tbody.querySelectorAll(".cert-email-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const recipientEmail = btn.dataset.email;
      if (!confirm(`Email this certificate to ${recipientEmail || "the learner"}?`)) return;
      btn.disabled = true;
      btn.textContent = "Sending...";
      try {
        const res = await api(`/api/admin/certificates/${id}/email`, { method: "POST" });
        showToast(res.message || "Certificate emailed.", "success");
        btn.textContent = "Sent";
      } catch (err) {
        showToast(err.message || "Failed to send email.", "error");
        btn.disabled = false;
        btn.textContent = "Email";
      }
    });
  });
}

// Export certificates to CSV
document.getElementById("exportCertsBtn").addEventListener("click", () => {
  if (!allCertificates.length) {
    showToast("No certificates to export.", "error");
    return;
  }
  const headers = ["Certificate No", "Learner", "Email", "Course", "Issued Date"];
  const csvRows = [headers.join(",")];
  allCertificates.forEach((c) => {
    csvRows.push([
      c.certificateNo,
      c.learner?.fullName || "",
      c.learner?.email || "",
      c.course?.title || "",
      c.issuedAt ? new Date(c.issuedAt).toLocaleDateString("en-US") : "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
  });
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `certificates-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ============================================================
// ANALYTICS TAB
// ============================================================
let _completionChartInst = null;
let _passFailChartInst = null;
let _trendsChartInst = null;

function destroyChart(ref) {
  if (ref) { try { ref.destroy(); } catch { /* ignore */ } }
  return null;
}

function hasActiveMasteryFilters() {
  const role = document.getElementById("masteryFilterRole")?.value || "";
  const dept = document.getElementById("masteryFilterDept")?.value || "";
  const from = document.getElementById("masteryFilterFrom")?.value || "";
  const to = document.getElementById("masteryFilterTo")?.value || "";
  return Boolean(role || dept || from || to);
}

function populateMasteryAuditFilters(rows) {
  const roleSel = document.getElementById("masteryFilterRole");
  const deptSel = document.getElementById("masteryFilterDept");
  if (!roleSel || !deptSel) return;

  const prevRole = roleSel.value;
  const prevDept = deptSel.value;

  const roles = [...new Set(rows.map((r) => (r.roleTrack || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const depts = [...new Set(rows.map((r) => (r.department || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  roleSel.innerHTML = '<option value="">All role tracks</option>';
  roles.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    roleSel.appendChild(opt);
  });

  deptSel.innerHTML = '<option value="">All departments</option>';
  depts.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    deptSel.appendChild(opt);
  });

  if (prevRole && roles.includes(prevRole)) roleSel.value = prevRole;
  if (prevDept && depts.includes(prevDept)) deptSel.value = prevDept;
}

function getFilteredMasteryLearners(rows = analyticsMasteryLearners) {
  const role = document.getElementById("masteryFilterRole")?.value || "";
  const dept = document.getElementById("masteryFilterDept")?.value || "";
  const fromRaw = document.getElementById("masteryFilterFrom")?.value || "";
  const toRaw = document.getElementById("masteryFilterTo")?.value || "";

  const fromDate = fromRaw ? new Date(`${fromRaw}T00:00:00`) : null;
  const toDate = toRaw ? new Date(`${toRaw}T23:59:59`) : null;

  return (rows || []).filter((row) => {
    if (role && (row.roleTrack || "") !== role) return false;
    if (dept && (row.department || "") !== dept) return false;
    if (fromDate || toDate) {
      const completedAt = row.completedAt ? new Date(row.completedAt) : null;
      if (!completedAt || Number.isNaN(completedAt.getTime())) return false;
      if (fromDate && completedAt < fromDate) return false;
      if (toDate && completedAt > toDate) return false;
    }
    return true;
  });
}

function refreshMasteryAuditSummary() {
  const belowMasteryMetric = document.getElementById("anBelowMastery");
  const countLabel = document.getElementById("masteryFilterCount");

  const total = analyticsMasteryLearners?.length || 0;
  const filtered = getFilteredMasteryLearners();
  const filteredCount = filtered.length;
  const below = filtered.filter((row) => !row.mastered).length;
  if (belowMasteryMetric) {
    belowMasteryMetric.textContent = hasActiveMasteryFilters() ? `${below} / ${filteredCount}` : below;
  }

  if (countLabel) {
    countLabel.textContent = hasActiveMasteryFilters()
      ? `Audit rows: ${filteredCount} of ${total}`
      : `Audit rows: ${total}`;
  }
}

async function loadAnalytics() {
  const [completion, events, trends, deptData, mastery, masteryLearners] = await Promise.all([
    api("/api/analytics/completion"),
    api("/api/analytics/events/top"),
    api("/api/analytics/trends"),
    api("/api/analytics/by-department").catch(() => []),
    api("/api/analytics/mastery/abuse-neglect").catch(() => null),
    api("/api/analytics/mastery/abuse-neglect/learners").catch(() => null),
  ]);

  analyticsCompletion = completion || null;
  analyticsTrends = trends || [];
  analyticsMastery = mastery || null;
  analyticsMasteryLearners = masteryLearners?.learners || [];
  populateMasteryAuditFilters(analyticsMasteryLearners);

  if (completion) {
    document.getElementById("anTotal").textContent = completion.totalEnrollments;
    document.getElementById("anCompleted").textContent = completion.completedEnrollments;
    document.getElementById("anRate").textContent = `${completion.completionRate}%`;
    document.getElementById("anPassed").textContent = completion.passCount;
    document.getElementById("anFailed").textContent = completion.failCount;
  }

  const masteryMetric = document.getElementById("anAbuseMastery");
  if (masteryMetric) {
    if (analyticsMastery?.overall?.attempts > 0) {
      masteryMetric.textContent = `${analyticsMastery.overall.masteryRate}%`;
    } else {
      masteryMetric.textContent = "-";
    }
  }

  const belowMasteryMetric = document.getElementById("anBelowMastery");
  if (belowMasteryMetric) {
    if (masteryLearners && typeof masteryLearners.belowThreshold === "number") {
      belowMasteryMetric.textContent = masteryLearners.belowThreshold;
    } else {
      belowMasteryMetric.textContent = "-";
    }
  }
  refreshMasteryAuditSummary();

  // --- Completion donut chart ---
  const completionCanvas = document.getElementById("completionChart");
  _completionChartInst = destroyChart(_completionChartInst);
  if (completionCanvas && completion) {
    const notCompleted = completion.totalEnrollments - completion.completedEnrollments;
    _completionChartInst = new Chart(completionCanvas, {
      type: "doughnut",
      data: {
        labels: ["Completed", "Not Completed"],
        datasets: [{ data: [completion.completedEnrollments, notCompleted], backgroundColor: ["#22c55e", "rgba(255,255,255,0.12)"], borderWidth: 0 }],
      },
      options: {
        cutout: "68%", plugins: { legend: { position: "bottom", labels: { color: "rgba(255,255,255,0.7)", font: { size: 12 } } } },
        responsive: true, maintainAspectRatio: true,
      },
    });
  }

  // --- Pass/Fail bar chart ---
  const passFailCanvas = document.getElementById("passFailChart");
  _passFailChartInst = destroyChart(_passFailChartInst);
  if (passFailCanvas && completion) {
    _passFailChartInst = new Chart(passFailCanvas, {
      type: "bar",
      data: {
        labels: ["Passed", "Failed"],
        datasets: [{ data: [completion.passCount, completion.failCount], backgroundColor: ["#22c55e", "#ef4444"], borderRadius: 6, borderWidth: 0 }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { color: "rgba(255,255,255,0.6)", font: { size: 11 } }, grid: { color: "rgba(255,255,255,0.07)" } },
          x: { ticks: { color: "rgba(255,255,255,0.6)", font: { size: 12 } }, grid: { display: false } },
        },
        responsive: true, maintainAspectRatio: true,
      },
    });
  }

  // --- Event bars (custom HTML, unchanged) ---
  const chart = document.getElementById("eventChart");
  const noMsg = document.getElementById("noEvents");
  if (!events || events.length === 0) {
    noMsg.classList.remove("hidden");
    chart.classList.add("hidden");
  } else {
    noMsg.classList.add("hidden");
    chart.classList.remove("hidden");
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

  // --- Trends line chart ---
  const trendsSection = document.getElementById("trendsSection");
  const trendsCanvas = document.getElementById("trendsChart");
  _trendsChartInst = destroyChart(_trendsChartInst);
  if (trends && trends.length) {
    trendsSection.classList.remove("hidden");
    if (trendsCanvas) {
      const labels = trends.map((t) => {
        const [year, month] = t.month.split("-");
        return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      });
      _trendsChartInst = new Chart(trendsCanvas, {
        type: "line",
        data: {
          labels,
          datasets: [{ label: "Completions", data: trends.map((t) => t.count), borderColor: "#818cf8", backgroundColor: "rgba(129,140,248,0.15)", tension: 0.4, fill: true, pointRadius: 4, pointBackgroundColor: "#818cf8" }],
        },
        options: {
          plugins: { legend: { display: false } },
          scales: {
            y: { ticks: { color: "rgba(255,255,255,0.6)", font: { size: 11 } }, grid: { color: "rgba(255,255,255,0.07)" } },
            x: { ticks: { color: "rgba(255,255,255,0.6)", font: { size: 11 } }, grid: { display: false } },
          },
          responsive: true, maintainAspectRatio: true,
        },
      });
    }
  }

  // --- Department breakdown table ---
  const deptTbody = document.getElementById("deptTableBody");
  const noDeptMsg = document.getElementById("noDeptData");
  if (deptData && deptData.length && deptTbody) {
    noDeptMsg?.classList.add("hidden");
    deptTbody.innerHTML = "";
    deptData.forEach((d) => {
      const tr = document.createElement("tr");
      const rateCls = d.rate >= 80 ? "s-passed" : d.rate >= 50 ? "s-in-progress" : "s-failed";
      tr.innerHTML = `<td>${sanitize(d.department)}</td><td>${d.total}</td><td>${d.completed}</td><td><span class="attempt-status ${rateCls}">${d.rate}%</span></td>`;
      deptTbody.appendChild(tr);
    });
  } else if (noDeptMsg) {
    noDeptMsg.classList.remove("hidden");
  }

  // --- Abuse/Neglect mastery by role table ---
  const masteryTbody = document.getElementById("masteryRoleTableBody");
  const noMasteryMsg = document.getElementById("noMasteryData");
  if (analyticsMastery?.roles?.length && masteryTbody) {
    noMasteryMsg?.classList.add("hidden");
    masteryTbody.innerHTML = "";
    analyticsMastery.roles.forEach((row) => {
      const rateCls = row.masteryRate >= row.requiredThreshold ? "s-passed" : row.masteryRate >= Math.max(row.requiredThreshold - 15, 50) ? "s-in-progress" : "s-failed";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${sanitize(row.roleTrack)}</td>
        <td>${row.attempts}</td>
        <td>${row.masteredCount}</td>
        <td>${row.avgMasteryPct}%</td>
        <td>${row.requiredThreshold}%</td>
        <td><span class="attempt-status ${rateCls}">${row.masteryRate}%</span></td>
      `;
      masteryTbody.appendChild(tr);
    });
  } else if (noMasteryMsg) {
    noMasteryMsg.classList.remove("hidden");
  }
}

// ============================================================
// SETTINGS TAB
// ============================================================
async function loadSettings() {
  let settings, courses;
  try {
    [settings, courses] = await Promise.all([
      api("/api/admin/settings"),
      api("/api/admin/courses"),
    ]);
  } catch (err) {
    showToast(err.message || "Failed to load settings.", "error");
    return;
  }

  const hasAbuseNeglect = courses.some((c) =>
    /abuse|neglect/i.test(c.code || "") || /abuse|neglect/i.test(c.title || "")
  );
  const canCreateCourses = ["OWNER", "ADMIN"].includes(storedRole);

  if (canCreateCourses && !hasAbuseNeglect) {
    try {
      await api("/api/admin/courses", {
        method: "POST",
        body: {
          code: "ABUSE-NEGLECT-ANNUAL",
          title: "Abuse and Neglect Recognition and Reporting Annual",
          version: "2026.1",
          passPercent: 85,
          opensAt: null,
          closesAt: null,
        },
      });
      courses = await api("/api/admin/courses");
      showToast("Abuse/Neglect course auto-added to catalogue.", "success");
    } catch {
      // If another admin created it concurrently, just continue with existing list.
    }
  }

  // Org name form
  const nameInput = document.getElementById("settingsOrgName");
  const saveBtn = document.getElementById("saveSettingsBtn");
  const statusEl = document.getElementById("settingsStatus");
  if (nameInput && settings) nameInput.value = settings.name || "";

  // Branding fields
  const logoInput = document.getElementById("settingsLogoUrl");
  const colorPicker = document.getElementById("settingsBrandColor");
  const colorHex = document.getElementById("settingsBrandColorHex");
  const saveBrandingBtn = document.getElementById("saveBrandingBtn");
  const brandingStatus = document.getElementById("brandingStatus");

  if (logoInput && settings) logoInput.value = settings.logoUrl || "";
  if (colorPicker && settings?.brandColor) {
    colorPicker.value = settings.brandColor;
    if (colorHex) colorHex.value = settings.brandColor;
  } else if (colorHex) {
    colorHex.value = "";
  }

  colorPicker?.addEventListener("input", () => { if (colorHex) colorHex.value = colorPicker.value; });
  colorHex?.addEventListener("input", () => {
    const v = colorHex.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v) && colorPicker) colorPicker.value = v;
  });

  if (saveBrandingBtn) {
    saveBrandingBtn.onclick = async () => {
      const logoUrl = logoInput?.value.trim() || null;
      const brandColor = colorHex?.value.trim() || null;
      if (brandColor && !/^#[0-9a-fA-F]{6}$/.test(brandColor)) {
        brandingStatus.textContent = "Brand color must be a valid hex, e.g. #4f46e5";
        brandingStatus.className = "form-status is-error";
        return;
      }
      saveBrandingBtn.disabled = true;
      brandingStatus.textContent = "Saving...";
      brandingStatus.className = "form-status";
      try {
        await api("/api/admin/settings", { method: "PATCH", body: { logoUrl, brandColor } });
        brandingStatus.textContent = "Branding saved.";
        showToast("Branding updated.", "success");
      } catch (err) {
        brandingStatus.textContent = err.message || "Failed to save.";
        brandingStatus.className = "form-status is-error";
      } finally {
        saveBrandingBtn.disabled = false;
      }
    };
  }

  saveBtn.onclick = async () => {
    const name = nameInput.value.trim();
    if (!name) { showToast("Organization name cannot be empty.", "error"); return; }
    saveBtn.disabled = true;
    statusEl.textContent = "Saving...";
    statusEl.className = "form-status";
    try {
      await api("/api/admin/settings", { method: "PATCH", body: { name } });
      statusEl.textContent = "Saved.";
      showToast("Organization name updated.", "success");
    } catch (err) {
      statusEl.textContent = err.message || "Failed to save.";
      statusEl.className = "form-status is-error";
    } finally {
      saveBtn.disabled = false;
    }
  };

  // Courses table
  const tbody = document.getElementById("coursesTableBody");
  const noMsg = document.getElementById("noCourses");
  if (!courses || !courses.length) {
    noMsg.classList.remove("hidden");
    return;
  }
  noMsg.classList.add("hidden");
  tbody.innerHTML = "";
  courses.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${sanitize(c.code)}</td>
      <td>${sanitize(c.title)}</td>
      <td>${sanitize(c.courseType || "Compliance")}</td>
      <td>${sanitize(c.version)}</td>
      <td>${c.passPercent}%</td>
      <td><label class="toggle-label">
        <input type="checkbox" class="course-active-toggle" data-id="${sanitize(c.id)}" ${c.isActive ? "checked" : ""}>
        <span class="toggle-text ${c.isActive ? "text-green" : "text-muted"}">${c.isActive ? "Active" : "Inactive"}</span>
      </label></td>
      <td><div class="action-cell">
        <button class="btn-action btn-action-edit course-edit-btn" data-id="${sanitize(c.id)}" data-title="${sanitize(c.title)}" data-type="${sanitize(c.courseType || "Compliance")}" data-pass="${c.passPercent}" data-opens="${c.opensAt ? new Date(c.opensAt).toISOString().slice(0,16) : ''}" data-closes="${c.closesAt ? new Date(c.closesAt).toISOString().slice(0,16) : ''}">Edit</button>
        <button class="btn-action btn-action-delete course-delete-btn" data-id="${sanitize(c.id)}" data-title="${sanitize(c.title)}">Delete</button>
      </div></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".course-active-toggle").forEach((toggle) => {
    toggle.addEventListener("change", async () => {
      const label = toggle.nextElementSibling;
      try {
        await api(`/api/admin/courses/${toggle.dataset.id}`, {
          method: "PATCH",
          body: { isActive: toggle.checked },
        });
        label.textContent = toggle.checked ? "Active" : "Inactive";
        label.className = `toggle-text ${toggle.checked ? "text-green" : "text-muted"}`;
        showToast(`Course ${toggle.checked ? "activated" : "deactivated"}.`, "success");
      } catch (err) {
        toggle.checked = !toggle.checked;
        showToast(err.message || "Failed to update course.", "error");
      }
    });
  });

  tbody.querySelectorAll(".course-edit-btn[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("editCourseId").value = btn.dataset.id;
      document.getElementById("ecTitle").value = btn.dataset.title;
      document.getElementById("ecCourseType").value = btn.dataset.type || "Compliance";
      document.getElementById("ecPassPercent").value = btn.dataset.pass;
      document.getElementById("ecOpensAt").value = btn.dataset.opens || "";
      document.getElementById("ecClosesAt").value = btn.dataset.closes || "";
      editCourseForm.classList.remove("hidden");
      editCourseStatus.textContent = "";
      editCourseStatus.className = "form-status";
      editCourseForm.scrollIntoView({ behavior: "smooth" });
    });
  });

  tbody.querySelectorAll(".course-delete-btn[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm(`Delete course "${btn.dataset.title}"? This is blocked if enrollments exist.`)) return;
      btn.disabled = true;
      btn.textContent = "Deleting...";
      try {
        await api(`/api/admin/courses/${btn.dataset.id}`, { method: "DELETE" });
        showToast("Course deleted.", "success");
        await loadSettings();
      } catch (err) {
        showToast(err.message || "Failed to delete course.", "error");
        btn.textContent = "Delete";
        btn.disabled = false;
      }
    });
  });

  // Add Course form (wired once per loadSettings call)
  const showAddCourseBtn = document.getElementById("showAddCourseBtn");
  const addAbuseNeglectCourseBtn = document.getElementById("addAbuseNeglectCourseBtn");
  const addCourseForm = document.getElementById("addCourseForm");
  const cancelAddCourseBtn = document.getElementById("cancelAddCourseBtn");
  const saveAddCourseBtn = document.getElementById("saveAddCourseBtn");
  const addCourseStatus = document.getElementById("addCourseStatus");
  const templateStatus = document.getElementById("courseTemplateStatus");

  if (addAbuseNeglectCourseBtn) {
    const hasAbuseNeglectCourse = courses.some((c) =>
      /abuse|neglect/i.test(c.code || "") || /abuse|neglect/i.test(c.title || "")
    );
    addAbuseNeglectCourseBtn.classList.toggle("hidden", hasAbuseNeglectCourse);
  }

  document.querySelectorAll(".quick-template-btn").forEach((btn) => {
    const key = btn.dataset.template;
    const tpl = COURSE_TEMPLATES[key];
    if (!tpl) return;

    if (!btn.dataset.baseLabel) {
      btn.dataset.baseLabel = btn.textContent;
    }
    btn.textContent = btn.dataset.baseLabel;

    const exists = courses.some((c) => c.code === tpl.code);
    btn.disabled = exists;
    if (exists) btn.textContent = `${btn.dataset.baseLabel} ✓`;

    btn.onclick = async () => {
      btn.disabled = true;
      if (templateStatus) {
        templateStatus.textContent = `Adding ${tpl.title}...`;
        templateStatus.className = "form-status";
      }
      try {
        await api("/api/admin/courses", {
          method: "POST",
          body: {
            code: tpl.code,
            title: tpl.title,
            courseType: tpl.courseType,
            version: tpl.version,
            passPercent: tpl.passPercent,
            opensAt: null,
            closesAt: null,
          },
        });
        showToast(`${tpl.title} added.`, "success");
        if (templateStatus) templateStatus.textContent = "";
        await loadSettings();
      } catch (err) {
        if (templateStatus) {
          templateStatus.textContent = err.message || "Failed to add template course.";
          templateStatus.className = "form-status is-error";
        }
        btn.disabled = false;
      }
    };
  });

  showAddCourseBtn.onclick = () => {
    addCourseForm.classList.toggle("hidden");
    addCourseStatus.textContent = "";
    addCourseStatus.className = "form-status";
  };

  cancelAddCourseBtn.onclick = () => {
    addCourseForm.classList.add("hidden");
    addCourseStatus.textContent = "";
  };

  saveAddCourseBtn.onclick = async () => {
    const code = document.getElementById("acCode").value.trim();
    const title = document.getElementById("acTitle").value.trim();
    const courseType = document.getElementById("acCourseType")?.value || "Compliance";
    const version = document.getElementById("acVersion").value.trim();
    const passPercent = parseInt(document.getElementById("acPassPercent").value, 10);

    if (!code || !title || !version) {
      addCourseStatus.textContent = "Code, title, and version are required.";
      addCourseStatus.className = "form-status is-error";
      return;
    }
    if (isNaN(passPercent) || passPercent < 0 || passPercent > 100) {
      addCourseStatus.textContent = "Pass % must be between 0 and 100.";
      addCourseStatus.className = "form-status is-error";
      return;
    }

    const opensAtVal = document.getElementById("acOpensAt")?.value;
    const closesAtVal = document.getElementById("acClosesAt")?.value;
    const opensAt = opensAtVal ? new Date(opensAtVal).toISOString() : null;
    const closesAt = closesAtVal ? new Date(closesAtVal).toISOString() : null;

    saveAddCourseBtn.disabled = true;
    addCourseStatus.textContent = "Creating...";
    addCourseStatus.className = "form-status";
    try {
      await api("/api/admin/courses", { method: "POST", body: { code, title, courseType, version, passPercent, opensAt, closesAt } });
      showToast("Course created.", "success");
      addCourseForm.classList.add("hidden");
      document.getElementById("acCode").value = "";
      document.getElementById("acTitle").value = "";
      if (document.getElementById("acCourseType")) document.getElementById("acCourseType").value = "Compliance";
      document.getElementById("acVersion").value = "";
      document.getElementById("acPassPercent").value = "80";
      if (document.getElementById("acOpensAt")) document.getElementById("acOpensAt").value = "";
      if (document.getElementById("acClosesAt")) document.getElementById("acClosesAt").value = "";
      addCourseStatus.textContent = "";
      // Reload the courses table
      await loadSettings();
    } catch (err) {
      addCourseStatus.textContent = err.message || "Failed to create course.";
      addCourseStatus.className = "form-status is-error";
    } finally {
      saveAddCourseBtn.disabled = false;
    }
  };

  if (addAbuseNeglectCourseBtn) {
    addAbuseNeglectCourseBtn.onclick = async () => {
      addAbuseNeglectCourseBtn.disabled = true;
      addAbuseNeglectCourseBtn.textContent = "Adding...";
      try {
        await api("/api/admin/courses", {
          method: "POST",
          body: {
            code: "ABUSE-NEGLECT-ANNUAL",
            title: "Abuse and Neglect Recognition and Reporting Annual",
            courseType: "Safety",
            version: "2026.1",
            passPercent: 85,
            opensAt: null,
            closesAt: null,
          },
        });
        showToast("Abuse/Neglect course added.", "success");
        await loadSettings();
      } catch (err) {
        const message = err.message || "Failed to add Abuse/Neglect course.";
        if (/unique|already exists|constraint/i.test(message)) {
          showToast("Abuse/Neglect course already exists.", "error");
        } else {
          showToast(message, "error");
        }
      } finally {
        addAbuseNeglectCourseBtn.disabled = false;
        addAbuseNeglectCourseBtn.textContent = "+ Add Abuse/Neglect Course";
      }
    };
  }
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

  // Hide OWNER/ADMIN-only tabs from MANAGER role
  if (!["OWNER", "ADMIN"].includes(storedRole)) {
    document.querySelector('[data-tab="users"]')?.remove();
    document.querySelector('[data-tab="settings"]')?.remove();
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
const tabLoaded = { overview: true, learners: true, users: false, settings: false };
document.querySelectorAll(".admin-tab").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const tab = btn.dataset.tab;
    if (tabLoaded[tab]) return;
    tabLoaded[tab] = true;
    try {
      if (tab === "enrollments") await loadEnrollments();
      if (tab === "certificates") await loadCertificates();
      if (tab === "analytics") await loadAnalytics();
      if (tab === "users") await loadUsers();
      if (tab === "settings") await loadSettings();
    } catch {
      // errors shown inline
    }
  });
});

// ============================================================
// USERS TAB
// ============================================================
async function loadUsers() {
  const rows = await api("/api/admin/users");
  const tbody = document.getElementById("usersTableBody");
  const noMsg = document.getElementById("noUsers");
  if (!rows || rows.length === 0) {
    tbody.innerHTML = "";
    noMsg.classList.remove("hidden");
    return;
  }
  noMsg.classList.add("hidden");
  tbody.innerHTML = "";
  const isOwner = storedRole === "OWNER";
  rows.forEach((u) => {
    const rolePill = `<span class="role-pill role-${u.role.toLowerCase()}">${u.role}</span>`;
    const statusPillHtml = u.isActive
      ? `<span class="attempt-status s-passed">Active</span>`
      : `<span class="attempt-status s-failed">Inactive</span>`;
    const toggleLabel = u.isActive ? "Deactivate" : "Activate";
    const toggleCls = u.isActive ? "btn-action-delete" : "btn-action-secondary";
    const actions = isOwner
      ? `<div class="action-cell">
          <button class="btn-action btn-action-edit" data-id="${sanitize(u.id)}" data-name="${sanitize(u.fullName)}" data-email="${sanitize(u.email)}" data-role="${sanitize(u.role)}">Edit</button>
          <button class="btn-action ${toggleCls} user-toggle-btn" data-id="${sanitize(u.id)}" data-active="${u.isActive}">${toggleLabel}</button>
          <button class="btn-action btn-action-delete" data-id="${sanitize(u.id)}">Delete</button>
        </div>`
      : `<span style="opacity:0.4;font-size:12px;">View only</span>`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${sanitize(u.fullName)}</td>
      <td>${sanitize(u.email)}</td>
      <td>${rolePill}</td>
      <td>${statusPillHtml}</td>
      <td>${fmt(u.createdAt)}</td>
      <td>${actions}</td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll(".btn-action-edit[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("editUserId").value = btn.dataset.id;
      document.getElementById("euFullName").value = btn.dataset.name;
      document.getElementById("euEmail").value = btn.dataset.email;
      document.getElementById("euRole").value = btn.dataset.role;
      document.getElementById("euPassword").value = "";
      editUserForm.classList.remove("hidden");
      addUserForm.classList.add("hidden");
      editUserStatus.textContent = "";
      editUserStatus.className = "form-status";
      editUserForm.scrollIntoView({ behavior: "smooth" });
    });
  });
  tbody.querySelectorAll(".btn-action-delete[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this user account? This cannot be undone.")) return;
      btn.disabled = true;
      btn.textContent = "Deleting...";
      try {
        await api(`/api/admin/users/${btn.dataset.id}`, { method: "DELETE" });
        showToast("User deleted.", "success");
        await loadUsers();
      } catch (err) {
        showToast(err.message || "Failed to delete user.", "error");
        btn.textContent = "Delete";
        btn.disabled = false;
      }
    });
  });
  tbody.querySelectorAll(".user-toggle-btn[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const isActive = btn.dataset.active === "true";
      const action = isActive ? "deactivate" : "activate";
      if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} this user?`)) return;
      btn.disabled = true;
      btn.textContent = isActive ? "Deactivating..." : "Activating...";
      try {
        await api(`/api/admin/users/${btn.dataset.id}/toggle-active`, { method: "PATCH" });
        showToast(`User ${action}d.`, "success");
        await loadUsers();
      } catch (err) {
        showToast(err.message || `Failed to ${action} user.`, "error");
        btn.disabled = false;
        btn.textContent = isActive ? "Deactivate" : "Activate";
      }
    });
  });
}

// Show/hide add user button based on role
const showAddUserBtn = document.getElementById("showAddUserBtn");
const addUserForm = document.getElementById("addUserForm");
const cancelAddUserBtn = document.getElementById("cancelAddUserBtn");
const saveUserBtn = document.getElementById("saveUserBtn");
const addUserStatus = document.getElementById("addUserStatus");
const editUserForm = document.getElementById("editUserForm");
const cancelEditUserBtn = document.getElementById("cancelEditUserBtn");
const saveEditUserBtn = document.getElementById("saveEditUserBtn");
const editUserStatus = document.getElementById("editUserStatus");

if (storedRole === "OWNER") showAddUserBtn.style.display = "";

showAddUserBtn.addEventListener("click", () => addUserForm.classList.toggle("hidden"));
cancelAddUserBtn.addEventListener("click", () => {
  addUserForm.classList.add("hidden");
  addUserStatus.textContent = "";
});
saveUserBtn.addEventListener("click", async () => {
  const fullName = document.getElementById("uFullName").value.trim();
  const email = document.getElementById("uEmail").value.trim();
  const password = document.getElementById("uPassword").value;
  const role = document.getElementById("uRole").value;
  if (!fullName || !email || !password) {
    addUserStatus.textContent = "All fields are required.";
    addUserStatus.className = "form-status is-error";
    return;
  }
  saveUserBtn.disabled = true;
  addUserStatus.textContent = "Creating...";
  addUserStatus.className = "form-status";
  try {
    await api("/api/admin/users", { method: "POST", body: { fullName, email, password, role } });
    showToast("User account created.", "success");
    addUserForm.classList.add("hidden");
    addUserStatus.textContent = "";
    await loadUsers();
  } catch (err) {
    addUserStatus.textContent = err.message || "Failed to create user.";
    addUserStatus.className = "form-status is-error";
  } finally {
    saveUserBtn.disabled = false;
  }
});

cancelEditUserBtn.addEventListener("click", () => {
  editUserForm.classList.add("hidden");
  editUserStatus.textContent = "";
});
saveEditUserBtn.addEventListener("click", async () => {
  const id = document.getElementById("editUserId").value;
  const fullName = document.getElementById("euFullName").value.trim();
  const email = document.getElementById("euEmail").value.trim();
  const role = document.getElementById("euRole").value;
  const newPassword = document.getElementById("euPassword").value;
  if (!fullName || !email) {
    editUserStatus.textContent = "Name and email are required.";
    editUserStatus.className = "form-status is-error";
    return;
  }
  saveEditUserBtn.disabled = true;
  editUserStatus.textContent = "Saving...";
  editUserStatus.className = "form-status";
  try {
    await api(`/api/admin/users/${id}`, {
      method: "PATCH",
      body: { fullName, email, role, ...(newPassword ? { newPassword } : {}) },
    });
    showToast("User updated.", "success");
    editUserForm.classList.add("hidden");
    editUserStatus.textContent = "";
    await loadUsers();
  } catch (err) {
    editUserStatus.textContent = err.message || "Failed to update user.";
    editUserStatus.className = "form-status is-error";
  } finally {
    saveEditUserBtn.disabled = false;
  }
});

// ============================================================
// SEND OVERDUE REMINDERS
// ============================================================
document.getElementById("sendRemindersBtn")?.addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  if (!confirm("Send overdue reminder emails to all learners with a past due date?")) return;
  btn.disabled = true;
  btn.textContent = "Sending...";
  try {
    const res = await api("/api/admin/reminders/send", { method: "POST" });
    showToast(res.message || `Sent ${res.sent} reminder(s).`, "success");
  } catch (err) {
    showToast(err.message || "Failed to send reminders.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Send Overdue Reminders";
  }
});

// ============================================================
// BULK DUE DATE FORM
// ============================================================
(function initBulkDueDate() {
  const showBtn = document.getElementById("showBulkDueDateBtn");
  const formCard = document.getElementById("bulkDueDateForm");
  const cancelBtn = document.getElementById("cancelBulkDueDateBtn");
  const saveBtn = document.getElementById("saveBulkDueDateBtn");
  const courseSelect = document.getElementById("bddCourse");
  const dateInput = document.getElementById("bddDate");
  const incompleteOnly = document.getElementById("bddIncompleteOnly");
  const statusEl = document.getElementById("bulkDueDateStatus");

  if (!showBtn || !formCard) return;

  showBtn.addEventListener("click", () => {
    formCard.classList.remove("hidden");
    showBtn.style.display = "none";
  });

  cancelBtn?.addEventListener("click", () => {
    formCard.classList.add("hidden");
    showBtn.style.display = "";
    if (statusEl) statusEl.textContent = "";
  });

  saveBtn?.addEventListener("click", async () => {
    const courseId = courseSelect?.value;
    if (!courseId) {
      if (statusEl) { statusEl.textContent = "Please select a course."; statusEl.className = "form-status is-error"; }
      return;
    }
    const rawDate = dateInput?.value;
    const dueDate = rawDate ? new Date(rawDate).toISOString() : null;
    saveBtn.disabled = true;
    if (statusEl) { statusEl.textContent = "Updating..."; statusEl.className = "form-status"; }
    try {
      const res = await api("/api/admin/enrollments/bulk-due-date", {
        method: "PATCH",
        body: { courseId, dueDate, incompleteOnly: incompleteOnly?.checked ?? true },
      });
      showToast(`Updated ${res.updated} enrollment(s).`, "success");
      formCard.classList.add("hidden");
      showBtn.style.display = "";
      if (statusEl) statusEl.textContent = "";
    } catch (err) {
      if (statusEl) { statusEl.textContent = err.message || "Failed to update due dates."; statusEl.className = "form-status is-error"; }
    } finally {
      saveBtn.disabled = false;
    }
  });
})();

// ============================================================
// CSV IMPORT
// ============================================================
const csvImportBtn = document.getElementById("csvImportBtn");
const csvImportInput = document.getElementById("csvImportInput");

csvImportBtn.addEventListener("click", () => csvImportInput.click());
csvImportInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const rows = parseCsv(text);
  if (!rows.length) {
    showToast("No valid rows found in CSV. Expected columns: fullName, email.", "error");
    csvImportInput.value = "";
    return;
  }
  csvImportBtn.disabled = true;
  csvImportBtn.textContent = "Importing...";
  try {
    const result = await api("/api/admin/learners/bulk", { method: "POST", body: rows });
    showToast(`Imported ${result.created} learner${result.created !== 1 ? "s" : ""}. Skipped ${result.skipped} duplicate${result.skipped !== 1 ? "s" : ""}.`, "success");
    await loadLearners();
  } catch (err) {
    showToast(err.message || "Import failed.", "error");
  } finally {
    csvImportBtn.disabled = false;
    csvImportBtn.textContent = "Import CSV";
    csvImportInput.value = "";
  }
});

function parseCsvLine(line) {
  const result = [];
  let inQuotes = false;
  let current = "";
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (line[i] === "," && !inQuotes) {
      result.push(current); current = "";
    } else {
      current += line[i];
    }
  }
  result.push(current);
  return result;
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) =>
    h.trim().replace(/^"|"$/g, "").toLowerCase().replace(/\s+/g, "").replace(/[^a-z]/g, "")
  );
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    if (vals.every((v) => !v.trim())) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] || "").trim(); });
    if (!row.fullname || !row.email) continue;
    rows.push({
      fullName: row.fullname,
      email: row.email,
      ...(row.employeeid ? { employeeId: row.employeeid } : {}),
      ...(row.department ? { department: row.department } : {}),
      ...(row.roletrack || row.role ? { roleTrack: row.roletrack || row.role } : {}),
    });
  }
  return rows;
}

bootstrap();

// ============================================================
// COURSE EDIT FORM (module-level)
// ============================================================
const editCourseForm = document.getElementById("editCourseForm");
const editCourseStatus = document.getElementById("editCourseStatus");

document.getElementById("cancelEditCourseBtn").addEventListener("click", () => {
  editCourseForm.classList.add("hidden");
  editCourseStatus.textContent = "";
  editCourseStatus.className = "form-status";
});

document.getElementById("saveEditCourseBtn").addEventListener("click", async () => {
  const id = document.getElementById("editCourseId").value;
  const title = document.getElementById("ecTitle").value.trim();
  const courseType = document.getElementById("ecCourseType")?.value || "Compliance";
  const passPercent = parseInt(document.getElementById("ecPassPercent").value, 10);
  if (!title) {
    editCourseStatus.textContent = "Title is required.";
    editCourseStatus.className = "form-status is-error";
    return;
  }
  if (isNaN(passPercent) || passPercent < 0 || passPercent > 100) {
    editCourseStatus.textContent = "Pass % must be 0-100.";
    editCourseStatus.className = "form-status is-error";
    return;
  }
  const opensAtVal = document.getElementById("ecOpensAt")?.value;
  const closesAtVal = document.getElementById("ecClosesAt")?.value;
  const opensAt = opensAtVal ? new Date(opensAtVal).toISOString() : null;
  const closesAt = closesAtVal ? new Date(closesAtVal).toISOString() : null;
  const saveBtn = document.getElementById("saveEditCourseBtn");
  saveBtn.disabled = true;
  editCourseStatus.textContent = "Saving...";
  editCourseStatus.className = "form-status";
  try {
    await api(`/api/admin/courses/${id}`, { method: "PATCH", body: { title, courseType, passPercent, opensAt, closesAt } });
    showToast("Course updated.", "success");
    editCourseForm.classList.add("hidden");
    editCourseStatus.textContent = "";
    await loadSettings();
  } catch (err) {
    editCourseStatus.textContent = err.message || "Failed to update course.";
    editCourseStatus.className = "form-status is-error";
  } finally {
    saveBtn.disabled = false;
  }
});

// ============================================================
// BULK ENROLLMENT (module-level)
// ============================================================
const bulkEnrollForm = document.getElementById("bulkEnrollForm");
const bulkEnrollStatus = document.getElementById("bulkEnrollStatus");

document.getElementById("showBulkEnrollBtn").addEventListener("click", () => {
  bulkEnrollForm.classList.toggle("hidden");
  bulkEnrollStatus.textContent = "";
  bulkEnrollStatus.className = "form-status";
});

document.getElementById("cancelBulkEnrollBtn").addEventListener("click", () => {
  bulkEnrollForm.classList.add("hidden");
  bulkEnrollStatus.textContent = "";
});

document.getElementById("saveBulkEnrollBtn").addEventListener("click", async () => {
  const courseId = document.getElementById("bulkEnrCourse").value;
  const dueDate = document.getElementById("bulkEnrDueDate").value;
  if (!courseId) {
    bulkEnrollStatus.textContent = "Select a course.";
    bulkEnrollStatus.className = "form-status is-error";
    return;
  }
  const enrollAll = document.getElementById("bulkEnrAll").checked;
  const saveBtn = document.getElementById("saveBulkEnrollBtn");
  saveBtn.disabled = true;
  bulkEnrollStatus.textContent = "Enrolling...";
  bulkEnrollStatus.className = "form-status";
  try {
    const result = await api("/api/admin/enrollments/bulk", {
      method: "POST",
      body: {
        courseId,
        learnerIds: enrollAll ? "all" : allLearners.map((l) => l.id),
        ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
      },
    });
    showToast(`Enrolled ${result.enrolled}. Skipped ${result.skipped} already enrolled.`, "success");
    bulkEnrollForm.classList.add("hidden");
    bulkEnrollStatus.textContent = "";
    await loadEnrollments();
  } catch (err) {
    bulkEnrollStatus.textContent = err.message || "Failed to bulk enroll.";
    bulkEnrollStatus.className = "form-status is-error";
  } finally {
    saveBtn.disabled = false;
  }
});

// ============================================================
// ANALYTICS EXPORT (module-level)
// ============================================================
document.getElementById("exportAnalyticsBtn")?.addEventListener("click", () => {
  if (!analyticsCompletion && !analyticsTrends.length && !analyticsMastery?.roles?.length) {
    showToast("Open the Analytics tab first to load data.", "error");
    return;
  }
  const rows = [];
  if (analyticsCompletion) {
    rows.push(["Metric", "Value"]);
    rows.push(["Total Enrollments", analyticsCompletion.totalEnrollments]);
    rows.push(["Completed", analyticsCompletion.completedEnrollments]);
    rows.push(["Completion Rate", `${analyticsCompletion.completionRate}%`]);
    rows.push(["Passed Attempts", analyticsCompletion.passCount]);
    rows.push(["Failed Attempts", analyticsCompletion.failCount]);
    rows.push([]);
  }
  if (analyticsTrends.length) {
    rows.push(["Month", "Completions"]);
    [...analyticsTrends].reverse().forEach((t) => {
      const [year, month] = t.month.split("-");
      const label = new Date(parseInt(year), parseInt(month) - 1, 1)
        .toLocaleDateString("en-US", { month: "long", year: "numeric" });
      rows.push([label, t.count]);
    });
    rows.push([]);
  }
  if (analyticsMastery?.roles?.length) {
    rows.push(["Abuse/Neglect Mastery", ""]);
    rows.push(["Role Track", "Attempts", "Mastered", "Avg Mastery %", "Target %", "Mastery Rate %"]);
    analyticsMastery.roles.forEach((r) => {
      rows.push([r.roleTrack, r.attempts, r.masteredCount, r.avgMasteryPct, r.requiredThreshold, r.masteryRate]);
    });
  }
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("exportMasteryLearnersBtn")?.addEventListener("click", async () => {
  let learners = analyticsMasteryLearners;
  if (!learners?.length) {
    const result = await api("/api/analytics/mastery/abuse-neglect/learners").catch(() => null);
    learners = result?.learners || [];
    analyticsMasteryLearners = learners;
    populateMasteryAuditFilters(analyticsMasteryLearners);
  }

  learners = getFilteredMasteryLearners(learners);

  if (!learners.length) {
    showToast("No learner mastery data available for the current filters.", "error");
    return;
  }

  const rows = [
    ["Learner", "Email", "Employee ID", "Department", "Role Track", "Assessment %", "Abuse/Neglect %", "Required %", "Mastered", "Completed At"],
  ];

  learners.forEach((row) => {
    rows.push([
      row.learnerName || "",
      row.learnerEmail || "",
      row.employeeId || "",
      row.department || "",
      row.roleTrack || "",
      Number.isFinite(row.assessmentPercent) ? row.assessmentPercent : "",
      Number.isFinite(row.abuseNeglectPct) ? row.abuseNeglectPct : "",
      row.requiredThreshold || "",
      row.mastered ? "Yes" : "No",
      row.completedAt ? fmt(row.completedAt) : "",
    ]);
  });

  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const suffix = hasActiveMasteryFilters() ? "-filtered" : "";
  a.download = `mastery-audit-abuse-neglect${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

["masteryFilterRole", "masteryFilterDept", "masteryFilterFrom", "masteryFilterTo"].forEach((id) => {
  document.getElementById(id)?.addEventListener("change", refreshMasteryAuditSummary);
});

document.getElementById("masteryFilterClearBtn")?.addEventListener("click", () => {
  const role = document.getElementById("masteryFilterRole");
  const dept = document.getElementById("masteryFilterDept");
  const from = document.getElementById("masteryFilterFrom");
  const to = document.getElementById("masteryFilterTo");
  if (role) role.value = "";
  if (dept) dept.value = "";
  if (from) from.value = "";
  if (to) to.value = "";
  refreshMasteryAuditSummary();
});
