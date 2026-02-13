// 피드백 관리 JavaScript

// 전역 변수
let students = [];
let selectedGrade = '';
let currentFeedbackId = null;

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Feedback] 초기화 시작...');
    await loadStudents();
    addSubject(); // 기본 과목 1개 추가
    setDefaultPeriod();
    initSendTypeToggle();
    setDefaultScheduleDate();
});

// 학생 목록 로드
async function loadStudents() {
    try {
        const { data, error } = await supabase
            .from('students')
            .select('id, name, grade, parent_id')
            .order('name');

        if (error) throw error;

        students = data || [];
        const select = document.getElementById('student-select');

        students.forEach(student => {
            const option = document.createElement('option');
            option.value = student.id;
            option.textContent = student.name + (student.grade ? ` (${student.grade}학년)` : '');
            select.appendChild(option);
        });

        console.log('[Feedback] 학생 목록 로드 완료:', students.length);
    } catch (error) {
        console.error('[Feedback] 학생 목록 로드 실패:', error);
        alert('학생 목록을 불러오는데 실패했습니다.');
    }
}

// 기본 피드백 기간 설정
function setDefaultPeriod() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    document.getElementById('feedback-period').value = `${year}년 ${month}월`;
}

// 과목 추가
function addSubject(name = '', score = '') {
    const container = document.getElementById('subject-list');
    const row = document.createElement('div');
    row.className = 'subject-row';
    row.innerHTML = `
        <input type="text" placeholder="과목명" value="${name}" class="subject-name">
        <input type="number" placeholder="점수" min="0" max="100" value="${score}" class="subject-score">
        <button class="btn-remove" onclick="removeSubject(this)">
            <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
        </button>
    `;
    container.appendChild(row);
}

// 과목 삭제
function removeSubject(btn) {
    const rows = document.querySelectorAll('.subject-row');
    if (rows.length > 1) {
        btn.closest('.subject-row').remove();
    } else {
        alert('최소 1개의 과목이 필요합니다.');
    }
}

// 등급 선택
function selectGrade(grade) {
    selectedGrade = grade;
    document.querySelectorAll('.grade-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.grade === grade);
    });
}

// 과목 점수 수집
function collectSubjectScores() {
    const scores = {};
    document.querySelectorAll('.subject-row').forEach(row => {
        const name = row.querySelector('.subject-name').value.trim();
        const score = row.querySelector('.subject-score').value;
        if (name && score) {
            scores[name] = parseInt(score);
        }
    });
    return scores;
}

// 피드백 데이터 수집
function collectFeedbackData() {
    const studentId = document.getElementById('student-select').value;
    const student = students.find(s => s.id === studentId);

    return {
        student_id: studentId,
        student_name: student?.name || '',
        student_grade: student?.grade || '',
        parent_id: student?.parent_id || null,
        feedback_period: document.getElementById('feedback-period').value,
        subject_scores: collectSubjectScores(),
        grade_level: selectedGrade,
        study_attitude: document.getElementById('study-attitude').value,
        strengths: document.getElementById('strengths').value,
        improvements: document.getElementById('improvements').value,
        special_notes: document.getElementById('special-notes').value,
        teacher_comment: document.getElementById('teacher-comment').value
    };
}

// 유효성 검사
function validateFeedbackData(data) {
    if (!data.student_id) {
        alert('학생을 선택해주세요.');
        return false;
    }
    if (!data.feedback_period) {
        alert('피드백 기간을 입력해주세요.');
        return false;
    }
    if (!data.study_attitude && !data.strengths && !data.improvements && !data.teacher_comment) {
        alert('최소 하나의 피드백 내용을 입력해주세요.');
        return false;
    }
    return true;
}

