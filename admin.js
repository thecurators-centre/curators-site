const SUPABASE_URL = 'https://kajvldevytbrkeomwlms.supabase.co';
const SUPABASE_KEY = 'sb_publishable__PdBbe6y-EKJ0z4DfPrKKQ_ru9yogqW';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const subjectColors = {
    'Русский язык': '#ef4444', 'Японский язык': '#f1f5f9', 'Английский язык': '#0ea5e9',
    'Литература': '#d97706', 'Обществознание': '#4f46e5', 'История': '#84cc16',
    'Физика': '#2dd4bf', 'Подготовка к школе': '#ec4899',
    'Нач. русский': '#7c3aed',
    'Нач. математика': '#f59e0b',
    'Нач. окружающий мир': '#10b981',
    'Нач. чтение': '#8b5cf6'
};

let students = [];
let teachers = [];
let filterTeacherId = '';
let currentUser = null;
let currentRole = null;
let scheduleData = []; // Записи календаря
let currentCalDate = new Date(); // Текущий месяц календаря

const grid = document.getElementById('grid');
const modal = document.getElementById('modal');
const form = document.getElementById('form');

// --- ИНИЦИАЛИЗАЦИЯ ---
async function init() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) { window.location.href = 'login.html'; return; }
    currentUser = user;

    const { data: profile } = await supabaseClient.from('profiles').select('role, full_name').eq('id', user.id).single();
    if (!profile) { window.location.href = 'login.html'; return; }
    if (profile.role !== 'admin' && profile.role !== 'teacher') { window.location.href = 'student.html'; return; }

    currentRole = profile.role;
    document.getElementById('user-info').innerText = profile.full_name;
    if (currentRole === 'admin') document.getElementById('tab-teachers').style.display = 'block';

    loadStudents();
    loadUnreadCount(user.id);
    subscribeUnreadRealtime();

    if (currentRole === 'admin') {
        initTeacherFilter();
    }
}

// Заполняем фильтр по учителям (только для админа)
async function initTeacherFilter() {
    const sel = document.getElementById('filter-teacher');
    if (!sel) return;
    sel.style.display = 'inline-block';

    const { data, error } = await supabaseClient
        .from('profiles')
        .select('id, full_name, surname, name')
        .eq('role', 'teacher')
        .order('full_name', { ascending: true });

    if (error) { console.error('Не удалось загрузить учителей для фильтра:', error); return; }

    sel.innerHTML = '<option value="">Все учителя</option>';
    (data || []).forEach(t => {
        const name = t.full_name || [t.surname, t.name].filter(Boolean).join(' ') || 'Без имени';
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = name;
        sel.appendChild(opt);
    });

    sel.addEventListener('change', () => {
        filterTeacherId = sel.value;
        loadStudents();
    });
}

// Realtime-обновление бейджа непрочитанных
function subscribeUnreadRealtime() {
    supabaseClient
        .channel('admin-unread-' + currentUser.id)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
            loadUnreadCount(currentUser.id);
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, () => {
            loadUnreadCount(currentUser.id);
        })
        .subscribe();
}

// --- НЕПРОЧИТАННЫЕ ---
async function loadUnreadCount(userId) {
    const { data: myChats } = await supabaseClient.from('chat_participants').select('chat_id').eq('user_id', userId);
    if (!myChats || myChats.length === 0) return;
    const chatIds = myChats.map(c => c.chat_id);
    const { count, error } = await supabaseClient.from('messages').select('*', { count: 'exact', head: true }).in('chat_id', chatIds).eq('is_read', false).neq('sender_id', userId);
    if (!error) {
        const btn = document.querySelector('a[href="chat.html"]');
        if (!btn) return;
        let badge = btn.querySelector('.chat-badge');
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'chat-badge';
                badge.style.cssText = 'position:absolute; top:-5px; right:-10px; background:var(--danger); color:white; font-size:0.7rem; padding:2px 6px; border-radius:10px;';
                btn.style.position = 'relative';
                btn.appendChild(badge);
            }
            badge.innerText = count;
            badge.style.display = 'block';
        } else if (badge) {
            badge.style.display = 'none';
        }
    }
}

