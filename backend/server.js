require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB, pool } = require('./config/db');

// Auto-migrate: ensure all required tables and columns exist
const autoMigrate = async () => {
    try {
        const client = await pool.connect();
        console.log('Running auto-migration...');

        // Create users table if not exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                phone VARCHAR(50),
                address TEXT,
                city VARCHAR(255),
                pincode VARCHAR(20),
                role VARCHAR(20) DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create orders table if not exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                email VARCHAR(255),
                shipping_address TEXT,
                payment_method VARCHAR(100) DEFAULT 'COD',
                total_price FLOAT DEFAULT 0,
                is_paid BOOLEAN DEFAULT FALSE,
                paid_at TIMESTAMP,
                status VARCHAR(50) DEFAULT 'Pending',
                delivered_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Add missing columns to orders table (safe - only adds if not exists)
        await client.query(`
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'user_id') THEN
                    ALTER TABLE orders ADD COLUMN user_id INTEGER;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'shipping_address') THEN
                    ALTER TABLE orders ADD COLUMN shipping_address TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'payment_method') THEN
                    ALTER TABLE orders ADD COLUMN payment_method VARCHAR(100);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'delivered_at') THEN
                    ALTER TABLE orders ADD COLUMN delivered_at TIMESTAMP;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'total_price') THEN
                    ALTER TABLE orders ADD COLUMN total_price FLOAT DEFAULT 0;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'status') THEN
                    ALTER TABLE orders ADD COLUMN status VARCHAR(50) DEFAULT 'Pending';
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'is_paid') THEN
                    ALTER TABLE orders ADD COLUMN is_paid BOOLEAN DEFAULT FALSE;
                END IF;
            END $$;
        `);

        // Drop NOT NULL constraint on email column (it's optional for orders)
        await client.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'email' AND is_nullable = 'NO') THEN
                    ALTER TABLE orders ALTER COLUMN email DROP NOT NULL;
                END IF;
            END $$;
        `);

        // Create order_items table if not exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS order_items (
                id SERIAL PRIMARY KEY,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                product_id INTEGER,
                name VARCHAR(255) NOT NULL,
                qty INTEGER NOT NULL,
                image TEXT NOT NULL,
                price FLOAT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create products table if not exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                price FLOAT NOT NULL,
                category VARCHAR(100),
                image TEXT,
                images TEXT[],
                rating FLOAT DEFAULT 0,
                num_reviews INTEGER DEFAULT 0,
                in_stock BOOLEAN DEFAULT TRUE,
                count_in_stock INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create admins table if not exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create gallery_entries table if not exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS gallery_entries (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255),
                description TEXT,
                image_url TEXT NOT NULL,
                category VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create posts table if not exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS posts (
                id SERIAL PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                content TEXT,
                image TEXT,
                author VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('Auto-migration complete.');
        client.release();
    } catch (error) {
        console.error('Auto-migration error:', error.message);
        // Don't crash the server if migration fails
    }
};

// Initialize DB
connectDB().then(() => autoMigrate());
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes');
const postRoutes = require('./routes/postRoutes');

const app = express();

// Middleware
const allowedOrigins = [
    'http://localhost:3000',
    'https://localhost:3000',
    process.env.FRONTEND_URL, // Vercel URL - set in env vars
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);
        if (allowedOrigins.some(allowed => origin.startsWith(allowed.replace(/\/$/, '')))) {
            return callback(null, true);
        }
        // In production, also allow any .vercel.app subdomain
        if (origin.endsWith('.vercel.app')) {
            return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
    },
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Serve static images from the "uploads" folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/posts', postRoutes);

// 404 Handler
app.use((req, res, next) => {
    res.status(404).json({
        success: false,
        message: `Route not found - ${req.originalUrl}`
    });
});

// Basic error handling middleware
app.use((err, req, res, next) => {
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode).json({
        success: false,
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
