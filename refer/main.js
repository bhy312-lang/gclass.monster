// 오늘 날짜를 YYYY-MM-DD 형식으로 반환
function getTodayDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 날짜를 한국어 형식으로 포맷팅
function formatDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekday = weekdays[date.getDay()];
    return `${year}년 ${month}월 ${day}일 (${weekday})`;
}

// 날짜 비교 함수 (YYYY-MM-DD 형식)
function compareDates(date1, date2) {
    return date1 === date2;
}

// DOM 요소 가져오기
function getElements() {
    return {
        todoInput: document.getElementById('todo'),
        todoDate: document.getElementById('todo-date'),
        todoList: document.getElementById('todo-list'),
        addButton: document.getElementById('add-btn'),
        currentDateDisplay: document.getElementById('current-date'),
        datePicker: document.getElementById('date-picker'),
        seatContainer: document.getElementById('seat-container'),
        addSeatBtn: document.getElementById('add-seat-btn'),
        resetAllSeatsBtn: document.getElementById('reset-all-seats-btn'),
        clearSeatsBtn: document.getElementById('clear-seats-btn'),
        editSeatModal: document.getElementById('edit-seat-modal'),
        editSeatName: document.getElementById('edit-seat-name'),
        editSeatAlarmHour: document.getElementById('edit-seat-alarm-hour'),
        editSeatAlarmMinute: document.getElementById('edit-seat-alarm-minute'),
        editSeatSave: document.getElementById('edit-seat-save'),
        editSeatCancel: document.getElementById('edit-seat-cancel')
    };
}

// 좌석 데이터 관리
let seats = [];
let seatCounter = 1;
let alarmIntervals = {};
let alarmAudioContext = null;
let currentSeatId = null;

const SEAT_WIDTH = 160; // From CSS
const SEAT_HEIGHT = 180; // From CSS

// 마지막 초기화 날짜 확인
function getLastResetDate() {
    return localStorage.getItem('lastSeatResetDate') || null;
}

// 마지막 초기화 날짜 저장
function saveLastResetDate(date) {
    localStorage.setItem('lastSeatResetDate', date);
}

// 날짜가 바뀌었는지 확인하고 자동 초기화
function checkAndAutoResetSeats() {
    const today = getTodayDate();
    const lastResetDate = getLastResetDate();
    
    if (lastResetDate && lastResetDate !== today) {
        resetAllSeatsData();
        saveLastResetDate(today);
    } else if (!lastResetDate) {
        saveLastResetDate(today);
    }
}

// 로컬 스토리지에서 좌석 목록 불러오기
function loadSeats() {
    console.log('loadSeats called');
    let savedSeats = [];
    try {
        const storedSeats = localStorage.getItem('seats');
        if (storedSeats) {
            savedSeats = JSON.parse(storedSeats);
        }
    } catch (e) {
        console.error('Error parsing saved seats from localStorage:', e);
        // Clear corrupt data to prevent future errors
        localStorage.removeItem('seats');
        console.log('Corrupt localStorage "seats" data cleared.');
    }
    
    seats = savedSeats.map(seat => ({
        ...seat,
        x: (seat.x !== undefined && !isNaN(seat.x)) ? seat.x : 0,
        y: (seat.y !== undefined && !isNaN(seat.y)) ? seat.y : 0
    }));
    
    seatCounter = Math.max(0, ...seats.map(s => s.number || 0)) + 1;
    checkAndAutoResetSeats();
    console.log('Loaded seats:', seats);
    return seats;
}

// 로컬 스토리지에 좌석 목록 저장하기
function saveSeats() {
    console.log('saveSeats called. Seats:', seats);
    localStorage.setItem('seats', JSON.stringify(seats));
}

// 비프음 생성 및 재생
function playBeep(seatId) {
    if (!alarmAudioContext) {
        alarmAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    if (alarmIntervals[seatId]) return;

    const playSound = () => {
        const oscillator = alarmAudioContext.createOscillator();
        const gainNode = alarmAudioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(alarmAudioContext.destination);
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, alarmAudioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, alarmAudioContext.currentTime + 0.1);
        oscillator.start();
        oscillator.stop(alarmAudioContext.currentTime + 0.1);
    };

    playSound();
    alarmIntervals[seatId] = setInterval(playSound, 500);
}

// 비프음 중지
function stopBeep(seatId) {
    if (alarmIntervals[seatId]) {
        clearInterval(alarmIntervals[seatId]);
        delete alarmIntervals[seatId];
    }
}