// --- ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ---
window.switchTab = function(tabName) {
    ['students', 'boards', 'schedule', 'teachers'].forEach(t => {
        const tab = document.getElementById('tab-' + t);
        const section = document.getElementById('section-' + t);
        if (tab) tab.classList.remove('active');
        if (section) section.style.display = 'none';
    });
    document.getElementById('tab-' + tabName).classList.add('active');
    document.getElementById('section-' + tabName).style.display = 'block';

    if (tabName === 'boards') loadBoards();
    if (tabName === 'teachers') loadTeachers();
    if (tabName === 'schedule') renderCalendar();
};

// ==========================================
// ВКЛАДКА УЧЕНИКИ
// ==========================================
async function loadStudents() {
    grid.innerHTML = '<div class="loading">Загрузка...</div>';
    let query = supabaseClient.from('students').select('*').order('id', { ascending: true });
    if (currentRole === 'teacher') {
        query = query.eq('teacher_id', currentUser.id);
    } else if (currentRole === 'admin' && filterTeacherId) {
        query = query.eq('teacher_id', filterTeacherId);
    }
    const { data, error } = await query;
    if (error) { grid.innerHTML = '<div class="loading" style="color: red;">Ошибка базы</div>'; return; }
    students = data || [];
    renderStudents();
}

function renderStudents() {
    grid.innerHTML = '';
    if (students.length === 0) { grid.innerHTML = '<p style="opacity:0.5;">Пусто</p>'; return; }
    students.forEach((s) => {
        const card = document.createElement('div');
        card.className = 'card';
        let subs = (s.subjects || '').split(',').map(x => x.trim()).filter(x => x);
        let colors = subs.map(sub => subjectColors[sub] || '#313452');
        if (colors.length === 0) colors = ['#313452'];
        if (colors.length === 1) { card.style.background = colors[0]; } else { card.style.background = `linear-gradient(135deg, ${colors.join(', ')})`; }
        card.innerHTML = `<h3>${s.surname} ${s.name}</h3><p>Предметы: ${subs.join(', ') || 'не заданы'}</p>`;
        card.onclick = () => openStudentModal(s);
        grid.appendChild(card);
    });
}

window.openStudentModal = function(s = null) {
    form.reset();
    if (s) {
        document.getElementById('id').value = s.id;
        document.getElementById('login').value = s.login || '';
        document.getElementById('password').value = s.password || '';
        document.getElementById('surname').value = s.surname || '';
        document.getElementById('name').value = s.name || '';
        document.getElementById('patronymic').value = s.patronymic || '';
        document.getElementById('age').value = s.age || '';
        document.getElementById('grade').value = s.grade || '';
        document.getElementById('level').value = s.level || 3;
        document.getElementById('levelVal').innerText = s.level || 3;
        document.getElementById('hourly_rate').value = s.hourly_rate || '';
        document.getElementById('about_student').value = s.about_student || '';
        const subs = (s.subjects || '').split(',').map(x=>x.trim());
        const select = document.getElementById('subjects');
        for (let i = 0; i < select.options.length; i++) select.options[i].selected = subs.includes(select.options[i].value);
        document.getElementById('topics').value = s.topics || '';
        const sm = (s.schedule_month !== null && s.schedule_month !== undefined) ? (s.schedule_month + 1) : '';
        document.getElementById('schedule_month').value = sm;
        document.getElementById('schedule_year').value = s.schedule_year || '';
        document.getElementById('schedule_days').value = s.schedule_days || '';
        if (typeof renderStudentCalendar === 'function') renderStudentCalendar();
        document.getElementById('deleteBtn').style.display = 'block';
        const reportBtn = document.getElementById('reportBtn');
        if (currentRole === 'admin') {
            reportBtn.style.display = 'flex';
            reportBtn.onclick = () => openReportModal(s.id, s.name);
        } else {
            reportBtn.style.display = 'none';
        }
        const iomLink = document.getElementById('iomLink');
        iomLink.href = `iom.html?student_id=${s.id}`;
        iomLink.style.display = 'flex';
        const notebookLink = document.getElementById('notebookLink');
        notebookLink.href = `notebook.html?student_id=${s.id}&name=${encodeURIComponent(s.surname + ' ' + s.name)}`;
        notebookLink.style.display = 'flex';
    } else {
        document.getElementById('id').value = '';
        document.getElementById('level').value = 3;
        document.getElementById('levelVal').innerText = '3';
        document.getElementById('deleteBtn').style.display = 'none';
        document.getElementById('notebookLink').style.display = 'none';
        document.getElementById('iomLink').style.display = 'none';
        document.getElementById('reportBtn').style.display = 'none';
    }
    modal.classList.add('active');
};

