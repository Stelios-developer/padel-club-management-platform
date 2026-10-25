-- Dedicated development database. Domain databases and users are not connected.
CREATE EXTENSION IF NOT EXISTS vector;
-- The vector-store table will be created by the assistant migration after an
-- embedding model/dimension is selected. Do not assume dimensions from a chat model.
