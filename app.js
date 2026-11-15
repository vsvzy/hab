const SELECTED_CLASS_KEY = "hab:selectedClass";
const TIMETABLE_DISPLAY_RULES = [
  { grade: "2", dayIndex: 1, firstPeriod: 5, lastPeriod: 6, label: "코스" },
  { grade: "2", dayIndex: 2, firstPeriod: 1, lastPeriod: 6, label: "코스" },
  { grade: "2", dayIndex: 3, firstPeriod: 1, lastPeriod: 4, label: "선택과목" },
  { grade: "3", dayIndex: 0, firstPeriod: 2, lastPeriod: 4, label: "코스" },
  { grade: "3", dayIndex: 0, firstPeriod: 6, lastPeriod: 7, label: "코스" },
  { grade: "3", dayIndex: 1, firstPeriod: 1, lastPeriod: 4, label: "선택과목" },
  { grade: "3", dayIndex: 4, firstPeriod: 1, lastPeriod: 4, label: "선택과목B", excludedClassNumbers: ["5"] },
];

const elements = {
  status: document.querySelector("#status-message"),
  todayDate: document.querySelector("#today-date"),
  todayWeekday: document.querySelector("#today-weekday"),
  todayMealDate: document.querySelector("#today-meal-date"),
  todayMealContent: document.querySelector("#today-meal-content"),
  mealContent: document.querySelector("#meal-content"),
  mealDate: document.querySelector("#meal-date"),
  mealMonth: document.querySelector("#meal-month"),
  mealDays: document.querySelector("#meal-days"),
  mealPrev: document.querySelector("#meal-prev"),
  mealNext: document.querySelector("#meal-next"),
  grade: document.querySelector("#grade-select"),
  classNumber: document.querySelector("#class-select"),
  classStorageNote: document.querySelector("#class-storage-note"),
  academicPrev: document.querySelector("#academic-prev"),
  academicMonth: document.querySelector("#academic-month"),
  academicNext: document.querySelector("#academic-next"),
  academicEvents: document.querySelector("#academic-events"),
  weekLabel: document.querySelector("#week-label"),
  timetableBody: document.querySelector("#timetable-body"),
  timetableNote: document.querySelector("#timetable-note"),
};

let pageData = null;
let weekDates = [];
let selectedMealDate = "";
let selectedMealMonth = "";
let selectedAcademicMonth = "";

function kstToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatDate(dateString, options = { month: "long", day: "numeric", weekday: "long" }) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    ...options,
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function addDays(dateString, amount) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount, 12));
  return date.toISOString().slice(0, 10);
}

function currentWeekStart(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const dayOfWeek = date.getUTCDay();
  return addDays(dateString, dayOfWeek === 0 ? 1 : 1 - dayOfWeek);
}

function setTableMessage(message) {
  if (!elements.timetableBody) return;
  elements.timetableBody.replaceChildren();
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 6;
  cell.className = "table-message";
  cell.textContent = message;
  row.append(cell);
  elements.timetableBody.append(row);
}

function setMealMessage(container, message) {
  if (!container) return;
  container.replaceChildren();
  const paragraph = document.createElement("p");
  paragraph.className = "empty-state";
  paragraph.textContent = message;
  container.append(paragraph);
}

