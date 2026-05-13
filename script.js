// script.js — Supabase 전용 버전

// Supabase 연결은 각 HTML 파일에서 먼저 되어 있어야 함.
// HTML 하단 순서:
// 1) supabase-js SDK
// 2) const supabase = window.supabase.createClient(...)
// 3) script.js

const TABLE_NAME = "work_reports";

const STATUS_DONE = ["완료"];
const STATUS_PROGRESS = ["진행중"];
const STATUS_REVIEW = ["검토중", "수정중"];
const STATUS_BAD = ["지연", "보류", "자료대기"];

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

function getISOWeek(dateInput) {
  const date = new Date(dateInput);
  const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((temp - yearStart) / 86400000) + 1) / 7);

  return {
    year: temp.getUTCFullYear(),
    week,
  };
}

function getMonthString(dateInput) {
  const d = new Date(dateInput);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "미지정";
    if (!acc[value]) acc[value] = [];
    acc[value].push(item);
    return acc;
  }, {});
}

function countByStatus(items, statuses) {
  return items.filter((item) => statuses.includes(item["진행상태"])).length;
}

function sumWorkCount(items) {
  return items.reduce((sum, item) => sum + Number(item["작업건수"] || 0), 0);
}

function completionRate(items) {
  if (!items.length) return "0%";
  const done = countByStatus(items, STATUS_DONE);
  return `${Math.round((done / items.length) * 100)}%`;
}

async function fetchReports() {
  if (!window.supabase && typeof supabase === "undefined") {
    console.error("Supabase client가 없습니다. HTML에서 SDK와 createClient 순서를 확인하세요.");
    return [];
  }

  const client = window.supabaseClient || supabase;

  const { data, error } = await client
    .from(TABLE_NAME)
    .select("*")
    .order("날짜", { ascending: false });

  if (error) {
    console.error("Supabase 데이터 불러오기 실패:", error);
    alert("Supabase 데이터 불러오기 실패: " + error.message);
    return [];
  }

  return data || [];
}

function renderSimpleList(id, items) {
  const el = $(id);
  if (!el) return;

  if (!items.length) {
    el.innerHTML = "<li>표시할 업무가 없습니다.</li>";
    return;
  }

  el.innerHTML = items
    .map((item) => {
      const project = item["프로젝트명"] || "프로젝트 미지정";
      const task = item["금일진행업무"] || "";
      const status = item["진행상태"] || "상태 미지정";
      const person = item["담당자"] || "담당자 미지정";

      return `<li><strong>${project}</strong> - ${task} / ${person} / ${status}</li>`;
    })
    .join("");
}

function renderGroupTable(tbodyId, groups, columns = "basic") {
  const tbody = $(tbodyId);
  if (!tbody) return;

  const rows = Object.entries(groups).map(([name, items]) => {
    const total = items.length;
    const done = countByStatus(items, STATUS_DONE);
    const rate = total ? `${Math.round((done / total) * 100)}%` : "0%";

    if (columns === "withRate") {
      return `
        <tr>
          <td>${name}</td>
          <td>${total}</td>
          <td>${done}</td>
          <td>${rate}</td>
        </tr>
      `;
    }

    return `
      <tr>
        <td>${name}</td>
        <td>${total}</td>
        <td>${done}</td>
      </tr>
    `;
  });

  tbody.innerHTML = rows.join("") || `<tr><td colspan="4">데이터가 없습니다.</td></tr>`;
}

function renderProjectTable(items) {
  const tbody = $("project-table-body");
  if (!tbody) return;

  const groups = groupBy(items, "프로젝트명");

  tbody.innerHTML =
    Object.entries(groups)
      .map(([project, list]) => {
        const total = list.length;
        const done = countByStatus(list, STATUS_DONE);
        const rate = total ? `${Math.round((done / total) * 100)}%` : "0%";

        return `
          <tr>
            <td>${project}</td>
            <td>${total}</td>
            <td>${done}</td>
            <td>${rate}</td>
          </tr>
        `;
      })
      .join("") || `<tr><td colspan="4">데이터가 없습니다.</td></tr>`;
}

function renderCalendar(items) {
  const calendar = $("calendar");
  if (!calendar) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDate = new Date(year, month + 1, 0).getDate();

  let html = "";

  for (let day = 1; day <= lastDate; day++) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayItems = items.filter((item) => item["날짜"] === date);

    const done = countByStatus(dayItems, STATUS_DONE);
    const progress = countByStatus(dayItems, STATUS_PROGRESS);
    const review = countByStatus(dayItems, STATUS_REVIEW);
    const bad = countByStatus(dayItems, STATUS_BAD);

    html += `
      <div class="day">
        <h4>${day}</h4>
        ${
          dayItems.length
            ? `
              <ul>
                <li>총 ${dayItems.length}건</li>
                <li>완료 ${done} / 진행 ${progress}</li>
                <li>검토·수정 ${review} / 지연 ${bad}</li>
              </ul>
            `
            : ""
        }
      </div>
    `;
  }

  calendar.innerHTML = html;
}

