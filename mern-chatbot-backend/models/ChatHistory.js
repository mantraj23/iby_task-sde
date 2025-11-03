const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    role: { type: String, required: true }, // "user" or "assistant"
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const chatHistorySchema = new mongoose.Schema({
    // MODIFIED: Link to the User model
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        required: true,
        unique: true
    },
    messages: [messageSchema]
});

module.exports = ChatHistory = mongoose.model("ChatHistory", chatHistorySchema);
