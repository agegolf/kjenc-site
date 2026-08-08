// 영수증 승인 화면 (관리자 전용, I-011 2026-07-23)
// 서버(handleGetPendingReceipts_/handleUpdateReceiptStatus_)가 관리자 권한을 다시
// 검증하므로, 여기서는 화면 표시만 담당하고 실제 접근 제어는 서버 응답을 그대로 따른다.
document.addEventListener("DOMContentLoaded", () => {
  const session = staffRequireLogin();
  if (!session) return;

  document.getElementById("session-name").textContent = session.name;

  const listEl = document.getElementById("admin-list");
  const emptyEl = document.getElementById("admin-empty");
  const msgEl = document.getElementById("admin-msg");
  const template = document.getElementById("receipt-item-template");

  function showMsg(text, isError) {
    msgEl.textContent = text;
    msgEl.classList.remove("hidden", "staff-msg-error", "staff-msg-success");
    msgEl.classList.add(isError ? "staff-msg-error" : "staff-msg-success");
  }

  async function loadPending() {
    listEl.innerHTML = "";
    emptyEl.classList.add("hidden");
    msgEl.classList.add("hidden");

    const result = await staffApiCall("getPendingReceipts", { name: session.name, pin: session.pin });

    if (!result.ok) {
      showMsg(result.message || "목록을 불러오지 못했습니다. 관리자 권한이 있는 계정인지 확인해주세요.", true);
      return;
    }

    if (!result.receipts || result.receipts.length === 0) {
      emptyEl.classList.remove("hidden");
      return;
    }

    result.receipts.forEach((r) => renderItem(r));
  }

  function renderItem(r) {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".receipt-item");
    node.querySelector(".r-name").textContent = r.name;
    node.querySelector(".r-date").textContent = r.date;
    node.querySelector(".r-category").textContent = r.category;
    node.querySelector(".r-amount").textContent = Number(r.amount).toLocaleString();
    node.querySelector(".r-memo").textContent = r.memo || "-";
    node.querySelector(".r-registered").textContent = r.registeredAt;

    const photoLink = node.querySelector(".r-photo");
    if (r.photoUrl) {
      photoLink.href = r.photoUrl;
      photoLink.classList.remove("hidden");
    }

    const approveBtn = node.querySelector(".r-approve");
    const rejectBtn = node.querySelector(".r-reject");
    approveBtn.addEventListener("click", () => updateStatus(r.row, "승인", card));
    rejectBtn.addEventListener("click", () => updateStatus(r.row, "반려", card));

    listEl.appendChild(node);
  }

  async function updateStatus(row, status, cardEl) {
    const buttons = cardEl.querySelectorAll("button");
    buttons.forEach((b) => (b.disabled = true));

    const result = await staffApiCall("updateReceiptStatus", {
      name: session.name, pin: session.pin, row: row, status: status,
    });

    if (result.ok) {
      cardEl.remove();
      if (!listEl.querySelector(".receipt-item")) emptyEl.classList.remove("hidden");
      showMsg(status + " 처리되었습니다.", false);
    } else {
      buttons.forEach((b) => (b.disabled = false));
      showMsg(result.message || "처리에 실패했습니다.", true);
    }
  }

  loadPending();
});
