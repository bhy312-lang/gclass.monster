// 가맹점별 데이터 관리 서비스
// Supabase를 통해 사용자(owner_id)별로 데이터 분리 관리

const DataService = {
    // 현재 사용자 ID 가져오기
    getCurrentUserId: function() {
        if (typeof currentUser !== 'undefined' && currentUser) {
            return currentUser.id;
        }
        return null;
    },

    // Supabase 클라이언트 가져오기
    getSupabase: function() {
        if (typeof supabase !== 'undefined' && supabase) {
            return supabase;
        }
        return null;
    },

    // ========== 학생 관리 ==========

    // 학생 목록 불러오기
    loadStudents: async function() {
        const sb = this.getSupabase();
        const userId = this.getCurrentUserId();

        if (!sb || !userId) {
            console.log('[DataService] Supabase 또는 사용자 정보 없음, localStorage 사용');
            return JSON.parse(localStorage.getItem('students') || '[]');
        }

        try {
            const { data, error } = await sb
                .from('franchise_students')
                .select('*')
                .eq('owner_id', userId)
                .order('created_at', { ascending: true });

            if (error) throw error;

            // Supabase 데이터를 기존 형식으로 변환
            const students = (data || []).map(s => ({
                id: s.id,
                name: s.name,
                grade: s.grade || '',
                school: s.school || '',
                parentPhone: s.parent_phone || '',
                memos: s.memos || [],
                makeupTimes: s.makeup_times || [],
                grades: s.grades || [],
                feedbacks: s.feedbacks || []
            }));

            console.log(`[DataService] 학생 ${students.length}명 로드됨`);
            return students;
        } catch (error) {
            console.error('[DataService] 학생 로드 실패:', error);
            return JSON.parse(localStorage.getItem('students') || '[]');
        }
    },

    // 학생 저장 (추가 또는 업데이트)
    saveStudent: async function(student) {
        const sb = this.getSupabase();
        const userId = this.getCurrentUserId();

        if (!sb || !userId) {
            console.log('[DataService] localStorage에 저장');
            const students = JSON.parse(localStorage.getItem('students') || '[]');
            const idx = students.findIndex(s => s.id === student.id);
            if (idx >= 0) {
                students[idx] = student;
            } else {
                students.push(student);
            }
            localStorage.setItem('students', JSON.stringify(students));
            return student;
        }

        try {
            const dbData = {
                owner_id: userId,
                name: student.name,
                grade: student.grade || null,
                school: student.school || null,
                parent_phone: student.parentPhone || null,
                memos: student.memos || [],
                makeup_times: student.makeupTimes || [],
                grades: student.grades || [],
                feedbacks: student.feedbacks || [],
                updated_at: new Date().toISOString()
            };

            let result;

            // UUID 형식인지 확인 (기존 Supabase 데이터)
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(student.id);

            if (isUUID) {
                // 업데이트
                const { data, error } = await sb
                    .from('franchise_students')
                    .update(dbData)
                    .eq('id', student.id)
                    .eq('owner_id', userId)
                    .select()
                    .single();

                if (error) throw error;
                result = data;
            } else {
                // 새로 삽입
                const { data, error } = await sb
                    .from('franchise_students')
                    .insert(dbData)
                    .select()
                    .single();

                if (error) throw error;
                result = data;
            }

            console.log('[DataService] 학생 저장 성공:', result.name);
            return {
                id: result.id,
                name: result.name,
                grade: result.grade || '',
                school: result.school || '',
                parentPhone: result.parent_phone || '',
                memos: result.memos || [],
                makeupTimes: result.makeup_times || [],
                grades: result.grades || [],
                feedbacks: result.feedbacks || []
            };
        } catch (error) {
            console.error('[DataService] 학생 저장 실패:', error);
            throw error;
        }
    },

    // 학생 삭제
    deleteStudent: async function(studentId) {
        const sb = this.getSupabase();
        const userId = this.getCurrentUserId();

        if (!sb || !userId) {
            const students = JSON.parse(localStorage.getItem('students') || '[]');
            const filtered = students.filter(s => s.id !== studentId);
            localStorage.setItem('students', JSON.stringify(filtered));
            return true;
        }

        try {
            const { error } = await sb
                .from('franchise_students')
                .delete()
                .eq('id', studentId)
                .eq('owner_id', userId);

            if (error) throw error;
            console.log('[DataService] 학생 삭제 성공');
            return true;
        } catch (error) {
            console.error('[DataService] 학생 삭제 실패:', error);
            throw error;
        }
    },

    // ========== 좌석 관리 ==========

    // 좌석 목록 불러오기
    loadSeats: async function() {
        const sb = this.getSupabase();
        const userId = this.getCurrentUserId();

        if (!sb || !userId) {
            return JSON.parse(localStorage.getItem('seats') || '[]');
        }

        try {
            const { data, error } = await sb
                .from('franchise_seats')
                .select('*')
                .eq('owner_id', userId)
                .order('seat_number', { ascending: true });

            if (error) throw error;

            const seats = (data || []).map(s => ({
                id: s.id,
                number: s.seat_number,
                name: s.name || '',
                occupied: s.occupied || false,
                alarmTime: s.alarm_time,
                alarming: s.alarming || false,
                alarmStopped: s.alarm_stopped || false,
                x: s.position_x || 0,
                y: s.position_y || 0,
                width: s.width || 80,
                height: s.height || 80
            }));

            console.log(`[DataService] 좌석 ${seats.length}개 로드됨`);
            return seats;
        } catch (error) {
            console.error('[DataService] 좌석 로드 실패:', error);
            return JSON.parse(localStorage.getItem('seats') || '[]');
        }
    },

    // 좌석 전체 저장
    saveSeats: async function(seats) {
        const sb = this.getSupabase();
        const userId = this.getCurrentUserId();

        if (!sb || !userId) {
            localStorage.setItem('seats', JSON.stringify(seats));
            return seats;
        }

        try {
            // 기존 좌석 삭제 후 새로 삽입
            await sb
                .from('franchise_seats')
                .delete()
                .eq('owner_id', userId);

            const dbData = seats.map((s, idx) => ({
                owner_id: userId,
                seat_number: s.number || idx + 1,
                name: s.name || '',
                occupied: s.occupied || false,
                alarm_time: s.alarmTime || null,
                alarming: s.alarming || false,
                alarm_stopped: s.alarmStopped || false,
                position_x: s.x || 0,
                position_y: s.y || 0,
                width: s.width || 80,
                height: s.height || 80
            }));

            if (dbData.length > 0) {
                const { error } = await sb
                    .from('franchise_seats')
                    .insert(dbData);

                if (error) throw error;
            }

            console.log(`[DataService] 좌석 ${seats.length}개 저장 성공`);
            return seats;
        } catch (error) {
            console.error('[DataService] 좌석 저장 실패:', error);
            localStorage.setItem('seats', JSON.stringify(seats));
            return seats;
        }
    },

    // 단일 좌석 업데이트
    updateSeat: async function(seatId, updates) {
        const sb = this.getSupabase();
        const userId = this.getCurrentUserId();

        if (!sb || !userId) {
            const seats = JSON.parse(localStorage.getItem('seats') || '[]');
            const idx = seats.findIndex(s => s.id === seatId);
            if (idx >= 0) {
                seats[idx] = { ...seats[idx], ...updates };
                localStorage.setItem('seats', JSON.stringify(seats));
            }
            return;
        }

        try {
            const dbUpdates = {};
            if ('name' in updates) dbUpdates.name = updates.name;
            if ('occupied' in updates) dbUpdates.occupied = updates.occupied;
            if ('alarmTime' in updates) dbUpdates.alarm_time = updates.alarmTime;
            if ('alarming' in updates) dbUpdates.alarming = updates.alarming;
            if ('alarmStopped' in updates) dbUpdates.alarm_stopped = updates.alarmStopped;
            if ('x' in updates) dbUpdates.position_x = updates.x;
            if ('y' in updates) dbUpdates.position_y = updates.y;
            dbUpdates.updated_at = new Date().toISOString();

            const { error } = await sb
                .from('franchise_seats')
                .update(dbUpdates)
                .eq('id', seatId)
                .eq('owner_id', userId);

            if (error) throw error;
        } catch (error) {
            console.error('[DataService] 좌석 업데이트 실패:', error);
        }
    },

    // ========== To-do 관리 ==========

    // To-do 불러오기 (날짜별)
    loadTodos: async function() {
        const sb = this.getSupabase();
        const userId = this.getCurrentUserId();

        if (!sb || !userId) {
            const stored = localStorage.getItem('todos');
            try {
                const parsed = JSON.parse(stored || '{}');
                return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
            } catch {
                return {};
            }
        }

        try {
            const { data, error } = await sb
                .from('franchise_todos')
                .select('*')
                .eq('owner_id', userId)
                .order('created_at', { ascending: true });

            if (error) throw error;

            // 날짜별 객체로 변환
            const todos = {};
            (data || []).forEach(t => {
                const dateStr = t.date;
                if (!todos[dateStr]) {
                    todos[dateStr] = [];
                }
                todos[dateStr].push({
                    id: t.id,
                    text: t.text,
                    completed: t.completed,
                    color: t.color || 'hsl(0, 0%, 95%)',
                    studentId: t.student_id,
                    memoId: t.memo_id
                });
            });

            console.log(`[DataService] To-do 로드됨`);
            return todos;
        } catch (error) {
            console.error('[DataService] To-do 로드 실패:', error);
            return {};
        }
    },

    // To-do 저장 (전체)
    saveTodos: async function(todos) {
        const sb = this.getSupabase();
        const userId = this.getCurrentUserId();

        if (!sb || !userId) {
            localStorage.setItem('todos', JSON.stringify(todos));
            return;
        }

        try {
            // 기존 To-do 삭제
            await sb
                .from('franchise_todos')
                .delete()
                .eq('owner_id', userId);

            // 새로 삽입
            const dbData = [];
            for (const [dateStr, items] of Object.entries(todos)) {
                items.forEach(item => {
                    dbData.push({
                        owner_id: userId,
                        date: dateStr,
                        text: item.text,
                        completed: item.completed || false,
                        color: item.color || 'hsl(0, 0%, 95%)',
                        student_id: item.studentId || null,
                        memo_id: item.memoId || null
                    });
                });
            }

            if (dbData.length > 0) {
                const { error } = await sb
                    .from('franchise_todos')
                    .insert(dbData);

                if (error) throw error;
            }

            console.log(`[DataService] To-do 저장 성공`);
        } catch (error) {
            console.error('[DataService] To-do 저장 실패:', error);
            localStorage.setItem('todos', JSON.stringify(todos));
        }
    },

    // 단일 To-do 추가
    addTodo: async function(dateStr, todoItem) {
        const sb = this.getSupabase();
        const userId = this.getCurrentUserId();

        if (!sb || !userId) {
            const todos = JSON.parse(localStorage.getItem('todos') || '{}');
            if (!todos[dateStr]) todos[dateStr] = [];
            todos[dateStr].push(todoItem);
            localStorage.setItem('todos', JSON.stringify(todos));
            return;
        }

        try {
            const { error } = await sb
                .from('franchise_todos')
                .insert({
                    owner_id: userId,
                    date: dateStr,
                    text: todoItem.text,
                    completed: todoItem.completed || false,
                    color: todoItem.color || 'hsl(0, 0%, 95%)',
                    student_id: todoItem.studentId || null,
                    memo_id: todoItem.memoId || null
                });

            if (error) throw error;
            console.log(`[DataService] To-do 추가 성공: ${todoItem.text}`);
        } catch (error) {
            console.error('[DataService] To-do 추가 실패:', error);
        }
    },

    // ========== 출결 관리 ==========

    // 오늘 출결 불러오기
    loadAttendance: async function(dateStr = null) {
        const sb = this.getSupabase();
        const userId = this.getCurrentUserId();
        const today = dateStr || new Date().toISOString().split('T')[0];

        if (!sb || !userId) {
            const stored = JSON.parse(localStorage.getItem('demo_attendance') || '[]');
            return stored.filter(a => a.date === today || (a.check_in_time && a.check_in_time.startsWith(today)));
        }

        try {
            const { data, error } = await sb
                .from('franchise_attendance')
                .select('*')
                .eq('owner_id', userId)
                .eq('date', today)
                .order('check_in_time', { ascending: true });

            if (error) throw error;

            const attendance = (data || []).map(a => ({
                id: a.id,
                student_id: a.student_id,
                student_name: a.student_name,
                check_in_time: a.check_in_time,
                check_out_time: a.check_out_time,
                alarm_time: a.alarm_time,
                status: a.status,
                seat_id: a.seat_id,
                date: a.date
            }));

            console.log(`[DataService] 출결 ${attendance.length}건 로드됨`);
            return attendance;
        } catch (error) {
            console.error('[DataService] 출결 로드 실패:', error);
            return [];
        }
    },

    // 등원 기록 추가
    addAttendance: async function(attendanceData) {
        const sb = this.getSupabase();
        const userId = this.getCurrentUserId();

        if (!sb || !userId) {
            const stored = JSON.parse(localStorage.getItem('demo_attendance') || '[]');
            stored.push(attendanceData);
            localStorage.setItem('demo_attendance', JSON.stringify(stored));
            return attendanceData;
        }

        try {
            const { data, error } = await sb
                .from('franchise_attendance')
                .insert({
                    owner_id: userId,
                    student_id: attendanceData.student_id,
                    student_name: attendanceData.student_name,
                    check_in_time: attendanceData.check_in_time,
                    alarm_time: attendanceData.alarm_time,
                    status: attendanceData.status || 'waiting',
                    seat_id: attendanceData.seat_id || null,
                    date: attendanceData.date
                })
                .select()
                .single();

            if (error) throw error;
            console.log(`[DataService] 등원 기록 추가 성공: ${attendanceData.student_name}`);
            return data;
        } catch (error) {
            console.error('[DataService] 등원 기록 추가 실패:', error);
            throw error;
        }
    },

    // 출결 상태 업데이트
    updateAttendance: async function(attendanceId, updates) {
        const sb = this.getSupabase();
        const userId = this.getCurrentUserId();

        if (!sb || !userId) {
            const stored = JSON.parse(localStorage.getItem('demo_attendance') || '[]');
            const idx = stored.findIndex(a => a.id === attendanceId);
            if (idx >= 0) {
                stored[idx] = { ...stored[idx], ...updates };
                localStorage.setItem('demo_attendance', JSON.stringify(stored));
            }
            return;
        }

        try {
            const dbUpdates = { updated_at: new Date().toISOString() };
            if ('status' in updates) dbUpdates.status = updates.status;
            if ('seat_id' in updates) dbUpdates.seat_id = updates.seat_id;
            if ('check_out_time' in updates) dbUpdates.check_out_time = updates.check_out_time;

            const { error } = await sb
                .from('franchise_attendance')
                .update(dbUpdates)
                .eq('id', attendanceId)
                .eq('owner_id', userId);

            if (error) throw error;
            console.log(`[DataService] 출결 업데이트 성공`);
        } catch (error) {
            console.error('[DataService] 출결 업데이트 실패:', error);
        }
    },

    // ========== 초기화 ==========

    // 로그인 시 데이터 로드
    initializeData: async function() {
        console.log('[DataService] 데이터 초기화 시작...');

        try {
            // 학생, 좌석, To-do, 출결 데이터 로드
            const [students, seats, todos, attendance] = await Promise.all([
                this.loadStudents(),
                this.loadSeats(),
                this.loadTodos(),
                this.loadAttendance()
            ]);

            // 전역 변수 또는 localStorage에 캐시
            window._cachedStudents = students;
            window._cachedSeats = seats;
            window._cachedTodos = todos;
            window._cachedAttendance = attendance;

            console.log('[DataService] 데이터 초기화 완료');
            return { students, seats, todos, attendance };
        } catch (error) {
            console.error('[DataService] 데이터 초기화 실패:', error);
            throw error;
        }
    },

    // 로그아웃 시 캐시 클리어
    clearCache: function() {
        window._cachedStudents = null;
        window._cachedSeats = null;
        window._cachedTodos = null;
        window._cachedAttendance = null;
        console.log('[DataService] 캐시 클리어됨');
    }
};

// 전역 네임스페이스에 노출
window.DataService = DataService;
