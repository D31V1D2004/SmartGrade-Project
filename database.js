const sqlite3 = require('sqlite3').verbose();
const dbName = 'smartgrade.db';

// Ne conectam la baza de date (sau o cream daca nu exista)
const db = new sqlite3.Database(dbName, (err) => {
    if (err) {
        console.error('Eroare la conectarea la baza de date:', err.message);
    } else {
        console.log('Conectat la baza de date SQLite.');
        initDb();
    }
});

function initDb() {
    const tables = [
        // 1. Tabela UTILIZATORI (neschimbata)
        `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password TEXT,
            role TEXT,
            name TEXT 
        )`,

        // 2. Tabela CLASE (NOUA)
        // Profesorii creeaza clase. 'access_code' este codul pe care il dau studentilor.
        `CREATE TABLE IF NOT EXISTS classes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            teacher_id INTEGER,
            access_code TEXT UNIQUE,
            FOREIGN KEY (teacher_id) REFERENCES users(id)
        )`,

        // 3. Tabela INROLARI (NOUA - Many-to-Many)
        // Leaga studentii de clasele in care s-au inscris.
        `CREATE TABLE IF NOT EXISTS enrollments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            class_id INTEGER,
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users(id),
            FOREIGN KEY (class_id) REFERENCES classes(id)
        )`,

        // 4. Tabela TESTE (MODIFICATA)
        // Am adaugat 'class_id' (testul apartine unei clase) si 'time_limit' (pentru cronometru)
        `CREATE TABLE IF NOT EXISTS tests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            date TEXT,
            teacher_id INTEGER,
            class_id INTEGER, 
            is_published INTEGER DEFAULT 0,
            time_limit INTEGER DEFAULT 0, 
            FOREIGN KEY (teacher_id) REFERENCES users(id),
            FOREIGN KEY (class_id) REFERENCES classes(id)
        )`,

        // 5. Tabela INTREBARI (neschimbata)
        `CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            test_id INTEGER,
            text TEXT,
            image TEXT,
            FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
        )`,

        // 6. Tabela VARIANTE RASPUNS (neschimbata)
        `CREATE TABLE IF NOT EXISTS options (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question_id INTEGER,
            text TEXT,
            is_correct INTEGER,
            FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
        )`,

        // 7. Tabela NOTE (MODIFICATA)
        // E bine sa stim si in ce clasa a fost dat testul, desi putem deduce din test_id
        `CREATE TABLE IF NOT EXISTS grades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            test_id INTEGER,
            score REAL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (student_id) REFERENCES users(id),
            FOREIGN KEY (test_id) REFERENCES tests(id)
        )`,

        // 8. Tabela RASPUNSURI DETALIATE (neschimbata)
        `CREATE TABLE IF NOT EXISTS student_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            grade_id INTEGER,
            question_id INTEGER,
            option_id INTEGER,
            FOREIGN KEY (grade_id) REFERENCES grades(id)
        )`
    ];

    db.serialize(() => {
        tables.forEach((sql) => {
            db.run(sql, (err) => {
                if (err) {
                    console.error('Eroare la crearea tabelei:', err.message);
                }
            });
        });
        console.log('Tabelele au fost initializate/verificate.');
    });
}

module.exports = db;