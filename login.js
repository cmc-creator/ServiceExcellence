const form = document.getElementById("loginForm");
const statusText = document.getElementById("statusText");
const submitBtn = document.getElementById("submitBtn");
const toggleAdvancedBtn = document.getElementById("toggleAdvancedBtn");
const advancedPanel = document.getElementById("advancedPanel");
const togglePasswordBtn = document.getElementById("togglePasswordBtn");

const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const orgInput = document.getElementById("orgInput");
const apiBaseInput = document.getElementById("apiBaseInput");

const fieldRefs = {
  email: { input: emailInput, error: document.getElementById("emailError") },
  password: { input: passwordInput, error: document.getElementById("passwordError") },
  organizationSlug: { input: orgInput, error: document.getElementById("orgError") },
  apiBase: { input: apiBaseInput, error: document.getElementById("apiBaseError") },
};

const revealNodes = document.querySelectorAll(".reveal");
const searchParams = new URLSearchParams(window.location.search);

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  },
  { threshold: 0.2 }
);

revealNodes.forEach((node) => revealObserver.observe(node));

toggleAdvancedBtn.addEventListener("click", () => {
  advancedPanel.classList.toggle("hidden");
});

togglePasswordBtn.addEventListener("click", () => {
  const shouldShow = passwordInput.type === "password";
  passwordInput.type = shouldShow ? "text" : "password";
  togglePasswordBtn.textContent = shouldShow ? "Hide" : "Show";
  togglePasswordBtn.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
});

function updateStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

if (searchParams.get("session") === "required") {
  updateStatus("Please sign in to continue your training session.");
} else if (searchParams.get("session") === "expired") {
  updateStatus("Your session has expired. Please sign in again.");
} else if (searchParams.get("reset") === "success") {
  updateStatus("Password updated. Please sign in with your new credentials.");
}

function setFieldError(fieldName, message) {
  const field = fieldRefs[fieldName];
  if (!field) return;
  field.error.textContent = message;
  field.input.classList.add("invalid");
}

function clearFieldError(fieldName) {
  const field = fieldRefs[fieldName];
  if (!field) return;
  field.error.textContent = "";
  field.input.classList.remove("invalid");
}

function clearAllFieldErrors() {
  Object.keys(fieldRefs).forEach(clearFieldError);
}

function validateFields() {
  clearAllFieldErrors();
  let valid = true;

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const orgSlug = orgInput.value.trim();
  const apiBase = apiBaseInput.value.trim();

  if (!email) {
    setFieldError("email", "Email is required.");
    valid = false;
  } else if (!/.+@.+\..+/.test(email)) {
    setFieldError("email", "Enter a valid email address.");
    valid = false;
  }

  if (!password) {
    setFieldError("password", "Password is required.");
    valid = false;
  } else if (password.length < 8) {
    setFieldError("password", "Password must be at least 8 characters.");
    valid = false;
  }

  if (!orgSlug) {
    setFieldError("organizationSlug", "Organization slug is required.");
    valid = false;
  }

  if (!apiBase) {
    setFieldError("apiBase", "API base URL is required.");
    valid = false;
  } else {
    try {
      const parsed = new URL(apiBase);
      if (!parsed.protocol.startsWith("http")) {
        throw new Error("Bad protocol");
      }
    } catch {
      setFieldError("apiBase", "Enter a valid URL, for example https://backend.example.com");
      valid = false;
    }
  }

  return valid;
}

async function login(payload, apiBase) {
  const response = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Login failed");
  }

  return data;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!validateFields()) {
    updateStatus("Please fix the highlighted fields.", true);
    return;
  }

  const apiBase = apiBaseInput.value.trim().replace(/\/$/, "");
  const payload = {
    email: emailInput.value.trim().toLowerCase(),
    password: passwordInput.value,
    organizationSlug: orgInput.value.trim(),
  };

  submitBtn.disabled = true;
  updateStatus("Signing in...");

  try {
    const result = await login(payload, apiBase);

    localStorage.setItem("nyxApiBase", apiBase);
    localStorage.setItem("nyxOrgSlug", payload.organizationSlug);
    localStorage.setItem("nyxLearnerEmail", payload.email);
    localStorage.setItem("nyxLearnerName", result.user?.fullName || "Training Learner");

    if (result.token) {
      localStorage.setItem("nyxAuthToken", result.token);
    }

    if (result.user?.role) {
      localStorage.setItem("nyxUserRole", result.user.role);
    }

    updateStatus("Login successful. Opening your dashboard...");
    window.setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 550);
  } catch (error) {
    updateStatus(error.message || "Unable to sign in", true);
  } finally {
    submitBtn.disabled = false;
  }
});
