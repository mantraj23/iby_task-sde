# MERN + Python RAG PDF Chatbot

This is a full-stack AI chatbot application. It allows users to create an account, log in, upload their own PDF documents, and have a conversation with an AI about the content of those documents.

This project uses a microservice architecture, combining a MERN stack (MongoDB, Express, React, Node.js) for the user interface and authentication, with a separate Python backend (FastAPI) for the AI and Retrieval-Augmented Generation (RAG) pipeline.

---

## Architecture

This application runs in **three separate terminals** simultaneously:

1.  **React Frontend (Client):** `http://localhost:5173`
    * The user interface (UI) built with React and Vite.
    * Handles login, registration, file uploads, and the chat window.

2.  **Node.js Backend (Chat Manager):** `http://localhost:5000`
    * An Express server that acts as the main "manager."
    * Handles user registration and login (with JWT authentication).
    * Saves and retrieves chat history from a MongoDB Atlas cluster.
    * Acts as a proxy, forwarding AI requests to the Python service.

3.  **Python AI Service (RAG Pipeline):** `http://localhost:8000`
    * A FastAPI server that acts as the "brain."
    * Handles PDF ingestion and embedding (using local models).
    * Answers questions by retrieving relevant text chunks (RAG) and generating a response using the Google Gemini API.

---

## Prerequisites

Before you begin, you will need the following installed:

* **Node.js:** (v20.x or v22.x LTS recommended)
* **Python:** (v3.10+) and `pip`
* **MongoDB:** A (free) **MongoDB Atlas** account for your cloud database.
* **Google AI:** A **Google API Key** for the Gemini model.

---

## 1. Setup

First, clone the repository. Then, you need to set up each of the three services.

### A. Node.js Backend Setup (`mern-chatbot-backend`)

1.  Navigate to the backend folder:
    ```bash
    cd mern-chatbot-backend
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Create a `.env` file in this folder and add your MongoDB and JWT secrets:
    ```.env
    MONGO_URI="your_mongodb_atlas_connection_string"
    JWT_SECRET="your_secure_random_jwt_secret"
    ```
    *To generate a secure JWT secret, run this in your terminal:*
    `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### B. Python AI Service Setup (`python-rag-service`)


    ```
1.  Create and activate a virtual environment:
    ```bash
    # Windows
    python -m venv venv
    .\venv\Scripts\activate
    
    # Mac/Linux
    python3 -m venv venv
    source venv/bin/activate
    ```
3.  Install Python dependencies (you can also put these in a `requirements.txt` file):
    ```bash
    pip install fastapi "uvicorn[standard]" pypdf langchain langchain-huggingface langchain-google-genai sentence-transformers langchain-chroma python-dotenv
    ```
4.  Create a `.env` file in this folder and add your Google API key:
    ```.env
    GOOGLE_API_KEY="your_gemini_api_key_here"
    ```
    *(Note: This is for the `gemini-2.5-flash` generation. The embedding is done locally and is free.)*

### C. React Frontend Setup (`mern-chatbot-frontend`)

1.  Navigate to the frontend folder:
    ```bash
    cd mern-chatbot-frontend
    ```
2.  Install dependencies:
    ```bash
    npm install
    npm install react-router-dom axios
    ```

---

## 2. How to Run

You must start all three services in **three separate terminals**. The order matters.

### ➡️ Terminal 1: Start the Python AI Service

1.  Navigate to the Python folder: `cd python-rag-service`
2.  Activate the virtual environment: `.\venv\Scripts\activate` (or `source venv/bin/activate`)
3.  Start the FastAPI server:
    ```bash
    uvicorn app:app --reload
    ```
4.  **Wait** until you see: `Uvicorn running on http://127.0.0.1:8000`

### ➡️ Terminal 2: Start the Node.js Backend

1.  Navigate to the Node.js folder: `cd mern-chatbot-backend`
2.  Start the Express server:
    ```bash
    node server.js
    ```
3.  **Wait** until you see: `Node.js chat manager server running on http://127.0.0.1:5000` and `Connected to MongoDB Atlas cluster`.

### ➡️ Terminal 3: Start the React Frontend

1.  Navigate to the React folder: `cd mern-chatbot-frontend`
2.  Start the Vite dev server:
    ```bash
    npm run dev
    ```
3.  Vite will give you a local URL. Open `http://localhost:5173` in your browser.

You can now register a new account, log in, upload PDFs, and start chatting!