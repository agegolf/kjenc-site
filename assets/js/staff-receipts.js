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
    const needsVehicle = categorySel.value === "유류비" || categorySel.value === "정비";
    vehicleFieldEl.classList.toggle("hidden", !needsVehicle);
    if (!needsVehicle) vehicleSel.value = "";
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
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "업로드 중...";

    const result = await staffApiCall("saveReceipt", payload);

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
