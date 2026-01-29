// ========== 좌석 모니터링 시스템 ==========
let seats = [];
let seatCounter = 1;
let alarmIntervals = {};
let currentSeatId = null;

const SEAT_WIDTH = 96; // w-24 = 96px
const SEAT_HEIGHT = 112; // h-28 = 112px

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
        console.error('Error parsing saved seats:', e);
        localStorage.removeItem('seats');
    }
    
    seats = savedSeats.map(seat => ({
        ...seat,
        x: (seat.x !== undefined && !isNaN(seat.x)) ? seat.x : 0,
        y: (seat.y !== undefined && !isNaN(seat.y)) ? seat.y : 0
    }));
    
    seatCounter = Math.max(0, ...seats.map(s => s.number || 0)) + 1;
    console.log('Loaded seats:', seats);
    return seats;
}

// 로컬 스토리지에 좌석 목록 저장하기
function saveSeats() {
    console.log('saveSeats called. Seats:', seats);
    localStorage.setItem('seats', JSON.stringify(seats));
}

// 좌석 렌더링
function renderSeats() {
    console.log('=== renderSeats 함수 시작 ===');
    console.log('렌더링할 좌석 수:', seats.length);
    console.log('seats 배열:', seats);
    
    const container = document.getElementById('seat-container');
    console.log('seat-container 요소:', !!container);
    
    if (!container) {
        console.error('❌ seat-container를 찾을 수 없습니다');
        return;
    }
    
    container.innerHTML = '';
    console.log('✓ 컨테이너 내용 초기화됨');
    
    if (seats.length === 0) {
        console.log('⚠️ 렌더링할 좌석이 없습니다');
        return;
    }
    
    seats.forEach((seat, index) => {
        console.log(`좌석 ${index} 렌더링:`, seat);
        
        const seatDiv = document.createElement('div');
        seatDiv.id = 'seat-' + seat.id;
        seatDiv.className = `absolute w-24 h-28 rounded-2xl flex flex-col items-center justify-center text-white font-bold text-sm shadow-lg cursor-move transition-all overflow-hidden`;
        seatDiv.dataset.seatId = seat.id;
        
        // 상태에 따라 색상 변경
        if (seat.occupied) {
            seatDiv.classList.add('bg-gradient-to-br', 'from-red-400', 'to-red-500');
        } else {
            seatDiv.classList.add('bg-gradient-to-br', 'from-emerald-400', 'to-emerald-500');
        }
        
        const x = (seat.x !== undefined && !isNaN(seat.x)) ? seat.x : 0;
        const y = (seat.y !== undefined && !isNaN(seat.y)) ? seat.y : 0;
        
        seatDiv.style.left = x + 'px';
        seatDiv.style.top = y + 'px';
        seatDiv.style.userSelect = 'none';
        
        seatDiv.innerHTML = `
            <div class="text-lg font-bold">좌석 ${seat.number}</div>
            ${seat.name ? `<div class="text-xs mt-1">${seat.name}</div>` : ''}
            ${seat.alarmTime ? `<div class="text-xs text-yellow-200 mt-1">⏰ ${seat.alarmTime}</div>` : ''}
        `;
        
        // 더블클릭: 편집
        seatDiv.addEventListener('dblclick', (e) => {
            console.log('좌석 더블클릭:', seat.id);
            e.stopPropagation();
            openEditSeatModal(seat.id);
        });
        
        // 마우스 다운: 드래그 시작
        seatDiv.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            console.log('좌석 드래그 시작:', seat.id);
            e.preventDefault();
            makeSeatDraggable(seatDiv, seat.id);
        });
        
        container.appendChild(seatDiv);
        console.log('✓ 좌석' + seat.number + '번 DOM에 추가됨');
    });
    
    console.log('✓ renderSeats 함수 완료. 총 ' + seats.length + '개 좌석 렌더링됨');
}

