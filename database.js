// database.js
const sqlite3 = require('sqlite3').verbose();
const dbName = 'smartgrade.db';

const db = new sqlite3.Database(dbName, (err) => {
    if (err) console.error(err.message);
    else {
        console.log('Conectat la baza de date SQLite.');
        
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, email TEXT UNIQUE, password TEXT, role TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS tests (
            id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER, name TEXT, date TEXT
        )`);

        // UPDATE: Am adaugat coloana 'image'
        db.run(`CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER, text TEXT, image TEXT, 
            FOREIGN KEY(test_id) REFERENCES tests(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS options (
            id INTEGER PRIMARY KEY AUTOINCREMENT, question_id INTEGER, text TEXT, is_correct INTEGER,
            FOREIGN KEY(question_id) REFERENCES questions(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS grades (
            id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, test_id INTEGER, score REAL,
            FOREIGN KEY(student_id) REFERENCES users(id), FOREIGN KEY(test_id) REFERENCES tests(id)
        )`);

        // NOU: Salvăm exact ce a răspuns studentul
        db.run(`CREATE TABLE IF NOT EXISTS student_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER, test_id INTEGER, question_id INTEGER, option_id INTEGER
        )`);
    }
});

module.exports = db;