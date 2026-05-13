/*
 * Work Journal dashboard script
 *
 * This script fetches issues from a GitHub repository and computes
 * statistics for daily, weekly and monthly dashboards. It expects
 * each work report issue to contain a JSON object in a fenced code block
 * (```json ... ```). The JSON keys should match the field names
 * defined in the daily input requirements, such as "날짜", "담당자",
 * "파트", etc. For example:
 *
 * ```json
 * {
 *   "날짜": "2026-05-13",
 *   "담당자": "홍길동",
 *   "파트": "영상",
 *   "프로젝트명": "VESTA 홈페이지",
 *   "업무구분": "영상",
 *   "요청부서": "영업",
 *   "금일진행업무": "메인 배너 수정",
 *   "진행상태": "진행중",
 *   "완료예정일": "2026-05-20",
 *   "특이사항": "모바일 반응형 수정 필요",
 *   "산출물링크": "https://example.com",
 *   "주차": 20,
 *   "월": 5,
 *   "연도": 2026,
 *   "작업건수": 3
 * }
 * ```
 *
 * The script uses the GitHub REST API. To authenticate, store a
 * personal access token in localStorage under the key "githubToken" or
 * set it directly in the `token` variable below. Without a token
 * authenticated requests may hit rate limits. You can obtain a
 * token at https://github.com/settings/tokens with the "repo" scope.
 */

const repoOwner = 'YOUR_GITHUB_USERNAME';
const repoName = 'YOUR_REPOSITORY_NAME';

// Retrieve a GitHub personal access token from localStorage or leave blank
const token = localStorage.getItem('githubToken') || '';

/**
 * Fetch all issues labeled with "work-report" from the repository.
 * Returns a promise that resolves to an array of issue objects.
 */
