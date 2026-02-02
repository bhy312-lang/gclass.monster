// ========== 출결 관리 시스템 ==========
// 전역 변수
let currentDate = new Date();
let selectedDate = new Date();
let students = [];
let attendanceRecords = {}; // { 'YYYY-MM-DD': { studentId: { checkIn, checkOut, status } } }
let showAllStudents = true;
let currentModalType = null; // 'checkin' or 'checkout'
let currentStudentId = null;
let useSupabase = false;

// ========== 초기화 ==========
document.addEventListener('DOMContentLoaded', async () => {
    await initSupabase();
    await loadStudents();
    await loadAttendanceRecords();
    renderCalendar();
    renderStudentList();
    updateCurrentMonthDisplay();

    // 오늘 날짜 선택
    selectDate(new Date());
});

// ========== Supabase 초기화 ==========
async function initSupabase() {
    if (typeof supabase !== 'undefined' && isSupabaseConfigured && isSupabaseConfigured()) {
        useSupabase = true;
        console.log('✓ Supabase 연동 모드');
    } else {
        useSupabase = false;
        console.log('⚠️ localStorage 모드 (Supabase 미설정)');
    }
}

// ========== 학생 로드 ==========
async function loadStudents() {
    if (useSupabase) {
        try {
            const { data, error } = await supabase
                .from('students')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            students = data || [];
        } catch (error) {
            console.error('학생 로드 실패:', error);
            loadStudentsFromLocalStorage();
        }
    } else {
        loadStudentsFromLocalStorage();
    }
}

function loadStudentsFromLocalStorage() {
    // 데모 데이터
    const demoStudents = localStorage.getItem('demo_students');
    if (demoStudents) {
        students = JSON.parse(demoStudents);
    } else {
        // 기본 데모 학생 데이터
        students = [
            { id: '1', name: '김민준', parent_phone_last4: '1234' },
            { id: '2', name: '이서윤', parent_phone_last4: '2345' },
            { id: '3', name: '박하준', parent_phone_last4: '3456' },
            { id: '4', name: '최지우', parent_phone_last4: '4567' },
            { id: '5', name: '정우진', parent_phone_last4: '5678' },
            { id: '6', name: '유나', parent_phone_last4: '6789' }
        ];
        localStorage.setItem('demo_students', JSON.stringify(students));
    }
}

// ========== 출결 기록 로드 ==========
async function loadAttendanceRecords() {
    if (useSupabase) {
        try {
            const { data, error } = await supabase
                .from('attendance_records')
                .select('*');

            if (error) throw error;

            // 날짜별로 그룹화
            attendanceRecords = {};
            (data || []).forEach(record => {
                const date = record.date.split('T')[0];
                if (!attendanceRecords[date]) {
                    attendanceRecords[date] = {};
                }
                attendanceRecords[date][record.student_id] = {
                    checkIn: record.check_in_time,
                    checkOut: record.check_out_time,
                    status: record.status
                };
            });
        } catch (error) {
            console.error('출결 기록 로드 실패:', error);
            loadAttendanceRecordsFromLocalStorage();
        }
    } else {
        loadAttendanceRecordsFromLocalStorage();
    }
}

function loadAttendanceRecordsFromLocalStorage() {
    const stored = localStorage.getItem('attendance_records_v2');
    if (stored) {
        attendanceRecords = JSON.parse(stored);
    } else {
        attendanceRecords = {};
    }
}

// ========== 출결 기록 저장 ==========
async function saveAttendanceRecord(date, studentId, record) {
    const dateStr = formatDate(date);

    if (useSupabase) {
        try {
            const { error } = await supabase
                .from('attendance_records')
                .upsert({
                    date: dateStr + 'T00:00:00',
                    student_id: studentId,
                    check_in_time: record.checkIn,
                    check_out_time: record.checkOut,
                    status: record.status
                });

            if (error) throw error;
        } catch (error) {
            console.error('출결 기록 저장 실패:', error);
            saveAttendanceRecordToLocalStorage(dateStr, studentId, record);
        }
    } else {
        saveAttendanceRecordToLocalStorage(dateStr, studentId, record);
    }
}

function saveAttendanceRecordToLocalStorage(dateStr, studentId, record) {
    if (!attendanceRecords[dateStr]) {
        attendanceRecords[dateStr] = {};
    }
    attendanceRecords[dateStr][studentId] = record;
    localStorage.setItem('attendance_records_v2', JSON.stringify(attendanceRecords));
}

