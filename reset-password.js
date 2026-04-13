(() => {
  "use strict";

  // ─── Read token + apiBase from URL ────────────────────────────────────────
  const params  = new URLSearchParams(location.search);
  const token   = params.get("token");
  const apiBase = (params.get("apiBase") || localStorage.getItem("nyxApiBase") || "").replace(/\/$/, "");

  // ─── DOM refs ─────────────────────────────────────────────────────────────
  const formState    = document.getElementById("formState");
  const successState = document.getElementById("successState");
  const invalidState = document.getElementById("invalidState");
  const form         = document.getElementById("resetForm");
  const newPassInput = document.getElementById("newPasswordInput");
  const confPassInput= document.getElementById("confirmPasswordInput");
  const submitBtn    = document.getElementById("submitBtn");
  const statusText   = document.getElementById("statusText");

  // ─── Reveal animation ─────────────────────────────────────────────────────
  requestAnimationFrame(() => {
    document.querySelector(".login-shell")?.classList.add("visible");
  });

  // ─── No token? Show invalid state immediately ─────────────────────────────
  if (!token) {
    formState.classList.add("hidden");
    invalidState.classList.remove("hidden");
  }

  // ─── Password visibility toggles ──────────────────────────────────────────
  function wireToggle(btnId, inputId) {
    const btn   = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) return;
    btn.addEventListener("click", () => {
      const isPassword = input.type === "password";
      input.type      = isPassword ? "text" : "password";
      btn.textContent = isPassword ? "Hide" : "Show";
      btn.setAttribute("aria-label", isPassword ? "Hide password" : "Show password");
    });
  }
  wireToggle("toggleNewBtn",     "newPasswordInput");
  wireToggle("toggleConfirmBtn", "confirmPasswordInput");

  // ─── Error helpers ────────────────────────────────────────────────────────
  function setError(id, msg) {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
  }
  function clearErrors() {
    ["newPasswordError", "confirmPasswordError"].forEach(id => setError(id, ""));
    statusText.textContent = "";
    statusText.classList.remove("error");
  }

  // ─── Submit ───────────────────────────────────────────────────────────────
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();

    const newPassword  = newPassInput.value;
    const confirmPass  = confPassInput.value;

    let valid = true;
    if (newPassword.length < 8) {
      setError("newPasswordError", "Password must be at least 8 characters.");
      valid = false;
    }
    if (newPassword !== confirmPass) {
      setError("confirmPasswordError", "Passwords do not match.");
      valid = false;
    }
    if (!apiBase) {
      statusText.textContent = "Cannot determine API URL. Please use the link exactly as shared.";
      statusText.classList.add("error");
      return;
    }
    if (!valid) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Updating...";

    try {
      const res  = await fetch(`${apiBase}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.status === 400) {
        // Likely expired or invalid token
        formState.classList.add("hidden");
        invalidState.classList.remove("hidden");
        return;
      }

      if (!res.ok) {
        statusText.textContent = body.error || `Error ${res.status}. Please try again.`;
        statusText.classList.add("error");
        return;
      }

      // Success
      formState.classList.add("hidden");
      successState.classList.remove("hidden");
    } catch (err) {
      console.error("Reset-password request failed:", err);
      statusText.textContent = "Network error. Check your connection and try again.";
      statusText.classList.add("error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Set New Password";
    }
  });
})();
