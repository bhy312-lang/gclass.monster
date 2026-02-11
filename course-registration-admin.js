/**
 * 수강신청 관리자 페이지
 * 선착순 수강신청 시스템 관리 기능
 */

// 전역 변수
let currentPeriod = null;
let currentTimeSlots = [];
let currentApplications = [];
let currentFilter = 'all';
let currentUser = null;
let currentAcademyId = null;
let slotsRealtimeChannel = null; // 슬롯 실시간 구독 채널
let confirmCallback = null; // 커스텀 확인 모달 콜백

// 요일 한글명 매핑
const dayNames = {
    'mon': '월요일',
    'tue': '화요일',
    'wed': '수요일',
    'thu': '목요일',
    'fri': '금요일'
};

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', async () => {
    await initializePage();
    initDateTimePickers();
    initSlotTimePickers(); // 슬롯 시간 picker 초기화

    // 슬롯 모달용 커스텀 인터벌 입력 이벤트 리스너
    const slotCustomIntervalInput = document.getElementById('slot-custom-interval-input');
    if (slotCustomIntervalInput) {
        slotCustomIntervalInput.addEventListener('input', function() {
            let value = parseInt(this.value);
            if (isNaN(value) || value < 5) value = 5;
            if (value > 120) value = 120;
            this.value = value;

            // 버튼 선택 상태 업데이트
            document.getElementById('slot-interval').value = value;
            const slotModal = document.getElementById('slot-modal');
            if (slotModal) {
                slotModal.querySelectorAll('.interval-select-btn').forEach(btn => {
                    const interval = parseInt(btn.dataset.interval);
                    if (interval === value) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
            }
        });
    }
});

// 날짜시간 picker 초기화
function initDateTimePickers() {
    initDatePicker('open');
    initDatePicker('close');

    // 이벤트 리스너 등록
    ['open', 'close'].forEach(type => {
        // 연도, 월, 일, 오전/오후, 시간, 분 변경 시 hidden input 업데이트
        ['year', 'month', 'day', 'ampm', 'hour', 'minute'].forEach(field => {
            const selectElement = document.getElementById(`period-${type}-${field}-select`);
            const inputElement = document.getElementById(`period-${type}-${field}-input`);

            // Select 변경 시 input 업데이트 및 hidden input 업데이트
            if (selectElement) {
                selectElement.addEventListener('change', () => {
                    if (inputElement) {
                        inputElement.value = selectElement.value;
                    }
                    updateDateTimeHidden(type);
                });
            }

            // Input 변경 시 select 업데이트 및 hidden input 업데이트
            if (inputElement) {
                inputElement.addEventListener('input', () => {
                    // 값 유효성 검사 및 범위 제한
                    validateAndLimitInput(inputElement, field);
                    if (selectElement) {
                        selectElement.value = inputElement.value;
                    }
                    updateDateTimeHidden(type);
                });
                inputElement.addEventListener('change', () => {
                    updateDateTimeHidden(type);
                });
            }

            // ampm은 select만 있음
            if (field === 'ampm') {
                const ampmElement = document.getElementById(`period-${type}-ampm`);
                if (ampmElement) {
                    ampmElement.addEventListener('change', () => updateDateTimeHidden(type));
                }
            }
        });
    });
}

// 입력값 유효성 검사 및 범위 제한
function validateAndLimitInput(input, field) {
    let value = parseInt(input.value);
    if (isNaN(value)) return;

    switch (field) {
        case 'year':
            value = Math.max(2024, Math.min(2100, value));
            break;
        case 'month':
            value = Math.max(1, Math.min(12, value));
            break;
        case 'day':
            value = Math.max(1, Math.min(31, value));
            break;
        case 'hour':
            value = Math.max(1, Math.min(12, value));
            break;
        case 'minute':
            value = Math.max(0, Math.min(59, value));
            break;
    }
    input.value = value;
}

// 날짜 picker 초기화
function initDatePicker(type) {
    const currentYear = new Date().getFullYear();

    // 연도 옵션 (현재 연도부터 +10년)
    const yearSelect = document.getElementById(`period-${type}-year-select`);
    const yearInput = document.getElementById(`period-${type}-year-input`);
    if (yearSelect) {
        yearSelect.innerHTML = '';
        for (let y = currentYear; y <= currentYear + 10; y++) {
            const option = document.createElement('option');
            option.value = y;
            option.textContent = y;
            yearSelect.appendChild(option);
        }
        yearSelect.value = currentYear;
        if (yearInput) yearInput.value = currentYear;
    }

    // 월 옵션
    const monthSelect = document.getElementById(`period-${type}-month-select`);
    const monthInput = document.getElementById(`period-${type}-month-input`);
    if (monthSelect) {
        monthSelect.innerHTML = '';
        for (let m = 1; m <= 12; m++) {
            const option = document.createElement('option');
            option.value = m;
            option.textContent = m;
            monthSelect.appendChild(option);
        }
        monthSelect.value = 1;
        if (monthInput) monthInput.value = 1;
    }

    // 일 옵션 (1-31일)
    const daySelect = document.getElementById(`period-${type}-day-select`);
    const dayInput = document.getElementById(`period-${type}-day-input`);
    if (daySelect) {
        daySelect.innerHTML = '';
        for (let d = 1; d <= 31; d++) {
            const option = document.createElement('option');
            option.value = d;
            option.textContent = d;
            daySelect.appendChild(option);
        }
        daySelect.value = 1;
        if (dayInput) dayInput.value = 1;
    }

    // 시간 옵션 (1-12)
    const hourSelect = document.getElementById(`period-${type}-hour-select`);
    const hourInput = document.getElementById(`period-${type}-hour-input`);
    if (hourSelect) {
        hourSelect.innerHTML = '';
        for (let h = 1; h <= 12; h++) {
            const option = document.createElement('option');
            option.value = h;
            option.textContent = h;
            hourSelect.appendChild(option);
        }
        hourSelect.value = 10;
        if (hourInput) hourInput.value = 10;
    }

    // 분 옵션 (0-59, 5분 단위)
    const minuteSelect = document.getElementById(`period-${type}-minute-select`);
    const minuteInput = document.getElementById(`period-${type}-minute-input`);
    if (minuteSelect) {
        minuteSelect.innerHTML = '';
        for (let m = 0; m < 60; m += 5) {
            const option = document.createElement('option');
            option.value = m;
            option.textContent = m.toString().padStart(2, '0');
            minuteSelect.appendChild(option);
        }
        minuteSelect.value = 0;
        if (minuteInput) {
            minuteInput.value = 0;
            minuteInput.maxLength = 2;
        }
    }

    // 기본 시간 설정 (오전 10시)
    document.getElementById(`period-${type}-ampm`).value = 'AM';
}

// 날짜시간 hidden input 업데이트
function updateDateTimeHidden(type) {
    const year = parseInt(document.getElementById(`period-${type}-year-input`).value);
    const month = parseInt(document.getElementById(`period-${type}-month-input`).value);
    const day = parseInt(document.getElementById(`period-${type}-day-input`).value);
    const ampm = document.getElementById(`period-${type}-ampm`).value;
    let hour = parseInt(document.getElementById(`period-${type}-hour-input`).value);
    const minute = parseInt(document.getElementById(`period-${type}-minute-input`).value);

    // 12시간제를 24시간제로 변환
    if (ampm === 'PM' && hour !== 12) {
        hour += 12;
    } else if (ampm === 'AM' && hour === 12) {
        hour = 0;
    }

    // 월은 0-11로 변환
    const date = new Date(year, month - 1, day, hour, minute);

    // datetime-local 형식 (YYYY-MM-DDTHH:mm)
    const formattedDate = formatDateTimeLocal(date);

    // hidden input에 값 설정
    const hiddenInput = document.getElementById(`period-${type}`);
    if (hiddenInput) {
        hiddenInput.value = formattedDate;
    }
}

// 날짜시간 picker에 값 설정 (수정 모드용)
function setDateTimePicker(type, date) {
    if (!date) return;

    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-12
    const day = date.getDate();
    let hour = date.getHours();
    const minute = date.getMinutes();
    const ampm = hour >= 12 ? 'PM' : 'AM';

    // 24시간제를 12시간제로 변환
    hour = hour % 12;
    if (hour === 0) hour = 12;

    // Select와 Input 모두 업데이트
    const setFieldValue = (field, value) => {
        const select = document.getElementById(`period-${type}-${field}-select`);
        const input = document.getElementById(`period-${type}-${field}-input`);
        if (select) select.value = value;
        if (input) input.value = value;
    };

    setFieldValue('year', year);
    setFieldValue('month', month);
    setFieldValue('day', day);
    document.getElementById(`period-${type}-ampm`).value = ampm;
    setFieldValue('hour', hour);
    setFieldValue('minute', minute);

    // hidden input 업데이트
    updateDateTimeHidden(type);
}