// 좌석 드래그 앤 드롭 기능
function makeSeatDraggable(seatElement, seatId) {
    let isDragging = true;
    const rect = seatElement.getBoundingClientRect();
    const containerRect = seatElement.parentElement.getBoundingClientRect();
    const initialX = rect.left - containerRect.left;
    const initialY = rect.top - containerRect.top;
    
    function handleMouseMove(e) {
        if (!isDragging) return;
        
        const container = seatElement.parentElement;
        let newX = e.clientX - containerRect.left - (rect.width / 2);
        let newY = e.clientY - containerRect.top - (rect.height / 2);

        // 경계 검사
        newX = Math.max(0, Math.min(newX, container.offsetWidth - SEAT_WIDTH));
        newY = Math.max(0, Math.min(newY, container.offsetHeight - SEAT_HEIGHT));
        
        seatElement.style.left = newX + 'px';
        seatElement.style.top = newY + 'px';
    }
    
    function handleMouseUp() {
        if (isDragging) {
            isDragging = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            
            const seat = seats.find(s => s.id === seatId);
            if (seat) {
                seat.x = parseInt(seatElement.style.left) || 0;
                seat.y = parseInt(seatElement.style.top) || 0;
                saveSeats();
            }
        }
    }
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}

// 좌석 추가
function addSeat() {
    console.log('=== addSeat 함수 시작 ===');
    console.log('현재 좌석 수:', seats.length);
    console.log('seats 배열:', seats);
    
    const container = document.getElementById('seat-container');
    console.log('seat-container 찾음:', !!container);
    
    if (!container) {
        console.error('❌ seat-container를 찾을 수 없습니다');
        return;
    }

    // 가장 낮은 사용 가능한 좌석 번호 찾기
    const existingSeatNumbers = seats.map(s => s.number).sort((a, b) => a - b);
    let newSeatNumber = 1;
    for (let i = 0; i < existingSeatNumbers.length; i++) {
        if (existingSeatNumbers[i] === newSeatNumber) {
            newSeatNumber++;
        } else if (existingSeatNumbers[i] > newSeatNumber) {
            break;
        }
    }
    
    console.log('새 좌석 번호:', newSeatNumber);

    // 겹치지 않는 위치 찾기
    let newX = 10;
    let newY = 10;
    let foundPosition = false;

    const containerRect = container.getBoundingClientRect();
    console.log('컨테이너 크기:', containerRect.width, 'x', containerRect.height);
    
    const maxCols = Math.floor(containerRect.width / SEAT_WIDTH);
    const maxRows = Math.floor(containerRect.height / SEAT_HEIGHT);
    console.log('최대 행/열:', maxRows, 'x', maxCols);

    for (let row = 0; row < maxRows; row++) {
        for (let col = 0; col < maxCols; col++) {
            let potentialX = 10 + col * SEAT_WIDTH;
            let potentialY = 10 + row * SEAT_HEIGHT;

            // 기존 좌석과 겹치는지 확인
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
                console.log('✓ 위치 찾음:', newX, newY);
                break;
            }
        }
        if (foundPosition) break;
    }

    if (!foundPosition) {
        console.warn('⚠️ 겹치지 않는 위치를 찾을 수 없어 기본 위치 (10,10)에 배치합니다');
        newX = 10;
        newY = 10;
    }
    
    const newSeat = {
        id: Date.now(),
        number: newSeatNumber,
        name: '',
        x: newX,
        y: newY,
        occupied: false,
        alarmTime: null,
        alarming: false,
        alarmStopped: false
    };
    
    console.log('✓ 새 좌석 객체 생성:', newSeat);
    seats.push(newSeat);
    console.log('✓ seats 배열에 추가됨. 현재 좌석 수:', seats.length);
    
    saveSeats();
    console.log('✓ localStorage에 저장됨');
    
    renderSeats();
    console.log('✓ renderSeats() 호출됨');
    
    seatCounter = Math.max(0, ...seats.map(s => s.number || 0)) + 1;
    console.log('=== addSeat 함수 완료 ===');
}

