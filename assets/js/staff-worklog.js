document.addEventListener("DOMContentLoaded", () => {
  const session = staffRequireLogin();
  if (!session) return;

  document.getElementById("session-name").textContent = session.name;

  const dateInput = document.getElementById("f-date");
  dateInput.value = new Date().toISOString().slice(0, 10);

  const rowsEl = document.getElementById("worker-rows");
  const addBtn = document.getElementById("add-worker-btn");
  const lodgingEl = document.getElementById("lodging-groups");
  const addLodgingBtn = document.getElementById("add-lodging-btn");
  const mealEl = document.getElementById("meal-groups");
  const addMealBtn = document.getElementById("add-meal-btn");
  const vehicleLogEl = document.getElementById("vehicle-logs");
  const addVehicleLogBtn = document.getElementById("add-vehiclelog-btn");
  const form = document.getElementById("worklog-form");
  const msgEl = document.getElementById("worklog-msg");

  // 새로고침 시 입력 내용 유지(사용자 요청, 2026-08-08): 폼 전체(날짜/현장명/작업내용
  // 등 기본 필드 + 근무자/숙박/식사/차량이동 그룹의 텍스트·숫자·선택값)를 매 입력마다
  // localStorage에 저장해두고, 페이지 로드 시 복원한다. 사진(File 객체)은 브라우저
  // 보안 정책상 localStorage에 저장할 수 없어 복원 대상에서 제외 — 새로고침 후에는
  // 다시 첨부해야 한다(각 첨부란에 안내 문구 추가).
  const DRAFT_KEY = "kjenc_worklog_draft";
  let draftRestoring = false;

  function collectDraftState() {
    return {
      date: document.getElementById("f-date").value,
      site: document.getElementById("f-site").value,
      siteType: document.getElementById("f-site-type").value,
      client: document.getElementById("f-client").value,
      workContent: document.getElementById("f-content").value,
      workers: Array.from(rowsEl.querySelectorAll(".staff-worker-group")).map((group) => ({
        workType: group.querySelector(".w-worktype").value,
        name: group.querySelector(".w-name").value,
        start: getTimeValue(group, ".w-start-h", ".w-start-m"),
        end: getTimeValue(group, ".w-end-h", ".w-end-m"),
        travel: group.querySelector(".w-travel").value,
        vehicleNumber: group.querySelector(".w-vehicle").value,
        status: group.querySelector(".w-status").value,
        extraTravel: group.querySelector(".w-extra-travel").value,
        travelEndH: group.querySelector(".w-travelend-h").value,
        travelEndM: group.querySelector(".w-travelend-m").value,
        extraHours: group.querySelector(".w-extra-hours").value,
        extraManual: group.querySelector(".w-extra-hours").dataset.manual === "true",
        overtimeHours: group.querySelector(".w-overtime-hours").value,
      })),
      lodgingGroups: Array.from(lodgingEl.querySelectorAll(".staff-lodging-group")).map((group) => ({
        site: group.querySelector(".l-site").value,
        roomType: group.querySelector(".l-roomtype").value,
        amount: group.querySelector(".l-amount").value,
        paymentMethod: group.querySelector(".l-payment").value,
        names: Array.from(group.querySelectorAll(".l-name")).filter((cb) => cb.checked).map((cb) => cb.value),
      })),
      mealGroups: Array.from(mealEl.querySelectorAll(".staff-lodging-group")).map((group) => ({
        site: group.querySelector(".l-site").value,
        mealType: group.querySelector(".l-mealtype").value,
        mode: group.querySelector(".l-mode").value,
        amount: group.querySelector(".l-amount").value,
        paymentMethod: group.querySelector(".l-payment").value,
        names: Array.from(group.querySelectorAll(".l-name")).filter((cb) => cb.checked).map((cb) => cb.value),
        participants: Array.from(group.querySelectorAll(".staff-meal-custom-row"))
          .filter((row) => row.querySelector(".mc-check").checked)
          .map((row) => ({
            name: row.querySelector(".mc-check").value,
            amount: row.querySelector(".mc-amount").value,
            paymentMethod: row.querySelector(".mc-payment").value,
          })),
      })),
      vehicleLogs: Array.from(vehicleLogEl.querySelectorAll(".staff-lodging-group")).map((group) => {
        const dh = group.querySelector(".v-depart-h").value;
        const dm = group.querySelector(".v-depart-m").value;
        const ah = group.querySelector(".v-arrive-h").value;
        const am = group.querySelector(".v-arrive-m").value;
        return {
          vehicleNumber: group.querySelector(".v-vehicle").value,
          driver: group.querySelector(".v-driver").value,
          fromSite: group.querySelector(".v-from").value,
          toSite: group.querySelector(".v-to").value,
          departTime: (dh && dm) ? `${dh}:${dm}` : "",
          arriveTime: (ah && am) ? `${ah}:${am}` : "",
          memo: group.querySelector(".v-memo").value,
        };
      }),
    };
  }

  function saveDraft() {
    if (draftRestoring) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(collectDraftState()));
    } catch (e) { /* localStorage 용량 초과 등은 초안 저장 실패일 뿐 저장 자체를 막지 않음 */ }
  }

  function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
  }

  function loadDraft() {
    let raw;
    try {
      raw = localStorage.getItem(DRAFT_KEY);
    } catch (e) { return null; }
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  // I-012(2026-08-05): 근무자가 이동방법="회사차"를 고르면 어떤 차를 썼는지 선택할 수
  // 있어야 한다. 차량목록은 프론트에 하드코딩하지 않고 서버(차량목록 시트)에서 가져온다
  // — receipts.html의 getVehicles 패턴과 동일. 차량이동로그(I-014)의 차량 선택도 같은
  // 목록을 재사용한다.
  let vehicleOptionsHtml = `<option value="">차량 선택</option>`;
  staffApiCall("getVehicles", {}).then((result) => {
    if (result.ok && result.vehicles) {
      vehicleOptionsHtml += result.vehicles
        .map((v) => `<option value="${v.no}">${v.no}${v.type ? " (" + v.type + ")" : ""}</option>`)
        .join("");
      document.querySelectorAll(".w-vehicle, .v-vehicle").forEach((sel) => {
        const current = sel.value;
        sel.innerHTML = vehicleOptionsHtml;
        sel.value = current;
      });
    }
  });

  function nameOptions(selected) {
    return STAFF_KNOWN_NAMES.map(
      (n) => `<option value="${n}" ${n === selected ? "selected" : ""}>${n}</option>`
    ).join("");
  }

  // 모바일에서 <input type="time">이 기기 설정(12시간 AM/PM 등)에 따라 다르게
  // 보이는 문제를 피하기 위해, 항상 00~23시 드롭다운으로 고정 표시한다.
  function hourOptions(selected) {
    let opts = "";
    for (let h = 0; h < 24; h++) {
      const v = String(h).padStart(2, "0");
      opts += `<option value="${v}" ${v === selected ? "selected" : ""}>${v}</option>`;
    }
    return opts;
  }

  function minuteOptions(selected) {
    return ["00", "10", "20", "30", "40", "50"]
      .map((v) => `<option value="${v}" ${v === selected ? "selected" : ""}>${v}</option>`)
      .join("");
  }

  function timePickerHtml(hourClass, minuteClass, defaultHour, defaultMinute, label) {
    return `
      <div class="staff-time-picker"${label ? ` data-label="${label}"` : ''}>
        <select class="staff-select ${hourClass}">${hourOptions(defaultHour)}</select>
        <span>:</span>
        <select class="staff-select ${minuteClass}">${minuteOptions(defaultMinute)}</select>
      </div>
    `;
  }

  // 이동종료시각(I-012 2026-08-05)처럼 "값이 없음(실제 이동 없음)"을 표현해야 하는
  // 타임피커 전용 헬퍼. 맨 앞에 빈 옵션("--")을 두어, 아무것도 고르지 않은 상태를
  // 명시적으로 나타낼 수 있게 한다(일반 timePickerHtml은 항상 00:00 등 기본값이 selected
  // 되어버려 "값 없음"을 표현할 수 없다).
  function optionalTimePickerHtml(hourClass, minuteClass) {
    return `
      <div class="staff-time-picker">
        <select class="staff-select ${hourClass}"><option value="" selected>--</option>${hourOptions("")}</select>
        <span>:</span>
        <select class="staff-select ${minuteClass}"><option value="" selected>--</option>${minuteOptions("")}</select>
      </div>
    `;
  }

  function getTimeValue(group, hourClass, minuteClass) {
    const h = group.querySelector(hourClass).value;
    const m = group.querySelector(minuteClass).value;
    return `${h}:${m}`;
  }

  // saved(선택, 새로고침 복원용): { workType, name, start:"HH:MM", end:"HH:MM", travel,
  // vehicleNumber, status, extraTravel, travelEndH, travelEndM, extraHours, extraManual,
  // overtimeHours } — addWorkerRow(saved)로 호출하면 해당 값으로 행을 채운다.
  function addWorkerRow(saved) {
    saved = saved || {};
    const group = document.createElement("div");
    group.className = "staff-worker-group";

    const [startH, startM] = (saved.start || "07:30").split(":");
    const [endH, endM] = (saved.end || "16:30").split(":");

    const row = document.createElement("div");
    row.className = "staff-worker-row";
    row.innerHTML = `
      <div data-label="근무구분">
        <select class="staff-select w-worktype">
          <option value="정규근무">정규근무</option>
          <option value="이동만">이동만(합류/지원 이동)</option>
        </select>
      </div>
      <div data-label="이름">
        <select class="staff-select w-name">${nameOptions(saved.name || "")}</select>
      </div>
      ${timePickerHtml("w-start-h", "w-start-m", startH, startM, "시작")}
      ${timePickerHtml("w-end-h", "w-end-m", endH, endM, "종료")}
      <div data-label="이동방법">
        <select class="staff-select w-travel">
          <option value="자차">자차</option>
          <option value="대중교통">대중교통</option>
          <option value="회사차">회사차</option>
        </select>
      </div>
      <div data-label="사용차량">
        <select class="staff-select w-vehicle" disabled>${vehicleOptionsHtml}</select>
      </div>
      <div data-label="근태">
        <select class="staff-select w-status">
          <option value="정상">정상</option>
          <option value="지각">지각</option>
          <option value="조퇴">조퇴</option>
          <option value="결근">결근</option>
          <option value="휴가">휴가</option>
        </select>
      </div>
      <button type="button" class="staff-remove-btn">삭제</button>
    `;
    if (saved.workType) row.querySelector(".w-worktype").value = saved.workType;
    if (saved.travel) row.querySelector(".w-travel").value = saved.travel;
    if (saved.status) row.querySelector(".w-status").value = saved.status;

    // 이동시간(I-016 2026-08-06): 18시 이후 타현장 이동에 걸린 시간만 기록한다.
    // 예전에는 이 값에 시간당 단가를 즉시 곱해 "이동지원금(원)"으로 저장했지만,
    // 지금은 시간 숫자만 근무기록에 저장하고 금액 환산은 월말 정산에서 처리한다
    // (calcAllowanceBreakdown_ 폐지). 이동종료시각을 입력하면 시간을 자동 계산해
    // 보여주는 보조 기능은 그대로 유지 — 최종 저장값은 이 시간(extraHours) 숫자뿐이다.
    const extraRow = document.createElement("div");
    extraRow.className = "staff-worker-extra";
    extraRow.innerHTML = `
      <span class="w-extra-label">근무시간외(18시 이후) 타현장 이동 — 이동종료시각/이동시간:</span>
      <select class="staff-select w-extra-travel" style="width:auto;">
        <option value="자차">자차</option>
        <option value="회사차">회사차</option>
      </select>
      <span class="w-travel-end-picker"></span>
      <input type="number" class="w-extra-hours" min="0" max="8" step="0.5" value="0" placeholder="0">
      <span>시간 (이동종료시각을 입력하면 자동 계산됩니다. 다르면 직접 수정하세요. 월말에 이동시간을 합산해 정산됩니다.)</span>
    `;
    extraRow.querySelector(".w-travel-end-picker").outerHTML = optionalTimePickerHtml(
      "w-travelend-h", "w-travelend-m"
    );

    // 초과근무시간(I-016 2026-08-06 신규): 실제 초과근무한 시간을 근무자가 직접
    // 숫자로 입력한다(예: 18:00~21:00 초과근무 → 3). 일당이 사람마다 달라 건별로
    // 금액을 계산하지 않고, 월말에 그 달 시간을 합산한 뒤 개인별 일당을 적용해
    // 초과근무수당을 계산한다.
    const overtimeRow = document.createElement("div");
    overtimeRow.className = "staff-worker-extra";
    overtimeRow.innerHTML = `
      <span>초과근무시간(실제 초과근무한 시간, 예: 18:00~21:00이면 3):</span>
      <input type="number" class="w-overtime-hours" min="0" max="12" step="0.5" value="0" placeholder="0">
      <span>시간 (월말에 합산해 개인 일당 기준으로 정산됩니다.)</span>
    `;

    row.querySelector(".staff-remove-btn").addEventListener("click", () => {
      group.remove();
      saveDraft();
    });

    const worktypeSel = row.querySelector(".w-worktype");
    const startHSel = row.querySelector(".w-start-h");
    const startMSel = row.querySelector(".w-start-m");
    const endHSel = row.querySelector(".w-end-h");
    const endMSel = row.querySelector(".w-end-m");
    const travelSel = row.querySelector(".w-travel");
    const vehicleSel = row.querySelector(".w-vehicle");
    const statusSel = row.querySelector(".w-status");
    const extraLabelEl = extraRow.querySelector(".w-extra-label");
    const extraTravelSel = extraRow.querySelector(".w-extra-travel");
    const extraHoursInput = extraRow.querySelector(".w-extra-hours");
    const travelEndHSel = extraRow.querySelector(".w-travelend-h");
    const travelEndMSel = extraRow.querySelector(".w-travelend-m");
    const overtimeHoursInput = overtimeRow.querySelector(".w-overtime-hours");

    function toMinutes(h, m) {
      if (h === "" || m === "") return null;
      return parseInt(h, 10) * 60 + parseInt(m, 10);
    }

    // 이동지원금(이동수당) 자동계산: "이동종료시각 - max(근무종료, 18:00)"로 계산하면,
    // 정규근무가 18시를 넘겨 이어지는 경우와 18시부터 새로 합류하는 경우가 동일한 공식
    // 하나로 자연스럽게 처리된다(I-012 2026-08-05: 기준 시각을 근무종료 대신 이동종료
    // 시각으로 분리 — 초과근무수당과 중복 계산 방지). "이동만"은 cutoff 없이 시작~
    // 이동종료시각 전체를 그대로 쓴다. 이동종료시각이 비어있으면 0으로 둔다.
    function recalcExtraHours() {
      if (extraHoursInput.dataset.manual === "true") return;
      const startMin = toMinutes(startHSel.value, startMSel.value);
      let travelEndMin = toMinutes(travelEndHSel.value, travelEndMSel.value);
      if (travelEndMin === null) {
        extraHoursInput.value = 0;
        return;
      }
      if (startMin !== null && travelEndMin < startMin) travelEndMin += 24 * 60; // 자정 보정

      let overtimeMin;
      if (worktypeSel.value === "이동만") {
        overtimeMin = Math.max(0, travelEndMin - (startMin || 0));
      } else {
        const endMin = toMinutes(endHSel.value, endMSel.value) || 0;
        const cutoff = 18 * 60;
        overtimeMin = Math.max(0, travelEndMin - Math.max(endMin, cutoff));
      }
      const hours = Math.round((overtimeMin / 60) * 2) / 2; // 0.5시간 단위로 반올림
      extraHoursInput.value = hours > 0 ? hours : 0;
      if (hours > 0) {
        // 이동수당 이동방법에는 "대중교통" 옵션이 없으므로 자차로 대체
        extraTravelSel.value = travelSel.value === "회사차" ? "회사차" : "자차";
      }
    }

    // 이동방법="회사차"일 때만 사용차량 선택을 활성화한다(I-012 2026-08-05).
    function applyTravelUI() {
      const isCompanyCar = travelSel.value === "회사차";
      vehicleSel.disabled = !isCompanyCar;
      if (!isCompanyCar) vehicleSel.value = "";
    }

    // "이동만" 또는 근태상태="휴가"를 고르면 나머지 필드는 의미가 없으므로 비활성화한다
    // (I-012 2026-08-05: "휴가"는 근무시간/지원금/이동시간 전부 0으로 서버에서 강제됨).
    function applyWorktypeUI() {
      const isMoveOnly = worktypeSel.value === "이동만";
      const isVacation = statusSel.value === "휴가";
      statusSel.disabled = isMoveOnly;
      if (isMoveOnly) statusSel.value = "정상";
      extraLabelEl.textContent = isMoveOnly
        ? "이동 시간(합류/지원 이동 전체) — 이동종료시각/이동시간:"
        : "근무시간외(18시 이후) 타현장 이동 — 이동종료시각/이동시간:";

      [startHSel, startMSel, endHSel, endMSel, travelSel, vehicleSel,
        travelEndHSel, travelEndMSel, extraTravelSel, extraHoursInput, overtimeHoursInput].forEach((el) => {
        el.disabled = isVacation || (el === vehicleSel && travelSel.value !== "회사차");
      });
    }

    [startHSel, startMSel, endHSel, endMSel, travelEndHSel, travelEndMSel].forEach((el) =>
      el.addEventListener("change", recalcExtraHours)
    );
    travelSel.addEventListener("change", () => {
      applyTravelUI();
      recalcExtraHours();
    });
    worktypeSel.addEventListener("change", () => {
      applyWorktypeUI();
      recalcExtraHours();
    });
    statusSel.addEventListener("change", applyWorktypeUI);
    extraHoursInput.addEventListener("input", () => {
      extraHoursInput.dataset.manual = "true";
    });
    // 저장된 값 복원(새로고침 이후) — recalcExtraHours()가 자동계산으로 덮어쓰기 전에
    // 먼저 적용한 뒤, 사용자가 직접 수정했던 값이면 manual 플래그를 세워 보존한다.
    if (saved.extraTravel) extraTravelSel.value = saved.extraTravel;
    if (saved.travelEndH) travelEndHSel.value = saved.travelEndH;
    if (saved.travelEndM) travelEndMSel.value = saved.travelEndM;
    if (saved.vehicleNumber) vehicleSel.value = saved.vehicleNumber;

    applyTravelUI();
    applyWorktypeUI();
    recalcExtraHours();

    if (saved.extraManual && saved.extraHours !== undefined) {
      extraHoursInput.value = saved.extraHours;
      extraHoursInput.dataset.manual = "true";
    }
    if (saved.overtimeHours !== undefined) overtimeHoursInput.value = saved.overtimeHours;

    // 새로고침 복원(초안 자동저장): 이 그룹 안의 모든 입력 변경 시마다 폼 전체를
    // localStorage에 다시 저장한다.
    group.addEventListener("input", saveDraft);
    group.addEventListener("change", saveDraft);

    group.appendChild(row);
    group.appendChild(extraRow);
    group.appendChild(overtimeRow);
    rowsEl.appendChild(group);
  }

  function lodgingNameCheckboxes() {
    return STAFF_KNOWN_NAMES.map(
      (n) => `<label><input type="checkbox" class="l-name" value="${n}"> ${n}</label>`
    ).join("");
  }

  // saved(선택, 새로고침 복원용): { site, roomType, amount, paymentMethod, names:[] }
  // 영수증 사진은 File 객체라 localStorage에 저장할 수 없어 복원 대상에서 제외한다.
  function addLodgingGroup(saved) {
    saved = saved || {};
    const group = document.createElement("div");
    group.className = "staff-lodging-group";
    group.innerHTML = `
      <div class="staff-lodging-group-head">
        <input type="text" class="l-site" placeholder="현장명" value="${(saved.site || "").replace(/"/g, "&quot;")}">
        <select class="staff-select l-roomtype" style="flex:1;">
          <option value="">방타입(선택)</option>
          <option value="침대1">침대1</option>
          <option value="침대2">침대2</option>
        </select>
        <input type="number" class="l-amount" placeholder="실제 결제금액(원)" min="0" step="1000" value="${saved.amount || ""}">
        <button type="button" class="staff-remove-btn l-remove">삭제</button>
      </div>
      <div class="staff-lodging-group-head">
        <select class="staff-select l-payment" style="flex:1;" required>
          <option value="">결제수단(선택)</option>
          <option value="회사카드">회사카드</option>
          <option value="개인카드">개인카드</option>
        </select>
      </div>
      <div class="staff-lodging-names">${lodgingNameCheckboxes()}</div>
      <p class="staff-lodging-per-person"></p>
      <div class="staff-lodging-photo">
        <label class="staff-lodging-photo-label">영수증 사진 (필수, 새로고침 시 다시 첨부해주세요)</label>
        <input type="file" class="l-photo" accept="image/*" capture="environment">
      </div>
    `;
    if (saved.roomType) group.querySelector(".l-roomtype").value = saved.roomType;
    if (saved.paymentMethod) group.querySelector(".l-payment").value = saved.paymentMethod;
    (saved.names || []).forEach((n) => {
      const cb = group.querySelector(`.l-name[value="${n}"]`);
      if (cb) cb.checked = true;
    });

    const amountInput = group.querySelector(".l-amount");
    const perPersonEl = group.querySelector(".staff-lodging-per-person");
    const nameCheckboxes = Array.from(group.querySelectorAll(".l-name"));

    function updatePerPerson() {
      const checkedCount = nameCheckboxes.filter((cb) => cb.checked).length;
      const amount = Number(amountInput.value) || 0;
      if (checkedCount > 0 && amount > 0) {
        const perPerson = Math.round(amount / checkedCount);
        perPersonEl.textContent = `→ ${checkedCount}명 기준 1인당 ${perPerson.toLocaleString()}원`;
      } else {
        perPersonEl.textContent = "";
      }
    }

    amountInput.addEventListener("input", updatePerPerson);
    nameCheckboxes.forEach((cb) => cb.addEventListener("change", updatePerPerson));
    group.querySelector(".l-remove").addEventListener("click", () => {
      group.remove();
      saveDraft();
    });
    group.addEventListener("input", saveDraft);
    group.addEventListener("change", saveDraft);
    updatePerPerson();

    lodgingEl.appendChild(group);
  }

  // 식사그룹(I-016 2026-08-06): 결제 상황이 다양함(대표 회사카드 결제/대표 개인카드
  // 결제/각자 결제, 각자 다른 금액)을 커버하기 위해 "균등분배"와 "개별입력" 두 모드를
  // 그룹 단위로 선택한다.
  //  - 균등분배: 기존 방식(총액 1개 → 참가자 수로 나눔), 결제수단도 그룹 전체 1개.
  //  - 개별입력: 참가자를 체크하면 그 사람 전용 금액/결제수단 입력란이 나타난다 —
  //    각자 결제, 각자 금액이 다른 경우에 대응.
  // saved(선택, 새로고침 복원용): { site, mealType, mode, amount, paymentMethod, names:[],
  // participants:[{name,amount,paymentMethod}] }
  function addMealGroup(saved) {
    saved = saved || {};
    const group = document.createElement("div");
    group.className = "staff-lodging-group";
    group.innerHTML = `
      <div class="staff-lodging-group-head">
        <input type="text" class="l-site" placeholder="현장명" value="${(saved.site || "").replace(/"/g, "&quot;")}">
        <select class="staff-select l-mealtype" style="flex:1;">
          <option value="">식사구분(선택)</option>
          <option value="아침">아침</option>
          <option value="점심">점심</option>
          <option value="간식">간식</option>
          <option value="저녁">저녁</option>
          <option value="회식">회식</option>
        </select>
        <button type="button" class="staff-remove-btn l-remove">삭제</button>
      </div>
      <div class="staff-lodging-group-head">
        <select class="staff-select l-mode" style="flex:1;">
          <option value="custom">개별입력 (각자 결제, 금액이 다를 수 있음)</option>
          <option value="even">균등분배 (대표 1명이 결제, 인원수로 나눔)</option>
        </select>
      </div>
      <div class="l-even-fields">
        <div class="staff-lodging-group-head">
          <input type="number" class="l-amount" placeholder="실제 결제금액(원)" min="0" step="1000" value="${saved.amount || ""}">
          <select class="staff-select l-payment" style="flex:1;">
            <option value="">결제수단(선택)</option>
            <option value="회사카드">회사카드</option>
            <option value="개인카드">개인카드</option>
          </select>
        </div>
        <div class="staff-lodging-names">${lodgingNameCheckboxes()}</div>
        <p class="staff-lodging-per-person"></p>
      </div>
      <div class="l-custom-fields hidden">
        <div class="staff-meal-custom-rows"></div>
      </div>
      <div class="staff-lodging-photo">
        <label class="staff-lodging-photo-label">영수증 사진 (선택, 새로고침 시 다시 첨부해주세요)</label>
        <input type="file" class="l-photo" accept="image/*" capture="environment">
      </div>
    `;
    if (saved.mealType) group.querySelector(".l-mealtype").value = saved.mealType;
    if (saved.mode) group.querySelector(".l-mode").value = saved.mode;
    if (saved.paymentMethod) group.querySelector(".l-payment").value = saved.paymentMethod;
    (saved.names || []).forEach((n) => {
      const cb = group.querySelector(`.l-name[value="${n}"]`);
      if (cb) cb.checked = true;
    });

    const modeSel = group.querySelector(".l-mode");
    const evenFieldsEl = group.querySelector(".l-even-fields");
    const customFieldsEl = group.querySelector(".l-custom-fields");
    const customRowsEl = group.querySelector(".staff-meal-custom-rows");
    const amountInput = group.querySelector(".l-amount");
    const perPersonEl = group.querySelector(".staff-lodging-per-person");
    const nameCheckboxes = Array.from(group.querySelectorAll(".l-name"));

    function updatePerPerson() {
      const checkedCount = nameCheckboxes.filter((cb) => cb.checked).length;
      const amount = Number(amountInput.value) || 0;
      if (checkedCount > 0 && amount > 0) {
        const perPerson = Math.round(amount / checkedCount);
        perPersonEl.textContent = `→ ${checkedCount}명 기준 1인당 실사용 ${perPerson.toLocaleString()}원`;
      } else {
        perPersonEl.textContent = "";
      }
    }

    // 개별입력 모드: 참가자를 체크박스로 고르면 그 사람 전용 금액/결제수단 입력행이
    // 나타난다. 이름은 균등분배와 같은 STAFF_KNOWN_NAMES 체크박스 목록을 재사용한다.
    function renderCustomRows() {
      const savedParticipants = {};
      (saved.participants || []).forEach((p) => { savedParticipants[p.name] = p; });

      customRowsEl.innerHTML = STAFF_KNOWN_NAMES.map((n) => `
        <div class="staff-meal-custom-row">
          <label><input type="checkbox" class="mc-check" value="${n}"> ${n}</label>
          <input type="number" class="mc-amount" placeholder="금액(원)" min="0" step="500" disabled>
          <select class="staff-select mc-payment" disabled>
            <option value="">결제수단</option>
            <option value="회사카드">회사카드</option>
            <option value="개인카드">개인카드</option>
          </select>
        </div>
      `).join("");
      customRowsEl.querySelectorAll(".staff-meal-custom-row").forEach((row) => {
        const check = row.querySelector(".mc-check");
        const amt = row.querySelector(".mc-amount");
        const pay = row.querySelector(".mc-payment");
        const p = savedParticipants[check.value];
        if (p) {
          check.checked = true;
          amt.disabled = false;
          pay.disabled = false;
          if (p.amount) amt.value = p.amount;
          if (p.paymentMethod) pay.value = p.paymentMethod;
        }
        check.addEventListener("change", () => {
          amt.disabled = !check.checked;
          pay.disabled = !check.checked;
          if (!check.checked) { amt.value = ""; pay.value = ""; }
          saveDraft();
        });
        amt.addEventListener("input", saveDraft);
        pay.addEventListener("change", saveDraft);
      });
    }
    renderCustomRows();

    function applyModeUI() {
      const isCustom = modeSel.value === "custom";
      evenFieldsEl.classList.toggle("hidden", isCustom);
      customFieldsEl.classList.toggle("hidden", !isCustom);
    }
    modeSel.addEventListener("change", applyModeUI);
    applyModeUI();

    amountInput.addEventListener("input", updatePerPerson);
    nameCheckboxes.forEach((cb) => cb.addEventListener("change", updatePerPerson));
    group.querySelector(".l-remove").addEventListener("click", () => {
      group.remove();
      saveDraft();
    });
    group.addEventListener("input", saveDraft);
    group.addEventListener("change", saveDraft);
    updatePerPerson();

    mealEl.appendChild(group);
  }

  // 차량이동로그(I-014 2026-08-06 신규): 오늘 사용한 차량이 현장 간 어떻게 이동했는지
  // 기록한다. 지원금 계산과 무관한 순수 기록용이라 숙박/식사그룹처럼 인원수 분배 계산은
  // 필요 없다 — 차량번호/출발지/도착지/시각/운전자만 받는다.
  function addVehicleLogGroup(saved) {
    saved = saved || {};
    const group = document.createElement("div");
    group.className = "staff-lodging-group";
    group.innerHTML = `
      <div class="staff-lodging-group-head">
        <select class="staff-select v-vehicle">${vehicleOptionsHtml}</select>
        <select class="staff-select v-driver">${nameOptions(saved.driver || "")}</select>
        <button type="button" class="staff-remove-btn v-remove">삭제</button>
      </div>
      <div class="staff-lodging-group-head">
        <input type="text" class="v-from" placeholder="출발지(현장명)" value="${(saved.fromSite || "").replace(/"/g, "&quot;")}">
        <input type="text" class="v-to" placeholder="도착지(현장명)" value="${(saved.toSite || "").replace(/"/g, "&quot;")}">
      </div>
      <div class="staff-lodging-group-head">
        <span class="v-depart-picker"></span>
        <span>→</span>
        <span class="v-arrive-picker"></span>
      </div>
      <input type="text" class="l-roomtype v-memo" placeholder="비고 (선택)" value="${(saved.memo || "").replace(/"/g, "&quot;")}">
    `;
    group.querySelector(".v-depart-picker").outerHTML = optionalTimePickerHtml(
      "v-depart-h", "v-depart-m"
    );
    group.querySelector(".v-arrive-picker").outerHTML = optionalTimePickerHtml(
      "v-arrive-h", "v-arrive-m"
    );
    if (saved.vehicleNumber) group.querySelector(".v-vehicle").value = saved.vehicleNumber;
    if (saved.departTime) {
      const [h, m] = saved.departTime.split(":");
      group.querySelector(".v-depart-h").value = h || "";
      group.querySelector(".v-depart-m").value = m || "";
    }
    if (saved.arriveTime) {
      const [h, m] = saved.arriveTime.split(":");
      group.querySelector(".v-arrive-h").value = h || "";
      group.querySelector(".v-arrive-m").value = m || "";
    }

    group.querySelector(".v-remove").addEventListener("click", () => {
      group.remove();
      saveDraft();
    });
    group.addEventListener("input", saveDraft);
    group.addEventListener("change", saveDraft);
    vehicleLogEl.appendChild(group);
  }

  // I-015(2026-08-08): 날짜+현장명이 같은 날 이미 제출된 업무일지가 있으면 그 작업내용/
  // 근무인원을 미리 보여주고, "그대로 사용" 또는 "새로 작성" 중 선택하게 한다. 저장 시점에
  // 서버가 실제 병합을 처리하므로(findExistingWorklog_/mergeWorkContent_), 이 조회는 순수
  // 참고용 미리보기다 — 아무것도 선택하지 않고 그냥 제출해도 서버가 알아서 병합한다.
  const siteInput = document.getElementById("f-site");
  const contentInput = document.getElementById("f-content");
  const existingCardEl = document.getElementById("existing-worklog-card");
  let lastExistingContent = "";

  function renderExistingCard(found, workContent, workerNames) {
    if (!found) {
      existingCardEl.classList.add("hidden");
      lastExistingContent = "";
      return;
    }
    lastExistingContent = workContent || "";
    const namesText = (workerNames || []).length > 0 ? (workerNames || []).join(", ") : "(없음)";
    existingCardEl.innerHTML = `
      <p style="margin-bottom:0.4rem;">같은 날짜·현장에 이미 등록된 업무일지가 있습니다. 근무인원: ${namesText}</p>
      <p style="margin-bottom:0.5rem; white-space:pre-wrap; font-size:0.85rem; color:var(--kjenc-gray-600);">${lastExistingContent.replace(/</g, "&lt;")}</p>
      <div style="display:flex; gap:0.5rem;">
        <button type="button" id="existing-use-btn" class="staff-add-btn" style="flex:1;">기존 내용 그대로 사용</button>
        <button type="button" id="existing-new-btn" class="staff-add-btn" style="flex:1;">내가 새로 작성</button>
      </div>
    `;
    existingCardEl.classList.remove("staff-msg-error", "staff-msg-success");
    existingCardEl.classList.remove("hidden");
    document.getElementById("existing-use-btn").addEventListener("click", () => {
      contentInput.value = lastExistingContent;
    });
    document.getElementById("existing-new-btn").addEventListener("click", () => {
      contentInput.value = "";
      contentInput.focus();
    });
  }

  async function checkExistingWorklog() {
    const date = dateInput.value;
    const site = siteInput.value.trim();
    if (!date || !site) {
      renderExistingCard(false);
      return;
    }
    const result = await staffApiCall("getExistingWorklog", { date, site });
    if (result.ok && result.found) {
      renderExistingCard(true, result.workContent, result.workerNames);
    } else {
      renderExistingCard(false);
    }
  }

  siteInput.addEventListener("blur", checkExistingWorklog);
  dateInput.addEventListener("change", checkExistingWorklog);

  addBtn.addEventListener("click", () => { addWorkerRow(); saveDraft(); });
  addLodgingBtn.addEventListener("click", () => { addLodgingGroup(); saveDraft(); });
  addMealBtn.addEventListener("click", () => { addMealGroup(); saveDraft(); });
  addVehicleLogBtn.addEventListener("click", () => { addVehicleLogGroup(); saveDraft(); });

  // 기본 필드(날짜/현장명/구분/거래처/작업내용)도 변경 시 초안 저장.
  document.getElementById("f-site-type").addEventListener("change", saveDraft);
  document.getElementById("f-client").addEventListener("input", saveDraft);
  contentInput.addEventListener("input", saveDraft);
  siteInput.addEventListener("input", saveDraft);
  dateInput.addEventListener("input", saveDraft);

  // 새로고침 복원(사용자 요청, 2026-08-08): 저장된 초안이 있으면 폼을 그 값으로
  // 채운다. 동적 그룹(근무자/숙박/식사/차량이동)은 저장된 개수만큼 각 add*Group
  // 함수를 호출해 값과 함께 재생성한다 — 없으면 기존처럼 근무자 1행만 기본 추가.
  draftRestoring = true;
  const draft = loadDraft();
  if (draft) {
    if (draft.date) dateInput.value = draft.date;
    if (draft.site) siteInput.value = draft.site;
    if (draft.siteType) document.getElementById("f-site-type").value = draft.siteType;
    if (draft.client) document.getElementById("f-client").value = draft.client;
    if (draft.workContent) contentInput.value = draft.workContent;
    (draft.workers && draft.workers.length > 0 ? draft.workers : [null]).forEach((w) => addWorkerRow(w || undefined));
    (draft.lodgingGroups || []).forEach((g) => addLodgingGroup(g));
    (draft.mealGroups || []).forEach((g) => addMealGroup(g));
    (draft.vehicleLogs || []).forEach((v) => addVehicleLogGroup(v));
    msgEl.textContent = "이전에 작성 중이던 내용을 불러왔습니다. 사진 첨부는 다시 해주세요.";
    msgEl.classList.add("staff-msg-success");
    msgEl.classList.remove("hidden");
  } else {
    addWorkerRow();
  }
  draftRestoring = false;

  // 저장 전 보완 필요 항목을 모아서 한 번에 보여준다(사용자 요청, 2026-08-08) —
  // 이전에는 오류를 하나 발견하면 그 자리에서 바로 return해 한 번에 하나씩만
  // 알 수 있었는데, 여러 군데를 놓친 경우 저장을 여러 번 시도하며 매번 새 오류를
  // 만나는 번거로움이 있었다. showErrors()로 모은 뒤 한 번에 보여준다.
  function showErrors(errors) {
    msgEl.innerHTML = errors.length === 1
      ? errors[0]
      : "다음 항목을 확인해주세요:<br>" + errors.map((e) => "· " + e).join("<br>");
    msgEl.classList.add("staff-msg-error");
    msgEl.classList.remove("hidden");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msgEl.className = "staff-msg";
    msgEl.classList.add("hidden");

    const errors = [];

    if (!document.getElementById("f-site").value.trim()) {
      errors.push("현장명을 입력해주세요.");
    }
    if (!document.getElementById("f-content").value.trim()) {
      errors.push("금일 작업내용을 입력해주세요.");
    }

    const workerGroups = Array.from(rowsEl.querySelectorAll(".staff-worker-group"));
    const workers = workerGroups.map((group) => {
      return {
        workType: group.querySelector(".w-worktype").value,
        name: group.querySelector(".w-name").value,
        start: getTimeValue(group, ".w-start-h", ".w-start-m"),
        end: getTimeValue(group, ".w-end-h", ".w-end-m"),
        travel: group.querySelector(".w-travel").value,
        vehicleNumber: group.querySelector(".w-vehicle").value,
        status: group.querySelector(".w-status").value,
        extraTravel: group.querySelector(".w-extra-travel").value,
        // 이동시간(h, I-016 2026-08-06): 이동종료시각(폼 UI, 자동계산 보조용)은
        // 서버에 저장하지 않는다 — 근무기록 F열(이동종료시각)을 삭제했다. 이 값은
        // 여전히 폼에서 자동계산 편의를 위해 쓰이지만, 최종 저장되는 값은 사용자가
        // 확인/수정한 extraHours뿐이다(금액이 아니라 시간 그대로 저장, 월말 정산).
        extraHours: Number(group.querySelector(".w-extra-hours").value) || 0,
        // 초과근무시간(h, I-016 2026-08-06 신규): 근무자가 직접 입력한 실제 초과근무
        // 시간. 금액은 계산하지 않고 시간 그대로 저장(월말 개인 일당 기준 정산).
        overtimeHours: Number(group.querySelector(".w-overtime-hours").value) || 0,
      };
    });

    if (workers.length === 0) {
      errors.push("근무 인원을 1명 이상 추가해 주세요.");
    }

    // 근무자별 보완 필요 항목: 이름 미선택, 정규근무인데 근무시작=근무종료(0시간),
    // 같은 이름 중복 입력(서버도 막지만 저장 시도 전에 미리 알려주는 게 낫다).
    const seenWorkerNames = new Set();
    workers.forEach((w, i) => {
      const label = `근무 인원 ${i + 1}번째`;
      if (!w.name) {
        errors.push(`${label}의 이름을 선택해주세요.`);
        return;
      }
      if (seenWorkerNames.has(w.name)) {
        errors.push(`${w.name}님이 근무 인원에 중복 입력되었습니다.`);
      }
      seenWorkerNames.add(w.name);
      if (w.status !== "휴가" && w.start === w.end) {
        errors.push(`${w.name}님의 근무시작·근무종료 시각이 같습니다(근무시간 0시간). 확인해주세요.`);
      }
      if (w.travel === "회사차" && !w.vehicleNumber) {
        errors.push(`${w.name}님은 이동방법이 회사차인데 사용차량을 선택하지 않았습니다.`);
      }
    });

    if (!document.getElementById("f-client").value.trim()) {
      errors.push("거래처를 입력해주세요.");
    }

    if (errors.length > 0) {
      showErrors(errors);
      return;
    }

    const lodgingGroupsRaw = await Promise.all(
      Array.from(lodgingEl.querySelectorAll(".staff-lodging-group")).map(async (group) => {
        const fileInput = group.querySelector(".l-photo");
        let photoBase64 = null;
        let photoName = null;
        let photoMime = null;
        if (fileInput && fileInput.files && fileInput.files[0]) {
          const file = fileInput.files[0];
          photoBase64 = await staffFileToBase64(file);
          photoName = file.name;
          photoMime = file.type;
        }
        return {
          site: group.querySelector(".l-site").value,
          roomType: group.querySelector(".l-roomtype").value,
          amount: Number(group.querySelector(".l-amount").value) || 0,
          paymentMethod: group.querySelector(".l-payment").value,
          names: Array.from(group.querySelectorAll(".l-name"))
            .filter((cb) => cb.checked)
            .map((cb) => cb.value),
          photoBase64: photoBase64,
          photoName: photoName,
          photoMime: photoMime,
        };
      })
    );
    const lodgingGroups = lodgingGroupsRaw.filter((g) => g.names.length > 0 || g.amount > 0);

    for (const g of lodgingGroups) {
      if (g.names.length === 0) {
        msgEl.textContent = "숙박그룹에 결제금액을 입력했다면 참가자를 1명 이상 선택해주세요.";
        msgEl.classList.add("staff-msg-error");
        msgEl.classList.remove("hidden");
        return;
      }
      if (g.amount <= 0) {
        msgEl.textContent = "숙박그룹에 참가자를 선택했다면 실제 결제금액을 입력해주세요.";
        msgEl.classList.add("staff-msg-error");
        msgEl.classList.remove("hidden");
        return;
      }
      if (!g.paymentMethod) {
        msgEl.textContent = "숙박그룹의 결제수단(회사카드/개인카드)을 선택해주세요.";
        msgEl.classList.add("staff-msg-error");
        msgEl.classList.remove("hidden");
        return;
      }
    }

    const seenNames = new Set();
    for (const g of lodgingGroups) {
      for (const n of g.names) {
        if (seenNames.has(n)) {
          msgEl.textContent = `${n}님이 여러 숙박그룹에 중복 선택되었습니다. 확인해주세요.`;
          msgEl.classList.add("staff-msg-error");
          msgEl.classList.remove("hidden");
          return;
        }
        seenNames.add(n);
      }
    }

    // 식사그룹(I-016 2026-08-06): 그룹마다 mode("even"=균등분배/"custom"=개별입력)에
    // 따라 다른 payload 구조를 만든다.
    const mealGroupsRaw = await Promise.all(
      Array.from(mealEl.querySelectorAll(".staff-lodging-group")).map(async (group) => {
        const fileInput = group.querySelector(".l-photo");
        let photoBase64 = null;
        let photoName = null;
        let photoMime = null;
        if (fileInput && fileInput.files && fileInput.files[0]) {
          const file = fileInput.files[0];
          photoBase64 = await staffFileToBase64(file);
          photoName = file.name;
          photoMime = file.type;
        }
        const mode = group.querySelector(".l-mode").value === "custom" ? "custom" : "even";
        const base = {
          site: group.querySelector(".l-site").value,
          mealType: group.querySelector(".l-mealtype").value,
          mode: mode,
          photoBase64: photoBase64,
          photoName: photoName,
          photoMime: photoMime,
        };
        if (mode === "custom") {
          const participants = Array.from(group.querySelectorAll(".staff-meal-custom-row"))
            .filter((row) => row.querySelector(".mc-check").checked)
            .map((row) => ({
              name: row.querySelector(".mc-check").value,
              amount: Number(row.querySelector(".mc-amount").value) || 0,
              paymentMethod: row.querySelector(".mc-payment").value,
            }));
          return Object.assign(base, { participants: participants });
        }
        return Object.assign(base, {
          amount: Number(group.querySelector(".l-amount").value) || 0,
          paymentMethod: group.querySelector(".l-payment").value,
          names: Array.from(group.querySelectorAll(".l-name"))
            .filter((cb) => cb.checked)
            .map((cb) => cb.value),
        });
      })
    );
    const mealGroups = mealGroupsRaw.filter((g) => {
      if (g.mode === "custom") return (g.participants || []).length > 0;
      return (g.names || []).length > 0 || g.amount > 0;
    });

    for (const g of mealGroups) {
      if (g.mode === "custom") {
        for (const p of g.participants) {
          if (!p.amount || p.amount <= 0) {
            msgEl.textContent = `${p.name}님의 식사 금액을 입력해주세요.`;
            msgEl.classList.add("staff-msg-error");
            msgEl.classList.remove("hidden");
            return;
          }
          if (!p.paymentMethod) {
            msgEl.textContent = `${p.name}님의 결제수단을 선택해주세요.`;
            msgEl.classList.add("staff-msg-error");
            msgEl.classList.remove("hidden");
            return;
          }
        }
        continue;
      }
      if (g.names.length === 0) {
        msgEl.textContent = "식사그룹에 결제금액을 입력했다면 참가자를 1명 이상 선택해주세요.";
        msgEl.classList.add("staff-msg-error");
        msgEl.classList.remove("hidden");
        return;
      }
      if (g.amount <= 0) {
        msgEl.textContent = "식사그룹에 참가자를 선택했다면 실제 결제금액을 입력해주세요.";
        msgEl.classList.add("staff-msg-error");
        msgEl.classList.remove("hidden");
        return;
      }
      if (!g.paymentMethod) {
        msgEl.textContent = "식사그룹의 결제수단(회사카드/개인카드)을 선택해주세요.";
        msgEl.classList.add("staff-msg-error");
        msgEl.classList.remove("hidden");
        return;
      }
    }

    // 차량이동로그(I-014 2026-08-06): 차량번호가 선택된 행만 저장 대상으로 삼는다.
    const vehicleLogs = Array.from(vehicleLogEl.querySelectorAll(".staff-lodging-group"))
      .map((group) => {
        const departH = group.querySelector(".v-depart-h").value;
        const departM = group.querySelector(".v-depart-m").value;
        const arriveH = group.querySelector(".v-arrive-h").value;
        const arriveM = group.querySelector(".v-arrive-m").value;
        return {
          vehicleNumber: group.querySelector(".v-vehicle").value,
          driver: group.querySelector(".v-driver").value,
          fromSite: group.querySelector(".v-from").value,
          toSite: group.querySelector(".v-to").value,
          departTime: (departH && departM) ? `${departH}:${departM}` : "",
          arriveTime: (arriveH && arriveM) ? `${arriveH}:${arriveM}` : "",
          memo: group.querySelector(".v-memo").value,
        };
      })
      .filter((l) => l.vehicleNumber);

    const payload = {
      reporter: session.name,
      pin: session.pin,
      date: document.getElementById("f-date").value,
      site: document.getElementById("f-site").value,
      siteType: document.getElementById("f-site-type").value,
      client: document.getElementById("f-client").value,
      workContent: document.getElementById("f-content").value,
      workers: workers,
      lodgingGroups: lodgingGroups,
      mealGroups: mealGroups,
      vehicleLogs: vehicleLogs,
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = "저장 중...";

    const result = await staffApiCall("saveWorklog", payload);

    submitBtn.disabled = false;
    submitBtn.textContent = "업무일지 저장";

    if (result.ok) {
      msgEl.textContent = result.warning
        ? "업무일지가 저장되었습니다. (참고: " + result.warning + ")"
        : "업무일지가 저장되었습니다.";
      msgEl.classList.add("staff-msg-success");
      msgEl.classList.remove("hidden");
      clearDraft();
      form.reset();
      dateInput.value = new Date().toISOString().slice(0, 10);
      rowsEl.innerHTML = "";
      addWorkerRow();
      lodgingEl.innerHTML = "";
      mealEl.innerHTML = "";
      vehicleLogEl.innerHTML = "";
      renderExistingCard(false);
    } else {
      msgEl.textContent = result.message || "저장에 실패했습니다. 잠시 후 다시 시도해주세요.";
      msgEl.classList.add("staff-msg-error");
      msgEl.classList.remove("hidden");
    }
  });
});
