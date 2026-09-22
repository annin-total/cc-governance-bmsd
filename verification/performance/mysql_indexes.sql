-- schema.sql のテーブルに対する被覆インデックス定義。ANALYZE 未実行だと
-- インデックスなしより遅くなることがあるので、投入後は ANALYZE TABLE を忘れず走らせる。
CREATE INDEX ix_events_day ON events(day, user_email, event_id);
CREATE INDEX ix_events_skill ON events(skill_name, day, user_email, event_id);
CREATE INDEX ix_events_tool ON events(tool_name, day, user_email, event_id);
CREATE INDEX ix_events_ctx ON events(day, hook_event, context_tokens);
CREATE INDEX ix_policy_key ON policy_state(key_name, prev_value, user_email);
CREATE INDEX ix_policy_user ON policy_state(user_email, ts);
CREATE INDEX ix_cost_day ON cost_daily(day, user_email);
