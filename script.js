/**
 * 개인정보 이메일 시스템 - 메인 스크립트
 * 파일 업로드 → 개인정보 검사 → 선택적 정보 첨부 → 메일 전송
 */

// ========================================
// 설정 및 전역 변수
// ========================================

/**
 * 웹훅 URL 설정
 * - analyzeWebhookUrl: 개인정보 분석 요청용
 * - sendWebhookUrl: 메일 전송 요청용
 * - sendSelectedInfo: 선택된 정보 전송용
 */
const analyzeWebhookUrl = "http://localhost:5678/webhook-test/analyze";
const sendWebhookUrl = "http://localhost:5678/webhook/send";
const sendSelectedInfo = "http://localhost:5678/webhook-test/choice";

/**
 * 분석 결과 저장용 배열
 * 개인정보 검사 후 감지된 항목들이 저장됨
 */
let requiredFieldsData = [];

// ========================================
// DOM 요소 캐싱 (성능 최적화)
// ========================================

/**
 * 자주 사용하는 DOM 요소를 미리 캐싱하여 성능 향상
 * DOMContentLoaded 이벤트 후 초기화
 */
const DOM = {
  uploadForm: null,
  fileInput: null,
  actionInput: null,
  checkBtn: null,
  sendBtn: null,
  selectAllBtn: null,
  clearAllBtn: null,
  fieldsList: null,
  selectedInfoBtn: null,
};

/**
 * DOM 요소 초기화 함수
 * 페이지 로드 완료 후 실행
 */
function initializeDOM() {
  DOM.uploadForm = document.getElementById("uploadForm");
  DOM.fileInput = document.getElementById("fileInput");
  DOM.actionInput = document.getElementById("actionInput");
  DOM.checkBtn = document.getElementById("checkBtn");
  DOM.sendBtn = document.getElementById("sendBtn");
  DOM.selectAllBtn = document.getElementById("selectAllBtn");
  DOM.clearAllBtn = document.getElementById("clearAllBtn");
  DOM.fieldsList = document.getElementById("fieldsList");
  DOM.selectedInfoBtn = document.getElementById("selectedInfo");
}

// ========================================
// 유틸리티 함수
// ========================================

/**
 * 서버로 FormData 전송 (공통 함수)
 * @param {string} url - 요청 URL
 * @param {FormData} formData - 전송할 폼 데이터
 * @param {string} tag - 로그 식별용 태그
 * @returns {Promise<{ok: boolean, status: number, text: string}>}
 */
async function postFormData(url, formData, tag) {
  try {
    console.log(formData);
    const res = await fetch(url, {
      method: "POST",
      body: formData,
    });
    const text = await res.text();

    // 응답 로깅 (디버깅용)
    console.log(`[${tag}] HTTP ${res.status}`, text);

    return {
      ok: res.ok,
      status: res.status,
      text,
    };
  } catch (err) {
    // 네트워크 오류 등 처리
    console.error(`[${tag}] 요청 실패:`, err);
    return {
      ok: false,
      status: 0,
      text: String(err),
    };
  }
}

/**
 * 텍스트에서 JSON 배열 파싱
 * 서버 응답에서 JSON 배열 부분만 추출하여 파싱
 * @param {string} text - 파싱할 텍스트
 * @returns {Array} 파싱된 배열 또는 빈 배열
 */
function parseArrayFromText(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");

  // 유효한 배열 형식이 아니면 빈 배열 반환
  if (start === -1 || end === -1 || end <= start) {
    return [];
  }

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    console.error("JSON 파싱 실패:", err);
    return [];
  }
}

/**
 * XSS 공격 방지를 위한 HTML 이스케이프
 * @param {string} s - 이스케이프할 문자열
 * @returns {string} 이스케이프된 문자열
 */
