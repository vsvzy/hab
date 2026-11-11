const DAYS_KO = ["월", "화", "수", "목", "금"];
const SELECTED_CLASS_KEY = "hab:selectedClass";

const elements = {
  status: document.querySelector("#status-message"),
  todayDate: document.querySelector("#today-date"),
  todayWeekday: document.querySelector("#today-weekday"),
  mealContent: document.querySelector("#meal-content"),
  mealDate: document.querySelector("#meal-date"),
  mealDays: document.querySelector("#meal-days"),
  mealPrev: document.querySelector("#meal-prev"),
  mealNext: document.querySelector("#meal-next"),
  grade: document.querySelector("#grade-select"),
  classNumber: document.querySelector("#class-select"),
  classStorageNote: document.querySelector("#class-storage-note"),
  weekLabel: document.querySelector("#week-label"),
  timetableBody: document.querySelector("#timetable-body"),
  timetableNote: document.querySelector("#timetable-note"),
};

let pageData = null;
let weekDates = [];
let selectedMealDate = "";

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
  return addDays(dateString, -((date.getUTCDay() + 6) % 7));
}

function setTableMessage(message) {
  elements.timetableBody.replaceChildren();
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 6;
  cell.className = "table-message";
  cell.textContent = message;
  row.append(cell);
  elements.timetableBody.append(row);
}

function setMealMessage(message) {
  elements.mealContent.replaceChildren();
  const paragraph = document.createElement("p");
  paragraph.className = "empty-state";
  paragraph.textContent = message;
  elements.mealContent.append(paragraph);
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
  elements.mealContent.replaceChildren();

  if (meals.length === 0) {
    setMealMessage("이 날짜에는 등록된 급식 정보가 없습니다.");
  } else {
    for (const meal of meals) {
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
      elements.mealContent.append(block);
    }
  }

  const index = weekDates.indexOf(dateString);
  const beforeWeek = dateString < weekDates[0];
  const afterWeek = dateString > weekDates[weekDates.length - 1];
  elements.mealPrev.disabled = index === 0 || (index < 0 && !afterWeek);
  elements.mealNext.disabled = index === weekDates.length - 1 || (index < 0 && !beforeWeek);
  for (const button of elements.mealDays.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.date === dateString));
  }
}

function renderMealDays() {
  elements.mealDays.replaceChildren();
  weekDates.forEach((date, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-button";
    button.dataset.date = date;
    button.setAttribute("aria-pressed", String(date === selectedMealDate));
    const weekday = document.createElement("span");
    weekday.textContent = DAYS_KO[index];
    const day = document.createElement("strong");
    day.textContent = String(Number(date.slice(-2)));
    button.append(weekday, day);
    button.addEventListener("click", () => renderMeal(date));
    elements.mealDays.append(button);
  });
}

function renderTimetable() {
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
  elements.timetableNote.textContent = "학년과 반 선택은 이 기기에 저장됩니다.";
}

function restoreClassSelection() {
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
  elements.todayDate.textContent = formatDate(today, { month: "long", day: "numeric" });
  elements.todayWeekday.textContent = formatDate(today, { weekday: "long" });

  try {
    const response = await fetch("./data/neis.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`data request returned ${response.status}`);
    pageData = await response.json();
  } catch {
    elements.status.hidden = false;
    elements.status.textContent = "학교 데이터를 불러오지 못했습니다. Pages 배포와 NEIS 데이터 업데이트 상태를 확인해 주세요.";
    setMealMessage("급식 데이터를 불러올 수 없습니다.");
    setTableMessage("시간표 데이터를 불러올 수 없습니다.");
    return;
  }

  if (!pageData.generatedAt || !pageData.weekStart) {
    elements.status.hidden = false;
    elements.status.textContent = "NEIS 데이터가 아직 준비되지 않았습니다. GitHub Actions에서 Pages 데이터 업데이트가 성공했는지 확인해 주세요.";
    setMealMessage("아직 게시된 급식 정보가 없습니다.");
    setTableMessage("아직 게시된 시간표 정보가 없습니다.");
    return;
  }

  if (!Array.isArray(pageData.meals) || !Array.isArray(pageData.timetable)) {
    elements.status.hidden = false;
    elements.status.textContent = "게시된 학교 데이터의 형식이 올바르지 않습니다. 데이터 업데이트를 확인해 주세요.";
    setMealMessage("급식 자료를 확인할 수 없습니다.");
    setTableMessage("시간표 자료를 확인할 수 없습니다.");
    return;
  }

  if (pageData.school?.name !== "합덕제철고등학교") {
    elements.status.hidden = false;
    elements.status.textContent = "다른 학교의 자료가 감지되어 표시하지 않았습니다. NEIS 학교 설정을 확인해 주세요.";
    setMealMessage("학교 자료를 확인할 수 없습니다.");
    setTableMessage("학교 자료를 확인할 수 없습니다.");
    return;
  }

  if (pageData.weekStart !== currentWeekStart(today)) {
    elements.status.hidden = false;
    elements.status.textContent = `게시된 자료는 ${formatDate(pageData.weekStart, { month: "long", day: "numeric" })} 주 기준입니다. 이번 주 자료가 업데이트될 때까지 급식과 시간표를 표시하지 않습니다.`;
    setMealMessage("이번 주 급식 자료가 아직 업데이트되지 않았습니다.");
    setTableMessage("이번 주 시간표 자료가 아직 업데이트되지 않았습니다.");
    return;
  }

  elements.status.hidden = true;
  weekDates = Array.from({ length: 5 }, (_, index) => addDays(pageData.weekStart, index));
  elements.weekLabel.textContent = `${formatDate(weekDates[0], { month: "numeric", day: "numeric" })} – ${formatDate(weekDates[4], { month: "numeric", day: "numeric" })}`;

  const initialDate = today;
  renderMealDays();
  renderMeal(initialDate);
  renderTimetable();
}

restoreClassSelection();
elements.mealPrev.addEventListener("click", () => {
  const index = weekDates.indexOf(selectedMealDate);
  if (index > 0) renderMeal(weekDates[index - 1]);
  else if (index < 0 && selectedMealDate > weekDates[weekDates.length - 1]) {
    renderMeal(weekDates[weekDates.length - 1]);
  }
});
elements.mealNext.addEventListener("click", () => {
  const index = weekDates.indexOf(selectedMealDate);
  if (index >= 0 && index < weekDates.length - 1) renderMeal(weekDates[index + 1]);
  else if (index < 0 && selectedMealDate < weekDates[0]) renderMeal(weekDates[0]);
});
elements.grade.addEventListener("change", saveClassSelection);
elements.classNumber.addEventListener("change", saveClassSelection);
loadData();
