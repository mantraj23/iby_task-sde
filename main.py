import os
import tempfile
from dotenv import load_dotenv

# --- MODIFIED: API Key Check ---
# Load environment variables from .env file
load_dotenv()
if "GOOGLE_API_KEY" not in os.environ:
    raise EnvironmentError(
        "GOOGLE_API_KEY not found. Please set it in a .env file."
    )
# --- END MODIFICATION ---

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List

# LangChain components
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_chroma import Chroma

# --- MODIFIED: Imports ---
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import SystemMessage, HumanMessage
# NEW: Import for local embeddings
from langchain_community.embeddings import HuggingFaceEmbeddings
# --- END MODIFICATION ---

# Reranking
from sentence_transformers import CrossEncoder

# --- 1. Configuration ---

# App
app = FastAPI(
    title="Local RAG API with Gemini",
    description="A local API for RAG operations on multiple PDFs using Gemini",
)

# --- MODIFIED: Models ---
# Use a local model for embeddings
LOCAL_EMBEDDING_MODEL = "all-MiniLM-L6-v2" 
GEMINI_LLM_MODEL = "gemini-2.5-flash"
RERANKER_MODEL = 'cross-encoder/ms-marco-MiniLM-L6-v2'
# --- END MODIFICATION ---

# Database
CHROMA_PATH = "rag_chroma_db"
COLLECTION_NAME = "rag_app"

# --- MODIFIED: Initialize components ---
# Use the free, local HuggingFace model for embeddings
print("Loading local embedding model. This may take a moment...")
embedding_function = HuggingFaceEmbeddings(
    model_name=LOCAL_EMBEDDING_MODEL,
    model_kwargs={'device': 'cpu'} # Use 'cuda' if you have a GPU
)
print("Embedding model loaded.")

# Keep using the fast Gemini LLM for generation
llm = ChatGoogleGenerativeAI(model=GEMINI_LLM_MODEL, temperature=0, stream=True)

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=400,
    chunk_overlap=100,
    separators=["\n\n", "\n", "?", ". ", " ", ""]
)
cross_encoder = CrossEncoder(RERANKER_MODEL)
# --- END MODIFICATION ---

# Get or create the vector collection
vector_store = Chroma(
    collection_name=COLLECTION_NAME,
    embedding_function=embedding_function,
    persist_directory=CHROMA_PATH
)

# --- 2. Pydantic Models for Request/Response ---

class QueryRequest(BaseModel):
    question: str

# --- 3. Ingestion Endpoint (Multiple PDFs) ---
# (This endpoint is unchanged, it will now use the local embedding_function)

@app.post("/upload")
async def upload_documents(files: List[UploadFile] = File(...)):
    """
    Endpoint to upload multiple PDF files, process them, and add to the vector store.
    """
    processed_files = []
    
    for file in files:
        if file.content_type != "application/pdf":
            raise HTTPException(400, detail=f"File '{file.filename}' is not a PDF.")
            
        temp_file_path = ""
        try:
            # Save PDF to a temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
                await file.seek(0)
                content = await file.read()
                temp_file.write(content)
                temp_file_path = temp_file.name

            # 1. Load the PDF
            loader = PyPDFLoader(temp_file_path)
            docs = loader.load()

            # 2. Split the document
            chunks = text_splitter.split_documents(docs)
            
            if not chunks:
                processed_files.append(f"{file.filename} (skipped, no content found)")
                continue

            # 3. Create IDs and documents for ChromaDB
            ids = [f"{file.filename}_{i}" for i in range(len(chunks))]
            documents = [chunk.page_content for chunk in chunks]
            metadatas = [chunk.metadata for chunk in chunks]

            # 4. Add to vector store
            print(f"Adding {len(chunks)} chunks from {file.filename} to vector store...")
            vector_store.add_texts(
                texts=documents,
                metadatas=metadatas,
                ids=ids
            )
            print(f"Finished processing {file.filename}.")
            
            processed_files.append(file.filename)

        except Exception as e:
            # Handle processing errors
            raise HTTPException(500, detail=f"Error processing {file.filename}: {str(e)}")
        finally:
            # Clean up the temporary file
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)

    return {"message": "Files processed successfully", "processed_files": processed_files}

# --- 4. Query Endpoint (RAG Pipeline) ---

# (This stream_rag_response function is unchanged)
async def stream_rag_response(context: str, question: str):
    """
    Generator function to stream the LLM response using LangChain.
    """
    
    # 1. Define the System Prompt
    system_prompt = """
    You are an assistant for question-answering tasks. 
    Use the following pieces of retrieved context to answer the question. 
    If you don't know the answer, just say that you don't know. 
    Provide a concise answer.
    
    Context:
    {context}
    """
    
    formatted_prompt = system_prompt.format(context=context)

    # 2. Format the messages for LangChain
    messages = [
        SystemMessage(content=formatted_prompt),
        HumanMessage(content=question)
    ]

    # 3. Stream the response from the LLM
    try:
        # Use the 'astream' method for async streaming
        async for chunk in llm.astream(messages):
            # The chunk is an AIMessageChunk, its content is the text
            if chunk.content:
                yield chunk.content
    except Exception as e:
        print(f"Error streaming from Gemini: {e}")
        yield "Error: Could not get a response from the model."

# (This query_rag endpoint is unchanged)
@app.post("/query")
async def query_rag(request: QueryRequest):
    """
    Endpoint to ask a question and get a RAG response.
    """
    question = request.question
    
    # --- RAG Pipeline ---
    
    # 1. Retrieve
    print(f"Retrieving documents for: {question}")
    results = vector_store.similarity_search_with_score(question, k=10)
    
    if not results:
        return StreamingResponse(
            iter(["I could not find any relevant information in the uploaded documents."]),
            media_type="text/plain"
        )
        
    retrieved_docs = [doc.page_content for doc, score in results]

    if not retrieved_docs:
        return StreamingResponse(
            iter(["I could not find any relevant information in the uploaded documents."]),
            media_type="text/plain"
        )

    # 2. Rerank
    print("Reranking retrieved documents...")
    pairs = [[question, doc] for doc in retrieved_docs]
    scores = cross_encoder.predict(pairs)
    scored_docs = sorted(zip(scores, retrieved_docs), reverse=True)
    
    top_3_docs = [doc for score, doc in scored_docs[:3]]
    context = "\n\n".join(top_3_docs)

    # 3. Generate
    print("Streaming response from Gemini...")
    return StreamingResponse(
        stream_rag_response(context, question), 
        media_type="text/plain"
    )

# --- 5. Run the API ---

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)