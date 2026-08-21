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

  // I-031(2026-08-15): 같은 날짜+참가자 겹침+금액 유사로 묶이는 식대지출(I-036)/
  // 숙박예약을 모아 보여준다 — 저장 시점 경고를 우회했거나 그 이전에 등록된 중복도
  // 사후에 훑어볼 수 있게 하기 위함.
  const dupListEl = document.getElementById("duplicate-list");
  const dupEmptyEl = document.getElementById("duplicate-empty");
  const dupTemplate = document.getElementById("duplicate-item-template");

  async function loadDuplicateSuspects() {
    dupListEl.innerHTML = "";
    dupEmptyEl.classList.add("hidden");

    const result = await staffApiCall("getDuplicateSuspects", { name: session.name, pin: session.pin });
    if (!result.ok || !result.suspects || result.suspects.length === 0) {
      dupEmptyEl.classList.remove("hidden");
      return;
    }
    result.suspects.forEach((s) => renderDuplicateItem(s));
  }

  function renderDuplicateItem(s) {
    const node = dupTemplate.content.cloneNode(true);
    const card = node.querySelector(".staff-card");
    node.querySelector(".d-type").textContent = s.type;
    node.querySelector(".d-date").textContent = s.date;
    node.querySelector(".d-overlap").textContent = s.overlapNames.join(", ");
    node.querySelector(".d-rowA").textContent = s.rowA;
    node.querySelector(".d-amountA").textContent = Number(s.amountA).toLocaleString();
    node.querySelector(".d-rowB").textContent = s.rowB;
    node.querySelector(".d-amountB").textContent = Number(s.amountB).toLocaleString();
    const photoA = node.querySelector(".d-photoA");
    if (s.photoUrlA) { photoA.href = s.photoUrlA; photoA.classList.remove("hidden"); }
    const photoB = node.querySelector(".d-photoB");
    if (s.photoUrlB) { photoB.href = s.photoUrlB; photoB.classList.remove("hidden"); }

    // I-045(2026-08-17): "행 A/B 그룹 삭제" — getDuplicateSuspects가 준 대표
    // 행(rowA/rowB)을 서버(handleDeleteDuplicateGroup_)로 넘기면, 같은
    // (날짜,결제금액) 그룹에 속한 참가자 전원의 행을 한꺼번에 지운다(참가자
    // 1명당 1행 구조라 대표 행 하나만 지우면 나머지가 고아로 남기 때문).
    node.querySelector(".d-delete-a").addEventListener("click", (e) => deleteDuplicateGroup(s.type, s.rowA, card, e.target));
    node.querySelector(".d-delete-b").addEventListener("click", (e) => deleteDuplicateGroup(s.type, s.rowB, card, e.target));

    dupListEl.appendChild(node);
  }

  async function deleteDuplicateGroup(type, row, cardEl, btnEl) {
    if (!window.confirm("이 그룹(같은 날짜+금액의 참가자 전원 행)을 전부 삭제하시겠습니까? 되돌릴 수 없습니다.")) return;
    const buttons = cardEl.querySelectorAll("button");
    buttons.forEach((b) => (b.disabled = true));
    btnEl.textContent = "삭제 중...";

    const result = await staffApiCall("deleteDuplicateGroup", {
      name: session.name, pin: session.pin, type: type, row: row,
    });

    if (result.ok) {
      cardEl.remove();
      if (!dupListEl.querySelector(".staff-card")) dupEmptyEl.classList.remove("hidden");
      showMsg((result.deletedRows || 0) + "건 삭제되었습니다.", false);
    } else {
      buttons.forEach((b) => (b.disabled = false));
      showMsg(result.message || "삭제에 실패했습니다.", true);
    }
  }

  loadPending();
  loadDuplicateSuspects();
});
