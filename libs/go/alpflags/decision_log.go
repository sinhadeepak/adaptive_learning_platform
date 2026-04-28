package alpflags

import "log/slog"

// SlogDecisionHook returns an OnDecision callback that emits one slog INFO
// event per evaluation, with the same field names used by the Python sibling
// (libs/python/alp_flags/decision_log.py) so logs across the platform have
// a single shape:
//
//	{
//	  "level": "INFO",
//	  "msg":   "flag.decision",
//	  "service":         "<service-name>",
//	  "flag_name":       "<flag>",
//	  "tenant_id":       "<tenant or empty>",
//	  "value":           true,
//	  "source":          "cache" | "institution" | "fallback",
//	  "fallback_reason": "" | "institution_error:..."
//	}
//
// Pass nil logger to use slog.Default(). Service name is required so cross-
// service queries can filter by it.
func SlogDecisionHook(serviceName string, logger *slog.Logger) func(Decision) {
	if logger == nil {
		logger = slog.Default()
	}
	return func(d Decision) {
		logger.Info("flag.decision",
			"service", serviceName,
			"flag_name", d.FlagName,
			"tenant_id", d.TenantID,
			"value", d.Value,
			"source", d.Source,
			"fallback_reason", d.FallbackReason,
		)
	}
}