// AI 메시지 생성
async function generateMessage() {
    // API 키 확인
    if (!window.isGeminiConfigured || !isGeminiConfigured()) {
        alert('Gemini API 키가 설정되지 않았습니다.\ngemini-config.js 파일에서 API_KEY를 설정해주세요.');
        return;
    }

    const data = collectFeedbackData();

    if (!validateFeedbackData(data)) return;

    const btn = document.getElementById('generate-btn');
    const originalContent = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="loading-spinner"></span> 생성 중...';

        const prompt = buildPrompt(data);
        console.log('[Feedback] 프롬프트:', prompt);

        // Gemini API 호출
        const response = await fetch(`${GEMINI_CONFIG.API_URL}?key=${GEMINI_CONFIG.API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: GEMINI_CONFIG.generationConfig
            })
        });

        if (!response.ok) {
            throw new Error('API 호출 실패: ' + response.status);
        }

        const result = await response.json();
        const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (!generatedText) {
            throw new Error('메시지 생성 결과가 비어있습니다.');
        }

        // 생성된 메시지 표시
        document.getElementById('generated-message').value = generatedText;
        document.getElementById('generated-message-container').classList.remove('hidden');
        document.getElementById('send-btn').disabled = false;

        console.log('[Feedback] 메시지 생성 완료');

    } catch (error) {
        console.error('[Feedback] 메시지 생성 실패:', error);
        alert('메시지 생성에 실패했습니다: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

// 프롬프트 구성
function buildPrompt(data) {
    const scoresText = Object.entries(data.subject_scores)
        .map(([subject, score]) => `${subject}: ${score}점`)
        .join(', ');

    return `당신은 초·중등 공부방을 운영하는 10년 이상 경력의 원장입니다.
학부모에게 보내는 월말 학습 피드백을 작성해야 합니다.

아래 정보를 바탕으로,
- 학부모가 안심하고 신뢰할 수 있는 톤
- 아이를 객관적으로 관찰하고 있다는 느낌
- 단점은 부드럽게, 개선 방향은 명확하게
- 광고·과장 없이 현실적인 조언
을 담아 작성하세요.

❗중요한 작성 기준
1. 절대 아이를 평가하거나 단정하지 말 것
2. '문제 있음'보다는 '성장 과정' 관점으로 서술
3. 학부모가 집에서 도와줄 수 있는 방향을 자연스럽게 암시
4. 분량은 500자 정도로, 핵심 내용과 조언 위주로
5. 말투는 공손하지만 딱딱하지 않게 (문자/알림장용)

---

[아이 정보]
- 이름: ${data.student_name}
- 학년: ${data.student_grade || '미입력'}학년
- 과목: ${scoresText || '미입력'}

[학습 태도]
${data.study_attitude || '입력된 내용 없음'}

[잘하는 점(강점)]
${data.strengths || '입력된 내용 없음'}

[개선 필요 사항]
${data.improvements || '입력된 내용 없음'}

[특이사항]
${data.special_notes || '없음'}

---

✍️ 출력 형식
- 첫 문장은 전체적인 한 달 요약
- 중간 문단에서 강점 → 학습 태도 → 개선점 순서
- 마지막 문장은 다음 달 학습 방향 또는 긍정적 기대감으로 마무리

피드백 메시지를 작성해주세요:`;
}

// 임시 저장
async function saveDraft() {
    const data = collectFeedbackData();

    if (!data.student_id) {
        alert('학생을 선택해주세요.');
        return;
    }

    try {
        const feedbackData = {
            student_id: data.student_id,
            subject_scores: data.subject_scores,
            grade_level: data.grade_level,
            study_attitude: data.study_attitude,
            strengths: data.strengths,
            improvements: data.improvements,
            special_notes: data.special_notes,
            teacher_comment: data.teacher_comment,
            generated_message: document.getElementById('generated-message').value,
            feedback_period: data.feedback_period,
            send_status: 'pending'
        };

        let result;
        if (currentFeedbackId) {
            // 기존 피드백 업데이트
            result = await supabase
                .from('student_feedbacks')
                .update(feedbackData)
                .eq('id', currentFeedbackId)
                .select()
                .single();
        } else {
            // 새 피드백 생성
            result = await supabase
                .from('student_feedbacks')
                .insert(feedbackData)
                .select()
                .single();
        }

        if (result.error) throw result.error;

        currentFeedbackId = result.data.id;
        alert('임시 저장되었습니다.');
        console.log('[Feedback] 임시 저장 완료:', currentFeedbackId);

    } catch (error) {
        console.error('[Feedback] 임시 저장 실패:', error);
        alert('저장에 실패했습니다: ' + error.message);
    }
}

// 피드백 전송
async function sendFeedback() {
    const data = collectFeedbackData();
    const message = document.getElementById('generated-message').value;
    const sendType = document.querySelector('input[name="send-type"]:checked').value;
    const sendPush = document.getElementById('send-push').checked;

    if (!message) {
        alert('먼저 AI로 메시지를 생성해주세요.');
        return;
    }

    if (!data.parent_id) {
        alert('해당 학생의 학부모 정보가 없습니다.');
        return;
    }

    const btn = document.getElementById('send-btn');
    const originalContent = btn.innerHTML;
    const isScheduled = sendType === 'scheduled';

    try {
        btn.disabled = true;
        btn.innerHTML = `<span class="loading-spinner"></span> ${isScheduled ? '예약 중...' : '전송 중...'}`;

        // 예약 전송 시간 계산
        let scheduledAt = null;
        if (isScheduled) {
            const date = document.getElementById('scheduled-date').value;
            const time = document.getElementById('scheduled-time').value;
            scheduledAt = new Date(`${date}T${time}`).toISOString();
        }

        // 1. 피드백 저장
        const feedbackData = {
            student_id: data.student_id,
            subject_scores: data.subject_scores,
            grade_level: data.grade_level,
            study_attitude: data.study_attitude,
            strengths: data.strengths,
            improvements: data.improvements,
            special_notes: data.special_notes,
            teacher_comment: data.teacher_comment,
            generated_message: message,
            feedback_period: data.feedback_period,
            send_status: isScheduled ? 'scheduled' : 'sent',
            sent_at: isScheduled ? null : new Date().toISOString(),
            scheduled_at: scheduledAt
        };

        let result;
        if (currentFeedbackId) {
            result = await supabase
                .from('student_feedbacks')
                .update(feedbackData)
                .eq('id', currentFeedbackId)
                .select()
                .single();
        } else {
            result = await supabase
                .from('student_feedbacks')
                .insert(feedbackData)
                .select()
                .single();
        }

        if (result.error) throw result.error;

        const feedbackId = result.data.id;

        // 2. 즉시 전송인 경우 Push 알림 전송
        if (!isScheduled && sendPush) {
            await sendPushNotification(data.parent_id, data.student_name, message, feedbackId);
        }

        // 성공 메시지
        if (isScheduled) {
            const scheduleDate = new Date(scheduledAt);
            const formattedDate = scheduleDate.toLocaleString('ko-KR', {
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            alert(`피드백이 ${formattedDate}에 전송되도록 예약되었습니다.`);
        } else {
            alert('피드백이 성공적으로 전송되었습니다!');
        }

        // 폼 초기화
        resetForm();

    } catch (error) {
        console.error('[Feedback] 전송 실패:', error);
        alert('전송에 실패했습니다: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

// Push 알림 전송
async function sendPushNotification(parentId, studentName, message, feedbackId) {
    try {
        // 학부모의 Push 구독 정보 조회
        const { data: parent, error } = await supabase
            .from('profiles')
            .select('web_push_subscription, fcm_token, push_notification_enabled')
            .eq('id', parentId)
            .single();

        if (error || !parent) {
            console.warn('[Feedback] 학부모 정보 없음');
            return;
        }

        if (!parent.push_notification_enabled) {
            console.log('[Feedback] Push 알림 비활성화됨');
            return;
        }

        // 알림 로그 저장
        await supabase
            .from('notifications')
            .insert({
                parent_id: parentId,
                type: 'feedback',
                title: `${studentName} 학습 피드백`,
                body: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
                data: { feedback_id: feedbackId }
            });

        console.log('[Feedback] Push 알림 전송 완료');

    } catch (error) {
        console.error('[Feedback] Push 알림 전송 실패:', error);
    }
}

// 폼 초기화
function resetForm() {
    document.getElementById('student-select').value = '';
    document.getElementById('subject-list').innerHTML = '';
    addSubject();
    selectedGrade = '';
    document.querySelectorAll('.grade-option').forEach(el => el.classList.remove('selected'));
    document.getElementById('study-attitude').value = '';
    document.getElementById('strengths').value = '';
    document.getElementById('improvements').value = '';
    document.getElementById('special-notes').value = '';
    document.getElementById('teacher-comment').value = '';
    document.getElementById('generated-message').value = '';
    document.getElementById('generated-message-container').classList.add('hidden');
    document.getElementById('send-btn').disabled = true;
    document.getElementById('send-btn-text').textContent = '학부모에게 전송';
    currentFeedbackId = null;
    setDefaultPeriod();

    // 전송 방식 초기화
    document.querySelector('input[name="send-type"][value="immediate"]').checked = true;
    document.querySelectorAll('.send-type-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.type === 'immediate');
    });
    document.getElementById('scheduled-options').classList.add('hidden');
    setDefaultScheduleDate();
}

// 전송 기록 토글
function toggleHistory() {
    const sidebar = document.getElementById('history-sidebar');
    const overlay = document.getElementById('history-overlay');

    if (sidebar.classList.contains('translate-x-full')) {
        sidebar.classList.remove('translate-x-full');
        overlay.classList.remove('hidden');
        loadHistory();
    } else {
        sidebar.classList.add('translate-x-full');
        overlay.classList.add('hidden');
    }
}

// 전송 기록 로드
async function loadHistory() {
    const container = document.getElementById('history-list');
    container.innerHTML = '<p class="text-gray-500 text-sm">로딩 중...</p>';

    try {
        const { data, error } = await supabase
            .from('student_feedbacks')
            .select('id, feedback_period, send_status, sent_at, scheduled_at, created_at, students(name)')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm text-center py-8">전송 기록이 없습니다.</p>';
            return;
        }

        container.innerHTML = data.map(item => {
            let date, statusClass, statusText;

            if (item.send_status === 'sent') {
                date = item.sent_at ? new Date(item.sent_at).toLocaleDateString('ko-KR') : '';
                statusClass = 'status-sent';
                statusText = '전송됨';
            } else if (item.send_status === 'scheduled') {
                date = item.scheduled_at ? new Date(item.scheduled_at).toLocaleDateString('ko-KR') : '';
                statusClass = 'status-scheduled';
                statusText = '예약됨';
            } else {
                date = new Date(item.created_at).toLocaleDateString('ko-KR');
                statusClass = 'status-pending';
                statusText = '임시저장';
            }

            return `
                <div class="feedback-history-item" onclick="loadFeedback('${item.id}')">
                    <div>
                        <p class="font-medium text-gray-800">${item.students?.name || '알 수 없음'}</p>
                        <p class="text-xs text-gray-500">${item.feedback_period} · ${date}</p>
                    </div>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('[Feedback] 기록 로드 실패:', error);
        container.innerHTML = '<p class="text-red-500 text-sm">로드 실패</p>';
    }
}