document.getElementById('closeModal').onclick = () => modal.classList.remove('active');
modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('active'); };

form.onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('id').value;
    if (!id) {
        // Создание
        const login = document.getElementById('login').value.trim();
        const password = document.getElementById('password').value.trim();
        const surname = document.getElementById('surname').value.trim();
        const name = document.getElementById('name').value.trim();
        const patronymic = document.getElementById('patronymic').value.trim();
        const age = document.getElementById('age').value;
        const grade = document.getElementById('grade').value;
        const select = document.getElementById('subjects');
        const subjects = Array.from(select.selectedOptions).map(opt => opt.value).join(',');
        const level = document.getElementById('level').value;
        const hourly_rate = document.getElementById('hourly_rate').value;
        const about_student = document.getElementById('about_student').value;
        const topics = document.getElementById('topics').value;
        const schedule_month = document.getElementById('schedule_month').value;
        const schedule_year = document.getElementById('schedule_year').value;
        const schedule_days = document.getElementById('schedule_days').value;
        
        const btn = form.querySelector('button[type="submit"]');
        btn.innerText = 'Создание...'; btn.disabled = true;

        try {
            const { data, error } = await supabaseClient.functions.invoke('create-teacher', {
                body: { login, password, surname, name, patronymic, age, grade, subjects, level, hourly_rate, about_student, topics, schedule_month, schedule_year, schedule_days, full_name: `${surname} ${name}`, role: 'student', teacher_id: currentRole === 'teacher' ? currentUser.id : null }
            });
            if (error) throw error;
            if (data && data.error) throw new Error(data.error);
            alert('Ученик создан!');
            modal.classList.remove('active');
            loadStudents();
        } catch (err) { alert('ОШИБКА: ' + err.message); }
        finally { btn.innerText = 'Сохранить'; btn.disabled = false; }
        return;
    }

    // Обновление
    const select = document.getElementById('subjects');
    const selectedSubjects = Array.from(select.selectedOptions).map(opt => opt.value).join(',');
    const data = {
        login: document.getElementById('login').value.trim(),
        password: document.getElementById('password').value.trim(),
        surname: document.getElementById('surname').value,
        name: document.getElementById('name').value,
        patronymic: document.getElementById('patronymic').value,
        age: parseInt(document.getElementById('age').value) || null,
        grade: document.getElementById('grade').value,
        subjects: selectedSubjects,
        level: parseInt(document.getElementById('level').value),
        hourly_rate: parseInt(document.getElementById('hourly_rate').value) || null,
        about_student: document.getElementById('about_student').value,
        topics: document.getElementById('topics').value,
        schedule_month: document.getElementById('schedule_month').value ? (parseInt(document.getElementById('schedule_month').value) - 1) : null,
        schedule_year: document.getElementById('schedule_year').value ? parseInt(document.getElementById('schedule_year').value) : null,
        schedule_days: document.getElementById('schedule_days').value.trim()
    };
    const { error } = await supabaseClient.from('students').update(data).eq('id', id);
    if (error) alert('Ошибка: ' + error.message);
    else { modal.classList.remove('active'); loadStudents(); }
};

document.getElementById('deleteBtn').onclick = async () => {
    if (currentRole !== 'admin') { alert('Удалять учеников может только администратор.'); return; }
    const id = document.getElementById('id').value;
    if (confirm('Удалить?')) {
        const { error } = await supabaseClient.from('students').delete().eq('id', id);
        if (error) alert('Ошибка: ' + error.message);
        else { modal.classList.remove('active'); loadStudents(); }
    }
};

document.getElementById('addBtn').onclick = () => openStudentModal();

