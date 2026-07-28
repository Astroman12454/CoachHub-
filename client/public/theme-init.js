// Applies the saved/system theme before first paint so there's no flash of
// the light theme when the user has dark mode on.
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var isDark =
      stored === "dark" ||
      ((!stored || stored === "system") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