function escapeHTML(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ========================================
// UI 렌더링 함수
// ========================================

function renderRequiredFields(items) {
  // 감지된 항목이 없는 경우
  if (!items || !items.length) {
    DOM.fieldsList.innerHTML =
      '<div class="muted">감지된 항목이 없습니다.</div>';
    return;
  }

  // 기존 내용 초기화
  DOM.fieldsList.innerHTML = "";

  // 각 항목을 체크박스로 생성
  items.forEach((item, idx) => {
    // item: ["이름","홍길동",225,266]
    const [type, value, x, y] = item;

    const id = `req-${idx}`;
    const div = document.createElement("div");
    div.className = "field-item";

    // 서버로 넘길 payload (x, y도 함께 포함)
    const payload = {
      type,
      value,
      x,
      y,
    };

    // 체크박스와 라벨 생성 (기본값: 체크됨)
    div.innerHTML = `
      <input type="checkbox" id="${id}" value='${JSON.stringify(
      payload
    )}' checked />
      <label class="field-text" for="${id}">
        <div class="field-type">${escapeHTML(type || "유형")}</div>
        <div class="field-value">${escapeHTML(value || "")}</div>
        <!-- 좌표를 표시하고 싶으면 아래 주석 해제 -->
        <!-- <div class="field-coord">(${x}, ${y})</div> -->
      </label>
    `;

    DOM.fieldsList.appendChild(div);
  });
}

/**
 * UI 상태 초기화 (파일 변경 시)
 * 새 파일 선택 시 모든 버튼과 상태를 초기화
 */
function resetUIState() {
  // 검사 버튼 활성화 및 텍스트 초기화
  DOM.checkBtn.disabled = false;
  DOM.checkBtn.textContent = "개인정보검사";

  // 메일 전송 버튼 비활성화 (검사 완료 후 활성화됨)
  DOM.sendBtn.disabled = true;

  // action 값 초기화 (분석 모드)
  DOM.actionInput.value = "analyze";

  // 체크박스 리스트 초기화
  DOM.fieldsList.innerHTML =
    '<div class="muted">파일을 선택하면 감지된 항목이 표시됩니다.</div>';

  // 저장된 데이터 초기화
  requiredFieldsData = [];
}

/**
 * 체크박스 전체 선택/해제 토글
 * @param {boolean} checked - true: 전체 선택, false: 전체 해제
 */
function toggleAllCheckboxes(checked) {
  const checkboxes = DOM.fieldsList.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach((cb) => (cb.checked = checked));
}

// ========================================
// 이벤트 핸들러
// ========================================

/**
 * 1단계: 개인정보 검사 처리
 * 파일을 서버로 전송하고 개인정보 분석 결과를 받아옴
 * @param {Event} e - submit 이벤트
 */
async function handleAnalyze(e) {
  e.preventDefault();

  // action 값 설정 (분석 모드)
  DOM.actionInput.value = "analyze";

  // UI 상태 업데이트 (로딩 중)
  DOM.checkBtn.textContent = "검사중..";
  DOM.checkBtn.disabled = true;
  DOM.sendBtn.disabled = true;

  // FormData 생성
  const formData = new FormData(DOM.uploadForm);

  // ✅ 업로드한 파일 이름을 body에 같이 넣기
  const file = DOM.fileInput.files[0];
  if (file) {
    // 원본 파일명 (tests.pdf 같은 것)
    formData.append("uploadedFilename", file.name);

    // 필요하면 확장자 제거한 이름도 같이 보낼 수 있음 (선택)
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    formData.append("uploadedBaseName", baseName);
  }

  // 서버로 전송
  const { ok, text } = await postFormData(
    analyzeWebhookUrl,
    formData,
    "ANALYZE"
  );

  // 버튼 텍스트 복원
  DOM.checkBtn.textContent = "개인정보검사";

  // 성공 시 결과 처리
  if (ok) {
    requiredFieldsData = parseArrayFromText(text);

    if (requiredFieldsData.length) {
      renderRequiredFields(requiredFieldsData);
    }

    DOM.sendBtn.disabled = false;
  } else {
    alert("개인정보 검사 실패. 콘솔 로그를 확인하세요.");
    DOM.checkBtn.disabled = false;
  }
}
/**
 * 2단계: 메일 전송 처리
 * 선택된 개인정보 항목과 함께 메일 전송 요청
 */
async function handleSendMail() {
  // action 값 설정 (전송 모드)
  DOM.actionInput.value = "submit";

  // UI 상태 업데이트 (전송 중)
  DOM.sendBtn.disabled = true;
  DOM.sendBtn.textContent = "전송 중..";

  // 체크된 항목만 수집
  const selected = [];
  const checkedBoxes = DOM.fieldsList.querySelectorAll(
    'input[type="checkbox"]:checked'
  );

  checkedBoxes.forEach((cb) => {
    try {
      // value 속성에 저장된 JSON 파싱
      selected.push(JSON.parse(cb.value));
    } catch (err) {
      console.error("체크박스 값 파싱 실패:", err);
    }
  });

  // FormData 생성 (파일 포함)
  const formData = new FormData(DOM.uploadForm);

  // 선택된 항목 추가
  formData.append("requiredFields", JSON.stringify(selected));

  // 메일 전송 요청
  const { ok } = await postFormData(sendWebhookUrl, formData, "SEND_MAIL");

  // 결과에 따라 UI 업데이트
  if (ok) {
    DOM.sendBtn.textContent = "전송 완료";
    DOM.sendBtn.disabled = true;
  } else {
    DOM.sendBtn.textContent = "메일 전송";
    DOM.sendBtn.disabled = false;
    alert("메일 전송 실패. 콘솔 로그를 확인하세요.");
  }
}

/**
 * 3단계: 선택된 정보만 전송
 * 체크박스에서 선택된 항목만 sendSelectedInfo URL로 전송
 */
async function handleSendSelectedInfo() {
  // UI 상태 업데이트 (전송 중)
  DOM.selectedInfoBtn.disabled = true;
  DOM.selectedInfoBtn.textContent = "전송 중..";
  const file = DOM.fileInput.files[0];
  // 체크된 항목만 수집
  const selected = [];
  const checkedBoxes = DOM.fieldsList.querySelectorAll(
    'input[type="checkbox"]:checked'
  );

  checkedBoxes.forEach((cb) => {
    try {
      // value 속성에 저장된 JSON 파싱
      selected.push(JSON.parse(cb.value));
    } catch (err) {
      console.error("체크박스 값 파싱 실패:", err);
    }
  });

  // 선택된 항목이 없는 경우
  if (selected.length === 0) {
    alert("선택된 항목이 없습니다.");
    DOM.selectedInfoBtn.textContent = "전송";
    DOM.selectedInfoBtn.disabled = false;
    return;
  }

  // FormData 생성 (선택된 항목만 전송)
  const formData = new FormData();
  formData.append("selectedFields", JSON.stringify(selected));
  formData.append("fileName", file.name);

  console.log(formData);
  // 선택된 정보 전송 요청
  const { ok } = await postFormData(
    sendSelectedInfo,
    formData,
    "SELECTED_INFO"
  );

  // 결과에 따라 UI 업데이트
  if (ok) {
    DOM.selectedInfoBtn.textContent = "전송 완료";
    alert("선택된 정보가 전송되었습니다.");
  } else {
    DOM.selectedInfoBtn.textContent = "전송";
    alert("전송 실패. 콘솔 로그를 확인하세요.");
  }

  DOM.selectedInfoBtn.disabled = false;
}

// ========================================
// 초기화 및 이벤트 리스너 등록
// ========================================

/**
 * 페이지 로드 완료 시 초기화
 */
document.addEventListener("DOMContentLoaded", () => {
  // DOM 요소 캐싱
  initializeDOM();

  // 폼 제출 이벤트 (개인정보 검사)
  DOM.uploadForm.addEventListener("submit", handleAnalyze);

  // 메일 전송 버튼 클릭 이벤트
  DOM.sendBtn.addEventListener("click", handleSendMail);

  // 선택된 정보 전송 버튼 클릭 이벤트
  DOM.selectedInfoBtn.addEventListener("click", handleSendSelectedInfo);

  // 파일 변경 시 UI 초기화
  DOM.fileInput.addEventListener("change", resetUIState);

  // 전체 선택 버튼
  DOM.selectAllBtn.addEventListener("click", () => toggleAllCheckboxes(true));

  // 전체 해제 버튼
  DOM.clearAllBtn.addEventListener("click", () => toggleAllCheckboxes(false));
});