async function fetchWorkIssues() {
  const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues?state=all&labels=work-report&per_page=100`;
  const headers = token
    ? { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' }
    : { Accept: 'application/vnd.github+json' };
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }
  const issues = await response.json();
  return issues;
}

/**
 * Parse a JSON object from an issue body. The JSON is expected
 * to be enclosed in a fenced code block marked as ```json ... ```.
 */
function parseReport(issue) {
  const regex = /```json([\s\S]*?)```/;
  const match = regex.exec(issue.body);
  if (!match) return null;
  try {
    const jsonText = match[1].trim();
    const data = JSON.parse(jsonText);
    return data;
  } catch (e) {
    console.error('Failed to parse JSON from issue', issue.number, e);
    return null;
  }
}

/**
 * Compute ISO week number for a date. Returns an object with year and week.
 */
function getISOWeek(date) {
  const tempDate = new Date(date.getTime());
  tempDate.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year.
  tempDate.setDate(tempDate.getDate() + 3 - ((tempDate.getDay() + 6) % 7));
  const week1 = new Date(tempDate.getFullYear(), 0, 4);
  return {
    year: tempDate.getFullYear(),
    week:
      1 + Math.round(
        ((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
      ),
  };
}

/**
 * Group reports by a predicate function returning a key.
 */
function groupBy(array, keyFn) {
  return array.reduce((acc, item) => {
    const key = keyFn(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

/**
 * Load and display the daily dashboard.
 */
async function loadDailyDashboard() {
  try {
    const issues = await fetchWorkIssues();
    const reports = issues
      .map(parseReport)
      .filter((r) => r && r['날짜']);
    // Filter for today's date
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const todaysReports = reports.filter((r) => r['날짜'] === todayStr);
    // Compute counts
    const totalToday = todaysReports.length;
    const completedToday = todaysReports.filter((r) => r['진행상태'] === '완료').length;
    const inProgress = todaysReports.filter((r) => ['진행중', '검토중', '수정중'].includes(r['진행상태'])).length;
    const delayed = todaysReports.filter((r) => ['지연', '보류', '자료대기'].includes(r['진행상태'])).length;
    // Update the DOM
    document.getElementById('today-total').textContent = totalToday;
    document.getElementById('today-completed').textContent = completedToday;
    document.getElementById('today-inprogress').textContent = inProgress;
    document.getElementById('today-delayed').textContent = delayed;
    // List today's reports
    const listEl = document.getElementById('today-list');
    listEl.innerHTML = '';
    todaysReports.forEach((r) => {
      const li = document.createElement('li');
      li.textContent = `${r['프로젝트명']} - ${r['금일진행업무']} (${r['진행상태']})`;
      listEl.appendChild(li);
    });
  } catch (e) {
    console.error(e);
    alert('Failed to load daily dashboard');
  }
}

/**
 * Load and display the weekly dashboard.
 */
async function loadWeeklyDashboard() {
  try {
    const issues = await fetchWorkIssues();
    const reports = issues
      .map(parseReport)
      .filter((r) => r && r['날짜']);
    const now = new Date();
    const { year: currentYear, week: currentWeek } = getISOWeek(now);
    const weeklyReports = reports.filter((r) => {
      const d = new Date(r['날짜']);
      const { year, week } = getISOWeek(d);
      return year === currentYear && week === currentWeek;
    });
    // Compute metrics
    const total = weeklyReports.length;
    const totalTasks = weeklyReports.reduce((sum, r) => sum + (Number(r['작업건수']) || 0), 0);
    const completed = weeklyReports.filter((r) => r['진행상태'] === '완료').length;
    const inProgress = weeklyReports.filter((r) => ['진행중', '검토중', '수정중'].includes(r['진행상태'])).length;
    const delayed = weeklyReports.filter((r) => ['지연', '보류', '자료대기'].includes(r['진행상태'])).length;
    const doneOrInProcess = completed + inProgress;
    const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0';
    // Populate summary stats
    document.getElementById('week-total-work').textContent = total;
    document.getElementById('week-total-task').textContent = totalTasks;
    document.getElementById('week-completed').textContent = completed;
    document.getElementById('week-inprogress').textContent = inProgress;
    document.getElementById('week-review').textContent = weeklyReports.filter((r) => ['검토중', '수정중'].includes(r['진행상태'])).length;
    document.getElementById('week-delayed').textContent = delayed;
    document.getElementById('week-completion-rate').textContent = completionRate + '%';
    // Group by project and compute progress (completed / total per project)
    const projectGroups = groupBy(weeklyReports, (r) => r['프로젝트명']);
    const projectTableBody = document.getElementById('project-table-body');
    projectTableBody.innerHTML = '';
    Object.keys(projectGroups).forEach((project) => {
      const list = projectGroups[project];
      const totalP = list.length;
      const completedP = list.filter((r) => r['진행상태'] === '완료').length;
      const progress = totalP > 0 ? ((completedP / totalP) * 100).toFixed(1) : '0';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${project}</td><td>${totalP}</td><td>${completedP}</td><td>${progress}%</td>`;
      projectTableBody.appendChild(tr);
    });
    // Group by department
    const deptGroups = groupBy(weeklyReports, (r) => r['요청부서']);
    const deptTableBody = document.getElementById('dept-table-body');
    deptTableBody.innerHTML = '';
    Object.keys(deptGroups).forEach((dept) => {
      const list = deptGroups[dept];
      const totalD = list.length;
      const completedD = list.filter((r) => r['진행상태'] === '완료').length;
      const progressD = totalD > 0 ? ((completedD / totalD) * 100).toFixed(1) : '0';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${dept}</td><td>${totalD}</td><td>${completedD}</td><td>${progressD}%</td>`;
      deptTableBody.appendChild(tr);
    });
    // Group by part and by type (업무구분)
    const partGroups = groupBy(weeklyReports, (r) => r['파트']);
    const partTableBody = document.getElementById('part-table-body');
    partTableBody.innerHTML = '';
    Object.keys(partGroups).forEach((part) => {
      const list = partGroups[part];
      const totalP2 = list.length;
      const completedP2 = list.filter((r) => r['진행상태'] === '완료').length;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${part}</td><td>${totalP2}</td><td>${completedP2}</td>`;
      partTableBody.appendChild(tr);
    });
    const typeGroups = groupBy(weeklyReports, (r) => r['업무구분']);
    const typeTableBody = document.getElementById('type-table-body');
    typeTableBody.innerHTML = '';
    Object.keys(typeGroups).forEach((type) => {
      const list = typeGroups[type];
      const totalT = list.length;
      const completedT = list.filter((r) => r['진행상태'] === '완료').length;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${type}</td><td>${totalT}</td><td>${completedT}</td>`;
      typeTableBody.appendChild(tr);
    });
    // Group by team member
    const memberGroups = groupBy(weeklyReports, (r) => r['담당자']);
    const memberTableBody = document.getElementById('member-table-body');
    memberTableBody.innerHTML = '';
    Object.keys(memberGroups).forEach((member) => {
      const list = memberGroups[member];
      const totalM = list.length;
      const completedM = list.filter((r) => r['진행상태'] === '완료').length;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${member}</td><td>${totalM}</td><td>${completedM}</td>`;
      memberTableBody.appendChild(tr);
    });
  } catch (e) {
    console.error(e);
    alert('Failed to load weekly dashboard');
  }
}

