import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../App.css'; // Make sure this path is correct (it goes up one directory)

const NODE_API_URL = "http://localhost:5000";

function Chat() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [uploadStatus, setUploadStatus] = useState("");
    const messagesEndRef = useRef(null);

    // Auth and Navigation
    const { token, setAuthToken } = useAuth();
    const navigate = useNavigate();

    // --- Logout Handler ---
    const handleLogout = () => {
        setAuthToken(null); // Clears token from state and localStorage
        navigate('/login'); // Redirect to login
    };

    // --- Scroll to Bottom ---
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // --- Fetch History on Load ---
    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const response = await fetch(`${NODE_API_URL}/api/history`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    if (response.status === 401) handleLogout(); // Token is bad, log out
                    throw new Error('Failed to fetch history');
                }
                const historyMessages = await response.json();
                setMessages(historyMessages);
            } catch (error) {
                console.error("Error fetching history:", error);
                // If the token is invalid, log the user out
                if (error.message.includes("401")) {
                    handleLogout();
                }
            }
        };
        fetchHistory();
    }, [token]); // Re-run if token changes (though it shouldn't here)

    // --- File Upload Handler (FIXED) ---
    const handleFileUpload = async (event) => {
        const files = event.target.files;
        if (files.length === 0) return;

        setUploadStatus("Uploading...");

        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append("files", files[i]);
        }

        try {
            const response = await fetch(`${NODE_API_URL}/api/upload`, {
                method: "POST",
                // THE FIX: Add the Authorization header
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData,
            });

            if (!response.ok) {
                // This will catch the 401 Unauthorized error
                const errorData = await response.json();
                throw new Error(errorData.msg || 'Upload request failed.');
            }

            const data = await response.json();
            setUploadStatus(`Upload successful: ${data.processed_files.join(', ')}`);
        } catch (error) {
            console.error("Error uploading file:", error);
            setUploadStatus("Upload failed.");
            if (error.message.includes("401")) {
                handleLogout(); // Log out if token is bad
            }
        }
    };

    // --- Chat Message Send Handler ---
    const handleSend = async () => {
        if (!input.trim()) return;

        const userMessage = { role: "user", content: input };
        const newMessages = [...messages, userMessage];
        setMessages(newMessages); // Show user's message immediately
        const currentInput = input; // Store input before clearing
        setInput(""); // Clear input field

        try {
            const response = await fetch(`${NODE_API_URL}/api/chat`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ question: currentInput }), // Use stored input
            });

            if (!response.ok) {
                if (response.status === 401) handleLogout();
                throw new Error("Failed to get response from server.");
            }

            if (!response.body) {
                throw new Error("No response body");
            }

            // Handle the stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let assistantResponse = "";
            let assistantMessage = { role: "assistant", content: "" };

            // Add an empty assistant message to the state to stream into
            setMessages([...newMessages, assistantMessage]);

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }
                const chunk = decoder.decode(value, { stream: true });
                assistantResponse += chunk;
                
                // Update the last message in the state (the streaming one)
                setMessages((prevMessages) => {
                    const updatedMessages = [...prevMessages];
                    updatedMessages[updatedMessages.length - 1].content = assistantResponse;
                    return updatedMessages;
                });
            }

        } catch (error) {
            console.error("Error sending message:", error);
            const errorMessage = { role: "assistant", content: "Sorry, I ran into an error." };
            setMessages([...newMessages, errorMessage]);
        }
    };

    return (
        <div className="app-container">
            <header className="app-header">
                <div className="app-header-left">
                    <h1>RAG Chatbot</h1>
                    <div className="upload-section">
                        <label htmlFor="file-upload">Upload PDFs:</label>
                        <input 
                            id="file-upload"
                            type="file" 
                            accept="application/pdf" 
                            multiple 
                            onChange={handleFileUpload} 
                        />
                        {uploadStatus && <p className="upload-status">{uploadStatus}</p>}
                    </div>
                </div>
                <button onClick={handleLogout} className="logout-button">Logout</button>
            </header>
            
            <div className="chat-window">
                <div className="message-list">
                    {messages.map((msg, index) => (
                        <div key={index} className={`message ${msg.role}`}>
                            <p>{msg.content}</p>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
                <div className="chat-input">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                        placeholder="Ask a question about your documents..."
                    />
                    <button onClick={handleSend}>Send</button>
                </div>
            </div>
        </div>
    );
}

export default Chat;