// ==========================================
// ВКЛАДКА ДОСКИ
// ==========================================
// --- ДОСКИ (Старая система по предметам) ---
function loadBoards() {
    const boardsGrid = document.getElementById('boards-grid');
    boardsGrid.innerHTML = '';
    
    // Список предметов
    const subjectsList = ['Русский язык', 'Японский язык', 'Английский язык', 'Литература', 'Обществознание', 'История', 'Физика', 'Подготовка к школе', 'Нач. русский', 'Нач. математика', 'Нач. окружающий мир', 'Нач. чтение'];
    
    subjectsList.forEach(sub => {
        const card = document.createElement('div');
        card.className = 'card';
        let color = subjectColors[sub] || '#313452';
        card.style.background = color;
        card.innerHTML = `
            <h3>${sub}</h3>
            <div style="display: flex; gap: 10px; margin-top: 15px;">
                <a href="board.html?subject=${encodeURIComponent(sub)}" target="_blank" style="background:var(--accent-lime); color:var(--bg-color); padding:8px 15px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:0.9rem;">Доска</a>
            </div>
        `;
        boardsGrid.appendChild(card);
    });
}

// Модалка создания доски
const boardModal = document.getElementById('boardModal');
document.getElementById('addBoardBtn').style.display = 'none'; // Скрываем кнопку создания новой доски
document.getElementById('closeBoardModal').onclick = () => boardModal.classList.remove('active');
boardModal.onclick = (e) => { if (e.target === boardModal) boardModal.classList.remove('active'); };

document.getElementById('boardForm').onsubmit = async (e) => {
    e.preventDefault();
    const title = document.getElementById('board_title').value.trim();
    const subject = document.getElementById('board_subject').value;
    const btn = e.target.querySelector('button');
    btn.innerText = 'Создание...'; btn.disabled = true;
    
    const { error } = await supabaseClient.from('boards').insert([{
        teacher_id: currentUser.id,
        subject: subject,
        title: title,
        is_active: false
    }]);
    
    btn.innerText = 'Создать'; btn.disabled = false;
    if (error) alert('Ошибка: ' + error.message);
    else { boardModal.classList.remove('active'); document.getElementById('boardForm').reset(); loadBoards(); }
};

// ==========================================
// ВКЛАДКА РАСПИСАНИЕ (КАЛЕНДАРЬ)
// ==========================================
async function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const title = document.getElementById('cal-month-title');
    
    // Загружаем данные, если еще не загружены
    if (!scheduleData || scheduleData.length === 0) {
        const { data } = await supabaseClient.from('teacher_schedule').select('*');
        scheduleData = data || [];
    }

    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();
    const months = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    
    title.innerText = `${months[month]} ${year}`;
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let startOffset = firstDay === 0 ? 6 : firstDay - 1; 

    let html = '';
    ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach(d => {
        html += `<div class="cal-header">${d}</div>`;
    });

    for (let i = 0; i < startOffset; i++) html += `<div></div>`;

    const today = new Date();
    const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = isCurrentMonth && today.getDate() === day;
        const dayEvents = scheduleData.filter(e => e.date_string === dateStr);

        let eventsHtml = '';
        dayEvents.forEach(ev => {
            const color = subjectColors[ev.subject] || '#313131';
            eventsHtml += `<div class="cal-event" style="background: ${color};">${ev.time || ''} ${ev.student_name}</div>`;
        });

        html += `
            <div class="cal-day ${isToday ? 'today' : ''}" onclick="openCalModal('${dateStr}')">
                <div class="cal-num" style="${isToday ? 'color: var(--accent-lime);' : ''}">${day}</div>
                <div style="flex:1; overflow-y:auto;">${eventsHtml}</div>
            </div>
        `;
    }
    grid.innerHTML = html;
}

// Кнопки переключения месяцев
document.getElementById('cal-prev').onclick = () => {
    currentCalDate.setMonth(currentCalDate.getMonth() - 1);
    renderCalendar();
};
document.getElementById('cal-next').onclick = () => {
    currentCalDate.setMonth(currentCalDate.getMonth() + 1);
    renderCalendar();
};

