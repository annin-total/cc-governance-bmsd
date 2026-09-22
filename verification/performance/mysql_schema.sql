-- サーバのテーブル定義（MySQL 版）を実際に流して型・制約が通るかを確かめるためのスキーマ。
-- indexes.sql と合わせて使う。sqlite_bench.py の DDL の MySQL 移植版。
CREATE TABLE IF NOT EXISTS events (
  event_id VARCHAR(36), ts INTEGER, day INTEGER,
  user_email VARCHAR(255), host VARCHAR(255), hook_event VARCHAR(64),
  session_id VARCHAR(255), prompt_id VARCHAR(255), tool_name VARCHAR(255),
  source VARCHAR(255), compact_trigger VARCHAR(255), command_name VARCHAR(255),
  command_source VARCHAR(255), skill_name VARCHAR(255), effort_level VARCHAR(255),
  permission_mode VARCHAR(255), agent_id VARCHAR(255),
  is_interrupt INTEGER, context_tokens INTEGER
);
CREATE TABLE IF NOT EXISTS policy_state (
  event_id VARCHAR(36), ts INTEGER, day INTEGER,
  user_email VARCHAR(255), host VARCHAR(255),
  key_name VARCHAR(128), value VARCHAR(255), prev_value VARCHAR(255),
  apply_result VARCHAR(32), plugin_version VARCHAR(32)
);
CREATE TABLE IF NOT EXISTS cost_daily (
  day INTEGER, user_email VARCHAR(255),
  provider VARCHAR(255), model VARCHAR(255), currency VARCHAR(255),
  cost DOUBLE,
  input_tokens BIGINT, output_tokens BIGINT, cache_read_tokens BIGINT,
  cache_write_tokens BIGINT, cached_input_tokens BIGINT, uncached_input_tokens BIGINT,
  source_file VARCHAR(255)
);
