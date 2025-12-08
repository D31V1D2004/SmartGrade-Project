const API_URL = '/api';

// Variabila globala pentru a sti daca editam un test existent
// Daca e null = Creare Test Nou. Daca are ID = Editare Test Existent.
let currentEditingTestId = null;

// ================= 1. UTILITARE & AUTENTIFICARE =================

// Verifica daca utilizatorul este logat si are rolul corect (student/teacher)
// Se apeleaza la incarcarea paginii.
function checkUser(role) {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || user.role !== role) window.location.href = 'index.html';
}

// Sterge userul din memoria browserului si redirectioneaza la Login
function logout() {
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

// Comuta intre formularul de Login si cel de Sign Up
function toggleAuth() {
    const login = document.getElementById('loginSection');
    const signup = document.getElementById('signupSection');
    if (login.style.display === 'none') {
        login.style.display = 'block'; signup.style.display = 'none';
    } else {
        login.style.display = 'none'; signup.style.display = 'block';
    }
}

// Functie care transforma o imagine (Fisier) intr-un text lung (Base64)
// Asta ne ajuta sa salvam poza direct in baza de date SQLite
const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

// Functia de Login - Trimite email si parola la server
async function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if(data.success) {
            // Salvam userul local si intram in dashboard
            localStorage.setItem('user', JSON.stringify(data.user));
            window.location.href = data.user.role === 'teacher' ? 'teacher.html' : 'student.html';
        } else alert(data.message);
    } catch (e) { alert("Eroare conexiune"); }
}

// Functia de Inregistrare - Creeaza cont nou
async function handleSignup() {
    const name = document.getElementById('newName').value;
    const email = document.getElementById('newEmail').value;
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newRole').value;
    
    if(!name || !email || !password) return alert("Completeaza toate campurile!");

    try {
        const res = await fetch(`${API_URL}/signup`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name, email, password, role })
        });
        const data = await res.json();
        if(data.success) { alert("Cont creat!"); toggleAuth(); } else alert(data.message);
    } catch (e) { alert("Eroare la inregistrare"); }
}

// ================= 2. MODUL PROFESOR (DASHBOARD) =================

// Incarca lista de teste create de profesorul curent
async function loadTeacherDashboard() {
    checkUser('teacher');
    const user = JSON.parse(localStorage.getItem('user')); 

    // Cerem de la server doar testele acestui profesor (dupa ID)
    const res = await fetch(`${API_URL}/teacher/tests/${user.id}`);
    const tests = await res.json();
    const list = document.getElementById('myTestsList');
    list.innerHTML = '';
    
    if(tests.length === 0) list.innerHTML = '<p>Nu ai creat niciun test.</p>';

    tests.forEach(t => {
        // Afisare Status: Ciorna (Galben) sau Publicat (Verde)
        const statusBadge = t.is_published 
            ? '<span style="background:#2ecc71; color:white; padding:2px 8px; border-radius:10px; font-size:10px;">PUBLICAT</span>'
            : '<span style="background:#f1c40f; color:black; padding:2px 8px; border-radius:10px; font-size:10px;">CIORNA</span>';

        // Butonul se schimba din "Publica" in "Ascunde" in functie de stare
        const publishBtn = t.is_published 
            ? `<button class="btn" style="background:orange; width:auto; padding:5px; font-size:11px;" onclick="togglePublish(${t.id}, 0)">Ascunde</button>`
            : `<button class="btn" style="background:#2ecc71; width:auto; padding:5px; font-size:11px;" onclick="togglePublish(${t.id}, 1)">Publica</button>`;

        list.innerHTML += `
            <div class="card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <b>${t.name}</b> ${statusBadge}<br>
                        <small style="color:grey">${t.date}</small>
                    </div>
                    <div style="display:flex; gap:5px;">
                        ${publishBtn}
                        <button class="btn" style="background:#3498db; width:auto; padding:5px; font-size:11px;" onclick="editTest(${t.id}, '${t.name}')">Editeaza</button>
                        <button class="btn" style="background:#9b59b6; width:auto; padding:5px; font-size:11px;" onclick="viewTestResults(${t.id}, '${t.name}')">Note</button>
                    </div>
                </div>
            </div>`;
    });
}

