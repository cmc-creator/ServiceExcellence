const revealNodes = document.querySelectorAll(".reveal");
const metricNodes = document.querySelectorAll(".metric-value");

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
