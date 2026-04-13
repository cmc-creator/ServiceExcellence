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
          <button class="btn-action btn-action-delete" data-id="${sanitize(l.id)}">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
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
      <td><div class="action-cell"><button class="btn-action btn-action-edit" data-id="${sanitize(e.id)}" data-due="${e.dueDate ? new Date(e.dueDate).toISOString().slice(0, 10) : ''}">Edit Date</button><div class="inline-date-edit hidden" data-id="${sanitize(e.id)}"><input type="date" class="admin-input-inline" value="${e.dueDate ? new Date(e.dueDate).toISOString().slice(0, 10) : ''}"><button class="btn-action btn-action-save-date">Save</button><button class="btn-action btn-action-cancel-date">&#10005;</button></div><button class="btn-action btn-action-delete" data-id="${sanitize(e.id)}">Remove</button><button class="btn-action btn-action-remind" data-id="${sanitize(e.id)}">Remind</button></div></td>
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
    `;
    tbody.appendChild(tr);
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
async function loadAnalytics() {
  const [completion, events, trends] = await Promise.all([
    api("/api/analytics/completion"),
    api("/api/analytics/events/top"),
    api("/api/analytics/trends"),
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
  } else {
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

  // Trends table
  const trendsSection = document.getElementById("trendsSection");
  const trendsTbody = document.getElementById("trendsTableBody");
  if (trends && trends.length) {
    trendsSection.classList.remove("hidden");
    trendsTbody.innerHTML = "";
    [...trends].reverse().forEach((t) => {
      const [year, month] = t.month.split("-");
      const label = new Date(parseInt(year), parseInt(month) - 1, 1)
        .toLocaleDateString("en-US", { month: "long", year: "numeric" });
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${label}</td><td>${t.count}</td>`;
      trendsTbody.appendChild(tr);
    });
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

  // Org name form
  const nameInput = document.getElementById("settingsOrgName");
  const saveBtn = document.getElementById("saveSettingsBtn");
  const statusEl = document.getElementById("settingsStatus");
  if (nameInput && settings) nameInput.value = settings.name || "";

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
      <td>${sanitize(c.version)}</td>
      <td>${c.passPercent}%</td>
      <td><label class="toggle-label">
        <input type="checkbox" class="course-active-toggle" data-id="${sanitize(c.id)}" ${c.isActive ? "checked" : ""}>
        <span class="toggle-text ${c.isActive ? "text-green" : "text-muted"}">${c.isActive ? "Active" : "Inactive"}</span>
      </label></td>
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
    const actions = isOwner
      ? `<div class="action-cell">
          <button class="btn-action btn-action-edit" data-id="${sanitize(u.id)}" data-name="${sanitize(u.fullName)}" data-email="${sanitize(u.email)}" data-role="${sanitize(u.role)}">Edit</button>
          <button class="btn-action btn-action-delete" data-id="${sanitize(u.id)}">Delete</button>
        </div>`
      : `<span style="opacity:0.4;font-size:12px;">View only</span>`;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${sanitize(u.fullName)}</td>
      <td>${sanitize(u.email)}</td>
      <td>${rolePill}</td>
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