// Schimba rapid starea testului (Draft <-> Public)
async function togglePublish(testId, status) {
    await fetch(`${API_URL}/toggle-publish`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ testId, status })
    });
    loadTeacherDashboard(); // Reincarcam lista
}

// Afiseaza lista studentilor care au dat un anumit test
async function viewTestResults(testId, testName) {
    document.getElementById('mainDashboard').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'block';
    document.getElementById('resultsTitle').innerText = `Rezultate: ${testName}`;
    
    const res = await fetch(`${API_URL}/teacher/test-results/${testId}`);
    const results = await res.json();
    const container = document.getElementById('studentsResultsList');
    container.innerHTML = '';
    
    if(results.length === 0) container.innerHTML = '<p>Niciun student nu a dat testul.</p>';

    results.forEach(r => {
        container.innerHTML += `
            <div class="card">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <b>${r.student_name}</b><br>
                        <span style="color:${r.score>=5?'green':'red'}">Nota: ${r.score}</span>
                    </div>
                    <button class="btn" style="width:auto; padding:8px; font-size:12px; background:var(--primary);" 
                    onclick="loadReview(${testId}, ${r.student_id}, '${r.student_name}')">
                        <i class="fas fa-eye"></i> Vezi Lucrare
                    </button>
                </div>
            </div>`;
    });
}

// ================= 3. TEST BUILDER (CREARE SI EDITARE) =================

let questionCount = 0; // Contor pentru ID-uri unice in DOM

// Reseteaza formularul pentru a crea un test nou
function showCreateSection() {
    currentEditingTestId = null; // Null inseamna ca nu editam, ci cream
    document.getElementById('mainDashboard').style.display = 'none';
    document.getElementById('testBuilder').style.display = 'block';
    
    document.getElementById('pageTitle').innerText = "Creeaza Test Nou";
    document.getElementById('testTitle').value = '';
    document.getElementById('questionsContainer').innerHTML = '';
    questionCount = 0;
    addQuestionUI(); // Adaugam prima intrebare goala
}

// Incarca datele unui test existent pentru Editare
async function editTest(testId, testName) {
    currentEditingTestId = testId; // Setam ID-ul testului pe care il editam
    document.getElementById('mainDashboard').style.display = 'none';
    document.getElementById('testBuilder').style.display = 'block';
    document.getElementById('testTitle').value = testName;
    document.getElementById('pageTitle').innerText = "Editare: " + testName;

    const container = document.getElementById('questionsContainer');
    container.innerHTML = '<p>Se incarca testul...</p>';

    // Luam toate detaliile (intrebari, poze, variante) de la server
    const res = await fetch(`${API_URL}/test-details/${testId}`);
    const questions = await res.json();
    container.innerHTML = '';
    questionCount = 0;

    // Reconstruim interfata cu datele primite
    questions.forEach(q => {
        addQuestionFromData(q);
    });
}

// --- FUNCTII AJUTATOARE PENTRU INTERFATA INTREBARI ---

// Adauga o intrebare goala in pagina (cand apesi "+ Intrebare")
function addQuestionUI() {
    questionCount++;
    const container = document.getElementById('questionsContainer');
    const div = createQuestionElement(questionCount, '', null);
    container.appendChild(div);
    // Adaugam 2 variante goale implicit
    addOptionToQuestion(questionCount);
    addOptionToQuestion(questionCount);
}

// Adauga o intrebare deja completata (folosit la Editare)
function addQuestionFromData(qData) {
    questionCount++;
    const container = document.getElementById('questionsContainer');
    const div = createQuestionElement(questionCount, qData.text, qData.image); 
    container.appendChild(div);

    qData.options.forEach(opt => {
        addOptionToQuestion(questionCount, opt.text, opt.is_correct);
    });
}

