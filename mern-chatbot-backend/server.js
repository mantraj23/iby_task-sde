const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const cors = require("cors");
const multer = require("multer");
const FormData = require("form-data");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

require('dotenv').config();

// --- Import Models and Middleware ---
const ChatHistory = require('./models/ChatHistory');
const User = require('./models/User');
const auth = require('./middleware/auth');
// ---

const app = express();
const PORT = 5000;
const PYTHON_API_URL = "http://127.0.0.1:8000";

app.use(cors());
app.use(express.json());

// --- MongoDB Connection ---
const dbUri = process.env.MONGO_URI;
if (!dbUri) {
    console.error("MongoDB URI not found. Please set MONGO_URI in your .env file.");
    process.exit(1);
}

mongoose.connect(dbUri)
    .then(() => console.log("Connected to MongoDB Atlas cluster"))
    .catch((err) => console.error("MongoDB connection error:", err));


// --- User Authentication Routes ---

// @route   POST /api/register
// @desc    Register a new user
app.post("/api/register", async (req, res) => {
    const { email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ msg: "User already exists" });
        }
        user = new User({ email, password });
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();

        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
            if (err) throw err;
            res.json({ token });
        });
    } catch (err) {
        console.error(err.message);
        // MODIFIED: Send JSON error
        res.status(500).json({ msg: "Server error" });
    }
});

// @route   POST /api/login
// @desc    Authenticate user & get token
app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;
    try {
        let user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ msg: "Invalid credentials" });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: "Invalid credentials" });
        }
        const payload = { user: { id: user.id } };
        jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' }, (err, token) => {
            if (err) throw err;
            res.json({ token });
        });
    } catch (err) {
        console.error(err.message);
        // MODIFIED: Send JSON error
        res.status(500).json({ msg: "Server error" });
    }
});

// --- Multer Setup (Unchanged) ---
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Chat & Upload Routes (Now Protected) ---

/**
 * Endpoint to get chat history for a session
 * MODIFIED: Now uses auth and user ID
 */
app.get("/api/history", auth, async (req, res) => {
    try {
        // req.user.id comes from the auth middleware
        const userId = req.user.id; 
        let history = await ChatHistory.findOne({ userId }); // Use userId as the key

        if (!history) {
            history = new ChatHistory({ userId, messages: [] });
            await history.save();
        }
        res.json(history.messages);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Error fetching history" });
    }
});

/**
 * Endpoint to handle a new user chat message
 * MODIFIED: Now uses auth and user ID
 */
app.post("/api/chat", auth, async (req, res) => {
    const { question } = req.body;
    const userId = req.user.id; // Get user ID from token

    try {
        // 1. Save user message to DB
        await ChatHistory.findOneAndUpdate(
            { userId },
            { $push: { messages: { role: "user", content: question } } },
            { upsert: true }
        );

        // 2. Proxy to Python
        const pythonResponse = await axios.post(`${PYTHON_API_URL}/query`, {
            question: question
        }, {
            responseType: 'stream'
        });

        // 3. Stream back
        let fullAssistantResponse = "";
        pythonResponse.data.on('data', (chunk) => {
            const chunkString = chunk.toString();
            fullAssistantResponse += chunkString;
            res.write(chunkString); 
        });

        pythonResponse.data.on('end', async () => {
            // 4. Save assistant response to DB
            await ChatHistory.findOneAndUpdate(
                { userId },
                { $push: { messages: { role: "assistant", content: fullAssistantResponse } } }
            );
            res.end(); 
        });

    } catch (error) {
        console.error("Error in chat endpoint:", error.message);
        res.status(500).json({ error: "Error processing chat" });
    }
});

/**
 * Endpoint to handle PDF uploads
 * MODIFIED: Now uses auth
 */
app.post("/api/upload", auth, upload.array("files"), async (req, res) => {
    
    if (!req.files || req.files.length === 0) {
        return res.status(400).send("No files uploaded.");
    }
    try {
        const formData = new FormData();
        req.files.forEach((file) => {
            formData.append("files", file.buffer, {
                filename: file.originalname,
                contentType: file.mimetype,
            });
        });
        const pythonResponse = await axios.post(`${PYTHON_API_URL}/upload`, formData, {
            headers: { ...formData.getHeaders() }
        });
        res.json(pythonResponse.data);
    } catch (error) {
        console.error("Error in upload endpoint:", error.message);
        res.status(500).json({ error: "Error forwarding file to Python service" });
    }
});

app.listen(PORT, () => {
    console.log(`Node.js chat manager server running on http://127.0.0.1:${PORT}`);
});