// database.js

// Importam modulul sqlite3 pentru a gestiona baza de date locala
const sqlite3 = require('sqlite3').verbose();
const dbName = 'smartgrade.db'; // Numele fisierului bazei de date

// Initializam conexiunea. Daca fisierul nu exista, va fi creat automat.
const db = new sqlite3.Database(dbName, (err) => {
    if (err) console.error(err.message);
    else {
        console.log('Conectat la baza de date SQLite.');
        
        // 1. TABEL UTILIZATORI
        // Stocheaza atat profesorii cat si studentii.
        // 'role' poate fi 'teacher' sau 'student'.
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            name TEXT, 
            email TEXT UNIQUE, 
            password TEXT, 
            role TEXT
        )`);

        // 2. TABEL TESTE
        // Contine informatiile generale despre test.
        // teacher_id: Leaga testul de profesorul care l-a creat.
        // is_published: 0 = Ciorna (vizibil doar prof), 1 = Public (vizibil si la studenti).
        db.run(`CREATE TABLE IF NOT EXISTS tests (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            teacher_id INTEGER, 
            name TEXT, 
            date TEXT, 
            is_published INTEGER DEFAULT 0, 
            FOREIGN KEY(teacher_id) REFERENCES users(id)
        )`);

        // 3. TABEL INTREBARI
        // Leaga intrebarile de un test specific (test_id).
        // image: Stocheaza poza convertita in text (Base64) daca exista.
        db.run(`CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            test_id INTEGER, 
            text TEXT, 
            image TEXT, 
            FOREIGN KEY(test_id) REFERENCES tests(id)
        )`);

        // 4. TABEL OPTIUNI (VARIANTE DE RASPUNS)
        // Leaga variantele de o intrebare specifica (question_id).
        // is_correct: 1 daca varianta e corecta, 0 daca e gresita.
        db.run(`CREATE TABLE IF NOT EXISTS options (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            question_id INTEGER, 
            text TEXT, 
            is_correct INTEGER,
            FOREIGN KEY(question_id) REFERENCES questions(id)
        )`);

        // 5. TABEL NOTE (REZULTATE FINALE)
        // Salveaza nota finala a unui student la un test.
        db.run(`CREATE TABLE IF NOT EXISTS grades (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            student_id INTEGER, 
            test_id INTEGER, 
            score REAL,
            FOREIGN KEY(student_id) REFERENCES users(id), 
            FOREIGN KEY(test_id) REFERENCES tests(id)
        )`);

        // 6. TABEL RASPUNSURI DETALIATE (ISTORIC)
        // Salvam exact ce casute a bifat studentul.
        // Asta ne ajuta sa aratam cu rosu/verde ce a gresit cand face Review.
        db.run(`CREATE TABLE IF NOT EXISTS student_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            student_id INTEGER, 
            test_id INTEGER, 
            question_id INTEGER, 
            option_id INTEGER
        )`);
    }
});

// Exportam conexiunea pentru a fi folosita in server.js
module.exports = db;