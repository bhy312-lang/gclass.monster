// ========== 좌석 모니터링 시스템 (Supabase 연동) ==========
let seats = [];
let checkInList = []; // 등원 목록
let seatCounter = 1;
let alarmIntervals = {};
let currentSeatId = null;
let useSupabase = false; // Supabase 사용 여부

// XSS 방지를 위한 HTML 이스케이프 함수
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

const SEAT_WIDTH = 96;
const SEAT_HEIGHT = 112;

// ========== Supabase 초기화 ==========
async function initSupabase() {
    if (typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()) {
        useSupabase = true;
        console.log('✓ Supabase 연동 모드');

        // 실시간 구독 설정
        setupRealtimeSubscriptions();

        // 인증 상태 확인
        await checkAuthStatus();
    } else {
        useSupabase = false;
        console.log('⚠️ localStorage 모드 (Supabase 미설정)');
    }
}

// 인증 상태 확인
async function checkAuthStatus() {
    if (!useSupabase) return;

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single();

            updateAuthUI(profile);
        }
    } catch (error) {
        console.error('인증 상태 확인 실패:', error);
    }
}

// 인증 UI 업데이트
function updateAuthUI(profile) {
    const loginBtn = document.getElementById('login-btn');
    const userInfo = document.getElementById('user-info');
    const userName = document.getElementById('user-name');
    const logoutBtn = document.getElementById('logout-btn');

    if (profile) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (userInfo) userInfo.classList.remove('hidden');
        if (userInfo) userInfo.classList.add('flex');
        if (userName) userName.textContent = profile.name || profile.email;
        if (logoutBtn) logoutBtn.onclick = async () => {
            await supabase.auth.signOut();
            window.location.reload();
        };
    }
}

// 실시간 구독 설정
function setupRealtimeSubscriptions() {
    if (!useSupabase) return;

    // 등원 목록 실시간 구독
    supabase
        .channel('attendance-changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'attendance'
        }, (payload) => {
            console.log('등원 목록 변경:', payload);
            loadCheckInList();
        })
        .subscribe();

    // 좌석 실시간 구독
    supabase
        .channel('seats-changes')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'seats'
        }, (payload) => {
            console.log('좌석 변경:', payload);
            loadSeats();
        })
        .subscribe();
}

// ========== 좌석 로드/저장 ==========
async function loadSeats() {
    console.log('loadSeats called');

    if (useSupabase) {
        try {
            const { data, error } = await supabase
                .from('seats')
                .select('*')
                .order('number', { ascending: true });

            if (error) throw error;

            seats = (data || []).map(seat => ({
                id: seat.id,
                number: seat.number,
                name: seat.student_name || '',
                x: seat.x || 0,
                y: seat.y || 0,
                occupied: seat.occupied || false,
                alarmTime: seat.alarm_time ? formatTimeFromISO(seat.alarm_time) : null,
                alarming: seat.alarming || false,
                alarmStopped: seat.alarm_stopped || false
            }));
        } catch (error) {
            console.error('좌석 로드 실패:', error);
            loadSeatsFromLocalStorage();
        }
    } else {
        loadSeatsFromLocalStorage();
    }

    seatCounter = Math.max(0, ...seats.map(s => s.number || 0)) + 1;
    console.log('Loaded seats:', seats);
    renderSeats();
    return seats;
}

function loadSeatsFromLocalStorage() {
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
}

async function saveSeats() {
    console.log('saveSeats called. Seats:', seats);

    if (useSupabase) {
        // Supabase에서는 개별 업데이트로 처리
        // 전체 저장은 필요시에만
    } else {
        localStorage.setItem('seats', JSON.stringify(seats));
    }
}

async function saveSeatToSupabase(seat) {
    if (!useSupabase) return;

    try {
        const seatData = {
            id: String(seat.id),
            number: seat.number,
            x: seat.x,
            y: seat.y,
            occupied: seat.occupied,
            student_name: seat.name || null,
            alarm_time: seat.alarmTime ? formatTimeToISO(seat.alarmTime) : null,
            alarming: seat.alarming,
            alarm_stopped: seat.alarmStopped
        };

        const { error } = await supabase
            .from('seats')
            .upsert(seatData);

        if (error) throw error;
    } catch (error) {
        console.error('좌석 저장 실패:', error);
    }
}