// 알람 중지
function stopAlarm(seatId) {
    const seat = seats.find(s => s.id === seatId);
    if (seat) {
        stopBeep(seatId);
        seat.alarming = false;
        seat.alarmStopped = true;
        saveSeats();
        renderSeats();
        const modal = document.getElementById('alarm-modal');
        if (modal) modal.classList.remove('active');
    }
}

// 알람 체크 및 실행
function checkAlarms() {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
    seats.forEach(seat => {
        if (seat.alarmTime && seat.alarmTime === currentTime && !seat.alarming && !seat.alarmStopped) {
            seat.alarming = true;
            saveSeats();
            updateSeatDisplay(seat.id);
            playBeep(seat.id);
            showAlarmModal(seat);
        }
    });
}

// 알람 모달 표시
function showAlarmModal(seat) {
    let modal = document.getElementById('alarm-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'alarm-modal';
        modal.className = 'alarm-modal';
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                const currentSeatId = parseInt(modal.dataset.seatId);
                if (currentSeatId) stopAlarm(currentSeatId);
            }
        });
    }
    
    modal.dataset.seatId = seat.id;
    modal.innerHTML = `
        <div class="alarm-modal-content">
            <h3>⏰ 알람</h3>
            <p>좌석 ${seat.number}번${seat.name ? ` (${seat.name})` : ''} 알람이 울렸습니다!</p>
            <button class="alarm-stop-btn">알람 중지</button>
        </div>
    `;

    modal.querySelector('.alarm-stop-btn').addEventListener('click', () => stopAlarm(seat.id));
    modal.classList.add('active');
}

// 좌석 표시 업데이트
function updateSeatDisplay(seatId) {
    const seatElement = document.querySelector(`[data-seat-id="${seatId}"]`);
    if (!seatElement) return;
    
    const seat = seats.find(s => s.id === seatId);
    if (!seat) return;
    
    seatElement.style.left = seat.x + 'px';
    seatElement.style.top = seat.y + 'px';
    
    if (seat.alarming) {
        seatElement.classList.add('alarming');
    } else {
        seatElement.classList.remove('alarming');
    }
    
    const alarmTimeDisplay = seatElement.querySelector('.seat-alarm-time');
    if (alarmTimeDisplay) {
        alarmTimeDisplay.textContent = seat.alarmTime || '알람 없음';
    }
}

// 좌석 렌더링
function renderSeats() {
    console.log('renderSeats called. Current seats:', seats);
    const { seatContainer } = getElements();
    if (!seatContainer) return;
    
    seatContainer.innerHTML = '';
    
    seats.forEach(seat => {
        const seatElement = document.createElement('div');
        seatElement.className = 'seat';
        if (seat.alarming) seatElement.classList.add('alarming');
        seatElement.dataset.seatId = seat.id;
        
        const x = (seat.x !== undefined && !isNaN(seat.x)) ? seat.x : 0;
        const y = (seat.y !== undefined && !isNaN(seat.y)) ? seat.y : 0;
        
        seatElement.style.left = x + 'px';
        seatElement.style.top = y + 'px';
        
        const timeRemaining = calculateTimeRemaining(seat.alarmTime);
        const timeRemainingText = formatTimeRemaining(timeRemaining);
        
        let stopAlarmButtonHTML = '';
        if (seat.alarming) {
            stopAlarmButtonHTML = `<button class="seat-control-btn stop-alarm">알람 중지</button>`;
        }

        seatElement.innerHTML = `
            <div class="seat-number">${seat.number}번</div>
            <div class="seat-name">${seat.name || '이름 없음'}</div>
            <div class="seat-alarm-time">${seat.alarmTime || '알람 없음'}</div>
            ${seat.alarmTime ? `<div class="seat-time-remaining">${timeRemainingText}</div>` : ''}
            <div class="seat-controls-panel">
                <button class="seat-control-btn settings">설정</button>
                ${stopAlarmButtonHTML}
                <button class="seat-control-btn reset">초기화</button>
                <button class="seat-control-btn delete">삭제</button>
            </div>
        `;
        
        // Add event listeners
        seatElement.querySelector('.settings').addEventListener('click', () => openEditSeatModal(seat.id));
        seatElement.querySelector('.reset').addEventListener('click', () => resetSeat(seat.id));
        seatElement.querySelector('.delete').addEventListener('click', () => deleteSeat(seat.id));
        
        if (seat.alarming) {
            seatElement.querySelector('.stop-alarm').addEventListener('click', () => stopAlarm(seat.id));
        }

        makeSeatDraggable(seatElement, seat.id);
        seatContainer.appendChild(seatElement);
    });
}

