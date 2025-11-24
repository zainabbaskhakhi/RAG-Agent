-- supabase/schema.sql
-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the units_vacancy table to store CSV chunks
CREATE TABLE IF NOT EXISTS units_vacancy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    embedding VECTOR(1536), -- OpenAI ada-002 produces 1536-dimensional vectors
    metadata JSONB,
    source TEXT,
    chunk_index INTEGER,
    uid TEXT, -- Unique identifier for upsert operations (PropertyCode_UnitNumber)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index for faster similarity search
CREATE INDEX IF NOT EXISTS units_vacancy_embedding_idx 
ON units_vacancy 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create an index on metadata for filtering
CREATE INDEX IF NOT EXISTS units_vacancy_metadata_idx 
ON units_vacancy 
USING gin (metadata);

-- Create an index on source for faster lookups
CREATE INDEX IF NOT EXISTS units_vacancy_source_idx 
ON units_vacancy (source);

-- Create an index on UID for faster upsert operations
CREATE INDEX IF NOT EXISTS units_vacancy_uid_idx 
ON units_vacancy (uid);

-- Create a composite index on metadata->>'UID' for JSONB queries
CREATE INDEX IF NOT EXISTS units_vacancy_metadata_uid_idx 
ON units_vacancy ((metadata->>'UID'));

-- Function to search for similar documents
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding VECTOR(1536),
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    metadata JSONB,
    source TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        units_vacancy.id,
        units_vacancy.content,
        units_vacancy.metadata,
        units_vacancy.source,
        1 - (units_vacancy.embedding <=> query_embedding) AS similarity
    FROM units_vacancy
    WHERE 1 - (units_vacancy.embedding <=> query_embedding) > match_threshold
    ORDER BY units_vacancy.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON units_vacancy
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create a table for tracking ingestion jobs (optional but recommended)
CREATE TABLE IF NOT EXISTS ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    total_chunks INTEGER,
    processed_chunks INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Add row level security (RLS) policies if needed
-- ALTER TABLE units_vacancy ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Enable read access for all users" ON units_vacancy FOR SELECT USING (true);
-- CREATE POLICY "Enable insert for authenticated users only" ON units_vacancy FOR INSERT WITH CHECK (auth.role() = 'authenticated');