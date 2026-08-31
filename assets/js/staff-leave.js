document.addEventListener("DOMContentLoaded", () => {
  const session = staffRequireLogin();
  if (!session) return;

  document.getElementById("session-name").textContent = session.name;
  document.getElementById("f-name").value = session.name;
  document.getElementById("f-date").value = new Date().toISOString().slice(0, 10);

  const form = document.getElementById("leave-form");
  const msgEl = document.getElementById("leave-msg");
  const submitBtn = document.getElementById("leave-submit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgEl.className = "staff-msg";
    msgEl.classList.add("hidden");

    const date = document.getElementById("f-date").value;
    const reason = document.getElementById("f-reason").value;
    const memo = document.getElementById("f-memo").value;

    if (!date) {
      msgEl.textContent = "날짜를 선택해주세요.";
      msgEl.classList.add("staff-msg-error");
      msgEl.classList.remove("hidden");
      return;
    }
    if (!reason) {
      msgEl.textContent = "사유를 선택해주세요.";
      msgEl.classList.add("staff-msg-error");
      msgEl.classList.remove("hidden");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "등록 중...";

    const payload = {
      name: session.name,
      pin: session.pin,
      date: date,
      reason: reason,
      memo: memo,
    };

    const result = await staffApiCall("saveLeave", payload);

    submitBtn.disabled = false;
    submitBtn.textContent = "등록";

    if (result.ok) {
      msgEl.textContent = "휴무가 등록되었습니다.";
      msgEl.classList.add("staff-msg-success");
      msgEl.classList.remove("hidden");
      document.getElementById("f-reason").value = "";
      document.getElementById("f-memo").value = "";
    } else {
      msgEl.textContent = result.message || "등록에 실패했습니다.";
      msgEl.classList.add("staff-msg-error");
      msgEl.classList.remove("hidden");
    }
  });
});