// 남은 시간 업데이트
function updateTimeRemaining() {
    seats.forEach(seat => {
        if (!seat.alarmTime) return;
        const seatElement = document.querySelector(`[data-seat-id="${seat.id}"]`);
        if (!seatElement) return;
        const timeRemainingElement = seatElement.querySelector('.seat-time-remaining');
        if (!timeRemainingElement) return;
        
        const timeRemaining = calculateTimeRemaining(seat.alarmTime);
        timeRemainingElement.textContent = formatTimeRemaining(timeRemaining);
        
        if (timeRemaining && timeRemaining.totalSeconds <= 60) {
            timeRemainingElement.classList.add('time-warning');
        } else {
            timeRemainingElement.classList.remove('time-warning');
        }
    });
}

// 좌석 드래그 앤 드롭 기능
function makeSeatDraggable(seatElement, seatId) {
    let isDragging = false;
    let initialX, initialY;
    
    seatElement.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('seat-control-btn')) return;
        isDragging = true;
        seatElement.classList.add('dragging');
        const rect = seatElement.getBoundingClientRect();
        initialX = e.clientX - rect.left;
        initialY = e.clientY - rect.top;
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const container = seatElement.parentElement;
        let newX = e.clientX - initialX - container.getBoundingClientRect().left;
        let newY = e.clientY - initialY - container.getBoundingClientRect().top;

        newX = Math.max(0, Math.min(newX, container.offsetWidth - seatElement.offsetWidth));
        newY = Math.max(0, Math.min(newY, container.offsetHeight - seatElement.offsetHeight));
        
        seatElement.style.left = newX + 'px';
        seatElement.style.top = newY + 'px';
    });
    
    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            seatElement.classList.remove('dragging');
            const seat = seats.find(s => s.id === seatId);
            if (seat) {
                seat.x = parseInt(seatElement.style.left) || 0;
                seat.y = parseInt(seatElement.style.top) || 0;
                saveSeats();
            }
        }
    });
}

// 남은 시간 계산
function calculateTimeRemaining(alarmTime) {
    if (!alarmTime) return null;
    const now = new Date();
    // alarmTime is now in "HH:mm" format
    const [hours, minutes] = alarmTime.split(':').map(Number);
    const alarmDate = new Date();
    alarmDate.setHours(hours, minutes, 0, 0); // Set seconds to 0
    if (alarmDate < now) alarmDate.setDate(alarmDate.getDate() + 1);
    const diff = alarmDate - now;
    if (diff <= 0) return null;
    const totalSeconds = Math.floor(diff / 1000);
    return {
        hours: Math.floor(totalSeconds / 3600),
        minutes: Math.floor((totalSeconds % 3600) / 60),
        seconds: totalSeconds % 60,
        totalSeconds
    };
}

// 남은 시간 포맷팅
function formatTimeRemaining(timeRemaining) {
    if (!timeRemaining || timeRemaining.totalSeconds <= 0) return '시간 도래';
    const h = String(timeRemaining.hours).padStart(2, '0');
    const m = String(timeRemaining.minutes).padStart(2, '0');
    const s = String(timeRemaining.seconds).padStart(2, '0');

    if (timeRemaining.hours === 0 && timeRemaining.minutes === 0) {
        return `${s}초`;
    } else if (timeRemaining.hours === 0) {
        return `${m}분 ${s}초`;
    } else {
        return `${h}시간 ${m}분 ${s}초`;
    }
}

// 좌석 추가
function addSeat() {
    console.log('addSeat called');
    const { seatContainer } = getElements();
    if (!seatContainer) {
        console.error('seatContainer not found!');
        return;
    }

    // Find the lowest available seat number
    const existingSeatNumbers = seats.map(s => s.number).sort((a, b) => a - b);
    let newSeatNumber = 1;
    for (let i = 0; i < existingSeatNumbers.length; i++) {
        if (existingSeatNumbers[i] === newSeatNumber) {
            newSeatNumber++;
        } else if (existingSeatNumbers[i] > newSeatNumber) {
            break; // Found a gap
        }
    }

    // Find a non-overlapping position
    let newX = 10;
    let newY = 10;
    let foundPosition = false;

    const containerRect = seatContainer.getBoundingClientRect();
    const maxCols = Math.floor(containerRect.width / SEAT_WIDTH);
    const maxRows = Math.floor(containerRect.height / SEAT_HEIGHT);

    for (let row = 0; row < maxRows; row++) {
        for (let col = 0; col < maxCols; col++) {
            let potentialX = 10 + col * SEAT_WIDTH;
            let potentialY = 10 + row * SEAT_HEIGHT;

            // Check if this potential position overlaps with any existing seat
            let overlap = false;
            for (const existingSeat of seats) {
                if (isOverlapping(potentialX, potentialY, SEAT_WIDTH, SEAT_HEIGHT, existingSeat.x, existingSeat.y, SEAT_WIDTH, SEAT_HEIGHT)) {
                    overlap = true;
                    break;
                }
            }

            if (!overlap) {
                newX = potentialX;
                newY = potentialY;
                foundPosition = true;
                break;
            }
        }
        if (foundPosition) break;
    }

    if (!foundPosition) {
        console.warn('No non-overlapping position found within the container, placing at default (10,10).');
        newX = 10;
        newY = 10;
    }
    
    const newSeat = {
        id: Date.now(),
        number: newSeatNumber, // Use the found lowest available number
        name: '',
        x: newX,
        y: newY,
        alarmTime: null,
        alarming: false,
        alarmStopped: false
    };
    
    seats.push(newSeat);
    console.log('New seat added:', newSeat);
    saveSeats();
    renderSeats();
    // Re-calculate seatCounter to be max_number + 1 for future additions if needed
    seatCounter = Math.max(0, ...seats.map(s => s.number || 0)) + 1;
}

