const API_URL = 'http://localhost:3000/api';
let editingTestId = null; // Variabilă pentru a ști dacă Edităm sau Creăm
let timerInterval = null; 
let currentTestId = null;

// ================= AUTH (LOGIN & SIGNUP) =================

async function signup() {
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const role = document.getElementById('signupRole').value;

    if(!name || !email || !password) return alert("Completează toate câmpurile!");

    const res = await fetch(`${API_URL}/signup`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name, email, password, role })
    });

    const data = await res.json();
    if(data.success) {
        alert("Cont creat! Te poți loga acum.");
        showLogin(); 
    } else {
        alert(data.message || "Eroare la înregistrare");
    }
}

async function login() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;

    if(!email || !password) return alert("Introdu email și parola!");

    const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if(data.success) {
        localStorage.setItem('user', JSON.stringify(data.user));
        if(data.user.role === 'teacher') {
            window.location.href = 'teacher.html';
        } else {
            window.location.href = 'student.html';
        }
    } else {
        alert("Date incorecte!");
    }
}

// --- MODUL NOU: GUEST LOGIN (ACCES RAPID) ---
async function guestLogin() {
    const name = document.getElementById('guestName').value;
    const code = document.getElementById('guestCode').value;
    
    if(!name || !code) return alert("Introdu nume și cod!");

    // 1. Creează cont temporar
    const res = await fetch(`${API_URL}/guest-login`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name })
    });
    const userData = await res.json();
    
    if(userData.success) {
        // Salvăm userul (care are flag is_guest: true)
        localStorage.setItem('user', JSON.stringify(userData.user));
        
        // 2. Caută teste publice pentru codul clasei
        const testsRes = await fetch(`${API_URL}/public/tests-by-code/${code}`);
        const testsData = await testsRes.json();
        
        if(testsData.success && testsData.tests.length > 0) {
            // Modificăm UI-ul manual pentru modul "Guest"
            // Ascundem login, arătăm dashboard student
            document.getElementById('view-login').style.display = 'none';
            document.getElementById('view-student').style.display = 'block';
            document.body.classList.remove('login-mode');

            // Afișează testele găsite
            const div = document.getElementById('availableTestsList');
            div.innerHTML = `<h3 style="color:#00cec9;">Teste Publice pentru codul: ${code}</h3>`;
            testsData.tests.forEach(t => {
                div.innerHTML += `
                    <div class="test-card">
                        <h3>${t.title}</h3>
                        <p>Timp: ${t.time_limit > 0 ? t.time_limit + ' min' : 'Nelimitat'}</p>
                        <button onclick="startTest(${t.id}, '${t.title}')" class="btn">Start Test Rapid</button>
                    </div>`;
            });
            
            // Ascunde meniul de clase că Guest-ul nu are clase salvate
            document.getElementById('myClassesList').innerHTML = '<p><em>Ești conectat ca Oaspete. Rezultatele nu se salvează permanent.</em></p>';
        } else {
            alert("Cod valid, dar nu am găsit teste publice active pentru această clasă.");
        }
    } else {
        alert("Eroare la intrarea ca oaspete.");
    }
}

function logout() {
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

// ================= PROFESOR: CLASE =================

async function createClass() {
    const name = document.getElementById('newClassName').value;
    const user = JSON.parse(localStorage.getItem('user'));
    
    if(!name) return alert("Introdu numele materiei!");

    const res = await fetch(`${API_URL}/create-class`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name, teacherId: user.id })
    });
    
    const data = await res.json();
    if(data.success) {
        alert(`Clasă creată! Codul pentru elevi este: ${data.code}`);
        document.getElementById('newClassName').value = '';
        loadTeacherClasses();
    } else {
        alert("Eroare la creare.");
    }
}

async function loadTeacherClasses() {
    const user = JSON.parse(localStorage.getItem('user'));
    if(!user) return; 

    const res = await fetch(`${API_URL}/teacher/classes/${user.id}`);
    const classes = await res.json();
    
    const container = document.getElementById('classesList');
    const select = document.getElementById('testClassSelect');
    
    if(container) {
        container.innerHTML = '';
        classes.forEach(c => {
            container.innerHTML += `
                <div class="class-card">
                    <h3>${c.name}</h3>
                    <div>Cod Acces: <span class="class-code">${c.access_code}</span></div>
                </div>
            `;
        });
    }

    if(select) {
        select.innerHTML = '<option value="">-- Selectează Clasa --</option>';
        classes.forEach(c => {
            select.innerHTML += `<option value="${c.id}">${c.name}</option>`;
        });
    }
}

