// server.js

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database'); 
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
// Mărim limita pentru JSON ca să putem primi imagini base64
app.use(express.json({ limit: '50mb' })); 
app.use(express.static(path.join(__dirname, 'public')));

// ================= BAZA DE DATE (Asigurare structură) =================
// Adăugăm acest bloc pentru a fi siguri că tabelul questions are coloana explanation
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        test_id INTEGER,
        text TEXT,
        image TEXT,
        explanation TEXT, 
        FOREIGN KEY(test_id) REFERENCES tests(id)
    )`);
});

// ================= 1. AUTH & UTILIZATORI =================

// Inregistrare
app.post('/api/signup', (req, res) => {
    const { name, email, password, role } = req.body;
    db.run("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)", 
    [name, email, password, role], (err) => {
        if (err) return res.json({ success: false, message: "Email existent!" });
        res.json({ success: true });
    });
});

// Logare
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE email = ? AND password = ?", [email, password], (err, row) => {
        if (row) res.json({ success: true, user: row });
        else res.json({ success: false, message: 'Date incorecte' });
    });
});

// --- NOU: GUEST LOGIN (PENTRU MODUL PUBLIC) ---
app.post('/api/guest-login', (req, res) => {
    const { name } = req.body;
    // Cream un email temporar ca să treacă de constrângerea UNIQUE din baza de date
    const email = `guest_${Date.now()}_${Math.random().toString(36).substring(7)}@temp.com`;
    const password = "guest_pass_temp";
    
    // Inserăm userul ca 'student'
    db.run("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)", 
    [name, email, password, 'student'], function(err) {
        if (err) return res.status(500).json({ success: false, message: "Eroare server" });
        // Returnăm userul nou creat cu un flag is_guest
        res.json({ success: true, user: { id: this.lastID, name, role: 'student', is_guest: true } });
    });
});

// ================= 2. LOGICA PENTRU CLASE =================

// PROFESOR: Creaza o clasa noua
app.post('/api/create-class', (req, res) => {
    const { name, teacherId } = req.body;
    const accessCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    db.run("INSERT INTO classes (name, teacher_id, access_code) VALUES (?, ?, ?)", 
        [name, teacherId, accessCode], function(err) {
        if(err) return res.status(500).json({ error: err.message });
        res.json({ success: true, code: accessCode });
    });
});

// PROFESOR: Vede clasele create de el
app.get('/api/teacher/classes/:teacherId', (req, res) => {
    db.all("SELECT * FROM classes WHERE teacher_id = ?", [req.params.teacherId], (err, rows) => {
        res.json(rows);
    });
});

// STUDENT: Se inscrie intr-o clasa folosind codul
app.post('/api/join-class', (req, res) => {
    const { studentId, accessCode } = req.body;

    // 1. Cautam clasa dupa cod
    db.get("SELECT id FROM classes WHERE access_code = ?", [accessCode], (err, classRow) => {
        if (!classRow) return res.json({ success: false, message: "Cod invalid!" });

        // 2. Verificam daca e deja inscris
        db.get("SELECT * FROM enrollments WHERE student_id = ? AND class_id = ?", 
            [studentId, classRow.id], (err, row) => {
            if (row) return res.json({ success: false, message: "Esti deja inscris!" });

            // 3. Il inscriem
            db.run("INSERT INTO enrollments (student_id, class_id) VALUES (?, ?)", 
                [studentId, classRow.id], (err) => {
                if(err) return res.status(500).json({ error: err.message });
                res.json({ success: true, className: classRow.name });
            });
        });
    });
});

// STUDENT: Vede clasele in care e inscris
app.get('/api/student/classes/:studentId', (req, res) => {
    const sql = `
        SELECT c.*, u.name as teacher_name 
        FROM classes c
        JOIN enrollments e ON c.id = e.class_id
        JOIN users u ON c.teacher_id = u.id
        WHERE e.student_id = ?
    `;
    db.all(sql, [req.params.studentId], (err, rows) => res.json(rows));
});

// --- NOU: CĂUTARE TESTE PUBLICE DUPĂ COD ---
app.get('/api/public/tests-by-code/:code', (req, res) => {
    const code = req.params.code;
    // Găsim clasa după cod
    db.get("SELECT id FROM classes WHERE access_code = ?", [code], (err, cls) => {
        if(!cls) return res.json({ success: false, message: "Cod invalid" });
        
        // Returnăm toate testele publicate din acea clasă
        const sql = `SELECT t.* FROM tests t WHERE t.class_id = ? AND t.is_published = 1`;
        db.all(sql, [cls.id], (err, rows) => res.json({ success: true, tests: rows }));
    });
});


// ================= 3. GESTIONARE TESTE (CREARE, EDITARE, PUBLICARE) =================

// Functie ajutatoare pentru inserarea intrebarilor
// MODIFICAT: Acum salvează și "explanation"
function insertQuestions(testId, questions, res) {
    if (!questions || questions.length === 0) return res.json({ success: true });
    
    let pending = questions.length;

    questions.forEach(q => {
        // --- MODIFICARE AICI: Am adăugat explanation ---
        db.run("INSERT INTO questions (test_id, text, image, explanation) VALUES (?, ?, ?, ?)", 
            [testId, q.text, q.image || null, q.explanation || ''], function(err) {
            
            const questionId = this.lastID;
            q.options.forEach(opt => {
                db.run("INSERT INTO options (question_id, text, is_correct) VALUES (?, ?, ?)", 
                    [questionId, opt.text, opt.isCorrect ? 1 : 0]);
            });
            pending--;
            if(pending === 0) res.json({ success: true });
        });
    });
}

// CREARE TEST NOU
app.post('/api/create-test', (req, res) => {
    const { title, date, questions, teacherId, classId, timeLimit, isPublished } = req.body; 

    db.run("INSERT INTO tests (title, date, teacher_id, class_id, time_limit, is_published) VALUES (?, ?, ?, ?, ?, ?)", 
        [title, date, teacherId, classId, timeLimit || 0, isPublished ? 1 : 0], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const testId = this.lastID;
        insertQuestions(testId, questions, res);
    });
});

// ACTUALIZARE TEST EXISTENT (EDITARE)
app.post('/api/update-test', (req, res) => {
    const { testId, title, classId, timeLimit, questions, isPublished } = req.body;

    // 1. Actualizam detaliile testului
    db.run("UPDATE tests SET title = ?, class_id = ?, time_limit = ?, is_published = ? WHERE id = ?", 
        [title, classId, timeLimit || 0, isPublished ? 1 : 0, testId], (err) => {
        if(err) return res.status(500).json({ error: err.message });

        // 2. STERGEM intrebarile vechi si optiunile lor
        db.run("DELETE FROM options WHERE question_id IN (SELECT id FROM questions WHERE test_id = ?)", [testId], (err) => {
            db.run("DELETE FROM questions WHERE test_id = ?", [testId], (err) => {
                // 3. Inseram noile intrebari
                insertQuestions(testId, questions, res);
            });
        });
    });
});

// DETALII TEST (Folosit pentru EDITARE + PREVIEW)
app.get('/api/test-details/:testId', (req, res) => {
    const testId = req.params.testId;
    
    // 1. Luăm informațiile despre test
    db.get("SELECT * FROM tests WHERE id=?", [testId], (err, testInfo) => {
        if(err || !testInfo) return res.status(404).json({error: "Test not found"});

        // 2. Luăm întrebările (inclusiv explanation)
        db.all("SELECT * FROM questions WHERE test_id = ?", [testId], (err, questions) => {
            if(err) return res.json({ test: testInfo, questions: [] });

            // 3. Pentru fiecare întrebare, luăm opțiunile
            let promises = questions.map(q => {
                return new Promise((resolve) => {
                    db.all("SELECT id, text, is_correct FROM options WHERE question_id = ?", [q.id], (err, options) => {
                        // Transformăm 1/0 în true/false pentru frontend
                        q.options = options.map(o => ({ 
                            id: o.id,
                            text: o.text, 
                            isCorrect: o.is_correct === 1 
                        }));
                        resolve(q);
                    });
                });
            });
            
            Promise.all(promises).then(fullQuestions => {
                res.json({ 
                    test: testInfo, 
                    questions: fullQuestions 
                });
            });
        });
    });
});

// PUBLICARE / ASCUNDERE TEST (Toggle Publish)
app.post('/api/toggle-publish', (req, res) => {
    const { testId, status } = req.body;
    db.run("UPDATE tests SET is_published = ? WHERE id = ?", [status, testId], (err) => {
        if(err) res.status(500).json({error: err.message});
        else res.json({success: true});
    });
});

// GET TESTE PROFESOR
app.get('/api/teacher/tests/:teacherId', (req, res) => {
    const sql = `
        SELECT tests.*, classes.name as class_name 
        FROM tests 
        LEFT JOIN classes ON tests.class_id = classes.id
        WHERE tests.teacher_id = ? 
        ORDER BY tests.id DESC`;
    db.all(sql, [req.params.teacherId], (err, rows) => res.json(rows));
});

// GET TESTE DISPONIBILE PENTRU STUDENT
app.get('/api/available-tests/:studentId', (req, res) => {
    const sql = `
        SELECT t.*, c.name as class_name, u.name as teacher_name 
        FROM tests t
        JOIN classes c ON t.class_id = c.id
        JOIN enrollments e ON c.id = e.class_id
        JOIN users u ON t.teacher_id = u.id 
        WHERE t.is_published = 1 
        AND e.student_id = ?
        AND t.id NOT IN (SELECT test_id FROM grades WHERE student_id = ?) 
        ORDER BY t.id DESC
    `;
    db.all(sql, [req.params.studentId, req.params.studentId], (err, rows) => res.json(rows));
});

// LUARE TEST (Returneaza intrebarile pentru student - fara raspunsuri corecte marcate)
// MODIFICAT: Include logica ANTI-COPIAT (Randomizare)
app.get('/api/take-test/:testId', (req, res) => {
    db.get("SELECT time_limit FROM tests WHERE id = ?", [req.params.testId], (err, testInfo) => {
        db.all("SELECT * FROM questions WHERE test_id = ?", [req.params.testId], (err, questions) => {
            
            // --- ANTI-COPIAT: Randomizare Întrebări ---
            questions.sort(() => Math.random() - 0.5);

            let promises = questions.map(q => {
                return new Promise((resolve) => {
                    db.all("SELECT id, text FROM options WHERE question_id = ?", [q.id], (err, options) => {
                        
                        // --- ANTI-COPIAT: Randomizare Variante ---
                        options.sort(() => Math.random() - 0.5);
                        
                        q.options = options; 
                        resolve(q);
                    });
                });
            });
            
            Promise.all(promises).then(finalQ => {
                res.json({ questions: finalQ, timeLimit: testInfo ? testInfo.time_limit : 0 });
            });
        });
    });
});

// ================= 4. LOGICA NOTARE & REZULTATE =================

app.post('/api/submit-quiz', (req, res) => {
    const { studentId, testId, answers } = req.body; 
    let totalScore = 0;
    
    // Selectam raspunsurile corecte din DB
    const sqlAllOpts = `SELECT q.id as q_id, o.id as opt_id, o.is_correct FROM questions q JOIN options o ON q.id = o.question_id WHERE q.test_id = ?`;

    db.all(sqlAllOpts, [testId], (err, allRows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let questionsMap = {};
        allRows.forEach(row => {
            if (!questionsMap[row.q_id]) questionsMap[row.q_id] = { correctIds: [], wrongIds: [] };
            if (row.is_correct === 1) questionsMap[row.q_id].correctIds.push(row.opt_id);
            else questionsMap[row.q_id].wrongIds.push(row.opt_id);
        });

        let totalQuestions = answers.length; 

        answers.forEach(ans => {
            const qData = questionsMap[ans.question_id];
            if (!qData) return;

            const studentSelected = ans.selected_options.map(Number);
            let correctHits = 0; let wrongHits = 0;

            studentSelected.forEach(selId => {
                if (qData.correctIds.includes(selId)) correctHits++; else wrongHits++;
            });

            // Algoritm notare partiala
            const valuePerCorrect = qData.correctIds.length > 0 ? (1 / qData.correctIds.length) : 0;
            const penaltyPerWrong = qData.wrongIds.length > 0 ? (1 / qData.wrongIds.length) : 0;

            let questionScore = (correctHits * valuePerCorrect) - (wrongHits * penaltyPerWrong);
            questionScore = Math.max(0, Math.min(1, questionScore));
            
            totalScore += questionScore;
        });

        const finalGrade = totalQuestions > 0 ? (totalScore / totalQuestions) * 10 : 1;
        const roundedGrade = Math.max(1, finalGrade).toFixed(2);

        // Salvam nota
        db.run("INSERT INTO grades (student_id, test_id, score) VALUES (?, ?, ?)", [studentId, testId, roundedGrade], function(err) {
            const gradeId = this.lastID;

            // Salvam raspunsurile detaliate
            answers.forEach(ans => {
                 const studentSelected = ans.selected_options.map(Number);
                 studentSelected.forEach(optId => {
                     db.run("INSERT INTO student_answers (grade_id, question_id, option_id) VALUES (?, ?, ?)", 
                        [gradeId, ans.question_id, optId]);
                 });
            });

            res.json({ success: true, grade: roundedGrade });
        });
    });
});

// Note student
app.get('/api/grades/:studentId', (req, res) => {
    const sql = `
        SELECT grades.id as grade_id, grades.score, grades.test_id, tests.title as test_name, tests.date, classes.name as class_name
        FROM grades 
        JOIN tests ON grades.test_id = tests.id 
        JOIN classes ON tests.class_id = classes.id
        WHERE grades.student_id = ? 
        ORDER BY grades.id DESC`;
    db.all(sql, [req.params.studentId], (err, rows) => res.json(rows));
});

// Rezultate test pentru profesor
app.get('/api/teacher/test-results/:testId', (req, res) => {
    const sql = `SELECT u.name as student_name, u.id as student_id, g.score, g.id as grade_id FROM grades g JOIN users u ON g.student_id = u.id WHERE g.test_id = ?`;
    db.all(sql, [req.params.testId], (err, rows) => res.json(rows));
});

// REVIEW TEST (Detalii despre cum a raspuns studentul)
app.get('/api/review/:testId/:studentId', (req, res) => {
    const { testId, studentId } = req.params;
    
    // Gasim grade_id-ul (ultima nota)
    db.get("SELECT id FROM grades WHERE test_id=? AND student_id=? ORDER BY id DESC LIMIT 1", [testId, studentId], (err, gradeRow) => {
        if(!gradeRow) return res.json([]);
        const gradeId = gradeRow.id;

        // Luăm întrebările (inclusiv explanation)
        db.all("SELECT * FROM questions WHERE test_id = ?", [testId], (err, questions) => {
            let promises = questions.map(q => {
                return new Promise((resolve) => {
                    db.all("SELECT id, text, is_correct FROM options WHERE question_id = ?", [q.id], (err, options) => {
                        // Luam raspunsurile legate de grade_id
                        db.all("SELECT option_id FROM student_answers WHERE question_id = ? AND grade_id = ?", [q.id, gradeId], (err, answers) => {
                            const studentSelectedIds = answers.map(a => a.option_id);
                            
                            const correctIds = options.filter(o => o.is_correct === 1).map(o => o.id);
                            const wrongIds = options.filter(o => o.is_correct === 0).map(o => o.id);
                            let correctHits = 0; let wrongHits = 0;
                            
                            q.options = options.map(opt => {
                                const isChosen = studentSelectedIds.includes(opt.id);
                                if (isChosen) { if (correctIds.includes(opt.id)) correctHits++; else wrongHits++; }
                                return { ...opt, student_chose: isChosen };
                            });

                            const valuePerCorrect = correctIds.length > 0 ? (1 / correctIds.length) : 0;
                            const penaltyPerWrong = wrongIds.length > 0 ? (1 / wrongIds.length) : 0;
                            let qScore = (correctHits * valuePerCorrect) - (wrongHits * penaltyPerWrong);
                            
                            q.score = Math.max(0, Math.min(1, qScore)).toFixed(2);
                            resolve(q);
                        });
                    });
                });
            });
            Promise.all(promises).then(fullData => res.json(fullData));
        });
    });
});

app.listen(PORT, () => console.log(`Server la http://localhost:${PORT}`));