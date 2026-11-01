const SUPABASE_URL = 'https://kajvldevytbrkeomwlms.supabase.co';
const SUPABASE_KEY = 'sb_publishable__PdBbe6y-EKJ0z4DfPrKKQ_ru9yogqW';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const subjectColors = {
    'Русский язык': '#ef4444', 'Японский язык': '#f1f5f9', 'Английский язык': '#0ea5e9',
    'Литература': '#d97706', 'Обществознание': '#4f46e5', 'История': '#84cc16',
    'Физика': '#2dd4bf', 'Подготовка к школе': '#ec4899'
};
const subjectsList = ['Русский язык', 'Японский язык', 'Английский язык', 'Литература', 'Обществознание', 'История', 'Физика', 'Подготовка к школе'];

let students = [];
let teachers = [];
let currentUser = null;
let currentRole = null;

const grid = document.getElementById('grid');
const modal = document.getElementById('modal');
const form = document.getElementById('form');
const calGrid = document.getElementById('calendar-admin');
const calMonth = document.getElementById('cal-month');
const calYear = document.getElementById('cal-year');
const teacherModal = document.getElementById('teacherModal');
let scheduleData = {};

// --- ПЕРЕКЛЮЧЕНИЕ ВКЛАДОК ---
window.switchTab = function(tabName) {
    ['students', 'boards', 'teachers'].forEach(t => {
        document.getElementById('tab-' + t).classList.remove('active');
        document.getElementById('section-' + t).style.display = 'none';
    });
    document.getElementById('tab-' + tabName).classList.add('active');
    document.getElementById('section-' + tabName).style.display = 'block';

    if (tabName === 'boards') renderBoards();
    if (tabName === 'teachers') loadTeachers();
};

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

    if (currentRole === 'admin') {
        document.getElementById('tab-teachers').style.display = 'block';
    }

    loadStudents();
    loadUnreadCount(user.id);
}

// --- НЕПРОЧИТАННЫЕ ---
async function loadUnreadCount(userId) {
    // Принудительно добавляем кнопку Хранилище перед Мессенджером
    const chatBtn = document.querySelector('a[href="chat.html"]');
    if (chatBtn && !document.querySelector('a[href="materials.html"]')) {
        const storageBtn = document.createElement('a');
        storageBtn.href = 'materials.html';
        storageBtn.innerText = '📚 Хранилище';
        storageBtn.style.cssText = 'color: var(--accent-lime); font-weight: 600; margin-right: 15px; text-decoration: none;';
        chatBtn.parentNode.insertBefore(storageBtn, chatBtn);
    }

    const { data: myChats } = await supabaseClient.from('chat_participants').select('chat_id').eq('user_id', userId);
    if (!myChats || myChats.length === 0) return;
    const chatIds = myChats.map(c => c.chat_id);
    const { count, error } = await supabaseClient.from('messages').select('*', { count: 'exact', head: true }).in('chat_id', chatIds).eq('is_read', false).neq('sender_id', userId);
    if (!error && count > 0) {
        const btn = document.querySelector('a[href="chat.html"]');
        if (btn) {
            let badge = btn.querySelector('.chat-badge');
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'chat-badge';
                badge.style.cssText = 'position:absolute; top:-5px; right:-10px; background:var(--danger); color:white; font-size:0.7rem; padding:2px 6px; border-radius:10px;';
                btn.appendChild(badge);
            }
            badge.innerText = count;
            badge.style.display = 'block';
        }
    }
}