// ================= PROFESOR: TESTE (UI HELPERS) =================

// Adaugă o întrebare goală în UI
// MODIFICAT: Adaugă câmp pentru Explicație (Feedback)
function addQuestionUI(data = null) {
    const container = document.getElementById('questionsContainer');
    const div = document.createElement('div');
    div.className = 'question-block';
    
    // Verificăm dacă venim din Editare (data există)
    const textVal = data ? data.text : '';
    const explVal = data ? (data.explanation || '') : ''; 
    const imgVal = data ? (data.image || '') : '';

    div.innerHTML = `
        <input type="text" placeholder="Întrebare..." class="q-text" value="${textVal}" style="width:100%; margin-bottom:5px;">
        
        <input type="text" placeholder="Explicație răspuns (pentru student)..." class="q-explanation" value="${explVal}" style="width:100%; margin-bottom:5px; border:1px dashed #6c5ce7; padding:5px;">
        
        <input type="file" class="q-image" accept="image/*" onchange="previewImage(this)" data-base64="${imgVal}">
        ${imgVal ? `<img src="${imgVal}" class="img-preview" style="max-height: 50px; display:block;">` : ''}
        
        <div class="options-container"></div>
        <button class="btn-secondary" onclick="addOptionUI(this)">+ Variantă</button>
        <button class="btn-secondary" style="background:#e74c3c; color:white" onclick="this.parentElement.remove()">Șterge Întrebarea</button>
    `;
    container.appendChild(div);

    // Dacă avem date (din editare), populăm și opțiunile
    if(data && data.options) {
        const optContainer = div.querySelector('.options-container');
        data.options.forEach(opt => {
            const optDiv = document.createElement('div');
            optDiv.style.display = 'flex'; optDiv.style.gap='10px'; optDiv.style.marginTop='5px';
            optDiv.innerHTML = `
                <input type="checkbox" class="opt-correct" ${opt.isCorrect ? 'checked' : ''}>
                <input type="text" class="opt-text" value="${opt.text}">
                <button onclick="this.parentElement.remove()">X</button>
            `;
            optContainer.appendChild(optDiv);
        });
    }
}

// Adaugă o opțiune la o întrebare specifică
function addOptionUI(btn) {
    const container = btn.previousElementSibling; // options-container
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.gap = '10px';
    div.style.marginTop = '5px';
    div.innerHTML = `
        <input type="checkbox" class="opt-correct">
        <input type="text" class="opt-text" placeholder="Variantă răspuns...">
        <button onclick="this.parentElement.remove()">X</button>
    `;
    container.appendChild(div);
}

// Previzualizare imagine și conversie Base64
function previewImage(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            input.dataset.base64 = e.target.result; // Salvăm base64 în dataset
            
            // Verificăm dacă există deja un preview, dacă nu, îl creăm
            let img = input.nextElementSibling; 
            if (!img || !img.classList.contains('img-preview')) {
                img = document.createElement('img');
                img.classList.add('img-preview');
                img.style.maxHeight = '50px';
                img.style.display = 'block';
                img.style.margin = '5px 0';
                input.parentNode.insertBefore(img, input.nextSibling);
            }
            img.src = e.target.result;
        }
        reader.readAsDataURL(file);
    }
}

// ================= PROFESOR: TESTE (LOGICĂ) =================

function toggleCreateTest() {
    const form = document.getElementById('createTestForm');
    if (form.style.display === 'none') {
        resetForm(); 
        form.style.display = 'block';
    } else {
        form.style.display = 'none';
    }
}

function resetForm() {
    editingTestId = null; 
    document.getElementById('testTitle').value = '';
    document.getElementById('testTimeLimit').value = '0';
    document.getElementById('testClassSelect').value = '';
    document.getElementById('questionsContainer').innerHTML = ''; 
    document.querySelector('#createTestForm h3').innerText = "Creează Test Nou";
}

