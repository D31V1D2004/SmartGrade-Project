const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const db = require('./database'); 
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' })); 
app.use(express.static(path.join(__dirname, 'public')));

// --- INIT DB CU COLOANA PUBLISHED ---
// (Codul din database.js e integrat implicit prin logica de creare tabele, 
// dar ne asiguram ca tabelul tests are coloana is_published)
// NOTA: Sterge smartgrade.db inainte sa pornesti acest server!

// --- AUTH ---
app.post('/api/signup', (req, res) => {
    const { name, email, password, role } = req.body;
    db.run("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)", 
    [name, email, password, role], (err) => {
        if (err) return res.json({ success: false, message: "Email existent!" });
        res.json({ success: true });
    });
});

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE email = ? AND password = ?", [email, password], (err, row) => {
        if (row) res.json({ success: true, user: row });
        else res.json({ success: false, message: 'Date incorecte' });
    });
});

// --- PROFESOR: CREARE SI EDITARE ---

// 1. CREARE TEST NOU
app.post('/api/create-test', (req, res) => {
    const { name, date, questions, teacherId, isPublished } = req.body; 

    // Adaugam is_published (0 sau 1)
    db.run("INSERT INTO tests (name, date, teacher_id, is_published) VALUES (?, ?, ?, ?)", 
        [name, date, teacherId, isPublished ? 1 : 0], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const testId = this.lastID;

        insertQuestions(testId, questions, res);
    });
});

// 2. ACTUALIZARE TEST (STERGE VECHI -> PUNE NOU)
app.post('/api/update-test', (req, res) => {
    const { testId, name, questions, isPublished } = req.body;

    // 1. Actualizam titlul si statusul
    db.run("UPDATE tests SET name = ?, is_published = ? WHERE id = ?", [name, isPublished ? 1 : 0, testId], (err) => {
        if(err) return res.status(500).json({ error: err.message });

        // 2. Stergem intrebarile vechi (si optiunile lor prin CASCADE logic sau manual)
        // SQLite nu face cascade delete by default mereu, asa ca stergem manual optiunile intai
        db.run("DELETE FROM options WHERE question_id IN (SELECT id FROM questions WHERE test_id = ?)", [testId], (err) => {
            db.run("DELETE FROM questions WHERE test_id = ?", [testId], (err) => {
                // 3. Inseram intrebarile noi (cele editate)
                insertQuestions(testId, questions, res);
            });
        });
    });
});