// Creeaza HTML-ul pentru cardul unei intrebari (Titlu, Upload Poza, Input Text)
function createQuestionElement(id, text, imageBase64) {
    const div = document.createElement('div');
    div.className = 'card question-card';
    div.id = `q-card-${id}`;
    div.style.background = '#f9f9f9';
    
    // Daca exista o imagine salvata, o afisam ca preview
    let imgPreview = '';
    if(imageBase64) {
        imgPreview = `<img src="${imageBase64}" class="old-image-preview" style="max-height:100px; display:block; margin-bottom:5px;">
                      <input type="hidden" class="old-image-data" value="${imageBase64}">`;
    }

    div.innerHTML = `
        <div style="display:flex; justify-content:space-between;">
            <h4>Intrebarea</h4>
            <button onclick="this.parentElement.parentElement.remove()" style="background:red; color:white; border:none; border-radius:5px; cursor:pointer;">X</button>
        </div>
        ${imgPreview}
        <input type="file" class="q-image" accept="image/*" style="margin-bottom:10px;">
        <input type="text" class="q-text" value="${text}" placeholder="Textul Intrebarii">
        <p style="font-size:12px; color:grey; margin-top:10px;">Variante:</p>
        <div class="options-container" id="opts-container-${id}"></div>
        <button class="btn" style="background:#e0e0e0; color:#333; margin-top:10px; font-size:14px;" onclick="addOptionToQuestion(${id})">+ Varianta</button>
    `;
    return div;
}

// Adauga un rand nou pentru varianta de raspuns (Checkbox + Text + Sterge)
function addOptionToQuestion(qId, text = '', isCorrect = false) {
    const optsContainer = document.getElementById(`opts-container-${qId}`);
    const div = document.createElement('div');
    div.className = 'option-row';
    div.style.display = 'flex'; div.style.alignItems = 'center'; div.style.gap = '10px'; div.style.marginBottom = '5px';
    div.innerHTML = `
        <input type="checkbox" class="correct-cb" ${isCorrect ? 'checked' : ''} style="width:20px; height:20px; margin:0;">
        <input type="text" class="opt-text" value="${text}" placeholder="Scrie varianta..." style="margin:0; flex:1;">
        <button onclick="this.parentElement.remove()" style="background:none; border:none; color:red; font-weight:bold; cursor:pointer;"><i class="fas fa-times"></i></button>
    `;
    optsContainer.appendChild(div);
}

// Functia Principala de Salvare (Gestioneaza atat Crearea cat si Actualizarea)
async function saveFullTest(isPublished) {
    const user = JSON.parse(localStorage.getItem('user'));
    const titleInput = document.getElementById('testTitle');
    
    if (!titleInput.value) return alert("Da un titlu testului!");
    
    // Colectam datele din interfata
    const qCards = document.querySelectorAll('.question-card');
    const questionsData = [];

    for (const card of qCards) {
        const qText = card.querySelector('.q-text').value;
        const fileInput = card.querySelector('.q-image');
        const oldImageInput = card.querySelector('.old-image-data');
        let imageBase64 = null;
        
        // Daca utilizatorul a pus o poza noua, o folosim pe aia. Daca nu, pastram pe cea veche.
        if (fileInput.files.length > 0) {
            imageBase64 = await toBase64(fileInput.files[0]);
        } else if (oldImageInput) {
            imageBase64 = oldImageInput.value;
        }

        const options = [];
        card.querySelectorAll('.option-row').forEach(row => {
            const textVal = row.querySelector('.opt-text').value;
            const isChecked = row.querySelector('.correct-cb').checked;
            if (textVal.trim() !== "") options.push({ text: textVal, isCorrect: isChecked });
        });

        // Validare: Intrebarea trebuie sa aiba text si cel putin 2 variante
        if (qText && options.length >= 2) {
            questionsData.push({ text: qText, image: imageBase64, options });
        }
    }

    if(questionsData.length === 0) return alert("Adauga intrebari valide (minim text + 2 variante)!");

    // Alegem ruta corecta: Create sau Update
    let url = currentEditingTestId ? `${API_URL}/update-test` : `${API_URL}/create-test`;
    
    const body = {
        testId: currentEditingTestId, // Necesar doar la update
        name: titleInput.value, 
        date: new Date().toISOString().slice(0,10), 
        questions: questionsData, 
        teacherId: user.id,
        isPublished: isPublished
    };

    const res = await fetch(url, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body)
    });
    
    if(res.ok) { 
        alert(isPublished ? "Test Publicat!" : "Test Salvat ca Ciorna!"); 
        window.location.reload(); 
    } else alert("Eroare server");
}

