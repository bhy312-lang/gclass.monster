// Supabase 설정 (supabase-config.js에서 전역 window.supabase 사용)

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
            const maxHoursDisplay = document.getElementById('max-hours-display');
            if (maxHoursDisplay) maxHoursDisplay.textContent = maxWeeklyHours;
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
    // 모든 state 숨기기
    const allStates = ['loading', 'error', 'countdown', 'open', 'closed', 'success'];
    allStates.forEach(s => {
        const el = document.getElementById(`${s}-state`);
        if (el) el.classList.add('hidden');
    });

    // 해당 state 보이기
    const targetEl = document.getElementById(`${state}-state`);
    if (targetEl) targetEl.classList.remove('hidden');
}

function startCountdown(openTime) {
    // 오픈 일시 표시
    const subEl = document.getElementById('countdown-sub');
    if (subEl) {
        const options = { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' };
        subEl.textContent = `오픈 일시: ${openTime.toLocaleDateString('ko-KR', options)}`;
    }

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
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        const timerEl = document.getElementById('countdown-timer');
        if (timerEl) {
            timerEl.textContent = `${String(days).padStart(2, '0')}:${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

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
const REFRESH_INTERVAL = 3000; // 3초 (실시간 마감 반영)

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

        // 슬롯 정보 새로고침 (open-state가 보이거나 slot-modal이 열려있을 때)
        const openState = document.getElementById('open-state');
        const slotModal = document.getElementById('slot-modal');
        const isOpenStateVisible = openState && !openState.classList.contains('hidden');
        const isSlotModalOpen = slotModal && slotModal.classList.contains('show');

        if (isOpenStateVisible || isSlotModalOpen) {
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
    await loadTimeSlots(true);  // 최초 로드시 로딩 메시지 표시
    setupRealtimeSubscription();
}

function closeSlotModal() {
    document.getElementById('slot-modal').classList.remove('show');
    if (slotsSubscription) {
        supabase.removeChannel(slotsSubscription);
        slotsSubscription = null;
    }
    // 다음 번에 모달 열 때 로딩 메시지 표시를 위해 초기화
    currentTimeSlots = [];
}

function setupRealtimeSubscription() {
    if (slotsSubscription) {
        supabase.removeChannel(slotsSubscription);
    }

    slotsSubscription = supabase
        .channel('course_changes_' + Date.now())
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'course_time_slots',
                filter: `period_id=eq.${currentPeriod.id}`
            },
            (payload) => {
                console.log('[Realtime] 슬롯 변경 감지:', payload);
                loadTimeSlots();
            }
        )
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'course_registrations',
                filter: `period_id=eq.${currentPeriod.id}`
            },
            (payload) => {
                console.log('[Realtime] 신청 변경 감지:', payload);
                loadTimeSlots();
            }
        )
        .subscribe((status) => {
            console.log('[Realtime] 구독 상태:', status);
        });
}

async function loadTimeSlots(showLoading = false) {
    const grid = document.getElementById('slot-grid');
    if (!grid) return;

    // 최초 로드 시에만 로딩 메시지 표시
    if (showLoading && currentTimeSlots.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #64748b;">로딩 중...</p>';
    }

    try {
        // 캐시 방지를 위해 타임스탬프 추가
        const { data: slots, error } = await supabase
            .from('course_time_slots')
            .select('*')
            .eq('period_id', currentPeriod.id)
            .order('day_of_week')
            .order('start_time')
            .throwOnError();

        if (error || !slots) {
            if (currentTimeSlots.length === 0) {
                grid.innerHTML = '<p style="grid-column: 1 / -1; text-align: center; color: #64748b;">등록된 시간이 없습니다.</p>';
            }
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

    // 선택된 슬롯 중 마감된 것 자동 해제 (단, 본인이 기존에 신청한 슬롯은 제외)
    const closedSlots = [];
    days.forEach(day => {
        if (selectedSlots[day] && selectedSlots[day].length > 0) {
            const toRemove = [];
            selectedSlots[day].forEach(slotId => {
                // 본인이 기존에 신청한 슬롯은 마감 체크에서 제외
                if (editingSlotIds.includes(slotId)) return;

                const slot = currentTimeSlots.find(s => s.id === slotId);
                if (slot && slot.current_count >= slot.capacity) {
                    toRemove.push(slotId);
                    closedSlots.push(`${dayNames[day]} ${slot.start_time}-${slot.end_time}`);
                }
            });
            if (toRemove.length > 0) {
                selectedSlots[day] = selectedSlots[day].filter(id => !toRemove.includes(id));
            }
        }
    });

    // 마감된 슬롯이 있었으면 알림
    if (closedSlots.length > 0) {
        showAlertModal('마감 알림', `선택하신 시간이 마감되어 해제되었습니다.\n\n${closedSlots.join('\n')}\n\n다른 시간을 선택해주세요.`);
    }

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
                const isMySlot = editingSlotIds.includes(slot.id);  // 본인이 기존에 신청한 슬롯
                // 본인이 신청한 슬롯은 마감이 아닌 것으로 처리
                const isFull = !isMySlot && slot.current_count >= slot.capacity;

                let itemClass = 'slot-item';
                if (isSelected) {
                    itemClass += ' selected';
                } else if (isFull) {
                    itemClass += ' full';
                } else {
                    itemClass += ' available';
                }

                // 선택된 슬롯은 해제 가능, 마감된 슬롯만 클릭 불가
                let onClick = '';
                if (isSelected) {
                    // 선택된 슬롯은 클릭하면 해제
                    onClick = `onclick="selectSlot('${slot.id}', '${day}')"`;
                } else if (isFull) {
                    // 마감된 슬롯은 클릭 불가
                    onClick = '';
                } else {
                    // 가능한 슬롯은 클릭하면 선택
                    onClick = `onclick="selectSlot('${slot.id}', '${day}')"`;
                }

                html += `
                    <div class="${itemClass}" ${onClick}>
                        <div class="slot-time">${slot.start_time}-${slot.end_time}</div>
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
    const isMySlot = editingSlotIds.includes(slotId);  // 본인이 기존에 신청한 슬롯

    // 해제 체크
    if (currentSelection.includes(slotId)) {
        selectedSlots[day] = currentSelection.filter(id => id !== slotId);
        renderSlotGrid();
        return;
    }

    // 마감 체크 (본인이 기존에 신청한 슬롯은 제외)
    if (slot && !isMySlot && slot.current_count >= slot.capacity) {
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

    // 신청 버튼 활성화/비활성화
    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
        const hasSelection = selectedList.length > 0;
        submitBtn.disabled = !hasSelection;
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
            .select('id, current_count, capacity, day_of_week, start_time, end_time')
            .in('id', slotIds);

        if (error) throw error;

        // 본인이 기존에 신청한 슬롯은 마감 체크에서 제외
        const fullSlots = slots.filter(s =>
            !editingSlotIds.includes(s.id) && s.current_count >= s.capacity
        );
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
        // 마감된 시간 목록 생성
        const closedTimeList = fullSlots.map(slot => {
            const dayName = dayNames[slot.day_of_week] || slot.day_of_week;
            return `${dayName} ${slot.start_time}-${slot.end_time}`;
        });

        // 꽉 찬 슬롯만 해제
        fullSlots.forEach(fullSlot => {
            days.forEach(day => {
                if (selectedSlots[day] && selectedSlots[day].includes(fullSlot.id)) {
                    selectedSlots[day] = selectedSlots[day].filter(id => id !== fullSlot.id);
                }
            });
        });

        renderSlotGrid();
        showAlertModal('마감 안내', `다음 시간이 이미 마감되어 신청이 어렵습니다.\n\n${closedTimeList.join('\n')}\n\n다른 시간을 선택한 후 다시 신청해주세요.`);
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
        // 수정 모드인지 확인 (editingSlotIds가 있으면 수정 모드)
        const isEditMode = editingSlotIds.length > 0;

        if (isEditMode) {
            // 수정 모드: 기존 신청 업데이트
            const updateResult = await updateExistingRegistration(studentInfo, allSlotIds);
            if (!updateResult.success) {
                document.getElementById('submitting-modal').classList.remove('show');
                showAlertModal('오류', updateResult.message || '수정에 실패했습니다.');
                return;
            }
            showSuccessState({ success: true });
        } else {
            // 신규 등록
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
                    showAlertModal('중복 신청', '이미 신청된 연락처입니다.\n\n수정을 원하시면 신청완료 화면에서 "수정하기"를 눌러주세요.');
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
        }

    } catch (error) {
        console.error('[Registration] 신청 오류:', error);
        document.getElementById('submitting-modal').classList.remove('show');
        showAlertModal('오류', '신청 처리 중 오류가 발생했습니다.');
    }
}

async function updateExistingRegistration(studentInfo, newSlotIds) {
    try {
        const phoneNumber = studentInfo.phoneNumber;

        // 1. 기존 신청 조회
        const { data: existingReg, error: fetchError } = await supabase
            .from('course_registrations')
            .select('id, selected_slot_ids')
            .eq('period_id', currentPeriod.id)
            .eq('guardian_phone', phoneNumber)
            .in('status', ['pending', 'confirmed'])
            .maybeSingle();

        if (fetchError || !existingReg) {
            return { success: false, message: '기존 신청 정보를 찾을 수 없습니다.' };
        }

        const oldSlotIds = existingReg.selected_slot_ids || [];

        // 2. 제거된 슬롯 (이전에 있었지만 새 목록에 없는 것)
        const removedSlots = oldSlotIds.filter(id => !newSlotIds.includes(id));

        // 3. 추가된 슬롯 (새 목록에 있지만 이전에 없던 것)
        const addedSlots = newSlotIds.filter(id => !oldSlotIds.includes(id));

        // 4. 제거된 슬롯의 current_count 감소
        for (const slotId of removedSlots) {
            const { data: slot } = await supabase
                .from('course_time_slots')
                .select('current_count')
                .eq('id', slotId)
                .single();

            if (slot) {
                await supabase
                    .from('course_time_slots')
                    .update({ current_count: Math.max(0, slot.current_count - 1) })
                    .eq('id', slotId);
            }
        }

        // 5. 추가된 슬롯의 current_count 증가
        for (const slotId of addedSlots) {
            const { data: slot } = await supabase
                .from('course_time_slots')
                .select('current_count')
                .eq('id', slotId)
                .single();

            if (slot) {
                await supabase
                    .from('course_time_slots')
                    .update({ current_count: slot.current_count + 1 })
                    .eq('id', slotId);
            }
        }

        // 6. 신청 정보 업데이트
        const { error: updateError } = await supabase
            .from('course_registrations')
            .update({
                student_name: studentInfo.studentName,
                school_name: studentInfo.schoolName,
                grade: studentInfo.grade,
                selected_slot_ids: newSlotIds,
                updated_at: new Date().toISOString()
            })
            .eq('id', existingReg.id);

        if (updateError) {
            return { success: false, message: '신청 수정에 실패했습니다.' };
        }

        // 수정 모드 초기화
        editingSlotIds = [];

        return { success: true };

    } catch (error) {
        console.error('[Registration] 수정 오류:', error);
        return { success: false, message: '수정 처리 중 오류가 발생했습니다.' };
    }
}

function showSuccessState(data) {
    document.getElementById('submitting-modal').classList.remove('show');
    document.getElementById('result-name').textContent = document.getElementById('student-name').value;
    document.getElementById('result-school').textContent = document.getElementById('school-name').value;
    document.getElementById('result-grade').textContent = selectedGrade + '학년';
    document.getElementById('result-time').textContent = new Date().toLocaleString('ko-KR');

    // 연락처도 표시
    const resultPhone = document.getElementById('result-phone');
    if (resultPhone) {
        resultPhone.textContent = document.getElementById('phone-number').value;
    }

    showState('success');
    stopAutoRefresh();
}

async function editMyRegistration() {
    const phoneNumber = document.getElementById('phone-number').value;

    if (!phoneNumber || !currentPeriod) {
        showAlertModal('오류', '신청 정보를 찾을 수 없습니다.');
        return;
    }

    try {
        // 기존 신청 정보 조회
        const { data: existingReg, error } = await supabase
            .from('course_registrations')
            .select('*, selected_slot_ids')
            .eq('period_id', currentPeriod.id)
            .eq('guardian_phone', phoneNumber)
            .in('status', ['pending', 'confirmed'])
            .maybeSingle();

        if (error || !existingReg) {
            showAlertModal('오류', '기존 신청 정보를 찾을 수 없습니다.');
            return;
        }

        // 기존 선택했던 슬롯 ID 저장 (수정 모드)
        editingSlotIds = existingReg.selected_slot_ids || [];

        // 선택 상태 초기화 후 기존 선택 복원
        selectedSlots = { mon: [], tue: [], wed: [], thu: [], fri: [] };

        // 기존 선택 슬롯 정보 조회
        if (editingSlotIds.length > 0) {
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
        }

        // open 상태로 전환하고 슬롯 모달 열기
        showState('open');
        setupAutoRefresh();
        document.getElementById('slot-modal').classList.add('show');
        await loadTimeSlots(true);
        setupRealtimeSubscription();

    } catch (e) {
        console.error('수정 모드 진입 오류:', e);
        showAlertModal('오류', '수정 모드 진입 중 오류가 발생했습니다.');
    }
}

function showAlertModal(title, message) {
    document.getElementById('alert-title').textContent = title;
    document.getElementById('alert-message').textContent = message;
    document.getElementById('alert-modal').classList.add('show');
}

function closeAlertModal() {
    document.getElementById('alert-modal').classList.remove('show');
}

// Info Modal 함수들
function openInfoModal() {
    document.getElementById('info-modal').classList.add('show');
    loadSchools();
}

function closeInfoModal() {
    document.getElementById('info-modal').classList.remove('show');
}

function selectGrade(grade) {
    selectedGrade = grade;
    document.querySelectorAll('.grade-option').forEach(opt => {
        opt.classList.remove('selected');
        if (parseInt(opt.dataset.grade) === grade) {
            opt.classList.add('selected');
        }
    });
    document.getElementById('selected-grade').value = grade;
}

async function loadSchools() {
    const schoolSelect = document.getElementById('school-name');
    if (!schoolSelect || schoolSelect.options.length > 1) return;

    try {
        const { data: schools, error } = await supabase
            .from('schools')
            .select('name')
            .order('name');

        if (error || !schools || schools.length === 0) {
            // 학교 테이블이 없거나 비어있으면 텍스트 입력으로 변경
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-input';
            input.id = 'school-name';
            input.placeholder = '학교명을 입력하세요';
            input.required = true;
            schoolSelect.parentNode.replaceChild(input, schoolSelect);
            return;
        }

        schools.forEach(school => {
            const option = document.createElement('option');
            option.value = school.name;
            option.textContent = school.name;
            schoolSelect.appendChild(option);
        });
    } catch (e) {
        console.error('학교 목록 로드 오류:', e);
        // 에러 시 텍스트 입력으로 변경
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'form-input';
        input.id = 'school-name';
        input.placeholder = '학교명을 입력하세요';
        input.required = true;
        schoolSelect.parentNode.replaceChild(input, schoolSelect);
    }
}

function submitInfo(event) {
    event.preventDefault();

    const studentName = document.getElementById('student-name').value.trim();
    const schoolName = document.getElementById('school-name').value.trim();
    const phoneNumber = document.getElementById('phone-number').value.trim();

    // 유효성 검사
    let isValid = true;

    if (!studentName) {
        document.getElementById('name-error').classList.add('show');
        document.getElementById('student-name').classList.add('error');
        isValid = false;
    } else {
        document.getElementById('name-error').classList.remove('show');
        document.getElementById('student-name').classList.remove('error');
    }

    if (!schoolName) {
        document.getElementById('school-error').classList.add('show');
        isValid = false;
    } else {
        document.getElementById('school-error').classList.remove('show');
    }

    if (!selectedGrade) {
        document.getElementById('grade-error').classList.add('show');
        isValid = false;
    } else {
        document.getElementById('grade-error').classList.remove('show');
    }

    if (!phoneNumber || !/^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/.test(phoneNumber.replace(/-/g, ''))) {
        document.getElementById('phone-error').classList.add('show');
        document.getElementById('phone-number').classList.add('error');
        isValid = false;
    } else {
        document.getElementById('phone-error').classList.remove('show');
        document.getElementById('phone-number').classList.remove('error');
    }

    if (!isValid) return;

    // 정보 입력 완료, 시간 선택 모달 열기
    closeInfoModal();
    openSlotModal();
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