// Functie ajutatoare pentru inserare intrebari
function insertQuestions(testId, questions, res) {
    let pending = questions.length;
    if (pending === 0) return res.json({ success: true });

    questions.forEach(q => {
        db.run("INSERT INTO questions (test_id, text, image) VALUES (?, ?, ?)", [testId, q.text, q.image || null], function(err) {
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

// 3. PUBLICARE RAPIDA (Toggle)
app.post('/api/toggle-publish', (req, res) => {
    const { testId, status } = req.body;
    db.run("UPDATE tests SET is_published = ? WHERE id = ?", [status, testId], (err) => {
        if(err) res.status(500).json({error: err.message});
        else res.json({success: true});
    });
});

// 4. DETALII TEST (Pentru Editare)
app.get('/api/test-details/:testId', (req, res) => {
    const testId = req.params.testId;
    db.all("SELECT * FROM questions WHERE test_id = ?", [testId], (err, questions) => {
        if(err) return res.status(500).json({error: err.message});
        
        let promises = questions.map(q => {
            return new Promise((resolve) => {
                db.all("SELECT text, is_correct FROM options WHERE question_id = ?", [q.id], (err, options) => {
                    q.options = options;
                    resolve(q);
                });
            });
        });
        Promise.all(promises).then(fullData => res.json(fullData));
    });
});

// --- GET TESTS ---

// Profesor: Vede TOT (si ciorne si publicate)
app.get('/api/teacher/tests/:teacherId', (req, res) => {
    db.all("SELECT * FROM tests WHERE teacher_id = ? ORDER BY id DESC", [req.params.teacherId], (err, rows) => res.json(rows));
});

// Student: Vede DOAR PUBLICATE (is_published = 1)
app.get('/api/available-tests/:studentId', (req, res) => {
    const sql = `
        SELECT tests.*, users.name as teacher_name 
        FROM tests 
        JOIN users ON tests.teacher_id = users.id 
        WHERE tests.is_published = 1 
        AND tests.id NOT IN (SELECT test_id FROM grades WHERE student_id = ?) 
        ORDER BY tests.id DESC
    `;
    db.all(sql, [req.params.studentId], (err, rows) => res.json(rows));
});

// ... RESTUL RUTELOR (take-test, submit-quiz, grades, test-results, review) RAMAN NESCHIMBATE ...
// (Copiază-le din versiunea anterioară sau lasă-le așa cum erau, sunt compatibile)
// Pentru siguranta, pun aici submit-quiz si review ca sa ai fisierul functional:

app.get('/api/take-test/:testId', (req, res) => {
    db.all("SELECT * FROM questions WHERE test_id = ?", [req.params.testId], (err, questions) => {
        let promises = questions.map(q => {
            return new Promise((resolve) => {
                db.all("SELECT id, text FROM options WHERE question_id = ?", [q.id], (err, options) => {
                    q.options = options; resolve(q);
                });
            });
        });
        Promise.all(promises).then(finalQ => res.json(finalQ));
    });
});

app.post('/api/submit-quiz', (req, res) => {
    const { studentId, testId, answers } = req.body; 
    let totalScore = 0;
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
            const valuePerCorrect = qData.correctIds.length > 0 ? (1 / qData.correctIds.length) : 0;
            const penaltyPerWrong = qData.wrongIds.length > 0 ? (1 / qData.wrongIds.length) : 0;
            let questionScore = (correctHits * valuePerCorrect) - (wrongHits * penaltyPerWrong);
            questionScore = Math.max(0, Math.min(1, questionScore));
            totalScore += questionScore;
            studentSelected.forEach(optId => {
                db.run("INSERT INTO student_answers (student_id, test_id, question_id, option_id) VALUES (?, ?, ?, ?)", [studentId, testId, ans.question_id, optId]);
            });
        });
        const finalGrade = totalQuestions > 0 ? (totalScore / totalQuestions) * 10 : 1;
        const roundedGrade = Math.max(1, finalGrade).toFixed(2);
        db.run("INSERT INTO grades (student_id, test_id, score) VALUES (?, ?, ?)", [studentId, testId, roundedGrade], () => {
            res.json({ success: true, grade: roundedGrade });
        });
    });
});

app.get('/api/grades/:studentId', (req, res) => {
    const sql = `SELECT grades.score, grades.test_id, tests.name as test_name, tests.date, users.name as teacher_name FROM grades JOIN tests ON grades.test_id = tests.id JOIN users ON tests.teacher_id = users.id WHERE grades.student_id = ? ORDER BY grades.id DESC`;
    db.all(sql, [req.params.studentId], (err, rows) => res.json(rows));
});

app.get('/api/teacher/test-results/:testId', (req, res) => {
    const sql = `SELECT u.name as student_name, u.id as student_id, g.score, g.id as grade_id FROM grades g JOIN users u ON g.student_id = u.id WHERE g.test_id = ?`;
    db.all(sql, [req.params.testId], (err, rows) => res.json(rows));
});

app.get('/api/review/:testId/:studentId', (req, res) => {
    const { testId, studentId } = req.params;
    db.all("SELECT * FROM questions WHERE test_id = ?", [testId], (err, questions) => {
        if (err) return res.status(500).json({ error: err.message });
        let promises = questions.map(q => {
            return new Promise((resolve) => {
                db.all("SELECT id, text, is_correct FROM options WHERE question_id = ?", [q.id], (err, options) => {
                    db.all("SELECT option_id FROM student_answers WHERE question_id = ? AND student_id = ?", [q.id, studentId], (err, answers) => {
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

app.listen(PORT, () => console.log(`Server la http://localhost:${PORT}`));