// ========== 캘린더 렌더링 ==========
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    if (!grid) return;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // 첫째 날과 마지막 날
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // 첫째 날의 요일 (0: 일요일)
    const startDay = firstDay.getDay();

    let html = '';

    // 빈 칸 (이전 달)
    for (let i = 0; i < startDay; i++) {
        html += '<div class="calendar-day relative opacity-30"></div>';
    }

    // 날짜
    const today = new Date();
    const selectedDateStr = formatDate(selectedDate);

    for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(year, month, day);
        const dateStr = formatDate(date);
        const isToday = isSameDate(date, today);
        const isSelected = isSameDate(date, selectedDate);
        const hasData = attendanceRecords[dateStr] && Object.keys(attendanceRecords[dateStr]).length > 0;

        const classes = ['calendar-day', 'relative'];
        if (isToday) classes.push('today');
        if (isSelected) classes.push('selected');
        if (hasData) classes.push('has-data');

        const dayOfWeek = date.getDay();
        const textColor = (dayOfWeek === 0) ? 'text-red-500' : (dayOfWeek === 6 ? 'text-blue-500' : '');

        html += `<div class="${classes.join(' ')} ${textColor}" onclick="selectDate(new Date(${year}, ${month}, ${day}))">${day}</div>`;
    }

    grid.innerHTML = html;
}

// ========== 날짜 선택 ==========
function selectDate(date) {
    selectedDate = date;
    renderCalendar();
    renderStudentList();
}

// ========== 월 변경 ==========
function changeMonth(delta) {
    currentDate.setMonth(currentDate.getMonth() + delta);
    updateCurrentMonthDisplay();
    renderCalendar();
}

function updateCurrentMonthDisplay() {
    const display = document.getElementById('current-month');
    if (display) {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        display.textContent = `${year}년 ${month}월`;
    }
}

