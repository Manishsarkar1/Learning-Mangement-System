function setupQuiz() {
  const progressEl = document.getElementById("qprogress");
  const qNumEl = document.getElementById("qnum");
  const optionEls = Array.from(document.querySelectorAll(".quiz-option"));
  const nextButton = document.querySelector(".quiz-next");

  if (!progressEl || !qNumEl || optionEls.length === 0 || !nextButton) return;

  const total = 5;
  let qNum = Number(qNumEl.textContent) || 1;

  function setProgress() {
    const pct = Math.max(0, Math.min(100, ((qNum - 1) / total) * 100));
    progressEl.style.width = `${pct}%`;
  }

  function clearSelection() {
    optionEls.forEach((el) => el.classList.remove("selected"));
  }

  optionEls.forEach((el) => {
    el.addEventListener("click", () => {
      clearSelection();
      el.classList.add("selected");
    });
  });

  nextButton.addEventListener("click", () => {
    if (qNum < total) {
      qNum += 1;
      qNumEl.textContent = String(qNum);
      setProgress();
      clearSelection();
    }
  });

  setProgress();
}

function setupSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const id = a.getAttribute("href").slice(1);
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: "smooth" });
    });
  });
}

setupQuiz();
setupSmoothScroll();

