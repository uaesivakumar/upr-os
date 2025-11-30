-- ============================================================================
-- Sprint 64: Object Intelligence v2
-- UPR OS - Intelligence Engine
-- ============================================================================
--
-- Object Intelligence provides centralized "object brain" logic for
-- Company/Contact/Deal/Signal entities with relationship graphs,
-- event timelines, threaded conversations, and state management.
--
-- ARCHITECTURAL RULES:
-- 1. NO tenant awareness - context passed via API params
-- 2. All config via ConfigLoader - no hardcoded vertical names
-- 3. Deterministic: same config + input = same output
-- ============================================================================

-- ============================================================================
-- OBJECT NODES TABLE
-- Central registry for all business objects
-- ============================================================================

CREATE TABLE IF NOT EXISTS object_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Object identity
  object_type VARCHAR(50) NOT NULL,  -- company, contact, deal, signal, etc.
  external_id VARCHAR(255),           -- External reference (domain, email, etc.)

  -- Context (passed via API, not stored tenant info)
  territory_id VARCHAR(100),
  vertical_slug VARCHAR(50),

  -- Object data
  data JSONB NOT NULL DEFAULT '{}',

  -- Metadata
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT object_nodes_type_external_unique UNIQUE (object_type, external_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_object_nodes_type ON object_nodes(object_type);
CREATE INDEX IF NOT EXISTS idx_object_nodes_external_id ON object_nodes(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_object_nodes_territory ON object_nodes(territory_id) WHERE territory_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_object_nodes_vertical ON object_nodes(vertical_slug) WHERE vertical_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_object_nodes_data ON object_nodes USING GIN(data);
CREATE INDEX IF NOT EXISTS idx_object_nodes_active ON object_nodes(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_object_nodes_created ON object_nodes(created_at DESC);

-- ============================================================================
-- OBJECT EDGES TABLE
-- Relationships between objects (graph structure)
-- ============================================================================

CREATE TABLE IF NOT EXISTS object_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationship endpoints
  from_object_id UUID NOT NULL REFERENCES object_nodes(id) ON DELETE CASCADE,
  to_object_id UUID NOT NULL REFERENCES object_nodes(id) ON DELETE CASCADE,

  -- Edge metadata
  edge_type VARCHAR(100) NOT NULL,  -- employs, owns, related_to, parent_of, etc.
  weight NUMERIC(5,4) DEFAULT 1.0,  -- Relationship strength (0-1)

  -- Additional context
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints (prevent duplicate edges)
  CONSTRAINT object_edges_unique UNIQUE (from_object_id, to_object_id, edge_type)
);

-- Indexes for graph traversal
CREATE INDEX IF NOT EXISTS idx_object_edges_from ON object_edges(from_object_id);
CREATE INDEX IF NOT EXISTS idx_object_edges_to ON object_edges(to_object_id);
CREATE INDEX IF NOT EXISTS idx_object_edges_type ON object_edges(edge_type);
CREATE INDEX IF NOT EXISTS idx_object_edges_weight ON object_edges(weight DESC);

-- ============================================================================
-- OBJECT THREADS TABLE
-- Threaded conversations/notes attached to objects
-- ============================================================================

CREATE TABLE IF NOT EXISTS object_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Thread ownership
  object_id UUID NOT NULL REFERENCES object_nodes(id) ON DELETE CASCADE,

  -- Thread metadata
  thread_type VARCHAR(50) NOT NULL,  -- notes, ai_analysis, discussion, activity
  title VARCHAR(255),

  -- Messages as JSONB array for flexibility
  -- Each message: { id, content, author_type, author_id, timestamp, metadata }
  messages JSONB NOT NULL DEFAULT '[]',

  -- Status
  is_open BOOLEAN NOT NULL DEFAULT true,
  message_count INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT object_threads_valid_messages CHECK (jsonb_typeof(messages) = 'array')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_object_threads_object ON object_threads(object_id);
CREATE INDEX IF NOT EXISTS idx_object_threads_type ON object_threads(thread_type);
CREATE INDEX IF NOT EXISTS idx_object_threads_last_message ON object_threads(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_object_threads_open ON object_threads(is_open) WHERE is_open = true;

-- ============================================================================
-- OBJECT EVENTS TABLE
-- Event log / activity timeline for objects
-- ============================================================================

CREATE TABLE IF NOT EXISTS object_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Event ownership
  object_id UUID NOT NULL REFERENCES object_nodes(id) ON DELETE CASCADE,

  -- Event details
  event_type VARCHAR(100) NOT NULL,  -- created, updated, enriched, scored, contacted, etc.
  event_category VARCHAR(50),         -- system, user, ai, integration

  -- Event payload
  payload JSONB NOT NULL DEFAULT '{}',

  -- Optional related objects
  related_object_id UUID REFERENCES object_nodes(id) ON DELETE SET NULL,

  -- Actor (not tenant-aware, just tracking who/what triggered)
  actor_type VARCHAR(50),  -- system, api, journey, user
  actor_id VARCHAR(255),

  -- Timestamps
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for timeline queries
CREATE INDEX IF NOT EXISTS idx_object_events_object ON object_events(object_id);
CREATE INDEX IF NOT EXISTS idx_object_events_type ON object_events(event_type);
CREATE INDEX IF NOT EXISTS idx_object_events_category ON object_events(event_category) WHERE event_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_object_events_occurred ON object_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_object_events_object_occurred ON object_events(object_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_object_events_related ON object_events(related_object_id) WHERE related_object_id IS NOT NULL;

-- ============================================================================
-- OBJECT STATES TABLE
-- Current computed state for objects (derived from events + data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS object_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- One state per object
  object_id UUID NOT NULL UNIQUE REFERENCES object_nodes(id) ON DELETE CASCADE,

  -- State data (computed/derived state)
  state JSONB NOT NULL DEFAULT '{}',

  -- State metadata
  state_version INTEGER NOT NULL DEFAULT 1,
  last_computed_from_event_id UUID REFERENCES object_events(id),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast state lookups
CREATE INDEX IF NOT EXISTS idx_object_states_object ON object_states(object_id);
CREATE INDEX IF NOT EXISTS idx_object_states_updated ON object_states(updated_at DESC);

-- ============================================================================
-- OBJECT ACTIONS TABLE
-- Available actions for objects (context-dependent)
-- ============================================================================

CREATE TABLE IF NOT EXISTS object_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Action definition
  action_slug VARCHAR(100) NOT NULL,
  action_name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Applicability
  object_types VARCHAR(50)[] NOT NULL,  -- Which object types this applies to
  vertical_slugs VARCHAR(50)[],          -- Optional vertical restriction

  -- Action configuration
  action_type VARCHAR(50) NOT NULL,  -- api_call, journey_trigger, state_change, notification
  config JSONB NOT NULL DEFAULT '{}',

  -- Conditions for availability
  conditions JSONB DEFAULT '{}',  -- State conditions that must be met

  -- Display
  icon VARCHAR(50),
  display_order INTEGER DEFAULT 100,
  is_destructive BOOLEAN DEFAULT false,
  requires_confirmation BOOLEAN DEFAULT false,

  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT object_actions_slug_unique UNIQUE (action_slug)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_object_actions_types ON object_actions USING GIN(object_types);
CREATE INDEX IF NOT EXISTS idx_object_actions_verticals ON object_actions USING GIN(vertical_slugs) WHERE vertical_slugs IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_object_actions_active ON object_actions(is_active) WHERE is_active = true;

-- ============================================================================
-- HELPER VIEWS
-- ============================================================================

-- Object graph view with edge counts
CREATE OR REPLACE VIEW v_object_graph AS
SELECT
  n.id,
  n.object_type,
  n.external_id,
  n.territory_id,
  n.vertical_slug,
  n.data,
  n.created_at,
  n.updated_at,
  COUNT(DISTINCT e_out.id) AS outgoing_edges,
  COUNT(DISTINCT e_in.id) AS incoming_edges,
  COUNT(DISTINCT e_out.id) + COUNT(DISTINCT e_in.id) AS total_edges,
  ARRAY_AGG(DISTINCT e_out.edge_type) FILTER (WHERE e_out.edge_type IS NOT NULL) AS outgoing_edge_types,
  ARRAY_AGG(DISTINCT e_in.edge_type) FILTER (WHERE e_in.edge_type IS NOT NULL) AS incoming_edge_types
FROM object_nodes n
LEFT JOIN object_edges e_out ON n.id = e_out.from_object_id
LEFT JOIN object_edges e_in ON n.id = e_in.to_object_id
WHERE n.is_active = true
GROUP BY n.id;

-- Activity timeline view
CREATE OR REPLACE VIEW v_object_activity_timeline AS
SELECT
  e.id AS event_id,
  e.object_id,
  n.object_type,
  n.external_id,
  e.event_type,
  e.event_category,
  e.payload,
  e.actor_type,
  e.actor_id,
  e.occurred_at,
  e.related_object_id,
  rn.object_type AS related_object_type,
  rn.external_id AS related_external_id
FROM object_events e
JOIN object_nodes n ON e.object_id = n.id
LEFT JOIN object_nodes rn ON e.related_object_id = rn.id
ORDER BY e.occurred_at DESC;

-- Object with state view
CREATE OR REPLACE VIEW v_object_with_state AS
SELECT
  n.*,
  COALESCE(s.state, '{}'::jsonb) AS current_state,
  s.state_version,
  s.updated_at AS state_updated_at
FROM object_nodes n
LEFT JOIN object_states s ON n.id = s.object_id
WHERE n.is_active = true;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to merge object data (deep merge)
CREATE OR REPLACE FUNCTION merge_object_data(
  existing_data JSONB,
  new_data JSONB
) RETURNS JSONB AS $$
BEGIN
  RETURN existing_data || new_data;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to append message to thread
CREATE OR REPLACE FUNCTION append_thread_message(
  p_thread_id UUID,
  p_message JSONB
) RETURNS object_threads AS $$
DECLARE
  v_thread object_threads;
BEGIN
  UPDATE object_threads
  SET
    messages = messages || p_message,
    message_count = message_count + 1,
    last_message_at = NOW()
  WHERE id = p_thread_id
  RETURNING * INTO v_thread;

  RETURN v_thread;
END;
$$ LANGUAGE plpgsql;

-- Function to get object neighbors (graph traversal)
CREATE OR REPLACE FUNCTION get_object_neighbors(
  p_object_id UUID,
  p_edge_types VARCHAR[] DEFAULT NULL,
  p_direction VARCHAR DEFAULT 'both',  -- 'outgoing', 'incoming', 'both'
  p_max_depth INTEGER DEFAULT 1
) RETURNS TABLE (
  object_id UUID,
  object_type VARCHAR,
  external_id VARCHAR,
  data JSONB,
  edge_type VARCHAR,
  edge_weight NUMERIC,
  direction VARCHAR,
  depth INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE neighbors AS (
    -- Base case: direct neighbors
    SELECT
      CASE WHEN e.from_object_id = p_object_id THEN e.to_object_id ELSE e.from_object_id END AS neighbor_id,
      e.edge_type,
      e.weight AS edge_weight,
      CASE WHEN e.from_object_id = p_object_id THEN 'outgoing'::VARCHAR ELSE 'incoming'::VARCHAR END AS dir,
      1 AS depth
    FROM object_edges e
    WHERE (e.from_object_id = p_object_id OR e.to_object_id = p_object_id)
      AND (p_edge_types IS NULL OR e.edge_type = ANY(p_edge_types))
      AND (
        p_direction = 'both'
        OR (p_direction = 'outgoing' AND e.from_object_id = p_object_id)
        OR (p_direction = 'incoming' AND e.to_object_id = p_object_id)
      )

    UNION

    -- Recursive case (if depth > 1)
    SELECT
      CASE WHEN e.from_object_id = nb.neighbor_id THEN e.to_object_id ELSE e.from_object_id END,
      e.edge_type,
      e.weight,
      CASE WHEN e.from_object_id = nb.neighbor_id THEN 'outgoing' ELSE 'incoming' END,
      nb.depth + 1
    FROM object_edges e
    JOIN neighbors nb ON (e.from_object_id = nb.neighbor_id OR e.to_object_id = nb.neighbor_id)
    WHERE nb.depth < p_max_depth
      AND (p_edge_types IS NULL OR e.edge_type = ANY(p_edge_types))
      AND CASE WHEN e.from_object_id = nb.neighbor_id THEN e.to_object_id ELSE e.from_object_id END != p_object_id
  )
  SELECT DISTINCT ON (n.id)
    n.id AS object_id,
    n.object_type,
    n.external_id,
    n.data,
    nb.edge_type,
    nb.edge_weight,
    nb.dir AS direction,
    nb.depth
  FROM neighbors nb
  JOIN object_nodes n ON nb.neighbor_id = n.id
  WHERE n.is_active = true
  ORDER BY n.id, nb.depth;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA: Standard Object Actions
-- ============================================================================

INSERT INTO object_actions (action_slug, action_name, description, object_types, action_type, config, icon, display_order, is_system) VALUES
-- Company actions
('enrich_company', 'Enrich Company', 'Fetch latest firmographic data from providers', ARRAY['company'], 'api_call', '{"endpoint": "/api/os/enrich", "method": "POST"}', 'refresh', 10, true),
('score_company', 'Calculate Scores', 'Calculate Q/T/L/E scores for company', ARRAY['company'], 'api_call', '{"endpoint": "/api/os/score", "method": "POST"}', 'chart', 20, true),
('start_journey', 'Start Journey', 'Initiate a journey for this entity', ARRAY['company', 'contact'], 'journey_trigger', '{"selectTemplate": true}', 'play', 30, true),
('view_contacts', 'View Contacts', 'Show all contacts at this company', ARRAY['company'], 'state_change', '{"action": "navigate", "target": "contacts"}', 'users', 40, true),

-- Contact actions
('enrich_contact', 'Enrich Contact', 'Fetch latest professional data', ARRAY['contact'], 'api_call', '{"endpoint": "/api/os/enrich", "method": "POST"}', 'refresh', 10, true),
('verify_email', 'Verify Email', 'Verify email deliverability', ARRAY['contact'], 'api_call', '{"endpoint": "/api/os/verify-email", "method": "POST"}', 'check', 20, true),
('send_outreach', 'Send Outreach', 'Generate and send personalized outreach', ARRAY['contact'], 'journey_trigger', '{"templateType": "outreach"}', 'mail', 30, true),

-- Universal actions
('add_note', 'Add Note', 'Add a note to this entity', ARRAY['company', 'contact', 'deal', 'signal'], 'state_change', '{"action": "openThread", "threadType": "notes"}', 'edit', 100, true),
('view_timeline', 'View Timeline', 'Show activity timeline', ARRAY['company', 'contact', 'deal', 'signal'], 'state_change', '{"action": "navigate", "target": "timeline"}', 'clock', 110, true),
('export', 'Export', 'Export entity data', ARRAY['company', 'contact', 'deal'], 'api_call', '{"endpoint": "/api/os/export", "method": "POST"}', 'download', 120, true)

ON CONFLICT (action_slug) DO UPDATE SET
  action_name = EXCLUDED.action_name,
  description = EXCLUDED.description,
  object_types = EXCLUDED.object_types,
  action_type = EXCLUDED.action_type,
  config = EXCLUDED.config,
  icon = EXCLUDED.icon,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE object_nodes IS 'Central registry for all business objects (Company, Contact, Deal, Signal)';
COMMENT ON TABLE object_edges IS 'Relationships between objects forming a graph structure';
COMMENT ON TABLE object_threads IS 'Threaded conversations and notes attached to objects';
COMMENT ON TABLE object_events IS 'Event log / activity timeline for objects';
COMMENT ON TABLE object_states IS 'Current computed state for each object';
COMMENT ON TABLE object_actions IS 'Available actions for objects based on type and context';

COMMENT ON VIEW v_object_graph IS 'Objects with their edge counts and types';
COMMENT ON VIEW v_object_activity_timeline IS 'Flattened activity timeline across all objects';
COMMENT ON VIEW v_object_with_state IS 'Objects joined with their current state';

COMMENT ON FUNCTION merge_object_data IS 'Deep merge two JSONB objects for object data updates';
COMMENT ON FUNCTION append_thread_message IS 'Append a message to a thread and update counts';
COMMENT ON FUNCTION get_object_neighbors IS 'Graph traversal to find neighboring objects';
