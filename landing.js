const revealNodes = document.querySelectorAll(".reveal");
const metricNodes = document.querySelectorAll(".metric-value");
const sectionAnchors = document.querySelectorAll(".nav-links a[href^='#']");
const orbA = document.querySelector(".orb-a");
const orbB = document.querySelector(".orb-b");
const tiltCards = document.querySelectorAll("[data-tilt]");
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

function updateOrbsParallax(xPercent, yPercent) {
  if (!orbA || !orbB) return;

  orbA.style.transform = `translate(${xPercent * -10}px, ${yPercent * -8}px)`;
  orbB.style.transform = `translate(${xPercent * 12}px, ${yPercent * 10}px)`;
}

let parallaxRaf = null;
window.addEventListener("pointermove", (event) => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const x = (event.clientX / window.innerWidth - 0.5) * 2;
  const y = (event.clientY / window.innerHeight - 0.5) * 2;

  if (parallaxRaf) cancelAnimationFrame(parallaxRaf);
  parallaxRaf = requestAnimationFrame(() => updateOrbsParallax(x, y));
});

window.addEventListener("scroll", () => {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const y = Math.min(window.scrollY / 1200, 1);
  updateOrbsParallax(0, y);
});

function bindTiltCard(card) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  card.addEventListener("pointermove", (event) => {
    const bounds = card.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    const rotateY = (x * 7).toFixed(2);
    const rotateX = (-y * 6).toFixed(2);

    card.style.setProperty("--ry", `${rotateY}deg`);
    card.style.setProperty("--rx", `${rotateX}deg`);
  });

  const reset = () => {
    card.style.setProperty("--ry", "0deg");
    card.style.setProperty("--rx", "0deg");
  };

  card.addEventListener("pointerleave", reset);
  card.addEventListener("pointercancel", reset);
}

tiltCards.forEach(bindTiltCard);
