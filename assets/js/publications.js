(function () {
  "use strict";

  document.querySelectorAll("[data-publications]").forEach(function (section) {
    var list = section.querySelector(".bibliography");
    var filters = section.querySelector(".publication-filters");
    var buttons = Array.from(filters.querySelectorAll("button"));
    var status = section.querySelector(".publication-status");
    // Keep the source order so All always follows the publication data.
    var entries = Array.from(list.querySelectorAll(".publication-entry"));
    var selected = entries.filter(function (entry) {
      return entry.hasAttribute("data-selected-order");
    }).sort(function (first, second) {
      return Number(first.dataset.selectedOrder) - Number(second.dataset.selectedOrder);
    });

    // Without curated entries (or JavaScript), the complete list stays visible.
    if (!selected.length) return;

    var remaining = entries.filter(function (entry) {
      return !entry.hasAttribute("data-selected-order");
    });

    function setView(view) {
      var showSelected = view === "selected";
      var ordered = showSelected ? selected.concat(remaining) : entries;
      var fragment = document.createDocumentFragment();

      ordered.forEach(function (entry) {
        entry.hidden = showSelected && !entry.hasAttribute("data-selected-order");
        fragment.appendChild(entry);
      });
      list.appendChild(fragment);

      buttons.forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.dataset.publicationFilter === view));
      });
      status.textContent = showSelected
        ? "Showing " + selected.length + " selected publications."
        : "Showing all " + entries.length + " publications.";
    }

    buttons.forEach(function (button) {
      button.addEventListener("click", function () {
        setView(button.dataset.publicationFilter);
      });
    });

    setView("selected");
    filters.hidden = false;
  });
})();
