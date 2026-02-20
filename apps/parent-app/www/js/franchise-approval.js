// 학부모 승인 기능 관련 스크립트

// 승인 대기 학생 목록 로드
async function loadPendingStudents() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 승인 대기중인 학생 목록 조회
        const { data: pendingStudents, error } = await supabase
            .from('students')
            .select('*, profiles!inner(email, name, full_phone)')
            .eq('academy_id', user.id)
            .eq('approval_status', 'pending')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('승인 대기 목록 조회 실패:', error);
            return;
        }

        // 처리 완료 목록도 조회
        const { data: processedStudents } = await supabase
            .from('students')
            .select('*, profiles!inner(email, name, full_phone)')
            .eq('academy_id', user.id)
            .in('approval_status', ['approved', 'rejected'])
            .order('created_at', { ascending: false })
            .limit(20);

        renderPendingStudents(pendingStudents || []);
        renderProcessedStudents(processedStudents || []);
        updatePendingCount(pendingStudents?.length || 0);

    } catch (error) {
        console.error('loadPendingStudents 에러:', error);
    }
}

// 승인 대기 목록 렌더링
function renderPendingStudents(students) {
    const container = document.getElementById('pending-students-list');

    if (!students || students.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <span class="material-symbols-outlined text-4xl">inbox</span>
                <p class="mt-2">승인 대기중인 신청이 없습니다</p>
            </div>
        `;
        return;
    }

    container.innerHTML = students.map(student => `
        <div class="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
            <div class="flex justify-between items-start mb-3">
                <div class="flex-1">
                    <h5 class="font-bold text-gray-800">${student.name}</h5>
                    <p class="text-sm text-gray-600">${student.school_name || '-'} ${student.grade ? student.grade + '학년' : ''}</p>
                    <p class="text-sm text-gray-500 mt-1">
                        <span class="material-symbols-outlined text-sm align-middle">cake</span>
                        생일: ${student.birth_date || '-'}
                    </p>
                    <p class="text-sm text-gray-500">
                        <span class="material-symbols-outlined text-sm align-middle">phone</span>
                        ${student.full_phone || '-'}
                    </p>
                    <p class="text-sm text-gray-500">
                        <span class="material-symbols-outlined text-sm align-middle">family_restroom</span>
                        학부모: ${student.full_phone || '-'}
                    </p>
                </div>
                <span class="bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full font-semibold">대기중</span>
            </div>
            <div class="flex gap-2 mt-3">
                <button onclick="approveStudent('${student.id}')" class="flex-1 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium text-sm transition">
                    <span class="material-symbols-outlined text-sm align-middle">check</span>
                    승인
                </button>
                <button onclick="showRejectStudentModal('${student.id}')" class="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium text-sm transition">
                    <span class="material-symbols-outlined text-sm align-middle">close</span>
                    거절
                </button>
            </div>
        </div>
    `).join('');
}

// 처리 완료 목록 렌더링
function renderProcessedStudents(students) {
    const container = document.getElementById('processed-list');

    if (!students || students.length === 0) {
        document.getElementById('processed-students-list').innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <p class="text-sm">처리된 신청이 없습니다</p>
            </div>
        `;
        return;
    }

    document.getElementById('processed-students-list').innerHTML = students.map(student => {
        const isApproved = student.approval_status === 'approved';
        const statusClass = isApproved ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200';
        const statusBadge = isApproved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
        const statusText = isApproved ? '승인완료' : '거절';

        return `
            <div class="border-2 ${statusClass} rounded-xl p-4">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <h5 class="font-bold text-gray-800">${student.name}</h5>
                        <p class="text-sm text-gray-600">${student.school_name || '-'} ${student.grade ? student.grade + '학년' : ''}</p>
                    </div>
                    <span class="${statusBadge} text-xs px-2 py-1 rounded-full font-semibold">${statusText}</span>
                </div>
                ${student.rejection_reason ? `
                    <p class="text-sm text-red-600 mt-2">
                        <strong>거절 사유:</strong> ${student.rejection_reason}
                    </p>
                ` : ''}
            </div>
        `;
    }).join('');
}

