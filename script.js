const analyzeWebhookUrl = "http://localhost:5678/webhook-test/2cc8aaca-f139-4291-8186-f998119ffc84";
const sendWebhookUrl = "http://localhost:5678/webhook-test/863b40f6-ff3d-401c-9a50-b0015017dd4e";
const sendSelectedInfoUrl = "http://localhost:5678/webhook-test/choice";

let requiredFieldsData = [];
const fileInput = document.getElementById("fileInput");

fileInput.addEventListener("change", () => {
  resetButtonsForNewFile();
});

const textarea = document.getElementById("messageBox");
textarea.addEventListener("input", (e) => {
  e.target.style.height = "auto";
  e.target.style.height = e.target.scrollHeight + "px";
});

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showEmailError(inputId, errorId) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  if (!validateEmail(input.value)) {
    input.classList.add("invalid");
    error.textContent = "이메일 형식이 올바르지 않습니다.";
    return false;
  } else {
    input.classList.remove("invalid");
    error.textContent = "";
    return true;
  }
}

document.getElementById("toEmail").addEventListener("input", () => {
  showEmailError("toEmail", "toError");
});

async function postFormData(url, formData, tag) {
  try {
    const res = await fetch(url, { method: "POST", body: formData });
    const text = await res.text();
    console.log(`[${tag}] status=${res.status}`, text);
    return { ok: res.ok, status: res.status, text };
  } catch (err) {
    console.error(`[${tag}] 요청 실패:`, err);
    return { ok: false, status: 0, text: String(err) };
  }
}

function parseArrayFromText(text) {
  try {
    const matches = text.match(/\[[\s\S]*?\]/g);
    if (!matches) return [];
    const all = [];
    for (const m of matches) {
      try {
        const parsed = JSON.parse(m);
        if (Array.isArray(parsed) && parsed.length > 0) all.push(...parsed);
      } catch {}
    }
    return all;
  } catch {
    return [];
  }
}

function escapeHTML(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderRequiredFields(items) {
  const list = document.getElementById("fieldsList");
  const selectedInfoBtn = document.getElementById("selectedInfoBtn");

  if (!items || !items.length) {
    list.innerHTML = '<div class="muted">감지된 항목이 없습니다.</div>';
    selectedInfoBtn.disabled = true;
    return;
  }

  list.innerHTML = "";
  items.forEach((item, index) => {
    if (item.checked === undefined) item.checked = true;

    const div = document.createElement("div");
    div.className = "field-item";
    div.innerHTML = `
      <label style="display:flex; align-items:flex-start; gap:8px; border:1px solid #ddd; border-radius:8px; padding:6px 8px; margin-bottom:6px; background:#fff; cursor:pointer;">
        <input type="checkbox" class="field-check" data-index="${index}" ${item.checked ? "checked" : ""} style="margin-top:4px;">
        <div>
          <div class="field-type" style="color:#555; font-size:12px;">${escapeHTML(item.type || "유형")}</div>
          <div class="field-value" style="font-weight:bold;">${escapeHTML(item.value || "")}</div>
        </div>
      </label>
    `;
    list.appendChild(div);
  });

  list.querySelectorAll(".field-check").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const idx = parseInt(checkbox.dataset.index);
      items[idx].checked = checkbox.checked;
    });
  });

  selectedInfoBtn.disabled = false;
}

function resetButtonsForNewFile() {
  document.getElementById("checkBtn").disabled = false;
  document.getElementById("checkBtn").textContent = "개인정보검사";
  
  document.getElementById("sendBtn").disabled = true;
  document.getElementById("sendBtn").textContent = "메일 전송 (전체)";

  document.getElementById("selectedInfoBtn").disabled = true;
  document.getElementById("selectedInfoBtn").textContent = "선택 정보 전송 (마킹)";

  document.getElementById("actionInput").value = "analyze";
  document.getElementById("fieldsList").innerHTML =
    '<div class="muted">파일을 선택하면 감지된 항목이 표시됩니다.</div>';
  
  requiredFieldsData = [];
}

document.getElementById("uploadForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!showEmailError("toEmail", "toError")) return;

  if (fileInput.files.length === 0) {
    alert("파일을 선택해주세요.");
    return;
  }

  const checkBtn = document.getElementById("checkBtn");
  const actionInput = document.getElementById("actionInput");
  
  actionInput.value = "analyze";
  checkBtn.textContent = "검사중..";
  checkBtn.disabled = true;

  const fd = new FormData();
  fd.append("files", fileInput.files[0]);
  fd.append("title", document.getElementById("titleInput").value);
  
  const { ok, text } = await postFormData(analyzeWebhookUrl, fd, "ANALYZE");
  
  checkBtn.textContent = "개인정보검사";
  checkBtn.disabled = false;

  if (ok) {
    requiredFieldsData = parseArrayFromText(text);
    renderRequiredFields(requiredFieldsData);
    document.getElementById("sendBtn").disabled = false;
  } else {
    alert("개인정보 검사 실패.");
  }
});

document.getElementById("sendBtn").addEventListener("click", async () => {
  if (!showEmailError("toEmail", "toError")) return;
  if (fileInput.files.length === 0) return;

  const sendBtn = document.getElementById("sendBtn");
  sendBtn.disabled = true;
  sendBtn.textContent = "전송 중..";

  const filteredFields = requiredFieldsData.filter(f => f.checked !== false);

  const fd = new FormData();
  fd.append("files", fileInput.files[0]);
  fd.append("subject", document.getElementById("titleInput").value);
  fd.append("to", document.getElementById("toEmail").value);
  fd.append("body", document.getElementById("messageBox").value);
  fd.append("requiredFields", JSON.stringify(filteredFields));

  const { ok } = await postFormData(sendWebhookUrl, fd, "SEND_MAIL");
  
  sendBtn.textContent = ok ? "전송 완료" : "메일 전송 (전체)";
  sendBtn.disabled = ok;
  if (!ok) {
      alert("메일 전송 실패.");
      sendBtn.disabled = false;
  }
});

document.getElementById("selectedInfoBtn").addEventListener("click", async () => {
  const btn = document.getElementById("selectedInfoBtn");
  if (fileInput.files.length === 0) return;

  const selectedItems = requiredFieldsData.filter(item => item.checked !== false);

  if (selectedItems.length === 0) {
    alert("선택된 항목이 없습니다. 목록에서 항목을 체크해주세요.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "전송 중..";

  const fd = new FormData();
  fd.append("files", fileInput.files[0]);
  fd.append("selectedFields", JSON.stringify(selectedItems));

  console.log(selectedItems);

  const { ok } = await postFormData(sendSelectedInfoUrl, fd, "SELECTED_INFO");

  if (ok) {
    btn.textContent = "전송 완료";
    alert("선택된 정보가 전송되었습니다. (마킹 처리 시작)");
  } else {
    btn.textContent = "선택 정보 전송 (마킹)";
    btn.disabled = false;
    alert("전송 실패.");
  }
});