// 기존 피드백 로드
async function loadFeedback(feedbackId) {
    try {
        const { data, error } = await supabase
            .from('student_feedbacks')
            .select('*, students(name, grade)')
            .eq('id', feedbackId)
            .single();

        if (error) throw error;

        // 폼에 데이터 채우기
        currentFeedbackId = data.id;
        document.getElementById('student-select').value = data.student_id;
        document.getElementById('feedback-period').value = data.feedback_period || '';

        // 과목 점수
        document.getElementById('subject-list').innerHTML = '';
        const scores = data.subject_scores || {};
        if (Object.keys(scores).length > 0) {
            Object.entries(scores).forEach(([name, score]) => {
                addSubject(name, score);
            });
        } else {
            addSubject();
        }

        // 등급
        if (data.grade_level) {
            selectGrade(data.grade_level);
        }

        // 피드백 내용
        document.getElementById('study-attitude').value = data.study_attitude || '';
        document.getElementById('strengths').value = data.strengths || '';
        document.getElementById('improvements').value = data.improvements || '';
        document.getElementById('special-notes').value = data.special_notes || '';
        document.getElementById('teacher-comment').value = data.teacher_comment || '';

        // 생성된 메시지
        if (data.generated_message) {
            document.getElementById('generated-message').value = data.generated_message;
            document.getElementById('generated-message-container').classList.remove('hidden');
            document.getElementById('send-btn').disabled = false;
        }

        // 사이드바 닫기
        toggleHistory();

        console.log('[Feedback] 피드백 로드 완료:', feedbackId);

    } catch (error) {
        console.error('[Feedback] 피드백 로드 실패:', error);
        alert('피드백을 불러오는데 실패했습니다.');
    }
}