// --- УЧЕНИКИ ---
async function loadStudents() {
    grid.innerHTML = '<div class="loading">Загрузка...</div>';
    let query = supabaseClient.from('students').select('*').order('id', { ascending: true });
    if (currentRole === 'teacher') query = query.eq('teacher_id', currentUser.id);
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

// --- ДОСКИ ---
function renderBoards() {
    const boardsGrid = document.getElementById('boards-grid');
    boardsGrid.innerHTML = '';
    subjectsList.forEach(sub => {
        const card = document.createElement('div');
        card.className = 'card';
        let color = subjectColors[sub] || '#313452';
        card.style.background = color;
        card.innerHTML = `
            <h3>${sub}</h3>
            <div style="display: flex; gap: 10px; margin-top: 15px;">
                <a href="board.html?subject=${sub}" target="_blank" style="background:var(--accent-lime); color:var(--bg-color); padding:8px 15px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:0.9rem;">Доска</a>
            </div>
        `;
        boardsGrid.appendChild(card);
    });
}

// --- УЧИТЕЛЯ ---
async function loadTeachers() {
    const teachersGrid = document.getElementById('teachers-grid');
    teachersGrid.innerHTML = '<div class="loading">Загрузка...</div>';
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('role', 'teacher');
    if (error) { teachersGrid.innerHTML = '<div class="loading" style="color: red;">Ошибка базы</div>'; return; }
    teachers = data || [];
    renderTeachers();
}

function renderTeachers() {
    const teachersGrid = document.getElementById('teachers-grid');
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
        document.getElementById('teacher_password').value = '';
        document.getElementById('teacher_rate').value = t.rate || '';
        document.getElementById('teacher_phone').value = t.phone || '';
        const subs = (t.subject || '').split(',').map(x=>x.trim());
        const select = document.getElementById('teacher_subjects');
        for (let i = 0; i < select.options.length; i++) select.options[i].selected = subs.includes(select.options[i].value);
        document.getElementById('teacherSaveBtn').innerText = 'Сохранить изменения';
        document.getElementById('teacher_email').disabled = true;
        document.getElementById('teacher_password').disabled = false;
    } else {
        document.getElementById('teacher_id').value = '';
        document.getElementById('teacherSaveBtn').innerText = 'Создать аккаунт';
        document.getElementById('teacher_email').disabled = false;
        document.getElementById('teacher_password').disabled = false;
    }
    teacherModal.classList.add('active');
};

document.getElementById('closeTeacherModal').onclick = () => teacherModal.classList.remove('active');
teacherModal.onclick = (e) => { if (e.target === teacherModal) teacherModal.classList.remove('active'); };

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
        else { teacherModal.classList.remove('active'); loadTeachers(); }
        btn.innerText = 'Сохранить изменения'; btn.disabled = false;
    } else {
        btn.innerText = 'Создание...'; btn.disabled = true;
        try {
            const { data, error } = await supabaseClient.functions.invoke('create-teacher', {
                body: { login: email, password, role: 'teacher', full_name: `${surname} ${name}`, surname, name, rate, phone, subjects }
            });
            if (error) throw error;
            if (data && data.error) throw new Error(data.error);
            alert('Учитель успешно создан!');
            teacherModal.classList.remove('active');
            loadTeachers();
        } catch (err) { alert('ОШИБКА: ' + err.message); }
        finally { btn.innerText = 'Создать аккаунт'; btn.disabled = false; }
    }
};

// --- УЧЕНИКИ (МОДАЛКА) ---
window.openStudentModal = function(s = null) {
    form.reset(); scheduleData = {};
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
        if (s.schedule_month) calMonth.value = s.schedule_month;
        if (s.schedule_year) calYear.value = s.schedule_year;
        scheduleData = parseSchedule(s.schedule_days); updateScheduleHiddenInput();
        document.getElementById('tests').value = s.tests || '';
        document.getElementById('topics').value = s.topics || '';
        document.getElementById('iom').value = s.iom || '';
        document.getElementById('deleteBtn').style.display = 'block';
        const notebookLink = document.getElementById('notebookLink');
        notebookLink.href = `notebook.html?student_id=${s.id}&name=${encodeURIComponent(s.surname + ' ' + s.name)}`;
        notebookLink.style.display = 'block';
    } else {
        document.getElementById('id').value = '';
        document.getElementById('level').value = 3;
        document.getElementById('levelVal').innerText = '3';
        document.getElementById('deleteBtn').style.display = 'none';
        document.getElementById('notebookLink').style.display = 'none';
    }
    renderCalendar(); modal.classList.add('active');
};

