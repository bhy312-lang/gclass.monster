// Supabase 설정 (supabase-config.js에서 전역 설정 사용)
const supabase = window.supabaseClient || window.supabase;

let currentPeriod = null;
let currentTimeSlots = [];
let selectedSlots = {
    mon: [], tue: [], wed: [], thu: [], fri: []
};
let editingSlotIds = [];
let maxWeeklyHours = 5;
let slotsSubscription = null;

const dayNames = {
    'mon': '월',
    'tue': '화',
    'wed': '수',
    'thu': '목',
    'fri': '금'
};

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', async () => {
    await initializePage();
    setupGradeSelection();
    setupAutoRefresh();
});

async function initializePage() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const periodId = urlParams.get('period');

        if (!periodId) {
            showError('링크에 period 정보가 없습니다.');
            return;
        }

        await loadPeriod(periodId);

        if (currentPeriod) {
            maxWeeklyHours = currentPeriod.max_weekly_hours || 5;
            document.getElementById('max-hours-label').textContent = maxWeeklyHours;
            updatePageState();
        }
    } catch (error) {
        console.error('[Registration] 초기화 오류:', error);
        showError('페이지 로드 중 오류가 발생했습니다.');
    }
}

async function loadPeriod(periodId) {
    try {
        const { data: period, error } = await supabase
            .from('course_periods')
            .select('*')
            .eq('id', periodId)
            .single();

        if (error || !period) {
            showError('해당 신청 기간을 찾을 수 없습니다.');
            return;
        }

        currentPeriod = period;
        document.getElementById('period-name').textContent = period.name;
    } catch (error) {
        console.error('[Registration] 기간 로드 오류:', error);
        showError('기간 정보를 불러오는데 실패했습니다.');
    }
}

function updatePageState() {
    const now = new Date();
    const openTime = new Date(currentPeriod.open_datetime);
    const closeTime = currentPeriod.close_datetime ? new Date(currentPeriod.close_datetime) : null;

    if (!currentPeriod.is_active) {
        showState('error');
        return;
    }

    if (closeTime && now >= closeTime) {
        showState('closed');
        return;
    }

    if (now < openTime) {
        showState('countdown');
        startCountdown(openTime);
        return;
    }

    showState('open');
    checkExistingRegistration();
}

async function checkExistingRegistration() {
    const phoneNumber = document.getElementById('phone-number')?.value;

    if (phoneNumber) {
        try {
            const { data: existingReg, error } = await supabase
                .from('course_registrations')
                .select('*')
                .eq('period_id', currentPeriod.id)
                .eq('guardian_phone', phoneNumber)
                .in('status', ['pending', 'confirmed'])
                .maybeSingle();

            if (existingReg && !error) {
                // 기존 신청 정보 로드 (수정 모드)
                editingSlotIds = existingReg.selected_slot_ids || [];
                loadExistingSelection();
            }
        } catch (e) {
            console.log('기존 신청 확인 중 오류:', e);
        }
    }
}

async function loadExistingSelection() {
    if (editingSlotIds.length === 0) return;

    try {
        const { data: slots } = await supabase
            .from('course_time_slots')
            .select('*')
            .in('id', editingSlotIds);

        if (slots) {
            slots.forEach(slot => {
                if (selectedSlots[slot.day_of_week]) {
                    selectedSlots[slot.day_of_week].push(slot.id);
                }
            });
        }
    } catch (e) {
        console.error('기존 선택 로드 오류:', e);
    }
}

function showState(state) {
    document.querySelectorAll('.state').forEach(s => s.classList.remove('active'));
    document.getElementById(`${state}-state`).classList.add('active');
}

function startCountdown(openTime) {
    function update() {
        const now = new Date();
        const diff = openTime - now;

        if (diff <= 0) {
            updatePageState();
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % 1000 * 60) / 1000);

        document.getElementById('countdown-text').textContent =
            `${days}일 ${hours}시간 ${minutes}분 ${seconds}초 남았습니다`;

        setTimeout(update, 1000);
    }
    update();
}

function showError(message) {
    document.getElementById('error-message').textContent = message;
    showState('error');
}

// Grade Selection
let selectedGrade = null;

function setupGradeSelection() {
    document.querySelectorAll('.grade-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.grade-option').forEach(o => o.classList.remove('selected'));
            this.classList.add('selected');
            selectedGrade = this.dataset.grade;
        });
    });
}