function cleanMenu(menu) {
  return String(menu || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderMeal(dateString) {
  if (!dateString) return;
  selectedMealDate = dateString;
  elements.mealDate.textContent = formatDate(dateString);
  const meals = (pageData?.meals || []).filter((meal) => meal.date === dateString);
  renderMealEntries(elements.mealContent, meals, "이 날짜에는 등록된 급식 정보가 없습니다.");

  for (const button of elements.mealDays.querySelectorAll("button[data-date]")) {
    button.setAttribute("aria-pressed", String(button.dataset.date === dateString));
  }
}

function renderTodayMeal(dateString) {
  if (!elements.todayMealContent) return;
  elements.todayMealDate.textContent = formatDate(dateString);
  const meals = (pageData?.meals || [])
    .filter((meal) => meal.date === dateString);
  renderMealEntries(elements.todayMealContent, meals, "오늘 등록된 급식 정보가 없습니다.");
}

function renderMealEntries(container, meals, emptyMessage) {
  if (!container) return;
  container.replaceChildren();
  if (meals.length === 0) {
    setMealMessage(container, emptyMessage);
    return;
  }

  const mealOrder = new Map([["조식", 0], ["중식", 1], ["석식", 2]]);
  const orderedMeals = [...meals].sort((first, second) =>
    (mealOrder.get(first.mealType) ?? 3) - (mealOrder.get(second.mealType) ?? 3)
  );
  for (const meal of orderedMeals) {
    const block = document.createElement("article");
    block.className = "meal-block";
    const type = document.createElement("span");
    type.className = "meal-type";
    type.textContent = meal.mealType || "급식";
    block.append(type);

    const list = document.createElement("ul");
    list.className = "menu-list";
    for (const item of cleanMenu(meal.menu)) {
      const entry = document.createElement("li");
      entry.textContent = item;
      list.append(entry);
    }
    block.append(list);

    if (meal.calorie) {
      const calorie = document.createElement("p");
      calorie.className = "calorie";
      calorie.textContent = meal.calorie;
      block.append(calorie);
    }
    container.append(block);
  }
}

function renderMealDays() {
  elements.mealDays.replaceChildren();
  if (!selectedMealMonth) return;
  const [year, month] = selectedMealMonth.split("-").map(Number);
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  for (let index = 0; index < firstWeekday; index += 1) {
    const empty = document.createElement("span");
    empty.className = "day-empty";
    empty.setAttribute("aria-hidden", "true");
    elements.mealDays.append(empty);
  }

  const mealsByDate = new Set((pageData?.meals || []).map((meal) => meal.date));
  for (let day = 1; day <= dayCount; day += 1) {
    const date = `${selectedMealMonth}-${String(day).padStart(2, "0")}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-button";
    button.dataset.date = date;
    button.setAttribute("aria-pressed", String(date === selectedMealDate));
    button.setAttribute("aria-label", `${formatDate(date)} 급식 보기${mealsByDate.has(date) ? ", 급식 있음" : ", 급식 정보 없음"}`);
    if (mealsByDate.has(date)) button.classList.add("has-meal");
    if (date === kstToday()) button.classList.add("is-today");
    button.textContent = String(day);
    button.addEventListener("click", () => renderMeal(date));
    elements.mealDays.append(button);
  }
}

function renderMealMonth(dateString) {
  selectedMealMonth = dateString.slice(0, 7);
  const rangeStart = pageData.mealScheduleStart;
  const rangeEnd = pageData.mealScheduleEnd;
  if (!rangeStart || !rangeEnd) {
    elements.mealMonth.textContent = formatDate(`${selectedMealMonth}-01`, { year: "numeric", month: "long" });
    elements.mealPrev.disabled = true;
    elements.mealNext.disabled = true;
    elements.mealDays.replaceChildren();
    setMealMessage(elements.mealContent, "월별 급식표 자료를 확인할 수 없습니다.");
    return;
  }

  elements.mealMonth.textContent = formatDate(`${selectedMealMonth}-01`, { year: "numeric", month: "long" });
  elements.mealPrev.disabled = selectedMealMonth <= rangeStart.slice(0, 7);
  elements.mealNext.disabled = selectedMealMonth >= rangeEnd.slice(0, 7);
  renderMealDays();
  renderMeal(dateString);
}

function moveMealMonth(offset) {
  if (!selectedMealMonth || !pageData?.mealScheduleStart || !pageData?.mealScheduleEnd) return;
  const [year, month] = selectedMealMonth.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
  const firstMonth = pageData.mealScheduleStart.slice(0, 7);
  const lastMonth = pageData.mealScheduleEnd.slice(0, 7);
  if (nextMonth < firstMonth || nextMonth > lastMonth) return;
  const today = kstToday();
  const meals = (pageData.meals || [])
    .filter((meal) => meal.date.startsWith(`${nextMonth}-`))
    .sort((first, second) => first.date.localeCompare(second.date));
  const date = today.startsWith(`${nextMonth}-`)
    ? today
    : meals[0]?.date || `${nextMonth}-01`;
  renderMealMonth(date);
}

function renderTimetable() {
  if (!elements.grade || !elements.classNumber || !elements.timetableBody) return;
  const grade = elements.grade.value;
  const classNumber = elements.classNumber.value;
  const matchingRows = (pageData?.timetable || []).filter((row) =>
    String(row.grade) === grade && String(row.classNumber) === classNumber
  );
  const lessons = new Map();
  for (const lesson of matchingRows) {
    const dayIndex = weekDates.indexOf(lesson.date);
    const period = Number.parseInt(lesson.period, 10);
    if (dayIndex < 0 || !Number.isFinite(period) || period < 1) continue;
    if (!lessons.has(period)) lessons.set(period, Array(5).fill(null));
    lessons.get(period)[dayIndex] = lesson;
  }

  for (const rule of TIMETABLE_DISPLAY_RULES) {
    if (rule.grade !== grade || rule.excludedClassNumbers?.includes(classNumber)) continue;
    for (let period = rule.firstPeriod; period <= rule.lastPeriod; period += 1) {
      if (!lessons.has(period)) lessons.set(period, Array(5).fill(null));
      lessons.get(period)[rule.dayIndex] = { subject: rule.label, room: "" };
    }
  }

  elements.timetableBody.replaceChildren();
  if (lessons.size === 0) {
    setTableMessage("선택한 반의 이번 주 시간표가 NEIS에 등록되어 있지 않습니다. 학교에서 제공하는 수동 시간표 데이터가 필요할 수 있습니다.");
    elements.timetableNote.textContent = "시간표는 NEIS 고등학교 시간표 자료를 표시합니다. 자료가 없으면 학교에 확인해 주세요.";
    return;
  }

  for (const period of [...lessons.keys()].sort((a, b) => a - b)) {
    const row = document.createElement("tr");
    const heading = document.createElement("th");
    heading.scope = "row";
    heading.textContent = `${period}교시`;
    row.append(heading);
    for (const lesson of lessons.get(period)) {
      const cell = document.createElement("td");
      if (lesson?.subject) {
        const subject = document.createElement("span");
        subject.className = "subject";
        subject.textContent = lesson.subject;
        cell.append(subject);
        if (lesson.room) {
          const room = document.createElement("span");
          room.className = "room";
          room.textContent = lesson.room;
          cell.append(room);
        }
      } else {
        cell.textContent = "—";
      }
      row.append(cell);
    }
    elements.timetableBody.append(row);
  }
  const gradeNote = grade === "2"
    ? "화요일 5~6교시와 수요일 1~6교시는 '코스', 목요일 1~4교시는 '선택과목'으로 표시합니다."
    : grade === "3"
      ? "월요일 2~4·6~7교시는 '코스', 화요일 1~4교시는 '선택과목'으로 표시합니다. 금요일 1~4교시는 5반을 제외하고 '선택과목B'로 표시합니다."
      : "";
  elements.timetableNote.textContent = ["학년과 반 선택은 이 기기에 저장됩니다.", gradeNote].filter(Boolean).join(" ");
}

function setScheduleMessage(container, message) {
  const messageElement = document.createElement(container.tagName === "OL" ? "li" : "p");
  messageElement.className = "empty-state";
  messageElement.textContent = message;
  container.append(messageElement);
}

function renderAcademicSchedule(today) {
  if (!elements.academicMonth || !elements.academicEvents) return;
  if (!selectedAcademicMonth) selectedAcademicMonth = today.slice(0, 7);
  const monthDate = `${selectedAcademicMonth}-01`;
  elements.academicMonth.textContent = formatDate(monthDate, { year: "numeric", month: "long" });
  elements.academicEvents.replaceChildren();
  const events = pageData.academicSchedule;
  const rangeStart = pageData.academicScheduleStart;
  const rangeEnd = pageData.academicScheduleEnd;
  if (!Array.isArray(events) || !rangeStart || !rangeEnd) {
    elements.academicPrev.disabled = true;
    elements.academicNext.disabled = true;
    setScheduleMessage(elements.academicEvents, "학사일정 자료를 확인할 수 없습니다.");
    return;
  }

  const firstMonth = rangeStart.slice(0, 7);
  const lastMonth = rangeEnd.slice(0, 7);
  elements.academicPrev.disabled = selectedAcademicMonth <= firstMonth;
  elements.academicNext.disabled = selectedAcademicMonth >= lastMonth;
  const monthlyEvents = events
    .filter((event) => event.date.startsWith(`${selectedAcademicMonth}-`) && event.name)
    .sort((first, second) => first.date.localeCompare(second.date));
  if (monthlyEvents.length === 0) {
    setScheduleMessage(elements.academicEvents, "이달에 등록된 학사일정이 없습니다.");
    return;
  }

  for (const event of monthlyEvents) {
    const item = document.createElement("li");
    item.className = "academic-event";
    const date = document.createElement("span");
    date.className = "academic-event-date";
    date.textContent = formatDate(event.date, { month: "numeric", day: "numeric", weekday: "short" });
    const copy = document.createElement("span");
    copy.className = "academic-event-copy";
    const name = document.createElement("span");
    name.className = "academic-event-name";
    name.textContent = event.name;
    copy.append(name);
    if (event.detail) {
      const detail = document.createElement("span");
      detail.className = "academic-event-detail";
      detail.textContent = event.detail;
      copy.append(detail);
    }
    item.append(date, copy);
    elements.academicEvents.append(item);
  }
}

function moveAcademicMonth(offset) {
  if (!selectedAcademicMonth || !pageData?.academicScheduleStart || !pageData?.academicScheduleEnd) return;
  const [year, month] = selectedAcademicMonth.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
  const firstMonth = pageData.academicScheduleStart.slice(0, 7);
  const lastMonth = pageData.academicScheduleEnd.slice(0, 7);
  if (nextMonth < firstMonth || nextMonth > lastMonth) return;
  selectedAcademicMonth = nextMonth;
  renderAcademicSchedule(kstToday());
}

function restoreClassSelection() {
  if (!elements.grade || !elements.classNumber || !elements.classStorageNote) return;
  try {
    const saved = JSON.parse(localStorage.getItem(SELECTED_CLASS_KEY) || "null");
    if (saved && ["1", "2", "3"].includes(String(saved.grade))) {
      elements.grade.value = String(saved.grade);
    }
    if (saved && [...elements.classNumber.options].some((option) => option.value === String(saved.classNumber))) {
      elements.classNumber.value = String(saved.classNumber);
    }
  } catch {
    elements.classStorageNote.hidden = false;
    elements.classStorageNote.textContent = "이 브라우저에서는 저장된 학급 정보를 읽을 수 없습니다.";
  }
}

function saveClassSelection() {
  if (!elements.grade || !elements.classNumber || !elements.classStorageNote) return;
  try {
    localStorage.setItem(SELECTED_CLASS_KEY, JSON.stringify({
      grade: elements.grade.value,
      classNumber: elements.classNumber.value,
    }));
    elements.classStorageNote.hidden = true;
  } catch {
    elements.classStorageNote.hidden = false;
    elements.classStorageNote.textContent = "이 브라우저에서는 학급 선택을 저장할 수 없습니다. 선택한 반은 이 페이지를 여는 동안 유지됩니다.";
  }
  renderTimetable();
}

async function loadData() {
  const today = kstToday();
  if (elements.todayDate) elements.todayDate.textContent = formatDate(today, { month: "long", day: "numeric" });
  if (elements.todayWeekday) elements.todayWeekday.textContent = formatDate(today, { weekday: "long" });
  if (elements.todayMealDate) elements.todayMealDate.textContent = formatDate(today);

  try {
    const response = await fetch("./data/neis.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`data request returned ${response.status}`);
    pageData = await response.json();
  } catch {
    elements.status.hidden = false;
    elements.status.textContent = "학교 데이터를 불러오지 못했습니다. Pages 배포와 NEIS 데이터 업데이트 상태를 확인해 주세요.";
    setMealMessage(elements.todayMealContent, "급식 데이터를 불러올 수 없습니다.");
    setMealMessage(elements.mealContent, "급식 데이터를 불러올 수 없습니다.");
    setTableMessage("시간표 데이터를 불러올 수 없습니다.");
    return;
  }

  if (!Array.isArray(pageData.meals) || !Array.isArray(pageData.timetable)) {
    elements.status.hidden = false;
    elements.status.textContent = "게시된 학교 데이터의 형식이 올바르지 않습니다. 데이터 업데이트를 확인해 주세요.";
    setMealMessage(elements.todayMealContent, "급식 자료를 확인할 수 없습니다.");
    setMealMessage(elements.mealContent, "급식 자료를 확인할 수 없습니다.");
    setTableMessage("아직 게시된 시간표 정보가 없습니다.");
    return;
  }

  if (pageData.school?.name !== "합덕제철고등학교") {
    elements.status.hidden = false;
    elements.status.textContent = "다른 학교의 자료가 감지되어 표시하지 않았습니다. NEIS 학교 설정을 확인해 주세요.";
    setMealMessage(elements.todayMealContent, "학교 자료를 확인할 수 없습니다.");
    setMealMessage(elements.mealContent, "학교 자료를 확인할 수 없습니다.");
    setTableMessage("시간표 자료를 확인할 수 없습니다.");
    return;
  }

  if (!pageData.generatedAt) {
    elements.status.hidden = false;
    elements.status.textContent = "NEIS 데이터가 아직 준비되지 않았습니다. GitHub Actions에서 Pages 데이터 업데이트가 성공했는지 확인해 주세요.";
    setMealMessage(elements.todayMealContent, "아직 게시된 오늘의 급식 정보가 없습니다.");
    setMealMessage(elements.mealContent, "아직 게시된 월별 급식 정보가 없습니다.");
    setTableMessage("아직 게시된 시간표 정보가 없습니다.");
    if (elements.mealMonth) renderMealMonth(today);
    if (elements.academicMonth) renderAcademicSchedule(today);
    return;
  }

  elements.status.hidden = true;
  renderTodayMeal(today);
  if (elements.mealMonth) renderMealMonth(today);
  if (elements.academicMonth) renderAcademicSchedule(today);

  if (!elements.timetableBody) return;
  if (!pageData.weekStart || pageData.weekStart !== currentWeekStart(today)) {
    elements.status.hidden = false;
    const weekNotice = pageData.weekStart
      ? `게시된 자료는 ${formatDate(pageData.weekStart, { month: "long", day: "numeric" })} 주 기준입니다. 이번 주 시간표 자료가 업데이트될 때까지 시간표를 표시하지 않습니다.`
      : "이번 주 시간표 자료가 아직 게시되지 않았습니다.";
    elements.status.textContent = weekNotice;
    setTableMessage("이번 주 시간표 자료가 아직 업데이트되지 않았습니다.");
    return;
  }

  elements.status.hidden = true;
  weekDates = Array.from({ length: 5 }, (_, index) => addDays(pageData.weekStart, index));
  elements.weekLabel.textContent = `${formatDate(weekDates[0], { month: "numeric", day: "numeric" })} – ${formatDate(weekDates[4], { month: "numeric", day: "numeric" })}`;
  renderTimetable();
}

restoreClassSelection();
elements.mealPrev?.addEventListener("click", () => moveMealMonth(-1));
elements.mealNext?.addEventListener("click", () => moveMealMonth(1));
elements.grade?.addEventListener("change", saveClassSelection);
elements.classNumber?.addEventListener("change", saveClassSelection);
elements.academicPrev?.addEventListener("click", () => moveAcademicMonth(-1));
elements.academicNext?.addEventListener("click", () => moveAcademicMonth(1));
loadData();
