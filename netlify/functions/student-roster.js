import {
  getStudentRoster,
  setStudentRoster,
  isAdminAuthorized,
  jsonResponse,
} from "../lib/store.mjs";

// 학번은 5자리 숫자만 인정 (학년1자리 + 반2자리 + 번호2자리)
function parseRosterText(text) {
  const lines = String(text || "").split(/\r?\n/);
  const seen = new Set();
  const roster = [];
  const skipped = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // 학번과 이름 사이에 공백, 탭, 콤마 중 무엇이 와도 인식
    const parts = line.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 2) {
      skipped.push(line);
      continue;
    }
    const studentId = parts[0].trim();
    const name = parts.slice(1).join(" ").trim();

    if (!/^\d{5}$/.test(studentId) || !name) {
      skipped.push(line);
      continue;
    }
    if (seen.has(studentId)) continue; // 중복 학번은 한 번만
    seen.add(studentId);
    roster.push({ studentId, name });
  }

  return { roster, skipped };
}

export default async (req) => {
  if (!isAdminAuthorized(req)) {
    return jsonResponse({ success: false, msg: "관리자 인증이 필요합니다." }, 401);
  }

  if (req.method === "GET") {
    const roster = await getStudentRoster();
    return jsonResponse({ roster });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ success: false, msg: "잘못된 요청입니다." }, 400);
    }

    if (body.clear) {
      await setStudentRoster([]);
      return jsonResponse({ success: true, msg: "학생 명단이 전체 삭제되었습니다." });
    }

    const { roster, skipped } = parseRosterText(body.text);
    if (!roster.length) {
      return jsonResponse({
        success: false,
        msg: "인식된 학생이 없습니다. '학번 이름' 형식으로 한 줄에 한 명씩 입력해주세요. (예: 30715 홍길동)",
      });
    }

    await setStudentRoster(roster);

    let msg = `명단 저장 완료! 총 ${roster.length}명 등록되었습니다.`;
    if (skipped.length) {
      msg += `\n(형식이 맞지 않아 ${skipped.length}줄은 건너뛰었어요: ${skipped.slice(0, 3).join(", ")}${skipped.length > 3 ? " 외" : ""})`;
    }

    return jsonResponse({ success: true, msg, count: roster.length, skippedCount: skipped.length });
  }

  return jsonResponse({ success: false, msg: "잘못된 요청입니다." }, 405);
};
