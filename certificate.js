(() => {
  "use strict";

  // ─── Auth guard ───────────────────────────────────────────────────────────
  const token   = localStorage.getItem("nyxAuthToken");
  const apiBase = localStorage.getItem("nyxApiBase");
  if (!token || !apiBase) {
    location.replace("login.html?session=required");
    return;
  }

  // ─── DOM refs ─────────────────────────────────────────────────────────────
  const loadingEl = document.getElementById("loadingState");
  const errorEl   = document.getElementById("errorState");
  const errMsg    = document.getElementById("errorMsg");
  const certPage  = document.getElementById("certPage");
  const printBtn  = document.getElementById("printBtn");

  // ─── Helper: show/hide states ─────────────────────────────────────────────
  function showState(state) {
    loadingEl.classList.add("hidden");
    errorEl.classList.add("hidden");
    certPage.classList.add("hidden");
    if (state === "loading") loadingEl.classList.remove("hidden");
    else if (state === "error")  errorEl.classList.remove("hidden");
    else if (state === "cert")   certPage.classList.remove("hidden");
  }

  // ─── Pull cert ID from URL ────────────────────────────────────────────────
  const certId = new URLSearchParams(location.search).get("id");
  if (!certId) {
    errMsg.textContent = "No certificate ID specified.";
    showState("error");
    return;
  }

  // ─── Format helpers ───────────────────────────────────────────────────────
  function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric"
    });
  }

  function formatScore(score) {
    if (score == null) return "—";
    return `${Math.round(score)}%`;
  }

  function formatCertNo(id) {
    // Shorten UUID to display like NYX-XXXX-XXXX
    const clean = (id || "").replace(/-/g, "").toUpperCase();
    return `NYX-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
  }

  // ─── Populate DOM ─────────────────────────────────────────────────────────
  function populate(cert) {
    // Org name
    const orgName = cert.learner?.organization?.name
      || cert.learner?.organizationSlug
      || "NYX Training";
    document.getElementById("certOrgName").textContent = orgName.toUpperCase();

    // Learner name
    document.getElementById("certName").textContent =
      cert.learner?.fullName || cert.learner?.email || "—";

    // Course title
    document.getElementById("certCourse").textContent =
      cert.course?.title
      || cert.course?.code
      || "Service Excellence";

    // Score
    const passed = cert.attempt?.status === "PASSED";
    const score  = cert.attempt?.scorePercent ?? null;
    document.getElementById("certScore").textContent =
      score != null ? `Score: ${formatScore(score)} | ${passed ? "Passed" : "Completed"}` : "Completed";

    // Cert number — prefer the human-readable certificateNo on the record
    document.getElementById("certNo").textContent = cert.certificateNo || formatCertNo(cert.id);

    // Issue date
    document.getElementById("certDate").textContent = formatDate(cert.issuedAt || cert.createdAt);

    // Role / track — prefer roleTrack from learner record, fall back to user role
    const roleRaw = cert.learner?.roleTrack || cert.learner?.role || "";
    document.getElementById("certRole").textContent = roleRaw
      ? roleRaw.charAt(0).toUpperCase() + roleRaw.slice(1).toLowerCase()
      : "—";
  }

  // ─── Fetch certificate ────────────────────────────────────────────────────
  async function loadCert() {
    showState("loading");
    try {
      const res = await fetch(`${apiBase}/api/admin/certificates/${encodeURIComponent(certId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.status === 401) {
        location.replace("login.html?session=expired");
        return;
      }
      if (res.status === 403) {
        errMsg.textContent = "You don't have permission to view this certificate.";
        showState("error");
        return;
      }
      if (res.status === 404) {
        errMsg.textContent = "Certificate not found.";
        showState("error");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        errMsg.textContent = body.message || `Server error (${res.status}).`;
        showState("error");
        return;
      }

      const cert = await res.json();
      populate(cert);
      showState("cert");
    } catch (err) {
      console.error("Certificate fetch failed:", err);
      errMsg.textContent = "Could not load certificate. Check your connection and try again.";
      showState("error");
    }
  }

  // ─── Print button ─────────────────────────────────────────────────────────
  printBtn.addEventListener("click", () => window.print());

  // ─── Init ─────────────────────────────────────────────────────────────────
  loadCert();
})();