// 페이지 초기화
async function initializePage() {
    try {
        // Supabase 체크
        if (typeof isSupabaseConfigured === 'function' && !isSupabaseConfigured()) {
            showError('Supabase가 설정되지 않았습니다.');
            return;
        }

        // 인증 체크 (테스트용: 주석 처리됨)
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
            // 테스트용: 첫 번째 학원의 owner로 설정
            const { data: firstAcademy } = await supabase
                .from('academies')
                .select('owner_id, id')
                .limit(1)
                .single();

            if (firstAcademy) {
                currentUser = { id: firstAcademy.owner_id };
                currentAcademyId = firstAcademy.id;
            } else {
                showError('학원 정보를 찾을 수 없습니다. 먼저 학원을 생성해주세요.');
                return;
            }
        } else {
            currentUser = session.user;
        }

        // currentUser = session.user;

        // 사용자의 학원 ID 가져오기
        const { data: profile } = await supabase
            .from('profiles')
            .select('academy_id')
            .eq('id', currentUser.id)
            .single();

        if (profile && profile.academy_id) {
            currentAcademyId = profile.academy_id;
        } else {
            // 학원이 없으면 첫 번째 학원 가져오기
            const { data: academies } = await supabase
                .from('academies')
                .select('id')
                .eq('owner_id', currentUser.id)
                .limit(1);

            if (academies && academies.length > 0) {
                currentAcademyId = academies[0].id;
            } else {
                showError('학원 정보를 찾을 수 없습니다.');
                return;
            }
        }

        // 기간 목록 로드
        await loadPeriods();

        // 정보설정 탭이 기본 활성화되어 있으면 학교 목록 로드
        const infoTab = document.getElementById('tab-info');
        if (infoTab && infoTab.classList.contains('active')) {
            await loadSchools();
            await loadMaxWeeklyHours();
        }

        // 실시간 구독 설정
        setupRealtimeSubscriptions();

    } catch (error) {
        console.error('[Admin] 초기화 오류:', error);
        showError('페이지 로드 중 오류가 발생했습니다.');
    }
}

// 실시간 구독 설정
function setupRealtimeSubscriptions() {
    slotsRealtimeChannel = supabase
        .channel('course_registration_changes')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'course_registrations'
            },
            () => {
                console.log('[Admin Realtime] 신청 현황 변경 감지');
                // 신청 현황 탭이 활성화되어 있으면 새로고침
                if (document.getElementById('tab-applications').classList.contains('active')) {
                    const tableVisible = !document.getElementById('applications-table-container').classList.contains('hidden');
                    if (tableVisible) {
                        loadApplications();
                    } else {
                        loadApplicationsTimetable();
                    }
                }
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'course_time_slots'
            },
            (payload) => {
                console.log('[Admin Realtime] 슬롯 변경 감지:', payload);
                // 시간 관리 탭이 활성화되어 있으면 슬롯만 업데이트
                if (document.getElementById('tab-slots').classList.contains('active') && currentPeriod) {
                    updateSlotCellUI(payload.new);
                }
                // 신청 현황 탭의 시간표도 새로고침
                if (document.getElementById('tab-applications').classList.contains('active')) {
                    const tableVisible = !document.getElementById('applications-table-container').classList.contains('hidden');
                    if (!tableVisible) {
                        loadApplicationsTimetable();
                    }
                }
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'course_time_slots'
            },
            () => {
                console.log('[Admin Realtime] 새 슬롯 추가 감지');
                // 시간 관리 탭이 활성화되어 있으면 전체 새로고침
                if (document.getElementById('tab-slots').classList.contains('active') && currentPeriod) {
                    loadTimeSlots();
                }
                // 신청 현황 탭의 시간표도 새로고침
                if (document.getElementById('tab-applications').classList.contains('active')) {
                    const tableVisible = !document.getElementById('applications-table-container').classList.contains('hidden');
                    if (!tableVisible) {
                        loadApplicationsTimetable();
                    }
                }
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'DELETE',
                schema: 'public',
                table: 'course_time_slots'
            },
            () => {
                console.log('[Admin Realtime] 슬롯 삭제 감지');
                // 시간 관리 탭이 활성화되어 있으면 전체 새로고침
                if (document.getElementById('tab-slots').classList.contains('active') && currentPeriod) {
                    loadTimeSlots();
                }
                // 신청 현황 탭의 시간표도 새로고침
                if (document.getElementById('tab-applications').classList.contains('active')) {
                    const tableVisible = !document.getElementById('applications-table-container').classList.contains('hidden');
                    if (!tableVisible) {
                        loadApplicationsTimetable();
                    }
                }
            }
        )
        .subscribe((status) => {
            console.log('[Admin Realtime] 구독 상태:', status);
        });
}

// 슬롯 셀 UI 업데이트 (실시간)
function updateSlotCellUI(slot) {
    // 해당 슬롯의 셀 찾기
    const cell = document.querySelector(`[data-slot-id="${slot.id}"]`);
    if (!cell) return;

    const isFull = slot.current_count >= slot.capacity;

    // 셀 클래스 업데이트
    cell.classList.remove('cell-available', 'cell-full');
    cell.classList.add(isFull ? 'cell-full' : 'cell-available');

    // 셀 내용 업데이트
    const statusElement = cell.querySelector('.cell-status');
    if (statusElement) {
        statusElement.classList.remove('status-full', 'status-available');
        statusElement.classList.add(isFull ? 'status-full' : 'status-available');
        statusElement.textContent = isFull ? '마감' : '가능';
    }

    const capacityElement = cell.querySelector('.cell-capacity');
    if (capacityElement) {
        capacityElement.innerHTML = `
            <span class="${isFull ? 'text-red-500' : 'text-teal-600'}">
                ${slot.current_count}
            </span>/${slot.capacity}
        `;
    }

    console.log('[Admin Realtime] 슬롯 셀 업데이트 완료:', slot.id);
}

// 탭 전환
function switchTab(tabName) {
    // 탭 버튼 활성화
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // 탭 컨텐츠 표시
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    // 탭별 데이터 로드
    if (tabName === 'info') {
        loadSchools();
        loadMaxWeeklyHours();
    } else if (tabName === 'slots') {
        populatePeriodSelect();
    } else if (tabName === 'applications') {
        populateApplicationsPeriodSelect();
        // 시간표 형태로 자동 로드
        const periodSelect = document.getElementById('applications-period-select');
        if (periodSelect && periodSelect.value) {
            // 기본적으로 시간표 형태로 로드
            loadApplicationsTimetable();
        }
    }
}

// 현재 뷰 모드 (timetable 또는 list)
let currentViewMode = 'timetable';

// 뷰 전환 (시간표 / 목록)
function switchView(view) {
    currentViewMode = view;

    const timetableContainer = document.getElementById('applications-timetable-container');
    const tableContainer = document.getElementById('applications-table-container');
    const timetableBtn = document.getElementById('view-timetable-btn');
    const listBtn = document.getElementById('view-list-btn');

    if (view === 'timetable') {
        timetableContainer.classList.remove('hidden');
        tableContainer.classList.add('hidden');
        timetableBtn.classList.add('active');
        listBtn.classList.remove('active');
        loadApplicationsTimetable();
    } else {
        timetableContainer.classList.add('hidden');
        tableContainer.classList.remove('hidden');
        timetableBtn.classList.remove('active');
        listBtn.classList.add('active');
        loadApplications();
    }
}

// 기간 선택 변경 시 (뷰 모드에 따라 다른 함수 호출)
function onApplicationsPeriodChange() {
    const periodSelect = document.getElementById('applications-period-select');
    if (!periodSelect.value) {
        // 기간이 선택되지 않으면 초기 상태로
        if (currentViewMode === 'timetable') {
            document.getElementById('applications-timetable-container').innerHTML = `
                <div class="empty-state text-center py-12">
                    <span class="material-symbols-outlined text-6xl text-gray-300">table_chart</span>
                    <p class="text-gray-500 mt-4">기간을 선택하세요</p>
                </div>
            `;
        } else {
            document.getElementById('applications-tbody').innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-8 text-gray-400">
                        기간을 선택해주세요.
                    </td>
                </tr>
            `;
        }
        return;
    }

    if (currentViewMode === 'timetable') {
        loadApplicationsTimetable();
    } else {
        loadApplications();
    }
}

// =====================================================
// 학교 관리 기능
// =====================================================

// 학교 목록 로드
async function loadSchools() {
    const schoolsList = document.getElementById('schools-list');

    console.log('[Admin] loadSchools 호출, currentAcademyId:', currentAcademyId);

    try {
        const { data: schools, error } = await supabase
            .from('schools')
            .select('*')
            .eq('academy_id', currentAcademyId)
            .order('name');

        console.log('[Admin] 학교 조회 결과:', { schools, error });

        if (error) {
            console.error('[Admin] 학교 조회 에러:', error);
            throw error;
        }

        if (!schools || schools.length === 0) {
            console.log('[Admin] 학교 목록이 없습니다.');
            schoolsList.innerHTML = `
                <div class="empty-state col-span-full">
                    <span class="material-symbols-outlined text-4xl text-gray-300">school</span>
                    <p class="text-gray-500 mt-2">등록된 학교가 없습니다</p>
                    <p class="text-sm text-gray-400 mt-1">위 폼에서 학교를 등록하세요</p>
                </div>
            `;
            return;
        }

        console.log('[Admin] 렌더링할 학교 수:', schools.length);
        schoolsList.innerHTML = schools.map(school => `
            <div class="school-card">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3 pl-3">
                        <span class="material-symbols-outlined text-teal-500" style="font-size: 24px;">school</span>
                        <span class="font-semibold text-gray-800" style="font-size: 15px;">${escapeHtml(school.name)}</span>
                    </div>
                    <div class="school-actions">
                        <button onclick="openEditSchoolModal('${school.id}', '${escapeHtml(school.name).replace(/'/g, "\\'")}')" class="btn-edit" title="수정">
                            <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
                        </button>
                        <button onclick="deleteSchool('${school.id}')" class="btn-delete" title="삭제">
                            <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('[Admin] 학교 목록 로드 오류:', error);
        schoolsList.innerHTML = `
            <div class="error-state col-span-full text-center">
                <span class="material-symbols-outlined text-4xl text-red-300">error</span>
                <p class="text-red-500 mt-2">학교 목록을 불러오는데 실패했습니다</p>
                <p class="text-sm text-gray-400 mt-1">에러: ${error.message}</p>
            </div>
        `;
    }
}