// 두 좌석이 겹치는지 확인하는 헬퍼 함수
function isOverlapping(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x1 < x2 + w2 &&
           x1 + w1 > x2 &&
           y1 < y2 + h2 &&
           y1 + h1 > y2;
}

// 좌석 삭제
function deleteSeat(seatId) {
    if (confirm('이 좌석을 삭제하시겠습니까?')) {
        stopAlarm(seatId);
        seats = seats.filter(s => s.id !== seatId);
        saveSeats();
        renderSeats();
    }
}

// 좌석 초기화
function resetSeat(seatId) {
    const seat = seats.find(s => s.id === seatId);
    if (seat && confirm(`좌석 ${seat.number}번을 초기화하시겠습니까?`)) {
        stopBeep(seatId);
        seat.name = '';
        seat.alarmTime = null;
        seat.alarming = false;
        seat.alarmStopped = false;
        saveSeats();
        renderSeats();
    }
}

// 모든 좌석 데이터 초기화
function resetAllSeatsData() {
    seats.forEach(seat => {
        stopBeep(seat.id);
        seat.name = '';
        seat.alarmTime = null;
        seat.alarming = false;
        seat.alarmStopped = false;
    });
    saveSeats();
    renderSeats();
}

// 모든 좌석 초기화 (수동)
function resetAllSeats() {
    if (confirm('모든 좌석의 정보를 초기화하시겠습니까?')) {
        resetAllSeatsData();
        alert('모든 좌석이 초기화되었습니다.');
    }
}

// 모든 좌석 삭제
function clearAllSeats() {
    if (confirm('모든 좌석을 삭제하시겠습니까?')) {
        seats.forEach(seat => stopAlarm(seat.id));
        seats = [];
        seatCounter = 1;
        saveSeats();
        renderSeats();
    }
}

// 로컬 스토리지에서 할 일 목록 불러오기
function loadTodos() {
    return JSON.parse(localStorage.getItem('todos')) || [];
}

// 로컬 스토리지에 할 일 목록 저장하기
function saveTodos(todos) {
    localStorage.setItem('todos', JSON.stringify(todos));
}

// 할 일 목록 렌더링
function renderTodos(selectedDate = null) {
    const { todoList, currentDateDisplay } = getElements();
    const todos = loadTodos();
    const targetDate = selectedDate || getTodayDate();
    
    if (currentDateDisplay) {
        currentDateDisplay.textContent = formatDate(targetDate);
    }
    
    todoList.innerHTML = '';
    const filteredTodos = todos.filter(todo => compareDates(todo.date, targetDate));
    
    if (filteredTodos.length === 0) {
        const emptyMsg = document.createElement('li');
        emptyMsg.className = 'empty-state';
        emptyMsg.textContent = '할 일이 없습니다.';
        todoList.appendChild(emptyMsg);
        return;
    }
    
    filteredTodos.sort((a, b) => a.completed - b.completed || b.id - a.id).forEach(todo => {
        const li = document.createElement('li');
        li.className = todo.completed ? 'completed' : '';
        li.dataset.id = todo.id;
        li.innerHTML = `
            <input type="checkbox" ${todo.completed ? 'checked' : ''}>
            <span class="todo-text">${todo.text}</span>
            <button class="delete-btn">삭제</button>
        `;
        li.querySelector('input[type="checkbox"]').addEventListener('change', () => toggleTodo(todo.id));
        li.querySelector('.delete-btn').addEventListener('click', () => deleteTodo(todo.id));
        todoList.appendChild(li);
    });
}

