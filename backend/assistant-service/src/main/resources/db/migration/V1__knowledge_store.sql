CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE vector_store (
    id uuid PRIMARY KEY,
    content text NOT NULL,
    metadata json NOT NULL,
    embedding vector(768) NOT NULL
);
-- Exact cosine search is sufficient for the small, approved corpus.
