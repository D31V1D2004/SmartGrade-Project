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

// --- PROFESOR: CREARE TEST ---
app.post('/api/create-full-test', (req, res) => {
    const { name, date, questions, teacherId } = req.body; 

    db.run("INSERT INTO tests (name, date, teacher_id) VALUES (?, ?, ?)", [name, date, teacherId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const testId = this.lastID;

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
    });
});

// --- PROFESOR: VEDERE REZULTATE ---
app.get('/api/teacher/tests/:teacherId', (req, res) => {
    const teacherId = req.params.teacherId;
    db.all("SELECT * FROM tests WHERE teacher_id = ? ORDER BY id DESC", [teacherId], (err, rows) => {
        if(err) return res.json([]);
        res.json(rows);
    });
});

app.get('/api/teacher/test-results/:testId', (req, res) => {
    const sql = `
        SELECT u.name as student_name, u.id as student_id, g.score, g.id as grade_id
        FROM grades g
        JOIN users u ON g.student_id = u.id
        WHERE g.test_id = ?
    `;
    db.all(sql, [req.params.testId], (err, rows) => res.json(rows));
});

// --- RUTA REVIEW ACTUALIZATĂ (Calcul Punctaj Per Întrebare) ---
// Notă: Am scos '/teacher' din path ca să fie generic
app.get('/api/review/:testId/:studentId', (req, res) => {
    const { testId, studentId } = req.params;

    db.all("SELECT * FROM questions WHERE test_id = ?", [testId], (err, questions) => {
        if (err) return res.status(500).json({ error: err.message });

        let promises = questions.map(q => {
            return new Promise((resolve) => {
                // 1. Luăm opțiunile
                db.all("SELECT id, text, is_correct FROM options WHERE question_id = ?", [q.id], (err, options) => {
                    
                    // 2. Luăm ce a răspuns studentul
                    db.all("SELECT option_id FROM student_answers WHERE question_id = ? AND student_id = ?", 
                        [q.id, studentId], (err, answers) => {
                        
                        const studentSelectedIds = answers.map(a => a.option_id);
                        
                        // Calculăm datele pentru punctaj
                        const correctIds = options.filter(o => o.is_correct === 1).map(o => o.id);
                        const wrongIds = options.filter(o => o.is_correct === 0).map(o => o.id);

                        let correctHits = 0;
                        let wrongHits = 0;

                        // Marcam ce a ales studentul si calculam hits
                        q.options = options.map(opt => {
                            const isChosen = studentSelectedIds.includes(opt.id);
                            if (isChosen) {
                                if (correctIds.includes(opt.id)) correctHits++;
                                else wrongHits++;
                            }
                            return { ...opt, student_chose: isChosen };
                        });

                        // FORMULA PUNCTAJ (Aceeași ca la submit)
                        const valuePerCorrect = correctIds.length > 0 ? (1 / correctIds.length) : 0;
                        const penaltyPerWrong = wrongIds.length > 0 ? (1 / wrongIds.length) : 0;

                        let qScore = (correctHits * valuePerCorrect) - (wrongHits * penaltyPerWrong);
                        qScore = Math.max(0, Math.min(1, qScore)); // Clamp între 0 și 1

                        // Adăugăm scorul la obiectul întrebării
                        q.score = qScore.toFixed(2);
                        
                        resolve(q);
                    });
                });
            });
        });

        Promise.all(promises).then(fullData => res.json(fullData));
    });
});

// --- STUDENT ---
app.get('/api/available-tests/:studentId', (req, res) => {
    const sql = `
        SELECT tests.*, users.name as teacher_name 
        FROM tests 
        JOIN users ON tests.teacher_id = users.id 
        WHERE tests.id NOT IN (SELECT test_id FROM grades WHERE student_id = ?) 
        ORDER BY tests.id DESC
    `;
    db.all(sql, [req.params.studentId], (err, rows) => res.json(rows));
});

app.get('/api/take-test/:testId', (req, res) => {
    db.all("SELECT * FROM questions WHERE test_id = ?", [req.params.testId], (err, questions) => {
        let promises = questions.map(q => {
            return new Promise((resolve) => {
                db.all("SELECT id, text FROM options WHERE question_id = ?", [q.id], (err, options) => {
                    q.options = options; 
                    resolve(q);
                });
            });
        });
        Promise.all(promises).then(finalQ => res.json(finalQ));
    });
});

// --- SUBMIT QUIZ ---
app.post('/api/submit-quiz', (req, res) => {
    const { studentId, testId, answers } = req.body; 
    let totalScore = 0;
    
    const sqlAllOpts = `
        SELECT q.id as q_id, o.id as opt_id, o.is_correct 
        FROM questions q 
        JOIN options o ON q.id = o.question_id 
        WHERE q.test_id = ?
    `;

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
            let correctHits = 0;
            let wrongHits = 0;

            studentSelected.forEach(selId => {
                if (qData.correctIds.includes(selId)) correctHits++;
                else wrongHits++;
            });

            const valuePerCorrect = qData.correctIds.length > 0 ? (1 / qData.correctIds.length) : 0;
            const penaltyPerWrong = qData.wrongIds.length > 0 ? (1 / qData.wrongIds.length) : 0;

            let questionScore = (correctHits * valuePerCorrect) - (wrongHits * penaltyPerWrong);
            questionScore = Math.max(0, Math.min(1, questionScore));

            totalScore += questionScore;

            studentSelected.forEach(optId => {
                db.run("INSERT INTO student_answers (student_id, test_id, question_id, option_id) VALUES (?, ?, ?, ?)",
                    [studentId, testId, ans.question_id, optId]);
            });
        });

        const finalGrade = totalQuestions > 0 ? (totalScore / totalQuestions) * 10 : 1;
        const roundedGrade = Math.max(1, finalGrade).toFixed(2);

        db.run("INSERT INTO grades (student_id, test_id, score) VALUES (?, ?, ?)", 
            [studentId, testId, roundedGrade], () => {
                res.json({ success: true, grade: roundedGrade });
        });
    });
});

app.get('/api/grades/:studentId', (req, res) => {
    // MODIFICAT: Am adăugat JOIN cu users pentru a lua teacher_name
    const sql = `
        SELECT grades.score, grades.test_id, tests.name as test_name, tests.date, users.name as teacher_name
        FROM grades 
        JOIN tests ON grades.test_id = tests.id 
        JOIN users ON tests.teacher_id = users.id
        WHERE grades.student_id = ?
        ORDER BY grades.id DESC
    `;
    db.all(sql, [req.params.studentId], (err, rows) => res.json(rows));
});

app.listen(PORT, () => console.log(`Server la http://localhost:${PORT}`));