// 할 일 추가
function addtodo() {
    const { todoInput, todoDate, datePicker } = getElements();
    const text = todoInput.value.trim();
    const date = todoDate.value;
    
    if (!text || !date) {
        alert('할 일과 날짜를 모두 입력해 주세요.');
        return;
    }
    
    const todos = loadTodos();
    todos.push({ id: Date.now(), text, date, completed: false });
    saveTodos(todos);
    todoInput.value = '';
    renderTodos(datePicker.value);
}

// 할 일 완료/미완료 토글
function toggleTodo(id) {
    const todos = loadTodos();
    const todo = todos.find(t => t.id === id);
    if (todo) {
        todo.completed = !todo.completed;
        saveTodos(todos);
        renderTodos(getElements().datePicker.value);
    }
}

// 할 일 삭제
function deleteTodo(id) {
    if (confirm('정말 삭제하시겠습니까?')) {
        let todos = loadTodos();
        todos = todos.filter(t => t.id !== id);
        saveTodos(todos);
        renderTodos(getElements().datePicker.value);
    }
}

// 좌석 설정 모달 열기
function openEditSeatModal(seatId) {
    const { editSeatModal, editSeatName, editSeatAlarmHour, editSeatAlarmMinute } = getElements();
    const seat = seats.find(s => s.id === seatId);
    if (!seat) return;

    currentSeatId = seatId;
    editSeatName.value = seat.name || '';
    
    if (seat.alarmTime) {
        const [h, m] = seat.alarmTime.split(':');
        editSeatAlarmHour.value = h;
        editSeatAlarmMinute.value = m;
    } else {
        editSeatAlarmHour.value = '';
        editSeatAlarmMinute.value = '';
    }
    
    editSeatModal.classList.add('active');
    editSeatName.focus(); // Set focus to the name input
}

// 좌석 설정 저장
function saveSeatSettings() {
    const { editSeatModal, editSeatName, editSeatAlarmHour, editSeatAlarmMinute } = getElements();
    const seat = seats.find(s => s.id === currentSeatId);
    if (!seat) return;

    seat.name = editSeatName.value.trim();
    
    const hour = parseInt(editSeatAlarmHour.value);
    const minute = parseInt(editSeatAlarmMinute.value);

    // Basic validation: Check if they are valid numbers and within range
    if (
        !isNaN(hour) && hour >= 0 && hour <= 23 &&
        !isNaN(minute) && minute >= 0 && minute <= 59
    ) {
        seat.alarmTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    } else {
        seat.alarmTime = null; // Clear alarm if inputs are invalid or empty
    }
    
    seat.alarming = false;
    seat.alarmStopped = false;
    stopBeep(currentSeatId);
    saveSeats();
    renderSeats();
    editSeatModal.classList.remove('active');
    currentSeatId = null;
}

// 좌석 설정 취소
function cancelSeatSettings() {
    const { editSeatModal } = getElements();
    editSeatModal.classList.remove('active');
    currentSeatId = null;
}

// 초기화 함수
function init() {
    const { todoInput, todoDate, addButton, datePicker, addSeatBtn, resetAllSeatsBtn, clearSeatsBtn, editSeatSave, editSeatCancel } = getElements();
    const kioskButton = document.getElementById('kiosk-button');
    
    todoDate.value = getTodayDate();
    datePicker.value = getTodayDate();
    
    addButton.addEventListener('click', addtodo);
    todoInput.addEventListener('keypress', (e) => e.key === 'Enter' && addtodo());
    datePicker.addEventListener('change', () => renderTodos(datePicker.value));
    
    addSeatBtn.addEventListener('click', addSeat);
    resetAllSeatsBtn.addEventListener('click', resetAllSeats);
    clearSeatsBtn.addEventListener('click', clearAllSeats);
    
    editSeatSave.addEventListener('click', saveSeatSettings);
    editSeatCancel.addEventListener('click', cancelSeatSettings);

    const { editSeatModal } = getElements(); // Get modal element here for the event listener
    editSeatModal.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent default form submission
            saveSeatSettings();
        }
    });

    if (kioskButton) {
        kioskButton.addEventListener('click', () => {
            window.location.href = 'kiosk.html';
        });
    }

    loadSeats();
    renderSeats();
    renderTodos(getTodayDate());
    
    setInterval(checkAlarms, 1000);
    setInterval(updateTimeRemaining, 1000);
}

// DOM 로드 후 초기화
document.addEventListener('DOMContentLoaded', init);

