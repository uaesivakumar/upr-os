**UPR Agentic Core -- Phase 7 : Quantitative Intelligence Layer**

**Owner:** Sivakumar (SIVA-Agentic-Core)  **Version:** 1.0  **Date:**
2025-11-06\
**Purpose:** Transform human intuition (\"this feels like an 85\") into
a deterministic, mathematically explainable Q-Score framework with
confidence and decision logic.

**1 Q-Score Formula Overview**

**Master Equation**

Q = base_quality × signal_strength × reachability × edge_case_multiplier

-   **base_quality** → static company quality (0-100)

-   **signal_strength** → dynamic activity multiplier (0.5 -- 2.0)

-   **reachability** → contact confidence (0.0 -- 1.0)

-   **edge_case_multiplier** → context exceptions (0.05 -- 1.4)

**2 Base Quality (0-100)**

  **Component**   **Weight**   **Logic**
  --------------- ------------ ------------------------------------------
  UAE Presence    30           .ae + address + local operations
  Company Size    30           50-500 employees = sweet spot
  Industry        25           FinTech \> Tech \> Healthcare \> Retail
  Salary Level    15           Higher avg salary → richer banking needs

**Max:** 100 points

Functions → calculateUaePresenceScore(), calculateCompanySizeScore(),
calculateIndustryScore(), calculateSalaryScore().

**3 Signal Strength (0.5 × -- 2.0 ×)**

**Multipliers**

  **Dimension**     **Range**    **Driver**
  ----------------- ------------ -------------------------------
  Hiring Velocity   0.8 -- 1.5   jobs/month
  Timing            0.3 -- 1.5   season + signal recency
  News              0.9 -- 1.3   funding / expansion / layoffs

Total signal_strength = hiring × timing × news (capped 2.0).

**4 Reachability (0.0 -- 1.0)**

  **Factor**             **Scale**   **Meaning**
  ---------------------- ----------- ------------------------
  Contact Availability   0 -- 1      title + LinkedIn match
  Email Quality          0 -- 1      verification result
  Timing Freshness       0.5 -- 1    recency of contact

reachability = availability × email × freshness

**5 Edge Case Rules (Post-Processing)**

  **Rule**            **Condition**                                  **Multiplier**
  ------------------- ---------------------------------------------- ----------------
  Enterprise Brand    Etihad / Emirates / ADNOC / Emaar / DP World   0.1 ×
  Government Entity   "Municipality", entity_type = gov              0.05 ×
  Free Zone Boost     DMCC / DIFC / ADGM etc.                        1.3 ×
  Startup Velocity    \< 2 yrs + \< 50 staff + hires ≥ 5             1.4 ×

Negative rules applied first → positive stack after.

**6 Confidence (0.0 -- 1.0)**

confidence = data_completeness × data_freshness × signal_clarity ×
edge_case_penalty

  **Component**    **Scale**                       **Description**
  ---------------- ------------------------------- ------------------------
  Completeness     0.5--1.0                        presence of key fields
  Freshness        0.5--1.0                        days since update
  Signal Clarity   0.6--1.0                        \# of strong signals
  Penalty          -10 % if edge cases triggered   

Confidence \< 0.6 → requires human review.

**7 Decision Thresholds**

  **Q-Score**   **Decision**    **Action**
  ------------- --------------- --------------------
  85-100        High Priority   Immediate Outreach
  70-84         Good Fit        Proceed
  50-69         Marginal        Human Review
  30-49         Low             Skip / Revisit
  0-29          Reject          Ignore

**Confidence Gates**

-   ≥ 0.8 → Auto-approve

-   0.6-0.79 → Review

-   \< 0.6 → Always review

**8 Segmentation Logic**

  **Scenario**                          **Primary Target**       **Fallback**     **Reason**
  ------------------------------------- ------------------------ ---------------- ----------------------
  Start-up (\< 50 staff, score \> 85)   Founder / CEO            Ops Head         Decision access
  Mid-size (50-500)                     HR Director / HR Mgr     People Ops Mgr   Authority center
  Large (500 +)                         Payroll / Benefits Mgr   HR BP            Specialist interface

Urgency via determineOutreachUrgency() → SLA 24 h / 72 h / 168 h.

**9 Example Calculations**

**Amazon UAE** → Score 100 (High quality + 2 × signals + perfect reach)\
**Etihad Airways** → Score 10 (after 0.1 × enterprise rule)\
**TechStart DMCC** → Score 82 (+ 1.3 × free-zone boost)\
**Dubai Municipality IT Dept** → Score 5 (gov rule 0.05 ×)\
**Small startup (10 staff, 5 hires/mo)** → Score 76 (+ 1.4 × velocity
boost)

**10 Calibration Process**

1.  Build golden dataset (100 companies = 50 proceed / 50 skip).

2.  Compute formula vs human decision.

3.  Measure TP/TN accuracy ( \> 90 % goal ).

4.  Adjust multipliers until alignment achieved.

5.  Validate on new sample (20 companies).

Quarterly re-tune based on conversion data.

**11 Testing Strategy**

-   Unit tests for each function (component score, multiplier).

-   Integration tests for calculateQScore().

-   Regression tests against golden dataset.

-   Performance check (100 companies \< 200 ms).

**12 Maintenance & Evolution**

  **Trigger**          **Action**
  -------------------- ---------------------------
  Quarterly Review     Recalibrate weights
  New industry trend   Add new rule
  Data drift \> 10 %   Re-train thresholds
  Major market event   Adjust timing multipliers

All changes logged → quantitative_layer.vX.Y.json (semantic versioning).

**✅ Phase 7 Deliverables Recap**

1.  Deterministic Q-Score engine (v1.0)

2.  Confidence and decision gates

3.  Edge-case governance rules

4.  Golden dataset calibration framework

5.  Explainable breakdown UI spec