// 두 좌석이 겹치는지 확인
function isOverlapping(x1, y1, w1, h1, x2, y2, w2, h2) {
    return x1 < x2 + w2 &&
           x1 + w1 > x2 &&
           y1 < y2 + h2 &&
           y1 + h1 > y2;
}

// 좌석 설정 모달 열기
function openEditSeatModal(seatId) {
    const modal = document.getElementById('edit-seat-modal');
    const modalContent = modal.querySelector('div');
    const nameInput = document.getElementById('edit-seat-name');
    const hourInput = document.getElementById('edit-seat-alarm-hour');
    const minuteInput = document.getElementById('edit-seat-alarm-minute');
    
    const seat = seats.find(s => s.id === seatId);
    if (!seat) return;

    currentSeatId = seatId;
    nameInput.value = seat.name || '';
    
    if (seat.alarmTime) {
        const [h, m] = seat.alarmTime.split(':');
        hourInput.value = h;
        minuteInput.value = m;
    } else {
        hourInput.value = '';
        minuteInput.value = '';
    }
    
    modal.style.display = 'flex';
    modalContent.style.display = 'block';
    nameInput.focus();
}

// 좌석 설정 저장
function saveSeatSettings() {
    const modal = document.getElementById('edit-seat-modal');
    const modalContent = modal.querySelector('div');
    const nameInput = document.getElementById('edit-seat-name');
    const hourInput = document.getElementById('edit-seat-alarm-hour');
    const minuteInput = document.getElementById('edit-seat-alarm-minute');
    
    const seat = seats.find(s => s.id === currentSeatId);
    if (!seat) return;

    seat.name = nameInput.value.trim();
    
    const hour = parseInt(hourInput.value);
    const minute = parseInt(minuteInput.value);

    if (!isNaN(hour) && hour >= 0 && hour <= 23 && !isNaN(minute) && minute >= 0 && minute <= 59) {
        seat.alarmTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    } else {
        seat.alarmTime = null;
    }
    
    saveSeats();
    renderSeats();
    modal.style.display = 'none';
    modalContent.style.display = 'none';
    currentSeatId = null;
}

// 좌석 설정 취소
function cancelSeatSettings() {
    const modal = document.getElementById('edit-seat-modal');
    const modalContent = modal.querySelector('div');
    modal.style.display = 'none';
    modalContent.style.display = 'none';
    currentSeatId = null;
}

// 모든 좌석 초기화 (상태 초기화)
function resetAllSeats() {
    if (!confirm('모든 좌석의 정보를 초기화하시겠습니까?')) return;
    
    seats.forEach(seat => {
        seat.occupied = false;
        seat.name = '';
        seat.alarmTime = null;
        seat.alarming = false;
        seat.alarmStopped = false;
    });
    
    saveSeats();
    renderSeats();
    alert('모든 좌석이 초기화되었습니다.');
}

// 모든 좌석 삭제
function clearAllSeats() {
    if (!confirm('모든 좌석을 삭제하시겠습니까?')) return;
    
    seats = [];
    seatCounter = 1;
    saveSeats();
    renderSeats();
}

// ========== 탭 전환 ==========
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    window.scrollTo(0, 0);
}

// ========== 출결 현황 ==========
const students = [
    { name: "김민준", status: "등원중", time: "14:20", id: 1 },
    { name: "이서윤", status: "등원중", time: "14:45", id: 2 },
    { name: "박하준", status: "하원", time: "16:10", id: 3 },
    { name: "최지우", status: "등원중", time: "15:05", id: 4 },
    { name: "정우진", status: "하원", time: "15:50", id: 5 },
    { name: "유나", status: "등원중", time: "15:30", id: 6 }
];