// ================= 4. REVIEW (VIZUALIZARE LUCRARE) =================
// Aceasta functie e folosita si de Profesor si de Student pentru a vedea detaliile.

async function loadReview(testId, studentId, studentName) {
    // Ascundem ecranele principale
    if(document.getElementById('resultsSection')) document.getElementById('resultsSection').style.display = 'none';
    if(document.getElementById('dashboardView')) document.getElementById('dashboardView').style.display = 'none';
    
    document.getElementById('reviewModal').style.display = 'block';
    document.getElementById('reviewStudentName').innerText = `Lucrare: ${studentName}`;
    
    const container = document.getElementById('reviewContainer');
    container.innerHTML = '<p>Se incarca lucrarea...</p>';

    try {
        const res = await fetch(`${API_URL}/review/${testId}/${studentId}`);
        const questions = await res.json();

        container.innerHTML = '';

        questions.forEach((q, index) => {
            let imgHTML = q.image ? `<img src="${q.image}" style="max-width:100%; border-radius:10px; margin-bottom:10px;">` : '';
            
            let optionsHTML = '';
            const optionsList = q.options || [];

            // Coloram variantele pentru feedback vizual
            optionsList.forEach(opt => {
                let style = "padding: 10px; margin: 5px 0; border-radius: 8px; border: 1px solid #eee;";
                let icon = "";

                if (opt.is_correct) {
                    style = "padding: 10px; margin: 5px 0; border-radius: 8px; background-color: #d4edda; border: 1px solid #c3e6cb; color: #155724;"; 
                    icon = '<i class="fas fa-check"></i>'; // Varianta Corecta (Verde)
                }
                
                if (opt.student_chose) {
                    if (opt.is_correct) {
                        style += " border: 3px solid #2ecc71; font-weight:bold;"; // Corect si Ales (Verde Gros)
                    } else {
                        style = "padding: 10px; margin: 5px 0; border-radius: 8px; background-color: #f8d7da; border: 1px solid #f5c6cb; color: #721c24;"; 
                        icon = '<i class="fas fa-times"></i>'; // Gresit si Ales (Rosu)
                    }
                } 
                optionsHTML += `<div style="${style}">${icon} ${opt.text}</div>`;
            });

            // Afisam punctajul calculat per intrebare (ex: 0.5 / 1p)
            const scoreBadge = `<span style="float:right; background:#6c5ce7; color:white; padding:5px 10px; border-radius:15px; font-size:0.9rem;">
                ${q.score} / 1p
            </span>`;

            container.innerHTML += `
                <div class="card">
                    ${scoreBadge}
                    <h4 style="color:#666; margin-bottom:10px;">Intrebarea ${index+1}</h4>
                    ${imgHTML}
                    <p style="font-size:1.1rem; font-weight:500; margin-bottom:15px; clear:both;">${q.text}</p>
                    <div>${optionsHTML}</div>
                </div>`;
        });
    } catch (err) {
        container.innerHTML = `<p style="color:red">Eroare la incarcare: ${err.message}</p>`;
    }
}

// Inchide fereastra de review si revine la dashboard-ul anterior
function closeReview() {
    document.getElementById('reviewModal').style.display = 'none';
    const user = JSON.parse(localStorage.getItem('user'));
    if (user.role === 'teacher') {
        document.getElementById('resultsSection').style.display = 'block';
    } else {
        document.getElementById('dashboardView').style.display = 'block';
    }
}

// ================= 5. MODUL STUDENT =================