// EDITARE TEST
// MODIFICAT: Folosește addQuestionUI cu parametri
async function editTest(testId) {
    console.log("--> Încep editarea pentru testul ID:", testId);

    // 1. Încărcăm clasele ca să putem popula dropdown-ul
    await loadTeacherClasses();

    try {
        const res = await fetch(`${API_URL}/test-details/${testId}`);
        
        if (!res.ok) {
            const errData = await res.json();
            console.error("Eroare Server:", errData);
            alert(`Serverul a răspuns cu eroare: ${res.status}`);
            return;
        }

        const data = await res.json();
        console.log("Date primite de la server:", data); 

        if (!data.test) {
            alert("Structura datelor primite este incorectă.");
            return;
        }

        // --- POPULARE FORMULAR ---
        editingTestId = testId;
        const form = document.getElementById('createTestForm');
        
        // Resetare UI
        document.getElementById('questionsContainer').innerHTML = '';
        
        // Afișare
        form.style.display = 'block';
        document.querySelector('#createTestForm h3').innerText = `Editează: ${data.test.title}`;
        form.scrollIntoView({ behavior: 'smooth' });

        // Valori de bază
        document.getElementById('testTitle').value = data.test.title;
        document.getElementById('testTimeLimit').value = data.test.time_limit || 0;
        
        // Selectare Clasă (cu verificare)
        const classSelect = document.getElementById('testClassSelect');
        if(classSelect.querySelector(`option[value="${data.test.class_id}"]`)) {
            classSelect.value = data.test.class_id;
        }

        // Construire întrebări folosind funcția actualizată care știe de Explicații
        (data.questions || []).forEach(q => {
            addQuestionUI(q);
        });

    } catch (e) {
        console.error("Eroare JS:", e);
        alert("A apărut o eroare în script.");
    }
}

// SALVARE (CREATE & UPDATE)
// MODIFICAT: Preia și Explicația (Feedback)
async function saveTest(isPublished) {
    const title = document.getElementById('testTitle').value;
    const classId = document.getElementById('testClassSelect').value;
    const timeLimit = document.getElementById('testTimeLimit').value;
    const user = JSON.parse(localStorage.getItem('user'));
    
    if(!title || !classId) return alert("Completează titlul și alege clasa!");

    const qBlocks = document.querySelectorAll('.question-block');
    let questions = [];

    qBlocks.forEach(block => {
        const text = block.querySelector('.q-text').value;
        const explanation = block.querySelector('.q-explanation').value; // <-- AICI
        const image = block.querySelector('.q-image').dataset.base64 || null;
        
        let options = [];
        block.querySelectorAll('.options-container div').forEach(optDiv => {
            options.push({
                text: optDiv.querySelector('.opt-text').value,
                isCorrect: optDiv.querySelector('.opt-correct').checked
            });
        });
        if(text) questions.push({ text, image, explanation, options });
    });

    const payload = {
        title,
        questions,
        teacherId: user.id,
        classId: classId,
        timeLimit: timeLimit,
        isPublished
    };

    let url = `${API_URL}/create-test`;
    
    if (editingTestId) {
        url = `${API_URL}/update-test`;
        payload.testId = editingTestId;
    } else {
        payload.date = new Date().toISOString().split('T')[0];
    }

    const res = await fetch(url, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    
    if(res.ok) {
        alert(editingTestId ? "Test actualizat!" : "Test creat!");
        location.reload();
    } else {
        alert("Eroare la salvare");
    }
}

// PUBLICARE
async function togglePublish(id, currentStatus) {
    const newStatus = currentStatus ? 0 : 1;
    try {
        const res = await fetch(`${API_URL}/toggle-publish`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ testId: id, status: newStatus })
        });
        const data = await res.json();
        if(data.success) {
            loadTeacherTests();
        } else {
            alert("Eroare la schimbarea statusului.");
        }
    } catch (e) {
        console.error(e);
        alert("Eroare de conexiune.");
    }
}

