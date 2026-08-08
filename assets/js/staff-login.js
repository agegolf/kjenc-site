document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("login-form");
  const errorEl = document.getElementById("login-error");
  if (!form) return;

  // 이미 로그인되어 있으면 바로 허브로 이동
  const existing = staffGetSession();
  if (existing) {
    window.location.href = "index.html";
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.classList.add("hidden");

    const name = document.getElementById("f-name").value.trim();
    const pin = document.getElementById("f-pin").value.trim();

    if (!name || !pin) {
      errorEl.textContent = "이름과 PIN을 모두 입력해 주세요.";
      errorEl.classList.remove("hidden");
      return;
    }

    const result = await staffApiCall("login", { name: name, pin: pin });

    if (result.ok) {
      staffSetSession(name, pin, result.isAdmin);
      window.location.href = "index.html";
    } else {
      errorEl.textContent = result.message || "이름 또는 PIN이 올바르지 않습니다.";
      errorEl.classList.remove("hidden");
    }
  });
});
