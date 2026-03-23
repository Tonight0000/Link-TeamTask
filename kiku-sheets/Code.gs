// ========================================
// Kiku — Google Apps Script API
// Google スプレッドシートに貼り付けて使う
// ========================================

const SHEET_NAME = "tasks";

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["id", "text", "member", "status", "date", "comments", "created_at"]);
  }
  return sheet;
}

function doGet(e) {
  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];
  const tasks = rows.slice(1).map(row => {
    const task = {};
    headers.forEach((h, i) => {
      if (h === "comments") {
        try { task[h] = JSON.parse(row[i] || "[]"); } catch { task[h] = []; }
      } else {
        task[h] = row[i];
      }
    });
    return task;
  }).filter(t => t.id);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, tasks }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const { action, task } = data;

  const sheet = getSheet();
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0];

  if (action === "add") {
    sheet.appendRow([
      task.id, task.text, task.member, task.status,
      task.date, JSON.stringify(task.comments || []),
      new Date().toISOString()
    ]);
  }

  if (action === "update") {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === task.id) {
        const rowNum = i + 1;
        headers.forEach((h, colIdx) => {
          if (task[h] !== undefined) {
            const val = h === "comments" ? JSON.stringify(task[h]) : task[h];
            sheet.getRange(rowNum, colIdx + 1).setValue(val);
          }
        });
        break;
      }
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
