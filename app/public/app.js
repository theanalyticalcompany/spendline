(() => {
  const key = "spendline:scroll-y";

  window.addEventListener("DOMContentLoaded", () => {
    const saved = sessionStorage.getItem(key);
    if (saved !== null) {
      sessionStorage.removeItem(key);
      const y = Number(saved);
      if (Number.isFinite(y)) window.scrollTo({ top: y, left: 0 });
    }

    document.querySelectorAll("form[data-preserve-scroll]").forEach((form) => {
      form.addEventListener("submit", () => {
        sessionStorage.setItem(key, String(window.scrollY || 0));
      });
    });

    document.querySelectorAll("form[data-confirm]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        const message = form.getAttribute("data-confirm") || "Opravdu provest tuto akci?";
        if (!window.confirm(message)) event.preventDefault();
      });
    });

    document.querySelectorAll("select[data-auto-submit]").forEach((select) => {
      select.addEventListener("change", () => {
        if (select.form) select.form.requestSubmit();
      });
    });

    document.querySelectorAll("[data-note-input]").forEach((input) => {
      let timer = null;
      let lastSaved = input.value;
      const save = () => {
        if (input.value === lastSaved) return;
        lastSaved = input.value;
        const body = new URLSearchParams({
          id: input.getAttribute("data-transaction-id") || "",
          note: input.value,
        });
        fetch("/transactions/note", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body,
        }).catch(() => {
          lastSaved = "";
        });
      };
      input.addEventListener("input", () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(save, 700);
      });
      input.addEventListener("blur", () => {
        window.clearTimeout(timer);
        save();
      });
    });

    const chartFilters = [...document.querySelectorAll("[data-chart-filter]")];
    const applyChartFilters = () => {
      const hidden = chartFilters.filter((input) => !input.checked).map((input) => input.value);
      document.querySelectorAll("[data-chart-key]").forEach((item) => {
        item.style.display = hidden.includes(item.getAttribute("data-chart-key")) ? "none" : "";
      });
      const body = new URLSearchParams();
      hidden.forEach((value) => body.append("hiddenSegments", value));
      fetch("/dashboard/chart-filters", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      }).catch(() => {});
    };
    chartFilters.forEach((input) => {
      input.addEventListener("change", applyChartFilters);
    });
  });
})();