// Модалка календаря
const calModal = document.getElementById('calModal');
window.openCalModal = function(dateStr) {
    document.getElementById('cal_date').value = dateStr;
    document.getElementById('cal-modal-title').innerText = `Запись на ${dateStr}`;
    document.getElementById('calForm').reset();
    
    // Отрисовываем список существующих записей
    const list = document.getElementById('cal-events-list');
    const dayEvents = scheduleData.filter(e => e.date_string === dateStr);
    
    if (dayEvents.length === 0) {
        list.innerHTML = '<p style="opacity:0.5; font-size:0.9rem;">Нет записей на этот день.</p>';
    } else {
        list.innerHTML = '';
        dayEvents.forEach(ev => {
            const color = subjectColors[ev.subject] || '#313131';
            const div = document.createElement('div');
            div.style.cssText = `background: ${color}; color: var(--bg-color); padding: 10px; border-radius: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 0.9rem;`;
            div.innerHTML = `
                <span>${ev.time || ''} ${ev.student_name} <small style="opacity:0.7; font-weight:normal;">(${ev.note || 'без заметки'})</small></span>
                <button onclick="deleteCalEvent('${ev.id}')" style="background: rgba(0,0,0,0.2); border: none; color: white; border-radius: 5px; padding: 5px 10px; cursor: pointer;">✕</button>
            `;
            list.appendChild(div);
        });
    }
    
    calModal.classList.add('active');
};

document.getElementById('closeCalModal').onclick = () => calModal.classList.remove('active');
calModal.onclick = (e) => { if (e.target === calModal) calModal.classList.remove('active'); };

document.getElementById('calForm').onsubmit = async (e) => {
    e.preventDefault();
    const dateStr = document.getElementById('cal_date').value;
    const student_name = document.getElementById('cal_student').value;
    const subject = document.getElementById('cal_subject').value;
    const time = document.getElementById('cal_time').value;
    const note = document.getElementById('cal_note').value;
    
    // Всегда добавляем новую запись
    await supabaseClient.from('teacher_schedule').insert([{ teacher_id: currentUser.id, date_string: dateStr, student_name, subject, time, note }]);
    
    // Сбрасываем кэш и перерисовываем
    scheduleData = [];
    calModal.classList.remove('active');
    renderCalendar();
};

window.deleteCalEvent = async function(id) {
    if (confirm('Удалить запись?')) {
        await supabaseClient.from('teacher_schedule').delete().eq('id', id);
        scheduleData = [];
        // Перерисовываем календарь и обновляем список в модалке
        renderCalendar();
        const currentDate = document.getElementById('cal_date').value;
        openCalModal(currentDate);
    }
};

// ==========================================
// ВКЛАДКА УЧИТЕЛЯ
// ==========================================
async function loadTeachers() {
    const teachersGrid = document.getElementById('teachers-grid');
    teachersGrid.innerHTML = '<div class="loading">Загрузка...</div>';
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('role', 'teacher');
    if (error) { teachersGrid.innerHTML = '<div class="loading" style="color: red;">Ошибка базы</div>'; return; }
    teachers = data || [];
    
    teachersGrid.innerHTML = '';
    if (teachers.length === 0) { teachersGrid.innerHTML = '<p style="opacity:0.5;">Учителей пока нет.</p>'; return; }
    teachers.forEach(t => {
        const card = document.createElement('div');
        card.className = 'card';
        let subs = (t.subject || '').split(',').map(x => x.trim()).filter(x => x);
        let colors = subs.map(sub => subjectColors[sub] || '#313452');
        if (colors.length === 0) colors = ['#313452'];
        if (colors.length === 1) { card.style.background = colors[0]; } else { card.style.background = `linear-gradient(135deg, ${colors.join(', ')})`; }
        card.innerHTML = `<h3>${t.surname || ''} ${t.name || t.full_name}</h3><p>Ставка: ${t.rate || '?'}%</p>`;
        card.onclick = () => openTeacherModal(t);
        teachersGrid.appendChild(card);
    });
}

window.openTeacherModal = function(t = null) {
    document.getElementById('teacherForm').reset();
    if (t) {
        document.getElementById('teacher_id').value = t.id;
        document.getElementById('teacher_surname').value = t.surname || '';
        document.getElementById('teacher_name').value = t.name || '';
        document.getElementById('teacher_email').value = t.login || '';
        document.getElementById('teacher_rate').value = t.rate || '';
        document.getElementById('teacher_phone').value = t.phone || '';
        const subs = (t.subject || '').split(',').map(x=>x.trim());
        const select = document.getElementById('teacher_subjects');
        for (let i = 0; i < select.options.length; i++) select.options[i].selected = subs.includes(select.options[i].value);
        document.getElementById('teacherSaveBtn').innerText = 'Сохранить изменения';
        document.getElementById('teacher_email').disabled = true;
    } else {
        document.getElementById('teacher_id').value = '';
        document.getElementById('teacherSaveBtn').innerText = 'Создать аккаунт';
        document.getElementById('teacher_email').disabled = false;
    }
    document.getElementById('teacherModal').classList.add('active');
};

