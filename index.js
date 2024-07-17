require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000; // Use environment port or default to 3000


const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: {
        rejectUnauthorized: false, // Adjust this based on your database host's SSL requirements
    },
});

module.exports = pool;

// Set the view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware to parse JSON and urlencoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint to render index.ejs with sorting
app.get('/', async (req, res) => {
    const sortBy = req.query.sortBy || 'recency'; // Default sort by recency
    const sortOrder = sortBy === 'reviews' ? 'DESC' : 'ASC'; // Descending for reviews, ascending for recency

    try {
        const booksQuery = `
            SELECT * FROM books 
            INNER JOIN book_covers ON books.isbn = book_covers.isbn
            ORDER BY ${sortBy} ${sortOrder}
        `;
        const result = await pool.query(booksQuery);
        res.render('index', { books: result.rows, sortBy });
    } catch (error) {
        console.error('Error fetching books:', error.message);
        res.render('index', { books: [], sortBy });
    }
});

// Endpoint to render add_books.ejs
app.get('/add-books', (req, res) => {
    res.render('add_books');
});

// Endpoint to handle form submission for adding books
app.post('/add-books', async (req, res) => {
    const { isbn, title, author, reviews, details } = req.body;

    try {
        // Insert or update book details in books table
        const insertBookQuery = {
            text: `INSERT INTO books (isbn, title, author, reviews, details, recency)
                   VALUES ($1, $2, $3, $4, $5, $6)
                   ON CONFLICT (isbn) DO UPDATE 
                   SET title = EXCLUDED.title,
                       author = EXCLUDED.author,
                       reviews = EXCLUDED.reviews,
                       details = EXCLUDED.details,
                       recency = EXCLUDED.recency`,
            values: [isbn, title, author, parseInt(reviews, 10), details, new Date()],
        };
        await pool.query(insertBookQuery);

        // Fetch cover image from API
        const coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
        const response = await axios.get(coverUrl, { responseType: 'arraybuffer' });
        const imageData = Buffer.from(response.data, 'binary').toString('base64');
        const base64Image = `data:image/jpeg;base64,${imageData}`;

        // Insert or update cover image in book_covers table
        const insertCoverQuery = {
            text: `INSERT INTO book_covers (isbn, cover_image)
                   VALUES ($1, $2)
                   ON CONFLICT (isbn) DO UPDATE
                   SET cover_image = EXCLUDED.cover_image`,
            values: [isbn, base64Image],
        };
        await pool.query(insertCoverQuery);

        res.redirect('/');
    } catch (error) {
        console.error('Error adding book:', error.message);
        res.redirect('/add-books');
    }
});

// Endpoint to render update_book.ejs
app.get('/update-book/:isbn', async (req, res) => {
    const { isbn } = req.params;

    try {
        const bookQuery = 'SELECT * FROM books WHERE isbn = $1';
        const result = await pool.query(bookQuery, [isbn]);

        if (result.rows.length > 0) {
            res.render('update_book', { book: result.rows[0], sortBy: 'recency' });
        } else {
            res.redirect('/');
        }
    } catch (error) {
        console.error('Error fetching book:', error.message);
        res.redirect('/');
    }
});

// Endpoint to handle form submission for updating books
app.post('/update-book/:isbn', async (req, res) => {
    const { isbn } = req.params;
    const { title, author, reviews, details } = req.body;

    try {
        // Update book details in books table
        const updateBookQuery = {
            text: `UPDATE books
                   SET title = $1, author = $2, reviews = $3, details = $4, recency = $5
                   WHERE isbn = $6`,
            values: [title, author, parseInt(reviews, 10), details, new Date(), isbn],
        };
        await pool.query(updateBookQuery);

        res.redirect('/');
    } catch (error) {
        console.error('Error updating book:', error.message);
        res.redirect('/');
    }
});

// Endpoint to delete a book
app.post('/delete-book/:isbn', async (req, res) => {
    const { isbn } = req.params;

    try {
        await pool.query('DELETE FROM book_covers WHERE isbn = $1', [isbn]);
        await pool.query('DELETE FROM books WHERE isbn = $1', [isbn]);

        res.redirect('/');
    } catch (error) {
        console.error('Error deleting book:', error.message);
        res.redirect('/');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