// ========== 학생 목록 렌더링 ==========
function renderStudentList() {
    const container = document.getElementById('student-list');
    if (!container) return;

    const dateStr = formatDate(selectedDate);
    const records = attendanceRecords[dateStr] || {};

    // 필터 적용
    let filteredStudents = [...students];
    const statusFilter = document.getElementById('status-filter')?.value;
    const searchTerm = document.getElementById('search-input')?.value?.toLowerCase();

    if (!showAllStudents) {
        // 오늘 출결 기록이 있는 학생만 표시
        filteredStudents = filteredStudents.filter(s => records[s.id]);
    }

    if (statusFilter && statusFilter !== 'all') {
        filteredStudents = filteredStudents.filter(s => {
            const record = records[s.id];
            if (!record) return false;
            return record.status === statusFilter;
        });
    }

    if (searchTerm) {
        filteredStudents = filteredStudents.filter(s =>
            s.name.toLowerCase().includes(searchTerm)
        );
    }

    if (filteredStudents.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined">person_off</span>
                <p>표시할 학생이 없습니다</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredStudents.map(student => {
        const record = records[student.id];
        const status = record?.status || 'absent';
        const checkInTime = record?.checkIn ? formatTimeDisplay(record.checkIn) : '-';
        const checkOutTime = record?.checkOut ? formatTimeDisplay(record.checkOut) : '-';

        return `
            <div class="student-row grid grid-cols-12 gap-4 px-6 py-4 border-b border-gray-100 items-center">
                <div class="col-span-3">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                            ${student.name.charAt(0)}
                        </div>
                        <div>
                            <div class="font-medium text-gray-800">${student.name}</div>
                        </div>
                    </div>
                </div>
                <div class="col-span-2 text-center">
                    ${getStatusBadge(status)}
                </div>
                <div class="col-span-2 text-center">
                    <span class="time-badge time-in">${checkInTime}</span>
                </div>
                <div class="col-span-2 text-center">
                    <span class="time-badge time-out">${checkOutTime}</span>
                </div>
                <div class="col-span-3 text-center">
                    <div class="flex justify-center gap-2">
                        <button class="action-btn btn-checkin" onclick="openCheckInModal('${student.id}', '${student.name}')">
                            <span class="material-symbols-outlined text-sm align-middle">login</span>
                            등원
                        </button>
                        <button class="action-btn btn-checkout" onclick="openCheckOutModal('${student.id}', '${student.name}')">
                            <span class="material-symbols-outlined text-sm align-middle">logout</span>
                            하원
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ========== 상태 배지 ==========
function getStatusBadge(status) {
    const badges = {
        'present': '<span class="status-badge status-present">출석</span>',
        'absent': '<span class="status-badge status-absent">결석</span>',
        'late': '<span class="status-badge status-late">지각</span>'
    };
    return badges[status] || badges['absent'];
}

// ========== 필터 ==========
function filterAttendance() {
    renderStudentList();
}

function searchStudents() {
    renderStudentList();
}

function toggleAllStudents() {
    showAllStudents = !showAllStudents;
    const toggle = document.getElementById('toggle-all-students');
    if (toggle) {
        toggle.classList.toggle('active', showAllStudents);
    }
    renderStudentList();
}

// ========== 모달 ==========
function openCheckInModal(studentId, studentName) {
    currentModalType = 'checkin';
    currentStudentId = studentId;

    const modal = document.getElementById('time-modal');
    const title = document.getElementById('modal-title');
    const nameDisplay = document.getElementById('modal-student-name');
    const hourInput = document.getElementById('modal-hour');
    const minuteInput = document.getElementById('modal-minute');

    title.textContent = '등원 시간 설정';
    nameDisplay.textContent = `${studentName} 학생의 등원 시간을 입력하세요`;

    // 현재 시간으로 초기화
    const now = new Date();
    hourInput.value = String(now.getHours()).padStart(2, '0');
    minuteInput.value = String(now.getMinutes()).padStart(2, '0');

    modal.classList.add('active');
    hourInput.focus();
    hourInput.select();
}

function openCheckOutModal(studentId, studentName) {
    currentModalType = 'checkout';
    currentStudentId = studentId;

    const modal = document.getElementById('time-modal');
    const title = document.getElementById('modal-title');
    const nameDisplay = document.getElementById('modal-student-name');
    const hourInput = document.getElementById('modal-hour');
    const minuteInput = document.getElementById('modal-minute');

    title.textContent = '하원 시간 설정';
    nameDisplay.textContent = `${studentName} 학생의 하원 시간을 입력하세요`;

    // 현재 시간으로 초기화
    const now = new Date();
    hourInput.value = String(now.getHours()).padStart(2, '0');
    minuteInput.value = String(now.getMinutes()).padStart(2, '0');

    modal.classList.add('active');
    hourInput.focus();
    hourInput.select();
}

function closeModal() {
    const modal = document.getElementById('time-modal');
    modal.classList.remove('active');
    currentModalType = null;
    currentStudentId = null;
}

async function saveTime() {
    const hourInput = document.getElementById('modal-hour');
    const minuteInput = document.getElementById('modal-minute');

    let hour = parseInt(hourInput.value);
    let minute = parseInt(minuteInput.value);

    // 유효성 검사
    if (isNaN(hour) || hour < 0 || hour > 23) {
        alert('시간을 0~23 사이로 입력해주세요');
        return;
    }
    if (isNaN(minute) || minute < 0 || minute > 59) {
        alert('분을 0~59 사이로 입력해주세요');
        return;
    }

    const dateStr = formatDate(selectedDate);
    const timeString = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const isoTime = `${dateStr}T${timeString}:00`;

    // 기존 기록 가져오기
    if (!attendanceRecords[dateStr]) {
        attendanceRecords[dateStr] = {};
    }
    if (!attendanceRecords[dateStr][currentStudentId]) {
        attendanceRecords[dateStr][currentStudentId] = {
            checkIn: null,
            checkOut: null,
            status: 'absent'
        };
    }

    const record = attendanceRecords[dateStr][currentStudentId];

    if (currentModalType === 'checkin') {
        record.checkIn = isoTime;
        // 하원 시간이 있는데 등원 시간이 나중일 경우 수정
        if (record.checkOut && new Date(isoTime) > new Date(record.checkOut)) {
            record.checkOut = null;
        }
        // 지각 판정 (10시 이후)
        record.status = hour >= 10 ? 'late' : 'present';
    } else {
        record.checkOut = isoTime;
        // 등원 시간이 있는데 하원 시간이 이를 경우 수정
        if (record.checkIn && new Date(isoTime) < new Date(record.checkIn)) {
            alert('하원 시간이 등원 시간보다 빠릅니다');
            return;
        }
        if (!record.checkIn) {
            alert('먼저 등원 시간을 입력해주세요');
            return;
        }
        record.status = hour >= 10 ? 'late' : 'present';
    }

    // 저장
    await saveAttendanceRecord(selectedDate, currentStudentId, record);

    closeModal();
    renderCalendar();
    renderStudentList();
}

// ========== 유틸리티 ==========
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatTimeDisplay(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? '오후' : '오전';
    const displayHours = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
    return `${ampm} ${displayHours}:${String(minutes).padStart(2, '0')}`;
}

function isSameDate(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
}

// ========== 키오스크 이동 ==========
function goToKiosk() {
    window.location.href = 'kiosk.html';
}

// ========== 토글 스위치 초기화 ==========
document.querySelectorAll('.toggle-switch').forEach(toggle => {
    toggle.addEventListener('click', function() {
        this.classList.toggle('active');
    });
});