document.getElementById('closeTeacherModal').onclick = () => document.getElementById('teacherModal').classList.remove('active');

document.getElementById('teacherForm').onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('teacher_id').value;
    const surname = document.getElementById('teacher_surname').value.trim();
    const name = document.getElementById('teacher_name').value.trim();
    const email = document.getElementById('teacher_email').value.trim();
    const password = document.getElementById('teacher_password').value.trim();
    const rate = document.getElementById('teacher_rate').value;
    const phone = document.getElementById('teacher_phone').value;
    const select = document.getElementById('teacher_subjects');
    const subjects = Array.from(select.selectedOptions).map(opt => opt.value).join(',');
    const btn = document.getElementById('teacherSaveBtn');

    if (id) {
        btn.innerText = 'Сохранение...'; btn.disabled = true;
        if (password) {
            await supabaseClient.functions.invoke('create-teacher', { body: { action: 'update_password', id: id, password: password } });
        }
        const { error } = await supabaseClient.from('profiles').update({
            surname: surname, name: name, full_name: `${surname} ${name}`,
            rate: rate ? parseInt(rate) : null, phone: phone, subject: subjects
        }).eq('id', id);
        if (error) alert('Ошибка: ' + error.message);
        else { document.getElementById('teacherModal').classList.remove('active'); loadTeachers(); }
        btn.innerText = 'Сохранить изменения'; btn.disabled = false;
    } else {
        btn.innerText = 'Создание...'; btn.disabled = true;
        try {
            const { data, error } = await supabaseClient.functions.invoke('create-teacher', {
                body: { login: email, password, role: 'teacher', full_name: `${surname} ${name}`, surname, name, rate, phone, subjects }
            });
            if (error) throw error;
            if (data && data.error) throw new Error(data.error);
            alert('Учитель создан!');
            document.getElementById('teacherModal').classList.remove('active');
            loadTeachers();
        } catch (err) { alert('ОШИБКА: ' + err.message); }
        finally { btn.innerText = 'Создать аккаунт'; btn.disabled = false; }
    }
};

document.getElementById('addTeacherBtn').onclick = () => openTeacherModal();

// Запуск
init();

// ==========================================
// ОТЧЕТ ПО СРЕЗАМ
// ==========================================
const reportModal = document.getElementById('reportModal');
document.getElementById('closeReportModal').onclick = () => reportModal.classList.remove('active');
reportModal.onclick = (e) => { if (e.target === reportModal) reportModal.classList.remove('active'); };