// ========== 등원 목록 로드/렌더링 ==========
async function loadCheckInList() {
    if (!useSupabase) {
        renderCheckInList([]);
        return;
    }

    try {
        const { data, error } = await supabase
            .from('attendance')
            .select('*')
            .eq('status', 'waiting')
            .order('check_in_time', { ascending: true });

        if (error) throw error;

        checkInList = data || [];
        renderCheckInList(checkInList);
    } catch (error) {
        console.error('등원 목록 로드 실패:', error);
        renderCheckInList([]);
    }
}

function renderCheckInList(list) {
    const container = document.getElementById('check-in-list');
    if (!container) return;

    if (!list || list.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-400 text-sm py-8">
                <span class="material-symbols-outlined text-4xl mb-2 block">hourglass_empty</span>
                등원한 학생이 없습니다
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(item => {
        const checkInTime = new Date(item.check_in_time);
        const alarmTime = new Date(item.alarm_time);
        const checkInStr = checkInTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        const alarmStr = alarmTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

        return `
            <div class="check-in-card bg-gradient-to-r from-pink-50 to-purple-50 rounded-xl p-4 cursor-grab border-2 border-transparent hover:border-pink-300 transition-all"
                draggable="true"
                ondragstart="handleCheckInDragStart(event, '${item.id}')"
                ondragend="handleDragEnd(event)"
                data-attendance-id="${item.id}">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-gradient-to-br from-pink-400 to-purple-400 rounded-full flex items-center justify-center text-white font-bold text-sm">
                        ${escapeHtml(item.student_name?.charAt(0) || '?')}
                    </div>
                    <div class="flex-1">
                        <div class="font-bold text-gray-800">${escapeHtml(item.student_name)}</div>
                        <div class="text-xs text-gray-500">등원 ${checkInStr}</div>
                    </div>
                </div>
                <div class="mt-2 flex items-center justify-between text-xs">
                    <span class="text-pink-500 font-semibold flex items-center gap-1">
                        <span class="material-symbols-outlined text-sm">alarm</span>
                        ${alarmStr}
                    </span>
                    <span class="text-gray-400">좌석으로 드래그</span>
                </div>
            </div>
        `;
    }).join('');
}

// ========== 드래그 앤 드롭 ==========
let draggedAttendanceId = null;

function handleCheckInDragStart(event, attendanceId) {
    draggedAttendanceId = attendanceId;
    event.dataTransfer.setData('text/plain', attendanceId);
    event.dataTransfer.effectAllowed = 'move';
    event.target.classList.add('opacity-50', 'scale-95');
}

function handleDragEnd(event) {
    event.target.classList.remove('opacity-50', 'scale-95');
    draggedAttendanceId = null;
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
}

function handleDropOnContainer(event) {
    event.preventDefault();
    // 컨테이너에 드롭된 경우 (좌석 외부) - 무시
}

function handleDropOnSeat(event, seatId) {
    event.preventDefault();
    event.stopPropagation();

    const attendanceId = event.dataTransfer.getData('text/plain') || draggedAttendanceId;
    if (!attendanceId) return;

    assignStudentToSeat(attendanceId, seatId);
}

async function assignStudentToSeat(attendanceId, seatId) {
    const attendance = checkInList.find(a => a.id === attendanceId);
    const seat = seats.find(s => s.id == seatId);

    if (!attendance || !seat) {
        console.error('등원 정보 또는 좌석을 찾을 수 없습니다');
        return;
    }

    if (seat.occupied) {
        alert('이미 사용 중인 좌석입니다.');
        return;
    }

    if (useSupabase) {
        try {
            // 좌석 업데이트
            const { error: seatError } = await supabase
                .from('seats')
                .update({
                    occupied: true,
                    student_name: attendance.student_name,
                    student_id: attendance.student_id,
                    check_in_time: attendance.check_in_time,
                    alarm_time: attendance.alarm_time
                })
                .eq('id', String(seatId));

            if (seatError) throw seatError;

            // 등원 기록 상태 업데이트
            const { error: attendanceError } = await supabase
                .from('attendance')
                .update({
                    status: 'seated',
                    seat_id: String(seatId)
                })
                .eq('id', attendanceId);

            if (attendanceError) throw attendanceError;

            console.log('✓ 좌석 배정 완료:', attendance.student_name, '→ 좌석', seat.number);

        } catch (error) {
            console.error('좌석 배정 실패:', error);
            alert('좌석 배정에 실패했습니다.');
        }
    } else {
        // localStorage 모드
        seat.occupied = true;
        seat.name = attendance.student_name;
        seat.alarmTime = formatTimeFromISO(attendance.alarm_time);
        saveSeats();
        renderSeats();
    }
}

// ========== 좌석 렌더링 ==========
function renderSeats() {
    console.log('=== renderSeats 함수 시작 ===');

    const container = document.getElementById('seat-container');
    if (!container) {
        console.error('❌ seat-container를 찾을 수 없습니다');
        return;
    }

    container.innerHTML = '';

    if (seats.length === 0) {
        console.log('⚠️ 렌더링할 좌석이 없습니다');
        return;
    }

    seats.forEach((seat, index) => {
        const seatDiv = document.createElement('div');
        seatDiv.id = 'seat-' + seat.id;
        seatDiv.className = `absolute w-24 h-28 rounded-2xl flex flex-col items-center justify-center text-white font-bold text-sm shadow-lg cursor-move transition-all overflow-hidden`;
        seatDiv.dataset.seatId = seat.id;

        // 드롭 대상으로 설정
        seatDiv.ondragover = (e) => {
            e.preventDefault();
            if (!seat.occupied) {
                seatDiv.classList.add('ring-4', 'ring-pink-400', 'scale-105');
            }
        };
        seatDiv.ondragleave = (e) => {
            seatDiv.classList.remove('ring-4', 'ring-pink-400', 'scale-105');
        };
        seatDiv.ondrop = (e) => {
            seatDiv.classList.remove('ring-4', 'ring-pink-400', 'scale-105');
            handleDropOnSeat(e, seat.id);
        };

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
            ${seat.name ? `<div class="text-xs mt-1">${escapeHtml(seat.name)}</div>` : ''}
            ${seat.alarmTime ? `<div class="text-xs text-yellow-200 mt-1">⏰ ${escapeHtml(seat.alarmTime)}</div>` : ''}
        `;

        // 더블클릭: 편집
        seatDiv.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            openEditSeatModal(seat.id);
        });

        // 마우스 다운: 드래그 시작
        seatDiv.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            makeSeatDraggable(seatDiv, seat.id);
        });

        container.appendChild(seatDiv);
    });

    console.log('✓ renderSeats 함수 완료. 총 ' + seats.length + '개 좌석 렌더링됨');
}

// 좌석 드래그 앤 드롭 기능
function makeSeatDraggable(seatElement, seatId) {
    let isDragging = true;
    const rect = seatElement.getBoundingClientRect();
    const containerRect = seatElement.parentElement.getBoundingClientRect();

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

    async function handleMouseUp() {
        if (isDragging) {
            isDragging = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            const seat = seats.find(s => s.id == seatId);
            if (seat) {
                seat.x = parseInt(seatElement.style.left) || 0;
                seat.y = parseInt(seatElement.style.top) || 0;

                if (useSupabase) {
                    await saveSeatToSupabase(seat);
                } else {
                    saveSeats();
                }
            }
        }
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
}

// ========== 좌석 추가 ==========
async function addSeat() {
    console.log('=== addSeat 함수 시작 ===');

    const container = document.getElementById('seat-container');
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

    // 겹치지 않는 위치 찾기
    let newX = 10;
    let newY = 10;
    let foundPosition = false;

    const containerRect = container.getBoundingClientRect();
    const maxCols = Math.floor(containerRect.width / SEAT_WIDTH);
    const maxRows = Math.floor(containerRect.height / SEAT_HEIGHT);

    for (let row = 0; row < maxRows; row++) {
        for (let col = 0; col < maxCols; col++) {
            let potentialX = 10 + col * SEAT_WIDTH;
            let potentialY = 10 + row * SEAT_HEIGHT;

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

    const newSeatId = Date.now();
    const newSeat = {
        id: newSeatId,
        number: newSeatNumber,
        name: '',
        x: newX,
        y: newY,
        occupied: false,
        alarmTime: null,
        alarming: false,
        alarmStopped: false
    };

    seats.push(newSeat);

    if (useSupabase) {
        await saveSeatToSupabase(newSeat);
    } else {
        saveSeats();
    }

    renderSeats();
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

// ========== 좌석 설정 모달 ==========
function openEditSeatModal(seatId) {
    const modal = document.getElementById('edit-seat-modal');
    if (!modal) return;

    const modalContent = modal.querySelector('div');
    const nameInput = document.getElementById('edit-seat-name');
    const hourInput = document.getElementById('edit-seat-alarm-hour');
    const minuteInput = document.getElementById('edit-seat-alarm-minute');

    if (!nameInput || !hourInput || !minuteInput) return;

    const seat = seats.find(s => s.id == seatId);
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

async function saveSeatSettings() {
    const modal = document.getElementById('edit-seat-modal');
    const modalContent = modal.querySelector('div');
    const nameInput = document.getElementById('edit-seat-name');
    const hourInput = document.getElementById('edit-seat-alarm-hour');
    const minuteInput = document.getElementById('edit-seat-alarm-minute');

    const seat = seats.find(s => s.id == currentSeatId);
    if (!seat) return;

    seat.name = nameInput.value.trim();
    seat.occupied = !!seat.name;

    const hour = parseInt(hourInput.value);
    const minute = parseInt(minuteInput.value);

    if (!isNaN(hour) && hour >= 0 && hour <= 23 && !isNaN(minute) && minute >= 0 && minute <= 59) {
        seat.alarmTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        seat.alarming = false;
        seat.alarmStopped = false;
    } else {
        seat.alarmTime = null;
        seat.alarming = false;
        seat.alarmStopped = false;
    }

    if (useSupabase) {
        await saveSeatToSupabase(seat);
    } else {
        saveSeats();
    }

    renderSeats();
    modal.style.display = 'none';
    modalContent.style.display = 'none';
    currentSeatId = null;
}

function cancelSeatSettings() {
    const modal = document.getElementById('edit-seat-modal');
    const modalContent = modal.querySelector('div');
    modal.style.display = 'none';
    modalContent.style.display = 'none';
    currentSeatId = null;
}

// ========== 좌석 초기화/삭제 ==========
async function resetAllSeats() {
    if (!confirm('모든 좌석의 정보를 초기화하시겠습니까?')) return;

    for (const seat of seats) {
        seat.occupied = false;
        seat.name = '';
        seat.alarmTime = null;
        seat.alarming = false;
        seat.alarmStopped = false;

        if (useSupabase) {
            await saveSeatToSupabase(seat);
        }
    }

    if (!useSupabase) {
        saveSeats();
    }

    renderSeats();
    alert('모든 좌석이 초기화되었습니다.');
}

async function clearAllSeats() {
    if (!confirm('모든 좌석을 삭제하시겠습니까?')) return;

    if (useSupabase) {
        try {
            const { error } = await supabase
                .from('seats')
                .delete()
                .neq('id', ''); // 모든 좌석 삭제

            if (error) throw error;
        } catch (error) {
            console.error('좌석 삭제 실패:', error);
        }
    }

    seats = [];
    seatCounter = 1;

    if (!useSupabase) {
        saveSeats();
    }

    renderSeats();
}

function stopAllAlarms() {
    seats.forEach(seat => {
        if (seat.alarming) {
            seat.alarming = false;
            seat.alarmStopped = true;
        }
    });

    // 모든 알람 인터벌 정리
    Object.keys(alarmIntervals).forEach(key => {
        clearInterval(alarmIntervals[key]);
        delete alarmIntervals[key];
    });

    saveSeats();
    renderSeats();
    alert('모든 알람이 중지되었습니다.');
}

// ========== 유틸리티 함수 ==========
function formatTimeFromISO(isoString) {
    if (!isoString) return null;
    const date = new Date(isoString);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatTimeToISO(timeString) {
    if (!timeString) return null;
    const [hours, minutes] = timeString.split(':');
    const now = new Date();
    now.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    return now.toISOString();
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
                    <span class="font-bold text-lg">${escapeHtml(s.name)}</span>
                    <span class="text-[10px] px-2 py-0.5 ${s.status === '등원중' ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-200 text-gray-500'} rounded-full font-bold">학생</span>
                </div>
                <p class="text-xs text-gray-400">${escapeHtml(s.status)} 시각: ${escapeHtml(s.time)}</p>
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
document.addEventListener('DOMContentLoaded', async () => {
    console.log('%c=== DOMContentLoaded 이벤트 발생 ===', 'color: blue; font-weight: bold; font-size: 14px;');

    // Supabase 초기화
    await initSupabase();

    // DOM 요소 확인
    const seatContainer = document.getElementById('seat-container');
    console.log('✓ seat-container 존재:', !!seatContainer);

    // 모달 제어
    const modal = document.getElementById('edit-seat-modal');
    if (modal) {
        const modalContent = modal.querySelector('div');

        modal.addEventListener('click', (e) => {
            if (e.target === modal && modalContent) {
                modal.style.display = 'none';
                modalContent.style.display = 'none';
            }
        });

        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveSeatSettings();
            }
        });
    }

    console.log('좌석 시스템 초기화 시작...');
    renderAttendance();
    await loadSeats();
    await loadCheckInList();
    console.log('%c=== 초기화 완료 ===', 'color: green; font-weight: bold; font-size: 14px;');
});
