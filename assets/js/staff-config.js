// KJENC 직원 시스템 공통 설정 및 헬퍼
//
// 아래 STAFF_API_URL에 Google Apps Script 배포 후 나오는 웹앱 URL을 붙여넣으세요.
// 설정 방법: apps-script/README-setup.md 참고
const STAFF_API_URL = "https://script.google.com/macros/s/AKfycbwonU2ihAEhcmxv0ATamMdjhJfW_xZbPij1sGJBRZ5Dl_MaE5lkJxMFV-9b91BxkKxh/exec";

// Apps Script Web App은 CORS 프리플라이트(OPTIONS)를 제대로 처리하지 못하므로,
// fetch 호출 시 Content-Type 헤더를 지정하지 않아 브라우저가 자동으로
// text/plain으로 보내게 합니다. (Apps Script doPost에서는 JSON.parse로 그대로 읽음)
function staffApiCall(action, payload) {
  if (STAFF_API_URL.indexOf("PASTE_") === 0) {
    return Promise.resolve({
      ok: false,
      message: "아직 서버 주소(STAFF_API_URL)가 설정되지 않았습니다. apps-script/README-setup.md를 참고해 설정해주세요.",
    });
  }
  return fetch(STAFF_API_URL, {
    method: "POST",
    body: JSON.stringify({ action: action, payload: payload }),
  })
    .then((res) => res.json())
    .catch(() => ({ ok: false, message: "서버에 연결할 수 없습니다. 인터넷 연결 또는 API 주소를 확인해주세요." }));
}

function staffGetSession() {
  const raw = localStorage.getItem("kjenc_staff_session");
  return raw ? JSON.parse(raw) : null;
}

// I-011(2026-07-23): PIN과 관리자 여부도 세션에 함께 저장한다. 저장류 API 호출마다 서버가
// name+pin을 다시 검증(verifyStaff_)하도록 하기 위함 — 예전에는 이름만 보내면 그대로
// 믿는 구조라 API 주소만 알면 다른 사람 이름으로 위조 저장이 가능했다.
function staffSetSession(name, pin, isAdmin) {
  localStorage.setItem(
    "kjenc_staff_session",
    JSON.stringify({ name: name, pin: pin, isAdmin: !!isAdmin, loginAt: Date.now() })
  );
}

function staffRequireLogin() {
  const session = staffGetSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}

function staffLogout() {
  localStorage.removeItem("kjenc_staff_session");
  window.location.href = "login.html";
}

function staffFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 직원명단 (1단계: 화면에 바로 보여주기 위한 로컬 목록. 실제 검증은 서버에서 시트 기준으로 함)
// 2026-08-26(사용자 요청): 입사순으로 재정렬(직원명단 시트 행 순서와 동일하게
// 유지 — worklog.html/receipts.html은 이 배열을 API 호출 없이 직접 쓰므로,
// 시트 순서가 바뀌면 이 배열도 함께 수정해야 한다).
const STAFF_KNOWN_NAMES = [
  "전경진", "윤영일", "임성국", "권기원", "강인원", "하정호",
  "노치열", "이동훈", "한상욱", "김영국", "은현우", "김용호",
];
