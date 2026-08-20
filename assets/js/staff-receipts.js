document.addEventListener("DOMContentLoaded", () => {
  const session = staffRequireLogin();
  if (!session) return;

  document.getElementById("session-name").textContent = session.name;
  document.getElementById("f-date").value = new Date().toISOString().slice(0, 10);

  const form = document.getElementById("receipt-form");
  const msgEl = document.getElementById("receipt-msg");
  const categorySel = document.getElementById("f-category");
  const vehicleFieldEl = document.getElementById("vehicle-field");
  const vehicleSel = document.getElementById("f-vehicle");
  const roomTypeFieldEl = document.getElementById("room-type-field");
  // I-058(2026-08-16): 방타입은 "1인실/2인실/3인실"처럼 한 예약에 여러
  // 인실 유형이 동시에 섞이는 복합값이라 자유텍스트로 받으면 표기가
  // 제각각(예: "1/2/3인실" vs "1.2.3인실") 저장되는 문제가 있었다 —
  // 인실 유형별 개수를 각각 입력받아 서버가 표준 포맷 문자열로 조합한다.
  const room1Input = document.getElementById("f-room-1");
  const room2Input = document.getElementById("f-room-2");
  const room3Input = document.getElementById("f-room-3");
  const participantsFieldEl = document.getElementById("participants-field");
  const participantsEl = document.getElementById("f-participants");

  // I-023(2026-08-09): 항목분류가 식비/숙박이면 "함께한 인원"을 체크박스로 고를 수
  // 있게 한다 — 본인은 기본 체크. 선택된 인원 목록은 저장 시 식대지출(I-036)/숙박예약
  // 시트에 균등분배(1인당 = 금액/인원수)로 함께 기록된다(saveMealGroups_/
  // saveLodgingGroups_ 재사용, handleSaveReceipt_에서 호출).
  participantsEl.innerHTML = STAFF_KNOWN_NAMES.map(
    (n) => `
      <label class="flex items-center gap-1">
        <input type="checkbox" class="f-participant-check" value="${n}" ${n === session.name ? "checked" : ""}>
        ${n}
      </label>`
  ).join("");

  // I-012(2026-08-05): 항목분류가 유류비/정비일 때만 차량번호 선택을 보여준다.
  // 차량목록은 프론트에 하드코딩하지 않고 서버(차량목록 시트)에서 가져온다.
  let vehicleOptionsHtml = `<option value="">차량 선택 안 함</option>`;
  staffApiCall("getVehicles", {}).then((result) => {
    if (result.ok && result.vehicles) {
      vehicleOptionsHtml += result.vehicles
        .map((v) => `<option value="${v.no}">${v.no}${v.type ? " (" + v.type + ")" : ""}</option>`)
        .join("");
      vehicleSel.innerHTML = vehicleOptionsHtml;
    }
  });

  function applyCategoryUI() {
    // I-059(2026-08-16): 통행료 지출도 차량번호를 받아야 차량월별현황의
    // 차량지출 집계에 반영된다 — 이전엔 유류비/정비만 노출해 통행료가
    // 항상 차량번호 없이 저장되고, 집계 로직이 차량번호 없는 행을 통째로
    // 건너뛰어(refreshVehicleMonthlySummary_) 통행료 지출이 차량지출
    // 섹션에서 전부 누락되는 버그가 있었다.
    const needsVehicle = categorySel.value === "유류비" || categorySel.value === "정비" || categorySel.value === "통행료";
    vehicleFieldEl.classList.toggle("hidden", !needsVehicle);
    if (!needsVehicle) vehicleSel.value = "";

    const needsRoomType = categorySel.value === "숙박";
    roomTypeFieldEl.classList.toggle("hidden", !needsRoomType);
    if (!needsRoomType) {
      room1Input.value = "0";
      room2Input.value = "0";
      room3Input.value = "0";
    }

    const needsParticipants = categorySel.value === "식비" || categorySel.value === "숙박";
    participantsFieldEl.classList.toggle("hidden", !needsParticipants);
  }
  categorySel.addEventListener("change", applyCategoryUI);
  applyCategoryUI();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgEl.className = "staff-msg";
    msgEl.classList.add("hidden");

    const fileInput = document.getElementById("f-photo");
    const amount = document.getElementById("f-amount").value;
    const category = categorySel.value;
    const date = document.getElementById("f-date").value;
    const site = document.getElementById("f-site").value;
    const paymentMethod = document.getElementById("f-payment").value;
    const memo = document.getElementById("f-memo").value;

    if (!amount || !category || !date) {
      msgEl.textContent = "날짜, 항목, 금액은 필수입니다.";
      msgEl.classList.add("staff-msg-error");
      msgEl.classList.remove("hidden");
      return;
    }
    if (!paymentMethod) {
      msgEl.textContent = "결제수단을 선택해주세요.";
      msgEl.classList.add("staff-msg-error");
      msgEl.classList.remove("hidden");
      return;
    }

    let photoBase64 = null;
    let photoName = null;
    let photoMime = null;
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      photoBase64 = await staffFileToBase64(file);
      photoName = file.name;
      photoMime = file.type;
    }

    const participants = Array.from(
      participantsEl.querySelectorAll(".f-participant-check:checked")
    ).map((el) => el.value);

    const payload = {
      name: session.name,
      pin: session.pin,
      date: date,
      site: site,
      category: category,
      amount: amount,
      paymentMethod: paymentMethod,
      memo: memo,
      // 세무 처리는 영수증 사진을 세무사가 별도로 보고 진행한다(I-014 2026-08-06) —
      // 공급가액/부가세/상호명/사업자등록번호/증빙유형은 더 이상 이 폼에서 받지 않는다.
      vehicleNumber: vehicleSel.value,
      photoBase64: photoBase64,
      photoName: photoName,
      photoMime: photoMime,
      // I-023(2026-08-09): 식비/숙박이고 함께한 인원이 2명 이상이면 서버가 이
      // 영수증을 식대지출(I-036)/숙박예약 시트에도 균등분배로 함께 기록한다.
      // I-058(2026-08-16): 방타입은 인실 유형별 개수로 보내고, 서버가 표준
      // 포맷 문자열("2인실 3개, 3인실 2개")로 조합해 저장한다 — 프론트가
      // 자유텍스트를 직접 조합하지 않아 표기가 흔들릴 여지가 없다.
      roomType1: Number(room1Input.value) || 0,
      roomType2: Number(room2Input.value) || 0,
      roomType3: Number(room3Input.value) || 0,
      participants: (category === "식비" || category === "숙박") ? participants : [],
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "업로드 중...";

    let result = await staffApiCall("saveReceipt", payload);

    // I-031(2026-08-15): 서버가 참가자 겹침+금액 유사로 "이미 등록된 것 같다"고
    // 판단하면 needsConfirm과 함께 저장을 거부한다 — 사용자에게 확인받고
    // "그래도 등록"을 고르면 같은 payload에 forceSubmit만 추가해 재요청한다
    // (사진은 이미 base64로 변환해 payload에 있으므로 다시 첨부할 필요 없음).
    if (!result.ok && result.needsConfirm) {
      const confirmed = window.confirm(result.message);
      if (confirmed) {
        payload.forceSubmit = true;
        result = await staffApiCall("saveReceipt", payload);
      } else {
        submitBtn.disabled = false;
        submitBtn.textContent = "영수증 등록";
        msgEl.textContent = "등록을 취소했습니다.";
        msgEl.classList.add("staff-msg-error");
        msgEl.classList.remove("hidden");
        return;
      }
    }

    submitBtn.disabled = false;
    submitBtn.textContent = "영수증 등록";

    if (result.ok) {
      msgEl.textContent = "영수증이 등록되었습니다.";
      msgEl.classList.add("staff-msg-success");
      msgEl.classList.remove("hidden");
      form.reset();
      document.getElementById("f-date").value = new Date().toISOString().slice(0, 10);
      applyCategoryUI();
    } else {
      msgEl.textContent = result.message || "등록에 실패했습니다. 잠시 후 다시 시도해주세요.";
      msgEl.classList.add("staff-msg-error");
      msgEl.classList.remove("hidden");
    }
  });
});