window.openReportModal = async function(studentId, studentName) {
    reportModal.classList.add('active');
    const content = document.getElementById('reportContent');
    content.innerHTML = '<div style="text-align:center; opacity:0.5;">Загрузка...</div>';

    const { data, error } = await supabaseClient
        .from('iom_steps')
        .select('*')
        .eq('student_id', studentId)
        .eq('type', 'test')
        .order('step_number', { ascending: true });

    if (error || !data) {
        content.innerHTML = '<div style="color:red;">Ошибка загрузки данных.</div>';
        return;
    }

    if (data.length === 0) {
        content.innerHTML = '<div style="text-align:center; opacity:0.5;">У этого ученика еще нет срезов.</div>';
        return;
    }

    content.innerHTML = '';
    data.forEach((step, index) => {
        const isPassed = step.is_passed;
        const color = isPassed ? 'var(--accent-lime)' : 'var(--accent-purple)';
        const statusText = isPassed ? 'Сдан' : 'Не сдан';
        
        const card = document.createElement('div');
        card.style.cssText = `background: var(--bg-color); border-left: 4px solid ${color}; padding: 15px; border-radius: 12px;`;
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
                <strong style="color: var(--text-main);">Срез №${index + 1}</strong>
                <span style="color: ${color}; font-weight: bold; font-size: 0.85rem;">${statusText}</span>
            </div>
            <div style="font-size: 0.9rem; margin-bottom: 5px; opacity: 0.8;">
                Тема: ${step.title || 'Без названия'}
            </div>
            <div style="font-size: 0.9rem; margin-bottom: 5px; opacity: 0.8;">
                Результат: ${step.result || '—'}
            </div>
            <div style="font-size: 0.85rem; opacity: 0.6; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.1);">
                Описание: ${step.description || 'Нет описания'}
            </div>
        `;
        content.appendChild(card);
    });
};


// ==========================================
// КАЛЕНДАРЬ УЧЕНИКА (В КАРТОЧКЕ)
// ==========================================
var currentStudentSchedule = {};

function parseScheduleStr(str) {
    const res = {};
    if (!str) return res;
    str.split(',').forEach(part => {
        const [day, time] = part.split('=');
        if (day) res[day.trim()] = (time || '').trim();
    });
    return res;
}
function stringifySchedule(obj) {
    return Object.keys(obj).map(day => `${day}=${obj[day]}`).join(',');
}
function updateScheduleTime(day, time) {
    currentStudentSchedule[day] = time;
    document.getElementById('schedule_days').value = stringifySchedule(currentStudentSchedule);
}
function toggleScheduleDay(day) {
    if (currentStudentSchedule[day] !== undefined) {
        delete currentStudentSchedule[day];
    } else {
        currentStudentSchedule[day] = '';
    }
    document.getElementById('schedule_days').value = stringifySchedule(currentStudentSchedule);
    renderStudentCalendar();
}
function renderStudentCalendar() {
    const monthEl = document.getElementById('schedule_month');
    const yearEl = document.getElementById('schedule_year');
    const calEl = document.getElementById('student-calendar');
    if (!monthEl || !yearEl || !calEl) return;

    const month = parseInt(monthEl.value);
    const year = parseInt(yearEl.value);

    if (!month || !year) {
        calEl.innerHTML = '<div style="grid-column: 1/-1; text-align:center; opacity:0.5; padding: 20px; font-size: 0.9rem;">Выберите месяц и год для редактирования</div>';
        return;
    }

    const m = month - 1;
    const sDays = parseScheduleStr(document.getElementById('schedule_days').value);
    currentStudentSchedule = sDays;

    const firstDay = new Date(year, m, 1).getDay();
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    let startOffset = firstDay === 0 ? 6 : firstDay - 1;

    let html = '';
    ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach(d => {
        html += `<div style="text-align:center; font-size:0.7rem; opacity:0.5; padding: 5px 0;">${d}</div>`;
    });
    for (let i = 0; i < startOffset; i++) html += '<div></div>';

    for (let day = 1; day <= daysInMonth; day++) {
        const time = sDays[day];
        const isSelected = time !== undefined;
        html += `
            <div style="background: ${isSelected ? 'var(--accent-lime)' : 'var(--card-bg)'}; color: ${isSelected ? 'var(--bg-color)' : 'var(--text-main)'}; border-radius: 8px; padding: 5px 3px; cursor: pointer; position: relative; min-height: 45px;" onclick="toggleScheduleDay('${day}')">
                <div style="font-size: 0.9rem; font-weight: bold; text-align: center;">${day}</div>
                ${isSelected ? `
                    <input type="text" placeholder="15:00" value="${time || ''}" 
                           onclick="event.stopPropagation()" 
                           onchange="updateScheduleTime('${day}', this.value)" 
                           style="width: 100%; font-size: 0.7rem; padding: 1px 3px; border-radius: 4px; border: none; background: var(--bg-color); color: var(--text-main); margin-top: 2px; text-align: center;">
                ` : ''}
            </div>
        `;
    }
    calEl.innerHTML = html;
}

// Подключаем слушатели к select/input месяца и года (с защитой от повторной инициализации)
function initScheduleCalendarListeners() {
    const monthEl = document.getElementById('schedule_month');
    const yearEl = document.getElementById('schedule_year');
    if (monthEl && !monthEl.dataset.listenerAttached) {
        monthEl.addEventListener('change', renderStudentCalendar);
        monthEl.dataset.listenerAttached = '1';
    }
    if (yearEl && !yearEl.dataset.listenerAttached) {
        yearEl.addEventListener('input', renderStudentCalendar);
        yearEl.dataset.listenerAttached = '1';
    }
}
initScheduleCalendarListeners();
