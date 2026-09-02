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

// I-071(2026-09-02): 영수증 업로드 전 이미지를 리사이즈+재압축해 Drive
// 업로드 용량을 줄인다(구글 계정 스토리지 사용량 대응). 압축은 항상
// 최선 노력(best-effort)이다 — 이미지가 아니거나(PDF 등), 브라우저가
// 디코딩하지 못하는 포맷(구형 iOS의 일부 HEIC 등)이거나, 원본이 이미
// 작으면 압축을 건너뛰고 원본 base64를 그대로 반환한다. 세무 제출용
// 문서라 압축 실패로 제출 자체가 막히면 안 되므로, 어떤 예외가 나도
// 항상 무언가는 반환한다.
const STAFF_IMAGE_COMPRESS_MAX_DIMENSION = 1600; // 긴 변 기준 최대 px
const STAFF_IMAGE_COMPRESS_QUALITY = 0.75; // JPEG 품질(0.7~0.8 권장 범위 중간값)
const STAFF_IMAGE_COMPRESS_SKIP_BELOW_BYTES = 500 * 1024; // 500KB 미만은 압축 생략

/**
 * JPEG의 EXIF Orientation 태그(1~8)를 읽는다. 모바일 카메라 사진은 실제
 * 픽셀은 항상 가로로 찍혀 있고 EXIF에 "몇 도 돌려서/뒤집어서 보여줘야
 * 하는지"만 기록해두는 경우가 흔하다 — 이 값을 무시하고 캔버스에 그대로
 * drawImage하면 세로로 찍은 사진이 옆으로 눕거나 뒤집힌 채로 저장되는
 * 잘 알려진 버그가 생긴다. JPEG가 아니거나 EXIF/Orientation 태그가
 * 없으면 기본값 1(회전 없음)을 반환한다.
 */
function staffReadExifOrientation_(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return 1; // JPEG SOI 마커 아님
  let offset = 2;
  while (offset < view.byteLength - 1) {
    const marker = view.getUint16(offset, false);
    offset += 2;
    if (marker === 0xffe1) { // APP1 (EXIF)
      const exifLength = view.getUint16(offset, false);
      const exifStart = offset + 2;
      if (view.getUint32(exifStart, false) !== 0x45786966) return 1; // "Exif" 시그니처 아님
      const tiffOffset = exifStart + 6;
      const little = view.getUint16(tiffOffset, false) === 0x4949;
      const firstIfdOffset = view.getUint32(tiffOffset + 4, little);
      const dirStart = tiffOffset + firstIfdOffset;
      const numEntries = view.getUint16(dirStart, little);
      for (let i = 0; i < numEntries; i++) {
        const entryOffset = dirStart + 2 + i * 12;
        if (entryOffset + 12 > exifStart + exifLength) break;
        const tag = view.getUint16(entryOffset, little);
        if (tag === 0x0112) { // Orientation 태그
          return view.getUint16(entryOffset + 8, little);
        }
      }
      return 1;
    } else if ((marker & 0xff00) !== 0xff00) {
      break; // 마커가 아닌 데이터에 도달 — EXIF 없음
    } else {
      offset += view.getUint16(offset, false);
    }
  }
  return 1;
}

/**
 * EXIF orientation(1~8)에 맞춰 캔버스 크기와 변환 행렬을 설정한다.
 * drawImage를 호출하기 전에 이 함수로 캔버스를 준비해두면, 원본 픽셀을
 * 그대로 그려도 화면에 보이는 방향이 항상 올바르게 나온다.
 */
function staffApplyExifOrientation_(ctx, orientation, width, height) {
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, width, 0); break; // 좌우 반전
    case 3: ctx.transform(-1, 0, 0, -1, width, height); break; // 180도
    case 4: ctx.transform(1, 0, 0, -1, 0, height); break; // 상하 반전
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break; // 반전+90도
    case 6: ctx.transform(0, 1, -1, 0, height, 0); break; // 시계방향 90도
    case 7: ctx.transform(0, -1, -1, 0, height, width); break; // 반전+270도
    case 8: ctx.transform(0, -1, 1, 0, 0, width); break; // 반시계방향 90도
    default: break; // 1(정상) 또는 알 수 없는 값 — 변환 없음
  }
}

