🚀 Production-Ready RAG Agent with LangGraph + Supabase
A complete, production-ready Retrieval-Augmented Generation (RAG) agent that answers questions using CSV data, powered by LangGraph, LangChain, OpenAI, and Supabase pgvector.

✨ Features
CSV Ingestion Pipeline: Automatically process, chunk, and embed CSV data
Vector Search: Fast similarity search using Supabase pgvector
LangGraph Agent: Intelligent agent with retrieval tool integration
OpenAI Integration: GPT-4o-mini for responses, text-embedding-3-small for vectors
REST API: Express.js endpoint for easy integration
Production Ready: Error handling, logging, and monitoring included
Metadata Support: Store and query with full CSV column metadata
📋 Prerequisites
Node.js 18+ installed
Supabase account and project
OpenAI API key
CSV file(s) to ingest
🛠️ Installation
1. Clone and Install Dependencies
bash
# Create project directory
mkdir rag-agent
cd rag-agent

# Initialize npm and install dependencies
npm init -y
npm install @langchain/community @langchain/core @langchain/langgraph @langchain/openai @supabase/supabase-js csv-parse dotenv express cors helmet langchain zod

npm install --save-dev nodemon
2. Set Up Supabase
Create a Supabase Project
Go to supabase.com
Create a new project
Wait for the project to be ready
Run the Schema
Copy the SQL from supabase/schema.sql
Go to your Supabase dashboard → SQL Editor
Paste and run the schema to create tables and functions
Get Your Credentials
SUPABASE_URL: Settings → API → Project URL
SUPABASE_SERVICE_KEY: Settings → API → service_role key (keep secret!)
3. Get OpenAI API Key
Go to platform.openai.com
Navigate to API Keys
Create a new secret key
Copy the key (it won't be shown again)
4. Configure Environment Variables
Create a .env file in the project root:

bash
cp .env.example .env
Edit .env with your credentials:

env
# OpenAI Configuration
OPENAI_API_KEY=sk-proj-your-actual-key-here

# Supabase Configuration
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Server Configuration
PORT=5000
NODE_ENV=development

# RAG Configuration
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
TOP_K_RESULTS=5
SIMILARITY_THRESHOLD=0.7

# Model Configuration
EMBEDDING_MODEL=text-embedding-3-small
LLM_MODEL=gpt-4o-mini
LLM_TEMPERATURE=0.1
MAX_TOKENS=1000
📁 Project Structure
Create the following directory structure:

rag-agent/
├── src/
│   ├── config/
│   │   ├── supabase.js
│   │   └── openai.js
│   ├── services/
│   │   ├── ingestion.js
│   │   ├── retrieval.js
│   │   └── agent.js
│   ├── utils/
│   │   ├── csvProcessor.js
│   │   └── textCleaner.js
│   ├── routes/
│   │   └── ask.js
│   └── server.js
├── scripts/
│   └── ingest.js
├── supabase/
│   └── schema.sql
├── data/
│   └── unit_vacancy_detail-20251119.csv
├── .env
├── .env.example
├── package.json
└── README.md
Copy all the provided code files into their respective locations.

🚀 Usage
Step 1: Ingest Your CSV Data
Place your CSV file in the data/ directory, then run:

bash
npm run ingest ./data/unit_vacancy_detail-20251119.csv
Options:

bash
# Keep existing documents (don't clear)
npm run ingest ./data/unit_vacancy_detail-20251119.csv --no-clear

# Set custom source name
npm run ingest ./data/unit_vacancy_detail-20251119.csv --source=my-custom-source
The ingestion process will:

✅ Read and parse the CSV
✅ Clean and validate text
✅ Split into chunks
✅ Generate embeddings
✅ Store in Supabase with metadata
Step 2: Start the API Server
bash
# Production
npm start

# Development (with auto-reload)
npm run dev
The server will start on http://localhost:5000

Step 3: Query Your Data
Using cURL
bash
# Ask a question
curl -X POST http://localhost:5000/api/ask \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What are the main findings in the dataset?",
    "useAgent": true
  }'

# Get stats
curl http://localhost:5000/api/ask/stats

# Health check
curl http://localhost:5000/api/ask/health
Using JavaScript/Fetch
javascript
const response = await fetch('http://localhost:5000/api/ask', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    question: 'What information is available about sales?',
    useAgent: true,
  }),
});

const data = await response.json();
console.log('Answer:', data.data.answer);
console.log('Sources:', data.data.sources);
📡 API Reference
POST /api/ask
Ask a question based on the CSV data.

Request Body:

json
{
  "question": "Your question here",
  "useAgent": true,
  "source": "optional-source-filter"
}
Response:

json
{
  "success": true,
  "data": {
    "question": "Your question here",
    "answer": "The answer based on the dataset...",
    "sources": [
      {
        "source": "unit_vacancy_detail-20251119.csv",
        "similarity": 0.89,
        "metadata": { "row_index": 5 },
        "content_preview": "..."
      }
    ],
    "hasAnswer": true,
    "processingTime": "1234ms"
  }
}
GET /api/ask/stats
Get dataset statistics.

Response:

json
{
  "success": true,
  "data": {
    "totalDocuments": 150,
    "source": "all"
  }
}
GET /api/ask/health
Health check endpoint.