function renderAttendance() {
    const list = document.getElementById('attendanceList');
    if (!list) return;
    
    list.innerHTML = students.map(s => `
        <div class="bg-gray-50 p-6 rounded-3xl flex justify-between items-center">
            <div>
                <div class="flex items-center gap-2 mb-1">
                    <span class="font-bold text-lg">${s.name}</span>
                    <span class="text-[10px] px-2 py-0.5 ${s.status === '등원중' ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-200 text-gray-500'} rounded-full font-bold">학생</span>
                </div>
                <p class="text-xs text-gray-400">${s.status} 시각: ${s.time}</p>
            </div>
            <button class="bg-white p-2 rounded-2xl shadow-sm text-gray-400 hover:text-[#58d3d3]">
                <span class="material-symbols-outlined">more_vert</span>
            </button>
        </div>
    `).join('');
}

// ========== 지도 ==========
async function initMap() {
    try {
        const { Map, InfoWindow } = await google.maps.importLibrary("maps");
        const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");
        
        const pos = { lat: 37.498, lng: 127.060 };
        const map = new Map(document.getElementById("map"), {
            center: pos,
            zoom: 16,
            mapId: 'DEMO_MAP_ID',
            disableDefaultUI: true,
            gestureHandling: 'greedy'
        });

        const pin = new PinElement({
            glyph: "🏫",
            scale: 1.5,
            background: "#58d3d3",
            borderColor: "#33b1b1",
        });

        const marker = new AdvancedMarkerElement({
            map,
            position: pos,
            content: pin.element,
            title: "꿈터공부방"
        });

        const header = document.createElement('span');
        header.textContent = "꿈터공부방 대치본점";
        header.style.fontWeight = 'bold';
        
        const content = document.createElement('div');
        content.innerHTML = "<p style='margin-top:5px;'>복잡한 학원관리, 출결톡이 쉽고 간단하게!</p>";

        const infoWindow = new InfoWindow({
            headerContent: header,
            content: content
        });

        marker.addListener('click', () => {
            infoWindow.open(map, marker);
        });

    } catch (e) { 
        console.log("Map failed to load", e); 
    }
}

// ========== 초기화 ==========
document.addEventListener('DOMContentLoaded', () => {
    console.log('%c=== DOMContentLoaded 이벤트 발생 ===', 'color: blue; font-weight: bold; font-size: 14px;');
    
    // DOM 요소 확인
    const seatContainer = document.getElementById('seat-container');
    console.log('✓ seat-container 존재:', !!seatContainer);
    if (seatContainer) {
        console.log('  - 크기:', seatContainer.offsetWidth, 'x', seatContainer.offsetHeight);
        console.log('  - 클래스:', seatContainer.className);
    }
    
    const addSeatBtn = document.querySelector('button[onclick*="addSeat"]');
    console.log('✓ addSeat 버튼 존재:', !!addSeatBtn);
    
    // 함수 확인
    console.log('✓ addSeat 함수:', typeof addSeat === 'function' ? '✓ 존재' : '❌ 없음');
    console.log('✓ renderSeats 함수:', typeof renderSeats === 'function' ? '✓ 존재' : '❌ 없음');
    console.log('✓ loadSeats 함수:', typeof loadSeats === 'function' ? '✓ 존재' : '❌ 없음');
    
    // 모달 제어
    const modal = document.getElementById('edit-seat-modal');
    console.log('✓ edit-seat-modal 존재:', !!modal);
    
    if (modal) {
        const modalContent = modal.querySelector('div');
        console.log('  - modalContent:', !!modalContent);
        
        // 모달 외부 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal && modalContent) {
                console.log('모달 외부 클릭 - 닫는중...');
                modal.style.display = 'none';
                modalContent.style.display = 'none';
            }
        });
        
        // 모달에서 엔터 키 입력 시 저장
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                console.log('모달에서 엔터 - 저장중...');
                e.preventDefault();
                saveSeatSettings();
            }
        });
    }
    
    console.log('좌석 시스템 초기화 시작...');
    renderAttendance();
    loadSeats();
    console.log('로드된 좌석:', seats);
    renderSeats();
    console.log('%c=== 초기화 완료 ===', 'color: green; font-weight: bold; font-size: 14px;');
});