/**
 * 영수증 사진 파일을 압축된 JPEG base64로 변환한다(실패 시 원본
 * staffFileToBase64 결과로 자동 폴백). 반환값은 항상 staffFileToBase64와
 * 같은 형태(순수 base64 문자열, data: 접두사 없음)라 호출부는 압축
 * 성공/실패 여부와 무관하게 동일하게 다루면 된다.
 *
 * @returns {Promise<{base64: string, mime: string, compressed: boolean}>}
 */
async function staffCompressImageToBase64(file) {
  const fallback = async () => ({
    base64: await staffFileToBase64(file), mime: file.type, compressed: false,
  });

  // 이미지가 아니면(PDF 등) 애초에 Canvas로 디코딩할 수 없으니 압축 대상이
  // 아니다 — 원본 그대로.
  if (!file.type || file.type.indexOf("image/") !== 0) return fallback();
  // 이미 충분히 작으면 재처리할 이유가 없다.
  if (file.size < STAFF_IMAGE_COMPRESS_SKIP_BELOW_BYTES) return fallback();

  try {
    const arrayBuffer = await file.arrayBuffer();
    const orientation = staffReadExifOrientation_(arrayBuffer);

    const blobUrl = URL.createObjectURL(new Blob([arrayBuffer], { type: file.type }));
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject; // HEIC 등 브라우저가 디코딩 못하는 포맷이면 여기서 실패
      el.src = blobUrl;
    });
    URL.revokeObjectURL(blobUrl);

    const srcW = img.naturalWidth;
    const srcH = img.naturalHeight;
    if (!srcW || !srcH) throw new Error("이미지 크기를 읽을 수 없습니다.");

    const scale = Math.min(1, STAFF_IMAGE_COMPRESS_MAX_DIMENSION / Math.max(srcW, srcH));
    const destW = Math.round(srcW * scale);
    const destH = Math.round(srcH * scale);

    // EXIF 5~8은 가로/세로가 서로 바뀌므로 캔버스 자체의 폭/높이도 맞춰준다.
    const swapped = orientation >= 5 && orientation <= 8;
    const canvas = document.createElement("canvas");
    canvas.width = swapped ? destH : destW;
    canvas.height = swapped ? destW : destH;
    const ctx = canvas.getContext("2d");
    staffApplyExifOrientation_(ctx, orientation, destW, destH);
    ctx.drawImage(img, 0, 0, destW, destH);

    const dataUrl = canvas.toDataURL("image/jpeg", STAFF_IMAGE_COMPRESS_QUALITY);
    if (!dataUrl || dataUrl.indexOf("data:image/jpeg;base64,") !== 0) throw new Error("캔버스 인코딩 실패");

    return { base64: dataUrl.split(",")[1], mime: "image/jpeg", compressed: true };
  } catch (e) {
    // 압축 경로의 어떤 단계든 실패하면(디코딩 불가, 캔버스 미지원 등)
    // 세무 제출이 막히지 않도록 반드시 원본으로 폴백한다.
    return fallback();
  }
}

// 직원명단 (1단계: 화면에 바로 보여주기 위한 로컬 목록. 실제 검증은 서버에서 시트 기준으로 함)
// 2026-08-26(사용자 요청): 입사순으로 재정렬(직원명단 시트 행 순서와 동일하게
// 유지 — worklog.html/receipts.html은 이 배열을 API 호출 없이 직접 쓰므로,
// 시트 순서가 바뀌면 이 배열도 함께 수정해야 한다).
// 2026-09-02(사용자 요청): 김용호는 관리자 역할만 하고 실제 근무는 하지
// 않으므로 업무일지/영수증의 "근무 인원 선택" 목록에서 제외한다(직원명단
// 상태="재직"/권한="관리자"는 그대로 유지 — 로그인/관리자 승인 기능에는
// 영향 없음, 이름 미포함이어도 로그인 화면은 자유 텍스트 입력이라 직접
// 타이핑하면 문제 없이 로그인 가능).
const STAFF_KNOWN_NAMES = [
  "전경진", "윤영일", "임성국", "권기원", "강인원", "하정호",
  "노치열", "이동훈", "한상욱", "김영국", "은현우",
];