/**
 * Load and display the monthly dashboard.
 */
async function loadMonthlyDashboard() {
  try {
    const issues = await fetchWorkIssues();
    const reports = issues
      .map(parseReport)
      .filter((r) => r && r['날짜']);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthlyReports = reports.filter((r) => {
      const d = new Date(r['날짜']);
      return d.getFullYear() === year && d.getMonth() === month;
    });
    // Compute metrics
    const total = monthlyReports.length;
    const totalTasks = monthlyReports.reduce((sum, r) => sum + (Number(r['작업건수']) || 0), 0);
    const completed = monthlyReports.filter((r) => r['진행상태'] === '완료').length;
    const inProgress = monthlyReports.filter((r) => ['진행중', '검토중', '수정중'].includes(r['진행상태'])).length;
    const review = monthlyReports.filter((r) => ['검토중', '수정중'].includes(r['진행상태'])).length;
    const delayed = monthlyReports.filter((r) => ['지연', '보류', '자료대기'].includes(r['진행상태'])).length;
    const completionRate = total > 0 ? ((completed / total) * 100).toFixed(1) : '0';
    // Completed task count and delayed task count
    const completedTasks = monthlyReports.reduce(
      (sum, r) => sum + (r['진행상태'] === '완료' ? Number(r['작업건수']) || 0 : 0),
      0
    );
    const delayedTasks = monthlyReports.reduce(
      (sum, r) => sum + (['지연', '보류', '자료대기'].includes(r['진행상태']) ? Number(r['작업건수']) || 0 : 0),
      0
    );
    const overdue = monthlyReports.filter((r) => {
      if (!r['완료예정일'] || r['진행상태'] === '완료') return false;
      const due = new Date(r['완료예정일']);
      return due < now;
    }).length;
    // Populate summary stats
    document.getElementById('month-total-work').textContent = total;
    document.getElementById('month-total-task').textContent = totalTasks;
    document.getElementById('month-completed').textContent = completed;
    document.getElementById('month-inprogress').textContent = inProgress;
    document.getElementById('month-review').textContent = review;
    document.getElementById('month-delayed').textContent = delayed;
    document.getElementById('month-completion-rate').textContent = completionRate + '%';
    document.getElementById('month-completed-tasks').textContent = completedTasks;
    document.getElementById('month-delayed-tasks').textContent = delayedTasks;
    document.getElementById('month-overdue').textContent = overdue;
    // Calendar generation
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const calendarEl = document.getElementById('calendar');
    calendarEl.innerHTML = '';
    // Fill days from 1 to lastDay.getDate()
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const dateStr = new Date(year, month, day).toISOString().slice(0, 10);
      const dayReports = monthlyReports.filter((r) => r['날짜'] === dateStr);
      const dayEl = document.createElement('div');
      dayEl.className = 'day';
      const h4 = document.createElement('h4');
      h4.textContent = day;
      dayEl.appendChild(h4);
      const ul = document.createElement('ul');
      dayReports.forEach((r) => {
        const li = document.createElement('li');
        li.textContent = `${r['프로젝트명']} (${r['진행상태']})`;
        ul.appendChild(li);
      });
      dayEl.appendChild(ul);
      calendarEl.appendChild(dayEl);
    }
    // Weekly trend (by ISO week number)
    const weekGroups = groupBy(monthlyReports, (r) => {
      const d = new Date(r['날짜']);
      const { week } = getISOWeek(d);
      return week;
    });
    const weekTableBody = document.getElementById('week-trend-body');
    weekTableBody.innerHTML = '';
    Object.keys(weekGroups).forEach((weekNo) => {
      const list = weekGroups[weekNo];
      const totalW = list.length;
      const completedW = list.filter((r) => r['진행상태'] === '완료').length;
      const inProgressW = list.filter((r) => ['진행중', '검토중', '수정중'].includes(r['진행상태'])).length;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${weekNo}</td><td>${totalW}</td><td>${completedW}</td><td>${inProgressW}</td>`;
      weekTableBody.appendChild(tr);
    });
    // Department table
    const deptGroups = groupBy(monthlyReports, (r) => r['요청부서']);
    const mDeptTableBody = document.getElementById('month-dept-body');
    mDeptTableBody.innerHTML = '';
    Object.keys(deptGroups).forEach((dept) => {
      const list = deptGroups[dept];
      const totalD = list.length;
      const completedD = list.filter((r) => r['진행상태'] === '완료').length;
      const progress = totalD > 0 ? ((completedD / totalD) * 100).toFixed(1) : '0';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${dept}</td><td>${totalD}</td><td>${completedD}</td><td>${progress}%</td>`;
      mDeptTableBody.appendChild(tr);
    });
    // Part table
    const partGroups = groupBy(monthlyReports, (r) => r['파트']);
    const mPartTableBody = document.getElementById('month-part-body');
    mPartTableBody.innerHTML = '';
    Object.keys(partGroups).forEach((part) => {
      const list = partGroups[part];
      const totalP = list.length;
      const completedP = list.filter((r) => r['진행상태'] === '완료').length;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${part}</td><td>${totalP}</td><td>${completedP}</td>`;
      mPartTableBody.appendChild(tr);
    });
    // Type table
    const typeGroups = groupBy(monthlyReports, (r) => r['업무구분']);
    const mTypeTableBody = document.getElementById('month-type-body');
    mTypeTableBody.innerHTML = '';
    Object.keys(typeGroups).forEach((type) => {
      const list = typeGroups[type];
      const totalT = list.length;
      const completedT = list.filter((r) => r['진행상태'] === '완료').length;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${type}</td><td>${totalT}</td><td>${completedT}</td>`;
      mTypeTableBody.appendChild(tr);
    });
    // Member table
    const memberGroups = groupBy(monthlyReports, (r) => r['담당자']);
    const mMemberTableBody = document.getElementById('month-member-body');
    mMemberTableBody.innerHTML = '';
    Object.keys(memberGroups).forEach((member) => {
      const list = memberGroups[member];
      const totalM = list.length;
      const completedM = list.filter((r) => r['진행상태'] === '완료').length;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${member}</td><td>${totalM}</td><td>${completedM}</td>`;
      mMemberTableBody.appendChild(tr);
    });
    // Identify key issues (delayed or overdue)
    const keyIssues = monthlyReports.filter(
      (r) => ['지연', '보류', '자료대기'].includes(r['진행상태']) ||
        (r['완료예정일'] && new Date(r['완료예정일']) < now && r['진행상태'] !== '완료')
    );
    const issuesListEl = document.getElementById('month-issues');
    issuesListEl.innerHTML = '';
    keyIssues.forEach((r) => {
      const li = document.createElement('li');
      li.textContent = `${r['날짜']} ${r['프로젝트명']} - ${r['금일진행업무']} (${r['진행상태']})`;
      issuesListEl.appendChild(li);
    });
  } catch (e) {
    console.error(e);
    alert('Failed to load monthly dashboard');
  }
}

// Automatically detect which page is loaded and call the corresponding loader
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  if (path.endsWith('daily.html')) {
    loadDailyDashboard();
  } else if (path.endsWith('weekly.html')) {
    loadWeeklyDashboard();
  } else if (path.endsWith('monthly.html')) {
    loadMonthlyDashboard();
  }
});