// Auto Refresh
let refreshInterval = null;
const REFRESH_INTERVAL = 30000; // 30초

function setupAutoRefresh() {
    const refreshIcon = document.getElementById('refresh-icon');
    if (refreshIcon) {
        // 회전 아이콘 애니메이션 설정
        refreshIcon.style.animation = 'spin-slow 3s linear infinite';
    }

    startAutoRefresh();
}

function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);

    const refreshIcon = document.getElementById('refresh-icon');
    if (refreshIcon) {
        refreshIcon.style.color = '#3b82f6'; // 파란색 시작
    }

    refreshInterval = setInterval(() => {
        // 색상 변경 (파란색 ↔ 빨간색)
        if (refreshIcon) {
            const currentColor = refreshIcon.style.color;
            refreshIcon.style.color = currentColor === 'rgb(59, 130, 246)' ? '#ef4444' : '#3b82f6';
        }

        // 슬롯 정보 새로고침
        if (document.getElementById('open-state').classList.contains('active')) {
            loadTimeSlots();
        }
    }, REFRESH_INTERVAL);
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

// Slot Modal
async function openSlotModal() {
    const studentName = document.getElementById('student-name').value.trim();
    const schoolName = document.getElementById('school-name').value.trim();
    const phoneNumber = document.getElementById('phone-number').value.trim();

    if (!studentName || !schoolName || !phoneNumber || !selectedGrade) {
        showAlertModal('알림', '모든 정보를 입력해주세요.');
        return;
    }

    if (!currentPeriod) {
        showAlertModal('알림', '기간 정보를 찾을 수 없습니다.');
        return;
    }

    // 기존 신청 확인
    await checkExistingRegistration();

    document.getElementById('slot-modal').classList.add('show');
    await loadTimeSlots();
    setupRealtimeSubscription();
}

function closeSlotModal() {
    document.getElementById('slot-modal').classList.remove('show');
    if (slotsSubscription) {
        supabase.removeChannel(slotsSubscription);
        slotsSubscription = null;
    }
}

function setupRealtimeSubscription() {
    if (slotsSubscription) {
        supabase.removeChannel(slotsSubscription);
    }

    slotsSubscription = supabase
        .channel('course_time_slots_changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'course_time_slots',
                filter: `period_id=eq.${currentPeriod.id}`
            },
            (payload) => {
                console.log('슬롯 변경 감지:', payload);
                loadTimeSlots();
            }
        )
        .subscribe();
}

async function loadTimeSlots() {
    const grid = document.getElementById('slot-grid');
    if (!grid) return;

    grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #64748b;">로딩 중...</p>';

    try {
        const { data: slots, error } = await supabase
            .from('course_time_slots')
            .select('*')
            .eq('period_id', currentPeriod.id)
            .order('day_of_week')
            .order('start_time');

        if (error || !slots) {
            grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #64748b;">등록된 시간이 없습니다.</p>';
            return;
        }

        currentTimeSlots = slots;
        renderSlotGrid();

    } catch (error) {
        console.error('[Registration] 슬롯 로드 오류:', error);
        grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #dc2626;">시간을 불러오는데 실패했습니다.</p>';
    }
}

function renderSlotGrid() {
    const grid = document.getElementById('slot-grid');
    if (!grid) return;

    const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const dayHeaders = ['월', '화', '수', '목', '금'];

    // 요일별 슬롯 매핑
    const slotsByDay = { mon: [], tue: [], wed: [], thu: [], fri: [] };
    currentTimeSlots.forEach(slot => {
        if (slotsByDay[slot.day_of_week]) {
            slotsByDay[slot.day_of_week].push(slot);
        }
    });

    // HTML 생성
    let html = '';

    // 요일 헤더
    dayHeaders.forEach((day, idx) => {
        html += `<div class="day-header">${day}</div>`;
    });

    // 슬롯 그리드
    const maxSlots = Math.max(...days.map(d => slotsByDay[d].length));

    for (let i = 0; i < maxSlots; i++) {
        days.forEach(day => {
            const slot = slotsByDay[day][i];
            if (slot) {
                const isSelected = selectedSlots[day].includes(slot.id);
                const isFull = slot.current_count >= slot.capacity;

                let itemClass = 'slot-item';
                if (isSelected) {
                    itemClass += ' selected';
                } else if (isFull) {
                    itemClass += ' full';
                } else {
                    itemClass += ' available';
                }

                // 수정 모드에서는 기존 선택 슬롯 해제 가능
                const isPreviouslySelected = editingSlotIds.includes(slot.id);
                const canDeselect = isPreviouslySelected;

                let onClick = '';
                if (isSelected || isFull) {
                    if (canDeselect) {
                        onClick = `onclick="selectSlot('${slot.id}', '${day}')"`;
                    }
                } else {
                    onClick = `onclick="selectSlot('${slot.id}', '${day}')"`;
                }

                html += `
                    <div class="${itemClass}" ${onClick}>
                        <div class="slot-time">${slot.start_time}</div>
                        <div class="slot-status">${isFull ? '마감' : '가능'}</div>
                    </div>
                `;
            } else {
                html += `<div class="slot-item" style="visibility: hidden;"></div>`;
            }
        });
    }

    grid.innerHTML = html;
    updateSelectedSummary();
}