// LISTA TESTE PROFESOR
async function loadTeacherTests() {
    const user = JSON.parse(localStorage.getItem('user'));
    if(!user) return; 

    const res = await fetch(`${API_URL}/teacher/tests/${user.id}`);
    const tests = await res.json();
    
    const list = document.getElementById('testsList');
    if(list) {
        list.innerHTML = '';
        tests.forEach(t => {
            const editBtn = !t.is_published 
                ? `<button class="btn-secondary" onclick="editTest(${t.id})" style="margin-right:5px;"><i class="fas fa-edit"></i> Editează</button>` 
                : '';

            list.innerHTML += `
                <div class="test-card" style="border-left: 5px solid ${t.is_published ? '#2ecc71' : '#f1c40f'}">
                    <div style="display:flex; justify-content:space-between;">
                        <h3>${t.title} <small>(${t.class_name || 'Fără clasă'})</small></h3>
                        <div class="status-dot ${t.is_published ? 'published' : 'draft'}"></div>
                    </div>
                    <p>Status: <b>${t.is_published ? 'Publicat' : 'Ciornă'}</b> | Timp: ${t.time_limit > 0 ? t.time_limit + ' min' : 'Nelimitat'}</p>
                    <div class="actions">
                        ${editBtn}
                        <button class="btn" onclick="togglePublish(${t.id}, ${t.is_published})">
                            ${t.is_published ? 'Ascunde (Stop)' : 'Publică'}
                        </button>
                        <button class="btn-secondary" onclick="viewResults(${t.id})">Note</button>
                    </div>
                </div>
            `;
        });
    }
}

// REZULTATE PENTRU PROFESOR
// MODIFICAT: Adăugat Buton Export PDF
async function viewResults(testId) {
    const res = await fetch(`${API_URL}/teacher/test-results/${testId}`);
    const results = await res.json();

    const modal = document.getElementById('resultsModal');
    const content = document.getElementById('resultsContent');
    
    let html = `<h3>Rezultate Test</h3>`;
    
    // Buton PDF
    html += `<button onclick="exportToPDF('resultsTable', 'Rezultate_Test_${testId}')" class="btn" style="background:#e17055; margin-bottom:10px;">📄 Export PDF</button>`;

    if(results.length === 0) html += `<p>Niciun student nu a dat acest test.</p>`;
    else {
        // Am adăugat ID="resultsTable" pentru PDF
        html += `<table id="resultsTable" border="1" style="width:100%; border-collapse:collapse;">
            <tr><th>Nume Student</th><th>Notă</th><th>Acțiuni</th></tr>`;
        results.forEach(r => {
            html += `<tr>
                <td>${r.student_name}</td>
                <td><b>${r.score}</b></td>
                <td><button onclick="loadReview(${testId}, ${r.student_id}, 'resultsModal')">Detalii</button></td>
            </tr>`;
        });
        html += `</table>`;
    }
    
    content.innerHTML = html;
    modal.style.display = 'block';
}

// ================= STUDENT: CLASE & JOIN =================

async function joinClass() {
    const code = document.getElementById('classCodeInput').value;
    const user = JSON.parse(localStorage.getItem('user'));
    if(!code) return alert("Introdu codul!");

    const res = await fetch(`${API_URL}/join-class`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ studentId: user.id, accessCode: code })
    });

    const data = await res.json();
    if(data.success) {
        alert(`Te-ai înscris la ${data.className}!`);
        loadStudentClasses();
        loadAvailableTests(); 
    } else {
        alert(data.message);
    }
}

async function loadStudentClasses() {
    const user = JSON.parse(localStorage.getItem('user'));
    if(!user) return;

    const res = await fetch(`${API_URL}/student/classes/${user.id}`);
    const classes = await res.json();
    
    const div = document.getElementById('myClassesList');
    if(div) {
        div.innerHTML = '';
        if(classes.length === 0) {
            div.innerHTML = '<p>Nu ești înscris la nicio materie.</p>';
            return;
        }
        classes.forEach(c => {
            div.innerHTML += `
                <div class="class-card">
                    <h3>${c.name}</h3>
                    <p>Profesor: ${c.teacher_name}</p>
                </div>
            `;
        });
    }
}

// ================= STUDENT: TESTE =================

