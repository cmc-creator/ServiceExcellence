(() => {
  "use strict";

  // ─── DOM refs ─────────────────────────────────────────────────────────────
  const form          = document.getElementById("forgotForm");
  const emailInput    = document.getElementById("emailInput");
  const orgInput      = document.getElementById("orgInput");
  const apiBaseInput  = document.getElementById("apiBaseInput");
  const submitBtn     = document.getElementById("submitBtn");
  const statusText    = document.getElementById("statusText");
  const formState     = document.getElementById("formState");
  const resultState   = document.getElementById("resultState");
  const resetUrlEl    = document.getElementById("resetUrlDisplay");
  const copyBtn       = document.getElementById("copyBtn");
  const copyStatus    = document.getElementById("copyStatus");

  // ─── Toggle advanced panel ────────────────────────────────────────────────
  document.getElementById("toggleAdvancedBtn").addEventListener("click", function () {
    const panel = document.getElementById("advancedPanel");
    const hidden = panel.classList.toggle("hidden");
    this.textContent = hidden ? "Advanced connection settings" : "Hide advanced settings";
  });

  // ─── Pre-fill API base from localStorage if available ─────────────────────
  const storedBase = localStorage.getItem("nyxApiBase");
  if (storedBase) apiBaseInput.value = storedBase;

  // ─── Reveal animation ─────────────────────────────────────────────────────
  requestAnimationFrame(() => {
    document.querySelector(".login-shell")?.classList.add("visible");
  });

  // ─── Field error helpers ──────────────────────────────────────────────────
  function setError(id, msg) {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
  }
  function clearErrors() {
    ["emailError", "orgError", "apiBaseError"].forEach(id => setError(id, ""));
    statusText.textContent = "";
    statusText.classList.remove("error");
  }

  // ─── Submit ───────────────────────────────────────────────────────────────
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();

    const email   = emailInput.value.trim();
    const orgSlug = orgInput.value.trim();
    const apiBase = apiBaseInput.value.trim().replace(/\/$/, "");

    let valid = true;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("emailError", "Please enter a valid email address.");
      valid = false;
    }
    if (!orgSlug) {
      setError("orgError", "Organization slug is required.");
      valid = false;
    }
    if (!apiBase || !apiBase.startsWith("http")) {
      setError("apiBaseError", "Please provide a valid API URL.");
      valid = false;
    }
    if (!valid) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Generating...";

    try {
      const res  = await fetch(`${apiBase}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, organizationSlug: orgSlug }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        statusText.textContent = body.error || `Error ${res.status}. Please try again.`;
        statusText.classList.add("error");
        return;
      }

      // Build the reset URL from the token
      const token = body.resetToken;
      if (!token) {
        // Account not found — server returns a neutral message
        statusText.textContent = body.message || "If that account exists, a reset link has been generated.";
        return;
      }

      const resetUrl = `${location.origin}${location.pathname.replace("forgot-password.html", "")}reset-password.html?token=${encodeURIComponent(token)}&apiBase=${encodeURIComponent(apiBase)}`;
      resetUrlEl.value = resetUrl;

      formState.classList.add("hidden");
      resultState.classList.remove("hidden");
    } catch (err) {
      console.error("Forgot-password request failed:", err);
      statusText.textContent = "Network error. Check your connection and try again.";
      statusText.classList.add("error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Generate Reset Link";
    }
  });

  // ─── Copy button ──────────────────────────────────────────────────────────
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(resetUrlEl.value);
      copyStatus.textContent = "Copied to clipboard!";
      setTimeout(() => { copyStatus.textContent = ""; }, 3000);
    } catch {
      resetUrlEl.select();
      document.execCommand("copy");
      copyStatus.textContent = "Copied!";
      setTimeout(() => { copyStatus.textContent = ""; }, 3000);
    }
  });
})();