// 승인 대기 카운트 업데이트
function updatePendingCount(count) {
    const badge = document.getElementById('pending-count-badge');
    const headerBadge = document.getElementById('pending-count-header');

    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
        headerBadge.textContent = count;
    } else {
        badge.classList.add('hidden');
        headerBadge.textContent = '0';
    }
}

// 학생 승인
async function approveStudent(studentId) {
    if (!confirm('이 학생의 가입을 승인하시겠습니까?')) return;

    try {
        const { error } = await supabase
            .from('students')
            .update({
                approval_status: 'approved',
                rejection_reason: null
            })
            .eq('id', studentId);

        if (error) throw error;

        // 알림 읽음 처리
        await supabase
            .from('parent_registration_notifications')
            .update({ is_read: true })
            .eq('student_id', studentId);

        showToast('승인이 완료되었습니다.', 'success');
        loadPendingStudents();

    } catch (error) {
        console.error('승인 에러:', error);
        showToast('승인에 실패했습니다.', 'error');
    }
}

// 거절 모달 표시
function showRejectStudentModal(studentId) {
    let modal = document.getElementById('reject-student-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'reject-student-modal';
        modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] hidden flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
                <h3 class="text-lg font-bold text-gray-800 mb-4">거절 사유 입력</h3>
                <textarea id="reject-reason-input" class="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-red-400 focus:outline-none resize-none" rows="3" placeholder="거절 사유를 입력해주세요..."></textarea>
                <div class="flex gap-3 mt-4">
                    <button onclick="closeRejectStudentModal()" class="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition">취소</button>
                    <button onclick="confirmRejectStudent()" class="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition">거절</button>
                </div>
            </div>
        `;
        modal.onclick = (e) => {
            if (e.target === modal) closeRejectStudentModal();
        };
        document.body.appendChild(modal);
    }

    modal.dataset.studentId = studentId;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('reject-reason-input').value = '';
    document.getElementById('reject-reason-input').focus();
}

// 거절 모달 닫기
function closeRejectStudentModal() {
    const modal = document.getElementById('reject-student-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        modal.dataset.studentId = '';
    }
}

// 학생 거절 확정
async function confirmRejectStudent() {
    const modal = document.getElementById('reject-student-modal');
    const studentId = modal?.dataset.studentId;
    const reason = document.getElementById('reject-reason-input').value.trim();

    if (!reason) {
        alert('거절 사유를 입력해주세요.');
        return;
    }

    try {
        const { error } = await supabase
            .from('students')
            .update({
                approval_status: 'rejected',
                rejection_reason: reason
            })
            .eq('id', studentId);

        if (error) throw error;

        closeRejectStudentModal();
        showToast('거절 처리가 완료되었습니다.', 'success');
        loadPendingStudents();

    } catch (error) {
        console.error('거절 에러:', error);
        showToast('거절에 실패했습니다.', 'error');
    }
}

// 토스트 메시지
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-xl shadow-lg z-50 ${
        type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
    } text-white font-semibold`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
}

// switchStudentTab 함수 확장
const originalSwitchStudentTab = typeof switchStudentTab === 'function' ? switchStudentTab : null;
switchStudentTab = function(tabName) {
    // 기존 함수 호출
    if (originalSwitchStudentTab) {
        originalSwitchStudentTab(tabName);
    }

    // 승인 탭일 때 데이터 로드
    if (tabName === 'approval') {
        loadPendingStudents();
    }
};

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    // 30초마다 승인 대기 목록 새로고침 (승인 탭일 때만)
    setInterval(() => {
        const approvalTab = document.getElementById('studentTab-approval');
        if (approvalTab && !approvalTab.classList.contains('hidden')) {
            loadPendingStudents();
        }
    }, 30000);
});