// 학교 추가
async function addSchool(event) {
    event.preventDefault();

    const schoolNameInput = document.getElementById('school-name-input');
    const schoolName = schoolNameInput.value.trim();

    if (!schoolName) {
        showError('학교명을 입력해주세요.');
        return;
    }

    console.log('[Admin] 학교 추가 시도:', { academy_id: currentAcademyId, name: schoolName });

    try {
        const { data, error } = await supabase
            .from('schools')
            .insert({
                academy_id: currentAcademyId,
                name: schoolName
            })
            .select();

        console.log('[Admin] 학교 추가 결과:', { data, error });

        if (error) throw error;

        showToast('학교가 등록되었습니다.');
        schoolNameInput.value = '';
        await loadSchools();

    } catch (error) {
        console.error('[Admin] 학교 추가 오류:', error);
        if (error.code === '23505') {
            showError('이미 등록된 학교입니다.');
        } else {
            showError('학교 등록에 실패했습니다: ' + error.message);
        }
    }
}

// 학교 삭제
async function deleteSchool(schoolId) {
    const confirmed = await showConfirm(
        '학교 삭제',
        '이 학교를 삭제하시겠습니까?'
    );

    if (!confirmed) return;

    try {
        const { error } = await supabase
            .from('schools')
            .delete()
            .eq('id', schoolId);

        if (error) throw error;

        showToast('학교가 삭제되었습니다.');
        await loadSchools();

    } catch (error) {
        console.error('[Admin] 학교 삭제 오류:', error);
        showError('학교 삭제에 실패했습니다.');
    }
}

// 학교 수정 모달 열기
async function openEditSchoolModal(schoolId, schoolName) {
    const modal = document.getElementById('edit-school-modal');
    document.getElementById('edit-school-id').value = schoolId;
    document.getElementById('edit-school-name').value = schoolName;
    modal.classList.add('show');
}

// 학교 수정 모달 닫기
function closeEditSchoolModal() {
    const modal = document.getElementById('edit-school-modal');
    document.getElementById('edit-school-form').reset();
    modal.classList.remove('show');
}

// 학교 수정
async function updateSchool(event) {
    event.preventDefault();

    const schoolId = document.getElementById('edit-school-id').value;
    const schoolName = document.getElementById('edit-school-name').value.trim();

    if (!schoolName) {
        showError('학교명을 입력해주세요.');
        return;
    }

    try {
        const { error } = await supabase
            .from('schools')
            .update({ name: schoolName, updated_at: new Date().toISOString() })
            .eq('id', schoolId);

        if (error) {
            if (error.code === '23505') {
                showError('이미 존재하는 학교명입니다.');
            } else {
                throw error;
            }
            return;
        }

        showToast('학교명이 수정되었습니다.');
        closeEditSchoolModal();
        await loadSchools();

    } catch (error) {
        console.error('[Admin] 학교 수정 오류:', error);
        showError('학교 수정에 실패했습니다.');
    }
}

// 주간 최대 신청 가능시간 로드
async function loadMaxWeeklyHours() {
    try {
        const { data: academy, error } = await supabase
            .from('academies')
            .select('max_weekly_hours')
            .eq('id', currentAcademyId)
            .single();

        if (error) throw error;

        const select = document.getElementById('max-weekly-hours');
        if (select && academy) {
            select.value = academy.max_weekly_hours || 5;
        }
    } catch (error) {
        console.error('[Admin] 주간 최대 시간 로드 오류:', error);
    }
}

// 주간 최대 신청 가능시간 저장
async function saveMaxWeeklyHours() {
    try {
        const select = document.getElementById('max-weekly-hours');
        const customInput = document.getElementById('custom-hours-input');
        let maxHours;

        if (select.value === 'custom') {
            maxHours = parseInt(customInput.value);
            if (isNaN(maxHours) || maxHours < 1 || maxHours > 50) {
                showError('시간은 1-50 사이로 입력해주세요.');
                return;
            }
        } else {
            maxHours = parseInt(select.value);
        }

        const { error } = await supabase
            .from('academies')
            .update({ max_weekly_hours: maxHours })
            .eq('id', currentAcademyId);

        if (error) throw error;

        alert(`주간 최대 신청 가능시간이 ${maxHours}시간으로 저장되었습니다.`);
    } catch (error) {
        console.error('[Admin] 주간 최대 시간 저장 오류:', error);
        showError('저장에 실패했습니다.');
    }
}

// 직접 입력 토글
function toggleCustomHoursInput() {
    const select = document.getElementById('max-weekly-hours');
    const customInput = document.getElementById('custom-hours-input');
    const customLabel = document.getElementById('custom-hours-label');

    if (select.value === 'custom') {
        customInput.classList.remove('hidden');
        customLabel.classList.remove('hidden');
        customInput.focus();
    } else {
        customInput.classList.add('hidden');
        customLabel.classList.add('hidden');
    }
}

