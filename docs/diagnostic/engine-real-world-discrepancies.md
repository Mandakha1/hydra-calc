# Engine vs real-world fixtures — discrepancies

> Per the Phase 1B plan: when the production solver disagrees with a
> documented real-world value by more than 15%, do **not** silently adjust
> the test — write the discrepancy here, propose a hypothesis, and discuss
> before changing solver or fixture.

---

## DISCREPANCY-001 — GK-23/02 UDDT8→UHT1 velocity

**Test**: `apps/backend/src/__tests__/real_project_GK_23_02.test.ts`
**Section**: `UDDT8_to_UHT1` (DN65, ID 60 mm, length 194 m)

| Quantity | Fixture says | Solver computes | Δ |
|----------|--------------|-----------------|----|
| `theoretical_mass_flow_t_h` | 2.46 | 2.46 (verified) | 0% |
| `theoretical_velocity_m_s` | **0.365** | **0.249** | **−32%** |
| `expected_program_velocity_m_s` | **0.365** | **0.249** | **−32%** |
| Document velocity | 0.49 | n/a (different G) | — |

### Why the test fails

The test runs the canonical physics identity `v = G / (ρ · A)`:
- G = 2.46 t/h = 0.683 kg/s  (the fixture's *theoretical* mass flow)
- ρ = 970.6 kg/m³  (the fixture's water density at 82.5 °C)
- A = π · (0.060)² / 4 = 0.002827 m²  (ID 60 mm → outer 65 mm, wall 2.5 mm)
- v = 0.683 / (970.6 × 0.002827) = **0.249 m/s**

This is the velocity that any correct hydraulic solver MUST output when
asked to push 2.46 t/h through a 60-mm-ID pipe. There is no other answer
consistent with conservation of mass.

### Hypothesis (fixture internal inconsistency)

The fixture also reports, inside its `key_pipe_sections[0].physics_check`
block, a separate field:

```json
"expected_velocity_at_doc_flow_m_s": 0.365
```

This is the velocity at the **document** mass flow (G = 3.59 t/h, which
includes design reserve and the HW peak coefficient), **not** at the
theoretical flow:
- G_doc = 3.59 t/h = 0.997 kg/s
- v_doc = 0.997 / (970.6 × 0.002827) = **0.365 m/s** ✓

So `0.365` is physically meaningful — it is just attached to the **wrong
flow** when copied into `expected_results.pipe_sections_to_validate[0]`.
The fixture has an internal copy-paste error: it labels 0.365 as the
"theoretical" velocity, but 0.365 is the document-flow velocity.

### What this proves about the solver

The solver is **correct**. The discrepancy is in the fixture's expected
value, not in the engine output. Specifically:

- ✓ Solver applies `v = G / (ρ · A)` faithfully
- ✓ Solver uses the same ρ(82.5 °C) = 970.6 the fixture documents
- ✓ Solver agrees with the fixture's `physics_check` block when the
  matching G is used
- ✗ Fixture's `expected_results.pipe_sections_to_validate[0]` has a
  copy-paste error: `0.365` is paired with `theoretical_mass_flow_t_h:
  2.46`, but `0.365` belongs with `3.59`.

### Resolution proposed (do NOT apply unilaterally)

Three options, in order of preference:

1. **Fix the fixture** — change
   `expected_program_velocity_m_s: 0.365` to `0.249` in section
   `UDDT8_to_UHT1` (and similarly for any other section we discover
   with the same pattern). Re-run the test; expect green.

2. **Add a passing assertion at G_doc** — keep the failing assertion at
   theoretical flow (as a known-fail), and add a parallel assertion that
   v = 0.365 holds when G = 3.59 t/h. The latter passes immediately and
   guards the document-flow path.

3. **Skip the velocity comparison for this section** — mark it `.skip`
   with a TODO referencing this doc. Acceptable only if neither the
   fixture author nor the solver can be touched in time for Phase 1B
   acceptance.

User to choose. Until resolved, **Phase 1B CI will be red** on this one
case, with the other 9 cases green.

### Other findings (no discrepancy, just data)

- All 5 per-consumer mass flows: ±1% of fixture expectation ✓
- System total mass flow: 0.7579 kg/s ✓ (matches fixture exactly)
- Document G (3.59 t/h) vs theoretical G (2.46 t/h): 46% design reserve.
  Confirmed in test "Document vs theoretical — engineering-reserve check"
  which now serves as a regression guard against the solver accidentally
  rolling reserve factors into its output.

---

*Filed 2026-05-12 from `pnpm --filter backend test`. Phase 1B blocked on
fixture decision. No solver change recommended at this time.*
