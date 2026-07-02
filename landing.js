const revealNodes = document.querySelectorAll(".reveal");
const metricNodes = document.querySelectorAll(".metric-value");
const sectionAnchors = document.querySelectorAll(".nav-links a[href^='#']");
const observedSections = Array.from(sectionAnchors)
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
      }
    });
  },
  {
    threshold: 0.12,
    rootMargin: "0px 0px -40px 0px",
  }
);

revealNodes.forEach((node, index) => {
  node.style.transitionDelay = `${Math.min(index * 70, 280)}ms`;
  observer.observe(node);
});

function animateMetric(node) {
  const target = Number(node.dataset.count || "0");
  const duration = 900;
  const start = performance.now();

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - (1 - progress) * (1 - progress);
    node.textContent = `${Math.round(target * eased)}`;

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}

const metricsObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      animateMetric(entry.target);
      metricsObserver.unobserve(entry.target);
    });
  },
  { threshold: 0.4 }
);

metricNodes.forEach((node) => metricsObserver.observe(node));

function setActiveNav(hash) {
  sectionAnchors.forEach((link) => {
    const isActive = link.getAttribute("href") === hash;
    link.classList.toggle("is-active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "true");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

const sectionObserver = new IntersectionObserver(
  (entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

    if (!visible.length) return;
    setActiveNav(`#${visible[0].target.id}`);
  },
  { threshold: [0.35, 0.6], rootMargin: "-10% 0px -45% 0px" }
);

observedSections.forEach((section) => sectionObserver.observe(section));