function selectSlot(slotId, day) {
    const currentSelection = selectedSlots[day] || [];
    const slot = currentTimeSlots.find(s => s.id === slotId);
    const isPreviouslySelected = editingSlotIds.includes(slotId);

    // 해제 체크 (수정 모드에서 기존 선택 해제 가능)
    if (currentSelection.includes(slotId)) {
        selectedSlots[day] = currentSelection.filter(id => id !== slotId);
        renderSlotGrid();
        return;
    }

    // 마감 체크
    if (slot && slot.current_count >= slot.capacity) {
        showAlertModal('알림', '이미 마감된 시간대입니다.');
        return;
    }

    // 시간 체크
    const totalHours = calculateTotalHours();
    const slotIntervalMinutes = currentPeriod?.slot_interval_minutes || 30;
    const newHours = totalHours + (slotIntervalMinutes / 60);

    if (newHours > maxWeeklyHours) {
        showExceedModal();
        return;
    }

    selectedSlots[day] = [...currentSelection, slotId];
    renderSlotGrid();
}

function calculateTotalHours() {
    const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
    let totalSlots = 0;

    days.forEach(day => {
        if (selectedSlots[day]) {
            totalSlots += selectedSlots[day].length;
        }
    });

    const slotIntervalMinutes = currentPeriod?.slot_interval_minutes || 30;
    return totalSlots * slotIntervalMinutes / 60;
}

function updateSelectedSummary() {
    const summary = document.getElementById('selected-summary');
    if (!summary) return;

    const days = ['mon', 'tue', 'wed', 'thu', 'fri'];

    const selectedList = [];
    days.forEach(day => {
        if (selectedSlots[day] && selectedSlots[day].length > 0) {
            selectedSlots[day].forEach(slotId => {
                const slot = currentTimeSlots.find(s => s.id === slotId);
                if (slot) {
                    selectedList.push(`${dayNames[day]} ${slot.start_time}~${slot.end_time}`);
                }
            });
        }
    });

    if (selectedList.length > 0) {
        summary.innerHTML = selectedList.map(time =>
            `<span class="selected-tag">${time}</span>`
        ).join('');
    } else {
        summary.innerHTML = '';
    }

    // 총 시간 업데이트
    const totalHours = calculateTotalHours();
    const totalHoursEl = document.getElementById('total-hours');
    if (totalHoursEl) {
        totalHoursEl.textContent = totalHours.toFixed(1);
    }
}

// Exceed Modal
function showExceedModal() {
    const modal = document.getElementById('exceed-modal');
    if (modal) {
        modal.classList.add('show');
    } else {
        showAlertModal('알림', `최대 선택 가능한 시간은 ${maxWeeklyHours}시간입니다.`);
    }
}