document.getElementById('closeModal').onclick = () => modal.classList.remove('active');
modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('active'); };

form.onsubmit = async (e) => {
    e.preventDefault();
    const id = document.getElementById('id').value;
    if (!id) {
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
        const tests = document.getElementById('tests').value;
        const topics = document.getElementById('topics').value;
        const iom = document.getElementById('iom').value;
        const schedule_days = document.getElementById('schedule-days').value;
        const schedule_month = calMonth.value;
        const schedule_year = calYear.value;
        
        const btn = form.querySelector('button[type="submit"]');
        btn.innerText = 'Создание...'; btn.disabled = true;

        try {
            const { data, error } = await supabaseClient.functions.invoke('create-teacher', {
                body: { login, password, surname, name, patronymic, age, grade, subjects, level, hourly_rate, about_student, tests, topics, iom, schedule_days, schedule_month, schedule_year, full_name: `${surname} ${name}`, role: 'student', teacher_id: currentRole === 'teacher' ? currentUser.id : null }
            });
            if (error) throw error;
            if (data && data.error) throw new Error(data.error);
            alert('Ученик успешно создан!');
            modal.classList.remove('active');
            loadStudents();
        } catch (err) { alert('ОШИБКА: ' + err.message); }
        finally { btn.innerText = 'Сохранить'; btn.disabled = false; }
        return;
    }

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
        schedule_month: calMonth.value,
        schedule_year: calYear.value,
        schedule_days: document.getElementById('schedule-days').value,
        tests: document.getElementById('tests').value,
        topics: document.getElementById('topics').value,
        iom: document.getElementById('iom').value
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

function renderCalendar() {
    const month = parseInt(calMonth.value);
    const year = parseInt(calYear.value);
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let startOffset = firstDay === 0 ? 6 : firstDay - 1; 
    calGrid.innerHTML = '';
    ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].forEach(d => {
        const el = document.createElement('div'); el.className = 'cal-header'; el.innerText = d; calGrid.appendChild(el);
    });
    for (let i = 0; i < startOffset; i++) calGrid.appendChild(document.createElement('div'));
    for (let day = 1; day <= daysInMonth; day++) {
        const wrapper = document.createElement('div'); wrapper.className = 'cal-day-wrapper';
        const dayBtn = document.createElement('div'); dayBtn.className = 'cal-day'; dayBtn.innerText = day;
        const timeInput = document.createElement('input'); timeInput.type = 'text'; timeInput.className = 'time-input'; timeInput.placeholder = '--:--';
        timeInput.style.display = scheduleData[day] !== undefined ? 'block' : 'none';
        if (scheduleData[day]) timeInput.value = scheduleData[day];
        if (scheduleData[day] !== undefined) dayBtn.classList.add('selected');
        dayBtn.onclick = () => {
            if (scheduleData[day] !== undefined) { delete scheduleData[day]; dayBtn.classList.remove('selected'); timeInput.style.display = 'none'; timeInput.value = ''; }
            else { scheduleData[day] = ''; dayBtn.classList.add('selected'); timeInput.style.display = 'block'; timeInput.focus(); }
            updateScheduleHiddenInput();
        };
        timeInput.oninput = (e) => { scheduleData[day] = e.target.value; updateScheduleHiddenInput(); };
        wrapper.appendChild(dayBtn); wrapper.appendChild(timeInput); calGrid.appendChild(wrapper);
    }
}
function updateScheduleHiddenInput() {
    const str = Object.keys(scheduleData).map(day => `${day}=${scheduleData[day] || ''}`).join(',');
    document.getElementById('schedule-days').value = str;
}
function parseSchedule(str) {
    const obj = {}; if (!str) return obj;
    str.split(',').forEach(item => { const [day, time] = item.split('='); if (day) obj[day] = time || ''; });
    return obj;
}
calMonth.onchange = renderCalendar; calYear.onchange = renderCalendar;

document.getElementById('addBtn').onclick = () => openStudentModal();
document.getElementById('addTeacherBtn').onclick = () => openTeacherModal();

init();