async function loadStudentData() {
    checkUser('student');
    const user = JSON.parse(localStorage.getItem('user'));
    document.getElementById('studentName').innerText = `Salut, ${user.name}!`;

    // 1. Incarcam Testele NOI (Disponibile)
    const res = await fetch(`${API_URL}/available-tests/${user.id}`);
    const tests = await res.json();
    const list = document.getElementById('availableTestsList');
    list.innerHTML = tests.length ? '' : '<p>Nu sunt teste noi.</p>';
    
    tests.forEach(t => {
        list.innerHTML += `
            <div style="border-bottom:1px solid #eee; padding:15px 0; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <span style="font-size:1.1rem; font-weight:bold; color:var(--text);">${t.name}</span>
                    <br> <small style="color:gray;"><i class="fas fa-chalkboard-teacher"></i> Prof. ${t.teacher_name}</small>
                </div>
                <button class="btn" style="width:auto; padding:8px 20px; margin:0;" onclick="startQuiz(${t.id}, '${t.name}')">Start</button>
            </div>`;
    });
    
    // 2. Incarcam Istoricul Notelor
    const resG = await fetch(`${API_URL}/grades/${user.id}`);
    const grades = await resG.json();
    const gList = document.getElementById('gradesList');
    if(gList) {
        gList.innerHTML = '';
        if (grades.length === 0) gList.innerHTML = '<p style="color:gray">Nu ai completat niciun test inca.</p>';
        
        grades.forEach(g => {
            gList.innerHTML += `
            <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <span style="font-weight:bold; font-size:1.1rem;">${g.test_name}</span><br>
                    <small style="color:gray;"><i class="fas fa-chalkboard-teacher"></i> Prof. ${g.teacher_name}</small><br>
                    <span style="color:${g.score >= 5 ? 'green' : 'red'}; font-weight:bold;">Nota: ${g.score}</span>
                </div>
                <button class="btn" style="width:auto; padding:5px 15px; font-size:12px; background:#6c5ce7;" 
                    onclick="loadReview(${g.test_id}, ${user.id}, '${user.name}')">
                    Vezi Lucrare
                </button>
            </div>`;
        });
    }
}

let currentTestId = null; // ID-ul testului pe care il rezolva studentul

// Porneste testul (ascunde dashboard-ul, arata intrebarile)
async function startQuiz(testId, testName) {
    currentTestId = testId;
    document.getElementById('dashboardView').style.display = 'none';
    document.getElementById('quizView').style.display = 'block';
    document.getElementById('quizTitle').innerText = testName;

    const res = await fetch(`${API_URL}/take-test/${testId}`);
    const questions = await res.json();
    const container = document.getElementById('quizQuestions');
    container.innerHTML = '';

    questions.forEach(q => {
        let optionsHTML = '';
        const optionsList = q.options || [];
        optionsList.forEach(opt => {
            optionsHTML += `
                <div style="margin: 10px 0;">
                    <label style="display:flex; align-items:center; gap:10px;">
                        <input type="checkbox" name="q_${q.id}" value="${opt.id}" style="width:20px; height:20px;">
                        <span>${opt.text}</span>
                    </label>
                </div>`;
        });
        let imgHTML = q.image ? `<img src="${q.image}" style="max-width:100%; border-radius:10px; margin-bottom:10px;">` : '';
        container.innerHTML += `<div class="card" style="border-left: 5px solid var(--primary);">${imgHTML}<p><b>${q.text}</b></p><hr style="margin:10px 0; border:0; border-top:1px solid #eee;">${optionsHTML}</div>`;
    });
}

// Trimite testul completat la server
async function submitQuiz() {
    const user = JSON.parse(localStorage.getItem('user'));
    const answersMap = {}; 
    
    // Colectam toate checkbox-urile bifate
    document.querySelectorAll('#quizView input[type="checkbox"]:checked').forEach(inp => {
        const qId = inp.name.split('_')[1];
        if(!answersMap[qId]) answersMap[qId] = [];
        answersMap[qId].push(inp.value);
    });

    const answers = Object.keys(answersMap).map(qId => ({ question_id: qId, selected_options: answersMap[qId] }));

    const res = await fetch(`${API_URL}/submit-quiz`, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ studentId: user.id, testId: currentTestId, answers })
    });
    const result = await res.json();
    if(result.success) { 
        alert(`Test finalizat! Nota: ${result.grade}`); 
        window.location.reload(); 
    }
}

// Anuleaza testul si revine la Dashboard
function cancelQuiz() {
    document.getElementById('dashboardView').style.display = 'block';
    document.getElementById('quizView').style.display = 'none';
}