# WhatsApp Channel - OUT OF SCOPE for PRD v1.2

**Decision Date**: December 17, 2025
**Decision Authority**: Founder (S.K.C.)
**Status**: FINAL

## Summary

WhatsApp channel support is **explicitly OUT OF SCOPE** for PRD v1.2 FINAL.

## Rationale

1. **Compliance Complexity**: WhatsApp Business API has strict compliance requirements
2. **Regulatory Risk**: Banking communications via WhatsApp require additional safeguards
3. **Infrastructure Cost**: WhatsApp integration requires BSP partnership and costs
4. **MVP Focus**: v1.2 focuses on core intelligence (SIVA) - channels are v2.0+

## What This Means

### NOT Implementing in v1.2:
- ❌ WhatsApp message sending
- ❌ WhatsApp message receiving
- ❌ WhatsApp template management
- ❌ WhatsApp Business API integration
- ❌ WhatsApp-specific persona restrictions
- ❌ WhatsApp compliance rules

### IS Implemented in v1.2:
- ✅ Persona-based channel restrictions (framework ready)
- ✅ Outreach channel abstraction (supports future WhatsApp)
- ✅ Escalation contract (applies to all channels)
- ✅ Audit logging (supports future WhatsApp audit)

## PRD §4 Compliance Note

PRD §4 (WhatsApp Safety) requirements are **deferred to v2.0**:
- Customer-facing persona restrictions will apply when WhatsApp is added
- Escalation thresholds will apply when WhatsApp is added
- Real-time supervision requirements will be implemented in v2.0

## Code References

The persona system is ready for WhatsApp when added:

```javascript
// os/envelope/types.js
export const CANONICAL_PERSONAS = {
  CUSTOMER_FACING: '1',  // Most restricted - will apply to WhatsApp
  SALES_REP: '2',        // Standard intelligence
  SUPERVISOR: '3',       // Can approve escalations
  // ...
};
```

## Future Implementation (v2.0)

When WhatsApp is implemented in v2.0:
1. Add WhatsApp to `allowed_channels` in persona capabilities
2. Implement WhatsApp-specific message templates
3. Add real-time supervision for customer-facing persona
4. Integrate with WhatsApp Business API via BSP

## Version History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2025-12-17 | Initial OUT OF SCOPE declaration |

---

*This document is part of PRD v1.2 compliance documentation.*
