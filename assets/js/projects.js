document.addEventListener("DOMContentLoaded", () => {
  const filterGroups = document.querySelectorAll("[data-filter-group]");
  const cards = document.querySelectorAll(".project-card");
  const emptyState = document.getElementById("empty-state");

  const activeFilters = {};
  filterGroups.forEach((group) => {
    activeFilters[group.dataset.filterGroup] = "all";
  });

  function applyFilters() {
    let visibleCount = 0;

    cards.forEach((card) => {
      const matches = Object.entries(activeFilters).every(([group, value]) => {
        if (value === "all") return true;
        return card.dataset[group] === value;
      });

      card.classList.toggle("hidden-by-filter", !matches);
      if (matches) visibleCount += 1;
    });

    emptyState.classList.toggle("hidden", visibleCount !== 0);
  }

  filterGroups.forEach((group) => {
    const buttons = group.querySelectorAll(".tag-filter");
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        buttons.forEach((b) => b.classList.remove("active"));
        button.classList.add("active");
        activeFilters[group.dataset.filterGroup] = button.dataset.filter;
        applyFilters();
      });
    });
  });
});
