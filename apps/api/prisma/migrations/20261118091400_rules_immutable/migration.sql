-- Rule sets are immutable and versioned (D5); rule violations are evidence. Block UPDATE/DELETE.
CREATE TRIGGER rule_set_no_update BEFORE UPDATE OR DELETE ON "RuleSet"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER rule_violation_no_update BEFORE UPDATE OR DELETE ON "RuleViolation"
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