function renderWeekTrend(items) {
  const tbody = $("week-trend-body");
  if (!tbody) return;

  const groups = {};

  items.forEach((item) => {
    const week = item["주차"] || getISOWeek(item["날짜"]).week;
    if (!groups[week]) groups[week] = [];
    groups[week].push(item);
  });

  tbody.innerHTML =
    Object.entries(groups)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([week, list]) => {
        return `
          <tr>
            <td>${week}주차</td>
            <td>${list.length}</td>
            <td>${countByStatus(list, STATUS_DONE)}</td>
            <td>${countByStatus(list, STATUS_PROGRESS)}</td>
          </tr>
        `;
      })
      .join("") || `<tr><td colspan="4">데이터가 없습니다.</td></tr>`;
}

async function loadDailyDashboard() {
  const reports = await fetchReports();
  const today = getTodayString();

  const todayItems = reports.filter((item) => item["날짜"] === today);

  setText("today-total", todayItems.length);
  setText("today-completed", countByStatus(todayItems, STATUS_DONE));
  setText(
    "today-inprogress",
    countByStatus(todayItems, [...STATUS_PROGRESS, ...STATUS_REVIEW])
  );
  setText("today-delayed", countByStatus(todayItems, STATUS_BAD));

  renderSimpleList("today-list", todayItems);
}

async function loadWeeklyDashboard() {
  const reports = await fetchReports();
  const now = new Date();
  const current = getISOWeek(now);

  const weekItems = reports.filter((item) => {
    if (!item["날짜"]) return false;
    const target = getISOWeek(item["날짜"]);
    return target.year === current.year && target.week === current.week;
  });

  setText("week-total-work", weekItems.length);
  setText("week-total-task", sumWorkCount(weekItems));
  setText("week-completed", countByStatus(weekItems, STATUS_DONE));
  setText("week-inprogress", countByStatus(weekItems, STATUS_PROGRESS));
  setText("week-review", countByStatus(weekItems, STATUS_REVIEW));
  setText("week-delayed", countByStatus(weekItems, STATUS_BAD));
  setText("week-completion-rate", completionRate(weekItems));

  renderProjectTable(weekItems);
  renderGroupTable("dept-table-body", groupBy(weekItems, "요청부서"), "withRate");
  renderGroupTable("part-table-body", groupBy(weekItems, "파트"));
  renderGroupTable("type-table-body", groupBy(weekItems, "업무구분"));
  renderGroupTable("member-table-body", groupBy(weekItems, "담당자"));
}

async function loadMonthlyDashboard() {
  const reports = await fetchReports();
  const currentMonth = getMonthString(new Date());

  const monthItems = reports.filter((item) => {
    if (!item["날짜"]) return false;
    return getMonthString(item["날짜"]) === currentMonth;
  });

  const now = new Date();

  const overdueItems = monthItems.filter((item) => {
    if (!item["완료예정일"]) return false;
    if (item["진행상태"] === "완료") return false;

    const due = new Date(item["완료예정일"]);
    return due < now;
  });

  const completedItems = monthItems.filter((item) => item["진행상태"] === "완료");
  const delayedItems = monthItems.filter((item) => STATUS_BAD.includes(item["진행상태"]));

  setText("month-total-work", monthItems.length);
  setText("month-total-task", sumWorkCount(monthItems));
  setText("month-completed", countByStatus(monthItems, STATUS_DONE));
  setText("month-inprogress", countByStatus(monthItems, STATUS_PROGRESS));
  setText("month-review", countByStatus(monthItems, STATUS_REVIEW));
  setText("month-delayed", countByStatus(monthItems, STATUS_BAD));
  setText("month-completion-rate", completionRate(monthItems));
  setText("month-completed-tasks", sumWorkCount(completedItems));
  setText("month-delayed-tasks", sumWorkCount(delayedItems));
  setText("month-overdue", overdueItems.length);

  renderCalendar(monthItems);
  renderWeekTrend(monthItems);

  renderGroupTable("month-dept-body", groupBy(monthItems, "요청부서"), "withRate");
  renderGroupTable("month-part-body", groupBy(monthItems, "파트"));
  renderGroupTable("month-type-body", groupBy(monthItems, "업무구분"));
  renderGroupTable("month-member-body", groupBy(monthItems, "담당자"));

  const issueItems = monthItems.filter((item) => {
    return (
      STATUS_BAD.includes(item["진행상태"]) ||
      overdueItems.includes(item) ||
      (item["특이사항"] && item["특이사항"].trim() !== "")
    );
  });

  renderSimpleList("month-issues", issueItems);
}

document.addEventListener("DOMContentLoaded", () => {
  const page = location.pathname.split("/").pop();

  if (page === "daily.html") {
    loadDailyDashboard();
  }

  if (page === "weekly.html") {
    loadWeeklyDashboard();
  }

  if (page === "monthly.html") {
    loadMonthlyDashboard();
  }
});