async function loadAvailableTests() {
    const user = JSON.parse(localStorage.getItem('user'));
    if(!user) return;

    const res = await fetch(`${API_URL}/available-tests/${user.id}`);
    const tests = await res.json();
    
    const div = document.getElementById('availableTestsList');
    if(div) {
        div.innerHTML = '';
        if(tests.length === 0) {
            div.innerHTML = '<p>Nu există teste noi.</p>'; 
            return;
        }
        tests.forEach(t => {
            div.innerHTML += `
                <div class="test-card">
                    <h3>${t.title}</h3>
                    <p>Materie: <b>${t.class_name}</b> | Prof: ${t.teacher_name}</p>
                    <p>Timp: ${t.time_limit > 0 ? t.time_limit + ' min' : 'Nelimitat'}</p>
                    <button class="btn" onclick="startTest(${t.id}, '${t.title}')">Start</button>
                </div>
            `;
        });
    }
}

// ================= LOGICA CRONOMETRU & TEST =================

async function startTest(testId, title) {
    try {
        console.log("Începem testul ID:", testId); // Debugging

        const res = await fetch(`${API_URL}/take-test/${testId}`);
        if (!res.ok) throw new Error("Eroare la preluarea testului");
        
        const data = await res.json(); 
        
        currentTestId = testId;
        
        // --- ZONA CU PROBLEME (FIXATĂ) ---
        // Ascundem dashboard-ul (verificăm dacă există mai întâi)
        const dashboard = document.getElementById('dashboard-view');
        if (dashboard) dashboard.style.display = 'none';

        const viewStudent = document.getElementById('view-student'); // Acesta e doar pt Guest
        if (viewStudent) viewStudent.style.display = 'none';

        // Afișăm zona de test
        const testView = document.getElementById('take-test-view');
        if (!testView) {
            alert("EROARE: Nu găsesc elementul cu id='take-test-view' în HTML! Asigură-te că ai copiat codul HTML dat anterior.");
            return;
        }
        testView.style.display = 'block';
        // ----------------------------------

        document.getElementById('testTitleDisplay').innerText = title;
        
        const container = document.getElementById('quizContainer');
        container.innerHTML = '';
        
        data.questions.forEach((q, idx) => {
            let html = `
                <div class="question-box" id="q_${q.id}" style="margin-bottom:20px; padding:15px; border:1px solid #ddd; border-radius:5px;">
                    <p><strong>${idx+1}. ${q.text}</strong></p>
                    ${q.image ? `<img src="${q.image}" style="max-width:100%; max-height:200px; margin:10px 0;">` : ''}
                    <div class="options">
            `;
            q.options.forEach(opt => {
                html += `
                    <label style="display:block; padding:5px;">
                        <input type="checkbox" name="q_${q.id}" value="${opt.id}"> ${opt.text}
                    </label>
                `;
            });
            html += `</div></div>`;
            container.innerHTML += html;
        });

        if(data.timeLimit > 0) {
            let timeLeft = data.timeLimit * 60; 
            const timerDisplay = document.getElementById('time-display');
            document.getElementById('timer-container').style.display = 'block'; // Asigură-te că și acesta există în HTML

            if(timerInterval) clearInterval(timerInterval);

            timerInterval = setInterval(() => {
                timeLeft--;
                const m = Math.floor(timeLeft / 60);
                const s = timeLeft % 60;
                if(timerDisplay) timerDisplay.innerText = `${m}:${s < 10 ? '0'+s : s}`;

                if(timeLeft <= 0) {
                    clearInterval(timerInterval);
                    alert("Timpul a expirat! Testul se trimite automat.");
                    submitQuiz();
                }
            }, 1000);
        } else {
            const timerContainer = document.getElementById('timer-container');
            if(timerContainer) timerContainer.style.display = 'none';
        }

    } catch (e) {
        console.error("Eroare la startTest:", e);
        alert("A apărut o eroare la pornirea testului. Verifică consola (F12).");
    }
}

async function submitQuiz() {
    if(timerInterval) clearInterval(timerInterval);
    document.getElementById('timer-container').style.display = 'none';

    const user = JSON.parse(localStorage.getItem('user'));
    const answers = [];
    
    const qBoxes = document.querySelectorAll('.question-box');
    qBoxes.forEach(box => {
        const qId = box.id.replace('q_', '');
        const selected = [];
        box.querySelectorAll('input:checked').forEach(inp => selected.push(inp.value));
        answers.push({ question_id: qId, selected_options: selected });
    });

    const res = await fetch(`${API_URL}/submit-quiz`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ studentId: user.id, testId: currentTestId, answers })
    });
    
    const data = await res.json();
    alert(`Test trimis! Nota ta: ${data.grade}`);
    location.reload(); 
}