function closeExceedModal() {
    const modal = document.getElementById('exceed-modal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// Client-side 슬롯 가용성 확인
async function verifySlotsAvailability(slotIds) {
    try {
        const { data: slots, error } = await supabase
            .from('course_time_slots')
            .select('id, current_count, capacity')
            .in('id', slotIds);

        if (error) throw error;

        const fullSlots = slots.filter(s => s.current_count >= s.capacity);
        return { valid: fullSlots.length === 0, fullSlots };
    } catch (error) {
        console.error('[Registration] 슬롯 확인 오류:', error);
        return { valid: false, fullSlots: [] };
    }
}

async function submitRegistration() {
    const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
    const hasAnySelection = days.some(day => selectedSlots[day] && selectedSlots[day].length > 0);

    if (!hasAnySelection) {
        showAlertModal('알림', '최소 1개 이상의 시간을 선택해주세요.');
        return;
    }

    const allSlotIds = [];
    days.forEach(day => {
        if (selectedSlots[day] && selectedSlots[day].length > 0) {
            allSlotIds.push(...selectedSlots[day]);
        }
    });

    // 클라이언트 사이드에서 슬롯 가용성 확인
    const { valid, fullSlots } = await verifySlotsAvailability(allSlotIds);

    if (!valid || fullSlots.length > 0) {
        // 꽉 찬 슬롯만 해제
        fullSlots.forEach(fullSlot => {
            days.forEach(day => {
                if (selectedSlots[day] && selectedSlots[day].includes(fullSlot.id)) {
                    selectedSlots[day] = selectedSlots[day].filter(id => id !== fullSlot.id);
                }
            });
        });

        renderSlotGrid();
        showAlertModal('마감 안내', '해당 시간이 이미 마감되어 신청이 어렵습니다.\n시간을 다시 선택한 후 신청해주세요.');
        return;
    }

    const studentInfo = {
        studentName: document.getElementById('student-name').value,
        schoolName: document.getElementById('school-name').value,
        grade: selectedGrade,
        phoneNumber: document.getElementById('phone-number').value
    };

    document.getElementById('submitting-modal').classList.add('show');
    closeSlotModal();

    try {
        const { data, error } = await supabase.rpc('submit_course_registration', {
            p_period_id: currentPeriod.id,
            p_academy_id: currentPeriod.academy_id,
            p_student_name: studentInfo.studentName,
            p_school_name: studentInfo.schoolName,
            p_grade: studentInfo.grade,
            p_guardian_phone: studentInfo.phoneNumber,
            p_selected_slot_ids: allSlotIds
        });

        if (error) throw error;

        if (data && data.success === false) {
            document.getElementById('submitting-modal').classList.remove('show');

            if (data.error === 'DUPLICATE_PHONE') {
                showAlertModal('중복 신청', '이미 신청된 연락처입니다.');
            } else if (data.full_slots && data.full_slots.length > 0) {
                // 서버에서 반환된 꽉 찬 슬롯 해제
                data.full_slots.forEach(fullSlotId => {
                    const slot = currentTimeSlots.find(s => s.id === fullSlotId);
                    if (slot) {
                        const day = slot.day_of_week;
                        if (selectedSlots[day] && selectedSlots[day].includes(fullSlotId)) {
                            selectedSlots[day] = selectedSlots[day].filter(id => id !== fullSlotId);
                        }
                    }
                });

                showAlertModal('마감 안내', '해당 시간이 이미 마감되어 신청이 어렵습니다.\n시간을 다시 선택한 후 신청해주세요.');
            } else {
                showAlertModal('오류', data.message || '신청에 실패했습니다.');
            }
            return;
        }

        showSuccessState(data);

    } catch (error) {
        console.error('[Registration] 신청 오류:', error);
        document.getElementById('submitting-modal').classList.remove('show');
        showAlertModal('오류', '신청 처리 중 오류가 발생했습니다.');
    }
}

function showSuccessState(data) {
    document.getElementById('submitting-modal').classList.remove('show');
    document.getElementById('result-name').textContent = document.getElementById('student-name').value;
    document.getElementById('result-school').textContent = document.getElementById('school-name').value;
    document.getElementById('result-grade').textContent = selectedGrade + '학년';
    document.getElementById('result-time').textContent = new Date().toLocaleString('ko-KR');

    showState('success');
    stopAutoRefresh();
}

function showAlertModal(title, message) {
    document.getElementById('alert-title').textContent = title;
    document.getElementById('alert-message').textContent = message;
    document.getElementById('alert-modal').classList.add('show');
}

function closeAlertModal() {
    document.getElementById('alert-modal').classList.remove('show');
}

// CSS for spin-slow animation
const style = document.createElement('style');
style.textContent = `
    @keyframes spin-slow {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
    .spin-slow {
        animation: spin-slow 3s linear infinite;
    }
    /* Tab content styles */
    .tab-content { display: none; }
    .tab-content.active { display: block; }
`;
document.head.appendChild(style);