// 인터벌 선택 (단위 시간) - 슬롯 모달용
function selectSlotInterval(minutes) {
    const customInput = document.getElementById('slot-custom-interval-input');

    // 버튼 선택 시 입력 필드 값 업데이트
    if (typeof minutes === 'number') {
        customInput.value = minutes;
    }

    // 인터벌 값 설정 (입력 필드의 값 사용)
    document.getElementById('slot-interval').value = customInput.value;

    // 버튼 활성화 상태 업데이트 (슬롯 모달 내의 버튼만)
    const slotModal = document.getElementById('slot-modal');
    slotModal.querySelectorAll('.interval-select-btn').forEach(btn => {
        const interval = parseInt(btn.dataset.interval);
        const isActive = interval === parseInt(customInput.value);

        // 활성화 클래스 토글
        if (isActive) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// 슬롯 시간 picker 초기화 (이벤트 리스너만 설정)
function initSlotTimePickers() {
    ['start', 'end'].forEach(type => {
        // 오전/오후, 시간, 분 변경 시 hidden input 업데이트
        ['ampm', 'hour', 'minute'].forEach(field => {
            const selectElement = document.getElementById(`slot-${type}-${field}-select`);
            const inputElement = document.getElementById(`slot-${type}-${field}-input`);

            // Select 변경 시 hidden input 업데이트
            if (selectElement) {
                selectElement.addEventListener('change', () => {
                    // Hidden input 값 업데이트 (JavaScript 호환성 위해 유지)
                    if (inputElement) {
                        inputElement.value = selectElement.value;
                    }
                    updateSlotTimeHidden(type);
                });
            }

            // ampm은 별도 select 요소
            if (field === 'ampm') {
                const ampmElement = document.getElementById(`slot-${type}-ampm`);
                if (ampmElement) {
                    ampmElement.addEventListener('change', () => updateSlotTimeHidden(type));
                }
            }
        });
    });
}

// 슬롯 시간 입력값 유효성 검사
function validateSlotTimeInput(input, field) {
    let value = parseInt(input.value);
    if (isNaN(value)) return;

    switch (field) {
        case 'hour':
            value = Math.max(1, Math.min(12, value));
            break;
        case 'minute':
            value = Math.max(0, Math.min(59, value));
            break;
    }
    input.value = value;
}

// 슬롯 시간 picker 값 설정
function setSlotTimePicker(type, timeString) {
    if (!timeString) return;

    // HH:MM 형식 파싱
    const [hour, minute] = timeString.split(':').map(Number);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    let hour12 = hour % 12;
    if (hour12 === 0) hour12 = 12;

    // Select와 Input(hidden) 모두 업데이트
    const setFieldValue = (field, value) => {
        const select = document.getElementById(`slot-${type}-${field}-select`);
        const input = document.getElementById(`slot-${type}-${field}-input`);

        // 네이티브 select는 value 설정만으로 선택 값이 표시됨
        if (select) {
            select.value = value;
        }
        // Hidden input 값도 업데이트
        if (input) {
            input.value = value;
        }
    };

    // AM/PM 설정
    const ampmSelect = document.getElementById(`slot-${type}-ampm`);
    if (ampmSelect) {
        ampmSelect.value = ampm;
    }

    setFieldValue('hour', hour12);
    setFieldValue('minute', minute);

    // hidden input 업데이트
    updateSlotTimeHidden(type);
}

// 슬롯 시간 hidden input 업데이트
function updateSlotTimeHidden(type) {
    const ampm = document.getElementById(`slot-${type}-ampm`).value;
    // Select 요소에서 직접 값 읽기 (hidden input 의존 제거)
    let hour = parseInt(document.getElementById(`slot-${type}-hour-select`).value) || 0;
    const minute = parseInt(document.getElementById(`slot-${type}-minute-select`).value) || 0;

    // 12시간제를 24시간제로 변환
    if (ampm === 'PM' && hour !== 12) {
        hour += 12;
    } else if (ampm === 'AM' && hour === 12) {
        hour = 0;
    }

    // HH:MM 형식
    const formattedTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    // hidden input에 값 설정
    const hiddenInput = document.getElementById(`slot-${type}`);
    if (hiddenInput) {
        hiddenInput.value = formattedTime;
    }
}

// 기간 목록 로드
async function loadPeriods() {
    try {
        const { data: periods, error } = await supabase
            .from('course_periods')
            .select('*')
            .eq('academy_id', currentAcademyId)
            .order('open_datetime', { ascending: false });

        if (error) throw error;

        const container = document.getElementById('periods-list');

        if (!periods || periods.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <span class="material-symbols-outlined">event_busy</span>
                    <p>등록된 신청 기간이 없습니다.</p>
                    <p class="text-sm mt-2">우측 상단의 '새 기간 생성' 버튼으로 새로운 기간을 만드세요.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = periods.map(period => {
            const openDate = new Date(period.open_datetime);
            const closeDate = period.close_datetime ? new Date(period.close_datetime) : null;
            const now = new Date();
            const isOpen = now >= openDate;
            const isClosed = closeDate && now >= closeDate;

            // 기간 상태 계산
            let statusBadge = '';
            if (!period.is_active) {
                statusBadge = '<span class="status-badge status-inactive">비활성</span>';
            } else if (isClosed) {
                statusBadge = '<span class="status-badge status-inactive">마감</span>';
            } else if (isOpen) {
                statusBadge = '<span class="status-badge status-active">신청 중</span>';
            } else {
                statusBadge = '<span class="status-badge status-pending">오픈 전</span>';
            }

            // 신청 링크 생성
            const registrationLink = `${window.location.origin}/course-registration.html?period=${period.id}`;

            return `
                <div class="period-card ${!period.is_active ? 'inactive' : ''}">
                    <div class="flex items-start justify-between mb-4">
                        <div>
                            <h3 class="text-lg font-bold text-gray-800 mb-1">${escapeHtml(period.name)}</h3>
                            <p class="text-sm text-gray-500">${period.description || '설명 없음'}</p>
                        </div>
                        ${statusBadge}
                    </div>

                    <div class="grid grid-cols-2 gap-4 mb-4 text-sm">
                        <div>
                            <span class="text-gray-500">오픈 시간</span>
                            <p class="font-medium text-gray-800">${formatDateTime(openDate)}</p>
                        </div>
                        <div>
                            <span class="text-gray-500">마감 시간</span>
                            <p class="font-medium text-gray-800">${closeDate ? formatDateTime(closeDate) : '무기한'}</p>
                        </div>
                        <div>
                            <span class="text-gray-500">기본 정원</span>
                            <p class="font-medium text-gray-800">${period.default_capacity}명</p>
                        </div>
                        <div>
                            <span class="text-gray-500">신청 링크</span>
                            <button onclick="copyRegistrationLink('${registrationLink}')" class="copy-link-btn">
                                <span class="material-symbols-outlined text-sm">content_copy</span>
                                링크 복사
                            </button>
                        </div>
                    </div>

                    <div class="flex gap-2">
                        <button onclick="editPeriod('${period.id}')" class="btn-secondary btn-sm">
                            <span class="material-symbols-outlined text-sm">edit</span>
                            수정
                        </button>
                        ${period.is_active ? `
                            <button onclick="togglePeriodActive('${period.id}', false)" class="btn-danger btn-sm">
                                <span class="material-symbols-outlined text-sm">block</span>
                                비활성화
                            </button>
                        ` : `
                            <button onclick="togglePeriodActive('${period.id}', true)" class="btn-primary btn-sm">
                                <span class="material-symbols-outlined text-sm">check</span>
                                활성화
                            </button>
                        `}
                        <button onclick="deletePeriod('${period.id}')" class="btn-secondary btn-sm">
                            <span class="material-symbols-outlined text-sm">delete</span>
                            삭제
                        </button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('[Admin] 기간 목록 로드 오류:', error);
        showError('기간 목록을 불러오는데 실패했습니다.');
    }
}

// 기간 선택 셀렉트박스 채우기
function populatePeriodSelect() {
    const select = document.getElementById('period-select');
    select.innerHTML = '<option value="">기간을 선택하세요</option>';

    supabase
        .from('course_periods')
        .select('id, name, open_datetime')
        .eq('academy_id', currentAcademyId)
        .eq('is_active', true)
        .order('open_datetime', { ascending: false })
        .then(({ data: periods }) => {
            if (periods && periods.length > 0) {
                periods.forEach(period => {
                    const option = document.createElement('option');
                    option.value = period.id;
                    option.textContent = period.name;
                    select.appendChild(option);
                });
            }
        });
}

// 신청 현황 기간 선택 셀렉트박스 채우기
function populateApplicationsPeriodSelect() {
    const select = document.getElementById('applications-period-select');
    select.innerHTML = '<option value="">기간 선택</option>';

    supabase
        .from('course_periods')
        .select('id, name, open_datetime')
        .eq('academy_id', currentAcademyId)
        .order('open_datetime', { ascending: false })
        .then(({ data: periods }) => {
            if (periods && periods.length > 0) {
                periods.forEach(period => {
                    const option = document.createElement('option');
                    option.value = period.id;
                    option.textContent = period.name;
                    select.appendChild(option);
                });
            }
        });
}

// 시간 슬롯 로드
async function loadTimeSlots() {
    const periodId = document.getElementById('period-select').value;
    const container = document.getElementById('slot-management-content');
    const grid = document.getElementById('time-slots-grid');
    const countSpan = document.getElementById('slot-count');

    if (!periodId) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');

    try {
        // 기간 정보도 함께 가져오기
        const [slotsResult, periodResult] = await Promise.all([
            supabase
                .from('course_time_slots')
                .select('*')
                .eq('period_id', periodId)
                .order('day_of_week')
                .order('start_time')
                .then(({ data }) => data),
            supabase
                .from('course_periods')
                .select('default_capacity')
                .eq('id', periodId)
                .single()
        ]);

        currentPeriod = { id: periodId, ...periodResult.data };
        currentTimeSlots = slotsResult || [];

        countSpan.textContent = `(${currentTimeSlots.length}개)`;

        if (currentTimeSlots.length === 0) {
            grid.innerHTML = `
                <div class="empty-state col-span-full">
                    <span class="material-symbols-outlined">schedule</span>
                    <p>등록된 시간 슬롯이 없습니다.</p>
                    <p class="text-sm mt-2">위의 '슬롯 추가' 버튼으로 시간대를 추가하세요.</p>
                </div>
            `;
            return;
        }

        // 시간표 형식으로 표시
        const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
        const dayHeaders = ['월', '화', '수', '목', '금'];

        // 요일별 슬롯 매핑 (start_time 기준 정렬)
        const slotsByDay = {
            'mon': [], 'tue': [], 'wed': [], 'thu': [], 'fri': []
        };

        currentTimeSlots.forEach(slot => {
            if (slotsByDay[slot.day_of_week]) {
                slotsByDay[slot.day_of_week].push(slot);
            }
        });

        // 각 요일별 슬롯을 시작 시간 기준으로 정렬
        days.forEach(day => {
            slotsByDay[day].sort((a, b) => a.start_time.localeCompare(b.start_time));
        });

        // 모든 고유한 시작 시간 추출 (시간순 정렬)
        const allStartTimes = new Set();
        days.forEach(day => {
            slotsByDay[day].forEach(slot => allStartTimes.add(slot.start_time));
        });
        const sortedTimes = Array.from(allStartTimes).sort();

        // 시간표 렌더링
        let timetableHtml = `
            <div class="timetable-container">
                <table class="timetable">
                    <thead>
                        <tr>
                            <th class="timetable-header">시간</th>
                            ${dayHeaders.map(day => `
                                <th class="timetable-header">
                                    <div class="flex items-center justify-center gap-2">
                                        <span>${day}</span>
                                        <button onclick="deleteDaySlots('${days[dayHeaders.indexOf(day)]}')"
                                                class="p-1 hover:bg-red-100 rounded text-red-500 hover:text-red-700 transition-colors"
                                                title="${day}요일 전체 삭제">
                                            <span class="material-symbols-outlined text-sm">delete</span>
                                        </button>
                                    </div>
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        sortedTimes.forEach(time => {
            // 해당 시간대의 슬롯을 찾아 종료 시간 계산
            const endTime = (() => {
                // 첫 번째 슬롯의 종료 시간 사용
                for (const day of days) {
                    const slot = slotsByDay[day].find(s => s.start_time === time);
                    if (slot) return slot.end_time;
                }
                // 슬롯이 없으면 30분 더하기
                const [hour, min] = time.split(':').map(Number);
                const endMin = hour * 60 + min + 30;
                const endHour = Math.floor(endMin / 60);
                const endMinStr = endMin % 60;
                return `${String(endHour).padStart(2, '0')}:${String(endMinStr).padStart(2, '0')}`;
            })();

            timetableHtml += `<tr class="timetable-row">`;
            timetableHtml += `<td class="timetable-time">${time}-${endTime}</td>`;

            days.forEach(day => {
                const slot = slotsByDay[day].find(s => s.start_time === time);
                if (slot) {
                    const isFull = slot.current_count >= slot.capacity;
                    timetableHtml += `
                        <td class="timetable-cell ${isFull ? 'cell-full' : 'cell-available'}" data-slot-id="${slot.id}">
                            <div class="cell-content">
                                <div class="cell-status ${isFull ? 'status-full' : 'status-available'}">
                                    ${isFull ? '마감' : '가능'}
                                </div>
                                <div class="cell-capacity">
                                    <span class="${isFull ? 'text-red-500' : 'text-teal-600'}">
                                        ${slot.current_count}
                                    </span>/${slot.capacity}
                                </div>
                                <div class="cell-actions">
                                    <button onclick="openCapacityEditModal('${slot.id}', ${slot.capacity}, '${day}', '${time}')"
                                            class="cell-edit hover:text-teal-600"
                                            title="정원 수정">
                                        <span class="material-symbols-outlined text-sm">edit</span>
                                    </button>
                                    <button onclick="deleteSlot('${slot.id}')"
                                            class="cell-delete hover:text-red-600"
                                            title="삭제">
                                        <span class="material-symbols-outlined text-sm">delete</span>
                                    </button>
                                </div>
                            </div>
                        </td>
                    `;
                } else {
                    timetableHtml += `
                        <td class="timetable-cell cell-empty" data-day="${day}" data-time="${time}">
                            <button onclick="addSingleSlot('${day}', '${time}')"
                                    class="add-slot-btn"
                                    title="슬롯 추가">
                                <span class="material-symbols-outlined">add_circle</span>
                            </button>
                        </td>
                    `;
                }
            });

            timetableHtml += `</tr>`;
        });

        timetableHtml += `
                    </tbody>
                </table>
            </div>
        `;

        grid.innerHTML = timetableHtml;

    } catch (error) {
        console.error('[Admin] 시간 슬롯 로드 오류:', error);
        showError('시간 슬롯을 불러오는데 실패했습니다.');
    }
}

// 신청 현황 로드
async function loadApplications() {
    const periodId = document.getElementById('applications-period-select').value;
    const tbody = document.getElementById('applications-tbody');

    if (!periodId) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center py-8 text-gray-400">
                    기간을 선택해주세요.
                </td>
            </tr>
        `;
        return;
    }

    try {
        const { data: registrations, error } = await supabase
            .from('course_registrations')
            .select('*')
            .eq('period_id', periodId)
            .order('submission_order', { ascending: true });

        if (error) throw error;

        currentApplications = registrations || [];

        // 슬롯 ID -> 요일/시간 매핑을 위한 데이터 가져오기
        const { data: slots } = await supabase
            .from('course_time_slots')
            .select('id, day_of_week, start_time')
            .eq('period_id', periodId);

        const slotMap = {};
        if (slots) {
            slots.forEach(slot => {
                slotMap[slot.id] = `${dayNames[slot.day]} ${slot.start_time}`;
            });
        }

        // 필터링
        const filtered = currentFilter === 'all'
            ? currentApplications
            : currentApplications.filter(app => app.status === currentFilter);

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-8 text-gray-400">
                        신청 내역이 없습니다.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(app => {
            const statusClass = `status-${app.status}`;
            const statusText = {
                'pending': '처리중',
                'confirmed': '확정',
                'waiting': '대기',
                'cancelled': '취소'
            }[app.status] || app.status;

            // 선택한 시간 표시
            let timeText = '';
            if (app.selected_slot_ids && Array.isArray(app.selected_slot_ids)) {
                const times = app.selected_slot_ids.map(slotId => slotMap[slotId] || '-').filter(t => t !== '-');
                timeText = times.join(', ');
            }

            // 마스킹된 연락처
            const maskedPhone = maskPhoneNumber(app.guardian_phone);

            return `
                <tr class="${app.status === 'cancelled' ? 'opacity-50' : ''}">
                    <td>${formatDateTime(new Date(app.submitted_at))}</td>
                    <td><span class="font-semibold text-gray-700">#${app.submission_order}</span></td>
                    <td class="font-medium">${escapeHtml(app.student_name)}</td>
                    <td>${escapeHtml(app.school_name)}</td>
                    <td>${app.grade}학년</td>
                    <td>${maskedPhone}</td>
                    <td class="text-sm">${timeText || '-'}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <div class="flex gap-1">
                            <button onclick="viewRegistration('${app.id}')" class="p-1.5 hover:bg-gray-100 rounded" title="상세보기">
                                <span class="material-symbols-outlined text-sm text-gray-500">visibility</span>
                            </button>
                            ${app.status !== 'cancelled' ? `
                                <button onclick="cancelRegistration('${app.id}')" class="p-1.5 hover:bg-red-50 rounded" title="취소">
                                    <span class="material-symbols-outlined text-sm text-red-400">cancel</span>
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error('[Admin] 신청 현황 로드 오류:', error);
        showError('신청 현황을 불러오는데 실패했습니다.');
    }
}

// 필터 변경
function filterApplications(filter) {
    currentFilter = filter;

    // 버튼 활성화
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    loadApplications();
}

// 신청 현황 시간표 로드
async function loadApplicationsTimetable() {
    const periodId = document.getElementById('applications-period-select').value;
    const container = document.getElementById('applications-timetable-container');

    if (!periodId) {
        container.innerHTML = `
            <div class="empty-state text-center py-12">
                <span class="material-symbols-outlined text-6xl text-gray-300">table_chart</span>
                <p class="text-gray-500 mt-4">기간을 선택하세요</p>
            </div>
        `;
        return;
    }

    try {
        // 슬롯 데이터 로드
        const { data: slots, error: slotsError } = await supabase
            .from('course_time_slots')
            .select('*')
            .eq('period_id', periodId)
            .order('day_of_week')
            .order('start_time');

        if (slotsError) throw slotsError;

        // 확정된 신청 내역 로드
        const { data: registrations, error: regError } = await supabase
            .from('course_registrations')
            .select('*')
            .eq('period_id', periodId)
            .in('status', ['confirmed', 'waiting']);

        if (regError) throw regError;

        // 요일별 슬롯과 신청자 매핑
        const days = ['mon', 'tue', 'wed', 'thu', 'fri'];
        const dayHeaders = ['월', '화', '수', '목', '금'];
        const slotsByDay = { mon: [], tue: [], wed: [], thu: [], fri: [] };
        const studentsBySlot = {};

        // 슬롯 정리
        if (slots) {
            slots.forEach(slot => {
                if (slotsByDay[slot.day_of_week]) {
                    slotsByDay[slot.day_of_week].push(slot);
                }
            });
        }

        // 슬롯별 학생 매핑
        if (registrations) {
            registrations.forEach(reg => {
                if (reg.confirmed_slot_ids && Array.isArray(reg.confirmed_slot_ids)) {
                    reg.confirmed_slot_ids.forEach(slotId => {
                        if (!studentsBySlot[slotId]) {
                            studentsBySlot[slotId] = [];
                        }
                        studentsBySlot[slotId].push({
                            name: reg.student_name,
                            school: reg.school_name,
                            grade: reg.grade,
                            phone: reg.guardian_phone,
                            status: reg.status
                        });
                    });
                }
            });
        }

        // 각 요일별 슬롯 정렬
        days.forEach(day => {
            slotsByDay[day].sort((a, b) => a.start_time.localeCompare(b.start_time));
        });

        // 모든 고유한 시작 시간 추출
        const allStartTimes = new Set();
        days.forEach(day => {
            slotsByDay[day].forEach(slot => allStartTimes.add(slot.start_time));
        });
        const sortedTimes = Array.from(allStartTimes).sort();

        if (sortedTimes.length === 0) {
            container.innerHTML = `
                <div class="empty-state text-center py-12">
                    <span class="material-symbols-outlined text-6xl text-gray-300">event_busy</span>
                    <p class="text-gray-500 mt-4">등록된 시간 슬롯이 없습니다</p>
                </div>
            `;
            return;
        }

        // 시간표 렌더링
        let timetableHtml = `
            <div class="timetable-container">
                <table class="timetable">
                    <thead>
                        <tr>
                            <th class="timetable-header">시간</th>
                            ${dayHeaders.map(day => `
                                <th class="timetable-header">${day}</th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
        `;

        sortedTimes.forEach(time => {
            // 해당 시간대의 슬롯을 찾아 종료 시간 계산
            const endTime = (() => {
                for (const day of days) {
                    const slot = slotsByDay[day].find(s => s.start_time === time);
                    if (slot) return slot.end_time;
                }
                // 슬롯이 없으면 30분 더하기
                const [hour, min] = time.split(':').map(Number);
                const endMin = hour * 60 + min + 30;
                const endHour = Math.floor(endMin / 60);
                const endMinStr = endMin % 60;
                return `${String(endHour).padStart(2, '0')}:${String(endMinStr).padStart(2, '0')}`;
            })();

            timetableHtml += `<tr class="timetable-row">`;
            timetableHtml += `<td class="timetable-time">${time}-${endTime}</td>`;

            days.forEach(day => {
                const slot = slotsByDay[day].find(s => s.start_time === time);
                if (slot) {
                    const students = studentsBySlot[slot.id] || [];
                    const isFull = students.length >= slot.capacity;
                    const availableSlots = slot.capacity - students.length;

                    timetableHtml += `
                        <td class="timetable-cell ${isFull ? 'cell-full' : 'cell-available'}">
                            <div class="cell-content">
                                <div class="cell-status ${isFull ? 'status-full' : 'status-available'}">
                                    ${isFull ? '마감' : `잔여 ${availableSlots}자리`}
                                </div>
                                <div class="cell-capacity">
                                    <span class="${isFull ? 'text-red-500' : 'text-teal-600'}">
                                        ${students.length}
                                    </span>/${slot.capacity}
                                </div>
                                ${students.length > 0 ? `
                                    <div class="student-list">
                                        ${students.map(s => `
                                            <div class="student-item">
                                                <span class="student-name">${s.name}(${s.grade})</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                ` : ''}
                            </div>
                        </td>
                    `;
                } else {
                    timetableHtml += `<td class="timetable-cell cell-empty"></td>`;
                }
            });

            timetableHtml += `</tr>`;
        });

        timetableHtml += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = timetableHtml;

    } catch (error) {
        console.error('[Admin] 신청 현황 시간표 로드 오류:', error);
        container.innerHTML = `
            <div class="error-state text-center py-12">
                <span class="material-symbols-outlined text-6xl text-red-300">error</span>
                <p class="text-red-500 mt-4">데이터 로드에 실패했습니다</p>
            </div>
        `;
    }
}

// 테이블 뷰 토글
function toggleTableView() {
    const tableContainer = document.getElementById('applications-table-container');
    const timetableContainer = document.getElementById('applications-timetable-container');

    tableContainer.classList.toggle('hidden');
    if (tableContainer.classList.contains('hidden')) {
        timetableContainer.classList.remove('hidden');
        loadApplicationsTimetable();
    } else {
        timetableContainer.classList.add('hidden');
        loadApplications();
    }
}

// 기간 모달 열기
function openPeriodModal(periodId = null) {
    const modal = document.getElementById('period-modal');
    const form = document.getElementById('period-form');
    const title = modal.querySelector('h3');

    form.reset();
    document.getElementById('period-id').value = '';

    if (periodId) {
        title.textContent = '기간 수정';
        // 기간 정보 로드 (수정 모드)
        loadPeriodForEdit(periodId);
    } else {
        title.textContent = '새 신청 기간 생성';
        // 기본 오픈 시간을 내일 10시로 설정
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        setDateTimePicker('open', tomorrow);

        // 마감 시간 picker 초기화
        initDatePicker('close');
    }

    modal.classList.add('show');
}

// 기간 수정 모달
function editPeriod(periodId) {
    openPeriodModal(periodId);
}

// 기간 정보 로드 (수정용)
async function loadPeriodForEdit(periodId) {
    try {
        const { data: period } = await supabase
            .from('course_periods')
            .select('*')
            .eq('id', periodId)
            .single();

        if (period) {
            document.getElementById('period-id').value = period.id;
            document.getElementById('period-name').value = period.name;

            // 오픈 일시 설정
            setDateTimePicker('open', new Date(period.open_datetime));

            // 마감 일시 설정
            if (period.close_datetime) {
                setDateTimePicker('close', new Date(period.close_datetime));
            }

            document.getElementById('period-description').value = period.description || '';
        }
    } catch (error) {
        console.error('[Admin] 기간 정보 로드 오류:', error);
        showError('기간 정보를 불러오는데 실패했습니다.');
    }
}

// 기간 모달 닫기
function closePeriodModal() {
    document.getElementById('period-modal').classList.remove('show');
}

// 기간 저장
async function savePeriod(event) {
    event.preventDefault();

    const id = document.getElementById('period-id').value;
    const name = document.getElementById('period-name').value.trim();
    const openDatetime = document.getElementById('period-open').value;
    const closeDatetime = document.getElementById('period-close').value;
    const description = document.getElementById('period-description').value.trim();

    if (!name || !openDatetime) {
        showError('필수 항목을 모두 입력해주세요.');
        return;
    }

    try {
        const data = {
            name,
            open_datetime: new Date(openDatetime).toISOString(),
            close_datetime: closeDatetime ? new Date(closeDatetime).toISOString() : null,
            default_capacity: 5, // 기본 정원 5명 고정
            slot_interval_minutes: 30, // 기본 슬롯 단위 30분 고정
            description: description || null
        };

        let result;
        if (id) {
            // 수정
            result = await supabase
                .from('course_periods')
                .update({ ...data, updated_at: new Date().toISOString() })
                .eq('id', id);
        } else {
            // 생성
            result = await supabase
                .from('course_periods')
                .insert({
                    ...data,
                    academy_id: currentAcademyId,
                    is_active: true
                });
        }

        if (result.error) throw result.error;

        showToast(id ? '기간이 수정되었습니다.' : '새 기간이 생성되었습니다.');
        closePeriodModal();
        await loadPeriods();

    } catch (error) {
        console.error('[Admin] 기간 저장 오류:', error);
        showError('기간 저장에 실패했습니다.');
    }
}

// 기간 활성화/비활성화 토글
async function togglePeriodActive(periodId, isActive) {
    try {
        const { error } = await supabase
            .from('course_periods')
            .update({ is_active: isActive, updated_at: new Date().toISOString() })
            .eq('id', periodId);

        if (error) throw error;

        showToast(isActive ? '기간이 활성화되었습니다.' : '기간이 비활성화되었습니다.');
        await loadPeriods();

    } catch (error) {
        console.error('[Admin] 기간 상태 변경 오류:', error);
        showError('상태 변경에 실패했습니다.');
    }
}

// 기간 삭제
async function deletePeriod(periodId) {
    const confirmed = await showConfirm(
        '기간 삭제',
        '정말 삭제하시겠습니까?<br><br>⚠️ 관련 신청 내역도 모두 삭제됩니다.'
    );

    if (!confirmed) return;

    try {
        const { error } = await supabase
            .from('course_periods')
            .delete()
            .eq('id', periodId);

        if (error) throw error;

        showToast('기간이 삭제되었습니다.');
        await loadPeriods();

    } catch (error) {
        console.error('[Admin] 기간 삭제 오류:', error);
        showError('삭제에 실패했습니다.');
    }
}

// 슬롯 모달 열기
function openSlotModal() {
    if (!currentPeriod || !currentPeriod.id) {
        showError('먼저 기간을 선택해주세요.');
        return;
    }

    // form.reset() 대신 필요한 필드만 수동으로 리셋
    // form.reset()는 select의 selectedIndex를 -1로 만들어 값이 보이지 않게 함
    document.getElementById('selected-days').value = '';
    document.querySelectorAll('.day-option').forEach(d => d.classList.remove('selected'));

    // 기본 정원 설정
    const defaultCapacity = currentPeriod.default_capacity || 5;
    document.getElementById('slot-capacity').value = defaultCapacity;

    // 기본 슬롯 인터벌 설정 (기간의 인터벌 사용)
    const slotInterval = currentPeriod.slot_interval_minutes || 30;
    document.getElementById('slot-custom-interval-input').value = slotInterval;
    document.getElementById('slot-interval').value = slotInterval;

    // 버튼 선택 상태 업데이트
    const slotModal = document.getElementById('slot-modal');
    slotModal.querySelectorAll('.interval-select-btn').forEach(btn => {
        const interval = parseInt(btn.dataset.interval);
        if (interval === slotInterval) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 시간 picker 초기화 및 기본값 설정
    initSlotTimePickerDropdowns();
    setSlotTimePicker('start', '13:00'); // 오후 1시
    setSlotTimePicker('end', '17:00');   // 오후 5시

    // 정원 picker 초기화
    initSlotCapacityPicker();

    document.getElementById('slot-modal').classList.add('show');
}

// 슬롯 시간 picker 드롭다운 초기화
function initSlotTimePickerDropdowns() {
    ['start', 'end'].forEach(type => {
        // 시간 옵션 (1-12) - 네이티브 select는 이미 HTML에 정의되어 있음
        const hourSelect = document.getElementById(`slot-${type}-hour-select`);
        const hourInput = document.getElementById(`slot-${type}-hour-input`);
        if (hourSelect) {
            // 기본값 10시로 설정
            hourSelect.value = 10;
            if (hourInput) {
                hourInput.value = 10;
            }
        }

        // 분 옵션 (0-59, 5분 단위) - 네이티브 select는 이미 HTML에 정의되어 있음
        const minuteSelect = document.getElementById(`slot-${type}-minute-select`);
        const minuteInput = document.getElementById(`slot-${type}-minute-input`);
        if (minuteSelect) {
            // 기본값 0분으로 설정
            minuteSelect.value = 0;
            if (minuteInput) {
                minuteInput.value = 0;
            }
        }

        // 오전/오후 기본값 설정
        const ampmSelect = document.getElementById(`slot-${type}-ampm`);
        if (ampmSelect) {
            ampmSelect.value = type === 'start' ? 'AM' : 'PM';
        }
    });
}

// 슬롯 모달 닫기
function closeSlotModal() {
    document.getElementById('slot-modal').classList.remove('show');
}

// 요일 토글
function toggleDay(day) {
    const option = document.querySelector(`.day-option[data-day="${day}"]`);
    option.classList.toggle('selected');

    const selectedDays = Array.from(document.querySelectorAll('.day-option.selected'))
        .map(d => d.dataset.day);

    document.getElementById('selected-days').value = selectedDays.join(',');
}

// 슬롯 정원 조절 (증가/감소)
function adjustSlotCapacity(delta) {
    const input = document.getElementById('slot-capacity');
    const select = document.getElementById('slot-capacity-select');
    let currentValue = parseInt(input?.value) || 0;
    let newValue = currentValue + delta;

    // 1-50 범위 체크
    if (newValue < 1) newValue = 1;
    if (newValue > 50) newValue = 50;

    if (input) input.value = newValue;
    if (select) select.value = newValue;
}

// 슬롯 정원 초기화
function initSlotCapacityPicker() {
    const select = document.getElementById('slot-capacity-select');
    const input = document.getElementById('slot-capacity');

    if (select) {
        // 현재 값 저장
        const currentValue = parseInt(input?.value) || 5;

        // 옵션 생성 (1-50)
        select.innerHTML = '';
        for (let c = 1; c <= 50; c++) {
            const option = document.createElement('option');
            option.value = c;
            option.textContent = c;
            select.appendChild(option);
        }
        select.value = currentValue;

        // Select 변경 시 input 업데이트
        select.addEventListener('change', () => {
            if (input) {
                input.value = parseInt(select.value);
            }
        });

        // Input 변경 시 select 업데이트
        if (input) {
            input.addEventListener('input', () => {
                // 값 유효성 검사
                let value = parseInt(input.value);
                if (isNaN(value)) value = 1;
                if (value < 1) value = 1;
                if (value > 50) value = 50;
                input.value = value;

                if (select) {
                    select.value = value;
                }
            });
        }
    }
}

// 슬롯 저장 (일괄 생성)
async function saveSlot(event) {
    event.preventDefault();

    const selectedDays = document.getElementById('selected-days').value;
    if (!selectedDays) {
        showError('요일을 선택해주세요.');
        return;
    }

    // 시간 파싱 (HH:MM 형식)
    const startTime = document.getElementById('slot-start').value;
    const endTime = document.getElementById('slot-end').value;

    if (!startTime || !endTime) {
        showError('시간을 선택해주세요.');
        return;
    }

    const capacity = parseInt(document.getElementById('slot-capacity').value);

    // 커스텀 입력 필드 값 사용
    const customInput = document.getElementById('slot-custom-interval-input');
    let interval = parseInt(customInput.value) || 30;

    // 유효성 검사
    if (interval < 5 || interval > 120) {
        showError('슬롯 단위 시간은 5분 ~ 120분 사이로 입력해주세요.');
        return;
    }

    // 시작 시간과 종료 시간을 분 단위로 변환
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startTotalMin = startHour * 60 + startMin;
    const endTotalMin = endHour * 60 + endMin;

    // 유효성 검사
    if (startTotalMin >= endTotalMin) {
        showError('종료 시간은 시작 시간보다 늦어야 합니다.');
        return;
    }

    // 슬롯 생성
    const days = selectedDays.split(',');
    const slotsToInsert = [];

    for (let currentMin = startTotalMin; currentMin < endTotalMin; currentMin += interval) {
        // 슬롯 종료 시간 = 시작 + 단위 시간
        const slotEndTotalMin = currentMin + interval;
        if (slotEndTotalMin > endTotalMin) {
            break;
        }

        const slotStartHour = Math.floor(currentMin / 60);
        const slotStartMin = currentMin % 60;

        // 슬롯 시작 시간
        const slotStart = `${String(slotStartHour).padStart(2, '0')}:${String(slotStartMin).padStart(2, '0')}`;

        // 슬롯 종료 시간 = 시작 + 단위 시간
        const slotEndHour = Math.floor(slotEndTotalMin / 60);
        const slotEndMin = slotEndTotalMin % 60;
        const slotEnd = `${String(slotEndHour).padStart(2, '0')}:${String(slotEndMin).padStart(2, '0')}`;

        // 각 요일별 슬롯 생성
        days.forEach(day => {
            slotsToInsert.push({
                period_id: currentPeriod.id,
                day_of_week: day,
                start_time: slotStart,
                end_time: slotEnd,
                capacity
            });
        });
    }

    try {
        const { error } = await supabase
            .from('course_time_slots')
            .insert(slotsToInsert);

        if (error) throw error;

        showToast(`${slotsToInsert.length}개의 슬롯이 생성되었습니다.`);
        closeSlotModal();
        await loadTimeSlots();

    } catch (error) {
        console.error('[Admin] 슬롯 저장 오류:', error);
        if (error.code === '23505') {
            showError('일부 시간대는 이미 존재합니다. 중복을 확인해주세요.');
        } else {
            showError('슬롯 생성에 실패했습니다.');
        }
    }
}

// 시간 슬롯 유효성 검사 (더 이상 사용하지 않음)
function isValidTimeSlot(start, end) {
    const startParts = start.split(':');
    const endParts = end.split(':');

    if (startParts.length !== 2 || endParts.length !== 2) return false;

    const startMin = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
    const endMin = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);

    // 30분 단위 체크
    if (startMin % 30 !== 0 || endMin % 30 !== 0) return false;

    // 종료가 시작보다 커야 함
    return endMin > startMin;
}

// 슬롯 삭제
async function deleteSlot(slotId) {
    const confirmed = await showConfirm(
        '슬롯 삭제',
        '이 시간 슬롯을 삭제하시겠습니까?'
    );

    if (!confirmed) return;

    try {
        const { error } = await supabase
            .from('course_time_slots')
            .delete()
            .eq('id', slotId);

        if (error) throw error;

        showToast('슬롯이 삭제되었습니다.');
        await loadTimeSlots();

    } catch (error) {
        console.error('[Admin] 슬롯 삭제 오류:', error);
        showError('삭제에 실패했습니다.');
    }
}

// 전체 슬롯 삭제
async function deleteAllSlots() {
    const confirmed = await showConfirm(
        '전체 슬롯 삭제',
        '선택한 기간의 모든 시간 슬롯을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.'
    );

    if (!confirmed) return;

    try {
        const { error } = await supabase
            .from('course_time_slots')
            .delete()
            .eq('period_id', currentPeriod.id);

        if (error) throw error;

        showToast('모든 슬롯이 삭제되었습니다.');
        await loadTimeSlots();

    } catch (error) {
        console.error('[Admin] 전체 슬롯 삭제 오류:', error);
        showError('삭제에 실패했습니다.');
    }
}

// 단일 슬롯 추가
async function addSingleSlot(day, time) {
    if (!currentPeriod || !currentPeriod.id) {
        showError('기간 정보가 없습니다.');
        return;
    }

    // 기간의 슬롯 단위 시간 사용
    const interval = currentPeriod.slot_interval_minutes || 30;

    // 종료 시간 계산 (시작 시간 + 단위 시간)
    const [hour, min] = time.split(':').map(Number);
    const endMin = hour * 60 + min + interval;
    const endHour = Math.floor(endMin / 60);
    const endMinStr = endMin % 60;
    const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinStr).padStart(2, '0')}`;

    // 기본 정원
    const capacity = currentPeriod.default_capacity || 5;

    try {
        const { error } = await supabase
            .from('course_time_slots')
            .insert({
                period_id: currentPeriod.id,
                day_of_week: day,
                start_time: time,
                end_time: endTime,
                capacity: capacity,
                current_count: 0
            });

        if (error) throw error;

        showToast('슬롯이 추가되었습니다.');
        await loadTimeSlots();

    } catch (error) {
        console.error('[Admin] 단일 슬롯 추가 오류:', error);
        if (error.code === '23505') {
            showError('이미 존재하는 시간대입니다.');
        } else {
            showError('슬롯 추가에 실패했습니다.');
        }
    }
}

// 정원 조절 (증가/감소)
function adjustCapacity(delta) {
    const input = document.getElementById('edit-slot-capacity');
    let currentValue = parseInt(input.value) || 0;
    let newValue = currentValue + delta;

    // 1-50 범위 체크
    if (newValue < 1) newValue = 1;
    if (newValue > 50) newValue = 50;

    input.value = newValue;
}

// 정원 수정 모달 열기
function openCapacityEditModal(slotId, currentCapacity, day, time) {
    const modal = document.getElementById('capacity-edit-modal');
    const timeDisplay = document.getElementById('edit-slot-time-display');
    const capacityInput = document.getElementById('edit-slot-capacity');
    const slotIdInput = document.getElementById('edit-slot-id');
    const dayInput = document.getElementById('edit-slot-day');
    const timeInput = document.getElementById('edit-slot-time');

    // 요일 한글명 변환
    const dayKorean = { 'mon': '월', 'tue': '화', 'wed': '수', 'thu': '목', 'fri': '금' }[day] || day;

    // 슬롯 정보를 찾아서 시간대 표시
    const slot = currentTimeSlots.find(s => s.id === slotId);
    if (slot) {
        timeDisplay.textContent = `${dayKorean}요일 ${slot.start_time}-${slot.end_time}`;
    } else {
        timeDisplay.textContent = `${dayKorean}요일 ${time}`;
    }

    // 현재 정원 설정
    capacityInput.value = currentCapacity;
    capacityInput.min = 1; // 최소 1명
    capacityInput.max = 50; // 최대 50명

    // 슬롯 ID 저장
    slotIdInput.value = slotId;
    dayInput.value = day;
    timeInput.value = time;

    // 모달 표시
    modal.classList.add('show');
}

// 정원 수정 모달 닫기
function closeCapacityEditModal() {
    const modal = document.getElementById('capacity-edit-modal');
    modal.classList.remove('show');

    // 폼 초기화
    document.getElementById('capacity-edit-form').reset();
}

// 슬롯 정원 업데이트
async function updateSlotCapacity(event) {
    event.preventDefault();

    const slotId = document.getElementById('edit-slot-id').value;
    const newCapacity = parseInt(document.getElementById('edit-slot-capacity').value);

    if (!slotId) {
        showError('슬롯 ID가 없습니다.');
        return;
    }

    if (isNaN(newCapacity) || newCapacity < 1 || newCapacity > 50) {
        showError('정원은 1-50명 사이로 설정해주세요.');
        return;
    }

    try {
        // 먼저 현재 슬롯 정보를 가져와서 current_count 확인
        const { data: currentSlot, error: fetchError } = await supabase
            .from('course_time_slots')
            .select('current_count')
            .eq('id', slotId)
            .single();

        if (fetchError) throw fetchError;

        if (currentSlot && newCapacity < currentSlot.current_count) {
            const confirmed = await showConfirm(
                '정원 감소 경고',
                `현재 ${currentSlot.current_count}명이 신청했는데 정원을 ${newCapacity}명으로 줄이면 ${currentSlot.current_count - newCapacity}명이 대기자가 됩니다.\n\n정말 변경하시겠습니까?`
            );
            if (!confirmed) return;
        }

        // 정원 업데이트
        const { error } = await supabase
            .from('course_time_slots')
            .update({ capacity: newCapacity })
            .eq('id', slotId);

        if (error) throw error;

        showToast('정원이 수정되었습니다.');
        closeCapacityEditModal();
        await loadTimeSlots();

    } catch (error) {
        console.error('[Admin] 정원 수정 오류:', error);
        showError('정원 수정에 실패했습니다.');
    }
}

// 요일별 슬롯 일괄 삭제
async function deleteDaySlots(day) {
    if (!currentPeriod || !currentPeriod.id) {
        showError('기간 정보가 없습니다.');
        return;
    }

    const confirmed = await showConfirm(
        '요일 슬롯 삭제',
        `${dayNames[day]} 모든 슬롯을 삭제하시겠습니까?\n\n⚠️ 이 작업은 되돌릴 수 없습니다.`
    );

    if (!confirmed) return;

    try {
        const { error } = await supabase
            .from('course_time_slots')
            .delete()
            .eq('period_id', currentPeriod.id)
            .eq('day_of_week', day);

        if (error) throw error;

        showToast(`${dayNames[day]} 슬롯이 모두 삭제되었습니다.`);
        await loadTimeSlots();

    } catch (error) {
        console.error('[Admin] 요일별 슬롯 삭제 오류:', error);
        showError('삭제에 실패했습니다.');
    }
}

// 전체 초기화 확인 모달 열기
function openResetAllConfirmModal() {
    const periodId = document.getElementById('applications-period-select').value;

    if (!periodId) {
        showError('먼저 기간을 선택해주세요.');
        return;
    }

    const modal = document.getElementById('reset-all-modal');
    modal.classList.add('show');
}

// 전체 초기화 확인 모달 닫기
function closeResetAllConfirmModal() {
    const modal = document.getElementById('reset-all-modal');
    modal.classList.remove('show');
}

// 전체 신청 초기화 실행
async function confirmResetAllApplications() {
    const periodId = document.getElementById('applications-period-select').value;

    if (!periodId) {
        showError('기간을 선택해주세요.');
        closeResetAllConfirmModal();
        return;
    }

    try {
        // 모든 신청 삭제
        const { error: deleteError } = await supabase
            .from('course_registrations')
            .delete()
            .eq('period_id', periodId);

        if (deleteError) throw deleteError;

        // 모든 슬롯의 current_count를 0으로 초기화
        const { error: updateError } = await supabase
            .from('course_time_slots')
            .update({ current_count: 0 })
            .eq('period_id', periodId);

        if (updateError) throw updateError;

        closeResetAllConfirmModal();
        showToast('모든 신청 내역이 초기화되었습니다.');

        // 현재 뷰 새로고침
        if (currentViewMode === 'timetable') {
            loadApplicationsTimetable();
        } else {
            loadApplications();
        }

    } catch (error) {
        console.error('[Admin] 전체 초기화 오류:', error);
        showError('초기화에 실패했습니다: ' + error.message);
        closeResetAllConfirmModal();
    }
}

// 전체 슬롯 초기화 (current_count를 0으로 리셋) - 기존 함수 유지
async function resetAllSlots() {
    const periodId = document.getElementById('applications-period-select').value;

    if (!periodId) {
        showError('기간을 선택해주세요.');
        return;
    }

    const confirmed = await showConfirm(
        '슬롯 초기화',
        '정말 모든 슬롯의 신청 인원을 초기화하시겠습니까?\n\n모든 시간대의 수강인원이 0으로 리셋됩니다.\n\n⚠️ 이 작업은 되돌릴 수 없습니다.'
    );

    if (!confirmed) {
        return;
    }

    try {
        const { error } = await supabase
            .from('course_time_slots')
            .update({ current_count: 0 })
            .eq('period_id', periodId);

        if (error) throw error;

        showToast('모든 슬롯이 초기화되었습니다.');
        // 즉시 UI 업데이트 (기다리지 않고 먼저 화면 갱신)
        loadApplicationsTimetable();

    } catch (error) {
        console.error('[Admin] 전체 슬롯 초기화 오류:', error);
        showError('초기화에 실패했습니다.');
    }
}

// 신청 상세 보기
async function viewRegistration(registrationId) {
    try {
        const { data: registration } = await supabase
            .from('course_registrations')
            .select('*')
            .eq('id', registrationId)
            .single();

        if (!registration) {
            showError('신청 정보를 찾을 수 없습니다.');
            return;
        }

        // 슬롯 정보 가져오기
        const { data: slots } = await supabase
            .from('course_time_slots')
            .select('id, day_of_week, start_time, end_time, capacity, current_count')
            .eq('period_id', registration.period_id);

        const slotMap = {};
        if (slots) {
            slots.forEach(slot => {
                slotMap[slot.id] = slot;
            });
        }

        // 선택한 슬롯 정보 정리
        let selectedSlotsHtml = '';
        if (registration.selected_slot_ids && Array.isArray(registration.selected_slot_ids)) {
            selectedSlotsHtml = registration.selected_slot_ids.map(slotId => {
                const slot = slotMap[slotId];
                return slot ? `${dayNames[slot.day_of_week]} ${slot.start_time}-${slot.end_time}` : '-';
            }).join(' / ');
        }

        // 확정된 슬롯 정보
        let confirmedSlotsHtml = '-';
        if (registration.confirmed_slot_ids && Array.isArray(registration.confirmed_slot_ids)) {
            confirmedSlotsHtml = registration.confirmed_slot_ids.map(slotId => {
                const slot = slotMap[slotId];
                return slot ? `${dayNames[slot.day_of_week]} ${slot.start_time}-${slot.end_time}` : '-';
            }).join(' / ') || '-';
        }

        const statusText = {
            'pending': '처리중',
            'confirmed': '확정',
            'waiting': '대기',
            'cancelled': '취소'
        }[registration.status] || registration.status;

        const content = document.getElementById('registration-detail-content');
        content.innerHTML = `
            <div class="space-y-4">
                <div class="flex justify-between items-center">
                    <h4 class="font-semibold text-gray-700">신청 정보</h4>
                    <span class="status-badge status-${registration.status}">${statusText}</span>
                </div>

                <div class="bg-gray-50 rounded-xl p-4 space-y-3">
                    <div class="flex justify-between">
                        <span class="text-gray-500">신청 순서</span>
                        <span class="font-medium">#${registration.submission_order}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-500">신청 시간</span>
                        <span class="font-medium">${formatDateTime(new Date(registration.submitted_at))}</span>
                    </div>
                </div>

                <h4 class="font-semibold text-gray-700">학생 정보</h4>
                <div class="bg-gray-50 rounded-xl p-4 space-y-3">
                    <div class="flex justify-between">
                        <span class="text-gray-500">학생명</span>
                        <span class="font-medium">${escapeHtml(registration.student_name)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-500">학교</span>
                        <span class="font-medium">${escapeHtml(registration.school_name)}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-500">학년</span>
                        <span class="font-medium">${registration.grade}학년</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-gray-500">연락처</span>
                        <span class="font-medium">${maskPhoneNumber(registration.guardian_phone)}</span>
                    </div>
                </div>

                <h4 class="font-semibold text-gray-700">선택 시간</h4>
                <div class="bg-gray-50 rounded-xl p-4">
                    <div class="text-sm text-gray-500 mb-1">희망 시간</div>
                    <div class="font-medium">${selectedSlotsHtml}</div>
                </div>

                <div class="bg-gray-50 rounded-xl p-4">
                    <div class="text-sm text-gray-500 mb-1">확정 시간</div>
                    <div class="font-medium ${registration.status === 'confirmed' ? 'text-green-600' : 'text-orange-500'}">${confirmedSlotsHtml}</div>
                </div>

                ${registration.status !== 'cancelled' ? `
                    <button onclick="cancelRegistration('${registration.id}'); closeRegistrationModal();" class="w-full btn-danger">
                        <span class="material-symbols-outlined">cancel</span>
                        신청 취소하기
                    </button>
                ` : ''}
            </div>
        `;

        document.getElementById('registration-modal').classList.add('show');

    } catch (error) {
        console.error('[Admin] 신청 상세 로드 오류:', error);
        showError('신청 정보를 불러오는데 실패했습니다.');
    }
}

// 신청 상세 모달 닫기
function closeRegistrationModal() {
    document.getElementById('registration-modal').classList.remove('show');
}

// 신청 취소
async function cancelRegistration(registrationId) {
    const confirmed = await showConfirm(
        '신청 취소',
        '이 신청을 취소하시겠습니까?'
    );

    if (!confirmed) return;

    try {
        // RPC 함수 호출 (정원 반영 포함)
        const { data, error } = await supabase.rpc('cancel_course_registration', {
            p_registration_id: registrationId,
            p_academy_id: currentAcademyId
        });

        if (error) throw error;

        if (data && data.success === false) {
            showError(data.error === 'NOT_FOUND' ? '신청 정보를 찾을 수 없습니다.' : '취소에 실패했습니다.');
            return;
        }

        showToast('신청이 취소되었습니다.');
        await loadApplications();

    } catch (error) {
        console.error('[Admin] 신청 취소 오류:', error);
        showError('취소에 실패했습니다.');
    }
}

// CSV 내보내기
function exportCSV() {
    if (!currentApplications || currentApplications.length === 0) {
        showError('내보낼 데이터가 없습니다.');
        return;
    }

    const headers = ['신청순서', '신청시간', '학생명', '학교', '학년', '연락처', '상태'];
    const rows = currentApplications.map(app => [
        app.submission_order,
        formatDateTime(new Date(app.submitted_at)),
        app.student_name,
        app.school_name,
        app.grade,
        app.guardian_phone,
        { 'pending': '처리중', 'confirmed': '확정', 'waiting': '대기', 'cancelled': '취소' }[app.status] || app.status
    ]);

    let csvContent = headers.join(',') + '\n';
    csvContent += rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `수강신청_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
}

// 링크 복사
function copyRegistrationLink(link) {
    navigator.clipboard.writeText(link).then(() => {
        showToast('링크가 복사되었습니다.');
    }).catch(() => {
        showError('링크 복사에 실패했습니다.');
    });
}

// ==================== 유틸리티 함수 ====================

// 날짜시간 포맷 (로컬)
function formatDateTime(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}.${m}.${d} ${h}:${min}`;
}

// datetime-local input용 포맷
function formatDateTimeLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d}T${h}:${min}`;
}

// 연락처 마스킹
function maskPhoneNumber(phone) {
    if (!phone) return '-';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11) {
        return `${cleaned.slice(0, 3)}-****-${cleaned.slice(7)}`;
    } else if (cleaned.length === 10) {
        return `${cleaned.slice(0, 3)}-***-${cleaned.slice(6)}`;
    }
    return phone;
}

// HTML 이스케이프
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 토스트 메시지 표시
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    toastMessage.textContent = message;
    toast.classList.remove('opacity-0', 'translate-y-4');
    toast.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-4');
        toast.classList.remove('opacity-100', 'translate-y-0');
    }, 3000);
}

// 에러 메시지 표시
function showError(message) {
    showToast(message);
}

// 커스텀 확인 모달 표시
function showConfirm(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const messageEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');

        titleEl.textContent = title;
        messageEl.innerHTML = message;

        confirmCallback = null;

        const handleOk = () => {
            modal.classList.remove('show');
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            resolve(true);
        };

        const handleCancel = () => {
            modal.classList.remove('show');
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
            resolve(false);
        };

        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);

        modal.classList.add('show');
    });
}