// ================= REVIEW & ISTORIC =================

async function loadGrades() {
    const user = JSON.parse(localStorage.getItem('user'));
    if(!user) return; 

    const res = await fetch(`${API_URL}/grades/${user.id}`);
    const grades = await res.json();
    
    const list = document.getElementById('gradesList');
    if(list) {
        list.innerHTML = '';
        grades.forEach(g => {
            list.innerHTML += `
                <div class="result-item" style="border-left: 5px solid #6c5ce7; padding:10px; margin-bottom:10px; background:#f9f9f9">
                    <strong>${g.test_name}</strong> (${g.class_name}) <br>
                    Nota: <b>${g.score}</b> <br>
                    <small>${g.date}</small>
                    <button onclick="loadReview(${g.test_id}, ${user.id}, 'reviewModal')" style="float:right; margin-top:-20px;">Vezi Lucrarea</button>
                </div>
            `;
        });
    }
}

// REVIEW
// MODIFICAT: Afișează Explicația (Feedback)
async function loadReview(testId, studentId, modalId) {
    const res = await fetch(`${API_URL}/review/${testId}/${studentId}`);
    const questions = await res.json();
    
    let html = '';
    questions.forEach((q, idx) => {
        html += `<div style="margin-bottom:15px; border-bottom:1px solid #ccc; padding-bottom:10px;">
            <p><strong>${idx+1}. ${q.text}</strong> (Punctaj: ${q.score})</p>
            ${q.image ? `<img src="${q.image}" style="max-height:100px"><br>` : ''}
            <ul>`;
        q.options.forEach(opt => {
            let color = 'black';
            if(opt.is_correct) color = 'green';
            if(opt.student_chose && !opt.is_correct) color = 'red';
            
            const weight = opt.student_chose ? 'bold' : 'normal';
            const check = opt.student_chose ? '(ALES)' : '';
            
            html += `<li style="color:${color}; font-weight:${weight}">${opt.text} ${check}</li>`;
        });
        html += `</ul>`;
        
        // Dacă există feedback/explicație, o afișăm
        if(q.explanation && q.explanation.trim() !== "") {
            html += `<p style="background:#e3f2fd; padding:5px; border-radius:4px;">💡 <b>Feedback:</b> ${q.explanation}</p>`;
        }

        html += `</div>`;
    });
    
    if(modalId === 'resultsModal') {
         document.getElementById('resultsContent').innerHTML = `<button onclick="viewResults(${testId})">Inapoi la Lista</button><hr>` + html;
    } else {
        document.getElementById('reviewContent').innerHTML = html;
        document.getElementById(modalId).style.display = 'block';
    }
}

// ================= UTILS NOVI (PDF) =================

function exportToPDF(tableId, filename) {
    // Verificăm dacă librăria a fost încărcată în HTML
    if (!window.jspdf) {
        alert("Eroare: Librăria jsPDF nu este încărcată! Verifică dacă ai adăugat scripturile în HTML.");
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Titlu în PDF
        doc.setFontSize(18);
        doc.text("Catalog Note - SmartGrade", 14, 20);
        
        doc.setFontSize(12);
        doc.text(`Data export: ${new Date().toLocaleDateString()}`, 14, 30);

        // Generare tabel
        // Verificăm dacă pluginul autoTable există
        if (doc.autoTable) {
            doc.autoTable({ 
                html: '#' + tableId, 
                startY: 35,
                theme: 'grid',
                headStyles: { fillColor: [108, 92, 231] } // Culoare mov ca în temă
            });
            
            doc.save(filename + '.pdf');
        } else {
            alert("Eroare: Pluginul autoTable lipsește.");
        }

    } catch (e) {
        console.error("Eroare PDF:", e);
        alert("A apărut o eroare la generarea PDF-ului. Vezi consola (F12).");
    }
}

// ================= INIȚIALIZARE STABILĂ (FĂRĂ AUTO-REDIRECT DE PE LOGIN) =================
window.onload = function() {
    const user = JSON.parse(localStorage.getItem('user'));
    if(user) {
        if(user.role === 'teacher') {
            loadTeacherClasses();
            loadTeacherTests();
        } else {
            loadStudentClasses();
            loadAvailableTests();
            loadGrades();
        }
    }
};