🎨 Frontend Integration
Simple HTML/JavaScript Example
html
<!DOCTYPE html>
<html>
<head>
    <title>RAG Agent Demo</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
        }
        #question {
            width: 100%;
            padding: 10px;
            font-size: 16px;
        }
        button {
            margin-top: 10px;
            padding: 10px 20px;
            font-size: 16px;
            background: #007bff;
            color: white;
            border: none;
            cursor: pointer;
        }
        button:hover {
            background: #0056b3;
        }
        #result {
            margin-top: 20px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 5px;
        }
        .source {
            margin-top: 10px;
            padding: 10px;
            background: white;
            border-left: 3px solid #007bff;
        }
    </style>
</head>
<body>
    <h1>🤖 RAG Agent</h1>
    <input type="text" id="question" placeholder="Ask a question about your data...">
    <button onclick="askQuestion()">Ask</button>
    
    <div id="result"></div>

    <script>
        async function askQuestion() {
            const question = document.getElementById('question').value;
            const resultDiv = document.getElementById('result');
            
            if (!question) {
                alert('Please enter a question');
                return;
            }
            
            resultDiv.innerHTML = '<p>🔄 Processing...</p>';
            
            try {
                const response = await fetch('http://localhost:5000/api/ask', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        question: question,
                        useAgent: true,
                    }),
                });
                
                const data = await response.json();
                
                if (data.success) {
                    let html = `
                        <h3>Answer:</h3>
                        <p>${data.data.answer}</p>
                        <p><small>⏱️ ${data.data.processingTime}</small></p>
                    `;
                    
                    if (data.data.sources.length > 0) {
                        html += '<h4>Sources:</h4>';
                        data.data.sources.forEach(source => {
                            html += `
                                <div class="source">
                                    <strong>${source.source}</strong> (${(source.similarity * 100).toFixed(1)}% match)
                                    <br><small>${source.content_preview}</small>
                                </div>
                            `;
                        });
                    }
                    
                    resultDiv.innerHTML = html;
                } else {
                    resultDiv.innerHTML = `<p style="color: red;">Error: ${data.error}</p>`;
                }
            } catch (error) {
                resultDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
            }
        }
        
        // Allow Enter key to submit
        document.getElementById('question').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                askQuestion();
            }
        });
    </script>
</body>
</html>
Save this as frontend.html and open it in a browser!

React Component Example
jsx
import { useState } from 'react';

function RAGAgent() {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const askQuestion = async () => {
    if (!question.trim()) return;
    
    setLoading(true);
    
    try {
      const response = await fetch('http://localhost:5000/api/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: question,
          useAgent: true,
        }),
      });
      
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Error:', error);
      setResult({ success: false, error: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">🤖 RAG Agent</h1>
      
      <div className="mb-4">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && askQuestion()}
          placeholder="Ask a question about your data..."
          className="w-full p-3 border rounded"
        />
        <button
          onClick={askQuestion}
          disabled={loading}
          className="mt-2 px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {loading ? 'Processing...' : 'Ask'}
        </button>
      </div>

      {result && result.success && (
        <div className="bg-gray-100 p-4 rounded">
          <h3 className="font-bold mb-2">Answer:</h3>
          <p className="mb-2">{result.data.answer}</p>
          <p className="text-sm text-gray-600">⏱️ {result.data.processingTime}</p>
          
          {result.data.sources.length > 0 && (
            <div className="mt-4">
              <h4 className="font-bold mb-2">Sources:</h4>
              {result.data.sources.map((source, idx) => (
                <div key={idx} className="bg-white p-3 mb-2 border-l-4 border-blue-500">
                  <strong>{source.source}</strong> ({(source.similarity * 100).toFixed(1)}% match)
                  <br />
                  <small className="text-gray-600">{source.content_preview}</small>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default RAGAgent;
🔧 Configuration
Adjusting Chunk Size
Edit .env:

env
CHUNK_SIZE=1500        # Larger chunks for more context
CHUNK_OVERLAP=300      # More overlap for better continuity
Changing Retrieval Settings
Edit .env:

env
TOP_K_RESULTS=10              # Retrieve more documents
SIMILARITY_THRESHOLD=0.6      # Lower threshold for more results
Switching Models
Edit .env:

env
EMBEDDING_MODEL=text-embedding-3-large    # Better embeddings
LLM_MODEL=gpt-4o                          # More powerful model
🐛 Troubleshooting
Common Issues
"Supabase connection failed"

Check SUPABASE_URL and SUPABASE_SERVICE_KEY in .env
Ensure pgvector extension is enabled
Verify schema is created
"OpenAI API error"

Verify OPENAI_API_KEY is correct
Check API quota and billing
Ensure models are available
"No answer found"

Check if data was ingested successfully
Lower SIMILARITY_THRESHOLD
Increase TOP_K_RESULTS
Verify query matches data content
CSV parsing errors

Ensure CSV is properly formatted
Check for special characters
Verify encoding (UTF-8)
📊 Monitoring
Check ingestion status:

bash
# View database directly in Supabase dashboard
# Or query via API:
curl http://localhost:5000/api/ask/stats
🚀 Deployment
Deploy to Production
Set environment to production:
env
   NODE_ENV=production
Use process manager:
bash
   npm install -g pm2
   pm2 start src/server.js --name rag-agent
   pm2 save
   pm2 startup
Set up reverse proxy (nginx):
nginx
   server {
       listen 80;
       server_name your-domain.com;

       location /api {
           proxy_pass http://localhost:5000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
📝 License
MIT

🤝 Contributing
Contributions welcome! Please open an issue or PR.

📚 Additional Resources
LangChain Documentation
LangGraph Documentation
Supabase Documentation
OpenAI API Documentation


Step 1: Creating new Zap
 Step 2: Gmail trigger setup
 Step 3: Filter setup
 Step 4: Webhook setup
 Step 5: Publishing