// 전송 방식 토글 초기화
function initSendTypeToggle() {
    const radios = document.querySelectorAll('input[name="send-type"]');
    const scheduledOptions = document.getElementById('scheduled-options');
    const sendBtnText = document.getElementById('send-btn-text');

    radios.forEach(radio => {
        radio.addEventListener('change', () => {
            // UI 업데이트
            document.querySelectorAll('.send-type-option').forEach(opt => {
                opt.classList.toggle('selected', opt.dataset.type === radio.value);
            });

            // 예약 옵션 표시/숨김
            if (radio.value === 'scheduled') {
                scheduledOptions.classList.remove('hidden');
                sendBtnText.textContent = '예약 전송';
            } else {
                scheduledOptions.classList.add('hidden');
                sendBtnText.textContent = '학부모에게 전송';
            }
        });
    });
}

// 기본 예약 날짜 설정 (내일)
function setDefaultScheduleDate() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    document.getElementById('scheduled-date').value = dateStr;
}

// 전송 확인 모달 열기
function openSendConfirmModal() {
    const data = collectFeedbackData();
    const message = document.getElementById('generated-message').value;
    const sendType = document.querySelector('input[name="send-type"]:checked').value;

    if (!message) {
        alert('먼저 AI로 메시지를 생성해주세요.');
        return;
    }

    if (!data.parent_id) {
        alert('해당 학생의 학부모 정보가 없습니다.');
        return;
    }

    // 모달 내용 채우기
    document.getElementById('modal-student-name').textContent = data.student_name;
    document.getElementById('modal-message-preview').textContent = message.length > 200
        ? message.substring(0, 200) + '...'
        : message;

    // 전송 방식에 따른 UI
    const scheduleRow = document.getElementById('modal-schedule-row');
    const modalSendType = document.getElementById('modal-send-type');
    const modalIcon = document.getElementById('modal-icon');
    const modalTitle = document.getElementById('modal-title');
    const confirmBtn = document.getElementById('modal-confirm-btn');

    if (sendType === 'scheduled') {
        const date = document.getElementById('scheduled-date').value;
        const time = document.getElementById('scheduled-time').value;

        if (!date) {
            alert('예약 날짜를 선택해주세요.');
            return;
        }

        const scheduleDateTime = new Date(`${date}T${time}`);
        const formattedDateTime = scheduleDateTime.toLocaleString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });

        modalSendType.textContent = '예약 전송';
        modalSendType.className = 'text-sm font-medium text-blue-600';
        scheduleRow.style.display = 'flex';
        document.getElementById('modal-schedule-time').textContent = formattedDateTime;
        modalIcon.textContent = 'schedule_send';
        modalTitle.textContent = '예약 전송 확인';
        confirmBtn.innerHTML = '<span class="material-symbols-outlined align-middle mr-1" style="font-size: 18px;">schedule_send</span>예약하기';
        confirmBtn.className = 'flex-1 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium hover:from-blue-600 hover:to-blue-700 transition-colors';
    } else {
        modalSendType.textContent = '즉시 전송';
        modalSendType.className = 'text-sm font-medium text-green-600';
        scheduleRow.style.display = 'none';
        modalIcon.textContent = 'send';
        modalTitle.textContent = '피드백 전송 확인';
        confirmBtn.innerHTML = '<span class="material-symbols-outlined align-middle mr-1" style="font-size: 18px;">send</span>전송하기';
        confirmBtn.className = 'flex-1 py-4 bg-gradient-to-r from-teal-500 to-teal-600 text-white font-medium hover:from-teal-600 hover:to-teal-700 transition-colors';
    }

    // 모달 표시
    document.getElementById('send-confirm-modal').classList.remove('hidden');
}

// 전송 확인 모달 닫기
function closeSendConfirmModal() {
    document.getElementById('send-confirm-modal').classList.add('hidden');
}

// 전송 확인 버튼 클릭
function confirmSend() {
    closeSendConfirmModal();
    sendFeedback();
}
